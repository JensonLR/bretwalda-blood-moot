/**
 * THE HAIR HANDLER — owner: U6 (palette, livery and dressing).
 *
 * THE DEFECT (CHAR-PLAN CH-05, PROCESS.md failure mode 1, instance ten "again"). The authored man's hair and beard
 * are Blender's ribbons over a solid under-cap, hung on the head as props (`hair-<cls>-<style>.glb`,
 * `beard-<cls>-<style>.glb`), and they arrived in the client's own materials by NAME, like everything else. But
 * `hairStrand` and `hairUnder` are not `SurfaceName`s, so `materials.tinted("hairstrand")` threw inside the swap's
 * swallowed catch and the props kept the glTF's own materials. Measured on the shipped files:
 *
 *   - the ribbons: base colour 0.8 x `COLOR_0`, and `COLOR_0` is WHITE (every one of 14,720 vertices is
 *     (1, 1, 1, 1)). The colour `strands.py` computed - `lin(4a3220) x shade x dark`, per vertex, a random shade per
 *     strand and a root-dark to tip-light ramp - is in `COLOR_1`, which no glTF material reads. So the hair was a mass
 *     of #e7e7e7 ribbons: the "white frost" the owner saw at the collar in every armoury frame.
 *   - the under-cap: `metallicFactor` and `roughnessFactor` ABSENT, which glTF defaults to 1 and 1, on a material with
 *     no environment map. A metal with nothing to reflect is black: the "black slab" under the frost.
 *   - and `hairColor` and `beardColor` reached neither: the shop's card showed the mahogany he bought, the arena the
 *     black-and-frost the file had.
 *
 * WHAT THIS DOES. It dresses the three surfaces the hair role owns, in the man's own colour, by mesh name (a `beard`
 * mesh takes `beardColor`, everything else `hairColor`):
 *
 *   `hair`        the baked shell on the warrior (`hair_39`, `beard_40`): the library's `hair` substance, in his colour.
 *   `hairunder`   the props' under-cap: the same substance at `CAP_FACTOR` of his colour. It is a solid shell under a
 *                 mass of ribbons, seen between them, so it is the hair in shadow and never the brightest thing on the head.
 *   `hairstrand`  the ribbons: a plain dielectric of the library (roughness `STRAND_ROUGHNESS`, drawn on both sides,
 *                 which the glTF asked for and a library material does not give), whose colour is the RATIO of the
 *                 colour he chose to the colour the file was baked at (the hex in the name: `hairstrand:4a3220`)
 *                 multiplied into the per-vertex colour. The vertex colour keeps the lay: every strand its own shade,
 *                 dark at the root and lit at the tip. That is the direction the surface needs and a flat colour cannot have.
 *
 * THE RIBBONS' COLOUR ATTRIBUTE IS MOVED WHERE THE PROP ENTERS THE GAME (`adoptStrandColours`, in
 * `authoredProps.ts`), not here: a handler receives a mesh's NAME and never its geometry, and the fix for "the colour
 * is in the wrong attribute" is a fix to the geometry. A file that carries its colour in `COLOR_0`, as a re-export
 * with the exporter corrected would, has no `COLOR_1` and is left exactly as it is; this handler is right for both.
 *
 * WHAT IT DOES NOT DO, and the deferral rides `hairmap --authored`: the beard does not fade into the skin at the
 * growth line (that is a per-vertex tint against a skin colour the prop does not know) and there is no anisotropic
 * highlight (`MeshStandardMaterial` has no such term; the sheen band the `hair` substance draws lives in its roughness
 * map, which a ribbon whose UV is (0|1, t) cannot sample).
 *
 * THE CONTRACT is in `authoredDress.ts`. Return a material to claim the ask, null to pass, never mutate `base()`.
 */
import * as THREE from "three";
import type { AuthoredMaterialHandler, AuthoredDressContext } from "./authoredDress";

/**
 * How rough a ribbon is. A strand is a cylinder seen edge-on to every light; a sheen there turns dark hair to frost.
 * 0.81 and not 0.8, on purpose: `standard(colour)` defaults to 0.8 and the library keys its cache on the roughness, so
 * this is a key of our own, and the registered twin we recolour cannot be somebody else's `twin(standard(colour))`.
 */
export const STRAND_ROUGHNESS = 0.81;
/**
 * The under-cap as a share of the hair's own colour. The file's own was 0.5 of an already dark hex (L* 3-10 lit); the
 * ribbons average 0.58 of theirs (the shade and the root-to-tip ramp), so 0.6 of the colour puts the two at the same
 * mean value and the cap never reads as pale scalp between the strands.
 */
export const CAP_FACTOR = 0.6;
/** What the ribbons' per-vertex colour is scaled by, on top of the ratio of the man's colour to the baked one. 1 is exact. */
export const STRAND_GAIN = 1;
/** The colour a man gets when his appearance says nothing: the class default, `defaultAppearance`'s. */
const DEFAULT_HAIR = 0x4a3220;

const colourOf = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : DEFAULT_HAIR);

/** `hairColor` for the hair and `beardColor` for a beard: told apart by the mesh's own name (`beard__strands`, `beard-huscarl-full_1`, `beard_40`). */
export function hairColourFor(ctx: AuthoredDressContext, meshName: string): number {
  return /^beard/i.test(meshName) ? colourOf(ctx.appearance.beardColor) : colourOf(ctx.appearance.hairColor);
}

const scaled = (hex: number, k: number): number => new THREE.Color(hex).multiplyScalar(k).getHex();

/**
 * The ribbons' material for one colour. Cached by the LIBRARY: `standard(colour, ..)` is the library's own cached
 * material, adopted by its environment, and `twin()` is its registered clone, which follows the sky when the mood
 * changes. So one man's ribbons are every man's ribbons in that colour, and a clone we configure is a clone the library
 * keeps in step. Configured once (`userData.hairStrand`), never per call.
 */
function ribbons(ctx: AuthoredDressContext, wanted: number, baked: number): THREE.Material {
  const M = ctx.materials;
  const m = M.twin(M.standard(wanted, STRAND_ROUGHNESS, 0)) as THREE.MeshStandardMaterial;
  if (m.userData.hairStrand === `${wanted}:${baked}`) return m;
  const to = new THREE.Color(wanted), from = new THREE.Color(baked);
  const ratio = (a: number, b: number): number => (b > 1e-6 ? (a / b) * STRAND_GAIN : STRAND_GAIN);
  m.name = `hairstrand:${wanted.toString(16).padStart(6, "0")}`;
  m.color.setRGB(ratio(to.r, from.r), ratio(to.g, from.g), ratio(to.b, from.b));
  m.vertexColors = true;
  m.side = THREE.DoubleSide;
  m.needsUpdate = true;
  m.userData.hairStrand = `${wanted}:${baked}`;
  return m;
}

export const dressHair: AuthoredMaterialHandler = (ask, mesh, ctx) => {
  const wanted = hairColourFor(ctx, mesh.name);
  switch (ask.surface) {
    case "hair": return ctx.materials.tinted("hair", wanted);
    case "hairunder": return ctx.materials.tinted("hair", scaled(wanted, CAP_FACTOR));
    case "hairstrand": return ribbons(ctx, wanted, ask.color);
    default: return null;
  }
};
