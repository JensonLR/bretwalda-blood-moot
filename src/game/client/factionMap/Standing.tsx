"use client";

/* ==========================================================================
   YOUR STANDING — what the oath bought, in the words a man would use.

   The owner's report, in full: "It doesn't feel like much of an impact
   currently when you do swear to a kingdom & win a game — if you go back to
   the map you can't see any sort of indication of progress or identity."
   `docs/BACKLOG.md` Wave 4.3 says the same thing in its own words: "a man
   swears to a people and then looks exactly as he did before."

   Before this panel the whole answer lived in ONE SENTENCE buried inside the
   oath section, two screens below the map on a phone: "You have taken the
   field for the Anglo-Saxons this season — 908 points over 104 matches."
   Two numbers, no ground, no standing, no last fight, and a scroll away.

   THREE COMPARTMENTS, and they are three different questions:

     WHO YOU ARE       your name, your people, and the one mark that cannot be
                       bought — a Bretwalda season.
     WHERE YOU STAND   your seat among your OWN people, which is the race the
                       crown is actually decided by.
     YOUR LAST FIGHT   what it was worth, which ground took it, and how close
                       that ground now is to changing hands. The last clause is
                       the one that sends a man back into a match.

   EVERY NUMBER HERE IS PERSISTED. Points, matches, rank and the last match come
   off `war_ledger` through `warSelf`; the holder, challenger and `remaining`
   come off the live territory row through `warView`. Nothing is approximated
   and nothing is derived from a clock in the browser.
   ========================================================================== */

import React from "react";
import { DRAWN, DRAWN_BY_ID, FIELD, PEOPLE_NAME } from "./territories";
import { LAND, MAP_W, MAP_H } from "./britain";
import type { WarViewData, WarSelfGround } from "./WarMap";

export interface StandingSelf {
  name: string;
  allegiance: string | null;
  points: number;
  matches: number;
  bretwaldaSeasons: number[];
  locked: boolean;
  /** The period title his points have earned on his people's ladder, or null. */
  title: string | null;
  ground: WarSelfGround[];
  rank: number | null;
  ofPeople: number;
  last: { territoryId: string; points: number; at: number; agoMinutes: number } | null;
}

export interface StandingProps {
  war: WarViewData | null;
  self: StandingSelf | null;
}

/** 1st, 2nd, 3rd, 4th. English, not `#2`. */
const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] || "th"}`;
};

/** Minutes to words. The MINUTES are the server's — see `warSelf`. */
const ago = (mins: number): string => {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

export default function Standing({ war, self }: StandingProps) {
  // A man who has not sworn has no standing to show, and inventing one for him
  // would be the same defect from the other side. The oath section below is
  // already the right screen for him.
  if (!war || !self || !self.allegiance) return null;

  const people = self.allegiance;
  const field = FIELD[people];
  const crowned = self.bretwaldaSeasons.length > 0;

  /** The ground his last match was fought over, as the map has it NOW. */
  const lastGround = self.last
    ? war.territories.find((t) => t.id === self.last!.territoryId) ?? null
    : null;
  const lastName = self.last
    ? DRAWN_BY_ID[self.last.territoryId]?.name ?? self.last.territoryId
    : null;

  /**
   * HOW CLOSE THAT GROUND IS TO MOVING, told from HIS side of the border.
   * The same three numbers read as three different sentences depending on
   * whether he holds it, is taking it, or is watching two other peoples fight
   * over ground he bled on — and only the second of those is "you need N more".
   */
  let pressure: React.ReactNode = null;
  if (lastGround) {
    const holder = lastGround.holder;
    const challenger = lastGround.challenger;
    const left = lastGround.remaining;
    if (challenger && left !== null) {
      if (holder === people) {
        pressure = left === 0
          ? <>Your people hold it, and the <b>{PEOPLE_NAME(challenger)}</b> take it on the next point they bank.</>
          : <>Your people hold it. The <b>{PEOPLE_NAME(challenger)}</b> need <b>{left}</b> more points to take it off you.</>;
      } else if (challenger === people) {
        pressure = left === 0
          ? <>It falls to your people on the very next point banked.</>
          : <>Your people need <b>{left}</b> more points to take it from the <b>{PEOPLE_NAME(holder)}</b>.</>;
      } else {
        pressure = <>The <b>{PEOPLE_NAME(holder)}</b> hold it; the <b>{PEOPLE_NAME(challenger)}</b> need <b>{left}</b> more.</>;
      }
    } else {
      pressure = holder === people
        ? <>Your people hold it, uncontested.</>
        : <>The <b>{PEOPLE_NAME(holder)}</b> hold it, uncontested.</>;
    }
  }

  /** Holder by territory id, for the map well's tints. */
  const holderOf = new Map(war.territories.map((t) => [t.id, t.holder]));

  return (
    <section className="ws" aria-label="Your standing in the war">
      <style>{CSS}</style>

      {/* ---- the map as it stands ----

          THE MAP WELL, FILLED — backlog 5.12. The design review shipped this
          compartment as an honest empty slot, not knowing the repository
          already owns the coastline (`britain.ts`, Natural Earth, 1,655
          points, public domain). So the well is the real Britain: every
          territory filled in its holder's field, the player's own people at
          full strength and the other three faded, and the ground of his last
          fight ringed. It is a STANDING, not a control — the interactive map
          is one screen up — so nothing here takes a pointer. */}
      <div className="ws-cell ws-map" aria-hidden="true">
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid meet">
          {/* Same clip the WarMap uses: a territory is a claim on LAND, and a
              field bleeding into the sea is a flag where no one stands. */}
          <defs><clipPath id="ws-land-clip"><path d={LAND} /></clipPath></defs>
          <path d={LAND} className="ws-land" />
          <g clipPath="url(#ws-land-clip)">
            {DRAWN.map((t) => {
              const holder = holderOf.get(t.id) ?? t.origin;
              const mine = holder === people;
              return (
                <path key={t.id} d={t.d}
                  fill={FIELD[holder]?.field ?? "#555"}
                  opacity={mine ? 0.78 : 0.26} />
              );
            })}
          </g>
          {self.last && DRAWN_BY_ID[self.last.territoryId] && (
            <circle cx={DRAWN_BY_ID[self.last.territoryId].x}
              cy={DRAWN_BY_ID[self.last.territoryId].y}
              r={26} className="ws-lastmark" />
          )}
        </svg>
      </div>

      {/* ---- who you are ---- */}
      <div className="ws-cell ws-who">
        <span className="ws-swatch" style={{ background: field?.field, borderColor: field?.lit }} />
        <span className="ws-who-text">
          <strong>{self.name || "A nameless warrior"}</strong>
          <em>{self.title ? `${self.title} of the ${PEOPLE_NAME(people)}` : `of the ${PEOPLE_NAME(people)}`}</em>
        </span>
        {crowned && (
          <span className="ws-crown" title={`Bretwalda, season ${self.bretwaldaSeasons.join(", ")}`}>
            <span className="cabochon" aria-hidden="true" />
            Bretwalda · {self.bretwaldaSeasons.join(", ")}
          </span>
        )}
      </div>

      {/* ---- where you stand ---- */}
      <div className="ws-cell ws-rank">
        <span className="label-overline">Among your own</span>
        {self.rank !== null ? (
          <p>
            <b className="ws-big">{ordinal(self.rank)}</b>
            <span> of {self.ofPeople} {PEOPLE_NAME(people)}
              {self.ofPeople === 1 ? " who has" : " who have"} taken the field</span>
          </p>
        ) : (
          <p><span>You have not banked a point this season. The first one seats you.</span></p>
        )}
        <p className="ws-tally">
          <b>{self.points}</b> points · <b>{self.matches}</b> match{self.matches === 1 ? "" : "es"} ·{" "}
          <b>{self.ground.length}</b> territor{self.ground.length === 1 ? "y" : "ies"}
        </p>
      </div>

      {/* ---- your last fight ---- */}
      {self.last && lastName && (
        <div className="ws-cell ws-last">
          <span className="label-overline">Your last fight</span>
          <p>
            <b className="ws-big">+{self.last.points}</b>
            <span> to the {PEOPLE_NAME(people)} at <strong>{lastName}</strong></span>
            <i>{ago(self.last.agoMinutes)}</i>
          </p>
          {/* THE LINE THAT SENDS HIM BACK IN. `remaining` has existed in
              warView since the map shipped and has never been drawn. */}
          {pressure && <p className="ws-pressure">{pressure}</p>}
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------------------------
   Compartmented, dark-on-metal — docs/DESIGN-SYSTEM.md section 1. Three nicked
   fields with cut ends, stacked on a phone and in a row once there is width
   for one. Every colour is a token globals.css already defines.
   -------------------------------------------------------------------------- */
const CSS = `
.ws {
  display: grid; gap: 0.5rem; grid-template-columns: 1fr;
  margin: 0 0 0.85rem;
}
/* Three text compartments and the map rail. Across only when across still
   leaves each compartment readable; below that they stack, which is the phone
   and is the default — where the map leads the stack at a modest height. */
@media (min-width: 54rem) { .ws { grid-template-columns: auto 1fr 1fr 1.2fr; } }

/* THE MAP WELL. Britain is tall (639x1000), so the rail is narrow and the
   height is capped: at 8.2rem it spans the row on desktop and stays a badge,
   not a poster, on the phone. */
.ws-map { display: flex; align-items: center; justify-content: center; padding: 0.4rem 0.55rem; }
.ws-map svg { height: 8.2rem; max-width: 100%; }
.ws-land { fill: rgba(14,12,9,0.92); stroke: rgba(217,164,65,0.28); stroke-width: 2; }
.ws-lastmark {
  fill: none; stroke: var(--gilt-lit); stroke-width: 7; opacity: 0.9;
}

.ws-cell {
  border-radius: 0.5rem; padding: 0.6rem 0.75rem;
  background: linear-gradient(180deg, rgba(32,26,21,0.94), rgba(17,14,11,0.94));
  border: 1px solid rgba(217,164,65,0.24);
  box-shadow: inset 0 1px 0 rgba(255,232,190,0.08);
  min-width: 0;
}
.ws-cell .label-overline { display: block; margin-bottom: 0.25rem; }
.ws-cell p { margin: 0; font-size: 0.8rem; line-height: 1.45; color: rgba(238,226,204,0.74); }
.ws-cell b { color: var(--gilt-lit); font-weight: 700; }
.ws-cell strong { color: #f2e5cb; font-weight: 700; }

/* WHO YOU ARE. The one compartment that is a person and not a number, so it
   gets the name at reading size and nothing else competing. */
.ws-who { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.ws-swatch { width: 1.6rem; height: 1.6rem; border-radius: 0.3rem; border: 1px solid; flex: none; }
.ws-who-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.ws-who-text strong { font-size: 1rem; line-height: 1.2; }
.ws-who-text em { font-style: normal; font-size: 0.74rem; color: var(--gilt); letter-spacing: 0.02em; }
/* The unbuyable mark, and the only gilt badge on the screen. */
.ws-crown {
  display: inline-flex; align-items: center; gap: 0.35rem;
  font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--gilt-lit); border: 1px solid rgba(217,164,65,0.45);
  border-radius: 0.25rem; padding: 0.2rem 0.4rem; white-space: nowrap;
}

.ws-big { font-size: 1.35rem; line-height: 1; margin-right: 0.35rem; }
.ws-rank p + p { margin-top: 0.3rem; }
.ws-tally { font-size: 0.75rem !important; color: rgba(238,226,204,0.6) !important; }

.ws-last p i {
  font-style: normal; font-size: 0.68rem; color: rgba(238,226,204,0.45);
  margin-left: 0.4rem; white-space: nowrap;
}
.ws-pressure {
  margin-top: 0.35rem !important;
  padding-top: 0.35rem;
  /* A cut end, not a rule across the panel: the compartment law again. */
  border-top: 1px solid rgba(217,164,65,0.18);
  font-size: 0.78rem !important;
}
`;
