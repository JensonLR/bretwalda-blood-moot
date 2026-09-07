// When the arena has to be clean.
//
// `src/game/grace.mjs` exists because the countdown flash was a client-owned
// effect whose ending condition was owned by the server. This is the same shape
// and the same answer: the blood is the client's, the round is the server's,
// and until now nothing carried the second across to the first. A round ended,
// the room went `intermission` → `countdown` → `fighting`, every warrior was
// stood up on a fresh ring — and `vfx.ts` had never been told, so round two
// opened on round one's stains, on round one's marks-on-skin at the height the
// bodies had been, and on whoever was still alight when the last man fell.
//
// One predicate, exported, imported by `GameCanvas.tsx` and by
// `tools/goretest.mjs`, so there is exactly one definition of "a new round is
// being dealt" and the harness cannot drift away from the client.

/**
 * Has a new round just been dealt?
 *
 * @param {{state?: string, roundIndex?: number}|null} prev  the room as the client last held it
 * @param {{state?: string, roundIndex?: number}|null} next  the room as it is now
 * @returns {boolean} true on the ONE update that opens a new round
 *
 * Two clauses, because the wire says it two ways:
 *
 *   1. `roundIndex` went UP. `serializeRoom` puts it on every snapshot, so this
 *      is the reliable signal and it covers round 2 of a best-of-3 as well as
 *      round 1 of a fresh match (0 → 1).
 *
 *      Strictly up, never down. The match-end path rolls the room back to
 *      `lobby` with `roundIndex = 0` ten seconds after the last blow, and
 *      `render/summary.ts` is staging the victor over "a duel's corpse left
 *      where it fell" for exactly that window. Wiping the pool out from under
 *      that corpse would be this fix breaking the one picture the match ends on.
 *
 *   2. The room entered `countdown` and the update did not carry a round index.
 *      The per-second countdown ticks are thin — `{ countdown: n }` and nothing
 *      else — and `src/app/page.tsx` pins the phase to "countdown" itself while
 *      leaving the rest of the room as it was. A client that had missed the fat
 *      packet would otherwise never be told, so the phase edge is the backstop.
 *
 * Both fire at most once per round: clause 1 because the index only moves once,
 * clause 2 because it requires the *edge* into `countdown`.
 */
export function roundBoundary(prev, next) {
  if (!next) return false;
  const nr = Number.isFinite(next.roundIndex) ? next.roundIndex : 0;
  const pr = prev && Number.isFinite(prev.roundIndex) ? prev.roundIndex : 0;
  if (nr > pr) return true;
  const ps = prev ? prev.state : null;
  return next.state === "countdown" && ps !== "countdown";
}

/**
 * THE MATCH ENDING, which `roundBoundary` above deliberately does not catch.
 *
 * THE DEFECT, from a screenshot of the live game on 7 Sep 2026: blood floating
 * in mid air on the BATTLE COMPLETE screen. It is the same organ as the
 * round-boundary case and a different edge.
 *
 * `roundBoundary` fires on the round INDEX going up, or on the edge into
 * `countdown`. A match ending is neither — `endMatch` sets `finished` straight
 * out of `fighting` — so `clearBattle` was never called, and the summary then
 * stages a TABLEAU: different men, standing in different places from the ones
 * who just fought.
 *
 * The blood does not know that. `vfx.ts` stores marks on skin in the LOCAL
 * FRAME OF THE SPINE BONE, so each one is redrawn at chest height wherever that
 * bone has got to — and on a tableau the bone has got somewhere else entirely,
 * or belongs to a man who is not on it. That is the mid-air blood, and it is
 * the same sentence the round-boundary comment in `GameCanvas.tsx` already
 * wrote about the other edge.
 *
 * Separate from `roundBoundary` rather than folded into it, because that
 * function is shared with `tools/goretest.mjs` and its meaning — "a new round
 * is being dealt" — is not this one. Two edges, two names.
 */
export function matchBoundary(prev, next) {
  if (!next) return false;
  const ps = prev ? prev.state : null;
  return next.state === "finished" && ps !== "finished";
}
