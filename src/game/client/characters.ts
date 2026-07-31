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
//   4. A HEAD IS ATTACHED BY A SHADOW, NOT BY CONTACT. The owner looked at
//      `art/shots/v3/lineup.png` and said the heads "aren't attached to necks, look
//      floating? & seem a little small maybe?" — and there was no gap anywhere: the
//      neck shell reached the jaw, the head was 7.4 heads tall, every number
//      checked out. What was wrong was that head and neck *met* instead of
//      *overlapping*. A 126 mm cylinder was butted under a chin that tapers to a
//      25 mm nub, so its capped top showed as a lit horizontal plate; the throat
//      stood as far forward as the chin, so the mandible overhung nothing and threw
//      no shadow; and 113 mm of it was bare, because every neck opening in the kit
//      was hung 30 mm too low. The fix is three surfaces that fight for the same
//      space — the skull's own submandibular mass, the throat, and the mail that
//      falls off both — all in one substance so their intersections read as form
//      instead of as seams. The undercut under the jaw is the whole trick. Nothing
//      else on a character is worth as much per triangle.
//
//   5. A FACE AND A PAIR OF HANDS ARE NOT DETAILS. They are the two things a
//      player looks at, and for two iterations they were the two things that
//      were not there: helmet openings read as black voids, the hood read as a
//      blank cone, and the fists read as mittens. The void turned out to be
//      *occlusion*, not absence — a fully closed mail aventail whose front wall
//      stood proud of the nose, and a hood whose rim ran across the eyes — so a
//      built face was being bricked up behind kit. Both openings are now arcs
//      cut to leave the face where the light can reach it, and the eye behind
//      them is a real globe: pale sclera cut to an almond by two lids, a low-
//      roughness iris that catches the key as a specular dot, a lash line, and
//      lips in a warmer tone than the cheek.
//
// Geometry lives in a small toolkit at the top — a swept superelliptical shell,
// a two-sided parametric patch, a lens-section prism, a swept digit tube —
// because a body, a mail hauberk, a cloak, a finger and an axe head are all the
// same four shapes with different numbers. The face is the one exception: it is
// a displaced sphere with an anatomical field on it, so brow, socket, cheekbone,
// jaw, nasolabial fold and lid crease are actual geometry that catches actual
// shadow, not features drawn on a ball. That field is driven per warrior from a
// seed, which is what stops a brawl of eight being one man printed eight times.
//
// A note on winding, because it cost three bugs in one pass: `patch` takes its
// facing from ∂u × ∂v and `digit` from ∂ring × ∂row. Sweep either the wrong way
// and the surface is inside out — silently, because backface culling simply
// removes it. Anything new built on those two helpers should be checked, not
// assumed.

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
    armorColor: 0x5f6b7a,
    warPaint: "none",
  };
}

/**
 * Retired armoury values, mapped to what replaced them.
 *
 * The armoury UI marks a tile as equipped by comparing the stored appearance's
 * value against the catalog's, so re-grading a finish orphans every profile that
 * had it: the warrior still builds (the colour is just a number to the builder),
 * but the armoury shows the slot as owning nothing, and the next tap charges the
 * player again for what he already bought. Rough Iron was lifted from 0x4a5568
 * this pass because as the default finish it is the largest surface in the game
 * and it carried less light than the turf underfoot.
 *
 * Keyed by the dead value, so a lookup that misses is the common case and costs
 * nothing. Entries stay forever — a profile in localStorage has no expiry.
 */
const RETIRED_ARMOUR: Record<number, number> = {
  0x4a5568: 0x5f6b7a, // Rough Iron, before the v3 lighting pass
};

/**
 * Brings a stored appearance up to the current catalog. Call this on anything
 * that came out of localStorage or off the wire before showing it in the armoury;
 * it is a no-op for anything already current.
 */
export function migrateAppearance(ap: Appearance): Appearance {
  const armorColor = RETIRED_ARMOUR[ap.armorColor];
  return armorColor === undefined ? ap : { ...ap, armorColor };
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
      // Rough Iron is what every warrior wears until he buys something, so it is
      // the largest single surface in the game. At 0x4a5568 it carried 0.09 linear
      // — under the turf it stands on — and every layer of kit over it landed
      // inside one black shape. Lifted about half a stop; still the dullest,
      // cheapest finish in the catalog, and still unmistakably iron rather than
      // steel. (Stored profiles holding the old value will show no finish selected
      // until the player re-picks one; the warrior still builds correctly.)
      { id: "armor_iron", label: "Rough Iron", cost: 0, slot: "armor", value: 0x5f6b7a },
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

// Skin is authored as a *set*, not a colour. A single diffuse tone is the thing
// that makes CG flesh read as painted plastic: real skin is translucent, so the
// thin places — ear, nose tip, lip, knuckle, eyelid — pass red light through and
// the thick places do not. Four tones per warrior fake that for the price of two
// extra materials: `base` on the broad planes, `shade` where the form turns away
// (socket, jaw shelf, under the nose, palm), `warm` on the translucent edges and
// on the bone that flushes — cheekbone, lip, ear, fingertip — and `sclera`,
// which is a complexion property for the reason given where it is used. It is a
// cheat, but it is the same cheat every hand-painted game character has used for
// twenty years, and it survives a night key that a subsurface shader would not.
//
// The `base`→`shade` gap widened this pass and that is not decoration. The rig a
// warrior stands in is ambient 0.85 + hemisphere 0.62 + a `bounce` directional
// aimed along (0, −4, 9) at 1.7 — for a front-facing plane that is roughly 60% of
// the light on the face arriving either omnidirectionally or straight down the
// camera axis, and light along the view axis carries *no* form information. Only
// the key at (12, 26, 9) shades, and it shades up/down-facing relief. So a face
// lit front-on in this arena cannot be shaded into legibility by geometry alone at
// portrait size; some of the break has to be in the albedo. `shade` is now about
// 0.72 of `base` rather than 0.85: the old pair was inside a quarter-stop of each
// other, so putting it on the socket and the jaw shelf changed nothing a viewer
// could see.
interface SkinTone { base: number; shade: number; warm: number; sclera: number }

// Four complexions, quantised on purpose: the material library caches by colour,
// so a field of eight warriors costs at most sixteen flesh programs instead of
// thirty-two. Ordered pale → weathered → tanned → dark. Every `base` came down
// about 8% this pass as well — at 0xe0b590 the face was the brightest large
// surface on the warrior and it blew flat against the helm.
const SKIN_TONES: SkinTone[] = [
  { base: 0xd4a884, shade: 0x9b7456, warm: 0xc4816a, sclera: 0xa89b88 },
  { base: 0xc99d75, shade: 0x917050, warm: 0xb87256, sclera: 0x9a8e7c },
  { base: 0xb08157, shade: 0x7f5c3c, warm: 0xa25f47, sclera: 0x847a6a },
  { base: 0x8d6444, shade: 0x65472e, warm: 0x7c4936, sclera: 0x655d50 },
];

const CLOAK_COLORS: Record<string, number> = {
  brown: 0x5a4030, red: 0x7a2020, blue: 0x24386a, gold: 0xa8842a, none: 0x5a4030,
};

/**
 * How many times a woven texture tiles across a garment, derived from how big the
 * garment is instead of fixed.
 *
 * `CharacterMaterials.tunic` asks for five repeats whatever it is dressing, and
 * that is the houndstooth. The `wool` tile is not only a weave: it carries a
 * vat-dye field at two cycles across itself, contrast-expanded, so one tile shows
 * roughly four large blotches. Five tiles round a thigh puts those blotches
 * 27 mm apart — measured off `art/shots/v4/stance.png` and confirmed against the
 * generated tile — and 27 mm of alternating light and dark on cloth is not a
 * weave, it is a printed check. Same tile at the density below lands a blotch
 * every 9 mm, which reads as coarse, fulled, hand-woven wool.
 *
 * `girth` is the distance the mesh's u axis covers in metres — a shell's u goes
 * once round, so it is the circumference. Quantised to four steps so the same
 * colour worn at three girths still shares one program and one texture view.
 */
const CLOTH_BLOTCH = 0.009;
function clothRepeat(girth: number): number {
  const want = girth / (CLOTH_BLOTCH * 4);
  return want < 10 ? 8 : want < 15 ? 12 : want < 21 ? 18 : 24;
}

// Iris colours. Dark eyes are the honest majority, but an eye only reads at all
// because the iris is *darker than the sclera around it* — so the pale two exist
// for contrast against a helmet's shadow, not for ethnographic spread. All five
// came down a step this pass, because the sclera came down further — see the
// `sclera` field on `SkinTone`, which is now per complexion.
const IRIS_COLORS = [0x33241a, 0x241810, 0x3d4a44, 0x4a5c66, 0x5a4528];

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

/**
 * Deterministic per-warrior noise. Integer in, unit float out — no state, so the
 * same seed builds the same man on the capture box and on a phone, which is the
 * only reason an A/B against `art/shots/baseline` means anything.
 */
function hash(seed: number, salt: number): number {
  let h = (seed * 374761393 + salt * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Symmetric jitter: `span(seed, salt, 0.4)` lands in ±0.4. */
const span = (seed: number, salt: number, amount: number) => (hash(seed, salt) * 2 - 1) * amount;

/**
 * Latin-square pick over `n` choices: every run of `n` consecutive seeds covers
 * all `n` values, and the run's starting point is hashed so consecutive blocks do
 * not repeat the same order. Uniform sampling is only uniform in the limit, and
 * the sample that matters here is eight warriors on one field — where a fair coin
 * happily hands four of them the same complexion, which is the exact "one man
 * cloned" read this variation exists to break.
 */
const stratify = (seed: number, salt: number, n: number) =>
  (Math.floor(hash(Math.floor(seed / n), salt) * n) + (seed % n)) % n;

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
  /**
   * Rolls the ring's sampling round by a fraction of a step, so no vertex lands
   * exactly on the ±hw extremes.
   *
   * This exists for one defect and it is worth naming. A section with
   * `power < 2` closes to a mathematical point at ±hw, and with the default
   * phase there is a vertex sitting on that point — so a sword's cutting edge is
   * a silhouette of literally zero width, two faces meeting along a line with
   * nothing between them. A rasteriser cannot hold that: the edge alternates
   * between covering and missing a pixel centre down its length, and the post
   * chain's fringing paints the misses red. That is the 1 px speckle the second
   * critic panel logged along the spear and sword edges.
   *
   * At phase 0.5 the two vertices nearest the edge straddle it instead, leaving a
   * land a few tenths of a millimetre deep — invisible as width, and the
   * difference between an edge that holds still and one that crawls. The blade's
   * width has to be scaled back up to compensate; `bladeSection` does that.
   */
  phase?: number;
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

  const phase = opts.phase ?? 0;
  const ring = (st: Station, inset: number): number => {
    const base = pos.length / 3;
    const hw = Math.max(2e-4, st.hw - inset);
    const hd = Math.max(2e-4, st.hd - inset);
    const v = 1 - (yTop - st.y) / span;
    for (let i = 0; i <= seg; i++) {
      const a = ((i + phase) / seg) * Math.PI * 2;
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
 *
 * Those rim strips are also this file's most reliable source of defects, and the
 * rule is worth stating once here rather than rediscovering it a fifth time. A
 * rim strip's normal points *along* the sheet, not out of it — so at a boundary
 * in silhouette it faces the camera and the key squarely while the sheet either
 * side of it does not, and it renders as a hard line of a completely different
 * value. Under about two pixels wide that line cannot be resolved: it flickers
 * between covering and missing pixel centres, and the post chain's chromatic
 * aberration paints the misses red. Every "1 px red speckle" the second panel
 * logged — cloak hem, war paint, face tones, the beard's lower edge — is that
 * one mechanism.
 *
 * So a boundary is safe in exactly two states: buried (the sheet's lift falls to
 * nothing there, so the strip is inside the surface underneath) or *thick enough
 * to shade*, several pixels across at the distance it is seen from. Anything in
 * between stipples. Callers below are written to land in one state or the other
 * and say which.
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

/**
 * Rewrites a geometry's UVs in place: scale v, then offset both axes.
 *
 * For the substances outside `WORLD_TILE` — `oak` on the shield is the one that
 * matters — the mesh's own UV attribute is the only thing deciding where a
 * texture lands and how big it is, and `BoxGeometry` hands every face the same
 * 0..1 whatever size that face is. This is the lever for both the phase and the
 * density, and it costs one pass over the attribute at build time.
 *
 * `sv` scales about v = 0 rather than about the centre, so a run of boards
 * normalised to a common tile still starts its grain from a common datum and
 * `dv` remains a meaningful phase.
 */
function retile(geo: THREE.BufferGeometry, du: number, dv: number, sv = 1): THREE.BufferGeometry {
  const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) + du, uv.getY(i) * sv + dv);
  }
  uv.needsUpdate = true;
  return geo;
}

// ---- primitive shorthands, so the build code reads as anatomy ----
const ball = (r: number, s = 10) => new THREE.SphereGeometry(r, s, Math.max(4, Math.round(s * 0.6)));
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const rod = (rTop: number, rBot: number, h: number, s = 8) => new THREE.CylinderGeometry(rTop, rBot, h, s);
const ring = (r: number, tube: number, s = 6, t = 16) => new THREE.TorusGeometry(r, tube, s, t);

// ============================================================
// Emissive discipline
// ============================================================
//
// A bare emissive is the only primitive in this file that can fail the bar on its
// own, and it has now done it three times in three different colours: the hall
// doorway's orange quad, the warden's brass lace diamond, and — in
// `art/shots/v7/lineup.png` — the runekeeper's amulet, a 30 mm `runeGlow` bead
// drawing a five-pixel white square on his chest.
//
// The mechanism is the same every time and it is not the colour. `runeGlow` runs
// its blue channel at ~5.4 linear against a bloom threshold of 5.0, which is
// exactly where materials.ts wants it for a metre of carved runestone twenty
// metres off. On a bead whose entire footprint is five pixels, every one of those
// pixels is over the clip — so what reaches the frame is the primitive's
// *silhouette* at flat white, and the silhouette of an eight-segment sphere at
// five pixels is a square. Lowering the intensity would break the surface the
// number was tuned on; raising the segment count only makes a rounder white blob.
//
// What actually fixes it is that the edge of an emissive must not be as hot as
// its middle. Give the substance a field that falls to a dark matrix at the
// border of every face it dresses and no primitive wearing it can present a flat
// lit edge — at any size, on any geometry, in any preset.
//
// So it is enforced rather than remembered. `Part.add` is the one door every
// primitive in this file passes through — body, kit, weapons, the armoury
// preview's mannequin — and it substitutes a shaped clone for anything that
// arrives emitting with nothing to shape it. A future call site cannot bring the
// fault back by writing the same line that caused it three times.

/**
 * The field an emissive substance is cut into: a dark matrix with one hot stroke
 * through the middle of every face, reaching the matrix exactly at the border.
 *
 * Flat-topped rather than peaked, and that is the number that took two tries to
 * get right. A falloff that starts at the centre puts its own peak wherever the
 * geometry's u = 0.5 happens to land — which on `SphereGeometry` is the meridian
 * *opposite* the one three's UVs face at u = 0.25, so the amulet came out dark on
 * the side the camera sees and hot on the side buried in the robe. Held at full
 * across the middle 38% and spent entirely in the outer band, the field is 0.9 or
 * better anywhere a bead's lit cap can land and reaches the matrix only where a
 * face actually ends.
 *
 * That is also why a map can only ever be half of this. A sphere's silhouette is
 * a different great circle for every view, so no static field can darken it from
 * all angles; the sphere on the runekeeper's chest is handled by *setting* it, in
 * a bezel that claws over its rim. What the field is for is every flat-faced
 * primitive in the file — belt runes, wrist runes, a dagger's channel — where the
 * face's own border is a fixed place in UV and can be taken to nothing there.
 *
 * One tile serves as both albedo and emissive. That is not thrift: the stroke
 * that lights is the stroke that is cut, so the part reads as a dark stone with a
 * rune glowing out of it rather than as an untextured lozenge that happens to be
 * bright. §2 of the bar has no exemption for small surfaces.
 */
const GLOW_MATRIX = 0.13;
const GLOW_SHOULDER = 0.62;
let glowField: THREE.DataTexture | null = null;
function glowCarving(): THREE.DataTexture {
  if (glowField) return glowField;
  const N = 64;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = ((x + 0.5) / N) * 2 - 1;
      const v = ((y + 0.5) / N) * 2 - 1;
      const t = clamp01((1 - Math.hypot(u, v)) / GLOW_SHOULDER);
      const a = t * t * (3 - 2 * t);
      const b = Math.round(255 * mix(GLOW_MATRIX, 1, a));
      const i = (y * N + x) * 4;
      data[i] = b;
      data[i + 1] = b;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  // Authored in the space it is looked at in, and tagged so, because it is read
  // as a colour map on both channels it feeds.
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  glowField = tex;
  return tex;
}

const UNLIT = new THREE.Color(0, 0, 0);

/**
 * Keyed on the material that came in, so one library still yields one program and
 * one merged slot however many warriors ask for it — `Part` groups by material
 * identity, and a fresh clone per call would fork every rune on the field into
 * its own draw call. Weak, so the clone dies with the library that fathered it;
 * the caller that disposes the source is not expected to know this exists.
 */
const SHAPED_GLOW = new WeakMap<THREE.Material, THREE.Material>();

/** Nothing emits inside a warrior without a field to shape it. See above. */
function shapedGlow(mat: THREE.Material): THREE.Material {
  if (!(mat instanceof THREE.MeshStandardMaterial)) return mat;
  if (mat.emissiveMap || mat.alphaMap) return mat;
  if (mat.emissiveIntensity <= 0 || mat.emissive.equals(UNLIT)) return mat;
  let safe = SHAPED_GLOW.get(mat);
  if (!safe) {
    const clone = mat.clone();
    clone.emissiveMap = glowCarving();
    if (!clone.map) clone.map = glowCarving();
    clone.name = `${mat.name || "glow"}+carved`;
    clone.needsUpdate = true;
    safe = clone;
    SHAPED_GLOW.set(mat, safe);
  }
  return safe;
}

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
    // The emissive invariant is enforced here, and not at the call sites, because
    // the call sites are where it keeps being lost.
    const wear = shapedGlow(mat);
    const list = this.slots.get(wear);
    if (list) list.push(geo);
    else this.slots.set(wear, [geo]);
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
 *
 * The spread used to be too narrow to survive being looked at. Both critic
 * panels scored class silhouette a fail on the same evidence: in
 * `art/shots/v6/lineup.png` the four warriors are one body, one helmet shell and
 * one torso mass, and the only thing telling them apart is cloak colour and what
 * is in the right hand. At shoulder 1.0 / 1.07 / 1.12 the widest of them is 12%
 * across the narrowest, which is under two pixels at lineup distance — a
 * difference that exists in the numbers and nowhere in the frame.
 *
 * Three of the four fields below are new, and they are the three that change an
 * *outline* rather than a size:
 *
 *   `hem`    where the outer garment stops, as a fraction of stature. Loudest
 *            cue on the roster — a hauberk to the knee and a robe to the shin
 *            are different shapes at any distance, in any light, from behind.
 *   `bowl`   how the helm is worn: a deep round bowl pulled down over the ears,
 *            a tall combed one, or a cap sitting on the crown. Read against
 *            `Y_BROW`, so it moves the whole helm/face boundary together.
 *   `gorget` how much of the throat the class's neck kit swallows, 0 to 1. The
 *            huscarl disappears into mail; the berserker shows a bare neck.
 */
interface BuildTrait {
  stature: number; shoulder: number; bulk: number; limb: number;
  hem: number; bowl: number; gorget: number;
}

const BUILD: Record<WarriorClass, BuildTrait> = {
  // Short, immensely broad, mailed to the knee, head sunk into a coif. Reads as
  // a wall from any angle.
  huscarl: { stature: 1.005, shoulder: 1.15, bulk: 1.16, limb: 1.02, hem: 0.365, bowl: 1.12, gorget: 1.0 },
  // The soldier: upright, square, average everything, hem at mid-thigh and a
  // combed helm — the only one of the four with a hard vertical in his outline.
  warden: { stature: 1.005, shoulder: 1.02, bulk: 0.98, limb: 1.02, hem: 0.415, bowl: 0.94, gorget: 0.45 },
  // Small and narrow inside a robe to the shin. The one silhouette with no gap
  // between the legs and no shoulder line at all.
  runekeeper: { stature: 0.945, shoulder: 0.86, bulk: 0.88, limb: 0.93, hem: 0.235, bowl: 1.0, gorget: 0.0 },
  // Tall, rangy, top-heavy: long bare limbs, a fur ruff wider than his own
  // shoulders, a cap worn high, and nothing below the belt but breeches.
  berserker: { stature: 1.065, shoulder: 1.21, bulk: 1.11, limb: 1.15, hem: 0.505, bowl: 0.76, gorget: 0.0 },
};

/**
 * Every landmark on the body, in metres. The ratios are human: crown at 7.4
 * head-heights, arm span equal to stature, shoulders at 0.29 of it, knee at
 * 0.27. Nothing below this line invents its own height.
 */
interface Skeleton {
  crown: number; chin: number; headY: number; headR: { x: number; y: number; z: number };
  /** Atlas — the head pivot, and the height everything on the skull is measured from. */
  neckTop: number;
  /**
   * Cervicale: where the throat leaves the trapezius, and therefore where every
   * neck opening in the game is hung. Its own landmark rather than `neckBase +
   * 0.145` in six places, because those six places disagreed by 15 mm and the
   * collar line is the one measurement the head/neck read lives or dies on.
   */
  neckRoot: number;
  /** Base of the yoke — the anchor for the ruff and the shoulder mass, not the collar. */
  neckBase: number;
  /**
   * The neck's section, and it is not a circle. A human neck is deeper than it is
   * wide — throat to nape carries the airway, the spine and the cervical curve,
   * while side to side is two strap muscles — and sweeping it as a cylinder is
   * half of why the heads read as balanced on a pole.
   */
  neckHW: number; neckHD: number;
  shoulderY: number; shoulderX: number;
  chestY: number; waistY: number; beltY: number; hipY: number; hipX: number;
  /**
   * Crotch height — the bottom of the pelvis, and the landmark this skeleton did
   * not have. Without it the torso stopped 50 mm below the hip joint on a flat
   * open ring and the two thigh shells rose into nothing, so the body had a waist
   * and a pair of legs and no mass between them. Life is 0.47 of stature.
   */
  crotchY: number;
  /** Where the class's outer garment stops. See `BuildTrait.hem`. */
  hemY: number;
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
    crown: 1.965 * s,
    chin: 1.696 * s,
    // Set so the crown lands on `crown` exactly: the head's own surface reaches
    // `headR.y` above this and `headR.y + MANDIBLE` below it.
    headY: 1.8445 * s,
    // The cranium is a near-sphere and the jaw is hung below it by the surface
    // field, rather than the whole head being one tall ellipsoid. Stretching a
    // sphere to 0.264 of height gives the crown a curvature radius of 52 mm and
    // the warrior a hard-boiled egg for a skull; this splits 0.115 of braincase
    // from 0.145 of face and lands the same 7.5-head silhouette.
    //
    // Fourth pass on this and the last one that should be needed, because the
    // head was only ever half the problem. 260 mm of head on 1965 mm of man is
    // 7.56 heads — inside the human band and *smaller than the heroic
    // proportion an action game actually draws*, which is 7.0 to 7.3. At 269 mm
    // the figure is 7.30 heads: still nobody's caricature, and 9 mm is the
    // difference between a head that has to fight the shoulders for the eye and
    // one that wins. Breadth goes with it, to 195 mm.
    //
    // The other half was never the head at all — see `shoulderY`. A head can be
    // exactly right and still read small if there is 183 mm of neck under it.
    // Breadth is 191 mm at the base ellipsoid and about 205 over the parietal
    // eminence the field now carries — 0.75 of head height, against a life value
    // near 0.66. Deliberately past life and no further: the extra reads as a
    // blunt Saxon skull at 0.75 and as a bobble at 0.80, and the head is being
    // asked to hold its own against a 660 mm shoulder line.
    headR: { x: 0.0955 * s, y: 0.1205 * s, z: 0.1135 * s },
    neckTop: 1.66 * s,
    // The collar line, and it is *not* an anatomical cervicale: C7 sits level
    // with the top of the shoulder, and a mail standing collar rides about 40 mm
    // above that. Held at 0.839 of stature while the shoulder came up 40 mm, so
    // the throat the frame shows is 70 mm under a 269 mm head — a hair over a
    // quarter, against a bare-necked life value of 0.38.
    neckRoot: 1.648 * s,
    neckBase: 1.50 * s,
    // 124 mm across, 136 mm front to back, tapering to 100 mm across where it goes
    // up under the jaw. The 126 mm *circle* it replaces was the wrong shape in both
    // axes: too round to let the mandible overhang it, and — because it held that
    // width all the way to the chin — too wide under the jaw, which is where a neck
    // is narrowest and where being narrow is what makes the head above it read big.
    neckHW: 0.064 * s * mix(1, w, 0.6),
    neckHD: 0.070 * s * mix(1, w, 0.6),
    // THE proportion defect, and the one that made the figure read at 8.5–9
    // heads while its own skeleton computed 7.5.
    //
    // Measured off the old rig: menton at 1.705, shoulder joint at 1.522 — 183 mm
    // of neck, which is 0.70 head-heights. Life is 0.39 (chin 0.870 of stature,
    // shoulder 0.818). So 80 mm of the man was neck that should have been torso,
    // and the eye does not read a long neck as a long neck: it reads it as a
    // small head on a long body, which is exactly what the owner reported three
    // times and both panels scored. It also stole those 80 mm from the
    // shoulder-to-hip span, so the *legs* took over half the figure and read
    // "enormously long" against a torso that had nothing left.
    //
    // 1.562 is 0.795 of stature — the glenohumeral centre under an acromion at
    // 0.818, which is where the deltoid cap now crests. The visible neck comes to
    // 134 mm, 0.50 of a head. The arms below grow by the same 40 mm so the grip
    // lands at 0.865 exactly as it did: every carry offset in `anim.ts` is tuned
    // against that point, and `ELBOW_ALONG` is `upperArm / (arm + grip)`, which
    // stays at 0.486 against its constant of 0.487. Nothing downstream moves
    // except the shield, which rises 40 mm on an arm it is already mounted too
    // high on — see `docs/OPEN-DEFECTS.md`.
    shoulderY: 1.562 * s,
    shoulderX: 0.198 * s * b.shoulder,
    chestY: 1.43 * s,
    waistY: 1.205 * s,
    beltY: 1.163 * s,
    hipY: 1.02 * s,
    hipX: 0.106 * s * mix(1, w, 0.5),
    crotchY: 0.925 * s,
    hemY: 1.965 * s * b.hem,
    kneeY: 0.53 * s,
    ankleY: 0.092 * s,
    // 12% longer, both segments, which is what the shoulder rise has to be paid
    // for with. Against life: elbow lands at 0.622 of stature (0.630), wrist at
    // 0.478 (0.485). They were 0.594 and 0.478 — the wrist was right and
    // everything above it was compressed, which is why the error was invisible
    // until somebody measured the *neck* instead of the hand.
    upperArm: 0.339 * s,
    foreArm: 0.283 * s,
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
    // The pelvis, and it is 8 mm wider and 8 mm deeper than the waist above it
    // rather than 16 and 9. A hip that is barely broader than a waist has no
    // mass: the torso read as a straight tube from armpit to hem in every
    // capture, and the two thighs came out of the bottom of it as separate
    // pipes. Every garment is swept off these numbers, so this is where a skirt
    // gets its swing from as well.
    hipHW: 0.177 * s * w,
    hipHD: 0.125 * s * w,
    // Widened with the trapezius it feeds. At 0.138 the yoke had to fan 38 mm
    // out to the chest section in 18 mm of drop, which is a 65° shelf either side
    // of the neck rather than a shoulder.
    yokeHW: 0.151 * s * w,
    yokeHD: 0.106 * s * w,
    armR: [0.062 * l, 0.05 * l, 0.053 * l, 0.033 * l],
    legR: [0.098 * l, 0.068 * l, 0.079 * l, 0.043 * l],
  };
}

/**
 * How far the sole reaches in front of and behind the leg's own axis.
 *
 * Exported because it is the one thing about a warrior's geometry that a *poser*
 * has to know and currently does not. `anim.ts`'s `settleOnFeet` treats each foot
 * as a point hanging `legLen` straight down from the hip, and that is exactly
 * true only while the leg is vertical. Measured off the built rig in the `stance`
 * framing — berserker, overhead, swing 0.45 — the lead leg carries 48° of total
 * pitch, which swings a sole reaching `FOOT_FWD` forward a further
 * `FOOT_FWD·sin48° = 128 mm` down: the front boot finishes 197 mm under the turf
 * and the trailing one hangs 236 mm over it. Neither foot in that frame is on the
 * ground, and a critic panel read the result as a hero with one leg.
 *
 * The solve wants the sole's lowest *corner*, not a point, and the trailing foot
 * wants an ankle to roll onto. Both belong in `anim.ts`; what belongs here is the
 * number, so that when the last is next reshaped the poser moves with it instead
 * of carrying a stale copy — the fate `ELBOW_ALONG` and `KNEE_ALONG` used to be
 * logged for, and which the two exports below now close.
 *
 * Not scaled by build: the whole roster wears one last, which is a simplification
 * the file has always made and the wrong pass to unmake.
 */
export const FOOT_FWD = 0.172;
export const FOOT_BACK = 0.073;

/**
 * Where the elbow and the knee sit along their limb, as a fraction of the whole
 * shoulder-to-fist and hip-to-sole span.
 *
 * `anim.ts` solves the arm and the new two-segment leg reach against these and
 * had been carrying its own literals, which is a silent breakage the first time
 * the proportion table moves — and it moved twice in the last three passes.
 * Measured off the skeleton rather than written down, so they cannot drift.
 *
 * One sample is enough for the whole roster: every term either ratio touches is
 * a bare multiple of stature, so build and limb-length traits divide out.
 */
const CANON = skeleton(BUILD.huscarl);
export const ELBOW_ALONG = CANON.upperArm / (CANON.upperArm + CANON.foreArm + CANON.gripDrop);
export const KNEE_ALONG = (CANON.hipY - CANON.kneeY) / CANON.hipY;
/**
 * The drop from the wrist station to the grip, on the same scale — what
 * `anim.ts` needs to find the gap between the forearm's cap and the knuckles
 * and cut a wrist into it. Same argument as the two above: the number belongs
 * where the skeleton is authored, not copied into the poser.
 */
export const GRIP_ALONG = CANON.gripDrop / (CANON.upperArm + CANON.foreArm + CANON.gripDrop);

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

// The head's row count is a *sampling* decision, not a smoothness one, and
// getting that wrong is why two independent panels reported that this face has no
// nose, no eye socket, no lid and no brow when `faceSurface` has had all four in
// it for three passes.
//
// The field is a sum of gaussians written in the sampling latitude's sine. The
// ones that carry a face — the orbital margin, the columella undercut, the
// nostril, the alar crease, the oral fissure, the vermilion borders — are between
// 0.032 and 0.055 wide in that unit, because that is how wide they are on a head.
// At 24 rows the mesh puts a vertex every 0.124 of it near the face. So every one
// of those features was sampled two to four times *below* Nyquist: the mesh could
// not see them, and what came out was a smooth ball with two dark patches on it.
// The brow (0.105) and the socket (0.125) were the only terms wide enough to
// survive, which is exactly what the frame shows — some shading round the eyes and
// nothing else at all.
//
// 44 rows puts the spacing at 0.068 and brings everything except the tightest
// creases above the limit; those have been widened to meet it (see `faceSurface`).
// The cost is ~1000 vertices on **one** mesh per warrior — the head is a single
// merged geometry, it is shared by loadout and seed, and it is the only part of a
// warrior anybody looks at from a metre away. It is the cheapest fix in the file.
const LOD: Record<CharacterDetail, Lod> = {
  high: { body: 18, limb: 12, headU: 40, headV: 44, shellU: 14, shellV: 8, trim: true, fingers: true },
  medium: { body: 14, limb: 10, headU: 30, headV: 30, shellU: 10, shellV: 6, trim: true, fingers: true },
  // Low drops ornament and tessellation. It does not drop a layer, a hem or a
  // class silhouette — those are art direction, and the bar says art direction
  // survives the tier.
  low: { body: 10, limb: 7, headU: 14, headV: 10, shellU: 7, shellV: 4, trim: false, fingers: false },
};

// ============================================================
// The face
// ============================================================

/**
 * Where the features sit on the skull, in the surface field's own `y` — which is
 * the sine of the sampling latitude, +1 at the crown and −1 at the menton.
 *
 * These are written down because getting them wrong is what was actually wrong
 * with the face, and it was not obvious from any single number. Every feature
 * was in the top half of the head: the eyes at `y = +0.085`, which is 40% of the
 * way down from the crown where a human's are at 50%, the mouth at `y = −0.37`,
 * 61% down where a human's is at 73%. The brow-to-mouth block therefore occupied
 * the upper 46% of the face and the remaining 100 mm — over a third of the head —
 * was bare, unmodelled jaw. *That* is the "flat, pale, near-featureless vertical
 * panel" in `art/shots/v4/portrait.png`: not shallow relief, an empty plane. The
 * dark blob under it was the stubble patch laid over the empty plane.
 *
 * The fractions below are the classical canon, measured from the crown over the
 * head's full 269 mm: brow ridge 0.350, eye line 0.500, nose tip 0.552,
 * subnasale 0.600, lip line 0.720, gonion 0.755, chin front 0.875. They are
 * given in field-`y` rather than in fractions because the mapping is not linear —
 * `faceSurface` pulls the mandible down by up to `MANDIBLE` — so the conversion
 * is done once, here, by solving `py(y)` for each landmark.
 *
 * A correction to `docs/OPEN-DEFECTS.md`, because it cost half a day. That table
 * has the eye line at 60% of head height above the chin, the mouth at 39% and the
 * nose tip at 56%, and reads them as 35 mm of surplus lower face. Measured off
 * the mesh those numbers are *stale*: this build lands 50.0 / 28.0 / 44.8, which
 * is canon on the first and within a per-cent of it on the other two. The table
 * describes the layout before the rewrite these constants came out of, and its
 * "canon" column for the mouth and the nose looks to have been taken over the
 * *face* rather than over the head, which is why 22% and 33% do not agree with
 * any published set. The lower face is not long. The neck was — see `shoulderY`.
 *
 * They have all moved a little here anyway, because `headR.y` did.
 */
const Y_BROW = 0.219;
const Y_EYE = -0.116;
const Y_TIP = -0.231;
const Y_NOSE = -0.323;
const Y_LIP = -0.536;
const Y_CHIN = -0.796;
const Y_GONION = -0.596;

/**
 * How far the mandible is pulled below the braincase, in metres. Named because
 * the head's total height is `2 * headR.y + MANDIBLE` and three separate things
 * — the head-count, the landmark solve above, and the neck overlap — are all
 * derived from that sum.
 */
const MANDIBLE = 0.028;

/**
 * Field `y` to sampling latitude. Anything worn on the head is cut in radians of
 * latitude (`headWear`, the helm arcs, the hood rim, the beard's cheek line)
 * while the surface field is written in `y = sin(latitude)`, and mixing the two
 * up is how a helm ends up cut for a brow 30 mm from where the brow is. Every
 * garment edge below is therefore expressed as `lat(SOME_LANDMARK + offset)`.
 */
const lat = (y: number) => Math.asin(clamp01((y + 1) * 0.5) * 2 - 1);

/**
 * What makes this warrior's face his own. Every field is a multiplier on one term
 * of the surface field below, so a seed moves the *anatomy* rather than swapping
 * a preset: a heavy brow with a wide jaw is a different man from a narrow skull
 * with a long nose, and neither is a scaled copy of the other.
 *
 * Deliberately small in range. Past about ±12% on a skull axis the helm and hood
 * stop fitting, because they are swept off the same field — so the variation that
 * carries the read is in the *features*, where it is free.
 */
interface FaceTraits {
  wide: number; deep: number; tall: number;
  brow: number; deepSet: number;
  nose: number; bridge: number; nostril: number;
  cheek: number; gaunt: number;
  jaw: number; chin: number;
  eyeU: number; eyeV: number; eyeOpen: number;
  mouth: number; lip: number;
  /** Lateral drift on the midline features, in metres. A symmetric face is a mask. */
  asym: number;
  tone: number; iris: number;
}

/**
 * `seed` is a warrior identity. An integer is the intended form — consecutive
 * integers are what the stratified picks below rely on — but a `hash01`-style
 * fraction is accepted and folded up to one, because that is the number `anim.ts`
 * already has to hand and a crash on a float would be a nasty surprise later.
 */
function faceTraits(raw: number): FaceTraits {
  const seed = Number.isInteger(raw) ? Math.abs(raw) : Math.abs(Math.round(raw * 4096));
  return {
    wide: 1 + span(seed, 1, 0.055),
    deep: 1 + span(seed, 2, 0.05),
    tall: 1 + span(seed, 3, 0.05),
    brow: 1 + span(seed, 4, 0.55),
    deepSet: 1 + span(seed, 5, 0.35),
    nose: 1 + span(seed, 6, 0.4),
    bridge: 1 + span(seed, 7, 0.5),
    nostril: 1 + span(seed, 8, 0.35),
    cheek: 1 + span(seed, 9, 0.5),
    gaunt: 1 + span(seed, 10, 0.6),
    jaw: 1 + span(seed, 11, 0.45),
    chin: 1 + span(seed, 12, 0.5),
    eyeU: 1 + span(seed, 13, 0.09),
    eyeV: span(seed, 14, 0.035),
    eyeOpen: 1 + span(seed, 15, 0.2),
    mouth: 1 + span(seed, 16, 0.16),
    lip: 1 + span(seed, 17, 0.45),
    asym: span(seed, 18, 0.0022),
    tone: stratify(seed, 19, SKIN_TONES.length),
    iris: stratify(seed, 20, IRIS_COLORS.length),
  };
}

/**
 * A head, and the man wearing it. Bundled because everything on the skull —
 * skull, hair, beard, war paint, helm bowl, hood, eyes — has to be sampled off
 * the *same* field, and threading two arguments through every one of those calls
 * is how a helm ends up fitting a face it was not cut for.
 */
interface Skull { R: { x: number; y: number; z: number }; F: FaceTraits }

/**
 * Maps a unit direction onto a human skull, in metres, centred on the head's own
 * origin. Every feature is a gaussian pushing the ellipsoid in or out: brow
 * ridge, eye socket, nasal dorsum, zygomatic arch, buccal hollow, mental
 * protuberance, gonial angle. It is not a portrait, but it is a *surface* — the
 * brow throws a shadow into the socket and the cheekbone catches the fire, which
 * is the whole reason a face reads at all.
 *
 * Two things changed this pass and they are worth separating, because only one of
 * them is about depth.
 *
 * The first is the layout: every landmark now sits at the fraction of head height
 * a human's does (see `Y_BROW` and friends). It used to sit a quarter of a head
 * too high, which left a third of the face as an unmodelled plane — the flat panel
 * the owner was looking at. No amount of extra relief on the features fixes that,
 * because the panel is where the features *aren't*.
 *
 * The second is depth, and the numbers here are deliberately past life. Measured
 * against the arena's night rig — a key at 60° elevation, everything else either
 * omnidirectional or along the camera axis — a face at portrait distance is about
 * seventy pixels tall and shades almost entirely off surfaces that face up or
 * down. So the terms that earn their keep are the ones with a vertical edge: the
 * brow's overhang (20 mm over a 13 mm falloff — a 57° underside), the orbital
 * margin cut under it, the nose's tip and its columella undercut, the lip line,
 * the shelf under the lower lip, and the mandible edge. Anything whose gradient is
 * mostly in z is doing nothing in this rig no matter how deep it is, which is why
 * the flat 15 mm of dorsum the old field carried between the brows was invisible.
 *
 * Everything worn on the head is sampled through this same function, so hair
 * sits on the skull it belongs to and war paint lies on the cheek rather than
 * hovering in front of it.
 */
function faceSurface(K: Skull, d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const R = K.R;
  const F = K.F;
  const x = d.x;
  const y = d.y;
  const z = d.z;
  const ax = Math.abs(x);
  const sx = x < 0 ? -1 : 1;
  // The front of the face; everything below uses it as a mask so a cheekbone
  // does not also grow out of the back of the head.
  const front = clamp01(z * 1.15);
  // Drift, applied to the midline features only. A nose 2 mm off centre is
  // invisible as a fact and unmistakable as a face.
  const drift = F.asym * front;

  // Base ellipsoid, narrowed toward the chin and — barely — over the crown. The
  // dome term was 0.15, which took 28 mm off the width of the parietal: on a head
  // already narrow against these shoulders that is throwing away the widest part
  // of the skull. At 0.05 the vault stays broad and the *jaw* does the tapering,
  // which is the right way round.
  const low = clamp01((-y - 0.05) / 0.85);
  const high = clamp01((y - 0.42) / 0.58);
  const taper = 1 - 0.26 * low * low;
  const dome = 1 - 0.05 * high * high;

  let px = x * R.x * F.wide * taper * dome + drift;
  // The face hangs off the braincase. Everything below the cheekbone gets pulled
  // down into a mandible, which is what turns a sphere into a head.
  let py = y * R.y * F.tall - MANDIBLE * Math.pow(clamp01((-y - 0.22) / 0.78), 1.3);
  let pz = z * R.z * F.deep * (1 - 0.1 * low * low) * (1 - 0.09 * high * high);

  // ---- the facial block ----
  //
  // The one term that was missing, and it is why five panels called this a
  // painted decal on an egg. Measured off the built mesh, taking the brow as
  // zero, the sagittal profile ran: nose tip **+7.7 mm**, subnasale −27.7, lip
  // line −29.9, chin −42.1. A man's runs roughly +22, −5, −4, −4. So it was not
  // that the nose was too small — every landmark below the brow was retreating
  // with the ellipsoid, because a sphere's `cos(v)` has already given up 40% of
  // its depth by the time it reaches the chin. Twenty separate feature bumps
  // were being modelled onto a lower face that was falling away underneath all
  // of them, which is precisely the shape of an egg with a face drawn on it, and
  // it is also the "muzzle" read: with the chin 50 mm behind the nose, the nose
  // and moustache are the only things out in front and they read as a snout.
  //
  // A skull is a braincase with a *face block* hung on the front of it — maxilla
  // and mandible standing proud of the cranial sphere — so that is what this is:
  // one broad forward push that is nothing at the brow and full below the lip
  // line. It carries every landmark under it, which is why the feature terms
  // below did not have to change much. `front` and the lateral falloff keep it
  // off the ears and the back of the skull.
  // Two parts, because the face block is two bones. The maxillary half is done
  // by the lip line; the mandible goes on projecting below it, and without the
  // second term the chin still measured 27–42 mm behind the brow across every
  // seed — a receding jaw, which is the one facial fault a warrior cannot have.
  pz += 0.019 * front * bump(x, 0, 0, 1.00, 1, 1) * smooth(Y_BROW - 0.05, Y_LIP, y);
  // The mandibular half is narrow on purpose. Given the same width as the
  // maxilla it lands as a plate from gonion to gonion — a lantern jaw with a
  // hard horizontal crease under the mouth, which is what the first cut of this
  // rendered. A mandible carries its projection at the *symphysis* and gives it
  // up toward the angle, so this is a third the width and rides on a longer ramp.
  pz += 0.016 * front * bump(x, 0, 0, 0.40, 1, 1) * smooth(Y_LIP + 0.14, Y_CHIN - 0.02, y);

  // Parietal eminence: a skull is widest just above and behind the ear and rolls
  // over from there, rather than being a ball of one radius. Without it the only
  // vertical in the head's outline is the coif hanging beside it — which is the
  // "rounded box with hard vertical corner edges at the temples" the second panel
  // logged. Half of that read was the coif (its front rim has gone back and down;
  // see the helm build) and half was that there was no cranial curve for the eye
  // to follow instead. Faded out toward the midline, because `sx` flips there and
  // an unweighted push would leave a step down the crown.
  const vault = clamp01((y - 0.16) / 0.74);
  px += sx * 0.007 * (4 * vault * (1 - vault)) * smooth(0.06, 0.55, ax) * clamp01(1 - Math.abs(z) * 0.55);

  // Brow ridge and glabella. 20 mm of projection over a 13 mm vertical falloff,
  // so the underside of the ridge stands at about 57° to the skin below it — that
  // slope, and not the 20 mm, is what puts the socket in shadow under a key
  // hanging at 60°. The helm's brow band has come up off the ridge to leave it
  // doing that job (see the helm build); it used to sit straight on top of it.
  // The `py` term on the ridge is doing as much work as the `pz` one, for the
  // reason given at the nose: a push along z on a surface already facing z is a
  // gradient this light rig cannot see. Lifting the ridge's crest and *dropping*
  // the skin immediately below it is what turns 20 mm of projection into an
  // overhang with a lit top and a dark underside.
  const brow = bump(ax - 0.34, y - Y_BROW, 0, 0.30, 0.105, 1) * front;
  pz += 0.024 * F.brow * brow;
  py += 0.009 * F.brow * brow;
  pz += 0.009 * F.brow * bump(x, y - (Y_BROW - 0.02), 0, 0.12, 0.10, 1) * front;
  // Frontal eminences: the two low mounds either side of the midline that give a
  // forehead any form at all. There is a real forehead to put them on now — the
  // brow used to be 34 mm above centre with the hairline 15 mm above that.
  pz += 0.004 * bump(ax - 0.24, y - (Y_BROW + 0.20), 0, 0.22, 0.15, 1) * front;

  // Eye sockets, set under it. Deeper than life on purpose: the socket's whole
  // job is to hold shade under a helmet brim, and the sclera below has to sit in
  // something darker than itself or the eye reads as a bead glued to a cheek.
  const socket = bump(ax - 0.36, y - Y_EYE, 0, 0.19, 0.125, 1) * front;
  pz -= 0.018 * F.deepSet * socket;
  px -= sx * 0.005 * socket;
  py -= 0.004 * socket;
  // The orbital upper margin — the crease immediately under the ridge, and the
  // single line that makes the brow read as overhanging rather than as a band of
  // colour. Cut deeper and tighter this pass, and given a `py` component of its
  // own: at 6 mm of pure z it still resolved as tone rather than as an edge, and
  // an eye with no hard line over it is the almond patch both panels described.
  const margin = bump(ax - 0.36, y - (Y_EYE + 0.112), 0, 0.21, 0.055, 1) * front;
  pz -= 0.008 * margin;
  py -= 0.004 * margin;
  // Infraorbital ridge, closing the socket below and catching a little light.
  pz += 0.005 * bump(ax - 0.37, y - (Y_EYE - 0.145), 0, 0.22, 0.075, 1) * front;

  // ---- the nose ----
  //
  // "The nose is not modelled at all — the helm's nasal has been standing in for
  // it." That was the finding, and taken literally it was wrong: there were six
  // nose terms here. Taken as a description of the frame it was exactly right,
  // and the reason is worth writing down, because it is the same reason four
  // other features on this head were invisible.
  //
  // Every one of those terms was `pz += …` — displacement along the head's z.
  // At the nose the surface *already* faces +z, so pushing it further out moves
  // the skin along its own normal and produces a mound whose gradient is
  // entirely in z. The rig this face is lit by is ambient 0.85 + hemisphere 0.62
  // + a bounce directional straight down the camera axis, with one key at 60°:
  // a gradient in z changes N·L by almost nothing on any of them. So a 34 mm
  // nose returned the same value as the cheek beside it and the frame showed a
  // blank panel with a metal bar down the middle of it.
  //
  // What a nose is, for this rig, is three *horizontal* edges — the tip, the two
  // alar creases and the subnasale undercut — and one long up-facing plane
  // between them. So the dorsum now rises in **y** as well as z as it descends
  // to the tip, the tip overhangs, and the undersurface is cut hard back and up.
  // The projection is smaller than it was and reads several times as strongly.
  const run = smooth(Y_NOSE - 0.075, Y_NOSE + 0.035, y) * (1 - smooth(Y_BROW - 0.06, Y_BROW + 0.12, y));
  const ridge = bump(x - drift * 6, 0, 0, 0.105, 1, 1);
  const proj = mix(0.010, 0.030, smooth(Y_BROW, Y_TIP, y)) * F.nose;
  pz += proj * ridge * run * front;
  // The tip proper: a short, hard swell at Y_TIP that carries the nose's last
  // 8 mm forward *and lifts the skin above it*, so the dorsum runs downhill into
  // it and the underside falls away. This is the edge that catches the key.
  const tip = bump(x - drift * 5, y - Y_TIP, 0, 0.085, 0.068, 1) * front;
  pz += 0.009 * F.nose * tip;
  py += 0.004 * tip;
  // The bridge, carried up between the brows — this is what stops the nose
  // reading as a lump stuck onto a flat plane — and the nasion pinch above it,
  // which is the notch that separates nose from forehead.
  //
  // The pinch is nearly twice as deep as it was, and that is the second thing
  // wrong with this profile after the face block. At 5 mm the forehead and the
  // dorsum were one continuous plane — measured, the midline ran 129.9 at the
  // brow and 129.1 immediately under it, a dip of *0.8 mm* — so the nose was not
  // a separate mass at all, it was where the front of the head happened to stop.
  // The notch is what makes a viewer read two forms instead of one, and it costs
  // nothing because it lands in a crease.
  pz += 0.006 * F.bridge * bump(x, y - (Y_BROW - 0.06), 0, 0.085, 0.17, 1) * front;
  // 0.078 in y and not 0.055, for the reason the LOD table gives: the head
  // samples about 0.069 of field-`y` per row near the face, so a notch narrower
  // than that is below Nyquist and the mesh cannot see it. Measured across six
  // seeds the old pinch moved the midline by 0.0 mm — it was not shallow, it was
  // invisible.
  pz -= 0.009 * bump(x, y - (Y_BROW - 0.015), 0, 0.10, 0.078, 1) * front;
  // Nostril wings: two rounded masses either side of the tip, standing out in x
  // as much as in z so the nose has a *width* at its base and the alar crease
  // that separates wing from cheek has something to cut into.
  const wing = bump(ax - 0.135, y - (Y_NOSE + 0.045), 0, 0.075, 0.072, 1) * front;
  pz += 0.009 * F.nostril * wing;
  px += sx * 0.010 * F.nostril * wing;
  pz -= 0.006 * bump(ax - 0.155, y - (Y_NOSE + 0.105), 0, 0.055, 0.062, 1) * front;
  // Under the tip: the columella and the two nostril openings. The undercut is
  // the whole nose as far as this rig is concerned — it is the only part of it
  // that faces down, and therefore the only part that goes dark against a key
  // hanging at 60°. Deep, and tight in y so the edge above it stays sharp.
  pz -= 0.013 * bump(x - drift * 5, y - (Y_NOSE - 0.008), 0, 0.095, 0.052, 1) * front;
  py += 0.005 * bump(x - drift * 5, y - (Y_NOSE - 0.020), 0, 0.11, 0.058, 1) * front;
  pz -= 0.010 * bump(ax - 0.095, y - (Y_NOSE - 0.025), 0, 0.045, 0.046, 1) * front;

  // Cheekbone over a hollow — the pair is what stops a face reading as a balloon,
  // and the 13 mm lateral push is also 26 mm of the head's apparent width, put
  // where a viewer reads breadth from.
  const zygo = bump(ax - 0.55, y - (Y_EYE - 0.10), 0, 0.22, 0.17, 1) * front;
  px += sx * 0.016 * F.cheek * zygo;
  pz += 0.012 * F.cheek * zygo;
  // The zygomatic arch: the bar of bone that runs from the cheekbone back to the
  // ear at eye level. Not `front`-masked, because it is the one facial landmark
  // that lives on the *side* of the head — which is exactly why it is worth
  // having, since it is the only thing that gives the 3/4 bearing a horizontal
  // to read across the temple. Under it the buccal hollow already dips, so the
  // pair reads as bone over a hollow rather than as a bulge.
  px += sx * 0.007 * F.cheek * bump(ax - 0.76, y - (Y_EYE - 0.05), z - 0.30, 0.22, 0.11, 0.62);
  const hollow = bump(ax - 0.46, y - (Y_LIP + 0.03), 0, 0.20, 0.16, 1) * front;
  px -= sx * 0.008 * F.gaunt * hollow;
  pz -= 0.009 * F.gaunt * hollow;
  // Nasolabial fold: from beside the nostril down past the mouth corner.
  // Widened from 0.075 to 0.13 across. A narrow groove cut into the raised face
  // block below reads as the *outline of a muzzle* rather than as a fold of
  // skin: two hard verticals bounding the mouth, which is the read the panels
  // logged at the 3/4 bearing. A nasolabial fold is a soft diagonal.
  pz -= 0.004 * bump(ax - 0.30, y - (Y_LIP + 0.12), 0, 0.13, 0.19, 1) * front;

  // Mouth: a crease with a lip above and below it, and a shelf under the lower
  // lip so the chin is a separate mass rather than the bottom of the mouth.
  const mw = 0.28 * F.mouth;
  pz -= 0.008 * bump(x - drift * 4, y - Y_LIP, 0, mw, 0.055, 1) * front;
  pz += 0.006 * F.lip * bump(x - drift * 4, y - (Y_LIP + 0.058), 0, mw * 0.85, 0.060, 1) * front;
  pz += 0.007 * F.lip * bump(x - drift * 4, y - (Y_LIP - 0.068), 0, mw * 0.80, 0.065, 1) * front;
  pz -= 0.009 * bump(x, y - (Y_LIP - 0.150), 0, 0.20, 0.068, 1) * front;
  // Philtrum — three vertical millimetres that place the whole upper lip.
  pz -= 0.003 * bump(x - drift * 5, y - (Y_LIP + 0.14), 0, 0.035, 0.075, 1) * front;

  // Chin and jaw angle. The projection went from 16 mm to 26 mm, off the measured
  // sagittal profile rather than by eye: the midline used to run 90 mm of z at the
  // lip and 78 at the chin front — a face that recedes monotonically from the
  // mouth down, which is a weak chin and reads as one. On a man the chin comes
  // back out to within a few millimetres of the lip. The mentolabial sulcus above
  // it deepened to match, so the extra mass is a separate block and not a longer
  // jaw — this is the one place where adding depth also makes the lower face read
  // *shorter*, because it gives the eye a second landmark to divide it at.
  const chin = bump(x, y - Y_CHIN, 0, 0.27, 0.155, 1) * front;
  pz += 0.032 * F.chin * chin;
  py -= 0.004 * chin;
  // Mental tubercles: the two low mounds either side of the midline that make a
  // man's chin a *box* rather than the bottom of a curve. They are the last
  // horizontal landmark on the face and the only one below the mouth, so at the
  // seventy pixels a face gets they are worth more than their 4 mm.
  pz += 0.004 * F.chin * bump(ax - 0.13, y - (Y_CHIN + 0.03), 0, 0.11, 0.12, 1) * front;
  // Gonial angle and the ramus above it. Tightened in y from 0.22 to 0.15 and
  // pushed harder: a jaw needs a *corner* in the silhouette, and a 220 mm-tall
  // gaussian is a swell — it widened the whole side of the head and left the
  // outline the unbroken arc from temple to chin that reads as an egg. The ramus
  // term above it gives the corner something to be the bottom of.
  const gonion = bump(ax - 0.68, y - Y_GONION, z, 0.26, 0.17, 0.95);
  px += sx * 0.026 * F.jaw * gonion;
  px += sx * 0.011 * F.jaw * bump(ax - 0.70, y - (Y_GONION + 0.20), z + 0.25, 0.22, 0.20, 0.85);
  // Mandible edge: a crease above the jawline so the jaw casts its own shadow
  // onto the neck instead of melting into it. Deepened to 5 mm and run further
  // back toward the gonion — it is working with a real throat mass underneath
  // (see the head build), and the pair of them is the undercut.
  pz -= 0.005 * bump(ax - 0.46, y - (Y_CHIN + 0.10), 0, 0.40, 0.10, 1) * front;

  // Temple hollow and occipital bun. The temple is down from 5 mm to 2.5: on a
  // head this narrow it was cutting into the one place the eye measures breadth.
  px -= sx * 0.0025 * bump(ax - 0.85, y - (Y_BROW + 0.12), z - 0.3, 0.18, 0.20, 0.7);
  // The occiput comes in as the face block goes out, and that is deliberate
  // book-keeping rather than a taste call: the head measured 262 mm deep against
  // 265 tall before this pass, which is already a long skull, and 24 mm of new
  // face in front of it would have made a horse of it. Flatter behind, fuller in
  // front, same overall length — and the helm bowl follows, because it is swept
  // through this same field.
  pz -= 0.016 * bump(x, y - 0.02, z + 0.92, 1, 0.4, 0.32);

  return out.set(px, py, pz);
}

/** Outward normal of the head at a direction — close enough to hang kit on. */
function faceNormal(K: Skull, d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(d.x / K.R.x, d.y / K.R.y, d.z / K.R.z).normalize();
}

const _d = new THREE.Vector3();
const _n = new THREE.Vector3();

function dirOf(u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
  const cv = Math.cos(v);
  return out.set(Math.sin(u) * cv, Math.sin(v), Math.cos(u) * cv);
}

function headGeometry(K: Skull, nu: number, nv: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rings: number[] = [];
  const p = new THREE.Vector3();
  for (let j = 0; j <= nv; j++) {
    const v = -Math.PI / 2 + (j / nv) * Math.PI;
    rings.push(pos.length / 3);
    for (let i = 0; i <= nu; i++) {
      // Started at the nape rather than dead ahead. `dirOf(0, v)` is +z — the front
      // of the face — so the ring's duplicated seam vertex, where the UV wraps from
      // 1 back to 0, ran straight down the middle of the nose. The normals are
      // welded (see below) but a texture wrap is not weldable: the skin map steps
      // along that line. It does not read as a seam at the tile density and
      // complexions this ships with, so this is insurance rather than a fix — but
      // insurance on the centreline of a face is worth one addition, and the nape is
      // under the hair on every style but Shaved.
      const u = Math.PI + (i / nu) * Math.PI * 2;
      faceSurface(K, dirOf(u, v, _d), p);
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
  K: Skull,
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
    faceSurface(K, _d, out);
    faceNormal(K, _d, _n);
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
// Eyes and mouth
// ============================================================
//
// An empty helmet is the loudest defect a character can have, and a black bead
// in a socket does not fix it — what reads as a man looking at you is a *pale*
// sclera cut to an almond by two lids, with something darker in the middle of it
// and a hard shadow line along the upper margin. All four of those are geometry
// here, because a painted eye on a sphere loses its shape the moment the head
// turns and the whole point is that the gaze survives the turn.

/**
 * Radius of the eyeball, in metres. Human, and it does not scale with build.
 *
 * It is also a hard ceiling on `EyeFrame.wA`, and that is worth stating because
 * breaking it costs an afternoon. Every part of the eye is placed by solving
 * `z = √(r² − x² − y²)` on this sphere, so a palpebral half-width past the radius
 * makes the term negative, `globePatch` clamps it to nothing, and the sclera and
 * both lids collapse to a flat sliver at each canthus — which renders as a pale
 * grey wedge beside the eye. A man's palpebral fissure measures 28–30 mm *across
 * the skin*, but the aperture is an arc on a 24 mm ball: the chord can never be
 * wider than the ball. 24.4 mm across is at the large end of human, which buys the
 * widest aperture the solve will take.
 */
const GLOBE = 0.0122;

const UP_AXIS = new THREE.Vector3(0, 1, 0);

/** The orbit, resolved into a frame the eye's parts can all be built in. */
interface EyeFrame {
  /** Globe centre, in head space — buried in the skull, not sitting on it. */
  c: THREE.Vector3;
  /** Laterally outward, toward the temple. */
  lat: THREE.Vector3;
  up: THREE.Vector3;
  fwd: THREE.Vector3;
  /** Palpebral fissure: half-width, half-height at the centre, canthal tilt. */
  wA: number; hA: number; tilt: number;
  /** Where the lid dies into the socket, as an offset on the skull's own u/v. */
  uE: number; vE: number;
}

function eyeFrame(K: Skull, side: number): EyeFrame {
  const uE = side * 0.355 * K.F.eyeU;
  // On the head's mid-height, where a human's eyes are. It used to be 0.085 —
  // 40% of the way down from the crown instead of 50% — and the whole face was
  // dragged up with it. See `Y_EYE`.
  const vE = lat(Y_EYE) + K.F.eyeV;
  const dir = dirOf(uE, vE, new THREE.Vector3());
  const fwd = faceNormal(K, dir, new THREE.Vector3());
  // A frame built off world up rather than off the skull's poles, so the eye
  // stays level whichever way the socket normal happens to point.
  const base = new THREE.Vector3().crossVectors(UP_AXIS, fwd).normalize();
  const up = new THREE.Vector3().crossVectors(fwd, base).normalize();
  // The socket floor the displacement field already dug, with the globe set so
  // its cornea stands 11 mm proud of it. Measured, not guessed: that puts the
  // cornea 22 mm behind the brow ridge, which is a heavy-browed but human orbit —
  // deep enough that the brow's shadow crosses the eye, shallow enough that the
  // key still finds the iris. At 6.5 mm it was 27 mm behind and the socket read
  // as the void it was supposed to be replacing.
  const floor = faceSurface(K, dir, new THREE.Vector3());
  const c = floor.addScaledVector(fwd, 0.013 - GLOBE);
  // `lat` stays with the skull's +x rather than flipping to "outward", so
  // (lat, up, fwd) is right-handed on both sides of the face. That matters: every
  // patch below takes its winding from that cross product, and a mirrored frame
  // renders one eye inside out — which is invisible in a still and unmistakable
  // the moment the head turns. The canthal tilt carries the side instead. (It is
  // also nothing to do with the module's `lat()` landmark helper.)
  //
  // The palpebral fissure, and it was built too small to read: 19.6 × 9.6 mm on a
  // head 260 mm tall is a doll's eye. 21.6 × 11.2 is as far as it goes — see
  // `GLOBE` for why the width cannot simply be set to the 28 mm a tape measure
  // finds on a face. `hA` scales with `eyeOpen`, so a narrow-eyed warrior reads as
  // squinting rather than as small-eyed.
  return {
    c, lat: base, up, fwd,
    wA: 0.0108, hA: 0.0056 * K.F.eyeOpen, tilt: side * 0.0016,
    uE, vE,
  };
}

/**
 * A shell lying on the globe: sclera, iris, pupil. `extent` returns where in the
 * eye's tangent plane the sample sits and the sphere supplies the depth, so every
 * one of the three is curved with the eyeball rather than pasted flat across it.
 */
function globePatch(
  f: EyeFrame,
  radius: number,
  thick: number,
  nu: number,
  nv: number,
  extent: (t: number, s: number, out: THREE.Vector2) => void,
  wrapU?: boolean,
): THREE.BufferGeometry {
  const uv = new THREE.Vector2();
  const at = (t: number, s: number, r: number, out: THREE.Vector3) => {
    extent(t, s, uv);
    const zz = Math.sqrt(Math.max(1e-8, r * r - uv.x * uv.x - uv.y * uv.y));
    out.copy(f.c).addScaledVector(f.lat, uv.x).addScaledVector(f.up, uv.y).addScaledVector(f.fwd, zz);
  };
  return patch({
    nu, nv, wrapU,
    outer: (t, s, out) => at(t, s, radius, out),
    inner: (t, s, out) => at(t, s, radius - thick, out),
  });
}

/** Half-height of the fissure along its length — zero at both canthi. */
const fissure = (f: EyeFrame, tt: number) => f.hA * Math.pow(Math.max(0, 1 - tt * tt), 0.62);

/**
 * An eyelid, built as the bridge it actually is: it starts on the globe at the
 * lid margin and ends buried in the socket rim, with a fold of volume in between.
 * Modelling it as a bridge rather than as a cap is what stops the eye reading as
 * a marble dropped into a hole — and the `s0` band is the lash line, which at
 * this scale carries more of the read than the lid itself.
 */
function lidPatch(
  K: Skull, f: EyeFrame, upper: boolean,
  nu: number, nv: number, s0: number, s1: number, thick: number,
): THREE.BufferGeometry {
  const sign = upper ? 1 : -1;
  const rL = GLOBE + 0.0016;
  // How far into the socket the lid dies, in latitude. The lower one is shallower
  // than it was: at 0.115 its bridge was 13 mm of up-facing skin below the eye and,
  // with `skin` now carrying a tighter specular lobe, it took the key square on and
  // rendered as a pale crescent — an under-eye bag, which is the second-worst thing
  // you can give a warrior after a glowing sclera.
  const rimDv = upper ? 0.135 : -0.082;
  const m = new THREE.Vector3();
  const rim = new THREE.Vector3();
  const n = new THREE.Vector3();
  const d = new THREE.Vector3();

  const at = (t: number, s: number, off: number, out: THREE.Vector3) => {
    // The lower lid runs the other way along the slit. Its `s` climbs downward,
    // so without reversing `t` the surface's own cross product points into the
    // skull and the lid vanishes to backface culling.
    const tt = sign * (t * 2 - 1);
    const x = tt * f.wA;
    const y = f.tilt * tt + sign * fissure(f, tt);
    const zz = Math.sqrt(Math.max(1e-8, rL * rL - x * x - y * y));
    m.copy(f.c).addScaledVector(f.lat, x).addScaledVector(f.up, y).addScaledVector(f.fwd, zz);
    // Sunk a fraction of a millimetre into the skull, so the lid's own rim strip
    // is buried instead of standing off the cheek as a step.
    //
    // The rim arches with the fissure rather than running level. Held flat, the
    // lid's far boundary was a straight arc while its near one was an almond, so
    // the whole lid rendered as a hard-edged trapezoid stuck over the eye. Dying
    // back toward both canthi is what makes it a fold.
    const arch = 0.34 + 0.66 * Math.sqrt(Math.max(0, 1 - tt * tt));
    dirOf(f.uE + tt * 0.22, f.vE + rimDv * arch, d);
    faceSurface(K, d, rim);
    faceNormal(K, d, n);
    rim.addScaledVector(n, -0.0007);
    const e = mix(s0, s1, s);
    const w = e * e * (3 - 2 * e);
    out.lerpVectors(m, rim, w);
    out.addScaledVector(n, (upper ? 0.0024 : 0.0006) * Math.sin(Math.PI * w) + off);
  };
  return patch({
    nu, nv,
    outer: (t, s, out) => at(t, s, 0, out),
    inner: (t, s, out) => at(t, s, -thick, out),
  });
}

interface FaceMaterials {
  skin: THREE.Material;
  /** The form-shadow tone: socket, under the nose, under the lower lip. */
  shade: THREE.Material;
  /** Lips, ears, lid rims — and the bone that flushes. See `addFaceTones`. */
  warm: THREE.Material;
  sclera: THREE.Material;
  iris: THREE.Material;
  dark: THREE.Material;
  lash: THREE.Material;
}

/** Both eyes, their lids and their lashes, added into the head's part. */
function addEyes(p: Part, K: Skull, lod: Lod, place: THREE.Matrix4, M: FaceMaterials): void {
  const fine = lod.trim;
  for (const side of [-1, 1]) {
    const f = eyeFrame(K, side);

    // Sclera — the exposed almond only. Anything wider would be visible past
    // the lids as a ring of white, which is the one way to make a face look mad.
    p.add(globePatch(f, GLOBE, 0.0014, Math.max(4, lod.shellU - 4), 2, (t, s, out) => {
      const tt = t * 2 - 1;
      const hh = fissure(f, tt);
      out.set(tt * f.wA, f.tilt * tt + (s * 2 - 1) * hh);
    }), M.sclera, place.clone());

    // The upper lid's cast shadow, painted rather than traced.
    //
    // A lid standing 2 mm off a globe cannot throw a shadow a shadow map at this
    // cascade will resolve, and the shadow along the upper margin is the single
    // strongest cue that an eye is set into a head rather than stuck onto it. So
    // it is a band of the dark tone laid over the top third of the almond, sitting
    // 0.15 mm outboard of the sclera so it wins the depth test outright. Cheaper
    // than any shadow, and it survives the head turning, which a baked one would
    // not.
    p.add(globePatch(f, GLOBE + 0.00015, 0.0002, Math.max(4, lod.shellU - 4), 1, (t, s, out) => {
      const tt = t * 2 - 1;
      const hh = fissure(f, tt);
      out.set(tt * f.wA, f.tilt * tt + mix(0.68, 1.0, s) * hh);
    }), M.dark, place.clone());

    // Iris, then pupil, each a shallow disc lying on the globe. Low roughness on
    // the iris material is the catchlight: one specular dot off the key is worth
    // more than any amount of iris detail.
    // The angle runs backwards for the same winding reason the lower lid does.
    const rI = 0.0061;
    p.add(globePatch(f, GLOBE + 0.00035, 0.0003, fine ? 10 : 6, 2, (t, s, out) => {
      const a = -t * Math.PI * 2;
      out.set(Math.cos(a) * rI * s, Math.sin(a) * rI * s);
    }, true), fine ? M.iris : M.dark, place.clone());
    if (fine) {
      // Limbal ring: the dark rim a real iris has where it meets the sclera. Two
      // hundred triangles, and it is what stops the iris reading as a flat dot at
      // the distance the eye is actually seen from.
      p.add(globePatch(f, GLOBE + 0.0005, 0.0002, 10, 1, (t, s, out) => {
        const a = -t * Math.PI * 2;
        const r = mix(rI * 0.84, rI, s);
        out.set(Math.cos(a) * r, Math.sin(a) * r);
      }, true), M.dark, place.clone());
      const rP = 0.0024;
      p.add(globePatch(f, GLOBE + 0.0007, 0.0003, 8, 1, (t, s, out) => {
        const a = -t * Math.PI * 2;
        out.set(Math.cos(a) * rP * s, Math.sin(a) * rP * s);
      }, true), M.dark, place.clone());
    }

    // Lids. The upper one is the heavier fold and the one that throws the shadow,
    // and it wears the *shade* tone rather than the base.
    //
    // That is not decoration either. An upper lid is a nearly horizontal surface at
    // the bottom of an orbit: it is in the socket's own shadow, and it faces up, so
    // with `skin` at roughness 0.5 it caught the 60° key square on and rendered as
    // the brightest band on the whole face — a pale bar over the eye with the iris
    // sitting under it, which is what the eye read as before this line changed. On
    // the shade tone it is a lid.
    const nu = Math.max(5, lod.shellU - 3);
    p.add(lidPatch(K, f, true, nu, 2, 0.12, 1, 0.0013), M.shade, place.clone());
    p.add(lidPatch(K, f, false, nu, 2, 0.1, 1, 0.0011), M.skin, place.clone());
    if (fine) {
      // Lash line and lid margins: two narrow bands, the upper in hair and the
      // lower in the warm tone a wet lid rim actually is.
      p.add(lidPatch(K, f, true, nu, 1, 0, 0.13, 0.0009), M.lash, place.clone());
      p.add(lidPatch(K, f, false, nu, 1, 0, 0.11, 0.0008), M.warm, place.clone());
    }
  }
}

/**
 * Lips and the line between them — four bands that carry the lower half of the
 * face, sat on the lip line the sculpt actually has (`Y_LIP`) rather than on the
 * 32 mm-too-high one they used to share with it.
 *
 * The bands are shaped, not rectangular: a lip that ends in a square corner reads
 * as a strip of tape, which is what the first version of this was. The vermilion
 * border thins toward the corners and the fissure runs a shade past it.
 */
function addMouth(p: Part, K: Skull, lod: Lod, place: THREE.Matrix4, M: FaceMaterials): void {
  // 0.26, not 0.31, and the bands below are thinner to match. A mouth 55 mm wide
  // with 13 mm of vermilion on each lip is a woman in lipstick; a man's is about
  // 48 by 9, and at this scale the difference between those two is the difference
  // between a mouth and a stripe of paint.
  const w = 0.26 * K.F.mouth;
  const nu = Math.max(5, lod.shellU - 3);
  // `bow` is the profile of a lip across its own width: full at the middle, gone
  // at the corner. Applied to the band's half-height, so both edges taper.
  const bow = (u: number, hi: number, lo: number): number => {
    const t = 1 - Math.pow(clamp01(Math.abs(u) / w), 1.6);
    return mix(lo, hi, t);
  };
  const band = (
    mid: number, half: number, lift: number, thick: number, mat: THREE.Material, narrow = 1,
  ) => {
    p.add(headWear(K, {
      u0: -w * narrow, u1: w * narrow,
      v0: (u) => mid - bow(u, half, half * 0.12),
      v1: (u) => mid + bow(u, half, half * 0.12),
      nu, nv: 1, lift: () => lift, thick,
    }), mat, place.clone());
  };
  const fis = lat(Y_LIP);
  // Upper lip, lower lip, and the dark line of the oral fissure between them. The
  // lower lip is the fuller of the two and stands further proud, which is what
  // gives the shelf under it something to be a shelf of.
  band(lat(Y_LIP + 0.048), 0.042, 0.0016, 0.0013, M.warm, 0.94);
  band(lat(Y_LIP - 0.056), 0.048, 0.0020, 0.0015, M.warm);
  band(fis, 0.010, 0.0013, 0.0007, M.dark, 0.96);
  if (lod.trim) {
    // Mouth corners, and they were a defect rather than a detail. Each was a
    // literal rectangle in (u, v) — one quad, constant height, 7 mm by 6 mm, in
    // the darkest material on the head — so the mouth rendered as a black
    // letterbox with a square lobe on each end. Two of the three shapes making up
    // the mouth had hard corners and the eye reads hard corners on a face as
    // damage.
    //
    // A mouth corner is a wedge that closes to a point. This one pinches in both
    // v bounds as it runs outboard, so it ends where the lips end instead of
    // stopping dead.
    for (const s of [-1, 1]) {
      const u0 = w * 0.80;
      const taper = (u: number) => 1 - Math.pow(clamp01((Math.abs(u) - u0) / (w * 0.26)), 0.85);
      p.add(headWear(K, {
        u0: s * u0, u1: s * (u0 + w * 0.26),
        v0: (u) => fis - 0.019 * taper(u),
        v1: (u) => fis + 0.017 * taper(u),
        // The shade tone, not the dark one. A mouth corner is a fold of skin in
        // its own shadow; in near-black at 22% of the mouth's width past the lips
        // it reads as a barbed arrowhead on each end of a letterbox, which is
        // what the render showed. Kept inside the lips now, so the lips bound the
        // mouth and this only softens the ends of them.
        nu: 3, nv: 1, lift: () => 0.0008, thick: 0.0005,
      }), M.shade, place.clone());
    }
  }
}

/**
 * The tonal map of the face: six shaped patches lying half a millimetre off the
 * skin, in the shade and warm tones.
 *
 * This is the half of the fix that is not geometry, and the file needs it because
 * of what the arena's night rig is. Roughly 60% of the light landing on a
 * front-facing face there arrives either omnidirectionally (ambient 0.85,
 * hemisphere 0.62) or along the camera axis (`bounce`, 1.7, aimed at (0, −4, 9)),
 * and light along the view axis produces the same N·L on every surface facing the
 * viewer. A sculpt cannot beat that on its own: the head was one flat `skin`
 * material and it rendered as one flat value however deep the relief under it went.
 *
 * There were nine of these on the first attempt and they were a mistake. A flat
 * patch of a different tone on an open cheek does not read as shadow, it reads as
 * *pigment* — a bruise or a smear of dirt — because nothing about its shape agrees
 * with the light. A warm patch on the brow ridge went the same way for the same
 * reason: two salmon blobs on the forehead. What is left is the patches whose whole
 * boundary lands inside a crease the field already cuts — the orbital margin, the
 * infraorbital ridge, the subnasale undercut, the mentolabial sulcus, the crest of
 * the zygomatic arch — because a hard albedo edge that falls in a shadow line is
 * invisible, and the tone either side of it then reads as depth. That constraint is
 * what decides the numbers below, and it is why there is nothing on the temple,
 * nothing on the buccal hollow, nothing on the brow and nothing on the broad plane
 * of the cheek: those are open surfaces, and the form there has to come from the
 * geometry and the specular fall-off instead — see `skin`'s roughness.
 *
 * Both tones are ones the head already wears, so the whole tonal map is free: six
 * patches, no new material, no new draw call.
 */
function addFaceTones(p: Part, K: Skull, lod: Lod, place: THREE.Matrix4, M: FaceMaterials): void {
  const nu = Math.max(4, lod.shellU - 5);
  const tone = (
    mat: THREE.Material,
    u0: number, u1: number,
    v0: (u: number) => number, v1: (u: number) => number,
    nv = 2,
  ) => {
    p.add(headWear(K, {
      u0, u1, v0, v1, nu, nv,
      // 0.5 mm proud and 0.25 mm thick, and the thickness is the number that
      // matters. `patch` closes every boundary with a rim strip whose normal points
      // *along* the skin rather than out of it, so a patch 0.6 mm thick draws its
      // own outline in a surface that faces the key far more squarely than the
      // cheek does — a hard bright line round the whole shape. That outline, not
      // the tone inside it, is what read as a white sliver under the eye on the
      // darker complexions. At a quarter of a millimetre the rim is under a pixel
      // at any distance a player sees a face from.
      lift: () => 0.0005, thick: 0.00025,
    }), mat, place.clone());
  };
  // A lens between two latitudes, pinched to nothing at both ends of its arc, so
  // the patch is an almond rather than a rectangle and its ends disappear.
  const lens = (
    mat: THREE.Material, uc: number, uw: number, yc: number, yh: number, nv = 2,
  ) => tone(
    mat, uc - uw, uc + uw,
    (u) => lat(yc - yh * (1 - Math.pow(clamp01(Math.abs(u - uc) / uw), 1.7))),
    (u) => lat(yc + yh * (1 - Math.pow(clamp01(Math.abs(u - uc) / uw), 1.7))),
    nv,
  );

  for (const s of [-1, 1]) {
    // The orbit in shadow, bounded above by the orbital margin crease and below by
    // the infraorbital ridge. This is the most valuable of the six: a socket
    // darker than the brow above it is most of what "a face" means at seventy
    // pixels tall, and both its edges are in cut creases.
    // Pulled in from 0.125 to 0.108 of half-height. At 0.125 its lower boundary
    // ran past the infraorbital ridge onto the open plane of the cheek, where an
    // albedo edge has nothing to hide in — so it drew a hard dark almond under
    // each eye that reads as a black eye rather than as a socket.
    lens(M.shade, s * 0.36, 0.28, Y_EYE - 0.016, 0.108, 3);
  }
  // The zygomatic band is gone, and this is the third and last time a tone has
  // been tried on the open plane of the cheek. It was a narrow warm lens from the
  // outer canthus back toward the ear, on the argument that its boundary sat in
  // the crest the field cuts there. It does not: the crest is a *ridge*, not a
  // crease, so the patch's edge lands on a surface that faces the key rather than
  // away from it, and in `art/shots/v6/portrait.png` both cheeks carry a pink
  // diagonal streak that reads as blusher on one complexion and as a healing cut
  // on another. The rule the rest of this function is built on — an albedo edge
  // is only invisible inside a shadow line — has no exception for narrow patches.
  // The cheekbone's highlight is the form's: 13 mm out and 10 mm forward over a
  // hollow is enough, and it costs nothing to be wrong about.
  // Under the nose: the shadow the tip and the columella cast on the lip. Bounded
  // above by the undercut the field cuts at subnasale.
  lens(M.shade, 0, 0.145, Y_NOSE - 0.026, 0.028, 1);
  if (lod.trim) {
    // The shelf under the lower lip, in the sulcus the field already cuts there.
    // Wide and shallow: at 0.20 by 0.038 it was an oval and read as a second chin.
    lens(M.shade, 0, 0.27, Y_LIP - 0.15, 0.024, 1);
  }
}

// ============================================================
// Hands
// ============================================================

/**
 * Reflects a geometry through its own XY plane, winding and normals included. A
 * left hand is the *mirror* of a right hand, not a copy of it rotated round the
 * grip — and a mirror is a negative-determinant transform, which a matrix on the
 * mesh cannot express without turning the surface inside out. So the reflection
 * happens here, on the vertices, once per fist, before anything is merged.
 */
function mirrorZ(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const nrm = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, -pos.getZ(i));
  pos.needsUpdate = true;
  if (nrm) {
    for (let i = 0; i < nrm.count; i++) nrm.setZ(i, -nrm.getZ(i));
    nrm.needsUpdate = true;
  }
  const idx = geo.getIndex();
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
    idx.needsUpdate = true;
  }
  return geo;
}

/** One knuckle-to-tip run of a digit: where it goes, and how thick it is there. */
interface Knuckle { x: number; y: number; z: number; a: number; b: number }

/**
 * A tapered tube swept along a path, with the cross-section carried on a frame
 * built off the grip axis. Every finger and every thumb segment is one of these:
 * the path is the arc the digit takes around the shaft and the `a`/`b` pair is
 * where it swells at a joint and pinches at a crease. Beads on a string were the
 * old approach and they read as a caterpillar; a swept tube with two visible
 * creases reads as a finger, and costs the same triangles.
 */
function digit(path: Knuckle[], ring: number): THREE.BufferGeometry {
  const n = path.length;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const rings: number[] = [];
  const X = new THREE.Vector3(1, 0, 0);
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    const k = path[i];
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(n - 1, i + 1)];
    T.set(next.x - prev.x, next.y - prev.y, next.z - prev.z).normalize();
    N.crossVectors(X, T);
    if (N.lengthSq() < 1e-8) N.set(0, 0, 1);
    N.normalize();
    B.crossVectors(T, N).normalize();
    rings.push(pos.length / 3);
    for (let j = 0; j <= ring; j++) {
      // Negative: with B = T × N, winding the section from +B toward +N puts
      // ∂ring × ∂row along -B and the whole tube renders inside out. Backface
      // culling then eats every finger and the hand is a mitten again, which is
      // exactly the bug this function exists to fix.
      const th = -(j / ring) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      pos.push(
        k.x + B.x * k.a * c + N.x * k.b * s,
        k.y + B.y * k.a * c + N.y * k.b * s,
        k.z + B.z * k.a * c + N.z * k.b * s,
      );
      uv.push(j / ring, i / (n - 1));
    }
  }
  const stride = ring + 1;
  for (let i = 0; i < n - 1; i++) {
    const t = i * stride;
    const b = t + stride;
    for (let j = 0; j < ring; j++) {
      idx.push(t + j, b + j + 1, b + j, t + j, t + j + 1, b + j + 1);
    }
  }
  // Caps: the fingertip is the one the camera actually gets to see.
  const cap = (base: number, k: Knuckle, flip: boolean) => {
    const c = pos.length / 3;
    pos.push(k.x, k.y, k.z);
    uv.push(0.5, 0.5);
    for (let j = 0; j < ring; j++) {
      if (flip) idx.push(c, base + j + 1, base + j);
      else idx.push(c, base + j, base + j + 1);
    }
  };
  cap(0, path[0], true);
  cap((n - 1) * stride, path[n - 1], false);

  const g = finish(pos, uv, idx);
  weldRingNormals(g, rings, ring);
  return g;
}

/**
 * How far round a shaft each finger reaches, as arc length in the hand's own
 * scale — index, middle, ring, little.
 *
 * Lengths rather than angles, because a finger does not change length when the
 * weapon does. The same 96 mm of middle finger covers 3.5 radians of an axe haft
 * and 3.9 of a seax grip, and *that* is the reason a grip has to be measured
 * instead of posed: these were four fixed end angles, tuned once against a
 * nominal 19 mm shaft, and every weapon that is not 19 mm got a hand that either
 * hung open on it or closed inside it. The spread between the four is what gives
 * the fist a diagonal tip line instead of a row of dominoes.
 */
const FIST_ARC = [0.0892, 0.0963, 0.0930, 0.0846];
/**
 * The same fingers with nothing to close on. Shorter, because a closing finger's
 * first 25 mm is buried in the palm mass and an open one's is not — carrying the
 * grip lengths over gives a hand with spider fingers.
 */
const OPEN_ARC = [0.0760, 0.0820, 0.0790, 0.0700];

/**
 * One finger, integrated as an arc across the shaft: it starts on the wrap
 * circle at the knuckle, sets off tangentially, and bends at 1/`curl`.
 *
 * `wrap` and `curl` are separate because they answer different questions.
 * `wrap` is *where the hand sits* — the shaft's surface plus a finger's own
 * half-depth, so the inside of the finger lands on the leather rather than
 * through it. `curl` is *how hard the finger closes*. On a grip they are the
 * same number, which is what makes a hand close on something whatever its
 * diameter; on an empty hand `curl` is four times larger and the fingers hang
 * relaxed instead of clenching on nothing.
 */
function fingerPath(
  fx: number, wrap: number, curl: number, phi0: number, arc: number,
  nodes: number, a0: number, b0: number, swell: number[],
): Knuckle[] {
  const path: Knuckle[] = [];
  let y = -wrap * Math.sin(phi0);
  let z = wrap * Math.cos(phi0);
  let ty = -Math.cos(phi0);
  let tz = -Math.sin(phi0);
  const ds = arc / (nodes - 1);
  for (let i = 0; i < nodes; i++) {
    const k = i / (nodes - 1);
    const w = swell[Math.min(swell.length - 1, Math.round(k * (swell.length - 1)))];
    path.push({ x: fx, y, z, a: a0 * w * (1 - 0.2 * k), b: b0 * w * (1 - 0.22 * k) });
    if (i === nodes - 1) break;
    // Tighter toward the tip: the distal joints of a closing hand flex further
    // than the knuckle does, and one constant curvature reads as a hoop.
    const r = curl * (1 - 0.10 * k);
    const c = Math.cos(ds / r);
    const sn = Math.sin(ds / r);
    // Centre of curvature is one radius along the inward normal (-tz, ty); the
    // point rotates about it and the tangent turns with it.
    const cy = y - r * tz;
    const cz = z + r * ty;
    const ry = y - cy;
    const rz = z - cz;
    y = cy + ry * c - rz * sn;
    z = cz + ry * sn + rz * c;
    const nty = ty * c - tz * sn;
    tz = ty * sn + tz * c;
    ty = nty;
  }
  return path;
}

/**
 * A hand on a shaft, built in a canonical frame: the shaft runs along +X through
 * the origin, the palm presses on the +Z face of it, the four fingers are stacked
 * along the shaft and wrap under it, and the thumb lies across them. +Z is the
 * *medial* side once `fistPlacement` has turned it — a right hand grips with its
 * palm toward the body's midline — so a left hand is this geometry mirrored in Z.
 *
 * `grip` is the radius of what is being held, in metres, and it is not optional.
 * This roster carries a seax at 13 mm, a sword grip at 16, a shield bar at 17, an
 * axe haft at 21 and a spear shaft at 24 — and one hard-coded curl cannot be
 * right for more than one of them. Measured on the built mesh before this change:
 * the berserker's finger surfaces sat **11 mm inside** the axe's bound grip on the
 * axis the camera sees, so the only part of the hand outside the wood was the
 * back of it. That is a hand that cannot be seen to hold anything, whatever the
 * fingers are made of.
 *
 * `grip: null` is an empty hand, and it is a different pose rather than the same
 * one relaxed: the fingers curl at about four times the radius from a knuckle
 * line that is barely flexed, the palm ends at the knuckles instead of running on
 * to the heel and making a mitten, and the thumb stays out on the radial side
 * rather than closing over a shaft that is not there.
 *
 * Returned in two pieces because flesh is not one colour: the tips and the
 * thumb pad get the warm tone, which is where a real hand is reddest and, not
 * coincidentally, the part nearest the camera in every over-shoulder frame.
 */
function fistGeometry(
  lod: Lod,
  scale: number,
  opts: { reach: number; lead: number; mirror: boolean; grip: number | null },
): { skin: THREE.BufferGeometry; warm: THREE.BufferGeometry | null } {
  const s = scale;
  const body: THREE.BufferGeometry[] = [];
  const tips: THREE.BufferGeometry[] = [];
  const ring = lod.fingers ? 7 : 5;
  const nodes = lod.fingers ? 7 : 4;
  const held = opts.grip;
  const open = held === null;
  // A finger's own half-depth. The wrap radius is the shaft plus that, so the
  // inner surface of every finger lands on the leather exactly.
  const pad = 0.0086 * s;
  const wrap = held === null ? 0.0272 * s : held + pad;
  // 0.090 is about 55° of total flexion over a finger's length, which is what an
  // unloaded hand rests at. Flat is not the alternative to clenched — a hand with
  // straight fingers reads as a salute, and a hand with its fingers on one radius
  // reads as a claw. Both are as wrong as the fist was.
  const curl = open ? 0.090 * s : wrap;
  // Where on the wrap circle the knuckle line sits. Nearly on the palm axis for
  // an open hand, well round it for a grip.
  const phi0 = open ? 0.16 : 0.44;
  // The palm rides the shaft, so a fatter one carries the whole hand outboard of
  // the axis. One to five millimetres across this roster — small, but it is the
  // difference between a palm resting on wood and a palm inside it.
  const lift = wrap - 0.0272 * s;

  // Metacarpal wedge — wrist down to the knuckles, biased onto the palm side. On
  // a grip it runs on to the heel and deliberately passes through the shaft: an
  // opaque hand round an opaque grip reads as pressure, and a hand held clear of
  // it reads as a floating glove. Open, it stops at the knuckle line, because the
  // fingers below it are the shape and a wedge that ran past them is the mitten.
  // The short palm is for the tier that has fingers to put below it. On low there
  // is one swept collar standing in for four digits, and a palm that stopped at
  // the knuckles under it left a paddle rather than a hand.
  body.push(shell(open && lod.fingers ? [
    { y: opts.reach, hw: 0.027 * s, hd: 0.019 * s, z: opts.lead },
    { y: 0.048 * s, hw: 0.036 * s, hd: 0.021 * s, z: 0.014 * s },
    { y: 0.010 * s, hw: 0.044 * s, hd: 0.019 * s, z: 0.027 * s },
    { y: -0.014 * s, hw: 0.042 * s, hd: 0.014 * s, z: 0.029 * s },
  ] : [
    { y: opts.reach, hw: 0.027 * s, hd: 0.019 * s, z: opts.lead },
    { y: 0.048 * s, hw: 0.036 * s, hd: 0.021 * s, z: 0.014 * s + lift },
    { y: 0.014 * s, hw: 0.044 * s, hd: 0.02 * s, z: 0.03 * s + lift },
    { y: -0.022 * s, hw: 0.045 * s, hd: 0.019 * s, z: 0.032 * s + lift },
    { y: -0.05 * s, hw: 0.037 * s, hd: 0.015 * s, z: 0.028 * s + lift },
  ], ring + 2, { power: 2.5, capTop: true, capBottom: true }));

  if (lod.fingers) {
    // Joint / shaft alternation down the length. The dips are the creases.
    const swell = [1.04, 0.9, 1.0, 0.87, 0.96, 0.84, 0.62];
    const arcs = open ? OPEN_ARC : FIST_ARC;
    for (let f = 0; f < 4; f++) {
      const fx = (-0.0325 + f * 0.0217) * s;
      // Capped at four radians of sweep. A finger closing on something thin
      // enough would otherwise spiral past the palm and come out of the wrist.
      const arc = Math.min(arcs[f] * s, curl * 4.0);
      const path = fingerPath(
        fx, wrap * (1 - f * 0.02), curl, phi0, arc, nodes,
        0.0093 * s * (1 - f * 0.055), pad * (1 - f * 0.05), swell,
      );
      // The distal third in the warm tone: two path nodes, one extra small mesh
      // per finger, and the single cheapest thing that stops a hand reading grey.
      const cut = nodes - 3;
      body.push(digit(path.slice(0, cut + 1), ring));
      tips.push(digit(path.slice(cut), ring));
    }

    // Thumb: metacarpal off the radial edge of the palm, then a phalanx laid
    // across the fingers. Separated from the fist and pointing the other way —
    // the opposition is the whole read, and a mitten has none of it.
    //
    // On a grip it is authored in (x, angle round the shaft, standoff from the
    // wrap circle) rather than in raw coordinates, so the pad tracks the shaft:
    // a thumb left at fixed coordinates while the fingers move out to a thicker
    // haft ends up buried in them, and one that scaled with the shaft would
    // swell. The standoff is a finger's thickness, which is what the thumb is
    // actually lying on.
    const THUMB: Array<[number, number, number, number, number]> = [
      [-0.046, -0.588, -0.0056, 0.0125, 0.0125],
      [-0.038, 0.142, 0.0011, 0.0118, 0.0115],
      [-0.024, 0.574, 0.0133, 0.0107, 0.0104],
      [-0.006, 0.769, 0.0174, 0.0098, 0.0094],
      [0.014, 0.914, 0.0170, 0.0074, 0.0072],
    ];
    // Open, the thumb is abducted and roughly parallel to the index rather than
    // crossed over it, and it is authored directly: with no shaft there is no
    // circle for a polar form to be about.
    const OPEN_THUMB: Array<[number, number, number, number, number]> = [
      [-0.046, 0.012, 0.018, 0.0125, 0.0125],
      [-0.056, -0.008, 0.024, 0.0118, 0.0115],
      [-0.062, -0.030, 0.026, 0.0107, 0.0104],
      [-0.060, -0.050, 0.023, 0.0098, 0.0094],
      [-0.054, -0.066, 0.017, 0.0074, 0.0072],
    ];
    const thumb: Knuckle[] = (open ? OPEN_THUMB : THUMB).map(([x, u, v, a, b]) => {
      const r = open ? 0 : wrap + v * s;
      return {
        x: x * s,
        y: open ? u * s : -r * Math.sin(u),
        z: open ? v * s : r * Math.cos(u),
        a: a * s, b: b * s,
      };
    });
    body.push(digit(thumb.slice(0, 3), ring));
    tips.push(digit(thumb.slice(2), ring));
  } else {
    // Low tier: the wrap is one swept collar and the thumb is one taper. The
    // silhouette still closes on the grip and still has an opposed thumb —
    // what goes is the crease detail, not the anatomy.
    const span = Math.min((open ? 0.058 : 0.093) * s, curl * 4.0);
    body.push(digit(fingerPath(0, wrap, curl, phi0, span, 5, 0.042 * s, 0.0095 * s, [1]), ring));
    body.push(digit(open ? [
      { x: -0.048 * s, y: 0.006 * s, z: 0.020 * s, a: 0.012 * s, b: 0.012 * s },
      { x: -0.058 * s, y: -0.030 * s, z: 0.024 * s, a: 0.0102 * s, b: 0.01 * s },
      { x: -0.054 * s, y: -0.062 * s, z: 0.018 * s, a: 0.008 * s, b: 0.0078 * s },
    ] : [
      { x: -0.042 * s, y: 0.008 * s, z: 0.02 * s + lift, a: 0.012 * s, b: 0.012 * s },
      { x: -0.014 * s, y: -0.026 * s, z: 0.032 * s + lift, a: 0.0102 * s, b: 0.01 * s },
      { x: 0.01 * s, y: -0.034 * s, z: 0.026 * s + lift, a: 0.008 * s, b: 0.0078 * s },
    ], ring));
  }

  const join = (list: THREE.BufferGeometry[]): THREE.BufferGeometry | null => {
    if (list.length === 0) return null;
    if (list.length === 1) return opts.mirror ? mirrorZ(list[0]) : list[0];
    const merged = mergeGeometries(list, false);
    if (!merged) return opts.mirror ? mirrorZ(list[0]) : list[0];
    for (const g of list) g.dispose();
    return opts.mirror ? mirrorZ(merged) : merged;
  };
  const skin = join(body);
  return { skin: skin ?? new THREE.BufferGeometry(), warm: join(tips) };
}

/**
 * Rotates the canonical fist onto the grip axis the hand mount uses. The basis is
 * the same for both hands on purpose — `e2` is "up the forearm" and `e3` is
 * "toward the midline", and neither of those flips with the side. The left hand
 * differs by being mirrored geometry, which is what a left hand actually is; the
 * old basis flipped `e3` instead, and a flipped basis is a 180° roll about the
 * grip, which stood the left hand on its knuckles with its wrist pointing down.
 */
function fistPlacement(gripPitch: number, x: number, y: number, z: number): THREE.Matrix4 {
  const e1 = new THREE.Vector3(0, Math.cos(gripPitch), Math.sin(gripPitch));
  const e2 = new THREE.Vector3(0, Math.sin(gripPitch), -Math.cos(gripPitch));
  const e3 = new THREE.Vector3().crossVectors(e1, e2).normalize();
  const m = new THREE.Matrix4().makeBasis(e1, e2, e3);
  m.setPosition(x, y, z);
  return m;
}

// ============================================================
// Weapons
// ============================================================

/**
 * The pitch the hand mounts sit at; weapons are built along +Y and tipped here.
 *
 * Exported because `anim.ts` now *solves* the wrist so the blade points where the
 * swing table asks, and that solve has to subtract this. It reads the mount at
 * runtime where it can; this is the value behind the fallback, shared rather than
 * copied.
 */
export const GRIP_PITCH = 1.28;

/**
 * A lenticular blade with an edge that survives a pixel.
 *
 * The section is still a rhombus — that is what a pattern-welded blade grinds
 * to — but it is sampled half a step round so the edge lands *between* two
 * vertices rather than on one. That leaves a land about a quarter of the
 * section's thickness wide: on a sword's mid-blade, half a millimetre of
 * geometry where there used to be a mathematical point. `grow` puts back the
 * width the phase shift takes off, so the blade is exactly as wide as its
 * stations say. See `ShellOptions.phase` for what this is fixing.
 */
function bladeSection(stations: Station[], seg = 8): THREE.BufferGeometry {
  const grow = 1 / Math.pow(Math.cos(Math.PI / seg), 2);
  return shell(
    stations.map((st) => ({ ...st, hw: st.hw * grow })),
    seg,
    { power: 1, phase: 0.5, capTop: true, capBottom: true },
  );
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
  // Fuller — a dark line down the centre of both faces, and it has to be a
  // *swept* one. As a box it was 8.6 mm deep on a blade that is 5.4 mm thick at
  // the forte and 4.2 at the foible, so the groove stood up to 1.6 mm proud of
  // the steel either side of it: seen from the edge the sword's silhouette was
  // the fuller and not the blade. Following the blade's own `hd` keeps it inside
  // a tenth of a millimetre of the surface, which is under a pixel at any range
  // and cannot break the section.
  part.add(shell([
    { y: 0.885, hw: 0.0062, hd: 0.0027 },
    { y: 0.55, hw: 0.008, hd: 0.0036 },
    { y: 0.19, hw: 0.0085, hd: 0.0043 },
  ], 6, { power: 2.6, capTop: true, capBottom: true }), dark);
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

/**
 * An axe blade: a crescent whose section is a real wedge rather than a plate.
 *
 * `lensPrism` cannot build this and that is why the axe read as a stick. It
 * scales the whole outline about its centroid to get the two faces, so the inset
 * a cutting edge needs — a few tenths of a millimetre — is the same inset the
 * socket end gets, where the metal is forty millimetres thick. Every axe head cut
 * that way is uniformly thin, every concavity in the outline is rounded away by
 * the scale, and what comes out is a pillow. Held anywhere but square to the lens
 * a pillow is a stick.
 *
 * So the head is parameterised the way a smith thinks about it instead: `t` runs
 * along the cutting edge from the top horn round to the beard, `s` runs from the
 * edge back to the eye, and the half-thickness is a function of **distance from
 * the edge**. That gives, in one surface and for free:
 *
 *   - a *land* at the edge rather than a mathematical point (`SECTION[0]`), for
 *     the same reason `bladeSection` carries `phase: 0.5` — a zero-width edge
 *     alternates between covering and missing pixel centres and crawls;
 *   - a **bevel break** at `s = 0.12`, ~19 mm back, at 21° included. That normal
 *     discontinuity is the line of light that runs the whole crescent and it is
 *     the single feature that says "axe" at fifty metres;
 *   - a blade that swells out of the eye and thins to the edge, so the head has a
 *     lit top plane and a dark underside from every bearing, not just square on;
 *   - horns and beard that are thin where they are thin on a real head, because
 *     `horn` tapers the section toward both ends of the arc — but only near the
 *     edge, so the metal is still full thickness where it meets the socket.
 *
 * Both polylines must be the same length; `t` is their shared index.
 */
function axeBlade(
  edge: Array<[number, number]>,
  root: Array<[number, number]>,
  eyeHalf: number,
): THREE.BufferGeometry {
  // Distance from the edge, and the half-thickness there as a fraction of the
  // eye. Front-loaded: an axe is a long thin wedge for most of its width and
  // then nearly doubles in the last fifth, which is the mass behind the eye.
  //
  // The **repeated stations are the point of this table**. `finish` averages
  // vertex normals over whatever shares an index, so a section written as six
  // rising stations shades as one smooth pillow and the ground bevel — the whole
  // reason a blade catches a line of light down its length — averages away
  // before it reaches a pixel. A duplicated station puts two coincident rows in
  // the grid with different indices; the quad between them has no area and so
  // contributes no normal, and the faces above and below it end up with normals
  // of their own. That is a hard crease for the cost of one row of vertices, and
  // there are two of them: one at the land, one at the bevel shoulder 21 mm back.
  const SECTION: Array<[number, number]> = [
    [0, 0.030], [0, 0.030], [0.12, 0.17], [0.12, 0.17], [0.34, 0.27], [0.62, 0.40], [1, 1],
  ];
  const n = edge.length - 1;
  const rows = SECTION.length - 1;
  const at = (t: number, s: number, sign: number, out: THREE.Vector3) => {
    const ti = Math.min(n - 1, Math.floor(t * n));
    const tf = t * n - ti;
    const si = Math.min(rows - 1, Math.floor(s * rows));
    const sf = s * rows - si;
    const ex = mix(edge[ti][0], edge[ti + 1][0], tf);
    const ey = mix(edge[ti][1], edge[ti + 1][1], tf);
    const rx = mix(root[ti][0], root[ti + 1][0], tf);
    const ry = mix(root[ti][1], root[ti + 1][1], tf);
    const sv = mix(SECTION[si][0], SECTION[si + 1][0], sf);
    const k = mix(SECTION[si][1], SECTION[si + 1][1], sf);
    // Thin toward both ends of the arc — a horn and a beard tip are sheet metal
    // — but only out at the edge. `sv` carries the taper back to nothing at the
    // eye, where the head has to be one solid mass whatever `t` says.
    const horn = mix(0.40 + 0.60 * Math.sqrt(Math.sin(Math.PI * t)), 1, Math.pow(sv, 1.4));
    out.set(mix(ex, rx, sv), mix(ey, ry, sv), sign * eyeHalf * k * horn);
  };
  // One column per authored point and one row per section station: the
  // interpolation between them is linear, so any extra grid line would only add
  // collinear vertices. Curvature is bought by authoring points, not by nu.
  // `u` runs backwards so ∂u × ∂v comes out along +z and the outer grid faces
  // out; taken forwards the whole head renders inside out and disappears.
  return patch({
    nu: n, nv: rows,
    outer: (u, v, out) => at(1 - u, v, 1, out),
    inner: (u, v, out) => at(1 - u, v, -1, out),
  });
}

/**
 * The berserker's Dane axe: bearded crescent, langets down the haft, 1.44 m.
 *
 * Rebalanced about the grip, and the reason is a defect one panel read as a broken
 * *helmet*. The head used to sit 1.12 m up the haft from a grip at 0.90 m, and at
 * the shouldered carry that put a 256 mm steel crescent at y = 1.89 — the middle
 * of the skull. In `art/shots/v3/lineup.png` it overlaps the helm's silhouette and
 * reads as a second, detached bowl, and its polished face — 0.22 roughness against
 * a bright sky env map — blows to 250 luma and becomes the "white blob beside the
 * helm". Nothing was wrong with the berserker's head assembly at all.
 *
 * So the mass came 260 mm down the haft and the butt grew by the same, which
 * leaves the weapon's overall length and its head-to-butt reach where they were
 * and moves the crescent to shoulder height at rest. That overshot in the other
 * direction — at `STANCE.berserker.rest` of -1.78 the head sat *behind* the
 * deltoid and pauldron with only 16% of it visible, so the fix for one defect
 * created another and no amount of blade modelling could show through it. The
 * carry angle is -1.35 now, which is the other half of the same fix and lives in
 * anim.ts. Geometry could not reach it: sweeping `headY` up far enough to clear
 * the shoulder puts the head back on the helm.
 *
 * `rig.reach` in anim.ts is measured off this geometry's bounding box, so the
 * blade trail follows it without being told.
 */
export function buildAxe(materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  const part = new Part();
  // 0.34 rather than 0.22, and a darker albedo. A 220 mm mirror is the largest
  // specular in the game and it was clipping; a Dane axe is a forged, ground,
  // hard-used tool, not a bezel.
  const steel = M.blade(0xa9b2bd, 0.34);
  const iron = M.tinted("iron", 0x5c636d, { roughness: 0.52 });
  const ash = M.timber(0x6a4c2c);
  const leather = M.hide(0x33241a);

  const headY = 0.86;

  // Haft with an oval section — and the oval's long axis runs **along the cut**,
  // which is the way round a real haft is shaped so the hand knows where the edge
  // is without looking. It was the other way round, which cost twice: the haft
  // presented its narrow 42 mm face to a camera that is nearly always in front of
  // the warrior, and the section disagreed with the head it carries.
  //
  // Waisted where the hand closes, and that is the other half of the grip
  // defect. Over the binding the haft measured **64 mm across** at the fist —
  // wider than the span between a closed thumb and forefinger — so the fingers
  // were modelled inside the wood and what showed outside it was the back of a
  // hand lying against a post. A Dane axe haft is ~35 mm at the grip and swells
  // again at the butt for the lower hand to pull against, which is the shape
  // below: full section under the head where the langets ride, 41 mm at the
  // grip, 56 mm at the butt.
  part.add(shell([
    { y: headY + 0.06, hw: 0.026, hd: 0.020 },
    { y: 0.44, hw: 0.024, hd: 0.019 },
    { y: 0.12, hw: 0.0205, hd: 0.0160 },
    { y: -0.12, hw: 0.0205, hd: 0.0160 },
    { y: -0.34, hw: 0.024, hd: 0.0195 },
    { y: -0.56, hw: 0.028, hd: 0.023 },
  ], 8, { capTop: true, capBottom: true }), ash);
  part.add(shell([
    { y: -0.54, hw: 0.034, hd: 0.030 },
    { y: -0.58, hw: 0.030, hd: 0.026 },
  ], 8, { capTop: true, capBottom: true }), iron);

  // The cutting edge, top horn round to the beard tip, and the line where the
  // blade dies into the eye. 295 mm of edge on 176 mm of blade beyond the socket,
  // which is a large but unremarkable Petersen type M — the reach off the haft is
  // 204 mm, i.e. exactly what the old plate had. The head is bigger in silhouette
  // and no longer in reach, and that is the trade this pass wanted: what was
  // missing was never length, it was *form*.
  //
  // The last four stations of both curves are the beard, and they are the reason
  // this is a table rather than an arc. The edge hooks down and *back* toward the
  // haft while the root runs under the socket to x = -20 mm, so the two curves
  // open a concave throat beneath the eye. That notch is the one piece of an axe's
  // outline no other weapon in the game has, and it survives being 30 px tall.
  const edge: Array<[number, number]> = [
    [0.163, 0.137], [0.181, 0.116], [0.192, 0.093], [0.199, 0.068],
    [0.203, 0.042], [0.204, 0.016], [0.203, -0.010], [0.200, -0.036],
    [0.194, -0.061], [0.186, -0.085], [0.176, -0.108], [0.161, -0.130],
    [0.143, -0.148], [0.122, -0.162], [0.098, -0.170],
  ];
  const root: Array<[number, number]> = [
    [0.008, 0.066], [0.015, 0.058], [0.020, 0.048], [0.024, 0.036],
    [0.027, 0.022], [0.028, 0.008], [0.028, -0.006], [0.027, -0.020],
    [0.025, -0.033], [0.021, -0.046], [0.016, -0.059], [0.009, -0.072],
    [0.000, -0.086], [-0.013, -0.100], [-0.026, -0.112],
  ];
  // The root line sits inside the socket's own waist, so the blade's inboard rim
  // is buried in it rather than ending in a lit 38 mm plate.
  part.add(axeBlade(edge, root, 0.019), steel, xf(0, headY, 0));

  // The eye: a forged collar round the haft with a lip at each end and a waist
  // between them. The lips are the point — they are two hard horizontal edges at
  // the one place on the weapon where the light is not raking, and without them
  // the socket was a 96 mm-deep lozenge that read as a fist round the haft and
  // stood proud of the blade it is supposed to carry.
  part.add(shell([
    { y: 0.092, hw: 0.030, hd: 0.020 },
    { y: 0.079, hw: 0.036, hd: 0.025 },
    { y: 0.058, hw: 0.032, hd: 0.022 },
    { y: -0.058, hw: 0.032, hd: 0.022 },
    { y: -0.079, hw: 0.036, hd: 0.025 },
    { y: -0.092, hw: 0.030, hd: 0.020 },
  ], 10, { power: 2.5 }), iron, xf(0, headY, 0));

  // Langets: two straps down the faces the blade lies in, tapering to a point,
  // riveted through. They used to be a pair of 50 mm-deep boxes standing 5 mm
  // clear of the haft on either side of it — at gameplay distance that is a fork,
  // not a binding, and it was most of what made the visible half of this weapon
  // read as a stick. Built as prisms in their own plane and turned onto the haft,
  // so each lies *on* the wood with a rounded back.
  const langet: Array<[number, number]> = [
    [-0.014, 0.020], [0.014, 0.020], [0.012, -0.052], [0.007, -0.108],
    [0.0, -0.145], [-0.007, -0.108], [-0.012, -0.052],
  ];
  for (const s of [-1, 1]) {
    part.add(lensPrism(langet, 0.007, 0.3), iron, xf(s * 0.024, headY - 0.10, 0, 0, s * Math.PI / 2, 0));
    for (const ry of [-0.01, -0.09]) {
      part.add(ball(0.005, 6), iron, xf(s * 0.029, headY - 0.10 + ry, 0, 0, 0, 0, 0.6, 1, 1));
    }
  }
  // Grip binding: 3 mm of hide over the waisted wood, not 8. It used to stand
  // proud enough to be a collar rather than a wrap, and it is the surface the
  // fist is fitted to — `HAND_GRIP.berserker` is this radius and nothing else.
  part.add(shell([
    { y: 0.09, hw: 0.0235, hd: 0.0190 },
    { y: -0.09, hw: 0.0240, hd: 0.0195 },
  ], 8, { wall: 0.004 }), leather, xf(0, 0.02, 0));

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
  // The midrib, and it is meant to stand proud — but as a 300 mm box it ran past
  // the blade at both ends and ended in a square face 10 mm short of the point,
  // which renders as a fin sticking out of the leaf. Swept, it dies into the
  // blade at the tip and again at the socket, standing ~1.2 mm off the faces
  // where a rib actually stands and nowhere else.
  part.add(shell([
    { y: 1.405, hw: 0.0034, hd: 0.0044 },
    { y: 1.30, hw: 0.006, hd: 0.0075 },
    { y: 1.22, hw: 0.0062, hd: 0.008 },
    { y: 1.14, hw: 0.005, hd: 0.0062 },
  ], 6, { power: 2.2, capTop: true, capBottom: true }), iron);
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
 * A planked lime-board shield: seven boards edge to edge, domed toward the enemy,
 * a rawhide-bound rim, an iron boss over the hand-hole and a grip bar across the
 * back. Built with the boss forward of the origin so the fist that holds it lands
 * behind the boards, where a hand actually goes.
 *
 * Three things were wrong with it, all visible on the huscarl in
 * `art/shots/v3/lineup.png`, where it reads as a flat slab clipping out of frame:
 *
 *   1. SIZE. 0.88 m of board on a 2.0 m man is 45% of his height. The Gokstad
 *      boards are that wide and this was cut to match them, but those are the
 *      largest finds we have; the fighting sizes are at the bottom of the 0.70–0.95
 *      range. It is now 0.76 m of board, 0.79 m over the binding.
 *   2. THE PAINT WAS NOT ON THE BOARDS. The quarters were flat `CircleGeometry`
 *      discs at a fixed z through a set of boards each domed to its own depth, so
 *      the paint was buried 25 mm inside the planking at the centre and stood 22 mm
 *      proud of it at the rim. That intersection is the hard straight edge cutting
 *      across the planks in `portrait.png`, and it is why the face reads as one
 *      plane rather than as boards. Each quarter is now built per plank, riding on
 *      that plank's own face 2 mm proud of it, so it can never cut through again.
 *   3. NOTHING BEHIND THE SEAMS. The 3% gaps between boards showed whatever was
 *      behind them, which at a glancing angle is sky. A dark hide facing behind the
 *      planking turns all six seams into shadow lines, which is the only thing that
 *      makes planking read as planking at gameplay distance.
 *
 * The carry used to be the fourth item here and it is fixed: `anim.ts` hung the
 * disc off `leftArm` at (-0.14, -0.4, 0.26), which put the fist 260 mm *above*
 * the boss — a man holding a centre-grip shield by its bottom rim — and threw the
 * whole disc against the frame edge. Re-measured on the built rig by the owner of
 * that file, the off fist now sits (-2.7, +0.6, +39.9) mm from this origin on a
 * disc spanning ±402 mm: dead centre laterally, and the 40 mm of standoff is
 * exactly the grip bar below. The fist that closes on that bar is sized to it —
 * see `HAND_GRIP.huscarl.off`.
 */
export function buildShield(color = 0x6b4226, materials?: CharacterMaterials): THREE.Group {
  const M = materials ?? RAW;
  const g = new THREE.Group();
  const part = new Part();
  const board = M.timber(color);
  // A painted board is timber under paint, not cloth. `M.tunic` dressed these
  // quarters in wool at a fixed five repeats — a ~60 mm tile on a 105 mm plank —
  // and that is the basket in `art/shots/v7/portrait.png`: the pale quarters read
  // as wickerwork while the boards *behind* them, on the same geometry, read as
  // wood. Same substance as the board now, so the grain runs through the paint
  // the way it does on a real limewood shield.
  const paint = M.timber(0xb8a276);
  const iron = M.tinted("iron", 0x5f666f, { roughness: 0.5 });
  // 0.42 rather than 0.32: the boss is the one convex metal shape on the shield and
  // at close roughness it returned a single clipped dot instead of a rolled
  // highlight across the dome.
  const steel = M.blade(0x9aa2ac, 0.42);
  const leather = M.hide(0x3a2a1a);
  // Rawhide, not black leather. The binding is the shield's outline, and an outline
  // in the darkest material on the object draws nothing — this is the cheapest way
  // to make the thing read as round at fifty metres.
  const rawhide = M.hide(0x9a7c52);

  const R = 0.38;
  const planks = 7;
  const zf = 0.05;
  const halfW = (R / planks) * 0.97;
  const crest = 0.03;

  // Hide facing behind the boards, so every seam is a dark line rather than a slot
  // through to the sky. Deliberately the same leather as the grip and not a shade of
  // its own: it is never seen as a surface, only as what is *behind* six 3 mm gaps,
  // and a second material for that would be a whole extra draw call.
  //
  // A disc with thickness, not a `CircleGeometry`. The flat circle faced +z only,
  // so seen from behind it was culled — and the outer planks are chords, only
  // 100 mm tall at the rim, so the shield had two see-through crescents inside its
  // own binding. Invisible while the shield was mounted face-out; the moment
  // anim.ts started carrying it bladed at rest, `probe/closeup.png` showed the
  // turf through it. 6 mm of rawhide backing costs ~70 triangles and no draw call.
  part.add(new THREE.CylinderGeometry(R * 0.99, R * 0.99, 0.006, 24), leather, xf(0, 0, zf - 0.007, Math.PI / 2));

  // Seven boards, one geometry, one material — and until this pass one *grain*.
  // `BoxGeometry` parameterises every face over 0..1 whatever size the face is,
  // so all seven front faces asked `oak` for the same three repeats of the same
  // texture and got back the same knots at the same heights. No texture recipe
  // can fix that; it has to be fixed where the UVs are made, which is here.
  //
  // Two errors, and they are separable. The first is *phase*: identical boards.
  // The second is *density*, and it is the larger of the two — the boards are
  // chords of a circle, 100 mm tall at the rim against 753 mm through the
  // middle, so three repeats over each of them is a 33 mm grain on the outer
  // board and a 251 mm grain on the centre one. Seven boards nailed edge to edge
  // out of one tree, showing a 7.5:1 range of grain, is not a shield.
  //
  // `PLANK_V` is the v-tile every board is normalised to — the centre board's,
  // so the plank the eye actually lands on is unchanged and the rest come to
  // meet it. The u repeat is left alone: 35 mm across the width is the close
  // ring spacing that makes quarter-sawn oak read as oak, and it is already
  // consistent because every board is the same width.
  const PLANK_V = 0.7526;
  for (let i = 0; i < planks; i++) {
    const cx = ((i + 0.5) / planks - 0.5) * 2 * R;
    // Chord height, so the board's outline follows the circle instead of ending
    // in a square corner, and a dome forward of centre.
    const edge = Math.max(0.05, Math.sqrt(Math.max(0, R * R - (Math.abs(cx) + halfW) ** 2)));
    const dome = crest * (1 - (cx / R) ** 2);
    // Phase: irrational-ish per board in both axes, so no two share a knot and
    // no pair lines up again further along the disc. `hash` would do as well;
    // these are written out because the whole point is that a reader can see
    // seven different numbers.
    const du = (i * 0.37) % 1;
    const dv = (i * 0.61 + 0.13) % 1;
    part.add(retile(box(halfW * 2, edge * 2, 0.019), du, dv, (edge * 2) / PLANK_V), board, xf(cx, 0, zf + dome));
    // The painted quarter, cut per plank: boards right of centre carry it on their
    // upper half, boards left of centre on their lower half, which is the same
    // two-colour quartering the disc wedges were drawing — except this one is
    // lying on the wood.
    //
    // Half the board's height and its own 0..1 v, so at `M.timber`'s repeat 3 the
    // paint's grain used to be exactly twice as fine as the board 2 mm under it.
    // Same normalisation, same phase as the board it lies on, so the grain runs
    // through the paint the way it does on a limewood shield.
    part.add(retile(box(halfW * 1.94, edge, 0.004), du, dv, edge / PLANK_V), paint,
      xf(cx, (cx >= 0 ? 1 : -1) * edge * 0.5, zf + dome + 0.0115));
  }

  // Rawhide binding folded over the board edge, then iron clamps over it.
  part.add(ring(R + 0.006, 0.016, 6, 28), rawhide, xf(0, 0, zf + 0.002));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    part.add(box(0.026, 0.044, 0.046), iron, xf(Math.cos(a) * R, Math.sin(a) * R, zf + 0.002, 0, 0, a));
  }

  // Boss: 156 mm across and 52 mm proud, domed over the hand-hole with a riveted
  // flange bearing on the boards. Built along +Y and tipped a quarter turn, so the
  // section heights below become depth out of the shield's face.
  const bossZ = zf + crest + 0.0095;
  part.add(shell([
    { y: 0.052, hw: 0.026, hd: 0.026 },
    { y: 0.041, hw: 0.047, hd: 0.047 },
    { y: 0.021, hw: 0.064, hd: 0.064 },
    { y: 0.005, hw: 0.074, hd: 0.074 },
    { y: 0.0, hw: 0.086, hd: 0.086 },
  ], 16, { capTop: true }), steel, xf(0, 0, bossZ, Math.PI / 2, 0, 0));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    part.add(ball(0.008, 6), steel, xf(Math.cos(a) * 0.079, Math.sin(a) * 0.079, bossZ + 0.004));
  }

  // Back: the grip bar the fist closes on, and two board battens.
  part.add(box(0.05, 0.3, 0.024), leather, xf(0, 0, zf - 0.01, 0, 0, Math.PI / 2));
  for (const s of [-1, 1]) {
    part.add(box(0.44, 0.03, 0.014), board, xf(0, s * 0.19, zf - 0.004));
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

/**
 * What each class's two hands actually close on, as a shaft radius in metres at
 * the point the hand mount sits — `main` is the weapon `buildWeaponForClass`
 * hands that class, `off` is whatever the off hand carries and `null` when it
 * carries nothing.
 *
 * Every number is read off the geometry above at y = 0, which is where the mount
 * is: sword 16 mm over the cord, seax 14, shield bar 17 across its narrow face,
 * axe 21 over the binding, spear 24 over its hand-hold. They are here rather
 * than in the builders because the *hand* is what needs them and a hand is built
 * before a weapon is chosen. Re-measure when a grip is re-cut; a stale number
 * here does not break anything, it just puts the fingers a few millimetres off
 * the leather.
 *
 * `off` mirrors what `anim.ts` mounts — the runekeeper fights with a seax in each
 * hand and the huscarl's left fist closes on the shield's centre bar, while the
 * warden and the berserker carry nothing in the off hand and so get an open one.
 * That coupling is real and unavoidable from here: this file cannot see the
 * mounting, so if a class ever gains or loses an off-hand item, this table is the
 * second edit.
 */
const HAND_GRIP: Record<WarriorClass, { main: number; off: number | null }> = {
  // Between the sword's 16 mm core and the 21 mm crest of its cord helix, which
  // is where a hand on a corded grip actually sits — proud of the wood, sunk into
  // the binding.
  huscarl: { main: 0.017, off: 0.017 },
  warden: { main: 0.024, off: null },
  runekeeper: { main: 0.014, off: 0.014 },
  berserker: { main: 0.021, off: null },
};

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

/**
 * Fallback identity, handed out in build order. A real per-player seed belongs in
 * the caller — `anim.ts` already hashes `player.id` for the gait phase and that is
 * the number this wants — but until it is threaded through, build order is stable
 * within a session and identical across capture runs, which is what an A/B against
 * `art/shots/baseline` needs. The armoury mannequin deliberately does not draw
 * from it: a preview that reshuffled its own face every time you tried a helmet on
 * would be unusable.
 */
let FACE_SEQ = 0;

export function buildCharacter(
  cls: WarriorClass,
  ap: Appearance,
  accents: number,
  materials?: CharacterMaterials,
  detail: CharacterDetail = "high",
  seed?: number,
): BuiltCharacter {
  const M = materials ?? RAW;
  const lod = LOD[detail];
  const B = BUILD[cls] ?? BUILD.warden;
  const identity = seed ?? (materials ? FACE_SEQ++ : 0);
  const face = faceTraits(identity);
  // Stature is quantised to three steps rather than jittered continuously. Height
  // variety is worth a lot in a brawl of eight, but the body's merged geometry is
  // shared by signature, and a free-floating multiplier would hand every warrior
  // his own copy of every limb. Three steps means three bodies per loadout.
  const step = Math.round(hash(identity, 31) * 2) - 1;
  const S = skeleton({ ...B, stature: B.stature * (1 + step * 0.022) });
  const root = new THREE.Group();

  // --- substances. Held once so the merge groups by identity and eight
  // warriors in Rough Iron share one program and one geometry per part.
  //
  // The low tier collapses the near-neighbour pairs — linen into wool, buff into
  // black leather, the second skin tone into the first. That is a draw-call cut
  // on the device that needs one, and it costs a distinction that is under a
  // pixel wide on a phone. No layer, hem or class silhouette goes with it. ---
  const thrifty = detail === "low";
  const tone = SKIN_TONES[face.tone];
  const mail = M.armour(ap.armorColor);
  // Kit colours that no armoury option controls, and therefore mine. They were
  // authored two passes ago against a brighter grade and they are now the reason a
  // warrior reads as a hole in the frame: 0x2f2a22 trousers and 0x2c1e13 leather
  // carry 0.02 linear, less than the turf they stand on, so every layer of mail
  // and every strap on top of them lands inside one black shape. Lifted about a
  // stop and a half and pulled off the arena's tan axis — the huts, palisade and
  // soil are all one warm hue, and a warrior in cool grey-green wool separates
  // from them without anybody touching the grade.
  //
  // Cloth is asked for by girth rather than through `M.tunic`, which is fixed at
  // five repeats whatever it is dressing — see `clothRepeat`. The trousers are the
  // reason: five repeats round a thigh puts the wool tile's dye blotches 27 mm
  // apart, which is the houndstooth check in `art/shots/v4/stance.png`.
  const cloth = (color: number, girth: number) =>
    M.tinted("wool", color, { repeat: clothRepeat(girth) });
  // Torso girth, for the layers that go round it: an ellipse's perimeter, near
  // enough, off the chest section the garments are actually swept on.
  const bodyGirth = Math.PI * (1.5 * (S.chestHW + S.chestHD) - Math.sqrt(S.chestHW * S.chestHD)) * 2;
  const wool = cloth(accents, bodyGirth);
  const trouser = cloth(0x504a3e, 2 * Math.PI * S.legR[0]);
  const wrapWool = cloth(0xa2926e, 2 * Math.PI * S.legR[2]);
  const hide = M.hide(0x4a3524);
  const buff = thrifty ? hide : M.hide(0x7a5b38);
  // Linen is asked for by girth for the same reason wool is. A flat `repeat: 6`
  // put a ~200 mm tile on the shirt body and a ~75 mm one on the same shirt's
  // sleeve — one garment, two fabrics — and the coarse end is the finest cloth
  // in the set, where a visible tile costs most.
  const flax = (girth: number) =>
    thrifty ? wool : M.tinted("linen", 0xc2b69c, { repeat: clothRepeat(girth) });
  const linen = flax(bodyGirth);
  const sleeveLinen = flax(2 * Math.PI * S.armR[0] * 1.12);
  const iron = M.tinted("iron", 0x6e767f, { roughness: 0.5 });
  const steel = thrifty ? iron : M.blade(0xb6bfca, 0.3);
  // Cast bronze, not a bezel. `M.blade` puts brass on the steel substrate at
  // metalness 0.9 and roughness 0.34, which returns the sky's whole orange band
  // in one specular hit: every buckle, rivet and boss on the warrior was reading
  // as a blown yellow chip in `art/shots/v4/lineup.png`, and the belt plate was
  // reading as a placeholder square. On the bronze substrate at 0.46 the same
  // fittings hold their shape and still read as the most precious thing worn.
  const brass = M.tinted("bronze", 0xc0a45c, { roughness: 0.46 });
  // Flesh is authored against a *canonical* tone and swapped at mesh time. The
  // geometry a warrior's arms and neck merge into does not depend on his
  // complexion — only the material bound to it does — so folding the tone into the
  // cache key the way the stature step has to be folded in would fork every limb
  // in the game four ways for nothing. Authoring canonically and remapping keeps a
  // shieldwall down to one set of bodies per stature step. Measured: it is the
  // difference between 316 distinct geometries across eight warriors and 120.
  const canon = SKIN_TONES[0];
  // Roughness 0.5 rather than the substance's own 0.6, on all flesh.
  //
  // This is the other half of "the skin is too uniformly bright", and it is the
  // half that works on the open planes where an albedo patch cannot (see
  // `addFaceTones`). Skin's F0 is 0.04, so the specular term is small — but it is
  // the *only* term in this rig that varies with the normal in a way the eye reads
  // as form, because the diffuse is dominated by light that is either
  // omnidirectional or straight down the camera axis. Tightening the lobe puts a
  // real fall-off across the cheek, the brow and the forearm: up-facing bone
  // catches the key at 60° and the planes below it do not. 0.5 is as far as it can
  // go before a warrior looks oiled.
  const skin = M.tinted("skin", canon.base, { roughness: 0.5, repeat: 2 });
  const skinDark = thrifty ? skin : M.flesh(canon.shade);
  // The warm tone is the whole subsurface cheat: lips, ears, lid rims, fingertips —
  // and, this pass, the brow ridge and the crest of the cheekbone, which is where a
  // face flushes and therefore the cheapest honest highlight there is.
  //
  // A *lighter* tone was tried there first, on a tighter specular lobe, and it was
  // wrong twice over. The specular term does not scale with albedo — F0 is 0.04 for
  // all skin — so a fixed highlight lifts dark skin proportionally more, and on the
  // two darker complexions the cheekbone patch rendered as a white smear under the
  // eye. Debug-coloured to confirm it: the smear was the patch's own specular
  // response, not its albedo and not its rim. Warm at skin's own roughness has no
  // specular difference to smear, and the highlight that actually reads is the one
  // the *form* makes — the zygomatic push stands 13 mm out and 10 mm forward over a
  // hollow, so the crest catches the 60° key and the cheek under it does not.
  // It collapses into the base tone on low, because at that tessellation the parts
  // that wear it are two pixels each and a draw call is worth more than they are.
  const skinWarm = thrifty ? skin : M.flesh(canon.warm);
  const reskin = new Map<THREE.Material, THREE.Material>();
  if (tone !== canon) {
    reskin.set(skin, M.tinted("skin", tone.base, { roughness: 0.5, repeat: 2 }));
    // Guarded, not unconditional: on the low tier all three are the same instance
    // and a second `set` would quietly repaint the whole body in the shade tone.
    if (!thrifty) {
      reskin.set(skinDark, M.flesh(tone.shade));
      reskin.set(skinWarm, M.flesh(tone.warm));
    }
  }
  // The white of the eye, and it is deliberately neither white nor fixed.
  //
  // A sclera brighter than the skin around it is *the* classic CG tell: the eyes
  // stop being wet spheres in shadowed sockets and become two lamps set in a mask,
  // which is what `art/shots/v3/portrait.png` shows — two bright glints under a
  // helm brow. 0xcfc8b8 carried more luma than every complexion in `SKIN_TONES`.
  // It is also per complexion, for the same reason: the specular term does not
  // scale with albedo, so one fixed sclera that looks right against the palest skin
  // renders as a white sliver under the eye of the darkest. Each tone carries one
  // at about 0.86 of its own luma, which keeps the relationship — sclera under
  // skin, iris under sclera — the same on all four. The roughness went to 0.22 for
  // one iteration to buy back the wetness the darker albedo lost, and that was
  // wrong: a lobe that tight on an up-facing part of a sphere returns the sky's
  // whole orange band, so the sclera below the iris rendered as a white sliver on
  // exactly the complexions the albedo change was meant to help. 0.34 gives a dot
  // and not a smear.
  const sclera = M.standard(canon.sclera, 0.34);
  // Remapped like the flesh, and for the identical reason: the head's merged
  // geometry is shared by loadout, so the tone has to ride on the material rather
  // than fork the mesh. Declared after `reskin` is built and inserted here because
  // the map is only read at mesh time, in `emit`.
  if (tone !== canon) reskin.set(sclera, M.standard(tone.sclera, 0.34));
  const iris = M.standard(IRIS_COLORS[face.iris], 0.09);
  // Hair and beard are wool — there is no hair substance in the library and there
  // is no budget for one — so what matters is the density it is tiled at. `cloth`
  // would give a skull-sized patch twelve repeats, at which the tile's weave is
  // still resolvable and a warrior's crop reads as a knitted cap. At twenty the
  // individual yarns are about a millimetre and average out to fibre, which is what
  // hair does at any distance a player sees it from.
  const hair = M.tinted("wool", ap.hairColor, { repeat: 20 });
  // 26, not 18. The beard patch is the largest single area of hair on the head
  // and at 18 repeats the wool tile's weave was resolving as a grid — the "flat
  // waffle panel" both panels named. It is the same tile as the hair; what makes
  // hair read as fibre rather than as knitting is only ever the density it is
  // tiled at, and a beard covers less skull than a crop does, so it needs more.
  const beard = M.tinted("wool", ap.beardColor, { repeat: 26 });
  // Fur goes the other way from hair: the wool tile's dye blotches are the one
  // thing in the library that reads as clumps of pelt, so this wants them large.
  // Six repeats over a shoulder ruff puts a clump every 40 mm, which is a fleece.
  // Fur is wool at a much coarser tile than clothing — the dye field's blotches
  // are the one thing in the library that reads as clumps of pelt — but it has to
  // be a *constant* coarseness. A flat `repeat: 6` spanned a shoulder ruff, a
  // hanging lock and a box pelt off one material, an 8:1 texel scatter inside one
  // garment: the same class of defect `WORLD_TILE` exists to kill. The tile below
  // is what 6 repeats gave the ruff, which is the surface it was tuned on, so the
  // ruff does not move and everything else comes to meet it. Integer repeats
  // rather than a continuous ratio: a fractional repeat wraps mid-tile and draws
  // a seam, which on a 90 mm lock would be most of the lock.
  const PELT_TILE = 0.25;
  const pelt = (girth: number) =>
    M.tinted("wool", 0x8a7050, { repeat: Math.max(1, Math.round(girth / PELT_TILE)) });
  const ruffX = S.chestHW + 0.062;
  const ruffZ = S.chestHD + 0.062;
  const fur = pelt(Math.PI * (1.5 * (ruffX + ruffZ) - Math.sqrt(ruffX * ruffZ)));
  const furLock = pelt(2 * Math.PI * 0.024);
  const furPelt = pelt(0.3);
  const dark = M.standard(0x1a1310, 0.42);
  const rune = M.get("runeGlow");
  const cloakMat = cloth(CLOAK_COLORS[ap.cloak] ?? 0x5a4030, bodyGirth * 1.4);

  // --- merged-geometry cache. Only for callers that brought a shared library;
  // the armoury preview allocates and disposes its own materials, so caching its
  // geometry would hand the next preview a mesh pointing at a dead program.
  //
  // Two signatures, not one. The body is shared by loadout and stature step, so a
  // shieldwall of huscarls is still three sets of limbs; the head carries the
  // seed as well, because a face that varies is a face that cannot be shared. That
  // split is the difference between eight unique warriors costing one extra head
  // each and costing eight of everything. ---
  const base = materials ? `${signatureOf(cls, ap, accents, detail, libraryId(M))}|s${step}` : null;
  const headSig = base ? `${base}|f${identity}` : null;

  function storeFor(signature: string): Map<string, MergedPart> {
    let s = RIG_CACHE.get(signature);
    if (!s) {
      s = new Map<string, MergedPart>();
      RIG_CACHE.set(signature, s);
    }
    return s;
  }

  function emit(name: string, parent: THREE.Object3D, make: () => Part, sig = base): THREE.Mesh[] {
    const store = sig ? storeFor(sig) : undefined;
    let merged = store?.get(name);
    if (!merged) {
      merged = make().merge();
      if (store && sig) {
        for (const { geo } of merged) guard(geo, sig);
        store.set(name, merged);
      }
    }
    const meshes: THREE.Mesh[] = [];
    for (const { geo, mat } of merged) {
      if (sig) USES.set(geo, (USES.get(geo) ?? 0) + 1);
      const mesh = new THREE.Mesh(geo, reskin.get(mat) ?? mat);
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
      ], lod.limb, { capTop: true, capBottom: true }), trouser);

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

      // ---- the turnshoe ----
      //
      // What was here was a wedge box with a ball stuck on the front of it, and
      // `art/shots/v7/lineup.png` shows exactly that: a brown slipper with no sole
      // line, no topline, no heel and no toe — the outline of a foot-shaped bag.
      // A boot is the last thing on a standing figure the eye reaches and the
      // first place it checks that the figure is standing *on* something, and this
      // one gave it a single silhouette with one highlight and no edges anywhere.
      //
      // It is now built the way a turnshoe is: a last, a sole cut wider than the
      // last so it stands proud all round as a welt, and a rand between them. The
      // welt is the piece that earns its triangles. It is a value break and a
      // specular line running the whole way round the join, in a second substance,
      // sitting exactly where a viewer's eye goes to decide whether a foot is on
      // the ground — and it reads from behind and from above, which the old ball
      // did not read from at all.
      //
      // Everything below is swept along the foot rather than up the leg: `lastAt`
      // takes a distance forward of the ankle, a half-width, and the heights of
      // the section's top and bottom above the ground, and the whole sweep is
      // turned a quarter-turn onto its side. `lift` is what gives the toe its
      // spring — a last curls clear of the ground over the last 60 mm, which is
      // the difference between a shoe and a plank.
      //
      // The footprint is deliberately the one that was here — 245 mm long, 73 mm
      // of it behind the ankle, 104 mm across — because it is load-bearing outside
      // this file and the pass that changes it should be the pass that says so.
      // `anim.ts` solves the body's height against the hip pivot on the assumption
      // that the sole sits exactly `legLen` below it, and it still does; what that
      // solve does *not* know is `FOOT_FWD`, which is why a leg pitched 48° puts
      // its toe 128 mm through the turf. See the constants.
      const lastAt = (fwd: number, hw: number, top: number, lift = 0): Station =>
        ({ y: -fwd, hw, hd: (top - lift) * 0.5, z: (top + lift) * 0.5 });
      const onFoot = xf(0, sole, 0, -Math.PI / 2, 0, 0);

      // The shaft, and the topline is the whole point of it: leather meeting a
      // legging along a colour change and nothing else is most of why the boot
      // read as a painted-on sock. `wall` makes that opening an edge with a lit
      // inside face, which is what says the leg goes *into* the boot.
      p.add(shell([
        { y: ankle + 0.030, hw: rAnkle * 1.30, hd: rAnkle * 1.34, z: -0.004 },
        { y: ankle - 0.012, hw: rAnkle * 1.36, hd: rAnkle * 1.46, z: 0.004 },
        { y: sole + 0.052, hw: rAnkle * 1.32, hd: rAnkle * 1.62, z: 0.016 },
      ], lod.limb, { power: 2.2, wall: 0.007 }), hide);

      // The last. The heel quarter is swept as part of it rather than banded on
      // afterwards, and that is not a saving — a stiffener added as its own shell
      // has two ends, and an end on a curved surface is a rim strip facing the key
      // squarely while the leather either side of it does not. That is the same
      // mechanism the cloak hem and the face tones lost two passes to. Built into
      // the sweep, the counter is a change of slope with no boundary at all.
      p.add(shell([
        lastAt(-0.068, 0.029, 0.058, 0.008),
        lastAt(-0.056, 0.035, 0.084, 0.011),
        lastAt(-0.038, 0.039, 0.094, 0.013),
        lastAt(-0.008, 0.041, 0.100, 0.014),
        lastAt(0.036, 0.044, 0.078, 0.014),
        lastAt(0.086, 0.047, 0.058, 0.013),
        lastAt(0.132, 0.041, 0.042, 0.014),
        lastAt(0.164, 0.019, 0.026, 0.019),
      ], lod.limb, { power: 2.3, capTop: true, capBottom: true }), hide, onFoot);

      // The sole, 5 mm proud of the last all round. Waisted between heel and ball
      // because that is the outline a foot actually leaves, and because a straight
      // taper is what made the old sole read as a plank.
      p.add(shell([
        lastAt(-FOOT_BACK, 0.026, 0.016),
        lastAt(-0.050, 0.036, 0.017),
        lastAt(-0.010, 0.042, 0.016),
        lastAt(0.034, 0.044, 0.015),
        lastAt(0.086, 0.052, 0.016),
        lastAt(0.138, 0.045, 0.017, 0.003),
        lastAt(FOOT_FWD, 0.018, 0.020, 0.009),
      ], lod.limb, { power: 2.6, capTop: true, capBottom: true }), buff, onFoot);

      if (lod.trim) {
        // The rand: a second course between sole and upper, 2 mm proud of the last
        // and 2 mm inside the sole. It costs one sweep and it buys the join two
        // edges instead of one, all the way round with no ends anywhere — which is
        // what makes a foot read as standing on something from directly behind,
        // the angle `art/shots/v7/stance.png` puts the rear boot at.
        p.add(shell([
          lastAt(-0.0705, 0.0300, 0.030, 0.012),
          lastAt(-0.0490, 0.0378, 0.030, 0.013),
          lastAt(-0.0100, 0.0432, 0.029, 0.013),
          lastAt(0.0340, 0.0455, 0.028, 0.013),
          lastAt(0.0860, 0.0500, 0.029, 0.013),
          lastAt(0.1370, 0.0440, 0.030, 0.015),
          lastAt(0.1700, 0.0185, 0.031, 0.019),
        ], lod.limb, { power: 2.5, capTop: true, capBottom: true }), buff, onFoot);
        p.add(ring(rAnkle * 1.32, 0.005, 4, 10), buff, xf(0, ankle + 0.005, -0.004, Math.PI / 2, 0, 0));
      }
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
    //
    // The top three stations are the trapezius, and they are the reason the old
    // shoulders read as a slab with a pipe stuck in it. They used to run 1.625 /
    // 0.069 → 1.570 / 0.110 → 1.544 / 0.164: 95 mm of width bought with 81 mm of
    // drop, a straight 40° cone, and then the deltoid cap popped back up above it
    // at 1.607 — so each side of the neck had a V-shaped notch cut out of it. The
    // profile below leaves the neck almost level and turns down late, which is the
    // fan a trapezius actually makes, and the cap has come down to meet it.
    //
    // The topmost station is deliberately *narrower than the neck shell that rises
    // out of it*. At yokeHW * 0.5 the torso's own capped top stood 7 mm proud of
    // the throat and you could see the disc — a lit horizontal plate under the
    // chin, which is exactly what a floating head looks like.
    // The bottom half is new, and it is the "no pelvis mass" finding. The list
    // used to stop 50 mm under the hip joint on a ring 6 mm narrower than the one
    // above it, so a body went waist → straight tube → open hole, and the two
    // thigh shells rose into that hole as separate pipes with daylight between
    // them right up to the hem. There was no crotch, no gluteal volume and no
    // iliac flare anywhere on the figure — and because every garment is swept off
    // `at()`, which samples this list, no skirt had any swing either.
    //
    // The last station here is the hip and not the crotch on purpose. `at()`
    // clamps below its final station, so a skirt hanging past the pelvis takes
    // that station's width: terminate the sampler at the crotch and a tunic hem
    // comes out *inside* the thighs. The crotch stations are appended separately
    // for the body shell only — see `seat`.
    const spine: Station[] = [
      { y: S.neckRoot - 0.046, hw: S.neckHW * 0.86, hd: S.neckHD * 0.80 },
      { y: S.neckRoot - 0.062, hw: S.yokeHW * 0.80, hd: S.yokeHD * 0.82 },
      { y: S.neckRoot - 0.082, hw: S.yokeHW * 1.03, hd: S.yokeHD * 0.92 },
      { y: S.shoulderY - 0.012, hw: S.chestHW * 0.97, hd: S.chestHD * 0.96 },
      { y: S.shoulderY - 0.052, hw: S.chestHW * 0.995, hd: S.chestHD * 0.99 },
      { y: S.chestY, hw: S.chestHW, hd: S.chestHD },
      { y: S.waistY, hw: S.waistHW, hd: S.waistHD },
      // Iliac crest: where the pelvis starts to swell out of the waist.
      { y: S.beltY - 0.032, hw: S.waistHW * 1.05, hd: S.waistHD * 1.05 },
      // Widest across the trochanters, and set back in z — a pelvis carries its
      // volume behind the hip joint, not around it.
      { y: S.hipY + 0.055, hw: S.hipHW, hd: S.hipHD, z: -0.007 },
      { y: S.hipY - 0.020, hw: S.hipHW * 0.99, hd: S.hipHD * 1.03, z: -0.011 },
    ];
    // The seat: the last 75 mm of pelvis, closing the two thighs into one mass.
    // Kept off `spine` so it cannot be sampled by a garment.
    const seat: Station[] = [
      { y: S.crotchY + 0.034, hw: S.hipHW * 0.87, hd: S.hipHD * 0.93, z: -0.009 },
      { y: S.crotchY, hw: S.hipHW * 0.62, hd: S.hipHD * 0.75, z: -0.003 },
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

    // Where every neck opening sits, measured off the cervicale rather than off
    // the yoke's base. 14 mm below it puts a tunic neckline on the collarbone; the
    // mail rides 12 mm lower again so both edges are visible as edges. This is the
    // single number that decides how much bare throat the frame shows.
    const collar = S.neckRoot - 0.014;
    // Every layer takes a station here, and the reason is worth stating because
    // getting it wrong cost a pass. Above the spine's topmost station `at()` clamps,
    // so every collar is built off the *same* base width and differs only by its pad
    // — which is exactly the nesting we want. Below it they ramp to the shoulder at
    // different rates from different heights, and the one that starts highest
    // arrives widest: raise the collar line without this shared station and the
    // linen shirt comes out through the hauberk for the first 23 mm. Derived from
    // `spine[0].y` rather than from `collar` so it cannot drift out of the clamped
    // band and quietly stop working.
    const ramp = spine[0].y + 0.004;

    // Breeches over the seat, for every class. Without this the pelvis stops at
    // the last spine station and the crotch is a hole; with it, the two thigh
    // shells rise into one continuous mass and the figure has a fork instead of a
    // gap. Under the tunic on three of the four, and the berserker's actual
    // trousers on the fourth — same material either way, so it is one more shell
    // and no extra draw call.
    p.add(shell([
      { y: S.hipY + 0.06, hw: S.hipHW * 0.98, hd: S.hipHD * 0.99, z: -0.006 },
      ...seat,
    ], seg, { power: 2.3, capBottom: true }), trouser);

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
      // The +6 mm flare at the neckline is not cosmetic: this shell is capped, so
      // its top is a disc the throat passes through, and at the shirt's bare pad the
      // annulus left round the neck is 2 mm wide and z-fights the skin. 8 mm of linen
      // reads as the inside of a neckline instead.
      p.add(shell(layer([collar + 0.006, ramp, S.shoulderY, S.chestY, S.waistY, S.hipY, S.hipY - 0.05], 0.008, [0.006]), seg, { power: 2.4, capTop: true, capBottom: true }), linen);
    }

    // Wool tunic over it, with a real rolled edge, hung at the class's own hem.
    //
    // This was `0.86 * B.stature`, and `B.stature` is a *multiplier* near 1 — not
    // a height — so every class wore its hem at 860 mm however it was built, and
    // the huscarl's hauberk finished 160 mm from the runekeeper's robe. Four
    // silhouettes that differ by 160 mm at the one place a garment draws a
    // horizontal are four silhouettes nobody can tell apart, which is what
    // `art/shots/v6/lineup.png` shows. See `BuildTrait.hem`.
    const tunicHem = S.hemY;
    if (!bare) {
      p.add(shell(
        layer(
          [collar, ramp, S.shoulderY + 0.01, S.chestY, S.waistY, S.hipY, tunicHem + 0.06, tunicHem],
          0.021,
          [-0.003, 0, 0, 0, 0.003, 0.01, 0.03, 0.045],
        ),
        seg, { power: 2.3, wall: 0.014 },
      ), robed ? cloakMat : wool);
    } else {
      // A sleeveless hide jerkin, open at the chest, cut off at the hip — the
      // berserker's hem is the highest on the roster and the reason he reads as
      // all limb.
      p.add(shell(
        layer([S.shoulderY + 0.02, S.chestY - 0.02, S.waistY, tunicHem], 0.024, [0, 0, 0.002, 0.008]),
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
      // Laced standing collar. Without it the warden's topmost metal stopped at
      // 1.552 and the only thing between there and the neckline was 60 mm of thin
      // wool — a funnel with a pale post rising out of it, which is why his neck
      // read as the longest of the four. Mail, not plate: this is the coif's skirt
      // laced into the cuirass, and it wants to look soft where the courses do not.
      p.add(shell(
        layer([collar - 0.012, ramp, S.shoulderY + 0.028], 0.03, [-0.004, 0, 0.008]),
        seg, { power: 2.3, wall: 0.013 },
      ), mail);
    } else if (!bare) {
      // The huscarl's hauberk hangs 30 mm below his tunic — a mail hem is the
      // outermost line on him and it wants to be the one you see. Everyone else
      // wears a shirt of mail that stops well short of the garment under it, so
      // both edges read as edges.
      const mailHem = heavy ? tunicHem - 0.03 : tunicHem + 0.26;
      p.add(shell(
        layer(
          [collar - 0.012, ramp, S.shoulderY + 0.02, S.chestY, S.waistY, S.hipY, mailHem + 0.05, mailHem],
          0.036,
          [-0.004, 0, 0, 0, 0.004, 0.012, 0.036, 0.052],
        ),
        seg, { power: 2.3, wall: 0.016 },
      ), robed ? buff : mail);
      if (heavy) {
        // Bishop's mantle: a second cape of mail over the shoulders. This is the
        // huscarl's silhouette — heavy, round-shouldered, immovable.
        p.add(shell(
          layer([collar, ramp, S.shoulderY + 0.015, S.chestY + 0.005], 0.05, [-0.008, 0, 0, 0.018]),
          seg, { power: 2.2, wall: 0.014 },
        ), mail);
      }
    }

    // Belt, buckle, strap-end. Everything below the waist hangs off this.
    const beltR = (bare ? 0.03 : 0.05);
    p.add(shell([at(S.beltY + 0.028, beltR), at(S.beltY - 0.028, beltR + 0.004)], seg, { power: 2.3, wall: 0.014 }), hide);
    // The buckle, and this is the yellow square dead centre on the huscarl and the
    // warden in `art/shots/v4/lineup.png`. It was one 72 × 60 mm brass slab: a flat
    // rectangle with no interior shape, in a material polished enough to blow out,
    // which is exactly what a placeholder marker looks like. A buckle is a *frame
    // with a hole in it* — two uprights, two bars, a tongue across the middle — and
    // the strap it closes on shows through the gap. Five boxes, one material, same
    // merge, and 44 × 50 mm rather than 72 × 60.
    const bkX = 0.022;
    const bkY = 0.019;
    const bkZ = S.waistHD + beltR + 0.008;
    for (const s of [-1, 1]) {
      p.add(box(0.006, bkY * 2 + 0.011, 0.010), brass, xf(s * bkX, S.beltY, bkZ));
    }
    for (const s of [-1, 1]) {
      p.add(box(bkX * 2 + 0.006, 0.0055, 0.010), brass, xf(0, S.beltY + s * bkY, bkZ));
    }
    p.add(box(0.005, bkY * 1.7, 0.007), brass, xf(0, S.beltY, bkZ + 0.004));
    p.add(box(0.026, 0.11, 0.01), hide, xf(0.055, S.beltY - 0.05, S.waistHD + beltR + 0.008, 0.1, 0, -0.12));
    if (lod.trim) {
      for (let i = 0; i < 6; i++) {
        const a = -0.8 + i * 0.32;
        p.add(box(0.016, 0.022, 0.008), brass, xf(Math.sin(a) * (S.waistHW + beltR + 0.01), S.beltY, Math.cos(a) * (S.waistHD + beltR + 0.01), 0, a, 0));
      }
    }

    // Baldric across the chest, and a scabbard hung off it on the left.
    //
    // It was one 620 mm box laid on a chord through a barrel, pinned 45 mm off the
    // chest and tipped 0.16 rad *forward* as it rose — so its top corner ended up at
    // (0.235, 1.672, 0.215): above the collar line, 85 mm clear of the ribcage, out
    // in the air beside the throat. That is the broad diagonal plank across the
    // warden's chest in `art/shots/v3/lineup.png`, and it was one of the things
    // cluttering the read right where the neck needed to be legible. Short segments
    // set on the surface at their own height follow the body instead of cutting
    // through it, and they cost nothing: same material, same merge.
    if (!robed) {
      const runs = lod.trim ? 5 : 3;
      const yTop = S.shoulderY + 0.035;
      const yBot = S.beltY + 0.01;
      const pad = bare ? 0.032 : 0.052;
      for (let i = 0; i < runs; i++) {
        const t = (i + 0.5) / runs;
        const y = mix(yTop, yBot, t);
        const st = at(y, pad);
        // From over the left shoulder down to the right hip, and the segment sits on
        // the ellipse rather than on a plane in front of it.
        const x = mix(-0.62, 0.34, t) * st.hw;
        const lean = Math.sqrt(Math.max(0.08, 1 - (x / st.hw) ** 2));
        for (const face of [1, -1]) {
          const z = st.hd * lean * face;
          // 1.75 of the step, not 1.1: consecutive segments are yawed to their own
          // bit of the barrel, so anything under about 1.5 leaves the corners
          // showing and the strap reads as a chain of blocks.
          p.add(box(0.046, ((yTop - yBot) / runs) * 1.75, 0.013), buff,
            xf(x, y, z, 0, Math.atan2(x, z), 0.4));
        }
      }
      // The boss where the baldric crosses. Down 65 mm and in from 52 mm across to
      // 34: at the old size and height it sat 55 mm from the cloak brooch, and the
      // two of them merged into one cluster of gold spheres on the shoulder — the
      // same "bright placeholder blob" read the belt plate had. A strap fitting
      // belongs on the strap, not up beside the collar.
      p.add(ball(0.017, 8), brass, xf(-0.125, S.chestY + 0.050, S.chestHD + 0.046, 0, 0, 0, 1, 1, 0.55));
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
      // Power 2.0, not 2.1. A superellipse fuller than an ellipse holds its sides
      // flat and turns the corner in a shorter arc, so the ruff had four visible
      // corners on the shoulder line — logged in `docs/OPEN-DEFECTS.md` as a slab
      // with pointed corners. A pelt lying over a shoulder has no corners at all,
      // and the locks below carry the ragged read instead.
      p.add(shell(
        layer([collar - 0.006, ramp, S.shoulderY + 0.03, S.chestY + 0.02], 0.055, [-0.03, -0.012, 0.025, 0]),
        seg, { power: 2.0, wall: 0.02 },
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
          p.add(rod(0.024, 0.005, len, 5), furLock, xf(
            Math.sin(a) * rx, S.shoulderY - 0.01 - len * 0.4, Math.cos(a) * rz,
            0.55 * Math.cos(a), 0, -0.55 * Math.sin(a),
          ));
        }
      }
      p.add(box(0.3, 0.6, 0.03), furPelt, xf(0, S.chestY - 0.12, -S.chestHD - 0.075, -0.12, 0, 0));
      for (let i = 0; i < 4; i++) {
        p.add(rod(0.008, 0.003, 0.06, 5), M.tinted("bone", 0xd8cfb4, { repeat: 1 }), xf(-0.06 + i * 0.04, S.chestY + 0.06, S.chestHD + 0.05, 2.6, 0, 0.2 - i * 0.13));
      }
    }
    if (robed) {
      // Rune-carver's belt: pouches, a slate tablet and a lit amulet.
      p.add(box(0.1, 0.13, 0.06), buff, xf(0.13, S.beltY - 0.09, S.waistHD + 0.03, 0.1, -0.3, 0));
      p.add(box(0.08, 0.11, 0.05), buff, xf(-0.14, S.beltY - 0.08, S.waistHD + 0.02, 0.1, 0.3, 0));
      const slate = xf(0.02, S.beltY - 0.12, -S.waistHD - 0.05, 0, 0, 0.2);
      p.add(box(0.07, 0.12, 0.014), M.timber(0x4a3a2a), slate.clone());
      p.add(rod(0.0035, 0.0035, 0.2, 4), hide, xf(0, S.chestY + 0.09, S.chestHD + 0.02, 0.4, 0, 0));
      // Amulet. Third pass on this object and the first one that names the fault
      // correctly: it was never how bright the stone is, it was that the stone had
      // no rim. `art/shots/v3/lineup.png` had it as a 46 mm ball with no shape;
      // shrinking it and putting a bezel behind it left a 30 mm ball with no
      // shape, which `art/shots/v7/lineup.png` renders as a hard white square four
      // pixels across — the bar's untextured square, in blue, on the one warrior
      // whose whole silhouette is meant to be quiet.
      //
      // Two things change. The substance is now carved rather than uniform (see
      // `shapedGlow`), so the stone's own edge falls to a dark matrix. And the
      // stone is *set* — sunk until the brass claws over its rim, so the outline
      // the eye traces belongs to the bezel, which is a lit dielectric with a
      // highlight and a shadow side, and not to the emissive at all. A bezel is
      // also simply how a stone is held; the old pairing had a ball floating
      // 6.5 mm proud of a ring that was not touching it.
      p.add(ring(0.0202, 0.0062, 6, 16), brass, xf(0, S.chestY - 0.01, S.chestHD + 0.046, 0.15, 0, 0));
      p.add(ball(0.0146, 14), rune, xf(0, S.chestY - 0.01, S.chestHD + 0.0435, 0, 0, 0, 1, 1, 0.55));
      // The rune row was the amulet's fault at a smaller size and with a second
      // error under it. Five bare emissive bars are five white ticks in
      // `art/shots/v7/lineup.png` — but they were also placed on a flat z across a
      // belt that is an ellipse, so the outermost pair stood 41 mm clear of the
      // leather, in front of the hip, attached to nothing. Two of them straddled
      // the buckle.
      //
      // They belong on the slate. A rune-carver's tablet is a real object with its
      // own dark silhouette, the strokes are cut into it rather than hovering over
      // it, and moving them there leaves the amulet as the only lit thing on the
      // warrior's front — which is the composition that object was built for.
      for (let i = 0; i < 3; i++) {
        p.add(box(0.006, 0.062, 0.005), rune,
          slate.clone().multiply(xf(-0.019 + i * 0.019, 0.012, -0.0055, 0, 0, 0.08 - i * 0.08)));
      }
    }
    if (heavy && lod.trim) {
      for (let i = 0; i < 5; i++) {
        const a = -0.7 + i * 0.35;
        p.add(ball(0.014, 6), brass, xf(Math.sin(a) * (S.chestHW + 0.1), S.chestY + 0.012, Math.cos(a) * (S.chestHD + 0.092)));
      }
    }
    if (lamellar) {
      // The lace that closes the cuirass. What was here was a 55 mm brass box
      // turned 45° — a flat yellow diamond dead centre on the warden's chest, the
      // one thing in `art/shots/v4/lineup.png` that reads as a debug marker rather
      // than as kit, and the reason is that a diamond is not a shape anything on a
      // suit of armour has. A lamellar cuirass laces: two iron loops with a leather
      // thong crossed through them, which is smaller, darker, and actually explains
      // how the front of the plate stays shut.
      const lz = S.chestHD + 0.046;
      for (const s of [-1, 1]) {
        p.add(ring(0.013, 0.0035, 4, 10), iron, xf(s * 0.03, S.chestY + 0.055, lz, 0.2, 0, 0));
      }
      for (const s of [-1, 1]) {
        p.add(box(0.062, 0.007, 0.005), buff, xf(0, S.chestY + 0.055, lz + 0.004, 0, 0, s * 0.42));
      }
      p.add(ball(0.008, 6), brass, xf(0, S.chestY + 0.055, lz + 0.008, 0, 0, 0, 1, 1, 0.6));
    }

    // Cloak clasp. Built here rather than on the cloak pivot because a brooch is
    // pinned to the shoulder and does not swing with the hem — and because a
    // mesh of its own would be a whole draw call for two shapes.
    if (ap.cloak !== "none") {
      p.add(ball(0.021, 10), brass, xf(-S.shoulderX * 0.72, S.shoulderY + 0.03, S.chestHD + 0.058, 0, 0, 0, 1, 1, 0.55));
      p.add(ring(0.026, 0.006, 5, 12), brass, xf(-S.shoulderX * 0.72, S.shoulderY + 0.03, S.chestHD + 0.053, 0.35, 0, 0));
    }

    // ---- the neck ----
    //
    // What was here was a 126 mm circle swept dead straight from 1.71 down to
    // 1.43, capped at the top, and it is the thing the owner was looking at when
    // he said the heads float. Three separate faults, all of them visible in
    // `art/shots/v3/lineup.png`:
    //
    //   * Its top ring sat 3 mm *below* the chin, where the head's own surface has
    //     converged to a 25 mm nub — so the cap was a lit horizontal plate 126 mm
    //     across standing out past the jaw on every side. You can see the disc's
    //     rim under the huscarl's coif.
    //   * From 1.71 to 1.60 it changed radius by 4 mm. A column, not a neck.
    //   * It was centred on the head's own axis, so the throat stood as far
    //     forward as the chin and the mandible overhung nothing. No undercut, no
    //     occlusion, no shadow — and that shadow is the only cue the eye uses to
    //     decide a head is attached rather than balanced.
    //
    // So: elliptical rather than round, tapered rather than extruded, set back in
    // z so the jaw hangs over it, and flared hard at the base into the trapezius.
    // The top three stations climb *into* the mandible and are covered there by
    // the head's own throat mass (see `headPivot` below); the two surfaces share
    // `skinDark`, so wherever a nod slides one through the other the seam does not
    // exist to be seen.
    const nHW = S.neckHW;
    const nHD = S.neckHD;
    // The taper at the top, shared with the strap sampler below so the muscles are
    // laid on the section they belong to and not on an average of it.
    const TOP_W = 0.78;
    const TOP_D = 0.82;
    p.add(shell([
      { y: S.neckTop + 0.095, hw: nHW * TOP_W, hd: nHD * TOP_D, z: -0.024 },
      { y: S.neckTop + 0.020, hw: nHW * 0.88, hd: nHD * 0.91, z: -0.017 },
      { y: S.neckRoot - 0.048, hw: nHW, hd: nHD, z: -0.007 },
      { y: S.neckBase + 0.070, hw: nHW * 1.20, hd: nHD * 1.08, z: 0 },
      { y: S.neckBase + 0.010, hw: nHW * 1.62, hd: nHD * 1.22, z: 0 },
      { y: S.neckBase - 0.055, hw: nHW * 2.10, hd: nHD * 1.30, z: 0 },
    ], lod.limb, { capTop: true }), skinDark);

    // Sternocleidomastoid. Two straps from the mastoid to the sternal notch, and
    // the cheapest 300 triangles in the file: they are what stops the throat being
    // a smooth tube, they catch the key along their outer edge, and the hollow they
    // leave between them is where the collar's shadow lands.
    //
    // Sited *on* the section rather than at a fraction of its half-width, because
    // the first attempt did the latter and vanished: a tube at 0.66 of `nHW` on an
    // ellipse 62 × 68 mm sits 12 mm inside the skin and renders nothing at all.
    // `θ` is the azimuth off dead ahead, converging toward the notch as it descends,
    // and half the tube stands proud of the surface it is laid on.
    const strap = (y: number, th: number, r: number): Knuckle => {
      const t = clamp01((S.neckTop + 0.095 - y) / 0.155);
      const hw = mix(nHW * TOP_W, nHW, t);
      const hd = mix(nHD * TOP_D, nHD, t);
      const zc = mix(-0.024, -0.007, t);
      return { x: hw * Math.sin(th), y, z: zc + hd * Math.cos(th), a: r, b: r };
    };
    for (const s of [-1, 1]) {
      const at3 = (y: number, th: number, r: number) => {
        const k = strap(y, th, r);
        k.x *= s;
        return k;
      };
      p.add(digit([
        at3(S.neckTop + 0.088, 1.25, 0.010),
        at3(S.neckTop + 0.012, 0.95, 0.011),
        at3(S.neckRoot - 0.042, 0.42, 0.009),
      ], lod.trim ? 6 : 4), skinDark);
    }
    // Laryngeal prominence. One flattened ball, and the single most recognisable
    // landmark on a man's throat — without it the front of the neck has no feature
    // between the jaw and the collar for the eye to measure the length against,
    // which is most of why 91 mm of throat was reading as a fence post.
    if (lod.trim) {
      const ly = S.neckTop + 0.040;
      const k = strap(ly, 0, 0);
      p.add(ball(0.011, 8), skinDark, xf(0, ly, k.z - 0.003, 0, 0, 0, 1.35, 1.15, 0.62));
    }
    return p;
  });

  // ==========================================================
  // ARMS — pivot at the shoulder joint
  // ==========================================================
  const grips = HAND_GRIP[cls] ?? HAND_GRIP.warden;
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
      // The three sleeve tops below all start under the shoulder cap's dome, and
      // they have to: the cap came down 23 mm this pass, and its top ring is only
      // 0.44 of its radius, so anything that used to tuck under the old crest now
      // stands out round it as a ring. The wool at y = 0.06 was doing exactly that —
      // a green hoop sitting on the pauldron.
      p.add(shell([
        { y: 0.026, hw: rSh * 1.06, hd: rSh * 1.06 },
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
          { y: 0.012, hw: rSh * 1.12, hd: rSh * 1.12 },
          { y: elbow + 0.06, hw: rEl * 1.16, hd: rEl * 1.18 },
        ], lod.limb, { wall: 0.007 }), sleeveLinen);
        p.add(shell([
          { y: 0.004, hw: rSh * 1.22, hd: rSh * 1.22 },
          { y: -0.16, hw: rSh * 1.14, hd: rSh * 1.18 },
          { y: elbow + 0.11, hw: rEl * 1.24, hd: rEl * 1.26 },
        ], lod.limb, { wall: 0.011 }), sleeve);
      }

      // The metal on the shoulder, and mail down to the elbow where the class
      // wears it. Cap sits outboard of the torso so it reads as a separate
      // piece bearing on the shoulder rather than a bulge in the chest.
      if (!bare) {
        // Down 23 mm and in by 8%. The cap used to crest at 1.607 — above the
        // cervicale — so the shoulder line stood higher than the base of the neck
        // and the two of them left a notch on each side of the throat. It also put
        // 626 mm of shoulder on a 168 mm head, and mass that far out of scale is
        // the other half of "the heads seem a little small": nothing was wrong with
        // the head, it was being out-shouted.
        const capR = rSh * (heavy ? 1.50 : 1.36);
        // The pauldron, in courses rather than as one dome.
        //
        // A single swept cap is what makes the shoulder read as one dark blob in
        // `art/shots/v4/lineup.png`: it is a smooth convex surface with exactly one
        // highlight on it and no edges anywhere, so at any distance it is a lump.
        // Real shoulder defence is lames — overlapping plates, each with a rolled
        // lower edge, each catching the key at a slightly different angle. Three of
        // them give the shoulder three tonal steps and three visible rims, and they
        // alternate between two metals so there is a value break as well as an edge.
        // Cost: three shells instead of one, in materials already on this part, so
        // the merge is unchanged and it is still one draw call per substance.
        //
        // `capAt` is the same dome the four stations used to describe, sampled as a
        // function of the drop so a course can be cut anywhere along it.
        // Crest at +46 mm, which puts the top of the shoulder defence on the
        // acromion at 0.818 of stature now that the joint under it sits at 0.795.
        // It was +62 mm off a joint at 0.775 — 20 mm *below* the anatomical
        // acromion, so the cap was doing the work of a shoulder that was not
        // there and the trapezius had to fan up to meet it.
        const CAP: Array<[number, number]> = [
          [0.046, 0.44], [0.018, 0.86], [-0.026, 1.0], [-0.060, 0.96], [-0.092, 0.82],
        ];
        const capAt = (y: number): number => {
          let i = 0;
          while (i < CAP.length - 2 && y < CAP[i + 1][0]) i++;
          const t = clamp01((CAP[i][0] - y) / (CAP[i][0] - CAP[i + 1][0]));
          return capR * mix(CAP[i][1], CAP[i + 1][1], t);
        };
        const lames = lod.trim ? 3 : 2;
        for (let i = 0; i < lames; i++) {
          const yA = mix(0.046, -0.092, i / lames);
          // Each course runs a sixth of a lame past its own share, so it laps the one
          // below. That overlap is the edge you can see.
          const yB = mix(0.046, -0.092, (i + 1) / lames) - 0.138 / lames * 0.16;
          const mid = (yA + yB) * 0.5;
          p.add(shell([
            { y: yA, hw: capAt(yA), hd: capAt(yA) * 1.03 },
            { y: mid, hw: capAt(mid) * 1.015, hd: capAt(mid) * 1.045 },
            { y: yB, hw: capAt(yB) * 1.03, hd: capAt(yB) * 1.06 },
          ], lod.limb, { power: 2.2, wall: 0.010, capTop: i === 0 }),
            // The value break between courses only alternates where `iron` is
            // already on this part — the rims below put it there on high and
            // medium. On low there are no rims, so alternating would buy one extra
            // draw call per arm for a distinction two pixels wide on a phone; the
            // three courses still read, off their own overlap.
            lod.trim && i % 2 === 1 ? iron : (lamellar ? steel : mail));
          if (lod.trim) {
            // Rolled rim on each course's lower edge, which is what actually reads at
            // twenty metres — a rim is a specular line and a plate is not.
            p.add(ring(capAt(yB) * 1.02, 0.0062, 4, 12), lamellar ? steel : iron,
              xf(0, yB, 0, Math.PI / 2, 0, 0, 1, 1, 1.03));
          }
        }
        if (lod.trim) {
          for (let i = 0; i < 4; i++) {
            const a = -0.9 + i * 0.6;
            p.add(ball(0.008, 6), brass, xf(Math.sin(a) * capR * 0.86, 0.022, Math.cos(a) * capR * 0.9));
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
        ], lod.limb, { power: 2.0, wall: 0.016, capTop: true }), pelt(2 * Math.PI * rSh * 1.45));
        p.add(ring(rSh * 1.02, 0.011, 5, 12), brass, xf(0, -0.14, 0, Math.PI / 2, 0, 0));
        if (lod.trim) p.add(ring(rSh * 0.96, 0.009, 5, 12), brass, xf(0, -0.2, 0, Math.PI / 2, 0, 0));
      }

      // Bracer over the forearm, buckled. It stops at the wrist, not 28 mm short of
      // it: that gap was 28 mm of bare skin between the leather and the back of the
      // hand, and because the hand is the other side of it, it read as a break in
      // the arm rather than as an exposed wrist. A bracer laced onto a forearm ends
      // at the carpus, which is where the hand starts. The band of bare forearm the
      // kit deliberately shows is still there — it is above the bracer, between the
      // linen cuff and the leather, where a pushed-up sleeve leaves it.
      p.add(shell([
        { y: elbow - 0.07, hw: rElB * 1.16, hd: rElB * 1.2 },
        { y: wrist + 0.075, hw: rWr * 1.36, hd: rWr * 1.34 },
        { y: wrist + 0.002, hw: rWr * 1.24, hd: rWr * 1.22 },
      ], lod.limb, { wall: 0.01 }), robed ? buff : hide);
      if (lod.trim) {
        for (let i = 0; i < 3; i++) {
          const y = mix(elbow - 0.07, wrist + 0.01, (i + 0.5) / 3);
          p.add(box(0.014, 0.018, 0.008), brass, xf(side * rWr * 1.36, y, 0.006, 0, side * 1.4, 0));
        }
        // Wrist ring on the bracer's lower rim. A hem you can see is what stops
        // leather-onto-skin reading as a paint boundary. In brass rather than buff
        // because brass is already on this part and buff is not — one extra
        // substance on a limb is one extra draw call per arm per warrior, and a
        // fitting is worth having, a sixteenth of a millisecond is not.
        p.add(ring(rWr * 1.26, 0.005, 4, 10), brass, xf(0, wrist + 0.008, 0, Math.PI / 2, 0, 0, 1, 1, 0.98));
      }
      if (robed) {
        p.add(box(0.006, 0.05, 0.008), rune, xf(side * rWr * 1.3, wrist + 0.07, 0.004, 0, side * 1.5, 0));
      }

      // The fist, rotated onto the axis the weapon will run along. `reach` and
      // `lead` are where the wrist is in the fist's own frame — resolved here
      // rather than guessed in the builder, because the hand mount's 28 mm forward
      // offset and the grip pitch both feed it. Without them the palm stopped
      // 33 mm short of the forearm and the hand read as detached, which is half
      // of why it read as a mitten.
      const cp = Math.cos(GRIP_PITCH);
      const sp = Math.sin(GRIP_PITCH);
      const fist = fistGeometry(lod, B.limb, {
        // Distance up the fist's own +Y to the forearm's cap. The remaining 5 mm
        // of along-the-shaft offset is dropped: it is a third of a knuckle and the
        // wrist station is a cone, not a joint.
        reach: sp * S.gripDrop + cp * 0.028,
        lead: 0.006,
        mirror: side < 0,
        // `armPivots[0]` is the weapon arm; the off hand gets whatever that class
        // carries there, or an open hand when it carries nothing. A hand with
        // nothing in it clenched on the same imaginary shaft as the weapon hand
        // was a fist gripping air, which reads as a cramp rather than as a guard.
        grip: side > 0 ? grips.main : grips.off,
      });
      const hand = fistPlacement(GRIP_PITCH, side * 0.006, grip, 0.028);
      p.add(fist.skin, skin, hand.clone());
      if (fist.warm) p.add(fist.warm, skinWarm, hand.clone());
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
  // The skull and the man wearing it, in one handle. Everything on the head is
  // sampled through it, which is what keeps a helm cut for a heavy brow actually
  // sitting on that brow rather than on the average of all four classes.
  const K: Skull = { R, F: face };
  const faceMats: FaceMaterials = {
    skin, shade: skinDark, warm: skinWarm, sclera, iris, dark, lash: hair,
  };
  const skullY = S.headY - S.neckTop;
  const helmed = ap.helm === "iron" || ap.helm === "nasal" || ap.helm === "spectacle" || ap.helm === "crowned";

  emit("head", headPivot, () => {
    const p = new Part();
    const place = xf(0, skullY, 0);

    p.add(headGeometry(K, lod.headU, lod.headV), skin, place.clone());

    // ---- the jaw / throat transition ----
    //
    // The single most valuable shape on the whole warrior, and until this pass it
    // did not exist. The skull's displacement field tapers to a point at the chin,
    // and the neck was a separate cylinder starting below it — so head and body met
    // at a butt joint with a visible plate between them, and no part of the mandible
    // overhung anything.
    //
    // This is the submandibular mass: the soft floor that runs from behind the chin
    // back and down into the throat. Three properties earn their keep, in order:
    //
    //   1. It is *narrower than the jaw above it* (55 mm against 76 mm at 1.814) and
    //      *46 mm behind the chin's front*, so the mandible's lower border overhangs
    //      it all the way round. That overhang is the occlusion shadow, and the
    //      shadow is what the eye actually reads as "attached".
    //   2. It tucks in as it descends, so its upper band faces down rather than out
    //      and takes almost no key light even before AO gets to it.
    //   3. It lives on the head pivot, because a jaw belongs to a head. It crosses
    //      the torso's neck shell around 1.75 and the two share `skinDark`, so the
    //      intersection curve is a tonal break instead of a seam — and that curve
    //      rises from under the chin toward the ears, which is a jawline.
    // The 0.60 band is bounded above by a full beard: the beard patch's lower rim
    // lands at 50 mm off the midline and this must stay inside it, or the throat
    // surfaces through the whiskers in a thin sliver.
    p.add(shell([
      { y: skullY - 0.048, hw: R.x * 0.66, hd: R.z * 0.62, z: -0.013 },
      { y: skullY - 0.105, hw: R.x * 0.60, hd: R.z * 0.57, z: -0.019 },
      { y: skullY - 0.160, hw: R.x * 0.60, hd: R.z * 0.57, z: -0.021 },
      { y: skullY - 0.230, hw: R.x * 0.62, hd: R.z * 0.58, z: -0.021 },
    ], lod.limb, { capTop: true, capBottom: true }), skinDark);

    // Ears, set back where the jaw hinges rather than out on the cheek, with a
    // concha in the warm tone — an ear lit from behind is the reddest thing on a
    // head and the cheapest place to buy back the translucency skin has.
    //
    // Down 22 mm and up in size. An ear runs from the eye line to the base of the
    // nose, which the layout rewrite moved 27 and 32 mm respectively; left at
    // `skullY - 0.004` they sat level with the brow, which is the one place on a
    // head an ear never is.
    // An ear is a rim round a hollow, and until this pass it was two scaled
    // spheres — which at any bearing renders as a bean stuck to the skull, and
    // which every panel read as "there is no ear". Four shapes fix that, and the
    // order they matter in is: the **helix** (the rim, an open arc — an ear's
    // whole outline is that one curve and it must not close at the bottom), the
    // **concha** in the shade tone (a hollow, not a hole: the tone does the work
    // the geometry cannot at 60 mm), the **antihelix** as a second, shorter arc
    // inside it, and the **lobe**. The rim stands 13 mm off the skull with a bowl
    // behind it, which is the crevice an SSAO pass can actually find — none of
    // this is painted.
    const earY = skullY + (Y_EYE + Y_NOSE) * 0.5 * R.y - 0.004;
    for (const s of [-1, 1]) {
      // Ear space: +Y up the ear, +X toward the face, +Z out of the skull.
      //
      // The sign gymnastics are unavoidable and worth one sentence. Two ears are
      // mirror images, a rotation cannot make one out of the other, and a
      // negative scale would turn every surface inside out — the same trap
      // `mirrorZ` exists for on the hands. So `s` flips the *authored* in-plane
      // axis instead: `-s * ex` puts +X toward the face on both sides, and the
      // rake follows it as `-s * roll`.
      const ear = (
        ex: number, ey: number, ez: number, roll: number,
        kx: number, ky: number, kz: number,
      ) => new THREE.Matrix4()
        .makeTranslation(s * (R.x * 1.0), earY, -0.024)
        .multiply(new THREE.Matrix4().makeRotationY(s * Math.PI / 2))
        .multiply(xf(-s * ex, ey, ez, 0, 0, -s * roll, kx, ky, kz));
      // The concha, and it is built first because it is what the rest hangs on:
      // a bowl whose inner half is buried in the skull, so the ear is *attached*
      // rather than perched. In the form-shadow tone, because at 60 mm the
      // hollow cannot out-shade its own rim on geometry alone — and because that
      // rim now stands 12 mm off the skull with a bowl behind it, which is a
      // crevice a screen-space AO pass can find on its own.
      p.add(ball(0.0175, 9), skinDark, ear(-0.002, -0.002, -0.004, 0.22, 1.0, 1.55, 0.66));
      // Helix: 4.5 rad of rim, centred up-and-back and left open at the front
      // bottom where a real one runs down into the tragus instead of closing
      // into a ring. An ear's whole outline is this one curve.
      const arc = 4.9;
      p.add(new THREE.TorusGeometry(0.0235, 0.0048, 5, 14, arc), skin,
        new THREE.Matrix4()
          .makeTranslation(s * (R.x * 1.0), earY, -0.024)
          .multiply(new THREE.Matrix4().makeRotationY(s * Math.PI / 2))
          .multiply(xf(0, 0, 0.006, 0, 0, Math.PI / 2 - s * 0.85 - arc / 2, 0.84, 1.34, 0.86)));
      // The lobe, warm because it is the thinnest flesh on the head and the
      // place a backlight actually passes through.
      p.add(ball(0.0105, 7), skinWarm, ear(0.003, -0.028, 0.002, 0, 0.62, 0.95, 0.80));
      if (lod.trim) {
        // Antihelix — the second, shorter ridge inside the rim, and the thing
        // that stops the bowl reading as a thumbprint pressed into the skull.
        p.add(new THREE.TorusGeometry(0.0105, 0.0033, 4, 9, 3.2), skin,
          new THREE.Matrix4()
            .makeTranslation(s * (R.x * 1.015), earY + 0.001, -0.024)
            .multiply(new THREE.Matrix4().makeRotationY(s * Math.PI / 2))
            .multiply(xf(0, 0, 0, 0, 0, Math.PI / 2 - s * 0.9 - 1.6, 0.9, 1.2, 0.7)));
        // Tragus: three millimetres of flap over the canal, and the one part of
        // an ear that faces forward — so it is the part a front fill finds, and
        // the part that tells the eye where the opening is.
        p.add(ball(0.0062, 6), skin, ear(0.013, -0.008, 0.001, 0, 0.7, 1.2, 0.85));
      }
    }

    // Eyes, mouth, and the tonal map. These three are the whole defect list for
    // the face, and they are built out of line so the read can be tuned without
    // wading through kit.
    addEyes(p, K, lod, place, faceMats);
    addMouth(p, K, lod, place, faceMats);
    addFaceTones(p, K, lod, place, faceMats);

    // ---- the nostrils ----
    //
    // Explicit geometry, for the same reason the eyes and the mouth are: a
    // nostril is 8 mm across and the surface field is sampled on a 17 mm grid
    // even at the row count this head now carries, so written as a gaussian it
    // aliases to nothing at all. Two dark ellipsoids sunk into the underside of
    // the nose survive any sampling, and they are what tells the eye that the
    // mass above them is a nose and not a swelling — which is the difference
    // between the frame the panels scored and a face.
    //
    // Sited by probing the field rather than by a table: the base of the nose
    // moves with `F.nose`, `F.nostril` and `F.deep`, and a nostril that misses
    // its own nose by 4 mm is worse than none.
    if (lod.trim) {
      const sub = faceSurface(K, dirOf(0, lat(Y_NOSE - 0.020), _d), new THREE.Vector3());
      for (const s of [-1, 1]) {
        // Ten segments, not six: at six a scaled sphere this small is a faceted
        // lozenge and renders as a dark rectangle, which on the underside of a
        // nose reads as a slot cut in it. Sunk far enough back that only the
        // opening clears the alar wall.
        p.add(ball(0.0062, 10), dark, xf(
          s * 0.0094 + K.F.asym, skullY + sub.y + 0.0018, sub.z - 0.0090,
          0.52, s * 0.26, 0, 0.74, 0.42, 1.2,
        ));
      }
    }

    // Brows, conformed to the ridge and angled down toward the temple. Thin: at
    // 4 mm they were two black slabs, which is the one thing worse than none.
    // The inner end sits lower than the outer, which is what reads as a scowl
    // rather than as surprise — and a warrior should not look surprised.
    //
    // Sat between the brow ridge and the eye, which is where a brow goes and is
    // 30 mm below where these were: at v ≈ 0.15–0.215 they were on the *ridge*,
    // and with the ridge itself 34 mm above head centre the pair of them read as
    // one wide band across the middle of the forehead.
    for (const s of [-1, 1]) {
      const inner = lat(Y_EYE + 0.20);
      const outer = lat(Y_EYE + 0.135);
      // Thinned to nothing at the outer end as well as arched. A brow of constant
      // height is a bar; a brow that tapers off toward the temple is a brow, and it
      // is the taper rather than the arch that stops it reading as drawn on.
      const arc = (u: number) => mix(inner, outer, clamp01((Math.abs(u) - 0.10) / 0.52));
      // Tapered at *both* ends, not just the temple one. Held full height at the
      // inner end, a brow is a bar with a squared-off inboard corner sitting 4 mm
      // proud of the forehead — two dark slabs, which is what the render showed —
      // and squared-off dark corners on a face read as injury. It also stands much
      // closer to the skin now: brow hair lies on a ridge, it does not perch on
      // one, and at 3.8 mm of lift with a 2.2 mm rim the patch was drawing its own
      // bright outline (see `patch`).
      const half = (u: number) => {
        const t = clamp01((Math.abs(u) - 0.10) / 0.52);
        return 0.040 * (1 - 0.70 * Math.pow(t, 1.4)) * smooth(0, 0.16, t);
      };
      p.add(headWear(K, {
        u0: s * 0.09, u1: s * 0.62,
        v0: (u) => arc(u) - half(u),
        v1: (u) => arc(u) + half(u),
        nu: 7, nv: 1, lift: (_u, v) => 0.0011 + 0.0011 * (1 - v), thick: 0.0009,
      }), hair, place.clone());
    }

    // ---- hair ----
    if (ap.hairStyle !== "shaved") {
      const crop = ap.hairStyle === "short";
      p.add(headWear(K, {
        u0: 0, u1: Math.PI * 2, wrapU: true,
        // High over the forehead, low at the nape, receding at the temples —
        // and volume that builds toward the crown rather than at the hairline.
        // A hairline is a ragged thing. The cos(5u) term is what stops it
        // reading as a swim cap pulled on straight.
        v0: (u) => (crop ? 0.30 : 0.22) + 0.24 * Math.cos(u) - 0.05 * Math.cos(u * 2) + 0.035 * Math.cos(u * 5 + 1.1),
        v1: () => Math.PI / 2 - 0.02,
        nu: Math.max(8, lod.shellU), nv: lod.shellV,
        // Flattened under a helm, because a helm flattens hair. This is not a
        // detail: the bowl has come down 8 mm to sit on the skull rather than
        // hover over it, and loose hair at 20 mm of crown volume would push
        // straight through it.
        lift: (_u, v) => (helmed ? 0.002 + 0.003 * v : 0.006 + 0.014 * v),
        thick: helmed ? 0.004 : 0.007,
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
    //
    // The stubble was the largest single cause of the flat face, and not because
    // of its colour. Its top edge ran at v = −0.44 at the midline — which, on the
    // old layout, was immediately under the *upper* lip — and it was a 4.5 mm
    // smooth shell over a 5×3 grid. So it buried the lower lip, the mentolabial
    // shelf, the chin, the nasolabial folds and both lower cheeks under one
    // untextured surface, in a brown whose value at this exposure is close to skin.
    // The whole lower two thirds of the face in `art/shots/v4/portrait.png` is that
    // patch, not skin, and nothing sculpted underneath it could possibly show.
    //
    // Stubble is now a *tone*, not a shell: 1.2 mm of lift on a grid fine enough to
    // follow the field, starting below the lower lip so the mouth stays skin, and
    // reaching the sideburn at the ear the way a jawline beard does. A full beard
    // keeps its volume — that is the point of a full beard — but its top edge has
    // come down to the lip line as well, so the nose, the philtrum and the fold
    // beside it stay visible.
    if (ap.beardStyle !== "none") {
      const full = ap.beardStyle !== "short";
      // One patch, not two. The top edge climbs from the lip line at the midline
      // to the sideburn at the ear, which is where a beard's edge actually runs;
      // the separate moustache bar this replaces read as a strip of tape.
      // The rise is held back until the last third of the arc, and it stops below
      // the cheekbone rather than at the eye line. Ramped from 0.25 and topping out
      // at −0.03, the stubble climbed to the temple across almost the whole cheek
      // and rendered as a dark trapezoid over the side of the face.
      //
      // Two harmonics, and three times the amplitude on stubble. This boundary is
      // the "hard elliptical material seam ringing the jaw" the panel logged, and
      // it is a boundary between two *materials* — wool on skin — so nothing but
      // its own shape can break the tonal step at it. One cosine at one frequency
      // gives a scalloped ellipse, which at sixty pixels is still an ellipse. A
      // beard's edge is where hair thins out, not where it was cut, and the only
      // honest way to say that with a patch rim is to make the rim disagree with
      // itself. The second term stays above Nyquist at `nu` = 11.
      const cheek = (u: number) => {
        const t = smooth(0.55, 1.20, Math.abs(u));
        const y = mix(full ? Y_LIP + 0.06 : Y_LIP - 0.155, full ? -0.19 : -0.13, t);
        return lat(y) + (full ? 0.030 : 0.055) * Math.cos(u * 6.5)
          + (full ? 0.012 : 0.026) * Math.cos(u * 11.3 + 1.9);
      };
      // The lower silhouette, and this is what was reading as "a doormat strapped
      // to the jaw". It used to be the constant latitude −1.05 across the entire
      // width of the face: a horizontal circle round the jaw, drawn at 23 mm of
      // lift with a 10 mm rim strip on the end of it. So the beard finished in a
      // hard lit ledge running ear to ear — a rectangle with two rounded corners,
      // which is exactly what the panel described. A beard hangs longest under the
      // chin, swings up under the jaw toward the ear, and is *ragged*; the lobe
      // term below is worth more than the arc, because a smooth curve at this
      // scale still reads as something cut to a pattern.
      const hang = (u: number) => {
        const a = Math.abs(u);
        const arc = (full ? -1.27 : -1.06) + (full ? 0.52 : 0.34) * Math.pow(smooth(0.1, 1.24, a), 1.35);
        const rag = smooth(0.04, 0.5, a);
        return arc + (full ? 0.052 : 0.040) * Math.cos(u * 4.7 + 0.6) * rag
          + (full ? 0.016 : 0.020) * Math.cos(u * 9.1 - 0.8) * rag;
      };
      p.add(headWear(K, {
        // Round to the ear, so the patch's own u edge is behind the sideburn rather
        // than standing as a hard vertical line down the middle of the cheek — and
        // pinched shut there, because a patch that runs to its u limit at full
        // height ends in a vertical cut whatever the top edge does. Closing v0 onto
        // v1 turns the far end into a sideburn instead.
        u0: -1.24, u1: 1.24,
        v0: (u) => mix(hang(u), cheek(u) - 0.03, smooth(0.98, 1.24, Math.abs(u))),
        v1: cheek,
        nu: Math.max(11, lod.shellU + 4), nv: Math.max(5, lod.shellV + 1),
        // Thickness dies at *both* boundaries rather than being thickest at the
        // one that is in silhouette. `patch` closes every boundary with a rim
        // strip whose normal points along the surface, so a patch that ends at
        // full lift draws its own outline as a bright band — the same defect
        // `addFaceTones` records, except here the band was 10 mm and in the
        // silhouette. Peaked at a third of the way up, which is where the mass of
        // a beard actually is, and at 2 mm of lift on the boundary the rim strip
        // is inside the skin and cannot be seen at all.
        lift: (_u, s) => (full
          ? 0.002 + 0.016 * Math.pow(Math.sin(Math.PI * Math.pow(clamp01(s), 0.55)), 1.15)
          : 0.0004 + 0.0012 * Math.sin(Math.PI * clamp01(s))),
        thick: full ? 0.005 : 0.0007,
      }), beard, place.clone());
      // Philtrum gap: a real moustache parts under the nose. Two short patches
      // rather than one bar is what sells it.
      if (full) {
        // Each half is a hump, not a slab. As a rectangle in (u, v) at a flat
        // 8 mm of lift with a 6 mm rim, these rendered as two hard blocks floating
        // over the mouth with daylight round them — the same failure as the mouth
        // corners and for the same reason (see `patch`). Taking the lift to
        // nothing on all four boundaries buries every rim strip in the skin, and
        // what is left is a moustache that grows out of the lip and thins toward
        // the corner.
        const swell = (u: number, v: number) =>
          0.0015 + 0.008 * Math.sin(Math.PI * clamp01(v))
          * Math.sin(Math.PI * clamp01((Math.abs(u) - 0.035) / 0.345));
        // A leaf, not a rectangle. Both v bounds converge at both ends of u, so
        // the half pinches shut against the philtrum on one side and against the
        // mouth corner on the other — with parallel bounds it was a quadrilateral
        // with four visible corners sitting over the lip, which is a postage stamp
        // and not a moustache.
        const mTop = lat(Y_NOSE - 0.035);
        const mBot = lat(Y_LIP + 0.085);
        const mMid = (mTop + mBot) * 0.5;
        const mHalf = (mTop - mBot) * 0.5;
        const leaf = (u: number) =>
          mHalf * Math.pow(Math.sin(Math.PI * clamp01((Math.abs(u) - 0.025) / 0.365)), 0.5);
        const droop = (u: number) => mMid - 0.055 * smooth(0.06, 0.38, Math.abs(u));
        for (const s of [-1, 1]) {
          p.add(headWear(K, {
            u0: s * 0.025, u1: s * 0.39,
            v0: (u) => droop(u) - leaf(u),
            v1: (u) => droop(u) + leaf(u),
            nu: 6, nv: 2, lift: swell, thick: 0.004,
          }), beard, place.clone());
        }
      }
      // The hanging mass, for the three styles that have one. Every station has
      // dropped 30 mm: the menton is at −145 mm and these used to start at −100,
      // i.e. inside the chin, so a "full" beard's hang emerged from the middle of
      // the jaw rather than from under it.
      if (ap.beardStyle === "full") {
        // Five stations rather than three, and it swells before it tapers. A
        // three-station taper is a cone, and a cone under a jaw reads as a beak;
        // the belly at −180 mm is what makes it hang.
        p.add(shell([
          { y: skullY - 0.126, hw: 0.066, hd: 0.054, z: 0.038 },
          { y: skullY - 0.180, hw: 0.071, hd: 0.058, z: 0.038 },
          { y: skullY - 0.232, hw: 0.058, hd: 0.048, z: 0.034 },
          { y: skullY - 0.278, hw: 0.036, hd: 0.031, z: 0.028 },
          { y: skullY - 0.302, hw: 0.014, hd: 0.013, z: 0.023 },
        ], lod.limb, { power: 2.15, capBottom: true }), beard);
      } else if (ap.beardStyle === "forked") {
        for (const s of [-1, 1]) {
          p.add(shell([
            { y: skullY - 0.130, hw: 0.036, hd: 0.032, z: 0.040 },
            { y: skullY - 0.220, hw: 0.03, hd: 0.026, z: 0.032 },
            { y: skullY - 0.290, hw: 0.014, hd: 0.013, z: 0.022 },
          ], 8, { capBottom: true }), beard, xf(s * 0.032, 0, 0, 0, 0, -s * 0.18));
        }
      } else if (ap.beardStyle === "braided") {
        for (let i = 0; i < 4; i++) {
          p.add(ball(0.03 - i * 0.004, 8), beard, xf(0, skullY - 0.132 - i * 0.052, 0.040 - i * 0.004, 0, 0, 0, 1, 1.1, 1));
        }
        p.add(ring(0.021, 0.005, 4, 10), brass, xf(0, skullY - 0.265, 0.026, Math.PI / 2, 0, 0));
      }
    }

    // ---- war paint, lying on the skin ----
    // Latitudes rewritten with the rest of the face: at v = 0.08–0.2 the Raven
    // Cross's bar was across the forehead rather than across the eyes, which is
    // where a man paints it and the only place it means anything.
    //
    // Down from 2.2 mm of lift and 1.6 mm of thickness to 0.9 and 0.4, which is
    // what `addFaceTones` already learned the hard way: `patch` closes a boundary
    // with a rim strip whose normal points along the skin rather than out of it,
    // so paint 1.6 mm thick draws its own outline in a surface facing the key far
    // more squarely than the cheek does — a hard bright line round the whole
    // shape, sub-pixel, and therefore stippling. Paint is pigment. It has no
    // thickness worth seeing and it should not be given one.
    if (ap.warPaint !== "none") {
      const paint = M.standard(ap.warPaint === "cross" ? 0x1d2f52 : 0x6e1a11, 0.92);
      if (ap.warPaint === "stripes") {
        for (let i = 0; i < 3; i++) {
          const u = -0.62 + i * 0.2;
          p.add(headWear(K, {
            u0: u - 0.045, u1: u + 0.045,
            v0: () => lat(Y_LIP - 0.06), v1: () => lat(Y_BROW + 0.14),
            nu: 1, nv: 4, lift: () => 0.0009, thick: 0.0004,
          }), paint, place.clone());
        }
      } else if (ap.warPaint === "cross") {
        p.add(headWear(K, {
          u0: -0.075, u1: 0.075, v0: () => lat(Y_CHIN + 0.09), v1: () => lat(Y_BROW + 0.32),
          nu: 1, nv: 5, lift: () => 0.0009, thick: 0.0004,
        }), paint, place.clone());
        p.add(headWear(K, {
          u0: -0.62, u1: 0.62,
          v0: () => lat(Y_EYE - 0.075), v1: () => lat(Y_EYE + 0.075),
          nu: 5, nv: 1, lift: () => 0.0009, thick: 0.0004,
        }), paint, place.clone());
      } else {
        p.add(headWear(K, {
          u0: -1.45, u1: 0.02, v0: () => -0.9, v1: () => 0.9,
          nu: Math.max(4, lod.shellU - 4), nv: lod.shellV,
          lift: () => 0.0009, thick: 0.0004,
        }), paint, place.clone());
      }
    }

    // ---- helms ----
    //
    // A note on `lift`, because every number below moved this pass. A helm is worn
    // over 8–12 mm of padded liner, so its *inner* surface — `lift - thick` — is
    // what has to land on the skull. The bowl was lifted 21 mm and 8 mm thick,
    // which put 13 mm of air between iron and forehead all round, and the brow band
    // was worse: 26 mm out, 10 mm thick, 16 mm of daylight under the rim. That gap
    // is the "helm sitting proud of the skull" read — the helm was not on the head,
    // it was parked above it. Everything here is now within a liner's thickness of
    // the skin it is sampled from.
    if (helmed) {
      // Where the iron stops and the face begins. The band used to run from
      // v = 0.245 to 0.44, and the brow ridge used to sit at y = 0.30 — so the band
      // was *on top of the ridge*, and the one shape on the head whose whole job is
      // to overhang the eye sockets was under a steel plate. Nothing on the face
      // could throw a shadow, and the frame showed a reddish band (the brows) under
      // a blown white one (the band) with no structure between them. The layout
      // rewrite drops the ridge to y = 0.19; this lifts the band clear of it, and
      // the 11 mm of bare forehead between the two is what a spangenhelm shows.
      // How low the class wears its helmet, and how much bowl stands above it.
      // This is the cheapest silhouette differentiator on the head: a bowl pulled
      // down to the brow with a deep dome is a different outline from a cap sitting
      // on the crown, at any distance and from behind. See `BuildTrait.bowl`.
      const bandLo = lat(Y_BROW + mix(0.15, 0.05, clamp01((B.bowl - 0.76) / 0.36)));
      const bandHi = bandLo + 0.20;
      // Spangenhelm bowl. The dome term is what gives the huscarl a deep round
      // helm and the berserker a low skull-cap out of the same six lines.
      // Kept inside a liner's thickness of the skull even at its most domed: the
      // bowl's *inner* surface is `lift - thick`, and a helm parked more than
      // about 15 mm off the head reads as parked rather than worn. The class
      // spread lives in where the band sits and what stands on the crown, not in
      // how far the iron floats.
      const crest = 0.014 + 0.008 * B.bowl;
      p.add(headWear(K, {
        u0: 0, u1: Math.PI * 2, wrapU: true,
        v0: () => bandLo + 0.015, v1: () => Math.PI / 2 - 0.02,
        nu: Math.max(10, lod.shellU + 2), nv: lod.shellV,
        lift: (_u, v) => mix(0.013, crest, v * v),
        thick: 0.007,
      }), iron, place.clone());
      // Brow band, sized off the bowl rather than off the skull. Its lower edge
      // stands 8 mm further out than its top, so the rim is a brim that overhangs
      // the forehead instead of a hoop lying flat on it — 8 mm of overhang under a
      // key at 60° is a shadow line across the top of the brow, and that line is
      // the boundary the whole face composition hangs off.
      // In iron, not steel. The band is the largest single piece of metal in the
      // portrait framing and at `steel`'s roughness 0.3 / metalness 1 it returned the
      // sky as one blown white bar straight across the head — visible in every
      // helmeted warrior in `art/shots/v4`. The ribs, the comb and the spectacle
      // plate keep the polish, so the helm still has bright metal on it; it is just
      // no longer the brightest thing in the frame.
      p.add(headWear(K, {
        u0: 0, u1: Math.PI * 2, wrapU: true,
        v0: () => bandLo, v1: () => bandHi,
        nu: Math.max(10, lod.shellU + 2), nv: 1,
        lift: (_u, v) => 0.016 + 0.008 * (1 - v),
        thick: 0.009,
      }), iron, place.clone());
      if (lod.trim) {
        for (let i = 0; i < 4; i++) {
          const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
          p.add(headWear(K, {
            u0: a - 0.05, u1: a + 0.05,
            v0: () => bandHi - 0.02, v1: () => Math.PI / 2 - 0.05,
            nu: 1, nv: 3, lift: () => 0.018, thick: 0.005,
          }), steel, place.clone());
        }
      }
      if (ap.helm !== "iron") {
        // Nasal, and this is the pale slab straight down the middle of the face in
        // `art/shots/v4/portrait.png`. Two things were wrong with it. It was 48 mm
        // across at the top and 30 at the nose — a nasal is 20 to 25 — and its front
        // face sat at 165 mm where the nose tip was at 143, so it stood 22 mm proud
        // of the nose it was supposed to be guarding and hid the dorsum, the
        // philtrum and the upper lip behind it. And it was `steel`: roughness 0.3 at
        // metalness 0.9, which returns the sky's orange band in one hit and made it
        // the brightest object on the warrior. Narrower, following the profile the
        // sculpt now actually has — clear of the bridge, kissing the tip, tucked
        // under the nostril — and in iron, so it reads as a bar bolted to a helmet.
        // Third pass on this bar, and the first one that measures it against the
        // nose instead of against itself. It was 31 mm across with its front face
        // at z = 0.152 while the nose tip stood at 0.139 — 13 mm *proud of the
        // nose it guards*, over a 12 mm air gap, running from the brow band down
        // past the mouth. So it was a plank hovering in front of the face: the
        // largest flat surface in the portrait framing, square to the camera and
        // square to the bounce light, which is why it returned more luma than any
        // other object on the warrior however dark its albedo went. Making it
        // darker was never going to work — it was winning on *geometry*.
        //
        // It is now sampled off the face field like every other piece of kit on
        // this head, so it lies on the dorsum with a liner's clearance and cannot
        // float; it is 21 mm across, which is what the finds are; it stops at the
        // subnasale instead of covering the philtrum and the upper lip; and its
        // section is a rounded rib rather than a slab, so it rolls a highlight
        // instead of returning one flat value. The nose's own alae now show on
        // both sides of it, which is the point of a nasal being narrow.
        const nasal: Station[] = [];
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          const on = faceSurface(K, dirOf(0, lat(mix(Y_BROW + 0.10, Y_NOSE + 0.01, t)), _d), new THREE.Vector3());
          nasal.push({
            y: skullY + on.y,
            hw: mix(0.0126, 0.0088, t),
            hd: 0.0042,
            // Flush with the brow band at the top, clearing the dorsum by a
            // rivet's thickness the rest of the way down.
            z: on.z + mix(0.019, 0.009, t),
          });
        }
        p.add(shell(nasal, 8, { power: 2.6, capTop: true, capBottom: true }), iron);
        if (lod.trim) {
          // Two rivet domes where the bar is pinned through the brow plate, in the
          // helm's polished steel rather than its iron.
          //
          // Partly kit and partly a tonal-range obligation. The second panel
          // measured this build failing the 8-bucket floor on *highlight
          // structure*, with nothing above code 112 occupying even 0.2% of the
          // portrait — and the one object that was reaching those buckets was this
          // nasal, as a flat plank square to the light. Narrowing it is right and
          // costs those pixels; a pair of 8 mm domes and the bar's own rolled
          // section give them back as a rolled highlight and two specular dots,
          // which is the same luma occupying a shape. Steel is already on this part
          // for the helm's ribs, so it is not a draw call.
          for (const st of nasal.slice(0, 2)) {
            p.add(ball(0.0042, 6), steel, xf(0, st.y - 0.004, (st.z ?? 0) + 0.0038, 0, 0, 0, 1, 1, 0.7));
          }
        }
        // The plate it is riveted through. A flat 50 mm box at a fixed z could not
        // do this job: the bowl curves away 8 mm across that span, so the box's
        // corners stood outside the helm's own silhouette — and because the idle
        // look-around swings the head up to 9°, in `art/shots/v4/portrait.png` it
        // reads as a strip of gold tape stuck to the side of the bowl rather than as
        // a rivet plate on the brow. Conformed to the skull like the band it sits
        // on, 4 mm further out than the band so the two still read as two pieces,
        // it cannot leave the surface at any yaw.
        p.add(headWear(K, {
          u0: -0.13, u1: 0.13,
          v0: () => bandLo - 0.01, v1: () => bandHi - 0.015,
          nu: 3, nv: 1, lift: () => 0.026, thick: 0.006,
        }), iron, place.clone());
      }
      if (ap.helm === "spectacle" || ap.helm === "crowned") {
        // Spectacle plate: brows in iron with the eye holes cut under them. Sits
        // proud of the face so the sockets stay in shadow behind it — and now sits
        // on the brow rather than 30 mm above it.
        for (const s of [-1, 1]) {
          p.add(headWear(K, {
            u0: s * 0.1, u1: s * 0.66,
            v0: () => lat(Y_EYE + 0.115), v1: () => lat(Y_BROW + 0.07),
            nu: 4, nv: 2, lift: () => 0.018, thick: 0.008,
          }), steel, place.clone());
        }
        // Cheek guards, hinged off the band. They run from the band down past the
        // cheekbone to the jaw, and they stop short of the mouth: the whole point of
        // the previous pass was to stop kit bricking up the face, and a guard that
        // reaches the chin undoes it.
        for (const s of [-1, 1]) {
          p.add(headWear(K, {
            u0: s * 0.42, u1: s * 1.02,
            v0: () => lat(Y_LIP + 0.02), v1: () => bandLo + 0.02,
            nu: 3, nv: 3, lift: () => 0.018, thick: 0.008,
          }), iron, place.clone());
        }
      }
      if (ap.helm === "crowned") {
        // Gilded circlet, sized to sit on the bowl rather than to hover round it.
        const cr = R.x + 0.023;
        const cz = (R.z + 0.023) / cr;
        const cy = skullY + R.y * 0.34;
        p.add(ring(cr, 0.01, 5, 18), brass, xf(0, cy, 0, Math.PI / 2, 0, 0, 1, 1, cz));
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.3;
          p.add(rod(0.002, 0.01, 0.042, 4), brass, xf(Math.sin(a) * cr * 0.95, cy + 0.026, Math.cos(a) * cr * cz * 0.95, 0.2 * Math.cos(a), 0, -0.2 * Math.sin(a)));
        }
      }
      if (lamellar) {
        // Fore-and-aft comb, raised. The warden's one unmistakable outline cue,
        // and at 30 mm it was inside the bowl's own dome — a ridge on a helmet,
        // not a shape in a silhouette. 52 mm puts a hard vertical fin above the
        // skull that no other class on the roster has.
        for (const u of [0, Math.PI]) {
          p.add(headWear(K, {
            u0: u - 0.055, u1: u + 0.055,
            v0: () => bandHi - 0.02, v1: () => Math.PI / 2 - 0.02,
            nu: 1, nv: 5, lift: (_u, v) => 0.022 + 0.052 * Math.sin(v * Math.PI), thick: 0.008,
          }), steel, place.clone());
        }
        // Neck flange off the back of the band. The warden is the one class with
        // no coif, and without something behind the helm his head ends in a hoop —
        // this is the fall a ridge helm actually carries, and from behind it is the
        // difference between him and the berserker at fifty metres.
        p.add(headWear(K, {
          u0: Math.PI - 1.15, u1: Math.PI + 1.15,
          v0: () => bandLo - 0.30, v1: () => bandLo + 0.01,
          nu: Math.max(6, lod.shellU - 4), nv: 2,
          lift: (_u, v) => 0.017 + 0.020 * (1 - v), thick: 0.007,
        }), iron, place.clone());
      }
      if (bare) {
        // Boar bristle over the crown. The berserker wears the lowest cap on the
        // roster and needs the height back somewhere that is unmistakably *his* —
        // and a ragged organic crest is the opposite read from the warden's
        // machined steel fin, which is the point of having both.
        p.add(headWear(K, {
          u0: -0.085, u1: 0.085,
          v0: () => bandHi - 0.06, v1: () => Math.PI / 2 - 0.02,
          nu: 2, nv: 6,
          // Ragged along its top rather than peaked in the middle: a crest that
          // tapers symmetrically reads as a fin, and the point of this one is that
          // it does not. Kept to 36 mm — at 55 it stood clear of the bowl on both
          // sides and read as a handle rather than as bristle on a cap.
          lift: (_u, v) => 0.016 + 0.036 * Math.pow(Math.sin(Math.PI * clamp01(v)), 0.42)
            * (0.80 + 0.20 * Math.cos(v * 17)),
          thick: 0.009,
        }), fur, place.clone());
      }
      // Mail aventail off the band — and it stops at the cheek. This was a closed
      // superellipse ring, a full 360° of mail whose top edge sat exactly at eye
      // level and whose front wall stood 9 mm *proud of the nose*. That single
      // shell is why every helmeted warrior in `art/shots/v2` has a black void
      // where his face should be: the face was built, lit and then bricked up
      // behind a hauberk. An arc from cheek round to cheek frames the face the way
      // a coif actually does and leaves the eyes where the light can find them.
      //
      // Sized down hard this pass. At R.x * 1.34 + 0.026 the coif stood 79 mm clear
      // of the skull at cheek level — a dark bell with the head somewhere inside it,
      // which is most of why the huscarl's head reads as small and detached in
      // `art/shots/v3/lineup.png`. Mail drapes: tight over the crown, following the
      // skull down past the ear, and only flaring where it lands on the shoulder.
      // It has also grown a fourth level and reaches the shoulder. It used to stop
      // at 1.78 — above the neck — so the head was a dark bell with a pale post
      // under it and 34 mm of open sky between the coif's rim and the mantle's top
      // edge. Mail hanging from the skull down onto the shieldwall shoulder is the
      // strongest "attached" cue the huscarl has, and it was being thrown away for
      // the sake of a shorter patch. The face stays open: the arc runs cheek to
      // cheek, so all of this is behind and beside the throat, never across it.
      //
      // Gated to the huscarl this pass. It used to hang off `!lamellar`, which
      // handed the same mail bell to the berserker — so three of the four classes
      // shared one head silhouette and the fourth differed by a 30 mm ridge. A
      // coif is heavy-infantry kit and it is the huscarl's whole read; the
      // berserker's is a bare neck under a fur crest, and he cannot have it while
      // he is wearing this.
      if (heavy) {
        // Azimuth of the front edge, radians off dead ahead — and a function of the
        // descent, not a constant. Held at 0.85 all the way down, the front edge
        // tracked the flare outward and forward, so the coif's lappets came off the
        // jaw as two rigid blades standing in front of the chest. Opening the arc as
        // it falls swings that edge out over the point of the shoulder instead,
        // which is where a coif's skirt goes and leaves the hauberk collar to do
        // the front of the throat.
        //
        // Opened another 15° at the top, to 1.12 rad. At 0.85 the front edge landed
        // at x = ±85 mm, which was the skull's own widest point — so the two dark
        // mail curtains hung *beside the cheeks*, and the lit head between them read
        // as 120 mm wide on a 620 mm shoulder line. That is the third and largest
        // part of "the head reads small and narrow", and it was not the head. At
        // 1.12 the rim clears the widened skull by 4 mm and sits 50 mm back in z:
        // behind the ear, where a coif's front edge belongs, with the whole 187 mm
        // of face and temple in front of it.
        // 1.46, not 1.12, and this is the other half of "the head is a rounded box
        // with hard vertical corner edges at the temples".
        //
        // At 1.12 rad the coif's front edge crossed the ring 64° off dead ahead:
        // x = ±100 mm and z = +42 mm, which is *in front of the ear, beside the
        // cheekbone*. So a dark mail curtain hung down each side of the face from
        // the helm rim to the shoulder, with a near-vertical inner edge and a
        // near-vertical outer one — two hard verticals framing the head, which is
        // precisely a box. The lit face between them measured 120 mm on a 600 mm
        // shoulder line, which is also most of "the head reads small".
        //
        // An aventail hangs off the *back and sides* of a helmet. At 1.46 the edge
        // sits level with the front of the ear and rakes back from there, so the
        // temple, the cheekbone and the jaw are all in front of it and the head's
        // own silhouette — which now has a parietal curve to show — draws the
        // outline instead of the mail.
        const rim = (v: number) => 1.46 + 0.34 * v * v;
        const levels = [
          // Started above the brow band rather than 20 mm below it. At R.y * 0.10
          // the coif's top ring cleared the bottom of the band, so its `patch` rim
          // strip — 14 mm of surface facing straight up — stood out at each temple
          // as a lit grey tab. A coif's upper edge is riveted *inside* the bowl and
          // is never seen; 14 mm proud of the skull at this height is well within
          // the band's own 24 mm standoff, so it is now covered.
          { y: skullY + R.y * 0.44, hw: R.x * 1.00 + 0.011, hd: R.z * 1.00 + 0.011, z: -0.008 },
          { y: skullY - R.y * 0.62, hw: R.x * 1.10 + 0.014, hd: R.z * 0.98 + 0.014, z: -0.020 },
          { y: skullY - R.y * 1.55, hw: R.x * 1.36 + 0.016, hd: R.z * 0.92 + 0.016, z: -0.028 },
          { y: skullY - R.y * 2.60, hw: R.x * 1.82 + 0.018, hd: R.z * 1.05 + 0.018, z: -0.032 },
        ];
        const coif = (u: number, v: number, inset: number, out: THREE.Vector3) => {
          const t = v * (levels.length - 1);
          const i = Math.min(levels.length - 2, Math.floor(t));
          const f = t - i;
          const a = levels[i];
          const b = levels[i + 1];
          const hw = mix(a.hw, b.hw, f) - inset;
          const hd = mix(a.hd, b.hd, f) - inset;
          out.set(Math.sin(u) * hw, mix(a.y, b.y, f), mix(a.z, b.z, f) + Math.cos(u) * hd);
        };
        // u runs from the far cheek back to the near one: a patch takes its facing
        // from ∂u × ∂v, and sweeping the arc the other way turns the coif inside
        // out — which reads as a hole in the back of the head.
        p.add(patch({
          nu: Math.max(10, lod.body - 4), nv: Math.max(3, lod.shellV),
          outer: (t, v, out) => coif(mix(Math.PI * 2 - rim(v), rim(v), t), v, 0, out),
          // The inset closes to nothing at both front edges, so the two sheets
          // meet in a fold rather than in a 14 mm rim strip. A rim strip's normal
          // points along the surface, which on a vertical edge means straight at
          // the camera — it was drawing a hard bright line down each side of the
          // head that read as a corner even after the edge itself moved back.
          inner: (t, v, out) => coif(
            mix(Math.PI * 2 - rim(v), rim(v), t), v,
            0.014 * smooth(0, 0.09, Math.min(t, 1 - t)), out,
          ),
        }), mail);
      }
    } else if (ap.helm === "hood") {
      // A deep hood with a point at the back — the runekeeper's outline. The rim
      // used to run *across the eyes* at the front, which is the whole reason the
      // hood read as a blank cone: there was no opening, only cloth. It now rises
      // above the brow at dead ahead, falls away past the cheek at the sides and
      // hangs longest at the nape, and the front of it is lifted furthest so the
      // brim overhangs the face it is supposed to be shading.
      p.add(headWear(K, {
        u0: 0, u1: Math.PI * 2, wrapU: true,
        v0: (u) => -0.9 + 1.32 * Math.pow(clamp01((Math.cos(u) + 1) * 0.5), 2.2),
        v1: () => Math.PI / 2 - 0.02,
        nu: Math.max(12, lod.shellU + 2), nv: lod.shellV + 1,
        // Down from 30 mm of base lift to 20. Cloth over a skull follows the skull;
        // the extra volume it needs belongs at the nape and over the brim, which is
        // where the two directional terms put it, not in a uniform standoff that
        // inflates the whole hood into a bell.
        lift: (u, v) => 0.02 + 0.018 * v
          + 0.055 * (1 - v) * clamp01(-Math.cos(u))
          + 0.05 * Math.pow(1 - v, 1.5) * clamp01(Math.cos(u)),
        thick: 0.012,
      }), robed ? cloakMat : hide, place.clone());
      // Shadow gore: a dark inner course set well inside the cloth, so what you
      // see through the opening is a lined cavity rather than the sky behind it.
      // Cheaper and more reliable than asking a shadow map to resolve 30 mm.
      p.add(headWear(K, {
        u0: 0, u1: Math.PI * 2, wrapU: true,
        v0: (u) => -0.9 + 1.32 * Math.pow(clamp01((Math.cos(u) + 1) * 0.5), 2.2),
        v1: () => 0.9,
        nu: Math.max(10, lod.shellU), nv: 2,
        lift: (u, v) => 0.012 + 0.03 * Math.pow(1 - v, 1.5) * clamp01(Math.cos(u)),
        thick: 0.004,
      }), dark, place.clone());
      p.add(shell([
        { y: skullY + R.y * 0.6, hw: 0.03, hd: 0.03, z: -R.z * 0.9 },
        { y: skullY + R.y * 0.2, hw: 0.05, hd: 0.05, z: -R.z * 1.25 },
        { y: skullY - R.y * 0.4, hw: 0.028, hd: 0.028, z: -R.z * 1.5 },
      ], 8, { capTop: true, capBottom: true }), robed ? cloakMat : hide);
      // Shoulder drape, so the hood is attached to something.
      //
      // It was a 436 mm bell — wider than the runekeeper's own shoulders — whose rim
      // stopped 120 mm above them, so it read as a lampshade hung in front of a man
      // rather than a mantle lying on one, and it swallowed the neck, the collar and
      // both pauldrons on the way. Narrower and 28 mm longer: the rim now overlaps
      // the shoulder line it is resting on, and the hem `wall` gives it an edge
      // there. It still hides the throat, which is the point of a hood, but it hides
      // it under cloth instead of under a cone.
      p.add(shell([
        { y: skullY - R.y * 0.55, hw: R.x * 1.30, hd: R.z * 1.18 },
        { y: skullY - R.y * 1.45, hw: R.x * 1.72, hd: R.z * 1.44 },
        { y: skullY - R.y * 2.40, hw: R.x * 2.02, hd: R.z * 1.58 },
      ], Math.max(10, lod.body - 4), { power: 2.2, wall: 0.014 }), robed ? cloakMat : hide);
    }
    return p;
  }, headSig);

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
        // Folds push *out* and never in. A cosine about zero spends half its
        // amplitude cutting inside the base ellipse, and the base ellipse is
        // only ~60 mm clear of the tunic's flared hem — so a trough put the
        // cloak inside the garment under it and the tunic came through as an
        // olive wedge in `probe/duel.png`. Cloth draped over a body is
        // displaced away from it by definition; there is nothing for a fold to
        // displace into. 52 mm peak at the hem rather than the old 30, because
        // the folds were sized when this was a rigid plate on a hinge where
        // depth only read as corrugation — now that the hem actually swings,
        // they are the thing that says "cloth", and 30 mm was below what the
        // shading resolves at lineup distance.
        const fold = (0.5 - 0.5 * Math.cos(a * 5.5)) * 0.052 * v * v
          + (0.5 - 0.5 * Math.cos(a * 11)) * 0.016 * v;
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
        // The lining is cut short in v as well as inset, so the hem is a *fold*
        // rather than a 14 mm strip lying flat and facing straight down.
        //
        // That flat strip is the second of the sub-pixel rim defects the panel
        // logged. `patch` closes the v1 boundary by joining outer to inner, and
        // since both sat at the same height the join was a horizontal annulus —
        // one pixel deep at lineup distance, taking no key light at all, so the
        // hem drew a 1 px black line under a lit cloak and the post chain's
        // fringing painted it red. Pulling the lining 19 mm up turns the same
        // triangles into a 24 mm roll at about 55°, which is several pixels of
        // shaded curvature and is also what a hemmed edge of wool does.
        inner: (u, v, out) => surf(u, v * (1 - 0.018), 0.014, out),
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
