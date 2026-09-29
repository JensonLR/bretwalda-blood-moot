#!/usr/bin/env node
// ============================================================
// FACECONTRAST — does the face on the frame have a face's tonal structure?
//
//   node tools/facecontrast.mjs <face card PNG | directory of them>...
//   node tools/facecontrast.mjs --debug art/fc <cards>       leave a picture of every window it read (PROCESS R5)
//   node tools/facecontrast.mjs --lever <cards>              R1: paint the feature on the picture and require the reading to follow
//   node tools/facecontrast.mjs --reg dx,dy,k <card>         override the registration (development)
//
// THE OWNER'S WORDS (CHAR-PLAN CH-02, CH-03; three reports across the character audit):
//
//   "the eyes are dead"   "the brows are ink"   "no nostrils or lips"   "a crude pale mask"   "a grid of dashes"
//
// and the plan's own measurement, from a 4x crop of the huscarl card: sclera L* 19-35 against skin L* 46-53 (a grey
// the eye reads as a corpse's), iris L* 5.8 with no catchlight, brow L* 3.0 (black, darker than the hair), nostril
// L* 6.4 (two detached dots), lips the colour of the cheek. Every ruler this repo owns measured the SHAPE of the head
// or where its edges meet a helm; none asked what a person asks of a face, which is about VALUE: where it is dark, where
// it is light, and whether the things that should be different from the skin round them are.
//
// WHAT IT ASKS, per card, in the owner's terms, each by reading the pixels at the place the build itself says the
// part is (`faceLandmarks`, off the functions the head is made from; `tools/lib/facecard.mjs` puts them on the card
// through the card's own lens, read out of the shot page as text, and REGISTERS them to the image):
//
//   socket      the eye socket is DARKER than the cheek beside it, by 8 L* or more (the orbit is shadow; a flat
//               face has none). The socket windows (under the brow, under the eye) against the cheek windows.
//   lip         the lips are a different COLOUR from the skin round them: dE*ab of 6 or more (CIE76).
//   sclera      the white of the eye is LIGHTER than the skin: between skin L* + 5 and + 25. Both sides of the iris are
//               read and the lighter one is the sclera (the other may sit in a lid's shade). A grey sclera fails low, a
//               lamp fails high.
//   iris        the iris is not a black bead: mean L* of 20 or more, and it carries a HIGHLIGHT (a pixel 20 L* above the
//               iris's own median): a catchlight is what makes an eye look wet and looked-at.
//   brow        the brow is dark against the forehead (by 12 L*, so it is there) and is NOT ink: between hair L* + 4 and
//               + 14. The hair reference is the frame's own hair when the card has any and otherwise `--hair-l`
//               (default 20, the plan's lit-hair band 18-30) and it is printed either way.
//   lattice     no repeated pattern in the skin: the autocorrelation peak of `tools/lattice.mjs`, 0.15 or under.
//   step        no luma STEP over 6 L* within 4 mm on a vertical scan down the cheek: the hard-edged chamfer the owner
//               reported three times ("a hard vertical chamfer from eye to jaw") is a step, and a smooth cheek is not.
//
// APPLICABILITY IS BY WHAT THE LENS CAN SEE. A window is read only where the surface faces the camera (0.35 or more):
// the far eye at three-quarter and the whole front of the face at profile are not read, and say so. A check that reads
// no window on any card is BLIND and FAILS: "nothing was measured" is not "nothing is wrong".
//
// THE FAILURE MODES THIS RULER IS BUILT AGAINST, in PROCESS's terms:
//   - It could measure the wrong pixels. So it leaves a picture (`--debug`) and PRINTS the registration it fitted, and
//     it fails safe: a window that lands on the skin beside the sclera reads the skin's L*, which fails BOTH bars of
//     the sclera check (it needs to be 5 above it), so a misregistered ruler is red and not green.
//   - It could be passed by editing the picture at the landmark. That is what an adversary does and it is what
//     `--lever` does on purpose: paint the sclera, and the sclera reading MUST rise; paint nothing, and nothing moves.
//     A ruler that answers to the pixels it names is a ruler that cannot be satisfied by anything but pixels.
// ============================================================
import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, basename, dirname } from "node:path";
import { readPng, labPlanes, deltaE, encodePng } from "./lib/pngread.mjs";
import { loadCharacters, cardLens, landmarksOnCard, parseCardName, register, discLab } from "./lib/facecard.mjs";
import { measureLattice } from "./lib/latticelib.mjs";

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DEBUG = flag("debug", null);
const HAIR_L = Number(flag("hair-l", "20"));
const REG = flag("reg", null);
const LEVER = argv.includes("--lever");
const VALUE_FLAGS = new Set(["debug", "hair-l", "reg"]);
const targets = argv.filter((a, i) => !a.startsWith("--") && !(argv[i - 1]?.startsWith("--") && VALUE_FLAGS.has(argv[i - 1].slice(2))));

// ---- the bars, from the plan (CHAR-PLAN U5 "New rulers") ----
const BARS = {
  socketDL: 8,          // cheek L* minus socket L*
  lipDE: 6,             // CIE76
  scleraLo: 5, scleraHi: 25,   // sclera L* minus skin L*
  irisL: 20, irisHighlight: 20,
  browContrast: 12, browLo: 4, browHi: 14,
  latticePeak: 0.15,
  stepL: 6, stepMm: 4,
};
const FACING = 0.35;      // a window is read only where the surface is at least this square to the lens
const EYE_FACING = 0.5;

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

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

/** Everything the checks need, read off one card. */
function readCard(img, lm, lab) {
  const mmPx = (mm) => mm / lm.mmPerPx;
  const win = (p, mm) => discLab(lab, p.x, p.y, Math.max(1.2, mmPx(mm)));
  const vis = (p, min = FACING) => p.facing >= min;
  const R = { windows: [], notes: [] };
  const mark = (kind, p, mm, extra = {}) => R.windows.push({ kind, x: p.x, y: p.y, r: Math.max(1.2, mmPx(mm)), ...extra });

  // ---- skin and cheek ----
  const cheeks = lm.skin.filter((s) => s.name === "cheek" && vis(s));
  const chin = lm.skin.filter((s) => s.name === "chin" && vis(s));
  const cheekLab = cheeks.map((s) => { mark("cheek", s, 4); return win(s, 4); }).filter(Boolean);
  const chinLab = chin.map((s) => { mark("chin", s, 4); return win(s, 4); }).filter(Boolean);
  const skinWins = [...cheekLab, ...chinLab];
  R.skinL = skinWins.length ? median(skinWins.map((c) => c[0])) : NaN;
  R.skinLab = skinWins.length ? [mean(skinWins.map((c) => c[0])), mean(skinWins.map((c) => c[1])), mean(skinWins.map((c) => c[2]))] : null;

  // ---- socket against cheek ----
  const socketBits = lm.skin.filter((s) => (s.name === "socket" || s.name === "underEye") && vis(s, 0.45));
  const socketL = socketBits.map((s) => { mark("socket", s, 3); return win(s, 3)?.[0]; }).filter((v) => v !== undefined);
  R.socketL = socketL.length ? mean(socketL) : NaN;
  R.cheekL = cheekLab.length ? mean(cheekLab.map((c) => c[0])) : NaN;
  R.socketDL = R.cheekL - R.socketL;

  // ---- lips against the skin beside them ----
  if (vis(lm.mouth.stomion, 0.5)) {
    mark("lip", lm.mouth.upper, 2.4); mark("lip", lm.mouth.lower, 2.4);
    const u = win(lm.mouth.upper, 2.4), l = win(lm.mouth.lower, 2.4);
    if (u && l && R.skinLab) {
      const lip = [(u[0] + l[0]) / 2, (u[1] + l[1]) / 2, (u[2] + l[2]) / 2];
      R.lipLab = lip; R.lipDE = deltaE(lip, R.skinLab);
    }
  }

  // ---- the eyes ----
  R.eyes = [];
  for (const e of lm.eyes) {
    if (!vis(e.iris, EYE_FACING)) { R.eyes.push({ side: e.side, hidden: true }); continue; }
    const rI = Math.max(2, e.irisR * 1000 / lm.mmPerPx);
    const sw = e.sclera.map((p) => { mark("sclera", p, 1.3, { side: e.side }); return win(p, 1.3); }).filter(Boolean);
    const scleraL = sw.length ? Math.max(...sw.map((c) => c[0])) : NaN;
    // the iris disc, and the highlight inside it
    const inner = [];
    for (let j = Math.floor(e.iris.y - rI); j <= Math.ceil(e.iris.y + rI); j++) for (let i = Math.floor(e.iris.x - rI); i <= Math.ceil(e.iris.x + rI); i++) {
      if (i < 0 || j < 0 || i >= lab.w || j >= lab.h) continue;
      if ((i - e.iris.x) ** 2 + (j - e.iris.y) ** 2 <= rI * rI) inner.push(lab.L[j * lab.w + i]);
    }
    mark("iris", e.iris, e.irisR * 1000, { side: e.side });
    const irisL = inner.length ? mean(inner) : NaN;
    const irisMed = inner.length ? median(inner) : NaN;
    const irisMax = inner.length ? Math.max(...inner) : NaN;
    R.eyes.push({ side: e.side, scleraL, irisL, highlight: irisMax - irisMed, irisMax });
  }

  // ---- the brow ----
  const brows = lm.brows.filter((b) => vis(b.points[4], FACING));
  const browL = [], foreL = [];
  for (const b of brows) {
    for (const i of [2, 3, 4, 5, 6]) {
      mark("brow", b.points[i], 1.6);
      const c = win(b.points[i], 1.6); if (c) browL.push(c[0]);
      // the forehead ring above it: 7 mm up the image from the brow line
      const up = { x: b.points[i].x, y: b.points[i].y - 7 / lm.mmPerPx };
      const f = win(up, 1.6); if (f) foreL.push(f[0]);
    }
  }
  if (browL.length) { R.browL = mean(browL); R.browContrast = mean(foreL) - R.browL; }

  // ---- a vertical scan down each visible cheek: the biggest step over 4 mm ----
  const stepPx = Math.max(2, Math.round(mmPx(BARS.stepMm)));
  const scans = [];
  for (const c of cheeks) {
    const ue = lm.skin.find((s) => s.name === "underEye" && s.side === c.side) ?? c;
    const y0 = Math.round(ue.y + mmPx(5)), y1 = Math.round(Math.min(lm.mouth.stomion.y, lm.mouth.corners[0].y) - mmPx(1));
    if (y1 - y0 < stepPx * 3) continue;
    const col = [];
    for (let y = y0; y <= y1; y++) { const t = discLab(lab, c.x, y, 1.5); col.push(t ? t[0] : NaN); }
    let worst = 0;
    for (let i = 0; i + stepPx < col.length; i++) if (Number.isFinite(col[i]) && Number.isFinite(col[i + stepPx])) worst = Math.max(worst, Math.abs(col[i + stepPx] - col[i]));
    scans.push(worst);
    R.windows.push({ kind: "scan", x: c.x, y: y0, y1, r: 0.5 });
  }
  if (scans.length) R.stepL = Math.max(...scans);
  return R;
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "n/a");

function checksOf(R, lattice) {
  const C = [];
  const push = (name, applies, value, pass, text) => C.push({ name, applies, value, pass, text });
  const has = (v) => Number.isFinite(v);

  push("socket", R.socketL !== undefined && (has(R.cheekL) || has(R.socketL)), R.socketDL, has(R.socketDL) && R.socketDL >= BARS.socketDL,
    `cheek L* ${fmt(R.cheekL)} - socket L* ${fmt(R.socketL)} = ${fmt(R.socketDL)}  (bar >= ${BARS.socketDL})`);
  push("lip", R.lipDE !== undefined, R.lipDE, has(R.lipDE) && R.lipDE >= BARS.lipDE,
    `lip Lab ${R.lipLab ? R.lipLab.map((v) => v.toFixed(0)).join("/") : "n/a"} vs skin ${R.skinLab ? R.skinLab.map((v) => v.toFixed(0)).join("/") : "n/a"}: dE ${fmt(R.lipDE)}  (bar >= ${BARS.lipDE})`);
  for (const e of R.eyes) {
    if (e.hidden) continue;
    const s = e.scleraL - R.skinL;
    push(`sclera ${e.side < 0 ? "L" : "R"}`, true, s, has(s) && s >= BARS.scleraLo && s <= BARS.scleraHi,
      `sclera L* ${fmt(e.scleraL)} vs skin L* ${fmt(R.skinL)}: ${s >= 0 ? "+" : ""}${fmt(s)}  (bar +${BARS.scleraLo}..+${BARS.scleraHi})`);
    push(`iris ${e.side < 0 ? "L" : "R"}`, true, e.irisL, has(e.irisL) && e.irisL >= BARS.irisL && e.highlight >= BARS.irisHighlight,
      `iris L* ${fmt(e.irisL)} (bar >= ${BARS.irisL}), highlight ${fmt(e.highlight)} L* over its median (bar >= ${BARS.irisHighlight})`);
  }
  if (R.browL !== undefined) {
    const lo = HAIR_L + BARS.browLo, hi = HAIR_L + BARS.browHi;
    push("brow", true, R.browL, has(R.browL) && R.browContrast >= BARS.browContrast && R.browL >= lo && R.browL <= hi,
      `brow L* ${fmt(R.browL)}, ${fmt(R.browContrast)} below the forehead (bar >= ${BARS.browContrast}); hair L* ${HAIR_L} so the band is ${lo}..${hi}`);
  }
  push("lattice", true, lattice.ok ? lattice.peak : NaN, lattice.ok && lattice.peak <= BARS.latticePeak,
    lattice.ok ? (lattice.smooth ? `skin is smooth (texture rms ${lattice.rms.toFixed(2)} L*)` : `autocorrelation peak ${lattice.peak.toFixed(3)} at a ${lattice.pitch.toFixed(0)} px pitch, texture rms ${lattice.rms.toFixed(2)} L*  (bar <= ${BARS.latticePeak})`) : `could not read the skin: ${lattice.why}`);
  push("step", R.stepL !== undefined, R.stepL, has(R.stepL) && R.stepL <= BARS.stepL,
    `largest luma step over ${BARS.stepMm} mm down the cheek: ${fmt(R.stepL)} L*  (bar <= ${BARS.stepL})`);
  return C;
}

function drawOverlay(img, R, lm, path) {
  const out = { ...img, data: new Uint8Array(img.data) };
  const put = (x, y, c) => { const X = Math.round(x), Y = Math.round(y); if (X < 0 || Y < 0 || X >= img.w || Y >= img.h) return; const o = (Y * img.w + X) * img.ch; out.data[o] = c[0]; out.data[o + 1] = c[1]; out.data[o + 2] = c[2]; };
  const COL = { cheek: [255, 255, 0], chin: [255, 255, 0], socket: [0, 255, 255], lip: [255, 0, 255], sclera: [0, 255, 0], iris: [255, 128, 0], brow: [255, 64, 64], scan: [255, 255, 255] };
  for (const w of R.windows) {
    const c = COL[w.kind] ?? [255, 255, 255];
    if (w.kind === "scan") { for (let y = w.y; y <= w.y1; y += 2) put(w.x, y, c); continue; }
    for (let a = 0; a < 48; a++) put(w.x + Math.cos(a / 48 * Math.PI * 2) * w.r, w.y + Math.sin(a / 48 * Math.PI * 2) * w.r, c);
  }
  for (const e of lm.eyes) for (const p of e.aperture) put(p.x, p.y, [200, 200, 255]);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(out));
}

/** R1: paint the named feature on a copy of the picture at the landmark and hand the copy back. */
function paint(img, R, kind, rgb, radiusPx) {
  const out = { ...img, data: new Uint8Array(img.data) };
  for (const w of R.windows) {
    if (w.kind !== kind) continue;
    const r = radiusPx ?? Math.ceil(w.r) + 1;
    for (let j = Math.floor(w.y - r); j <= Math.ceil(w.y + r); j++) for (let i = Math.floor(w.x - r); i <= Math.ceil(w.x + r); i++) {
      if (i < 0 || j < 0 || i >= img.w || j >= img.h || (i - w.x) ** 2 + (j - w.y) ** 2 > r * r) continue;
      const o = (j * img.w + i) * img.ch; out.data[o] = rgb[0]; out.data[o + 1] = rgb[1]; out.data[o + 2] = rgb[2];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------

const files = targets.flatMap(pngsUnder);
if (!files.length) {
  console.error("usage: node tools/facecontrast.mjs [--debug dir] [--lever] [--reg dx,dy,k] [--hair-l 20] <face card PNG | directory>...");
  process.exit(2);
}
const CH = await loadCharacters();
const lens = cardLens(CH);

const table = new Map();   // check family -> { read: n, failed: n, cards: [] }
let failed = 0, blind = 0, cards = 0;
for (const f of files) {
  const card = parseCardName(f);
  if (!card) { console.log(`[facecontrast] ${basename(f)}: not a face card name, skipped`); continue; }
  const img = readPng(f);
  const lab = labPlanes(img);
  const reg = REG ? (([dx, dy, k]) => ({ dx: Number(dx), dy: Number(dy), k: Number(k) }))(REG.split(",")) : register(CH, lens, lab, card.cls, card.turn);
  const lm = landmarksOnCard(CH, lens, card.cls, card.turn, reg);
  const R = readCard(img, lm, lab);
  const lattice = measureLattice(img);
  const C = checksOf(R, lattice);
  cards++;
  const label = `${card.cls} ${card.turn}`;
  console.log(`\n[facecontrast] ${label.padEnd(18)} registered dx ${reg.dx.toFixed(1)} dy ${reg.dy.toFixed(1)} k ${reg.k.toFixed(3)}  (${lm.mmPerPx.toFixed(3)} mm/px)   skin L* ${fmt(R.skinL)}`);
  for (const c of C) {
    const fam = c.name.split(" ")[0];
    const t = table.get(fam) ?? { read: 0, failed: 0, cards: [] };
    if (c.applies) {
      t.read++;
      if (!c.pass) { t.failed++; t.cards.push(label); failed++; }
    }
    table.set(fam, t);
    console.log(`  ${c.applies ? (c.pass ? "ok  " : "RED ") : "n/a "} ${c.name.padEnd(9)} ${c.text}`);
  }
  if (DEBUG) drawOverlay(img, R, lm, resolve(DEBUG, `${basename(f, ".png").replace(/^facecard-.*-cls/, "cls")}.png`));

  if (LEVER) {
    // R1: paint each feature and require ITS reading to follow. The registration is held, so the windows do not move.
    const moves = [];
    const readAfter = (img2) => { const lab2 = labPlanes(img2); return readCard(img2, lm, lab2); };
    const tries = [
      ["sclera", [236, 228, 214], 2, (a, b) => (b.eyes.find((e) => !e.hidden)?.scleraL ?? NaN) - (a.eyes.find((e) => !e.hidden)?.scleraL ?? NaN), 15, "sclera L* rises"],
      ["brow", [110, 84, 66], 2, (a, b) => (a.browL ?? NaN) - (b.browL ?? NaN), 6, "brow L* changes"],
      ["lip", [176, 98, 92], 2, (a, b) => (b.lipDE ?? NaN) - (a.lipDE ?? NaN), 5, "lip dE rises"],
      ["socket", [70, 48, 38], 3, (a, b) => (b.socketDL ?? NaN) - (a.socketDL ?? NaN), 8, "socket dL rises"],
      ["iris", [70, 100, 120], 2, (a, b) => (b.eyes.find((e) => !e.hidden)?.irisL ?? NaN) - (a.eyes.find((e) => !e.hidden)?.irisL ?? NaN), 10, "iris L* rises"],
    ];
    for (const [kind, rgb, rad, delta, need, what] of tries) {
      if (!R.windows.some((w) => w.kind === kind)) { moves.push(`${kind}: no window on this card`); continue; }
      const after = readAfter(paint(img, R, kind, rgb, rad ? rad + Math.max(...R.windows.filter((w) => w.kind === kind).map((w) => w.r)) : undefined));
      const d = delta(R, after);
      const moved = Number.isFinite(d) && Math.abs(d) >= need;
      if (!moved) failed++;
      moves.push(`${kind}: ${what} by ${fmt(d)} (needs ${need}) ${moved ? "MOVED" : "DID NOT MOVE"}`);
    }
    console.log(`  LEVER ${label}: ${moves.join(" | ")}`);
  }
}

console.log("\n[facecontrast] by check (windows read, windows red):");
for (const [fam, t] of table) {
  const b = t.read === 0;
  if (b) blind++;
  console.log(`  ${fam.padEnd(9)} read ${String(t.read).padStart(2)}  red ${String(t.failed).padStart(2)}${b ? "  BLIND: nothing was read on any card" : ""}${t.failed ? `   (${[...new Set(t.cards)].slice(0, 6).join(", ")}${t.cards.length > 6 ? ", ..." : ""})` : ""}`);
}
if (LEVER) {
  console.log(failed ? `[facecontrast] LEVER: ${failed} feature(s) did not follow the picture: the ruler is not reading where it says it reads` : "[facecontrast] LEVER: every painted feature moved its own reading");
  process.exit(failed ? 1 : 0);
}
console.log(failed || blind
  ? `[facecontrast] FAIL: ${failed} reading(s) red over ${cards} card(s)${blind ? `, and ${blind} check(s) BLIND (nothing read; a blind check is not a clean one)` : ""}`
  : `[facecontrast] PASS: ${cards} card(s)`);
process.exit(failed || blind ? 1 : 0);
