// Fire, smoke, impacts, blade trails, decals and the air itself.
//
// Every effect in the game is one of five instanced-quad layers, a fire layer
// and a ribbon buffer, and each one is allocated once at build time. Nothing
// here creates a geometry or a material per burst — the module this replaces
// built a `THREE.Points` and a `PointsMaterial` for every blow that landed, so
// a brawl allocated and disposed forty shader-bearing objects a second and the
// collector was visible in the frame time.
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
}

export interface VfxHandle {
  readonly root: THREE.Group;
  /** Live particle count, for anyone who wants to know what the budget is doing. */
  readonly liveParticles: number;
  burst(opts: BurstOptions): void;
  /** A blade tip mid-arc. Successive calls that stay close become one ribbon. */
  trail(opts: BurstOptions): void;
  /** Hang fire on something. Returns an id for `removeFire`. */
  addFire(spec: FireSpec): number;
  removeFire(id: number): void;
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

function buildAtlas(cellSize: number, aniso: number): THREE.DataTexture {
  const edge = cellSize * TILES;
  const data = new Uint8Array(edge * edge * 4);
  const inv = 1 / cellSize;
  for (let cell = 0; cell < TILES * TILES; cell++) {
    const cx = (cell % TILES) * cellSize;
    const cy = Math.floor(cell / TILES) * cellSize;
    const fn = CELL_ALPHA[cell];
    for (let y = 0; y < cellSize; y++) {
      for (let x = 0; x < cellSize; x++) {
        // Evaluated over a slightly wider domain than the cell, so every shape
        // finishes at zero with a texel or two of margin for the mip chain.
        const u = ((x + 0.5) * inv - 0.5) * 1.26 + 0.5;
        const v = ((y + 0.5) * inv - 0.5) * 1.26 + 0.5;
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
  tex.name = "vfx:atlas";
  tex.needsUpdate = true;
  return tex;
}

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
// Linear radiance throughout. The bloom threshold these numbers used to quote —
// 2.15 — has not been the threshold for three iterations; it is 5.0 at dusk and
// 6.0 on the last stand, which is *above* the 4.07 point where the dusk grade
// already clips. Nothing in this list can therefore both bloom and keep its
// colour, so the list stops trying: everything hot sits in the 1.6–4.4 band
// where the curve still has slope, and the one exception is a struck spark,
// which is genuinely white-hot metal and is allowed to blow.
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
  // Runekeeper: glyphs orbiting the body, spinning on their own axis.
  [0x9a55ff, { cell: CELL.rune, color: linear(0xa96bff, 2.6), ring: 0.7, swirl: 2.6, rise: 1.0, size: 0.3, spin: 2.2, shock: 3.0 }],
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
  x: number; y: number; z: number;
  size: number; rot: number;
  age: number; life: number;
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

  const atlas = buildAtlas(Math.max(32, settings.spriteSize), textures.maxAnisotropy);
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
  // Blood on the ground borrows the texture library's splat rather than adding a
  // seventeenth atlas cell: it is already built, already cached, and its ragged
  // edge with the one thrown satellite droplet is exactly right.
  const decalLayer = new QuadLayer(Math.max(1, settings.decalBudget), textures.sprite("splat"), 1, 2, "multiply", 1);

  const FIRE_CAPACITY = tier === "high" ? 128 : tier === "medium" ? 96 : 48;
  const fireLayer = new FireLayer(FIRE_CAPACITY, FIRE_FRAG, noise, 6);
  // Haze is the one thing in this module that is an effect rather than art
  // direction, so it is the one thing the lower tiers drop: the fire is fully
  // legible without it, and without a scene-colour tap it is half an effect
  // anyway.
  const hazeLayer = tier === "high" ? new FireLayer(8, HAZE_FRAG, noise, 5) : null;
  if (hazeLayer) hazeLayer.material.uniforms.uIntensity.value = 0.03;

  root.add(decalLayer.mesh, ringLayer.mesh, alphaLayer.mesh, additiveLayer.mesh, fireLayer.mesh);
  if (hazeLayer) root.add(hazeLayer.mesh);

  // ---- particles ----------------------------------------------------------
  const store = makeStore(budget);
  /** Fire-borne particles are capped below the budget so a bonfire burning for
   *  ten minutes can never crowd out the sparks off a parry. */
  const ambientCap = Math.floor(budget * 0.45);
  let ambientLive = 0;

  function spawn(s: Seed): boolean {
    if (store.n >= store.cap) return false;
    if (s.flags & F_AMBIENT) {
      if (ambientLive >= ambientCap) return false;
      ambientLive++;
    }
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

  function kill(i: number): void {
    if (store.flags[i] & F_AMBIENT) ambientLive--;
    const last = --store.n;
    if (i !== last) {
      for (const f of STORE_FIELDS) store[f][i] = store[f][last];
      store.flags[i] = store.flags[last];
    }
  }

  // ---- decals -------------------------------------------------------------
  const decalCap = Math.max(1, settings.decalBudget);
  const decals: Decal[] = [];

  function addDecal(x: number, z: number, size: number, life = 26, age = 0): void {
    const d: Decal = {
      x, y: groundAt(x, z) + 0.015, z,
      size, rot: Math.random() * TAU,
      age, life,
    };
    decals.push(d);
    // Oldest out. A ring buffer would be tidier if decals only ever expired by
    // age, but they also expire by time and the two indices drift apart.
    while (decals.length > decalCap) decals.shift();
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
    fires.push({ id, spec, emberAcc: 0, smokeAcc: 0 });
    firesDirty = true;
    return id;
  }

  function removeFire(id: number): void {
    const i = fires.findIndex((f) => f.id === id);
    if (i >= 0) { fires.splice(i, 1); firesDirty = true; }
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
          height * (1 - ring * 0.22) * rand(0.85, 1.15),
          (i * 0.618) % 1,
          i * 1.37 + f * 5.1,
          temp * (1 - ring * 0.08),
          FLAME_RATE[kind] * rand(0.85, 1.15),
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
    fireLayer.end();
    hazeLayer?.end();
    firesDirty = false;
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

  function bloodSpray(x: number, y: number, z: number, count: number, spread: number, up: number, tint: THREE.Color): void {
    // One throw direction for the whole spray, so it reads as a wound opening
    // rather than as an explosion of red dots.
    const a = Math.random() * TAU;
    const ax = Math.cos(a);
    const az = Math.sin(a);
    for (let i = 0; i < count; i++) {
      const speed = rand(1.8, 6.5) * spread;
      const fan = rand(0.35, 1);
      spawn({
        x, y: y + sym(0.12), z,
        vx: (ax * fan + sym(0.55)) * speed,
        vy: rand(0.35, 1.15) * speed * 0.55 * up,
        vz: (az * fan + sym(0.55)) * speed,
        life: rand(0.55, 1.25),
        size0: rand(0.05, 0.13), size1: rand(0.03, 0.07),
        aspect: 2.2,
        c0: tint, c1: PALETTE.bloodDark,
        alpha: 0.95, fadeIn: 0.01, fadePow: 0.6,
        drag: 0.45, grav: 19, frame: CELL.drop,
        flags: F_ALIGN | F_STAIN | F_ALPHA,
      });
    }
    // Fine mist hangs where the blow landed after the heavy drops have gone.
    for (let i = 0; i < Math.max(2, count >> 2); i++) {
      spawn({
        x, y, z,
        vx: sym(1.4), vy: rand(0.2, 1.5), vz: sym(1.4),
        life: rand(0.35, 0.7),
        size0: rand(0.1, 0.2), size1: rand(0.24, 0.42),
        c0: PALETTE.mist, c1: PALETTE.bloodDark,
        alpha: 0.34, fadeIn: 0.08, fadePow: 1.6,
        drag: 3.2, grav: 2.5, frame: CELL.soft,
        flags: F_ALPHA | F_WIND,
      });
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
        // The call site's colour carries which blow this was — a fresh cut is
        // brighter than a killing one — but it is pulled most of the way to the
        // palette's arterial red, because #d42a1a taken at face value is a
        // primary and blood at dusk is not.
        bloodSpray(x, y, z, count, spread, up,
          tmpColor.setHex(o.color, THREE.SRGBColorSpace).lerp(PALETTE.bloodFresh, 0.7).clone());
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
            if (speed > 1.2 && Math.random() < 0.34) addDecal(px, pz, rand(0.18, 0.42));
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
    for (let i = decals.length - 1; i >= 0; i--) {
      const d = decals[i];
      d.age += dt;
      if (d.age >= d.life) { decals.splice(i, 1); continue; }
      const t = d.age / d.life;
      // The multiply tint *is* the stain: fresh blood takes the ground down to a
      // fifth of its red and almost none of its green, and as it dries it lets
      // more through and browns toward the turf.
      const dry = t * 0.55;
      const a = 0.95 * (1 - clamp01((t - 0.6) / 0.4));
      decalLayer.push(
        d.x, d.y, d.z, d.size, d.size, d.rot, a,
        0.22 + dry * 0.5, 0.05 + dry * 0.42, 0.05 + dry * 0.34,
        0,
      );
    }
    decalLayer.end();
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

    addFire,
    removeFire,

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

      integrate(dt, rawDt);
      stepMotes(rawDt);

      // ---- fire ----
      if (firesDirty) rebuildFires();
      const fireU = fireLayer.material.uniforms;
      fireU.uTime.value = clock;
      // Where the ramp above lands on the curve. Everything else about the fire
      // is shape; this is the one number that decides whether it has colour.
      //
      // 2.3, and *down* on the last stand rather than up. The old line went to
      // 3.8 there, which is half a stop past the point where that look reaches
      // display white with a neutral — so the hottest moment in the game was
      // also the one frame where the fire had no colour left at all. The two
      // looks are graded a long way apart and the emissive has to follow.
      fireU.uIntensity.value = 2.3 * (1 - moodHeat * 0.37);
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

      // The fire's own halo, and the only thing in the frame doing the job that
      // bloom cannot. Bloom needs 5.0 scene units and the grade clips at 4.07, so
      // there is no radiance at which a flame both glows and keeps its hue — an
      // authored halo is what is left, and it is better anyway: it is shaped, it
      // breathes on the flame's own clock, and it costs one quad.
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

      additiveLayer.end();
      alphaLayer.end();
      if (ribbonMat) ribbonMat.uniforms.uScroll.value = clock * 1.6;
      writeRibbons(dt);
      writeDecals(rawDt);
      writeRings(dt);
    },

    dispose() {
      // Nothing here may outlive the match. Every buffer, program and texture
      // this module made is released, and the pools are emptied so a second
      // match starts on an empty arena rather than on the last one's blood.
      store.n = 0;
      ambientLive = 0;
      dustSeeded = false;
      groundMarked = false;
      haveFocus = false;
      decals.length = 0;
      rings.length = 0;
      fires.length = 0;
      auraSites.length = 0;
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
      fireLayer.dispose();
      hazeLayer?.dispose();
      atlas.dispose();
      noise.dispose();
      scene.remove(root);
      root.clear();
    },
  };
}
