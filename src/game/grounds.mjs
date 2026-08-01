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
// one description. `engine.mjs` used to carry a hand-copy of the renderer's
// terrain field with a comment asking the next person to re-copy it if the
// field was ever re-cut — which is a promise nothing can keep across three
// grounds. It imports this instead.
//
// Nothing here may import three.js, or the server cannot load it. That is the
// whole constraint, and it is why the noise kit lives at the top of this file
// rather than in the renderer: a height field is arithmetic, and arithmetic is
// the part both sides need.
// ============================================================

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

  // Standing geometry a spawn or a path may not be solved into. Empty here:
  // the village's only obstruction is the fire, which is already a hazard, and
  // everything else stands outside the play radius. A ground with broken walls
  // across its floor fills this in.
  obstacles: [],

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

/** Every ground the game knows, by the id that travels on the wire. */
export const GROUNDS = {
  saxon_village: SAXON_VILLAGE,
};

/** The ground a room gets when nobody has chosen one. */
export const DEFAULT_GROUND_ID = "saxon_village";

/**
 * A ground by id, falling back rather than throwing. An unknown id reaching
 * here means a client and a server disagree about what exists, and dropping
 * everyone into the village is a better answer to that than a crash.
 */
export function getGround(id) {
  return GROUNDS[id] ?? SAXON_VILLAGE;
}
