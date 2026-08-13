// Types for `tuition.mjs`, which is plain ESM for the same reason
// `deathcam.mjs` and `roundreset.mjs` are: the HUD and the node harness must
// load ONE definition of when a tuition line stops teaching and leaves. A rule
// that lives inside a React render can only be tested by standing up a browser,
// and a rule nobody can test is the rule that shipped a caption which never went
// away in the mode the owner plays.
declare module "@/game/tuition.mjs" {
  export interface HintTerms {
    /** Seconds of ELIGIBLE time one airing lasts. */
    seconds: number;
    /** Airings a player who never uses the gesture gets, ever, on this device. */
    airings: number;
    /** Seconds it takes to leave. */
    fade: number;
  }

  export const FOE_HINT: HintTerms;

  /** localStorage key for the foe-switch line's verdict. */
  export const FOE_HINT_KEY: string;

  export interface HintStore {
    load(): string | null;
    save(v: string): void;
  }

  /** localStorage, wrapped so a device that refuses it cannot throw. */
  export function browserStore(key: string): HintStore;

  export interface TuitionHint {
    /** Drawn at all, fade included. */
    readonly alive: boolean;
    /** Drawn at full opacity. */
    readonly visible: boolean;
    /** 1 while teaching, 0 once gone. What the DOM puts on `opacity`. */
    readonly opacity: number;
    /** Seconds of eligible time this airing has had. */
    readonly taught: number;
    /** "waiting" | "teaching" | "leaving". */
    readonly phase: string;
    /** Airings finished. */
    readonly spent: number;
    /** Has the player demonstrated the gesture. */
    readonly learned: boolean;
    /** The gesture happened: it leaves, and never returns on this device. */
    used(): void;
    /** New match, new page. The persisted verdict survives; the clock does not. */
    reset(): void;
    /** One frame. `eligible` is "the line is up and the control would do something". */
    update(dt: number, eligible: boolean): boolean;
  }

  export function createTuitionHint(opts?: {
    terms?: HintTerms;
    load?: () => string | null;
    save?: (v: string) => void;
  }): TuitionHint;
}
