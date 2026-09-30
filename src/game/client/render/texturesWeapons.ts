/**
 * WEAPON AND SHIELD TEXTURE BUILDERS — owner: U7 (weapons and shields).
 *
 * Empty on purpose, still. CHAR-PLAN 3.0 reserved this file so that U7's `ash` and
 * `lime` builders and the steel bodies would not pile edits into `textures.ts`, and
 * U7 did not use it: `textures.ts` is compiled and imported standalone by `hairmap`
 * (tsc on that one file, Node's own resolver) and by `authoredtest` (Node's type
 * stripping, with the failure swallowed into `SURFACES: null`), and neither follows
 * a relative value import. A builder here would have made both read a file with no
 * surfaces. `buildSteel`, `buildAsh` and `buildLime` sit in `textures.ts` under
 * "the weapons' substances", and this file is the one place that says why. A unit
 * that wants to use it needs `hairmap` and `authoredtest` taught to resolve first.
 */
export {};
