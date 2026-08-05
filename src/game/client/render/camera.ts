// The camera controller: follow rig, orbit rigs, shake, FOV.
//
// The rig owns the yaw, not the input handler, because that one number is three
// things at once — where the camera looks, the basis the movement vector is
// built in, and the rotationY the server is told about. Keeping one owner keeps
// mouse look, the mobile auto-follow and attack magnetism from fighting over it.

import * as THREE from "three";
import { getHandedness, lockReticle, lockView, subscribeHandedness } from "../input";
import { LAYER_UNOCCLUDED, type FrameContext, type QualitySettings } from "./quality";

export type CameraMode =
  /** Over-shoulder on the local warrior. */
  | "follow"
  /** Slow orbit of the arena while dead — spectating. */
  | "spectate"
  /** Slower, higher orbit before the fight starts. */
  | "lobby"
  /**
   * Fixed framing for the capture harness. Every play mode looks over the
   * local warrior's shoulder, which means his own back occludes whatever he
   * is fighting — so no in-game view can show a warrior's front, and the
   * character work could not be reviewed at all. This mode exists so a
   * capture can be aimed anywhere. Never selected during play.
   */
  | "photo"
  /**
   * The end-of-match tableau: one slow push toward the victor, aimed by
   * `render/summary.ts`. Deliberately not the lobby orbit — the summary is a
   * staged picture of the men who fought, and an orbit walks the lens away
   * from it.
   */
  | "summary";

/** Where "photo" mode puts the camera and what it points at. */
export interface PhotoFraming {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

/**
 * The summary's one move: a push from `from` to `to`, eyes on `target` the
 * whole way. The rig owns the clock so the staging module cannot retime it
 * mid-flight; re-aiming restarts the push, which is what a cut is.
 */
export interface SummaryShot {
  from: [number, number, number];
  to: [number, number, number];
  target: [number, number, number];
  fov?: number;
  /** Seconds the push takes. The tail eases, so overshooting is impossible. */
  seconds?: number;
}

export interface CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  /** Camera yaw in radians. Also the rotationY sent to the server. */
  yaw: number;
  setMode(mode: CameraMode): void;
  /** Aims "photo" mode. Selecting the mode without this leaves the rig put. */
  setPhotoFraming(framing: PhotoFraming): void;
  /** Aims "summary" mode and restarts its push from the top. */
  setSummaryShot(shot: SummaryShot): void;
  /**
   * The heading the sim spawned this warrior on, for the rig to adopt the next
   * time a round hands it back to him. One-shot: consumed by the adoption, so
   * round three never opens on round one's bearing. Left unset, the rig takes
   * the bearing from the spawn mark to the middle of the arena, which is where
   * the sim faces men — see `adoptSpawnHeading`.
   */
  setSpawnHeading(yaw: number): void;
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

/**
 * A warrior spawned this close to the middle has no bearing to the middle worth
 * taking, and `atan2(0, 0)` is a silent 0 rather than an error. Inside it the
 * rig keeps the yaw it had, which is no worse than today.
 */
const SPAWN_MIN_RADIUS = 0.35;

/**
 * Chest height on the man the lock is holding. The reticle is drawn there
 * rather than at his feet because a ground mark disappears under the man in
 * front of him the moment three of them converge, and the lock has to be
 * readable in exactly that case.
 */
const LOCK_MARK_HEIGHT = 1.45;
/** The reticle is drawn at full size at this range and shrinks with distance,
 *  the same way a real sight would. Clamped so it never becomes a dot or eats
 *  the screen. */
const LOCK_MARK_REF_DIST = 6.0;
const LOCK_MARK_MIN_SCALE = 0.55;
const LOCK_MARK_MAX_SCALE = 1.5;

/**
 * Which shoulder the camera looks over, as a sign on the lateral offset.
 *
 * `+1` is over the RIGHT shoulder — the default, because the majority are
 * right-handed and this is what the weapon hand in `anim.ts` is mirrored to
 * agree with. `-1` is over the left, and it is the SAME one setting that
 * already mirrors the touch zones (`input.ts`) and the HUD cluster
 * (`GameHud.tsx`) and rides the profile. There is deliberately no second
 * control: one switch turns the camera, the sword hand and the HUD together or
 * the player ends up half left-handed.
 */
function shoulderSign(): number {
  return getHandedness() ? -1 : 1;
}

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
  const markPoint = new THREE.Vector3();
  const viewPoint = new THREE.Vector3();
  /** Where the last painted reticle landed, for tools/touchtest.mjs. */
  const lockPaint = { sx: 0, sy: 0, ndcZ: 0, viewZ: 0, dist: 0, w: 0 };
  // Seeded rather than left at 1: `setViewport` is called from the resize
  // handler, so on a phone that never rotates it is never called at all, and a
  // reticle projected against a 1×1 viewport is painted in the top-left corner
  // of the screen and stays there. The harness caught it as "slid 1px".
  let viewW = typeof window !== "undefined" ? window.innerWidth : 1;
  let viewH = typeof window !== "undefined" ? window.innerHeight : 1;
  let photoFraming: PhotoFraming | null = null;
  let summaryShot: SummaryShot | null = null;
  /** Seconds into the summary push. */
  let summaryT = 0;
  let mode: CameraMode = "follow";
  let yaw = Math.PI;
  let fov = FOV_BASE;
  let shakeAmount = 0;

  // ---- spawn heading ----------------------------------------------------
  // True while the rig owes the warrior his spawn bearing. Armed at boot and
  // again every time the rig leaves "follow" — the lobby orbit, the
  // between-rounds orbit and death all go out through `setMode`, and every one
  // of those returns is a spawn. Without this the rig kept whatever yaw the
  // orbit or the last dying look had left in it and the player opened the round
  // facing the palisade. Best-of-5 makes that up to five wasted openings.
  let pendingAdopt = true;
  let spawnHeading: number | null = null;
  /** Diagnostics. `adoptFrame` is which follow frame of this round adopted. */
  let adoptions = 0;
  let followFrame = 0;
  let adoptFrame = -1;
  let adoptedFrom = 0;
  /** Set by an adoption, consumed by the same frame's `follow`: no ease-in. */
  let snapNext = false;
  /** Last point the follow rig framed. Only the readback below reads it. */
  let focusX = 0;
  let focusZ = 0;

  /**
   * Take the heading the round starts on. Called from `follow` on the first
   * frame after the rig is handed back, so "within one tick of a round
   * starting" is `adoptFrame === 0` and is asserted rather than asserted about.
   *
   * The bearing is the sim's own if anything handed it over, otherwise the line
   * from the spawn mark to the middle of the arena — which is where the sim
   * faces men, so the two agree without the rig having to be told.
   */
  function adoptSpawnHeading(ctx: FrameContext): void {
    pendingAdopt = false;
    let want = spawnHeading;
    spawnHeading = null;
    if (want === null) {
      const r2 = ctx.focus.x * ctx.focus.x + ctx.focus.z * ctx.focus.z;
      if (r2 < SPAWN_MIN_RADIUS * SPAWN_MIN_RADIUS) return;
      // Forward is (sin yaw, cos yaw), and forward must point at the origin.
      want = Math.atan2(-ctx.focus.x, -ctx.focus.z);
    }
    adoptedFrom = yaw;
    yaw = want;
    adoptFrame = followFrame;
    adoptions++;
    // Snapped, not eased: the point of the adoption is that the first second of
    // the round is spent fighting rather than watching the camera swing round.
    snapNext = true;
  }

  function follow(dt: number, ctx: FrameContext): void {
    if (pendingAdopt) adoptSpawnHeading(ctx);

    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    // The shoulder. Screen-right is `up × fwd` = (-fwdZ, fwdX): three.js is
    // right-handed and the camera looks down its own -Z, so the world axis that
    // comes out on the right of frame is NOT (fwdZ, -fwdX). The rig shipped
    // with that second one, which is why the camera sat over the LEFT shoulder
    // with the warrior filling the right of frame — the owner read it off the
    // screen before anyone read it off the code. Offsetting the camera to the
    // warrior's right puts him left of centre, which is over-the-right-shoulder.
    const side = CAM_SIDE * shoulderSign();
    const sideX = -fwdZ * side;
    const sideZ = fwdX * side;
    const damp = snapNext ? 1 : Math.min(1, dt * 7);

    const state = ctx.localState;
    const moving = state === "walking" || state === "running" || state === "sprinting";
    const bobFreq = state === "sprinting" ? 5.5 : moving ? 4 : 2.2;
    const bobAmp = state === "idle" ? 0.016 : 0.032;
    const bob = Math.sin(ctx.time * bobFreq) * bobAmp;

    camera.position.x += (ctx.focus.x - fwdX * CAM_DIST + sideX - camera.position.x) * damp;
    camera.position.z += (ctx.focus.z - fwdZ * CAM_DIST + sideZ - camera.position.z) * damp;
    camera.position.y += (CAM_HEIGHT + bob - camera.position.y) * (snapNext ? 1 : Math.min(1, dt * 10));
    camera.lookAt(
      ctx.focus.x + fwdX * LOOK_AHEAD,
      LOOK_HEIGHT + bob * 0.7,
      ctx.focus.z + fwdZ * LOOK_AHEAD,
    );
    snapNext = false;
    followFrame++;
    focusX = ctx.focus.x;
    focusZ = ctx.focus.z;

    // A wider lens while sprinting; speed should be felt at the edges.
    const targetFov = state === "sprinting" ? FOV_SPRINT : FOV_BASE;
    fov += (targetFov - fov) * Math.min(1, dt * 5);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  /**
   * Put the lock's reticle on the man it is holding.
   *
   * The rule this exists for: never carry information in one channel only. The
   * camera holding a man is not, by itself, a statement that he is LOCKED —
   * it looks exactly like a player who happens to be pointing that way — so the
   * lock says so on the frame as well. Written straight onto the element's
   * transform rather than through React, because it moves every frame and the
   * interface must not re-render at frame rate on a phone.
   *
   * The projection lives here because the camera does. `input.ts` decides who
   * is held; this decides where on the glass he currently is.
   */
  function paintLock(): void {
    const el = lockReticle();
    if (!el) return;
    const v = mode === "follow" ? lockView() : null;
    if (!v || v.blend < 0.02) {
      if (el.style.opacity !== "0") el.style.opacity = "0";
      return;
    }
    markPoint.set(v.x, LOCK_MARK_HEIGHT, v.z);
    const dist = camera.position.distanceTo(markPoint);
    // The camera is positioned by hand above and only the renderer refreshes
    // its world matrix, so without this the reticle is projected through LAST
    // frame's lens — which at 120 Hz is a reticle that visibly trails the man.
    camera.updateMatrixWorld();
    // Behind the lens, tested in VIEW SPACE rather than off the projected z.
    // `project` divides by w, and for a point at or behind the eye plane w
    // approaches zero: the NDC does not politely exceed 1, it explodes. The
    // harness caught the explosion as a reticle 22589 px off centre — the sign
    // of an out-of-frame point being clamped by nothing at all.
    viewPoint.copy(markPoint).applyMatrix4(camera.matrixWorldInverse);
    if (viewPoint.z > -camera.near) {
      if (el.style.opacity !== "0") el.style.opacity = "0";
      return;
    }
    markPoint.project(camera);
    // And a belt for the braces: anything this far outside the frustum is not
    // on the man, whatever the arithmetic says.
    if (Math.abs(markPoint.x) > 4 || Math.abs(markPoint.y) > 4) {
      if (el.style.opacity !== "0") el.style.opacity = "0";
      return;
    }
    const sx = (markPoint.x * 0.5 + 0.5) * viewW;
    const sy = (-markPoint.y * 0.5 + 0.5) * viewH;
    lockPaint.sx = sx;
    lockPaint.sy = sy;
    lockPaint.ndcZ = markPoint.z;
    lockPaint.viewZ = viewPoint.z;
    lockPaint.dist = dist;
    lockPaint.w = viewW;
    const scale = Math.max(LOCK_MARK_MIN_SCALE, Math.min(LOCK_MARK_MAX_SCALE, LOCK_MARK_REF_DIST / Math.max(0.5, dist)));
    el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
    el.style.opacity = Math.min(1, v.blend).toFixed(3);
  }

  function orbit(dt: number, radius: number, height: number, spin: number, lerp: number, lookY: number): void {
    yaw += dt * spin;
    orbitTarget.set(Math.sin(yaw) * radius, height, Math.cos(yaw) * radius);
    camera.position.lerp(orbitTarget, lerp);
    camera.lookAt(0, lookY, 0);
  }

  // The handedness store lives in `input.ts` and reads itself out of
  // localStorage on its first subscriber. The HUD is normally that subscriber,
  // but the rig must not depend on the HUD having mounted first or the opening
  // frame of a left-handed player's match is framed right-handed. Subscribing
  // here forces the load and costs one closure.
  const unsubscribeHand = subscribeHandedness(() => { /* read live, per frame */ });

  const rig: CameraRig = {
    camera,

    get yaw() {
      return yaw;
    },
    set yaw(v: number) {
      yaw = v;
    },

    setMode(next) {
      // Leaving "follow" arms the next entry. The orchestrator calls this every
      // frame, so only the leaving edge is an event: lobby, the between-rounds
      // orbit, the spectate orbit after a death and "photo" all pass through
      // here, and coming back out of any of them is a spawn.
      if (next !== "follow" && mode === "follow") {
        pendingAdopt = true;
        followFrame = 0;
        adoptFrame = -1;
      }
      mode = next;
    },

    setSpawnHeading(next) {
      spawnHeading = next;
    },

    setPhotoFraming(framing) {
      photoFraming = framing;
    },

    setSummaryShot(shot) {
      summaryShot = shot;
      summaryT = 0;
    },

    shake(intensity) {
      shakeAmount = Math.max(shakeAmount, intensity);
    },

    setViewport(width, height) {
      viewW = width;
      viewH = height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },

    update(dt, ctx) {
      // Snapped, not lerped, and no shake: a capture has to be byte-comparable
      // between runs or an A/B against the previous iteration measures camera
      // drift instead of art.
      if (mode === "photo") {
        if (photoFraming) {
          camera.position.set(...photoFraming.position);
          camera.lookAt(...photoFraming.target);
          const want = photoFraming.fov ?? FOV_BASE;
          if (camera.fov !== want) {
            camera.fov = want;
            camera.updateProjectionMatrix();
          }
        }
        return;
      }

      if (mode === "summary") {
        // One slow push, no shake, no bob: the fight is over and the frame is
        // a portrait. Ease-out so the move dies rather than stopping — the
        // last metres take most of the push, which reads as the lens settling
        // on the victor instead of arriving at him.
        if (summaryShot) {
          summaryT += dt;
          const k = Math.min(1, summaryT / (summaryShot.seconds ?? 8));
          const e = 1 - Math.pow(1 - k, 3);
          const [fx, fy, fz] = summaryShot.from;
          const [tx, ty, tz] = summaryShot.to;
          camera.position.set(fx + (tx - fx) * e, fy + (ty - fy) * e, fz + (tz - fz) * e);
          camera.lookAt(...summaryShot.target);
          const want = summaryShot.fov ?? FOV_BASE;
          if (camera.fov !== want) {
            camera.fov = want;
            camera.updateProjectionMatrix();
          }
        }
        return;
      }

      if (mode === "lobby") {
        // Pre-fight the camera drifts and nothing may jog it, so shake is not
        // decayed here either — whatever was left carries into the first frame
        // of the fight.
        orbit(dt, 16, 6.5, 0.12, 0.06, 1.6);
        return;
      }

      if (mode === "follow") follow(dt, ctx);
      else orbit(dt, 15, 7.5, 0.22, 0.04, 1.4);
      // After the rig has moved, so the reticle is projected through this
      // frame's camera rather than the last one's — a lag of one frame here is
      // a reticle that trails the man at 120 Hz on a phone.
      paintLock();

      if (shakeAmount > 0.01) {
        camera.position.x += (Math.random() - 0.5) * shakeAmount * 0.12;
        camera.position.y += (Math.random() - 0.5) * shakeAmount * 0.12;
        shakeAmount *= 1 - Math.min(0.9, dt * 9);
      } else {
        shakeAmount = 0;
      }
    },

    dispose() {
      unsubscribeHand();
      if (typeof window !== "undefined") {
        delete (window as unknown as Record<string, unknown>).__bretwaldaCamera;
      }
      // Collision raycasters and DoF focus state land here.
    },
  };

  // A readback for `tools/cameratest.mjs`, the same shape of hook `audio.ts`
  // already hangs on the window for `phonesound`. Nothing in the game reads it.
  // The measured lateral offset is the one number worth exporting: an assertion
  // against the SIGN of a constant would only prove the constant, whereas this
  // is where the camera actually ended up relative to the man, in his own frame.
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__bretwaldaCamera = {
      get yaw() { return yaw; },
      get mode() { return mode; },
      get lefty() { return getHandedness(); },
      /** Adoptions of a spawn heading since boot. One per round, at least. */
      get adoptions() { return adoptions; },
      /** Which follow frame of this round adopted. 0 is "within one tick". */
      get adoptFrame() { return adoptFrame; },
      /** The yaw thrown away by the adoption — what the orbit had left behind. */
      get adoptedFrom() { return adoptedFrom; },
      /**
       * How far the camera sits to the warrior's own right, in metres. Positive
       * is over the right shoulder. Measured off the camera's world position and
       * this frame's yaw, not off `CAM_SIDE`.
       */
      /** Where the lock reticle was last painted, and the numbers behind it. */
      get lockPaint() { return { ...lockPaint }; },
      get shoulder() {
        return (camera.position.x - focusX) * -Math.cos(yaw)
          + (camera.position.z - focusZ) * Math.sin(yaw);
      },
    };
  }

  return rig;
}
