// ============================================================
// BRETWALDA — Warriors, war gear, and the armoury catalog
// ============================================================
//
// Every warrior in the frame is built here, out of nothing but code. There are
// no downloaded meshes and there never will be; the game has to stay a link you
// click.
//
// Three rules shaped this file, and they are worth stating before the numbers:
//
//   1. PROPORTION IS THE WHOLE GAME. The old builder put a 0.41 m head on a
//      2.15 m body — five heads tall, shoulders half as wide as the figure was
//      high — and no amount of texture or lighting rescues a silhouette that
//      reads as a toy. Everything below is measured off a single skeleton
//      (`SKELETON`) whose landmarks are real human ratios: 7.4 heads, arm span
//      equal to stature, biacromial breadth at 0.29 of it. Change a number
//      there and the whole body moves together, which is the point.
//
//   2. LAYERS, NOT DECALS. Kit is assembled the way it was worn — linen next to
//      the skin, wool over it, mail or lamellar over that, then belts, then the
//      cloak. Each layer is a separate swept shell sitting a measured 8–20 mm
//      proud of the one under it, and every hem is built with `wall` so it has a
//      real edge. That edge is what makes armour read as *put on* rather than
//      painted on.
//
//   3. ONE MESH PER SUBSTANCE PER MOVING PART. A warrior is a hundred-odd
//      primitives, but a primitive is not a draw call: everything a segment
//      wears in one material is merged before it reaches the scene. Eight
//      warriors used to cost ~520 draws; they now cost ~230, and identical
//      loadouts share the merged geometry outright (see `RIG_CACHE`).
//
// Geometry lives in a small toolkit at the top — a swept superelliptical shell,
// a two-sided parametric patch, a lens-section prism — because a body, a mail
// hauberk, a cloak and an axe head are all the same three shapes with different
// numbers. The face is the one exception: it is a displaced sphere with an
// anatomical field on it, so brow, socket, cheekbone and jaw are actual
// geometry that catches actual shadow, not features drawn on a ball.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WarriorClass } from "../types";

// ---------------- Appearance ----------------
export interface Appearance {
  helm: string;      // none | iron | nasal | spectacle | crowned | hood
  hairStyle: string; // shaved | short | long | braids
  hairColor: number;
  beardStyle: string;// none | short | full | forked | braided
  beardColor: number;
  cloak: string;     // none | brown | red | blue | gold
  armorColor: number;
  warPaint: string;  // none | stripes | cross | half
}

export interface PlayerAppearanceHolder {
  appearance?: Appearance;
}

export function defaultAppearance(cls: WarriorClass): Appearance {
  return {
    helm: cls === "runekeeper" ? "hood" : cls === "huscarl" ? "nasal" : "iron",
    hairStyle: "short",
    hairColor: 0x6b4a2a,
    beardStyle: cls === "berserker" ? "full" : "short",
    beardColor: 0x6b4a2a,
    cloak: cls === "berserker" ? "brown" : cls === "runekeeper" ? "blue" : "red",
    armorColor: 0x4a5568,
    warPaint: "none",
  };
}

// ---------------- Armoury Catalog ----------------
export interface ArmouryOption {
  id: string;
  label: string;
  cost: number;
  slot: string;
  value: string | number;
  desc?: string;
}

export const ARMOURY: Array<{ slot: string; label: string; options: ArmouryOption[] }> = [
  {
    slot: "helm", label: "Helmets",
    options: [
      { id: "helm_none", label: "Bare Head", cost: 0, slot: "helm", value: "none" },
      { id: "helm_iron", label: "Iron Spangenhelm", cost: 30, slot: "helm", value: "iron" },
      { id: "helm_nasal", label: "Nasal Helm", cost: 110, slot: "helm", value: "nasal" },
      { id: "helm_hood", label: "Shadow Hood", cost: 120, slot: "helm", value: "hood" },
      { id: "helm_spectacle", label: "Spectacle Helm", cost: 280, slot: "helm", value: "spectacle" },
      { id: "helm_crowned", label: "Jarl's Crowned Helm", cost: 570, slot: "helm", value: "crowned" },
    ],
  },
  {
    slot: "hair", label: "Hair",
    options: [
      { id: "hair_shaved", label: "Shaved", cost: 0, slot: "hair", value: "shaved" },
      { id: "hair_short", label: "Warrior Crop", cost: 0, slot: "hair", value: "short" },
      { id: "hair_long", label: "Long Mane", cost: 40, slot: "hair", value: "long" },
      { id: "hair_braids", label: "Braided War-locks", cost: 100, slot: "hair", value: "braids" },
    ],
  },
  {
    slot: "hairColor", label: "Hair Colour",
    options: [
      { id: "hc_brown", label: "Oak Brown", cost: 0, slot: "hairColor", value: 0x6b4a2a },
      { id: "hc_black", label: "Raven Black", cost: 0, slot: "hairColor", value: 0x1c1712 },
      { id: "hc_blond", label: "Norse Gold", cost: 40, slot: "hairColor", value: 0xb8a14e },
      { id: "hc_red", label: "Fire Red", cost: 30, slot: "hairColor", value: 0x8a3b22 },
      { id: "hc_grey", label: "Greybeard", cost: 30, slot: "hairColor", value: 0x9c9c9c },
      { id: "hc_snow", label: "Snow White", cost: 30, slot: "hairColor", value: 0xe8e4da },
    ],
  },
  {
    slot: "beard", label: "Beards",
    options: [
      { id: "beard_none", label: "Clean Shaven", cost: 0, slot: "beard", value: "none" },
      { id: "beard_short", label: "Stubble", cost: 0, slot: "beard", value: "short" },
      { id: "beard_full", label: "Full Beard", cost: 40, slot: "beard", value: "full" },
      { id: "beard_forked", label: "Forked Beard", cost: 80, slot: "beard", value: "forked" },
      { id: "beard_braided", label: "Ringed Braid", cost: 120, slot: "beard", value: "braided" },
    ],
  },
  {
    slot: "beardColor", label: "Beard Colour",
    options: [
      { id: "bc_brown", label: "Oak Brown", cost: 0, slot: "beardColor", value: 0x6b4a2a },
      { id: "bc_black", label: "Raven Black", cost: 0, slot: "beardColor", value: 0x1c1712 },
      { id: "bc_blond", label: "Norse Gold", cost: 40, slot: "beardColor", value: 0xb8a14e },
      { id: "bc_red", label: "Fire Red", cost: 30, slot: "beardColor", value: 0x8a3b22 },
      { id: "bc_grey", label: "Greybeard", cost: 30, slot: "beardColor", value: 0x9c9c9c },
      { id: "bc_snow", label: "Snow White", cost: 30, slot: "beardColor", value: 0xe8e4da },
    ],
  },
  {
    slot: "cloak", label: "Cloaks",
    options: [
      { id: "cloak_none", label: "No Cloak", cost: 0, slot: "cloak", value: "none" },
      { id: "cloak_brown", label: "Traveller's Cloak", cost: 30, slot: "cloak", value: "brown" },
      { id: "cloak_red", label: "Blood Red Cloak", cost: 90, slot: "cloak", value: "red" },
      { id: "cloak_blue", label: "Sea-Wolf Cloak", cost: 90, slot: "cloak", value: "blue" },
      { id: "cloak_gold", label: "Gilded War Cloak", cost: 400, slot: "cloak", value: "gold" },
    ],
  },
  {
    slot: "armor", label: "Armour Finish",
    options: [
      { id: "armor_iron", label: "Rough Iron", cost: 0, slot: "armor", value: 0x4a5568 },
      { id: "armor_steel", label: "Polished Steel", cost: 30, slot: "armor", value: 0x8a97a5 },
      { id: "armor_dark", label: "Blackened Steel", cost: 130, slot: "armor", value: 0x2a2f38 },
      { id: "armor_bronze", label: "Bronze Scales", cost: 160, slot: "armor", value: 0x8a6a3a },
      { id: "armor_crimson", label: "Crimson Warplate", cost: 120, slot: "armor", value: 0x7a2f2a },
      { id: "armor_seablue", label: "Sea Queen's Gift", cost: 100, slot: "armor", value: 0x2f4a6a },
      { id: "armor_gold", label: "Bretwalda Gold", cost: 510, slot: "armor", value: 0x9a7a2a },
    ],
  },
  {
    slot: "warPaint", label: "War Paint",
    options: [
      { id: "wp_none", label: "None", cost: 0, slot: "warPaint", value: "none" },
      { id: "wp_stripes", label: "Blood Stripes", cost: 40, slot: "warPaint", value: "stripes" },
      { id: "wp_cross", label: "Raven Cross", cost: 70, slot: "warPaint", value: "cross" },
      { id: "wp_half", label: "Half-Face Shadow", cost: 110, slot: "warPaint", value: "half" },
    ],
  },
];

export function freeCosmeticIds(): string[] {
  const ids: string[] = [];
  ARMOURY.forEach((s) => s.options.forEach((o) => { if (o.cost === 0) ids.push(o.id); }));
  return ids;
}

// ---------------- Materials ----------------
// A warrior asks for substances, not colours: mail, wool, leather, skin, steel,
// oak. Where those come from is the caller's business — the arena hands over its
// shared, textured library, so a lobby of eight warriors is a handful of
// programs rather than the 73 fresh MeshStandardMaterials per body this file
// used to allocate.
//
// `tinted` is the wide door onto that library: iron is not steel and linen is
// not wool, and a helm that reflects like a sword bezel is the difference
// between kit that reads as forged and kit that reads as chrome. Declared with
// method syntax on purpose — TypeScript checks method parameters bivariantly,
// which is what lets the arena's full `SurfaceName` union satisfy the narrow
// list a warrior actually wears.
export type CharacterSurface =
  | "mail" | "iron" | "steel" | "bronze"
  | "wool" | "linen" | "leather" | "rope"
  | "oak" | "bone" | "skin";

export interface CharacterTint {
  roughness?: number;
  metalness?: number;
  repeat?: number;
}

export interface CharacterMaterials {
  armour(color: number): THREE.MeshStandardMaterial;
  tunic(color: number): THREE.MeshStandardMaterial;
  hide(color: number): THREE.MeshStandardMaterial;
  flesh(color: number): THREE.MeshStandardMaterial;
  blade(color: number, roughness?: number): THREE.MeshStandardMaterial;
  timber(color: number): THREE.MeshStandardMaterial;
  standard(color: number, roughness?: number, metalness?: number): THREE.MeshStandardMaterial;
  tinted(surface: CharacterSurface, color: number, opts?: CharacterTint): THREE.MeshStandardMaterial;
  get(name: "runeGlow"): THREE.Material;
}

/**
 * Untextured stand-in for callers with no texture library — the armoury preview
 * renders into its own canvas and cannot afford to generate half a megabyte of
 * PBR maps to show one hauberk. Every call allocates, and the caller is expected
 * to dispose what it built.
 */
const RAW: CharacterMaterials = {
  armour: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.55 }),
  tunic: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0 }),
  hide: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0 }),
  flesh: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0 }),
  blade: (c, rough = 0.35) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.85 }),
  timber: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, metalness: 0 }),
  standard: (c, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }),
  tinted: (surface, c, opts) => new THREE.MeshStandardMaterial({
    color: c,
    roughness: opts?.roughness ?? (surface === "steel" || surface === "iron" ? 0.35 : 0.85),
    metalness: opts?.metalness ?? (surface === "steel" || surface === "iron" || surface === "mail" || surface === "bronze" ? 0.8 : 0),
  }),
  get: () => new THREE.MeshStandardMaterial({ color: 0x66c8ff, emissive: 0x2288dd, emissiveIntensity: 3.5, roughness: 0.4 }),
};

const SKIN = 0xd9a97e;
const SKIN_DARK = 0xc28f63;

const CLOAK_COLORS: Record<string, number> = {
  brown: 0x5a4030, red: 0x7a2020, blue: 0x24386a, gold: 0xa8842a, none: 0x5a4030,
};

// ============================================================
// Geometry toolkit
// ============================================================

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
};
/** Anisotropic gaussian, evaluated on a unit direction. The face is all of these. */
const bump = (dx: number, dy: number, dz: number, sx: number, sy: number, sz: number) =>
  Math.exp(-((dx * dx) / (sx * sx) + (dy * dy) / (sy * sy) + (dz * dz) / (sz * sz)));

function xf(
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
  sx = 1, sy = 1, sz = 1,
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
}

/**
 * A ring seam duplicates its first vertex so the UV can wrap, which leaves
 * `computeVertexNormals` averaging half a neighbourhood on each copy — a hard
 * crease straight down every limb and garment. Averaging the pair back together
 * costs nothing and is the difference between a tapered arm and a folded one.
 */
function weldRingNormals(geo: THREE.BufferGeometry, rings: number[], seg: number): void {
  const nrm = geo.getAttribute("normal") as THREE.BufferAttribute;
  for (const base of rings) {
    const a = base;
    const b = base + seg;
    const nx = (nrm.getX(a) + nrm.getX(b)) * 0.5;
    const ny = (nrm.getY(a) + nrm.getY(b)) * 0.5;
    const nz = (nrm.getZ(a) + nrm.getZ(b)) * 0.5;
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(a, nx / l, ny / l, nz / l);
    nrm.setXYZ(b, nx / l, ny / l, nz / l);
  }
  nrm.needsUpdate = true;
}

function finish(pos: number[], uv: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** One cross-section of a swept shell: half-width in X, half-depth in Z. */
interface Station { y: number; hw: number; hd: number; z?: number }

interface ShellOptions {
  /**
   * Superellipse exponent. 2 is a plain ellipse (limbs, necks); 2.4 squares the
   * corners off just enough for a chest to read as a ribcage rather than a pipe;
   * 1 collapses to a rhombus, which is exactly a blade's lenticular section.
   */
  power?: number;
  /**
   * Wall thickness. Builds the inside of the garment as well and closes both
   * ends into a rim, so a hem is an edge you can see rather than a paper cut.
   */
  wall?: number;
  capTop?: boolean;
  capBottom?: boolean;
}

/**
 * Sweeps a superelliptical section through a list of stations. Torsos, mail,
 * tunics, thighs, forearms, necks, blades and axe hafts are all this function.
 */
function shell(stations: Station[], seg: number, opts: ShellOptions = {}): THREE.BufferGeometry {
  const k = 2 / (opts.power ?? 2);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rings: number[] = [];
  const n = stations.length;
  const yTop = stations[0].y;
  const yBot = stations[n - 1].y;
  const span = Math.abs(yTop - yBot) || 1;

  const ring = (st: Station, inset: number): number => {
    const base = pos.length / 3;
    const hw = Math.max(2e-4, st.hw - inset);
    const hd = Math.max(2e-4, st.hd - inset);
    const v = 1 - (yTop - st.y) / span;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(
        hw * Math.sign(c) * Math.pow(Math.abs(c), k),
        st.y,
        (st.z ?? 0) + hd * Math.sign(s) * Math.pow(Math.abs(s), k),
      );
      uv.push(i / seg, v);
    }
    rings.push(base);
    return base;
  };

  const outer: number[] = stations.map((st) => ring(st, 0));
  for (let r = 0; r < n - 1; r++) {
    const t = outer[r];
    const b = outer[r + 1];
    for (let i = 0; i < seg; i++) {
      idx.push(t + i, b + i + 1, b + i, t + i, t + i + 1, b + i + 1);
    }
  }

  if (opts.wall) {
    const inner: number[] = stations.map((st) => ring(st, opts.wall as number));
    for (let r = 0; r < n - 1; r++) {
      const t = inner[r];
      const b = inner[r + 1];
      for (let i = 0; i < seg; i++) {
        idx.push(t + i, b + i, b + i + 1, t + i, b + i + 1, t + i + 1);
      }
    }
    const ob = outer[n - 1];
    const ib = inner[n - 1];
    for (let i = 0; i < seg; i++) {
      idx.push(ob + i, ob + i + 1, ib + i + 1, ob + i, ib + i + 1, ib + i);
    }
    const ot = outer[0];
    const it = inner[0];
    for (let i = 0; i < seg; i++) {
      idx.push(ot + i, it + i + 1, ot + i + 1, ot + i, it + i, it + i + 1);
    }
  }

  if (opts.capTop) {
    const c = pos.length / 3;
    pos.push(0, yTop, stations[0].z ?? 0);
    uv.push(0.5, 1);
    const t = outer[0];
    for (let i = 0; i < seg; i++) idx.push(c, t + i + 1, t + i);
  }
  if (opts.capBottom) {
    const c = pos.length / 3;
    pos.push(0, yBot, stations[n - 1].z ?? 0);
    uv.push(0.5, 0);
    const b = outer[n - 1];
    for (let i = 0; i < seg; i++) idx.push(c, b + i, b + i + 1);
  }

  const g = finish(pos, uv, idx);
  weldRingNormals(g, rings, seg);
  return g;
}

/**
 * A two-sided parametric sheet with real thickness — cloaks, hair, beards, helm
 * bowls, war paint. `outer` and `inner` are the same surface offset along its
 * own normal; the four rim strips between them are what stop a cloak from
 * vanishing the moment the camera gets behind it.
 */
function patch(opts: {
  nu: number;
  nv: number;
  wrapU?: boolean;
  outer(u: number, v: number, out: THREE.Vector3): void;
  inner(u: number, v: number, out: THREE.Vector3): void;
}): THREE.BufferGeometry {
  const { nu, nv } = opts;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const tmp = new THREE.Vector3();
  const stride = nu + 1;
  const count = stride * (nv + 1);

  const grid = (fn: (u: number, v: number, out: THREE.Vector3) => void) => {
    for (let j = 0; j <= nv; j++) {
      for (let i = 0; i <= nu; i++) {
        fn(i / nu, j / nv, tmp);
        pos.push(tmp.x, tmp.y, tmp.z);
        uv.push(i / nu, j / nv);
      }
    }
  };
  grid(opts.outer);
  grid(opts.inner);

  const O = (i: number, j: number) => j * stride + i;
  const I = (i: number, j: number) => count + j * stride + i;

  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      idx.push(O(i, j), O(i + 1, j), O(i + 1, j + 1), O(i, j), O(i + 1, j + 1), O(i, j + 1));
      idx.push(I(i, j), I(i + 1, j + 1), I(i + 1, j), I(i, j), I(i, j + 1), I(i + 1, j + 1));
    }
  }
  // v1 rim faces along +v, v0 rim the other way.
  for (let i = 0; i < nu; i++) {
    idx.push(O(i, nv), O(i + 1, nv), I(i + 1, nv), O(i, nv), I(i + 1, nv), I(i, nv));
    idx.push(O(i, 0), I(i + 1, 0), O(i + 1, 0), O(i, 0), I(i, 0), I(i + 1, 0));
  }
  if (!opts.wrapU) {
    for (let j = 0; j < nv; j++) {
      idx.push(O(0, j), O(0, j + 1), I(0, j + 1), O(0, j), I(0, j + 1), I(0, j));
      idx.push(O(nu, j), I(nu, j + 1), O(nu, j + 1), O(nu, j), I(nu, j), I(nu, j + 1));
    }
  }
  return finish(pos, uv, idx);
}

/**
 * A closed outline given a lens cross-section: full width at the centre, inset
 * at both faces. Axe heads, spear blades and shield bosses are cut this way, so
 * the cutting edge thins out on its own instead of ending in a slab.
 */
function lensPrism(outline: Array<[number, number]>, thickness: number, inset: number): THREE.BufferGeometry {
  const n = outline.length;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of outline) { cx += x; cy += y; }
  cx /= n; cy /= n;

  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const ringAt = (z: number, k: number): number => {
    const base = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const [x, y] = outline[i];
      pos.push(cx + (x - cx) * k, cy + (y - cy) * k, z);
      uv.push(i / n, (z / thickness) + 0.5);
    }
    return base;
  };
  const shrink = 1 - inset;
  const back = ringAt(-thickness * 0.5, shrink);
  const mid = ringAt(0, 1);
  const front = ringAt(thickness * 0.5, shrink);

  const band = (a: number, b: number) => {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      idx.push(a + i, b + j, b + i, a + i, a + j, b + j);
    }
  };
  band(back, mid);
  band(mid, front);

  const fan = (base: number, z: number, flip: boolean) => {
    const c = pos.length / 3;
    pos.push(cx, cy, z);
    uv.push(0.5, 0.5);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (flip) idx.push(c, base + j, base + i);
      else idx.push(c, base + i, base + j);
    }
  };
  fan(front, thickness * 0.5, false);
  fan(back, -thickness * 0.5, true);

  return finish(pos, uv, idx);
}

// ---- primitive shorthands, so the build code reads as anatomy ----
const ball = (r: number, s = 10) => new THREE.SphereGeometry(r, s, Math.max(4, Math.round(s * 0.6)));
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const rod = (rTop: number, rBot: number, h: number, s = 8) => new THREE.CylinderGeometry(rTop, rBot, h, s);
const ring = (r: number, tube: number, s = 6, t = 16) => new THREE.TorusGeometry(r, tube, s, t);

// ============================================================
// Assembly — one merged mesh per substance per moving part
// ============================================================

/**
 * Collects primitives against the material they wear, then hands back one merged
 * geometry per material. A pauldron, its rim, its rivets and the mail under it
 * are four shapes and one draw call.
 */
class Part {
  private slots = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, transform?: THREE.Matrix4): this {
    if (transform) geo.applyMatrix4(transform);
    const list = this.slots.get(mat);
    if (list) list.push(geo);
    else this.slots.set(mat, [geo]);
    return this;
  }

  /** Same shape on both sides of the body, mirrored rather than rebuilt. */
  addMirrored(make: (side: number) => THREE.BufferGeometry, mat: THREE.Material, place: (side: number) => THREE.Matrix4): this {
    for (const side of [-1, 1]) this.add(make(side), mat, place(side));
    return this;
  }

  merge(): Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }> {
    const out: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }> = [];
    for (const [mat, list] of this.slots) {
      if (list.length === 1) {
        out.push({ geo: list[0], mat });
        continue;
      }
      const merged = mergeGeometries(list, false);
      if (merged) {
        for (const g of list) g.dispose();
        out.push({ geo: merged, mat });
      } else {
        // Only reachable if a primitive turns up with a stray attribute; a few
        // extra draw calls beat a warrior that fails to build.
        for (const g of list) out.push({ geo: g, mat });
      }
    }
    return out;
  }
}

type MergedPart = Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>;

/**
 * Identical loadouts share their merged geometry. The count is per *mesh*, which
 * is exactly the granularity anim.ts disposes at — it walks a dead warrior and
 * calls `geometry.dispose()` once per mesh — so the release below lands when the
 * last body wearing this kit leaves the field and not a moment before.
 */
const RIG_CACHE = new Map<string, Map<string, MergedPart>>();
const USES = new WeakMap<THREE.BufferGeometry, number>();
const LIB_IDS = new WeakMap<CharacterMaterials, string>();
let libSeq = 0;

function libraryId(m: CharacterMaterials): string {
  let id = LIB_IDS.get(m);
  if (!id) {
    id = `L${++libSeq}`;
    LIB_IDS.set(m, id);
  }
  return id;
}

function guard(geo: THREE.BufferGeometry, signature: string): void {
  const real = THREE.BufferGeometry.prototype.dispose;
  geo.dispose = function (this: THREE.BufferGeometry) {
    const n = (USES.get(geo) ?? 1) - 1;
    USES.set(geo, n);
    if (n > 0) return;
    RIG_CACHE.delete(signature);
    real.call(this);
  };
}

// ============================================================
// The skeleton
// ============================================================

/**
 * Per-class build. This is the first thing the eye reads at gameplay distance —
 * before kit, before colour — so the spread is deliberately wider than life:
 * the berserker is a head-and-shoulders bigger animal than the runekeeper.
 */
interface BuildTrait { stature: number; shoulder: number; bulk: number; limb: number }

const BUILD: Record<WarriorClass, BuildTrait> = {
  huscarl: { stature: 1.01, shoulder: 1.07, bulk: 1.07, limb: 1.05 },
  warden: { stature: 1.0, shoulder: 1.0, bulk: 1.0, limb: 1.0 },
  runekeeper: { stature: 0.965, shoulder: 0.9, bulk: 0.92, limb: 0.9 },
  berserker: { stature: 1.045, shoulder: 1.12, bulk: 1.05, limb: 1.12 },
};

/**
 * Every landmark on the body, in metres. The ratios are human: crown at 7.4
 * head-heights, arm span equal to stature, shoulders at 0.29 of it, knee at
 * 0.27. Nothing below this line invents its own height.
 */
interface Skeleton {
  crown: number; chin: number; headY: number; headR: { x: number; y: number; z: number };
  neckTop: number; neckBase: number; neckR: number;
  shoulderY: number; shoulderX: number;
  chestY: number; waistY: number; beltY: number; hipY: number; hipX: number;
  kneeY: number; ankleY: number;
  upperArm: number; foreArm: number; gripDrop: number;
  chestHW: number; chestHD: number; waistHW: number; waistHD: number;
  hipHW: number; hipHD: number; yokeHW: number; yokeHD: number;
  armR: [number, number, number, number]; // shoulder, elbow-top, elbow-bottom, wrist
  legR: [number, number, number, number];  // hip, knee-top, calf, ankle
}

function skeleton(b: BuildTrait): Skeleton {
  const s = b.stature;
  const w = b.bulk;
  const l = b.limb;
  return {
    crown: 1.98 * s,
    chin: 1.712 * s,
    headY: 1.862 * s,
    // The cranium is a near-sphere and the jaw is hung below it by the surface
    // field, rather than the whole head being one tall ellipsoid. Stretching a
    // sphere to 0.264 of height gives the crown a curvature radius of 52 mm and
    // the warrior a hard-boiled egg for a skull; this splits 0.115 of braincase
    // from 0.145 of face and lands the same 7.5-head silhouette.
    headR: { x: 0.084 * s, y: 0.115 * s, z: 0.107 * s },
    neckTop: 1.66 * s,
    neckBase: 1.47 * s,
    neckR: 0.063 * s * mix(1, w, 0.5),
    shoulderY: 1.522 * s,
    shoulderX: 0.198 * s * b.shoulder,
    chestY: 1.43 * s,
    waistY: 1.205 * s,
    beltY: 1.163 * s,
    hipY: 1.02 * s,
    hipX: 0.104 * s * mix(1, w, 0.5),
    kneeY: 0.53 * s,
    ankleY: 0.092 * s,
    upperArm: 0.32 * s,
    foreArm: 0.262 * s,
    gripDrop: 0.075 * s,
    // A ribcage is narrower than the shoulder line that hangs off it. At 0.20
    // the chest was wider than the shoulder joint plus half a humerus, so both
    // upper arms lived inside the torso and the body read as one slab with two
    // forearms below it. 0.176 puts the arm back outside the mail where it can
    // be seen, and gives the V from shoulder to waist that says "fighter".
    chestHW: 0.176 * s * w,
    chestHD: 0.128 * s * w,
    waistHW: 0.152 * s * w,
    waistHD: 0.107 * s * w,
    hipHW: 0.168 * s * w,
    hipHD: 0.116 * s * w,
    yokeHW: 0.138 * s * w,
    yokeHD: 0.1 * s * w,
    armR: [0.062 * l, 0.05 * l, 0.053 * l, 0.033 * l],
    legR: [0.098 * l, 0.068 * l, 0.079 * l, 0.043 * l],
  };
}

// ============================================================
// Level of detail
// ============================================================

export type CharacterDetail = "high" | "medium" | "low";

interface Lod {
  body: number; limb: number;
  headU: number; headV: number;
  shellU: number; shellV: number;
  trim: boolean; fingers: boolean;
}

const LOD: Record<CharacterDetail, Lod> = {
  high: { body: 18, limb: 12, headU: 28, headV: 20, shellU: 14, shellV: 8, trim: true, fingers: true },
  medium: { body: 14, limb: 10, headU: 22, headV: 15, shellU: 10, shellV: 6, trim: true, fingers: true },
  // Low drops ornament and tessellation. It does not drop a layer, a hem or a
  // class silhouette — those are art direction, and the bar says art direction
  // survives the tier.
  low: { body: 10, limb: 7, headU: 14, headV: 10, shellU: 7, shellV: 4, trim: false, fingers: false },
};

// ============================================================
// The face
// ============================================================

/**
 * Maps a unit direction onto a human skull, in metres, centred on the head's own
 * origin. Every feature is a gaussian pushing the ellipsoid in or out: brow
 * ridge, eye socket, nasal dorsum, zygomatic arch, buccal hollow, mental
 * protuberance, gonial angle. It is not a portrait, but it is a *surface* — the
 * brow throws a shadow into the socket and the cheekbone catches the fire, which
 * is the whole reason a face reads at all.
 *
 * Everything worn on the head is sampled through this same function, so hair
 * sits on the skull it belongs to and war paint lies on the cheek rather than
 * hovering in front of it.
 */
function faceSurface(R: { x: number; y: number; z: number }, d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const x = d.x;
  const y = d.y;
  const z = d.z;
  const ax = Math.abs(x);
  const sx = x < 0 ? -1 : 1;
  // The front of the face; everything below uses it as a mask so a cheekbone
  // does not also grow out of the back of the head.
  const front = clamp01(z * 1.15);

  // Base ellipsoid, narrowed toward the chin and again over the crown.
  const low = clamp01((-y - 0.05) / 0.85);
  const high = clamp01((y - 0.42) / 0.58);
  const taper = 1 - 0.26 * low * low;
  const dome = 1 - 0.15 * high * high;

  let px = x * R.x * taper * dome;
  // The face hangs off the braincase. Everything below the cheekbone gets pulled
  // down into a mandible, which is what turns a sphere into a head.
  let py = y * R.y - 0.03 * Math.pow(clamp01((-y - 0.22) / 0.78), 1.3);
  let pz = z * R.z * (1 - 0.1 * low * low) * (1 - 0.09 * high * high);

  // Brow ridge and glabella — the single most valuable millimetre on the head.
  const brow = bump(ax - 0.31, y - 0.3, 0, 0.3, 0.13, 1) * front;
  pz += 0.0135 * brow;
  py += 0.003 * brow;
  pz += 0.006 * bump(x, y - 0.27, 0, 0.11, 0.11, 1) * front;

  // Eye sockets, set under it.
  const socket = bump(ax - 0.35, y - 0.09, 0, 0.17, 0.115, 1) * front;
  pz -= 0.0125 * socket;
  px -= sx * 0.004 * socket;

  // Nasal dorsum: narrow, projecting hardest at the tip, with wings at the base.
  const nasalRun = smooth(-0.12, 0.0, y) * (1 - smooth(0.3, 0.5, y));
  const proj = 0.01 + 0.03 * (1 - clamp01((y + 0.08) / 0.42));
  pz += proj * bump(x, 0, 0, 0.2, 1, 1) * nasalRun * front;
  const wing = bump(ax - 0.13, y + 0.02, 0, 0.075, 0.07, 1) * front;
  pz += 0.006 * wing;
  px += sx * 0.005 * wing;

  // Cheekbone over a hollow — the pair is what stops a face reading as a balloon.
  const zygo = bump(ax - 0.52, y - 0.02, 0, 0.2, 0.17, 1) * front;
  px += sx * 0.007 * zygo;
  pz += 0.006 * zygo;
  const hollow = bump(ax - 0.43, y + 0.3, 0, 0.2, 0.15, 1) * front;
  px -= sx * 0.005 * hollow;
  pz -= 0.006 * hollow;

  // Mouth: a crease with a lip above and below it.
  pz -= 0.0055 * bump(x, y + 0.37, 0, 0.27, 0.045, 1) * front;
  pz += 0.0035 * bump(x, y + 0.31, 0, 0.22, 0.05, 1) * front;
  pz += 0.0035 * bump(x, y + 0.45, 0, 0.2, 0.055, 1) * front;

  // Chin and jaw angle.
  const chin = bump(x, y + 0.68, 0, 0.24, 0.17, 1) * front;
  pz += 0.012 * chin;
  py -= 0.004 * chin;
  const gonion = bump(ax - 0.62, y + 0.54, z, 0.26, 0.22, 0.9);
  px += sx * 0.011 * gonion;

  // Temple hollow and occipital bun.
  px -= sx * 0.005 * bump(ax - 0.82, y - 0.36, z - 0.3, 0.2, 0.22, 0.7);
  pz -= 0.009 * bump(x, y - 0.02, z + 0.92, 1, 0.4, 0.32);

  return out.set(px, py, pz);
}

/** Outward normal of the head at a direction — close enough to hang kit on. */
function faceNormal(R: { x: number; y: number; z: number }, d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(d.x / R.x, d.y / R.y, d.z / R.z).normalize();
}

const _d = new THREE.Vector3();
const _n = new THREE.Vector3();

function dirOf(u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  const cv = Math.cos(v);
  return out.set(Math.sin(u) * cv, Math.sin(v), Math.cos(u) * cv);
}

function headGeometry(R: { x: number; y: number; z: number }, nu: number, nv: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rings: number[] = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    const v = -Math.PI / 2 + (j / nv) * Math.PI;
    rings.push(pos.length / 3);
    for (let i = 0; i <= nu; i++) {
      const u = (i / nu) * Math.PI * 2;
      faceSurface(R, dirOf(u, v, _d), p);
      pos.push(p.x, p.y, p.z);
      uv.push(i / nu, j / nv);
    }
  }
  const stride = nu + 1;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride + 1;
      const e = a + stride;
      idx.push(a, b, c, a, c, e);
    }
  }
  const g = finish(pos, uv, idx);
  weldRingNormals(g, rings, nu);
  return g;
}

/**
 * Anything worn on the head: hair, beard, war paint, a helm bowl, a hood. `lift`
 * is how far proud of the skin it stands, so a helm can sit over hair that sits
 * over the skull without any of the three intersecting.
 */
function headWear(
  R: { x: number; y: number; z: number },
  opts: {
    u0: number; u1: number;
    v0: (u: number) => number; v1: (u: number) => number;
    nu: number; nv: number; wrapU?: boolean;
    lift(u: number, v: number): number;
    thick: number;
  },
): THREE.BufferGeometry {
  const surf = (t: number, s: number, offset: number, out: THREE.Vector3) => {
    const u = mix(opts.u0, opts.u1, t);
    const v = mix(opts.v0(u), opts.v1(u), s);
    dirOf(u, v, _d);
    faceSurface(R, _d, out);
    faceNormal(R, _d, _n);
    out.addScaledVector(_n, offset);
  };
  return patch({
    nu: opts.nu,
    nv: opts.nv,
    wrapU: opts.wrapU,
    outer: (t, s, out) => surf(t, s, opts.lift(mix(opts.u0, opts.u1, t), s), out),
    inner: (t, s, out) => surf(t, s, opts.lift(mix(opts.u0, opts.u1, t), s) - opts.thick, out),
  });
}

// ============================================================
// Hands
// ============================================================

/**
 * A closed fist around a shaft, built in a canonical frame: the weapon runs
 * along +X, the palm sits on the -Z side, the fingers wrap over the top and the
 * thumb crosses them. It is fifteen small shapes and one merged mesh, and the
 * only thing that matters at gameplay distance is that four knuckles and one
 * opposed thumb are visible — which is exactly what a mitten never had.
 */
function fistGeometry(lod: Lod, scale: number): THREE.BufferGeometry {
  const s = scale;
  const parts: THREE.BufferGeometry[] = [];
  const seg = lod.fingers ? 8 : 6;

  // Palm and the heel of the hand, offset off the shaft so the shaft sits in the
  // hollow the fingers close over. Swept rather than boxed: a slab here reads as
  // a mitten with knuckles drawn on, which is the thing this replaces.
  const palm = shell([
    { y: 0.042 * s, hw: 0.038 * s, hd: 0.019 * s },
    { y: 0.0, hw: 0.046 * s, hd: 0.022 * s },
    { y: -0.04 * s, hw: 0.043 * s, hd: 0.021 * s },
    { y: -0.062 * s, hw: 0.032 * s, hd: 0.017 * s },
  ], seg + 2, { power: 2.5, capTop: true, capBottom: true });
  palm.applyMatrix4(xf(0, -0.006 * s, -0.04 * s, 0.12, 0, 0));
  parts.push(palm);

  if (lod.fingers) {
    // Four fingers, each three beads on an arc around the shaft. The index
    // finger rides highest, the little finger lowest, which is what gives the
    // fist a diagonal knuckle line instead of a row of dominoes.
    for (let f = 0; f < 4; f++) {
      const fx = (-0.033 + f * 0.022) * s;
      const rr = (0.031 - f * 0.0015) * s;
      const gr = (0.0108 - f * 0.0008) * s;
      for (let k = 0; k < 3; k++) {
        const a = -1.25 + k * 0.95;
        const bead = ball(gr * (1 - k * 0.08), seg);
        bead.applyMatrix4(xf(fx, Math.cos(a) * rr - 0.004 * s, Math.sin(a) * rr - 0.006 * s, 0, 0, 0, 1.25, 1, 1));
        parts.push(bead);
      }
    }
    // Thumb: base off the palm, tip laid across the fingers. Separated, and
    // pointing the other way — the read that says "gripping" rather than "blob".
    const thumbA = rod(0.014 * s, 0.012 * s, 0.048 * s, 6);
    thumbA.applyMatrix4(xf(-0.042 * s, -0.02 * s, -0.014 * s, 0.5, 0, -1.15));
    parts.push(thumbA);
    const thumbB = rod(0.012 * s, 0.0095 * s, 0.046 * s, 6);
    thumbB.applyMatrix4(xf(-0.008 * s, 0.006 * s, 0.014 * s, 0.35, 0, -1.45));
    parts.push(thumbB);
  } else {
    const grip = rod(0.032 * s, 0.03 * s, 0.086 * s, 6);
    grip.applyMatrix4(xf(0, 0, 0, 0, 0, Math.PI / 2));
    parts.push(grip);
    const thumb = rod(0.013 * s, 0.011 * s, 0.05 * s, 5);
    thumb.applyMatrix4(xf(-0.03 * s, -0.01 * s, 0.004 * s, 0.4, 0, -1.3));
    parts.push(thumb);
  }

  const merged = mergeGeometries(parts, false);
  if (!merged) return parts[0];
  for (const g of parts) g.dispose();
  return merged;
}

/**
 * Rotates the canonical fist onto the grip axis the hand mount uses, palm turned
 * inward toward the body. `side` is +1 for the right hand.
 */
function fistPlacement(side: number, gripPitch: number, x: number, y: number, z: number): THREE.Matrix4 {
  const e1 = new THREE.Vector3(0, Math.cos(gripPitch), Math.sin(gripPitch));
  const e3 = new THREE.Vector3(-side, 0, 0);
  const e2 = new THREE.Vector3().crossVectors(e3, e1).normalize();
  const m = new THREE.Matrix4().makeBasis(e1, e2, e3);
  m.setPosition(x, y, z);
  return m;
}

// ============================================================
// Weapons
// ============================================================

/** The pitch the hand mounts sit at; weapons are built along +Y and tipped here. */
const GRIP_PITCH = 1.28;

function bladeSection(stations: Station[], seg = 6): THREE.BufferGeometry {
  return shell(stations, seg, { power: 1, capTop: true, capBottom: true });
}

/** Cord-wrapped grip: a core plus a helix of bindings, merged into the core. */
function boundGrip(
  part: Part,
  mat: THREE.Material,
  cordMat: THREE.Material,
  y0: number,
  y1: number,
  r0: number,
  r1: number,
  turns: number,
  trim: boolean,
): void {
  part.add(shell([{ y: y1, hw: r1, hd: r1 * 0.82 }, { y: (y0 + y1) / 2, hw: (r0 + r1) * 0.47, hd: (r0 + r1) * 0.4 }, { y: y0, hw: r0, hd: r0 * 0.82 }], 8, { capTop: true, capBottom: true }), mat);
  if (!trim) return;
  const n = Math.max(3, Math.round(turns));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const y = mix(y0, y1, t);
    const r = mix(r0, r1, t) + 0.0022;
    part.add(ring(r, 0.0028, 4, 10), cordMat, xf(0, y, 0, Math.PI / 2, 0, 0.16, 1, 1, 0.85));
  }
}

export function buildSword(materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  const part = new Part();
  const steel = M.blade(0xc4ccd6, 0.2);
  const dark = M.tinted("iron", 0x4c525b, { roughness: 0.5 });
  const leather = M.hide(0x2a1c10);
  const brass = M.blade(0xb9a25a, 0.34);

  // Blade: rhombic section, distal taper, 0.9 m of it. The pattern-weld comes
  // from the steel map rather than from geometry — that is what the map is for.
  part.add(bladeSection([
    { y: 1.055, hw: 0.006, hd: 0.0012 },
    { y: 0.99, hw: 0.018, hd: 0.0021 },
    { y: 0.86, hw: 0.024, hd: 0.0027 },
    { y: 0.55, hw: 0.028, hd: 0.0035 },
    { y: 0.163, hw: 0.031, hd: 0.0042 },
  ]), steel);
  // Fuller — a shallow dark groove down the centre of both faces.
  part.add(box(0.014, 0.72, 0.0086), dark, xf(0, 0.53, 0));
  // Lower guard, grip, upper guard, lobed pommel.
  part.add(shell([
    { y: 0.028, hw: 0.096, hd: 0.019 },
    { y: 0.012, hw: 0.106, hd: 0.021 },
    { y: -0.004, hw: 0.09, hd: 0.018 },
  ], 10, { power: 2.6, capTop: true, capBottom: true }), dark, xf(0, 0.15, 0));
  boundGrip(part, leather, brass, -0.075, 0.146, 0.0175, 0.0155, 7, true);
  part.add(shell([
    { y: 0.014, hw: 0.052, hd: 0.016 },
    { y: 0, hw: 0.058, hd: 0.018 },
    { y: -0.014, hw: 0.048, hd: 0.015 },
  ], 10, { power: 2.6, capTop: true, capBottom: true }), dark, xf(0, -0.082, 0));
  // Tea-cosy pommel: three lobes on a bar, the Anglo-Saxon signature.
  part.add(shell([
    { y: 0.052, hw: 0.03, hd: 0.014 },
    { y: 0.02, hw: 0.06, hd: 0.02 },
    { y: -0.012, hw: 0.062, hd: 0.021 },
  ], 12, { power: 2.2, capTop: true, capBottom: true }), brass, xf(0, -0.105, 0));
  for (const lx of [-0.038, 0, 0.038]) {
    part.add(ball(0.016, 8), brass, xf(lx, -0.062, 0, 0, 0, 0, 1, 0.8, 0.62));
  }

  for (const { geo, mat } of part.merge()) g.add(new THREE.Mesh(geo, mat));
  return g;
}

/**
 * The runekeeper's seax: single-edged with the broken-back spine that makes an
 * Anglo-Saxon knife unmistakable at a glance, and rune-etched down the flat.
 */
export function buildDagger(materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  const part = new Part();
  const steel = M.blade(0xb8c4d2, 0.24);
  const leather = M.hide(0x24303f);
  const brass = M.blade(0x9a8a56, 0.4);

  // Asymmetric section: the spine is thick and flat, the edge thins away. Built
  // as a swept box whose cross-section slides forward as the back breaks down.
  part.add(shell([
    { y: 0.5, hw: 0.008, hd: 0.0018, z: 0.006 },
    { y: 0.44, hw: 0.019, hd: 0.0028, z: 0.004 },
    { y: 0.33, hw: 0.026, hd: 0.0036, z: 0.0 },
    { y: 0.14, hw: 0.026, hd: 0.004, z: 0.0 },
    { y: 0.075, hw: 0.024, hd: 0.0038, z: 0.0 },
  ], 6, { power: 1.35, capTop: true, capBottom: true }), steel);
  part.add(shell([
    { y: 0.07, hw: 0.034, hd: 0.011 },
    { y: 0.056, hw: 0.03, hd: 0.01 },
  ], 8, { power: 2.4, capTop: true, capBottom: true }), brass);
  boundGrip(part, leather, brass, -0.075, 0.056, 0.016, 0.0145, 5, true);
  part.add(shell([
    { y: 0.016, hw: 0.024, hd: 0.014 },
    { y: -0.012, hw: 0.03, hd: 0.017 },
  ], 8, { power: 2.2, capTop: true, capBottom: true }), brass, xf(0, -0.082, 0));
  // Rune channel down the flat — the class's whole identity in one glowing line.
  part.add(box(0.0055, 0.26, 0.0092), M.get("runeGlow"), xf(0.004, 0.28, 0));

  for (const { geo, mat } of part.merge()) g.add(new THREE.Mesh(geo, mat));
  return g;
}

/** The berserker's Dane axe: bearded crescent, langets down the haft, 1.5 m. */
export function buildAxe(materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  const part = new Part();
  const steel = M.blade(0xbcc5d0, 0.22);
  const iron = M.tinted("iron", 0x5c636d, { roughness: 0.52 });
  const ash = M.timber(0x6a4c2c);
  const leather = M.hide(0x33241a);

  // Haft with a slightly oval section, thickening toward the head.
  part.add(shell([
    { y: 1.18, hw: 0.021, hd: 0.026 },
    { y: 0.7, hw: 0.019, hd: 0.024 },
    { y: 0.1, hw: 0.02, hd: 0.025 },
    { y: -0.31, hw: 0.023, hd: 0.028 },
  ], 8, { capTop: true, capBottom: true }), ash);
  part.add(shell([
    { y: -0.29, hw: 0.03, hd: 0.032 },
    { y: -0.33, hw: 0.026, hd: 0.028 },
  ], 8, { capTop: true, capBottom: true }), iron);

  // Head: outline traced counter-clockwise from the socket, out along the top
  // horn, down the crescent edge and back under the beard.
  const head: Array<[number, number]> = [
    [-0.035, -0.06], [0.03, -0.075], [0.09, -0.098], [0.155, -0.104],
    [0.2, -0.07], [0.222, 0.0], [0.212, 0.072], [0.17, 0.13],
    [0.1, 0.152], [0.035, 0.148], [-0.035, 0.135],
  ];
  part.add(lensPrism(head, 0.05, 0.42), steel, xf(0, 1.12, 0));
  // Socket and eye of the axe, wrapped round the haft.
  part.add(shell([
    { y: 0.09, hw: 0.036, hd: 0.042 },
    { y: -0.02, hw: 0.04, hd: 0.048 },
    { y: -0.09, hw: 0.035, hd: 0.042 },
  ], 10, { power: 2.4 }), iron, xf(0, 1.12, 0));
  for (const s of [-1, 1]) {
    part.add(box(0.008, 0.3, 0.05), iron, xf(s * 0.026, 0.95, 0));
  }
  // Grip binding, and a thong at the butt.
  part.add(shell([
    { y: 0.09, hw: 0.026, hd: 0.031 },
    { y: -0.09, hw: 0.028, hd: 0.033 },
  ], 8, { wall: 0.005 }), leather, xf(0, 0.02, 0));

  for (const { geo, mat } of part.merge()) g.add(new THREE.Mesh(geo, mat));
  return g;
}

/**
 * The warden's spear. Not a stylistic flourish — it is the only weapon in the
 * roster whose silhouette can be read from across the arena, which is what the
 * class needed to stop being "the huscarl without a shield".
 */
export function buildSpear(materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  const part = new Part();
  const steel = M.blade(0xc2cad4, 0.22);
  const iron = M.tinted("iron", 0x585f68, { roughness: 0.55 });
  const ash = M.timber(0x7a5e38);
  const leather = M.hide(0x2f2117);

  part.add(shell([
    { y: 1.02, hw: 0.016, hd: 0.016 },
    { y: 0.4, hw: 0.019, hd: 0.019 },
    { y: -0.2, hw: 0.019, hd: 0.019 },
    { y: -0.55, hw: 0.016, hd: 0.016 },
  ], 8, { capTop: true, capBottom: true }), ash);
  // Socket, then a leaf blade with a raised midrib.
  part.add(shell([
    { y: 1.13, hw: 0.02, hd: 0.02 },
    { y: 1.05, hw: 0.028, hd: 0.028 },
    { y: 0.99, hw: 0.024, hd: 0.024 },
  ], 8, { power: 2.2 }), iron);
  part.add(bladeSection([
    { y: 1.44, hw: 0.005, hd: 0.0014 },
    { y: 1.4, hw: 0.02, hd: 0.0038 },
    { y: 1.31, hw: 0.036, hd: 0.0062 },
    { y: 1.22, hw: 0.038, hd: 0.0068 },
    { y: 1.13, hw: 0.022, hd: 0.005 },
  ]), steel);
  part.add(box(0.009, 0.3, 0.016), iron, xf(0, 1.28, 0));
  // Ferrule at the butt and a bound hand-hold.
  part.add(shell([
    { y: -0.52, hw: 0.021, hd: 0.021 },
    { y: -0.62, hw: 0.014, hd: 0.014 },
  ], 8, { capBottom: true }), iron);
  part.add(shell([
    { y: 0.11, hw: 0.024, hd: 0.024 },
    { y: -0.11, hw: 0.025, hd: 0.025 },
  ], 8, { wall: 0.004 }), leather);

  for (const { geo, mat } of part.merge()) g.add(new THREE.Mesh(geo, mat));
  return g;
}

/**
 * A planked lime-board shield: seven boards edge to edge, domed slightly toward
 * the enemy, a rawhide-bound rim, an iron boss over the hand-hole and a grip bar
 * across the back. Built with the boss forward of the origin so the fist that
 * holds it lands behind the boards, where a hand actually goes.
 */
export function buildShield(color = 0x6b4226, materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  const part = new Part();
  const board = M.timber(color);
  const paint = M.tunic(0xb8a276);
  const iron = M.tinted("iron", 0x5f666f, { roughness: 0.5 });
  const steel = M.blade(0xa8b0ba, 0.32);
  const leather = M.hide(0x3a2a1a);

  const R = 0.44;
  const planks = 7;
  const zf = 0.05;

  for (let i = 0; i < planks; i++) {
    const t = (i + 0.5) / planks;
    const cx = (t - 0.5) * 2 * R;
    const halfW = (R / planks) * 0.97;
    // Chord height, so the board's outline follows the circle instead of ending
    // in a square corner, and a shallow dome forward of centre.
    const edge = Math.max(0.06, Math.sqrt(Math.max(0, R * R - (Math.abs(cx) + halfW) ** 2)));
    const dome = 0.028 * (1 - (cx / R) ** 2);
    const plank = box(halfW * 2, edge * 2, 0.019);
    part.add(plank, board, xf(cx, 0, zf + dome));
  }
  // Painted quarters — cheap, and the fastest way to tell two shields apart.
  for (let q = 0; q < 2; q++) {
    const wedge = new THREE.CircleGeometry(R * 0.96, 14, q * Math.PI, Math.PI * 0.5);
    part.add(wedge, paint, xf(0, 0, zf + 0.032));
  }
  // Rawhide rim, then iron clamps over it at the cardinal points.
  part.add(ring(R, 0.017, 6, 26), leather, xf(0, 0, zf + 0.014));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    part.add(box(0.03, 0.05, 0.05), iron, xf(Math.cos(a) * R, Math.sin(a) * R, zf + 0.014, 0, 0, a));
  }
  // Boss: domed over the hand-hole with a riveted flange.
  part.add(shell([
    { y: 0.0, hw: 0.038, hd: 0.038 },
    { y: -0.035, hw: 0.082, hd: 0.082 },
    { y: -0.055, hw: 0.09, hd: 0.09 },
    { y: -0.062, hw: 0.108, hd: 0.108 },
  ], 14, { capTop: true }), steel, xf(0, 0, zf + 0.088, Math.PI / 2, 0, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    part.add(ball(0.009, 6), steel, xf(Math.cos(a) * 0.098, Math.sin(a) * 0.098, zf + 0.032));
  }
  // Back: the grip bar the fist closes on, and two board battens.
  part.add(box(0.052, 0.34, 0.026), leather, xf(0, 0, zf - 0.026, 0, 0, Math.PI / 2));
  for (const s of [-1, 1]) {
    part.add(box(0.5, 0.032, 0.014), board, xf(0, s * 0.22, zf - 0.014));
  }

  for (const { geo, mat } of part.merge()) g.add(new THREE.Mesh(geo, mat));
  return g;
}

export function buildWeaponForClass(cls: WarriorClass, materials?: CharacterMaterials): THREE.Group {
  if (cls === "runekeeper") return buildDagger(materials);
  if (cls === "berserker") return buildAxe(materials);
  if (cls === "warden") return buildSpear(materials);
  return buildSword(materials);
}

// ============================================================
// Character builder
// ============================================================

export interface BuiltCharacter {
  group: THREE.Group;
  rightArm: THREE.Group;
  leftArm: THREE.Group;
  rightLeg: THREE.Group;
  leftLeg: THREE.Group;
  head: THREE.Group;
  cloak?: THREE.Group;
  torso: THREE.Mesh;
}

function signatureOf(cls: WarriorClass, ap: Appearance, accents: number, detail: CharacterDetail, lib: string): string {
  return [
    lib, detail, cls, accents,
    ap.helm, ap.hairStyle, ap.hairColor, ap.beardStyle, ap.beardColor,
    ap.cloak, ap.armorColor, ap.warPaint,
  ].join("|");
}

export function buildCharacter(
  cls: WarriorClass,
  ap: Appearance,
  accents: number,
  materials?: CharacterMaterials,
  detail: CharacterDetail = "high",
): BuiltCharacter {
  const M = materials ?? RAW;
  const lod = LOD[detail];
  const B = BUILD[cls] ?? BUILD.warden;
  const S = skeleton(B);
  const root = new THREE.Group();

  // --- substances. Held once so the merge groups by identity and eight
  // warriors in Rough Iron share one program and one geometry per part.
  //
  // The low tier collapses the near-neighbour pairs — linen into wool, buff into
  // black leather, the second skin tone into the first. That is a draw-call cut
  // on the device that needs one, and it costs a distinction that is under a
  // pixel wide on a phone. No layer, hem or class silhouette goes with it. ---
  const thrifty = detail === "low";
  const mail = M.armour(ap.armorColor);
  const wool = M.tunic(accents);
  const trouser = M.tunic(0x2f2a22);
  const wrapWool = M.tunic(0x8b7a58);
  const hide = M.hide(0x2c1e13);
  const buff = thrifty ? hide : M.hide(0x5c4229);
  const linen = thrifty ? wool : M.tinted("linen", 0xc0b49a, { repeat: 4 });
  const iron = M.tinted("iron", 0x596069, { roughness: 0.5 });
  const steel = thrifty ? iron : M.blade(0xa9b2bd, 0.3);
  const brass = M.blade(0xb9a25a, 0.34);
  const skin = M.flesh(SKIN);
  const skinDark = thrifty ? skin : M.flesh(SKIN_DARK);
  const hair = M.tunic(ap.hairColor);
  const beard = M.tunic(ap.beardColor);
  const fur = M.tunic(0x6a5238);
  const dark = M.standard(0x120d08, 0.4);
  const rune = M.get("runeGlow");
  const cloakMat = M.tunic(CLOAK_COLORS[ap.cloak] ?? 0x5a4030);

  // --- merged-geometry cache. Only for callers that brought a shared library;
  // the armoury preview allocates and disposes its own materials, so caching its
  // geometry would hand the next preview a mesh pointing at a dead program. ---
  const signature = materials ? signatureOf(cls, ap, accents, detail, libraryId(M)) : null;
  let store = signature ? RIG_CACHE.get(signature) : undefined;
  if (signature && !store) {
    store = new Map<string, MergedPart>();
    RIG_CACHE.set(signature, store);
  }

  function emit(name: string, parent: THREE.Object3D, make: () => Part): THREE.Mesh[] {
    let merged = store?.get(name);
    if (!merged) {
      merged = make().merge();
      if (store && signature) {
        for (const { geo } of merged) guard(geo, signature);
        store.set(name, merged);
      }
    }
    const meshes: THREE.Mesh[] = [];
    for (const { geo, mat } of merged) {
      if (signature) USES.set(geo, (USES.get(geo) ?? 0) + 1);
      const mesh = new THREE.Mesh(geo, mat);
      parent.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }

  // Class kit flags, read all over the build below.
  const heavy = cls === "huscarl";
  const lamellar = cls === "warden";
  const bare = cls === "berserker";
  const robed = cls === "runekeeper";

  // ==========================================================
  // LEGS — pivot at the hip joint, everything below in leg space
  // ==========================================================
  const legPivots: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * S.hipX, S.hipY, 0);
    root.add(pivot);
    legPivots.push(pivot);

    const knee = S.kneeY - S.hipY;
    const ankle = S.ankleY - S.hipY;
    const sole = -S.hipY;
    const [rHip, rKnee, rCalf, rAnkle] = S.legR;

    emit(`leg${side}`, pivot, () => {
      const p = new Part();
      // Thigh into knee into calf into ankle — one continuous taper, with the
      // calf belly sitting where a calf actually sits.
      p.add(shell([
        { y: 0.03, hw: rHip * 1.02, hd: rHip * 1.05 },
        { y: -0.16, hw: rHip * 0.94, hd: rHip * 0.98 },
        { y: knee + 0.02, hw: rKnee * 1.06, hd: rKnee * 1.02 },
        { y: knee - 0.03, hw: rKnee * 1.02, hd: rKnee * 1.06 },
        { y: knee - 0.12, hw: rCalf, hd: rCalf * 1.1, z: -0.012 },
        { y: ankle + 0.1, hw: rAnkle * 1.3, hd: rAnkle * 1.35 },
        { y: ankle, hw: rAnkle, hd: rAnkle * 1.05 },
      ], lod.limb, { capTop: true, capBottom: true }), robed ? trouser : trouser);

      // Leg wraps: wound wool from ankle to below the knee, the one piece of
      // Dark Age kit everybody wore and nobody models.
      const wrapTop = knee - 0.05;
      p.add(shell([
        { y: wrapTop, hw: rKnee * 1.14, hd: rKnee * 1.16 },
        { y: mix(wrapTop, ankle, 0.5), hw: rCalf * 1.1, hd: rCalf * 1.14 },
        { y: ankle + 0.03, hw: rAnkle * 1.28, hd: rAnkle * 1.32 },
      ], lod.limb, { wall: 0.008 }), wrapWool);
      if (lod.trim) {
        for (let i = 0; i < 5; i++) {
          const t = (i + 0.5) / 5;
          const y = mix(wrapTop, ankle + 0.03, t);
          const r = mix(rKnee * 1.14, rAnkle * 1.28, t) + 0.004;
          p.add(ring(r, 0.0045, 4, 10), buff, xf(0, y, 0, Math.PI / 2, 0, 0.14, 1, 1, 1.04));
        }
      }
      if (lamellar && lod.trim) {
        // Iron shin plate — the warden's discipline, visible below the hem.
        p.add(shell([
          { y: knee - 0.09, hw: rCalf * 1.24, hd: rCalf * 1.3 },
          { y: ankle + 0.08, hw: rAnkle * 1.5, hd: rAnkle * 1.6 },
        ], lod.limb, { wall: 0.009 }), iron);
      }

      // Turnshoe: heel, sole, instep and a toe that comes to a point rather than
      // a brick, plus a thong round the ankle.
      p.add(ball(rAnkle * 1.25, 8), hide, xf(0, ankle - 0.01, -0.012, 0, 0, 0, 1, 0.9, 1.2));
      p.add(box(0.098, 0.062, 0.2), hide, xf(0, sole + 0.038, 0.045, 0.04, 0, 0));
      p.add(ball(0.05, 8), hide, xf(0, sole + 0.032, 0.135, 0, 0, 0, 0.92, 0.62, 1.5));
      p.add(box(0.104, 0.016, 0.245), buff, xf(0, sole + 0.008, 0.05));
      if (lod.trim) p.add(ring(rAnkle * 1.3, 0.005, 4, 10), buff, xf(0, ankle + 0.005, -0.006, Math.PI / 2, 0, 0));
      return p;
    });
  }
  const [leftLeg, rightLeg] = legPivots;

  // ==========================================================
  // TORSO — under-tunic, then wool, then metal, then straps
  // ==========================================================
  const torsoMeshes = emit("torso", root, () => {
    const p = new Part();
    const seg = lod.body;

    // One profile for the body, sampled by every layer that goes over it. Each
    // garment used to carry its own station list, which is how the trapezius
    // slope ended up compressed into 2 mm of height and the waist vanished
    // entirely: a layer can only agree with the body if it is derived from it.
    const spine: Station[] = [
      { y: S.neckBase + 0.155, hw: S.yokeHW * 0.5, hd: S.yokeHD * 0.62 },
      { y: S.neckBase + 0.1, hw: S.yokeHW * 0.8, hd: S.yokeHD * 0.88 },
      { y: S.shoulderY + 0.022, hw: S.chestHW * 0.93, hd: S.chestHD * 0.95 },
      { y: S.shoulderY - 0.03, hw: S.chestHW * 0.995, hd: S.chestHD * 0.99 },
      { y: S.chestY, hw: S.chestHW, hd: S.chestHD },
      { y: S.waistY, hw: S.waistHW, hd: S.waistHD },
      { y: S.hipY + 0.03, hw: S.hipHW, hd: S.hipHD },
      { y: S.hipY - 0.05, hw: S.hipHW * 0.94, hd: S.hipHD * 0.94 },
    ];
    const at = (y: number, pad: number, flare = 0): Station => {
      let i = 0;
      while (i < spine.length - 2 && y < spine[i + 1].y) i++;
      const a = spine[i];
      const b = spine[i + 1];
      const t = clamp01((a.y - y) / (a.y - b.y || 1));
      return { y, hw: mix(a.hw, b.hw, t) + pad + flare, hd: mix(a.hd, b.hd, t) + pad + flare };
    };
    const layer = (ys: number[], pad: number, flares?: number[]): Station[] =>
      ys.map((y, i) => at(y, pad, flares?.[i] ?? 0));

    // Where every neck opening sits. High: a hauberk collar 150 mm below the
    // chin leaves a column of bare throat that reads as a giraffe.
    const collar = S.neckBase + 0.145;
    if (bare) {
      p.add(shell(spine, seg, { power: 2.4, capTop: true, capBottom: true }), skin);
      // Pectorals and a rack of abdominals, as separate masses so the light
      // breaks over them instead of sliding round a barrel.
      for (const s of [-1, 1]) {
        p.add(ball(0.072 * B.bulk, 10), skin, xf(s * S.chestHW * 0.46, S.chestY + 0.03, S.chestHD * 0.72, 0, 0, 0, 1.25, 0.72, 0.5));
      }
      for (let i = 0; i < 3; i++) {
        for (const s of [-1, 1]) {
          p.add(ball(0.034 * B.bulk, 8), skin, xf(s * 0.042, S.chestY - 0.09 - i * 0.062, S.waistHD * 0.86, 0, 0, 0, 1, 0.85, 0.42));
        }
      }
    } else {
      // Linen shirt: the first layer, and the one that shows at the collar and
      // the cuff. Its whole job is to be visible for 15 mm at each opening.
      p.add(shell(layer([S.neckBase + 0.15, S.shoulderY, S.chestY, S.waistY, S.hipY, S.hipY - 0.05], 0.008), seg, { power: 2.4, capTop: true, capBottom: true }), linen);
    }

    // Wool tunic over it, hem to mid-thigh, with a real rolled edge.
    const tunicHem = robed ? 0.7 * B.stature : 0.86 * B.stature;
    if (!bare) {
      p.add(shell(
        layer(
          [collar, S.shoulderY + 0.01, S.chestY, S.waistY, S.hipY, tunicHem + 0.06, tunicHem],
          0.021,
          [-0.008, 0, 0, 0.003, 0.01, 0.03, 0.045],
        ),
        seg, { power: 2.3, wall: 0.014 },
      ), robed ? cloakMat : wool);
    } else {
      // A sleeveless hide jerkin, open at the chest.
      p.add(shell(
        layer([S.shoulderY + 0.02, S.chestY - 0.02, S.waistY, S.hipY - 0.02], 0.024, [0, 0, 0.002, 0.006]),
        seg, { power: 2.3, wall: 0.016 },
      ), buff);
      p.add(box(0.14, 0.34, 0.02), buff, xf(0, S.chestY - 0.02, S.chestHD + 0.02, 0.1, 0, 0));
    }

    // The metal layer. Mail hangs and flares; lamellar is rigid and banded, and
    // the difference has to be visible from behind.
    if (lamellar) {
      // Rigid plate laced in courses. Each row overhangs the one below, so the
      // torso reads as banded from any angle — nothing like the way mail hangs.
      const rows = lod.trim ? 6 : 4;
      const top = S.shoulderY - 0.005;
      const bottom = S.hipY + 0.02;
      for (let i = 0; i < rows; i++) {
        const y0 = mix(top, bottom, i / rows);
        const y1 = mix(top, bottom, (i + 1) / rows);
        p.add(shell([at(y0, 0.03), at(y1 + 0.005, 0.038)], seg, { power: 2.3, wall: 0.012 }), mail);
      }
      p.add(shell(layer([S.shoulderY + 0.03, S.shoulderY - 0.012], 0.03, [0, 0.012]), seg, { power: 2.3, wall: 0.012 }), steel);
    } else if (!bare) {
      const mailHem = heavy ? 0.82 * B.stature : 0.98 * B.stature;
      p.add(shell(
        layer(
          [collar - 0.015, S.shoulderY + 0.02, S.chestY, S.waistY, S.hipY, mailHem + 0.05, mailHem],
          0.036,
          [-0.014, 0, 0, 0.004, 0.012, 0.036, 0.052],
        ),
        seg, { power: 2.3, wall: 0.016 },
      ), robed ? buff : mail);
      if (heavy) {
        // Bishop's mantle: a second cape of mail over the shoulders. This is the
        // huscarl's silhouette — heavy, round-shouldered, immovable.
        p.add(shell(
          layer([collar, S.shoulderY + 0.015, S.chestY + 0.005], 0.05, [-0.022, 0, 0.018]),
          seg, { power: 2.2, wall: 0.014 },
        ), mail);
      }
    }

    // Belt, buckle, strap-end. Everything below the waist hangs off this.
    const beltR = (bare ? 0.03 : 0.05);
    p.add(shell([at(S.beltY + 0.028, beltR), at(S.beltY - 0.028, beltR + 0.004)], seg, { power: 2.3, wall: 0.014 }), hide);
    p.add(box(0.072, 0.06, 0.018), brass, xf(0, S.beltY, S.waistHD + beltR + 0.012));
    p.add(box(0.026, 0.11, 0.01), hide, xf(0.055, S.beltY - 0.05, S.waistHD + beltR + 0.008, 0.1, 0, -0.12));
    if (lod.trim) {
      for (let i = 0; i < 6; i++) {
        const a = -0.8 + i * 0.32;
        p.add(box(0.016, 0.022, 0.008), brass, xf(Math.sin(a) * (S.waistHW + beltR + 0.01), S.beltY, Math.cos(a) * (S.waistHD + beltR + 0.01), 0, a, 0));
      }
    }

    // Baldric across the chest, and a scabbard hung off it on the left.
    if (!robed) {
      p.add(box(0.052, 0.62, 0.016), buff, xf(-0.055, S.chestY - 0.03, S.chestHD + 0.045, 0.16, 0, 0.62));
      p.add(box(0.052, 0.5, 0.016), buff, xf(-0.055, S.chestY - 0.03, -S.chestHD - 0.04, -0.16, 0, 0.62));
      p.add(ball(0.026, 8), brass, xf(-0.11, S.chestY + 0.13, S.chestHD + 0.05, 0, 0, 0, 1, 1, 0.5));
    }
    if (cls === "huscarl" || cls === "warden") {
      p.add(shell([
        { y: 0.0, hw: 0.028, hd: 0.014 },
        { y: -0.46, hw: 0.022, hd: 0.011 },
        { y: -0.5, hw: 0.008, hd: 0.005 },
      ], 8, { power: 2.2, capTop: true, capBottom: true }), buff, xf(-S.hipHW - 0.06, S.beltY - 0.02, -0.03, 0.32, 0, 0.34));
    }

    // Class ornament that hangs on the body rather than on a limb.
    if (bare) {
      // Fur ruff and pelt down the back. Shaggy shoulders and bare arms are the
      // berserker read at any distance.
      p.add(shell(
        layer([S.neckBase + 0.14, S.shoulderY + 0.03, S.chestY + 0.02], 0.055, [-0.03, 0.025, 0]),
        seg, { power: 2.1, wall: 0.02 },
      ), fur);
      if (lod.trim) {
        // Locks hanging off the ruff, not boulders sitting on it. Each points
        // down and outward from the shoulder line, which is what makes fur read
        // as fur rather than as a shelf of eggs.
        for (let i = 0; i < 11; i++) {
          const a = 0.55 + (i / 10) * (Math.PI * 1.85);
          const rx = S.chestHW + 0.062;
          const rz = S.chestHD + 0.062;
          const len = 0.09 + Math.sin(i * 2.7) * 0.028;
          p.add(rod(0.024, 0.005, len, 5), fur, xf(
            Math.sin(a) * rx, S.shoulderY - 0.01 - len * 0.4, Math.cos(a) * rz,
            0.55 * Math.cos(a), 0, -0.55 * Math.sin(a),
          ));
        }
      }
      p.add(box(0.3, 0.6, 0.03), fur, xf(0, S.chestY - 0.12, -S.chestHD - 0.075, -0.12, 0, 0));
      for (let i = 0; i < 4; i++) {
        p.add(rod(0.008, 0.003, 0.06, 5), M.tinted("bone", 0xd8cfb4, { repeat: 1 }), xf(-0.06 + i * 0.04, S.chestY + 0.06, S.chestHD + 0.05, 2.6, 0, 0.2 - i * 0.13));
      }
    }
    if (robed) {
      // Rune-carver's belt: pouches, a slate tablet and a lit amulet.
      p.add(box(0.1, 0.13, 0.06), buff, xf(0.13, S.beltY - 0.09, S.waistHD + 0.03, 0.1, -0.3, 0));
      p.add(box(0.08, 0.11, 0.05), buff, xf(-0.14, S.beltY - 0.08, S.waistHD + 0.02, 0.1, 0.3, 0));
      p.add(box(0.07, 0.12, 0.014), M.timber(0x4a3a2a), xf(0.02, S.beltY - 0.12, -S.waistHD - 0.05, 0, 0, 0.2));
      p.add(rod(0.0035, 0.0035, 0.2, 4), hide, xf(0, S.chestY + 0.09, S.chestHD + 0.02, 0.4, 0, 0));
      p.add(ball(0.023, 8), rune, xf(0, S.chestY - 0.01, S.chestHD + 0.056));
      for (let i = 0; i < 5; i++) {
        p.add(box(0.006, 0.03, 0.006), rune, xf(-0.09 + i * 0.045, S.beltY, S.waistHD + beltR + 0.014));
      }
    }
    if (heavy && lod.trim) {
      for (let i = 0; i < 5; i++) {
        const a = -0.7 + i * 0.35;
        p.add(ball(0.014, 6), brass, xf(Math.sin(a) * (S.chestHW + 0.1), S.chestY + 0.012, Math.cos(a) * (S.chestHD + 0.092)));
      }
    }
    if (lamellar) {
      p.add(box(0.055, 0.055, 0.012), brass, xf(0, S.chestY + 0.06, S.chestHD + 0.052, 0, 0, Math.PI / 4));
    }

    // Cloak clasp. Built here rather than on the cloak pivot because a brooch is
    // pinned to the shoulder and does not swing with the hem — and because a
    // mesh of its own would be a whole draw call for two shapes.
    if (ap.cloak !== "none") {
      p.add(ball(0.028, 10), brass, xf(-S.shoulderX * 0.72, S.shoulderY + 0.03, S.chestHD + 0.06, 0, 0, 0, 1, 1, 0.55));
      p.add(ring(0.03, 0.007, 5, 12), brass, xf(-S.shoulderX * 0.72, S.shoulderY + 0.03, S.chestHD + 0.055, 0.35, 0, 0));
    }

    // Neck, from inside the collar up to the jaw. Modelled here rather than on
    // the head pivot so a nod turns the skull and not the whole throat.
    p.add(shell([
      { y: S.neckTop + 0.05, hw: S.neckR * 0.94, hd: S.neckR * 0.94 },
      { y: S.neckTop - 0.06, hw: S.neckR, hd: S.neckR * 1.02 },
      { y: S.neckBase + 0.02, hw: S.neckR * 1.2, hd: S.neckR * 1.24 },
      { y: S.neckBase - 0.04, hw: S.neckR * 1.7, hd: S.neckR * 1.6 },
    ], lod.limb, { capTop: true }), skinDark);
    return p;
  });

  // ==========================================================
  // ARMS — pivot at the shoulder joint
  // ==========================================================
  const armPivots: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * S.shoulderX, S.shoulderY, 0);
    root.add(pivot);
    armPivots.push(pivot);

    const elbow = -S.upperArm;
    const wrist = elbow - S.foreArm;
    const grip = wrist - S.gripDrop;
    const [rSh, rEl, rElB, rWr] = S.armR;

    emit(`arm${side}`, pivot, () => {
      const p = new Part();
      const sleeve = bare ? skin : wool;

      // Upper arm with a deltoid cap and a bicep belly; forearm with the flare
      // at the elbow and the narrow at the wrist. Real taper, both segments.
      p.add(shell([
        { y: 0.055, hw: rSh * 1.06, hd: rSh * 1.06 },
        { y: -0.06, hw: rSh * 1.04, hd: rSh * 1.08 },
        { y: -0.19, hw: rSh * 0.9, hd: rSh * 0.94 },
        { y: elbow + 0.02, hw: rEl * 1.06, hd: rEl * 1.06 },
        { y: elbow - 0.01, hw: rEl, hd: rEl * 1.04 },
      ], lod.limb, { capTop: true }), skin);
      p.add(shell([
        { y: elbow + 0.005, hw: rElB * 1.04, hd: rElB * 1.06 },
        { y: elbow - 0.075, hw: rElB, hd: rElB * 1.02 },
        { y: wrist + 0.055, hw: rWr * 1.25, hd: rWr * 1.2 },
        { y: wrist, hw: rWr, hd: rWr * 1.1 },
      ], lod.limb, { capBottom: true }), skin);

      if (!bare) {
        // Linen shirt sleeve, then the wool over it, cuffed short so both edges
        // show. Layer thickness you can see is the point of the whole exercise.
        p.add(shell([
          { y: 0.05, hw: rSh * 1.12, hd: rSh * 1.12 },
          { y: elbow + 0.06, hw: rEl * 1.16, hd: rEl * 1.18 },
        ], lod.limb, { wall: 0.007 }), linen);
        p.add(shell([
          { y: 0.06, hw: rSh * 1.22, hd: rSh * 1.22 },
          { y: -0.16, hw: rSh * 1.14, hd: rSh * 1.18 },
          { y: elbow + 0.11, hw: rEl * 1.24, hd: rEl * 1.26 },
        ], lod.limb, { wall: 0.011 }), sleeve);
      }

      // The metal on the shoulder, and mail down to the elbow where the class
      // wears it. Cap sits outboard of the torso so it reads as a separate
      // piece bearing on the shoulder rather than a bulge in the chest.
      if (!bare) {
        const capR = rSh * (heavy ? 1.62 : 1.44);
        p.add(shell([
          { y: 0.085, hw: capR * 0.48, hd: capR * 0.52 },
          { y: 0.045, hw: capR * 0.88, hd: capR * 0.92 },
          { y: -0.02, hw: capR, hd: capR * 1.02 },
          { y: -0.055, hw: capR * 0.96, hd: capR * 0.98 },
        ], lod.limb, { power: 2.2, wall: 0.012, capTop: true }), lamellar ? steel : mail);
        if (lod.trim) {
          p.add(ring(capR * 0.98, 0.008, 4, 12), lamellar ? steel : iron, xf(0, -0.05, 0, Math.PI / 2, 0, 0, 1, 1, 1.02));
          for (let i = 0; i < 4; i++) {
            const a = -0.9 + i * 0.6;
            p.add(ball(0.009, 6), brass, xf(Math.sin(a) * capR * 0.9, 0.01, Math.cos(a) * capR * 0.94));
          }
        }
        if (heavy || lamellar) {
          p.add(shell([
            { y: -0.035, hw: rSh * 1.3, hd: rSh * 1.32 },
            { y: elbow + 0.09, hw: rEl * 1.36, hd: rEl * 1.38 },
            { y: elbow + 0.04, hw: rEl * 1.42, hd: rEl * 1.44 },
          ], lod.limb, { wall: 0.011 }), mail);
        }
      } else {
        // Bare arms: fur at the shoulder, iron rings on the biceps.
        p.add(shell([
          { y: 0.075, hw: rSh * 1.1, hd: rSh * 1.14 },
          { y: -0.02, hw: rSh * 1.5, hd: rSh * 1.55 },
          { y: -0.075, hw: rSh * 1.3, hd: rSh * 1.34 },
        ], lod.limb, { power: 2.1, wall: 0.016, capTop: true }), fur);
        p.add(ring(rSh * 1.02, 0.011, 5, 12), brass, xf(0, -0.14, 0, Math.PI / 2, 0, 0));
        if (lod.trim) p.add(ring(rSh * 0.96, 0.009, 5, 12), brass, xf(0, -0.2, 0, Math.PI / 2, 0, 0));
      }

      // Bracer over the forearm, buckled. Ends short of the wrist so the arm
      // reads as skin, leather and metal rather than one painted tube.
      p.add(shell([
        { y: elbow - 0.09, hw: rElB * 1.16, hd: rElB * 1.2 },
        { y: wrist + 0.075, hw: rWr * 1.36, hd: rWr * 1.34 },
        { y: wrist + 0.028, hw: rWr * 1.3, hd: rWr * 1.28 },
      ], lod.limb, { wall: 0.01 }), robed ? buff : hide);
      if (lod.trim) {
        for (let i = 0; i < 3; i++) {
          const y = mix(elbow - 0.09, wrist + 0.03, (i + 0.5) / 3);
          p.add(box(0.014, 0.018, 0.008), brass, xf(side * rWr * 1.36, y, 0.006, 0, side * 1.4, 0));
        }
      }
      if (robed) {
        p.add(box(0.006, 0.05, 0.008), rune, xf(side * rWr * 1.3, wrist + 0.07, 0.004, 0, side * 1.5, 0));
      }

      // The fist, rotated onto the axis the weapon will run along.
      p.add(fistGeometry(lod, B.limb), skinDark, fistPlacement(side, GRIP_PITCH, side * 0.006, grip, 0.028));
      return p;
    });

    // The weapon mount is added LAST on purpose: anim.ts and the armoury preview
    // both find it as the arm's final child. Do not add anything after it.
    const mount = new THREE.Group();
    mount.position.set(side * 0.006, grip, 0.028);
    mount.rotation.set(GRIP_PITCH, 0, 0);
    mount.name = "handMount";
    pivot.add(mount);
  }
  const [rightArm, leftArm] = armPivots;

  // ==========================================================
  // HEAD — pivot at the atlas, everything measured off the skull
  // ==========================================================
  const headPivot = new THREE.Group();
  headPivot.position.set(0, S.neckTop, 0);
  root.add(headPivot);

  const R = S.headR;
  const skullY = S.headY - S.neckTop;
  const helmed = ap.helm === "iron" || ap.helm === "nasal" || ap.helm === "spectacle" || ap.helm === "crowned";

  emit("head", headPivot, () => {
    const p = new Part();
    const place = xf(0, skullY, 0);

    p.add(headGeometry(R, lod.headU, lod.headV), skin, place.clone());

    // Ears, set back where the jaw hinges rather than out on the cheek.
    for (const s of [-1, 1]) {
      p.add(ball(0.021, 8), skin, xf(s * R.x * 0.94, skullY - 0.004, -0.024, 0.12, s * 0.42, 0, 0.4, 1.2, 0.92));
    }

    // Eyes, sunk into the sockets the displacement field already carved, with a
    // lid over the top so they are not two beads on a wall.
    for (const s of [-1, 1]) {
      const d = dirOf(s * 0.36, 0.085, new THREE.Vector3());
      const q = faceSurface(R, d, new THREE.Vector3());
      p.add(ball(0.0125, 8), dark, xf(q.x * 0.96, skullY + q.y, q.z * 0.9, 0, 0, 0, 1, 1, 0.72));
      p.add(ball(0.017, 8), skin, xf(q.x * 0.95, skullY + q.y + 0.012, q.z * 0.86, 0, 0, 0, 1.35, 0.5, 0.6));
    }
    // Brows, conformed to the ridge and angled down toward the temple. Thin: at
    // 4 mm they were two black slabs, which is the one thing worse than none.
    for (const s of [-1, 1]) {
      p.add(headWear(R, {
        u0: s * 0.1, u1: s * 0.58,
        v0: (u) => 0.155 - 0.055 * clamp01((Math.abs(u) - 0.1) / 0.48),
        v1: (u) => 0.205 - 0.055 * clamp01((Math.abs(u) - 0.1) / 0.48),
        nu: 4, nv: 1, lift: () => 0.0025, thick: 0.0022,
      }), hair, place.clone());
    }

    // ---- hair ----
    if (ap.hairStyle !== "shaved") {
      const crop = ap.hairStyle === "short";
      p.add(headWear(R, {
        u0: 0, u1: Math.PI * 2, wrapU: true,
        // High over the forehead, low at the nape, receding at the temples —
        // and volume that builds toward the crown rather than at the hairline.
        // A hairline is a ragged thing. The cos(5u) term is what stops it
        // reading as a swim cap pulled on straight.
        v0: (u) => (crop ? 0.24 : 0.16) + 0.24 * Math.cos(u) - 0.05 * Math.cos(u * 2) + 0.035 * Math.cos(u * 5 + 1.1),
        v1: () => Math.PI / 2 - 0.02,
        nu: Math.max(8, lod.shellU), nv: lod.shellV,
        lift: (_u, v) => 0.006 + 0.014 * v,
        thick: 0.007,
      }), hair, place.clone());
      if (ap.hairStyle === "long") {
        p.add(shell([
          { y: skullY + 0.09, hw: R.x * 1.12, hd: R.z * 1.0, z: -0.022 },
          { y: skullY - 0.05, hw: R.x * 1.24, hd: R.z * 0.86, z: -0.045 },
          { y: skullY - 0.2, hw: R.x * 1.3, hd: R.z * 0.62, z: -0.06 },
          { y: skullY - 0.3, hw: R.x * 1.18, hd: R.z * 0.48, z: -0.06 },
        ], lod.limb, { power: 2.4, wall: 0.014 }), hair);
      }
      if (ap.hairStyle === "braids") {
        for (const s of [-1, 1]) {
          for (let i = 0; i < 4; i++) {
            p.add(ball(0.021 - i * 0.0026, 6), hair, xf(s * (R.x * 1.05 - i * 0.004), skullY - 0.01 - i * 0.048, -0.03 - i * 0.006, 0, 0, 0, 1, 1.15, 1));
          }
          p.add(ring(0.014, 0.004, 4, 8), brass, xf(s * R.x * 1.02, skullY - 0.19, -0.05, Math.PI / 2, 0, 0));
        }
      }
    }

    // ---- beard ----
    if (ap.beardStyle !== "none") {
      const full = ap.beardStyle !== "short";
      // One patch, not two. The top edge climbs from the lip line at the midline
      // to the sideburn at the ear, which is where a beard's edge actually runs;
      // the separate moustache bar this replaces read as a strip of tape.
      const cheek = (u: number) => {
        const t = smooth(0.25, 1.05, Math.abs(u));
        return mix(full ? -0.26 : -0.44, full ? 0.04 : -0.08, t) + 0.028 * Math.cos(u * 6.5);
      };
      p.add(headWear(R, {
        u0: -1.12, u1: 1.12,
        v0: () => -1.0,
        v1: cheek,
        nu: Math.max(7, lod.shellU), nv: Math.max(3, lod.shellV),
        lift: (_u, v) => (full ? 0.007 + 0.015 * (1 - v) : 0.0045),
        thick: full ? 0.01 : 0.004,
      }), beard, place.clone());
      // Philtrum gap: a real moustache parts under the nose. Two short patches
      // rather than one bar is what sells it.
      if (full) {
        for (const s of [-1, 1]) {
          p.add(headWear(R, {
            u0: s * 0.055, u1: s * 0.36,
            v0: () => -0.34, v1: () => -0.2,
            nu: 3, nv: 1, lift: () => 0.008, thick: 0.006,
          }), beard, place.clone());
        }
      }
      if (ap.beardStyle === "full") {
        p.add(shell([
          { y: skullY - 0.1, hw: 0.062, hd: 0.05, z: 0.03 },
          { y: skullY - 0.17, hw: 0.055, hd: 0.045, z: 0.028 },
          { y: skullY - 0.23, hw: 0.032, hd: 0.028, z: 0.024 },
        ], lod.limb, { capBottom: true }), beard);
      } else if (ap.beardStyle === "forked") {
        for (const s of [-1, 1]) {
          p.add(shell([
            { y: skullY - 0.1, hw: 0.036, hd: 0.032, z: 0.03 },
            { y: skullY - 0.19, hw: 0.03, hd: 0.026, z: 0.026 },
            { y: skullY - 0.26, hw: 0.014, hd: 0.013, z: 0.02 },
          ], 8, { capBottom: true }), beard, xf(s * 0.032, 0, 0, 0, 0, -s * 0.18));
        }
      } else if (ap.beardStyle === "braided") {
        for (let i = 0; i < 4; i++) {
          p.add(ball(0.03 - i * 0.004, 8), beard, xf(0, skullY - 0.1 - i * 0.052, 0.03 - i * 0.003, 0, 0, 0, 1, 1.1, 1));
        }
        p.add(ring(0.021, 0.005, 4, 10), brass, xf(0, skullY - 0.235, 0.02, Math.PI / 2, 0, 0));
      }
    }

    // ---- war paint, lying on the skin ----
    if (ap.warPaint !== "none") {
      const paint = M.standard(ap.warPaint === "cross" ? 0x1d2f52 : 0x6e1a11, 0.92);
      if (ap.warPaint === "stripes") {
        for (let i = 0; i < 3; i++) {
          const u = -0.62 + i * 0.2;
          p.add(headWear(R, {
            u0: u - 0.045, u1: u + 0.045,
            v0: () => -0.42, v1: () => 0.28,
            nu: 1, nv: 4, lift: () => 0.0022, thick: 0.0016,
          }), paint, place.clone());
        }
      } else if (ap.warPaint === "cross") {
        p.add(headWear(R, {
          u0: -0.075, u1: 0.075, v0: () => -0.55, v1: () => 0.5,
          nu: 1, nv: 5, lift: () => 0.0022, thick: 0.0016,
        }), paint, place.clone());
        p.add(headWear(R, {
          u0: -0.6, u1: 0.6, v0: () => 0.08, v1: () => 0.2,
          nu: 5, nv: 1, lift: () => 0.0022, thick: 0.0016,
        }), paint, place.clone());
      } else {
        p.add(headWear(R, {
          u0: -1.45, u1: 0.02, v0: () => -0.7, v1: () => 0.9,
          nu: Math.max(4, lod.shellU - 4), nv: lod.shellV,
          lift: () => 0.0022, thick: 0.0016,
        }), paint, place.clone());
      }
    }

    // ---- helms ----
    if (helmed) {
      // Spangenhelm bowl: four iron plates on a brow band, riveted at the ribs.
      p.add(headWear(R, {
        u0: 0, u1: Math.PI * 2, wrapU: true,
        v0: () => 0.26, v1: () => Math.PI / 2 - 0.02,
        nu: Math.max(10, lod.shellU + 2), nv: lod.shellV,
        lift: (_u, v) => 0.021 + 0.005 * v,
        thick: 0.008,
      }), iron, place.clone());
      // Brow band. Sized off the bowl rather than off the skull — at the old
      // radius it stood 13 mm proud all round and the helm wore a sombrero brim
      // — and raised to sit above the brow ridge rather than across the eyes.
      p.add(headWear(R, {
        u0: 0, u1: Math.PI * 2, wrapU: true,
        v0: () => 0.245, v1: () => 0.44,
        nu: Math.max(10, lod.shellU + 2), nv: 1,
        lift: () => 0.026,
        thick: 0.01,
      }), steel, place.clone());
      if (lod.trim) {
        for (let i = 0; i < 4; i++) {
          const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
          p.add(headWear(R, {
            u0: a - 0.05, u1: a + 0.05,
            v0: () => 0.3, v1: () => Math.PI / 2 - 0.05,
            nu: 1, nv: 3, lift: () => 0.027, thick: 0.005,
          }), steel, place.clone());
        }
      }
      if (ap.helm !== "iron") {
        // Nasal, dropped from the band and standing clear of the nose it covers.
        p.add(box(0.03, 0.135, 0.013), steel, xf(0, skullY + 0.016, R.z + 0.052, -0.1, 0, 0));
        p.add(box(0.05, 0.032, 0.013), steel, xf(0, skullY + 0.079, R.z + 0.05, -0.1, 0, 0));
      }
      if (ap.helm === "spectacle" || ap.helm === "crowned") {
        // Spectacle plate: brows in iron with the eye holes cut under them. Sits
        // proud of the face so the sockets stay in shadow behind it.
        for (const s of [-1, 1]) {
          p.add(headWear(R, {
            u0: s * 0.1, u1: s * 0.66,
            v0: () => 0.1, v1: () => 0.26,
            nu: 4, nv: 2, lift: () => 0.026, thick: 0.008,
          }), steel, place.clone());
        }
        // Cheek guards, hinged off the band.
        for (const s of [-1, 1]) {
          p.add(headWear(R, {
            u0: s * 0.38, u1: s * 1.0,
            v0: () => -0.62, v1: () => 0.25,
            nu: 3, nv: 3, lift: () => 0.026, thick: 0.008,
          }), iron, place.clone());
        }
      }
      if (ap.helm === "crowned") {
        // Gilded circlet, sized to sit on the bowl rather than to hover round it.
        const cr = R.x + 0.031;
        const cz = (R.z + 0.031) / cr;
        const cy = skullY + R.y * 0.34;
        p.add(ring(cr, 0.01, 5, 18), brass, xf(0, cy, 0, Math.PI / 2, 0, 0, 1, 1, cz));
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.3;
          p.add(rod(0.002, 0.01, 0.042, 4), brass, xf(Math.sin(a) * cr * 0.95, cy + 0.026, Math.cos(a) * cr * cz * 0.95, 0.2 * Math.cos(a), 0, -0.2 * Math.sin(a)));
        }
      }
      if (lamellar) {
        // Fore-and-aft comb. The warden's one unmistakable outline cue.
        p.add(headWear(R, {
          u0: -0.06, u1: 0.06,
          v0: () => 0.26, v1: () => Math.PI / 2 - 0.02,
          nu: 1, nv: 4, lift: (_u, v) => 0.032 + 0.03 * Math.sin(v * Math.PI), thick: 0.008,
        }), steel, place.clone());
        p.add(headWear(R, {
          u0: Math.PI - 0.06, u1: Math.PI + 0.06,
          v0: () => 0.26, v1: () => Math.PI / 2 - 0.02,
          nu: 1, nv: 4, lift: (_u, v) => 0.032 + 0.03 * Math.sin(v * Math.PI), thick: 0.008,
        }), steel, place.clone());
      }
      // Mail aventail off the back of the band.
      if (!lamellar) {
        p.add(shell([
          { y: skullY + R.y * 0.08, hw: R.x * 1.2 + 0.024, hd: R.z * 1.14 + 0.024, z: -0.012 },
          { y: skullY - R.y * 0.62, hw: R.x * 1.34 + 0.026, hd: R.z * 1.0 + 0.026, z: -0.026 },
          { y: skullY - R.y * 1.05, hw: R.x * 1.42 + 0.026, hd: R.z * 0.82 + 0.026, z: -0.034 },
        ], Math.max(10, lod.body - 4), { power: 2.2, wall: 0.014 }), mail);
      }
    } else if (ap.helm === "hood") {
      // A deep hood with a point at the back — the runekeeper's outline, and the
      // reason the face under it reads as shadow rather than as a blank.
      p.add(headWear(R, {
        u0: 0, u1: Math.PI * 2, wrapU: true,
        v0: (u) => -0.5 + 0.5 * Math.cos(u) * 0.6,
        v1: () => Math.PI / 2 - 0.02,
        nu: Math.max(10, lod.shellU), nv: lod.shellV + 1,
        lift: (u, v) => 0.03 + 0.05 * (1 - v) * clamp01(-Math.cos(u)) + 0.02 * v,
        thick: 0.012,
      }), robed ? cloakMat : hide, place.clone());
      p.add(shell([
        { y: skullY + R.y * 0.6, hw: 0.03, hd: 0.03, z: -R.z * 0.9 },
        { y: skullY + R.y * 0.2, hw: 0.05, hd: 0.05, z: -R.z * 1.25 },
        { y: skullY - R.y * 0.4, hw: 0.028, hd: 0.028, z: -R.z * 1.5 },
      ], 8, { capTop: true, capBottom: true }), robed ? cloakMat : hide);
      // Shoulder drape, so the hood is attached to something.
      p.add(shell([
        { y: skullY - R.y * 0.5, hw: R.x * 1.5, hd: R.z * 1.35 },
        { y: skullY - R.y * 1.5, hw: R.x * 2.3, hd: R.z * 1.9 },
        { y: skullY - R.y * 1.9, hw: R.x * 2.6, hd: R.z * 2.1 },
      ], Math.max(10, lod.body - 4), { power: 2.2, wall: 0.014 }), robed ? cloakMat : hide);
    }
    return p;
  });

  // ==========================================================
  // CLOAK — hung from a yoke behind the shoulders
  // ==========================================================
  let cloak: THREE.Group | undefined;
  if (ap.cloak !== "none") {
    const pivot = new THREE.Group();
    pivot.position.set(0, S.shoulderY + 0.035, -0.02);
    root.add(pivot);
    cloak = pivot;

    const drop = heavy ? 0.95 : robed ? 1.24 : 1.06;
    const spread = 0.56 * Math.PI;
    // Elliptical, not circular: a body is wider than it is deep, and a cloak cut
    // on a circle either cuts through the shoulders or stands 130 mm off the
    // spine. The flare is modest and the folds carry the drape — at +0.26 of
    // flare with a shallow ripple this was a stiff sail.
    const topX = S.chestHW + 0.055;
    const topZ = S.chestHD + 0.05;
    const hemX = topX + 0.135;
    const hemZ = topZ + 0.155;

    emit("cloak", pivot, () => {
      const p = new Part();
      const surf = (u: number, v: number, inset: number, out: THREE.Vector3) => {
        const a = mix(-spread, spread, u);
        const fold = Math.cos(a * 5.5) * 0.03 * v * v + Math.cos(a * 11) * 0.009 * v;
        const grow = v * v * 0.6 + v * 0.4;
        const rx = mix(topX, hemX, grow) + fold - inset;
        const rz = mix(topZ, hemZ, grow) + fold - inset;
        // The hem hangs lower at the back than at the leading edges.
        const y = -drop * v * (1 - 0.12 * Math.abs(a / spread));
        out.set(Math.sin(a) * rx, y, -Math.cos(a) * rz);
      };
      p.add(patch({
        nu: Math.max(9, lod.shellU), nv: Math.max(6, lod.shellV + 2),
        outer: (u, v, out) => surf(u, v, 0, out),
        inner: (u, v, out) => surf(u, v, 0.014, out),
      }), cloakMat);
      // Rolled collar along the top edge, following the cloak's own arc rather
      // than ringing the whole chest — the flat disc this replaces read as a
      // plank laid across the shoulders.
      p.add(patch({
        nu: Math.max(9, lod.shellU), nv: 1,
        outer: (u, v, out) => surf(u, v * 0.05, -0.013, out),
        inner: (u, v, out) => surf(u, v * 0.05, 0.015, out),
      }), cloakMat);
      if (lod.trim) {
        p.add(patch({
          nu: Math.max(9, lod.shellU), nv: 1,
          outer: (u, v, out) => surf(u, mix(0.93, 1.0, v), -0.004, out),
          inner: (u, v, out) => surf(u, mix(0.93, 1.0, v), 0.018, out),
        }), ap.cloak === "gold" ? brass : hide);
      }
      return p;
    });
  }

  return {
    group: root,
    rightArm,
    leftArm,
    rightLeg,
    leftLeg,
    head: headPivot,
    cloak,
    torso: torsoMeshes[0],
  };
}
