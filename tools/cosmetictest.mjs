#!/usr/bin/env node
// ============================================================
// COSMETICTEST — grades the shop by measuring it.
//
//   npm run cosmetictest                 # THE GATE. Every free instrument,
//                                        # plus the one slot no free instrument
//                                        # can see. Minutes.
//   npm run cosmetictest -- --all        # every slot rendered at both lenses,
//                                        # hair and paint under all ten helms.
//                                        # Hours. Not the gate.
//   npm run cosmetictest -- --slot helm  # one slot, everything that applies
//   npm run cosmetictest -- --no-render  # geometry and catalogue only, ~1 min
//   npm run cosmetictest -- --no-wear    # skip the folded-in wearmeasure
//
// ------------------------------------------------------------
// WHY THIS FILE EXISTS
//
// No harness in this project has ever rendered a cosmetic and asserted
// anything. Twelve sheets are defined in tools/shoot.mjs and they take
// pictures; a picture is not an assertion. Every cosmetic defect this project
// has found — seven helms sharing one bowl, four war paints identical under the
// Sutton Hoo mask, three beards that were one crescent, two paid colours that
// were literally the same colour, a long mane that was two detached slabs —
// was found by eye, months late. Each of those is a test nobody wrote.
//
// tools/soundtest.mjs is the house model: it grades something nobody can listen
// to by measuring it, and it proves its instruments before it uses them. This
// grades 47 options across 8 slots that nobody has time to look at, the same
// way.
//
// ------------------------------------------------------------
// THE THREE INSTRUMENTS, AND WHY THERE ARE THREE
//
// The audit's central finding (docs/COSMETICS-AUDIT.md) is that A LADDER OF
// RECOLOURS IS NOT PROGRESSION. A colour diff cannot see that, because a
// recolour is exactly what a colour diff scores highly. So shape and colour are
// measured by different instruments and reported in different columns, and a
// slot that has no shape is made to say so out loud rather than being quietly
// scored on its tint.
//
//   1. SILHOUETTE + FORM — geometry, no renderer, no browser, no GPU.
//      `characters.ts` is transpiled and imported (the same trick
//      headmeasure.mjs and wearmeasure.mjs use: the field is the truth and the
//      field is TypeScript), a warrior is BUILT, and his triangles are
//      projected through the exact lens `/shot` uses and rasterised into a
//      coverage mask and a depth buffer on the CPU.
//
//      This is what "render flat, material off" means here, and it is stronger
//      than turning materials off in the renderer would be: there are no
//      materials in it at all.
//
//      `tools/silhouette.mjs` already does material-off IN THE RENDERER, by
//      hooking every fragment shader before the app boots, and it is the better
//      picture — it is what a human should look at. It is not the right
//      instrument for a sweep: it is a capture per panel, ~40 s each on this
//      box, and this file needs 47 options × 2 lenses × 2 bearings = 188 of
//      them. That is two hours against fifteen seconds. The two agree where
//      they overlap, which is the helm ladder: both rank the nine adjacent
//      helm pairs in the same order and both put Boar-Crest -> Jarl's Crowned
//      at the bottom of it (docs/COSMETICS-AUDIT.md records 4.1% for that pair
//      against a 16% window; this file reads 1.74% against the whole subject).
//      Different denominators, same finding — which is the check on a new
//      instrument that matters. There is also no light, no bonfire, no ember
//      noise and no idle sway — the pose is the bind pose, which is the same
//      pose in every panel by construction rather than by a virtual clock. It
//      costs about 200 ms per option instead of about 50 s.
//
//      SIL%  symmetric difference of the two coverage masks over their union.
//            The outline, and only the outline.
//      FORM% share of the overlap where the nearest surface moved more than
//            2 mm toward or away from the lens. Two helmets can share an
//            outline and differ in the brow that sits inside it; SIL cannot see
//            that and FORM can. Reported separately because they answer
//            different questions and a sum would hide both.
//
//   2. CATALOGUE ΔE — free. Four of the eight slots are literal hex values in
//      `ARMOURY`. "Two paid colours are literally the same colour" is a defect
//      that can be found without rendering anything, in microseconds, by
//      converting to CIELAB and taking ΔE76 between adjacent rungs. It is not a
//      substitute for the render — a tint on mail under firelight is not its
//      swatch — but it is a floor, and it runs in the gate.
//
//   3. RENDERED PIXELS — the real renderer through Playwright, on a fixed rig,
//      fixed light and a FIXED VIRTUAL CLOCK. Expensive: ~50 s a capture on
//      this GPU-less box, and that is with one browser, one page per lens and
//      the viewport cut to the smallest size that still answers the question.
//      See THE BUDGET below for what the gate spends it on.
//
// ------------------------------------------------------------
// THE FIXED VIRTUAL CLOCK
//
// `installVirtualClock` is lifted from tools/shoot.mjs deliberately rather than
// imported, because that file is a capture tool and this is a test; what is
// copied is 25 lines and what would be coupled is a whole CLI. Its reason is
// recorded in docs/COSMETICS-AUDIT.md and it is not optional here: `idleLayer`
// puts a standing man on a 15-second weight shift that swings his head about
// 180 mm side to side, a capture takes tens of seconds and varies, so without
// it two panels of the SAME helmet differ by more than two different helmets do.
// That produced a confident wrong answer once already. With the clock, the pose
// is a function of the frame count, so every panel here is the same pose.
//
// ------------------------------------------------------------
// THE COMPANION RULE — and the distinction the brief asked to be encoded
//
// "A mask hiding a FACE is correct. A mask hiding HAIR is not."
//
//   THE FACE IS THE HELMET'S TO TAKE. A face mask covering a face is what a
//   face mask IS, so war paint vanishing under the Sutton Hoo helm is not a
//   render defect. What it is instead is a SHOP defect — 110 gold of Half-Face
//   Shadow under 2400 gold of helmet — and this file reports it as that, with
//   the measured face-coverage percentage beside it, so the finding lands on
//   the person who can act on it. What would be a render defect is paint that
//   is neither visible nor covered: a face standing in the open with nothing on
//   it. That is asserted.
//
//   THE HAIR IS NOT THE HELMET'S TO TAKE. Every helm in this shop is an open
//   bowl that stops above the ear, so every PAID hairstyle must still change the
//   picture under every one of them, and that is asserted. Two exemptions, both
//   deliberate: a free hairstyle that vanishes is reported and not gated,
//   because nobody paid for it; and the Shadow Hood is exempt outright, because
//   a hood is a bag for a head and whether a cowl should hide a mane or let it
//   spill out the front is a design call a harness has no business deciding by
//   fiat. Its numbers are printed so the call can be made on evidence.
//
// ------------------------------------------------------------
// THE BUDGET, and which pass the gate should use
//
// THE GATE SHOULD USE THE DEFAULT. It runs every instrument that costs nothing
// — all 47 options in silhouette at both lenses, every companion pairing in
// geometry, every colour ladder in ΔE, and wearmeasure — and then spends its
// only captures on WAR PAINT, because war paint is the one slot in the shop
// that no free instrument can see at all: it has no geometry (it is painted
// into the skin texture) and no catalogue colour (its value is a style name).
// Everything else the gate asserts, it asserts for free.
//
// `--all` renders every option at both lenses and puts paint and hair under all
// ten helms. That is ~150 captures and about two hours, which is an art-wave
// tool and not a gate. Run it when the art changes; read the table it writes.
//
// The table is written to docs/COSMETICS-SWEEP.md on every run, marked with
// which pass produced it, and it is the deliverable: it briefs every art wave
// that follows.
//
// Exit codes: 0 all assertions held, 1 an assertion failed, 2 the harness could
// not measure (transpile failed, server never came up) — never counted as green.
// ============================================================
import { launchBrowser as launchChromium, rasteriserNote } from "./lib/browser.mjs";
import { spawn, spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = resolve(ROOT, ".cosmetictest");
const T0 = Date.now();

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const ALL = has("all");
const ONLY_SLOT = flag("slot", null);
const RENDER = !has("no-render");
const WEAR = !has("no-wear");
// Frames of simulation before a capture. The virtual clock makes the pose a
// function of this number, so it is a property of the measurement and every
// panel in a run shares it. 26 is `/shot`'s own default and what the sheets in
// shoot.mjs are shot at; 12 is what this file uses, because every lerp in the
// rig runs at min(1, dt·k) with dt pinned at 0.05 and the camera is PINNED here
// rather than lerped to a follow target — so what 26 buys over 12 is the tail
// of the pose lerps, and a tail that is identical in every panel is not a
// difference this file can mistake for a cosmetic. It halves the run.
const SETTLE = parseInt(flag("settle", "12"), 10);

const results = [];
let failed = 0;
/**
 * One assertion. `items` is the list of things that actually failed, and it is a
 * parameter rather than a print because docs/COSMETICS-SWEEP.md is the
 * deliverable: a table that says "4 identical" and makes the reader go and find
 * which four is a table that will not be read twice.
 */
function check(name, pass, detail, items = []) {
  results.push({ name, pass, detail, items });
  if (!pass) failed++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
const note = (s) => console.log(`        ${s}`);
const die = (msg) => { console.error(`[cos] ${msg}`); process.exit(2); };

// ============================================================
// THE FIELD, IMPORTED
//
// Nothing below mirrors a catalogue. `ARMOURY` and `buildCharacter` are the
// shop and the renderer's own geometry, read out of the source on disk, for the
// reason shoot.mjs states at length: a tool that keeps its own copy of the
// catalogue audits the catalogue it was written against, which is exactly how
// the shop grew to 47 options while the capture set reviewed ten of them.
// ============================================================
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts",
  "--outDir", ".cosmetictest", "--target", "es2022", "--module", "esnext",
  "--moduleResolution", "bundler", "--skipLibCheck"], { cwd: ROOT, encoding: "utf8" });
const found = [];
const walkDir = (d) => { for (const e of readdirSync(d, { withFileTypes: true }))
  e.isDirectory() ? walkDir(resolve(d, e.name)) : e.name === "characters.js" && found.push(resolve(d, e.name)); };
if (existsSync(WORK)) walkDir(WORK);
if (!found[0]) die(`tsc emitted nothing:\n${tsc.stdout || ""}${tsc.stderr || ""}`);
const CH = await import(pathToFileURL(found[0]).href);
const { ARMOURY, CARD_AIM, buildCharacter, defaultAppearance, HELM_VALUES } = CH;

/** Query-slot -> the Appearance field it sets. Mirrors `SLOT_FIELD` in /shot. */
const SLOT_FIELD = {
  helm: "helm", hair: "hairStyle", hairColor: "hairColor", beard: "beardStyle",
  beardColor: "beardColor", cloak: "cloak", armor: "armorColor", warPaint: "warPaint",
  weapon: "weapon",
};
const slotOf = (name) => ARMOURY.find((s) => s.slot === name);
const OPTION_COUNT = ARMOURY.reduce((n, s) => n + s.options.length, 0);

// A slot the shop has and this file cannot drive is the failure this whole pass
// is about, arriving as a complaint rather than as a gap nobody notices.
const unmapped = ARMOURY.filter((s) => !(s.slot in SLOT_FIELD)).map((s) => s.slot);

// ============================================================
// THE RIG
//
// One class, one face, one detail tier, one bind pose. Every number in this file
// is measured against this and nothing else, because a measurement taken on a
// different skull is not comparable and the review that compared two helmets on
// two faces is in docs/SUTTON-HOO.md.
//
// AND THAT ONE CLASS IS THE HUSCARL, SO THIS FILE IS NOT A GATE FOR THE OTHER
// THREE. Instance seventeen, written down here rather than left to be
// rediscovered. Round seven changed the warden, the berserker and the
// runekeeper and did not touch the huscarl, so every cell it moved was
// invisible to this harness — and "cosmetictest holds main's baseline exactly"
// was cited by two agents and by a merge message as proof that nothing paid had
// been taken away. It was a tautology. Round eight then hit the same hole live:
// hoisting `napeHalf` deleted 4 to 6 components of hair coils from every
// warden, berserker and runekeeper rung of the two deep-cheek helms, and this
// file read unchanged through it.
//
// The comparability argument above is real and the rig stays one class. What
// this file therefore CANNOT say is "no paid content was lost". For that use
// `tools/rungcensus.mjs`, which counts connected components and triangles of
// the welded index graph over all four classes, ten helms and eight rungs,
// twice each, against a saved baseline. Run both: they answer different
// questions, and only one of them can see three quarters of the shop.
// ============================================================
const RIG = { cls: "huscarl", seed: 13, detail: "high", accents: 0 };
// Three-quarter, negative. The sign is not cosmetic and the reason is in
// shoot.mjs: head-on is precisely the bearing that hides a crest and a nape
// guard, and the mark's key light is off his right shoulder.
const QUARTER = -35;

/** The two lenses, copied from `CARDS` in src/app/shot/page.tsx. */
const PLAY = { fovDeg: 55, screenH: 900 };
const playScaleFov = (h) => (2 * Math.atan((h / PLAY.screenH) * Math.tan((PLAY.fovDeg * Math.PI) / 360)) * 180) / Math.PI;
// ONE DEFINITION, read off the module this file already imports. See
// `CARD_AIM` in characters.ts for why it is not written here.
const AIM = CARD_AIM;
const LENS = {
  // Crown to sternum, ~400 px of head. Where a cosmetic is SOLD.
  portrait: { card: "facecard", w: 700, h: 860, dist: 2.05, targetY: 1.76, eyeY: 1.94, fov: 19.5, aim: "head",
    // Half scale for the geometry pass. A silhouette measured at 350×430 and one
    // measured at 700×860 disagree in the fourth significant figure and agree on
    // every verdict in this file; the raster is four times cheaper.
    rasterScale: 0.5,
    // A QUARTER scale for the rendered pass — 175x215, about 100 px of head.
    // That is the smallest size that still answers the question the renderer is
    // being asked, which is "do these two differ in COLOUR", a mean over every
    // pixel; shape is answered for free by the rasteriser at four times this
    // resolution. Measured on this box: 175x215 costs 39.8 s a capture against
    // 47.7 s at 350x430, so the cut is a fifth of the whole render pass.
    shotScale: 0.25 },
  // Fight distance, honestly: a ~230 px man whose head is ~43 of them. Where a
  // cosmetic is actually LOOKED AT, for the whole match.
  fight: { card: "fightcard", w: 520, h: 320, dist: 6.8, targetY: 0.88, eyeY: 2.05, fov: playScaleFov(320), aim: "body",
    rasterScale: 1, shotScale: 0.5 },
};

// ============================================================
// INSTRUMENT 1 — the CPU rasteriser
// ============================================================

/** The lens's eye and target, in the warrior's own frame with him on the origin. */
function framing(lens, turnDeg) {
  const a = AIM[lens.aim];
  const rot = Math.PI + (turnDeg * Math.PI) / 180;
  const s = Math.sin(rot), c = Math.cos(rot);
  const x = a.right * c + a.fwd * s;
  const z = -a.right * s + a.fwd * c;
  return { eye: [x, lens.eyeY, z - lens.dist], target: [x, lens.targetY, z], fov: lens.fov, rot };
}

/**
 * Rasterises a scene graph into a coverage mask and a depth buffer.
 *
 * Nearest-surface depth is the load-bearing output, not the mask. Two builds
 * can have identical outlines and a different face inside them, and the mask
 * alone would call that pair identical — which is the "seven helms share one
 * bowl" defect exactly, seen from the wrong instrument.
 */
function raster(root, lens, turnDeg, worldRoot = root) {
  const W = Math.round(lens.w * lens.rasterScale), H = Math.round(lens.h * lens.rasterScale);
  const f = framing(lens, turnDeg);
  const [ex, ey, ez] = f.eye, [tx, ty, tz] = f.target;
  let fx = tx - ex, fy = ty - ey, fz = tz - ez;
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  // right = forward × up, then true-up = right × forward. Screen-right at turn 0
  // is −x with the man facing the lens, which is the convention /shot builds on.
  let sx = fy * 0 - fz * 1, sy = fz * 0 - fx * 0, sz = fx * 1 - fy * 0;
  const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
  const vx = sy * fz - sz * fy, vy = sz * fx - sx * fz, vz = sx * fy - sy * fx;
  const tanH = Math.tan((f.fov * Math.PI) / 360);
  const aspect = lens.w / lens.h;

  const depth = new Float32Array(W * H).fill(Infinity);
  const cov = new Uint8Array(W * H);
  // From the TOP of the rig, always. `updateMatrixWorld` on a subtree composes
  // against whatever its parent's matrix happens to hold, and an un-updated
  // parent holds the identity — so rasterising `c.head` on its own silently
  // dropped the warrior's bearing and photographed the BACK of every head. That
  // is not hypothetical: it is why the first cut of `faceCoverage` reported that
  // every helmet in the shop covers 100% of the face, including the ones with no
  // face furniture at all.
  worldRoot.updateMatrixWorld(true);

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
          if (z < depth[o2]) { depth[o2] = z; cov[o2] = 1; }
        }
      }
    }
  });
  let area = 0;
  for (let i = 0; i < cov.length; i++) area += cov[i];
  return { W, H, depth, cov, area };
}

/** 2 mm. Below this a depth change is the rasteriser's own quantisation. */
const DEPTH_MM = 0.002;

/**
 * The shape comparison, as two numbers that mean different things.
 *
 * SIL is the outline: covered by one and not the other, over the union.
 * FORM is the interior: covered by both, but the nearest surface moved. A
 * recolour scores 0 on both, which is the point.
 */
function shapeDiff(a, b) {
  let sym = 0, union = 0, both = 0, moved = 0;
  for (let i = 0; i < a.cov.length; i++) {
    const ca = a.cov[i], cb = b.cov[i];
    if (!ca && !cb) continue;
    union++;
    if (ca !== cb) { sym++; continue; }
    both++;
    if (Math.abs(a.depth[i] - b.depth[i]) > DEPTH_MM) moved++;
  }
  return {
    sil: union ? (100 * sym) / union : 0,
    form: union ? (100 * moved) / union : 0,
    changed: union ? (100 * (sym + moved)) / union : 0,
    union,
  };
}

// ============================================================
// THE BARS, and why they are these numbers
//
// IDENTICAL is the disaster and needs no judgement: two options whose geometry
// agrees to within a twentieth of one per cent of the subject are the same
// object with two price tags. 0.05% of a portrait union (~62 000 px) is 31
// pixels; of a fight union (~3 300 px) is under two. Nothing legitimate lands
// there — the rasteriser is deterministic, so an honest pair of different
// meshes cannot.
//
// DIFFERS is the bar an option has to clear to be a product. 1.0% of the union:
// on the portrait lens that is ~620 px, a mark 25×25 px on a 400 px head, which
// is a brow ridge or a nasal — the smallest fitting the shop actually sells. At
// fight distance it is ~33 px on a 43 px head, which is a crest tip or a cheek
// guard. Below it the option is FAINT: real, measurable, and not what a player
// thinks he is buying.
//
// A slot whose product IS colour is held to the opposite bar — see RECOLOUR.
// ============================================================
const IDENTICAL_PCT = 0.05;
const DIFFERS_PCT = 1.0;
const verdictOf = (d) => (d.changed < IDENTICAL_PCT ? "IDENTICAL" : d.changed < DIFFERS_PCT ? "FAINT" : "DIFFERS");

/** Slots whose product is a colour, and which therefore MUST score 0 in shape. */
// `weapon` sits here because a weapon STYLE is a material treatment with no
// geometry of its own — and because the raster never holds the weapon at all
// (it is mounted by the rig, not by `buildCharacter`), so the shape
// instrument's flatness is trivially true there and says nothing. The colour
// ladder is the instrument that judges it, off each option's `swatch` — the
// treatment's most representative changed surface.
const RECOLOUR_SLOTS = new Set(["hairColor", "beardColor", "armor", "weapon"]);
/** Slots with no geometry at all: painted into the skin. Invisible to instrument 1. */
const TEXTURE_SLOTS = new Set(["warPaint"]);

/**
 * What each slot has to be WEARING for the question to be asked rather than
 * assumed. A hair colour needs hair on the head to be a colour of anything, and
 * a beard colour needs a beard. Mirrors the sheet plan in shoot.mjs so the two
 * tools stage the same warrior.
 *
 * `turns` is per slot because a cosmetic has a side it lives on: a cloak hangs
 * down the back, a fork and a ringed braid are side-on shapes, and war paint is
 * painted on the front of a face.
 */
const STAGE = {
  helm: { dress: {}, turns: [QUARTER, 180] },
  hair: { dress: {}, turns: [QUARTER, 180] },
  hairColor: { dress: { hairStyle: "long" }, turns: [QUARTER] },
  beard: { dress: {}, turns: [QUARTER, -90] },
  beardColor: { dress: { beardStyle: "full" }, turns: [QUARTER] },
  cloak: { dress: {}, turns: [180, QUARTER] },
  armor: { dress: {}, turns: [QUARTER] },
  warPaint: { dress: {}, turns: [0] },
};

/**
 * THE AUDIT DRESS — what the warrior wears in the seven slots he is not being
 * tested in, read out of `/shot` rather than chosen here.
 *
 * This is not fussiness. `defaultAppearance("huscarl")` puts a NASAL HELM and a
 * RED CLOAK on him; `/shot`'s parametric presets stage `AUDIT_DRESS`, which is
 * deliberately bare-headed and cloakless because "a helmet in the base dress
 * would eat the hair sheet and the war paint sheet both". The first cut of this
 * file used `defaultAppearance` for the geometry pass and `/shot` for the render
 * pass, so the two instruments were measuring two different men — and the hair
 * ladder came out flat for the entirely uninteresting reason that it was being
 * swept underneath a helmet.
 *
 * So it is parsed from the page's own `DRESS_IDS`, and a parse that fails stops
 * the run. A copy of the ids here would be a fourth place the same list lives.
 */
function auditDress() {
  const src = readFileSync(resolve(ROOT, "src/app/shot/page.tsx"), "utf8");
  const m = src.match(/const DRESS_IDS: Record<string, string> = \{([\s\S]*?)\}/);
  if (!m) die("cannot find DRESS_IDS in src/app/shot/page.tsx — the audit dress has moved and this harness would silently stage a different warrior than /shot does");
  const ap = {};
  const ids = {};
  for (const [, slotName, id] of m[1].matchAll(/(\w+):\s*"([^"]+)"/g)) {
    const opt = slotOf(slotName)?.options.find((o) => o.id === id);
    if (!opt) die(`the audit dress names ${slotName}="${id}", which is not in the armoury`);
    ap[SLOT_FIELD[slotName]] = opt.value;
    ids[slotName] = id;
  }
  const missing = Object.keys(SLOT_FIELD).filter((k) => !(k in ids));
  if (missing.length) die(`the audit dress does not name ${missing.join(", ")} — /shot would stage a class default there and this harness would not`);
  return { ap, ids };
}
const DRESS = auditDress();

const build = (extra) => {
  const ap = { ...defaultAppearance(RIG.cls), ...DRESS.ap, ...extra };
  const c = buildCharacter(RIG.cls, ap, RIG.accents, undefined, RIG.detail, RIG.seed);
  return c;
};
/** A built warrior, turned to a bearing, ready to rasterise. */
function staged(extra, turn) {
  const c = build(extra);
  c.group.rotation.y = Math.PI + (turn * Math.PI) / 180;
  return c;
}

// ============================================================
// INSTRUMENT 2 — catalogue ΔE
//
// sRGB -> linear -> XYZ (D65) -> CIELAB, then ΔE76. ΔE76 rather than ΔE2000
// because the question is "are these the same colour", not "which of two near
// matches is nearer", and a JND of about 2.3 is the whole of the arithmetic
// this file needs from it.
// ============================================================
function lab(hex) {
  const srgb = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const [r, g, b] = srgb;
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const deltaE = (h1, h2) => {
  const a = lab(h1), b = lab(h2);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};
/** Just noticeable difference. Below this, two swatches are one swatch. */
const JND = 2.3;
/** What a PAID rung has to clear to be a different colour at a glance. */
const LADDER_DE = 10;

// ============================================================
// THE TABLE
// ============================================================
const TABLE = { pairs: [], companions: [], notes: [] };
const pct = (v) => (v === null || v === undefined ? "—" : `${v.toFixed(1)}%`);
const pct2 = (v) => (v === null || v === undefined ? "—" : `${v.toFixed(2)}%`);

// ============================================================
// 0. CALIBRATION — a measuring tool that has never been measured is an opinion
// ============================================================
console.log("\n[cos] === 0. CALIBRATION ===\n");
{
  const a = staged({}, QUARTER);
  const ra = raster(a.group, LENS.portrait, QUARTER);
  const b = staged({}, QUARTER);
  const rb = raster(b.group, LENS.portrait, QUARTER);
  const same = shapeDiff(ra, rb);
  check("the rasteriser reports 0.00% for a subject against itself",
    same.changed === 0, `sil ${pct2(same.sil)} form ${pct2(same.form)} over ${ra.area} covered px`);

  // A known-honest pair. The cheapest paid shape change in the shop, 30 gold,
  // and unambiguously a different object: a bare head against an iron bowl.
  const bare = raster(staged({ helm: "none", hairStyle: "shaved" }, QUARTER).group, LENS.portrait, QUARTER);
  const iron = raster(staged({ helm: "iron", hairStyle: "shaved" }, QUARTER).group, LENS.portrait, QUARTER);
  const known = shapeDiff(bare, iron);
  check("the rasteriser sees the cheapest paid shape in the shop (30g Iron Spangenhelm)",
    known.changed > DIFFERS_PCT * 3,
    `sil ${pct(known.sil)} form ${pct(known.form)} — bar for DIFFERS is ${DIFFERS_PCT}%`);

  // A pure recolour must be invisible to instrument 1, or instrument 1 is
  // reading something other than shape and every RECOLOUR row below is a lie.
  const c1 = raster(staged({ hairStyle: "long", hairColor: 0x4a3220 }, QUARTER).group, LENS.portrait, QUARTER);
  const c2 = raster(staged({ hairStyle: "long", hairColor: 0xe8e4da }, QUARTER).group, LENS.portrait, QUARTER);
  const recol = shapeDiff(c1, c2);
  check("a pure recolour is invisible to the shape instrument",
    recol.changed === 0, `Oak Brown vs Snow White on the Long Mane: sil ${pct2(recol.sil)} form ${pct2(recol.form)}`);

  const dSame = deltaE(0x4a3220, 0x4a3220), dKnown = deltaE(0x1c1712, 0xe8e4da);
  check("ΔE reports 0 for a colour against itself and ~90 for black against white",
    dSame === 0 && dKnown > 80, `same ${dSame.toFixed(2)}, Raven Black vs Snow White ${dKnown.toFixed(1)}`);

  check("every armoury slot can be driven by this harness",
    unmapped.length === 0, unmapped.length ? `cannot drive: ${unmapped.join(", ")}` : `${ARMOURY.length} slots, ${OPTION_COUNT} options`);
  note(`rig: ${RIG.cls}, face seed ${RIG.seed}, detail ${RIG.detail}, bind pose, no light, no materials`);
  note(`audit dress, read from /shot's own DRESS_IDS: ${Object.entries(DRESS.ids).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  note(`portrait raster ${Math.round(LENS.portrait.w * LENS.portrait.rasterScale)}×${Math.round(LENS.portrait.h * LENS.portrait.rasterScale)}, ` +
    `fight raster ${Math.round(LENS.fight.w * LENS.fight.rasterScale)}×${Math.round(LENS.fight.h * LENS.fight.rasterScale)}`);
}

// ============================================================
// 1. THE SWEEP — every option in every slot, both lenses, shape only
// ============================================================
console.log("\n[cos] === 1. SILHOUETTE AND FORM — all " + OPTION_COUNT + " options, both lenses ===\n");
console.log("  slot         pair                                        lens      turn    SIL%    FORM%   union px  verdict");
console.log("  ---------------------------------------------------------------------------------------------");

const slotsToSweep = ARMOURY.filter((s) => !ONLY_SLOT || s.slot === ONLY_SLOT);
if (ONLY_SLOT && !slotsToSweep.length) die(`no slot named "${ONLY_SLOT}" — have ${ARMOURY.map((s) => s.slot).join(" ")}`);

const identicalPairs = [];
const faintPairs = [];
const recolourViolations = [];

for (const slot of slotsToSweep) {
  const stage = STAGE[slot.slot] ?? { dress: {}, turns: [QUARTER] };
  const field = SLOT_FIELD[slot.slot];
  const isRecolour = RECOLOUR_SLOTS.has(slot.slot);
  const isTexture = TEXTURE_SLOTS.has(slot.slot);
  // Rasterise once per option per lens per bearing, then walk the ladder. The
  // build is the expensive half (~200 ms) and it is shared across both lenses.
  const shots = slot.options.map((o) => {
    const per = {};
    for (const turn of stage.turns) {
      const c = staged({ ...stage.dress, [field]: o.value }, turn);
      for (const [lname, lens] of Object.entries(LENS)) per[`${lname}@${turn}`] = raster(c.group, lens, turn);
    }
    return { o, per };
  });

  for (let i = 0; i + 1 < shots.length; i++) {
    const a = shots[i], b = shots[i + 1];
    const label = `${a.o.label} -> ${b.o.label}`;
    const row = { slot: slot.slot, label, cost: b.o.cost, lens: {}, byTurn: {} };
    for (const lname of Object.keys(LENS)) {
      // Every bearing is measured and every bearing is REPORTED. The verdict
      // takes the bearing that shows the most, because a cosmetic has a side it
      // lives on — a cloak is a back and a forked beard is a profile — and a
      // pair that fails its own best bearing has nothing left to argue.
      // The per-bearing numbers stay in the table: a pair that reads at 180° and
      // not at −35° is a real thing to know and a maximum hides it.
      let best = null, bestTurn = null;
      for (const turn of stage.turns) {
        const d = shapeDiff(a.per[`${lname}@${turn}`], b.per[`${lname}@${turn}`]);
        row.byTurn[`${lname}@${turn}`] = d;
        if (!best || d.changed > best.changed) { best = d; bestTurn = turn; }
      }
      row.lens[lname] = { ...best, turn: bestTurn, verdict: verdictOf(best) };
    }
    // THE VERDICT IS TAKEN ON THE MOST GENEROUS LENS, not on the portrait one.
    // The portrait card is framed crown-to-sternum and a cloak is not in it at
    // all; judging a cloak there would report a defect the lens invented. The
    // fight lens sees the whole man and the portrait lens sees 400 px of head,
    // so between them every slot in the shop has somewhere it can be seen — and
    // an option that is IDENTICAL at its own best reading is unarguably one
    // object with two prices.
    row.best = Object.values(row.lens).reduce((x, y) => (y.changed > x.changed ? y : x));
    row.verdict = verdictOf(row.best);
    TABLE.pairs.push(row);

    for (const lname of Object.keys(LENS)) {
      for (const turn of stage.turns) {
        const d = row.byTurn[`${lname}@${turn}`];
        const chosen = turn === row.lens[lname].turn;
        console.log(`  ${slot.slot.padEnd(11)}  ${label.slice(0, 42).padEnd(42)}  ${lname.padEnd(8)}  ` +
          `${String(turn).padStart(4)}  ${d.sil.toFixed(2).padStart(6)}  ${d.form.toFixed(2).padStart(6)}  ${String(d.union).padStart(8)}  ` +
          `${chosen ? (isRecolour || isTexture ? "RECOLOUR" : d === row.lens[lname] || true ? verdictOf(d) : "") : ""}`);
      }
    }
    if (isRecolour || isTexture) {
      // Inverted assertion. These slots MUST be flat, and a shape difference
      // here would mean the harness is measuring something other than the tint.
      if (row.best.changed > 0) recolourViolations.push(`${slot.slot}: ${label} moved geometry (${pct2(row.best.changed)})`);
    } else if (row.verdict === "IDENTICAL") {
      identicalPairs.push(`${slot.slot}: ${label} — ${pct2(row.best.changed)} at its own best lens and bearing`);
    } else if (row.verdict === "FAINT") {
      faintPairs.push(`${slot.slot}: ${label} — ${pct2(row.best.changed)} at its own best lens and bearing`);
    }
  }
}

// ------------------------------------------------------------
// EVERY PAIR, not only adjacent ones.
//
// The colour defect this project found by eye was two rungs that were the same
// colour and were NOT next to each other in the list, so walking the ladder one
// step at a time would have missed it. The same trap exists in shape, and it
// has a second form: a pair that is a different object overall but the SAME
// PICTURE from one bearing. A hundred-gold braid that is the free crop seen
// from behind is a real thing a player will notice and no adjacent walk reports
// it. Twins are a gate; one-bearing twins are reported, because an option is
// allowed to be ambiguous from a single angle and is not allowed to be
// ambiguous from all of them.
const twins = [], viewTwins = [];
for (const slot of slotsToSweep) {
  if (RECOLOUR_SLOTS.has(slot.slot) || TEXTURE_SLOTS.has(slot.slot)) continue;
  const stage = STAGE[slot.slot] ?? { dress: {}, turns: [QUARTER] };
  const field = SLOT_FIELD[slot.slot];
  const shots = slot.options.map((o) => {
    const per = {};
    for (const turn of stage.turns) {
      const c = staged({ ...stage.dress, [field]: o.value }, turn);
      for (const [lname, lens] of Object.entries(LENS)) per[`${lname}@${turn}`] = raster(c.group, lens, turn);
    }
    return { o, per };
  });
  for (let i = 0; i < shots.length; i++) {
    for (let j = i + 1; j < shots.length; j++) {
      let worst = null, flatViews = [];
      for (const lname of Object.keys(LENS)) {
        for (const turn of stage.turns) {
          const d = shapeDiff(shots[i].per[`${lname}@${turn}`], shots[j].per[`${lname}@${turn}`]);
          if (!worst || d.changed > worst.changed) worst = d;
          if (d.changed < IDENTICAL_PCT) flatViews.push(`${lname}@${turn}°`);
        }
      }
      const pair = `${slot.slot}: ${shots[i].o.label} and ${shots[j].o.label}`;
      if (worst.changed < IDENTICAL_PCT) twins.push(`${pair} — ${pct2(worst.changed)} from every lens and bearing`);
      else if (flatViews.length) viewTwins.push(`${pair} — the same picture at ${flatViews.join(", ")}`);
    }
  }
}
console.log("");
check("no two options in a shape slot are the same object, adjacent or not",
  twins.length === 0, twins.length ? `${twins.length} twins` : "every pair separated somewhere", twins);
for (const t of twins) note(`TWIN       ${t}`);
if (viewTwins.length) {
  note(`${viewTwins.length} pairs are indistinguishable from at least one bearing (reported, not gated):`);
  for (const t of viewTwins) note(`  ${t}`);
  TABLE.notes.push(...viewTwins.map((t) => `one-bearing twin — ${t}`));
}

const shapeSlots = slotsToSweep.filter((s) => !RECOLOUR_SLOTS.has(s.slot) && !TEXTURE_SLOTS.has(s.slot));
const shapePairs = shapeSlots.reduce((n, s) => n + s.options.length - 1, 0);
console.log("");
check(`no two adjacent shape options are the same object (${shapePairs} pairs)`,
  identicalPairs.length === 0, identicalPairs.length ? `${identicalPairs.length} identical` : `all above ${IDENTICAL_PCT}%`, identicalPairs);
for (const f of identicalPairs) note(`IDENTICAL  ${f}`);
check(`every adjacent shape pair clears the ${DIFFERS_PCT}% bar somewhere`,
  faintPairs.length === 0, faintPairs.length ? `${faintPairs.length} FAINT` : "all clear", faintPairs);
for (const f of faintPairs) note(`FAINT      ${f}`);
check("a recolour ladder moves no geometry (proves the two instruments are separate)",
  recolourViolations.length === 0, recolourViolations.length ? `${recolourViolations.length} moved` : "hairColor, beardColor, armor, warPaint all flat", recolourViolations);

// How much of each option survives to fight distance. This is the column the
// art wave is briefed on: a cosmetic nobody can see in play is not a cosmetic.
const inPlay = TABLE.pairs.filter((r) => !RECOLOUR_SLOTS.has(r.slot) && !TEXTURE_SLOTS.has(r.slot));
const invisible = inPlay.filter((r) => r.lens.fight.verdict !== "DIFFERS");
check(`every shape pair that reads at portrait still reads at fight distance`,
  invisible.length === 0,
  `${invisible.length}/${inPlay.length} pairs below ${DIFFERS_PCT}% on a ${Math.round(LENS.fight.w * LENS.fight.rasterScale)}×${Math.round(LENS.fight.h * LENS.fight.rasterScale)} play frame`,
  invisible.map((r) => `${r.slot}: ${r.label} (${r.cost}g) — ${pct2(r.lens.fight.changed)} at fight distance`));
for (const r of invisible) note(`IN PLAY    ${r.slot}: ${r.label} — ${pct2(r.lens.fight.changed)} at fight distance`);

// ============================================================
// 2. THE COLOUR LADDERS — catalogue ΔE, free
// ============================================================
console.log("\n[cos] === 2. COLOUR LADDERS — CIELAB ΔE76 between adjacent rungs ===\n");
console.log("  slot         pair                                        ΔE      cost   verdict");
console.log("  ------------------------------------------------------------------------------");
const sameColour = [], dullRungs = [];
for (const slot of slotsToSweep.filter((s) => RECOLOUR_SLOTS.has(s.slot))) {
  for (let i = 0; i + 1 < slot.options.length; i++) {
    const a = slot.options[i], b = slot.options[i + 1];
    const de = deltaE(Number(a.swatch ?? a.value), Number(b.swatch ?? b.value));
    const v = de < JND ? "SAME COLOUR" : de < LADDER_DE ? "NEAR" : "DIFFERS";
    console.log(`  ${slot.slot.padEnd(11)}  ${`${a.label} -> ${b.label}`.slice(0, 42).padEnd(42)}  ${de.toFixed(1).padStart(5)}  ${String(b.cost).padStart(4)}g  ${v}`);
    TABLE.pairs.push({ slot: slot.slot, label: `${a.label} -> ${b.label}`, cost: b.cost, deltaE: de, lens: {} });
    if (de < JND) sameColour.push(`${slot.slot}: ${a.label} and ${b.label} are ΔE ${de.toFixed(2)} apart`);
    else if (de < LADDER_DE && b.cost > 0) dullRungs.push(`${slot.slot}: ${a.label} -> ${b.label} is ΔE ${de.toFixed(1)} for ${b.cost}g`);
  }
  // Every pair, not only adjacent ones: the defect found by eye was two rungs
  // that were the same colour, and they were not next to each other in the list.
  for (let i = 0; i < slot.options.length; i++) {
    for (let j = i + 1; j < slot.options.length; j++) {
      const de = deltaE(Number(slot.options[i].swatch ?? slot.options[i].value), Number(slot.options[j].swatch ?? slot.options[j].value));
      if (de < JND && !sameColour.some((s) => s.includes(slot.options[j].label))) {
        sameColour.push(`${slot.slot}: ${slot.options[i].label} and ${slot.options[j].label} are ΔE ${de.toFixed(2)} apart (not adjacent)`);
      }
    }
  }
}
console.log("");
check("no two options in a colour ladder are the same colour", sameColour.length === 0,
  sameColour.length ? `${sameColour.length} pairs` : `all ${RECOLOUR_SLOTS.size} ladders separated by more than ΔE ${JND}`, sameColour);
check(`every paid colour rung clears ΔE ${LADDER_DE} against the rung below it`, dullRungs.length === 0,
  dullRungs.length ? `${dullRungs.length} rungs` : "all clear", dullRungs);

// ============================================================
// 3. COMPANIONS — does an option survive the kit that came after it?
// ============================================================
console.log("\n[cos] === 3. COMPANIONS — every hair and beard under all " + (slotOf("helm")?.options.length ?? 0) + " helms ===\n");

const helms = slotOf("helm").options;
const HOOD = "hood"; // the one helm whose product is that it swallows a head

/**
 * Face coverage: what share of the bare head's own pixels this helm puts metal
 * in front of. Measured by differencing depth against the same head with no
 * helm on, so nothing has to be tagged and nothing can drift.
 */
function faceCoverage(helmValue) {
  const lens = LENS.portrait;
  const bare = staged({ helm: "none", hairStyle: "shaved", beardStyle: "none" }, 0);
  const bareHead = raster(bare.head, lens, 0, bare.group);
  const worn = staged({ helm: helmValue, hairStyle: "shaved", beardStyle: "none" }, 0);
  const wornHead = raster(worn.head, lens, 0, worn.group);
  let face = 0, covered = 0;
  for (let i = 0; i < bareHead.cov.length; i++) {
    if (!bareHead.cov[i]) continue;
    face++;
    // Something nearer than the skin was, at that pixel. That is metal in front
    // of a face. 0.5 mm rather than 0 so the shared skin surface does not
    // register as its own occluder.
    if (wornHead.cov[i] && wornHead.depth[i] < bareHead.depth[i] - 0.0005) covered++;
  }
  return face ? (100 * covered) / face : 0;
}

console.log("  helm          face covered   " + slotOf("hair").options.map((o) => o.label.slice(0, 9).padStart(10)).join(""));
console.log("  " + "-".repeat(30 + 10 * slotOf("hair").options.length));
const swallowed = [], hoodLeaks = [], freeSwallowed = [], mergedPaid = [];
for (const helm of helms) {
  const cover = faceCoverage(helm.value);
  const base = raster(staged({ helm: helm.value, hairStyle: "shaved" }, QUARTER).group, LENS.portrait, QUARTER);
  const cells = [];
  // AND THE LADDER IS MEASURED AGAINST ITSELF, NOT ONLY AGAINST SHAVED.
  //
  // Every rung above was compared to a bare scalp, and that is the wrong
  // question asked on its own: two paid rungs can each clear the bar against
  // Shaved and be the SAME OBJECT AS EACH OTHER. That is not hypothetical and
  // it is not small — it is the exact wording of the complaint this section was
  // written for, "a 40-gold Long Mane and a 100-gold Braided War-locks are
  // pixel-identical", and on `main` the two of them read 0.05% and 0.05% under
  // the Sutton Hoo, so this table printed two numbers that both passed while
  // the shop sold one shape twice. A ladder is a set of DIFFERENT things; the
  // rung-to-rung comparison is the only one that says so.
  //
  // No new threshold. `IDENTICAL_PCT` is the bar the whole file already uses
  // for "these two are the same object with two price tags", and the hood keeps
  // the one exemption it already has, in the same place, for the same reason.
  const paid = slotOf("hair").options.filter((o) => o.cost > 0);
  const paidShots = new Map();
  for (const hair of slotOf("hair").options) {
    if (hair.value === "shaved") { cells.push("     —    "); continue; }
    const withHair = raster(staged({ helm: helm.value, hairStyle: hair.value }, QUARTER).group, LENS.portrait, QUARTER);
    if (hair.cost > 0) paidShots.set(hair.value, { hair, shot: withHair });
    const d = shapeDiff(base, withHair);
    cells.push(`${d.changed.toFixed(2)}%`.padStart(10));
    TABLE.companions.push({ kind: "hair-under-helm", helm: helm.label, option: hair.label, changed: d.changed, cover });
    // THE HOOD IS NO LONGER EXEMPT, AND THE OWNER MADE THE CALL.
    //
    // This carve-out used to say: "a hood is a bag for a head, and swallowing
    // what is under it is what its 120 gold buys ... whether a draped cowl
    // should hide a mane or let it spill out the front is a design call, and a
    // harness that decided it by fiat would be inventing a defect."
    //
    // That was the right instinct — the harness declined to rule and reported
    // instead. The ruling has now been made, 2026-08-08, in the owner's own
    // words: *"long hair dissappears fully even if it should be visible at the
    // below the helmet"*. A cowl covers the crown; it does not swallow a mane
    // that hangs past the shoulder. So the hood is held to the same bar as every
    // other helm and the note becomes an assertion.
    //
    // `hoodLeaks` is kept and still printed, because the NUMBER is worth seeing
    // next to the verdict — a hood that reads 0.9% and one that reads 0.02% are
    // both failures and are not the same distance from a fix.
    if (helm.value === HOOD && d.changed < DIFFERS_PCT) {
      hoodLeaks.push(`${hair.label} reads ${pct2(d.changed)} under the Shadow Hood`);
    }
    if (hair.cost > 0 && d.changed < DIFFERS_PCT) {
      swallowed.push(`${hair.label} (${hair.cost}g) under ${helm.label} — ${pct2(d.changed)} (helm covers ${cover.toFixed(0)}% of the face)`);
    } else if (d.changed < DIFFERS_PCT) {
      freeSwallowed.push(`${hair.label} (free) under ${helm.label} — ${pct2(d.changed)}`);
    }
  }
  const paidRows = paid.map((o) => paidShots.get(o.value)).filter(Boolean);
  for (let i = 0; i < paidRows.length; i++) {
    for (let j = i + 1; j < paidRows.length; j++) {
      const dp = shapeDiff(paidRows[i].shot, paidRows[j].shot);
      TABLE.companions.push({ kind: "paid-hair-pair", helm: helm.label,
        option: `${paidRows[i].hair.label} vs ${paidRows[j].hair.label}`, changed: dp.changed, cover });
      if (helm.value === HOOD) continue;
      if (dp.changed < IDENTICAL_PCT) {
        mergedPaid.push(`${paidRows[i].hair.label} (${paidRows[i].hair.cost}g) and `
          + `${paidRows[j].hair.label} (${paidRows[j].hair.cost}g) are the same shape under `
          + `${helm.label} — ${pct2(dp.changed)}`);
      }
    }
  }
  console.log(`  ${helm.label.slice(0, 12).padEnd(12)}  ${cover.toFixed(0).padStart(9)}%   ${cells.join("")}`);
  TABLE.companions.push({ kind: "face-coverage", helm: helm.label, cover });
}
console.log("");
// THE FREE COUNT RIDES ON THE VERDICT, not in a note under it.
//
// Six free hairstyles are swallowed too, and the harness has been exempting
// them on the reasoning that nobody paid for them. That is sound about REFUNDS
// and says nothing about how the game looks: a free crop that vanishes under a
// helm is as broken to the man wearing it as a 100-gold mane, and the owner's
// report — "across the 4 fighting types the hair designs break with helmets on
// & dont look right" — did not distinguish by price.
//
// Not gated, because the paid rungs are the ones with a promise attached and a
// bar on the free ones would be a bar on the cheapest geometry in the shop. But
// it stops being invisible: this is the third harness this week found green
// while carrying a deferral in a note nobody had to read, after the Shadow
// Hood's carve-out here and wearmeasure's seven ungated flank windows.
check("every paid hairstyle still reads under every helm, the hood included",
  swallowed.length === 0,
  (swallowed.length ? `${swallowed.length} swallowed` : "all clear")
  + (freeSwallowed.length ? ` — AND ${freeSwallowed.length} free hairstyles are swallowed too, ungated` : ""),
  swallowed);
for (const s of swallowed) note(`SWALLOWED  ${s}`);
if (freeSwallowed.length) {
  note(`${freeSwallowed.length} FREE hairstyles are also swallowed — not gated, because nobody paid for them:`);
  for (const f of freeSwallowed) note(`  ${f}`);
}
check("no two PAID hairstyles are the same shape as each other under any helm but the hood",
  mergedPaid.length === 0, mergedPaid.length ? `${mergedPaid.length} merged` : "every paid pair is two objects", mergedPaid);
for (const m of mergedPaid) note(`MERGED  ${m}`);
{
  // The hood's pair reads 0.00% and is exempt, so quoting it here would make
  // the margin on the assertion look like nothing when it is the one row the
  // assertion deliberately does not cover.
  const hoodLabel = helms.find((h) => h.value === HOOD)?.label;
  const pairs = TABLE.companions.filter((c) => c.kind === "paid-hair-pair" && c.helm !== hoodLabel);
  const worst = pairs.reduce((a, b) => (a && a.changed <= b.changed ? a : b), null);
  if (worst) note(`the closest paid pair anywhere is ${worst.option} under ${worst.helm} at ${pct2(worst.changed)} `
    + `(bar ${IDENTICAL_PCT.toFixed(2)}%)`);
}
note("the Shadow Hood is the one helm entitled to cover hair, so it is reported rather than asserted:");
for (const h of hoodLeaks) note(`  ${h}`);
TABLE.notes.push(...hoodLeaks.map((h) => `Shadow Hood — ${h}`));

// The face-coverage number is the encoded distinction, reported: a helm that
// covers a face is allowed to hide the paint on it, and the shop is what has a
// problem when it does.
const masks = TABLE.companions.filter((c) => c.kind === "face-coverage" && c.cover > 90);
note(`helms that cover more than 90% of the face: ${masks.length ? masks.map((m) => `${m.helm} (${m.cover.toFixed(0)}%)`).join(", ") : "none"}`);
note("a mask hiding a FACE is correct. Section 4 asserts the paint under it is hidden CLEANLY, not garbled.");

// ------------------------------------------------------------
// The severed head. Every cosmetic on it has to survive the cut — this is the
// only place in the game where the head is drawn on its own, and nothing has
// ever looked at it.
// ------------------------------------------------------------
console.log("\n[cos] === 3b. THE SEVERED HEAD — cosmetics survive the cut ===\n");
const lostOnCut = [];
for (const [slotName, opts] of [["helm", helms], ["hair", slotOf("hair").options], ["beard", slotOf("beard").options]]) {
  const field = SLOT_FIELD[slotName];
  const shots = opts.map((o) => {
    const c = build({ [field]: o.value });
    const sev = c.sever("head");
    if (!sev) return { o, mask: null };
    sev.part.rotation.y = Math.PI + (QUARTER * Math.PI) / 180;
    sev.part.position.set(0, 0, 0);
    // Framed on the portrait lens' aim point so the loose head lands where a
    // head belongs, rather than on the floor where the cut left it.
    sev.part.position.y = LENS.portrait.targetY;
    return { o, mask: raster(sev.part, LENS.portrait, QUARTER) };
  });
  const missing = shots.filter((s) => !s.mask || s.mask.area === 0);
  const flat = [];
  for (let i = 0; i + 1 < shots.length; i++) {
    if (!shots[i].mask || !shots[i + 1].mask) continue;
    const label = `${shots[i].o.label} -> ${shots[i + 1].o.label}`;
    const d = shapeDiff(shots[i].mask, shots[i + 1].mask);
    // Only a pair that reads on the ATTACHED head and stops reading on the
    // severed one is a defect of the cut. A pair the shape instrument already
    // called flat on a living man is that pair's own problem and is reported in
    // section 1; counting it twice here would put a beard's fault on the axe.
    const onBody = TABLE.pairs.find((r) => r.slot === slotName && r.label === label);
    if (d.changed < IDENTICAL_PCT && onBody && onBody.best.changed >= IDENTICAL_PCT) flat.push(label);
    TABLE.companions.push({ kind: "severed", slot: slotName, option: label, changed: d.changed });
  }
  const area = shots.find((s) => s.mask)?.mask.area ?? 0;
  console.log(`  ${slotName.padEnd(8)} ${opts.length} options on a severed head — ` +
    `${missing.length ? `${missing.length} SEVERED NOTHING` : `${area} px of head`}, ` +
    `${flat.length} pairs lost to the cut`);
  if (missing.length) lostOnCut.push(`${slotName}: ${missing.map((m) => m.o.label).join(", ")} vanished with the cut`);
  for (const f of flat) lostOnCut.push(`${slotName}: ${f} reads on a living man and not on a severed head`);
}
console.log("");
check("every cosmetic is still on the head after it comes off", lostOnCut.length === 0,
  lostOnCut.length ? `${lostOnCut.length} lost` : "helm, hair and beard all ride the severed head", lostOnCut);

// ============================================================
// 4. THE RENDER — the only instrument that can see war paint
// ============================================================
const FRAME_MS = 50;
/**
 * The fixed world: a fixed clock AND a fixed die.
 *
 * The clock is shoot.mjs's, for the reason recorded there and in
 * docs/COSMETICS-AUDIT.md — idle sway made two panels of the same helmet differ
 * by more than two different helmets do.
 *
 * The die is this file's, and it is what turns a picture into a measurement.
 * `vfx.ts` rolls its embers and sparks off `Math.random`, so two captures of ONE
 * subject are not the same picture: measured on this box, the mean per-pixel
 * difference between a face card and an identical face card was 0.1387%, which
 * is larger than the difference a war paint makes and would have set the bar
 * above every real finding. shoot.mjs's own note that the same subject twice
 * differs only in "a few thousandths of a code value" is a difference of MEANS
 * and hides this: the embers move, so the mean stays put while the pixels do
 * not. Seeding `Math.random` before a line of app code runs makes the sparks
 * land in the same places in every panel, and then a pixel that changed is a
 * cosmetic that changed. The floor is measured after this, not assumed.
 */
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

let server = null;
const stopServer = () => { if (server && !server.killed) server.kill("SIGTERM"); };
process.on("SIGINT", () => { stopServer(); process.exit(130); });

async function renderPass() {
  const PORT = 3100 + (process.pid % 700);
  const ORIGIN = `http://localhost:${PORT}`;
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  server = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const started = Date.now();
  for (;;) {
    try { const r = await fetch(`${ORIGIN}/api/health`); if (r.ok || r.status === 404) break; } catch { /* not up */ }
    if (Date.now() - started > 240000) die("server never came up");
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`[cos] ${useProd ? "production" : "dev"} server up on :${PORT}`);

  // See tools/lib/browser.mjs — software by default, GPU only on request, and
  // the choice is printed rather than assumed.
  const browser = await launchChromium();
  console.log(`[cos] ${rasteriserNote()}`);
  // ONE browser, and ONE page per lens — a page carries its viewport, and a
  // viewport is what a lens is here. Everything else is reused: the context, the
  // GL context, the compiled shaders and the procedural textures. A fresh
  // context per capture cost 15 s of the 50 s each.
  const pages = new Map();
  let live = null;
  const pageFor = async (lens) => {
    const key = lens.card;
    if (!pages.has(key)) {
      const ctx = await browser.newContext({
        viewport: { width: Math.round(lens.w * lens.shotScale), height: Math.round(lens.h * lens.shotScale) },
        deviceScaleFactor: 1, reducedMotion: "no-preference",
      });
      await ctx.addInitScript(installVirtualClock, FRAME_MS);
      pages.set(key, await ctx.newPage());
    }
    // ONLY ONE SCENE MAY BE ALIVE AT A TIME. A settled `/shot` page does not
    // stop: its rAF loop keeps rendering after `__shotReady`, and on a box with
    // no GPU that is a whole SwiftShader render competing for the same cores as
    // the capture you are waiting for. Measured: with an idle face card left
    // open, the first fight-card capture took 217 s against the 40 s it takes on
    // its own. So the outgoing page is parked on about:blank before the incoming
    // one is used. Reusing pages is still worth it — the context, the compiled
    // shaders and the browser process are what cost 15 s of a cold capture.
    if (live && live !== key) await pages.get(live).goto("about:blank", { timeout: 60000 }).catch(() => {});
    live = key;
    return pages.get(key);
  };

  let captures = 0;
  // Pages that have already rendered one frame and had it thrown away. See
  // `capture` — the first capture through a fresh page is not comparable with
  // the ones after it.
  const warmed = new Set();
  async function capture(lens, turn, dress, expect) {
    // THE FIRST CAPTURE THROUGH A PAGE IS DISCARDED, and this is not
    // superstition: with the clock fixed and the die seeded, two captures of one
    // subject came back byte-identical on one run and 0.74% apart on the next,
    // and the difference was that the pair had moved to the front of the queue.
    // A cold page pays for a cold route compile and a first pass of procedural
    // texture generation, and neither of those is on the virtual clock — so
    // whether a texture is ready by frame 12 is a race the harness cannot see
    // and must not measure across. One throwaway frame per page settles it, and
    // the repeatability check that runs immediately afterwards is what proves
    // it settled rather than assuming so.
    if (!warmed.has(lens.card)) {
      warmed.add(lens.card);
      console.log(`[cos] warming ${lens.card} (one capture, discarded)`);
      await capture(lens, turn, dress, null);
    }
    const page = await pageFor(lens);
    // `quality=high`, PINNED — the demotion that took a day to catch. The
    // renderer stores a MEASURED tier per browser context and a slow early
    // capture on a loaded box demoted the whole run to low, where the face
    // complexion (war paint included) is not painted at all: every warPaint
    // pair then read pixel-identical while a fresh-context probe of the same
    // build showed the paint moving 35-40% of the frame. A capture instrument
    // must never let the device pick its tier.
    const q = [`preset=${lens.card}`, `turn=${turn}`, ...Object.entries(dress).map(([s, id]) => `${s}=${id}`),
      `clean=1`, `settle=${SETTLE}`, `quality=high`].join("&");
    const t = Date.now();
    await page.goto(`${ORIGIN}/shot?${q}`, { waitUntil: "domcontentloaded", timeout: 300000 });
    await page.waitForFunction(() => window.__shotReady === true || typeof window.__shotError === "string",
      null, { timeout: 300000 });
    const staged2 = await page.evaluate(() => ({ subject: window.__shotSubject ?? null, refused: window.__shotError ?? null }));
    if (staged2.refused) die(`page refused the stage: ${staged2.refused} (${q})`);
    // The page publishes what it BUILT the warrior from. Checked, because a
    // mistyped option renders a plausible warrior in silence and the measurement
    // is then filed under a name it does not belong to — the most expensive
    // wrong answer this harness can produce, and one shoot.mjs has produced.
    for (const [k, v] of Object.entries(expect ?? {})) {
      if (String(staged2.subject?.[k]) !== String(v)) die(`asked for ${k}=${v}, got ${k}=${staged2.subject?.[k]}`);
    }
    const buf = await page.screenshot({ timeout: 300000 });
    // Every capture kept on disk (gitignored work dir), so a disputed verdict
    // can be settled by LOOKING at what the harness photographed instead of
    // by probing look-alike URLs from outside — this line exists because a
    // day was spent doing exactly that.
    try {
      mkdirSync(resolve(WORK, "caps"), { recursive: true });
      writeFileSync(resolve(WORK, "caps", `${String(captures).padStart(3, "0")}-${lens.card}-${Object.values(dress).join("_").slice(0, 60) || "warm"}.png`), buf);
    } catch { /* capture bookkeeping must never fail a run */ }
    captures++;   // warm-ups included: this number is what the run actually cost
    // Pixels, off the PNG, in the page that already has a canvas: no image
    // library and nothing to install.
    const px = await page.evaluate(async (b64) => {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = "data:image/png;base64," + b64; });
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      return { w: c.width, h: c.height, data: Array.from(d) };
    }, buf.toString("base64"));
    console.log(`[cos] capture ${captures}: ${q} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
    return { w: px.w, h: px.h, data: Uint8ClampedArray.from(px.data) };
  }

  /**
   * The colour comparison, as three numbers.
   *
   *   MEAN%  mean absolute RGB difference over the whole frame, as a share of
   *          full scale. Sensitive, and easy to dilute: a stripe painted on a
   *          face is a large change over a small part of a frame.
   *   AREA%  the number that gates. Pixels that moved by more than a JND,
   *          counted, and divided BY THE SUBJECT'S OWN AREA rather than by the
   *          frame — so it means the same thing the SIL and FORM columns mean
   *          and is held to the same 1% bar. Dividing by the frame would make
   *          the bar at fight distance require repainting a man who is 1% of it.
   *          IT CAN EXCEED 100%, and that is information rather than an error: a
   *          cosmetic moves pixels the warrior does not occupy. A gilded cloak
   *          throws light onto the turf and through the bloom, and it also hangs
   *          outside the bare-body mask the denominator is taken from. A reading
   *          over 100% says the change is bigger than the man.
   *   WORST% the largest single-pixel move, which is what tells a reader whether
   *          a small AREA% is a fine detail or a rounding error.
   *
   * A JND is taken as 2 of 255. Below that two 8-bit values are the same value
   * to an eye, and above it the pixel has changed for a reason.
   */
  const JND8 = 2;
  function pixDiff(a, b, subjectPx) {
    let sum = 0, n = 0, worst = 0, moved = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      const d = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
      sum += d; n++;
      if (d > worst) worst = d;
      if (d > JND8) moved++;
    }
    return { mean: (100 * sum) / (n * 255), worst: (100 * worst) / 255, area: (100 * moved) / (subjectPx || n) };
  }

  /**
   * How many pixels of the capture the warrior himself occupies, taken off the
   * rasteriser at the same lens and halved to the capture's own scale. It is the
   * denominator that makes a colour reading comparable with a shape reading.
   */
  const subjectPxFor = (lname, turn) => {
    const lens = LENS[lname];
    const r = raster(staged({}, turn).group, lens, turn);
    // rasterScale is twice shotScale on both lenses by construction; the ratio is
    // asserted rather than assumed, because a change to either would silently
    // rescale every AREA% in the table.
    const ratio = (lens.rasterScale / lens.shotScale) ** 2;
    if (Math.abs(ratio - 4) > 1e-9) die(`lens ${lname}: raster is ${lens.rasterScale} and shot is ${lens.shotScale}; the AREA denominator assumes exactly 2x`);
    return r.area / ratio;
  };

  console.log("\n[cos] === 4. RENDERED PIXELS ===\n");
  // THE NOISE FLOOR, measured rather than assumed. `vfx.ts` rolls its embers off
  // Math.random, so two captures of one subject are not byte-identical; shoot.mjs
  // measured mean luma 67.6705 against 67.6679 on the same subject. Every bar
  // below is a multiple of what this actually reads on the day, so the threshold
  // comes off the instrument rather than out of a guess.
  const SUBJ = { portrait: subjectPxFor("portrait", 0), fight: subjectPxFor("fight", 180) };
  const n1 = await capture(LENS.portrait, 0, { ...DRESS.ids }, { warPaint: "none" });
  const n2 = await capture(LENS.portrait, 0, { ...DRESS.ids }, { warPaint: "none" });
  const floor = pixDiff(n1, n2, SUBJ.portrait);
  // With the clock and the die both fixed, two captures of one subject are the
  // SAME BYTES — measured, not hoped for. That is what makes a 1% bar mean
  // anything: there is no noise underneath it to be confused with a cosmetic.
  // If this ever stops reading zero, something in the renderer has become
  // time- or entropy-dependent in a way no measurement here can see past, and
  // that is worth failing the run over rather than papering with a wider bar.
  check("two captures of one subject are byte-identical", floor.mean === 0 && floor.area === 0,
    `same subject twice: mean ${floor.mean.toFixed(4)}%, area ${floor.area.toFixed(4)}%, worst pixel ${floor.worst.toFixed(2)}%`);
  TABLE.notes.push(`render noise floor: mean ${floor.mean.toFixed(4)}%, area ${floor.area.toFixed(4)}% — the fixed clock and the seeded die make two captures of one subject identical`);
  note(`subject occupies ${Math.round(SUBJ.portrait)} px of the portrait capture and ${Math.round(SUBJ.fight)} px of the fight capture`);
  note(`AREA% is measured against those, so it is on the same scale as SIL% and FORM% and takes the same ${DIFFERS_PCT}% bar`);

  // ------------------------------------------------------------
  // THE CAPTURE PLAN, DERIVED RATHER THAN LISTED.
  //
  // A pair is rendered in the gate when NO FREE INSTRUMENT CAN SEE IT: its shape
  // difference is under the bar AND its catalogue value is not a colour, so
  // neither the rasteriser nor ΔE has anything to say about it. That rule is
  // computed off this run's own measurements, so a slot added to the shop
  // tomorrow that happens to be a texture or a named tint is rendered by this
  // gate the first time anybody runs it, without a line being edited here. It is
  // the same discipline `/shot?roster=1` exists for.
  //
  // Today it selects war paint (painted into the skin: no geometry at all) and
  // the cloaks above the first rung (one cloak, four names) — which is exactly
  // the set the audit says has NEVER BEEN RENDERED FOR REVIEW.
  // ------------------------------------------------------------
  // Which lens a slot is judged on. Head furniture is bought on a face card and
  // a cloak is not in one — the portrait lens is framed crown-to-sternum.
  const LENS_FOR = { helm: "portrait", hair: "portrait", hairColor: "portrait", beard: "portrait",
    beardColor: "portrait", warPaint: "portrait", cloak: "fight", armor: "fight" };
  const isColourValue = (slotName) => RECOLOUR_SLOTS.has(slotName);

  const plan = new Map(); // slot -> { lenses, options, why }
  if (ALL) {
    for (const sl of slotsToSweep) plan.set(sl.slot, { lenses: ["portrait", "fight"], options: sl.options.slice(), why: ["--all"] });
  } else {
    for (const r of TABLE.pairs) {
      if (r.deltaE !== undefined || !r.best) continue;
      if (isColourValue(r.slot)) continue;             // ΔE already answered it
      if (r.best.changed >= DIFFERS_PCT) continue;     // the rasteriser answered it
      const sl = slotOf(r.slot);
      const cur = plan.get(r.slot) ?? { lenses: [LENS_FOR[r.slot] ?? "portrait"], options: [], why: [] };
      // ONLY the options in a blind pair, not the whole slot. A beard ladder with
      // one flat rung costs two captures here rather than five, and on a box
      // where a capture is forty seconds that distinction is most of the run.
      const idx = sl.options.findIndex((o) => r.label.startsWith(`${o.label} ->`));
      for (const o of [sl.options[idx], sl.options[idx + 1]]) if (o && !cur.options.includes(o)) cur.options.push(o);
      cur.why.push(r.label);
      plan.set(r.slot, cur);
    }
  }
  for (const [name, spec] of plan) {
    console.log(`[cos] rendering ${spec.options.length} of ${slotOf(name).options.length} ${name} options at ${spec.lenses.join(" and ")} — ` +
      (ALL ? "--all" : `${spec.why.length} pair(s) no free instrument can see: ${spec.why.join(", ")}`));
  }
  const budget = [...plan].reduce((n, [, spec]) => n + spec.options.length * spec.lenses.length, 0)
    + (ALL ? helms.length : 3) * slotOf("warPaint").options.length + 2;
  console.log(`[cos] plan: ${budget} captures at ~40 s each on this box ≈ ${Math.round((budget * 40) / 60)} min`);

  console.log("");
  console.log("  slot         pair                                        lens      MEAN%   AREA%   worst%  verdict");
  console.log("  --------------------------------------------------------------------------------------------------");
  const flatPairs = [];
  // Ordered by lens, so the browser switches viewport once rather than per slot.
  const planned = [...plan].sort((a, b) => a[1].lenses[0].localeCompare(b[1].lenses[0]));
  for (const [name, spec] of planned) {
    const sl = slotOf(name);
    const field = SLOT_FIELD[name];
    const stage = STAGE[name] ?? { dress: {}, turns: [QUARTER] };
    const turn = stage.turns[0];
    // The full audit dress goes over on the query string rather than being left
    // to the page's own base, so the warrior the renderer builds is the warrior
    // the rasteriser built, slot for slot, and neither can drift from the other.
    const dressIds = { ...DRESS.ids, ...Object.fromEntries(Object.entries(stage.dress).map(([f, v]) => {
      const sn = Object.keys(SLOT_FIELD).find((k) => SLOT_FIELD[k] === f);
      return [sn, slotOf(sn).options.find((o) => o.value === v).id];
    })) };
    for (const lname of spec.lenses) {
      const lens = LENS[lname];
      const shots = [];
      for (const o of spec.options) {
        shots.push({ o, img: await capture(lens, turn, { ...dressIds, [name]: o.id },
          typeof o.value === "string" ? { [name]: o.value } : null) });
      }
      for (let i = 0; i + 1 < shots.length; i++) {
        const d = pixDiff(shots[i].img, shots[i + 1].img, SUBJ[lname]);
        const v = d.area < IDENTICAL_PCT ? "IDENTICAL" : d.area < DIFFERS_PCT ? "FAINT" : "DIFFERS";
        const label = `${shots[i].o.label} -> ${shots[i + 1].o.label}`;
        console.log(`  ${name.padEnd(11)}  ${label.slice(0, 42).padEnd(42)}  ${lname.padEnd(8)}  ${d.mean.toFixed(3).padStart(6)}  ${d.area.toFixed(2).padStart(6)}  ${d.worst.toFixed(1).padStart(6)}  ${v}`);
        const row = TABLE.pairs.find((r) => r.slot === name && r.label === label);
        if (row) (row.pix ??= {})[lname] = d;
        else TABLE.pairs.push({ slot: name, label, cost: shots[i + 1].o.cost, lens: {}, pix: { [lname]: d } });
        if (v !== "DIFFERS") flatPairs.push(`${name}: ${label} — ${d.area.toFixed(2)}% of the subject moved at ${lname} (${v}), and the shape instrument already reported it flat`);
      }
    }
  }
  console.log("");
  check("every pair the shape instrument could not separate is separated by the renderer",
    flatPairs.length === 0, flatPairs.length ? `${flatPairs.length} pairs the renderer cannot separate either` : `all above ${DIFFERS_PCT}% of the subject`, flatPairs);
  for (const f of flatPairs) note(`FLAT       ${f}`);

  // ------------------------------------------------------------
  // THE COMPANION ASSERTION, in pixels, because war paint has no geometry.
  //
  // A mask hiding a FACE is correct; a mask hiding HAIR is not; and paint that
  // is neither visible nor covered is the defect. So: measure the paints on a
  // bare head and under the Sutton Hoo mask (all ten helms under --all), and
  // decide with the face-coverage number the geometry pass already measured.
  // ------------------------------------------------------------
  console.log("\n[cos] === 4b. WAR PAINT UNDER THE HELMETS THAT CAME AFTER IT ===\n");
  const paints = slotOf("warPaint").options;
  const wearHelms = ALL ? helms : helms.filter((h) => ["none", "spectacle", "suttonhoo"].includes(h.value));
  console.log("  under helm     face covered  pair                                   MEAN%   AREA%   verdict");
  console.log("  ----------------------------------------------------------------------------------------------");
  const paintFlat = [], paintGarbled = [];
  for (const helm of wearHelms) {
    const cover = TABLE.companions.find((c) => c.kind === "face-coverage" && c.helm === helm.label)?.cover ?? 0;
    const shots = [];
    for (const p of paints) shots.push({ p, img: await capture(LENS.portrait, 0, { ...DRESS.ids, warPaint: p.id, helm: helm.id }, { warPaint: p.value, helm: helm.value }) });
    for (let i = 0; i + 1 < shots.length; i++) {
      const d = pixDiff(shots[i].img, shots[i + 1].img, SUBJ.portrait);
      const v = d.area < IDENTICAL_PCT ? "IDENTICAL" : d.area < DIFFERS_PCT ? "FAINT" : "DIFFERS";
      const label = `${shots[i].p.label} -> ${shots[i + 1].p.label}`;
      console.log(`  ${helm.label.slice(0, 13).padEnd(13)}  ${cover.toFixed(0).padStart(11)}%  ${label.slice(0, 37).padEnd(37)}  ${d.mean.toFixed(3).padStart(6)}  ${d.area.toFixed(2).padStart(6)}  ${v}`);
      TABLE.companions.push({ kind: "paint-under-helm", helm: helm.label, option: label, pix: d.mean, area: d.area, cover, verdict: v });
      if (v !== "DIFFERS") {
        // 90% is the line, and it is where it is because the shop has exactly
        // one helm past it: the Sutton Hoo mask, at 100%, which is "a face with
        // no man in it". Everything else in the shop leaves more than half the
        // face open and has no business hiding a stripe painted on it.
        if (cover > 90) paintFlat.push(`${label} under ${helm.label} (covers ${cover.toFixed(0)}% of the face)`);
        else paintGarbled.push(`${label} under ${helm.label}, which covers only ${cover.toFixed(0)}% of the face`);
      }
    }
  }
  console.log("");
  check("war paint reads on any face that is not behind a mask", paintGarbled.length === 0,
    paintGarbled.length ? `${paintGarbled.length} pairs flat on an exposed face` : `every pair moves more than ${DIFFERS_PCT}% of the subject wherever the face is open`, paintGarbled);
  for (const p of paintGarbled) note(`FLAT       ${p}`);
  if (paintFlat.length) {
    note("correctly hidden by a mask — this is a SHOP finding, not a render defect:");
    for (const p of paintFlat) note(`  ${p}`);
    TABLE.notes.push(`${paintFlat.length} war-paint pairs are correctly hidden behind a face mask: paid paint the player cannot see under a paid helm`);
  }

  await browser.close();
  return captures;
}

let captures = 0;
if (RENDER) {
  try { captures = await renderPass(); } finally { stopServer(); }
} else {
  console.log("\n[cos] === 4. RENDERED PIXELS — skipped (--no-render) ===\n");
  note("war paint is invisible to every free instrument. A run with --no-render does not cover it.");
}

// ============================================================
// 5. WEAR — folded in from tools/wearmeasure.mjs
//
// It already fails when geometry punches through skin over 32 heads, and a
// helmet that renders as a slab with a face coming through it is a cosmetic
// defect whatever else this file measures. Run rather than reimplemented: two
// copies of that measurement would drift, and the fold is the point.
// ============================================================
if (WEAR) {
  console.log("\n[cos] === 5. WEAR (folded in from tools/wearmeasure.mjs) ===\n");
  const r = spawnSync("node", ["tools/wearmeasure.mjs"], { cwd: ROOT, encoding: "utf8" });
  const lines = (r.stdout || "").split("\n");
  for (const l of lines.filter((l) => /FAIL|PASS:|bars:/.test(l))) console.log(`  ${l}`);
  // THE REASON MUST BE THE LINE THAT FAILED, NOT THE LAST LINE PRINTED.
  //
  // This took `.pop()` of every `PASS:`/`FAIL:` line, and `wearmeasure`'s LAST
  // verdict is the openings, which passes. So a run whose real finding was
  // "FAIL: 6/8 helmets with hanging plates keep them on the head" reported
  //
  //   FAIL  no helmet shears through the head ... — PASS: the openings — WITH 7
  //         ungated window(s) reported above, which is a deferral ...
  //
  // A FAIL whose stated reason is the word PASS sends the next reader after a
  // phantom, and it hid a 49.8 deg nape-guard flare for as long as it stood.
  // The failing lines are what is quoted now, all of them, and the passing
  // verdicts only when there are none.
  const strip = (l) => l.replace(/^\[wear\] /, "");
  const failed = lines.filter((l) => /FAIL/.test(l)).map(strip);
  const verdict = failed.length
    ? failed.join(" | ")
    : (lines.filter((l) => /PASS:/.test(l)).pop() ?? "").replace(/^\[wear\] /, "");
  check("no helmet shears through the head it is worn on (32 heads x every shell)",
    r.status === 0, verdict || `wearmeasure exited ${r.status}`);
  TABLE.notes.push(`wearmeasure: ${verdict}`);
}

// ============================================================
// THE TABLE — the deliverable
// ============================================================
const wall = (Date.now() - T0) / 1000;
const cell = (v) => (v === null || v === undefined ? "—" : `${v.toFixed(2)}%`);
const mdRow = (r) => {
  const p = r.lens?.portrait, f = r.lens?.fight;
  const de = r.deltaE !== undefined ? r.deltaE.toFixed(1) : "—";
  const pix = r.pix ? Object.entries(r.pix).map(([k, v]) => `${v.area.toFixed(2)}% of subject, mean ${v.mean.toFixed(3)}% (${k})`).join("<br>") : "—";
  const verdict = r.verdict
    ?? (r.deltaE !== undefined ? (r.deltaE < JND ? "**SAME COLOUR**" : r.deltaE < LADDER_DE ? "NEAR" : "DIFFERS") : "—");
  return `| ${r.slot} | ${r.label} | ${r.cost}g | ${cell(p?.sil)} | ${cell(p?.form)} | ${cell(f?.sil)} | ${cell(f?.form)} | ${de} | ${pix} | ${verdict === "IDENTICAL" ? "**IDENTICAL**" : verdict} |`;
};
const paintRows = TABLE.companions.filter((c) => c.kind === "paint-under-helm");
const md = [
  "# The cosmetics sweep",
  "",
  `Written by \`npm run cosmetictest${ALL ? " -- --all" : ""}\` on ${new Date().toISOString().slice(0, 10)}. `
  + "Do not edit this file by hand — re-run the harness, which is `tools/cosmetictest.mjs`.",
  "",
  `**${OPTION_COUNT} options across ${ARMOURY.length} slots. `
  + `${wall.toFixed(0)} s wall clock, ${captures} rendered captures.** `
  + `${results.filter((r) => r.pass).length} of ${results.length} assertions held.`,
  "",
  "## How to read it",
  "",
  "Four instruments, because the audit's central finding is that **a ladder of recolours is not progression** and a colour",
  "measure is exactly the instrument that cannot see that. Shape and colour are measured separately and reported in",
  "separate columns.",
  "",
  "| column | what it is | what a 0.00% means |",
  "|---|---|---|",
  "| **SIL%** | symmetric difference of two coverage masks over their union, materials and light and pose taken away entirely — the outline, and only the outline | the two options have the same outline from that lens |",
  "| **FORM%** | share of the overlap where the nearest surface moved more than 2 mm | the two options are the same surface inside that outline |",
  "| **ΔE** | CIELAB ΔE76 between the two catalogue swatches | the two rungs are literally the same colour |",
  "| **PIX%** | pixels the real renderer moved by more than a just-noticeable 2/255, as a share of the subject's own area, on a fixed rig, a fixed light, a fixed virtual clock and a **seeded die** — two captures of one subject are byte-identical | the renderer draws the same picture for both |",
  "",
  "**AREA% can exceed 100%.** The denominator is the warrior's own pixels; a cosmetic can move more than that, because a",
  "gilded cloak lights the turf beside it and hangs outside the bare-body mask the denominator is measured from. A reading",
  "over 100% means the change is bigger than the man.",
  "",
  `Verdicts are taken on the option's **own best lens and bearing** — a cloak is not in a crown-to-sternum portrait and`,
  `judging it there would report a defect the lens invented. IDENTICAL is below ${IDENTICAL_PCT}% (one object with two`,
  `price tags), FAINT is below ${DIFFERS_PCT}%, above that is DIFFERS.`,
  "",
  "A 0.00% in SIL and FORM for a **shape** slot is a defect. A 0.00% in those columns for a **colour** slot is correct and",
  "expected — that is what a recolour is, and it is why the ΔE and PIX columns exist.",
  "",
  "## Every adjacent pair",
  "",
  "| slot | pair | cost | SIL% portrait | FORM% portrait | SIL% fight | FORM% fight | ΔE | PIX% | verdict |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...TABLE.pairs.map(mdRow),
  "",
  "## Every adjacent pair, per bearing",
  "",
  "The verdict above takes the best of these. A pair that reads from behind and not from the front is a real thing to",
  "know, and a maximum hides it.",
  "",
  "| slot | pair | lens | bearing | SIL% | FORM% | union px |",
  "|---|---|---|---|---|---|---|",
  ...TABLE.pairs.flatMap((r) => Object.entries(r.byTurn ?? {}).map(([k, d]) => {
    const [lname, turn] = k.split("@");
    return `| ${r.slot} | ${r.label} | ${lname} | ${turn}° | ${cell(d.sil)} | ${cell(d.form)} | ${d.union} |`;
  })),
  "",
  "## Every hairstyle under every helm",
  "",
  "How much of the picture the hairstyle changes once it is put on a helmeted head, as a percentage of the subject.",
  "**Face covered** is how much of the bare head's own pixels the helm puts metal in front of — it is the number that",
  "decides whether a hidden cosmetic is a mask doing its job or a defect.",
  "",
  "| helm | face covered | " + slotOf("hair").options.filter((o) => o.value !== "shaved").map((o) => `${o.label} (${o.cost}g)`).join(" | ") + " |",
  "|---|---|" + slotOf("hair").options.filter((o) => o.value !== "shaved").map(() => "---|").join(""),
  ...helms.map((h) => {
    const cover = TABLE.companions.find((c) => c.kind === "face-coverage" && c.helm === h.label)?.cover ?? 0;
    const cells = slotOf("hair").options.filter((o) => o.value !== "shaved").map((o) => {
      const c = TABLE.companions.find((c) => c.kind === "hair-under-helm" && c.helm === h.label && c.option === o.label);
      return c ? cell(c.changed) : "—";
    });
    return `| ${h.label} | ${cover.toFixed(0)}% | ${cells.join(" | ")} |`;
  }),
  "",
  ...(paintRows.length ? [
    "## War paint under the helmets that came after it",
    "",
    "War paint is painted into the skin texture. It has no geometry and no catalogue colour, so it is invisible to every",
    "free instrument and the renderer is the only thing that can see it at all. A pair that is one picture behind a helm",
    "covering more than 90% of the face is the mask doing its job — and a shop problem, not a render one.",
    "",
    "| helm | face covered | pair | AREA% of subject | mean% of frame | verdict |",
    "|---|---|---|---|---|---|",
    ...paintRows.map((c) => `| ${c.helm} | ${c.cover.toFixed(0)}% | ${c.option} | ${c.area.toFixed(2)}% | ${c.pix.toFixed(3)}% | ${c.verdict === "IDENTICAL" ? "**IDENTICAL**" : c.verdict} |`),
    "",
  ] : []),
  "## Cosmetics on a severed head",
  "",
  "The only place in the game the head is drawn on its own, and nothing had ever looked at it.",
  "",
  "| slot | pair | change on the severed head |",
  "|---|---|---|",
  ...TABLE.companions.filter((c) => c.kind === "severed").map((c) => `| ${c.slot} | ${c.option} | ${cell(c.changed)} |`),
  "",
  "## What this run found",
  "",
  ...results.filter((r) => !r.pass).flatMap((r) => [
    `- **FAILED** — ${r.name}: ${r.detail ?? ""}`,
    ...(r.items ?? []).map((i) => `  - ${i}`),
  ]),
  ...(results.every((r) => r.pass) ? ["- every assertion held."] : []),
  "",
  "## Notes from this run",
  "",
  ...TABLE.notes.map((n) => `- ${n}`),
  "",
  "## What the gate should run",
  "",
  `\`npm run cosmetictest\` — the default. Every instrument that costs nothing (all ${OPTION_COUNT} options in silhouette at`,
  "both lenses, every companion pairing, every colour ladder in ΔE, and the folded-in `wearmeasure`), plus rendered",
  "captures for exactly the pairs no free instrument can see. That set is **derived from the run's own measurements**, not",
  "listed here or in the code, so a slot added to the shop tomorrow is covered the first time anybody runs it.",
  "",
  "`npm run cosmetictest -- --all` renders every option at both lenses and puts war paint under all ten helms. That is",
  "about 150 captures and roughly two hours on a GPU-less box. It is an art-wave tool, not a gate.",
  "",
].join("\n");
mkdirSync(resolve(ROOT, "docs"), { recursive: true });
writeFileSync(resolve(ROOT, "docs/COSMETICS-SWEEP.md"), md);

console.log("\n[cos] ===================================================");
console.log(`[cos] ${results.filter((r) => r.pass).length}/${results.length} checks passed`);
console.log(`[cos] ${OPTION_COUNT} options, ${TABLE.pairs.length} adjacent pairs, ${TABLE.companions.length} companion pairings`);
console.log(`[cos] ${captures} rendered captures, ${wall.toFixed(1)} s wall clock${ALL ? " (--all)" : " (fast default — the gate should use this)"}`);
console.log(`[cos] table -> docs/COSMETICS-SWEEP.md`);
console.log(`[cos] ${failed ? "FAIL" : "PASS"}`);
process.exit(failed ? 1 : 0);
