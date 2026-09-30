/**
 * THE LIVERY HANDLER — owner: U6 (palette, livery and dressing).
 *
 * THE DEFECT (CHAR-PLAN CH-06). The authored men carry the DEFAULT kit's hexes baked
 * into their material names (`mail:5f6b7a`, `wool:625d44`, `m_bfa25c`), and the name
 * IS the colour. So a man who bought Bretwalda Gold, swore to the Danelaw, stood on
 * the red side or chose the Sea-Wolf cloak was drawn in the issued kit anyway:
 * `armorColor`, `people`, `team` and the cloak were read nowhere in the authored path,
 * and every colour gate rasterised `buildCharacter` and could not see him. It was the
 * largest unmeasured gameplay-legibility risk in the default build (RENDER-PATHS A).
 *
 * THE MECHANISM. A ROLE TABLE: baked name -> the role that surface plays on the man
 * (`mail`, `tunic`, `trouser`, `wrap`, `hide`, `buff`, `fitting`, `linen`, `cloak`,
 * `pelt`, `hood`), computed per class from the game's own tables and not typed out
 * here. The role is then resolved through the SAME function the procedural builder
 * dresses its man with - `wornColours` (`kitFor(finishKit(armorColor), team, people)`,
 * `tunicDye`, `cloakFor`, `wornBy`) - and drawn out of the library by the same call
 * (`armour`, `tinted`, `standard(.., BRASS_*)`). So the two men agree by
 * construction, the precedence (team beats people beats what he bought) is stated in
 * one place and is not restated here, and the `roletable` claim in
 * `tools/authoredtest.mjs` builds both men for every finish, cloak, people and side and
 * requires their colours to be the same names.
 *
 * TWO GENERATIONS OF DEFAULT KIT, AND WHY. The role table is computed from
 * `defaultAppearance` and `FINISH_KIT[0x5f6b7a]` - "the default man as the builder
 * would bake him TODAY" - so re-grading the palette needs no edit here. But the
 * exports in `public/authored/` were baked from the palette as it stood when they were
 * made, and they are not re-baked until the integration step; a table that only knew
 * the new default would recognise none of their names and the dressing would do
 * nothing on the men the player is actually served. So the table also carries
 * `SHIPPED`: the hexes those files were baked with, frozen, measured off the files
 * (`tools/authoredtest.mjs` reads every name in every export against it). A name from
 * either generation is a role; after the re-bake ships, `SHIPPED` matches nothing and
 * is deleted (the claim prints how many names each generation matched).
 *
 * WHAT THIS COSTS, AND IT IS BOUNDED. Livery is COLOUR, not geometry. The cloak's CUT
 * (`CLOAK_CUTS`: length, hem, flare, fold, the pin) is baked, one per class, and a
 * baked mesh cannot change shape at runtime. The class-default cloak is therefore KEPT
 * and RECOLOURED: buy the 400-gold Gilded War Cloak and a huscarl wears the gold of it
 * on the cut of the Blood Red one (measured: `docs/OPEN-DEFECTS.md`, "THE AUTHORED
 * MAN'S CLOAK"). The shop must not promise a cut the mannequin and the arena cannot
 * draw until the cloak ships as a prop family (CHAR-PLAN D4, U8).
 *
 * THE CONTRACT is in `authoredDress.ts`. Return a material to claim the ask, null to
 * pass, never mutate `base()`. This handler never calls `base()`: it does not want the
 * library's answer for the BAKED colour, it wants its answer for the colour he is
 * dressed in, and `materials.tinted` is cached by colour so eight men in one kit share
 * one material.
 */
import type * as THREE from "three";
import type { AuthoredMaterialHandler, AuthoredDressContext } from "./authoredDress";
import type { AuthoredMaterialAsk, AuthoredMeshInfo } from "./authored";
import type { WarriorClass } from "../../types";
import {
  BRASS_METALNESS, BRASS_ROUGHNESS, CLASS_TUNIC, TABLET_REPEAT, defaultAppearance, wornColours,
  type WornColours,
} from "../characters";

/** What a surface on the man IS, which decides what it is dressed in. */
export type Role =
  | "mail" | "tunic" | "trouser" | "wrap" | "hide" | "buff" | "fitting"
  | "linen" | "cloak" | "pelt" | "hood";

/** The library surface each role is baked as, and so the first half of its name. `null` is an untextured `m_<hex>`. */
const SURFACE_OF: Readonly<Record<Role, string | null>> = {
  mail: "mail", tunic: "wool", trouser: "wool", wrap: "wool", hide: "leather", buff: "leather",
  fitting: null, linen: "linen", cloak: "wool", pelt: "wool", hood: "wool",
};

/**
 * THE DEFAULT KIT THE SHIPPED EXPORTS WERE BAKED WITH, frozen. Read off the four
 * `public/authored/warrior-<cls>.glb` (material names, all 33 across the 68 files), at
 * the tree where `FINISH_KIT[0x5f6b7a]` was `mail 5f6b7a, trouser 504a3e, wrap 8b7c5c,
 * hide 4a3524, buff 7a5b38, fitting bfa25c` and the tunic was `tunicDye(6a5b42, accent)`.
 *
 * A snapshot and not a definition, on purpose: it must NOT follow the tables when they
 * are re-graded, or it would stop describing the files. Delete it when the integration
 * re-bake replaces them; `tools/authoredtest.mjs` (roletable) prints which generation
 * each export matched, so the day it matches nothing is visible and not guessed.
 *
 * The berserker has no tunic, no shirt and no mail; a role absent from a class is
 * simply absent from his file.
 */
const SHIPPED: Readonly<Record<WarriorClass, Readonly<Partial<Record<Role, number>>>>> = {
  huscarl: { mail: 0x5f6b7a, tunic: 0x6a5736, trouser: 0x504a3e, wrap: 0x8b7c5c, hide: 0x4a3524, buff: 0x7a5b38, fitting: 0xbfa25c, linen: 0xc2b69c, cloak: 0x7a2020, pelt: 0x8a7050, hood: 0x2a2521 },
  warden: { mail: 0x5f6b7a, tunic: 0x625d44, trouser: 0x504a3e, wrap: 0x8b7c5c, hide: 0x4a3524, buff: 0x7a5b38, fitting: 0xbfa25c, linen: 0xc2b69c, cloak: 0x7a2020, pelt: 0x8a7050, hood: 0x2a2521 },
  runekeeper: { mail: 0x5f6b7a, tunic: 0x673e3b, trouser: 0x504a3e, wrap: 0x8b7c5c, hide: 0x4a3524, buff: 0x7a5b38, fitting: 0xbfa25c, linen: 0xc2b69c, cloak: 0x24386a, pelt: 0x8a7050, hood: 0x2a2521 },
  berserker: { mail: 0x5f6b7a, trouser: 0x504a3e, wrap: 0x8b7c5c, hide: 0x4a3524, buff: 0x7a5b38, fitting: 0xbfa25c, linen: 0xc2b69c, cloak: 0x5a4030, pelt: 0x8a7050, hood: 0x2a2521 },
};

const ROLES = Object.keys(SURFACE_OF) as Role[];
const hex6 = (n: number): string => n.toString(16).padStart(6, "0");
/** The material name a role bakes as, in the exporter's own spelling (`mail:5f6b7a`, `m_bfa25c`). */
export const bakedName = (role: Role, color: number): string => {
  const surface = SURFACE_OF[role];
  return surface ? `${surface}:${hex6(color)}` : `m_${hex6(color)}`;
};
/** The name an ask is, in the same spelling (an ask's surface is lower-cased by `readSurfaceName`). */
export const nameOfAsk = (ask: AuthoredMaterialAsk): string =>
  ask.surface ? `${ask.surface}:${hex6(ask.color)}` : `m_${hex6(ask.color)}`;

/** What the builder dresses the DEFAULT man in today: the colours the next export would bake. */
function currentDefault(cls: WarriorClass): Record<Role, number> {
  const w = wornColours(defaultAppearance(cls), CLASS_TUNIC[cls] ?? 0x5a4a2c, "none", "none");
  return {
    mail: w.kit.mail, tunic: w.tunic, trouser: w.kit.trouser, wrap: w.kit.wrap, hide: w.kit.hide,
    buff: w.kit.buff, fitting: w.kit.fitting, linen: w.linen, cloak: w.cloak, pelt: w.pelt, hood: w.hood,
  };
}

export interface BakedRoles {
  /** `surface:hex` -> role, both generations. */
  readonly table: ReadonlyMap<string, Role>;
  /** A name that is two roles in one class: a colour that would be dressed as the wrong garment. Must be empty. */
  readonly collisions: readonly string[];
  /** Which generation a name came from, for the harness and the day the shipped one can be deleted. */
  readonly generation: ReadonlyMap<string, "current" | "shipped">;
}
const cache = new Map<WarriorClass, BakedRoles>();

/**
 * THE ROLE TABLE FOR ONE CLASS. First the current default kit, then the shipped one; a
 * name already claimed by a DIFFERENT role is a collision, reported and not overwritten.
 */
export function bakedRoles(cls: WarriorClass): BakedRoles {
  const hit = cache.get(cls);
  if (hit) return hit;
  const table = new Map<string, Role>();
  const generation = new Map<string, "current" | "shipped">();
  const collisions: string[] = [];
  const add = (role: Role, color: number | undefined, gen: "current" | "shipped") => {
    if (color === undefined) return;
    const name = bakedName(role, color);
    const had = table.get(name);
    if (had === undefined) { table.set(name, role); generation.set(name, gen); }
    else if (had !== role) collisions.push(`${name} is both ${had} and ${role} (${gen})`);
  };
  const now = currentDefault(cls);
  for (const role of ROLES) add(role, now[role], "current");
  const then = SHIPPED[cls] ?? {};
  for (const role of ROLES) add(role, then[role], "shipped");
  const out = { table, collisions, generation };
  cache.set(cls, out);
  return out;
}

/** The role a baked material plays on this class's man, or null when it is not the livery's to dress. */
export function roleOf(cls: WarriorClass | string, ask: AuthoredMaterialAsk): Role | null {
  return bakedRoles(cls as WarriorClass).table.get(nameOfAsk(ask)) ?? null;
}

/**
 * THE FIXED-COLOUR MATERIALS THE ROLE TABLE DELIBERATELY IGNORES — steel, timber and
 * bone that are the same on every man, the rune glow, and the surfaces another handler
 * dresses (the skin and the eyes are U5's, the hair is `authoredHair.ts`'s). One material
 * NAME per line, with the reason, appended by the unit that adds one (U3, U4, U7,
 * U8), so two units appending at once is a trivial concatenation:
 *
 *   "brass:bfa25c", // U3: belt fittings, fixed
 *
 * `roletable` (an `authoredtest` claim) fails on a name in a warrior or prop GLB that is
 * neither in the table nor here, and on a line here with no reason after the `//`.
 */
export const EXCEPTIONS: readonly string[] = [
  "iron:6e767f", // helm iron and the pauldron caps: `iron` in buildCharacter is one 0x6e767f on every man whatever finish he bought (the helm's re-grade is U8's, the pauldrons U3 deletes)
  "steel:b6bfca", // helm bands, nasal, brow and the seax bolster: `steel` in buildCharacter, fixed on every man (U7 owns the steel rows, U8 the helm)
  "steel:d9b45f", // the noble helm's fire-gilding (Sutton Hoo): `gilt`, a fixed royal metal
  "interlace:9aa6ae", // the Sutton Hoo helm's die-stamped tinned foil: `silver`, fixed
  "m_8e1a26", // the Sutton Hoo garnet cabochons: `garnet`, a dielectric, fixed
  "oak:3a2a1e", // the belt seax's hilt and scabbard timber: `timber` in buildCharacter, fixed
  "oak:4a3a2a", // the runekeeper's staff-and-wallet timber: fixed
  "bone:d8cfb4", // bone: the runekeeper's pendant and the berserker's tooth string, fixed
  "skin:8d6444", // the body skin: U5's handler (authoredSkin.ts) dresses it, the livery must not
  "skin:7c4936", // the hands' skin (the warm tone): U5's
  "skin:65472e", // the shade skin (ear, socket, under-jaw): U5's
  "m_655d50", // the sclera: U5's (eye colour, by face identity)
  "m_241810", // the iris: U5's
  "m_1a1310", // 0x1a1310 `dark`: the brows and lashes on a head (U5's) and the gore inside the cowl on the runekeeper's hood (fixed)
  "hair:4a3220", // the baked hair and beard shells: dressed by authoredHair.ts in the man's own colour
  "hairstrand:4a3220", // the hair and beard ribbons on the props: authoredHair.ts
  "hairunder:4a3220", // the under-cap of the props: authoredHair.ts
];

/**
 * THE HEM BRAID. The exports bake every wrap-coloured surface as `wool:<wrap>`, and two things on the man are that:
 * his leg wraps (on the knee bones) and the band of braid sewn round the tunic's hem (the huscarl's and warden's) or
 * the mantle's (the runekeeper's), a 16 mm strip skinned to `Spine`. The procedural man weaves that strip from the
 * `tablet` substance now, so a wrap-role mesh that is not on a leg is a trim and takes it too, and the two men keep
 * agreeing (`roletable`). Measured off the four exports: one such mesh in each of three classes, 76-80 vertices,
 * 16-17 mm tall, 100% on `Spine`; the berserker has none. A mesh that does not say what it rides (no skeleton) is a
 * wrap: the safe answer is the wool it was.
 */
const LEG_BONE = /(Thigh|Knee|Foot|Toe)$/;
const isTrim = (mesh: AuthoredMeshInfo): boolean => {
  const bone = mesh.dominantBone;
  return bone !== null && !LEG_BONE.test(bone);
};

const dressed = new WeakMap<AuthoredDressContext, WornColours>();
/** What HE is dressed in: the same call the procedural builder makes, once per man. */
function wornOf(ctx: AuthoredDressContext): WornColours {
  let w = dressed.get(ctx);
  if (!w) {
    w = wornColours(ctx.appearance, CLASS_TUNIC[ctx.warriorClass] ?? 0x5a4a2c, ctx.team, ctx.people);
    dressed.set(ctx, w);
  }
  return w;
}

/**
 * THE MATERIAL A ROLE IS DRAWN IN, out of the library, by the call the builder makes:
 * `armour` (which picks the finish's own metal: iron, bronze), `hide` and `tinted`, and
 * the fittings as cast bronze - `standard(colour, BRASS_ROUGHNESS, BRASS_METALNESS)`.
 *
 * That last one FIXES a second defect the role table walked into: an untextured `m_bfa25c`
 * reached the library as `standard(colour)` at roughness 0.8 and metalness 0, so every
 * buckle, stud and brooch on the authored man was matte plastic where the procedural
 * man's is cast metal (`BRASS_ROUGHNESS`, `BRASS_METALNESS`: the exporter kept the hex and dropped the surface).
 * Cloth is asked for with the library's own default repeat, exactly as `base()` would
 * ask, because the exports bake the weave's UV repeat and livery is colour, not density.
 */
export function materialFor(role: Role, ctx: AuthoredDressContext, mesh?: AuthoredMeshInfo): THREE.Material {
  const M = ctx.materials;
  const w = wornOf(ctx);
  switch (role) {
    case "mail": return M.armour(w.kit.mail);
    case "tunic": return M.tinted("wool", w.tunic);
    case "trouser": return M.tinted("wool", w.kit.trouser);
    case "wrap": return mesh && isTrim(mesh) ? M.tinted("tablet", w.kit.wrap, { repeat: [TABLET_REPEAT, 1] }) : M.tinted("wool", w.kit.wrap);
    case "hide": return M.hide(w.kit.hide);
    case "buff": return M.hide(w.kit.buff);
    case "fitting": return M.standard(w.kit.fitting, BRASS_ROUGHNESS, BRASS_METALNESS);
    case "linen": return M.tinted("linen", w.linen);
    case "cloak": return M.tinted("wool", w.cloak);
    case "pelt": return M.tinted("wool", w.pelt);
    case "hood": return M.tinted("wool", w.hood);
  }
}

export const dressLivery: AuthoredMaterialHandler = (ask, mesh, ctx) => {
  const role = roleOf(ctx.warriorClass, ask);
  if (!role) return null;              // not the livery's: a fixed metal, a skin, a hair, a name nobody knows
  return materialFor(role, ctx, mesh);
};
