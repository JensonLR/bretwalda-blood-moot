// Fire, smoke, blood, impacts, blade trails, decals and the air itself.
//
// Every effect in the game is one of five instanced-quad layers, a fire layer
// and a ribbon buffer, and each one is allocated once at build time. Nothing
// here creates a geometry or a material per burst — the module this replaces
// built a `THREE.Points` and a `PointsMaterial` for every blow that landed, so
// a brawl allocated and disposed forty shader-bearing objects a second and the
// collector was visible in the frame time.
//
// A warrior alight is not a seventh system. He is the bonfire — the same tongue
// shader, the same ember and smoke emitters, the same halo quad, one warm light
// off the same never-hidden pool the impact flashes use — anchored to a rig
// instead of to the ground. The only thing that costs anything is that his
// origin moves, so the flame layer is repacked per frame while anybody is
// burning instead of on a dirty flag. See `Burner` and `setBurning`.
//
// The one non-negotiable rule is that no particle is ever an untextured square.
// Everything samples a procedurally generated atlas or is a shader with a real
// profile in it; there is no `PointsMaterial` in this file and there must never
// be one. Point sprites are gone too, and not only for that reason: a point
// sprite cannot be rotated, cannot be stretched along its velocity, is clipped
// the moment its centre leaves the screen, and hits the driver's `gl_PointSize`
// ceiling exactly when a smoke puff comes close enough to matter. An instanced
// quad costs three extra vertices and solves all four.
//
// Colour here is linear radiance, because postfx renders the beauty pass into a
// half-float buffer with three's tone-mapping chunk switched off and applies the
// filmic curve by hand at the end. Every level in this file is therefore chosen
// against that curve, and the curve has two numbers in it that decide what an
// emissive is allowed to be. Both were re-derived for this pass by running
// postfx's own stages on the CPU, because the constants this file used to quote
// were three iterations stale:
//
//   dusk        reaches code 255 at 4.07 scene units (neutral), blooms above 5.0
//   last stand  reaches code 255 at 2.48 scene units (neutral), blooms above 6.0
//
// There is no window between those two numbers. Anything bright enough to reach
// the bright pass is already welded to display white, and on the way there the
// grade's `crosstalk` walks it toward its own peak channel — so the brighter an
// emissive is authored, the *less* colour it has. That is the whole of the
// "bonfire core clips flat" defect, and it was never only the clip: a flame
// authored at (1.0, 0.93, 0.72) is a neutral grey before it is anything else and
// measures saturation 0.02 at any level, clipped or not.
//
// So everything hot in here is authored deep and saturated and kept under the
// clip point, and the heat is carried by area, by the halo and by the ember
// column rather than by radiance. The last stand scales *down* for it, because
// its look has 40% less highlight latitude than dusk's and the code it replaces
// turned the fire up when it got there.

import * as THREE from "three";
import { LAYER_UNOCCLUDED, setLayerDeep, type FrameContext, type Mood, type QualitySettings } from "./quality";
import type { TextureLibrary, SpriteName } from "./textures";
import { FIRE, type HitZone, type Vec3 } from "../../types";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * What an effect *is*, rather than what colour it happens to be. Call sites that
 * do not pass one get a guess — see `inferKind` — which is a compatibility shim,
 * not a design.
 */
export type BurstKind =
  | "spark"   // metal on metal: hot, fast, bounces off the ground, cools as it dies
  | "blood"   // arcs under gravity, lands, stains
  | "dust"    // kicked earth, slow and soft
  | "debris"  // struck kit: mail rings and cloth torn off a body
  | "ember"   // fire-borne, buoyant, long-lived
  | "aura";   // an ability running, class-coded

export interface BurstOptions {
  position: { x: number; y: number; z: number };
  color: number;
  count: number;
  /** Horizontal scatter velocity, m/s. Scales the kind's own spread. */
  spread?: number;
  /** Upward launch velocity, m/s. Scales the kind's own launch. */
  up?: number;
  /** Downward acceleration, m/s². Scales the kind's own weight. */
  gravity?: number;
  size?: number;
  life?: number;
  /** Legacy hint from the sprite-per-burst era. Ignored; `kind` replaced it. */
  sprite?: SpriteName;
  /** Legacy. The kind decides its own blending; a spark is never alpha-blended. */
  blending?: THREE.Blending;
  kind?: BurstKind;
  /**
   * Sim damage points, for `kind: "blood"` only. A graze and a cleaving heavy
   * are not the same wound and have no business throwing the same spray. Absent,
   * it is inferred from `count` — see `burst` — which is the shim, not the design.
   */
  damage?: number;
}

/**
 * A blow that broke skin. This is the whole non-fatal case: everything about the
 * spray comes off `damage`, so the orchestrator never has to decide what a hit
 * looks like, only how hard it was.
 */
export interface WoundOptions {
  /** World point the blow opened. */
  position: Vec3;
  /** Sim damage points. Roughly 10 is a graze and 50 a cleaving heavy. */
  damage: number;
  /**
   * World direction the blood should leave in — the blade's travel, or the line
   * from attacker to victim. Omitted, it fans off in a random horizontal
   * direction, which is what the call sites that predate hit zones get.
   */
  direction?: Vec3;
  /** Where the server said it landed. A throat throws more than a thigh. */
  zone?: HitZone;
  /**
   * This blow killed him, and nothing came off. `torso` is a third of all hits
   * and severs nothing, and the low tier refuses the bisection outright — both
   * of those still have to read as deaths, so a fatal wound bleeds out and
   * pools where a survivable one only spatters.
   */
  fatal?: boolean;
}

/**
 * A limb has just come off. Every field here is `Severance` from characters.ts
 * passed straight through: the two ends of this seam must never derive the cut's
 * frame twice, or the blood and the stump will disagree about where the wound is.
 */
export interface SeveranceOptions {
  /** World point of the cut at the instant of separation. */
  position: Vec3;
  /** Unit world direction the stump faces. The spray axis. */
  direction: Vec3;
  /** Section radius at the cut, metres. Sets how wide and how hard it throws. */
  radius: number;
  /**
   * The wound node left on the *body*. Given one, the spray tracks it — down
   * with the corpse as it falls, and inheriting that fall's momentum, instead of
   * hanging in the air where the man used to be standing.
   */
  stump?: THREE.Object3D;
  /** The severed piece. Given one, it trails blood as it tumbles. */
  piece?: THREE.Object3D;
  zone?: HitZone;
  /** Overall strength, 1 by default. A bisection is worth more than a wrist. */
  power?: number;
}

/**
 * A wound that is still running. `stop()` is idempotent and safe from any state;
 * call it on respawn. It is a belt to the braces rather than the mechanism —
 * a jet also stops on its own the moment its anchor leaves the scene graph,
 * which is what `Severance.release()` does to a stump.
 */
export interface BleedHandle {
  stop(): void;
}

/** Something burning, that wants flame, embers, smoke, haze and a glow on it. */
export interface FireSpec {
  position: { x: number; y: number; z: number };
  /** Half-width of the flame base, metres. */
  radius: number;
  /** Height of a full tongue, metres. */
  height: number;
  kind: "bonfire" | "torch";
}

export interface VfxOptions {
  /**
   * Terrain height under a world point. Sparks bounce off it and blood stains
   * it, so without this everything lands on y = 0 — near enough inside the
   * arena, where the ground stays within ten centimetres, and wrong on the bank.
   */
  groundAt?(x: number, z: number): number;
  /** Skip the scene scan that finds the arena's fires. For tests. */
  autoFires?: boolean;
  /**
   * A wound opened close enough to the lens, and pointing squarely enough at it,
   * to put blood on the glass. `postfx.ts` draws it; this module decides when,
   * because it is the one that knows where every wound and the camera are.
   *
   * IT IS TRIGGERED AT THE SOURCE AND NOT BY A DROPLET REACHING THE LENS, and
   * that is a deliberate approximation with a number behind it. The follow
   * camera sits 4.4 m behind the local warrior; blood leaves a wound at up to
   * 12 m/s under a gravity of 18.5 and an elevation ceiling of 41°, which is a
   * range of about 4.7 m from a wound at chest height. So a droplet CAN just
   * about reach the lens and almost never does, and a lens-blood effect built on
   * a particle collision would fire perhaps once an evening — which is not the
   * feature. What the feature is about is being opened up right in front of the
   * camera, and that is exactly what this tests for.
   *
   * @param strength 0..1.4, off damage or section, distance and how squarely the
   *                 spray axis is pointed at the lens.
   * @param u,v      where the wound projected to on screen, 0..1 with v up.
   */
  onLensBlood?(strength: number, u: number, v: number): void;
}

/**
 * Everything this module is still holding, counted rather than described.
 *
 * It exists because "the arena is clean" was, until now, an adjective. A round
 * leaves blood in six separate pools — ground stains, marks on skin, running
 * stumps, droplets in the air, shockwave rings and men still alight — and five
 * of the six are invisible to a count of the sixth. `tools/goretest.mjs` reads
 * this across a round boundary; nothing in the game reads it.
 *
 * `combatParticles` deliberately excludes the fire-borne (`F_AMBIENT`)
 * population: the bonfire burns through the intermission by design and counting
 * its embers as leftover gore would make the assertion unsatisfiable.
 */
export interface GoreCensus {
  /** Marks on the ground: thrown spatter and pools together. */
  decals: number;
  /** Of those, the ones that are pools rather than spatter. */
  pools: number;
  /** Blood stains stuck to a body, following its bones. */
  bodyMarks: number;
  /** Stumps still running. */
  jets: number;
  /** Particles that are not the arena's own dust, embers or smoke. */
  combatParticles: number;
  /** Every particle in the store, ambient included. */
  particles: number;
  /** Ability shockwaves lying on the ground. */
  rings: number;
  /** Blade ribbons that have not yet dissolved. */
  ribbons: number;
  /** Men the client still believes are on fire. */
  burners: number;
  /** Highest y of anything in the four blood pools, or -Infinity for none.
   *  A leftover ON the ground and a leftover IN the air are different bugs and
   *  a count alone cannot tell them apart — the owner's report was about height. */
  highestBloodY: number;
}

/**
 * RAW STATE, for harnesses. Nothing in the game reads it.
 *
 * `census()` counts; this one says where things ARE, and the difference is the
 * whole of "does the spray arc or does it puff". A count cannot tell a stream
 * that lands two metres downrange from a cloud that falls on the man's boots,
 * and the panels have twice called the second one confetti.
 *
 * It deliberately reports POSITIONS AND VELOCITIES and nothing derived. No
 * apex, no range, no verdict — `tools/goretest.mjs` does its own trigonometry
 * over these numbers, so a harness that agreed with this module by construction
 * was never possible. Same arrangement as `camera.ts`'s `__bretwaldaCamera`
 * readback, and for the same reason.
 *
 * Allocates; not for the frame loop.
 */
export interface GoreProbe {
  /** Every live blood droplet — F_STAIN, which is the flag that means blood. */
  drops: Array<{
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    /** Seconds since it left the wound, and how long it has in total. */
    age: number; life: number;
    size: number;
  }>;
  /** Every mark on the ground, at the size it has spread to this frame. */
  marks: Array<{ x: number; y: number; z: number; r: number; pool: boolean; age: number; life: number }>;
}

export interface VfxHandle {
  readonly root: THREE.Group;
  /** Live particle count, for anyone who wants to know what the budget is doing. */
  readonly liveParticles: number;
  /**
   * What the last round left behind, so a harness can assert it is nothing.
   * Allocates one object per call; not for the frame loop.
   */
  census(): GoreCensus;
  /** Raw blood state for harnesses. See `GoreProbe`. Nothing in the game reads it. */
  probe(): GoreProbe;
  /**
   * The round is over and the next one opens on clean ground.
   *
   * Every pool this module owns is emptied — stains, marks on skin, running
   * stumps, blood in the air, rings, ribbons and burning men — and the arena's
   * own dust, bonfire and torches are left alone, because they belong to the
   * place rather than to the fight. Stumps are ended WITHOUT leaving their pool:
   * a wound that stops because the round stopped has nothing to drip onto.
   *
   * Idempotent, and safe from any state. `src/game/roundreset.mjs` owns when.
   */
  clearBattle(): void;
  burst(opts: BurstOptions): void;
  /** A blade tip mid-arc. Successive calls that stay close become one ribbon. */
  trail(opts: BurstOptions): void;
  /** Hang fire on something. Returns an id for `removeFire`. */
  /** A blow that broke skin and did not kill. Scales with damage. */
  wound(opts: WoundOptions): void;
  /**
   * A limb has just come off: a burst from the stump on this frame, a weaker
   * spray for a beat while the part falls, then a pool on the ground.
   */
  severed(opts: SeveranceOptions): BleedHandle;
  addFire(spec: FireSpec): number;
  removeFire(id: number): void;
  /**
   * A warrior the server says is alight — flame on him, the light it throws,
   * embers off him, and smoke that outlives the flames.
   *
   * Every argument is a wire field passed through untouched, and that is the
   * whole contract: nothing here works out who is burning. The hazard sits half
   * a metre inside the visible flame on purpose, so a client that decided this
   * from where a rig happens to be standing would disagree with the sim exactly
   * at the boundary the sim was tuned to be generous at.
   *
   * Call it every frame for every player, alight or not — a burner that stops
   * being mentioned goes out on its own, so a man who dies, respawns or leaves
   * needs no second call:
   *
   * ```ts
   * vfx.setBurning(id, p.burning === true, p.burnTimer ?? 0, p.burnInside === true);
   * ```
   *
   * @param burning   `GamePlayer.burning` — alight, in the fire or out of it.
   * @param timer     `GamePlayer.burnTimer`, seconds. Normalised against
   *                  `FIRE.linger` into the flame's own 1→0 fade.
   * @param inside    `GamePlayer.burnInside` — engulfed, as against trailing.
   */
  setBurning(id: string, burning: boolean, timer: number, inside: boolean): void;
  setMood(mood: Mood): void;
  update(dt: number, ctx: FrameContext): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Maths
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const sym = (a: number) => (Math.random() - 0.5) * 2 * a;

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise on an integer lattice that wraps at `period`, so tiles seam. */
function vnoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const p = Math.max(1, Math.round(period));
  const w = (a: number) => ((a % p) + p) % p;
  const a = hash2(w(xi), w(yi), seed);
  const b = hash2(w(xi + 1), w(yi), seed);
  const c = hash2(w(xi), w(yi + 1), seed);
  const d = hash2(w(xi + 1), w(yi + 1), seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x: number, y: number, period: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += vnoise(x * f, y * f, period * f, seed + o * 131) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// ---------------------------------------------------------------------------
// The sprite atlas
// ---------------------------------------------------------------------------
//
// One 4×4 atlas, one texture fetch, one draw call per blend mode. Every cell is
// pure white and carries its whole silhouette in alpha, which is not laziness:
// it means the atlas has no colour space to get wrong, and the particle's own
// linear radiance is the only colour in the equation. Smoke's internal mottling
// lives in alpha too, where for a participating medium it belongs — it is
// density, not tint. Shapes are drawn inside the middle four-fifths of their
// cell so the mip chain has transparent room to bleed into rather than the
// neighbouring cell.

const TILES = 4;

const CELL = {
  soft: 0, spark: 1, ember: 2, glow: 3,
  smokeA: 4, smokeB: 5, smokeC: 6, ash: 7,
  drop: 8, dust: 9, chip: 10, ring: 11,
  rune: 12, scale: 13, streak: 14, flame: 15,
} as const;

const SMOKE_CELLS = [CELL.smokeA, CELL.smokeB, CELL.smokeC];

/** Distance from a point to a line segment, for the drawn glyphs. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1e-6));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

/** A lumpy puff whose edge and interior come from the same noise field. */
function puff(u: number, v: number, seed: number, softness: number): number {
  const dx = u - 0.5;
  const dy = v - 0.5;
  const d = Math.hypot(dx, dy) * 2;
  const ang = Math.atan2(dy, dx);
  // Summed harmonics rather than a product: a product of two sines gives an
  // evenly spiked star, and no puff of anything is a star.
  const edge =
    0.82 +
    0.10 * Math.sin(ang * 2 + seed) +
    0.07 * Math.sin(ang * 3 - seed * 1.7) +
    0.04 * Math.sin(ang * 5 + seed * 2.3);
  const body = clamp01((edge - d) / softness);
  // Interior density. Without it a puff is a flat blob, and a hundred flat blobs
  // are one flat blob.
  const grain = fbm(u * 5 + seed * 11, v * 5 - seed * 7, 5, 3, Math.round(seed * 97));
  // A guaranteed round outer envelope over the top of the lumpy one, so no
  // amount of harmonic luck can leave a puff with a straight edge.
  const soft = Math.pow(clamp01(1 - d * 0.82), 0.9);
  return clamp01(Math.pow(body, 1.4) * (0.42 + grain * 0.95) * soft);
}

/**
 * A flame or droplet profile: zero at both ends, fattest low, drawn to a point.
 * `bias` below 0.5 pushes the widest part toward the root.
 */
function teardrop(y: number, bias: number, sharpness: number): number {
  return Math.pow(Math.sin(Math.PI * Math.pow(clamp01(y), bias)), sharpness);
}

/** Superellipse; the rounded-cornered flake and chip shapes are built on it. */
function superEllipse(x: number, y: number, hw: number, hh: number, angle: number, power: number): number {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rx = Math.abs(x * c - y * s) / hw;
  const ry = Math.abs(x * s + y * c) / hh;
  return Math.pow(Math.pow(rx, power) + Math.pow(ry, power), 1 / power);
}

type CellFn = (u: number, v: number) => number;

const CELL_ALPHA: CellFn[] = [];

// Round falloff. The workhorse: fine mist, soft glows, blood spray.
CELL_ALPHA[CELL.soft] = (u, v) => Math.pow(1 - Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2), 2.4);

// A hot core with a tight halo. Additive blending eats colour detail, so the
// heat has to be carried by the falloff rather than by the hue.
CELL_ALPHA[CELL.spark] = (u, v) => {
  const d = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
  return clamp01(Math.pow(1 - d, 9) + Math.pow(1 - d, 2.4) * 0.3);
};

// Tighter than a spark and slightly off-round, so a hundred rising embers do
// not read as a hundred identical dots. The harmonics are high and shallow on
// purpose: three-fold modulation at any useful amplitude makes a triangle.
CELL_ALPHA[CELL.ember] = (u, v) => {
  const dx = u - 0.5;
  const dy = v - 0.5;
  const ang = Math.atan2(dy, dx);
  const d = Math.hypot(dx, dy) * 2 * (1 + 0.035 * Math.sin(ang * 5 + 0.7) + 0.025 * Math.sin(ang * 7 - 1.3));
  return clamp01(Math.pow(Math.max(0, 1 - d), 3) + Math.pow(Math.max(0, 1 - d), 1.3) * 0.2);
};

// The wide halo that wraps a flame — near-Gaussian, reaching the cell edge at
// zero. This is the thing that stops a fire reading as a shape pasted on the
// frame: the flame has no outline because the glow gets there first.
CELL_ALPHA[CELL.glow] = (u, v) => {
  const d = Math.hypot(u - 0.5, v - 0.5) * 2;
  return Math.exp(-d * d * 3.1) * (1 - clamp01(d));
};

CELL_ALPHA[CELL.smokeA] = (u, v) => puff(u, v, 1.3, 0.5);
CELL_ALPHA[CELL.smokeB] = (u, v) => puff(u, v, 3.9, 0.62);
CELL_ALPHA[CELL.smokeC] = (u, v) => puff(u, v, 6.1, 0.44);

// A flake of ash, or a fibre torn off a tunic: one thin buckled scrap.
CELL_ALPHA[CELL.ash] = (u, v) => {
  const d = superEllipse((u - 0.5) * 2.9, (v - 0.5) * 2.9, 0.5, 0.28, 0.9, 3);
  const warp = 1 + (fbm(u * 3 + 7, v * 3 - 2, 3, 2, 55) - 0.5) * 0.5;
  return clamp01((warp - d) * 3.2);
};

// A droplet, pointed at the top. Blood is rotated to face its own velocity, so
// the point ends up trailing behind the mass. The cross-section is `1 - d²`
// rather than `1 - d`, because a linear falloff at this size hardens into a
// trapezoid the moment it is drawn at a few dozen texels.
CELL_ALPHA[CELL.drop] = (u, v) => {
  const prof = teardrop(v, 0.62, 0.85);
  const d = Math.abs(u - 0.5) / Math.max(0.42 * prof + 0.012, 1e-3);
  return Math.pow(clamp01(1 - d * d), 1.3) * clamp01(prof * 3);
};

// Boot dust: broader, flatter and lower in contrast than smoke, because it is a
// cloud of grains rather than a column of soot.
CELL_ALPHA[CELL.dust] = (u, v) => {
  const dx = (u - 0.5) * 2;
  const dy = (v - 0.5) * 2.35;
  const d = Math.hypot(dx, dy);
  const grain = fbm(u * 4.2 + 21, v * 4.2 - 8, 4, 3, 733);
  return clamp01(Math.pow(clamp01(1 - d), 1.9) * (0.5 + grain * 0.8)) * 0.85;
};

// A struck chip of mail or a splinter off a shield board. Angular on purpose —
// the one shape in the atlas that must not read as round — but with corners
// rounded enough that it is a chip and not a playing card.
CELL_ALPHA[CELL.chip] = (u, v) => {
  const d = superEllipse((u - 0.5) * 3.2, (v - 0.5) * 3.2, 0.52, 0.34, 0.7, 4);
  return clamp01((1 - d) * 4.5);
};

// The shockwave an ability opens on.
CELL_ALPHA[CELL.ring] = (u, v) => {
  const d = Math.hypot(u - 0.5, v - 0.5) * 2;
  const band = Math.exp(-((d - 0.8) * (d - 0.8)) / 0.011);
  return clamp01(band * (1 - clamp01((d - 0.94) * 12)));
};

// A runic mark in three strokes. It has to be recognisable at fifteen pixels,
// which is the size it will actually be in a fight.
CELL_ALPHA[CELL.rune] = (u, v) => {
  const x = (u - 0.5) * 2.3;
  const y = (v - 0.5) * 2.3;
  const d = Math.min(
    segDist(x, y, 0, -0.62, 0, 0.62),
    Math.min(segDist(x, y, 0, 0.34, 0.44, 0.62), segDist(x, y, 0, -0.06, 0.44, 0.22)),
  );
  return clamp01((0.13 - d) * 11);
};

// A shield scale: hexagon outline over a soft fill. The huscarl's wall, small.
CELL_ALPHA[CELL.scale] = (u, v) => {
  const x = (u - 0.5) * 2.2;
  const y = (v - 0.5) * 2.2;
  let d = 1e3;
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * TAU;
    const a1 = ((i + 1) / 6) * TAU;
    d = Math.min(d, segDist(x, y, Math.cos(a0) * 0.62, Math.sin(a0) * 0.62, Math.cos(a1) * 0.62, Math.sin(a1) * 0.62));
  }
  return clamp01(clamp01((0.1 - d) * 13) + clamp01((0.55 - Math.hypot(x, y)) * 2.4) * 0.22);
};

// The blade trail's own texture: a tight band with striations along its length,
// so the ribbon has internal motion instead of being a smooth strip of gel.
// Nothing here tapers to zero along the length. The ribbon supplies its own head
// and tail through vertex alpha, and a cell that vanishes at its own edges cuts
// the trail into dashes the moment it is tiled along one.
CELL_ALPHA[CELL.streak] = (u, v) => {
  const across = Math.exp(-Math.pow((v - 0.5) * 2, 2) * 6.5);
  const along = 0.72 + 0.28 * Math.sin(u * Math.PI);
  const grain = 0.6 + 0.4 * fbm(u * 12 + 3, v * 3, 12, 2, 41);
  return clamp01(across * along * grain);
};

// A small flame lick, for the berserker's aura and for fire spit. The axis is
// warped by noise before the envelope is applied, which is what makes it a lick
// rather than a bell: erode a straight spike however hard you like and it stays
// a spike.
CELL_ALPHA[CELL.flame] = (u, v) => {
  const y = clamp01(v);
  const prof = teardrop(y, 0.55, 0.9);
  const wob = (fbm(u * 2 + 9, v * 1.6 - 4, 4, 3, 313) - 0.5) * y * 0.5;
  const d = Math.abs(u - 0.5 - wob) / Math.max(0.44 * prof + 0.02, 1e-3);
  const body = clamp01(1 - d * d);
  const n = fbm(u * 4.5 + 2, v * 3 - 6, 5, 3, 909);
  return clamp01((body * (0.35 + n) - y * 0.35) * 1.6);
};

function buildAtlas(
  cells: readonly CellFn[],
  tiles: number,
  cellSize: number,
  aniso: number,
  /** Domain width in cell widths. Over 1 leaves the mip chain room to bleed. */
  overscan: number,
  name: string,
): THREE.DataTexture {
  const edge = cellSize * tiles;
  const data = new Uint8Array(edge * edge * 4);
  const inv = 1 / cellSize;
  for (let cell = 0; cell < tiles * tiles; cell++) {
    const cx = (cell % tiles) * cellSize;
    const cy = Math.floor(cell / tiles) * cellSize;
    const fn = cells[cell];
    for (let y = 0; y < cellSize; y++) {
      for (let x = 0; x < cellSize; x++) {
        // Evaluated over a slightly wider domain than the cell, so every shape
        // finishes at zero with a texel or two of margin for the mip chain.
        const u = ((x + 0.5) * inv - 0.5) * overscan + 0.5;
        const v = ((y + 0.5) * inv - 0.5) * overscan + 0.5;
        const o = ((cy + y) * edge + cx + x) * 4;
        data[o] = 255;
        data[o + 1] = 255;
        data[o + 2] = 255;
        data[o + 3] = clamp01(fn(u, v)) * 255;
      }
    }
  }
  const tex = new THREE.DataTexture(data, edge, edge);
  // No colour space: every texel is white and alpha is linear coverage under
  // either encoding, so there is nothing here that could be converted wrong.
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = aniso;
  tex.name = name;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// The stain atlas
// ---------------------------------------------------------------------------
//
// Ground blood used to be one silhouette — textures.ts's `splat`, drawn at one
// of a few sizes with a random spin — and eight of those round a corpse read as
// red foliage on grass rather than as a man bleeding out. Three separate things
// made it read that way and none of them was the placement:
//
//   * **One shape, repeated.** Sixteen cells here, no two alike, and the two
//     families below are different *kinds* of mark rather than one kind at two
//     sizes. The same shape scaled up is exactly what "eight petals" looked like.
//   * **A hard edge.** `splat` crosses from covered to clear inside 11% of its
//     radius, so every mark drew its own outline and every outline was the same
//     outline. These feather over a quarter to a third of the radius and finish
//     in specks rather than in a boundary.
//   * **No depth.** Coverage was effectively binary, so a mark was one flat tone
//     and had no way to say where it was deep. The decal layer multiplies, which
//     turns alpha directly into darkness — so an alpha that peaks where the lobes
//     pile up *is* a pool that is darkest where it is deepest, for free.
//
// Cells 0–7 are spatter: small, thrown, stretched along their own travel, with
// satellite specks flung ahead of them. Cells 8–15 are pooled: wider, built from
// overlapping lobes so the rim is not a closed curve, and much softer.

const STAIN_TILES = 4;
const STAIN_CELLS = STAIN_TILES * STAIN_TILES;
/** First pooled cell. Below it is thrown spatter, from it up is blood at rest. */
const STAIN_POOL_FIRST = 8;
/** Angular samples in a lobe's rim table. Trig once per cell, not per texel. */
const RIM_N = 96;

interface StainLobe {
  ox: number; oy: number;
  radius: number;
  feather: number;
  /** Elongation along `dir`; a drop that arrived moving lands as a comma. */
  stretch: number;
  cos: number; sin: number;
  rim: Float32Array;
}

interface StainSpeck {
  ox: number; oy: number; radius: number;
}

/**
 * A lobe's ragged rim, tabulated.
 *
 * Summed harmonics at coprime rates, never a product: a product of two sines is
 * an evenly spiked star and no mark of anything is a star. The table exists
 * because the alternative is four `sin` and an `atan2` per texel per lobe, and
 * this atlas is generated on the main thread while the arena is loading.
 */
function buildRim(seed: number, rough: number): Float32Array {
  const rim = new Float32Array(RIM_N + 1);
  for (let i = 0; i <= RIM_N; i++) {
    const a = (i / RIM_N) * TAU;
    rim[i] = 1 + rough * (
      0.34 * Math.sin(a * 2 + seed) +
      0.24 * Math.sin(a * 3 - seed * 1.7) +
      0.13 * Math.sin(a * 5 + seed * 2.3) +
      0.07 * Math.sin(a * 8 - seed * 0.6)
    );
  }
  return rim;
}

function makeStainCell(cell: number): CellFn {
  const pooled = cell >= STAIN_POOL_FIRST;
  const idx = cell + 1;
  const h = (k: number) => hash2(idx, k, 1471);
  const dir = h(1) * TAU;
  const lobes: StainLobe[] = [];

  // The main mass. A pool is wide and soft; spatter is small, hard-thrown and
  // stretched along the line it came in on.
  const lobeCount = pooled ? 2 + Math.floor(h(2) * 3) : 1 + Math.floor(h(3) * 2);
  for (let i = 0; i < lobeCount; i++) {
    // Satellite lobes sit a fraction of the parent's radius out, so they merge
    // with it rather than floating beside it — the union below is what makes
    // two overlapping lobes one mark instead of two.
    const first = i === 0;
    const base = pooled ? 0.23 + h(10 + i) * 0.17 : 0.17 + h(10 + i) * 0.09;
    const radius = first ? base : base * (0.42 + h(20 + i) * 0.4);
    const a = pooled ? h(30 + i) * TAU : dir + (h(30 + i) - 0.5) * 1.4;
    const off = first ? 0 : (pooled ? 0.14 + h(40 + i) * 0.18 : 0.1 + h(40 + i) * 0.11);
    const spin = pooled ? h(50 + i) * TAU : dir;
    lobes.push({
      ox: Math.cos(a) * off,
      oy: Math.sin(a) * off,
      radius,
      feather: pooled ? 0.26 + h(60 + i) * 0.16 : 0.22 + h(60 + i) * 0.16,
      // Pools get real elongation too. Held near-round they all correlated
      // above 0.9 with each other at some rotation, which is the repeat this
      // atlas exists to break — sixteen cells of one silhouette is one cell.
      stretch: pooled ? h(70 + i) * 0.55 : 0.25 + h(70 + i) * 0.7,
      cos: Math.cos(spin), sin: Math.sin(spin),
      rim: buildRim(h(80 + i) * 12, pooled ? 0.34 : 0.5),
    });
  }

  // Specks thrown clear of the mass. They are most of what separates blood that
  // landed at speed from a leaf, and they cost a `hypot` each because they are
  // round — nothing this small can carry a rim.
  const specks: StainSpeck[] = [];
  const speckCount = pooled ? 2 : 4;
  for (let i = 0; i < speckCount; i++) {
    const a = pooled ? h(100 + i) * TAU : dir + (h(100 + i) - 0.5) * 1.1;
    const off = 0.26 + h(110 + i) * 0.2;
    specks.push({
      ox: Math.cos(a) * off,
      oy: Math.sin(a) * off,
      radius: (pooled ? 0.012 : 0.016) + h(120 + i) * (pooled ? 0.022 : 0.03),
    });
  }

  return (u, v) => {
    const dx = u - 0.5;
    const dy = v - 0.5;
    // `mass` is the unclamped sum and `cover` the probabilistic union. The union
    // decides the silhouette and the sum decides the depth, which is why a place
    // two lobes both reach comes out darker than either — blood pools by pooling.
    let cover = 0;
    let mass = 0;
    for (const L of lobes) {
      const px = dx - L.ox;
      const py = dy - L.oy;
      const ax = (px * L.cos + py * L.sin) / (1 + L.stretch);
      const ay = -px * L.sin + py * L.cos;
      const r = Math.hypot(ax, ay);
      if (r > L.radius * 1.6) continue;
      let ang = Math.atan2(ay, ax) / TAU;
      ang -= Math.floor(ang);
      const f = ang * RIM_N;
      const i0 = f | 0;
      const t = f - i0;
      const rim = L.rim[i0] + (L.rim[i0 + 1] - L.rim[i0]) * t;
      const rn = r / (L.radius * rim);
      const q = clamp01((rim - r / L.radius) / L.feather);
      const c = q * q * (3 - 2 * q);
      cover = cover + c - cover * c;
      // Depth keeps rising toward each lobe's own centre rather than stopping
      // at its plateau. Summing the coverage alone put a hard contour wherever
      // one lobe's plateau began, and a pool with creases in it reads as flat
      // shapes stacked rather than as one body of liquid.
      mass += c * (1.15 - 0.75 * clamp01(rn));
    }
    for (const S of specks) {
      const r = Math.hypot(dx - S.ox, dy - S.oy) / S.radius;
      if (r >= 1.35) continue;
      const c = clamp01((1.35 - r) / 0.7);
      cover = cover + c - cover * c;
      mass += c * 0.5;
    }
    // Alpha *is* depth here, and the exponent is what keeps it from being a
    // wash. A linear map put most of a pool's area in the half-covered band,
    // which over olive turf is neither blood nor grass but the muddy brown in
    // between; the root pushes the interior up to its own colour and leaves the
    // fade to `cover`, so the mark is dense where it is deep and thin only at
    // the rim, which is what a puddle soaking into grass actually does.
    return cover * (0.34 + 0.66 * Math.pow(clamp01(mass / (pooled ? 1.9 : 1.15)), 0.5));
  };
}

const STAIN_ALPHA: CellFn[] = [];
for (let i = 0; i < STAIN_CELLS; i++) STAIN_ALPHA[i] = makeStainCell(i);

/** Tileable fbm in three channels at three rates: the fire's turbulence field. */
function buildNoise(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const period = 8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * period;
      const v = (y / size) * period;
      const o = (y * size + x) * 4;
      data[o] = fbm(u, v, period, 4, 11) * 255;
      data[o + 1] = fbm(u * 2, v * 2, period * 2, 3, 401) * 255;
      data[o + 2] = fbm(u * 4, v * 4, period * 4, 2, 907) * 255;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.name = "vfx:turbulence";
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------
//
// These are `ShaderMaterial`, not `RawShaderMaterial`, so three's prefix hands
// us `viewMatrix`, `projectionMatrix` and `#include` resolution — and, more to
// the point, so the fog chunks resolve. sky.ts patches those chunks globally to
// make fog directional; including them here is what keeps a smoke column in the
// same air as the hut behind it.

const QUAD_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

attribute vec3 iPos;
attribute vec3 iCol;
attribute vec4 iAtt;    // width, height, rotation, alpha
attribute float iFrame;

uniform float uTiles;

varying vec2 vUv;
varying vec3 vCol;
varying float vAlpha;

void main() {
  vec2 q = position.xy * iAtt.xy;
  float c = cos( iAtt.z );
  float s = sin( iAtt.z );
  vec2 r = vec2( q.x * c - q.y * s, q.x * s + q.y * c );

  // The view matrix's rotation block is orthonormal, so its rows are the camera
  // basis in world space and no inverse is needed.
  vec3 camRight = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
  vec3 camUp    = vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] );
  vec3 camFwd   = vec3( viewMatrix[ 0 ][ 2 ], viewMatrix[ 1 ][ 2 ], viewMatrix[ 2 ][ 2 ] );

  // Instance positions are already world space. The layer's own matrix is
  // identity by construction and deliberately not consulted.
  vec3 world = iPos;
  #if BILLBOARD == 0
    world += camRight * r.x + camUp * r.y;
  #elif BILLBOARD == 1
    // Cylindrical: up stays world up, so things that rise rise on screen.
    vec3 right = normalize( cross( vec3( 0.0, 1.0, 0.0 ), camFwd ) );
    world += right * r.x + vec3( 0.0, 1.0, 0.0 ) * r.y;
  #else
    world += vec3( r.x, 0.0, r.y );
  #endif

  vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
  gl_Position = projectionMatrix * mvPosition;

  float col = mod( iFrame, uTiles );
  float row = floor( iFrame / uTiles );
  vUv = ( uv + vec2( col, row ) ) / uTiles;
  vCol = iCol;
  vAlpha = iAtt.w;

  #include <fog_vertex>
}
`;

// Additive light is attenuated by haze, never tinted by it. Running an ember
// through the standard fog mix makes it *brighter* the further off it is,
// because the fog colour at dusk is brighter than the ember.
const FOG_ATTENUATE = /* glsl */ `
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float ff = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    #else
      float ff = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    gl_FragColor.a *= 1.0 - ff;
  #endif
`;

// three's fragment prefix already carries `colorspace_pars_fragment`,
// `linearToOutputTexel` and — when it is presenting rather than filling a render
// target — `tonemapping_pars_fragment`. Including any of them here would be a
// redefinition and the program would fail to link, so the fog chunk's uses of
// `toneMapping()` and `linearToOutputTexel()` are satisfied entirely by the
// prefix. This shader includes only what the prefix does not provide.
const QUAD_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform sampler2D uAtlas;

varying vec2 vUv;
varying vec3 vCol;
varying float vAlpha;

void main() {
  vec4 t = texture2D( uAtlas, vUv );
  float a = t.a * vAlpha;
  if ( a < 0.004 ) discard;

  #if defined( MULTIPLY )

    // A stain darkens the surface it is on rather than adding light to it, so
    // it is lit by whatever lights the ground and can never glow in shadow —
    // which is the failure mode of every alpha-blended decal at dusk. Distance
    // fades it toward the identity rather than toward the fog colour, because
    // the ground under it is already hazed.
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float ff = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
      #else
        float ff = smoothstep( fogNear, fogFar, vFogDepth );
      #endif
      a *= 1.0 - ff;
    #endif
    gl_FragColor = vec4( mix( vec3( 1.0 ), vCol, a ), 1.0 );

  #elif defined( ADDITIVE )

    gl_FragColor = vec4( vCol * t.rgb, a );
${FOG_ATTENUATE}

  #else

    gl_FragColor = vec4( vCol * t.rgb, a );
    #include <fog_fragment>

  #endif
}
`;

// A tongue of flame, not a cone. The envelope is a teardrop; the noise field
// eats it from the top, so the silhouette ends in separate licks that break up
// and re-form. None of the shape is fixed geometry, which is the whole point —
// the hard triangular edge on the visual bar's failure list is what a mesh
// silhouette looks like, and a mesh silhouette cannot boil.
const FIRE_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

attribute vec3 iOrigin;
attribute vec4 iParams;   // width, height, phase, seed
// Temperature and radiance are two different things and used to be one number.
// Temperature says how far up the blackbody ramp a tongue reaches and how hard
// the noise erodes it; radiance says how much light it puts in the frame. A
// bonfire's inner tongues are the hottest *and* the most overlapped, so they
// have to be the dimmest per instance or their sum is the thing that welds.
attribute vec3 iHeat;     // temperature, cycles per second, radiance

uniform float uTime;
uniform vec2 uWind;

varying vec2 vUv;
varying float vCyc;
varying float vSeed;
varying float vHeat;
varying float vLevel;

void main() {
  float cyc = fract( uTime * iHeat.y + iParams.z );
  vCyc = cyc;
  vSeed = iParams.w;
  vHeat = iHeat.x;
  vLevel = iHeat.z;

  float w = iParams.x * ( 1.35 - 0.4 * cyc );
  float h = iParams.y * ( 0.62 + 0.45 * cyc );

  vec3 origin = iOrigin;
  origin.y += cyc * iParams.y * 0.42;
  // The root is anchored and only the tip wanders, so a tongue leans instead of
  // sliding sideways as a whole.
  float lean = cyc * cyc * iParams.y;
  origin.x += ( sin( uTime * 2.3 + vSeed * 9.0 ) * 0.17 + uWind.x * 0.6 ) * lean;
  origin.z += ( cos( uTime * 2.7 + vSeed * 7.0 ) * 0.17 + uWind.y * 0.6 ) * lean;

  vec3 camFwd = vec3( viewMatrix[ 0 ][ 2 ], viewMatrix[ 1 ][ 2 ], viewMatrix[ 2 ][ 2 ] );
  vec3 right = normalize( cross( vec3( 0.0, 1.0, 0.0 ), camFwd ) );

  vec3 world = origin + right * ( position.x * w ) + vec3( 0.0, 1.0, 0.0 ) * ( ( position.y + 0.5 ) * h );
  vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv;

  #include <fog_vertex>
}
`;

const FIRE_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform sampler2D uNoise;
uniform float uTime;
uniform float uIntensity;

varying vec2 vUv;
varying float vCyc;
varying float vSeed;
varying float vHeat;
varying float vLevel;

void main() {
  float y = vUv.y;

  // The axis snakes before anything else happens to it. Without this the tongue
  // is a straight spike no matter how hard its edge is eroded, and a picket
  // fence of straight spikes is the same failure as a cone with a hard edge.
  vec2 wp = vec2( vUv.x * 0.7 + vSeed, vUv.y * 0.5 - uTime * 0.45 + vSeed * 2.0 );
  float x = ( vUv.x - 0.5 ) * 2.0 - ( texture2D( uNoise, wp ).b - 0.5 ) * y * 1.6;

  // Envelope: round and fat low, drawn to nothing at the top.
  // Widest a third of the way up, not at the fuel bed: a fire has a neck, and
  // without one every tongue's root lands on every other tongue's root and the
  // base of the fire is a white disc.
  float prof = pow( sin( PI * pow( y, 0.62 ) ), 0.8 );
  float body = clamp( 1.0 - ( x * x ) / max( prof * prof, 0.01 ), 0.0, 1.0 );
  // The quad's bottom edge is a straight cut across the world; without this the
  // root of every tongue ends on it and the fire sits on a row of bright lobes.
  body *= smoothstep( 0.0, 0.16, y );

  // Two octaves scrolling at different rates. One octave slides; two boil.
  vec2 p = vec2( vUv.x * 1.4 + vSeed, vUv.y * 0.8 - uTime * 0.9 + vSeed * 3.0 );
  float n = texture2D( uNoise, p ).r * 0.6
          + texture2D( uNoise, p * 2.9 + vec2( - uTime * 0.35, - uTime * 1.9 ) ).g * 0.4;

  // Erosion bites hardest where the envelope is already thin, so the tip tears
  // into separate licks while the root stays whole.
  // Weighted hard toward the noise rather than toward the envelope, so the
  // dense core is patchy and moving. An envelope-dominated mix gives a solid
  // white mass with fire drawn around the edge of it.
  float dens = body * ( 0.08 + n * 1.6 ) - y * ( 0.55 - vHeat * 0.1 );
  dens = clamp( dens * 1.7, 0.0, 1.0 );

  // Born and dying at zero, so a tongue never pops into frame.
  float fade = sin( vCyc * PI );
  float flick = 0.76 + 0.24 * sin( uTime * 11.0 + vSeed * 21.0 ) * sin( uTime * 4.3 + vSeed * 6.0 );

  // Blackbody, authored two stops deeper than a photometer would ask for and
  // stopping well short of white. It has to be: the grade white-balances toward
  // neutral, then walks a quarter of the chroma out of anything this bright, and
  // then the shoulder compresses what is left — so an authored (1, 0.46, 0.105)
  // lands on screen at about (245, 216, 171), which is what the core of a
  // bonfire looks like in a photograph. Authoring the *screen* colour here, as
  // the ramp this replaces did, spends the whole chain arriving at grey.
  //
  // The top band deliberately does not reach the clip point on its own. It gets
  // there where three or four tongues cross, which is a small area and a moving
  // one — a nucleus, not a disc — and that is the only part of a fire that is
  // allowed to be white.
  vec3 col = mix( vec3( 0.50, 0.020, 0.002 ), vec3( 0.95, 0.135, 0.010 ), smoothstep( 0.02, 0.34, dens ) );
  col = mix( col, vec3( 1.0, 0.285, 0.038 ), smoothstep( 0.38, 0.74, dens ) );
  col = mix( col, vec3( 1.0, 0.46, 0.105 ), smoothstep( 0.80, 1.0, dens ) );
  // Temperature pulls the whole ramp back down it. A rag soaked in fat burns a
  // long way cooler than a metre of oak, so a torch comes out deep orange
  // instead of reading as a bonfire someone has stood on a pole — which, at four
  // pixels across against a night sky, is the only cue there is room for.
  col *= mix( vec3( 1.0, 0.72, 0.45 ), vec3( 1.0 ), vHeat );

  // Squared density. An additive falloff that is linear in coverage reads as a
  // flat card, because what the eye reads is the derivative at the edge.
  float a = dens * dens * fade * flick;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( col * uIntensity * vLevel, a );

${FOG_ATTENUATE}
}
`;

// Air over a fire, with no scene-colour tap to refract against. What is left is
// the honest half of heat shimmer: the boil and the loss of contrast. Kept very
// faint on purpose — a visible warm sheet reads as a bug, and the ember column
// does most of the work of selling heat anyway.
const HAZE_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform sampler2D uNoise;
uniform float uTime;
uniform float uIntensity;

varying vec2 vUv;
varying float vCyc;
varying float vSeed;
varying float vHeat;

void main() {
  vec2 p = vec2( vUv.x * 1.1 + vSeed, vUv.y * 0.55 - uTime * 0.5 );
  float bands = abs( texture2D( uNoise, p ).b - texture2D( uNoise, p * 2.1 + vec2( 0.3, - uTime * 0.9 ) ).r ) * 2.4;

  float envelope = smoothstep( 0.0, 0.25, vUv.y ) * ( 1.0 - smoothstep( 0.3, 1.0, vUv.y ) );
  envelope *= 1.0 - clamp( pow( abs( vUv.x - 0.5 ) * 2.0, 1.6 ), 0.0, 1.0 );

  float a = bands * envelope * uIntensity * vHeat * sin( vCyc * PI );
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( vec3( 1.0, 0.66, 0.38 ), a );

${FOG_ATTENUATE}
}
`;

const RIBBON_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

attribute vec3 aCol;
attribute float aAlpha;

varying vec2 vUv;
varying vec3 vCol;
varying float vAlpha;

void main() {
  vec4 mvPosition = viewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv;
  vCol = aCol;
  vAlpha = aAlpha;
  #include <fog_vertex>
}
`;

const RIBBON_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform sampler2D uAtlas;
uniform vec2 uCell;
uniform float uScale;
uniform float uScroll;

varying vec2 vUv;
varying vec3 vCol;
varying float vAlpha;

void main() {
  // The strip's u is pinned to the arc, so without a scroll the striations
  // stand still while the geometry sweeps out from under them.
  vec2 uv = uCell + vec2( fract( vUv.x * 2.0 - uScroll ), clamp( vUv.y, 0.04, 0.96 ) ) * uScale;
  float a = texture2D( uAtlas, uv ).a * vAlpha;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( vCol, a );

${FOG_ATTENUATE}
}
`;

/**
 * Fog uniforms for a hand-written material.
 *
 * The first four have to exist or `refreshFogUniforms` dereferences undefined
 * the first time the scene has fog; they are fresh objects, because they are
 * three's to write and sharing them back into `ShaderLib` would have every
 * material in the program cache writing over each other.
 *
 * The aerial ones are the opposite case. sky.ts smuggles them into each
 * `ShaderLib` entry rather than into `UniformsLib`, so a ShaderMaterial never
 * sees them and silently falls back to flat fog. Taking them by reference here
 * shares the very Float32Arrays sky rewrites each frame, which is what puts a
 * smoke column in the same air as the hut behind it. If the patch is not
 * installed the names are simply absent and stock fog applies.
 */
function fogUniforms(): Record<string, THREE.IUniform> {
  const u: Record<string, THREE.IUniform> = {
    fogColor: { value: new THREE.Color(0xffffff) },
    fogDensity: { value: 0.00025 },
    fogNear: { value: 1 },
    fogFar: { value: 2000 },
  };
  const lib = (THREE.ShaderLib as unknown as Record<string, { uniforms: Record<string, THREE.IUniform> } | undefined>).basic;
  if (lib) {
    for (const [name, uniform] of Object.entries(lib.uniforms)) {
      if (name.startsWith("fog") && !(name in u)) u[name] = uniform;
    }
  }
  return u;
}

// ---------------------------------------------------------------------------
// Instanced quad layers
// ---------------------------------------------------------------------------

const QUAD_POS = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0];
const QUAD_UV = [0, 0, 1, 0, 1, 1, 0, 1];
const QUAD_IDX = [0, 1, 2, 0, 2, 3];

function quadGeometry(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(QUAD_POS.slice(), 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(QUAD_UV.slice(), 2));
  g.setIndex(QUAD_IDX.slice());
  return g;
}

/** 0 camera-facing, 1 cylindrical (world up), 2 lying on the ground. */
type Billboard = 0 | 1 | 2;

/** How a layer reaches the frame: light added, coverage over, or a stain under. */
type Blend = "add" | "alpha" | "multiply";

/**
 * A fixed pool of textured quads. Callers fill it between `begin()` and `end()`;
 * nothing is allocated after construction, and only the bytes actually written
 * are uploaded — a brawl with twelve live sparks should not push a hundred and
 * thirty kilobytes across the bus.
 */
class QuadLayer {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly att: Float32Array;
  private readonly frames: Float32Array;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aCol: THREE.InstancedBufferAttribute;
  private readonly aAtt: THREE.InstancedBufferAttribute;
  private readonly aFrame: THREE.InstancedBufferAttribute;
  private n = 0;

  constructor(
    readonly capacity: number,
    texture: THREE.Texture,
    tiles: number,
    billboard: Billboard,
    blend: Blend,
    renderOrder: number,
  ) {
    this.geometry = quadGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.att = new Float32Array(capacity * 4);
    this.frames = new Float32Array(capacity);
    const dyn = (a: THREE.InstancedBufferAttribute) => {
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aPos = dyn(new THREE.InstancedBufferAttribute(this.pos, 3));
    this.aCol = dyn(new THREE.InstancedBufferAttribute(this.col, 3));
    this.aAtt = dyn(new THREE.InstancedBufferAttribute(this.att, 4));
    this.aFrame = dyn(new THREE.InstancedBufferAttribute(this.frames, 1));
    this.geometry.setAttribute("iPos", this.aPos);
    this.geometry.setAttribute("iCol", this.aCol);
    this.geometry.setAttribute("iAtt", this.aAtt);
    this.geometry.setAttribute("iFrame", this.aFrame);
    this.geometry.instanceCount = 0;

    const defines: Record<string, number> = { BILLBOARD: billboard };
    if (blend === "add") defines.ADDITIVE = 1;
    if (blend === "multiply") defines.MULTIPLY = 1;

    this.material = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: texture }, uTiles: { value: tiles }, ...fogUniforms() },
      vertexShader: QUAD_VERT,
      fragmentShader: QUAD_FRAG,
      defines,
      transparent: true,
      depthWrite: false,
      blending: blend === "add" ? THREE.AdditiveBlending
        : blend === "multiply" ? THREE.CustomBlending
        : THREE.NormalBlending,
      // dst × src, which with the shader's `mix(white, tint, coverage)` gives a
      // soft-edged stain rather than the hard-edged rectangle three's stock
      // MultiplyBlending produces, because that one ignores alpha entirely.
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.SrcColorFactor,
      fog: true,
      side: billboard === 2 ? THREE.DoubleSide : THREE.FrontSide,
      // Decals and ground rings sit millimetres above terrain that has its own
      // slope; the offset is what stops them dashing in and out along a swale.
      polygonOffset: billboard === 2,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  begin(): void {
    this.n = 0;
  }

  push(
    x: number, y: number, z: number,
    w: number, h: number, rot: number, alpha: number,
    r: number, g: number, b: number,
    frame: number,
  ): void {
    if (this.n >= this.capacity || alpha <= 0.002) return;
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 3] = r;
    this.col[i * 3 + 1] = g;
    this.col[i * 3 + 2] = b;
    this.att[i * 4] = w;
    this.att[i * 4 + 1] = h;
    this.att[i * 4 + 2] = rot;
    this.att[i * 4 + 3] = alpha;
    this.frames[i] = frame;
  }

  end(): void {
    this.geometry.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n === 0) return;
    const mark = (a: THREE.InstancedBufferAttribute, size: number) => {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * size);
      a.needsUpdate = true;
    };
    mark(this.aPos, 3);
    mark(this.aCol, 3);
    mark(this.aAtt, 4);
    mark(this.aFrame, 1);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * The flame and haze layers. Same instance layout, different fragment shader:
 * both are cylindrical billboards whose whole animation lives on the GPU, so a
 * fire costs nothing per frame beyond one uniform write.
 */
class FireLayer {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly origin: Float32Array;
  private readonly params: Float32Array;
  private readonly heat: Float32Array;
  private readonly aOrigin: THREE.InstancedBufferAttribute;
  private readonly aParams: THREE.InstancedBufferAttribute;
  private readonly aHeat: THREE.InstancedBufferAttribute;
  private n = 0;

  constructor(readonly capacity: number, fragment: string, noise: THREE.Texture, renderOrder: number) {
    this.geometry = quadGeometry();
    this.origin = new Float32Array(capacity * 3);
    this.params = new Float32Array(capacity * 4);
    this.heat = new Float32Array(capacity * 3);
    this.aOrigin = new THREE.InstancedBufferAttribute(this.origin, 3);
    this.aParams = new THREE.InstancedBufferAttribute(this.params, 4);
    this.aHeat = new THREE.InstancedBufferAttribute(this.heat, 3);
    this.geometry.setAttribute("iOrigin", this.aOrigin);
    this.geometry.setAttribute("iParams", this.aParams);
    this.geometry.setAttribute("iHeat", this.aHeat);
    this.geometry.instanceCount = 0;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uNoise: { value: noise },
        uTime: { value: 0 },
        uIntensity: { value: 1 },
        uWind: { value: new THREE.Vector2() },
        ...fogUniforms(),
      },
      vertexShader: FIRE_VERT,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  begin(): void {
    this.n = 0;
  }

  push(
    x: number, y: number, z: number,
    w: number, h: number, phase: number, seed: number,
    temperature: number, rate: number, level: number,
  ): void {
    if (this.n >= this.capacity) return;
    const i = this.n++;
    this.origin[i * 3] = x;
    this.origin[i * 3 + 1] = y;
    this.origin[i * 3 + 2] = z;
    this.params[i * 4] = w;
    this.params[i * 4 + 1] = h;
    this.params[i * 4 + 2] = phase;
    this.params[i * 4 + 3] = seed;
    this.heat[i * 3] = temperature;
    this.heat[i * 3 + 1] = rate;
    this.heat[i * 3 + 2] = level;
  }

  end(): void {
    this.geometry.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    this.aOrigin.needsUpdate = true;
    this.aParams.needsUpdate = true;
    this.aHeat.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// Particle store
// ---------------------------------------------------------------------------

const F_BOUNCE = 1;   // reflects off the ground and loses energy
const F_STAIN = 2;    // dies on the ground and leaves a decal
const F_ALIGN = 4;    // rotates to face its own velocity, stretched by speed
const F_TWINKLE = 8;  // brightness flickers, for embers and hot sparks
const F_WIND = 16;    // carried by the arena's wind
const F_ALPHA = 32;   // draws in the alpha layer rather than the additive one
const F_AMBIENT = 64; // fire-borne; capped separately so it cannot starve combat

/** Struct of arrays. One allocation per field at build time, none per particle. */
interface Store {
  cap: number;
  n: number;
  px: Float32Array; py: Float32Array; pz: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  life: Float32Array; maxLife: Float32Array;
  size0: Float32Array; size1: Float32Array; aspect: Float32Array;
  r0: Float32Array; g0: Float32Array; b0: Float32Array;
  r1: Float32Array; g1: Float32Array; b1: Float32Array;
  alpha: Float32Array; fadeIn: Float32Array; fadePow: Float32Array;
  rot: Float32Array; rotV: Float32Array;
  drag: Float32Array; grav: Float32Array; turb: Float32Array; buoy: Float32Array;
  frame: Float32Array; seed: Float32Array;
  flags: Uint8Array;
}

const STORE_FIELDS = [
  "px", "py", "pz", "vx", "vy", "vz", "life", "maxLife",
  "size0", "size1", "aspect", "r0", "g0", "b0", "r1", "g1", "b1",
  "alpha", "fadeIn", "fadePow", "rot", "rotV",
  "drag", "grav", "turb", "buoy", "frame", "seed",
] as const;

function makeStore(cap: number): Store {
  const s = { cap, n: 0, flags: new Uint8Array(cap) } as Store;
  for (const f of STORE_FIELDS) s[f] = new Float32Array(cap);
  return s;
}

/** Everything a spawned particle needs; the kind recipes below fill it in. */
interface Seed {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  size0: number; size1: number;
  c0: THREE.Color; c1: THREE.Color;
  alpha: number;
  frame: number;
  flags: number;
  aspect?: number;
  /**
   * Fraction of `life` already spent at spawn, 0..1.
   *
   * A capture is twenty-six animation frames against a 50 ms clamp — 1.35
   * seconds of simulated time, whatever the wall clock says — so any effect that
   * has to accumulate for longer than that is structurally invisible to the
   * review process, however correct it is in play. This is how an ambient
   * population arrives already established rather than all born at t = 0 and all
   * still fading in.
   */
  born?: number;
  fadeIn?: number;
  fadePow?: number;
  rot?: number;
  rotV?: number;
  drag?: number;
  grav?: number;
  turb?: number;
  buoy?: number;
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
//
// Linear radiance throughout. The bloom threshold is 2.55 at dusk and 1.30 on
// the last stand, and both now sit *below* the point where the grade clips, so
// for the first time a source in this list can bloom and keep its hue. That
// clip point is strongly hue-dependent and it is the number to check against
// before moving anything here: running the whole chain — exposure, balance,
// contrast, crosstalk, filmic, the metered response, the split-tone and the
// encode — a neutral reaches code 255 at 3.23 scene units at dusk and 1.40 on
// the last stand, but a fire hue reaches it far sooner, ~2.3–2.5, because the
// split-tone's highlight tint multiplies R *after* the curve is already
// clamped. Blue has the most headroom of anything here, ~6.25.
//
// So everything hot sits in the band between its own gate and its own clip,
// which for a fire hue at dusk is roughly 2.6–3.0 and on the last stand is
// empty. The one exception is a struck spark, which is genuinely white-hot
// metal and is allowed to blow.
//
// Where a comment below quotes an RGB triple it is the *displayed* code that
// value produces at dusk, from running postfx's exposure, balance, contrast,
// crosstalk and curve on the CPU — not the linear number on the line.

const linear = (hex: number, k = 1) => new THREE.Color().setHex(hex, THREE.SRGBColorSpace).multiplyScalar(k);

const PALETTE = {
  // Steel on steel. Blows to [255,255,255] and is meant to — but at 5.4 it also
  // sat far enough over the clip that the *cooling* half of its life was white
  // too. 4.4 keeps the head white and lets the tail go amber.
  sparkHot: linear(0xffe6a8, 4.4),
  sparkCool: linear(0xff4407, 0.85),
  // [219,161,97], saturation 0.56. At the old 3.2 this was [241,209,160] at dusk
  // and [255,238,204] on the last stand — an ember column that read as a spray
  // of white specks in `v9/lineup.png`, which is exactly what it looked like.
  emberHot: linear(0xff9a34, 2.15),
  emberCool: linear(0x9c2000, 0.3),
  /** Spilled coals on the ground round a fire: dimmer and redder than airborne. */
  coalBed: linear(0xff7a1e, 1.6),
  /** The halo a fire hangs in. Wide, soft, and deliberately under the clip. */
  fireHalo: linear(0xff8a2e, 1.35),
  bloodFresh: linear(0x8e1208, 0.95),
  bloodDark: linear(0x360609, 0.7),
  // The head of a stump spray. Oxygenated blood under pressure really is
  // brighter than what runs out of a cut, and the half-stop between this and
  // `bloodFresh` is the whole difference between a wound and a severance — it
  // cannot be carried by particle count alone, because on the low tier there
  // are not enough particles for a count to say anything.
  bloodArterial: linear(0xb4200c, 1.1),
  mist: linear(0x6d1410, 0.7),
  dustNear: linear(0x9c8f6f, 0.5),
  dustFar: linear(0x6a6252, 0.3),
  smokeLit: linear(0x6a4630, 0.3),
  smokeCold: linear(0x2c2b2d, 0.12),
  mail: linear(0xc2ccd6, 0.55),
  cloth: linear(0x6d6152, 0.35),
  // At 0.16 a mote added about six code values to a 60-luma floor, which is
  // below what a JPEG would survive: two hundred and twenty of them were in
  // every frame and none of them was visible. 0.30 puts a speck a stop over the
  // ground it crosses and still a long way under anything that could bloom.
  ash: linear(0xd8cfc0, 0.3),
  emberMote: linear(0xff8f3a, 0.85),
};

// ---------------------------------------------------------------------------
// Ability signatures
// ---------------------------------------------------------------------------
//
// The orchestrator sends an aura tick as a colour, so the colour is the class.
// Each signature is built to be told apart at a glance in a mêlée: the shapes
// differ, not just the hue, because in a brawl at dusk everything reads orange.

interface Signature {
  /** Atlas cell for the trailing motes. */
  cell: number;
  /** Base linear colour of the aura. */
  color: THREE.Color;
  /** Radius the motes are born on, metres. */
  ring: number;
  /** Tangential speed — what makes the runekeeper's glyphs orbit. */
  swirl: number;
  rise: number;
  size: number;
  spin: number;
  /** Radius the activation shockwave opens to. */
  shock: number;
}

const SIGNATURES = new Map<number, Signature>([
  // Berserker: flame licks torn upward off the body. Hot, ragged, fast.
  [0xff3311, { cell: CELL.flame, color: linear(0xff5a1e, 2.6), ring: 0.42, swirl: 0.4, rise: 2.9, size: 0.2, spin: 0.5, shock: 2.6 }],
  // Huscarl: cold hexagonal scales, slow and heavy, a wall assembling itself.
  [0x4488ff, { cell: CELL.scale, color: linear(0x5aa0ff, 2.2), ring: 0.62, swirl: 0.9, rise: 0.8, size: 0.26, spin: 0.9, shock: 2.2 }],
  // THE WRECCA'S SHADOW STEP: ash whipped low and close, and it is NOT a glyph.
  //
  // This was `CELL.rune` in bright violet — purple runes orbiting the body,
  // spinning on their own axis. Two things were wrong with it and they are the
  // same thing. The class has no runes in it anywhere: 92 health, the largest
  // dodge in the game, the weakest guard, twin seaxes, and an ability called
  // SHADOW STEP. And purple orbiting glyphs is the single most generic-fantasy
  // image this renderer could have drawn, which is the one thing this project
  // has a standing rule against. The name went to WRECCA — the exile, the man
  // with no shield wall to stand in — and the picture had to follow it.
  //
  // So: ash, not glyphs. `rise` 1.0 -> 0.25 because smoke off a snuffed torch
  // does not ASCEND, it hangs and drifts; `spin` 2.2 -> 0.35 because a flake of
  // ash has no axis to spin on and a glyph does; `swirl` up, `ring` in, so it
  // whips CLOSE to the body — a man going out where he stood rather than a
  // wizard opening a circle. Cold desaturated grey at 1.5 rather than violet at
  // 2.6: it must read against a night arena lit only by the bonfire, and it
  // must not be confused with the huscarl's saturated blue at 2.2.
  [0x6b7280, { cell: CELL.ash, color: linear(0x9aa6b4, 1.5), ring: 0.48, swirl: 3.2, rise: 0.25, size: 0.34, spin: 0.35, shock: 2.4 }],
  // Anything else: gold sparks spiralling up. Also the fallback for a class
  // this table has not been told about yet.
  [0xffaa33, { cell: CELL.spark, color: linear(0xffbb55, 3.2), ring: 0.34, swirl: 1.7, rise: 2.2, size: 0.12, spin: 0, shock: 2.4 }],
]);

// ---------------------------------------------------------------------------
// Kind inference
// ---------------------------------------------------------------------------

/**
 * Guess what an effect is from the colour it was asked for. This exists because
 * the orchestrator still describes bursts as "sixteen of #d42a1a" rather than
 * "a blood spray", and a colour is the only signal in that. The thresholds are
 * fitted to the six call sites in GameCanvas.tsx and nothing more; the fix is
 * for those call sites to pass `kind`, at which point this can be deleted.
 */
function inferKind(hex: number): BurstKind {
  if (SIGNATURES.has(hex)) return "aura";
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const mx = Math.max(r, g, b);
  const sat = mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
  if (mx > 0.85 && sat < 0.6 && g > 0.6) return "spark";
  if (mx < 0.9 && r > g * 1.8 && r > b * 1.8) return "blood";
  return "dust";
}

// ---------------------------------------------------------------------------
// Blade ribbons
// ---------------------------------------------------------------------------

/** Raw tip samples per ribbon: one full swing at anim.ts's 24 Hz hook rate. */
const RIBBON_SAMPLES = 10;
/** Interpolated segments the strip is actually built from. */
const RIBBON_SEGMENTS = 16;

interface Ribbon {
  active: boolean;
  /** World-space tip samples, oldest first. */
  pts: Float32Array;
  n: number;
  hex: number;
  color: THREE.Color;
  width: number;
  /** Seconds since the last sample; drives the tail dissolving. */
  idle: number;
}

// ---------------------------------------------------------------------------

interface Decal {
  /** Slots are preallocated and reused; this is what says one is in the world. */
  active: boolean;
  x: number; y: number; z: number;
  size0: number; size1: number;
  /**
   * The age window over which the mark grows from `size0` to `size1`. Empty for
   * a thrown droplet, which lands the size it lands; seconds wide for a pool,
   * which is the only thing on the ground still arriving after it is drawn. It
   * is a window rather than a duration because a mark that another droplet runs
   * into starts growing again from wherever it had got to.
   */
  spread0: number;
  spread: number;
  rot: number;
  age: number; life: number;
  /** A pool under a body: evicted last, dries slowest, darkest at the centre. */
  pool: boolean;
  /** Which stain cell. Sixteen shapes, so a cluster has no repeat in it. */
  cell: number;
  /**
   * How much blood has run into this mark, 0..1. It rises every time another
   * lands inside it, and it drives the tint darker — the thing that makes a
   * place where a man bled out read as deeper than a place he was grazed.
   */
  depth: number;
  /** Bumped on reuse, so a jet can tell its own pool from the one that took its slot. */
  stamp: number;
}

/**
 * A wound that keeps running.
 *
 * It is not a particle and it is not a burst: it is an emitter that reads a
 * node's world transform every frame. That is the difference between blood that
 * stays welded to a stump as the corpse folds over onto it and blood that hangs
 * in the air where the man used to be standing — and it is what lets a spray
 * inherit the motion of the thing it is coming out of, which is most of why a
 * severed head trailing blood reads as heavy.
 */
interface Jet {
  active: boolean;
  /** Followed while it has a parent. Null for a jet pinned to a world point. */
  anchor: THREE.Object3D | null;
  /** Which way along the anchor's own Y the wound opens. */
  axis: 1 | -1;
  /** Last known wound frame in world space. */
  x: number; y: number; z: number;
  dx: number; dy: number; dz: number;
  radius: number;
  power: number;
  age: number;
  life: number;
  /** Fractional droplets carried between frames, so a low rate is not a stutter. */
  acc: number;
  /** Previous frame's position, for the momentum a spray inherits. */
  lx: number; ly: number; lz: number;
  tracked: boolean;
  /** True for the jet on the body: the one that leaves a pool where it ends. */
  pools: boolean;
  /** Bumped on reuse, so a stale `BleedHandle` cannot stop somebody else's wound. */
  serial: number;
}

interface Ring {
  x: number; y: number; z: number;
  age: number; life: number;
  r0: number; r1: number;
  color: THREE.Color;
  frame: number;
}

interface Flash {
  light: THREE.PointLight;
  age: number;
  life: number;
  peak: number;
}

interface Fire {
  id: number;
  spec: FireSpec;
  emberAcc: number;
  smokeAcc: number;
  /**
   * Per-tongue height and rate wobble, drawn once and kept.
   *
   * It used to be a `rand()` inside the rebuild, which was safe only because a
   * static fire is rebuilt on a dirty flag and almost never. Burning warriors
   * move, so the layer is now repacked every frame they exist — and a fresh
   * draw every frame would make every torch in the arena strobe the moment
   * somebody caught fire. Same distribution, drawn once.
   */
  jitter: Float32Array | null;
}

/**
 * A warrior the server says is alight.
 *
 * This is the bonfire's own machinery at a smaller scale and on a moving
 * anchor: the same tongue shader, the same ember and smoke emitters, the same
 * halo quad, one warm point light. The only thing a burner adds over a `Fire`
 * is that its origin moves, which is why its tongues are repacked every frame
 * instead of on a dirty flag — and that motion is the whole feature. A man
 * fleeing the fire still alight is the image this exists to produce.
 */
interface Burner {
  id: string;
  active: boolean;
  /** The server's `burning`. False starts the tail; it does not end the burner. */
  alight: boolean;
  /** `burnTimer / FIRE.linger`, curved. Drives flame size, radiance and light. */
  flame: number;
  /** Smoothed `burnInside`. Engulfed is taller, brighter and over the head. */
  inside: number;
  insideTarget: number;
  /**
   * Seconds of smoke left once the flames are gone.
   *
   * Not a second burn timer and it must never grow into one — the server owns
   * how long a man smokes, including a corpse's smoulder. This is a render-side
   * dissolve, the same as a decal fading: a body that was throwing smoke a
   * moment ago does not stop throwing it on a packet boundary.
   */
  tail: number;
  /** Capsule foot and chest in world space. Held after death so smoke stays put. */
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  /** A rig has been found at least once, so the held position means something. */
  placed: boolean;
  emberAcc: number;
  smokeAcc: number;
  seed: number;
  /** Clock of the last `setBurning`. A caller that goes quiet puts him out. */
  seenAt: number;
  /** What a real light on this man would be worth, before the pool is shared. */
  want: number;
  /** Light bid: `want` fought over by distance to what the frame is looking at. */
  score: number;
}

export function createVfx(
  scene: THREE.Scene,
  textures: TextureLibrary,
  settings: QualitySettings,
  opts: VfxOptions = {},
): VfxHandle {
  const root = new THREE.Group();
  root.name = "vfx";
  scene.add(root);

  const tier = settings.tier;
  const groundAt = opts.groundAt ?? (() => 0);
  const budget = settings.particleBudget;

  const atlas = buildAtlas(CELL_ALPHA, TILES, Math.max(32, settings.spriteSize), textures.maxAnisotropy, 1.26, "vfx:atlas");
  // Stains are soft by construction — there is no high-frequency detail in one
  // to lose — so they are generated at half a particle's resolution and capped
  // at 64. Sixteen cells at a full 128 is a megabyte for a mark that is never
  // sharp. As capped: 256² and 26 ms on high and medium, 128² and 6 ms on low,
  // against the 250 ms and 40 MB the visual bar gives the whole texture set.
  const stainAtlas = buildAtlas(
    STAIN_ALPHA, STAIN_TILES,
    Math.max(24, Math.min(64, settings.spriteSize)), textures.maxAnisotropy,
    1.0, "vfx:stains",
  );
  const noise = buildNoise(tier === "low" ? 64 : 128);

  // ---- layers -------------------------------------------------------------
  // Six draw calls for every effect in the game. Render order runs decals →
  // ground rings → smoke → sparks → ribbons → flame, which is roughly back to
  // front for anything that overlaps and always puts the fire on top of its
  // own smoke.
  const moteCount = settings.moteCount;
  const additiveLayer = new QuadLayer(budget + moteCount + 64, atlas, TILES, 0, "add", 4);
  const alphaLayer = new QuadLayer(budget, atlas, TILES, 0, "alpha", 3);
  // Ground-lying additive: ability shockwaves, plus the coal bed round every
  // bonfire. Ten rings and a bed per fire, so the capacity is no longer twelve.
  const ringLayer = new QuadLayer(48, atlas, TILES, 2, "add", 2);
  /** Spilled coals per bonfire. Enough to read as a bed, few enough to count. */
  const COAL_BED = tier === "low" ? 6 : 11;
  const decalLayer = new QuadLayer(Math.max(1, settings.decalBudget), stainAtlas, STAIN_TILES, 2, "multiply", 1);
  /**
   * Blood on a body, as opposed to blood on the ground.
   *
   * Camera-facing rather than ground-lying, and it multiplies for the same
   * reason the ground marks do: an alpha-blended stain carries its own
   * brightness and glows on a warrior standing in shadow, which is the failure
   * this file already records for red-on-turf. Depth-tested against the body it
   * is on, so a mark on a man's back is correctly hidden when you are in front
   * of him. It costs one draw call and only while somebody is bloodied — the
   * layer hides itself at zero instances.
   */
  const bodyMarkCap = tier === "high" ? 36 : tier === "medium" ? 20 : 8;
  const bodyLayer = new QuadLayer(bodyMarkCap, stainAtlas, STAIN_TILES, 0, "multiply", 2);

  /** A blood moot seats eight, so eight men can be alight at once and no more. */
  const BURN_SLOTS = 8;
  /**
   * Tongues per burning man. The low tier thins him the way it thins the
   * bonfire — fewer tongues, each proportionally wider — rather than shrinking
   * him, because three fat licks still read as a man on fire at fight distance
   * on a phone and nine thin ones would not survive the pixel count anyway.
   */
  //
  // 10/7/4, up from 7/5/3, and the reason is a photograph rather than a theory.
  // `art/shots/fire/burnman.png` was the first frame of a burning man anybody had
  // ever looked at, and the answer to "does he read as on fire" was no — he read
  // as a man standing beside a small campfire. Part of that was placement (see
  // the tongue loop) and part of it is simply count: seven tongues on a turning
  // ring means that at any instant about three are on the camera's side of him
  // and the rest are occluded by his own body, because a flame is depth-tested
  // against the mail it is coming off. Three licks do not engulf anybody. Ten
  // keeps four or five in front at every phase of the turn, and the width
  // correction below holds the total radiance where it was.
  const BURN_TONGUES = tier === "high" ? 10 : tier === "medium" ? 7 : 4;

  // Burners get their own reserved slice of the flame layer rather than sharing
  // the arena's headroom. The arena is a bonfire and ten torches — 56 tongues on
  // high, 29 on low — and the low tier's spare 19 would have silently dropped
  // five of eight burning men, which is the one failure mode that must not be
  // possible. Instance storage is ten floats a tongue; the reserve is free.
  const FIRE_CAPACITY = (tier === "high" ? 128 : tier === "medium" ? 96 : 48) + BURN_SLOTS * BURN_TONGUES;
  const fireLayer = new FireLayer(FIRE_CAPACITY, FIRE_FRAG, noise, 6);
  // Haze is the one thing in this module that is an effect rather than art
  // direction, so it is the one thing the lower tiers drop: the fire is fully
  // legible without it, and without a scene-colour tap it is half an effect
  // anyway.
  const hazeLayer = tier === "high" ? new FireLayer(8, HAZE_FRAG, noise, 5) : null;
  if (hazeLayer) hazeLayer.material.uniforms.uIntensity.value = 0.03;

  root.add(decalLayer.mesh, bodyLayer.mesh, ringLayer.mesh, alphaLayer.mesh, additiveLayer.mesh, fireLayer.mesh);
  if (hazeLayer) root.add(hazeLayer.mesh);

  // ---- particles ----------------------------------------------------------
  const store = makeStore(budget);
  /** Fire-borne particles are capped below the budget so a bonfire burning for
   *  ten minutes can never crowd out the sparks off a parry. */
  const ambientCap = Math.floor(budget * 0.45);
  let ambientLive = 0;
  /** Live droplets that could hit a body, so a fight with no blood in it pays
   *  nothing for the body scan. Kept the same way `ambientLive` is. */
  let stainLive = 0;

  function spawn(s: Seed): boolean {
    if (store.n >= store.cap) return false;
    if (s.flags & F_AMBIENT) {
      if (ambientLive >= ambientCap) return false;
      ambientLive++;
    }
    if (s.flags & F_STAIN) stainLive++;
    const i = store.n++;
    store.px[i] = s.x; store.py[i] = s.y; store.pz[i] = s.z;
    store.vx[i] = s.vx; store.vy[i] = s.vy; store.vz[i] = s.vz;
    store.maxLife[i] = s.life;
    store.life[i] = s.life * (1 - clamp01(s.born ?? 0));
    store.size0[i] = s.size0; store.size1[i] = s.size1;
    store.aspect[i] = s.aspect ?? 1;
    store.r0[i] = s.c0.r; store.g0[i] = s.c0.g; store.b0[i] = s.c0.b;
    store.r1[i] = s.c1.r; store.g1[i] = s.c1.g; store.b1[i] = s.c1.b;
    store.alpha[i] = s.alpha;
    store.fadeIn[i] = s.fadeIn ?? 0.05;
    store.fadePow[i] = s.fadePow ?? 1.4;
    store.rot[i] = s.rot ?? Math.random() * TAU;
    store.rotV[i] = s.rotV ?? 0;
    store.drag[i] = s.drag ?? 1.2;
    store.grav[i] = s.grav ?? 9.8;
    store.turb[i] = s.turb ?? 0;
    store.buoy[i] = s.buoy ?? 0;
    store.frame[i] = s.frame;
    store.seed[i] = Math.random() * 100;
    store.flags[i] = s.flags;
    return true;
  }

  /** Move one particle's whole row from `src` to `dst`. Used by `clearBattle`'s
   *  compaction, which keeps the ambient population and drops everything else. */
  function copyParticle(src: number, dst: number): void {
    for (const f of STORE_FIELDS) store[f][dst] = store[f][src];
    store.flags[dst] = store.flags[src];
  }

  function kill(i: number): void {
    if (store.flags[i] & F_AMBIENT) ambientLive--;
    if (store.flags[i] & F_STAIN) stainLive--;
    const last = --store.n;
    if (i !== last) {
      for (const f of STORE_FIELDS) store[f][i] = store[f][last];
      store.flags[i] = store.flags[last];
    }
  }

  // ---- decals -------------------------------------------------------------
  // Every slot exists before the first blow lands and none is ever allocated
  // again. The array this replaces pushed an object per stain and shifted the
  // front off when it overflowed, which is one allocation and one O(n) copy per
  // droplet that hits the ground — cheap alone, and a hundred droplets land in
  // the second after a bisection.
  const decalCap = Math.max(1, settings.decalBudget);
  const decals: Decal[] = [];
  let decalStamp = 1;
  for (let i = 0; i < decalCap; i++) {
    decals.push({
      active: false, x: 0, y: 0, z: 0,
      size0: 0, size1: 0, spread0: 0, spread: 0, rot: 0, age: 0, life: 0,
      pool: false, cell: 0, depth: 0, stamp: 0,
    });
  }

  /**
   * What a mark measures across right now, part-way through its spreading.
   * Eases out: blood runs fastest when there is most of it behind it, and a
   * pool that grows linearly reads as something being scaled.
   */
  function decalSize(d: Decal): number {
    const span = d.spread - d.spread0;
    const grow = span > 0 ? 1 - Math.pow(1 - clamp01((d.age - d.spread0) / span), 2) : 1;
    return d.size0 + (d.size1 - d.size0) * grow;
  }

  /**
   * A slot to stain. Free one if there is one, otherwise the most-dried mark —
   * but a droplet always goes before a pool, whatever their ages. A pool is
   * metres of the frame under a body that is still lying there; a fleck of
   * spatter is centimetres. Evicting by age alone is what lets sixty droplets
   * from one death scrub out the pool that same death left.
   */
  function claimDecal(pool: boolean): Decal {
    let best = decals[0];
    let bestScore = -1;
    for (const d of decals) {
      if (!d.active) { best = d; break; }
      const score = (d.pool ? 0 : 2) + d.age / d.life;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    best.active = true;
    best.pool = pool;
    best.age = 0;
    best.stamp = ++decalStamp;
    best.rot = Math.random() * TAU;
    // Pooled cells for a pool, thrown cells for spatter. They are different
    // kinds of mark and drawing one with the other's silhouette is what made a
    // pool read as a rosette of droplets in the first place.
    best.cell = pool
      ? STAIN_POOL_FIRST + Math.floor(Math.random() * (STAIN_CELLS - STAIN_POOL_FIRST))
      : Math.floor(Math.random() * STAIN_POOL_FIRST);
    best.depth = pool ? 0.55 : 0.16;
    return best;
  }

  /**
   * The largest a mark is allowed to grow by merging. Past this a fight in one
   * place turns the whole floor one colour, which is a different defect from the
   * one merging exists to fix.
   */
  const MERGE_CEIL = 1.5;

  /**
   * Blood that lands on blood joins it instead of taking a slot of its own.
   *
   * This is the whole of "a pool under a body is one mark, not eight petals".
   * The old path claimed a fresh decal per droplet, so a stump emptying itself
   * over one square metre left a dozen separate hard-edged blobs of roughly one
   * size — which is what a scatter of leaves looks like and what the capture
   * caught. Marks that touch are one mark: areas add, the centre moves toward
   * the new arrival by its share, and the depth rises so the place that has
   * taken the most blood is the darkest.
   *
   * It also spends the budget the way it should be spent. Sixty-four slots on
   * high and eight on low go a great deal further when the sixtieth droplet
   * deepens the pool it fell in rather than evicting the mark on the far side of
   * the arena.
   */
  function mergeStain(x: number, z: number, size: number, pool: boolean): Decal | null {
    let best: Decal | null = null;
    let bestGap = Infinity;
    for (const d of decals) {
      if (!d.active) continue;
      // Spatter joins a pool; a pool never degrades into spatter, and a mark
      // that has all but dried is a stain on the ground rather than liquid and
      // has nothing left to flow into.
      if (d.pool && !pool && d.age > d.life * 0.75) continue;
      if (!d.pool && pool && d.age > d.life * 0.9) continue;
      const cur = decalSize(d);
      const gap = Math.hypot(d.x - x, d.z - z);
      // Overlap, not proximity: rims that touch run together and rims that do
      // not are two marks, which is the behaviour that keeps spatter reading as
      // spatter instead of collapsing every fleck into one disc.
      if (gap > (cur + size) * 0.5) continue;
      if (gap >= bestGap) continue;
      bestGap = gap;
      best = d;
    }
    if (!best) return null;

    const cur = decalSize(best);
    const merged = Math.min(MERGE_CEIL, Math.sqrt(cur * cur + size * size));
    // Weighted by area: a fleck landing in a pool barely moves it, and two
    // marks of a size meet in the middle.
    const w = clamp01((size * size) / (cur * cur + size * size)) * 0.55;
    best.x += (x - best.x) * w;
    best.z += (z - best.z) * w;
    best.y = groundAt(best.x, best.z) + 0.015;
    // Growth restarts from where it had got to rather than from `size0`, and it
    // takes time — a mark that jumps to its new size on the frame a droplet
    // lands in it is the "decal" pop this file already spends `spread` avoiding.
    // Wet again where it landed, but only partly: a mark does not un-dry. Done
    // before the growth window is set, or the window starts in that mark's past
    // and it holds at its old size until the clock catches up.
    best.age *= 1 - w * 0.5;
    best.size0 = cur;
    best.size1 = merged;
    best.spread0 = best.age;
    best.spread = best.age + (pool ? 2.4 : 0.4);
    best.depth = clamp01(best.depth + (pool ? 0.3 : 0.05 + size * 0.3));
    if (pool) best.pool = true;
    return best;
  }

  /**
   * How long a thrown mark stays on the ground. 90 s against the 26 it was: a
   * round is minutes long and the ground has to still be showing what happened
   * on it in the second minute. It is shorter than a pool's 210 on purpose —
   * spatter is thin and it dries; a pool is deep and it does not — and both end
   * at the round boundary rather than by running out, which is `clearBattle`'s
   * job and `goretest`'s first six claims.
   */
  const STAIN_LIFE = tier === "low" ? 45 : 90;

  function addDecal(x: number, z: number, size: number, life = STAIN_LIFE, age = 0): void {
    if (mergeStain(x, z, size, false)) return;
    const d = claimDecal(false);
    d.x = x; d.y = groundAt(x, z) + 0.015; d.z = z;
    d.size0 = size; d.size1 = size; d.spread0 = 0; d.spread = 0;
    d.life = life; d.age = age;
  }

  /**
   * Blood that has run out rather than been thrown. It arrives small and spreads,
   * because a pool is the one mark on the ground that is still happening after
   * the blow that made it — and because a full-sized stain popping into existence
   * under a corpse is the single most obvious way to say "decal".
   */
  function addPool(x: number, z: number, size: number, spread: number, life: number): Decal {
    // A body comes to rest where it has already been bleeding, so the spatter
    // under it is the same blood: the pool takes it over rather than being drawn
    // on top of eight flecks that then dry at their own separate rates.
    const joined = mergeStain(x, z, size, true);
    if (joined) {
      joined.life = Math.max(joined.life, life);
      joined.size1 = Math.max(joined.size1, size);
      joined.spread = joined.age + spread;
      return joined;
    }
    const d = claimDecal(true);
    d.x = x; d.y = groundAt(x, z) + 0.015; d.z = z;
    d.size0 = size * 0.22; d.size1 = size; d.spread0 = 0; d.spread = spread;
    d.life = life; d.age = 0;
    return d;
  }

  // ---- bodies -------------------------------------------------------------
  //
  // Blood tested the terrain height and nothing else, so a spray crossing a
  // warrior went straight through him and stained the grass behind. Blood on the
  // man who did the killing is the strongest single image this feature can throw
  // and it was not reachable at all.
  //
  // The warriors are found by scanning the scene for the groups `anim.ts` names
  // `warrior:<id>`, because that name is the only seam between this module and
  // the rigs: `FrameContext` carries `focus` and `localState` and nothing
  // per-warrior, so there is no way to be *told* where eight bodies are. That
  // makes this a read of somebody else's naming convention, which is a real
  // coupling and is why it degrades to the old ground-only behaviour rather than
  // throwing if the scan comes back empty.
  //
  // The capsule is an approximation and deliberately a coarse one. Its foot is
  // the group's origin and its head is the `spine` node — the belt-height joint
  // `anim.ts` inserts — carried up the spine's own Y, so the axis tilts as a
  // corpse folds over instead of standing upright above a body lying down. What
  // it cannot do is follow a limb: an arm flung out to the side is outside its
  // own capsule, and blood passes through it. A per-bone test is a different
  // feature and would want the rig handed over rather than scraped.

  interface Body {
    /** Player id, off the group name. The seam a burner is matched through. */
    id: string;
    group: THREE.Object3D;
    spine: THREE.Object3D | null;
    /** Capsule foot and head in world space, refreshed every frame. */
    ax: number; ay: number; az: number;
    bx: number; by: number; bz: number;
    radius: number;
  }

  const bodies: Body[] = [];
  /** Where the rigs hang, once one has been found. Saves a whole-scene walk. */
  let bodyHost: THREE.Object3D | null = null;
  let bodyScanAt = -1e3;
  /** Rescan interval. Warriors join, die and respawn; nothing tells us when. */
  const BODY_SCAN = 0.6;
  /** Trunk half-width. A warrior in mail is wider than a warrior in wool, but
   *  not by enough to be worth reading a bounding box for every frame. */
  const BODY_RADIUS = 0.28;
  /** How far past the belt joint the capsule runs, along the spine's own up. */
  const BODY_RISE = 0.62;

  function rescanBodies(): void {
    bodies.length = 0;
    const take = (o: THREE.Object3D) => {
      if (!o.name.startsWith("warrior:")) return false;
      let spine: THREE.Object3D | null = null;
      o.traverse((c) => { if (!spine && c.name === "spine") spine = c; });
      bodies.push({
        id: o.name.slice(8), group: o, spine,
        ax: 0, ay: 0, az: 0, bx: 0, by: 1, bz: 0,
        radius: BODY_RADIUS,
      });
      return true;
    };
    if (bodyHost && bodyHost.parent) {
      for (const c of bodyHost.children) take(c);
      if (bodies.length > 0) return;
    }
    bodyHost = null;
    scene.traverse((o) => { if (take(o) && !bodyHost) bodyHost = o.parent; });
  }

  /**
   * Pulls every capsule onto this frame's transforms. Called only when there is
   * something in the air that could hit one, so a fight with no blood in it pays
   * nothing for this at all.
   */
  function refreshBodies(): void {
    if (clock - bodyScanAt > BODY_SCAN) {
      bodyScanAt = clock;
      rescanBodies();
    }
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      if (!b.group.parent) { bodies.splice(i, 1); continue; }
      b.group.updateWorldMatrix(true, false);
      const g = b.group.matrixWorld.elements;
      b.ax = g[12]; b.ay = g[13]; b.az = g[14];
      const s = b.spine;
      if (s) {
        s.updateWorldMatrix(true, false);
        const e = s.matrixWorld.elements;
        const ul = 1 / (Math.hypot(e[4], e[5], e[6]) || 1);
        b.bx = e[12] + e[4] * ul * BODY_RISE;
        b.by = e[13] + e[5] * ul * BODY_RISE;
        b.bz = e[14] + e[6] * ul * BODY_RISE;
      } else {
        b.bx = b.ax; b.by = b.ay + 1.55; b.bz = b.az;
      }
    }
  }

  /** The capsule for one player, or null while the scan has not seen him yet. */
  function findBody(id: string): Body | null {
    for (const b of bodies) if (b.id === id) return b;
    return null;
  }

  /** Squared distance from a point to a capsule's axis, and where along it. */
  function axisDist2(b: Body, x: number, y: number, z: number): number {
    const dx = b.bx - b.ax;
    const dy = b.by - b.ay;
    const dz = b.bz - b.az;
    const len2 = dx * dx + dy * dy + dz * dz || 1e-6;
    let t = ((x - b.ax) * dx + (y - b.ay) * dy + (z - b.az) * dz) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = x - (b.ax + dx * t);
    const py = y - (b.ay + dy * t);
    const pz = z - (b.az + dz * t);
    return px * px + py * py + pz * pz;
  }

  // ---- blood on bodies ----------------------------------------------------
  //
  // A mark is stored in the frame of the node it landed on, not in world space,
  // so it rides the body: a warrior who turns away carries the blood round with
  // him and a corpse takes its own down with it. That is the same mechanism the
  // running jets use for stumps and it is here for the same reason — the
  // alternative hangs the stain in the air where the man was standing.

  interface BodyMark {
    anchor: THREE.Object3D | null;
    /**
     * The warrior group the anchor hangs under, and the thing that is actually
     * unparented when a rig is torn down (`anim.ts` removes the group, not the
     * spine). Testing the anchor's own parent looked right and never fired: the
     * spine keeps its parent for as long as the disposed rig keeps its shape.
     */
    owner: THREE.Object3D | null;
    /** Impact point and outward normal, both in the anchor's local frame. */
    lx: number; ly: number; lz: number;
    nx: number; ny: number; nz: number;
    size: number;
    rot: number;
    cell: number;
    depth: number;
    age: number; life: number;
  }

  const bodyMarks: BodyMark[] = [];
  for (let i = 0; i < bodyMarkCap; i++) {
    bodyMarks.push({
      anchor: null, owner: null, lx: 0, ly: 0, lz: 0, nx: 0, ny: 0, nz: 1,
      size: 0.1, rot: 0, cell: 0, depth: 0, age: 0, life: 0,
    });
  }
  const markMat = new THREE.Matrix4();
  const markVec = new THREE.Vector3();
  const markNrm = new THREE.Vector3();
  /**
   * Blood on a man outlives the spray that put it there, and is meant to.
   *
   * 120 s against 30. A man who cuts somebody down in the first ten seconds of a
   * round should still be wearing it when the round ends, and at thirty seconds
   * he was clean again before the second kill. Same argument as the pool, and
   * the same safety: `clearBattle` empties this pool at the round boundary, so
   * the length is bounded by the round rather than by a timer that has to be
   * shorter than one.
   */
  const MARK_LIFE = tier === "low" ? 60 : 120;

  function addBodyMark(
    anchor: THREE.Object3D,
    owner: THREE.Object3D,
    wx: number, wy: number, wz: number,
    nx: number, ny: number, nz: number,
    size: number,
  ): void {
    markMat.copy(anchor.matrixWorld).invert();
    markVec.set(wx, wy, wz).applyMatrix4(markMat);
    // The normal takes the same inverse without the translation, so it stays a
    // direction. Not normalised again: an anim rig does not scale its bones, and
    // if one ever does, a mark drifting a millimetre off the skin is the least
    // of what breaks.
    markNrm.set(nx, ny, nz).transformDirection(markMat);

    // Blood that lands on blood joins it, here as on the ground. Without it one
    // spray from a stump spends the whole pool on one shoulder.
    for (const m of bodyMarks) {
      if (m.life <= 0 || m.anchor !== anchor) continue;
      const gap = Math.hypot(m.lx - markVec.x, m.ly - markVec.y, m.lz - markVec.z);
      if (gap > (m.size + size) * 0.5) continue;
      const merged = Math.min(0.34, Math.sqrt(m.size * m.size + size * size));
      const w = clamp01((size * size) / (m.size * m.size + size * size)) * 0.5;
      m.lx += (markVec.x - m.lx) * w;
      m.ly += (markVec.y - m.ly) * w;
      m.lz += (markVec.z - m.lz) * w;
      m.nx += (markNrm.x - m.nx) * w;
      m.ny += (markNrm.y - m.ny) * w;
      m.nz += (markNrm.z - m.nz) * w;
      m.size = merged;
      m.depth = clamp01(m.depth + 0.16);
      m.age *= 1 - w;
      return;
    }

    // Free slot, else the mark furthest through its life. Never grows.
    let slot = bodyMarks[0];
    let worst = -1;
    for (const m of bodyMarks) {
      if (m.life <= 0) { slot = m; break; }
      const t = m.age / m.life;
      if (t > worst) { worst = t; slot = m; }
    }
    slot.anchor = anchor;
    slot.owner = owner;
    slot.lx = markVec.x; slot.ly = markVec.y; slot.lz = markVec.z;
    slot.nx = markNrm.x; slot.ny = markNrm.y; slot.nz = markNrm.z;
    slot.size = size;
    slot.rot = Math.random() * TAU;
    slot.cell = Math.floor(Math.random() * STAIN_POOL_FIRST);
    slot.depth = 0.2;
    slot.age = 0;
    slot.life = MARK_LIFE;
  }

  function writeBodyMarks(dt: number): void {
    bodyLayer.begin();
    for (const m of bodyMarks) {
      if (m.life <= 0) continue;
      m.age += dt;
      const a = m.anchor;
      // Losing its parent is how a mark ends without anyone telling us — the
      // same rule the jets use, and what makes a respawn clean the man.
      if (m.age >= m.life || !a || !m.owner?.parent) { m.life = 0; m.anchor = null; m.owner = null; continue; }
      a.updateWorldMatrix(true, false);
      markVec.set(m.lx, m.ly, m.lz).applyMatrix4(a.matrixWorld);
      markNrm.set(m.nx, m.ny, m.nz).transformDirection(a.matrixWorld);
      const t = m.age / m.life;
      const alpha = 0.95 * (1 - clamp01((t - 0.55) / 0.45));
      stainTint(t, false, m.depth);
      // Stood off the skin along the impact normal. The quad faces the camera,
      // so on a curved body its far corners would otherwise sink into the mesh
      // and the depth test would eat half the mark.
      bodyLayer.push(
        markVec.x + markNrm.x * 0.022,
        markVec.y + markNrm.y * 0.022,
        markVec.z + markNrm.z * 0.022,
        m.size, m.size, m.rot, alpha,
        tint[0], tint[1], tint[2], m.cell,
      );
    }
    bodyLayer.end();
  }

  // ---- ground rings -------------------------------------------------------
  const rings: Ring[] = [];

  function addRing(x: number, y: number, z: number, r1: number, color: THREE.Color, life = 0.55, frame = CELL.ring): void {
    if (rings.length >= 10) rings.shift();
    rings.push({ x, y: y + 0.02, z, age: 0, life, r0: 0.4, r1, color, frame });
  }

  // ---- impact flashes -----------------------------------------------------
  // Real light on the surroundings when steel meets steel. The pool is built up
  // front, never grows, and — the part that matters — never hides. Three drops a
  // light with `visible === false` out of the lights list, which changes the
  // light count, which recompiles every program in the scene: a hitch you can
  // see, triggered by the exact event that was supposed to feel snappy. An idle
  // flash therefore stays in the list at zero intensity, costing a few
  // instructions in a loop that was already running. That is also why there are
  // only two of them: every one is a permanent term in every lit surface's
  // shader, and the arena already carries the bonfire and its torches.
  const flashes: Flash[] = [];
  const flashCount = tier === "high" ? 2 : tier === "medium" ? 1 : 0;
  for (let i = 0; i < flashCount; i++) {
    const light = new THREE.PointLight(0xffd9a0, 0, 7, 2);
    root.add(light);
    flashes.push({ light, age: 0, life: 0, peak: 0 });
  }

  function addFlash(x: number, y: number, z: number, peak: number, hex: number, life = 0.13): void {
    let slot: Flash | null = null;
    for (const f of flashes) {
      if (f.life <= 0) { slot = f; break; }
      if (!slot || f.age / f.life > slot.age / slot.life) slot = f;
    }
    if (!slot) return;
    slot.light.position.set(x, y, z);
    slot.light.color.setHex(hex, THREE.SRGBColorSpace);
    slot.age = 0;
    slot.life = life;
    slot.peak = peak;
  }

  // ---- ribbons ------------------------------------------------------------
  const ribbonCount = settings.trails ? (tier === "high" ? 8 : 5) : 0;
  const ribbons: Ribbon[] = [];
  for (let i = 0; i < ribbonCount; i++) {
    ribbons.push({
      active: false, pts: new Float32Array(RIBBON_SAMPLES * 3), n: 0,
      hex: 0, color: new THREE.Color(), width: 0.1, idle: 0,
    });
  }

  const ribbonVerts = ribbonCount * (RIBBON_SEGMENTS + 1) * 2;
  const ribbonPos = new Float32Array(ribbonVerts * 3);
  const ribbonUv = new Float32Array(ribbonVerts * 2);
  const ribbonCol = new Float32Array(ribbonVerts * 3);
  const ribbonAlpha = new Float32Array(ribbonVerts);
  const ribbonIdx = new Uint16Array(ribbonCount * RIBBON_SEGMENTS * 6);
  const ribbonGeo = new THREE.BufferGeometry();
  let ribbonMesh: THREE.Mesh | null = null;
  let ribbonMat: THREE.ShaderMaterial | null = null;
  if (ribbonCount > 0) {
    const attr = (arr: Float32Array, size: number) => {
      const a = new THREE.BufferAttribute(arr, size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    ribbonGeo.setAttribute("position", attr(ribbonPos, 3));
    ribbonGeo.setAttribute("uv", attr(ribbonUv, 2));
    ribbonGeo.setAttribute("aCol", attr(ribbonCol, 3));
    ribbonGeo.setAttribute("aAlpha", attr(ribbonAlpha, 1));
    const idx = new THREE.BufferAttribute(ribbonIdx, 1);
    idx.setUsage(THREE.DynamicDrawUsage);
    ribbonGeo.setIndex(idx);
    ribbonGeo.setDrawRange(0, 0);

    ribbonMat = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: atlas },
        uCell: { value: new THREE.Vector2((CELL.streak % TILES) / TILES, Math.floor(CELL.streak / TILES) / TILES) },
        uScale: { value: 1 / TILES },
        uScroll: { value: 0 },
        ...fogUniforms(),
      },
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
      side: THREE.DoubleSide,
    });
    ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    ribbonMesh.frustumCulled = false;
    ribbonMesh.renderOrder = 5;
    root.add(ribbonMesh);
  }

  function pushTrailSample(x: number, y: number, z: number, hex: number): void {
    let best: Ribbon | null = null;
    let bestD = 2.4;
    for (const r of ribbons) {
      if (!r.active || r.n === 0 || r.hex !== hex || r.idle > 0.15) continue;
      const j = (r.n - 1) * 3;
      const d = Math.hypot(x - r.pts[j], y - r.pts[j + 1], z - r.pts[j + 2]);
      if (d < bestD) { bestD = d; best = r; }
    }
    if (!best) {
      // Take a free ribbon, else the one that has been idle longest — a fresh
      // swing matters more than the tail of a finished one.
      for (const r of ribbons) if (!r.active) { best = r; break; }
      if (!best) {
        for (const r of ribbons) if (!best || r.idle > best.idle) best = r;
      }
      if (!best) return;
      best.active = true;
      best.n = 0;
      best.hex = hex;
      best.color.setHex(hex, THREE.SRGBColorSpace).multiplyScalar(hex === 0x66c8ff ? 3.0 : 2.4);
      best.width = hex === 0x66c8ff ? 0.24 : 0.19;
    }
    if (best.n === RIBBON_SAMPLES) {
      best.pts.copyWithin(0, 3);
      best.n--;
    }
    const j = best.n * 3;
    best.pts[j] = x; best.pts[j + 1] = y; best.pts[j + 2] = z;
    best.n++;
    best.idle = 0;
  }

  // ---- motes --------------------------------------------------------------
  // Airborne ash and pollen, kept in a box that follows the camera so the air
  // is never empty and never migrates off to the edge of the map. Additive and
  // dim: at dusk these read as specks catching firelight, which is what the
  // grey bokeh circles in the v1 captures were trying and failing to be.
  const motePos = new Float32Array(moteCount * 3);
  const moteSeed = new Float32Array(moteCount);
  const moteSize = new Float32Array(moteCount);
  const MOTE_BOX = 26;
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = sym(MOTE_BOX * 0.5);
    motePos[i * 3 + 1] = rand(0.1, 7);
    motePos[i * 3 + 2] = sym(MOTE_BOX * 0.5);
    moteSeed[i] = Math.random() * 100;
    moteSize[i] = rand(0.022, 0.075);
  }

  // ---- fires --------------------------------------------------------------
  const fires: Fire[] = [];
  let nextFireId = 1;
  let firesDirty = true;

  function addFire(spec: FireSpec): number {
    const id = nextFireId++;
    fires.push({ id, spec, emberAcc: 0, smokeAcc: 0, jitter: null });
    firesDirty = true;
    return id;
  }

  function removeFire(id: number): void {
    const i = fires.findIndex((f) => f.id === id);
    if (i >= 0) { fires.splice(i, 1); firesDirty = true; }
  }

  // ---- burning warriors ---------------------------------------------------

  /** How long an unmentioned burner keeps burning. Three snapshots at 20 Hz. */
  const BURN_STALE = 0.15;
  /** Seconds of smoke after the flames go out. See `Burner.tail`. */
  const BURN_TAIL = 1.15;
  /**
   * Reference tongue count for the width correction, the way the bonfire has
   * one: nine narrow tongues and three fat ones have to cover the same man, or
   * the low tier's flame sums to more radiance than the high tier's.
   */
  const BURN_REFERENCE = 5;
  /**
   * Per-instance radiance, and the same load-bearing number `RING_LEVEL` is for
   * the bonfire. Seven tongues on a 0.25 m ring means about two cover any given
   * pixel, so this is chosen so that pair sums near 3.2 — hot and saturated and
   * under the 4.07 clip, so a burning man is deep orange rather than a white
   * blob with a warrior-shaped hole in it. Engulfed pushes it to ~3.8, which is
   * a nucleus at the clip point, and is meant to be.
   */
  // Measured against a real frame this was low, and low in a way the arithmetic
  // above could not see: the pair-overlap it is derived from assumes both
  // tongues of the pair are drawn, and on a man half of them are behind him. So
  // the sum that actually reaches a pixel on his lit side was nearer 1.6 than
  // 3.2, and at 1.6 against a 4.07 clip a flame is a tint on the grass rather
  // than a fire. 0.52 with ten tongues restores the pair sum on the side the
  // camera is on and leaves the engulfed nucleus where it was meant to be. It is
  // 0.52 rather than the 0.60 the first correction reached, because moving the
  // ring out onto the body's surface roughly doubled how many tongues survive
  // the depth test: the radiance that was missing was never all of it missing,
  // half of it was being drawn inside a hauberk.
  const BURN_LEVEL = 0.52;
  /**
   * Cooler than the bonfire. Wool, fat and hair burn a long way below a metre of
   * oak, and the temperature term is what keeps a man's flames orange while the
   * fire he ran out of stays gold — which at fight distance is most of what
   * tells the two apart.
   */
  const BURN_TEMP = 0.7;
  /** Cycles per second. Faster than a log fire: less fuel, more air. */
  const BURN_RATE = 1.9;

  const burners: Burner[] = [];
  for (let i = 0; i < BURN_SLOTS; i++) {
    burners.push({
      id: "", active: false, alight: false, flame: 0, inside: 0, insideTarget: 0, tail: 0,
      ax: 0, ay: 0, az: 0, bx: 0, by: 1.4, bz: 0, placed: false,
      emberAcc: 0, smokeAcc: 0, seed: 0, seenAt: -1e3, want: 0, score: 0,
    });
  }
  let burnersLive = 0;
  /** Tongues the last repack spent on burners, so the layer can settle at zero. */
  let burnerTongues = 0;

  // Real light off a burning man, on the same terms as the impact flashes: built
  // up front, never added, never removed, never hidden — a light that leaves the
  // list recompiles every program in the scene, and it would do it on the exact
  // frame somebody caught fire. Two on high, one on medium, none on low, because
  // each one is a permanent term in every lit surface's shader and the arena is
  // already carrying the bonfire and up to five torches.
  //
  // Eight men can be alight and one or two can have a light. The rest are lit by
  // their own halo quad, which costs nothing and is what carries the read on the
  // tier that has no light at all.
  const burnLights: THREE.PointLight[] = [];
  const burnLightCount = tier === "high" ? 2 : tier === "medium" ? 1 : 0;
  for (let i = 0; i < burnLightCount; i++) {
    const light = new THREE.PointLight(0xff7a2a, 0, 5.5, 2);
    root.add(light);
    burnLights.push(light);
  }
  /** Who each light is currently on. Handovers go through dark — see `stepBurners`. */
  const burnLightOwner: Array<Burner | null> = burnLights.map(() => null);
  const burnLightPick: Array<Burner | null> = burnLights.map(() => null);

  function setBurning(id: string, burning: boolean, timer: number, inside: boolean): void {
    let b: Burner | null = null;
    let free: Burner | null = null;
    for (const c of burners) {
      if (c.active && c.id === id) { b = c; break; }
      if (!c.active && !free) free = c;
    }
    if (!b) {
      // Nothing to start and nothing to end. This is the call for every man in
      // the room on every frame of every match, so it has to cost a scan of
      // eight slots and then nothing at all.
      if (!burning) return;
      if (!free) return;
      b = free;
      b.active = true;
      b.id = id;
      b.flame = 0; b.inside = 0; b.insideTarget = 0; b.tail = BURN_TAIL;
      b.emberAcc = 0; b.smokeAcc = 0; b.placed = false; b.want = 0; b.score = 0;
      b.seed = Math.random() * 100;
      burnersLive++;
      firesDirty = true;
    }
    b.seenAt = clock;
    b.alight = burning;
    b.insideTarget = burning && inside ? 1 : 0;
    // Curved, not linear: a man who has just run clear is still properly alight
    // and only loses his flames over the last second of the three. A linear fade
    // spends the whole linger looking like it is going out.
    if (burning) b.flame = Math.pow(clamp01(timer / FIRE.linger), 0.55);
  }

  /**
   * Where the fires are. world.ts marks them with `userData.vfxFire` — that is
   * the seam, and it is used now — but the module also predates the seam and
   * kept a fallback that treats any warm point light as something burning.
   *
   * **The fallback was firing on top of the seam, and every fire in the arena
   * was being drawn twice.** world.ts puts a `PointLight` inside the bonfire and
   * inside each lit torch cup; the marker and the light are different objects,
   * so one traversal produced both. That is twenty-eight additive tongues on a
   * shader authored for fourteen, superimposed within a few centimetres, and it
   * is most of why the core welded to white — the ramp was never asked to carry
   * that sum. It also doubled the ember and smoke emission rates and the halo.
   *
   * A fire's own light is not a second fire. A warm light that no marker claims
   * still gets one, because that is what the fallback is for: a world.ts that
   * lights a brazier and forgets to mark it should still burn.
   */
  function discoverFires(): void {
    scene.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    const marked: FireSpec[] = [];
    const warmLights: THREE.Vector3[] = [];
    scene.traverse((o) => {
      const explicit = (o.userData as { vfxFire?: Omit<FireSpec, "position"> }).vfxFire;
      if (explicit) {
        p.setFromMatrixPosition(o.matrixWorld);
        marked.push({ position: { x: p.x, y: p.y, z: p.z }, ...explicit });
        return;
      }
      const light = o as THREE.PointLight;
      if (!light.isPointLight || light.intensity <= 0) return;
      // Warm only: a rune glow or a cold fill is not a fire.
      if (light.color.r <= light.color.b * 1.4) return;
      p.setFromMatrixPosition(o.matrixWorld);
      warmLights.push(p.clone());
    });

    for (const spec of marked) addFire(spec);

    for (const q of warmLights) {
      // Claimed by a marker if it is inside that fire's own footprint. The
      // vertical slack is generous because a bonfire's light hangs well above
      // its fuel — that is what makes it light the faces round it.
      const claimed = marked.some((spec) => (
        Math.hypot(q.x - spec.position.x, q.z - spec.position.z) < Math.max(1.2, spec.radius * 3) &&
        Math.abs(q.y - spec.position.y) < 2.6
      ));
      if (claimed) continue;
      const ground = groundAt(q.x, q.z);
      // A light more than two and a half metres above the ground under it is on
      // a pole; anything else is a fire on the ground.
      if (q.y - ground > 2.5) {
        addFire({ position: { x: q.x, y: q.y - 0.24, z: q.z }, radius: 0.1, height: 0.5, kind: "torch" });
      } else {
        addFire({ position: { x: q.x, y: ground + 0.16, z: q.z }, radius: 0.58, height: 1.75, kind: "bonfire" });
      }
    }
  }
  if (opts.autoFires !== false) discoverFires();

  // The lower tiers thin the fire out, they do not shrink it: fewer tongues,
  // each proportionally wider, so a low-end bonfire is still one mass of flame
  // rather than six separate candles.
  const TONGUES = {
    bonfire: tier === "high" ? 16 : tier === "medium" ? 12 : 9,
    torch: tier === "high" ? 4 : tier === "medium" ? 3 : 2,
  };
  const TONGUE_REFERENCE = { bonfire: 14, torch: 4 };
  /** Tongue cycles per second. A real lick lives well under a second. */
  const FLAME_RATE = { bonfire: 1.05, torch: 2.3 };
  /**
   * Per-instance radiance by ring, and the single most load-bearing number in
   * the fire.
   *
   * The rings are not equally crowded. Ring 0 puts a third of the tongues inside
   * a 0.35 m circle and each of them is half a metre wide, so at any instant
   * three of them cover the same pixel and the framebuffer adds all three. Ring 2
   * is a lone tongue at the rim. Giving them the same radiance — which is what
   * `heat * (1 - ring * 0.1)` did, and it went the *wrong way*, brightest at the
   * middle — means the core is three times whatever a tongue is worth, and three
   * times anything that reads as fire is white.
   *
   * These are chosen so that ring 0's *sum* lands near 3.5 scene units: hot,
   * saturated, and under the 4.07 clip. Four-way coincidence still tips over,
   * which is the nucleus, and it is meant to.
   */
  const RING_LEVEL = [0.5, 0.78, 1.0];

  function rebuildFires(): void {
    fireLayer.begin();
    hazeLayer?.begin();
    for (let f = 0; f < fires.length; f++) {
      const { position: pos, radius, height, kind } = fires[f].spec;
      const n = TONGUES[kind];
      const fill = Math.sqrt(TONGUE_REFERENCE[kind] / n);
      // Temperature, not brightness, and they are now two separate numbers. A
      // torch is a rag of fat on a stick: much cooler than a log fire and much
      // dimmer, and only the second of those used to be expressible.
      const temp = kind === "bonfire" ? 1 : 0.6;
      const level = kind === "bonfire" ? 1 : 0.72;
      // Only a bonfire is crowded enough for the ring falloff to be a fix rather
      // than a tax. Four torch tongues in a 10 cm cup barely stack, and taking
      // half the radiance off two of them puts the flame under the palisade
      // behind it.
      const crowded = kind === "bonfire";
      let jitter = fires[f].jitter;
      if (!jitter || jitter.length < n * 2) {
        jitter = fires[f].jitter = new Float32Array(n * 2);
        for (let k = 0; k < n * 2; k++) jitter[k] = rand(0.85, 1.15);
      }
      for (let i = 0; i < n; i++) {
        // Nested rings of tongues: the outer ones are shorter, wider and out of
        // phase, so the fire has a core rather than being one silhouette.
        const t = i / n;
        const ring = i % 3;
        const a = t * TAU * 2.6 + ring;
        const spread = radius * (0.28 + ring * 0.44);
        fireLayer.push(
          pos.x + Math.cos(a) * spread,
          pos.y,
          pos.z + Math.sin(a) * spread,
          radius * (0.92 - ring * 0.2) * fill,
          height * (1 - ring * 0.22) * jitter[i * 2],
          (i * 0.618) % 1,
          i * 1.37 + f * 5.1,
          temp * (1 - ring * 0.08),
          FLAME_RATE[kind] * jitter[i * 2 + 1],
          // Narrower tongues cover less, so the ring weight is corrected by the
          // same fill factor the width uses — otherwise a low tier's nine fat
          // tongues sum to more than a high tier's sixteen thin ones.
          level * (crowded ? RING_LEVEL[ring] : 1) / fill,
        );
      }
      if (hazeLayer && kind === "bonfire") {
        for (let i = 0; i < 3; i++) {
          hazeLayer.push(pos.x, pos.y + height * 0.7, pos.z, radius * 3.2, height * 2.2, i / 3, i * 3.1 + f, 1, 0.18, 1);
        }
      }
    }

    // Warriors alight, in the same pass and the same layer — a burning man is
    // not a second fire system, he is a fire whose origin moved since last
    // frame. No haze: it is a high-tier sheet of warm air and on a running man
    // it reads as a smeared frame rather than as heat.
    burnerTongues = 0;
    const fill = Math.sqrt(BURN_REFERENCE / BURN_TONGUES);
    for (const b of burners) {
      if (!b.active || !b.placed || b.flame <= 0.02) continue;
      const dx = b.bx - b.ax;
      const dy = b.by - b.ay;
      const dz = b.bz - b.az;
      // The axis is the man, so a corpse folded over the turf burns along
      // himself instead of standing a column of flame up out of the grass.
      const span = Math.hypot(dx, dy, dz) || 1.4;
      const reach = 0.86 + b.inside * 0.26;
      // WHERE THE FLAMES START, and this is the fault the first photograph of
      // this feature found. The capsule's `a` end is the rig group's own origin,
      // which is the man's FEET on the turf — so a run from 0 up put the lowest
      // tongue at ankle height with a 0.4 m flame on it, and a 0.4 m flame at
      // ankle height standing on grass is a campfire. It read as a man beside a
      // fire rather than a man on fire, which is exactly the thing this whole
      // feature exists instead of. Cloth and hair catch at the hem and the flame
      // goes UP; nothing burns below the boot. So the run starts a quarter of the
      // way up the body and spends the rest of its length on the trunk, the arms
      // and the head, where a man is actually alight.
      const FOOT = 0.24;
      for (let i = 0; i < BURN_TONGUES; i++) {
        // Up the body, not round his feet — and past the crown once he is
        // engulfed. That is the whole difference between a man standing in a
        // fire and a man who *is* one.
        const t = FOOT + ((i + 0.5) / BURN_TONGUES) * (reach - FOOT * 0.5);
        // The ring turns, slowly, so the flames crawl over him. Fixed offsets
        // give a cage of licks bolted to the rig, which is the same failure as
        // the tint this feature exists instead of.
        const a = i * 2.399 + clock * 0.6 + b.seed;
        // ON the man, not inside him. This ran 0.05→0.25 m off the axis against
        // a body capsule of 0.28 m, so every tongue was launched from within the
        // torso: the only flame that reached the frame was whatever stuck out
        // past his silhouette, which in `burnman.png` was a column up his shield
        // arm and nothing at all across his chest. A man with a fire inside him
        // reads as a man standing in front of one. 0.26→0.40 puts the tongues on
        // the surface and a little proud of it, so the ones on the camera's side
        // are in front of the mail rather than behind it, and the golden-angle
        // spacing then keeps four or five of ten there at any phase of the turn.
        const off = 0.26 + 0.14 * Math.sin(Math.PI * Math.min(1, t + 0.12));
        const wob = ((i * 0.37 + b.seed) % 1) * 0.3 + 0.85;
        fireLayer.push(
          b.ax + dx * t + Math.cos(a) * off,
          b.ay + dy * t,
          b.az + dz * t + Math.sin(a) * off,
          // Wider and taller than they were. A tongue narrower than the body it
          // is coming off draws a candle standing beside a man; it has to be
          // wide enough that the licks meet across his chest, which at 0.36 m
          // they do on every stature in the roster.
          0.36 * fill * (0.7 + b.flame * 0.5),
          span * 0.50 * (0.72 + b.inside * 0.5) * fill * (0.55 + b.flame * 0.55) * wob,
          (i * 0.618 + b.seed) % 1,
          i * 1.37 + b.seed,
          BURN_TEMP,
          BURN_RATE * wob,
          BURN_LEVEL * b.flame * (0.8 + b.inside * 0.4) / fill,
        );
        burnerTongues++;
      }
    }

    fireLayer.end();
    hazeLayer?.end();
    firesDirty = false;
  }

  /**
   * Everything about a burning man that is not his flame: where he is, how hard
   * he is burning, what he throws off, and which one or two of eight get a real
   * light. Runs on the capsules `refreshBodies` has already pulled onto this
   * frame's transforms, so the fire is on the pose the frame will draw.
   */
  function stepBurners(dt: number, focus: THREE.Vector3): void {
    // Eight men alight share one man's worth of embers and smoke. The particle
    // budget is a fight's, and a burning man is not allowed to spend a brawl's
    // worth of it — but he is not allowed to disappear at eight either, so the
    // share falls off well short of linearly.
    const crowd = 1 / Math.max(1, burnersLive * 0.55);
    for (const b of burners) {
      if (!b.active) continue;

      // A caller that has gone quiet is a man who left the room, died out of the
      // snapshot, or a match that ended. He goes out; he does not burn forever
      // on a rig that is no longer in the scene.
      if (clock - b.seenAt > BURN_STALE) b.alight = false;

      if (b.alight) {
        // The anchor only tracks the rig while the server still says he is
        // alight, which is what makes the smoke stay where the burn ended. A
        // respawn is a teleport — the same man, the same rig, six metres away
        // and no longer on fire — and a tail that followed him would put a
        // pillar of smoke over a warrior who has just been handed a clean body.
        const body = findBody(b.id);
        if (body) {
          b.ax = body.ax; b.ay = body.ay; b.az = body.az;
          // Chest, not the crown: every tongue grows upward from where it is
          // put, so anchoring the column at the top of the capsule stands the
          // whole fire above his head.
          b.bx = body.ax + (body.bx - body.ax) * 0.92;
          b.by = body.ay + (body.by - body.ay) * 0.92;
          b.bz = body.az + (body.bz - body.az) * 0.92;
          b.placed = true;
        }
        b.tail = BURN_TAIL;
      } else {
        // Flames out over a third of a second rather than on the packet that
        // says so. The server's `burning` is a step function and a step in the
        // one thing carrying the state reads as a bug.
        b.flame = Math.max(0, b.flame - dt * 3);
        b.tail -= dt;
        if (b.tail <= 0 && b.flame <= 0) {
          b.active = false;
          b.id = "";
          b.placed = false;
          b.want = 0;
          burnersLive--;
          continue;
        }
      }
      b.inside += (b.insideTarget - b.inside) * Math.min(1, dt * 6);

      if (!b.placed) { b.want = 0; b.score = 0; continue; }
      const cx = b.ax + (b.bx - b.ax) * 0.62;
      const cy = b.ay + (b.by - b.ay) * 0.62;
      const cz = b.az + (b.bz - b.az) * 0.62;

      b.emberAcc += 11 * b.flame * (0.6 + b.inside * 0.7) * settings.particleScale * crowd * dt;
      // Smoke climbs as the flame drops and keeps running through the tail, so
      // the state has a visible ending rather than a cut. It is thrown from a
      // man who is moving, so the column lays itself out behind him — that trail
      // is the tail, and it costs nothing beyond the puffs already being spent.
      const smoking = Math.max(b.flame, b.tail / BURN_TAIL);
      b.smokeAcc += (1.6 + 3.4 * (1 - b.flame)) * smoking * settings.particleScale * crowd * dt;
      while (b.emberAcc >= 1) {
        b.emberAcc -= 1;
        emberAt(cx, cy, cz, 0.24, 0.8);
      }
      while (b.smokeAcc >= 1) {
        b.smokeAcc -= 1;
        smokeAt(cx, cy + 0.3, cz, 0.2, 0.42);
      }

      b.want = b.flame * (0.55 + b.inside * 0.45);
      // Distance to what the frame is looking at, so the light lands on the man
      // whose light would be missed. A burner across the arena is four pixels
      // of flame and lights nothing anybody can see.
      const fx = cx - focus.x;
      const fz = cz - focus.z;
      b.score = b.want / (1 + (fx * fx + fz * fz) * 0.05);
    }

    // Outside the loop above and never short-circuited on an empty pool: a light
    // whose man has gone out has to be walked down to zero, and the frame that
    // happens on is precisely the frame there are no burners left to iterate.
    for (let s = 0; s < burnLights.length; s++) {
      let best: Burner | null = null;
      for (const b of burners) {
        if (!b.active || !b.placed || b.score <= 0.01) continue;
        let taken = false;
        for (let t = 0; t < s; t++) if (burnLightPick[t] === b) { taken = true; break; }
        if (taken || (best && b.score <= best.score)) continue;
        best = b;
      }
      burnLightPick[s] = best;

      const light = burnLights[s];
      const owner = burnLightOwner[s];
      if (owner !== best) {
        // Hand a light over dark. Teleporting it between two burning men lights
        // the ground between them for a frame, and with two lights and eight
        // burners the pick can legitimately change every second or so.
        light.intensity += (0 - light.intensity) * Math.min(1, dt * 9);
        if (light.intensity < 0.06) burnLightOwner[s] = best;
        continue;
      }
      if (!owner) { light.intensity = 0; continue; }
      light.position.set(
        owner.ax + (owner.bx - owner.ax) * 0.6,
        owner.ay + (owner.by - owner.ay) * 0.6,
        owner.az + (owner.bz - owner.az) * 0.6,
      );
      // Two beats, neither of them the flame's, so the light breathes instead of
      // buzzing at whatever the tongue rate happens to be.
      const flick = 0.72 + 0.28 * Math.sin(clock * 13.0 + owner.seed) * Math.sin(clock * 5.1 + owner.seed * 2.0);
      const want = 3.4 * owner.want * flick;
      light.intensity += (want - light.intensity) * Math.min(1, dt * 12);
    }
  }

  // ---- state --------------------------------------------------------------
  let clock = 0;
  let moodHeat = 0;
  let moodTarget = 0;
  /** Slowly turning breeze. Smoke, embers, motes and flame tips all read it. */
  const wind = new THREE.Vector2(0.32, 0.14);
  const auraSites: Array<{ x: number; z: number; t: number; hex: number }> = [];

  /**
   * Live population target for the ambient ground dust, and the rate that holds
   * it there against a ~4.8 s mean life. Scaled off `moteCount` rather than off
   * `particleBudget` because it is weather, not combat, and the tiers already
   * express how much weather they can afford in that number.
   */
  const DUST_POPULATION = Math.max(6, Math.round(moteCount * 0.11));
  const DUST_RATE = DUST_POPULATION / 4.8;
  let dustAcc = 0;
  let bootAcc = 0;
  /** Set once the ambient dust has been seeded around the real camera. */
  let dustSeeded = false;
  /** Set once the last stand's ground has been given its history. */
  let groundMarked = false;
  /** Previous frame's focus, for deriving the local warrior's own speed. */
  const lastFocus = new THREE.Vector3();
  let haveFocus = false;

  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  /** Scratch for `stainTint`, which runs once per mark per frame. */
  const tint = [0, 0, 0];

  // ---- effect recipes -----------------------------------------------------

  function sparks(x: number, y: number, z: number, count: number, spread: number, up: number): void {
    for (let i = 0; i < count; i++) {
      const speed = rand(4.5, 13) * spread;
      const dx = sym(1);
      const dy = rand(0.12, 1);
      const dz = sym(1);
      const inv = speed / (Math.hypot(dx, dy, dz) || 1);
      spawn({
        x, y, z,
        vx: dx * inv, vy: dy * inv * up, vz: dz * inv,
        life: rand(0.3, 0.72),
        size0: rand(0.035, 0.08), size1: rand(0.01, 0.025),
        aspect: 5,
        c0: PALETTE.sparkHot, c1: PALETTE.sparkCool,
        alpha: 1, fadeIn: 0.02, fadePow: 1.1,
        drag: 2.4, grav: 16, frame: CELL.spark,
        // Bouncing is what makes a spark read as a hot solid rather than a dot
        // of light: it hits the turf, skips, and skitters out.
        flags: F_ALIGN | F_BOUNCE | F_TWINKLE,
      });
    }
  }

  // ---- blood ---------------------------------------------------------------
  //
  // One gravity for every droplet, because it is gravity. What sorts blood in
  // the air is *drag*: a fat gout carries its momentum and draws a clean
  // parabola, and the fine stuff loses its throw inside a metre and drifts. A
  // spray authored as one size is the confetti failure two panels have already
  // named — not because it ignores gravity, which the code it replaces did not,
  // but because a population that all decelerates identically has no depth in it.
  //
  // 18.5 rather than 9.81. The arena reads at roughly half real scale through a
  // 55° lens, so a droplet thrown at a believable 6 m/s has to fall about twice
  // as fast to land where the eye expects. Every other ballistic thing in this
  // file is scaled the same way (sparks 16, mail 18) and blood matching them
  // matters more than blood matching Earth.
  const BLOOD_G = 18.5;

  /**
   * Steepest a droplet may leave a wound, as the sine of the angle — 0.66 is
   * 41° above horizontal. See the note at the fold in `spurt`: this is the one
   * number that separates "throws hard" from "hangs about", and `goretest`'s
   * "AND IT ARRIVES" claim is what holds it honest. 46° was tried first and
   * measured 0.78 s of flight against a 0.75 s ceiling; airtime goes as sinθ,
   * so five degrees off the top is eight per cent off the clock.
   */
  const RISE_CEIL = 0.66;

  /**
   * Droplets leaving a wound along an axis. This is the only thing in the file
   * that throws blood — the burst, the running jet and the non-fatal hit are all
   * this function with different numbers, so there is one answer to what blood
   * looks like rather than three that drift.
   *
   * `ivx/ivy/ivz` is the velocity of whatever the wound is attached to. A head
   * spinning away from a neck throws its blood along its own arc, and the same
   * term is what keeps the spray from a falling corpse under the corpse.
   */
  function spurt(
    x: number, y: number, z: number,
    dx: number, dy: number, dz: number,
    count: number, speed: number, cone: number, scale: number,
    tint: THREE.Color,
    ivx = 0, ivy = 0, ivz = 0,
  ): void {
    // Any vector not parallel to the axis gives a basis; picking off the axis's
    // own smallest component keeps it conditioned when a stump points straight up.
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const az = Math.abs(dz);
    const hx = ax <= ay && ax <= az ? 1 : 0;
    const hy = hx === 0 && ay <= az ? 1 : 0;
    const hz = hx === 0 && hy === 0 ? 1 : 0;
    let ux = hy * dz - hz * dy;
    let uy = hz * dx - hx * dz;
    let uz = hx * dy - hy * dx;
    const ul = 1 / (Math.hypot(ux, uy, uz) || 1);
    ux *= ul; uy *= ul; uz *= ul;
    const vx = dy * uz - dz * uy;
    const vy = dz * ux - dx * uz;
    const vz = dx * uy - dy * ux;

    for (let i = 0; i < count; i++) {
      // One in five is a gout and one in four of the rest is atomised. The mix is
      // fixed by index rather than sampled so that a four-particle spray on the
      // low tier still gets one of each rather than four of whatever came up.
      const gout = i % 5 === 0;
      const fine = !gout && i % 4 === 3;
      // Square-rooted so the cone fills by area: sampling the angle flat piles
      // the whole spray up the middle and leaves the edge empty.
      const ang = cone * Math.sqrt(Math.random());
      const phi = Math.random() * TAU;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      const ex0 = dx * ca + (ux * cp + vx * sp) * sa;
      let ey = dy * ca + (uy * cp + vy * sp) * sa;
      const ez0 = dz * ca + (uz * cp + vz * sp) * sa;
      // THE ELEVATION CEILING, and it is what lets the throw be fast.
      //
      // Range goes as v² and airtime as v·sinθ, so the whole cost of a hard
      // spray is paid by the droplets that leave STEEPLY: at 8.6 m/s the ones
      // going up at 74° — which a 34° cone around a 40° axis reaches — are still
      // in the air at 0.92 s, long after the blow that threw them. Folding the
      // top of the cone down to 46° keeps every bit of the azimuthal spread and
      // costs nothing anybody can see, because blood leaving a wound goes OUT.
      // Without it the only way to hold the arrival time is to throw softly,
      // which is the puff this pass exists to get rid of.
      let ex = ex0;
      let ez = ez0;
      if (ey > RISE_CEIL) {
        const want = Math.sqrt(1 - RISE_CEIL * RISE_CEIL);
        // WHICH WAY the folded droplet goes, and the first cut of this got it
        // wrong in a way only the landing pattern could show. Scaling the
        // droplet's OWN horizontal up to `want` sends a droplet whose azimuth
        // was sideways further sideways — so the clamp turned rise into WIDTH,
        // the across-axis spread went from 0.94 m to 1.42 m and the stripe the
        // spray is supposed to lay down collapsed from 3.0x to 1.7x. Blood that
        // would have gone up goes DOWNRANGE instead, so the fold blends the
        // droplet's bearing toward the axis's own in proportion to how far it
        // had to come down: a droplet just over the ceiling keeps its bearing,
        // and one aimed at the sky comes back along the axis.
        const excess = clamp01((ey - RISE_CEIL) / (1 - RISE_CEIL));
        const fh = Math.hypot(dx, dz);
        const h = Math.hypot(ex0, ez0);
        let hx = h > 1e-4 ? ex0 / h : 0;
        let hz = h > 1e-4 ? ez0 / h : 0;
        if (fh > 1e-4) {
          const fx = dx / fh;
          const fz = dz / fh;
          if (h <= 1e-4) { hx = fx; hz = fz; }
          hx += (fx - hx) * excess;
          hz += (fz - hz) * excess;
        } else if (h <= 1e-4) {
          // Straight up out of a wound that also faces straight up: no bearing
          // exists anywhere in the problem, so take one at random rather than
          // divide by zero.
          const a = Math.random() * TAU;
          hx = Math.cos(a); hz = Math.sin(a);
        }
        const nl = Math.hypot(hx, hz) || 1;
        ex = (hx / nl) * want;
        ez = (hz / nl) * want;
        ey = RISE_CEIL;
      }
      const v = speed * rand(0.4, 1.15) * (gout ? 0.8 : fine ? 1.25 : 1);
      spawn({
        x: x + ex * 0.05, y: y + ey * 0.05, z: z + ez * 0.05,
        vx: ex * v + ivx, vy: ey * v + ivy, vz: ez * v + ivz,
        // Sized against the body it came out of, not against legibility. The
        // first capture threw quarter-metre gouts — at that size a droplet is
        // as long as a forearm, it reads as a card rather than as liquid, and
        // no amount of arc rescues it. A gout is now a closed fist at most.
        life: gout ? rand(0.55, 1.05) : fine ? rand(0.25, 0.5) : rand(0.4, 0.8),
        size0: scale * (gout ? rand(0.8, 1.3) : fine ? rand(0.2, 0.36) : rand(0.45, 0.72)),
        // Blood in air stretches, it does not shrink. Holding the size and
        // letting F_ALIGN do the elongating is what keeps a droplet a droplet
        // right up to the frame it lands and stains.
        size1: scale * (gout ? rand(0.7, 1.1) : fine ? rand(0.17, 0.28) : rand(0.38, 0.6)),
        aspect: gout ? 2.6 : 2.1,
        c0: tint, c1: PALETTE.bloodDark,
        // Barely fades: a droplet's story ends when it hits the ground and
        // stains, not by dissolving on the way down.
        alpha: 0.96, fadeIn: 0.01, fadePow: gout ? 0.35 : 0.7,
        drag: gout ? 0.22 : fine ? 2.6 : 0.62,
        grav: BLOOD_G,
        frame: CELL.drop,
        flags: F_ALIGN | F_STAIN | F_ALPHA,
      });
    }
  }

  /** The haze a wound opening puts in the air. Dropped whole on the low tier. */
  function bloodMist(x: number, y: number, z: number, count: number, scale: number): void {
    if (tier === "low") return;
    for (let i = 0; i < count; i++) {
      spawn({
        x, y, z,
        vx: sym(1.4), vy: rand(0.2, 1.5), vz: sym(1.4),
        life: rand(0.35, 0.7),
        size0: rand(0.1, 0.2) * scale, size1: rand(0.24, 0.42) * scale,
        c0: PALETTE.mist, c1: PALETTE.bloodDark,
        alpha: 0.34, fadeIn: 0.08, fadePow: 1.6,
        drag: 3.2, grav: 2.5, frame: CELL.soft,
        flags: F_ALPHA | F_WIND,
      });
    }
  }

  /** Zones with a big vessel in them. The rest of the body is not a fountain. */
  function arterial(zone: HitZone | undefined): boolean {
    return zone === "head" || zone === "neck" || zone === "waist";
  }

  // ---- blood on the lens ---------------------------------------------------
  //
  // See `VfxOptions.onLensBlood` for why this is triggered at the wound rather
  // than by a droplet arriving. The camera is cached off the last frame's
  // `FrameContext`, because a wound is opened from the packet loop and not from
  // `update` — one frame of lag on a mark that lives seven seconds.

  /** Past this the wound is somebody else's business. Metres. */
  const LENS_RANGE = 5.0;
  /** How squarely the spray has to be pointed at the lens. cos of ~76°. */
  const LENS_FACING = 0.24;
  let lastCamera: THREE.Camera | null = null;

  function lensBlood(
    x: number, y: number, z: number,
    dx: number, dy: number, dz: number,
    power: number,
  ): void {
    const hit = opts.onLensBlood;
    if (!hit || !lastCamera) return;
    const ox = camPos.x - x;
    const oy = camPos.y - y;
    const oz = camPos.z - z;
    const dist = Math.hypot(ox, oy, oz);
    if (dist > LENS_RANGE || dist < 1e-3) return;
    const facing = (ox * dx + oy * dy + oz * dz) / dist;
    if (facing < LENS_FACING) return;
    tmpA.set(x, y, z).project(lastCamera);
    // Behind the lens: `project` mirrors a point behind the camera through the
    // origin, so without this a wound at your back paints the front of the glass.
    if (tmpA.z > 1) return;
    // Falls off with distance and with how far off the axis the lens sits, so
    // being opened at arm's length facing you is the loudest case by a long way.
    const s = power * facing * (1 - dist / LENS_RANGE) * 1.6;
    hit(s, tmpA.x * 0.5 + 0.5, tmpA.y * 0.5 + 0.5);
  }

  function woundBlood(o: WoundOptions): void {
    // Normalised against a heavy: the berserker's is 50, and the sim's own
    // multipliers put the very worst blow in the game a little over 70. A graze
    // is a fifth of this and looks it.
    const k = clamp01(o.damage / 45);
    const hot = arterial(o.zone);
    const count = Math.max(2, Math.round((5 + 26 * k) * (hot ? 1.3 : 1) * settings.particleScale));
    if (store.n + count > budget) return;

    let dx: number;
    let dy: number;
    let dz: number;
    if (o.direction) {
      // Lifted off the blade's own line. Blood follows the edge, but an edge
      // travelling flat still throws upward, because what leaves the wound
      // leaves it off the *face* of the cut and the cut is rarely level.
      //
      // 0.30 of lift, not 0.40, and it is the throw below that forced it. The
      // callers hand over a unit vector, so +0.4 on a level blow is 22° of
      // elevation before the cone's own ±27° is added — and the fast half of a
      // 3.4 + 5.2k throw at 50° is still in the air at 0.76 s. Range goes as v²
      // and airtime as v·sinθ; taking the lift down is how the spray gets its
      // distance back out of the sky and onto the ground, where a stain is.
      dx = o.direction.x; dy = o.direction.y + 0.30; dz = o.direction.z;
    } else {
      const a = Math.random() * TAU;
      dx = Math.cos(a); dy = rand(0.35, 0.8); dz = Math.sin(a);
    }
    const inv = 1 / (Math.hypot(dx, dy, dz) || 1);

    spurt(
      o.position.x, o.position.y, o.position.z,
      dx * inv, dy * inv, dz * inv,
      count,
      // Same ceiling as a severance burst, for the same reason: everything this
      // module throws has to be on the ground within about three quarters of a
      // second or the spray outlives the blow that caused it. That sentence is
      // now `goretest`'s "AND IT ARRIVES" claim rather than an intention.
      3.4 + 5.2 * k,
      // A light cut sprays wide and weakly; a heavy one drives it in one
      // direction. The cone narrowing with damage is what makes the two read
      // differently at a glance even before the count registers.
      0.95 - 0.35 * k,
      0.038 + 0.035 * k,
      // Deeper the harder it was hit: more of it, and less of it aerated.
      tmpColor.copy(hot ? PALETTE.bloodArterial : PALETTE.bloodFresh).lerp(PALETTE.bloodDark, k * 0.2),
    );
    if (k > 0.22) bloodMist(o.position.x, o.position.y, o.position.z, Math.max(1, Math.round(count * 0.28)), 0.7 + k * 0.5);
    // On the glass, if the lens was close enough and in the way. Scaled off the
    // same `k` everything else here is, so a graze mists it and a cleaving heavy
    // to the throat covers it.
    lensBlood(o.position.x, o.position.y, o.position.z, dx * inv, dy * inv, dz * inv,
      k * (hot ? 1.15 : 0.85));

    // A kill that took nothing off still empties out. Pinned to the world rather
    // than to a node, because this path has no cut and therefore no stump to
    // follow — the pool lands where he was standing, which for a man who folds
    // straight down is within half a metre of where he ends up.
    if (o.fatal) {
      startJet(null, o.position.x, o.position.y, o.position.z, dx * inv, dy * inv, dz * inv,
        0.07, 0.5 + k * 0.35, JET_LIFE * 1.4, true);
    }
  }

  // ---- running wounds ------------------------------------------------------
  //
  // Two jets per severance — one on the body, one on the piece — so eight
  // warriors coming apart at once is sixteen. The pool is sized for that on high
  // and deliberately not on low, where the oldest wound stops early instead:
  // a phone that drops a frame is a worse death than a phone with less blood.
  const JET_SLOTS = tier === "high" ? 20 : tier === "medium" ? 14 : 8;
  /** How long a stump keeps running after the part has gone. */
  const JET_LIFE = tier === "low" ? 0.85 : 1.6;
  /**
   * Droplets a second at full pressure, before scale, pulse and crowding. It
   * decays as (1 − t)^1.6 over the jet's life, so a stump spends about a third
   * of this in total: fifty-odd droplets across three visible spurts, against
   * the thirty-four the separation burst throws in one frame.
   *
   * 84, not 58, and the render is what asked for it. `sin^1.6` is a narrow peak:
   * with a 0.18 floor the jet was genuinely idle for about two thirds of every
   * beat, which is what a real artery does and is not what "really over the top"
   * means — a still taken anywhere in the quiet part showed a scatter of flecks.
   * The floor went to 0.26 and the rate up by half, so diastole is now about
   * twenty droplets a second rather than ten and systole is eighty-odd. The
   * PULSE claim in `goretest` is what stops that turning back into a hose: the
   * spray still has to fall at least 60% away between beats.
   */
  const JET_RATE = 84;

  const jets: Jet[] = [];
  let jetSerial = 0;
  let jetsLive = 0;
  for (let i = 0; i < JET_SLOTS; i++) {
    jets.push({
      active: false, anchor: null, axis: 1,
      x: 0, y: 0, z: 0, dx: 0, dy: 1, dz: 0,
      radius: 0.06, power: 1, age: 0, life: 0, acc: 0,
      lx: 0, ly: 0, lz: 0, tracked: false, pools: false, serial: 0,
    });
  }

  /** Free slot, else the wound furthest through its life. Never grows. */
  function claimJet(): Jet {
    let best = jets[0];
    let bestT = -1;
    for (const j of jets) {
      if (!j.active) { best = j; break; }
      const t = j.age / j.life;
      if (t > bestT) { bestT = t; best = j; }
    }
    if (best.active) finishJet(best, false);
    best.active = true;
    best.serial = ++jetSerial;
    best.age = 0;
    best.acc = 0;
    best.tracked = false;
    jetsLive++;
    return best;
  }

  /**
   * Ends a jet, and leaves the pool where the body actually came to rest rather
   * than where it was hit — which is the whole reason the pool is dropped here
   * and not at the cut. A man opened at the throat walks, staggers or topples
   * a metre and a half before he lies still, and the mark belongs under him.
   */
  function finishJet(j: Jet, leavePool: boolean): void {
    if (!j.active) return;
    j.active = false;
    j.anchor = null;
    jetsLive--;
    if (!leavePool || !j.pools) return;
    addPool(
      j.x, j.z,
      (0.42 + j.radius * 3.4) * (0.75 + j.power * 0.45),
      // Spreads over seconds, not frames. It is what is left of the effect once
      // the particles are gone, so it is the part a player actually looks at.
      tier === "low" ? 2.4 : 4.5,
      // 210 s, not 70. The brief asks for "pooling that persists for the round"
      // and a round has no clock on it at all — `endRound` fires when men die,
      // and the duel `goretest` drives takes two and a half minutes to get
      // there. A pool that dried at seventy seconds was gone before the round it
      // was spilled in had finished, which is a pool nobody ever saw dry. The
      // round boundary is what ends it, not a timer: `clearBattle` empties every
      // slot, so this number can be as long as the fight without leaking one
      // frame of it into the next round.
      tier === "low" ? 100 : 210,
    );
  }

  function stopJet(j: Jet, serial: number): void {
    if (!j.active || j.serial !== serial) return;
    finishJet(j, true);
  }

  /**
   * Which way along the anchor's own Y the wound faces, worked out once from the
   * separation frame. Storing the sign rather than the vector is what lets the
   * spray follow a corpse that rolls: the axis is re-read off the live matrix
   * every frame, and a world-space direction captured at the cut would not turn.
   */
  function axisSignFor(a: THREE.Object3D, dx: number, dy: number, dz: number): 1 | -1 {
    a.updateWorldMatrix(true, false);
    const e = a.matrixWorld.elements;
    return e[4] * dx + e[5] * dy + e[6] * dz >= 0 ? 1 : -1;
  }

  function startJet(
    anchor: THREE.Object3D | null,
    x: number, y: number, z: number,
    dx: number, dy: number, dz: number,
    radius: number, power: number, life: number, pools: boolean,
  ): Jet {
    const j = claimJet();
    j.anchor = anchor;
    j.axis = anchor ? axisSignFor(anchor, dx, dy, dz) : 1;
    j.x = x; j.y = y; j.z = z;
    j.dx = dx; j.dy = dy; j.dz = dz;
    j.radius = radius;
    j.power = power;
    j.life = life;
    j.pools = pools;
    return j;
  }

  function severed(o: SeveranceOptions): BleedHandle {
    const power = o.power ?? 1;
    const radius = Math.max(0.025, o.radius);
    const hot = arterial(o.zone);
    const inv = 1 / (Math.hypot(o.direction.x, o.direction.y, o.direction.z) || 1);
    const dx = o.direction.x * inv;
    const dy = o.direction.y * inv;
    const dz = o.direction.z * inv;
    const { x, y, z } = o.position;
    // A neck is 55 mm of artery and a thigh is a hand's breadth of meat: the
    // section is most of how hard it throws, and it is the one number the cut
    // measured for us.
    const force = power * (hot ? 1.3 : 1) * (0.7 + radius * 3.2);

    const count = Math.round(34 * force * settings.particleScale);
    if (store.n + count <= budget) {
      spurt(
        x, y, z, dx, dy, dz,
        count,
        // 4.4 + 4.6·force, against 2.6 + 2.5. The owner asked for "really over
        // the top" and measured this threw a mean of 1.37 m and a furthest of
        // 2.75 m — which is blood landing on the man's own boots.
        //
        // THIS IS NOT THE 3.6 + 4.4 THAT WAS REVERTED, and the difference is
        // worth stating because the note that replaced it is still above and
        // still true. What was wrong with that pass was not the speed, it was
        // the AIRTIME: a gout at 11 m/s going up at 45° is 1.6 m high with
        // 0.84 s of flight, and it was still in the air when the shutter fired.
        // Range goes as v² and airtime as v·sinθ, so a fast throw down a SHALLOW
        // axis buys distance without buying time — a neck's axis leaves at about
        // 27° above horizontal, where 10 m/s is 4.4 m of range and half a second
        // of flight. `goretest`'s "AND IT ARRIVES" claim is that constraint made
        // an assertion instead of a comment, precisely so the next pass cannot
        // undo it by reading only this half of the story.
        4.4 + 4.6 * force,
        // 0.42 rad, not 0.52. A wider cone spends the throw sideways: with the
        // elevation ceiling folding the steep half of it back down toward
        // horizontal, the cone is now the only thing deciding how much of the
        // spray goes DOWNRANGE, and 30° of half-angle put the mean at 1.47 m
        // against the metre and a half a severed throat is supposed to throw.
        0.42,
        0.045 + radius * 0.42,
        PALETTE.bloodArterial,
      );
      bloodMist(x, y, z, Math.max(2, Math.round(count * 0.3)), 1 + radius * 2);
    }
    // A limb coming off in front of you is the loudest case this effect has, and
    // it is the one the owner is describing. Outside the budget guard on purpose:
    // a severance the particle ceiling refused still happened, and the glass
    // should still know about it.
    // force·1.25, not force·0.85, and the gate is what caught it: a NECK
    // SEVERANCE was reaching the glass at 1.04 while a survivable heavy to the
    // same throat reached it at 1.15, because `force` tops out near 1.2 for a
    // neck and `woundBlood`'s own scale tops out at 1.15 on a straight multiple
    // of damage. Two call sites deriving "how loud is this" from two different
    // quantities and never compared — a limb coming off has to be the loudest
    // thing this effect has, and it was not.
    lensBlood(x, y, z, dx, dy, dz, Math.min(1.6, force * 1.25));

    const life = JET_LIFE * (0.75 + force * 0.4);
    const body = startJet(o.stump ?? null, x, y, z, dx, dy, dz, radius, force, life, true);
    const bodySerial = body.serial;

    // The piece bleeds too, from its own face, pointing the other way. Skipped on
    // the low tier: two emitters per death is the second thing that tier cannot
    // afford, after the bisection it already refuses.
    let piece: Jet | null = null;
    let pieceSerial = 0;
    if (o.piece && tier !== "low") {
      piece = startJet(o.piece, x, y, z, -dx, -dy, -dz, radius, force * 0.55, life * 0.8, false);
      pieceSerial = piece.serial;
    }

    return {
      stop() {
        stopJet(body, bodySerial);
        if (piece) stopJet(piece, pieceSerial);
      },
    };
  }

  function stepJets(dt: number): void {
    if (jetsLive === 0 || dt <= 0) return;
    // Blood yields to the budget rather than the budget yielding to blood. Past
    // two thirds full the jets thin out and then stop emitting entirely, which
    // is what stops eight simultaneous deaths from spiking: the first two deaths
    // look exactly as they should and the eighth spends what is left.
    const headroom = clamp01((budget - store.n) / (budget * 0.34));
    const crowd = 1 / (1 + jetsLive * 0.16);
    for (const j of jets) {
      if (!j.active) continue;
      j.age += dt;

      const a = j.anchor;
      if (a) {
        // Losing its parent is how a wound ends without anyone telling us. It is
        // exactly what `Severance.release()` does to a stump and what the piece
        // pool does to a limb it reclaims, so a respawn stops the blood even if
        // the caller never touches the handle. The grace period is because a
        // freshly cut piece is unparented for the frame before anim.ts adds it.
        if (!a.parent && j.age > 0.25) { finishJet(j, true); continue; }
        a.updateWorldMatrix(true, false);
        const e = a.matrixWorld.elements;
        j.x = e[12]; j.y = e[13]; j.z = e[14];
        const s = j.axis;
        const nx = e[4] * s;
        const ny = e[5] * s;
        const nz = e[6] * s;
        const nl = 1 / (Math.hypot(nx, ny, nz) || 1);
        j.dx = nx * nl; j.dy = ny * nl; j.dz = nz * nl;
      }

      let ivx = 0;
      let ivy = 0;
      let ivz = 0;
      if (j.tracked) {
        // Clamped: a corpse being respawned or a piece being reparented moves
        // several metres in one frame, and an unclamped inheritance answers that
        // with a wall of blood across the arena.
        const cap = 14;
        ivx = Math.max(-cap, Math.min(cap, (j.x - j.lx) / dt)) * 0.6;
        ivy = Math.max(-cap, Math.min(cap, (j.y - j.ly) / dt)) * 0.6;
        ivz = Math.max(-cap, Math.min(cap, (j.z - j.lz) / dt)) * 0.6;
      }
      j.lx = j.x; j.ly = j.y; j.lz = j.z;
      j.tracked = true;

      const t = clamp01(j.age / j.life);
      if (t >= 1) { finishJet(j, true); continue; }

      // Pressure falls away as the man does, and it pulses on the way. A heart
      // under load is why a stump spurts rather than pours, and the pulse is the
      // difference between this and a garden hose.
      //
      // 0.18 + 0.82, not 0.42 + 0.58. The old floor meant the quiet half of the
      // beat still ran at 42% — which is a hose with a wobble in it, not a
      // heart. 9.2 rad/s is 88 beats a minute and stays; what changed is the
      // DEPTH, here and in the speed below, because the pulse is only legible
      // if diastole nearly stops.
      const pulse = 0.26 + 0.74 * Math.pow(Math.max(0, Math.sin(j.age * 9.2)), 1.6);
      j.acc += JET_RATE * j.power * Math.pow(1 - t, 1.6) * pulse * settings.particleScale * headroom * crowd * dt;
      if (j.acc < 1) continue;
      const n = Math.min(6, Math.floor(j.acc));
      j.acc -= n;
      if (store.n + n > budget) continue;
      spurt(
        // Off the face of the wound, not out of one point: a stump is a section
        // and blood leaves all of it.
        j.x + sym(j.radius * 0.55), j.y + sym(j.radius * 0.55), j.z + sym(j.radius * 0.55),
        j.dx, j.dy, j.dz,
        n,
        // Systole throws four times what diastole does. At the old
        // 0.55 + 0.6·pulse the speed swung by 44% across the beat and the
        // spray was a continuous cone with a ripple in it; at 0.30 + 0.95 it
        // leaves at nine and a half metres a second on the beat and dribbles
        // between them, which is the thing a person recognises as arterial.
        (2.6 + 4.2 * j.power) * (0.30 + 0.95 * pulse),
        // Tighter than the separation burst's 0.52, and that ordering is the
        // point: a cut OPENING is a burst and a stump still under pressure is a
        // STREAM. One cone for both was why the running spray read as more of
        // the same rather than as the thing left behind.
        0.30,
        0.035 + j.radius * 0.3,
        tmpColor.copy(PALETTE.bloodArterial).lerp(PALETTE.bloodFresh, t),
        ivx, ivy, ivz,
      );
    }
  }

  function dust(x: number, y: number, z: number, count: number, spread: number, up: number): void {
    for (let i = 0; i < count; i++) {
      spawn({
        x: x + sym(0.22), y: y + rand(0, 0.12), z: z + sym(0.22),
        vx: sym(1.1) * spread, vy: rand(0.35, 1.4) * up, vz: sym(1.1) * spread,
        life: rand(0.75, 1.6),
        size0: rand(0.2, 0.4), size1: rand(0.7, 1.25),
        c0: PALETTE.dustNear, c1: PALETTE.dustFar,
        alpha: 0.4, fadeIn: 0.14, fadePow: 1.5,
        rotV: sym(0.7), drag: 2.7, grav: 1.1, buoy: 0.7,
        frame: CELL.dust,
        flags: F_ALPHA | F_WIND,
      });
    }
  }

  /** Mail rings and torn cloth coming off a struck body. */
  function debris(x: number, y: number, z: number, count: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      const metal = i % 3 !== 2;
      spawn({
        x, y, z,
        vx: sym(1) * spread * (metal ? 3.4 : 1.6),
        vy: rand(0.6, 3.4),
        vz: sym(1) * spread * (metal ? 3.4 : 1.6),
        life: metal ? rand(0.7, 1.3) : rand(0.9, 1.8),
        size0: metal ? rand(0.028, 0.055) : rand(0.05, 0.1),
        size1: metal ? rand(0.028, 0.055) : rand(0.06, 0.12),
        c0: metal ? PALETTE.mail : PALETTE.cloth,
        c1: metal ? PALETTE.mail : PALETTE.cloth,
        alpha: metal ? 0.95 : 0.6, fadeIn: 0.02, fadePow: metal ? 0.8 : 1.4,
        rotV: metal ? sym(14) : sym(3),
        drag: metal ? 0.8 : 3.4,
        grav: metal ? 18 : 5,
        frame: metal ? CELL.chip : CELL.ash,
        flags: F_ALPHA | (metal ? F_BOUNCE : F_WIND),
      });
    }
  }

  function auraTick(x: number, y: number, z: number, count: number, hex: number): void {
    const sig = SIGNATURES.get(hex);
    const color = sig ? sig.color : tmpColor.setHex(hex, THREE.SRGBColorSpace).multiplyScalar(2.6).clone();
    const s = sig ?? SIGNATURES.get(0xffaa33)!;
    // Only the hot signatures flicker. A huscarl's shield scales strobing at
    // twenty hertz reads as a rendering fault, not as an ability.
    const twinkle = s.cell === CELL.spark || s.cell === CELL.flame ? F_TWINKLE : 0;
    // A flame lick has an up. Tumbling one turns fire into falling petals, so
    // the berserker's signature keeps its licks upright and lets the glyphs and
    // scales do the spinning.
    const upright = s.cell === CELL.flame;

    // A fresh activation is a shockwave and a flash; the ticks after it are the
    // aura idling. GameCanvas re-sends the same colour every other frame, so the
    // activation has to be spotted here, by where and when it last appeared.
    // Matched on colour as well as place, because two warriors of different
    // classes standing within arm's reach of each other is the normal case in a
    // brawl, and one of them swallowing the other's activation is exactly the
    // moment the effect needed to read.
    let fresh = true;
    for (const site of auraSites) {
      if (site.hex === hex && Math.hypot(site.x - x, site.z - z) < 2 && clock - site.t < 0.5) {
        site.x = x; site.z = z; site.t = clock;
        fresh = false;
        break;
      }
    }
    if (fresh) {
      if (auraSites.length >= 8) auraSites.shift();
      auraSites.push({ x, z, t: clock, hex });
      const gy = groundAt(x, z);
      addRing(x, gy, z, s.shock, color, 0.5);
      addFlash(x, y, z, 5.5, hex, 0.22);
      for (let i = 0; i < Math.round(10 * settings.particleScale); i++) {
        const a = Math.random() * TAU;
        spawn({
          x: x + Math.cos(a) * s.ring, y: y - 0.7, z: z + Math.sin(a) * s.ring,
          vx: -Math.sin(a) * s.swirl * 1.6, vy: rand(1.4, 3.6) * s.rise * 0.6, vz: Math.cos(a) * s.swirl * 1.6,
          life: rand(0.5, 1.0),
          size0: s.size * 1.4, size1: s.size * 0.3,
          c0: color, c1: color,
          alpha: 1, fadeIn: 0.04, fadePow: 1.2,
          rot: upright ? sym(0.22) : undefined,
          rotV: upright ? 0 : s.spin * 2, drag: 1.6, grav: -1.2,
          frame: s.cell,
          flags: twinkle,
        });
      }
    }

    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const r = s.ring * rand(0.7, 1.15);
      spawn({
        x: x + Math.cos(a) * r, y: y + sym(0.55), z: z + Math.sin(a) * r,
        vx: -Math.sin(a) * s.swirl, vy: rand(0.5, 1.5) * s.rise, vz: Math.cos(a) * s.swirl,
        life: rand(0.55, 1.05),
        size0: s.size, size1: s.size * (s.cell === CELL.flame ? 0.2 : 0.6),
        c0: color, c1: color,
        alpha: 0.9, fadeIn: 0.1, fadePow: 1.5,
        rot: upright ? sym(0.22) : undefined,
        rotV: upright ? 0 : s.spin, drag: 1.3, grav: -0.6,
        frame: s.cell,
        flags: twinkle,
      });
    }
  }

  // ---- public spawn entry points -----------------------------------------

  function burst(o: BurstOptions): void {
    const kind = o.kind ?? inferKind(o.color);
    const count = Math.max(1, Math.round(o.count * settings.particleScale));
    // A burst past the ceiling is dropped whole, never queued: half a spray of
    // blood looks worse than none, and a queue would land it after the blow.
    if (store.n + count > budget) return;

    const { x, y, z } = o.position;
    const spread = (o.spread ?? 5) / 5;
    const up = (o.up ?? 4) / 4;

    switch (kind) {
      case "spark":
        sparks(x, y, z, count, spread, up);
        addFlash(x, y, z, 3.2 + count * 0.25, 0xffcf8a);
        // Steel on mail throws the mail as well as the light.
        debris(x, y, z, Math.max(1, count >> 1), spread * 0.5);
        break;
      case "blood":
        // Damage, not colour, is what makes one blow's blood differ from
        // another's now. `color` is ignored here for the first time: the six
        // call sites were passing #d42a1a for a hit and #881410 for a death,
        // which is a hand-tuned two-step where the sim has the real number. A
        // caller that has not been updated to pass `damage` gets it inferred
        // from `count`, which reproduces those two steps to within a point.
        woundBlood({
          position: o.position,
          damage: o.damage ?? o.count * 1.4,
          direction: undefined,
        });
        break;
      case "dust":
        dust(x, y, z, count, spread, up);
        break;
      case "debris":
        debris(x, y, z, count, spread);
        break;
      case "ember":
        for (let i = 0; i < count; i++) emberAt(x, y, z, 0.25, 1);
        break;
      case "aura":
        auraTick(x, y, z, count, o.color);
        break;
    }
  }

  function emberAt(x: number, y: number, z: number, radius: number, heat: number, born = 0): void {
    const a = Math.random() * TAU;
    const r = Math.sqrt(Math.random()) * radius;
    // One in five is a big slow one that rides the column right up and out. A
    // population that is all the same size and all the same speed reads as
    // noise; the spread in lifetimes is what turns it into a column with a
    // shape, and it is what puts embers at head height rather than all of them
    // inside the flame that made them.
    const lofted = Math.random() < 0.22;
    spawn({
      x: x + Math.cos(a) * r, y: y + rand(0, 0.3), z: z + Math.sin(a) * r,
      vx: sym(0.55), vy: rand(1.1, 3.2), vz: sym(0.55),
      life: (lofted ? rand(3.4, 6.2) : rand(1.5, 3.6)) + moodHeat,
      size0: rand(0.034, lofted ? 0.088 : 0.062) * (1 + heat * 0.3),
      size1: rand(0.008, 0.02),
      c0: PALETTE.emberHot, c1: PALETTE.emberCool,
      alpha: 1, born, fadeIn: 0.06, fadePow: lofted ? 2.4 : 1.8,
      drag: lofted ? 0.7 : 1.1, grav: 1.0, buoy: lofted ? 2.6 : 2.2, turb: 0.85,
      frame: CELL.ember,
      flags: F_TWINKLE | F_WIND | F_AMBIENT,
    });
  }

  function smokeAt(x: number, y: number, z: number, radius: number, scale: number, born = 0): void {
    const a = Math.random() * TAU;
    const r = Math.sqrt(Math.random()) * radius;
    spawn({
      x: x + Math.cos(a) * r, y: y + rand(0.2, 0.6) * scale, z: z + Math.sin(a) * r,
      vx: sym(0.28), vy: rand(1.0, 1.9), vz: sym(0.28),
      life: rand(4.5, 8.5),
      size0: rand(0.4, 0.75) * scale, size1: rand(2.2, 3.6) * scale,
      // Warm at the root where the fire is under it, cold and grey by the time
      // it has climbed clear. One column, two colours, and the height reads.
      c0: PALETTE.smokeLit, c1: PALETTE.smokeCold,
      alpha: 0.22 + moodHeat * 0.1, born, fadeIn: 0.14, fadePow: 1.5,
      rotV: sym(0.35), drag: 0.8, grav: 0.2, buoy: 1.9, turb: 0.3,
      frame: SMOKE_CELLS[(Math.random() * 3) | 0],
      flags: F_ALPHA | F_WIND | F_AMBIENT,
    });
  }

  /**
   * The air over churned ground. Not a puff kicked by anything — a population
   * that is simply *there*, the way the motes are, because an arena floor that
   * eight warriors have been fighting on carries dust whether or not anyone is
   * moving in the frame you happen to be looking at.
   *
   * This is the shape of the fix for "no grain of dust in eight captures". The
   * dust that existed was driven entirely by `state === "sprinting"` arriving as
   * an event, and a still frame of a fight has no events in it at all. Ambient
   * effects have to be a function of state, and the only state a dust cloud
   * needs is that there is ground and there is wind.
   */
  function groundDustAt(x: number, z: number, born = 0): void {
    const gy = groundAt(x, z);
    spawn({
      x, y: gy + rand(0.02, 0.34), z,
      vx: sym(0.16), vy: rand(0.02, 0.2), vz: sym(0.16),
      life: rand(3.2, 6.4),
      size0: rand(0.22, 0.55), size1: rand(0.75, 1.5),
      c0: PALETTE.dustNear, c1: PALETTE.dustFar,
      // Low enough that thirty of them are air rather than fog. The eye reads
      // dust as motion and as the light through it, not as opacity.
      alpha: 0.11 + moodHeat * 0.06, born, fadeIn: 0.12, fadePow: 1.7,
      rotV: sym(0.4), drag: 1.6, grav: 0.35, buoy: 0.32, turb: 0.14,
      frame: CELL.dust,
      flags: F_ALPHA | F_WIND | F_AMBIENT,
    });
  }

  /**
   * Everything that burns or blows, emitted from state alone. No event reaches
   * this function and none ever should: it is what makes a paused frame of the
   * arena still contain a fire that is throwing embers and air that has
   * something in it.
   */
  function emitAmbient(dt: number, seed = false): void {
    const emberScale = settings.particleScale * (1 + moodHeat * 0.9);
    for (const f of fires) {
      const bonfire = f.spec.kind === "bonfire";
      // Up from 24, because the duplicate-fire fix above halved how many
      // emitters a bonfire has and the column has to carry on one. A torch is
      // 18 m from every camera in the set and its embers are sub-pixel there, so
      // it goes the other way — that budget is better spent on the fire the
      // frame is actually looking at.
      f.emberAcc += (bonfire ? 34 : 2.2) * emberScale * dt;
      f.smokeAcc += (bonfire ? 5 : 0.6) * settings.particleScale * (1 + moodHeat * 0.4) * dt;
      while (f.emberAcc >= 1) {
        f.emberAcc -= 1;
        emberAt(f.spec.position.x, f.spec.position.y + f.spec.height * 0.35, f.spec.position.z, f.spec.radius * 0.9, bonfire ? 1 : 0.6);
      }
      while (f.smokeAcc >= 1) {
        f.smokeAcc -= 1;
        smokeAt(f.spec.position.x, f.spec.position.y + f.spec.height * 0.8, f.spec.position.z, f.spec.radius, bonfire ? 1 : 0.32);
      }
    }

    dustAcc += DUST_RATE * settings.particleScale * dt;
    while (dustAcc >= 1) {
      dustAcc -= 1;
      // A ring rather than a disc, biased outward: dust spawned under the camera
      // is a smear across the lens, and dust spawned at the far edge of the box
      // is gone before it drifts anywhere worth looking. `seed` fills the whole
      // area at once instead, for the first frame that knows where the camera is.
      const a = Math.random() * TAU;
      const r = seed ? Math.sqrt(Math.random()) * 11 : rand(3, 11);
      groundDustAt(camPos.x + Math.cos(a) * r, camPos.z + Math.sin(a) * r, seed ? Math.random() * 0.8 : 0);
    }
  }

  /**
   * The last stand's ground carries the fight that got there.
   *
   * `laststand` frames a warrior at about fifteen per cent health and the floor
   * under him is spotless, because every stain in the game comes from a droplet
   * that landed, and every droplet comes from a `hit` the capture never sends.
   * The mood flag is the state that says this fight has been going for a while,
   * so it is the state that puts the marks down — once, not per frame, and only
   * over half the decal budget so a live blow still has somewhere to stain.
   */
  function markGround(ctx: FrameContext): void {
    if (groundMarked || moodTarget < 0.5) return;
    groundMarked = true;
    const n = Math.min(Math.round(decalCap * 0.5), 20);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      // Clustered, not scattered: a fight happens in a place. Squaring the
      // radius pulls the mass in toward where the two of them have been standing.
      const r = Math.random() * Math.random() * 4.2;
      const big = i % 5 === 0;
      addDecal(
        ctx.focus.x + Math.cos(a) * r,
        ctx.focus.z + Math.sin(a) * r,
        big ? rand(0.34, 0.62) : rand(0.12, 0.34),
        // Long-lived and started part-dried, so the set reads as an afternoon of
        // this rather than as one blow twenty seconds ago.
        260,
        rand(0, 105),
      );
    }
  }

  /**
   * Dust off the local warrior's own boots, derived from where he is rather than
   * from being told he moved.
   *
   * The one dust call in the game fires on `state === "sprinting"`, which is a
   * state nothing in the capture set is ever in, and a warrior at a walk over
   * churned mud kicks plenty. Speed comes from the focus point because that is
   * the only per-warrior signal `FrameContext` carries; it is clamped because a
   * respawn or a switch to spectate teleports it across the arena and an
   * unclamped delta would answer that with a dust explosion.
   */
  function kickBootDust(dt: number, ctx: FrameContext): void {
    const focus = ctx.focus;
    if (!haveFocus) { lastFocus.copy(focus); haveFocus = true; return; }
    const moved = Math.hypot(focus.x - lastFocus.x, focus.z - lastFocus.z);
    lastFocus.copy(focus);
    if (dt <= 0) return;
    const speed = Math.min(moved / dt, 8);
    const state = ctx.localState;
    const afoot = state === "walking" || state === "running" || state === "sprinting";
    if (speed < 0.6 && !afoot) return;
    bootAcc += Math.min(speed, 6) * 1.3 * settings.particleScale * dt;
    while (bootAcc >= 1) {
      bootAcc -= 1;
      const gy = groundAt(focus.x, focus.z);
      spawn({
        x: focus.x + sym(0.2), y: gy + rand(0.02, 0.14), z: focus.z + sym(0.2),
        vx: sym(0.5), vy: rand(0.15, 0.7), vz: sym(0.5),
        life: rand(0.7, 1.4),
        size0: rand(0.14, 0.3), size1: rand(0.5, 0.95),
        c0: PALETTE.dustNear, c1: PALETTE.dustFar,
        alpha: 0.24, fadeIn: 0.1, fadePow: 1.6,
        rotV: sym(0.8), drag: 2.9, grav: 1.3, buoy: 0.6,
        frame: CELL.dust,
        flags: F_ALPHA | F_WIND,
      });
    }
  }

  // ---- frame --------------------------------------------------------------

  function integrate(dt: number, rawDt: number): void {
    for (let i = store.n - 1; i >= 0; i--) {
      const flags = store.flags[i];
      // Fire and weather run on unscaled time. Hit-stop is a combat effect and
      // the bonfire is not in the fight.
      const d = flags & F_AMBIENT ? rawDt : dt;

      store.life[i] -= d;
      if (store.life[i] <= 0) { kill(i); continue; }

      let vx = store.vx[i];
      let vy = store.vy[i];
      let vz = store.vz[i];

      vy += (store.buoy[i] - store.grav[i]) * d;
      const turb = store.turb[i];
      if (turb > 0) {
        const s = store.seed[i];
        vx += Math.sin(clock * 1.9 + s) * turb * d;
        vz += Math.cos(clock * 1.6 + s * 1.7) * turb * d;
        vy += Math.sin(clock * 2.7 + s * 0.9) * turb * 0.5 * d;
      }
      // Implicit damping: stable at any dt, where `v *= 1 - drag*dt` goes
      // negative the first time a frame runs long.
      const damp = 1 / (1 + store.drag[i] * d);
      vx *= damp; vy *= damp; vz *= damp;

      let px = store.px[i] + vx * d;
      let py = store.py[i] + vy * d;
      let pz = store.pz[i] + vz * d;
      if (flags & F_WIND) {
        px += wind.x * d;
        pz += wind.y * d;
      }

      // A body before the ground, because a man standing on it is in the way
      // first. Enter-only — the previous position must be outside and the new
      // one inside — which is what stops a stump's own burst, born inside the
      // victim's capsule, staining him on the frame it leaves the wound. The
      // 30 ms grace is the other half of that: a droplet spawned a few
      // centimetres proud of the skin gets long enough to clear it.
      if ((flags & F_STAIN) && bodies.length > 0 && store.maxLife[i] - store.life[i] > 0.03) {
        const ox = store.px[i];
        const oy = store.py[i];
        const oz = store.pz[i];
        let struck: Body | null = null;
        for (const b of bodies) {
          const r2 = b.radius * b.radius;
          if (axisDist2(b, px, py, pz) > r2) continue;
          if (axisDist2(b, ox, oy, oz) <= r2) continue;
          struck = b;
          break;
        }
        if (struck) {
          // Pushed back out to the surface along the radial normal rather than
          // solved for the crossing: at a droplet's size the two differ by
          // millimetres and one of them costs a square root in a loop that runs
          // for every drop of blood in the arena.
          const abx = struck.bx - struck.ax;
          const aby = struck.by - struck.ay;
          const abz = struck.bz - struck.az;
          const len2 = abx * abx + aby * aby + abz * abz || 1e-6;
          let s = ((px - struck.ax) * abx + (py - struck.ay) * aby + (pz - struck.az) * abz) / len2;
          s = s < 0 ? 0 : s > 1 ? 1 : s;
          let nx = px - (struck.ax + abx * s);
          let ny = py - (struck.ay + aby * s);
          let nz = pz - (struck.az + abz * s);
          const nl = Math.hypot(nx, ny, nz);
          if (nl < 1e-4) { nx = 0; ny = 0; nz = 1; } else { nx /= nl; ny /= nl; nz /= nl; }
          const anchor = struck.spine ?? struck.group;
          // Not every drop leaves a mark. A stump throws twenty-six at the man
          // it came out of and the pool is thirty-six for the whole arena; a
          // third of them is a bloodied warrior, all of them is a red silhouette
          // and eight warriors' worth of slots gone in one death.
          if (Math.random() < 0.36) {
            addBodyMark(
              anchor, struck.group,
              struck.ax + abx * s + nx * struck.radius,
              struck.ay + aby * s + ny * struck.radius,
              struck.az + abz * s + nz * struck.radius,
              nx, ny, nz,
              Math.min(0.2, Math.max(0.035, store.size0[i] * 3.2)) * rand(0.8, 1.3),
            );
          }
          kill(i);
          continue;
        }
      }

      if (flags & (F_BOUNCE | F_STAIN)) {
        const gy = groundAt(px, pz);
        if (py <= gy + 0.012) {
          if (flags & F_STAIN) {
            const speed = Math.hypot(vx, vy, vz);
            // A third rather than a fifth. Sixteen droplets a blow at 0.22 left
            // about three marks, and the decal budget is sixty-four — the pool
            // was never the constraint, and the frame that raised the "there is
            // no blood anywhere" defect is a frame where a fight has been going
            // for minutes and the ground should show it.
            //
            // The mark is sized off the droplet that made it rather than sampled
            // from a range, so the gouts a stump throws leave the wide splashes
            // and the atomised half of the same spray leaves flecks. It is the
            // cheapest way to get the ground to record which blow it was.
            // 0.48, not 0.34. A severance threw seven marks over ten wounds and
            // the desktop keeps sixty-four slots — the budget was never the
            // constraint, `mergeStain` is, and blood landing on blood costs a
            // slot only when it lands somewhere new. Which is exactly where a
            // spray that now reaches four metres is landing.
            if (speed > 1.2 && Math.random() < 0.48) {
              // 8.5, not 6.0, and the ceiling 0.85 rather than 0.58 — asked for
              // by a capture and not by a number. At the old size a severance
              // left thirteen marks that read on grass as dark spots rather than
              // as blood: the COUNT was right and the coverage was not, and the
              // decal budget limits how many marks there are and not how big
              // they are, so this costs nothing at all. Bigger marks also merge
              // more readily, which turns a line of dots into a smear — see
              // `mergeStain`, which caps the result at MERGE_CEIL so a fight in
              // one place cannot turn the whole floor one colour.
              const mark = Math.min(0.85, Math.max(0.11, store.size0[i] * 8.5)) * rand(0.8, 1.3);
              addDecal(px, pz, mark);
            }
            kill(i);
            continue;
          }
          py = gy + 0.012;
          vy = Math.abs(vy) * 0.34;
          vx *= 0.55; vz *= 0.55;
          // A skip costs the spark most of what it had left, so it dies near
          // where it landed instead of rolling forever.
          store.life[i] = Math.min(store.life[i], store.maxLife[i] * 0.4);
        }
      }

      store.vx[i] = vx; store.vy[i] = vy; store.vz[i] = vz;
      store.px[i] = px; store.py[i] = py; store.pz[i] = pz;
      store.rot[i] += store.rotV[i] * d;
    }
  }

  function writeParticles(): void {
    for (let i = 0; i < store.n; i++) {
      const age = 1 - store.life[i] / store.maxLife[i];
      const fadeIn = store.fadeIn[i];
      let a = store.alpha[i] * Math.pow(1 - age, store.fadePow[i]);
      if (fadeIn > 0 && age < fadeIn) a *= age / fadeIn;
      const flags = store.flags[i];
      if (flags & F_TWINKLE) a *= 0.55 + 0.45 * Math.sin(clock * 21 + store.seed[i] * 9);
      if (a <= 0.003) continue;

      const size = store.size0[i] + (store.size1[i] - store.size0[i]) * age;
      const r = store.r0[i] + (store.r1[i] - store.r0[i]) * age;
      const g = store.g0[i] + (store.g1[i] - store.g0[i]) * age;
      const b = store.b0[i] + (store.b1[i] - store.b0[i]) * age;

      let w = size;
      let h = size * store.aspect[i];
      let rot = store.rot[i];
      if (flags & F_ALIGN) {
        // Stretched along its own velocity, projected into the camera plane. A
        // spark that stays a round dot at twelve metres a second is a dot; a
        // spark that draws a streak is a spark. For an aligned particle
        // `aspect` is the ceiling on that stretch, not its shape: a spark wants
        // to draw five lengths, a blood droplet two, and blood drawn like a
        // spark reads as red dashes rather than as anything falling.
        const vx = store.vx[i];
        const vy = store.vy[i];
        const vz = store.vz[i];
        const sx = vx * camRight.x + vy * camRight.y + vz * camRight.z;
        const sy = vx * camUp.x + vy * camUp.y + vz * camUp.z;
        const screenSpeed = Math.hypot(sx, sy);
        if (screenSpeed > 0.05) {
          rot = Math.atan2(sy, sx) - Math.PI / 2;
          h = size * Math.min(store.aspect[i], 1 + screenSpeed * 0.13);
          w = size * 0.85;
        }
      }

      const layer = flags & F_ALPHA ? alphaLayer : additiveLayer;
      layer.push(store.px[i], store.py[i], store.pz[i], w, h, rot, a, r, g, b, store.frame[i]);
    }
  }

  function writeMotes(): void {
    if (moteCount === 0) return;
    // Ash on the last stand, dust before it.
    const warm = moodHeat;
    const cold = PALETTE.ash;
    const hot = PALETTE.emberMote;
    const r = cold.r + (hot.r - cold.r) * warm;
    const g = cold.g + (hot.g - cold.g) * warm;
    const b = cold.b + (hot.b - cold.b) * warm;
    for (let i = 0; i < moteCount; i++) {
      const s = moteSeed[i];
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(clock * (0.9 + s * 0.03) + s));
      additiveLayer.push(
        motePos[i * 3], motePos[i * 3 + 1], motePos[i * 3 + 2],
        moteSize[i], moteSize[i], s, tw * (0.5 + warm * 0.4),
        r, g, b, warm > 0.5 ? CELL.ember : CELL.soft,
      );
    }
  }

  function stepMotes(dt: number): void {
    const half = MOTE_BOX * 0.5;
    for (let i = 0; i < moteCount; i++) {
      const s = moteSeed[i];
      motePos[i * 3] += (wind.x * 0.5 + Math.sin(clock * 0.35 + s) * 0.14) * dt;
      motePos[i * 3 + 1] += (0.06 + moodHeat * 0.1 + Math.sin(clock * 0.5 + s * 2.1) * 0.1) * dt;
      motePos[i * 3 + 2] += (wind.y * 0.5 + Math.cos(clock * 0.3 + s * 1.3) * 0.14) * dt;
      // Wrapped into a box around the camera rather than respawned, so the air
      // never thins out and nothing pops in where you are looking.
      let x = motePos[i * 3] - camPos.x;
      let y = motePos[i * 3 + 1];
      let z = motePos[i * 3 + 2] - camPos.z;
      if (x > half) x -= MOTE_BOX; else if (x < -half) x += MOTE_BOX;
      if (z > half) z -= MOTE_BOX; else if (z < -half) z += MOTE_BOX;
      if (y > 8) y = 0.1; else if (y < 0) y = 8;
      motePos[i * 3] = x + camPos.x;
      motePos[i * 3 + 1] = y;
      motePos[i * 3 + 2] = z + camPos.z;
    }
  }

  function writeRibbons(dt: number): void {
    if (!ribbonMesh || ribbonCount === 0) return;
    let vert = 0;
    let tri = 0;
    for (const rb of ribbons) {
      rb.idle += dt;
      if (!rb.active) continue;
      const fade = 1 - clamp01((rb.idle - 0.05) / 0.2);
      if (fade <= 0 || rb.n < 2) {
        if (fade <= 0) { rb.active = false; rb.n = 0; }
        continue;
      }
      const base = vert;
      for (let j = 0; j <= RIBBON_SEGMENTS; j++) {
        const u = j / RIBBON_SEGMENTS;
        catmull(rb, u, tmpA);
        catmull(rb, Math.min(1, u + 0.04), tmpB);
        catmull(rb, Math.max(0, u - 0.04), tmpC);
        // Side vector from the arc's own tangent crossed with the view ray, so
        // the ribbon lies on the swing plane instead of facing the camera flat.
        tmpB.sub(tmpC);
        if (tmpB.lengthSq() < 1e-8) tmpB.set(0, 1, 0);
        tmpC.copy(tmpA).sub(camPos);
        tmpB.cross(tmpC);
        if (tmpB.lengthSq() < 1e-8) tmpB.copy(camRight);
        tmpB.normalize();
        // Widest just behind the head, tapering to a point at both ends.
        const w = rb.width * Math.pow(u, 0.5) * (1 - 0.6 * Math.pow(u, 9));
        const a = fade * Math.pow(u, 0.7 + rb.idle * 5);
        for (let side = 0; side < 2; side++) {
          const k = side === 0 ? -w : w;
          const o = vert * 3;
          ribbonPos[o] = tmpA.x + tmpB.x * k;
          ribbonPos[o + 1] = tmpA.y + tmpB.y * k;
          ribbonPos[o + 2] = tmpA.z + tmpB.z * k;
          ribbonUv[vert * 2] = u;
          ribbonUv[vert * 2 + 1] = side;
          ribbonCol[o] = rb.color.r;
          ribbonCol[o + 1] = rb.color.g;
          ribbonCol[o + 2] = rb.color.b;
          ribbonAlpha[vert] = a;
          vert++;
        }
      }
      for (let j = 0; j < RIBBON_SEGMENTS; j++) {
        const a = base + j * 2;
        ribbonIdx[tri++] = a;
        ribbonIdx[tri++] = a + 1;
        ribbonIdx[tri++] = a + 2;
        ribbonIdx[tri++] = a + 1;
        ribbonIdx[tri++] = a + 3;
        ribbonIdx[tri++] = a + 2;
      }
    }
    ribbonGeo.setDrawRange(0, tri);
    ribbonMesh.visible = tri > 0;
    if (tri === 0) return;
    ribbonGeo.attributes.position.needsUpdate = true;
    ribbonGeo.attributes.uv.needsUpdate = true;
    ribbonGeo.attributes.aCol.needsUpdate = true;
    ribbonGeo.attributes.aAlpha.needsUpdate = true;
    if (ribbonGeo.index) ribbonGeo.index.needsUpdate = true;
  }

  /**
   * Centripetal-ish Catmull-Rom through the raw tip samples. anim.ts emits a
   * position every 42 ms, which across a 0.35 s swing is nine points — enough to
   * describe the arc, nowhere near enough to draw it. Interpolating is what
   * makes the trail follow the blade rather than chord across it.
   */
  function catmull(rb: Ribbon, u: number, out: THREE.Vector3): void {
    const n = rb.n;
    if (n === 1) { out.set(rb.pts[0], rb.pts[1], rb.pts[2]); return; }
    const f = u * (n - 1);
    const i = Math.min(n - 2, Math.floor(f));
    const t = f - i;
    const get = (k: number, axis: number) => rb.pts[Math.max(0, Math.min(n - 1, k)) * 3 + axis];
    for (let axis = 0; axis < 3; axis++) {
      const p0 = get(i - 1, axis);
      const p1 = get(i, axis);
      const p2 = get(i + 1, axis);
      const p3 = get(i + 2, axis);
      const v = 0.5 * (
        2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t
      );
      if (axis === 0) out.x = v; else if (axis === 1) out.y = v; else out.z = v;
    }
  }

  function writeDecals(dt: number): void {
    decalLayer.begin();
    for (const d of decals) {
      if (!d.active) continue;
      d.age += dt;
      if (d.age >= d.life) { d.active = false; continue; }
      const t = d.age / d.life;
      const size = decalSize(d);
      const a = 0.95 * (1 - clamp01((t - 0.6) / 0.4));
      stainTint(t, d.pool, d.depth);
      decalLayer.push(d.x, d.y, d.z, size, size, d.rot, a, tint[0], tint[1], tint[2], d.cell);
    }
    decalLayer.end();
  }

  /**
   * The multiply tint a stain darkens the ground with, as [r, g, b].
   *
   * Multiply can only take light away — it cannot put red back. Holding red down
   * at a fifth alongside green was arithmetically a black mark: the arena's turf
   * is greener than it is red, so cutting both left nothing but a hole in the
   * grass, and the first gore capture is a corpse surrounded by ink blots. Red
   * passes almost untouched and green and blue are what get taken out, which is
   * the only way this blend mode says "blood" instead of "shadow".
   *
   * `depth` is allowed to pull red down as well, and only red — the hue stays
   * where it is and the *value* falls. That is the difference between a graze
   * and the middle of a pool, and it is a distinction the flat tint could not
   * make. It is capped well short of the level that produced the ink blots.
   */
  function stainTint(t: number, pool: boolean, depth: number): void {
    // Drying browns a mark by letting green and blue back through. A pool is a
    // hundred times the volume of a fleck of spatter and browns far later.
    const dry = t * 0.55 * (pool ? 0.55 : 1);
    const deep = clamp01(depth);
    tint[0] = (0.74 - deep * 0.26) + dry * 0.22;
    tint[1] = (0.075 - deep * 0.03) + dry * 0.45;
    tint[2] = (0.065 - deep * 0.025) + dry * 0.36;
  }

  function writeRings(dt: number): void {
    ringLayer.begin();
    // Spilled coals, drawn flat on the ground outside the log crib. A bonfire
    // this size does not stop at its fuel — it throws embers out onto the earth
    // and they sit there glowing and cooling for minutes. They lie in the ring
    // layer because a coal on the ground is a mark on the ground and should not
    // swing round to face the camera the way a spark does, and because that
    // layer already carries the polygon offset a decal needs on sloped terrain.
    for (const f of fires) {
      if (f.spec.kind !== "bonfire") continue;
      const p = f.spec.position;
      for (let i = 0; i < COAL_BED; i++) {
        const a = i * 2.3999 + f.id * 1.7;
        const r = f.spec.radius * (0.95 + 0.85 * ((i * 0.618) % 1));
        const x = p.x + Math.cos(a) * r;
        const z = p.z + Math.sin(a) * r;
        // Each coal breathes on its own slow clock. A bed that pulses together
        // is a lamp on a dimmer, not a fire.
        const glow = 0.35 + 0.65 * Math.abs(Math.sin(clock * (0.5 + (i % 5) * 0.13) + i * 2.1));
        const s = f.spec.radius * (0.16 + 0.1 * ((i * 0.382) % 1));
        ringLayer.push(
          x, groundAt(x, z) + 0.018, z,
          s, s, a, 0.34 + glow * 0.3,
          PALETTE.coalBed.r * glow, PALETTE.coalBed.g * glow, PALETTE.coalBed.b * glow,
          CELL.ember,
        );
      }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.age += dt;
      if (r.age >= r.life) { rings.splice(i, 1); continue; }
      const t = r.age / r.life;
      const size = (r.r0 + (r.r1 - r.r0) * Math.pow(t, 0.45)) * 2;
      const a = Math.pow(1 - t, 1.7) * 0.8;
      ringLayer.push(r.x, r.y, r.z, size, size, 0, a, r.color.r, r.color.g, r.color.b, r.frame);
    }
    ringLayer.end();
  }

  /**
   * Run the ambient systems forward before the first frame is drawn.
   *
   * This is the fix for the whole "no embers, no smoke, no dust in eight
   * captures" finding, and the reason it is a build-time step rather than a
   * tuning change. `GameCanvas` clamps its frame delta to 50 ms and the capture
   * harness signals readiness after twenty-six animation frames, so a shot is
   * taken **1.35 seconds** into the simulation no matter how long the headless
   * box actually took to render it. An ember lives one and a half to six
   * seconds and has to climb; a smoke puff needs four to reach the size at which
   * it is a plume rather than a speck. Neither has happened yet. The motes were
   * the only ambient thing that appeared in any capture, and the only reason is
   * that they are seeded into a box at construction instead of emitted.
   *
   * Nine seconds at twelve steps is a hundred and eight iterations over a few
   * hundred particles — under a millisecond, once, and the same code path the
   * frame loop uses, so there is no second definition of what a fire emits that
   * could drift away from the first. It also means a real match opens on a fire
   * that is already burning rather than on one lighting itself.
   */
  function warmUp(seconds: number): void {
    const step = 1 / 12;
    for (let t = 0; t < seconds; t += step) {
      clock += step;
      emitAmbient(step);
      integrate(step, step);
    }
  }
  warmUp(9);

  // Every quad this module draws is a billboard standing in for something with
  // no surface — fire, smoke, a spark. None of it should occlude anything, and
  // the occlusion prepass would take all of it literally, so it goes on the
  // layer that pass drops. Done once, at the end of construction, because
  // nothing here is allocated after that point.
  setLayerDeep(root, LAYER_UNOCCLUDED);

  return {
    root,
    get liveParticles() {
      return store.n;
    },

    census(): GoreCensus {
      let decalsN = 0;
      let poolsN = 0;
      let highest = -Infinity;
      for (const d of decals) {
        if (!d.active) continue;
        decalsN++;
        if (d.pool) poolsN++;
        if (d.y > highest) highest = d.y;
      }
      let marksN = 0;
      for (const m of bodyMarks) {
        if (m.life <= 0 || !m.anchor) continue;
        marksN++;
        m.anchor.updateWorldMatrix(true, false);
        markVec.set(m.lx, m.ly, m.lz).applyMatrix4(m.anchor.matrixWorld);
        if (markVec.y > highest) highest = markVec.y;
      }
      let jetsN = 0;
      for (const j of jets) {
        if (!j.active) continue;
        jetsN++;
        if (j.y > highest) highest = j.y;
      }
      // A droplet is blood; the arena's ash, embers and smoke are not. The two
      // share one store and only the flag tells them apart.
      let combat = 0;
      for (let i = 0; i < store.n; i++) {
        if (store.flags[i] & F_AMBIENT) continue;
        combat++;
        if (store.py[i] > highest) highest = store.py[i];
      }
      return {
        decals: decalsN,
        pools: poolsN,
        bodyMarks: marksN,
        jets: jetsN,
        combatParticles: combat,
        particles: store.n,
        rings: rings.length,
        ribbons: ribbons.reduce((n, r) => n + (r.active ? 1 : 0), 0),
        burners: burners.reduce((n, b) => n + (b.active ? 1 : 0), 0),
        highestBloodY: highest,
      };
    },

    probe(): GoreProbe {
      const drops: GoreProbe["drops"] = [];
      for (let i = 0; i < store.n; i++) {
        // F_STAIN is what makes a particle blood: it is the only population in
        // the store that dies on the ground and leaves a mark.
        if (!(store.flags[i] & F_STAIN)) continue;
        drops.push({
          x: store.px[i], y: store.py[i], z: store.pz[i],
          vx: store.vx[i], vy: store.vy[i], vz: store.vz[i],
          age: store.maxLife[i] - store.life[i], life: store.maxLife[i],
          size: store.size0[i],
        });
      }
      const marks: GoreProbe["marks"] = [];
      for (const d of decals) {
        if (!d.active) continue;
        marks.push({ x: d.x, y: d.y, z: d.z, r: decalSize(d) * 0.5, pool: d.pool, age: d.age, life: d.life });
      }
      return { drops, marks };
    },

    clearBattle() {
      // Stumps first, and with `leavePool` false. `finishJet(j, true)` is the
      // normal ending and it drops a pool where the body came to rest — exactly
      // the right thing when a wound runs dry mid-fight, and exactly the wrong
      // thing here, where it would stain the new round's ground on the frame
      // the old one was wiped off it.
      for (const j of jets) finishJet(j, false);
      jetsLive = 0;
      for (const m of bodyMarks) { m.life = 0; m.anchor = null; m.owner = null; }
      for (const d of decals) d.active = false;
      // Compacted in place rather than emptied: the arena's dust, embers and
      // smoke belong to the place and burn straight through an intermission,
      // and the fire that emitted them is still standing. Only combat leaves.
      let w = 0;
      for (let i = 0; i < store.n; i++) {
        if (!(store.flags[i] & F_AMBIENT)) continue;
        if (w !== i) copyParticle(i, w);
        w++;
      }
      store.n = w;
      ambientLive = w;
      stainLive = 0;
      rings.length = 0;
      for (const r of ribbons) { r.active = false; r.n = 0; r.idle = 0; }
      // A man alight when the round ended is not alight when the next one opens:
      // the server clears `burning` on every warrior in `startRound`, and until
      // now nothing on this side spent what the last round had already lit.
      for (const b of burners) {
        if (!b.active) continue;
        b.active = false; b.id = ""; b.alight = false;
        b.flame = 0; b.tail = 0; b.placed = false; b.want = 0; b.score = 0;
      }
      burnersLive = 0;
      // The flame layer holds the tongues of whoever was burning until something
      // repacks it. `rebuildFires` runs while this is non-zero, so leaving it
      // set for one more frame is what actually takes them out of the buffer.
      burnerTongues = Math.max(burnerTongues, 1);
      // The capsule cache is dropped and its clock wound back, not merely
      // dropped: a new round moves every warrior to a new place on the ring, and
      // an empty `bodies` with a fresh `bodyScanAt` would leave up to six tenths
      // of a second in which blood passes through men because the scan has not
      // been allowed to run yet.
      bodies.length = 0;
      bodyScanAt = -1e3;
    },

    burst,

    trail(o) {
      if (!settings.trails) return;
      pushTrailSample(o.position.x, o.position.y, o.position.z, o.color);
      // A blade throws the odd fleck as it cuts. Rare on purpose — a trail of
      // sparks under every swing turns a fight into a firework display.
      if (tier === "high" && Math.random() < 0.28 && store.n + 1 <= budget) {
        spawn({
          x: o.position.x, y: o.position.y, z: o.position.z,
          vx: sym(1.2), vy: rand(-0.4, 1.2), vz: sym(1.2),
          life: rand(0.16, 0.34),
          size0: 0.03, size1: 0.008,
          aspect: 4,
          c0: PALETTE.sparkHot, c1: PALETTE.sparkCool,
          alpha: 0.7, fadeIn: 0.02, fadePow: 1.2,
          drag: 3, grav: 8, frame: CELL.spark,
          flags: F_ALIGN,
        });
      }
    },

    wound: woundBlood,
    severed,

    addFire,
    removeFire,
    setBurning,

    setMood(mood) {
      moodTarget = mood === "lastStand" ? 1 : 0;
    },

    update(dt, ctx) {
      const rawDt = ctx.rawDt || dt;
      clock += rawDt;
      moodHeat += (moodTarget - moodHeat) * Math.min(1, rawDt * 0.9);

      // The camera basis, read once and reused by every velocity-aligned
      // particle and by the ribbons.
      const m = ctx.camera.matrixWorld.elements;
      camRight.set(m[0], m[1], m[2]);
      camUp.set(m[4], m[5], m[6]);
      camPos.set(m[12], m[13], m[14]);
      // Kept for `lensBlood`, which runs from the packet loop rather than from
      // here and needs a projection. The rig hands out one camera for the life
      // of a stage, so this is the same object every frame.
      lastCamera = ctx.camera;

      // A breeze that turns slowly. Everything airborne reads the same vector,
      // which is what stops smoke, embers and motes drifting three ways at once.
      const wt = clock * 0.07;
      wind.set(0.35 + Math.sin(wt) * 0.22, 0.16 + Math.cos(wt * 0.83) * 0.22);

      // The warm-up ran before anything knew where the camera would be, so its
      // dust is centred on the origin. This is the first frame that has a real
      // camera matrix; fill the box around it in one go, with ages spread across
      // the population so it arrives established rather than all fading in
      // together. Every preset frames a different part of the arena and this is
      // what stops three of them showing dust and five showing none.
      if (!dustSeeded) {
        dustSeeded = true;
        dustAcc = DUST_POPULATION;
        emitAmbient(0, true);
      }

      // Before the integrator, so a droplet born this frame leaves the wound in
      // the same frame rather than sitting on it for one. On `dt` rather than
      // `rawDt`: blood is combat, and hit-stop is meant to hold it.
      stepJets(dt);
      // After the jets, so a droplet born this frame is tested against capsules
      // that are on this frame's transforms rather than the last one's. Skipped
      // entirely when nothing is bleeding and nobody is alight, which is most
      // frames of most matches — the burners want the same capsules the blood
      // does, so nobody pays for a second scan.
      if (stainLive > 0 || burnersLive > 0) refreshBodies();
      // On raw time with the rest of the fire. Hit-stop is a combat effect and a
      // burn is not a blow: freezing a man's flames for the seventieth of a
      // second somebody else got hit is the tell that they are pasted on.
      stepBurners(rawDt, ctx.focus);
      integrate(dt, rawDt);
      stepMotes(rawDt);

      // ---- fire ----
      // A static fire is repacked on a dirty flag and almost never; a burning
      // man moves, so his tongues are repacked every frame he exists. The
      // trailing `burnerTongues` term is the one frame after the last man goes
      // out, which is what takes his flames back out of the layer.
      if (firesDirty || burnersLive > 0 || burnerTongues > 0) rebuildFires();
      const fireU = fireLayer.material.uniforms;
      fireU.uTime.value = clock;
      // Where the ramp above lands on the curve. Everything else about the fire
      // is shape; this is the one number that decides whether it has colour.
      //
      // Down on the last stand rather than up. The pre-v10 line went to 3.8
      // there, which is well past the point where that look reaches display
      // white with a fire hue — so the hottest moment in the game was also the
      // one frame where the fire had no colour left at all. The two looks are
      // graded a long way apart and the emissive has to follow.
      //
      // 2.9 at dusk, not v10's 2.3: v10 cut this at the same time as the inner
      // ring level and the emitter dedup, three levers pulled the same way, and
      // the frame lost its top end (maxLuma down in five presets, tonalBuckets
      // in three). The other two cuts were the right ones. This band is bounded
      // on both sides — over the bright pass's 2.55 gate so the flame can
      // actually bloom, and under the ~3.09 where the re-authored ramp's own hue
      // reaches code 255, which is the headroom that re-author bought. On the
      // last stand the same hue clips at ~1.00 against a 1.30 gate: there is no
      // window there at all, so that end stays where it is.
      fireU.uIntensity.value = 2.9 * (1 - moodHeat * 0.5);
      (fireU.uWind.value as THREE.Vector2).copy(wind);
      if (hazeLayer) {
        hazeLayer.material.uniforms.uTime.value = clock;
        (hazeLayer.material.uniforms.uWind.value as THREE.Vector2).copy(wind);
      }

      emitAmbient(rawDt);
      markGround(ctx);
      kickBootDust(rawDt, ctx);

      // ---- impact flashes ----
      for (const fl of flashes) {
        if (fl.life <= 0) continue;
        fl.age += dt;
        if (fl.age >= fl.life) {
          fl.life = 0;
          fl.light.intensity = 0;
          continue;
        }
        // Squared decay: a struck spark is bright for a moment and then gone,
        // and a linear ramp reads as a lamp being turned down.
        const k = 1 - fl.age / fl.life;
        fl.light.intensity = fl.peak * k * k;
      }

      // ---- write ----
      additiveLayer.begin();
      alphaLayer.begin();
      writeParticles();
      writeMotes();

      // The fire's own halo. It was built because bloom was unreachable — the
      // threshold sat above the point where the grade clipped — and that is no
      // longer true: the gate is 2.55 and the flame runs at 2.9. It stays
      // anyway, because it is the better of the two effects and they stack
      // cleanly. Bloom is isotropic and knows nothing about the source; this is
      // shaped, it breathes on the flame's own clock, it survives on the low
      // tier where the bright pass is dropped entirely, and it costs one quad.
      //
      // A torch gets proportionally far more of it than a bonfire. It is 0.1 m
      // of flame twenty metres away, so on the old `radius * 3.4` its halo was
      // 16 cm across — under a pixel of glow round a flame that had none of its
      // own, which is exactly the "flat white sliver" the portrait and lineup
      // shots show. Its halo is now sized to what a torch lights, not to how big
      // its flame is.
      for (const f of fires) {
        const p = f.spec.position;
        const torch = f.spec.kind === "torch";
        const flick = 0.84 + 0.16 * Math.sin(clock * 9.1 + p.x) * Math.sin(clock * 3.7 + p.z);
        const heat = 1 + moodHeat * 0.3;
        const s = (torch ? Math.max(f.spec.radius * 5.2, 0.44) : f.spec.radius * 3.6) * heat;
        const a = (torch ? 0.4 : 0.3) * flick * heat;
        additiveLayer.push(
          p.x, p.y + f.spec.height * (torch ? 0.42 : 0.55), p.z,
          s, s * 1.15, 0, a,
          PALETTE.fireHalo.r, PALETTE.fireHalo.g, PALETTE.fireHalo.b,
          CELL.glow,
        );
      }

      // The same halo on a burning man, and on the low tier the only light he
      // gets. It is what makes him read as *lit* rather than as flame stickers
      // at the range a phone actually plays the game at: a metre of soft glow
      // survives being twenty pixels tall, and seven individual tongues do not.
      for (const b of burners) {
        if (!b.active || !b.placed || b.flame <= 0.02) continue;
        const flick = 0.8 + 0.2 * Math.sin(clock * 12.0 + b.seed) * Math.sin(clock * 4.4 + b.seed * 3.0);
        const s = (0.78 + b.inside * 0.5) * (0.6 + b.flame * 0.4);
        additiveLayer.push(
          b.ax + (b.bx - b.ax) * 0.62,
          b.ay + (b.by - b.ay) * 0.62,
          b.az + (b.bz - b.az) * 0.62,
          s, s * 1.15, 0,
          0.26 * b.flame * flick * (1 + b.inside * 0.3),
          PALETTE.fireHalo.r, PALETTE.fireHalo.g, PALETTE.fireHalo.b,
          CELL.glow,
        );
      }

      additiveLayer.end();
      alphaLayer.end();
      if (ribbonMat) ribbonMat.uniforms.uScroll.value = clock * 1.6;
      writeRibbons(dt);
      writeDecals(rawDt);
      writeBodyMarks(rawDt);
      writeRings(dt);
    },

    dispose() {
      // Nothing here may outlive the match. Every buffer, program and texture
      // this module made is released, and the pools are emptied so a second
      // match starts on an empty arena rather than on the last one's blood.
      store.n = 0;
      ambientLive = 0;
      stainLive = 0;
      dustSeeded = false;
      groundMarked = false;
      haveFocus = false;
      // Jets before anything else: each one holds a node out of a warrior rig,
      // and a stopped match whose blood still points at a disposed skeleton is
      // the leak this module is most likely to have.
      for (const j of jets) {
        j.active = false;
        j.anchor = null;
      }
      jetsLive = 0;
      // Body marks hold rig nodes for the same reason jets do, and drop them
      // for the same reason: a stopped match must not leave this module pointing
      // into a disposed skeleton.
      for (const m of bodyMarks) { m.life = 0; m.anchor = null; m.owner = null; }
      bodies.length = 0;
      bodyHost = null;
      for (const d of decals) d.active = false;
      rings.length = 0;
      fires.length = 0;
      auraSites.length = 0;
      // Burners hold no rig node — they look one up by id every frame — so this
      // is only about the next match not opening with the last one's men still
      // alight, and about the lights going with their pool.
      for (const b of burners) {
        b.active = false; b.id = ""; b.alight = false;
        b.flame = 0; b.tail = 0; b.placed = false; b.want = 0; b.score = 0;
      }
      burnersLive = 0;
      burnerTongues = 0;
      for (let i = 0; i < burnLights.length; i++) {
        root.remove(burnLights[i]);
        burnLights[i].dispose();
        burnLightOwner[i] = null;
        burnLightPick[i] = null;
      }
      burnLights.length = 0;
      for (const f of flashes) {
        root.remove(f.light);
        f.light.dispose();
      }
      flashes.length = 0;
      if (ribbonMesh) root.remove(ribbonMesh);
      ribbonGeo.dispose();
      ribbonMat?.dispose();
      additiveLayer.dispose();
      alphaLayer.dispose();
      ringLayer.dispose();
      decalLayer.dispose();
      bodyLayer.dispose();
      fireLayer.dispose();
      hazeLayer?.dispose();
      atlas.dispose();
      stainAtlas.dispose();
      noise.dispose();
      scene.remove(root);
      root.clear();
    },
  };
}
