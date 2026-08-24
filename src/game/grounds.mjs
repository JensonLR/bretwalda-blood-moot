// ============================================================
// GROUNDS — the sim-facing half of a place you can fight in.
//
// A ground is two halves. This file is the half that has no opinion about
// pixels: how high the turf is under a point, how far out the fighting floor
// runs, where a man may be stood at the start of a round, and what on it can
// kill him without anybody swinging. `render/world.ts` owns the other half —
// palette, props, light — and reads its shape from here.
//
// The split is here rather than inside the renderer because of who has to
// agree. The server decides where warriors stand and what burns them; the
// client decides what that looks like. Both are describing one surface, and
// the only way two programs describe one surface identically is if there is
// one description. `engine.mjs` carries a hand-copy of the renderer's terrain
// field with a comment asking the next person to re-copy it if the field is
// ever re-cut — which is a promise nothing can keep across three grounds. This
// file is where that copy is meant to come to rest.
//
// Nothing here may import three.js, or the server cannot load it. That is the
// whole constraint, and it is why the noise kit lives at the top of this file
// rather than in the renderer: a height field is arithmetic, and arithmetic is
// the part both sides need.
//
// A CORRECTION, BECAUSE THIS HEADER USED TO SAY THE SERVER "IMPORTS THIS
// INSTEAD" AND IT DOES NOT. Measured 13 Aug 2026 by grepping every importer in
// the repository: `render/world.ts` is the ONLY one. `engine.mjs` still carries
// its own `clamp01`, `smoothstep`, `hash2`, `noise2`, `fbm`, its own copy of
// `GATE_ANGLES` and `pathMask`, its own `groundHeight`, its own
// `ARENA_RADIUS = 18` and its own `FIRE_GEOMETRY_RADIUS = 2.0`. Its comment
// gives the reason as "that module is the renderer's and pulls three.js in with
// it" — which was true of `world.ts` and has never been true of this file.
//
// So the split described above is REAL on the renderer's side and still
// ASPIRATIONAL on the server's, and the sentence claiming otherwise was this
// repository's own recorded fault — a comment asserting a fix that is not
// present — sitting in the file whose entire job is to end that fault. The
// numbers agree today; nothing makes them agree tomorrow. Wiring the server to
// this file is open work and `docs/MAPS.md` carries it.
// ============================================================

import { rick, raisedStone, passable } from "./solidground.mjs";

// ---------------------------------------------------------------------------
// Noise. Value noise off an integer lattice, hashed — no tables, no allocation,
// deterministic across reloads and independent of any prop rng's call order, so
// changing a scatter never moves the ground under it.
//
// Shared by every ground rather than re-derived per ground, so two grounds that
// want the same 40 m swell can ask for it the same way and a third can be told
// what its landform is made of.
// ---------------------------------------------------------------------------

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Fixed-seed PRNG (mulberry32). The seed is arbitrary; that it never changes is
 * the point — a prop laid out from one of these stands in the same place on
 * every load, so an A/B against `art/shots/baseline` is measuring the change
 * rather than the scatter.
 *
 * It lives here, with the noise kit, because it is arithmetic and BOTH SIDES
 * NEED IT: the woodpile's billets are jittered by one of these, and since the
 * sim now has to collide with the pile the sim has to be able to lay out the
 * same billets. `render/world.ts` imports this one rather than keeping its own.
 */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function hash2(ix, iy) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

/** 0..1, roughly centred on 0.5. */
export function fbm(x, y, octaves) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(fx, fy) * amp;
    norm += amp;
    amp *= 0.5;
    // Rotate as well as scale, so the octaves do not stack into a visible grid.
    const nx = fx * 1.97 + fy * 0.42;
    const ny = fy * 1.97 - fx * 0.42;
    fx = nx + 31.7;
    fy = ny - 17.3;
  }
  return sum / norm;
}

/** Ridged fbm — downland has crests, and plain fbm reads as dunes. */
export function ridged(x, y, octaves) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise2(fx, fy) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    amp *= 0.45;
    const nx = fx * 2.11 + fy * 0.37;
    const ny = fy * 2.11 - fx * 0.37;
    fx = nx + 5.1;
    fy = ny + 9.9;
  }
  return sum / norm;
}

// ===========================================================================
// THE SAXON VILLAGE
//
// Dusk, firelit, warm: a palisade ring round a bonfire, halls and thatch
// beyond it. Everything below is its *shape* — the field, the ring it is
// fought in, and the one thing on it that kills.
// ===========================================================================

/** Where the tracks in and out of the moot cross the earthwork. */
const GATE_ANGLES = [0.42, 2.55, 4.55];

/**
 * Where relief is masked off. Inside this the field is held near the boot
 * plane; outside it the bank, the ditch and the downs are allowed to start.
 * It is not the radius anyone fights in — see `play.radius` — and the two are
 * deliberately different numbers: the fight stops well inside the earthwork.
 */
const RELIEF_RADIUS = 21.5;

/**
 * Standing water. One list carves the basins into the height field, drives the
 * damp margin the terrain shades, and places the meshes — so a puddle can only
 * ever be in a hollow it made itself.
 *
 * *Where* the entries are is the whole of the art direction here. Rain does not
 * stand on open turf; it stands where something has already broken the ground.
 * So every puddle below is in a cart rut on one of the three tracks, against the
 * foot of the palisade where run-off collects, or in ground the moot has churned
 * — and nothing sits on unbroken grass. The version this replaces was six discs
 * on radii chosen to look evenly spread, which put a 2.5 m pool exactly where
 * every framed character shot stands its subject: `stance` came back with the
 * near half of the frame under water and the moot reading as flooded rather than
 * muddy. Nominal wetted area is down from ~88 m² to ~26, the largest open pool
 * from 5.0 m across to 2.4, and the deepest hollow inside the palisade from
 * 81 mm below the boot plane to 63.
 *
 * They are ellipses because a rut is not a disc, and a pool lying along the base
 * of a stake line is not either. Depth varies with what made the hollow: a wheel
 * rut holds 20 mm, a trampled hollow 30.
 *
 * @typedef {object} Puddle
 * @property {number} x
 * @property {number} z
 * @property {number} a Semi-axis along `rot`, in metres.
 * @property {number} b Semi-axis across it.
 * @property {number} rot
 * @property {number} depth Standing depth at the centre. The basin beneath is
 *   deeper — see WATER_FILL.
 * @property {number} cos Derived once: `heightAt` is on the per-frame path and
 *   this is its inner loop.
 * @property {number} sin
 * @property {number} reach2 Squared world distance past which this puddle
 *   contributes nothing measurable.
 */

/**
 * Standing depth as a fraction of the basin holding it. Every puddle therefore
 * leaves dry basin wall above its own waterline for the churn to read on, and —
 * because the fraction is shared — the ring radii the water mesh is built from
 * can be solved once for the whole list however much the depths vary.
 */
const WATER_FILL = 0.625;

/**
 * How far past the water's edge the mud stays visibly damp. A distance, not a
 * ratio: a 0.25 m rut with a margin scaled to its own size would have no margin
 * at all, and the damp ring is what stops small water reading as a sticker.
 */
const WET_MARGIN = 0.5;

/**
 * The deepest water in the list; shallower puddles grade their colour, their
 * opacity and their damp margin against it. Has to track the largest `depth`
 * below — it is a normaliser, not a limit, and nothing clamps to it.
 */
const DEEPEST_WATER = 0.030;

/** @returns {Puddle} */
function puddle(x, z, a, b, rot, depth) {
  // 2.2 rim-radii out the Gaussian below is at 4e-4 — under a tenth of a
  // millimetre of carve, and nothing the eye can find in the damp mask.
  const reach = (Math.max(a, b) + WET_MARGIN) * 2.2;
  return { x, z, a, b, rot, depth, cos: Math.cos(rot), sin: Math.sin(rot), reach2: reach * reach };
}

/** Where a gate track crosses radius `r`, wander included — see `pathMask`. */
function trackAt(gate, r) {
  const th = gate + Math.sin(r * 0.26 + gate * 3.1) * 0.1;
  return { x: Math.cos(th) * r, z: Math.sin(th) * r, th };
}

/**
 * The pair of ruts a cart's wheels cut into a track. Derived from the track
 * rather than written out as coordinates, so ruts stay in the wheel-line if the
 * gates ever move; a rut beside its own path is worse than no rut.
 */
function ruts(gate, r, half, a, b, depth) {
  const t = trackAt(gate, r);
  const px = -Math.sin(t.th) * half;
  const pz = Math.cos(t.th) * half;
  // The far wheel a little shallower: a matched pair reads as a decal.
  return [
    puddle(t.x + px, t.z + pz, a, b, t.th, depth),
    puddle(t.x - px, t.z - pz, a * 0.92, b, t.th, depth * 0.84),
  ];
}

/** A pool against the foot of the palisade, lying along the ring rather than across it. */
function dripLine(bearing, r, a, b, depth) {
  return puddle(Math.cos(bearing) * r, Math.sin(bearing) * r, a, b, bearing + Math.PI / 2, depth);
}

/**
 * "Nothing lands under a boot" is the invariant this list is built on, and it
 * had never been checked against the poses the captures actually use. Measured
 * against all 25 warriors in the eight presets, in rim-radii of the nearest
 * puddle: two of `brawl`'s ring of eight stood *inside* the water at 0.26 and
 * 0.96, and eight of the 25 stood in a damp margin — including the framed
 * subject of `portrait`, `stance` and `closeup`, which is the shot the whole
 * list was last rearranged to protect.
 *
 * Three radii move below and nothing else does. Afterwards the closest any
 * warrior stands is 1.41 rim-radii, none is in water, and the interior height
 * field is unchanged at −63 mm … +18 mm — the basins moved, they did not grow.
 *
 * @type {readonly Puddle[]}
 */
const PUDDLES = [
  // Cart ruts on the three tracks. Radii chosen so each pair lands in a frame
  // that wants water — the main gate's beside the duel, the north-west track's
  // behind the character shots' subject rather than under him, the south's
  // where the last stand is fought — and so none of them lands under a boot.
  //
  // The north-west pair at 10.0 was not behind the subject, it was *through*
  // him: a rut is 1.6 m of semi-axis lying along the radius, so a pair centred
  // at r = 10.0 runs from r = 8.4 to r = 11.6, and `portrait`/`stance` stand
  // their subject at r = 8.38 and `closeup` at r = 9.22 — both inside the run.
  // At 12.5 the inner tip sits at r = 10.9 and clears the furthest of them by
  // 1.7 m. `stance`'s blocking foe at r = 10.88 is the one pose still level
  // with a rut; he is 0.9 m off its centreline and keeps a 0.08 damp margin,
  // which is what a man standing beside a cart track should have.
  ...ruts(GATE_ANGLES[0], 9.0, 0.66, 1.7, 0.25, 0.021),
  ...ruts(GATE_ANGLES[1], 12.5, 0.65, 1.6, 0.24, 0.019),
  ...ruts(GATE_ANGLES[2], 11.4, 0.68, 1.75, 0.27, 0.023),

  // The drip line inside the stakes. Shallowest water in the arena and the
  // thinnest, because nothing treads there to deepen it — it is the timber's
  // own run-off, and it reads mostly as a dark line under the palisade.
  dripLine(1.28, 19.25, 2.3, 0.4, 0.016),
  dripLine(3.62, 19.3, 2.0, 0.36, 0.015),
  dripLine(5.55, 19.2, 1.7, 0.33, 0.014),

  // Churned ground. The deep one is in the standing ring where the crowd has
  // been treading all evening; the small ones are inside the fighting circle,
  // placed off every framed subject's feet but close enough to the brawl to be
  // fought around.
  //
  // The two small ones sat on `brawl`'s spawn circle. That ring is r = 4.2 on
  // eight bearings half a step off the cardinals, and these were at r = 4.35
  // and r = 4.65 on two of those bearings — 0.17 m and 0.63 m from a warrior's
  // feet, so two of the eight stood in the water. They keep their bearings and
  // go out to r = 5.74 and 6.20, between the ring and the standing crowd, which
  // is still ground the brawl is fought over and is 2.19 m clear of the
  // nearest boot.
  puddle(9.35, -5.35, 1.2, 0.95, 0.85, 0.030),
  puddle(-4.15, -4.6, 0.85, 0.6, 2.15, 0.024),
  puddle(4.35, -3.75, 0.72, 0.55, -0.55, 0.021),
  puddle(-2.6, 4.4, 0.85, 0.62, -0.9, 0.023),
  puddle(-9.6, -9.4, 1.15, 0.9, 0.3, 0.027),
];

/**
 * 0..1 where the turf has been walked off. Three tracks converge on the fire
 * from the gates, a ring is worn where the crowd stands back, and the centre is
 * bare. Everything about the ground's colour hangs off this, and so does the
 * shallow dip the tracks wear into the field.
 */
function pathMask(x, z, r) {
  if (r > 31) return 0;
  const th = Math.atan2(z, x);
  let m = 0;
  for (const g of GATE_ANGLES) {
    // The track wanders. A straight radial line reads as a decal, not a path.
    const target = g + Math.sin(r * 0.26 + g * 3.1) * 0.1;
    let d = th - target;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const lateral = Math.abs(d) * Math.max(r, 1.2);
    const width = 0.95 + r * 0.06;
    m = Math.max(m, 1 - smoothstep(width * 0.35, width, lateral));
  }
  // The standing ring, and the bare circle the fire keeps clear.
  m = Math.max(m, 0.8 * Math.exp(-(((r - 10.8) / 2.6) ** 2)));
  m = Math.max(m, 1 - smoothstep(2.2, 5.6, r));
  return m * (1 - smoothstep(24, 31, r));
}

/** 0..1 churned mud, heaviest where the fighting actually happens. */
function churnMask(x, z, r) {
  const n = fbm(x * 0.15 + 41.3, z * 0.15 + 7.9, 3);
  return clamp01((1 - smoothstep(3.5, 15, r)) * (0.35 + n * 1.1));
}

/**
 * Distance from a puddle's centre in rim-radii: 1 on the rim, whatever the
 * puddle's shape or orientation. `grow` widens both axes by a distance in
 * metres, which is how the damp margin can be a constant width around water
 * that runs from a 0.25 m rut to a 1.2 m hollow.
 */
function puddleDist(p, x, z, grow) {
  const dx = x - p.x;
  const dz = z - p.z;
  const u = (dx * p.cos + dz * p.sin) / (p.a + grow);
  const v = (dz * p.cos - dx * p.sin) / (p.b + grow);
  return Math.sqrt(u * u + v * v);
}

/**
 * 0..1 proximity to standing water. The dark wet ring, the surface of the
 * puddle and the wet sheen in the terrain shader all read this one function and
 * cannot drift apart.
 */
function basinWet(x, z) {
  let w = 0;
  for (const p of PUDDLES) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz > p.reach2) continue;
    const d = puddleDist(p, x, z, WET_MARGIN);
    // Compact support, and that is a correction rather than a taste. The
    // gaussian this replaces still returned a third of full wetness *on* the
    // grown rim, so a 0.24 m cart rut laid a damp stain more than a metre wide
    // on either side of itself and `portrait`, `stance` and `closeup` all stood
    // their subject inside one. Measured across the north-west rut's short
    // axis: v7 read 0.42 at 0.6 m off the centreline and 0.12 at a full metre,
    // this reads 0.12 and zero, and both still read 0.88 on the water itself.
    // A margin named WET_MARGIN has to be WET_MARGIN wide.
    //
    // Graded by depth: a 14 mm drip line has not saturated the ground around it
    // the way a 30 mm hollow has, and giving every puddle the same near-black
    // margin is how a list of small water turns into a field of dark stains.
    const n = (1 - smoothstep(0.3, 1, d)) * (0.66 + 0.34 * (p.depth / DEEPEST_WATER));
    if (n > w) w = n;
  }
  return w;
}

/**
 * 0..1 how badly trodden ground drains, at the scale a hollow in it actually
 * is — a couple of metres, which is what an evening of boots leaves behind.
 *
 * One field, read three times: the mud's sodden patches, the drying ridges
 * between them, and the only places a film of water is allowed to stand. So
 * colour, roughness and water cannot disagree about where the low ground is,
 * which is the same invariant `basinWet` gives the puddles.
 *
 * Two octaves and no more. The terrain carries this on 0.8 m vertices and a
 * third octave lands at 0.9 m, under the sampling — and a wet mask modulating
 * below its own sampling rate is exactly how the ground came back salted with
 * specular glitter two passes ago.
 */
function drainage(x, z) {
  return fbm(x * 0.28 - 63.7, z * 0.28 + 18.9, 2);
}

/**
 * The one height field. Inside the palisade it stays within about 5 cm of zero,
 * because the server places boots at y = 0 and a 20 cm hollow there is a warrior
 * standing in mid-air. Outside, the moot sits inside a bank-and-ditch earthwork
 * that runs out into rolling turf and then downland — which is what stops the
 * arena reading as a disc drawn on a plain.
 *
 * This is the function the server calls to plant a man and the function the
 * terrain mesh is built from. It is one function on purpose: the previous
 * arrangement was two, and the second one was a comment asking to be re-copied.
 */
function heightAt(x, z) {
  const r = Math.hypot(x, z);

  // Interior: shallow swales, the tracks worn a little lower, puddle basins.
  let h = (fbm(x * 0.085 + 17.3, z * 0.085 - 5.1, 3) - 0.5) * 0.062;
  h -= pathMask(x, z, r) * 0.024;
  // The invariant this whole field is built around is that the interior stays
  // within ~5 cm of zero, because the server sim is 2-D and a warrior's boots
  // are planted at y = 0 — and the basins were the single term most responsible
  // for breaking it: worst |y| inside the palisade was 107 mm before they were
  // cut back. The deepest basin here is 30 mm of water over WATER_FILL = 48 mm,
  // unchanged, and most of them are two thirds of that. The rest of the budget
  // is the swale above, which is what carries the interior's relief.
  //
  // No puddle now sits under a framed subject's feet, so the old worry — the
  // gap between the boot plane and a waterline 1.1 m from the shot's subject —
  // is placement's problem rather than depth's, and it is solved in PUDDLES.
  for (const p of PUDDLES) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz > p.reach2) continue;
    const d = puddleDist(p, x, z, 0);
    h -= (p.depth / WATER_FILL) * Math.exp(-d * d * 1.6);
  }

  // Relief is masked off inside the ring and ramps in fast just outside it, so
  // the bank is a bank rather than a swelling the mask has flattened to a bump.
  const out = smoothstep(RELIEF_RADIUS - 2, RELIEF_RADIUS + 4, r);

  // Bank and ditch. The crest sits behind the palisade line, the ditch outside
  // it, so the ring reads as defended ground from every camera angle.
  const bank = 0.88 * Math.exp(-(((r - 23.4) / 2.5) ** 2)) - 0.62 * Math.exp(-(((r - 27.8) / 2.2) ** 2));
  h += bank * out;

  // Gates cut through the bank, or the tracks would climb a wall to leave.
  const th = Math.atan2(z, x);
  let cut = 0;
  for (const g of GATE_ANGLES) {
    let d = th - g;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    cut = Math.max(cut, 1 - smoothstep(0.05, 0.19, Math.abs(d)));
  }
  h -= bank * out * cut * 0.9;

  const rolling = (fbm(x * 0.019 + 3.7, z * 0.019 + 9.4, 4) - 0.5) * 2;
  h += rolling * (0.45 + 4.6 * smoothstep(26, 74, r)) * out;

  h += (ridged(x * 0.0062 + 21.7, z * 0.0062 - 13.2, 3) - 0.28) * 19 * smoothstep(52, 158, r);
  // One term at a wavelength longer than the whole map, so the horizon is high
  // downland in some directions and open sky in others. Without it every
  // bearing out of the moot looks like every other bearing.
  h += (fbm(x * 0.0037 + 71.3, z * 0.0037 - 5.6, 2) - 0.5) * 30 * smoothstep(55, 175, r);

  return h;
}

// ---------------------------------------------------------------------------
// What stands on the floor, and which half of the owner's line it falls on
//
//   > "any 'larger' objects (wood pile, wood fire structure, fence, larger
//   > rocks or boulders, buildings or structures, castles or formations, that
//   > are deemed as more of an obstacle decoration rather than a 'decoration
//   > decoration' (sword in ground, helmet on floor, blood on floor etc.)"
//
// The rule this ground is built on, and the one `docs/MAPS.md` asks every
// future ground to follow:
//
//   A SOLID IS PLACED BY THE GROUND. A DECORATION IS SCATTERED BY THE RENDERER.
//
// Declaration IS placement. Everything below owns its own position, and
// `render/world.ts` reads it from here — so there is one woodpile in this
// repository, not a drawn one and a collided one. Everything the renderer draws
// out of `scatter()` is decoration by construction: the sim never learns where
// those went, and the arrows, bones, helms, broken boards and loose rocks are
// exactly the "sword in ground, helmet on floor" the owner exempted.
//
// A prop that wants to become solid has to move its placement up here. That is
// deliberate friction: it is the difference between a decision and a default.
// ---------------------------------------------------------------------------

/**
 * The firewood rick beside the bonfire. The owner's own example — "the wooden
 * stick pile on current map" — and the reason this whole unit exists.
 *
 * Knee-high, and solid anyway: the sim is 2-D, a man cannot step over anything,
 * and a warrior driven backwards into a stacked rick should be stopped by it
 * rather than standing in the middle of it. Its two spilled billets are NOT
 * part of it; see `rick`.
 */
export const VILLAGE_WOODPILE = rick({
  id: "woodpile",
  x: -5.4, z: -4.1, rot: 0.4,
  // The rick's own stream, not the arena's — the renderer's every scatter after
  // this block draws from the shared `rng` in order, so spending twenty-two
  // extra numbers there would move every arrow, bone and barrel in the moot and
  // an A/B against a previous capture would be measuring the debris. Handed in
  // rather than imported: see the header of `solidground.mjs`.
  seeded, seed: 0x1f0a3c7d,
  why:"The owner named it: a coursed rick of split billets between driven crib stakes, waist-deep and a metre and a half long. It is the largest built thing standing on the fighting floor and a man walked through it.",
});

/**
 * The runestone. Four metres of raised slab at r = 17.7, which is INSIDE the
 * play radius of 18 by a quarter of a metre — so a man driven to the south edge
 * of the ring meets it, and until now walked through it.
 *
 * It is also the awkward case that shaped `resolveSolids`: its far corner
 * reaches past the play bound, so the ring and the stone can each push a body
 * into the other. They are solved together for that reason.
 */
export const VILLAGE_RUNESTONE = raisedStone({
  id: "runestone",
  x: -3.4, z: -17.4, rot: 0.34,
  noise: noise2,
  why:"A raised stone: an irregular slab a metre and a half wide and four high, packed upright at the foot with stones. The owner's 'larger rocks or boulders ... or formations', and the only thing in the moot older than the moot.",
});

/**
 * The props that do NOT block, each with the reason, because the owner's
 * distinction is only worth anything if the answer is written down for both
 * halves. No geometry here on purpose: a decoration has no collision shape, so
 * there is nothing on this list that can drift out of step with the render.
 *
 * Nothing in the sim reads this. It is documentation with a constructor that
 * refuses to build an entry without a reason, which is the only kind of
 * documentation this repository has managed to keep true.
 */
export const VILLAGE_PASSABLE = Object.freeze([
  passable("bonfire",
    "THE ONE DELIBERATE EXCEPTION, and it is the exception that proves the rule. A wood fire structure is exactly what the owner listed as an obstacle — but this one is the arena's only hazard, and the entire point of it is that men are shoved INTO it. Make it solid and the fire stops killing anybody. Its kerb of hearth stones is passable for the same reason: fenced off, the hazard is decoration."),
  passable("hearthstones",
    "Sixteen ankle-high stones ringing the fire at 1.75 m. Solid, they would be a fence around the hazard — see the bonfire."),
  passable("woodpile-spill",
    "Two billets rolled off the end of the rick and lying flat in the mud. A log on the ground is a thing you step over, and the owner's line puts it with the sword in the ground."),
  passable("runestone-packing",
    "Eleven packing stones round the foot of the raised stone, none more than 0.6 m across and all half-sunk. Kerb, not obstacle."),
  passable("fallen-shield",
    "One board shield left leaning inside the ring at (-12.6, 10.4). Gear on the floor: decoration decoration."),
  passable("battlefield-debris",
    "Arrows standing in the mud, broken boards, a lost helm, bones. Scattered by the renderer, never placed by the ground, and named by the owner as the case that should NOT block."),
  passable("beyond-the-floor",
    "Huts, the hall, the palisade, banner poles, shield racks, spear bundles, barrels and the loose rocks all stand outside the play bound at 18 m, which stops a man 1.6 m short of the palisade. They are unreachable rather than passable, and every one of them would be declared solid on a ground whose floor reached them. A ground that opens its gates has to declare them."),
]);

export const SAXON_VILLAGE = {
  id: "saxon_village",
  name: "The Saxon Village",

  // The fighting floor. Six metres inside the palisade at 19.6, which is what
  // keeps a man driven to the edge off the timber rather than through it.
  play: { shape: "disc", radius: 18 },

  // Where a round opens. The gap is straight-line room between neighbours and
  // the ring is solved from it against the headcount; the floor clears the
  // bonfire, the ceiling keeps a man's back off the stakes.
  spawn: { gap: 7.5, minRadius: 6, maxRadius: 12 },

  // What can kill without a swing. `radius` is the outermost *geometry* of the
  // thing — the fire's widest log tip — and not the trigger: the sim insets it
  // by half a body's width so a man is more in the fire than out of it before
  // it bites, and that inset is the sim's business because a body's width is.
  //
  // A ground with nothing burning on it carries an empty list, which is the
  // point of the list. The hazard used to be a constant at the origin, so any
  // ground would have had an invisible hot spot at (0, 0) whether or not
  // anything was alight there.
  hazards: [
    { id: "bonfire", kind: "fire", x: 0, z: 0, radius: 2.0 },
  ],

  // Standing geometry a man cannot walk through — and, therefore, geometry a
  // spawn or a path may not be solved into either. `resolveSolids` in
  // `solidground.mjs` is what turns this list into a wall; `VILLAGE_PASSABLE`
  // above is the other half of the same decision and says what is NOT here.
  //
  // Two, and that is not an oversight: the village's floor is nearly bare by
  // design. `CLEAR_RADIUS` in the renderer keeps everything but the fire out of
  // the middle 6.2 m, the fire itself must stay walk-into-able or it stops
  // killing anyone, and everything else in the moot stands outside the play
  // bound. These two stand on the floor, and both of them were holograms.
  obstacles: [VILLAGE_WOODPILE, VILLAGE_RUNESTONE],

  heightAt,

  // The rest is the ground's own business and the renderer reads it. It is
  // exported rather than kept private because the alternative is the renderer
  // owning a second copy of the same masks, which is the fault this file
  // exists to end.
  field: {
    reliefRadius: RELIEF_RADIUS,
    gateAngles: GATE_ANGLES,
    puddles: PUDDLES,
    waterFill: WATER_FILL,
    wetMargin: WET_MARGIN,
    deepestWater: DEEPEST_WATER,
    pathMask,
    churnMask,
    drainage,
    basinWet,
  },
};

// ============================================================
// THE MOOR — the second ground, and the first that is not a village
// ============================================================
//
// Sixteen territories shared one arena, so Deira looked exactly like Dyfed and
// taking ground read as a number changing. This is the other place.
//
// WHAT IS DELIBERATELY THE SAME, and it is most of the file. The play disc is
// 18 m, the spawn ring is the village's, and there is one fire of radius 2.0 at
// the origin. Every one of those is load-bearing somewhere else: `spawnRing`
// solves against the disc, `tools/solidtest.mjs` models the bound, `firetest`
// and `goretest` and the whole burn path in `engine.mjs` are written against a
// hazard at the middle. A second ground that moved them would be a second
// ground AND a rebalance, and only one of those was asked for.
//
// WHAT IS DIFFERENT IS EVERYTHING A PLAYER SEES. No palisade, so no bank ring
// and no gate cuts in the height field — the ground simply keeps going. No
// huts. Four standing stones instead, and the relief starts closer in and runs
// harder, because upland is the whole idea.

/**
 * Peat hollows. Shallower and wider than the village's cart puddles, and dark
 * rather than muddy: peat holds water without churning, so what a moor has is
 * black pools with a firm edge, not a slurry.
 */
const MOOR_HOLLOWS = Object.freeze([
  { x: 6.9, z: -4.2, depth: 0.052, reach: 3.4 },
  { x: -8.1, z: 5.6, depth: 0.044, reach: 2.9 },
  { x: 1.4, z: 9.8, depth: 0.038, reach: 2.4 },
  { x: -5.2, z: -9.4, depth: 0.030, reach: 2.1 },
].map((h) => ({ ...h, reach2: h.reach * h.reach })));

/** Where the relief is allowed to start. Closer in than the village's 21.5. */
const MOOR_RELIEF_RADIUS = 19.5;

/** How wet the ground is at a point: the hollows, and the drainage between. */
function moorWet(x, z) {
  let w = 0;
  for (const h of MOOR_HOLLOWS) {
    const dx = x - h.x, dz = z - h.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > h.reach2) continue;
    const t = 1 - smoothstep(0.25, 1, Math.sqrt(d2) / h.reach);
    if (t > w) w = t;
  }
  return w;
}

/** Peat: dark, fibrous, and it is what the whole surface is made of. */
function moorPeat(x, z) {
  return clamp01(fbm(x * 0.052 - 27.4, z * 0.052 + 41.9, 3) * 1.5 - 0.34);
}

/**
 * THE MOOR'S HEIGHT. No bank and no gates — that pair is a palisade's mound and
 * its openings, and there is no palisade here.
 *
 * The fighting floor still has to be a floor: `play.radius` is 18 and a man
 * fighting on a slope he cannot see is a bug, not terrain. So the relief is
 * held off until `MOOR_RELIEF_RADIUS` exactly as the village holds it off, and
 * what changes is what happens after — it starts two metres closer, climbs
 * harder, and there is no ring of spoil in the way of it.
 */
function moorHeightAt(x, z) {
  const r = Math.hypot(x, z);

  // Tussock. Coarser than the village's turf and twice the amplitude: heather
  // grows in clumps and the ground between them is not flat.
  let h = (fbm(x * 0.115 - 41.2, z * 0.115 + 63.8, 3) - 0.5) * 0.085;

  // The hollows, and they cut rather than dish: a peat bank has an edge.
  for (const p of MOOR_HOLLOWS) {
    const dx = x - p.x, dz = z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > p.reach2) continue;
    const d = Math.sqrt(d2) / p.reach;
    h -= p.depth * (1 - smoothstep(0.55, 1, d));
  }

  const out = smoothstep(MOOR_RELIEF_RADIUS - 2, MOOR_RELIEF_RADIUS + 5, r);

  // Rolling upland, harder and sooner than the village's.
  const rolling = (fbm(x * 0.021 + 12.9, z * 0.021 - 7.3, 4) - 0.5) * 2;
  h += rolling * (0.7 + 6.2 * smoothstep(24, 78, r)) * out;

  // And hills behind it. The village reads 19 m of ridged noise from 52 m out;
  // this reads 26 from 46, so the horizon is higher and nearer — which is the
  // difference between a settlement in a valley and a fight on high ground.
  h += (ridged(x * 0.0058 - 8.4, z * 0.0058 + 30.1, 3) - 0.26) * 26 * smoothstep(46, 150, r);

  return h;
}

/**
 * FOUR STANDING STONES, and they are solid.
 *
 * At 15.2 m they are inside the 18 m play disc, so a man can be driven into one
 * — which is the point of declaring them at all, and the same argument the
 * village's runestone was declared on. Set at the quarters rather than scattered
 * because a stone row is a thing people put up on purpose, and four of them read
 * as a circle the moment you turn.
 */
const MOOR_STONES = Object.freeze([0, 1, 2, 3].map((i) => {
  const a = (i / 4) * Math.PI * 2 + 0.38;
  return raisedStone({
    id: `moorstone${i}`,
    x: Math.cos(a) * 15.2, z: Math.sin(a) * 15.2,
    rot: a + Math.PI / 2 + (i % 2 ? 0.14 : -0.11),
    // Shorter and squatter than the village's carved slab: this is field
    // granite somebody stood on end, not a monument somebody dressed.
    span: 3.1, base: 1.55, lift: 1.6, radiusX: 0.54, radiusY: 1.5,
    taper: 0.3, lean: i % 2 ? 0.075 : -0.06,
    noise: noise2,
    why: "A standing stone. The Picts left thousands and the moor is where they stand; four at the quarters read as a circle from any bearing, and a man shoved into one stops.",
  });
}));

export const PICT_MOOR = {
  id: "pict_moor",
  name: "The Moor",

  // The village's, exactly. See the header.
  play: { shape: "disc", radius: 18 },
  spawn: { gap: 7.5, minRadius: 6, maxRadius: 12 },

  // A peat fire, not a bonfire: same geometry, because the sim and three
  // harnesses are written against a hazard of this radius at the middle, and
  // different in what the renderer makes of it.
  hazards: [
    { id: "peatfire", kind: "fire", x: 0, z: 0, radius: 2.0 },
  ],

  obstacles: MOOR_STONES,

  heightAt: moorHeightAt,

  field: {
    reliefRadius: MOOR_RELIEF_RADIUS,
    hollows: MOOR_HOLLOWS,
    stones: MOOR_STONES,
    wet: moorWet,
    peat: moorPeat,
  },
};


// ============================================================
// THE ROMAN FORT — the third ground, and the first with stone standing on it
// ============================================================
//
// `docs/MAPS.md` #3, in its own words: "enclosed, vertical and old… a ruined
// Roman fort the Saxons never rebuilt is the strongest candidate — it is
// historically exact for the period, it puts STONE in a game that is currently
// all timber and thatch, and broken walls give real sightline breaks in a game
// that has none." It is dealt to the BRITONS: the Romano-British are the
// people who still hold these places, mustering where their grandfathers'
// garrison stood — grey-green and slate is their livery for the same reason.
//
// WHAT IS DELIBERATELY THE SAME is the same list the moor kept, verbatim: the
// 18 m play disc, the village's spawn ring, one fire of radius 2.0 at the
// origin. Every one is load-bearing in the sim and the harnesses; a ground
// that moved them would be a ground AND a rebalance.
//
// WHAT IS DIFFERENT IS EVERYTHING A PLAYER SEES — and, for the first time,
// WALKS AROUND. Five broken curtain-wall segments stand ON the fighting floor
// at 15 m with breaches between them: cover, shove-targets and sightline
// breaks in one, each drawn from the same fourteen-point outline the server
// collides. Two column stumps of the principia stand further in. The fire is
// a garrison campfire on the flagged courtyard.

/**
 * FIVE WALL SEGMENTS, and the breaches between them are the doors.
 *
 * At 15.0 m they are inside the 18 m bound like the moor's stones, so a man
 * can be driven onto one — a wall you cannot be pinned against is scenery.
 * The bearings are irregular on purpose: a fort's curtain fell where it fell,
 * and even gaps would read as a colonnade. `wobbleY` is doubled against the
 * default because the TOP of each slab is the ruin — the broken course line
 * against the sky is the silhouette that says "fort" from any bearing.
 */
// AT 14.2 m AND NO LONGER — and the number is the ROUTER'S, not taste.
// The first cut stood the ring at 15.0 with half-widths to 2.95, which put the
// walls' outer corners at ~18.3 m: OUTSIDE the 18 m play bound. A corner a
// body cannot stand on is a corner `steerAroundSolids` rightly refuses, so
// the outer route around the three longest walls did not exist and five bot
// runs of 389 never arrived (solidtest --verbose named them: fortwall0/2/4 at
// oblique bearings). The module's own contract says a map must not build
// pockets it cannot plan; a wall end fused to the play ring IS one. Every
// corner now sits inside 17.3 m with margin for the waypoint's own rounding.
const FORT_WALLS = Object.freeze([
  { a: 0.30, hw: 2.55, hh: 1.62, lean: -0.028 },
  { a: 1.52, hw: 2.30, hh: 1.18, lean: 0.034 },
  { a: 2.78, hw: 2.60, hh: 1.70, lean: 0.018 },
  { a: 4.12, hw: 2.10, hh: 1.05, lean: -0.040 },
  { a: 5.30, hw: 2.45, hh: 1.44, lean: 0.024 },
].map((w, i) => raisedStone({
  id: `fortwall${i}`,
  x: Math.cos(w.a) * 14.2, z: Math.sin(w.a) * 14.2,
  rot: w.a + Math.PI / 2,
  radiusX: w.hw, wobbleX: 0.16,
  radiusY: w.hh, wobbleY: 0.42,
  depth: 0.92, bevel: 0.05, surfaceWobble: 0.05,
  taper: 0.10, lean: w.lean,
  span: w.hh * 2.05, base: w.hh, lift: w.hh + 0.12,
  noise: noise2,
  why: "A length of Roman curtain wall, still standing where the rest fell. It blocks sight and it blocks men: a fight in a ruin is a fight AROUND things, which no other ground offers, and a man shoved onto dressed stone stops.",
})));

/**
 * TWO PIER STUMPS of the principia's colonnade, further in at 9.3 m. Square in
 * section where the walls are long — a different solid to round at speed than
 * a wall is, and the one vertical accent inside the ring.
 */
const FORT_PIERS = Object.freeze([
  { a: 1.02 }, { a: 4.31 },
].map((c, i) => raisedStone({
  id: `fortpier${i}`,
  x: Math.cos(c.a) * 9.3, z: Math.sin(c.a) * 9.3,
  rot: c.a + (i ? 0.42 : -0.18),
  radiusX: 0.52, wobbleX: 0.10,
  radiusY: 0.78, wobbleY: 0.30,
  depth: 0.60, bevel: 0.04, surfaceWobble: 0.04,
  taper: 0.06, lean: i ? 0.03 : -0.02,
  span: 1.62, base: 0.78, lift: 0.92,
  noise: noise2,
  why: "A column pier of the headquarters building, broken at chest height. The one solid inside the wall ring: cover a duel can circle.",
})));

/** Where the rubble apron lies — the band under and just inside the walls. */
function fortRubble(x, z) {
  const r = Math.hypot(x, z);
  const band = smoothstep(11.8, 13.8, r) * (1 - smoothstep(15.8, 17.6, r));
  return band * (0.35 + 0.65 * fbm(x * 0.21 + 9.1, z * 0.21 - 4.4, 2));
}

/**
 * The fort stands on its own platform and the land FALLS AWAY outside the
 * walls — Roman engineers built on the rise and dug the ditch below. That is
 * the third ground's horizon answer: the village sits in a valley, the moor
 * climbs to near hills, the fort LOOKS DOWN over low country, so the breaches
 * frame distance rather than ground.
 */
function fortHeightAt(x, z) {
  const r = Math.hypot(x, z);

  // The flagged courtyard: near-flat, which after two turf grounds IS the
  // read. A few centimetres of settle, a worn dish toward the fire, and
  // slab-edge dips where the joints opened.
  let h = (fbm(x * 0.14 + 24.6, z * 0.14 - 51.2, 2) - 0.5) * 0.05;
  h -= 0.05 * (1 - smoothstep(0, 6.5, r));
  h -= 0.06 * smoothstep(0.60, 0.80, fbm(x * 0.34 - 7.7, z * 0.34 + 18.9, 2)) * (1 - smoothstep(12, 14, r));

  // The rubble apron climbs to the wall foot.
  h += fortRubble(x, z) * (0.24 + (fbm(x * 0.45 + 2.2, z * 0.45 + 6.0, 2) - 0.5) * 0.30);

  // Off the platform: a 2.4 m fall over eight metres, with the ditch cut into
  // it. Both start OUTSIDE the play bound, so no fight is decided by them.
  const off = smoothstep(18.5, 26.5, r);
  h -= 2.4 * off;
  h -= 0.75 * smoothstep(19.5, 21.5, r) * (1 - smoothstep(22.5, 24.5, r));

  // Low country, gently rolling, and a far ridge kept LOW: 9 m where the moor
  // reads 26 — the long view is the point.
  h += (fbm(x * 0.017 - 31.5, z * 0.017 + 12.8, 4) - 0.5) * 1.9 * smoothstep(26, 58, r);
  h += (ridged(x * 0.0051 + 17.3, z * 0.0051 - 9.6, 3) - 0.26) * 9 * smoothstep(84, 190, r);

  return h;
}

export const ROMAN_FORT = {
  id: "roman_fort",
  name: "The Old Fort",

  // The village's, exactly. See the header above FORT_WALLS.
  play: { shape: "disc", radius: 18 },
  spawn: { gap: 7.5, minRadius: 6, maxRadius: 12 },

  // A garrison campfire on the flags: the sim's fire, radius 2.0 at the
  // middle, because the burn path and three harnesses are written on it.
  hazards: [
    { id: "campfire", kind: "fire", x: 0, z: 0, radius: 2.0 },
  ],

  obstacles: [...FORT_WALLS, ...FORT_PIERS],

  heightAt: fortHeightAt,

  field: {
    walls: FORT_WALLS,
    piers: FORT_PIERS,
    rubble: fortRubble,
  },
};

// ============================================================
// THE WINTER CAMP — the fourth ground, and the Danelaw's own
// ============================================================
//
// The Great Army wintered behind water: a D-shaped earthwork with its flat
// side on the river, the ships drawn up inside it — Repton, 873-4, is the
// excavated one. That is this ground: a camp floor inside a bank, a FROZEN
// fen running flat to the horizon on every side, the river reach iced over
// where the D opens, and ONE ship beached on the fighting floor. After a
// valley, a climb and a platform, this horizon is the fourth answer: LEVEL.
// Flat water country under a wide sky, the longest sightlines in the game.
//
// WHAT IS DELIBERATELY THE SAME is the invariant list, verbatim: the 18 m
// play disc, the village's spawn ring, one fire of radius 2.0 at the origin.
//
// THE ONE SOLID IS THE SHIP. A beached longship at 11.8 m: nine metres of
// hull a fight flows around, the one thing on any ground a man can be pinned
// against that his own people SAILED HERE. One convex solid, ends well inside
// the play ring — the router's law from the fort applies and is satisfied by
// construction (far corner at 12.7 m).

/** Which way the river lies: the D's flat side, and the ship points at it. */
const CAMP_RIVER_A = 3.85;
const CAMP_RIVER_UX = Math.cos(CAMP_RIVER_A);
const CAMP_RIVER_UZ = Math.sin(CAMP_RIVER_A);

const DANE_SHIP = raisedStone({
  id: "daneship",
  x: Math.cos(CAMP_RIVER_A) * 11.8, z: Math.sin(CAMP_RIVER_A) * 11.8,
  // Broadside to the shore, as a hull hauled out lies.
  rot: CAMP_RIVER_A + Math.PI / 2,
  radiusX: 4.6, wobbleX: 0.08,
  radiusY: 0.72, wobbleY: 0.10,
  depth: 2.3, bevel: 0.06, surfaceWobble: 0.03,
  // The taper is the boat: an ellipse pulled hard toward its ends reads as a
  // hull in plan, and the collision IS the plan.
  taper: 0.30, lean: 0.0,
  span: 1.9, base: 0.85, lift: 0.95,
  noise: noise2,
  why: "A longship hauled out for the winter. Nine metres of clinker hull on the fighting floor: cover, a shove-target, and the one obstacle in the game that says whose camp this is.",
});

/**
 * The earthwork, as a factor 0..1: how much bank stands at this bearing and
 * radius. The D-shape is the subtraction — the bank dies where the river
 * takes over, because the water WAS that side's defence.
 */
function campBank(x, z) {
  const r = Math.hypot(x, z);
  if (r < 17.8 || r > 27.5) return 0;
  const inv = 1 / Math.max(r, 0.001);
  const toward = (x * CAMP_RIVER_UX + z * CAMP_RIVER_UZ) * inv;
  const open = smoothstep(0.45, 0.85, toward);
  // The toe of the bank starts AT the play bound, not a metre past it — the
  // owner's report (24 Aug 2026): a body clamps at 18 m, and on the first cut
  // nothing marked that line, so the edge of the fight was an invisible wall.
  // Now the ground itself starts rising under a man's feet exactly where the
  // sim stops him: he reads "the bank stopped me", which is what a camp's
  // bank is FOR. The crest stays outside at 20.6.
  const band = smoothstep(18.3, 20.6, r) * (1 - smoothstep(21.8, 24.6, r));
  return band * (1 - open);
}

/**
 * Standing water, as a mask 0..1 — and in this season it is ICE. The fen
 * holds sheets wherever the peat dips, and the river reach is one sheet.
 * Shared with the renderer, which paints ice where the sim keeps a level
 * floor; the sheets all sit at one water table, as water does.
 */
function campWater(x, z) {
  const r = Math.hypot(x, z);
  const inv = 1 / Math.max(r, 0.001);
  const toward = (x * CAMP_RIVER_UX + z * CAMP_RIVER_UZ) * inv;
  // The river reach: past the bank line on the open bearing, all water.
  const river = smoothstep(0.45, 0.75, toward) * smoothstep(19, 24, r);
  // Fen sheets: broad patches, only outside the earthwork.
  const sheet = smoothstep(0.50, 0.60, fbm(x * 0.031 + 8.8, z * 0.031 - 19.3, 3)) * smoothstep(21, 26, r);
  return clamp01(Math.max(river, sheet));
}

/**
 * THE CAMP'S HEIGHT. The floor is trodden flat — an army lived on it all
 * winter — the bank rises outside the play bound, and beyond it the land
 * does the one thing no other ground does: NOTHING. Flat fen at the frozen
 * water table, out to a horizon kept almost on the floor.
 */
function campHeightAt(x, z) {
  const r = Math.hypot(x, z);

  // Trodden ground: finer and flatter than any turf, rutted rather than
  // tussocked.
  let h = (fbm(x * 0.16 + 51.7, z * 0.16 - 33.1, 2) - 0.5) * 0.05;
  h -= 0.04 * (1 - smoothstep(0, 5.5, r));

  // The earthwork, and the borrow ditch outside it that built it.
  const bank = campBank(x, z);
  h += 1.45 * bank;
  {
    const inv = 1 / Math.max(r, 0.001);
    const toward = (x * CAMP_RIVER_UX + z * CAMP_RIVER_UZ) * inv;
    const open = smoothstep(0.45, 0.85, toward);
    h -= 0.55 * smoothstep(24.6, 25.8, r) * (1 - smoothstep(26.6, 28.4, r)) * (1 - open);
  }

  // Off the camp: down to the fen. Gentle, and it starts outside the bound.
  h -= 0.5 * smoothstep(20, 30, r);

  // The fen itself: peat hummocks where it is dry ...
  const w = campWater(x, z);
  h += (fbm(x * 0.045 - 61.2, z * 0.045 + 27.9, 3) - 0.5) * 0.34 * smoothstep(22, 30, r) * (1 - w);
  // ... and dead level where it is ice: one water table, every sheet.
  h = h * (1 - w) + (-0.62) * w;

  // The horizon: a low willow carr line far out, and no more. 2.2 m where the
  // fort reads 9 and the moor 26 — the LEVEL is the identity.
  h += (ridged(x * 0.0046 + 5.1, z * 0.0046 - 14.7, 3) - 0.26) * 2.2 * smoothstep(120, 210, r) * (1 - w);

  return h;
}

export const DANELAW_CAMP = {
  id: "danelaw_camp",
  name: "The Winter Camp",

  // The village's, exactly. See the header.
  play: { shape: "disc", radius: 18 },
  spawn: { gap: 7.5, minRadius: 6, maxRadius: 12 },

  // The army's fire on the trodden floor: the sim's fire, radius 2.0 at the
  // middle, because the burn path and three harnesses are written on it.
  hazards: [
    { id: "campfire", kind: "fire", x: 0, z: 0, radius: 2.0 },
  ],

  obstacles: [DANE_SHIP],

  heightAt: campHeightAt,

  field: {
    ship: DANE_SHIP,
    riverAngle: CAMP_RIVER_A,
    bank: campBank,
    water: campWater,
  },
};

/** Every ground the game knows, by the id that travels on the wire. */
export const GROUNDS = {
  saxon_village: SAXON_VILLAGE,
  pict_moor: PICT_MOOR,
  roman_fort: ROMAN_FORT,
  danelaw_camp: DANELAW_CAMP,
};

/** The ground a room gets when nobody has chosen one. */
export const DEFAULT_GROUND_ID = "saxon_village";

/**
 * WHICH GROUND A TERRITORY IS FOUGHT ON.
 *
 * Sixteen territories currently share one arena, so Deira looks exactly like
 * Dyfed and taking ground reads as a number changing rather than as a campaign.
 * `docs/BACKLOG.md` 5.7b is the fix and it is a big one — a ground is a
 * `GroundSpec` here plus a `GroundDef` in the renderer, and the seam for that
 * already exists (`registerGround`; `world.ts`'s header states a new ground
 * "does not touch this file").
 *
 * THIS IS THE PLUMBING, AND IT IS DELIBERATELY BORING. Every territory resolves
 * through one table to a ground id, and today every entry resolves to the
 * village — which changes nothing a player sees and makes the next ground a
 * one-line edit rather than a hunt through `engine.mjs` for two hard-coded
 * strings. `tools/warsay.mjs` asserts that every territory `war.mjs` knows
 * resolves to a ground `GROUNDS` has, so a ground added here and forgotten in
 * the renderer cannot ship as a fallback nobody noticed.
 *
 * Keyed by PEOPLE rather than by territory id: the thing that should make one
 * ground differ from another is whose country it is, and sixteen entries that
 * all had to be edited together would be sixteen chances to miss one.
 */
export const GROUND_BY_PEOPLE = Object.freeze({
  saxon: "saxon_village",
  // The Great Army musters where it wintered: behind the bank, beside the
  // ships. See `DANELAW_CAMP`.
  norse: "danelaw_camp",
  // West of the dyke the muster is where the garrison stood. See `ROMAN_FORT`.
  briton: "roman_fort",
  // North of the Forth there is no village to muster in. See `PICT_MOOR`.
  pict: "pict_moor",
});

/**
 * The ground for a territory's people, falling back rather than throwing —
 * same argument as `getGround`: a disagreement about what exists should drop
 * everyone into the village, not into a crash.
 */
export function groundForPeople(people) {
  const id = GROUND_BY_PEOPLE[people];
  return id && GROUNDS[id] ? id : DEFAULT_GROUND_ID;
}

/**
 * A ground by id, falling back rather than throwing. An unknown id reaching
 * here means a client and a server disagree about what exists, and dropping
 * everyone into the village is a better answer to that than a crash.
 */
export function getGround(id) {
  return GROUNDS[id] ?? SAXON_VILLAGE;
}
