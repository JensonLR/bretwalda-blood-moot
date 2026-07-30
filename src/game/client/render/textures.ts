// Procedural PBR texture generation and cache.
//
// Nothing here is downloaded. Every map is computed into a DataTexture at
// runtime out of a small bank of shared noise fields, so the game stays a
// single instant-play link with no download step.
//
// Against VISUAL-BAR §4's ~250 ms / ~40 MB: all nineteen surfaces at the high
// tier come to 28 MB, comfortably inside, and memory has not moved in a while —
// it is a function of the tier's resolutions and nothing else. Time is the
// tighter one. Twelve surfaces are what materials.ts's catalog and world.ts's
// tinted() calls actually pull while the arena is being built, and that set is
// what the load-time budget means; the other seven are characters and decals and
// cost nothing until something asks. Measured on the capture box, which runs
// roughly 1.8x a mid laptop, the arena's twelve are ~490 ms — call it 270 ms on
// the laptop the budget is written against, of which the shared noise bank is a
// third and three `hero` surfaces are another third. The filter chain that
// band-limits the height and anti-aliases the roughness adds 45 ms of that on the
// capture box, ~25 ms on the laptop, and it is not optional — see the note on
// Nyquist below. The hand-built ORM mip chain (`ormMips`) adds ~30 ms more on the
// capture box, ~17 ms on the laptop, and only for the substances under
// `MIP_AA_CEILING` — of the arena's twelve that is steel, iron and bronze, three
// surfaces rather than twelve, which is why it fits at all. Mail and skin pay it
// too, but on the first warrior rather than on the arena.
//
// If that has to come down the levers, in order, are: drop `hero` to the prop
// resolution (a straight 4x on the three biggest), then halve the prop size,
// then cut an octave from `ridge`. What is *not* a lever is tap count in the
// ground recipes — a tap is about 4 ms per prop-sized surface here, and the
// difference between six of them and nine is the difference between a floor that
// reads as turf and the field of pale grit the v2 capture scored as AstroTurf.
// Nor is the filter chain, for the same kind of reason: what it buys is the
// difference between wet ground and a field of glitter.
//
// The rule that makes a surface read as a *substance* rather than as three
// unrelated images: albedo, normal, roughness and AO all come off the SAME
// height field. Normals are Sobel-derived from it, AO is that field's cavity
// term, and the albedo darkens and dirties where the field is low. Break that
// coherence and the frame goes straight to plastic.
//
// Channel packing follows the ORM convention three already reads — AO in .r,
// roughness in .g, metalness in .b — so one texture fills three material slots
// and costs one upload instead of three.
//
// Two invariants every recipe obeys, because breaking either shows up as a
// seam on a tiling surface:
//   - noise fields are only ever sampled at INTEGER scales (offsets are free,
//     including the spatially varying ones domain warping adds);
//   - anything hashed off a cell index wraps that index before hashing.
//
// And one more that the ground made necessary. A tile whose energy sits at its
// own fundamental — one big blotch, one dark streak, one cluster of pale pebbles
// — hands the eye a landmark, and a landmark seen twice is a visible repeat.
// This module hands back a texture, so it cannot detile at draw time with a
// hex-tile or stochastic lookup; its detiling has to be spectral. So the maps
// that tile tightest deliberately carry almost nothing at the tile scale:
// everything that varies varies at fourteen cells per tile or finer, and the
// lattice those cells sit on is domain-warped by most of a cell so it does not
// show either. Macro variation is the terrain's job — the vertex colours and
// world.ts's long-wavelength blend are both wider than any tile and so cannot
// repeat. The arena floor repeats every 1.6 m and the turf structure every
// 1.4 m; neither is legible, and that is the test.
//
// The other end of the spectrum has a rule of its own, and the v3 capture is why.
// Recipes tap the bank wherever the substance wants detail, and several of those
// taps land past the output's Nyquist — `fine` at nine on a 256² map puts 2.25 of
// its finest cells inside one texel, so two thirds of what it returns is
// uncorrelated from one texel to the next. In the albedo that is dither and it
// mips away. In the *height* field it is a disaster: `deriveNormal` turns
// uncorrelated neighbours into a per-texel random tilt, the arena floor came back
// with per-texel slopes up to 70°, and a randomly tilted dielectric at a grazing
// angle returns most of the sky. That is the salt the v3 capture scattered across
// the moot — single-texel sky reflections, clipped, each one smeared to four or
// five pixels by the bloom pass. So: **nothing above Nyquist reaches a normal
// map**. `bandLimit` deletes that band before the Sobel sees it and
// `slopeVariance` folds what it removed into roughness, which is where relief
// finer than a texel physically belongs. A recipe is free to tap as fine as it
// likes; the pipeline is what keeps that honest.
//
// That rule holds for mip 0. Every coarser level has its own Nyquist and the same
// disaster waiting behind it, and a GPU box filter honours neither: it averages
// the normals — which is right — and leaves the roughness beside them alone,
// which is not. Thirty mail rings inside one pixel are a rough metal, not a
// polished one that happens to be small, and `art/shots/v4/portrait.png` is what
// the difference looks like: the huscarl's coif came back as blue glitter beside
// his face while the hauberk two hundred texels lower, at mip 0, read perfectly.
// So `ormMips` builds the packed map's chain here rather than on the GPU, and each
// level's roughness answers for the normals that level threw away. See `MIP_AA`.

import * as THREE from "three";
import type { QualitySettings } from "./quality";

/** Named substances. The last four are aliases kept for the original call sites. */
export type SurfaceName =
  // metal
  | "mail"      // riveted 4-in-1, over a padded gambeson
  | "iron"      // forged and blackened, hammer-planished
  | "steel"     // polished, pattern-welded, ground
  | "bronze"    // sand-cast, verdigris in the cavities
  // cloth and hide
  | "wool"      // coarse plain weave, fibrous
  | "linen"     // fine plain weave with slubs
  | "leather"   // tanned hide: pebbled grain and stretch creases
  | "rope"      // three-strand twisted hemp
  // timber and roof
  | "oak"       // flat-sawn cathedral figure with knots
  | "plank"     // the same board, weathered grey and split
  | "thatch"    // bundled straw in courses
  // ground
  | "granite"   // crystalline, quartz/feldspar/mica
  | "dirt"      // packed earth with pebbles and drying cracks
  | "groundDetail" // the same field, pale, for multiplying over vertex colours
  | "mud"       // churned and wet — roughness is the whole trick
  | "grass"     // trampled turf, soil showing through
  // organic
  | "skin"
  | "bone"
  | "blood"     // cutout decal: alpha in the albedo
  // aliases
  | "ground"    // -> dirt
  | "wood"      // -> oak
  | "stone"     // -> granite
  | "cloth";    // -> wool

/** Named particle / billboard sprites. */
export type SpriteName =
  | "soft"   // round falloff — dust, motes, blood droplets
  | "spark"  // hot core with a tight halo
  | "smoke"  // wide, low-contrast, irregular puff
  | "flame"  // teardrop, white core through amber to red
  | "splat"; // ragged blood blob

export interface TextureSet {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  /** Packed ORM. Same instance as aoMap and metalnessMap — three reads .g here. */
  roughnessMap?: THREE.Texture;
  /** Packed ORM, read from .b. */
  metalnessMap?: THREE.Texture;
  /** Packed ORM, read from .r. */
  aoMap?: THREE.Texture;
}

/** What the substance is, independent of any mesh that wears it. */
export interface SurfaceInfo {
  /**
   * Mean linear colour of the albedo. materials.ts divides a requested tint by
   * this, so `map × color` averages out to exactly the colour that was asked
   * for — which is how the arena's existing palette survives being textured.
   */
  readonly mean: readonly [number, number, number];
  /** The colour this map was drawn around. */
  readonly tint: number;
  /** Fallback scalars for the low tier, which does not carry the ORM map. */
  readonly roughness: number;
  readonly metalness: number;
  readonly normalScale: number;
  readonly aoIntensity: number;
  /** UV repeats the pattern was drawn for, over one tile of the mesh's own UVs. */
  readonly repeat: number;
  /** Albedo carries coverage in alpha; the material has to be transparent. */
  readonly cutout: boolean;
}

export interface TextureLibrary {
  /** Anisotropy every generated map uses — the tier cap clamped to the GPU's. */
  readonly maxAnisotropy: number;
  /** Milliseconds spent generating so far. VISUAL-BAR §4 budgets ~250 ms. */
  readonly generationMs: number;
  /** Estimated GPU bytes held, mips included. §4 budgets ~40 MB. */
  readonly bytes: number;
  /** PBR maps for a surface, at the tiling it was drawn for. */
  surface(name: SurfaceName): TextureSet;
  /**
   * The same maps at a different tiling. three keys its texture cache on
   * `Texture.source`, which a clone shares, so this costs a few JS objects and
   * no extra GPU memory — only the repeat uniform differs.
   */
  tiled(name: SurfaceName, repeatX: number, repeatY?: number): TextureSet;
  /** Art direction that belongs to the substance rather than to a mesh. */
  info(name: SurfaceName): SurfaceInfo;
  sprite(name: SpriteName): THREE.Texture;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Maths
// ---------------------------------------------------------------------------

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const frac = (x: number) => x - Math.floor(x);
const wrapi = (i: number, n: number) => ((i % n) + n) % n;
/** Tolerates e0 > e1, which is how a "wetter the lower it gets" mask is written. */
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
/** 0..1 triangle wave, period 1. */
const tri = (x: number) => Math.abs(2 * (x - Math.floor(x + 0.5)));

/**
 * Expands an fBm's usable range about its midpoint.
 *
 * `soft` is five octaves and `grain` is three, each normalised by the sum of its
 * amplitudes, so their values pile up hard around 0.5 — the effective range of
 * `soft` is roughly 0.3 to 0.7, not 0 to 1. Anything driven straight off one
 * therefore swings about a third as far as its constants read like it should,
 * and that is most of the story of why the broad tonal variation across this
 * library was invisible in the v2 capture: the numbers all looked generous. Any
 * term used as a *broad modulator* rather than as a mask wants this on the way
 * in. Masks do not, because a smoothstep is already a remap.
 */
const contrast = (x: number, k: number) => clamp01((x - 0.5) * k + 0.5);

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-texel white noise. Cheap enough to call inside a pixel loop. */
function hash2(x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ 0x27d4eb2f) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Noise toolkit
//
// Everything is tileable and everything is built by upsampling a small random
// lattice rather than by hashing per texel. That ordering is the difference
// between 3 ms and 40 ms an octave, and it is why the whole bank fits in the
// budget with room left for the surfaces.
// ---------------------------------------------------------------------------

interface Field { readonly size: number; readonly data: Float32Array; }
interface CellField { readonly size: number; readonly dist: Float32Array; readonly id: Float32Array; }

const quintic = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

function valueOctave(out: Float32Array, size: number, cells: number, amp: number, rng: Rng): void {
  const lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = rng();

  // Column weights are the same for every row, so they are resolved once.
  const cx0 = new Int32Array(size);
  const cx1 = new Int32Array(size);
  const ctx = new Float32Array(size);
  const k = cells / size;
  for (let x = 0; x < size; x++) {
    const fx = x * k;
    const ix = Math.floor(fx);
    cx0[x] = wrapi(ix, cells);
    cx1[x] = wrapi(ix + 1, cells);
    ctx[x] = quintic(fx - ix);
  }

  for (let y = 0; y < size; y++) {
    const fy = y * k;
    const iy = Math.floor(fy);
    const ty = quintic(fy - iy);
    const r0 = wrapi(iy, cells) * cells;
    const r1 = wrapi(iy + 1, cells) * cells;
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const x0 = cx0[x];
      const x1 = cx1[x];
      const tx = ctx[x];
      const a = lat[r0 + x0];
      const b = lat[r1 + x0];
      const top = a + (lat[r0 + x1] - a) * tx;
      const bot = b + (lat[r1 + x1] - b) * tx;
      out[row + x] += amp * (top + (bot - top) * ty);
    }
  }
}

/**
 * fBm of tileable value noise, normalised to 0..1.
 *
 * `cells` is a lattice node count, and a recipe reading it as a feature count is
 * the single most expensive misreading available in this file. An N-node lattice
 * can only carry frequencies up to N/2, and the fBm's first octave takes the
 * whole amplitude, so what a field's *dominant* term costs is one cycle per
 * lattice-period at the coarsest octave — not `cells` of them. `soft` is built at
 * three nodes: its peak is at ONE cycle across the field, so a `u * 4` tap peaks
 * at four cycles across the tile and not at twelve. That factor of `cells` is why
 * a dye field the comments described as landing well inside the detiling rule was
 * in fact sitting three octaves below it, drawing a four-cell grid on every
 * garment in the frame. Multiply a tap scale out to cycles-per-tile before
 * trusting it, and remember `grain` peaks at six, `warp` at four, `fine` at
 * sixteen and `ridge` at two.
 */
function valueNoise(size: number, cells: number, octaves: number, gain: number, rng: Rng): Field {
  const data = new Float32Array(size * size);
  let amp = 1;
  let sum = 0;
  let c = cells;
  for (let o = 0; o < octaves && c <= size; o++) {
    valueOctave(data, size, c, amp, rng);
    sum += amp;
    amp *= gain;
    c *= 2;
  }
  const inv = 1 / (sum || 1);
  for (let i = 0; i < data.length; i++) data[i] *= inv;
  return { size, data };
}

/** Ridged multifractal — the creases, cracks and fracture lines of the set. */
function ridgedNoise(size: number, cells: number, octaves: number, rng: Rng): Field {
  const data = new Float32Array(size * size);
  const scratch = new Float32Array(size * size);
  let amp = 1;
  let sum = 0;
  let c = cells;
  for (let o = 0; o < octaves && c <= size; o++) {
    scratch.fill(0);
    valueOctave(scratch, size, c, 1, rng);
    for (let i = 0; i < data.length; i++) {
      const v = 1 - Math.abs(scratch[i] * 2 - 1);
      data[i] += amp * v * v;
    }
    sum += amp;
    amp *= 0.5;
    c *= 2;
  }
  const inv = 1 / (sum || 1);
  for (let i = 0; i < data.length; i++) data[i] = clamp01(data[i] * inv);
  return { size, data };
}

/** Tileable cellular noise. `dist` is F1 in cell units; `id` identifies the cell. */
function worley(size: number, cells: number, jitter: number, rng: Rng): CellField {
  const n = cells * cells;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const pid = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = 0.5 + (rng() - 0.5) * jitter;
    py[i] = 0.5 + (rng() - 0.5) * jitter;
    pid[i] = rng();
  }
  const dist = new Float32Array(size * size);
  const id = new Float32Array(size * size);
  const k = cells / size;
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) * k;
    const cy = Math.floor(v);
    const row = y * size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) * k;
      const cx = Math.floor(u);
      let best = 1e9;
      let bid = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const gy = cy + oy;
        // gy is only ever one step outside the grid, so one branch beats a modulo.
        const wy = (gy < 0 ? gy + cells : gy >= cells ? gy - cells : gy) * cells;
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox;
          const idx = wy + (gx < 0 ? gx + cells : gx >= cells ? gx - cells : gx);
          const dx = gx + px[idx] - u;
          const dy = gy + py[idx] - v;
          const d = dx * dx + dy * dy;
          if (d < best) { best = d; bid = pid[idx]; }
        }
      }
      dist[row + x] = Math.min(1, Math.sqrt(best));
      id[row + x] = bid;
    }
  }
  return { size, dist, id };
}

/**
 * Wrapping bilinear tap, and by some distance the hottest function in the file
 * — every recipe calls it several times per texel. Field sizes are powers of
 * two so the wrap is a mask rather than a modulo, which is worth roughly an
 * order of magnitude here. Only ever call it at integer scales, or the tile
 * seams; u and v must be non-negative.
 */
function tap(d: Float32Array, s: number, u: number, v: number): number {
  const mask = s - 1;
  const fx = u * s;
  const fy = v * s;
  const ix = fx | 0;
  const iy = fy | 0;
  const tx = fx - ix;
  const ty = fy - iy;
  const x0 = ix & mask;
  const x1 = (ix + 1) & mask;
  const y0 = (iy & mask) * s;
  const y1 = ((iy + 1) & mask) * s;
  const a = d[y0 + x0];
  const b = d[y1 + x0];
  const top = a + (d[y0 + x1] - a) * tx;
  const bot = b + (d[y1 + x1] - b) * tx;
  return top + (bot - top) * ty;
}

const sampleField = (f: Field, u: number, v: number) => tap(f.data, f.size, u, v);
const sampleCell = (f: CellField, u: number, v: number) => tap(f.dist, f.size, u, v);

/** Nearest cell id — deliberately not interpolated, it is an identifier. */
function sampleCellId(f: CellField, u: number, v: number): number {
  const s = f.size;
  const mask = s - 1;
  return f.id[(((v * s) | 0) & mask) * s + (((u * s) | 0) & mask)];
}

interface Bank {
  soft: Field;      // broad blotches — weathering, damp, dye unevenness
  grain: Field;     // mid tooth
  fine: Field;      // near-texel detail
  ridge: Field;     // cracks, creases, fractures
  cell: CellField;  // pebbles, crystals, hammer facets
  micro: CellField; // pores, pits, speckle
  warp: Field;      // mid-scale displacement — see warpUV
}

function createBank(size: number, seed: number): Bank {
  const rng = mulberry32(seed);
  return {
    soft: valueNoise(size, 3, 5, 0.5, rng),
    grain: valueNoise(size, 12, 3, 0.55, rng),
    fine: valueNoise(size, 32, 2, 0.6, rng),
    ridge: ridgedNoise(size, 4, 4, rng),
    cell: worley(size, 14, 0.85, rng),
    micro: worley(size, 44, 0.9, rng),
    // Two octaves is enough: a warp field wants to be smooth. Appended last so
    // adding it did not renumber the random stream every other surface draws on.
    warp: valueNoise(size, 8, 2, 0.5, rng),
  };
}

/** Output of `warpUV`: u in [0], v in [1]. Same reasoning as `RAMP`. */
const WARP = new Float32Array(2);

/**
 * Domain warp — displaces a sample point by a smooth mid-scale field. This is
 * the cheapest thing in the file that takes the *lattice* out of a
 * lattice-built pattern: a weave stops being graph paper, a blade grid stops
 * reading as a grid of dots, and the straight rows an eye measures a repeat by
 * stop existing. The warp field tiles, and its value at u = 0 and u = 1 is
 * therefore identical, so warped sampling still tiles — that is why this is
 * legal under the integer-scale invariant and a hand-written offset would not
 * be. The +4 only keeps the argument non-negative for `tap`.
 *
 * One tap, and the displacement therefore runs along a fixed diagonal rather
 * than in an arbitrary direction. A true 2D warp costs two taps, and a tap is
 * the currency the generation budget is actually spent in — nine of them per
 * texel across the arena's twelve surfaces is measurable where the difference
 * between a sheared lattice and a displaced one is not.
 */
function warpUV(bank: Bank, u: number, v: number, amp: number): void {
  const w = (sampleField(bank.warp, u + 4, v + 4) - 0.5) * amp;
  WARP[0] = u + w;
  WARP[1] = v - w * 0.74;
}

// ---------------------------------------------------------------------------
// Colour, all in sRGB 0..1 because that is the space the palette was authored
// in and the space the byte texture stores.
// ---------------------------------------------------------------------------

type RGB = readonly [number, number, number];
/** Any three numbers: a `col()` constant, or `RAMP` after a `ramp()` call. */
type RGBLike = ArrayLike<number>;
const col = (hex: number): RGB => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

function set(c: Float32Array, i: number, a: RGBLike): void {
  const j = i * 3;
  c[j] = a[0]; c[j + 1] = a[1]; c[j + 2] = a[2];
}
function mix(c: Float32Array, i: number, a: RGBLike, b: RGBLike, t: number): void {
  const j = i * 3;
  c[j] = a[0] + (b[0] - a[0]) * t;
  c[j + 1] = a[1] + (b[1] - a[1]) * t;
  c[j + 2] = a[2] + (b[2] - a[2]) * t;
}
function toward(c: Float32Array, i: number, b: RGBLike, t: number): void {
  if (t <= 0) return;
  const j = i * 3;
  c[j] += (b[0] - c[j]) * t;
  c[j + 1] += (b[1] - c[j + 1]) * t;
  c[j + 2] += (b[2] - c[j + 2]) * t;
}
function gain(c: Float32Array, i: number, k: number): void {
  const j = i * 3;
  c[j] = clamp01(c[j] * k);
  c[j + 1] = clamp01(c[j + 1] * k);
  c[j + 2] = clamp01(c[j + 2] * k);
}

/**
 * Scratch for `ramp`. Module-level because generation is synchronous and single
 * threaded, and a Float32Array per texel is the one allocation that would show
 * up in the budget.
 */
const RAMP = new Float32Array(3);

/**
 * Piecewise ramp through a list of stops. Two colours lerped is what makes a
 * substance read as one colour with noise on it; turf runs cool green → warm
 * green → straw → dead brown, and mud runs black water → wet → damp → drying →
 * crust, and neither of those is a line between two points.
 */
function ramp(stops: readonly RGBLike[], t: number): void {
  const n = stops.length - 1;
  const x = clamp01(t) * n;
  const k = Math.min(n - 1, x | 0);
  const f = x - k;
  const a = stops[k];
  const b = stops[k + 1];
  RAMP[0] = a[0] + (b[0] - a[0]) * f;
  RAMP[1] = a[1] + (b[1] - a[1]) * f;
  RAMP[2] = a[2] + (b[2] - a[2]) * f;
}

// ---------------------------------------------------------------------------
// Generation scratch
// ---------------------------------------------------------------------------

interface Gen {
  readonly size: number;
  readonly bank: Bank;
  readonly rng: Rng;
  /** Height, 0..1. Normal and AO are both derived from this and nothing else. */
  readonly h: Float32Array;
  readonly r: Float32Array;
  readonly m: Float32Array;
  /** sRGB albedo, three floats per texel. */
  readonly c: Float32Array;
  /** Coverage. Allocated only for cutout surfaces. */
  readonly a: Float32Array | null;
}

function forEachTexel(size: number, fn: (i: number, u: number, v: number) => void): void {
  const inv = 1 / size;
  let i = 0;
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) * inv;
    for (let x = 0; x < size; x++, i++) fn(i, (x + 0.5) * inv, v);
  }
}

/** Separable wrapping box blur. Only used to get the low-frequency height. */
function boxBlur(src: Float32Array, size: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const mask = size - 1; // every generated map is power-of-two sized
  const inv = 1 / (radius * 2 + 1);
  for (let y = 0; y < size; y++) {
    const row = y * size;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[row + (k & mask)];
    for (let x = 0; x < size; x++) {
      tmp[row + x] = sum * inv;
      sum += src[row + ((x + radius + 1) & mask)] - src[row + ((x - radius) & mask)];
    }
  }
  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += tmp[(k & mask) * size + x];
    for (let y = 0; y < size; y++) {
      out[y * size + x] = sum * inv;
      sum += tmp[((y + radius + 1) & mask) * size + x] - tmp[((y - radius) & mask) * size + x];
    }
  }
  return out;
}

/**
 * Cavity AO: how far below its own neighbourhood a texel sits. Coming off the
 * same height field as the normal map is the whole point — an AO map that
 * disagrees with the normals reads as dirt painted on, not as occlusion.
 */
function deriveAo(h: Float32Array, size: number, strength: number): Float32Array {
  const wide = boxBlur(h, size, Math.max(1, size >> 5));
  const tight = boxBlur(h, size, Math.max(1, size >> 7));
  const ao = new Float32Array(h.length);
  for (let i = 0; i < h.length; i++) {
    const deep = Math.max(0, wide[i] - h[i]) * 2.6 + Math.max(0, tight[i] - h[i]) * 1.4;
    ao[i] = clamp01(1 - strength * deep);
  }
  return ao;
}

/**
 * Scratch for the filter passes below. Module level for the same reason `RAMP`
 * is: generation is synchronous and single threaded, and a 512² Float32Array per
 * pass per surface is real cost — six megabytes of short-lived garbage on every
 * hero surface, which the frame after the build is the one that pays for it.
 */
const FILTER_SCRATCH: Float32Array[] = [];
function scratch(slot: number, n: number): Float32Array {
  let a = FILTER_SCRATCH[slot];
  if (!a || a.length < n) { a = new Float32Array(n); FILTER_SCRATCH[slot] = a; }
  return a;
}

/**
 * Deletes the band a texel cannot carry, and nothing wider.
 *
 * A [1,2,1]² binomial is the right filter here rather than a compromise: its
 * response is exactly zero at Nyquist and -6 dB at half of it, so it removes
 * precisely the part of a field that has no representation at this resolution and
 * leaves anything four texels across essentially alone. Mail rivets, thatch
 * straws, blade scratches and mud crumbs all keep their shape; what goes is the
 * checkerboard hash the over-Nyquist taps put underneath them.
 *
 * Separable, wrapping, two multiplies a texel a pass, and safe in place — pass
 * `src` as `out` and it filters where it stands, because the vertical pass reads
 * the horizontal pass's scratch and not the source. Cheap enough to run on every
 * surface unconditionally, which matters: the alternative is auditing nineteen
 * recipes' tap scales against two output resolutions and getting it wrong again
 * the next time one of them changes.
 */
function bandLimit(src: Float32Array, size: number, out: Float32Array = new Float32Array(src.length)): Float32Array {
  const n = size * size;
  const tmp = scratch(0, n);
  const mask = size - 1; // every generated map is power-of-two sized
  for (let y = 0; y < size; y++) {
    const row = y * size;
    for (let x = 0; x < size; x++) {
      tmp[row + x] = (src[row + ((x - 1) & mask)] + 2 * src[row + x] + src[row + ((x + 1) & mask)]) * 0.25;
    }
  }
  // Row-major, three row bases, rather than the column-major form the older
  // blur in this file uses. At 512² the column walk misses cache on every step
  // and costs about double.
  for (let y = 0; y < size; y++) {
    const rm = ((y - 1) & mask) * size;
    const r0 = y * size;
    const rp = ((y + 1) & mask) * size;
    for (let x = 0; x < size; x++) {
      out[r0 + x] = (tmp[rm + x] + 2 * tmp[r0 + x] + tmp[rp + x]) * 0.25;
    }
  }
  return out;
}

/**
 * The slope `bandLimit` took away, as a variance per texel.
 *
 * Sobel is linear, so the slope that went missing is the Sobel of the height that
 * went missing — one extra gradient pass rather than two, on the same `strength`
 * and the same unnormalised convention as `deriveNormal`, so what comes out is
 * directly comparable to the tangent slope that map encodes.
 *
 * Smoothed on the way out, and that is not cosmetic. The residual is by
 * construction the highest-frequency thing in the build; handing it straight to
 * the roughness channel would trade a sparkling normal map for a sparkling
 * roughness map and call it a fix. What the shader wants is the local *scale* of
 * the relief it cannot see, which is a neighbourhood statistic.
 */
function slopeVariance(h: Float32Array, hLo: Float32Array, size: number, strength: number): Float32Array {
  const n = size * size;
  const d = scratch(1, n);
  for (let i = 0; i < n; i++) d[i] = h[i] - hLo[i];
  const out = new Float32Array(n);
  const mask = size - 1;
  const k = (strength * size) / 256;
  const k2 = k * k;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1) & mask) * size;
    const y0 = y * size;
    const yp = ((y + 1) & mask) * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & mask;
      const xp = (x + 1) & mask;
      const gx = (d[ym + xp] + 2 * d[y0 + xp] + d[yp + xp]) - (d[ym + xm] + 2 * d[y0 + xm] + d[yp + xm]);
      const gy = (d[yp + xm] + 2 * d[yp + x] + d[yp + xp]) - (d[ym + xm] + 2 * d[ym + x] + d[ym + xp]);
      out[y0 + x] = (gx * gx + gy * gy) * k2;
    }
  }
  return bandLimit(out, size, out);
}

/**
 * How much of the discarded slope variance becomes lobe width.
 *
 * The physical answer is bracketed, not single-valued, and the bracket is wide.
 * At the bottom: `deriveNormal`'s Sobel is unnormalised, so a true per-texel
 * slope arrives here multiplied by eight, and the textbook α'² = α² + 2σ² wants
 * 2/64 ≈ 0.03 to undo that. At the top: what shades the surface is the *encoded*
 * normal, which `bump` deliberately exaggerates by about that same factor and
 * which therefore really does alias by the full amount, wanting 2.
 *
 * 0.12 sits about four times the geometric floor, and it is chosen so this acts
 * as a guard rail on the low-roughness tail rather than as a re-grade. Measured
 * across the library it moves no substance's mean roughness by more than 0.055 and
 * most by under 0.01 — skin 0.643 → 0.671, mail 0.384 → 0.388, the arena floor
 * 0.873 → 0.876 — while pulling the tails that actually sparkle up hard: blood's
 * floor 0.062 → 0.150, mud's fifth percentile 0.159 → 0.276, steel's scratches
 * out of mirror territory. At the textbook 2 the same pass takes skin to 0.91 and
 * a polished blade to 0.36, which is not anti-aliasing, it is sanding the arena
 * down. Every substance in this file already writes its own roughness off the same
 * height field, so some of this relief is spoken for twice; that is the honest
 * reason the top of the bracket is wrong.
 */
const SPEC_AA = 0.12;

/**
 * Specular anti-aliasing, baked.
 *
 * GGX's slope distribution has variance α²/2 where α = roughness², and variances
 * of independent slopes add, so relief the map could not keep comes back as
 * α' = sqrt(α² + 2σ²). The asymmetry in that expression is the whole reason this
 * works: at α = 0.8 a σ² of 0.02 vanishes, and at α = 0.02 it swamps the lobe. A
 * broad low-roughness region — a puddle, the flat of a blade, the wet bottom of a
 * boot print — has neighbours that agree with it, σ² near zero, and keeps every
 * bit of its polish. A lone texel whose normal disagrees with all four of its
 * neighbours cannot be a mirror any more. Broad sheen survives, isolated glitter
 * does not, and that is exactly the distinction the v3 capture failed to make.
 *
 * three's own `getGeometryRoughness()` is the screen-space version of this, but it
 * only ever sees the interpolated *geometric* normal — it has never looked at a
 * normal map, so nothing downstream of here was going to catch this either.
 */
function specularAA(roughness: number, variance: number): number {
  const a = roughness * roughness;
  const add = SPEC_AA * variance;
  // Below two percent of the existing lobe the correction cannot move the encoded
  // byte, and the two roots are the most expensive arithmetic in the build's
  // inner loop. Most texels on a rough substance take this branch.
  if (add < a * a * 0.02) return roughness;
  return clamp01(Math.sqrt(Math.sqrt(a * a + add)));
}

/**
 * How much of a mip level's lost normal detail becomes lobe width.
 *
 * `SPEC_AA` handles the band mip 0 cannot carry; this handles the band *every
 * coarser level* cannot carry, which is far more of the frame. The measurement is
 * free and exact: box-average the unit normals of a level's four children and the
 * average comes out short, and how short is precisely how much they disagreed.
 * Toksvig's identity turns that shortening back into a lobe.
 *
 * 1.0 is the textbook value and it is defensible — thirty mail rings in a pixel
 * really do scatter like a rough metal. It is not what is used here, for the same
 * reason `SPEC_AA` is not 2: `bump` exaggerates. Mail encodes its rings at 2.6,
 * thatch its straws at 3.4, so the averaged normal is shorter than the substance's
 * true normals would make it and the correction overshoots by roughly that factor.
 * 0.7 is the hedge, and it is deliberately a hedge rather than a derivation: the
 * exaggeration is per recipe and the right answer would be to fold `bump` in here,
 * which cannot be calibrated without a capture per substance.
 *
 * What it buys, measured on the built chain: mail at mip 5 goes 0.39 → 0.72 and
 * stops being thirty mirrors in a pixel; the arena floor, already at 0.88, moves
 * 0.006 and keeps every bit of its wet sheen. The asymmetry is the whole point and
 * it is the same asymmetry `specularAA` relies on — a lobe that is already broad
 * cannot be broadened, and a mirror can only be a mirror if its neighbours agree.
 */
const MIP_AA = 0.7;

/**
 * Above this declared roughness a surface does not get a hand-built chain.
 *
 * Not a performance dodge dressed up as physics — though it is also that, and the
 * numbers are in the header. The strongest correction this pass can make is at
 * t = 0.6, which is the normal disagreement mail reaches five levels down, and at
 * roughness 0.88 that correction is +0.033: eight byte levels on a substance that
 * already scatters in every direction. That is inside the 0.055 bar `SPEC_AA`'s
 * note sets for "a guard rail, not a re-grade", so paying 4/3 of a surface's texels
 * to apply it would be paying for nothing. Everything above the line is the
 * wool/thatch/oak/plank/granite/turf family, whose sparkle was mip 0's problem and
 * is fixed there; everything below is the metals, the wet, the polished and the
 * skin, which is exactly the set that turns to glitter when it is minified.
 */
const MIP_AA_CEILING = 0.75;

/**
 * Roughness for a level whose averaged normal has length `t`.
 *
 * Toksvig's formula is stated for a Blinn lobe, so the conversion in and out is
 * α = sqrt(2/(s+2)) with α = roughness² — three's own convention. Straight-line
 * algebra apart from one thing worth naming: `s` goes as 1/α⁴, so a polished
 * surface has an enormous exponent and even a one-percent shortening collapses it.
 * That sensitivity is not a bug in the formula, it is what a mirror is.
 */
function mipRoughness(roughness: number, t: number): number {
  const shrink = 1 - MIP_AA * (1 - t);
  // A level whose normals all agree returns its own roughness untouched, which is
  // what makes this safe to run from level 0 down without a special case.
  if (shrink > 0.9995) return roughness;
  const a = Math.max(1e-4, roughness * roughness);
  const s = 2 / (a * a) - 2;
  const s2 = (shrink * s) / (shrink + s * (1 - shrink));
  return clamp01(Math.sqrt(Math.sqrt(2 / (s2 + 2))));
}

/** One mip level of a `DataTexture`, in the shape three uploads. */
interface MipLevel { data: Uint8Array; width: number; height: number }

/**
 * The packed occlusion/roughness/metalness chain, built on the CPU so the
 * roughness of each level can answer for the normals that level averaged away.
 *
 * Occlusion and metalness are box-filtered, which is exactly what the GPU would
 * have done to them — this pass is not trying to be a better filter, only an
 * honest one in the one channel where linear filtering is wrong. The normals are
 * averaged with the same box, so the chain agrees level for level with the
 * automatic chain on the normal map beside it; that agreement is the reason this
 * can be done for one texture and not the other.
 *
 * Runs in place over `ao`, `rough` and `metal` — a 2×2 box always writes to an
 * index at or below the lowest index it reads, so the level below can be built
 * over the level above without a second buffer. Only the three normal components
 * need scratch, and they take the module's, so a hero surface adds 12 MB of
 * reused arena rather than 12 MB of garbage.
 */
function ormMips(
  size: number,
  ao: Float32Array,
  rough: Float32Array,
  metal: Float32Array,
  normal: Uint8Array,
  /** False for a substance over `MIP_AA_CEILING`: pack the base level and stop. */
  chain: boolean,
): MipLevel[] {
  const texels = size * size;
  if (!chain) {
    const data = new Uint8Array(texels * 4);
    for (let i = 0; i < texels; i++) {
      const o = i * 4;
      data[o] = (clamp01(ao[i]) * 255) | 0;
      data[o + 1] = (clamp01(rough[i]) * 255) | 0;
      data[o + 2] = (clamp01(metal[i]) * 255) | 0;
      data[o + 3] = 255;
    }
    return [{ data, width: size, height: size }];
  }
  const nx = scratch(2, texels);
  const ny = scratch(3, texels);
  const nz = scratch(4, texels);
  for (let i = 0; i < texels; i++) {
    const o = i * 4;
    nx[i] = normal[o] / 127.5 - 1;
    ny[i] = normal[o + 1] / 127.5 - 1;
    nz[i] = normal[o + 2] / 127.5 - 1;
  }

  const levels: MipLevel[] = [];
  let n = size;
  for (;;) {
    const count = n * n;
    const data = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) {
      const o = i * 4;
      const x = nx[i];
      const y = ny[i];
      const z = nz[i];
      const t = Math.min(1, Math.sqrt(x * x + y * y + z * z));
      data[o] = (clamp01(ao[i]) * 255) | 0;
      data[o + 1] = (mipRoughness(clamp01(rough[i]), t) * 255) | 0;
      data[o + 2] = (clamp01(metal[i]) * 255) | 0;
      data[o + 3] = 255;
    }
    levels.push({ data, width: n, height: n });
    if (n === 1) break;

    const half = n >> 1;
    for (let y = 0; y < half; y++) {
      const r0 = (y * 2) * n;
      const r1 = (y * 2 + 1) * n;
      const dst = y * half;
      for (let x = 0; x < half; x++) {
        const a = r0 + x * 2;
        const b = a + 1;
        const c = r1 + x * 2;
        const d = c + 1;
        const j = dst + x;
        ao[j] = (ao[a] + ao[b] + ao[c] + ao[d]) * 0.25;
        rough[j] = (rough[a] + rough[b] + rough[c] + rough[d]) * 0.25;
        metal[j] = (metal[a] + metal[b] + metal[c] + metal[d]) * 0.25;
        // Not renormalised. The shortening *is* the measurement.
        nx[j] = (nx[a] + nx[b] + nx[c] + nx[d]) * 0.25;
        ny[j] = (ny[a] + ny[b] + ny[c] + ny[d]) * 0.25;
        nz[j] = (nz[a] + nz[b] + nz[c] + nz[d]) * 0.25;
      }
    }
    n = half;
  }
  return levels;
}

/**
 * Sobel normals. The gradient is scaled by `size` so a 256² and a 512² build of
 * the same recipe bump by the same amount — the height field is authored in UV,
 * so its per-texel slope halves every time the resolution doubles.
 */
function deriveNormal(h: Float32Array, size: number, strength: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const mask = size - 1;
  const k = (strength * size) / 256;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1) & mask) * size;
    const y0 = y * size;
    const yp = ((y + 1) & mask) * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & mask;
      const xp = (x + 1) & mask;
      const gx = (h[ym + xp] + 2 * h[y0 + xp] + h[yp + xp]) - (h[ym + xm] + 2 * h[y0 + xm] + h[yp + xm]);
      const gy = (h[yp + xm] + 2 * h[yp + x] + h[yp + xp]) - (h[ym + xm] + 2 * h[ym + x] + h[ym + xp]);
      const nx = -gx * k;
      const ny = -gy * k;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const o = (y0 + x) * 4;
      out[o] = (nx * inv * 0.5 + 0.5) * 255;
      out[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
      out[o + 2] = (inv * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

/**
 * sRGB decode for all 256 byte values. A table rather than three Math.pow calls
 * per texel: pow costs about as much as the entire rest of the pack loop.
 */
const SRGB_TO_LINEAR = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    t[i] = x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  }
  return t;
})();

// ---------------------------------------------------------------------------
// Surface recipes
//
// Each fills the height, roughness, metalness and sRGB albedo of one substance.
// The colour numbers are art direction: changing one changes what the thing is
// made of, not how bright it is.
// ---------------------------------------------------------------------------

/**
 * Only three substances fill a `closeup` frame at texel scale — a hauberk, a
 * blade and a face. Those get the full tier resolution; everything else is
 * seen across the arena and gets half, which is most of the generation budget
 * back for detail nobody can resolve.
 */
type Detail = "hero" | "prop";

interface Recipe {
  detail: Detail;
  tint: number;
  roughness: number;
  metalness: number;
  normalScale: number;
  aoIntensity: number;
  /** Height-to-normal gain, tuned per substance rather than globally. */
  bump: number;
  /** Cavity AO gain. */
  cavity: number;
  repeat: number;
  cutout?: boolean;
  build(g: Gen): void;
}

// ---- riveted mail -------------------------------------------------------
// Real 4-in-1: rows of rings, every other row offset by half a ring, and each
// ring alternately over or under its neighbours. The over/under parity is what
// makes it read as woven metal instead of as a texture of circles.
function buildMail(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const COLS = 10;
  const ROWS = 14; // both even, so the stagger and the parity survive the wrap
  const cw = 1 / COLS;
  const chh = 1 / ROWS;
  const ra = cw * 0.66;
  const rb = chh * 0.94;
  const band = 0.42; // wire thickness as a fraction of the ring radius
  const INNER = (1 - band) * (1 - band);
  const OUTER = (1 + band) * (1 + band);

  const wire = col(0x5c636c);
  const crown = col(0xa8b0ba);
  const shadow = col(0x22262b);
  const rivetCol = col(0xbdae87);
  const gambeson = col(0x2b2521);
  const rust = col(0x6d4326);

  forEachTexel(size, (i, u, v) => {
    let best = 0;
    let bestP = 0;
    let bestOver = 0;
    let bestRivet = 0;
    const j0 = Math.floor(v * ROWS);
    const i0 = Math.floor(u * COLS);
    for (let dj = -1; dj <= 1; dj++) {
      const j = j0 + dj;
      const jw = j < 0 ? j + ROWS : j >= ROWS ? j - ROWS : j;
      let dy = v - (j + 0.5) * chh;
      if (dy > 0.5) dy -= 1; else if (dy < -0.5) dy += 1;
      if (dy > rb * 1.5 || dy < -rb * 1.5) continue;
      const stagger = jw & 1 ? 0.5 : 0;
      const ey = dy / rb;
      for (let di = -1; di <= 1; di++) {
        const ii = i0 + di;
        let dx = u - (ii + stagger + 0.5) * cw;
        if (dx > 0.5) dx -= 1; else if (dx < -0.5) dx += 1;
        if (dx > ra * 1.5 || dx < -ra * 1.5) continue;
        const ex = dx / ra;
        // Reject against the squared annulus before paying for the root: most
        // texels are in a gap, and this loop runs nine times per texel.
        const q = ex * ex + ey * ey;
        if (q < INNER || q > OUTER) continue;
        const e = Math.sqrt(q);
        const p = 1 - Math.abs(e - 1) / band;
        const iw = ii < 0 ? ii + COLS : ii >= COLS ? ii - COLS : ii;
        const over = (iw + jw) & 1;
        // Round wire cross-section, so the ring reads as drawn rod not as tape.
        const round = Math.sqrt(Math.max(0, 1 - (1 - p) * (1 - p)));
        const rvx = dx - ra * 0.96;
        const rv = Math.max(0, 1 - Math.sqrt(rvx * rvx + dy * dy) / (cw * 0.24));
        const z = (over ? 0.6 : 0.3) + round * 0.34 + rv * 0.09;
        if (z > best) { best = z; bestP = p; bestOver = over; bestRivet = rv; }
      }
    }

    const fuzz = sampleField(bank.fine, u * 9, v * 9);
    if (best === 0) {
      // Between the rings you see the padded gambeson, not a hole.
      h[i] = 0.05 + fuzz * 0.06;
      mix(c, i, gambeson, col(0x4a3f36), fuzz * 0.55);
      r[i] = 0.95;
      m[i] = 0;
      return;
    }

    const rusty = smoothstep(0.62, 0.92, sampleField(bank.soft, u * 2, v * 2)) * 0.9;
    const grime = sampleField(bank.grain, u * 5, v * 5);
    h[i] = clamp01(best + (grime - 0.5) * 0.05 + (fuzz - 0.5) * 0.02);
    // The crown of an over-ring is what a torch catches; the under-rings stay
    // dark. That split is the whole read — flatten it and this is a doily.
    mix(c, i, wire, crown, clamp01((bestP - 0.25) * 1.7) * (0.22 + 0.78 * bestOver));
    toward(c, i, shadow, clamp01(1 - bestP * 1.6) * (bestOver ? 0.35 : 0.65));
    toward(c, i, rivetCol, bestRivet * 0.85);
    toward(c, i, rust, rusty * (0.3 + 0.55 * (1 - bestP)));
    gain(c, i, 0.84 + grime * 0.3);
    r[i] = clamp01(0.29 + (1 - bestP) * 0.26 + rusty * 0.36 + (grime - 0.5) * 0.1);
    m[i] = 1 - rusty * 0.55;
  });
}

// ---- forged, blackened iron --------------------------------------------
function buildIron(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const base = col(0x2b3036);
  const facet = col(0x474e57);
  const pitCol = col(0x121519);
  const oxide = col(0x6a4426);

  forEachTexel(size, (i, u, v) => {
    const dent = sampleCell(bank.cell, u * 3, v * 3); // hammer planishing
    const soft = sampleField(bank.soft, u * 2, v * 2);
    const grain = sampleField(bank.grain, u * 6, v * 6);
    const pitD = sampleCell(bank.micro, u * 4, v * 4);
    const pit = sampleCellId(bank.micro, u * 4, v * 4) > 0.62 ? smoothstep(0.34, 0, pitD) : 0;
    const scale = smoothstep(0.66, 0.95, soft) * (0.35 + 0.65 * pit);

    h[i] = clamp01(0.52 + (1 - dent) * 0.2 + (soft - 0.5) * 0.16 + (grain - 0.5) * 0.06 - pit * 0.3);
    mix(c, i, base, facet, smoothstep(0.35, 0.95, dent) * (0.5 + 0.5 * grain));
    toward(c, i, pitCol, pit * 0.85);
    toward(c, i, oxide, scale * 0.7);
    r[i] = clamp01(0.44 + (1 - dent) * 0.16 + pit * 0.26 + scale * 0.24);
    m[i] = 1 - scale * 0.5;
  });
}

// ---- polished, pattern-welded steel ------------------------------------
// The chevrons are the point: Anglo-Saxon blades were pattern-welded, and a
// blade with a herringbone in it reads as forged rather than as chrome.
function buildSteel(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const LANES = 260;
  const body = col(0xb3bcc7);
  const bright = col(0xe4ebf3);
  const weld = col(0x878f9a);
  const nickCol = col(0x5b636c);

  forEachTexel(size, (i, u, v) => {
    const lane = v * LANES;
    const li = lane | 0;
    const seed = hash2(li, 7);
    const across = Math.abs(frac(lane) - 0.5) * 2;
    const cut = seed < 0.58 ? 0 : (seed - 0.58) / 0.42;
    const scratch = cut * (1 - smoothstep(0.1, 0.7, across)) * (0.35 + 0.65 * sampleField(bank.fine, u * 3 + seed, v * 40));

    // Chevron banding: a stripe field phase-shifted by a triangle wave in v,
    // then warped so it never reads as a printed zigzag. Pattern welding is a
    // whisper in the steel, not a flag — anything you can see across the arena
    // is too strong.
    const chev = tri(u * 13 + tri(v * 4) * 2.4 + sampleField(bank.grain, u * 2, v * 2) * 0.7);
    const weldT = smoothstep(0.25, 0.8, chev);

    const nickD = sampleCell(bank.micro, u * 2, v * 2);
    const nick = sampleCellId(bank.micro, u * 2, v * 2) > 0.88 ? smoothstep(0.18, 0, nickD) : 0;
    const tooth = sampleField(bank.grain, u * 8, v * 8);

    // A scratch is not geometry at this texel density and must not pretend to be.
    // 260 lanes on a 512² map is 1.97 texels a lane, and the `fine` tap inside it
    // runs at forty — so the scratch field was writing a per-texel coin flip into
    // the *height*, `deriveNormal` was turning it into per-texel random tilt, and
    // `bandLimit` could only attenuate content that is aliased across the whole
    // spectrum rather than remove it. The visible bill came due one level down:
    // steel's normals disagreed with their own neighbours everywhere, `ormMips`
    // read that disagreement as relief and sanded the polish off every blade and
    // helm in the frame — the pale, matte bowl in the middle panel of the head A/B.
    // At 0.02 the lanes still catch the light as *shading*, and where a scratch
    // physically belongs is where it still is: in the albedo, as a bright streak,
    // and in the roughness, as scatter. Nicks stay — a nick is a cell field at ×2,
    // 128 texels across, and it is real geometry that deserves a real normal.
    h[i] = clamp01(0.78 - scratch * 0.02 - nick * 0.36 + (tooth - 0.5) * 0.03);
    mix(c, i, body, weld, weldT * 0.16);
    toward(c, i, bright, scratch * 0.4 + (tooth - 0.5) * 0.2);
    toward(c, i, nickCol, nick * 0.8);
    r[i] = clamp01(0.1 + weldT * 0.05 + scratch * 0.32 + nick * 0.45 + (tooth - 0.5) * 0.05);
    m[i] = 1 - nick * 0.12;
  });
}

// ---- sand-cast bronze with verdigris ------------------------------------
function buildBronze(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const base = col(0x9c7434);
  const polish = col(0xcda75f);
  const dark = col(0x5c421c);
  const verdLight = col(0x5f9a80);
  const verdDark = col(0x2c5a49);

  forEachTexel(size, (i, u, v) => {
    const cast = sampleField(bank.grain, u * 5, v * 5);
    const soft = sampleField(bank.soft, u * 2, v * 2);
    const pitD = sampleCell(bank.micro, u * 1, v * 1);
    const pit = sampleCellId(bank.micro, u * 1, v * 1) > 0.5 ? smoothstep(0.45, 0.05, pitD) : 0;
    const height = clamp01(0.6 + (cast - 0.5) * 0.3 + (soft - 0.5) * 0.24 - pit * 0.55);
    // Verdigris grows in patches where water sits, and it eats outward from
    // there. Driving it off the pitting alone gave isolated green dots, which
    // is not how a corroded thing looks — the patch mask has to be broad.
    const bloom = soft * 0.7 + sampleField(bank.grain, u * 3, v * 3) * 0.3;
    const verd = clamp01(smoothstep(0.44, 0.68, bloom) * (0.85 + pit * 0.4));

    h[i] = clamp01(height + verd * 0.08);
    mix(c, i, base, polish, smoothstep(0.5, 0.86, height) * 0.85);
    toward(c, i, dark, pit * 0.75);
    verdigris(c, i, verdLight, verdDark, verd * 0.92, cast);
    r[i] = clamp01(0.24 + pit * 0.4 + (1 - height) * 0.24 + verd * 0.55);
    m[i] = 1 - verd * 0.95;
  });
}

/** Verdigris is powdery and uneven — it needs two greens, not one. */
function verdigris(c: Float32Array, i: number, light: RGB, dark: RGB, amount: number, mottle: number): void {
  if (amount <= 0) return;
  const j = i * 3;
  const t = clamp01(mottle * 1.3);
  const g0 = light[0] + (dark[0] - light[0]) * t;
  const g1 = light[1] + (dark[1] - light[1]) * t;
  const g2 = light[2] + (dark[2] - light[2]) * t;
  c[j] += (g0 - c[j]) * amount;
  c[j + 1] += (g1 - c[j + 1]) * amount;
  c[j + 2] += (g2 - c[j + 2]) * amount;
}

// ---- fulled wool --------------------------------------------------------
// Not a weave, and that is the whole change. Anglo-Saxon cloth was woven and
// then *fulled* — soaked and pounded until the scales on the fibres locked into
// one another — and what comes off that is a matted, hairy sheet with the
// lattice buried under a raised nap. Any real fulled twill in a museum reads as
// fuzz from a metre away; you have to hold it to find the threads.
//
// Drawing the threads is what put basketwork across half of every frame. A
// garment tile here lands between 30 and 60 mm and a legible thread count puts
// the crossings at a pixel or two, so the lattice beats against the pixel grid,
// and the beat is coarser than either — which is why the leg wraps came back as
// corduroy and the cloak as a knitted blanket. Nothing about the thread count
// fixes that: an over-under grid is periodic in two axes by construction and a
// periodic pattern near Nyquist always aliases into a coarser periodic pattern.
//
// So the structure is fibre and it has no axis. Two crossed nap fields choose
// between each other on a third — chosen, not summed, because a sum of crossed
// streaks is a plaid — which gives the mat patches that lie different ways, the
// way carded fibre actually does. Both are warped, so nothing in here holds a
// straight line for more than a few millimetres. Everything varies at twelve
// cells per tile or finer, which is the detiling rule at the head of this file,
// and it is what lets a cloak mip down to one dyed tone.
//
// The same recipe has to serve hair (repeat 20), beard (26) and the berserker's
// fur (6), which borrow wool at a much finer tile to fake strands — one tile
// size cannot serve both, but one *primitive* can. A nap field is fibre at a
// 50 mm tile and hair at a 30 mm one, which the weave never was.
//
// Killing the weave was necessary and was not sufficient, and the reason is the
// note on `valueNoise`. The dye field survived the rewrite at a tap the comment
// beside it read as twelve cells across the tile; it is four, because `soft` is a
// three-node lattice and a three-node lattice peaks at one cycle. Laid down at
// the tile sizes characters.ts asks for — ~20 mm on a beard, 34 to 56 mm on a
// garment or a cloak, ~165 mm on the berserker's ruff — four cycles is a
// four-cell grid stamped once per tile and then repeated twelve to twenty-four
// times round a limb, which is precisely the basketwork three panels scored and
// precisely what `CLOTH_BLOTCH * 4` in characters.ts was named after. Measured
// off the built tile: a third of the albedo's variance sat below eight cycles
// and it peaked at four.
//
// Twelve cycles is the fix, and the reason it can serve every one of those tile
// sizes at once is that it leaves nothing with a characteristic length above the
// fibre. The nap is anisotropic and an anisotropic field cannot draw a lattice
// however coarse it gets — long streaks at a 165 mm tile are a pelt and at a
// 20 mm tile they are strands, which is the trap dissolved rather than worked
// around. What twelve costs is the low-frequency tonal swing the old blotch
// carried, and that swing is load-bearing: `stance` ships ten luma buckets
// against a floor of eight and its marginal ones come off the berserker's cream
// legging. So the swing is bought back where it cannot draw a grid — a wider
// albedo range across the nap itself, a fifth more relief for the shading to
// work on, and a stronger dye gain per blotch now that a blotch is smaller. Laid
// down at the dozen-odd pixels a legging tile occupies in `stance`, that returns
// roughly two thirds to four fifths of the luma spread the four-cycle grid was
// providing, and it puts the tile's own spread up by a sixth at close range. The
// shortfall at distance is genuinely gone, because it *was* the grid.
function buildWool(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const base = col(0x9d968b);
  const shade = col(0x584f44);
  const lift = col(0xc8c1b4);
  const dusty = col(0x8b8272);

  forEachTexel(size, (i, u, v) => {
    // A whole cell of warp. The nap fields below are built on lattices like
    // everything else in this file, and at this tile size the lattice is the one
    // thing that must not survive.
    warpUV(bank, u, v, 0.07);
    const wu = WARP[0];
    const wv = WARP[1];

    // Fibre, long one way and narrow the other. Sampled off `grain` rather than
    // `fine` so the coarse octave lands at three or four texels: fibre that
    // resolves is fibre, fibre at half a texel is the dither the mips eat.
    const napV = sampleField(bank.grain, wu * 3, wv * 1);
    const napH = sampleField(bank.grain, wu * 1, wv * 3);
    const lay = smoothstep(0.4, 0.6, sampleField(bank.warp, u * 3, v * 3));
    const nap = napV + (napH - napV) * lay;
    // Loose hair standing off the surface, and the tooth under all of it.
    const hairy = sampleField(bank.fine, wu * 2, wv * 1);
    const tooth = sampleField(bank.fine, u * 2, v * 2);

    // Pills — the knots fulled wool raises wherever it has been rubbed. Sparse,
    // because a surface of them is a towel.
    const pillD = sampleCell(bank.micro, u * 1, v * 1);
    const pill = sampleCellId(bank.micro, u * 1, v * 1) > 0.85
      ? (1 - smoothstep(0.08, 0.4, pillD)) * 0.9
      : 0;

    // Vat-dye unevenness. Twelve cycles across the tile, which is the number the
    // note above is about: it puts a blotch under 2 mm on a beard and 14 mm on
    // the ruff, so the coarsest thing in the field is always an order below the
    // tile and the tile can never be counted. Harder per blotch than it was,
    // because a smaller blotch averages away faster and the range is what the
    // grade is spending.
    //
    // Warped three times as hard as the nap, and this is the second half of the
    // fix rather than a flourish. Raising a tap scale on a bank field does not
    // only make its features smaller, it makes them *periodic*: `soft` carries
    // nine distinct blobs at its coarsest octave, so at twelve it is those nine
    // stamped in a strict 12 x 12 grid, and on the berserker's ruff — a 165 mm
    // tile, eighty-odd pixels of it at the portrait framing — that grid is
    // legible as tweed even though every cell in it is small. The warp is the one
    // that takes a lattice out of a lattice-built field, which is what `warpUV`
    // exists for; a whole cell of it here turns the grid into swirled fleece and
    // leaves the garment scales, where the blotch is under two pixels anyway,
    // exactly as they were. Reusing the nap's own displacement rather than taking
    // a second warp tap keeps this free, and the +1 keeps `tap`'s argument
    // positive at u near zero without moving the sample — twelve is an integer
    // number of field periods.
    const dw = (wu - u) * 3;
    const dye = contrast(sampleField(bank.soft, (u + dw + 1) * 12, (v - dw * 0.74 + 1) * 12), 1.7);

    const fibre = clamp01(nap * 0.74 + hairy * 0.26);
    h[i] = clamp01(0.4 + (fibre - 0.5) * 0.6 + (tooth - 0.5) * 0.18 + pill * 0.28);

    // Wider across the nap than the weave ever ran across its crossings, and it
    // is the trade the dye field paid for: this is variation that lives on a
    // streak rather than on a lattice, so it can be as strong as the substance
    // wants without ever giving the eye something to count.
    mix(c, i, shade, base, clamp01(fibre * 1.85));
    // A pill is a knot of the same wool, not a bead of something else: it reads
    // in the relief and only barely in the colour. Lit as brightly as the nap
    // crowns it came back as lint.
    toward(c, i, lift, clamp01((fibre - 0.62) * 2.4) * 0.66 + pill * 0.22);
    toward(c, i, dusty, smoothstep(0.56, 0.06, dye) * 0.4);
    gain(c, i, 0.8 + dye * 0.5 + (tooth - 0.5) * 0.12);
    // Felt is the most light-absorbing thing in the frame and has no crowns to
    // shine off: the spread is a tenth wide and all of it sits at the top.
    r[i] = clamp01(0.99 - fibre * 0.09 - pill * 0.05 + (tooth - 0.5) * 0.05);
    m[i] = 0;
  });
}

// ---- fine plain-weave linen ---------------------------------------------
// The one cloth in the set that keeps a lattice, because linen is the one cloth
// that shows one: flax is hard-spun, smooth and does not full, so the crossings
// stay visible however long the shirt is worn. What linen has *not* got is
// contrast — a bleached undershirt is one tone with a texture in it — so the
// over-under lives almost entirely in the height field and is barely whispered
// into the albedo. That is the difference between linen and hessian, and drawing
// it at wool's contrast is what made both of them sacking.
//
// The slub carries the read. Flax fibre is uneven along its length, so the yarn
// thickens and thins at random and the grid is never square; without it this is
// graph paper at any contrast.
//
// Sixty-four threads, not thirty, and this is the one cloth where the count is
// the whole argument rather than a detail of it. Linen is not world-sized, so it
// wears whatever tile its caller asks for, and its callers ask big: an undershirt
// takes repeat 6 round a chest a metre in the round, and the banners take 3
// across their width, which lands the tile near 160 mm on both. Thirty threads
// over 160 mm is a 5 mm yarn — sacking, and the coarsest cloth in the frame drawn
// on the substance that is meant to be the finest. Doubling the count lands it
// near two and a half millimetres and four texels, which is the shimmer floor the
// thatch straws established and the point at which a shirt at gameplay range is
// one pale tone with a tooth in it, which is what a bleached undershirt is. The
// count that actually wants fixing is the caller's repeat, and it is not in this
// file; sixty-four is what this end can do about it.
function buildLinen(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  // Below about three texels a thread shimmers, same rule as the thatch straws.
  // The count stays EVEN: the over/under parity is per thread, so an odd count
  // flips it across the tile wrap and lays a seam down every edge of the cloth.
  const n = size >= 256 ? 64 : 24;
  const base = col(0xb7ab93);
  const shade = col(0x7a7161);
  const lift = col(0xd6cdb7);

  forEachTexel(size, (i, u, v) => {
    // The whole lattice is warped, not each thread separately, so the cloth
    // drifts and puckers as one piece the way a woven bolt does. n is even, so
    // the wrap still lands on a parity boundary however far the warp pushes.
    warpUV(bank, u, v, 0.035);
    const su = WARP[0] * n;
    const sv = WARP[1] * n;
    const ku = Math.floor(su);
    const kv = Math.floor(sv);
    const fu = su - ku;
    const fv = sv - kv;
    // Wrapped indices for anything hashed or parity-tested; the raw ones can sit
    // just outside the grid once the warp has moved them.
    const pu = wrapi(ku, n);
    const pv = wrapi(kv, n);

    // Thick and thin along each yarn's own length, and hard: half the diameter
    // between one slub and the next is what flax does.
    const slubU = 1 - 0.42 * sampleField(bank.grain, 0, v * 6 + pu * 0.37);
    const slubV = 1 - 0.42 * sampleField(bank.grain, u * 6 + pv * 0.29, 0);
    const shape = (s: number) => s * Math.sqrt(s); // crisp, thin, round-shouldered
    const warp = shape(Math.sin(Math.PI * clamp01((fu - 0.5) / slubU + 0.5)));
    const weft = shape(Math.sin(Math.PI * clamp01((fv - 0.5) / slubV + 0.5)));

    // +1 = this segment passes over, -1 = under. Parity flips per thread, and
    // the thread's own profile falls to zero exactly where the parity jumps.
    const warpLift = (pu & 1 ? -1 : 1) * -Math.cos(Math.PI * (sv - 0.5));
    const weftLift = (pv & 1 ? 1 : -1) * -Math.cos(Math.PI * (su - 0.5));

    const hw = warp * (0.5 + 0.5 * (warpLift * 0.5 + 0.5));
    const hf = weft * (0.5 + 0.5 * (weftLift * 0.5 + 0.5));
    const top = Math.max(hw, hf);

    const fibre = sampleField(bank.fine, u * 3, v * 3);
    // Same move as wool's, warp and all, and it had the same arithmetic error
    // under it: four cycles across a 160 mm shirt tile is a 40 mm blotch laid six
    // times round a chest. Twelve is where a dye blotch stops competing with the
    // weave it is supposed to be sitting on, and the displacement is what stops
    // twelve being a 12 x 12 grid of the nine blobs `soft` actually holds.
    const dw = (WARP[0] - u) * 3;
    const dye = contrast(sampleField(bank.soft, (u + dw + 1) * 12, (v - dw * 0.74 + 1) * 12), 1.5);
    h[i] = clamp01(top * 0.9 + (fibre - 0.5) * 0.12 + 0.06);

    // A sixth of wool's albedo swing across the crossings. The weave is relief,
    // not pattern; letting it into the colour is what turned a linen shirt into
    // hessian at every distance the mips could not reach.
    mix(c, i, shade, base, clamp01(0.55 + top * 0.7));
    toward(c, i, lift, clamp01((top - 0.78) * 3) * 0.3);
    toward(c, i, shade, smoothstep(0.55, 0.08, dye) * 0.22);
    gain(c, i, 0.86 + dye * 0.3 + (fibre - 0.5) * 0.08);
    r[i] = clamp01(0.94 - top * 0.22 + (fibre - 0.5) * 0.06);
    m[i] = 0;
  });
}

// ---- tanned leather -----------------------------------------------------
// Grain, and nothing coarser than grain. materials.ts sizes leather at a 35 mm
// world tile, so a feature drawn at the tile's own fundamental is the same
// feature repeated three times across a bracer and thirty times across a jerkin
// — and that is what the honeycomb of ridged creases this used to carry actually
// was. It measured 9 mm a cell on the berserker's jerkin and it is the
// wickerwork three panels scored; nothing about it was leather, because real
// hide has no feature at that scale at all.
//
// What hide has is three things, all of them small: the follicle pebbling the
// tanner's grain layer leaves, a fine wrinkle net a couple of millimetres
// across, and long soft stretch lines that all run the same way because a hide
// is pulled one way on the frame. The last is what keeps this from being
// noise-on-brown: a directional cue is what an eye reads as *worked* material.
function buildLeather(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const base = col(0x6b4626);
  const crease = col(0x35200f);
  const rubbed = col(0x94693f);

  forEachTexel(size, (i, u, v) => {
    // Pebbled grain: the hide's follicle structure, one dome per cell. 44 cells
    // over a 35 mm tile is 0.8 mm, which is the size a follicle actually is.
    const pebD = sampleCell(bank.micro, u * 1, v * 1);
    const peb = 1 - smoothstep(0, 0.68, pebD);
    // The wrinkle net, at four times the frequency the fold network used to run
    // at — 2 mm a cell rather than 9, which is below the tile's fundamental by
    // enough that a mipped bracer keeps grain instead of keeping a lattice.
    const net = smoothstep(0.5, 0.95, sampleField(bank.ridge, u * 4, v * 4));
    // Stretch lines. Long in V, narrow in U, so they read as the pull of the
    // frame rather than as a second net crossing the first.
    const pull = smoothstep(0.58, 0.98, sampleField(bank.ridge, u * 6, v * 2));
    const deep = clamp01(net * 0.6 + pull * 0.5);
    const scuff = sampleField(bank.fine, u * 4, v * 4);
    const patina = sampleField(bank.soft, u * 4, v * 4);

    const height = clamp01(0.56 + peb * 0.34 - deep * 0.36 + (scuff - 0.5) * 0.1);
    h[i] = height;
    set(c, i, base);
    // The grain has to show in the albedo too, or the normal map is arguing
    // with a flat brown and the flat brown wins at any distance.
    toward(c, i, crease, clamp01(deep * 0.75 + (1 - peb) * 0.3));
    toward(c, i, rubbed, clamp01((peb - 0.35) * 1.8) * 0.6 * (0.4 + 0.6 * scuff));
    gain(c, i, 0.84 + patina * 0.32);
    // Rubbed crowns take a shine; the creases stay matte and hold polish.
    r[i] = clamp01(0.68 - clamp01((height - 0.55) * 2.4) * 0.3 + deep * 0.18);
    m[i] = 0;
  });
}

// ---- twisted hemp rope --------------------------------------------------
function buildRope(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const STRANDS = 3;
  const TWIST = 5; // strand turns along V per tile
  const base = col(0xa08a5e);
  const shade = col(0x3f3420);
  const lift = col(0xd0bb8c);

  forEachTexel(size, (i, u, v) => {
    const s = u * STRANDS + v * TWIST;
    // sqrt fattens the strand and sharpens the valley between: laid rope is
    // three fat cords with a hard groove, not three soft stripes.
    const round = Math.sqrt(Math.sin(Math.PI * frac(s)));
    // Each cord is itself spun from finer yarns, laid the other way.
    const yarn = Math.sin(Math.PI * frac(s * 5 - v * 3)) * 0.2 * round;
    const fibre = sampleField(bank.fine, u * 20, v * 5);
    const hair = sampleField(bank.grain, u * 14, v * 4);
    const height = clamp01(round * 0.72 + yarn + 0.1 + (fibre - 0.5) * 0.16);

    h[i] = height;
    mix(c, i, shade, base, clamp01(round * 1.25));
    toward(c, i, lift, clamp01((round - 0.72) * 3.4) * 0.55 * hair);
    gain(c, i, 0.82 + hair * 0.34);
    r[i] = clamp01(0.98 - round * 0.16 + (fibre - 0.5) * 0.1);
    m[i] = 0;
  });
}

// ---- timber -------------------------------------------------------------
// Flat-sawn board: the annual rings are circles in the log's cross-section, so
// on the face of a board cut at distance c from the pith you see sqrt(x² + c²).
// Letting c wander along the length is what produces the cathedral figure.
interface WoodOpts {
  rings: number;
  wander: number;
  early: RGB;
  late: RGB;
  knotCol: RGB;
  knots: number;
  /** Weathered boards lose the soft earlywood, leaving the latewood proud. */
  erosion: number;
  pore: number;
  seams: number;
  roughLow: number;
  roughHigh: number;
  grey: number;
  /** Oak's silver grain: the medullary rays, as dashes across the figure. */
  ray: number;
}

function wood(g: Gen, o: WoodOpts): void {
  const { size, h, r, m, c, bank, rng } = g;
  const knots: Array<[number, number, number]> = [];
  for (let i = 0; i < o.knots; i++) knots.push([rng(), rng(), 0.05 + rng() * 0.045]);
  const weathered = col(0x8f8a7e);
  const rayCol = col(0xc4a473);

  // Per-board variation, and it is the whole reason a wall of boards stops
  // reading as one board repeated twelve times. Every board came off a different
  // log: its own ring pitch, its own distance from the pith, its own tone, its
  // own share of the weathering. Resolved per board rather than per texel — there
  // are four of them and a quarter of a million texels.
  const cols = Math.max(1, o.seams);
  const bRing = new Float32Array(cols);
  const bPith = new Float32Array(cols);
  const bTint = new Float32Array(cols);
  const bGrey = new Float32Array(cols);
  for (let b = 0; b < cols; b++) {
    const b0 = hash2(b * 13 + 1, 71);
    const b1 = hash2(b * 29 + 5, 37);
    const b2 = hash2(b * 7 + 3, 101);
    bRing[b] = o.seams > 0 ? 0.7 + b0 * 0.66 : 1;
    bPith[b] = o.seams > 0 ? (b1 - 0.5) * 0.36 : 0;
    bTint[b] = o.seams > 0 ? 0.78 + b2 * 0.46 : 1;
    bGrey[b] = o.seams > 0 ? 0.3 + b1 * 1.4 : 1;
  }

  forEachTexel(size, (i, u, v) => {
    // u is in [0,1), so the board index is already inside the table.
    const bi = (u * cols) | 0;
    const ringK = bRing[bi];
    const pithOff = bPith[bi];

    // Knots darken, and they bow the figure *around* themselves. The version
    // that pushed the ring coordinate radially closed the rings into concentric
    // circles, and three hard bullseyes on every tile was the most legible repeat
    // in the whole library — on a hut wall at repeat [3,2] the same three
    // appeared six times over. Displacing sideways is both what wood does and
    // what a knot has to do here: disturb the figure rather than stamp it.
    let knot = 0;
    let bow = 0;
    for (let k = 0; k < knots.length; k++) {
      let dx = u - knots[k][0];
      let dy = v - knots[k][1];
      dx -= Math.round(dx);
      dy -= Math.round(dy);
      const d = Math.sqrt(dx * dx + dy * dy * 2.2);
      if (d > knots[k][2] * 3.4) continue;
      const t = smoothstep(knots[k][2] * 3.2, knots[k][2] * 0.5, d);
      if (t > knot) knot = t;
      bow += t * dx * 1.6;
    }

    const x = u - 0.5 + bow;
    // One `soft` tap, read twice: where the pith wandered, and how the tone of
    // this stretch of board differs from the next. That second read is what keeps
    // a palisade built from one shared material from being a row of identical
    // stakes, and it costs nothing.
    //
    // `v * 4`, and the comment that used to sit here already said why — "sampled
    // long in V, so it drifts up the timber rather than across it" — while the
    // code sampled one cycle each way and drifted equally in both. An isotropic
    // term at one cycle per tile is a blob the size of the tile, which is the
    // definition of a landmark, and it is most of why a palisade stake at
    // repeat [2,5] shows the same dark patch ten times over in `arena.png`.
    // Anisotropy is also just what timber is: a board's figure and its tone change
    // as you walk along it and barely at all as you cross it. Not taken to a pure
    // function of v, tempting as that is — the ring coordinate is symmetric about
    // the middle of the tile, so a wander with no u term would mirror every
    // board's figure down its own centre line.
    const soft1 = sampleField(bank.soft, u, v * 4);
    const pith = 0.26 + pithOff + (soft1 - 0.5) * o.wander;
    let rr = Math.sqrt(x * x + pith * pith) * o.rings * ringK;
    rr += (sampleField(bank.grain, u * 2, v * 1) - 0.5) * 0.8;

    const ring = frac(rr);
    const late = smoothstep(0.5, 0.72, ring) * (1 - smoothstep(0.86, 1, ring));
    // Ring-porous timber's vessels line up *along* the grain, in rows at the
    // earlywood boundary — they are not a per-texel sprinkle. At u * 40 this tap
    // returned 1280 cells across a 256 map, which is four coin flips a texel: a
    // dither that band-limiting strips out of the height and `slopeVariance`
    // then folds into roughness as a grey mush. Four cells wide by one long puts
    // a pore at two texels and lays it in the direction pores actually run.
    const pore = sampleField(bank.fine, u * 4, v * 1) > 0.68 ? o.pore : 0;
    // Board edges sit where the triangle wave bottoms out, so the seam and the
    // tile wrap land on the same line and the repeat has somewhere to hide.
    const seam = o.seams > 0 ? smoothstep(0.06, 0, tri(u * o.seams)) : 0;
    const split = smoothstep(0.82, 0.99, sampleField(bank.ridge, u * 2, v * 1)) * o.erosion;
    // Medullary rays: the pale flecks that make oak unmistakable, lying across
    // the grain rather than along it. This was `v * 24` — 768 cells down a 256
    // map, a third of a texel each — so what it drew was white noise at three
    // per cent coverage: invisible as rays, and one more contributor to the
    // sparkle §2 scores at distance. At v * 3 a fleck is two or three texels
    // tall and four times as wide as it is tall, which is the shape of one.
    const fleck = smoothstep(0.62, 0.9, sampleField(bank.fine, u * 1, v * 3)) * o.ray;
    const drift = contrast(soft1, 1.9);

    const height = clamp01(0.55 + late * o.erosion * 0.55 + fleck * 0.05 - pore - seam * 0.9 - split * 0.5 - knot * 0.1);
    h[i] = height;
    // `late * 1.2` drove the ring band to full saturation across most of its
    // width, so every board was hard stripes of two colours. Boards do not get
    // dressed at one repeat here — the shield's planks take oak at 3 across a
    // 108 mm face and 3 down a 700 mm one, a 6:1 stretch — and a hard stripe
    // stretched 6:1 is hair, which is why the huscarl's red quarters read as
    // smeared fur. Softening the band is what turns them back into timber; the
    // rays and the pores above are what stop that costing the figure.
    mix(c, i, o.early, o.late, clamp01(late * 0.82));
    toward(c, i, rayCol, fleck * 0.55);
    // Half the darkness a knot used to be painted with, and it is the price of
    // the directional wander above. That wander was also camouflage: an isotropic
    // blob the size of the tile sat on top of every knot and broke it up, and
    // taking it away left two hard dark spots per tile in a column — a knot is a
    // landmark by definition, and this map tiles two to eight times on a stake.
    // What survives is the part of a knot that cannot be counted: the bow it puts
    // in the figure around it, which is at full strength and which is the cue a
    // timber-yard eye actually reads.
    toward(c, i, o.knotCol, knot * 0.45);
    // Weathering runs with the grain for the same reason the drift does: rain
    // and sun leave streaks down a stake, and a two-cycle isotropic mask leaves
    // two grey clouds per tile that the eye finds again on the next stake along.
    toward(c, i, weathered, clamp01(o.grey * bGrey[bi]) * sampleField(bank.soft, u * 2, v * 7));
    gain(c, i, bTint[bi] * (0.8 + drift * 0.36) * (0.9 + sampleField(bank.grain, u * 4, v * 2) * 0.24 - seam * 0.45 - split * 0.3));
    r[i] = clamp01(o.roughHigh - late * (o.roughHigh - o.roughLow) - fleck * 0.1 + pore * 0.4 + split * 0.2);
    m[i] = 0;
  });
}

const buildOak = (g: Gen) => wood(g, {
  rings: 11,
  wander: 0.5,
  early: col(0xb08a5c),
  late: col(0x63421f),
  knotCol: col(0x39230f),
  knots: 2,
  erosion: 0.35,
  pore: 0.06,
  seams: 0,
  roughLow: 0.72,
  roughHigh: 0.92,
  grey: 0.1,
  ray: 0.55,
});

const buildPlank = (g: Gen) => wood(g, {
  rings: 8,
  wander: 0.7,
  early: col(0x968875),
  late: col(0x554c40),
  knotCol: col(0x2e2720),
  knots: 2,
  erosion: 1,
  pore: 0.1,
  seams: 4,
  roughLow: 0.82,
  roughHigh: 0.99,
  grey: 0.34,
  ray: 0.22,
});

// ---- thatch -------------------------------------------------------------
// Straw laid in courses down the slope. Each course overlaps the one below it,
// which is where the dark bands and the whole read of a thatched roof come from.
function buildThatch(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const COURSES = 5;
  // A straw narrower than about three texels turns into aliasing crawl, which
  // is failure #10 on the bar. The low tier gets fewer, fatter straws — that is
  // a coarser thatched roof, not a broken one.
  // 96 rather than 120: at the prop resolution that is 2.7 texels a straw
  // against 2.1, and the whole point of the three-texel rule is that the roof
  // must not crawl when the camera pulls back across the moot.
  const STRAWS = size >= 256 ? 96 : 56;
  const straw = col(0xc9a860);
  const dry = col(0x866d3a);
  const bleach = col(0xdfcb92);
  const weather = col(0x6b6553);
  // A north-facing roof goes green-black within a season, and that is where the
  // only colour in a thatched roof comes from.
  const mossy = col(0x44513c);
  const deep = col(0x1f1a11);

  forEachTexel(size, (i, u, v) => {
    // A laid course sags between the rafters. Warping V is what stops five
    // courses from being five straight lines ruled across the roof.
    warpUV(bank, u, v, 0.026);
    const sv = WARP[1] * COURSES;
    const course = wrapi(Math.floor(sv), COURSES);
    const fv = sv - Math.floor(sv);
    const lean = (hash2(course, 3) - 0.5) * 0.4;
    const su = (WARP[0] + fv * lean) * STRAWS;
    const strand = wrapi(Math.floor(su), STRAWS);
    const fu = su - Math.floor(su);

    const seed = hash2(strand, course);
    const seed2 = hash2(strand * 3 + 1, course * 7);
    const prof = Math.sqrt(Math.sin(Math.PI * clamp01(fu)));
    // Straws stop at different depths, so the bundle has a ragged bottom edge.
    const reach = smoothstep(0.62 + seed * 0.38, 0.5 + seed * 0.38, fv);
    // The next course sits on top of this one's head. The dark line under that
    // overlap is the single strongest read a thatched roof has, and the version
    // that failed the v2 capture had it at a third of this depth — which is why
    // the roofs came back as pale panels with pencil lines on them.
    const overlap = 1 - smoothstep(0, 0.16, fv);
    const shadowLine = smoothstep(0.14, 0.02, fv);

    // One tap for both weathering terms: the grey it goes everywhere, and the
    // green-black it goes only where it stays wet, which is the top of the same
    // distribution.
    const age = contrast(sampleField(bank.soft, u * 2, v * 2), 1.9);
    const damp = smoothstep(0.62, 0.95, age);
    const body = prof * (0.4 + seed2 * 0.35) * reach;
    const height = clamp01(body + overlap * 0.34 + sampleField(bank.fine, u * 10, v * 10) * 0.06 - shadowLine * 0.12);

    h[i] = height;
    mix(c, i, deep, straw, clamp01(body * 2.4));
    // Every straw its own age: fresh gold through weathered ochre. One tone
    // across a hundred and twenty straws is a broom, not a roof.
    toward(c, i, dry, seed * 0.75);
    toward(c, i, bleach, clamp01((seed2 - 0.7) * 3) * body * 0.6);
    toward(c, i, weather, age * 0.45);
    toward(c, i, mossy, damp * 0.55);
    gain(c, i, (0.6 + height * 0.6) * (1 - shadowLine * 0.34));
    r[i] = clamp01(0.99 - body * 0.14 - damp * 0.06);
    m[i] = 0;
  });
}

// ---- granite ------------------------------------------------------------
// Interlocking crystals, each with its own mineral. The mica flecks are the
// only glossy thing in it, and they are what make stone sparkle under a torch.
function buildGranite(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const quartz = col(0xd6d2c6);
  const feldspar = col(0xaf9a8e);
  const plagio = col(0x7f858a);
  const mica = col(0x2a282c);
  // Lichen. Every standing stone in England wears it, and on a runestone at dusk
  // it is the only thing in the substance that is not grey — which is what puts
  // granite back on the colour axis of §8 instead of leaving it a value ramp.
  const crustose = col(0x8ea07c); // the common pale grey-green
  const ochre = col(0xc0a044);    // and the yellow map lichen beside it
  const soot = col(0x4b4741);     // rain-shadow grime in the fractures

  forEachTexel(size, (i, u, v) => {
    const d = sampleCell(bank.cell, u * 3, v * 3);
    const id = sampleCellId(bank.cell, u * 3, v * 3);
    const dm = sampleCell(bank.micro, u * 3, v * 3);
    const idm = sampleCellId(bank.micro, u * 3, v * 3);
    const fracture = smoothstep(0.72, 0.98, sampleField(bank.ridge, u * 2, v * 2));
    const tooth = sampleField(bank.grain, u * 8, v * 8);

    const isMica = idm > 0.9;
    const crystal = 1 - smoothstep(0.15, 0.75, d);
    const height = clamp01(0.5 + crystal * 0.18 + (id - 0.5) * 0.16 + (tooth - 0.5) * 0.12 - fracture * 0.45 - (1 - smoothstep(0.2, 0.6, dm)) * 0.08);

    // Crustose lichen grows as discrete thalli with a hard rim, not as a stain,
    // so it comes off a cell field rather than off a noise threshold. It reuses
    // the crystal field it is already standing on rather than taking one of its
    // own: a thallus colonising a single grain is both what happens and what
    // fits the budget. `where` gathers those thalli into colonies a few
    // centimetres across, and only on the faces the weather reaches — which on
    // a height field means the crowns.
    // One `soft` tap, read twice. Crystals are a centimetre across and mip to a
    // single flat grey by the time a runestone is five metres away, so the same
    // field that gathers the lichen into colonies also carries the broad
    // weathering that gives the stone form at that distance — which is the whole
    // reason the runestone came back as a pale slab in the v2 capture.
    const weather = contrast(sampleField(bank.soft, u * 2, v * 2), 2.0);
    const where = smoothstep(0.34, 0.68, weather);
    const lichen = clamp01(where * (id > 0.4 ? 1 - smoothstep(0.42, 0.8, d) : 0)
      * (0.45 + height * 0.8) * (1 - fracture));

    h[i] = clamp01(height + lichen * 0.06);
    if (id < 0.42) set(c, i, quartz);
    else if (id < 0.78) set(c, i, feldspar);
    else set(c, i, plagio);
    toward(c, i, mica, isMica ? 1 - smoothstep(0, 0.45, dm) : 0);
    toward(c, i, soot, fracture * 0.45);
    toward(c, i, id > 0.84 ? ochre : crustose, lichen);
    gain(c, i, (0.82 + tooth * 0.3 - fracture * 0.3) * (0.74 + weather * 0.52));
    // Lichen is matte and it kills the mica sparkle it grows over.
    r[i] = clamp01((isMica ? 0.48 + tooth * 0.1 : 0.86 + (1 - crystal) * 0.1 + (tooth - 0.5) * 0.08) + lichen * 0.4);
    m[i] = 0;
  });
}

// ---- dry earth ----------------------------------------------------------
// Packed, crumbling, sun-dried soil, with the chopped-straw temper that makes it
// daub when it goes on a wall. It used to share a height field with the ground's
// detail map through a two-palette factory, and that sharing was the mistake:
// the arena floor needs turf structure and a wall of daub needs aggregate and
// drying cracks, and one field cannot be both. They are separate recipes now.
function buildDirt(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const earth = col(0x6f5e46);
  const damp = col(0x3c3225);
  const dust = col(0x9d8e6f);
  const pebble = col(0x847e72);
  const temper = col(0xa8945f);

  forEachTexel(size, (i, u, v) => {
    // Cracks find their own way through drying earth; a ridged field sampled
    // straight gives them the radial symmetry of a snowflake.
    warpUV(bank, u, v, 0.03);
    const wu = WARP[0];
    const wv = WARP[1];

    const roll = contrast(sampleField(bank.soft, u * 2, v * 2), 1.8);
    const tooth = sampleField(bank.grain, u * 6, v * 6);
    const gritty = sampleField(bank.fine, u * 20, v * 20);
    const pd = sampleCell(bank.micro, u * 1, v * 1);
    const pid = sampleCellId(bank.micro, u * 1, v * 1);
    // Rarer and much lower in contrast than the aggregate used to be. A field
    // of pale dots against dark earth is the single easiest thing for an eye to
    // recognise on the next tile along, and a daub wall at repeat 2 only gets
    // four tiles to hide it in.
    const stone = pid > 0.84 ? 1 - smoothstep(0.12, 0.58, pd) : 0;
    const crack = smoothstep(0.7, 0.96, sampleField(bank.ridge, wu * 3, wv * 3));
    // Chopped straw and chaff, worked in to stop the daub shrinking as it dries.
    // Stretched across the sample so it reads as fibre rather than as blotching.
    const straw = smoothstep(0.66, 0.94, sampleField(bank.fine, wu * 3, wv * 16));

    const height = clamp01(0.5 + (roll - 0.5) * 0.34 + (tooth - 0.5) * 0.18 + stone * 0.3
      + straw * 0.1 + (gritty - 0.5) * 0.08 - crack * 0.5);
    h[i] = height;
    mix(c, i, damp, earth, clamp01(roll * 1.4));
    toward(c, i, dust, clamp01((height - 0.6) * 2) * 0.5 * tooth);
    toward(c, i, pebble, stone * 0.45);
    toward(c, i, temper, straw * 0.75);
    // The crack lives in the height field, and therefore in the normal and the
    // cavity AO, which is where a crack belongs. Painting it into the albedo as
    // well drew a dark net over the wall that repeated visibly.
    gain(c, i, 1 + (gritty - 0.5) * 0.26 - 0.07 - crack * 0.16);
    r[i] = clamp01(0.94 - stone * 0.16 - (1 - roll) * 0.18 + (tooth - 0.5) * 0.06);
    m[i] = 0;
  });
}

// ---- ground detail ------------------------------------------------------
// The arena floor's albedo, and the only map in the set that is a *multiplier*:
// the terrain carries its art direction in vertex colours, so this modulates
// them and must never replace them. Two consequences decide the whole recipe.
//
// Its value range is narrow and its mean sits near white. A detail map with a
// two-stop swing does not add detail to coloured ground, it bleaches it — and
// bleaching is what the field of pale pebbles this used to be actually did:
// every square metre of the moot came back grey-white speckle with the green
// showing through in blotches, which is the AstroTurf read in the v2 capture.
//
// And what varies is hue rather than value: warmer where the ground is dry,
// darker and earthier where it is damp, warm-brown wherever the sward has been
// walked off. That way the vertex colour underneath gains variation instead of
// losing saturation.
//
// The damp used to be *green*, and between them the green here, the green in
// groundColor()'s vertex output and world.ts's turf hue nudge put three green
// pushes on the same pixels. With a broad sheen over the top of it the arena
// floor read as the surface of a stagnant pond in four of the eight presets —
// which is what a green, glossy, near-featureless plane is. The sheen is not the
// part to cut; a floor with no highlight structure is how `arena` went sixteen
// tonal buckets to twelve. What had to change is what the sheen is sitting *on*.
// So the damp is earth-coloured now, the trodden-bare fraction is roughly double,
// and the wetness is a fifth of the area at twice the depth: a scatter of held
// water in prints and hollows, with matte churned ground between them, rather
// than one damp sheet from the palisade to the fire.
//
// The structure is trodden turf rather than gravel, and it is deliberately
// pitched at the scale a boot works in — clumps at eleven centimetres, prints at
// the same, nap at a centimetre, grit below that. The pebbles that dominated it
// before are still here and are now what they should be: rare, small, and barely
// lighter than the soil around them.
function buildGroundDetail(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  // A multiplier's palette is a set of ratios, not a set of colours: materials.ts
  // divides the requested tint by this map's mean, so what these decide is how
  // far the floor swings around whatever the terrain's vertex colour says —
  // roughly half a stop either way — and in which direction the swing is hued.
  // Too narrow and the map adds nothing, which is where the first pass at this
  // landed; too wide and it bleaches, which is where the v2 capture was.
  const base = col(0xe4dfd3);
  const crown = col(0xfdf8ec);  // warm and light: dry, sun-caught clump tops
  const hollow = col(0xa9a493);  // earth-dark, barely cool: the shade between them
  const shadeT = col(0x7d6c53);  // warm and dark: wet earth at the bottom of a print
  const soilT = col(0xd2b489);   // warm: soil where the sward has gone
  const stoneT = col(0xefe9dc);  // grit crowns, a hair above the base and no more

  forEachTexel(size, (i, u, v) => {
    // Two thirds of a cell of warp, which is a lot. At six millimetres a texel
    // the lattice the clumps sit on is the thing most likely to read as pattern,
    // and it is cheaper to scramble it here than to add a field to hide it.
    warpUV(bank, u, v, 0.05);
    const wu = WARP[0];
    const wv = WARP[1];

    // Fourteen cells per tile is eleven centimetres: a tussock, and also about a
    // boot. One field carries the clumps, the prints and the bare scuffs, which
    // is why they all agree about where this ground has been walked on.
    const tuss = sampleCell(bank.cell, wu * 1, wv * 1);
    const tussId = sampleCellId(bank.cell, wu * 1, wv * 1);
    // Tufts, at two and a half centimetres — four texels long by one across,
    // which is the finest thing this map can hold without crawling. An individual
    // blade is half a texel at this density and belongs to `grass`, not here;
    // pretending otherwise is what made the v2 floor a field of aliased dots.
    const napA = sampleField(bank.fine, wu * 2, wv * 5);
    const napB = sampleField(bank.fine, wu * 5, wv * 2);
    // Ten millimetres, not five and a half. At u * 9 this landed 288 cells on a
    // 256 map — 0.9 of a texel, below what the base level can carry — and the
    // header's promise that "in the albedo that is dither and it mips away" only
    // holds for isotropic minification. The arena floor is a plane seen at a
    // grazing angle, where the sampler's footprint is far longer than the
    // anisotropy cap can follow, so it fetches a sharper level than the footprint
    // deserves and takes too few taps across it. That is the crawling sparkle
    // field in `arena`'s midground: sub-texel content in a map that is never
    // minified isotropically. Ten millimetres is still grit and it survives its
    // own mip chain.
    const grit = sampleField(bank.fine, u * 5, v * 5);
    const pebD = sampleCell(bank.micro, u * 2, v * 2);
    const pebId = sampleCellId(bank.micro, u * 2, v * 2);
    // Which way this clump's tufts lie. Per clump, off the field that defines
    // the clump, so a tussock leans one way and its neighbour another instead of
    // the whole arena being combed in one direction.
    const nap = napA + (napB - napA) * smoothstep(0.3, 0.7, tuss);

    const dome = 1 - smoothstep(0.05, 0.72, tuss);
    // The shade between the clumps: half the tile, and therefore the term that
    // decides what the floor's mid-tone *is*. It carries hue only now. It used to
    // carry the wetness as well, on the argument that a floor whose sheen sits
    // where its colour does is one substance — true, but half a tile is not a
    // hollow, and half a tile of sheen is a wet sheet.
    const damp = smoothstep(0.3, 0.8, tuss);
    // Where water actually stands: the last third of the way into the trough
    // between clumps, which is a connected but narrow web rather than a plane.
    const well = smoothstep(0.66, 0.96, tuss);
    // A boot fills the ground it lands on, so a print takes most of its cell
    // rather than sitting as a dot in the middle of it. A hard little disc in a
    // fifth of the cells is how the first attempt at this turned the arena floor
    // into polka dots — the shape is what stops that, not the rarity, so this can
    // afford to be twice as common as it was. A moot floor is trodden.
    const print = tussId > 0.72 ? smoothstep(0.78, 0.16, tuss) : 0;
    const bare = tussId < 0.3 ? smoothstep(0.72, 0.18, tuss) : 0;
    const peb = pebId > 0.9 ? 1 - smoothstep(0.14, 0.5, pebD) : 0;

    // Relief up by a quarter on both the clumps and the prints, and it is doing
    // the same job as the colour changes above. A broad sheen on a flat plane is
    // water; the same sheen broken across eleven-centimetre domes and boot holes
    // is wet ground. The one lever this recipe has on that read is how much
    // eleven-centimetre landform the normal map carries.
    const height = clamp01(0.5
      + dome * 0.25
      + (nap - 0.5) * 0.26
      + (grit - 0.5) * 0.08
      + peb * 0.16
      - print * 0.42
      - bare * 0.1);
    h[i] = height;

    set(c, i, base);
    // The clumps carry the read: crowns warm and light, the shade between them
    // earth-dark. That eleven-centimetre light-and-shade is what gives the floor
    // form at the distance a fight is watched from — anything at a centimetre has
    // mipped down to one flat tone long before then, which is the whole reason a
    // map made of grit read as AstroTurf.
    //
    // Order matters below: soil and print bottoms go on *after* the hollow, so
    // trodden ground overrides damp rather than averaging with it. Warm brown
    // over a third of the floor is what the frame was missing — a moot has been
    // walked on all evening, and the one thing it cannot be is uniform.
    toward(c, i, crown, clamp01(dome * 1.3) * 0.65);
    toward(c, i, hollow, damp * 0.6);
    toward(c, i, soilT, bare * 0.8);
    toward(c, i, shadeT, print * 0.62);
    toward(c, i, stoneT, peb * 0.4);
    gain(c, i, 0.88 + (nap - 0.5) * 0.3 + (grit - 0.5) * 0.12);

    // Wet ground is a roughness story, not a colour story, and this is where the
    // arena's puddle rims and hoof-holes come from without a second material.
    // Only the genuinely low ground holds water — print bottoms and the hollows
    // between clumps — because half the moot at 0.35 is a lake. materials.ts
    // divides this channel by the substance's own mean, so what matters here is
    // the spread and not the level.
    //
    // Both terms are landform, and that is the correction the v3 capture forced.
    // This used to read `smoothstep(0.36, 0.14, height)`, and `height` carries the
    // nap and the grit — two taps that run at or past one texel. So the threshold
    // fired on hash: individual texels came out at a third of the roughness of the
    // ground touching them, world.ts multiplied the channel by 0.42 again wherever
    // the vertex colour says churn, and at the bottom of that chain a dielectric
    // at a grazing angle handed back the dusk sky. The bloom pass spread each hit
    // over four or five pixels and the moot came back salted. `damp` is the same
    // eleven-centimetre field the clumps and the colour already use, so what is
    // wet now is a hollow rather than a texel.
    //
    // What changed since is *how much* of the floor is wet, and it is the other
    // half of the pond read. `damp` is the trough web between clumps and covers
    // close to half the tile, so at 0.55 the whole open arena carried a sheen and
    // world.ts's own churn term put another 0.4 of a clamp to 0.34 on top of it.
    // Two broad wet terms multiplied is a sheet of water, and a sheet of water
    // over a green plane is a pond however the vertex colours are graded.
    //
    // So the water moves into the places water is: the bottoms of prints, and the
    // deepest third of the trough web. That is about a fifth of the area instead
    // of a half. The depth goes the other way — 0.46 rather than 0.34 — so the
    // held water is genuinely reflective where it exists, and the dry floor rises
    // to 0.97 and is matte. That trade is deliberately *toward* contrast, not away
    // from it: the highlight structure `portrait` and `stance` were marked down on
    // is a scatter of bright wells against matte churn, and it survives being
    // multiplied by world.ts's clamp where an even sheen only ever averaged.
    const held = clamp01(print * 0.95 + well * 0.5);
    r[i] = clamp01(0.97 - held * 0.46 - bare * 0.06 + (grit - 0.5) * 0.04);
    m[i] = 0;
  });
}

// ---- churned mud --------------------------------------------------------
// Mud is not wet dirt, it is *displaced* dirt: a boot pushes a lobe of it
// sideways and leaves a hole behind that fills with water. So this is built out
// of prints and the ridges thrown up round them rather than out of noise, and
// the whole sample is heavily domain-warped because churned ground is smeared —
// it has been dragged, and nothing in it is radially symmetric.
//
// The wetness is carried by roughness, from 0.08 in the standing water to 0.92
// on the dry crests. That eleven-fold spread is the entire difference between
// mud and brown paint: at 0.08 the water hands back the dusk sky and the
// bonfire as a specular sheen, which is the only cue that reads as *wet*.
function buildMud(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const water = col(0x1d1610);
  const wetMud = col(0x2e2317);
  const damp = col(0x4d3b26);
  const drying = col(0x7a6546);
  const crust = col(0x9a8867);
  const straw = col(0xa2905c);
  const MUD: readonly RGB[] = [water, wetMud, damp, drying, crust];

  forEachTexel(size, (i, u, v) => {
    warpUV(bank, u, v, 0.05);
    const wu = WARP[0];
    const wv = WARP[1];

    const swell = contrast(sampleField(bank.soft, u * 2, v * 2), 2.1);
    // Fourteen cells per tile, the same eleven-centimetre grid the ground detail
    // works in, and for the same reason: it is the size of the thing doing the
    // churning. Read near the cell centre, where a distance field's contours are
    // still round — thresholded out near the boundary it draws the Voronoi
    // polygon, and a floor of angular holes is how this first came back.
    const lobeD = sampleCell(bank.cell, u * 1, v * 1);
    const lobeId = sampleCellId(bank.cell, u * 1, v * 1);
    const crumbD = sampleCell(bank.micro, u * 1, v * 1);
    // Sampled long in one axis so the churn reads as dragged rather than dabbed.
    const smear = sampleField(bank.grain, wu * 2, wv * 6);
    const grit = sampleField(bank.fine, u * 14, v * 14);
    const crack = smoothstep(0.76, 0.98, sampleField(bank.ridge, wu * 3, wv * 3));

    // The basin is where the ground *is*: broad, smooth, and the only thing the
    // water is allowed to know about. The relief is what has been done to it —
    // prints pressed in, the ground they displaced standing in a lip around
    // them, ridges shoved up between, crumbs, and the cracks in what has dried.
    // Splitting the two is what stops every print filling with black: a boot
    // print in ground that happens to be high stays dry, and it is the low
    // corner of the churn that stands in water, in one connected sheet.
    // The smear inside the threshold is what stops these being polka dots: a flat
    // round disc of anything, however well shaded, reads as a spot. Adding the
    // drag field to the distance ragged-edges the outline, breaks the floor up,
    // and lets neighbouring impressions run into one another the way boot prints
    // in ground that has been fought over actually do.
    const edge = lobeD + (smear - 0.5) * 0.55;
    const press = lobeId > 0.84 ? smoothstep(0.5, 0.16, edge) : 0;
    const lip = press > 0 ? clamp01(1 - Math.abs(edge - 0.54) * 4.2) * 0.8 : 0;
    const ridge = smoothstep(0.14, 0.84, lobeD);
    const crumb = 1 - smoothstep(0.12, 0.62, crumbD);

    // Wide enough that a fifth of the churn is genuinely under water. Narrower
    // and the roughness split below never fires, which leaves mud that is only
    // brown — and the sheen is the one cue that reads as wet at all.
    const basin = clamp01(0.5 + (swell - 0.5) * 0.8 + (smear - 0.5) * 0.4);
    // Split so the water can be gated on the relief without the grit inside it.
    // `grit` is a fourteen-times tap and therefore about a texel wide: fine as
    // surface tooth in the height field, fatal in a wetness threshold, where it
    // turns a puddle into a scatter of individual mirror-bright texels. That is
    // the mistake the ground detail's `held` term was making in the v3 capture,
    // and mud is the surface where it would cost the most, because mud is the one
    // whose roughness genuinely goes low enough to reflect.
    const relief = clamp01(basin
      + ridge * 0.1
      + crumb * 0.1
      + lip * 0.14
      - press * 0.3
      - crack * 0.08);
    const height = clamp01(relief + (grit - 0.5) * 0.06);
    h[i] = height;

    const flood = clamp01(smoothstep(0.4, 0.13, basin) * (0.65 + 0.45 * smoothstep(0.52, 0.2, relief)));
    // The film is the band above the waterline that is saturated but not
    // submerged. It is what stops a puddle having a drawn edge.
    const filmT = smoothstep(0.58, 0.36, basin) * (1 - flood);

    // The ramp runs on the basin with the relief allowed to pull it a little way
    // down, and no further. Let the relief drive the ramp outright and every
    // print bottoms out at the water colour wherever it happens to fall, which
    // reads as a floor of black holes; hold it and a print in dry ground is the
    // same mud a shade darker, which is what a print in dry ground is.
    ramp(MUD, (Math.max(height, basin - 0.08) - 0.16) * 1.4);
    set(c, i, RAMP);
    toward(c, i, water, flood * 0.7);
    // Trodden straw and grass pressed into the surface. A small term that does
    // most of the work of making the churn read as something walked through
    // rather than as a landform.
    toward(c, i, straw, smoothstep(0.72, 0.96, smear) * (1 - flood) * 0.42);
    gain(c, i, 0.9 + grit * 0.2 - crack * 0.12);

    // 0.84 put the standing water at 0.08, which is a mirror — correct for a
    // still pool and wrong for the two centimetres of gritty water in the bottom
    // of a boot print, which scatters. 0.74 keeps the eleven-fold spread this
    // recipe is built around and lands the flooded ground near 0.16: the sky comes
    // back soft-edged and readable rather than as a point of clipped white the
    // bloom pass then turns into a star. world.ts's puddle meshes are the place
    // for a true mirror, and they already are one at 0.045.
    r[i] = clamp01(0.9 - flood * 0.74 - filmT * 0.26 + (grit - 0.5) * 0.05);
    m[i] = 0;
  });
}

// ---- turf ---------------------------------------------------------------
// The hardest surface in the set, because it has to hold two reads out of one
// tile: individual blades from a boot's height, and clumped, colour-varied
// pasture from across the moot. Three layers, largest first, which is the order
// the eye takes them in:
//
//   - vigour, at six cells per tile. Where the sward is thick, where it is worn
//     to soil, where it is dry. This is what clumps the blades — grass grows in
//     tussocks and the version that failed the capture grew it on a grid.
//   - blades, one bent blade per root cell, each with its own length, lean and
//     place on the green-to-straw run.
//   - substrate: soil, grit and moss between and under them.
//
// Colour is the point of the rewrite as much as structure is. The old recipe was
// one green with noise on it and two accents; this one runs a four-stop ramp from
// cool deep green through yellow-green to straw and dead brown, over moss in the
// damp shade and two soils where the sward has gone — which is what "the ground
// has colour variation" has to mean before any amount of relief will read.
//
// world.ts consumes this map twice over: as the tuft blades' albedo, and as a
// *luminance ratio* blended into the terrain wherever the vertex colour says
// turf. The second use is why the clumping matters more than the blades do — a
// ratio of a near sample to a wide one turns whatever spatial frequency
// dominates this tile into what the arena floor looks like from twenty metres,
// and five-centimetre dots at twenty metres are a nylon carpet.
function buildGrass(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  // A blade narrower than about two texels is aliasing crawl, which is failure
  // #10 on the bar. The root grid coarsens with the map rather than keeping a
  // count the low tier cannot resolve.
  const CELLS = size >= 256 ? 24 : 14;

  const lush = col(0x44622a);
  const midGreen = col(0x6b7c33);
  const dryBlade = col(0x9b8b4a);
  const deadStraw = col(0x7b6434);
  const moss = col(0x33512f);
  const soilWet = col(0x3a2f21);
  const soilDry = col(0x877450);
  // Both of these are lighter and darker than they were, and the reason is not
  // this map. world.ts blends turf into the terrain as a *luminance ratio* — a
  // 1.4 m sample over a 23 m one, clamped to 0.35..2.2 — so whatever internal
  // contrast this tile has is what gets multiplied onto the arena floor. At
  // 0x1b2612 against 0xb6bd7c that ratio spent most of its time on one clamp or
  // the other, which paints the moot in alternating acid green and near-black at
  // the blade scale: pond weed, which is exactly what `stance` and `arena` came
  // back as. Pulling the two ends toward each other lands the ratio inside its
  // clamps, where it modulates instead of posterising. Trodden pasture is a low
  // contrast substance; it was drawn as a high contrast one.
  const shade = col(0x2c3720);   // between the blades, where little light gets
  const tipCol = col(0x9aa46a);  // sun-caught blade edges
  const bruised = col(0x596139); // grass that has been stood on
  const BLADE: readonly RGB[] = [lush, midGreen, dryBlade, deadStraw];

  // Every root resolved once, before the texel loop. Two reasons, and the second
  // is the one that matters. Nine candidate roots per texel used to mean nine
  // sine-cosine pairs and forty-five hashes per texel, which is most of what
  // this recipe cost; and a root's vigour is now read at the root rather than at
  // whichever texel happens to be looking at it, which is what actually clumps
  // the sward. A tussock's blades are long together and short together, because
  // they grow out of the same patch of ground.
  const n = CELLS * CELLS;
  const rootX = new Float32Array(n);
  const rootY = new Float32Array(n);
  const dirX = new Float32Array(n);
  const dirY = new Float32Array(n);
  const bladeLen = new Float32Array(n);
  const invLen2 = new Float32Array(n);
  const bladeLift = new Float32Array(n);
  const bladeTone = new Float32Array(n);
  const inv = 1 / CELLS;
  for (let y = 0; y < CELLS; y++) {
    for (let x = 0; x < CELLS; x++) {
      const k = y * CELLS + x;
      const rx = 0.15 + hash2(x + 5, y + 3) * 0.7;
      const ry = 0.15 + hash2(x + 7, y + 11) * 0.7;
      rootX[k] = rx;
      rootY[k] = ry;
      const ang = hash2(x, y) * Math.PI * 2;
      dirX[k] = Math.cos(ang);
      dirY[k] = Math.sin(ang);
      // Sampled at the root, at exactly the scales the texel loop reads them, so
      // the clump and the ground under it never disagree.
      const ru = (x + rx) * inv;
      const rv = (y + ry) * inv;
      const vig = contrast(sampleField(bank.soft, ru * 2, rv * 2), 2.0);
      const dry = contrast(sampleField(bank.grain, ru, rv), 1.7);
      // The vigour factor spans 0.55 to 1.3 and multiplies both the length and
      // the prominence, so a thin patch is short, faint blades over soil and a
      // thick one is a tussock. That range is where the clumping comes from; the
      // top of it is held at 1.5 cells because the 3x3 root search below cannot
      // see a blade longer than that.
      const len = (0.45 + hash2(x + 91, y + 17) * 0.7) * (0.55 + vig * 0.75);
      bladeLen[k] = len;
      invLen2[k] = 1 / (len * len);
      // Whether this root grew at all. Scaling every blade by its patch made the
      // sward *shorter* in the thin places but never *thinner*, and a uniformly
      // dense field of short blades is a carpet. Grass thins by losing roots, so
      // below a threshold the root is simply absent — dithered by a per-cell
      // hash, so the edge of a bare patch is a scatter of survivors and not a
      // contour line.
      const survive = smoothstep(0.06, 0.36, vig + (hash2(x + 5, y + 77) - 0.5) * 0.24);
      bladeLift[k] = (0.42 + hash2(x + 31, y + 53) * 0.58) * (0.58 + vig * 0.7) * survive;
      // The patch decides most of where a clump sits on the green-to-straw run,
      // so a dry stretch of the moot goes straw as a stretch.
      bladeTone[k] = clamp01(hash2(x + 71, y + 13) * 0.42 + dry * 0.95 - 0.26);
    }
  }

  forEachTexel(size, (i, u, v) => {
    warpUV(bank, u, v, 0.02);

    // Expanded exactly as the per-root sample above is, or the moss and the
    // blades disagree about where the thin ground is.
    const vigour = contrast(sampleField(bank.soft, u * 2, v * 2), 2.0);
    const mottle = sampleField(bank.grain, u * 3, v * 3);
    // Six, not twelve: at twelve this put 384 cells on a 256 map, two thirds of
    // a texel, and world.ts fetches this tile at a grazing angle on the terrain
    // where the anisotropy cap cannot follow the footprint. Sub-texel content
    // there is not dither, it is crawl. See the same correction in the ground
    // detail's `grit`.
    const grit = sampleField(bank.fine, u * 6, v * 6);
    const tussD = sampleCell(bank.cell, u * 1, v * 1);
    const tussId = sampleCellId(bank.cell, u * 1, v * 1);

    // A boot crushes a clump, not a texel, so trampling is gated on a cell id
    // and shaped by that cell's own distance field.
    const trampled = tussId > 0.79 ? smoothstep(0.6, 0.1, tussD) : 0;
    // Moss takes the damp shade between the clumps, and it is a mat — no blades,
    // its own hue, and the roughest thing out here.
    const mossT = clamp01(smoothstep(0.46, 0.08, vigour) * smoothstep(0.26, 0.7, tussD) * 1.25);

    const cu = WARP[0] * CELLS;
    const cv = WARP[1] * CELLS;
    const c0 = Math.floor(cu);
    const c1 = Math.floor(cv);
    let cover = 0;
    let tone = 0.5;
    let along = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const gy = c1 + dy;
      // wrapi rather than a pair of branches: the warp can push the query a
      // whole cell outside the grid, and a single-step wrap gets that wrong.
      const row = wrapi(gy, CELLS) * CELLS;
      const gyc = gy - cv;
      for (let dx = -1; dx <= 1; dx++) {
        const gx = c0 + dx;
        const k = row + wrapi(gx, CELLS);
        const ox = gx + rootX[k] - cu;
        const oy = gyc + rootY[k];
        // No blade reaches further than about 1.5 cells from its root, so a root
        // beyond that cannot touch this texel — cheap rejection before the
        // segment maths, which is the hot part of the whole recipe.
        if (ox * ox + oy * oy > 3.4) continue;
        const len = bladeLen[k];
        const ex = dirX[k] * len;
        const ey = dirY[k] * len;
        // Distance to the blade as a line segment from its root. The direction is
        // a unit vector, so its squared length is the blade length squared and
        // the projection's divisor was precomputed.
        let t = (-ox * ex - oy * ey) * invLen2[k];
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = ox + ex * t;
        const py = oy + ey * t;
        const d2 = px * px + py * py;
        // A blade tapers toward its tip, and the floor on the width is the
        // two-texel rule above written in cell units. The falloff is evaluated
        // in the squared domain: not the same curve as a smoothstep on the
        // distance, but a taper either way, and it saves nine roots a texel.
        const wide = 0.24 - t * 0.1;
        const hi = wide * wide;
        if (d2 >= hi) continue;
        const lo = hi * 0.13;
        const s = d2 <= lo ? 0 : (d2 - lo) / (hi - lo);
        const lift = (1 - s * s * (3 - 2 * s)) * bladeLift[k] * (1 - t * 0.25);
        if (lift > cover) { cover = lift; tone = bladeTone[k]; along = t; }
      }
    }
    // Trodden grass is lying down, not gone: it loses relief and definition
    // rather than colour, so the crush lands on the cover and not on the ramp.
    cover *= 1 - trampled * 0.55;
    const blade = clamp01(cover * 1.7);

    // Substrate first, blades over it.
    mix(c, i, soilWet, soilDry, clamp01(grit * 0.7 + mottle * 0.6));
    toward(c, i, moss, mossT * 0.85);

    // Every root has its own place on the ramp and its own patch pushed it
    // there, so a dry stretch of the moot is dry *blades* and not tinted ones.
    ramp(BLADE, tone + (mottle - 0.5) * 0.3);
    toward(c, i, RAMP, blade * 0.95);
    // The gaps between blades are in shadow, and that self-occlusion is most of
    // what makes a sward read as having depth when it is looked down on. Kept,
    // at three quarters of its weight: it is a real cue at a boot's height and a
    // liability at twenty metres, where it is what the luminance ratio in
    // world.ts turns into black speckle between the bright blades.
    toward(c, i, shade, (1 - blade) * 0.24);
    toward(c, i, tipCol, clamp01((cover - 0.5) * 2.2) * (0.2 + along * 0.5) * 0.26);
    toward(c, i, bruised, trampled * 0.5);
    gain(c, i, 0.9 + mottle * 0.18 + (grit - 0.5) * 0.1);

    h[i] = clamp01(cover * 0.72
      + (1 - tussD) * 0.16 * (1 - trampled)
      + mossT * 0.05
      + (grit - 0.5) * 0.08
      + 0.06
      - trampled * 0.1);
    // A blade has a waxy cuticle and is the least rough thing here; bare soil
    // and moss are the roughest; crushed grass is bruised and shines. The wet
    // term is the damp under the mat, where the sun never reaches.
    const wet = clamp01(mossT * 0.45 + smoothstep(0.3, 0.05, cover) * smoothstep(0.5, 0.15, vigour) * 0.5);
    r[i] = clamp01(0.96 - blade * 0.14 - trampled * 0.2 - wet * 0.4 + (grit - 0.5) * 0.05);
    m[i] = 0;
  });
}

// ---- skin ---------------------------------------------------------------
function buildSkin(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const mid = col(0xd8b391);
  const blush = col(0xc07f63);
  const pale = col(0xefd6bb);
  const freckle = col(0x9a6a4b);

  forEachTexel(size, (i, u, v) => {
    const poreD = sampleCell(bank.micro, u * 4, v * 4);
    const pore = 1 - smoothstep(0, 0.45, poreD);
    // Skin creases are a dense fine net, not a few big folds. Sampling the
    // ridge field low made a jigsaw; the whole read lives in the high octave.
    const netA = smoothstep(0.5, 0.92, sampleField(bank.ridge, u * 8, v * 8));
    const netB = smoothstep(0.62, 1, sampleField(bank.ridge, u * 16, v * 16));
    const wrinkle = clamp01(netA * 0.7 + netB * 0.6);
    const flush = sampleField(bank.soft, u * 2, v * 2);
    const mottle = sampleField(bank.grain, u * 6, v * 6);
    const speck = sampleCellId(bank.micro, u * 4, v * 4);

    const height = clamp01(0.68 - pore * 0.2 - wrinkle * 0.34 + (flush - 0.5) * 0.08);
    h[i] = height;
    set(c, i, mid);
    // Blood sits close under the surface, so the creases and the low-frequency
    // blotching both go red. Flat skin colour is what reads as a mannequin.
    toward(c, i, blush, clamp01(smoothstep(0.4, 0.85, flush) * 0.8 + wrinkle * 0.55 + (mottle - 0.5) * 0.5));
    toward(c, i, pale, clamp01((height - 0.66) * 4) * 0.5);
    toward(c, i, freckle, speck > 0.94 ? pore * 0.6 : 0);
    gain(c, i, 0.94 + (mottle - 0.5) * 0.14);
    // Sebum sits on the crowns; the creases stay dry. Without that split the
    // face reads as painted clay.
    r[i] = clamp01(0.62 - clamp01((height - 0.64) * 4) * 0.22 + wrinkle * 0.14 + pore * 0.08);
    m[i] = 0;
  });
}

// ---- bone ---------------------------------------------------------------
function buildBone(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const ivory = col(0xd9cdb2);
  const stain = col(0x8a7a5c);
  const cavity = col(0x584c39);

  forEachTexel(size, (i, u, v) => {
    const porous = sampleCell(bank.micro, u * 4, v * 4);
    const pore = 1 - smoothstep(0.05, 0.45, porous);
    const crack = smoothstep(0.78, 0.98, sampleField(bank.ridge, u * 3, v * 3));
    const age = sampleField(bank.soft, u * 2, v * 2);
    const tooth = sampleField(bank.grain, u * 9, v * 9);

    const height = clamp01(0.7 - pore * 0.3 - crack * 0.4 + (tooth - 0.5) * 0.1);
    h[i] = height;
    set(c, i, ivory);
    toward(c, i, stain, smoothstep(0.5, 0.95, age) * 0.6);
    toward(c, i, cavity, Math.max(pore * 0.7, crack * 0.85));
    gain(c, i, 0.88 + tooth * 0.22);
    r[i] = clamp01(0.55 + pore * 0.3 + crack * 0.2 - clamp01((height - 0.7) * 3) * 0.12);
    m[i] = 0;
  });
}

// ---- blood --------------------------------------------------------------
// A cutout decal, so the coverage lives in the albedo's alpha. Fresh in the
// middle of the pool and congealed at the rim, because blood does that.
function buildBlood(g: Gen): void {
  const { size, h, r, m, c, bank, a } = g;
  const fresh = col(0x5c0d08);
  const congealed = col(0x2a0704);
  const rim = col(0x140302);

  forEachTexel(size, (i, u, v) => {
    let dx = u - 0.5;
    let dy = v - 0.5;
    dx -= Math.round(dx);
    dy -= Math.round(dy);
    const d = Math.sqrt(dx * dx + dy * dy) * 2;
    // The splash edge is ragged, and it throws satellite droplets.
    const ragged = 0.62 + (sampleField(bank.soft, u * 2, v * 2) - 0.5) * 0.55;
    const pool = smoothstep(ragged, ragged - 0.22, d);
    const spatter = smoothstep(0.66, 0.88, sampleField(bank.fine, u * 3, v * 3)) * smoothstep(1.1, 0.55, d);
    const cover = clamp01(Math.max(pool, spatter));

    const surface = sampleField(bank.fine, u * 8, v * 8);
    const height = clamp01(cover * 0.7 + surface * 0.18 + 0.05);
    h[i] = height;
    mix(c, i, congealed, fresh, clamp01((cover - 0.35) * 1.8));
    toward(c, i, rim, smoothstep(0.55, 0.1, cover) * 0.8);
    // Wet in the deep centre, tacky and dulling out toward the drying edge.
    r[i] = clamp01(0.5 - cover * 0.4 + (surface - 0.5) * 0.1);
    m[i] = 0;
    if (a) a[i] = cover;
  });
}

/** Surfaces that have a generator of their own, i.e. everything but the aliases. */
type BaseSurface = Exclude<SurfaceName, "ground" | "wood" | "stone" | "cloth">;

const RECIPES: Record<BaseSurface, Recipe> = {
  mail:    { detail: "hero", tint: 0x4a5568, roughness: 0.45, metalness: 0.85, normalScale: 1.15, aoIntensity: 1.1, bump: 2.6, cavity: 1.15, repeat: 3, build: buildMail },
  iron:    { detail: "prop", tint: 0x2f343b, roughness: 0.55, metalness: 0.9,  normalScale: 0.9,  aoIntensity: 0.9, bump: 1.6, cavity: 0.9,  repeat: 2, build: buildIron },
  steel:   { detail: "hero", tint: 0xb8c0ca, roughness: 0.18, metalness: 1,    normalScale: 0.6,  aoIntensity: 0.6, bump: 1.1, cavity: 0.7,  repeat: 2, build: buildSteel },
  bronze:  { detail: "prop", tint: 0x9a7038, roughness: 0.38, metalness: 0.92, normalScale: 0.95, aoIntensity: 0.95, bump: 1.7, cavity: 1,   repeat: 2, build: buildBronze },

  wool:    { detail: "prop", tint: 0x8d8478, roughness: 0.95, metalness: 0, normalScale: 1,    aoIntensity: 1.15, bump: 2.2, cavity: 1.25, repeat: 4, build: buildWool },
  linen:   { detail: "prop", tint: 0xb0a48c, roughness: 0.86, metalness: 0, normalScale: 0.85, aoIntensity: 1,    bump: 1.9, cavity: 1.1,  repeat: 6, build: buildLinen },
  leather: { detail: "prop", tint: 0x64411f, roughness: 0.62, metalness: 0, normalScale: 1.05, aoIntensity: 1,    bump: 2,   cavity: 1,    repeat: 3, build: buildLeather },
  rope:    { detail: "prop", tint: 0x9a8455, roughness: 0.95, metalness: 0, normalScale: 1.2,  aoIntensity: 1.1,  bump: 2.4, cavity: 1.1,  repeat: 4, build: buildRope },

  oak:     { detail: "prop", tint: 0x8d6a44, roughness: 0.88, metalness: 0, normalScale: 0.85, aoIntensity: 0.9,  bump: 1.5, cavity: 0.9, repeat: 2, build: buildOak },
  plank:   { detail: "prop", tint: 0x776d5f, roughness: 0.95, metalness: 0, normalScale: 1.1,  aoIntensity: 1,    bump: 2,   cavity: 1,   repeat: 2, build: buildPlank },
  thatch:  { detail: "prop", tint: 0x8d7a52, roughness: 0.98, metalness: 0, normalScale: 1.3,  aoIntensity: 1.25, bump: 2.6, cavity: 1.3, repeat: 3, build: buildThatch },

  granite: { detail: "prop", tint: 0x9e9a91, roughness: 0.9,  metalness: 0, normalScale: 1,    aoIntensity: 1,    bump: 1.8, cavity: 1,   repeat: 2, build: buildGranite },
  dirt:    { detail: "prop", tint: 0x6b5c46, roughness: 0.82, metalness: 0, normalScale: 0.95, aoIntensity: 1,    bump: 1.7, cavity: 1,   repeat: 8, build: buildDirt },
  // The two ground surfaces stay at the prop resolution, and that is a decision
  // rather than an omission. They are the most looked-at maps in the game — the
  // floor is half of every capture — so `hero` is tempting, and it was measured:
  // it costs about 300 ms of the 250 ms budget between them, and it buys 3 mm
  // texels instead of 6 mm on a surface whose partner is a vertex colour and
  // which world.ts already reads at two blended scales. What was wrong with the
  // floor in the v2 capture was never resolution; it was that a field of pale
  // pebbles is not turf. Their `roughness` is each recipe's own mean rather than
  // a round number, because materials.ts divides the requested scalar by it and
  // a wet response only survives that division if the bias comes out near one.
  // Measured after the specular-AA pass, which is the number the shader sees:
  // 0.876 and 0.614. Re-measure these if either recipe's roughness line changes.
  groundDetail: { detail: "prop", tint: 0xffffff, roughness: 0.88, metalness: 0, normalScale: 1.05, aoIntensity: 0.95, bump: 1.9, cavity: 0.95, repeat: 8, build: buildGroundDetail },
  mud:     { detail: "prop", tint: 0x4c3e2d, roughness: 0.61, metalness: 0, normalScale: 1.2,  aoIntensity: 1.1,  bump: 2.3, cavity: 1.1, repeat: 6, build: buildMud },
  grass:   { detail: "prop", tint: 0x51672f, roughness: 0.81, metalness: 0, normalScale: 1.15, aoIntensity: 1.15, bump: 2.3, cavity: 1.15, repeat: 4, build: buildGrass },

  skin:    { detail: "hero", tint: 0xd9a97e, roughness: 0.6,  metalness: 0, normalScale: 0.7,  aoIntensity: 0.8,  bump: 1.2, cavity: 0.8, repeat: 1, build: buildSkin },
  bone:    { detail: "prop", tint: 0xcfc2a6, roughness: 0.62, metalness: 0, normalScale: 0.9,  aoIntensity: 0.95, bump: 1.6, cavity: 1,   repeat: 2, build: buildBone },
  blood:   { detail: "prop", tint: 0x4a0a08, roughness: 0.2,  metalness: 0, normalScale: 0.8,  aoIntensity: 0.7,  bump: 1.4, cavity: 0.7, repeat: 1, cutout: true, build: buildBlood },
};

const ALIAS: Record<"ground" | "wood" | "stone" | "cloth", BaseSurface> = {
  ground: "dirt",
  wood: "oak",
  stone: "granite",
  cloth: "wool",
};

function resolve(name: SurfaceName): BaseSurface {
  switch (name) {
    case "ground":
    case "wood":
    case "stone":
    case "cloth":
      return ALIAS[name];
    default:
      return name;
  }
}

// ---------------------------------------------------------------------------
// Sprites
// ---------------------------------------------------------------------------

type SpriteFn = (u: number, v: number, out: Float32Array) => void;

const SPRITES: Record<SpriteName, SpriteFn> = {
  soft(u, v, out) {
    const d = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
    out[0] = out[1] = out[2] = 1;
    out[3] = Math.pow(1 - d, 2.2);
  },
  spark(u, v, out) {
    const d = Math.min(1, Math.hypot(u - 0.5, v - 0.5) * 2);
    const core = Math.pow(1 - d, 7);
    const halo = Math.pow(1 - d, 1.6) * 0.32;
    // Additive blending eats the colour, so the falloff has to carry the heat.
    out[0] = 1;
    out[1] = 0.55 + core * 0.45;
    out[2] = 0.2 + core * 0.75;
    out[3] = clamp01(core + halo);
  },
  smoke(u, v, out) {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const d = Math.min(1, Math.hypot(dx, dy) * 2);
    const ang = Math.atan2(dy, dx);
    // Barely off-round. Two multiplied sines made an eight-pointed star, which
    // is the one thing a puff of smoke must not be.
    const lump = 1 + 0.1 * Math.sin(ang * 3 + 1.1) + 0.06 * Math.sin(ang * 5 - 0.4);
    out[0] = out[1] = out[2] = 1;
    out[3] = Math.pow(clamp01(1 - d / lump), 2.4) * 0.62;
  },
  flame(u, v, out) {
    // Teardrop: narrower and longer as it rises.
    const y = clamp01(v);
    const width = 0.5 * Math.pow(1 - y, 0.55) + 0.04;
    const d = Math.abs(u - 0.5) / width;
    const body = clamp01(1 - d) * clamp01(1 - Math.pow(Math.abs(y * 2 - 0.55), 2.2));
    const hot = Math.pow(body, 3.5);
    out[0] = 1;
    out[1] = 0.35 + hot * 0.65;
    out[2] = 0.06 + hot * 0.8;
    out[3] = clamp01(Math.pow(body, 1.4));
  },
  splat(u, v, out) {
    const dx = u - 0.5;
    const dy = v - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    const ang = Math.atan2(dy, dx);
    // Summed harmonics at coprime frequencies, not a product: a product gives
    // an evenly spiked asterisk, and blood does not land in a rosette.
    const edge = 0.6
      + 0.13 * Math.sin(ang * 3 + 0.9)
      + 0.09 * Math.sin(ang * 5 - 2.1)
      + 0.05 * Math.sin(ang * 8 + 1.4)
      + 0.03 * Math.sin(ang * 13 + 0.3);
    // One satellite droplet, thrown clear of the main blob.
    const sat = Math.max(0, 1 - Math.hypot(dx - 0.29, dy + 0.2) * 11);
    const cover = clamp01(Math.max(smoothstep(edge, edge - 0.11, d), sat));
    out[0] = 0.4 + cover * 0.26;
    out[1] = 0.04 + cover * 0.04;
    out[2] = 0.03 + cover * 0.03;
    out[3] = cover;
  },
};

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

function makeTexture(
  data: Uint8Array,
  size: number,
  srgb: boolean,
  aniso: number,
  /**
   * A chain built by `ormMips`, level 0 first. three treats `mipmaps[0]` as the
   * base level for a `DataTexture`, so the array is the whole pyramid or nothing;
   * hand it a partial one and the sampler falls off the end into grey.
   */
  mips?: MipLevel[],
): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  if (mips) {
    tex.mipmaps = mips;
    tex.generateMipmaps = false;
  } else {
    tex.generateMipmaps = true;
  }
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

interface Built {
  set: TextureSet;
  info: SurfaceInfo;
  /** Every texture this surface owns, originals first, for teardown. */
  owned: THREE.Texture[];
}

export function createTextureLibrary(
  renderer: THREE.WebGLRenderer,
  settings: QualitySettings,
): TextureLibrary {
  const maxAniso = Math.min(settings.anisotropy, renderer.capabilities.getMaxAnisotropy());

  // 512 is the ceiling regardless of tier. Eighteen full PBR sets at 1024²
  // would be ~290 MB against a 40 MB budget, and these patterns are analytic —
  // the detail lives in the normal map, not in the texel count, so 1024 buys
  // memory pressure and nothing a player can see.
  const heroSize = Math.max(128, Math.min(settings.textureSize, 512));
  const propSize = Math.max(64, heroSize >> 1);
  const bankSize = heroSize <= 256 ? 128 : 256;

  const surfaces = new Map<string, Built>();
  const clones = new Map<string, TextureSet>();
  const sprites = new Map<SpriteName, THREE.Texture>();
  let bank: Bank | null = null;
  let generationMs = 0;
  let bytes = 0;

  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  function getBank(): Bank {
    if (!bank) {
      const t0 = now();
      bank = createBank(bankSize, 0x5e17a1);
      generationMs += now() - t0;
    }
    return bank;
  }

  function build(name: BaseSurface): Built {
    const t0 = now();
    const recipe = RECIPES[name];
    const size = recipe.detail === "hero" ? heroSize : propSize;
    const texels = size * size;

    const gen: Gen = {
      size,
      bank: getBank(),
      rng: mulberry32(0x9e3779b1 ^ (name.length * 2654435761)),
      h: new Float32Array(texels),
      r: new Float32Array(texels),
      m: new Float32Array(texels),
      c: new Float32Array(texels * 3),
      a: recipe.cutout ? new Float32Array(texels) : null,
    };
    recipe.build(gen);

    // From here on the height field is the band-limited one, and every map that
    // comes off it reads the same array — normal, cavity AO and the specular-AA
    // term alike. That keeps the coherence rule at the top of the file intact: a
    // normal map built from a filtered field and an AO map built from an
    // unfiltered one would disagree about where the relief is, which is the
    // "three unrelated images" failure by a subtler route.
    const hLo = bandLimit(gen.h, size);

    // The low tier carries albedo and normal only. That is not an arbitrary
    // cut: the normal map is what makes a surface read as a substance at all,
    // while roughness and AO degrade gracefully to the substance's scalars for
    // two fewer samplers per draw — and skipping the pack saves the cavity
    // blur as well. Low drops effects, never art direction.
    const packOrm = settings.tier !== "low";
    const ao = packOrm ? deriveAo(hLo, size, recipe.cavity) : null;
    const normal = deriveNormal(hLo, size, recipe.bump);

    // Roughness the frame can actually hold, in two steps and in this order.
    //
    // The lift first: sub-texel relief becomes lobe width, per `specularAA`.
    //
    // Then the same Nyquist notch the height got, because a roughness that
    // alternates between 0.1 and 0.9 texel to texel makes a highlight twinkle
    // whether or not the normals under it agree — steel's hairline scratches and
    // mud's drag field both write that pattern. Filtering roughness linearly
    // under-estimates it, which is the standard objection to touching this
    // channel; the answer is that the lift above has already banked the variance
    // as lobe width, so what the notch removes is the part that was double-counted
    // anyway. A value no texel can display is worse than one slightly too smooth.
    //
    // Only on the tiers that carry the map. The low tier falls back to the
    // recipe's scalar, which is a constant and cannot alias.
    let rough: Float32Array | null = null;
    if (packOrm) {
      const sigma = slopeVariance(gen.h, hLo, size, recipe.bump);
      rough = new Float32Array(texels);
      for (let i = 0; i < texels; i++) rough[i] = specularAA(clamp01(gen.r[i]), sigma[i]);
      bandLimit(rough, size, rough);
    }

    // The packed map and, for the substances that need it, its whole pyramid —
    // levels 1 and down decide their roughness from the normals they averaged, and
    // this is the only place that has them. Consumes `ao`, `rough` and `gen.m`,
    // which nothing below reads again.
    const wantChain = recipe.roughness < MIP_AA_CEILING;
    const ormChain = packOrm && ao && rough
      ? ormMips(size, ao, rough, gen.m, normal, wantChain)
      : null;

    const albedo = new Uint8Array(texels * 4);
    let mr = 0;
    let mg = 0;
    let mb = 0;
    const cover = gen.a;
    // Weighted by coverage, so a cutout's mean describes the part you can
    // actually see. Averaging in the transparent field would make every decal
    // read as near-black and send the colour compensation off a cliff.
    let weight = 0;
    for (let i = 0; i < texels; i++) {
      const j = i * 3;
      const o = i * 4;
      const cr = (clamp01(gen.c[j]) * 255) | 0;
      const cg = (clamp01(gen.c[j + 1]) * 255) | 0;
      const cb = (clamp01(gen.c[j + 2]) * 255) | 0;
      const w = cover ? clamp01(cover[i]) : 1;
      albedo[o] = cr;
      albedo[o + 1] = cg;
      albedo[o + 2] = cb;
      albedo[o + 3] = (w * 255) | 0;
      weight += w;
      mr += SRGB_TO_LINEAR[cr] * w;
      mg += SRGB_TO_LINEAR[cg] * w;
      mb += SRGB_TO_LINEAR[cb] * w;
    }
    const norm = 1 / Math.max(1, weight);

    const mapTex = makeTexture(albedo, size, true, maxAniso);
    const normalTex = makeTexture(normal, size, false, maxAniso);
    const ormTex = ormChain
      ? makeTexture(ormChain[0].data, size, false, maxAniso, ormChain.length > 1 ? ormChain : undefined)
      : undefined;
    mapTex.name = `${name}:albedo`;
    normalTex.name = `${name}:normal`;
    if (ormTex) ormTex.name = `${name}:orm`;

    // RGBA8 maps plus their mip chains.
    bytes += texels * 4 * (ormTex ? 3 : 2) * 1.34;
    generationMs += now() - t0;

    return {
      set: { map: mapTex, normalMap: normalTex, roughnessMap: ormTex, metalnessMap: ormTex, aoMap: ormTex },
      info: {
        mean: [mr * norm, mg * norm, mb * norm],
        tint: recipe.tint,
        roughness: recipe.roughness,
        metalness: recipe.metalness,
        normalScale: recipe.normalScale,
        aoIntensity: recipe.aoIntensity,
        repeat: recipe.repeat,
        cutout: recipe.cutout ?? false,
      },
      owned: ormTex ? [mapTex, normalTex, ormTex] : [mapTex, normalTex],
    };
  }

  function built(name: SurfaceName): Built {
    const key = resolve(name);
    let entry = surfaces.get(key);
    if (!entry) {
      entry = build(key);
      surfaces.set(key, entry);
    }
    return entry;
  }

  return {
    maxAnisotropy: maxAniso,
    get generationMs() { return generationMs; },
    get bytes() { return bytes; },

    surface(name) {
      return built(name).set;
    },

    tiled(name, repeatX, repeatY = repeatX) {
      const key = `${resolve(name)}|${repeatX}|${repeatY}`;
      let set = clones.get(key);
      if (!set) {
        const base = built(name).set;
        // Texture.copy already flags needsUpdate; only the repeat uniform differs.
        const view = (t?: THREE.Texture) => {
          if (!t) return undefined;
          const clone = t.clone();
          clone.repeat.set(repeatX, repeatY);
          return clone;
        };
        const map = view(base.map);
        const normalMap = view(base.normalMap);
        const orm = view(base.roughnessMap);
        set = { map, normalMap, roughnessMap: orm, metalnessMap: orm, aoMap: orm };
        clones.set(key, set);
      }
      return set;
    },

    info(name) {
      return built(name).info;
    },

    sprite(name) {
      let tex = sprites.get(name);
      if (!tex) {
        const size = settings.spriteSize;
        const data = new Uint8Array(size * size * 4);
        const px = new Float32Array(4);
        const fn = SPRITES[name];
        const inv = 1 / size;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            fn((x + 0.5) * inv, (y + 0.5) * inv, px);
            const o = (y * size + x) * 4;
            data[o] = clamp01(px[0]) * 255;
            data[o + 1] = clamp01(px[1]) * 255;
            data[o + 2] = clamp01(px[2]) * 255;
            data[o + 3] = clamp01(px[3]) * 255;
          }
        }
        tex = new THREE.DataTexture(data, size, size);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.generateMipmaps = true;
        tex.name = `sprite:${name}`;
        tex.needsUpdate = true;
        bytes += size * size * 4 * 1.34;
        sprites.set(name, tex);
      }
      return tex;
    },

    dispose() {
      // Clones share their source with the original, and three ref-counts the
      // GPU allocation by source, so both ends have to be released.
      for (const set of clones.values()) {
        set.map?.dispose();
        set.normalMap?.dispose();
        set.roughnessMap?.dispose();
      }
      for (const entry of surfaces.values()) {
        for (const tex of entry.owned) tex.dispose();
      }
      for (const tex of sprites.values()) tex.dispose();
      clones.clear();
      surfaces.clear();
      sprites.clear();
      bank = null;
      // Two megabytes of build-time scratch at the high tier. Not GPU memory and
      // not counted in `bytes`, but there is no reason to hold it across a match
      // boundary when the bank next to it is being dropped for the same reason.
      FILTER_SCRATCH.length = 0;
      bytes = 0;
    },
  };
}
