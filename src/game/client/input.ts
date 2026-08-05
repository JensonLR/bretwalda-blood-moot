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
import { clearTapped, ensureKeyTracking, isActionDown, isActionHit } from "./bindings";

export interface MobileFlags {
  attack: boolean;
  heavy: boolean;
  block: boolean;
  dodge: boolean;
  ability: boolean;
  sprint: boolean;
  /** One-shot, like dodge: set on the press, cleared once sampled. */
  shove: boolean;
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

// ---------------------------------------------------------------------------
// THE OVERLOADED CHANNEL — fifth sighting
// ---------------------------------------------------------------------------
//
// Name the shape, because it keeps coming back wearing a different hat: **one
// channel carrying two orthogonal intents**. Every time it has appeared here it
// was first diagnosed as a sensitivity problem, and every time smoothing failed
// to fix it, because you cannot smooth two intentions apart.
//
//   1. The left thumb carried movement AND camera heading — walking turned the
//      view, so you could not look anywhere you were not already walking.
//   2. The left thumb carried movement AND swing direction — you could only cut
//      the way you walked.
//   3. `!pressedAttack` made the camera-chase mean one thing with a blow out and
//      another without, so facing snapped between two regimes mid-fight.
//   4. The right thumb carried free-look AND the swipe that names the cut. That
//      one was separated in time rather than space, by the arming window and
//      SWING_DRAG_LOOK_GAIN, and it worked.
//   5. And now: the right thumb carries free-look AND every action button. A
//      player cannot turn and attack at once because both are the same thumb.
//      This is the owner's friends' complaint, verbatim, and it is number five.
//
// Something has to come off the channel. **Aim comes off.** In a melee game the
// camera nearly always wants to point at the man trying to kill you, so the
// game says so instead of making the player say so every second of the fight —
// the For Honor answer, and the owner named that reference himself.
//
//   - Left thumb: move. Strafing and backpedalling now run AROUND the locked
//     man rather than swinging the view off him, which is what makes a duel
//     read as a duel instead of two men shuffling past each other.
//   - Right thumb: buttons only. Attack, heavy, block, dodge, shove.
//   - Bare glass on the button side keeps one job, and it is the only one the
//     lock cannot decide for you: WHICH man. A horizontal flick switches.
//   - Nobody near: free-look drag comes back exactly as before, eased both ways.
//
// IT IS NOT AN AIMBOT, and the line is drawn in one place: the lock obeys the
// same committed-swing turn cap the weight pass put on the body. A blow that is
// out cannot follow a man who rolls behind you, locked or not. That is the
// whole reason For Honor's lock does not delete its own combat design, and
// breaking it here would delete ours.

/** Metres. Past this nobody is worth locking; a man further off is scenery. */
const LOCK_ACQUIRE_RANGE = 11.0;
/**
 * And past THIS the man you are locked to is dropped. The gap between the two
 * is the range hysteresis: a target who backs off a metre does not flicker in
 * and out of the lock, and the camera does not lurch every time he does.
 */
const LOCK_DROP_RANGE = 15.0;
/**
 * How far off the current view a man may be and still be picked up cold, out at
 * LOCK_ACQUIRE_RANGE. Wide — 143° either side — because being jumped from the
 * flank is exactly when a phone player most needs the camera to find the man.
 */
const LOCK_ACQUIRE_CONE = 2.5;
/**
 * And inside this, no cone at all.
 *
 * The harness found this the hard way: the lock's man died, and with two live
 * recruits standing at 1.4 m and a third at 4.1 m the lock came up EMPTY and
 * handed the camera back to free-look — because all three happened to be behind
 * where the dead man had been. A phone player with two men hitting him in the
 * back and no camera is worse off than before lock-on existed.
 *
 * A cone is a statement about relevance, and at arm's length every direction is
 * relevant: a man close enough to hit you IS the fight, whichever way he is
 * standing. So the cone opens to the full circle inside the bubble and closes
 * back to LOCK_ACQUIRE_CONE by the time he is out at acquire range. Turning
 * round is still eased and still rate-capped — the lock never snaps.
 */
const LOCK_CLOSE_RANGE = 3.6;

function acquireCone(d: number): number {
  const k = Math.min(1, Math.max(0, (d - LOCK_CLOSE_RANGE) / (LOCK_ACQUIRE_RANGE - LOCK_CLOSE_RANGE)));
  return Math.PI + (LOCK_ACQUIRE_CONE - Math.PI) * k;
}
/**
 * The weighting, in metres of cost per radian off screen centre. This is the
 * whole of "nearest, weighted by how near centre he already is": a man 6 m
 * dead ahead beats a man 2 m away at 90°, because the one in front of you is
 * the one you are fighting. Raise it and the lock becomes stubborn; drop it and
 * it becomes a proximity alarm.
 */
const LOCK_CENTRE_WEIGHT = 3.2;
/**
 * How much better a challenger has to score before he takes the lock: 28%.
 * This is the hysteresis that keeps the reticle from flicking between two men
 * stood together — which is the failure mode that makes a lock unusable in the
 * 8-man FFA, where three men converging on you can be within a metre of each
 * other and each of them momentarily "nearest".
 */
const LOCK_HYSTERESIS = 0.72;
/**
 * How hard the camera pulls onto the bearing, per second.
 *
 * A spring, so it carries a standing error of roughly (how fast the bearing is
 * moving) / (this). At 7.0 that was fine at four metres and bad at one: the
 * harness measured a man circling at arm's length sitting 34° off the middle of
 * the screen, which is a man you are locked to and cannot see properly — the
 * worst of both schemes. The rate CAP is what keeps the camera honest (and it
 * is untouched); stiffness only decides how much lag is carried under it, so
 * this can be raised without the lock ever becoming a snap.
 */
const LOCK_STIFFNESS = 12.0;
/** Ceiling on the lock's turn rate when the body is free, rad/s. */
const LOCK_MAX_RATE = 5.0;
/**
 * MIRRORS `SWING_TURN_RATE` in engine.mjs, which is the authority. The server
 * slews a committed body toward the asked-for yaw at this rate and no faster,
 * so a swing cannot track a man who dodges. The client copy exists so the
 * CAMERA is capped with the body: without it the view would whip onto a target
 * the warrior's shoulders cannot follow, and the player would watch his own
 * blow miss a man who is dead centre of frame. Change one, change both.
 */
const COMMITTED_TURN_RATE = 1.8;
/** Inside this the lock leaves the yaw alone. A camera that is always making a
 *  small correction reads as drift, and drift is what "erratic" means. */
const LOCK_DEADZONE = 0.02;
/** Ease rates for engaging and releasing. Out is slower than in on purpose: a
 *  man who dies under your reticle should hand the camera back gently. */
const LOCK_BLEND_IN = 4.5;
const LOCK_BLEND_OUT = 2.4;
/** Seconds a switch the player made himself is protected from the automatic
 *  pick. Without it the scoring drags the lock straight back to the nearest
 *  man and the flick reads as broken. */
const LOCK_STICKY_SECONDS = 1.2;
/** Horizontal travel on the button side that counts as a switch. Larger than
 *  the swing SWIPE_PX because this one is measured on bare glass, where a thumb
 *  resting between presses wanders. */
const LOCK_FLICK_PX = 64;

const lock = {
  /** Who the camera is holding, or null. */
  id: null as string | null,
  /** A live target exists and the lock owns the yaw. */
  engaged: false,
  /** 0 free-look, 1 fully locked. Everything the lock does is scaled by it. */
  blend: 0,
  /** Last known position of the target, for the reticle. */
  x: 0,
  z: 0,
  /** Countdown protecting a manual pick. */
  sticky: 0,
  /** Desktop opt-in. Mouse-look is unchanged until the player asks. */
  desktop: false,
  /** Switches the player has made. The tuition line retires after the first. */
  switches: 0,
  /** A flick asked for a new man: -1 screen-left, +1 screen-right, 0 nothing. */
  pending: 0,
  /** Why there is nobody, in words. Diagnostics only — the harness prints it,
   *  because "the lock let go" and "the lock never took hold" are different
   *  bugs and a verdict alone cannot tell them apart. */
  reason: "boot",
};

const lockListeners = new Set<() => void>();
let lockSnap = "|0";

/** Changes rarely — on a new target or a switch — so the HUD can subscribe to
 *  it without re-rendering the interface sixty times a second. */
function publishLock(): void {
  const next = `${lock.id ?? ""}|${lock.switches}`;
  if (next === lockSnap) return;
  lockSnap = next;
  for (const l of lockListeners) l();
}

export function subscribeLock(onChange: () => void): () => void {
  lockListeners.add(onChange);
  return () => { lockListeners.delete(onChange); };
}
export function getLockSnapshot(): string { return lockSnap; }
export function getServerLockSnapshot(): string { return "|0"; }

/** True while a live man is held. The touch handler asks before deciding
 *  whether bare glass is a camera drag or a target switch. */
export function lockEngaged(): boolean { return lock.engaged; }

/** What the reticle should be drawn on, or null. Read by render/camera.ts,
 *  which owns the projection because it owns the camera. */
export function lockView(): { id: string; x: number; z: number; blend: number } | null {
  return lock.id ? { id: lock.id, x: lock.x, z: lock.z, blend: lock.blend } : null;
}

/**
 * The reticle's DOM node, handed over by the HUD. The camera writes its
 * transform directly rather than through React: this moves every frame, and a
 * frame-rate re-render of the interface is how a 120 Hz phone becomes a 40 Hz
 * one. Information about the lock still reaches React through `subscribeLock`,
 * which only fires when the man changes.
 */
let reticleEl: HTMLElement | null = null;
export function setLockReticle(el: HTMLElement | null): void { reticleEl = el; }
export function lockReticle(): HTMLElement | null { return reticleEl; }

/** A flick on the button side asking for the next man that way. Recorded, not
 *  acted on: the handler has a pixel delta and no idea where anybody is. */
export function requestTargetSwitch(dir: -1 | 1): void { lock.pending = dir; }

function distTo(a: GamePlayer, b: GamePlayer): number {
  return Math.hypot(b.position.x - a.position.x, b.position.z - a.position.z);
}
function bearingTo(a: GamePlayer, b: GamePlayer): number {
  return Math.atan2(b.position.x - a.position.x, b.position.z - a.position.z);
}

/** Lower is better: metres, plus a toll for being off the middle of the screen. */
function lockScore(yaw: number, local: GamePlayer, e: GamePlayer): number {
  return distTo(local, e) + Math.abs(shortestAngle(yaw, bearingTo(local, e))) * LOCK_CENTRE_WEIGHT;
}

function liveEnemies(players: Record<string, GamePlayer>, localId: string): string[] {
  const out: string[] = [];
  for (const id of Object.keys(players)) {
    if (id === localId) continue;
    if (players[id].state === "dead") continue;
    out.push(id);
  }
  return out;
}

/**
 * Take the next man in the direction the thumb flicked.
 *
 * "Direction on the screen" is a sign, and it is worth being explicit about
 * which: the camera looks down (sin yaw, cos yaw) and screen-right is
 * (-cos yaw, sin yaw), so a man to the RIGHT of frame has a NEGATIVE
 * `shortestAngle` from the camera. Candidates are ordered by their angle
 * relative to the man currently held, and the flick takes the nearest one on
 * that side — wrapping to the far end if there is nobody, so a flick always
 * lands on somebody rather than reading as a dead control.
 */
function applySwitch(
  players: Record<string, GamePlayer>, local: GamePlayer, localId: string,
): void {
  const dir = lock.pending;
  lock.pending = 0;
  if (!dir || !lock.id) return;
  const held = players[lock.id];
  if (!held) return;
  const from = bearingTo(local, held);

  let take: string | null = null;
  let takeRel = 0;
  let wrap: string | null = null;
  let wrapRel = 0;
  for (const id of liveEnemies(players, localId)) {
    if (id === lock.id) continue;
    // ACQUIRE range, not DROP range. A flick that could hand the lock a man at
    // 14 m hands it a man who is dropped again the moment he takes two steps
    // back — and with the camera now pointing his way, the man you were
    // actually fighting can be outside the acquire cone, so the lock comes up
    // empty and free-look returns mid-duel. The harness caught exactly that:
    // "held bot_f3e6…, flicked, now holding nobody". Everything a flick can
    // take is something the lock would have taken cold, with the 4 m between
    // the two ranges left over as hysteresis.
    if (distTo(local, players[id]) > LOCK_ACQUIRE_RANGE) continue;
    const rel = shortestAngle(from, bearingTo(local, players[id]));
    // Rightward flick wants rel < 0, leftward wants rel > 0.
    const onSide = dir > 0 ? rel < -0.05 : rel > 0.05;
    if (onSide) {
      // Nearest on that side is the one with the smallest magnitude.
      if (!take || Math.abs(rel) < Math.abs(takeRel)) { take = id; takeRel = rel; }
    } else if (!wrap || Math.abs(rel) > Math.abs(wrapRel)) {
      // Furthest the other way, for the wrap.
      wrap = id; wrapRel = rel;
    }
  }
  const next = take ?? wrap;
  if (!next) return;
  lock.id = next;
  lock.sticky = LOCK_STICKY_SECONDS;
  lock.switches++;
}

/**
 * Who the camera holds this frame.
 *
 * Three men converging is the case this is written for, not the duel. What
 * happens: whoever is nearest the middle of the screen and nearest you takes
 * the lock, and then KEEPS it until somebody else is 28% better — so two men
 * shoulder to shoulder do not trade the reticle between them at frame rate. A
 * man who dies, or who backs outside LOCK_DROP_RANGE, releases it immediately
 * and the next best is taken on the same frame; a pick the player made with a
 * flick outranks the scoring for LOCK_STICKY_SECONDS, so the lock never argues
 * with a decision he just made.
 */
function pickTarget(yaw: number, players: Record<string, GamePlayer>, local: GamePlayer, localId: string): void {
  const held = lock.id ? players[lock.id] : null;
  const keeps = held && held.state !== "dead" && distTo(local, held) <= LOCK_DROP_RANGE;
  if (!keeps && lock.id) {
    lock.reason = !held ? "the man left the fight"
      : held.state === "dead" ? "the man died"
        : "the man went outside drop range";
    lock.id = null;
    lock.sticky = 0;
  }

  applySwitch(players, local, localId);
  if (lock.id && lock.sticky > 0) return;

  let best: string | null = null;
  let bestScore = Infinity;
  let inRange = 0;
  for (const id of liveEnemies(players, localId)) {
    const e = players[id];
    const d = distTo(local, e);
    if (d > (id === lock.id ? LOCK_DROP_RANGE : LOCK_ACQUIRE_RANGE)) continue;
    inRange++;
    if (id !== lock.id && Math.abs(shortestAngle(yaw, bearingTo(local, e))) > acquireCone(d)) continue;
    const s = lockScore(yaw, local, e);
    if (s < bestScore) { bestScore = s; best = id; }
  }
  if (!lock.id) {
    lock.id = best;
    if (best) lock.reason = "held";
    else lock.reason = inRange ? `${inRange} in range, none inside the acquire cone` : "no live enemy in range";
    return;
  }
  if (!best || best === lock.id) return;
  if (bestScore < lockScore(yaw, local, players[lock.id]) * LOCK_HYSTERESIS) lock.id = best;
}

/**
 * The lock, applied to the one number that is the camera, the movement basis
 * and the yaw the server is told about all at once.
 *
 * Returns true while the lock owns the yaw, which is what tells the touch
 * handler that bare glass is for switching rather than for looking.
 */
function updateLock(
  rig: CameraRig,
  players: Record<string, GamePlayer>,
  local: GamePlayer | undefined,
  localId: string,
  dt: number,
  enabled: boolean,
): void {
  lock.sticky = Math.max(0, lock.sticky - dt);
  if (!enabled || !local || local.state === "dead") {
    lock.id = null;
    lock.pending = 0;
    lock.reason = !enabled ? "lock-on is off" : "the warrior is down";
  } else {
    pickTarget(rig.yaw, players, local, localId);
  }

  const target = lock.id && local ? players[lock.id] : null;
  lock.engaged = !!target;
  const want = target ? 1 : 0;
  // Eased both ways and never snapped: the handover between lock and free-look
  // is the moment a player is most likely to say the camera "did something".
  lock.blend += (want - lock.blend) * Math.min(1, dt * (want > lock.blend ? LOCK_BLEND_IN : LOCK_BLEND_OUT));
  publishLock();
  if (!target || !local || lock.blend < 0.002) return;

  lock.x = target.position.x;
  lock.z = target.position.z;
  const off = shortestAngle(rig.yaw, bearingTo(local, target));
  if (Math.abs(off) < LOCK_DEADZONE) return;

  // THE LINE BETWEEN AN ASSIST AND AN AIMBOT. A body with a blow out turns at
  // COMMITTED_TURN_RATE and no faster — the server enforces it on its own fixed
  // step and is the authority — so the camera is held to the same rate here.
  // Strafe hard around a man at arm's length and the bearing to him moves at
  // three radians a second; the lock will ask for all of it and get 1.8.
  const committed = local.state === "attacking" || local.state === "shoving";
  const cap = (committed ? COMMITTED_TURN_RATE : LOCK_MAX_RATE) * dt;
  const step = off * Math.min(1, dt * LOCK_STIFFNESS) * lock.blend;
  rig.yaw += Math.max(-cap, Math.min(cap, step));
}

// A readback for tools/touchtest.mjs, the same shape of hook render/camera.ts
// already hangs on the window. Nothing in the game reads it, and every
// behavioural assertion in the harness is still taken off the game socket —
// this only answers "which man", which the wire does not carry.
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__bretwaldaLock = {
    get target() { return lock.id; },
    get engaged() { return lock.engaged; },
    get blend() { return lock.blend; },
    get switches() { return lock.switches; },
    get desktop() { return lock.desktop; },
    get reason() { return lock.reason; },
  };
}

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
  // And so does the lock, which is already pointing at the man this would lean
  // toward — two owners of the same yaw is how the assist used to fight itself.
  if (lock.engaged) return;

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
  const { isMobile, joystick, mobile } = sources;
  // Desktop intent is read from the binding table (see ./bindings and
  // docs/KEYBINDS.md), which is keyed on `event.code` — the physical position,
  // the same key on AZERTY, Dvorak and QWERTY — rather than on the character
  // produced. The tracker lives in that module because `sources.keys` carries
  // characters, and a movement cluster wants positions.
  ensureKeyTracking();
  const mouse = { left: sources.mouseDown, right: sources.rightMouseDown };
  /** Bound key held now, or the mouse button the caller reports. */
  const down = (a: Parameters<typeof isActionDown>[0]) => isActionDown(a, mouse);
  /** Held now, or tapped since the last sample. */
  const hit = (a: Parameters<typeof isActionHit>[0]) => isActionHit(a, mouse);
  const local = players[localId];
  const alive = local && local.state !== "dead";
  const pressedAttack = isMobile ? mobile.attack : down("attack");
  const heavy = isMobile ? mobile.heavy : hit("heavy");

  // Soft lock-on. On by default on a phone, where the alternative is asking one
  // thumb to look and press five buttons; off by default on desktop, where
  // mouse-look already separates the two — the bound key turns it on for anyone
  // who wants it, and that binding rides the profile like every other.
  if (!isMobile && hit("lockon")) lock.desktop = !lock.desktop;
  updateLock(rig, players, local, localId, dt, isMobile || lock.desktop);

  // A heavy is a swing too, and it is the one you least want to miss.
  if ((pressedAttack || heavy) && alive) applyFacingAssist(rig, players, local, localId, dt, isMobile);

  // mx is screen-right positive, mz is BACKWARD positive (W = -1).
  let mx = 0;
  let mz = 0;
  if (isMobile) {
    mx = joystick.x;
    mz = joystick.y;
  } else {
    if (down("forward")) mz = -1;
    if (down("back")) mz = 1;
    if (down("left")) mx = -1;
    if (down("right")) mx = 1;
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
    if (down("left")) attackDir = "left";
    else if (down("right")) attackDir = "right";
    else if (down("forward")) attackDir = "overhead";
    else if (down("back")) attackDir = "stab";
  }

  const sample: InputSample = {
    pressedAttack,
    attackDir,
    message: {
      moveX, moveZ, rotationY: rig.yaw,
      sprint: isMobile ? mobile.sprint : down("sprint"),
      attack: pressedAttack,
      heavyAttack: heavy,
      block: isMobile ? mobile.block : down("block"),
      dodge: isMobile ? mobile.dodge : hit("dodge"),
      crouch: down("crouch"),
      ability: isMobile ? mobile.ability : hit("ability"),
      shove: isMobile ? mobile.shove : hit("shove"),
      attackDir,
    },
  };

  // The latch exists to survive one poll gap, not to stick. The caller clears
  // its own character-keyed set; this one is ours.
  clearTapped();
  return sample;
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
  /** Horizontal travel banked toward a target switch. Reset on every press and
   *  on every switch, so two flicks in a row are two switches. */
  const switchTravel = useRef(0);
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
    switchTravel.current = 0;
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
        switchTravel.current = 0;
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
          // Capped by the same rule the lock is: with a blow out, the view may
          // not leave the body behind.
          onCameraDrag(dx * SWING_DRAG_LOOK_GAIN);
        } else if (lockEngaged()) {
          // BUTTONS ONLY, and this is what is left for bare glass: the one
          // decision the lock cannot make. Travel is banked rather than
          // thresholded per event, so a slow drag switches too — a control that
          // silently does nothing is the complaint this whole scheme answers,
          // and "flick harder" is not a thing a player can be told mid-fight.
          switchTravel.current += dx;
          if (Math.abs(switchTravel.current) >= LOCK_FLICK_PX) {
            requestTargetSwitch(switchTravel.current > 0 ? 1 : -1);
            switchTravel.current = 0;
          }
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
