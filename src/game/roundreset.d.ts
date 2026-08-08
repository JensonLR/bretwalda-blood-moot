// Types for `roundreset.mjs`, which is plain ESM so the renderer and the node
// harness can both load one definition of "a new round is being dealt". Same
// arrangement as `grace.mjs`, `grounds.mjs` and `engine.mjs`, and for the same
// reason: the seam that broke was one between a client-owned effect and a
// server-owned ending, and a seam with two definitions is the bug.
declare module "@/game/roundreset.mjs" {
  /** The part of a room update this predicate reads. */
  export interface RoundPhase {
    state?: string | null;
    roundIndex?: number | null;
  }

  /**
   * Has a new round just been dealt? True on the ONE update that opens one —
   * `roundIndex` rising, or the edge into `countdown` on a thin packet that
   * carries no index. Never on the way back down to the lobby, because the
   * match-end summary is staged over the corpse the last round left.
   */
  export function roundBoundary(
    prev: RoundPhase | null | undefined,
    next: RoundPhase | null | undefined,
  ): boolean;
}
