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
import { Swords, Hammer, Shield, Wind, Sparkles, Zap, KeyRound, RotateCcw, X, Plus, Hand, Gauge, Check } from "lucide-react";
import type { AttackDirection, GamePlayer, WeaponDrop } from "../types";
// Types only — erased at compile time. The values come through `loadQualityApi`
// below, and the comment there is the whole reason this line says `type`.
import type { QualityChoice, QualityStatus, QualityTier } from "./render/quality";
import { ARMS_LORE, TAKE, WARRIOR_STATS, RIPOSTE, EXECUTION } from "../types";
import {
  beginSwingGesture, endSwingGesture, trackSwingGesture,
  getHandedness, getServerHandedness, setHandedness, subscribeHandedness,
  getLockSnapshot, getServerLockSnapshot, setLockFootMark, setLockReticle, subscribeLock,
  getFeel, getServerFeel, setFeel, subscribeFeel,
  type MobileFlags,
} from "./input";
import { createTuitionHint, browserStore, FOE_HINT, FOE_HINT_KEY } from "@/game/tuition.mjs";
import { createFirstMoot, FIRST_MOOT_KEY } from "@/game/firstmoot.mjs";
import { useFightRail, railStyle, publishReadoutBottom } from "./fightRail";
import {
  ACTIONS, MAX_BINDINGS_PER_ACTION, RESERVED_CODES,
  getBindings, getServerBindings, subscribeBindings, bindingsFor,
  rebind, unbind, resetBindings, resetAction,
  captureBinding, labelForCode, loadKeyboardLayout,
  type ActionId, type BindingCode,
} from "./bindings";

/**
 * Where the QUALITY pad hangs, in CSS pixels from the top of the screen.
 *
 * It is the next rung of the utility column `src/app/page.tsx` starts: the
 * timer sits at 12 and is 47 tall, the solo END button at 76 (`top-3 mt-16`),
 * the sound toggle at 124 (`top-3 mt-[7rem]`) and is 44 tall. 172 is four pixels
 * under the sound toggle, which is the gap that column already uses between END
 * and sound — so this reads as the fourth thing in one stack rather than as a
 * fourth thing near a stack.
 *
 * A NUMBER AND NOT A TAILWIND CLASS because the side it hangs off is decided at
 * runtime by handedness, exactly as `near`/`far` are; and it is measured from
 * the TOP because the column is, and a bottom offset picked on an 844 px screen
 * lands off the top edge of a 667 px one.
 */
const GFX_TOP = 172;
// ^ kept as the record of where this rung hangs on a tall screen, and now read
// FROM `fightRail.ts` rather than applied from here: on a landscape phone the
// column folds and 172 is 44 px below the ability readout. See that file.


interface HudRoomState {
  /** The weapons on the floor (TAKE). */
  drops?: WeaponDrop[];
  state: string;
  /** "solo" gates the First Moot's beat line — taught lines belong in a
   *  private ring, never over a live opponent. */
  mode?: string;
  players: Record<string, GamePlayer>;
  countdown: number;
  matchTimer: number;
  killFeed: Array<{ killerName: string; victimName: string; timestamp: number; cause?: string }>;
  lastStandTriggered: boolean;
  /** The Burh's standing wave (7.4). 0 or absent everywhere else. */
  wave?: number;
  /** THE MEAD-BENCH (7.9b): who watches. This player is seated exactly when
   *  his id is here and not in `players`. */
  seats?: Array<{ id: string; name: string }>;
  /** The Tournament Moot's tree (7.3); null outside a tournament. Read here
   *  only to tell a waiting duellist from a knocked-out one. */
  bracket?: Array<Array<{ a: string | null; b: string | null; winner: string | null; done: boolean }>> | null;
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
  /** The rite left MOVE (learned or skipped): the staged foe may walk in. */
  onMootFoe?: () => void;
  /** Sent once when the First Moot reaches the phase a blow may arrive in. */
  onMootArm?: () => void;
  /** THE RITE'S PAUSE: true while a phase's card is up and the foe is armed,
   *  false when the card is taken down — the client relays it as `hold_bots`
   *  (owner, 3 Sep 2026: "physically pause so the player isn't being attacked"). */
  onMootHold?: (hold: boolean) => void;
  /** The rite is over — take him to the war room, which is the second half of
   *  the owner's one flow: "learn the fight, then choose your kingdom". */
  onMootDone?: () => void;
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

/**
 * The chain multiplier as the player reads it — the engine's own curve
 * (`engine.mjs`: min(1 + comboCount * 0.15, 1.6)), trimmed of trailing
 * zeroes. Edit the mechanic, edit this, same commit.
 */
function comboLabel(count: number): string {
  return String(Math.round(Math.min(1 + count * 0.15, 1.6) * 100) / 100);
}

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
            className="shrink-0 rounded-lg border border-stone-600/70 p-2 text-[#d9cdb2] transition hover:border-amber-600/70 hover:text-amber-200">
            <X size={16} />
          </button>
        </div>
        <div className="knot-band w-full" />
        <p className="text-[11px] leading-relaxed text-[#a89a7c]">
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
                    {a.desktopOnly && <span className="rounded border border-stone-600/70 px-1 py-px text-[8px] font-bold tracking-[0.12em] text-[#a89a7c]">DESKTOP</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-snug text-[#a89a7c]">
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
                        className="kbd !min-w-0 !rounded-l-none !border-l-0 !px-1.5 text-[#a89a7c] transition hover:!text-red-300">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  {codes.length < MAX_BINDINGS_PER_ACTION && (
                    <button onClick={() => begin(a.id)} aria-label={`Add another key for ${a.label}`}
                      className="kbd !min-w-0 !px-2 text-[#a89a7c] transition hover:!border-amber-400/80 hover:!text-amber-200">
                      <Plus size={11} />
                    </button>
                  )}
                  <button onClick={() => resetAction(a.id)} aria-label={`Reset ${a.label} to default`}
                    className="rounded-md p-1.5 text-[#7d7057] transition hover:text-amber-300">
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

// ---------------------------------------------------------------------------
// GRAPHICS — the release valve on quality.ts, and a blocking control rather
// than a nicety.
//
// quality.ts can DEMOTE a device on measured frame time and persist that
// verdict across loads. Round one shipped that governor with the escape hatch
// written, documented and called by nothing: repo-wide, `setQualityPreference`
// appeared only in tools/tiertest.mjs and in build output. So a device demoted
// on one hot afternoon had exactly one way back — clear site data — and a
// harness row certifying "choosing Automatic clears a stale demotion" was green
// on a path the shipped app could not reach.
//
// One panel for both platforms, because the owner has twice asked that an
// upgrade be for mobile AND desktop, and because a phone is where this matters
// most: it is the device the governor is likeliest to act on and the device
// whose player has no `?quality=` to type. It opens from inside a fight on
// both — a gear on the movement thumb's side of a phone, a button beside KEYS
// on a desktop — because "change your graphics" is a thing a player wants at
// the moment the fight looks wrong, not at the moment he next sees a menu.
// ---------------------------------------------------------------------------

/**
 * quality.ts is loaded ON DEMAND and never at import time, and that is a bundle
 * decision rather than a taste: page.tsx `dynamic()`-imports `KeyBindingsPanel`
 * out of THIS FILE to put key bindings on the MENU screens, and quality.ts
 * imports three. A static import here would therefore hang the entire renderer
 * off the landing page's settings dialog, on a phone, to draw four buttons.
 *
 * Inside a fight — the only place this panel opens from — three is already
 * loaded, so the import resolves out of the module registry in the same tick.
 * Same registry entry, too, which is the load-bearing half: QUALITY_GOVERNOR is
 * a singleton and `chooseQuality` has to reach the LIVE one, not a second copy.
 */
type QualityApi = typeof import("./render/quality");
let qualityApi: QualityApi | null = null;
function loadQualityApi(): Promise<QualityApi> {
  return qualityApi
    ? Promise.resolve(qualityApi)
    : import("./render/quality").then((m) => (qualityApi = m));
}

/** What each tier costs, in the words of the thing a player would notice. */
const QUALITY_BLURB: Record<QualityChoice, string> = {
  high: "Everything on. Full-size shadows, depth of field, every torch a real light.",
  medium: "Desktop sharpness with fewer pixels in it, a softer shadow, no depth of field.",
  low: "For a phone that is struggling. Also drops the roughness, metal and ambient-occlusion maps off every surface — the largest single step down in the game.",
  auto: "Measure this device and decide. Clears anything measured before.",
};

const TIER_WORD: Record<QualityTier, string> = { high: "High", medium: "Balanced", low: "Fast" };

export function GraphicsPanel({ onClose }: { onClose: () => void }) {
  const [api, setApi] = useState<QualityApi | null>(qualityApi);
  const [status, setStatus] = useState<QualityStatus | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  // The feel store (8.9), the handedness idiom: identity is the version.
  const feelNow = useSyncExternalStore(subscribeFeel, getFeel, getServerFeel);

  // KEEP THE CHOSEN ROW ON SCREEN, and this is a capture finding rather than a
  // precaution. "Automatic" is last in QUALITY_CHOICES and it is also the row
  // that undoes a demotion — so on a 1280x800 window the first shot of this
  // panel had the release valve sliced in half by the DONE button, and choosing
  // it pushed what was left behind the "Kept" block. Nothing in the DOM was
  // wrong and nothing measured it; it was visible in one PNG.
  useEffect(() => {
    if (!status) return;
    list.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest" });
  }, [status]);

  useEffect(() => {
    let live = true;
    void loadQualityApi().then((m) => {
      if (!live) return;
      setApi(m);
      setStatus(m.readQualityStatus());
    });
    return () => { live = false; };
  }, []);

  const pick = useCallback((choice: QualityChoice) => {
    if (!api) return;
    api.chooseQuality(choice);
    // Re-read rather than assume: what "Automatic" resolves to is the governor's
    // business, and the point of the button is to SHOW that it cleared.
    setStatus(api.readQualityStatus());
  }, [api]);

  const choices = api?.QUALITY_CHOICES ?? (["high", "medium", "low", "auto"] as const);
  const labels = api?.QUALITY_CHOICE_LABELS;
  // What the store now says, against what the renderer was actually forged at.
  // Everything but the pixel ratio is built once, so a choice made here is
  // half-applied until the arena is next built — `QualityStatus.forged` is the
  // field that lets this panel say which half rather than claiming it all
  // landed. It comes from quality.ts because that module is the only thing that
  // knows what was handed to the forge.
  const pending = Boolean(status && status.forged !== null && status.active !== status.forged);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-label="Graphics quality">
      <div className="card card-noble card-glow flex max-h-[92vh] w-full max-w-md flex-col gap-3 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="label-overline">SETTINGS</div>
            <div className="font-display text-xl tracking-wider text-amber-100 sm:text-2xl">GRAPHICS</div>
          </div>
          <button onClick={onClose} aria-label="Close graphics settings"
            className="shrink-0 rounded-lg border border-stone-600/70 p-2 text-[#d9cdb2] transition hover:border-amber-600/70 hover:text-amber-200">
            <X size={16} />
          </button>
        </div>
        <div className="knot-band w-full" />

        {/* What is happening RIGHT NOW, and why. A player looking at a soft
            picture he never asked for is owed the reason in a sentence. */}
        <div className="rounded-lg border border-stone-700/70 bg-black/40 px-3 py-2">
          <div className="text-[10px] font-bold tracking-[0.18em] text-[#a89a7c]">NOW RENDERING</div>
          <div className="font-display text-lg tracking-wider text-amber-100">
            {status ? TIER_WORD[status.active] : "…"}
          </div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-[#a89a7c]">
            {!status ? "Reading this device…"
              : status.pinned ? `Pinned by ?quality=${status.pinned} on the address bar — that beats this control, and clearing it needs the address bar too.`
              : status.choice !== "auto" ? `Your choice, kept for this browser. On its own reckoning this is a ${TIER_WORD[status.detected]} device — Automatic would pick that.`
              : status.measured ? "Automatic, from frame time measured on this device."
              : "Automatic, from what this device reports about itself."}
          </div>
        </div>

        {/* THE STALE DEMOTION, IN WORDS. This is the state that was permanent
            and unsayable: the governor holding a device below its own guess,
            with nothing on screen admitting it and no way to undo it. */}
        {status?.demoted && (
          <div className="animate-fadeIn rounded-lg border border-amber-600/70 bg-amber-950/50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-100">
            <span className="font-bold">This device stuttered once. </span>
            It has been held at {TIER_WORD[status.active]}, though on its own reckoning it is
            a {TIER_WORD[status.detected]} device. Choose <span className="font-bold">Automatic</span> to
            throw that away and measure again, or pick a tier yourself.
          </div>
        )}

        {/* THE FEEL (8.9): look speed and the shake, beside the tiers
            because this panel is already the mid-fight settings door — the
            moment a player wants any of it is the moment the fight feels
            wrong, and a second menu would be a second place to not find it. */}
        <div className="rounded-lg border border-stone-700/70 bg-black/40 px-3 py-2.5">
          <div className="text-[10px] font-bold tracking-[0.18em] text-[#a89a7c]">THE FEEL</div>
          <label className="mt-1.5 flex items-center gap-3">
            <span className="w-24 shrink-0 text-[11px] font-bold tracking-wider text-amber-200">LOOK SPEED</span>
            <input type="range" min={50} max={200} step={5}
              value={Math.round(feelNow.sensitivity * 100)}
              onChange={(e) => setFeel({ sensitivity: Number(e.target.value) / 100 })}
              aria-label="Look sensitivity"
              className="min-w-0 flex-1 accent-amber-500" />
            <span className="w-11 shrink-0 text-right font-mono text-[11px] text-[#d9cdb2]">{Math.round(feelNow.sensitivity * 100)}%</span>
          </label>
          <label className="mt-2 flex items-center gap-3">
            <span className="w-24 shrink-0 text-[11px] font-bold tracking-wider text-amber-200">CAMERA SHAKE</span>
            <button role="switch" aria-checked={feelNow.shake}
              onClick={() => setFeel({ shake: !feelNow.shake })}
              className={`rounded-md border px-3 py-1 text-[11px] font-bold tracking-widest transition ${
                feelNow.shake ? "border-amber-500/80 bg-amber-950/40 text-amber-200" : "border-stone-600/70 bg-stone-900/60 text-[#a89a7c]"
              }`}>
              {feelNow.shake ? "ON" : "OFF"}
            </button>
            <span className="min-w-0 flex-1 text-[10px] leading-snug text-[#7d7057]">
              Off loses nothing the HUD does not also say.
            </span>
          </label>
          {/* The colour-blind door (the owner's ruling): gold vs deep woad,
              split on VALUE as well as hue, so the sides differ in
              brightness before colour is consulted. Forge-time, like the
              tiers — hence the honest "next fight" note. */}
          <label className="mt-2 flex items-center gap-3">
            <span className="w-24 shrink-0 text-[11px] font-bold tracking-wider text-amber-200">TEAM COLOURS</span>
            <button role="switch" aria-checked={feelNow.teamContrast}
              onClick={() => setFeel({ teamContrast: !feelNow.teamContrast })}
              className={`rounded-md border px-3 py-1 text-[11px] font-bold tracking-widest transition ${
                feelNow.teamContrast ? "border-amber-500/80 bg-amber-950/40 text-amber-200" : "border-stone-600/70 bg-stone-900/60 text-[#a89a7c]"
              }`}>
              {feelNow.teamContrast ? "HIGH CONTRAST" : "CLASSIC"}
            </button>
            <span className="min-w-0 flex-1 text-[10px] leading-snug text-[#7d7057]">
              Gold vs deep woad, split by brightness too. Takes hold at the next fight.
            </span>
          </label>
        </div>

        <div ref={list} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {choices.map((c) => {
            const on = status?.choice === c;
            return (
              <button key={c} onClick={() => pick(c)} disabled={!api}
                aria-pressed={on}
                className={`mb-2 flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition disabled:opacity-50 ${
                  on ? "border-amber-500/80 bg-amber-950/40" : "border-stone-700/70 bg-stone-900/60 hover:border-amber-700/70"
                }`}>
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  on ? "border-amber-400 bg-amber-500/25 text-amber-200" : "border-stone-600 text-transparent"
                }`}>
                  <Check size={12} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold tracking-wider text-amber-200">
                    {labels?.[c] ?? c.toUpperCase()}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-[#a89a7c]">{QUALITY_BLURB[c]}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* The honest half of a mid-fight change. Pixel ratio is the one knob
            three re-honours live; everything else is forge-time. Reloading is
            offered and never taken automatically, because page.tsx joins its
            room from memory and rejoins nothing — a reload mid-match is a
            forfeit, and a settings panel must not spend a player's fight. */}
        {pending && (
          <div className="animate-fadeIn rounded-lg border border-stone-600/70 bg-stone-900/80 px-3 py-2.5">
            {/* Two wordings, because two different things are true. Picking a
                TIER moves the pixel ratio at once (`QUALITY_GOVERNOR.adopt`);
                picking Automatic only throws the stored verdict away, and the
                measuring starts again on the next load. One sentence covering
                both would have to be false for one of them. */}
            <div className="text-[11px] leading-relaxed text-[#d9cdb2]">
              <span className="font-bold text-amber-200">Kept. </span>
              {status?.choice === "auto"
                ? "This device gets measured again from the next load; what is on the screen right now is still the tier it was forged at."
                : "The pixel count has already changed. Shadow maps, bloom, ambient occlusion and the texture maps are built when the arena is forged, so those land the next time it is — rebuilding now would leave this fight."}
            </div>
            <button onClick={() => status && api?.applyQualityPreference(status.choice)}
              className="btn-ghost mt-2 !min-h-[2.5rem] w-full !text-[11px]">
              REBUILD NOW — LEAVES THE FIGHT
            </button>
          </div>
        )}

        <button onClick={onClose} className="btn-primary !min-h-[3rem] w-full !text-[12px]">DONE</button>
      </div>
    </div>
  );
}

export default function GameHud({
  playerId, roomState, glError, isMobile, mobileFlags, setFlag, joyOrigin, joystickPos, onMootFoe, onMootArm, onMootHold, onMootDone,
}: GameHudProps) {
  // A WEAPON AT HIS FEET (TAKE). Read off the same snapshot as everything else:
  // the nearest drop inside TAKE.range of the local man, named in the shop's
  // own words. Null when there is nothing to offer, which is almost always.
  /** "THE GAR" is already articled in ARMS_LORE; "DANE AXE" is not. One rule, no "the the". */
  const takeUp = (name: string) => (/^THE\b/i.test(name) ? name : `THE ${name}`);
  const takeable = (() => {
    const me = playerId ? roomState?.players?.[playerId] : undefined;
    const drops = roomState?.drops;
    if (!me || !drops || !drops.length || me.state === "dead") return null;
    let best: WeaponDrop | null = null, bestD: number = TAKE.range;
    for (const d of drops) {
      const dist = Math.hypot(d.x - me.position.x, d.z - me.position.z);
      if (dist <= bestD) { best = d; bestD = dist; }
    }
    if (!best) return null;
    const name = ARMS_LORE[best.cls]?.find((a) => a.id === best.arms)?.name ?? best.arms.toUpperCase();
    return { name };
  })();
  const localPlayer = roomState?.players[playerId];
  const isAlive = localPlayer && localPlayer.state !== "dead";
  const isFighting = roomState?.state === "fighting" || roomState?.state === "last_stand";
  // ON THE MEAD-BENCH (7.9b). Not in `players` — so none of the fighter's
  // furniture below can even reference him — but named on the bench, which is
  // what tells "watching" apart from "not yet joined": before the first
  // snapshot both look like a missing localPlayer, and only one of them
  // should be told he is seated.
  const seated = !localPlayer && Boolean(roomState?.seats?.some((sp) => sp.id === playerId));
  // What the bench means for THIS man. A visitor waits for the next moot; a
  // tournament duellist (7.3) is either still in the bracket — his seat is a
  // between-duels breath — or knocked out and watching how it ends.
  let benchLine = "You watch. When this moot ends, you fight.";
  if (seated && roomState?.bracket) {
    let inIt = false, out = false;
    for (const st of roomState.bracket) for (const m of st) {
      if (m.a === playerId || m.b === playerId) {
        inIt = true;
        if (m.done && m.winner !== playerId) out = true;
      }
    }
    if (out) benchLine = "Your moot is run. Watch how it ends.";
    else if (inIt) benchLine = "Win and advance — your duel comes.";
  }
  const hpPct = localPlayer ? Math.max(0, localPlayer.health / localPlayer.maxHealth) : 1;

  // Which way round the thumbs go. Stored, and shared with input.ts so the
  // touch zones and the buttons mirror as one thing.
  const lefty = useSyncExternalStore(subscribeHandedness, getHandedness, getServerHandedness);

  // THE RAIL, and the measurement it flows from. `soloEnd` is the same
  // expression `page.tsx` renders the END button on — solo mode — handed to the
  // layout so the mute toggle takes END's slot wherever END is not there. The
  // observer watches the timer column because its height is a function of the
  // mode (a Burh adds WAVE, a bench adds its own row) and guessing that here
  // would be a second copy of the conditions twenty lines below.
  const rail = useFightRail();
  const soloEnd = roomState?.mode === "solo";
  const readoutRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = readoutRef.current;
    if (!el) return;
    const read = () => publishReadoutBottom(el.getBoundingClientRect().bottom);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
    // The element mounts and unmounts with the fight, and its CONTENT changes
    // under the observer without remounting, which is the case the observer is
    // for. Re-run on the conditions that mount it, not on the rows inside it.
  }, [isFighting, isAlive, localPlayer?.id]);

  // "<target id>|<switches>". It changes when the lock takes a different man,
  // which is a handful of times a fight — not per frame. The reticle's POSITION
  // never comes through here: render/camera.ts writes that onto the element's
  // transform directly, because that does move every frame.
  const lockSnap = useSyncExternalStore(subscribeLock, getLockSnapshot, getServerLockSnapshot);
  const lockedId = lockSnap.split("|")[0];
  const lockedOn = lockedId !== "";
  /** A flick the player MADE, whether or not there was a second man to take. */
  const hasFlicked = lockSnap.split("|")[2] !== "0";

  // THE RIPOSTE WINDOW, ON THE MAN IT IS OPEN ON.
  //
  // `docs/DESIGN-SYSTEM.md` §3: the parry tell lights the OPPONENT's brackets
  // for the window's real duration, rather than putting a bar on my own HUD.
  // Both halves of that rule are load-bearing and both are honoured here.
  //
  //   HIS brackets, not mine — so the thing a player is already looking at
  //   (the man) is the thing that carries the information, and the eye never
  //   has to leave the fight to read it. `input.ts` makes the man you parried
  //   take the lock outright, so the brackets are guaranteed to be on him.
  //
  //   The window's REAL duration — so the mark cannot lie. `vulnerableTimer`
  //   is the server's own remaining seconds, replicated (see types.ts), and the
  //   jaws close over exactly that: when they meet, the window is gone. It is a
  //   DRAIN and not a countdown, which is the rule §8 praises for the mercy
  //   window — a number invites you to watch the number instead of the man.
  //
  // `vulnerableTo` is checked against this player: somebody else's parry is
  // somebody else's reward and must not be drawn as mine.
  const marked = lockedId ? roomState?.players[lockedId] : undefined;
  const riposteLeft = marked && marked.vulnerableTo === playerId ? (marked.vulnerableTimer ?? 0) : 0;
  const riposteOn = riposteLeft > 0;
  // THE FINISH (7.7a): the man the lock holds is DOWN and LOW — the engine's
  // two execution gates, read off the same replicated fields it reads — so a
  // heavy takes all of him. Said on the mark the player is already looking
  // at, the riposte's own principle: the man carries the information.
  const finishOpen = Boolean(marked
    && (marked.state === "knocked" || marked.state === "rising")
    && marked.health > 0
    && marked.health <= marked.maxHealth * EXECUTION.healthFrac);
  // Closed fraction, 0 the instant it opens and 1 as it expires. Recomputed
  // from the wire every snapshot rather than run off a local timer, so a
  // dropped packet cannot leave a window drawn open after the server shut it.
  const ripClose = riposteOn ? Math.min(1, 1 - riposteLeft / RIPOSTE.window) : 0;

  // What a tap would cut with right now. It is feedback, not state the sim
  // reads — input.ts holds the direction itself — but a player needs to be able
  // to see what his last flick armed without swinging to find out.
  const [armed, setArmed] = useState<AttackDirection>("right");
  const [taught, setTaught] = useState(false);
  // Rebinding mid-fight, which is when anyone wants it.
  const [keysOpen, setKeysOpen] = useState(false);
  // And changing the picture mid-fight, which is the same argument: the moment
  // a player wants this is the moment the fight is stuttering or has gone soft
  // on him, and quality.ts can put it there without being asked.
  const [gfxOpen, setGfxOpen] = useState(false);
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

  // ---------------------------------------------------------------------
  // THE FOE-SWITCH LINE, WHICH USED TO BE FURNITURE.
  //
  // The owner: "Flick screen to change foe stays on screen permanently that
  // needs to fade away." `src/game/tuition.mjs` owns the whole of when it
  // leaves and why; this is transport. Two things are decided here because they
  // are questions about the ROOM rather than about the hint:
  //
  //   IS THERE ANYBODY TO SWITCH TO. A caption teaching a control that cannot
  //   do anything is furniture for as long as it is up, however briefly. In an
  //   honour duel there is one foe and the flick has nowhere to go, so the line
  //   does not appear at all — which is the mode the owner plays and the mode
  //   the line was permanent in.
  //
  //   IS IT ON SCREEN AT ALL. A clock that runs while he is dead, or in the
  //   lobby, or with nobody under the lock, expires the hint before it has been
  //   read. `eligible` is the whole of "this line is up and it means something".
  const otherLive = roomState
    ? Object.values(roomState.players).filter((p) => p.id !== playerId && p.state !== "dead").length
    : 0;
  const foeEligible = Boolean(isMobile.current && isFighting && isAlive && lockedOn && otherLive >= 2);
  const foeHintRef = useRef<ReturnType<typeof createTuitionHint> | null>(null);
  const [foeHintUp, setFoeHintUp] = useState({ alive: false, opacity: 0 });
  // Built on first ASK rather than in one of the effects below, because both of
  // them need it and effects run in declaration order: a HUD that remounts on a
  // player who has already flicked would otherwise hand `used()` to a hint that
  // did not exist yet, and the line would come back for a man who had learned it.
  const ensureFoeHint = useCallback(() => (
    foeHintRef.current ??= createTuitionHint({ terms: FOE_HINT, ...browserStore(FOE_HINT_KEY) })
  ), []);
  // The flick is an edge on a counter that only ever goes up, so this fires once
  // and then never again for the life of the page — and `used()` persists, so
  // never again on this device either.
  useEffect(() => {
    if (hasFlicked) ensureFoeHint().used();
  }, [hasFlicked, ensureFoeHint]);
  useEffect(() => {
    const hint = ensureFoeHint();
    // A quarter of a second, not a frame. This is a six-second caption and a
    // render loop is how a 120 Hz phone becomes a 40 Hz one — the same argument
    // `subscribeLock` is written under. `setFoeHintUp` is only called when the
    // answer changes, so the interval costs one comparison.
    const STEP = 0.25;
    const push = () => setFoeHintUp((prev) => (
      prev.alive === hint.alive && prev.opacity === hint.opacity
        ? prev
        : { alive: hint.alive, opacity: hint.opacity }));
    hint.update(0, foeEligible);
    push();
    if (!foeEligible && !hint.alive) return;
    const id = setInterval(() => { hint.update(STEP, foeEligible); push(); }, STEP * 1000);
    return () => clearInterval(id);
  }, [foeEligible, ensureFoeHint]);

  // -----------------------------------------------------------------------
  // THE FIRST MOOT'S BEAT LINE. `src/game/firstmoot.mjs` owns the whole of
  // what a beat is and when it retires; this is transport, exactly as the
  // foe hint above is. It keys off the ROOM, not off how the player arrived:
  // a new arrival who taps TRAINING instead of the landing's FIRST MOOT
  // button deserves the same teaching, and the device store retires the rite
  // for everyone else. Solo only — a taught line over a live opponent's
  // fight is a caption over the one thing he is trying to read.
  const mootRef = useRef<ReturnType<typeof createFirstMoot> | null>(null);
  const ensureMoot = useCallback(() => (
    mootRef.current ??= createFirstMoot(browserStore(FIRST_MOOT_KEY))
  ), []);
  const [mootUp, setMootUp] = useState<{
    line: string | null; at: number; total: number; flash?: boolean;
    /** The pause point: a phase's card, held until the player takes it down. */
    card: { title: string; lines: readonly string[]; at: number; total: number } | null;
  }>({ line: null, at: 0, total: 0, card: null });
  // The staged foe (backlog 8.5): fired once, the first time the rite is seen
  // past its MOVE beat — learned or skipped — so the First Moot's empty ring
  // gets its opponent exactly when striking becomes the lesson. A ref, so the
  // interval below never has to be torn down over a parent re-render.
  const mootFoeSentRef = useRef(false);
  const onMootFoeRef = useRef(onMootFoe);
  useEffect(() => { onMootFoeRef.current = onMootFoe; });
  /** Sent once, when the rite reaches the phase a blow may arrive in. The pell
   *  stands still until then — `firstmoot.mjs` decides, `engine.mjs` enforces,
   *  this is the wire between them. */
  const mootArmSentRef = useRef(false);
  const onMootArmRef = useRef(onMootArm);
  useEffect(() => { onMootArmRef.current = onMootArm; });
  const onMootHoldRef = useRef(onMootHold);
  useEffect(() => { onMootHoldRef.current = onMootHold; });
  const mootHeldRef = useRef(false);
  /** Fired on the EDGE of the rite finishing inside this session, so a
   *  graduate who happens to take another solo fight is not marched off to the
   *  war room every time he loads the ring. */
  const mootDoneSentRef = useRef(false);
  const onMootDoneRef = useRef(onMootDone);
  useEffect(() => { onMootDoneRef.current = onMootDone; });
  const mootPrevAtRef = useRef(0);
  // The interval reads the LATEST snapshot through a ref: `localPlayer` is a
  // fresh object twenty times a second and an effect keyed on it would tear
  // the interval down as fast as it built it.
  const mootPlayerRef = useRef<GamePlayer | undefined>(undefined);
  // Written post-commit rather than during render (react-doctor: refs are not
  // for render bodies). The only reader is the 250 ms interval below, which
  // never runs inside a render, so commit-time freshness is full freshness.
  useEffect(() => { mootPlayerRef.current = localPlayer; });
  const mootEligible = Boolean(roomState?.mode === "solo" && isFighting && isAlive && localPlayer);
  useEffect(() => {
    // Both first writes ride a 0 ms timer so the effect body itself sets no
    // state (the cascade react-doctor flags); a beat line appearing one task
    // later than the commit is not observable against a 250 ms cadence.
    if (!mootEligible) {
      const t = setTimeout(() => setMootUp((p) => (p.line || p.card ? { line: null, at: p.at, total: p.total, card: null } : p)), 0);
      return () => clearTimeout(t);
    }
    const moot = ensureMoot();
    if (moot.done) return;
    const STEP = 0.25;
    let flashTimer: ReturnType<typeof setTimeout> | null = null;
    const push = () => {
      const b = moot.beat;
      // The foe walks in for THE BLADE — the phase whose card promises him —
      // and not before. Keyed on the phase and no longer on "the MOVE beat is
      // behind us", because MOVE is the second beat of three now and the ring
      // would have filled up while the player was still learning where to look.
      if (!mootFoeSentRef.current && (moot.done || moot.phaseAt >= 1)) {
        mootFoeSentRef.current = true;
        onMootFoeRef.current?.();
      }
      // And he keeps his hands down until the rite says otherwise.
      if (!mootArmSentRef.current && moot.armed) {
        mootArmSentRef.current = true;
        onMootArmRef.current?.();
      }
      // THE PAUSE, physically: while a card is up in an armed phase the foe
      // is held — sent AFTER the arming above, so the arming cannot drop it.
      // The release is sent from `openMoot`, on the press that takes the
      // card down, not from here: a hold must end on the player's word.
      const wantHold = !!moot.card && moot.armed && !moot.done;
      if (wantHold && !mootHeldRef.current) { mootHeldRef.current = true; onMootHoldRef.current?.(true); }
      if (!mootDoneSentRef.current && moot.done && mootPrevAtRef.current > 0) {
        mootDoneSentRef.current = true;
        onMootDoneRef.current?.();
      }
      // A beat retiring is the rite's one reward moment — flash the line so
      // "learned" reads as an event, not as text quietly swapping.
      const learned = moot.at > mootPrevAtRef.current;
      mootPrevAtRef.current = moot.at;
      if (learned) {
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = setTimeout(() => setMootUp((p) => (p.flash ? { ...p, flash: false } : p)), 1300);
      }
      const line = b ? (isMobile.current ? b.touch : b.desk) : null;
      const c = moot.card;
      const card = c ? { title: c.title, lines: c.card, at: moot.phaseAt, total: moot.phaseTotal } : null;
      setMootUp((prev) => (prev.line === line && prev.at === moot.at && !learned
        && (prev.card?.title ?? null) === (card?.title ?? null)
        ? prev : { line, at: moot.at, total: moot.total, card, flash: learned || (prev.flash && prev.at === moot.at) }));
    };
    const t0 = setTimeout(push, 0);
    const id = setInterval(() => {
      const p = mootPlayerRef.current;
      if (p) moot.note(p, STEP);
      push();
    }, STEP * 1000);
    return () => { clearTimeout(t0); clearInterval(id); if (flashTimer) clearTimeout(flashTimer); };
  }, [mootEligible, ensureMoot, isMobile]);
  const skipMoot = useCallback(() => {
    ensureMoot().skip();
    setMootUp((p) => ({ line: null, at: p.at, total: p.total, card: null }));
  }, [ensureMoot]);
  /**
   * Take the card down and begin the phase. THE PAUSE POINT ends here.
   *
   * A plain function and not a `useCallback`: it reads `isMobile.current`, and
   * a ref read inside a memo is the one thing the compiler will not carry — it
   * cannot know the ref moved. Memoising a handler used once by one button buys
   * nothing anyway, and the alternative (letting the 250 ms interval fill the
   * line in) is a quarter of a second of blank glass after "I AM READY", which
   * is the press this whole card exists for.
   */
  const openMoot = () => {
    const m = ensureMoot();
    m.open();
    if (mootHeldRef.current) { mootHeldRef.current = false; onMootHoldRef.current?.(false); }
    setMootUp((p) => ({
      ...p, card: null,
      line: m.beat ? (isMobile.current ? m.beat.touch : m.beat.desk) : null,
    }));
  };

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
            <p className="text-[#d9cdb2] text-sm leading-relaxed">{glError}</p>
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
                { grow: 0, c: riposteOn ? "rgba(224,84,52,0.98)" : "rgba(240,229,203,0.94)" },
              ].map((p, i) => (
                <path key={i}
                  d="M 10.40 -8.13 Q 17.60 0 10.40 8.13 Q 14.40 0 10.40 -8.13 Z
                     M -10.40 -8.13 Q -17.60 0 -10.40 8.13 Q -14.40 0 -10.40 -8.13 Z"
                  fill={p.c} stroke={p.grow ? p.c : "none"} strokeWidth={p.grow}
                  strokeLinejoin="round"
                  /* THE WINDOW, DRAWN AS THE JAWS CLOSING ON HIM.
                     The one warm colour on a cold screen (DESIGN-SYSTEM §1 —
                     blood is the only heat, so it needs no glow to read), and
                     the jaws travel inward by `ripClose`, which is the server's
                     own remaining seconds. When they meet, it is over. No box,
                     no rotating reticle, no mark over his face — the same two
                     strokes that were already there, saying one more thing. */
                  transform={riposteOn ? `scale(${(1 - ripClose * 0.42).toFixed(3)})` : undefined} />
              ))}
              {/* THE FOE'S GUARD (7.7c), on the mark the player is already
                  reading — the riposte's own principle. The bar sits on the
                  LINE HIS GUARD COVERS: strike where it is not. Bone over
                  shadow like the jaws, never blood — a guard is not a
                  threat, it is information. Overhead sits above, the stab
                  guard below, left and right at the flanks; the mapping is
                  consistent rather than anatomical, because a rule a player
                  can test twice beats one he must be told. */}
              {marked && marked.state === "blocking" && (() => {
                const d = marked.blockDir;
                const bar = d === "overhead" ? { x: -6, y: -16.5, w: 12, h: 2.4 }
                  : d === "stab" ? { x: -4, y: 14.1, w: 8, h: 2.4 }
                  : d === "left" ? { x: -16.5, y: -6, w: 2.4, h: 12 }
                  : { x: 14.1, y: -6, w: 2.4, h: 12 };
                return (
                  <g data-guard-dir={d}>
                    <rect x={bar.x - 0.8} y={bar.y - 0.8} width={bar.w + 1.6} height={bar.h + 1.6} rx={1.6} fill="rgba(10,7,4,0.55)" />
                    <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={1.2} fill="rgba(240,229,203,0.92)" />
                  </g>
                );
              })()}
            </svg>
            {/* THE FINISH PROMPT (7.7a), inside the reticle so it rides the
                same camera transform and the same fade — no second element
                to aim, no second thing to keep honest. Blood-warm like the
                riposte jaws: it is the same message, "he is open". */}
            {finishOpen && (
              <div data-finish className="absolute left-1/2 top-[20px] -translate-x-1/2 whitespace-nowrap text-center">
                <div className="text-[10px] font-bold tracking-[0.3em] text-red-400"
                  style={{ textShadow: "0 1px 4px black, 0 0 14px rgba(224,84,52,0.45)" }}>
                  FINISH HIM
                </div>
                <div className="text-[8px] font-bold tracking-[0.25em] text-amber-200/80" style={{ textShadow: "0 1px 4px black" }}>
                  HEAVY BLOW
                </div>
              </div>
            )}
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
                // The ground he stands on goes warm with the jaws — the same
                // one signal in two places rather than a second device, so the
                // window reads from the corner of the eye at fight distance
                // where 34 px of bracket might not.
                { w: 1.25, c: riposteOn ? "rgba(224,84,52,0.85)" : "rgba(240,229,203,0.68)" },
              ].map((p, i) => (
                <ellipse key={i} cx="0" cy="0" rx="19" ry="3.8"
                  fill="none" stroke={p.c} strokeWidth={p.w} />
              ))}
            </svg>
          </div>

          {/* Discoverability for the switch. It sat at the top of the screen
              first, which the layout harness passed and a capture did not: the
              kill feed is five rows deep up there and had this line through the
              middle of it. Stacked over the other tuition line instead, in the
              half of the screen the harness measures for overlaps — so the next
              person to move it gets told.

              WHEN IT LEAVES is `src/game/tuition.mjs`, and it is a decision
              rather than a condition: it used to be drawn under `!hasSwitched`,
              which is a flick that FOUND somebody, which in a duel can never
              happen — so in the mode the owner plays it was a permanent caption
              on the one surface a phone player looks through. Now it goes when
              the gesture is made, or when it has been up long enough, whichever
              comes first, and it does not come back for a player who has
              demonstrated the control.

              The fade is on `opacity` with a transition rather than on a
              keyframe class, because the element has to be able to fade OUT and
              `animate-fadeIn` only ever runs one way. */}
          {foeHintUp.alive && (
            <div className="absolute bottom-[318px] left-1/2 z-10 -translate-x-1/2 pointer-events-none"
              style={{ opacity: foeHintUp.opacity, transition: `opacity ${FOE_HINT.fade}s ease-out` }}>
              <div className="whitespace-nowrap rounded-md bg-black/50 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-amber-100/85"
                style={{ textShadow: "0 1px 4px black" }}>
                ◀ FLICK THE GLASS TO CHANGE FOE ▶
              </div>
            </div>
          )}

          {/* THE FIRST MOOT'S BEAT. Stacked above the foe hint's slot in the
              measured half of the screen, `pointer-events-none` for the same
              reason every taught line here is: an opaque caption in the
              free-look half is a patch of dead camera, and touchtest samples
              exactly that. When it leaves is `src/game/firstmoot.mjs`'s
              decision — a beat retires when the sim has honoured the act it
              teaches, never on a timer alone. */}
          {/* THE PAUSE POINT — a phase's card, and the cinematic half of the
              owner's "full phased cinematic journey, with pause points".
              
              It is a real HOLD and not a caption: `firstmoot.mjs` retires
              nothing while its card is up, so a player who spends four seconds
              doing exactly what the next beat wants gets no credit for it and
              nothing scrolls past him unread. He takes it down when he has read
              it, and only then is anything asked.

              `inset-0` and `pointer-events-auto`: the whole glass is the card
              while it is up. That is deliberate on a phone — a 44 px button in
              a corner is a thing to hunt for, and there is nothing else to
              press here. The free-look half is not being taken from anyone,
              because nothing is being asked yet. */}
          {mootUp.card && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/72 px-6 backdrop-blur-sm pointer-events-auto animate-fadeIn">
              <div className="max-w-sm text-center">
                <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-amber-500/80">
                  THE FIRST MOOT · {mootUp.card.at + 1} OF {mootUp.card.total}
                </div>
                <h2 className="font-display mt-2 text-3xl tracking-[0.18em] text-[#f6f1e6]"
                  style={{ textShadow: "0 2px 24px rgba(0,0,0,0.95), 0 0 30px rgba(255,180,60,0.3)" }}>
                  {mootUp.card.title}
                </h2>
                <div className="mx-auto mt-3 h-px w-24 bg-amber-700/60" />
                {mootUp.card.lines.map((l, i) => (
                  <p key={i} className="mt-2.5 text-[13px] leading-relaxed text-[#d9cdb2]">{l}</p>
                ))}
                <button onClick={openMoot} data-snd="confirm"
                  className="btn-primary mt-6 w-full !min-h-[3.25rem]">
                  I AM READY
                </button>
                <button onClick={skipMoot} data-snd="back"
                  className="mt-2 w-full py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#7d7057] transition hover:text-[#a89a7c]">
                  I know the fight — take me to the war
                </button>
              </div>
            </div>
          )}

          {/* 352 px off the foot is above the cluster on a tall screen and off
              the TOP of a landscape one — at 390 px of height it lands 38 px
              down, straight through the timer column. It is a caption that has
              to sit between the thumbs and the readouts, so on a short screen
              it takes the room that is actually there. */}
          {mootUp.line && (
            <div style={{ bottom: Math.min(352, Math.max(150, rail.h - 150)) }}
              className="absolute left-1/2 z-10 -translate-x-1/2 pointer-events-none max-w-[86vw]">
              <div className={`rounded-md px-3 py-1.5 text-center transition-colors duration-300 ${
                mootUp.flash ? "bg-amber-900/70 ring-1 ring-amber-400/70" : "bg-black/55"
              }`}
                style={{ textShadow: "0 1px 4px black" }}>
                {/* Pips, not a fraction: five dots a thumb can read without
                    parsing "3 OF 5" mid-fight; the flash marks the beat that
                    just retired as an EVENT. Staged, as the owner asked. */}
                <div className="flex items-center justify-center gap-1.5">
                  <span className="text-[8px] font-bold tracking-[0.24em] text-amber-400/80">THE FIRST MOOT</span>
                  <span className="flex gap-1">
                    {Array.from({ length: mootUp.total }, (_, i) => (
                      <span key={i} className={`inline-block h-1.5 w-1.5 rounded-full ${
                        i < mootUp.at ? "bg-amber-300" : i === mootUp.at ? "bg-amber-100 ring-1 ring-amber-300/70" : "bg-stone-600"
                      }`} />
                    ))}
                  </span>
                </div>
                {mootUp.flash && (
                  <div className="text-[9px] font-black tracking-[0.3em] text-amber-300">LEARNED</div>
                )}
                <div className="mt-0.5 text-[11px] font-bold tracking-[0.1em] text-amber-100/95">
                  {mootUp.line}
                </div>
              </div>
            </div>
          )}
          {/* The graduate's door, on the MOVEMENT side with END, the mute
              toggle and the graphics pad — the free-look half takes no
              buttons, ever, and the button must FIT the movement side: its
              first cut ran one long line 150 px wide from left-3, whose right
              edge crossed w * 0.45 at 390 and ate 27 sampled look-side points
              — the same class of fault the END button was cured of this
              morning. Two stacked lines inside 8.5 rem stay left of the split
              at every tested width, and it sits BELOW the graphics pad
              (172–220) so nothing overlaps. 44 px floor like everything on
              the glass. */}
          {mootUp.line && (
            <button onClick={skipMoot} data-snd="back"
              style={railStyle("skip", rail, lefty, soloEnd)}
              className="z-30 min-h-[44px] w-[8.5rem] px-2 py-1.5 bg-stone-900/80 hover:bg-stone-800 border border-stone-600/80 rounded-lg text-[9px] font-bold tracking-[0.12em] text-[#b6a888] transition backdrop-blur leading-tight">
              I KNOW THE FIGHT<br />— SKIP —
            </button>
          )}

          {/* Status HUD */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none z-10 w-[52vw] max-w-72">
            <div className="text-amber-100/95 text-[11px] font-bold tracking-[0.2em] font-display" style={{ textShadow: "0 1px 5px black" }}>{localPlayer.name}</div>
            <div className="w-full h-3.5 bg-black/70 rounded-md border border-amber-900/70 overflow-hidden shadow-lg">
              {/* `transition-[width]`, not `transition-all`. This bar's width is
                  driven off the wire at 20 Hz, and `all` tells the browser to
                  watch every animatable property on it for a change — on the one
                  element in the frame that is guaranteed to change, every frame,
                  for the whole of a fight. The only property that actually
                  animates here is the width. */}
              <div className="h-full transition-[width] duration-200"
                style={{
                  width: `${hpPct * 100}%`,
                  background: hpPct > 0.5 ? "linear-gradient(90deg,#2fa245,#5ee06b)" :
                    hpPct > 0.25 ? "linear-gradient(90deg,#c99a22,#f0d048)" : "linear-gradient(90deg,#a12117,#ff4a3a)",
                }} />
            </div>
            <div className="w-full h-1.5 bg-black/70 rounded-md border border-sky-950/70 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-400 to-sky-300 transition-[width] duration-200"
                style={{ width: `${Math.max(0, (localPlayer.stamina / localPlayer.maxStamina) * 100)}%` }} />
            </div>
            {/* THE BOARD (SHIELD): only for a man who carries one. Limewood,
                then scorched, then the garnet of a board about to go — the
                same three steps the cracks on the shield itself take. */}
            {/* TAKE UP (TAKE), on the desktop: a line under the bars while a
                dead man's weapon is within a step. The key is the binding's own. */}
            {!isMobile.current && takeable && (
              <div data-hud="take" className="mt-1 rounded-full border border-emerald-400/50 bg-black/60 px-3 py-0.5 text-[10px] font-bold tracking-[0.2em] text-emerald-200">
                TAKE UP {takeUp(takeable.name)} — {labelForCode(bindingsFor("take")[0] ?? "KeyG")}
              </div>
            )}
            {typeof localPlayer.shield === "number" && (
              <div className="w-full h-1 bg-black/70 rounded-md border border-amber-950/70 overflow-hidden" data-hud="board">
                <div className="h-full transition-[width] duration-200"
                  style={{
                    width: `${Math.max(0, Math.min(100, localPlayer.shield))}%`,
                    background: localPlayer.shield > 50 ? "linear-gradient(90deg,#8a6a3e,#c9a56a)" :
                      localPlayer.shield > 25 ? "linear-gradient(90deg,#9a5a2a,#d08a3a)" : "linear-gradient(90deg,#7a1e14,#c8402a)",
                  }} />
              </div>
            )}
            {/* THE CHAIN, SAID OUT LOUD — backlog 7.1. The combo multiplier
                has been real since the engine existed (×1.15 per linked light
                inside 0.8 s, capped ×1.6) and never drawn, so the fast button
                read as the weak button and the owner — correctly — spammed
                heavies. A number that changes what a blow is worth is shown
                where the blow is thrown. */}
            {(localPlayer.comboCount ?? 0) >= 2 && (
              <div className="mt-0.5 text-[11px] font-black tracking-[0.14em] text-amber-300"
                style={{ textShadow: "0 1px 3px black" }}>
                CHAIN ×{comboLabel(localPlayer.comboCount)}
              </div>
            )}
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
                <span className="text-[#a89a7c]">{k.cause === "execution" ? " executed " : " slew "}</span>
                <span className="text-red-300 font-bold">{k.victimName}</span>
              </div>
            ))}
          </div>

          {/* Timer + alive — the other half of the same mirror. END and mute
              stack underneath this, so it has to be on the side they are. */}
          <div ref={readoutRef}
            className={`absolute top-3 ${lefty ? "right-3 items-end" : "left-3 items-start"} flex flex-col pointer-events-none z-10`}>
            <div className="text-amber-100 text-sm font-mono bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-md">
              {Math.floor((roomState?.matchTimer ?? 0) / 60)}:{String(Math.floor((roomState?.matchTimer ?? 0) % 60)).padStart(2, "0")}
            </div>
            <div className="text-[10px] text-amber-200/90 mt-1 tracking-[0.2em] font-bold">
              {Object.values(roomState.players).filter(p => p.state !== "dead").length} ALIVE
            </div>
            {/* The Burh's ladder (7.4): the wave rides with the clock. */}
            {roomState.mode === "the_burh" && (roomState.wave ?? 0) > 0 && (
              <div className="mt-1 rounded-md bg-orange-950/70 px-2 py-0.5 text-[10px] font-bold tracking-[0.2em] text-orange-300">
                WAVE {roomState.wave}
              </div>
            )}
            {/* Who waits (7.9b) — the fighters should know the next moot has
                men in it. Quiet stone, not a fight colour: the bench is not a
                threat and must not read as one. */}
            {(roomState.seats?.length ?? 0) > 0 && (
              <div className="mt-1 rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-bold tracking-[0.2em] text-stone-300">
                {roomState.seats!.length} ON THE BENCH
              </div>
            )}
          </div>
          {/* The respite: every raider down, more coming. Snapshot-derived —
              no living bot in a burh mid-fight IS the respite, no extra wire. */}
          {roomState.mode === "the_burh" && (roomState.wave ?? 0) > 0
            && !Object.values(roomState.players).some((p) => p.id.startsWith("bot_") && p.state !== "dead") && (
            <div className="absolute top-[30%] left-1/2 -translate-x-1/2 pointer-events-none z-10">
              <div className="font-display text-xl sm:text-2xl font-bold text-orange-300 tracking-[0.3em] text-center animate-pulse"
                style={{ textShadow: "0 0 30px rgba(255,120,30,0.6), 0 2px 6px black" }}>
                THE HERE COMES
              </div>
            </div>
          )}

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
                <div className="text-sm text-[#d9cdb2]">Spectating the survivors...</div>
              </div>
            </div>
          )}
      </>
    )}

    {/* THE WATCHER'S GLASS (7.9b). A seated man has no health, no stamina, no
        ability and no controls — none of the fighter's furniture above can
        even name him — but he is watching a real fight and is owed its clock,
        its feed and a plain statement of what he is. Deliberately small
        duplicates of the two rails rather than a refactor of the fighter
        block: that block is what every layout suite measures, and the seated
        view is allowed to diverge from it (no handedness mirror — there are
        no controls to mirror against). */}
    {seated && roomState && roomState.state !== "lobby" && roomState.state !== "finished" && (
      <>
        <div className="absolute top-3 right-3 flex flex-col gap-1 pointer-events-none z-10">
          {roomState.killFeed.slice(-5).map((k, i) => (
            <div key={i} className="text-[10px] sm:text-xs bg-black/55 backdrop-blur-sm px-2.5 py-1 rounded-md text-white border-l-2 border-red-700/80 animate-fadeIn">
              <span className="text-amber-300 font-bold">{k.killerName}</span>
              <span className="text-[#a89a7c]">{k.cause === "execution" ? " executed " : " slew "}</span>
              <span className="text-red-300 font-bold">{k.victimName}</span>
            </div>
          ))}
        </div>
        <div className="absolute top-3 left-3 flex flex-col items-start pointer-events-none z-10">
          {/* data-bench-clock: benchseen's handle. Reading this off bare
              body text ran the clock digits into the ALIVE count's. */}
          <div data-bench-clock className="text-amber-100 text-sm font-mono bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-md">
            {Math.floor((roomState.matchTimer ?? 0) / 60)}:{String(Math.floor((roomState.matchTimer ?? 0) % 60)).padStart(2, "0")}
          </div>
          <div className="text-[10px] text-amber-200/90 mt-1 tracking-[0.2em] font-bold">
            {Object.values(roomState.players).filter(p => p.state !== "dead").length} ALIVE
          </div>
          {roomState.mode === "the_burh" && (roomState.wave ?? 0) > 0 && (
            <div className="mt-1 rounded-md bg-orange-950/70 px-2 py-0.5 text-[10px] font-bold tracking-[0.2em] text-orange-300">
              WAVE {roomState.wave}
            </div>
          )}
        </div>
        <div data-bench="seated" className="absolute inset-0 bg-gradient-to-t from-stone-950/55 via-transparent to-transparent flex items-end justify-center pb-16 pointer-events-none z-10">
          <div className="text-center">
            <div className="font-display text-3xl sm:text-4xl font-bold text-amber-200 mb-1 tracking-[0.2em]" style={{ textShadow: "0 0 25px black" }}>THE MEAD-BENCH</div>
            <div className="text-sm text-[#d9cdb2]">{benchLine}</div>
          </div>
        </div>
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
          {/* The chain badge rides the button that builds it — see the note
              at the desktop stamina bar. `pointer-events-none` so the badge
              cannot eat the press it is advertising. */}
          {(localPlayer.comboCount ?? 0) >= 2 && (
            <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-400 px-2 py-0.5 text-[10px] font-black leading-none text-black shadow-md">
              ×{comboLabel(localPlayer.comboCount)}
            </span>
          )}
        </button>

        {/* HEAVY */}
        <button
          style={near(112, 32)}
          className={`absolute z-20 w-[68px] h-[68px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition ${
            localPlayer.stamina >= 30 ? "bg-orange-700/95 active:bg-orange-500 border-orange-300/80" : "bg-stone-600/60 border-stone-500/40 opacity-70"
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

        {/* TAKE UP (TAKE): only while a dead man's weapon is at his feet, and
            above the shove pad it shares a finger with. Never present in the
            dead-zone sweep — no drops there — so touchtest's map is unchanged. */}
        {takeable && (
          <button
            style={near(124, 268)}
            className="absolute z-20 w-[56px] h-[56px] rounded-full text-white border-[3px] flex flex-col items-center justify-center gap-0.5 shadow-xl shadow-black/50 transition bg-emerald-800/95 active:bg-emerald-600 border-emerald-300/80"
            aria-label={`Take up ${takeUp(takeable.name)}`}
            data-hud="take"
            onTouchStart={(e) => { e.stopPropagation(); setFlag("take", true); }}>
            <Hand size={18} /><span className="text-[9px] font-bold">TAKE</span>
          </button>
        )}

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

    {/* GRAPHICS, on a phone, from inside the fight — the mobile half of the
        release valve described above GraphicsPanel.

        WHERE IT SITS, and the previous answer to that was argued rather than
        looked at. The owner: "Better placement on screen for the quality, i like
        that feature but its a bit in the way where it currently is on screen."

        It was at `far(16, 212)` — the movement side, 212 px up from the foot of
        the screen — and the comment defended that with touchtest: the free-look
        half swallows an opaque control, so it goes on the movement side, and 212
        is the first shelf clear of RUN at 24, HAND at 92 and page.tsx's ability
        readout at 152–196. Every word of that is true and none of it answers the
        question. A dead-zone sweep can only say "does this eat a drag"; being in
        the way is about what the pad is sitting ON, and at 212 it is sitting on
        the arena — a lit amber pad floating at eye level, on the warrior's own
        cloak in both handednesses, at the top of a four-deep column that had
        climbed a third of the way up the screen. `tools/hudshot.mjs` exists
        because that could only ever be seen in a frame, and the before/after
        pair is in `art/ui/hud/`.

        WHERE IT GOES: the top of the movement side, under the sound toggle, in
        the column of things that are not the fight — leave, sound, picture. That
        is one decision with four justifications and they all point the same way:

          · IT IS OUT OF BOTH THUMBS' HALF OF THE SCREEN. `docs/DESIGN-SYSTEM.md`
            §3 keeps combat controls inside the 132 px band and puts anything you
            cannot take back deliberately outside it, "because a thing you cannot
            take back should cost a small movement". A settings control is
            exactly that, and the bottom half of a phone is thumb country.
          · IT IS FURTHER FROM THE STICK, NOT NEARER. The joystick is born
            wherever the movement thumb lands below `input.ts`'s TOP_STRIP, so a
            pad on that side is a hole in the stick's surface. At 212 it sat 60 px
            from where a thumb naturally rests; here it is three hundred.
          · IT KEEPS THE ONE CONSTRAINT THAT WAS REAL. Still the movement side,
            so it still takes no bite out of free-look, in both handednesses —
            `far` mirrors it on the same `bretwalda.hand` store as everything
            else, and touchtest still gates it.
          · IT IS ANCHORED FROM THE TOP, not from the foot. This is a column that
            hangs off the top edge (timer, END, sound), and a `bottom` offset
            tuned on an 844 px screen puts it off the top of a 667 px one.

        DESKTOP IS UNCHANGED AND DELIBERATELY SO. The desktop control is the
        GRAPHICS button in the bottom-right corner beside KEYS, and in a running
        fight the pointer is locked and neither is on screen at all — the frame at
        1280x800 shows a tidy corner pair. There was nothing to move.

        It is NOT inside the cluster block above, which is gated on the player
        being alive. A man who is dead is spectating, not gone, and spectating a
        stuttering fight is exactly when he would reach for this.

        onClick, not onTouchStart: every button in the cluster fires on
        touchstart because a swing that waits for a click is a swing that lands
        late, and none of that applies to opening a dialog. A click also cannot
        deliver a ghost tap into the panel it just opened. */}
    {isMobile.current && isFighting && (
      <button
        style={{ ...railStyle("graphics", rail, lefty, soloEnd), touchAction: "none" }}
        onClick={() => setGfxOpen(true)}
        aria-label="Graphics quality"
        className="absolute z-30 w-[48px] h-[48px] rounded-lg bg-stone-900/90 active:bg-stone-600 text-amber-100 border border-amber-700/70 flex flex-col items-center justify-center gap-px shadow-lg shadow-black/50">
        <Gauge size={16} />
        <span className="text-[7px] tracking-[0.12em] leading-none text-amber-200/70">QUALITY</span>
      </button>
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
        className="pointer-events-none absolute bottom-3 right-3 z-30 flex items-center gap-1.5 rounded-lg border border-stone-700/70 bg-stone-950/70 px-3 py-2 text-[11px] font-bold tracking-[0.15em] text-[#7d7057] backdrop-blur">
        <KeyRound size={13} />
        <span className="rounded border border-stone-600 px-1 py-px text-[9px] leading-none text-[#d9cdb2]">ESC</span>
        <span>FOR KEYS</span>
      </div>
    ) : (
      // Two controls, one shelf. GRAPHICS is the desktop half of the release
      // valve — the note above keeps saying FOR KEYS on purpose, because that
      // is the wording docs/KEYBINDS.md describes and Escape now frees the
      // cursor for both of them anyway.
      <div className="absolute bottom-3 right-3 z-30 flex items-center gap-2">
        <button
          onClick={() => { document.exitPointerLock?.(); setGfxOpen(true); }}
          aria-label="Graphics quality"
          className="flex items-center gap-1.5 rounded-lg border border-amber-700/70 bg-stone-900/85 px-3 py-2 text-[11px] font-bold tracking-[0.15em] text-amber-200 backdrop-blur transition hover:border-amber-500 hover:text-amber-100">
          <Gauge size={13} /> GRAPHICS
        </button>
        <button
          onClick={() => { document.exitPointerLock?.(); setKeysOpen(true); }}
          aria-label="Key bindings"
          className="flex items-center gap-1.5 rounded-lg border border-amber-700/70 bg-stone-900/85 px-3 py-2 text-[11px] font-bold tracking-[0.15em] text-amber-200 backdrop-blur transition hover:border-amber-500 hover:text-amber-100">
          <KeyRound size={13} /> KEYS
        </button>
      </div>
    ))}

    {keysOpen && <KeyBindingsPanel onClose={() => setKeysOpen(false)} />}
    {gfxOpen && <GraphicsPanel onClose={() => setGfxOpen(false)} />}
    </>
  );
}
