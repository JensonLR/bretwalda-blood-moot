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
//
// ---------------------------------------------------------------------------
// THERE ARE TWO CAMERAS IN THIS FILE AND THEY ARE DIFFERENT CAMERAS
//
// The owner, 13 Aug 2026, on the one above:
//
//   "death camera only shows when you die last, everyone should see death
//    camera for final death winner & all losers."
//
// He is describing a hole this module was never asked about. `update()` refuses
// the lens unless the viewer is `dead`, which is CORRECT for your own death and
// means the man who WON the round never sees the blow that won it — the single
// moment in a round most worth watching, played to the one house that is empty.
// The adversary on the death-camera unit verified that a living player can never
// take the lens and called it correct, which it is, for the defect it was built
// for. Nobody asked whether the winner should see anything. That is a gate
// answering the question it was given rather than the question that mattered.
//
// So:
//
//   YOUR OWN DEATH — `createDeathCamera`, above. 3.35 s. Opens on the exact
//                    frame the follow camera left, because you were already
//                    looking at yourself and a cut would throw away the one
//                    thing you are trying to understand. NO CUT.
//   THE ROUND'S     — `createRoundCamera`, below. 2.95 s. Everybody watches the
//   FINAL DEATH      killing blow that ends the round, winner and losers alike.
//                    It CUTS, and the cut is the point: you were fighting
//                    somebody else twenty metres away, there is no continuity to
//                    preserve, and a two-second dolly across the arena arrives
//                    after the body has settled and shows nothing.
//
// The geometry is shared — `frameDeathShot` is one definition of "where the lens
// goes to watch a man die" and both cameras drive it — and everything that
// differs is a parameter: the clock, the lens, and where the shot OPENS.
//
// PRECEDENCE, decided here rather than left to whichever caller runs first:
//
//   **YOUR OWN DEATH OUTRANKS THE ROUND'S, AND THE ROUND'S IS NEVER QUEUED.**
//
// If your own hold is running on the frame the round ends, you keep it and the
// round beat never arms for you — not then, and not when your hold finishes. You
// were already being seen; that was your beat. Two reasons, and the second is
// the one that makes it non-negotiable: cutting off your own collapse to watch
// somebody else's is the exact cut this module exists to refuse, and 3.35 s of
// hold followed by 2.95 s of beat is 6.30 s inside a break the server gives five
// seconds — the next round would be dealt over the top of it.
//
// In an honour duel that resolves to precisely what the owner asked for: the man
// who died gets his own camera, the man who won gets the round's, and the round's
// is a shot of the same body.

/** Seconds in each beat. The total is what a player experiences as "the hold". */
export const DEATH_HOLD = {
  /**
   * Watching yourself go down, lens still.
   *
   * 1.50 s, and the number is not a taste. `tools/freezetest.mjs --phases=collapse`
   * drives the real `poseWarrior` over seven kinds of death and reports when the
   * committed pose stops changing. The collapse now carries weight — the head
   * trails the ribs and is stopped separately by the ground — and it runs longer
   * than the ~1.1 s this constant was set against. Its table, QUOTED — run
   * `node tools/freezetest.mjs --phases=collapse` for the figures of the day;
   * nothing in this file measures them and nothing keeps this copy fresh:
   *
   *     landed            0.52 - 1.17 s
   *     quiet to 1e-2     0.45 - 1.13 s
   *     quiet to 1e-3     0.82 - 1.38 s   (p50 1.23 s)
   *
   * SIZED AGAINST THE STRICT FLOOR AND NOT THE FORGIVING ONE, which is a change
   * of mind from the first draft of this comment and is worth saying out loud.
   * That draft argued for 1e-2 on the grounds that freezetest calls 1e-3 "about
   * 0.06 degrees per frame — well below what an eye reads as motion at fight
   * distance". True of one joint in isolation, and the wrong test here: the
   * whole body is settling at once, the beat costs 0.25 s, and the beat's job
   * is to be over before the eye has to wonder whether it is.
   *
   * So: 1.50 s covers the worst of the seven at 1e-3 with 0.12 s to spare, and
   * covers the LANDING of all seven (0.52-1.17 s) with a third of a second over.
   */
  fall: 1.50,
  /** Easing round to the wound. */
  move: 1.15,
  /**
   * Sitting on it. `vfx.ts` runs a stump on the order of a second and a half —
   * `JET_LIFE` there is 1.6 s on high and the severance scales it — and drops a
   * pool at the end of it. Not measured here, and no harness in this repository
   * prints it: it is read off `vfx.ts`'s own constant.
   */
  linger: 0.70,
};

DEATH_HOLD.total = DEATH_HOLD.fall + DEATH_HOLD.move + DEATH_HOLD.linger;

/** Field of view at the start of the hold and at the end of it. */
export const DEATH_FOV = { from: 55, to: 44 };

/**
 * THE ROUND'S FINAL DEATH. Shorter than your own on purpose.
 *
 * Your own death is 3.35 s because you are trying to read what happened to you
 * and the collapse alone takes up to 1.38 s. The round beat is a beat: the blow
 * lands, everybody looks, the round tally comes up. 2.95 s inside a 5 s break
 * leaves about 2.0 s of slack — `deathcamtest` measures 2.03 s on a real
 * recording — so NOTHING WAITS ON IT — the server has already set
 * `nextRoundAt` and this module sends nothing, decides nothing the server
 * decides, and is not read by any other client.
 *
 * `fall` WAS short for a reason that did not survive being measured, and the
 * argument is left here because it is the interesting half. It ran: there the
 * lens is already on the body and the stillness is the shot; here the lens has
 * just cut in from wherever the viewer was, so a long still opening is a freeze
 * on a stranger, and 0.45 s is long enough to read the frame before it starts to
 * move. The flaw is "a freeze on a stranger". The cut lands ON THE BODY —
 * `deathcamtest` claim 11 measures the opening frame at 5.95 m with the wound
 * 0.4 degrees off axis — and the body is FALLING for the whole of this beat. A
 * still lens on a moving subject is not a freeze; it is the shot. What 0.45 s
 * actually bought was a dolly that started with two thirds of the collapse left
 * to run, measured 7/7. See the constant itself below.
 *
 * ---------------------------------------------------------------------------
 * THE TOTAL IS NOT A FREE CHOICE. `src/app/page.tsx` already holds the round-end
 * screen for `ROUND_HOLD_MS` — for exactly that long after a round ends,
 * `RoundBreak` draws only a verdict line and the victor's flourish row over the
 * LIVE ARENA, and only then does the opaque `data-break-card` scrim come down.
 * The presentation half of `BACKLOG.md` 2.6 was already built and pointed at
 * nothing: for 2.2 seconds the game showed you the arena and the arena was
 * showing you the lobby orbit.
 *
 * So the beat is the length of the window that was already open for it, and the
 * window was widened WITH it: 2.20 s here and 2200 ms there both became 2.95 s,
 * in the same commit, because the collapse this beat exists to show is longer
 * than the beat was. THE CEILING IS THE `left > 2` GUARD IN page.tsx, not this
 * constant: the card takes over once fewer than three whole seconds of a five
 * second break remain, so anything past about 3.0 s is a beat that gets cut off
 * by its own screen. 2.95 s leaves five hundredths of a second under that.
 *
 * AND THAT CEILING IS WHY `move` AND `linger` GAVE GROUND, which the first
 * report of this change did not mention and should have. `fall` took a whole
 * second (0.45 -> 1.45) and the total could not follow it that far, so `move`
 * went 1.05 -> 0.90 and `linger` 0.70 -> 0.60: total 2.20 -> 2.95, which is
 * +0.75 against the +1.00 the still asked for. The dolly is 0.15 s quicker over
 * the same 5.4 m -> 2.05 m as a consequence, and that is a real cost, taken
 * knowingly, because a dolly that starts over a body still falling is worse than
 * a dolly that arrives a sixth of a second sooner.
 *
 * THE TWO CONSTANTS ARE NOT WIRED TOGETHER — `page.tsx` belongs to another unit and a
 * camera reaching into the summary flow to import a number is not a trade worth
 * making — which makes this the mirrored-definition fault `docs/PROCESS.md`
 * records five times in `characters.ts` alone, sitting one edit away. It is not
 * left to good intentions: `tools/deathcamtest.mjs` READS THAT FILE and fails
 * if the two numbers stop agreeing. Change one and the harness will tell you
 * about the other.
 */
export const ROUND_HOLD = {
  /**
   * Cut in, hold still, let the eye find the body — AND LET IT LAND.
   *
   * This was 0.45 s and that was the one measurable defect in either camera.
   * Neither lens ever cut away before the body stopped; both outlast the
   * collapse comfortably. But `fall` is the beat during which the lens does not
   * move, and freezetest asked the sharper question — is the lens STILL for the
   * whole collapse, which is what this beat is for? — and answered it 7/7 NO:
   * every one of the seven deaths was still moving on the frame the lens began
   * to travel, with roughly two thirds of the collapse left to run.
   *
   * That is a dolly starting while the man is still falling, which is the shot
   * fighting its own subject. 1.45 s covers the worst of the seven at the strict
   * 1e-3 rad/frame floor (1.38 s) and the landing of all seven outright — the
   * same floor `DEATH_HOLD.fall` is sized against, and the same table, QUOTED
   * from `node tools/freezetest.mjs --phases=collapse` there and here alike.
   * Nothing in this file measures it and nothing keeps either copy fresh.
   *
   * IT IS WITHIN 0.05 s OF `DEATH_HOLD.fall` AND THAT IS NOT A DUPLICATE. Both
   * beats are the beat during which the lens does not move, and both are sized
   * against one physical fact — how long the man takes to land. Two beats
   * measured against one collapse are supposed to land in the same place. What
   * makes these two different cameras is where the shot OPENS, the lens, the
   * length of the move and the total; see `tools/deathcamtest.mjs` claim 12,
   * which was rewritten around exactly this and says so at length.
   */
  fall: 1.45,
  /** In onto the wound. */
  move: 0.90,
  /** The killer standing over him while the stump runs. */
  linger: 0.60,
};

ROUND_HOLD.total = ROUND_HOLD.fall + ROUND_HOLD.move + ROUND_HOLD.linger;

/** Tighter than the death lens at both ends: this shot never had a wide to lose. */
export const ROUND_FOV = { from: 50, to: 42 };

/**
 * Where the round beat CUTS TO — the frame it opens on, before it moves.
 *
 * `frameDeathShot` swings from `from` round to the side the wound faces and
 * closes to `CLOSE_RADIUS`. For your own death `from` is where you were already
 * looking, and the whole design is that it is not chosen. For the round's death
 * it has to be chosen, because "where the viewer happened to be" is twenty metres
 * away across an arena and the beat would spend its whole clock travelling.
 *
 * 5.4 m and 2.5 m up: far enough that the opening frame is a man on the ground
 * and the man who killed him, close enough that the push in is a push and not a
 * flight. The bearing is the same one the shot ends on, so the move is a DOLLY
 * rather than a swing — a swing you did not see the start of reads as the camera
 * losing the body.
 */
const ROUND_OPEN_RADIUS = 5.4;
const ROUND_OPEN_LIFT = 2.5;

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
 * @param v.hold      the clock, `DEATH_HOLD` by default. The round beat hands
 *                    `ROUND_HOLD` instead — one geometry, two clocks, rather
 *                    than a second copy of this arithmetic that would drift from
 *                    it the first time either was tuned.
 * @param v.fov       the lens, `DEATH_FOV` by default.
 * @returns { position: [x,y,z], target: [x,y,z], fov, beat, moved }
 */
export function frameDeathShot(v) {
  const t = Math.max(0, v.t || 0);
  const hold = v.hold ?? DEATH_HOLD;
  const lens = v.fov ?? DEATH_FOV;
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

  const moved = ease((t - hold.fall) / hold.move);
  const beat = t < hold.fall ? "fall" : t < hold.fall + hold.move ? "move" : "linger";

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
    fov: lens.from + (lens.to - lens.from) * moved,
    beat,
    moved,
  };
}

/**
 * WHERE THE ROUND BEAT CUTS TO, as pure arithmetic.
 *
 * Split out from `createRoundCamera` and exported for the same reason
 * `frameDeathShot` is: the cut is the decision that makes this camera a
 * different camera, so it is the thing worth hammering with no clock and no
 * engine in the way.
 *
 * The bearing, in order of preference, and each fallback is a real case:
 *
 *   1. THE SPRAY, if it has a horizontal opinion. Same rule the death camera
 *      ends on, so the beat opens looking at the side the blood is leaving by
 *      and pushes straight in along it.
 *   2. THE KILLER's bearing, when the spray is vertical or absent — a head off
 *      the top of a neck has no horizontal direction, and a torso kill has no
 *      spray at all, which is a third of every death and the low tier's ONLY
 *      case (`characters.ts` refuses the bisection there). Opening on the
 *      killer's line hands `frameDeathShot` a shot it will then rotate by
 *      `KILLER_CLEAR`, so he ends up off to one side of frame standing over the
 *      body, which is the whole of "being seen".
 *   3. WHERE THE VIEWER ALREADY IS, if there is no killer either — a man who
 *      burned to death in the bonfire is killed by the arena, and the arena has
 *      no position. Then it is not a cut at all, which is the right answer when
 *      there is nothing to cut TO.
 *
 * @param v.wound     the point the shot is about.
 * @param v.spray     unit world direction the wound faces, or null.
 * @param v.killer    the man who did it, or null.
 * @param v.from      where the viewer's lens is right now. Fallback bearing only.
 * @param v.groundAt  terrain height under a world (x,z). Optional.
 * @returns {{x:number,y:number,z:number}} the opening eye position.
 */
export function roundOpening(v) {
  const w = v.wound;
  let bx = 0;
  let bz = 1;
  const sprayLen = v.spray ? Math.hypot(v.spray.x, v.spray.z) : 0;
  if (sprayLen > 1e-3) {
    bx = v.spray.x / sprayLen;
    bz = v.spray.z / sprayLen;
  } else if (v.killer) {
    [bx, bz] = unitXZ(v.killer.x - w.x, v.killer.z - w.z, 0, 1);
  } else if (v.from) {
    [bx, bz] = unitXZ(v.from.x - w.x, v.from.z - w.z, 0, 1);
  }
  const px = w.x + bx * ROUND_OPEN_RADIUS;
  const pz = w.z + bz * ROUND_OPEN_RADIUS;
  let py = w.y + ROUND_OPEN_LIFT;
  if (v.groundAt) {
    const g = v.groundAt(px, pz);
    if (py < g + MIN_CLEARANCE) py = g + MIN_CLEARANCE;
  }
  return { x: px, y: py, z: pz };
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
     *   The break is 5 s and the hold is `DEATH_HOLD.total` above — 3.35 s as
     *   these constants stand, not the 3.1 s this sentence claimed for a round
     *   after the constant moved — so the hold is over with about two seconds to
     *   spare. NEITHER NUMBER IS MEASURED HERE: `tools/deathcamtest.mjs` takes
     *   both off the real engine and prints them ("Ns of beat inside the Ms
     *   break measured on this run"), which is why that harness and not this
     *   comment is the place to read them.
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

/**
 * THE ROUND'S FINAL DEATH — the beat every man in the room watches.
 *
 * Same shape as the hold above and a different camera. What differs, in full:
 *
 *   WHO GETS IT      everybody. There is no `dead` in the state below, and its
 *                    absence is the whole feature: the winner is the man this
 *                    was built for.
 *   WHOSE BODY       the LAST man to fall, not the viewer. The caller names him.
 *   HOW IT OPENS     with a cut, at `roundOpening`. See the note there.
 *   HOW LONG         `ROUND_HOLD`, 2.95 s inside the server's own 5 s break.
 *   WHEN IT ARMS     on the rising edge of `ended` — the frame the round turns
 *                    to the break — and never again for that round.
 *
 * THREE WAYS IT ENDS, and they are the death camera's three: its own clock, any
 * input, or the moment the room leaves the break. It never delays anything. The
 * server set `nextRoundAt` before this armed and will deal the next round on its
 * own schedule whether this is still running or not; `live` going false is that
 * schedule arriving, and the lens is handed back on the same frame.
 *
 * The precedence rule is enforced HERE and in one place — see the header. `own`
 * is "the viewer's own death hold is holding this frame". True on the arming
 * edge and this beat is CONSUMED: it will not arm on that edge and it will not
 * arm later when the hold finishes. A queued beat is a beat that runs into the
 * countdown.
 */
export function createRoundCamera() {
  let holding = false;
  let t = 0;
  let from = { x: 0, y: 2, z: 4 };
  let skipped = false;
  /** Rising edge only, exactly as `wasDead` is above. */
  let wasEnded = false;
  /** This round's beat has been decided one way or the other. */
  let consumed = false;

  function stop() {
    holding = false;
    t = 0;
    skipped = false;
  }

  return {
    get elapsed() { return holding ? t : 0; },
    get holding() { return holding; },

    /** Any key, any tap, any click. The same press that skips your own hold. */
    skip() {
      if (holding) skipped = true;
    },

    /** A new round, a new match, a disconnect. Idempotent from any state. */
    reset() {
      stop();
      wasEnded = false;
      consumed = false;
    },

    /**
     * One frame.
     *
     * @param dt       seconds.
     * @param s.ended  is the room in the break this death ended. The rising edge
     *                 arms the beat.
     * @param s.live   may the beat still hold the lens. False the moment the
     *                 next round is being dealt or the match summary takes over,
     *                 and it releases on that frame.
     * @param s.own    is the viewer's OWN death hold running this frame. Wins.
     * @param s.body   the last man to fall, world position (feet), live — the
     *                 collapse is still running through the break.
     * @param s.wound  world point of his cut, live. Absent, his chest.
     * @param s.spray  unit world direction the wound faces.
     * @param s.part   the severed piece's live world position, or null.
     * @param s.killer the man who ended the round, or null.
     * @param s.camera where the viewer's lens is. Used only as the last-resort
     *                 bearing for the cut; this shot does not start from it.
     * @param s.groundAt terrain height under a world (x,z).
     * @returns the shot, or null when the lens belongs to somebody else.
     */
    update(dt, s) {
      const ended = !!s.ended;
      const live = !!s.live;
      const own = !!s.own;

      if (ended && !wasEnded && live && !consumed) {
        consumed = true;
        // The precedence rule, and the reason it is a rule and not an ordering
        // accident: a viewer already inside his own hold is left alone, and the
        // beat is not saved up for him.
        if (!own && s.body) {
          const wound = s.wound ?? { x: s.body.x, y: s.body.y + 1.15, z: s.body.z };
          holding = true;
          t = 0;
          skipped = false;
          from = roundOpening({
            wound,
            spray: s.spray ?? null,
            killer: s.killer ?? null,
            from: s.camera ?? null,
            groundAt: s.groundAt,
          });
        }
      }
      wasEnded = ended;

      if (!holding) return null;
      // `own` is checked every frame and not only on the edge: a man who dies
      // DURING the break — the fire finishes him a second after the round ended
      // — has his own hold armed under a beat that is already running, and his
      // own death still outranks it.
      if (!live || own || skipped || !s.body) { stop(); return null; }

      t += Math.max(0, dt);
      if (t >= ROUND_HOLD.total) { stop(); return null; }

      return frameDeathShot({
        t,
        from,
        body: s.body,
        wound: s.wound ?? null,
        spray: s.spray ?? null,
        part: s.part ?? null,
        killer: s.killer ?? null,
        groundAt: s.groundAt,
        hold: ROUND_HOLD,
        fov: ROUND_FOV,
      });
    },
  };
}
