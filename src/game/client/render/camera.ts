// The camera controller: follow rig, orbit rigs, shake, FOV.
//
// The rig owns the yaw, not the input handler, because that one number is three
// things at once — where the camera looks, the basis the movement vector is
// built in, and the rotationY the server is told about. Keeping one owner keeps
// mouse look, the mobile auto-follow and attack magnetism from fighting over it.

import * as THREE from "three";
import { LAYER_UNOCCLUDED, type FrameContext, type QualitySettings } from "./quality";

export type CameraMode =
  /** Over-shoulder on the local warrior. */
  | "follow"
  /** Slow orbit of the arena while dead — spectating. */
  | "spectate"
  /** Slower, higher orbit before the fight starts. */
  | "lobby";

export interface CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** Camera yaw in radians. Also the rotationY sent to the server. */
  yaw: number;
  setMode(mode: CameraMode): void;
  /** Adds an impulse; the rig decays it. Larger hits should ask for more. */
  shake(intensity: number): void;
  setViewport(width: number, height: number): void;
  update(dt: number, ctx: FrameContext): void;
  dispose(): void;
}

const CAM_DIST = 4.4;
const CAM_HEIGHT = 2.05;
const CAM_SIDE = 1.0;
const LOOK_AHEAD = 3.6;
const LOOK_HEIGHT = 1.3;
const FOV_BASE = 55;
const FOV_SPRINT = 61;

export interface CameraOptions {
  aspect?: number;
}

export function createCameraRig(settings: QualitySettings, opts: CameraOptions = {}): CameraRig {
  void settings; // the tier decides whether collision sweeps and DoF focus run

  // near is 0.2, not 0.05: the rig never gets closer than 4.4 m to its subject,
  // and a 4000:1 depth ratio spends so much precision on empty space that GTAO
  // reconstructs the settlement out at 30 m from noise and darkens it uniformly.
  const camera = new THREE.PerspectiveCamera(FOV_BASE, opts.aspect ?? 1, 0.2, 200);
  camera.position.set(0, 8, 14);
  // The HUD plates and every particle billboard live on their own layer so the
  // occlusion prepass can drop them; the camera has to see it, or they vanish
  // from the beauty pass instead. Enabled here because the camera is this
  // module's, and a mask set anywhere else would be a second owner of it.
  camera.layers.enable(LAYER_UNOCCLUDED);

  const orbitTarget = new THREE.Vector3();
  let mode: CameraMode = "follow";
  let yaw = Math.PI;
  let fov = FOV_BASE;
  let shakeAmount = 0;

  function follow(dt: number, ctx: FrameContext): void {
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    // Screen-right, so the warrior sits off-centre and the sword arm is clear.
    const rightX = fwdZ;
    const rightZ = -fwdX;
    const damp = Math.min(1, dt * 7);

    const state = ctx.localState;
    const moving = state === "walking" || state === "running" || state === "sprinting";
    const bobFreq = state === "sprinting" ? 5.5 : moving ? 4 : 2.2;
    const bobAmp = state === "idle" ? 0.016 : 0.032;
    const bob = Math.sin(ctx.time * bobFreq) * bobAmp;

    camera.position.x += (ctx.focus.x - fwdX * CAM_DIST + rightX * CAM_SIDE - camera.position.x) * damp;
    camera.position.z += (ctx.focus.z - fwdZ * CAM_DIST + rightZ * CAM_SIDE - camera.position.z) * damp;
    camera.position.y += (CAM_HEIGHT + bob - camera.position.y) * Math.min(1, dt * 10);
    camera.lookAt(
      ctx.focus.x + fwdX * LOOK_AHEAD,
      LOOK_HEIGHT + bob * 0.7,
      ctx.focus.z + fwdZ * LOOK_AHEAD,
    );

    // A wider lens while sprinting; speed should be felt at the edges.
    const targetFov = state === "sprinting" ? FOV_SPRINT : FOV_BASE;
    fov += (targetFov - fov) * Math.min(1, dt * 5);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  function orbit(dt: number, radius: number, height: number, spin: number, lerp: number, lookY: number): void {
    yaw += dt * spin;
    orbitTarget.set(Math.sin(yaw) * radius, height, Math.cos(yaw) * radius);
    camera.position.lerp(orbitTarget, lerp);
    camera.lookAt(0, lookY, 0);
  }

  return {
    camera,

    get yaw() {
      return yaw;
    },
    set yaw(v: number) {
      yaw = v;
    },

    setMode(next) {
      mode = next;
    },

    shake(intensity) {
      shakeAmount = Math.max(shakeAmount, intensity);
    },

    setViewport(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },

    update(dt, ctx) {
      if (mode === "lobby") {
        // Pre-fight the camera drifts and nothing may jog it, so shake is not
        // decayed here either — whatever was left carries into the first frame
        // of the fight.
        orbit(dt, 16, 6.5, 0.12, 0.06, 1.6);
        return;
      }

      if (mode === "follow") follow(dt, ctx);
      else orbit(dt, 15, 7.5, 0.22, 0.04, 1.4);

      if (shakeAmount > 0.01) {
        camera.position.x += (Math.random() - 0.5) * shakeAmount * 0.12;
        camera.position.y += (Math.random() - 0.5) * shakeAmount * 0.12;
        shakeAmount *= 1 - Math.min(0.9, dt * 9);
      } else {
        shakeAmount = 0;
      }
    },

    dispose() {
      // Nothing retained. Collision raycasters and DoF focus state land here.
    },
  };
}
