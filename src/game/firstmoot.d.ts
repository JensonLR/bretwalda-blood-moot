// Types for `firstmoot.mjs`, plain ESM for the same reason `tuition.mjs` is:
// the HUD and `tools/moottest.mjs` must load ONE definition of when a beat
// retires, and a rule that lives inside a React render can only be tested by
// standing up a browser.
declare module "@/game/firstmoot.mjs" {
  export interface MootPlayerSnapshot {
    position: { x: number; y: number; z: number };
    rotation: number;
    state: string;
    abilityActive: boolean;
    attackDir?: string;
    /** Authoritative — the wire carries it; never inferred from a timer. */
    swingHeavy?: boolean;
  }
  /** The running totals a single snapshot cannot know, kept by `note`. */
  export interface MootLedger {
    travelled: number;
    turned: number;
    dirs: Set<string>;
  }
  export interface MootBeat {
    id: string;
    /** The line for thumbs. */
    touch: string;
    /** The line for the keyboard. */
    desk: string;
    did(player: MootPlayerSnapshot, led: MootLedger): boolean;
  }
  export interface MootPhase {
    id: string;
    /** The name on the card. */
    title: string;
    /** The card's lines — the pause point's whole copy. */
    card: readonly string[];
    beats: readonly MootBeat[];
  }
  export const MOOT_PHASES: readonly MootPhase[];
  export const MOOT_BEATS: readonly MootBeat[];
  export const BEAT_DWELL: number;
  export const LOOK_ARC: number;
  export const FIRST_MOOT_KEY: string;
  export interface FirstMoot {
    readonly beat: MootBeat | null;
    readonly phase: MootPhase | null;
    /** The card now held up, or null. While it is set the rite is paused. */
    readonly card: MootPhase | null;
    readonly phaseAt: number;
    readonly phaseTotal: number;
    readonly at: number;
    readonly total: number;
    readonly done: boolean;
    /** May a foe raise his hand yet? */
    readonly armed: boolean;
    /** Dismiss the card and begin the phase's beats. */
    open(): void;
    note(player: MootPlayerSnapshot | null | undefined, dt: number): MootBeat | null;
    skip(): void;
  }
  export function createFirstMoot(opts?: {
    load?: () => string | null;
    save?: (v: string) => void;
  }): FirstMoot;
}
