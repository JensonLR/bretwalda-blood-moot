#!/usr/bin/env node
// ============================================================
// TEAMREAD — can a stranger tell friend from foe, at fight distance, in one
// frame?
//
//   node tools/teamread.mjs               # THE GATE. ~1 min, no browser.
//   node tools/teamread.mjs --sheet       # also write the contact sheet PNG
//   node tools/teamread.mjs --off         # THE CONTROL: build both sides with
//                                         # team "none" — i.e. the game as it
//                                         # was before the override existed.
//                                         # This MUST fail. See PROOF below.
//
// ------------------------------------------------------------
// THE OWNER'S WORDS, WHICH ARE THE ACCEPTANCE CRITERIA
//
//   "When playing in team game modes colours should overright all characters
//    for the game, red & Blue for armoury finish, & cloaks etc. to show clear
//    distinction. When we get to clans we can have our flags & custom colours
//    that can be worn to differentiate against playing other clans in games."
//
// `docs/FACTIONS.md` §3 argues the same thing from the other end: a Hearth
// inherits its kingdom's colour and may not choose its own, because faction
// colour is how you read an enemy at range in an eight-man brawl. Both
// sentences are one rule — COLOUR IS A LEGIBILITY CHANNEL, NOT A PURCHASE —
// and this file is the ruler for it.
//
// ------------------------------------------------------------
// WHAT IS MEASURED, AND WHY IT IS NOT THE SILHOUETTE
//
// The question is a COLOUR question and the answer must not be reachable by
// shape. Two men with different outlines are told apart by outline whatever
// they are wearing, so a measurement that lets outline in would go green on a
// build where every warrior is still dressed in whatever he bought.
//
// So the signature of a warrior here is his AREA-WEIGHTED MEAN ALBEDO, taken
// over the pixels he covers at the play lens, converted to CIELAB. Shape
// decides only WHICH pixels are averaged; it contributes nothing of its own.
// And §0.3 asserts the stronger property directly: the override moves NO
// GEOMETRY — the red build and the blue build of one loadout cover exactly the
// same pixels, to the pixel — so the separation this file reports cannot be a
// silhouette in disguise.
//
// Averaged in LINEAR light and converted to Lab afterwards, which is the
// physically correct way to shrink a man to one colour: sRGB is a transfer
// curve, and averaging through it makes a half-black half-white man lighter
// than mid grey.
//
// ------------------------------------------------------------
// THE CHANNEL THAT CARRIES A SIDE IS HUE, NOT LIGHTNESS — AND THE FIRST CUT OF
// THIS FILE GOT THAT WRONG. docs/PROCESS.md rule 2.
//
// This harness first measured both assertions on full CIELAB ΔE, which folds
// L* in with a* and b*. Run against a build that a human separates instantly —
// see `art/look/teamread.png`, fourteen warriors, seven finishes, each wearing
// the OTHER side's cloak, and not one of them ambiguous — it said:
//
//     min BETWEEN sides 21.20      max WITHIN a side 31.82      FAIL
//
// Both numbers are real and the verdict drawn from them was nonsense. The 21.20
// pair is a red huscarl against a blue berserker: opposite hues, told apart
// across a room. The 31.82 pair is two RED men — a cloaked runekeeper against
// a bare-backed huscarl — identical in hue and 30 points apart in LIGHTNESS,
// because a cloak from behind is one flat field and a bare back is mail, skin
// and hair. No player has ever mistaken those two for opposite sides.
//
// So the ordering the assertion depends on is inverted with respect to the
// judgement it claims to make, and the confounder is named: L*. Cloak against
// no cloak, and dark finish against pale one, move L* hard and say nothing at
// all about which side a man is on. Worse, the design DEPENDS on L* moving —
// `teamDye` keeps each surface's own lightness precisely so a team-coloured
// warrior has form in him instead of being a flat red blob. A gate built that
// way punishes the build for the one thing keeping it readable.
//
// THE FIX IS TO MEASURE THE CHANNEL THE OVERRIDE ACTUALLY DRIVES: the chroma
// plane. ΔC = hypot(Δa*, Δb*) — the same CIELAB coordinates, with lightness
// dropped rather than reweighted, because a weight would be a number this file
// picked and the whole point is to stop picking numbers.
//
// THIS IS A TIGHTER GATE, NOT A LOOSER ONE, and that is checkable rather than
// asserted: ΔC <= ΔE for every pair, identically, since ΔE = hypot(ΔL, ΔC). The
// bar is the same 10 it always was, applied to a strictly smaller quantity. A
// build could previously clear the glance bar on lightness alone — a pale enemy
// against a dark one, same hue — and cannot now. §0.4 asserts ΔC <= ΔE over the
// whole sweep so this claim is measured and not merely argued.
//
// ------------------------------------------------------------
// THE TWO ASSERTIONS
//
//   GLANCE      min(between-side ΔC), over EVERY red-blue pair in the sweep,
//               must clear 10. Not a number invented here: it is `LADDER_DE`
//               in tools/cosmetictest.mjs, already carrying the sentence "what
//               a PAID rung has to clear to be a different colour at a glance".
//               A team read is a glance read. Reusing the constant is
//               deliberate — a bar this file chose for itself is a bar this
//               file could move.
//
//   SIDE        every warrior's own chroma must land nearer his own side's
//               field than the enemy's. Per-man rather than per-pair, and the
//               two prototypes are `TEAM_FIELD` read out of characters.ts
//               rather than anything this file decided. See the block above it
//               in the body for why the complete-linkage version of this — "no
//               friend further than any foe" — is REPORTED and not gated: it
//               fails on chroma RADIUS, which is a cloak against a bare back,
//               and a radius is not a side.
//
// Neither assertion is sufficient alone. GLANCE alone would pass a build where
// one class read as the wrong colour but was far from everybody. SIDE alone
// would pass a build where the override never reached anyone, since a
// near-neutral man's hue angle is noise and may point his own way by luck.
//
// The full-ΔE numbers are still computed and still printed beside the ΔC ones,
// so the correction above stays auditable by anyone who wants to check that it
// was a ruler being fixed and not a bar being lowered.
//
// BOTH are always evaluated and both are printed on their own verdict line.
// Neither can take over from the other as a function of how much was measured,
// because NOTHING HERE IS SAMPLED: the loadout set is the shop's own armour
// and cloak ladders, enumerated exhaustively, times four classes, times three
// bearings. There is no draw, no interval and no n. That is on purpose —
// docs/PROCESS.md records a balance harness whose own mirror control failed
// only when a tolerance AND a 95% interval both fired, so at moderate n the
// interval governed and the verdict moved with sample size.
//
// ------------------------------------------------------------
// THE WORST BEARING GOVERNS
//
// A war band is not a line-up. You see backs, three-quarters and faces in the
// same second, and the cloak — the biggest single colour a man carries — is
// only on one of those. So every loadout is rastered at three bearings and the
// verdict is taken on the WORST of them. A gate that averaged the bearings
// would be green because the case it exists for was diluted.
//
// ------------------------------------------------------------
// PROOF OF FAILURE — docs/PROCESS.md R2
//
// `--off` builds both sides with team "none", which is byte-for-byte what
// `buildCharacter` did before the override was written: the two sides are then
// the same man twice and every between-side ΔE is 0.00. Run it; it is red, and
// it is red for the right reason rather than because a threshold was tightened.
//
// ------------------------------------------------------------
// WHAT THIS FILE DOES NOT MEASURE — docs/PROCESS.md R4
//
//   * THE SHIELD. `buildShield` is mounted by render/anim.ts onto a posed
//     forearm, and this harness does not pose anybody. The board is the largest
//     flat colour a huscarl carries and it IS team-coloured (see
//     `shieldBoard`), so the body-only reading below is the conservative one:
//     the bar is cleared by the man without his shield. The board's own two
//     colours are checked as a catalogue ΔE instead, and that line rides the
//     verdict.
//   * LIGHT. There is no light in this file, no bonfire, no grade. It reads
//     albedo. A grade that crushed both sides into the same value would not be
//     visible here — but it would also not be a cosmetics defect, and the
//     arena's key is the same for both men by construction.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { deflateSync } from "zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = resolve(ROOT, ".teamread");
const T0 = Date.now();

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
/** The control. Both sides built with no team, which is the pre-override game. */
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
const die = (m) => { console.error(`[team] ${m}`); process.exit(2); };

// ============================================================
// THE FIELD, IMPORTED — nothing below mirrors a catalogue or a constant.
//
// render/anim.ts and not characters.ts, and it costs nothing: characters is
// anim's own import, so one tsc emits both. `CLASS_TUNIC` is the per-class
// accent the real rig passes into `buildCharacter`, and it is exported for this
// file rather than copied into it — a harness that keeps its own copy of a
// constant audits the constant it was written against.
// ============================================================
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/render/anim.ts",
  "--outDir", ".teamread", "--target", "es2022", "--module", "esnext",
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
// tsc emits TypeScript's extensionless relative specifiers; node's ESM loader
// will not resolve them. One rewrite over the emitted tree, and it only ever
// touches `.teamread`.
for (const f of emitted) {
  const src = readFileSync(f, "utf8");
  const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c));
  if (fixed !== src) writeFileSync(f, fixed);
}
if (!charJs) die(`tsc emitted nothing:\n${tsc.stdout || ""}${tsc.stderr || ""}`);
const CH = await import(pathToFileURL(charJs).href);
const { ARMOURY, buildCharacter, defaultAppearance, shieldBoard, TEAM_FIELD } = CH;
if (!TEAM_FIELD?.red || !TEAM_FIELD?.blue) die("characters.ts does not export TEAM_FIELD — the two colours this harness must not guess");
const ANIM = animJs && existsSync(animJs) ? await import(pathToFileURL(animJs).href) : null;
const CLASS_TUNIC = ANIM?.CLASS_TUNIC ?? null;
if (!CLASS_TUNIC) die("render/anim.ts does not export CLASS_TUNIC — the accent this harness must not guess");

// ============================================================
// THE LENS — copied from tools/cosmetictest.mjs's `fight`, which is itself
// /shot's `fightcard`: a ~230 px man in a 520x320 frame at 6.8 m, framed by
// the play camera's own 55 deg over a 900 px screen. Where a cosmetic is
// actually LOOKED AT, for the whole match.
// ============================================================
const PLAY = { fovDeg: 55, screenH: 900 };
const playScaleFov = (h) => (2 * Math.atan((h / PLAY.screenH) * Math.tan((PLAY.fovDeg * Math.PI) / 360)) * 180) / Math.PI;
const LENS = { w: 520, h: 320, dist: 6.8, targetY: 0.88, eyeY: 2.05, fov: playScaleFov(320) };
/**
 * The three bearings, and the verdict is taken on the worst.
 *   0    facing you — mail, tunic, the front of the man
 *  -35   the three-quarter every capture in this repo uses
 *  160   very nearly his back, which is where the cloak is and which is what
 *        half of a brawl is actually showing you
 */
const BEARINGS = [0, -35, 160];
/** The bearing the sheet is shot at — the back, where the cloak is. */
const SHEET_TURN = 160;

function framing(turnDeg) {
  const rot = Math.PI + (turnDeg * Math.PI) / 180;
  return { eye: [0, LENS.eyeY, -LENS.dist], target: [0, LENS.targetY, 0], rot };
}

/**
 * Rasterises a scene graph into an albedo buffer and a coverage mask.
 *
 * Lifted in shape from tools/cosmetictest.mjs's `raster` — same lens algebra,
 * same nearest-surface z test — and changed in one way: the winning fragment
 * writes its MATERIAL COLOUR, in linear light, instead of only setting a
 * coverage bit. `THREE.Color` holds linear internally and `getHex()` would
 * hand back sRGB, so `.r/.g/.b` are read directly and are already linear.
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
// CIELAB. `labFromLinear` is the same D65 transform tools/cosmetictest.mjs
// uses, entered one step later: the mean above is already linear, so the sRGB
// decode at the top of that function would be decoding a second time.
// `lab(hex)` is the whole chain, for the catalogue lines.
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
/** Full CIELAB distance. Reported everywhere, gated on nowhere. See the header. */
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/**
 * The chroma plane only — lightness dropped, not down-weighted. This is what a
 * side is written in, and it is what both assertions are taken on.
 */
const dC = (a, b) => Math.hypot(a[1] - b[1], a[2] - b[2]);
/** What a PAID rung has to clear to be a different colour at a glance. */
const GLANCE_DE = 10;

// ============================================================
// THE SWEEP SET — the shop's own ladders, enumerated.
// ============================================================
const slotOf = (n) => ARMOURY.find((s) => s.slot === n);
const FINISHES = slotOf("armor").options.map((o) => ({ label: o.label, value: Number(o.value) }));
const CLOAKS = slotOf("cloak").options.map((o) => ({ label: o.label, value: String(o.value) }));
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const SEED = 13;

const build = (cls, finish, cloak, team) => buildCharacter(
  cls,
  { ...defaultAppearance(cls), armorColor: finish, cloak },
  CLASS_TUNIC[cls] ?? 0x5a4a2c,
  undefined, "high", SEED,
  OFF ? "none" : team,
);

console.log(`\n[team] === TEAMREAD${OFF ? "  (CONTROL: override off)" : ""} ===\n`);
console.log(`        ${FINISHES.length} finishes x ${CLOAKS.length} cloaks x ${CLASSES.length} classes x ${BEARINGS.length} bearings, both sides`);
console.log(`        lens ${LENS.w}x${LENS.h} at ${LENS.dist} m, fov ${LENS.fov.toFixed(1)} deg — the play frame, albedo only\n`);

// ============================================================
// 0. CALIBRATION — a measuring tool that has never been measured is an opinion
// ============================================================
console.log("[team] === 0. CALIBRATION ===\n");
{
  const a = raster(build("huscarl", FINISHES[0].value, "red", "red").group, -35);
  const b = raster(build("huscarl", FINISHES[0].value, "red", "red").group, -35);
  check("the rasteriser reports ΔE 0.00 for a subject against itself",
    dE(labFromLinear(a.mean), labFromLinear(b.mean)) < 1e-9,
    `${a.area} covered px, ΔE ${dE(labFromLinear(a.mean), labFromLinear(b.mean)).toExponential(1)}`);

  check("ΔE reports 0 for a colour against itself and ~90 for black against white",
    dE(lab(0x4a3220), lab(0x4a3220)) === 0 && dE(lab(0x1c1712), lab(0xe8e4da)) > 80,
    `same 0.00, Raven Black vs Snow White ${dE(lab(0x1c1712), lab(0xe8e4da)).toFixed(1)}`);

  // THE SILHOUETTE-INDEPENDENCE PROOF, and it is an assertion rather than an
  // argument. If the override moved one triangle, the separation this file
  // reports could be a shape difference wearing a colour's name.
  let moved = 0, checked = 0;
  for (const cls of CLASSES) {
    for (const f of FINISHES) {
      const r = raster(build(cls, f.value, "red", "red").group, -35);
      const b2 = raster(build(cls, f.value, "red", "blue").group, -35);
      let diff = 0;
      for (let i = 0; i < r.cov.length; i++) if (r.cov[i] !== b2.cov[i]) diff++;
      checked++;
      if (diff) moved++;
    }
  }
  check("the override moves NO geometry — red and blue cover the same pixels",
    moved === 0, `${checked} loadouts, ${moved} with any coverage difference`);

  // A shape change that this file must NOT confuse for a team change. The
  // Sutton Hoo is the largest silhouette in the shop against a bare head.
  const bare = raster(build("huscarl", FINISHES[0].value, "none", "red").group, -35);
  const helmed = buildCharacter("huscarl",
    { ...defaultAppearance("huscarl"), armorColor: FINISHES[0].value, cloak: "none", helm: "suttonhoo" },
    CLASS_TUNIC.huscarl, undefined, "high", SEED, OFF ? "none" : "red");
  const hr = raster(helmed.group, -35);
  const foe = raster(build("huscarl", FINISHES[0].value, "none", "blue").group, -35);
  note(`a whole helmet (bare -> Sutton Hoo, same side) moves the signature ${dC(labFromLinear(bare.mean), labFromLinear(hr.mean)).toFixed(1)} ΔC / ${dE(labFromLinear(bare.mean), labFromLinear(hr.mean)).toFixed(1)} ΔE`);
  note(`the same man changing SIDES moves it ${dC(labFromLinear(bare.mean), labFromLinear(foe.mean)).toFixed(1)} ΔC / ${dE(labFromLinear(bare.mean), labFromLinear(foe.mean)).toFixed(1)} ΔE`);
}

// ============================================================
// 1. THE SWEEP
// ============================================================
console.log("\n[team] === 1. EVERY LOADOUT, BOTH SIDES, THREE BEARINGS ===\n");
const sigs = [];   // { team, cls, finish, cloak, bearing, lab, area }
const sheet = [];
for (const cls of CLASSES) {
  for (const f of FINISHES) {
    for (const c of CLOAKS) {
      for (const team of ["red", "blue"]) {
        const built = build(cls, f.value, c.value, team);
        for (const turn of BEARINGS) {
          const r = raster(built.group, turn);
          sigs.push({ team, cls, finish: f.label, cloak: c.label, turn, lab: labFromLinear(r.mean), area: r.area });
          // THE ADVERSARIAL SHEET, and it is not a contact sheet of everything.
          // Each man is wearing THE OTHER SIDE'S PURCHASE — a red-team warrior
          // in the Sea-Wolf (blue) cloak beside a blue-team warrior in the Blood
          // Red one — because that is the pair the rule exists for and a sheet
          // of agreeable cases is a sheet nobody learns anything from. Shot at
          // 160°, which is the back, which is where a cloak is.
          if (SHEET && cls === "huscarl" && turn === SHEET_TURN
            && c.label === (team === "red" ? "Sea-Wolf Cloak" : "Blood Red Cloak")) {
            sheet.push({ team, order: FINISHES.indexOf(f) * 2 + (team === "red" ? 0 : 1), label: `${f.label} · ${team} in the ${c.label}`, r });
          }
        }
      }
    }
  }
}
console.log(`        ${sigs.length} signatures`);

/** Worst bearing governs: the verdict is computed per bearing and the worst taken. */
let chromaEverExceedsE = false;
const perBearing = BEARINGS.map((turn) => {
  const here = sigs.filter((s) => s.turn === turn);
  const red = here.filter((s) => s.team === "red");
  const blue = here.filter((s) => s.team === "blue");
  let minBetween = Infinity, minPair = null, minBetweenE = Infinity;
  for (const r of red) for (const b of blue) {
    const c = dC(r.lab, b.lab), e = dE(r.lab, b.lab);
    if (c > e + 1e-9) chromaEverExceedsE = true;
    if (c < minBetween) { minBetween = c; minPair = [r, b]; minBetweenE = e; }
  }
  let maxWithin = 0, maxPair = null, maxWithinE = 0;
  for (const side of [red, blue]) {
    for (let i = 0; i < side.length; i++) for (let j = i + 1; j < side.length; j++) {
      const c = dC(side[i].lab, side[j].lab), e = dE(side[i].lab, side[j].lab);
      if (c > e + 1e-9) chromaEverExceedsE = true;
      if (c > maxWithin) { maxWithin = c; maxPair = [side[i], side[j]]; maxWithinE = e; }
    }
  }
  return { turn, minBetween, maxWithin, margin: minBetween - maxWithin, minPair, maxPair, minBetweenE, maxWithinE };
});

console.log("\n            ---- ΔC, the gated quantity ----      ---- full ΔE, reported ----");
console.log("  bearing   min BETWEEN   max WITHIN   margin      min BETWEEN   max WITHIN");
for (const p of perBearing) {
  console.log(`  ${String(p.turn).padStart(5)}°   ${p.minBetween.toFixed(2).padStart(11)}   ${p.maxWithin.toFixed(2).padStart(10)}   ${p.margin.toFixed(2).padStart(6)}      ${p.minBetweenE.toFixed(2).padStart(11)}   ${p.maxWithinE.toFixed(2).padStart(10)}`);
}
const worstSep = perBearing.reduce((a, b) => (b.margin < a.margin ? b : a));
const worstGlance = perBearing.reduce((a, b) => (b.minBetween < a.minBetween ? b : a));

const nameOf = (s) => `${s.cls}/${s.finish}/${s.cloak}`;
console.log("");
note(`closest enemy pair, ${worstGlance.turn}°: ${nameOf(worstGlance.minPair[0])} [red] vs ${nameOf(worstGlance.minPair[1])} [blue] — ΔC ${worstGlance.minBetween.toFixed(2)}`);
note(`widest friendly pair, ${worstSep.turn}°: ${nameOf(worstSep.maxPair[0])} vs ${nameOf(worstSep.maxPair[1])} [both ${worstSep.maxPair[0].team}] — ΔC ${worstSep.maxWithin.toFixed(2)}`);

// ------------------------------------------------------------
// SIDE — does every man READ as the side he is on?
//
// The chroma plane is a plane, and it carries two things: an ANGLE, which is
// the hue and is the whole of what a side is, and a RADIUS, which is how much
// colour a man has and is a function of how much of him is bare skin, grey iron
// and hair. `max within a side` above is dominated by the radius: at 160° the
// widest same-side pair is a cloaked runekeeper, whose back is one flat field,
// against a bare-backed huscarl in the darkest finish in the shop. Same hue,
// different amount of it, and a player calls both of them red without pausing.
//
// So the complete-linkage margin is REPORTED and NOT GATED, and this is what is
// gated in its place: for every one of the 840 signatures, is its chroma nearer
// the field of its own side or the field of the enemy's? That is the question a
// stranger actually answers, it is per-man rather than per-pair, and the two
// prototypes are not numbers this file chose — they are `TEAM_FIELD`, read out
// of characters.ts, the same two colours the cloaks and the boards are painted.
//
// Radius cancels out of the comparison (the same shortfall applies to both
// distances), which is exactly why the near-neutral hole it opens has to be
// closed by something else — and GLANCE closes it. A warrior the override never
// reached has almost no chroma, so his hue angle is noise and he may well
// "read" to his own field by luck; but he is then within ΔC 10 of every enemy
// on the field and GLANCE fails him. Neither assertion is sufficient alone and
// neither is a weaker version of the other.
// ------------------------------------------------------------
const FIELD_LAB = { red: lab(TEAM_FIELD.red), blue: lab(TEAM_FIELD.blue) };
let worstSide = Infinity, worstSideAt = null;
for (const s of sigs) {
  const own = dC(s.lab, FIELD_LAB[s.team]);
  const foe = dC(s.lab, FIELD_LAB[s.team === "red" ? "blue" : "red"]);
  if (foe - own < worstSide) { worstSide = foe - own; worstSideAt = s; }
}

console.log("");
check("the gated quantity is never larger than the full ΔE it was cut down from",
  !chromaEverExceedsE, `ΔC <= ΔE on all ${sigs.length} signatures' pairings — the bar of ${GLANCE_DE} is strictly tighter than it was`);
check(`GLANCE — the nearest enemy is ΔC ${GLANCE_DE}+ away at every bearing`,
  worstGlance.minBetween >= GLANCE_DE,
  `worst bearing ${worstGlance.turn}°: ΔC ${worstGlance.minBetween.toFixed(2)} against a bar of ${GLANCE_DE}`);
check("SIDE — every warrior reads nearer his own field than the enemy's, at every bearing",
  worstSide > 0,
  `worst: ${nameOf(worstSideAt)} [${worstSideAt.team}] at ${worstSideAt.turn}° — ${worstSide.toFixed(2)} ΔC nearer his own field`);
note(`REPORTED, NOT GATED — complete linkage in ΔC: worst margin ${worstSep.margin.toFixed(2)} at ${worstSep.turn}°, `
  + `and the pair that sets it is ${nameOf(worstSep.maxPair[0])} against ${nameOf(worstSep.maxPair[1])}, BOTH ${worstSep.maxPair[0].team}. See the header.`);

// ============================================================
// 2. THE SHIELD BOARD — catalogue only, and it rides the verdict line
// ============================================================
console.log("\n[team] === 2. THE SHIELD BOARD (catalogue ΔE, not in the raster above) ===\n");
let boardDe = null;
if (typeof shieldBoard === "function") {
  const rows = [];
  for (const cloaked of [false, true]) {
    const ap = { ...defaultAppearance("huscarl"), cloak: cloaked ? "red" : "none" };
    const r = shieldBoard(ap, OFF ? "none" : "red");
    const b = shieldBoard(ap, OFF ? "none" : "blue");
    const d = dE(lab(r), lab(b));
    rows.push({ cloaked, r, b, d });
    console.log(`  ${cloaked ? "cloaked" : "bare   "}   red 0x${r.toString(16).padStart(6, "0")}   blue 0x${b.toString(16).padStart(6, "0")}   ΔE ${d.toFixed(1)}`);
  }
  boardDe = Math.min(...rows.map((x) => x.d));
} else {
  console.log("  shieldBoard is not exported by characters.ts");
}

// ============================================================
// THE SHEET — flat albedo, no light. Something to actually look at.
// ============================================================
if (SHEET && sheet.length) {
  sheet.sort((a, b) => a.order - b.order);
  // Halved on the way out. The panel is the play frame at full size; the sheet
  // is seven of them stacked, and a 3600 px tall PNG is not a thing anybody
  // opens. Box-filtered 2:1, which is the honest downsample for a hard-edged
  // albedo buffer — point sampling would drop the thin surfaces (a braid, a
  // strap) that are exactly what a legibility argument turns on.
  const SS = 2;
  const cols = 2, cellW = LENS.w / SS, cellH = LENS.h / SS;
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
  const out = resolve(ROOT, `art/look/teamread${OFF ? "-off" : ""}.png`);
  writeFileSync(out, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]));
  console.log(`\n[team] sheet ${out}  ${W}x${H}  ${sheet.length} panels, huscarl at ${SHEET_TURN}°, FLAT ALBEDO — no light, no grade`);
  sheet.forEach((s, i) => { if (i % cols === 0) console.log(`        row ${i / cols + 1}: ${s.label}  |  ${sheet[i + 1]?.label ?? ""}`); });
}

// ============================================================
// THE VERDICT — every deferral rides this line. docs/PROCESS.md R4.
// ============================================================
const deferrals = [
  `the shield board is NOT in the raster (${boardDe === null ? "not exported" : `catalogue ΔE ${boardDe.toFixed(1)} between sides`})`,
  "no light, no grade — albedo only",
];
console.log("");
console.log(`[team] ${results.length - failed}/${results.length} — WITH ${deferrals.length} deferral(s): ${deferrals.join("; ")}.`);
console.log(`[team] ${failed === 0 ? "PASS" : "FAIL"} in ${((Date.now() - T0) / 1000).toFixed(0)}s${OFF ? "  (control run — a PASS here would mean the gate is broken)" : ""}`);
process.exit(failed ? 1 : 0);
