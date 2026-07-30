// Arena construction: terrain, settlement, palisade, fire, and the props that
// tell the moot's story.
//
// Everything static in the frame is built here once and hung off a single root
// group, so the whole arena is one add and one remove. The only per-frame work
// is fire, banners and the fire lights, driven off cached references rather
// than a scene-wide traverse — the traverse used to walk every warrior's ~60
// meshes looking for two names.
//
// Three ideas hold the rest of the file together.
//
// One: the ground is a single analytic height field, `groundHeight`. Terrain
// vertices, every prop's footing and the puddle basins all read from it, which
// is the only reason nothing floats and nothing is buried. It is deliberately
// flat to within ~5 cm inside the palisade — the server sim is 2-D at y = 0 and
// a warrior's boots are placed there — so interior relief is carried by colour,
// normals and shadow rather than by displacement, and the real landform starts
// at the earthwork and runs out to the downs.
//
// Two: repeated geometry is instanced and merged per material. A hut is not
// eighty meshes; it is four merged geometries (timber, daub, thatch, the dark
// behind the doorway) instanced across the whole village, and a tree is two (bark
// and leaf) however many times it forks. Three hundred palisade stakes are one
// draw. That is where the triangle and draw-call budget went instead of into
// unique meshes nobody can tell apart at 30 m.
//
// Four: nothing beyond the earthwork is inside the key light's shadow cascade,
// which is 24 m wide and follows the fight. The settlement and the wood
// therefore carry their own shading in their vertex colours — the band under an
// eave, the gable that lives in permanent shade, the step behind a course of
// straw. See `shade()`. Materials that read those colours are patched here and
// restored on dispose, and every geometry wearing one has to have them.
//
// Three: UVs are box-projected from world space on anything built out of boxes,
// so a 4 m wall plate and a 0.2 m peg carry the same texel density. BoxGeometry's
// own 0..1-per-face UVs stretch the first and tile the second, and §2 of the bar
// scores exactly that.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FrameContext, Mood, QualitySettings } from "./quality";
import type { MaterialLibrary } from "./materials";

export interface WorldOptions {
  /**
   * Prop scatter source. Defaults to a fixed seed, so the arena lays out the
   * same way on every load and two capture runs are comparable — an A/B against
   * art/shots/baseline is worthless if the rocks moved. Pass Math.random for a
   * different moot each match.
   */
  rng?: () => number;
}

/** Fixed-seed PRNG. The seed is arbitrary; that it never changes is the point. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface WorldHandle {
  readonly root: THREE.Group;
  /** Terrain mesh, for camera collision and decal projection later. */
  readonly ground: THREE.Mesh;
  /** Fire lights that belong to props. Owned here, tuned by whoever grades the frame. */
  readonly pointLights: readonly THREE.PointLight[];
  /**
   * Ground height under a world-space point. The same field the terrain was
   * built from, so anything a caller places with it lands on the surface rather
   * than near it. Cheap enough to call per frame; it is pure arithmetic.
   */
  heightAt(x: number, z: number): number;
  setMood(mood: Mood): void;
  update(dt: number, ctx: FrameContext): void;
  dispose(): void;
}

const TAU = Math.PI * 2;

const ARENA_RADIUS = 21.5;
const PALISADE_RADIUS = 19.6;
const TORCH_RADIUS = 18.2;
/** Terrain runs to here — inside the camera's 200 m far plane, past the fog. */
const TERRAIN_RADIUS = 176;
/** 1.6 m per repeat of the ground detail map, given the catalog's 22× tiling. */
const GROUND_UV = 1 / 35.2;

/**
 * Nothing at boot height goes inside this radius but the fire, which is the
 * arena's centrepiece and carries its own ring of hearth stones to say so.
 *
 * There is no prop collision anywhere in the stack — the server sim is 2-D and
 * knows about warriors and the arena bound, nothing else — so a prop standing
 * inside the fighting circle is not a *risk* of clipping, it is a guarantee of
 * it. The brawl preset stands eight warriors on a 4.2 m circle and a spear adds
 * most of two metres to that; `brawl` is the shot that has to prove crowd
 * readability, and it was proving it with a warrior's shins inside a woodpile.
 *
 * This is the cheap half of the fix. The other half is a real obstacle radius in
 * the sim, which is not this module's to add.
 *
 * Measured since: nothing this module places is inside a warrior in `brawl` —
 * the fire's widest geometry reaches 2.0 m and the nearest spawn is 4.2. What
 * the panel read as legs through the fire is the *camera*: the brawl ring puts
 * a warrior at (0, −4.2), and the follow rig sits at (−1, 2.05, 8.9), so he
 * stands on the arena's own axis 31 px from the flame column and his shins
 * arrive in its white core. The half of that this file can answer is that the
 * fire had a hole in it at exactly that height — see the bonfire's core.
 */
const CLEAR_RADIUS = 6.2;

/** Where the tracks in and out of the moot cross the earthwork. */
const GATE_ANGLES = [0.42, 2.55, 4.55];
/** The gate proper — a break in the palisade with posts and a lintel. */
const GATE_MAIN = GATE_ANGLES[0];

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
 */
interface Puddle {
  x: number;
  z: number;
  /** Semi-axis along `rot`, in metres. */
  a: number;
  /** Semi-axis across it. */
  b: number;
  rot: number;
  /** Standing depth at the centre. The basin beneath is deeper — see WATER_FILL. */
  depth: number;
  /** Derived once: `heightAt` is on the per-frame path and this is its inner loop. */
  cos: number;
  sin: number;
  /** Squared world distance past which this puddle contributes nothing measurable. */
  reach2: number;
}

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

function puddle(x: number, z: number, a: number, b: number, rot: number, depth: number): Puddle {
  // 2.2 rim-radii out the Gaussian below is at 4e-4 — under a tenth of a
  // millimetre of carve, and nothing the eye can find in the damp mask.
  const reach = (Math.max(a, b) + WET_MARGIN) * 2.2;
  return { x, z, a, b, rot, depth, cos: Math.cos(rot), sin: Math.sin(rot), reach2: reach * reach };
}

/** Where a gate track crosses radius `r`, wander included — see `pathMask`. */
function trackAt(gate: number, r: number): { x: number; z: number; th: number } {
  const th = gate + Math.sin(r * 0.26 + gate * 3.1) * 0.1;
  return { x: Math.cos(th) * r, z: Math.sin(th) * r, th };
}

/**
 * The pair of ruts a cart's wheels cut into a track. Derived from the track
 * rather than written out as coordinates, so ruts stay in the wheel-line if the
 * gates ever move; a rut beside its own path is worse than no rut.
 */
function ruts(gate: number, r: number, half: number, a: number, b: number, depth: number): Puddle[] {
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
function dripLine(bearing: number, r: number, a: number, b: number, depth: number): Puddle {
  return puddle(Math.cos(bearing) * r, Math.sin(bearing) * r, a, b, bearing + Math.PI / 2, depth);
}

const PUDDLES: readonly Puddle[] = [
  // Cart ruts on the three tracks. Radii chosen so each pair lands in a frame
  // that wants water — the main gate's beside the duel, the north-west track's
  // behind the character shots' subject rather than under him, the south's
  // where the last stand is fought — and so none of them lands under a boot.
  ...ruts(GATE_ANGLES[0], 9.0, 0.66, 1.7, 0.25, 0.021),
  ...ruts(GATE_ANGLES[1], 10.0, 0.65, 1.6, 0.24, 0.019),
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
  puddle(9.35, -5.35, 1.2, 0.95, 0.85, 0.030),
  puddle(-4.1, -2.2, 0.85, 0.6, 2.15, 0.024),
  puddle(4.05, -1.6, 0.72, 0.55, -0.55, 0.021),
  puddle(-2.6, 4.4, 0.85, 0.62, -0.9, 0.023),
  puddle(-9.6, -9.4, 1.15, 0.9, 0.3, 0.027),
];

// ---------------------------------------------------------------------------
// Noise. Value noise off an integer lattice, hashed — no tables, no allocation,
// deterministic across reloads and independent of the prop rng's call order, so
// changing the scatter never moves the ground under it.
// ---------------------------------------------------------------------------

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function hash2(ix: number, iy: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function noise2(x: number, y: number): number {
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
function fbm(x: number, y: number, octaves: number): number {
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
function ridged(x: number, y: number, octaves: number): number {
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

// ---------------------------------------------------------------------------
// The ground itself
// ---------------------------------------------------------------------------

/**
 * 0..1 where the turf has been walked off. Three tracks converge on the fire
 * from the gates, a ring is worn where the crowd stands back, and the centre is
 * bare. Everything about the ground's colour hangs off this.
 */
function pathMask(x: number, z: number, r: number): number {
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
function churnMask(x: number, z: number, r: number): number {
  const n = fbm(x * 0.15 + 41.3, z * 0.15 + 7.9, 3);
  return clamp01((1 - smoothstep(3.5, 15, r)) * (0.35 + n * 1.1));
}

/**
 * Distance from a puddle's centre in rim-radii: 1 on the rim, whatever the
 * puddle's shape or orientation. `grow` widens both axes by a distance in
 * metres, which is how the damp margin can be a constant width around water
 * that runs from a 0.25 m rut to a 1.2 m hollow.
 */
function puddleDist(p: Puddle, x: number, z: number, grow: number): number {
  const dx = x - p.x;
  const dz = z - p.z;
  const u = (dx * p.cos + dz * p.sin) / (p.a + grow);
  const v = (dz * p.cos - dx * p.sin) / (p.b + grow);
  return Math.sqrt(u * u + v * v);
}

/**
 * 0..1 proximity to standing water. The same falloff the basins are carved
 * with, so the dark wet ring, the surface of the puddle and the wet sheen in
 * the terrain shader are all reading one function and cannot drift apart.
 */
function basinWet(x: number, z: number): number {
  let w = 0;
  for (const p of PUDDLES) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz > p.reach2) continue;
    const d = puddleDist(p, x, z, WET_MARGIN);
    // Graded by depth: a 14 mm drip line has not saturated the ground around it
    // the way a 30 mm hollow has, and giving every puddle the same near-black
    // margin is how a list of small water turns into a field of dark stains.
    const n = Math.exp(-d * d * 1.1) * (0.66 + 0.34 * (p.depth / DEEPEST_WATER));
    if (n > w) w = n;
  }
  return w;
}

/**
 * The one height field. Inside the palisade it stays within about 5 cm of zero,
 * because the server places boots at y = 0 and a 20 cm hollow there is a warrior
 * standing in mid-air. Outside, the moot sits inside a bank-and-ditch earthwork
 * that runs out into rolling turf and then downland — which is what stops the
 * arena reading as a disc drawn on a plain.
 */
function groundHeight(x: number, z: number): number {
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
  const out = smoothstep(ARENA_RADIUS - 2, ARENA_RADIUS + 4, r);

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

// Ground palette. These are the arena's art direction as much as the material
// catalog is: Anglo-Saxon Britain in late summer, which is turf gone dry at the
// tips, bare earth on the tracks, and churned mud where the moot has been
// standing on it all evening. Nothing here is sand.
// These carry more chroma than a photograph of turf would, and deliberately.
// Everything that reaches this ground is warm — a low sun, a bonfire, the
// hemisphere's own earth bounce and an environment map convolved from an ember
// horizon — so an albedo authored at the green a meter would read comes back
// with its green cancelled and the field renders as trampled dust. The turf is
// pushed toward the green side of what is plausible so that what *arrives* is
// plausible. Change the light rig and these have to move with it.
const C_TURF_SHADE = new THREE.Color(0x33471a);
const C_TURF = new THREE.Color(0x4d6a22);
const C_TURF_DRY = new THREE.Color(0x7d7635);
const C_EARTH = new THREE.Color(0x5e4e35);
const C_MUD = new THREE.Color(0x3d3122);
const C_MUD_WET = new THREE.Color(0x201a12);
// Chalk is the brightest thing on the ground and it was the brightest thing in
// the arena — a pale scuff ring reading as bare sand across the middle of every
// frame. It is a scuff, so it is turf-coloured dirt with the chalk showing
// through it, not a chalk floor.
const C_CHALK = new THREE.Color(0x8e8770);
const C_HEATH = new THREE.Color(0x424630);

function groundColor(x: number, z: number, y: number, out: THREE.Color): void {
  const r = Math.hypot(x, z);
  const big = fbm(x * 0.033 + 61.1, z * 0.033 - 22.4, 3);
  const mid = fbm(x * 0.135 - 8.2, z * 0.135 + 31.6, 3);
  const fine = noise2(x * 0.85 + 4.4, z * 0.85 - 12.1);

  out.copy(C_TURF_SHADE).lerp(C_TURF, clamp01(big * 1.7 - 0.25));
  out.lerp(C_TURF_DRY, clamp01((mid - 0.4) * 1.9));

  const path = pathMask(x, z, r);
  out.lerp(C_EARTH, clamp01(path * (0.5 + fine * 0.7)));

  const churn = churnMask(x, z, r);
  out.lerp(C_MUD, clamp01(churn * (0.55 + mid * 0.8)));

  // Wet where the ground is low. The same falloff the basins are carved with,
  // so the dark ring lands exactly on the rim of the water.
  out.lerp(C_MUD_WET, clamp01(basinWet(x, z) * 0.9));

  // Chalk showing through where a boot has taken the turf off the track. It is
  // the brightest thing on the ground and it is doing real work: without it the
  // whole field sits inside three luma buckets and reads as one flat tone.
  const grit = noise2(x * 2.6 - 19.4, z * 2.6 + 7.7);
  out.lerp(C_CHALK, clamp01((fine * 0.5 + grit * 0.5 - 0.66) * 3.2) * Math.max(path * 0.7, churn * 0.3));

  // Past the ditch the turf is unbroken; the downs go to heather and bracken.
  out.lerp(C_HEATH, smoothstep(44, 130, r) * 0.8);

  // Two brightness terms, and between them they are what stops the ground being
  // one value. A long-wavelength drift for the sweep of the field, and a cheap
  // curvature term so hollows hold shadow and the bank's crest catches light —
  // not an AO pass, but it is what makes the earthwork read once the fog has
  // taken the contrast out of it.
  out.multiplyScalar(0.7 + 0.66 * fbm(x * 0.024 - 44.2, z * 0.024 + 12.8, 2));
  out.multiplyScalar(1 + clamp01(y * 0.45) * 0.12 - clamp01(-y * 2.6) * 0.18);
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * A box, already placed. Z then Y, so `rz` is the lean a brace or a rafter has
 * and `ry` decides which wall that lean belongs to.
 */
function bx(
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  rz = 0, ry = 0,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/**
 * World heading for something that should face the moot. A mesh rotated by this
 * about Y has its local +Z pointing at the origin and its local +X tangential —
 * which is the whole reason huts have doors on the right side and shield racks
 * stand broadside.
 */
const facing = (x: number, z: number) => Math.atan2(-x, -z);

/**
 * Box-projects UVs from world position, so texel density does not depend on how
 * big the box is. `scale` is 1/repeat of the material that will wear it, which
 * lands one texture tile per metre.
 */
function projectUv(g: THREE.BufferGeometry, scale: number): void {
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i));
    const ny = Math.abs(n.getY(i));
    const nz = Math.abs(n.getZ(i));
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) { u = p.getX(i); v = p.getZ(i); }
    else if (nx >= nz) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

function mergeInto(parts: THREE.BufferGeometry[], uvScale?: number): THREE.BufferGeometry {
  if (uvScale !== undefined) for (const p of parts) projectUv(p, uvScale);
  // mergeGeometries refuses a mixed batch, and ExtrudeGeometry — the gable
  // infill, the runestone's outline — is the one primitive three hands back
  // without an index. Flattening the indexed ones is cheaper than discovering
  // it as a console error and a missing wall.
  let list = parts;
  if (parts.some((p) => p.index) && parts.some((p) => !p.index)) {
    list = parts.map((p) => {
      if (!p.index) return p;
      const flat = p.toNonIndexed();
      p.dispose();
      return flat;
    });
  }
  const merged = mergeGeometries(list, false);
  if (!merged) return list[0];
  for (const p of list) p.dispose();
  return merged;
}

/**
 * Triangulates a `rows × cols` vertex grid. `flip` reverses the winding, which
 * is not a nicety: whether row-major order runs clockwise depends on which way
 * the surface was swept, and a grid wound the wrong way is invisible under a
 * FrontSide material rather than merely mis-shaded.
 */
function gridIndices(rows: number, cols: number, out: number[], flip = false): void {
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (flip) out.push(a, b, c, b, d, c);
      else out.push(a, c, b, b, c, d);
    }
  }
}

/**
 * Baked shading, written as a vertex colour.
 *
 * Nothing in the settlement or the wood is inside the key light's shadow
 * cascade — that is 24 m wide and centred on the fight, and the huts start at
 * 27 m — so an eave that ought to lay a shadow across the wall beneath it
 * cannot, and a building whose own geometry never darkens anything reads as a
 * painted slab however many members are in its frame. The shadow therefore has
 * to travel in the vertices.
 *
 * A shadow here is also not merely darker. The only fill a shaded wall gets at
 * dusk is the sky; what lights the rest of it is a low sun and a bonfire. So
 * the term shifts cool as it darkens and warm as it brightens, and that split is
 * most of what stops the settlement rendering as one flat tan.
 *
 * Callers must keep the mean near 1: materials.ts divides a requested colour by
 * its map's mean so `map × color` lands on the catalog value, and a vertex
 * colour multiplies on top of that without being compensated for.
 */
function bakedTone(s: number, out: number[]): void {
  const k = 1 - s;
  out.push(s * (1 - k * 0.07), s * (1 + k * 0.04), s * (1 + k * 0.26));
}

function shade(
  g: THREE.BufferGeometry,
  fn: (x: number, y: number, z: number) => number,
): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  const col: number[] = [];
  for (let i = 0; i < p.count; i++) {
    bakedTone(Math.max(0, Math.min(1.5, fn(p.getX(i), p.getY(i), p.getZ(i)))), col);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** A point on a swept path. Plain objects, because a tree is built once. */
interface Pt { x: number; y: number; z: number }

/**
 * Sweeps a ring of `sides` vertices along `path`, one radius per station, with a
 * frame that is parallel-transported so the bark does not spin where a limb
 * bends. This is what a branch is, and it is why the treeline needed it: a
 * cylinder cannot taper into a fork and a cylinder cannot curve, and those two
 * things are the whole difference between a tree and a stick.
 *
 * `vScale` is texture repeats per unit of swept length; u runs once round the
 * circumference. Both ends are left open — a limb's base is inside its parent
 * and its tip is inside a leaf clump, and neither hole is ever in frame.
 */
function tube(path: Pt[], radii: number[], sides: number, vScale: number): THREE.BufferGeometry {
  const rings = path.length;
  const pos = new Float32Array(rings * (sides + 1) * 3);
  const uv = new Float32Array(rings * (sides + 1) * 2);
  // Reference vector for the transport frame, re-orthogonalised at every ring.
  let rx = 0.7071;
  let ry = 0;
  let rz = 0.7071;
  let v = 0;
  let k = 0;
  for (let i = 0; i < rings; i++) {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(rings - 1, i + 1)];
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    let tz = b.z - a.z;
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    let dot = rx * tx + ry * ty + rz * tz;
    rx -= tx * dot; ry -= ty * dot; rz -= tz * dot;
    let rl = Math.hypot(rx, ry, rz);
    if (rl < 1e-3) {
      // The frame has collapsed onto the tangent. Any other axis will do.
      rx = ty; ry = tz; rz = tx;
      dot = rx * tx + ry * ty + rz * tz;
      rx -= tx * dot; ry -= ty * dot; rz -= tz * dot;
      rl = Math.hypot(rx, ry, rz) || 1;
    }
    rx /= rl; ry /= rl; rz /= rl;
    // t × r, unit because both are unit and perpendicular.
    const sx = ty * rz - tz * ry;
    const sy = tz * rx - tx * rz;
    const sz = tx * ry - ty * rx;
    if (i > 0) {
      const q = path[i - 1];
      v += Math.hypot(path[i].x - q.x, path[i].y - q.y, path[i].z - q.z) * vScale;
    }
    for (let j = 0; j <= sides; j++) {
      const th = (j / sides) * TAU;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const r = radii[i];
      pos[k * 3] = path[i].x + (rx * c + sx * s) * r;
      pos[k * 3 + 1] = path[i].y + (ry * c + sy * s) * r;
      pos[k * 3 + 2] = path[i].z + (rz * c + sz * s) * r;
      uv[k * 2] = j / sides;
      uv[k * 2 + 1] = v;
      k++;
    }
  }
  // Rows sweep along the path and columns run round it counter-clockwise about
  // the tangent, which puts the default winding inside the tube.
  const idx: number[] = [];
  gridIndices(rings, sides + 1, idx, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Marks a point in the arena as something burning, for vfx.ts to hang a flame
 * on. This module owns *where* the fires are — it built the woodpile and the
 * torch cups — and vfx.ts owns what a flame looks like, which is the only way
 * either of them gets it right: a mesh silhouette cannot boil, and a particle
 * system has no business knowing the palisade radius.
 *
 * An empty transform rather than a mesh, because everything visible about the
 * fire is drawn in vfx's own instanced layer. What stays here is the fuel, the
 * coal bed and the point light.
 */
function fireMarker(
  x: number, y: number, z: number,
  radius: number, height: number,
  kind: "bonfire" | "torch",
): THREE.Object3D {
  const marker = new THREE.Object3D();
  marker.position.set(x, y, z);
  marker.userData.vfxFire = { radius, height, kind };
  return marker;
}

// ---------------------------------------------------------------------------
// Trees
//
// A tree out here is seen against a sky several stops brighter than it is, so
// what it *is*, visually, is an outline. Everything below spends on that
// outline and almost nothing on interior detail: a bole that tapers, flares at
// the root and wanders off plumb; limbs that fork out of it and carry the eye
// outward; and a crown assembled from two dozen spiked clumps hung on the
// branch tips, so the edge is serrated and there is sky visible through the
// middle of it. A convex blob on a pole has none of those properties and no
// amount of texture on it ever will.
//
// Species are built once each, at unit height, and instanced with a *uniform*
// scale — uniform because a non-uniform one shears the normals — which is why
// a taller tree here is also a thicker one, the way it is in a wood.
// ---------------------------------------------------------------------------

interface TreeSpec {
  /** Clear bole before the crown starts, as a fraction of height. */
  bole: number;
  /** Bole radius at the ground, as a fraction of height. */
  girth: number;
  /** How far the bole's head wanders off its root, as a fraction of height. */
  sweep: number;
  /** Limbs at the first fork. */
  limbs: number;
  /** Times a limb divides after that. 1 for the treeline, 2 for a near tree. */
  depth: number;
  /** Divergence of a child limb from its parent, in radians. */
  diverge: number;
  /** First-limb length, as a fraction of height. */
  reach: number;
  /** Per-segment upward (+) or drooping (−) bias along a limb. */
  lift: number;
  /** Leaf clump radius, as a fraction of height. */
  clump: number;
  /** Clump squash: under 1 spreads the crown, over 1 draws it up. */
  aspect: number;
  /** Whorled tiers up a single leader instead of a forked crown. */
  conifer?: boolean;
  /** Where the lowest whorl sits, as a fraction of height. Conifers only. */
  crownBase?: number;
  /** Dead: snapped limbs, no leaf at all. */
  dead?: boolean;
}

/**
 * One mass of foliage. Spiked rather than smoothed, on purpose: the only thing
 * a clump contributes at range is the serration it puts in the crown's edge,
 * and a subdivided sphere contributes none of that for four times the triangles.
 * Three different solids, so no two neighbouring clumps share an outline.
 */
function leafClump(r: number, flat: number, rand: () => number): THREE.BufferGeometry {
  const pick = rand();
  const g = pick < 0.44
    ? new THREE.OctahedronGeometry(1, 0)
    : pick < 0.88
      ? new THREE.IcosahedronGeometry(1, 0)
      : new THREE.TetrahedronGeometry(1, 0);
  const p = g.attributes.position as THREE.BufferAttribute;
  const ox = rand() * 37;
  const oz = rand() * 53;
  for (let i = 0; i < p.count; i++) {
    // Keyed off position alone, so the duplicated vertices of a non-indexed
    // solid all move together and the clump stays closed.
    const n = 0.62 + noise2(p.getX(i) * 2.7 + ox, p.getZ(i) * 2.7 + oz) * 0.9;
    p.setXYZ(i, p.getX(i) * n * r, p.getY(i) * n * r * flat, p.getZ(i) * n * r);
  }
  p.needsUpdate = true;
  g.rotateY(rand() * TAU);
  g.rotateX((rand() - 0.5) * 0.8);
  g.computeVertexNormals();
  return g;
}

/**
 * Wood and leaf as two merged geometries, so eight species cost sixteen draws
 * and not sixteen hundred. Unit height; the caller scales.
 */
function buildTree(spec: TreeSpec, seed: number): { wood: THREE.BufferGeometry; leaf: THREE.BufferGeometry | null } {
  const rand = seeded(seed);
  const wood: THREE.BufferGeometry[] = [];
  const clumps: Array<{ x: number; y: number; z: number; r: number }> = [];

  const norm = (x: number, y: number, z: number): Pt => {
    const l = Math.hypot(x, y, z) || 1;
    return { x: x / l, y: y / l, z: z / l };
  };

  /** Swings a unit direction `angle` off itself, rolled `roll` about it. */
  const swing = (d: Pt, angle: number, roll: number): Pt => {
    let ux = -d.z;
    let uz = d.x;
    let ul = Math.hypot(ux, uz);
    if (ul < 1e-4) { ux = 1; uz = 0; ul = 1; }
    ux /= ul; uz /= ul;
    // v = d × u. Unit, and with no y term of its own beyond this one.
    const vx = d.y * uz;
    const vy = d.z * ux - d.x * uz;
    const vz = -d.y * ux;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const cr = Math.cos(roll);
    const sr = Math.sin(roll);
    return norm(
      d.x * c + (ux * cr + vx * sr) * s,
      d.y * c + vy * sr * s,
      d.z * c + (uz * cr + vz * sr) * s,
    );
  };

  // One bearing for the whole tree, so the bole's lean and the crown's weight
  // agree about which way the wind has been coming from.
  const bear = rand() * TAU;
  const bcos = Math.cos(bear);
  const bsin = Math.sin(bear);
  const boleTop = spec.bole;

  const bp: Pt[] = [];
  const br: number[] = [];
  const stations = 6;
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    // Quadratic lean plus a small sinuous term: a bole is neither a plumb line
    // nor a clean arc, and either one reads as a pole.
    const off = spec.sweep * (t * t * 0.85 + Math.sin(t * 4.3 + seed * 0.017) * 0.16);
    bp.push({ x: bcos * off, y: t * boleTop, z: bsin * off });
    // Root flare, and the taper that makes the tree sit *in* the ground.
    const flare = 1 + 0.9 * Math.exp(-t * 13);
    const broken = spec.dead && t > 0.88 ? 0.45 : 1;
    br.push(spec.girth * flare * (1 - t * (spec.conifer ? 0.78 : 0.6)) * broken);
  }
  wood.push(tube(bp, br, 5, 8));

  /** The bole's own centre line at a height, for hanging a whorl off. */
  const axisAt = (y: number): Pt => {
    const t = clamp01(y / Math.max(boleTop, 1e-3)) * stations;
    const i = Math.min(stations - 1, Math.floor(t));
    const f = t - i;
    const a = bp[i];
    const b = bp[i + 1];
    return { x: a.x + (b.x - a.x) * f, y, z: a.z + (b.z - a.z) * f };
  };

  const grow = (from: Pt, dir: Pt, len: number, rad: number, depth: number): void => {
    const segs = depth > 0 ? 4 : 3;
    const path: Pt[] = [from];
    const radii: number[] = [rad];
    let d = dir;
    let cur = from;
    for (let i = 1; i <= segs; i++) {
      // The limb bends as it goes — up for an ash, hardly at all for an oak —
      // and wanders a little either way. A straight limb is a dowel.
      d = swing(norm(d.x, d.y + spec.lift * 0.2, d.z), 0.04 + rand() * 0.16, rand() * TAU);
      cur = { x: cur.x + d.x * (len / segs), y: cur.y + d.y * (len / segs), z: cur.z + d.z * (len / segs) };
      path.push(cur);
      radii.push(rad * (1 - (i / segs) * (spec.dead ? 0.42 : 0.72)));
    }
    wood.push(tube(path, radii, depth > 0 ? 4 : 3, 8));
    if (depth > 0) {
      const kids = rand() < 0.35 ? 3 : 2;
      const roll = rand() * TAU;
      for (let k = 0; k < kids; k++) {
        grow(
          cur,
          swing(d, spec.diverge * (0.6 + rand() * 0.8), roll + (k / kids) * TAU + (rand() - 0.5) * 0.5),
          len * (0.58 + rand() * 0.2),
          rad * 0.58,
          depth - 1,
        );
      }
      return;
    }
    if (spec.dead) return;
    // Two or three masses per tip rather than one big one: the serration in the
    // crown's edge is a function of how many clumps meet the sky, not of how
    // much foliage there is, and one clump per branch reads as a plate.
    clumps.push({
      x: cur.x + d.x * spec.clump * 0.45,
      y: cur.y + d.y * spec.clump * 0.45,
      z: cur.z + d.z * spec.clump * 0.45,
      r: spec.clump * (0.62 + rand() * 0.42),
    });
    const m = path[segs - 1];
    clumps.push({ x: m.x, y: m.y, z: m.z, r: spec.clump * (0.48 + rand() * 0.34) });
    // The third only where it will be seen: the treeline is a hundred metres
    // out and two clumps a branch already give it more edge than it can resolve.
    if (spec.depth > 1 && rand() < 0.6) {
      const q = path[Math.max(1, segs - 2)];
      clumps.push({
        x: (q.x + m.x) / 2, y: (q.y + m.y) / 2, z: (q.z + m.z) / 2,
        r: spec.clump * (0.4 + rand() * 0.3),
      });
    }
  };

  if (spec.conifer) {
    // Whorls: a ring of short limbs at each node, shorter as they climb and all
    // of them sloping down and out. The gaps *between* whorls are what makes
    // this read as a pine rather than as a cone.
    const base = spec.crownBase ?? 0.35;
    const nodes = 7;
    for (let i = 0; i < nodes; i++) {
      const t = i / (nodes - 1);
      const y = base + t * (boleTop - base) * 0.97;
      const at = axisAt(y);
      const spread = spec.reach * (1 - t * 0.82) + 0.02;
      const per = t > 0.85 ? 2 : 3 + (i % 2);
      for (let k = 0; k < per; k++) {
        const a = i * 1.27 + (k / per) * TAU + rand() * 0.35;
        const dir = norm(Math.cos(a), -0.2 - t * 0.2 + rand() * 0.12, Math.sin(a));
        const tip = { x: at.x + dir.x * spread, y: y + dir.y * spread, z: at.z + dir.z * spread };
        wood.push(tube([at, tip], [spec.girth * 0.32 * (1 - t * 0.6), spec.girth * 0.08], 3, 8));
        // Needles along the limb rather than balled at the end of it, which is
        // where a conifer's tiered, fringed edge comes from.
        clumps.push({
          x: at.x + dir.x * spread * 0.72,
          y: y + dir.y * spread * 0.72,
          z: at.z + dir.z * spread * 0.72,
          r: spec.clump * (1 - t * 0.45) * (0.85 + rand() * 0.4),
        });
        if (i < 3) {
          clumps.push({
            x: at.x + dir.x * spread * 0.34,
            y: y + dir.y * spread * 0.34,
            z: at.z + dir.z * spread * 0.34,
            r: spec.clump * (0.6 + rand() * 0.3),
          });
        }
      }
    }
    clumps.push({ x: bp[stations].x, y: boleTop * 0.99, z: bp[stations].z, r: spec.clump * 0.5 });
  } else {
    const head = bp[stations];
    const prev = bp[stations - 1];
    const trunkDir = norm(head.x - prev.x, head.y - prev.y, head.z - prev.z);
    const roll0 = rand() * TAU;
    for (let i = 0; i < spec.limbs; i++) {
      // Limbs leave over the top fifth of the bole rather than all from its
      // head: one point of origin is a bouquet in a vase, not a fork.
      const at = axisAt(boleTop * (0.8 + (i / Math.max(1, spec.limbs)) * 0.19));
      grow(
        at,
        swing(trunkDir, 0.34 + rand() * 0.36, roll0 + (i / spec.limbs) * TAU + (rand() - 0.5) * 0.45),
        spec.reach * (0.78 + rand() * 0.45),
        spec.girth * (0.62 - i * 0.03),
        spec.depth,
      );
    }
    // The leader carries on past the fork. Without it the middle of the crown
    // is a hole and the tree reads as two trees.
    grow(head, swing(trunkDir, 0.14, rand() * TAU), spec.reach * 0.7, spec.girth * 0.42, spec.depth);
  }

  const leaves = clumps.map((c) => leafClump(c.r, spec.aspect, rand).translate(c.x, c.y, c.z));
  return {
    wood: mergeInto(wood),
    leaf: leaves.length > 0 ? mergeInto(leaves) : null,
  };
}

/**
 * Scrub for the wood's margin: the same clumps with no trunk under them. It is
 * here so the treeline does not meet the ground as a row of bare poles, and so
 * the middle distance has one more layer in it. Five clumps, one draw, ~60
 * triangles — the cheapest depth cue in the frame.
 */
function buildBush(seed: number): THREE.BufferGeometry {
  const rand = seeded(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = 4 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand();
    const d = rand() * 0.42;
    parts.push(leafClump(0.3 + rand() * 0.22, 0.66 + rand() * 0.3, rand)
      .translate(Math.cos(a) * d, 0.24 + rand() * 0.28, Math.sin(a) * d));
  }
  return mergeInto(parts);
}

/** The sag in an old roof: deepest between the gables, none at them.
 *
 * Every term vanishes at u = 0 and u = 1 and is symmetric about u = 0.5, and
 * both properties are load-bearing — the gable infill is built to a straight
 * apex, and the far slope is the near one turned about Y, so an antisymmetric
 * term would part the two of them along the ridge.
 */
function roofSag(u: number, amp: number): number {
  return -amp * (Math.sin(u * Math.PI) + 0.26 * Math.sin(u * Math.PI * 3));
}

/** Where the hall stands. The treeline keeps out of it, so both need the number. */
const HALL_A = -1.62;
const HALL_D = 37;

// ---------------------------------------------------------------------------

export function createWorld(
  scene: THREE.Scene,
  materials: MaterialLibrary,
  settings: QualitySettings,
  opts: WorldOptions = {},
): WorldHandle {
  const rng = opts.rng ?? seeded(0x5b7ea41d);
  const root = new THREE.Group();
  root.name = "world";

  const pointLights: THREE.PointLight[] = [];
  /** Every geometry this module made, so dispose releases each exactly once. */
  const owned = new Set<THREE.BufferGeometry>();
  /**
   * Materials this module built itself rather than taking from the library.
   * There is exactly one — the water, which needs a shading model the catalog
   * does not offer — and it is ours to release, because materials.dispose()
   * only knows about its own.
   */
  const ownedMats: THREE.Material[] = [];
  const restore: Array<() => void> = [];
  /**
   * Per-frame work a build block registers for itself, so a prop that needs a
   * clock does not have to be hoisted out of the section that explains it and
   * into `update`. Called with the frame's dt, in registration order.
   */
  const frameHooks: Array<(dt: number, ctx: FrameContext) => void> = [];
  const own = <T extends THREE.BufferGeometry>(g: T): T => { owned.add(g); return g; };

  const density = settings.propDensity;
  const scatter = (base: number) => Math.max(1, Math.round(base * density));
  const tier = settings.tier;

  const M4 = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const V = new THREE.Vector3();
  const E = new THREE.Euler();

  /**
   * Places one geometry many times. InstancedMesh when the tier allows it,
   * otherwise plain meshes sharing the same geometry and material — still one
   * upload, just more draw calls. The per-instance tint is the only thing the
   * fallback loses, and it loses it silently on purpose: a colour variation is
   * worth less than a device that renders at all.
   */
  function field(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    xforms: THREE.Matrix4[],
    tints: THREE.Color[] | null = null,
    castShadow = true,
  ): THREE.InstancedMesh | null {
    own(geo);
    if (xforms.length === 0) return null;
    if (!settings.instancing) {
      for (const m of xforms) {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.applyMatrix4(m);
        mesh.castShadow = castShadow;
        root.add(mesh);
      }
      return null;
    }
    const inst = new THREE.InstancedMesh(geo, mat, xforms.length);
    for (let i = 0; i < xforms.length; i++) {
      inst.setMatrixAt(i, xforms[i]);
      if (tints) inst.setColorAt(i, tints[i]);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.castShadow = castShadow;
    inst.computeBoundingSphere();
    root.add(inst);
    return inst;
  }

  const place = (x: number, y: number, z: number, ry = 0, s = 1, rx = 0, rz = 0): THREE.Matrix4 => {
    E.set(rx, ry, rz, "YXZ");
    Q.setFromEuler(E);
    return new THREE.Matrix4().compose(V.set(x, y, z), Q, new THREE.Vector3(s, s, s));
  };

  // =========================================================================
  // Terrain
  // =========================================================================

  const groundMat = materials.get("ground");
  const ground = (() => {
    const segs = tier === "high" ? 168 : tier === "medium" ? 128 : 88;
    const step = tier === "high" ? 0.8 : tier === "medium" ? 1.0 : 1.4;

    // Concentric rings, uniform across the moot and growing geometrically out to
    // the downs. A square grid at this resolution would be a quarter of a million
    // vertices to put 0.8 m of detail where the fight is.
    const radii: number[] = [];
    let r = 0;
    while (r < 29) { r += step; radii.push(r); }
    let s = step;
    while (r < TERRAIN_RADIUS) { s *= 1.11; r = Math.min(r + s, TERRAIN_RADIUS); radii.push(r); }
    // Skirt: the outermost ring again, dropped below the horizon, so the terrain
    // can never show its own edge against the sky no matter where the camera goes.
    radii.push(TERRAIN_RADIUS);
    const rings = radii.length;
    const skirt = rings - 1;

    const count = 1 + rings * segs;
    const pos = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const col = new Float32Array(count * 3);
    // Wetness rides its own attribute rather than being inferred in the shader
    // from how dark the vertex colour is. That inference is what put a mirror
    // on the grass: turf in shade is as dark as mud, so shaded turf came back
    // at a quarter of its roughness and returned a per-pixel blue reflection of
    // the night sky. Darkness is not a wetness channel. This is, and it is the
    // same field groundColor darkens with.
    const wet = new Float32Array(count);
    const c = new THREE.Color();

    const write = (i: number, x: number, z: number, y: number) => {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      uv[i * 2] = x * GROUND_UV + 0.5;
      uv[i * 2 + 1] = z * GROUND_UV + 0.5;
      groundColor(x, z, y, c);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      // The sheen reaches a little further than the darkening: ground the moot
      // has been standing on all evening is damp without being flooded, and a
      // damp surface holds a broad sheen rather than a reflection. Weighted
      // well under the basins so the two never read as the same substance.
      //
      // 0.4 on the churn, not 0.5. With the puddles cut back to the hollows
      // they belong in, this term is now what decides whether the *open* arena
      // reads as wet, and at 0.5 the whole trampled floor came back as a sheet
      // of wet cobbles in every wide shot — which is the same "the moot is
      // flooded" read the puddles were giving, arriving by the other route.
      wet[i] = clamp01(Math.max(basinWet(x, z), churnMask(x, z, Math.hypot(x, z)) * 0.4));
    };

    write(0, 0, 0, groundHeight(0, 0));
    for (let i = 0; i < rings; i++) {
      const rad = radii[i];
      const span = i === 0 ? rad : rad - radii[i - 1];
      // Jitter breaks the polar lattice. Without it the ground shows concentric
      // rings and radial spokes in every vertex-coloured gradient it carries.
      const jit = i >= skirt - 1 ? 0 : Math.min(span, 1.6) * 0.34;
      for (let j = 0; j < segs; j++) {
        const idx = 1 + i * segs + j;
        // Angular jitter is capped against the ring's own angular pitch. Near
        // the centre a polar grid is 168 vertices around a 1 m circle, and an
        // unclamped shuffle there swaps neighbours and folds the triangles.
        const angJit = Math.min(jit, ((rad * TAU) / segs) * 0.45) / Math.max(rad, 0.001);
        const jr = rad + (hash2(i * 7919 + 13, j * 104729 + 5) - 0.5) * jit;
        const ja = (j / segs) * TAU + (hash2(j * 7919 + 3, i * 104729 + 11) - 0.5) * angJit;
        const x = Math.cos(ja) * jr;
        const z = Math.sin(ja) * jr;
        write(idx, x, z, i === skirt ? -34 : groundHeight(x, z));
      }
    }

    // Wound so the face normal is +Y. Rings run counter-clockwise in XZ, which
    // puts radial-then-tangential the wrong way round; getting this backwards
    // does not shade the ground darkly, it deletes it.
    const idx: number[] = [];
    for (let j = 0; j < segs; j++) {
      idx.push(0, 1 + ((j + 1) % segs), 1 + j);
    }
    for (let i = 0; i < rings - 1; i++) {
      const a0 = 1 + i * segs;
      const b0 = 1 + (i + 1) * segs;
      for (let j = 0; j < segs; j++) {
        const jn = (j + 1) % segs;
        idx.push(a0 + j, a0 + jn, b0 + j, a0 + jn, b0 + jn, b0 + j);
      }
    }

    const geo = own(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("wetness", new THREE.BufferAttribute(wet, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, groundMat);
    mesh.receiveShadow = true;
    // The whole world is inside it; culling it is only ever a chance to be wrong.
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  })();

  // The ground detail map is one 512² tile over a 350 m field, and no amount of
  // vertex colour hides a tile that repeats every 1.6 m. So the albedo is mixed
  // from two samples of the same map at very different scales, blended by a
  // wavelength longer than anything in the frame; and roughness is driven off
  // the vertex colour, which is how churned mud and the puddle rims come out
  // wet without a second material or a decal pass.
  //
  // It also mixes in a second *substance*. The detail map is a field of grit and
  // pebbles, and on its own it made every square metre of the arena read as
  // packed dirt however green the vertex colour under it was — trampled earth
  // everywhere, which is the wrong half of "turf, mud, trampled grass". Where
  // the vertex colour says turf, the blade structure of the grass surface is
  // blended over the grit, at its own scale, so growing ground and beaten ground
  // are two materials rather than two tints of one.
  //
  // The turf map is borrowed off a material rather than fetched from the texture
  // library, because this module is handed materials and not textures. It is one
  // cached instance either way; the stand-in material itself never renders.
  const turfMap = materials.tinted("grass", 0xffffff, { repeat: 1 }).map;

  if (groundMat instanceof THREE.MeshStandardMaterial && groundMat.map) {
    const prior = groundMat.onBeforeCompile;
    groundMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTurf = { value: turfMap };
      shader.vertexShader = `varying vec3 vTerrainPos;\nattribute float wetness;\nvarying float vWet;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n\tvTerrainPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;\n\tvWet = wetness;",
      );
      shader.fragmentShader = `varying vec3 vTerrainPos;\nvarying float vWet;\nuniform sampler2D uTurf;\n${shader.fragmentShader}`
        .replace(
          "#include <map_fragment>",
          `#ifdef USE_MAP
            vec4 tNear = texture2D( map, vMapUv );
            vec4 tWide = texture2D( map, vMapUv * 0.271 + vec2( 0.37, 0.71 ) );
            float tBlend = clamp( ( sin( vTerrainPos.x * 0.061 ) * cos( vTerrainPos.z * 0.077 ) * 0.5 + 0.5 ) * 1.5 - 0.25, 0.0, 1.0 );
            vec4 sampledDiffuseColor = mix( tNear, tWide, tBlend );
            sampledDiffuseColor.rgb *= 0.84 + 0.32 * ( sin( vTerrainPos.x * 0.029 + vTerrainPos.z * 0.017 ) * 0.5 + 0.5 );
            #ifdef USE_COLOR
              // Green excess in the vertex colour *is* the turf mask — it is
              // what groundColor() was already writing, so the two can never
              // disagree about where the grass is.
              //
              // What gets blended in is the grass surface's structure, not its
              // colour: a tight sample over a very wide one, which averages to
              // one by construction because both are the same texture and share
              // a mean. That is what keeps this from re-grading the ground it
              // lands on without this file having to know a texture's statistics
              // it cannot see. The hue nudge is separate, small, and bounded.
              // Sampled unconditionally rather than inside the mask's branch:
              // a texture fetch in non-uniform control flow has undefined
              // derivatives, and the mip it picks on bare ground is not worth
              // finding out about on someone else's driver.
              const vec3 lum709 = vec3( 0.2126, 0.7152, 0.0722 );
              float turfMask = smoothstep( 0.0, 0.42, vColor.g / max( vColor.r + vColor.b, 1e-3 ) - 0.55 );
              float bladeNear = dot( texture2D( uTurf, vTerrainPos.xz * 0.72 ).rgb, lum709 );
              float bladeWide = dot( texture2D( uTurf, vTerrainPos.xz * 0.043 ).rgb, lum709 );
              float blade = clamp( bladeNear / max( bladeWide, 1e-3 ), 0.35, 2.2 );
              sampledDiffuseColor.rgb *= mix( vec3( 1.0 ), vec3( blade ) * vec3( 0.9, 1.14, 0.86 ), turfMask * 0.8 );
            #endif
            diffuseColor *= sampledDiffuseColor;
          #endif`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `#include <roughnessmap_fragment>
          // Only genuinely wet ground goes glossy, and only down to a sheen —
          // 0.34 is a damp surface, not a mirror. Water itself is a separate
          // material a few centimetres below this one; the terrain's job here
          // is the wet margin around it, which is what makes the puddle read as
          // sitting in the mud rather than laid on top of it.
          roughnessFactor = mix( roughnessFactor, min( roughnessFactor, 0.34 ), vWet );`,
        )
        .replace(
          "#include <lights_physical_fragment>",
          `// Screen-space specular anti-aliasing, and the last third of the crawl
          // §10 keeps scoring. textures.ts band-limits roughness in *texture*
          // space, which it can do because it knows the texel grid; what it
          // cannot know is how many texels land in a pixel, and past the
          // standing ring that is hundreds. three has its own guard here, but
          // it reads dFd of nonPerturbedNormal — the interpolated vertex
          // normal — so the ground's normal map, the thing actually producing
          // the sparkle, is invisible to it.
          //
          // Kaplanyan/Tokuyoshi: a normal that wobbles inside a pixel is a
          // wider lobe, and lobe widths add as variances on alpha rather than
          // on roughness. Constants are Filament's published defaults — 0.15
          // variance doubled, capped at 0.25 — and the cap is the one that
          // matters: it is what stops a silhouette pixel, where the derivative
          // means nothing, from flattening a whole edge to matte.
          {
            vec3 dNdx = dFdx( normal );
            vec3 dNdy = dFdy( normal );
            float kernel = min( 0.3 * ( dot( dNdx, dNdx ) + dot( dNdy, dNdy ) ), 0.25 );
            roughnessFactor = sqrt( min( roughnessFactor * roughnessFactor + kernel, 1.0 ) );
          }
          #include <lights_physical_fragment>`,
        );
    };
    groundMat.needsUpdate = true;
    restore.push(() => { groundMat.onBeforeCompile = prior; groundMat.needsUpdate = true; });
  }

  // ---- standing water ----------------------------------------------------
  //
  // A puddle has nothing of its own to show. Everything in it is either sky
  // bounced off the surface or mud seen through it, and the version this
  // replaces had neither. A near-black dielectric returns about 4% of the
  // environment at normal incidence and its own albedo for the other 96%, and
  // the gameplay camera looks at the ground from above — the one angle where
  // Fresnel pays nothing. So the PMREM only ever showed up at the grazing
  // incidence no over-shoulder shot uses, and the disc read as a hole punched
  // in the world: it owned the bottom third of `stance`.
  //
  // Four things fix it and all four are load-bearing.
  //
  //   * It is transparent. The mud renders through it, so the puddle has a
  //     *bottom* — which is the whole difference between shallow water and a
  //     hole — and it is wet silt rather than near-black.
  //   * Clearcoat. A second, smoother layer carries its own Fresnel term and
  //     its own IBL sample at a mirror roughness the base layer does not have,
  //     so the sheet still returns something off the PMREM's ember horizon at a
  //     near-vertical view. It is also the only layer here with a dielectric's
  //     F0: three derives the base layer's from `ior`, and water's 1.33 gives
  //     0.020 — half what the old 0x101a1e material had. Reflectivity was never
  //     going to come from the base layer.
  //   * Ripples. A dead-flat mirror at this roughness samples straight up into
  //     the darkest part of the dome. Two degrees of slope walks that sample
  //     onto the horizon band, which is where all the light in this sky is.
  //   * It sits *in* the ground rather than on it. The sheet is level at a
  //     waterline set from the basin it fills, its rings are solved against
  //     that basin's own profile, and its per-vertex alpha follows the water
  //     depth — so the shore is where the basin rises out of the water, the
  //     outermost ring finishes under the mud, and the 21-gon of straight
  //     chords that used to end the disc at full opacity is gone.
  //
  // What changed since that fix is only *how much* of it there is. The material
  // below is the one that made a puddle read as water and is left alone; the
  // list it is built over has been cut to a third of its wetted area and moved
  // into ruts, hollows and the palisade's drip line. Reading as water was never
  // the same problem as covering half the arena with it.
  {
    // Each puddle carries its own depth, and its basin is that depth over
    // WATER_FILL — so every sheet leaves the same *fraction* of basin wall dry
    // above its waterline, and the ring radii below solve once for all of them.
    // The waterline still lands 15–50 mm under the boot plane depending on the
    // swale beneath the basin; that gap is the sim's y = 0 against this file's
    // relief and it is not something the water can close from here. It stopped
    // mattering when the puddles moved out from under the framed subjects.
    const water = new THREE.MeshPhysicalMaterial({
      // Wet silt, not void. Whatever survives the opacity is what the eye reads
      // as the bottom of the puddle, so it has to be a colour mud could be.
      color: 0x281f17,
      roughness: 0.09,
      metalness: 0,
      transparent: true,
      opacity: 0.62,
      // No depth write: the mud behind it has to survive, and flat sheets lying
      // on the ground have no ordering problem with each other.
      depthWrite: false,
      vertexColors: true,
      ior: 1.33,
      // Not a claim about the substance — the ior above is the claim, and it is
      // right. This is compensation for an environment deliberately graded down
      // for matte surfaces, applied at the one surface whose read depends on it.
      specularIntensity: 1.6,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    });
    water.name = "standingWater";
    ownedMats.push(water);

    const waterTime = { value: 0 };
    water.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = waterTime;
      shader.vertexShader = `varying vec3 vWaterPos;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n\tvWaterPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;",
      );
      // Three crossed swells: two at about 1.8 m, which is a whole puddle, so
      // each one catches the light differently from its neighbour; and one
      // half-metre chop for surface. Only the chop is dropped on low.
      //
      // The geometry stays a level sheet and only the shading normal moves,
      // which is both right for water this shallow and free per vertex. Both
      // `normal` and `nonPerturbedNormal` are written, because three seeds the
      // clearcoat's normal from the latter — perturb only the first and the
      // mirror layer stays flat, and the mirror layer is the one doing the work.
      const swell = (kx: number, kz: number, amp: number, speed: number) =>
        `\n\t\t\tslope += vec2( ${kx}, ${kz} ) * ( ${amp} * cos( dot( wp, vec2( ${kx}, ${kz} ) ) - uTime * ${speed} ) );`;
      const swells = swell(2.7, 1.9, 0.018, 0.55)
        + swell(-1.6, 3.3, 0.015, 0.41)
        + (tier === "low" ? "" : swell(11.3, -7.9, 0.0026, 0.95));
      shader.fragmentShader = `varying vec3 vWaterPos;\nuniform float uTime;\n${shader.fragmentShader}`
        .replace(
          "#include <normal_fragment_begin>",
          `#include <normal_fragment_begin>
          {
            vec2 wp = vWaterPos.xz;
            vec2 slope = vec2( 0.0 );${swells}
            // The sheet's world normal is exactly +Y, so the perturbed normal
            // can be built in world space and rotated into view space in one
            // step — no tangent frame, and no UVs on the geometry at all.
            vec3 rippled = normalize( vec3( -slope.x, 1.0, -slope.y ) );
            normal = normalize( ( viewMatrix * vec4( rippled, 0.0 ) ).xyz );
            nonPerturbedNormal = normal;
          }`,
        );
    };

    // Silt lit through a centimetre of water against silt lit through five, as
    // multipliers on the colour above. The gradient is what gives the puddle a
    // floor to sit above; without it the sheet is one flat value and reads as a
    // decal however well it reflects. The deep end is held near 0.85 rather than
    // allowed to fall away: the centre is where the reflection is meant to carry
    // the read, and if the reflection ever under-delivers that is exactly where
    // the void comes back.
    const C_SHALLOW = new THREE.Color().setRGB(1.7, 1.5, 1.26);
    const C_DEEP = new THREE.Color().setRGB(0.86, 0.84, 0.88);

    // Rings are placed by *depth*, as a fraction of the puddle's own depth, not
    // by a fraction of some radius. The alpha ramp is a function of depth, so
    // vertices spent anywhere else sit where nothing is changing and starve the
    // band where everything is. The last one is negative on purpose: that ring
    // finishes under the mud, and it is what guarantees the polygon's straight
    // chords never reach a frame.
    const RING_DEPTH = [0.78, 0.56, 0.34, 0.14, -0.2];

    // The rim-radius each of those lands at, solved off the basin's own
    // Gaussian: depth(d) = D − D/WATER_FILL·( 1 − exp( −1.6·d² ) ). The depth
    // cancels, which is the point of holding WATER_FILL constant across the
    // list — one solve serves a 14 mm drip line and a 30 mm hollow alike.
    //
    // Off the *basin*, deliberately, and not off the height field. Walking the
    // real terrain out to where it crosses the waterline looks like the more
    // honest version and is not: the interior swale runs ±3 cm at a 12 m
    // wavelength, so wherever it happens to dip beside a puddle the shoreline
    // walks away — measured at 5.3 m on a basin 2.8 m across, which is not a
    // puddle but a lake. The basin is what makes the puddle; the swale is the
    // ground the puddle sits in. WATER_FILL has to track groundHeight.
    const RING_R = RING_DEPTH.map(
      (t) => Math.sqrt(-Math.log(Math.max(1e-4, 1 - (1 - t) * WATER_FILL)) / 1.6),
    );

    // Every sheet is authored directly in world space and they share one
    // material, so they are one geometry and one draw — and, being transparent,
    // one entry for the renderer to sort rather than fourteen.
    const pos: number[] = [];
    const nrm: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const c = new THREE.Color();

    for (const p of PUDDLES) {
      const base = pos.length / 3;
      const wl = groundHeight(p.x, p.z) + p.depth;
      // Shallow water is lighter and thinner than deep water over the same
      // silt, so the drip line does not come back as black as the hollows.
      const body = p.depth / DEEPEST_WATER;

      // Vertices go round by arc length, and how many of them there are comes
      // off the perimeter rather than a constant. Both matter once the sheets
      // are ellipses. A constant 44 spent three times the vertices per metre of
      // shoreline on a 0.25 m rut that the rut could ever show; and stepping
      // the parametric angle on a 7:1 ellipse puts a 0.25 m chord at each tip
      // and a 0.5 m one along the flanks, which are the only part of a rut
      // anyone sees. (Stepping the *ray* angle, which looks like the fix, is
      // worse — it drops a single one-metre chord across the tip.)
      const FINE = 256;
      const cum = new Float64Array(FINE + 1);
      for (let k = 1; k <= FINE; k++) {
        const f0 = ((k - 1) / FINE) * TAU;
        const f1 = (k / FINE) * TAU;
        cum[k] = cum[k - 1] + Math.hypot(
          p.a * (Math.cos(f1) - Math.cos(f0)),
          p.b * (Math.sin(f1) - Math.sin(f0)),
        );
      }
      const perim = cum[FINE];
      const seg = Math.max(16, Math.min(44, Math.round(perim / 0.34)));
      const phis: number[] = [];
      for (let j = 0, k = 0; j < seg; j++) {
        const want = (j / seg) * perim;
        while (k < FINE - 1 && cum[k + 1] < want) k++;
        const span = cum[k + 1] - cum[k];
        phis.push(((k + (span > 1e-9 ? (want - cum[k]) / span : 0)) / FINE) * TAU);
      }

      // Alpha and colour come off the ring's own design depth, and the terrain
      // is allowed only to *cut*. Reading depth off the height field instead
      // sounds more principled and measures worse: the swale is ±30 mm and the
      // deepest water here is 30 mm, so on the low side of a puddle the field
      // says "deep" right out to the last ring and the fade collapses into a
      // single annulus — 0.95 to 0 across 60 cm, which reads as a vignette, not
      // a shore. The ring ramp is the shape of the water; the cut is where the
      // ground comes back through it, which the basin cannot know. On a long
      // rut the cut now does real work as well as guard duty: the swale tilts a
      // 3.4 m wheel line by most of a centimetre, so it holds water at the low
      // end and dries out at the high one. `ringFade` zeroes the buried ring.
      const push = (x: number, z: number, t: number, ringFade: number) => {
        const over = (wl - groundHeight(x, z)) / p.depth;
        // Full strength wherever there is any water at all, off only once the
        // ground has actually come back through the surface. Centring this band
        // on zero instead would dim the deep middle of a puddle that happens to
        // sit on a slope, which is not what "the ground is above the water"
        // means — and half of these lie on the interior swale.
        const cut = smoothstep(-0.25, 0.08, over);
        c.copy(C_SHALLOW).lerp(C_DEEP, smoothstep(0.2, 0.95, clamp01(t)) * body);
        pos.push(x, wl, z);
        nrm.push(0, 1, 0);
        col.push(c.r, c.g, c.b, Math.min(smoothstep(0, 0.62, clamp01(t)) * cut * (0.74 + 0.26 * body), ringFade));
      };

      push(p.x, p.z, 1, 1);
      for (let i = 0; i < RING_DEPTH.length; i++) {
        for (let j = 0; j < seg; j++) {
          const f = phis[j];
          const ax = Math.cos(f);
          const az = Math.sin(f);
          // One wobble per ray, shared by every ring on it. That is what keeps
          // the outline off an ellipse without letting a ring cross the one
          // outside it — the whole fan is scaled by the same factor, so the
          // ordering the ring radii were solved for survives.
          const wob = 0.86 + noise2(ax * 2.4 + p.x, az * 2.4 + p.z) * 0.28;
          const s = RING_R[i] * wob;
          const lx = p.a * ax * s;
          const lz = p.b * az * s;
          push(
            p.x + lx * p.cos - lz * p.sin,
            p.z + lx * p.sin + lz * p.cos,
            RING_DEPTH[i],
            i === RING_DEPTH.length - 1 ? 0 : 1,
          );
        }
      }
      for (let j = 0; j < seg; j++) idx.push(base, base + 1 + ((j + 1) % seg), base + 1 + j);
      for (let i = 1; i < RING_DEPTH.length; i++) {
        const a0 = base + 1 + (i - 1) * seg;
        const b0 = base + 1 + i * seg;
        for (let j = 0; j < seg; j++) {
          const jn = (j + 1) % seg;
          idx.push(a0 + j, a0 + jn, b0 + j, a0 + jn, b0 + jn, b0 + j);
        }
      }
    }

    {
      const g = own(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
      // Four components, not three: three declares vColor as a vec4 either way
      // but only reaches for the alpha when the attribute actually carries one,
      // and that alpha is the whole feathered rim.
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
      g.setIndex(idx);
      root.add(new THREE.Mesh(g, water));
    }

    // The library hands its environment to the materials it owns, and this one
    // is ours, so it has to follow along by hand. Not a snapshot: sky.ts rebakes
    // the PMREM on every mood change and mints a new texture each time, and a
    // puddle reflecting a disposed one goes black again. The ground material is
    // the probe because it is already in scope and the library does adopt it —
    // a pointer compare a frame, and a recompile only when the sky rebakes,
    // which every other material in the arena is paying for on the same frame.
    //
    // Intensity is 1, not the arena's. sky.ts grades the environment down to
    // 0.42 because on matte surfaces the PMREM is doing duty as bounce fill and
    // full strength washes them out. Water is the one surface here whose entire
    // read is the sky it returns, and it wants that sky at its real radiance.
    const envProbe = groundMat instanceof THREE.MeshStandardMaterial ? groundMat : null;
    const syncWaterEnv = () => {
      if (!envProbe || water.envMap === envProbe.envMap) return;
      water.envMap = envProbe.envMap;
      water.envMapIntensity = 1;
      water.needsUpdate = true;
    };
    syncWaterEnv();
    frameHooks.push((dt) => {
      waterTime.value += dt;
      syncWaterEnv();
    });
  }

  // ---- turf clumps -------------------------------------------------------
  // Blades, not cones. A cone at this size reads as a traffic bollard; six bent
  // blades read as grass even at one pixel, because the silhouette is broken.
  {
    const tuftMat = materials.get("grassTuft");
    // Only this module uses grassTuft, and a blade seen from behind has to be
    // a blade rather than a hole.
    if (tuftMat instanceof THREE.MeshStandardMaterial && tuftMat.side !== THREE.DoubleSide) {
      const prevSide = tuftMat.side;
      tuftMat.side = THREE.DoubleSide;
      restore.push(() => { tuftMat.side = prevSide; });
    }

    const clumpGeo = (variant: number): THREE.BufferGeometry => {
      const rand = seeded(0x9e37 + variant * 7717);
      const blades: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i++) {
        const h = 0.2 + rand() * 0.36;
        const g = new THREE.PlaneGeometry(0.05, h, 1, 3);
        const p = g.attributes.position as THREE.BufferAttribute;
        const lean = 0.35 + rand() * 0.55;
        for (let v = 0; v < p.count; v++) {
          const t = clamp01((p.getY(v) + h / 2) / h);
          p.setX(v, p.getX(v) * (1 - t * 0.82));
          p.setZ(v, t * t * h * lean);
          p.setY(v, p.getY(v) + h / 2);
        }
        p.needsUpdate = true;
        g.computeVertexNormals();
        g.rotateY(rand() * TAU);
        g.translate((rand() - 0.5) * 0.17, 0, (rand() - 0.5) * 0.17);
        blades.push(g);
      }
      return mergeInto(blades);
    };

    const variants = [clumpGeo(0), clumpGeo(1), clumpGeo(2)];
    const buckets: THREE.Matrix4[][] = [[], [], []];
    const tints: THREE.Color[][] = [[], [], []];
    const tc = new THREE.Color();
    for (let i = 0; i < scatter(430); i++) {
      const a = rng() * TAU;
      const d = 6 + Math.pow(rng(), 0.55) * 34;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      // Grass does not grow on the tracks or in the churn.
      const bare = Math.max(pathMask(x, z, d), churnMask(x, z, d));
      if (rng() < bare * 1.25) continue;
      const v = i % 3;
      buckets[v].push(place(x, groundHeight(x, z) - 0.03, z, rng() * TAU, 0.75 + rng() * 0.9));
      // Drier and yellower away from the wet centre, greener in the hollows.
      const dry = clamp01(fbm(x * 0.07 + 3, z * 0.07 - 8, 2) * 1.4 - 0.2);
      tints[v].push(tc.setRGB(0.78 + dry * 0.5, 0.85 + dry * 0.22, 0.6 + dry * 0.1).clone());
    }
    for (let v = 0; v < 3; v++) field(variants[v], tuftMat, buckets[v], tints[v], false);
  }

  // =========================================================================
  // Palisade
  // =========================================================================

  const stakeMat = materials.get("palisade");
  const bindMat = materials.get("palisadeBinding");
  {
    // One unit-height stake: a bowed trunk with an axe-cut point, instanced with
    // a per-instance height, lean, spin and weathering tint. Forty unique meshes
    // bought nothing forty draws could not.
    const stakeGeo = (() => {
      const body = new THREE.CylinderGeometry(0.1, 0.13, 0.9, 5, 3, true);
      const p = body.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const t = clamp01(p.getY(i) / 0.9 + 0.5);
        p.setX(i, p.getX(i) + Math.sin(t * Math.PI) * 0.022);
      }
      p.needsUpdate = true;
      body.computeVertexNormals();
      body.translate(0, 0.45, 0);
      const tip = new THREE.ConeGeometry(0.105, 0.15, 5);
      tip.translate(0.022, 0.965, 0);
      return mergeInto([body, tip]);
    })();

    // Timber driven in shoulder to shoulder — a third of a metre apart, not two
    // metres. Two things follow from that. It has to be *low*: at 19.6 m a 2.4 m
    // ring sits under the hut roofs at 28 m and the treeline at 60 m, so the
    // frame keeps its background instead of trading it for a wall. And the gaps
    // have to be deliberate — rotted-out stretches where the ring sags and you
    // can see the settlement through it — rather than the spacing itself.
    const stakes: THREE.Matrix4[] = [];
    const stakeTints: THREE.Color[] = [];
    const tc = new THREE.Color();
    const N = 372;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      let dg = a - GATE_MAIN;
      dg = Math.atan2(Math.sin(dg), Math.cos(dg));
      if (Math.abs(dg) < 0.085) continue;
      // Stretches that have rotted out, and single stakes missing elsewhere.
      const rot = fbm(Math.cos(a) * 6 + 3.1, Math.sin(a) * 6 - 7.4, 2);
      if (rot > 0.62 && rng() < (rot - 0.62) * 6) continue;
      if (rng() < 0.05) continue;
      const rad = PALISADE_RADIUS + (rng() - 0.5) * 0.24;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      // Height sags where the ring is worst, so the top line is a profile
      // rather than a band of noise.
      const h = (2.35 - rot * 0.8) + rng() * 0.55;
      const lean = (rng() - 0.5) * 0.09 + (rot - 0.5) * 0.14;
      E.set(lean, rng() * TAU, (rng() - 0.5) * 0.09, "YXZ");
      Q.setFromEuler(E);
      stakes.push(new THREE.Matrix4().compose(
        V.set(x, groundHeight(x, z) - 0.16, z), Q,
        new THREE.Vector3(0.86 + rng() * 0.3, h, 0.86 + rng() * 0.3),
      ));
      // Weathering: the ring is not one batch of timber and has not aged as one.
      const grey = rng() * (1 - rot * 0.4);
      stakeTints.push(tc.setRGB(0.66 + grey * 0.56, 0.64 + grey * 0.52, 0.6 + grey * 0.48).clone());
    }
    field(stakeGeo, stakeMat, stakes, stakeTints);

    // Rails lashed on the *outside* of the stakes, where the eye mostly cannot
    // reach them. Inside, they turned the ring into a paddock fence: two long
    // horizontals in front of the timber is the one silhouette a palisade must
    // not have. Segments are chords, deliberately not meeting end to end.
    const railGeo = new THREE.CylinderGeometry(0.052, 0.058, 1, 5);
    railGeo.rotateZ(Math.PI / 2);
    const rails: THREE.Matrix4[] = [];
    const lash: THREE.Matrix4[] = [];
    const RS = 16;
    for (let k = 0; k < RS; k++) {
      const a0 = (k / RS) * TAU;
      let dg = a0 + Math.PI / RS - GATE_MAIN;
      dg = Math.atan2(Math.sin(dg), Math.cos(dg));
      if (Math.abs(dg) < 0.16) continue;
      if (k === 9 || k === 13) continue;
      const a1 = a0 + TAU / RS;
      const rad = PALISADE_RADIUS + 0.19;
      const x0 = Math.cos(a0) * rad;
      const z0 = Math.sin(a0) * rad;
      const x1 = Math.cos(a1) * rad;
      const z1 = Math.sin(a1) * rad;
      const len = Math.hypot(x1 - x0, z1 - z0) * 1.03;
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      const ang = Math.atan2(-(z1 - z0), x1 - x0);
      const gy = groundHeight(mx, mz);
      for (const hy of [0.85, 1.72]) {
        E.set(0, ang, (rng() - 0.5) * 0.05, "YXZ");
        Q.setFromEuler(E);
        rails.push(new THREE.Matrix4().compose(
          V.set(mx, gy + hy, mz), Q, new THREE.Vector3(len, 1, 1),
        ));
        lash.push(place(x0, gy + hy, z0, ang, 1));
        lash.push(place(x1, gy + hy, z1, ang, 1));
      }
    }
    field(railGeo, stakeMat, rails);
    const lashGeo = new THREE.TorusGeometry(0.13, 0.028, 5, 9);
    lashGeo.rotateY(Math.PI / 2);
    field(lashGeo, bindMat, lash, null, false);

    // ---- the gate ----
    const gatePost = own(mergeInto([
      bx(0.36, 4.0, 0.36, 0, 2.0, 0),
      bx(0.5, 0.24, 0.5, 0, 3.9, 0),
    ], 1 / 5));
    const gy = groundHeight(Math.cos(GATE_MAIN) * PALISADE_RADIUS, Math.sin(GATE_MAIN) * PALISADE_RADIUS);
    const gposts: THREE.Matrix4[] = [];
    for (const side of [-1, 1]) {
      const a = GATE_MAIN + side * 0.075;
      const gx = Math.cos(a) * PALISADE_RADIUS;
      const gz = Math.sin(a) * PALISADE_RADIUS;
      gposts.push(place(gx, groundHeight(gx, gz) - 0.1, gz, facing(gx, gz), 1));
    }
    field(gatePost, stakeMat, gposts);
    {
      const lintel = own(mergeInto([
        bx(3.6, 0.34, 0.3, 0, 0, 0),
        bx(0.5, 0.5, 0.34, 0, -0.3, 0),
      ], 1 / 5));
      const lx = Math.cos(GATE_MAIN) * PALISADE_RADIUS;
      const lz = Math.sin(GATE_MAIN) * PALISADE_RADIUS;
      const mesh = new THREE.Mesh(lintel, stakeMat);
      mesh.position.set(lx, gy + 3.62, lz);
      mesh.rotation.y = facing(lx, lz);
      mesh.castShadow = true;
      root.add(mesh);
    }
  }

  // =========================================================================
  // Torches
  // =========================================================================

  {
    const poleMat = materials.get("poleWood");
    const cupMat = materials.get("torchCup");
    const ropeMat = materials.get("palisadeBinding");
    const poleGeo = new THREE.CylinderGeometry(0.055, 0.085, 3.4, 6, 1);
    poleGeo.translate(0, 1.7, 0);
    const cupGeo = own(mergeInto([
      new THREE.CylinderGeometry(0.17, 0.09, 0.2, 9, 1, true),
      (() => { const g = new THREE.TorusGeometry(0.17, 0.018, 4, 10); g.rotateX(Math.PI / 2); g.translate(0, 0.1, 0); return g; })(),
    ]));
    const ragGeo = new THREE.SphereGeometry(0.13, 8, 6);

    const poles: THREE.Matrix4[] = [];
    const cups: THREE.Matrix4[] = [];
    const rags: THREE.Matrix4[] = [];
    const litAt = new Set<number>();
    for (let i = 0; i < 10 && litAt.size < settings.dynamicLights; i += 2) litAt.add(i);

    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.15;
      const x = Math.cos(a) * TORCH_RADIUS;
      const z = Math.sin(a) * TORCH_RADIUS;
      const gy = groundHeight(x, z);
      const lean = (rng() - 0.5) * 0.07;
      poles.push(place(x, gy - 0.1, z, rng() * TAU, 1, lean, lean * 0.6));
      cups.push(place(x + lean * 3.2, gy + 3.28, z, rng() * TAU, 1));
      rags.push(place(x + lean * 3.4, gy + 3.42, z, 0, 1));
      // Every torch is lit, whether or not the tier could afford it a light.
      // The flame is art direction and the point light is an effect, and only
      // the second one is allowed to be budgeted away.
      root.add(fireMarker(x + lean * 3.5, gy + 3.48, z, 0.105, 0.54, "torch"));
      if (litAt.has(i)) {
        const fl = new THREE.PointLight(0xff8a33, 3.2, 13);
        fl.position.set(x, gy + 3.7, z);
        root.add(fl);
        pointLights.push(fl);
      }
    }
    field(poleGeo, poleMat, poles);
    field(cupGeo, cupMat, cups, null, false);
    field(ragGeo, ropeMat, rags, null, false);
  }

  // =========================================================================
  // The settlement — timber frame, wattle and daub, thatch
  //
  // These stand at 27–52 m, outside the key light's 24 m shadow cascade, so
  // nothing out here casts or receives a real shadow. A building whose eaves
  // cannot darken the wall under them reads as a painted slab however much
  // frame is in it, which is exactly what the last capture showed. So the
  // shading that sells these is baked into the vertices — the band under every
  // eave, the gable that lives in permanent shade beneath the verge, the step
  // behind every course of thatch, the contact line round every recessed daub
  // panel — and every member is sized to be *visible* at thirty metres rather
  // than to be right at three.
  // =========================================================================

  // Weathered oak rather than chocolate, so the frame reads as lines against
  // the daub instead of merging into the shadow it sits in.
  const timberMat = materials.tinted("oak", 0x3f3427, { repeat: 3 });
  const daubMat = materials.tinted("dirt", 0xa9a18e, { repeat: 2, roughness: 0.96 });
  // Not materials.get("hutRoof"): this one carries baked shading and its own
  // grade, and neither belongs in a catalog entry other modules may adopt.
  const thatchMat = materials.tinted("thatch", 0x51402a, { repeat: 10, roughness: 0.98 });
  const darkMat = materials.standard(0x0d0a06, 1, 0);
  const doorMat = materials.get("hutDoor");

  // three only reads a colour attribute if the material says so. These two are
  // this module's own tints — nothing else asks the library for dirt at this
  // colour or thatch at all — but the library caches by argument, so the flag
  // goes back the way it was found. Everything wearing them must carry the
  // attribute: a mesh with the flag set and no colours renders black.
  for (const m of [daubMat, thatchMat]) {
    if (!m.vertexColors) {
      m.vertexColors = true;
      m.needsUpdate = true;
      restore.push(() => { m.vertexColors = false; m.needsUpdate = true; });
    }
  }

  interface HutParts {
    timber: THREE.BufferGeometry[];
    daub: THREE.BufferGeometry[];
    thatch: THREE.BufferGeometry[];
    dark: THREE.BufferGeometry[];
  }

  /**
   * One slope of a thatched roof — built as courses, and as a solid rather than
   * as a sheet.
   *
   * Rows run from under the eave up to the ridge. The first three wrap the eave:
   * an underside tucked back, then the cut butt ends standing proud of it, then
   * the surface proper. That is what gives the roof a *thick* bottom edge and
   * the dark band beneath it that reads as an overhang — the one thing a plane
   * with a straight lower edge can never do. After that each course is two rows,
   * its butt proud and its head thin, and the step between one course's head and
   * the next one's butt is the ledge that makes thatch read as bundled straw
   * instead of as a shingled triangle.
   *
   * The tone written per row is the other half of it. Roofs at this distance are
   * lit flat-on and shadow nothing, so the courses have to carry their own step
   * shadow or the whole slope collapses into one value — which is precisely how
   * it read before.
   */
  function thatchSlope(
    halfW: number, eaveZ: number, eaveY: number, ridgeY: number,
    courses: number, rafters: number, sagAmp: number, seed: number,
  ): THREE.BufferGeometry {
    const cols = 20;
    const bundles = Math.max(5, Math.round(halfW * 2.8));
    // Thatch is a third of a metre thick at the butt and combed thin at the head.
    const butt = 0.3;
    const head = 0.12;
    const rows: Array<{ t: number; off: number; tone: number; lip: number }> = [
      { t: -0.019, off: -butt * 0.62, tone: 0.28, lip: 1 },
      { t: -0.008, off: butt * 0.26, tone: 0.6, lip: 1 },
      { t: 0, off: butt, tone: 1.08, lip: 1 },
    ];
    for (let k = 0; k < courses; k++) {
      if (k > 0) rows.push({ t: k / courses, off: butt * 0.9, tone: 1.05, lip: 0 });
      rows.push({ t: (k + 1) / courses, off: head, tone: 0.6, lip: 0 });
    }

    // Slope normal, in the ZY plane, pointing up and away from the ridge.
    const dz = -eaveZ;
    const dy = ridgeY - eaveY;
    const len = Math.hypot(dz, dy);
    const nz = dy / len;
    const ny = -dz / len;

    const pos: number[] = [];
    const uvs: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    for (const row of rows) {
      for (let j = 0; j <= cols; j++) {
        const u = j / cols;
        const x = (u - 0.5) * halfW * 2;
        // The verge is combed flat where it meets the gable. Without this the
        // course steps carry all the way to the edge and the roof's silhouette
        // reads as a staircase rather than as straw.
        const verge = smoothstep(0, 0.1, Math.min(u, 1 - u));
        const ripple = Math.abs(Math.sin(u * bundles * Math.PI)) * 0.045;
        const rough = (noise2(u * bundles * 1.7 + seed, row.t * 5 + seed * 3) - 0.5) * 0.06;
        const o = head * 0.5 + (row.off - head * 0.5 + ripple + rough) * verge;
        // A scalloped eave. The butts of the bottom course are never cut to a
        // line, and a ruler-straight bottom edge is the most artificial thing a
        // roof can have.
        const scallop = row.lip * (0.055 + ripple * 1.3) * verge;
        // Sag: the ridge dips between the gables, and the surface dips between
        // rafters. Neither reaches the eave, which is held straight by the plate.
        const dip = roofSag(u, sagAmp) - 0.02 * (1 - Math.cos(u * rafters * TAU)) * 0.5 * verge;
        // The course lines wander instead of running dead parallel. Straw is
        // laid by hand in bundles a foot wide; perfectly parallel courses read
        // as corrugated sheet. Damped toward the ridge, and off at the verge,
        // so neither of those joints has to absorb it.
        const wander = row.lip > 0 ? 0
          : (0.016 * Math.sin(u * 5.3 + seed * 6.1) + 0.009 * Math.sin(u * 11.7 - seed * 3.3))
            * verge * (1 - row.t * 0.55);
        const t = row.t + wander;
        const z = eaveZ * (1 - t) + nz * o;
        const y = eaveY + dy * t + ny * o - scallop + dip * clamp01(t);
        pos.push(x, y, z);
        uvs.push(x / 7, (t * len + o) / 7);
        // Brighter toward the ridge where the sky sees it, darker at the verge
        // under the barge board, and unevenly laid everywhere.
        const tone = row.tone * (0.9 + 0.16 * row.t) * (1 - 0.32 * (1 - verge))
          * (0.9 + 0.2 * noise2(u * bundles * 0.9 + seed * 2, row.t * 7));
        bakedTone(tone, col);
      }
    }
    // Rows sweep toward -z and columns toward +x, so the default winding faces
    // the ground. The far slope is this one turned about Y, never a mirrored
    // build, because mirroring inverts it again.
    gridIndices(rows.length, cols + 1, idx, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /**
   * The infill under a gable. The ridge runs along X, so the gables close the
   * short walls at x = ±w and the outline is built in the ZY plane.
   *
   * It is cut to the roof's own profile rather than to the wall's, because the
   * verge overhangs the wall: a triangle sized to the wall leaves a sliver of
   * open sky under each verge, and a sliver of sky at thirty metres reads as a
   * hole in the building.
   */
  function gable(halfSpan: number, base: number, apex: number, depth: number, x: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(-halfSpan, base);
    shape.lineTo(halfSpan, base);
    shape.lineTo(0, apex);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -depth / 2);
    g.rotateY(Math.PI / 2);
    g.translate(x, 0, 0);
    return g;
  }

  interface HutSpec {
    /** Half-length along the ridge, half-depth across it, wall height. */
    w: number;
    d: number;
    wallH: number;
    /** Ridge rise per unit of half-depth. Steeper is older and more Saxon. */
    pitch: number;
    seed: number;
    /** Smoke holes in the gables. A floor hearth has to vent somewhere. */
    vent?: boolean;
    /** A porch hood on posts. The hall is the one door anyone sheltered. */
    porch?: boolean;
  }

  /**
   * A hut. Sill, studs, mid rail, braces, wall plate, tie beam and rafters stand
   * proud of the daub they frame; the rafter feet project into the shadow under
   * the eave as a row of teeth; the roof overhangs far enough to shade the wall
   * and thick enough to have a bottom edge; the doorway is a recess with jambs,
   * a lintel, a threshold and a leaf that does not quite shut. It is built, not
   * extruded.
   */
  function buildHut(spec: HutSpec): HutParts {
    const { w, d, wallH, pitch, seed } = spec;
    const rand = seeded(seed);
    const P: HutParts = { timber: [], daub: [], thatch: [], dark: [] };
    // Sized for thirty metres. A 0.15 m post there is two pixels of what is
    // supposed to be the building's entire visual structure.
    const post = 0.2;
    const ridgeY = wallH + d * pitch;
    const eaveY = wallH - 0.08;
    // The overhang scales with the building — a fixed half metre is a deep eave
    // on the hall and an umbrella on a 4 m hut — and it is deliberately deep,
    // because an eave that does not clear its own wall plate shades nothing.
    const over = 0.4 + w * 0.13;
    // The verge overhangs far less than the eave, which is both how thatch is
    // laid and what keeps the barge boards close enough to the wall to be
    // plausibly carried by it.
    const verge = over * 0.45;
    const bays = 1 + 2 * Math.max(1, Math.round(w / 1.55));
    const zbays = Math.max(1, Math.round(d / 1.35));
    const rafters = bays + 1;
    const inset = 0.13;
    const sagAmp = 0.045 + w * 0.022;
    const eaveZ = d + over;
    const rise = ridgeY - eaveY;
    // Courses are spaced off the slope's real length, so a course on the hall is
    // the same depth of straw as a course on the smallest hut. Two rows each,
    // so this is also the roof's whole triangle budget — 0.62 m is the coarsest
    // spacing at which the steps still read at thirty metres.
    const slopeLen = Math.hypot(eaveZ, rise);
    const courses = Math.max(5, Math.round(slopeLen / 0.62));

    // ---- frame ----
    for (const zz of [-d, d]) {
      P.timber.push(bx(w * 2 + post * 2, 0.19, 0.26, 0, 0.095, zz));
      P.timber.push(bx(w * 2 + post * 2, 0.21, 0.28, 0, wallH, zz));
      P.timber.push(bx(w * 2, 0.13, 0.22, 0, wallH * 0.54, zz));
    }
    for (const xx of [-w, w]) {
      P.timber.push(bx(0.26, 0.19, d * 2, xx, 0.095, 0));
      P.timber.push(bx(0.28, 0.21, d * 2, xx, wallH, 0));
      P.timber.push(bx(0.22, 0.13, d * 2, xx, wallH * 0.54, 0));
    }
    // Bays are odd on purpose: the door goes in the middle one, and an even
    // count puts a stud exactly where the doorway has to be.
    for (let i = 0; i <= bays; i++) {
      const x = -w + (i / bays) * w * 2;
      for (const zz of [-d, d]) P.timber.push(bx(post, wallH, post * 1.15, x, wallH / 2, zz));
    }
    for (let i = 0; i <= zbays; i++) {
      const z = -d + (i / zbays) * d * 2;
      for (const xx of [-w, w]) P.timber.push(bx(post * 1.15, wallH, post, xx, wallH / 2, z));
    }
    // Braces on all four walls. Cheap, and the single strongest cue that a wall
    // is framed rather than painted.
    for (const zz of [-d, d]) {
      for (const s of [-1, 1]) {
        P.timber.push(bx(0.14, wallH * 0.9, 0.14, s * (w - 0.5), wallH * 0.45, zz, -s * 0.6));
      }
    }
    for (const xx of [-w, w]) {
      for (const s of [-1, 1]) {
        P.timber.push(bx(0.14, wallH * 0.82, 0.14, xx, wallH * 0.45, s * (d - 0.45), -s * 0.58, Math.PI / 2));
      }
    }
    // Tie beam and king post close the gable ends, which are the short walls.
    for (const xx of [-w, w]) {
      P.timber.push(bx(0.17, 0.18, d * 2 + 0.12, xx, wallH + 0.14, 0));
      P.timber.push(bx(0.15, rise, 0.15, xx, (ridgeY + wallH) / 2, 0));
    }
    // Rafters, sunk under the thatch and projecting past the wall. Their feet
    // are a row of teeth in the dark under the eave, and that row is most of
    // what says "roof" rather than "lid" at this range.
    {
      const nl = Math.hypot(eaveZ, rise);
      const ny = eaveZ / nl;
      const nz = rise / nl;
      const sink = 0.17;
      const footZ = d + over * 0.6;
      const len = Math.hypot(footZ, rise) + 0.12;
      for (let i = 0; i <= rafters; i++) {
        const x = -w + (i / rafters) * w * 2;
        for (const s of [-1, 1]) {
          // bx rotates Z then Y, so a member tilted in XY and turned a quarter
          // turn about Y ends up tilted in ZY — which is the plane a rafter
          // lives in, the ridge running along X.
          P.timber.push(bx(
            0.1, len, 0.12,
            x, (eaveY + ridgeY) / 2 - sink * ny, s * (footZ / 2 - sink * nz),
            Math.atan2(-s * footZ, rise), Math.PI / 2,
          ));
        }
      }
    }
    // Barge boards down each verge, just proud of the straw.
    {
      const vz = d + over * 0.85;
      const len = Math.hypot(vz, rise) + 0.1;
      for (const s of [-1, 1]) {
        for (const g of [-1, 1]) {
          P.timber.push(bx(
            0.1, len, 0.19,
            g * (w + verge + 0.05), (eaveY + ridgeY) / 2 - 0.04, (s * vz) / 2,
            Math.atan2(-s * vz, rise), Math.PI / 2,
          ));
        }
      }
    }

    // ---- daub ----
    const panelH = wallH - 0.32;
    for (let i = 0; i < bays; i++) {
      const x0 = -w + (i / bays) * w * 2 + post / 2;
      const x1 = -w + ((i + 1) / bays) * w * 2 - post / 2;
      const cx = (x0 + x1) / 2;
      const pw = x1 - x0;
      // Back wall solid; on the front the middle bay is the doorway.
      P.daub.push(bx(pw, panelH, 0.15, cx, panelH / 2 + 0.16, -d + inset));
      if (i !== (bays - 1) / 2) P.daub.push(bx(pw, panelH, 0.15, cx, panelH / 2 + 0.16, d - inset));
    }
    for (let i = 0; i < zbays; i++) {
      const z0 = -d + (i / zbays) * d * 2 + post / 2;
      const z1 = -d + ((i + 1) / zbays) * d * 2 - post / 2;
      for (const xx of [-w + inset, w - inset]) {
        P.daub.push(bx(0.15, panelH, z1 - z0, xx, panelH / 2 + 0.16, (z0 + z1) / 2));
      }
    }
    for (const xx of [-w + inset, w - inset]) {
      P.daub.push(gable(d + verge, eaveY - 0.03, ridgeY - 0.02, 0.14, xx));
    }

    // ---- doorway ----
    const bayW = (w * 2) / bays;
    const doorHalf = Math.min(0.58, bayW / 2 - 0.08);
    const lintelY = Math.min(2.0, wallH - 0.3);
    P.timber.push(bx(0.18, lintelY, 0.5, -doorHalf - 0.09, lintelY / 2, d - 0.06));
    P.timber.push(bx(0.18, lintelY, 0.5, doorHalf + 0.09, lintelY / 2, d - 0.06));
    P.timber.push(bx(doorHalf * 2 + 0.54, 0.22, 0.52, 0, lintelY + 0.11, d - 0.06));
    P.timber.push(bx(doorHalf * 2 + 0.44, 0.13, 0.56, 0, 0.065, d + 0.04));
    // The inside, most of a metre back from the jambs. A shallow black rectangle
    // reads as paint; this one has a floor's worth of depth behind it.
    P.dark.push(bx(doorHalf * 2 - 0.02, lintelY - 0.02, 0.9, 0, (lintelY - 0.02) / 2, d - 0.62));

    if (spec.porch) {
      // Far enough out to clear the main eave. Tucked inside it the porch is a
      // striped square stuck on the wall; half a metre proud of it, it is a
      // porch, and it puts a second roofline in the building's silhouette.
      const pz = d + over + 0.5;
      for (const s of [-1, 1]) P.timber.push(bx(0.16, 2.1, 0.16, s * (doorHalf + 0.46), 1.05, pz));
      P.timber.push(bx(doorHalf * 2 + 1.16, 0.17, 0.18, 0, 2.14, pz));
      // A lean-to over the door: the slope's own ridge edge lands on the wall.
      P.thatch.push(
        thatchSlope(doorHalf + 0.7, pz - d + 0.05, 2.16, lintelY + 0.95, 3, 2, 0.015, seed * 0.7)
          .translate(0, 0, d - 0.05),
      );
    }

    if (spec.vent) {
      // Smoke holes under the ridge. The gable infill is 0.14 thick, so the slot
      // is cut wider than that and stands proud of both faces — at this range a
      // black plaque and a black hole are the same pixels, and the surround is
      // what makes it read as an opening rather than as a stain.
      for (const s of [-1, 1]) {
        const vy = ridgeY - 0.66;
        P.dark.push(bx(0.2, 0.44, 0.62, s * (w - inset), vy, 0));
        for (const k of [-1, 1]) {
          P.timber.push(bx(0.13, 0.09, 0.74, s * (w - inset + 0.05), vy + k * 0.27, 0));
        }
      }
    }

    // ---- roof ----
    P.thatch.push(thatchSlope(w + verge, eaveZ, eaveY, ridgeY, courses, rafters, sagAmp, seed * 0.13));
    P.thatch.push(thatchSlope(w + verge, eaveZ, eaveY, ridgeY, courses, rafters, sagAmp, seed * 0.29).rotateY(Math.PI));
    {
      // The ridge roll, sagging with the slopes it caps rather than lying over
      // them in a straight line.
      const halfR = w + verge;
      const roll = new THREE.CylinderGeometry(0.2, 0.2, halfR * 2, 8, 7);
      const p = roll.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const bump = 1 + Math.sin(p.getY(i) * 3.1) * 0.1 + (rand() - 0.5) * 0.06;
        p.setX(i, p.getX(i) * bump);
        p.setZ(i, p.getZ(i) * bump);
      }
      p.needsUpdate = true;
      roll.rotateZ(Math.PI / 2);
      for (let i = 0; i < p.count; i++) {
        p.setY(i, p.getY(i) + roofSag(clamp01(p.getX(i) / (halfR * 2) + 0.5), sagAmp));
      }
      p.needsUpdate = true;
      roll.computeVertexNormals();
      // Shaded before the translate, while the roll's own centre is still y = 0.
      P.thatch.push(shade(roll, (_x, y) => 0.6 + 0.55 * clamp01((y + 0.2) / 0.4)).translate(0, ridgeY + 0.05, 0));

      // Liggers laid along the ridge and spars pegged across them, which is what
      // actually holds a ridge roll down. The old build stood the spars upright,
      // and at thirty metres a row of upright spars reads as pins in a cushion.
      for (const s of [-1, 1]) {
        for (const k of [0.15, 0.3]) {
          const path: Pt[] = [];
          const radii: number[] = [];
          for (let i = 0; i <= 6; i++) {
            const u = 0.04 + (i / 6) * 0.92;
            path.push({
              x: (u - 0.5) * halfR * 2,
              y: ridgeY + 0.06 + roofSag(u, sagAmp) - k * 0.62,
              z: s * k,
            });
            radii.push(0.033);
          }
          P.timber.push(tube(path, radii, 4, 6));
        }
      }
      // The spars lie *across* the ridge, nearly flat. Stood upright — which is
      // what the old build did — a row of them reads as pins in a cushion.
      for (let i = 0; i < 4; i++) {
        const u = 0.14 + i * 0.24;
        const x = (u - 0.5) * halfR * 2;
        const y = ridgeY + 0.02 + roofSag(u, sagAmp);
        for (const s of [-1, 1]) {
          P.timber.push(bx(0.045, 0.62, 0.045, x, y, 0, s * 1.24, Math.PI / 2));
        }
      }
    }

    // ---- baked shading on the daub ----
    // Everything here is a shadow the frame's own geometry would have cast if
    // the cascade reached this far: the eave's band, the gable's permanent
    // shade, the splash at the foot, and the contact line round each recessed
    // panel. The last one is what makes a framed wall read as framed.
    const daubShade = (x: number, y: number, z: number): number => {
      let s = 1 - 0.52 * smoothstep(wallH - 1.3, wallH - 0.02, y);
      if (y > wallH) {
        // The gable sits a whole overhang back from the verge and never sees
        // the sky. It used to be the brightest triangle in the frame.
        s = Math.min(s, 0.34 + 0.14 * clamp01((ridgeY - y) / Math.max(0.2, rise)));
      } else {
        const side = Math.abs(z) < d * 0.75;
        const along = side ? z : x;
        const span = side ? d : w;
        const pitchN = side ? (d * 2) / zbays : (w * 2) / bays;
        const q = (along + span) / pitchN;
        const edge = Math.abs(q - Math.round(q)) * pitchN;
        s *= 1 - 0.32 * (1 - smoothstep(post * 0.5, post * 0.5 + 0.42, edge));
        const vEdge = Math.min(Math.abs(y - 0.21), Math.abs(y - wallH), Math.abs(y - wallH * 0.54));
        s *= 1 - 0.28 * (1 - smoothstep(0.05, 0.4, vEdge));
      }
      s *= 1 - 0.36 * (1 - smoothstep(0, 0.62, y));
      // Daub is thrown on by hand over wattle and it is not a plane.
      return s * (0.9 + 0.2 * noise2(x * 2.7 + 11, y * 3.3 - 5));
    };
    for (const g of P.daub) shade(g, daubShade);
    return P;
  }

  {
    const doorGeo = own(mergeInto([
      bx(0.95, 1.8, 0.07, 0, 0, 0),
      bx(0.12, 1.8, 0.1, -0.3, 0, 0.02),
      bx(0.12, 1.8, 0.1, 0.3, 0, 0.02),
    ], 1 / 2));

    interface Variant {
      parts: HutParts;
      xf: THREE.Matrix4[];
      daub: THREE.Color[];
      thatch: THREE.Color[];
      /** Half-depth, for putting the door leaf on the front wall. */
      depth: number;
      /** Footprint radius, for finding ground that all four corners sit on. */
      foot: number;
    }
    // Three footprints rather than two, and none of them the same proportion:
    // a cot, a family hut and a long building. Walls are tall enough that the
    // eave line clears the palisade — at 2.2 m every hut in the village was
    // nothing but a roof from a standing camera.
    // Pitches are steep — 44° and up. Thatch has to be, to shed water, and a
    // shallow thatched roof is the silhouette of a modern shed.
    const variants: Variant[] = [
      { parts: buildHut({ w: 1.9, d: 1.5, wallH: 2.6, pitch: 1.5, seed: 0x1234 }), xf: [], daub: [], thatch: [], depth: 1.5, foot: 2.4 },
      { parts: buildHut({ w: 2.85, d: 2.05, wallH: 2.95, pitch: 1.45, seed: 0x5678, vent: true }), xf: [], daub: [], thatch: [], depth: 2.05, foot: 3.5 },
      { parts: buildHut({ w: 4.1, d: 1.95, wallH: 2.75, pitch: 1.52, seed: 0x9abc, vent: true }), xf: [], daub: [], thatch: [], depth: 1.95, foot: 4.5 },
    ];

    /**
     * Ground a building can stand on: the lowest point under its footprint, so
     * the downhill sill lands and the uphill one digs in. Two of the sites sit
     * across the ditch outside the earthwork, where the ground moves the better
     * part of a metre in three, and a single sample at the centre leaves half a
     * sill in mid-air there.
     */
    const footing = (x: number, z: number, foot: number): number => {
      let y = groundHeight(x, z);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        y = Math.min(y, groundHeight(x + Math.cos(a) * foot, z + Math.sin(a) * foot));
      }
      return y;
    };

    // A village, not a ring: clustered, at spread distances so the frame gets a
    // midground, most doors turned toward the moot — and a third of them stood
    // gable-on, because a settlement where every roof runs the same way reads as
    // a fence made of roofs.
    // The first entry sits on the gate's bearing. Every wall in the village is
    // otherwise behind the palisade from a standing camera — the ring covers
    // everything below about 3 m at this range — and the gateway is the one
    // aperture the frame has onto a whole building rather than onto its roof.
    const sites: Array<[number, number, number, number]> = [
      [GATE_MAIN, 32.0, 1, 0], [0.95, 27.0, 0, 0], [1.35, 32.5, 1, 1], [2.15, 29.5, 1, 0],
      [2.9, 27.2, 0, 1], [3.7, 35.5, 2, 0], [4.6, 29.0, 0, 0], [5.35, 33.0, 1, 1],
      [5.95, 43.0, 2, 0], [2.45, 46.5, 1, 0], [4.05, 50.0, 0, 1], [3.25, 41.0, 0, 1],
    ];
    const tc = new THREE.Color();
    for (const [a0, d0, v, turn] of sites) {
      const a = a0 + (rng() - 0.5) * 0.16;
      const dist = d0 + (rng() - 0.5) * 3;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      const face = facing(x, z) + turn * (Math.PI / 2) + (rng() - 0.5) * 0.45;
      const s = 0.92 + rng() * 0.26;
      const V2 = variants[v];
      const gy = footing(x, z, V2.foot * s * 0.8);
      V2.xf.push(place(x, gy - 0.06, z, face, s));
      // Limewash or bare daub, weathered or freshly thatched. Per instance,
      // because a village whose every wall is the same colour is a texture.
      const wash = rng();
      V2.daub.push(tc.setRGB(0.9 + wash * 0.26, 0.93 + wash * 0.16, 1.02 - wash * 0.18).clone());
      const straw = rng();
      V2.thatch.push(tc.setRGB(0.84 + straw * 0.36, 0.88 + straw * 0.24, 1.0 - straw * 0.22).clone());
      // A door leaf, left ajar. Not instanced with the hut because the angle is
      // the point: every closed door in a village is the same door.
      const dm = new THREE.Mesh(doorGeo, doorMat);
      // On the wall's outer face, clear of the dark box in the recess behind it.
      const dz = (V2.depth - 0.04) * s;
      dm.position.set(x + Math.sin(face) * dz, gy + 0.85 * s, z + Math.cos(face) * dz);
      dm.rotation.y = face + (rng() - 0.5) * 0.9;
      dm.scale.setScalar(s);
      dm.castShadow = true;
      root.add(dm);
    }

    for (const v of variants) {
      field(own(mergeInto(v.parts.timber, 1 / 3)), timberMat, v.xf);
      field(own(mergeInto(v.parts.daub, 1 / 2)), daubMat, v.xf, v.daub);
      field(own(mergeInto(v.parts.thatch)), thatchMat, v.xf, v.thatch);
      field(own(mergeInto(v.parts.dark, 1)), darkMat, v.xf, null, false);
    }

    // The hall. One of these, so it is meshes rather than instances, and it gets
    // what the huts do not: a porch, carved finials, and a hearth burning
    // somewhere inside where the doorway can show it.
    {
      const HW = 4.6;
      const HD = 3.0;
      const HWALL = 3.4;
      const HRIDGE = HWALL + HD * 1.35;
      const hall = buildHut({ w: HW, d: HD, wallH: HWALL, pitch: 1.35, seed: 0xbeef, vent: true, porch: true });
      const hx = Math.cos(HALL_A) * HALL_D;
      const hz = Math.sin(HALL_A) * HALL_D;
      const g = new THREE.Group();
      const add = (geo: THREE.BufferGeometry, mat: THREE.Material, cast = true) => {
        const m = new THREE.Mesh(own(geo), mat);
        m.castShadow = cast;
        g.add(m);
      };
      add(mergeInto(hall.timber, 1 / 3), timberMat);
      add(mergeInto(hall.daub, 1 / 2), daubMat);
      add(mergeInto(hall.thatch), thatchMat);
      add(mergeInto(hall.dark, 1), darkMat, false);
      // Carved gable finials at the apex of each short wall — the hall is the
      // only building in the settlement anyone bothered to decorate.
      add(mergeInto([-1, 1].flatMap((s) => [
        bx(0.14, 1.6, 0.14, s * (HW + 0.05), HRIDGE + 0.5, 0, s * 0.22),
        bx(0.16, 0.16, 0.62, s * (HW + 0.28), HRIDGE + 1.15, 0, 0, 0),
      ]), 1 / 3), timberMat);
      // A hearth burning somewhere inside, seen through the door. At dusk it is
      // the warmest thing in the background and it costs one quad — but only if
      // it sits *in front of* the dark box behind the doorway rather than
      // inside it, which is 0.9 m deep now and would swallow it whole.
      //
      // `hearthGlow`, not `bonfireFlame`: this quad is ~12 px on screen, so a
      // flat opaque emissive drew a hard orange square that read as a UI bug
      // rather than as firelight. It is bigger than the old one because a
      // radial falloff spends most of its area on the skirt.
      const hearth = new THREE.Mesh(own(new THREE.PlaneGeometry(0.94, 0.66)), materials.get("hearthGlow"));
      hearth.position.set(0, 0.42, HD - 0.14);
      g.add(hearth);
      g.position.set(hx, footing(hx, hz, 4.4) - 0.06, hz);
      g.rotation.y = facing(hx, hz) + 0.18;
      root.add(g);
    }

    // Corn ricks. Three of these and the settlement is somewhere people work
    // rather than a row of roofs, and they cost one instanced draw.
    {
      const rickGeo = (() => {
        const cone = new THREE.ConeGeometry(1.2, 2.3, 13, 6);
        const p = cone.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < p.count; i++) {
          const t = clamp01((p.getY(i) + 1.15) / 2.3);
          // A bell rather than a cone, stepped where the courses are, so the
          // silhouette has shoulders and ledges in it.
          const swell = (1 + 0.22 * Math.sin(t * Math.PI)) * (1 + 0.05 * Math.sin(t * 15))
            * (0.95 + noise2(p.getX(i) * 3, p.getZ(i) * 3) * 0.11);
          p.setX(i, p.getX(i) * swell);
          p.setZ(i, p.getZ(i) * swell);
        }
        p.needsUpdate = true;
        cone.computeVertexNormals();
        cone.translate(0, 1.15, 0);
        return shade(cone, (_x, y) => 0.52 + 0.55 * clamp01(y / 2.3) + 0.12 * Math.sin(y * 15));
      })();
      const ricks: THREE.Matrix4[] = [];
      for (const [a, dr] of [[1.72, 31.0], [4.95, 30.0], [3.42, 44.0]] as const) {
        const x = Math.cos(a) * dr;
        const z = Math.sin(a) * dr;
        ricks.push(place(x, footing(x, z, 1.2) - 0.12, z, rng() * TAU, 0.85 + rng() * 0.35));
      }
      field(rickGeo, thatchMat, ricks);
    }
  }

  // =========================================================================
  // Depth beyond the settlement — the wood
  // =========================================================================
  {
    // Bark and leaf, per species. Six cached materials for the whole wood; the
    // species that share a colour share their state, and the draw is decided by
    // the geometry anyway.
    const barkOak = materials.tinted("oak", 0x3a2c1c, { repeat: 2 });
    const barkPale = materials.tinted("oak", 0x8b8474, { repeat: 2 });
    const barkRed = materials.tinted("oak", 0x4e3320, { repeat: 2 });
    const barkDead = materials.tinted("plank", 0x6b6459, { repeat: 2 });
    // Greener and cooler than the wood they stand in front of, and darker with
    // it: foliage that grades to the same tan as the soil is the whole reason
    // the last capture read as one colour.
    const leafOak = materials.tinted("grass", 0x35471c, { repeat: 1 });
    const leafLight = materials.tinted("grass", 0x475820, { repeat: 1 });
    const leafDark = materials.tinted("grass", 0x24382a, { repeat: 1 });

    interface Kind {
      wood: THREE.BufferGeometry;
      leaf: THREE.BufferGeometry | null;
      bark: THREE.Material;
      foliage: THREE.Material;
      /**
       * Mid-height in metres, which the age multiplier scales. The instance
       * scale is uniform, so this is the species' girth and crown spread too.
       */
      mid: number;
      xf: THREE.Matrix4[];
      barkTint: THREE.Color[];
      leafTint: THREE.Color[];
    }
    const kinds: Kind[] = [];
    const kind = (
      spec: TreeSpec, seed: number, bark: THREE.Material, foliage: THREE.Material,
      lo: number, hi: number,
    ): Kind => {
      const built = buildTree(spec, seed);
      const k: Kind = { ...built, bark, foliage, mid: (lo + hi) / 2, xf: [], barkTint: [], leafTint: [] };
      kinds.push(k);
      return k;
    };

    /**
     * Height, as an age rather than as a uniform draw. A stand is one species,
     * so if the only variation inside it is ±2 m the whole treeline reads as one
     * element repeated; a real wood has saplings under mature trees, and the
     * skew puts most of them in the middle with a few standing well clear.
     */
    const age = (k: Kind) => k.mid * (0.7 + Math.pow(rng(), 0.75) * 0.66);

    // Five species for the treeline at one division per limb, and three of them
    // built again at two for the near band, where a tree is three hundred pixels
    // tall and one fork is visibly one fork.
    // `lift` is doing most of the work here, and it is a narrow window: too
    // little and a limb that left the bole at 30° never comes back, so the crown
    // is twice as wide as it is tall and the treeline reads as an olive grove;
    // too much and the limbs bend back parallel to the trunk and the tree reads
    // as a palm with a tuft on it.
    const OAK: TreeSpec = { bole: 0.34, girth: 0.055, sweep: 0.055, limbs: 4, depth: 1, diverge: 0.58, reach: 0.33, lift: 0.44, clump: 0.145, aspect: 0.88 };
    const ASH: TreeSpec = { bole: 0.5, girth: 0.04, sweep: 0.045, limbs: 3, depth: 1, diverge: 0.46, reach: 0.34, lift: 0.6, clump: 0.135, aspect: 1.0 };
    const BIRCH: TreeSpec = { bole: 0.56, girth: 0.027, sweep: 0.095, limbs: 3, depth: 1, diverge: 0.4, reach: 0.26, lift: 0.45, clump: 0.1, aspect: 1.08 };
    const PINE: TreeSpec = { bole: 0.95, girth: 0.038, sweep: 0.045, limbs: 0, depth: 0, diverge: 0, reach: 0.2, lift: 0, clump: 0.1, aspect: 0.5, conifer: true, crownBase: 0.42 };
    const SNAG: TreeSpec = { bole: 0.66, girth: 0.045, sweep: 0.08, limbs: 3, depth: 1, diverge: 0.75, reach: 0.22, lift: 0.35, clump: 0, aspect: 1, dead: true };

    const live = [
      kind(OAK, 0x0a11, barkOak, leafOak, 5, 9),
      kind(ASH, 0x0a13, barkOak, leafLight, 7, 11),
      kind(BIRCH, 0x0a17, barkPale, leafLight, 6.5, 10),
      kind(PINE, 0x0a1d, barkRed, leafDark, 9, 15),
    ];
    const snag = kind(SNAG, 0x0a23, barkDead, leafOak, 4.5, 8);
    // The near band divides twice and carries smaller clumps for it. Same crown
    // volume, three times the pieces in its edge — which is what a tree three
    // hundred pixels tall needs and what one twenty pixels tall would waste.
    const near = [
      kind({ ...OAK, depth: 2, clump: OAK.clump * 0.78 }, 0x1b31, barkOak, leafOak, 6.5, 9.5),
      kind({ ...ASH, depth: 2, clump: ASH.clump * 0.8 }, 0x1b37, barkOak, leafOak, 8, 11),
      kind({ ...BIRCH, depth: 2, clump: BIRCH.clump * 0.82 }, 0x1b3d, barkPale, leafLight, 7, 10),
    ];

    const hallX = Math.cos(HALL_A) * HALL_D;
    const hallZ = Math.sin(HALL_A) * HALL_D;
    const tc = new THREE.Color();
    const push = (k: Kind, x: number, z: number, h: number): void => {
      const lean = 0.03 + rng() * 0.05;
      const bearing = rng() * TAU;
      k.xf.push(new THREE.Matrix4().compose(
        V.set(x, groundHeight(x, z) - h * 0.035, z),
        Q.setFromEuler(E.set(Math.cos(bearing) * lean, rng() * TAU, Math.sin(bearing) * lean, "YXZ")),
        new THREE.Vector3(h, h, h),
      ));
      const bt = 0.82 + rng() * 0.34;
      k.barkTint.push(tc.setRGB(bt, bt * (0.97 + rng() * 0.06), bt * 0.94).clone());
      // Autumn is coming in unevenly, as it does. The spread here is wide on
      // purpose: a treeline at one value is a wall.
      const dry = clamp01(fbm(x * 0.06 + 21, z * 0.06 - 9, 2) * 1.5 - 0.25);
      const sh = 0.66 + rng() * 0.38;
      k.leafTint.push(tc.setRGB(sh * (1 + dry * 0.3), sh * (1 + dry * 0.08), sh * (1 - dry * 0.26)).clone());
    };

    for (let i = 0; i < scatter(210); i++) {
      const a = rng() * TAU;
      // Weighted outward, and thinned where the village is.
      const dist = 40 + Math.pow(rng(), 0.62) * 96;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      if (dist < 55 && rng() < 0.45) continue;
      if (dist < 52 && Math.hypot(x - hallX, z - hallZ) < 9) continue;
      // Trees mass in stands; a uniform scatter reads as an orchard.
      if (fbm(x * 0.017 + 5, z * 0.017 - 3, 2) < 0.42) continue;
      // And a stand is mostly one species. A second, much longer field decides
      // which, with a sixth of the trees drawn from anywhere so no edge between
      // two stands is a straight line.
      //
      // Death is drawn separately and rarely. Taking the species and the dead
      // flag off the same field gives whole stands of snags, and a copse of ten
      // bare trees does not read as one dead tree — it reads as missing foliage.
      let k = snag;
      if (rng() >= 0.055) {
        const stand = fbm(x * 0.0115 + 71.3, z * 0.0115 - 19.6, 2);
        let s = Math.floor(clamp01(stand * 1.5 - 0.16) * live.length);
        if (rng() < 0.32) s = Math.floor(rng() * live.length);
        k = live[Math.min(live.length - 1, s)];
      }
      push(k, x, z, age(k));
    }

    // Close trees, which do cast, so the midground has structure rather than
    // being a gap between the palisade and the treeline. Enough of them that
    // most bearings out of the moot have one, since a camera that can point
    // anywhere finds a bare middle distance from three quarters of the ring.
    for (let i = 0; i < scatter(15); i++) {
      const a = rng() * TAU;
      const dist = 32 + rng() * 14;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      // Nothing grows through the hall's roof, and a big tree at 35 m parked in
      // front of a hut deletes the only midground the frame has.
      if (Math.hypot(x - hallX, z - hallZ) < 12) continue;
      const k = near[i % near.length];
      push(k, x, z, age(k) * 1.08);
    }

    for (const k of kinds) {
      // Nothing out here is inside the shadow cascade; asking for shadow maps of
      // two hundred trees buys a frame cost and no pixels. The near band is
      // inside it at the edge, and gets one for the same price as being wrong.
      const cast = near.includes(k);
      field(k.wood, k.bark, k.xf, k.barkTint, cast);
      if (k.leaf) field(k.leaf, k.foliage, k.xf, k.leafTint, cast);
    }

    // Scrub, thickest at the wood's margin — which is where it grows, and also
    // where the treeline needs its feet hidden.
    {
      const bushes = [buildBush(0x51a3), buildBush(0x9c2f), buildBush(0x2ed1)];
      const buckets: THREE.Matrix4[][] = [[], [], []];
      const tints: THREE.Color[][] = [[], [], []];
      for (let i = 0; i < scatter(170); i++) {
        const a = rng() * TAU;
        const dist = 26 + Math.pow(rng(), 0.7) * 104;
        const x = Math.cos(a) * dist;
        const z = Math.sin(a) * dist;
        if (Math.hypot(x - hallX, z - hallZ) < 9) continue;
        const stand = fbm(x * 0.017 + 5, z * 0.017 - 3, 2);
        // Densest in the margin band, sparse in the open, sparse deep in the wood.
        const margin = 1 - Math.min(1, Math.abs(stand - 0.42) / 0.16);
        if (rng() > 0.2 + margin * 0.8) continue;
        const v = i % 3;
        const s = 0.75 + rng() * 1.05;
        buckets[v].push(place(x, groundHeight(x, z) - 0.14 * s, z, rng() * TAU, s, (rng() - 0.5) * 0.2));
        const sh = 0.7 + rng() * 0.55;
        tints[v].push(new THREE.Color(sh * 1.05, sh, sh * 0.82));
      }
      for (let v = 0; v < 3; v++) field(bushes[v], leafOak, buckets[v], tints[v], false);
    }
  }

  // =========================================================================
  // Stone
  // =========================================================================
  const rockMat = materials.get("rock");
  const rockGeos = (() => {
    const out: THREE.BufferGeometry[] = [];
    for (let v = 0; v < 3; v++) {
      const rand = seeded(0x77aa + v * 313);
      const g = new THREE.IcosahedronGeometry(0.5, 1);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const n = 0.68 + noise2(p.getX(i) * 3 + v * 7, p.getZ(i) * 3 - v * 5) * 0.62;
        p.setXYZ(i, p.getX(i) * n, p.getY(i) * n * (0.5 + rand() * 0.25), p.getZ(i) * n);
      }
      p.needsUpdate = true;
      g.computeVertexNormals();
      out.push(g);
    }
    return out;
  })();
  {
    const buckets: THREE.Matrix4[][] = [[], [], []];
    for (let i = 0; i < scatter(46); i++) {
      const a = rng() * TAU;
      const d = 20 + Math.pow(rng(), 0.7) * 42;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const s = 0.35 + rng() * 1.15;
      // Sunk, not balanced on the surface. A rock resting on a plane is a prop.
      buckets[i % 3].push(place(x, groundHeight(x, z) - s * 0.3, z, rng() * TAU, s, (rng() - 0.5) * 0.4, (rng() - 0.5) * 0.4));
    }
    for (let v = 0; v < 3; v++) field(rockGeos[v], rockMat, buckets[v]);
    for (const g of rockGeos) own(g);
  }

  // =========================================================================
  // Banners
  // =========================================================================
  const banners: Array<{ mesh: THREE.Mesh; base: Float32Array; phase: number }> = [];
  {
    const poleMat = materials.get("poleWood");
    const poleGeo = own(mergeInto([
      (() => { const g = new THREE.CylinderGeometry(0.06, 0.085, 5.6, 6); g.translate(0, 2.8, 0); return g; })(),
      bx(1.25, 0.09, 0.09, 0, 5.28, 0),
      bx(0.1, 0.1, 0.1, 0, 5.62, 0),
    ]));
    const poles: THREE.Matrix4[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      const bxp = Math.cos(a) * 22.6;
      const bzp = Math.sin(a) * 22.6;
      const gy = groundHeight(bxp, bzp);
      poles.push(place(bxp, gy - 0.1, bzp, rng() * TAU, 1, (rng() - 0.5) * 0.05));

      // A cloth grid rather than a box, so the banner can actually ripple. Four
      // of these is 200 vertices; rotating a box was never going to read as linen.
      const geo = own(new THREE.PlaneGeometry(0.95, 1.95, 6, 10));
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < p.count; v++) {
        // A tattered, scalloped hem — a banner that has been to a moot before.
        const t = clamp01(0.5 - p.getY(v) / 1.95);
        if (t > 0.92) p.setY(v, p.getY(v) + Math.abs(Math.sin(p.getX(v) * 7.4)) * 0.16);
      }
      p.needsUpdate = true;
      geo.computeVertexNormals();
      const mat = materials.get(i % 2 === 0 ? "bannerRed" : "bannerBlue");
      // Cloth has two sides. These two materials are only ever worn by banners.
      if (mat instanceof THREE.MeshStandardMaterial && mat.side !== THREE.DoubleSide) {
        const prevSide = mat.side;
        mat.side = THREE.DoubleSide;
        restore.push(() => { mat.side = prevSide; });
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(bxp, gy + 4.2, bzp);
      mesh.rotation.y = a;
      mesh.castShadow = true;
      root.add(mesh);
      banners.push({
        mesh,
        base: Float32Array.from((geo.attributes.position as THREE.BufferAttribute).array),
        phase: i * 1.7,
      });
    }
    field(poleGeo, poleMat, poles);
  }

  // =========================================================================
  // The bonfire
  // =========================================================================
  {
    const logMat = materials.get("bonfireLog");
    const bfy = groundHeight(0, 0);
    const bonfire = new THREE.Group();
    bonfire.position.set(0, bfy, 0);

    // A laid fire: a tripod of long logs over a criss-cross base, plus split
    // billets fallen in against it. Eight cylinders in a starfish was a campfire
    // icon, not a fire someone built.
    const logs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.2;
      // 42° off vertical, not 73°. At the old lean the "tripod" lay almost flat
      // and threw log tips out to 2.5 m — past its own hearth stones at 1.75 m,
      // which reads as scattered poles rather than a laid fire, and puts solid
      // geometry exactly where the crowd stands. Standing them up keeps every
      // tip inside the ring and gives the flame something to climb.
      const lean = 0.74 - (i % 2) * 0.09;
      const g = new THREE.CylinderGeometry(0.075, 0.095, 1.9, 6);
      g.translate(0, 0.95, 0);
      g.rotateX(lean);
      g.rotateY(a);
      g.translate(Math.cos(a) * 0.72, 0.02, Math.sin(a) * 0.72);
      logs.push(g);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.9;
      const g = new THREE.CylinderGeometry(0.085, 0.085, 1.5 + rng() * 0.5, 6);
      g.rotateZ(Math.PI / 2 + (rng() - 0.5) * 0.3);
      g.rotateY(a);
      // Bedded, not balanced on the turf: the bottom course used to leave 15 mm
      // of daylight under it all the way round, which is the tell that separates
      // a prop from a thing standing on ground.
      g.translate(Math.cos(a) * 0.28, 0.055 + (i % 2) * 0.16, Math.sin(a) * 0.28);
      logs.push(g);
    }

    // The core, and it is the fix for the panel's "warriors' legs pass straight
    // through the fire". Nobody's legs are actually inside it — the brawl ring
    // is 4.2 m out and the widest thing here reaches 2.0 — but the fire was
    // *hollow*, and that is the same defect through the camera. Seven poles on a
    // 0.72 m ring all lean outward, so between about 0.35 m and 1.1 m the middle
    // of the fire was empty and the far side of the arena showed through it. In
    // `brawl` the follow camera puts a warrior at (0, −4.2) on its own axis
    // through the fire, and his shins arrive at that gap: from 8.9 m at 2.05 m
    // eye height his feet cross the fire's plane at 0.66 m and his knees at
    // 1.00 m, dead centre of the hole.
    //
    // A laid fire is not hollow at the bottom, it is packed, so the fix and the
    // art direction are the same change. An inner bundle stood nearly upright
    // fills the axis, six brands leaned against the tripod close the ring, and
    // two cross-pieces lie over the criss-cross at knee height.
    //
    // CylinderGeometry lays v over each log's own length, so a 1.0 m brand
    // would wear a whole tile of bark against the 1.9 m poles beside it and
    // come back at twice their grain frequency. The poles set the fire's texel
    // density because they are what the silhouette is made of; the short wood
    // is rescaled to them.
    const grain = (g: THREE.BufferGeometry, len: number, ref: number): THREE.BufferGeometry => {
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let v = 0; v < uv.count; v++) uv.setY(v, uv.getY(v) * (len / ref));
      uv.needsUpdate = true;
      return g;
    };
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.45;
      const len = 1.12 + (i % 2) * 0.14;
      const g = grain(new THREE.CylinderGeometry(0.055, 0.07, len, 5), len, 1.9);
      g.translate(0, len / 2, 0);
      g.rotateX(0.13 + (i % 2) * 0.05);
      g.rotateY(a);
      g.translate(Math.cos(a) * 0.16, -0.02, Math.sin(a) * 0.16);
      logs.push(g);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 1.05;
      const len = 1.0 + (i % 3) * 0.11;
      const g = grain(new THREE.CylinderGeometry(0.06, 0.078, len, 5), len, 1.9);
      g.translate(0, len / 2, 0);
      g.rotateX(0.3 + (i % 3) * 0.06);
      g.rotateY(a);
      g.translate(Math.cos(a) * 0.34, -0.02, Math.sin(a) * 0.34);
      logs.push(g);
    }
    for (let i = 0; i < 2; i++) {
      const a = 0.55 + i * 1.85;
      const g = grain(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 5), 1.2, 1.9);
      g.rotateZ(Math.PI / 2 + (i ? 0.11 : -0.09));
      g.rotateY(a);
      g.translate(Math.cos(a) * 0.09, 0.44 + i * 0.19, Math.sin(a) * 0.09);
      logs.push(g);
    }
    const logMesh = new THREE.Mesh(own(mergeInto(logs)), logMat);
    logMesh.castShadow = true;
    bonfire.add(logMesh);

    // The coal bed. Solid lumps, so it keeps the opaque entry rather than the
    // hearth's glow — an ember has a surface and a silhouette; light spill has
    // neither, and giving one the other's material is how the hearth became a
    // square in the first place.
    {
      const coals: THREE.Matrix4[] = [];
      for (let i = 0; i < 26; i++) {
        const a = rng() * TAU;
        const d = rng() * 0.95;
        coals.push(place(Math.cos(a) * d, 0.04 + rng() * 0.06, Math.sin(a) * d, rng() * TAU, 0.06 + rng() * 0.09));
      }
      const coalGeo = own(new THREE.IcosahedronGeometry(1, 0));
      const inst = new THREE.InstancedMesh(coalGeo, materials.get("bonfireFlame"), coals.length);
      for (let i = 0; i < coals.length; i++) inst.setMatrixAt(i, coals[i]);
      inst.instanceMatrix.needsUpdate = true;
      bonfire.add(inst);
    }

    // The flame itself belongs to vfx.ts. Three nested lathe bodies got the
    // silhouette off the cone the bar complained about, but a mesh edge is a
    // mesh edge: fire has no surface, and the thing that finally sells it is a
    // stack of eroded billboards that boil. This marker is the seam.
    bonfire.add(fireMarker(0, 0.2, 0, 0.62, 2.15, "bonfire"));

    // The arena's hero light — never budgeted away, the frame is built on it.
    const fireLight = new THREE.PointLight(0xff8830, 4, 18);
    fireLight.position.y = 1.8;
    bonfire.add(fireLight);
    pointLights.push(fireLight);

    // Stones ringing the fire, and the firewood waiting beside it.
    {
      const ring: THREE.Matrix4[] = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + rng() * 0.2;
        const d = 1.75 + rng() * 0.2;
        ring.push(place(Math.cos(a) * d, bfy - 0.08, Math.sin(a) * d, rng() * TAU, 0.28 + rng() * 0.22, (rng() - 0.5) * 0.5));
      }
      field(rockGeos[1], rockMat, ring);

      // Out past CLEAR_RADIUS, and mirrored across the fire onto the far side.
      // At (-3.4, 2.6) it sat 0.6 m from a brawl spawn and the warrior standing
      // there had both shins through it; the obvious fix — the same bearing,
      // further out — lands in the -x/+z quadrant, which is where every framed
      // character shot puts its subject. Beyond the hearth instead: still
      // firewood waiting by the fire, clear of the ring and of the portrait.
      const px = -5.4;
      const pz = -4.1;
      const py = groundHeight(px, pz);
      // The billets lie along AX; the courses stack *across* it. That is the
      // second half of what made this read as loose logs dropped on the turf in
      // `arena`: the rows were stepped along world x, which on this bearing is
      // 92% of the billets' own length, so each course slid down its neighbour
      // instead of sitting beside it and the stack had no coursing to read.
      const AX = 0.4;
      // Its own stream, not the arena's. Every scatter after this block draws
      // from `rng` in order, so spending twenty-two extra numbers here would
      // move every arrow, bone and barrel in the moot — and an A/B against a
      // previous capture would then be measuring the debris, not the woodpile.
      const jig = seeded(0x1f0a3c7d);
      const ux = Math.cos(AX);
      const uz = -Math.sin(AX);
      const wx = -uz;
      const wz = ux;
      const pile: THREE.Matrix4[] = [];
      for (let row = 0; row < 3; row++) {
        const n = 4 - row;
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * 0.225;
          // Sunk 45 mm into the mud rather than floating 10 mm above it, and
          // shuffled a little along its own length — a rick that has been drawn
          // from all evening does not stay flush at the ends.
          const slide = (jig() - 0.5) * 0.16;
          pile.push(place(
            px + wx * off + ux * slide, py + 0.055 + row * 0.195, pz + wz * off + uz * slide,
            AX + (jig() - 0.5) * 0.05, 1, 0, Math.PI / 2,
          ));
        }
      }
      const billet = new THREE.CylinderGeometry(0.1, 0.11, 1.5, 6);
      field(own(billet), logMat, pile);

      // Crib stakes driven at both ends, which is what holds a rick up and what
      // makes it read as something someone built rather than geometry parked on
      // the grass. They also give the stack a contact shadow that is not just
      // its own underside.
      const stakes: THREE.Matrix4[] = [];
      for (let e = 0; e < 2; e++) {
        const sx = px + ux * (e ? 0.84 : -0.84);
        const sz = pz + uz * (e ? 0.84 : -0.84);
        for (let s = 0; s < 2; s++) {
          const o = s ? 0.42 : -0.42;
          // Leaned outward across the courses, because that is the direction the
          // stack pushes them. Yaw is fixed rather than random for the same
          // reason: a crib stake that leans in a random direction is not doing
          // the job the crib stake is there to explain.
          stakes.push(place(
            sx + wx * o, groundHeight(sx + wx * o, sz + wz * o) - 0.22, sz + wz * o,
            AX + Math.PI / 2, 1, 0, (0.1 + jig() * 0.07) * (s ? 1 : -1),
          ));
        }
      }
      field(own(grain(new THREE.CylinderGeometry(0.045, 0.055, 0.98, 5), 0.98, 1.5).translate(0, 0.49, 0)), logMat, stakes);

      // Two billets rolled off the end and lying where they fell. The stack is
      // tidy; the ground around a woodpile never is.
      const spill: THREE.Matrix4[] = [];
      for (let i = 0; i < 2; i++) {
        const dx = px + ux * (1.15 + i * 0.36) + wx * (i ? 0.34 : -0.28);
        const dz = pz + uz * (1.15 + i * 0.36) + wz * (i ? 0.34 : -0.28);
        spill.push(place(dx, groundHeight(dx, dz) + 0.085, dz, AX + (i ? 0.9 : -1.3), 1, 0, Math.PI / 2));
      }
      field(own(grain(new THREE.CylinderGeometry(0.088, 0.095, 1.05, 6), 1.05, 1.5)), logMat, spill);
    }

    root.add(bonfire);
  }

  // =========================================================================
  // The runestone
  // =========================================================================
  {
    const stone = new THREE.Group();
    // An irregular slab, not a box: the outline is a noisy polygon extruded and
    // then pinched toward the top, which is what a raised stone actually is.
    const shape = new THREE.Shape();
    // Kept, because the carved band laid on the face has to know how wide the
    // stone is at each height — see halfWidthAt below.
    const outline: THREE.Vector2[] = [];
    const pts = 14;
    for (let i = 0; i <= pts; i++) {
      const t = i / pts;
      const a = t * TAU;
      const rx = 0.62 * (1 + noise2(Math.cos(a) * 2 + 3, Math.sin(a) * 2 - 1) * 0.3);
      const ry = 1.85 * (1 + noise2(Math.cos(a) * 2 - 7, Math.sin(a) * 2 + 4) * 0.22);
      const x = Math.cos(a) * rx;
      const y = Math.sin(a) * ry * (Math.sin(a) > 0 ? 0.95 : 0.7);
      outline.push(new THREE.Vector2(x, y));
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    const slab = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1, curveSegments: 1 });
    slab.translate(0, 0, -0.21);
    {
      const p = slab.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const t = clamp01((p.getY(i) + 1.9) / 3.8);
        const pinch = 1 - t * 0.22;
        p.setX(i, p.getX(i) * pinch + noise2(p.getY(i) * 4, p.getZ(i) * 4) * 0.04);
        p.setZ(i, p.getZ(i) * pinch);
      }
      p.needsUpdate = true;
      slab.computeVertexNormals();
    }
    projectUv(slab, 1 / 1);
    const body = new THREE.Mesh(own(slab), materials.get("runestone"));
    body.position.y = 1.95;
    body.rotation.z = 0.05;
    body.castShadow = true;
    stone.add(body);

    // Carved band and runes, cut into the *front* face.
    //
    // They used to be 0.5 m deep boxes in a 0.42 m slab, sunk on the slab's
    // centre line, so every stroke stood proud of both faces at once — and with
    // emissiveIntensity 8 behind them they read in arena, duel, brawl and
    // lineup as glowing dashes floating free in the air beside the stone. The
    // lowest stroke and the lowest bar of the border hung off the slab's foot
    // outright, because both were authored in the group's space while the slab
    // lives 1.95 m up inside it; and none of it inherited the slab's lean.
    //
    // So: parented to the slab, authored in its space, and laid on the surface
    // the extrusion actually has. There is no CSG here to cut a channel with, so
    // a stroke is a shallow box whose bulk is inside the stone and whose face
    // finishes a few millimetres proud — which is what an inlaid rune looks like
    // in any case, and gives the glow the edge the old comment claimed it had.
    const CUT = 0.07;
    /**
     * Front surface of the slab at a height in the slab's own space. The
     * extrusion's front cap sits at depth/2 + bevelThickness once it has been
     * centred, and the pinch that tapers the stone toward the top takes z with
     * it — miss that and the top three runes sink into the rock.
     */
    const faceZ = (y: number) => (0.21 + 0.05) * (1 - clamp01((y + 1.9) / 3.8) * 0.22);
    const lay = (w: number, h: number, x: number, y: number, rz: number) =>
      bx(w, h, CUT, x, y, faceZ(y) - CUT / 2 + 0.005, rz);

    /**
     * Half-width of the face at a height in the slab's own space, taper and
     * surface wobble already taken off. A raised stone is not a rectangle, and
     * a band of constant-width bars laid on one hangs its ends in the air at
     * the top and bottom — which is what the 0.9 m interlace was doing.
     */
    const halfWidthAt = (y: number): number => {
      let w = 0;
      for (let i = 1; i < outline.length; i++) {
        const a = outline[i - 1];
        const b = outline[i];
        if ((a.y > y) === (b.y > y)) continue;
        const x = Math.abs(a.x + (b.x - a.x) * ((y - a.y) / (b.y - a.y)));
        w = w === 0 ? x : Math.min(w, x);
      }
      const pinch = 1 - clamp01((y + 1.9) / 3.8) * 0.22;
      return Math.max(0, w * pinch - 0.04);
    };

    const runeMat = materials.get("runeGlow");
    const strokes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      // Inside the face by inspection: the slab's outline is never narrower
      // than ±0.43 in x, and its usable height runs about -1.5 to +2.0.
      const y = 1.3 - i * 0.36;
      const x = (i % 2 === 0 ? -0.15 : 0.16) + (rng() - 0.5) * 0.1;
      strokes.push(lay(0.055, 0.3 - (i % 3) * 0.05, x, y, (rng() - 0.5) * 0.55));
      if (i % 2 === 0) strokes.push(lay(0.2, 0.05, x + 0.09, y + 0.07, 0.5));
    }
    body.add(new THREE.Mesh(own(mergeInto(strokes, 1)), runeMat));

    // Interlace border, in stone rather than in light. Each bar is cut to the
    // stone at its own height, measured at both ends of its tilt, so the band
    // narrows with the slab instead of overhanging it.
    const border: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const y = -1.05 + i * 0.28;
      const w = Math.min(halfWidthAt(y - 0.1), halfWidthAt(y + 0.1)) * 2 - 0.06;
      if (w < 0.2) continue;
      border.push(lay(w, 0.05, 0, y, i % 2 === 0 ? 0.16 : -0.16));
    }
    body.add(new THREE.Mesh(own(mergeInto(border, 1)), materials.get("runestone")));

    // Off the centre line on purpose: dead behind the bonfire the stone is a
    // silhouette inside a flame, and beside it the two read as two things.
    const sx = -3.4;
    const sz = -17.4;
    stone.position.set(sx, groundHeight(sx, sz), sz);
    stone.rotation.y = 0.34;
    root.add(stone);

    // Packing stones at the foot, which is how a standing stone stays standing.
    const packing: THREE.Matrix4[] = [];
    for (let i = 0; i < 11; i++) {
      const a = rng() * TAU;
      const d = 0.55 + rng() * 0.55;
      const x = sx + Math.cos(a) * d;
      const z = sz + Math.sin(a) * d;
      packing.push(place(x, groundHeight(x, z) - 0.1, z, rng() * TAU, 0.3 + rng() * 0.3, (rng() - 0.5) * 0.6));
    }
    field(rockGeos[0], rockMat, packing);
  }

  // =========================================================================
  // War gear
  // =========================================================================

  /** A board shield: seven planks, a rawhide rim, an iron boss. */
  const shieldGeo = own((() => {
    const parts: THREE.BufferGeometry[] = [];
    const R = 0.42;
    for (let i = 0; i < 7; i++) {
      const t = (i + 0.5) / 7;
      const cx = (t - 0.5) * 2 * R;
      const halfW = (R / 7) * 0.96;
      const edge = Math.max(0.05, Math.sqrt(Math.max(0, R * R - (Math.abs(cx) + halfW) ** 2)));
      parts.push(bx(halfW * 2, edge * 2, 0.026, cx, 0, 0));
    }
    return mergeInto(parts, 1 / 3);
  })());
  const shieldTrimGeo = own((() => {
    const parts: THREE.BufferGeometry[] = [];
    const rim = new THREE.TorusGeometry(0.42, 0.016, 5, 22);
    parts.push(rim);
    const boss = new THREE.SphereGeometry(0.1, 10, 6, 0, TAU, 0, Math.PI / 2);
    boss.scale(1, 0.85, 1);
    boss.rotateX(Math.PI / 2);
    boss.translate(0, 0, 0.05);
    parts.push(boss);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      parts.push(bx(0.05, 0.07, 0.06, Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0.01, 0, 0));
    }
    return mergeInto(parts, 1 / 2);
  })());
  const shieldBoard = materials.timber(0x6b4a2a);
  // 0.30, not 0.50. These are the arena's only free-standing metal — four boss
  // domes on each rack and a helm lying in the mud — and at half roughness under
  // an env intensity tuned for matte surfaces they came back as grey clay with
  // no highlight anywhere on them. A boss is a hammered iron dome; it is
  // supposed to carry a rolled highlight and a hit off the fire.
  const shieldIron = materials.tinted("iron", 0x555b63, { roughness: 0.3 });

  {
    // Two racks of shields, an A-frame each. This is where a war band's gear
    // goes while its owners are busy in the ring.
    const rackGeo = own(mergeInto([
      bx(0.11, 2.1, 0.11, -0.75, 1.05, 0.35, 0.16),
      bx(0.11, 2.1, 0.11, -0.75, 1.05, -0.35, 0.16, 0),
      bx(0.11, 2.1, 0.11, 0.75, 1.05, 0.35, -0.16),
      bx(0.11, 2.1, 0.11, 0.75, 1.05, -0.35, -0.16, 0),
      bx(2.1, 0.1, 0.1, 0, 1.55, 0),
      bx(2.1, 0.1, 0.1, 0, 0.55, 0),
    ], 1 / 3));
    const timber = materials.get("poleWood");
    const boards: THREE.Matrix4[] = [];
    const trims: THREE.Matrix4[] = [];
    const racks: THREE.Matrix4[] = [];
    for (let r = 0; r < 2; r++) {
      const a = 1.35 + r * 2.4;
      const d = 23.4;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const gy = groundHeight(x, z);
      const face = facing(x, z);
      racks.push(place(x, gy - 0.05, z, face, 1));
      for (let s = 0; s < 4; s++) {
        const off = (s - 1.5) * 0.5;
        const px = x + Math.cos(face) * off;
        const pz = z - Math.sin(face) * off;
        const m = place(px, gy + 1.15, pz, face + (rng() - 0.5) * 0.25, 1, 0.16, (rng() - 0.5) * 0.2);
        boards.push(m);
        trims.push(m);
      }
    }
    field(rackGeo, timber, racks);
    field(shieldGeo, shieldBoard, boards);
    field(shieldTrimGeo, shieldIron, trims, null, false);

    // One shield left leaning where its owner fell, inside the ring.
    const lean = place(-12.6, groundHeight(-12.6, 10.4) + 0.4, 10.4, 0.6, 1, -0.95);
    field(shieldGeo, shieldBoard, [lean]);
    field(shieldTrimGeo, shieldIron, [lean], null, false);
  }

  {
    // Spear bundles: seven shafts leaning into a tripod, lashed near the top.
    const shaftMat = materials.get("spearShaft");
    const tipMat = materials.get("spearTip");
    const shaftGeo = (() => { const g = new THREE.CylinderGeometry(0.024, 0.03, 2.7, 5); g.translate(0, 1.35, 0); return g; })();
    const tipGeo = (() => {
      const parts = [
        (() => { const g = new THREE.ConeGeometry(0.045, 0.3, 6); g.translate(0, 2.85, 0); return g; })(),
        (() => { const g = new THREE.CylinderGeometry(0.032, 0.032, 0.16, 6); g.translate(0, 2.66, 0); return g; })(),
      ];
      return mergeInto(parts);
    })();
    const shafts: THREE.Matrix4[] = [];
    const tips: THREE.Matrix4[] = [];
    const bindings: THREE.Matrix4[] = [];
    for (let b = 0; b < 3; b++) {
      const a = (b / 3) * TAU + 0.8;
      const d = 24.2;
      const cx = Math.cos(a) * d;
      const cz = Math.sin(a) * d;
      const gy = groundHeight(cx, cz);
      for (let s = 0; s < 7; s++) {
        const sa = (s / 7) * TAU + b;
        const foot = 0.42 + rng() * 0.1;
        const px = cx + Math.cos(sa) * foot;
        const pz = cz + Math.sin(sa) * foot;
        // Tilt each shaft in toward the bundle's axis.
        const m = new THREE.Matrix4().compose(
          V.set(px, gy - 0.04, pz),
          Q.setFromEuler(E.set(0, -sa + Math.PI / 2, 0.16 + rng() * 0.03, "YXZ")),
          new THREE.Vector3(1, 1, 1),
        );
        shafts.push(m);
        tips.push(m);
      }
      bindings.push(place(cx, gy + 2.2, cz, 0, 1, Math.PI / 2));
    }
    field(own(shaftGeo), shaftMat, shafts);
    field(own(tipGeo), tipMat, tips, null, false);
    field(own(new THREE.TorusGeometry(0.13, 0.03, 5, 10)), bindMat, bindings, null, false);
  }

  {
    // Barrels, staved and hooped. A couple have been knocked over, which is the
    // cheapest possible way to say the moot has been going on a while.
    const barrelMat = materials.get("barrel");
    const bandMat = materials.get("barrelBand");
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      profile.push(new THREE.Vector2(0.36 + Math.sin(t * Math.PI) * 0.12, t * 0.92));
    }
    const staves = new THREE.LatheGeometry(profile, 14);
    const lid = new THREE.CircleGeometry(0.37, 14);
    lid.rotateX(-Math.PI / 2);
    lid.translate(0, 0.92, 0);
    // Both ends headed, because a third of these end up on their side and an
    // open barrel bottom reads as a bucket.
    const base = new THREE.CircleGeometry(0.37, 14);
    base.rotateX(Math.PI / 2);
    const barrelGeo = own(mergeInto([staves, lid, base]));
    const bands: THREE.BufferGeometry[] = [];
    for (const y of [0.16, 0.76]) {
      const t = new THREE.TorusGeometry(0.385, 0.028, 5, 18);
      t.rotateX(Math.PI / 2);
      t.translate(0, y, 0);
      bands.push(t);
    }
    const bandGeo = own(mergeInto(bands));
    const upright: THREE.Matrix4[] = [];
    for (let i = 0; i < scatter(9); i++) {
      const a = rng() * TAU;
      const d = 21.5 + rng() * 6;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const tipped = rng() < 0.28;
      upright.push(place(x, groundHeight(x, z) + (tipped ? 0.36 : -0.03), z, rng() * TAU, 0.85 + rng() * 0.3, 0, tipped ? Math.PI / 2 + (rng() - 0.5) * 0.4 : 0));
    }
    field(barrelGeo, barrelMat, upright);
    field(bandGeo, bandMat, upright, null, false);
  }

  {
    // The floor of a field that has been fought over: arrows still standing,
    // broken shields half in the mud, a lost helm, bones nobody cleared.
    const bladeMat = materials.get("debrisBlade");
    const hiltMat = materials.get("debrisHilt");
    const boneMat = materials.tinted("bone", 0xa89a7c, { repeat: 2 });

    const arrowGeo = own(mergeInto([
      (() => { const g = new THREE.CylinderGeometry(0.011, 0.011, 0.78, 5); g.translate(0, 0.39, 0); return g; })(),
      bx(0.005, 0.2, 0.09, 0, 0.68, 0),
      bx(0.09, 0.2, 0.005, 0, 0.68, 0),
    ]));
    // Every scatter below starts at CLEAR_RADIUS. An arrow standing in the mud
    // at 3 m is a shin through a shaft the first time anyone fights over the
    // fire, and the debris is the one dressing that gains nothing from being
    // close in — it reads as a fought-over field from anywhere in the ring.
    const arrows: THREE.Matrix4[] = [];
    for (let i = 0; i < scatter(16); i++) {
      const a = rng() * TAU;
      const d = CLEAR_RADIUS + rng() * 12;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      arrows.push(place(x, groundHeight(x, z) - 0.06, z, rng() * TAU, 0.8 + rng() * 0.4, 0.25 + rng() * 0.5, (rng() - 0.5) * 0.5));
    }
    field(arrowGeo, hiltMat, arrows, null, false);

    const swordGeo = own(mergeInto([
      bx(0.055, 0.86, 0.013, 0, 0.43, 0),
      bx(0.2, 0.035, 0.035, 0, 0.88, 0),
      bx(0.035, 0.16, 0.035, 0, 0.97, 0),
    ], 1 / 3));
    const swords: THREE.Matrix4[] = [];
    for (let i = 0; i < scatter(6); i++) {
      const a = rng() * TAU;
      const d = CLEAR_RADIUS + rng() * 10;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      swords.push(place(x, groundHeight(x, z) - 0.14, z, rng() * TAU, 1, 0.35 + rng() * 0.3, (rng() - 0.5) * 0.4));
    }
    field(swordGeo, bladeMat, swords);

    // Broken boards, sunk edge-on where they fell.
    const wrecks: THREE.Matrix4[] = [];
    for (let i = 0; i < scatter(5); i++) {
      const a = rng() * TAU;
      const d = 7 + rng() * 10;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      wrecks.push(place(x, groundHeight(x, z) + 0.05, z, rng() * TAU, 0.75 + rng() * 0.35, -1.35 + (rng() - 0.5) * 0.5, rng() * 3));
    }
    field(shieldGeo, shieldBoard, wrecks);

    const helmGeo = own((() => {
      const dome = new THREE.SphereGeometry(0.13, 10, 7, 0, TAU, 0, Math.PI / 2);
      const band = new THREE.TorusGeometry(0.13, 0.017, 5, 12);
      band.rotateX(Math.PI / 2);
      const nasal = bx(0.03, 0.11, 0.02, 0, -0.05, 0.128);
      return mergeInto([dome, band, nasal], 1 / 2);
    })());
    const helms: THREE.Matrix4[] = [];
    for (let i = 0; i < scatter(3); i++) {
      const a = rng() * TAU;
      const d = CLEAR_RADIUS + rng() * 8;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      helms.push(place(x, groundHeight(x, z) + 0.05, z, rng() * TAU, 1, 1.9 + rng() * 0.5, rng() * 2));
    }
    field(helmGeo, shieldIron, helms);

    const boneGeo = own(mergeInto([
      (() => { const g = new THREE.CylinderGeometry(0.022, 0.022, 0.3, 5); g.rotateZ(Math.PI / 2); return g; })(),
      (() => { const g = new THREE.SphereGeometry(0.04, 6, 5); g.translate(0.15, 0, 0); return g; })(),
      (() => { const g = new THREE.SphereGeometry(0.04, 6, 5); g.translate(-0.15, 0, 0); return g; })(),
    ]));
    const bones: THREE.Matrix4[] = [];
    for (let i = 0; i < scatter(14); i++) {
      const a = rng() * TAU;
      const d = CLEAR_RADIUS + rng() * 18;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      bones.push(place(x, groundHeight(x, z) + 0.02, z, rng() * TAU, 0.7 + rng() * 0.6, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.4));
    }
    field(boneGeo, boneMat, bones, null, false);
  }

  // Only the ground received before this: huts, stakes, rocks and barrels cast
  // shadows onto a world that could not show one landing on them. Cheap, and it
  // is most of what makes the settlement stop reading as cardboard.
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o !== ground) o.receiveShadow = settings.shadows;
  });

  scene.add(root);

  // ---- per-frame state ----
  const baseIntensity = pointLights.map((l) => l.intensity);
  const COOL = new THREE.Color(0xff8a33);
  const HOT = new THREE.Color(0xff5a12);
  let moodHeat = 0;
  let moodTarget = 0;

  return {
    root,
    ground,
    pointLights,

    heightAt: groundHeight,

    setMood(mood) {
      // Mood is carried by the air and the grade, and the props stay out of it —
      // except the fires, which are this module's lights. In the last stand they
      // are the thing the arena is lit by, so they run hotter and reach further.
      //
      // This only sets a target. The orchestrator calls setMood *after* update
      // every frame, so anything written here that update also writes wins, and
      // the flicker below would be flattened out of existence once a frame.
      moodTarget = mood === "lastStand" ? 1 : 0;
    },

    update(dt, ctx) {
      const t = ctx.time;
      moodHeat += (moodTarget - moodHeat) * Math.min(1, dt * 1.6);

      for (const hook of frameHooks) hook(dt, ctx);

      // Firelight flicker. Small, and on a different beat per light, or ten
      // torches strobe the whole arena together.
      for (let i = 0; i < pointLights.length; i++) {
        const f = 1 + Math.sin(t * 9.3 + i * 2.7) * 0.07 + Math.sin(t * 21.7 + i) * 0.035;
        pointLights[i].intensity = baseIntensity[i] * (1 + moodHeat * 0.45) * f;
        pointLights[i].color.copy(COOL).lerp(HOT, moodHeat);
      }

      // Banners ripple as cloth: a wave travelling out from the pole, with the
      // amplitude ramping from nothing at the hoist to everything at the fly.
      for (const b of banners) {
        const attr = b.mesh.geometry.attributes.position as THREE.BufferAttribute;
        const base = b.base;
        for (let i = 0; i < attr.count; i++) {
          const x = base[i * 3];
          const y = base[i * 3 + 1];
          const grip = clamp01((x + 0.48) / 0.95);
          const amp = grip * grip * 0.14;
          attr.setZ(i, Math.sin(x * 6.5 - t * 5 + b.phase) * amp + Math.sin(y * 3.1 - t * 3.4) * amp * 0.4);
          attr.setY(i, y - grip * 0.03 * (1 + Math.sin(t * 2.6 + b.phase)));
        }
        attr.needsUpdate = true;
        b.mesh.geometry.computeVertexNormals();
      }
    },

    dispose() {
      scene.remove(root);
      for (const undo of restore) undo();
      root.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) o.dispose();
        if (o instanceof THREE.Mesh) owned.add(o.geometry);
        if (o instanceof THREE.PointLight) o.dispose();
      });
      for (const g of owned) g.dispose();
      owned.clear();
      for (const m of ownedMats) m.dispose();
      ownedMats.length = 0;
    },
  };
}
