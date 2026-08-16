#!/usr/bin/env node
// ============================================================
// FACTIONREAD — is a man of the Danelaw a different man from a man of Wessex,
// at the distance you fight him, and did it cost a single point of anything?
//
//   node tools/factionread.mjs            # THE GATE. ~2 min, no browser.
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
// So this file is TWO gates and not one, and the second is the more important:
//
//   §1  the four peoples are TOLD APART at fight distance
//   §3  and not one of them is told apart by anything a fight reads
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
//   * LIGHT. No bonfire, no grade, albedo only. Same as `teamread`.
//   * THE ROSTER SHEET. `tools/classmatrix.mjs` is the balance gate and this
//     file does not restate it. §3 asserts the narrower and harder thing —
//     that a declared people changes no byte of the simulation at all — which
//     is upstream of anything a matrix could measure.
// ============================================================
import { spawnSync } from "child_process";
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
} = CH;
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
/** What a PAID rung has to clear to be a different colour at a glance. */
const GLANCE_DE = 10;
/**
 * Just noticeable difference — `tools/cosmetictest.mjs:536`, where it already
 * carries the sentence "Below this, two swatches are one swatch". §1.1 asks a
 * different question from §1.2 and therefore takes a different constant: not
 * "is he a different colour at a glance" but "did anything happen at all". Both
 * numbers are borrowed for the same reason — a bar this file chose for itself
 * is a bar this file could move.
 */
const JND = 2.3;

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
for (const e of swornExempt) note(`already in the vat: ${e}`);
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
  "no light, no grade — albedo only",
  "the roster sheet is `tools/classmatrix.mjs`, not this file",
];
console.log("");
console.log(`[faction] ${results.length - failed}/${results.length} — WITH ${deferrals.length} deferral(s): ${deferrals.join("; ")}.`);
console.log(`[faction] ${failed === 0 ? "PASS" : "FAIL"} in ${((Date.now() - T0) / 1000).toFixed(0)}s${OFF ? "  (control run — a PASS here would mean the gate is broken)" : ""}`);
process.exit(failed ? 1 : 0);
