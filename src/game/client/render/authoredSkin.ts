/**
 * THE SKIN HANDLER — owner: U5 (heads and faces). A pass-through today.
 *
 * WHAT IT IS FOR. Every skin part in an authored warrior arrives as
 * `skin:<hex>` and is dressed with the library's tinted skin at a 35 mm world
 * tile, so a head is a face-sized area of red lattice and a hand is the same
 * material. What a head needs is a complexion map at texel rate (`faceMap.ts`,
 * rasterised from `faceComplexion` per class) multiplied onto the head and neck
 * parts, and the baked skin/iris hexes remapped to the man's own `SKIN_TONES`
 * and `IRIS_COLORS` by `ctx.faceSeed`. `mesh.isHead` (Head-bone weight 0.9 or
 * more) is the switch that tells a skull from a hand, which the name cannot.
 *
 * THE CONTRACT is written out in `authoredDress.ts`: return a material to claim
 * the ask, null to pass, never mutate `base()`. This file owns only the body of
 * `dressSkin`; the one line that chains it is in `authoredDress.ts` and is not
 * yours to edit. New helpers go in new files (`faceMap.ts`), one import each.
 */
import type { AuthoredMaterialHandler } from "./authoredDress";

export const dressSkin: AuthoredMaterialHandler = () => null;
