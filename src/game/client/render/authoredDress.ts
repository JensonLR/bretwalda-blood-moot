/**
 * THE SEAM THROUGH WHICH THE AUTHORED MAN IS DRESSED.
 *
 * The exports ship `<surface>:<hex>` material names and no maps (`authored.ts`,
 * "the surface name is the material"). Until this file existed the answer to
 * "what material does this name become" was a closure pasted twice, in the arena
 * (`GameCanvas.tsx`) and in the armoury (`armouryStage.ts`), and it could not say
 * anything a name did not say. Three pieces of work all need to answer that
 * question differently and none of them may edit those two files:
 *
 *   `authoredSkin.ts`    (U5) a head's skin gets a complexion map; a hand's does not
 *   `authoredLivery.ts`  (U6) a baked kit hex becomes the man's own livery, team and finish
 *   `authoredHair.ts`    (U6) hair and beard are dressed in the hair substance, in his colour
 *
 * So the closure is a call into `resolveAuthoredMaterial`, which walks those three
 * in that order and stops at the first that claims the ask. **Each is a
 * pass-through today** (returns null), so the chain resolves to exactly what the
 * closures resolved to, and `tools/dresschain.mjs` holds it to that.
 *
 * ---------------------------------------------------------------------------
 * HOW TO WRITE A HANDLER  (read this before you open one of the three files)
 * ---------------------------------------------------------------------------
 *
 *   export const dressSkin: AuthoredMaterialHandler = (ask, mesh, ctx, base) => {
 *     if (ask.surface !== "skin" || !mesh.isHead) return null;   // not mine: pass
 *     const m = base();                                          // the library's own answer
 *     ...                                                        // clone / tint / add a map
 *     return m;                                                  // claimed: the chain stops
 *   };
 *
 *  - RETURN NULL FOR ANYTHING YOU DO NOT OWN. That is the pass-through, and the
 *    default. A handler that claims an ask it should have left alone changes a
 *    man it was never asked about.
 *  - `base()` is the library's own material for this same ask (`tinted(surface,
 *    color)` or `standard(color)`), computed once per ask and only if somebody
 *    calls it. Start from it instead of calling `ctx.materials` again, so the
 *    cached program is shared and nothing is minted twice.
 *  - NEVER MUTATE `base()`. The library caches it by surface and colour and
 *    every man of that kit wears the same object. Clone it (`.clone()`), and
 *    remember `forSkinnedMesh` in `authored.ts` already clones per original for
 *    skinned meshes; a clone of yours is a second variant, so cache it.
 *  - `mesh` is lazy (see `AuthoredMeshInfo`): reading `mesh.isHead` or
 *    `mesh.dominantBone` costs a pass over the mesh's weights the first time.
 *  - A handler that THROWS costs only its own dressing: the chain logs it once,
 *    moves on to the next handler, and ends at the library's material. It does
 *    not cost the man his colour and it does not cost anyone the fight.
 *  - Handlers see the ask BEFORE the mesh's material is replaced, so they run
 *    once per mesh per swap, on the swap's own thread. Keep them synchronous.
 *
 * `authored.ts` stays pure and imports nothing at runtime, so this file only
 * ever imports TYPES from it.
 */
import type * as THREE from "three";
import type { AuthoredMaterialAsk, AuthoredMeshInfo } from "./authored";
import type { MaterialLibrary } from "./materials";
import type { WarriorClass } from "../../types";
import { defaultAppearance, peopleOf, type Allegiance, type Appearance, type TeamSide } from "../characters";
import { faceSeedFor } from "../armouryThumbs";
import { dressSkin } from "./authoredSkin";
import { dressLivery } from "./authoredLivery";
import { dressHair } from "./authoredHair";

/**
 * WHO THE MAN IS, as far as a handler needs to know. Built once per man by
 * `authoredDressContext` and shared by every mesh of him and every prop hung on
 * him, so it is read-only and never rebuilt per mesh.
 */
export interface AuthoredDressContext {
  readonly warriorClass: WarriorClass;
  /**
   * What he bought and chose: helm, hair, beard, cloak, armour finish, war
   * paint... Never undefined: an absent one is the class default, as
   * `createWarriorRig` reads it.
   */
  readonly appearance: Appearance;
  /**
   * WHICH PEOPLE HE SWORE TO, narrowed (`peopleOf`): `"none"` is the unsworn,
   * who wear the issued kit. Colour and livery, not geometry.
   */
  readonly people: Allegiance;
  /**
   * WHICH SIDE, in a team mode; `"none"` in a free-for-all. Sim state, not
   * cosmetics: it outranks the people and the finish (`TeamSide` in
   * `characters.ts` has the precedence). Read it off `player.team`.
   */
  readonly team: TeamSide;
  /**
   * A stable small integer for this man's face: the armoury's own
   * `loadout.faceSeed` there, `faceSeedFor(player.id)` in the arena. It is NOT
   * the interned `faceIdentity(player.id)` that `createWarriorRig` hands
   * `buildCharacter` — that function is private to `anim.ts` and stateful (a
   * call allocates the next id), so a handler that must reproduce the
   * PROCEDURAL man's exact complexion needs it exported first, by whoever owns
   * `anim.ts`. Until then this picks a complexion that is stable per man and
   * says nothing about which one the procedural build chose.
   */
  readonly faceSeed: number;
  /**
   * The client's OWN material library — the whole economy of the authored man:
   * the glTF ships no maps, the surfaces are generated in code. Handlers that
   * need a material other than `base()` ask this for it.
   */
  readonly materials: MaterialLibrary;
}

/**
 * A handler's whole contract. Return a material to CLAIM this ask (the chain
 * stops and the mesh gets it), or null to PASS it on. `base` is the library's
 * untouched answer to the same ask — see the header before calling it.
 */
export type AuthoredMaterialHandler = (
  ask: AuthoredMaterialAsk,
  mesh: AuthoredMeshInfo,
  ctx: AuthoredDressContext,
  base: () => THREE.Material,
) => THREE.Material | null;

/**
 * The shape `dressFromSurfaceNames` and `dressAuthoredHead` take. `mesh` is
 * OPTIONAL here on purpose and required everywhere else: `UpgradableSwap.
 * resolveMaterial` (authored.ts, in the mount code's region) is still typed as
 * `(ask) => Material`, and a function whose second parameter is optional is
 * assignable to both. The callers that matter always pass it; a caller that does
 * not gets `ANONYMOUS_MESH`, which no handler will mistake for a head.
 */
export type AuthoredMaterialResolver = (ask: AuthoredMaterialAsk, mesh?: AuthoredMeshInfo) => THREE.Material | null;

/** What a resolver is told about a mesh nobody described: a mesh that is not the head and rides no bone. */
export const ANONYMOUS_MESH: AuthoredMeshInfo = Object.freeze({ name: "", dominantBone: null, isHead: false });

type SurfaceName = Parameters<MaterialLibrary["tinted"]>[0];

/**
 * THE LIBRARY'S OWN ANSWER — the two lines both closures used to carry. A named
 * surface is generated and tinted; an untextured one is a plain standard
 * material of its colour. Throws exactly when the library throws (an unknown
 * surface), which `dressFromSurfaceNames` catches per mesh.
 */
export function baseAuthoredMaterial(ask: AuthoredMaterialAsk, materials: MaterialLibrary): THREE.Material {
  return ask.surface
    ? materials.tinted(ask.surface as SurfaceName, ask.color)
    : materials.standard(ask.color);
}

/** The order the handlers see an ask in. Their surfaces are disjoint; the order only matters if that stops being true. */
const CHAIN: readonly { readonly name: string; readonly handle: AuthoredMaterialHandler }[] = [
  { name: "skin", handle: dressSkin },
  { name: "livery", handle: dressLivery },
  { name: "hair", handle: dressHair },
];

const complained = new Set<string>();

/**
 * THE MATERIAL THIS MESH SHOULD WEAR, for this ask, worn by this man.
 *
 * The first handler to return a material wins; a handler that returns null
 * passes; the library's own material is the answer when none claims it. A
 * handler that throws is logged once and skipped.
 */
export function resolveAuthoredMaterial(
  ask: AuthoredMaterialAsk,
  mesh: AuthoredMeshInfo,
  ctx: AuthoredDressContext,
): THREE.Material | null {
  let memo: THREE.Material | undefined;
  const base = (): THREE.Material => (memo ??= baseAuthoredMaterial(ask, ctx.materials));
  for (const h of CHAIN) {
    let got: THREE.Material | null = null;
    try {
      got = h.handle(ask, mesh, ctx, base);
    } catch (e) {
      if (!complained.has(h.name)) {
        complained.add(h.name);
        console.warn(`[authored] the ${h.name} handler threw (${String(e)}) — skipping it`);
      }
    }
    if (got) return got;
  }
  return base();
}

/**
 * WHO THE MAN IS, built once. Narrows what arrives on a socket the way
 * `createWarriorRig` does: no appearance is the class default, an unknown team
 * is `"none"`, an unknown people is the unsworn.
 */
export function authoredDressContext(o: {
  cls: WarriorClass;
  appearance?: Appearance | null;
  /** `player.team`, unnarrowed. */
  team?: unknown;
  /** The player's id, in the arena. Ignored when `faceSeed` is given. */
  id?: string;
  faceSeed?: number;
  materials: MaterialLibrary;
}): AuthoredDressContext {
  const appearance = o.appearance ?? defaultAppearance(o.cls);
  return {
    warriorClass: o.cls,
    appearance,
    people: peopleOf(appearance),
    // The same narrowing as `teamOf` in anim.ts, which is module-private.
    team: o.team === "red" || o.team === "blue" ? o.team : "none",
    faceSeed: o.faceSeed ?? faceSeedFor(o.id ?? o.cls),
    materials: o.materials,
  };
}

/**
 * THE CLOSURE THE TWO CALL SITES USED TO PASTE, as a call into the chain. One
 * per man; hand it to `upgradeRigToAuthored` (as `resolveMaterial`) and to
 * `dressAuthoredHead`.
 */
export function authoredResolver(ctx: AuthoredDressContext): AuthoredMaterialResolver {
  return (ask, mesh) => resolveAuthoredMaterial(ask, mesh ?? ANONYMOUS_MESH, ctx);
}
