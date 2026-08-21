"use client";

/* ==========================================================================
   THE DISPATCH — what moved while you were away.

   `docs/WHAT-THIS-GAME-IS.md` §3 puts the whole retention thesis in one
   sentence: "the map moved while you were asleep, and your kingdom is losing
   Mercia." `war_flips` has been recording exactly that since the table was
   written — seasonId, territoryId, fromPeople, toPeople, createdAt, indexed on
   (seasonId, createdAt) — and `warView` has been sending the last twelve of
   them down the wire as `recent`. Backlog 5.13, and the doc calls it "the only
   visible surface of the game's whole retention thesis".

   What was missing is not the data. It is the WATERMARK: the map could list
   what had happened, and could not say which of it was news to YOU.

   ---------------------------------------------------------------------------
   THE WATERMARK IS SERVER-MINTED, AND THIS IS THE ONE DECISION IN THIS FILE.

   The obvious implementation stores `Date.now()` in localStorage on each visit
   and shows flips newer than it. That is wrong on a phone, and wrong in the
   direction that matters: `f.at` comes off `war_flips.created_at`, which is
   POSTGRES'S clock, and `Date.now()` is the handset's. A device eleven minutes
   fast silently swallows every flip of the last eleven minutes — permanently,
   because the watermark it wrote is in the future — and a device an hour slow
   reports the same border falling every time the screen is opened. Nobody
   would ever file it, because both look exactly like a quiet war.

   `src/db/war.ts` already refuses to let the client compute `daysLeft` or
   `agoMinutes` for the same reason, in a comment that says so.

   So what is stored is not a time at all. It is THE NEWEST FLIP TIMESTAMP THIS
   BROWSER HAS ALREADY BEEN SHOWN — a value minted by the server, handed to the
   client, and handed back. Both sides of the comparison are then the same
   clock, and a wrong handset date cannot affect the answer.
   ========================================================================== */

import React from "react";
import { DRAWN_BY_ID, FIELD, PEOPLE_NAME } from "./territories";
import type { WarViewData } from "./WarMap";

/**
 * Same shape and same store as `bretwalda_name` and `bretwalda_link` — see
 * `src/app/profileLink.ts`, which is the file that owns this convention.
 */
const SEEN_KEY = "bretwalda_war_seen";

/** Per season, because a season reset makes every earlier flip irrelevant. */
const seenKey = (seasonIndex: number): string => `${SEEN_KEY}_${seasonIndex}`;

function readSeen(seasonIndex: number): number | null {
  try {
    const raw = localStorage.getItem(seenKey(seasonIndex));
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

function writeSeen(seasonIndex: number, at: number): void {
  try { localStorage.setItem(seenKey(seasonIndex), String(at)); } catch { /* private mode */ }
}

/**
 * READ THE WATERMARK, AND RAISE IT — once per season per JS context.
 *
 * Called from `/factions`'s fetch callback and from nowhere else, which is the
 * shape this repository already uses and states in `src/app/factions/page.tsx`:
 * every setState happens in a promise callback and never in an effect body.
 * Doing the read there rather than inside this component also takes the server
 * out of the question altogether — this function only ever runs in a browser
 * that has already fetched the war, so there is no server snapshot to
 * disagree with and no hydration pass to lose the answer in.
 *
 * That matters because the first shape of this was a `useSyncExternalStore`
 * with an `undefined` server snapshot, and on a genuine first visit — the one
 * case with nothing in localStorage — the panel rendered NOTHING. It was
 * caught by driving two real page loads in a browser and counting the flips on
 * each; it was invisible in every screenshot taken up to that point, because
 * every one of those runs had pre-set a watermark.
 *
 * ANSWERS the value this browser had when it arrived, and STORES the newest
 * flip it is about to be shown. Returning the old value while storing the new
 * one is the whole mechanic: the visit that shows you the news is the visit
 * after which it stops being news.
 *
 * `null` means this browser has never been shown this season.
 */
const asOfLoad = new Map<number, number | null>();
export function takeWatermark(seasonIndex: number, newestFlipAt: number): number | null {
  if (!asOfLoad.has(seasonIndex)) asOfLoad.set(seasonIndex, readSeen(seasonIndex));
  const wasSeen = asOfLoad.get(seasonIndex) ?? null;
  // Raised to the newest flip he is about to be shown — NOT to `Date.now()`,
  // which is the handset's clock and the whole bug the header describes.
  if (newestFlipAt > 0) writeSeen(seasonIndex, newestFlipAt);
  return wasSeen;
}

/** Minutes to words. The MINUTES are the server's — see `WarMap`'s copy. */
const ago = (mins: number): string => {
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

export interface DispatchProps {
  war: WarViewData | null;
  /** The people he swore to, so a flip that cost HIM ground reads as a loss. */
  mine?: string | null;
  /**
   * The newest flip this browser had already been shown when it arrived, from
   * `takeWatermark`. `null` = never looked this season; `undefined` = the war
   * has not been read yet, and the panel draws nothing rather than guessing.
   */
  seen?: number | null;
}

/** Purely presentational: it reads no store and keeps no state. */
export default function Dispatch({ war, mine = null, seen }: DispatchProps) {
  if (!war || seen === undefined) return null;
  const looked = seen !== null;

  const flips = war.recent;
  /** What is news to HIM. Both sides of this comparison are Postgres's clock. */
  const fresh = seen === null ? flips : flips.filter((f) => f.at > seen);

  /**
   * The closest border to falling, for when nothing moved. `remaining` and
   * `challenger` are computed in `warView` and have never been shown anywhere
   * — the aria-label on the map's hit layer speaks the number to a screen
   * reader and no sighted player has ever seen it.
   */
  const closest = [...war.territories]
    .filter((t) => t.remaining !== null && t.challenger)
    .sort((a, b) => (a.remaining ?? 1e9) - (b.remaining ?? 1e9))[0];

  const heading = !looked ? "The war so far"
    : fresh.length > 0 ? "While you were away"
    : "Since you last looked";

  return (
    <section className="wd" aria-label={heading}>
      <style>{CSS}</style>
      <div className="section-title">{heading}</div>

      {fresh.length > 0 ? (
        <ul className="wd-list">
          {fresh.slice(0, 6).map((f, i) => {
            const name = DRAWN_BY_ID[f.territoryId]?.name ?? f.territoryId;
            const won = mine != null && f.to === mine;
            const lost = mine != null && f.from === mine;
            return (
              <li key={`${f.territoryId}-${f.at}-${i}`}
                  data-mine={won ? "won" : lost ? "lost" : "no"}>
                <span className="cabochon" aria-hidden="true" />
                <span className="wd-text">
                  {/* The owner's sentence, in his words: "The Norse took
                      Lindsey from the Mercians." Territory first, because the
                      ground is what he recognises on the map above. */}
                  {"The "}<b style={{ color: FIELD[f.to]?.lit }}>{PEOPLE_NAME(f.to)}</b>
                  {" took "}<strong>{name}</strong>{" from the "}
                  {PEOPLE_NAME(f.from)}
                  {won && <em className="wd-tag wd-tag-won">yours</em>}
                  {lost && <em className="wd-tag wd-tag-lost">lost</em>}
                </span>
                <i className="wd-when">{ago(f.agoMinutes)}</i>
              </li>
            );
          })}
        </ul>
      ) : (
        /* NEVER AN EMPTY BOX. If no border moved, the screen says what IS
           moving — which is the more useful sentence anyway, because it is the
           one a man can act on tonight. */
        <p className="wd-quiet">
          {closest && closest.challenger ? (
            <>
              No border has moved since you last looked. The closest is{" "}
              <strong>{DRAWN_BY_ID[closest.id]?.name ?? closest.id}</strong> —
              the <b style={{ color: FIELD[closest.challenger]?.lit }}>
                {PEOPLE_NAME(closest.challenger)}
              </b>{" "}
              {closest.remaining === 0
                ? <>take it on the next point they bank.</>
                : <>need <b>{closest.remaining}</b> more points to take it from the{" "}
                   {PEOPLE_NAME(closest.holder)}.</>}
            </>
          ) : (
            <>Every border is quiet. Fight, and one of them will not be.</>
          )}
        </p>
      )}
    </section>
  );
}

/* --------------------------------------------------------------------------
   Compartmented, dark-on-metal, per docs/DESIGN-SYSTEM.md section 1: a band
   with cut ends and small nicked fields, never a rule running the full length.
   Every colour is a token globals.css already defines.
   -------------------------------------------------------------------------- */
const CSS = `
.wd {
  margin: 0 0 0.85rem;
  border-radius: 0.6rem; padding: 0.7rem 0.85rem 0.75rem;
  background: linear-gradient(180deg, rgba(32,26,21,0.94), rgba(17,14,11,0.94));
  border: 1px solid rgba(217,164,65,0.26);
  box-shadow: inset 0 1px 0 rgba(255,232,190,0.08);
}
.wd .section-title { margin-bottom: 0.5rem; }

.wd-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }
.wd-list > li {
  display: flex; align-items: baseline; gap: 0.5rem;
  font-size: 0.8rem; line-height: 1.45; color: rgba(238,226,204,0.82);
  /* The nicked field: a compartment per dispatch, cut at both ends. */
  padding: 0.3rem 0.45rem; border-radius: 0.3rem;
  background: rgba(12,10,8,0.4);
  border-left: 2px solid rgba(217,164,65,0.28);
}
/* Ground you took and ground you lost, in the two colours this game already
   reserves: gilt for the win, garnet for the wound. Nothing else gets a hue. */
.wd-list > li[data-mine="won"] { border-left-color: var(--gilt); }
.wd-list > li[data-mine="lost"] { border-left-color: var(--garnet-lit); }
.wd-text { flex: 1; min-width: 0; }
.wd-text strong { color: #f2e5cb; font-weight: 700; }
.wd-when {
  font-style: normal; font-size: 0.68rem; white-space: nowrap;
  color: rgba(238,226,204,0.45);
}
.wd-tag {
  font-style: normal; font-size: 0.56rem; letter-spacing: 0.12em;
  text-transform: uppercase; margin-left: 0.4rem;
  padding: 0.1rem 0.3rem; border-radius: 0.2rem; color: #0d0b09;
}
.wd-tag-won { background: var(--gilt); }
.wd-tag-lost { background: var(--garnet-lit); }

.wd-quiet {
  margin: 0; font-size: 0.8rem; line-height: 1.5; color: rgba(238,226,204,0.72);
}
.wd-quiet strong { color: #f2e5cb; }
.wd-quiet b { color: var(--gilt-lit); font-weight: 700; }
`;
