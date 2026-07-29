// Procedural PBR texture generation and cache.
//
// Nothing here is downloaded. Every map is computed into a DataTexture at
// runtime out of a small bank of shared noise fields, so the game stays a
// single instant-play link with no download step.
//
// Against VISUAL-BAR §4's ~250 ms / ~40 MB: all nineteen surfaces at the high
// tier come to 25 MB, comfortably inside. Time is the tighter one — the full
// set is roughly 400 ms on a mid laptop, so the budget only holds because
// generation is lazy and memoised per surface. The arena's catalog pulls
// eleven of them; the rest cost nothing until something asks. If that stops
// being true the levers, in order, are: drop `hero` to the prop resolution
// (a straight 4x on the three biggest), then halve the prop size.
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
//   - noise fields are only ever sampled at INTEGER scales (offsets are free);
//   - anything hashed off a cell index wraps that index before hashing.

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

/** fBm of tileable value noise, normalised to 0..1. */
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
  };
}

// ---------------------------------------------------------------------------
// Colour, all in sRGB 0..1 because that is the space the palette was authored
// in and the space the byte texture stores.
// ---------------------------------------------------------------------------

type RGB = readonly [number, number, number];
const col = (hex: number): RGB => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

function set(c: Float32Array, i: number, a: RGB): void {
  const j = i * 3;
  c[j] = a[0]; c[j + 1] = a[1]; c[j + 2] = a[2];
}
function mix(c: Float32Array, i: number, a: RGB, b: RGB, t: number): void {
  const j = i * 3;
  c[j] = a[0] + (b[0] - a[0]) * t;
  c[j + 1] = a[1] + (b[1] - a[1]) * t;
  c[j + 2] = a[2] + (b[2] - a[2]) * t;
}
function toward(c: Float32Array, i: number, b: RGB, t: number): void {
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

    h[i] = clamp01(0.78 - scratch * 0.14 - nick * 0.36 + (tooth - 0.5) * 0.03);
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

// ---- plain weave --------------------------------------------------------
// Warp threads run along V, weft along U. Each thread's over/under alternates
// smoothly along its own length, so the crossings interlock instead of forming
// a checkerboard — the checkerboard version has a visible seam at every cell.
interface WeaveOpts {
  threads: number;
  /** Yarn cross-section: soft fat wool, or crisp thin linen. */
  yarn: "soft" | "even" | "crisp";
  fuzz: number;
  base: RGB;
  shade: RGB;
  lift: RGB;
  roughLow: number;
  roughHigh: number;
  /** Irregular thread thickness — hemp and linen slub, worsted wool does not. */
  slub: number;
}

function weave(g: Gen, o: WeaveOpts): void {
  const { size, h, r, m, c, bank } = g;
  // Same reasoning as the thatch straws: below three texels a thread shimmers.
  const n = size >= 256 ? o.threads : Math.max(8, Math.round(o.threads * 0.6));
  const shape = o.yarn === "soft"
    ? (s: number) => Math.sqrt(s)
    : o.yarn === "crisp"
      ? (s: number) => s * Math.sqrt(s)
      : (s: number) => s;

  forEachTexel(size, (i, u, v) => {
    const su = u * n;
    const sv = v * n;
    // u and v are in [0,1), so the thread index is already inside the grid.
    const ku = su | 0;
    const kv = sv | 0;
    const fu = su - ku;
    const fv = sv - kv;

    const slubU = 1 - o.slub * sampleField(bank.grain, 0, v * 6 + ku * 0.37);
    const slubV = 1 - o.slub * sampleField(bank.grain, u * 6 + kv * 0.29, 0);
    const warp = shape(Math.sin(Math.PI * clamp01((fu - 0.5) / slubU + 0.5)));
    const weft = shape(Math.sin(Math.PI * clamp01((fv - 0.5) / slubV + 0.5)));

    // +1 = this segment passes over, -1 = under. Parity flips per thread, and
    // the thread's own profile falls to zero exactly where the parity jumps.
    const warpLift = (ku & 1 ? -1 : 1) * -Math.cos(Math.PI * (sv - 0.5));
    const weftLift = (kv & 1 ? 1 : -1) * -Math.cos(Math.PI * (su - 0.5));

    const hw = warp * (0.5 + 0.5 * (warpLift * 0.5 + 0.5));
    const hf = weft * (0.5 + 0.5 * (weftLift * 0.5 + 0.5));
    const top = Math.max(hw, hf);

    const fibre = sampleField(bank.fine, u * 14, v * 14);
    const dye = sampleField(bank.soft, u * 2, v * 2);
    h[i] = clamp01(top * 0.86 + (fibre - 0.5) * o.fuzz + 0.06);

    mix(c, i, o.shade, o.base, clamp01(top * 1.25));
    toward(c, i, o.lift, clamp01((top - 0.72) * 2.2) * 0.5);
    gain(c, i, 0.86 + dye * 0.26 + (fibre - 0.5) * 0.12);
    r[i] = clamp01(o.roughHigh - top * (o.roughHigh - o.roughLow) + (fibre - 0.5) * 0.08);
    m[i] = 0;
  });
}

const buildWool = (g: Gen) => weave(g, {
  threads: 13,
  yarn: "soft",
  fuzz: 0.22,
  base: col(0x9d968b),
  shade: col(0x4c463e),
  lift: col(0xc4bcae),
  roughLow: 0.86,
  roughHigh: 1,
  slub: 0.16,
});

const buildLinen = (g: Gen) => weave(g, {
  threads: 30,
  yarn: "crisp",
  fuzz: 0.1,
  base: col(0xb7ab93),
  shade: col(0x6a6152),
  lift: col(0xdcd3bc),
  roughLow: 0.7,
  roughHigh: 0.94,
  slub: 0.3,
});

// ---- tanned leather -----------------------------------------------------
function buildLeather(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const base = col(0x6b4626);
  const crease = col(0x2c1a0d);
  const rubbed = col(0x94693f);

  forEachTexel(size, (i, u, v) => {
    // Pebbled grain: the hide's follicle structure, one dome per cell. Coarse
    // on purpose — pebbling finer than a few texels turns into noise the mips
    // eat, and leather that reads as noise reads as nothing.
    const pebD = sampleCell(bank.micro, u * 1, v * 1);
    const peb = 1 - smoothstep(0, 0.68, pebD);
    // Two scales of stretch crease: broad folds and the fine cracking in them.
    const fold = smoothstep(0.4, 0.86, sampleField(bank.ridge, u * 1, v * 2));
    const fine = smoothstep(0.62, 1, sampleField(bank.ridge, u * 4, v * 6));
    const deep = clamp01(fold * 0.8 + fine * 0.45);
    const scuff = sampleField(bank.fine, u * 8, v * 8);
    const patina = sampleField(bank.soft, u * 2, v * 2);

    const height = clamp01(0.56 + peb * 0.32 - deep * 0.44 + (scuff - 0.5) * 0.09);
    h[i] = height;
    set(c, i, base);
    // The grain has to show in the albedo too, or the normal map is arguing
    // with a flat brown and the flat brown wins at any distance.
    toward(c, i, crease, clamp01(deep * 0.9 + (1 - peb) * 0.35));
    toward(c, i, rubbed, clamp01((peb - 0.35) * 1.8) * 0.6 * (0.4 + 0.6 * scuff));
    gain(c, i, 0.82 + patina * 0.36);
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
}

function wood(g: Gen, o: WoodOpts): void {
  const { size, h, r, m, c, bank, rng } = g;
  const knots: Array<[number, number, number]> = [];
  for (let i = 0; i < o.knots; i++) knots.push([rng(), rng(), 0.05 + rng() * 0.045]);
  const weathered = col(0x8f8a7e);

  forEachTexel(size, (i, u, v) => {
    const x = u - 0.5;
    const pith = 0.26 + (sampleField(bank.soft, u, v * 1) - 0.5) * o.wander;
    let rr = Math.sqrt(x * x + pith * pith) * o.rings;
    rr += (sampleField(bank.grain, u * 2, v * 1) - 0.5) * 0.8;

    // Knots pull the rings into tight concentric circles and darken hard.
    let knot = 0;
    for (let k = 0; k < knots.length; k++) {
      let dx = u - knots[k][0];
      let dy = v - knots[k][1];
      dx -= Math.round(dx);
      dy -= Math.round(dy);
      const d = Math.sqrt(dx * dx + dy * dy * 2.2);
      if (d > knots[k][2] * 3) continue;
      const t = smoothstep(knots[k][2] * 2.6, knots[k][2] * 0.4, d);
      if (t > knot) knot = t;
      rr += t * d * o.rings * 7;
    }

    const ring = frac(rr);
    const late = smoothstep(0.5, 0.72, ring) * (1 - smoothstep(0.86, 1, ring));
    const pore = sampleField(bank.fine, u * 40, v * 2) > 0.68 ? o.pore : 0;
    // Board edges sit where the triangle wave bottoms out, so the seam and the
    // tile wrap land on the same line and the repeat has somewhere to hide.
    const seam = o.seams > 0 ? smoothstep(0.06, 0, tri(u * o.seams)) : 0;
    const split = smoothstep(0.82, 0.99, sampleField(bank.ridge, u * 2, v * 1)) * o.erosion;

    const height = clamp01(0.55 + late * o.erosion * 0.55 - pore - seam * 0.9 - split * 0.5 - knot * 0.18);
    h[i] = height;
    mix(c, i, o.early, o.late, clamp01(late * 1.2));
    toward(c, i, o.knotCol, knot * 0.9);
    toward(c, i, weathered, o.grey * sampleField(bank.soft, u * 2, v * 2));
    gain(c, i, 0.86 + sampleField(bank.grain, u * 4, v * 2) * 0.26 - seam * 0.45 - split * 0.3);
    r[i] = clamp01(o.roughHigh - late * (o.roughHigh - o.roughLow) + pore * 0.4 + split * 0.2);
    m[i] = 0;
  });
}

const buildOak = (g: Gen) => wood(g, {
  rings: 11,
  wander: 0.5,
  early: col(0xa9835a),
  late: col(0x6b4a2b),
  knotCol: col(0x3a2513),
  knots: 2,
  erosion: 0.35,
  pore: 0.06,
  seams: 0,
  roughLow: 0.72,
  roughHigh: 0.92,
  grey: 0.08,
});

const buildPlank = (g: Gen) => wood(g, {
  rings: 8,
  wander: 0.7,
  early: col(0x8d8172),
  late: col(0x5d554a),
  knotCol: col(0x332c23),
  knots: 3,
  erosion: 1,
  pore: 0.1,
  seams: 4,
  roughLow: 0.82,
  roughHigh: 0.99,
  grey: 0.3,
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
  const STRAWS = size >= 256 ? 120 : 64;
  const straw = col(0xc2a465);
  const dry = col(0x8a7442);
  const weather = col(0x716a55);
  const deep = col(0x2a2318);

  forEachTexel(size, (i, u, v) => {
    const sv = v * COURSES;
    const course = wrapi(Math.floor(sv), COURSES);
    const fv = sv - Math.floor(sv);
    const lean = (hash2(course, 3) - 0.5) * 0.4;
    const su = (u + fv * lean) * STRAWS;
    const strand = wrapi(Math.floor(su), STRAWS);
    const fu = su - Math.floor(su);

    const seed = hash2(strand, course);
    const seed2 = hash2(strand * 3 + 1, course * 7);
    const prof = Math.sqrt(Math.sin(Math.PI * fu));
    // Straws stop at different depths, so the bundle has a ragged bottom edge.
    const reach = smoothstep(0.62 + seed * 0.38, 0.5 + seed * 0.38, fv);
    // The next course sits on top of this one's head.
    const overlap = 1 - smoothstep(0, 0.16, fv);

    const body = prof * (0.4 + seed2 * 0.35) * reach;
    const height = clamp01(body + overlap * 0.34 + sampleField(bank.fine, u * 10, v * 10) * 0.06);

    h[i] = height;
    mix(c, i, deep, straw, clamp01(body * 2.4));
    toward(c, i, dry, seed * 0.6);
    toward(c, i, weather, sampleField(bank.soft, u * 2, v * 2) * 0.55);
    gain(c, i, 0.7 + height * 0.5);
    r[i] = clamp01(0.99 - body * 0.14);
    m[i] = 0;
  });
}

// ---- granite ------------------------------------------------------------
// Interlocking crystals, each with its own mineral. The mica flecks are the
// only glossy thing in it, and they are what make stone sparkle under a torch.
function buildGranite(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const quartz = col(0xd3cfc4);
  const feldspar = col(0xb0968a);
  const plagio = col(0x9aa0a4);
  const mica = col(0x2f2d31);

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

    h[i] = height;
    if (id < 0.42) set(c, i, quartz);
    else if (id < 0.78) set(c, i, feldspar);
    else set(c, i, plagio);
    toward(c, i, mica, isMica ? 1 - smoothstep(0, 0.45, dm) : 0);
    gain(c, i, 0.82 + tooth * 0.3 - fracture * 0.35);
    r[i] = isMica ? 0.48 + tooth * 0.1 : clamp01(0.86 + (1 - crystal) * 0.1 + (tooth - 0.5) * 0.08);
    m[i] = 0;
  });
}

// ---- packed dirt --------------------------------------------------------
// Two palettes off one height field. The pale one is a *detail* albedo: the
// arena floor already carries its art direction in vertex colours, so its map
// has to multiply toward white instead of replacing the colour underneath.
interface DirtOpts { earth: RGB; damp: RGB; dust: RGB; pebble: RGB; contrast: number }

function dirtWith(o: DirtOpts) {
  return (g: Gen): void => dirt(g, o);
}

function dirt(g: Gen, o: DirtOpts): void {
  const { size, h, r, m, c, bank } = g;
  const earth = o.earth;
  const damp = o.damp;
  const dust = o.dust;
  const pebble = o.pebble;
  const k = o.contrast;

  forEachTexel(size, (i, u, v) => {
    const roll = sampleField(bank.soft, u * 2, v * 2);
    const tooth = sampleField(bank.grain, u * 6, v * 6);
    const gritty = sampleField(bank.fine, u * 20, v * 20);
    const pd = sampleCell(bank.micro, u * 1, v * 1);
    const pid = sampleCellId(bank.micro, u * 1, v * 1);
    const stone = pid > 0.7 ? 1 - smoothstep(0.12, 0.62, pd) : 0;
    const crack = smoothstep(0.7, 0.96, sampleField(bank.ridge, u * 3, v * 3));

    const height = clamp01(0.5 + (roll - 0.5) * 0.34 + (tooth - 0.5) * 0.18 + stone * 0.3 + (gritty - 0.5) * 0.08 - crack * 0.5);
    h[i] = height;
    mix(c, i, damp, earth, clamp01(roll * 1.4));
    toward(c, i, dust, clamp01((height - 0.6) * 2) * 0.5 * tooth);
    toward(c, i, pebble, stone * 0.75);
    gain(c, i, 1 + ((gritty - 0.5) * 0.26 - 0.07 - crack * 0.3) * k);
    r[i] = clamp01(0.94 - stone * 0.16 - (1 - roll) * 0.18 + (tooth - 0.5) * 0.06);
    m[i] = 0;
  });
}

const buildDirt = dirtWith({
  earth: col(0x6f5e46),
  damp: col(0x3e3427),
  dust: col(0x968769),
  pebble: col(0x7e7a70),
  contrast: 1,
});

const buildGroundDetail = dirtWith({
  earth: col(0xf2ece2),
  damp: col(0xc9c2b6),
  dust: col(0xfffdf7),
  pebble: col(0xe6e3dc),
  contrast: 0.55,
});

// ---- churned mud --------------------------------------------------------
// Wetness is a roughness story, not a colour story: the lows hold water, go
// near-mirror and darken; the crowns dry out and go matte.
function buildMud(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const wet = col(0x241c14);
  const damp = col(0x4b3d2c);
  const drySoil = col(0x7a6952);

  forEachTexel(size, (i, u, v) => {
    const churn = sampleField(bank.soft, u * 2, v * 2);
    const gouge = sampleCell(bank.cell, u * 4, v * 4);
    const tread = sampleField(bank.grain, u * 5, v * 5);
    const grit = sampleField(bank.fine, u * 16, v * 16);

    const height = clamp01(0.5 + (churn - 0.5) * 0.5 + (1 - gouge) * -0.22 + (tread - 0.5) * 0.2 + (grit - 0.5) * 0.06);
    // Only the genuinely low ground holds water. Letting the wet term reach
    // half the tile turned mud into tar, which is a different substance.
    const wetness = smoothstep(0.42, 0.14, height);

    h[i] = height;
    mix(c, i, damp, drySoil, clamp01((height - 0.34) * 1.9));
    toward(c, i, wet, wetness * 0.85);
    gain(c, i, 0.9 + grit * 0.26);
    r[i] = clamp01(0.92 - wetness * 0.78 + (grit - 0.5) * 0.06);
    m[i] = 0;
  });
}

// ---- trampled turf ------------------------------------------------------
function buildGrass(g: Gen): void {
  const { size, h, r, m, c, bank } = g;
  const CELLS = 26;
  const blade = col(0x51672f);
  const dryBlade = col(0x8a8446);
  const shadow = col(0x27331b);
  const soil = col(0x4b3f2e);

  forEachTexel(size, (i, u, v) => {
    const cu = u * CELLS;
    const cv = v * CELLS;
    const c0 = Math.floor(cu);
    const c1 = Math.floor(cv);
    let cover = 0;
    let tone = 0.5;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const gx = c0 + dx;
        const gy = c1 + dy;
        const wx = gx < 0 ? gx + CELLS : gx >= CELLS ? gx - CELLS : gx;
        const wy = gy < 0 ? gy + CELLS : gy >= CELLS ? gy - CELLS : gy;
        const ox = gx + 0.2 + hash2(wx + 5, wy + 3) * 0.6 - cu;
        const oy = gy + 0.2 + hash2(wx + 7, wy + 11) * 0.6 - cv;
        // No blade is longer than 1.4 cells, so a root further away than that
        // cannot touch this texel — cheap rejection before the segment maths.
        if (ox * ox + oy * oy > 2.8) continue;
        const ang = hash2(wx, wy) * Math.PI * 2;
        const len = 0.5 + hash2(wx + 91, wy + 17) * 0.9;
        // Distance to the blade as a line segment from its root.
        const ex = Math.cos(ang) * len;
        const ey = Math.sin(ang) * len;
        const t = clamp01((-ox * ex - oy * ey) / (ex * ex + ey * ey));
        const px = ox + ex * t;
        const py = oy + ey * t;
        const d = Math.sqrt(px * px + py * py);
        const w = 1 - smoothstep(0.06, 0.3, d);
        const lift = w * (0.55 + hash2(wx + 31, wy + 53) * 0.45) * (1 - t * 0.3);
        if (lift > cover) { cover = lift; tone = hash2(wx + 71, wy + 13); }
      }
    }
    const fleck = sampleField(bank.fine, u * 14, v * 14);
    const patch = sampleField(bank.soft, u * 2, v * 2);
    const height = clamp01(cover * 0.85 + (fleck - 0.5) * 0.1 + 0.08);

    h[i] = height;
    mix(c, i, soil, blade, clamp01(cover * 2.2));
    toward(c, i, dryBlade, clamp01(tone - 0.55) * 2 * patch);
    toward(c, i, shadow, (1 - clamp01(cover * 1.6)) * 0.45);
    gain(c, i, 0.82 + patch * 0.3 + (fleck - 0.5) * 0.14);
    r[i] = clamp01(0.92 - cover * 0.12);
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
  dirt:    { detail: "prop", tint: 0x6b5c46, roughness: 0.94, metalness: 0, normalScale: 0.95, aoIntensity: 1,    bump: 1.7, cavity: 1,   repeat: 8, build: buildDirt },
  groundDetail: { detail: "prop", tint: 0xffffff, roughness: 0.94, metalness: 0, normalScale: 0.95, aoIntensity: 0.85, bump: 1.7, cavity: 0.85, repeat: 8, build: buildGroundDetail },
  mud:     { detail: "prop", tint: 0x4c3e2d, roughness: 0.7,  metalness: 0, normalScale: 1.15, aoIntensity: 1.05, bump: 2.1, cavity: 1.05, repeat: 6, build: buildMud },
  grass:   { detail: "prop", tint: 0x51672f, roughness: 0.9,  metalness: 0, normalScale: 1.1,  aoIntensity: 1.1,  bump: 2.2, cavity: 1.1, repeat: 4, build: buildGrass },

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
): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
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

    // The low tier carries albedo and normal only. That is not an arbitrary
    // cut: the normal map is what makes a surface read as a substance at all,
    // while roughness and AO degrade gracefully to the substance's scalars for
    // two fewer samplers per draw — and skipping the pack saves the cavity
    // blur as well. Low drops effects, never art direction.
    const packOrm = settings.tier !== "low";
    const ao = packOrm ? deriveAo(gen.h, size, recipe.cavity) : null;
    const normal = deriveNormal(gen.h, size, recipe.bump);

    const albedo = new Uint8Array(texels * 4);
    const orm = packOrm ? new Uint8Array(texels * 4) : null;
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
      if (orm && ao) {
        orm[o] = (ao[i] * 255) | 0;
        orm[o + 1] = (clamp01(gen.r[i]) * 255) | 0;
        orm[o + 2] = (clamp01(gen.m[i]) * 255) | 0;
        orm[o + 3] = 255;
      }
    }
    const norm = 1 / Math.max(1, weight);

    const mapTex = makeTexture(albedo, size, true, maxAniso);
    const normalTex = makeTexture(normal, size, false, maxAniso);
    const ormTex = orm ? makeTexture(orm, size, false, maxAniso) : undefined;
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
      bytes = 0;
    },
  };
}
