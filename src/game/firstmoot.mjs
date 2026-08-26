// THE FIRST MOOT — the teaching half of the rite that replaced the campaign.
//
// The owner, 26 Aug 2026, ruling the campaign row closed:
//
//   "do we really need a campaign? I feel like a cool starter tutorial for new
//    arrivals would be better? we could maybe even have them pick their kingdom
//    in this part while also showing how to play? could make it cinematic &
//    cool?"
//
// So the First Moot is two acts and this module is the spine of the first:
// a new arrival's opening solo fight carries a sequence of taught BEATS —
// move, strike, guard, dodge, the power — each one a single line on the glass
// that leaves when the act it teaches has been DEMONSTRATED, in the exact
// sense `tuition.mjs` established for the foe hint: a line that teaches a
// gesture retires when the gesture lands, never on a timer alone. The second
// act — the kingdom chosen with the oath — is a screen, not a state machine,
// and lives in `page.tsx`.
//
// WHAT COUNTS AS DEMONSTRATED IS READ OFF THE SIM, NOT OFF THE GLASS. A beat
// advances when the SERVER's snapshot of the local player shows the act —
// `state === "attacking"` is a strike the sim honoured, three metres of
// covered ground is movement that actually happened. Keying off raw input
// would pass a tap the server refused (mid-stagger, out of stamina), teach the
// player a lie, and split into a touch path and a keyboard path; the snapshot
// is one truth for both. It is also what makes this module drivable headless:
// hand `note()` a sequence of player states and the whole rite runs without a
// browser, which is what `tools/moottest.mjs` does on every edit.
//
// Like `tuition.mjs`, storage is injected: this file is imported by a server
// render where `window` does not exist, and the harness has to play both a
// stranger and a graduate without clearing anybody's browser.

/** Where the verdict lives on a device. One key, two values: a beat index
 *  ("2"), or DONE. */
export const FIRST_MOOT_KEY = "bretwalda.firstmoot";
const DONE = "done";

/**
 * A beat holds its line for at least this many seconds of eligible time even
 * after its act lands, so a player who was already sprinting when the MOVE
 * line rose still reads the words that named what he did. Without the dwell
 * the whole rite can strobe past in four frames for a player mashing every
 * control at once — which is most of them.
 */
export const BEAT_DWELL = 1.4;

/**
 * The beats, in the order a fight teaches them. `did` reads one snapshot of
 * the local player (plus the metres he has covered since the rite began,
 * accumulated by `note` because a single snapshot cannot know it).
 *
 * Copy is the parchment voice, and each line names the CONTROL in the words
 * the platform uses — `touch` for thumbs, `desk` for the keyboard the desktop
 * glass documents. The HUD picks which half to print; this module does not
 * know what a screen is.
 */
export const MOOT_BEATS = Object.freeze([
  {
    id: "move",
    touch: "Your left thumb is your feet — walk the ring.",
    desk: "WASD is your feet — walk the ring.",
    did: (p, travelled) => travelled >= 3,
  },
  {
    id: "strike",
    touch: "Strike — tap the crossed blades; flick as you tap to name the cut.",
    desk: "Strike — click, and move as you click to name the cut.",
    did: (p) => p.state === "attacking",
  },
  {
    id: "guard",
    touch: "Hold your shield up — a guard held at the blow's own beat turns it.",
    desk: "Hold right-click — a guard held at the blow's own beat turns it.",
    did: (p) => p.state === "blocking",
  },
  {
    id: "dodge",
    touch: "Dodge — a step taken early is a blow that never lands.",
    desk: "Dodge (SPACE) — a step taken early is a blow that never lands.",
    did: (p) => p.state === "dodging" || p.state === "rolling",
  },
  {
    id: "power",
    touch: "Your power — every class carries one. Spend it and see.",
    desk: "Your power (Q) — every class carries one. Spend it and see.",
    did: (p) => p.abilityActive === true || p.state === "ability",
  },
]);

/**
 * The rite. `load`/`save` carry the device's progress; both optional so a
 * server render can construct one inert.
 */
export function createFirstMoot({ load = () => null, save = () => {} } = {}) {
  const stored = load();
  let done = stored === DONE;
  let at = done ? MOOT_BEATS.length : Math.min(MOOT_BEATS.length - 1, Math.max(0, parseInt(stored ?? "0", 10) || 0));
  /** Seconds the current beat has been up. */
  let up = 0;
  /** True once the current beat's act has been seen (dwell may still hold it). */
  let landed = false;
  /** Metres covered since the rite began — the MOVE beat's own ledger. */
  let travelled = 0;
  let lastX = null;
  let lastZ = null;

  const finish = () => {
    if (!done) { done = true; save(DONE); }
  };

  return {
    /** The current beat, or null when the rite is over. */
    get beat() { return done ? null : MOOT_BEATS[at] ?? null; },
    /** How many beats are behind him, for a progress read (2 OF 5). */
    get at() { return Math.min(at, MOOT_BEATS.length); },
    get total() { return MOOT_BEATS.length; },
    get done() { return done; },

    /**
     * One frame of the rite: the sim's snapshot of the local player and the
     * seconds since the last call. Returns the beat that just RETIRED when
     * one does — the HUD uses that edge for its chime — and null otherwise.
     */
    note(player, dt) {
      if (done || !player) return null;
      // The travel ledger runs whatever the beat, so a player who walked
      // before the MOVE line rose is not asked to walk twice — but it counts
      // only ground covered in a MOVING state. The first live frame showed
      // why: the spawn's own repositioning and the countdown settle covered
      // three metres for a player who never touched the stick, and MOVE
      // retired unearned. A teleport is not a step.
      const moving = player.state === "walking" || player.state === "running" || player.state === "sprinting";
      if (lastX !== null && moving) travelled += Math.hypot(player.position.x - lastX, player.position.z - lastZ);
      lastX = player.position.x; lastZ = player.position.z;

      const beat = MOOT_BEATS[at];
      if (!beat) { finish(); return null; }
      up += dt;
      if (!landed && beat.did(player, travelled)) landed = true;
      if (landed && up >= BEAT_DWELL) {
        const retired = beat;
        at += 1;
        up = 0;
        landed = false;
        if (at >= MOOT_BEATS.length) finish();
        else save(String(at));
        return retired;
      }
      return null;
    },

    /**
     * The graduate's door. "I know the fight — take me to the war" is a real
     * need (a returning player on a fresh device), and a rite that traps him
     * is a tutorial, which is the word the owner did not use.
     */
    skip() { finish(); },
  };
}
