// The armoury's try-on window.
//
// This file used to be the whole preview: it built a warrior with no material
// library at all, lit him with a 1.1 ambient and stood him in nothing.
// `docs/COSMETICS-AUDIT.md` §4 ranks that the third worst thing in the game and
// says why in one line — "this is the screen the owner judged, and it is
// showing worse than the game has."
//
// The rendering now lives in `armouryStage.ts`, which uses the game's own
// renderer, materials, env map and animator. What is left here is the part
// that is genuinely a component: mounting, the drag turntable, the lens
// controls, and telling a player what he is looking at.
"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { WarriorClass } from "../types";
import { type Appearance, defaultAppearance } from "./characters";
import { createArmouryStage, type StageHandle } from "./armouryStage";
import { SLOT_LENS, type PreviewLens } from "./armouryThumbs";

/** How many radians a full drag across the panel turns him. */
const DRAG_TURN = 3.4;
/** One press of an arrow key: about 12 degrees, so a full turn is thirty presses and no key is a jump. */
const KEY_TURN = 0.21;

/** The names the class picker shows, for the panel's accessible description. */
const CLASS_NAME: Record<WarriorClass, string> = {
  huscarl: "Huscarl", warden: "Weard", runekeeper: "Wrecca", berserker: "Berserker",
};

// "item" is excluded on purpose: it is the weapon CARD's lens — an object
// photographed alone — and has no meaning as a stance for the live mannequin,
// so it gets no button.
const LENS_LABEL: Record<Exclude<PreviewLens, "item">, string> = {
  face: "PORTRAIT",
  bust: "SHOULDERS",
  figure: "FULL KIT",
  fight: "FIGHT RANGE",
};

/**
 * What the fight lens is actually telling the player, in his own words.
 * The audit's finding is that seven helmets are the same 20 px grey dome at
 * this range; a shop that only shows the 400 px portrait is selling a lie, and
 * the caption has to say what the picture is of or it reads as a bug.
 */
const FIGHT_NOTE = "SEVEN METRES — the range you fight at, at this screen's own scale";

/** The four lenses, in order. Fixed, so it is not rebuilt every render. */
const LENS_ORDER: Exclude<PreviewLens, "item">[] = ["face", "bust", "figure", "fight"];

export default function CharacterPreview({
  warriorClass,
  appearance,
  height = 240,
  className = "",
  /** Which armoury slot is open. Decides the crop; see `SLOT_LENS`. */
  focusSlot,
  /** The player's own profile id, so the face in the shop is his face. */
  faceSeed = 0,
  /** Show the lens strip and the drag hint. Off for the small class-picker use. */
  controls = false,
  /**
   * The crop to open on when no armoury slot is driving it — the lobby's
   * "this is you" panel wants the whole man and his weapon, not a head crop.
   */
  defaultLens = "figure",
  /**
   * A fixed turntable bearing, overriding whatever the lens and slot resolve
   * to. The oath's livery mirror uses it for a chosen three-quarter, not as a
   * correction: since `SLOT_BEARING` landed, every window that is not selling
   * something worn on the back already opens facing the player.
   */
  turn,
  /** THE ARMS (7.7b): what the mannequin holds. Absent = class default. */
  arms,
}: {
  warriorClass: WarriorClass;
  appearance?: Appearance;
  arms?: string;
  height?: number | string;
  className?: string;
  focusSlot?: string;
  faceSeed?: number;
  controls?: boolean;
  defaultLens?: PreviewLens;
  turn?: number;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<StageHandle | null>(null);
  const [failed, setFailed] = useState(false);
  const [touched, setTouched] = useState(false);
  /**
   * False until the stage has put a frame on screen.
   *
   * Opening the armoury costs a GL context, twenty procedurally generated PBR
   * map sets and a PMREM bake before anything can be drawn — the same work
   * `GameCanvas` puts a progress bar in front of. Without a word on the panel
   * that is a black rectangle for a beat, and a black rectangle is what the
   * owner's screenshot was of.
   */
  const [lit, setLit] = useState(false);

  // Taken apart into its fields on purpose. `previewAppearance()` in
  // page.tsx builds a fresh object every render, so anything keyed on the
  // object's identity would re-enter the stage — and therefore rebuild the
  // whole warrior — sixty times a second.
  //
  // ALL TEN FIELDS, and the two late ones are recorded defects: this list was
  // written at eight and never learned `weapon` (so the mannequin held the
  // issued steel whatever finish the player had bought — the shop's own
  // preview lying about the shop) or `people` (so the oath screen could not
  // show a man in the kingdom's livery he was about to swear into).
  const {
    helm, hairStyle, hairColor, beardStyle, beardColor, cloak, armorColor, warPaint,
    weapon, people,
  } = appearance ?? defaultAppearance(warriorClass);

  // ---- which lens is showing ----
  //
  // Derived, never assigned from an effect. The crop follows the open slot —
  // a helm is a portrait, a cloak is a full figure — until the player picks
  // one himself, and his pick then survives until he opens a different slot.
  // FIGHT DISTANCE is the exception and survives everything: a player who has
  // asked to see the item at the range he fights at has asked a question, and
  // silently answering a different one on the next tab is how the shop got
  // accused of hiding things in the first place.
  // "item" is the weapon CARD's lens; the live mannequin shows the man with
  // the weapon in his hand instead, which is the figure.
  const rawLens: PreviewLens = (focusSlot && SLOT_LENS[focusSlot]) || defaultLens;
  const slotLens: Exclude<PreviewLens, "item"> = rawLens === "item" ? "figure" : rawLens;
  const [pin, setPin] = useState<{ lens: Exclude<PreviewLens, "item">; slot: string } | null>(null);
  const lens: Exclude<PreviewLens, "item"> =
    pin && (pin.lens === "fight" || pin.slot === (focusSlot ?? "")) ? pin.lens : slotLens;
  const chooseLens = useCallback(
    (l: Exclude<PreviewLens, "item">) => setPin({ lens: l, slot: focusSlot ?? "" }),
    [focusSlot],
  );

  // ---- mount ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const stage = createArmouryStage(mount, {
      warriorClass, faceSeed, arms,
      appearance: { helm, hairStyle, hairColor, beardStyle, beardColor, cloak, armorColor, warPaint, weapon, people },
    });
    if (!stage) { setFailed(true); return; }
    stageRef.current = stage;
    // `settled` and not `ready`: `ready` flips on the first frame drawn, which
    // can be a frame before the lens effect below has reframed it and a frame
    // before the authored man has been checked, and a canvas faded in on it shows
    // the wrong crop for one frame (UI-PLAN D18: "`lit` flips before the lens
    // settles"). The 15 s fallback is so a stage that never settles (a hidden
    // tab pauses its frames) is not a panel that never appears.
    const born = performance.now();
    const watch = setInterval(() => {
      if (stage.settled || performance.now() - born > 15000) { setLit(true); clearInterval(watch); }
    }, 120);
    return () => { clearInterval(watch); stage.dispose(); stageRef.current = null; };
    // Built once. Every change below is pushed into the live stage rather than
    // remounting it — a remount is a texture library and a PMREM bake.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- loadout ----
  useEffect(() => {
    stageRef.current?.setLoadout({
      warriorClass, faceSeed, arms,
      appearance: { helm, hairStyle, hairColor, beardStyle, beardColor, cloak, armorColor, warPaint, weapon, people },
    });
  }, [warriorClass, faceSeed, arms, helm, hairStyle, hairColor, beardStyle, beardColor,
      cloak, armorColor, warPaint, weapon, people]);

  // The slot rides with the lens because it decides the BEARING, not the crop:
  // the cloak tab is the one window that wants his back. See `SLOT_BEARING`.
  useEffect(() => { stageRef.current?.setLens(lens, focusSlot); }, [lens, focusSlot]);
  useEffect(() => { if (turn !== undefined) stageRef.current?.setTurn(turn); }, [turn, lit]);

  // ---- the turntable ----
  //
  // Pointer events, not touch events: one code path covers a mouse, a pen and
  // a thumb, and `setPointerCapture` is what keeps a drag alive when the thumb
  // leaves the 320 px panel — which on a phone it does, every time.
  const drag = useRef<{ id: number; x: number } | null>(null);

  const onDown = useCallback((e: React.PointerEvent) => {
    drag.current = { id: e.pointerId, x: e.clientX };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setTouched(true);
  }, []);

  const onMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const w = (e.currentTarget as HTMLElement).clientWidth || 1;
    stageRef.current?.turnBy(((e.clientX - d.x) / w) * DRAG_TURN);
    d.x = e.clientX;
  }, []);

  const onUp = useCallback((e: React.PointerEvent) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already gone */ }
  }, []);

  // The turntable, from the keyboard. A drag is the only way a mouse or a thumb
  // turns him, and a panel a keyboard can focus but not turn is a picture the
  // player cannot inspect (UI-PLAN D18: "`role=img` plus arrow-key turn").
  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    stageRef.current?.turnBy(e.key === "ArrowLeft" ? -KEY_TURN : KEY_TURN);
    setTouched(true);
  }, []);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-stone-100/10 bg-stone-950 px-4 text-center text-xs text-[#7d7057] ${className}`}
        style={{ height }}
      >
        This device could not start 3D graphics, so the armoury cannot show you
        the kit. Everything still equips.
      </div>
    );
  }

  const lensOrder = LENS_ORDER;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div
        className="relative overflow-hidden rounded-xl border border-amber-900/30"
        style={{
          height,
          // The stage renders its own backdrop; this is only what shows in the
          // instant before the first frame lands, and behind the rounded corner.
          background: "radial-gradient(120% 90% at 50% 100%, #2e1a14 0%, #0b0a0d 58%, #05060a 100%)",
          boxShadow: "inset 0 0 40px rgba(0,0,0,0.9)",
        }}
      >
        <div
          ref={mountRef}
          role="img"
          tabIndex={0}
          aria-label={`${CLASS_NAME[warriorClass]}, shown ${LENS_LABEL[lens].toLowerCase()}. Turn him with the left and right arrow keys, or by dragging.`}
          className="absolute inset-0 cursor-grab outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-amber-300/70 active:cursor-grabbing"
          // The canvas is drawn while it is dark and shown once it has settled:
          // the swap to the authored man, the lens reframe and the first frames of
          // a class change happen behind "LIGHTING THE HALL".
          style={{ touchAction: "pan-y", opacity: lit ? 1 : 0, transition: "opacity 220ms ease-out" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
        />
        {!lit && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="animate-pulse text-[9px] font-bold tracking-[0.22em] text-amber-200/60">
              LIGHTING THE HALL…
            </span>
          </div>
        )}
      </div>

      {/* THE CAPTION IS OUT OF THE FRAME. It used to be a pill laid over the
          bottom of the picture (and the fight note a black band over the top of
          it), which put words on the boots and the crest of the thing being
          sold. Under the panel it costs a line and covers nothing. */}
      {controls && (
        <p
          className="min-h-[1.1rem] text-center text-[9px] font-bold leading-tight tracking-[0.14em] text-amber-200/75"
          aria-live="polite"
        >
          {lens === "fight" ? FIGHT_NOTE : touched ? "" : "DRAG OR PRESS ← → TO TURN HIM"}
        </p>
      )}

      {controls && (
        <div className="flex gap-1.5">
          {lensOrder.map((l) => (
            <button
              key={l}
              onClick={() => chooseLens(l)}
              aria-pressed={lens === l}
              className={`min-h-[2.75rem] flex-1 rounded-md border px-1 text-[8.5px] font-bold leading-tight tracking-[0.1em] transition ${
                lens === l
                  ? "border-amber-500/70 bg-amber-500/15 text-amber-200"
                  : "border-stone-100/10 bg-black/40 text-[#a89a7c] hover:text-[#e7dfc9]"
              }`}
            >
              {LENS_LABEL[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
