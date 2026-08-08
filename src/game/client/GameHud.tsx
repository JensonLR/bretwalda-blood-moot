"use client";
// The screen-space HUD. Everything here is DOM, not WebGL: it is React state
// rendered over the canvas, and it stays out of the renderer so a frame budget
// never has to argue with a layout pass.
//
// These elements must remain siblings of the canvas — photo mode hides the
// interface with `.photo-clean canvas ~ *`, which only sees siblings.
//
// The mobile cluster is half of the touch scheme in docs/MOBILE-CONTROLS.md;
// input.ts is the other half. It is here and not there because a touch belongs
// to the element it started on for its whole life: a thumb that lands on the
// SLASH button and flicks left is delivered to this button, never to the
// canvas, so the flick that aims the cut has to be read here. The two halves
// meet at the swing gesture that input.ts owns.
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Swords, Hammer, Shield, Wind, Sparkles, Zap, KeyRound, RotateCcw, X, Plus, Hand } from "lucide-react";
import type { AttackDirection, GamePlayer } from "../types";
import { WARRIOR_STATS } from "../types";
import {
  beginSwingGesture, endSwingGesture, trackSwingGesture,
  getHandedness, getServerHandedness, setHandedness, subscribeHandedness,
  getLockSnapshot, getServerLockSnapshot, setLockFootMark, setLockReticle, subscribeLock,
  type MobileFlags,
} from "./input";
import {
  ACTIONS, MAX_BINDINGS_PER_ACTION, RESERVED_CODES,
  getBindings, getServerBindings, subscribeBindings,
  rebind, unbind, resetBindings, resetAction,
  captureBinding, labelForCode, loadKeyboardLayout,
  type ActionId, type BindingCode,
} from "./bindings";

interface HudRoomState {
  state: string;
  players: Record<string, GamePlayer>;
  countdown: number;
  matchTimer: number;
  killFeed: Array<{ killerName: string; victimName: string; timestamp: number }>;
  lastStandTriggered: boolean;
}

interface GameHudProps {
  playerId: string;
  roomState: HudRoomState | null;
  glError: string | null;
  isMobile: React.RefObject<boolean>;
  /**
   * GameCanvas's own copy of the lock, kept for the frame loop's use. The HUD
   * no longer reads it: a ref cannot re-render, so anything drawn from it was
   * only ever as fresh as the last packet that happened to arrive, and the
   * KEYS control has to change the instant Escape is pressed. See `locked`
   * below, which is the same fact as state.
   */
  pointerLocked: React.RefObject<boolean>;
  /** Read for button labels; never written — writes go through setFlag. */
  mobileFlags: React.RefObject<MobileFlags>;
  setFlag: (flag: keyof MobileFlags, value: boolean) => void;
  joyOrigin: { x: number; y: number } | null;
  joystickPos: { x: number; y: number; active: boolean };
}

/**
 * How long a blow waits for the flick that aims it. The cost is real — a player
 * who only ever taps pays it on every swing — and it buys the whole feature:
 * the server locks the direction in at the instant the swing starts, so a
 * gesture read even one tick late aims the swing after this one. Short enough
 * to sit inside the 50 ms server tick, and a flick that clears the threshold
 * early fires immediately without waiting it out.
 */
const SWIPE_ARM_MS = 90;
/** A tap released inside the arming window still has to be held long enough for
 *  the 60 Hz sampler to see it at all. */
const MIN_ATTACK_MS = 70;

const DIR_LABEL: Record<AttackDirection, string> = {
  left: "◀ LEFT",
  right: "RIGHT ▶",
  overhead: "▲ OVER",
  stab: "▼ STAB",
};

/**
 * A button that both fires and aims. It is one gesture with two readings: the
 * thumb goes down, and either it flicks — in which case the flick names the cut
 * and the blow goes out the moment it reads — or it does not, in which case the
 * arming window expires and the blow goes out anyway in the last direction.
 *
 * `hold` separates the two callers. SLASH is held for a combo and has to be
 * released; HEAVY is a one-shot the sampler consumes.
 */
function useSwingButton(
  flag: "attack" | "heavy",
  hold: boolean,
  setFlag: (f: keyof MobileFlags, v: boolean) => void,
  onCommit: (dir: AttackDirection) => void,
) {
  // The identifier of the finger that owns this button. A second finger landing
  // on the same button is ignored rather than allowed to end the first one's
  // press — that is how a held combo used to die to a knuckle.
  const touchId = useRef<number | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const fire = useCallback(() => {
    if (armTimer.current !== null) { clearTimeout(armTimer.current); armTimer.current = null; }
    if (fired.current) return;
    fired.current = true;
    setFlag(flag, true);
  }, [flag, setFlag]);

  // No preventDefault: React registers touchstart passively, so it would only
  // warn. The buttons carry `touch-action: none` instead, which is what stops
  // the browser reading a flick as a scroll and eating the gesture.
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (touchId.current !== null) return;
    const t = e.changedTouches[0];
    touchId.current = t.identifier;
    fired.current = false;
    // A tap still in the air from the last press must not put this one down.
    if (releaseTimer.current !== null) { clearTimeout(releaseTimer.current); releaseTimer.current = null; }
    if (hold) setFlag(flag, false);
    beginSwingGesture(t.identifier, t.clientX, t.clientY);
    armTimer.current = setTimeout(fire, SWIPE_ARM_MS);
  }, [fire, flag, hold, setFlag]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== touchId.current) continue;
      const dir = trackSwingGesture(t.identifier, t.clientX, t.clientY);
      if (dir) { onCommit(dir); fire(); }
    }
  }, [fire, onCommit]);

  // Released if this event names our finger, or if the finger is simply no
  // longer on the glass. The second half is not paranoia: a stuck attack button
  // swings forever, and it is the one failure a player cannot work around.
  const released = useCallback((e: React.TouchEvent) => {
    if (touchId.current === null) return false;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId.current) return true;
    }
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === touchId.current) return false;
    }
    return true;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (!released(e)) return;
    touchId.current = null;
    if (armTimer.current !== null) { clearTimeout(armTimer.current); armTimer.current = null; }
    endSwingGesture();
    if (!fired.current) {
      // Lifted inside the arming window. A fast tap is still an attack.
      fired.current = true;
      setFlag(flag, true);
      if (hold) releaseTimer.current = setTimeout(() => setFlag(flag, false), MIN_ATTACK_MS);
    } else if (hold) {
      setFlag(flag, false);
    }
  }, [flag, hold, released, setFlag]);

  // A cancelled touch is the system taking the gesture away — a call, a swipe
  // from the edge. It ends the press and does not swing.
  const onTouchCancel = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    if (!released(e)) return;
    touchId.current = null;
    if (armTimer.current !== null) { clearTimeout(armTimer.current); armTimer.current = null; }
    endSwingGesture();
    if (hold && fired.current) setFlag(flag, false);
    fired.current = false;
  }, [flag, hold, released, setFlag]);

  // Forget everything, timers included. A blow armed 90ms ago must not land on
  // a man who is no longer holding the button — or no longer alive.
  const reset = useCallback(() => {
    touchId.current = null;
    if (armTimer.current !== null) { clearTimeout(armTimer.current); armTimer.current = null; }
    if (releaseTimer.current !== null) { clearTimeout(releaseTimer.current); releaseTimer.current = null; }
    fired.current = false;
    setFlag(flag, false);
  }, [flag, setFlag]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, reset };
}

/**
 * The key bindings screen. Lives here rather than in the menu tree because the
 * moment a player wants to rebind is mid-fight — a key did not do what he
 * expected — so the same panel has to open over the HUD and off the menu, and
 * two copies of it would drift.
 *
 * It reads the table through `useSyncExternalStore`, so every cap on it is the
 * live binding rather than a literal, and it holds the three things
 * docs/KEYBINDS.md says it is worse than useless without: conflicts named and
 * offered rather than silently double-bound, reserved keys refused with the
 * reason, and a reset that is always on screen.
 */
export function KeyBindingsPanel({ onClose }: { onClose: () => void }) {
  const bindings = useSyncExternalStore(subscribeBindings, getBindings, getServerBindings);
  // Which cap is listening. `slot` names the cap being replaced; absent means
  // an alternate is being added.
  const [capture, setCapture] = useState<{ action: ActionId; slot?: number } | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  // A key already spoken for. Held rather than taken, so the player is the one
  // who decides to move it.
  const [clash, setClash] = useState<{ action: ActionId; slot?: number; code: BindingCode; message: string } | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  // W is Z on an AZERTY board and the caps must say so. Resolving re-labels
  // through the same listener list the table uses.
  useEffect(() => { void loadKeyboardLayout(); }, []);
  // A capture left listening after the panel closes eats the next keystroke of
  // the fight.
  useEffect(() => () => { cancelRef.current?.(); cancelRef.current = null; }, []);

  const stopCapture = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setCapture(null);
  }, []);

  const begin = useCallback((action: ActionId, slot?: number) => {
    cancelRef.current?.();
    setRefused(null);
    setClash(null);
    setCapture({ action, slot });
    cancelRef.current = captureBinding((code) => {
      cancelRef.current = null;
      setCapture(null);
      // Escape is reserved, and what it is reserved *for* is closing this.
      if (code === "Escape") { setRefused(`${RESERVED_CODES.Escape} Nothing was changed.`); return; }
      const r = rebind(action, code, { slot });
      if (r.ok) return;
      if (r.reason === "conflict") { setClash({ action, slot, code, message: r.message }); return; }
      setRefused(r.message);
    });
  }, []);

  const take = useCallback(() => {
    if (!clash) return;
    const r = rebind(clash.action, clash.code, { slot: clash.slot, force: true });
    setClash(null);
    if (!r.ok) setRefused(r.message);
  }, [clash]);

  const label = (id: ActionId) => ACTIONS.find((a) => a.id === id)?.label ?? id;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-label="Key bindings">
      <div className="card card-noble card-glow flex max-h-[92vh] w-full max-w-lg flex-col gap-3 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="label-overline">SETTINGS</div>
            <div className="font-display text-xl tracking-wider text-amber-100 sm:text-2xl">KEY BINDINGS</div>
          </div>
          <button onClick={() => { stopCapture(); onClose(); }} aria-label="Close key bindings"
            className="shrink-0 rounded-lg border border-stone-600/70 p-2 text-stone-300 transition hover:border-amber-600/70 hover:text-amber-200">
            <X size={16} />
          </button>
        </div>
        <div className="knot-band w-full" />
        <p className="text-[11px] leading-relaxed text-stone-400">
          Click a key to change it. Bindings are by physical position, so the cap shown is what is
          printed on <em>your</em> keyboard.
        </p>

        {capture && (
          <div className="animate-fadeIn rounded-lg border border-amber-500/70 bg-amber-950/70 px-3 py-2.5 text-center">
            <div className="font-display text-sm tracking-[0.2em] text-amber-200">PRESS A KEY</div>
            <div className="mt-0.5 text-[11px] text-amber-100/80">
              for {label(capture.action)} — or a mouse button. Escape cancels.
            </div>
            <button onClick={stopCapture} className="btn-ghost mt-2 !min-h-[2.25rem] !px-4 !text-[11px]">CANCEL</button>
          </div>
        )}

        {refused && !capture && (
          <div className="animate-fadeIn rounded-lg border border-red-700/70 bg-red-950/60 px-3 py-2.5 text-[11px] leading-relaxed text-red-200">
            <span className="font-bold">That key is spoken for. </span>{refused}
          </div>
        )}

        {clash && (
          <div className="animate-fadeIn rounded-lg border border-amber-600/70 bg-stone-900/90 px-3 py-2.5">
            <div className="text-[12px] leading-relaxed text-amber-100">
              <span className="kbd !min-w-0 !px-1.5 !py-0.5">{labelForCode(clash.code)}</span>{" "}
              {clash.message} Take it for {label(clash.action)}?
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={take} className="btn-primary !min-h-[2.5rem] flex-1 !px-3 !text-[11px]">TAKE THE KEY</button>
              <button onClick={() => setClash(null)} className="btn-ghost !min-h-[2.5rem] flex-1 !px-3 !text-[11px]">LEAVE IT</button>
            </div>
          </div>
        )}

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {ACTIONS.map((a) => {
            const codes = bindings[a.id];
            const capturing = capture?.action === a.id;
            return (
              <div key={a.id} className="flex flex-col gap-2 border-b border-stone-100/10 py-3 last:border-0 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] font-bold text-amber-200">
                    {a.label}
                    {a.desktopOnly && <span className="rounded border border-stone-600/70 px-1 py-px text-[8px] font-bold tracking-[0.12em] text-stone-400">DESKTOP</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-snug text-stone-400">
                    {a.hint}{a.alsoAims ? " — also aims the cut" : ""}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {codes.length === 0 && (
                    <span className="text-[11px] italic text-red-300/80">Unbound</span>
                  )}
                  {codes.map((code, slot) => (
                    <span key={code + slot} className="inline-flex items-center">
                      <button onClick={() => begin(a.id, slot)}
                        aria-label={`Change ${a.label} key ${slot + 1}`}
                        className={`kbd !rounded-r-none transition hover:!border-amber-400/80 hover:!text-amber-100 ${capturing && capture?.slot === slot ? "!border-amber-400 !text-amber-100" : ""}`}>
                        {labelForCode(code)}
                      </button>
                      <button onClick={() => unbind(a.id, code)} aria-label={`Unbind ${labelForCode(code)} from ${a.label}`}
                        className="kbd !min-w-0 !rounded-l-none !border-l-0 !px-1.5 text-stone-400 transition hover:!text-red-300">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  {codes.length < MAX_BINDINGS_PER_ACTION && (
                    <button onClick={() => begin(a.id)} aria-label={`Add another key for ${a.label}`}
                      className="kbd !min-w-0 !px-2 text-stone-400 transition hover:!border-amber-400/80 hover:!text-amber-200">
                      <Plus size={11} />
                    </button>
                  )}
                  <button onClick={() => resetAction(a.id)} aria-label={`Reset ${a.label} to default`}
                    className="rounded-md p-1.5 text-stone-500 transition hover:text-amber-300">
                    <RotateCcw size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Always on screen, never behind a scroll: a player who has bound
            movement somewhere he cannot reach has this or clearing site data. */}
        <div className="flex flex-col gap-2 border-t border-amber-900/40 pt-3 sm:flex-row">
          <button onClick={() => { stopCapture(); setRefused(null); setClash(null); resetBindings(); }}
            className="btn-ghost !min-h-[3rem] flex-1 !border-amber-600/60 !text-[12px] !text-amber-200">
            <RotateCcw size={14} /> RESET ALL TO DEFAULTS
          </button>
          <button onClick={() => { stopCapture(); onClose(); }} className="btn-primary !min-h-[3rem] flex-1 !text-[12px]">
            DONE
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GameHud({
  playerId, roomState, glError, isMobile, mobileFlags, setFlag, joyOrigin, joystickPos,
}: GameHudProps) {
  const localPlayer = roomState?.players[playerId];
  const isAlive = localPlayer && localPlayer.state !== "dead";
  const isFighting = roomState?.state === "fighting" || roomState?.state === "last_stand";
  const hpPct = localPlayer ? Math.max(0, localPlayer.health / localPlayer.maxHealth) : 1;

  // Which way round the thumbs go. Stored, and shared with input.ts so the
  // touch zones and the buttons mirror as one thing.
  const lefty = useSyncExternalStore(subscribeHandedness, getHandedness, getServerHandedness);

  // "<target id>|<switches>". It changes when the lock takes a different man,
  // which is a handful of times a fight — not per frame. The reticle's POSITION
  // never comes through here: render/camera.ts writes that onto the element's
  // transform directly, because that does move every frame.
  const lockSnap = useSyncExternalStore(subscribeLock, getLockSnapshot, getServerLockSnapshot);
  const lockedOn = lockSnap.split("|")[0] !== "";
  const hasSwitched = lockSnap.split("|")[1] !== "0";

  // What a tap would cut with right now. It is feedback, not state the sim
  // reads — input.ts holds the direction itself — but a player needs to be able
  // to see what his last flick armed without swinging to find out.
  const [armed, setArmed] = useState<AttackDirection>("right");
  const [taught, setTaught] = useState(false);
  // Rebinding mid-fight, which is when anyone wants it.
  const [keysOpen, setKeysOpen] = useState(false);
  // POINTER LOCK, AS RENDER STATE AND NOT ONLY AS A REF.
  //
  // The KEYS button used to call `document.exitPointerLock()` from its onClick,
  // which reads like the fix and is unreachable code: while the pointer is
  // locked there is NO CURSOR to put on the button, and the click lands on the
  // canvas as a swing. So the button did nothing, the player had to already
  // know to press Escape first, and nothing on screen said so — the same family
  // as the crouch key that was dead on every Mac: a control that appears to
  // exist and does not.
  //
  // It cannot honestly be made one press. Re-entering pointer lock needs a user
  // gesture, leaving it is Escape, and Escape belongs to the browser — the page
  // is not consulted. What the button CAN do is state its own precondition and
  // stop presenting itself as pressable while it is not. That needs the lock to
  // be state the HUD renders from, not a ref it happens to read on somebody
  // else's re-render.
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const sync = () => setLocked(document.pointerLockElement !== null);
    sync();
    document.addEventListener("pointerlockchange", sync);
    return () => { document.removeEventListener("pointerlockchange", sync); };
  }, []);
  const onCommit = useCallback((dir: AttackDirection) => {
    setArmed(dir);
    setTaught(true);
  }, []);

  const slash = useSwingButton("attack", true, setFlag, onCommit);
  const heavy = useSwingButton("heavy", false, setFlag, onCommit);

  // A man who dies mid-hold takes the buttons out of the tree with him, and a
  // button that is not there never gets its touchend: the flag it set would
  // stay set and he would come back next round swinging at nothing. Whenever
  // the cluster is not on screen, nothing it owns is held.
  const clusterUp = Boolean(isMobile.current && isFighting && isAlive && localPlayer);
  const resetSlash = slash.reset;
  const resetHeavy = heavy.reset;
  useEffect(() => {
    if (clusterUp) return;
    resetSlash();
    resetHeavy();
    setFlag("block", false);
    endSwingGesture();
  }, [clusterUp, resetSlash, resetHeavy, setFlag]);

  // The action cluster sits under the aiming thumb; the stick and the odds and
  // ends sit under the other one. Positions are inline rather than in classes
  // because the whole point is that the side is decided at runtime.
  const near = (edge: number, bottom: number): React.CSSProperties =>
    lefty ? { left: edge, bottom, touchAction: "none" } : { right: edge, bottom, touchAction: "none" };
  const far = (edge: number, bottom: number): React.CSSProperties =>
    lefty ? { right: edge, bottom, touchAction: "none" } : { left: edge, bottom, touchAction: "none" };

  return (
    <>
      {/* WebGL error overlay */}
      {glError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-stone-950/95 p-6">
          <div className="max-w-xs text-center">
            <div className="font-display text-amber-400 text-xl mb-2 tracking-wider">GRAPHICS INTERRUPTED</div>
            <p className="text-stone-300 text-sm leading-relaxed">{glError}</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-5 py-2.5 bg-amber-800 hover:bg-amber-700 rounded-lg font-bold text-sm tracking-wider">
              RELOAD BATTLE
            </button>
          </div>
        </div>
      )}

      {/* The damage flash and the low-health closing-in used to be a red div
          here. They are grade inputs now (postfx.hurt / setPressure) so they
          land before the filmic curve and read as the frame going wrong rather
          than as an interface element pasted over it. */}

      {isFighting && localPlayer && (
        <>
          {/* THE LOCK, ON THE FRAME.

              A camera that holds a man looks exactly like a player who happens
              to be pointing that way, so the lock is never left to the camera
              alone. But this mark is on the glass every second of every fight,
              which makes it the most-seen thing in the game — and the man it
              points at is what the player is actually trying to read. The first
              cut was a 56px amber gunsight with four ticks, two chevrons and a
              glow, and it won the frame off the fight. It says the same thing
              now in a fifth of the ink:

                · TWO HAIRLINE JAWS at his sternum — who.
                · A SCRIBED OVAL on the ground — where he stands.

              Every stroke is drawn twice, a dark one under a bone one, because
              the alternative on daylight turf is a glow, and a glow is how a UI
              mark starts competing with the lighting. Both halves are placed and
              faded by render/camera.ts straight onto these nodes every frame —
              React only decides that they exist, and the mark holds STILL unless
              the lock has changed hands. pointer-events stays none so neither
              ever stands in front of the free-look half or a button. */}
          <div
            ref={setLockReticle}
            aria-hidden
            data-lock-reticle=""
            className="absolute left-0 top-0 z-10 pointer-events-none"
            style={{ opacity: 0, willChange: "transform, opacity" }}>
            <svg width="34" height="34" viewBox="-17 -17 34 34" className="block overflow-visible">
              {/* Both jaws in one path, twice over: the shadow pass first, wider
                  by a stroke, then the ink over it.

                  They are FILLED CRESCENTS, not stroked arcs — thickest at the
                  middle and tapering to a point at each end, the way a mark
                  scribed with a blade thins as it leaves the metal. A uniform
                  stroke reads as a browser border; this reads as something made.
                  Each jaw is two quadratics: out along the back at r=14.0, home
                  along the belly at r=12.4, meeting at r=13.2 at ±38°.

                  A capture set the numbers. The first cut was 54° of arc in bone
                  at 0.72 over a 3px shadow at 0.45, and on the man it was a pair
                  of faint ticks you had to be told were there — quiet is the
                  brief, invisible is a bug. 76° of arc reads as a ring held open
                  rather than as two marks, and it still puts a fifth of the ink
                  on the glass that the old gunsight did. */}
              {[
                { grow: 2.0, c: "rgba(10,7,4,0.55)" },
                { grow: 0, c: "rgba(240,229,203,0.94)" },
              ].map((p, i) => (
                <path key={i}
                  d="M 10.40 -8.13 Q 17.60 0 10.40 8.13 Q 14.40 0 10.40 -8.13 Z
                     M -10.40 -8.13 Q -17.60 0 -10.40 8.13 Q -14.40 0 -10.40 -8.13 Z"
                  fill={p.c} stroke={p.grow ? p.c : "none"} strokeWidth={p.grow}
                  strokeLinejoin="round" />
              ))}
            </svg>
          </div>

          {/* The ground he is standing on, marked separately because it has its
              own anchor in the world — his feet — and a mark hung off the jaws
              at a fixed offset walks up his shins the moment the distance scale
              clamps. Flattened to roughly what a ring on the ground looks like
              from a camera this low, so it reads as ground rather than as a
              badge floating at his ankles. */}
          <div
            ref={setLockFootMark}
            aria-hidden
            data-lock-foot=""
            className="absolute left-0 top-0 z-10 pointer-events-none"
            style={{ opacity: 0, willChange: "transform, opacity" }}>
            <svg width="46" height="14" viewBox="-23 -7 46 14" className="block overflow-visible">
              {[
                { w: 3.0, c: "rgba(10,7,4,0.52)" },
                { w: 1.25, c: "rgba(240,229,203,0.68)" },
              ].map((p, i) => (
                <ellipse key={i} cx="0" cy="0" rx="19" ry="3.8"
                  fill="none" stroke={p.c} strokeWidth={p.w} />
              ))}
            </svg>
          </div>

          {/* Discoverability for the switch, and it retires the moment the
              player uses it. It sat at the top of the screen first, which the
              layout harness passed and a capture did not: the kill feed is five
              rows deep up there and had this line through the middle of it.
              Stacked over the other tuition line instead, in the half of the
              screen the harness measures for overlaps — so the next person to
              move it gets told. */}
          {isMobile.current && lockedOn && !hasSwitched && (
            <div className="absolute bottom-[318px] left-1/2 z-10 -translate-x-1/2 pointer-events-none animate-fadeIn">
              <div className="whitespace-nowrap rounded-md bg-black/50 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-amber-100/85"
                style={{ textShadow: "0 1px 4px black" }}>
                ◀ FLICK THE GLASS TO CHANGE FOE ▶
              </div>
            </div>
          )}

          {/* Status HUD */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none z-10 w-[52vw] max-w-72">
            <div className="text-amber-100/95 text-[11px] font-bold tracking-[0.2em] font-display" style={{ textShadow: "0 1px 5px black" }}>{localPlayer.name}</div>
            <div className="w-full h-3.5 bg-black/70 rounded-md border border-amber-900/70 overflow-hidden shadow-lg">
              <div className="h-full transition-all duration-200"
                style={{
                  width: `${hpPct * 100}%`,
                  background: hpPct > 0.5 ? "linear-gradient(90deg,#2fa245,#5ee06b)" :
                    hpPct > 0.25 ? "linear-gradient(90deg,#c99a22,#f0d048)" : "linear-gradient(90deg,#a12117,#ff4a3a)",
                }} />
            </div>
            <div className="w-full h-1.5 bg-black/70 rounded-md border border-sky-950/70 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-400 to-sky-300 transition-all duration-200"
                style={{ width: `${Math.max(0, (localPlayer.stamina / localPlayer.maxStamina) * 100)}%` }} />
            </div>
          </div>

          {/* Kill feed. THE WHOLE TOP ROW MIRRORS, not just the thumb cluster.
              END and the mute toggle live under the timer on the MOVEMENT side
              (page.tsx) so they never sit in the free-look half — which means
              that on a left-handed phone they cross to the right, straight
              through five rows of kill feed. A capture caught it: "Leofric the
              Young slew Wulfre—" with the END button parked on the rest of it.
              The layout harness did not, because it measures overlaps in the
              button half and this is the other half. So the feed and the timer
              swap sides with everything else and each keeps the clearance it
              was drawn with. */}
          <div className={`absolute top-3 ${lefty ? "left-3" : "right-3"} flex flex-col gap-1 pointer-events-none z-10`}>
            {roomState.killFeed.slice(-5).map((k, i) => (
              <div key={i} className="text-[10px] sm:text-xs bg-black/55 backdrop-blur-sm px-2.5 py-1 rounded-md text-white border-l-2 border-red-700/80 animate-fadeIn">
                <span className="text-amber-300 font-bold">{k.killerName}</span>
                <span className="text-stone-400"> slew </span>
                <span className="text-red-300 font-bold">{k.victimName}</span>
              </div>
            ))}
          </div>

          {/* Timer + alive — the other half of the same mirror. END and mute
              stack underneath this, so it has to be on the side they are. */}
          <div className={`absolute top-3 ${lefty ? "right-3 items-end" : "left-3 items-start"} flex flex-col pointer-events-none z-10`}>
            <div className="text-amber-100 text-sm font-mono bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-md">
              {Math.floor((roomState?.matchTimer ?? 0) / 60)}:{String(Math.floor((roomState?.matchTimer ?? 0) % 60)).padStart(2, "0")}
            </div>
            <div className="text-[10px] text-amber-200/90 mt-1 tracking-[0.2em] font-bold">
              {Object.values(roomState.players).filter(p => p.state !== "dead").length} ALIVE
            </div>
          </div>

          {/* Ability cooldown. It follows the mirror on a phone: left-handed, the
              action cluster is where this used to sit — and on a phone it is
              lifted clear of the RUN/HAND pair below it, which used to be drawn
              straight over the top of the cooldown readout. */}
          <div className="absolute bottom-28 sm:bottom-6 pointer-events-none z-10"
            style={isMobile.current
              ? { bottom: 152, ...(lefty ? { right: 12 } : { left: 12 }) }
              : { left: 12 }}>
            <div className="bg-black/55 backdrop-blur-sm px-3 py-1.5 rounded-md border border-purple-900/60">
              <div className="text-[9px] text-purple-300 tracking-[0.15em] font-bold">{WARRIOR_STATS[localPlayer.warriorClass].ability}</div>
              <div className="text-amber-300 font-bold text-sm">
                {localPlayer.abilityCooldown > 0 ? `${Math.ceil(localPlayer.abilityCooldown)}s` : "READY"}
              </div>
            </div>
          </div>

          {roomState.lastStandTriggered && (
            <div className="absolute top-[22%] left-1/2 -translate-x-1/2 pointer-events-none z-10 animate-pulse">
              <div className="font-display text-3xl sm:text-5xl font-bold text-red-500 tracking-[0.35em] text-center"
                style={{ textShadow: "0 0 40px rgba(255,40,20,0.8), 0 2px 6px black" }}>
                LAST STAND
              </div>
            </div>
          )}

          {localPlayer.state === "dead" && (
            <div className="absolute inset-0 bg-gradient-to-t from-red-950/50 via-transparent to-transparent flex items-end justify-center pb-24 pointer-events-none z-10">
              <div className="text-center">
                <div className="font-display text-4xl font-bold text-red-400 mb-1 tracking-[0.2em]" style={{ textShadow: "0 0 25px black" }}>FALLEN</div>
                <div className="text-sm text-stone-300">Spectating the survivors...</div>
              </div>
            </div>
          )}
      </>
    )}

    {roomState?.state === "countdown" && (
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
        <div className="font-display text-8xl font-bold text-amber-300 animate-pulse"
          style={{ textShadow: "0 0 50px rgba(255,180,60,0.8), 0 4px 10px black" }}>
          {roomState.countdown > 0 ? roomState.countdown : "FIGHT!"}
        </div>
        <div className="text-amber-200/70 text-xs tracking-[0.4em] mt-2 font-display">TO ARMS</div>
      </div>
    )}

    {/* Mobile controls. One thumb moves, the other aims and cuts; the cluster
        mirrors for a left-handed player. Everything here carves itself out of
        the free-look zone by existing — a touch that starts on a button is
        delivered to the button and the canvas never hears about it — so there
        are no gutters to leave around them. */}
    {isMobile.current && isFighting && isAlive && localPlayer && (
      <>
        {joyOrigin && (
          <div className="absolute pointer-events-none z-10"
            style={{ left: joyOrigin.x - 46, top: joyOrigin.y - 46 }}>
            <div className="w-[92px] h-[92px] rounded-full border-2 border-white/30 bg-black/35 backdrop-blur-sm relative shadow-lg shadow-black/40">
              <div className="absolute w-11 h-11 rounded-full bg-amber-100/80 shadow-md"
                style={{ left: `${50 + joystickPos.x * 32}%`, top: `${50 + joystickPos.y * 32}%`, transform: "translate(-50%,-50%)" }} />
            </div>
          </div>
        )}

        {/* Sits above the cluster rather than under it. At the foot of the
            screen it was drawn behind the HEAVY button — the one instruction a
            new player gets, with a button through the middle of it — and
            wrapped onto two lines to do it. */}
        {!taught && (
          <div className="absolute bottom-[288px] left-1/2 -translate-x-1/2 pointer-events-none z-10 text-center">
            <div className="text-[10px] tracking-[0.18em] font-bold text-amber-100/85 bg-black/45 px-2.5 py-1 rounded-md whitespace-nowrap"
              style={{ textShadow: "0 1px 4px black" }}>
              FLICK THE SLASH TO AIM THE CUT
            </div>
          </div>
        )}

        {/* big primary SLASH — hold for relentless combo swings, flick to aim */}
        <button
          style={near(16, 40)}
          className={`absolute z-20 w-[84px] h-[84px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${
            localPlayer.stamina >= 13 ? (mobileFlags.current.attack ? "bg-red-500 border-amber-300 scale-95" : "bg-red-700/95 active:bg-red-500 border-red-300/80") : "bg-stone-600/60 border-stone-500/40 opacity-70"
          }`}
          aria-label="Slash"
          onTouchStart={slash.onTouchStart}
          onTouchMove={slash.onTouchMove}
          onTouchEnd={slash.onTouchEnd}
          onTouchCancel={slash.onTouchCancel}>
          <Swords size={26} /><span className="text-[10px] font-bold tracking-wider">{DIR_LABEL[armed]}</span>
        </button>

        {/* HEAVY */}
        <button
          style={near(112, 32)}
          className={`absolute z-20 w-[68px] h-[68px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${
            localPlayer.stamina >= 22 ? "bg-orange-700/95 active:bg-orange-500 border-orange-300/80" : "bg-stone-600/60 border-stone-500/40 opacity-70"
          }`}
          aria-label="Heavy attack"
          onTouchStart={heavy.onTouchStart}
          onTouchMove={heavy.onTouchMove}
          onTouchEnd={heavy.onTouchEnd}
          onTouchCancel={heavy.onTouchCancel}>
          <Hammer size={22} /><span className="text-[9px] font-bold">HEAVY</span>
        </button>

        {/* BLOCK (hold) */}
        <button
          style={near(16, 128)}
          className="absolute z-20 w-[64px] h-[64px] rounded-full bg-sky-800/95 active:bg-sky-500 text-white border-[3px] border-sky-300/80 flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50"
          aria-label="Block"
          onTouchStart={(e) => { e.stopPropagation(); setFlag("block", true); }}
          onTouchEnd={() => { setFlag("block", false); }}
          onTouchCancel={() => { setFlag("block", false); }}>
          <Shield size={20} /><span className="text-[9px] font-bold">BLOCK</span>
        </button>

        {/* DODGE */}
        <button
          style={near(100, 130)}
          className={`absolute z-20 w-[60px] h-[60px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${
            localPlayer.stamina >= 20 ? "bg-emerald-700/95 active:bg-emerald-500 border-emerald-300/80" : "bg-stone-600/60 border-stone-500/40 opacity-70"
          }`}
          aria-label="Dodge"
          onTouchStart={(e) => { e.stopPropagation(); setFlag("dodge", true); }}>
          <Wind size={19} /><span className="text-[9px] font-bold">DODGE</span>
        </button>

        {/* SHOVE — one-shot, like DODGE. Beats a raised shield; a dodge beats
            it; by the bonfire it is a kill. Sits outboard of DODGE where the
            aiming thumb already lives, clear of every other footprint. */}
        <button
          style={near(124, 200)}
          className={`absolute z-20 w-[56px] h-[56px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${
            localPlayer.stamina >= 25 ? "bg-amber-800/95 active:bg-amber-600 border-amber-300/80" : "bg-stone-600/60 border-stone-500/40 opacity-70"
          }`}
          aria-label="Shove"
          onTouchStart={(e) => { e.stopPropagation(); setFlag("shove", true); }}>
          <Hand size={18} /><span className="text-[9px] font-bold">SHOVE</span>
        </button>

        {/* POWER */}
        <button
          style={near(56, 212)}
          className={`absolute z-20 w-[60px] h-[60px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${
            localPlayer.abilityCooldown <= 0 ? "bg-violet-700/95 active:bg-violet-500 border-violet-300/80" : "bg-stone-600/60 border-stone-500/40 opacity-70"
          }`}
          aria-label="Power"
          onTouchStart={(e) => { e.stopPropagation(); if (localPlayer.abilityCooldown <= 0) setFlag("ability", true); }}>
          <Sparkles size={20} /><span className="text-[8px] font-bold">
            {localPlayer.abilityCooldown > 0 ? `${Math.ceil(localPlayer.abilityCooldown)}s` : "POWER"}
          </span>
        </button>

        {/* RUN toggle, on the moving thumb's side */}
        <button
          style={far(16, 24)}
          className={`absolute z-20 w-[56px] h-[56px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${mobileFlags.current.sprint ? "bg-amber-500/95 border-amber-200" : "bg-stone-700/95 border-stone-400/70"}`}
          aria-label="Run"
          onTouchStart={(e) => { e.stopPropagation(); setFlag("sprint", !mobileFlags.current.sprint); }}>
          <Zap size={18} /><span className="text-[9px] font-bold">{mobileFlags.current.sprint ? "ON" : "RUN"}</span>
        </button>

        {/* Handedness. Cheap here and expensive later, and a left-handed player
            who has to aim with the hand holding the phone is not playing. */}
        <button
          style={far(16, 92)}
          className="absolute z-20 w-[48px] h-[48px] rounded-full bg-stone-800/90 active:bg-stone-600 text-amber-100 border-2 border-amber-700/60 flex flex-col items-center justify-center shadow-lg shadow-black/50"
          aria-label={lefty ? "Switch to right-handed controls" : "Switch to left-handed controls"}
          onTouchStart={(e) => { e.stopPropagation(); setHandedness(!lefty); }}>
          <span className="text-[7px] tracking-[0.15em] text-amber-200/70">HAND</span>
          <span className="text-[13px] font-bold leading-none">{lefty ? "L" : "R"}</span>
        </button>
      </>
    )}

    {!isMobile.current && isFighting && !locked && !keysOpen && (
      <div className="absolute inset-0 flex items-center justify-center bg-black/45 z-10 pointer-events-none">
        <div className="text-white text-lg bg-black/70 px-7 py-3.5 rounded-lg border border-amber-900/60 tracking-wide font-display">
          CLICK TO TAKE UP YOUR WEAPON
        </div>
      </div>
    )}

    {/* Bindings, from inside the fight. Desktop only — the touch scheme has no
        keys to remap and its own handedness button already.

        Two faces, because the control has two truths. With the cursor captured
        it is not a button at all — nothing can point at it — so it says what to
        press instead and takes itself out of the pointer's way and out of the
        tab order. With the cursor free it is a live button, and it is lit in
        gilt so a player who has just pressed Escape can see where he was sent. */}
    {!isMobile.current && isFighting && (locked ? (
      <div
        role="note"
        aria-label="Key bindings: press Escape to free the cursor, then click KEYS"
        className="pointer-events-none absolute bottom-3 right-3 z-30 flex items-center gap-1.5 rounded-lg border border-stone-700/70 bg-stone-950/70 px-3 py-2 text-[11px] font-bold tracking-[0.15em] text-stone-500 backdrop-blur">
        <KeyRound size={13} />
        <span className="rounded border border-stone-600 px-1 py-px text-[9px] leading-none text-stone-300">ESC</span>
        <span>FOR KEYS</span>
      </div>
    ) : (
      <button
        onClick={() => { document.exitPointerLock?.(); setKeysOpen(true); }}
        aria-label="Key bindings"
        className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5 rounded-lg border border-amber-700/70 bg-stone-900/85 px-3 py-2 text-[11px] font-bold tracking-[0.15em] text-amber-200 backdrop-blur transition hover:border-amber-500 hover:text-amber-100">
        <KeyRound size={13} /> KEYS
      </button>
    ))}

    {keysOpen && <KeyBindingsPanel onClose={() => setKeysOpen(false)} />}
    </>
  );
}
