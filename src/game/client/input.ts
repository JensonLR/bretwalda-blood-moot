// Player intent → the message the server expects.
//
// The shape of that message is the multiplayer contract with
// src/game/engine.mjs and is frozen: the server is authoritative, and every
// field name and sign convention here has a counterpart in its simulation.
// Feel free to change how intent is gathered; do not change what comes out.
//
// How intent is gathered on a phone is set out in docs/MOBILE-CONTROLS.md. The
// short version, because it explains most of the shape of this file: movement,
// aim and attack direction are three separate intentions and they get three
// separate inputs. The left thumb moves and does nothing else. The right thumb
// looks. The direction the right thumb flicks as it attacks is the direction of
// the cut.

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AttackDirection, GamePlayer, WarriorClass } from "../types";
import type { CameraRig } from "./render/camera";

export interface MobileFlags {
  attack: boolean;
  heavy: boolean;
  block: boolean;
  dodge: boolean;
  ability: boolean;
  sprint: boolean;
}

export interface InputSources {
  isMobile: boolean;
  keys: Set<string>;
  /**
   * Keys seen going down since the last sample, whether or not they are still
   * held. Sampling is polled at 60 Hz, so a tap shorter than one poll would
   * otherwise never be observed — and a dodge or an ability is exactly the
   * input a player taps as fast as they can. Held state comes from `keys`;
   * one-shot deeds consult this too. The caller clears it after each sample.
   */
  tapped: Set<string>;
  mouseDown: boolean;
  rightMouseDown: boolean;
  joystick: { x: number; y: number };
  mobile: MobileFlags;
}

export interface InputSample {
  /** Ready to hand straight to the transport. */
  message: Record<string, unknown>;
  attackDir: AttackDirection;
  pressedAttack: boolean;
}

function shortestAngle(from: number, to: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---------------------------------------------------------------------------
// The right thumb
// ---------------------------------------------------------------------------
//
// One thumb, two intentions, two owners. A free-look drag lands on the canvas
// and is handled by useTouchControls below; a swing gesture starts on a HUD
// button and is handled in GameHud, because a touch belongs to the element it
// started on for its whole life and the canvas never sees it. They are the same
// thumb and they have to agree about what it is doing, so the state they share
// lives here at module scope: there is exactly one game per document, and the
// component that sits between the two of them owns neither.

/** Pixels of travel before a drag is a flick with a direction in it. Low enough
 *  that a deliberate flick is never missed, high enough that the wobble in a
 *  thumb press is not read as a cut. */
const SWIPE_PX = 18;

const swing = {
  /** A finger is down on an attack button. This is what tells aim from swing. */
  pressed: false,
  /** The direction the thumb has described, or null while it is still a tap. */
  dir: null as AttackDirection | null,
  /** The finger currently describing the gesture; a different one re-anchors. */
  owner: null as number | null,
  /** Where the current flick is measured from. Moves on every commit. */
  x: 0,
  y: 0,
};

/** A free-look finger is down. The facing assist must never fight it. */
let freeLooking = false;

/** Called when a finger lands on an attack button. */
export function beginSwingGesture(id: number, x: number, y: number): void {
  swing.pressed = true;
  swing.dir = null;
  swing.owner = id;
  swing.x = x;
  swing.y = y;
}

/**
 * Feed the gesture where the finger is now. Returns the direction if this move
 * committed one, so the caller can fire the blow the moment the flick reads
 * rather than waiting out the arming window.
 */
export function trackSwingGesture(id: number, x: number, y: number): AttackDirection | null {
  // A finger that was not the one describing the gesture takes it over from
  // where it is, not from where the other one started — otherwise a thumb on
  // the button and a thumb on the canvas measure a flick between each other.
  if (swing.owner !== id) {
    swing.owner = id;
    swing.x = x;
    swing.y = y;
    return null;
  }
  const dx = x - swing.x;
  const dy = y - swing.y;
  if (Math.hypot(dx, dy) < SWIPE_PX) return null;
  // Four directions, and the same four the keyboard has: across for a cut
  // either side, up for an overhead, down for a thrust.
  const dir: AttackDirection = Math.abs(dx) > Math.abs(dy)
    ? (dx < 0 ? "left" : "right")
    : (dy < 0 ? "overhead" : "stab");
  // Re-anchor, so a second flick is measured from where the thumb is now. This
  // is what lets a held combo change direction between swings.
  swing.x = x;
  swing.y = y;
  swing.dir = dir;
  return dir;
}

export function endSwingGesture(): void {
  swing.pressed = false;
  swing.owner = null;
}

/** The direction the last flick described, or null if the player only tapped. */
export function swingDirection(): AttackDirection | null {
  return swing.dir;
}

// ---------------------------------------------------------------------------
// Handedness
// ---------------------------------------------------------------------------
//
// An external store rather than component state: the touch zones below and the
// HUD's button cluster have to mirror together, and they are read from two
// places that never meet. GameHud subscribes with useSyncExternalStore.

const HAND_KEY = "bretwalda.hand";
let lefty = false;
let handLoaded = false;
const handListeners = new Set<() => void>();

export function subscribeHandedness(onChange: () => void): () => void {
  handListeners.add(onChange);
  if (!handLoaded) {
    handLoaded = true;
    // First read is here rather than at module load so it happens on the
    // client, after hydration, and a locked-down browser only costs us the
    // default rather than the screen.
    try {
      lefty = window.localStorage.getItem(HAND_KEY) === "left";
    } catch { /* private mode: right-handed it is */ }
    if (lefty) for (const l of handListeners) l();
  }
  return () => { handListeners.delete(onChange); };
}

/** Snapshot. A primitive, so React can compare it without a cache. */
export function getHandedness(): boolean {
  return lefty;
}

/** Server snapshot: nothing is stored on the server, and nobody is holding it. */
export function getServerHandedness(): boolean {
  return false;
}

export function setHandedness(next: boolean): void {
  if (next === lefty) return;
  lefty = next;
  handLoaded = true;
  try {
    window.localStorage.setItem(HAND_KEY, next ? "left" : "right");
  } catch { /* the toggle still works for this match */ }
  for (const l of handListeners) l();
}

// ---------------------------------------------------------------------------
// Facing assist
// ---------------------------------------------------------------------------

/**
 * Centre-to-centre distance at which each class's weapon can bite. This mirrors
 * ATTACK_RANGE in engine.mjs — its measured WEAPON_REACH plus BODY_REACH — and
 * the server stays the only authority on whether a blow lands. The copy exists
 * so the assist aims with the same numbers the hit test will use instead of one
 * flat guess: a spear and a seax do not want the same help. Re-measure with it.
 */
const ATTACK_RANGE: Record<WarriorClass, number> = {
  runekeeper: 1.70,
  berserker: 2.20,
  huscarl: 2.26,
  warden: 2.64,
};
const DEFAULT_ATTACK_RANGE = ATTACK_RANGE.huscarl;

/** The assist reaches a little past the tip, because a fight is closing while
 *  the swing winds up and being on line only once he is already inside reach is
 *  being on line too late. */
const ASSIST_RANGE_SCALE = 1.35;
/** "Roughly ahead": about 50° either side. Wider than this and the assist is
 *  answering a question the player did not ask. */
const ASSIST_CONE = 0.9;
/** Ceiling on how fast the assist may turn the camera, rad/s. This is the whole
 *  difference between an assist and a snap — over a windup it closes tens of
 *  degrees, never a fight's worth. */
const ASSIST_MAX_RATE = 2.3;

/**
 * Soft target facing. While a swing is being asked for, the camera leans onto
 * the nearest man the weapon could actually reach, so a thumb that got the
 * direction right does not lose the blow to a few degrees of yaw. It is rate
 * capped, it is off while the player is dragging the camera themselves, and it
 * never turns anyone further than a man who is already roughly in front.
 */
function applyFacingAssist(
  rig: CameraRig,
  players: Record<string, GamePlayer>,
  local: GamePlayer,
  localId: string,
  dt: number,
  isMobile: boolean,
): void {
  // The drag is the player saying where to look. It outranks us, always.
  if (freeLooking) return;

  const range = (ATTACK_RANGE[local.warriorClass] ?? DEFAULT_ATTACK_RANGE) * ASSIST_RANGE_SCALE;
  let best: { angle: number; d: number } | null = null;
  for (const id of Object.keys(players)) {
    if (id === localId) continue;
    const e = players[id];
    if (e.state === "dead") continue;
    const d = Math.hypot(e.position.x - local.position.x, e.position.z - local.position.z);
    if (d > range) continue;
    const angle = Math.atan2(e.position.x - local.position.x, e.position.z - local.position.z);
    if (Math.abs(shortestAngle(rig.yaw, angle)) < ASSIST_CONE && (!best || d < best.d)) best = { angle, d };
  }
  if (!best) return;

  const step = shortestAngle(rig.yaw, best.angle) * Math.min(1, dt * (isMobile ? 8 : 10));
  const cap = ASSIST_MAX_RATE * dt;
  rig.yaw += Math.max(-cap, Math.min(cap, step));
}

export function sampleInput(
  sources: InputSources,
  rig: CameraRig,
  players: Record<string, GamePlayer>,
  localId: string,
  dt: number,
  lastDir: AttackDirection,
): InputSample {
  const { isMobile, keys, joystick, mobile } = sources;
  const tapped = sources.tapped;
  /** Held now, or tapped since the last sample. */
  const hit = (k: string) => keys.has(k) || tapped.has(k);
  const local = players[localId];
  const alive = local && local.state !== "dead";
  const pressedAttack = isMobile ? mobile.attack : sources.mouseDown;
  const heavy = isMobile ? mobile.heavy : hit("e") || hit("v");

  // A heavy is a swing too, and it is the one you least want to miss.
  if ((pressedAttack || heavy) && alive) applyFacingAssist(rig, players, local, localId, dt, isMobile);

  // mx is screen-right positive, mz is BACKWARD positive (W = -1).
  let mx = 0;
  let mz = 0;
  if (isMobile) {
    mx = joystick.x;
    mz = joystick.y;
  } else {
    if (keys.has("w") || keys.has("arrowup")) mz = -1;
    if (keys.has("s") || keys.has("arrowdown")) mz = 1;
    if (keys.has("a") || keys.has("arrowleft")) mx = -1;
    if (keys.has("d") || keys.has("arrowright")) mx = 1;
  }

  // Camera-relative: forward = (sin, cos)·(-mz), screen-right = (-cos, sin)·mx.
  const cos = Math.cos(rig.yaw);
  const sin = Math.sin(rig.yaw);
  const moveX = -mz * sin - mx * cos;
  const moveZ = -mz * cos + mx * sin;

  // Nothing turns the camera here. The stick used to drag the heading round
  // with it so a second finger was never needed, which meant a phone player
  // could not look anywhere he was not already walking, and every swing landed
  // somewhere other than where he aimed. Yaw is the right thumb's, alone.

  let attackDir: AttackDirection = lastDir;
  if (isMobile) {
    // The flick, if there was one; the last direction if the player only
    // tapped. A scheme where the only way to attack is a gesture loses people.
    attackDir = swingDirection() ?? lastDir;
  } else {
    if (keys.has("a") || keys.has("arrowleft")) attackDir = "left";
    else if (keys.has("d") || keys.has("arrowright")) attackDir = "right";
    else if (keys.has("w") || keys.has("arrowup")) attackDir = "overhead";
    else if (keys.has("s") || keys.has("arrowdown")) attackDir = "stab";
  }

  return {
    pressedAttack,
    attackDir,
    message: {
      moveX, moveZ, rotationY: rig.yaw,
      sprint: isMobile ? mobile.sprint : keys.has("shift"),
      attack: pressedAttack,
      heavyAttack: heavy,
      block: isMobile ? mobile.block : sources.rightMouseDown,
      dodge: isMobile ? mobile.dodge : hit(" "),
      crouch: keys.has("control"),
      ability: isMobile ? mobile.ability : hit("q"),
      attackDir,
    },
  };
}

// ---------------------------------------------------------------------------
// Touch controls
// ---------------------------------------------------------------------------

export interface TouchControls {
  /** Live stick vector, read by the frame loop rather than by React. */
  joystick: React.RefObject<{ x: number; y: number; active: boolean }>;
  /** Where the thumb landed, or null — the stick is drawn there. */
  origin: { x: number; y: number } | null;
  /** Knob offset, -1..1 on each axis. State because the knob is DOM. */
  knob: { x: number; y: number; active: boolean };
  onTouchStart(e: React.TouchEvent): void;
  onTouchMove(e: React.TouchEvent): void;
  onTouchEnd(e: React.TouchEvent): void;
}

/** The screen is split down one line: one side is the stick, the other is look.
 *  No gap between them and no dead band, because a thumb that lands in a gap is
 *  a thumb the player thinks is broken. */
const MOVE_SIDE_FRACTION = 0.45;
/** The top of the screen is the status bars and the kill feed. A stick born up
 *  there is a misread, not a thumb. */
const TOP_STRIP = 0.15;
/** How much of a drag reaches the camera while an attack is down. The flick is
 *  naming a direction, and a flick at full look gain spins the man round. Some
 *  gain, not none: aim still has to answer during a combo. */
const SWING_DRAG_LOOK_GAIN = 0.35;

/**
 * A joystick that is born wherever the movement thumb lands, plus free-look on
 * the whole of the other side of the screen. The HUD's buttons carve themselves
 * out of that side for free — a touch that starts on a button belongs to the
 * button and never reaches the canvas — so the drag zone is the exact inverse
 * of the cluster with no gutters around it to be swallowed by.
 *
 * `onCameraDrag` receives horizontal pixels and owns the yaw.
 */
export function useTouchControls(onCameraDrag: (deltaX: number) => void): TouchControls {
  const joystick = useRef({ x: 0, y: 0, active: false });
  // Two fingers, tracked by identifier and never by "the last one we saw".
  // Anything that is not one of these two is somebody's palm.
  const moveTouch = useRef<number | null>(null);
  const lookTouch = useRef<number | null>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const lookX = useRef(0);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });

  const releaseMove = useCallback(() => {
    moveTouch.current = null;
    joystick.current = { x: 0, y: 0, active: false };
    setOrigin(null);
    setKnob({ x: 0, y: 0, active: false });
  }, []);

  const releaseLook = useCallback(() => {
    lookTouch.current = null;
    freeLooking = false;
  }, []);

  // A touch can be taken away without an end event — a system gesture, a call,
  // an app switch — and a stick that is never released walks a man into the
  // fire. Every handler reconciles what we think we are holding against what
  // the browser says is on the glass.
  const reconcile = useCallback((e: React.TouchEvent) => {
    let move = moveTouch.current === null;
    let look = lookTouch.current === null;
    for (let i = 0; i < e.touches.length; i++) {
      const id = e.touches[i].identifier;
      if (id === moveTouch.current) move = true;
      if (id === lookTouch.current) look = true;
    }
    if (!move) releaseMove();
    if (!look) releaseLook();
  }, [releaseMove, releaseLook]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    reconcile(e);
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const onMoveSide = lefty
        ? touch.clientX > w * (1 - MOVE_SIDE_FRACTION)
        : touch.clientX < w * MOVE_SIDE_FRACTION;
      if (onMoveSide) {
        // A second finger on the movement side is ignored rather than allowed
        // to steal the stick: two thumbs on one side is a grip, not a command.
        if (moveTouch.current !== null || touch.clientY < h * TOP_STRIP) continue;
        moveTouch.current = touch.identifier;
        originRef.current = { x: touch.clientX, y: touch.clientY };
        joystick.current = { x: 0, y: 0, active: true };
        setOrigin({ x: touch.clientX, y: touch.clientY });
        setKnob({ x: 0, y: 0, active: true });
      } else {
        // `!== null` and not a truthiness test: touch identifier 0 is a real
        // finger on Android and the falsy check let the next touch steal it.
        if (lookTouch.current !== null) continue;
        lookTouch.current = touch.identifier;
        lookX.current = touch.clientX;
        freeLooking = true;
      }
    }
  }, [reconcile]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    reconcile(e);
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === moveTouch.current) {
        const dx = (touch.clientX - originRef.current.x) / 55;
        const dy = (touch.clientY - originRef.current.y) / 55;
        const len = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(len, 1);
        const nx = (dx / len) * clamped;
        const ny = (dy / len) * clamped;
        joystick.current = { x: nx, y: ny, active: true };
        setKnob({ x: nx, y: ny, active: true });
      } else if (touch.identifier === lookTouch.current) {
        const dx = touch.clientX - lookX.current;
        lookX.current = touch.clientX;
        if (swing.pressed) {
          // An attack is down, so this drag is describing a cut. It still turns
          // the camera, at a fraction of the gain, so aiming keeps working
          // through a combo without a swing throwing the view across the arena.
          trackSwingGesture(touch.identifier, touch.clientX, touch.clientY);
          onCameraDrag(dx * SWING_DRAG_LOOK_GAIN);
        } else {
          onCameraDrag(dx);
        }
      }
    }
  }, [onCameraDrag, reconcile]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === moveTouch.current) releaseMove();
      else if (touch.identifier === lookTouch.current) releaseLook();
    }
    reconcile(e);
  }, [releaseMove, releaseLook, reconcile]);

  useEffect(() => {
    const drop = () => { releaseMove(); releaseLook(); endSwingGesture(); };
    window.addEventListener("touchcancel", drop);
    window.addEventListener("blur", drop);
    return () => {
      window.removeEventListener("touchcancel", drop);
      window.removeEventListener("blur", drop);
    };
  }, [releaseMove, releaseLook]);

  return { joystick, origin, knob, onTouchStart, onTouchMove, onTouchEnd };
}
