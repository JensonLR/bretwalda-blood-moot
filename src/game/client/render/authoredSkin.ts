/**
 * THE SKIN HANDLER — owner: U5 (heads and faces).
 *
 * WHAT IT DOES. Every skin part of an authored warrior arrives as `skin:<hex>` with the
 * hex of the man who was BAKED (identity 0 of the class), and used to be dressed with the
 * library's tinted skin at the exporter's 35 mm cube-projected UV: one dark tone on all
 * four classes, over a lattice. This dresses each part as the man who is actually standing
 * there:
 *
 *   the skull, the lids and the ears   the class's complexion map (`faceMap.ts`), at the
 *                                      head's own (u, v), over the skin substance at the
 *                                      HEAD's tile (2.2 mm), in the man's own tone
 *   the neck                           the same, on its own cylinder map
 *   arms, hands, a bare torso          the man's own tone at the body's grain, and nothing else
 *   the eyes (plain `m_<hex>`)         the man's sclera and iris, at the wetness they were
 *                                      built with (0.34 and 0.09); `standard(hex)` had them
 *                                      at 0.8, i.e. dry
 *
 * WHO THE MAN IS. `ctx.faceSeed` is the armoury's own `loadout.faceSeed` or the arena's
 * `faceSeedFor(player.id)`; `faceTraits(seed)` is the SAME function that picks the
 * procedural man's tone and iris, so the shop card, the mannequin and the arena agree about
 * whose face this is. (The procedural rig in the arena uses an interned identity, consecutive
 * integers under a Latin square; an authored man's seed is a hash, a fair coin, and eight men
 * on a field can share a tone. Recorded, not fixed: it needs `faceIdentity` exported from
 * `anim.ts`.)
 *
 * WHAT A HEX IS. The baked hexes are the tables' own values at the moment of the export
 * (`SKIN_TONES[faceTraits(0).tone]`), so this reads them from the tables AND from the list
 * of what the SHIPPED files carry (`LEGACY`, the values at the export before the tones were
 * re-graded): it must work on the files in `public/authored` today and on the files the next
 * rebake writes, and it must not guess. A skin it does not recognise is PASSED (null), never
 * dressed.
 *
 * THE UV. The skinned mesh's material is `clone()`d by `forSkinnedMesh` and a clone does not
 * carry `onBeforeCompile`, so the shader-side world tile that `tinted(..., { tile })` sets up
 * for the procedural head never reaches an authored one, and the `tile` option is inert here:
 * the GLB's UV IS the texture density (35 mm). The head's grain is therefore set the other way
 * round: this writes the head's own (u, v) into the geometry's `uv` in SUBSTANCE TILES
 * (`FACE_TILE` of them), so the skin's normal and roughness maps tile at 2.2 mm with no
 * transform, and the complexion map divides the tile count back out with its own `repeat`.
 *
 * THE CONTRACT is written out in `authoredDress.ts`: return a material to claim the ask, null
 * to pass, never mutate `base()`. This file owns only `dressSkin`; new helpers live in
 * `faceMap.ts`.
 */
import * as THREE from "three";
import type { AuthoredMaterialHandler, AuthoredDressContext } from "./authoredDress";
import type { MaterialLibrary } from "./materials";
import { FACE_DARK, FACE_TILE, IRIS_COLORS, SKIN_TONES, faceTraits, type SkinTone } from "../characters";
import { FACE_MAP_GAIN, faceMapFor, type FaceKind } from "./faceMap";
import { irisTexture, scleraTexture } from "./eyeMap";

/**
 * What the SHIPPED warriors carry (`public/authored`, exported before the tones were
 * re-graded): identity 0 was the darkest tone, and its eyes were dark. The tables are the
 * truth for the files a rebake writes; these are the truth for the files that exist.
 */
export const LEGACY_BAKED = Object.freeze({
  base: 0x8d6444, shade: 0x65472e, warm: 0x7c4936, sclera: 0x655d50, iris: 0x241810, dark: 0x1a1310,
});

type FleshRole = "base" | "shade" | "warm";

/** The hexes a baked warrior's flesh carries, by what they are. */
function bakedFlesh(): Record<FleshRole, readonly number[]> {
  const t0 = SKIN_TONES[faceTraits(0).tone];
  return {
    base: [LEGACY_BAKED.base, t0.base],
    shade: [LEGACY_BAKED.shade, t0.shade],
    warm: [LEGACY_BAKED.warm, t0.warm],
  };
}

export function fleshRoleOf(hex: number): FleshRole | null {
  const b = bakedFlesh();
  for (const role of ["base", "shade", "warm"] as const) if (b[role].includes(hex)) return role;
  return null;
}

/** What an eye's plain-coloured parts are, by their baked hex. */
export function eyeRoleOf(hex: number): "sclera" | "iris" | "dark" | null {
  const t0 = SKIN_TONES[faceTraits(0).tone];
  if (hex === LEGACY_BAKED.sclera || hex === t0.sclera) return "sclera";
  if (hex === LEGACY_BAKED.iris || hex === IRIS_COLORS[faceTraits(0).iris]) return "iris";
  if (hex === LEGACY_BAKED.dark || hex === FACE_DARK) return "dark";
  return null;
}

/** The man's own complexion and iris, from the same function that dresses the procedural man. */
export function manOf(seed: number): { tone: SkinTone; toneIndex: number; iris: number; irisIndex: number } {
  const f = faceTraits(seed);
  return { tone: SKIN_TONES[f.tone], toneIndex: f.tone, iris: IRIS_COLORS[f.iris], irisIndex: f.iris };
}

/** Is this geometry the neck shell? By where it is, in the class's own numbers (`FaceField.neckSpan`). */
function isNeck(geo: THREE.BufferGeometry, cls: AuthoredDressContext["warriorClass"]): boolean {
  if (!geo.boundingBox) geo.computeBoundingBox();
  const b = geo.boundingBox;
  if (!b) return false;
  const span = faceMapFor(cls, { schedule: false }).field.neckSpan;
  return Math.abs((b.min.x + b.max.x) / 2) < 0.02
    && Math.abs(b.min.y - span.bottom) < 0.02 && Math.abs(b.max.y - span.top) < 0.02;
}

/** One cache per material library, so a harness with two libraries does not cross them. */
const CACHE = new WeakMap<MaterialLibrary, Map<string, THREE.Material>>();
function cached(lib: MaterialLibrary, key: string, make: () => THREE.Material): THREE.Material {
  let m = CACHE.get(lib);
  if (!m) { m = new Map(); CACHE.set(lib, m); }
  let hit = m.get(key);
  if (!hit) { hit = make(); m.set(key, hit); }
  return hit;
}

/** The roughness each flesh role was built with (`faceTile` in `buildCharacter`): base 0.62, shade 0.56, warm 0.55. */
const HEAD_ROUGHNESS: Record<FleshRole, number> = { base: 0.62, shade: 0.56, warm: 0.55 };

function headFlesh(ctx: AuthoredDressContext, kind: FaceKind, role: FleshRole, color: number): THREE.Material {
  return cached(ctx.materials, `flesh|${ctx.warriorClass}|${kind}|${role}|${color}`, () => {
    // The library's own material for this colour, at the head's roughness and tile: the maps it
    // carries (normal, roughness, AO) are the substance's, untiled, and are read at the GEOMETRY's
    // UV, which `writeUv` has set so that one unit is one FACE_TILE.
    const src = ctx.materials.tinted("skin", color, { roughness: HEAD_ROUGHNESS[role], tile: FACE_TILE }) as THREE.MeshStandardMaterial;
    const m = src.clone();
    m.name = `face-${kind}:${role}:${color.toString(16)}`;
    // The library's cached instance may have been flagged for vertex colour by a procedural head of
    // this tone in the same session (`faceTile`); this one has none and must not inherit it.
    m.vertexColors = false;
    // The complexion REPLACES the substance's albedo map: at 2.2 mm that map is under a pixel
    // everywhere the eye looks and reaches the frame as its mean, which the tone already is.
    m.map = faceMapFor(ctx.warriorClass)[kind].tex;
    // `map x color` is the tone: the map is stored over its gain and the colour carries it back.
    m.color.setHex(color).multiplyScalar(FACE_MAP_GAIN);
    m.needsUpdate = true;
    return m;
  });
}

function eyeMaterial(ctx: AuthoredDressContext, name: string, roughness: number, map: THREE.Texture): THREE.Material {
  const m = ctx.materials.standard(0xffffff, roughness).clone();
  m.name = name;
  m.color.setHex(0xffffff);
  m.map = map;
  return m;
}

export const dressSkin: AuthoredMaterialHandler = (ask, mesh, ctx) => {
  if (ask.surface === "skin") {
    const role = fleshRoleOf(ask.color);
    if (!role) return null;
    const man = manOf(ctx.faceSeed);
    const color = man.tone[role];
    const geo = mesh.geometry ?? null;
    let kind: FaceKind | "body" = "body";
    if (geo) {
      if (mesh.isHead) kind = "head";
      else if (isNeck(geo, ctx.warriorClass)) kind = "neck";
    }
    if (kind === "body") {
      return cached(ctx.materials, `flesh|body|${role}|${color}`, () => ctx.materials.tinted("skin", color, { roughness: 0.5 }));
    }
    // the head's own (u, v) into the shared geometry, once
    faceMapFor(ctx.warriorClass).writeUv(geo!, kind);
    return headFlesh(ctx, kind, role, color);
  }
  // The eye's parts are the baked `part_N` meshes riding the Head bone. A helm prop or the runekeeper's
  // hood rides it too, and one of them wears `m_1a1310` (a cloth) that is NOT the dark of an eye:
  // the role prefix on their names (`helm_42`, `hair-...`) is what tells them apart.
  if (ask.surface === null && mesh.isHead && /^part_\d+$/.test(mesh.name)) {
    const role = eyeRoleOf(ask.color);
    if (!role) return null;
    const man = manOf(ctx.faceSeed);
    // The sclera and the iris are TEXTURED with the man's own colour baked in (`eyeMap.ts`): the corners go
    // dark and warm, the iris has fibres, a collarette, a darker outer zone and a catchlight. The material's
    // colour is white because the texture IS the colour (a white catchlight multiplied into a blue material
    // is a darker blue).
    if (role === "sclera") return cached(ctx.materials, `eye|sclera|${man.tone.sclera}`, () => eyeMaterial(ctx, `eye-sclera:${man.tone.sclera.toString(16)}`, 0.34, scleraTexture(man.tone.sclera)));
    if (role === "iris") return cached(ctx.materials, `eye|iris|${man.iris}`, () => eyeMaterial(ctx, `eye-iris:${man.iris.toString(16)}`, 0.09, irisTexture(man.iris)));
    return cached(ctx.materials, "eye|dark", () => ctx.materials.standard(FACE_DARK, 0.42));
  }
  return null;
};
