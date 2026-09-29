#!/usr/bin/env node
// ============================================================
// FACECLASS — are the four classes four faces, on one skull?
//
//   node tools/faceclass.mjs                 the four baked faces (identity 0 of each class)
//   node tools/faceclass.mjs --seeds 24      the population the bar is taken from
//   node tools/faceclass.mjs --lever         R1: give the huscarl a heavy brow and a long nose; the distance MUST move
//
// THE OWNER'S WORDS, quoted in CHAR-PLAN CH-04: "one face, one complexion, one iris, one hair for all
// four classes ... eight authored men are eight copies of four faces. The face lens is the product."
// The four authored GLBs are identity 0 of each class, and identity 0 is one set of `faceTraits`, so the
// four heads differ only by the class's own scale. Nothing measured that: `headmeasure` reads one
// skull's proportions against Farkas' means, per class, and says nothing about whether the classes
// differ from EACH OTHER.
//
// WHAT IT MEASURES. A face feature vector, in millimetres on a common 270 mm head, taken off the realised
// surface (`faceFieldOf(cls).surface`, the same sampler every helm is cut from), not off the traits that
// were asked for:
//   - the sagittal profile: z of the midline at 41 latitudes, with the skull's own curve taken out (a
//     moving average over 0.3 of the field's height): what is left is the brow, the nasion, the nose, the
//     lip and the chin
//   - the coronal sections: the half-breadth at the same latitudes, the same way: the cheekbone and the jaw
//   - the aperture of an eye (width, height), the interpupillary distance and the mouth's width
// The distance between two classes is the RMS of the difference. Class scale is out: the vector is
// normalised to head height first, because a runekeeper is a smaller man and not a different face. THE
// SKULL IS OUT TOO, on purpose: `faceTraits` moves breadth and depth by a per cent or two inside a class
// and that spread would otherwise be most of what the bar is taken from, and it is not identity, it is the
// skull structure the second half of this ruler holds STILL.
//
// THE BAR, from the population and not from a taste. Two random men of ONE class are a real distance
// apart (`faceTraits` moves the brow +-20%, the nose +-10%, the jaw +-20% ...). Two men of DIFFERENT
// classes have to be further apart than that or the classes are not an axis of variety: a warden is not
// a huscarl with a new tunic. So the bar is the median within-class distance over `--seeds` seeds, and
// each class pair must clear it. HEAD: 0.00 mm between all six pairs, because all four share a face.
//
// THE OTHER HALF, and it is LORE 0.2 rule 5 ("do not racialise the skull"): the classes may differ by age,
// wear, brow, nose and jaw, and must share one skull STRUCTURE within +-2% on breadth over height and
// length over height. A build that passes the distance by making a runekeeper's head a different shape
// fails this one.
//
// R2: at HEAD the distance is 0. R1: `--lever` puts a heavy brow (+10 mm) and a long nose (+14 mm) on the huscarl alone
// and requires the huscarl's distance to every other class to rise past the bar and the skull ratios to
// stay inside their band (the lever is a FACE change, not a skull change).
// ============================================================
import * as THREE from "three";
import { loadCharacters, CLASSES } from "./lib/facecard.mjs";

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SEEDS = parseInt(flag("seeds", "24"), 10);
const LEVER = argv.includes("--lever");
const SKULL_BAND = 0.02;     // +-2% on breadth over height and length over height, between classes
const HEAD_MM = 270;         // the common head height the vectors are scaled to

const CH = await loadCharacters();
const NLAT = 41;
const LATS = Array.from({ length: NLAT }, (_, i) => -0.92 + (i / (NLAT - 1)) * 1.84);   // field y, menton to crown
const _p = new THREE.Vector3();

/** A moving average over `half` samples either side, edges held: the skull's own curve, to be taken out. */
function lowpass(a, half) {
  return a.map((_, i) => { let t = 0, n = 0; for (let k = Math.max(0, i - half); k <= Math.min(a.length - 1, i + half); k++) { t += a[k]; n++; } return t / n; });
}

/** The feature vector of one man, in mm on a HEAD_MM head. `tweak` moves the surface (the lever). */
function features(cls, seed, tweak) {
  const F = CH.faceFieldOf(cls, seed);
  const pt = (w, v) => { F.surface(w, v, _p); const q = { x: _p.x, y: _p.y, z: _p.z }; return tweak ? tweak(q, w, v) : q; };
  const top = pt(0, Math.PI / 2 - 1e-4).y, bottom = pt(0, -Math.PI / 2 + 1e-4).y;
  const s = HEAD_MM / ((top - bottom) * 1000);
  const mm = (m) => m * 1000 * s;
  const sag = LATS.map((fy) => mm(pt(0, Math.asin(fy)).z));
  const cor = LATS.map((fy) => { let hw = 0; for (let k = 0; k <= 64; k++) hw = Math.max(hw, Math.abs(pt((k / 64) * Math.PI, Math.asin(fy)).x)); return mm(hw); });
  const HALF = Math.round(0.15 / (1.84 / (NLAT - 1)));   // 0.3 of the field's height, centred
  const vec = [];
  const sl = lowpass(sag, HALF), cl = lowpass(cor, HALF);
  for (let i = 0; i < NLAT; i++) vec.push(sag[i] - sl[i]);
  for (let i = 0; i < NLAT; i++) vec.push(cor[i] - cl[i]);
  const L = CH.faceLandmarks(cls, seed);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const e0 = L.eyes[0], e1 = L.eyes[1];
  const ys = e0.aperture.map((q) => q[1]);
  vec.push(mm(dist(e0.medial, e0.lateral)));                                         // aperture width
  vec.push(mm(Math.max(...ys) - Math.min(...ys)));                                   // aperture height
  vec.push(mm(dist(e0.iris, e1.iris)));                                              // interpupillary distance
  vec.push(mm(dist(L.mouth.corners[0], L.mouth.corners[1])));                        // mouth width
  return { vec };
}

const rms = (a, b) => Math.sqrt(a.reduce((t, x, i) => t + (x - b[i]) ** 2, 0) / a.length);

// ---- the population the bar is taken from: pairs of men within a class ----
const within = [];
for (const cls of CLASSES) {
  const men = Array.from({ length: SEEDS }, (_, i) => features(cls, i).vec);
  for (let i = 0; i < men.length; i++) for (let j = i + 1; j < men.length; j++) within.push(rms(men[i], men[j]));
}
within.sort((x, y) => x - y);
const BAR = within[within.length >> 1];
console.log(`[faceclass] within a class, over ${SEEDS} seeds x ${CLASSES.length} classes: RMS between two men p10 ${within[Math.floor(within.length * 0.1)].toFixed(2)} / median ${BAR.toFixed(2)} / p90 ${within[Math.floor(within.length * 0.9)].toFixed(2)} mm on a ${HEAD_MM} mm head`);

// ---- the four baked faces ----
const tweaked = (cls) => (LEVER && cls === "huscarl" ? (q, w, v) => {
  // a heavy brow (+10 mm at the brow ridge) and a long nose (+14 mm at the tip), on the huscarl alone
  const fy = Math.sin(v);
  const brow = 0.010 * Math.exp(-(((fy - 0.19) / 0.08) ** 2)) * Math.exp(-((Math.abs(w) / 0.5) ** 2));
  const nose = 0.014 * Math.exp(-(((fy + 0.23) / 0.07) ** 2)) * Math.exp(-((Math.abs(w) / 0.18) ** 2));
  return { x: q.x, y: q.y, z: q.z + brow + nose };
} : undefined);
const men = Object.fromEntries(CLASSES.map((c) => [c, features(c, 0, tweaked(c))]));
console.log(`[faceclass] the baked faces (identity 0), RMS mm between each pair; the bar is ${BAR.toFixed(2)}:`);
let red = 0, worst = Infinity;
const pad = (s, n) => String(s).padEnd(n);
console.log("            " + CLASSES.map((c) => pad(c, 11)).join(""));
for (const a of CLASSES) {
  const row = CLASSES.map((b) => {
    if (a === b) return pad("-", 11);
    const d = rms(men[a].vec, men[b].vec);
    return pad(d.toFixed(2), 11);
  });
  console.log(`  ${pad(a, 10)}${row.join("")}`);
}
for (let i = 0; i < CLASSES.length; i++) for (let j = i + 1; j < CLASSES.length; j++) {
  const d = rms(men[CLASSES[i]].vec, men[CLASSES[j]].vec);
  worst = Math.min(worst, d);
  if (!(d >= BAR)) red++;
}
console.log(worst >= BAR
  ? `  ok   every pair of classes is at least as far apart as two men of one class (closest pair ${worst.toFixed(2)} mm >= ${BAR.toFixed(2)})`
  : `  RED  ${red} of 6 class pairs are closer than two men of ONE class (closest ${worst.toFixed(2)} mm < ${BAR.toFixed(2)}): the classes are not an axis of variety`);

// ---- one skull ----
const ratios = {};
for (const c of CLASSES) { const p = CH.headProbe(c, 0); ratios[c] = { b: p.breadthOverHeight, l: p.lengthOverHeight }; }
const mean = (k) => CLASSES.reduce((t, c) => t + ratios[c][k], 0) / CLASSES.length;
let skullRed = 0;
for (const [k, name] of [["b", "breadth / height"], ["l", "length / height"]]) {
  const m = mean(k);
  const dev = CLASSES.map((c) => (ratios[c][k] - m) / m);
  const worstDev = Math.max(...dev.map(Math.abs));
  const ok = worstDev <= SKULL_BAND;
  if (!ok) skullRed++;
  console.log(`  ${ok ? "ok  " : "RED "} skull ${name}: ${CLASSES.map((c, i) => `${c} ${ratios[c][k].toFixed(3)} (${(dev[i] * 100).toFixed(1)}%)`).join(", ")}; band +-${SKULL_BAND * 100}%`);
}
red += skullRed;
if (LEVER) {
  const hus = CLASSES.filter((c) => c !== "huscarl").map((c) => rms(men.huscarl.vec, men[c].vec));
  const moved = hus.every((d) => d >= BAR) && skullRed === 0;
  console.log(moved
    ? `[faceclass] LEVER: a heavy brow and a long nose on the huscarl alone took his distance to the others to ${hus.map((d) => d.toFixed(2)).join(" / ")} mm (bar ${BAR.toFixed(2)}) with the skull still inside +-${SKULL_BAND * 100}%: the ruler is reading the face`
    : `[faceclass] LEVER: the huscarl's distances are ${hus.map((d) => d.toFixed(2)).join(" / ")} mm against a bar of ${BAR.toFixed(2)} (skull red ${skullRed}): the ruler does not notice the face`);
  process.exit(moved ? 0 : 1);
}
console.log(red
  ? `[faceclass] FAIL: ${red} reading(s) red`
  : "[faceclass] PASS");
process.exit(red ? 1 : 0);
