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

import * as THREE from "three";
import type { GamePlayer, WarriorClass } from "../../types";
import { WARRIOR_STATS } from "../../types";
import {
  buildCharacter, buildWeaponForClass, buildShield,
  defaultAppearance, type Appearance, type BuiltCharacter,
} from "../characters";
import type { MaterialLibrary } from "./materials";
import type { FrameContext, QualitySettings } from "./quality";

/** Tunic accent per class — the fastest read of who you are fighting. */
const CLASS_TUNIC: Record<string, number> = {
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
  cloak?: THREE.Group;
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
  /** The character itself, under `group`. Carries the whole pose. */
  readonly body: THREE.Group;
  readonly pivots: RigPivots;
  readonly weapon: THREE.Group;
  /** The runekeeper's second seax, posed as a mirror of the main hand. */
  readonly offhand?: THREE.Group;
  readonly shield?: THREE.Group;
  /** Distance from fist to weapon tip, measured once. Where trails are emitted. */
  readonly reach: number;
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
  /** The pose applied last frame. Where a state change is blended out of. */
  readonly last: Pose;
  dispose(): void;
}

/** Per-warrior smoothing state — network and animation. Mutated here. */
export interface WarriorMotion {
  /** Smoothed render position — the server position is never used directly. */
  rx: number;
  rz: number;
  yaw: number;
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
  /** Smoothed 0..1 progress through the current swing. */
  swing: number;
  /** Length of the swing in flight, learned from the timer the server sends. */
  swingDur: number;
  /** Last attackTimer seen, to spot a new swing and a live (ticking) clock. */
  swingPrev: number;
  swingLive: boolean;
  /** 0..1 blend toward the heavy-attack read: bigger arc, worse recovery. */
  heavy: number;

  // ---- reactions ----
  /** Flinch envelope, 1 at the moment of the blow. */
  flinch: number;
  /** Direction of the last blow in body space: +Z forward, +X weapon side. */
  hitFwd: number;
  hitSide: number;
  /** Seconds spent in the current one-shot state (dodge, stagger, shout, death). */
  actT: number;
  /** 1 on the frame the server state changed, decaying; crossfades the pose. */
  blend: number;
  /** The state that blend is coming out of. */
  lastState: string;
  /** Which way the corpse goes over; decided once, at the moment of death. */
  fall: number;

  // ---- layer weights ----
  wMove: number;
  wBlock: number;
  wAction: number;
}

export interface AnimHooks {
  /** A blade is mid-arc at this world position. */
  onBladeTrail?(position: THREE.Vector3, cls: WarriorClass, strike: number): void;
}

export function createMotion(p: GamePlayer): WarriorMotion {
  return {
    rx: p.position.x, rz: p.position.z, yaw: p.rotation,
    leanX: 0, recoil: 0, trailTick: 0,
    stride: hash01(p.id) * Math.PI * 2, land: 0, seed: hash01(p.id + "s") * 6.28,
    swing: 0, swingDur: WARRIOR_STATS[p.warriorClass]?.attackSpeed ?? 0.6,
    swingPrev: 0, swingLive: false, heavy: 0,
    flinch: 0, hitFwd: -1, hitSide: 0, actT: 0, blend: 0, lastState: "", fall: -1,
    wMove: 0, wBlock: 0, wAction: 0,
  };
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
  const built = buildCharacter(cls, ap, CLASS_TUNIC[cls] ?? 0x5a4a2c, materials, settings.tier);
  const body = built.group;

  // Crown height, measured now — before a weapon is in the fist, because the
  // warden's spear stands a metre over his head and the HUD would hang its
  // plate off the spear point. Stature is per class and the builder moves it,
  // so a constant here would silently float or sink every plate in the game the
  // next time a proportion changes.
  const crown = new THREE.Box3().setFromObject(body).max.y;

  // The hand mounts are the last child each arm builder adds.
  const rightHand = handOf(built.rightArm);
  const leftHand = handOf(built.leftArm);

  const weapon = buildWeaponForClass(cls, materials);
  weapon.name = "weapon";
  rightHand.add(weapon);

  let offhand: THREE.Group | undefined;
  if (cls === "runekeeper") {
    offhand = buildWeaponForClass("runekeeper", materials);
    offhand.scale.setScalar(0.9);
    leftHand.add(offhand);
  }

  let shield: THREE.Group | undefined;
  if (cls === "huscarl") {
    // Carried in front of the chest, disc plate facing the enemy (+Z).
    shield = buildShield(ap.cloak !== "none" ? 0x5c2320 : 0x6b4226, materials);
    shield.position.set(-0.14, -0.4, 0.26);
    shield.rotation.set(0.22, 0.16, 0.14);
    built.leftArm.add(shield);
  }

  // Weapon and shield are mounted by now, so one walk covers the whole warrior.
  // Every mesh casts and every mesh receives: a pauldron has to darken the
  // sleeve under it, or layered kit reads as one painted shape.
  body.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = settings.shadows;
      o.receiveShadow = settings.shadows;
    }
  });

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
  group.add(body);

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

  return {
    id: player.id,
    warriorClass: cls,
    group,
    body,
    pivots: {
      rightArm: built.rightArm,
      leftArm: built.leftArm,
      rightLeg: built.rightLeg,
      leftLeg: built.leftLeg,
      head: built.head,
      chest,
      cloak: built.cloak,
    },
    weapon,
    offhand,
    shield,
    reach,
    headTop: crown > 0.5 ? crown : 2.0,
    blob,
    last: { ...ZERO },

    dispose() {
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
      blobGeo.dispose();
      blobMat.dispose();
    },
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

/** The grip the builder promises is the arm's final child. */
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

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInCubic = (x: number) => x * x * x;
const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);
const smooth = (x: number) => x * x * (3 - 2 * x);
const approach = (cur: number, to: number, dt: number, rate: number) => cur + (to - cur) * Math.min(1, dt * rate);

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
  /** Hips. Positive x swings the foot back. */
  lrx: number; lrz: number;
  llx: number; llz: number;
  /** Weapon in the fist: pitch, roll, and slide along its own shaft. */
  wx: number; wz: number; wy: number;
  /** Shield brace, as a delta on how it is carried. */
  sx: number; sy: number; sz: number; sfy: number; sfz: number;
  cloak: number;
}

const ZERO: Readonly<Pose> = Object.freeze({
  px: 0, py: 0, pz: 0, prx: 0, pry: 0, prz: 0,
  crx: 0, cry: 0, crz: 0, hrx: 0, hry: 0, hrz: 0,
  arx: 0, ary: 0, arz: 0, olx: 0, oly: 0, olz: 0,
  lrx: 0, lrz: 0, llx: 0, llz: 0,
  wx: 0, wz: 0, wy: 0,
  sx: 0, sy: 0, sz: 0, sfy: 0, sfz: 0,
  cloak: 0,
});

/**
 * States that share a pose. Dropping from a sprint to a walk is a change of
 * cadence, not of posture, and crossfading it would only smear the stride.
 */
const POSE_GROUP: Record<string, string> = {
  walking: "move", running: "move", sprinting: "move", rolling: "dodging",
};

const P: Pose = { ...ZERO };
const CHANNELS = Object.keys(ZERO) as (keyof Pose)[];
const TIP = new THREE.Vector3();

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
  /** Extra knee bend, beyond what the stance width already costs. */
  sink: number;
  /** How much of a thrust's shaft slides through the fist. */
  slide: number;
}

// The grip is pitched forward by ~1.28 rad, so a weapon left at zero sticks
// straight out of the fist like a lance — which is what every warrior in the
// v1 captures is doing. `rest` puts it back where a man would actually carry
// it: the sword point angled down in front, the axe over the shoulder, the
// spear upright with its butt near the ground. The angles are constrained by
// arm length — the fist sits at 0.87 m and a sword is 1.06 m from grip to
// point, so anything past ~50° off vertical drives the tip through the turf.
const STANCE: Record<WarriorClass, Stance> = {
  huscarl: { rest: 0.94, live: 0.10, spread: 0.10, guard: -0.66, sink: 0.012, slide: 0.3 },
  warden: { rest: -1.24, live: 0.02, spread: 0.05, guard: -0.34, sink: 0.007, slide: 1 },
  runekeeper: { rest: 1.66, live: 0.14, spread: 0.02, guard: -0.24, sink: 0.005, slide: 0.35 },
  berserker: { rest: -1.78, live: 0.08, spread: 0.15, guard: -0.18, sink: 0.015, slide: 0.3 },
};

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

/**
 * Moves the rig onto the server's position with dead reckoning, and applies the
 * hit-push impulse. Read `rig.group.position` after this and before poseWarrior.
 */
export function stepWarriorTransform(
  rig: WarriorRig,
  motion: WarriorMotion,
  player: GamePlayer,
  dt: number,
  ctx: FrameContext,
  attacker?: GamePlayer,
): void {
  // Extrapolate an eighth of a second down the velocity vector so the body is
  // where the packet says it will be, not where it last was.
  const estX = player.position.x + (player.velocity?.x || 0) * 0.08;
  const estZ = player.position.z + (player.velocity?.z || 0) * 0.08;
  const posLerp = player.id === ctx.localId ? 0.4 : 0.24;
  motion.rx += (estX - motion.rx) * posLerp;
  motion.rz += (estZ - motion.rz) * posLerp;

  // The orchestrator raises recoil on the frame damage lands. A rise is the
  // only edge we get for "struck just now" — the wire has no hit event on the
  // player record — so the flinch is triggered off it and the blow's bearing
  // is latched at the same moment, before the attacker walks away from it.
  const decayed = Math.max(0, motion.recoil - dt * 3.2);
  if (motion.recoil > decayed + 0.04) {
    motion.flinch = 1;
    if (attacker) {
      const dx = motion.rx - attacker.position.x;
      const dz = motion.rz - attacker.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const c = Math.cos(-motion.yaw);
      const s = Math.sin(-motion.yaw);
      // Into body space: +Z is where the warrior is facing, +X is the weapon side.
      motion.hitSide = (dx * c - dz * s) / len;
      motion.hitFwd = (dx * s + dz * c) / len;
    }
  }
  motion.recoil = decayed;
  motion.flinch = Math.max(0, motion.flinch - dt * 4.2);

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
  motion.yaw += shortestAngle(motion.yaw, player.rotation) * Math.min(1, dt * 14);
  rig.group.rotation.y = motion.yaw;

  rig.blob.position.x = rig.group.position.x;
  rig.blob.position.z = rig.group.position.z;
}

// ---------------------------------------------------------------------------
// The swing
// ---------------------------------------------------------------------------

const LOAD_END = 0.34;
const IMPACT = 0.64;

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
  crx: Key; cry: Key;
  prx: Key; pry: Key;
  py: Key; pz: Key;
  /** Front foot (off side) and back foot (weapon side). */
  front: Key; back: Key;
  /** Blade lag about the arc — trails on the load, whips past on release. */
  wx: Key; wz: Key;
  /** Slide along the shaft, for a thrust. */
  wy: Key;
}

// Four attacks, each a body throwing a weapon rather than an arm waving one.
// Sign conventions: arm x negative reaches forward, leg x positive swings the
// foot back, spine y positive turns the weapon shoulder away from the target.
const SWINGS: Record<string, Swing> = {
  overhead: {
    arx: [2.36, -1.08, -0.16], arz: [0.30, -0.06, 0.14],
    crx: [-0.28, 0.34, 0.07], cry: [0.26, -0.10, 0.02],
    prx: [-0.11, 0.17, 0.01], pry: [0.15, -0.13, 0.03],
    py: [0.025, -0.03, -0.01], pz: [-0.06, 0.15, 0.02],
    front: [-0.06, -0.52, -0.13], back: [0.23, 0.46, 0.11],
    wx: [-0.38, 0.32, 0], wz: [0, 0, 0], wy: [0, 0, 0],
  },
  // Forehand: cocked out on the weapon side, then dragged across the body. The
  // arm reaches forward as it crosses rather than sweeping flat through the
  // chest — there is no elbow in this rig, so a hand that crosses the
  // centreline at rib height takes the whole humerus through the mail with it.
  right: {
    arx: [1.06, -0.75, 0.06], arz: [1.28, -0.88, 0.15],
    crx: [-0.06, 0.17, 0.04], cry: [0.40, -0.42, 0.02],
    prx: [0, 0.07, 0], pry: [0.21, -0.21, 0.03],
    py: [0.012, -0.035, -0.01], pz: [-0.04, 0.11, 0.02],
    front: [-0.10, -0.30, -0.12], back: [0.28, 0.31, 0.10],
    wx: [-0.85, 0.12, 0], wz: [0.42, -0.36, 0], wy: [0, 0, 0],
  },
  // Backhand: wound behind the hip, then whipped out and away. Wound *behind*
  // and not across, for the same reason — the shoulder clears its own ribcage
  // going back, and does not going over.
  left: {
    arx: [0.95, -0.30, 0.06], arz: [-0.55, 1.38, 0.15],
    crx: [0, 0.13, 0.04], cry: [-0.42, 0.36, 0.02],
    prx: [0, 0.05, 0], pry: [-0.17, 0.23, 0.03],
    py: [0.012, -0.03, -0.01], pz: [-0.03, 0.09, 0.02],
    front: [-0.12, -0.26, -0.12], back: [0.21, 0.27, 0.10],
    wx: [-0.85, 0.12, 0], wz: [-0.36, 0.40, 0], wy: [0, 0, 0],
  },
  // Thrust: coil, then the whole body behind the point.
  stab: {
    arx: [0.96, -0.98, 0.04], arz: [0.24, -0.03, 0.13],
    crx: [-0.12, 0.16, 0.03], cry: [0.42, -0.36, 0.02],
    prx: [-0.04, 0.09, 0], pry: [0.27, -0.27, 0.03],
    py: [0.012, -0.03, -0.01], pz: [-0.10, 0.28, 0.04],
    front: [-0.10, -0.44, -0.14], back: [0.25, 0.44, 0.12],
    wx: [0.20, -0.06, 0], wz: [0, 0, 0], wy: [-0.04, 0.13, 0],
  },
};

/**
 * Reads the swing clock off the server's attackTimer.
 *
 * The timer counts down from the length of the swing, and the wire says nothing
 * about whether it was light or heavy — so the length is learned by watching
 * the largest value this swing reported, and a swing that runs long is a heavy
 * one. The nominal class figure is only a fallback for a timer that has never
 * been seen to tick, which is the photo harness holding one frozen frame.
 */
function readSwing(motion: WarriorMotion, player: GamePlayer, dt: number): number {
  const nominal = WARRIOR_STATS[player.warriorClass]?.attackSpeed || 0.6;
  if (player.state !== "attacking") {
    motion.swingDur = nominal;
    motion.swingPrev = 0;
    motion.swingLive = false;
    motion.heavy = approach(motion.heavy, 0, dt, 6);
    // Runs on to the end rather than back to the start. The server drops the
    // attacking state the tick the timer expires, and a swing that rewound to
    // its windup while the layer faded would snap the arm back up on every blow.
    motion.swing = approach(motion.swing, 1, dt, 7);
    return motion.swing;
  }

  const fresh = player.attackTimer > motion.swingPrev + 1e-3;
  if (fresh) {
    motion.swingDur = player.attackTimer;
    motion.swingLive = false;
    motion.swing = 0;
  } else if (player.attackTimer > motion.swingDur) {
    motion.swingDur = player.attackTimer;
  } else if (player.attackTimer < motion.swingPrev - 1e-4) {
    motion.swingLive = true;
  }
  motion.swingPrev = player.attackTimer;

  const dur = Math.max(motion.swingLive ? 0.05 : nominal, motion.swingDur);
  motion.heavy = approach(motion.heavy, dur > nominal * 1.1 ? 1 : 0, dt, 9);

  // The server ticks at 20 Hz and this runs at 60+, so the raw progress arrives
  // in steps. It is smoothed toward, never extrapolated past: leading the last
  // packet would put the blade through a man before the server agrees it did.
  return (motion.swing = approach(motion.swing, clamp01(1 - player.attackTimer / dur), dt, 16));
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/** The base a warrior returns to: bladed, weight low, weapon carried heavy. */
function stanceLayer(st: Stance, ready: number, w: number): void {
  P.lrx += (0.13 + ready * 0.14) * w;
  P.llx += (-0.08 - ready * 0.12) * w;
  P.lrz += (0.05 + ready * 0.04) * w;
  P.llz += (-0.05 - ready * 0.04) * w;
  P.pry += (0.10 + ready * 0.06) * w;
  P.prx += -0.03 * w;
  P.py += -(st.sink + ready * 0.010) * w;
  P.cry += (0.14 + ready * 0.09) * w;
  P.crx += (0.05 + ready * 0.06) * w;
  P.arx += (0.16 - ready * 0.32) * w;
  P.arz += (st.spread + 0.10) * w;
  P.olx += (st.guard * (0.55 + ready * 0.45)) * w;
  P.olz += -(st.spread + 0.14) * w;
  P.hry += -0.09 * w;
  P.wx += mix(st.rest, st.live, ready) * w;
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
  const shift = Math.sin(t * 0.42 + seed);
  const dwell = Math.sign(shift) * smooth(Math.min(1, Math.abs(shift) * 1.7));
  const br = Math.sin(t * (1.7 + wounded * 1.9) + seed);

  P.px += dwell * 0.035 * w;
  P.prz += -dwell * 0.055 * w;
  P.py += (-0.004 - Math.abs(dwell) * 0.006 + br * 0.005) * w;
  P.crz += dwell * 0.075 * w;
  P.cry += dwell * 0.05 * w;
  P.crx += (br * 0.022 - 0.01) * w;
  // The free leg unlocks and turns out; the loaded one carries straight.
  P.lrx += Math.max(0, -dwell) * 0.10 * w;
  P.llx += Math.max(0, dwell) * 0.10 * w;
  P.hry += (Math.sin(t * 0.31 + seed * 2.1) * 0.16 - dwell * 0.06) * w;
  P.hrx += (br * 0.02 + Math.sin(t * 0.23 + seed) * 0.03) * w;
  P.arx += br * 0.024 * w;
  P.olx += -br * 0.02 * w;
  P.wx += br * 0.03 * w;

  // Blood loss shows in the stance before it shows anywhere else.
  P.crx += wounded * (0.22 + br * 0.05) * w;
  P.py += -wounded * 0.045 * w;
  P.hrx += wounded * 0.20 * w;
  P.prx += wounded * 0.07 * w;
  P.arx += wounded * 0.14 * w;
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
function gaitLayer(motion: WarriorMotion, speed: number, legLen: number, dt: number, w: number): void {
  const amp = Math.min(0.56, 0.26 + speed * 0.05);
  const strideLen = Math.max(0.35, 2 * legLen * Math.sin(amp));
  const before = motion.stride;
  motion.stride += (speed / strideLen) * Math.PI * dt;
  // A footfall every half cycle. The jolt of catching your own weight is short
  // and it is what tells the eye the body has mass.
  if (Math.floor(motion.stride / Math.PI) !== Math.floor(before / Math.PI)) motion.land = 1;

  const ph = motion.stride;
  const sw = Math.sin(ph);
  const legL = amp * sw;
  const legR = -amp * sw;

  P.llx += legL * w;
  P.lrx += legR * w;
  P.llz += -0.04 * w;
  P.lrz += 0.04 * w;

  P.py += -motion.land * motion.land * 0.022 * w;

  // Arms counter the legs, one beat behind them: a shoulder is not bolted to
  // the opposite hip, it is dragged by it.
  const lag = Math.sin(ph - 0.42);
  P.arx += -(-amp * lag) * 0.42 * w;
  P.olx += -(amp * lag) * 0.55 * w;
  P.arz += 0.06 * w;
  P.olz += -0.06 * w;

  // Hips turn with the stride, shoulders against them.
  P.pry += -0.11 * sw * w;
  P.cry += 0.15 * Math.sin(ph - 0.5) * w;
  P.crz += 0.05 * sw * w;
  P.crx += (0.06 + motion.land * 0.06) * w;
  P.hrx += -0.03 * w;
  P.cloak += (0.3 + Math.sin(ph * 2) * 0.09) * w;
}

/** Load, release, follow through — and, if it was heavy, pay for it. */
function attackLayer(dir: string, ph: number, heavy: number, w: number): void {
  const s = SWINGS[dir] ?? SWINGS.right;
  const gain = 1 + heavy * 0.24;

  P.pry += link(ph, 0.10, s.pry, false) * gain * w;
  P.prx += link(ph, 0.10, s.prx, false) * gain * w;
  P.py += link(ph, 0.08, s.py, false) * gain * w;
  P.pz += link(ph, 0.08, s.pz, false) * gain * w;
  P.llx += link(ph, 0.09, s.front, false) * gain * w;
  P.lrx += link(ph, 0.09, s.back, false) * gain * w;

  P.cry += link(ph, 0.04, s.cry, false) * gain * w;
  P.crx += link(ph, 0.04, s.crx, false) * gain * w;

  const arx = link(ph, -0.02, s.arx, true) * gain;
  const arz = link(ph, -0.02, s.arz, true) * gain;
  P.arx += arx * w;
  P.arz += arz * w;
  // The off arm is a counterweight, not a passenger.
  P.olx += -arx * 0.26 * w;
  P.olz += -arz * 0.30 * w;

  P.wx += link(ph, -0.09, s.wx, true) * w;
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
  P.arz += 0.30 * cost;
  P.olz += -0.36 * cost;
  P.hrx += 0.18 * cost;
}

/** The shield comes up and the body settles in behind it. */
function blockLayer(hasShield: boolean, settle: number, w: number): void {
  // The guard snaps up and overshoots a little before it locks — a shield that
  // arrives by lerp arrives without weight.
  const over = Math.sin(settle * Math.PI) * (1 - settle) * 0.5;

  P.py += (-0.03 - over * 0.03) * w;
  P.pz += -0.05 * w;
  P.prx += 0.07 * w;
  P.pry += -0.20 * w;
  P.crx += (0.14 + over * 0.08) * w;
  P.cry += -0.32 * w;
  P.crz += 0.05 * w;
  P.llx += -0.28 * w;
  P.lrx += 0.36 * w;
  P.llz += -0.11 * w;
  P.lrz += 0.12 * w;
  P.hrx += (0.12 + over * 0.06) * w;
  P.hry += 0.16 * w;

  if (hasShield) {
    P.olx += (-1.30 - over * 0.16) * w;
    P.olz += 0.44 * w;
    P.oly += -0.16 * w;
    P.sx += 0.30 * w;
    P.sy += -0.34 * w;
    P.sfy += 0.16 * w;
    P.sfz += 0.10 * w;
    P.arx += 0.58 * w;
    P.arz += -0.26 * w;
    P.wx += -0.5 * w;
  } else {
    // No shield: the blade goes up in a hanging guard and the off hand braces it.
    P.arx += (-1.12 - over * 0.12) * w;
    P.arz += 0.60 * w;
    P.olx += -1.02 * w;
    P.olz += 0.30 * w;
    P.wx += 0.55 * w;
    P.wz += -0.35 * w;
  }
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
  // The leg he is being driven onto steps out to catch him, which through the
  // foot solve also drops him — a man taking a blow gets shorter.
  P.lrz += Math.max(0, side) * 0.38 * push;
  P.llz += -Math.max(0, -side) * 0.38 * push;
  P.lrx += -fwd * 0.18 * push;
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
  P.wx += 0.5 * w;
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
  P.arx += (0.5 * dip) * w;
  P.arz += 0.4 * dip * w;
  P.olx += (-0.7 * dip) * w;
  P.olz += -0.4 * dip * w;
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
  P.hrx += -0.3 * k;
  P.wx += -1.2 * k;
  P.cloak += 0.35 * k;
}

/**
 * Puts the body down on whichever foot is under it.
 *
 * The leg is one rigid piece from hip to sole, so a leg tilted θ off vertical
 * leaves its sole L(1−cos θ) above the ground unless the pelvis comes down to
 * meet it — and the pelvis tilting carries the hip sockets with it, so both
 * terms have to be in the same solve or a swing that pitches the hips forward
 * drives both boots through the turf. Doing it once here, from whatever angles
 * the layers happened to stack up to, is why a wide guard settles and a stride
 * rises and falls without a single layer authoring a height curve.
 *
 * Lift is taken in full — a foot under the ground is a bug. Drop keeps four
 * fifths, and the knee this rig does not have is charged for the rest.
 */
function settleOnFeet(legLen: number): void {
  const hip = Math.hypot(P.prx, P.prz);
  // Past about a right angle at the hips the man is going over, not standing,
  // and his height is the height of a body on the ground. Faded rather than
  // cut, so a collapse hands off to it instead of snapping.
  const standing = 1 - smooth(clamp01((hip - 0.5) / 0.6));
  if (standing <= 0) return;
  const legL = Math.hypot(P.llx + P.prx, P.llz + P.prz);
  const legR = Math.hypot(P.lrx + P.prx, P.lrz + P.prz);
  const need = legLen * (Math.cos(Math.min(1.4, Math.min(legL, legR))) - Math.cos(Math.min(1.4, hip)));
  P.py += (need < 0 ? need * 0.8 : need) * standing;
}

/**
 * Death, as a collapse.
 *
 * Three beats: the legs go, then the body topples about the feet under
 * something like gravity, then it lands and stops arguing. The old version
 * rotated the whole warrior to horizontal at a constant rate, which reads as a
 * felled tree — and took the nameplate down with it, because the plates hang
 * off the transform node this no longer touches.
 */
function deathLayer(d: number, fall: number): void {
  const buckle = smooth(clamp01(d / 0.24));
  const over = easeInCubic(clamp01((d - 0.16) / 0.44));
  const rest = clamp01((d - 0.6) / 0.5);
  const bounce = Math.exp(-9 * Math.max(0, d - 0.58)) * Math.sin((d - 0.58) * 22) * (d > 0.58 ? 1 : 0);

  const flat = fall * (Math.PI / 2);
  P.prx = mix(fall * 0.34 * buckle, flat * 1.03, over) + bounce * 0.06;
  P.prx = mix(P.prx, flat, rest);
  P.prz = fall * 0.2 * over;
  P.pry = -fall * 0.16 * over;

  // Rise as the body goes flat, or half of it ends up under the turf. The drop
  // of the collapse itself is not authored here: both knees fold below and
  // `settleOnFeet` takes the body down onto them.
  P.py = 0.12 * Math.abs(Math.sin(P.prx)) + bounce * 0.03;
  P.pz = fall * 0.06 * buckle;

  P.crx = mix(fall * 0.42 * buckle, 0.05, over);
  P.crz = -fall * 0.16 * over;
  P.hrx = mix(fall * 0.5 * buckle, 0.08, over);
  P.hry = 0.55 * over;
  P.hrz = -0.25 * over;

  // Limbs go slack and arrive after the body does. Once the body is flat its
  // local Z is world up, so a limb splayed on the pitch axis stands out of the
  // ground or buries itself in it — the settled pose spreads on roll instead,
  // which is the axis that still lies in the turf.
  const limp = clamp01((d - 0.1) / 0.5);
  P.arx = mix(0.2, 0.04, limp) + bounce * 0.2;
  P.arz = mix(0.1, 0.92, limp);
  P.olx = mix(0.1, -0.06, limp) + bounce * 0.16;
  P.olz = mix(-0.1, -0.98, limp);
  P.llx = mix(fall * 0.62 * buckle, -0.04, over) + bounce * 0.08;
  P.lrx = mix(fall * 0.48 * buckle, 0.05, over) + bounce * 0.1;
  P.llz = -0.3 * over;
  P.lrz = 0.36 * over;
  P.wx = mix(0.4, -1.0, limp);
  P.cloak = 0.55 * over;
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
  // Hip height is the length of the rigid leg, and the leg is what the body
  // has to stand on: everything vertical in here is measured against it.
  const legLen = piv.leftLeg.position.y || 1.02;

  Object.assign(P, ZERO);

  const dead = player.state === "dead";
  const rolling = player.state === "dodging" || player.state === "rolling";
  const staggered = player.state === "staggered";
  const casting = player.state === "ability";
  // One clock for whatever one-shot the warrior is in the middle of. Elapsed
  // time is the client's to keep; the server owns when the state ends.
  motion.actT = dead || rolling || staggered || casting ? motion.actT + dt : 0;
  if (dead && motion.actT <= dt) motion.fall = motion.hitFwd >= 0 ? 1 : -1;

  // The wire delivers a state change as a step, and the pose on either side of
  // one has no reason to be continuous — a man parried out of a raised guard
  // has his shield arm 60° from where the stagger wants it. This is the only
  // thing that smooths across states, and it lasts a twentieth of a second
  // going into a swing, where the windup is doing the work anyway.
  const group = POSE_GROUP[player.state] ?? player.state;
  if (group !== motion.lastState) {
    motion.blend = 1;
    motion.lastState = group;
  }
  motion.blend = Math.max(0, motion.blend - dt * (player.state === "attacking" ? 22 : 10));

  if (dead) {
    deathLayer(motion.actT, motion.fall);
    settleOnFeet(legLen);
    motion.leanX *= 0.9;
    commit(rig, piv, st, motion.blend, 0);
    rig.body.visible = player.invincible ? Math.floor(t * 12) % 2 === 0 : true;
    fadeBlob(rig, 1);
    return;
  }

  // ---- lean into the velocity vector ----
  const spd = Math.hypot(player.velocity?.x || 0, player.velocity?.z || 0);
  const velAngle = Math.atan2(player.velocity?.x || 0, player.velocity?.z || 0);
  const sideLean = Math.sin(velAngle - motion.yaw) * Math.min(0.16, spd * 0.03);
  motion.leanX += (sideLean - motion.leanX) * Math.min(1, dt * 8);
  const fwdLean = -Math.cos(velAngle - motion.yaw) * Math.min(0.1, spd * 0.018);

  const moving = player.state === "walking" || player.state === "running" || player.state === "sprinting";
  const attacking = player.state === "attacking";
  const blocking = player.state === "blocking";

  // Layer weights are the only thing smoothed. A state arrives on the wire as a
  // step, and a step in the weight — not in the pose — is what keeps a swing
  // crisp while still not snapping into it from a standing start.
  motion.wMove = approach(motion.wMove, moving && spd > 0.15 ? 1 : 0, dt, 9);
  motion.wBlock = approach(motion.wBlock, blocking ? 1 : 0, dt, 14);
  motion.wAction = approach(motion.wAction, attacking ? 1 : 0, dt, 20);

  const swing = readSwing(motion, player, dt);
  const hp = player.maxHealth > 0 ? player.health / player.maxHealth : 1;
  const wounded = clamp01((0.4 - hp) / 0.34);

  // How braced the man is. Idling in the open he stands off his guard; the
  // moment he is moving, swinging or covering he is on it.
  const ready = clamp01(motion.wMove * 0.55 + motion.wAction + motion.wBlock + (staggered ? 0.4 : 0));
  stanceLayer(st, ready, 1);

  const calm = clamp01(1 - motion.wAction - motion.wBlock * 0.7 - motion.wMove * 0.85);
  if (calm > 0.001) idleLayer(t, motion.seed, wounded, calm);
  if (motion.wMove > 0.001) gaitLayer(motion, Math.max(spd, 1.4), legLen, dt, motion.wMove);
  motion.land = Math.max(0, motion.land - dt * 7);

  if (motion.wAction > 0.001) attackLayer(player.attackDir, swing, motion.heavy, motion.wAction);
  if (motion.wBlock > 0.001) blockLayer(!!rig.shield, clamp01(player.blockTimer / 0.22), motion.wBlock);

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

  // Anatomical stops. Layers add, and two of them stacking is how a spine ends
  // up turned further than a spine turns — which on a torso split at the belt
  // shows as the mail sliding off the hips.
  P.cry = clamp(P.cry, -0.55, 0.55);
  P.crx = clamp(P.crx, -0.5, 0.62);
  P.crz = clamp(P.crz, -0.36, 0.36);

  settleOnFeet(legLen);
  commit(rig, piv, st, motion.blend, ready);
  fadeBlob(rig, 0);
  rig.body.visible = player.invincible ? Math.floor(t * 12) % 2 === 0 : true;

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
  if (piv.cloak) piv.cloak.rotation.x = P.cloak;

  rig.weapon.rotation.set(P.wx, 0, P.wz);
  // A spear runs through the fist on a thrust, which is most of what makes a
  // thrust read; a sword only creeps, because a hand sliding down a blade is a
  // different and much worse-looking idea.
  rig.weapon.position.y = P.wy * st.slide;
  if (rig.offhand) {
    // The second seax mirrors the main hand, a beat behind and never as far.
    rig.offhand.rotation.set(mix(st.rest, P.wx, 0.55), 0, -P.wz * 0.6);
  }
  if (rig.shield) {
    rig.shield.rotation.set(0.22 + P.sx, 0.16 + P.sy, 0.14 + P.sz);
    rig.shield.position.set(-0.14, -0.4 + P.sfy, 0.26 + P.sfz);
  }
  // A guard raised is a guard the cloak has to move around.
  if (piv.cloak) piv.cloak.rotation.z = -P.crz * 0.5 + ready * 0.02;
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
