// Types for `firstmoot.mjs`, plain ESM for the same reason `tuition.mjs` is:
// the HUD and `tools/moottest.mjs` must load ONE definition of when a beat
// retires, and a rule that lives inside a React render can only be tested by
// standing up a browser.
declare module "@/game/firstmoot.mjs" {
  export interface MootPlayerSnapshot {
    position: { x: number; y: number; z: number };
    state: string;
    abilityActive: boolean;
  }
  export interface MootBeat {
    id: string;
    /** The line for thumbs. */
    touch: string;
    /** The line for the keyboard. */
    desk: string;
    did(player: MootPlayerSnapshot, travelled: number): boolean;
  }
  export const MOOT_BEATS: readonly MootBeat[];
  export const BEAT_DWELL: number;
  export const FIRST_MOOT_KEY: string;
  export interface FirstMoot {
    readonly beat: MootBeat | null;
    readonly at: number;
    readonly total: number;
    readonly done: boolean;
    note(player: MootPlayerSnapshot | null | undefined, dt: number): MootBeat | null;
    skip(): void;
  }
  export function createFirstMoot(opts?: {
    load?: () => string | null;
    save?: (v: string) => void;
  }): FirstMoot;
}
