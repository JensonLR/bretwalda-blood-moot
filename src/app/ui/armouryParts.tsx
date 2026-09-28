"use client";

// ============================================================
// armouryParts.tsx — the armoury's card, its thumbnail hook, and the bill for the piece on the
// mannequin.
//
// MOVED, NOT REWRITTEN. The F0 scaffold of the UI overhaul lifted these declarations out of the
// foot of `src/app/page.tsx`, below `Page()`, byte for byte: the only edits are the `export`
// keywords and the re-pointed relative imports. The commit that made the move records the
// before/after frame comparison that shows nothing on screen changed.
//
// Contains: useCosmeticThumb, costTier, CosmeticCard, StagedBill.
// Owner: UNIT A. Ownership is by component name (`shared.ts` lists the unit letters), so no other
// unit edits this file; a change that has to touch a neighbour's component goes through that unit.
// ============================================================

import { useState, useEffect } from "react";
import { ArrowLeft, Check, Lock, Coins } from "lucide-react";
import type { WarriorClass } from "../../game/types";
import { type Appearance, type ArmouryOption } from "../../game/client/characters";
// The registry only — a Map, a queue and a set of watchers, with every import
// inside it erased at compile time. The renderer that fills it lives in
// `armouryStage.ts` and arrives with the dynamically imported preview, so the
// landing screen does not download a sky shader to draw an empty card frame.
import { requestThumb, watchThumbs, specForOption } from "../../game/client/armouryThumbs";
// UNIT:A glyphs — an empty module today; turn this line into a named import in place.
import "../glyphs/armoury";

// ---------------------------------------------------------------------------
// The armoury's cards
// ---------------------------------------------------------------------------

/**
 * A card's photograph of the thing it sells.
 *
 * Returns the data URL once the stage's forge has drawn it, and null until
 * then. The subscription is one shared watcher per card — `requestThumb` is
 * idempotent and cheap, so calling it on every render is correct and is what
 * makes a card that was mounted before the GL context existed fill itself in
 * when the context arrives.
 */
function useCosmeticThumb(spec: Parameters<typeof requestThumb>[0]): string | null {
  // Every field the picture depends on, flattened so the effect can depend on
  // a value rather than on an object `specForOption` mints fresh each render.
  const a = spec.appearance;
  const key = [
    spec.warriorClass, spec.slot, spec.faceSeed,
    a.helm, a.hairStyle, a.hairColor, a.beardStyle, a.beardColor,
    a.cloak, a.armorColor, a.warPaint,
  ].join("|");
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const ask = () => {
      const got = requestThumb(spec);
      if (got && alive) setUrl(got);
      return got;
    };
    if (ask()) return () => { alive = false; };
    // The forge publishes under its OWN cache key, which is deliberately
    // narrower than this one — a cloak cannot change a portrait — so a card
    // re-asks on every publish rather than matching keys. Ten cards times ten
    // publishes is a hundred map lookups, once, per slot opened.
    const stop = watchThumbs(() => { ask(); });
    // And a poll, because the cards paint before the GL context exists: the
    // preview is behind `next/dynamic`, so on the first frame of this screen
    // there is no forge to queue against and nothing will ever publish.
    const retry = setInterval(ask, 400);
    return () => { alive = false; stop(); clearInterval(retry); };
    // `spec` is `key` in object form; depending on both would rebuild the
    // subscription on every render for no change in what is being asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

/**
 * How loud a card is, by what it costs.
 *
 * The owner's read: "nothing distinguishes a 30-gold item from a 2400-gold
 * one." A ladder that all looks the same is not a ladder — and the top of this
 * one is a single item at 2400 gold, which the pricing comment in `ARMOURY`
 * calls "a season's goal rather than a purchase". It gets a setting to match.
 */
function costTier(cost: number): { ring: string; label: string; labelCls: string } {
  if (cost === 0) return { ring: "border-stone-100/12", label: "FREE", labelCls: "text-[var(--ink-dim)]" };
  if (cost < 100) return { ring: "border-stone-100/15", label: "", labelCls: "" };
  if (cost < 400) return { ring: "border-amber-800/50", label: "", labelCls: "" };
  if (cost < 1000) return { ring: "border-amber-600/60", label: "WAR-GEAR", labelCls: "text-amber-500/90" };
  return { ring: "border-yellow-500/70", label: "A JARL'S PRICE", labelCls: "text-yellow-400" };
}

export function CosmeticCard({
  opt, owned, equipped, staged, slotStaged, affordable, cls, faceSeed, base, onPick,
}: {
  opt: ArmouryOption;
  /** True of what the PROFILE wears, whatever is on the mannequin. A shop that
   *  hides what you already own the moment you try something else on is a shop
   *  you cannot back out of. */
  equipped: boolean;
  /** True of the option currently on the mannequin. */
  staged: boolean;
  /** True when ANY option in this slot is staged — so the equipped one can
   *  keep its badge while losing the selection ring. */
  slotStaged: boolean;
  owned: boolean; affordable: boolean;
  cls: WarriorClass; faceSeed: number; base: Appearance;
  onPick: () => void;
}) {
  const spec = specForOption(cls, faceSeed, base, opt.slot, opt.value);
  const thumb = useCosmeticThumb(spec);
  const tier = costTier(opt.cost);
  const swatch = typeof opt.value === "number"
    ? `#${opt.value.toString(16).padStart(6, "0")}`
    : null;

  // The card's own name, spelled out rather than left to be scraped off the
  // badges and the price row. Two reasons, and the second one cost a gate:
  //
  //   - a screen reader reading "EQUIPPED Bare Head IN YOUR KIT" is reading a
  //     layout, not an item;
  //   - `tools/cheattest.mjs` finds the buy button with
  //     `getByRole("button", { name: /EQUIP/ })`, and a card whose accessible
  //     name began "EQUIPPED" matched it FIRST. The run clicked a helmet
  //     instead of the till, no purchase was attempted, no refusal banner
  //     appeared, and the assertion that the shop refuses a doctored purse
  //     failed with `null`. The economy was never at risk — the row was
  //     untouched — but the gate could not see that, which is the same thing.
  //     "Worn" carries the meaning without carrying the substring.
  const label = [
    opt.label,
    owned ? "in your kit" : opt.cost === 0 ? "free" : `${opt.cost} gold`,
    equipped ? "worn now" : null,
    staged ? "on the mannequin" : null,
    !owned && !affordable ? "not enough gold" : null,
  ].filter(Boolean).join(" — ");

  return (
    <button
      onClick={onPick}
      aria-label={label}
      aria-pressed={staged || (equipped && !slotStaged)}
      className={`card card-interactive flex flex-col overflow-hidden !p-0 text-left ${
        staged || (equipped && !slotStaged) ? "card-selected" : tier.ring
      } ${!owned && !affordable ? "opacity-65" : ""}`}
    >
      {/* THE PICTURE. Same materials, same lights, same environment map as the
          mannequin — a card and the stage beside it disagreeing about what an
          item looks like would be worse than a glyph. */}
      <div
        className="relative aspect-square w-full shrink-0 overflow-hidden"
        style={{ background: "radial-gradient(80% 70% at 50% 82%, #1b1013 0%, #07070a 72%)" }}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : swatch ? (
          // A colour has no silhouette by construction — the audit says so of
          // all twelve hair and beard colours — so its card is honestly a
          // swatch while the head behind it renders.
          <div className="flex h-full w-full items-center justify-center">
            <span className="h-1/2 w-1/2 rounded-full border-2 border-stone-500/70 shadow-inner"
              style={{ backgroundColor: swatch }} />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="h-6 w-6 animate-pulse rounded-full bg-stone-100/10" />
          </div>
        )}
        {staged && !equipped ? (
          <span className="absolute left-1 top-1 rounded bg-amber-400/30 px-1.5 py-0.5 text-[7.5px] font-bold tracking-[0.12em] text-amber-200">
            ON HIM
          </span>
        ) : equipped ? (
          <span className="absolute left-1 top-1 rounded bg-amber-500/90 px-1.5 py-0.5 text-[7.5px] font-bold tracking-[0.12em] text-black">
            EQUIPPED
          </span>
        ) : owned ? (
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[7.5px] font-bold tracking-[0.12em] text-[var(--ink)]">
            OWNED
          </span>
        ) : null}
        {!owned && !affordable && (
          <span className="absolute right-1 top-1 rounded bg-black/75 p-1 text-[var(--ink-dim)]">
            <Lock size={10} />
          </span>
        )}
      </div>

      {/* THE FACTS. Name, price, and what it is — a card that says only
          "Owned — tap to preview" tells a player nothing he can spend on. */}
      <div className="flex min-h-[4.25rem] flex-1 flex-col gap-1 p-2">
        <div className="line-clamp-2 text-[11.5px] font-bold leading-tight text-[var(--ink-bright)]">{opt.label}</div>
        <div className="mt-auto flex items-center justify-between gap-1">
          {owned ? (
            <span className="text-[9.5px] font-bold tracking-[0.1em] text-emerald-400/90">IN YOUR KIT</span>
          ) : (
            <span className={`flex items-center gap-1 text-[11px] font-bold ${affordable ? "text-yellow-400" : "text-[var(--ink-faint)]"}`}>
              <Coins size={11} /> {opt.cost}
            </span>
          )}
          {tier.label && !owned && (
            <span className={`shrink-0 text-[7px] font-bold tracking-[0.12em] ${tier.labelCls}`}>{tier.label}</span>
          )}
        </div>
      </div>
    </button>
  );
}

/** The bill. One component, shown beside the stage on a desktop and in a
 *  fixed bar under the thumb on a phone. */
export function StagedBill({ cost, gold, buying, onBuy, onClear }: {
  cost: number; gold: number; buying: boolean; onBuy: () => void; onClear: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[34rem] flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] tracking-widest text-[var(--ink-dim)]">COST TO UNLOCK</div>
        <div className={`flex items-center gap-1.5 text-lg font-bold ${gold >= cost ? "text-yellow-400" : "text-red-400"}`}>
          <Coins size={14} /> {cost}
        </div>
      </div>
      <div className="flex gap-2.5">
        <button onClick={onBuy} disabled={buying} className="btn-primary flex-1 !min-h-[3rem] !text-sm">
          {buying ? "ASKING THE ROLLS…" : <><Check size={15} /> EQUIP{cost > 0 ? " & BUY" : ""}</>}
        </button>
        <button onClick={onClear} aria-label="Discard try-on" className="btn-ghost !px-4">
          <ArrowLeft size={15} />
        </button>
      </div>
    </div>
  );
}
