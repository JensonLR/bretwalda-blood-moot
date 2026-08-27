// Hand-kept declaration for the camera boom's occlusion march (8.7); see
// boom.mjs for the law and tools/solidtest.mjs for its claims.
declare module "@/game/boom.mjs" {
  import type { Solid, Passable } from "@/game/solidground.mjs";

  export interface BoomOpts {
    /** Full boom length wanted (the rig's CAM_DIST). */
    want: number;
    /** Never shorter than this — inside the man's head is the worse frame. */
    min: number;
    /** March stride, metres. */
    step: number;
    /** Clearance a sample needs from a solid's face. */
    clear: number;
    /** Eye height at the man (boom fraction 0). */
    lookY: number;
    /** Camera height at full boom (fraction 1). */
    camY: number;
    /** The ground's play bound radius (`playBound`); the ring blocks the
     *  boom before the solids do, resolveSolids' own order. Omit or pass
     *  Infinity for no ring. */
    bound?: number;
  }

  export function clearBoom(
    occluders: ReadonlyArray<Solid | Passable>,
    focusX: number, focusZ: number,
    fwdX: number, fwdZ: number,
    sideX: number, sideZ: number,
    opts: BoomOpts,
  ): number;
}
