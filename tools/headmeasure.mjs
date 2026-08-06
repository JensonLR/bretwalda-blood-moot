#!/usr/bin/env node
// ============================================================
// HEADMEASURE — the tape measure on the actual displacement field.
//
//   node tools/headmeasure.mjs
//   node tools/headmeasure.mjs --seeds 12
//
// Five times now a pass on this face has fixed every item on a list of
// complaints and shipped a worse object, because "the nose is too big" is an
// adjective and nobody ever turned it into a number. This turns it into
// numbers: it transpiles `characters.ts` as-is, calls the exported `headProbe`,
// and reads the field back as anthropometry in millimetres.
//
// It does not render anything and it is not a substitute for looking. It is the
// thing you check the picture against — `docs/SUTTON-HOO.md`, "work from the
// object, not the list".
//
// The `life` column is Farkas' adult male series (head height menton–vertex
// 232 mm, head length glabella–opisthocranion 196, head breadth 155, neck
// breadth 111, nose projection past pogonion ~20) expressed as ratios and
// rescaled to this game's head, so what is being compared is proportion. Some
// targets are deliberately off life — this warrior is drawn at a heroic 7.3
// heads, with a broad vault and a fighter's neck — and those carry a note.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".headmeasure");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SEEDS = parseInt(flag("seeds", "8"), 10);

// Emitted inside the repo on purpose: the module imports `three`, and node
// resolves that by walking up to the repo's own node_modules.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts",
  "--outDir", ".headmeasure", "--target", "es2022", "--module", "esnext",
  "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
// tsc picks its own rootDir from the common directory of everything it pulled
// in, so the emit lands one or two levels down. Find it rather than guess.
const found = [];
const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(dir, e.name)) : e.name === "characters.js" && found.push(resolve(dir, e.name)); };
if (existsSync(OUT)) walk(OUT);
const built = found[0] ?? resolve(OUT, "characters.js");
if (!existsSync(built)) {
  console.error("[head] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || ""));
  process.exit(2);
}

const { headProbe, headSilhouette } = await import(pathToFileURL(built).href);

const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];

// name, life/target ratio or mm, tolerance, note
const TARGETS = [
  ["headHeight", null, null, "mm, crown to menton"],
  ["headCount", 7.15, 0.35, "stature / head height; action-game heroic is 7.0–7.3"],
  ["breadthOverHeight", 0.72, 0.05, "life 0.67; broad Saxon vault allowed to 0.75"],
  ["lengthOverHeight", 0.845, 0.05, "GLABELLA to occiput / head height — note 3, the long skull"],
  ["craniumShare", 0.35, 0.035, "crown to brow / head height — note 3, cranium vs face"],
  ["midThird", 0.25, 0.035, "brow to subnasale"],
  ["lowerThird", 0.40, 0.04, "subnasale to menton"],
  ["noseBeyondChin", 24, 8, "NOTE 1 — the beak. Ricketts' E-line puts the tip ~21 mm ahead of pogonion; ×1.16 for this head"],
  ["noseBeyondLip", 26, 9, "tip in front of the lip line"],
  ["noseProjection", 29, 8, "tip off the NASION (found, not assumed). Under 20 is a flat nose"],
  ["tipBreadth", 20, 7, "NOTE 1 — the lobule: breadth within 3 mm of the tip's own projection. A man's is a bulb ~18–24 mm; single digits are a beak"],
  ["chinBeyondNasion", 0, 9, "NOTE 2 — the facial angle. Deeply negative is a set-back mandible"],
  ["chinBeyondLip", -3, 6, "in a male profile pogonion sits 2-3 mm BEHIND the lips — the recession note is chinBeyondNasion, not this"],
  ["jawBreadth", null, null, "mm, bigonial"],
  ["cheekBreadth", null, null, "mm, bizygomatic"],
  ["jawOverCheek", 0.86, 0.08, "bigonial / bizygomatic across the FRONT half. Life 0.77; a fighter 0.84–0.90"],
  ["neckBreadth", null, null, "mm"],
  ["neckOverHead", 0.75, 0.09, "neck breadth / max head breadth. Life 0.72; the spread is class bulk, which is art direction"],
  ["neckOverJaw", 1.00, 0.12, "NOTE 4 — neck against the jaw right above it. Life ~1.05, fighter higher"],
  ["visibleNeck", null, null, "mm, menton to the glenohumeral centre"],
  ["neckOverHeadHeight", 0.50, 0.07, "life 0.63 — this build runs a SHORT thick neck on purpose (see shoulderY). Guards against it drifting back to the 0.70 that made the head read small"],
];

const rows = [];
for (const cls of CLASSES) {
  for (let s = 0; s < SEEDS; s++) rows.push({ cls, seed: s, p: headProbe(cls, s) });
}

const fmt = (v) => (Math.abs(v) >= 20 ? v.toFixed(1) : v.toFixed(3));
let fails = 0;
console.log(`[head] ${rows.length} heads · ${CLASSES.length} classes × ${SEEDS} seeds\n`);
console.log("  measure                   min      mean       max   target      verdict");
console.log("  " + "-".repeat(84));
for (const [key, target, tol, note] of TARGETS) {
  const vals = rows.map((r) => r.p[key]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  let verdict = "—";
  if (target !== null) {
    const worst = Math.max(Math.abs(min - target), Math.abs(max - target));
    const ok = worst <= tol;
    if (!ok) fails++;
    verdict = ok ? "ok" : `OUT by ${fmt(worst - tol)}`;
  }
  console.log(`  ${key.padEnd(20)} ${fmt(min).padStart(9)} ${fmt(mean).padStart(9)} ${fmt(max).padStart(9)}` +
    `  ${(target === null ? "" : `${fmt(target)}±${fmt(tol)}`).padStart(11)}   ${verdict}`);
  console.log(`    ${note}`);
}
console.log("\n  " + "-".repeat(84));
console.log(`[head] RATIOS: ${fails} of ${TARGETS.filter((t) => t[1] !== null).length} measured ratios outside tolerance`);

// ============================================================
// THE SILHOUETTE GATE
//
// Every number above passed on the build that shipped a muzzle. That is not a
// slack tolerance — it is that a ratio between two named landmarks cannot see
// the shape of the line between them. "The nose tip is 24 mm in front of
// pogonion" is equally true of a face and of a snout, because the lips are not
// one of the two points, and the lips were the defect.
//
// So none of what follows is a ratio. Each one is an assertion about the shape
// of the PROFILE OUTLINE — the curve a side-on camera actually draws — and
// between them they would have caught all six failures on this head:
//
//   S1  the frontmost point of the face is the NOSE, never the lips
//   S2  the lips sit BEHIND the nose-to-chin line (Ricketts' E-line)
//   S3  the chin does not sit behind a vertical dropped from the brow
//   S4  the jaw shows a CORNER, not an arc curving into the neck
//   S5  the neck is at least as broad as the jaw above it
//   S6  the ear stands off the skull far enough to cast onto it
//
// S1, S2 and S4 are properties of a curve and have no landmark-pair form at all.
// ============================================================

const mmOf = (v) => v * 1000;

/** Furthest-forward z the outline reaches at a given height. */
function zAtHeight(sil, h) {
  const n = sil.y.length;
  let best = -Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const y0 = sil.y[i], y1 = sil.y[j];
    if ((y0 - h) * (y1 - h) > 0) continue;
    const t = Math.abs(y1 - y0) < 1e-12 ? 0 : (h - y0) / (y1 - y0);
    const z = sil.z[i] + (sil.z[j] - sil.z[i]) * t;
    if (z > best) best = z;
  }
  return best;
}

/** Furthest-forward point of the outline whose height lies in [lo, hi]. */
function foremostIn(sil, lo, hi) {
  let bz = -Infinity, by = 0;
  for (let i = 0; i < sil.y.length; i++) {
    if (sil.y[i] < lo || sil.y[i] > hi) continue;
    if (sil.z[i] > bz) { bz = sil.z[i]; by = sil.y[i]; }
  }
  return { y: by, z: bz };
}

function silMetrics(sil) {
  const n = sil.y.length;
  const H = sil.top - sil.bot;

  // ---- S1 · the frontmost point of the face ----
  // Taken over the face only (below the crown, above the menton), and reported
  // as where it landed rather than as a pass/fail on an assumed landmark: the
  // whole point is that nobody gets to name it in advance.
  const face = foremostIn(sil, sil.bot + H * 0.03, sil.top - H * 0.03);
  const frontFromCrown = (sil.top - face.y) / H;
  // The nose occupies roughly 0.44–0.60 of the head's height below the crown.
  // The lip band is 0.62–0.78. If the frontmost point is in the second one the
  // object is a muzzle whatever every ratio says.
  const noseLo = sil.noseY, noseHi = sil.browY;
  const nose = foremostIn(sil, noseLo, noseHi);
  const lipBand = foremostIn(sil, sil.chinY, sil.noseY);
  const noseLead = mmOf(nose.z - lipBand.z);

  // ---- S2 · the E-line ----
  // The chord from the nose tip to pogonion. On a man the lips clear it by a
  // couple of millimetres; on a snout they cross it. Measured over every outline
  // sample between the two, so it is the CURVE that is tested, not a point.
  const pog = foremostIn(sil, sil.chinY - H * 0.06, sil.chinY + H * 0.06);
  let lipBeyondE = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = sil.y[i];
    if (y > nose.y || y < pog.y) continue;
    const t = (y - nose.y) / (pog.y - nose.y || 1e-9);
    const zLine = nose.z + (pog.z - nose.z) * t;
    lipBeyondE = Math.max(lipBeyondE, sil.z[i] - zLine);
  }

  // ---- S3 · the facial angle, as a vertical and not as a ratio ----
  const chinBehindBrow = mmOf(zAtHeight(sil, sil.browY) - pog.z);

  // ---- S4 · the gonial corner ----
  // theta runs 0 at the crown, pi/2 dead ahead, pi at the menton. The mandible
  // is therefore the arc from just past the menton round to under the ear. A
  // circle turns by a fixed amount per step; a jaw spikes where the angle is.
  const W = 6;                                  // +/- 3 degrees of window
  const turnAt = (k) => {
    const a = (k - W + n) % n, b = (k + W) % n;
    const ax = sil.y[k] - sil.y[a], az = sil.z[k] - sil.z[a];
    const bx = sil.y[b] - sil.y[k], bz = sil.z[b] - sil.z[k];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (la < 1e-9 || lb < 1e-9) return 0;
    const c = Math.min(1, Math.max(-1, (ax * bx + az * bz) / (la * lb)));
    return Math.acos(c) * 180 / Math.PI;
  };
  const k0 = Math.round((190 / 360) * n), k1 = Math.round((268 / 360) * n);
  const turns = [];
  for (let k = k0; k <= k1; k++) turns.push(turnAt(k));
  const gonialTurn = Math.max(...turns);
  const med = [...turns].sort((a, b) => a - b)[turns.length >> 1];
  const gonialOverArc = gonialTurn / Math.max(1e-6, med);

  return {
    frontFromCrown,
    noseLead,
    lipBeyondEline: mmOf(lipBeyondE),
    chinBehindBrow,
    gonialTurnDeg: gonialTurn,
    gonialOverArc,
    neckOverJaw: sil.neckHW / sil.jawHW,
    earStandoff: mmOf(sil.earOut),
  };
}

/** A profile drawn in the terminal, because the whole failure was not looking. */
function draw(sil) {
  const RW = 46, RH = 30;
  const H = sil.top - sil.bot;
  const zs = sil.z, ys = sil.y;
  const zMin = Math.min(...zs), zMax = Math.max(...zs);
  const D = Math.max(zMax - zMin, 1e-6);
  const grid = Array.from({ length: RH }, () => new Array(RW).fill(" "));
  for (let i = 0; i < ys.length; i++) {
    const r = Math.round(((sil.top - ys[i]) / H) * (RH - 1));
    const c = Math.round(((zs[i] - zMin) / D) * (RW - 1));
    if (r >= 0 && r < RH && c >= 0 && c < RW) grid[r][c] = "#";
  }
  const mark = (h, ch) => {
    const r = Math.round(((sil.top - h) / H) * (RH - 1));
    if (r >= 0 && r < RH) grid[r][RW - 1] = ch;
  };
  mark(sil.browY, "b"); mark(sil.tipY, "n"); mark(sil.lipY, "l"); mark(sil.chinY, "c");
  console.log("\n  profile · face points right · b brow  n nose tip  l lip  c chin");
  for (const row of grid) console.log("   " + row.join(""));
}

// name, low, high, note
const ASSERTS = [
  ["noseLead", 6, 60,
    "S1 · mm the nose tip stands in front of the whole lip band. NEGATIVE IS A MUZZLE — the lips are the frontmost point of the face"],
  ["frontFromCrown", 0.42, 0.62,
    "S1 · where the frontmost point of the face sits, as a fraction of head height below the crown. The nose lives here; the mouth is at 0.68+"],
  ["lipBeyondEline", -14, 0.5,
    "S2 · mm the lips stand in FRONT of the nose-to-pogonion chord. Life is -2 to -4. Positive is a snout; past -14 is a lipless slot"],
  ["chinBehindBrow", -16, 7,
    "S3 · mm pogonion sits behind a vertical dropped from the brow. Past +7 is a receding chin however big the chin bump is"],
  ["gonialTurnDeg", 18, 90,
    "S4 · degrees the outline turns through at its sharpest point along the mandible. An arc curving into the neck cannot reach this"],
  ["gonialOverArc", 1.5, 12,
    "S4 · that corner against the median turn over the same arc. 1.0 is a circle — a jaw with no angle in it"],
  ["neckOverJaw", 1.0, 1.45,
    "S5 · neck breadth over bigonial breadth. Under 1.0 the head sits on a stalk"],
  ["earStandoff", 11, 26,
    "S6 · mm the helix stands clear of the skin beside it. Under 11 the ear is a sticker with no shadow under it"],
];

const sils = [];
for (const cls of CLASSES) for (let s = 0; s < SEEDS; s++) sils.push(silMetrics(headSilhouette(cls, s)));

console.log("\n\n[head] SILHOUETTE GATE — assertions on the profile OUTLINE, not on landmark ratios");
console.log(`[head] ${sils.length} heads\n`);
console.log("  assertion                 min      mean       max        allowed      verdict");
console.log("  " + "-".repeat(84));
let sfails = 0;
for (const [key, lo, hi, note] of ASSERTS) {
  const vals = sils.map((r) => r[key]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const ok = min >= lo && max <= hi;
  if (!ok) sfails++;
  console.log(`  ${key.padEnd(20)} ${fmt(min).padStart(9)} ${fmt(mean).padStart(9)} ${fmt(max).padStart(9)}` +
    `  ${`${fmt(lo)}..${fmt(hi)}`.padStart(13)}   ${ok ? "ok" : "FAIL"}`);
  console.log(`    ${note}`);
}
draw(headSilhouette("huscarl", 0));
console.log("\n  " + "-".repeat(84));
console.log(`[head] FINAL: ${fails} ratios outside tolerance · ${sfails} of ${ASSERTS.length} SILHOUETTE assertions FAILED`);
rmSync(OUT, { recursive: true, force: true });
process.exit(sfails > 0 ? 1 : 0);
