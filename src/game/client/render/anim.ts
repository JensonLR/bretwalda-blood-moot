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

import * as THREE from "three";
import type { GamePlayer, WarriorClass } from "../../types";
import { WARRIOR_STATS } from "../../types";
import {
  buildCharacter, buildWeaponForClass, buildShield,
  defaultAppearance, type Appearance,
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
  cloak?: THREE.Group;
}

export interface WarriorRig {
  readonly id: string;
  readonly warriorClass: WarriorClass;
  readonly group: THREE.Group;
  readonly pivots: RigPivots;
  readonly weapon: THREE.Group;
  readonly shield?: THREE.Group;
  /**
   * Fake ground contact. Stays until real contact shadows land, at which point
   * this is the thing to delete.
   */
  readonly blob: THREE.Mesh;
  dispose(): void;
}

/** Per-warrior smoothing state. Owned by the caller, mutated here. */
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
}

export interface AnimHooks {
  /** A blade is mid-arc at this world position. */
  onBladeTrail?(position: THREE.Vector3, cls: WarriorClass, strike: number): void;
}

export function createMotion(p: GamePlayer): WarriorMotion {
  return { rx: p.position.x, rz: p.position.z, yaw: p.rotation, leanX: 0, recoil: 0, trailTick: 0 };
}

export function createWarriorRig(
  parent: THREE.Object3D,
  player: GamePlayer,
  materials: MaterialLibrary,
  settings: QualitySettings,
): WarriorRig {
  const cls = player.warriorClass as WarriorClass;
  const ap: Appearance = (player as GamePlayer & { appearance?: Appearance }).appearance ?? defaultAppearance(cls);
  const built = buildCharacter(cls, ap, CLASS_TUNIC[cls] ?? 0x5a4a2c, materials);
  const group = built.group;

  // The hand mounts are the last child each arm builder adds.
  const rightHand = built.rightArm.children[built.rightArm.children.length - 1] as THREE.Group;
  const leftHand = built.leftArm.children[built.leftArm.children.length - 1] as THREE.Group;

  const weapon = buildWeaponForClass(cls, materials);
  weapon.name = "weapon";
  rightHand.add(weapon);

  if (cls === "runekeeper") {
    const offhand = buildWeaponForClass("runekeeper", materials);
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
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = settings.shadows;
      o.receiveShadow = settings.shadows;
    }
  });

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
    pivots: {
      rightArm: built.rightArm,
      leftArm: built.leftArm,
      rightLeg: built.rightLeg,
      leftLeg: built.leftLeg,
      head: built.head,
      cloak: built.cloak,
    },
    weapon,
    shield,
    blob,

    dispose() {
      parent.remove(group);
      parent.remove(blob);
      // Geometry only. Every material on this body came from the shared library
      // and is still on eight other warriors; disposing here would take the
      // whole lobby's mail down with one death.
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      blobGeo.dispose();
      blobMat.dispose();
    },
  };
}

function shortestAngle(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x: number) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

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

  motion.recoil = Math.max(0, motion.recoil - dt * 3.2);

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

export function poseWarrior(
  rig: WarriorRig,
  motion: WarriorMotion,
  player: GamePlayer,
  dt: number,
  ctx: FrameContext,
  hooks?: AnimHooks,
): void {
  const mesh = rig.group;
  const piv = rig.pivots;
  const t = ctx.time;

  if (player.state === "dead") {
    mesh.rotation.z += (Math.PI / 2 - mesh.rotation.z) * Math.min(1, dt * 6);
    mesh.position.y += (-0.55 - mesh.position.y) * Math.min(1, dt * 6);
    motion.leanX *= 0.9;
    mesh.visible = player.invincible ? Math.floor(t * 12) % 2 === 0 : true;
    return;
  }

  // ---- lean into the velocity vector ----
  const spd = Math.hypot(player.velocity?.x || 0, player.velocity?.z || 0);
  const velAngle = Math.atan2(player.velocity?.x || 0, player.velocity?.z || 0);
  const sideLean = Math.sin(velAngle - motion.yaw) * Math.min(0.16, spd * 0.03);
  motion.leanX += (sideLean - motion.leanX) * Math.min(1, dt * 8);
  const fwdLean = -Math.cos(velAngle - motion.yaw) * Math.min(0.1, spd * 0.018);

  const speedMoving = player.state === "walking" || player.state === "running" || player.state === "sprinting";
  const cycleSpd = player.state === "sprinting" ? 11.5 : player.state === "running" ? 8.5 : 6.5;
  const stride = player.state === "sprinting" ? 0.85 : player.state === "running" ? 0.65 : 0.45;

  if (speedMoving) {
    const phase = Math.sin(t * cycleSpd);
    piv.leftLeg.rotation.x = phase * stride;
    piv.rightLeg.rotation.x = -phase * stride;
    piv.leftArm.rotation.x += ((-phase * stride * 0.5 - 0.14) - piv.leftArm.rotation.x) * Math.min(1, dt * 12);
    if (player.state !== "attacking") {
      piv.rightArm.rotation.x += ((phase * stride * 0.5 - 0.18) - piv.rightArm.rotation.x) * Math.min(1, dt * 12);
    }
    mesh.position.y = Math.abs(Math.sin(t * cycleSpd)) * 0.05;
    piv.head.rotation.x = player.state === "sprinting" ? 0.08 : 0.02;
    mesh.rotation.z = motion.leanX;
    mesh.rotation.x = fwdLean;
  } else {
    // Breathing idle. Keyed off rx so two warriors standing together are not
    // inhaling in lockstep.
    const br = Math.sin(t * 1.8 + motion.rx);
    mesh.position.y = br * 0.014;
    mesh.rotation.z = motion.leanX * 0.5;
    mesh.rotation.x = 0;
    piv.leftLeg.rotation.x *= 1 - Math.min(1, dt * 10);
    piv.rightLeg.rotation.x *= 1 - Math.min(1, dt * 10);
    if (player.state !== "attacking" && player.state !== "blocking" && player.state !== "staggered") {
      piv.leftArm.rotation.x += (br * 0.05 - 0.12 - piv.leftArm.rotation.x) * Math.min(1, dt * 6);
      piv.rightArm.rotation.x += (Math.sin(t * 1.8 + 0.5) * 0.05 - 0.18 - piv.rightArm.rotation.x) * Math.min(1, dt * 6);
    }
    if (player.state !== "staggered") piv.head.rotation.x = br * 0.02;
  }

  // ---- swings: telegraphed windup, whipped strike, follow-through ----
  if (player.state === "attacking") {
    const dur = WARRIOR_STATS[player.warriorClass].attackSpeed;
    const prog = Math.min(1, Math.max(0, 1 - player.attackTimer / (dur || 0.6)));
    const wind = Math.min(1, prog / 0.35);
    const strike = Math.min(1, Math.max(0, (prog - 0.35) / 0.37));
    const follow = Math.max(0, (prog - 0.72) / 0.28);
    const whip = easeOutBack(strike);
    const recoilAmt = 1 - Math.min(1, follow * 1.4);
    const twist = Math.sin(wind * Math.PI * 0.5) * 0.35;

    if (player.attackDir === "overhead") {
      piv.rightArm.rotation.x = -easeOutCubic(wind) * 2.9 + whip * 2.85 * recoilAmt;
      piv.rightArm.rotation.z = 0.1 * Math.sin(strike * Math.PI);
      piv.head.rotation.x = -wind * 0.15 + follow * 0.1;
      mesh.rotation.y = motion.yaw - twist * 0.35;
      mesh.rotation.x = wind * 0.06 - strike * 0.16;
    } else if (player.attackDir === "left") {
      piv.rightArm.rotation.z = wind * 1.9 - whip * 2.3 * recoilAmt;
      piv.rightArm.rotation.x = -0.88;
      piv.head.rotation.y = twist * 0.5;
      mesh.rotation.y = motion.yaw + twist - whip * 0.55 * recoilAmt;
      mesh.rotation.x = 0;
    } else if (player.attackDir === "right") {
      piv.rightArm.rotation.z = -wind * 1.9 + whip * 2.3 * recoilAmt;
      piv.rightArm.rotation.x = -0.88;
      piv.head.rotation.y = -twist * 0.5;
      mesh.rotation.y = motion.yaw - twist + whip * 0.55 * recoilAmt;
      mesh.rotation.x = 0;
    } else {
      // Stab: deep coil, then the whole weapon punches forward.
      piv.rightArm.rotation.x = -1.1 - wind * 0.35 + strike * 0.3 * recoilAmt;
      mesh.rotation.y = motion.yaw + twist * 0.6 - whip * 0.25;
      mesh.rotation.x = 0;
      const punch = wind < 1 ? -0.32 * easeOutCubic(wind) : easeOutBack(Math.min(1, strike * 1.7));
      rig.weapon.position.z = punch * 0.9;
    }

    motion.trailTick += dt;
    if (strike > 0 && strike < 0.9 && motion.trailTick > 0.045) {
      motion.trailTick = 0;
      const fx = Math.sin(motion.yaw);
      const fz = Math.cos(motion.yaw);
      hooks?.onBladeTrail?.(
        new THREE.Vector3(
          mesh.position.x + fx * 1.6,
          1.7 - strike * 0.6,
          mesh.position.z + fz * 1.6,
        ),
        player.warriorClass,
        strike,
      );
    }
  } else {
    piv.rightArm.rotation.z *= 1 - Math.min(1, dt * 9);
    piv.head.rotation.y *= 1 - Math.min(1, dt * 7);
    rig.weapon.position.z *= 1 - Math.min(1, dt * 8);
    if (!speedMoving) {
      piv.head.rotation.x += (Math.sin(t * 1.8) * 0.02 - piv.head.rotation.x) * Math.min(1, dt * 7);
    }
  }

  if (player.state === "blocking") {
    piv.leftArm.rotation.x += (-1.4 - piv.leftArm.rotation.x) * Math.min(1, dt * 12);
    piv.rightArm.rotation.x += (-0.7 - piv.rightArm.rotation.x) * Math.min(1, dt * 10);
    piv.head.rotation.x = -0.06;
  }

  if (player.state === "dodging") {
    mesh.rotation.x = 0.55;
    mesh.rotation.z = motion.leanX + 0.2;
    piv.leftLeg.rotation.x = 0.95;
    piv.rightLeg.rotation.x = -0.95;
  }

  if (player.state === "staggered") {
    mesh.position.x += (Math.random() - 0.5) * 0.045;
    piv.head.rotation.x = -0.3 + Math.sin(t * 22) * 0.06;
    piv.leftArm.rotation.x = 0.65;
    piv.rightArm.rotation.x = 0.55;
  }

  if (piv.cloak) {
    const sway = speedMoving
      ? 0.32 + Math.sin(t * cycleSpd * 0.8) * 0.1
      : 0.1 + Math.sin(t * 1.4) * 0.05;
    piv.cloak.rotation.x += (sway - piv.cloak.rotation.x) * Math.min(1, dt * 7);
  }

  // Invincibility frames blink the whole body.
  mesh.visible = player.invincible ? Math.floor(t * 12) % 2 === 0 : true;
}
