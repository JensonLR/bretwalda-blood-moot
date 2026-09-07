/**
 * THE CHAIN — what the second blow of a combination looks like, and the third.
 *
 * SPLIT OUT OF `anim.ts` 7 Sep 2026 so that it can be RUN BY A GATE. `anim.ts`
 * imports three.js and half the renderer; nothing under `tools/` can execute a
 * line of it, so every rule in this file would have been checked by reading
 * text or not at all. This module imports NOTHING, which is the whole point:
 * `tools/chaintest.mjs` calls these functions directly.
 *
 * The types live here rather than in `anim.ts` for the same reason — a gate
 * that builds a `Swing` needs the shape.
 */
// Four attacks, each a body throwing a weapon rather than an arm waving one.
export const SWINGS = {
    overhead: {
        // The elbow was folded to its anatomical stop at the top of this, on the
        // reasoning that a hard fold is what makes an overhead read as an overhead.
        // It is not, and the geometry says why: the shoulder already has the upper
        // arm pointing up and *back*, so folding from there swings the forearm back
        // down and buries the fist at the hip. Measured on the built rig the old
        // load put the sword point at shoulder height aimed at the enemy and the
        // "impact" put it 2.69 m in the air. The fold here is the 60° a raised arm
        // actually keeps, and the arm extends through the blow instead of gathering.
        arx: [2.78, -0.35, 0.06], arz: [0.30, -0.06, 0.14],
        arb: [-0.39, 0.54, -0.20],
        crx: [-0.28, 0.34, 0.07], cry: [0.50, -0.46, 0.02],
        prx: [-0.11, 0.17, 0.01], pry: [0.26, -0.30, 0.03],
        py: [0.025, -0.03, -0.01], pz: [-0.06, 0.15, 0.02],
        front: [-0.06, -0.44, -0.13], back: [0.14, 0.22, 0.08],
        frontB: [0.22, 0.64, 0.28], backB: [0.52, 0.14, 0.22],
        shift: [-0.85, 1.00, 0.30],
        aim: [-1.00, 1.98, 1.85], wz: [0, 0, 0], wy: [0, 0, 0],
    },
    // Forehand: cocked out on the weapon side, then dragged across the body. The
    // arm reaches forward as it crosses rather than sweeping flat through the
    // chest, because a hand that crosses the centreline at rib height on a
    // straight arm takes the whole humerus through the mail with it. With an
    // elbow the fold does that job properly — the hand can come inside the ribs
    // while the shoulder stays out where a shoulder lives.
    right: {
        arx: [1.06, -0.26, 0.06], arz: [0.86, -0.50, 0.15],
        arb: [-0.39, 0.44, -0.30],
        crx: [-0.06, 0.17, 0.04], cry: [0.48, -0.50, 0.02],
        prx: [0, 0.07, 0], pry: [0.24, -0.28, 0.03],
        py: [0.012, -0.035, -0.01], pz: [-0.04, 0.11, 0.02],
        front: [-0.09, -0.30, -0.11], back: [0.15, 0.22, 0.08],
        frontB: [0.18, 0.54, 0.26], backB: [0.46, 0.14, 0.22],
        shift: [-0.70, 0.95, 0.28],
        aim: [2.20, 1.80, 2.00], wz: [0.42, -0.36, 0], wy: [0, 0, 0],
    },
    // Backhand: wound behind the hip, then whipped out and away. Wound *behind*
    // and not across, for the same reason — the shoulder clears its own ribcage
    // going back, and does not going over.
    left: {
        arx: [1.02, -0.22, 0.06], arz: [-0.34, 0.72, 0.15],
        arb: [-0.29, 0.40, -0.30],
        crx: [0, 0.13, 0.04], cry: [-0.48, 0.44, 0.02],
        prx: [0, 0.05, 0], pry: [-0.20, 0.28, 0.03],
        py: [0.012, -0.03, -0.01], pz: [-0.03, 0.09, 0.02],
        front: [-0.10, -0.28, -0.11], back: [0.14, 0.20, 0.08],
        frontB: [0.18, 0.50, 0.26], backB: [0.44, 0.13, 0.22],
        shift: [-0.60, 0.90, 0.28],
        aim: [2.15, 1.75, 1.95], wz: [-0.36, 0.40, 0], wy: [0, 0, 0],
    },
    // Thrust: coil, then the whole body behind the point. The deepest fold of the
    // four and the straightest arm at contact, which is what a thrust *is*.
    stab: {
        arx: [0.71, -1.02, 0.06], arz: [0.24, -0.03, 0.13],
        arb: [-0.94, 0.56, -0.30],
        crx: [-0.12, 0.16, 0.03], cry: [0.46, -0.42, 0.02],
        prx: [-0.04, 0.09, 0], pry: [0.28, -0.32, 0.03],
        py: [0.012, -0.03, -0.01], pz: [-0.10, 0.28, 0.04],
        front: [-0.08, -0.42, -0.13], back: [0.14, 0.22, 0.08],
        frontB: [0.22, 0.66, 0.30], backB: [0.54, 0.12, 0.22],
        shift: [-0.75, 1.05, 0.36],
        aim: [1.30, 1.68, 1.86], wz: [0, 0, 0], wy: [-0.04, 0.13, 0],
    },
};
/* --------------------------------------------------------------------------
   THE CHAIN — what the second blow looks like, and the third
   -------------------------------------------------------------------------- */
/**
 * A BLOW IN A CHAIN IS NOT THE SAME BLOW AGAIN.
 *
 * `SWINGS` above holds four strokes, one per direction, and until 7 Sep 2026
 * that was the whole vocabulary: a man throwing three right-cuts threw the
 * identical animation three times. The engine has carried `comboCount` on the
 * wire the whole time — `min(1 + combo * 0.15, 1.6)` is a real damage
 * multiplier — and the picture never once read it. The chain was in the
 * numbers and absent from the man.
 *
 * DERIVED FROM THE BASE BY STATED RULES, not authored as eight more tables.
 * Twelve tables of magic numbers is twelve tables nobody can keep in step; a
 * rule can be argued with. Each `Key` is [load, release, settle], so a rule
 * that shortens a wind-up scales index 0 and leaves the rest alone.
 *
 * WHAT THE RULES ARE, and they come out of how men actually fought rather than
 * out of taste. The sources are in the commit that added this: short,
 * controlled strokes rather than dramatic swings, because a big recovery in a
 * press is how you get killed; and the weight travelling THROUGH the man, foot
 * to foot, rather than resetting between blows.
 *
 *   BLOW ONE    the stroke as authored. A full commitment from a set stance —
 *               he had time to wind up, so he did.
 *
 *   BLOW TWO    comes off the FIRST'S FOLLOW-THROUGH. There is no time to
 *               re-wind, so the load is cut hard; the hips are already turned,
 *               so the shoulder does more of the work; and the weight is
 *               already forward, so he STEPS THROUGH — `shift` inverts, and
 *               the man crosses onto the other foot instead of rocking back
 *               onto the one he started on. That inversion is the whole of the
 *               "distinct movement": blow two travels, blow one does not.
 *
 *   BLOW THREE+ the PIVOT. He has run out of forward — a man cannot step
 *               through twice in eight tenths of a second without ending up
 *               somewhere he did not choose — so the body turns instead of
 *               advancing. Least load of the three, most hip rotation, and the
 *               weight shift damped because he is rotating rather than going
 *               anywhere.
 *
 * Three is as far as this invents; four and beyond hold the pivot rather than
 * inventing a fourth idea. A man holding the attack button chains past three —
 * the engine's window opens when a stroke ENDS (see `COMBO_WINDOW`) — and what
 * he sees there is the third shape repeating under a cut cycle that is still
 * moving, which is the right answer: the body has run out of new ideas, the
 * blade has not.
 */
export const CHAIN_STEPS = 3;
/** Scale one [load, release, settle] triple per phase. */
const rekey = (k, load, release, settle) => [k[0] * load, k[1] * release, k[2] * settle];
/**
 * The stroke this blow of the chain should draw.
 *
 * `combo` is the engine's own `comboCount` — 1 for the first blow of a chain,
 * climbing while `comboTimer` holds. Anything at or below 1, and any value this
 * does not recognise, gets the authored stroke unchanged: a chain variant is an
 * addition to the vocabulary and must never be the thing a lone blow falls
 * back to.
 */
export function chainSwing(base, combo) {
    const step = Math.min(CHAIN_STEPS, Math.max(1, Math.floor(combo || 1)));
    if (step <= 1)
        return base;
    if (step === 2) {
        // OFF THE RECOVERY. Load cut to a third, release carried further, and the
        // weight crossing to the other foot rather than rocking back onto its own.
        return {
            ...base,
            arx: rekey(base.arx, 0.34, 1.14, 1), arz: rekey(base.arz, 0.38, 1.12, 1),
            arb: rekey(base.arb, 0.44, 1.10, 1),
            crx: rekey(base.crx, 0.5, 1.15, 1), cry: rekey(base.cry, 0.55, 1.12, 1),
            prx: rekey(base.prx, 0.5, 1.05, 1), pry: rekey(base.pry, 0.6, 1.08, 1),
            py: rekey(base.py, 0.4, 1.2, 1), pz: rekey(base.pz, 0.5, 1.25, 1),
            // The feet swap roles: what was the back foot drives, and the front one
            // steps past. This is the term a camera in front of him actually reads.
            front: rekey(base.front, 0.3, 1.35, 1), back: rekey(base.back, 0.35, 1.30, 1),
            frontB: rekey(base.frontB, 0.45, 1.20, 1), backB: rekey(base.backB, 0.4, 1.25, 1),
            // THE STEP THROUGH. Negated, not scaled: he ends on the other foot.
            shift: [-base.shift[0] * 0.55, -base.shift[1] * 0.85, -base.shift[2] * 0.6],
            wz: rekey(base.wz, 0.5, 1.15, 1),
        };
    }
    // THE PIVOT. He has run out of forward; the body turns.
    return {
        ...base,
        arx: rekey(base.arx, 0.24, 1.06, 1), arz: rekey(base.arz, 0.28, 1.05, 1),
        arb: rekey(base.arb, 0.32, 1.02, 1),
        crx: rekey(base.crx, 0.4, 1.10, 1), cry: rekey(base.cry, 0.45, 1.30, 1),
        prx: rekey(base.prx, 0.4, 1.02, 1),
        // The one channel that GROWS: the hips are doing what the feet no longer can.
        pry: rekey(base.pry, 0.5, 1.32, 1.1),
        py: rekey(base.py, 0.35, 1.05, 1), pz: rekey(base.pz, 0.3, 0.85, 1),
        front: rekey(base.front, 0.25, 0.80, 1), back: rekey(base.back, 0.3, 0.85, 1),
        frontB: rekey(base.frontB, 0.4, 0.95, 1), backB: rekey(base.backB, 0.35, 1.0, 1),
        // Damped, not inverted: a pivot goes round, not across.
        shift: rekey(base.shift, 0.45, 0.55, 0.7),
        wz: rekey(base.wz, 0.4, 1.25, 1),
    };
}
// ---------------------------------------------------------------------------
// WHICH CUT COMES NEXT
// ---------------------------------------------------------------------------
//
// THE DEFECT. The owner, having played the chain work above: "the desktop moves
// for fighting feel really boring & uninspired too". He is right, and the
// reason is not in this file's swing table — it is that a desktop player never
// gets to use it. `input.ts` picked the direction off the MOVEMENT KEYS:
//
//     if (down("left")) attackDir = "left";
//     else if (down("right")) attackDir = "right";
//     else if (down("forward")) attackDir = "overhead";
//     else if (down("back")) attackDir = "stab";
//     // and no else — so a man who is not walking keeps the last one
//
// So a desktop player standing his ground and clicking throws the IDENTICAL
// cut forever, and one who is moving throws whichever cut his feet happen to
// have chosen — advancing on W is an overhead every single time, which is the
// slowest and most committed stroke in the game handed out as the default for
// the most common thing a player does. Direction was never a decision on
// desktop. A phone player flicks and has all four; the desktop player had one.
//
// THE RULE. A chain runs a CYCLE. The opening blow is the player's — the
// movement keys still pick it, and on a phone the flick still picks every blow
// it describes — and each follow-on inside the combo window is the next stroke
// round the cycle, so no burst is ever the same stroke twice.
//
// AND THE CYCLE IS NOT ARBITRARY. It is how the strokes actually connect for a
// man with a shield on his left arm and a sword or a hand-axe in his right,
// which is what the period fought with (the shield is the weapon that decides
// the footwork; the sword is what goes round it):
//
//   right -> left      Forehand into backhand: the return stroke. The blade
//                      does not stop and does not re-wind — it comes back
//                      along the line it left on. `chainSwing` step 2 already
//                      inverts `shift` for this, and now the two agree: he
//                      steps onto the other foot AND cuts off the other side.
//   left  -> overhead  The backhand finishes high on the off side, so the
//                      blade is already up. It drops. Over the rim of his
//                      shield and down onto the head or the collar.
//   overhead -> stab   The downstroke ends with the point forward and low and
//                      the man's weight over his front foot. The thrust over
//                      the shield rim is the cheapest thing to do from there
//                      and it is the killing blow of the shield wall.
//   stab -> right      The point comes back, and a withdrawn point is a cocked
//                      forehand. Round again.
//
// THE TRADE, STATED. Holding a movement key steers only the OPENING blow: mid
// chain the cycle owns the line. A player who wants three thrusts waits out
// the 0.8 s window between them, which is a real cost and a real decision —
// depth, not a control taken away. The phone flick is exempt because it is a
// deliberate gesture made per blow rather than a key left held.
/** The four cuts, in the order a chain walks them. */
export const CUT_CYCLE = ["right", "left", "overhead", "stab"];
/**
 * `COMBO_WINDOW` from the engine, restated here because this module imports
 * NOTHING (see the header) — `tools/chaintest.mjs` holds the two to the same
 * number against `engine.mjs`'s own export, so the copy cannot drift.
 */
export const CHAIN_WINDOW = 0.45;
/**
 * The cut for blow `combo` of a chain that opened on `open`.
 *
 * `combo` is the engine's own `comboCount`: 0 when no chain is running, 1 once
 * the first blow has been thrown, climbing while `comboTimer` holds. It is
 * stable for the whole of a swing, which is what makes this safe to evaluate
 * every input poll — the alternative, walking the cycle off the LAST direction,
 * advances once per frame while the button is held and spins the man through
 * all four cuts in a twentieth of a second.
 *
 * An unrecognised `open` is treated as the head of the cycle rather than
 * refused: this decides an animation, and a fight is not the place to throw.
 */
export function cutAt(open, combo) {
    const i = CUT_CYCLE.indexOf(open);
    const from = i < 0 ? 0 : i;
    // `Math.floor(Infinity)` is Infinity and `Infinity % 4` is NaN, which indexes
    // the table as `undefined` and hands an animation lookup nothing at all. The
    // gate found it; a fight is not the place to return undefined.
    const step = Number.isFinite(combo) ? Math.max(0, Math.floor(combo)) : 0;
    return CUT_CYCLE[(from + step) % CUT_CYCLE.length];
}
// ---------------------------------------------------------------------------
// THE HEAVY, WHICH WAS NOT A DIFFERENT BLOW
// ---------------------------------------------------------------------------
//
// THE FINDING, and it is a measured one. `tools/swingstrip.mjs` samples the
// weapon tip every frame through a real swing and compares two strokes after
// normalising both — each path centred on its own start and divided by its own
// arc length — so the number it reports is blind to "bigger" and to "slower"
// and sees only "different". Held against the shipping build, a heavy scored
// 0.039 to 0.179 against a bar of 0.10, mean 0.074:
//
//     huscarl  overhead  arc 12.55 -> 13.97m   shape 0.039
//     huscarl  right      arc  5.92 ->  6.81m   shape 0.043
//     warden   overhead  arc 14.76 -> 16.74m   shape 0.045
//
// A heavy attack was the light stroke with `gain = 1 + heavy * 0.24` on every
// channel and a swing 25% longer. One animation serving the two most important
// reads in the game — is he jabbing or is he committing — and the answer was
// visible only as tempo. The owner: "the desktop moves for fighting feel really
// boring & uninspired".
//
// WHAT MAKES A BLOW HEAVY, AND IT IS NOT ITS SIZE.
//
// A committed stroke is not a bigger version of a controlled one; it is a
// different USE OF THE BODY, and every line below is one of the differences:
//
//   THE LOAD GROWS AND THE RELEASE DOES NOT. This is the whole trick, and it
//   is why the shape moves instead of the scale. Multiplying every key by 1.24
//   traces the same curve on a bigger sheet of paper. Tripling the LOAD and
//   leaving the release nearly alone bends the curve: the blade goes right
//   back, and then comes through on the line it always came through on.
//
//   THE WEIGHT GOES ALL THE WAY BACK AND ALL THE WAY THROUGH. `shift` is which
//   foot he is on. A light cut rocks; a heavy transfers.
//
//   THE HIPS WIND AGAINST THE SHOULDERS. A man who throws a real blow stores it
//   in his trunk first — `pry` against `cry` — and a man who does not is
//   throwing his arm.
//
//   HE DROPS INTO IT. `py` down and `pz` forward: the blow is delivered by
//   falling into the stance, not by reaching.
//
//   THE BLADE LAGS FURTHER AND WHIPS HARDER. `wz` is the lag about the arc.
//
//   AND HIS GUARD OPENS — which is not in this table, because a shield is
//   `anim.ts`'s business. See `attackLayer`: on a light the board stays between
//   the man and what he is hitting, and on a heavy it swings out of the way,
//   because that is what a heavy COSTS and it is the reason to fear one.
//
// `aim` and the absolute blade pitch are deliberately untouched. They are
// angles, not deltas, and a multiplier on an absolute pitch points the sword at
// the sky.
/** How much deeper each channel LOADS on a full heavy. See the note above. */
const HEAVY_LOAD = {
    arx: 2.40, arz: 2.20, arb: 2.20,
    crx: 2.40, cry: 2.40,
    prx: 2.50, pry: 2.50,
    py: 2.60, pz: 2.20,
    front: 2.20, back: 2.20, frontB: 1.80, backB: 1.80,
    shift: 2.30, wz: 2.00, wy: 1.30,
};
/** ...and how much further it RELEASES. Small on purpose: see the note. */
const HEAVY_RELEASE = {
    arx: 1.10, arz: 1.08, arb: 1.15,
    crx: 1.15, cry: 1.12,
    prx: 1.20, pry: 1.22,
    py: 1.30, pz: 1.35,
    front: 1.30, back: 1.30, frontB: 1.25, backB: 1.25,
    shift: 1.15, wz: 1.30, wy: 1.45,
};
/**
 * A committed CHOP has nowhere to put more shoulder, so it puts it elsewhere.
 *
 * The overhead already loads `arx` at 2.78 rad — the arm all but straight up
 * and back — and a shoulder flexes to about 180 degrees and stops. Multiplying
 * a channel that is already at the body's limit does nothing, and multiplying
 * it anyway is what put a shoulder at 382 degrees and a fist at 44 m/s. So the
 * chop's commitment is spent where there is room: the elbow folds the blade
 * right down behind the back, the trunk arches and unwinds, and the whole man
 * steps through it. Which is also how a man actually throws an axe blow —
 * nobody makes an overhead bigger by lifting their shoulder further.
 */
const HEAVY_CHOP_LOAD = {
    arx: 1.13, // the last 13% the shoulder has left, and no more
    // 1.00 — the light's own fold, UNCHANGED, and it took two goes to get here.
    // 3.20 folded the elbow right up and dropped the blade behind the back, which
    // is a true cock of an axe and made the stroke worse: the tip's high point
    // fell from 2.18 m to 1.84 m, barely over the man's own crown, and the blow
    // stopped reading as an overhead. 1.60 still cost the runekeeper — the
    // shortest blade in the game — his clearance. A chop is sold by the blade
    // being HIGH before it comes down, and the elbow is the one channel that
    // lowers it. The commitment goes into the trunk and the step instead.
    arb: 1.00,
    crx: 3.00, cry: 2.00, // he arches back into it
    prx: 3.00, pry: 3.00, // and the hips wind under the arch
    py: 3.40, pz: 3.20, // rises onto the load, and gathers
    front: 3.00, back: 3.00, frontB: 2.40, backB: 2.40,
};
/** ...and comes down through the man with everything he has. */
const HEAVY_CHOP_RELEASE = {
    arb: 1.50,
    crx: 1.60, cry: 1.35,
    prx: 1.50, pry: 1.40,
    py: 1.90, pz: 2.40, // the step through, which is the whole of a chop
    front: 1.90, back: 1.90, frontB: 1.60, backB: 1.60,
};
/** A committed THRUST loads its elbow and its hips, not its shoulder line. */
const HEAVY_LUNGE_LOAD = {
    arb: 3.00, // the elbow folds right up — the point comes back to the ribs
    pz: 3.20, py: 3.00, // and he sinks and coils over the front foot
    front: 3.00, back: 3.00, frontB: 2.60, backB: 2.60,
    wy: 2.20, // the shaft runs back through the hand before it runs out
};
/** ...and then the whole man goes with the point. */
const HEAVY_LUNGE_RELEASE = {
    arb: 1.60, // and straightens completely: a thrust is a straight arm
    pz: 2.40, // the step-through, which is the whole of a lunge
    front: 2.00, back: 2.00, frontB: 1.70, backB: 1.70,
    wy: 2.60, // and a foot more of shaft than a controlled thrust shows
};
/** The follow-through. A heavy does not come back to where it started. */
const HEAVY_SETTLE = {
    arx: 1.60, arz: 1.50, arb: 1.40,
    crx: 1.40, cry: 1.40,
    prx: 1.35, pry: 1.35,
    py: 1.30, pz: 1.30,
    front: 1.30, back: 1.30, frontB: 1.20, backB: 1.20,
    shift: 1.40, wz: 1.30, wy: 1.20,
};
/**
 * AND NOTHING GOES PAST WHAT A BODY CAN DO.
 *
 * A multiplier on an authored key is a multiplier on an ANGLE, and the overhead
 * loads its shoulder at 2.78 rad already — a hair under a right angle past
 * straight up. Times 2.40 is 6.67 rad, which is 382 degrees: the shoulder wraps
 * all the way round and comes back, and `swingstrip` caught it as a FIST doing
 * 44 m/s at the moment the load released, which is the arm and not the blade.
 *
 * So every channel has a ceiling, in its own units — radians for the joints,
 * metres for the two that are displacements, and the weight term in the
 * fraction of a stance it is written in. They are the limits of the body, not
 * of the table: a light stroke never approaches one, and a heavy is stopped by
 * them rather than by taste.
 */
const HEAVY_CAP = {
    arx: 3.14, arz: 1.60, arb: 2.40, // shoulder pitch (a shoulder flexes to
    // about 180 deg and no further), swing, elbow
    crx: 0.90, cry: 1.10, // the chest, which is ribs and not a hinge
    prx: 0.70, pry: 0.90, // the pelvis turns less than the chest
    py: 0.12, pz: 0.40, // METRES: how far he sinks and steps
    front: 1.10, back: 1.10, // the feet
    frontB: 1.40, backB: 1.40, // and the knees, which fold further
    shift: 1.80, // weight, in stances
    wz: 1.00, wy: 0.30, // blade lag, and METRES of shaft slide
};
const capped = (v, cap) => (cap === undefined ? v : Math.sign(v) * Math.min(Math.abs(v), cap));
/**
 * AND THE BLADE'S OWN PITCH, WHICH IS THE ONE CHANNEL THAT CANNOT BE SCALED.
 *
 * `aim` is an ABSOLUTE angle — where the blade points, not how far it has
 * turned — so a multiplier on it does not make a blow bigger, it points the
 * sword at the sky. It is also the channel that decides most of where an
 * overhead's tip goes, which is why the chop was the one stroke whose SHAPE
 * would not move: with the shoulder already at the body's limit and the elbow
 * left alone to keep the blade high, there was nothing else driving the path.
 *
 * So it is an OFFSET, in radians, added: the blade is cocked further back on
 * the load and carried further round on the follow-through. A committed stroke
 * does not stop where a controlled one stops — it goes past the man and down,
 * and the recovery is the price.
 */
const HEAVY_AIM = {
    overhead: [0.40, 0.22, 0.95],
    right: [-0.25, 0.10, 0.38],
    left: [0.25, -0.10, -0.38], // the backhand turns the other way
    stab: [-0.10, 0.05, 0.18], // a thrust barely changes its pitch at all
};
/**
 * The stroke this blow becomes as it commits.
 *
 * `heavy` is `motion.heavy`, the animator's own 0..1 ease into the committed
 * blow — not a boolean — so the shape arrives with the weight rather than
 * snapping on the frame the wire says "heavy". At 0 this returns the authored
 * light stroke UNCHANGED, byte for byte, which is the same law `chainSwing`
 * keeps: a variant is an addition to the vocabulary and must never be what the
 * plain blow falls back to.
 */
export function heavySwing(base, heavy, dir = "") {
    const h = Math.min(1, Math.max(0, heavy || 0));
    if (h <= 0.0005)
        return base;
    // THE THRUST IS THE ONE THAT NEEDS ITS OWN ANSWER, and the ruler said so
    // before this was written: a heavy thrust scored 0.098 of shape against a
    // 0.10 bar while every cut cleared it comfortably. It is obvious in hindsight
    // — a thrust is a LINE, and there is only so much you can do to a line by
    // loading it. What makes a thrust committed is not a bigger wind-up, it is
    // that the whole man goes with the point: a long step through, the shaft
    // running through the hand, and the elbow folded right up and then straight.
    // So the thrust's own channels get the treatment the cuts do not need.
    const lunge = dir === "stab";
    const chop = dir === "overhead";
    const own = lunge ? HEAVY_LUNGE_LOAD : chop ? HEAVY_CHOP_LOAD : null;
    const ownR = lunge ? HEAVY_LUNGE_RELEASE : chop ? HEAVY_CHOP_RELEASE : null;
    const key = (name) => {
        const k = base[name];
        const L = (own ? own[name] : undefined) ?? HEAVY_LOAD[name] ?? 1;
        const R = (ownR ? ownR[name] : undefined) ?? HEAVY_RELEASE[name] ?? 1;
        const S = HEAVY_SETTLE[name] ?? 1;
        // Lerped by `h`, so a factor of 2.4 is 1.0 at rest and arrives with the
        // commitment rather than being switched on — and then capped, because a
        // factor on an angle is a factor on an angle. See `HEAVY_CAP`.
        const cap = HEAVY_CAP[name];
        return [
            capped(k[0] * (1 + (L - 1) * h), cap),
            capped(k[1] * (1 + (R - 1) * h), cap),
            capped(k[2] * (1 + (S - 1) * h), cap),
        ];
    };
    const aimAdd = HEAVY_AIM[dir];
    const aim = aimAdd
        ? [base.aim[0] + aimAdd[0] * h, base.aim[1] + aimAdd[1] * h, base.aim[2] + aimAdd[2] * h]
        : base.aim;
    return {
        ...base,
        aim,
        arx: key("arx"), arz: key("arz"), arb: key("arb"),
        crx: key("crx"), cry: key("cry"),
        prx: key("prx"), pry: key("pry"),
        py: key("py"), pz: key("pz"),
        front: key("front"), back: key("back"), frontB: key("frontB"), backB: key("backB"),
        shift: key("shift"), wz: key("wz"), wy: key("wy"),
    };
}
