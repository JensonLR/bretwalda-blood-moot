// Character rigs and the map from server state to pose.
//
// The server owns where a warrior is and what it is doing; this module owns
// what that looks like. It is split in two on purpose:
//
//   stepWarriorTransform — network smoothing. Where the body actually is.
//   poseWarrior          — the pose for the current state. What the body does.
//
// They are separate calls because the frame needs to read the smoothed position
// (for impact effects) before the pose jitters it, and because a real skeletal
// animation system can replace the second without touching the first.
//
// The pose is built as additive layers over a fighting stance — locomotion,
// action, reaction, breath — and nothing inside a layer is ever lerped toward a
// target angle. That is what made the old poses float: an angle chasing a
// constant has no phase, so it cannot load, release or follow through. Every
// layer here is a curve in its own time instead, and the timers the server
// already sends are what those curves are read against. Only two things are
// smoothed, and both are between poses rather than inside one — the weight of
// each layer, and a short crossfade whenever the server changes state.
//
// Two things about that were not true until this pass, and both were costing
// more than the layer architecture was buying:
//
//   The swing clock was not read off the timer, it was *inferred* from it — the
//   phase was only trusted once the timer had been watched ticking down across
//   two frames, and smoothed toward the answer on top of that. A still holds the
//   timer, so no still ever showed the pose it asked for, and every animation
//   note written off a capture was written off the wrong frame. `readSwing` now
//   evaluates the phase from the timer outright, and carries it across the gap
//   between packets only as far as a packet can plausibly be late.
//
//   The rig had no elbow and no knee. `characters.ts` models both as volume and
//   emits each limb as one merged shell, so a limb could only swing as a stick:
//   no swing could coil, nothing could load onto a bent front leg, and a death
//   was a rotation rather than a collapse. `articulate` binds each limb to two
//   bones — see the note above it for why the mesh cannot simply be cut — and
//   the layers below drive them.
//
// Two more things were not true until this pass, and both were measured on the
// built rig rather than argued about:
//
//   Every attack ended with its weapon pointing at the sky. A blade's pitch is
//   the sum of the shoulder, the elbow, the builder's grip and the wrist, and
//   nothing owned that sum — so the overhead's shoulder swept 3.44 rad down
//   while its elbow gave 1.72 back and the wrist another 0.70, and the huscarl's
//   sword point stood 2.69 m in the air at the instant of impact, having started
//   the strike at 1.36 m. It rose through every swing in the table. `Pose.wa`
//   states where the blade is aimed and `applyPose` solves the wrist out of it,
//   which is the only version of this that cannot drift again, because the thing
//   being authored is the thing a viewer looks at.
//
//   Nobody's feet were on the ground. `settleOnFeet` drops the body onto the leg
//   that reaches furthest, and it measured that reach against the wrong angle —
//   the hip's, where the hip-to-sole line actually runs about half the knee's
//   own bend away from it. At the old knee angles the two agreed to a centimetre;
//   at the angles a loaded lunge needs they do not, and the trailing foot hung
//   110 to 380 mm in the air through every attack in the set. It solves both
//   soles now, one by dropping the body and the other out of that leg's own
//   spare bend.
//
// One thing here is not a pose layer at all, and cannot be. A cloak is the only
// thing on a warrior that does not follow a bone, and turning the whole shell on
// one authored angle — which is what this did — is a flat plate on a hinge. It
// hangs on a rig of its own now and is *solved* rather than posed, off the body's
// own velocity, acceleration and turn rate; see the Cloth section. That rig is a
// grid and not a chain, and it had to become one: a single column down the body
// axis can rotate a hem but cannot narrow one, and drives both wings off one
// bone, so the shell kept its cut radius and moved as a cone whatever it did.
// The pose layers still have their say, but as a term in the solve rather than
// as the whole of it, because a run's billow should add to the drag the run is
// already generating and not overwrite it.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { DeathCause, GamePlayer, WarriorClass } from "../../types";
import { WARRIOR_STATS, SWING_PHASES, SHOVE, KNOCKDOWN, EMOTE_SECONDS, type EmoteId } from "../../types";
import {
  buildCharacter, buildWeaponForClass, buildShield, shieldBoard, peopleOf,
  defaultAppearance, ELBOW_ALONG, KNEE_ALONG, GRIP_ALONG, GRIP_PITCH,
  type Appearance, type BuiltCharacter, type SeamId, type Severance,
  type TeamSide,
} from "../characters";
import { getHandedness, subscribeHandedness } from "../input";
import type { MaterialLibrary } from "./materials";
import type { FrameContext, QualitySettings } from "./quality";

/**
 * The one material every warrior's shadow proxy shares. It writes NOTHING —
 * no colour, no depth — so the proxy costs a single draw call and changes not
 * one pixel of the picture, while still being a real drawn object, which is
 * what the shadow pass requires (see the note at the traverse in
 * `buildWarrior`). Shared because a material per warrior would be a program
 * per warrior for a shader that does nothing.
 */
const SHADOW_PROXY_MATERIAL = new THREE.MeshBasicMaterial({
  colorWrite: false,
  depthWrite: false,
});


// ---------------------------------------------------------------------------
// Handedness
// ---------------------------------------------------------------------------
//
// The character builder mounts the weapon arm at local +X and the body faces
// local +Z, so the sword has always hung off the hand a man facing +Z carries on
// his LEFT. Right-handed is the majority, so right-handed is now the default and
// the mirror is what the minority turn on — the SAME switch that already mirrors
// the touch zones and the HUD cluster, not a second control beside it.
//
// It is done as a scale of -1 on a node inserted above the body rather than by
// re-mounting the weapon and re-signing every pose channel. Both give a
// right-handed warrior; only one of them is provably the exact mirror of an
// animation system this size. Conjugating a rotation by diag(-1,1,1) leaves the
// X term and negates Y and Z, in any Euler order, which is a sign flip on some
// hundred and forty channels plus the whole cloth solve, and one missed sign is
// a shoulder on backwards that nothing in the harness would catch. The scale
// mirrors the pose, the cloak, the shield, the blade trail and the severance
// frame at once, and three.js flips the winding for a negative determinant
// itself (`frontFaceCW` in the renderer), so nothing turns inside out.
//
// It sits UNDER `group` and over `body`: the HUD hangs its nameplate off
// `group`, and a mirrored plate would print the man's name backwards.

/**
 * -1 puts the weapon in the right hand. The default.
 *
 * The store only reads itself out of localStorage once it has a subscriber, and
 * the HUD is normally that subscriber — but a warrior can be built before the
 * HUD mounts, and a left-handed player must not get one frame of a right-handed
 * body. One listener for the module, taken on the first call.
 */
let handWired = false;
function handMirror(): number {
  if (!handWired) {
    handWired = true;
    subscribeHandedness(() => { /* read live, per frame, in `poseWarrior` */ });
  }
  return getHandedness() ? 1 : -1;
}

const _handProbe = new THREE.Vector3();

/**
 * A readback for `tools/cameratest.mjs`, the same shape of hook `audio.ts` hangs
 * on the window for `phonesound`. Local warrior only, so it is one
 * `worldToLocal` a frame and nothing in the game reads it.
 *
 * `weaponSide` is the sword's lateral offset in the warrior's OWN frame, and it
 * is the number worth exporting because it is measured off where the blade
 * actually ended up rather than off the sign of a constant. A body faces local
 * +Z, so his right hand is at -X: negative is right-handed. Asserting on this
 * catches a mirror that was applied to the wrong node, or not applied at all,
 * which asserting on `mirror.scale.x` would not.
 */
function reportHand(rig: WarriorRig, mirrorSign: number): void {
  if (typeof window === "undefined") return;
  rig.weapon.getWorldPosition(_handProbe);
  rig.group.worldToLocal(_handProbe);
  (window as unknown as Record<string, unknown>).__bretwaldaHand = {
    lefty: getHandedness(),
    mirror: mirrorSign,
    weaponSide: _handProbe.x,
    cls: rig.warriorClass,
  };
}

/**
 * Tunic accent per class — the fastest read of who you are fighting.
 *
 * Exported because `tools/teamread.mjs` builds warriors the way this file does
 * and must not keep its own copy of this table: `characters.ts` records the
 * mirrored-definition fault four times, and a harness holding a stale accent
 * would grade a tunic nobody is wearing. It is the accent the REAL rig passes,
 * or it is not a measurement of the game.
 *
 * In a team mode the accent no longer reaches the tunic's hue — see the
 * precedence note in `characters.ts`. It still reaches nothing else, so this
 * table is unchanged and free-for-all is exactly as it was.
 */
export const CLASS_TUNIC: Record<string, number> = {
  huscarl: 0x6a5636,
  warden: 0x5a6630,
  runekeeper: 0x3d3a5c,
  berserker: 0x6e2b26,
};

export interface RigPivots {
  rightArm: THREE.Group;
  leftArm: THREE.Group;
  rightLeg: THREE.Group;
  leftLeg: THREE.Group;
  head: THREE.Group;
  /**
   * Everything above the belt, inserted by this module. The character builder
   * hangs torso, arms, head and cloak off one root beside the legs, so without
   * this node the hips and the shoulders can only ever turn together — and a
   * body whose shoulders cannot lead its hips has no torque in it.
   */
  chest: THREE.Group;
  /**
   * The joints the silhouette promises and the skeleton did not have, inserted
   * by `articulate`. `characters.ts` models a knee bulge and an elbow flare as
   * volume, but emits each limb as one merged shell from hip to sole and
   * shoulder to fist — so a limb could only ever swing as one stick. Nothing
   * could load onto a bent front leg and no swing could coil, which is most of
   * why brawl and stance came back pose-for-pose identical between iterations.
   *
   * Both are hinges and both are driven on X alone. A knee that can also twist
   * is how a leg ends up inside out.
   */
  elbowR: THREE.Bone;
  elbowL: THREE.Bone;
  /**
   * The fist, so it can turn with what it is holding.
   *
   * Every carry angle in this file is written onto the *weapon*, which hangs
   * inside a hand the builder baked at one grip pitch — so a rest carry 77° off
   * that pitch left the haft running across the circle the fingers close on
   * instead of through it, and the axe read as floating beside the man rather
   * than carried by him. The bone sits at the mount in the mount's own frame:
   * give it the pitch and roll the weapon got and the hand arrives with it.
   *
   * Driven on X and Z only. A hand that can also yaw against its forearm is a
   * broken arm, and the weapon has no yaw term to give it either.
   */
  wristR: THREE.Bone;
  wristL: THREE.Bone;
  kneeR: THREE.Bone;
  kneeL: THREE.Bone;
  cloak?: THREE.Group;
  /**
   * The cloak, cut by `hangCloak` into a yoke and three lateral columns of two
   * rings each. Undefined when the warrior wears no cloak.
   *
   * The pivot above stays at identity from here on. Rotating it was the whole of
   * the old cloak "animation", and rotating a 200°-of-arc shell about the
   * shoulder line is what put a flat plate out sideways in every capture: the
   * hem and the yoke travelled the same angle, so nothing in the shape could
   * ever say which end was attached to a man.
   *
   * A single chain down the body axis fixed half of that and could not fix the
   * rest, and the reason is geometric rather than a matter of tuning: linear
   * blend skinning on one Y-chain can only *rotate* the hem, so the cloak keeps
   * its cut radius whatever it does, and both wings are driven by one bone so
   * they can only move together. A cone that pitches is still a cone. The chain
   * is therefore split across the cloth as well as down it — see `DRAPE_COLS`.
   */
  drape?: THREE.Bone[];
  /**
   * Where each column of cloth hangs, in the yoke's own frame. The turn terms in
   * the solve are `ω × r`, so a column that does not know its own `r` cannot
   * tell a swirl from a sideways lurch.
   */
  drapeAt?: Array<{ x: number; z: number }>;
}

export interface WarriorRig {
  readonly id: string;
  readonly warriorClass: WarriorClass;
  /**
   * World transform: position and facing only. The pose never touches it, so
   * the nameplate and health bar the HUD hangs here stay level and at a fixed
   * height while the body underneath leans, drops and falls over.
   */
  readonly group: THREE.Group;
  /**
   * Handedness, as a lateral mirror between `group` and `body`. Carries no pose
   * and no position — its only job is `scale.x`, and `poseWarrior` writes it
   * every frame so the toggle lands mid-match on every warrior at once rather
   * than on the next man to be rebuilt.
   */
  readonly mirror: THREE.Group;
  /** The character itself, under `mirror`. Carries the whole pose. */
  readonly body: THREE.Group;
  readonly pivots: RigPivots;
  readonly weapon: THREE.Group;
  /** The runekeeper's second seax, posed as a mirror of the main hand. */
  readonly offhand?: THREE.Group;
  readonly shield?: THREE.Group;
  /** Distance from fist to weapon tip, measured once. Where trails are emitted. */
  readonly reach: number;
  /**
   * Where the off fist sits in the forearm bone's frame. The huscarl's shield is
   * hung off this rather than off a tuned constant — see `SHIELD_GRIP_Z`.
   */
  readonly offGrip: THREE.Vector3;
  /**
   * The pitch the character builder bakes into the fist, measured off the mount
   * rather than shared as a constant. `applyPose` needs it to turn an absolute
   * blade aim into a wrist angle, and a stale copy of it here would silently
   * mis-aim every strike in the game the day the grip moves.
   */
  readonly gripPitch: number;
  /**
   * Height of the crown above the rig origin, weapon excluded. The HUD hangs
   * its plate off this rather than off a constant, so a change to character
   * proportion moves the nameplates with it instead of leaving them floating.
   */
  readonly headTop: number;
  /**
   * Fake ground contact. Stays until real contact shadows land, at which point
   * this is the thing to delete.
   */
  readonly blob: THREE.Mesh;
  /**
   * One skeleton for the whole warrior — eight bones, an upper and a lower for
   * each limb. Per-limb skeletons would work and would cost eight bone textures
   * a man instead of one.
   */
  readonly skeleton: THREE.Skeleton;
  /** The pose applied last frame. Where a state change is blended out of. */
  readonly last: Pose;
  /**
   * What this body has lost and where the piece went. Written only by the
   * Dismemberment section below; a warrior who has never died carries an empty
   * one and costs nothing for it.
   */
  readonly gore: Gore;
  dispose(): void;
}

/**
 * One authoritative state off the wire, stamped with the moment on the client's
 * own render clock that it is treated as belonging to.
 *
 * `t` is NOT simply the frame the packet was noticed on. A 20 Hz wire sampled by
 * a 60 Hz frame clock can only be observed to a frame's precision, and feeding
 * that quantised arrival straight into the interpolator puts a ±8 ms wobble on
 * every segment — which is judder again, just smaller. `t` is placed on a
 * regular grid derived from the measured packet period and only pulled toward
 * the observed arrival when it drifts further than a frame away. See `ingestNet`.
 */
export interface NetSnapshot {
  /** Client render-clock seconds this state belongs to. */
  t: number;
  x: number;
  z: number;
  /**
   * Yaw unwrapped to be continuous with the previous snapshot, so a plain
   * linear lerp between two snapshots always takes the short way round and a
   * man crossing ±π does not spin the long way.
   */
  yaw: number;
  /** The raw wire rotation, kept only to spot a packet that repeats. */
  yawRaw: number;
}

/** Per-warrior smoothing state — network and animation. Mutated here. */
export interface WarriorMotion {
  /** Smoothed render position — the server position is never used directly. */
  rx: number;
  rz: number;
  yaw: number;

  // ---- network ----
  /**
   * The last few authoritative states, oldest first, as a ring. Rendering reads
   * BETWEEN two of these rather than chasing the newest one, which is the whole
   * of the fix: a linear lerp between two known states over a known interval is
   * even by construction, and no exponential chase ever is.
   */
  net: NetSnapshot[];
  /** Ring write cursor and how many of `net` are live. */
  netHead: number;
  netCount: number;
  /** The client's own render clock, seconds, advanced by dt. Never wall time. */
  netClock: number;
  /** Measured packet period, phase-and-frequency locked to the wire. */
  netInterval: number;
  /** Clock at which the newest packet was noticed. */
  netArrive: number;
  /** How late arrivals have been running lately. Widens the phase window. */
  netJit: number;
  /**
   * The room snapshot count this motion last ingested, from `ctx.wireEpoch`.
   * -1 until the first frame. It is what lets `ingestNet` tell a man the server
   * says is STANDING STILL from a man the server has said nothing about; see
   * the note there.
   */
  netEpoch: number;
  /**
   * Error smoothing. The zero-delay local rig extrapolates, and an
   * extrapolation is a guess: when the next packet disagrees with it the
   * difference has to go somewhere. Applied on the frame it appears it is a
   * visible flick — on a loaded server the measured-wire replay found frames
   * running at 19 u/s and frames running backwards. Carried here instead and
   * bled off over about sixty milliseconds, it becomes a small speed offset
   * nobody can see. `raw*` is the interpolator's own solution and its learned
   * velocity, which is how the unexpected part of a step is told from the
   * expected part; on a clean wire the unexpected part is zero every frame and
   * this whole mechanism costs exactly nothing.
   */
  errX: number; errZ: number; errYaw: number;
  rawX: number; rawZ: number; rawYaw: number;
  rawVx: number; rawVz: number; rawVyaw: number;
  rawPrimed: boolean;
  /** Visual roll into the direction of travel. */
  leanX: number;
  /** Hit impulse, decays to zero; pushes the body away from its attacker. */
  recoil: number;
  /** Seconds since the last blade-trail emission. */
  trailTick: number;

  // ---- gait ----
  /** Stride phase in radians, advanced by distance covered so feet do not slide. */
  stride: number;
  /** Footfall impulse, decays; the jolt of catching your own weight. */
  land: number;
  /** Per-warrior phase offset so eight men do not march in lockstep. */
  seed: number;

  // ---- swing ----
  /** 0..1 progress through the current swing, read off the server's timer. */
  swing: number;
  /** Length of the swing in flight, learned from the timer the server sends. */
  swingDur: number;
  /** Last attackTimer seen, to spot a new swing. */
  swingPrev: number;
  /** Seconds since that timer last moved — how stale the packet under us is. */
  swingHold: number;
  /** 0..1 blend toward the heavy-attack read: bigger arc, worse recovery. */
  heavy: number;

  // ---- reactions ----
  /** Flinch envelope, 1 at the moment of the blow. */
  flinch: number;
  /** Direction of the last blow in body space: +Z forward, +X weapon side. */
  hitFwd: number;
  hitSide: number;
  /**
   * Seconds spent in the current one-shot MOVE (dodge, stagger, shout, death).
   *
   * Per MOVE, and that word is load-bearing — it used to be per "any one-shot
   * at all", and one clock shared by six different animations is how a man
   * killed out of a stagger started his collapse 0.65 s into it. See the note
   * at the assignment in `poseWarrior`.
   */
  actT: number;
  /**
   * `player.state` on the previous frame, RAW — not folded through
   * `POSE_GROUP`. The only thing that reads it is the one exception to
   * "restart the clock when the move changes": a man who dies while he is
   * ALREADY ON THE GROUND is still going down, and `knocked` and `rising` are
   * the same pose group, so the group alone cannot tell those two apart.
   */
  lastRaw: string;
  /**
   * The emote being performed, or null. Client-side only — the server relays
   * the press and keeps the chosen id; the performance itself is this clock.
   * Set through `triggerEmote`, advanced and cleared by `poseWarrior`.
   */
  emote: EmoteId | null;
  /** Seconds into the performance. 0..EMOTE_SECONDS. */
  emoteT: number;
  /** 1 on the frame the server state changed, decaying; crossfades the pose. */
  blend: number;
  /** The state that blend is coming out of. */
  lastState: string;
  /** Which way the corpse goes over; decided once, at the moment of death. */
  fall: number;
  /**
   * Whether the killing blow's bearing has been taken yet.
   *
   * Every other blow is latched off the rise in `recoil`, which the orchestrator
   * raises after this function has already run — so the edge is only seen on the
   * frame after the blow. That is a frame late and nobody could tell, except for
   * the one blow where it matters: the packet that empties the health bar is the
   * same packet that says `dead`, so a death reading `hitFwd` was reading the
   * *previous* hit's bearing, or the spawn default if there wasn't one. The
   * corpse fell the wrong way for it, and now the limb would leave the wrong way
   * too. Death takes its bearing from the attacker directly instead.
   */
  struckDead: boolean;

  // ---- layer weights ----
  wMove: number;
  wBlock: number;
  wAction: number;

  // ---- cloth ----
  /**
   * What the cloak is actually being dragged through: the body's own world
   * velocity and acceleration, and how fast it is turning. Differentiated off
   * the *smoothed* render position rather than off `player.velocity`, so a
   * knockback and the network's own extrapolation move the cloth too — and then
   * low-passed, because a 20 Hz wire under a 60 Hz frame differentiates into a
   * step train, and cloth driven off that flutters at the packet rate.
   */
  vx: number; vz: number;
  ax: number; az: number;
  yawRate: number;
  pxPrev: number; pzPrev: number; yawPrev: number;
  /**
   * The cloak's own state: swing angle and angular velocity per bone, fore/aft
   * (`X`, positive throws the hem back) and lateral (`Z`, positive throws it to
   * the weapon side). Bone 0 is the yoke; the rest are column-major in
   * `DRAPE_COLS` order, two rings apiece.
   */
  drapeX: number[]; drapeXv: number[];
  drapeZ: number[]; drapeZv: number[];
  /** False until the cloak has been placed once, so a spawn hangs already settled. */
  draped: boolean;
}

export interface AnimHooks {
  /** A blade is mid-arc at this world position. */
  onBladeTrail?(position: THREE.Vector3, cls: WarriorClass, strike: number): void;
  /**
   * Ground height under a world point — `WorldHandle.heightAt`, the same field
   * the terrain was built from and the one `vfx.ts` already places its decals
   * with. Severed limbs land on it rather than on y = 0.
   *
   * Optional because nothing hands this module a world handle: `FrameContext`
   * carries the camera, the clock and the quality tier and not the arena, so
   * without it the fallback is a raycast against the terrain mesh found in the
   * scene — see `probeGround`, which is correct but pays for a lookup that
   * should be arithmetic. Wiring this up is the one-line fix.
   */
  groundAt?(x: number, z: number): number;
  /**
   * A limb has just come off, on the frame it separated. Blood belongs to
   * `vfx.ts` and none is emitted here; the severance carries everything an
   * emitter needs — `wound` and `spray` for the burst, `stump` to follow the
   * body as it falls onto it, `radius` for how wide.
   */
  onSever?(cut: Severance, victim: GamePlayer): void;
}

export function createMotion(p: GamePlayer): WarriorMotion {
  return {
    rx: p.position.x, rz: p.position.z, yaw: p.rotation,
    net: Array.from({ length: SNAP_KEEP }, () => ({ t: 0, x: 0, z: 0, yaw: 0, yawRaw: 0 })),
    netHead: 0, netCount: 0, netClock: 0,
    netInterval: NET_INTERVAL_GUESS, netArrive: 0, netJit: 0, netEpoch: -1,
    errX: 0, errZ: 0, errYaw: 0,
    rawX: p.position.x, rawZ: p.position.z, rawYaw: p.rotation,
    rawVx: 0, rawVz: 0, rawVyaw: 0, rawPrimed: false,
    leanX: 0, recoil: 0, trailTick: 0,
    stride: hash01(p.id) * Math.PI * 2, land: 0, seed: hash01(p.id + "s") * 6.28,
    swing: 0, swingDur: WARRIOR_STATS[p.warriorClass]?.attackSpeed ?? 0.6,
    swingPrev: 0, swingHold: 0, heavy: 0,
    flinch: 0, hitFwd: -1, hitSide: 0, actT: 0, blend: 0, lastState: "", lastRaw: "", fall: -1,
    emote: null, emoteT: 0,
    struckDead: false,
    wMove: 0, wBlock: 0, wAction: 0,
    vx: 0, vz: 0, ax: 0, az: 0, yawRate: 0,
    pxPrev: p.position.x, pzPrev: p.position.z, yawPrev: p.rotation,
    drapeX: new Array<number>(DRAPE_BONES).fill(0),
    drapeXv: new Array<number>(DRAPE_BONES).fill(0),
    drapeZ: new Array<number>(DRAPE_BONES).fill(0),
    drapeZv: new Array<number>(DRAPE_BONES).fill(0),
    draped: false,
  };
}

/**
 * The side a warrior is built in.
 *
 * Narrowed rather than cast. `GamePlayer.team` is the wire's `Team`, which is
 * the same three strings, but a rig is drawn from whatever arrives on a socket
 * and an unknown value has to build SOMETHING. Falling through to `"none"`
 * means a bad or missing team costs a team colour; casting would mean it costs
 * an exception in the middle of a spawn.
 */
function teamOf(player: GamePlayer): TeamSide {
  const t = (player as GamePlayer & { team?: string }).team;
  return t === "red" || t === "blue" ? t : "none";
}

export function createWarriorRig(
  parent: THREE.Object3D,
  player: GamePlayer,
  materials: MaterialLibrary,
  settings: QualitySettings,
): WarriorRig {
  const cls = player.warriorClass as WarriorClass;
  const ap: Appearance = (player as GamePlayer & { appearance?: Appearance }).appearance ?? defaultAppearance(cls);
  // The tier reaches the builder here and nowhere else: characters.ts decides
  // its own tessellation and layer count from it, which is where a phone gets
  // its draw-call cut without losing a silhouette.
  //
  // The face seed is passed rather than left to the builder's build-order
  // fallback because a face has to survive a rebuild: a rig is disposed and
  // rebuilt whenever a player's appearance changes mid-match, and the fallback
  // handed him a different skull and a different complexion every time — the man
  // you were fighting became a different man for putting a helmet on.
  // See `faceIdentity` for why this is an interned integer and not a hash.
  //
  // THE SIDE COMES OFF THE PLAYER AND NOT OFF HIS APPEARANCE, and the read is
  // the whole of the plumbing for BACKLOG 4.5. `player.team` is replicated sim
  // state — `engine.mjs` validates `select_team` against `TEAMS`, only offers
  // the picker in `war_band`, and `placeForRound` assigns a side to anyone who
  // never chose one, so a man on "none" is a man in a free-for-all. Nothing a
  // client can write reaches this argument, which is the point: a team colour a
  // player could set for himself is not a team colour, it is a cosmetic, and
  // this whole feature exists because a cosmetic must not be able to decide
  // whether a stranger can tell you from the enemy.
  const team = teamOf(player);
  const built = buildCharacter(cls, ap, CLASS_TUNIC[cls] ?? 0x5a4a2c, materials, settings.tier, faceIdentity(player.id), team);
  const body = built.group;

  // Crown height, measured now — before a weapon is in the fist, because the
  // warden's spear stands a metre over his head and the HUD would hang its
  // plate off the spear point. Stature is per class and the builder moves it,
  // so a constant here would silently float or sink every plate in the game the
  // next time a proportion changes.
  const crown = new THREE.Box3().setFromObject(body).max.y;

  // Elbows and knees, before anything is hung off a hand: `articulate` moves the
  // hand mounts onto the forearm, and a weapon mounted first would end up on the
  // shoulder while the fist holding it moved.
  const joints = articulate(built);

  // The hand mounts. Named lookup, not last-child — they hang off the forearm
  // bone now and are no longer the arm pivot's final child.
  const rightHand = handOf(built.rightArm);
  const leftHand = handOf(built.leftArm);

  // Read, not tabled. The mount carries the builder's grip pitch and the blade
  // solve in `applyPose` subtracts it; the fallback is only for a builder that
  // stopped naming the mount, in which case `handOf` has returned a sleeve.
  const gripPitch = rightHand.rotation.x || GRIP_PITCH_FALLBACK;

  const weapon = buildWeaponForClass(cls, materials);
  weapon.name = "weapon";
  rightHand.add(weapon);

  let offhand: THREE.Group | undefined;
  if (cls === "runekeeper") {
    offhand = buildWeaponForClass("runekeeper", materials);
    offhand.scale.setScalar(0.9);
    leftHand.add(offhand);
  }

  // Where the off fist actually is, in the forearm bone's frame. `articulate` has
  // already moved the mount onto that bone, so this is read and not derived.
  const offGrip = leftHand.position.clone();

  let shield: THREE.Group | undefined;
  if (cls === "huscarl") {
    // Hung on the forearm bone but positioned at the *grip*, which is the whole
    // of the fix: this is a centre-grip shield — one bar behind the boss, no
    // forearm straps — so the fist belongs at the boss and the disc belongs
    // around the fist. The old mount put the boss 300 mm above the fist and
    // 230 mm outboard of it, which is a man holding a shield by its bottom rim
    // at arm's length, and is what threw the disc into the frame edge.
    //
    // Still the forearm bone and not the hand mount, for two reasons: the hand
    // mount carries the grip pitch every weapon is tuned against, and the brace
    // in `blockLayer` is an elbow — the elbow is what puts a shield in front of
    // a face. `applyPose` writes the position every frame; see `SHIELD_GRIP_Z`.
    //
    // Re-measured on the built rig at rest rather than taken on trust: the off
    // fist sits at (-2.7, +0.6, +39.9) mm from the shield's origin on a disc that
    // spans ±402 mm in both axes, i.e. dead centre laterally and exactly the
    // 40 mm of grip-bar standoff, against the 260 mm of rise the old entry
    // recorded. The last line here used to read "the note in `characters.ts` is
    // stale" — it is not, and has not been since `buildShield`'s doc comment was
    // rewritten to carry these same three numbers. A comment asserting another
    // file is wrong is worth exactly as much as a comment asserting a value, and
    // this one had gone the same way: see `docs/PROCESS.md` R7.
    //
    // "Shield colours on huscarl should match armour finish I think."
    //
    // The third argument is the whole of that. It carries the finish the man
    // bought so the shield's boss, its rivets and its rim clamps come out of the
    // same smithy as his mail — see `buildShield`, which also says why the BOARDS
    // deliberately do not follow it.
    //
    // THE BOARD RULE HAS MOVED. It used to be two literals right here, with a
    // note saying this was "the only place that knows a cloaked huscarl gets the
    // red board". It is `shieldBoard` in characters.ts now, for one reason:
    // `tools/teamread.mjs` has to ask what colour a board is and a harness that
    // answers that from its own copy is auditing its own copy. The answer is
    // unchanged for `"none"` — cloaked 0x5c2320, bare 0x6b4226 — and in a war
    // band it is the side's field, because a painted limewood board is the one
    // surface on this warrior where a flat team colour is what the object was
    // actually for.
    // AND THE PEOPLE, ONE RUNG BELOW THE SIDE. The fifth argument is the
    // board's PAINT and its mark; the field it lies on is already the people's
    // because `shieldBoard` chose it. Both are `"none"`-safe and both test the
    // team first, so a war band's board is byte-for-byte the red or blue field
    // `tools/teamread.mjs` measures — a device is a within-side read and must
    // never be able to break a between-side one.
    //
    // `ap` and not a seventh rig argument: a livery is a cosmetic, it rides in
    // the appearance blob with the helm and the cloak, and it is the only thing
    // here a client is allowed to write for itself. See `Appearance.people`.
    const people = peopleOf(ap);
    shield = buildShield(shieldBoard(ap, team, people), materials, ap.armorColor, team, people);
    joints.elbowL.add(shield);
  }

  // Weapon and shield are mounted by now, so one walk covers the whole warrior.
  // Every mesh casts and every mesh receives: a pauldron has to darken the
  // sleeve under it, or layered kit reads as one painted shape.
  //
  // EVERY MESH RECEIVES. THE SHADOW IS CAST BY ONE MERGED PROXY PER BONE.
  //
  // Receiving is a shader lookup and costs nothing per mesh, so the note above
  // holds in full: a pauldron still darkens the sleeve under it. CASTING is what
  // draws a mesh a second time — once more per shadow-casting light, and that
  // count is 1 on `low`, 3 on `medium` and 4 on `high`.
  //
  // Measured with `tools/framecost.mjs` on an eight-man brawl: warriors were
  // **292 of the 352 casters and 227 of the 664 draw calls**, a third of the
  // frame spent drawing men twice.
  //
  // The parts are layered per bone — nine meshes on `rig:torso`, seven on each
  // arm, six on the head. SIBLINGS SHARE A PARENT, so their relative transform
  // is fixed for the life of the rig and one merged geometry in the parent's
  // frame is the exact union of them: the same triangles, so the shadow is
  // unchanged pixel for pixel, self-shadowing included. The proxy casts, the
  // real meshes do not, and 43 casters become one per bone.
  //
  // WHY THE PROXY IS DRAWN AT ALL, since it renders nothing. Two cheaper tricks
  // were tried against the three.js source and BOTH ARE DEAD:
  //   - parking it on another layer — the shadow pass reads
  //     `object.layers.test(camera.layers)` against the MAIN camera, so an
  //     object the camera does not render is not shadowed either;
  //   - `material.visible = false` — that gates the shadow pass as well as the
  //     colour list.
  // So it is a real object with `colorWrite` and `depthWrite` off: one draw call
  // that touches no pixel, against the many it removes.
  //
  // POSITION AND NORMAL, NO UVS — see the note at the merge for why the normal
  // has to be there. About 2 MB of duplicated data a warrior.
  body.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.receiveShadow = settings.shadows;
      o.castShadow = false;
    }
  });
  if (settings.shadows) {
    const byBone = new Map<THREE.Object3D, THREE.Mesh[]>();
    body.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.parent) return;
      const list = byBone.get(o.parent);
      if (list) list.push(o); else byBone.set(o.parent, [o]);
    });
    for (const [bone, group] of byBone) {
      const parts: THREE.BufferGeometry[] = [];
      for (const m of group) {
        const src = m.geometry;
        const pos = src.getAttribute("position");
        if (!pos) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", pos.clone());
        // NORMALS ARE NOT OPTIONAL, and the first cut of this left them out on
        // the reasoning that a depth pass has no use for them. `light.shadow.
        // normalBias` does: it pushes each sample along its own surface normal
        // to keep a curved surface off its own shadow. Stripped, the proxy lost
        // that offset and the ground under a man measured **8.57 luma darker**
        // than the same frame before the change — a shadow that had grown, not
        // a shadow that had gone. With the normals carried it is inside the
        // capture noise. Measured, not reasoned about.
        const nrm = src.getAttribute("normal");
        if (nrm) g.setAttribute("normal", nrm.clone());
        if (src.index) g.setIndex(src.index.clone());
        // Into the BONE's frame, which is the frame the group shares.
        m.updateMatrix();
        g.applyMatrix4(m.matrix);
        parts.push(g);
      }
      if (!parts.length) continue;
      // One mesh means merging buys nothing: cast from it directly and skip the
      // copy, which is most of the memory on a bone that carries a single part.
      if (parts.length === 1) { parts[0].dispose(); group[0].castShadow = true; continue; }
      const merged = mergeGeometries(parts, false);
      for (const g of parts) g.dispose();
      if (!merged) { for (const m of group) m.castShadow = true; continue; }
      const proxy = new THREE.Mesh(merged, SHADOW_PROXY_MATERIAL);
      proxy.name = "rig:shadow";
      proxy.castShadow = true;
      proxy.receiveShadow = false;
      proxy.frustumCulled = false;
      bone.add(proxy);
    }
  }

  // Reach is measured, not tabled: the spear is twice the seax and the blade
  // trail has to leave the tip of whichever one this warrior is holding. Off
  // the geometry rather than off a Box3 of the object, because that one is in
  // world space and would come back with the height of the fist folded in.
  let reach = 0;
  weapon.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    reach = Math.max(reach, o.geometry.boundingBox?.max.y ?? 0);
  });
  if (reach <= 0) reach = 0.9;

  const chest = insertSpine(built);

  const group = new THREE.Group();
  group.name = `warrior:${player.id}`;
  const mirror = new THREE.Group();
  mirror.name = "handedness";
  mirror.scale.x = handMirror();
  mirror.add(body);
  group.add(mirror);

  const blobGeo = new THREE.CircleGeometry(0.6, 20);
  const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false });
  const blob = new THREE.Mesh(blobGeo, blobMat);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.025;
  blob.renderOrder = 1;
  blob.name = "blobShadow";
  // The key light casts a real shadow now, and a painted ellipse under the boots
  // on top of it is two shadows from one body — the exact thing §10 of the bar
  // calls a frame that reads as a bug. It stays built and hidden rather than
  // deleted, because a tier that turns shadow maps off still needs the warrior
  // to look like it is standing on the ground.
  blob.visible = !settings.shadows;

  // Blob first, then body: the blob is transparent and wants to lose ties.
  parent.add(blob);
  parent.add(group);

  const rig: WarriorRig = {
    id: player.id,
    warriorClass: cls,
    group,
    mirror,
    body,
    pivots: {
      rightArm: built.rightArm,
      leftArm: built.leftArm,
      rightLeg: built.rightLeg,
      leftLeg: built.leftLeg,
      head: built.head,
      chest,
      elbowR: joints.elbowR,
      elbowL: joints.elbowL,
      wristR: joints.wristR,
      wristL: joints.wristL,
      kneeR: joints.kneeR,
      kneeL: joints.kneeL,
      cloak: built.cloak,
      drape: joints.drape,
      drapeAt: joints.drapeAt,
    },
    weapon,
    offhand,
    shield,
    reach,
    offGrip,
    gripPitch,
    headTop: crown > 0.5 ? crown : 2.0,
    blob,
    skeleton: joints.skeleton,
    last: { ...ZERO },
    // A severed piece stands in world space at the cut, so it is hung off the
    // node the warrior himself is hung off — the arena root, whose world
    // transform is identity — and never off `group`, which moves and would add
    // its own motion on top of the piece's.
    gore: newGore(built, parent),

    dispose() {
      // Before anything is freed. A severed body is holding pooled geometry
      // through a grafted stump, and the walk below would dispose buffers the
      // character builder's pool still owns and hands to the next death.
      reassemble(rig);
      parent.remove(group);
      parent.remove(blob);
      // Geometry only, and only the body's — the HUD hangs its plates off
      // `group` and their geometry is shared across every warrior in the match.
      // Every material on this body came from the shared library and is still
      // on eight other men; disposing here would take the whole lobby's mail
      // down with one death.
      body.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      // The bone texture is this rig's alone — one 16×16 float target per
      // warrior, and the only GPU resource `articulate` allocates.
      joints.skeleton.dispose();
      blobGeo.dispose();
      blobMat.dispose();
    },
  };
  return rig;
}

// ---------------------------------------------------------------------------
// Joints
//
// The character builder emits each limb as one merged shell — hip to sole,
// shoulder to fist — and models the joint as *volume*: a knee bulge, a calf
// belly, the flare above the wrist. What it does not emit is a node in the
// middle to turn. So the silhouette has promised a knee and an elbow since v1
// and the skeleton has never been able to bend one.
//
// Splitting the mesh at the joint is not open to us and would be wrong anyway:
// that geometry is merged, shared between every warrior wearing the same kit and
// refcounted inside `characters.ts`, and a hard cut through a bulge tears open
// the moment it bends. So each limb is bound to two bones instead and the joint
// is a weight ramp across the vertices — linear blend skinning, two bones and no
// hierarchy, which is about the cheapest thing a vertex shader can be asked to
// do and holds a bent knee together at closeup range.
// ---------------------------------------------------------------------------

// `ELBOW_ALONG` and `KNEE_ALONG` — where the joint sits along the limb, as a
// fraction of the span the rig can actually measure — now come from
// `characters.ts`, which derives them from the proportion table. They were
// literals here for three passes and `KNEE_ALONG` is load-bearing in the reach
// model below, so a stature change would have moved the body and left the
// solver's idea of it behind.

/**
 * The builder's grip pitch, used only when the mount cannot be found. Kept as a
 * number rather than a guess at runtime because a blade solved against zero
 * points straight out of the fist like a lance.
 */
const GRIP_PITCH_FALLBACK = GRIP_PITCH;

/**
 * How far the grip bar stands proud of the shield's own origin, along its face
 * normal. `buildShield` puts the boards at z ≈ 0.05–0.09 and lays the grip bar
 * across the hand-hole at z = 0.04, so this is where a fist closes — measured
 * off that geometry, not chosen.
 */
const SHIELD_GRIP_Z = 0.04;

/**
 * How the disc is aimed, at ease and on guard.
 *
 * A shield is only square to the enemy when there is an enemy. Carried it is
 * bladed, which is both what a man does with eight kilos on one hand and what
 * keeps three quarters of a metre of disc out of the frame's edge. `ready` is
 * what crosses between them, so the shield comes round the moment he is moving,
 * swinging or covering.
 */
/**
 * What a wrist can do to a weapon, as an angle on the weapon's own pitch.
 *
 * Zero is the blade running back along the forearm toward the shoulder and π is
 * the blade in line with it, pointing away — so the useful band sits around π,
 * a little more cocked back than forward, which is the asymmetry a hand has.
 * These bound the solve in `applyPose` and nothing else: the authored carry
 * angles legitimately live outside them, because a spear stood upright against
 * the shoulder is the arm's doing and not the wrist's.
 */
const WRIST_BACK = 1.55;
const WRIST_FWD = 0.75;
/**
 * Where the hand is cut off the forearm, along the fist's own axis and as a
 * fraction of the drop from the wrist station to the grip.
 *
 * A fraction rather than a constant, for the reason `ELBOW_ALONG` is one:
 * stature is per class, and a fixed 45 mm cut lands in the bracer on a short
 * arm and in the palm on a long one. Measured off the built arms by connected
 * component — the fingers and the thumb end 22–26 mm past the mount, the
 * forearm's cap and the bracer's rim begin at 66–75 mm — so a ramp centred at
 * 0.60 of the drop with a 0.25 band lands wholly inside the bare wrist between
 * them on all four classes, with a couple of millimetres to spare at each end.
 */
const WRIST_ALONG = 0.60;
const WRIST_BAND = 0.25;

/** The wrist ramp, resolved onto one arm: a plane, an axis and a bone. */
interface Hand {
  at: THREE.Vector3;
  axis: THREE.Vector3;
  joint: number;
  band: number;
  index: number;
}
/**
 * How low the fist gets through a strike. Measured off the built rig rather
 * than guessed — it runs 0.62 m at the moment of impact on every class, because
 * the body settles onto the blow — and it is deliberately the *low* figure: the
 * clamp it feeds only has to stop a blade going through the turf.
 */
const STRIKE_LOW = 0.52;

const SHIELD_REST_YAW = -0.26;
const SHIELD_GUARD_YAW = 0.14;
/** A shade of top-edge-forward on the carry; the rest of the pitch is solved. */
const SHIELD_LEAN = 0.06;
const SHIELD_ROLL = 0.14;

/**
 * Where the cloak's rings sit and how each behaves.
 *
 * `share` is how much of the hanging angle a ring takes, so the chain reads as a
 * curve rather than a plate; the yoke keeps its cloth against the shoulders
 * while the hem does most of the travelling. `freq` and `damp` are a spring per
 * ring, softening and slowing downward, which is what puts the hem *behind* the
 * shoulders in time as well as in angle — the lag is the tell, not the angle.
 *
 * The hem is deliberately the only underdamped one (ζ = 0.38). It overshoots and
 * comes back, which is the difference between cloth and a hinge; the two above
 * it are near enough critical that a state change cannot set the whole cloak
 * wobbling like a spring toy.
 */
const RINGS = [
  { share: 0.30, freq: 26, damp: 0.72 },
  { share: 0.72, freq: 19, damp: 0.52 },
  { share: 1.00, freq: 14, damp: 0.38 },
] as const;

/**
 * Where the cloth is cut into columns, as a fraction of the shell's own half
 * width: the off wing, the back, the weapon wing.
 *
 * This is the part of the cloak that could not be tuned into existence. One
 * chain on the body axis drives both wings off one bone, so the shell can pitch
 * and roll and never do the two things cloth on a moving man actually does —
 * come *in* under its own weight, and go round a corner one edge at a time. A
 * turn is `ω × r`, and `r` differs in sign across the cloth: the back panel is
 * swept sideways while the two leading edges go fore and aft in opposite
 * directions. That is a swirl, it is most of what tells an eye that a cloak is
 * cloth rather than a plate, and one bone at `r = 0` cannot express any of it.
 *
 * Three and not two, because the gather wants somewhere to gather *to*: the
 * wings draw in toward a back panel that stays where the spine puts it. Three
 * columns of two rings under a shared yoke is seven bones; with the ten the
 * limbs use that is seventeen, and seventeen is four texels past the 8×8 bone
 * target — three.js takes the next power of two and a warrior gets a 16×16.
 * 4 kB of float per man against a fist that turns with what it holds.
 */
const DRAPE_COLS = [-0.62, 0, 0.62] as const;
const DRAPE_RINGS = 2;
const DRAPE_BONES = 1 + DRAPE_COLS.length * DRAPE_RINGS;

interface Articulation {
  elbowR: THREE.Bone;
  elbowL: THREE.Bone;
  wristR: THREE.Bone;
  wristL: THREE.Bone;
  kneeR: THREE.Bone;
  kneeL: THREE.Bone;
  drape?: THREE.Bone[];
  drapeAt?: Array<{ x: number; z: number }>;
  skeleton: THREE.Skeleton;
}

/**
 * Two-bone weights down a limb, computed once per merged geometry.
 *
 * Written onto the geometry and not kept beside it, because that geometry is
 * shared: `characters.ts` merges one arm per loadout and hands it to every
 * warrior wearing that kit. The ramp is a function of the mesh and not of the
 * man, and so are the bone indices — the cache key already encodes which limb
 * this is, so the geometry called `arm1` is the weapon arm on every warrior in
 * the match and can name its bones outright.
 *
 * The early return leans on the same key. It is only safe to skip a geometry we
 * have already weighted because the builder's signature carries the stature step
 * as well as the loadout, so two warriors sharing an arm share its length and
 * therefore its elbow. If that key ever stops covering proportion, this has to
 * key on the joint height instead — a shared arm weighted at somebody else's
 * elbow bends in the middle of the forearm.
 */
function weightLimb(
  geo: THREE.BufferGeometry,
  joint: number,
  band: number,
  upper: number,
  lower: number,
  hand?: Hand,
): void {
  if (geo.hasAttribute("skinIndex")) return;
  const pos = geo.getAttribute("position");
  const n = pos.count;
  const index = new Uint16Array(n * 4);
  const weight = new Float32Array(n * 4);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    // A ramp, not a cut. The builder puts its widest station right on the joint,
    // and a hard split there opens a hole in the knee the first time it bends.
    const t = smooth(clamp01((joint + band - pos.getY(i)) / (band * 2)));
    index[i * 4] = upper;
    index[i * 4 + 1] = lower;
    weight[i * 4] = 1 - t;
    weight[i * 4 + 1] = t;
    if (!hand) continue;
    // The wrist is *not* a height in the arm: the fist is set on the grip axis
    // and reaches back up to the forearm's cap along its own tilted axis, so a
    // horizontal cut at the same station runs through the middle of the palm on
    // one side and past the bracer's rim on the other. Measured on the built
    // arm along this axis, the knuckles end 22–26 mm past the mount and the
    // forearm's cap begins at 66–74 mm; the ramp is placed in that gap so the
    // only thing it splits is the metacarpal wedge, which is what a wrist is.
    const d = v.fromBufferAttribute(pos, i).sub(hand.at).dot(hand.axis);
    const h = smooth(clamp01((hand.joint + hand.band - d) / (hand.band * 2)));
    if (h <= 0) continue;
    // The hand comes off the forearm's share, never off the upper arm's: the
    // two ramps are far enough apart on every stature the builder makes that a
    // vertex is only ever in one of them, and taking it from `lower` keeps the
    // sum at one without a normalise pass.
    index[i * 4 + 2] = hand.index;
    weight[i * 4 + 2] = t * h;
    weight[i * 4 + 1] = t * (1 - h);
  }
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(index, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(weight, 4));
}

/**
 * Grid weights across a cloak — down it by height, across it by which column of
 * cloth the vertex belongs to.
 *
 * Same contract as `weightLimb`: written onto shared geometry, once, and safe to
 * skip a second time because the builder's signature already carries the class
 * and the cloak, which is everything the cut depends on. The bone indices can be
 * named outright for the same reason `weightLimb` names its own — the limb loop
 * always emits the same ten bones before this runs (three per arm, two per leg),
 * so the yoke is always bone 10 whichever warrior is wearing it.
 *
 * Four influences is the whole budget a `skinIndex` has, and the partition is
 * built to land inside it exactly: at most two adjacent rings by height and at
 * most two adjacent columns across, never more. Both handovers are smooth
 * rather than cut, because a hard boundary would crease a shell that has no
 * seam there and the cloak is the one garment in the game whose job is to have
 * no creases except the ones it makes itself.
 */
function weightDrape(geo: THREE.BufferGeometry, ring: number, half: number, base: number): void {
  if (geo.hasAttribute("skinIndex")) return;
  const pos = geo.getAttribute("position");
  const n = pos.count;
  const index = new Uint16Array(n * 4);
  const weight = new Float32Array(n * 4);
  const cols = DRAPE_COLS.length;
  // Bone for column `c` at level `r`, the yoke being level −1 and shared.
  const at = (c: number, r: number) => base + 1 + c * DRAPE_RINGS + r;
  for (let i = 0; i < n; i++) {
    // Across: 0 at the off edge, `cols - 1` at the weapon edge. The cut runs
    // sin(a) in x, so x carries the arc's sign everywhere it matters and is
    // cheaper and steadier near the leading edges than an atan2 would be.
    const q = clamp((pos.getX(i) / half + 1) * (cols - 1) * 0.5, 0, cols - 1);
    const col = Math.min(cols - 2, Math.floor(q));
    const g = smooth(q - col);
    // Down: band 0 hands the yoke over to the upper ring, band 1 the upper ring
    // to the hem. Identical in effect to the old three-wide ramp, restated so
    // that only two of the three levels are ever live at once.
    const u = -pos.getY(i) / ring;
    const band = clamp(Math.floor(u - 0.5), 0, DRAPE_RINGS - 1);
    const f = smooth(clamp01(u - 0.5 - band));
    const hi = at(col, band);
    if (band === 0) {
      // The top band spends one slot on the shared yoke and splits the other
      // two between the columns it straddles.
      index[i * 4] = base;
      index[i * 4 + 1] = hi;
      index[i * 4 + 2] = at(col + 1, 0);
      weight[i * 4] = 1 - f;
      weight[i * 4 + 1] = f * (1 - g);
      weight[i * 4 + 2] = f * g;
    } else {
      const lo = at(col, band - 1);
      index[i * 4] = lo;
      index[i * 4 + 1] = at(col + 1, band - 1);
      index[i * 4 + 2] = hi;
      index[i * 4 + 3] = at(col + 1, band);
      weight[i * 4] = (1 - f) * (1 - g);
      weight[i * 4 + 1] = (1 - f) * g;
      weight[i * 4 + 2] = f * (1 - g);
      weight[i * 4 + 3] = f * g;
    }
  }
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(index, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(weight, 4));
}

/**
 * Hangs the cloak off a chain instead of off one rigid node.
 *
 * The drop is measured off the geometry rather than read from the builder,
 * because the builder does not export it and because measuring is the thing
 * that survives the builder changing it — which it does per class, and did once
 * already this iteration.
 */
function hangCloak(
  pivot: THREE.Group,
  base: number,
  bound: Array<{ mesh: THREE.SkinnedMesh; at: THREE.Object3D }>,
): { bones: THREE.Bone[]; at: Array<{ x: number; z: number }> } | undefined {
  let lowest = 0;
  let half = 0;
  let deep = 0;
  for (const child of pivot.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
    const bb = child.geometry.boundingBox;
    if (!bb) continue;
    lowest = Math.min(lowest, bb.min.y);
    half = Math.max(half, bb.max.x, -bb.min.x);
    deep = Math.max(deep, -bb.min.z);
  }
  const drop = -lowest;
  // Nothing worth simulating, and nothing safe to divide by.
  if (drop < 0.3 || half < 0.05) return undefined;

  const ring = drop / (DRAPE_RINGS + 1);
  const bones: THREE.Bone[] = [];
  const at: Array<{ x: number; z: number }> = [];
  const yoke = new THREE.Bone();
  pivot.add(yoke);
  bones.push(yoke);

  for (const col of DRAPE_COLS) {
    // The column hangs where its own cloth does, and the offset is what makes a
    // Z rotation on it a *gather*: turned about a point out at the wing, the
    // panel below swings in toward the spine instead of pivoting on it.
    const ox = col * half;
    // The wings come round to the sides of the body, so they sit at almost no
    // depth while the back panel sits at the cloak's full reach behind. That
    // difference is the whole of the swirl term.
    const oz = -deep * (1 - Math.abs(col)) * 0.8;
    at.push({ x: ox, z: oz });
    let parent: THREE.Object3D = yoke;
    for (let r = 0; r < DRAPE_RINGS; r++) {
      const bone = new THREE.Bone();
      bone.position.set(r === 0 ? ox : 0, -ring, 0);
      parent.add(bone);
      parent = bone;
      bones.push(bone);
    }
  }

  for (const child of pivot.children.slice()) {
    if (!(child instanceof THREE.Mesh)) continue;
    weightDrape(child.geometry, ring, half, base);
    const skinned = new THREE.SkinnedMesh(child.geometry, child.material as THREE.Material);
    skinned.name = child.name;
    // Generous enough to cover the hem at full swing. Left to three, the bind
    // pose is walked once and then cached, and a cloak that has since swung
    // 60° off it pops out at the frame edge.
    skinned.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -drop * 0.5, 0), drop + half);
    pivot.remove(child);
    pivot.add(skinned);
    // Bound against the pivot rather than against a bone. They were the same
    // matrix while the chain was one column standing at the pivot's origin;
    // with the columns offset they are not, and binding against a bone that is
    // 200 mm out would shear the whole shell sideways on the first frame.
    bound.push({ mesh: skinned, at: pivot });
  }
  return { bones, at };
}

/** Cuts an elbow into each arm and a knee into each leg, and binds the skin. */
function articulate(built: BuiltCharacter): Articulation {
  // Measured off the rig rather than tabled: the fist mount is where the arm
  // ends, and the hip pivot's own height is the length of the leg.
  const gripR = handOf(built.rightArm).position.y;
  const gripL = handOf(built.leftArm).position.y;
  const legLen = built.leftLeg.position.y || 1.02;

  // Order fixes the bone indices, and the indices are baked into shared
  // geometry — weapon arm, off arm, weapon leg, off leg, upper before lower,
  // and an arm's wrist after its own forearm. Arms emit three bones, legs two.
  const limbs = [
    { pivot: built.rightArm, joint: gripR * ELBOW_ALONG, band: 0.055, span: Math.abs(gripR) + 0.24, grip: gripR },
    { pivot: built.leftArm, joint: gripL * ELBOW_ALONG, band: 0.055, span: Math.abs(gripL) + 0.24, grip: gripL },
    { pivot: built.rightLeg, joint: -legLen * KNEE_ALONG, band: 0.075, span: legLen + 0.18, grip: 0 },
    { pivot: built.leftLeg, joint: -legLen * KNEE_ALONG, band: 0.075, span: legLen + 0.18, grip: 0 },
  ];

  const bones: THREE.Bone[] = [];
  const wrists: THREE.Bone[] = [];
  const bound: Array<{ mesh: THREE.SkinnedMesh; at: THREE.Object3D }> = [];

  limbs.forEach((limb) => {
    const upper = new THREE.Bone();
    const lower = new THREE.Bone();
    lower.position.y = limb.joint;
    upper.add(lower);
    // The upper bone sits at the pivot with an identity transform, so the
    // geometry's own space *is* its space and the bind matrix below is just the
    // pivot's world matrix. Cheaper to reason about than an offset chain.
    limb.pivot.add(upper);
    const iUpper = bones.length;
    bones.push(upper, lower);

    // The wrist. It exists so the fist can turn with what it is holding: every
    // carry angle is written onto the weapon *inside* a hand baked at the
    // builder's grip pitch, so at rest the haft ran 77° across the circle the
    // fingers close on — a hand curling on air beside a floating axe. The bone
    // sits at the mount, in the mount's own frame, so the same `(pitch, 0, roll)`
    // the weapon is given lands the hand on it exactly.
    let hand: Hand | undefined;
    if (limb.grip) {
      // Emitted for both arms whether the mount was found or not: the bone
      // indices below are baked into shared geometry, so a rig that skipped one
      // would weight the next warrior's forearm to somebody's knee.
      const mount = limb.pivot.getObjectByName("handMount");
      const pitch = mount?.rotation.x || GRIP_PITCH_FALLBACK;
      const at = mount ? mount.position.clone() : new THREE.Vector3(0, limb.grip, 0);
      const wrist = new THREE.Bone();
      wrist.position.set(at.x, at.y - limb.joint, at.z);
      wrist.rotation.x = pitch;
      lower.add(wrist);
      // Up the forearm from the grip — the mount's own −Z, which is the axis
      // `fistPlacement` builds the hand along.
      const drop = Math.abs(limb.grip) * GRIP_ALONG;
      hand = {
        at,
        axis: new THREE.Vector3(0, Math.sin(pitch), -Math.cos(pitch)),
        joint: drop * WRIST_ALONG,
        band: drop * WRIST_BAND,
        index: bones.length,
      };
      bones.push(wrist);
      wrists.push(wrist);
    }

    for (const child of limb.pivot.children.slice()) {
      if (!(child instanceof THREE.Mesh)) continue;
      weightLimb(child.geometry, limb.joint, limb.band, iUpper, iUpper + 1, hand);
      const skinned = new THREE.SkinnedMesh(child.geometry, child.material as THREE.Material);
      skinned.name = child.name;
      // Culled off the bind pose, written by hand. Left alone, three walks every
      // vertex of the limb through the skeleton the first frame the frustum asks
      // — and then caches the answer, which is wrong the moment the joint moves.
      // One generous sphere per limb costs nothing and never pops.
      skinned.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, limb.joint, 0), limb.span);
      limb.pivot.remove(child);
      limb.pivot.add(skinned);
      bound.push({ mesh: skinned, at: upper });
    }

    // The fist, and whatever is in it, rides the forearm and not the shoulder.
    // Offset by the joint so its position in arm space is exactly unchanged: at
    // rest this reparenting is an identity, and every carry angle tuned against
    // the old rig still lands where it did.
    const mount = limb.pivot.getObjectByName("handMount");
    if (mount) {
      mount.position.y -= limb.joint;
      lower.add(mount);
    }
  });

  // The cloak joins the same skeleton rather than getting one of its own: a
  // second `THREE.Skeleton` is a second bone texture per warrior, and one
  // texture holds the whole man — ten limb bones and seven of cloak.
  const hung = built.cloak ? hangCloak(built.cloak, bones.length, bound) : undefined;
  if (hung) bones.push(...hung.bones);

  // The bind pose. Bone inverses and every mesh's bind matrix are taken at this
  // one instant, which is what lets the skin ignore where the mesh sits in the
  // graph: in `AttachedBindMode` three recomputes `bindMatrixInverse` from the
  // mesh's own world matrix every frame, so the pivot can go on carrying the
  // mesh and only the bones drive the vertices. The body is not in the scene
  // yet and does not need to be — the world transform cancels out of both sides,
  // which is also why `insertSpine` can reparent all of this afterwards without
  // moving a vertex.
  built.group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  for (const b of bound) b.mesh.bind(skeleton, b.at.matrixWorld.clone());

  return {
    elbowR: bones[1], wristR: wrists[0], elbowL: bones[4], wristL: wrists[1],
    kneeR: bones[7], kneeL: bones[9],
    drape: hung?.bones, drapeAt: hung?.at, skeleton,
  };
}

/**
 * Splits the body at the belt so the spine can turn against the hips.
 *
 * Everything the character builder hangs off its root except the two leg
 * pivots moves under one node at belt height, offset to keep its world
 * transform. Selecting by "not a leg" rather than by name is deliberate — the
 * torso arrives as however many merged meshes the substance split produced,
 * and a list of names here would silently drop a belt or a tunic skirt the
 * next time the builder changes.
 */
function insertSpine(built: BuiltCharacter): THREE.Group {
  const root = built.group;
  // Hip height comes from the rig itself rather than a constant, because
  // stature is per class. The belt sits a shade above the hip joint.
  const y = built.leftLeg.position.y * 1.14;
  const chest = new THREE.Group();
  chest.name = "spine";
  chest.position.y = y;

  const legs = [built.leftLeg, built.rightLeg];
  const move = root.children.filter((c) => !legs.some((l) => contains(c, l)));
  for (const c of move) {
    c.position.y -= y;
    chest.add(c);
  }
  root.add(chest);
  return chest;
}

function contains(node: THREE.Object3D, target: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = target; o; o = o.parent) if (o === node) return true;
  return false;
}

/**
 * The grip the builder promises is the arm's final child.
 *
 * The name is now the real lookup and the last-child fallback is only a guard
 * for a builder that stopped naming it: after `articulate` the mount hangs off
 * the forearm bone, and the arm's final child is a skinned sleeve.
 */
function handOf(arm: THREE.Group): THREE.Object3D {
  return arm.getObjectByName("handMount") ?? arm.children[arm.children.length - 1];
}

// ---------------------------------------------------------------------------
// Curves
// ---------------------------------------------------------------------------

function shortestAngle(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const TAU = Math.PI * 2;
/** Onto (−π, π], where 0 is straight up — the branch a weapon swings through. */
const wrapPi = (a: number) => a - TAU * Math.round(a / TAU);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInCubic = (x: number) => x * x * x;
const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
const smooth = (x: number) => x * x * (3 - 2 * x);
const approach = (cur: number, to: number, dt: number, rate: number) => cur + (to - cur) * Math.min(1, dt * rate);

/**
 * Stable per-warrior face identity, as a small *consecutive* integer.
 *
 * `characters.ts` asked for `hash01(player.id)` here, and it accepts a fraction —
 * but taking that literally would have thrown away the thing the seed exists for.
 * Its complexion and iris picks run through a Latin square over the seed, so that
 * every run of four consecutive seeds covers all four complexions; that is what
 * stops eight warriors on one field reading as one man cloned, which was the
 * defect. A hashed float is a fair coin, and a fair coin hands four of eight the
 * same face. So the id is *interned* to 0, 1, 2, … in first-seen order instead:
 * dense enough for the Latin square, and — unlike the builder's own build-order
 * fallback — stable when a rig is disposed and rebuilt, which is what happens
 * every time a player's appearance changes mid-match.
 *
 * Bounded rather than unbounded, because the README's rule is that matches must
 * not leak into each other. Past `FACE_IDS_MAX` distinct warriors in one tab the
 * oldest entries are evicted in insertion order; a player who returns after that
 * gets a new face, and by then he left several matches ago.
 */
const FACE_IDS = new Map<string, number>();
const FACE_IDS_MAX = 256;
function faceIdentity(id: string): number {
  const known = FACE_IDS.get(id);
  if (known !== undefined) return known;
  if (FACE_IDS.size >= FACE_IDS_MAX) {
    // Map iterates in insertion order, so the first key is the oldest.
    for (const stale of FACE_IDS.keys()) { FACE_IDS.delete(stale); break; }
  }
  const next = FACE_SEEN++;
  FACE_IDS.set(id, next);
  return next;
}
let FACE_SEEN = 0;

/** Stable per-warrior 0..1 so captures of the same match lay out the same. */
function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 997) / 997;
}

// ---------------------------------------------------------------------------
// The pose
//
// One scratch record, filled from zero every frame and written to the rig at
// the end. Layers add into it, so a flinch lands on top of a swing instead of
// replacing it, and nothing has to remember to undo the state it left behind.
// ---------------------------------------------------------------------------

interface Pose {
  /** Pelvis, in body space. Forward is +Z; the weapon side is +X. */
  px: number; py: number; pz: number;
  prx: number; pry: number; prz: number;
  /** Spine, above the belt. */
  crx: number; cry: number; crz: number;
  hrx: number; hry: number; hrz: number;
  /** Weapon arm (+X) and off arm (-X), at the shoulder. */
  arx: number; ary: number; arz: number;
  olx: number; oly: number; olz: number;
  /**
   * Elbows. Hinges, so one number each, and negative folds — the same sign as
   * the shoulder, where negative reaches forward. Nothing here compensates the
   * weapon for them except `stanceLayer`, which gives back exactly what it took
   * so the tuned carry angles survive; every action layer lets the elbow move
   * the blade, which is the whole reason to have one.
   */
  arb: number; olb: number;
  /** Hips. Positive x swings the foot back. */
  lrx: number; lrz: number;
  llx: number; llz: number;
  /** Knees. Positive folds the heel back, which is the only way a knee bends. */
  lrb: number; llb: number;
  /** Weapon in the fist: pitch, roll, and slide along its own shaft. */
  wx: number; wz: number; wy: number;
  /**
   * Where the blade is *pointing*, and how much say that has over `wx`.
   *
   * A carry angle is a wrist angle and an attack is not: what a strike has to
   * put somewhere is the blade, and the blade's pitch is the sum of the
   * shoulder, the elbow, the builder's grip pitch and the wrist. Authored as
   * four separate numbers that sum, it went wrong in the one way a sum can —
   * silently. The overhead's shoulder swept −3.44 rad while its elbow gave
   * +1.72 back and the wrist another +0.70, so a blade that should travel most
   * of a half circle travelled 1.0 rad the wrong way, and every one of the four
   * attacks ended with its point higher than it started: measured against the
   * built rig, a huscarl's sword tip stood 2.69 m in the air at the instant of
   * impact. Stating the aim and solving the wrist out of it is the only version
   * of this that cannot drift, because the thing being authored is the thing a
   * viewer is looking at.
   *
   * 0 is straight up, +π/2 level and forward, so an overhead runs negative
   * (cocked back over the shoulder) to positive (buried in front). `waw` is the
   * authority: at 0 the wrist is carried as authored, at 1 it is whatever the
   * aim needs, and the layer weight crossfades between them.
   */
  wa: number; waw: number;
  /** Shield brace, as a delta on how it is carried. */
  sx: number; sy: number; sz: number; sfy: number; sfz: number;
  /**
   * How much the layers want the cloak thrown back, over and above what physics
   * is already doing to it. Not an angle any more: `drapeCloak` folds it into
   * the hanging solve as one more term in the field, so a run's billow adds to
   * the drag that run is already generating instead of overriding it.
   */
  cloak: number;
}

const ZERO: Readonly<Pose> = Object.freeze({
  px: 0, py: 0, pz: 0, prx: 0, pry: 0, prz: 0,
  crx: 0, cry: 0, crz: 0, hrx: 0, hry: 0, hrz: 0,
  arx: 0, ary: 0, arz: 0, olx: 0, oly: 0, olz: 0,
  arb: 0, olb: 0,
  lrx: 0, lrz: 0, llx: 0, llz: 0,
  lrb: 0, llb: 0,
  wx: 0, wz: 0, wy: 0,
  wa: 0, waw: 0,
  sx: 0, sy: 0, sz: 0, sfy: 0, sfz: 0,
  cloak: 0,
});

/**
 * States that share a pose. Dropping from a sprint to a walk is a change of
 * cadence, not of posture, and crossfading it would only smear the stride.
 */
const POSE_GROUP: Record<string, string> = {
  walking: "move", running: "move", sprinting: "move", rolling: "dodging",
  // The fall and the get-up are ONE move, not two. The server changes `state`
  // from "knocked" to "rising" halfway through it, and a crossfade fired at
  // that boundary would blend the middle of a man pushing off the ground into
  // the middle of a man lying on it — a hitch in the exact frame the animation
  // exists to sell. One group, one clock, no seam.
  knocked: "down", rising: "down",
};

const P: Pose = { ...ZERO };
const CHANNELS = Object.keys(ZERO) as (keyof Pose)[];
const TIP = new THREE.Vector3();
const GRIP = new THREE.Vector3();

/** How each class carries itself and its weapon when nothing is happening. */
interface Stance {
  /** Fist pitch that puts the weapon where the man would actually rest it. */
  rest: number;
  /** Fist pitch that puts it in line with the arm, for a swing. */
  live: number;
  /** Shoulder width — a berserker does not stand like a runekeeper. */
  spread: number;
  /** How the off arm is carried. */
  guard: number;
  /**
   * Extra knee bend at guard, in radians, beyond what the stance width costs.
   *
   * This used to be a few millimetres pushed straight into the pelvis, because
   * a rig with no knee had nowhere else to put a crouch — and a pelvis shoved
   * down past two straight legs is how the boots ended up in the turf. It is a
   * knee angle now and `settleOnFeet` turns it back into height, which is the
   * right way round.
   *
   * The angles are smaller than a straight conversion of the old millimetres
   * would give, and deliberately: cos is flat near zero, so 15 mm of sink is a
   * third of a radian of knee taken on its own — but the action layers bend the
   * same knee again on top of the guard, and a guard that has already spent the
   * whole crouch leaves a lunge nowhere to go but a squat.
   */
  sink: number;
  /** How much of a thrust's shaft slides through the fist. */
  slide: number;
  /**
   * How much of the shoulder's abduction the wrist gives back, so a haft
   * carried butt-down hangs plumb instead of leaning along the arm.
   *
   * The carry angles are all pitches, taken in the arm's own frame, so a weapon
   * inherits the shoulder's roll whole. `spread + 0.10` of abduction puts the
   * fist outboard of the shoulder — which is what a stance is for — and tips
   * everything standing up out of that fist inboard by the same angle, into the
   * deltoid it just cleared. Gravity does not do that: a haft held butt-down
   * hangs plumb whatever the arm under it is doing, which is the same argument
   * `applyPose` already makes for the shield's pitch.
   *
   * Only the two long hafts want it. A sword or a seax carried point-down leans
   * the *other* way out of the same abduction — the point swings outboard, away
   * from the thigh — and giving that back would walk the tip into his own leg.
   */
  plumb: number;
}

// The grip is pitched forward by ~1.28 rad, so a weapon left at zero sticks
// straight out of the fist like a lance — which is what every warrior in the
// v1 captures is doing. `rest` puts it back where a man would actually carry
// it: the sword point angled down in front, the axe over the shoulder, the
// spear upright with its butt near the ground. The angles are constrained by
// arm length — the fist sits at 0.87 m and a sword is 1.06 m from grip to
// point, so anything past ~50° off vertical drives the tip through the turf.
const STANCE: Record<WarriorClass, Stance> = {
  huscarl: { rest: 0.94, live: 0.10, spread: 0.10, guard: -0.66, sink: 0.13, slide: 0.3, plumb: 0 },
  warden: { rest: -1.24, live: 0.02, spread: 0.05, guard: -0.34, sink: 0.08, slide: 1, plumb: 1 },
  runekeeper: { rest: 1.66, live: 0.14, spread: 0.02, guard: -0.24, sink: 0.06, slide: 0.35, plumb: 0 },
  // -1.35, not -1.78. The shouldered carry was rolled far enough back that the
  // axe head sat *behind* the deltoid and pauldron — measured at `lineup`
  // framing, only 16% of the head's projected area survived, so the weapon read
  // as a bare stick however well the head was modelled. Sweeping the angle, the
  // head breaks clear of the body plane at about -1.35 (91% visible) while its
  // crown still tops out 160 mm below the helm, so this does not re-create the
  // v3 defect where the axe overlapped the skull.
  //
  // What that sweep did not check is that standing the haft up puts it *inside
  // the arm holding it*. Measured on the built rig at rest: the shaft ran 14.8°
  // off vertical and only 10.6° off the forearm, its clearance to the upper arm
  // was 72 mm against a limb thicker than that, and **97 of the axe's 556
  // vertices stood inside the warrior's own surface**, continuously from the
  // wrist at 1.04 m to the shoulder at 1.72 m. The axe did not come out of a
  // fist, it came out of a shoulder — which is what "not holding it properly"
  // looks like from the front, whatever the hand is doing. `plumb` takes it out
  // (97 -> 3, and the three that remain are the fist closing on the grip, which
  // is where every other class sits too).
  //
  // `rest` is deliberately untouched: the pitch is what bought the visibility
  // and the roll is a different axis. Y is still never written — a yaw would
  // move the head without moving the haft off the arm, which is the wrong half
  // of the problem.
  berserker: { rest: -1.35, live: 0.08, spread: 0.15, guard: -0.18, sink: 0.16, slide: 0.3, plumb: 1 },
};

// ---------------------------------------------------------------------------
// Transform — snapshot interpolation
// ---------------------------------------------------------------------------
//
// WHAT THIS REPLACED, AND WHY. The old smoothing was one line: lerp the render
// position a fixed fraction of the way toward the newest packet every frame.
// Two faults, both fatal to smooth motion:
//
//   1. The fraction was per FRAME, not per second. A 120 Hz phone converged
//      twice as fast as a 60 Hz one, so the game's own physics changed with the
//      refresh rate — and the better the hardware, the worse the judder.
//   2. An exponential chase toward a target that only moves every 50 ms takes a
//      geometrically shrinking step on each of the three frames inside a packet
//      interval, then the next packet snaps the target forward and it starts
//      over. At 4.5 u/s and 60 fps that is 4.13 / 11.48 / 6.89 cm per frame
//      where every frame should be 7.50. No value of the constant fixes it; the
//      shape is wrong.
//
// The replacement buffers the last few authoritative states with the time they
// belong to and renders BETWEEN two of them. Linear interpolation between two
// known states across a known interval is exactly even — that is the point —
// and it is framerate-independent because the render time is a clock, not a
// per-frame fraction.
//
// THE LOCAL PLAYER IS NOT GIVEN THE REMOTE TREATMENT. Holding your own warrior
// 75 ms in the past to buy a smooth interpolation would make the controls feel
// worse, which is the opposite of the job. The two honest options are
// client-side prediction reconciled against the server, or a much shorter
// delay. Prediction needs an input sequence number acked by the sim so the
// client knows which of its own inputs the server has already folded in; that
// is a wire change in `input.ts` and `engine.mjs`, neither of which this module
// owns, and a half-built prediction that cannot reconcile is worse than none.
// So the local rig runs at ZERO delay: it is rendered at the newest snapshot
// carried forward along the segment velocity to the present instant. That is
// the same even-steps arithmetic — extrapolating a constant velocity is linear
// in time, and the next packet lands exactly where the extrapolation already
// was, so there is no seam — at zero added latency, and it is never further
// ahead of the server than one packet. THE COST: while the local warrior is
// accelerating or being knocked about, the extrapolation is guessing, and it
// can be up to a packet's worth of motion wrong for a moment. It corrects
// continuously rather than snapping, because the correction rides in through
// the newest snapshot, which is what the extrapolation is anchored on.

/**
 * How many authoritative states are kept per warrior.
 *
 * EIGHT, NOT FOUR, AND THE REASON IS THE OTHER END OF THE BUFFER. Four slots
 * span three packet gaps — 150 ms — and a remote body is drawn 74.7 ms behind
 * the newest of them, so there were only ~75 ms of history in front of the
 * render point. A burst of two queued packets advances the grid 100 ms in one
 * frame, pushes the OLDEST sample past the render time, and `sampleNet` clamps
 * to it: the man is pinned where he was and does not move at all.
 *
 * That was invisible while a still man emitted nothing, because his ring stayed
 * stale and the render point sat comfortably inside it. Confirming still men
 * (see `ingestNet`) fills the ring with genuinely recent history, and the
 * stall it exposed went 1.7% -> 5.0% of warrior-frames.
 *
 * Eight slots span 350 ms, which puts 275 ms in front of the render point —
 * past the 220 ms extrapolation cap and past any burst this wire produces.
 * Measured, three runs: stalls 5.0% -> 0.2 / 0.1 / 0.1% of warrior-frames.
 *
 * Extrapolation is untouched by this constant and the runs say so rather than
 * assuming it: 7.9% at four slots against 19.2 / 7.8 / 8.0% at eight. The
 * first of those three is an outlier and is reported because it was seen —
 * nothing here reaches the head of the grid, which is what decides whether a
 * frame extrapolates, so run-to-run wire quality is the only thing that moved.
 *
 * It is NOT a licence to render further back. `REMOTE_DELAY_PACKETS` is
 * unchanged at 1.5; deeper history is only insurance against the buffer being
 * overrun from the old end.
 *
 * AND EIGHT WAS NOT ENOUGH ONCE THE JITTER TERM WENT ON THE DELAY. Eight slots
 * span 350 ms. The render point moved from 74 ms behind the newest to about 99
 * (see JITTER_DELAY_PACKETS), leaving 250 ms of margin at the old end — and the
 * arrival grid a few hundred lines down tolerates the client clock and the wire
 * parting company by up to 500 ms before it snaps them together. So the margin
 * was HALF the divergence the code already allows, and one run in three fell
 * off the old end and pinned: measured, three paired runs, buffer stalls
 * 0.2 / 0.2 / 0.3% at eight slots against 18.4 / 0.3 / 0.3% at eight slots WITH
 * the jitter term. Fourteen slots span 700 ms, which is past that 500 ms
 * tolerance with room: three runs at fourteen read 0.4 / 0.3 / 0.3%, which is
 * the eight-slot baseline back again with the jitter term kept. Cost is
 * fourteen small records per warrior instead of eight.
 *
 * SO THE STALL WAS A MARGIN AND NOT A TRADE, which is the opposite of what the
 * paragraph above used to say — it said raising the delay trades extrapolation
 * for stalls "the way it always did", and that sentence had been true of every
 * attempt before this one. It is not true when the ring is deep enough to hold
 * the clock tolerance the grid already allows.
 */
const SNAP_KEEP = 14;
/** Assumed wire period until the real one has been measured. 20 Hz. */
const NET_INTERVAL_GUESS = 0.05;
const NET_INTERVAL_MIN = 0.02;
const NET_INTERVAL_MAX = 0.3;
/**
 * How far behind the newest packet a REMOTE body is rendered, in packet
 * intervals. 1.5 is the standard choice and it is chosen, not tuned: the render
 * time then sits between half and one and a half intervals behind the newest
 * snapshot, so there is a packet on each side of it at all times — including
 * the interval in which a packet went missing entirely.
 */
const REMOTE_DELAY_PACKETS = 1.5;
/**
 * HOW MUCH OF THE MEASURED ARRIVAL LATENESS THE BUFFER IS ALLOWED TO ABSORB,
 * as a share of one packet interval. It exists because a FIXED buffer cannot be
 * right on a wire whose jitter is not fixed. It was landed as "the last piece of
 * the owner's JOLTY"; it is not, and the paragraph beginning THE FIRST CLAIM
 * says what happened to that claim and what is left standing.
 *
 * `REMOTE_DELAY_PACKETS * netInterval` is 75 ms. `tools/janktest.mjs` §3 prints
 * that budget against the wire it just measured and, on this box, says outright:
 *
 *     AGAINST THE WIRE: buffer 74.44 ms vs arrival p99 95.90 ms
 *     -> THE JITTER EXCEEDS THE BUFFER by 21.46 ms. It must run dry.
 *
 * And it does: 10.7-19.6% of every remote man's frames were EXTRAPOLATED, which
 * is position invented from a stale velocity and taken back when the next packet
 * lands. That take-back is a step, and the step is what is left of JOLTY.
 *
 * PROVEN WITH THE LEVER BEFORE IT WAS FIXED (R1). `--lever=4` raises the delay
 * to four packets in the served bundle. Remote extrapolation goes to 0.0% on
 * every bot, and the drawn track's >8x speed changes AT THE WIRE'S OWN CADENCE
 * fall from 2.66x the wire's own rate to 1.15x. So the client's share of the
 * residual jolt is this and nothing else. A fixed 4 packets is not the fix — it
 * is 199 ms of render delay, and LAGGY is the same owner's word as JOLTY.
 *
 * `netJit` is already computed a few lines up, for the arrival grid: it is how
 * late arrivals have been running lately, and it DECAYS TO ZERO ON A CLEAN
 * WIRE. So adding it to the delay is exactly zero change on a wire that does
 * not need it, and buys buffer precisely when the wire is late. Capped at half
 * a packet — 25 ms — because it must cover the 21 ms deficit measured above and
 * must not become a licence to render arbitrarily far back.
 *
 * THE FIRST CLAIM MADE FOR THIS LINE IS WITHDRAWN, AND THE REPLACEMENT IS
 * NARROWER. It was landed on a "ratio" column — the drawn track's >8x speed
 * changes at the wire's cadence divided by the wire's own rate — reading
 * 1.28 / 1.03 / 1.30 before against 0.57 / 0.64 / 0.50 after. Two adversaries
 * refuted it. The denominator of that ratio was itself normalised by the man's
 * median DRAWN speed, so the control moved with the treatment; `origin/main`,
 * the build everyone agrees is broken, scored BETTER on it than the branch did;
 * and on a paired same-binary lever the arms did not separate. It was circular.
 * Do not resurrect it.
 *
 * WHAT DOES HOLD, on a measure nothing in the client can flatter: EXTRAPOLATION
 * itself — the share of warrior-frames where render time ran past the newest
 * snapshot and a position had to be invented. Three runs a side on ONE binary,
 * `--lever=1.5` reproducing the old expression exactly:
 *
 *     REMOTE_DELAY_PACKETS alone   extrapolation 17.8  14.2  13.5 %   delay 74.5 ms
 *     + this term, ring at 14                     10.2  10.6   9.6 %   delay 99.5 ms
 *
 * Every run with the term is below every run without it — invented motion cut by
 * about a third, and invented motion is taken back when the next packet lands,
 * which is a step on the screen. Buffer stalls 0.3 / 0.3 / 0.2% against
 * 0.2 / 0.1 / 0.2%, a tenth of a point paid. THE FLOOR IS UNMOVED: the
 * motionless-man drift reads p50 0.01 m on BOTH arms with zero holds over 0.25 m
 * on either, so the "median moved 0.00-0.01 -> 0.05-0.06 m" this comment used to
 * carry was run variance and is deleted rather than defended.
 *
 * THE JOLT FIGURE ITSELF DOES NOT MOVE, and that is not a failure of this line.
 * The same six runs decompose it: of about 2% at 60 Hz, roughly a point is the
 * DIFFERENCING INTERVAL and the rest is in the wire, leaving the client within
 * half a point of zero on every run. See docs/OPEN-DEFECTS.md.
 *
 * THE COST IS 25 ms OF REMOTE RENDER DELAY ON A WIRE THAT IS LATE, and LAGGY is
 * the same owner's word as JOLTY. It is bounded, it is paid only when earned,
 * and this box's wire is worse than a real one — `netJit` decays at 0.985 a
 * packet, so on a clean wire this line is arithmetically the one it replaced.
 */
const JITTER_DELAY_PACKETS = 0.5;
/**
 * The furthest the interpolator will carry a body past its newest snapshot when
 * the buffer runs dry. A lost packet then STRETCHES the motion for a fifth of a
 * second and stops, rather than either freezing on the spot or flying off down
 * a stale velocity vector.
 */
const NET_MAX_EXTRAPOLATE = 0.22;
/** A single-packet jump further than this is a respawn, not a walk. */
const NET_TELEPORT = 6;
/** How fast a carried error bleeds off, per second. ~60 ms to a twentieth. */
const NET_ERR_RATE = 50;
/** The most error the smoother will ever hold, in metres and radians. */
const NET_ERR_MAX = 0.6;
const NET_ERR_MAX_YAW = 0.8;

/** Ring accessor: k = 0 is the oldest live snapshot, k = netCount-1 the newest. */
function snapAt(m: WarriorMotion, k: number): NetSnapshot {
  return m.net[(m.netHead - m.netCount + k + SNAP_KEEP * 2) % SNAP_KEEP];
}

/**
 * Notice a new authoritative state and stamp it.
 *
 * The wire carries no timestamp on a player record, so "is this a new packet"
 * is answered the only way it can be: the state differs from the newest one
 * held. A body that is genuinely motionless therefore stops producing
 * snapshots, which is correct — there is nothing to interpolate — and the gap
 * is picked up as a resync when it starts moving again.
 *
 * THE STAMP IS THE DELICATE PART. The observed arrival is quantised to the
 * frame clock, so it is not used directly. The stamp is placed one measured
 * period after the one before it, and the arrival is only allowed to correct
 * that grid, never to set it. The result is exactly-even segments.
 */
function ingestNet(m: WarriorMotion, p: GamePlayer, dtFrame: number, epoch: number | undefined): boolean {
  const x = p.position.x;
  const z = p.position.z;
  const rawYaw = p.rotation;
  const newest = m.netCount ? snapAt(m, m.netCount - 1) : null;
  // A STILL MAN IS NOT A SILENT WIRE, AND THEY USED TO BE THE SAME BYTES HERE.
  //
  // Comparing the record with the one held is the only way to notice a new
  // packet from a wire that stamps nothing per player — but it answers "did
  // this man move", and the question is "did a packet land". They part company
  // exactly when a man holds position, and that is not a rare case: measured on
  // a 40 s seven-bot fight, a record is byte-identical to the tick before it on
  // 7.9%-69.5% of ticks per man — 99-100% for a corpse, 26-35% for a staggered
  // man, 6-13% for a man mid-swing — with freeze runs reaching 7400 ms.
  //
  // Read as silence, every one of those ticks left the newest stamp where it
  // was while `netClock` ran on, so `sampleNet` fell into its extrapolation
  // branch and carried the body down the last segment velocity it had — up to
  // 3.19 m/s measured on the tick before a freeze — for the full
  // NET_MAX_EXTRAPOLATE. Two thirds of a metre of motion the simulation never
  // had, on a man the server was reporting as motionless, ending in a snap back
  // when the silence finally tripped the buffer reset below. That is the
  // owner's JOLTY and his JUMPY, and they were one defect.
  //
  // `ctx.wireEpoch` is the witness the record cannot be: a snapshot is a
  // whole-room broadcast, so its arrival confirms EVERY man in it, the still
  // ones included. When it has advanced, an unchanged record is an
  // authoritative "he is exactly here" and is ingested as one — placed on the
  // grid like any other packet, with a segment velocity of zero, so the
  // extrapolator has nothing to invent. When it has NOT advanced the wire is
  // genuinely silent and this returns false exactly as it always did, leaving
  // the extrapolator to cover a real hole. That is the distinction, and it is
  // the whole fix.
  //
  // It does NOT replace the slot count below. Epoch delta counts PACKETS; the
  // grid is spaced in sim STEPS, and one wake can ship two steps in one packet
  // (engine.mjs:2203). Different quantities — the long argument below still
  // stands and is untouched.
  //
  // undefined = a caller with no wire at all. `summary.ts` and `armouryStage`
  // pose frozen records, where a still man IS the whole intent, so they keep
  // the original behaviour.
  const confirmed = epoch !== undefined && epoch !== m.netEpoch;
  if (epoch !== undefined) m.netEpoch = epoch;
  if (newest && newest.x === x && newest.z === z && newest.yawRaw === rawYaw && !confirmed) return false;

  const now = m.netClock;
  // A seed, not an observation. All that is known of an arrival is that it fell
  // somewhere in the last frame, so the middle of that window is the best guess
  // the client has and it halves the phase error the lock has to pull in.
  let t = now - dtFrame * 0.5;
  let teleported = false;

  if (newest) {
    const gap = now - m.netArrive;
    teleported = Math.hypot(x - newest.x, z - newest.z) > NET_TELEPORT;
    if (teleported || gap <= 0 || gap > m.netInterval * 8) {
      // A respawn, or a silence long enough that nothing in the buffer is worth
      // interpolating through. Drop it and start the timeline again; the sampler
      // clamps to the oldest snapshot while the buffer refills, so the body
      // appears at its new place at once instead of sliding across the arena.
      m.netCount = 0;
    } else {
      // THE GRID. Every snapshot is placed exactly one measured period after the
      // one before it, so consecutive segments are exactly equal in length and
      // the lerp across them is exactly even. The observed arrival is only ever
      // used to CORRECT that grid, never to set it — arrival can only be known
      // to a frame's precision, and believing a ±8 ms quantisation error would
      // put that wobble straight back on the motion.
      //
      // Correcting it is a phase lock with a frequency term, and the frequency
      // term is not optional. Phase alone would happily hold a wrong period for
      // ever, re-centring the grid every packet and putting a step on the motion
      // every time it did. With it, a systematic error walks the PERIOD onto the
      // true wire rate and the corrections then stop happening at all.
      const prevT = snapAt(m, m.netCount - 1).t;
      // A gap long enough to be more than one period is a dropped packet. It is
      // given a whole number of slots, so the long move is spread over a
      // correspondingly long segment and is drawn at the CORRECT speed — the
      // motion stretches, it does not teleport and it does not sprint.
      const byTiming = gap > m.netInterval * 1.6 + dtFrame
        ? clamp(Math.round(gap / m.netInterval), 2, 8)
        : 1;
      let slots = byTiming;
      // ARRIVAL TIMING IS THE WRONG WITNESS, AND IT IS WRONG IN BOTH DIRECTIONS.
      //
      // The server does not broadcast on a clock; it broadcasts when its wake
      // owes the simulation at least one whole TICK_MS step (engine.mjs:2203).
      // So the amount of TIME a packet carries is always a whole number of sim
      // steps, and the interval between ARRIVALS is the wake period — a
      // different quantity, equal to the step only if the host holds 50.000 ms,
      // which no shared-CPU host does. When the two differ:
      //
      //   wake period SHORT (say 49 ms). Every packet carries one 50 ms step,
      //   so the wake creeps forward until one wake owes nothing, sends
      //   nothing, and the packet after it arrives a double gap later still
      //   carrying ONE step. Timing calls that two slots. The grid then spends
      //   98 ms of segment on 50 ms of walking and the man is drawn at 2.29 u/s.
      //
      //   wake period LONG (say 51 ms). The slip accumulates the other way
      //   until one wake owes TWO steps and ships both in one on-time packet.
      //   Timing calls that one slot, drives 100 ms of walking through 50 ms of
      //   segment, and the man is drawn at 9 u/s.
      //
      // Both are one packet in fifty and both are a whole frame of the man at
      // half or double speed. Measured: a dead-constant 50.5 ms wake period —
      // one part in a hundred off nominal, which is a QUIET box — rippled the
      // local rig 26.1% (4.19..5.37 u/s) with every clean-wire case still at
      // 0.0%. It was read as load noise for three waves because it only ever
      // showed up against a real captured wire.
      //
      // The wire's own velocity is the witness that can tell the two apart: how
      // far the man moved divided by how fast the server says he is going is
      // the time the packet carries, directly, in seconds. `position` is
      // integrated from `moveVel` and `velocity` is reported as the same
      // quantity, so for a man simply running this is exact.
      //
      // It is bounded by timing to plus or minus one slot, and that bound is
      // not ceremony. A knockback impulse moves the man by its own decaying
      // integral rather than by `velocity * dt`, and a stride killed against
      // the palisade spends ground the reported velocity no longer admits to;
      // both make distance-over-speed overstate the time. Timing is a poor
      // witness to WHICH step, but a sound one to roughly HOW MANY.
      const spd = Math.hypot(p.velocity?.x || 0, p.velocity?.z || 0);
      if (spd > 0.5) {
        const carried = Math.hypot(x - newest.x, z - newest.z) / spd;
        slots = clamp(
          clamp(Math.round(carried / m.netInterval), 1, 8),
          Math.max(1, byTiming - 1),
          byTiming + 1,
        );
      }
      t = prevT + m.netInterval * slots;
      // WHAT THE ARRIVAL ACTUALLY TELLS US. Not an instant — a window. A packet
      // is noticed on the first frame that runs after it lands, so all that is
      // known is that it arrived somewhere in the last frame's worth of time.
      // A plain symmetric deadband around `now` is therefore BIASED: the
      // observation is always at or after the truth, never before, so the error
      // it reports has a mean of half a frame and the period estimate creeps
      // upward for ever on it. Comparing against the window instead of against
      // its edge is unbiased, and once the grid is locked the stamp lands inside
      // the window every time and the correction is exactly zero — which is what
      // makes the segments exactly equal.
      // AND WIDER THAN ONE FRAME WHEN THE WIRE IS ROUGH. Under load the
      // engine's wake slips (measured: p95 53 ms, max 58 ms against a nominal
      // 50), so an arrival is the send time plus a latency that VARIES. The
      // grid must lock to the earliest arrivals — the ones that waited least —
      // and simply tolerate the late ones, or every slipped wake yanks it and
      // the yank is the judder. `netJit` is how late arrivals have been running
      // lately; it decays back to nothing on a clean wire, where this widening
      // is exactly zero and the numbers above are unchanged.
      m.netJit = Math.max(m.netJit * 0.985, Math.min(Math.abs(now - t), m.netInterval));
      // AND THE TOLERANCE HAS TO BE TWO-SIDED, for the same reason the slot
      // count does. When the wake period runs SHORT the grid — which advances
      // by content — legitimately runs ahead of the arrivals, by up to one
      // whole step, right up until the skipped wake hands the time back. That
      // is a sawtooth about zero, not a drift: over any fifty packets the two
      // clocks advance by exactly the same amount, because the simulation
      // cannot outrun the wall clock it is stepped against. Clamping the lead
      // side hard at `now` re-imposed the wake period on the grid one packet at
      // a time, and shortened the segment it did it on to 44 ms — which is the
      // 5.09 u/s half of the same 26.1% ripple. A genuine parting of the ways
      // is still caught below, half a second out.
      const lo = now - dtFrame - m.netJit;
      const hi = now + m.netJit;
      const off = t < lo ? t - lo : t > hi ? t - hi : 0;
      if (Math.abs(off) > 0.5) {
        // The client clock and the wire have genuinely parted company; the
        // arrival is the only truth left.
        t = now;
      } else if (off !== 0) {
        t -= off * 0.7;
        // The period is only ever nudged by a SMALL residual. A large offset is
        // a phase error — the grid was seeded a frame away from the wire's own
        // — and correcting a phase error through the frequency is how a lock
        // overshoots: the pull-in drags the period several percent off, the
        // motion runs slow for a second, and it takes as long again to walk
        // back. Big offsets are left to the phase term, which settles in three
        // or four packets on its own.
        if (Math.abs(off) < dtFrame * 0.6) {
          m.netInterval = clamp(m.netInterval - (off / slots) * 0.006, NET_INTERVAL_MIN, NET_INTERVAL_MAX);
        }
      }
    }
  }
  m.netArrive = now;
  const slot = m.net[m.netHead];
  slot.t = t;
  slot.x = x;
  slot.z = z;
  slot.yawRaw = rawYaw;
  slot.yaw = m.netCount ? snapAt(m, m.netCount - 1).yaw + shortestAngle(snapAt(m, m.netCount - 1).yawRaw, rawYaw) : rawYaw;
  m.netHead = (m.netHead + 1) % SNAP_KEEP;
  m.netCount = Math.min(m.netCount + 1, SNAP_KEEP);

  // The unwrapped yaw chain grows without bound on a man who keeps turning the
  // same way. Rebase the whole buffer by whole turns — which preserves both the
  // angles and the differences between them — so it never loses precision.
  const head = snapAt(m, m.netCount - 1);
  if (Math.abs(head.yaw) > 4096) {
    const turns = Math.round(head.yaw / (Math.PI * 2)) * Math.PI * 2;
    for (let k = 0; k < m.netCount; k++) snapAt(m, k).yaw -= turns;
  }
  return teleported;
}

/**
 * Forget the wire. The body is wherever it is now, and nothing before this
 * instant is evidence about where it is going.
 *
 * A caller that TELEPORTS a body — the summary stage carrying men to their
 * marks — has to say so, because the interpolator's whole job is to disbelieve
 * a position that disagrees with the recent past. `ingestNet` catches a jump of
 * more than NET_TELEPORT on its own, but a shorter carry is indistinguishable
 * from a sprint, and the summary is the case where that guess is worst: the
 * staged player record is FROZEN, so exactly one snapshot ever lands at the
 * mark, it sits in the buffer next to the man's death position, and the
 * segment velocity between the two is the whole carry divided by one packet
 * interval — three hundred units a second. The extrapolator then runs that for
 * its full NET_MAX_EXTRAPOLATE and puts the man tens of metres off the mark,
 * frequently behind the lens. Measured: two of three podium men at
 * [7.32, 0, 19.08] and [-3.76, 0, 14.15] with the lens at z=14.49.
 */
export function cutNetHistory(m: WarriorMotion): void {
  m.netCount = 0;
  m.netHead = 0;
  m.netArrive = 0;
  m.netJit = 0;
  m.errX = 0; m.errZ = 0; m.errYaw = 0;
  m.rawVx = 0; m.rawVz = 0; m.rawVyaw = 0;
  m.rawPrimed = false;
}

/**
 * Place the body at render time `rt`. Between two snapshots this is a straight
 * lerp by time — even steps, no chase, no framerate term anywhere. Past the
 * newest it carries on down the last segment's velocity, capped.
 */
function sampleNet(m: WarriorMotion, rt: number, p: GamePlayer): void {
  const n = m.netCount;
  if (n === 0) {
    m.rx = p.position.x;
    m.rz = p.position.z;
    m.yaw = p.rotation;
    return;
  }
  const newest = snapAt(m, n - 1);
  if (rt >= newest.t) {
    // Buffer dry. The segment velocity is preferred over the wire's own
    // `velocity` because it is the derivative of the very positions being
    // interpolated, so the extrapolation continues the drawn line exactly.
    let vx = p.velocity?.x || 0;
    let vz = p.velocity?.z || 0;
    let vy = 0;
    if (n >= 2) {
      const prev = snapAt(m, n - 2);
      const span = newest.t - prev.t;
      if (span > 1e-4) {
        vx = (newest.x - prev.x) / span;
        vz = (newest.z - prev.z) / span;
        vy = (newest.yaw - prev.yaw) / span;
      }
    }
    const ahead = Math.min(rt - newest.t, NET_MAX_EXTRAPOLATE);
    m.rx = newest.x + vx * ahead;
    m.rz = newest.z + vz * ahead;
    m.yaw = newest.yaw + vy * ahead;
    return;
  }
  const oldest = snapAt(m, 0);
  if (rt <= oldest.t) {
    m.rx = oldest.x;
    m.rz = oldest.z;
    m.yaw = oldest.yaw;
    return;
  }
  for (let k = n - 1; k > 0; k--) {
    const a = snapAt(m, k - 1);
    if (rt < a.t) continue;
    const b = snapAt(m, k);
    const span = b.t - a.t;
    const u = span > 1e-6 ? (rt - a.t) / span : 1;
    m.rx = a.x + (b.x - a.x) * u;
    m.rz = a.z + (b.z - a.z) * u;
    m.yaw = a.yaw + (b.yaw - a.yaw) * u;
    return;
  }
}

/**
 * Bleed off the disagreements rather than showing them.
 *
 * `sampleNet` gives the interpolator's best answer for this instant. Between
 * packets on a clean wire that answer moves by exactly the same amount every
 * frame, and everything below reduces to `m.rx = the answer` with no error to
 * carry. It earns its keep on a wire that is NOT clean: when a packet lands and
 * disagrees with what the extrapolation had guessed, the difference is taken
 * into an offset instead of onto the screen, and the offset is bled off over
 * about sixty milliseconds.
 *
 * The unexpected part of a step is what gets absorbed, not the whole step —
 * otherwise the body would simply stop dead every time a packet arrived. The
 * expected part is the interpolator's own learned velocity, which on constant
 * motion is exact, so the residual is zero and nothing is smoothed at all.
 *
 * NOT applied to the knockback push: that is added to the rig AFTER this, and
 * a shove that eased in over sixty milliseconds would not be a shove.
 */
function smoothNetError(m: WarriorMotion, dt: number, teleported: boolean): void {
  if (teleported || !m.rawPrimed || dt <= 1e-4) {
    m.errX = 0; m.errZ = 0; m.errYaw = 0;
    m.rawVx = 0; m.rawVz = 0; m.rawVyaw = 0;
    m.rawX = m.rx; m.rawZ = m.rz; m.rawYaw = m.yaw;
    m.rawPrimed = true;
    return;
  }
  const jx = m.rx - m.rawX - m.rawVx * dt;
  const jz = m.rz - m.rawZ - m.rawVz * dt;
  const jy = shortestAngle(m.rawYaw + m.rawVyaw * dt, m.yaw);
  const kv = Math.min(1, dt * 18);
  m.rawVx += ((m.rx - m.rawX) / dt - m.rawVx) * kv;
  m.rawVz += ((m.rz - m.rawZ) / dt - m.rawVz) * kv;
  m.rawVyaw += (shortestAngle(m.rawYaw, m.yaw) / dt - m.rawVyaw) * kv;
  m.rawX = m.rx; m.rawZ = m.rz; m.rawYaw = m.yaw;

  const keep = Math.exp(-dt * NET_ERR_RATE);
  m.errX = clamp((m.errX - jx) * keep, -NET_ERR_MAX, NET_ERR_MAX);
  m.errZ = clamp((m.errZ - jz) * keep, -NET_ERR_MAX, NET_ERR_MAX);
  m.errYaw = clamp((m.errYaw - jy) * keep, -NET_ERR_MAX_YAW, NET_ERR_MAX_YAW);
  m.rx += m.errX;
  m.rz += m.errZ;
  m.yaw += m.errYaw;
}

/**
 * Moves the rig onto the server's position with snapshot interpolation, and
 * applies the hit-push impulse. Read `rig.group.position` after this and before
 * poseWarrior.
 */
export function stepWarriorTransform(
  rig: WarriorRig,
  motion: WarriorMotion,
  player: GamePlayer,
  dt: number,
  ctx: FrameContext,
  attacker?: GamePlayer,
): void {
  // The client's own render clock. Everything below is timed off this and not
  // off frame counts, which is what makes the motion identical at 30, 60 and
  // 120 fps instead of converging twice as fast on the better phone.
  motion.netClock += Math.max(0, dt);
  const teleported = ingestNet(motion, player, dt > 1e-4 ? dt : 1 / 60, ctx.wireEpoch);
  // Local: zero delay, carried forward to the present instant. Remote: rendered
  // 1.5 packet intervals back so there is always a snapshot on each side, PLUS
  // however late this wire has actually been running, bounded. See
  // JITTER_DELAY_PACKETS — on a clean wire `netJit` is zero and this line is the
  // one it replaces, exactly. See the section header for why local and remote
  // are not the same problem.
  const delay = player.id === ctx.localId
    ? 0
    : REMOTE_DELAY_PACKETS * motion.netInterval +
      Math.min(motion.netJit, JITTER_DELAY_PACKETS * motion.netInterval);
  sampleNet(motion, motion.netClock - delay, player);
  smoothNetError(motion, dt, teleported);

  // The orchestrator raises recoil on the frame damage lands. A rise is the
  // only edge we get for "struck just now" — the wire has no hit event on the
  // player record — so the flinch is triggered off it and the blow's bearing
  // is latched at the same moment, before the attacker walks away from it.
  const decayed = Math.max(0, motion.recoil - dt * 3.2);
  if (motion.recoil > decayed + 0.04) {
    motion.flinch = 1;
    if (attacker) takeBearing(motion, attacker);
  }
  motion.recoil = decayed;
  motion.flinch = Math.max(0, motion.flinch - dt * 4.2);

  // The killing blow, which the edge above is structurally a frame too late to
  // catch — see `struckDead`. Taken here rather than in the pose because this is
  // where the attacker is in scope, and it runs before the pose in the frame, so
  // the collapse and the limb that leaves both read a bearing from this blow.
  if (player.state !== "dead") motion.struckDead = false;
  else if (!motion.struckDead) {
    motion.struckDead = true;
    if (attacker) takeBearing(motion, attacker);
  }

  // Shoved away from whoever last landed a blow. Note this offsets the body
  // from the server-authoritative position by up to ~0.8m for half a second,
  // and it mixes a smoothed position with the attacker's raw one.
  let pushX = 0;
  let pushZ = 0;
  if (attacker) {
    const ang = Math.atan2(motion.rx - attacker.position.x, motion.rz - attacker.position.z);
    pushX = Math.sin(ang) * motion.recoil * 0.5;
    pushZ = Math.cos(ang) * motion.recoil * 0.5;
  }

  rig.group.position.x = motion.rx + pushX;
  rig.group.position.z = motion.rz + pushZ;
  // Yaw came off the same two snapshots, interpolated the short way round by
  // `sampleNet`. It used to ease toward the raw wire rotation at `dt * 14`,
  // which was framerate-correct but still an exponential chase after a target
  // that only moves every 50 ms — 145.6% ripple and 53 ms behind. A camera turn
  // is where a player sees this first.
  rig.group.rotation.y = motion.yaw;

  rig.blob.position.x = rig.group.position.x;
  rig.blob.position.z = rig.group.position.z;

  // A respawn moves the body the width of the arena in one packet. The cloth
  // below differentiates the render position to find out what it is being
  // dragged through, so without this the teleport reads as a 200 u/s gust and
  // the cloak snaps out flat. The rig is already at its new place; only the
  // derivative history has to be told nothing happened.
  if (teleported) {
    motion.pxPrev = rig.group.position.x;
    motion.pzPrev = rig.group.position.z;
    motion.yawPrev = motion.yaw;
    motion.vx = 0; motion.vz = 0; motion.ax = 0; motion.az = 0; motion.yawRate = 0;
  }

  // What the cloth is being dragged through. Differentiated here rather than in
  // the pose because this is the only place that knows where the body finally
  // ended up — the push, the extrapolation and the smoothing are all in it, and
  // a cloak that ignores a knockback is a cloak nailed to a mannequin.
  if (dt > 1e-4) {
    const rawX = (rig.group.position.x - motion.pxPrev) / dt;
    const rawZ = (rig.group.position.z - motion.pzPrev) / dt;
    const prevX = motion.vx;
    const prevZ = motion.vz;
    const kv = Math.min(1, dt * 12);
    motion.vx += (rawX - motion.vx) * kv;
    motion.vz += (rawZ - motion.vz) * kv;
    // Acceleration off the smoothed velocity, then smoothed again and clamped.
    // Two differentiations of a lerped position is a noisy quantity by
    // construction; the clamp is what stops one late packet throwing the cloak
    // over the warrior's head.
    const ka = Math.min(1, dt * 8);
    motion.ax += (clamp((motion.vx - prevX) / dt, -28, 28) - motion.ax) * ka;
    motion.az += (clamp((motion.vz - prevZ) / dt, -28, 28) - motion.az) * ka;
    motion.yawRate += (clamp(shortestAngle(motion.yawPrev, motion.yaw) / dt, -9, 9) - motion.yawRate) * Math.min(1, dt * 10);
  }
  motion.pxPrev = rig.group.position.x;
  motion.pzPrev = rig.group.position.z;
  motion.yawPrev = motion.yaw;
}

/**
 * Which way the blow pushed, in body space: +Z is where the warrior is facing,
 * +X is his weapon side. It is the line from the attacker to the target, so a
 * blow from behind reads +Z and puts the man on his face.
 */
function takeBearing(motion: WarriorMotion, attacker: GamePlayer): void {
  const dx = motion.rx - attacker.position.x;
  const dz = motion.rz - attacker.position.z;
  const len = Math.hypot(dx, dz) || 1;
  const c = Math.cos(-motion.yaw);
  const s = Math.sin(-motion.yaw);
  motion.hitSide = (dx * c - dz * s) / len;
  motion.hitFwd = (dx * s + dz * c) / len;
}

// ---------------------------------------------------------------------------
// The swing
// ---------------------------------------------------------------------------

/**
 * Where the coil ends and where the blade is fully through the target, as
 * fractions of the whole stroke — and they are NOT numbers this file picks any
 * more. They are the server's own phase boundaries.
 *
 * `SWING_PHASES` is windup 0.40 / contact 0.15 / recovery 0.45 and the sim
 * resolves the blow the step it crosses out of the windup. This file used to
 * load until 0.34 and reach the target at 0.64, which put the damage a fifth of
 * the way into the release: the man took the hit while the axe was still coming
 * round, and every blow read as passing through him because it literally did.
 * Coil is the windup, the pass is the contact window, the settle is the
 * recovery — one clock, three phases, and the sim owns all three.
 */
const LOAD_END = SWING_PHASES.windup;                          // 0.40
const IMPACT = SWING_PHASES.windup + SWING_PHASES.contact;     // 0.55

/**
 * The end of a chain: slow off the load, explosive through the middle, a little
 * past the target and back. A plain ease-out is the wrong shape here — it is
 * fastest on the first frame, which is a blade that was never wound up.
 */
const whipOut = (x: number) => easeOutBack(Math.pow(x, 1.9));

/**
 * One link of the kinetic chain, read at its own place in the swing.
 *
 * `k` is the angle at full load, at impact, and at rest. `lead` shifts the link
 * forward or back in the swing: the hips arrive first, then the spine, then the
 * shoulder, and the blade last. That offset is the whole trick — every link
 * running on the same clock is what makes an arm look like it is swinging a
 * stick rather than a body swinging a weapon.
 */
function link(ph: number, lead: number, k: readonly [number, number, number], whip: boolean): number {
  const q = clamp01(ph + lead);
  const load = easeOutCubic(clamp01(q / LOAD_END));
  const rel = clamp01((q - LOAD_END) / (IMPACT - LOAD_END));
  const set = smooth(clamp01((q - IMPACT) / (1 - IMPACT)));
  let v = k[0] * load;
  v = mix(v, k[1], whip ? whipOut(rel) : easeOutCubic(rel));
  return mix(v, k[2], set);
}

type Key = readonly [number, number, number];

interface Swing {
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
// Sign conventions: arm x negative reaches forward, leg x positive swings the
// foot back, spine y positive turns the weapon shoulder away from the target.
const SWINGS: Record<string, Swing> = {
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

/**
 * How long a packet is allowed to be merely late before it is treated as held.
 * A shade under two server ticks.
 */
const TICK = 0.09;

/**
 * Reads the swing clock off the server's attackTimer.
 *
 * The timer counts down from the length of the swing and it is the whole clock:
 * phase is `(dur - attackTimer) / dur`, evaluated fresh every frame from the
 * value on the wire. The server still owns the timing; nothing here leads it,
 * learns it, or lags behind it.
 *
 * That is a change, and it is the change that unblocks visual review. What was
 * here before only trusted the timer once it had *watched* it tick down across
 * two frames, and smoothed the phase toward the answer over about a tenth of a
 * second on top. Neither survives a still: the photo harness holds one frozen
 * frame, so the timer never ticks, and the phase spent the opening frames of
 * every capture crawling out of the windup with the layer weight still ramping
 * underneath it. Every mid-swing this project has reviewed was photographed
 * somewhere short of the pose it asked for, and the animation notes written off
 * those captures were written off the wrong frame.
 *
 * The 20 Hz wire against a 60 Hz frame is still real, and it is handled by
 * carrying the clock on the client's own dt between packets — but only as far
 * as a packet can plausibly be late. Past `TICK` the timer is not late, it is
 * *held*, and the lead eases back to nothing so the pose settles exactly where
 * the timer put it. A held frame therefore converges to the pose the timer
 * denotes inside two tenths of a second, and a live match cannot tell the
 * difference because in a live match the lead never gets there.
 */
function readSwing(motion: WarriorMotion, player: GamePlayer, dt: number): number {
  const nominal = WARRIOR_STATS[player.warriorClass]?.attackSpeed || 0.6;
  if (player.state !== "attacking") {
    motion.swingDur = nominal;
    motion.swingPrev = 0;
    motion.swingHold = 0;
    motion.heavy = approach(motion.heavy, 0, dt, 6);
    // Runs on to the end rather than back to the start. The server drops the
    // attacking state the tick the timer expires, and a swing that rewound to
    // its windup while the layer faded would snap the arm back up on every blow.
    motion.swing = approach(motion.swing, 1, dt, 7);
    return motion.swing;
  }

  // THE WIRE NOW STATES ALL OF THIS OUTRIGHT. `swingDuration` is the length of
  // the stroke, `swingHeavy` says which it was, and `swingT` is the sim's own
  // 0..1 through it — the same number `advanceSwing` tests against the phase
  // boundaries when it decides the blow has landed. Reading it means the pose
  // and the damage are driven by one value rather than by two derivations of a
  // countdown that agree only approximately.
  //
  // The carry below still applies: 20 Hz of wire against 60 Hz of frame is
  // unchanged by where the number came from. And it is still suppressed during
  // HITSTOP — the sim is holding this man completely still, and a pose that
  // kept easing forward through the freeze is the client sliding him through a
  // stop the server says is total, which is exactly the bug the freeze exists
  // to prevent.
  if (player.swingDuration !== undefined && player.swingDuration > 0 && player.swingT !== undefined) {
    motion.swingDur = player.swingDuration;
    motion.heavy = approach(motion.heavy, player.swingHeavy ? 1 : 0, dt, 9);
    const frozen = (player.hitstop ?? 0) > 0;
    motion.swingHold = frozen || Math.abs(player.attackTimer - motion.swingPrev) > 1e-5
      ? 0
      : motion.swingHold + dt;
    motion.swingPrev = player.attackTimer;
    const carry = frozen ? 0 : Math.min(motion.swingHold, player.swingDuration * 0.12);
    const lead = carry * (1 - smooth(clamp01((motion.swingHold - TICK) / TICK)));
    return (motion.swing = clamp01(player.swingT + lead / player.swingDuration));
  }

  // A timer that jumped up is a new swing. Its opening value is the length of
  // the swing — the one moment the wire states the duration outright — and the
  // wire says nothing anywhere else about light against heavy, so the largest
  // value seen this swing is the best reading of it there is. The class figure
  // is the floor and never the ceiling: a heavy attack runs long, and a still
  // that never shows the opening tick falls back to the class figure, which is
  // exactly the duration a still is posed against.
  if (player.attackTimer > motion.swingPrev + 1e-3) motion.swingDur = nominal;
  if (player.attackTimer > motion.swingDur) motion.swingDur = player.attackTimer;
  motion.swingHold = Math.abs(player.attackTimer - motion.swingPrev) > 1e-5 ? 0 : motion.swingHold + dt;
  motion.swingPrev = player.attackTimer;

  const dur = Math.max(0.05, motion.swingDur);
  motion.heavy = approach(motion.heavy, dur > nominal * 1.1 ? 1 : 0, dt, 9);

  // Bounded twice: by how late a packet can be, and by an eighth of the swing.
  // The second bound is what keeps the berserker honest — his swing is 0.4 s, so
  // a tick of carry is a fifth of his whole arc where it is a fifteenth of the
  // huscarl's, and one hitched packet should not throw his axe a fifth of the
  // way through the blow.
  const carry = Math.min(motion.swingHold, dur * 0.12);
  const lead = carry * (1 - smooth(clamp01((motion.swingHold - TICK) / TICK)));
  return (motion.swing = clamp01((dur - player.attackTimer + lead) / dur));
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/**
 * The base a warrior returns to: bladed, weight low, weapon carried heavy.
 *
 * `act` is how far into a strike he is, and it exists to get the *carry* out of
 * the way of the strike. A bladed guard is a carry: hips and shoulders both
 * turned off the target, and both turned the same way. The attack layer's whole
 * hip-against-shoulder separation is smaller than that constant bias, so with
 * the bias standing the two turned together and the swing had no torque in it —
 * measured on the overhead, 7.8° of separation at the load and 2° at impact,
 * where the pose is asking for four times that. A man committing to a blow
 * squares his hips at what he is hitting; the bias is what he does when he is
 * not hitting anything.
 */
function stanceLayer(st: Stance, ready: number, act: number, w: number): void {
  const carry = 1 - act * 0.8;
  P.lrx += (0.13 + ready * 0.14) * w;
  P.llx += (-0.08 - ready * 0.12) * w;
  P.lrz += (0.05 + ready * 0.04) * w;
  P.llz += (-0.05 - ready * 0.04) * w;
  // Both knees bent and the front one more. This one line is most of the
  // difference between a fighter and a man standing in a field, and it is
  // spent here rather than on the pelvis: a bent knee lowers the body through
  // `settleOnFeet` on its own and takes the hip sockets down with it.
  //
  // Deliberately an athletic guard and not a horse stance, because the action
  // layers bend the same knees again on top of this. A guard already crouched
  // to 40° plus a lunge that asks for another 40° is a man sitting on his own
  // heels at the moment he lands a blow, which is what the first calibration of
  // this did: the stance and the action have to share the crouch, not stack it.
  P.lrb += (0.12 + (0.08 + st.sink) * ready) * w;
  P.llb += (0.15 + (0.12 + st.sink) * ready) * w;
  P.pry += (0.10 + ready * 0.06) * carry * w;
  P.prx += -0.03 * w;
  P.cry += (0.14 + ready * 0.09) * carry * w;
  P.crx += (0.05 + ready * 0.06) * w;
  // THE REST POSE IS A LOW READY, NOT A MAN WITH HIS ARMS DOWN.
  //
  // The owner: "they go static, arms by their side". Measured on the committed
  // pose of a calm warden, `arx` sat at 0.163 rad — nine degrees off hanging —
  // with the elbow at 0.26. The same man on his guard carries 0.766 and 1.614.
  // That gap IS the complaint: `ready` is zero whenever nothing is moving, and
  // this layer read zero-ready as "standing in a field" when the man is standing
  // in a shield wall between exchanges. He does not let his axe hang; he carries
  // it low and in front, and the weight of it is the reason.
  //
  // Rebalanced so the BRACED end is bit-identical and only the rest end moves:
  // 0.34 - 0.50·ready is 0.34 at ease and -0.16 on the guard, which is exactly
  // what 0.16 - 0.32·ready gave at ready = 1. Every attack, block, stagger and
  // walk pose in the game is reached at ready ≈ 1 and is therefore untouched.
  P.arx += (0.34 - ready * 0.50) * w;
  const abduct = (st.spread + 0.10) * w;
  P.arz += abduct;
  // ...and the wrist gives it straight back to anything carried butt-down, so
  // the haft hangs plumb while the arm under it still stands out from the ribs.
  // Written here rather than in `applyPose` off the assembled `P.arz` on
  // purpose: the block and the swing author their own roll against their own
  // abduction and have been tuned that way, and a correction that read the sum
  // would silently re-tune both. Faded out with the strike for the same reason
  // the rest of the carry is — a swing aims the weapon, it does not hang it.
  P.wz += -st.plumb * abduct * (1 - act);
  P.olx += (st.guard * (0.55 + ready * 0.45)) * w;
  // The off arm hangs *near* the body, not clear of it. At rest this carried
  // the shoulder 14° out, and on the huscarl that is the whole shield swung
  // outboard of the hip it should be resting against — three quarters of a
  // metre of painted disc pushed into the edge of every frame he stands in.
  P.olz += -(st.spread * 0.6 + 0.05 + ready * 0.09) * w;
  P.hry += -0.09 * w;
  // Elbows. The off arm is always the more folded of the two — it is not
  // carrying anything long — and the weapon arm closes as the guard comes up.
  // Same rebalance, same invariant: 0.42 + 0.24·ready is 0.66 on the guard,
  // which is what 0.26 + 0.40·ready gave there. `P.wx` below gives the fold
  // straight back to the wrist, so a heavier resting elbow does not swing the
  // weapon's carry angle by a degree — the axe comes up, its aim does not move.
  const fold = 0.42 + ready * 0.24;
  P.arb += -fold * w;
  P.olb += -(0.56 + ready * 0.36) * w;
  // The wrist gives back exactly what the elbow took. `rest` and `live` say
  // where the weapon *points*, and they were measured against an arm that was
  // one rigid stick from shoulder to fist; folding an elbow under them without
  // this would swing every carry angle in the game by the fold and put the
  // huscarl's point through the turf. The action layers deliberately do not
  // compensate — an elbow that moves the blade is the reason to have one.
  P.wx += (mix(st.rest, st.live, ready) + fold) * w;
}

/**
 * Breath and weight shift.
 *
 * The slow half of this is the one that matters: a man standing still puts his
 * weight on one leg, drops that hip, and bends his spine the other way to stay
 * over his feet. Two straight legs and a level pelvis is a mannequin, and that
 * is what the closeup has been photographing.
 */
function idleLayer(t: number, seed: number, wounded: number, w: number): void {
  // THE CLOCKS, and they are most of why this layer was not being seen.
  //
  // An amplitude is only half of whether motion reads; the other half is how
  // much of the cycle a glance contains. This layer shipped on periods of 15.0 s
  // (weight shift), 20.3 s (head drift) and 27.3 s (head nod). A man who is calm
  // for one second in a fight — which is a long time to be calm in a fight — was
  // being shown a FIFTEENTH of one swing of the slowest term, and a fifteenth of
  // a sine near its own turning point is nothing at all. Measured: his crown
  // travelled 9.3 mm in half a second where a walking man's travels 136 mm.
  //
  // So the periods come down to the length of the thing they portray. A man at
  // ease changes his standing leg every few seconds, not every quarter minute;
  // he breathes; and in a fight he looks about him rather than drifting his gaze
  // across half a minute. The amplitudes come up with them, but the clocks are
  // the larger half of the fix and were the part that was actually wrong.
  //
  // THE SHIFT'S AMPLITUDE IS DELIBERATELY BARELY RAISED, and the first cut of
  // this got it wrong in the other direction. Scaling the weight-shift terms up
  // with the clock put 320 mm of lateral travel through the crown between one
  // standing leg and the other — a third of a metre, which is not a man changing
  // feet, it is a man swaying. What a half-second glance actually contains is
  // the BREATH, the SCAN and the sway below; the shift is a six-to-eight second
  // event and its job is the read over seconds, not the read over a glance. So
  // the clock came down and these four stayed near where they were.
  const shift = Math.sin(t * 0.82 + seed);
  // `dwell` still squares the shift off into a hold-and-transfer rather than a
  // sway: he stands on one leg, then changes. Faster now, so the transfer is a
  // thing you can catch, but it is the same shape.
  const dwell = Math.sign(shift) * smooth(Math.min(1, Math.abs(shift) * 1.7));
  const br = Math.sin(t * (2.3 + wounded * 1.9) + seed);
  // A man between exchanges scans his flanks. This is the only fast term in the
  // layer and it is small, because a head that whips is a head that twitches —
  // but it is the term that carries a HALF-SECOND glance, which is the window
  // the owner is looking through, and the layer had nothing in that band at all.
  const scan = Math.sin(t * 1.35 + seed * 3.7);
  // POSTURAL SWAY, and this is the term the layer never had.
  //
  // `dwell` is a hold-transfer-hold by construction — it saturates at |shift| >
  // 0.59, which is 60% of every half cycle — so while a man is standing on a leg
  // the whole weight-shift half of this layer contributes a CONSTANT. Measured
  // on the committed pose after the clocks came down: `lrb` and `llb` moved
  // 0.000 rad in the median half-second window. The knees were still rigid; they
  // were merely rigid at a better angle.
  //
  // A standing body is an inverted pendulum and it never stops correcting. The
  // two frequencies are deliberately incommensurate (0.9 and 1.63 are not a
  // ratio of small integers), so the sum never repeats and the correction never
  // reads as a loop — which a single sine at this amplitude very quickly does.
  // Small: 12 mm at the hip. It is not meant to be seen as sway. It is meant to
  // mean the man has not been switched off.
  const sway = Math.sin(t * 0.90 + seed * 1.7) * 0.62 + Math.sin(t * 1.63 + seed * 4.3) * 0.38;

  P.px += (dwell * 0.040 + sway * 0.012) * w;
  P.prz += (-dwell * 0.062 - sway * 0.020) * w;
  // The knees take the sway too, and out of phase with each other — that is what
  // makes it a balance correction rather than the whole man rocking as one board.
  P.lrb += sway * 0.030 * w;
  P.llb += -sway * 0.030 * w;
  P.py += (-0.004 - Math.abs(dwell) * 0.010 + br * 0.009) * w;
  P.crz += dwell * 0.082 * w;
  P.cry += dwell * 0.056 * w;
  P.crx += (br * 0.038 - 0.01) * w;
  // The free leg unlocks and turns out; the loaded one carries straight. The
  // knee is where "unlocked" actually lives — a hip that turns out over a
  // locked knee is a mannequin turned out at the hip.
  const free = Math.max(0, -dwell);
  const load = Math.max(0, dwell);
  P.lrx += free * 0.10 * w;
  P.llx += load * 0.10 * w;
  P.lrb += (free * 0.24 - load * 0.10) * w;
  P.llb += (load * 0.24 - free * 0.10) * w;
  P.hry += (Math.sin(t * 0.85 + seed * 2.1) * 0.17 + scan * 0.075 - dwell * 0.09) * w;
  P.hrx += (br * 0.03 + Math.sin(t * 0.66 + seed) * 0.045) * w;
  // The weapon is heavy and the breath is under it. A carried axe rising and
  // falling on the chest that carries it is the single clearest tell that a man
  // is alive and not a prop, and it is nearly free — the arm is already posed.
  P.arx += br * 0.045 * w;
  P.olx += -br * 0.034 * w;
  P.arb += -br * 0.038 * w;
  P.olb += br * 0.046 * w;
  P.wx += br * 0.055 * w;

  // Blood loss shows in the stance before it shows anywhere else. It shows in
  // the knees first of all: a man who has lost blood is not standing at his own
  // height, and he is not standing at it because his legs have given, not
  // because his hips have sunk into his thighs.
  P.crx += wounded * (0.22 + br * 0.05) * w;
  // Sized to land where the pelvis drop this replaces landed — about 45 mm at
  // the point a man stops being able to stand up straight. Cos being flat near
  // zero, that is most of a radian of knee between the two of them.
  P.lrb += wounded * (0.58 + br * 0.05) * w;
  P.llb += wounded * (0.50 + br * 0.05) * w;
  P.hrx += wounded * 0.20 * w;
  P.prx += wounded * 0.07 * w;
  P.arx += wounded * 0.14 * w;
  P.arb += -wounded * 0.24 * w;
  P.olb += -wounded * 0.30 * w;
}

/**
 * Locomotion with the feet on the ground.
 *
 * Phase advances with distance covered, not with wall time, so the cadence is
 * whatever the speed demands and a foot planted at a given ground point stays
 * there — a walk cycle running off the wall clock, which is what this was,
 * slides every foot backwards through the turf the moment the speed changes.
 * The rise and fall of the body is not authored here at all; it falls out of
 * `settleOnFeet` from the leg angles below.
 */
function gaitLayer(motion: WarriorMotion, speed: number, legLen: number, dt: number, w: number, armW = 1): void {
  const amp = Math.min(0.56, 0.26 + speed * 0.05);
  const strideLen = Math.max(0.35, 2 * legLen * Math.sin(amp));
  const before = motion.stride;
  motion.stride += (speed / strideLen) * Math.PI * dt;
  // A footfall every half cycle. The jolt of catching your own weight is short
  // and it is what tells the eye the body has mass.
  //
  // Offset by a quarter cycle, which is where a foot actually lands: the leg
  // angle is amp·sin(ph), so it is furthest forward at ph = π/2 (mod π) and
  // straight under the body at ph = 0. Firing on the zero fired the impulse at
  // mid-stance — a shudder halfway through a step rather than at the end of one
  // — and with no knee to fold under it there was nothing to make that obvious.
  const beat = Math.PI / 2;
  if (Math.floor((motion.stride - beat) / Math.PI) !== Math.floor((before - beat) / Math.PI)) motion.land = 1;

  const ph = motion.stride;
  const sw = Math.sin(ph);
  const legL = amp * sw;
  const legR = -amp * sw;

  P.llx += legL * w;
  P.lrx += legR * w;
  P.llz += -0.04 * w;
  P.lrz += 0.04 * w;

  // The knee is what separates a walk from a pair of scissors. It folds through
  // the swing so the foot clears the ground, peaking as the leg passes under
  // the body — which is where `-cos` peaks, and why the phase is read off the
  // derivative of the stride rather than off the stride itself. The planted leg
  // takes a second, smaller bend as it catches the weight at footfall.
  //
  // Nothing here authors a height: the fold shortens the leg and `settleOnFeet`
  // reads that as the drop, so the body rides low through double support and up
  // over mid-stance the way a body does.
  const swingL = Math.max(0, -Math.cos(ph));
  const swingR = Math.max(0, Math.cos(ph));
  const clear = 0.34 + amp * 1.45;
  P.llb += (clear * swingL * swingL + 0.28 * motion.land * (1 - swingL)) * w;
  P.lrb += (clear * swingR * swingR + 0.28 * motion.land * (1 - swingR)) * w;

  P.py += -motion.land * motion.land * 0.022 * w;

  // Arms counter the legs, one beat behind them: a shoulder is not bolted to
  // the opposite hip, it is dragged by it. The elbows swing with them and stay
  // bent throughout — nobody walks into a fight with their arms hanging.
  // `armW` fades them out when another layer holds the arms (a raised guard, a
  // stagger) while the legs go on stepping under it.
  const arm = w * armW;
  const lag = Math.sin(ph - 0.42);
  P.arx += -(-amp * lag) * 0.42 * arm;
  P.olx += -(amp * lag) * 0.55 * arm;
  P.arb += (-0.16 - Math.max(0, -amp * lag) * 0.55) * arm;
  P.olb += (-0.22 - Math.max(0, amp * lag) * 0.70) * arm;
  P.arz += 0.06 * arm;
  P.olz += -0.06 * arm;

  // Hips turn with the stride, shoulders against them.
  P.pry += -0.11 * sw * w;
  P.cry += 0.15 * Math.sin(ph - 0.5) * w;
  P.crz += 0.05 * sw * w;
  P.crx += (0.06 + motion.land * 0.06) * w;
  P.hrx += -0.03 * w;
  P.cloak += (0.3 + Math.sin(ph * 2) * 0.09) * w;
}

/** Load, release, follow through — and, if it was heavy, pay for it. */
function attackLayer(dir: string, ph: number, heavy: number, shielded: boolean, w: number): void {
  const s = SWINGS[dir] ?? SWINGS.right;
  const gain = 1 + heavy * 0.24;

  P.pry += link(ph, 0.16, s.pry, false) * gain * w;
  P.prx += link(ph, 0.14, s.prx, false) * gain * w;
  P.py += link(ph, 0.08, s.py, false) * gain * w;
  P.pz += link(ph, 0.08, s.pz, false) * gain * w;
  P.llx += link(ph, 0.09, s.front, false) * gain * w;
  P.lrx += link(ph, 0.09, s.back, false) * gain * w;
  // The knees run with the feet and just behind them. The back one is coiled at
  // the load and drives out through the release; the front one is straightish
  // going in and folds under the blow, which is the shape of a man putting his
  // weight into something rather than reaching for it.
  P.llb += link(ph, 0.06, s.frontB, false) * gain * w;
  P.lrb += link(ph, 0.06, s.backB, false) * gain * w;

  P.cry += link(ph, 0.01, s.cry, false) * gain * w;
  P.crx += link(ph, 0.02, s.crx, false) * gain * w;

  // Which foot he is on. Read a shade behind the hips, because weight arrives
  // after the drive that sends it: the hip turns and the body follows onto the
  // foot. Everything it drives is lateral, which is the point — see `Swing.shift`.
  const wt = link(ph, 0.07, s.shift, false) * gain;
  const front = Math.max(0, wt);
  const back = Math.max(0, -wt);
  P.px += -wt * 0.075 * w;
  P.prz += wt * 0.17 * w;
  P.crz += -wt * 0.09 * w;
  P.hrz += -wt * 0.06 * w;
  // The loaded leg drives out from under him rather than staying plumb, which
  // is what a stance does when it is actually carrying something.
  P.llz += -front * 0.14 * w;
  P.lrz += back * 0.14 * w;

  const arx = link(ph, -0.02, s.arx, true) * gain;
  const arz = link(ph, -0.02, s.arz, true) * gain;
  // Between the shoulder and the blade, because that is where an elbow is in
  // the chain: hips at +0.10, spine +0.04, shoulder -0.02, elbow -0.05, blade
  // -0.09. Every link arriving on the same clock is an arm waving a stick.
  const arb = link(ph, -0.05, s.arb, true) * gain;
  P.arx += arx * w;
  P.arz += arz * w;
  P.arb += arb * w;
  if (shielded) {
    // A shield is not a counterweight. It stays between the man and whatever he
    // is swinging at — you do not open your guard to hit someone — so the off
    // arm holds most of the brace through the swing and only breathes with it.
    // Cheap to say before: the shield used to hang low enough off the fist to
    // stay in front of the chest whatever the arm did, so opening the arm cost
    // nothing. Now the disc goes where the fist goes.
    //
    // Held a shade wider than the block, so it stays on his shield side rather
    // than parking on his sternum, which is where his own blade has to cross.
    P.olx += (0.34 - arx * 0.07) * w;
    P.olz += (0.14 - arz * 0.09) * w;
    P.olb += (-0.78 - arb * 0.05) * w;
  } else {
    // The off arm is a counterweight, not a passenger — and a counterweight on a
    // straight arm is a sandbag on a rope. It folds hardest where the weapon arm
    // is folded and opens with it.
    P.olx += -arx * 0.26 * w;
    P.olz += -arz * 0.30 * w;
    P.olb += (-0.44 + arb * 0.22) * w;
  }

  // The blade, last link in the chain and the only one stated as a destination
  // rather than as a joint angle. `applyPose` turns it back into a wrist.
  // A shorter lag than the other links get. The blade is still last in the
  // chain, but this one is a destination and not an angle to add: lag it as far
  // behind the shoulder as the old wrist term was lagged and it asks for a hand
  // bent square to its own forearm halfway through every windup, which the
  // envelope below then refuses and the blade snaps to the limit instead.
  P.wa += link(ph, -0.04, s.aim, true) * w;
  // Authority rises on the windup's own curve, and the aim it divides out is
  // therefore the load key from the first frame rather than a ramp up from
  // zero — zero is not "no opinion" for an absolute angle, it is "straight up",
  // and every swing would open by snapping the blade vertical. What actually
  // ramps is how much say the aim has against the class carry, and `applyPose`
  // takes that handover the short way round the blade.
  P.waw += easeOutCubic(clamp01(clamp01(ph - 0.04) / LOAD_END)) * w;
  P.wz += link(ph, -0.09, s.wz, true) * w;
  P.wy += link(ph, -0.06, s.wy, false) * w;

  // Eyes stay on the target while the shoulders turn under them.
  P.hry += -link(ph, 0.04, s.cry, false) * 0.62 * gain * w;
  P.hrx += (-link(ph, 0, s.crx, false) * 0.3 + 0.06) * w;
  P.cloak += (0.15 + link(ph, 0.06, s.pz, false) * 1.4) * w;

  // A heavy swing costs the man his balance: he over-rotates past the blow and
  // has to walk his back foot under himself to get it back.
  const past = smooth(clamp01((ph - IMPACT) / (1 - IMPACT)));
  const cost = heavy * past * (1 - past * 0.45) * w;
  P.prx += 0.30 * cost;
  P.py += -0.03 * cost;
  P.pz += 0.10 * cost;
  P.lrx += -0.34 * cost;
  P.llx += 0.10 * cost;
  // The back leg comes under him bent, because that is what catching yourself
  // looks like, and the arm is dragged out straight behind the weapon.
  P.lrb += 0.46 * cost;
  P.llb += -0.14 * cost;
  P.arb += 0.34 * cost;
  P.arz += 0.30 * cost;
  P.olz += -0.36 * cost;
  P.hrx += 0.18 * cost;
}

/** The shield comes up and the body settles in behind it. */
function blockLayer(hasShield: boolean, settle: number, w: number): void {
  // The guard snaps up and overshoots a little before it locks — a shield that
  // arrives by lerp arrives without weight.
  const over = Math.sin(settle * Math.PI) * (1 - settle) * 0.5;

  // The drop that used to be dialled into the pelvis here comes out of the
  // knees now. Braced is not the same shape as short: a man behind a shield has
  // his weight down between two bent legs with the front one loaded, and that
  // is a thing you can see from the side. A lowered pelvis over straight legs
  // is not, and it was the reason `blocking` and `idle` were one silhouette.
  P.py += (-0.005 - over * 0.02) * w;
  P.pz += -0.05 * w;
  P.prx += 0.07 * w;
  P.pry += -0.20 * w;
  P.crx += (0.14 + over * 0.08) * w;
  P.cry += -0.32 * w;
  P.crz += 0.05 * w;
  P.llx += -0.20 * w;
  P.lrx += 0.22 * w;
  P.llz += -0.11 * w;
  P.lrz += 0.12 * w;
  P.llb += (0.24 + over * 0.08) * w;
  P.lrb += (0.16 + over * 0.05) * w;
  P.hrx += (0.12 + over * 0.06) * w;
  P.hry += 0.16 * w;

  if (hasShield) {
    // The elbow is what puts a shield in front of a face; the shoulder only
    // carries the weight of it. Doing the lift at the shoulder — which is all a
    // rig without an elbow could do — is a man holding a door out in front of
    // himself at arm's length.
    //
    // The shoulder now goes *back* where it used to go forward, and that is the
    // shield moving to the boss rather than a change of mind about the pose:
    // the disc used to hang 300 mm below the fist, so the fist had to be raised
    // past the chin to put the shield in front of the chest. Held at the boss,
    // the same coverage comes from a dropped elbow tucked under it — which is
    // also the only way to take a blow on a shield without it being knocked out
    // of the way. Solved off the arm's own segment lengths: the fist wants to
    // land about 110 mm under the shoulder and 400 mm in front of it, which puts
    // the rim from sternum to just over the eyes — covered, still looking.
    P.olx += (0.32 - over * 0.10) * w;
    P.olb += (-0.86 - over * 0.16) * w;
    P.olz += 0.40 * w;
    P.oly += -0.16 * w;
    // The carry is already solving the pitch, so these are what a braced wrist
    // adds on top: the top rim tips into the blow and the disc turns a few
    // degrees across, which is what makes a strike glance rather than land flat.
    P.sx += (0.12 + over * 0.10) * w;
    P.sy += -0.16 * w;
    P.sfy += -0.03 * over * w;
    // The sword hand comes back behind the rim, cocked to answer.
    P.arx += 0.42 * w;
    P.arb += -0.74 * w;
    P.arz += -0.26 * w;
    P.wx += 0.18 * w;
  } else {
    // No shield: the blade goes up in a hanging guard and the off hand braces
    // it. The lift is split between shoulder and elbow the same way, which is
    // what brings the fist in to the shoulder instead of out in front of it.
    P.arx += (-0.60 - over * 0.10) * w;
    P.arb += (-0.96 - over * 0.10) * w;
    P.arz += 0.60 * w;
    P.olx += -0.52 * w;
    P.olb += -1.08 * w;
    P.olz += 0.30 * w;
    P.wx += 1.18 * w;
    P.wz += -0.35 * w;
  }
}

/**
 * The shove: coil, drive, recover, on the same clock the server runs
 * (SHOVE.windup then SHOVE.recover — `ph` is 0..1 over the pair). The weapon
 * is LOWERED for the whole of it, which is half the tell: a man about to shove
 * has visibly stopped being a man about to cut. With a shield the boss leads —
 * the off arm punches the disc out flat while the sword hand trails low; bare
 * handed both palms drive out together from the chest.
 */
function shoveLayer(ph: number, shielded: boolean, w: number): void {
  const windF = SHOVE.windup / (SHOVE.windup + SHOVE.recover);
  const coilUp = smooth(clamp01(ph / windF));
  const punch = ph <= windF ? 0 : easeOutCubic(clamp01((ph - windF) / 0.17));
  const settle = smooth(clamp01((ph - windF - 0.17) / Math.max(0.05, 1 - windF - 0.17)));
  const coil = coilUp * (1 - punch) * w;
  const drive = punch * (1 - settle) * w;

  // Weight back and down through the coil, forward through the drive: the
  // whole body throws it, not the arms, or it reads as a wave hello.
  P.pz += -0.10 * coil + 0.15 * drive;
  P.py += -0.045 * coil - 0.02 * drive;
  P.prx += -0.06 * coil + 0.10 * drive;
  P.crx += -0.20 * coil + 0.32 * drive;
  P.hrx += 0.12 * coil - 0.06 * drive;
  P.llb += 0.38 * coil + 0.16 * drive;
  P.lrb += 0.34 * coil + 0.30 * drive;
  P.llx += -0.12 * coil - 0.10 * drive;
  P.lrx += 0.10 * coil + 0.14 * drive;
  P.cloak += 0.25 * drive;

  // The weapon drops out of the guard and stays down: the hands are busy.
  P.wx += 0.55 * coil + 0.7 * drive;

  if (shielded) {
    // Boss first. The shield arm folds the disc to the chest, then punches it
    // out flat; the sword hand pulls low and back, out of the way.
    P.olx += 0.30 * coil + 1.05 * drive;
    P.olb += -1.30 * coil - 0.25 * drive;
    P.olz += 0.30 * coil + 0.10 * drive;
    P.sx += 0.16 * drive;       // top rim tipped into the man being hit
    P.sfz += 0.05 * drive;
    P.arx += 0.20 * coil + 0.35 * drive;
    P.arb += -0.90 * coil - 0.40 * drive;
    P.arz += -0.20 * coil;
  } else {
    // Two palms from the chest. Elbows fold hard in the coil and straighten
    // through the drive — the positive elbow terms are cancelling the fold,
    // not bending backwards; `stops()` holds the hinge at its limit.
    P.arx += 0.35 * coil + 1.00 * drive;
    P.arb += -1.30 * coil + 0.85 * drive;
    P.arz += 0.16 * coil + 0.10 * drive;
    P.olx += 0.32 * coil + 0.95 * drive;
    P.olb += -1.35 * coil + 0.80 * drive;
    P.olz += -0.16 * coil - 0.10 * drive;
  }
}

/**
 * Start a victory flourish on this body. The caller (the orchestrator, off the
 * server's relay; the summary stage, off the victor's chosen id) owns WHETHER;
 * this module owns the performance. Re-triggering mid-performance restarts it,
 * which is what a deliberate second press should do.
 */
export function triggerEmote(motion: WarriorMotion, emote: EmoteId): void {
  motion.emote = emote;
  motion.emoteT = 0;
}

/**
 * The three victory emotes, on one clock (`ph` is 0..1 over EMOTE_SECONDS).
 * Additive like every other layer, and gated by `poseWarrior` to bodies that
 * are not spent — a swing, a roll or a stagger simply drops the flourish. Each
 * one is authored to read at nameplate distance in under two seconds, because
 * the audience is a phone across a group chat, not a cinematic.
 */
function emoteLayer(kind: EmoteId, ph: number, shielded: boolean): void {
  // Eased in and out on its own envelope so the flourish enters and leaves the
  // standing pose without a snap, whatever the body was doing either side.
  const w = smooth(clamp01(ph / 0.14)) * smooth(clamp01((1 - ph) / 0.16));

  if (kind === "raise") {
    // The blade to the sky: a short coil, then the arm thrust straight up and
    // held, eyes following it. The aim channel is what actually points the
    // steel — the same solve a strike uses, so a spear and a seax both end
    // vertical instead of sharing one wrist angle.
    const up = easeOutCubic(clamp01((ph - 0.10) / 0.24)) * smooth(clamp01((0.95 - ph) / 0.18));
    const coil = smooth(clamp01(ph / 0.12)) * (1 - easeOutCubic(clamp01((ph - 0.10) / 0.22)));
    P.py += -0.035 * coil * w;
    P.llb += 0.18 * coil * w;
    P.lrb += 0.22 * coil * w;
    P.crx += (0.10 * coil - 0.16 * up) * w;   // chest opens, back arches a touch
    P.prx += -0.05 * up * w;
    P.hrx += -0.34 * up * w;                  // eyes go up with the steel
    P.arx += (0.25 * coil - 2.05 * up) * w;
    P.arz += 0.24 * up * w;
    P.arb += -0.08 * up * w;
    // Straight up with a shade of forward, stated as a destination.
    P.wa += 0.10 * up * w;
    P.waw += up * w;
    // The off arm drives down and back — the counterweight of a shout.
    P.olx += 0.35 * up * w;
    P.olb += -0.30 * up * w;
    P.cloak += 0.30 * up * w;
    return;
  }

  if (kind === "boss") {
    // The boss beaten twice. The off arm presents the disc; the weapon hand
    // cocks out and hammers across onto it, twice on one clock. The classes
    // that carry no shield beat the chest with the same two strokes — same
    // rhythm, nearer target — so the emote reads as one gesture roster-wide.
    const present = smooth(clamp01(ph / 0.16)) * smooth(clamp01((1 - ph) / 0.16));
    const p2 = clamp01((ph - 0.08) / 0.84);
    const s = Math.sin(p2 * Math.PI * 4);
    const lift = Math.max(0, s) * present;    // cocked out to the weapon side
    const drive = Math.max(0, -s) * present;  // crossed onto the boss
    P.wx += 0.85 * present * w;               // the blade is a mallet now, not a guard
    P.crx += 0.09 * drive * w;
    P.cry += (0.06 * lift - 0.08 * drive) * w;
    P.hrx += 0.14 * drive * w;                // the nod lands with each knock
    P.arx += (-0.55 - 0.20 * lift + 0.10 * drive) * w;
    P.arz += (0.35 * lift - 0.60 * drive) * w;
    P.arb += (-0.55 - 0.30 * lift) * w;
    if (shielded) {
      // The disc folded to the sternum and tipped flat to take the knocks.
      P.olx += 0.40 * present * w;
      P.olb += -1.15 * present * w;
      P.olz += 0.25 * present * w;
      P.sx += 0.18 * present * w;
      P.sfz += 0.04 * present * w;
    } else {
      // No disc: the fist and haft land on his own chest.
      P.olx += 0.20 * present * w;
      P.olb += -0.60 * present * w;
    }
    P.cloak += 0.15 * drive * w;
    return;
  }

  // "taunt" — chest open, arms flung wide, then a beckoning flick and a jeer
  // of the head: COME ON THEN, readable from the far side of the ring.
  const open = smooth(clamp01((ph - 0.05) / 0.20)) * smooth(clamp01((0.95 - ph) / 0.18));
  const beck = ph > 0.42 && ph < 0.92
    ? Math.pow(Math.max(0, Math.sin((ph - 0.42) / 0.5 * Math.PI * 2)), 2) : 0;
  P.crx += -0.15 * open * w;
  P.prx += -0.05 * open * w;
  P.py += -0.02 * open * w;
  P.hrx += (-0.24 * open + 0.20 * beck) * w;
  P.hrz += 0.08 * Math.sin(ph * 15) * open * w;   // the jeering waggle
  // Arms wide, palms up — the z terms mirror, same convention as the shove's
  // two-palm drive, so both arms open outward rather than swinging together.
  P.arx += -0.70 * open * w;
  P.arz += 0.85 * open * w;
  P.arb += (-0.30 - 0.55 * beck) * open * w;      // the flick is the elbow's
  P.olx += -0.65 * open * w;
  P.olz += -0.85 * open * w;
  P.olb += -0.30 * open * w;
  P.wx += 0.75 * open * w;                        // the blade lolls — no guard in this
  P.cloak += 0.20 * open * w;
}

/** Struck. The body goes where it was hit, then argues its way back. */
function flinchLayer(motion: WarriorMotion, w: number): void {
  const e = motion.flinch;
  const ring = Math.sin(e * Math.PI * 2.1) * e * e;
  const push = e * e * w;
  const fwd = motion.hitFwd;
  const side = motion.hitSide;

  P.pz += fwd * 0.11 * push;
  P.px += side * 0.09 * push;
  P.crx += -fwd * 0.42 * push;
  P.crz += side * 0.34 * push;
  P.cry += side * 0.22 * push;
  P.prx += -fwd * 0.12 * push;
  P.py += -0.05 * push;
  P.hrx += -fwd * 0.5 * push + ring * 0.1 * w;
  P.hrz += side * 0.4 * push;
  P.arz += side * 0.4 * push;
  P.olz += side * 0.3 * push;
  // The arms fold in on the blow rather than staying out at the angle they were
  // caught at. A struck man protects his centre before he does anything else.
  P.arb += -0.32 * push;
  P.olb += -0.40 * push;
  // The leg he is being driven onto steps out to catch him and buckles under
  // him, which through the foot solve also drops him — a man taking a blow gets
  // shorter, and now he gets shorter at the knee where it happens.
  P.lrz += Math.max(0, side) * 0.38 * push;
  P.llz += -Math.max(0, -side) * 0.38 * push;
  P.lrx += -fwd * 0.18 * push;
  P.lrb += Math.max(0, side) * 0.44 * push;
  P.llb += Math.max(0, -side) * 0.44 * push;
}

/** Staggered: knocked off the beat, recovering in a decaying wobble. */
function staggerLayer(t: number, phase: number, motion: WarriorMotion, w: number): void {
  const decay = Math.exp(-2.6 * phase);
  const wob = Math.sin(phase * 14 + t) * decay;
  P.py += (-0.05 * decay) * w;
  P.prx += (-motion.hitFwd * 0.20 + wob * 0.07) * decay * w;
  P.prz += (motion.hitSide * 0.16 + wob * 0.05) * w;
  P.crx += (-motion.hitFwd * 0.30 + wob * 0.12) * w;
  P.crz += motion.hitSide * 0.24 * decay * w;
  P.hrx += (-0.24 + wob * 0.16) * w;
  P.arx += (0.62 + wob * 0.2) * w;
  P.arz += 0.42 * w;
  P.olx += (0.5 - wob * 0.2) * w;
  P.olz += -0.5 * w;
  P.lrx += (-0.34 + wob * 0.1) * w;
  P.llx += (0.30 - wob * 0.1) * w;
  // Knocked off the beat means off the legs: both knees are under him and soft,
  // and they stiffen as the wobble decays instead of the pose simply fading.
  P.lrb += (0.26 + (0.34 + wob * 0.14) * decay) * w;
  P.llb += (0.26 + (0.22 - wob * 0.14) * decay) * w;
  P.arb += (-0.78 + wob * 0.22) * w;
  P.olb += (-0.92 - wob * 0.22) * w;
  P.wx += 0.5 * w;
}

/**
 * FLOORED, AND GETTING BACK UP. The owner's ask, verbatim: *"being able to fall
 * over if caught off guard / shoved & get back up"*.
 *
 * Driven by the SERVER's own clock. `downTimer` counts the whole sequence —
 * `KNOCKDOWN.down` flat then `KNOCKDOWN.rise` getting up — and both halves are
 * read off it here rather than off a client timer, so a man who joins mid-fall,
 * or whose packet was late, is drawn exactly as far through it as the sim says
 * he is. This is the same trick `readSwing` plays with `swingT` and it is the
 * reason the floor was built as one clock and two states.
 *
 * The shape, and every beat of it is a thing a body actually does:
 *
 *   GO OVER   0.26 s. The legs leave, the trunk goes with the blow, the arms
 *             go out behind to catch nothing. He pivots about his feet, which
 *             is why the pitch alone lays him out — `rig.body` is rooted on the
 *             ground, the same geometry `deathLayer` uses.
 *   FLAT      the rest of `down`. Not a corpse: a corpse goes to a right angle
 *             and stays, a living man holds 0.82 of one and his head is up,
 *             because a man on the ground is looking at whoever put him there.
 *   ROLL      the first third of the rise. Onto the hip the blow turned him
 *             onto, the off hand planted.
 *   PUSH      the middle third. Up on that hand and one knee — the beat that
 *             makes it a get-up rather than a rewind of the fall.
 *   STAND     the last third, weapon coming back to the carry.
 *
 * `fall` is +1 for a blow taken from behind and -1 from the front, the same
 * convention `deathLayer` uses, so a man shoved in the back lands on his face.
 */
function knockLayer(elapsed: number, downLeft: number, riseLen: number, fall: number, side: number): void {
  // How far over he is: 1 flat on the ground, 0 upright.
  const over = smooth(clamp01(elapsed / 0.26));
  const riseT = downLeft < riseLen ? clamp01(1 - downLeft / riseLen) : 0;
  // Standing is not the fall run backwards. The trunk comes up early and the
  // legs come under him late, which is what a push-up off one hand looks like;
  // easing them on one curve would read as a man being winched upright.
  const trunkUp = smooth(clamp01(riseT / 0.72));
  const legsUp = smooth(clamp01((riseT - 0.30) / 0.70));
  const lie = over * (1 - trunkUp);
  const plant = Math.sin(clamp01(riseT / 0.62) * Math.PI);   // the hand on the turf

  // A LIVING body, not a corpse: 0.82 of a right angle, and it is the whole
  // difference between "he is down" and "he is dead" at a glance.
  const flat = (Math.PI / 2) * 0.82;
  P.prx = fall * flat * lie;
  P.prz = side * 0.34 * lie;
  P.pry = side * 0.30 * lie * (0.4 + riseT * 0.6);   // he turns onto a hip to rise
  P.py = 0.10 * Math.abs(Math.sin(P.prx));
  P.pz = -fall * 0.10 * lie;

  // Head up. He is looking at the man who put him there, and it is the one
  // thing that keeps a knockdown from reading as a death.
  P.crx = -fall * 0.30 * lie + 0.42 * legsUp * (1 - legsUp) * 2;
  P.crz = -side * 0.20 * lie;
  P.hrx = -fall * 0.46 * lie;
  P.hrz = side * 0.24 * lie;

  // Arms. Out behind him going over, then one of them takes his weight.
  P.arx = (0.70 * over - 0.30 * trunkUp) * (1 - riseT * 0.5);
  P.arz = 0.55 * lie;
  P.arb = -0.30 - 0.55 * lie;
  P.olx = 0.55 * over + 0.85 * plant;
  P.olz = -0.60 * lie - 0.35 * plant;
  P.olb = -0.25 - 0.40 * lie - 0.75 * plant;

  // Legs. The knees BUCKLE as he goes over and STRAIGHTEN as he lands, and the
  // second half of that is not decoration — it is the difference between a man
  // lying down and a man with his shins in the air.
  //
  // `rig.body` pivots at the FEET (the same geometry `deathLayer` relies on), so
  // a straight body pitched a right angle is a body lying flat. Folded knees
  // under that rotation put the shins vertically above the pelvis: the first
  // capture of this strip showed exactly that in frames 3-5, a man on his
  // shoulder blades with his legs in the air, which reads as a backwards roll
  // rather than as a fall. `deathLayer` had already solved it the same way and
  // says so in its own comment — the knees are the first beat of the collapse
  // and they straighten again as the body goes flat.
  const settled = smooth(clamp01((elapsed - 0.18) / 0.28));
  const fold = lie * mix(1.25, 0.10, settled);
  P.lrb = fold + 1.35 * legsUp * (1 - legsUp) * 2 + 0.18;
  P.llb = fold * 0.82 + 0.55 * legsUp * (1 - legsUp) * 2 + 0.14;
  P.lrx = -0.42 * lie * (1 - settled * 0.7) - 0.55 * legsUp * (1 - legsUp) * 2;
  P.llx = 0.30 * lie * (1 - settled * 0.7);
  P.lrz = 0.24 * lie;
  P.llz = -0.20 * lie;

  // The weapon hangs while he is down and comes back to the carry as he stands.
  P.wx = -0.85 * lie;
  P.cloak = 0.45 * lie + 0.25 * plant;
}

/** Dodge: drop under it, drive off the back leg, catch the landing. */
function dodgeLayer(phase: number, side: number, w: number): void {
  const dip = Math.sin(clamp01(phase) * Math.PI);
  const drive = easeOutCubic(clamp01(phase * 1.6));
  const land = smooth(clamp01((phase - 0.62) / 0.38));

  P.py += -(0.08 * dip + 0.04 * land) * w;
  P.pz += (0.14 * drive - 0.1 * land) * w;
  P.px += side * 0.12 * dip * w;
  P.prx += (0.30 * dip) * w;
  P.prz += side * 0.22 * dip * w;
  P.crx += (0.36 * dip) * w;
  P.crz += side * 0.2 * dip * w;
  P.hrx += 0.2 * dip * w;
  P.llx += (-0.75 * dip + 0.2 * land) * w;
  P.lrx += (0.85 * dip - 0.15 * land) * w;
  // "Drop under it" is a knee, not a hip. Both fold deep through the dip and
  // the leading one takes the landing; the pelvis drop above is now only the
  // part of it the knees cannot account for.
  P.llb += (1.20 * dip + 0.40 * land) * w;
  P.lrb += (0.88 * dip + 0.26 * land) * w;
  P.arx += (0.5 * dip) * w;
  P.arz += 0.4 * dip * w;
  P.olx += (-0.7 * dip) * w;
  P.olz += -0.4 * dip * w;
  P.arb += -0.92 * dip * w;
  P.olb += -1.14 * dip * w;
  P.cloak += 0.6 * dip * w;
}

/**
 * A shout, thrown once and then held as a swagger.
 *
 * The ability state can run for whole seconds, so this cannot be a pose that
 * sits there — the arms would be locked over the head through a fight. It
 * peaks in a fifth of a second and decays to a low aggressive carry.
 */
function abilityLayer(d: number, w: number): void {
  const rise = easeOutCubic(clamp01(d / 0.18));
  const held = mix(1, 0.18, smooth(clamp01((d - 0.25) / 0.45)));
  const k = rise * held * w;
  const hold = Math.sin(d * 9) * 0.5 + 0.5;
  P.crx += -0.26 * k;
  P.prx += -0.08 * k;
  P.py += (-0.02 + hold * 0.02) * k;
  P.arx += (1.9 + hold * 0.1) * k;
  P.arz += 0.5 * k;
  P.olx += 0.9 * k;
  P.olz += -0.7 * k;
  // Thrown, so the arms open out at the top of it — the elbows straighten
  // against the stance's fold rather than adding to it.
  P.arb += (0.20 - hold * 0.06) * k;
  P.olb += (0.16 - hold * 0.06) * k;
  P.lrb += 0.22 * k;
  P.llb += 0.18 * k;
  P.hrx += -0.3 * k;
  P.wx += -1.2 * k;
  P.cloak += 0.35 * k;
}

/**
 * Puts the body down on whichever foot is under it.
 *
 * A leg tilted θ off vertical leaves its sole L(1−cos θ) above the ground unless
 * the pelvis comes down to meet it — and the pelvis tilting carries the hip
 * sockets with it, so both terms have to be in the same solve or a swing that
 * pitches the hips forward drives both boots through the turf. Doing it once
 * here, from whatever angles the layers happened to stack up to, is why a wide
 * guard settles and a stride rises and falls without a single layer authoring a
 * height curve.
 *
 * The leg is no longer one rigid piece, and that is the other half of it. A bent
 * knee makes an isoceles triangle of the two halves, so hip to sole is
 * L·cos(φ/2) whatever the hip is doing — one cosine, and the whole of the
 * crouch, the landing, the lunge and the collapse falls out of it. The previous
 * version had to fake this: it kept four fifths of every drop and charged the
 * missing fifth to "the knee this rig does not have". There is a knee now, the
 * drop is taken in full, and the leg that actually reaches furthest is the one
 * the body stands on.
 */
function settleOnFeet(legLen: number, plant: number, slack = 0): void {
  const hip = Math.hypot(P.prx, P.prz);
  // Past about a right angle at the hips the man is going over, not standing,
  // and his height is the height of a body on the ground. Faded rather than
  // cut, so a collapse hands off to it instead of snapping.
  const standing = 1 - smooth(clamp01((hip - 0.5) / 0.6));
  if (standing <= 0) return;
  const ax = clamp(P.llx + P.prx, -1.5, 1.5);
  const bx = clamp(P.lrx + P.prx, -1.5, 1.5);
  const latL = Math.cos(Math.min(1.4, Math.abs(P.llz + P.prz)));
  const latR = Math.cos(Math.min(1.4, Math.abs(P.lrz + P.prz)));
  // A BODY RESTS ON THE LOWEST THING IT HAS, AND ON A FOLDED LEG THAT IS THE
  // KNEE. `legDrop` is the SOLE's drop below the hip, and once the shin has
  // folded past the vertical its `cos(t + f)` term goes negative — the sole is
  // now higher than the knee. Solving the body down onto the sole then drives
  // the knee through the turf, and that is not a corner case: the collapse folds
  // both knees to 1.58 rad in its first quarter second, which is precisely a man
  // going down onto them.
  //
  // Measured on the real rig before this line existed, a warden dying of a plain
  // blow put his knee 330 mm UNDER the ground at t+0.20 s, and his crown fell
  // 790 mm in one tenth of a second, rose 240 mm, and fell again — a body whose
  // height is not monotonic is not falling under gravity, it is being pushed
  // about by two solves disagreeing. That is the deckchair.
  const reachL = Math.max(legDrop(ax, P.llb), KNEE_ALONG * Math.cos(ax)) * latL;
  const reachR = Math.max(legDrop(bx, P.lrb), KNEE_ALONG * Math.cos(bx)) * latR;
  const lead = Math.max(reachL, reachR);
  P.py += legLen * (lead - Math.cos(Math.min(1.4, hip))) * standing;

  // And the other foot. One solve can only put one sole on the ground — it
  // takes the leg that reaches furthest and drops the body onto it — so the
  // other one is wherever the layers left it, which through every attack in the
  // set was between 110 and 380 mm in the air. That is the floatiest thing in
  // the frame and it is also the cheapest to fix, because a leg has a spare
  // degree of freedom for exactly this: the trailing knee gives up as much of
  // its bend as it takes to stand on the same ground as the leading one, and no
  // more. It comes out looking like what it is — the front knee loaded, the
  // back leg driving out straight behind — which is a lunge.
  //
  // Off during locomotion, and it has to be: a foot in mid-stride is supposed
  // to be off the ground, and a solve that plants it would straighten the swing
  // leg into a goose step.
  //
  // AND THE TRAILING SOLE DOES NOT HAVE TO BE FLAT. `slack` is how far above
  // the leading foot's ground the other one is allowed to hang, as a fraction
  // of the leg, before any of it is charged to the knee.
  //
  // It is zero for a stride and for a guard, where both boots really are on the
  // turf. It is NOT zero for a man standing at ease, and that is the whole of
  // the owner's "stand straight up": at ease `idleLayer` bends the free knee
  // 0.24 rad and turns it out, which is the one thing in the idle that reads as
  // a man resting rather than a mannequin — and this solve took every radian of
  // it straight back out again, because the free leg is by construction the
  // SHORTER-reaching one and this is the leg it straightens. Measured on the
  // committed pose, `lrb` sat at 0.015 rad with a peak-to-peak wiggle over half
  // a second of 0.000: not small, not slow, RIGID. A man rests on one leg and
  // lets the other heel come off the ground; a few centimetres of slack is what
  // that heel is, and it costs the leading foot nothing because the body's
  // height is solved off `lead`, which is the loaded leg.
  const k = plant * standing;
  if (k <= 0.001) return;
  const want = Math.max(0, lead - slack * standing);
  if (reachL < reachR) P.llb = mix(P.llb, kneeFor(ax, P.llb, want / (latL || 1)), k);
  else P.lrb = mix(P.lrb, kneeFor(bx, P.lrb, want / (latR || 1)), k);
}

/**
 * How far below the hip a sole hangs, as a fraction of the leg, for a hip at
 * `t` and a knee at `f`.
 *
 * Two segments, and it matters which is which. The version this replaces took
 * the reach as `cos(f / 2) · cos(t)`, which is the chord's *length* — correct —
 * multiplied by the cosine of the wrong angle: the chord does not run along the
 * thigh, it runs about half the knee's own bend away from it. On the old poses
 * the two agreed to within a centimetre and the error was invisible. On a knee
 * loaded to 60°, which is what a lunge that reads as a lunge actually needs, it
 * puts the front sole 200 mm under the turf.
 */
function legDrop(t: number, f: number): number {
  return KNEE_ALONG * Math.cos(t) + (1 - KNEE_ALONG) * Math.cos(clamp(t + f, -2.6, 2.6));
}

/** The knee that would put that sole on the ground, never straighter than straight. */
function kneeFor(t: number, f: number, want: number): number {
  const c = (want - KNEE_ALONG * Math.cos(t)) / (1 - KNEE_ALONG);
  // Short even at full extension: give it everything and let the foot hang.
  if (c >= 1) return 0;
  if (c <= -1) return f;
  return clamp(Math.acos(c) - t, 0, f);
}

// ---------------------------------------------------------------------------
// Cloth
//
// A cloak is the one thing on a warrior that is not attached to a bone, and it
// was the clearest single tell that nothing here was being simulated: the whole
// shell turned about the yoke on one authored angle, so the hem and the collar
// travelled together and the thing read as a flat plate bolted to the
// shoulders. Nothing hung, nothing lagged, nothing settled.
//
// What follows is not a cloth solver and does not want to be — eight men on a
// phone cannot afford a particle grid. It is the part of one that a viewer can
// actually see: a shared yoke and three columns of cloth beside it, each hanging
// two rings deep along whatever direction the pseudo-force at *that column's*
// place in the cloth is pointing, each ring softer and later than the one above.
//
// Almost everything falls out of that one field. Standing still it is gravity,
// so the cloak hangs plumb and stays plumb while its owner leans over a swing.
// Running, drag adds to it and the cloak trails. Stopping, the inertial term
// reverses and the hem swings through and comes back. Turning, the field is
// `ω × r` and `r` differs across the cloth — the back panel is swept sideways
// while the two leading edges go fore and aft in opposite directions, which is a
// swirl and not a roll. None of those are separate animations; they are one
// solve read at three places, which is why they compose instead of fighting.
//
// The one term that is not in the field is `GATHER`, and it is the term the
// previous rig could not have held at all: cloth hanging off a yoke falls *in*
// and finds the body, and a chain of bones down the body axis can turn a hem but
// can never narrow one. It is what stops a still of a standing man photographing
// a traffic cone, and it relaxes as he moves, because a cloak at a run really is
// out at its cut radius.
// ---------------------------------------------------------------------------

/** Gravity, and how hard the air pulls on a square metre of wool per metre per second. */
const GRAVITY = 9.81;
const DRAG = 2.2;
/** How much of the layers' authored billow survives as a direct hem lift. */
const BILLOW = 0.5;
/**
 * The two things the pseudo-force does not know about, as limits.
 *
 * A cloak can stream a long way behind a man and barely any distance in front of
 * one, because he is in the way — so `SWING_FWD` is small and deliberately not
 * symmetric. Without it the gravity solve is *correct* and looks wrong: bent
 * over a swing, a plumb cloak hangs through its owner's own thighs, and no
 * amount of solving fixes that without collision we cannot afford. Held against
 * his back instead, which is what the back is doing to it.
 *
 * Sideways is tighter again, because that is where the arms are.
 */
const SWING_BACK = 1.15;
const SWING_FWD = 0.24;
const SWING_SIDE = 0.62;
/**
 * How much further forward a wing may come than the back panel.
 *
 * `SWING_FWD` stands in for the wearer's own body, and the body is only in the
 * way of the cloth directly behind it. What hangs beside a man can and does come
 * round in front of his hip — that is what a cloak does when he stops — so the
 * limit is per column rather than one number for the whole shell.
 */
const WING_FWD = 0.62;
/**
 * How far in the wings fall under their own weight, per ring.
 *
 * This is the term the old rig could not express at all, and the reason the
 * cloak has read as a traffic cone in every capture: linear blend skinning on a
 * chain down the body axis can rotate a hem but cannot narrow one, so the shell
 * kept its cut radius whatever it did. Cloth does not. Hanging off a yoke it
 * falls inward and finds the body, and only speed and a turn throw it back out
 * — which is why this is scaled by how *still* the wearer is and not added flat.
 *
 * 0.07, down from the 0.17 this landed at. There is no collision here, so the
 * only thing stopping the gather is the clearance the cloak was cut with, and
 * `characters.ts` says that clearance is about 60 mm over the tunic's flared hem.
 * At 0.17 the hem came in 125–165 mm and the middle of each wing came in about
 * half of that — past the garment under it — and `art/shots/v8/duel.png` showed
 * the result: an olive wedge of tunic standing in a hole in the hero's cloak,
 * which is the same defect, arrived at from the opposite direction, that the
 * outward-only folds were introduced to close. A gather is not worth a hole.
 * This is the number that fits inside the cut, not the number cloth would want;
 * the number cloth would want needs the cloak cut wider first.
 */
const GATHER = 0.07;
/** Where the leading edges turn out to, so the two wings are not one plane. */
const WING_SPLAY = 0.07;
/** Sub-step ceiling. `dt` is capped at 50 ms upstream and the stiff ring is 26 rad/s. */
const CLOTH_STEP = 1 / 90;
/** Which side of the spine each column of cloth hangs on: −1 off, +1 weapon. */
const DRAPE_SIDE = DRAPE_COLS.map((c) => Math.sign(c));

/**
 * Hangs the cloak for this frame.
 *
 * Called after `commit`, so it reads the blended pose rather than the raw one,
 * and writes straight to the bones rather than through `Pose`: a spring is
 * state, and crossfading state between two poses is how a swing that starts
 * mid-stride teleports its own cloak.
 */
function drapeCloak(rig: WarriorRig, motion: WarriorMotion, dt: number, t: number, billow: number): void {
  const rings = rig.pivots.drape;
  const anchors = rig.pivots.drapeAt;
  const pivot = rig.pivots.cloak;
  if (!rings || !anchors || !pivot) return;

  // The yoke's world basis, so the field can be expressed in the frame the
  // bones actually turn in. Read off the matrix rather than rebuilt from the
  // pose angles: the chain from the rig group through the body and the spine is
  // four rotations deep and composing it by hand here is how the two drift
  // apart. Nothing in this graph scales, so the columns are orthonormal and a
  // dot product is the whole transform.
  pivot.updateWorldMatrix(true, false);
  const e = pivot.matrixWorld.elements;

  const fx = -motion.ax - DRAG * motion.vx;
  const fy = -GRAVITY;
  const fz = -motion.az - DRAG * motion.vz;
  const lx = fx * e[0] + fy * e[1] + fz * e[2];
  const ly = fx * e[4] + fy * e[5] + fz * e[6];
  const lz = fx * e[8] + fy * e[9] + fz * e[10];

  // Faded out as the wearer goes down. Once the yoke is horizontal the solve is
  // still right and is no longer useful: it hangs the cloak straight into the
  // turf, because the turf is the one collider this has no way to know about.
  // A corpse's cloak lying flat along his own back is both cheaper and truer.
  const upright = smooth(clamp01((e[5] - 0.25) / 0.45));
  // Floored rather than signed: past horizontal the atan2 wraps, and a wrapped
  // target whips the whole cloak through the body on its way to the far side.
  const down = Math.max(2, -ly);
  const w = motion.yawRate;
  // How still he is. The gather is what the cloth does when nothing is throwing
  // it anywhere, so it has to be the thing that goes first — a man at a dead run
  // has a cloak streaming at its cut radius, and a man standing has one that has
  // fallen in against him.
  const still = 1 - clamp01(Math.hypot(motion.vx, motion.vz) * 0.32 + Math.abs(w) * 0.24);
  const cols = DRAPE_COLS.length;

  for (let c = 0; c < cols; c++) {
    const a = anchors[c];
    // What a turn does, taken at each column's own place in the cloth. `ω × r`
    // points along −x at the back panel and along ±z at the wings, so one turn
    // sweeps the back sideways and throws the two leading edges fore and aft in
    // opposite directions. That is the swirl, and it is the one thing about a
    // cloak on a turning man that a single chain on the body axis could not say.
    const rx = -DRAG * w * a.z + w * w * a.x;
    const rz = DRAG * w * a.x + w * w * a.z;
    // The leg on this side of him goes through the cloth; the one on the far
    // side does not. Read off the committed pose rather than off velocity, so a
    // lunge photographed at a standstill still carries the cloak with it.
    const kick = mix(P.llx, P.lrx, (DRAPE_SIDE[c] + 1) * 0.5) * 0.30;
    const sway = Math.sin(t * 0.6 + motion.seed + c * 2.1) * 0.035
      + Math.sin(motion.seed * 3.7 + c) * 0.045;
    const wing = Math.abs(DRAPE_SIDE[c]);
    const fwd = mix(SWING_FWD, WING_FWD, wing);
    const tx = clamp((Math.atan2(-(lz + rz), down) + billow * BILLOW + kick) * upright, -fwd, SWING_BACK);
    const tz = clamp(
      (Math.atan2(lx + rx, down) + sway) * upright
      - DRAPE_SIDE[c] * (GATHER * still * upright - WING_SPLAY * (1 - still)),
      -SWING_SIDE, SWING_SIDE,
    );
    springRings(motion, 1 + c * DRAPE_RINGS, tx, tz, dt);
    if (c === Math.floor(cols / 2)) springRings(motion, 0, tx, tz, dt);
  }
  motion.draped = true;

  // Absolute angles down each chain, so every bone gets the difference against
  // the one above it. The hem also takes a twist: on a turn the cloth's azimuth
  // lags the body's, so a wing sweeps round rather than rolling flat, and the
  // two wings turn opposite ways because they are on opposite sides of the axis.
  const yx = clamp(motion.drapeX[0], -SWING_FWD, SWING_BACK);
  const yz = clamp(motion.drapeZ[0], -SWING_SIDE, SWING_SIDE);
  rings[0].rotation.set(yx, 0, yz);
  for (let c = 0; c < cols; c++) {
    let prevX = yx;
    let prevZ = yz;
    for (let r = 0; r < DRAPE_RINGS; r++) {
      const i = 1 + c * DRAPE_RINGS + r;
      // Clamped on the way out as well as on the way in: the springs overshoot
      // on purpose, and an overshoot is exactly where a limit earns its keep.
      const x = clamp(motion.drapeX[i], -WING_FWD, SWING_BACK);
      const z = clamp(motion.drapeZ[i], -SWING_SIDE, SWING_SIDE);
      const twist = r === DRAPE_RINGS - 1
        ? (-w * 0.07 - DRAPE_SIDE[c] * 0.05) * upright
        : 0;
      rings[i].rotation.set(x - prevX, twist, z - prevZ);
      prevX = x;
      prevZ = z;
    }
  }
}

/**
 * One column's springs, from the yoke's share down to the hem's.
 *
 * Sub-stepped because the stiff ring at 26 rad/s is past what semi-implicit
 * Euler holds at a 50 ms frame, and a cloak that explodes on one slow frame is
 * worse than no cloak. A warrior who has never been draped is placed on the
 * answer outright: he arrives with his cloak already hanging, not swinging up
 * into place from a T-pose, and a still allowed 26 frames to settle cannot
 * afford to photograph the transient either.
 */
function springRings(motion: WarriorMotion, base: number, tx: number, tz: number, dt: number): void {
  const first = base === 0 ? 0 : 1;
  const span = base === 0 ? 1 : DRAPE_RINGS;
  for (let r = 0; r < span; r++) {
    const i = base + r;
    const ring = RINGS[Math.min(RINGS.length - 1, first + r)];
    const gx = tx * ring.share;
    const gz = tz * ring.share;
    if (!motion.draped) {
      motion.drapeX[i] = gx;
      motion.drapeZ[i] = gz;
      motion.drapeXv[i] = 0;
      motion.drapeZv[i] = 0;
      continue;
    }
    const k = ring.freq * ring.freq;
    const c = 2 * ring.damp * ring.freq;
    const steps = Math.min(4, Math.max(1, Math.ceil(dt / CLOTH_STEP)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      motion.drapeXv[i] += ((gx - motion.drapeX[i]) * k - motion.drapeXv[i] * c) * h;
      motion.drapeX[i] += motion.drapeXv[i] * h;
      motion.drapeZv[i] += ((gz - motion.drapeZ[i]) * k - motion.drapeZv[i] * c) * h;
      motion.drapeZ[i] += motion.drapeZv[i] * h;
    }
  }
}

// ---------------------------------------------------------------------------
// Dismemberment
//
// The cut itself belongs to `characters.ts` — it owns the geometry, the pool and
// the wound. What is here is the two things a cut is not: *when* it happens, and
// what happens next.
//
// When is the frame the server says a man is dead, because the packet that
// empties his health bar is the packet that carries `deathZone`. Nothing is
// inferred and nothing is timed: two clients watching one death cut the same
// limb off, and a spectator joining afterwards rebuilds the same body from the
// same field on the player record.
//
// What happens next is two independent things that used to be one. The corpse is
// still a pose — it collapses through the layer below, and it has to, because a
// nameplate hangs off the node that does not move and the body underneath is
// what falls. The piece is not a pose at all; it is a rigid body with a mass and
// a centre of mass that is *not* its origin, integrated about that centre so it
// tumbles rather than spinning like a signpost. Those are the only two moving
// parts, and everything the owner asked for is a choice between them:
//
//   a leg goes and the *body* changes — the topple swings round the vertical
//   toward the side that is no longer holding him up, which is the difference
//   between a man falling over and a man being felled;
//   an arm goes and the body twists, because the mass it was balancing against
//   is gone and the shoulder that lost it swings free;
//   a head goes and the body does *not* topple at all — the legs simply stop,
//   and he goes down where he stood while the head carries the blow's momentum
//   off on its own;
//   the waist is the only case where both halves are objects: the top is the
//   piece and pitches onto its face, the bottom is the rig and folds where it
//   stood, because there is nothing above the belt left to topple.
//
// Nothing here allocates per frame and nothing runs per frame for a body that is
// intact, or for a piece that has come to rest.
// ---------------------------------------------------------------------------

/** How the collapse is bent by what is missing. All zero for an intact body. */
interface FallShape {
  /** Where the topple axis lies: +1 puts him on his left side, −1 on his right. */
  lean: number;
  /** Twist about the vertical through the fall; +1 turns toward his weapon side. */
  spin: number;
  /** 0 topples like a felled tree, 1 folds straight down where it stood. */
  crumple: number;
  /** Nothing above the belt is on this body any more. */
  halved: boolean;
}

const INTACT: Readonly<FallShape> = Object.freeze({ lean: 0, spin: 0, crumple: 0, halved: false });

/** A severed piece in free flight, integrated about its own centre of mass. */
interface Piece {
  part: THREE.Object3D;
  /** Centre of mass in the piece's frame. Off-origin, which is what makes it tumble. */
  com: THREE.Vector3;
  /** World position of that centre, and its derivatives. */
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** World angular velocity, rad/s. */
  spin: THREE.Vector3;
  quat: THREE.Quaternion;
  /** Contact radius — half the piece's narrowest dimension, so it lies down flat. */
  radius: number;
  /** Seconds of near-stillness in contact. Past `REST_HOLD` the piece sleeps. */
  still: number;
  asleep: boolean;
}

export interface Gore {
  built: BuiltCharacter;
  /** Where pieces are hung. Must have an identity world transform. */
  field: THREE.Object3D;
  cut: Severance | null;
  piece: Piece | null;
  /** One attempt per death, whatever came of it. Cleared on the road back. */
  done: boolean;
  /**
   * Weapon, shield or offhand that left with the piece. `applyPose` writes those
   * transforms every frame and they now live under a body that is somewhere else
   * — a sword still being posed after the fist holding it came off snaps back
   * into a hand that is not there.
   */
  dropped: Set<THREE.Object3D>;
  shape: FallShape;
  /** The terrain mesh, looked for once. `null` once the look has failed. */
  probe: THREE.Mesh | null | undefined;
  /** Last ground sample and where it was taken; see `groundUnder`. */
  gx: number; gz: number; gy: number;
}

function newGore(built: BuiltCharacter, field: THREE.Object3D): Gore {
  return {
    built, field, cut: null, piece: null, done: false,
    dropped: new Set<THREE.Object3D>(), shape: INTACT,
    probe: undefined, gx: 1e9, gz: 1e9, gy: 0,
  };
}

/**
 * What the collapse does about a missing part, keyed on the seam that was
 * actually taken rather than on the zone that was asked for. They are not the
 * same: the low tier refuses a bisection and takes the head instead, and a limb
 * whose parent seam has already gone severs nothing at all.
 */
function shapeOf(seam: SeamId | null): FallShape {
  switch (seam) {
    // He falls the way the missing leg was holding him up from.
    case "hipL": case "kneeL": return { lean: 1, spin: 0.25, crumple: 0.3, halved: false };
    case "hipR": case "kneeR": return { lean: -1, spin: -0.25, crumple: 0.3, halved: false };
    // Over onto the side that still has weight on it, twisting as it goes.
    case "shoulderR": case "elbowR": return { lean: 0.5, spin: 1, crumple: 0, halved: false };
    case "shoulderL": case "elbowL": return { lean: -0.5, spin: -1, crumple: 0, halved: false };
    // Straight down. A body whose head has gone does not decide which way to go.
    case "neck": return { lean: 0, spin: 0, crumple: 1, halved: false };
    case "waist": return { lean: 0, spin: 0, crumple: 0, halved: true };
    default: return INTACT;
  }
}

/**
 * How hard each piece leaves, per seam.
 *
 * `push` is along the blow's own bearing, `lift` is up and `out` is along the
 * stump's axis — a head goes up out of the collar, an arm goes out along itself.
 * `tumble` is end over end about the axis across the push and `twist` is about
 * the vertical, and the split between them is most of what tells a head from a
 * forearm in the air.
 *
 * Stated as the velocity that comes out rather than as an impulse divided by
 * `Seam.mass`, which would be the same table written twice: an axe does not
 * deliver a fixed impulse either, and what a viewer is judging is how far a
 * forearm carries against how little a 33 kg torso half does.
 */
const THROW: Record<SeamId, { push: number; lift: number; out: number; tumble: number; twist: number }> = {
  // 4.3 m/s of rise off a 1.55 m collar is an apex around head height again and
  // a second and a half in the air. Past about 5 it stops reading as a head
  // coming off and starts reading as a head being punted, which is the line the
  // reference class does not cross either.
  neck: { push: 2.9, lift: 3.2, out: 1.1, tumble: 11, twist: 5 },
  shoulderR: { push: 2.2, lift: 2.7, out: 1.7, tumble: 8.5, twist: 3 },
  shoulderL: { push: 2.2, lift: 2.7, out: 1.7, tumble: 8.5, twist: 3 },
  elbowR: { push: 2.5, lift: 3.0, out: 1.9, tumble: 10, twist: 3.5 },
  elbowL: { push: 2.5, lift: 3.0, out: 1.9, tumble: 10, twist: 3.5 },
  hipR: { push: 1.4, lift: 1.4, out: 1.2, tumble: 4.5, twist: 1.5 },
  hipL: { push: 1.4, lift: 1.4, out: 1.2, tumble: 4.5, twist: 1.5 },
  kneeR: { push: 1.8, lift: 1.8, out: 1.4, tumble: 6.5, twist: 2 },
  kneeL: { push: 1.8, lift: 1.8, out: 1.4, tumble: 6.5, twist: 2 },
  waist: { push: 1.6, lift: 2.0, out: 0.5, tumble: 3.2, twist: 1 },
};

/**
 * A shade over standard gravity. Debris at 9.81 reads floaty against a camera
 * this close to it, and every reference in the class cheats the same way.
 */
const GORE_G = 11.6;
/** Air, as one number. Enough to keep a light piece from carrying too far. */
const GORE_DRAG = 0.25;
/**
 * Hard ceiling on how fast anything leaves a body, upward. Chosen against
 * `GORE_G`: 4.4 m/s is 0.83 m of rise, so a head clears the shoulders of the man
 * who took it and comes down inside the same second.
 */
const RISE_CEIL = 4.4;
/** Below this it is not moving, it is resting; see `REST_HOLD`. */
const REST_SPEED = 0.4;
const REST_SPIN = 1.2;
const REST_HOLD = 0.2;

const _gv = new THREE.Vector3();
const _gu = new THREE.Vector3();
const _gq = new THREE.Quaternion();
const _gray = new THREE.Raycaster();
const _gdown = new THREE.Vector3(0, -1, 0);
const _gorigin = new THREE.Vector3();
const _ghits: THREE.Intersection[] = [];
const _gbox = new THREE.Box3();
const _gsize = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Take the limb off, on the frame the kill arrives, and throw it.
 *
 * Runs once per death and does nothing at all afterwards — `done` is set before
 * anything can fail, so a zone that severs nothing (a torso hit, a second cut on
 * a body already halved) costs one branch for the rest of the corpse's life.
 */
function beginGore(rig: WarriorRig, motion: WarriorMotion, player: GamePlayer, hooks?: AnimHooks): void {
  const g = rig.gore;
  if (g.done) return;
  g.done = true;
  if (!player.deathZone) return;

  const cut = g.built.sever(player.deathZone);
  // The shape the collapse takes is read off what came away, so a body that
  // refused the cut falls exactly as it always did.
  g.shape = shapeOf(cut?.seam ?? null);
  if (!cut) return;
  g.cut = cut;
  for (const held of cut.carried) g.dropped.add(held);
  g.field.add(cut.part);

  const t = THROW[cut.seam];
  const heavy = player.deathHeavy ? 1.32 : 1;

  // The blow's bearing, back out of body space into the world. `hitFwd` is the
  // line from the attacker to the man he killed, so this is the way the body was
  // already being pushed and the way the piece carries on going.
  const cy = Math.cos(motion.yaw);
  const sy = Math.sin(motion.yaw);
  _gv.set(
    motion.hitSide * cy - motion.hitFwd * sy,
    0,
    motion.hitSide * sy + motion.hitFwd * cy,
  );
  if (_gv.lengthSq() < 1e-6) _gv.set(sy, 0, cy);
  _gv.normalize();

  // Where the piece balances, and how big it is. One bounding box, once: the
  // contact radius is half the narrowest dimension, so an arm lies down on its
  // side instead of hovering at the length of itself.
  cut.part.updateMatrixWorld(true);
  _gbox.setFromObject(cut.part);
  _gbox.getSize(_gsize);
  const radius = clamp(0.5 * Math.min(_gsize.x, _gsize.y, _gsize.z), 0.05, 0.32);

  const vel = _gv.clone().multiplyScalar(t.push * heavy)
    .addScaledVector(UP, t.lift * heavy)
    .addScaledVector(cut.spray, t.out * heavy);
  // A neck stump points straight up, so `lift` and `out` were adding on the same
  // axis and a heavy multiplied the sum: 5.7 m/s off a 1.55 m collar, which is
  // 1.4 m of rise and a head that leaves the top of the frame. The tables' own
  // note draws the line at 5 — "past about 5 it stops reading as a head coming
  // off and starts reading as a head being punted" — so the ceiling is enforced
  // here rather than left to two entries that only collide on one seam.
  if (vel.y > RISE_CEIL) vel.y = RISE_CEIL;

  // End over end about the axis across the push, so the piece tumbles the way it
  // is travelling rather than about an axis of its own choosing. The upper half
  // of a bisection is the exception and gets the body's *facing* instead: it has
  // one thing to do, which is go over onto its face.
  const axis = cut.seam === "waist"
    ? _gu.set(sy, 0, cy).cross(UP).normalize().negate()
    : _gu.copy(UP).cross(_gv).normalize();
  const spin = axis.clone().multiplyScalar(t.tumble * heavy);
  // A side swing throws the piece round the vertical as well; an overhead or a
  // thrust has no such component and should not pretend to one.
  const yawSense = player.deathDir === "left" ? -1 : player.deathDir === "right" ? 1 : 0;
  spin.addScaledVector(UP, t.twist * yawSense * heavy);

  const pos = cut.com.clone().applyMatrix4(cut.part.matrix);
  g.piece = {
    part: cut.part, com: cut.com, pos, vel, spin,
    quat: cut.part.quaternion.clone(), radius, still: 0, asleep: false,
  };

  hooks?.onSever?.(cut, player);
}

/**
 * The piece, for the second or two it is a physics object.
 *
 * Integrated about the centre of mass rather than about the transform's origin,
 * which is the cut plane: a head hung off its own neck stump and spun about the
 * stump is a mace, and spun about the point it balances on it is a head.
 */
function stepPiece(gore: Gore, dt: number, at?: (x: number, z: number) => number): void {
  const p = gore.piece;
  if (!p) return;
  // The builder's pool is finite and reclaims the oldest piece on the field
  // under pressure — it takes `part` out of the scene to do it. A piece with no
  // parent has been taken back and is not ours to move any more.
  if (!p.part.parent) {
    gore.piece = null;
    gore.cut = null;
    return;
  }
  if (p.asleep) return;

  // Two substeps on a long frame. One 50 ms step through a bounce puts a head
  // through the turf and back out at the speed it arrived.
  const steps = dt > 0.026 ? 2 : 1;
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    p.vel.y -= GORE_G * h;
    p.vel.multiplyScalar(1 - GORE_DRAG * h);
    p.pos.addScaledVector(p.vel, h);

    const rate = p.spin.length();
    if (rate > 1e-4) {
      _gq.setFromAxisAngle(_gv.copy(p.spin).divideScalar(rate), rate * h);
      p.quat.premultiply(_gq).normalize();
    }
    p.spin.multiplyScalar(1 - 0.55 * h);

    const floor = groundUnder(gore, p.pos.x, p.pos.z, at) + p.radius;
    if (p.pos.y > floor) {
      p.still = 0;
      continue;
    }
    p.pos.y = floor;
    if (p.vel.y < -1.2) {
      // One weak bounce and no more. Flesh is not a ball and a limb that skips
      // twice reads as a prop with a bounciness slider.
      p.vel.y *= -0.22;
      p.vel.x *= 0.55;
      p.vel.z *= 0.55;
      p.spin.multiplyScalar(0.42);
    } else {
      p.vel.y = 0;
      // Hard friction, deliberately harder than anything real. A severed limb
      // that slides after it lands is the single loudest tell that the thing on
      // the ground is a box with gravity on it.
      const f = Math.pow(0.006, h);
      p.vel.x *= f;
      p.vel.z *= f;
      p.spin.multiplyScalar(Math.pow(0.02, h));
    }
    if (p.vel.lengthSq() < REST_SPEED * REST_SPEED && p.spin.lengthSq() < REST_SPIN * REST_SPIN) {
      p.still += h;
      if (p.still > REST_HOLD) {
        p.asleep = true;
        p.vel.setScalar(0);
        p.spin.setScalar(0);
      }
    } else {
      p.still = 0;
    }
  }

  // Origin from centre of mass: the transform the scene wants is the cut plane,
  // and what was integrated is the point the piece balances on.
  p.part.quaternion.copy(p.quat);
  p.part.position.copy(p.pos).sub(_gv.copy(p.com).applyQuaternion(p.quat));
}

/**
 * Ground height under a point, memoised.
 *
 * `heightAt` is arithmetic and a caller with one may ask every frame; the
 * fallback is a raycast against the terrain mesh and may not. Half a metre of
 * travel between samples is well inside what the interior of the moot is flat to
 * — the whole fighting floor lies within about 50 mm of the boot plane — and a
 * piece crosses it perhaps three times before it settles.
 */
function groundUnder(gore: Gore, x: number, z: number, at?: (x: number, z: number) => number): number {
  if (at) return at(x, z);
  if (Math.abs(x - gore.gx) < 0.5 && Math.abs(z - gore.gz) < 0.5) return gore.gy;
  gore.gx = x;
  gore.gz = z;
  gore.gy = probeGround(gore, x, z);
  return gore.gy;
}

/**
 * The terrain, without a handle on the world that built it.
 *
 * This is the part of the feature that is held together with string, and it is
 * worth saying why rather than hiding it: nothing hands this module the arena.
 * `FrameContext` carries a camera, a clock, a focus point and a quality tier,
 * and `vfx.ts` gets `heightAt` passed to its constructor because the frame
 * orchestrator builds it after the world. A rig is built the same way and could
 * be given the same function; until it is, the mesh is found by walking to the
 * scene root and taking the one terrain carries a `churn` attribute for. A miss
 * costs the feature nothing worse than the y = 0 every other body in this game
 * already stands on.
 */
function probeGround(gore: Gore, x: number, z: number): number {
  if (gore.probe === undefined) {
    gore.probe = null;
    let root: THREE.Object3D = gore.field;
    while (root.parent) root = root.parent;
    const world = root.getObjectByName("world");
    for (const child of world?.children ?? []) {
      if (child instanceof THREE.Mesh && child.geometry.hasAttribute("churn")) {
        gore.probe = child;
        break;
      }
    }
  }
  if (!gore.probe) return 0;
  _gray.set(_gorigin.set(x, 40, z), _gdown);
  _ghits.length = 0;
  gore.probe.raycast(_gray, _ghits);
  // Highest hit, not first: `Mesh.raycast` does not sort, and the terrain carries
  // a skirt 34 m below itself that a ray from above passes through on its way
  // out. Taking the wrong one buries the limb rather than landing it.
  let top = -Infinity;
  for (const hit of _ghits) if (hit.point.y > top) top = hit.point.y;
  return top > -Infinity ? top : 0;
}

/**
 * Back to one piece, for a respawn or a teardown.
 *
 * `reassemble` is what hands the pooled geometry back; skipping it does not lose
 * a limb, it loses somebody else's limb four deaths later when the slot it was
 * still holding is handed out again.
 */
function reassemble(rig: WarriorRig): void {
  const g = rig.gore;
  if (!g.done) return;
  g.built.reassemble();
  g.cut = null;
  g.piece = null;
  g.dropped.clear();
  g.shape = INTACT;
  g.done = false;
}

/**
 * Death, as a collapse.
 *
 * Three beats: the legs go, then the body topples about the feet under
 * something like gravity, then it lands and stops arguing. The old version
 * rotated the whole warrior to horizontal at a constant rate, which reads as a
 * felled tree — and took the nameplate down with it, because the plates hang
 * off the transform node this no longer touches.
 *
 * `shape` is what the body has lost. It bends the collapse rather than replacing
 * it: the same three beats, about an axis that has swung round toward the leg
 * that is missing, or with no topple in it at all because the head has gone.
 */
/**
 * What the MANNER of death does to the collapse — which is a different question
 * from what came off the body, and the two are read separately on purpose.
 *
 * `FallShape` is what he is missing. This is how he was killed. A man cut down
 * on his feet, a man burned, and a man already on the ground whose killer chose
 * to end it do not go down alike, and until this existed they went down
 * identically: `tools/freezetest.mjs` measured seven kinds of death and printed
 * three rows — plain blow, torso hit, and BURNING — with the same landing time
 * to the frame and the same shape columns. That is the "one canned clip played
 * on everyone" the brief exists to escape, and it was measurable.
 */
interface FallCause {
  /** Time scale on the whole collapse. Above 1 is a slower going-down. */
  pace: number;
  /** How far he folds up over himself instead of toppling out. */
  curl: number;
  /** How hard the ground is met — the size of every arrival jolt. */
  drive: number;
  /** How far the slack limbs spread once they are down. */
  splay: number;
}

/**
 * A cause, and the weight behind the blow that made it.
 *
 * FIRE is not a topple. Nobody pushed him; he stops being able to stand, and a
 * man who is burning is already folded over the thing that is hurting him. He
 * sags — slower than a felled man, because nothing is driving him — and he goes
 * down small, arms in rather than flung out.
 *
 * A FINISH used to be the third shape here — a man on the ground, not
 * resisting, swung at with intent. It came in with MERCY OR FINISH and it went
 * out with it (`docs/MERCY-REMOVED.md`), because the server can no longer
 * produce that cause: a lethal blow is a death on the tick it lands. The branch
 * is removed rather than left unreachable, so the switch and the wire agree.
 */
function causeOf(cause: DeathCause | null | undefined, heavy: boolean): FallCause {
  const h = heavy ? 1.3 : 1;
  switch (cause) {
    case "fire": return { pace: 1.16, curl: 0.85, drive: 0.55 * h, splay: 0.45 };
    default:     return { pace: 1.00, curl: 0.00, drive: 1.00 * h, splay: 1.00 };
  }
}

/**
 * THE TOPPLE, COMMITTED AS THE ROTATION IT HAS ALWAYS BEEN DESCRIBED AS.
 *
 * `deathLayer` has said this in its own comment for as long as it has existed:
 *
 *   "The topple is one angle about one axis, and `lean` says where that axis
 *    lies ... Resolving it as an axis rather than adding a roll term is what
 *    keeps the total a right angle however far round it goes — pitch and roll
 *    authored independently and both at 90° is a body lying on its face and its
 *    side at the same time, which is a body screwed into the turf."
 *
 * The sentence is right and the code was not doing it. It wrote the pitch into
 * `P.prx` and the roll into `P.prz`, and `applyPose` commits those with
 * `body.rotation.set(P.prx, P.pry, P.prz)` — a three.js Euler in XYZ order,
 * Rx·Ry·Rz. Three Euler angles are not an axis and an angle. Composed that way
 * the body's own up-vector does NOT end up `hypot(pitch, roll)` from vertical,
 * and the error is worst exactly where `P.pry` is largest — which is a man who
 * has lost an arm or a leg, because `shape.spin` drives the yaw.
 *
 * MEASURED on the build before this function existed, a warden killed with his
 * left arm off, four seconds after the blow:
 *
 *     prx -77.9°   prz -47.0°   ->  hypot 90.2°, which reads as flat on the turf
 *     head y 1.190 m, hip socket y 0.819 m
 *     standing, the same two joints are 1.648 m and 1.001 m
 *
 * He is at 72% of his standing height with his guard down and his arm off, and
 * he stays there for ever. That is the owner's fourth report, verbatim: "the
 * dead bodies are still sometimes freezing PARTIALLY RAISED, like there's no
 * gravity to them" — and "sometimes" is the tell, because it needs a severed
 * limb to show up at all.
 *
 * So: build the rotation. One angle about one horizontal axis, `mag` from
 * vertical whatever `lean` does with the axis, and the yaw laid on afterwards
 * about WORLD up — which cannot change how far from vertical he is, only which
 * way his head points once he is there. Then decompose it back into the same
 * three channels, so everything downstream that reads `P.prx`/`P.prz` —
 * `settleOnFeet`, `stops()`, the pose the harness measures — is reading one
 * orientation and not two.
 *
 * For small angles this is exactly what the old lines did; the two only come
 * apart as a body actually goes over, which is when it matters.
 *
 * No allocation: four module scratch objects, reused. This is per corpse per
 * frame and R12 is the performance ladder.
 */
const _tq = new THREE.Quaternion();
const _tyaw = new THREE.Quaternion();
const _tax = new THREE.Vector3();
const _teu = new THREE.Euler();
const _TUP = new THREE.Vector3(0, 1, 0);
function setTopple(pitch: number, roll: number, yaw: number): void {
  const mag = Math.hypot(pitch, roll);
  if (mag < 1e-6) { P.prx = pitch; P.pry = yaw; P.prz = roll; return; }
  _tq.setFromAxisAngle(_tax.set(pitch / mag, 0, roll / mag), mag);
  _tyaw.setFromAxisAngle(_TUP, yaw).multiply(_tq);
  _teu.setFromQuaternion(_tyaw, "XYZ");
  P.prx = _teu.x; P.pry = _teu.y; P.prz = _teu.z;
}

function deathLayer(d: number, fall: number, shape: FallShape, seed: number,
                    cause: DeathCause | null | undefined, heavy: boolean,
                    halfWidth: number): void {
  const c = causeOf(cause, heavy);
  // NO TWO MEN GO DOWN AT THE SAME SPEED. `seed` is the per-warrior constant the
  // idle already rides on; one sine of it is a decorrelated number in [-1, 1]
  // and costs nothing. +/-8% on the clock is not a thing anyone can name in a
  // single death and is the whole difference between eight men dropping in a
  // round and eight instances of one recording.
  const pace = c.pace * (1 + Math.sin(seed * 12.9898) * 0.08);
  const D = d / pace;

  const buckle = smooth(clamp01(D / 0.24));
  const over = easeInCubic(clamp01((D - 0.16) / 0.44));
  const rest = clamp01((D - 0.6) / 0.5);

  /**
   * THE GROUND STOPS A BODY UNEVENLY, and this is what replaces the single
   * `bounce` term the collapse used to share out across every joint it had.
   *
   * That term was one damped sine, evaluated once, added to the pelvis, both
   * shoulders, both elbows, both knees and the spine at THE SAME PHASE. A body
   * whose every joint rings together on one clock is a body that hit the ground
   * all at once, which is the one thing a falling man never does: he lands on
   * the knees he folded, then the hip and the shoulder he is going over onto,
   * and the head last. Three arrivals, three clocks, and the ringing of each is
   * its own — a knee against turf is a shorter, harder note than a head is.
   *
   * Scaled by `drive`, so a man driven down by a finishing blow meets the
   * ground harder than a man who sagged out of a fire.
   */
  const jolt = (at: number, ring: number, damp: number) =>
    D > at ? Math.exp(-damp * (D - at)) * Math.sin((D - at) * ring) * c.drive : 0;
  //
  // THE DAMPING IS WHAT MAKES THESE ARRIVALS AND NOT WOBBLES. The first cut ran
  // the head at 7.5, which rings for better than half a second — a skull still
  // moving on the turf 0.6 s after it got there, which is not a corpse, it is a
  // bobblehead. Measured through the whole pose path it also dragged the death
  // out to 1.55 s at 1e-2... at 1e-3, where nothing is visible anyway, and it
  // was the tail that no camera could cover rather than anything anyone sees.
  // Turf takes almost everything on the first contact; what is left is one
  // shallow settle. Meat damps hard.
  const hitKnee = jolt(0.30, 27, 14);
  const hitBody = jolt(0.58, 21, 12);
  const hitHead = jolt(0.76, 17, 11);
  // Kept under the old name for `halfLayer`, whose clock is its own and whose
  // legs are the only thing left to meet anything.
  const bounce = hitBody;

  if (shape.halved) {
    halfLayer(buckle, bounce, fall, D);
    return;
  }

  // The topple is one angle about one axis, and `lean` says where that axis
  // lies: straight across him for a whole body, swung round toward whichever
  // leg is no longer under him. Resolving it as an axis rather than adding a
  // roll term is what keeps the total a right angle however far round it goes —
  // pitch and roll authored independently and both at 90° is a body lying on its
  // face and its side at the same time, which is a body screwed into the turf.
  const sway = shape.lean * 1.05;
  // And how far over it goes at all. A man who has lost his head does not
  // topple; his legs stop holding him and he goes down where he stood.
  //
  // 0.18, not 0.62. At 0.62 the trunk stopped 34° off vertical and the capture
  // is a beheaded warrior still standing with his guard up — which is the one
  // failure this whole feature cannot survive, because a corpse that does not
  // lie down reads as the animation having broken rather than as a death. The
  // crumple's job is to change *how* he gets there, not whether: the knees go
  // first and `settleOnFeet` drops him onto them, and only then does what is
  // left of him go over. He still lands in his own footprint.
  // `curl` takes the same fraction off the topple that `crumple` does, and for
  // the same reason: a man who folds up over himself ends nearer his own feet
  // than a man who is pushed over. He still gets all the way down — the knees
  // fold and `settleOnFeet` reads the fold as reach — he just does not travel.
  const flat = (Math.PI / 2) * (1 - shape.crumple * 0.18 - c.curl * 0.16);
  const pitch = fall * flat * Math.cos(sway);
  const roll = flat * Math.sin(sway);
  // And he does not land square. A tenth of a radian of settling roll off the
  // seed is the difference between a body lying where it fell and a body laid
  // out, and it is the cheapest variation in the whole layer.
  const tilt = Math.sin(seed * 3.71) * 0.11;

  // The three channels are worked out exactly as they always were, and then
  // COMMITTED AS ONE ROTATION rather than as three independent Euler angles.
  // See `setTopple` above for the measurement that made this necessary.
  const wantX = mix(mix(fall * 0.34 * buckle, pitch * 1.03, over), pitch, rest) + hitBody * 0.06;
  // The old 0.2 of settling roll survives untouched on a whole body and gives
  // way to the real one as the lean takes over.
  const wantZ = (roll + fall * 0.2 * (1 - Math.abs(shape.lean))) * over + tilt * over + hitBody * 0.03;
  // Losing an arm is a torque and not a push: the shoulder that was balancing
  // the other one is gone, so the body keeps turning about the weight it has
  // left all the way to the ground. It builds over the whole fall rather than
  // with the topple, or the twist is over before the body has gone anywhere.
  const wantY = -fall * 0.16 * over + shape.spin * 0.95 * smooth(clamp01(d / 0.6));
  setTopple(wantX, wantZ, wantY);
  // How far from vertical he now is, and it is the hypotenuse HERE — at the one
  // place that is entitled to it, because this is the number handed to
  // `setTopple` as the angle and not a quantity read back off three Euler
  // channels. Everything below that used to ask `Math.abs(Math.sin(P.prx))`
  // asks this instead: after the decomposition `P.prx` is one component of an
  // orientation and no longer the topple, so a man who went over sideways read
  // as a man barely tilted and was dropped into the turf.
  const tmag = Math.hypot(wantX, wantZ);
  const lay = Math.abs(Math.sin(tmag));
  // Which body-local direction is pointing at the sky now he is over. Declared
  // here because the height solve below uses it too; the paragraph that derives
  // it sits with the limb spread, which is the other thing it decides.
  const spreadZ = tmag > 1e-6 ? -wantX / tmag : 1;
  const spreadX = tmag > 1e-6 ? wantZ / tmag : 0;

  // Rise as the body goes flat, or half of it ends up under the turf. The drop
  // of the collapse itself is not authored here: both knees fold below and
  // `settleOnFeet` takes the body down onto them — which is the difference
  // between a man whose legs went and a felled tree, and it is a difference
  // this rig could not express at all before there were knees to fold.
  //
  // AND HOW FAR IT RISES DEPENDS ON WHICH WAY HE WENT OVER, because a man is
  // not as thick as he is wide. 0.12 is the trunk's half-depth, chest to back,
  // and it was the whole of this term for as long as every corpse in the game
  // landed on its face — `settleOnFeet` is switched off above 1.1 rad of hip,
  // so once he is down this lift is the only thing holding him off the turf.
  // A man lying on his SIDE has to clear his own shoulder instead, and that is
  // twice as far: measured on a berserker who had lost a leg and therefore went
  // over sideways, his left shoulder pivot finished 0.082 m UNDER the turf,
  // which is exactly the 0.203 m the rig hangs that shoulder out at, less the
  // 0.12 m this line gave him.
  //
  // `halfWidth` is that shoulder offset read off the rig the frame is posing,
  // not a number typed in here, so a broader class of warrior clears his own
  // shoulder and not a warden's. `spreadX`/`spreadZ` say how much of each the
  // topple has turned toward the ground; they are the same two numbers the
  // limb spread below is resolved on, and they are a unit vector, so this is
  // the body's own half-extent along the direction that is now pointing down.
  P.py = (0.12 * Math.abs(spreadZ) + halfWidth * Math.abs(spreadX)) * lay
    + hitKnee * 0.022 + hitBody * 0.030;
  P.pz = fall * 0.06 * buckle;

  // A body going down rather than over folds at the spine on the way: it is the
  // only thing left saying which way he was facing once the topple is gone.
  P.crx = mix(fall * 0.42 * buckle, 0.05, over) + (shape.crumple * 0.5 + c.curl * 0.62) * over
    + hitBody * 0.05;
  P.crz = -fall * 0.16 * over;

  // THE HEAD IS LAST AND IT IS THE HEAVIEST THING ON HIM.
  //
  // It used to run on `over` — the torso's own clock — so the skull arrived at
  // the turf on the same frame as the ribs, which is a head bolted to a spine.
  // A head is a fifth of a body's mass on the end of the most slack joint in it:
  // the neck goes first, the head trails the shoulders all the way down, and
  // when the shoulders stop the head is still travelling and has to be stopped
  // separately by the ground.
  //
  // Two terms, and they are the two halves of that sentence. `lag` is the neck
  // giving out and the head arriving 0.15 s behind the body over a longer ramp;
  // `hitHead` is the ground taking the rest of it, on the latest and softest of
  // the three arrival clocks, because a head does not ring like a knee.
  //
  // And where it ENDS is the cause's too. A man who curled up round a fire has
  // his chin on his own chest; a man flung down by an axe has his head thrown
  // back off the shoulder he landed on. Without this the skull came to rest at
  // 0.08 rad whatever had killed him, which is three different collapses
  // arriving at one corpse — and the corpse is what stays on screen.
  const lag = easeInCubic(clamp01((D - 0.31) / 0.52));
  P.hrx = mix(fall * 0.5 * buckle, 0.08 + c.curl * 0.42, lag) + hitHead * 0.30 + hitBody * 0.16;
  P.hry = (0.55 - c.curl * 0.30) * lag + hitHead * 0.20 + tilt * 0.6;
  P.hrz = -0.25 * lag + hitHead * 0.16 - tilt * 0.5;

  // Limbs go slack and arrive after the body does. Once the body is flat its
  // local Z is world up, so a limb splayed on the pitch axis stands out of the
  // ground or buries itself in it — the settled pose spreads on roll instead,
  // which is the axis that still lies in the turf.
  //
  // THAT SENTENCE IS ONLY TRUE FOR A MAN WHO WENT OVER FORWARDS, and until the
  // topple was committed as a real rotation (see `setTopple`) no man ever went
  // over any other way, so it was never wrong on anything that happened. It is
  // wrong now. "Local Z is world up" holds when the topple axis is X; when
  // `lean` swings that axis round toward Z it is local X that ends up pointing
  // at the sky, and a limb spread on local Z is then spread straight down into
  // the turf. Measured the first time a warden with his left arm off actually
  // reached the ground: his right knee finished 0.10 m under it, and a
  // berserker who had lost a leg finished 0.37 m under.
  //
  // So resolve the spread the same way the topple is resolved, and resolve it
  // off the topple ITSELF rather than off `sway` — the first cut of these two
  // lines was written from `sway` and had the sign of the X term backwards,
  // which made the one-armed man WORSE (0.10 m under the turf to 0.18 m). The
  // topple is a rotation of `mag` about u = (wantX, 0, wantZ)/mag, so by
  // Rodrigues the body-local direction that ends up pointing at the sky is
  //
  //     v = R⁻¹·(0,1,0) = (wantZ, 0, -wantX)/mag   at a right angle of topple
  //
  // and THAT is the axis a limb has to spread about to stay in the turf. For a
  // man going straight over forwards it is local +Z and these lines are exactly
  // what they were. There is no free sign left in it.
  // The two arms do not go slack together and they do not land together. The
  // one he goes over onto is trapped under him early; the other is still being
  // carried when the body stops and drops afterwards. A tenth of a second
  // between them, off the same seed the rest of the collapse rides on.
  const skew = 0.06 + Math.sin(seed * 7.13) * 0.04;
  const limpA = clamp01((D - 0.10) / 0.5);
  const limpB = clamp01((D - 0.10 - skew) / 0.5);
  // `splay` is how far they end up FROM him. A man flung down by an axe lands
  // spread; a man who curled up round a fire lands with his arms against him,
  // and the difference is most of what tells the two apart on the ground.
  const spread = c.splay;
  const armSpreadR = mix(0.1, 0.92 * spread, limpA);
  const armSpreadL = mix(-0.1, -0.98 * spread, limpB);
  P.arx = mix(0.2, 0.04, limpA) + hitBody * 0.20 + hitHead * 0.10 + armSpreadR * spreadX;
  P.arz = armSpreadR * spreadZ;
  P.olx = mix(0.1, -0.06, limpB) + hitBody * 0.16 + hitHead * 0.08 + armSpreadL * spreadX;
  P.olz = armSpreadL * spreadZ;
  // Elbows fold IN as he curls and open out as he sprawls — the same one number
  // read the other way, so a burned man ends up holding himself.
  P.arb = mix(-0.52, mix(-0.20, -1.05, c.curl), limpA) + hitBody * 0.16;
  P.olb = mix(-0.60, mix(-0.16, -1.15, c.curl), limpB) + hitBody * 0.14;
  const legSpreadL = -0.3 * over * spread;
  const legSpreadR = 0.36 * over * spread;
  P.llx = mix(fall * 0.62 * buckle, -0.04, over) + hitKnee * 0.14 + hitBody * 0.08 + legSpreadL * spreadX;
  P.lrx = mix(fall * 0.48 * buckle, 0.05, over) + hitKnee * 0.17 + hitBody * 0.10 + legSpreadR * spreadX;
  // The knees are the first beat of the collapse and they go before anything
  // else moves — he drops onto them, and only then does the body carry over.
  // They straighten out again as he goes flat, which is both what a body on the
  // ground looks like and what keeps `settleOnFeet` from handing the corpse a
  // step up as its `standing` term fades out from under it.
  //
  // Unless the legs are what he is short of, or what he is short of is above
  // them. Then they never straighten: `settleOnFeet` reads the fold as reach and
  // takes the body down onto it, so a knee held at 1.2 rad is a man in a heap
  // rather than a man laid out, and that is the whole of "he went down where he
  // stood" — it is measured against his own leg rather than authored as a drop.
  // `curl` holds the knees the same way `crumple` does and for the same reason —
  // a man folding up does not straighten out on the ground, he stays gathered.
  const held = Math.max(shape.crumple, c.curl);
  // AND THEY STRAIGHTEN AFTER THE CHEST HAS LANDED, NOT WHILE IT IS FALLING.
  //
  // These ran on `over`, the topple's own clock, so the legs extended at exactly
  // the rate the trunk was going down — and a leg extending under a body that is
  // pitching forward LIFTS the knee off the ground it just knelt on. Measured on
  // the real rig: the knee rose from 0.07 m to 0.47 m between t+0.30 s and
  // t+0.45 s while the head was still falling. A man does not push himself up
  // with his legs on the way down.
  //
  // What actually happens is the other order: he drops onto his knees, his shins
  // stay where they are while the trunk carries over them, and the legs only
  // come out once his chest is on the turf and there is nothing left to hold up.
  // Hence a clock of its own, starting where `over` is already two thirds spent.
  const legOut = easeInCubic(clamp01((D - 0.46) / 0.44));
  P.lrb = mix(1.58 * buckle, mix(0.12, 1.24, held), legOut) + hitKnee * 0.20;
  P.llb = mix(1.34 * buckle, mix(0.09, 1.10, held), legOut) + hitKnee * 0.17;
  P.llz = legSpreadL * spreadZ;
  P.lrz = legSpreadR * spreadZ;
  P.wx = mix(0.4, -1.0, limpA);
  P.cloak = 0.55 * over;
}

/**
 * The bottom half of a bisection.
 *
 * THIS USED TO SAY "there is no topple in this because there is nothing above
 * the belt to topple", and it authored none. That sentence has the physics
 * backwards, and the harness that should have caught it was told not to look.
 *
 * What is left on the rig after `sever("waist")` is a pelvis and two legs. It
 * is not a tripod and there is no longer anything above it holding a line: what
 * kept a standing man's pelvis over his feet was a trunk being balanced there.
 * Take the trunk off and the half that stays has no reason to end upright and
 * every reason to go over. Measured on the build before this comment, it did
 * not: the pelvis stopped 24.7° from vertical with the hip socket 0.477 m up —
 * 0.50 of its own leg, HIGHER OFF THE TURF THAN A MAN ON HIS KNEES — and held
 * there for the rest of the round. That is the owner's fourth report on the one
 * body `tools/gravitytest.mjs` had a `!r.halved` filter over.
 *
 * So it goes down in the two beats a body with legs goes down in, and the
 * second one is the beat that was missing:
 *
 *   `sink`    the knees give and the pelvis drops onto them. `settleOnFeet`
 *             reads the fold as reach and takes it down; unchanged.
 *   `over`    and then it keeps going, because nothing is holding it up. One
 *             angle about one axis through `setTopple`, the same call the whole
 *             body uses, so the pelvis really does arrive flat rather than
 *             arriving at a hypotenuse that claims it did.
 *   `legOut`  the shins come out from under it as it goes, or the thing lands
 *             kneeling on top of its own folded calves. It is the same order as
 *             a whole body's collapse — knees first, legs out only once there is
 *             nothing left to hold up — and it is what lets `settleOnFeet`'s
 *             own drop fade out under the topple instead of dropping away.
 *
 * `flat` is short of a right angle by the same crumple fraction `deathLayer`
 * gives a man who folds rather than topples, because that is what this is.
 */
function halfLayer(buckle: number, bounce: number, fall: number, d: number): void {
  const sink = smooth(clamp01(d / 0.5));
  const over = easeInCubic(clamp01((d - 0.24) / 0.52));
  const legOut = easeInCubic(clamp01((d - 0.42) / 0.5));
  const flat = (Math.PI / 2) * (1 - 0.06);
  const wantX = mix(fall * 0.42 * sink, fall * flat, over) + bounce * 0.05;
  const wantZ = fall * 0.1 * sink + 0.26 * over;
  setTopple(wantX, wantZ, 0);
  // Same law as the whole body's: rise as it goes flat, or half of what is left
  // ends up under the turf once `settleOnFeet` has faded out from under it.
  P.py = -0.05 * sink + 0.12 * Math.abs(Math.sin(Math.hypot(wantX, wantZ))) + bounce * 0.03;
  P.lrb = mix(mix(1.7 * buckle, 1.95, sink), 0.62, legOut);
  P.llb = mix(mix(1.5 * buckle, 1.85, sink), 0.54, legOut);
  P.lrx = -0.25 * sink;
  P.llx = -0.18 * sink;
  // Splayed, because a pair of legs folding under nothing has no reason to keep
  // them together and every reason not to.
  P.lrz = 0.3 * sink;
  P.llz = -0.26 * sink;
  P.cloak = 0.4 * sink;
}

/**
 * Carry a severed piece with the body it came off.
 *
 * A piece is integrated in WORLD space and hung off the arena root, which is
 * exactly right while it is tumbling and exactly wrong the moment something
 * moves the corpse: the summary stage carries a man who died in the hearth out
 * onto clear ground, and without this his arm stays behind in the fire. The
 * piece is asleep by then, so this is a translation of a resting body — no
 * velocity is touched and nothing is re-thrown.
 *
 * The ground memo goes with it (`gx/gz` are where the last height sample was
 * taken); leaving it would let a piece carried onto a different height sit at
 * the old floor until it happened to wake.
 */
export function carryGore(rig: WarriorRig, dx: number, dz: number): void {
  const p = rig.gore.piece;
  if (!p) return;
  p.pos.x += dx;
  p.pos.z += dz;
  rig.gore.gx = 1e9;
  rig.gore.gz = 1e9;
  p.part.position.copy(p.pos).sub(_gv.copy(p.com).applyQuaternion(p.quat));
}

// ---------------------------------------------------------------------------
// Pose
// ---------------------------------------------------------------------------

export function poseWarrior(
  rig: WarriorRig,
  motion: WarriorMotion,
  player: GamePlayer,
  dt: number,
  ctx: FrameContext,
  hooks?: AnimHooks,
): void {
  const piv = rig.pivots;
  const t = ctx.time;
  const st = STANCE[rig.warriorClass] ?? STANCE.warden;

  // Handedness, every frame and on every body. One float compare and, on the
  // frame the player actually flips the switch, one write: the toggle has to
  // land on the men already standing in the ring, not only on the next one
  // built, or a left-hander turns it on mid-match and nothing happens.
  const wantMirror = handMirror();
  if (rig.mirror.scale.x !== wantMirror) rig.mirror.scale.x = wantMirror;
  if (player.id === ctx.localId) reportHand(rig, wantMirror);
  // Hip height is the length of the rigid leg, and the leg is what the body
  // has to stand on: everything vertical in here is measured against it.
  const legLen = piv.leftLeg.position.y || 1.02;

  Object.assign(P, ZERO);

  const dead = player.state === "dead";
  const rolling = player.state === "dodging" || player.state === "rolling";
  const staggered = player.state === "staggered";
  const casting = player.state === "ability";
  const shoving = player.state === "shoving";
  const floored = player.state === "knocked" || player.state === "rising";
  // One clock for whatever one-shot the warrior is in the middle of. Elapsed
  // time is the client's to keep; the server owns when the state ends.
  //
  // ONE CLOCK PER MOVE. NOT ONE CLOCK FOR ALL OF THEM.
  //
  // This line read `dead || rolling || staggered || casting || shoving ||
  // floored ? motion.actT + dt : 0`, so the clock was only ever zeroed by a
  // frame in which NONE of the six was true. A move entered straight out of
  // another therefore STARTED LATE — and it is the owner's third report, in
  // two halves, both of them measured:
  //
  //   "the bodies now also randomly lean back after certain actions but it's
  //    very dramatic — back bending over backwards dramatic, or flopping
  //    quickly down and up"
  //
  //   FLOPPING QUICKLY DOWN. A man killed out of a stagger handed `deathLayer`
  //   a clock already 0.65 s old, which is past `over`'s whole ramp, so the
  //   entire collapse — 6.5° to 91° — was crossed in the 0.1 s the crossfade
  //   takes. Measured at 60 fps on the real `poseWarrior`: worst ONE-FRAME
  //   move of the pelvis 33.2° out of a stagger and 22.5° out of a shove,
  //   against 2.1° from a standing start. gravitytest §2 gates it at 12°.
  //
  //   RANDOMLY LEAN BACK AFTER CERTAIN ACTIONS. The `motion.fall` edge below
  //   fires on `motion.actT <= dt`, and a carried clock is never <= dt, so the
  //   direction of the topple was NOT re-taken on a death out of one of those
  //   states: the corpse fell whichever way an EARLIER, unrelated event had
  //   set it. Driven end to end — a man knocked over backwards earlier in the
  //   round, back on his feet, then staggered, then killed by a blow from
  //   BEHIND — the current build lands him on his back at prx -90.0° out of a
  //   stagger, a roll and a shove, and on his face at +90.0° from idle. Same
  //   blow, same bearing, four different answers. "Randomly", and "after
  //   certain actions", exactly as reported.
  //
  // THE ONE EXCEPTION, and it is not a carve-out to buy a number. A man who
  // dies while he is ALREADY ON THE GROUND is not starting a new descent; he
  // is finishing the one he is in. Restarting his clock would evaluate
  // `deathLayer` at 0, which is a standing man — so the fix would stand a
  // corpse back up in order to drop him again. `knocked` carries the clock
  // into `dead` and measures 7.9°/frame, which is the last 17° of a body
  // settling and is what it should look like. `rising` does NOT carry: he is
  // on his way back up and nearly vertical, and carrying cost 9.7°/frame
  // where restarting costs 1.9°. `POSE_GROUP` folds both into "down", which
  // is right for the crossfade and cannot tell these two apart — hence
  // `lastRaw`.
  const group = POSE_GROUP[player.state] ?? player.state;
  const oneShot = dead || rolling || staggered || casting || shoving || floored;
  const sameMove = group === motion.lastState || (dead && motion.lastRaw === "knocked");
  motion.actT = oneShot ? (sameMove ? motion.actT + dt : dt) : 0;
  motion.lastRaw = player.state;
  // Which way he goes over, taken once on the edge and held for the whole fall
  // — reading `hitFwd` every frame would spin a man on the ground the moment a
  // second blow landed on him from a different bearing. `stepWarriorTransform`
  // has already latched the killing blow's bearing this frame (`struckDead`),
  // so the edge above firing is what makes that latch reach the corpse.
  if ((dead || floored) && motion.actT <= dt) motion.fall = motion.hitFwd >= 0 ? 1 : -1;
  // Every road back to standing goes through here: the server clears the death
  // mark on a respawn, on a countdown and on the lobby reset, and a warrior who
  // is not dead is a warrior whose limbs are back on him. Cheap on the frames it
  // does nothing, which is all but one of them.
  if (!dead) reassemble(rig);

  // The wire delivers a state change as a step, and the pose on either side of
  // one has no reason to be continuous — a man parried out of a raised guard
  // has his shield arm 60° from where the stagger wants it. This is the only
  // thing that smooths across states, and it lasts a twentieth of a second
  // going into a swing, where the windup is doing the work anyway.
  if (group !== motion.lastState) {
    // Not on the very first frame: `rig.last` is all zeroes then, so a warrior
    // who arrives mid-swing would spend his opening frame blended into a T-pose
    // and only reach the pose the server asked for once the crossfade expired.
    // Live that is one frame of mush; in a still it is the whole photograph.
    motion.blend = motion.lastState === "" ? 0 : 1;
    motion.lastState = group;
  }
  motion.blend = Math.max(0, motion.blend - dt * (player.state === "attacking" ? 22 : 10));

  if (dead) {
    // A man cut down mid-flourish stopped celebrating; nothing may resume it
    // on the respawn.
    motion.emote = null;
    // The cut goes in before the pose is built, so the collapse's first frame is
    // already the collapse of a body that is missing something.
    beginGore(rig, motion, player, hooks);
    deathLayer(motion.actT, motion.fall, rig.gore.shape, motion.seed,
      player.deathCause, !!player.deathHeavy, Math.abs(piv.rightArm.position.x));
    stops();
    settleOnFeet(legLen, 0);
    motion.leanX *= 0.9;
    commit(rig, piv, st, motion.blend, 0);
    drapeCloak(rig, motion, dt, t, P.cloak);
    stepPiece(rig.gore, dt, hooks?.groundAt);
    // No strobe. See the note at the live-body site below — and note that this
    // one was drawing a CORPSE flickering in and out of existence, because a
    // dead man in solo keeps his respawn grace flag until the tick clears it.
    fadeBlob(rig, 1);
    return;
  }

  // ---- ON THE GROUND ----
  //
  // Its own branch, and it takes the same shape as the death branch above for
  // the same reason: a man on the floor has no stance, no idle sway and no
  // gait, and letting those layers run underneath would have the pose fighting
  // a body that is trying to stand up. The one thing that DOES still run is the
  // travel — `settleOnFeet` is called with the fall's own hip angle, so a man
  // slid across the turf by the blow that floored him arrives lying down rather
  // than skating on his heels.
  if (floored) {
    motion.emote = null;
    const total = KNOCKDOWN.down + KNOCKDOWN.rise;
    const left = player.downTimer ?? 0;
    knockLayer(total - left, left, KNOCKDOWN.rise, motion.fall, motion.hitSide);
    stops();
    settleOnFeet(legLen, 0);
    // The layer weights are bled off while he is down, not left where the fall
    // caught them. Without this a man floored mid-stride stands back up with
    // `wMove` still at 1 and takes a phantom step on the frame he arrives —
    // which is the glide bug in miniature, and it would have shipped invisible
    // in a still and obvious in a strip.
    motion.wMove = approach(motion.wMove, 0, dt, 9);
    motion.wAction = approach(motion.wAction, 0, dt, 9);
    motion.wBlock = approach(motion.wBlock, 0, dt, 9);
    motion.flinch = Math.max(0, motion.flinch - dt * 4);
    commit(rig, piv, st, motion.blend, 0);
    drapeCloak(rig, motion, dt, t, P.cloak);
    fadeBlob(rig, player.invincible ? 0.5 : 1);
    return;
  }

  // ---- lean into the velocity vector ----
  const spd = Math.hypot(player.velocity?.x || 0, player.velocity?.z || 0);
  const velAngle = Math.atan2(player.velocity?.x || 0, player.velocity?.z || 0);
  const sideLean = Math.sin(velAngle - motion.yaw) * Math.min(0.16, spd * 0.03);
  motion.leanX += (sideLean - motion.leanX) * Math.min(1, dt * 8);
  const fwdLean = -Math.cos(velAngle - motion.yaw) * Math.min(0.1, spd * 0.018);

  const attacking = player.state === "attacking";
  const blocking = player.state === "blocking";

  // ONE CHANNEL, TWO FACTS — fourth sighting of this shape in the codebase.
  // `state` is a single slot that carries both the guard/commit fact and the
  // locomotion fact, and the guard WINS the slot: a blocking man walking
  // backwards is "blocking" on the wire, never "walking", so feet gated on the
  // locomotion names froze while the server translated him — the glide. (The
  // engine hit the same wall three times before: steering vs burst velocity
  // split into moveVel/impulse, `direction` on the hit message meaning swing
  // not body part, roundWins keyed by player or team needing roundScoreBy.)
  // The honest movement channel is `velocity`, which engine.mjs keeps as the
  // serialized total of stride and impulse — so the feet are driven off THAT,
  // and `state` keeps only what it can actually name: the guard, the swing,
  // the roll. When a fifth slot grows a second fact, split the wire, not the
  // reader.
  //
  // The states whose layers own the whole body, feet included, stay off the
  // gait: a swing's lunge, a roll and the shout author their own legs, and
  // gait under them would fight authored keys rather than correct a lie. A
  // stagger is deliberately NOT in that set — the server carries momentum
  // through it (and a shove throws a man metres while staggered), so the feet
  // stumble along under the stagger layer instead of skating.
  const bodyOwned = attacking || rolling || casting || shoving;
  const moving = !bodyOwned && spd > 0.15;

  // Layer weights are the only thing smoothed. A state arrives on the wire as a
  // step, and a step in the weight — not in the pose — is what keeps a swing
  // crisp while still not snapping into it from a standing start.
  motion.wMove = approach(motion.wMove, moving ? 1 : 0, dt, 9);
  motion.wBlock = approach(motion.wBlock, blocking ? 1 : 0, dt, 14);
  // Snaps in, releases slowly. It has to snap in or the windup is half over
  // before the layer has any weight; it has to release slowly because the wrist
  // solve hands the blade back to the class carry angle as this falls, and a
  // spear recovering to upright over three frames is a whip crack.
  motion.wAction = approach(motion.wAction, attacking ? 1 : 0, dt, attacking ? 20 : 7);

  const swing = readSwing(motion, player, dt);
  const hp = player.maxHealth > 0 ? player.health / player.maxHealth : 1;
  const wounded = clamp01((0.4 - hp) / 0.34);

  // How braced the man is. Idling in the open he stands off his guard; the
  // moment he is moving, swinging or covering he is on it.
  const ready = clamp01(motion.wMove * 0.55 + motion.wAction + motion.wBlock + (staggered ? 0.4 : 0) + (shoving ? 0.7 : 0));
  stanceLayer(st, ready, motion.wAction, 1);

  const calm = clamp01(1 - motion.wAction - motion.wBlock * 0.7 - motion.wMove * 0.85);
  if (calm > 0.001) idleLayer(t, motion.seed, wounded, calm);
  // The legs step whenever the body travels; the ARMS only counter-swing when
  // nothing owns them — a guarded walk keeps the shield up and a staggered
  // stumble keeps the arms where the stagger threw them.
  const gaitArms = clamp01(1 - motion.wBlock - (staggered ? 0.75 : 0));
  if (motion.wMove > 0.001) gaitLayer(motion, Math.max(spd, 1.4), legLen, dt, motion.wMove, gaitArms);
  motion.land = Math.max(0, motion.land - dt * 7);

  if (motion.wAction > 0.001) attackLayer(player.attackDir, swing, motion.heavy, !!rig.shield, motion.wAction);
  if (motion.wBlock > 0.001) blockLayer(!!rig.shield, clamp01(player.blockTimer / 0.22), motion.wBlock);
  if (shoving) shoveLayer(clamp01(motion.actT / (SHOVE.windup + SHOVE.recover)), !!rig.shield, smooth(clamp01(motion.actT / 0.06)));

  // The emote rides on top of idle, walk and guard, and is simply dropped by
  // anything that owns the body — a man who starts a swing mid-flourish is a
  // man who stopped celebrating, and the layer must not fight the windup.
  if (motion.emote) {
    if (bodyOwned || staggered) {
      motion.emote = null;
    } else {
      motion.emoteT += dt;
      const ph = motion.emoteT / EMOTE_SECONDS;
      if (ph >= 1) motion.emote = null;
      else emoteLayer(motion.emote, ph, !!rig.shield);
    }
  }

  if (staggered) {
    // Elapsed over elapsed-plus-remaining is exact progress through a stagger
    // whose length nobody sends us: the client owns the first term, the server
    // owns the second, and neither has to agree on a constant. Ramped in over
    // five frames, because the head snapping is the flinch layer's job and it
    // has already fired — the arms can afford to arrive behind it.
    staggerLayer(t, motion.actT / Math.max(0.2, motion.actT + player.staggerTimer), motion,
      smooth(clamp01(motion.actT / 0.09)));
  }
  if (rolling) dodgeLayer(motion.actT / 0.34, Math.sin(velAngle - motion.yaw), smooth(clamp01(motion.actT / 0.07)));
  if (casting) abilityLayer(motion.actT, 0.8);
  if (motion.flinch > 0.001 && !staggered) flinchLayer(motion, 1 - motion.wAction * 0.45);

  // Velocity lean rides on the spine, not on the transform node: a body that
  // leans from the ankles takes its own shadow and its nameplate with it.
  P.prx += fwdLean * 0.45;
  P.crx += fwdLean * 0.85;
  P.prz += motion.leanX * 0.4;
  P.crz += motion.leanX * 0.7;
  P.cloak += moving ? 0 : 0.1 + Math.sin(t * 1.4 + motion.seed) * 0.05;
  // An ability running in the background is carried, not performed.
  if (player.abilityActive) {
    P.crx += -0.05;
    P.arz += 0.06;
    P.olz += -0.08;
  }

  stops();
  // The plant is off while he is walking and back on the moment he is not, so a
  // stride keeps its foot clearance and a guard keeps both boots on the ground.
  //
  // The SLACK rides on `calm`, not on the plant. A man on his guard has both
  // boots flat and gets none; a man standing at ease is resting on one leg with
  // the other heel off the turf, and 50 mm of leg is what that heel is worth.
  // Without it the plant straightens the very knee `idleLayer` just bent — see
  // `settleOnFeet` — and the free leg is the one it straightens, every time.
  settleOnFeet(legLen, 1 - motion.wMove, calm * 0.05);
  commit(rig, piv, st, motion.blend, ready);
  drapeCloak(rig, motion, dt, t, P.cloak);
  fadeBlob(rig, 0);
  // THE BODY DOES NOT BLINK. It used to: `rig.body.visible` was toggled at
  // 12 Hz for as long as `player.invincible` was true, and that one line was
  // the whole of the countdown flashing the owner reported.
  //
  // Two things were wrong with it. The first is the bug — the flag's clock does
  // not run during `countdown` (see `grace.mjs` and the note in `startRound`),
  // so the strobe outlived the countdown by the grace's full length. The second
  // is that it should never have been on the body at all. A 12 Hz visibility
  // toggle is an arcade convention: it says "a rule is in force", not "this man
  // cannot be hurt yet". On a fire-lit, near-black frame it is the loudest
  // thing on screen — it pops the rim light, the cloak, the shadow and the
  // silhouette together, on every warrior at once, at the frequency the eye is
  // most sensitive to. It is the same register as the lock-on mark that read as
  // "too game-like & basic", and it is precisely the "UI blink over a fire-lit
  // frame" that `hud3d.ts` already warns against next to `uFlash`.
  //
  // Grace is a status, and status lives on the plate. `hud3d`'s `setGuard` now
  // carries it as a STEADY warm gild on the plate's own bevel — no oscillation,
  // nothing touching the body, arriving and leaving on an ease. It is off for
  // every frame of the countdown, so the men stand whole and lit in the ring
  // while the numeral counts, which is what men waiting for a fight look like.

  // ---- blade trail ----
  if (attacking && hooks?.onBladeTrail) {
    motion.trailTick += dt;
    const live = swing > LOAD_END * 0.9 && swing < 0.9;
    if (live && motion.trailTick > 0.042) {
      motion.trailTick = 0;
      // Emitted from where the blade actually is. Cheap because it only runs a
      // few times a swing: three matrices up the chain, not a scene traverse.
      rig.weapon.updateWorldMatrix(true, false);
      TIP.set(0, rig.reach * 0.82, 0).applyMatrix4(rig.weapon.matrixWorld);
      const strike = clamp01((swing - LOAD_END) / (IMPACT - LOAD_END));
      hooks.onBladeTrail(TIP.clone(), player.warriorClass, strike);
    }
  } else {
    motion.trailTick = 0;
  }
}

/**
 * Anatomical stops, applied to the assembled pose and before the foot solve
 * reads it.
 *
 * Layers add, and two of them stacking is how a spine ends up turned further
 * than a spine turns — which on a torso split at the belt shows as the mail
 * sliding off the hips. The hinges matter more than the spine did: an elbow or a
 * knee a tenth of a radian the wrong side of straight does not read as a stiff
 * pose, it reads as a broken limb, and with four layers able to touch each one
 * that is a matter of when rather than whether.
 */
function stops(): void {
  P.cry = clamp(P.cry, -0.55, 0.55);
  P.crx = clamp(P.crx, -0.5, 0.62);
  P.crz = clamp(P.crz, -0.36, 0.36);
  P.arb = clamp(P.arb, -2.45, 0.02);
  P.olb = clamp(P.olb, -2.45, 0.02);
  P.lrb = clamp(P.lrb, 0, 2.35);
  P.llb = clamp(P.llb, 0, 2.35);
  P.waw = clamp01(P.waw);
}

/** Blend out of the pose that was on the body last frame, then write this one. */
function commit(rig: WarriorRig, piv: RigPivots, st: Stance, blend: number, ready: number): void {
  if (blend > 0) {
    const k = smooth(blend);
    for (const c of CHANNELS) P[c] = mix(P[c], rig.last[c], k);
  }
  Object.assign(rig.last, P);
  applyPose(rig, piv, st, ready);
}

function applyPose(rig: WarriorRig, piv: RigPivots, st: Stance, ready: number): void {
  const body = rig.body;
  body.position.set(P.px, P.py, P.pz);
  body.rotation.set(P.prx, P.pry, P.prz);
  piv.chest.rotation.set(P.crx, P.cry, P.crz);
  piv.head.rotation.set(P.hrx, P.hry, P.hrz);
  piv.rightArm.rotation.set(P.arx, P.ary, P.arz);
  piv.leftArm.rotation.set(P.olx, P.oly, P.olz);
  piv.rightLeg.rotation.set(P.lrx, 0, P.lrz);
  piv.leftLeg.rotation.set(P.llx, 0, P.llz);
  // Hinges: X only. Everything above them already turns, and a knee given a
  // second axis is a knee that can be put on backwards.
  piv.elbowR.rotation.x = P.arb;
  piv.elbowL.rotation.x = P.olb;
  piv.kneeR.rotation.x = P.lrb;
  piv.kneeL.rotation.x = P.llb;

  // The wrist, solved out of where the blade is meant to be pointing rather
  // than authored beside the joints that also move it. `wa` is an absolute
  // pitch, so subtracting the shoulder, the elbow and the builder's grip leaves
  // exactly the wrist that lands it; `WRIST_*` is the envelope a hand actually
  // has, so an aim the arm cannot reach comes out as a hand at its limit and
  // not as a hand on backwards. Aim and carry crossfade on `waw`, which is the
  // action layer's own weight — the carry angles are still what he holds a
  // weapon at when he is not swinging it.
  // How far down the aim may go before the weapon is in the turf, off the reach
  // this warrior's weapon actually measured. One aim serves four classes — an
  // overhead is an overhead — but a 1.9 m spear swung to the same angle as a
  // 0.9 m axe buries 1.3 m of itself, and a blade through the ground is the
  // sort of thing §10 of the bar throws a whole frame out for.
  const floor = Math.acos(clamp(-STRIKE_LOW / Math.max(0.4, rig.reach), -1, 1));
  // The spine and the pelvis are in this sum too, and they have to be: an aim is
  // only absolute if everything between it and the ground is accounted for. A
  // torso pitched 26° into a blow — which is what the overhead's own spine key
  // asks for — was adding that 26° straight onto the blade and putting the point
  // through the turf while the aim still read as level.
  // Everything under the wrist, as one angle: the blade's pitch is this plus
  // whatever the weapon is turned to in the fist.
  const base = P.prx + P.crx + P.arx + P.arb + rig.gripPitch;
  // In line with the forearm, pointing away from the shoulder. The envelope is
  // measured off this rather than off zero so it survives a change of grip
  // pitch in the builder, and the solve is unwrapped onto the branch nearest it
  // before it is clamped. That unwrap is not tidiness: `wa` sweeps one way
  // through a strike and the arm carrying it sweeps the other, so the angle
  // between them wraps past ±π mid-swing — and read on the far branch it is a
  // hand at 130°, which the clamp then resolves by driving the blade into the
  // ground instead of over the shoulder.
  const inLine = Math.PI - rig.gripPitch;
  // Crossfaded where a viewer sees it — on the blade — and taken deliberately
  // *through vertical* rather than by the shorter arc. A spear carried upright
  // and an overhead's cocked load are 190° apart, so the short way between them
  // is the way round through straight-down: the point ploughs the turf on the
  // opening frames of every swing, which is what the first cut of this did. Both
  // ends wrapped onto (−π, π] and lerped plainly is the way over the shoulder.
  const carry = wrapPi(base + P.wx);
  const want = mix(carry, Math.min(P.wa / (P.waw || 1), floor), clamp01(P.waw)) - base;
  const solved = clamp(want + TAU * Math.round((inLine - want) / TAU), inLine - WRIST_BACK, inLine + WRIST_FWD);
  const wrist = P.waw > 1e-4 ? solved : P.wx;
  // What the corpse dropped. A weapon that left with the arm holding it now
  // lives under a piece of body somewhere else in the scene, and writing a carry
  // angle onto it every frame would spin an axe about a fist that is no longer
  // attached to anybody. Empty for every warrior who has not been dismembered,
  // which is a set lookup against a set of size zero.
  const gone = rig.gore.dropped;
  if (!gone.has(rig.weapon)) {
    rig.weapon.rotation.set(wrist, 0, P.wz);
    rig.weapon.position.y = P.wy * st.slide;
  }
  // And the hand goes with it. The mount's pitch is already in the bone's bind
  // pose, so this adds the same turn the weapon just took rather than replacing
  // it — `Rx(grip)·Rx(wrist)·Rz(roll)` on the weapon is `Rx(grip + wrist)·Rz(roll)`
  // on the fist, exactly. Without it the fingers close on the axis the builder
  // baked and the haft runs past behind them; with it the closed ring is on the
  // shaft, which is the whole of "he is holding it".
  // A spear runs through the fist on a thrust, which is most of what makes a
  // thrust read; a sword only creeps, because a hand sliding down a blade is a
  // different and much worse-looking idea. Written above, with the rotation, so
  // both are behind the same guard.
  piv.wristR.rotation.set(rig.gripPitch + wrist, 0, P.wz);
  if (rig.offhand && !gone.has(rig.offhand)) {
    // The second seax mirrors the main hand, a beat behind and never as far.
    // `wrist + P.arb` is where the weapon hand is pointing once its elbow is
    // counted; subtracting the off elbow gives the same aim from the other arm
    // rather than the same wrist angle, which after the elbows went in are two
    // very different things.
    const lead = wrist + P.arb;
    rig.offhand.rotation.set(mix(st.rest, lead, 0.55) - P.olb, 0, -P.wz * 0.6);
    // The off fist follows its own seax on the same argument as the main one.
    piv.wristL.rotation.set(rig.gripPitch + rig.offhand.rotation.x, 0, rig.offhand.rotation.z);
  }
  if (rig.shield && !gone.has(rig.shield)) {
    // The pitch is solved, not authored: the disc gives back whatever the
    // shoulder and elbow just did to it, so it stays upright in the world while
    // the arm swings under it. That is what a wrist is for, and a shield that
    // pitches with the forearm reads as a tray being carried. Not quite all of
    // it — 0.94 leaves the carry a little live, so the guard is not perfectly
    // gyro-stabilised.
    rig.shield.rotation.set(
      -(P.olx + P.olb) * 0.94 + SHIELD_LEAN + P.sx,
      mix(SHIELD_REST_YAW, SHIELD_GUARD_YAW, ready) + P.sy,
      SHIELD_ROLL + P.sz,
    );
    // And the disc is placed by its *grip*, which is the point the fist closes
    // on, rather than by its origin. Solved each frame because the offset has to
    // be taken in the shield's own turned frame — placing it by the origin is
    // what left the boss 300 mm clear of the hand holding it.
    GRIP.set(0, 0, SHIELD_GRIP_Z).applyEuler(rig.shield.rotation);
    rig.shield.position.set(
      rig.offGrip.x - GRIP.x,
      rig.offGrip.y - GRIP.y + P.sfy,
      rig.offGrip.z - GRIP.z + P.sfz,
    );
  }
}

/**
 * The painted contact patch, on the tiers with no shadow map to do it properly.
 * It tightens as the body settles and spreads as it rises, which is the only
 * cue those tiers get that the warrior is standing on something.
 */
function fadeBlob(rig: WarriorRig, down: number): void {
  if (!rig.blob.visible) return;
  const off = Math.min(0.35, Math.abs(P.py));
  rig.blob.scale.setScalar(1 - off * 0.5 + down * 0.5);
  (rig.blob.material as THREE.MeshBasicMaterial).opacity = 0.38 * (1 + off * 0.4) * (1 - down * 0.5);
}
