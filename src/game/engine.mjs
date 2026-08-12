// ============================================================
// BRETWALDA — Unified Game Engine (WS + HTTP transports, bots)
// Shared singleton via globalThis so custom-server and Next API
// routes share the same rooms in one process.
// ============================================================
import { randomUUID } from "crypto";

const TICK_RATE = 20;

/**
 * The two rooms states in which a man may still change his kit or his side.
 *
 * `intermission` is included deliberately — between rounds is exactly when a
 * player should be able to switch class, and health is restored at the round
 * start anyway, so the re-roll costs nothing there. `countdown`, `fighting`,
 * `last_stand` and `finished` are not: in those, a class change is a heal and a
 * team change is a truce nobody agreed to.
 */
const KIT_STATES = new Set(["lobby", "intermission"]);

/** The only sides that exist. `checkRoundEnd` counts these two and no others. */
const TEAMS = new Set(["none", "red", "blue"]);
const PARRY_WINDOW = 0.15;
const COMBO_WINDOW = 0.8;
const DODGE_DURATION = 0.35;
const DODGE_COOLDOWN = 0.8;
const STAGGER_DURATION = 0.6;
const MATCH_COUNTDOWN = 3;
const SPAWN_INVINCIBLE = 2.0;
const ARENA_RADIUS = 18;
// Centre-to-centre gap two warriors are held apart at. It is the only statement
// the sim makes about how wide a man is, which is why the fire borrows it below.
const BODY_MIN_SEP = 1.05;

// ---- the fire ----
// The bonfire at the origin is the only terrain in the game, and this block is
// the whole of the simulation's knowledge of it. Standing in it kills; passing
// through it hurts. That is one radius and two rates, not two rules — nothing
// below asks how fast anybody was moving.
//
// FIRE_GEOMETRY_RADIUS is a measurement, not a choice. `world.ts` lays seven
// tripod poles at 0.74 rad off vertical on a 0.72 m ring, so a 1.9 m pole throws
// its tip 1.9·sin(0.74) = 1.28 m out plus that ring offset, and the module
// records the result in its own words: the fire's widest geometry reaches 2.0 m.
// That is the outer edge of the thing a player can see, and the hearth stones
// sit just past it at 1.75–1.95.
//
// The hazard sits inside that by exactly one body's half-width. Trigger on a
// man's centre at 1.475 and he is alight only once his near shoulder is a metre
// deep in the flame and his far shoulder is level with the outermost log — he
// is more in the fire than out of it before it bites. A player who clips the
// edge and gets away with it never notices; one who can see he is clear and
// burns anyway calls the game broken, so that is the direction to be wrong in.
const FIRE_GEOMETRY_RADIUS = 2.0;
const HAZARD_RADIUS = FIRE_GEOMETRY_RADIUS - BODY_MIN_SEP / 2;   // 1.475

// Tuned against the LOW end of the roster — the runekeeper's 90, because the
// class fast enough to treat the fire as a shortcut is the one who finds the
// edge of this. What the numbers buy, with the hazard 2.95 m across:
//
//   standing in it   90/22 = 4.1 s kills a runekeeper, 6.8 s a huscarl. Long
//                    enough to feel the mistake and walk out of it, far too
//                    short to fight in.
//   walking through  the slowest walk in the game (huscarl, 4.0 u/s) is inside
//                    for 0.74 s = 16, plus 12 of afterburn = 28. Under a third
//                    of the frailest class, a fifth of the toughest, and
//                    survivable from any health a man is still standing on.
//   sprinting through a runekeeper at 8.2 u/s is inside 0.36 s = 8, so 20 all
//                    told. The fast class pays less for the same ground, which
//                    is what being fast is for.
//
// The afterburn is a flat few seconds however briefly you touched it. That is
// deliberate and it is the feature: the image this exists to produce is a man
// running out of the fire still alight, and a burn that scaled with dwell time
// would give a grazing crossing no tail at all.
const BURN_DPS_INSIDE = 22;
const BURN_DPS_AFTER = 4;
const BURN_LINGER = 3.0;
// A man who burns down this soon after taking a blow was driven into the fire,
// and the kill belongs to whoever drove him. Past it the fire took him and
// nobody is paid. Longer than BURN_LINGER on purpose: the hit that panics a man
// lands before he runs into the flames, not after.
const BURN_CREDIT_WINDOW = 5.0;

// What a bot treats as the fire, and it is wider than the hazard on purpose: a
// bot that aims to miss by nothing misses by nothing. A whole body's clearance
// past the burn line, so the arc it walks keeps its shoulder out too.
const BOT_FIRE_KEEPOUT = HAZARD_RADIUS + BODY_MIN_SEP;   // 2.525
// How far down its own intended line a bot bothers to look. Well short of the
// arena, so bots still walk straight at each other across the moot and only
// start bending when the fire is genuinely in the way.
const BOT_FIRE_LOOKAHEAD = 5.0;

// ---- rounds ----
// A match is best of N. The host picks N in the lobby; the sim only ever asks
// two things of it — how many round wins take the match, and whether the format
// has run out of rounds to change anyone's mind.
const ROUND_OPTIONS = [1, 3, 5];
const DEFAULT_BEST_OF = 3;
const ROUND_BREAK = 5;          // seconds between rounds: long enough to read the
                                // result off the screen, short enough that nobody
                                // reaches for another tab
// The other two waits a room can be in, named now that they are numbers the
// simulation's own clock spends rather than arguments to setTimeout.
const SUMMARY_HOLD = 10;        // seconds the tableau holds before the room is a
                                // lobby again — render/summary.ts stages the
                                // victor over a corpse for exactly this window
const SOLO_DEAL_DELAY = 0.8;    // a beat between joining a trial and the ring
                                // being dealt, so a client has a frame of lobby
                                // to draw instead of being thrown into a fight

// ---- where men start ----
// The ring is sized from the headcount rather than fixed, because the same
// radius cannot serve two duellists and eight men in a moot. SPAWN_GAP is the
// straight-line room each man is owed from the neighbour beside him: more than
// three times the longest reach in the game (a warden's 2.64), so the bell is
// never a free first blow, and it is what the radius is solved for.
const SPAWN_GAP = 7.5;
// The floor clears the bonfire at the origin with room to spare — its widest
// geometry reaches 2 m and the hearth stones a little past that — and stops two
// duellists from being solved onto opposite sides of a hearth six paces wide.
const SPAWN_MIN_RADIUS = 6;
// The ceiling keeps everyone a good six metres inside the palisade at ARENA_RADIUS,
// so nobody opens a round with his back already against the timber.
const SPAWN_MAX_RADIUS = 12;
// A shield wall is a line. Men of one team stand this far apart along their own
// arc, and the arc never opens wider than TEAM_ARC — past that a war band is
// spread around the ring again, which is the fault this is here to fix.
const TEAM_LINE_GAP = 3.0;
const TEAM_ARC = Math.PI * 0.55;
// Golden angle. The whole ring turns by this much each round, so a best-of-5 is
// five different openings, and it is derived from the round index alone — the
// server stays the only authority on where anybody stands.
const ROUND_SPIN = 2.399963;

// ---- reach ----
// One flat ATTACK_RANGE of 3.0 for every class is why a berserker connected with
// the middle of his haft: the server was granting a metre of reach the weapon
// does not have, so the only part of the axe near the target at the moment of
// the hit was wood. The server stays authoritative; what changes is that its
// numbers now describe the weapons the player is actually looking at.
//
// These are measurements, not tuning knobs. Each is the largest local-space
// bounding-box max.y over the weapon's meshes — how far past the fist the steel
// goes — which is precisely how `anim.ts` derives `rig.reach` for the blade
// trail. Same definition on both sides, so the hit and the streak that draws it
// cannot drift apart. Re-measure when a builder in `characters.ts` is re-cut.
//
//   runekeeper  seax      0.50  buildDagger, blade tip station y = 0.50
//   berserker   Dane axe  1.00  buildAxe, headY 0.86 + top horn at +0.137;
//                               the haft alone stops at 0.92, which is the
//                               difference between an edge hit and a haft hit
//   huscarl     sword     1.06  buildSword, blade tip station y = 1.055
//   warden      spear     1.44  buildSpear, blade tip station y = 1.44
//
// NOTE: the warden carries `buildSpear`, not a sword, and it out-reaches the
// axe by 440 mm. The axe is a big weapon, but most of it hangs *below* the
// grip — the butt is 580 mm down the haft — and none of that is reach.
const WEAPON_REACH = { huscarl: 1.055, warden: 1.44, runekeeper: 0.50, berserker: 1.00 };

// The two bodies between the two fists, which no weapon table can supply:
// ~0.60 m from the attacker's centre out to his extended fist, ~0.25 m from the
// target's centre to the chest that stops the blade, and ~0.35 m of forgiveness
// so a hit the client already drew does not get denied by the lag between them.
// This is the one number here that is a judgement call rather than a measurement.
const BODY_REACH = 1.20;

const ATTACK_RANGE = Object.fromEntries(
  Object.entries(WEAPON_REACH).map(([cls, r]) => [cls, r + BODY_REACH]),
);
const DEFAULT_ATTACK_RANGE = ATTACK_RANGE.huscarl;

// How far off his facing a warrior may land a blow. Flat at 0.6π for every
// class before, which let a seax thrust connect with something stood behind the
// attacker's own shoulder. It is per-weapon now for the same reason reach is —
// a two-handed axe really does cross the whole front in one sweep, and a spear
// really is thrust down its own line and cannot be waved sideways.
//
// It is also where the warden pays for that 1.44 m of steel. Reach and arc
// multiply into the ground a single swing covers (~r²·θ), so leaving the spear
// on the old wide window would have handed the longest weapon the largest
// footprint as well, and a long weapon is supposed to trade something for the
// length. The footprints these land on, against 16.97 flat before:
// huscarl 8.0, warden 8.3, berserker 8.8, runekeeper 5.4. The runekeeper is
// lowest on purpose and is answering with the roster's best damage rate and
// best mobility; if it turns out to be answering with too little, this table
// is the lever, not `WARRIOR_STATS` — see the note on that table.
const SWING_ARC = {
  huscarl: Math.PI * 0.50,     // sword and shield: compact, worked in close
  warden: Math.PI * 0.38,      // spear: a line, not a sweep
  runekeeper: Math.PI * 0.60,  // twin seaxes, and the class that must fight from
                               // inside everyone else's guard needs the width
  berserker: Math.PI * 0.58,   // the two-handed sweep, which is genuinely wide
};
const DEFAULT_SWING_ARC = SWING_ARC.huscarl;

/** Centre-to-centre distance at which this warrior's weapon can bite. */
function reachOf(p) {
  return ATTACK_RANGE[p.warriorClass] ?? DEFAULT_ATTACK_RANGE;
}

// ---- hit zones ----
// The simulation has never had a hit *location*. `processAttack` finds a body
// inside a cone and takes health off it; the only thing on the wire that sounds
// like a place is `direction`, which is the attacker's swing, not a part of the
// man. Everything the death sequence wants — which limb leaves the body — has to
// be decided here, on the server, because two players watching the same death
// have to see the same corpse.
//
// The closed set the wire carries. `armL`/`legL` are the *target's own* left,
// anatomically: `characters.ts` mounts the right arm at local +x (`for (const
// side of [1, -1])`, and `armPivots[0]` is the weapon arm), so this is the same
// handedness the body is built with.
export const HIT_ZONES = ["head", "neck", "armL", "armR", "legL", "legR", "torso", "waist"];

// Class heights, as a multiple of the 1.965 m canonical figure. Lifted from
// `BUILD[cls].stature` in `characters.ts`: the server holds no geometry, and this
// is the smallest thing it can carry that still knows a berserker's chest sweep
// arrives at a runekeeper's throat. Re-copy it if a build trait moves — nothing
// fails loudly when it drifts, the deaths just stop matching the bodies.
//
// It deliberately does not carry the ±2.2% per-warrior stature step, which the
// client draws from a face seed the server never sees. The server's answer is the
// one every client draws, so that costs a hair of realism at a band edge and can
// never cost two spectators the same corpse.
const STATURE = { huscarl: 1.005, warden: 1.005, runekeeper: 0.945, berserker: 1.065 };
const DEFAULT_STATURE = 1.0;

// Where a swing's edge is when it arrives, as a fraction of the ATTACKER's own
// height, read against the landmarks a body is actually built from: crown 1.00,
// chin 0.863, collar 0.839, shoulder 0.795, chest 0.728, waist 0.613, hip 0.519,
// knee 0.270 of stature.
//
// The two horizontals are one motion at two heights, and that split is the design
// decision in this table rather than a measurement. A light side-cut is a
// wrist-and-shoulder stroke thrown at chest height; a heavy one is the committed
// body-weight sweep a two-hander is really swung with, and it goes through the
// belt. That is what buys the samurai bisection, and it turns the heavy attack
// into a choice a player can learn: chop overhead for a head, sweep heavy for a
// waist.
const SWING_HEIGHT = { overhead: 0.88, left: 0.70, right: 0.70, stab: 0.66 };
const HEAVY_SWEEP_DROP = 0.115;  // how much lower a committed horizontal bites
const CROUCH_DROP = 0.14;        // crouch and you cut at the legs. Desktop only —
                                 // `input.ts` binds it to ctrl and the touch path
                                 // never sends it, so it is something a player with
                                 // a keyboard can reach for, never a requirement.

// Band edges on the TARGET's body, same fractions-of-stature scale.
const Y_HEAD = 0.865;   // above the chin
const Y_NECK = 0.775;   // collar to chin, and the shoulder line just under it
const Y_TORSO = 0.615;  // chest and gut
const Y_WAIST = 0.500;  // belt to hip — the band the bisection lives in

// How far off the centre of his own arc the attacker has to catch a man before
// the edge is meeting the side of him rather than the middle. As a fraction of
// the class's own `SWING_ARC`, so it means the same thing on a spear as on an axe.
const LIMB_OFFSET = 0.62;

// Measured off the TARGET's facing: a blow arriving from back here never severs a
// face, it takes the nape.
const REAR_ARC = 1.95;  // radians from the target's forward, ~112 degrees

// What a zone is worth. Same blow, same weapon — where it lands is the only thing
// that changes. Kept close to neutral on average, because the previous pass
// retuned reach and arc and this must not quietly shorten every fight on top of
// that: the head's premium is paid for by the limbs, not printed.
//
// The ceiling on `head` is one interaction and it is worth naming. A berserker's
// heavy under BLOOD FURY is 75 before zoning and a runekeeper has 90 health;
// 1.18 makes that 88 and leaves him standing on 2. Anything from 1.20 up makes it
// the first blow in the game that kills a full-health warrior outright, which is
// not something to add as a side effect of a gore feature.
const ZONE_DAMAGE = {
  head: 1.18, neck: 1.12, waist: 1.10, torso: 1.0,
  armL: 0.85, armR: 0.85, legL: 0.72, legR: 0.72,
};

const wrapPi = (a) => {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
};

/**
 * Which part of `target` this blow landed on. Server-side and final: the client
 * is told, never asked.
 *
 * Two independent reads, both off state the sim already had in hand:
 *
 *   HEIGHT — where the weapon is when it arrives, expressed in the attacker's own
 *   body, then divided by the target's. This is the whole reason a berserker and
 *   a runekeeper should not kill each other the same way: one stroke is a chest
 *   wound in one direction and a throat in the other, and both statures were
 *   sitting in the sim all along without anything ever asking for them.
 *
 *   OFFSET — how far off the centre of his own swing the attacker caught him,
 *   which `processAttack` already computes to decide whether the blow lands at
 *   all. Dead centre is the body; the outside of the arc is the side of the man,
 *   so it takes an arm when it is high and a leg when it is low. It also gives
 *   the existing generosity of that cone an honest story: at the edge of a
 *   spear's arc the target's centre is a metre to one side, and the only thing
 *   out there to hit is a limb.
 *
 * Approach angle is the third signal and it only ever takes away: from behind, a
 * head strike becomes the nape rather than the face.
 *
 * @param {number} angleDiff signed bearing of the target off the attacker's facing
 * @param {number} arc the attacker's `SWING_ARC`, so offset is relative to his own swing
 * @returns {string} one of HIT_ZONES
 */
export function deriveHitZone(attacker, target, angleDiff, arc, isHeavy) {
  const dir = SWING_HEIGHT[attacker.attackDir] === undefined ? "right" : attacker.attackDir;
  const horizontal = dir === "left" || dir === "right";

  let h = SWING_HEIGHT[dir];
  if (horizontal && isHeavy) h -= HEAVY_SWEEP_DROP;
  if (attacker.latestInput && attacker.latestInput.crouch) h -= CROUCH_DROP;
  h *= (STATURE[attacker.warriorClass] ?? DEFAULT_STATURE) /
       (STATURE[target.warriorClass] ?? DEFAULT_STATURE);

  // Which of the target's own sides the edge came in on. The derivation needs no
  // handedness convention at all: a blade travelling from the attacker's right
  // meets whichever flank of the target is turned toward the attacker's right,
  // and whether that is the target's right or his left depends only on whether
  // the two men are facing each other.
  const opposed = Math.cos(wrapPi(attacker.rotation - target.rotation)) < 0;
  // A horizontal names its own side. An overhead or a thrust comes down the
  // attacker's centreline, so the only side it can catch is the target's near
  // flank — the one turned toward the attacker's aim, which is the opposite sign.
  const from = horizontal ? (dir === "right" ? 1 : -1) : (angleDiff >= 0 ? -1 : 1);
  const side = (opposed ? -from : from) > 0 ? "R" : "L";

  if (arc > 0 && Math.abs(angleDiff) / arc > LIMB_OFFSET) {
    return (h >= Y_TORSO ? "arm" : "leg") + side;
  }

  // Bearing from the target out to the attacker, against the target's own facing.
  const approach = wrapPi(angleDiff + attacker.rotation + Math.PI - target.rotation);
  if (h >= Y_HEAD) return Math.abs(approach) > REAR_ARC ? "neck" : "head";
  if (h >= Y_NECK) return "neck";
  if (h >= Y_TORSO) return "torso";
  // The samurai cut is a *cut*. A thrust at belt height is a gut wound and an
  // overhead cannot arrive down there at all, so neither one halves a man.
  if (h >= Y_WAIST) return horizontal ? "waist" : "torso";
  return "leg" + side;
}

// ---- movement tuning ----
// Every number here is a time constant in seconds, never a per-tick factor.
// gameTick turns them into per-dt rates, so they mean the same thing whatever
// the tick rate is and — the whole point — whatever the network is doing.
const MOVE_ACCEL_TAU = 0.17;    // 63% of the gap to full stride shed per tau: weight, not sludge
const MOVE_STOP_TAU = 0.14;     // let go of the keys and the boots bite
const MOVE_CARRY_TAU = 0.32;    // momentum you keep while committed to a swing or a roll
const IMPULSE_TAU = 0.34;       // lunges and rolls bleed off at the old friction's pace
const LUNGE_LIGHT = 0.9;        // ground a light swing carries you, in units
const LUNGE_HEAVY = 1.25;       // ...and a heavy one
const BLOCK_MOVE_MULT = 0.55;   // a raised shield is a slow shield — a felt tax, not a root
const SPRINT_STAMINA = 8;       // per second, sprinting
const BLOCK_STAMINA = 2;        // per second, guard up
const INPUT_LAPSE_MS = 600;     // a client this quiet has stopped asking for anything.
                                // Long enough that a hitching renderer is not a stutter in
                                // the legs — a phone that thermal-throttles or a software-GL
                                // capture box can spend 400 ms on a frame, and a warrior must
                                // not lose a fifth of his stride to the frame rate — short
                                // enough that a dead tab's warrior stops inside three strides.

// ---- weight ----
// A swing used to be one number and one instant: `attackTimer` counted down and
// `processAttack` resolved the hit on the same line that read the click. Nothing
// in that can read as heavy, because there is no time in which to read anything
// — a runekeeper's whole stroke was 0.34 s, less than a human reaction.
//
// A swing is now three phases of one clock. `attackTimer` still counts the whole
// stroke down, so everything that already read it (anim.ts, the audio path)
// keeps working; what is new is that the hit lands at the WINDUP/CONTACT
// boundary rather than at the click, and the phase is on the wire.
//
//   WINDUP    0.40  the blade goes back. Nothing has happened yet and a
//                   defender can see that it is about to.
//   CONTACT   0.15  the edge is out. `processAttack` runs once, on the step
//                   that crosses into this.
//   RECOVERY  0.45  the weight has to be brought back. This is what a whiff
//                   costs, and it is the largest share on purpose.
//
// They are fractions rather than seconds so one table describes every class,
// and playtest asserts each share against the class's own swing.
export const SWING_PHASES = { windup: 0.40, contact: 0.15, recovery: 0.45 };
const WINDUP_END = SWING_PHASES.windup;                             // 0.40
const CONTACT_END = SWING_PHASES.windup + SWING_PHASES.contact;     // 0.55

// A heavy was `attackSpeed * 1.4`. Against swings that are now 1.70x longer in
// absolute terms that put a berserker's heavy at 1.86 s, which is not a fight,
// it is a cutscene. 1.25 keeps the berserker heavy the longest committment in
// the game at 1.66 s and keeps its windup — 0.665 s — the most readable thing
// on the field, which is the right price for 50 damage.
const HEAVY_SWING_SCALE = 1.25;

// Hitstop. Both fighters freeze on contact: no timers, no travel, no thinking,
// and the reported velocity goes to zero so a client extrapolating between
// packets stops with them. The cheapest impact there is.
//
// 0.06 s is three frames at 60 Hz and just over one server tick; 0.11 s is
// nearly seven frames and two ticks. Both are paid by the ATTACKER as well, so
// a landed blow lengthens his own swing by exactly that much — impact costs
// tempo, which is why it reads as impact.
export const HITSTOP = { light: 0.06, heavy: 0.11 };

// Commitment. Free turning is instantaneous: `processInput` writes the client's
// yaw straight onto the body, and it stays that way, because a laggy camera is
// worse than a fast one. Inside a swing it is capped instead, in radians per
// second, integrated on the fixed step so the cap means the same thing at any
// message rate.
//
// 1.8 rad/s is 103 deg/s, which is about what it takes to hold a man strafing
// at 5 u/s three metres away — so a windup can still track, and only just. The
// per-phase scale takes almost all of it away once the edge is out.
export const SWING_TURN_RATE = 1.8;
export const SWING_TURN_PHASE = { windup: 1.0, contact: 0.25, recovery: 0.6 };

// What that buys, over a whole runekeeper light (0.58 s), against the 180 deg a
// free warrior takes instantly:
//   windup    0.232 s x 1.80 = 0.418 rad
//   contact   0.087 s x 0.45 = 0.039 rad
//   recovery  0.261 s x 1.08 = 0.282 rad
//                              0.739 rad = 42.3 deg for the entire swing.
// A committed blow can be led. It cannot be steered.

// ---- the shove ----
// The one act in the sim that moves a MAN rather than hurting him, and the
// bonfire is why it exists: burn credit (BURN_CREDIT_WINDOW above) already pays
// whoever last touched a man who cooks, so the moment a shove can set
// lastHitBy, driving someone into the flames is a credited kill with no other
// machinery. Its currency is position — zero damage, on purpose.
//
// The triangle it lives in: a shove beats a raised shield (the only guard-break
// that is not a heavy), a dodge beats a shove (i-frames cover the contact), and
// any blow beats a man stood there shoving air for 0.65 s. The windup is 0.30 s
// — slower than every light except the berserker's, in a game that just made
// windups the whole of readability — so it is answerable, and the turn cap
// binds it like any committed attack.
export const SHOVE = {
  windup: 0.30,    // the tell. Two hands come back before they land.
  recover: 0.35,   // the whiff cost, shield down the whole time
  range: 1.7,      // centre-to-centre: BODY_MIN_SEP is 1.05, so it is a step
                   // past contact, well inside every weapon's reach
  arc: Math.PI * 0.30,  // narrower than any swing: hands, not steel
  stamina: 25,     // more than a heavy (22): position is worth more than damage
  push: 2.2,       // metres of ground the impulse buys — enough to carry a man
                   // stood a body's width off the hazard line into the flames
  stagger: 0.55,   // he lands unbalanced; not long enough to be a free blow
                   // for anything slower than a runekeeper light
  cooldown: 1.5,   // from press to press, so a wall of shoves is not a build
};

// ---- emotes ----
// Three flourishes and no more: raise the weapon, beat the shield boss, taunt.
// They cost nothing and change nothing — no damage, no movement, no state the
// sim acts on — which is exactly why the server still owns them: an emote
// message a client can spam is a griefing tool, so every press is validated
// (alive, not mid-swing or mid-shove, not staggered or rolling) and throttled
// per player before anyone else hears it. The accepted id is kept on the
// player as his CHOSEN emote, so the end-of-match tableau can pose the victor
// with the flourish he actually used rather than a default.
export const EMOTES = ["raise", "boss", "taunt"];
// Spent against the ENGINE's sim clock, not against `matchTimer`: emotes are
// legal in the lobby, the intermission and over the summary, where the fight
// clock does not advance and a throttle held against it would never expire.
// (It was the wall clock, which got the same answer on a live server and the
// wrong one everywhere else — see the note on `simMs`.)
const EMOTE_COOLDOWN_MS = 2500;

// ---- the clock ----
// The simulation advances in fixed steps; the wall clock decides how many are
// owed. See gameTick — this is where the movement-speed bug actually lived.
const TICK_SLACK_MS = 3;        // treat a wake this close to a step boundary as on time,
                                // so a punctual timer is never a wasted wake
const MAX_CATCHUP_MS = 400;     // arrears we will work off in one wake; past this the box
                                // was asleep and fast-forwarding the fight is worse than
                                // losing the time

const DIFFICULTIES = ["recruit", "warrior", "jarl"];
const BOT_SKILL = { recruit: 0.45, warrior: 0.7, jarl: 0.92 };

// ---- what a bot may read of a swing ----
// A bot used to guard on `target.state === "attacking"`, which under the old
// timing meant "the blow has already been resolved" — the state and the damage
// arrived on the same line, so the guard was decoration. With a windup in front
// of the hit that same test would make a bot unhittable: it would see every
// stroke a whole tenth of a second before contact and block all of them.
//
// So a bot must now WATCH a windup for this long before it may answer it, and
// the windup has to still be running when it does. Against the roster's windups
// (runekeeper 0.232, warden 0.340, huscarl 0.408, berserker 0.532) that means a
// recruit at 0.287 s can only answer a huscarl or a berserker, a warrior at
// 0.214 s picks up the warden as well, and only a jarl at 0.174 s reads a seax.
// The class that is hard for a human to react to is hard for a bot, off the same
// number, which is the only way the two stay honest with each other.
const BOT_REACTION = 0.34;
const BOT_REACTION_SKILL = 0.18;
// And a bot's own cadence is measured from the end of its stroke rather than
// from a flat 1.5 s that no longer relates to anything: a berserker bot whose
// heavy takes 1.66 s would otherwise spend the whole swing throwing attacks the
// server drops. Recruit leaves 0.45-0.85 s between strokes, a jarl 0.18-0.58.
const BOT_SWING_GAP = 0.45;
const BOT_SWING_GAP_SKILL = 0.30;
const BOT_TITLES = { recruit: " the Young", warrior: "", jarl: " the Grim" };
const SOLO_BOTS_BY_DIFFICULTY = { recruit: 1, warrior: 2, jarl: 3 };
const SOLO_MAX_BOTS = 7;        // eight warriors in the ring, same as a blood moot

// This is the sheet the simulation fights by, and it is deliberately untouched
// by the reach pass even though the reach pass changed the balance under it.
// Two reasons, and the second is the hard one:
//
//   Reach came *down* for every class, so nobody was handed an advantage that
//   has to be paid for here. The class that gained relative ground is the
//   warden, and it pays in `SWING_ARC` instead.
//
//   `src/game/types.ts` carries a second copy of this table that the class-select
//   screen and the HUD read, and the two already disagree — that copy still has
//   the huscarl at 3.5 move / 0.7 attack against 4.0 / 0.6 here. Anything edited
//   here that a player can *see* on a card widens a drift that is already a bug:
//   change `maxHealth` and the card promises 90 while the health bar fills to
//   100. The runekeeper is the class the reach pass costs most (3.0 -> 1.70, and
//   it must now stand inside every other weapon), and if it needs paying back,
//   the payment has to land in both tables at once or not at all.
//
// ---- the weight pass ----
// `attackSpeed` is now the WHOLE stroke: windup, contact and recovery, split by
// SWING_PHASES. One column moved and nothing else did — no damage, no health, no
// reach, no arc, no zone multiplier. Every class is multiplied by the same
// 1.70x, to within 0.6%:
//
//   class        was    now    factor   windup   contact  recovery  heavy total
//   runekeeper   0.34   0.58   1.706    0.232    0.087    0.261     0.725
//   warden       0.50   0.85   1.700    0.340    0.128    0.383     1.063
//   huscarl      0.60   1.02   1.700    0.408    0.153    0.459     1.275
//   berserker    0.78   1.33   1.705    0.532    0.200    0.599     1.663
//
// Because the factor is common, every ratio the roster is balanced on survives
// exactly. Light damage per second, which is the number the runekeeper exists to
// win: 41.2 / 40.0 / 30.0 / 35.9 before, 24.1 / 23.5 / 17.6 / 21.1 after — the
// same order (runekeeper, warden, berserker, huscarl), the same spread, each a
// clean 1/1.70 of what it was. Berserker/runekeeper swing time is 2.29x before
// and 2.293x after. The fast class is exactly as fast, relative to the field, as
// it was this morning; it is only that the field is now heavy.
//
// What the pass DOES change is readability, and there it is deliberately not
// uniform. The windup a defender gets to answer runs 0.232 s against a seax and
// 0.532 s against a Dane axe. 232 ms is under a human reaction: a runekeeper's
// light is meant to be read from his stance, not answered after it starts, and
// that — not damage — is what the class is buying. Every other class is at 340 ms
// or more, which is comfortably reactable, and a berserker heavy telegraphs for
// two thirds of a second.
//
// The two tables are held together on this column: `types.ts` carries the same
// four numbers, because `anim.ts` drives the whole swing animation off its copy
// (`WARRIOR_STATS[cls].attackSpeed` as the nominal duration) and a drift here is
// a swing that finishes on the client before it lands on the server. The rest of
// that table's drift is left where it was — it is a display bug, not this one.
export const WARRIOR_STATS = {
  huscarl: { maxHealth: 150, moveSpeed: 4.0, sprintSpeed: 6.4, attackDamage: 18, heavyDamage: 30, attackSpeed: 1.02, blockReduction: 0.8, dodgeDistance: 3.6, staminaMax: 105, staminaRegen: 17, ability: "SHIELD WALL", abilityCooldown: 12 },
  warden: { maxHealth: 120, moveSpeed: 4.5, sprintSpeed: 6.8, attackDamage: 20, heavyDamage: 35, attackSpeed: 0.85, blockReduction: 0.6, dodgeDistance: 4.1, staminaMax: 115, staminaRegen: 20, ability: "BATTLE FOCUS", abilityCooldown: 15 },
  runekeeper: { maxHealth: 90, moveSpeed: 5.5, sprintSpeed: 8.2, attackDamage: 14, heavyDamage: 25, attackSpeed: 0.58, blockReduction: 0.4, dodgeDistance: 5.6, staminaMax: 135, staminaRegen: 24, ability: "SHADOW STEP", abilityCooldown: 8 },
  berserker: { maxHealth: 110, moveSpeed: 4.7, sprintSpeed: 7.2, attackDamage: 28, heavyDamage: 50, attackSpeed: 1.33, blockReduction: 0.3, dodgeDistance: 3.7, staminaMax: 95, staminaRegen: 14, ability: "BLOOD FURY", abilityCooldown: 18 },
};

/**
 * THE WHOLE FIELD IN ORDER — and the ONE definition of that order.
 *
 * The owner, on the results table: *"In the end of game results rounds won
 * should be recorded somehow for all to see in the table, that should also take
 * into account for ranking & payout, I've seen same kills & rounds won more be
 * snubbed on coins & ranking placement from 1st to 2nd due to alphabetical
 * order names"*.
 *
 * He was reading a table sorted by `score`, which is exactly kills x 100. Two
 * men level on kills therefore tied EXACTLY, the sort was stable, and the order
 * fell through to whatever order the room happened to hold — so a man who had
 * won an extra round was printed second, under a man he had beaten, and next to
 * a smaller pile of coins than the man below him. `decideMatch` had had the
 * right rule since the day the tiebreak went in; nothing but the single match
 * winner was ever asked to use it.
 *
 * This is that rule applied to everybody, and it is written ONCE: `decideMatch`
 * is now a reading of this function rather than a second copy of it. Mirrored
 * definitions are this repository's third named failure mode with four recorded
 * instances in `characters.ts` alone, and a ranking that exists twice is one
 * edit away from a summary whose picture and whose numbers name different men.
 *
 * `place` is COMPETITION ranking: two entrants level on rounds AND on kills are
 * both `place: 1` and the next man is `place: 3`. That is the honest answer to a
 * true tie, and it is what lets the payout below be equal for it. The tempting
 * alternative — pick one of them — is precisely the defect, because the only
 * things left to pick on are arrival and the alphabet, and neither of them
 * fought.
 */
export function rankEntrants({ roundWins = {}, entrants = [] }) {
  const kills = new Map(entrants.map((e) => [e.key, e.kills || 0]));
  // Anyone who won a round is a contender even if they have since left, so a
  // man cannot be denied a match he won by disconnecting after winning it.
  for (const k of Object.keys(roundWins)) if (!kills.has(k)) kills.set(k, 0);
  const rows = [...kills].map(([key, k]) => ({ key, rounds: roundWins[key] || 0, kills: k, place: 1 }));
  // Rounds, then kills, and NOTHING ELSE — no name, no id, no arrival. `sort` is
  // stable everywhere this runs, so a genuine tie comes out in the order it went
  // in; `place` then makes that order weightless, which is the point. Sorting on
  // anything a man did not do is how the owner ended up second.
  rows.sort((a, b) => (b.rounds - a.rounds) || (b.kills - a.kills));
  let place = 1;
  rows.forEach((r, i) => {
    const above = rows[i - 1];
    if (i > 0 && (r.rounds !== above.rounds || r.kills !== above.kills)) place = i + 1;
    r.place = place;
  });
  return rows;
}

/**
 * WHO TOOK THE MATCH, AND THE TIEBREAK THAT WAS MISSING.
 *
 * The owner, on an eight-man free-for-all: *"if 2 people win 2 rounds each & a
 * third wins 1 round out of 8 people FFA then it should come down to who has
 * the most kills. if they are tied then it should be a draw & all dead."*
 *
 * What it did before was return NOBODY the moment two sides were level on
 * rounds — no tiebreak of any kind. In a duel that is nearly harmless, because
 * a best-of-3 between two men can only tie if rounds are drawn. In an eight-man
 * free-for-all it is the COMMON case: five rounds shared between eight men will
 * very often leave two of them on two apiece, and the match those sixteen
 * minutes produced would end "none" with a man who won two rounds and topped
 * the kill count standing next to a man who did neither.
 *
 * So the order is rounds, then kills, then an honest draw:
 *
 *   1. Most rounds won. Unchanged, and still the thing the format is about —
 *      kills never overturn a man who simply won more rounds.
 *   2. Level on rounds: most KILLS across the whole match. Not the last round's
 *      kills and not damage — the owner asked for kills, kills are what the
 *      kill feed has been showing all match, and a player can count them.
 *   3. Level on both: a draw, and nobody is the victor.
 *
 * Those three lines are now `rankEntrants` above, and this function READS it
 * rather than restating it. It used to hold the only copy, which is how the rule
 * came to decide one thing (the victor) while the table, the podium and the
 * purse were decided by kills alone.
 *
 * A pure function of a tally rather than a method on a room, because the cases
 * that matter are the rare ones — three-way ties, a man who won a round and
 * quit, a match where every round was drawn — and they are unreachable by
 * playing a match but trivial to enumerate against this.
 *
 * `entrants` is every side still able to win, with the kills it carries; in a
 * war band that is the band's kills summed, because a war band ranks bands.
 *
 * Returns `{ key, by }` rather than a bare key, and the reason is not
 * bookkeeping: a match decided on KILLS looks identical on the summary to one
 * decided on rounds, so a player who has just lost a match he was level on has
 * no way to learn why. `by` is what lets the screen say it. "rounds" | "kills" |
 * "draw".
 */
export function decideMatch({ roundWins = {}, entrants = [] }) {
  const rows = rankEntrants({ roundWins, entrants });
  if (rows.length === 0) return { key: null, by: "draw" };
  const top = rows[0];
  // NOBODY WON A ROUND AT ALL — every round was a mutual wipe. That is a draw,
  // and the kill count does NOT get to break it.
  //
  // The first cut of this did let it: "men still fought, and one of them may
  // well have fought best." It was an extrapolation of the owner's rule rather
  // than the rule, and summaryflow caught what it cost — a 2v2 war band whose
  // only round ended with both sides down now had a winning side, so the stage
  // stood a band up over a match nobody had won. The ask was about ties BETWEEN
  // ROUND WINNERS; a match with no round winner is not that, and inventing a
  // victor for it changes what the format means.
  //
  // This is also the ONE point where the verdict and the placement part company,
  // and deliberately. `rankEntrants` still orders a roundless match by kills,
  // because the table has to print SOMETHING and "who killed most" is the honest
  // answer to "who is top of this list". Being top of a table nobody won is not
  // winning, so the verdict below still says draw and nobody is stood up.
  if (top.rounds === 0) return { key: null, by: "draw" };
  // Level on rounds AND on kills — competition ranking gives every man in that
  // knot place 1. A draw, and it is reported as one: the wire says winnerKind
  // "none" and the stage stands nobody up.
  if (rows.filter((r) => r.place === 1).length > 1) return { key: null, by: "draw" };
  // Alone at the top. `by` is whether the rounds column settled it outright or
  // whether it took the kills to separate him from the men level with him.
  const levelOnRounds = rows.filter((r) => r.rounds === top.rounds).length > 1;
  return { key: top.key, by: levelOnRounds ? "kills" : "rounds" };
}

// ---- what a place on the table is worth ----
//
// The owner asked for rounds won to "take into account for ranking & payout".
// The obvious reading — pay a man per round he won — is the one thing
// `docs/ROUNDS-AND-SPAWNS.md` forbids in as many words: *"Do not pay out per
// round; a best-of-5 would then be worth five times a best-of-1 for the same
// wall-clock and the economy would tilt toward whoever picks the longest
// format."* So the rounds are paid THROUGH THE PLACE they bought. A place is
// worth the same in a best-of-1 and a best-of-5, and it is the number the
// rounds decide, so the pay reads the ranking without the format leaking into
// the economy.
//
// Index 0 is first. First place is 50 g / 100 xp because that is EXACTLY what
// the victor's bonus has always been — a won match pays what it has always
// paid, and nothing here is a re-balance smuggled in behind a bug fix. What is
// new is that second and third are no longer worth precisely nothing, and that
// a man who tops a table nobody won is no longer paid as if he had come last.
const PLACE_GOLD = [50, 20, 10];
const PLACE_XP = [100, 40, 20];

/**
 * The ledger a finished match broadcasts: every man's row, IN PLACEMENT ORDER,
 * with the place, the rounds his side won, and the pay that placement bought.
 *
 * Pulled out of `endMatch` as a pure function of a tally because the cases that
 * decide it are the ones a played match will not hand you on demand — two men
 * finishing level on kills a round apart is the owner's report and it is not
 * something `summaryflow` can arrange. `tools/tiebreak.mjs` states them
 * directly against this. It was RED 5/16 on the build this replaced.
 *
 * `score` IS THE RANK KEY NOW, and that is a deliberate widening of a field
 * that was never anything else. Nothing on any screen prints it; its only
 * readers are three `sort((a,b) => b.score - a.score)` calls — this file's own
 * ledger, `render/summary.ts` choosing who stands on the podium, and
 * `summaryflow` checking that those two agree. Leaving it as kills x 100 while
 * sorting the rows by place would have made the picture and the numbers name
 * different men, which is the exact fault `render/summary.ts` documents itself
 * as existing to prevent. So the key carries the rule instead: rounds outrank
 * kills by a factor no kill count reaches, and every consumer that sorts by it
 * — including ones written before this change — lands on the same order.
 */
const ROUND_RANK_STEP = 1e6;   // 10,000 kills to buy one round. Nobody gets there.

export function buildLedger({ roundWins = {}, players = [], teamMode = false }) {
  // The entity the match ranks: a man in a free-for-all, a BAND in a war band,
  // because a war band ranks bands and not men.
  const keyOf = (p) => (teamMode ? p.team : p.id);
  const tally = new Map();
  for (const p of players) {
    const key = keyOf(p);
    if (!key || key === "none") continue;
    tally.set(key, (tally.get(key) || 0) + (p.kills || 0));
  }
  for (const key of Object.keys(roundWins)) if (!tally.has(key)) tally.set(key, 0);
  const entrants = [...tally].map(([key, kills]) => ({ key, kills }));
  const order = rankEntrants({ roundWins, entrants });
  const { key: winnerKey, by: winnerBy } = decideMatch({ roundWins, entrants });
  const seats = new Map(order.map((r) => [r.key, r]));
  // A man with no seat has no side — he cannot have won a round or a place, so
  // he sits below everyone who could and is paid for his own hands only.
  const unseated = { place: order.length + 1, rounds: 0 };
  // A CONSEQUENCE WORTH KNOWING ABOUT: `rankEntrants` seats everyone who won a
  // round, including men who have since left, because `decideMatch` refuses to
  // deny a man a match he won by disconnecting after winning it. So a table can
  // legitimately open at #2 — the #1 is a man who is no longer in the room. That
  // is the honest reading and it is deliberately not papered over by renumbering
  // the survivors: doing so would hand somebody a first place he did not take.

  const results = players.map((p) => {
    const seat = seats.get(keyOf(p)) || unseated;
    const victor = !!winnerKey && (teamMode ? p.team === winnerKey : p.id === winnerKey);
    const purseXp = PLACE_XP[seat.place - 1] || 0;
    const purseGold = PLACE_GOLD[seat.place - 1] || 0;
    const xp = 50 + p.kills * 30 + p.damage * 0.5 + purseXp;
    const gold = 10 + p.kills * 15 + purseGold;
    return {
      id: p.id, name: p.name, kills: p.kills, deaths: p.deaths, damage: p.damage,
      // Rounds his SIDE won. In a free-for-all that is his own; in a war band it
      // is the band's, and every man on the band carries it — which is the same
      // answer `place` gives, and they must not be able to disagree.
      roundsWon: seat.rounds,
      place: seat.place,
      score: seat.rounds * ROUND_RANK_STEP + p.kills * 100,
      isWinner: victor,
      xpEarned: Math.floor(xp), goldEarned: Math.floor(gold),
    };
  });
  // SORTED HERE, once, on the server. It used to leave in the room's join order
  // and let each screen sort its own copy — page.tsx by score for the ledger,
  // render/summary.ts by score for the podium — which is two chances to disagree
  // about who won and no authority to settle it.
  results.sort((a, b) => b.score - a.score);
  return { results, order, winnerKey, winnerBy };
}

/**
 * Seconds a whole swing takes for this class, heavy or light.
 *
 * This line was stranded three functions up the file, sitting above the
 * tiebreak's header where it read as a description of `decideMatch`. Moved back
 * onto the function it describes: a comment attached to the wrong code is the
 * same defect as a comment asserting the wrong value.
 */
export function swingDurationOf(warriorClass, isHeavy) {
  const stats = WARRIOR_STATS[warriorClass] ?? WARRIOR_STATS.huscarl;
  return stats.attackSpeed * (isHeavy ? HEAVY_SWING_SCALE : 1);
}

const ROOM_NAMES = ["WESSEX", "MERCIA", "ESSEX", "KENT", "SUSSEX", "ANGLIA", "NORTHUMBRIA", "JORVIK", "LINDSEY", "BERNICIA", "DEIRA", "HWICCE"];
const BOT_NAMES = ["Ealdred", "Wulfred", "Aelric", "Beorn", "Cynric", "Eadwig", "Grim", "Hardred", "Leofric", "Osric", "Uhtred", "Deor"];
const BOT_CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const BOT_APPEARANCES = [
  { helm: "iron", hairStyle: "short", hairColor: 0x6b4a2a, beardStyle: "short", beardColor: 0x6b4a2a, cloak: "brown", armorColor: 0x4a5568, warPaint: "none" },
  { helm: "nasal", hairStyle: "long", hairColor: 0xb8a14e, beardStyle: "full", beardColor: 0xb8a14e, cloak: "red", armorColor: 0x2a2f38, warPaint: "stripes" },
  { helm: "none", hairStyle: "braids", hairColor: 0x8a3b22, beardStyle: "braided", beardColor: 0x8a3b22, cloak: "brown", armorColor: 0x7a2f2a, warPaint: "half" },
  { helm: "iron", hairStyle: "shaved", hairColor: 0x1c1712, beardStyle: "forked", beardColor: 0x1c1712, cloak: "blue", armorColor: 0x8a6a3a, warPaint: "cross" },
];

// ---- the ground under a spawn ----
// The interior of `groundHeight` in `world.ts`, copied. Not imported, because
// that module is the renderer's and pulls three.js in with it, and the server
// cannot take a browser dependency to find out how high a patch of turf is.
//
// Copied to the term rather than approximated: the noise, the octave rotation
// and the worn tracks are the ones the terrain mesh is built from, so a warrior
// is placed on the surface a client actually draws instead of near it. What is
// deliberately NOT copied is the bank-and-ditch beyond the palisade (spawns
// never leave the interior, which SPAWN_MAX_RADIUS guarantees) and the puddle
// basins, which need the whole puddle table for at most 30 mm of dip.
//
// The interior is flat to within ~5 cm by design — `world.ts` says so, and says
// it is flat *because* the server plants boots at y = 0 — so this is a small
// number by construction. Re-copy it if that field is re-cut; nothing fails
// loudly when it drifts, a spawned man just stands a centimetre off the turf.
const GATE_ANGLES = [0.42, 2.55, 4.55];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function hash2(ix, iy) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

function fbm(x, y, octaves) {
  let sum = 0, amp = 0.5, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(fx, fy) * amp;
    norm += amp;
    amp *= 0.5;
    const nx = fx * 1.97 + fy * 0.42;
    const ny = fy * 1.97 - fx * 0.42;
    fx = nx + 31.7; fy = ny - 17.3;
  }
  return sum / norm;
}

/** 0..1 where the turf has been walked off — the tracks sit a little lower. */
function pathMask(x, z, r) {
  if (r > 31) return 0;
  const th = Math.atan2(z, x);
  let m = 0;
  for (const g of GATE_ANGLES) {
    const target = g + Math.sin(r * 0.26 + g * 3.1) * 0.1;
    let d = th - target;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const lateral = Math.abs(d) * Math.max(r, 1.2);
    const width = 0.95 + r * 0.06;
    m = Math.max(m, 1 - smoothstep(width * 0.35, width, lateral));
  }
  m = Math.max(m, 0.8 * Math.exp(-(((r - 10.8) / 2.6) ** 2)));
  m = Math.max(m, 1 - smoothstep(2.2, 5.6, r));
  return m * (1 - smoothstep(24, 31, r));
}

/** Ground height under a world-space point, inside the palisade. */
export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = (fbm(x * 0.085 + 17.3, z * 0.085 - 5.1, 3) - 0.5) * 0.062;
  h -= pathMask(x, z, r) * 0.024;
  return h;
}

// ---- spawn placement ----
/**
 * The ring men start on, solved from the headcount so that neighbours are
 * SPAWN_GAP apart along the chord. Two men come in at the floor and eight at
 * 9.8 m, against the flat 9 that used to stand a duel 18 m apart and crowd a
 * moot of eight into 6.9 m of arc.
 */
function spawnRadius(count) {
  const n = Math.max(2, count);
  const solved = SPAWN_GAP / (2 * Math.sin(Math.PI / n));
  return Math.max(SPAWN_MIN_RADIUS, Math.min(SPAWN_MAX_RADIUS, solved));
}

/** One man's place: on the ring, on the ground, looking at what he came to fight. */
function spawnPoint(angle, radius, faceX, faceZ) {
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  return { x, y: groundHeight(x, z), z, rotation: Math.atan2(faceX - x, faceZ - z) };
}

/**
 * Spawn points for one round.
 *
 * One group is a free-for-all: an even ring, every man facing the fire. Two or
 * more are sides, each on its own arc facing the enemy's — which is the whole
 * point of a war band and the thing spawning by index around one circle could
 * never give it. The arc widens with the side's size up to TEAM_ARC, so four
 * men are a line rather than a huddle and a lone man is not one.
 *
 * The ring turns by ROUND_SPIN per round, so a best-of-5 opens five ways.
 *
 * @param {number[]} sizes headcount per side, in the caller's own order
 * @returns {Array<Array<{x:number,y:number,z:number,rotation:number}>>}
 */
function spawnLayout(sizes, roundIndex) {
  const total = sizes.reduce((a, b) => a + b, 0);
  const radius = spawnRadius(total);
  const spin = (roundIndex - 1) * ROUND_SPIN;
  if (sizes.length < 2) {
    const n = Math.max(1, total);
    return [Array.from({ length: total }, (_, i) => spawnPoint(spin + (i / n) * Math.PI * 2, radius, 0, 0))];
  }
  return sizes.map((n, side) => {
    const base = spin + (side / sizes.length) * Math.PI * 2;
    const enemy = base + Math.PI;
    const ex = Math.cos(enemy) * radius, ez = Math.sin(enemy) * radius;
    // Shoulder to shoulder at TEAM_LINE_GAP, unless that many men would wrap the
    // side further than TEAM_ARC — then the line closes up rather than curling.
    const step = n > 1
      ? Math.min(2 * Math.asin(Math.min(1, TEAM_LINE_GAP / (2 * radius))), TEAM_ARC / (n - 1))
      : 0;
    return Array.from({ length: n }, (_, i) => spawnPoint(base + (i - (n - 1) / 2) * step, radius, ex, ez));
  });
}

/**
 * One simulation. Independent of every other one in the process: everything a
 * match is made of — the rooms, the sessions, the clock, every deadline — lives
 * in this closure and nothing of it is shared. Call it twice and you have two
 * arenas that cannot reach each other.
 *
 * `docs/PLATFORM-PATH.md` §2 asks for three things this signature is what buys:
 * a host that owns the frame loop (a console client, a Steam listen server), a
 * replay that runs a whole match in milliseconds, and more than one engine in a
 * process (a room orchestrator). All three come down to the same demand — the
 * sim must not own its own clock.
 *
 * @param {{ autoTick?: boolean, epoch?: number }} [options]
 *
 *   `autoTick` — true by default, and the default is what `custom-server.mjs`
 *   and `dev-server.mjs` get: the same 20 Hz `setInterval` this engine has
 *   always started, unchanged. Pass false and the engine has no timer of any
 *   kind; time arrives only through `step(dt)`.
 *
 *   `epoch` — the wall-clock millisecond that sim time 0 stands for. It is read
 *   by nothing that decides anything. Its whole job is the two epoch-ms fields
 *   the wire carries for a client's OWN display clock (`nextRoundAt` and the
 *   kill feed's `timestamp`, see WIRE-PROTOCOL §9.6), which have to stay
 *   comparable against the browser's `Date.now()`. Pin it and even those repeat.
 */
export function makeEngine(options = {}) {
  const autoTick = options.autoTick !== false;
  const rooms = new Map();          // code -> room
  const sessions = new Map();       // sid -> { sender, roomCode, playerId|null }
  const TICK_MS = 1000 / TICK_RATE;
  const TICK_DT = 1 / TICK_RATE;

  // ---- the clock, and it is the sim's only one ----
  // SIM TIME: milliseconds this simulation has actually been advanced. It moves
  // by whole TICK_MS and by nothing else, so it is exact (50 is exact in binary
  // and 1000/20 is 50), monotonic, and identical between two runs of the same
  // script. EVERY deadline the sim owns is measured against it: the countdown,
  // the round break, the summary rollback, an input's lapse, an emote's
  // throttle. None of them may read a wall clock, because a wall clock is what
  // makes a match take a real minute to test and makes two replays disagree.
  let simMs = 0;
  // Sim time owed but not yet worth a whole step. Carried rather than dropped,
  // so a run of ragged 63 ms wakes averages out exactly instead of losing 13 ms
  // a time.
  let arrearsMs = 0;
  // WALL TIME, and neither of these is a clock the simulation reads.
  // `wakeAt` is `performance.now()` at the last wake and belongs to the
  // optional internal timer alone — it is how that timer works out how much sim
  // time the box owes. An engine built with `autoTick: false` never touches it.
  let wakeAt = 0;
  // `epoch` stamps the two display fields described above and nothing else.
  //
  // NOT A CONST, AND THE REASON IS A REGRESSION THIS FILE SHIPPED WITH.
  // `wallNow()` is `epoch + simMs`, and `simMs` is what the sim actually ran —
  // which is NOT what the wall did, because `advance` clamps arrears at
  // `MAX_CATCHUP_MS`. Every event-loop stall past 400 ms therefore threw
  // `stall - 400` ms out of `simMs` and never put it back, so on a long-lived
  // server `wallNow()` fell permanently and unboundedly behind the browsers
  // comparing against it. Measured before the fix: ten 600 ms stalls cost
  // 2252 ms, four 1500 ms stalls cost 4655 ms, linear and cumulative.
  //
  // What that breaks is visible and specific. `page.tsx` computes the round
  // break's countdown as `nextRoundAt - Date.now()`, so the counter ran early
  // by the accumulated lag, and once the lag passed the five-second break it
  // opened at 0 and the break sat there looking hung — which is the exact
  // opposite of the promise that component exists to make.
  //
  // The engine this replaced never had the bug because it re-anchored to the
  // wall on every cap and stamped both fields from `Date.now()` directly.
  // Deriving them from sim time is still right — it is what lets a replay
  // repeat them — so the dropped milliseconds are added to the EPOCH instead,
  // in the one place they are dropped. See `advance`.
  let epoch = Number.isFinite(options.epoch) ? options.epoch : Date.now();
  /** Wall-clock ms for the wire, derived from sim time so a replay repeats it. */
  const wallNow = () => epoch + simMs;
  /** The phases in which a room is stepped at all. */
  const isFightState = (room) =>
    room.state === "fighting" || room.state === "last_stand" || room.state === "heartbeat";

  function generateCode() {
    const name = ROOM_NAMES[(Math.random() * ROOM_NAMES.length) | 0];
    const num = ((Math.random() * 90) | 0) + 10;
    return `${name}${num}`;
  }

  // Anything a client sends can be a lie or a NaN; a NaN in a position is
  // permanent, so intent is scrubbed on the way in.
  const finite = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  function createPlayer(id, name, warriorClass, appearance) {
    const stats = WARRIOR_STATS[warriorClass];
    return {
      id, name, warriorClass, team: "none", ready: false,
      appearance: appearance || null,
      position: { x: 0, y: 0, z: 0 }, rotation: 0, velocity: { x: 0, y: 0, z: 0 },
      // Steering and bursts are integrated apart (see gameTick) and summed
      // into `velocity`, which stays the honest total the client draws.
      moveVel: { x: 0, z: 0 }, impulse: { x: 0, z: 0 },
      latestInput: null, inputAt: 0,
      health: stats.maxHealth, maxHealth: stats.maxHealth,
      stamina: stats.staminaMax, maxStamina: stats.staminaMax,
      state: "idle", attackDir: "right", blockDir: "right",
      attackTimer: 0, blockTimer: 0, dodgeTimer: 0, staggerTimer: 0,
      // The swing, on the wire. `attackTimer` is still the whole stroke's clock;
      // these say where in it he is, so a client animates the phases instead of
      // guessing them from a single countdown. Null/0 whenever he is not swinging.
      attackPhase: null, attackPhaseT: 0, swingT: 0, swingDuration: 0, swingHeavy: false,
      // Seconds of freeze left. Both fighters carry it after a landed blow.
      hitstop: 0,
      // The shove's own clock, on the wire so a late joiner can phase it.
      // Meaningful only while state === "shoving".
      shoveTimer: 0,
      // Server scratch, never serialised: the yaw the client last ASKED for,
      // the blow this swing will deliver when it reaches contact, and the
      // shove's pending contact and press-to-press cooldown.
      aimYaw: 0, pendingSwing: null, shovePending: false, shoveCooldown: 0,
      // The flourish he last performed, kept so the summary can pose him with
      // it. `emoteUntil` is the private throttle clock (epoch ms).
      emote: null, emoteUntil: 0,
      abilityCooldown: 0, abilityActive: false, abilityTimer: 0,
      kills: 0, deaths: 0, damage: 0, score: 0, lastHitBy: "", lastHitAt: -999,
      comboCount: 0, comboTimer: 0, invincible: false, invincibleTimer: 0,
      deadAt: 0,
      // Alight. `burning` is the whole of what a renderer needs to decide whether
      // to put flames on this man; `burnTimer` is how much of the afterburn is
      // left, so they can thin out rather than snap off; `burnInside` says he is
      // stood in the flames right now, which is a hotter thing to draw than a man
      // fleeing them with his cloak up.
      burning: false, burnTimer: 0, burnInside: false,
      // How this warrior last died, for whoever has to draw the corpse. Null on a
      // living body, and cleared on every road back to standing — a warrior who
      // respawns with a zone still on him is a warrior the client rebuilds with
      // an arm missing.
      deathZone: null, deathDir: null, deathHeavy: false, deathCause: null,
    };
  }

  // Everything the last fight left on a body and the next one must not inherit.
  // Every road back to standing comes through here — the round start, the lobby
  // reset at the end of a match, the solo respawn — so a fourth cannot quietly
  // miss half of it. A warrior must not come back one-armed, and he must not
  // come back on fire.
  const clearBodyMarks = (p) => {
    p.deathZone = null; p.deathDir = null; p.deathHeavy = false; p.deathCause = null;
    p.burning = false; p.burnTimer = 0; p.burnInside = false;
    // Nor mid-stroke, nor frozen in one. A warrior who came back carrying a
    // pending blow would deliver it out of a spawn, at whoever was nearest.
    p.hitstop = 0; p.attackPhase = null; p.attackPhaseT = 0;
    p.swingT = 0; p.swingDuration = 0; p.swingHeavy = false; p.pendingSwing = null;
    // Nor mid-shove, for the same reason the pending blow goes.
    p.shoveTimer = 0; p.shovePending = false; p.shoveCooldown = 0;
  };

  const isTeamMode = (room) => room.mode === "war_band";

  /**
   * Stand everyone up for a round. War band spawns by side; everything else
   * spawns as a ring. A war band man who never picked a colour is given the
   * shorter side here rather than left on "none" — the sim scores a round by
   * team and friendly fire is decided by team, so a man on no side is a bug
   * however he got there.
   */
  function placeForRound(room, roundIndex) {
    const fighters = [...room.players.values()];
    if (!isTeamMode(room)) {
      const [ring] = spawnLayout([fighters.length], roundIndex);
      fighters.forEach((p, i) => setSpawn(p, ring[i]));
      return;
    }
    const sides = { red: [], blue: [] };
    for (const p of fighters) {
      if (p.team !== "red" && p.team !== "blue") p.team = sides.red.length <= sides.blue.length ? "red" : "blue";
      sides[p.team].push(p);
    }
    const [red, blue] = spawnLayout([sides.red.length, sides.blue.length], roundIndex);
    sides.red.forEach((p, i) => setSpawn(p, red[i]));
    sides.blue.forEach((p, i) => setSpawn(p, blue[i]));
  }

  function setSpawn(player, point) {
    player.position = { x: point.x, y: point.y, z: point.z };
    player.rotation = point.rotation;
    if (player.bot) { player.yaw = point.rotation; player.nextThink = 0; player.nextAttackAt = 0; }
  }

  /**
   * Where a solo trainee comes back. The old path picked one of eight fixed
   * points at random, which is how a respawn dropped a player inside the bot
   * that had just killed him. Same eight candidates, chosen instead of drawn:
   * the one furthest from the nearest living enemy, so coming back is worth
   * something and the ring still varies as the fight moves around it.
   */
  function safestSpawn(room, player) {
    const radius = spawnRadius(room.players.size);
    const spin = (player.deaths % 8) * ROUND_SPIN;
    let best = null, bestClearance = -1;
    for (let i = 0; i < 8; i++) {
      const point = spawnPoint(spin + (i / 8) * Math.PI * 2, radius, 0, 0);
      let clearance = Infinity;
      room.players.forEach((other) => {
        if (other.id === player.id || other.state === "dead") return;
        if (isTeamMode(room) && other.team === player.team && other.team !== "none") return;
        clearance = Math.min(clearance, Math.hypot(other.position.x - point.x, other.position.z - point.z));
      });
      if (clearance > bestClearance) { bestClearance = clearance; best = point; }
    }
    return best;
  }

  function sendSession(sid, msg) {
    const s = sessions.get(sid);
    if (s && s.sender) { try { s.sender(JSON.stringify(msg)); } catch { /* closed */ } }
  }

  function broadcast(room, msg, excludePlayerId) {
    const str = JSON.stringify(msg);
    room.players.forEach((p) => {
      if (p.id === excludePlayerId || p.id.startsWith("bot_")) return;
      sessions.forEach((s) => {
        if (s.playerId === p.id && s.sender) { try { s.sender(str); } catch { /* closed */ } }
      });
    });
  }

  // Simulation scratch: needed every tick, meaningless off the server, and
  // twenty times a second of wire it does not deserve.
  const PRIVATE_FIELDS = ["moveVel", "impulse", "latestInput", "inputAt", "lastHitAt",
    "aiSkill", "nextThink", "nextAttackAt", "strafePhase", "blockUntil", "isBlocking", "yaw", "baseName",
    "aimYaw", "pendingSwing", "shovePending", "shoveCooldown", "emoteUntil"];

  function serializeRoom(room) {
    const players = {};
    room.players.forEach((p, id) => {
      const pub = { ...p };
      for (const f of PRIVATE_FIELDS) delete pub[f];
      players[id] = pub;
    });
    return {
      code: room.code, mode: room.mode, state: room.state, arena: room.arena,
      players, hostId: room.hostId, countdown: room.countdown, matchTimer: room.matchTimer,
      maxPlayers: room.maxPlayers, killFeed: room.killFeed.slice(-10), lastStandTriggered: room.lastStandTriggered,
      // Room setup, so a lobby screen can render what it is about to start.
      difficulty: room.difficulty || null, botCount: botsIn(room), maxBots: botCapacity(room),
      autoStart: !!room.autoStart,
      // The round state, carried on every snapshot and not only on the message
      // that changed it — same requirement `deathZone` had. A late joiner, a
      // spectator or a reconnect rebuilds the scoreboard from this alone.
      bestOf: room.bestOf || 1,
      roundIndex: room.roundIndex || 0,
      roundTarget: roundsToWin(room),
      // Keyed by player id in a free-for-all and by "red"/"blue" in a war band;
      // `roundScoreBy` says which, so the HUD never has to guess from the mode.
      roundWins: { ...(room.roundWins || {}) },
      roundScoreBy: isTeamMode(room) ? "team" : "player",
      lastRound: room.lastRound || null,
      nextRoundAt: room.nextRoundAt || 0,
    };
  }

  /** Round wins that take the match. First to this, so a best-of-3 can end 2-0. */
  const roundsToWin = (room) => Math.ceil((room.bestOf || 1) / 2);

  const normalizeBestOf = (value, fallback) => {
    const n = Math.round(finite(value));
    if (ROUND_OPTIONS.includes(n)) return n;
    return ROUND_OPTIONS.includes(fallback) ? fallback : DEFAULT_BEST_OF;
  };

  /** Who a round-win key belongs to, for a scoreboard that shows names. */
  function keyName(room, key) {
    if (!key) return "Draw";
    if (isTeamMode(room)) return key === "red" ? "Red War Band" : "Blue War Band";
    const p = room.players.get(key);
    return p ? p.name : "Draw";
  }

  // `roundLeader` stood here: it summed the room into entrants and asked
  // `decideMatch` for the one man who took the match, and nothing else in the
  // building ever saw the ordering that answer came out of. That is why the
  // table, the podium and the purse were all still reading kills. The summing is
  // now inside `buildLedger`, which returns the WHOLE field in order and the
  // verdict from the same pass — one tally, one rule, one answer.

  const sendLobbyUpdate = (room) => broadcast(room, { type: "lobby_update", data: serializeRoom(room) });

  function humanCount(room) {
    let n = 0;
    room.players.forEach((p) => { if (!p.id.startsWith("bot_")) n++; });
    return n;
  }

  function botsIn(room) {
    let n = 0;
    room.players.forEach((p) => { if (p.bot) n++; });
    return n;
  }

  // A solo room stays sealed to other humans (maxPlayers 1) yet still holds a
  // full ring of sparring partners.
  function botCapacity(room) {
    return room.mode === "solo" ? SOLO_MAX_BOTS : Math.max(0, room.maxPlayers - humanCount(room));
  }

  const normalizeDifficulty = (value, fallback) =>
    (DIFFICULTIES.includes(value) ? value : (DIFFICULTIES.includes(fallback) ? fallback : "warrior"));

  // ---------------- message routing ----------------
  function routeMessage(sid, msg) {
    const type = msg.type;
    const data = msg.data || {};
    switch (type) {
      case "create": return handleCreate(sid, data);
      case "join": return handleJoin(sid, data);
      case "solo": return handleSolo(sid, data);
      // Both of these were reachable AT ANY TIME, and both were exploits.
      //
      // `select_class` re-rolls health and stamina to the class maximum. With no
      // state guard that is an unlimited self-heal: send it mid-swing and walk
      // away from a fight you had lost. Measured before the guard: 84.8/120 ->
      // 146.7/150 from one message.
      //
      // `select_team` wrote `data.team` unchecked — any string, any time. A team
      // nobody else is on turns off friendly fire in `applyDamage` (which tests
      // `attacker.team === target.team`) and breaks `checkRoundEnd`, which counts
      // only "red" and "blue" and so can never resolve a round.
      //
      // The shape is the one this project keeps meeting: a message that is
      // harmless in the state it was written for, and never asked which state it
      // is in. The economy is cheat-tested; the MATCH was not.
      case "select_class": return withRoom(sid, (room, player) => {
        if (!WARRIOR_STATS[data.warriorClass]) return;
        if (!KIT_STATES.has(room.state)) return;
        player.warriorClass = data.warriorClass;
        const stats = WARRIOR_STATS[data.warriorClass];
        player.maxHealth = stats.maxHealth; player.health = stats.maxHealth;
        player.maxStamina = stats.staminaMax; player.stamina = stats.staminaMax;
        sendLobbyUpdate(room);
      });
      case "select_team": return withRoom(sid, (room, player) => {
        if (!TEAMS.has(data.team)) return;
        if (!KIT_STATES.has(room.state)) return;
        player.team = data.team;
        sendLobbyUpdate(room);
      });
      case "ready": return withRoom(sid, (room, player) => { player.ready = !player.ready; sendLobbyUpdate(room); });
      case "add_bot": return withRoom(sid, (room, player) => {
        if (room.hostId !== player.id) return;
        const diff = normalizeDifficulty(data.difficulty, room.difficulty);
        if (botsIn(room) >= botCapacity(room)) return;
        room.difficulty = room.difficulty || diff;
        addBot(room, botsIn(room), diff);
        sendLobbyUpdate(room);
      });
      case "remove_bot": return withRoom(sid, (room, player) => {
        if (room.hostId !== player.id) return;
        if (removeBot(room, typeof data.botId === "string" ? data.botId : null)) sendLobbyUpdate(room);
      });
      // Size the whole roster in one message — what a setup screen's stepper wants.
      case "set_bots": return withRoom(sid, (room, player) => {
        if (room.hostId !== player.id || room.state !== "lobby") return;
        const diff = normalizeDifficulty(data.difficulty, room.difficulty);
        room.difficulty = diff;
        room.players.forEach((p) => { if (p.bot) retuneBot(p, diff); });
        const asked = data.count === undefined ? botsIn(room) : Math.round(finite(data.count));
        const want = Math.max(0, Math.min(botCapacity(room), asked));
        while (botsIn(room) > want) removeBot(room, null);
        while (botsIn(room) < want) addBot(room, botsIn(room), diff);
        sendLobbyUpdate(room);
      });
      // Best of 1, 3 or 5. The host's, and only in the lobby: changing the
      // format mid-match would rewrite what the men already fought for.
      case "set_rounds": return withRoom(sid, (room, player) => {
        if (room.hostId !== player.id || room.state !== "lobby" || room.mode === "solo") return;
        room.bestOf = normalizeBestOf(data.bestOf, room.bestOf);
        sendLobbyUpdate(room);
      });
      case "start": return withRoom(sid, (room, player) => {
        if (room.hostId !== player.id || room.state !== "lobby") return;
        // A trial may be a lonely one; a shared room still needs an opponent.
        if (room.mode !== "solo" && room.players.size < 2) {
          return sendSession(sid, { type: "error", data: { message: "Summon a friend, or press ADD AI below your war code." } });
        }
        startMatch(room);
      });
      case "set_appearance": return withRoom(sid, (room, player) => { player.appearance = data.appearance || null; sendLobbyUpdate(room); });
      case "input": return withRoom(sid, (room, player) => {
        if (room.state !== "fighting" && room.state !== "last_stand") return;
        if (player.state === "dead") return;
        // Standing intent for the tick to act on; actions fire here and now.
        player.latestInput = data;
        // Stamped in SIM ms, because the thing that reads it — `currentIntent`,
        // which lapses a standing intent after INPUT_LAPSE_MS — is a rule, and
        // a rule may not be decided by a clock the simulation does not own. On
        // the live server this reads within one tick of what `Date.now()` gave;
        // under a host driving the sim it is the difference between an intent
        // that lapses and an intent that never does.
        player.inputAt = simMs;
        processInput(room, player, data);
      });
      // A victory flourish, relayed rather than trusted: the server validates
      // and throttles, then everyone in the room hears the one broadcast.
      case "emote": return withRoom(sid, (room, player) => handleEmote(room, player, data));
      case "leave": return disconnectSession(sid);
      case "ping": return sendSession(sid, { type: "pong" });
    }
  }

  function withRoom(sid, fn) {
    const s = sessions.get(sid);
    if (!s || !s.roomCode || !s.playerId) return;
    const room = rooms.get(s.roomCode);
    if (!room) return;
    const player = room.players.get(s.playerId);
    if (!player) return;
    fn(room, player);
  }

  function leaveRoomForSession(s) {
    if (!s.roomCode || !s.playerId) return;
    const room = rooms.get(s.roomCode);
    if (room) {
      room.players.delete(s.playerId);
      broadcast(room, { type: "player_left", data: { playerId: s.playerId } });
      if (humanCount(room) === 0) {
        rooms.delete(room.code);
      } else {
        if (room.hostId === s.playerId) {
          for (const [pid] of room.players) { if (!pid.startsWith("bot_")) { room.hostId = pid; break; } }
        }
        sendLobbyUpdate(room);
      }
    }
    s.roomCode = null; s.playerId = null;
  }

  function handleCreate(sid, data) {
    const s = sessions.get(sid);
    if (!s) return;
    leaveRoomForSession(s);
    const name = String(data.name || "Warrior").substring(0, 20);
    const mode = data.mode || "blood_moot";
    let code = generateCode();
    while (rooms.has(code)) code = generateCode();

    const room = {
      code, mode, state: "lobby", arena: "saxon_village",
      players: new Map(), hostId: null, countdown: 0, matchTimer: 0,
      maxPlayers: mode === "honour_duel" ? 2 : 8, killFeed: [], lastStandTriggered: false,
      bestOf: normalizeBestOf(data.bestOf, DEFAULT_BEST_OF),
      roundIndex: 0, roundWins: {}, lastRound: null, nextRoundAt: 0,
      // See the note on the solo room above: the one phase deadline a room can
      // be waiting on, in sim ms, and never on the wire.
      phaseAt: 0,
    };
    const pid = randomUUID();
    const player = createPlayer(pid, name, "warden", data.appearance || null);
    room.players.set(pid, player);
    room.hostId = pid;
    rooms.set(code, room);
    s.roomCode = code; s.playerId = pid;
    sendSession(sid, { type: "join", data: { playerId: pid, warriorStats: WARRIOR_STATS, ...serializeRoom(room) } });
  }

  function handleJoin(sid, data) {
    const s = sessions.get(sid);
    if (!s) return;
    const code = String(data.code || "").toUpperCase();
    const room = rooms.get(code);
    if (room && s.roomCode === room.code) {
      // already in this room — resend snapshot instead of duplicating
      return sendSession(sid, { type: "join", data: { playerId: s.playerId, warriorStats: WARRIOR_STATS, ...serializeRoom(room) } });
    }
    leaveRoomForSession(s);
    if (!room) return sendSession(sid, { type: "error", data: { message: "Room not found. Check your code." } });
    if (room.state !== "lobby") return sendSession(sid, { type: "error", data: { message: "Battle already in progress." } });
    if (humanCount(room) >= room.maxPlayers) return sendSession(sid, { type: "error", data: { message: "Room is full." } });

    const pid = randomUUID();
    const player = createPlayer(pid, String(data.name || "Warrior").substring(0, 20), "warden", data.appearance || null);
    room.players.set(pid, player);
    s.roomCode = code; s.playerId = pid;
    sendSession(sid, { type: "join", data: { playerId: pid, warriorStats: WARRIOR_STATS, ...serializeRoom(room) } });
    broadcast(room, { type: "player_joined", data: { playerId: pid, name: player.name } }, pid);
    sendLobbyUpdate(room);
  }

  function handleSolo(sid, data) {
    const s = sessions.get(sid);
    if (!s) return;
    leaveRoomForSession(s);
    const name = String(data.name || "Warrior").substring(0, 20);
    const difficulty = normalizeDifficulty(data.difficulty);
    // The caller sizes the trial. Omitting botCount falls back to the old
    // difficulty→count map, so the one-tap TRAINING button still works; passing
    // autoStart:false parks the room in the lobby for a setup screen.
    const requested = data.botCount === undefined ? SOLO_BOTS_BY_DIFFICULTY[difficulty] : Math.round(finite(data.botCount));
    const botCount = Math.max(0, Math.min(SOLO_MAX_BOTS, requested));
    const autoStart = data.autoStart !== false;
    let code = "SOLO" + generateCode();
    while (rooms.has(code)) code = "SOLO" + generateCode();

    const room = {
      code, mode: "solo", state: "lobby", arena: "saxon_village",
      players: new Map(), hostId: null, countdown: 0, matchTimer: 0,
      maxPlayers: 1, killFeed: [], lastStandTriggered: false,
      // Training is not a match: it has one endless round and pays nothing out.
      bestOf: 1, roundIndex: 0, roundWins: {}, lastRound: null, nextRoundAt: 0,
      // Sim-ms deadline for whatever this room's current phase is waiting on;
      // 0 is "nothing pending". Server scratch — `serializeRoom` publishes a
      // named list, so it cannot reach a client. See `advancePhase`.
      phaseAt: 0,
      difficulty, solo: true, autoStart,
    };
    const pid = randomUUID();
    const player = createPlayer(pid, name, data.warriorClass && WARRIOR_STATS[data.warriorClass] ? data.warriorClass : "warden", data.appearance || null);
    room.players.set(pid, player);
    room.hostId = pid;
    rooms.set(code, room);
    s.roomCode = code; s.playerId = pid;

    for (let i = 0; i < botCount; i++) addBot(room, i, difficulty);

    sendSession(sid, { type: "join", data: { playerId: pid, warriorStats: WARRIOR_STATS, ...serializeRoom(room) } });
    // On sim time, like every other wait: a headless host that could join a
    // trial and never be dealt one is not a host of anything.
    if (autoStart) room.phaseAt = simMs + SOLO_DEAL_DELAY * 1000;
  }

  function addBot(room, idx, difficultyOverride) {
    const id = `bot_${randomUUID().slice(0, 8)}`;
    const cls = BOT_CLASSES[idx % BOT_CLASSES.length];
    const diff = normalizeDifficulty(difficultyOverride, room.difficulty);
    const bot = createPlayer(id, "", cls, { ...BOT_APPEARANCES[idx % BOT_APPEARANCES.length] });
    bot.bot = true;
    bot.ready = true;
    bot.baseName = BOT_NAMES[(Math.random() * BOT_NAMES.length) | 0];
    bot.nextThink = 0;
    bot.nextAttackAt = 0;
    bot.yaw = 0;
    bot.strafePhase = Math.random() * Math.PI * 2;
    bot.blockUntil = -1;
    bot.isBlocking = false;
    retuneBot(bot, diff);
    room.players.set(id, bot);
  }

  // Difficulty is a dial, not a birthmark: a bot can be re-graded in the lobby
  // and keeps its name and its place in the list.
  function retuneBot(bot, difficulty) {
    bot.difficulty = difficulty;
    bot.aiSkill = BOT_SKILL[difficulty];
    bot.name = (bot.baseName || bot.name) + BOT_TITLES[difficulty];
  }

  function removeBot(room, botId) {
    if (botId) {
      const victim = room.players.get(botId);
      if (!victim || !victim.bot) return false;
      room.players.delete(botId);
      return true;
    }
    let last = null;
    room.players.forEach((p, id) => { if (p.bot) last = id; });
    if (!last) return false;
    room.players.delete(last);
    return true;
  }

  // A match is the thing that pays out and the thing a scoreboard is about; a
  // round is one fight inside it. Kills, deaths and damage are zeroed here and
  // nowhere else, so they read over the whole match however many rounds it took.
  function startMatch(room) {
    room.roundIndex = 0;
    room.roundWins = {};
    room.lastRound = null;
    room.matchTimer = 0;
    room.killFeed = [];
    if (isTeamMode(room)) { room.roundWins.red = 0; room.roundWins.blue = 0; }
    room.players.forEach((p) => {
      p.kills = 0; p.deaths = 0; p.damage = 0; p.score = 0;
      if (!isTeamMode(room) && room.mode !== "solo") room.roundWins[p.id] = 0;
    });
    startRound(room);
  }

  function startRound(room) {
    room.roundIndex = (room.roundIndex || 0) + 1;
    room.state = "countdown";
    room.countdown = MATCH_COUNTDOWN;
    room.nextRoundAt = 0;
    // Last stand is a round-level moment: two men left in THIS round. Carrying
    // it forward would mean it never fired again after the first round.
    room.lastStandTriggered = false;
    room.killFeed = [];
    placeForRound(room, room.roundIndex);
    room.players.forEach((p) => {
      p.health = p.maxHealth;
      p.stamina = p.maxStamina;
      p.state = "idle";
      // NO GRACE ARMED HERE. It used to be, and the timer it set is decremented
      // in exactly one place — `stepRoom` — which `gameTick` skips for any room
      // that is not `fighting` / `last_stand`. So two seconds armed at the top
      // of a three-second countdown did not begin burning until the countdown
      // ended, and every warrior stayed flagged untouchable for a further two
      // seconds INTO the fight. It bought the simulation nothing on the way
      // through: nothing is stepped during `countdown` and `handleAttack`
      // rejects every swing outside a fight, so there was no blow for it to
      // stop. All it did was drive the client's body strobe, which is why the
      // flashing outlived the countdown that triggered it. The grace is armed
      // in `advancePhase`, on the frame the fight starts, against the clock
      // that runs.
      p.invincible = false; p.invincibleTimer = 0;
      // Nobody walks out of the last fight into this one — nor bleeds out of it,
      // nor comes back still swinging the blow that killed him.
      p.attackTimer = 0; p.blockTimer = 0; p.dodgeTimer = 0; p.staggerTimer = 0;
      p.abilityActive = false; p.abilityTimer = 0; p.abilityCooldown = 0;
      p.comboCount = 0; p.comboTimer = 0; p.lastHitBy = ""; p.deadAt = 0;
      clearMotion(p);
      clearBodyMarks(p);
    });
    broadcast(room, { type: "countdown", data: { ...serializeRoom(room), countdown: room.countdown } });
    // ...and the beat that counts it down, on sim time. It was a `setInterval`,
    // which meant the bell rang on the box's clock rather than on the
    // simulation's and a host driving the sim itself never heard it at all.
    room.phaseAt = simMs + 1000;
  }

  // ---------------- combat ----------------
  // A burst of travel laid on top of steering. `distance` is the ground it
  // covers over its whole life — see the integration note in gameTick — so a
  // roll goes exactly as far as the class sheet says a roll goes.
  function applyImpulse(player, dirX, dirZ, distance, replace) {
    const len = Math.hypot(dirX, dirZ) || 1;
    const speed = distance / IMPULSE_TAU;
    if (replace) {
      player.impulse.x = (dirX / len) * speed;
      player.impulse.z = (dirZ / len) * speed;
    } else {
      player.impulse.x += (dirX / len) * speed;
      player.impulse.z += (dirZ / len) * speed;
    }
  }

  // Strikes, guards and rolls resolve the moment the message lands — a click
  // that waits for the next tick is a click the player believes he lost.
  // Steering is only recorded here; gameTick is what moves anybody.
  function processInput(room, player, input) {
    const stats = WARRIOR_STATS[player.warriorClass];
    // The yaw the client is asking for is always recorded. Whether the body
    // adopts it now is the whole of commitment: free, it snaps, because a
    // laggy camera is worse than a fast one; mid-swing, `advanceSwing` slews
    // toward it at SWING_TURN_RATE on the fixed step instead, so the cap does
    // not become a measurement of the message rate.
    player.aimYaw = finite(input.rotationY);
    // Frozen on contact: he is not turning, striking, guarding or rolling. The
    // aim above is still taken, so the freeze ends pointing where he asked.
    if (player.hitstop > 0) return;
    if (!isCommitted(player)) player.rotation = player.aimYaw;
    if (player.state === "staggered") return;

    // A roll used to cancel a swing, which is the whole of what made a light
    // attack weightless: you could throw one and take it back. You cannot.
    if (input.dodge && player.dodgeTimer <= 0 && player.stamina >= 20 && player.state !== "dodging" && !isCommitted(player)) {
      player.state = "dodging"; player.dodgeTimer = DODGE_COOLDOWN;
      player.stamina -= 20; player.invincible = true; player.invincibleTimer = DODGE_DURATION;
      // You roll where you lean, and away from the fight if you lean nowhere.
      // (Taking each axis' fallback separately used to send a warrior holding W
      //  rolling diagonally.)
      let dx = finite(input.moveX), dz = finite(input.moveZ);
      if (dx === 0 && dz === 0) { dx = -Math.sin(player.rotation); dz = -Math.cos(player.rotation); }
      // The roll owns the body: whatever stride you were in is spent on it.
      player.moveVel.x = 0; player.moveVel.z = 0;
      applyImpulse(player, dx, dz, stats.dodgeDistance, true);
      return;
    }

    // The shove may be thrown FROM a raised guard — it is the shield man's own
    // answer to a shield — so it is read before the block branch can re-assert
    // the guard state over it.
    if (input.shove && !isCommitted(player) && player.state !== "dodging" &&
        player.shoveCooldown <= 0 && player.attackTimer <= 0 && player.stamina >= SHOVE.stamina) {
      player.stamina -= SHOVE.stamina;
      player.state = "shoving";
      player.blockTimer = 0;
      player.shoveTimer = SHOVE.windup + SHOVE.recover;
      player.shoveCooldown = SHOVE.cooldown;
      player.shovePending = true;
      // The step INTO it, same argument as the swing lunge: weight moves
      // forward before the hands land, and the body cannot steer meanwhile.
      applyImpulse(player, Math.sin(player.rotation), Math.cos(player.rotation), 0.45, false);
      return;
    }

    if (input.block && player.state !== "attacking" && player.state !== "dodging" && player.state !== "shoving") {
      player.state = "blocking"; player.blockDir = input.attackDir;
      player.blockTimer = player.blockTimer || 0.001;
    } else if (player.state === "blocking" && !input.block) {
      player.state = "idle"; player.blockTimer = 0;
    }

    if (input.attack && player.attackTimer <= 0 && player.state !== "blocking" && player.state !== "dodging" && player.state !== "shoving" && player.stamina >= 13) {
      player.stamina -= 13;
      if (player.comboTimer > 0) player.comboCount++; else player.comboCount = 1;
      player.comboTimer = COMBO_WINDOW;
      beginSwing(player, input.attackDir, stats.attackDamage, false);
    }

    if (input.heavyAttack && player.attackTimer <= 0 && player.state !== "blocking" && player.state !== "dodging" && player.state !== "shoving" && player.stamina >= 22) {
      player.stamina -= 22;
      player.comboCount = 0; player.comboTimer = 0;
      beginSwing(player, input.attackDir, stats.heavyDamage, true);
    }

    if (input.ability && player.abilityCooldown <= 0) activateAbility(room, player);
  }

  /** Mid-stroke or mid-shove: the body is spent, and the turn cap binds. */
  const isCommitted = (player) => player.state === "attacking" || player.state === "shoving";

  /**
   * Start a stroke. Nothing is resolved here any more — the blow is parked on
   * the body and `advanceSwing` delivers it when the clock reaches contact.
   *
   * The lunge still fires at the top, and that is deliberate: it is the step
   * INTO the blow, and spending the windup travelling is what stops the longer
   * swings from being a range nerf as well as a speed one. The body cannot steer
   * while committed (see integrateMovement), so it is a step, not a chase.
   */
  function beginSwing(player, attackDir, damage, isHeavy) {
    const dur = swingDurationOf(player.warriorClass, isHeavy);
    player.state = "attacking";
    player.attackDir = attackDir;
    player.attackTimer = dur;
    player.swingDuration = dur;
    player.swingHeavy = isHeavy;
    player.swingT = 0;
    player.attackPhase = "windup";
    player.attackPhaseT = 0;
    player.pendingSwing = { damage, heavy: isHeavy };
    applyImpulse(player, Math.sin(player.rotation), Math.cos(player.rotation),
      isHeavy ? LUNGE_HEAVY : LUNGE_LIGHT, false);
  }

  /**
   * The stroke is over — finished, parried out of him, or he is dead. Clears the
   * phase off the wire and drops any blow that had not reached contact yet: a
   * stagger is the one thing that CAN cancel a swing, which is what makes a
   * parry worth the timing.
   */
  function endSwing(player) {
    player.attackPhase = null;
    player.attackPhaseT = 0;
    player.swingT = 0;
    player.swingDuration = 0;
    player.swingHeavy = false;
    player.pendingSwing = null;
  }

  /**
   * One fixed step of one swing: the clock, the phase, the hit, and the cap on
   * turning. Called for every living warrior, whether or not he is swinging,
   * because it also owns putting a finished stroke away.
   */
  function advanceSwing(room, player, dt) {
    if (player.attackTimer > 0) {
      player.attackTimer -= dt;
      if (player.attackTimer <= 0) {
        player.attackTimer = 0;
        if (player.state === "attacking") player.state = "idle";
      }
    }
    const dur = player.swingDuration;
    if (!isCommitted(player) || dur <= 0) {
      if (player.attackPhase !== null) endSwing(player);
      return;
    }

    const t = clamp01(1 - player.attackTimer / dur);
    player.swingT = t;

    // Contact. Once, on the step that crosses out of the windup — a 50 ms tick
    // quantises it, so the edge arrives within one tick of the stated fraction
    // and never twice.
    if (t >= WINDUP_END && player.pendingSwing) {
      const blow = player.pendingSwing;
      player.pendingSwing = null;
      processAttack(room, player, blow.damage, blow.heavy);
      // A parry staggers the man who threw it, mid-stroke. That is the one thing
      // that can take a swing back off him, and it is why a parry is worth the
      // timing. (Hitstop does NOT return here: the phase still has to be written
      // for the snapshot, and the freeze takes hold on the next step.)
      if (!isCommitted(player)) { endSwing(player); return; }
    }

    const phase = t < WINDUP_END ? "windup" : t < CONTACT_END ? "contact" : "recovery";
    const lo = phase === "windup" ? 0 : phase === "contact" ? WINDUP_END : CONTACT_END;
    const hi = phase === "windup" ? WINDUP_END : phase === "contact" ? CONTACT_END : 1;
    player.attackPhase = phase;
    player.attackPhaseT = clamp01((t - lo) / (hi - lo));

    // Commitment: the body turns toward the yaw the client asked for at a capped
    // rate rather than adopting it. Integrated on the fixed step, so 1.8 rad/s
    // is 1.8 rad/s at any packet rate.
    const cap = SWING_TURN_RATE * (SWING_TURN_PHASE[phase] ?? 1) * dt;
    const off = wrapPi(player.aimYaw - player.rotation);
    player.rotation = wrapPi(player.rotation + (Math.abs(off) <= cap ? off : Math.sign(off) * cap));
  }

  /**
   * One fixed step of one shove: the clock, the contact at the windup/recover
   * boundary, and the same turn cap a swing carries. A stagger — being shoved
   * yourself, or a parry landed a tick earlier — takes the state off him, and
   * the pending contact is dropped with it here, exactly as a stagger drops a
   * pending blow.
   */
  function advanceShove(room, player, dt) {
    if (player.shoveCooldown > 0) player.shoveCooldown -= dt;
    if (player.state !== "shoving") {
      if (player.shoveTimer > 0 || player.shovePending) { player.shoveTimer = 0; player.shovePending = false; }
      return;
    }
    player.shoveTimer -= dt;
    // Contact, once, on the step that crosses out of the windup.
    if (player.shovePending && player.shoveTimer <= SHOVE.recover) {
      player.shovePending = false;
      resolveShove(room, player);
    }
    if (player.shoveTimer <= 0) {
      player.shoveTimer = 0;
      player.state = "idle";
      return;
    }
    // Committed like a swing: the body slews toward the asked-for yaw under the
    // same cap, full in the windup, most of it gone once the hands are out.
    const cap = SWING_TURN_RATE * (player.shoveTimer > SHOVE.recover ? 1.0 : 0.6) * dt;
    const off = wrapPi(player.aimYaw - player.rotation);
    player.rotation = wrapPi(player.rotation + (Math.abs(off) <= cap ? off : Math.sign(off) * cap));
  }

  /**
   * The hands land. One man — the nearest in a short, narrow cone — takes an
   * impulse and a stagger and NO damage: what a shove sells is where he ends up.
   *
   * A raised shield is not consulted, which is the niche: every other answer to
   * a guard is a heavy. A dodge beats it — the roll's own i-frames cover the
   * contact — and spawn invincibility holds, because it holds against blows.
   *
   * `lastHitBy`/`lastHitAt` are set even though no damage is, so the burn
   * credit window runs: a man driven into the bonfire by these hands is this
   * shover's kill when he cooks (see burnDeath).
   */
  function resolveShove(room, attacker) {
    let best = null, bestDist = Infinity;
    room.players.forEach((target) => {
      if (target.id === attacker.id || target.state === "dead") return;
      if (room.mode === "war_band" && attacker.team === target.team && attacker.team !== "none") return;
      if (target.invincible || target.state === "dodging") return;
      const dx = target.position.x - attacker.position.x;
      const dz = target.position.z - attacker.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > SHOVE.range || dist >= bestDist) return;
      if (Math.abs(wrapPi(Math.atan2(dx, dz) - attacker.rotation)) > SHOVE.arc) return;
      best = target; bestDist = dist;
    });
    if (!best) return;

    // Pushed along the line between the two bodies, not along the aim: hands on
    // a chest send a man where the chest was going, and it is the line the
    // shover actually chose by standing where he stood.
    let nx = best.position.x - attacker.position.x;
    let nz = best.position.z - attacker.position.z;
    const len = Math.hypot(nx, nz);
    if (len > 0.001) { nx /= len; nz /= len; }
    else { nx = Math.sin(attacker.rotation); nz = Math.cos(attacker.rotation); }
    // The push owns the body the way a roll does: stride is spent on it.
    best.moveVel.x = 0; best.moveVel.z = 0;
    applyImpulse(best, nx, nz, SHOVE.push, true);
    best.state = "staggered";
    best.staggerTimer = SHOVE.stagger;
    best.blockTimer = 0;
    // The credit trail, without a wound. This is the whole reason the fire pays
    // the shover.
    best.lastHitBy = attacker.id;
    best.lastHitAt = room.matchTimer;
    applyHitstop(attacker, best, HITSTOP.light);
    broadcast(room, { type: "hit", data: { type: "shove", attackerId: attacker.id, targetId: best.id, damage: 0, hitstop: HITSTOP.light } });
  }

  function processAttack(room, attacker, baseDamage, isHeavy) {
    const comboMult = Math.min(1 + attacker.comboCount * 0.15, 1.6);
    const abilityMult = attacker.abilityActive && attacker.warriorClass === "berserker" ? 1.5 :
      attacker.abilityActive && attacker.warriorClass === "warden" ? 1.3 : 1;
    const dmg = Math.floor(baseDamage * comboMult * abilityMult);
    const range = reachOf(attacker);
    const arc = SWING_ARC[attacker.warriorClass] ?? DEFAULT_SWING_ARC;

    room.players.forEach((target) => {
      if (target.id === attacker.id || target.state === "dead") return;
      if (room.mode === "war_band" && attacker.team === target.team && attacker.team !== "none") return;
      const dx = target.position.x - attacker.position.x;
      const dz = target.position.z - attacker.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > range) return;
      const angleToTarget = Math.atan2(dx, dz);
      let angleDiff = angleToTarget - attacker.rotation;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      if (Math.abs(angleDiff) > arc) return;
      if (target.invincible) return;

      // Decided once, here, and carried through every branch below: the blocked
      // paths kill too, and a killing blow that a shield only half-stopped still
      // has to tell the client what came off.
      const hitZone = deriveHitZone(attacker, target, angleDiff, arc, isHeavy);
      const zoned = Math.floor(dmg * (ZONE_DAMAGE[hitZone] ?? 1));

      if (target.state === "blocking") {
        const blockStats = WARRIOR_STATS[target.warriorClass];
        const shieldWall = target.abilityActive && target.warriorClass === "huscarl";
        const eff = shieldWall ? 0.95 : blockStats.blockReduction;
        if (target.blockTimer > 0 && target.blockTimer < PARRY_WINDOW) {
          attacker.state = "staggered"; attacker.staggerTimer = STAGGER_DURATION * 1.5;
          // A parry is the hardest thing in the game to do and gets the longest
          // freeze. Both men: the one who read it and the one who was read.
          applyHitstop(attacker, target, HITSTOP.heavy);
          broadcast(room, { type: "hit", data: { type: "parry", attackerId: attacker.id, targetId: target.id, damage: 0, hitstop: HITSTOP.heavy } });
          return;
        }
        if (isHeavy && !shieldWall) {
          target.state = "staggered"; target.staggerTimer = STAGGER_DURATION;
          applyDamage(room, attacker, target, Math.floor(zoned * (1 - eff * 0.5)), "blocked_heavy", hitZone);
        } else {
          target.stamina -= 10;
          applyDamage(room, attacker, target, Math.floor(zoned * (1 - eff)), "blocked", hitZone);
        }
        return;
      }
      applyDamage(room, attacker, target, zoned, isHeavy ? "heavy" : "light", hitZone);
    });
  }

  /**
   * Freeze both fighters. The longer of any two overlapping freezes wins, so a
   * man caught by a second blade mid-hitstop is not shortened out of the first.
   * A corpse is not frozen — the dead are skipped by the step anyway, and a
   * frozen body would hold its death animation up.
   */
  function applyHitstop(attacker, target, seconds) {
    if (attacker.state !== "dead") attacker.hitstop = Math.max(attacker.hitstop, seconds);
    if (target.state !== "dead") target.hitstop = Math.max(target.hitstop, seconds);
  }

  function applyDamage(room, attacker, target, damage, hitType, hitZone = "torso") {
    const heavy = hitType === "heavy" || hitType === "blocked_heavy";
    target.health -= damage; target.lastHitBy = attacker.id; attacker.damage += damage;
    // When, not only by whom. A burn death seconds later has to know whether this
    // blow is close enough behind it to have caused it — see burnDeath.
    target.lastHitAt = room.matchTimer;
    // Hitstop, before the death check: a killing blow lands on a man who is
    // still standing at this line, and the freeze is the attacker's either way.
    const stop = heavy ? HITSTOP.heavy : HITSTOP.light;
    applyHitstop(attacker, target, stop);
    broadcast(room, { type: "hit", data: { type: hitType, attackerId: attacker.id, targetId: target.id, damage, health: target.health, direction: attacker.attackDir, hitZone, hitstop: stop } });
    if (target.health <= 0) {
      target.health = 0; target.state = "dead"; target.deaths++;
      target.deadAt = room.matchTimer;
      // The killing blow is marked on the body and not only in the message. The
      // `kill` broadcast reaches whoever was connected when the man fell;
      // `serializeRoom` reaches everyone else, so a spectator who arrives a minute
      // later rebuilds the same one-armed corpse the room watched drop.
      target.deathZone = hitZone; target.deathDir = attacker.attackDir; target.deathHeavy = heavy;
      target.deathCause = "blow";
      target.hitstop = 0;    // ...and the dead are not held still, they are still
      endSwing(target);      // ...and a corpse is not mid-swing
      clearMotion(target);   // the dead stop running
      attacker.kills++; attacker.score += 100;
      room.killFeed.push({ killer: attacker.id, victim: target.id, killerName: attacker.name, victimName: target.name, timestamp: wallNow(), hitZone });
      broadcast(room, { type: "kill", data: { killerId: attacker.id, killerName: attacker.name, victimId: target.id, victimName: target.name, hitZone, direction: attacker.attackDir, heavy, cause: "blow" } });
      if (room.mode !== "solo") checkRoundEnd(room);
    }
  }

  /**
   * The fire, once per step, for one man.
   *
   * Only the first line reads the world. Everything after it is the same
   * countdown whether he is stood still or sprinting, which is why "standing in
   * it kills, passing through it hurts" needs no special case anywhere: the man
   * who leaves after 0.4 s has taken 0.4 s of it, and the man who does not
   * leave keeps taking it.
   */
  function tickBurn(room, player, dt) {
    // A corpse goes on burning and then goes out. It cannot be hurt any more and
    // it is not re-lit by lying in the flames — this is a timer and nothing else,
    // so a body is not still alight when the round break ends and it is not the
    // renderer's job to decide when a dead man stops smoking.
    if (player.state === "dead") {
      if (player.burnTimer > 0) {
        player.burnTimer -= dt;
        if (player.burnTimer <= 0) { player.burnTimer = 0; player.burning = false; player.burnInside = false; }
      }
      return;
    }

    // Spawn and dodge invincibility are answers to a man swinging at you, and
    // there is nobody swinging here. A warrior who could stand in the flames for
    // two seconds at the bell, or roll through them for free, would be reading
    // i-frames as fireproofing. Fire is terrain: the way out of it is to walk.
    // Nothing can be spawned into it either way — the ring starts at 6 m.
    if (Math.hypot(player.position.x, player.position.z) < HAZARD_RADIUS) {
      player.burning = true;
      player.burnInside = true;
      player.burnTimer = BURN_LINGER;   // refreshed on re-entry, never stacked
      // A man killed here keeps his full afterburn, so the corpse in the flames
      // is still alight when it lands. The dead branch above burns it down.
      burnDamage(room, player, BURN_DPS_INSIDE * dt);
      return;
    }

    if (player.burnTimer <= 0) {
      if (player.burning) { player.burning = false; player.burnInside = false; }
      return;
    }
    player.burnInside = false;
    player.burnTimer -= dt;
    burnDamage(room, player, BURN_DPS_AFTER * dt);
    // Clamped whether or not that last dribble killed him: a man who goes down on
    // the final tick of an afterburn was already going out.
    if (player.burnTimer <= 0) { player.burnTimer = 0; player.burning = false; player.burnInside = false; }
  }

  function burnDamage(room, player, amount) {
    player.health -= amount;
    if (player.health > 0) return;
    player.health = 0;
    burnDeath(room, player);
  }

  /**
   * Burning to death.
   *
   * Nobody swung, so nothing comes off. `deathZone` stays null — already the
   * client's no-severance path — and `deathCause` says "fire" outright rather
   * than leaving a renderer to infer a whole death from an absence. A man who
   * burns to death falls; he does not come apart.
   *
   * Credit goes to whoever last drew blood inside BURN_CREDIT_WINDOW: he drove
   * this man into the flames and it is his kill. Outside it the fire took him
   * and it is nobody's. That cannot disagree with how a round is won, because a
   * round is won by who is left standing rather than by who is credited — so the
   * last man alive burning to death ends the round with no side left and
   * checkRoundEnd calls it a draw, instead of handing it to the corpse whose
   * blow chased him in.
   */
  function burnDeath(room, victim) {
    victim.state = "dead";
    victim.deaths++;
    victim.deadAt = room.matchTimer;
    victim.deathZone = null; victim.deathDir = null; victim.deathHeavy = false;
    victim.deathCause = "fire";
    clearMotion(victim);

    const last = room.players.get(victim.lastHitBy);
    const credited = last && last.id !== victim.id &&
      room.matchTimer - victim.lastHitAt <= BURN_CREDIT_WINDOW ? last : null;
    if (credited) { credited.kills++; credited.score += 100; }
    const killerName = credited ? credited.name : "The Fire";
    room.killFeed.push({
      killer: credited ? credited.id : "", victim: victim.id,
      killerName, victimName: victim.name, timestamp: wallNow(), hitZone: null,
    });
    broadcast(room, { type: "kill", data: {
      killerId: credited ? credited.id : "", killerName,
      victimId: victim.id, victimName: victim.name,
      hitZone: null, direction: null, heavy: false, cause: "fire",
    } });
    if (room.mode !== "solo") checkRoundEnd(room);
  }

  /**
   * A flourish, asked for by its owner and heard by the room. Everything here
   * is a refusal path: a dead man does not celebrate, a committed body is
   * spent on the swing or the shove it is in, and a press inside the throttle
   * is dropped silently — no error message, because the only sender who hits
   * the throttle honestly is a double-tap, and the only one who hits it hard
   * is a script. The room state is deliberately not checked: the lobby, the
   * break and the summary are exactly where a flourish belongs.
   */
  function handleEmote(room, player, data) {
    const emote = data.emote;
    if (!EMOTES.includes(emote)) return;
    if (player.state === "dead" || isCommitted(player)) return;
    if (player.state === "dodging" || player.state === "staggered") return;
    // SIM ms, not the wall. The throttle is a rule the server enforces against
    // a client that can spam, and a rule the sim enforces has to be spent out
    // of the sim's own clock — otherwise a replay throttles differently from
    // the match it is replaying, and a headless host throttles by how fast the
    // box happens to be stepping.
    if (simMs < (player.emoteUntil || 0)) return;
    player.emoteUntil = simMs + EMOTE_COOLDOWN_MS;
    player.emote = emote;
    broadcast(room, { type: "emote", data: { playerId: player.id, emote } });
  }

  function activateAbility(room, player) {
    const stats = WARRIOR_STATS[player.warriorClass];
    player.abilityCooldown = stats.abilityCooldown; player.abilityActive = true;
    switch (player.warriorClass) {
      case "huscarl": player.abilityTimer = 4; break;
      case "warden": player.abilityTimer = 5; break;
      case "runekeeper": {
        let nearest = null, minDist = Infinity;
        room.players.forEach((t) => {
          if (t.id === player.id || t.state === "dead") return;
          const d = Math.hypot(t.position.x - player.position.x, t.position.z - player.position.z);
          if (d < minDist) { minDist = d; nearest = t; }
        });
        if (nearest) {
          player.position.x = nearest.position.x + Math.sin(nearest.rotation) * 2;
          player.position.z = nearest.position.z + Math.cos(nearest.rotation) * 2;
          player.rotation = nearest.rotation + Math.PI;
          player.invincible = true; player.invincibleTimer = 0.3;
        }
        player.abilityTimer = 0.5; break;
      }
      case "berserker": player.abilityTimer = 6; break;
    }
    broadcast(room, { type: "ability_used", data: { playerId: player.id, ability: stats.ability, warriorClass: player.warriorClass } });
  }

  // The condition that used to end a match now ends a ROUND. It is the same
  // condition and it was always right; what was wrong was what it decided.
  function checkRoundEnd(room) {
    if (room.mode === "solo") return;
    if (room.state !== "fighting" && room.state !== "last_stand") return;
    const alive = [];
    room.players.forEach((p) => { if (p.state !== "dead") alive.push(p); });
    if (isTeamMode(room)) {
      const ra = alive.filter((p) => p.team === "red").length;
      const ba = alive.filter((p) => p.team === "blue").length;
      if (ra > 0 && ba > 0) return;
      // Both sides wiped in the same tick is a draw: no round win to anybody.
      endRound(room, ra > 0 ? "red" : ba > 0 ? "blue" : null);
      return;
    }
    if (alive.length === 2 && !room.lastStandTriggered && room.players.size > 2) {
      room.lastStandTriggered = true; room.state = "last_stand";
      broadcast(room, { type: "last_stand", data: { players: alive.map((p) => ({ id: p.id, name: p.name })) } });
    }
    if (alive.length <= 1) endRound(room, alive[0] ? alive[0].id : null);
  }

  /**
   * A round is over. `winnerKey` is a player id in a free-for-all, "red" or
   * "blue" in a war band, and null for a draw — the last two men falling on the
   * same tick awards nothing and the match moves on.
   */
  function endRound(room, winnerKey) {
    if (winnerKey) room.roundWins[winnerKey] = (room.roundWins[winnerKey] || 0) + 1;
    const teamMode = isTeamMode(room);
    room.lastRound = {
      index: room.roundIndex,
      winnerId: teamMode ? null : winnerKey || null,
      winnerTeam: teamMode ? winnerKey || null : null,
      winnerName: keyName(room, winnerKey),
      draw: !winnerKey,
    };
    // Either somebody has the round wins that take it, or the format has run out
    // of rounds — a best-of-3 that draws twice still has to stop at three.
    const decided = !!winnerKey && room.roundWins[winnerKey] >= roundsToWin(room);
    const over = decided || room.roundIndex >= (room.bestOf || 1) || room.players.size < 2;
    room.state = over ? "finished" : "intermission";
    // `nextRoundAt` is EPOCH ms and stays epoch ms — WIRE-PROTOCOL §9.6 — because
    // the only thing that reads it is a client counting the break down against
    // its own `Date.now()`. What changed is where the number comes from: sim
    // time, not the wall, so it now names the instant the sim will ACTUALLY
    // deal the round rather than an instant the sim has no opinion about, and a
    // replay reproduces it.
    room.nextRoundAt = over ? 0 : wallNow() + ROUND_BREAK * 1000;
    broadcast(room, { type: "round_end", data: { ...serializeRoom(room), ...room.lastRound, matchOver: over } });
    if (over) return endMatch(room);
    room.phaseAt = simMs + ROUND_BREAK * 1000;
  }

  // Paid ONCE, from the totals the whole match accumulated. Per-round payout
  // would make a best-of-5 worth five times a best-of-1 for the same evening,
  // and the format a player picks is not supposed to be an economic decision —
  // which is why `buildLedger` pays the PLACE the rounds bought rather than the
  // rounds themselves. See PLACE_GOLD.
  function endMatch(room) {
    room.state = "finished";
    const teamMode = isTeamMode(room);
    const roster = [];
    room.players.forEach((p) => roster.push(p));
    // Ranked, placed, paid and sorted in one pass, so the row order the client
    // prints, the podium `render/summary.ts` builds and the coins each man is
    // handed cannot come from three different opinions about who won.
    const { results, winnerKey, winnerBy } = buildLedger({
      roundWins: room.roundWins || {}, players: roster, teamMode,
    });
    broadcast(room, { type: "match_end", data: {
      // `winnerId` stays what it was so nothing already reading it breaks, but a
      // war band cannot be expressed by one man's id: `winnerKind` says which of
      // the two fields carries the answer, and "none" is an honest draw.
      winnerKind: winnerKey ? (teamMode ? "team" : "player") : "none",
      winnerId: teamMode ? null : winnerKey,
      winnerTeam: teamMode ? winnerKey : null,
      winnerName: keyName(room, winnerKey),
      // How it was won, so the summary can say so. See `decideMatch`.
      winnerBy,
      bestOf: room.bestOf || 1, roundsPlayed: room.roundIndex || 0,
      roundTarget: roundsToWin(room), roundWins: { ...room.roundWins },
      roundScoreBy: teamMode ? "team" : "player",
      results,
    } });
    // The summary stays up for ten seconds and then the room is a lobby again.
    // On sim time, so a host driving the sim reaches the rematch screen at all —
    // and so `render/summary.ts`, which stages the victor over a corpse for
    // exactly this window, gets the same window in a replay.
    room.phaseAt = simMs + SUMMARY_HOLD * 1000;
  }

  /** The summary is over. Everything the match left on the room and the men. */
  function resetToLobby(room) {
    room.state = "lobby"; room.matchTimer = 0; room.countdown = 0; room.killFeed = []; room.lastStandTriggered = false;
    room.roundIndex = 0; room.roundWins = {}; room.lastRound = null; room.nextRoundAt = 0;
    room.players.forEach((p) => {
      const stats = WARRIOR_STATS[p.warriorClass];
      p.health = stats.maxHealth; p.stamina = stats.staminaMax; p.state = "idle"; p.ready = false;
      p.kills = 0; p.deaths = 0; p.damage = 0; p.score = 0;
      p.position = { x: 0, y: 0, z: 0 }; p.invincible = false;
      clearMotion(p);
      clearBodyMarks(p);
    });
    sendLobbyUpdate(room);
  }

  // ---------------- bots ----------------
  function angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  // Bots ask for movement exactly the way a player does and the tick answers
  // both the same way. A bot that could write its own velocity was a bot that
  // could not be outrun, however fast the class sheet said you were.
  function botIntent(bot, moveX, moveZ, sprint) {
    const clear = steerClearOfFire(bot, moveX, moveZ);
    bot.latestInput = { moveX: clear.x, moveZ: clear.z, rotationY: bot.yaw, sprint: !!sprint, block: false };
  }

  /**
   * Keep a bot out of the bonfire.
   *
   * This is the way the hazard would most likely have shipped broken. botThink
   * beelines at whatever it is fighting, the fire is at the exact centre of an
   * arena everything orbits, and a bot has no reason of its own to walk round
   * anything — so left alone, every match ends with the whole ring stood in the
   * flames burning itself down.
   *
   * It filters INTENT rather than position, and it does it here, in the one
   * place a bot asks to move, so the chase, the strafe, the pacing and the roll
   * all get it without any of them having to know a fire exists. Two cases:
   *
   *   already too close — out is the only direction worth having, at a full
   *     stride, and it overrides whatever it was doing.
   *   the line goes through it — swing onto the tangent it is already nearest,
   *     hard in proportion to how central the miss would have been. A dead-on
   *     beeline arcs the whole way round; a glancing one barely bends. It never
   *     reverses, so a bot does not back into the man behind him to dodge a fire
   *     in front of him.
   *
   * Length is throttle to the tick, so the deflected vector keeps the caller's
   * pace: a bot circling at 0.45 goes on circling, it does not charge.
   */
  function steerClearOfFire(bot, ix, iz) {
    const px = bot.position.x, pz = bot.position.z;
    const r = Math.hypot(px, pz);
    if (r < BOT_FIRE_KEEPOUT) {
      // Dead centre has no outward direction, so any bearing is out of it.
      if (r < 0.001) return { x: Math.sin(bot.yaw || 0), z: Math.cos(bot.yaw || 0) };
      return { x: px / r, z: pz / r };
    }
    const len = Math.hypot(ix, iz);
    if (len < 0.05) return { x: ix, z: iz };
    const dx = ix / len, dz = iz / len;
    const along = -(px * dx + pz * dz);   // ground to the closest approach
    if (along <= 0 || along > BOT_FIRE_LOOKAHEAD) return { x: ix, z: iz };
    const miss = Math.hypot(px + dx * along, pz + dz * along);
    if (miss >= BOT_FIRE_KEEPOUT) return { x: ix, z: iz };
    let tx = -pz / r, tz = px / r;
    if (tx * dx + tz * dz < 0) { tx = -tx; tz = -tz; }
    const bend = (1 - miss / BOT_FIRE_KEEPOUT) * 1.8;
    const bx = dx + tx * bend, bz = dz + tz * bend;
    const bl = Math.hypot(bx, bz) || 1;
    return { x: (bx / bl) * len, z: (bz / bl) * len };
  }

  // One-shot deed. Movement intent is left alone: a swing does not stop a bot
  // wanting to circle, any more than it stops a player leaning on W.
  function botAct(room, bot, deed) {
    processInput(room, bot, {
      moveX: 0, moveZ: 0, rotationY: bot.yaw, sprint: false,
      attack: false, heavyAttack: false, block: false, dodge: false,
      crouch: false, ability: false, shove: false, attackDir: "right",
      ...deed,
    });
  }

  function botThink(room, bot, dt) {
    if (bot.state === "dead") return;
    const now = room.matchTimer;
    if (now < bot.nextThink) return;
    bot.nextThink = now + (0.18 - bot.aiSkill * 0.08);

    // Release a held block when its guard window ends
    if (bot.isBlocking && now >= bot.blockUntil) {
      botAct(room, bot, {});
      bot.isBlocking = false;
    }

    // Find nearest living enemy (prefer humans in solo for pressure).
    // ENEMY, not merely nearest: a war band puts a bot's shield-friend three
    // metres from his shoulder, and a bot that walks up to him and swings is a
    // bot that never lands anything — processAttack drops the blow for friendly
    // fire, so the round would run until the clock did. Harmless before only
    // because nothing ever put a bot on a side.
    let target = null, minDist = Infinity;
    let human = null, humanDist = Infinity;
    room.players.forEach((p) => {
      if (p.id === bot.id) return;
      if (isTeamMode(room) && p.team === bot.team && p.team !== "none") return;
      const d = Math.hypot(p.position.x - bot.position.x, p.position.z - bot.position.z);
      if (p.state === "dead") return;
      if (d < minDist) { minDist = d; target = p; }
      if (!p.bot && d < humanDist) { humanDist = d; human = p; }
    });
    if (room.mode === "solo" && human && humanDist < minDist + 3) target = human;
    if (!target) {
      // Wander the moot — half a stride, so it reads as pacing, not patrolling
      if (Math.random() < 0.02) {
        const a = Math.random() * Math.PI * 2;
        bot.yaw = a;
        if (!isCommitted(bot)) bot.rotation = a;
        botIntent(bot, Math.sin(a) * 0.5, Math.cos(a) * 0.5, false);
      }
      return;
    }

    const dx = target.position.x - bot.position.x;
    const dz = target.position.z - bot.position.z;
    const dist = Math.max(0.01, Math.hypot(dx, dz));
    const angleTo = Math.atan2(dx, dz);

    // Smooth turning toward target (no snap jitter). The intent keeps tracking
    // through a swing; the BODY does not — `advanceSwing` slews it toward this
    // yaw under the same cap a player is held to, so a committed bot cannot
    // pirouette after a man who stepped aside either.
    const turn = Math.min(1, dt * (6 + bot.aiSkill * 8));
    bot.yaw += angDiff(angleTo, bot.yaw ?? angleTo) * turn;
    bot.aimYaw = bot.yaw;
    if (!isCommitted(bot)) bot.rotation = bot.yaw;

    const nx = dx / dist, nz = dz / dist;         // toward target
    const px = -nz, pz = nx;                       // perpendicular (strafe)
    bot.strafePhase += dt * (0.6 + bot.aiSkill * 0.5);
    const strafe = Math.sin(bot.strafePhase);

    const dirs = ["left", "right", "overhead", "stab"];
    const attackDir = dirs[(Math.random() * 4) | 0];
    // A blow it has had time to SEE, and which has not yet landed. Everything
    // defensive hangs off this rather than off `state === "attacking"`, which is
    // now true for two thirds of a stroke the bot can do nothing about.
    const windupSeen = target.attackPhase === "windup" ? target.swingT * target.swingDuration : 0;
    const readable = windupSeen >= BOT_REACTION - bot.aiSkill * BOT_REACTION_SKILL;
    // ...and the other side of the same coin: a man in recovery has spent his
    // weight and cannot answer. Only the better bots see the opening.
    const openings = target.attackPhase === "recovery" && bot.aiSkill > 0.6;

    // Every distance a bot judges is now judged against a weapon rather than
    // against one constant. Two different weapons are in play and the bot needs
    // both: its own reach decides where it stands and when it swings, the
    // target's decides when it is in danger and must guard or roll.
    const myReach = reachOf(bot);
    const theirReach = reachOf(target);

    // Perfect-spacing steering: close in hungry, back off when too close.
    // Held at 0.7 of its own reach, which is where the old 2.1 sat inside the
    // old flat 3.0 — near enough to strike on the next beat without standing so
    // deep that a backstep takes it out of range. A runekeeper bot that kept the
    // old 2.1 would have paced around a seax that stops biting at 1.70 and swung
    // at air for the whole match.
    const wantDist = myReach * 0.7;
    let toward = 0;
    if (dist > wantDist + 0.4) toward = 1;
    else if (dist < wantDist - 0.5) toward = -0.7;

    // A short intent vector is a slow stride: circling at 0.45 stays a circle,
    // not a charge. The tick reads magnitude as throttle.
    if (toward !== 0 || Math.abs(strafe) > 0.2) {
      const charge = dist > 7 && bot.stamina > 40 && toward > 0;
      botIntent(bot, nx * toward + px * strafe * 0.45, nz * toward + pz * strafe * 0.45, charge);
    } else {
      botIntent(bot, 0, 0, false);
    }

    // Guard: hold a BLOCK for a short window when enemy winds up
    if (readable && !bot.isBlocking && dist < theirReach * 1.15 && Math.random() < 0.22 + bot.aiSkill * 0.3) {
      botAct(room, bot, { block: true, attackDir: target.attackDir });
      bot.isBlocking = true;
      bot.blockUntil = now + 0.45 + Math.random() * 0.6;
      return;
    }

    // Dodge an imminent close blow. The roll goes through the same filter as a
    // stride, because it is the longest single movement in the game — a
    // runekeeper's is 5.6 m — and backing away from a man stood with the fire
    // behind him is precisely how a bot would roll into it.
    if (readable && dist < theirReach * 0.65 && bot.dodgeTimer <= 0 && Math.random() < 0.08 + bot.aiSkill * 0.18) {
      const roll = steerClearOfFire(bot, -nx, -nz);
      botAct(room, bot, { moveX: roll.x, moveZ: roll.z, dodge: true });
      return;
    }

    // Ability on cooldown-loop
    if (bot.abilityCooldown <= 0 && dist < 4 && Math.random() < 0.03 + bot.aiSkill * 0.03) {
      botAct(room, bot, { ability: true, attackDir });
    }

    // The shove, and ONLY as the fire play: a man stood between the bot and
    // the bonfire, near enough to the flames that SHOVE.push carries him in,
    // with the push line pointed at the hearth. Human targets only, for two
    // reasons that agree: the moment this exists to produce is a player's
    // panic, which a bot audience wastes — and bots hold each other outside
    // BOT_FIRE_KEEPOUT, so a bot that could shove bots would be the one way
    // the "bots never burn" guarantee (firetest) gets broken from the side.
    // The chance is per-think and skill-scaled: a jarl takes the opening
    // inside a second or so of it appearing, a recruit usually lets it pass.
    if (!bot.isBlocking && !target.bot && bot.shoveCooldown <= 0 && bot.stamina > SHOVE.stamina + 15 &&
        dist < SHOVE.range * 0.9 && !isCommitted(bot)) {
      const tr = Math.hypot(target.position.x, target.position.z);
      const fireward = tr > 0.01 ? (-target.position.x * nx - target.position.z * nz) / tr : 0;
      if (fireward > 0.8 && tr < HAZARD_RADIUS + SHOVE.push * 0.9 &&
          Math.random() < 0.04 + bot.aiSkill * 0.10) {
        botAct(room, bot, { shove: true });
        return;
      }
    }

    // Strike cadence, now measured against the bot's OWN stroke. A man caught in
    // recovery is punished on the spot rather than on the next beat — that is
    // what recovery is for, and a bot that could not use it would leave the whole
    // point of the weight pass to the player alone.
    if (!bot.isBlocking && dist <= myReach * 0.95 && (now >= bot.nextAttackAt || openings) && bot.stamina > 25) {
      const heavy = Math.random() < 0.2 * bot.aiSkill + (target.state === "blocking" ? 0.18 : 0);
      botAct(room, bot, {
        rotationY: bot.yaw + (Math.random() - 0.5) * 0.15,
        attack: !heavy, heavyAttack: heavy, attackDir,
      });
      bot.nextAttackAt = now + swingDurationOf(bot.warriorClass, heavy)
        + BOT_SWING_GAP - bot.aiSkill * BOT_SWING_GAP_SKILL + Math.random() * 0.4;
    }
  }

  // ---------------- movement ----------------
  // The tick is the only clock the simulation trusts. An input message says
  // what a warrior WANTS; how far he actually travels is settled here, once
  // per fixed step, so a player on a ragged line moves exactly as fast as one
  // on a clean line — and exactly as fast as his class sheet promises.
  //
  //   steering:  v += (want - v) * k,   k = 1 - e^(-dt/TAU)
  //
  // What sustained speed does that produce? The correction is proportional to
  // (want - v) and to nothing else, so the fixed point is v = want exactly: no
  // offset, no residue, no dependence on dt, TAU or the message rate. The step
  // integrates with the post-update v, so a step at the fixed point covers
  // want*dt, and a hold of T seconds from a standstill covers
  //
  //   want * (T - TAU*(1 - e^(-T/TAU)))
  //
  // — the full distance less one time constant's worth of ramp. For a Warden's
  // 4.5 u/s and the playtest's 1.2 s hold that is 4.5*(1.2 - 0.17) = 4.63 units
  // against an assertion of 3.0, and 4.67 measured in-process. So the algebra
  // here was already right; what was wrong was `dt` — see gameTick.
  //
  // Two things would move that fixed point off the sheet, and both are
  // deliberately absent:
  //   - Drag on a step that HAS intent. Any drag term at all, applied
  //     alongside the correction, settles at want*k/(k + drag) < want, which
  //     makes top speed a property of the tuning constants instead of the class
  //     sheet. So deceleration lives only in the `else` branch: letting go is
  //     what stops you, not moving.
  //   - An unclamped intent vector. `want` is the intent DIRECTION times
  //     min(1, |intent|) * speed, so a keyboard diagonal (|intent| = √2) walks
  //     at moveSpeed rather than 1.41 * moveSpeed, and a thumb half pushed
  //     walks at half of it. Nothing a client sends can ask for more than one.
  //
  // (Two passes ago this lerped toward `want` once per input MESSAGE and
  //  multiplied by 0.87 once per TICK, settling at 0.87(1-a^m)/(1-0.87·a^m)·want
  //  for m messages a tick, a = 0.07^dt — 45% of the stated speed at 20 msg/s,
  //  69% at 60, 87% at infinity. Top speed was a network measurement. The pass
  //  after that fixed the algebra and left the clock, which was the other half
  //  of the same bug.)
  //
  // Sprint and guard are the only multipliers on `want`, and both are sheet
  // numbers rather than accidents: sprintSpeed is its own column and is reached
  // to the same tolerance as the walk, and a raised shield is exactly
  // BLOCK_MOVE_MULT of the walk — 0.55, enough to be felt, not enough to root
  // you, and never compounded with a sprint because you cannot sprint behind a
  // shield.
  function integrateMovement(player, dt) {
    const stats = WARRIOR_STATS[player.warriorClass];
    // Committed: the body is spent on a swing, a roll or a stagger, and steers
    // for nobody — but it keeps the momentum it already had.
    const committed = player.state === "attacking" || player.state === "dodging" || player.state === "staggered" || player.state === "shoving";
    const intent = currentIntent(player);

    let wantX = 0, wantZ = 0, sprinting = false;
    if (intent && !committed) {
      const mx = finite(intent.moveX), mz = finite(intent.moveZ);
      const len = Math.hypot(mx, mz);
      if (len > 0.05) {
        sprinting = !!intent.sprint && player.stamina > 10 && player.state !== "blocking";
        const guard = player.state === "blocking" ? BLOCK_MOVE_MULT : 1;
        const speed = (sprinting ? stats.sprintSpeed : stats.moveSpeed) * guard;
        // A thumb half-pushed is half a stride; a keyboard is always all of it,
        // and nothing a client sends can ask for more than one.
        const throttle = Math.min(1, len) / len * speed;
        wantX = mx * throttle; wantZ = mz * throttle;
      }
    }
    const moving = wantX !== 0 || wantZ !== 0;

    if (moving) {
      const k = 1 - Math.exp(-dt / MOVE_ACCEL_TAU);
      player.moveVel.x += (wantX - player.moveVel.x) * k;
      player.moveVel.z += (wantZ - player.moveVel.z) * k;
    } else {
      const k = Math.exp(-dt / (committed ? MOVE_CARRY_TAU : MOVE_STOP_TAU));
      player.moveVel.x *= k; player.moveVel.z *= k;
      if (Math.abs(player.moveVel.x) < 0.01) player.moveVel.x = 0;
      if (Math.abs(player.moveVel.z) < 0.01) player.moveVel.z = 0;
    }

    // Locomotion never overwrites a state the fight owns.
    if (player.state === "idle" || player.state === "walking" || player.state === "running" || player.state === "sprinting") {
      player.state = !moving ? "idle" : sprinting ? "sprinting" : intent && intent.sprint ? "running" : "walking";
    }

    // A burst decays by e^(-dt/TAU); the exact ground it covers in this tick is
    // the integral of that, and those integrals sum to impulse*TAU over its
    // whole life. Launch it at distance/TAU and it travels `distance`, period.
    const decay = Math.exp(-dt / IMPULSE_TAU);
    const carried = IMPULSE_TAU * (1 - decay);
    player.position.x += player.moveVel.x * dt + player.impulse.x * carried;
    player.position.z += player.moveVel.z * dt + player.impulse.z * carried;
    player.impulse.x *= decay; player.impulse.z *= decay;
    if (Math.abs(player.impulse.x) < 0.01) player.impulse.x = 0;
    if (Math.abs(player.impulse.z) < 0.01) player.impulse.z = 0;

    // What goes on the wire is the whole motion, not the steering half of it —
    // the client leans and extrapolates off this.
    player.velocity.x = player.moveVel.x + player.impulse.x;
    player.velocity.z = player.moveVel.z + player.impulse.z;

    if (sprinting) player.stamina -= SPRINT_STAMINA * dt;
    if (player.state === "blocking") player.stamina -= BLOCK_STAMINA * dt;
  }

  // The last input a player sent is his standing intent — the tick keeps acting
  // on it until a newer one arrives. If the link dies or the tab sleeps we let
  // that intent lapse rather than leave a warrior jogging into the palisade
  // forever. Bots are simulated in-process, so their intent is never stale.
  function currentIntent(player) {
    if (!player.latestInput) return null;
    if (!player.bot && simMs - player.inputAt > INPUT_LAPSE_MS) {
      if (player.state === "blocking") { player.state = "idle"; player.blockTimer = 0; }
      return null;
    }
    return player.latestInput;
  }

  function clearMotion(player) {
    player.velocity = { x: 0, y: 0, z: 0 };
    player.moveVel = { x: 0, z: 0 };
    player.impulse = { x: 0, z: 0 };
    player.latestInput = null;
    player.inputAt = 0;
  }

  // ---------------- tick ----------------
  // THE CLOCK, and the movement bug's real home. Every quantity in the
  // simulation is a rate times this function's dt, so if dt is a fiction then
  // the whole game — speed, stamina, cooldowns, the match timer — runs at the
  // wrong rate together.
  //
  // It used to be `setInterval(gameTick, 50)` with a hardcoded `dt = 1/20`.
  // setInterval is not a real-time clock; it is "no sooner than". A Node loop
  // sharing a box with anything (a Next request, a GC pause, a headless browser
  // eating four cores in the next process) delivers 8-12 Hz while the code keeps
  // charging 50 ms a wake, so:
  //
  //   observed speed = stats.moveSpeed * TICK_MS / real_ms_between_wakes
  //
  // A Warden's 4.5 u/s measured 1.92 u/s in the playtest, which is 4.5 * 50/117:
  // a tick really firing at 8.5 Hz. Blocking this loop on purpose reproduces it
  // to the digit — 20.0 Hz -> 7.9 Hz takes a held W from 4.52 units in 1.2 s to
  // 1.53 — and no correction to integrateMovement can touch it, because the
  // integrator was never the thing that was wrong.
  //
  // So the step stays fixed at 1/TICK_RATE — every tuning constant then means
  // what it says, a step is too short to tunnel a body through another, and two
  // runs of the same inputs agree — and elapsed time decides how many steps are
  // owed. Arrears carry rather than being dropped, so a run of 63 ms wakes
  // averages out exactly instead of quietly losing 13 ms each time. One
  // broadcast per wake regardless: the packet rate may sag on a starved box, the
  // simulation rate may not.
  //
  // WHAT CHANGED, and it is the whole of docs/PLATFORM-PATH.md §2: the wall
  // clock used to be read HERE, which meant the simulation owned its own clock
  // and no other host could drive it. It is read in exactly one place now —
  // `gameTick`, the OPTIONAL internal timer below — and everything under that
  // takes elapsed milliseconds as an argument. A console frame loop, a replay
  // or a harness calls `step(dt)` and gets this identical code path with this
  // identical fixed step; nothing downstream can tell which of the two woke it.
  function advance(elapsedMs, capMs) {
    arrearsMs += elapsedMs;
    // The cap belongs to the WALL clock and to nothing else. A box that was
    // asleep for a minute must not fast-forward the fight when it wakes; a
    // caller that deliberately hands the sim a minute is asking for a minute,
    // and shortening it would make a replay disagree with the match it replays.
    if (capMs !== undefined && arrearsMs > capMs) {
      // THE DROPPED TIME GOES ON THE EPOCH, because it really did happen — the
      // wall advanced through it even though the simulation refused to. Without
      // this line `wallNow()` loses it forever and the two epoch-ms fields on
      // the wire drift behind every client's own clock. See `epoch` above.
      //
      // Only the internal timer passes a cap, so an engine driven by `step(dt)`
      // never reaches this branch and its epoch never moves — a replay stays
      // byte-identical, which is the whole reason these fields are derived from
      // sim time rather than read off the wall.
      epoch += arrearsMs - capMs;
      arrearsMs = capMs;
    }
    const steps = Math.floor((arrearsMs + TICK_SLACK_MS) / TICK_MS);
    if (steps <= 0) return 0;   // owed nothing yet: no simulation, no duplicate snapshot
    arrearsMs -= steps * TICK_MS;

    // Whoever was fighting when this wake BEGAN is owed exactly one snapshot at
    // the end of it. The state is tested once, here, and the broadcast below is
    // unconditional — so the wake whose last substep ends the match still sends
    // a frame, and it reads `finished`. That is WIRE-PROTOCOL §9.10, it is
    // permanent, protocoltest holds it, and it is why this test cannot be moved
    // inside the substep loop.
    const live = [];
    rooms.forEach((room) => { if (isFightState(room)) live.push(room); });

    for (let s = 0; s < steps; s++) {
      simMs += TICK_MS;
      for (const room of live) stepRoom(room, TICK_DT);
      // ...and every room's PHASE clock, stepped or not. A room in `countdown`,
      // `intermission` or `finished` is deliberately not simulated — that is
      // what those states mean — but its clock still has to run, and it used to
      // run on `setTimeout` and `setInterval`. That is precisely why a headless
      // host could get a room to the countdown and then wait forever. Sim time
      // advances on every step whatever any room is doing, so a phase deadline
      // is honoured on the same tick under a frame loop as under the timer.
      rooms.forEach(advancePhase);
    }

    for (const room of live) broadcast(room, { type: "game_state", data: serializeRoom(room) });
    return steps;
  }

  /**
   * The clocks a room runs while it is NOT being stepped, and the reason this
   * engine no longer owns a timer of its own.
   *
   * Four waits used to be real timers: the 800 ms before a solo trial deals
   * itself, the one-second beat of the countdown, the five-second round break,
   * and the ten seconds a summary stays on screen. Every one of them decided
   * GAMEPLAY — when the bell rings, when the next round starts, when the room
   * is a lobby again — and not one of them was reachable by a host driving the
   * simulation itself. A console client could join, ready up, start, watch the
   * countdown packet arrive, and then step for the rest of the afternoon
   * without the fight ever beginning.
   *
   * They are one field now. A room is in exactly one state and each state waits
   * on at most one thing, so `room.phaseAt` is that thing's deadline in SIM
   * milliseconds and 0 means nothing is pending. The switch is on the STATE and
   * not on the deadline alone: a deadline left behind by a room that was
   * dragged somewhere else — a disconnect emptying a countdown — is discarded
   * instead of fired in the wrong phase, which is the re-check each of those
   * four timers used to have to perform for itself. The other guard they all
   * carried, "is this room still the room I was armed for", is gone because it
   * cannot fail: this is only ever called with a room the map still holds.
   */
  function advancePhase(room) {
    if (!room.phaseAt || simMs < room.phaseAt) return;
    switch (room.state) {
      // A solo trial deals itself a beat after the join, so a client has a
      // frame of lobby to draw before the ring is stood up.
      case "lobby":
        room.phaseAt = 0;
        startMatch(room);
        return;
      // The bell. Three, two, one — thin packets carrying only the number, see
      // WIRE-PROTOCOL §9.3 — and then the fight.
      case "countdown": {
        room.phaseAt = simMs + 1000;
        room.countdown--;
        if (room.countdown > 0) {
          broadcast(room, { type: "countdown", data: { countdown: room.countdown } });
          return;
        }
        room.phaseAt = 0;
        room.state = "fighting";
        // The grace is armed HERE, in the same statement that starts the fight,
        // because `stepRoom` — the only thing that spends it — starts running
        // on this transition too. Armed anywhere earlier it is a duration held
        // against a stopped clock, which is the bug this replaces. Two seconds
        // now means two seconds of the fight, which is what the constant is
        // named for. See src/game/grace.mjs.
        room.players.forEach((p) => {
          if (p.state === "dead") return;
          p.invincible = true; p.invincibleTimer = SPAWN_INVINCIBLE;
        });
        broadcast(room, { type: "game_state", data: serializeRoom(room) });
        return;
      }
      // The breath between rounds, ROUND_BREAK long.
      case "intermission":
        room.phaseAt = 0;
        startRound(room);
        return;
      // The summary has been read; the room becomes a lobby again.
      case "finished":
        room.phaseAt = 0;
        resetToLobby(room);
        return;
      default:
        room.phaseAt = 0;
    }
  }

  // The only place in the simulation that reads a wall clock, and it exists
  // only when the engine was asked to own a timer. It converts "how long since
  // the last wake" into sim time and hands it to `advance`, which is the same
  // door `step` comes through.
  function gameTick() {
    const now = performance.now();
    const elapsed = now - wakeAt;
    wakeAt = now;
    advance(elapsed, MAX_CATCHUP_MS);
  }

  // One fixed step of one room. Never called with anything but TICK_DT — the
  // constant is a parameter so the substep loop above reads as what it is.
  function stepRoom(room, dt) {
    room.matchTimer += dt;

    room.players.forEach((player) => {
      // The fire first, because it can kill: a man it kills has to drop out of
      // the rest of this step exactly the way a man cut down last step does, and
      // every branch below already knows how to skip the dead. It reads the
      // position the previous step left him at, which is one tick of lag against
      // a 1.5 m radius and not worth a second pass over the room to remove.
      tickBurn(room, player, dt);

      // Solo respawns for endless training
      if (room.mode === "solo" && player.state === "dead") {
        if (room.matchTimer - player.deadAt > 5) {
          const stats = WARRIOR_STATS[player.warriorClass];
          setSpawn(player, safestSpawn(room, player));
          player.health = stats.maxHealth;
          player.stamina = stats.staminaMax;
          player.state = "idle";
          player.invincible = true; player.invincibleTimer = 1.5;
          player.deadAt = -999;
          clearMotion(player);      // you come back standing, not still running
          clearBodyMarks(player);   // ...and whole, and not on fire. This is the
                                    // leak the client would otherwise inherit:
                                    // solo respawns run every five seconds, forever.
        }
        return;
      }
      if (player.state === "dead") return;

      // HITSTOP. The blow has landed and for these few frames nothing about this
      // man advances: no swing clock, no stagger, no stamina, no travel, and for
      // a bot no thinking. The reported velocity goes to zero as well, or a
      // client extrapolating between packets keeps sliding him through a freeze
      // the server says is total.
      //
      // It cannot chain: the only thing that sets it is a hit resolved out of
      // `advanceSwing`, and an attacker frozen here is an attacker whose swing
      // is not advancing either.
      if (player.hitstop > 0) {
        player.hitstop -= dt;
        if (player.hitstop <= 0) player.hitstop = 0;
        player.velocity.x = 0; player.velocity.z = 0;
        return;
      }

      if (player.bot) botThink(room, player, dt);

      advanceSwing(room, player, dt);
      advanceShove(room, player, dt);
      if (player.blockTimer > 0) player.blockTimer += dt;
      if (player.dodgeTimer > 0) {
        player.dodgeTimer -= dt;
        // Dodge roll ends cleanly — the warrior returns to fighting stance
        if (player.dodgeTimer <= DODGE_COOLDOWN - DODGE_DURATION && player.state === "dodging") player.state = "idle";
        if (player.dodgeTimer <= 0 && player.state === "dodging") player.state = "idle";
      }
      if (player.staggerTimer > 0) { player.staggerTimer -= dt; if (player.staggerTimer <= 0 && player.state === "staggered") player.state = "idle"; }
      if (player.invincibleTimer > 0) { player.invincibleTimer -= dt; if (player.invincibleTimer <= 0) player.invincible = false; }
      if (player.comboTimer > 0) { player.comboTimer -= dt; if (player.comboTimer <= 0) player.comboCount = 0; }
      if (player.abilityCooldown > 0) player.abilityCooldown -= dt;
      if (player.abilityActive) {
        player.abilityTimer -= dt;
        if (player.abilityTimer <= 0) { player.abilityActive = false; if (player.state === "ability") player.state = "idle"; }
        if (player.warriorClass === "berserker") { player.health -= 3 * dt; if (player.health < 1) player.health = 1; }
      }
      integrateMovement(player, dt);

      const stats = WARRIOR_STATS[player.warriorClass];
      if (player.state !== "sprinting" && player.state !== "attacking" && player.state !== "shoving") {
        player.stamina = Math.min(player.maxStamina, player.stamina + stats.staminaRegen * dt);
      }
      if (player.stamina < 0) player.stamina = 0;

      // The palisade. The projection is radial, so it only ever costs the
      // outward part of a step — a warrior meeting the wall at an angle keeps
      // every bit of his tangential travel and slides along it, which is why
      // this is not a displacement leak on the way to it. What it must also do
      // is take the outward velocity with it: leaving 4.5 u/s pointed into the
      // timber makes the client extrapolate through the wall and snap back on
      // every packet, and hands the stride straight back the instant the body
      // turns away.
      const r = Math.hypot(player.position.x, player.position.z);
      if (r > ARENA_RADIUS) {
        const nx = player.position.x / r, nz = player.position.z / r;
        player.position.x = nx * ARENA_RADIUS;
        player.position.z = nz * ARENA_RADIUS;
        killComponent(player, nx, nz);
      }
    });

    // Soft body collision — warriors cannot stack on each other. The push is
    // positional and symmetric, and it eats displacement only while two bodies
    // are actually overlapping, which is the point of it.
    const arr = [];
    room.players.forEach((p) => { if (p.state !== "dead") arr.push(p); });
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz);
        if (d < BODY_MIN_SEP && d > 0.0001) {
          const push = (BODY_MIN_SEP - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          // A roll goes through the scrum rather than being sorted by it.
          if (a.state !== "dodging") { a.position.x -= nx * push; a.position.z -= nz * push; killComponent(a, nx, nz); }
          if (b.state !== "dodging") { b.position.x += nx * push; b.position.z += nz * push; killComponent(b, -nx, -nz); }
        }
      }
    }
  }

  // `blockedX/blockedZ` is a unit direction that has just turned solid — the
  // outward radial at the palisade, the line to the man you walked into. Take
  // the part of the stride pointed that way and only that part, so the warrior
  // goes on sliding along the wall or around him. Without this the server spends
  // displacement it then undoes, reports a velocity the client extrapolates into
  // the obstacle, and hands back a full stride the instant contact breaks. The
  // impulse is deliberately left alone: a lunge that lands on a shield should
  // still read as a lunge, and it decays on its own.
  function killComponent(player, blockedX, blockedZ) {
    const into = player.moveVel.x * blockedX + player.moveVel.z * blockedZ;
    if (into <= 0) return;
    player.moveVel.x -= into * blockedX; player.moveVel.z -= into * blockedZ;
    player.velocity.x = player.moveVel.x + player.impulse.x;
    player.velocity.z = player.moveVel.z + player.impulse.z;
  }

  // The timer only decides how often we come and LOOK at the clock; how much
  // simulation happens is gameTick's business. A late wake is worked off, not
  // lost, so this being a plain setInterval is now a scheduling detail rather
  // than the thing that sets the game's speed.
  //
  // ...and now it is optional. `autoTick: false` starts nothing: no timer, no
  // `performance.now()`, no way for this engine to advance except a caller
  // handing it time. That is what a console frame loop, a replay and a test all
  // need, and the default is untouched so the two servers get exactly the loop
  // they have always had.
  let tickInterval = null;
  if (autoTick) {
    wakeAt = performance.now();
    tickInterval = setInterval(gameTick, TICK_MS);
  }

  return {
    connect(sender) {
      const sid = randomUUID();
      sessions.set(sid, { sender, roomCode: null, playerId: null });
      return sid;
    },
    attachSender(sid, sender) {
      const s = sessions.get(sid);
      if (!s) return false;
      s.sender = sender;
      return true;
    },
    detachSender(sid) {
      const s = sessions.get(sid);
      if (!s) return false;
      s.sender = null;
      return true;
    },
    message(sid, msg) { routeMessage(sid, msg); },
    httpMessage(sid, msg) {
      const replies = [];
      const s = sessions.get(sid);
      if (!s) return { ok: false, replies: [] };
      const prev = s.sender;
      s.sender = (str) => replies.push(JSON.parse(str));
      try { routeMessage(sid, msg); }
      finally { s.sender = prev; }
      return { ok: true, replies };
    },
    disconnectSession,
    has(sid) { return sessions.has(sid); },

    /**
     * Advance the simulation by `dtSeconds` of SIM time; returns how many fixed
     * steps that bought. This is the whole of docs/PLATFORM-PATH.md §2 in one
     * method: a host with its own frame loop calls it instead of leaving a
     * timer to do it, and gets the identical code path the timer uses.
     *
     * Called with nothing it advances by exactly one tick, which is the unit
     * everything in here is written in. Called with a duration it runs as many
     * WHOLE fixed steps as that duration owes and carries the remainder to the
     * next call — a variable frame time is spent on fixed steps, never on a
     * variable one, or the arena's speeds and cooldowns become a measurement of
     * the caller's frame rate. That is the bug this file's clock comment is
     * about and it is not being reintroduced through the front door.
     *
     * There is no catch-up cap here, unlike the timer's: a caller asking for
     * five seconds means five seconds. Broadcasting works exactly as it does
     * under the timer — one `game_state` per call per room that was fighting
     * when the call began — so a replay produces the same frames a match did.
     */
    step(dtSeconds) {
      return advance(dtSeconds === undefined ? TICK_MS : Math.max(0, finite(dtSeconds) * 1000));
    },
    /**
     * Milliseconds of simulation advanced so far. Monotonic, exact, and the
     * only clock any rule in here reads — a harness that wants to know how far
     * a match has got asks this rather than a wall clock.
     */
    simTime() { return simMs; },
    /**
     * The wall-clock millisecond this engine currently believes it is, and the
     * value both epoch-ms fields on the wire are stamped from.
     *
     * Exposed because the alternative was that nothing could see it. `wallNow()`
     * shipped drifting permanently behind the real clock — every stall past
     * `MAX_CATCHUP_MS` was dropped from `simMs` and never returned — and no
     * test could catch it, because the only readings of it leave through
     * `nextRoundAt` and a kill-feed entry, and every determinism check runs on
     * an `autoTick: false` engine where the cap never bites. A quantity a gate
     * cannot read is a quantity that regresses.
     */
    wallTime() { return wallNow(); },
    /** Whether this engine started a timer of its own. */
    autoTick,
    /**
     * Put the internal timer down. A no-op on an `autoTick: false` engine,
     * which never had one, and the thing that lets a process holding several
     * engines exit.
     */
    stop() { if (tickInterval) { clearInterval(tickInterval); tickInterval = null; } },
    // Null on an `autoTick: false` engine. `clearInterval(null)` is a no-op, so
    // the harnesses that clear this to let the process exit still work either
    // way; `stop()` says the same thing without reaching for the field.
    _tickInterval: tickInterval,
    /**
     * The live room map, for harnesses only.
     *
     * A test that wounds a man has to wound the SERVER'S player, not the
     * serialized copy the snapshot carries — writing to the copy changes
     * nothing, and a check reading it back would report a wound that never
     * happened and pass. Underscored because no client path may use it.
     */
    _rooms: rooms,
  };

  function disconnectSession(sid) {
    const s = sessions.get(sid);
    if (!s) return;
    if (s.roomCode && s.playerId) {
      const room = rooms.get(s.roomCode);
      if (room) {
        room.players.delete(s.playerId);
        broadcast(room, { type: "player_left", data: { playerId: s.playerId } });
        if (humanCount(room) === 0) {
          rooms.delete(room.code);
        } else {
          if (room.hostId === s.playerId) {
            for (const [pid] of room.players) { if (!pid.startsWith("bot_")) { room.hostId = pid; break; } }
          }
          if (room.state === "fighting" || room.state === "last_stand") checkRoundEnd(room);
          else sendLobbyUpdate(room);
        }
      }
    }
    sessions.delete(sid);
  }
}

/**
 * THE process-wide engine, cached on `globalThis` so `custom-server.mjs` and
 * the Next API routes serve one set of rooms rather than two. Unchanged: it
 * still builds a default engine, which still starts its own 20 Hz timer.
 *
 * It is a convenience, not the only way in. `makeEngine()` is exported and each
 * call is a wholly independent simulation — its own rooms, its own sessions,
 * its own clock — so a room orchestrator, a replay or a test can hold several
 * at once, and NOTHING in this module keeps mutable state outside the closure
 * for them to fight over.
 *
 * TWO THINGS ARE GENUINELY SHARED, and both are the host process's, not this
 * module's. Saying so here rather than leaving them to be discovered:
 *
 *   1. `Math.random`. Every bot decision, every room code and every bot name is
 *      drawn from the one global stream, so two engines in a process INTERLEAVE
 *      their draws and neither is reproducible on its own. It is not made
 *      per-engine because `tools/seeddie.mjs` pins that stream process-wide to
 *      make a harness repeatable, and an engine-owned die would take that lever
 *      away from every tool that uses it. A caller who needs two engines to be
 *      independently deterministic has to give them separate processes, or this
 *      is the thing to change first.
 *   2. `crypto.randomUUID`, for session, player and room ids. Shared, and
 *      harmless — it is the one source here whose whole job is to collide with
 *      nothing, in this process or any other.
 *
 * Room CODES are per-engine and are checked for collision only within their own
 * `rooms` map, so two engines can hold the same code. That is correct — a code
 * only ever means anything to the engine a session is attached to — but a host
 * routing players between engines has to route by engine and not by code alone.
 */
export function getEngine() {
  const g = globalThis;
  if (!g.__bretwaldaEngine) g.__bretwaldaEngine = makeEngine();
  return g.__bretwaldaEngine;
}
