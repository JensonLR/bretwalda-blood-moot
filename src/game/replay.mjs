// THE KILL REPLAY — the last death of a round, RECORDED and played back slow.
//
// The owner, 19 Aug 2026, having played the merged build:
//
//   "The final kill camera would be better as a slow-mo replay before the next
//    round starts, and before a match ends too — skippable at end of match,
//    just take them to the lobby."
//
// ---------------------------------------------------------------------------
// THIS IS A REPLAY. IT IS NOT THE LIVE CAMERA WITH THE CLOCK TURNED DOWN.
//
// Said first and said plainly, because the cheap version of this feature is to
// scale `dt` on the existing round beat and call the result slow motion. That
// would be a lie in one specific and checkable way: **the live camera cannot
// show you the blow.** `createRoundCamera` arms on the frame the last man
// falls, which is the frame AFTER the swing landed. Everything the owner wants
// to see again — the approach, the windup, the contact — has already happened
// and is not on screen any more. Slowing the lens from that frame onward shows
// a body settling, slowly. A replay REWINDS.
//
// So this module records the fight and plays it back, and
// `tools/replaytest.mjs` asserts the difference rather than asserting the
// adjective: it drives the real `poseWarrior` off the buffer and requires the
// replayed pose to match, channel by channel, the pose that was live at that
// recorded moment. A slowed live camera cannot pass that, because it has no
// past to be compared against.
//
// ---------------------------------------------------------------------------
// WHAT IS RECORDED, AND WHAT IT COSTS
//
// Not the `game_state` broadcast. `protocoltest` measures that at 10,517 bytes
// per snapshot for eight men, and a ring of those is ~630 KB of JSON churned
// into the garbage collector at 20 Hz for a two-second window. What the picture
// actually needs is much smaller: **the fields `anim.ts` reads off a
// `GamePlayer`**, and that list is short and was taken from the file rather
// than guessed —
//
//     numbers   position xyz, rotation, velocity xyz, attackTimer, swingT,
//               swingDuration, blockTimer, staggerTimer, downTimer, hitstop,
//               health, maxHealth                                    (16 f32)
//     enums     state, attackDir, deathZone, deathDir, deathCause     (5 u8)
//     flags     swingHeavy, invincible, abilityActive, deathHeavy     (1 u8)
//
// 70 bytes of man, plus a presence byte and a share of the frame's own 8-byte
// timestamp: 72 B per man per frame, in preallocated typed arrays. At 20 Hz,
// eight seats and a 3-second ring that is
//
//     buffer.bytes = 34,560          (60 frames * 8 seats * 72 B)
//
// allocated once, never grown, and ZERO allocation per recorded frame. That
// figure is printed by `createReplayBuffer().bytes` and is the one measured on
// this build, not an arithmetic claim about it.
//
// That is R12 stage 3 and stage 4 — the work is done once at construction and
// the hot path produces no garbage — and it is why this is a ring of typed
// arrays and not an array of objects. `replaytest` measures `buffer.bytes`
// and re-measures it after a thousand recorded frames; if it moved, something
// is allocating.
//
// THE COMPLETENESS OF THAT FIELD LIST IS NOT ASSERTED BY READING IT. A field
// left out is a field the replayed body will not have, and the pose comparison
// in `replaytest` is what catches it: miss `swingT` and the replayed man swings
// at the wrong phase and the channels disagree. The list is a hypothesis; the
// harness is the test.
//
// ---------------------------------------------------------------------------
// WHY THE RING KEEPS RECORDING WHILE IT IS PLAYING
//
// The replay opens on the past and ends in the future. It starts at the death
// tick and shows `REPLAY.pre` seconds BEFORE it; by the time playback needs
// `REPLAY.post` seconds AFTER the blow, more than that much real time has gone
// by, because playback is slower than life. So the write head runs ahead of the
// read head throughout and the post-roll is simply there when it is wanted.
// The ring is sized for the whole window plus margin so the write head cannot
// lap the read head.
//
// ---------------------------------------------------------------------------
// TIME HERE, SPACE IN deathcam.mjs
//
// This module answers "which recorded moment is on screen this frame". It does
// not decide where the lens goes: `frameDeathShot` in `src/game/deathcam.mjs`
// is one definition of "where the camera goes to watch a man die" and it stays
// the only one. The renderer poses the rigs from the buffer, reads the wound
// off those rewound rigs exactly as it reads it off live ones, and hands it to
// the same geometry. Two derivations of where a wound is would let the replay
// and the live beat disagree about the same corpse.
//
// ---------------------------------------------------------------------------
// TWO THINGS THE RENDERER MUST DO, OR THE REPLAY IS ONLY NEARLY THE FIGHT
//
// Neither belongs in this file and both are easy to miss, so they are written
// down here and `tools/replaytest.mjs` drives them on both paths so that a
// difference would show up as a pose that does not match.
//
//   `ctx.time` COMES FROM `at`, NOT FROM THE WALL CLOCK. `poseWarrior` rides
//   the idle, the breath and the weapon sway on `ctx.time`. A replay clocked
//   off the wall replays the fight with a man breathing at a different phase —
//   invisible in a still and wrong in a comparison, and there is no reason to
//   accept it when the recorded time is right there.
//
//   `dt` IS THE SLOWED ONE, AND `update()` HANDS IT TO YOU. This is the one
//   that is easy to get wrong and it was got wrong here first: `replaytest` §1
//   came back 83.27° out on the right knee, all of it inside `dead`, because
//   the recorded stream was crawling at half speed while `motion.actT` — the
//   client's own collapse clock — was still counting real seconds. The body
//   fell at full speed through a fight that was playing at half. Both clocks
//   have to be the same clock, so `update()` returns `dt` already multiplied by
//   `rate` and the renderer passes THAT to `stepWarriorTransform` and
//   `poseWarrior`. Slow motion is not a property of the pictures; it is a
//   property of every clock behind them.
//
//   THE DELTA-DERIVED EFFECTS RE-RUN. `motion.recoil` is raised by the
//   ORCHESTRATOR on the frame a man's health drops — `GameCanvas.tsx` does it,
//   `stepWarriorTransform`'s own comment says a rise in it is the only edge
//   there is for "struck just now" — and `takeBearing` hangs off that edge. The
//   recorded stream carries `health`, so the replay path derives it the same
//   way from the same numbers. Skip it and the replayed corpse falls the wrong
//   way, which is the defect the branch this landed on spent its second commit
//   removing.

/** The ordered vocabularies the u8 columns encode. Order is the wire format. */
const STATES = ["idle", "walking", "running", "sprinting", "attacking", "blocking",
  "dodging", "rolling", "staggered", "knocked", "rising", "dead", "ability", "shoving"];
const DIRS = ["left", "right", "overhead", "stab"];
const ZONES = ["head", "neck", "armL", "armR", "legL", "legR", "torso", "waist"];
const CAUSES = ["blow", "fire"];
const idx = (list, v) => { const i = list.indexOf(v); return i < 0 ? 255 : i; };
const val = (list, i) => (i === 255 ? null : list[i] ?? null);

/** 16 floats and 6 bytes, per man per frame. See the header for the derivation. */
const F_PER = 16;
const B_PER = 6;

export const REPLAY = {
  /**
   * Playback speed. HALF, and the reason it is exactly a half is that it is the
   * one rate nobody has to argue about: it is unmistakably slow motion, it is
   * what every replay in every sport is cut at, and it divides the arithmetic
   * below into numbers a person can check in their head.
   */
  rate: 0.5,
  /**
   * Seconds of fight BEFORE the killing blow. 0.92 s, and it is derived, not
   * chosen: it is the longest time in this game between a swing STARTING and
   * that swing's contact window CLOSING.
   *
   *   `swingDurationOf("berserker", true)` = 1.663 s, the slowest swing there
   *   is, and `SWING_PHASES` puts contact at 0.40..0.55 of it — so the last
   *   instant a blow can land is 0.55 * 1.663 = 0.915 s after the swing began.
   *
   * Rounded up to 0.92. Below this the replay would open PART WAY THROUGH the
   * killing swing for the slowest class in the game, which is the one thing it
   * exists not to do.
   */
  pre: 0.92,
  /**
   * Seconds of fight AFTER it. This one is what the budget below leaves, and
   * saying so is more honest than dressing it as anatomy: `wall` is fixed by
   * the server's break, `rate` is a half, `pre` is derived, and `post` is the
   * remainder.
   *
   * 1.08 s is worth having. `freezetest --phases=collapse` measures a body
   * reaching the ground between 0.52 s and 1.17 s depending on the death, so
   * this carries all but the slowest of them onto the turf. The slowest is
   * 0.09 s short, `replaytest` prints exactly that on its verdict line, and it
   * is a deferral rather than a clean sheet.
   */
  post: 1.08,
  /**
   * THE BUDGET, AND IT IS THE SERVER'S AND NOT THIS FILE'S.
   *
   * `ROUND_BREAK` in `engine.mjs` is 5 s. `deathcam.mjs`'s whole argument for
   * its round beat is that 2.95 s inside a measured 5 s break means NOTHING
   * WAITS ON IT, and that argument is the one being extended here rather than
   * replaced. One second is held back so the countdown is still dealt on time,
   * which leaves 4.0 s of wall clock for the replay.
   *
   * At a half speed that is 2.00 s of fight, and 2.00 - 0.92 is where `post`
   * comes from. `replaytest` reads `ROUND_BREAK` off the engine and fails if
   * this stops fitting inside it.
   */
  wall: 4.0,
  /** Seconds of fight shown. `wall * rate`, and the harness checks the identity. */
  fight: 2.0,
  /**
   * How much history the ring holds, in seconds — and it is NOT `pre`.
   *
   * This was 3.0 s in the first draft, on the reasoning that playback only ever
   * reads `pre` = 0.92 s behind the write head. That is wrong, and `replaytest`
   * §1 caught it on the first run with "the ring did not hold t+19.04s, which
   * the replay asked for": the read head does not keep station, it FALLS
   * FURTHER BEHIND every frame, because the recorder runs at life speed and
   * playback runs at half of it.
   *
   *     worst lag  =  pre + wall * (1 - rate)
   *                =  0.92 + 4.0 * 0.5
   *                =  2.92 s
   *
   * at the last frame of the replay, when the read head is at `death + post`
   * and the write head is at `death + wall`. A 3.0 s ring cleared that by
   * 0.08 s — one and a half recorded frames — which is not a margin, it is a
   * coincidence.
   *
   * 5.0 s is that worst lag with about 70% over it, which at 20 Hz and eight
   * seats is 100 frames and 57,600 bytes. `replaytest` §5 asserts the identity
   * rather than the number, so retuning `rate` or `wall` cannot quietly make
   * the ring too short again.
   */
  history: 5.0,
  /** The record rate. The server's tick, so one recorded frame is one snapshot. */
  hz: 20,
};

/**
 * THE RING.
 *
 * `seats` is the maximum number of men it can hold, not the number in the room:
 * the arrays are allocated once at this width and a man who joins takes the
 * next free seat. A seat is kept for the buffer's life, because a two-second
 * window is far shorter than anyone's stay in a round, and recycling seats
 * mid-window is how a replay ends up drawing one man's arm on another man.
 */
export function createReplayBuffer({ seats = 8, seconds = REPLAY.history, hz = REPLAY.hz } = {}) {
  const cap = Math.max(2, Math.ceil(seconds * hz));
  const f = new Float32Array(cap * seats * F_PER);
  const b = new Uint8Array(cap * seats * B_PER);
  const present = new Uint8Array(cap * seats);
  const stamp = new Float64Array(cap);          // sim seconds of each frame
  const seatOf = new Map();                     // player id -> seat
  const ids = new Array(seats).fill(null);
  const kit = new Array(seats).fill(null);      // warriorClass/team/maxHealth, per seat
  let head = -1;                                // most recent slot, -1 when empty
  let count = 0;

  const seatFor = (id) => {
    let s = seatOf.get(id);
    if (s !== undefined) return s;
    if (seatOf.size >= seats) return -1;
    s = seatOf.size; seatOf.set(id, s); ids[s] = id;
    return s;
  };

  return {
    seats, cap, hz,
    /** Bytes held. Measured by the harness before and after a long record. */
    get bytes() { return f.byteLength + b.byteLength + present.byteLength + stamp.byteLength; },
    get frames() { return count; },
    /** Sim time of the oldest and newest frames held, or null when empty. */
    get first() { return count ? stamp[(head - count + 1 + cap * 2) % cap] : null; },
    get last() { return count ? stamp[head] : null; },

    reset() { head = -1; count = 0; seatOf.clear(); ids.fill(null); kit.fill(null); },

    /**
     * One frame in. `players` is any iterable of live player records — the
     * renderer hands it the same array it is about to draw. NOTHING IS
     * ALLOCATED HERE: every write is into the arrays above.
     */
    record(t, players) {
      head = (head + 1) % cap;
      if (count < cap) count++;
      stamp[head] = t;
      present.fill(0, head * seats, head * seats + seats);
      for (const p of players) {
        if (!p || !p.id) continue;
        const s = seatFor(p.id);
        if (s < 0) continue;
        if (!kit[s]) kit[s] = { id: p.id, warriorClass: p.warriorClass, team: p.team };
        present[head * seats + s] = 1;
        let o = (head * seats + s) * F_PER;
        const pos = p.position || { x: 0, y: 0, z: 0 };
        const vel = p.velocity || { x: 0, y: 0, z: 0 };
        f[o] = pos.x; f[o + 1] = pos.y; f[o + 2] = pos.z;
        f[o + 3] = p.rotation || 0;
        f[o + 4] = vel.x || 0; f[o + 5] = vel.y || 0; f[o + 6] = vel.z || 0;
        f[o + 7] = p.attackTimer || 0;
        f[o + 8] = p.swingT || 0;
        f[o + 9] = p.swingDuration || 0;
        f[o + 10] = p.blockTimer || 0;
        f[o + 11] = p.staggerTimer || 0;
        f[o + 12] = p.downTimer || 0;
        f[o + 13] = p.hitstop || 0;
        f[o + 14] = p.health || 0;
        f[o + 15] = p.maxHealth || 0;
        o = (head * seats + s) * B_PER;
        b[o] = idx(STATES, p.state);
        b[o + 1] = idx(DIRS, p.attackDir);
        b[o + 2] = idx(ZONES, p.deathZone);
        b[o + 3] = idx(DIRS, p.deathDir);
        b[o + 4] = idx(CAUSES, p.deathCause);
        b[o + 5] = (p.swingHeavy ? 1 : 0) | (p.invincible ? 2 : 0)
          | (p.abilityActive ? 4 : 0) | (p.deathHeavy ? 8 : 0);
      }
    },

    /**
     * The slot whose stamp is nearest at or before `t`, or -1 when `t` is older
     * than the ring. NEAREST-AT-OR-BEFORE AND NOT INTERPOLATED, deliberately:
     * the recorded stream is the server's own 20 Hz and the renderer already
     * owns the only interpolator this game has — `ingestNet` in `anim.ts`, with
     * its jitter buffer. A second smoother here would be a mirrored definition
     * of "where is this man between two packets", which is failure mode 3.
     */
    slotAt(t) {
      if (!count) return -1;
      let best = -1;
      for (let i = 0; i < count; i++) {
        const s = (head - i + cap * 2) % cap;
        if (stamp[s] <= t + 1e-9) { best = s; break; }
      }
      return best;
    },

    /**
     * Rebuild the men of one recorded frame into `out`, which the caller owns
     * and this reuses — again, no allocation once it is warm. Returns the
     * number of men written, or -1 when that moment is not held.
     */
    readInto(t, out) {
      const s = this.slotAt(t);
      if (s < 0) return -1;
      let n = 0;
      for (let seat = 0; seat < seats; seat++) {
        if (!present[s * seats + seat]) continue;
        let p = out[n];
        if (!p) { p = out[n] = { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } }; }
        const k = kit[seat];
        p.id = k.id; p.warriorClass = k.warriorClass; p.team = k.team;
        let o = (s * seats + seat) * F_PER;
        p.position.x = f[o]; p.position.y = f[o + 1]; p.position.z = f[o + 2];
        p.rotation = f[o + 3];
        p.velocity.x = f[o + 4]; p.velocity.y = f[o + 5]; p.velocity.z = f[o + 6];
        p.attackTimer = f[o + 7];
        p.swingT = f[o + 8];
        p.swingDuration = f[o + 9];
        p.blockTimer = f[o + 10];
        p.staggerTimer = f[o + 11];
        p.downTimer = f[o + 12];
        p.hitstop = f[o + 13];
        p.health = f[o + 14];
        p.maxHealth = f[o + 15];
        o = (s * seats + seat) * B_PER;
        p.state = val(STATES, b[o]);
        p.attackDir = val(DIRS, b[o + 1]);
        p.deathZone = val(ZONES, b[o + 2]);
        p.deathDir = val(DIRS, b[o + 3]);
        p.deathCause = val(CAUSES, b[o + 4]);
        const fl = b[o + 5];
        p.swingHeavy = !!(fl & 1); p.invincible = !!(fl & 2);
        p.abilityActive = !!(fl & 4); p.deathHeavy = !!(fl & 8);
        n++;
      }
      out.length = Math.max(out.length, n);
      return n;
    },
  };
}

/**
 * THE CLOCK — when a replay runs, which recorded moment is on screen, and when
 * it lets go.
 *
 * Deliberately the same shape as `createDeathCamera` and `createRoundCamera`:
 * an object with `update(dt, s)`, `skip()` and `reset()`, all of the deciding
 * inside, so `tools/replaytest.mjs` drives the thing the player drives rather
 * than a model of it. There is one definition of when a replay runs.
 *
 * TWO PLACES IT ARMS, AND THE SECOND IS THE HOLE IN `docs/BACKLOG.md` 2.6.
 *
 *   BETWEEN ROUNDS   the room enters `intermission` and the server is already
 *                    taking `ROUND_BREAK`. The replay fits inside it, as the
 *                    round beat it replaces did.
 *   AT MATCH END     the room goes `fighting` -> `finished` IN ONE TICK and
 *                    there is no break at all, which is exactly why 2.6 has
 *                    stood open: the last death of a match was seen by nobody,
 *                    because `render/summary.ts` takes the lens for the
 *                    victor's portrait on the same frame. The replay is what
 *                    holds that back, and `atEnd` is how the caller knows to
 *                    keep the summary off the screen while it runs.
 *
 * SKIPPABLE, AND THE SKIP MEANS SOMETHING DIFFERENT AT THE END OF A MATCH. The
 * owner: *"skippable at end of match, just take them to the lobby."* So `skip()`
 * ends the replay wherever it is, and `atEnd` stays true through the frame it
 * ends on, so the caller can route a skipped match-end replay straight on
 * instead of dropping the viewer back into an arena that no longer has a match
 * in it. This module does not navigate; it says which beat just ended and why.
 */
export function createKillReplay() {
  let playing = false;
  let armed = false;          // has this death already had its replay
  let atEnd = false;
  let elapsed = 0;
  let deathAt = 0;            // sim time of the killing blow
  let skipped = false;
  let lastEnded = false;

  const api = {
    get elapsed() { return elapsed; },
    get playing() { return playing; },
    get atEnd() { return atEnd; },
    get skipped() { return skipped; },

    skip() { if (playing) { skipped = true; playing = false; } },
    reset() { playing = false; armed = false; atEnd = false; elapsed = 0; skipped = false; lastEnded = false; },

    /**
     * @param dt      wall seconds since the last frame
     * @param s.ended is the round over — `intermission` or `finished`. The
     *                RISING EDGE arms the replay; an edge nobody looks at is an
     *                edge that is missed, so call this every frame.
     * @param s.end   is this the end of the MATCH rather than of a round
     * @param s.own   is the viewer's own death hold running. Between rounds it
     *                outranks this, for the two reasons `deathcam.mjs` gives:
     *                cutting off a man's own collapse to watch somebody else's
     *                is the cut that module exists to refuse, and the two do not
     *                both fit in the break.
     *
     *                AT MATCH END IT DOES NOT, AND THAT IS NOT A TRADE — IT IS
     *                THIS FLAG BEING OUT OF DATE. `runDeathCam` in
     *                `GameCanvas.tsx` passes `live` = fighting | last_stand |
     *                `intermission`, and `createDeathCamera` stops on any frame
     *                `live` is false. So the transition into `finished` ENDS THE
     *                HOLD, later in the same frame that offers this edge. `own`
     *                here is the hold's answer from the PREVIOUS frame — the
     *                orchestrator says so — and refusing on it at match end
     *                protects a hold that the same edge has already taken away.
     *                Nothing is cut off; the viewer simply gets the summary
     *                instead of the replay, which is the hole this feature was
     *                built to close.
     *
     *                MEASURED, and it is a bigger hole than "the man who dies
     *                last": `replaytest` §4 sweeps how long before the room
     *                ended the viewer died. On the shipped build every gap from
     *                one render frame to `DEATH_HOLD.total` (3.35 s) drew ZERO
     *                replay frames at match end, permanently — `armed` is only
     *                cleared while `!ended`, and at match end the room never
     *                leaves `finished` in time. The man whose death IS the last
     *                one (gap 0) always got his 240 frames, because his hold had
     *                not armed on the previous frame either. That is the one
     *                case the refutation named and the one case that worked.
     * @param s.deathAt sim time of the killing blow, as the recorder stamped it
     * @param s.ready is the buffer holding `REPLAY.pre` seconds before it yet
     * @returns {{at:number, dt:number, through:number, atEnd:boolean}|null}
     *          `at` is the sim time to draw and the value `ctx.time` must take;
     *          `dt` is the WALL dt already scaled by `rate`, and it is what the
     *          animator must be stepped with — see the note above, this is the
     *          one that bites; `through` is 0..1 through the replay.
     */
    update(dt, s) {
      const ended = !!s.ended;
      const edge = ended && !lastEnded;
      lastEnded = ended;

      // WHOSE BEAT IS THIS. The viewer's own hold outranks a ROUND-end replay and
      // does not outrank a MATCH-end one, and the difference is not a taste:
      // between rounds the hold survives the edge and keeps the lens, at match
      // end the same edge has already ended it. See `s.own` above.
      const outranked = !!s.own && !s.end;

      if (!ended) { if (!playing) { armed = false; atEnd = false; skipped = false; } }
      if (playing && (!ended || (s.own && !atEnd))) {
        // The round was dealt out from under it, or the viewer's own death took
        // the lens. Either way this beat is over and it does not resume.
        //
        // `!atEnd` for the same reason the arming test carries `!s.end`: a hold
        // cannot be running at match end, so a `true` here would be the stale
        // flag again, and it would cut the replay off on its second frame.
        playing = false;
        return null;
      }
      if (edge && !armed && !outranked && s.ready) {
        armed = true; playing = true; skipped = false; elapsed = 0;
        atEnd = !!s.end;
        deathAt = s.deathAt;
      } else if (edge) {
        // Armed-and-refused is still armed: a replay that could not open on the
        // edge does not open three frames later over a body that has settled.
        //
        // AND IT IS PERMANENT, which is why the test above had to be the fix
        // rather than a retry: `armed` is cleared only inside `if (!ended)`, and
        // a finished room does not become un-finished. Between rounds that is
        // deathcam.mjs's rule stated exactly — "the round's is never queued" —
        // and the budget behind it is real, 3.35 s of hold plus 4.0 s of replay
        // does not fit a 5 s break. At match end this branch is now
        // unreachable for `own`, and the only thing that can still land here is
        // a ring too short to serve the run-up, which no amount of waiting
        // fixes.
        armed = true;
        atEnd = !!s.end && playing;
      }
      if (!playing) return null;

      elapsed += Math.max(0, dt);
      if (elapsed >= REPLAY.wall) { playing = false; return null; }
      const at = deathAt - REPLAY.pre + elapsed * REPLAY.rate;
      return { at, dt: Math.max(0, dt) * REPLAY.rate, through: elapsed / REPLAY.wall, atEnd };
    },
  };
  return api;
}
