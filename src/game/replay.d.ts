// Types for `replay.mjs`, which is plain ESM for the same reason
// `deathcam.mjs` and `roundreset.mjs` are: the renderer and the node harness
// must load ONE definition of what is recorded and when the replay runs. A
// decision that lives inside a React effect can only be tested by standing up a
// browser, and a decision nobody can test is a decision that drifts.
declare module "@/game/replay.mjs" {
  /** The constants, and every one of them is derived — see the file. */
  export const REPLAY: {
    /** Playback speed. A half. */
    rate: number;
    /** Seconds of fight before the killing blow. The slowest swing's windup. */
    pre: number;
    /** Seconds after it. What the budget leaves. */
    post: number;
    /** Wall seconds the player waits. Fits inside the server's ROUND_BREAK. */
    wall: number;
    /** Seconds of fight shown. `wall * rate`. */
    fight: number;
    /** Seconds of history the ring holds. Must clear `pre + wall*(1-rate)`. */
    history: number;
    /** Record rate, the server's tick. */
    hz: number;
  };

  /** A man, as the ring holds him: exactly the fields `anim.ts` reads. */
  export interface ReplayPlayer {
    id: string;
    warriorClass: string;
    team: string;
    position: { x: number; y: number; z: number };
    rotation: number;
    velocity: { x: number; y: number; z: number };
    state: string | null;
    attackDir: string | null;
    attackTimer: number;
    swingT: number;
    swingDuration: number;
    swingHeavy: boolean;
    blockTimer: number;
    staggerTimer: number;
    downTimer: number;
    hitstop: number;
    health: number;
    maxHealth: number;
    invincible: boolean;
    abilityActive: boolean;
    deathZone: string | null;
    deathDir: string | null;
    deathHeavy: boolean;
    deathCause: string | null;
  }

  export interface ReplayBuffer {
    readonly seats: number;
    readonly cap: number;
    readonly hz: number;
    /** Bytes held. Allocated once; this never changes after construction. */
    readonly bytes: number;
    readonly frames: number;
    /** Sim time of the oldest and newest frames held, or null when empty. */
    readonly first: number | null;
    readonly last: number | null;
    reset(): void;
    /** One frame in. Allocates nothing. Call it once per server snapshot. */
    record(t: number, players: Iterable<unknown>): void;
    /** Slot index nearest at-or-before `t`, or -1. */
    slotAt(t: number): number;
    /**
     * Rebuild one recorded frame into `out`, which the caller owns and this
     * reuses. Returns how many men were written, or -1 if `t` is not held.
     */
    readInto(t: number, out: ReplayPlayer[]): number;
  }

  export function createReplayBuffer(opts?: {
    seats?: number; seconds?: number; hz?: number;
  }): ReplayBuffer;

  export interface ReplayFrame {
    /** Sim time to draw, and the value `ctx.time` must take. */
    at: number;
    /**
     * The wall dt already scaled by `rate`. THIS is what the animator must be
     * stepped with — not the frame's own dt. See the note in replay.mjs.
     */
    dt: number;
    /** 0..1 through the replay. */
    through: number;
    /** Is this the end of the MATCH rather than of a round. */
    atEnd: boolean;
  }

  export interface KillReplayState {
    readonly elapsed: number;
    readonly playing: boolean;
    /** True while a MATCH-ending replay is running, and through the frame it ends. */
    readonly atEnd: boolean;
    readonly skipped: boolean;
    /** Any key, any tap, any click. Ends it on the next frame. */
    skip(): void;
    /** A new round, a new match, a disconnect. Safe from any state. */
    reset(): void;
    update(
      dt: number,
      s: {
        /** Is the round over — `intermission` or `finished`. The rising edge arms it. */
        ended: boolean;
        /** Is this the end of the match rather than of a round. */
        end: boolean;
        /** Is the viewer's OWN death hold running. It outranks this. */
        own: boolean;
        /** Sim time of the killing blow, as the recorder stamped it. */
        deathAt: number;
        /** Is the ring holding `REPLAY.pre` seconds before it yet. */
        ready: boolean;
      },
    ): ReplayFrame | null;
  }

  export function createKillReplay(): KillReplayState;
}
