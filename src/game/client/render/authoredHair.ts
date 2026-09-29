/**
 * THE HAIR HANDLER — owner: U6 (palette, livery and dressing). A pass-through today.
 *
 * WHAT IT IS FOR. Hair and beard are exported as `hairstrand` shells over a
 * `hairunder` cap and come out of the library in the wrong substance, at a
 * fixed value. This dresses them in the `hair` substance with
 * `material.color = ctx.appearance.hairColor` (or `beardColor`, told apart by
 * `mesh.name`) over the baked `0x4a3220`, and sets the strand specular, sheen
 * and under-cap factor. It answers both the baked default hair and the props
 * `dressAuthoredHead` hangs, which reach the resolver with `mesh.dominantBone`
 * `"Head"`.
 *
 * THE CONTRACT is in `authoredDress.ts`. Return a material to claim the ask,
 * null to pass, never mutate `base()`.
 */
import type { AuthoredMaterialHandler } from "./authoredDress";

export const dressHair: AuthoredMaterialHandler = () => null;
