#!/usr/bin/env node
// ============================================================
// WEARMEASURE — does a helmet sit on the head, or hover over it and shear
// through it?
//
//   node tools/wearmeasure.mjs                # both sections, gate on section 2
//   node tools/wearmeasure.mjs --seeds 4      # more heads, slower
//   node tools/wearmeasure.mjs --helm wyrm    # one rung, all its shells listed
//
// `headmeasure.mjs` measures the head. This measures the things worn ON it.
//
// SECTION 1 is the diagnosis and it does not gate. `headWear` used to offset
// every worn shell along `faceNormal` — the normal of the UNDISPLACED ellipsoid,
// which knows nothing about the face block. The angle it reports is a property
// of the head, not of the helmets: it stays large no matter how well a helm is
// built, because it is the reason `faceNormalTrue` exists. Gating on it would be
// gating on a fact.
//
// SECTION 2 is the gate, and it is the one the armoury cards kept needing an eye
// for. It builds each helmet on real heads through the real `buildCharacter`,
// taps every shell the helm code asks `headWear` for, and measures three things
// per shell:
//
//   FOLD    the share of the shell where the offset surface has turned inside
//           out. A sheet lifted further than the surface's radius of curvature
//           crosses itself; its facets face backwards and the skin the fold
//           uncovers is nowhere near the (u, v) the sheet was drawn at. THIS IS
//           THE DEFECT `docs/COSMETICS-AUDIT.md` PRICED AT 2110 GOLD — "helms
//           render as slabs with skin punching through". Any fold at all is a
//           hole in the metal, so the bar is zero.
//   THRU    how far the skin gets outside the shell's own outer wall, in mm.
//           The same fault seen from the other side; also zero.
//   SEAT     the SMALLEST standoff any point of the shell asks for. Every plate
//            has to land on something. The bar is 28 mm, which is a 12 mm liner
//            plus the 15 mm face mask that is legitimately under the Sutton Hoo
//            helm's cheek guards — the deepest legal stack in the shop. A plate
//            whose nearest point is past that is not worn, it is parked, and
//            that is the owner's "the helms hover".
//   FLOAT    the LARGEST standoff, and only on the face furniture: the band,
//            the brow and nasal plates, the cheek guards. Those are the pieces
//            the audit found "standing tens of millimetres proud of the skull".
//            A bowl's crown and a crest's arch are deliberately proud — that is
//            the silhouette, and the silhouette is what the player is buying —
//            so neither is held to it.
//
// Same transpile-and-import trick as `headmeasure.mjs`, for the same reason: the
// field is the truth, and the field is TypeScript. Nothing here mirrors a helmet
// definition — `helmFitProbe` reads the arguments the build actually passes, so
// this cannot drift from the game the way the lineup sheet did.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".wearmeasure");

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const SEEDS = Math.max(1, Number(flag("seeds", 2)));
const ONLY = flag("helm", null);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts",
  "--outDir", ".wearmeasure", "--target", "es2022", "--module", "esnext",
  "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(dir, e.name)) : e.name === "characters.js" && found.push(resolve(dir, e.name)); };
if (existsSync(OUT)) walk(OUT);
const built = found[0] ?? resolve(OUT, "characters.js");
if (!existsSync(built)) {
  console.error("[wear] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || ""));
  process.exit(2);
}

const { wearNormalProbe, helmFitProbe, HELM_VALUES } = await import(pathToFileURL(built).href);

const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];

// ============================================================
// 1. lift direction — reported, not gated
// ============================================================
{
  const rows = [];
  let worstMax = 0, worstBand = 0, worstClear = 1;
  for (const cls of CLASSES) {
    for (let s = 0; s < 8; s++) {
      const r = wearNormalProbe(cls, s * 7919 + 13);
      rows.push(r);
      if (r.maxAngleDeg > worstMax) worstMax = r.maxAngleDeg;
      if (r.helmBandMaxDeg > worstBand) worstBand = r.helmBandMaxDeg;
      if (r.worstClearanceFrac < worstClear) worstClear = r.worstClearanceFrac;
    }
  }
  const mean = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  console.log("");
  console.log("[wear] 1. LIFT DIRECTION (diagnosis, not a gate) — angle between");
  console.log("[wear]    faceNormal (the ellipsoid's) and the displaced surface's.");
  console.log("");
  console.log(`[wear] heads measured          ${rows.length}  (${CLASSES.length} classes x 8 seeds)`);
  console.log(`[wear] whole head   mean       ${mean("meanAngleDeg").toFixed(1)} deg`);
  console.log(`[wear] whole head   worst      ${worstMax.toFixed(1)} deg`);
  console.log(`[wear] helm band    mean       ${mean("helmBandMeanDeg").toFixed(1)} deg`);
  console.log(`[wear] helm band    worst      ${worstBand.toFixed(1)} deg`);
  console.log(`[wear] a 6.0 mm lift would clear ${(6 * worstClear).toFixed(2)} mm at the worst point`);
  console.log("[wear] -> which is why every worn shell is lifted along faceNormalTrue.");
}

// ============================================================
// 2. helm fit — the gate
// ============================================================
//
// Crests stand off the crown on purpose and the hood is a draped cowl; both are
// held to the fold and skin-through bars like everything else, and neither is
// held to the standoff bar. Everything that is supposed to be *worn against the
// head* is.
// Face furniture, and only face furniture, is held to the float bar. Everything
// is held to the seat bar: even a crest lands on the bowl.
const FURNITURE = /band|plate|cheek/;
const SEAT_MM = 28;
const FLOAT_MM = 34;
const THRU_MM = 0.5;      // half a millimetre of slop for the radial table's bins

const helms = ONLY ? [ONLY] : HELM_VALUES;
const seeds = [];
for (let i = 0; i < SEEDS; i++) seeds.push(i * 7919 + 13);

console.log("");
console.log("[wear] 2. HELM FIT — every shell of every helmet, on real heads.");
console.log("");
console.log("[wear] helm         shells  fold%   thru mm   seat mm  float mm  worst shell");
console.log("[wear] ---------------------------------------------------------------------");

const fails = [];
let measured = 0;
for (const helm of helms) {
  let nShell = 0, fold = 0, thru = 0, seat = 0, float = 0;
  let foldTag = "-", thruTag = "-", seatTag = "-", floatTag = "-";
  for (const cls of CLASSES) {
    for (const seed of seeds) {
      const r = helmFitProbe(cls, seed, helm);
      measured++;
      nShell = Math.max(nShell, r.shells.length);
      for (const sh of r.shells) {
        if (sh.foldFrac > fold) { fold = sh.foldFrac; foldTag = sh.tag; }
        if (sh.throughMm > thru) { thru = sh.throughMm; thruTag = sh.tag; }
        if (sh.minLiftMm > seat) { seat = sh.minLiftMm; seatTag = sh.tag; }
        if (FURNITURE.test(sh.tag) && sh.standoffMm > float) { float = sh.standoffMm; floatTag = sh.tag; }
      }
    }
  }
  const bad = [];
  if (fold > 0) bad.push(`fold ${(fold * 100).toFixed(1)}% on ${foldTag}`);
  if (thru > THRU_MM) bad.push(`skin ${thru.toFixed(1)} mm through ${thruTag}`);
  if (seat > SEAT_MM) bad.push(`${seatTag} lands no closer than ${seat.toFixed(1)} mm`);
  if (float > FLOAT_MM) bad.push(`${floatTag} stands ${float.toFixed(1)} mm proud`);
  if (bad.length) fails.push(`${helm}: ${bad.join("; ")}`);
  const worst = fold > 0 ? foldTag : float > FLOAT_MM ? floatTag : seat > SEAT_MM ? seatTag : "-";
  console.log(
    `[wear] ${helm.padEnd(12)} ${String(nShell).padStart(4)}  ` +
    `${(fold * 100).toFixed(1).padStart(6)}  ${thru.toFixed(1).padStart(7)}  ` +
    `${seat.toFixed(1).padStart(8)}  ${float.toFixed(1).padStart(8)}  ${worst}${bad.length ? "   <-- FAIL" : ""}`);
}

console.log("");
console.log(`[wear] ${measured} helmet-on-head builds measured ` +
  `(${helms.length} helms x ${CLASSES.length} classes x ${seeds.length} seeds)`);
console.log(`[wear] bars: fold 0%, skin-through ${THRU_MM} mm, seat ${SEAT_MM} mm, float ${FLOAT_MM} mm on face furniture`);
for (const f of fails) console.log(`[wear] FAIL ${f}`);
console.log(`[wear] ${fails.length ? "FAIL" : "PASS"}: ${helms.length - fails.length}/${helms.length} helmets seated`);
process.exit(fails.length ? 1 : 0);
