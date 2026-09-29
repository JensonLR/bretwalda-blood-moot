#!/usr/bin/env node
// ============================================================
// LATTICE — is there a repeated pattern printed on the skin?
//
//   node tools/lattice.mjs <face card PNG | directory of them>...
//   node tools/lattice.mjs --lever <PNG>       R1: paint a lattice on the card and require the reading to move
//   node tools/lattice.mjs --peak 0.15 ...     move the bar
//
// THE OWNER'S WORDS (CHAR-PLAN CH-02; three sessions of "reads as a crude pale
// mask", and the head's own comment calls it "a regular rectilinear grid of dark
// dashes ruled over the forehead, the cheek and the neck"):
//
//   the face is a grid of red dashes.
//
// Nothing in the repository could see that. `headmeasure` reads the SHAPE of the
// head, `eyeclip` the lids, `faceseam` the join between helm and skin, and the one
// place a texture is discussed is a long comment in `buildCharacter` arguing that
// a 2.2 mm tile takes the pattern under a pixel. On the authored man the comment is
// untrue in a way it cannot have known: the GLB's skin is a 35 mm CUBE PROJECTION
// baked by Blender (the export throws the head's own UVs away), and the shader-side
// `tile` the comment relies on does not survive `forSkinnedMesh`'s `clone()`, so the
// recipe prints at 35 mm and the frame shows 17-19 mm rows of dashes (about 21 px at
// the portrait lens).
//
// WHAT IT MEASURES. The 2-D autocorrelation of the skin's luminance, high-passed so
// the shading of the face itself (a cheek, a jaw) is not in it. A REPEATING pattern
// correlates with itself at its own pitch, whatever its colour or where it sits, so
// the largest value away from the origin is the lattice's strength: 1.0 is a perfect
// tile, 0 is noise. Pairs are counted only where BOTH pixels are bare skin, so the
// eyes, brows, mouth and hairline cannot correlate with each other by symmetry (two
// eyes 60 px apart would be a peak at 60 px, and they are not skin).
//
// WHICH PIXELS. The skin blob that contains the head, found by colour, opened to cut
// the fence posts and the ear-side thatch that touch it, eroded from its own edge,
// and reduced to the pixels within 18 L* of the blob's median so a feature or a
// shadow does not stand in for texture. It needs no landmark and no registration:
// the ruler that measures "is there a lattice" must not depend on knowing where the
// eyes are (`facecontrast` does; this must not).
//
// THE BAR is 0.15, from the plan, and it was checked on both sides: the baseline
// cards read far above it and a card with the pattern removed reads far below (see
// `--lever`, which paints one on).
// ============================================================
import { readdirSync, statSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { readPng, labPlanes } from "./lib/pngread.mjs";

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PEAK_BAR = Number(flag("peak", "0.15"));
const LEVER = argv.includes("--lever");
const JSON_OUT = argv.includes("--json");
const targets = argv.filter((a, i) => !a.startsWith("--") && !(argv[i - 1] ?? "").startsWith("--peak"));

const MAX_LAG = 40;      // px: a pitch of 21 px repeats at 42, so 40 sees two periods' worth of it
const MIN_LAG = 12;      // px: inside this the high-pass's own blur correlates a smooth field with itself, and a smooth field is not a pattern
const RMS_FLOOR = 0.6;   // L*: below this the skin is smooth to the eye (a JND is about 1 L*) and there is no pattern to read
const MIN_PAIRS = 1500;  // pairs a lag needs before its value is believed

/** Every PNG under a path, sorted. */
function pngsUnder(p) {
  if (!existsSync(p)) throw new Error(`no such path: ${p}`);
  if (statSync(p).isFile()) return [p];
  const out = [];
  for (const e of readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const f = resolve(p, e.name);
    if (e.isDirectory()) out.push(...pngsUnder(f));
    else if (/facecard.*\.png$/i.test(e.name)) out.push(f);
  }
  return out;
}

const hueDeg = (a, b) => (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;

/** Bare-skin mask: the skin-coloured blob nearest the head, opened, eroded, and cut to the pixels that are skin and not a feature. */
function skinMask(lab) {
  const { w, h, L, A, B } = lab;
  const n = w * h;
  const skin = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const c = Math.hypot(A[i], B[i]);
    const hu = hueDeg(A[i], B[i]);
    if (c >= 12 && hu >= 15 && hu <= 80 && L[i] >= 25 && L[i] <= 90) skin[i] = 1;
  }
  const open = erode(dilate(erode(skin, w, h, 4), w, h, 4), w, h, 0);
  // connected components; keep the one holding the most pixels within the middle band of the card
  const lbl = new Int32Array(n).fill(-1);
  const sizes = [];
  const stack = [];
  for (let s = 0; s < n; s++) {
    if (!open[s] || lbl[s] >= 0) continue;
    const id = sizes.length; let cnt = 0;
    stack.push(s); lbl[s] = id;
    while (stack.length) {
      const p = stack.pop(); cnt++;
      const x = p % w, y = (p / w) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && open[q] && lbl[q] < 0) { lbl[q] = id; stack.push(q); }
      }
    }
    sizes.push(cnt);
  }
  if (!sizes.length) return { mask: new Uint8Array(n), area: 0 };
  // the head is the biggest blob that is not the whole background
  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
  const blob = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (lbl[i] === best) blob[i] = 1;
  const inner = erode(blob, w, h, 9);
  // median L* of the interior
  const vals = [];
  for (let i = 0; i < n; i += 3) if (inner[i]) vals.push(L[i]);
  vals.sort((a, b) => a - b);
  const med = vals.length ? vals[vals.length >> 1] : 50;
  const mask = new Uint8Array(n);
  let area = 0;
  for (let i = 0; i < n; i++) if (inner[i] && Math.abs(L[i] - med) < 18) { mask[i] = 1; area++; }
  return { mask, area, median: med };
}

function dilate(m, w, h, r) {
  const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { let run = 0; for (let x = 0; x < w; x++) { if (m[y * w + x]) run = r + 1; t[y * w + x] = run > 0 ? 1 : 0; if (run > 0) run--; }
    run = 0; for (let x = w - 1; x >= 0; x--) { if (m[y * w + x]) run = r + 1; if (run > 0) { t[y * w + x] = 1; run--; } } }
  for (let x = 0; x < w; x++) { let run = 0; for (let y = 0; y < h; y++) { if (t[y * w + x]) run = r + 1; o[y * w + x] = run > 0 ? 1 : 0; if (run > 0) run--; }
    run = 0; for (let y = h - 1; y >= 0; y--) { if (t[y * w + x]) run = r + 1; if (run > 0) { o[y * w + x] = 1; run--; } } }
  return o;
}
function erode(m, w, h, r) {
  if (r <= 0) return m;
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = m[i] ? 0 : 1;
  const d = dilate(inv, w, h, r);
  const o = new Uint8Array(w * h);
  for (let i = 0; i < o.length; i++) o[i] = m[i] && !d[i] ? 1 : 0;
  return o;
}

/** L* minus its local mean over the mask (a box of radius `r`, mask-aware): the shading is out, the texture is in. */
function highPass(lab, mask, r) {
  const { w, h, L } = lab;
  const sum = new Float64Array((w + 1) * (h + 1)), cnt = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0, rc = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i]) { rs += L[i]; rc++; }
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + rs;
      cnt[(y + 1) * (w + 1) + x + 1] = cnt[y * (w + 1) + x + 1] + rc;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!mask[i]) continue;
    const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    const s = sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0];
    const c = cnt[y1 * (w + 1) + x1] - cnt[y0 * (w + 1) + x1] - cnt[y1 * (w + 1) + x0] + cnt[y0 * (w + 1) + x0];
    out[i] = c > 8 ? L[i] - s / c : 0;
  }
  return out;
}

/**
 * Masked, normalised autocorrelation over lags in the half plane. Returns the highest value away
 * from the origin that is a PEAK: greater than the lags 3 px either side of it in both axes. A
 * smooth field correlates with itself at every short lag and the value only falls away from the
 * origin, so the highest value in the window is the nearest one; a pattern is a bump in the fall.
 */
function autocorr(res, mask, w, h) {
  const idx = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) idx.push(i);
  const R = new Map();
  const at = (dx, dy) => {
    const key = dx + "," + dy;
    if (R.has(key)) return R.get(key);
    let sab = 0, saa = 0, sbb = 0, n = 0;
    const off = dy * w + dx;
    for (let k = 0; k < idx.length; k += 2) {
      const i = idx[k], j = i + off;
      if (j < 0 || j >= mask.length || !mask[j]) continue;
      const x = i % w + dx;
      if (x < 0 || x >= w) continue;
      const a = res[i], b = res[j];
      sab += a * b; saa += a * a; sbb += b * b; n++;
    }
    const v = n < MIN_PAIRS ? null : { v: sab / Math.sqrt(saa * sbb + 1e-9), n };
    R.set(key, v);
    return v;
  };
  let best = { v: -1, dx: 0, dy: 0, pairs: 0 };
  for (let dy = 0; dy <= MAX_LAG; dy++) {
    for (let dx = -MAX_LAG; dx <= MAX_LAG; dx++) {
      if (dy === 0 && dx <= 0) continue;
      const d = Math.hypot(dx, dy);
      if (d < MIN_LAG || d > MAX_LAG) continue;
      const c = at(dx, dy);
      if (!c || c.v <= best.v) continue;
      const nb = [at(dx - 3, dy), at(dx + 3, dy), at(dx, dy - 3), at(dx, dy + 3)];
      // a lattice is a bump: it beats the neighbours it can see
      if (nb.some((q) => q && q.v >= c.v)) continue;
      best = { v: c.v, dx, dy, pairs: c.n };
    }
  }
  return best;
}

function measure(img) {
  const lab = labPlanes(img);
  const { mask, area, median } = skinMask(lab);
  if (area < 4 * MIN_PAIRS) return { ok: false, why: `only ${area} bare-skin pixels found` };
  const res = highPass(lab, mask, 6);
  let e = 0, n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { e += res[i] * res[i]; n++; }
  const rms = Math.sqrt(e / Math.max(1, n));
  // Smooth skin has no pattern to be strong. It is reported as such, with the amplitude, and not
  // as a 0 that looks like a measurement.
  if (rms < RMS_FLOOR) return { ok: true, peak: 0, lag: [0, 0], pitch: 0, pairs: 0, area, median, rms, smooth: true };
  const pk = autocorr(res, mask, lab.w, lab.h);
  return { ok: true, peak: Math.max(0, pk.v), lag: [pk.dx, pk.dy], pitch: Math.hypot(pk.dx, pk.dy), pairs: pk.pairs, area, median, rms };
}

/**
 * R1: the lever, in both directions, on ONE picture. The card's own skin is blurred (box,
 * radius 10, a 21 px window: a box nulls the period it is as wide as, and a 21 px lattice survives a narrower one at 60%) and the
 * reading has to FALL; a lattice of 21 px dashes is then painted on the blurred skin and the
 * reading has to RISE. A ruler that answers the same to a picture with a lattice and to the
 * same picture without one is measuring something else (PROCESS R1).
 */
function blurredSkin(img) {
  const out = { ...img, data: new Uint8Array(img.data) };
  const { mask } = skinMask(labPlanes(img));
  const R = 10;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!mask[y * img.w + x]) continue;
    const acc = [0, 0, 0]; let n = 0;
    for (let j = Math.max(0, y - R); j <= Math.min(img.h - 1, y + R); j++) for (let i = Math.max(0, x - R); i <= Math.min(img.w - 1, x + R); i++) {
      if (!mask[j * img.w + i]) continue;
      for (let c = 0; c < 3; c++) acc[c] += img.data[(j * img.w + i) * img.ch + c];
      n++;
    }
    for (let c = 0; c < 3; c++) out.data[(y * img.w + x) * img.ch + c] = Math.round(acc[c] / n);
  }
  return out;
}

function withLattice(img, mask, pitch, depth) {
  const out = { ...img, data: new Uint8Array(img.data) };
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!mask[y * img.w + x]) continue;
    if (!((x % pitch) < 7 && (y % pitch) < 2)) continue;
    for (let c = 0; c < 3; c++) out.data[(y * img.w + x) * img.ch + c] = Math.max(0, out.data[(y * img.w + x) * img.ch + c] - depth);
  }
  return out;
}

const files = targets.flatMap(pngsUnder);
if (!files.length) {
  console.error("usage: node tools/lattice.mjs [--peak 0.15] [--lever] <face card PNG | directory>...");
  process.exit(2);
}

let red = 0, blind = 0;
const rows = [];
for (const f of files) {
  let img = readPng(f);
  if (LEVER) {
    const asShot = measure(img);
    const blurred = blurredSkin(img);
    const flat = measure(blurred);
    const painted = measure(withLattice(blurred, skinMask(labPlanes(blurred)).mask, 21, 26));
    const fell = asShot.ok && flat.ok && flat.peak < asShot.peak - 0.05 && flat.peak < PEAK_BAR;
    const rose = flat.ok && painted.ok && painted.peak > PEAK_BAR + 0.10;
    console.log(`[lattice] LEVER ${basename(f)}: as shot ${asShot.ok ? asShot.peak.toFixed(3) : "n/a"} -> skin blurred ${flat.ok ? flat.peak.toFixed(3) : "n/a"} -> 21 px lattice painted back on ${painted.ok ? painted.peak.toFixed(3) : "n/a"}: ${fell && rose ? "MOVED both ways, so the ruler is reading the skin" : `DID NOT MOVE (fell ${fell}, rose ${rose}): the ruler is not measuring a lattice`}`);
    if (!(fell && rose)) red++;
    continue;
  }
  const m = measure(img);
  const label = basename(f).replace(/^facecard-helmhelm_none-hairhair_shaved-beardbeard_none-warPaintwp_none-/, "").replace(/\.png$/, "");
  if (!m.ok) { blind++; console.log(`[lattice] ${label.padEnd(24)} BLIND: ${m.why}`); rows.push({ file: f, ok: false, why: m.why }); continue; }
  const pass = m.peak <= PEAK_BAR;
  if (!pass) red++;
  rows.push({ file: f, ...m, pass });
  console.log(m.smooth
    ? `[lattice] ${label.padEnd(24)} skin is smooth (texture rms ${m.rms.toFixed(2)} L*, floor ${RMS_FLOOR}), ${m.area} skin px  ok`
    : `[lattice] ${label.padEnd(24)} peak ${m.peak.toFixed(3)} at lag (${m.lag[0]}, ${m.lag[1]}) px = pitch ${m.pitch.toFixed(1)} px, texture rms ${m.rms.toFixed(2)} L*, ${m.pairs} pairs, ${m.area} skin px  ${pass ? "ok" : `RED (bar ${PEAK_BAR})`}`);
}
if (JSON_OUT) console.log(JSON.stringify(rows));
if (LEVER) process.exit(red ? 1 : 0);
console.log(red || blind
  ? `[lattice] FAIL: ${red} of ${files.length} card(s) carry a repeated pattern above ${PEAK_BAR}${blind ? `, and ${blind} could not be read (a blind card is not a clean card)` : ""}`
  : `[lattice] PASS: ${files.length} card(s), none above ${PEAK_BAR}`);
process.exit(red || blind ? 1 : 0);
