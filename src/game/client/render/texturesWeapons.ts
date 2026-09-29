/**
 * WEAPON AND SHIELD TEXTURE BUILDERS — owner: U7 (weapons and shields).
 *
 * Empty on purpose. `textures.ts` is one file with a builder per surface and a
 * `RECIPES` row per surface, and several units add to it; new builder FUNCTIONS
 * go in new files instead, so the only line of `textures.ts` a unit touches is
 * its one import and its one `RECIPES` row (CHAR-PLAN 3.0). U7's `ash` and
 * `lime` builders, and the steel, weldsteel and serpentsteel bodies when they
 * move, live here.
 */
export {};
