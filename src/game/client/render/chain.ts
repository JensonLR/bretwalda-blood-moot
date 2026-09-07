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

export type Key = readonly [number, number, number];

export interface Swing {
  arx: Key; arz: Key;
  /**
   * The elbow, and the link the swing was missing. Folded at the load, near
   * straight at the moment of contact, gathered back in on the follow through:
   * a blade that arrives on a straight arm arrives with the whole body behind
   * it, and one that never folded never gathered anything to arrive with.
   */
  arb: Key;
  crx: Key; cry: Key;
  prx: Key; pry: Key;
  py: Key; pz: Key;
  /** Front foot (off side) and back foot (weapon side). */
  front: Key; back: Key;
  /**
   * The knees under them. The back one coils and drives; the front one takes
   * the weight at impact and bends under it — which through `settleOnFeet`
   * drops the whole man onto the blow instead of leaving him level over it.
   */
  frontB: Key; backB: Key;
  /**
   * Which foot the man is standing on: −1 the back foot, +1 the front.
   *
   * Everything else in this table lives in the sagittal plane, and a camera in
   * front of a warrior — which is `stance`, `portrait` and half of `brawl` —
   * projects the whole of that plane onto nothing. A swing with no frontal
   * content is a mannequin from the front however loaded it is from the side.
   * This is the term that reads there: the pelvis rides over the loaded foot,
   * the free hip drops off it and the shoulders stack back the other way, so
   * the hip line and the shoulder line disagree by something an eye can see.
   */
  shift: Key;
  /** Absolute blade pitch through the strike; see `Pose.wa`. */
  aim: Key;
  /** Blade lag about the arc — trails on the load, whips past on release. */
  wz: Key;
  /** Slide along the shaft, for a thrust. */
  wy: Key;
}

// Four attacks, each a body throwing a weapon rather than an arm waving one.
export const SWINGS: Record<string, Swing> = {
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
 * `COMBO_WINDOW` in the engine is 0.8 s, so three is as far as this realistically
 * runs; four and beyond hold the pivot rather than inventing a fourth idea.
 */
export const CHAIN_STEPS = 3;

/** Scale one [load, release, settle] triple per phase. */
const rekey = (k: Key, load: number, release: number, settle: number): Key =>
  [k[0] * load, k[1] * release, k[2] * settle] as const;

/**
 * The stroke this blow of the chain should draw.
 *
 * `combo` is the engine's own `comboCount` — 1 for the first blow of a chain,
 * climbing while `comboTimer` holds. Anything at or below 1, and any value this
 * does not recognise, gets the authored stroke unchanged: a chain variant is an
 * addition to the vocabulary and must never be the thing a lone blow falls
 * back to.
 */
export function chainSwing(base: Swing, combo: number): Swing {
  const step = Math.min(CHAIN_STEPS, Math.max(1, Math.floor(combo || 1)));
  if (step <= 1) return base;

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
      shift: [-base.shift[0] * 0.55, -base.shift[1] * 0.85, -base.shift[2] * 0.6] as const,
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
