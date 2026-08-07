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

// ============================================================
// 3. THE GROUNDED PIECES — and why section 2 could say "10/10 seated" while
//    the owner was looking at wings.
//
// "The helmets don't seem any better either theres a lot of raised floating
// aspects." Nasal, Spectacle, Boar-Crest, Jarl's Crowned and Wyrm-Crest all
// showed a pale curved flange flaring out and up from the side of the head,
// standing clear of the face with daylight between it and the cheek. Section 2
// passed every one of them, and it was not lying: it measures FOLD, SKIN
// THROUGH, and the lift number the AUTHOR WROTE. None of those three can see a
// plate that is welded to the head at its hinge, obeys every standoff bar in
// the file, and then leaves the skull at 35 degrees on its way down.
//
// Worse, two of the five pieces were not measured AT ALL. The warden's neck
// flange carried no tag, so `helmFitProbe` skipped it as if it were hair; the
// nape fall is swept on its own rings with a bare `patch`, so the spy — which
// only taps `headWear` — never saw a single vertex of it. For four of the ten
// rungs the largest sheet of metal on the helmet was outside the gate. Both are
// now inside it.
//
// So this section measures the three things an eye measures on a hanging plate:
//
//   GAP    the widest daylight between the metal's INNER wall and the skin. A
//          liner is 8-12 mm and a mail gap under a jaw is another 10, so the
//          bar is 26 mm. Past that you are not looking at a helmet, you are
//          looking THROUGH one.
//   FLARE  the angle the plate's surface makes with the head's, along the
//          direction it hangs in. Zero is a plate lying on the skull; 45 deg is
//          a plate that moves a millimetre off the head for every millimetre it
//          travels down it. That is a wing, and it is precisely what the owner
//          is pointing at. The bar is 22 deg, which still allows the brim's
//          overhang and a guard swinging clear of the mandible.
//   HEM    the standoff at the LOWER of the plate's two edges. A hanging plate
//          is furthest from the head at its hinge and closest at its hem; one
//          that is furthest at its hem is not hanging, it is flaring. 26 mm.
//
// Crests, combs, bristle and bowls are exempt: they are silhouette, they are
// what the player is buying, and nothing about them hangs. Everything that is
// supposed to follow a jaw, a nape or a shoulder is here.
const GROUNDED = /cheek|flange|nape|aventail|neck/;
const GAP_MM = 26;
const FLARE_DEG = 22;
const HEM_MM = 26;

const helms = ONLY ? [ONLY] : HELM_VALUES;
const seeds = [];
for (let i = 0; i < SEEDS; i++) seeds.push(i * 7919 + 13);

console.log("");
console.log("[wear] 2. HELM FIT — every shell of every helmet, on real heads.");
console.log("");
console.log("[wear] helm         shells  fold%   thru mm   seat mm  float mm  worst shell");
console.log("[wear] ---------------------------------------------------------------------");

const fails = [];
const ground = [];
let measured = 0;
for (const helm of helms) {
  let nShell = 0, fold = 0, thru = 0, seat = 0, float = 0;
  let foldTag = "-", thruTag = "-", seatTag = "-", floatTag = "-";
  let gap = 0, flare = 0, hem = 0, nGround = 0;
  let gapTag = "-", flareTag = "-", hemTag = "-";
  const seen = new Set();
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
        if (!GROUNDED.test(sh.tag)) continue;
        if (!seen.has(sh.tag)) { seen.add(sh.tag); nGround++; }
        if (sh.gapMm > gap) { gap = sh.gapMm; gapTag = sh.tag; }
        if (sh.flareDeg > flare) { flare = sh.flareDeg; flareTag = sh.tag; }
        if (sh.hemMm > hem) { hem = sh.hemMm; hemTag = sh.tag; }
      }
    }
  }
  const gbad = [];
  if (gap > GAP_MM) gbad.push(`${gapTag} opens ${gap.toFixed(1)} mm of daylight`);
  if (flare > FLARE_DEG) gbad.push(`${flareTag} flares ${flare.toFixed(1)} deg off the skull`);
  if (hem > HEM_MM) gbad.push(`${hemTag} hem stands ${hem.toFixed(1)} mm out`);
  ground.push({ helm, nGround, gap, flare, hem, gapTag, flareTag, hemTag, bad: gbad });
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

// ============================================================
// 3. GROUNDED PIECES — the gate section 2 could not be
// ============================================================
console.log("");
console.log("[wear] 3. GROUNDED PIECES — cheek guards, flanges and nape falls.");
console.log("[wear]    A hanging plate follows the head down. These three say whether it does.");
console.log("");
console.log("[wear] helm         parts   gap mm  flare deg   hem mm  worst part");
console.log("[wear] ---------------------------------------------------------------------");
const gfails = [];
for (const g of ground) {
  if (g.bad.length) gfails.push(`${g.helm}: ${g.bad.join("; ")}`);
  const worst = g.flare > FLARE_DEG ? g.flareTag : g.hem > HEM_MM ? g.hemTag : g.gap > GAP_MM ? g.gapTag : "-";
  console.log(
    `[wear] ${g.helm.padEnd(12)} ${String(g.nGround).padStart(4)}  ` +
    `${g.gap.toFixed(1).padStart(7)}  ${g.flare.toFixed(1).padStart(9)}  ` +
    `${g.hem.toFixed(1).padStart(7)}  ${worst}${g.bad.length ? "   <-- FAIL" : ""}`);
}
console.log("");
console.log(`[wear] bars: gap ${GAP_MM} mm, flare ${FLARE_DEG} deg, hem ${HEM_MM} mm`);
for (const f of gfails) console.log(`[wear] FAIL ${f}`);
const nG = ground.filter((g) => g.nGround > 0).length;
console.log(`[wear] ${gfails.length ? "FAIL" : "PASS"}: ` +
  `${nG - gfails.length}/${nG} helmets with hanging plates keep them on the head`);
process.exit(fails.length + gfails.length ? 1 : 0);
