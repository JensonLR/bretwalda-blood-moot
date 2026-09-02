// The camera controller: follow rig, orbit rigs, shake, FOV.
//
// The rig owns the yaw, not the input handler, because that one number is three
// things at once — where the camera looks, the basis the movement vector is
// built in, and the rotationY the server is told about. Keeping one owner keeps
// mouse look, the mobile auto-follow and attack magnetism from fighting over it.

import * as THREE from "three";
import {
  getFeel, getHandedness, lockFootMark, lockReticle, lockView, routeLook, subscribeHandedness,
} from "../input";
import { LAYER_UNOCCLUDED, type FrameContext, type QualitySettings } from "./quality";
// THE SAME SOLID LAW THE FEET OBEY (8.7). The jank strip photographed the
// follow camera inside a palisade post — the boom had no idea the world was
// solid. The march itself lives in `@/game/boom.mjs` (the spectate.mjs
// arrangement: one rule, imported by this rig and by `tools/solidtest.mjs`'s
// claims), fed the ground's own obstacle table — the one `resolveSolids`
// walks for movement — so what blocks a stride blocks the lens.
import { clearBoom } from "@/game/boom.mjs";
import { type Solid, type Passable } from "@/game/solidground.mjs";

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
  /**
   * Camera yaw in radians. Also the rotationY sent to the server.
   *
   * This is the ENGINE's channel: the lock's correction, the facing assist and
   * the photo harness write it and mean it. A look the PLAYER asked for goes
   * through `look` instead — see the note there.
   */
  yaw: number;
  /**
   * A look the player asked for, in radians, from a mouse or a thumb. Offered
   * to the lock before it lands: with a man held the lock owns the yaw, and the
   * travel becomes the flick that takes the next man rather than a shove the
   * lock spends the next three frames undoing. With nobody held it is applied
   * whole, which is free-look exactly as it was.
   */
  look(dx: number): void;
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
  /**
   * The arena's own obstacle table (8.7), so the follow boom pulls in
   * rather than clipping through a post. Passables are filtered here;
   * an empty list — the default — is the old behavior exactly.
   */
  setOccluders(solids: ReadonlyArray<Solid | Passable>, bound?: number): void;
  setViewport(width: number, height: number): void;
  update(dt: number, ctx: FrameContext): void;
  dispose(): void;
}

const CAM_DIST = 4.4;
const CAM_HEIGHT = 2.05;
const CAM_SIDE = 1.0;
const LOOK_AHEAD = 3.6;
const LOOK_HEIGHT = 1.3;
// The boom's occlusion march (8.7): from OCCL_MIN out (never inside the
// man's own head) in OCCL_STEP strides, blocked when a sample sits within
// OCCL_CLEAR of a solid that stands taller than the sample's own height.
// Fast in, damped out — a spring arm's asymmetry, because clipping INTO a
// post is a wrong frame now and easing back out is taste.
const OCCL_MIN = 0.9;
const OCCL_STEP = 0.25;
const OCCL_CLEAR = 0.32;
const FOV_BASE = 55;
const FOV_SPRINT = 61;

/**
 * A warrior spawned this close to the middle has no bearing to the middle worth
 * taking, and `atan2(0, 0)` is a silent 0 rather than an error. Inside it the
 * rig keeps the yaw it had, which is no worse than today.
 */
const SPAWN_MIN_RADIUS = 0.35;

// ---------------------------------------------------------------------------
// THE LOCK MARK
// ---------------------------------------------------------------------------
//
// It sits on the glass every second of every fight, which makes it the
// most-seen element in the game, and the man it points at is the thing the
// player is actually trying to read. So the mark is held to one rule: SAY WHO,
// AND OTHERWISE GET OUT OF THE WAY. The first cut was a 56 px amber ring with
// four ticks, a pair of chevrons and an inset glow, drawn at full opacity — a
// gunsight over an Anglo-Saxon melee, and the owner was polite about it.
//
// What replaced it is two hairline jaws at the sternum and a scribed line on
// the ground he is standing on. A third of the width, a fifth of the ink, and
// it is SILENT unless something has changed: a brief tighten when the lock
// takes a man, a snappier one when a flick hands it another, and nothing at all
// in between. Everything is drawn in the game's own bone-and-shadow palette,
// each stroke doubled over a dark one so it survives daylight turf on a phone.
//
// Two anchors, because "who" and "where he stands" are different claims and one
// scaled wrapper cannot carry both honestly: the jaws are placed on his chest
// and the line on his feet, each by its own projection.

/**
 * Sternum height on the man the lock is holding — where the jaws close.
 *
 * Measured off captures rather than guessed, against a warden whose feet and
 * head-top were both in frame: these men stand about 1.9 m, so his sternum is
 * at 1.37 and his belt at 1.12, and the mark wants the soft ground between
 * them. High enough not to read as a belt buckle, low enough not to crowd the
 * throat, and on the one part of him nothing else is ever drawn — the nameplate
 * and the health bar are above his head, the ground mark is at his feet.
 */
const LOCK_MARK_HEIGHT = 1.28;
/** The mark is drawn at full size at this range and shrinks with distance, the
 *  same way a real sight would. Clamped so it never becomes a dot or shouts. */
const LOCK_MARK_REF_DIST = 6.0;
const LOCK_MARK_MIN_SCALE = 0.62;
const LOCK_MARK_MAX_SCALE = 1.35;
/**
 * The acquire tighten: the jaws arrive this much too wide and close onto him.
 * A quarter of a second, once, and then the mark holds still — motion is how a
 * mark says something has changed, so a mark that is always moving has nothing
 * left to say with it.
 */
const LOCK_SNAP_SECONDS = 0.22;
const LOCK_SNAP_SPREAD = 0.46;
/** A pick the PLAYER made gets a shorter, harder flick than one the scoring
 *  made for him: he already knows it happened and only wants confirming. */
const LOCK_FLICK_SECONDS = 0.15;
const LOCK_FLICK_SPREAD = 0.32;
/** How much brighter the mark goes at the top of a snap. Small: the tighten is
 *  the event, and a flash on top of it would be two announcements of one thing. */
const LOCK_SNAP_LIFT = 0.4;

/**
 * WHERE THE MAN IS DRAWN, per player id — his rig group, registered by
 * render/hud3d.ts as it attaches the nameplate that tracks the same object.
 *
 * This exists because the mark was reading `target.position` off the wire while
 * a remote body renders 1.5 packet intervals in the past (REMOTE_DELAY_PACKETS,
 * render/anim.ts). At a run that is ~83 ms and ~0.34 m: the mark LED the man,
 * and two captures caught it sitting on empty turf beside him. The wire is the
 * right answer for the lock's own scoring — it is what the server will judge a
 * blow against — and the wrong answer for a mark on the glass, whose whole job
 * is to point at the man the player can see. So the mark follows the rig.
 */
const drawnBodies = new Map<string, THREE.Object3D>();

/** Register (or, with null, forget) the object a warrior is drawn on. */
export function noteDrawnBody(id: string, body: THREE.Object3D | null): void {
  if (body) drawnBodies.set(id, body);
  else drawnBodies.delete(id);
}

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
  const footPoint = new THREE.Vector3();
  const wirePoint = new THREE.Vector3();
  const bodyPoint = new THREE.Vector3();
  const viewPoint = new THREE.Vector3();
  /**
   * Where the last painted mark landed, for tools/touchtest.mjs.
   *
   * `source` and `leadPx` are the record of the lead bug: `wireSx` is where the
   * old code would have painted this same frame, and the gap between them is
   * the distance the mark used to run ahead of the man.
   */
  const lockPaint = {
    sx: 0, sy: 0, footY: 0, ndcZ: 0, viewZ: 0, dist: 0, w: 0,
    source: "none" as "none" | "rig" | "wire",
    wireSx: 0, leadPx: 0, leadM: 0,
    /** Both answers to "where is he", in world units, for the harnesses. */
    bodyX: 0, bodyZ: 0, wireX: 0, wireZ: 0, bodies: 0,
  };
  /** Which man the mark is on, and how far into its one animation it is. */
  let markId: string | null = null;
  let markSwitches = -1;
  let snapT = 99;
  let snapDur = LOCK_SNAP_SECONDS;
  let snapSpread = 0;
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
  /** The arena's obstacle table, for the boom (8.7). Passables are skipped
   *  by `clearBoom` itself — one rule, no second filter here. Empty = the
   *  old rig exactly. */
  let occluders: ReadonlyArray<Solid | Passable> = [];
  /** The ground's play-bound radius: the ring blocks the boom before the
   *  solids do — the palisade is the BOUND, not an obstacle row. */
  let occlBound = Infinity;
  /** The boom's current length, spring-armed between OCCL_MIN and CAM_DIST. */
  let boom = CAM_DIST;
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
  /**
   * Last point the FOLLOW rig framed. Only `shoulder` reads it, and `shoulder`
   * is a follow-mode measurement — the camera's lateral offset from the warrior
   * it is behind — so a value written by any other path would be meaningless in
   * it. This pair is deliberately NOT the aim readback; see `aimAt` below for
   * why that distinction cost a false claim.
   */
  let focusX = 0;
  let focusZ = 0;

  /**
   * WHERE THE LENS IS ACTUALLY POINTED, recorded where it is actually decided.
   *
   * This exists because the readback that replaced it could not work. A getter
   * was added over `focusX`/`focusZ` and offered as proof that the dead man's
   * orbit points at the fight. `focusX`/`focusZ` are assigned in exactly one
   * place — the end of `follow()` — and `follow()` never runs in spectate mode,
   * so on a dead client the getter returned (0, 0) and the "focus lands 0.61 m
   * from the nearest living man" it was quoted for was a distance from the world
   * ORIGIN. `tools/spectatetest.mjs --blind` reproduces that reading.
   *
   * THE LESSON IS THE PLACEMENT, not the arithmetic. A readback assigned inside
   * one of five aiming paths is a readback about that path. So every aim in this
   * file goes through here, beside the `lookAt` it records, and a new mode that
   * forgets to call it is visible as a bare call — `grep -nE 'camera\.lookAt\('
   * camera.ts` should find exactly one line, the one at the bottom of this
   * function.
   *
   * `aimFrame` counts recordings rather than frames, so a harness can tell "this
   * is where the lens is pointed" from "this is where it was pointed the last
   * time anything aimed it".
   */
  let aimX = 0;
  let aimY = 0;
  let aimZ = 0;
  let aimFrame = 0;
  function aimAt(x: number, y: number, z: number): void {
    aimX = x; aimY = y; aimZ = z;
    aimFrame++;
    camera.lookAt(x, y, z);
  }

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

    // THE BOOM'S OCCLUSION MARCH (8.7) — the rule is `boom.mjs`'s; this rig
    // only supplies its own geometry and constants.
    const clear = occluders.length || Number.isFinite(occlBound)
      ? clearBoom(occluders, ctx.focus.x, ctx.focus.z, fwdX, fwdZ, sideX, sideZ, {
        want: CAM_DIST, min: OCCL_MIN, step: OCCL_STEP, clear: OCCL_CLEAR,
        lookY: LOOK_HEIGHT, camY: CAM_HEIGHT, bound: occlBound,
      })
      : CAM_DIST;
    // Fast in, damped out — clipping INTO a post is a wrong frame now,
    // easing back out is taste. A snap frame takes the clear length whole.
    boom = snapNext || clear < boom
      ? clear
      : Math.min(CAM_DIST, boom + (clear - boom) * Math.min(1, dt * 3));
    const bk = boom / CAM_DIST;

    camera.position.x += (ctx.focus.x - fwdX * boom + sideX * bk - camera.position.x) * damp;
    camera.position.z += (ctx.focus.z - fwdZ * boom + sideZ * bk - camera.position.z) * damp;
    camera.position.y += (LOOK_HEIGHT + (CAM_HEIGHT - LOOK_HEIGHT) * bk + bob - camera.position.y) * (snapNext ? 1 : Math.min(1, dt * 10));
    aimAt(
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

  /** Hide both halves of the mark, without touching the DOM if they already are. */
  function hideLock(el: HTMLElement, foot: HTMLElement | null): void {
    if (el.style.opacity !== "0") el.style.opacity = "0";
    if (foot && foot.style.opacity !== "0") foot.style.opacity = "0";
    lockPaint.source = "none";
  }

  /**
   * Put the lock's mark on the man it is holding.
   *
   * The rule this exists for: never carry information in one channel only. The
   * camera holding a man is not, by itself, a statement that he is LOCKED —
   * it looks exactly like a player who happens to be pointing that way — so the
   * lock says so on the frame as well. Written straight onto the elements'
   * transforms rather than through React, because they move every frame and the
   * interface must not re-render at frame rate on a phone.
   *
   * The projection lives here because the camera does. `input.ts` decides who
   * is held; this decides where on the glass he currently is — and, since the
   * lead bug, WHICH of the two answers to that question is the honest one. See
   * `drawnBodies` above: the wire says where the server last put him, the rig
   * says where the player can see him, and a mark is a statement about the
   * picture.
   */
  function paintLock(dt: number): void {
    const el = lockReticle();
    const foot = lockFootMark();
    if (!el) return;
    const v = mode === "follow" ? lockView() : null;
    if (!v || v.blend < 0.02) {
      hideLock(el, foot);
      // Hidden is forgotten: the next man the lock takes gets the acquire
      // tighten rather than sliding silently in from wherever the last one fell.
      markId = null;
      return;
    }

    // ---- who, and where he is DRAWN ----
    const body = drawnBodies.get(v.id) ?? null;
    if (body && body.parent) {
      // The rig is a child of the scene and anim.ts has already placed it this
      // frame, push and all; this only refreshes the derived matrix.
      body.updateWorldMatrix(true, false);
      bodyPoint.setFromMatrixPosition(body.matrixWorld);
      lockPaint.source = "rig";
    } else {
      // No rig for him yet — one frame at most, on the frame he joins. The wire
      // is a better answer than nothing.
      bodyPoint.set(v.x, 0, v.z);
      lockPaint.source = "wire";
    }
    markPoint.set(bodyPoint.x, bodyPoint.y + LOCK_MARK_HEIGHT, bodyPoint.z);
    footPoint.copy(bodyPoint);

    const dist = camera.position.distanceTo(markPoint);
    // The camera is positioned by hand above and only the renderer refreshes
    // its world matrix, so without this the mark is projected through LAST
    // frame's lens — which at 120 Hz is a mark that visibly trails the man.
    camera.updateMatrixWorld();
    // Behind the lens, tested in VIEW SPACE rather than off the projected z.
    // `project` divides by w, and for a point at or behind the eye plane w
    // approaches zero: the NDC does not politely exceed 1, it explodes. The
    // harness caught the explosion as a reticle 22589 px off centre — the sign
    // of an out-of-frame point being clamped by nothing at all.
    viewPoint.copy(markPoint).applyMatrix4(camera.matrixWorldInverse);
    if (viewPoint.z > -camera.near) {
      hideLock(el, foot);
      return;
    }
    markPoint.project(camera);
    // And a belt for the braces: anything this far outside the frustum is not
    // on the man, whatever the arithmetic says.
    if (Math.abs(markPoint.x) > 4 || Math.abs(markPoint.y) > 4) {
      hideLock(el, foot);
      return;
    }
    const sx = (markPoint.x * 0.5 + 0.5) * viewW;
    const sy = (-markPoint.y * 0.5 + 0.5) * viewH;
    // His feet, projected in their own right. Clamped rather than trusted: the
    // chest can be in front of the eye plane while the feet are not — a man
    // stood on top of the lens — and `project` divides by a w approaching zero,
    // which is how the old reticle once landed 22589 px off centre. A ground
    // mark a screen height off the bottom is off the bottom; that is enough.
    footPoint.project(camera);
    const footY = Math.max(-viewH, Math.min(viewH * 2, (-footPoint.y * 0.5 + 0.5) * viewH));

    // What the wire would have painted this frame, kept only so the harness can
    // measure the lead the rig position removes. Nothing draws from it.
    wirePoint.set(v.x, LOCK_MARK_HEIGHT, v.z).project(camera);
    lockPaint.wireSx = (wirePoint.x * 0.5 + 0.5) * viewW;
    lockPaint.leadPx = lockPaint.wireSx - sx;
    lockPaint.leadM = Math.hypot(v.x - bodyPoint.x, v.z - bodyPoint.z);
    lockPaint.bodyX = bodyPoint.x;
    lockPaint.bodyZ = bodyPoint.z;
    lockPaint.wireX = v.x;
    lockPaint.wireZ = v.z;
    lockPaint.bodies = drawnBodies.size;
    lockPaint.sx = sx;
    lockPaint.sy = sy;
    lockPaint.footY = footY;
    lockPaint.ndcZ = markPoint.z;
    lockPaint.viewZ = viewPoint.z;
    lockPaint.dist = dist;
    lockPaint.w = viewW;

    // ---- the one animation ----
    // A new man is an event and gets a tighten. A man the PLAYER took with a
    // flick gets the shorter, harder one: he knows what he did and only wants
    // it confirmed. Everything else is stillness, on purpose.
    if (v.id !== markId) {
      const flicked = markId !== null && v.switches !== markSwitches;
      snapDur = flicked ? LOCK_FLICK_SECONDS : LOCK_SNAP_SECONDS;
      snapSpread = flicked ? LOCK_FLICK_SPREAD : LOCK_SNAP_SPREAD;
      snapT = 0;
      markId = v.id;
      markSwitches = v.switches;
    }
    snapT += dt;
    // Ease-out cubic on the way in, so it lands rather than arriving linearly.
    const u = Math.min(1, snapT / snapDur);
    const open = (1 - u) * (1 - u) * (1 - u) * snapSpread;

    const scale = Math.max(LOCK_MARK_MIN_SCALE, Math.min(LOCK_MARK_MAX_SCALE, LOCK_MARK_REF_DIST / Math.max(0.5, dist)));
    const alpha = Math.min(1, v.blend * (1 + open * (LOCK_SNAP_LIFT / Math.max(0.01, snapSpread))));
    // The jaws carry the tighten; they are the half of the mark that says WHO.
    el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(scale * (1 + open)).toFixed(3)})`;
    el.style.opacity = alpha.toFixed(3);
    if (foot) {
      // The ground line is placed by its OWN projection rather than hung off
      // the jaws at a fixed offset: the distance scale is clamped at both ends,
      // and anything hung off it walks up the man's shins the moment it is.
      foot.style.transform = `translate3d(${sx.toFixed(1)}px, ${footY.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      foot.style.opacity = (alpha * 0.9).toFixed(3);
    }
  }

  /**
   * A slow circle about a point on the turf.
   *
   * `cx`/`cz` DID NOT USED TO EXIST and their absence was the whole of the dead
   * man's problem. This function set its target from the origin and called
   * `lookAt(0, lookY, 0)` — both ends hard-wired to the middle of the arena — so
   * `GameCanvas.tsx` writing `focusRef.current.set(0, 0, 0)` before selecting
   * "spectate" was not choosing the arena centre, it was writing a value nothing
   * downstream read. A dead man watched the middle of the ring for the rest of
   * the round whether or not anything was happening there, and if the last two
   * men were fighting at the edge he watched empty turf while they did it.
   *
   * The lobby still passes nothing and still turns about the origin, which is
   * right: before the fight there is no fight to point at.
   */
  function orbit(dt: number, radius: number, height: number, spin: number, lerp: number,
                 lookY: number, cx = 0, cz = 0): void {
    yaw += dt * spin;
    orbitTarget.set(cx + Math.sin(yaw) * radius, height, cz + Math.cos(yaw) * radius);
    camera.position.lerp(orbitTarget, lerp);
    aimAt(cx, lookY, cz);
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

    look(dx) {
      // THE SENSITIVITY (8.9) is applied here, the one gate every look
      // gesture passes — mouse and touch alike — BEFORE the lock reads it:
      // a flick's meaning must not depend on a comfort dial, so the gain
      // scales the hand's motion, and `routeLook` judges the scaled motion
      // the same way it always has.
      //
      // Offered to the lock first. With a man held it takes the whole of it and
      // spends it on choosing WHICH man; with nobody held it hands it straight
      // back and this is free-look, unchanged. The lock's own corrections do
      // not come through here — they are not the player asking for anything.
      yaw += routeLook(dx * getFeel().sensitivity);
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
      // The shake toggle (8.9), enforced at the source: an impulse never
      // banked is an impulse no frame can spend. Accessibility, not a
      // nerf — nothing the shake conveys is information the HUD does not
      // also say in numbers and marks.
      if (!getFeel().shake) return;
      shakeAmount = Math.max(shakeAmount, intensity);
    },

    setOccluders(solids, bound) {
      occluders = solids;
      occlBound = Number.isFinite(bound) ? (bound as number) : Infinity;
      boom = CAM_DIST;
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
          aimAt(...photoFraming.target);
          // The focus IS the aim. Depth of field measures its plane from
          // `ctx.focus`, and a framed photograph's subject is what it is
          // framed on — not wherever the fight last left the follow camera.
          ctx.focus.set(...photoFraming.target);
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
          aimAt(...summaryShot.target);
          // The focus IS the aim, at its real height. The deathcam and the
          // victory tableau both ride this branch, and depth of field measures
          // its plane from `ctx.focus` — GameCanvas used to seed it on the
          // ground plane, which at four metres put the sharp plane a little
          // under the man's boots rather than on his face.
          ctx.focus.set(...summaryShot.target);
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
      else if (mode === "spectate") {
        // A RINGSIDE SEAT, AND THE HEIGHT IS THE POINT.
        //
        // The dead must not be given sight a living man does not have. This
        // arena is not open turf — `world.ts` keeps a 6.2 m clear radius at the
        // middle and puts huts, rocks and props outside it, and `solidground`
        // collides against them — so a man CAN be behind something, and a lens
        // that floats over the roofs would hand a dead player the one thing he
        // must not be able to pass on: where a living man is hiding.
        //
        // So this camera stands rather than flies, and it stands at exactly
        // `CAM_HEIGHT` — the height a LIVING player's own follow lens rides at,
        // off the same constant rather than a number near it. That is the whole
        // safety claim and it is worth having as an identity instead of an
        // argument: elevation is the one axis on which a spectator lens can see
        // past cover a living man cannot, so a dead lens at a living lens's own
        // height cannot see over anything a living player's camera cannot see
        // over. Bearing is no leak — a living man can walk to any bearing — and
        // nor is distance, which at a fixed height makes a sightline over cover
        // SHALLOWER rather than steeper.
        //
        // It was 2.2 m, chosen as "a head above a standing warrior", which is
        // the same intent arrived at by eye; `node tools/spectatetest.mjs
        // --phases=rig` with 2.2 put back in place of `CAM_HEIGHT` prints
        // "the dead man's ringside lens at 2.200 m — 0.134 m against the living
        // lens at its highest", so the claim was false as written, by a hand's
        // breadth. (0.134 m, measured by running it. This comment said 0.138 m
        // for a round, which is a number that harness does not print.) The
        // constant now cannot drift from the thing it is claimed equal to.
        //
        // It circles the fight at 11 m instead of sitting 15 m out from a centre
        // the fight may have left. What it shows is what somebody standing at
        // the ropes would see, which is the honest reading of "a fixed view of
        // the ring".
        //
        // Where it points is `ctx.focus`, which `GameCanvas.tsx` now puts on the
        // men who are still alive rather than on the origin.
        orbit(dt, 11, CAM_HEIGHT, 0.16, 0.045, 1.35, ctx.focus.x, ctx.focus.z);
      } else orbit(dt, 15, 7.5, 0.22, 0.04, 1.4);
      // After the rig has moved, so the reticle is projected through this
      // frame's camera rather than the last one's — a lag of one frame here is
      // a reticle that trails the man at 120 Hz on a phone.
      paintLock(dt);

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
       * Where the lens actually is, in world metres. A readback and nothing
       * else — no game code reads it. It exists because "the dead man's camera
       * points at the fight and stands at a man's height rather than flying
       * over the roofs" is a claim about a POSITION, and there was no way to
       * measure a position from outside the module.
       */
      get position() { return { x: camera.position.x, y: camera.position.y, z: camera.position.z }; },
      /**
       * The world point the lens was last aimed at, from whichever path aimed
       * it, with a count of aimings so a stale read is visible as one.
       *
       * THIS REPLACES A GETTER THAT COULD NOT WORK — see `aimAt` above. It is
       * still only half an instrument on its own, because a readback of a value
       * the caller handed in agrees with itself by construction; that is failure
       * mode 1 in `docs/PROCESS.md`, ten instances. So `tools/spectatetest.mjs`
       * does not trust this number on its own: it scores the point against the
       * ray `camera.getWorldDirection()` gives, which comes off the world matrix
       * `lookAt` wrote and which nothing here can fake.
       */
      get aim() { return { x: aimX, y: aimY, z: aimZ, frame: aimFrame }; },
      /** Where the lock reticle was last painted, and the numbers behind it. */
      get lockPaint() { return { ...lockPaint }; },
      /**
       * Every warrior the mark could be put on, and where his rig is standing.
       * The one readback that can tell "the mark is on the wrong man" from "the
       * mark is on the right man in the wrong place" — which are different bugs
       * and cost an hour to tell apart without it.
       */
      get bodies() {
        const out: { id: string; x: number; z: number; inScene: boolean }[] = [];
        for (const [id, body] of drawnBodies) {
          body.updateWorldMatrix(true, false);
          bodyPoint.setFromMatrixPosition(body.matrixWorld);
          out.push({ id, x: bodyPoint.x, z: bodyPoint.z, inScene: !!body.parent });
        }
        return out;
      },
      /**
       * How far the camera sits to the warrior's own right, in metres. Positive
       * is over the right shoulder. Measured off the camera's world position and
       * this frame's yaw, not off `CAM_SIDE` — an assertion against the sign of
       * a constant would only prove the constant.
       *
       * FOLLOW MODE ONLY, and that is why it reads `focusX`/`focusZ` rather than
       * `aim`: it wants the man the lens is behind, not the point the lens is
       * pointed at, and the two are only the same thing in follow. Read in any
       * other mode it reports the offset from the last man followed.
       *
       * (A comment above this used to say this getter was gone and that
       * `tools/cameratest.mjs` was reading `undefined` at two assertions. It was
       * never gone — it is right here, and cameratest reads it. The claim was
       * false and is deleted rather than moved.)
       */
      get shoulder() {
        return (camera.position.x - focusX) * -Math.cos(yaw)
          + (camera.position.z - focusZ) * Math.sin(yaw);
      },
    };
  }

  return rig;
}
