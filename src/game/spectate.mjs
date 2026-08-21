// WHERE A DEAD MAN LOOKS — one definition, for the renderer and the harness.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS: A MIRRORED DEFINITION THAT DECLARED ITSELF
//
// The rule lived inside `GameCanvas.tsx`, in a React component no node harness
// can import, so `tools/spectatetest.mjs` carried a SECOND COPY of it and said
// so in as many words above `focusByRule`:
//
//     MIRRORED, AND IT IS A GAP — the choosing rule. ... `focusByRule` below
//     is a SECOND COPY of it, which is failure mode 3 in `docs/PROCESS.md` by
//     construction. So this phase can prove the RIG aims where it is told ...
//     it CANNOT prove `GameCanvas` hands it the right point.
//
// A harness that cannot fail when the code changes is not measuring the code.
// This is the same move `deathcam.mjs` and `roundreset.mjs` made for the same
// reason: the DECISION comes out of the component, both callers import it, and
// there is one answer to "where does the lens point".
//
// ---------------------------------------------------------------------------
// AND ONE DEFECT, WHICH THE OLD RULE'S OWN COMMENT ARGUES AGAINST
//
// The rule was: a living teammate, else THE MIDPOINT OF THE CLOSEST PAIR, else
// the lone survivor, else the middle of the ring. Its comment explains why the
// pair beat a centroid:
//
//     THE CLOSEST PAIR, NOT THE CENTROID. A centroid of four men spread round
//     the ring is a point with NOBODY STANDING ON IT, and the lens would frame
//     empty turf between them — which is the defect this whole branch exists to
//     fix ... The two men nearest each other are the two who are ABOUT TO
//     FIGHT, so their midpoint is where the round is actually being decided.
//
// That reasoning is right and it does not survive its own premise. When only
// two men are left and they are twelve metres apart, they are still the closest
// pair — and their midpoint is six metres of empty turf, which is exactly the
// thing the paragraph refuses. The premise "about to fight" has a distance in
// it, and the rule did not.
//
// IT WAS FOUND BY REMOVING SOMETHING ELSE. `spectatetest` §2 is seeded, and on
// the build that removed MERCY OR FINISH it went from 6 seeds green out of 8 to
// 4, with the aim's p90 distance to the nearest living man worse on six of the
// eight. Nothing in the camera changed. What changed is that a man at zero
// health now DIES instead of going down and being spared, so the arena empties
// sooner and the last pair spend longer closing across it — and the rule spent
// that time pointed between them. Mercy had been hiding this by keeping the
// ring full. That is the whole shape of this branch: a feature was removed and
// what it had been masking came up behind it.
import { WEAPON_REACH, BODY_MIN_SEP } from "./engine.mjs";

export const SPECTATE = {
  /**
   * How far apart two men can be, centre to centre, and still be FIGHTING.
   *
   * Derived, not chosen: it is the sim's own statement of how wide a man is
   * plus the longest weapon in the game. Inside it, a blow can land and the
   * midpoint between the two is a place a fight is happening. Outside it,
   * nothing either man does reaches the other, they are closing rather than
   * fighting, and their midpoint is turf.
   *
   *     BODY_MIN_SEP 1.05  +  max(WEAPON_REACH) 1.44 (warden)  =  2.49 m
   *
   * Both numbers are imported. A copy of either here would be the mirrored
   * definition this file exists to remove.
   */
  strike: BODY_MIN_SEP + Math.max(...Object.values(WEAPON_REACH)),
};

/**
 * The aim, with the one piece of memory it needs.
 *
 * MEMORY, AND ONLY FOR THE TIE. When the closest pair are too far apart to be
 * fighting, the lens has to choose one of two men, and choosing by id or by
 * position would make the pick flip as they move — a lens that cuts between two
 * men every few frames is worse than one pointed at nothing. It picks whichever
 * of the two is nearer to WHERE IT IS ALREADY LOOKING, which is what a human
 * operator does and which cannot oscillate: having chosen a man, the lens is
 * already on him and he stays the nearer one until the other gets closer to him
 * than he is to himself, at which point they are inside `strike` and the
 * midpoint takes over anyway.
 *
 * `reset()` on a new round. The renderer and `tools/spectatetest.mjs` drive the
 * same object.
 */
export function createSpectateAim() {
  let ax = 0, az = 0, had = false;
  const out = { x: 0, z: 0, how: "", live: 0 };
  const put = (x, z, how, live) => {
    ax = x; az = z; had = true;
    out.x = x; out.z = z; out.how = how; out.live = live;
    return out;
  };
  return {
    reset() { ax = 0; az = 0; had = false; },
    /**
     * @param men  every man in the room: `{ id, x, z, team, dead }`. The
     *             renderer passes the RIG's smoothed position and the harness
     *             passes the server's; both are "where this client thinks he
     *             is", which is the only thing the aim may be built from.
     * @param me   `{ id, team }` — the viewer, who is excluded and whose team
     *             decides whether there is a mate to borrow sight from.
     */
    update(men, me) {
      const live = [];
      let mate = null;
      for (const m of men) {
        if (!m || m.dead || m.id === me?.id) continue;
        if (!mate && me?.team && me.team !== "none" && m.team === me.team) mate = m;
        live.push(m);
      }
      // 1. A LIVING TEAMMATE. You may borrow the sight of a man on your own
      //    side and no one else's — see the note in GameCanvas.tsx.
      if (mate) return put(mate.x, mate.z, "a living teammate", live.length);
      if (live.length > 1) {
        let a = live[0], b = live[1], best = Infinity;
        for (let i = 0; i < live.length; i++) {
          for (let j = i + 1; j < live.length; j++) {
            const d = (live[i].x - live[j].x) ** 2 + (live[i].z - live[j].z) ** 2;
            if (d < best) { best = d; a = live[i]; b = live[j]; }
          }
        }
        // 2. THE CLOSEST PAIR, IF THEY ARE CLOSE ENOUGH TO BE A PAIR.
        if (best <= SPECTATE.strike * SPECTATE.strike) {
          return put((a.x + b.x) / 2, (a.z + b.z) / 2, "the closest pair's midpoint", live.length);
        }
        // 3. ...AND ONE OF THEM IF THEY ARE NOT. They are closing, not
        //    fighting; the midpoint is turf. See the header.
        const da = had ? (a.x - ax) ** 2 + (a.z - az) ** 2 : a.x * a.x + a.z * a.z;
        const db = had ? (b.x - ax) ** 2 + (b.z - az) ** 2 : b.x * b.x + b.z * b.z;
        const n = da <= db ? a : b;
        return put(n.x, n.z, "the nearer of two men still closing", live.length);
      }
      // 4. THE LAST MAN, and then the middle of the ring: the round is over bar
      //    the tally and the middle is where what comes next will be.
      if (live.length === 1) return put(live[0].x, live[0].z, "the lone survivor", 1);
      return put(0, 0, "nobody left standing", 0);
    },
  };
}
