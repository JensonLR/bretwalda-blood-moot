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
import { spawnSync, spawn } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { deflateSync } from "zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = resolve(ROOT, ".factionread");
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
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/render/anim.ts",
  "--outDir", ".factionread", "--target", "es2022", "--module", "esnext",
  "--moduleResolution", "bundler", "--skipLibCheck"], { cwd: ROOT, encoding: "utf8" });
const emitted = [];
let charJs = null, animJs = null;
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
  const f = resolve(d, e.name);
  if (e.isDirectory()) walk(f);
  else if (e.name.endsWith(".js")) {
    emitted.push(f);
    if (e.name === "characters.js") charJs = f;
    if (e.name === "anim.js") animJs = f;
  }
} };
if (existsSync(WORK)) walk(WORK);
for (const f of emitted) {
  const src = readFileSync(f, "utf8");
  const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c));
  if (fixed !== src) writeFileSync(f, fixed);
}
if (!charJs) die(`tsc emitted nothing:\n${tsc.stdout || ""}${tsc.stderr || ""}`);
const CH = await import(pathToFileURL(charJs).href);
const {
  ARMOURY, buildCharacter, buildShield, buildWeaponForClass, defaultAppearance,
  shieldBoard, FACTION_FIELD, PEOPLE_IDS, TEAM_FIELD,
  finishKit, kitFor, cloakFor,
} = CH;
if (!finishKit || !kitFor || !cloakFor)
  die("characters.ts does not export finishKit / kitFor / cloakFor — §5 must measure the SHIPPED resolvers, not a copy of them");
if (!FACTION_FIELD || !PEOPLE_IDS) die("characters.ts does not export FACTION_FIELD / PEOPLE_IDS — the four colours this harness must not guess");
const ANIM = animJs && existsSync(animJs) ? await import(pathToFileURL(animJs).href) : null;
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
 * Rasterises a scene graph into an albedo buffer and a coverage mask. Lifted
 * unchanged from `tools/teamread.mjs` — same lens algebra, same nearest-surface
 * z test, same linear-light material read.
 */
function raster(root, turnDeg) {
  const W = LENS.w, H = LENS.h;
  const f = framing(turnDeg);
  const [ex, ey, ez] = f.eye, [tx, ty, tz] = f.target;
  let fx = tx - ex, fy = ty - ey, fz = tz - ez;
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  let sx = -fz, sy = 0, sz = fx;
  const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
  const vx = sy * fz - sz * fy, vy = sz * fx - sx * fz, vz = sx * fy - sy * fx;
  const tanH = Math.tan((LENS.fov * Math.PI) / 360);
  const aspect = LENS.w / LENS.h;

  const depth = new Float32Array(W * H).fill(Infinity);
  const cov = new Uint8Array(W * H);
  const rgb = new Float32Array(W * H * 3);
  root.rotation.y = f.rot;
  root.updateMatrixWorld(true);

  const NEAR = 0.05;
  const A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0];
  const toScreen = (px, py, pz, out) => {
    const dx = px - ex, dy = py - ey, dz = pz - ez;
    const cz = dx * fx + dy * fy + dz * fz;
    out[2] = cz;
    if (cz < NEAR) return false;
    out[0] = ((dx * sx + dy * sy + dz * sz) / (cz * tanH * aspect)) * 0.5 * W + W * 0.5;
    out[1] = H * 0.5 - ((dx * vx + dy * vy + dz * vz) / (cz * tanH)) * 0.5 * H;
    return true;
  };

  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry;
    const pos = g.attributes?.position;
    if (!pos) return;
    const col = o.material?.color;
    if (!col) return;
    const cr = col.r, cg = col.g, cb = col.b;
    const idx = g.index;
    const m = o.matrixWorld.elements;
    const n = idx ? idx.count : pos.count;
    const pa = pos.array, ia = idx?.array;
    for (let t = 0; t < n; t += 3) {
      let ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        const j = ia ? ia[t + k] : t + k;
        const x = pa[j * 3], y = pa[j * 3 + 1], z = pa[j * 3 + 2];
        ok = toScreen(
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
          k === 0 ? A : k === 1 ? B : C);
      }
      if (!ok) continue;
      const minx = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])));
      const maxx = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
      const miny = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])));
      const maxy = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
      if (minx > maxx || miny > maxy) continue;
      const d = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
      if (d === 0) continue;
      for (let y = miny; y <= maxy; y++) {
        for (let x = minx; x <= maxx; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((B[0] - A[0]) * (py - A[1]) - (px - A[0]) * (B[1] - A[1])) / d;
          const w1 = ((px - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (py - A[1])) / d;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w2 * A[2] + w1 * B[2] + w0 * C[2];
          const o2 = y * W + x;
          if (z < depth[o2]) {
            depth[o2] = z; cov[o2] = 1;
            rgb[o2 * 3] = cr; rgb[o2 * 3 + 1] = cg; rgb[o2 * 3 + 2] = cb;
          }
        }
      }
    }
  });

  let area = 0, r = 0, g = 0, b = 0;
  for (let i = 0; i < W * H; i++) {
    if (!cov[i]) continue;
    area++; r += rgb[i * 3]; g += rgb[i * 3 + 1]; b += rgb[i * 3 + 2];
  }
  return { cov, rgb, area, mean: area ? [r / area, g / area, b / area] : [0, 0, 0] };
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
const FINISHES = slotOf("armor").options.map((o) => ({ label: o.label, value: Number(o.value) }));
const CLOAKS = slotOf("cloak").options.map((o) => ({ label: o.label, value: String(o.value) }));
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const PEOPLES = [...PEOPLE_IDS];
const SEED = 13;

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
  const freeVsPaid = [];     // GATED — the owner's sentence
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
  for (const f of freeVsPaid.slice(0, 8)) note(`REFUND  ${f}`);
  if (freeVsPaid.length > 8) note(`... and ${freeVsPaid.length - 8} more free-vs-paid collapses`);

  // ---- THE THREE GATED RULES ------------------------------------------------
  //
  // All three are `cosmetictest.mjs` §2's own, moved off the RAW STORED HEX and
  // onto what `kitFor(finishKit(v), team, people)` actually hands the renderer.
  // That move is the whole fix to the instrument: the seven stored numbers are
  // the same seven numbers whatever a man swore to, so the shop's existing gate
  // could not have seen this and did not.
  check(`5.1 LADDER — every paid rung clears ΔE ${LADDER_DE} against the rung below it, under EVERY livery`,
    dullAdjacent.length === 0,
    dullAdjacent.length ? `${dullAdjacent.length} dull rungs, worst adjacent pair ΔE ${worstAdj.toFixed(2)}`
      : `worst adjacent pair under any livery ΔE ${worstAdj.toFixed(2)}`,
    dullAdjacent);
  check("5.2 NO REFUND — no paid finish reads as the FREE one under any livery",
    freeVsPaid.length === 0,
    freeVsPaid.length ? `${freeVsPaid.length} paid rungs collapse onto Rough Iron (0g)` : "every paid rung stays paid in all four liveries",
    freeVsPaid);
  check(`5.3 NO TWINS — no two of the seven finishes are one swatch (ΔE ${JND}) under any livery`,
    sameColour.length === 0,
    sameColour.length ? `${sameColour.length} pairs below a JND` : `worst pair of all under any livery ΔE ${worstAll.toFixed(2)}`,
    sameColour);

  // ---- REPORTED, NOT GATED, AND THE ARGUMENT IS WRITTEN OUT ------------------
  //
  // The brief that ordered this section asked for a fourth rule: EVERY one of
  // the 21 pairs, not only the adjacent ones, to clear `LADDER_DE` under every
  // livery. It is not gated, and this is the reason, measured rather than
  // asserted — docs/PROCESS.md R4 and R10.
  //
  // The unsworn shop's own tightest pair is Bronze Scales (110g) against
  // Bretwalda Gold (160g) at ΔE 11.85. That leaves a livery 1.85 points of room
  // on that pair before it goes under the bar — a livery would have to be very
  // nearly an ISOMETRY. The chroma plane can be made one: addition preserves
  // differences exactly, which is why `factionDye` adds. LIGHTNESS cannot,
  // because `Dye.bias` and the `lo`/`hi` bands are where FACTIONS.md §2's
  // "darker wools" and "lighter kit" live, and darkening a man compresses the
  // value differences between his finishes. That is not an implementation
  // detail; it is the feature.
  //
  // The trade was measured across the whole parameter space rather than guessed
  // at. Holding the four peoples' value bands as they are, the tightest pair
  // under any livery tops out at ΔE 8.4-9.8. Dissolving them — cutting `bias`
  // to a fifth and widening every band by 30% — buys ΔE 10.2, and costs the
  // Danelaw being dark, which is the one read in this feature that is a
  // CONTRAST rather than a colour.
  //
  // So the fourth rule is REPORTED with its number on every run, and the two
  // pairs that fail it are named. Moving a bar to buy a pass is forbidden;
  // adopting a bar the game cannot meet, and then quietly not printing the
  // shortfall, is the same offence facing the other way.
  note(`REPORTED, NOT GATED — of the 21 pairs under each of the four liveries, ${collapsed.length} come within ΔE ${LADDER_DE};`
    + ` the worst is ${worstAll.toFixed(2)} (${worstAllAt}), against ${unswornWorstAll.toFixed(2)} for the same pair unsworn.`);
  for (const c of collapsed) note(`  NEAR  ${c}`);
  laddering = { collapsed: collapsed.length, worstAll, worstAllAt, worstAdj, unswornWorstAll };
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
// COST. This section boots the app and a browser and takes about forty
// captures at forty to fifty seconds each on a box with no GPU. The rest of
// this file is two minutes; this is most of an hour. It is not optional and
// there is no flag to skip it: the three rounds of this feature that shipped a
// defect all shipped it past a harness that had no light in it.
// ============================================================
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
   * The mask, off the rasteriser, at the capture's own scale. §0.3 has already
   * asserted that a livery moves NO geometry, so ONE mask per class and bearing
   * serves all five liveries and the control — which is also why a mask can be
   * used at all: if a people moved a triangle this denominator would be a
   * different denominator for each of them.
   */
  const maskFor = (cls, turn) => raster(build(cls, FINISHES[0].value, "red", "none").group, turn).cov;

  const server = await bootServer();
  let browser = null, page = null;
  try {
    browser = await launchBrowser();
    const ctx = await browser.newContext({ viewport: { width: LENS.w, height: LENS.h }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
    await ctx.addInitScript(installVirtualClock, FRAME_MS);
    page = await ctx.newPage();

    let shots = 0;
    const capture = async (q) => {
      await page.goto(`${server.origin}/shot?${q}`, { waitUntil: "domcontentloaded", timeout: 300000 });
      await page.waitForFunction(() => window.__shotReady === true || typeof window.__shotError === "string", null, { timeout: 300000 });
      const staged = await page.evaluate(() => ({ subject: window.__shotSubject ?? null, refused: window.__shotError ?? null }));
      if (staged.refused) die(`the page refused the stage: ${staged.refused} (${q})`);
      const buf = await page.screenshot({ timeout: 300000 });
      shots++;
      return { subject: staged.subject, px: await page.evaluate(async (b64) => {
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
    await capture(`preset=fightcard&clean=1&settle=16&turn=0&cls=huscarl&people=none`);

    // §6.2 — THE FLOOR, MEASURED. The clock is fixed and the die is seeded, and
    // this is what proves it: the same subject twice, through the whole capture
    // path, must give the same count. Without it a clip reading could be
    // re-rolled until it passed, and nobody would be able to tell.
    {
      const m = maskFor("huscarl", 0);
      const q = `preset=fightcard&clean=1&settle=16&turn=0&cls=huscarl&people=saxon`;
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
    for (const cls of CLASSES) {
      for (const people of PEOPLES) {
        const row = [];
        for (const turn of CLIP_BEARINGS) {
          const mask = maskFor(cls, turn);
          const { px, subject } = await capture(`preset=fightcard&clean=1&settle=16&turn=${turn}&cls=${cls}&people=${OFF ? "none" : people}`);
          if (String(subject?.people) !== (OFF ? "none" : people)) die(`asked for people=${people}, got ${subject?.people}`);
          const r = clipShare(Uint8ClampedArray.from(px.data), mask, px.w);
          row.push(`@${turn}° ${r.pct.toFixed(2)}%`);
          if (r.pct > worst) { worst = r.pct; worstAt = `${people}/${cls}@${turn}°`; }
          if (r.pct > bar) over.push(`${people}/${cls} at ${turn}° clips ${r.pct.toFixed(2)}% of the man — ${(r.pct / (bar || 1e-9)).toFixed(1)}x the 400g gold cloak's ${bar.toFixed(2)}%, hottest ${hottest(Uint8ClampedArray.from(px.data), mask)}`);
        }
        console.log(`  ${people.padEnd(7)} ${cls.padEnd(11)} ${row.join("   ")}`);
      }
    }
    console.log("");
    for (const o of over.slice(0, 10)) note(`BLOWN   ${o}`);
    check(`6.1 CLIP — no livery blows a channel past the shop's own dearest gold (${bar.toFixed(2)}% of the man)`,
      over.length === 0,
      over.length
        ? `${over.length} of ${CLASSES.length * PEOPLES.length * CLIP_BEARINGS.length} frames over the bar, worst ${worst.toFixed(2)}% at ${worstAt}`
        : `worst livery frame ${worst.toFixed(2)}% at ${worstAt}, under the ${bar.toFixed(2)}% bar`,
      over);
    console.log(`        ${shots} captures at ${LENS.w}x${LENS.h}, the play lens, through the real renderer`);
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
  "§0-§5 have no light and no grade — albedo only; §6 is the only lit section and it measures CLIPPING, not colour",
  "the roster sheet is `tools/classmatrix.mjs`, not this file",
  laddering
    ? `§5 gates cosmetictest's own two rules on the resolved kit; the stricter ALL-PAIRS reading of LADDER_DE is REPORTED — ${laddering.collapsed} pairs within it, worst ΔE ${laddering.worstAll.toFixed(2)} (${laddering.worstAllAt}) against ${laddering.unswornWorstAll.toFixed(2)} unsworn`
    : "§5 did not run",
  `§6 sweeps ${BEARINGS.join("°, ")}° — the true profile at 90° is photographed by \`npm run shots -- fightcard --people <p> --turn 90\`, not gated here`,
];
console.log("");
console.log(`[faction] ${results.length - failed}/${results.length} — WITH ${deferrals.length} deferral(s): ${deferrals.join("; ")}.`);
console.log(`[faction] ${failed === 0 ? "PASS" : "FAIL"} in ${((Date.now() - T0) / 1000).toFixed(0)}s${OFF ? "  (control run — a PASS here would mean the gate is broken)" : ""}`);
process.exit(failed ? 1 : 0);
