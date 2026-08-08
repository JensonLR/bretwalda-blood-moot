"use client";

/* ==========================================================================
   THE FACTION MAP — Britain, c. 878

   Four peoples, four fields, one island. The coastline is real data and its
   provenance is documented in `britain.ts`; this file is only the control
   built on top of it.

   It is a CONTROL and not a picture, which is the point of it. Selecting a
   faction lights its ground; every territory is a radio in a radiogroup, so
   it answers to arrow keys and a screen reader as readily as to a thumb.
   The legend beside it is a second way to reach the same value — Kernow is
   a fingernail wide on a 390px phone, and no interface should require
   hitting Cornwall exactly.
   ========================================================================== */

import React, { useCallback, useId, useMemo, useRef, useState } from "react";
import {
  LAND, NEIGHBOUR, MAP_W, MAP_H,
  CLIP_NORSE, CLIP_BRITON, CLIP_PICT, CLIP_DALRIATA,
  WATLING_STREET, SEATS, LABEL_AT,
} from "./britain";

export type FactionId = "saxon" | "norse" | "briton" | "pict";

interface Faction {
  readonly id: FactionId;
  /** What the legend and the screen reader call them. */
  readonly name: string;
  /** What they called their own ground. */
  readonly ground: string;
  readonly seat: string;
  /** One line, because a faction picker is not a history lesson. */
  readonly note: string;
  /** Palette tokens from globals.css. Nothing here is a fresh colour. */
  readonly field: string;
  readonly lit: string;
  /** The clip shapes for their ground; empty means "whatever is left over". */
  readonly clips: readonly string[];
}

/* Order is the order the arrow keys walk, and it runs south to north the way
   the island does — Wessex, the Danelaw, the west, then the far north. */
export const FACTIONS: readonly Faction[] = [
  {
    id: "saxon",
    name: "Anglo-Saxons",
    ground: "Wessex, English Mercia and Bernicia",
    seat: "Winchester",
    note: "Alfred's Wessex, the Mercia the Danes did not take, and Northumbria above the Tees.",
    field: "var(--gilt)",
    lit: "var(--gilt-lit)",
    clips: [],
  },
  {
    id: "norse",
    name: "Norse",
    ground: "The Danelaw",
    seat: "Jorvik",
    note: "North-east of Watling Street: Danish Mercia, Guthrum's East Anglia and the kingdom of York.",
    field: "var(--garnet)",
    lit: "var(--garnet-lit)",
    clips: CLIP_NORSE,
  },
  {
    id: "briton",
    name: "Britons",
    ground: "Cymru, Kernow and Ystrad Clud",
    seat: "Tintagel",
    note: "The people who were already here, holding the west: Wales, Cornwall and Strathclyde.",
    field: "var(--moss)",
    lit: "var(--moss-lit)",
    clips: CLIP_BRITON,
  },
  {
    id: "pict",
    name: "Picts",
    ground: "Fortriu",
    seat: "Burghead",
    note: "North of the Forth-Clyde line. Symbol stones, no surviving language, and not the Scots.",
    field: "var(--woad)",
    lit: "var(--woad-lit)",
    clips: CLIP_PICT,
  },
];

const ORDER: readonly FactionId[] = FACTIONS.map((f) => f.id);

export interface FactionMapProps {
  /** Controlled selection. Leave undefined to let the map hold its own. */
  value?: FactionId | null;
  onSelect?: (id: FactionId) => void;
  className?: string;
}

export default function FactionMap({ value, onSelect, className }: FactionMapProps) {
  const uid = useId().replace(/:/g, "");
  const [ownValue, setOwnValue] = useState<FactionId | null>(null);
  const [hover, setHover] = useState<FactionId | null>(null);
  const [focused, setFocused] = useState<FactionId | null>(null);
  const regions = useRef(new Map<FactionId, SVGPathElement | null>());

  const selected = value === undefined ? ownValue : value;

  const choose = useCallback((id: FactionId) => {
    if (value === undefined) setOwnValue(id);
    onSelect?.(id);
  }, [value, onSelect]);

  /* One faction at a time is "live": what the pointer is over, else what the
     keyboard is on, else what is chosen. Hover outranks selection so that
     pointing at a rival shows you their ground without losing yours. */
  const live: FactionId | null = hover ?? focused ?? selected;
  const liveFaction = useMemo(
    () => FACTIONS.find((f) => f.id === live) ?? null,
    [live],
  );

  /* Roving tabindex: the group is ONE tab stop, and the arrows move inside
     it. A radiogroup that puts four stops in the tab order is the classic
     way to make a keyboard user hate a form. */
  const rove = useCallback((from: FactionId, step: number) => {
    const next = ORDER[(ORDER.indexOf(from) + step + ORDER.length) % ORDER.length];
    choose(next);
    regions.current.get(next)?.focus();
  }, [choose]);

  const onKeyDown = useCallback((e: React.KeyboardEvent, id: FactionId) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); rove(id, 1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); rove(id, -1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(id); }
  }, [rove, choose]);

  /* The tab stop sits on the chosen faction, or the first one if none is. */
  const tabStop = selected ?? ORDER[0];

  const stateOf = (id: FactionId) =>
    id === selected ? "sel" : id === live ? "live" : selected ? "dim" : "rest";

  return (
    <div className={`faction-map${className ? ` ${className}` : ""}`}>
      {/* ------------------------------------------------------------ map */}
      <div className="faction-map-plate">
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className="faction-map-svg"
          role="radiogroup"
          aria-label="Choose a faction by its territory in Britain, c. 878"
        >
          <defs>
            <clipPath id={`${uid}-land`}>
              <path d={LAND} />
            </clipPath>
            {/* One filter, used by one element at a time. A blur over a
                1600-point path on every territory would cost more than the
                whole screen is worth. */}
            <filter id={`${uid}-glow`} x="-12%" y="-12%" width="124%" height="124%">
              <feGaussianBlur stdDeviation="7" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Ireland, drawn dead. No faction on this map held it, and Britain
              does not read as Britain floating on its own. */}
          <path d={NEIGHBOUR} className="fm-neighbour" />

          {/* The Anglo-Saxon field IS the island: painted whole, then the
              other three laid over it. That is why there are no seams. */}
          <path d={LAND} className="fm-field" data-state={stateOf("saxon")}
                style={{ fill: FACTIONS[0].field }} />

          <g clipPath={`url(#${uid}-land)`}>
            {FACTIONS.slice(1).map((f) => (
              <path
                key={f.id}
                d={f.clips.join("")}
                className="fm-field"
                data-state={stateOf(f.id)}
                style={{ fill: f.field }}
              />
            ))}

            {/* Dal Riata: outlined, never filled. The Gaels held Argyll and
                are the fifth faction this game does not have yet. */}
            <path d={CLIP_DALRIATA.join("")} className="fm-dalriata" />

            {/* The live territory gets its own coast picked out in its lit
                hue — this is what "lights up" actually means. */}
            {liveFaction && liveFaction.clips.length > 0 && (
              <path
                d={liveFaction.clips.join("")}
                className="fm-edge"
                style={{ stroke: liveFaction.lit }}
                filter={live === selected ? `url(#${uid}-glow)` : undefined}
              />
            )}
          </g>

          {/* Watling Street, shown when the Danelaw is live, because the
              border IS the treaty and it is worth seeing. */}
          <path d={WATLING_STREET} className="fm-watling"
                data-on={live === "norse" ? "yes" : "no"} />

          {/* The real coastline, hairlined over everything, so the fills
              never look like they are bleeding past the shore. */}
          <path d={LAND} className="fm-coast" />

          {/* The seat of the live faction. */}
          {liveFaction && (
            <g className="fm-seat" style={{ color: liveFaction.lit }}>
              <circle cx={SEATS[liveFaction.id].x} cy={SEATS[liveFaction.id].y}
                      r="17" className="fm-seat-ring" />
              <circle cx={SEATS[liveFaction.id].x} cy={SEATS[liveFaction.id].y}
                      r="6.5" className="fm-seat-dot" />
              <text x={SEATS[liveFaction.id].x + 24} y={SEATS[liveFaction.id].y + 8}
                    className="fm-seat-name">
                {liveFaction.seat.toUpperCase()}
              </text>
            </g>
          )}

          {/* The live territory's name. Only one at a time: four labels on a
              390px screen is a wall of text over a coastline. */}
          {liveFaction && (
            <text
              x={LABEL_AT[liveFaction.id].x}
              y={LABEL_AT[liveFaction.id].y}
              className="fm-label"
            >
              {liveFaction.name.toUpperCase()}
            </text>
          )}
          {live === "pict" && (
            <text x={LABEL_AT.dalriata.x} y={LABEL_AT.dalriata.y} className="fm-label-small">
              DAL RIATA
            </text>
          )}

          {/* ---- hit layer -------------------------------------------------
              Transparent, and last, so it is on top of every fill. The Saxon
              target is the whole island and sits UNDER the other three, which
              is how "everything not taken by the others" becomes clickable
              without a fifth shape needing to exist. */}
          <g clipPath={`url(#${uid}-land)`}>
            {[FACTIONS[0], ...FACTIONS.slice(1)].map((f) => (
              <path
                key={f.id}
                ref={(el) => { regions.current.set(f.id, el); }}
                d={f.clips.length ? f.clips.join("") : LAND}
                className="fm-hit"
                role="radio"
                aria-checked={selected === f.id}
                aria-label={`${f.name}. ${f.ground}. Seat: ${f.seat}.`}
                tabIndex={tabStop === f.id ? 0 : -1}
                onClick={() => choose(f.id)}
                onKeyDown={(e) => onKeyDown(e, f.id)}
                onPointerEnter={() => setHover(f.id)}
                onPointerLeave={() => setHover((h) => (h === f.id ? null : h))}
                onFocus={() => setFocused(f.id)}
                onBlur={() => setFocused((x) => (x === f.id ? null : x))}
              />
            ))}
          </g>
        </svg>
      </div>

      {/* --------------------------------------------------------- legend */}
      <div className="faction-map-legend">
        <div className="section-title">Four peoples, c. 878</div>
        <ul className="fm-list">
          {FACTIONS.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className={`card card-interactive fm-row${selected === f.id ? " card-selected" : ""}`}
                aria-pressed={selected === f.id}
                onClick={() => choose(f.id)}
                onPointerEnter={() => setHover(f.id)}
                onPointerLeave={() => setHover((h) => (h === f.id ? null : h))}
                onFocus={() => setHover(f.id)}
                onBlur={() => setHover((h) => (h === f.id ? null : h))}
              >
                <span className="fm-swatch" style={{ background: f.field, borderColor: f.lit }} />
                <span className="fm-row-text">
                  <span className="fm-row-name">{f.name}</span>
                  <span className="fm-row-ground">{f.ground}</span>
                  <span className="fm-row-note">{f.note}</span>
                </span>
                <span className="fm-row-seat">
                  <span className="cabochon" />
                  {f.seat}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <p className="fm-foot">
          <strong>Dal Riata</strong> — the Gaelic Scots of Argyll, outlined on the
          map — are the fifth faction sitting there unbuilt. They merged with the
          Picts into Alba around 900, which is why this map is dated before it.
        </p>
        <p className="fm-credit">
          Coastline: Natural Earth 1:10m, public domain. Frontiers are approximate.
        </p>
      </div>
    </div>
  );
}
