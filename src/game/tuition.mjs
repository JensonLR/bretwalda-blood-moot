// WHEN A TUITION LINE LEAVES.
//
// The owner, verbatim, 13 Aug 2026:
//
//   "Flick screen to change foe stays on screen permanently that needs to fade
//    away."
//
// He is right and the reason is worse than "nobody added a timer". The line was
// already written to retire — `GameHud.tsx` drew it under `!hasSwitched`, and
// `hasSwitched` is `input.ts`'s `lock.switches`, which increments in
// `applySwitch` AFTER a new man has been found:
//
//     const next = take ?? wrap;
//     if (!next) return;          // <- no second man; nothing is counted
//     lock.id = next;
//     lock.switches++;
//
// So the line retires when the SWITCH LANDS, and in an honour duel there is
// nobody to switch to, so a switch can never land, so the line never retires. In
// the mode the owner plays it is not a hint at all — it is a permanent caption,
// on the one surface a phone player is trying to look through. Flicking harder
// does not help and there is nothing on screen to say why.
//
// ---------------------------------------------------------------------------
// WHAT IT KEYS OFF, AND WHY NOT TIME ALONE
//
// A hint whose job is to teach a GESTURE should leave when the gesture has been
// used. Time alone is the obvious answer and it is the wrong one on its own: a
// six-second line is furniture for six seconds to the player who already flicked
// on second two, and it comes back next round to the player who has been doing
// it for a week. So three keys, in this order of authority:
//
//   1. THE GESTURE WAS MADE. Not "a switch landed" — the gesture. `input.ts`
//      counts it in `requestTargetSwitch`, which is the point where the thumb
//      has been read and the direction is known, BEFORE the lock goes looking
//      for a man on that side. Whether there was anybody there is the game's
//      business; the player has demonstrated that he knows the control. This one
//      line is the whole of the duel fix.
//   2. IT HAS BEEN ON SCREEN LONG ENOUGH. `seconds` of ELIGIBLE time — time
//      while the line is actually up and the control it describes would actually
//      do something. A clock that runs while the man is dead, or in the lobby,
//      or with nobody locked, is a clock that expires the hint before it has
//      been read.
//   3. IT HAS HAD ITS TURNS. `airings` of it, ever, across sessions. A player
//      who never flicks is still taught — three times, for six seconds — and
//      then the game stops asking.
//
// Keys 1 and 3 are PERSISTED, so a player who has demonstrably learned the
// gesture never sees it again on that device, and a player who has ignored it
// three times is not shown it a fourth on the next visit. Key 2 is not: it is
// about this airing.
//
// ---------------------------------------------------------------------------
// WHY THIS IS A FILE AND NOT AN `if` IN THE HUD
//
// Same argument as `deathcam.mjs` and `roundreset.mjs`. What is worth asserting
// is a DECISION — "the line has stopped teaching, so it goes" — and a decision
// inside a React render can only be tested by standing up a browser. Everything
// here is arithmetic over numbers and one string, so `tools/tuitiontest.mjs`
// drives the real one. There is one definition of when a hint leaves.

/**
 * The foe-switch line's terms.
 *
 * `seconds` is six because that is a slow read of eleven words plus the time to
 * look away from the fight and back; it is not tuned to make anything pass.
 * `airings` is three for the same reason a game shows a control prompt more than
 * once and fewer times than four.
 */
export const FOE_HINT = {
  /** Seconds of eligible time one airing lasts. */
  seconds: 6,
  /** Airings a player who never uses the gesture gets, ever, on this device. */
  airings: 3,
  /** Seconds it takes to leave. It fades; it does not blink out. */
  fade: 0.7,
};

/** The persisted verdict for a player who has used the gesture. */
const LEARNED = "used";

/**
 * A tuition line that teaches and then gets out of the way.
 *
 * @param opts.terms  `FOE_HINT` by default; a different line brings its own.
 * @param opts.load   () => string|null — the stored verdict for this device.
 * @param opts.save   (v: string) => void — writes it back.
 *
 * `load`/`save` are injected rather than reaching for `localStorage` here for
 * two reasons and both are load-bearing: this module is imported by a Next
 * server render where `window` does not exist, and a harness has to be able to
 * drive a player who has never seen the line and a player who learned it last
 * week without clearing a browser.
 */
export function createTuitionHint({ terms = FOE_HINT, load = () => null, save = () => {} } = {}) {
  /**
   * Three phases and they are not interchangeable:
   *
   *   waiting   nothing on screen. The next rise in eligibility starts an airing.
   *   teaching  the line is up, and its clock runs ONLY while eligible.
   *   leaving   the line is fading, and this clock runs on REAL time whatever
   *             eligibility does — a fade that pauses because the lock let go
   *             leaves a caption frozen half-transparent over the fight, which
   *             is a worse artefact than the one this file exists to remove.
   */
  let phase = "waiting";
  /** Seconds of ELIGIBLE time this airing has been up. */
  let taught = 0;
  /** Seconds of REAL time it has been fading. */
  let left = 0;
  /**
   * Airings already spent. Read once — a store re-read every frame is a store
   * read sixty times a second for a value that changes twice in a career.
   */
  const stored = load();
  let spent = stored === LEARNED ? terms.airings : Math.max(0, parseInt(stored ?? "0", 10) || 0);
  let learned = stored === LEARNED;
  /**
   * An airing has finished and eligibility has not dropped since. Without this
   * the line restarts on the frame its own clock expired, because the thing that
   * made it eligible — a man under the lock — is still true.
   */
  let latched = false;
  /** What the last frame said about eligibility; `visible` needs it. */
  let able = false;

  const retired = () => learned || spent >= terms.airings;

  return {
    /** Drawn at full opacity: teaching, and the control it describes is live. */
    get visible() { return phase === "teaching" && able; },
    /** Drawn at all — the fade is part of the line, not the absence of it. */
    get alive() { return (phase === "teaching" && able) || phase === "leaving"; },
    /** 1 while teaching, 0 once gone. What the DOM puts on `opacity`. */
    get opacity() { return phase === "teaching" && able ? 1 : 0; },
    /** Seconds of eligible time this airing has had. Diagnostics and harness. */
    get taught() { return taught; },
    /** Airings finished. */
    get spent() { return spent; },
    /** Has the player demonstrated the gesture. */
    get learned() { return learned; },
    get phase() { return phase; },

    /**
     * The gesture happened. It leaves — through the fade rather than by
     * vanishing, because a caption that disappears on the same frame as a thumb
     * movement reads as something having gone wrong — and it never comes back on
     * this device.
     *
     * Safe from any phase, including from `waiting`: a player who flicks before
     * he has ever been shown the line has still demonstrated the control, and the
     * point of persisting it is that he is never shown it.
     */
    used() {
      if (!learned) { learned = true; save(LEARNED); }
      if (phase === "teaching") { phase = "leaving"; left = 0; }
    },

    /** A new match, a new page. The persisted verdict survives; the clock does not. */
    reset() {
      phase = "waiting";
      taught = 0;
      left = 0;
      latched = false;
      able = false;
    },

    /**
     * One frame.
     *
     * @param dt        seconds.
     * @param eligible  is the line up and is the control it describes live. The
     *                  teaching clock only runs while this is true, so a line
     *                  nobody could have read does not count as having been read.
     * @returns whether the line should be drawn at all this frame.
     */
    update(dt, eligible) {
      const step = Math.max(0, dt);
      able = !!eligible;
      if (!able) latched = false;

      if (phase === "leaving") {
        left += step;
        if (left >= terms.fade) { phase = "waiting"; taught = 0; left = 0; }
        return this.alive;
      }
      if (retired()) return false;
      if (phase === "waiting") {
        if (able && !latched) { phase = "teaching"; taught = 0; }
        return this.alive;
      }
      // teaching
      if (able) {
        taught += step;
        if (taught >= terms.seconds) {
          // The airing is over. Bank it BEFORE the fade, so a player who closes
          // the tab mid-fade does not get the same airing again.
          spent += 1;
          if (!learned) save(String(spent));
          latched = true;
          phase = "leaving";
          left = 0;
        }
      }
      return this.alive;
    },
  };
}

/**
 * The browser's store, in one place so the key is written once.
 *
 * A device that refuses storage — private browsing, a locked-down webview — gets
 * a hint that behaves exactly as it does for a new player every session, which
 * is the right failure: it teaches, three times, and leaves. It must never
 * throw, because a caption is not worth a blank screen.
 */
export const FOE_HINT_KEY = "bretwalda.taught.foe";

export function browserStore(key) {
  return {
    load: () => {
      try { return typeof localStorage === "undefined" ? null : localStorage.getItem(key); } catch { return null; }
    },
    save: (v) => {
      try { if (typeof localStorage !== "undefined") localStorage.setItem(key, v); } catch { /* refused */ }
    },
  };
}
