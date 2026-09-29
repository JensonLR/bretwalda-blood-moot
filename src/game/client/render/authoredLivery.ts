/**
 * THE LIVERY HANDLER — owner: U6 (palette, livery and dressing). A pass-through today.
 *
 * WHAT IT IS FOR. The authored men carry the DEFAULT kit's hexes baked into
 * their material names (`mail:5f6b7a`, `wool:…`), so a man who swore to a people,
 * chose a finish, or stands on a team wears the default anyway. The role table
 * this file will build maps each baked hex to a `FinishKit` role, computed at
 * runtime from `FINISH_KIT[0x5f6b7a]` (robust to a re-graded default), and
 * resolves it through `kitFor(finishKit(armorColor), ctx.team, ctx.people)`
 * and `cloakFor(...)`. Livery is colour, not geometry.
 *
 * THE CONTRACT is in `authoredDress.ts`. Return a material to claim the ask,
 * null to pass, never mutate `base()`.
 */
import type { AuthoredMaterialHandler } from "./authoredDress";

/**
 * THE FIXED-COLOUR MATERIALS THE ROLE TABLE DELIBERATELY IGNORES — steel, brass
 * and bone that are the same on every man, the rune glow, the skin. One material
 * NAME per line, with the reason, appended by the unit that adds one (U3, U4, U7,
 * U8), so two units appending at once is a trivial concatenation:
 *
 *   "brass:bfa25c", // U3: belt fittings, fixed
 *
 * `roletable` (an `authoredtest` claim, U6) fails on a name in a warrior GLB that
 * is neither in the table nor here.
 */
export const EXCEPTIONS: readonly string[] = [
];

export const dressLivery: AuthoredMaterialHandler = () => null;
