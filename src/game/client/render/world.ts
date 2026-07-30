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
// twenty meshes; it is four merged geometries (timber, daub, thatch, the dark
// behind the doorway) instanced across the whole village. Forty palisade stakes
// are one draw. That is where the triangle and draw-call budget went instead of
// into unique meshes nobody can tell apart at 30 m.
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

/** Where the tracks in and out of the moot cross the earthwork. */
const GATE_ANGLES = [0.42, 2.55, 4.55];
/** The gate proper — a break in the palisade with posts and a lintel. */
const GATE_MAIN = GATE_ANGLES[0];

/**
 * Standing water. The same list carves the basins into the height field and
 * places the meshes, which is what keeps a puddle in a hollow instead of
 * floating as a disc on flat ground.
 */
const PUDDLES: ReadonlyArray<{ x: number; z: number; r: number }> = [
  { x: -6.1, z: 3.9, r: 2.5 },
  { x: 4.8, z: -7.2, r: 1.9 },
  { x: 9.4, z: 5.6, r: 2.2 },
  { x: -2.2, z: -11.4, r: 1.6 },
  { x: -12.6, z: -4.1, r: 2.8 },
  { x: 13.1, z: -2.4, r: 1.7 },
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
  for (const p of PUDDLES) {
    const d = Math.hypot(x - p.x, z - p.z) / p.r;
    h -= 0.075 * Math.exp(-d * d * 1.6);
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
  let wet = 0;
  for (const p of PUDDLES) {
    const d = Math.hypot(x - p.x, z - p.z) / p.r;
    wet = Math.max(wet, Math.exp(-d * d * 1.1));
  }
  out.lerp(C_MUD_WET, clamp01(wet * 0.9));

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
  const restore: Array<() => void> = [];
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
    const c = new THREE.Color();

    const write = (i: number, x: number, z: number, y: number) => {
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      uv[i * 2] = x * GROUND_UV + 0.5;
      uv[i * 2 + 1] = z * GROUND_UV + 0.5;
      groundColor(x, z, y, c);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
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
      shader.vertexShader = `varying vec3 vTerrainPos;\n${shader.vertexShader}`.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n\tvTerrainPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;",
      );
      shader.fragmentShader = `varying vec3 vTerrainPos;\nuniform sampler2D uTurf;\n${shader.fragmentShader}`
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
          #ifdef USE_COLOR
            // .rgb, not vColor: three declares the varying as a vec4 whether or
            // not the geometry carries alpha, and a dot() against a vec3 there
            // fails to link — which takes the whole ground material down to a
            // fallback and is invisible until a capture goes looking for it.
            roughnessFactor *= mix( 0.42, 1.0, smoothstep( 0.012, 0.075, dot( vColor.rgb, vec3( 0.299, 0.587, 0.114 ) ) ) );
          #endif`,
        );
    };
    groundMat.needsUpdate = true;
    restore.push(() => { groundMat.onBeforeCompile = prior; groundMat.needsUpdate = true; });
  }

  // ---- standing water ----------------------------------------------------
  // Roughness near zero and no map: at dusk a puddle's whole job is to be a
  // second sky in the bottom of the frame, and the PMREM does that for free.
  {
    const water = materials.standard(0x101a1e, 0.045, 0.02);
    for (const p of PUDDLES) {
      const seg = 20;
      const pts: number[] = [0, 0, 0];
      const uvs: number[] = [0.5, 0.5];
      const idx: number[] = [];
      const rr = p.r * 0.68;
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * TAU;
        const wob = 0.78 + noise2(Math.cos(a) * 2.4 + p.x, Math.sin(a) * 2.4 + p.z) * 0.44;
        pts.push(Math.cos(a) * rr * wob, 0, Math.sin(a) * rr * wob);
        uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
        if (j > 0) idx.push(0, j + 1, j);
      }
      const g = own(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, water);
      mesh.position.set(p.x, groundHeight(p.x, p.z) + 0.052, p.z);
      root.add(mesh);
    }
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
  // =========================================================================

  const timberMat = materials.tinted("oak", 0x3c2c1b, { repeat: 3 });
  const daubMat = materials.tinted("dirt", 0xa89a80, { repeat: 2, roughness: 0.96 });
  const thatchMat = materials.get("hutRoof");
  const darkMat = materials.standard(0x0d0a06, 1, 0);
  const doorMat = materials.get("hutDoor");

  interface HutParts {
    timber: THREE.BufferGeometry[];
    daub: THREE.BufferGeometry[];
    thatch: THREE.BufferGeometry[];
    dark: THREE.BufferGeometry[];
  }

  /**
   * One slope of a thatched roof, built as courses rather than as a plane.
   * Each course is emitted as two rows — its butt end proud, its head thin —
   * and the step between one course's head and the next course's butt becomes
   * the ledge that makes thatch read as bundled straw instead of as a shingled
   * triangle. The eave is scalloped and the whole surface carries a bundling
   * ripple, so the silhouette against the sky is never a straight line.
   */
  function thatchSlope(
    halfW: number, eaveZ: number, eaveY: number, ridgeY: number,
    courses: number, seed: number,
  ): THREE.BufferGeometry {
    const cols = 22;
    const bundles = Math.max(4, Math.round(halfW * 2.6));
    const th = 0.13;
    const rows: Array<{ t: number; off: number; drop: number }> = [];
    for (let k = 0; k < courses; k++) {
      rows.push({ t: k / courses, off: th * 1.85, drop: k === 0 ? 1 : 0 });
      rows.push({ t: (k + 1) / courses, off: th * 0.85, drop: 0 });
    }
    const pos: number[] = [];
    const uvs: number[] = [];
    const idx: number[] = [];
    // Slope normal, in the ZY plane, pointing up and away from the ridge.
    const dz = -eaveZ;
    const dy = ridgeY - eaveY;
    const len = Math.hypot(dz, dy);
    const nz = dy / len;
    const ny = -dz / len;
    for (const row of rows) {
      for (let j = 0; j <= cols; j++) {
        const u = j / cols;
        const x = (u - 0.5) * halfW * 2;
        // The verge is combed flat where it meets the gable. Without this the
        // course steps carry all the way to the edge and the roof's silhouette
        // reads as a staircase rather than as straw.
        const verge = smoothstep(0, 0.11, Math.min(u, 1 - u));
        const ripple = Math.abs(Math.sin(u * bundles * Math.PI)) * 0.05;
        const rough = (noise2(u * bundles * 1.7 + seed, row.t * 5 + seed * 3) - 0.5) * 0.055;
        const o = th + (row.off - th + ripple + rough) * verge;
        const sag = row.drop * (0.04 + ripple * 0.9) * verge;
        const z = eaveZ * (1 - row.t) + nz * o;
        const y = eaveY + dy * row.t + ny * o - sag;
        pos.push(x, y, z);
        uvs.push(x / 7, (row.t * len + o) / 7);
      }
    }
    // Rows sweep toward -z and columns toward +x, so the default winding faces
    // the ground. The far slope is this one turned about Y, never a mirrored
    // build, because mirroring inverts it again.
    gridIndices(rows.length, cols + 1, idx, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /**
   * The triangular infill under a gable. The ridge runs along X, so the gables
   * close the short walls at x = ±w and the triangle is built in the ZY plane.
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

  /**
   * A hut. Sill, posts, braces, wall plate and tie beam stand proud of the daub
   * they frame; the roof overhangs far enough to lay a shadow across the wall;
   * the doorway is a recess with jambs, a lintel, a threshold and a leaf that
   * does not quite shut. It is built, not extruded.
   */
  function buildHut(w: number, d: number, wallH: number, pitch: number, seed: number): HutParts {
    const rand = seeded(seed);
    const P: HutParts = { timber: [], daub: [], thatch: [], dark: [] };
    const post = 0.15;
    const ridgeY = wallH + d * pitch;
    const eaveDrop = 0.14;
    // The overhang scales with the building. A fixed half metre is a deep eave
    // on the hall and an umbrella on a 4 m hut.
    const over = 0.26 + w * 0.065;

    // Sill beams and wall plates.
    for (const zz of [-d, d]) {
      P.timber.push(bx(w * 2 + post * 2, 0.17, 0.22, 0, 0.085, zz));
      P.timber.push(bx(w * 2 + post * 2, 0.19, 0.24, 0, wallH, zz));
    }
    for (const xx of [-w, w]) {
      P.timber.push(bx(0.22, 0.17, d * 2, xx, 0.085, 0));
      P.timber.push(bx(0.24, 0.19, d * 2, xx, wallH, 0));
    }
    // Bays are odd on purpose: the door goes in the middle one, and an even
    // count puts a post exactly where the doorway has to be.
    const bays = 1 + 2 * Math.max(1, Math.round(w / 1.6));
    for (let i = 0; i <= bays; i++) {
      const x = -w + (i / bays) * w * 2;
      for (const zz of [-d, d]) P.timber.push(bx(post, wallH, post, x, wallH / 2, zz));
    }
    const zbays = Math.max(1, Math.round(d / 1.5));
    for (let i = 0; i <= zbays; i++) {
      const z = -d + (i / zbays) * d * 2;
      for (const xx of [-w, w]) P.timber.push(bx(post, wallH, post, xx, wallH / 2, z));
    }
    // Braces. Cheap, and the single strongest cue that a wall is framed.
    for (const zz of [-d, d]) {
      for (const s of [-1, 1]) {
        P.timber.push(bx(0.12, wallH * 0.85, 0.12, s * (w - 0.55), wallH * 0.44, zz, -s * 0.62));
      }
    }
    // Tie beam and king post close the gable ends, which are the short walls.
    for (const xx of [-w, w]) {
      P.timber.push(bx(0.15, 0.16, d * 2, xx, wallH + 0.12, 0));
      P.timber.push(bx(0.14, ridgeY - wallH, 0.14, xx, (ridgeY + wallH) / 2, 0));
    }

    // Daub panels, inset so the frame stands proud of them.
    const inset = 0.06;
    const panelH = wallH - 0.28;
    const front = d;
    const bayW = (w * 2) / bays;
    const doorHalf = Math.min(0.55, bayW / 2 - 0.06);
    for (let i = 0; i < bays; i++) {
      const x0 = -w + (i / bays) * w * 2 + post / 2;
      const x1 = -w + ((i + 1) / bays) * w * 2 - post / 2;
      const cx = (x0 + x1) / 2;
      const pw = x1 - x0;
      // Back wall: solid.
      P.daub.push(bx(pw, panelH, 0.16, cx, panelH / 2 + 0.14, -front + inset));
      // Front wall: the middle bay is the doorway, closed by jamb and lintel.
      if (i !== (bays - 1) / 2) {
        P.daub.push(bx(pw, panelH, 0.16, cx, panelH / 2 + 0.14, front - inset));
      }
    }
    for (let i = 0; i < zbays; i++) {
      const z0 = -d + (i / zbays) * d * 2 + post / 2;
      const z1 = -d + ((i + 1) / zbays) * d * 2 - post / 2;
      for (const xx of [-w + inset, w - inset]) {
        P.daub.push(bx(0.16, panelH, z1 - z0, xx, panelH / 2 + 0.14, (z0 + z1) / 2));
      }
    }
    // Gable infill, under the verge.
    for (const xx of [-w + inset, w - inset]) {
      P.daub.push(gable(d * 0.97, wallH + 0.18, ridgeY - 0.1, 0.14, xx));
    }

    // Doorway: jambs, lintel, threshold, and the dark inside.
    const lintelY = Math.min(1.92, wallH - 0.25);
    P.timber.push(bx(0.16, lintelY - 0.02, 0.42, -doorHalf - 0.08, (lintelY - 0.02) / 2, front - 0.1));
    P.timber.push(bx(0.16, lintelY - 0.02, 0.42, doorHalf + 0.08, (lintelY - 0.02) / 2, front - 0.1));
    P.timber.push(bx(doorHalf * 2 + 0.5, 0.2, 0.44, 0, lintelY, front - 0.1));
    P.timber.push(bx(doorHalf * 2 + 0.4, 0.12, 0.5, 0, 0.06, front + 0.02));
    P.dark.push(bx(doorHalf * 2 - 0.03, lintelY - 0.05, 0.7, 0, (lintelY - 0.05) / 2, front - 0.52));

    // Roof: two slopes, a ridge roll and its saddle spars.
    P.thatch.push(thatchSlope(w + over, d + over, wallH - eaveDrop, ridgeY, 6, seed * 0.13));
    P.thatch.push(thatchSlope(w + over, d + over, wallH - eaveDrop, ridgeY, 6, seed * 0.29).rotateY(Math.PI));
    {
      const ridge = new THREE.CylinderGeometry(0.19, 0.19, (w + over) * 2, 8, 6);
      const p = ridge.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const bump = 1 + Math.sin(p.getY(i) * 3.1) * 0.09 + (rand() - 0.5) * 0.05;
        p.setX(i, p.getX(i) * bump);
        p.setZ(i, p.getZ(i) * bump);
      }
      p.needsUpdate = true;
      ridge.computeVertexNormals();
      ridge.rotateZ(Math.PI / 2);
      ridge.translate(0, ridgeY + 0.06, 0);
      P.thatch.push(ridge);
    }
    // Saddle spars pegged over the ridge, which is what actually holds a ridge
    // roll down. Rotated onto the ZY plane, because the ridge runs along X.
    for (let i = -1; i <= 1; i += 2) {
      for (let k = 0; k < 3; k++) {
        P.timber.push(bx(0.09, 0.95, 0.09, (k - 1) * (w * 0.6), ridgeY + 0.08, i * 0.2, i * 0.45, Math.PI / 2));
      }
    }
    return P;
  }

  {
    const doorGeo = own(mergeInto([
      bx(0.95, 1.8, 0.07, 0, 0, 0),
      bx(0.12, 1.8, 0.1, -0.3, 0, 0.02),
      bx(0.12, 1.8, 0.1, 0.3, 0, 0.02),
    ], 1 / 2));

    interface Variant { parts: HutParts; xf: THREE.Matrix4[]; depth: number }
    const variants: Variant[] = [
      { parts: buildHut(2.0, 1.7, 2.15, 1.15, 0x1234), xf: [], depth: 1.7 },
      { parts: buildHut(2.9, 2.1, 2.4, 1.1, 0x5678), xf: [], depth: 2.1 },
    ];

    // A village, not a ring. Huts cluster with their doors turned roughly toward
    // the moot, at spread distances so the frame gets a midground.
    const sites: Array<[number, number, number]> = [
      [0.95, 28.5, 0], [1.35, 33.0, 1], [2.15, 30.0, 1], [2.9, 27.5, 0],
      [3.7, 36.0, 1], [4.6, 29.5, 0], [5.35, 33.5, 1], [5.95, 44.0, 0],
      [2.45, 47.0, 0], [4.05, 51.0, 1],
    ];
    for (const [a0, d0, v] of sites) {
      const a = a0 + (rng() - 0.5) * 0.16;
      const dist = d0 + (rng() - 0.5) * 3;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      const face = facing(x, z) + (rng() - 0.5) * 0.5;
      const s = 0.92 + rng() * 0.24;
      variants[v].xf.push(place(x, groundHeight(x, z) - 0.06, z, face, s));
      // A door leaf, left ajar. Not instanced with the hut because the angle is
      // the point: every closed door in a village is the same door.
      const dm = new THREE.Mesh(doorGeo, doorMat);
      const dz = variants[v].depth * s;
      dm.position.set(x + Math.sin(face) * dz, groundHeight(x, z) + 0.85 * s, z + Math.cos(face) * dz);
      dm.rotation.y = face + (rng() - 0.5) * 0.9;
      dm.scale.setScalar(s);
      dm.castShadow = true;
      root.add(dm);
    }

    for (const v of variants) {
      field(own(mergeInto(v.parts.timber, 1 / 3)), timberMat, v.xf);
      field(own(mergeInto(v.parts.daub, 1 / 2)), daubMat, v.xf);
      field(own(mergeInto(v.parts.thatch)), thatchMat, v.xf);
      field(own(mergeInto(v.parts.dark, 1)), darkMat, v.xf, null, false);
    }

    // The hall. One of these, so it is meshes rather than instances, and it gets
    // the one thing the huts do not: a hearth burning somewhere inside, seen
    // through the door. At dusk that is the warmest thing in the background.
    {
      const HW = 4.6;
      const HD = 3.0;
      const HWALL = 3.1;
      const HRIDGE = HWALL + HD * 1.1;
      const hall = buildHut(HW, HD, HWALL, 1.1, 0xbeef);
      const ha = -1.62;
      const hd = 37;
      const hx = Math.cos(ha) * hd;
      const hz = Math.sin(ha) * hd;
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
      // the warmest thing in the background, and it costs one quad.
      const hearth = new THREE.Mesh(own(new THREE.PlaneGeometry(0.66, 0.4)), materials.get("bonfireFlame"));
      hearth.position.set(0, 0.4, HD - 0.14);
      g.add(hearth);
      g.position.set(hx, groundHeight(hx, hz) - 0.06, hz);
      g.rotation.y = facing(hx, hz) + 0.18;
      root.add(g);
    }
  }

  // =========================================================================
  // Depth beyond the settlement — treeline and scrub
  // =========================================================================
  {
    const trunkMat = materials.tinted("oak", 0x35281a, { repeat: 2 });
    const canopyMat = materials.tinted("grass", 0x33401f, { repeat: 1 });

    const trunkGeo = (() => {
      const g = new THREE.CylinderGeometry(0.13, 0.32, 1, 6, 3);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const t = clamp01(p.getY(i) + 0.5);
        p.setX(i, p.getX(i) + Math.sin(t * 2.2) * 0.09);
        p.setZ(i, p.getZ(i) + Math.cos(t * 1.7) * 0.06);
      }
      p.needsUpdate = true;
      g.computeVertexNormals();
      g.translate(0, 0.5, 0);
      return g;
    })();

    // A crown, not a lollipop: five masses stacked with the big ones low and
    // the small ones high, each pushed off-axis. At a hundred metres a tree is
    // a silhouette and nothing else, so the silhouette is all this spends on.
    const canopyGeo = (variant: number): THREE.BufferGeometry => {
      const rand = seeded(0x2f13 + variant * 991);
      const blobs: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const s = (0.62 - t * 0.28) * (0.8 + rand() * 0.45);
        const b = new THREE.IcosahedronGeometry(s, 0);
        const p = b.attributes.position as THREE.BufferAttribute;
        for (let v = 0; v < p.count; v++) {
          const n = 0.72 + noise2(p.getX(v) * 5 + i * 9, p.getZ(v) * 5 - i * 4) * 0.55;
          p.setXYZ(v, p.getX(v) * n, p.getY(v) * n * 0.82, p.getZ(v) * n);
        }
        p.needsUpdate = true;
        b.computeVertexNormals();
        const spread = (1 - t) * 0.95 + 0.15;
        b.translate((rand() - 0.5) * spread, 0.45 + t * 0.58 + rand() * 0.12, (rand() - 0.5) * spread);
        blobs.push(b);
      }
      return mergeInto(blobs);
    };

    const canopies = [canopyGeo(0), canopyGeo(1), canopyGeo(2)];
    const trunks: THREE.Matrix4[] = [];
    const crowns: THREE.Matrix4[][] = [[], [], []];
    const crownTints: THREE.Color[][] = [[], [], []];
    const tc = new THREE.Color();
    const hutKeepout = 9;

    for (let i = 0; i < scatter(190); i++) {
      const a = rng() * TAU;
      // Weighted outward, and thinned where the village is.
      const dist = 40 + Math.pow(rng(), 0.62) * 96;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      if (dist < 55 && rng() < 0.45) continue;
      if (dist < 52 && Math.hypot(x - Math.cos(-1.62) * 37, z - Math.sin(-1.62) * 37) < hutKeepout) continue;
      // Trees mass in stands; a uniform scatter reads as an orchard.
      if (fbm(x * 0.017 + 5, z * 0.017 - 3, 2) < 0.42) continue;
      const h = 4.2 + rng() * 6.4;
      const y = groundHeight(x, z) - 0.3;
      const spin = rng() * TAU;
      trunks.push(new THREE.Matrix4().compose(
        V.set(x, y, z), Q.setFromEuler(E.set(0, spin, 0, "YXZ")),
        new THREE.Vector3(0.8 + rng() * 0.5, h, 0.8 + rng() * 0.5),
      ));
      const v = i % 3;
      crowns[v].push(new THREE.Matrix4().compose(
        V.set(x, y + h * 0.72, z), Q.setFromEuler(E.set((rng() - 0.5) * 0.15, spin, 0, "YXZ")),
        new THREE.Vector3(h * 0.42, h * 0.4, h * 0.42),
      ));
      const shade = 0.72 + rng() * 0.6;
      crownTints[v].push(tc.setRGB(shade, shade * (0.92 + rng() * 0.2), shade * 0.85).clone());
    }
    // Nothing out here is inside the shadow cascade; asking for shadow maps of
    // two hundred trees buys a frame cost and no pixels.
    field(trunkGeo, trunkMat, trunks, null, false);
    for (let v = 0; v < 3; v++) field(canopies[v], canopyMat, crowns[v], crownTints[v], false);

    // A handful of close trees, which do cast, so the midground has structure
    // rather than being a gap between the palisade and the treeline.
    const nearTrunks: THREE.Matrix4[] = [];
    const nearCrowns: THREE.Matrix4[] = [];
    const hallX = Math.cos(-1.62) * 37;
    const hallZ = Math.sin(-1.62) * 37;
    for (let i = 0; i < scatter(9); i++) {
      const a = rng() * TAU;
      const dist = 33 + rng() * 13;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      // Nothing grows through the hall's roof, and a big tree at 35 m parked in
      // front of a hut deletes the only midground the frame has.
      if (Math.hypot(x - hallX, z - hallZ) < 12) continue;
      const h = 6.5 + rng() * 3.5;
      const y = groundHeight(x, z) - 0.3;
      nearTrunks.push(new THREE.Matrix4().compose(
        V.set(x, y, z), Q.setFromEuler(E.set(0, rng() * TAU, 0, "YXZ")),
        new THREE.Vector3(1.1, h, 1.1),
      ));
      nearCrowns.push(new THREE.Matrix4().compose(
        V.set(x, y + h * 0.7, z), Q.setFromEuler(E.set(0, rng() * TAU, 0, "YXZ")),
        new THREE.Vector3(h * 0.46, h * 0.44, h * 0.46),
      ));
    }
    field(trunkGeo, trunkMat, nearTrunks);
    field(canopies[1], canopyMat, nearCrowns);
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
      const lean = 1.28 - (i % 2) * 0.16;
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
      g.translate(Math.cos(a) * 0.28, 0.1 + (i % 2) * 0.16, Math.sin(a) * 0.28);
      logs.push(g);
    }
    const logMesh = new THREE.Mesh(own(mergeInto(logs)), logMat);
    logMesh.castShadow = true;
    bonfire.add(logMesh);

    // The coal bed. Reusing the flame material means the embers glow into the
    // bloom pass without a second emissive entry in the catalog.
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

      const pile: THREE.Matrix4[] = [];
      const px = -3.4;
      const pz = 2.6;
      const py = groundHeight(px, pz);
      for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 4 - row; i++) {
          pile.push(place(px + (i - (3 - row) / 2) * 0.24, py + 0.11 + row * 0.2, pz, 0.4, 1, 0, Math.PI / 2));
        }
      }
      const billet = new THREE.CylinderGeometry(0.1, 0.11, 1.5, 6);
      field(own(billet), logMat, pile);
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
    const pts = 14;
    for (let i = 0; i <= pts; i++) {
      const t = i / pts;
      const a = t * TAU;
      const rx = 0.62 * (1 + noise2(Math.cos(a) * 2 + 3, Math.sin(a) * 2 - 1) * 0.3);
      const ry = 1.85 * (1 + noise2(Math.cos(a) * 2 - 7, Math.sin(a) * 2 + 4) * 0.22);
      const x = Math.cos(a) * rx;
      const y = Math.sin(a) * ry * (Math.sin(a) > 0 ? 0.95 : 0.7);
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

    // Carved band and runes. The strokes are cut into the face rather than
    // floating on it, so the glow has an edge to catch.
    const runeMat = materials.get("runeGlow");
    const strokes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const y = 3.05 - i * 0.42;
      const x = (i % 2 === 0 ? -0.15 : 0.16) + (rng() - 0.5) * 0.1;
      strokes.push(bx(0.055, 0.3 - (i % 3) * 0.05, 0.5, x, y, 0, (rng() - 0.5) * 0.55));
      if (i % 2 === 0) strokes.push(bx(0.2, 0.05, 0.5, x + 0.09, y + 0.07, 0, 0.5));
    }
    const runes = new THREE.Mesh(own(mergeInto(strokes, 1)), runeMat);
    stone.add(runes);
    // Interlace border, in stone rather than in light.
    const border: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const y = 0.55 + i * 0.36;
      border.push(bx(0.9, 0.05, 0.47, 0, y, 0, i % 2 === 0 ? 0.16 : -0.16));
    }
    const bmesh = new THREE.Mesh(own(mergeInto(border, 1)), materials.get("runestone"));
    stone.add(bmesh);

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
  const shieldIron = materials.tinted("iron", 0x555b63, { roughness: 0.5 });

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
    const arrows: THREE.Matrix4[] = [];
    for (let i = 0; i < scatter(16); i++) {
      const a = rng() * TAU;
      const d = 3 + rng() * 15;
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
      const d = 5 + rng() * 11;
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
      const d = 6 + rng() * 9;
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
      const d = 4 + rng() * 20;
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
    },
  };
}
