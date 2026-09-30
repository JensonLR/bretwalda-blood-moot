// ============================================================
// latticelib — the lattice measurement, as functions. `tools/lattice.mjs` is the ruler that reports it and
// `tools/facecontrast.mjs` calls it as one of its checks; both read the same numbers because there is one copy.
// The argument for the method is at the top of `tools/lattice.mjs`.
// ============================================================
import { labPlanes } from "./pngread.mjs";

export const LATTICE = { MAX_LAG: 40, MIN_LAG: 12, RMS_FLOOR: 0.6, MIN_PAIRS: 1500 };
const MAX_LAG = 40;      // px: a pitch of 21 px repeats at 42, so 40 sees two periods' worth of it
const MIN_LAG = 12;      // px: inside this the high-pass's own blur correlates a smooth field with itself, and a smooth field is not a pattern
const RMS_FLOOR = 0.6;   // L*: below this the skin is smooth to the eye (a JND is about 1 L*) and there is no pattern to read
const MIN_PAIRS = 1500;  // pairs a lag needs before its value is believed

const hueDeg = (a, b) => (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;

/** Bare-skin mask: the skin-coloured blob nearest the head, opened, eroded, and cut to the pixels that are skin and not a feature. */
export function skinMask(lab) {
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

export function measureLattice(img) {
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
export function blurredSkin(img) {
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

export function withLattice(img, mask, pitch, depth) {
  const out = { ...img, data: new Uint8Array(img.data) };
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (!mask[y * img.w + x]) continue;
    if (!((x % pitch) < 7 && (y % pitch) < 2)) continue;
    for (let c = 0; c < 3; c++) out.data[(y * img.w + x) * img.ch + c] = Math.max(0, out.data[(y * img.w + x) * img.ch + c] - depth);
  }
  return out;
}

