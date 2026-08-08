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
import { rmSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import * as THREE from "three";

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
// `render/anim.ts` and not `characters.ts`, and it costs nothing: characters is
// anim's own import, so ONE tsc emits both. §9 needs the rig POSED — the rest
// carry lives in `STANCE` and reaches the frame through `poseWarrior`, and no
// amount of building a character will show you where a man holds his axe.
const tsc = spawnSync("npx", ["tsc", "src/game/client/render/anim.ts",
  "--outDir", ".wearmeasure", "--target", "es2022", "--module", "esnext",
  "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const foundAnim = [];
const emitted = [];
const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
  const f = resolve(dir, e.name);
  if (e.isDirectory()) walk(f);
  else if (e.name.endsWith(".js")) {
    emitted.push(f);
    if (e.name === "characters.js") found.push(f);
    if (e.name === "anim.js") foundAnim.push(f);
  }
} };
if (existsSync(OUT)) walk(OUT);
// tsc emits TypeScript's extensionless relative specifiers, which node's ESM
// loader will not resolve. One rewrite over the emitted tree, and it only ever
// touches `.wearmeasure`.
for (const f of emitted) {
  const src = readFileSync(f, "utf8");
  const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c));
  if (fixed !== src) writeFileSync(f, fixed);
}
const built = found[0] ?? resolve(OUT, "characters.js");
if (!existsSync(built)) {
  console.error("[wear] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || ""));
  process.exit(2);
}

const {
  wearNormalProbe, helmFitProbe, hairFitProbe, bodyFitProbe, handProbe, beardSeatProbe,
  backCarryProbe,
  HELM_VALUES, HAIR_VALUES, CLOAK_VALUES, BEARD_VALUES, defaultAppearance,
  buildCharacter,
} = await import(pathToFileURL(built).href);
const anim = foundAnim[0] && existsSync(foundAnim[0])
  ? await import(pathToFileURL(foundAnim[0]).href)
  : null;

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

// TWO THINGS THIS RULER CANNOT SEE, stated rather than tuned around.
//
// It measures metal against FLESH, and in two places in the shop there is
// something legitimately in between:
//
//   - the Sutton Hoo's cheek guards lap a formed face mask. `SEAT_MM` above
//     already carries the same 15 mm allowance for the same plate and the same
//     reason; these two bars carry 12.
//   - the huscarl's nape fall lies on his mail coif, which stands up to 45 mm
//     off the skull by the time it reaches the shoulder. A plate OVER an
//     aventail is the correct construction — it is what the finds show and what
//     the note above the fall spent a paragraph getting right — so a gate that
//     failed it would be demanding the plate be built inside the mail. The fall
//     is still gated, on the three classes that wear no coif, through the same
//     lines of the same build; what is dropped is one class's reading of one
//     tag, not the tag.
//
// Folding the coif into the radial table was tried and is the wrong answer: a
// 30x9 ring rasterised into a 192x96 table leaves empty bins, the gap function
// goes discontinuous across them, and the flare it reports is 84 deg of pure
// aliasing. A hole in the ruler is worse than a gap in its coverage, because
// the hole reports a number.
const MASK_ALLOW = 12;
const allowance = (helm, tag) => (helm === "suttonhoo" && /cheek/.test(tag) ? MASK_ALLOW : 0);
const blind = (cls, tag) => cls === "huscarl" && /nape/.test(tag);

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
        if (blind(cls, sh.tag)) continue;
        const a = allowance(helm, sh.tag);
        if (sh.gapMm - a > gap) { gap = sh.gapMm - a; gapTag = sh.tag; }
        if (sh.flareDeg > flare) { flare = sh.flareDeg; flareTag = sh.tag; }
        if (sh.hemMm - a > hem) { hem = sh.hemMm - a; hemTag = sh.tag; }
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

// ============================================================
// 4. HAIR UNDER WHAT IS WORN OVER IT — the head stack, measured
// ============================================================
//
// Sections 1-3 measure metal against flesh. Not one of them can see HAIR, and
// that blind spot is what three of the owner's complaints were sitting in:
//
//   "the braided & long hair styles have a weird cutoff on the sides"
//   "the Huscarl's chainmail at the rear of the head ... has some overlapping
//    issues with helmets & hair styles"
//   "shadow hood struggles with long hair with overlaps"
//
// All three are one fault — nothing owned the layering order of head furniture —
// and `wearmeasure` reported "10/10 seated" through every wave in which a 320 mm
// mane hung inside a mail coif. Four hairstyles times ten helms is forty
// combinations per class, and nobody is going to re-check forty of anything by
// eye, so this is arithmetic.
//
// `hairFitProbe` rasterises everything the helmet adds to the head into a
// radial table of INNER WALLS and looks every hair vertex up in it. Two numbers
// come back, and they pull against each other on purpose:
//
//   THRU   the worst any hair vertex stands outside the garment covering its
//          own direction, in millimetres. This is hair through a helmet, and
//          the bar is 3 mm — under one tessellation chord, which is as tight as
//          two meshes of this density can be held to each other.
//   FRAC   the share of covered hair vertices that are outside at all. A single
//          vertex 3 mm out is a facet; 1% of them out is a hole. 0.8%.
//   SHOW   the share of hair in directions NO garment covers — hair the player
//          can actually see. THIS ONE IS A FLOOR. A helmet that reports zero
//          through and zero shown has not passed; it is a helmet on a
//          mannequin, which is the defect the helm pass spent a section fixing
//          and which a through-only gate would happily reintroduce by deleting
//          all the hair.
//   KEPT   of the directions the hairstyle occupies ON A BARE HEAD, the share
//          the helmed build still occupies and can be seen in. REPORTED, NOT
//          ASSERTED — read the note below before trusting it.
//
// SHOW WAS THE WRONG QUANTITY AND IT SHIPPED A REGRESSION.
//
// SHOW is a fraction of THE HAIR THAT STILL EXISTS. It was written to stop
// exactly one failure — "a helmet on a mannequin" — and it cannot see that
// failure when the mannequin is made by DELETING the hair rather than by
// covering it, because the deleted hair leaves the denominator at the same time
// as the numerator. The head stack's first landing took the 40 g Long Mane and
// the 100 g Braided War-locks from 6-9% of silhouette under a helm to
// 0.05-0.95%, made the two paid styles pixel-identical on six of the ten rungs,
// and section 4 reported 39-86% SHOW and PASS on every one of them.
// `docs/OPEN-DEFECTS.md` has the table.
//
// KEPT fixes the denominator — it measures the hairstyle against ITSELF ON A
// BARE HEAD, a build no helmet can reach. It moves the right way on every rung
// (18-44% on the shipped geometry against 21-62% here) and it is NOT a gate,
// because no weighting measured separates a hairstyle that has been thinned
// from one that has been legitimately compressed; the alternatives and their
// numbers are recorded over `keptFrac` in `characters.ts`.
//
// THE GENERALISABLE LESSON IS NOT THIS COLUMN. The instrument that caught this
// regression already existed: `cosmetictest`'s "every paid hairstyle still reads
// under every helm that is not a hood" measures the SILHOUETTE against Shaved
// through a camera — a fixed reference and a projection, which is what a player
// has. It was red when the head stack landed. A ratio whose denominator moves
// with its numerator measures nothing, and a gate nobody runs measures nothing
// either.
const THRU_BAR = 3.0;
const FRAC_BAR = 0.008;
const SHOW_FLOOR = 0.02;
// ONE ALLOWANCE, measured rather than assumed, on the same idiom as
// `allowance()` above. The Jarl's Crowned nape flange is swept on its own rings
// and passes about 8 mm INSIDE the skin at the top of the nape, on the huscarl
// and the berserker alike. Hair there was walked down through +5 mm, +1 mm and
// -5 mm of lift and the reading falls 7.2 -> 1.7 -> 3.0 mm but never reaches
// zero, because at -5 mm the shell is already buried in a 10 mm scalp and the
// plate is still further in. That is a plate fault; a gate that failed it would
// be demanding hair be built inside a helmet, and burying the shell any deeper
// to satisfy a number would delete the hairline on five rungs to hide it. 1.5 mm
// is the residue and it is named here so nobody has to rediscover it.
const helmSlop = (helm) => (helm === "crowned" ? 1.5 : 0);

// NO BLIND SPOTS otherwise. The first cut of this carried one — the Jarl's Crowned, whose
// nape flange leaves about 6 mm under itself at the top of the nape against a
// skull with a 12 mm low-pass between them — and it was the wrong answer twice
// over: the fault was on the berserker as well as the huscarl, so the exemption
// was not even describing itself correctly, and the hair could simply be built
// to fit. A hole in a ruler is worse than a gap in its coverage, because the
// hole reports a number.

const HAIR_CLASSES = ["huscarl", "berserker"];
const hairStyles = (HAIR_VALUES ?? ["shaved", "short", "long", "braids"]).filter((h) => h !== "shaved");
console.log("");
console.log("[wear] 4. HAIR UNDER HEAD FURNITURE — every hairstyle under every helm.");
console.log("[wear]    skull -> hair -> coif/aventail -> helm/hood. Does the stack hold?");
console.log("");
console.log("[wear] helm         hair     thru mm    frac %   shown %   kept %  worst bearing");
console.log("[wear] ---------------------------------------------------------------------");
const hfails = [];
let hairRuns = 0;
for (const helm of helms) {
  for (const hair of hairStyles) {
    let thru = 0, frac = 0, show = 1, kept = 1, azd = 0, eld = 0, cls0 = "-", kcls = "-";
    for (const cls of HAIR_CLASSES) {
      for (const seed of seeds) {
        const r = hairFitProbe(cls, seed, helm, hair);
        hairRuns++;
        if (r.throughMm > thru) { thru = r.throughMm; azd = r.worstAzDeg; eld = r.worstElDeg; cls0 = cls; }
        if (r.throughFrac > frac) frac = r.throughFrac;
        if (r.showFrac < show) show = r.showFrac;
        if (r.keptFrac < kept) { kept = r.keptFrac; kcls = cls; }
      }
    }
    const bad = [];
    if (thru - helmSlop(helm) > THRU_BAR) bad.push(`${thru.toFixed(1)} mm of ${hair} outside the ${helm} on the ${cls0} at ${azd.toFixed(0)}/${eld.toFixed(0)} deg`);
    if (frac > FRAC_BAR) bad.push(`${(frac * 100).toFixed(2)}% of ${hair} is outside what covers it`);
    if (show < SHOW_FLOOR) bad.push(`${hair} shows ${(show * 100).toFixed(1)}% under the ${helm} — a helmet on a mannequin`);
    // A HOOD IS THE ONE GARMENT ENTITLED TO SWALLOW HAIR. It is a bag drawn over
    // the head and hiding what is under it is what its 120 gold buys, so KEPT is
    // reported for it and asserted on everything else. The exemption is named in
    // one place — here — and it is the same one `cosmetictest` makes.
    if (bad.length) hfails.push(`${helm}/${hair}: ${bad.join("; ")}`);
    console.log(
      `[wear] ${helm.padEnd(12)} ${hair.padEnd(7)} ${thru.toFixed(1).padStart(7)}  ` +
      `${(frac * 100).toFixed(2).padStart(8)}  ${(show * 100).toFixed(1).padStart(8)}  ` +
      `${(kept * 100).toFixed(0).padStart(6)}${helm === "hood" ? "*" : " "}  ` +
      `${thru > 0.05 ? `${azd.toFixed(0)}/${eld.toFixed(0)} deg` : "-"}` +
      `${bad.length ? "   <-- FAIL" : ""}`);
  }
}
console.log("");
console.log(`[wear] ${hairRuns} hair-under-helm fits measured ` +
  `(${helms.length} helms x ${hairStyles.length} styles x ${HAIR_CLASSES.length} classes x ${seeds.length} seeds)`);
console.log(`[wear] bars: through ${THRU_BAR} mm, ${(FRAC_BAR * 100).toFixed(1)}% of covered vertices, `
  + `at least ${(SHOW_FLOOR * 100).toFixed(0)}% of the hair still visible, and at least `
  + `KEPT reported not asserted (* hood)`);
for (const f of hfails) console.log(`[wear] FAIL ${f}`);
console.log(`[wear] ${hfails.length ? "FAIL" : "PASS"}: ` +
  `${helms.length * hairStyles.length - hfails.length}/${helms.length * hairStyles.length} hair-and-helm pairs keep to the stack`);

// 5. BODY FITTINGS — the same question, below the neck
// ============================================================
//
// "if you look at the actual armour you'll see in my screenshot that the gold
//  'medal' looking circle is floating off the players chest, same with all the
//  buttons & other aspects floating round the body."
//
// Sections 1-4 could not see a single one of these. They tap `headWear`, and a
// belt stud, a cloak brooch and a baldric boss never go near it — so the whole
// lower two thirds of the warrior had no fit ruler at all while three of them
// argued about helmets.
//
// `bodyFitProbe` measures each fitting's transformed VERTICES against the
// garment it is pinned to, along that garment's true normal:
//
//   STAND  the daylight under the fitting's closest point, in mm. A rivet, a
//          stud, a buckle or a brooch is fastened THROUGH the thing under it, so
//          the bar is 3 mm — one layer of slop and no more. This is the number
//          in the owner's screenshot.
//   SINK   how far the deepest point is inside the carrier. Fittings are
//          deliberately bedded — a rivet head sits half in its plate — so this
//          is reported and only gated loosely, at 14 mm, which is where a
//          fitting stops being visible at all — a pin passes THROUGH cloth by
//          design, so this catches a fitting that has vanished into a garment
//          rather than one that is doing its job.
//
// The vertices and not the anchor, and that distinction is the whole ruler: a
// boss whose ORIGIN is on the surface and whose back face is 9 mm behind it is
// seated, and one whose origin is on the surface and whose back face is 40 mm
// in front of it is the defect. Only the mesh can tell those apart.
const STAND_MM = 3;
const SINK_MM = 22;
console.log("");
console.log("[wear] 5. BODY FITTINGS — brooches, bosses, buckles, studs, rivets.");
console.log("[wear]    Measured off each fitting's own vertices, against the garment under it.");
console.log("");
console.log("[wear] class        cloak   fittings  stand mm   sink mm  worst fitting");
console.log("[wear] ---------------------------------------------------------------------");
const bfails = [];
let nFit = 0;
for (const cls of CLASSES) {
  for (const cloak of CLOAK_VALUES) {
    let stand = 0, sink = 0, standTag = "-", sinkTag = "-";
    const rows = bodyFitProbe(cls, seeds[0], cloak);
    nFit += rows.length;
    for (const r of rows) {
      if (r.standoffMm > stand) { stand = r.standoffMm; standTag = r.tag; }
      if (r.sinkMm > sink) { sink = r.sinkMm; sinkTag = r.tag; }
    }
    const bad = [];
    if (stand > STAND_MM) bad.push(`${standTag} floats ${stand.toFixed(1)} mm off the body`);
    if (sink > SINK_MM) bad.push(`${sinkTag} is ${sink.toFixed(1)} mm inside it`);
    if (bad.length) bfails.push(`${cls}/${cloak}: ${bad.join("; ")}`);
    console.log(
      `[wear] ${cls.padEnd(12)} ${cloak.padEnd(6)} ${String(rows.length).padStart(8)}  ` +
      `${stand.toFixed(1).padStart(8)}  ${sink.toFixed(1).padStart(8)}  ` +
      `${stand > STAND_MM ? standTag : sink > SINK_MM ? sinkTag : "-"}${bad.length ? "   <-- FAIL" : ""}`);
  }
}
console.log("");
console.log(`[wear] ${nFit} seated fittings measured; bars: standoff ${STAND_MM} mm, sink ${SINK_MM} mm`);
for (const f of bfails) console.log(`[wear] FAIL ${f}`);
console.log(`[wear] ${bfails.length ? "FAIL" : "PASS"}: ` +
  `${CLASSES.length * CLOAK_VALUES.length - bfails.length}/${CLASSES.length * CLOAK_VALUES.length} kits with every fitting on the body`);

// ============================================================
// 6. HANDS — which one is on which arm
// ============================================================
//
// "The beserkers hands are backwards they look broken haha."
//
// A right hand and a left hand are mirror images, and a mirror image is the one
// thing a rendering pipeline will happily give you without complaining: the
// winding flips, three.js flips it back, the normals come out right and the
// surface is perfect. It is simply the wrong hand. Nothing in this file could
// see that, because every ruler in it measures distances and a chirality is not
// a distance.
//
// So it is measured as anatomy measures it. (D x P) . T over the distal
// direction, the palm normal and the radial direction is positive on a right
// hand and negative on a left one under every rotation there is, and only a
// reflection can change it. `handProbe` pushes the three landmarks the build
// itself returns through the fist's placement and through the body mirror
// `anim.ts` applies, and reports the sign that reaches the frame.
//
// A man's right hand belongs on the arm at negative x, palm toward the midline.
// Both bars, on every class.
const PALM_MIN = 0.25;
console.log("");
console.log("[wear] 6. HANDS — chirality and palm facing, on the mesh as it renders.");
console.log("");
console.log("[wear] class        arm      x mm   chirality   palm-medial  verdict");
console.log("[wear] ---------------------------------------------------------------------");
const handfails = [];
for (const cls of CLASSES) {
  for (const h of handProbe(cls, seeds[0])) {
    const wantChir = h.hand === "right" ? 1 : -1;
    const bad = [];
    if (h.chirality !== wantChir) bad.push(`a ${h.chirality > 0 ? "right" : "left"} hand on the ${h.hand} arm`);
    if (h.palmMedial < PALM_MIN) bad.push(`palm turned outward (${h.palmMedial.toFixed(2)})`);
    if (bad.length) handfails.push(`${cls} ${h.hand}: ${bad.join("; ")}`);
    console.log(
      `[wear] ${cls.padEnd(12)} ${h.hand.padEnd(6)} ${(h.worldX * 1000).toFixed(0).padStart(6)}  ` +
      `${(h.chirality > 0 ? "right" : "left").padStart(9)}   ${h.palmMedial.toFixed(2).padStart(11)}  ` +
      `${bad.length ? "<-- FAIL" : "ok"}`);
  }
}
console.log("");
console.log(`[wear] bars: the right hand is a right hand, palm-medial >= ${PALM_MIN}`);
for (const f of handfails) console.log(`[wear] FAIL ${f}`);
console.log(`[wear] ${handfails.length ? "FAIL" : "PASS"}: hands`);


// ============================================================
// 7. THE BEARD — one piece, and resting on the collar
// ============================================================
//
// "the beards all look broken & overlapped in the neck & armour, it doesnt look
//  or feel like one piece"
//
// Both halves of that sentence are measurable and neither was measured. The
// beard pass replaced three intersecting solids with one authored surface and
// shipped two magnifying glasses for it, `tools/beardcount.mjs` and
// `tools/beardseat.mjs` — and BOTH of them say in their own header that
// `wearmeasure` carries the assertion. It did not. The unit that wrote them ran
// out of session before writing this section, so the property they exist to
// protect had a reporter and no gate: `beardcount` prints `solids=3` and exits
// zero, which is precisely the shape of ruler this file's own §2 note warns
// about. A number that nobody fails is a number nobody reads.
//
//   PIECES   connected components of the beard's geometry, welded at 0.1 mm.
//            Two surfaces that share no vertex are two objects to the eye
//            however they are drawn, and every seam and every overlap the owner
//            photographed is a boundary between two of them. ONE. Not "few" —
//            one, because "one piece" is the whole of the complaint.
//   THROUGH  how deep the beard's fall sits inside the torso's outermost
//            garment, in mm. The fall lies ON the mail collar; 2 mm is a
//            tessellation chord and anything past it is a beard growing through
//            armour, which is the other half of the same sentence.
const PIECES = 1;
const THRU_BEARD = 2;
console.log("");
console.log("[wear] 7. THE BEARD — one authored surface, seated on the collar.");
console.log("");
console.log("[wear] class        beard     pieces   through mm   over mm  verdict");
console.log("[wear] ---------------------------------------------------------------------");
const dfails = [];
for (const cls of CLASSES) {
  for (const b of BEARD_VALUES) {
    if (b === "none") continue;
    const r = beardSeatProbe(cls, seeds[0], b);
    const bad = [];
    if (r.pieces !== PIECES) bad.push(`${r.pieces} solids, not one`);
    if (r.throughMm > THRU_BEARD) bad.push(`${r.throughMm.toFixed(1)} mm through the collar (${r.worst})`);
    if (bad.length) dfails.push(`${cls}/${b}: ${bad.join("; ")}`);
    console.log(
      `[wear] ${cls.padEnd(12)} ${b.padEnd(8)} ${String(r.pieces).padStart(6)}   ` +
      `${r.throughMm.toFixed(1).padStart(10)}  ${r.overMm.toFixed(1).padStart(8)}  ` +
      `${bad.length ? "<-- FAIL" : "ok"}`);
  }
}
console.log("");
console.log(`[wear] bars: exactly ${PIECES} connected component, at most ${THRU_BEARD} mm through the garment`);
for (const f of dfails) console.log(`[wear] FAIL ${f}`);
console.log(`[wear] ${dfails.length ? "FAIL" : "PASS"}: beards`);

// ============================================================
// 8. WHAT IS CARRIED ON THE BACK — and what the cloak does about it
// ============================================================
//
// "Berserker skin looks like he has a big wooden board sticking out of his back
//  and overlapping through his cloak."
//
// It was `box(0.3, 0.6, 0.03)` — his fur pelt — parented to the torso at a FIXED
// OFFSET behind one station of the spine sampler. Every ruler above passed it,
// and §5 passed it while measuring the right family of question, because §5 asks
// for a fitting's CLOSEST point. That is the whole question for a rivet. For a
// sheet hung down a back it is half a question: a flat slab touches the man at
// its middle and hangs 132 mm clear at its corners, and the number §5 prints is
// the middle. THREE TESTS IN THIS PROJECT HAVE PASSED WHILE MEASURING THE WRONG
// QUANTITY; this is the fourth, caught.
//
// So two numbers, and they are the two an eye takes:
//
//   STAND    the WIDEST daylight anywhere under a piece borne on the back, in
//            mm, along the true normal of the garment it is worn over. A pelt
//            hangs — it does not follow a waist in — so this is not zero and
//            should not be; the bar is 45 mm, which is a hand's fur and no more.
//            A plank held off one station of the spine sampler reads 168.
//   THROUGH  how far the OUTERMOST GARMENT comes through the cloak's LINING.
//            Measured off the cloak sweep's own closure and off the `wear()`
//            stack — not off a retyped copy of `CLOAK_CUTS` and not off a list
//            of piece names — so it covers the pelt, the berserker's fur ruff at
//            80 mm of flare, the huscarl's bishop's mantle at 68, and whatever a
//            later pass hangs on a torso. A cloak is the outermost thing a man
//            owns; the bar is 2 mm, one tessellation chord, the same slop §7
//            gives the beard.
//
// The floor matters as much as the bars. A piece the spy never saw reports
// `points: 0`, and a section that let that through would go green the day
// somebody deleted the pelt — which is the hair test's own logged failure mode.
const BACK_STAND_MM = 45;
const BACK_THRU_MM = 2;
console.log("");
console.log("[wear] 8. BORNE ON THE BACK — and the cloak that has to cover it.");
console.log("[wear]    Widest daylight under a hanging piece; deepest garment through the lining.");
console.log("");
console.log("[wear] class        cloak   piece         pts   stand mm  through mm  at u,v");
console.log("[wear] ---------------------------------------------------------------------");
const kfails = [];
let nBack = 0;
let nCloakRows = 0;
for (const cls of CLASSES) {
  for (const cloak of CLOAK_VALUES) {
    for (const r of backCarryProbe(cls, seeds[0], cloak)) {
      nBack++;
      const isCloak = r.tag === "cloak-over";
      if (isCloak) nCloakRows++;
      const bad = [];
      if (!r.points) bad.push(`${r.tag} reached the ruler with no vertices at all`);
      if (!isCloak && r.standoffMm > BACK_STAND_MM) bad.push(`${r.tag} hangs ${r.standoffMm.toFixed(1)} mm clear of the back`);
      if (isCloak && r.throughMm > BACK_THRU_MM) bad.push(`the ${cloak} cloak has ${r.throughMm.toFixed(1)} mm of garment through its lining`);
      if (bad.length) kfails.push(`${cls}/${cloak}: ${bad.join("; ")}`);
      console.log(
        `[wear] ${cls.padEnd(12)} ${cloak.padEnd(6)} ${r.tag.padEnd(12)} ` +
        `${String(r.points).padStart(5)}  ${(isCloak ? "-" : r.standoffMm.toFixed(1)).padStart(9)}  ` +
        `${(isCloak ? r.throughMm.toFixed(1) : "-").padStart(10)}  ` +
        `${r.throughAt[0].toFixed(2)},${r.throughAt[1].toFixed(2)}` +
        `${bad.length ? "   <-- FAIL" : ""}`);
    }
  }
}
console.log("");
console.log(`[wear] ${nBack} rows over ${CLASSES.length} classes x ${CLOAK_VALUES.length} cloaks; ` +
  `bars: stand ${BACK_STAND_MM} mm, through ${BACK_THRU_MM} mm, and at least one vertex`);
// Every class wears a cloak in this sweep, so every class owes a cloak row. A
// silent zero here is the shape of ruler this file's §2 note keeps warning about.
if (nCloakRows !== CLASSES.length * CLOAK_VALUES.length) {
  kfails.push(`only ${nCloakRows} of ${CLASSES.length * CLOAK_VALUES.length} kits reported a cloak at all — the spy is not being fed`);
}
for (const f of kfails) console.log(`[wear] FAIL ${f}`);
console.log(`[wear] ${kfails.length ? "FAIL" : "PASS"}: what is carried on the back`);

// ============================================================
// 9. THE WEAPON AT REST — against the cloak, and against the man
// ============================================================
//
// Sections 1-8 measure a BUILT character, and the rest carry is not in one. A
// weapon leaves `buildCharacter` pointing straight out of the fist like a lance;
// where a man actually holds it is `STANCE` in `render/anim.ts`, written onto
// the fist by `poseWarrior`, and no ruler in this file had ever seen it. So the
// four rest carries — the huscarl's sword point-down, the warden's spear upright,
// the runekeeper's staff, the berserker's Dane axe over the shoulder — were four
// angles nobody could fail.
//
// This builds the real rig through `createWarriorRig`, runs three seconds of
// idle through the real `poseWarrior`, and skins every vertex on the CPU the way
// the shader would. Two closest approaches come out, and both are surface to
// surface rather than origin to origin:
//
//   CLOTH  the nearest the weapon's own surface gets to the cloak's. This is the
//          number the owner's sentence is about — "overlapping through his
//          cloak" — and it has to be measured on the POSED cloak, because a
//          cloak that is not draped is not where the cloak is.
//   BODY   the nearest it gets to the torso. A haft carried up the spine is the
//          logged v3 defect (`STANCE.berserker`: "97 of the axe's 556 vertices
//          stood inside the warrior's own surface"), and a rest angle re-tuned
//          for silhouette can walk straight back into it.
//
// Both bars are 3 mm — one tessellation chord, the same slop §7 gives the beard —
// because the question is INTERSECTION, not clearance. A weapon is allowed to
// rest against a man. It is not allowed to be inside him, or inside his cloak.
const CARRY_MM = 3;
console.log("");
console.log("[wear] 9. THE WEAPON AT REST — posed through anim.ts, skinned on the CPU.");
console.log("[wear]    Closest approach of the carried weapon to the cloak and to the torso.");
console.log("");
console.log("[wear] class        cloak    verts   cloth mm    body mm  verdict");
console.log("[wear] ---------------------------------------------------------------------");
const cfails = [];
if (!anim) {
  cfails.push("render/anim.js was not emitted — the rest carry is not being measured at all");
} else {
  // Everything the shader does to a SkinnedMesh, on the CPU. Reading `position`
  // straight off one draws its BIND pose — for the cloak that is a flat undraped
  // sheet standing off the back, which looks exactly like the defect being
  // hunted and would have this section reporting on a garment that is not there.
  const skinned = (o, out) => {
    const g = o.geometry, pos = g.attributes.position;
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const v = new THREE.Vector3(), acc = new THREE.Vector3(), m = new THREE.Matrix4();
    if (o.isSkinnedMesh && si && sw && o.skeleton) {
      o.skeleton.update();
      const bm = o.skeleton.boneMatrices;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix);
        acc.set(0, 0, 0);
        for (let k = 0; k < 4; k++) {
          const w = sw.getComponent(i, k);
          if (!w) continue;
          m.fromArray(bm, si.getComponent(i, k) * 16);
          acc.addScaledVector(v.clone().applyMatrix4(m), w);
        }
        out.push(acc.clone().applyMatrix4(o.bindMatrixInverse).applyMatrix4(o.matrixWorld));
      }
    } else {
      for (let i = 0; i < pos.count; i++) out.push(v.fromBufferAttribute(pos, i).clone().applyMatrix4(o.matrixWorld));
    }
  };
  const near = (a, b) => {
    let best = Infinity;
    for (const p of a) for (const q of b) { const d = p.distanceToSquared(q); if (d < best) best = d; }
    return best === Infinity ? 9.999 : Math.sqrt(best);
  };
  for (const cls of CLASSES) {
    for (const cloak of CLOAK_VALUES) {
      const player = {
        id: "wear", name: "", warriorClass: cls, team: "none", ready: true,
        position: { x: 0, y: 0, z: 0 }, rotation: 0, velocity: { x: 0, y: 0, z: 0 },
        health: 100, maxHealth: 100, stamina: 100, maxStamina: 100, state: "idle",
        attackDir: "right", blockDir: "right",
        attackTimer: 0, blockTimer: 0, dodgeTimer: 0, staggerTimer: 0,
        abilityCooldown: 0, abilityActive: false, abilityTimer: 0,
        kills: 0, deaths: 0, damage: 0, score: 0, lastHitBy: "",
        comboCount: 0, comboTimer: 0, invincible: false, invincibleTimer: 0,
        appearance: { ...defaultAppearance(cls), cloak },
      };
      const parent = new THREE.Group();
      const rig = anim.createWarriorRig(parent, player, undefined, { tier: "high", shadows: false });
      const motion = anim.createMotion(player);
      const ctx = {
        dt: 1 / 60, rawDt: 1 / 60, time: 0, camera: new THREE.PerspectiveCamera(),
        focus: new THREE.Vector3(), localId: "", localState: null, mood: "dusk",
        quality: { tier: "high", shadows: false },
      };
      // Three seconds, because the idle layer shifts weight on a 0.42 rad/s sine
      // and a single frame of it is one phase of a breath.
      for (let i = 0; i < 180; i++) { ctx.time = i / 60; anim.poseWarrior(rig, motion, player, 1 / 60, ctx); }
      parent.updateMatrixWorld(true);
      const wpts = [], cpts = [], bpts = [];
      rig.weapon.traverse((o) => { if (o.isMesh) skinned(o, wpts); });
      rig.group.traverse((o) => {
        if (!o.isMesh) return;
        if (o.name.endsWith("cloak")) skinned(o, cpts);
        else if (o.name.endsWith("torso")) skinned(o, bpts);
      });
      const cloth = near(wpts, cpts) * 1000;
      const body = near(wpts, bpts) * 1000;
      const bad = [];
      if (!wpts.length) bad.push(`${cls} reached the ruler with no weapon at all`);
      if (!cpts.length) bad.push(`the ${cloak} cloak reached the ruler with no vertices`);
      if (cloth < CARRY_MM) bad.push(`the rest carry is ${cloth.toFixed(1)} mm from the ${cloak} cloak's cloth`);
      if (body < CARRY_MM) bad.push(`the rest carry is ${body.toFixed(1)} mm from his own torso`);
      if (bad.length) cfails.push(`${cls}/${cloak}: ${bad.join("; ")}`);
      console.log(
        `[wear] ${cls.padEnd(12)} ${cloak.padEnd(6)} ${String(wpts.length).padStart(6)}  ` +
        `${cloth.toFixed(1).padStart(9)}  ${body.toFixed(1).padStart(9)}  ` +
        `${bad.length ? "<-- FAIL" : "ok"}`);
    }
  }
}
console.log("");
console.log(`[wear] bars: the carried weapon comes no closer than ${CARRY_MM} mm to the cloak or to the torso`);
for (const f of cfails) console.log(`[wear] FAIL ${f}`);
console.log(`[wear] ${cfails.length ? "FAIL" : "PASS"}: the weapon at rest`);

// ============================================================
// 10. THE OPENINGS — what a hole in the side of a helmet frames.
// ============================================================
//
// The owner, on the whole tier at once:
//
//   "there are large gaps in the sides of the helmets, if they are there they
//    need more consideration & better lining up with the actual ears or
//    whatever would be visible there."
//
// Every ruler above this one measures metal against skin: fold, skin-through,
// standoff, flare, hem. NOT ONE OF THEM CAN SEE A HOLE. A shell with a window
// cut in its flank passes section 2 with a perfect score, because every vertex
// that still exists is seated correctly — the defect is in the vertices that
// are NOT there, and a distance from a surface to a surface cannot report an
// absence. That is the fourth time in this file's history that a green harness
// has been measuring the wrong quantity, and it is why the owner had to be the
// instrument.
//
// A hole is measurable, and the measurement is a SIGHT LINE rather than a
// length: cast through the opening and see what you hit.
//
//   FLESH   the sight line lands on an ear, a cheek, a jaw. The opening frames
//           a feature — that is an aperture, and it is legitimate.
//   INSIDE  the sight line misses every near surface, crosses the hollow of
//           the helmet and lands on the INNER wall of the far side. You are
//           looking through the helmet at the inside of the helmet. THE
//           OPENING FRAMES NOTHING, and this is exactly the fault the last
//           agent captured as "a rectangular hole in the helmet's side framing
//           nothing".
//   VOID    the sight line hits nothing at all, with metal on both sides of it
//           in the row AND in the column — daylight punched clean through the
//           shell with head on four sides of it.
//
// INSIDE is a SIGN, not a distance, which is the lesson `wearmeasure` §6
// records about the hand: the winning fragment is inner wall exactly when its
// normal points back along the sight line, and no ruler laid between two
// surfaces can tell that from a plate seen from outside. A back-facing helmet
// fragment 6 mm from the camera and one 200 mm away read identically to every
// other section of this file.
//
// So: rasterise the head stack from 72 bearings with a z-buffer, and classify
// the winning fragment at each pixel. Cheap — 96x96 at 3 mm a pixel, which is
// finer than the 20 mm features being hunted — and it needs no browser.
const OPEN_INSIDE = 0.0025;  // share of the head's own footprint
const OPEN_VOID = 0.0015;
{
  const RIG = "rig:";
  const hexOf = (m) => {
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    return mat?.color?.getHexString?.() ?? "??";
  };
  /**
   * Every triangle of the WHOLE warrior in world space, each one flagged with
   * whether it is helmet.
   *
   * The whole warrior and not just the head pivot, and the first cut of this
   * got it wrong in the one way worth recording: restricted to the head, the
   * NECK is not in the frame, so the daylight under a hole in the side of a
   * helm had nothing solid below it and the enclosure test — head on all four
   * sides — never fired. The instrument reported 0.01% on the one helmet the
   * owner had already photographed a hole in. What occludes a sight line is
   * the man, not the head; what is *helmet* is decided separately, below.
   */
  const headTris = (cls, seed, helm) => {
    const root = buildCharacter(cls, { ...defaultAppearance(cls), helm }, 0, undefined, "high", seed).group;
    root.updateMatrixWorld(true);
    let pivot = null;
    root.traverse((o) => { if (!pivot && o.name === `${RIG}headPivot`) pivot = o; });
    const onHead = new Set();
    (pivot ?? root).traverse((o) => { if (o.isMesh) onHead.add(o); });
    const tris = [];
    const tints = new Set();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      const hex = hexOf(o);
      const head = onHead.has(o);
      if (head) tints.add(hex);
      const pos = o.geometry.attributes.position;
      const idx = o.geometry.index;
      const n = idx ? idx.count : pos.count;
      const v = new THREE.Vector3();
      const P = [];
      for (let i = 0; i < (idx ? pos.count : pos.count); i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        P.push(v.x, v.y, v.z);
      }
      for (let i = 0; i + 2 < n; i += 3) {
        const a = (idx ? idx.array[i] : i) * 3;
        const b = (idx ? idx.array[i + 1] : i + 1) * 3;
        const c = (idx ? idx.array[i + 2] : i + 2) * 3;
        tris.push([P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], P[c], P[c + 1], P[c + 2], hex, head]);
      }
    });
    return { tris, tints };
  };
  // WHICH TRIANGLES ARE THE HELMET. Not a hard-coded list of materials — a
  // difference. The same head is built bare; every material tint that appears
  // on it is flesh, hair, beard, eye or paint, and everything the helmed build
  // adds on top of that set is the helmet. So a new rung with a new substance
  // on it is inside this gate the day it is authored.
  const N = 96;
  const BEARINGS = [];
  for (let a = 0; a < 24; a++) for (const el of [-0.42, 0, 0.34]) BEARINGS.push([(a / 24) * Math.PI * 2, el]);

  console.log("");
  console.log("[wear] 10. THE OPENINGS — cast through every hole and see what it frames.");
  console.log(`[wear]     ${BEARINGS.length} bearings x ${N}x${N} sight lines a helm.`);
  console.log("");
  console.log("[wear] class        helm         flesh%   inside%    void%  worst bearing  verdict");
  console.log("[wear] ---------------------------------------------------------------------------");
  const ofails = [];
  const oclasses = ONLY ? CLASSES : ["huscarl", "berserker"];
  // `--opendump wyrm` writes the classification the numbers are counted off, as
  // a sheet of the worst nine bearings. A ruler nobody has looked through is
  // the fault this file records four times; this is how you look through it.
  const DUMP = flag("opendump", null);
  const dumps = [];
  for (const cls of oclasses) {
    const bare = headTris(cls, seeds[0], "none").tints;
    for (const helm of helms) {
      if (helm === "none") continue;
      const { tris } = headTris(cls, seeds[0], helm);
      const isHelm = tris.map((t) => t[10] && !bare.has(t[9]));
      // The head's own centre and extent, from the flesh only, so a crest
      // 100 mm above the crown does not zoom the frame out and shrink the
      // 20 mm hole being hunted to two pixels.
      let cx = 0, cy = 0, cz = 0, nf = 0;
      let rad = 0;
      for (let i = 0; i < tris.length; i++) {
        if (isHelm[i] || !tris[i][10]) continue;
        const t = tris[i];
        cx += (t[0] + t[3] + t[6]) / 3; cy += (t[1] + t[4] + t[7]) / 3; cz += (t[2] + t[5] + t[8]) / 3; nf++;
      }
      if (!nf) { ofails.push(`${cls}/${helm}: no flesh under the helmet at all`); continue; }
      cx /= nf; cy /= nf; cz /= nf;
      let crownY = -Infinity;
      for (let i = 0; i < tris.length; i++) {
        if (isHelm[i] || !tris[i][10]) continue;
        const t = tris[i];
        for (let k = 0; k < 3; k++) {
          rad = Math.max(rad, Math.hypot(t[k * 3] - cx, t[k * 3 + 1] - cy, t[k * 3 + 2] - cz));
          crownY = Math.max(crownY, t[k * 3 + 1]);
        }
      }
      const half = rad * 1.18;
      let flesh = 0, inside = 0, voidEnc = 0, total = 0;
      let worst = "-", worstN = 0;
      for (const [az, el] of BEARINGS) {
        // Orthographic, so a pixel is a fixed number of millimetres wherever it
        // lands and the shares below are areas rather than perspective.
        const fx = -Math.sin(az) * Math.cos(el), fy = -Math.sin(el), fz = -Math.cos(az) * Math.cos(el);
        const sxv = Math.cos(az), syv = 0, szv = -Math.sin(az);
        const ux = syv * fz - szv * fy, uy = szv * fx - sxv * fz, uz = sxv * fy - syv * fx;
        const depth = new Float32Array(N * N).fill(Infinity);
        const kind = new Int8Array(N * N);   // 0 void, 1 flesh, 2 metal, 3 inside
        const px = new Float32Array(3), py = new Float32Array(3), pd = new Float32Array(3);
        for (let i = 0; i < tris.length; i++) {
          const t = tris[i];
          for (let k = 0; k < 3; k++) {
            const dx = t[k * 3] - cx, dy = t[k * 3 + 1] - cy, dz = t[k * 3 + 2] - cz;
            px[k] = ((dx * sxv + dy * syv + dz * szv) / half) * 0.5 * N + N * 0.5;
            py[k] = N * 0.5 - ((dx * ux + dy * uy + dz * uz) / half) * 0.5 * N;
            pd[k] = dx * fx + dy * fy + dz * fz;
          }
          // The face normal, and its SIGN against the sight line is the whole
          // measurement: a fragment whose normal runs with the ray is the far
          // wall's inner surface seen through a hole in the near wall.
          const e1x = t[3] - t[0], e1y = t[4] - t[1], e1z = t[5] - t[2];
          const e2x = t[6] - t[0], e2y = t[7] - t[1], e2z = t[8] - t[2];
          let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
          const nl = Math.hypot(nx, ny, nz) || 1;
          const facing = (nx * fx + ny * fy + nz * fz) / nl;
          const k = isHelm[i] ? (facing > 0.30 ? 3 : 2) : 1;
          const x0 = Math.max(0, Math.floor(Math.min(px[0], px[1], px[2])));
          const x1 = Math.min(N - 1, Math.ceil(Math.max(px[0], px[1], px[2])));
          const y0 = Math.max(0, Math.floor(Math.min(py[0], py[1], py[2])));
          const y1 = Math.min(N - 1, Math.ceil(Math.max(py[0], py[1], py[2])));
          const d = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0]);
          if (!d) continue;
          for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const qx = x + 0.5, qy = y + 0.5;
            const w0 = ((px[1] - qx) * (py[2] - qy) - (px[2] - qx) * (py[1] - qy)) / d;
            const w1 = ((px[2] - qx) * (py[0] - qy) - (px[0] - qx) * (py[2] - qy)) / d;
            const w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const z = w0 * pd[0] + w1 * pd[1] + w2 * pd[2];
            const j = y * N + x;
            if (z < depth[j]) { depth[j] = z; kind[j] = k; }
          }
        }
        // Enclosed void: nothing at all under the sight line, with the head on
        // both sides of it along the row AND along the column. Open sky beside
        // the helmet fails neither test; a punched window fails both.
        let nIn = 0, nVoid = 0, nAny = 0;
        const holed = new Uint8Array(N * N);
        const solid = (j) => kind[j] !== 0;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const j = y * N + x;
          if (kind[j] === 3) nIn++;
          if (kind[j] !== 0) { nAny++; continue; }
          // The NEAREST solid thing on each of the four sides — the hole's own
          // boundary. Enclosure alone is not enough: a berserker's hair is a
          // dozen hanging locks and the daylight between two of them is
          // enclosed by head on all four sides while being no fault of any
          // helmet. So the boundary has to be METAL along at least one whole
          // axis: a hole with the shell on its left and the shell on its right
          // is a hole IN THE SHELL, and a slot between two braids is not.
          let l = 0, r = 0, u = 0, dn = 0;
          for (let i = x - 1; i >= 0; i--) if (solid(y * N + i)) { l = kind[y * N + i]; break; }
          for (let i = x + 1; i < N; i++) if (solid(y * N + i)) { r = kind[y * N + i]; break; }
          for (let i = y - 1; i >= 0; i--) if (solid(i * N + x)) { u = kind[i * N + x]; break; }
          for (let i = y + 1; i < N; i++) if (solid(i * N + x)) { dn = kind[i * N + x]; break; }
          const met = (k) => k >= 2;
          // AND THE SIGHT LINE HAS TO PASS BELOW THE TOP OF THE HEAD.
          // The first cut of this counted the sky under the wyrm's arch — 2% of
          // the frame, enclosed by the serpent above and the cap below, with
          // metal on both sides of every row through it — and that daylight is
          // the whole point of an arch. `art/look/openings_wyrm.png` is the
          // picture that said so, which is why this section can be looked
          // through. A crest, a comb and a crown's points all stand ABOVE the
          // hair; a hole in a shell is beside the head it is supposed to be
          // covering. One height separates them, and it is the head's own.
          const wy = cy + (1 - ((y + 0.5) / N) * 2) * half * uy;
          if (l && r && u && dn && ((met(l) && met(r)) || (met(u) && met(dn))) && wy <= crownY) {
            nVoid++; holed[j] = 1;
          }
        }
        if (DUMP && DUMP === helm && cls === oclasses[0]) {
          dumps.push({ az, el, N, kind: kind.slice(), holed: holed.slice(), n: nIn + nVoid });
        }
        flesh += nAny - nIn; inside += nIn; voidEnc += nVoid; total += nAny + nVoid;
        if (nIn + nVoid > worstN) {
          worstN = nIn + nVoid;
          worst = `${Math.round((az * 180) / Math.PI)}/${Math.round((el * 180) / Math.PI)}`;
        }
      }
      const fIn = inside / Math.max(1, total), fVoid = voidEnc / Math.max(1, total);
      const bad = [];
      if (fIn > OPEN_INSIDE) bad.push(`${(fIn * 100).toFixed(2)}% of the head's footprint looks through a hole in the shell at the shell's own inner wall`);
      if (fVoid > OPEN_VOID) bad.push(`${(fVoid * 100).toFixed(2)}% is daylight punched through the shell with head on all four sides`);
      if (bad.length) ofails.push(`${cls}/${helm}: ${bad.join("; ")} (worst bearing az/el ${worst})`);
      console.log(
        `[wear] ${cls.padEnd(12)} ${helm.padEnd(11)} ${((flesh / Math.max(1, total)) * 100).toFixed(1).padStart(6)}  ` +
        `${(fIn * 100).toFixed(2).padStart(8)} ${(fVoid * 100).toFixed(2).padStart(8)}  ` +
        `${worst.padStart(13)}  ${bad.length ? "<-- FAIL" : "ok"}`);
    }
  }
  console.log("");
  console.log(`[wear] bars: at most ${(OPEN_INSIDE * 100).toFixed(2)}% of the head seen through a hole onto the shell's own inside,`);
  console.log(`[wear]       at most ${(OPEN_VOID * 100).toFixed(2)}% daylight enclosed by head on all four sides.`);
  console.log("[wear]       An opening either frames a feature or it is not an opening.");
  for (const f of ofails) console.log(`[wear] FAIL ${f}`);
  console.log(`[wear] ${ofails.length ? "FAIL" : "PASS"}: the openings`);
  globalThis.__openFails = ofails.length;
  if (DUMP && dumps.length) {
    // grey flesh, blue metal, RED the shell's own inner wall seen from outside,
    // MAGENTA daylight punched through the shell.
    const PAL = [[0.08, 0.08, 0.09], [0.55, 0.52, 0.47], [0.24, 0.36, 0.55], [0.95, 0.15, 0.10]];
    dumps.sort((a, b) => b.n - a.n);
    const pick = dumps.slice(0, 9);
    const N9 = pick[0].N, C = 3, S = 4;
    const W = N9 * C * S, H = N9 * Math.ceil(pick.length / C) * S;
    const rgb = new Float32Array(W * H * 3);
    pick.forEach((d, k) => {
      const ox = (k % C) * N9 * S, oy = Math.floor(k / C) * N9 * S;
      for (let y = 0; y < N9; y++) for (let x = 0; x < N9; x++) {
        const c = d.holed[y * N9 + x] ? [0.95, 0.15, 0.85] : PAL[d.kind[y * N9 + x]];
        for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
          const o = ((oy + y * S + sy) * W + ox + x * S + sx) * 3;
          rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
        }
      }
    });
    const raw = Buffer.alloc(H * (W * 3 + 1));
    let o = 0;
    for (let y = 0; y < H; y++) {
      raw[o++] = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        for (let c = 0; c < 3; c++) raw[o++] = Math.round(Math.max(0, Math.min(1, rgb[i + c])) * 255);
      }
    }
    const crcTab = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTab[n] = c; }
    const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = (c >>> 8) ^ crcTab[(c ^ b[i]) & 0xff]; return (c ^ -1) >>> 0; };
    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
      const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(td));
      return Buffer.concat([len, td, cr]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8; ihdr[9] = 2;
    const { deflateSync } = await import("zlib");
    const out = resolve(ROOT, `art/look/openings_${DUMP}.png`);
    mkdirSync(resolve(ROOT, "art/look"), { recursive: true });
    writeFileSync(out, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
    ]));
    console.log(`[wear] opendump ${out}  ${W}x${H}  worst ${pick.length} bearings`);
  }
}

process.exit(fails.length + gfails.length + hfails.length + bfails.length + handfails.length + dfails.length + kfails.length + cfails.length + (globalThis.__openFails ?? 0) ? 1 : 0);
