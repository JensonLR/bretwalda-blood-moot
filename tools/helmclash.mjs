#!/usr/bin/env node
// ============================================================
// HELMCLASH — the ruler for the four helm faults the owner photographed.
//
//   npm run helmclash
//   npm run helmclash -- --cls huscarl --helm suttonhoo
//   npm run helmclash -- --section 1,4
//
// The owner's four notes, in his words, and which section answers each:
//
//   1. "The Sutton Hoo helmet on huscarl currently clashes with the mesh
//      unlike other helmets."                                    -> 1 LAYERS
//   2. "On the remaining classes (warden etc.) the ears stick out." -> 2 FLESH
//   3. "There's a full neck mesh on the front with a clear back?
//      That's really sloppy."                                     -> 3 WRAP
//   4. "The Wyrm-Crest Helmet needs a big update - the top piece is
//      unrecognisable & also floating above the helmet, not attached."
//      (and it clashed with the huscarl's rear chainmail)          -> 4 CREST
//                                                                     and 1
//   5 PELT is new and has no recorded baseline: hair or a beard coming out
//     THROUGH a helm it is supposed to be inside of.
//
// ------------------------------------------------------------
// WHAT IS SWEPT
// ------------------------------------------------------------
//
// Four classes x nine helms x EIGHT HAIR AND BEARD RUNGS, free and paid. The
// rung list and the argument for its shape are over `BEARD_RUNGS`; the short
// version is that this file used to build `defaultAppearance` and nothing else,
// so no cosmetic anybody paid for had ever been under a helm in front of it.
//
// ------------------------------------------------------------
// WHAT THIS READS, AND WHY IT IS THE MESH AND NOT THE MATHS
// ------------------------------------------------------------
//
// Every number below is taken off the triangles `buildCharacter` actually
// emits, in the head pivot's own frame. Nothing here re-derives `coifLevels`,
// `hullAt`, `helmForm` or a ring table; nothing here keeps a copy of a
// constant that lives in `characters.ts`.
//
// That is a deliberate correction to the instrument this file replaces, and
// `docs/OPEN-DEFECTS.md` names the fault it is correcting: "`helmclash`
// section 1 may read `coifLevels` WITHOUT applying their z shift, which is the
// identical fault `hullAt` was fixed for one level up". A ruler that rebuilds
// the coif from its own copy of the ring table can get the rings' `z` offset
// wrong, or their shoulder correction, or the `patch` inset — and then it is
// measuring a coif nobody wears. The mesh cannot drift from the build, because
// it IS the build. `tools/shoot.mjs` carries the same lesson about a helmet
// ladder duplicated into a harness, and `wornRing` carries it about a spy that
// could not see the largest sheet of metal on the helmet.
//
// THE PRICE OF READING THE MESH, measured rather than assumed. A tessellated
// ring cuts inside the analytic curve it was sampled from: measured on the
// huscarl's coif at the rear, the chords dip 1.19 mm inside the ring at the
// midpoint between two columns (r = 118.44 mm at az 180, 117.25 mm at az 188).
// So section 1 reads about a millimetre SHALLOWER than a ruler working off
// `coifLevels` would, and the recorded readings from the lost pass sit about a
// millimetre above these. That is the whole of the disagreement between the two
// instruments and it is in the direction the tessellation predicts. Both are
// right about their own object; this one is right about the object the player
// sees, which is why the difference is recorded here rather than tuned away.
//
// ------------------------------------------------------------
// HOW A PIECE IS IDENTIFIED, since nothing survives the merge
// ------------------------------------------------------------
//
// `Part.merge` concatenates every geometry that shares a material into one
// buffer, so a helmet arrives as three or four meshes and the bowl, the nape
// fall and the cheek guards are all inside one of them. Tags do not survive.
//
// They do not have to. `mergeGeometries` CONCATENATES indices — it never welds
// — so the index graph of the merged buffer falls apart into exactly the
// geometries that went in. One connected component of that graph is one
// `p.add` call: one bowl, one fall, one guard, one coif. That is the piece
// list this file works in, and it is recovered rather than declared.
//
// WHAT EACH PIECE IS MADE OF is decided by difference, the way
// `tools/wearmeasure.mjs` decides it: build the same head BARE, and every
// material tint on it is skin, hair, beard, eye or paint. Anything the helmed
// build adds is kit. Inside the kit, the mail is `finishKit(armorColor).mail`
// — read from the exported function rather than typed in, so a player's armour
// finish cannot blind the gate. A rung authored tomorrow with a substance
// nobody has seen is inside this instrument the day it is written.
//
// ------------------------------------------------------------
// THE RAY, AND WHY IT IS HORIZONTAL
// ------------------------------------------------------------
//
// Sections 1, 2, 3 and 5 all ask "what is outboard of this point". The ray is
// horizontal, cast from the head's own vertical axis outward. That is not a
// convenience: the coif, the ventail and the nape fall are all swept as rings
// about that axis — `{ y, hw, hd, z }`, a half-breadth and a half-depth at a
// height — so a horizontal ray crosses them square. A ray radial from the
// skull's centre would cross the fall obliquely and read its own obliquity as
// depth, and a ray along a surface normal would read the sheet's own curvature.
//
// +Z IS THE FACE. Costly to relearn — the last pass paid for it twice — so it
// is asserted at startup rather than trusted. `assertFaceIsPlusZ` builds the one
// helmet that has both a face plate and a coif and prints the two means it
// finds: on this tree the Sutton Hoo's forward plate sits at +107 mm z and the
// mail at -41, and `docs/OPEN-DEFECTS.md` records the same coif at -42. Get this
// backwards and every azimuth printed below is a lie, so the run stops instead.
// Every azimuth in this file is degrees off dead ahead: 0 is the face, 180 the
// nape.
//
// ------------------------------------------------------------
// DETERMINISM
// ------------------------------------------------------------
//
// One seed, one LOD, fixed sample grids, no Math.random, no wall clock in the
// output. Two runs are byte-identical; `--twice` proves it in-process by
// running the whole battery twice and diffing the two transcripts.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".helmclash");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);

// ---------------- the build under test ----------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts", "--outDir", ".helmclash",
  "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(d, e.name)) : e.name === "characters.js" && found.push(resolve(d, e.name)); };
walk(OUT);
if (!found[0]) {
  console.error("[clash] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || ""));
  process.exit(2);
}
const { buildCharacter, defaultAppearance, finishKit, HELM } = await import(pathToFileURL(found[0]).href);
const THREE = await import("three");

const CLASSES = flag("cls", "") ? flag("cls").split(",") : ["huscarl", "warden", "berserker", "runekeeper"];
const HELMS = flag("helm", "") ? flag("helm").split(",") : Object.keys(HELM).filter((h) => h !== "none");
const SECTIONS = new Set((flag("section", "1,2,3,4,5")).split(",").map(Number));
/**
 * ONE SEED, and it is the seed and not an average.
 *
 * Swept over seeds 1, 7, 13, 31, 101 and 7932 on the huscarl while this was
 * being calibrated, section 1's worst reading moves 0.1 mm on the Jarl's
 * Crowned (13.9-14.0), 0.2 on the Sutton Hoo (13.7-13.9) and 1.3 on the Wyrm
 * (12.6-13.9), and every one of those four rungs is red on every seed. These
 * are faults in constants rather than in the per-warrior face traits, so a mean
 * over seeds would cost six times the run for a number nobody argues about.
 * `--seed` moves it when somebody wants to argue about one, and nothing here
 * has been swept over seeds on the other three classes.
 */
const SEED = Number(flag("seed", "13"));
/** `high` is what the armoury card and the portrait lens both render at. */
const LOD = "high";

// ============================================================
// The head as a list of pieces
// ============================================================

const RIG = "rig:";
const hexOf = (m) => {
  const mat = Array.isArray(m.material) ? m.material[0] : m.material;
  return mat?.color?.getHexString?.() ?? "??";
};

/**
 * TWO TINTS THAT TELL THE BEARD FROM THE HAIR, and they are labels rather than
 * a change to the subject.
 *
 * The catalogue ships Oak Brown as the default for BOTH the hair slot and the
 * beard slot — `defaultAppearance` sets `hairColor` and `beardColor` to the same
 * 0x4a3220 — so on every head this file used to build, the hair and the beard
 * carried one tint and were one label. That is the whole of the blindness in
 * section 5: its denominator was hair AND beard together, so deleting the beard
 * outright moved the reading DOWN and no line said the beard was gone.
 *
 * The builder takes a colour as a colour. Measured rather than assumed: eight
 * heads (four classes, bare and Sutton Hoo) build the same mesh count and the
 * same triangle count with these tints as with the catalogue's, and
 * `assertTintsAreLabels` re-checks it at every run rather than trusting this
 * paragraph. The hair material also draws the lashes, so a "hair" piece list is
 * hair and lashes; the beard material draws the beard and nothing else, which is
 * the list section 5 needs.
 */
const HAIR_TINT = 0x00fe01;
const BEARD_TINT = 0x00fe02;

/**
 * THE RUNGS A PLAYER CAN ACTUALLY BUY — and until this pass, none of them.
 *
 * Every head this file built was `{ ...defaultAppearance(cls), helm }`, so the
 * warden and the runekeeper were only ever measured with `beard_short` and
 * `hair_short`, both free. No paid cosmetic had ever been under a helm in front
 * of this ruler. The consequence was found by hand rather than by the gate:
 * with the 40-gold `beard_full`, a hard-edged brown wedge of beard punches out
 * through the mail rings at the throat under the Sutton Hoo, on warden,
 * berserker and runekeeper, and nothing measured it.
 *
 * WHAT IS SWEPT, AND WHY NOT EVERYTHING. The shop has eight slots. Five of them
 * — the three colour ladders, the cloak, the armour finish — cannot put a
 * surface inside a helmet: `cosmetictest` reads every rung of Hair Colour, Beard
 * Colour and Armour Finish at 0.00% in silhouette AND form, because a tint is
 * what they are, and a cloak hangs off the shoulders. The two that can are the
 * two the helm sits on: HAIR and BEARD. Both are swept whole, every rung, free
 * and paid.
 *
 * They are swept as two ladders and not as a cross-product. Each rung is built
 * with the other slot at the class's own default, which is 5 + 4 - 1 = 8 heads
 * per class per helm rather than 20 — 288 heads across the battery instead of
 * 720. The cross-product would be worth its price if hair and beard interacted,
 * and on this tree they do not: they are separate parts, built by separate
 * branches, and neither reads the other's style. If somebody writes a rule that
 * makes them interact — a gathered braid that tucks a beard, say — this comment
 * is the one to come back to, and the answer will be to sweep the product.
 */
const BEARD_RUNGS = ["none", "short", "full", "forked", "braided"];
const HAIR_RUNGS = ["shaved", "short", "long", "braids"];
const getupCache = new Map();
function getupsOf(cls) {
  let list = getupCache.get(cls);
  if (list) return list;
  const d = defaultAppearance(cls);
  list = [];
  const seen = new Set();
  const add = (name, hairStyle, beardStyle) => {
    // The class default IS one of the rungs — the berserker's default beard is
    // `full`, the others' is `short` — so it is deduplicated by what it builds
    // rather than by what it is called, and the head is built once.
    const k = `${hairStyle}/${beardStyle}`;
    if (seen.has(k)) return;
    seen.add(k);
    list.push({ name, hairStyle, beardStyle });
  };
  add("default", d.hairStyle, d.beardStyle);
  for (const b of BEARD_RUNGS) add(`beard=${b}`, d.hairStyle, b);
  for (const h of HAIR_RUNGS) add(`hair=${h}`, h, d.beardStyle);
  getupCache.set(cls, list);
  return list;
}
const defaultGetup = (cls) => getupsOf(cls)[0];

/** The appearance this file measures: one rung of the shop, with the two labels on. */
const apOf = (cls, g = defaultGetup(cls)) => ({
  ...defaultAppearance(cls), hairColor: HAIR_TINT, beardColor: BEARD_TINT,
  hairStyle: g.hairStyle, beardStyle: g.beardStyle,
});

/**
 * THE ATLAS PLANE — where this ruler's scope stops, and why it is not the head
 * pivot's child list.
 *
 * `headPieces` used to be `pivot.traverse(...)`, and PARENTAGE IS THE WRONG
 * QUESTION. In this rig a node hangs off `rig:headPivot` when it has to TURN
 * with the head, not when the player sees it beside the head. `characters.ts`
 * says so in as many words over its own neck: the neck "hangs off `root`
 * exactly as the torso does, so `insertSpine` carries it with the chest and
 * `severBody` leaves it alone" — a deliberate animation decision, correct on
 * its own terms, and nothing to do with what is on show around a helmet.
 *
 * So `rig:neck` — 380 triangles of complexion, `c99d75` — is a SIBLING of the
 * head pivot and was outside every reading this file has ever taken. Six rounds
 * of section 3 measured a head with no neck in it and called the nape covered;
 * the bare band the owner photographed under the Sutton Hoo IS that neck. The
 * instrument was structurally unable to see the defect it was pointed at, which
 * is instance sixteen of a measurement answering the wrong question and is
 * recorded as such in `docs/OPEN-DEFECTS.md`.
 *
 * THE REPLACEMENT IS SPATIAL, BECAUSE THE QUESTION IS SPATIAL. Walk the whole
 * rig and keep what reaches the head, where "reaches the head" is at or above
 * the ATLAS — y = 0 in the head pivot's own frame, which is where
 * `characters.ts` puts that pivot: `headPivot.position.set(0, S.neckTop, 0)`.
 * That is the rig's own landmark for where the neck ends and the head begins,
 * read off the build rather than typed in here, so a stature change moves it
 * without an edit.
 *
 * WHAT THAT ADMITS AND WHAT IT REFUSES, measured over the whole battery — four
 * classes x nine helms x eight rungs, and `helm=none` on top — rather than
 * argued. Exactly ONE node outside the pivot crosses the atlas plane:
 *
 *   CROSSES   rig:neck    max y   +95.0 mm    380 tri   c99d75
 *   below     rig:torso   max y   -19.1 mm    252 tri   c2b69c   <- the next one up
 *   below     rig:arm±1   max y   -27.1 mm
 *   below     rig:cloak   max y   -87.8 mm
 *
 * so the boundary clears the highest thing it excludes by 19.1 mm, and the neck
 * clears it by 95. NOTHING IS HARD-CODED TO THE NECK: the test is the plane, and
 * a hauberk collar or a pauldron authored tomorrow that rises past the atlas is
 * inside this instrument the day it is written, which is the whole point of
 * fixing the traversal instead of naming the one node that got missed.
 *
 * WHY THE PLANE IS NOT LOWER, and this is the constraint that sets it. The body
 * must stay OUT. `bareTints` learns what "the man" is made of by building the
 * same head bare and taking every tint on it, and a scope that reached the torso
 * would enrol the torso's `bfa25c` — 1466 triangles of it — as flesh. `bfa25c`
 * is also the Wyrm-Crest's gilt and the Jarl's circlet, so sections 2 and 4
 * would file those helmets as skin and go blind, which is the identical trap the
 * note over `bareTints` describes for the braided rung's brass rings. A wider
 * scope is not automatically a better one; this one is as wide as it can be
 * without blinding two sections, and the 19.1 mm margin is the room it has.
 *
 * THE UNION IS DELIBERATE. Everything under the pivot is kept whether or not it
 * crosses the plane, so this change can only ADD to what was measured before and
 * never silently drop a piece the old scope had. Outside the pivot the `rig:`
 * tag is required as well, because `anim.ts` hangs weapons, shields and bone
 * chains off this rig and that prefix is what `characters.ts` provides to tell
 * body from baggage "without a whitelist that goes stale".
 *
 * A PIECE IS KEPT WHOLE once it qualifies — the neck is admitted on its +95 mm
 * top and comes in with all 380 triangles, down to its -212 mm hem. Clipping it
 * to the plane would put a cut edge in the ray's way and invent a surface the
 * player never sees; the sections sample the heights they sample, and geometry
 * below them is simply never hit.
 */
const ATLAS_Y = 0;

/**
 * The meshes this ruler is allowed to see, and the ONE place that decides it.
 *
 * `headPieces` and `assertTintsAreLabels` each had their own `pivot.traverse`,
 * so the scope fault lived in the file twice. It is answered here once, and both
 * call this, because two copies of a scope rule are two chances to fix one of
 * them. Each mesh is handed over with its vertices already in the pivot's frame
 * and with the top height that admitted it, so no caller transforms twice.
 */
function headScope(root, pivot, fn) {
  const inv = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
  const underPivot = (o) => { for (let c = o; c; c = c.parent) if (c === pivot) return true; return false; };
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    // Body, not baggage — see the note above. Anything under the pivot was in
    // scope before this change and stays in scope unconditionally, so widening
    // the ruler can only add to what it measured and never quietly drop a piece.
    const inHead = underPivot(o);
    if (!inHead && !o.name.startsWith(RIG)) return;
    const pos = o.geometry.attributes.position;
    const mw = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const P = new Float64Array(pos.count * 3);
    const v = new THREE.Vector3();
    // The true maximum height in the pivot's frame, taken off the vertices
    // themselves. A transformed bounding box would only bound it, and the margin
    // this plane runs on is 19.1 mm — small enough that a bound which overshoots
    // could let the torso in and blind sections 2 and 4.
    let topY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mw);
      if (v.y > topY) topY = v.y;
      P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
    }
    // Outboard of the head pivot, the atlas plane decides. `P` is in the game's
    // metres and the plane is the pivot's own origin, so the comparison is
    // against zero in either unit.
    if (!inHead && topY < ATLAS_Y) return;
    fn(o, P, topY);
  });
}

/**
 * Every piece worn on the head, in the head pivot's own frame, in millimetres
 * of the game's own metres.
 *
 * A "piece" is one connected component of the merged index graph — see the head
 * of this file. Returned in build order, which is `Part.merge`'s slot order and
 * then the order of the `p.add` calls inside each slot: deterministic, and the
 * same list twice for the same arguments. The walk is over `root` now rather
 * than over the pivot, and `characters.ts` adds the head pivot to `root` before
 * it emits the neck, so the head's own pieces keep the order they always had and
 * the neck lands after them.
 */
function headPieces(cls, helm, g = defaultGetup(cls), seed = SEED) {
  const root = buildCharacter(cls, { ...apOf(cls, g), helm }, 0x8a6b3f, undefined, LOD, seed).group;
  root.updateMatrixWorld(true);
  let pivot = null;
  root.traverse((o) => { if (!pivot && o.name === `${RIG}headPivot`) pivot = o; });
  if (!pivot) { console.error(`[clash] ${cls}/${helm}: no ${RIG}headPivot in the rig`); process.exit(2); }
  const pieces = [];
  headScope(root, pivot, (o, P) => {
    const hex = hexOf(o);
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    // Union-find over the triangles' own vertex indices. No welding, no
    // tolerance: two `p.add` calls never share an index, so this splits the
    // buffer back into the geometries that were concatenated into it.
    const par = new Int32Array(pos.count);
    for (let i = 0; i < pos.count; i++) par[i] = i;
    const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
    const tri = [];
    for (let i = 0; i + 2 < n; i += 3) {
      const a = idx ? idx.array[i] : i, b = idx ? idx.array[i + 1] : i + 1, c = idx ? idx.array[i + 2] : i + 2;
      uni(a, b); uni(b, c);
      tri.push(a, b, c);
    }
    const groups = new Map();
    for (let i = 0; i < tri.length; i += 3) {
      const r = find(tri[i]);
      let g = groups.get(r);
      if (!g) { g = []; groups.set(r, g); }
      g.push(tri[i], tri[i + 1], tri[i + 2]);
    }
    for (const [, ts] of groups) {
      const T = new Float64Array(ts.length * 3);
      for (let i = 0; i < ts.length; i++) {
        T[i * 3] = P[ts[i] * 3]; T[i * 3 + 1] = P[ts[i] * 3 + 1]; T[i * 3 + 2] = P[ts[i] * 3 + 2];
      }
      pieces.push({ hex, T, tris: ts.length / 3, ...extent(T) });
    }
  });
  return pieces;
}

/** Centroid, bounding box and mean azimuth of a triangle soup. */
function extent(T) {
  let cx = 0, cy = 0, cz = 0, n = 0;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < T.length; i += 3) {
    cx += T[i]; cy += T[i + 1]; cz += T[i + 2]; n++;
    if (T[i] < x0) x0 = T[i]; if (T[i] > x1) x1 = T[i];
    if (T[i + 1] < y0) y0 = T[i + 1]; if (T[i + 1] > y1) y1 = T[i + 1];
    if (T[i + 2] < z0) z0 = T[i + 2]; if (T[i + 2] > z1) z1 = T[i + 2];
  }
  return { cx: cx / n, cy: cy / n, cz: cz / n, x0, x1, y0, y1, z0, z1 };
}

/**
 * Which tints are skin, hair, beard, eye or paint on this class — measured off
 * a bare head rather than listed here, so a new complexion or a new hair colour
 * cannot silently become "kit" and blind a section.
 */
const bareCache = new Map();
/** The same rung with no helm on it, built once and kept — see `bareTints`. */
function barePieces(cls, g = defaultGetup(cls)) {
  const k = `${cls}/${g.name}/${SEED}`;
  let p = bareCache.get(k);
  if (!p) { p = headPieces(cls, "none", g); bareCache.set(k, p); }
  return p;
}
/**
 * THE BARE REFERENCE IS THE CLASS'S DEFAULT RUNG, ON EVERY RUNG, and that is a
 * choice with a measured reason. Braided War-locks bring 320 triangles of BRASS
 * with them — the rings the plait is bound in — and brass is `bfa25c`, which is
 * also the Wyrm-Crest's gilt and the Jarl's circlet. Take the bare reference
 * from the braided rung and every one of those tints becomes "the man", so the
 * Wyrm's crest is filed as flesh and sections 2 and 4 lose it. Taking it from
 * the default rung files the braid's own rings as kit instead, which is what
 * they are made of, and leaves the helmets where they belong.
 */
function bareTints(cls) {
  return new Set(barePieces(cls).map((p) => p.hex));
}

/** The mail tint this class's kit is issued in, read from the game's own kit. */
function mailTint(cls) {
  return finishKit(defaultAppearance(cls).armorColor).mail.toString(16).padStart(6, "0");
}

const hex6 = (n) => n.toString(16).padStart(6, "0");

/**
 * Split a head into pelt (skin, hair, beard, eye), mail and plate — and, inside
 * the pelt, THE BEARD ON ITS OWN. See `HAIR_TINT`: hair and beard used to share
 * the catalogue's one Oak Brown and were therefore one list, which is what let a
 * deleted beard hide inside a hair denominator.
 */
/**
 * ONE HEAD PER (CLASS, HELM, RUNG), BUILT ONCE. Five sections ask for the same
 * head, and before the sweep that was five builds of 36 heads; with the sweep it
 * would have been five builds of 288. The cache is cleared at the head of every
 * `battery()` so that `--twice` still proves what it says it proves — two full
 * runs, builds included, byte for byte — rather than proving that a Map returns
 * what was put in it.
 */
const pieceCache = new Map();
function sortPieces(cls, helm, g = defaultGetup(cls)) {
  const key = `${cls}|${helm}|${g.name}|${SEED}`;
  const hit = pieceCache.get(key);
  if (hit) return hit;
  const bare = bareTints(cls);
  const mailHex = mailTint(cls);
  const hairHex = hex6(HAIR_TINT);
  const beardHex = hex6(BEARD_TINT);
  const all = headPieces(cls, helm, g);
  const pelt = [], mail = [], plate = [], flesh = [], fur = [], hair = [], beard = [];
  for (const p of all) {
    if (bare.has(p.hex)) {
      pelt.push(p);
      if (p.hex === beardHex) { fur.push(p); beard.push(p); }
      else if (p.hex === hairHex) { fur.push(p); hair.push(p); }
      else flesh.push(p);
    } else if (p.hex === mailHex) mail.push(p);
    else plate.push(p);
  }
  const out = { all, pelt, flesh, fur, hair, beard, mail, plate, kit: [...mail, ...plate] };
  pieceCache.set(key, out);
  return out;
}

/**
 * What this head's KIT is, to the vertex — the accelerator behind sections 1
 * and 4 only measuring the kits that differ.
 *
 * Sections 1 and 4 read kit against kit: a plate against the mail it is driven
 * through, a fitting against the cap it sits on. A hair or beard rung that
 * builds an identical kit therefore has an identical answer, and measuring it
 * eight times prints the same row eight times. This is a checksum and not an
 * assumption: the rungs are grouped by what they actually build, so if a rung
 * ever does move a helmet the group splits and both are measured. It splits
 * today — Braided War-locks bring 320 triangles of brass rings, which sort as
 * kit, so every helm has two distinct kits across the eight rungs and not one.
 */
function kitSignature(kit) {
  let tris = 0, s = 0;
  for (const p of kit) {
    tris += p.tris;
    for (let i = 0; i < p.T.length; i += 3) s += p.T[i] + 2 * p.T[i + 1] + 3 * p.T[i + 2];
  }
  return `${kit.length}/${tris}/${s.toFixed(9)}`;
}

/** The rungs of this (class, helm) grouped by the kit they build. */
function kitGroups(cls, helm) {
  const groups = new Map();
  for (const g of getupsOf(cls)) {
    const sig = kitSignature(sortPieces(cls, helm, g).kit);
    const e = groups.get(sig);
    if (e) e.also.push(g.name);
    else groups.set(sig, { g, also: [] });
  }
  return [...groups.values()];
}
/** How a row names the rung it measured, and how many rungs share the reading. */
const rungLabel = (g, also) => (also?.length ? `${g.name} +${also.length}` : g.name);

/** One flat triangle array out of a list of pieces. */
function soup(list) {
  const T = new Float64Array(list.reduce((a, s) => a + s.T.length, 0));
  let o = 0;
  for (const s of list) { T.set(s.T, o); o += s.T.length; }
  return T;
}

/** Triangles that straddle a height, so a horizontal sweep is not O(whole head). */
function slabAt(T, y) {
  const out = [];
  for (let i = 0; i < T.length; i += 9) {
    const lo = Math.min(T[i + 1], T[i + 4], T[i + 7]);
    const hi = Math.max(T[i + 1], T[i + 4], T[i + 7]);
    if (lo <= y && hi >= y) for (let k = 0; k < 9; k++) out.push(T[i + k]);
  }
  return new Float64Array(out);
}

/**
 * Two indexes, and they are an accelerator and nothing else — every hit they
 * return is a hit the flat sweep returns.
 *
 * A HORIZONTAL ray holds its height, so only triangles straddling that height
 * can be crossed: `heightIndex` files each triangle into every 2 mm band its
 * own y-span touches. A VERTICAL ray holds its (x, z), so only triangles whose
 * footprint covers that column can be crossed: `columnIndex` files each triangle
 * into every 4 mm cell of a plan grid its footprint touches.
 *
 * Without them the battery is minutes of ray-triangle arithmetic against every
 * triangle on the head for every sample, and a harness people will not run is a
 * harness that stops being run.
 */
function heightIndex(T, bin = 0.002) {
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 1; i < T.length; i += 3) { if (T[i] < y0) y0 = T[i]; if (T[i] > y1) y1 = T[i]; }
  if (!T.length) return { y0: 0, bin, n: 0, cells: [] };
  const n = Math.max(1, Math.ceil((y1 - y0) / bin) + 1);
  const acc = Array.from({ length: n }, () => []);
  for (let i = 0; i < T.length; i += 9) {
    const lo = Math.min(T[i + 1], T[i + 4], T[i + 7]), hi = Math.max(T[i + 1], T[i + 4], T[i + 7]);
    const a = Math.max(0, Math.floor((lo - y0) / bin)), b = Math.min(n - 1, Math.floor((hi - y0) / bin));
    for (let k = a; k <= b; k++) for (let q = 0; q < 9; q++) acc[k].push(T[i + q]);
  }
  return { y0, bin, n, cells: acc.map((l) => new Float64Array(l)) };
}
function hitFlat(ix, x, y, z, dx, dz, cap) {
  if (!ix.n) return -1;
  const k = Math.floor((y - ix.y0) / ix.bin);
  if (k < 0 || k >= ix.n) return -1;
  return rayHit(ix.cells[k], x, y, z, dx, 0, dz, cap);
}
function columnIndex(T, bin = 0.004) {
  if (!T.length) return { n: 0 };
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < T.length; i += 3) {
    if (T[i] < x0) x0 = T[i]; if (T[i] > x1) x1 = T[i];
    if (T[i + 2] < z0) z0 = T[i + 2]; if (T[i + 2] > z1) z1 = T[i + 2];
  }
  const nx = Math.max(1, Math.ceil((x1 - x0) / bin) + 1);
  const nz = Math.max(1, Math.ceil((z1 - z0) / bin) + 1);
  const acc = Array.from({ length: nx * nz }, () => []);
  for (let i = 0; i < T.length; i += 9) {
    const ax = Math.max(0, Math.floor((Math.min(T[i], T[i + 3], T[i + 6]) - x0) / bin));
    const bx = Math.min(nx - 1, Math.floor((Math.max(T[i], T[i + 3], T[i + 6]) - x0) / bin));
    const az = Math.max(0, Math.floor((Math.min(T[i + 2], T[i + 5], T[i + 8]) - z0) / bin));
    const bz = Math.min(nz - 1, Math.floor((Math.max(T[i + 2], T[i + 5], T[i + 8]) - z0) / bin));
    for (let a = ax; a <= bx; a++) for (let b = az; b <= bz; b++) {
      const cell = acc[b * nx + a];
      for (let q = 0; q < 9; q++) cell.push(T[i + q]);
    }
  }
  return { x0, z0, bin, nx, nz, n: nx * nz, cells: acc.map((l) => new Float64Array(l)) };
}
function hitDown(ix, x, y, z, cap) {
  if (!ix.n) return -1;
  const a = Math.floor((x - ix.x0) / ix.bin), b = Math.floor((z - ix.z0) / ix.bin);
  if (a < 0 || a >= ix.nx || b < 0 || b >= ix.nz) return -1;
  return rayHit(ix.cells[b * ix.nx + a], x, y, z, 0, -1, 0, cap);
}

/** Shortest distance from a point to a triangle soup. */
function nearestDist(T, px, py, pz) {
  let best = Infinity;
  for (let i = 0; i < T.length; i += 9) {
    const ax = T[i], ay = T[i + 1], az = T[i + 2];
    const abx = T[i + 3] - ax, aby = T[i + 4] - ay, abz = T[i + 5] - az;
    const acx = T[i + 6] - ax, acy = T[i + 7] - ay, acz = T[i + 8] - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const d1 = abx * apx + aby * apy + abz * apz;
    const d2 = acx * apx + acy * apy + acz * apz;
    let qx, qy, qz;
    if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
    else {
      const bpx = px - T[i + 3], bpy = py - T[i + 4], bpz = pz - T[i + 5];
      const d3 = abx * bpx + aby * bpy + abz * bpz;
      const d4 = acx * bpx + acy * bpy + acz * bpz;
      const cpx = px - T[i + 6], cpy = py - T[i + 7], cpz = pz - T[i + 8];
      const d5 = abx * cpx + aby * cpy + abz * cpz;
      const d6 = acx * cpx + acy * cpy + acz * cpz;
      const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
      if (d3 >= 0 && d4 <= d3) { qx = T[i + 3]; qy = T[i + 4]; qz = T[i + 5]; }
      else if (d6 >= 0 && d5 <= d6) { qx = T[i + 6]; qy = T[i + 7]; qz = T[i + 8]; }
      else if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const t = d1 / (d1 - d3);
        qx = ax + abx * t; qy = ay + aby * t; qz = az + abz * t;
      } else if (vb <= 0 && d2 >= 0 && d6 <= 0) {
        const t = d2 / (d2 - d6);
        qx = ax + acx * t; qy = ay + acy * t; qz = az + acz * t;
      } else if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
        const t = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        qx = T[i + 3] + (T[i + 6] - T[i + 3]) * t;
        qy = T[i + 4] + (T[i + 7] - T[i + 4]) * t;
        qz = T[i + 5] + (T[i + 8] - T[i + 5]) * t;
      } else {
        const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
        qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w;
      }
    }
    const d = (px - qx) * (px - qx) + (py - qy) * (py - qy) + (pz - qz) * (pz - qz);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** Möller-Trumbore. Nearest forward hit, or -1 past `cap`. */
function rayHit(T, ox, oy, oz, dx, dy, dz, cap) {
  let best = cap;
  for (let i = 0; i < T.length; i += 9) {
    const ax = T[i], ay = T[i + 1], az = T[i + 2];
    const e1x = T[i + 3] - ax, e1y = T[i + 4] - ay, e1z = T[i + 5] - az;
    const e2x = T[i + 6] - ax, e2y = T[i + 7] - ay, e2z = T[i + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-12 && det < 1e-12) continue;
    const inv = 1 / det;
    const tx = ox - ax, ty = oy - ay, tz = oz - az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > 1e-6 && t < best) best = t;
  }
  return best < cap ? best : -1;
}

/**
 * The sample grid inside one triangle, in barycentric coordinates.
 *
 * N = 4 is where the readings stop moving: raised to 8 the deepest reading in
 * section 1 moves 0.0 mm on the Jarl's Crowned and 0.6 on the Wyrm, at three
 * times the run. Centroids alone under-read by 1 to 3 mm, because the deepest
 * point of a plate under mail is at a corner of a row and not in the middle
 * of it.
 */
const BARY = [];
{
  const N = 4;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N - i; j++) BARY.push([i / N, j / N, (N - i - j) / N]);
}
function samples(T, i, out) {
  let k = 0;
  for (const [a, b, c] of BARY) {
    out[k++] = T[i] * a + T[i + 3] * b + T[i + 6] * c;
    out[k++] = T[i + 1] * a + T[i + 4] * b + T[i + 7] * c;
    out[k++] = T[i + 2] * a + T[i + 5] * b + T[i + 8] * c;
  }
  return k / 3;
}

const mm = (m) => (m * 1000).toFixed(1);
const azOf = (x, z) => {
  const d = Math.atan2(x, z) * 180 / Math.PI;
  return d < 0 ? d + 360 : d;
};
const at = (p) => `[az ${azOf(p[0], p[2]).toFixed(0)}deg, y ${mm(p[1])} mm]`;

// ============================================================
// +Z IS THE FACE — asserted, not assumed
// ============================================================
//
// Every azimuth this file prints is meaningless if this is the other way round,
// and it has been got the other way round before. The Sutton Hoo is the one
// helmet with a face plate AND a coif, so the two means it produces are the
// cheapest possible statement of which way the man is looking.
function assertFaceIsPlusZ() {
  const { plate, mail } = sortPieces("huscarl", "suttonhoo");
  const meanZ = (list) => {
    let s = 0, n = 0;
    for (const p of list) for (let i = 2; i < p.T.length; i += 3) { s += p.T[i]; n++; }
    return n ? s / n : 0;
  };
  // The mask's own silver: the plate pieces in front of the ears.
  const face = plate.filter((p) => p.cz > 0.02);
  const fz = meanZ(face), cz = meanZ(mail);
  console.log(`[clash] frame check: mask metal at mean z ${mm(fz)} mm, mail at mean z ${mm(cz)} mm`);
  if (!(fz > 0 && cz < 0 && fz - cz > 0.05)) {
    console.error("[clash] +Z IS NOT THE FACE on this build. Every azimuth below would be a lie. Stopping.");
    process.exit(2);
  }
  console.log("[clash] +z is the face, -z is the nape. Azimuth 0 is dead ahead.");
}

// ============================================================
// THE TWO TINTS ARE LABELS — asserted, not assumed
// ============================================================
//
// `HAIR_TINT` and `BEARD_TINT` exist so that the beard can be measured against
// its own surface, and they are only sound if a colour is a colour. A builder
// that branched on a hair colour — a blond that grew a different lock, a snow
// white that dropped a course — would make every reading in sections 2, 3 and 5
// a reading of a head no player wears. So it is checked rather than believed,
// on the two heads that carry the most hair and the most beard.
function assertTintsAreLabels() {
  const count = (cls, ap) => {
    const root = buildCharacter(cls, ap, 0x8a6b3f, undefined, LOD, SEED).group;
    root.updateMatrixWorld(true);
    let pivot = null, tris = 0, meshes = 0;
    root.traverse((o) => { if (!pivot && o.name === `${RIG}headPivot`) pivot = o; });
    // The SAME scope the sections measure in — this check had its own
    // `pivot.traverse` and so certified a head the ruler no longer reads.
    headScope(root, pivot, (o) => {
      meshes++;
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
    return `${meshes} meshes / ${tris} tri`;
  };
  let bad = 0;
  const seen = [];
  for (const cls of ["berserker", "huscarl"]) {
    for (const helm of ["none", "suttonhoo"]) {
      const shop = count(cls, { ...defaultAppearance(cls), helm });
      const label = count(cls, { ...apOf(cls), helm });
      seen.push(`${cls}/${helm} ${label}`);
      if (shop !== label) { bad++; console.error(`[clash] ${cls}/${helm}: catalogue tints build ${shop}, label tints build ${label}`); }
    }
  }
  if (bad) {
    console.error("[clash] A HAIR OR BEARD COLOUR MOVES GEOMETRY on this build, so the two label");
    console.error("[clash] tints are measuring a head nobody wears. Stopping rather than printing it.");
    process.exit(2);
  }
  console.log(`[clash] tint check: hair and beard labels move no geometry — ${seen.join(", ")}.`);
}

// ============================================================
// 1. LAYERS — a plate driven through the mail
// ============================================================
//
// A helmet is worn OVER a mail coif. If a plate's surface has mail outboard of
// it, the plate has been driven inside the bag of rings it is supposed to sit
// on, and what draws is iron and mail fighting for the same pixels — the
// owner's "the Sutton Hoo helmet on huscarl currently clashes with the mesh".
//
// MEASURED. Sample every plate triangle; from each sample cast a horizontal ray
// straight out from the head's axis. If the ray leaves the plate's own shell
// (so this is the plate's OUTWARD face and not its lining) and then meets mail,
// the plate is buried, and how far it is buried is how far the ray ran before
// it found the rings.
//
// TWO NUMBERS PER PIECE, because they are two different faults. The DEPTH says
// how badly one point is wrong; the CLASH FRACTION says how much of the piece
// is under there. A nape fall 40% buried at 7 mm is a different repair from a
// crown hoop 11% buried at 14 mm — the first is the fall's radius, the second
// is one ring's height.
const LAYER_MM = 5.0;
/**
 * 5 mm, and it is the file's own number rather than one invented here.
 * `buildCharacter` declares `LAYER_GAP = 0.005` — "what one layer leaves clear
 * under the inner wall of the layer above it" — with the reason written beside
 * it: both surfaces are tessellated and a garment's chord dips up to 3 mm
 * inside the analytic curve, so a gap that only covers the mathematics is not a
 * gap. A plate more than that far the WRONG side of the mail is not a rounding
 * error.
 *
 * Nothing measured here is anywhere near the bar, and the paragraph this
 * replaces said so about a tree that no longer exists ("the eleven failures run
 * 10.7 to 14.5 mm"). Across the 19 distinct kits that have mail, 18 read 0.0,
 * 0.4, 0.8, 1.8, 2.0 or 4.2 mm and one reads 61.5 — huscarl / suttonhoo /
 * hair=braids, where an 80-triangle brass braid ring has 100.0% of its outward
 * face inboard of the rings. So the bar sits in a 57 mm gap, and the one reading
 * over it is a 100-gold cosmetic buried inside a 2400-gold coif.
 */
function sectionLayers(rows) {
  console.log("");
  console.log("[clash] 1. LAYERS — a plate driven through the mail.");
  console.log("[clash]    horizontal rays out of the head's axis; bar " + LAYER_MM.toFixed(1) + " mm (the build's own LAYER_GAP).");
  console.log("");
  console.log("[clash]    kit against kit, so the rungs are grouped by the kit they build — see `kitSignature`.");
  console.log("");
  console.log("[clash] class       helm         rung           mail?   depth mm   clash%   deepest piece            where");
  console.log("[clash] ------------------------------------------------------------------------------------------------------------");
  let fails = 0, cases = 0, absent = 0;
  for (const cls of CLASSES) {
    for (const helm of HELMS) {
     for (const { g, also } of kitGroups(cls, helm)) {
      const rung = rungLabel(g, also);
      const { mail, plate } = sortPieces(cls, helm, g);
      if (!mail.length) {
        // A GATE GREEN BECAUSE THE CASE IS ABSENT IS NOT A GATE. This head wears
        // no mail, so there is nothing for a plate to be driven through, and
        // this line is not a pass — it is a line saying the question does not
        // arise here.
        absent++;
        console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} ${rung.padEnd(14)} none    —          —        (no mail on this head — nothing to measure)`);
        continue;
      }
      cases++;
      const mailIx = heightIndex(soup(mail));
      let worst = 0, wp = null, wat = null;
      let bestFrac = 0, bf = null;
      const buf = new Float64Array(BARY.length * 3);
      for (const p of plate) {
        let n = 0, k = 0;
        const selfIx = heightIndex(p.T);
        for (let i = 0; i < p.T.length; i += 9) {
          const c = samples(p.T, i, buf);
          for (let s = 0; s < c; s++) {
            const x = buf[s * 3], y = buf[s * 3 + 1], z = buf[s * 3 + 2];
            const r = Math.hypot(x, z);
            if (r < 1e-6) continue;
            const dx = x / r, dz = z / r;
            const m = hitFlat(mailIx, x, y, z, dx, dz, 0.12);
            if (m < 0) { n++; continue; }
            // The plate's own shell in the way means this sample is on the
            // lining, not on the outward face; the outward face is measured
            // instead and counting both would double the denominator.
            const self = hitFlat(selfIx, x, y, z, dx, dz, 0.12);
            if (self >= 0 && self < m) continue;
            n++; k++;
            if (m > worst) { worst = m; wp = p; wat = [x, y, z]; }
          }
        }
        // Pieces smaller than a rivet have a meaningless fraction.
        if (n >= 40 && k / n > bestFrac) { bestFrac = k / n; bf = p; }
      }
      const bad = worst * 1000 > LAYER_MM;
      if (bad) fails++;
      const where = wat ? at(wat) : "";
      console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} ${rung.padEnd(14)} yes    ${mm(worst).padStart(7)}   ${(100 * bestFrac).toFixed(1).padStart(6)}   ${(wp ? `${wp.hex} (${wp.tris} tri)` : "-").padEnd(22)} ${where}${bad ? "  FAIL" : ""}`);
      rows.push({ section: 1, cls, helm, rung: g.name, fail: bad, depth: worst, frac: bestFrac });
      if (bad && bf) {
        console.log(`[clash]             ^ worst-buried piece ${bf.hex} (${bf.tris} tri), ${(100 * bestFrac).toFixed(1)}% of its outward face is inboard of the rings`);
      }
     }
    }
  }
  console.log("");
  console.log(`[clash]    ${fails} of ${cases} distinct kits that HAVE mail are red; ${absent} more have no mail and are not a case.`);
  return fails;
}

// ============================================================
// The outboard test — shared by sections 2 and 5
// ============================================================
//
// One question asked twice: is this piece of the man on the WRONG SIDE of his
// own armour? A point on the skin or on a beard is outboard of the kit when a
// horizontal ray fired INWARD, at the head's own axis, leaves its own mesh and
// then meets metal, mail or cloth. That puts a garment between this point and
// the skull, which is the definition of being outside a thing you are supposed
// to be inside.
//
// It is the same ray section 1 uses, pointed the other way, and it is right for
// the same reason: the coif, the ventail and the fall are rings about that
// axis. A hem is not caught by it and must not be — hair coming out from UNDER
// a cheek guard has no metal inboard of it at its own height, which is exactly
// the route `cheekHem` and the coif's hem were built to give it.
//
// AREA-WEIGHTED, NOT SAMPLE-COUNTED. A triangle's share of the answer is its
// share of the surface. Counting samples instead lets a densely tessellated
// eyelid outvote a whole cheek, and the ear is a small patch of dense mesh: on
// the huscarl the two readings differ by a full point (6.37% counted, 5.39% by
// area) and the one that means anything is the area.
function outboardShare(subject, kitT) {
  const kitIx = heightIndex(kitT);
  const buf = new Float64Array(BARY.length * 3);
  let out = 0, all = 0, worst = 0, wp = null, wat = null, wdepth = 0;
  for (const p of subject) {
    let pOut = 0, pAll = 0;
    for (let i = 0; i < p.T.length; i += 9) {
      const ux = p.T[i + 3] - p.T[i], uy = p.T[i + 4] - p.T[i + 1], uz = p.T[i + 5] - p.T[i + 2];
      const vx = p.T[i + 6] - p.T[i], vy = p.T[i + 7] - p.T[i + 1], vz = p.T[i + 8] - p.T[i + 2];
      const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      const c = samples(p.T, i, buf);
      let hit = 0, tot = 0;
      for (let s = 0; s < c; s++) {
        const x = buf[s * 3], y = buf[s * 3 + 1], z = buf[s * 3 + 2];
        const r = Math.hypot(x, z);
        if (r < 1e-6) continue;
        tot++;
        const dx = -x / r, dz = -z / r;
        // THE RAY STOPS AT THE AXIS, and the first cut of this did not — it ran
        // 200 mm, crossed the whole head and found the coif on the FAR side, so
        // every hair on the huscarl read as hair through mail and the section
        // failed 21 of 36 combinations for nothing. Inboard means between this
        // point and the head's own centre line, so `r` is the whole ray.
        const g = hitFlat(kitIx, x, y, z, dx, dz, r);
        if (g < 0) continue;
        const self = rayHit(p.T, x, y, z, dx, 0, dz, r);
        if (self >= 0 && self < g) continue;
        hit++;
        if (g > wdepth) { wdepth = g; wat = [x, y, z]; }
      }
      if (!tot) continue;
      all += area; pAll += area;
      out += area * hit / tot; pOut += area * hit / tot;
    }
    if (pAll > 0 && pOut / pAll > worst) { worst = pOut / pAll; wp = p; }
  }
  return { share: all ? out / all : 0, worst, wp, wat, depth: wdepth, area: all };
}

// ============================================================
// 2. FLESH — skin on the outside of a helm that is a face plate
// ============================================================
//
// "On the remaining classes (warden etc.) the ears stick out."
//
// A mask is the only helm in the shop that undertakes to cover the whole head
// in front of the ears, so it is the only one where the correct amount of skin
// outboard of the metal is ZERO. What this measures is that: the share of the
// head's own skin AREA that lies outside the kit rather than inside it.
//
// AND IT IS A RADIAL TEST, NOT A PICTURE, and the first cut of this section got
// that wrong in a way worth recording. Rasterised from 36 bearings and asked
// "is this skin pixel outside the helmet's outline", it answered 0.01% on the
// huscarl and put every escaping pixel at az 150-180 below the jaw — it had
// found the bare nape, which is section 3's fault, and it could not see the ear
// at all, because an ear standing through a cheek guard is still INSIDE the
// helmet's silhouette from every bearing. A silhouette cannot see a surface
// come through another surface. The radial test puts the worst bins at az 90 to
// 120 at y 150 mm, which is the ear and behind it, on all four classes.
//
// The mechanism is the one `docs/OPEN-DEFECTS.md` records and it is not the
// hairline exemption: `helmForm` is a 12 mm low-pass with nothing under a 45 mm
// radius, so THE BLOCK A PLATE IS BEATEN OVER HAS NO EAR ON IT. The plate is
// drawn correctly on a head that has had its ears filed off.
//
// ------------------------------------------------------------
// WHICH HELMS ARE A CASE IS READ OFF THE MESH, NOT OFF A BOOLEAN
// ------------------------------------------------------------
//
// This section used to open with `if (!HELM[helm].mask) { absent++; continue; }`
// — a property of the catalogue, not of the head that gets drawn. A gate whose
// case list is a declaration is a gate anybody can switch off by editing one
// word, and round five's adversary switched it off: with the ruler's own case
// test forced false and NOT ONE VERTEX MOVED, the section went from "4 of 4
// masked combinations are red" to "0 of 0" and the battery printed ALL SECTIONS
// PASS.
//
// So the case is now measured. A helm is a face plate when the KIT COVERS THE
// FACE: of the head's own skin within 45 degrees of dead ahead, what share has
// kit outboard of it, weighted by area. Measured on this tree, every class,
// every helm, every hair and beard rung — 288 heads, and the range below is the
// section's own footer:
//
//     Sutton Hoo                          81.2 - 88.8 %
//     Shadow Hood                         43.3 - 44.4
//     Wyrm-Crest                          41.7 - 43.7
//     Spectacle / Boar / Jarl's Crowned   35.4 - 37.4
//     Nasal / Ridge                       20.4 - 21.2
//     Iron Spangenhelm                    17.5 - 18.9
//
// The bar is 65%, in a 37-point gap with 16 points of margin on the near side
// and 20 on the far. Nothing in the shop is near it, which is what a case test
// should look like — the same shape of argument `CREST_MM` makes.
//
// AND THE CATALOGUE IS CHECKED AGAINST THE MESH RATHER THAN OBEYED. `HELM[].mask`
// is still read, but only to be disagreed with: a helm the shop declares a mask
// and the builder does not draw as one is a FAIL in its own right — that is a
// player paying 2400 gold for a face and getting an open helm — and a helm built
// as a face plate without the declaration is measured anyway, with a note.
//
// One hole is left open and named rather than papered over. Flipping
// `mask: true -> false` at `characters.ts:925` is not the declaration-only edit
// it looks like: `style.mask` also gates the whole Sutton Hoo mask block, and
// the flip was measured here to take the berserker's head from 23838 to 13312
// triangles. After it, no helm in the shop covers a face, both the mesh and the
// declaration agree about that, and this section has nothing to disagree with.
// What catches it is the last rule below: a section that finds NO case at all is
// red, because a gate green because the case is absent is not a gate.
const FLESH_PCT = 1.0;
/**
 * 1.0% of the skin's area, and it is a tessellation allowance rather than a
 * tolerance. Zero is the only defensible answer for a face plate, and nothing
 * on this tree is anywhere near the bar: the 32 face-plate rows — the Sutton
 * Hoo on four classes across eight hair and beard rungs — measure 2.10, 2.43,
 * 2.97, 3.75 and 3.84, so no verdict here turns on where exactly the bar sits.
 */
const FACE_PCT = 65.0;
const FACE_AZ = 45;
/**
 * How much of the face this helm actually covers, off the built mesh: the share
 * of the head's own skin AREA within `FACE_AZ` degrees of dead ahead that has
 * kit outboard of it. Outward rays, the same horizontal ray every other section
 * uses, pointed the way section 1 points it.
 */
function faceCover(flesh, kitT) {
  const kitIx = heightIndex(kitT);
  const buf = new Float64Array(BARY.length * 3);
  let cov = 0, all = 0;
  for (const p of flesh) {
    for (let i = 0; i < p.T.length; i += 9) {
      const ux = p.T[i + 3] - p.T[i], uy = p.T[i + 4] - p.T[i + 1], uz = p.T[i + 5] - p.T[i + 2];
      const vx = p.T[i + 6] - p.T[i], vy = p.T[i + 7] - p.T[i + 1], vz = p.T[i + 8] - p.T[i + 2];
      const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      const c = samples(p.T, i, buf);
      let hit = 0, tot = 0;
      for (let s = 0; s < c; s++) {
        const x = buf[s * 3], y = buf[s * 3 + 1], z = buf[s * 3 + 2];
        const r = Math.hypot(x, z);
        if (r < 1e-6) continue;
        let a = azOf(x, z);
        if (a > 180) a -= 360;
        if (Math.abs(a) > FACE_AZ) continue;
        tot++;
        if (hitFlat(kitIx, x, y, z, x / r, z / r, 0.30) >= 0) hit++;
      }
      if (!tot) continue;
      all += area; cov += area * hit / tot;
    }
  }
  return all ? 100 * cov / all : 0;
}
function sectionFlesh(rows) {
  console.log("");
  console.log("[clash] 2. FLESH — skin outboard of a helm that is a face plate.");
  console.log(`[clash]    inward horizontal rays off every skin triangle, area-weighted; bar ${FLESH_PCT.toFixed(1)}% of the skin.`);
  console.log(`[clash]    a case is a helm whose MESH covers the face: ${FACE_PCT.toFixed(1)}%+ of the skin within ${FACE_AZ} deg of dead ahead has kit outboard.`);
  console.log("");
  console.log("[clash] class       helm         rung           face cov%  skin out%   worst patch                deepest       where");
  console.log("[clash] ---------------------------------------------------------------------------------------------------------------------");
  let fails = 0, cases = 0, absent = 0;
  let openLo = Infinity, openHi = -Infinity;
  for (const cls of CLASSES) {
    for (const helm of HELMS) {
     for (const g of getupsOf(cls)) {
      const rung = g.name;
      const { flesh, kit } = sortPieces(cls, helm, g);
      const KT = soup(kit);
      const cover = faceCover(flesh, KT);
      const isPlate = cover >= FACE_PCT;
      const declared = !!HELM[helm].mask;
      if (!isPlate) {
        if (declared) {
          // DECLARED A FACE MASK, BUILT AS AN OPEN HELM. The shop is selling a
          // face and the builder is not drawing one. This is the disagreement
          // the old case test could not have — it took the declaration's word.
          fails++;
          console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} ${rung.padEnd(14)} ${cover.toFixed(1).padStart(8)}          —   DECLARED A FACE MASK, BUILT AS AN OPEN HELM — the catalogue says mask, the mesh covers ${cover.toFixed(1)}% of the face  FAIL`);
          rows.push({ section: 2, cls, helm, rung, fail: true, cover });
          continue;
        }
        absent++;
        if (cover < openLo) openLo = cover;
        if (cover > openHi) openHi = cover;
        continue;
      }
      cases++;
      const r = outboardShare(flesh, KT);
      const pct = 100 * r.share;
      const bad = pct > FLESH_PCT;
      if (bad) fails++;
      const patch = r.wp ? `${r.wp.hex} (${r.wp.tris} tri) ${(100 * r.worst).toFixed(1)}%` : "-";
      const note = declared ? "" : "  (built as a face plate, not declared one)";
      console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} ${rung.padEnd(14)} ${cover.toFixed(1).padStart(8)}   ${pct.toFixed(2).padStart(8)}   ${patch.padEnd(24)} ${mm(r.depth).padStart(7)} mm  ${r.wat ? at(r.wat) : ""}${note}${bad ? "  FAIL" : ""}`);
      rows.push({ section: 2, cls, helm, rung, fail: bad, pct, cover });
     }
    }
  }
  console.log("");
  if (!cases) {
    // NO HELM IN THE SHOP COVERS A FACE. Not a pass: this section measured
    // nothing, and a section that measured nothing cannot be green. It is also
    // the only thing standing between this gate and a one-word edit that takes
    // the Sutton Hoo's mask out of the build entirely — see the note over
    // `FLESH_PCT` about `characters.ts:925`.
    fails++;
    console.log("[clash]    NO COMBINATION IN THE SHOP BUILDS A FACE PLATE — this section measured nothing,");
    console.log("[clash]    which is not a pass. The shop sold a face mask the last time anyone looked.  FAIL");
  } else {
    console.log(`[clash]    ${fails} of ${cases} combinations whose mesh covers the face are red; ${absent} do not cover a face (${openLo.toFixed(1)} - ${openHi.toFixed(1)}%) and are not a case.`);
  }
  return fails;
}
// ============================================================
// 3. WRAP — a bare nape under a covered throat
// ============================================================
//
// "There's a full neck mesh on the front with a clear back? That's really
// sloppy." A neck defence that wraps the throat and stops at the ears is not a
// neck defence, it is a bib — and from behind the man is bare.
//
// MEASURED on horizontal slices, one every millimetre from y 10 to y 175 in the
// head pivot's frame — the whole neck and the whole head, because nothing here
// is allowed to declare in advance where the neck stops. At each height the
// sweep asks, for every half-degree of azimuth, what the outermost surface is:
// kit, or skin and hair.
//
// A height is a case only if the THROAT IS GENUINELY WRAPPED — at least
// `THROAT_DEG` of continuous cover through dead ahead. That is the filter that
// turns this from a head-wide sweep into a neck measurement, and it is not
// decoration: without it, a nasal bar counts as covering the throat and the
// section fails every open helm in the shop for having a nose (measured, before
// the filter went in: the Nasal read a 352.5 degree bare arc at the height of
// the nose on three classes).
//
// The fault is then the widest continuous BARE arc, and it is reported with the
// radius the flesh sits at across that arc, because degrees alone do not say
// how much neck is showing: 150 degrees on a 30 mm throat and on a 90 mm one
// are different amounts of sloppiness.
//
// A WRAPPED THROAT WITH A COVERED NAPE IS A PASS AND IS PRINTED AS ONE. The
// last column is how many heights of this head were a case, which is what makes
// a pass readable: "137 wrapped heights, 0.0 degrees bare at all of them" is a
// nape that is finished, and it is a different statement from a head that never
// wraps a throat and appears nowhere in the table.
/**
 * 2.0 DEGREES, AND THE BAR IT REPLACES WAS 90 — which is why round five's gate
 * printed "0 of 3 combinations with a wrapped throat are red" on the same table
 * that printed 69.5, 63.5 and 76.5 degrees of bare arc. An adversary then built
 * the app, shot the render and found bare skin from the Sutton Hoo's rim to the
 * hauberk collar on those exact three classes: a 4-5 px flesh stripe at play
 * scale, sampled at (148,88,55), (150,94,60), (144,76,40) — complexion, not mail.
 *
 * 90 DEGREES WAS NEVER A DESCRIPTION OF THE DEFECT. The owner's words are "there's
 * a full neck mesh on the front with a clear back? That's really sloppy", and a
 * quarter-turn of naked nape is not the thing that sentence complains about — it
 * is a number that let a partial fix pass. A nape under a wrapped throat is bare
 * or it is not; the only question a bar has to answer here is how much bare arc
 * is TESSELLATION rather than nape.
 *
 * MEASURED, on this tree, at every wrapped height of every combination:
 *
 *   huscarl / suttonhoo    137 wrapped heights, bare arc 0.0 deg at ALL 137
 *   berserker / hood         1 wrapped height,  bare arc 0.0 deg
 *   warden / suttonhoo     137 wrapped heights, 98 at 0.0, then 0.5 x14,
 *                          1.5, 4.5, 7.5 ... 25.5, then 44.5 ... 69.5
 *   berserker / suttonhoo  147 wrapped heights, 105 at 0.0, then 0.5 x19,
 *                          2.5 ... 24.5, then 44.5 ... 63.5
 *   runekeeper / suttonhoo 131 wrapped heights,  95 at 0.0, then 0.5 x14,
 *                          16.5 ... 23.5, then 42.5 ... 76.5
 *
 * So a nape that IS covered reads exactly zero — 137 heights of it, on the one
 * combination in the shop whose coif closes all the way round. There is no
 * tessellation floor to allow for at all, and the bar could defensibly be 0.5.
 *
 * It is 2.0 because the head of this file records the one artefact that can put
 * a sliver of skin outside a garment that encloses it: a tessellated ring's
 * chords dip up to 1.19 mm inside the analytic curve they were sampled from. At
 * the 78-88 mm radii this section reports, 1.19 mm of chord dip subtends 0.82
 * degrees, so a seam where two such dips meet can show 1.6 degrees of skin that
 * is not a bare nape. 2.0 covers that and stops.
 *
 * The gap this bar sits in is therefore 2.0 to 42.5 — twenty times wider, in
 * ratio, than the gap section 4's bar sits in — and the reading it has to catch
 * is thirty times over it. Nothing here turns on the exact figure; what turned
 * on the exact figure was 90.
 */
const WRAP_DEG = 2.0;
const THROAT_DEG = 100;
const WRAP_STEP = 0.5;
function sectionWrap(rows) {
  console.log("");
  console.log("[clash] 3. WRAP — a bare nape under a covered throat.");
  console.log(`[clash]    ${WRAP_STEP} deg sweeps at every mm of height; a case needs ${THROAT_DEG} deg of throat wrapped, a fault MORE THAN ${WRAP_DEG.toFixed(1)} deg bare behind.`);
  console.log("");
  console.log("[clash] class       helm         rung           bare arc     at radius   height   centred      throat cover   wrapped hts");
  console.log("[clash] ---------------------------------------------------------------------------------------------------------------------");
  let fails = 0, cases = 0, quiet = 0;
  const M = Math.round(360 / WRAP_STEP);
  for (const cls of CLASSES) {
    for (const helm of HELMS) {
     for (const g of getupsOf(cls)) {
      const rung = g.name;
      const { pelt, kit } = sortPieces(cls, helm, g);
      const PT = soup(pelt), KT = soup(kit);
      // `best` is the widest BARE arc; `wrapped` counts the heights that are a
      // case at all, and the two are separate because a head can be the second
      // without ever being the first — see the note over `!wrapped` below.
      let best = null, wrapped = 0, widest = null;
      for (let ymm = 10; ymm <= 175; ymm++) {
        const y = ymm / 1000;
        const P = slabAt(PT, y), K = slabAt(KT, y);
        if (!P.length) continue;
        const flags = new Int8Array(M);
        const rad = new Float64Array(M);
        for (let i = 0; i < M; i++) {
          const t = i * WRAP_STEP * Math.PI / 180;
          const dx = Math.sin(t), dz = Math.cos(t);
          const f = rayHit(P, 0, y, 0, dx, 0, dz, 0.40);
          const g = rayHit(K, 0, y, 0, dx, 0, dz, 0.40);
          flags[i] = (f < 0 && g < 0) ? 0 : (g > f ? 1 : -1);
          rad[i] = f;
        }
        // How much of the front is actually wrapped: the covered run through
        // dead ahead, not the total covered anywhere.
        if (flags[0] !== 1) continue;
        let fwd = 1;
        for (let k = 1; k < M && flags[k] === 1; k++) fwd++;
        for (let k = 1; k < M && flags[(M - k) % M] === 1; k++) fwd++;
        // A RING THAT IS COVERED ALL THE WAY ROUND IS 360 DEGREES, NOT 720. The
        // two runs above walk out of dead ahead in both directions and both stop
        // at the far side when nothing stops them sooner, so a fully covered
        // height counted 2M-1 of M samples. It never showed while the section
        // printed only heights with a bare arc — a height with no bare arc is
        // exactly the height where both runs go all the way round — and the
        // first fully covered head to reach the table printed "719.5 deg".
        fwd = Math.min(fwd, M);
        if (fwd * WRAP_STEP < THROAT_DEG) continue;
        wrapped++;
        if (!widest || fwd > widest.fwd) widest = { ymm, fwd };
        let w = 0, wat = 0;
        for (let s = 0; s < M; s++) {
          if (flags[s] !== -1) continue;
          let n = 0;
          while (n < M && flags[(s + n) % M] === -1) n++;
          if (n > w) { w = n; wat = s; }
        }
        if (!w) continue;
        let rs = 0, rn = 0;
        for (let k = 0; k < w; k++) { const r = rad[(wat + k) % M]; if (r > 0) { rs += r; rn++; } }
        const rec = { ymm, deg: w * WRAP_STEP, az: ((wat + w / 2) % M) * WRAP_STEP, r: rn ? rs / rn : 0, fwd: fwd * WRAP_STEP };
        if (!best || rec.deg > best.deg) best = rec;
      }
      if (!wrapped) {
        // No height on this head has a wrapped throat at all, so there is no
        // nape for it to be missing behind. Not a pass — not a case.
        quiet++;
        continue;
      }
      cases++;
      if (!best) {
        // WRAPPED EVERYWHERE AND BARE NOWHERE — the only shape a PASS can have
        // in this section, and until this line it was invisible.
        //
        // The height loop skipped every height whose bare arc was zero, so a
        // head whose nape is covered at all of them left `best` null and fell
        // into the branch above, where it was counted as "never wraps a throat
        // and is not a case" — the same line as a bare head. Measured on this
        // tree, that hid the huscarl's Sutton Hoo: 137 wrapped heights, 0.0
        // degrees bare at every one of them, the one combination in the shop
        // whose coif closes all the way round, filed under "not a case".
        //
        // A gate green because the case is absent is not a gate, and neither is
        // a gate whose only PASS is absent: it means the section cannot tell
        // the difference between a fixed nape and a head with no neck defence,
        // so the next fixer gets no signal that he is done.
        console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} ${rung.padEnd(14)}   0.0 deg        — mm   y ${String(widest.ymm).padStart(3)}   —            ${(widest.fwd * WRAP_STEP).toFixed(1)} deg    ${String(wrapped).padStart(3)}   covered at every wrapped height`);
        rows.push({ section: 3, cls, helm, rung, fail: false, deg: 0, r: 0 });
        continue;
      }
      // STRICTLY GREATER: 2.0 degrees is the tessellation allowance argued over
      // `WRAP_DEG` and is allowed; 2.5 is four consecutive samples of nape and
      // is not.
      const bad = best.deg > WRAP_DEG;
      if (bad) fails++;
      console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} ${rung.padEnd(14)} ${best.deg.toFixed(1).padStart(6)} deg   ${mm(best.r).padStart(6)} mm   y ${String(best.ymm).padStart(3)}   az ${best.az.toFixed(0).padStart(3)}deg      ${best.fwd.toFixed(1)} deg    ${String(wrapped).padStart(3)}${bad ? "   FAIL" : ""}`);
      rows.push({ section: 3, cls, helm, rung, fail: bad, deg: best.deg, r: best.r });
     }
    }
  }
  console.log("");
  console.log(`[clash]    ${fails} of ${cases} combinations with a wrapped throat are red; ${quiet} never wrap a throat and are not a case.`);
  return fails;
}

// ============================================================
// 4. CREST — daylight under a piece sitting on the cap
// ============================================================
//
// "The Wyrm-Crest Helmet needs a big update - the top piece is unrecognisable &
// also floating above the helmet, not attached."
//
// A crest, a comb, a boar or a serpent is riveted THROUGH the cap. It is
// allowed to arch — the Wyrm is written to arch, in as many words — but an arch
// has to land, and what reads as "not attached" is a fitting with sky under the
// whole of it.
//
// FIND THE CAP FIRST, and this is what the first cut of this section got wrong.
// Dropping a ray off every fitting and taking whatever it landed on failed all
// 36 combinations at 36 to 372 mm, because the flank of a bowl has the nape fall
// a long way below it and a hood has its own shoulder drape 340 mm down. Neither
// is daylight under a crest; both are just the side of a head.
//
// AND THE HELM LIST IS NOT NAMED EITHER, NOT ANY MORE. This section used to open
// with `if (!HELM[helm].cap) { absent++; continue; }`, which is the catalogue's
// opinion about which helms have a cap rather than the mesh's — the same fault
// section 2 carried, and switchable by the same one-word edit. It was never even
// necessary: the cap is found below by dropping a disc of columns through the
// crown and taking what they land on, and that machinery already prints "nothing
// of this helm crosses the crown — no cap to sit on" when there is no cap. The
// declaration was doing nothing but hiding four combinations from a test that
// can decide for itself, and the Shadow Hood — `cap: false` in the catalogue,
// and a garment that covers the crown in the mesh — is exactly the case it hid.
//
// THE FOUR HOOD ROWS ARE NEW AND THEY ARE NOT CONFIRMED. Letting the mesh decide
// admits the Shadow Hood, and the hood fails at 41.9 - 44.7 mm on a 48-triangle
// piece. Measured, before anybody calls that a defect: the piece is a flap at
// az 180, radius 136-144 mm, spanning y 134-252 mm, and its nearest approach to
// the cowl is 0.0 mm — it is ATTACHED at its root and hangs to 60.5 mm at its
// tip. That is the shape of the false positive this section's own history warns
// about twice ("the flank of a bowl has the nape fall a long way below it, and
// that is the side of a head, not daylight under a crest"): the "over the cap"
// test was written for a bowl sitting on a crown, and a hood's cap is a cowl
// that drapes to the shoulders, so a thing hanging BESIDE the head still lands
// on it.
//
// It is left standing, loudly, rather than tuned away in the commit that changed
// the case list. Excluding a fitting that never rises above the cap's own crown
// would fix it and would also move the reported fitting on twenty other rows —
// that is a change to what this section measures and it needs its own before and
// after, not a quiet ride on a commit about case selection. Whoever takes it
// should open a render of the Shadow Hood from behind first.
//
// The cap is found rather than named: drop a ray down the head's own axis and
// take the LAST piece of kit it passes through before the skull. A crest crosses
// that axis, so does the bowl, and the bowl is the lower of the two — so the
// lowest hit is the cap by construction, on every rung, without this file
// holding an opinion about which material a cap is made of.
//
// MEASURED STATION BY STATION ALONG THE RUN. A crest runs fore-and-aft over the
// crown, so its run is z. Every 4 mm of that run is a station, and a station's
// number is the fitting's NEAREST APPROACH to the cap there — how close it gets,
// not how high it goes. A crest is entitled to be tall; it is not entitled to a
// stretch of run where none of it comes down.
//
// Only stations OVER THE CAP count: the sample's own plumb line has to land on
// the cap, and not on some third piece first. A cheek guard hangs beside the
// head and never lands on the cap, so it is not in this section at all.
//
// TWO WRONG CUTS OF THIS ARE WORTH RECORDING, because both looked reasonable.
// Taking the vertical DROP from a fitting's underside failed all 36 combinations
// at 36 to 372 mm — the flank of a bowl has the nape fall a long way below it,
// and that is the side of a head, not daylight under a crest. Taking the lowest
// SAMPLE instead reported 46 mm on the warden's own steel comb on four rungs,
// and that comb is not floating: `comb` sweeps a HALF-tube with no floor, so its
// two long edges land on the cap and the lowest surface over the middle of it is
// its own lining, 46 mm up. A station's nearest approach sees the edges.
//
// Reported with how deep the fitting is at that same station, because the pair
// is the shape of the fault: the Wyrm's worst station is 17 to 24 mm of serpent
// with 50 to 54 mm of nothing between it and the cap.
const CREST_MM = 40.0;
/**
 * 40 mm, and the gap it sits in is wide and measured. On this tree the worst
 * station of every fitting in the shop reads:
 *
 *     Sutton Hoo crest and its garnets    14.4 - 15.4
 *     Wyrm-Crest's serpent                23.4 - 24.7   <- the owner's photograph
 *     berserker's fur crest under a cap   10.3 - 23.6
 *     warden's steel comb                  4.7 - 18.0
 *     Ridge Helm's comb                    4.7 -  5.6
 *     Boar-Crest's animal                 32.5 - 33.1   (a snout thrown forward)
 *     Shadow Hood's rear flap             41.9 - 44.7   <- see the note above
 *
 * so the bar is in an 8.8 mm gap, between the Boar's snout at 33.1 and the
 * hood's flap at 41.9, and against neither side of it.
 *
 * THE WYRM PASSES NOW, AND THAT IS NOT THE END OF THE OWNER'S NOTE. The serpent
 * read 50.0 - 54.2 when this bar was written and reads 23.4 - 24.7 today: round
 * five brought it down onto the cap, and this section is measuring attachment,
 * which is the half of "unrecognisable & also floating" that a nearest-approach
 * ruler can see. `docs/OPEN-DEFECTS.md` records the other half still open —
 * cropped to 46x60 it is "a gold line 2-3 px thick with one bend along the
 * crown", with no head, no jaw and no taper — and nothing in this file measures
 * whether a shape reads as an animal. A green row here is not a claim that it
 * does.
 */
function sectionCrest(rows) {
  console.log("");
  console.log("[clash] 4. CREST — daylight under a fitting sitting on the cap.");
  console.log(`[clash]    nearest approach to the cap at every 4 mm station of the run; bar ${CREST_MM.toFixed(1)} mm of air.`);
  console.log("");
  console.log("[clash]    kit against kit, so the rungs are grouped by the kit they build — see `kitSignature`.");
  console.log("");
  console.log("[clash] class       helm         rung           air mm   run deep       fitting              where");
  console.log("[clash] ------------------------------------------------------------------------------------------------------");
  let fails = 0, cases = 0, absent = 0;
  const buf = new Float64Array(BARY.length * 3);
  for (const cls of CLASSES) {
    for (const helm of HELMS) {
     for (const { g, also } of kitGroups(cls, helm)) {
      const rung = rungLabel(g, also);
      const { kit } = sortPieces(cls, helm, g);
      // THE CAP: the piece that is lowest under the crown.
      //
      // A DISC OF COLUMNS AND NOT ONE RAY, which the first cut of this got
      // wrong and which cost every verdict in the section. Every bowl is drawn
      // `v1: () => PI/2 - 0.02`, so it stops two millimetres short of its own
      // pole and `patch` closes that with a rim strip — there is a 4 mm hole at
      // the crown of every helmet in the shop. A single ray down the axis drops
      // straight through it, and 20 of 36 combinations reported "no cap".
      //
      // So: a 5 x 5 grid of columns over the crown, 15 mm apart. Each column
      // votes for whichever piece of kit is the LOWEST thing it passes through,
      // which is the piece lying against the skull; the cap is the piece with
      // the most votes. A crest crossing the same columns is always above it.
      const votes = new Map();
      for (let a = -2; a <= 2; a++) {
        for (let b = -2; b <= 2; b++) {
          let low = null, lowT = 0;
          for (const p of kit) {
            const d = rayHit(p.T, a * 0.015, 1.0, b * 0.015, 0, -1, 0, 2.0);
            if (d >= 0 && d > lowT) { lowT = d; low = p; }
          }
          if (low) votes.set(low, (votes.get(low) ?? 0) + 1);
        }
      }
      let cap = null, capVotes = 0;
      for (const p of kit) {
        const v = votes.get(p) ?? 0;
        if (v > capVotes) { capVotes = v; cap = p; }
      }
      if (!cap) {
        absent++;
        console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} ${rung.padEnd(14)}      —      (nothing of this helm crosses the crown — no cap to sit on)`);
        continue;
      }
      const fittings = kit.filter((p) => p !== cap && p.tris >= 12);
      if (!fittings.length) {
        absent++;
        console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} ${rung.padEnd(14)}      —      (a bare cap with no fitting on it — nothing to measure)`);
        continue;
      }
      cases++;
      // STATION BY STATION ALONG THE RUN, and the two cuts before this one both
      // failed because they judged a fitting by ONE sample.
      //
      // A crest runs fore-and-aft over the crown, so its run is z. For each 4 mm
      // station of that run, the question is how CLOSE the fitting gets to the
      // cap — its nearest approach — and the fault is the station where even the
      // nearest approach is a long way off. That is what "not attached" means:
      // not "some of it is high", which is every crest ever made, but "over this
      // stretch, none of it comes down".
      //
      // Judging by the lowest SAMPLE instead reported 46 mm on the warden's own
      // steel comb, on four rungs, and the comb is not floating: `comb` sweeps a
      // HALF-tube with no floor, so its two long edges land on the cap and the
      // lowest surface over the middle of it is its own lining, 46 mm up. A
      // station's nearest approach sees the edges and gets 0; a vertical drop
      // from the lining does not.
      //
      // Only stations that are OVER THE CAP count — the sample's own plumb line
      // has to land on the cap, and not on some third piece first. A cheek guard
      // hangs beside the head and never lands on the cap, so it is not in this
      // section at all.
      const STATION = 0.004;
      let air = 0, wp = null, wat = null, deep = 0;
      const capIx = columnIndex(cap.T);
      for (const p of fittings) {
        const otherIx = columnIndex(soup(kit.filter((q) => q !== p && q !== cap)));
        const stations = new Map();
        for (let i = 0; i < p.T.length; i += 9) {
          const c = samples(p.T, i, buf);
          for (let s = 0; s < c; s++) {
            const x = buf[s * 3], y = buf[s * 3 + 1], z = buf[s * 3 + 2];
            const drop = hitDown(capIx, x, y, z, 0.40);
            if (drop < 0) continue;                                     // not over the cap
            const other = hitDown(otherIx, x, y, z, 0.40);
            if (other >= 0 && other < drop) continue;                   // over a third piece
            const d = nearestDist(cap.T, x, y, z);
            const key = Math.floor(z / STATION);
            const st = stations.get(key);
            if (!st) stations.set(key, { d, at: [x, y, z], lo: y, hi: y, n: 1 });
            else {
              st.n++;
              if (d < st.d) { st.d = d; st.at = [x, y, z]; }
              if (y < st.lo) st.lo = y;
              if (y > st.hi) st.hi = y;
            }
          }
        }
        for (const st of stations.values()) {
          // A STATION WITH TWO SAMPLES IN IT IS THE END OF THE RUN, not a
          // station. The warden's comb finishes in a tip whose last 4 mm holds
          // one sample, 46 mm off the back of the raised cone; counting it made
          // the section fail four rungs for having a pointed comb. Three samples
          // is the smallest population that says the fitting is actually present
          // across the station rather than tapering out of it.
          if (st.n < 3) continue;
          if (st.d > air) { air = st.d; wp = p; wat = st.at; deep = st.hi - st.lo; }
        }
      }
      const bad = air * 1000 > CREST_MM;
      if (bad) fails++;
      console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} ${rung.padEnd(14)} ${mm(air).padStart(6)}   ${mm(deep).padStart(12)}   ${(wp ? `${wp.hex} (${wp.tris} tri)` : "-").padEnd(20)} ${wat ? at(wat) : ""}${bad ? "  FAIL" : ""}`);
      rows.push({ section: 4, cls, helm, rung: g.name, fail: bad, air });
     }
    }
  }
  console.log("");
  if (!cases) {
    // Same rule as section 2's: nothing measured is not a pass.
    fails++;
    console.log("[clash]    NO COMBINATION IN THE SHOP HAS A FITTING ON A CAP — this section measured");
    console.log("[clash]    nothing, which is not a pass. Six of the nine rungs are sold on a crest.  FAIL");
  } else {
    console.log(`[clash]    ${fails} of ${cases} combinations with a fitting on the cap are red; ${absent} have no cap or no fitting and are not a case.`);
  }
  return fails;
}

// ============================================================
// 5. PELT — hair or a beard out through a helm it is inside of
// ============================================================
//
// NEW THIS PASS, AND IT HAS NO RECORDED BASELINE. It exists because the last
// two passes both stumbled over the same thing and neither could measure it:
// "a beard hanging out from under the mask that this work UNCOVERED rather than
// caused", and a round-four fixer that answered a beard through a face plate by
// deleting three paid beards outright — Full Beard 40g, Forked Beard 80g,
// Ringed Braid 120g — and did not even pass.
//
// So this section is written to see a beard that is OUTSIDE a face mask, and to
// keep on seeing it if somebody makes the beard vanish instead of pressing it
// inside the plate.
//
// THE DENOMINATOR IS THE BEARD'S OWN SURFACE, AND THE PARAGRAPH THAT USED TO
// STAND HERE WAS FALSE. It said "a deleted beard scores zero out of zero and is
// printed as an absent case, not as a pass" and that "`NO PELT AT ALL` is louder
// than a failure". It was not: the denominator was hair AND beard together —
// `defaultAppearance` issues the same Oak Brown 0x4a3220 to both slots, so one
// tint was one list — and the `!fur.length` guard only fired when the HAIR was
// gone too, which this gate never builds, because it always asks for hairStyle
// "short". Round four's deletion was re-applied to prove it: `&& !style.mask` on
// the beard branch took the berserker's Sutton Hoo from 23838 to 21202 triangles
// and this section from 0.88% to 0.00%, worst patch "-", no warning, footer
// still reading "0 have NO hair or beard mesh at all". Three paid beards — Full
// 40g, Forked 80g, Ringed Braid 120g — could be deleted under every masked helm
// and the ruler got QUIETER.
//
// So the beard is measured against the beard, the hair against the hair, and
// the beard is checked for being there at all:
//
//   * `BEARD GONE` — the rung asks for a beard and the build emits no beard
//     mesh. A hard FAIL, counted in the section's red total. Zero out of zero
//     is not a pass and it is not an absent case either; it is the regression
//     this section exists to catch.
//   * `BEARD CUT` — the rung's beard exists but is smaller under the helm than
//     it is bare. Also a hard FAIL: half a deletion is a deletion. On this tree
//     every beard keeps every triangle under every helm, so this is a tripwire
//     rather than a reading, and the tripwire is the point.
//
// Hair gets the share but not the absence check, and deliberately: the hair
// material also draws the LASHES, so a hair piece list is never empty even on a
// shaved head, and a check that cannot fire is worse than no check. What the
// hair is losing under the deep helms is a real fault with a real owner —
// `docs/OPEN-DEFECTS.md`, "every 80-triangle hair-coil component that main
// builds under the Wyrm-Crest and the Sutton Hoo is absent on the branch" — and
// it wants a ruler that names components, not this one.
//
// MEASURED with the same horizontal ray as section 1, pointed the other way. A
// hair or beard sample is out through the helm when the ray INWARD, toward the
// head's axis, leaves its own mesh and then meets kit: that puts metal or mail
// between this piece of hair and the skull, which is the definition of hair on
// the wrong side of a helmet. Hair coming out from UNDER a hem passes, because
// at its own height there is no metal inboard of it — which is exactly the
// route `cheekHem` and the coif's hem were built to give it.
const PELT_PCT = 2.0;
/**
 * 2.0%, AND IT IS RE-ARGUED RATHER THAN CARRIED OVER. The figure is the same as
 * the one this section shipped with, but the thing it is a percentage OF has
 * changed — hair-and-beard-together became hair against hair and beard against
 * beard — so the old argument for it ("open metal rungs read 0.00 to 0.10%,
 * rungs with a face plate over a beard read 3.2 to 4.9%") is an argument about a
 * different measurement and cannot stand. A bar kept without re-measuring is a
 * bar nobody has checked.
 *
 * The spread across the whole sweep — 288 rows, four classes, nine helms, eight
 * hair and beard rungs, sorted and read off the run rather than sampled:
 *
 *   hair    ... 1.28  1.29  1.32  1.33  1.57  1.63  1.68 | 2.32  2.46  2.66 ...
 *   beard   ... 1.00  1.02  1.19  1.23  1.57               | 2.47  2.68  2.71 ...
 *
 * so the bar sits in a gap on BOTH denominators — 1.68 to 2.32 on the hair,
 * 1.57 to 2.47 on the beard — and no verdict in the section turns on where in
 * those gaps it sits. The tails run to 6.94% of a hair and 9.29% of a beard.
 *
 * What moved when the denominator split: the berserker's full beard under the
 * Sutton Hoo was 0.88% mixed into the hair and green, and is 2.71% against its
 * own surface and red. What moved when the paid rungs came in: the 40-gold Full
 * Beard under the Sutton Hoo reads 3.66 on the huscarl, 3.72 on the warden and
 * 4.77 on the runekeeper — the berserker wears it by default and is the 2.71 —
 * 17.5 to 23.2 mm deep, at az 1-2 deg and y -44 to -47 mm. That is dead ahead
 * and below the chin, which is the throat, and it is exactly the wedge of beard
 * through the mail rings that round five's adversary found by hand and no ruler
 * had ever seen.
 */
const trisOf = (list) => list.reduce((a, p) => a + p.tris, 0);
function sectionPelt(rows) {
  console.log("");
  console.log("[clash] 5. PELT — hair or beard out through the helm, not under its hem.");
  console.log(`[clash]    inward horizontal rays, area-weighted, EACH AGAINST ITS OWN SURFACE; bar ${PELT_PCT.toFixed(1)}%.`);
  console.log("");
  console.log("[clash] class       helm         rung           hair out%  beard out%   worst patch                deepest       where");
  console.log("[clash] -------------------------------------------------------------------------------------------------------------------------");
  let fails = 0, cases = 0, gone = 0;
  for (const cls of CLASSES) {
    for (const helm of HELMS) {
     for (const g of getupsOf(cls)) {
      const rung = g.name;
      const { hair, beard, kit } = sortPieces(cls, helm, g);
      if (!kit.length) continue;
      const wantBeard = g.beardStyle !== "none";
      const bareBeard = trisOf(barePieces(cls, g).filter((p) => p.hex === hex6(BEARD_TINT)));
      const gotBeard = trisOf(beard);
      cases++;
      if (wantBeard && !gotBeard) {
        // A HARD FAULT, not an absent case. The rung is paying for a beard and
        // the build emits none: nothing to measure is the regression, not an
        // excuse from measuring.
        gone++; fails++;
        console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} ${rung.padEnd(14)}      —          —      BEARD GONE — the rung asks for "${g.beardStyle}" and the build emits no beard mesh (bare head has ${bareBeard} tri)  FAIL`);
        rows.push({ section: 5, cls, helm, rung, fail: true, absent: true });
        continue;
      }
      const KT = soup(kit);
      const rh = hair.length ? outboardShare(hair, KT) : null;
      const rb = beard.length ? outboardShare(beard, KT) : null;
      const hp = rh ? 100 * rh.share : 0, bp = rb ? 100 * rb.share : 0;
      // The worse of the two is what gets named, because the row has one slot
      // for a patch and the reader wants the piece that is actually outside.
      const r = (rb && (!rh || rb.share > rh.share)) ? rb : rh;
      const cut = wantBeard && gotBeard < bareBeard;
      const bad = hp > PELT_PCT || bp > PELT_PCT || cut;
      if (bad) fails++;
      const patch = r?.wp ? `${r.wp.hex} (${r.wp.tris} tri) ${(100 * r.worst).toFixed(1)}%` : "-";
      const note = cut ? `  BEARD CUT — ${gotBeard} tri under this helm, ${bareBeard} bare` : "";
      console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} ${rung.padEnd(14)} ${hp.toFixed(2).padStart(8)}  ${(rb ? bp.toFixed(2) : "—").padStart(9)}   ${patch.padEnd(24)} ${mm(r ? r.depth : 0).padStart(7)} mm  ${r?.wat ? at(r.wat) : ""}${note}${bad ? "  FAIL" : ""}`);
      rows.push({ section: 5, cls, helm, rung, fail: bad, hairPct: hp, beardPct: bp });
     }
    }
  }
  console.log("");
  console.log(`[clash]    ${fails} of ${cases} combinations are red; ${gone} of those are a beard the build did not emit at all.`);
  return fails;
}

// ============================================================
// The run
// ============================================================
function battery() {
  const rows = [];
  const fails = {};
  // EVERY HEAD IS REBUILT. `sortPieces` keeps what it builds so that five
  // sections asking for one head cost one build, and clearing it here is what
  // keeps `--twice` honest: the second run does the same 288 builds as the
  // first, so byte-identical means the BUILD is deterministic and not merely
  // that a Map gave back what was put in it.
  pieceCache.clear();
  bareCache.clear();
  assertFaceIsPlusZ();
  assertTintsAreLabels();
  if (SECTIONS.has(1)) fails[1] = sectionLayers(rows);
  if (SECTIONS.has(2)) fails[2] = sectionFlesh(rows);
  if (SECTIONS.has(3)) fails[3] = sectionWrap(rows);
  if (SECTIONS.has(4)) fails[4] = sectionCrest(rows);
  if (SECTIONS.has(5)) fails[5] = sectionPelt(rows);
  const names = { 1: "LAYERS", 2: "FLESH", 3: "WRAP", 4: "CREST", 5: "PELT" };
  console.log("");
  console.log("[clash] ============================================================");
  let red = 0;
  for (const s of [1, 2, 3, 4, 5]) {
    if (!(s in fails)) continue;
    if (fails[s]) red++;
    console.log(`[clash] ${s} ${names[s].padEnd(7)} ${fails[s] ? `FAIL — ${fails[s]} combination(s)` : "pass"}`);
  }
  const ran = Object.keys(fails).length;
  console.log(`[clash] ${ran === 0 ? "NO SECTIONS SELECTED — nothing was measured, which is not a pass"
    : red === 0 ? "ALL SECTIONS PASS" : `${red} of ${ran} sections RED`}`);
  const rungs = CLASSES.reduce((a, c) => a + getupsOf(c).length, 0) / CLASSES.length;
  console.log(`[clash] seed ${SEED}, lod ${LOD}, ${CLASSES.length} classes x ${HELMS.length} helms x ${rungs} hair-and-beard rungs, read off the built mesh.`);
  console.log("[clash] ============================================================");
  return { rows, fails };
}

if (has("twice")) {
  // Determinism, proved rather than claimed. Two full runs in one process,
  // captured and compared character for character.
  const cap = [];
  const real = console.log;
  console.log = (...a) => cap.push(a.join(" "));
  const { fails } = battery();
  const first = cap.splice(0).join("\n");
  battery();
  const second = cap.join("\n");
  console.log = real;
  console.log(first);
  console.log("");
  // AND THE VERDICT STILL COUNTS. This branch used to return 0 whatever the
  // battery found, so `helmclash -- --twice` exited SUCCESS with five sections
  // red: anything running the determinism mode in a pipeline was told the helms
  // were fine by a check that only ever asked whether two runs agreed. Two runs
  // agreeing about a defect is agreement about a defect.
  process.exitCode = Object.values(fails).some((n) => n > 0) ? 1 : 0;
  if (first === second) console.log(`[clash] --twice: two runs, ${first.length} characters, BYTE-IDENTICAL.`);
  else {
    const lines1 = first.split("\n"), lines2 = second.split("\n");
    const i = lines1.findIndex((l, k) => l !== lines2[k]);
    console.log(`[clash] --twice: NOT DETERMINISTIC. First difference at line ${i + 1}:`);
    console.log(`[clash]   run 1: ${lines1[i]}`);
    console.log(`[clash]   run 2: ${lines2[i]}`);
    process.exit(1);
  }
} else {
  const { fails } = battery();
  process.exitCode = Object.values(fails).some((n) => n > 0) ? 1 : 0;
}
