// ============================================================
// GRACE — the seconds in which a blow will not land, and what the picture is
// allowed to say about them.
//
// ONE CHANNEL, TWO FACTS. Sixth sighting of the shape, and it produced a bug
// the owner could see and no test could:
//
//   `player.invincible` carried BOTH "no blow may land on this man" (a rule the
//   server owns and enforces) AND "draw this man as not-quite-here" (a picture
//   the client owns and paints). The renderer blinked the whole body on and off
//   at 12 Hz for as long as that one flag was true.
//
// The two facts do not begin together and they do not end together, and the
// clock that ended the flag was not running:
//
//   `startRound` armed `invincibleTimer = 2.0` and then set the room to
//   `countdown`. The ONLY code that decrements that timer is `stepRoom`, and
//   `gameTick` skips every room that is not `fighting` / `last_stand`. So the
//   two seconds did not begin burning until the countdown ended — the bodies
//   strobed for the whole three-second countdown and then went on strobing for
//   a further two seconds INTO the fight. Measured, before the fix:
//
//       802ms  countdown   state=countdown  cd=3  invincible=2/2
//      3804ms  game_state  state=fighting   cd=0  invincible=2/2   <-- FIGHT!
//      5779ms  game_state  state=fighting   cd=0  invincible=0/2
//
// The fix is not a shorter timer. A duration drifts on a slow frame, a late
// packet and a phone, and this box produces all three. The mark is a PURE
// FUNCTION OF THE PACKET IN HAND: it is on only while the fight is actually
// running, so it is off for every frame of the countdown and off on the first
// frame of `fighting` because the fight starting is what turns it off — not
// because anything elapsed. There is no client-owned timer left to outlive its
// own trigger.
//
// Plain ESM rather than TypeScript so the engine, the renderer and
// `tools/gracetest.mjs` all read one definition instead of three that agree
// approximately. Same arrangement as `grounds.mjs`; see `grace.d.ts`.
// ============================================================

/**
 * Room phases in which a man can actually be struck. Grace means nothing
 * outside them: during `countdown` the simulation is not stepped and
 * `handleAttack` rejects every swing, so there is no blow for grace to stop and
 * nothing for the picture to explain.
 */
export const FIGHT_STATES = ["fighting", "last_stand"];

/**
 * Is this warrior under the fight's grace on the frame this packet describes?
 *
 * Both inputs are the server's — the flag and the phase — so the client holds
 * no duration of its own and cannot keep drawing a mark whose reason has ended.
 * The phase test is the load-bearing half: even if a future change leaks
 * `invincible` into a non-fighting phase again, the picture stays quiet.
 *
 * @param {{ invincible?: boolean } | null | undefined} player
 * @param {string | null | undefined} matchState
 * @returns {boolean}
 */
export function underGrace(player, matchState) {
  if (!player || !player.invincible) return false;
  return FIGHT_STATES.indexOf(String(matchState)) >= 0;
}

/**
 * How fast the drawn mark chases the truth, in e-folds per second.
 *
 * It exists so the mark ARRIVES and LEAVES rather than switching, which is the
 * difference between a warm frame and a UI blink. It is deliberately an ease
 * toward a target and never a countdown: it has no memory of when it started,
 * so it cannot survive the thing that started it. At a phase boundary the
 * target is already 0 and has been for every frame of the countdown, so the
 * drawn value is exactly 0 there — `tools/gracetest.mjs` asserts that number.
 */
export const GRACE_EASE = 9;

/**
 * One frame of the drawn mark: ease `current` toward `target`.
 *
 * @param {number} current
 * @param {number} target 0 or 1 — `underGrace` as a number.
 * @param {number} dt Seconds since the last frame.
 * @returns {number}
 */
export function easeGrace(current, target, dt) {
  const k = Math.min(1, Math.max(0, dt) * GRACE_EASE);
  const next = current + (target - current) * k;
  // Snap the tail. An ease never quite arrives, and a mark left at 0.004 for
  // the rest of the match is a uniform that never stops being written and a
  // test that has to be given a tolerance instead of a number.
  return Math.abs(next - target) < 0.002 ? target : next;
}
