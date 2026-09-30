"use client";

// ============================================================
// lobbyParts.tsx — the lobby's class chooser and stat bars, the round picker, the link pill, and
// the small layout atoms (`Section`, `CtrlRow`, `Tip`) the setup screens share.
//
// MOVED, NOT REWRITTEN. The F0 scaffold of the UI overhaul lifted these declarations out of the
// foot of `src/app/page.tsx`, below `Page()`, byte for byte: the only edits are the `export`
// keywords and the re-pointed relative imports. The commit that made the move records the
// before/after frame comparison that shows nothing on screen changed.
//
// Contains: WarriorPanel, BAR_COLOUR, ClassGrid, RoundPicker, LinkPill, StatBar,
// Section, CtrlRow, Tip.
// Owner: UNIT L. Ownership is by component name (`shared.ts` lists the unit letters), so no other
// unit edits this file; a change that has to touch a neighbour's component goes through that unit.
// ============================================================

import React from "react";
import { Shirt, RadioTower } from "lucide-react";
import type { WarriorClass, BestOf } from "../../game/types";
import { WARRIOR_STATS, ABILITY_LORE, ROUND_OPTIONS } from "../../game/types";
// The four bars on the class card, and — the point of the module — the ONE
// place their maxima come from, which is the roster itself. See the header of
// `statshape.mjs` for the two warriors this screen used to draw identically.
import { cardBars, type StatAxis } from "@/game/statshape.mjs";
import { type Appearance } from "../../game/client/characters";
import { CharacterPreview, WARRIOR_INFO } from "./shared";
// UNIT:L glyphs — an empty module today; turn this line into a named import in place.
import "../glyphs/lobby";

// The lobby and the muster show the identical "this is you" block. Shared so
// the two cannot drift apart, since they are the same promise made twice.
export function WarriorPanel({ warriorClass, appearance, name, note, onCustomise, stack, arms }: {
  warriorClass: WarriorClass; appearance: Appearance; name: string;
  note: string; onCustomise: () => void;
  /** THE ARMS (7.7b): what the mannequin holds — the server's own value. */
  arms?: string;
  /**
   * Keep the mannequin above the words at every width instead of turning to a
   * row at `sm`. For the lobby's 23rem rail, where a 42% stage is about 9rem
   * across and the warrior in it stops being legible as a warrior — the panel
   * exists to show a player what everyone else will see of him, and a figure
   * too small to read defeats the only thing it is for.
   */
  stack?: boolean;
}) {
  const row = stack ? "" : "sm:flex-row sm:gap-6";
  const col = stack ? "" : "sm:items-start sm:text-left";
  return (
    <div className={`card card-noble card-glow flex flex-col items-center gap-4 p-5 sm:p-6 ${row}`}>
      <div className={`w-full ${stack ? "" : "sm:w-[42%] sm:shrink-0"}`}>
        <CharacterPreview warriorClass={warriorClass} appearance={appearance} arms={arms} height={stack ? 260 : 210} />
      </div>
      <div className={`flex min-w-0 flex-1 flex-col items-center gap-2 text-center ${col}`}>
        <div className="label-overline">YOUR WARRIOR</div>
        <div className="font-display truncate text-2xl text-amber-100">{name}</div>
        <div className="text-sm capitalize text-[var(--ink)]">{warriorClass}</div>
        <div className="text-[10px] font-bold tracking-[0.15em] text-purple-300">
          ABILITY — {WARRIOR_STATS[warriorClass].ability}
        </div>
        <div className="max-w-[30ch] text-[11px] leading-snug text-[var(--ink-soft)]">
          {ABILITY_LORE[warriorClass]}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--ink-dim)]">{note}</p>
        <button onClick={onCustomise} className="btn-primary mt-2 !min-h-[2.75rem] !px-5 !text-sm">
          <Shirt size={15} /> CUSTOMISE
        </button>
      </div>
    </div>
  );
}

/**
 * Colour per axis. This is the only thing about a stat bar that is a decision
 * rather than a measurement, so it is the only thing left in this file.
 */
const BAR_COLOUR: Record<StatAxis, string> = {
  HEALTH: "bg-emerald-500",
  SPEED: "bg-sky-400",
  DAMAGE: "bg-red-500",
  DEFENCE: "bg-amber-400",
};

export function ClassGrid({ selected, onSelect, compact }: {
  selected: WarriorClass | undefined; onSelect: (c: WarriorClass) => void;
  /**
   * Stay two-up at every width. The four-across row is right when this grid
   * owns the page; inside the lobby's 23rem rail it would give each warrior
   * about 5rem, which is narrower than the longest name on the roster and would
   * set every stat bar to a stub. A card that cannot be read is not a chooser.
   * (That name was "RUNEKEEPER" when this was written and is "BERSERKER" now —
   * the measurement is the LONGEST label, not any one word, so it is written
   * that way rather than left naming a string that has since changed.)
   */
  compact?: boolean;
}) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${compact ? "" : "lg:grid-cols-4"}`}>
      {WARRIOR_INFO.map((w) => {
        const stats = WARRIOR_STATS[w.id];
        // `data-cls` rides on the card for the harnesses. `tools/cardgate.mjs`
        // used to find these buttons by their DISPLAY text and died the day
        // "RUNEKEEPER" became "WRECCA" — a name a player reads is allowed to
        // change, an id on the wire is not, so the id is what a ruler holds.
        const isSel = selected === w.id;
        const WIcon = w.Icon;
        return (
          <button key={w.id} data-cls={w.id} onClick={() => onSelect(w.id)}
            className={`card card-interactive flex flex-col p-3.5 text-left sm:p-4 ${isSel ? "card-selected" : ""}`}>
            <div className={`medallion mb-3 ${isSel ? "!border-amber-500 !text-amber-300" : ""}`}><WIcon size={17} /></div>
            <div className="font-display text-sm tracking-wider text-amber-100">{w.name}</div>
            <div className="mt-1 text-[10px] leading-snug text-[var(--ink-dim)]">{w.desc}</div>
            {/*
              FOUR BARS, NO CEILINGS TYPED IN. Every maximum is `Math.max` over
              the roster being drawn (`cardBars`), so the leader on each axis
              fills his bar exactly and nobody overflows. The four numbers that
              used to sit here — 150, 100, 84, 80 — were the roster's maxima on
              the day they were written and two of them were stale after the
              class rework: 158 health clamped at 150, and a 5.6 stride and a
              5.0 stride BOTH clamped at 100, so the runekeeper and the warden
              drew the same full speed bar while SPEED is what the runekeeper is
              for. Colour is the only thing this file still decides.
            */}
            <div className="mt-3 flex flex-col gap-1.5">
              {cardBars(WARRIOR_STATS, w.id).map((b) => (
                <StatBar key={b.axis} label={b.label} frac={b.frac} text={b.text} cls={BAR_COLOUR[b.axis]} />
              ))}
            </div>
            <div className="mt-3 text-[9px] font-bold tracking-[0.15em] text-purple-300">{stats.ability}</div>
            <div className="mt-1 text-[10px] leading-snug text-[var(--ink-dim)]">{ABILITY_LORE[w.id]}</div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------- rounds ----------------

export function RoundPicker({ value, onChange }: { value: BestOf; onChange: (n: BestOf) => void }) {
  return (
    <div className="seg" role="group" aria-label="Rounds in the match">
      {ROUND_OPTIONS.map((n) => (
        <button key={n} onClick={() => onChange(n)} aria-pressed={value === n}
          className={`seg-item flex-col gap-0.5 ${value === n ? "seg-item-active" : ""}`}>
          <span className="text-lg leading-none">{n}</span>
          <span className="text-[8.5px] font-bold leading-none tracking-[0.18em] opacity-80">
            {n === 1 ? "ROUND" : "ROUNDS"}
          </span>
        </button>
      ))}
    </div>
  );
}

export function LinkPill({ mode }: { mode: "ws" | "http" | null }) {
  if (!mode) return null;
  return (
    <div className="badge-sky !text-[9px] !px-2.5 !py-1 flex items-center gap-1.5">
      <RadioTower size={10} />
      <span className="tracking-[0.15em] font-bold">{mode === "ws" ? "WAR-LINK: LIGHTNING" : "WAR-LINK: HORN"}</span>
    </div>
  );
}

/**
 * One bar on a class card.
 *
 * It takes a FRACTION, not a value and a ceiling, and that is the whole repair.
 * The old signature was `(value, max)` with the maxima written into the four
 * call sites, and it defended itself with `Math.min(100, ...)` — which is how a
 * stale ceiling stopped being a bar drawn past its track (obvious, fixed in an
 * afternoon) and became two different warriors drawn identically (invisible,
 * shipped for a release). There is nothing to clamp now: `cardBars` divides by
 * the roster's own maximum, so `frac` is in [0, 1] by construction and the
 * leader on each axis is the man whose bar is full.
 */
function StatBar({ label, frac, text, cls }: { label: string; frac: number; text: string; cls: string }) {
  return (
    <div className="flex items-center gap-1.5" title={`${label} — ${text}`}>
      <span className="text-[8px] text-[var(--ink-faint)] w-6 font-bold">{label}</span>
      <div className="flex-1 h-1.5 bg-stone-700/80 rounded-full overflow-hidden"
        role="img" aria-label={`${label}, ${text}`}>
        <div className={`h-full ${cls} rounded-full`} style={{ width: `${frac * 100}%` }} />
      </div>
    </div>
  );
}

export function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card px-5 py-4 sm:px-6 sm:py-5">
      <div className="section-title !text-amber-300 mb-3">{icon} {title}</div>
      {children}
    </div>
  );
}

export function CtrlRow({ k, d }: { k: string; d: string }) {
  return (
    <div className="ctrl-row">
      <span className="kbd">{k}</span>
      <span className="text-[13px] text-[var(--ink)]/90 leading-snug">{d}</span>
    </div>
  );
}

export function Tip({ text }: { text: string }) {
  return <div className="tip-row">{text}</div>;
}
