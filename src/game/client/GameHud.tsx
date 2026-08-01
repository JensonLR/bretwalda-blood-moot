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
import { Swords, Hammer, Shield, Wind, Sparkles, Zap } from "lucide-react";
import type { AttackDirection, GamePlayer } from "../types";
import { WARRIOR_STATS } from "../types";
import {
  beginSwingGesture, endSwingGesture, trackSwingGesture,
  getHandedness, getServerHandedness, setHandedness, subscribeHandedness,
  type MobileFlags,
} from "./input";

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

export default function GameHud({
  playerId, roomState, glError, isMobile, pointerLocked, mobileFlags, setFlag, joyOrigin, joystickPos,
}: GameHudProps) {
  const localPlayer = roomState?.players[playerId];
  const isAlive = localPlayer && localPlayer.state !== "dead";
  const isFighting = roomState?.state === "fighting" || roomState?.state === "last_stand";
  const hpPct = localPlayer ? Math.max(0, localPlayer.health / localPlayer.maxHealth) : 1;

  // Which way round the thumbs go. Stored, and shared with input.ts so the
  // touch zones and the buttons mirror as one thing.
  const lefty = useSyncExternalStore(subscribeHandedness, getHandedness, getServerHandedness);

  // What a tap would cut with right now. It is feedback, not state the sim
  // reads — input.ts holds the direction itself — but a player needs to be able
  // to see what his last flick armed without swinging to find out.
  const [armed, setArmed] = useState<AttackDirection>("right");
  const [taught, setTaught] = useState(false);
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

          {/* Kill feed */}
          <div className="absolute top-3 right-3 flex flex-col gap-1 pointer-events-none z-10">
            {roomState.killFeed.slice(-5).map((k, i) => (
              <div key={i} className="text-[10px] sm:text-xs bg-black/55 backdrop-blur-sm px-2.5 py-1 rounded-md text-white border-l-2 border-red-700/80 animate-fadeIn">
                <span className="text-amber-300 font-bold">{k.killerName}</span>
                <span className="text-stone-400"> slew </span>
                <span className="text-red-300 font-bold">{k.victimName}</span>
              </div>
            ))}
          </div>

          {/* Timer + alive */}
          <div className="absolute top-3 left-3 pointer-events-none z-10">
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

    {!isMobile.current && isFighting && !pointerLocked.current && (
      <div className="absolute inset-0 flex items-center justify-center bg-black/45 z-10 pointer-events-none">
        <div className="text-white text-lg bg-black/70 px-7 py-3.5 rounded-lg border border-amber-900/60 tracking-wide font-display">
          CLICK TO TAKE UP YOUR WEAPON
        </div>
      </div>
    )}
    </>
  );
}
