// Player intent → the message the server expects.
//
// The shape of that message is the multiplayer contract with
// src/game/engine.mjs and is frozen: the server is authoritative, and every
// field name and sign convention here has a counterpart in its simulation.
// Feel free to change how intent is gathered; do not change what comes out.

import React, { useCallback, useRef, useState } from "react";
import type { AttackDirection, GamePlayer } from "../types";
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

/**
 * Soft lock-on. While a swing is being asked for, the camera slides onto the
 * nearest enemy inside a forward cone so facing an opponent is automatic —
 * this is what makes the fight playable with a thumb.
 */
function applyAttackMagnetism(
  rig: CameraRig,
  players: Record<string, GamePlayer>,
  local: GamePlayer,
  localId: string,
  dt: number,
  isMobile: boolean,
): void {
  let best: { angle: number; d: number } | null = null;
  for (const id of Object.keys(players)) {
    if (id === localId) continue;
    const e = players[id];
    if (e.state === "dead") continue;
    const angle = Math.atan2(e.position.x - local.position.x, e.position.z - local.position.z);
    const d = Math.hypot(e.position.x - local.position.x, e.position.z - local.position.z);
    if (d > 5.5) continue;
    if (Math.abs(shortestAngle(rig.yaw, angle)) < 1.0 && (!best || d < best.d)) best = { angle, d };
  }
  if (best) rig.yaw += shortestAngle(rig.yaw, best.angle) * Math.min(1, dt * (isMobile ? 14 : 10));
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

  if (pressedAttack && alive) applyAttackMagnetism(rig, players, local, localId, dt, isMobile);

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

  // On a phone the left thumb moves AND steers, so the camera chases the
  // movement heading — a second finger is never needed to turn.
  if (isMobile && alive && !pressedAttack && (Math.abs(mx) > 0.08 || Math.abs(mz) > 0.08)) {
    rig.yaw += shortestAngle(rig.yaw, Math.atan2(moveX, moveZ)) * Math.min(1, dt * 4.5);
  }

  // Swing direction follows movement intent rather than a separate binding.
  let attackDir: AttackDirection = lastDir;
  if (isMobile) {
    if (joystick.x < -0.5) attackDir = "left";
    else if (joystick.x > 0.5) attackDir = "right";
    else if (joystick.y < -0.5) attackDir = "overhead";
    else if (joystick.y > 0.5) attackDir = "stab";
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
      heavyAttack: isMobile ? mobile.heavy : hit("e") || hit("v"),
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

/**
 * A joystick that is born wherever the left thumb lands, plus a right-hand drag
 * zone for the camera. Fixed sticks lose fights on a phone; this one cannot be
 * missed. `onCameraDrag` receives horizontal pixels and owns the yaw.
 */
export function useTouchControls(onCameraDrag: (deltaX: number) => void): TouchControls {
  const joystick = useRef({ x: 0, y: 0, active: false });
  const touchId = useRef<number | null>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const drag = useRef<{ id: number | null; lastX: number }>({ id: null, lastX: 0 });
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX < window.innerWidth * 0.42 && touch.clientY > window.innerHeight * 0.25 && touch.clientY < window.innerHeight * 0.95) {
        touchId.current = touch.identifier;
        originRef.current = { x: touch.clientX, y: touch.clientY };
        joystick.current = { x: 0, y: 0, active: true };
        setOrigin({ x: touch.clientX, y: touch.clientY });
        setKnob({ x: 0, y: 0, active: true });
      } else if (!drag.current.id && touch.clientX > window.innerWidth * 0.55 && touch.clientY < window.innerHeight * 0.62) {
        drag.current = { id: touch.identifier, lastX: touch.clientX };
      }
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchId.current) {
        const dx = (touch.clientX - originRef.current.x) / 55;
        const dy = (touch.clientY - originRef.current.y) / 55;
        const len = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(len, 1);
        const nx = (dx / len) * clamped;
        const ny = (dy / len) * clamped;
        joystick.current = { x: nx, y: ny, active: true };
        setKnob({ x: nx, y: ny, active: true });
      }
      if (touch.identifier === drag.current.id) {
        onCameraDrag(touch.clientX - drag.current.lastX);
        drag.current.lastX = touch.clientX;
      }
    }
  }, [onCameraDrag]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchId.current) {
        touchId.current = null;
        joystick.current = { x: 0, y: 0, active: false };
        setOrigin(null);
        setKnob({ x: 0, y: 0, active: false });
      }
      if (touch.identifier === drag.current.id) drag.current = { id: null, lastX: 0 };
    }
  }, []);

  return { joystick, origin, knob, onTouchStart, onTouchMove, onTouchEnd };
}
