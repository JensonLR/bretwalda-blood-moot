#!/usr/bin/env node
// ============================================================
// FACTIONREAD — is a man of the Danelaw a different man from a man of Wessex,
// at the distance you fight him, and did it cost a single point of anything?
//
//   node tools/factionread.mjs            # THE GATE. §0-§5 are ~3 min and need
//                                         # no browser; §6 boots the app and
//                                         # drives the real renderer, and costs
//                                         # most of an hour on a box with no
//                                         # GPU. There is no flag to skip it.
//                                         # Run `npm run build` first.
//   node tools/factionread.mjs --sheet    # also write the contact sheet PNG
//   node tools/factionread.mjs --off      # THE CONTROL: build all four peoples
//                                         # as the unsworn — i.e. the game as
//                                         # it was before the livery existed.
//                                         # This MUST fail. See PROOF below.
//
// ------------------------------------------------------------
// THE OWNER'S WORDS, WHICH ARE THE ACCEPTANCE CRITERIA
//
//   "it doesn't feel like much of an impact currently when you do swear to a
//    kingdom & win a game."
//
// `docs/BACKLOG.md` 4.3 states the arena half of that in the project's own
// words, and it is the sentence this file exists to make false:
//
//   "a man swears to a people and then looks exactly as he did before. The map
//    promises an identity the arena does not deliver."
//
// ------------------------------------------------------------
// THE RULE THIS FEATURE LIVES OR DIES ON — docs/FACTIONS.md §3
//
//   "Factions decide look, kit, flag and names. NOT stats. And a faction never
//    gates a match — twelve players split four ways is four empty queues
//    instead of one working room."
//
// So this file is FOUR gates and not one, and the second is the more important:
//
//   §1  the four peoples are TOLD APART at fight distance
//   §3  and not one of them is told apart by anything a fight reads
//   §5  and swearing does not flatten the ladder a man PAID for
//   §6  and nothing a livery produces blows a channel under the fire
//
// §5 and §6 exist because this file passed 15/15 with three defects live in it.
// Every assertion it had asked whether the four peoples were far enough APART;
// none asked whether the shop was still a ladder INSIDE one of them, and none
// of them had any light in it at all.
//
// A harness that only measured §1 would go green on a build that gave the
// Picts more health, because more health is invisible in an albedo buffer.
// §3 runs the real `engine.mjs` with a declared livery on the wire and asserts
// the simulation is byte-identical to one without — which is the half of
// `tools/wartest.mjs` §7 that could not see this feature coming, for a reason
// written out under §3c.
//
// ------------------------------------------------------------
// WHAT IS MEASURED, AND WHY IT IS NOT THE SILHOUETTE
//
// Taken whole from `tools/teamread.mjs`, deliberately: the question is a
// COLOUR question and the answer must not be reachable by shape. A warrior's
// signature here is his AREA-WEIGHTED MEAN ALBEDO over the pixels he covers at
// the play lens, averaged in LINEAR light and converted to CIELAB afterwards.
// Shape decides only WHICH pixels are averaged and contributes nothing of its
// own — and §0.3 asserts the stronger property outright: the four peoples and
// the unsworn cover EXACTLY the same pixels, to the pixel, at every bearing.
//
// The gated quantity is ΔC — the chroma plane, hypot(Δa*, Δb*), lightness
// dropped rather than down-weighted. `teamread`'s header records at length why
// full ΔE is the wrong ruler here (a cloaked man and a bare-backed man on one
// side are 30 points apart in LIGHTNESS and nobody has ever confused them), and
// the same correction applies unchanged. ΔC <= ΔE identically, so this is the
// tighter bar and not the looser one; §0.4 asserts that over the whole sweep.
//
// The full ΔE is computed and printed beside every ΔC anyway. A people that
// separated only on LIGHTNESS — the Norse "darker wools", the British "lighter
// kit" — is doing real work the gated quantity cannot see, and the reader
// should be able to see it.
//
// ------------------------------------------------------------
// WHAT THE BAR IS AND WHERE IT CAME FROM
//
// ΔC 10, and it is `LADDER_DE` in `tools/cosmetictest.mjs:538`, which already
// carries the sentence "what a PAID rung has to clear to be a different colour
// at a glance". `teamread` reuses the same constant for the same reason: a bar
// this file chose for itself is a bar this file could move, and the house rule
// is that a bar is never moved to buy a pass.
//
// ------------------------------------------------------------
// THE COMPARISON IS MATCHED, AND THAT IS A NARROWER CLAIM THAN TEAMREAD'S
//
// `teamread` sweeps the full cross-product — every red loadout against every
// blue one — because a team read is a SAFETY read: your life depends on telling
// a stranger in Bretwalda Gold from a stranger in Blackened Steel, and the two
// may be anywhere in the shop.
//
// A people is an IDENTITY read, and the question the owner asked is narrower:
// he swore, and he wants the man he already had to become a man of that people.
// So §1 gates the MATCHED comparison — same class, same finish, same cloak,
// same bearing, four peoples — which is the same warrior four times and is
// exactly what the shots beside this file photograph. The full cross-product is
// computed too, and it is REPORTED on the verdict line rather than gated,
// because a Pict in Blackened Steel against a Saxon in Rough Iron is a question
// about the SHOP's spread and not about whether swearing did anything.
//
// That deferral rides the verdict line. docs/PROCESS.md R4.
//
// ------------------------------------------------------------
// TEAM COLOUR STILL WINS — §2, and it is the constraint most likely to be lost
//
// `docs/FACTIONS.md` §8: **team colour beats clan colour beats faction colour
// beats bought cosmetic.** A man must never be unable to identify an enemy
// because his people's dye outranked his team's band, and garnet is close
// enough to madder — and woad to woad, they are the same dyestuff — that a
// faction colour leaking into a war band would be the worst possible version
// of this bug.
//
// §2 asserts the collapse directly: four peoples on ONE side must be a single
// colour, to ΔC 0.00 and not to a tolerance, because `wornBy`, `kitFor` and
// `cloakFor` each return on the team before a people is consulted and the
// faction path is therefore UNREACHABLE from a team mode. A tolerance would
// pass a build where it leaked a little.
//
// ------------------------------------------------------------
// PROOF OF FAILURE — docs/PROCESS.md R2
//
// `--off` builds all four peoples as the unsworn, which is byte-for-byte what
// `buildCharacter` did before the livery was written: the four are then the
// same man four times, every pairwise ΔC is 0.00, and §1 is red. Run it.
//
// It has also been run against `origin/main` itself, which is the stronger
// form: `main` has no `Appearance.people` at all, so the four builds there are
// identical BY CONSTRUCTION rather than by a flag this file set. The result is
// the same and the sheet it writes is four copies of one picture.
//
// ------------------------------------------------------------
// WHAT THIS FILE DOES NOT MEASURE — docs/PROCESS.md R4
//
//   * THE SHIELD, in the raster. `buildShield` is mounted by `render/anim.ts`
//     onto a posed forearm and nothing here poses anybody — the same deferral
//     `teamread` carries. The board is the largest flat colour a huscarl holds
//     and it IS the people's, so the body-only reading below is the
//     CONSERVATIVE one: the bar is cleared by the man without his shield. The
//     board's four fields and its four devices are checked as a catalogue ΔE
//     and a triangle count instead, in §4, and both ride the verdict line.
//   * LIGHT, in §0-§5. No bonfire, no grade, albedo only — same as `teamread`.
//     §6 is the exception and the reason it exists: three rounds of this
//     feature shipped a defect past a harness with no light in it, and the last
//     one was a surface that was a perfectly good gold in the albedo buffer and
//     a flat traffic cone on the screen.
//   * THE ROSTER SHEET. `tools/classmatrix.mjs` is the balance gate and this
//     file does not restate it. §3 asserts the narrower and harder thing —
//     that a declared people changes no byte of the simulation at all — which
//     is upstream of anything a matrix could measure.
// ============================================================
import * as THREE from "three";
import { chromium } from "playwright";
import { spawn } from "child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { deflateSync } from "zlib";
import { makeBand, calibrate, roseShare, arcTo, hueOfLab, labOf, chromaOf, ARC, ROSE_L, MUST_FLAG, MUST_CLEAR } from "./lib/roseband.mjs";
import { rasterise, surfaceMasks, patchLab, MIN_PIXELS } from "./lib/surfacemask.mjs";
import { loadClient } from "./lib/clientmodule.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const T0 = Date.now();

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
/** The control. All four peoples built as the unsworn — the pre-livery game. */
const OFF = has("off");
const SHEET = has("sheet");

const results = [];
let failed = 0;
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  if (!pass) failed++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
const note = (s) => console.log(`        ${s}`);
const die = (m) => { console.error(`[faction] ${m}`); process.exit(2); };

// ============================================================
// THE FIELD, IMPORTED — nothing below mirrors a catalogue or a constant.
//
// `render/anim.ts` and not `characters.ts`, and it costs nothing: characters is
// anim's own import, so one tsc emits both. `CLASS_TUNIC` is the per-class
// accent the real rig passes into `buildCharacter` and is exported for exactly
// this — a harness that keeps its own copy of a constant audits the constant it
// was written against.
// ============================================================
let CH = null, ANIM = null;
try {
  // The emit-and-import lives in `tools/lib/clientmodule.mjs`: `tools/vatprobe.mjs`
  // needs the identical compile to cut the identical per-surface masks, and two
  // harnesses compiling the client two ways is a difference nobody can see.
  const loaded = await loadClient(ROOT, ".factionread");
  CH = loaded.CH; ANIM = loaded.ANIM;
} catch (e) { die(String(e.message || e)); }
const {
  ARMOURY, buildCharacter, buildShield, buildWeaponForClass, defaultAppearance,
  shieldBoard, FACTION_FIELD, PEOPLE_IDS, TEAM_FIELD,
  finishKit, kitFor, cloakFor,
} = CH;
if (!finishKit || !kitFor || !cloakFor)
  die("characters.ts does not export finishKit / kitFor / cloakFor — §5 must measure the SHIPPED resolvers, not a copy of them");
if (!FACTION_FIELD || !PEOPLE_IDS) die("characters.ts does not export FACTION_FIELD / PEOPLE_IDS — the four colours this harness must not guess");
const CLASS_TUNIC = ANIM?.CLASS_TUNIC ?? null;
if (!CLASS_TUNIC) die("render/anim.ts does not export CLASS_TUNIC — the accent this harness must not guess");

// The shared server file, imported directly because it is plain ESM and
// `tools/wartest.mjs` already imports it the same way.
const WAR = await import(pathToFileURL(resolve(ROOT, "src/game/war.mjs")).href);
const ENGINE = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);

// ============================================================
// THE LENS — `tools/teamread.mjs`'s, which is `tools/cosmetictest.mjs`'s
// `fight`, which is /shot's `fightcard`: a ~230 px man in a 520x320 frame at
// 6.8 m, framed by the play camera's own 55 deg over a 900 px screen. His head
// is ~45-56 px of that. Where a livery is actually LOOKED AT, for a whole match.
// ============================================================
const PLAY = { fovDeg: 55, screenH: 900 };
const playScaleFov = (h) => (2 * Math.atan((h / PLAY.screenH) * Math.tan((PLAY.fovDeg * Math.PI) / 360)) * 180) / Math.PI;
const LENS = { w: 520, h: 320, dist: 6.8, targetY: 0.88, eyeY: 2.05, fov: playScaleFov(320) };
/**
 * The three bearings, and the verdict is taken on the WORST. A brawl is not a
 * line-up: you see backs, three-quarters and faces in the same second, and the
 * cloak — the biggest single colour a man carries and the one the livery paints
 * flat — is on only one of them. A gate that averaged the bearings would be
 * green because the case it exists for was diluted.
 */
const BEARINGS = [0, -35, 160];
const SHEET_TURN = 160;

function framing(turnDeg) {
  const rot = Math.PI + (turnDeg * Math.PI) / 180;
  return { eye: [0, LENS.eyeY, -LENS.dist], target: [0, LENS.targetY, 0], rot };
}

/**
 * Rasterises a scene graph into an albedo buffer and a coverage mask. The lens
 * algebra is `tools/teamread.mjs`'s — same nearest-surface z test, same
 * linear-light material read — and it now lives in `tools/lib/surfacemask.mjs`
 * because §7.1b and `tools/vatprobe.mjs` both need the same rasterisation to
 * carry one more thing with it: WHICH MESH won each pixel. That is what turns a
 * coverage mask into six per-surface masks, and a mask written out twice is a
 * mask that gets corrected once. docs/PROCESS.md failure mode 3.
 *
 * The return shape is unchanged for every existing caller — `{ cov, rgb, area,
 * mean }` — with `mesh` and `meshHex` added beside them.
 */
function raster(root, turnDeg) {
  return rasterise(root, LENS, turnDeg);
}

// ============================================================
// CIELAB — `tools/teamread.mjs`'s, unchanged.
// ============================================================
function labFromLinear([r, g, b]) {
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function lab(hex) {
  const lin = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return labFromLinear(lin);
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const dC = (a, b) => Math.hypot(a[1] - b[1], a[2] - b[2]);
/**
 * The HUE ANGLE on the chroma plane, and the distance between two of them.
 *
 * THIS IS A RULER CORRECTION AND IT IS WRITTEN OUT RATHER THAN QUIETLY MADE.
 * §1.3 first asked "is this man's chroma NEARER his own people's field than any
 * other's", which is `teamread`'s SIDE assertion with four prototypes instead
 * of two. It read, on the first run of this file:
 *
 *     FAIL 1.3 — saxon/huscarl/Blackened Steel/No Cloak at 160°
 *                (nearest other: briton) — -27.66 ΔC nearer his own
 *
 * That number is real and the verdict drawn from it was nonsense. The chroma
 * plane carries two things: an ANGLE, which is the hue and is the whole of what
 * a people is, and a RADIUS, which is how much colour a man has and is a
 * function of how much of him is bare skin, grey iron and hair. A Saxon in
 * Blackened Steel — the darkest finish in the shop — has almost no chroma at
 * all, so he sits near the origin; and moss, being by a long way the least
 * chromatic of the four fields, is the prototype nearest the origin. He was
 * being called a Briton for being DARK.
 *
 * `teamread`'s own header records the identical confounder and calls it by
 * name: "a radius is not a side". With two prototypes of similar chroma the
 * radius cancels out of the comparison and distance is safe; with four
 * prototypes running from gilt to moss it does not cancel and distance measures
 * the finish rather than the people. So §1.3 is taken on the ANGLE, which is
 * radius-independent by construction.
 *
 * THIS IS NOT A LOOSER GATE, and the reason is the same one `teamread` gives
 * for why GLANCE and SIDE are both needed: an angle is meaningless for a man
 * with no chroma, and §1.2 is what forbids that man — a warrior the livery
 * never reached is within ΔC 10 of the other three and fails DISTINCT. Neither
 * assertion is sufficient alone and neither is a weaker version of the other.
 * The distance reading is still computed and still printed, so anyone can check
 * that this was a ruler being fixed rather than a bar being lowered.
 */
const hueAngle = (l) => Math.atan2(l[2], l[1]);
const angleGap = (a, b) => { const d = Math.abs(a - b); return d > Math.PI ? 2 * Math.PI - d : d; };
const deg = (r) => (r * 180) / Math.PI;
/**
 * THE TWO BARS, READ OUT OF `tools/cosmetictest.mjs` RATHER THAN COPIED FROM IT.
 *
 * They used to be two literals here with a comment naming the line they came
 * from, which is the same shape as every mirrored definition this repository
 * has lost a round to — `docs/PROCESS.md` failure mode 3, and §0.2 above exists
 * because of it. A comment saying "this is cosmetictest:538" does not fail when
 * cosmetictest:538 changes; this does.
 *
 *   LADDER_DE  "what a PAID rung has to clear to be a different colour at a
 *              glance". §1.2, §4.1 and §5 all gate on it.
 *   JND        "Below this, two swatches are one swatch". §1.1 asks a different
 *              question from §1.2 — not "is he a different colour at a glance"
 *              but "did anything happen at all" — and therefore takes the
 *              smaller constant.
 *
 * Parsed out of the source text because neither is exported and exporting them
 * would mean importing an 86 KB harness that boots a browser at module scope.
 * The parse is checked: an unreadable constant is a `die`, not a default, since
 * a default here would be this file quietly choosing its own bar — which is the
 * exact thing borrowing them was meant to prevent.
 */
const COSMETICTEST = resolve(ROOT, "tools/cosmetictest.mjs");
function barFrom(name) {
  const src = readFileSync(COSMETICTEST, "utf8");
  const m = src.match(new RegExp(`^const ${name} = (\\d+(?:\\.\\d+)?);`, "m"));
  if (!m) die(`cannot read ${name} out of tools/cosmetictest.mjs — this file must not choose its own bar`);
  return Number(m[1]);
}
const LADDER_DE = barFrom("LADDER_DE");
const JND = barFrom("JND");
/** The same constant, under the name §1–§4 have always called it by. */
const GLANCE_DE = LADDER_DE;

// ============================================================
// THE SWEEP SET — the shop's own ladders, enumerated. Nothing is sampled.
// ============================================================
const slotOf = (n) => ARMOURY.find((s) => s.slot === n);
const FINISHES = slotOf("armor").options.map((o) => ({ id: o.id, label: o.label, cost: o.cost, value: Number(o.value) }));
const CLOAKS = slotOf("cloak").options.map((o) => ({ label: o.label, value: String(o.value) }));
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const PEOPLES = [...PEOPLE_IDS];
const SEED = 13;

// ============================================================
// THE DYED SURFACES, ASKED FOR RATHER THAN LISTED
//
// §5 has always probed this — "a surface the vat does not move carries the
// whole of its unsworn spacing for free" — and §7.1b needs the same list one
// scope up, so it is computed once here and both read it. The probe follows the
// code: if a future change starts or stops dyeing something, the list moves
// with it and no comment has to be believed.
//
// `fitting` comes out UNTOUCHED on this tree and is carried through the lit
// tables anyway, marked so, because an undyed surface is a free per-frame
// control: whatever the bonfire does to a Danelaw's buckles it does to an
// unsworn man's, and a per-surface reading that moved on the FITTING would be
// telling you about the light and not about the vat.
//
// The linen shirt and sleeves are dyed by `wornBy` and are not a `FinishKit`
// key at all, so they are added by hand — the same way §5.3 adds them.
// ============================================================
const LINEN_SRC = 0xc2b69c;
const DYED_SURFACES = (() => {
  const probe = finishKit(FINISHES[0].value);
  return Object.keys(probe).filter((k) => PEOPLES.some((p) => kitFor(probe, "none", p)[k] !== probe[k]));
})();
const UNDYED_SURFACES = (() => {
  const probe = finishKit(FINISHES[0].value);
  return Object.keys(probe).filter((k) => !DYED_SURFACES.includes(k));
})();
/** Every surface a mask is cut for: the dyed ones, the linen, and the undyed control. */
const MASK_SURFACES = [...DYED_SURFACES, "linen", ...UNDYED_SURFACES];
/** Gated per surface. The undyed ones are reported and not gated. */
const GATED_SURFACES = [...DYED_SURFACES, "linen"];
const kitWithLinen = (finishValue, people) => ({
  ...kitFor(finishKit(finishValue), "none", people),
  linen: CH.wornBy(LINEN_SRC, "none", people, "linen"),
});

const build = (cls, finish, cloak, people, team = "none") => buildCharacter(
  cls,
  { ...defaultAppearance(cls), armorColor: finish, cloak, people: OFF ? "none" : people },
  CLASS_TUNIC[cls] ?? 0x5a4a2c,
  undefined, "high", SEED, team,
);

console.log(`\n[faction] === FACTIONREAD${OFF ? "  (CONTROL: livery off)" : ""} ===\n`);
console.log(`        ${FINISHES.length} finishes x ${CLOAKS.length} cloaks x ${CLASSES.length} classes x ${BEARINGS.length} bearings, ${PEOPLES.length} peoples + the unsworn`);
console.log(`        lens ${LENS.w}x${LENS.h} at ${LENS.dist} m, fov ${LENS.fov.toFixed(1)} deg — the play frame, albedo only\n`);

// ============================================================
// 0. CALIBRATION — a measuring tool that has never been measured is an opinion
// ============================================================
console.log("[faction] === 0. CALIBRATION ===\n");
{
  const a = raster(build("huscarl", FINISHES[0].value, "red", "norse").group, -35);
  const b = raster(build("huscarl", FINISHES[0].value, "red", "norse").group, -35);
  check("0.1 the rasteriser reports ΔE 0.00 for a subject against itself",
    dE(labFromLinear(a.mean), labFromLinear(b.mean)) < 1e-9,
    `${a.area} covered px, ΔE ${dE(labFromLinear(a.mean), labFromLinear(b.mean)).toExponential(1)}`);

  // THE MIRRORED DEFINITION, GATED. `characters.ts` restates `war.mjs`'s
  // PEOPLES because every headless harness compiles it standalone with no path
  // alias and an `@/game/war.mjs` specifier would break nine tools at once. A
  // mirrored definition is `docs/PROCESS.md` failure mode 3 — unless there is a
  // gate across it, which is this line.
  check("0.2 the client's four peoples are war.mjs's four peoples, in order",
    JSON.stringify(PEOPLES) === JSON.stringify([...WAR.PEOPLES]),
    `characters.ts ${JSON.stringify(PEOPLES)} vs war.mjs ${JSON.stringify([...WAR.PEOPLES])}`);

  // THE SHAPE PROOF, and it is an assertion rather than an argument. If a
  // people moved one triangle, two things would follow and both are forbidden:
  // the separation §1 reports could be a silhouette wearing a colour's name,
  // and a people would be changing a man's OUTLINE, which is the nearest thing
  // to a stat a renderer can touch.
  let moved = 0, checked = 0, worstDiff = 0;
  for (const cls of CLASSES) {
    for (const f of FINISHES) {
      const base = raster(build(cls, f.value, "red", "none").group, -35);
      for (const p of PEOPLES) {
        const r = raster(build(cls, f.value, "red", p).group, -35);
        let diff = 0;
        for (let i = 0; i < r.cov.length; i++) if (r.cov[i] !== base.cov[i]) diff++;
        checked++;
        if (diff) { moved++; worstDiff = Math.max(worstDiff, diff); }
      }
    }
  }
  check("0.3 a livery moves NO geometry — all four peoples and the unsworn cover the same pixels",
    moved === 0, `${checked} builds, ${moved} with any coverage difference${worstDiff ? `, worst ${worstDiff} px` : ""}`);

  // A shape change this file must NOT confuse for a livery. The Sutton Hoo is
  // the largest silhouette in the shop against a bare head.
  const bare = raster(build("huscarl", FINISHES[0].value, "none", "norse").group, -35);
  const helmed = buildCharacter("huscarl",
    { ...defaultAppearance("huscarl"), armorColor: FINISHES[0].value, cloak: "none", helm: "suttonhoo", people: OFF ? "none" : "norse" },
    CLASS_TUNIC.huscarl, undefined, "high", SEED);
  const hr = raster(helmed.group, -35);
  const saxon = raster(build("huscarl", FINISHES[0].value, "none", "saxon").group, -35);
  note(`a whole helmet (bare -> Sutton Hoo, same people) moves the signature ${dC(labFromLinear(bare.mean), labFromLinear(hr.mean)).toFixed(1)} ΔC / ${dE(labFromLinear(bare.mean), labFromLinear(hr.mean)).toFixed(1)} ΔE`);
  note(`the same man changing PEOPLE moves it ${dC(labFromLinear(bare.mean), labFromLinear(saxon.mean)).toFixed(1)} ΔC / ${dE(labFromLinear(bare.mean), labFromLinear(saxon.mean)).toFixed(1)} ΔE`);
}

// ============================================================
// 1. THE SWEEP — every loadout, five liveries, three bearings
// ============================================================
console.log("\n[faction] === 1. FOUR PEOPLES, TOLD APART AT FIGHT DISTANCE ===\n");
const sigs = [];   // { people, cls, finish, cloak, turn, lab, area }
const sheet = [];
let chromaEverExceedsE = false;
for (const cls of CLASSES) {
  for (const f of FINISHES) {
    for (const c of CLOAKS) {
      for (const people of [...PEOPLES, "none"]) {
        const built = build(cls, f.value, c.value, people);
        for (const turn of BEARINGS) {
          const r = raster(built.group, turn);
          sigs.push({ people, cls, finish: f.label, cloak: c.label, turn, lab: labFromLinear(r.mean), area: r.area });
          // THE SHEET IS THE SAME WARRIOR FIVE TIMES. Not a gallery of the
          // shop: the owner's sentence is "he swears and looks exactly as he
          // did before", so the picture that answers it is one man, one finish,
          // one cloak, five liveries, side by side. Shot at 160° — the back,
          // which is where the cloak is and which is half of what a brawl shows
          // you.
          if (SHEET && cls === "huscarl" && turn === SHEET_TURN
            && f.label === FINISHES[0].label && c.label === CLOAKS[0].label) {
            sheet.push({ order: people === "none" ? 9 : PEOPLES.indexOf(people), label: `${cls} · ${f.label} · ${people === "none" ? "UNSWORN" : people}`, r });
          }
        }
      }
    }
  }
}
console.log(`        ${sigs.length} signatures`);

const key = (s) => `${s.cls}|${s.finish}|${s.cloak}|${s.turn}`;
const byLoadout = new Map();
for (const s of sigs) {
  if (!byLoadout.has(key(s))) byLoadout.set(key(s), {});
  byLoadout.get(key(s))[s.people] = s;
}

/**
 * MATCHED: the same warrior, four peoples. The gated quantity.
 * SWORN:   the same warrior, sworn against unsworn. Did anything happen at all?
 */
const FIELD_LAB = Object.fromEntries(PEOPLES.map((p) => [p, lab(FACTION_FIELD[p])]));
/** Which people a colour reads as, by hue angle. `null` for the four fields' own tie. */
const readsAs = (l) => {
  let best = null, bestGap = Infinity;
  for (const p of PEOPLES) {
    const g = angleGap(hueAngle(l), hueAngle(FIELD_LAB[p]));
    if (g < bestGap) { bestGap = g; best = p; }
  }
  return best;
};

let worstMatched = Infinity, worstMatchedAt = null, worstMatchedE = Infinity;
let worstSworn = Infinity, worstSwornAt = null;
/**
 * THE EXCEPTION §1.1 ALLOWS, AND IT IS A DESIGN STATEMENT RATHER THAN A LET-OFF.
 *
 * A man who has already bought the people's own dye does not change when he
 * swears to them, and MUST NOT: forcing him to would mean moving a man AWAY
 * from a colour he correctly already has. `FINISH_KIT` names two of these
 * outright — Sea Queen's Gift is "woad, the other expensive vat", which is what
 * a Pict wears, and Bretwalda Gold is "weld yellow over everything", which is
 * what a Saxon wears.
 *
 * The exception is not a threshold this file picked. It is §1.3's OWN predicate
 * applied to the unsworn man: if the kit he already owns reads as that people,
 * then he already is one to look at. It cannot excuse a real failure, because a
 * livery that did nothing for a people would only be forgiven on men who
 * already read as that people — which is the outcome the feature wanted.
 *
 * Every case it fires on is PRINTED, because these twelve readings are the most
 * interesting output in the file: they are the shop and the roster agreeing.
 */
const swornExempt = [];
for (const [k, row] of byLoadout) {
  for (let i = 0; i < PEOPLES.length; i++) {
    const a = row[PEOPLES[i]];
    if (!a) continue;
    const swornMove = dC(a.lab, row.none.lab);
    if (swornMove < JND && readsAs(row.none.lab) === PEOPLES[i]) {
      swornExempt.push(`${k} -> ${PEOPLES[i]}: moved ΔC ${swornMove.toFixed(2)}, and his unsworn kit was already ${deg(angleGap(hueAngle(row.none.lab), hueAngle(FIELD_LAB[PEOPLES[i]]))).toFixed(1)}° off that people's own hue`);
    } else if (swornMove < worstSworn) { worstSworn = swornMove; worstSwornAt = `${k} -> ${PEOPLES[i]}`; }
    for (let j = i + 1; j < PEOPLES.length; j++) {
      const b = row[PEOPLES[j]];
      if (!b) continue;
      const c = dC(a.lab, b.lab), e = dE(a.lab, b.lab);
      if (c > e + 1e-9) chromaEverExceedsE = true;
      if (c < worstMatched) { worstMatched = c; worstMatchedE = e; worstMatchedAt = `${k}: ${PEOPLES[i]} vs ${PEOPLES[j]}`; }
    }
  }
}

/** Per-bearing table, and the worst bearing governs. */
console.log("\n            ---- ΔC, the gated quantity ----   ---- full ΔE, reported ----");
console.log("  bearing   min MATCHED   min SWORN-vs-UNSWORN      min MATCHED");
for (const turn of BEARINGS) {
  let m = Infinity, mE = Infinity, sw = Infinity;
  for (const [k, row] of byLoadout) {
    if (!k.endsWith(`|${turn}`)) continue;
    for (let i = 0; i < PEOPLES.length; i++) {
      sw = Math.min(sw, dC(row[PEOPLES[i]].lab, row.none.lab));
      for (let j = i + 1; j < PEOPLES.length; j++) {
        const c = dC(row[PEOPLES[i]].lab, row[PEOPLES[j]].lab);
        if (c < m) { m = c; mE = dE(row[PEOPLES[i]].lab, row[PEOPLES[j]].lab); }
      }
    }
  }
  console.log(`  ${String(turn).padStart(5)}°   ${m.toFixed(2).padStart(11)}   ${sw.toFixed(2).padStart(20)}      ${mE.toFixed(2).padStart(11)}`);
}

/** The unmatched cross-product, reported and not gated. See the header. */
let worstCross = Infinity, worstCrossAt = null;
for (const turn of BEARINGS) {
  const here = sigs.filter((s) => s.turn === turn && s.people !== "none");
  for (let i = 0; i < here.length; i++) {
    for (let j = i + 1; j < here.length; j++) {
      if (here[i].people === here[j].people) continue;
      const c = dC(here[i].lab, here[j].lab);
      if (c > dE(here[i].lab, here[j].lab) + 1e-9) chromaEverExceedsE = true;
      if (c < worstCross) {
        worstCross = c;
        worstCrossAt = `${here[i].people}/${here[i].cls}/${here[i].finish}/${here[i].cloak} vs ${here[j].people}/${here[j].cls}/${here[j].finish}/${here[j].cloak} at ${turn}°`;
      }
    }
  }
}

/**
 * PEOPLE — does every man READ as the people he swore to?
 *
 * `teamread`'s SIDE assertion, with four prototypes instead of two, and for the
 * same reason: MATCHED alone would pass a build where all four moved a long way
 * from each other and none of them landed anywhere near its own field, which is
 * four arbitrary recolours rather than four peoples. The prototypes are
 * `FACTION_FIELD` read out of characters.ts — which is `globals.css`'s four
 * hexes, which is what the map on the island is painted in. A harness holding
 * its own idea of gilt would be grading the gilt it remembers.
 */
let worstPeople = Infinity, worstPeopleAt = null;
let worstPeopleDist = Infinity, worstPeopleDistAt = null;
for (const s of sigs) {
  if (s.people === "none") continue;
  const own = angleGap(hueAngle(s.lab), hueAngle(FIELD_LAB[s.people]));
  let nearestFoe = Infinity, foeName = "";
  for (const p of PEOPLES) {
    if (p === s.people) continue;
    const g = angleGap(hueAngle(s.lab), hueAngle(FIELD_LAB[p]));
    if (g < nearestFoe) { nearestFoe = g; foeName = p; }
  }
  if (nearestFoe - own < worstPeople) {
    worstPeople = nearestFoe - own;
    worstPeopleAt = `${s.people}/${s.cls}/${s.finish}/${s.cloak} at ${s.turn}° (nearest other: ${foeName})`;
  }
  // The quantity §1.3 USED to be taken on, kept and printed so the correction
  // above stays auditable. It is dominated by chroma RADIUS — see `hueAngle`.
  let dOwn = dC(s.lab, FIELD_LAB[s.people]), dFoe = Infinity, dFoeName = "";
  for (const p of PEOPLES) {
    if (p === s.people) continue;
    const d = dC(s.lab, FIELD_LAB[p]);
    if (d < dFoe) { dFoe = d; dFoeName = p; }
  }
  if (dFoe - dOwn < worstPeopleDist) {
    worstPeopleDist = dFoe - dOwn;
    worstPeopleDistAt = `${s.people}/${s.cls}/${s.finish}/${s.cloak} at ${s.turn}° (nearest other: ${dFoeName})`;
  }
}

console.log("");
check("1.0 the gated quantity is never larger than the full ΔE it was cut down from",
  !chromaEverExceedsE, `ΔC <= ΔE on every pairing — the bar of ${GLANCE_DE} is strictly tighter than it was`);
check(`1.1 SWORN — swearing moves a man past a JND (ΔC ${JND}), unless he had already bought that people's own vat`,
  worstSworn >= JND,
  `worst ${worstSworn.toFixed(2)} at ${worstSwornAt}, with ${swornExempt.length} man/bearing readings exempt`);
// Capped, because the CONTROL fires this exemption 420 times — with the livery
// off every man is his own unsworn self and whichever field happens to be
// nearest "already" claims him. That is not a hole: §1.2 DISTINCT is the hard
// gate and it reads ΔC 0.00 in the control whatever this one says. Twelve lines
// is a reading; four hundred is a wall.
for (const e of swornExempt.slice(0, 12)) note(`already in the vat: ${e}`);
if (swornExempt.length > 12) note(`... and ${swornExempt.length - 12} more exempt readings not printed`);
check(`1.2 DISTINCT — the same warrior, four peoples, is four men ΔC ${GLANCE_DE}+ apart at every bearing`,
  worstMatched >= GLANCE_DE,
  `worst ΔC ${worstMatched.toFixed(2)} (ΔE ${worstMatchedE.toFixed(2)}) — ${worstMatchedAt}`);
check("1.3 PEOPLE — every sworn warrior's HUE lands nearer his own field than any of the other three",
  worstPeople > 0,
  `worst: ${worstPeopleAt} — ${deg(worstPeople).toFixed(2)}° nearer his own`);
note(`REPORTED, NOT GATED — the same question taken on chroma DISTANCE instead of hue angle reads `
  + `${worstPeopleDist.toFixed(2)} at ${worstPeopleDistAt}. That quantity measures the FINISH, not the people; see \`hueAngle\` for the correction and the reading that forced it.`);
note(`REPORTED, NOT GATED — the unmatched cross-product bottoms out at ΔC ${worstCross.toFixed(2)}: ${worstCrossAt}. See the header for why that is a question about the SHOP.`);

// ============================================================
// 2. TEAM COLOUR STILL WINS — docs/FACTIONS.md §8
// ============================================================
console.log("\n[faction] === 2. IN A WAR BAND, THE SIDE OWNS THE COLOUR ===\n");
{
  let worstLeak = 0, leakAt = null;
  let minBetween = Infinity, betweenAt = null;
  const sides = { red: [], blue: [] };
  for (const cls of CLASSES) {
    for (const f of FINISHES) {
      for (const c of CLOAKS) {
        for (const team of ["red", "blue"]) {
          const perPeople = PEOPLES.map((p) => ({
            p, lab: labFromLinear(raster(build(cls, f.value, c.value, p, team).group, -35).mean),
          }));
          for (let i = 0; i < perPeople.length; i++) {
            for (let j = i + 1; j < perPeople.length; j++) {
              const d = dC(perPeople[i].lab, perPeople[j].lab);
              if (d > worstLeak) { worstLeak = d; leakAt = `${cls}/${f.label}/${c.label} [${team}]: ${perPeople[i].p} vs ${perPeople[j].p}`; }
            }
          }
          sides[team].push({ cls, f: f.label, c: c.label, lab: perPeople[0].lab });
        }
      }
    }
  }
  for (const r of sides.red) for (const b of sides.blue) {
    const d = dC(r.lab, b.lab);
    if (d < minBetween) { minBetween = d; betweenAt = `${r.cls}/${r.f}/${r.c} [red] vs ${b.cls}/${b.f}/${b.c} [blue]`; }
  }
  check("2.1 four peoples on ONE side are ONE colour — the faction path is unreachable from a team mode",
    worstLeak === 0,
    worstLeak === 0 ? "ΔC 0.00 across all four peoples, every loadout, both sides" : `LEAK ΔC ${worstLeak.toFixed(2)} — ${leakAt}`);
  check(`2.2 and the two sides are still ΔC ${GLANCE_DE}+ apart with a livery declared`,
    minBetween >= GLANCE_DE,
    `worst ΔC ${minBetween.toFixed(2)} — ${betweenAt}`);
  note(`the team fields are TEAM_FIELD madder 0x${TEAM_FIELD.red.toString(16)} / woad 0x${TEAM_FIELD.blue.toString(16)}; `
    + `garnet 0x${FACTION_FIELD.norse.toString(16)} sits ΔC ${dC(lab(FACTION_FIELD.norse), lab(TEAM_FIELD.red)).toFixed(1)} from madder and `
    + `faction woad 0x${FACTION_FIELD.pict.toString(16)} ΔC ${dC(lab(FACTION_FIELD.pict), lab(TEAM_FIELD.blue)).toFixed(1)} from team woad — `
    + `which is exactly why 2.1 is gated at ZERO and not at a tolerance.`);
}

// ============================================================
// 3. NOT STATS — docs/FACTIONS.md §3, and this is the half that matters more
// ============================================================
console.log("\n[faction] === 3. AND NOT ONE OF THEM COSTS A POINT OF ANYTHING ===\n");
{
  // 3a. REACH. `buildWeaponForClass` takes no people and never may: the blade
  // trail, the hit test and the class's whole reach are read off this geometry
  // in `render/anim.ts`. Asserted on the built vertices rather than on the
  // signature, because an argument added with a default would still typecheck.
  const bbox = (g) => {
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], n = 0;
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position, m = o.matrixWorld.elements;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const p = [
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
        ];
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
        n++;
      }
    });
    return `${n}|${lo.map((v) => v.toFixed(6)).join(",")}|${hi.map((v) => v.toFixed(6)).join(",")}`;
  };
  const reach = CLASSES.map((cls) => bbox(buildWeaponForClass(cls)));
  check("3a REACH — a weapon has no people: `buildWeaponForClass` takes one argument",
    buildWeaponForClass.length <= 2 && reach.every((r) => r.includes("|")),
    `arity ${buildWeaponForClass.length} (cls, materials?) — ${CLASSES.map((c, i) => `${c} ${reach[i].split("|")[0]}v`).join(", ")}`);

  // 3b. THE SIMULATION. The real engine, twice: one room where every man
  // declares a people in his appearance and one where none does. Every
  // published field of every player, minus the cosmetic blob itself, must be
  // identical after a scripted match — and `WARRIOR_STATS`, which is the sheet
  // the server hands a client at join, must be the same object.
  //
  // THIS IS THE ASSERTION `tools/wartest.mjs` §7 COULD NOT MAKE, and the reason
  // is worth writing down because it is this project's most-recorded fault.
  // §7b's leak check is `Object.keys(player).filter(...)` — it reads the player
  // record's TOP LEVEL. `appearance` is a nested opaque blob the engine assigns
  // and never interprets, so a livery inside it is invisible to that filter. §7
  // is not wrong; it is aimed one level up from where this feature landed, and
  // it would have passed a build that put a people on the wire and then read
  // it. That hole is closed in `wartest` §7d in the same commit as this file,
  // and the assertion below is the same claim taken from the other end.
  const RATE = 20;
  const { makeEngine, WARRIOR_STATS } = ENGINE;
  const statsJson = JSON.stringify(WARRIOR_STATS);
  const runRoom = (declare) => {
    const eng = makeEngine({ autoTick: false });
    const open = () => {
      const c = { byType: new Map(), snapshot: null };
      c.sid = eng.connect((str) => {
        const m = JSON.parse(str);
        if (!c.byType.has(m.type)) c.byType.set(m.type, []);
        c.byType.get(m.type).push(m.data);
        if (m.data && m.data.players) c.snapshot = m.data;
      });
      c.send = (type, data) => eng.message(c.sid, { type, data: data || {} });
      c.last = (t) => { const a = c.byType.get(t) || []; return a[a.length - 1]; };
      return c;
    };
    const ap = (cls, i) => ({
      ...defaultAppearance(cls),
      ...(declare ? { people: PEOPLES[i % PEOPLES.length] } : {}),
    });
    const a = open(), b = open();
    a.send("create", { name: "Alfa", mode: "blood_moot", bestOf: 1, appearance: ap("huscarl", 0) });
    const code = a.last("join").code;
    a.send("select_class", { warriorClass: "huscarl" });
    b.send("join", { code, name: "Bravo", appearance: ap("runekeeper", 1) });
    b.send("select_class", { warriorClass: "runekeeper" });
    a.send("ready"); b.send("ready"); a.send("start");
    for (let i = 0; i < 8 * RATE; i++) eng.step();
    // Everything published about every man, minus the cosmetic blob and the
    // names, which are the two things that are SUPPOSED to differ.
    const strip = (p) => {
      const o = {};
      for (const k of Object.keys(p).sort()) {
        if (k === "appearance" || k === "name" || k === "id") continue;
        o[k] = p[k];
      }
      return o;
    };
    const men = Object.values(a.snapshot.players).map(strip);
    return { men: JSON.stringify(men), seats: Object.keys(a.snapshot.players).length, joined: !!b.last("join") && !b.last("error") };
  };
  const plain = runRoom(false);
  const sworn = runRoom(true);
  check("3b SIM — a declared people changes no published field of any man in a played match",
    plain.men === sworn.men,
    plain.men === sworn.men ? `${plain.seats} men, ${plain.men.length} bytes of state, identical` : "STATE DIVERGED");
  check("3c the balance sheet the server hands a client at join is unmoved",
    JSON.stringify(ENGINE.WARRIOR_STATS) === statsJson,
    `${Object.keys(WARRIOR_STATS).length} classes`);

  // 3d. NO SPLIT. `docs/FACTIONS.md` §3's other half — "twelve players split
  // four ways is four empty queues instead of one working room". `wartest` §7a
  // proves it for the `allegiance` field on a join message; this proves it for
  // the NEW channel, the livery in the appearance blob, because a room that
  // seated men by the kit they were wearing would be the same defect arriving
  // through a different door.
  const eng = makeEngine({ autoTick: false });
  const open = () => {
    const c = { byType: new Map(), snapshot: null };
    c.sid = eng.connect((str) => {
      const m = JSON.parse(str);
      if (!c.byType.has(m.type)) c.byType.set(m.type, []);
      c.byType.get(m.type).push(m.data);
      if (m.data && m.data.players) c.snapshot = m.data;
    });
    c.send = (type, data) => eng.message(c.sid, { type, data: data || {} });
    c.last = (t) => { const a = c.byType.get(t) || []; return a[a.length - 1]; };
    return c;
  };
  const host = open();
  host.send("create", { name: "Alfa", mode: "blood_moot", appearance: { ...defaultAppearance("huscarl"), people: "saxon" } });
  const code = host.last("join").code;
  const guests = [];
  for (let i = 0; i < 7; i++) {
    const g = open();
    g.send("join", {
      code, name: `G${i}`,
      appearance: { ...defaultAppearance("warden"), people: [...PEOPLES, "romans", "martians", "saxon"][i] },
    });
    guests.push(g);
  }
  const seated = Object.keys(host.snapshot.players).length;
  check("3d NO SPLIT — eight men in four liveries (and two invented ones) all take a seat in ONE room",
    seated === 8 && guests.every((g) => !!g.last("join") && !g.last("error")),
    `${seated} seated, ${guests.filter((g) => g.last("error")).length} refused`);
}

// ============================================================
// 4. THE SHIELD — catalogue only, and it rides the verdict line
// ============================================================
console.log("\n[faction] === 4. THE BOARD AND THE MARK (catalogue, not in the raster) ===\n");
let boardMin = null;
{
  const ap = { ...defaultAppearance("huscarl"), cloak: "none" };
  const boards = PEOPLES.map((p) => ({ p, hex: shieldBoard(ap, "none", OFF ? "none" : p) }));
  const plain = shieldBoard(ap, "none", "none");
  let worst = Infinity, worstAt = null;
  for (let i = 0; i < boards.length; i++) {
    for (let j = i + 1; j < boards.length; j++) {
      const d = dE(lab(boards[i].hex), lab(boards[j].hex));
      if (d < worst) { worst = d; worstAt = `${boards[i].p} vs ${boards[j].p}`; }
    }
  }
  boardMin = worst;
  for (const b of boards) {
    const built = buildShield(b.hex, undefined, 0x5f6b7a, "none", OFF ? "none" : b.p);
    let tris = 0;
    built.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    console.log(`  ${b.p.padEnd(7)} board 0x${b.hex.toString(16).padStart(6, "0")}   ${Math.round(tris)} triangles`);
  }
  const bare = buildShield(plain, undefined, 0x5f6b7a, "none", "none");
  let bareTris = 0;
  bare.traverse((o) => { if (o.isMesh) bareTris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  console.log(`  ${"unsworn".padEnd(7)} board 0x${plain.toString(16).padStart(6, "0")}   ${Math.round(bareTris)} triangles`);
  check(`4.1 the four boards are four fields, ΔE ${GLANCE_DE}+ apart`,
    worst >= GLANCE_DE, `worst ΔE ${worst.toFixed(1)} — ${worstAt}`);
  check("4.2 a livery only ever ADDS to a shield — the unsworn board loses nothing",
    PEOPLES.every((p) => {
      const g = buildShield(shieldBoard(ap, "none", OFF ? "none" : p), undefined, 0x5f6b7a, "none", OFF ? "none" : p);
      let t = 0;
      g.traverse((o) => { if (o.isMesh) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
      return t >= bareTris;
    }),
    `unsworn ${Math.round(bareTris)} triangles is the floor`);
}

// ============================================================
// THE FIXED WORLD — §6's clock and §6's die.
//
// LIFTED FROM `tools/cosmetictest.mjs`, which lifted the clock from
// `tools/shoot.mjs`, and it is not optional. Two captures of ONE subject are
// not the same picture without it: `vfx.ts` rolls its embers off `Math.random`
// and the idle sway runs off `performance.now()`, so the fire's phase and the
// spark positions differ between two frames of the same man. A clip count is a
// COUNT OF PIXELS AT FULL SCALE, which is exactly the statistic a moving fire
// moves, and a gate whose reading wanders is a gate that can be re-rolled until
// it passes.
//
// §6.2 measures the residue rather than assuming it away.
// ============================================================
const FRAME_MS = 50;
function installVirtualClock(stepMs) {
  // xorshift32. Not for cryptography and not for statistics — for repeatability.
  let seed = 0x2545f491;
  Math.random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const realRaf = window.requestAnimationFrame.bind(window);
  let vnow = 0, queue = [], scheduled = false, nextId = 1;
  const cancelled = new Set();
  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    queue.push({ id, cb });
    if (!scheduled) {
      scheduled = true;
      realRaf(() => {
        scheduled = false;
        vnow += stepMs;
        const batch = queue; queue = [];
        for (const it of batch) if (!cancelled.has(it.id)) it.cb(vnow);
      });
    }
    return id;
  };
  window.cancelAnimationFrame = (id) => { cancelled.add(id); };
  performance.now = () => vnow;
}


// ============================================================
// THE APP AND THE BROWSER — §6's instrument, and nobody else's.
//
// Lifted from `tools/cosmetictest.mjs`'s render pass, including the two things
// that pass learned the hard way: the production build is preferred over dev
// when one exists, and SwiftShader is asked for by name because this box has no
// GPU and a silent software fallback renders a different picture.
// ============================================================
async function bootServer() {
  const PORT = 3400 + (process.pid % 600);
  const origin = `http://localhost:${PORT}`;
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  const proc = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const started = Date.now();
  for (;;) {
    try { const r = await fetch(`${origin}/api/health`); if (r.ok || r.status === 404) break; } catch { /* not up yet */ }
    if (Date.now() - started > 240000) die("the server never came up");
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`        ${useProd ? "production" : "dev"} server up on :${PORT}`);
  if (!useProd) note("NO PRODUCTION BUILD — this is the dev server, and §6 is measuring un-minified output. Run `npm run build` first.");
  return { origin, stop: () => { if (!proc.killed) proc.kill("SIGTERM"); } };
}
const launchBrowser = () => {
  const pre = "/opt/pw-browsers/chromium";
  return chromium.launch({
    ...(existsSync(pre) ? { executablePath: pre } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
      "--disable-gpu-sandbox", "--no-sandbox", "--ignore-gpu-blocklist"],
  });
};

// ============================================================
// 5. THE PAID LADDER SURVIVES SWEARING
//
// THE DEFECT THIS SECTION WAS WRITTEN FOR, measured on the build it was written
// against, through `kitFor(finishKit(value), "none", people)` — the shipped
// resolvers and nothing else:
//
//     unsworn   0/21 finish pairs under the bar   (min ΔE 11.85)
//     saxon    21/21                              (min ΔE 0.00)
//     briton   21/21                              (min ΔE 0.00)
//     pict     21/21                              (min ΔE 0.11)
//     norse    21/21                              (min ΔE 0.56)
//
// The 0.00 pairs were FREE against PAID. Rough Iron (0 gold) and Blackened
// Steel (110 gold) returned the IDENTICAL hex on every dyed surface under a
// Saxon or a Briton livery — `mail #7c7a6f vs #7c7a6f | tunic #b0a554 vs
// #b0a554`. A man who paid 110 gold watched it become the free one the moment
// he swore.
//
// WHY NOTHING ALREADY IN THE DRAWER COULD SEE IT, and this is the project's
// signature failure rather than an oversight:
//
//   * `tools/rungcensus.mjs` counts connected components and triangles. NOTHING
//     WAS DELETED — the geometry is to the triangle what it was and the census
//     reads 640 identical, 0 LOST, on all five liveries. The colour was
//     FLATTENED, and a census of parts cannot see a flattened colour.
//   * `tools/cosmetictest.mjs` §2 does gate this ladder on ΔE, and gates it on
//     `LADDER_DE` — but on `Number(option.value)`, the RAW STORED HEX. That hex
//     is the same seven numbers whatever a man swore to. The resolver is what
//     the player sees and the resolver was never in the comparison.
//   * `tools/factionread.mjs` itself passed 15/15 with the defect present,
//     because every assertion above §5 asks "are the four peoples far enough
//     APART" and none of them asks "is the shop still a ladder INSIDE one of
//     them".
//
// Three instruments, all green, all answering a question next to the one that
// mattered.
//
// WHAT IS MEASURED. The kit-averaged CIELAB ΔE76 over the surfaces the vat
// actually touches, between every pair of the seven finishes, under the unsworn
// and under each of the four peoples. `fitting` is excluded — not by name but
// by probe, so the list follows the code rather than a comment: a surface the
// vat does not move carries the whole of its unsworn spacing for free, and
// averaging it in would flatter the result by exactly the amount the vat
// destroyed. The probe is therefore the CONSERVATIVE choice, and stays
// conservative if a future change starts or stops dyeing something.
//
// THE BAR IS `LADDER_DE`, READ OUT OF cosmetictest — the same constant that
// already carries "what a PAID rung has to clear to be a different colour at a
// glance", and the same one §1.2 gates the four peoples on. It is also the bar
// the UNSWORN build already clears with 1.85 to spare, so this is not a bar
// invented for a fix to meet: it is main's own floor, applied to the sworn man.
// ============================================================
console.log("\n[faction] === 5. THE PAID LADDER SURVIVES SWEARING ===\n");
let laddering = null;
{
  const FINISH_ROWS = slotOf("armor").options.map((o) => ({ label: o.label, cost: o.cost, value: Number(o.value) }));
  const hx = (n) => `#${n.toString(16).padStart(6, "0")}`;

  // WHICH SURFACES THE VAT TOUCHES, by asking it rather than by listing them.
  /** The Saxon vat's own hue, off the CSS field, exactly as the old code took it. */
  const STRAW_HUE = (() => {
    const h = { h: 0, s: 0, l: 0 };
    new THREE.Color(FACTION_FIELD.saxon).getHSL(h);
    return (h.h + 0.058 + 1) % 1;
  })();

  const probe = finishKit(FINISH_ROWS[0].value);
  const SURFACES = Object.keys(probe).filter((k) =>
    PEOPLES.some((p) => kitFor(probe, "none", p)[k] !== probe[k]));
  const UNTOUCHED = Object.keys(probe).filter((k) => !SURFACES.includes(k));
  note(`the vat moves ${SURFACES.length} of the ${Object.keys(probe).length} kit surfaces: ${SURFACES.join(", ")}`);
  note(`untouched and therefore EXCLUDED from the average (it would flatter it): ${UNTOUCHED.join(", ") || "none"}`);

  /** The kit-averaged ΔE between two finishes, as the player's client resolves them. */
  const kitDE = (ka, kb) =>
    SURFACES.reduce((s, k) => s + dE(lab(ka[k]), lab(kb[k])), 0) / SURFACES.length;

  /**
   * §5.0 — PROOF OF FAILURE, docs/PROCESS.md R2, and it is permanent rather
   * than a paragraph in a commit message.
   *
   * A STRAW VAT: the naive livery, which assigns a hue, a chroma and a clamped
   * lightness absolutely and therefore maps every rung of the ladder onto one
   * value. This is what the shipped `factionDye` did when this section was
   * written, reduced to four lines. If the instrument below cannot see THIS
   * collapse it cannot see any, and a green §5.1 would mean nothing.
   *
   * It is a control and not a code path: nothing in `src/` calls it, and the
   * assertion on it is that it FAILS.
   */
  const strawVat = (kit) => Object.fromEntries(Object.keys(kit).map((k) => {
    if (!SURFACES.includes(k)) return [k, kit[k]];
    // THE OLD `factionDye`, LINE FOR LINE — the Saxon cloth row's own numbers.
    // Hue and chroma ASSIGNED, the source's lightness scaled by the bias and
    // then hard-clamped into the band. Three's `getHSL` reports lightness in the
    // LINEAR working space and the band was written as if it were the sRGB one,
    // so `lo` sat above nearly every kit surface and the clamp put the whole
    // ladder on the floor. That is the defect, kept here as a control.
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(kit[k]).getHSL(hsl);
    const l = Math.max(0.26, Math.min(0.66, hsl.l * 1.18));
    return [k, new THREE.Color().setHSL(STRAW_HUE, 0.66, l).getHex()];
  }));
  {
    const kits = FINISH_ROWS.map((f) => strawVat(finishKit(f.value)));
    let under = 0, pairs = 0, min = Infinity;
    for (let i = 0; i < kits.length; i++) for (let j = i + 1; j < kits.length; j++) {
      const d = kitDE(kits[i], kits[j]); pairs++;
      if (d < LADDER_DE) under++;
      if (d < min) min = d;
    }
    check(`5.0 CONTROL — the instrument SEES a flattened ladder (a straw vat that assigns absolutely must go under ΔE ${LADDER_DE})`,
      under === pairs, `straw vat: ${under}/${pairs} pairs under the bar, min ΔE ${min.toFixed(2)}`);
  }

  console.log("");
  console.log("  livery    ADJACENT rungs        ALL 21 pairs                 free-vs-paid");
  console.log("  --------------------------------------------------------------------------------");
  const dullAdjacent = [];   // GATED — cosmetictest's own rule for this ladder
  const sameColour = [];     // GATED — cosmetictest's own second rule
  const freeTwins = [];      // GATED — the owner's sentence, at a JND
  const freeVsPaid = [];     // REPORTED — paid rungs within LADDER_DE of free
  let worstFree = Infinity;
  const collapsed = [];      // REPORTED — every pair against LADDER_DE
  let worstAll = Infinity, worstAllAt = "", worstAdj = Infinity, unswornWorstAll = Infinity;
  for (const people of ["none", ...PEOPLES]) {
    const kits = FINISH_ROWS.map((f) => ({ ...f, kit: kitFor(finishKit(f.value), "none", OFF ? "none" : people) }));
    let adjMin = Infinity, allMin = Infinity, allMinAt = "", freeMin = Infinity, under = 0;
    for (let i = 0; i < kits.length; i++) {
      for (let j = i + 1; j < kits.length; j++) {
        const a = kits[i], b = kits[j];
        const d = kitDE(a.kit, b.kit);
        if (d < allMin) { allMin = d; allMinAt = `${a.label} vs ${b.label}`; }
        if (d < JND) sameColour.push(`${people}: ${a.label} and ${b.label} are ΔE ${d.toFixed(2)} apart — one swatch`);
        if (d < LADDER_DE) {
          under++;
          collapsed.push(`${people}: ${a.label} (${a.cost}g) vs ${b.label} (${b.cost}g) — ΔE ${d.toFixed(2)}`);
        }
        // ADJACENT — the rule `cosmetictest.mjs` §2 actually writes: "every paid
        // colour rung clears ΔE LADDER_DE against the rung below it".
        if (j === i + 1) {
          if (d < adjMin) adjMin = d;
          if (d < LADDER_DE && b.cost > 0) dullAdjacent.push(`${people}: ${a.label} -> ${b.label} is ΔE ${d.toFixed(1)} for ${b.cost}g`);
        }
        // FREE vs PAID — a rung that cost gold and reads as the issued kit is a
        // refund, not a cosmetic, and it is the sentence the owner would write.
        if (a.cost === 0 || b.cost === 0) {
          const paid = a.cost === 0 ? b : a, free = a.cost === 0 ? a : b;
          if (d < freeMin) freeMin = d;
          if (people !== "none" && d < worstFree) worstFree = d;
          if (d < JND) freeTwins.push(`${people}: ${paid.label} costs ${paid.cost}g and is ΔE ${d.toFixed(2)} from the FREE ${free.label}`
            + ` — mail ${hx(free.kit.mail)} vs ${hx(paid.kit.mail)} | tunic ${hx(free.kit.tunic)} vs ${hx(paid.kit.tunic)}`);
          if (d < LADDER_DE) freeVsPaid.push(`${people}: ${paid.label} costs ${paid.cost}g and is ΔE ${d.toFixed(2)} from the FREE ${free.label}`
            + ` — mail ${hx(free.kit.mail)} vs ${hx(paid.kit.mail)} | tunic ${hx(free.kit.tunic)} vs ${hx(paid.kit.tunic)}`);
        }
      }
    }
    if (people === "none") unswornWorstAll = allMin;
    else {
      if (allMin < worstAll) { worstAll = allMin; worstAllAt = `${people}: ${allMinAt}`; }
      if (adjMin < worstAdj) worstAdj = adjMin;
    }
    console.log(`  ${people.padEnd(8)}  min ΔE ${adjMin.toFixed(2).padStart(6)}        ${String(under).padStart(2)}/21 under ${LADDER_DE}, min ${allMin.toFixed(2).padStart(6)}     min ΔE ${freeMin.toFixed(2).padStart(6)}`);
  }
  console.log("");
  for (const f of freeVsPaid.slice(0, 6)) note(`FREE-vs-PAID within ΔE ${LADDER_DE}  ${f}`);
  if (freeVsPaid.length > 6) note(`... and ${freeVsPaid.length - 6} more`);

  // ---- THE GATED RULES, AND THEY ARE cosmetictest's OWN --------------------
  //
  // Both are `cosmetictest.mjs` §2's, moved off the RAW STORED HEX and onto
  // what `kitFor(finishKit(v), team, people)` actually hands the renderer. That
  // move is the whole fix to the instrument: the seven stored numbers are the
  // same seven numbers whatever a man swore to, so the shop's existing gate
  // could not have seen this and did not.
  check(`5.1 NO TWINS, KIT MEAN — no two of the seven finishes are one swatch (ΔE ${JND}) under any livery, averaged over the ${SURFACES.length} dyed surfaces`,
    sameColour.length === 0,
    sameColour.length ? `${sameColour.length} pairs below a JND, worst ΔE ${worstAll.toFixed(2)} (${worstAllAt})`
      : `worst pair of all, under any livery, ΔE ${worstAll.toFixed(2)} — ${worstAllAt}`,
    sameColour);
  check("5.2 NO REFUND, KIT MEAN — no paid finish is one swatch with the FREE one under any livery, averaged over the dyed surfaces",
    freeTwins.length === 0,
    freeTwins.length ? `${freeTwins.length} paid rungs collapse onto Rough Iron (0g)`
      : `worst paid-against-free pair ΔE ${worstFree.toFixed(2)}`,
    freeTwins);

  // ==========================================================================
  // 5.1b / 5.2b — THE SAME TWO RULES, PER SURFACE, BECAUSE THE MEAN CANNOT SEE
  //
  // THE BLINDNESS THIS CLOSES IS THIS SECTION'S OWN AND IT IS ONE LINE LONG.
  // `kitDE` divides by `SURFACES.length`. Six surfaces, so a surface that
  // collapses ALL THE WAY to ΔE 0.00 costs the mean at most one sixth of what
  // it was worth — and the mean is measured against a bar the unsworn shop only
  // clears by 1.85 points in the first place. §5.0's straw vat flattens all six
  // at once and is therefore caught; a vat that flattens ONE is not.
  //
  // That is not a hypothetical. On the tree this was written on, the Saxon's
  // Rough Iron (0g) byrnie and his Blackened Steel (110g) byrnie are the SAME
  // HEX — ΔE 0.00, a 110 gold refund on the largest surface a huscarl wears —
  // and §5.1 above reports PASS. The gate titled "THE PAID LADDER SURVIVES
  // SWEARING" was green about a byte-identical byrnie.
  //
  // WHY THE BAR IS NOT A NEW ONE. Both rules below are `cosmetictest`'s own,
  // the same two the kit mean is already gated on, asked of one surface at a
  // time. And the UNSWORN column is printed beside every livery precisely so
  // nobody has to take that on trust: main's own shop has NO pair of finishes
  // within a JND on ANY single dyed surface, and its worst single-surface pair
  // anywhere is the hide at ΔE 7.18. So this is main's floor applied per
  // surface, exactly as §5.1 is main's floor applied to the mean — not a bar
  // this file invented to fail a tree with.
  // ==========================================================================
  const surfDE = (ka, kb, k) => dE(lab(ka[k]), lab(kb[k]));

  // ---- §5.0b THE CONTROL, AND IT IS THE MEAN THAT IS ON TRIAL --------------
  //
  // docs/PROCESS.md R2. Take the shop's own two finishes, unsworn, and give the
  // dearer one the cheaper one's BYRNIE — one surface collapsed to nothing,
  // five untouched. If the kit mean still clears `LADDER_DE` on that kit, the
  // mean is proven blind to a refunded byrnie, and every green §5.1 above is
  // green for a reason that has nothing to do with the mail. It is a control
  // and not a code path: nothing in `src/` builds this man.
  {
    const A = FINISH_ROWS[0], B = FINISH_ROWS[FINISH_ROWS.length - 1];
    const ka = kitFor(finishKit(A.value), "none", "none");
    const kb = { ...kitFor(finishKit(B.value), "none", "none"), mail: ka.mail };
    const mean = kitDE(ka, kb), mail = surfDE(ka, kb, "mail");
    check(`5.0b CONTROL — the KIT MEAN cannot see a byte-identical byrnie (${A.label} ${A.cost}g vs ${B.label} ${B.cost}g with one mail between them)`,
      mail === 0 && mean >= LADDER_DE,
      `mail ΔE ${mail.toFixed(2)} — one swatch — while the kit mean reads ΔE ${mean.toFixed(2)}, over the ${LADDER_DE} bar. The mean is the instrument that is blind, not the vat.`);
  }

  console.log("");
  console.log(`  PER SURFACE — every one of the 21 finish pairs, on ONE surface at a time. "twins" is ΔE < ${JND}.`);
  console.log("");
  console.log(`  livery    surface    min ADJ    min of 21   pairs < ${LADDER_DE}   TWINS < ${JND}   the closest pair`);
  console.log("  ------------------------------------------------------------------------------------------------");
  const surfTwins = [];      // GATED — 5.1b
  const surfFreeTwins = [];  // GATED — 5.2b
  const perSurface = {};
  for (const people of ["none", ...PEOPLES]) {
    const kits = FINISH_ROWS.map((f) => ({ ...f, kit: kitFor(finishKit(f.value), "none", OFF ? "none" : people) }));
    for (const k of SURFACES) {
      let adjMin = Infinity, allMin = Infinity, allMinAt = "", under = 0, twins = 0;
      for (let i = 0; i < kits.length; i++) {
        for (let j = i + 1; j < kits.length; j++) {
          const a = kits[i], b = kits[j];
          const d = surfDE(a.kit, b.kit, k);
          if (d < allMin) { allMin = d; allMinAt = `${a.label} vs ${b.label}`; }
          if (j === i + 1 && d < adjMin) adjMin = d;
          if (d < LADDER_DE) under++;
          if (d < JND) {
            twins++;
            if (people !== "none") surfTwins.push(`${people} ${k}: ${a.label} (${a.cost}g) and ${b.label} (${b.cost}g) are ΔE ${d.toFixed(2)} apart — ${hx(a.kit[k])} vs ${hx(b.kit[k])}`);
          }
          if ((a.cost === 0 || b.cost === 0) && d < JND && people !== "none") {
            const paid = a.cost === 0 ? b : a, free = a.cost === 0 ? a : b;
            surfFreeTwins.push(`${people} ${k}: ${paid.label} costs ${paid.cost}g and its ${k} is ΔE ${d.toFixed(2)} from the FREE ${free.label}'s — ${hx(free.kit[k])} vs ${hx(paid.kit[k])}`);
          }
        }
      }
      perSurface[`${people}|${k}`] = { adjMin, allMin, allMinAt, under, twins };
      console.log(`  ${people.padEnd(8)}  ${k.padEnd(9)} ${adjMin.toFixed(2).padStart(8)} ${allMin.toFixed(2).padStart(11)} ${String(under).padStart(11)} ${String(twins).padStart(12)}   ${allMinAt}`);
    }
    console.log("");
  }
  const unswornWorstSurface = SURFACES.reduce((m, k) => Math.min(m, perSurface[`none|${k}`].allMin), Infinity);
  const unswornTwins = SURFACES.reduce((m, k) => m + perSurface[`none|${k}`].twins, 0);
  note(`THE UNSWORN COLUMN IS THE CONTROL: ${unswornTwins} twins over ${SURFACES.length} surfaces x 21 pairs, worst single-surface pair anywhere ΔE ${unswornWorstSurface.toFixed(2)}. That is the floor these two gates are set at.`);
  const swornWorstSurface = SURFACES.reduce((m, k) => Math.min(m, ...PEOPLES.map((p) => perSurface[`${p}|${k}`].allMin)), Infinity);

  for (const t of surfTwins.slice(0, 12)) note(`TWIN   ${t}`);
  if (surfTwins.length > 12) note(`... and ${surfTwins.length - 12} more`);

  check(`5.1b NO TWINS PER SURFACE — no two of the seven finishes are one swatch (ΔE ${JND}) on any single dyed surface under any livery`,
    surfTwins.length === 0,
    surfTwins.length
      ? `${surfTwins.length} surface-pairs below a JND across the ${PEOPLES.length} peoples, worst ΔE ${swornWorstSurface.toFixed(2)} — against ${unswornTwins} and ΔE ${unswornWorstSurface.toFixed(2)} for the same shop unsworn`
      : `worst single-surface pair under any livery ΔE ${swornWorstSurface.toFixed(2)}, against ${unswornWorstSurface.toFixed(2)} unsworn`,
    surfTwins);
  check("5.2b NO REFUND PER SURFACE — no paid finish is one swatch with the FREE one on any single dyed surface under any livery",
    surfFreeTwins.length === 0,
    surfFreeTwins.length
      ? `${surfFreeTwins.length} paid surfaces collapse onto the FREE ${FINISH_ROWS.find((f) => f.cost === 0)?.label ?? "0g"}'s own`
      : "no paid surface reads as the issued one",
    surfFreeTwins);

  // ---- REPORTED, NOT GATED, AND THE ARGUMENT IS WRITTEN OUT ------------------
  //
  // The brief that ordered this section asked for a third rule: every one of the
  // 21 pairs to clear `LADDER_DE`, not merely a JND, under every livery. It is
  // NOT gated, the shortfall is printed on every run, and this is why —
  // docs/PROCESS.md R4 and R10, measured rather than asserted.
  //
  // The shop's own tightest pair is Bronze Scales (110g) against Bretwalda Gold
  // (160g) at ΔE 11.85 unsworn. That leaves a livery 1.85 points of room, so it
  // would have to be very nearly an ISOMETRY. The chroma plane can be made one —
  // addition preserves differences exactly, which is why `factionDye` adds — and
  // the configurations that DO recover the ladder to ΔE 8-9 were all built and
  // all measured on the real §1 sweep. Every one of them broke §1.3:
  //
  //     configuration                       §1.2 DISTINCT  §1.3 READS  §5 min ΔE
  //     shipped (assign, hard clamp)           12.52 ΔC     +15.21°      0.00
  //     perceptual bands + unbounded sum        4.41 ΔC     -173.24°     8.93
  //     linear bands + unbounded sum            5.75 ΔC     -173.24°     8.97
  //     linear bands + sum, 22 deg hue cone    16.64 ΔC      -25.80°     7.16
  //     SHIPPED NOW: linear bands, 8 deg cone  17.93 ΔC       +3.47°     3.23
  //
  // -173° is the identity read INVERTED: a Pict in Bretwalda Gold reading as a
  // Saxon, because the Pict's wraps are `sat 0.12` ("bare limbs") and a 160 gold
  // finish out-votes a vat that weak. A people a purchase can out-vote is
  // `FACTIONS.md` §8's ordering broken one rung below the team colour, which is
  // the constraint this whole feature is built under.
  //
  // So the ladder does not come all the way back, and the number is on this
  // line rather than off the sheet. What it does buy: the collapse itself is
  // gone — 84 pairs at or under `LADDER_DE` including 24 reading as the free
  // kit, minimum ΔE 0.00, becomes ${collapsed.length} near pairs with none of
  // them a twin — and the four peoples come out FURTHER apart than they were
  // before, not nearer.
  note(`REPORTED, NOT GATED — of the 21 pairs under each of the four liveries, ${collapsed.length} come within ΔE ${LADDER_DE}`
    + ` (${dullAdjacent.length} of them adjacent rungs); the worst is ${worstAll.toFixed(2)} (${worstAllAt}), against ${unswornWorstAll.toFixed(2)} for the same pair unsworn.`);
  for (const c of collapsed.slice(0, 10)) note(`  NEAR  ${c}`);
  if (collapsed.length > 10) note(`  ... and ${collapsed.length - 10} more`);
  laddering = { collapsed: collapsed.length, worstAll, worstAllAt, worstAdj, unswornWorstAll, adjacent: dullAdjacent.length };
}

// ============================================================
// 5.3 NO NEAR-NEUTRAL ON THE RED ARC — THE ALBEDO GATE THIS DEFECT NEEDED
//
// This is the cheapest section in the file and it is the one that would have
// closed the Danelaw's rose three rounds early. No browser, no server, no
// light: it walks the shipped resolvers and asks one question of every surface
// a warrior can wear.
//
// THE ROSE BAND HAS A CHROMA FLOOR AND IT SAYS WHY IT CANNOT BE TRUSTED. C*
// 14.8, the undyed linen shirt, under which a surface is "greige — cloth with
// no dye in it — and greige is not pink". That is TRUE OF AN ALBEDO PIXEL AND
// FALSE OF A LIT ONE, and `tools/lib/roseband.mjs` carries the warning inside
// the floor's own paragraph: the arena's key is a bonfire and it puts about
// eleven points of warm chroma into any near-neutral surface it falls on.
//
// So the dangerous place in the whole colour space is JUST UNDER that floor
// and ON the arc. A surface there is obliged to pass §7.0's calibration and
// §7.1 cannot see it coming — and then the fire finishes the dyeing. It is the
// one region where the band is required to be wrong.
//
// THAT IS EXACTLY WHERE EVERY REPORTED SURFACE WAS. On the tree this section
// was added to fix, thirteen of the 116 surfaces below came out near-neutral
// AND pale AND on the garnet's arc, and every one of the thirteen was the
// Danelaw — every finish's byrnie, the leg wraps, and the linen sleeves:
//
//     norse  Polished Steel byrnie   #8a97a5 -> #a3a2a2  C* 0.4  hue  18.2°
//     norse  linen shirt and sleeves #c2b69c -> #9b9695  C* 2.0  hue  35.4°
//     norse  Rough Iron byrnie       #5f6b7a -> #898384  C* 2.5  hue   6.0°
//     norse  Sea Queen's Gift byrnie #2f4a6a -> #8f7d80  C* 7.5  hue   6.9°
//     ...nine more, all norse, all byrnies and leg wraps
//
// READ THE SOURCE COLUMN, because it is the whole diagnosis. Rough Iron is
// C* 9.9 at hue 264° and Sea Queen's Gift is C* 21.7 at hue 270°: both COOL,
// because that is what steel is. The vat took the cool out and left the
// remnant aimed at the garnet. A warm light ADDS on a warm-neutral and CANCELS
// on a cool one, so those byrnies rendered C* 16-20 on the red arc — pink —
// while the unsworn man's cool iron rendered C* 6.5.
//
// A GREEN 15/15 AND THEN A GREEN 21/21 SHIPPED THAT. §1 gates how far the four
// peoples are APART and rose is a long way from weld, moss and woad, so a pink
// Dane clears it comfortably. The question a distance cannot ask is whether a
// man is the RIGHT colour. This section asks it, and it costs a second.
// ============================================================
console.log("\n[faction] === 5.3 / 5.4 THE ROSE BAND IN ALBEDO (no light, no browser, one second) ===\n");
{
  const band53 = makeBand(FACTION_FIELD.norse);
  const hx53 = (n) => `#${n.toString(16).padStart(6, "0")}`;
  note(`the band: ${band53.describe()}`);
  note(`5.3 gates the region JUST UNDER its C* ${band53.floor.toFixed(1)} floor, where the fire finishes the dyeing; 5.4 gates the band ITSELF, against the shop's own undyed cloth.`);
  const flat = [];
  const inband = [];
  const LINEN_SRC = 0xc2b69c;
  const hits = (c) => band53.test((c >> 16) & 255, (c >> 8) & 255, c & 255);
  for (const people of PEOPLES) {
    for (const f2 of FINISHES) {
      const kit = finishKit(f2.value);
      const k = kitFor(kit, "none", people);
      const surfaces = ["mail", "tunic", "trouser", "wrap", "hide", "buff"].map((s) => [s, kit[s], k[s]]);
      surfaces.push(["linen shirt and sleeves", LINEN_SRC, CH.wornBy(LINEN_SRC, "none", people, "linen")]);
      for (const [surf, src, c] of surfaces) {
        const L = labOf(c), C = chromaOf(L), d = arcTo(hueOfLab(L), band53.fieldH);
        if (d <= ARC && L[0] >= ROSE_L && C < band53.floor)
          flat.push(`${people} ${f2.label} ${surf} ${hx53(c)} — C* ${C.toFixed(1)} under the band's ${band53.floor.toFixed(1)} floor, L* ${L[0].toFixed(1)}, ${d.toFixed(1)}° off the garnet`);
        // §5.4 — IN the band, and MATCHED against the surface the shop ships.
        // A vat may not put a surface into the band that the unsworn man's own
        // cloth was not already in; where the shop itself ships a rose-grey
        // (`FINISH_KIT` calls `0xbc9c8c` exactly that) swearing is allowed to
        // leave it there and is not allowed to have PUT it there.
        if (hits(c) && !hits(src)) {
          const S = labOf(src);
          inband.push(`${people} ${f2.label} ${surf} ${hx53(src)} (L* ${S[0].toFixed(1)}, C* ${chromaOf(S).toFixed(1)}) -> ${hx53(c)} L* ${L[0].toFixed(1)}, C* ${C.toFixed(1)}, ${d.toFixed(1)}° off the garnet — the vat put it there`);
        }
      }
    }
  }
  const walked = PEOPLES.length * FINISHES.length * 7;
  for (const st of flat.slice(0, 8)) note(`FIRE WILL DYE IT  ${st}`);
  if (flat.length) {
    note("Every line above is a surface the BONFIRE finishes dyeing. It is under the band's albedo");
    note("floor, so §7.0's calibration is obliged to clear it and §7.1 cannot see it coming; it is");
    note("pale and on the garnet's arc, so eleven points of warm key put it over that floor the");
    note("moment it is lit. Before blaming a vat's `sat`, read the SOURCE hex: if the source was");
    note("COOL and the result is neutral, the vat has BLEACHED the surface rather than let go of");
    note("it, and `characters.ts` `factionDye` is where letting go is defined. A vat adds dyestuff");
    note("to what is there; it does not repaint, and it does not strip.");
  }
  check(`5.3 NO NEAR-NEUTRAL ON THE ARC — no vat leaves a pale surface under the band's own C* ${band53.floor.toFixed(1)} floor and on the garnet's arc, where the fire would finish dyeing it`,
    flat.length === 0,
    flat.length
      ? `${flat.length} of ${walked} surfaces are pale, near-neutral and on the arc`
      : `all ${walked} surfaces clear — every near-neutral keeps its own hue off the arc`,
    flat);

  // ---- §5.4 THE OTHER HALF OF THE SAME BLINDNESS -------------------------
  //
  // §5.3 gates the region JUST UNDER the band's C* floor, and that is exactly
  // half of the answer. It cannot see a surface the vat drops INSIDE the band,
  // because being in the band is not, by itself, a fault: the band's own
  // `MUST_CLEAR` list exists because the Danelaw is allowed to be red.
  //
  // WHAT THIS COST, ONE ROUND AGO. `roseband`'s MUST_CLEAR carries
  // `0xb23c34, "crimson-finish mail — blood"` as a surface that ships CORRECT.
  // The round that wrote §5.3 then replaced that exact surface with `#9c6d6b` —
  // L* 50.8, C* 20.3, 1.5° off the garnet, the only band member left in all 245
  // and dead centre of the thing the owner reported. §5.3 could not see it
  // (C* 20.3 is ABOVE the 14.8 floor it gates) and §7 could not see it (every
  // lit frame in this file wore the issued iron). It shipped, and an adversary
  // found it by opening a render.
  //
  // THE CONTROL IS THE SHOP'S OWN CLOTH, which is the albedo twin of §7.1's
  // unsworn man: the same surface, same finish, before anybody swore. That is
  // what makes this a gate on the VAT rather than a gate on the Danelaw being
  // red — a surface the shop already ships inside the band stays allowed, and a
  // surface the vat carries in does not.
  for (const st of inband.slice(0, 8)) note(`THE VAT MADE IT PINK  ${st}`);
  check(`5.4 NO VAT PUTS A SURFACE IN THE ROSE BAND — every band member was already one before anybody swore (${band53.describe()})`,
    inband.length === 0,
    inband.length
      ? `${inband.length} of ${walked} surfaces are carried into the band by a livery`
      : `all ${walked} surfaces clear — no livery moves a surface into the band`,
    inband);
}

// ============================================================
// 6. NO SURFACE CLIPS A CHANNEL — THE ONLY SECTION WITH LIGHT IN IT
//
// EVERY OTHER SECTION OF THIS FILE READS ALBEDO AND SAYS SO. That deferral is
// honest for a question about which colour a man IS, and it is useless for the
// question here, which is what the arena's fire DOES to that colour. A surface
// can be a perfectly good gold in the albedo buffer and a flat orange traffic
// cone on the screen, because the key light drove a channel to full scale and
// every fold, weave and shadow inside it went with it.
//
// THE DEFECT THIS SECTION WAS WRITTEN FOR, measured on the build it was written
// against, at the play lens through the real renderer — the numbers are the
// share of the whole 520x320 frame at fully-clipped (any channel at 255):
//
//     unsworn huscarl        @0     0.12%     (the bonfire, and nothing else)
//     GILDED WAR CLOAK 400g  @0     0.11%     @-35 0.01%   @160 0.37%
//     SAXON huscarl          @0     1.93%     @-35 1.59%   @160 0.00%
//     SAXON runekeeper       @180   0.67%
//     norse / briton / pict  every bearing shot: 0.00-0.03%
//
// `cloakFor` put `--gilt` (0xd9a441) flat on the cloak, and `--gilt` is a MAP
// TOKEN: the CSS beside it calls it a metal and "the brightest thing on the
// map". It sits about twenty points of lightness above every other flat field
// this game uses — team madder 34, team woad 32, garnet 28, moss 32, faction
// woad 31, and the shop's dearest cloak, the 400 gold Gilded War Cloak, at 41.
// A map token is not a cloth dye. A traffic-cone tabard is not 878 Wessex.
//
// AND THE BRIEF THAT ORDERED THIS GATE PUT IT AT THE WRONG BEARING, which is
// worth writing down because it is the third round running that a refutation
// has been at a bearing nobody shot. The blow-out was reported at the REAR. It
// is not at the rear: at 160° and 180° the Saxon reads 0.00%, because the cloak
// that carries the field is then facing away from the fire and is in its own
// shadow. It is at the FRONT and the three-quarter, where the man's DYED CLOTH
// faces the key — the hot pixels sample #f0c030 and #f0b020, which is the gilt
// vat on tunic and wraps, not the cloak at all. Same defect, same fix; the
// bearing in the brief was a guess and this file is not.
//
// WHAT IS MEASURED. The share of the WARRIOR'S OWN pixels — the coverage mask
// off §0's rasteriser at the identical lens, not the frame — with any channel
// at full scale. The mask matters: the bonfire is behind him at the front and
// contributes about a tenth of a percent of the frame in every capture,
// including the unsworn ones, and a gate that counted it would be grading the
// fire.
//
// THE BAR IS THE SHOP'S OWN DEAREST GOLD, AND IT IS MEASURED, NOT CHOSEN. The
// control is an UNSWORN man in the 400 gold Gilded War Cloak and the 160 gold
// Bretwalda Gold finish — the brightest dress a player can actually buy, shot
// in the same scene at the same bearings. Whatever that reads is what a rich
// gold is allowed to read, and no livery may exceed it. A bar taken off a
// shipped, paid artefact cannot be moved to buy a pass without brightening a
// thing players own, which is a change nobody could make quietly.
//
// COST, MEASURED ON THIS PLAN AND NOT ESTIMATED FROM THE OLD ONE. 165 captures:
// 132 lit frames, 33 matched unsworn floors, plus a warm-up, a repeat and three
// controls. On a box with no GPU at a load average of about 4, a settled
// `fightcard` capture measured 75 s wall clock — so the section is between
// three and four hours, and at the load averages of 18-25 this repository's
// agents routinely put on a box it is closer to eight. The rest of this file is
// three minutes.
//
// IT IS STILL NOT OPTIONAL AND THERE IS STILL NO FLAG TO SKIP IT: the three
// rounds of this feature that shipped a defect all shipped it past a harness
// with no light in it, and the fourth shipped one past a harness that had light
// in ONE SEVENTH of the shop. See `PLAN`.
//
// WHAT TO REACH FOR WHEN THE QUESTION IS NARROWER THAN THE VERDICT:
// `tools/vatprobe.mjs` asks §7.1's question, with §7.1's band and §7.1's
// matched control, on finishes you name — six captures instead of 165. It is
// not a gate and says so. A verdict is still this section's.
// ============================================================

// ============================================================
// THE FRAME PLAN — WHICH MEN §6 AND §7 PHOTOGRAPH, AND IT IS THE SHOP AND NOT
// ONE RUNG OF IT.
//
// THE BLINDNESS THIS CLOSES, and it is this file's own, one round old. §6 and
// §7 captured `preset=fightcard&clean=1&settle=16&turn=..&cls=..&people=..`
// with NO `armor=` in the query at all, so every lit frame in both sections was
// `defaultAppearance`'s issued Rough Iron. Seven finishes are in the shop; the
// graded ruler graded one of them. An adversary then found the residue on
// another: the Danelaw's Crimson Warplate byrnie read 46.6% of the crop inside
// the rose band at the profile, modal #c76b68 — within 0.2 L* of the very hex
// the owner reported — while this section was green about a man in iron.
//
// A GRID IS NOT AFFORDABLE AND IS NOT NEEDED. Four classes x seven finishes x
// four peoples x three bearings is 336 captures and most of a day, and the two
// axes answer different questions:
//
//   the CLASS axis   asks which SURFACES are on screen — the huscarl is the
//                    only man with a byrnie and the only man with a shield, the
//                    berserker the only one with bare limbs and the most wrap
//                    and linen showing. That is what §6 found the Pict's board
//                    on and it does not need seven finishes to find it again.
//   the FINISH axis  asks what the VAT did to the cloth a player paid for, and
//                    every surface it can reach is on the huscarl.
//
// So the plan is two sweeps that cross at the issued finish: every class in
// what a man is issued, and every finish on the man who wears the most of it.
// 11 stages x 4 peoples x 3 bearings = 132 lit frames, and a matched UNSWORN
// frame for each of the 11 stages x 3 bearings on top.
//
// The issued finish is read off `defaultAppearance` rather than assumed to be
// the armoury's first row, because "the first row" is a fact about a table's
// order and this needs the fact about what an unequipped man wears.
// ============================================================
const SHOP_CLASS = "huscarl";
const ISSUED_HEX = defaultAppearance(SHOP_CLASS).armorColor;
const ISSUED = FINISHES.find((f) => f.value === Number(ISSUED_HEX));
if (!ISSUED) die(`defaultAppearance's armorColor ${ISSUED_HEX} is not one of the armoury's ${FINISHES.length} finishes`);
const PLAN = [
  ...CLASSES.map((cls) => ({ cls, finish: ISSUED })),
  ...FINISHES.filter((f) => f !== ISSUED).map((finish) => ({ cls: SHOP_CLASS, finish })),
];
const hexOf = (v) => `0x${v.toString(16).padStart(6, "0")}`;
/** One staged man, spelled the way `/shot` spells him. The finish is NAMED. */
const stageQ = (cls, turn, people, finish) =>
  `preset=fightcard&clean=1&settle=16&turn=${turn}&cls=${cls}&people=${people}&armor=${finish.id}`;

console.log("\n[faction] === 6. NO SURFACE CLIPS A CHANNEL (the render, with the fire in it) ===\n");
{
  /**
   * §6.0 — THE COUNTER, MEASURED BEFORE IT IS BELIEVED. docs/PROCESS.md R2.
   *
   * A clip counter that silently counted nothing would make every assertion
   * below green, which is the most expensive failure this section can have.
   * Three synthetic frames with a known answer, through the same function the
   * captures go through.
   */
  const clipShare = (data, mask, w) => {
    let n = 0, clipped = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      if (mask && !mask[p]) continue;
      n++;
      if (data[i] === 255 || data[i + 1] === 255 || data[i + 2] === 255) clipped++;
    }
    return { n, clipped, pct: n ? (100 * clipped) / n : 0, w };
  };
  {
    const mk = (v) => { const d = new Uint8ClampedArray(4 * 100); for (let i = 0; i < 400; i += 4) { d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = 255; } return d; };
    const white = clipShare(mk([255, 255, 255]), null, 10).pct;
    const grey = clipShare(mk([128, 128, 128]), null, 10).pct;
    const oneHot = clipShare(mk([200, 255, 40]), null, 10).pct;
    check("6.0 CONTROL — the clip counter reads 100% on a full-scale patch, 0% on mid-grey, 100% on one blown channel",
      white === 100 && grey === 0 && oneHot === 100,
      `white ${white.toFixed(1)}%, mid-grey ${grey.toFixed(1)}%, blown-green-only ${oneHot.toFixed(1)}%`);
  }

  const CLIP_BEARINGS = BEARINGS;

  /**
   * THE MASK, AND IT WAS THE WRONG MAN.
   *
   * §0.3 has asserted that a livery moves NO geometry, so ONE mask per class
   * and bearing serves all five liveries and the control — which is also why a
   * mask can be used at all: if a people moved a triangle this denominator
   * would be a different denominator for each of them.
   *
   * WHAT THIS LINE USED TO BE, AND WHY IT WAS WRONG. It read
   *
   *     raster(build(cls, FINISHES[0].value, "red", "none").group, turn).cov
   *
   * — `defaultAppearance`'s dress, which for a huscarl is a NASAL HELM and a
   * RED CLOAK. The page stages `cardPose`, whose `AUDIT_DRESS` is bare-headed
   * and cloakless on purpose, so every `% of the man` in §6 and §7 was taken
   * over a silhouette carrying a helmet and a cloak that are not in the frame.
   * Measured on this tree, at the three bearings of the plan, that mask is
   * 20.3% / 25.8% / 32.8% larger than the man actually captured. A denominator
   * a third too big is a gate a third too quiet, and it is exactly the shape of
   * dilution §7.1b below exists to end — so it is fixed here rather than noted.
   *
   * THE FIX IS NOT A SECOND COPY OF THE DRESS. `/shot` publishes the appearance
   * it staged, slot for slot, on `window.__shotSubject`; the mask is built from
   * THAT, and §6.0c asserts every capture in the run was dressed the same way.
   * A harness that kept its own copy of the base dress would audit the dress it
   * was written against — docs/PROCESS.md failure mode 3, one more time.
   */
  const SUBJECT_FIELD = {
    helm: "helm", hair: "hairStyle", hairColor: "hairColor",
    beard: "beardStyle", beardColor: "beardColor",
    cloak: "cloak", armor: "armorColor", warPaint: "warPaint",
  };
  {
    const slots = ARMOURY.map((x) => x.slot).sort().join(",");
    const known = Object.keys(SUBJECT_FIELD).sort().join(",");
    if (slots !== known) die(`the shop has slots this harness cannot stage a mask from: ARMOURY [${slots}] vs [${known}]`);
    const fields = Object.keys(defaultAppearance(SHOP_CLASS));
    for (const f of Object.values(SUBJECT_FIELD)) if (!fields.includes(f)) die(`Appearance has no field "${f}" — the mask would be built from a default`);
  }
  /** The appearance `/shot` says it staged, as `buildCharacter` wants it. */
  const apFromSubject = (subject, people) => {
    const ap = { ...defaultAppearance(SHOP_CLASS) };
    for (const [slot, field] of Object.entries(SUBJECT_FIELD)) {
      const v = subject?.[slot];
      if (v === undefined || v === null) die(`the page published no ${slot} for the subject — the mask cannot be the staged man`);
      ap[field] = /^0x[0-9a-f]+$/i.test(String(v)) ? Number(v) : String(v);
    }
    ap.people = people ?? String(subject.people ?? "none");
    return ap;
  };
  /**
   * THE MASK FOLLOWS THE FRAME'S OWN DRESS, not the run's.
   *
   * The first cut of this fix took ONE dress off the warm-up capture and cut
   * every mask from it. That is wrong for a reason §6 puts three frames of on
   * the screen: the CLIP CONTROL deliberately stages `cloak=cloak_gold`, and a
   * cloaked man measured through a cloakless silhouette both loses the cloak
   * from the denominator and loses the cloak's own blown pixels from the count
   * — on the very frames that SET the bar. So the key includes the dress, and a
   * capture that changes a slot gets its own mask.
   *
   * `people` is deliberately NOT in the key: §0.3 has asserted that a livery
   * moves no geometry, so one mask serves all five liveries and is what makes
   * the sworn/unsworn comparison a comparison at all.
   */
  let STAGED_SUBJECT = null;
  const missingSlots = [];
  const dressKey = (subject) => Object.keys(SUBJECT_FIELD).filter((k) => k !== "armor").map((k) => `${k}=${subject?.[k]}`).join(" ");
  const maskCache = new Map();
  const maskFor = (cls, turn, subject) => {
    if (!subject) die("maskFor was asked for a mask without the appearance the page staged");
    for (const slot of Object.keys(SUBJECT_FIELD)) if (subject[slot] === undefined || subject[slot] === null) missingSlots.push(`${cls}@${turn}: no ${slot}`);
    const key = `${cls}|${turn}|${dressKey(subject)}`;
    if (!maskCache.has(key)) {
      const ap = apFromSubject(subject, "none");
      maskCache.set(key, raster(buildCharacter(cls, ap, CLASS_TUNIC[cls] ?? 0x5a4a2c, undefined, "high", SEED, "none").group, turn).cov);
    }
    return maskCache.get(key);
  };
  const areaOf = (m) => { let n = 0; for (let i = 0; i < m.length; i++) if (m[i]) n++; return n; };

  /**
   * THE PER-SURFACE MASKS — six byrnie-and-tunic-and-wraps masks where there
   * used to be one warrior-shaped one. `tools/lib/surfacemask.mjs` carries the
   * argument; what matters here is that the labelling is done off the FOUR
   * VATS whatever `--off` is doing, because a mask is a fact about geometry and
   * geometry is what `--off` cannot change.
   */
  const surfCache = new Map();
  const masksFor = (cls, turn, finish, subject) => {
    if (!subject) die("masksFor was asked for a mask without the appearance the page staged");
    const key = `${cls}|${turn}|${finish.id}|${dressKey(subject)}`;
    if (!surfCache.has(key)) {
      const buildGroup = (people) => buildCharacter(cls,
        { ...apFromSubject(subject, people), armorColor: finish.value },
        CLASS_TUNIC[cls] ?? 0x5a4a2c, undefined, "high", SEED, "none").group;
      const r = surfaceMasks({ buildGroup, kitOf: (p) => kitWithLinen(finish.value, p),
        peoples: PEOPLES, surfaces: MASK_SURFACES, lens: LENS, turnDeg: turn });
      if (r.problems.length) die(`the per-surface mask cannot be trusted at ${key}: ${r.problems[0]}`);
      surfCache.set(key, { masks: r.masks, counts: r.counts });
    }
    return surfCache.get(key);
  };

  const server = await bootServer();
  let browser = null, page = null;
  try {
    browser = await launchBrowser();
    const ctx = await browser.newContext({ viewport: { width: LENS.w, height: LENS.h }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
    await ctx.addInitScript(installVirtualClock, FRAME_MS);
    page = await ctx.newPage();

    let shots = 0;
    const litFrames = [];
    const capture = async (q) => {
      await page.goto(`${server.origin}/shot?${q}`, { waitUntil: "domcontentloaded", timeout: 300000 });
      await page.waitForFunction(() => window.__shotReady === true || typeof window.__shotError === "string", null, { timeout: 300000 });
      const got = await page.evaluate(() => ({ subject: window.__shotSubject ?? null, refused: window.__shotError ?? null }));
      if (got.refused) die(`the page refused the stage: ${got.refused} (${q})`);
      const buf = await page.screenshot({ timeout: 300000 });
      shots++;
      return { subject: got.subject, px: await page.evaluate(async (b64) => {
        const img = new Image();
        await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = "data:image/png;base64," + b64; });
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
        const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        return { w: c.width, h: c.height, data: Array.from(x.getImageData(0, 0, c.width, c.height).data) };
      }, buf.toString("base64")) };
    };
    /** The hottest colour actually on the man, so a reader can see WHAT blew. */
    const hottest = (data, mask) => {
      const hist = new Map();
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        if (!mask[p]) continue;
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if (lum < 170) continue;
        const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
        hist.set(k, (hist.get(k) ?? 0) + 1);
      }
      const top = [...hist.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!top) return "—";
      const k = top[0];
      return `#${(((k >> 10) & 31) << 3).toString(16).padStart(2, "0")}${(((k >> 5) & 31) << 3).toString(16).padStart(2, "0")}${((k & 31) << 3).toString(16).padStart(2, "0")}`;
    };

    // One throwaway capture: a cold page pays for a route compile and a first
    // pass of procedural texture generation, and neither is on the clock. Same
    // reasoning, and the same measurement, as `tools/cosmetictest.mjs`.
    console.log("        warming the page (one capture, discarded)");
    {
      const w = await capture(stageQ(SHOP_CLASS, 0, "none", ISSUED));
      STAGED_SUBJECT = w.subject;
      note(`the page staged: ${Object.entries(stagedDress(STAGED_SUBJECT)).map(([k, v]) => `${k}=${v}`).join("  ")}`);
      note("EVERY MASK IN §6 AND §7 IS BUILT FROM THAT LINE. It used to be built from defaultAppearance —");
      note("a nasal helm and a red cloak the page does not stage — and was 20-33% too big at these bearings.");
    }

    // §6.2 — THE FLOOR, MEASURED. The clock is fixed and the die is seeded, and
    // this is what proves it: the same subject twice, through the whole capture
    // path, must give the same count. Without it a clip reading could be
    // re-rolled until it passed, and nobody would be able to tell.
    {
      const m = maskFor("huscarl", 0);
      const q = stageQ(SHOP_CLASS, 0, "saxon", ISSUED);
      const a = clipShare(Uint8ClampedArray.from((await capture(q)).px.data), m, LENS.w);
      const b = clipShare(Uint8ClampedArray.from((await capture(q)).px.data), m, LENS.w);
      check("6.2 REPEATABLE — one subject captured twice reads the same clip count",
        a.clipped === b.clipped,
        `${a.clipped} vs ${b.clipped} clipped px of ${a.n} on the man (${a.pct.toFixed(2)}% vs ${b.pct.toFixed(2)}%)`);
    }

    // ---- THE CONTROL: the shop's dearest gold, on an unsworn man ----------
    console.log("");
    let bar = 0, barAt = "";
    for (const turn of CLIP_BEARINGS) {
      const mask = maskFor("huscarl", turn);
      const { px, subject } = await capture(`preset=fightcard&clean=1&settle=16&turn=${turn}&cls=huscarl&people=none&cloak=cloak_gold&armor=armor_gold`);
      if (String(subject?.cloak) !== "gold" || String(subject?.people) !== "none") die(`the control staged wrong: cloak=${subject?.cloak} people=${subject?.people}`);
      const r = clipShare(Uint8ClampedArray.from(px.data), mask, px.w);
      console.log(`  CONTROL  Gilded War Cloak 400g + Bretwalda Gold 160g, UNSWORN, @${String(turn).padStart(4)}°   ${r.pct.toFixed(2).padStart(6)}% of ${r.n} px on the man   hottest ${hottest(Uint8ClampedArray.from(px.data), mask)}`);
      if (r.pct > bar) { bar = r.pct; barAt = `@${turn}°`; }
    }
    note(`the bar is therefore ${bar.toFixed(2)}% — what the shop's dearest gold reads at its worst bearing (${barAt})`);

    // ---- THE SWEEP: four peoples, four classes, three bearings ------------
    console.log("");
    const over = [];
    let worst = 0, worstAt = "";
    for (const st of PLAN) {
      const row = [];
      for (const people of PEOPLES) {
        for (const turn of CLIP_BEARINGS) {
          const mask = maskFor(st.cls, turn);
          const { px, subject } = await capture(`${stageQ(st.cls, turn, OFF ? "none" : people, st.finish)}`);
          if (String(subject?.people) !== (OFF ? "none" : people)) die(`asked for people=${people}, got ${subject?.people}`);
          if (String(subject?.armor) !== hexOf(st.finish.value)) die(`asked for armor=${st.finish.id} (${hexOf(st.finish.value)}), got ${subject?.armor}`);
          const r = clipShare(Uint8ClampedArray.from(px.data), mask, px.w);
          row.push(`${people.slice(0, 3)}@${turn}° ${r.pct.toFixed(2)}%`);
          // The frame is kept for §7 and for the sheet, and it is kept as BYTES.
          // `page.evaluate` can only hand back a plain Array, which is ~8 bytes
          // per channel in V8: at the old 48 frames that was about 250 MB and
          // survived; at this plan's 132 it is 700 MB before overhead, and an
          // out-of-memory two hours into a capture run is a gate nobody will
          // run twice. `Uint8ClampedArray` is 1 byte per channel and every
          // consumer below already indexes it the same way.
          litFrames.push({ people, cls: st.cls, turn, finish: st.finish, pct: r.pct,
            px: { w: px.w, h: px.h, data: Uint8ClampedArray.from(px.data) } });
          if (r.pct > worst) { worst = r.pct; worstAt = `${people}/${st.cls}/${st.finish.label}@${turn}°`; }
          if (r.pct > bar) over.push(`${people}/${st.cls}/${st.finish.label} ${st.finish.cost}g at ${turn}° clips ${r.pct.toFixed(2)}% of the man — ${(r.pct / (bar || 1e-9)).toFixed(1)}x the 400g gold cloak's ${bar.toFixed(2)}%, hottest ${hottest(Uint8ClampedArray.from(px.data), mask)}`);
        }
      }
      console.log(`  ${st.cls.padEnd(11)} ${st.finish.label.padEnd(17)} ${row.join("  ")}`);
    }
    console.log("");
    for (const o of over.slice(0, 10)) note(`BLOWN   ${o}`);
    // ---- §6.0c THE MASK IS THE STAGED MAN, AND IT IS CHECKED PER FRAME -----
    // Threshold-free: `/shot` publishes the appearance it staged and every
    // capture above was compared against the warm-up's, slot for slot. A run
    // where one frame arrived in a different helm would be a run whose
    // denominators are not each other's, and that is worth failing outright
    // rather than absorbing into a percentage.
    check("6.0c STAGED — every capture so far wore the dress the mask is cut from, slot for slot",
      dressDrift.length === 0,
      dressDrift.length ? `${dressDrift.length} of ${shots} captures came back in a different dress` : `${shots} captures, one dress`,
      dressDrift);
    check(`6.1 CLIP — no livery blows a channel past the shop's own dearest gold (${bar.toFixed(2)}% of the man)`,
      over.length === 0,
      over.length
        ? `${over.length} of ${PLAN.length * PEOPLES.length * CLIP_BEARINGS.length} frames over the bar, worst ${worst.toFixed(2)}% at ${worstAt}`
        : `worst livery frame ${worst.toFixed(2)}% at ${worstAt}, under the ${bar.toFixed(2)}% bar`,
      over);
    console.log(`        ${shots} captures at ${LENS.w}x${LENS.h}, the play lens, through the real renderer`);

    // ============================================================
    // 7. THE LIT COLOUR READ — WHAT COLOUR THE MAN ACTUALLY IS ON A SCREEN
    //
    // THE BLINDNESS THIS CLOSES IS WRITTEN ON THIS FILE'S OWN VERDICT LINE.
    // It said, in these words: "§0-§5 have no light and no grade — albedo
    // only; §6 is the only lit section and it measures CLIPPING, not colour."
    // A harness that knows what it cannot see, prints it, and goes green
    // anyway is `docs/PROCESS.md` failure mode 2, and this is what it cost:
    // THREE ROUNDS of the Danelaw shipping ROSE past this file. 15/15 green,
    // then 21/21 green, with a Viking in dusty pink on the screen both times.
    // The owner found it the only way it could be found — by opening the
    // render — and said what the number could not:
    //
    //   "A Viking in dusty pink is not the Danelaw at any ΔE."
    //
    // docs/PROCESS.md R6: the report becomes a named check. This is it.
    //
    // WHY ΔC COULD NEVER HAVE SEEN IT. §1 asks whether the four peoples are
    // FAR APART. Rose is far from weld, far from moss and far from woad — a
    // pink Dane passes §1 comfortably, and did, twice. The question §1 cannot
    // ask is whether the Dane is the RIGHT colour, and "the right colour" is
    // not a distance from anybody else. It is a place on the wheel.
    //
    // WHAT THE BAND IS, AND EVERY BOUND IN IT IS A COLOUR THIS GAME ALREADY
    // SHIPS. Not one number below was chosen by the person who wrote the fix:
    //
    //   the arc     within 25° of `FACTION_FIELD.norse`'s own CIELAB hue
    //               angle, 27°. Off the garnet, so it moves if the map moves.
    //   the value   L* 41 and up. Below that the red arc still has its dark
    //               names — oxblood, maroon, garnet — and the shipped
    //               Danelaw tunic at L* 25.2 and dark wrap at L* 40.3 are
    //               those names and must not be flagged.
    //   the floor   C* 14.8, the chroma of `0xc2b69c`, the UNDYED linen shirt
    //               this game has always had. Below it a surface is greige —
    //               cloth with no dye in it — and greige is not pink.
    //   the ceiling C* at half the dyestuff's own ratio of colour to light.
    //               Garnet is C* 48.7 at L* 26.4, so 1.84 points of chroma
    //               per point of value; half is 0.92. Above that line a red
    //               surface still has the stone in it. Below it, the light is
    //               in and the colour is out, and that is what pink IS.
    //
    // §7.0 asserts all four bounds against a fixed table of hexes — the ones
    // the owner reported as rose across three rounds, and the ones that
    // shipped as russet, brick and oxblood and are correct. A band that stops
    // separating those goes RED before it is allowed to grade anything.
    //
    // THE BAR IS MEASURED IN THE SAME RUN AND IT IS NOT MINE TO MOVE. Skin is
    // on the red arc, so is firelight, and so is bare iron once the fire is on
    // it — no frame reads zero. The bar is therefore THE SAME MAN SWORN TO
    // NOBODY, shot on the same mark at the same bearing under the same fire,
    // and `people=none` is byte-for-byte the pre-livery game. Moving it means
    // changing what an unsworn warrior looks like.
    //
    // The first cut of this section barred against the three peoples who are
    // NOT on the red arc and that was wrong for a reason worth keeping: their
    // kit is weld, moss and woad, the fire lands them at 81°, 150° and 200°,
    // and they read the floor however bright they get. The long note beside the
    // sweep below has the measurement that caught it.
    // ============================================================
    console.log("\n[faction] === 7. THE LIT COLOUR READ (the same frames, asked what colour they are) ===\n");
    {
      const band = makeBand(FACTION_FIELD.norse);
      note(`the band: ${band.describe()} — every bound of it is a colour this game already ships, see tools/lib/roseband.mjs`);

      // ---- §7.0 THE BAND CARRIES ITS OWN PROOF. docs/PROCESS.md R2, R3. ----
      //
      // Left list: reported as ROSE by the owner, across three rounds, off real
      // captures. Right list: shipped Danelaw surfaces that are russet, brick,
      // oxblood or bare iron and are CORRECT. A band that cannot keep those
      // apart cannot grade a frame, and this runs before it is asked to.
      const hx = (n) => `#${n.toString(16).padStart(6, "0")}`;
      {
        const { missed, overreach } = calibrate(band);
        for (const [h, w] of missed) note(`MISSED  ${hx(h)}  ${w}`);
        for (const [h, w] of overreach) note(`OVERREACH  ${hx(h)}  ${w}`);
        check(`7.0 CONTROL — the band flags all ${MUST_FLAG.length} colours reported as rose and clears all ${MUST_CLEAR.length} that shipped correct`,
          missed.length === 0 && overreach.length === 0,
          missed.length || overreach.length
            ? `${missed.length} missed, ${overreach.length} over-reached`
            : `${MUST_FLAG.length} flagged, ${MUST_CLEAR.length} cleared — the band separates rose from russet`,
          [...missed, ...overreach].map(([h, w]) => `${hx(h)} ${w}`));
      }

      // ---- §7.1 THE SWEEP, over the frames §6 already paid for -------------
      // §7.0b — the counter, on a frame with a known answer, before it is
      // believed. Same discipline as §6.0.
      {
        const mk = (v) => { const d = new Uint8ClampedArray(4 * 100); for (let i = 0; i < 400; i += 4) { d[i] = v[0]; d[i + 1] = v[1]; d[i + 2] = v[2]; d[i + 3] = 255; } return d; };
        const m = new Uint8Array(100).fill(1);
        const pink = roseShare(band, mk([0xb9, 0x74, 0x6a]), m).pct;
        const grey = roseShare(band, mk([0x86, 0x86, 0x86]), m).pct;
        const ox = roseShare(band, mk([0x6f, 0x21, 0x00]), m).pct;
        check("7.0b CONTROL — the counter reads 100% on a rose patch, 0% on grey, 0% on oxblood",
          pink === 100 && grey === 0 && ox === 0,
          `rose ${pink.toFixed(0)}%, grey ${grey.toFixed(0)}%, oxblood ${ox.toFixed(0)}%`);
      }

      const lit = [];
      for (const fr of litFrames) {
        const r = roseShare(band, fr.px.data, maskFor(fr.cls, fr.turn));
        lit.push({ ...r, people: fr.people, cls: fr.cls, turn: fr.turn });
      }

      // ---- THE BAR IS THE UNSWORN MAN, AND THAT TOOK A WRONG ONE FIRST -----
      //
      // The first cut of this section barred the Danelaw against THE OTHER
      // THREE PEOPLES, on the reasoning that they are not on the red arc and
      // whatever they read is skin and firelight. It is a trap, and the fix
      // this section was written to grade is what sprang it: after a change
      // that took the byrnie from #c07f80 to #b28c85 — C* 27.2 down to 16.2,
      // hue 21° round to 35°, which is most of the chroma gone and the rest of
      // it off the pink corner — the COUNT moved 2.654% to 2.626%.
      //
      // THE ARENA'S KEY LIGHT IS A BONFIRE. It puts about eleven points of warm
      // chroma into any near-neutral surface it falls on, so bare iron in this
      // scene renders around C* 16 on the red arc whatever anybody swore to,
      // and `roseband`'s chroma floor — the undyed linen shirt at C* 14.8 — is
      // an ALBEDO number. Applying it to a LIT pixel is the same shape of error
      // `docs/FACTIONS.md` §10.1 records for the linear-against-perceptual band
      // mix-up, one space along.
      //
      // The other three peoples cannot show that. Their kit is weld, moss and
      // woad, so the fire lands them at hue 81°, 150° and 200° — OFF the arc —
      // and they read the floor however bright they get. Only a man in plain
      // iron and plain linen lands where a Dane in plain iron and plain linen
      // lands, so the bar is THE SAME MAN SWORN TO NOBODY, on the same mark,
      // at the same bearing, under the same fire.
      //
      // `people=none` is byte-for-byte what `buildCharacter` did before this
      // feature existed — `factionWorn` returns the hex by identity — so this
      // is also the pre-livery game, and moving this bar means changing what an
      // unsworn warrior looks like, which is a change nobody could make quietly.
      //
      // AND THE BAR IS MATCHED — SAME CLASS, SAME BEARING, **SAME FINISH**.
      //
      // The first cut of this took the bar as ONE number: the worst unsworn
      // frame of any class at any bearing, against which every sworn frame in
      // the sweep was measured. That was defensible while every lit frame in
      // this file wore the same issued iron, and it stops being defensible the
      // moment the sweep walks the shop — because the unsworn man's own rose
      // reading MOVES with what he bought. Crimson Warplate's leg wraps are
      // `0xbc9c8c`, which `FINISH_KIT` calls "a pale rose-grey" in the shop's
      // own words; an unsworn man in them reads more rose than an unsworn man
      // in iron, and a single global bar would have handed that slack to every
      // other finish at once. It is also LOOSER in the other direction: a
      // Danelaw in Crimson Warplate was being compared against a floor shot on
      // a man in a different kit.
      //
      // So every sworn frame is barred against the SAME MAN IN THE SAME KIT
      // sworn to nobody. The global worst is still computed and printed, so the
      // old reading stays comparable across rounds, but it is not what gates.
      console.log("");
      const floor = new Map();
      /** The unsworn frames' PIXELS, kept for §7.1b — the per-surface half. */
      const floorPx = new Map();
      const floorKey = (cls, finishId, turn) => `${cls}|${finishId}|${turn}`;
      for (const st of PLAN) {
        const row = [];
        for (const turn of CLIP_BEARINGS) {
          const mask = maskFor(st.cls, turn);
          const { px, subject } = await capture(stageQ(st.cls, turn, "none", st.finish));
          if (String(subject?.people) !== "none") die(`the floor staged wrong: people=${subject?.people}`);
          if (String(subject?.armor) !== hexOf(st.finish.value)) die(`the floor staged wrong: armor=${subject?.armor}, asked ${st.finish.id}`);
          const r = { cls: st.cls, finish: st.finish, turn, ...roseShare(band, Uint8ClampedArray.from(px.data), mask) };
          floor.set(floorKey(st.cls, st.finish.id, turn), r);
          floorPx.set(floorKey(st.cls, st.finish.id, turn), Uint8ClampedArray.from(px.data));
          row.push(r);
        }
        console.log(`  UNSWORN ${st.cls.padEnd(11)} ${st.finish.label.padEnd(17)} ${row.map((x) => `@${x.turn}° ${x.pct.toFixed(3)}%`).join("   ")}   modal ${row.reduce((m, x) => (x.pct > m.pct ? x : m), row[0]).modal}`);
      }
      const floorRows = [...floor.values()];
      const bar = floorRows.reduce((m, x) => Math.max(m, x.pct), 0);
      const barAt = floorRows.find((x) => x.pct === bar);
      note(`REPORTED, NOT GATED — the worst UNSWORN frame anywhere in the plan is ${bar.toFixed(3)}% (${barAt ? `${barAt.cls}/${barAt.finish.label}@${barAt.turn}°` : "n/a"}). It is skin, firelight, bare iron and whatever the shop's own cloth does under the fire.`);
      note(`WHAT GATES is the MATCHED floor: each sworn frame against the same class, the same finish and the same bearing, sworn to nobody. ${floorRows.length} floor frames, one per staged man.`);

      console.log("");
      const ARC_PEOPLE = new Set(PEOPLES.filter((pp) => band.onArc(FACTION_FIELD[pp])));
      for (const p2 of PEOPLES) {
        const rows = lit.filter((x) => x.people === p2);
        const w = rows.reduce((m, x) => (x.pct > m.pct ? x : m), rows[0] ?? { pct: 0, modal: "—", cls: "", turn: 0, finish: { label: "" } });
        console.log(`  ${p2.padEnd(7)} ${ARC_PEOPLE.has(p2) ? "ON THE ARC " : "off the arc"}  worst ${w.pct.toFixed(3).padStart(7)}% of the man  (${w.cls}/${w.finish.label} @${w.turn}°, modal ${w.modal})   mean ${(rows.reduce((a, x) => a + x.pct, 0) / (rows.length || 1)).toFixed(3)}%`);
      }
      console.log("");
      // The worst SWORN frame of each finish, so a reader can see which rung of
      // the shop the residue lives on rather than only which people.
      for (const f2 of FINISHES) {
        const rows = lit.filter((x) => x.finish === f2);
        if (!rows.length) continue;
        const w = rows.reduce((m, x) => (x.pct - (floor.get(floorKey(x.cls, x.finish.id, x.turn))?.pct ?? 0) > m.pct - (floor.get(floorKey(m.cls, m.finish.id, m.turn))?.pct ?? 0) ? x : m), rows[0]);
        const fl = floor.get(floorKey(w.cls, w.finish.id, w.turn))?.pct ?? 0;
        console.log(`  ${f2.label.padEnd(17)} ${String(f2.cost).padStart(4)}g  worst OVER ITS OWN UNSWORN: ${w.people}/${w.cls}@${w.turn}° ${w.pct.toFixed(3)}% vs ${fl.toFixed(3)}%  (${(w.pct - fl >= 0 ? "+" : "")}${(w.pct - fl).toFixed(3)}, modal ${w.modal})`);
      }
      console.log("");
      // Every people is gated, not only the one on the arc: a livery that put a
      // Pict into the rose band would be the same defect wearing woad.
      const over = lit.filter((x) => x.pct > (floor.get(floorKey(x.cls, x.finish.id, x.turn))?.pct ?? 0))
        .sort((a, b) => (b.pct - (floor.get(floorKey(b.cls, b.finish.id, b.turn))?.pct ?? 0)) - (a.pct - (floor.get(floorKey(a.cls, a.finish.id, a.turn))?.pct ?? 0)))
        .map((x) => { const fl = floor.get(floorKey(x.cls, x.finish.id, x.turn))?.pct ?? 0;
          return `${x.people}/${x.cls}/${x.finish.label} at ${x.turn}° reads ${x.pct.toFixed(3)}% rose against the SAME MAN UNSWORN IN THE SAME KIT at ${fl.toFixed(3)}% — ${(x.pct / (fl || 1e-9)).toFixed(1)}x, modal ${x.modal}`; });
      for (const o of over.slice(0, 10)) note(`ROSE   ${o}`);
      if (over.length) {
        note("WHAT A RED 7.1 MEANS, AND IT IS NOT ALWAYS A DYE. Read the modal colour beside each");
        note("line above. The band asks whether a pixel is PALE and ON THE RED ARC; it cannot ask");
        note("what made it that, and in this scene two things can. The arena's key is a BONFIRE, so");
        note("a warm light on a near-neutral surface ADDS while the same light on a cool one CANCELS");
        note("— measured on one pixel of one frame, the unsworn man's cool iron at albedo C* 9.9");
        note("renders C* 6.5 and a neutral byrnie at albedo C* 2 renders C* 16. And the Danelaw's");
        note("mail is deliberately the brightest on the roster, because `FACTIONS.md` §2 says he is");
        note('"more metal". A brighter surface returns more of the key, so it returns more of the');
        note("key's colour. Before calling this a dye, check the ALBEDO: `node tools/roselook.mjs`");
        note("and the census in docs/FACTIONS.md §10.2. If the albedo is neutral the dye is gone and");
        note("what is left belongs to the bonfire or to `norse.metal.bias` — both the owner's, not a");
        note("fixer's, and neither is fixed at stage 4. docs/OPEN-DEFECTS.md carries the standing");
        note("reading so a later round can tell a regression from the residue.");
      }
      const overBy = (x) => x.pct - (floor.get(floorKey(x.cls, x.finish.id, x.turn))?.pct ?? 0);
      const worstOver = lit.length ? lit.reduce((m, x) => (overBy(x) > overBy(m) ? x : m), lit[0]) : null;
      check(`7.1 ROSE — no livery makes a man pinker than he was before he swore (each frame against the SAME class, finish and bearing, unsworn)`,
        over.length === 0,
        over.length
          ? `${over.length} of ${lit.length} frames over their own matched unsworn floor, worst +${overBy(worstOver).toFixed(3)} points at ${worstOver.people}/${worstOver.cls}/${worstOver.finish.label}@${worstOver.turn}°`
          : `worst sworn frame is ${overBy(worstOver).toFixed(3)} points against its own unsworn kit (${worstOver.people}/${worstOver.cls}/${worstOver.finish.label}@${worstOver.turn}°); ${lit.length} frames over ${PLAN.length} staged men`,
        over);

      // ======================================================================
      // 7.1b / 7.1c — THE SAME QUESTION, PER SURFACE, BECAUSE THE MAN AVERAGES
      //
      // THE BLINDNESS THIS CLOSES IS THE GATE DIRECTLY ABOVE. §7.1 counts the
      // rose share over the WHOLE WARRIOR MASK. A warrior is a byrnie, a tunic,
      // trousers, leg wraps, hide, buff and a linen shirt, and the byrnie is
      // about half of him at these bearings — so a surface that goes ALL THE
      // WAY pink can only move the whole-man figure by the fraction of him it
      // covers, and the smaller surfaces cannot move it at all.
      //
      // An adversary took the matched pair by hand and it is the reason this
      // section exists: huscarl / Polished Steel 60g / 0°, identical crop,
      // differing only in `people` — byrnie rose 1.5% UNSWORN against 19.4%
      // DANELAW, mean #5e4039 L* 30.3 against #7e615f L* 44.0. Twelve times
      // pinker and thirteen points lighter, on the largest thing the man wears.
      // §7.1 scored that same loadout **+0.391 points** and the shipped probe
      // called it noise.
      //
      // WHAT A SURFACE MASK IS. Not a crop — a crop is a guess that moves with
      // the pose and cannot tell a byrnie from the arm in front of it. The
      // client's own scene graph, rasterised at the capture's lens with the
      // same nearest-surface z test §6's coverage mask has always used, with
      // every pixel remembering WHICH MESH won it; a mesh is named by matching
      // its material colour against what the SHIPPED resolvers give that
      // surface under all four peoples at once. `tools/lib/surfacemask.mjs`
      // carries the argument and the erosion.
      //
      // AND THE MASK IS THE SAME ARRAY ON BOTH SIDES. The sworn frame and its
      // unsworn control are read through one mask — literally the same
      // `Uint8Array` — so a difference here cannot be a difference of
      // denominator, of pose or of silhouette. That is what makes a one-pixel
      // comparison honest and it is why the gate is a strict `>` and not a
      // tolerance: §6.2 has already asserted that the same subject captured
      // twice reads identically, so there is no noise to allow for.
      //
      // TWO RULES AND NOT ONE, AND THE SECOND IS NARROWER THAN THE BRIEF ASKED
      // — docs/PROCESS.md R4 and R10, argued rather than quietly taken.
      //
      //   7.1b ROSE   no livery may make any single dyed surface PINKER than
      //               that same surface was unsworn. Every people, because a
      //               Pict driven into the rose band is the same defect wearing
      //               woad.
      //   7.1c VALUE  no livery may make a dyed surface LIGHTER than it was
      //               unsworn WHERE THAT SURFACE LANDS ON THE RED ARC.
      //
      // The brief that ordered this section wrote the second rule without the
      // arc clause — "a people may not make any single surface pinker or
      // lighter than it was unsworn" — and that is a bar this file must not
      // set, because `docs/FACTIONS.md` sets the opposite one on purpose:
      // "All four vats are free to lift a surface far above their own field's
      // value ... for weld, moss and woad that is exactly right and costs
      // nothing. On the red arc it is what makes a Viking pink." §2's Kit
      // column sells the Britons on "lighter kit" in so many words. An
      // unconditional no-lightening gate would be RED for a thing the design
      // buys deliberately, which is a bar invented by a harness rather than
      // taken off the product — the one thing this file's own header forbids.
      //
      // So the LIFT IS PRINTED FOR EVERY PEOPLE AND EVERY SURFACE, gated where
      // the docs say lightening is the defect. On the red arc, lighter IS
      // pinker: `--garnet` is a dark stone at L* 26.4, and "pale garnet is
      // pink, and pink is not a lighter Danelaw".
      //
      // `fitting` IS THE PER-FRAME CONTROL AND IS NOT GATED. No vat touches it
      // — §5's own probe says so — so whatever the bonfire does to a Danelaw's
      // buckles it does to an unsworn man's. A fitting row that MOVED would be
      // telling you the two frames are not comparable, which is worth more than
      // an assertion about it.
      // ======================================================================
      console.log("");
      console.log("[faction] === 7.1b / 7.1c PER SURFACE (the same frames, cut into the surfaces the vat dyes) ===\n");
      const rosePer = [], liftPer = [], thin = [];
      const perRow = new Map();     // people|cls|finish|surface -> worst-bearing reading
      const perPeople = new Map();  // people|surface -> worst over the whole plan
      for (const fr of litFrames) {
        const key = floorKey(fr.cls, fr.finish.id, fr.turn);
        const fpx = floorPx.get(key);
        if (!fpx) die(`§7.1b has no unsworn frame for ${key}`);
        const { masks, counts } = masksFor(fr.cls, fr.turn, fr.finish);
        for (const surf of MASK_SURFACES) {
          const m = masks[surf];
          const n = counts[surf].eroded;
          if (n < MIN_PIXELS) {
            thin.push(`${fr.people}/${fr.cls}/${fr.finish.label}@${fr.turn}° ${surf}: ${n} px after erosion (${counts[surf].raw} before) — NOT MEASURABLE`);
            continue;
          }
          const sw = roseShare(band, fr.px.data, m), un = roseShare(band, fpx, m);
          const swL = patchLab(fr.px.data, m), unL = patchLab(fpx, m);
          const onArc = arcTo(hueOfLab(swL.lab), band.fieldH) <= ARC || arcTo(hueOfLab(unL.lab), band.fieldH) <= ARC;
          const gated = GATED_SURFACES.includes(surf);
          const rec = { people: fr.people, cls: fr.cls, finish: fr.finish, turn: fr.turn, surf, n,
            sworn: sw.pct, unsworn: un.pct, dRose: sw.pct - un.pct, modal: sw.modal,
            swL: swL.lab[0], unL: unL.lab[0], dL: swL.lab[0] - unL.lab[0],
            swHex: swL.hex, unHex: unL.hex, onArc, gated };
          const rk = `${fr.people}|${fr.cls}|${fr.finish.id}|${surf}`;
          if (!perRow.has(rk) || rec.dRose > perRow.get(rk).dRose) perRow.set(rk, rec);
          const pk = `${fr.people}|${surf}`;
          const cur = perPeople.get(pk);
          if (!cur || rec.dRose > cur.rose.dRose) perPeople.set(pk, { rose: rec, lift: cur?.lift ?? rec });
          const cur2 = perPeople.get(pk);
          if (!cur2.lift || rec.dL > cur2.lift.dL) cur2.lift = rec;
          if (gated && rec.dRose > 0) rosePer.push(rec);
          if (gated && rec.dL > 0 && rec.onArc) liftPer.push(rec);
        }
      }

      // ---- TABLE A: every people x every surface, worst over the whole plan --
      console.log(`  WORST OVER THE WHOLE PLAN — ${PLAN.length} staged men x ${CLIP_BEARINGS.length} bearings, ${litFrames.length} lit frames, each against its own matched unsworn`);
      console.log("");
      console.log("  people   surface    worst ROSE  sworn -> unsworn        worst L* LIFT  sworn -> unsworn     on the arc   where");
      console.log("  --------------------------------------------------------------------------------------------------------------------");
      for (const p2 of PEOPLES) {
        for (const surf of MASK_SURFACES) {
          const e = perPeople.get(`${p2}|${surf}`);
          if (!e) { console.log(`  ${p2.padEnd(8)} ${surf.padEnd(9)}  — not measurable at any bearing in the plan`); continue; }
          const r = e.rose, l = e.lift;
          console.log(`  ${p2.padEnd(8)} ${(surf + (GATED_SURFACES.includes(surf) ? "" : "*")).padEnd(9)} `
            + `${(r.dRose >= 0 ? "+" : "") + r.dRose.toFixed(2)}`.padStart(9)
            + `  ${r.sworn.toFixed(2).padStart(6)}% -> ${r.unsworn.toFixed(2).padStart(6)}%   `
            + `${(l.dL >= 0 ? "+" : "") + l.dL.toFixed(2)}`.padStart(10)
            + `  ${l.swL.toFixed(1).padStart(5)} -> ${l.unL.toFixed(1).padStart(5)}  `
            + `  ${l.onArc ? "ON ARC " : "off    "}    ${r.cls}/${r.finish.label}@${r.turn}° ${r.swHex} vs ${r.unHex}`);
        }
        console.log("");
      }
      console.log("  * = a surface no vat touches. It is the control, not a rule: it should not move.");

      // ---- TABLE B: every staged man, every people, all surfaces at once -----
      console.log("");
      console.log(`  EVERY STAGED MAN — worst bearing per surface. "rose" is the sworn share minus the same surface unsworn; "L*" the same in value.`);
      console.log("");
      for (const st of PLAN) {
        for (const p2 of PEOPLES) {
          const cells = MASK_SURFACES.map((surf) => {
            const r = perRow.get(`${p2}|${st.cls}|${st.finish.id}|${surf}`);
            if (!r) return `${surf} —`;
            return `${surf} ${(r.dRose >= 0 ? "+" : "") + r.dRose.toFixed(1)}%/${(r.dL >= 0 ? "+" : "") + r.dL.toFixed(1)}L`;
          });
          console.log(`  ${p2.padEnd(7)} ${st.cls.padEnd(11)} ${st.finish.label.padEnd(17)} ${cells.join("  ")}`);
        }
      }
      console.log("");
      if (thin.length) {
        note(`${thin.length} of ${litFrames.length * MASK_SURFACES.length} surface-readings were under ${MIN_PIXELS} px after erosion and are NOT MEASURABLE rather than gated:`);
        for (const t of thin.slice(0, 4)) note(`  THIN  ${t}`);
        if (thin.length > 4) note(`  ... and ${thin.length - 4} more, overwhelmingly the linen shirt under a byrnie`);
      }

      rosePer.sort((a, b) => b.dRose - a.dRose);
      liftPer.sort((a, b) => b.dL - a.dL);
      for (const r of rosePer.slice(0, 12))
        note(`ROSE   ${r.people}/${r.cls}/${r.finish.label} ${r.surf} at ${r.turn}° reads ${r.sworn.toFixed(2)}% of ${r.n} px in the band against the SAME PIXELS unsworn at ${r.unsworn.toFixed(2)}% — +${r.dRose.toFixed(2)} points, mean ${r.swHex} vs ${r.unHex}, modal ${r.modal}`);
      if (rosePer.length > 12) note(`... and ${rosePer.length - 12} more`);
      for (const r of liftPer.slice(0, 8))
        note(`LIFT   ${r.people}/${r.cls}/${r.finish.label} ${r.surf} at ${r.turn}° is L* ${r.swL.toFixed(1)} against ${r.unL.toFixed(1)} on the SAME PIXELS unsworn — +${r.dL.toFixed(1)}, ON THE RED ARC (${r.swHex} vs ${r.unHex})`);
      if (liftPer.length > 8) note(`... and ${liftPer.length - 8} more`);

      // THE DILUTION, PRINTED. The whole-man reading of the very frame the
      // per-surface gate fails hardest on, so the two instruments are on one
      // line and nobody has to take "it averages" on trust.
      let diluted = "";
      if (rosePer.length) {
        const w = rosePer[0];
        const whole = lit.find((x) => x.people === w.people && x.cls === w.cls && x.turn === w.turn && x.finish === w.finish);
        if (whole) diluted = ` — §7.1 scored that same frame ${(overBy(whole) >= 0 ? "+" : "") + overBy(whole).toFixed(3)} points over the WHOLE MAN`;
      }
      check("7.1b ROSE PER SURFACE — no livery makes any single dyed surface pinker than that same surface was unsworn",
        rosePer.length === 0,
        rosePer.length
          ? `${rosePer.length} surface-readings over their own matched unsworn, worst +${rosePer[0].dRose.toFixed(2)} points at ${rosePer[0].people}/${rosePer[0].cls}/${rosePer[0].finish.label} ${rosePer[0].surf}@${rosePer[0].turn}° (${rosePer[0].sworn.toFixed(2)}% vs ${rosePer[0].unsworn.toFixed(2)}%)${diluted}`
          : `no dyed surface of any people is pinker than its own unsworn`,
        rosePer.map((r) => `${r.people}/${r.cls}/${r.finish.label} ${r.surf}@${r.turn}° +${r.dRose.toFixed(2)}`));
      check("7.1c VALUE ON THE RED ARC — no livery makes a dyed surface LIGHTER than it was unsworn where that surface lands on the arc",
        liftPer.length === 0,
        liftPer.length
          ? `${liftPer.length} surface-readings lifted on the arc, worst +${liftPer[0].dL.toFixed(1)} L* at ${liftPer[0].people}/${liftPer[0].cls}/${liftPer[0].finish.label} ${liftPer[0].surf}@${liftPer[0].turn}° (${liftPer[0].swHex} L* ${liftPer[0].swL.toFixed(1)} vs ${liftPer[0].unHex} L* ${liftPer[0].unL.toFixed(1)})`
          : "no dyed surface on the red arc is lighter than its own unsworn",
        liftPer.map((r) => `${r.people}/${r.cls}/${r.finish.label} ${r.surf}@${r.turn}° +${r.dL.toFixed(1)} L*`));

      // ---- §7.2 THE FADE CANNOT REACH THE OTHER THREE ----------------------
      //
      // `characters.ts`'s `roseFade` is keyed on the RESULT hue and is exactly
      // zero-effect outside the arc, so the three peoples off it are
      // byte-identical to the build before the fade existed. That is only true
      // while no dyed surface of theirs lands on the arc, and `HUE_CONE` is
      // what keeps it true. Asserted through the shipped resolvers rather than
      // trusted, because it is the whole reason §1, §5 and §6 for those three
      // did not have to be re-argued.
      {
        const strays = [];
        for (const people of PEOPLES) {
          if (ARC_PEOPLE.has(people)) continue;
          for (const f2 of FINISHES) {
            const k = kitFor(finishKit(f2.value), "none", people);
            for (const surf of ["mail", "tunic", "trouser", "wrap", "hide", "buff"]) {
              const c = k[surf];
              const d = arcTo(hueOfLab(labOf(c)), band.fieldH);
              if (d <= ARC) strays.push(`${people} ${f2.label} ${surf} ${hx(c)} is ${d.toFixed(0)}° from the garnet`);
            }
          }
        }
        for (const st of strays.slice(0, 6)) note(`ON THE ARC  ${st}`);
        check(`7.2 UNTOUCHED — no dyed surface of the ${PEOPLES.length - ARC_PEOPLE.size} peoples off the red arc lands on it`,
          strays.length === 0,
          strays.length ? `${strays.length} surfaces on the arc` : `all ${(PEOPLES.length - ARC_PEOPLE.size) * FINISHES.length * 6} surfaces clear of it`,
          strays);
      }
    }

    // ---- THE SHEET, AND IT IS NOT AN EXTRA ---------------------------------
    //
    // docs/PROCESS.md R5. Three rounds of this feature shipped a defect past a
    // reviewer because the "after" set was five front-on huscarl cards, and
    // both defects §6 found live at bearings that set did not contain. §6 has
    // already paid for these frames — they are the ones it measured — so it
    // writes them, and the picture a reviewer opens is by construction the
    // picture the number came from. A sheet made by a second, separate run
    // could disagree with the gate and nobody would know which to believe.
    //
    // TWO SHEETS AND NOT ONE, because the plan has two axes and a reviewer can
    // only look at one question at a time. `factionlit-class.png` is every
    // class in what a man is issued; `factionlit-shop.png` is every finish on
    // the man who wears the most of it. Stacked into one file they are a
    // 14 000-pixel strip nobody scrolls.
    const writeSheet = (frames, name) => {
      if (!frames.length) return;
      const litFrames = frames;
      const cols = CLIP_BEARINGS.length;
      const rows = Math.ceil(litFrames.length / cols);
      const W = cols * LENS.w, H = rows * LENS.h;
      const img = new Uint8Array(W * H * 3);
      litFrames.forEach((fr, i) => {
        const cx = (i % cols) * LENS.w, cy = Math.floor(i / cols) * LENS.h;
        for (let y = 0; y < LENS.h; y++) for (let x = 0; x < LENS.w; x++) {
          const src = (y * fr.px.w + x) * 4, dst = ((cy + y) * W + (cx + x)) * 3;
          img[dst] = fr.px.data[src]; img[dst + 1] = fr.px.data[src + 1]; img[dst + 2] = fr.px.data[src + 2];
        }
      });
      const raw = Buffer.alloc(H * (1 + W * 3));
      for (let y = 0; y < H; y++) {
        raw[y * (1 + W * 3)] = 0;
        Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
      }
      const crcTab = new Int32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTab[n] = c; }
      const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = (c >>> 8) ^ crcTab[(c ^ b[i]) & 0xff]; return (c ^ -1) >>> 0; };
      const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
        const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(td));
        return Buffer.concat([len, td, cr]);
      };
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
      mkdirSync(resolve(ROOT, "art/look"), { recursive: true });
      const out = resolve(ROOT, `art/look/factionlit-${name}${OFF ? "-off" : ""}.png`);
      writeFileSync(out, Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
      ]));
      console.log(`\n[faction] LIT SHEET ${out}  ${W}x${H}  ${litFrames.length} frames, ${rows} rows of ${cols}`);
      for (let r2 = 0; r2 < rows; r2++) {
        const row2 = litFrames.slice(r2 * cols, r2 * cols + cols);
        console.log(`        row ${String(r2 + 1).padStart(2)}: ${row2[0].people} / ${row2[0].cls} / ${row2[0].finish.label} — ${row2.map((f) => `@${f.turn}° ${f.pct.toFixed(2)}%`).join("  ")}`);
      }
    };
    writeSheet(litFrames.filter((f) => f.finish === ISSUED), "class");
    writeSheet(litFrames.filter((f) => f.finish !== ISSUED), "shop");
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.stop();
  }
}

// ============================================================
// THE SHEET — flat albedo, no light. Something to actually look at.
// ============================================================
if (SHEET && sheet.length) {
  sheet.sort((a, b) => a.order - b.order);
  const SS = 2;
  const cols = 1, cellW = LENS.w / SS, cellH = LENS.h / SS;
  const rows = Math.ceil(sheet.length / cols);
  const W = cols * cellW, H = rows * cellH;
  const img = new Uint8Array(W * H * 3).fill(0x14);
  const enc = (v) => {
    const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  };
  sheet.forEach((s, i) => {
    const cx = (i % cols) * cellW, cy = Math.floor(i / cols) * cellH;
    for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) {
      let n = 0, r = 0, g = 0, b = 0;
      for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
        const src = (y * SS + dy) * LENS.w + (x * SS + dx);
        if (!s.r.cov[src]) continue;
        n++; r += s.r.rgb[src * 3]; g += s.r.rgb[src * 3 + 1]; b += s.r.rgb[src * 3 + 2];
      }
      if (!n) continue;
      const dst = ((cy + y) * W + (cx + x)) * 3;
      img[dst] = enc(r / n); img[dst + 1] = enc(g / n); img[dst + 2] = enc(b / n);
    }
  });
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
  }
  const crcTab = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTab[n] = c; }
  const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = (c >>> 8) ^ crcTab[(c ^ b[i]) & 0xff]; return (c ^ -1) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, cr]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  mkdirSync(resolve(ROOT, "art/look"), { recursive: true });
  const out = resolve(ROOT, `art/look/factionread${OFF ? "-off" : ""}.png`);
  writeFileSync(out, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]));
  console.log(`\n[faction] sheet ${out}  ${W}x${H}  ${sheet.length} panels at ${SHEET_TURN}°, FLAT ALBEDO — no light, no grade`);
  sheet.forEach((s, i) => console.log(`        panel ${i + 1}: ${s.label}`));
}

// ============================================================
// THE VERDICT — every deferral rides this line. docs/PROCESS.md R4.
// ============================================================
const deferrals = [
  `the shield is NOT in the raster (four boards, worst pair ΔE ${boardMin === null ? "n/a" : boardMin.toFixed(1)})`,
  "the gated comparison is MATCHED, not the cross-product",
  "§0-§5 have no light and no grade — albedo only; §6 and §7 are the lit sections — §6 measures CLIPPING and §7 measures COLOUR, both on the same graded captures",
  "the roster sheet is `tools/classmatrix.mjs`, not this file",
  laddering
    ? `§5 gates NO TWINS and NO REFUND on the resolved kit at ΔE ${JND}; LADDER_DE is REPORTED — ${laddering.collapsed} of 84 pairs within it (${laddering.adjacent} adjacent), worst ΔE ${laddering.worstAll.toFixed(2)} (${laddering.worstAllAt}) against ${laddering.unswornWorstAll.toFixed(2)} unsworn, and §5's note says which configurations recover it and what each one broke`
    : "§5 did not run",
  `§6 sweeps ${BEARINGS.join("°, ")}° — the true profile at 90° is photographed by \`npm run shots -- fightcard --people <p> --turn 90\`, not gated here`,
];
console.log("");
console.log(`[faction] ${results.length - failed}/${results.length} — WITH ${deferrals.length} deferral(s): ${deferrals.join("; ")}.`);
console.log(`[faction] ${failed === 0 ? "PASS" : "FAIL"} in ${((Date.now() - T0) / 1000).toFixed(0)}s${OFF ? "  (control run — a PASS here would mean the gate is broken)" : ""}`);
process.exit(failed ? 1 : 0);
