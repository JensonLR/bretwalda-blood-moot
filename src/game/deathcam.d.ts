// Types for `deathcam.mjs`, which is plain ESM for the same reason
// `roundreset.mjs` is: the renderer and the node harness must load ONE
// definition of where the camera goes when you die. A decision that lives
// inside a React effect can only be tested by standing up a browser, and a
// decision nobody can test is a decision that drifts.
declare module "@/game/deathcam.mjs" {
  export interface Vec3Like {
    x: number;
    y: number;
    z: number;
  }

  /** Seconds in each beat of the hold, and their sum. */
  export const DEATH_HOLD: {
    /** Lens still, watching the collapse. */
    fall: number;
    /** Easing round to the side the wound faces. */
    move: number;
    /** Sitting on the wound while the stump runs out. */
    linger: number;
    /** fall + move + linger. What a player experiences as "the hold". */
    total: number;
  };

  /** Field of view at the top of the hold and at the end of the move. */
  export const DEATH_FOV: { from: number; to: number };

  /**
   * Seconds in each beat of the ROUND's final death — the beat every man in the
   * room watches, winner and losers alike. Shorter than your own death: 2.20 s
   * inside the server's own 5 s break, so nothing waits on it.
   */
  export const ROUND_HOLD: {
    fall: number;
    move: number;
    linger: number;
    total: number;
  };

  /** Field of view for the round beat. Tighter than the death lens at both ends. */
  export const ROUND_FOV: { from: number; to: number };

  export interface DeathView {
    /** Seconds into the hold. */
    t: number;
    /** Where the follow camera was on the frame he died. No cut into the hold. */
    from: Vec3Like;
    /** The corpse's world position (feet), live. */
    body: Vec3Like;
    /** World point of the cut, live. Null for a death that took nothing off. */
    wound?: Vec3Like | null;
    /** Unit world direction the wound faces — the spray axis, and the angle. */
    spray?: Vec3Like | null;
    /** The severed piece's live world position. */
    part?: Vec3Like | null;
    /** The man who did it. Kept out of the line between lens and wound. */
    killer?: Vec3Like | null;
    /** Terrain height under a world point, so the lens never goes under it. */
    groundAt?: ((x: number, z: number) => number) | null;
    /** The clock. `DEATH_HOLD` when absent; the round beat hands `ROUND_HOLD`. */
    hold?: { fall: number; move: number; linger: number; total: number } | null;
    /** The lens. `DEATH_FOV` when absent; the round beat hands `ROUND_FOV`. */
    fov?: { from: number; to: number } | null;
  }

  export interface DeathShot {
    position: [number, number, number];
    target: [number, number, number];
    fov: number;
    /** Which beat this frame is in. */
    beat: "fall" | "move" | "linger";
    /** How far through the swing round to the wound, 0..1, eased. */
    moved: number;
  }

  /** One frame of the hold, as pure arithmetic. No clock, no state. */
  export function frameDeathShot(v: DeathView): DeathShot;

  export interface DeathCameraState {
    /** Seconds into the hold; 0 when nothing is held. */
    readonly elapsed: number;
    readonly holding: boolean;
    /** Any key, any tap, any click. Ends the hold on the next frame. */
    skip(): void;
    /** A respawn, a round change, a disconnect. Safe from any state. */
    reset(): void;
    update(
      dt: number,
      s: {
        dead: boolean;
        /**
         * Is the room still inside the round this death belongs to — fighting,
         * last stand or the break. False for the countdown and the match
         * summary, and it releases the lens at once.
         */
        live: boolean;
        camera: Vec3Like;
        body: Vec3Like;
        wound?: Vec3Like | null;
        spray?: Vec3Like | null;
        part?: Vec3Like | null;
        killer?: Vec3Like | null;
        groundAt?: ((x: number, z: number) => number) | null;
      },
    ): DeathShot | null;
  }

  export function createDeathCamera(): DeathCameraState;

  /** Where the round beat CUTS TO — the frame it opens on, before it moves. */
  export function roundOpening(v: {
    wound: Vec3Like;
    spray?: Vec3Like | null;
    killer?: Vec3Like | null;
    from?: Vec3Like | null;
    groundAt?: ((x: number, z: number) => number) | null;
  }): Vec3Like;

  export interface RoundCameraState {
    /** Seconds into the beat; 0 when nothing is held. */
    readonly elapsed: number;
    readonly holding: boolean;
    /** Any key, any tap, any click. Ends the beat on the next frame. */
    skip(): void;
    /** A new round, a new match, a disconnect. Safe from any state. */
    reset(): void;
    update(
      dt: number,
      s: {
        /** Is the room in the break this death ended. The rising edge arms it. */
        ended: boolean;
        /** May the beat still hold the lens. False once the next round is dealt. */
        live: boolean;
        /** Is the viewer's OWN death hold running this frame. It outranks this. */
        own: boolean;
        /** The last man to fall — feet, live, still collapsing through the break. */
        body: Vec3Like | null;
        wound?: Vec3Like | null;
        spray?: Vec3Like | null;
        part?: Vec3Like | null;
        killer?: Vec3Like | null;
        /** The viewer's lens. Last-resort bearing for the cut, not its start. */
        camera?: Vec3Like | null;
        groundAt?: ((x: number, z: number) => number) | null;
      },
    ): DeathShot | null;
  }

  export function createRoundCamera(): RoundCameraState;
}
