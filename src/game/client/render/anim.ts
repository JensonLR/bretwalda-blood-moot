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
  kneeR: THREE.Bone;
  kneeL: THREE.Bone;
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
  /**
   * One skeleton for the whole warrior — eight bones, an upper and a lower for
   * each limb. Per-limb skeletons would work and would cost eight bone textures
   * a man instead of one.
   */
  readonly skeleton: THREE.Skeleton;
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
    swingPrev: 0, swingHold: 0, heavy: 0,
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
  //
  // The face seed is passed rather than left to the builder's build-order
  // fallback because a face has to survive a rebuild: a rig is disposed and
  // rebuilt whenever a player's appearance changes mid-match, and the fallback
  // handed him a different skull and a different complexion every time — the man
  // you were fighting became a different man for putting a helmet on.
  // See `faceIdentity` for why this is an interned integer and not a hash.
  const built = buildCharacter(cls, ap, CLASS_TUNIC[cls] ?? 0x5a4a2c, materials, settings.tier, faceIdentity(player.id));
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
    //
    // Strapped to the forearm rather than to the shoulder, which is where a
    // shield is actually strapped and, more to the point, is what makes the
    // brace in `blockLayer` read: the elbow is what puts a shield in front of a
    // face. Bolted to the arm pivot it stayed put while the forearm folded out
    // from behind it. `SHIELD_CARRY` is still the offset it was tuned at — in
    // arm space — so the same numbers are re-expressed against the elbow here
    // rather than guessed again by eye.
    shield = buildShield(ap.cloak !== "none" ? 0x5c2320 : 0x6b4226, materials);
    shield.position.set(SHIELD_CARRY.x, SHIELD_CARRY.y - joints.elbowL.position.y, SHIELD_CARRY.z);
    shield.rotation.set(0.22, 0.16, 0.14);
    joints.elbowL.add(shield);
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
      elbowR: joints.elbowR,
      elbowL: joints.elbowL,
      kneeR: joints.kneeR,
      kneeL: joints.kneeL,
      cloak: built.cloak,
    },
    weapon,
    offhand,
    shield,
    reach,
    headTop: crown > 0.5 ? crown : 2.0,
    blob,
    skeleton: joints.skeleton,
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
      // The bone texture is this rig's alone — one 8×8 float target per warrior,
      // and the only GPU resource `articulate` allocates.
      joints.skeleton.dispose();
      blobGeo.dispose();
      blobMat.dispose();
    },
  };
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

/**
 * Where the joint sits along the limb, as a fraction of the limb the rig can
 * actually measure.
 *
 * These are proportions rather than lengths on purpose — stature is quantised
 * per warrior in `characters.ts` and every segment scales with it, so a fraction
 * of the measured shoulder-to-fist or hip-to-sole distance survives a stature
 * change that a constant would not. They are the builder's own numbers:
 * `upperArm / (upperArm + foreArm + gripDrop)` and `(hipY - kneeY) / hipY`.
 * They are duplicated here because `BuiltCharacter` does not carry the joint
 * heights; see the note in the report about exporting them instead.
 */
const ELBOW_ALONG = 0.487;
const KNEE_ALONG = 0.48;

/** Where the huscarl's shield sits, in the off arm's frame, as tuned. */
const SHIELD_CARRY = new THREE.Vector3(-0.14, -0.4, 0.26);

interface Articulation {
  elbowR: THREE.Bone;
  elbowL: THREE.Bone;
  kneeR: THREE.Bone;
  kneeL: THREE.Bone;
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
function weightLimb(geo: THREE.BufferGeometry, joint: number, band: number, upper: number, lower: number): void {
  if (geo.hasAttribute("skinIndex")) return;
  const pos = geo.getAttribute("position");
  const n = pos.count;
  const index = new Uint16Array(n * 4);
  const weight = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    // A ramp, not a cut. The builder puts its widest station right on the joint,
    // and a hard split there opens a hole in the knee the first time it bends.
    const t = smooth(clamp01((joint + band - pos.getY(i)) / (band * 2)));
    index[i * 4] = upper;
    index[i * 4 + 1] = lower;
    weight[i * 4] = 1 - t;
    weight[i * 4 + 1] = t;
  }
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(index, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(weight, 4));
}

/** Cuts an elbow into each arm and a knee into each leg, and binds the skin. */
function articulate(built: BuiltCharacter): Articulation {
  // Measured off the rig rather than tabled: the fist mount is where the arm
  // ends, and the hip pivot's own height is the length of the leg.
  const gripR = handOf(built.rightArm).position.y;
  const gripL = handOf(built.leftArm).position.y;
  const legLen = built.leftLeg.position.y || 1.02;

  // Order fixes the bone indices, and the indices are baked into shared
  // geometry — weapon arm, off arm, weapon leg, off leg, upper before lower.
  const limbs = [
    { pivot: built.rightArm, joint: gripR * ELBOW_ALONG, band: 0.055, span: Math.abs(gripR) + 0.24 },
    { pivot: built.leftArm, joint: gripL * ELBOW_ALONG, band: 0.055, span: Math.abs(gripL) + 0.24 },
    { pivot: built.rightLeg, joint: -legLen * KNEE_ALONG, band: 0.075, span: legLen + 0.18 },
    { pivot: built.leftLeg, joint: -legLen * KNEE_ALONG, band: 0.075, span: legLen + 0.18 },
  ];

  const bones: THREE.Bone[] = [];
  const bound: Array<{ mesh: THREE.SkinnedMesh; at: THREE.Bone }> = [];

  limbs.forEach((limb, i) => {
    const upper = new THREE.Bone();
    const lower = new THREE.Bone();
    lower.position.y = limb.joint;
    upper.add(lower);
    // The upper bone sits at the pivot with an identity transform, so the
    // geometry's own space *is* its space and the bind matrix below is just the
    // pivot's world matrix. Cheaper to reason about than an offset chain.
    limb.pivot.add(upper);
    bones.push(upper, lower);

    for (const child of limb.pivot.children.slice()) {
      if (!(child instanceof THREE.Mesh)) continue;
      weightLimb(child.geometry, limb.joint, limb.band, i * 2, i * 2 + 1);
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

  // The bind pose. Bone inverses and every mesh's bind matrix are taken at this
  // one instant, which is what lets the skin ignore where the mesh sits in the
  // graph: in `AttachedBindMode` three recomputes `bindMatrixInverse` from the
  // mesh's own world matrix every frame, so the pivot can go on carrying the
  // mesh and only the bones drive the vertices. The body is not in the scene
  // yet and does not need to be — the world transform cancels out of both sides.
  built.group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  for (const b of bound) b.mesh.bind(skeleton, b.at.matrixWorld.clone());

  return { elbowR: bones[1], elbowL: bones[3], kneeR: bones[5], kneeL: bones[7], skeleton };
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
  /** Shield brace, as a delta on how it is carried. */
  sx: number; sy: number; sz: number; sfy: number; sfz: number;
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
}

// The grip is pitched forward by ~1.28 rad, so a weapon left at zero sticks
// straight out of the fist like a lance — which is what every warrior in the
// v1 captures is doing. `rest` puts it back where a man would actually carry
// it: the sword point angled down in front, the axe over the shoulder, the
// spear upright with its butt near the ground. The angles are constrained by
// arm length — the fist sits at 0.87 m and a sword is 1.06 m from grip to
// point, so anything past ~50° off vertical drives the tip through the turf.
const STANCE: Record<WarriorClass, Stance> = {
  huscarl: { rest: 0.94, live: 0.10, spread: 0.10, guard: -0.66, sink: 0.13, slide: 0.3 },
  warden: { rest: -1.24, live: 0.02, spread: 0.05, guard: -0.34, sink: 0.08, slide: 1 },
  runekeeper: { rest: 1.66, live: 0.14, spread: 0.02, guard: -0.24, sink: 0.06, slide: 0.35 },
  berserker: { rest: -1.78, live: 0.08, spread: 0.15, guard: -0.18, sink: 0.16, slide: 0.3 },
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
    // Folded hard behind the head at the top of the load — that fold is what
    // makes an overhead read as an overhead rather than as a raised arm.
    arb: [-2.00, -0.28, -0.60],
    crx: [-0.28, 0.34, 0.07], cry: [0.26, -0.10, 0.02],
    prx: [-0.11, 0.17, 0.01], pry: [0.15, -0.13, 0.03],
    py: [0.025, -0.03, -0.01], pz: [-0.06, 0.15, 0.02],
    front: [-0.06, -0.52, -0.13], back: [0.23, 0.46, 0.11],
    frontB: [0.20, 0.34, 0.18], backB: [0.30, 0.22, 0.16],
    wx: [-0.38, 0.32, 0], wz: [0, 0, 0], wy: [0, 0, 0],
  },
  // Forehand: cocked out on the weapon side, then dragged across the body. The
  // arm reaches forward as it crosses rather than sweeping flat through the
  // chest, because a hand that crosses the centreline at rib height on a
  // straight arm takes the whole humerus through the mail with it. With an
  // elbow the fold does that job properly — the hand can come inside the ribs
  // while the shoulder stays out where a shoulder lives.
  right: {
    arx: [1.06, -0.75, 0.06], arz: [1.28, -0.88, 0.15],
    arb: [-1.52, -0.40, -0.62],
    crx: [-0.06, 0.17, 0.04], cry: [0.40, -0.42, 0.02],
    prx: [0, 0.07, 0], pry: [0.21, -0.21, 0.03],
    py: [0.012, -0.035, -0.01], pz: [-0.04, 0.11, 0.02],
    front: [-0.10, -0.30, -0.12], back: [0.28, 0.31, 0.10],
    frontB: [0.18, 0.30, 0.17], backB: [0.26, 0.20, 0.16],
    wx: [-0.85, 0.12, 0], wz: [0.42, -0.36, 0], wy: [0, 0, 0],
  },
  // Backhand: wound behind the hip, then whipped out and away. Wound *behind*
  // and not across, for the same reason — the shoulder clears its own ribcage
  // going back, and does not going over.
  left: {
    arx: [0.95, -0.30, 0.06], arz: [-0.55, 1.38, 0.15],
    arb: [-1.34, -0.36, -0.62],
    crx: [0, 0.13, 0.04], cry: [-0.42, 0.36, 0.02],
    prx: [0, 0.05, 0], pry: [-0.17, 0.23, 0.03],
    py: [0.012, -0.03, -0.01], pz: [-0.03, 0.09, 0.02],
    front: [-0.12, -0.26, -0.12], back: [0.21, 0.27, 0.10],
    frontB: [0.16, 0.28, 0.17], backB: [0.25, 0.18, 0.16],
    wx: [-0.85, 0.12, 0], wz: [-0.36, 0.40, 0], wy: [0, 0, 0],
  },
  // Thrust: coil, then the whole body behind the point. The deepest fold of the
  // four and the straightest arm at contact, which is what a thrust *is*.
  stab: {
    arx: [0.96, -0.98, 0.04], arz: [0.24, -0.03, 0.13],
    arb: [-2.08, -0.12, -0.68],
    crx: [-0.12, 0.16, 0.03], cry: [0.42, -0.36, 0.02],
    prx: [-0.04, 0.09, 0], pry: [0.27, -0.27, 0.03],
    py: [0.012, -0.03, -0.01], pz: [-0.10, 0.28, 0.04],
    front: [-0.10, -0.44, -0.14], back: [0.25, 0.44, 0.12],
    frontB: [0.22, 0.38, 0.20], backB: [0.34, 0.18, 0.16],
    wx: [0.20, -0.06, 0], wz: [0, 0, 0], wy: [-0.04, 0.13, 0],
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

/** The base a warrior returns to: bladed, weight low, weapon carried heavy. */
function stanceLayer(st: Stance, ready: number, w: number): void {
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
  P.pry += (0.10 + ready * 0.06) * w;
  P.prx += -0.03 * w;
  P.cry += (0.14 + ready * 0.09) * w;
  P.crx += (0.05 + ready * 0.06) * w;
  P.arx += (0.16 - ready * 0.32) * w;
  P.arz += (st.spread + 0.10) * w;
  P.olx += (st.guard * (0.55 + ready * 0.45)) * w;
  P.olz += -(st.spread + 0.14) * w;
  P.hry += -0.09 * w;
  // Elbows. The off arm is always the more folded of the two — it is not
  // carrying anything long — and the weapon arm closes as the guard comes up.
  const fold = 0.26 + ready * 0.40;
  P.arb += -fold * w;
  P.olb += -(0.46 + ready * 0.46) * w;
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
  const shift = Math.sin(t * 0.42 + seed);
  const dwell = Math.sign(shift) * smooth(Math.min(1, Math.abs(shift) * 1.7));
  const br = Math.sin(t * (1.7 + wounded * 1.9) + seed);

  P.px += dwell * 0.035 * w;
  P.prz += -dwell * 0.055 * w;
  P.py += (-0.004 - Math.abs(dwell) * 0.006 + br * 0.005) * w;
  P.crz += dwell * 0.075 * w;
  P.cry += dwell * 0.05 * w;
  P.crx += (br * 0.022 - 0.01) * w;
  // The free leg unlocks and turns out; the loaded one carries straight. The
  // knee is where "unlocked" actually lives — a hip that turns out over a
  // locked knee is a mannequin turned out at the hip.
  const free = Math.max(0, -dwell);
  const load = Math.max(0, dwell);
  P.lrx += free * 0.10 * w;
  P.llx += load * 0.10 * w;
  P.lrb += (free * 0.24 - load * 0.10) * w;
  P.llb += (load * 0.24 - free * 0.10) * w;
  P.hry += (Math.sin(t * 0.31 + seed * 2.1) * 0.16 - dwell * 0.06) * w;
  P.hrx += (br * 0.02 + Math.sin(t * 0.23 + seed) * 0.03) * w;
  P.arx += br * 0.024 * w;
  P.olx += -br * 0.02 * w;
  P.arb += -br * 0.022 * w;
  P.olb += br * 0.028 * w;
  P.wx += br * 0.03 * w;

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
function gaitLayer(motion: WarriorMotion, speed: number, legLen: number, dt: number, w: number): void {
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
  const lag = Math.sin(ph - 0.42);
  P.arx += -(-amp * lag) * 0.42 * w;
  P.olx += -(amp * lag) * 0.55 * w;
  P.arb += (-0.16 - Math.max(0, -amp * lag) * 0.55) * w;
  P.olb += (-0.22 - Math.max(0, amp * lag) * 0.70) * w;
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
  // The knees run with the feet and just behind them. The back one is coiled at
  // the load and drives out through the release; the front one is straightish
  // going in and folds under the blow, which is the shape of a man putting his
  // weight into something rather than reaching for it.
  P.llb += link(ph, 0.06, s.frontB, false) * gain * w;
  P.lrb += link(ph, 0.06, s.backB, false) * gain * w;

  P.cry += link(ph, 0.04, s.cry, false) * gain * w;
  P.crx += link(ph, 0.04, s.crx, false) * gain * w;

  const arx = link(ph, -0.02, s.arx, true) * gain;
  const arz = link(ph, -0.02, s.arz, true) * gain;
  // Between the shoulder and the blade, because that is where an elbow is in
  // the chain: hips at +0.10, spine +0.04, shoulder -0.02, elbow -0.05, blade
  // -0.09. Every link arriving on the same clock is an arm waving a stick.
  const arb = link(ph, -0.05, s.arb, true) * gain;
  P.arx += arx * w;
  P.arz += arz * w;
  P.arb += arb * w;
  // The off arm is a counterweight, not a passenger — and a counterweight on a
  // straight arm is a sandbag on a rope. It folds hardest where the weapon arm
  // is folded and opens with it.
  P.olx += -arx * 0.26 * w;
  P.olz += -arz * 0.30 * w;
  P.olb += (-0.44 + arb * 0.22) * w;

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
  P.llx += -0.28 * w;
  P.lrx += 0.36 * w;
  P.llz += -0.11 * w;
  P.lrz += 0.12 * w;
  P.llb += (0.24 + over * 0.08) * w;
  P.lrb += (0.16 + over * 0.05) * w;
  P.hrx += (0.12 + over * 0.06) * w;
  P.hry += 0.16 * w;

  if (hasShield) {
    // The shield is strapped to the forearm, so the elbow is what actually puts
    // it in front of a face; the shoulder only carries it up. Doing the whole
    // lift at the shoulder — which is all a rig without an elbow could do — is
    // a man holding a door out in front of himself at arm's length, and it is
    // exactly what the huscarl was doing in every block in the capture set.
    P.olx += (-0.76 - over * 0.12) * w;
    P.olb += (-1.02 - over * 0.14) * w;
    P.olz += 0.40 * w;
    P.oly += -0.16 * w;
    P.sx += 0.30 * w;
    P.sy += -0.34 * w;
    P.sfy += 0.10 * w;
    P.sfz += 0.14 * w;
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
function settleOnFeet(legLen: number): void {
  const hip = Math.hypot(P.prx, P.prz);
  // Past about a right angle at the hips the man is going over, not standing,
  // and his height is the height of a body on the ground. Faded rather than
  // cut, so a collapse hands off to it instead of snapping.
  const standing = 1 - smooth(clamp01((hip - 0.5) / 0.6));
  if (standing <= 0) return;
  const legL = Math.hypot(P.llx + P.prx, P.llz + P.prz);
  const legR = Math.hypot(P.lrx + P.prx, P.lrz + P.prz);
  const reachL = Math.cos(clamp(P.llb, 0, 2.4) * 0.5) * Math.cos(Math.min(1.4, legL));
  const reachR = Math.cos(clamp(P.lrb, 0, 2.4) * 0.5) * Math.cos(Math.min(1.4, legR));
  const need = legLen * (Math.max(reachL, reachR) - Math.cos(Math.min(1.4, hip)));
  P.py += need * standing;
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
  // `settleOnFeet` takes the body down onto them — which is the difference
  // between a man whose legs went and a felled tree, and it is a difference
  // this rig could not express at all before there were knees to fold.
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
  P.arb = mix(-0.52, -0.20, limp) + bounce * 0.16;
  P.olb = mix(-0.60, -0.16, limp) + bounce * 0.14;
  P.llx = mix(fall * 0.62 * buckle, -0.04, over) + bounce * 0.08;
  P.lrx = mix(fall * 0.48 * buckle, 0.05, over) + bounce * 0.1;
  // The knees are the first beat of the collapse and they go before anything
  // else moves — he drops onto them, and only then does the body carry over.
  // They straighten out again as he goes flat, which is both what a body on the
  // ground looks like and what keeps `settleOnFeet` from handing the corpse a
  // step up as its `standing` term fades out from under it.
  P.lrb = mix(1.58 * buckle, 0.12, over);
  P.llb = mix(1.34 * buckle, 0.09, over);
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
    // Not on the very first frame: `rig.last` is all zeroes then, so a warrior
    // who arrives mid-swing would spend his opening frame blended into a T-pose
    // and only reach the pose the server asked for once the crossfade expired.
    // Live that is one frame of mush; in a still it is the whole photograph.
    motion.blend = motion.lastState === "" ? 0 : 1;
    motion.lastState = group;
  }
  motion.blend = Math.max(0, motion.blend - dt * (player.state === "attacking" ? 22 : 10));

  if (dead) {
    deathLayer(motion.actT, motion.fall);
    stops();
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

  stops();
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
  if (piv.cloak) piv.cloak.rotation.x = P.cloak;

  rig.weapon.rotation.set(P.wx, 0, P.wz);
  // A spear runs through the fist on a thrust, which is most of what makes a
  // thrust read; a sword only creeps, because a hand sliding down a blade is a
  // different and much worse-looking idea.
  rig.weapon.position.y = P.wy * st.slide;
  if (rig.offhand) {
    // The second seax mirrors the main hand, a beat behind and never as far.
    // `P.wx + P.arb` is where the weapon hand is pointing once its elbow is
    // counted; subtracting the off elbow gives the same aim from the other arm
    // rather than the same wrist angle, which after the elbows went in are two
    // very different things.
    rig.offhand.rotation.set(mix(st.rest, P.wx + P.arb, 0.55) - P.olb, 0, -P.wz * 0.6);
  }
  if (rig.shield) {
    rig.shield.rotation.set(0.22 + P.sx, 0.16 + P.sy, 0.14 + P.sz);
    // Carried off the forearm bone, so the mount height is the tuned offset
    // minus where that bone sits — see `SHIELD_CARRY`.
    rig.shield.position.set(
      SHIELD_CARRY.x,
      SHIELD_CARRY.y - piv.elbowL.position.y + P.sfy,
      SHIELD_CARRY.z + P.sfz,
    );
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
