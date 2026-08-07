// Types for `grace.mjs`, which is plain ESM so the engine, the renderer and the
// node harness can all load one definition of the grace period. Same
// arrangement as `grounds.mjs` and `engine.mjs`, and for the same reason.
declare module "@/game/grace.mjs" {
  /** Room phases in which a man can actually be struck. */
  export const FIGHT_STATES: string[];

  /**
   * Is this warrior under the fight's grace on the frame this packet describes?
   * Pure: both facts are the server's, so the client holds no duration that
   * could outlive its own trigger.
   */
  export function underGrace(
    player: { invincible?: boolean } | null | undefined,
    matchState: string | null | undefined,
  ): boolean;

  /** How fast the drawn mark chases the truth, in e-folds per second. */
  export const GRACE_EASE: number;

  /** One frame of the drawn mark: ease `current` toward `target`. */
  export function easeGrace(current: number, target: number, dt: number): number;
}
