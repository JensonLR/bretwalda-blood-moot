"use client";
// The screen-space HUD. Everything here is DOM, not WebGL: it is React state
// rendered over the canvas, and it stays out of the renderer so a frame budget
// never has to argue with a layout pass.
//
// These elements must remain siblings of the canvas — photo mode hides the
// interface with `.photo-clean canvas ~ *`, which only sees siblings.
import React from "react";
import { Swords, Hammer, Shield, Wind, Sparkles, Zap } from "lucide-react";
import type { GamePlayer } from "../types";
import { WARRIOR_STATS } from "../types";
import type { MobileFlags } from "./input";

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

export default function GameHud({
  playerId, roomState, glError, isMobile, pointerLocked, mobileFlags, setFlag, joyOrigin, joystickPos,
}: GameHudProps) {
  const localPlayer = roomState?.players[playerId];
  const isAlive = localPlayer && localPlayer.state !== "dead";
  const isFighting = roomState?.state === "fighting" || roomState?.state === "last_stand";
  const hpPct = localPlayer ? Math.max(0, localPlayer.health / localPlayer.maxHealth) : 1;

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

          {/* Ability cooldown */}
          <div className="absolute bottom-28 sm:bottom-6 left-3 pointer-events-none z-10">
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

    {/* Mobile controls — arc cluster built for one thumb */}
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

        {/* big primary SLASH - hold for relentless combo swings */}
        <button
          className={`absolute right-4 bottom-10 z-20 w-[84px] h-[84px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${
            localPlayer.stamina >= 13 ? (mobileFlags.current.attack ? "bg-red-500 border-amber-300 scale-95" : "bg-red-700/95 active:bg-red-500 border-red-300/80") : "bg-stone-600/60 border-stone-500/40 opacity-70"
          }`}
          onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); setFlag("attack", true); }}
          onTouchEnd={(e) => { e.stopPropagation(); setFlag("attack", false); }}>
          <Swords size={28} /><span className="text-[10px] font-bold tracking-wider">{mobileFlags.current.attack ? "SLYING" : "SLASH"}</span>
        </button>

        {/* HEAVY */}
        <button
          className={`absolute right-[112px] bottom-8 z-20 w-[68px] h-[68px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${
            localPlayer.stamina >= 22 ? "bg-orange-700/95 active:bg-orange-500 border-orange-300/80" : "bg-stone-600/60 border-stone-500/40 opacity-70"
          }`}
          onTouchStart={(e) => { e.stopPropagation(); setFlag("heavy", true); }}>
          <Hammer size={22} /><span className="text-[9px] font-bold">HEAVY</span>
        </button>

        {/* BLOCK (hold) */}
        <button
          className="absolute right-4 bottom-[128px] z-20 w-[64px] h-[64px] rounded-full bg-sky-800/95 active:bg-sky-500 text-white border-[3px] border-sky-300/80 flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50"
          onTouchStart={(e) => { e.stopPropagation(); setFlag("block", true); }}
          onTouchEnd={() => { setFlag("block", false); }}>
          <Shield size={20} /><span className="text-[9px] font-bold">BLOCK</span>
        </button>

        {/* DODGE */}
        <button
          className={`absolute right-[100px] bottom-[130px] z-20 w-[60px] h-[60px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${
            localPlayer.stamina >= 20 ? "bg-emerald-700/95 active:bg-emerald-500 border-emerald-300/80" : "bg-stone-600/60 border-stone-500/40 opacity-70"
          }`}
          onTouchStart={(e) => { e.stopPropagation(); setFlag("dodge", true); }}>
          <Wind size={19} /><span className="text-[9px] font-bold">DODGE</span>
        </button>

        {/* POWER */}
        <button
          className={`absolute right-[56px] bottom-[212px] z-20 w-[60px] h-[60px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${
            localPlayer.abilityCooldown <= 0 ? "bg-violet-700/95 active:bg-violet-500 border-violet-300/80" : "bg-stone-600/60 border-stone-500/40 opacity-70"
          }`}
          onTouchStart={(e) => { e.stopPropagation(); if (localPlayer.abilityCooldown <= 0) setFlag("ability", true); }}>
          <Sparkles size={20} /><span className="text-[8px] font-bold">
            {localPlayer.abilityCooldown > 0 ? `${Math.ceil(localPlayer.abilityCooldown)}s` : "POWER"}
          </span>
        </button>

        {/* RUN toggle (left side, near joystick) */}
        <button
          className={`absolute left-4 bottom-6 z-20 w-[56px] h-[56px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${mobileFlags.current.sprint ? "bg-amber-500/95 border-amber-200" : "bg-stone-700/95 border-stone-400/70"}`}
          onTouchStart={(e) => { e.stopPropagation(); setFlag("sprint", !mobileFlags.current.sprint); }}>
          <Zap size={18} /><span className="text-[9px] font-bold">{mobileFlags.current.sprint ? "ON" : "RUN"}</span>
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
