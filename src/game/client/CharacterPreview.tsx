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

const LENS_LABEL: Record<PreviewLens, string> = {
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
const LENS_ORDER: PreviewLens[] = ["face", "bust", "figure", "fight"];

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
}: {
  warriorClass: WarriorClass;
  appearance?: Appearance;
  height?: number | string;
  className?: string;
  focusSlot?: string;
  faceSeed?: number;
  controls?: boolean;
  defaultLens?: PreviewLens;
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

  // Taken apart into its eight fields on purpose. `previewAppearance()` in
  // page.tsx builds a fresh object every render, so anything keyed on the
  // object's identity would re-enter the stage — and therefore rebuild the
  // whole warrior — sixty times a second.
  const {
    helm, hairStyle, hairColor, beardStyle, beardColor, cloak, armorColor, warPaint,
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
  const slotLens: PreviewLens = (focusSlot && SLOT_LENS[focusSlot]) || defaultLens;
  const [pin, setPin] = useState<{ lens: PreviewLens; slot: string } | null>(null);
  const lens: PreviewLens =
    pin && (pin.lens === "fight" || pin.slot === (focusSlot ?? "")) ? pin.lens : slotLens;
  const chooseLens = useCallback(
    (l: PreviewLens) => setPin({ lens: l, slot: focusSlot ?? "" }),
    [focusSlot],
  );

  // ---- mount ----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const stage = createArmouryStage(mount, {
      warriorClass, faceSeed,
      appearance: { helm, hairStyle, hairColor, beardStyle, beardColor, cloak, armorColor, warPaint },
    });
    if (!stage) { setFailed(true); return; }
    stageRef.current = stage;
    const watch = setInterval(() => {
      if (stage.ready) { setLit(true); clearInterval(watch); }
    }, 120);
    return () => { clearInterval(watch); stage.dispose(); stageRef.current = null; };
    // Built once. Every change below is pushed into the live stage rather than
    // remounting it — a remount is a texture library and a PMREM bake.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- loadout ----
  useEffect(() => {
    stageRef.current?.setLoadout({
      warriorClass, faceSeed,
      appearance: { helm, hairStyle, hairColor, beardStyle, beardColor, cloak, armorColor, warPaint },
    });
  }, [warriorClass, faceSeed, helm, hairStyle, hairColor, beardStyle, beardColor,
      cloak, armorColor, warPaint]);

  useEffect(() => { stageRef.current?.setLens(lens); }, [lens]);

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

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-stone-100/10 bg-stone-950 px-4 text-center text-xs text-stone-500 ${className}`}
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
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          style={{ touchAction: "pan-y" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        {!lit && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="animate-pulse text-[9px] font-bold tracking-[0.22em] text-amber-200/60">
              LIGHTING THE HALL…
            </span>
          </div>
        )}
        {/* A drag hint that goes away the first time it is obeyed. */}
        {controls && lit && !touched && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <span className="rounded-full bg-black/65 px-3 py-1 text-[9px] font-bold tracking-[0.18em] text-amber-200/85">
              DRAG TO TURN HIM
            </span>
          </div>
        )}
        {controls && lens === "fight" && (
          <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent px-3 pb-4 pt-2">
            <span className="text-[9px] font-bold leading-tight tracking-[0.12em] text-amber-200/85">
              {FIGHT_NOTE}
            </span>
          </div>
        )}
      </div>

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
                  : "border-stone-100/10 bg-black/40 text-stone-400 hover:text-stone-200"
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
