/**
 * THE FACE MAP — the complexion the export threw away, back at texel rate.
 *
 * WHAT IS MISSING. A face is not a colour. Socket, brow crease, alar, lip, flush and
 * throat are fourteen gaussians in `faceComplexion` (`characters.ts`), written onto the
 * procedural head as PER-VERTEX COLOUR; and `exportrig.mjs` writes an OBJ, which has no
 * vertex colours, so `COLOR_0` is absent from all four warrior GLBs and every authored
 * man wears one flat tone (`skin:8d6444`) over a lattice. The procedural head, painted,
 * reads as a man; the authored one, unpainted, reads as a mask. This puts the painting
 * back, and it does it as a TEXTURE, not as vertex colour, for three reasons that are
 * each worth a line:
 *
 *   - Resolution. The GLB skull has 4174 vertices at about 4 mm; the portrait lens is
 *     0.8 mm a pixel. A lip, a brow stroke, a scar and a crow's foot are a millimetre or
 *     two across, and a vertex cannot hold one. A texel can (`HEAD_MAP_SIZE`: 1.2 mm).
 *   - The severed head. `authoredSever.ts` builds the head it throws by copying
 *     `position`, `normal` and `uv` and NOTHING ELSE it does not know by name, so a
 *     colour attribute would leave the head flying across the field as a plain tone.
 *   - Cost. One 512x256 texture a class is 0.5 MB and no extra draw call.
 *
 * WHERE THE (u, v) COMES FROM. The export overwrote the head's own UVs with a 35 mm
 * cube projection (`blendlib.py`, `attach_textures`, on every world-tiled substance and
 * skin is one), so the GLB's `TEXCOORD_0` says nothing about the face. The map is
 * therefore laid out on the procedural head's OWN parameterisation (azimuth `w` about
 * the vertical, latitude `v`, `sin v` being the field's own `y`), and each GLB vertex is
 * given its (u, v) by INVERTING that parameterisation at swap time from its bind
 * position: nearest point on the procedural surface, by Newton on a bilinear table. A
 * vertex ON the procedural surface (half the skull's, exactly: the export is the same
 * surface within the last millimetre) reconstructs to under 0.3 mm; one that stands off
 * it by design (an eyelid 14 mm proud of the socket, an ear, the throat's hanging mass)
 * takes the complexion of the skin it stands on, which is what the procedural head gave
 * it too, because the field is a smooth function of where a point is.
 * `tools/facemap.mjs` holds both claims to numbers.
 *
 * The neck is its own map, on a cylinder: it is a separate shell (`part_44`) swept on
 * elliptical stations, and its complexion (the dark under the chin, the open collar) is
 * the field's throat terms.
 *
 * THE SEAM. Any parameterisation of a sphere has a cut. This one is at the nape, where
 * the hair is, and where a triangle straddles it the vertex is DUPLICATED with `u + 1`
 * (the map wraps in `u`), so nothing interpolates across the whole texture.
 *
 * RUNTIME COST. The head map is ~131,000 texels at 3.3 us for the field and 0.3 us for
 * the position, so about half a second on this box; `step(ms)` does it in slices so a
 * man is dressed at once (his face is a flat tone for the first fraction of a second)
 * rather than the frame stalling. Node harnesses call `finish()`.
 *
 * Pure three.js and the character module: no DOM, so `tools/facemap.mjs` runs it under
 * plain node.
 */
import * as THREE from "three";
import { FACE_TILE, faceFieldOf, type FaceField } from "../characters";
import type { WarriorClass } from "../../types";

const TAU = Math.PI * 2;

/**
 * A stored multiplier is `m / FACE_MAP_GAIN`, because a texture cannot hold more than 1 and
 * the field runs to 1.07 (measured: r 0.69-1.07, g 0.43-1.04, b 0.35-1.04 over the whole
 * skull). The material's colour carries the gain back.
 */
export const FACE_MAP_GAIN = 1.1;

/** Texels. The head is 1.2 mm at the equator, the neck 3.7 mm round and 3 mm down. Dials. */
export const HEAD_MAP_SIZE = { w: 512, h: 256 } as const;
export const NECK_MAP_SIZE = { w: 128, h: 96 } as const;

export type FaceKind = "head" | "neck";

/** sRGB-encode a linear 0..1 value to a byte: the texture is declared sRGB, so the sampler hands the linear value back. */
const encode = (l: number): number => {
  const c = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

// ---------------------------------------------------------------------------
// the head's own (azimuth, latitude), as a table
// ---------------------------------------------------------------------------

/**
 * `faceSurface` sampled on the head's own grid, once per class: 257 x 129 points at
 * `w_i = -pi + i/256 * 2pi`, `v_j = -pi/2 + j/128 * pi`, in the head's frame (origin at the
 * skull's centre, +z out of the face). It serves both directions of the map:
 *
 *   forward  a texel's position is the table's bilinear interpolation, so the field is read
 *            at a point ON the surface without paying a surface evaluation a texel;
 *   inverse  a vertex's (u, v) is the nearest point of that bilinear surface, by Newton.
 */
export class HeadGrid {
  static readonly GW = 256;
  static readonly GV = 128;
  private readonly pos: Float32Array;
  /** The equator's length round the head, m: sets the u repeat of the substance. */
  readonly perimeter: number;
  /** The front meridian, menton to crown, m: sets the v repeat. */
  readonly meridian: number;

  constructor(readonly field: FaceField) {
    const { GW, GV } = HeadGrid;
    this.pos = new Float32Array((GW + 1) * (GV + 1) * 3);
    const o = new THREE.Vector3();
    for (let j = 0; j <= GV; j++) {
      const v = -Math.PI / 2 + (j / GV) * Math.PI;
      for (let i = 0; i <= GW; i++) {
        field.surface(-Math.PI + (i / GW) * TAU, v, o);
        const k = (j * (GW + 1) + i) * 3;
        this.pos[k] = o.x; this.pos[k + 1] = o.y; this.pos[k + 2] = o.z;
      }
    }
    let per = 0, mer = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < GW; i++) { this.at(i, GV / 2, a); this.at(i + 1, GV / 2, b); per += a.distanceTo(b); }
    for (let j = 0; j < GV; j++) { this.at(GW / 2, j, a); this.at(GW / 2, j + 1, b); mer += a.distanceTo(b); }
    this.perimeter = per;
    this.meridian = mer;
  }

  /** The bilinear position at fractional grid coordinates. */
  at(fi: number, fj: number, out: THREE.Vector3): THREE.Vector3 {
    const { GW, GV } = HeadGrid;
    const i0 = Math.max(0, Math.min(GW - 1, Math.floor(fi)));
    const j0 = Math.max(0, Math.min(GV - 1, Math.floor(fj)));
    const tx = fi - i0, ty = fj - j0;
    const p = this.pos, s = GW + 1;
    const a = (j0 * s + i0) * 3, b = a + 3, c = a + s * 3, d = c + 3;
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
    return out.set(
      p[a] * w00 + p[b] * w10 + p[c] * w01 + p[d] * w11,
      p[a + 1] * w00 + p[b + 1] * w10 + p[c + 1] * w01 + p[d + 1] * w11,
      p[a + 2] * w00 + p[b + 2] * w10 + p[c + 2] * w01 + p[d + 2] * w11,
    );
  }

  /**
   * The (fi, fj) of the point on the surface nearest a head-frame point, and how far
   * off it the point is (m). The starting guess is analytic (the azimuth of the point,
   * and the row whose height brackets it in that column, which is monotone) and Newton
   * does the rest on the bilinear patch: a handful of dot products, no surface calls.
   */
  invert(x: number, y: number, z: number, out: { fi: number; fj: number; err: number }): void {
    const { GW, GV } = HeadGrid;
    const s = GW + 1;
    let fi = ((Math.atan2(x, z) + Math.PI) / TAU) * GW;
    const ic = Math.max(0, Math.min(GW, Math.round(fi)));
    let lo = 0, hi = GV;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.pos[(m * s + ic) * 3 + 1] <= y) lo = m; else hi = m;
    }
    const y0 = this.pos[(lo * s + ic) * 3 + 1], y1 = this.pos[(hi * s + ic) * 3 + 1];
    let fj = lo + Math.max(0, Math.min(1, y1 > y0 ? (y - y0) / (y1 - y0) : 0));
    const P = new THREE.Vector3();
    for (let it = 0; it < 6; it++) {
      const i0 = Math.max(0, Math.min(GW - 1, Math.floor(fi)));
      const j0 = Math.max(0, Math.min(GV - 1, Math.floor(fj)));
      const tx = fi - i0, ty = fj - j0;
      const k = (j0 * s + i0) * 3, p = this.pos;
      // partials of the bilinear patch
      const pix = (1 - ty) * (p[k + 3] - p[k]) + ty * (p[k + s * 3 + 3] - p[k + s * 3]);
      const piy = (1 - ty) * (p[k + 4] - p[k + 1]) + ty * (p[k + s * 3 + 4] - p[k + s * 3 + 1]);
      const piz = (1 - ty) * (p[k + 5] - p[k + 2]) + ty * (p[k + s * 3 + 5] - p[k + s * 3 + 2]);
      const pjx = (1 - tx) * (p[k + s * 3] - p[k]) + tx * (p[k + s * 3 + 3] - p[k + 3]);
      const pjy = (1 - tx) * (p[k + s * 3 + 1] - p[k + 1]) + tx * (p[k + s * 3 + 4] - p[k + 4]);
      const pjz = (1 - tx) * (p[k + s * 3 + 2] - p[k + 2]) + tx * (p[k + s * 3 + 5] - p[k + 5]);
      this.at(fi, fj, P);
      const rx = x - P.x, ry = y - P.y, rz = z - P.z;
      const a = pix * pix + piy * piy + piz * piz, b = pix * pjx + piy * pjy + piz * pjz, d = pjx * pjx + pjy * pjy + pjz * pjz;
      const e = pix * rx + piy * ry + piz * rz, f = pjx * rx + pjy * ry + pjz * rz;
      const det = a * d - b * b;
      if (Math.abs(det) < 1e-14) break;
      const di = (d * e - b * f) / det, dj = (a * f - b * e) / det;
      fi = Math.max(0, Math.min(GW, fi + Math.max(-4, Math.min(4, di))));
      fj = Math.max(0, Math.min(GV, fj + Math.max(-4, Math.min(4, dj))));
      if (Math.abs(di) < 1e-3 && Math.abs(dj) < 1e-3) break;
    }
    this.at(fi, fj, P);
    out.fi = fi; out.fj = fj; out.err = Math.hypot(x - P.x, y - P.y, z - P.z);
  }
}

// ---------------------------------------------------------------------------
// the map, one class
// ---------------------------------------------------------------------------

interface Layer {
  readonly tex: THREE.DataTexture;
  readonly data: Uint8Array;
  readonly w: number;
  readonly h: number;
  /** How many of a UV unit's substance tiles span the map: the texture's `repeat` is 1 / this. */
  readonly scaleU: number;
  readonly scaleV: number;
  row: number;
}

function makeLayer(w: number, h: number, scaleU: number, scaleV: number): Layer {
  const data = new Uint8Array(w * h * 4);
  // Until the raster reaches a texel it is a plain mid multiplier, not black.
  const neutral = encode(0.85 / FACE_MAP_GAIN);
  for (let i = 0; i < w * h; i++) { data[i * 4] = neutral; data[i * 4 + 1] = neutral; data[i * 4 + 2] = neutral; data[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.anisotropy = 4;
  // The vertices' UV is in substance tiles (so the skin's own normal and roughness maps tile at
  // FACE_TILE with no transform of their own); this map is one texture across the whole head, so it
  // divides the tile count back out.
  tex.repeat.set(1 / scaleU, 1 / scaleV);
  tex.needsUpdate = true;
  return { tex, data, w, h, scaleU, scaleV, row: 0 };
}

export class FaceMap {
  readonly field: FaceField;
  readonly grid: HeadGrid;
  readonly head: Layer;
  readonly neck: Layer;
  private readonly P = new THREE.Vector3();
  private readonly C = new THREE.Color();

  constructor(readonly cls: WarriorClass, identity = 0) {
    this.field = faceFieldOf(cls, identity);
    this.grid = new HeadGrid(this.field);
    this.head = makeLayer(HEAD_MAP_SIZE.w, HEAD_MAP_SIZE.h, this.grid.perimeter / FACE_TILE, this.grid.meridian / FACE_TILE);
    const mid = this.field.neckAt((this.field.neckSpan.top + this.field.neckSpan.bottom) / 2);
    const perimeter = Math.PI * (3 * (mid.hw + mid.hd) - Math.sqrt((3 * mid.hw + mid.hd) * (mid.hw + 3 * mid.hd)));
    this.neck = makeLayer(NECK_MAP_SIZE.w, NECK_MAP_SIZE.h, perimeter / FACE_TILE, (this.field.neckSpan.top - this.field.neckSpan.bottom) / FACE_TILE);
  }

  /** True when every texel of both maps has been rasterised. */
  get done(): boolean { return this.head.row >= this.head.h && this.neck.row >= this.neck.h; }

  /** Rasterise for about `ms` milliseconds. Returns `done`. */
  step(ms: number): boolean {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    while (!this.done && now() - t0 < ms) {
      if (this.head.row < this.head.h) {
        this.headRow(this.head.row++);
        if (this.head.row >= this.head.h) this.head.tex.needsUpdate = true;
      } else {
        this.neckRow(this.neck.row++);
        if (this.neck.row >= this.neck.h) this.neck.tex.needsUpdate = true;
      }
    }
    return this.done;
  }

  /** Rasterise everything now (harnesses, and a caller that would rather wait than pop). */
  finish(): void { while (!this.step(1e9)) { /* a slice is bounded by the rows left */ } }

  private headRow(j: number): void {
    const { w, h, data } = this.head;
    const { GW, GV } = HeadGrid;
    const v = -Math.PI / 2 + ((j + 0.5) / h) * Math.PI;
    const fy = Math.sin(v);
    const fj = ((j + 0.5) / h) * GV;
    const P = this.P, C = this.C, hy = this.field.headY;
    for (let i = 0; i < w; i++) {
      this.grid.at(((i + 0.5) / w) * GW, fj, P);
      this.field.complexion(P.x, P.y + hy, P.z, C, fy);
      const o = (j * w + i) * 4;
      data[o] = encode(C.r / FACE_MAP_GAIN); data[o + 1] = encode(C.g / FACE_MAP_GAIN); data[o + 2] = encode(C.b / FACE_MAP_GAIN);
    }
  }

  private neckRow(j: number): void {
    const { w, h, data } = this.neck;
    const { top, bottom } = this.field.neckSpan;
    const y = bottom + ((j + 0.5) / h) * (top - bottom);
    const st = this.field.neckAt(y);
    const C = this.C;
    for (let i = 0; i < w; i++) {
      const a = -Math.PI + ((i + 0.5) / w) * TAU;
      this.field.complexion(st.hw * Math.sin(a), y, st.z + st.hd * Math.cos(a), C);
      const o = (j * w + i) * 4;
      data[o] = encode(C.r / FACE_MAP_GAIN); data[o + 1] = encode(C.g / FACE_MAP_GAIN); data[o + 2] = encode(C.b / FACE_MAP_GAIN);
    }
  }

  /** The stored multiplier at a map's (u, v) in 0..1, bilinear, as the shader would read it. For the rulers. */
  sample(kind: FaceKind, u: number, v: number, out: THREE.Color): THREE.Color {
    const L = kind === "head" ? this.head : this.neck;
    const fx = ((u % 1) + 1) % 1 * L.w - 0.5, fy = Math.max(0, Math.min(1, v)) * L.h - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const px = (x: number, y: number, c: number) => {
      const xx = ((x % L.w) + L.w) % L.w, yy = Math.max(0, Math.min(L.h - 1, y));
      const b = L.data[(yy * L.w + xx) * 4 + c] / 255;
      return b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
    };
    const ch = (c: number) => (px(x0, y0, c) * (1 - tx) + px(x0 + 1, y0, c) * tx) * (1 - ty) + (px(x0, y0 + 1, c) * (1 - tx) + px(x0 + 1, y0 + 1, c) * tx) * ty;
    return out.setRGB(ch(0) * FACE_MAP_GAIN, ch(1) * FACE_MAP_GAIN, ch(2) * FACE_MAP_GAIN);
  }

  /**
   * Write this map's (u, v) into a GLB geometry's `uv`, IN PLACE, once.
   *
   * `uv` is in substance tiles (`scaleU`, `scaleV` of them across the map) so the skin's
   * normal and roughness maps go on tiling at `FACE_TILE`; the map divides the count back
   * out with its own `repeat`. Idempotent on the geometry, because it is SHARED by every
   * man of the class: the second man finds it done and does nothing.
   *
   * `mirrorX` is the export's: `exportrig.mjs` negates x on every vertex, and the field is in
   * the builder's frame.
   *
   * Returns the number of vertices that were duplicated to cut the seam, or -1 when the
   * geometry has already been written (or cannot be).
   */
  writeUv(geo: THREE.BufferGeometry, kind: FaceKind, mirrorX = true): number {
    const done = geo.userData.faceUv as { cls: string; kind: string } | undefined;
    if (done) return -1;
    const pos = geo.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!pos) return -1;
    const n = pos.count;
    const U = new Float32Array(n), V = new Float32Array(n);
    const layer = kind === "head" ? this.head : this.neck;
    const hy = this.field.headY;
    const inv = { fi: 0, fj: 0, err: 0 };
    // A vertex on a pole has no azimuth: the head's crown and menton, the middle of the neck's top cap.
    // Its u is whatever atan2 said, and it must not be read as the far side of the wrap.
    const pole = new Uint8Array(n);
    if (kind === "head") {
      for (let i = 0; i < n; i++) {
        this.grid.invert(mirrorX ? -pos.getX(i) : pos.getX(i), pos.getY(i) - hy, pos.getZ(i), inv);
        U[i] = inv.fi / HeadGrid.GW; V[i] = inv.fj / HeadGrid.GV;
        pole[i] = V[i] < 0.02 || V[i] > 0.98 ? 1 : 0;
      }
    } else {
      const { top, bottom } = this.field.neckSpan;
      for (let i = 0; i < n; i++) {
        const x = mirrorX ? -pos.getX(i) : pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const st = this.field.neckAt(Math.max(bottom, Math.min(top, y)));
        const ex = x / st.hw, ez = (z - st.z) / st.hd;
        U[i] = (Math.atan2(ex, ez) + Math.PI) / TAU;
        V[i] = Math.max(0, Math.min(1, (y - bottom) / (top - bottom)));
        pole[i] = Math.hypot(ex, ez) < 0.05 ? 1 : 0;
      }
    }
    // ---- the seam: a triangle whose corners disagree about which side of the wrap they are on ----
    const index = geo.getIndex();
    let extra = 0;
    let dupOf: Map<number, number> | null = null;
    let newIndex: Uint32Array | null = null;
    const dupSrc: number[] = [];
    if (index) {
      const src = index.array as ArrayLike<number>;
      newIndex = new Uint32Array(src.length);
      dupOf = new Map();
      for (let t = 0; t < src.length; t += 3) {
        const c = [src[t], src[t + 1], src[t + 2]];
        const real = c.filter((k) => !pole[k]);
        let lo = 9, hi = -9;
        for (const k of real) { lo = Math.min(lo, U[k]); hi = Math.max(hi, U[k]); }
        const straddle = real.length >= 2 && hi - lo > 0.5;
        for (let q = 0; q < 3; q++) {
          let k = c[q];
          if (straddle && !pole[k] && U[k] < 0.5) {
            let d = dupOf.get(k);
            if (d === undefined) { d = n + extra++; dupOf.set(k, d); dupSrc.push(k); }
            k = d;
          }
          newIndex[t + q] = k;
        }
      }
    }
    // ---- write, duplicating every attribute of the vertices that were cut ----
    const total = n + extra;
    if (extra > 0) {
      for (const name of Object.keys(geo.attributes)) {
        const a = geo.getAttribute(name) as THREE.BufferAttribute;
        const Ctor = a.array.constructor as { new (len: number): ArrayLike<number> & { set(a: ArrayLike<number>): void; [i: number]: number } };
        const out = new Ctor(total * a.itemSize);
        out.set(a.array as unknown as ArrayLike<number>);
        for (let d = 0; d < extra; d++) for (let c = 0; c < a.itemSize; c++) out[(n + d) * a.itemSize + c] = (a.array as unknown as ArrayLike<number>)[dupSrc[d] * a.itemSize + c];
        geo.setAttribute(name, new THREE.BufferAttribute(out as never, a.itemSize, a.normalized));
      }
      if (newIndex) geo.setIndex(new THREE.BufferAttribute(newIndex, 1));
    }
    const uv = new Float32Array(total * 2);
    for (let i = 0; i < total; i++) {
      const src = i < n ? i : dupSrc[i - n];
      const wrap = i >= n ? 1 : 0;
      uv[i * 2] = (U[src] + wrap) * layer.scaleU;
      uv[i * 2 + 1] = V[src] * layer.scaleV;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.userData.faceUv = { cls: this.cls, kind };
    return extra;
  }
}

const MAPS = new Map<string, FaceMap>();
const SCHEDULED = new WeakSet<FaceMap>();

/**
 * The map for a class, built once and rasterised in the background. The four warrior GLBs are
 * identity 0 of their class, so that is the face the map paints.
 */
export function faceMapFor(cls: WarriorClass, opts: { schedule?: boolean } = {}): FaceMap {
  let m = MAPS.get(cls);
  if (!m) { m = new FaceMap(cls, 0); MAPS.set(cls, m); }
  if (opts.schedule !== false && !SCHEDULED.has(m) && typeof setTimeout === "function") {
    SCHEDULED.add(m);
    const fm = m;
    const tick = () => { if (!fm.step(6)) setTimeout(tick, 0); };
    setTimeout(tick, 0);
  }
  return m;
}
