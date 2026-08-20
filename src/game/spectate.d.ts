// Types for `spectate.mjs`, which is plain ESM for the same reason
// `deathcam.mjs` is: the renderer and the node harness must load ONE definition
// of where a dead man's lens points. This rule used to live inside
// `GameCanvas.tsx` with a second copy in `tools/spectatetest.mjs`, and that
// harness said so itself — a copy the test cannot fail on is not a test.
declare module "@/game/spectate.mjs" {
  export const SPECTATE: {
    /**
     * Centre-to-centre metres inside which two men can reach each other:
     * `BODY_MIN_SEP + max(WEAPON_REACH)`. Outside it they are closing, not
     * fighting, and the midpoint between them is turf.
     */
    strike: number;
  };

  export interface SpectateMan {
    id: string;
    x: number;
    z: number;
    team?: string | null;
    dead?: boolean;
  }

  export interface SpectateAimResult {
    x: number;
    z: number;
    /** Which clause chose it, for a harness to print and assert on. */
    how: string;
    /** Living men who were candidates, the viewer excluded. */
    live: number;
  }

  export interface SpectateAim {
    /** A new round. Drops the memory used to break the far-pair tie. */
    reset(): void;
    /** The result object is REUSED — read it, do not keep it. */
    update(men: Iterable<SpectateMan>, me: { id: string; team?: string | null } | null): SpectateAimResult;
  }

  export function createSpectateAim(): SpectateAim;
}
