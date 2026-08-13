// THE DEATH CAMERA — where the lens goes while you are dying.
//
// The owner, verbatim:
//
//   "When you die you should be able to see long enough for you body to be
//    stumbling to the floor spraying blood everything before the view moving or
//    changing away from the map, it could move to show best angle of the the
//    severing of the body part / death at point of death."
//
// Read that sentence in order, because the order is the design: SEE FIRST, MOVE
// SECOND. What shipped did neither — `GameCanvas.tsx` had one branch,
//
//     if (localPlayer && localPlayer.state !== "dead") ... "follow"
//     else focus = (0,0,0); "spectate"
//
// so the frame your death lands on is the frame the lens leaves you: focus snaps
// to the middle of the arena and the spectate orbit picks up from wherever it
// had got to. The collapse `anim.ts` spends 1.1 s authoring, the stump `vfx.ts`
// runs for 1.8 s and the pool it drops at the end of that are all played to an
// empty house. This module is the house.
//
// ---------------------------------------------------------------------------
// WHY THIS IS A SEPARATE FILE AND NOT TWENTY LINES IN GameCanvas.tsx
//
// Same reason `roundreset.mjs` is: the thing worth asserting is a *decision*,
// and a decision buried in a React effect can only be tested by standing up a
// browser. Everything here is arithmetic over plain numbers — no THREE, no DOM,
// no React — so `tools/deathcamtest.mjs` drives the real one rather than a model
// of it. There is one definition of "where the camera goes when you die".
//
// ---------------------------------------------------------------------------
// THE SHAPE OF THE HOLD
//
//   fall    the lens does not move at all. It is where the follow camera left
//           it, and you watch your own body buckle from the view you were
//           playing in a moment ago. No cut: a cut here would throw away the
//           one thing the player is trying to understand, which is what just
//           happened to him.
//   move    it eases round to the side the wound faces and comes in close.
//           This is "it could move to show best angle of the severing".
//   linger  it sits there while the stump runs out and the pool spreads.
//
// The clock is the same on a phone as on a desktop, and that is deliberate.
// `docs/PLATFORMS.md`'s instinct everywhere else is that the phone gets less;
// here it gets exactly the same, because nothing else is happening on screen —
// no eight bodies, no input, no swings to resolve — so the death is the one
// moment a phone can afford to look expensive. What the phone loses is decals
// and droplets, which is `quality.ts`'s business, not seconds.

/** Seconds in each beat. The total is what a player experiences as "the hold". */
export const DEATH_HOLD = {
  /** Watching yourself go down, lens still. `deathLayer` settles at ~1.1 s. */
  fall: 1.25,
  /** Easing round to the wound. */
  move: 1.15,
  /** Sitting on it. `vfx.ts` runs a stump for ~1.8 s and pools at the end. */
  linger: 0.70,
};

DEATH_HOLD.total = DEATH_HOLD.fall + DEATH_HOLD.move + DEATH_HOLD.linger;

/** Field of view at the start of the hold and at the end of it. */
export const DEATH_FOV = { from: 55, to: 44 };

/** How close the lens gets to the wound, and the floor under that. */
const CLOSE_RADIUS = 2.05;
const MIN_RADIUS = 1.25;
/** Never inside the turf, whatever the bank is doing under the camera. */
const MIN_CLEARANCE = 0.42;
/**
 * The killer is not the subject. Inside this angle he stands between the lens
 * and the wound, so the arc is pushed round until he is off to one side — where
 * he is a better picture anyway, because a man standing over you is the whole of
 * "being seen" (`WHAT-THIS-GAME-IS.md` §5 item 4).
 */
const KILLER_CLEAR = 0.62;
/**
 * A severed part stops being the subject once it is this far from the wound.
 * A head that has just come off is the shot; a head that has rolled four metres
 * is a different shot, and chasing it walks the lens off the body that is still
 * falling. Metres, and it is a soft falloff rather than a switch.
 */
const PART_REACH = 1.6;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Ease-out cubic. The move dies rather than stopping. */
const ease = (k) => 1 - Math.pow(1 - clamp01(k), 3);

function unitXZ(x, z, fx, fz) {
  const l = Math.hypot(x, z);
  if (l < 1e-4) return [fx, fz];
  return [x / l, z / l];
}

/**
 * ONE FRAME OF THE HOLD, as pure arithmetic.
 *
 * Everything the camera does is here, so `tools/deathcamtest.mjs` can hammer it
 * with no clock, no engine and no browser: hand it a wound and a `t` and it
 * hands back where the lens is and what it is pointed at.
 *
 * @param v.t         seconds into the hold.
 * @param v.body      the corpse's world position (feet), live — it moves while
 *                    he falls, and the lens is aimed at where he IS.
 * @param v.wound     world point of the cut, live. Absent, the chest.
 * @param v.spray     unit world direction the wound faces. This is the whole of
 *                    "best angle": the lens goes where the blood is going.
 * @param v.part      the severed piece's live world position, or null.
 * @param v.killer    the man who did it, or null.
 * @param v.from      where the follow camera was on the frame he died. The hold
 *                    starts here and there is no cut.
 * @param v.groundAt  terrain height under a world (x,z). Optional; flat if not.
 * @returns { position: [x,y,z], target: [x,y,z], fov, beat, moved }
 */
export function frameDeathShot(v) {
  const t = Math.max(0, v.t || 0);
  const body = v.body;
  // The wound, or the middle of his chest if nothing came off — a torso kill is
  // a third of all deaths and the low tier refuses the bisection outright, so
  // the no-severance case is the common case and not the fallback.
  const wound = v.wound ?? { x: body.x, y: body.y + 1.15, z: body.z };
  const chest = { x: body.x, y: body.y + 0.85, z: body.z };

  // ---- what to look at ----------------------------------------------------
  // The wound, pulled a little toward the body so the frame holds both. And
  // toward the severed part while the part is still near the wound, which is
  // the instant it is worth looking at.
  //
  // 0.22 of chest, not 0.38. At 0.38 a HEAD wound — the highest of the eight
  // zones and the one this feature exists for — sat 12.5° off the view axis
  // against a middle-fifth budget of 8.8°, so the neck was three quarters of the
  // way up the frame while the aim point was down on the sternum. The zones with
  // a low wound all passed, which is exactly how a framing fault hides: it is
  // proportional to how far the wound is from the chest, so the common case
  // looks fine and the case the owner asked about is the one that breaks.
  let tx = wound.x * 0.78 + chest.x * 0.22;
  let ty = wound.y * 0.78 + chest.y * 0.22;
  let tz = wound.z * 0.78 + chest.z * 0.22;

  const moved = ease((t - DEATH_HOLD.fall) / DEATH_HOLD.move);
  const beat = t < DEATH_HOLD.fall ? "fall" : t < DEATH_HOLD.fall + DEATH_HOLD.move ? "move" : "linger";

  // The severed part, while it is still the subject — which is a question about
  // TIME as much as about distance, and the first cut of this only asked about
  // distance. A head is the shot on the frame it comes off and for the beat
  // after it; by the time the lens has finished swinging round, the head is on
  // the turf a metre and a half away and the subject is the body and the stump
  // still emptying onto it. Weighted by gap ALONE the pull was still 11% at the
  // end of the hold, which dragged the aim a quarter of a metre and put the neck
  // 117% of the way through its framing budget — measured, on `head` and `neck`
  // and on no other zone, because the drift is proportional to how far the part
  // has got and a leg does not go anywhere.
  if (v.part) {
    const gap = Math.hypot(v.part.x - wound.x, v.part.y - wound.y, v.part.z - wound.z);
    const w = 0.45 * Math.exp(-gap / PART_REACH) * (1 - moved);
    tx += (v.part.x - tx) * w;
    ty += (v.part.y - ty) * w;
    tz += (v.part.z - tz) * w;
  }

  // ---- which side to look from --------------------------------------------
  // Where the lens already is, in the wound's own horizontal frame. This is the
  // start of the arc and it is not chosen — it is where the player was.
  const [fx, fz] = unitXZ(v.from.x - wound.x, v.from.z - wound.z, 0, 1);

  // Where it wants to end up: on the side the blood is leaving by. A spray that
  // is near-vertical — a head off the top of a neck — has no horizontal opinion,
  // so `unitXZ` hands back the start bearing and the arc is a straight push in
  // rather than a swing round to an arbitrary side.
  let [wx, wz] = v.spray ? unitXZ(v.spray.x, v.spray.z, fx, fz) : [fx, fz];

  // The killer, pushed out of the way rather than framed out. Rotating by the
  // shortfall in whichever direction is nearer keeps the move short.
  if (v.killer) {
    const [kx, kz] = unitXZ(v.killer.x - wound.x, v.killer.z - wound.z, wx, wz);
    const dot = Math.max(-1, Math.min(1, wx * kx + wz * kz));
    const off = Math.acos(dot);
    if (off < KILLER_CLEAR) {
      // Cross product's sign says which way round the killer sits.
      const side = wx * kz - wz * kx >= 0 ? 1 : -1;
      const a = side * (KILLER_CLEAR - off);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const nx = wx * ca - wz * sa;
      const nz = wx * sa + wz * ca;
      wx = nx; wz = nz;
    }
  }

  // ---- the arc ------------------------------------------------------------
  // Rotated about the wound rather than lerped between two points, so the lens
  // travels an arc and the wound never leaves the middle of the frame on the way.
  // A lerp through the body is exactly the shot that ends up inside his ribcage.
  const dot = Math.max(-1, Math.min(1, fx * wx + fz * wz));
  const span = Math.acos(dot);
  const side = fx * wz - fz * wx >= 0 ? 1 : -1;
  const a = side * span * moved;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const dx = fx * ca - fz * sa;
  const dz = fx * sa + fz * ca;

  const r0 = Math.max(MIN_RADIUS, Math.hypot(v.from.x - wound.x, v.from.z - wound.z));
  const r = r0 + (CLOSE_RADIUS - r0) * moved;
  // Eye height comes down onto the wound as the lens comes in: a death watched
  // from standing height is a death watched from above, and what is on the
  // ground at the end of this is a pool.
  const y0 = v.from.y;
  // A hand above the wound, not half a metre. The lens coming down to the height
  // of the thing it is looking at is the difference between watching a death and
  // looking down on a corpse, and what is on the ground at the end of this is a
  // pool — which reads as a pool from beside it and as a disc from above it.
  const y1 = wound.y + 0.30;
  const y = y0 + (y1 - y0) * moved;

  let px = wound.x + dx * r;
  let py = y;
  let pz = wound.z + dz * r;
  if (v.groundAt) {
    const g = v.groundAt(px, pz);
    if (py < g + MIN_CLEARANCE) py = g + MIN_CLEARANCE;
  }

  return {
    position: [px, py, pz],
    target: [tx, ty, tz],
    fov: DEATH_FOV.from + (DEATH_FOV.to - DEATH_FOV.from) * moved,
    beat,
    moved,
  };
}

/**
 * The clock around `frameDeathShot`, and the three ways a hold ends.
 *
 * It ends on ITS OWN CLOCK, on ANY INPUT, or the moment the round this death
 * belongs to is over — and never on anything a living player is waiting for,
 * because it never touches anything a living player is waiting for. This module
 * sends nothing, decides nothing the server decides, and is not read by any
 * other client. The seven men still fighting cannot tell whether the eighth's
 * lens is holding on his corpse or already back on the arena.
 */
export function createDeathCamera() {
  let holding = false;
  let t = 0;
  let from = { x: 0, y: 2, z: 4 };
  let skipped = false;
  /** Rising edge only: the state has to go alive→dead to arm a new hold. */
  let wasDead = false;

  function stop() {
    holding = false;
    t = 0;
    skipped = false;
  }

  return {
    /** Seconds into the hold. 0 when nothing is being held. */
    get elapsed() { return holding ? t : 0; },
    get holding() { return holding; },

    /** Any key, any tap, any click. The owner's "press anything to skip". */
    skip() {
      if (holding) skipped = true;
    },

    /** A respawn, a round change, a disconnect. Idempotent from any state. */
    reset() {
      stop();
      wasDead = false;
    },

    /**
     * One frame.
     *
     * @param dt      seconds.
     * @param s.dead  is the local warrior dead right now.
     * @param s.live  is the room still inside the round this death belongs to.
     *
     *   NOT "is the room fighting", and the harness is what settled that. In an
     *   honour duel there are two men, so the packet that first reports YOUR
     *   death is the same packet `endRound` has already turned to
     *   `intermission` — `checkRoundEnd` fires on the tick the last man falls.
     *   Gated on `fighting` the hold would arm on nothing at all in a duel,
     *   which is the mode the owner plays. So `live` is fighting, last stand
     *   AND the round break, and it is false for `countdown` (a new round is
     *   being dealt and you are standing up again) and for the match summary
     *   (`render/summary.ts` owns the lens there and stages its own tableau).
     *
     *   The break is 5 s and the hold is 3.1 s, so the hold is over with nearly
     *   two seconds to spare — `tools/deathcamtest.mjs` measures both off the
     *   real engine rather than trusting either number.
     *
     * @param s.camera where the lens is THIS frame, used only to seed the hold.
     * @param s...    the rest is `frameDeathShot`'s view.
     * @returns the shot, or null when the lens belongs to somebody else.
     */
    update(dt, s) {
      const dead = !!s.dead;
      const live = !!s.live;

      if (dead && !wasDead && live) {
        // The frame he died on. Freeze the lens where the follow camera left it
        // — the hold opens on the exact frame the player was already looking at,
        // so there is no cut into it.
        holding = true;
        t = 0;
        skipped = false;
        from = { x: s.camera.x, y: s.camera.y, z: s.camera.z };
      }
      wasDead = dead;

      if (!holding) return null;
      if (!dead || !live || skipped) { stop(); return null; }

      t += Math.max(0, dt);
      if (t >= DEATH_HOLD.total) { stop(); return null; }

      return frameDeathShot({
        t,
        from,
        body: s.body,
        wound: s.wound ?? null,
        spray: s.spray ?? null,
        part: s.part ?? null,
        killer: s.killer ?? null,
        groundAt: s.groundAt,
      });
    },
  };
}
