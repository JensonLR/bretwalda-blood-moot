"use client";

/* ==========================================================================
   THE ROLL OF HONOUR — backlog 4.6's leaderboard, in the war's own voice.

   Fifty seats, season-wide, in the crown's own order — `warRoll` reproduces
   `endSeason`'s tie-break exactly, so the man this table shows first IS the
   man the crown would go to if the season ended now. Each seat carries the
   period title his points have earned on his own people's ladder (Ceorl to
   Ealdorman, Karl to Jarl, Taeog to Arglwydd, Aithech to Mormaer — see
   TITLE_LADDER in `db/war.ts` for the sourcing), because "3rd, 214 points"
   is a scoreboard and "Ealdorman Aethelred, 214 points" is a society.

   READ, NOT OPERATED: no seat is a button, and the panel renders nothing at
   all when the roll is empty — a leaderboard of nobody is not an honest
   empty state, it is furniture. The player's own row is marked so he can
   find himself without counting.
   ========================================================================== */

import React from "react";
import { FIELD, PEOPLE_NAME } from "./territories";

const PEOPLE_CHIPS = ["saxon", "norse", "briton", "pict"] as const;

export interface RollSeat {
  seat: number;
  name: string;
  people: string;
  points: number;
  matches: number;
  title: string | null;
  bretwaldaSeasons: number[];
}

/** What the roll can be asked to rank — backlog 7.6's axes and scopes. */
export interface RollAsk {
  axis: "deeds" | "wins" | "kills" | "honour";
  /** Deeds only: one banner, or null for all four. */
  people: string | null;
  /** Deeds only: the last seven days rather than the whole season. */
  week: boolean;
}

export const ROLL_ASK_DEFAULT: RollAsk = { axis: "deeds", people: null, week: false };

const AXES: ReadonlyArray<{ id: RollAsk["axis"]; label: string; note: string }> = [
  { id: "deeds", label: "DEEDS", note: "in the crown's own order" },
  { id: "wins", label: "WINS", note: "of all time, fewest fights first among equals" },
  { id: "kills", label: "KILLS", note: "of all time" },
  { id: "honour", label: "HONOUR", note: "of all time" },
];

export default function Roll({ roll, selfName, ask, onAsk }: {
  roll: RollSeat[] | null;
  /** The viewer's own name, to mark his seat. Names collide; a collision only
   *  marks a second row, which flatters nobody and misleads about nothing. */
  selfName: string | null;
  /** What this roll was asked to rank. Optional — old callers get the deeds. */
  ask?: RollAsk;
  /** Present makes the chips render; absent, the roll is a plain reading. */
  onAsk?: (next: RollAsk) => void;
}) {
  const a = ask ?? ROLL_ASK_DEFAULT;
  // The chips render even over an empty answer — a filter that vanished the
  // moment it filtered everything out could never be un-picked.
  if ((!roll || roll.length === 0) && !onAsk) return null;
  const axisNote = AXES.find((x) => x.id === a.axis)?.note ?? "";

  return (
    <section className="roll" aria-label="The roll of honour">
      <style>{CSS}</style>
      <div className="roll-head">
        <span className="label-overline">The Roll of Honour</span>
        <span className="roll-note">
          {a.axis === "deeds"
            ? `${a.week ? "the week's" : "the season's"} fifty, ${axisNote}`
            : `the fifty by ${a.axis}, ${axisNote}`}
        </span>
      </div>
      {onAsk && (
        <div className="roll-asks">
          {AXES.map((x) => (
            <button key={x.id} type="button"
              className={`roll-chip${a.axis === x.id ? " roll-chip-on" : ""}`}
              aria-pressed={a.axis === x.id}
              onClick={() => onAsk({ ...a, axis: x.id })}>{x.label}</button>
          ))}
          {a.axis === "deeds" && (
            <>
              <span className="roll-sep" />
              <button type="button" className={`roll-chip${a.week ? " roll-chip-on" : ""}`}
                aria-pressed={a.week}
                onClick={() => onAsk({ ...a, week: !a.week })}>THIS WEEK</button>
              {PEOPLE_CHIPS.map((p) => (
                <button key={p} type="button"
                  className={`roll-chip${a.people === p ? " roll-chip-on" : ""}`}
                  aria-pressed={a.people === p}
                  onClick={() => onAsk({ ...a, people: a.people === p ? null : p })}>
                  {PEOPLE_NAME(p).toUpperCase()}
                </button>
              ))}
            </>
          )}
        </div>
      )}
      {(!roll || roll.length === 0) && (
        <p className="roll-empty">Nobody yet, by this reckoning.</p>
      )}
      <ol className="roll-list">
        {(roll ?? []).map((s) => {
          const field = FIELD[s.people];
          const mine = !!selfName && s.name === selfName;
          return (
            <li key={s.seat} className={`roll-seat${mine ? " roll-mine" : ""}`}>
              <span className="roll-n">{s.seat}</span>
              <span className="roll-swatch" style={{ background: field?.field, borderColor: field?.lit }} />
              <span className="roll-who">
                <strong>
                  {s.title ? `${s.title} ` : ""}{s.name}
                  {s.bretwaldaSeasons.length > 0 && (
                    <em className="roll-crown" title={`Bretwalda, season ${s.bretwaldaSeasons.join(", ")}`}> ᛒ</em>
                  )}
                </strong>
                <em>of the {PEOPLE_NAME(s.people)}</em>
              </span>
              <span className="roll-tally">
                <b>{s.points}</b>
                <i>{s.matches} match{s.matches === 1 ? "" : "es"}</i>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* Compartmented dark-on-metal, the Standing's own family. One list, dense on
   purpose: a roll is a column of names, and fifty of them at reading size is
   the length of a screen — which is what makes seat one worth holding. */
const CSS = `
.roll {
  margin: 0 0 0.85rem;
  border-radius: 0.5rem; padding: 0.6rem 0.75rem;
  background: linear-gradient(180deg, rgba(32,26,21,0.94), rgba(17,14,11,0.94));
  border: 1px solid rgba(217,164,65,0.24);
  box-shadow: inset 0 1px 0 rgba(255,232,190,0.08);
}
.roll-head { display: flex; align-items: baseline; gap: 0.6rem; margin-bottom: 0.4rem; flex-wrap: wrap; }
.roll-note { font-size: 0.68rem; color: rgba(238,226,204,0.45); }
.roll-list { list-style: none; margin: 0; padding: 0; }
.roll-seat {
  display: flex; align-items: center; gap: 0.55rem;
  padding: 0.28rem 0.2rem; font-size: 0.8rem;
  border-top: 1px solid rgba(217,164,65,0.08);
}
.roll-seat:first-child { border-top: 0; }
/* The top three carry a little more light, the way a charter's first names do. */
.roll-seat:nth-child(-n+3) strong { color: var(--gilt-lit); }
.roll-n {
  width: 1.6rem; text-align: right; flex: none;
  font-variant-numeric: tabular-nums;
  color: rgba(238,226,204,0.45); font-size: 0.72rem;
}
.roll-swatch { width: 0.7rem; height: 0.7rem; border-radius: 0.15rem; border: 1px solid; flex: none; }
.roll-who { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.25; }
.roll-who strong { color: #f2e5cb; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.roll-who em { font-style: normal; font-size: 0.66rem; color: rgba(238,226,204,0.5); }
.roll-crown { font-style: normal; color: var(--gilt-lit); }
.roll-tally { display: flex; flex-direction: column; align-items: flex-end; flex: none; line-height: 1.2; }
.roll-tally b { color: var(--gilt-lit); font-variant-numeric: tabular-nums; }
.roll-tally i { font-style: normal; font-size: 0.64rem; color: rgba(238,226,204,0.45); }
.roll-mine {
  background: rgba(217,164,65,0.08);
  border-radius: 0.3rem;
  border-top-color: transparent;
}
.roll-mine + .roll-seat { border-top-color: transparent; }
.roll-asks { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; margin: 0.1rem 0 0.5rem; }
.roll-chip {
  border: 1px solid rgba(217,164,65,0.28); border-radius: 999px;
  background: rgba(0,0,0,0.35); color: rgba(238,226,204,0.62);
  font-size: 0.58rem; font-weight: 700; letter-spacing: 0.12em;
  padding: 0.28rem 0.55rem; min-height: 1.7rem; cursor: pointer;
}
.roll-chip-on { background: rgba(217,164,65,0.18); color: var(--gilt-lit); border-color: rgba(217,164,65,0.6); }
.roll-sep { width: 1px; align-self: stretch; margin: 0.15rem 0.15rem; background: rgba(217,164,65,0.18); }
.roll-empty { margin: 0.2rem 0 0.3rem; font-size: 0.74rem; color: rgba(238,226,204,0.5); }
`;
