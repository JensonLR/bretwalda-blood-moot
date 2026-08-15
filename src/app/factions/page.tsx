"use client";

// ============================================================
// THE WAR FOR BRITAIN — /factions
//
// The screen `docs/WHAT-THIS-GAME-IS.md` §3 asks for, and the answer to "why
// would anyone come back": the map moved while you were asleep. It does two
// jobs and they are deliberately the same screen.
//
//   THE MAP     who holds what, what moved overnight, where the season stands.
//   THE OATH    swearing to a people, which is meant to feel like the big
//               decision it is — so the map is already on screen behind it and
//               the choice is made ON the ground rather than off a list.
//
// It keeps the game's own chrome — shell, backdrop, screen-head, knot-band —
// so it is judged in the game's frame and not on a white page where anything
// looks fine.
// ============================================================

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import WarMap, { type WarViewData } from "@/game/client/factionMap/WarMap";
import { POINTS, SEASON_DAYS, FRONT_WINDOW, TERRITORIES } from "@/game/war.mjs";
import { FIELD, PEOPLE_NAME, DRAWN } from "@/game/client/factionMap/territories";
import { readCreds } from "../profileLink";

const PEOPLES = ["saxon", "norse", "briton", "pict"] as const;
type PeopleId = (typeof PEOPLES)[number];

/**
 * The flip thresholds, READ OFF the territory table rather than written out
 * here. `FIELD_THRESHOLD` and `SEAT_THRESHOLD` are module-private in war.mjs,
 * so quoting them as literals would be a second copy of a rule that is already
 * written down once — and this repository has recorded five separate defects
 * caused by exactly that. If someone re-balances the table, this copy follows.
 */
const THRESHOLDS = TERRITORIES.map((t: { threshold: number }) => t.threshold) as number[];
const FLIP_LOW = Math.min(...THRESHOLDS);
const FLIP_HIGH = Math.max(...THRESHOLDS);

/** One line each, from `docs/FACTIONS.md` §2. Not a history lesson. */
const NOTE: Record<PeopleId, { ground: string; seat: string; note: string }> = {
  saxon: {
    ground: "Wessex, Kent, English Mercia, Bernicia", seat: "Winchester",
    note: "Alfred's, after Edington. The kingdom that did not fall, holding the south and the road north.",
  },
  norse: {
    ground: "Jorvik, East Anglia, the Five Boroughs, the Isles", seat: "Jorvik",
    note: "The Danelaw, north-east of Watling Street, and the sea-road from Mann to the Hebrides.",
  },
  briton: {
    ground: "Gwynedd, Dyfed, Kernow, Ystrad Clud", seat: "Tintagel",
    note: "The people who were already here, holding the west from Cornwall to the Clyde.",
  },
  pict: {
    ground: "Fortriu, Circinn, Fib, Cait", seat: "Burghead",
    note: "North of the Forth. Symbol stones, no surviving language, and not the Scots.",
  },
};

/** Mirrors `WarSelfView` in `src/db/war.ts`. Everything here is off the ledger. */
interface SelfView {
  allegiance: string | null;
  points: number;
  matches: number;
  bretwaldaSeasons: number[];
  locked: boolean;
  ground: { territoryId: string; points: number; matches: number; holder: string }[];
  rank: number | null;
  ofPeople: number;
  last: { territoryId: string; points: number; at: number } | null;
}

/**
 * WHOSE OATH THIS IS.
 *
 * `readCreds` from `profileLink.ts` and NOT a second reader of localStorage.
 * The first draft of this file invented its own key and its own shape, which
 * is `docs/PROCESS.md` failure mode 3 — the same thing written twice — and it
 * would have failed silently: no credentials found, so every man on the
 * deployment would have been told to go and fight a match first, for ever.
 */
const storedProfile = readCreds;

export default function WarPage() {
  const [war, setWar] = useState<WarViewData | null>(null);
  const [self, setSelf] = useState<SelfView | null>(null);
  const [mode, setMode] = useState<"loading" | "server" | "local">("loading");
  const [choice, setChoice] = useState<PeopleId | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Read the war rolls. Every setState below happens in a promise callback and
   * never in an effect body — that is the shape React's lint asks for, and it
   * is also the only shape that is honest here: the map is a network read and
   * a screen that pretended otherwise would flash the opening map at everyone.
   */
  const load = useCallback((): Promise<void> => {
    return fetch("/api/war", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(storedProfile() ?? {}),
    })
      .then((res) => res.json() as Promise<{
        ok?: boolean; mode?: string; war?: WarViewData; self?: SelfView | null;
      }>)
      .then((body) => {
        if (body.mode === "local" || !body.war) { setMode("local"); return; }
        setMode("server");
        setWar(body.war);
        setSelf(body.self ?? null);
        if (body.self?.allegiance) setChoice(body.self.allegiance as PeopleId);
      })
      .catch(() => { setMode("local"); });
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sworn = self?.allegiance as PeopleId | null | undefined;
  const locked = !!self?.locked && !!sworn;

  const takeTheOath = useCallback(async () => {
    if (!choice || busy) return;
    const profile = storedProfile();
    if (!profile) {
      setNotice("Fight one match first — the game will remember you, and then you can swear.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/war/swear", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...profile, people: choice }),
      });
      const body = await res.json() as { ok?: boolean; message?: string; mode?: string };
      if (body.ok) {
        setNotice(`Sworn to the ${PEOPLE_NAME(choice)}. Every fight you win from here takes ground for them.`);
        await load();
      } else {
        setNotice(body.message || "The oath was not taken.");
      }
    } catch {
      setNotice("The oath could not reach the moot. Try again.");
    } finally {
      setBusy(false);
    }
  }, [choice, busy, load]);

  const heldBy = (people: PeopleId): number =>
    war ? war.standings.find((s) => s.people === people)?.held ?? 0
        : DRAWN.filter((t) => t.origin === people).length;

  return (
    <div className="shell">
      <div className="backdrop backdrop-hall"><div className="embers" /></div>
      <div className="shell-inner">
        <div className="wrap wrap-wide screen">
          {/* Back first in the DOM, so a screen reader and a Tab both reach the
              way out before the map. `btn-back` already carries `--tap`, so it
              is thumb-sized on a phone without a second rule here. */}
          <Link href="/" className="btn-back" data-snd="back" aria-label="Back to the hall">
            <ArrowLeft size={16} /> BACK
          </Link>

          <header className="screen-head screen-head-center">
            <span className="label-overline">Britain, c. 878</span>
            <h1>{sworn ? "The war for Britain" : "Choose your people"}</h1>
            <p>
              {sworn
                ? "Every match is fought over named ground. Win, and your people bank it. A territory changes hands when one people leads by enough, and at the season's end the people holding most of Britain crowns a Bretwalda."
                : "The one year all four coexist: Alfred's Wessex against the Danelaw, the Britons holding the west, and the Picts still Picts for another generation. Swear to one, and the map becomes yours to drag."}
            </p>
          </header>

          <div className="knot-band" />

          {notice && (
            <div className="war-notice" role="status">
              {notice}
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
            </div>
          )}

          {mode === "loading"
            ? <p className="war-loading">Reading the war rolls…</p>
            : <WarMap war={war} mine={sworn ?? choice} fought={self?.ground}
                      onPick={(p) => { if (!locked) setChoice(p as PeopleId); }} />}

          {/* ------------------------------------------- how the war works */}
          {/* The owner's words: "no clarity about how it works either". Every
              number below is READ FROM `war.mjs`, not typed out here, so the
              screen cannot drift away from the rules it describes. */}
          <section className="war-how">
            <div className="section-title">How the war is won</div>
            <ol className="war-how-steps">
              <li>
                <b>You are dealt ground.</b> Every match is fought over one named
                territory, drawn from the {FRONT_WINDOW} most bitterly contested on
                the map. You do not pick it — the front does.
              </li>
              <li>
                <b>You earn for your people.</b> Turning up is worth {POINTS.turnout}.
                Every kill is {POINTS.perKill}. Taking the win is {POINTS.victory}.
                One match can carry at most {POINTS.cap} to the cause, so a long night
                of good fights beats one lucky rout.
              </li>
              <li>
                <b>Ground changes hands on a lead, not a win.</b> A territory only
                turns when a challenger is ahead of whoever holds it by {FLIP_LOW}
                {" "}points in open field, or {FLIP_HIGH} at a seat of power. Holders
                dig in; capitals cost more to take.
              </li>
              <li>
                <b>The season ends after {SEASON_DAYS} days.</b> Whoever holds most of
                Britain when it closes crowns a Bretwalda, the map resets, and the
                mark on your name does not.
              </li>
            </ol>
          </section>

          {/* ---------------------------------------------------- the oath */}
          <section className="war-oath">
            <div className="section-title">
              {locked ? "You are sworn" : sworn ? "Your oath" : "Swear to a people"}
            </div>
            <p className="war-oath-note">
              {locked
                ? `You have taken the field for the ${PEOPLE_NAME(sworn!)} this season — ${self?.points ?? 0} points over ${self?.matches ?? 0} match${self?.matches === 1 ? "" : "es"}. The oath holds until the map resets.`
                : "Your people decides your colours, your kit and whose border you are dragging. It never decides your class, your numbers, or who you are put in a room with — twelve players split four ways is four empty queues."}
            </p>

            <ul className="war-peoples">
              {PEOPLES.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    className={`card card-interactive war-people-row${choice === p ? " card-selected" : ""}`}
                    aria-pressed={choice === p}
                    disabled={locked}
                    onClick={() => setChoice(p)}
                  >
                    <span className="war-swatch" style={{ background: FIELD[p].field, borderColor: FIELD[p].lit }} />
                    <span className="war-people-text">
                      <span className="war-people-name">
                        {PEOPLE_NAME(p)}
                        {sworn === p && <b className="war-tag">sworn</b>}
                      </span>
                      <span className="war-people-ground">{NOTE[p].ground}</span>
                      <span className="war-people-note">{NOTE[p].note}</span>
                    </span>
                    <span className="war-people-held">
                      <b>{heldBy(p)}</b><i>held</i>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {self && self.bretwaldaSeasons.length > 0 && (
              <p className="war-mark">
                <span className="cabochon" />
                Bretwalda of Britain, season{self.bretwaldaSeasons.length === 1 ? "" : "s"}{" "}
                {self.bretwaldaSeasons.join(", ")}. That mark cannot be bought and cannot be lost.
              </p>
            )}
          </section>

          <div className="action-bar">
            <div className="action-bar-row">
              <button
                type="button"
                className="btn-primary flex-1 !text-base"
                disabled={!choice || busy || locked || mode !== "server"}
                onClick={() => void takeTheOath()}
              >
                {locked ? `Sworn to the ${PEOPLE_NAME(sworn!)}`
                  : mode !== "server" ? "The war rolls are not being kept"
                  : busy ? "Swearing…"
                  : choice ? `Swear to the ${PEOPLE_NAME(choice)} at ${NOTE[choice].seat}`
                  : "Choose a people"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.war-loading { text-align: center; padding: 3rem 0; color: rgba(238,226,204,0.55); font-size: 0.85rem; }
.war-notice {
  display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;
  border-radius: 0.5rem; padding: 0.65rem 0.85rem; font-size: 0.82rem;
  background: linear-gradient(180deg, rgba(124,20,32,0.35), rgba(24,14,12,0.6));
  border: 1px solid rgba(217,164,65,0.35); color: #f2e5cb;
}
.war-notice button { margin-left: auto; background: none; border: 0; color: inherit; font-size: 1.1rem; cursor: pointer; line-height: 1; }

/* HOW THE WAR IS WON. Four numbered steps because the war genuinely IS a
   sequence — dealt, earned, flipped, crowned — so the numerals carry meaning
   rather than decorating a list. Ordinals sit in the gutter on a wide screen
   and inline on a phone, where there is no gutter to spare. */
.war-how { margin-top: 1.25rem; }
.war-how-steps {
  list-style: none; counter-reset: step; margin: 0; padding: 0;
  display: grid; gap: 0.55rem;
}
@media (min-width: 48rem) { .war-how-steps { grid-template-columns: 1fr 1fr; } }
.war-how-steps > li {
  counter-increment: step;
  position: relative;
  padding: 0.7rem 0.85rem 0.7rem 2.4rem;
  border: 1px solid rgba(217,164,65,0.16);
  border-radius: 0.4rem;
  background: rgba(20,15,11,0.42);
  font-size: 0.82rem;
  line-height: 1.5;
  color: rgba(238,226,204,0.72);
}
.war-how-steps > li::before {
  content: counter(step);
  position: absolute; left: 0.85rem; top: 0.7rem;
  font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em;
  color: var(--gilt); opacity: 0.75;
  font-variant-numeric: tabular-nums;
}
.war-how-steps b { color: rgba(238,226,204,0.94); font-weight: 700; }

.war-oath { margin-top: 1.25rem; }
.war-oath-note { margin: 0 0 0.75rem; font-size: 0.8rem; color: rgba(238,226,204,0.66); line-height: 1.5; }
.war-peoples { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
@media (min-width: 48rem) { .war-peoples { grid-template-columns: 1fr 1fr; } }
.war-peoples > li { display: flex; }
.war-people-row {
  display: flex; align-items: center; gap: 0.7rem; width: 100%; text-align: left;
  padding: 0.7rem 0.8rem; min-height: 3.75rem;
}
.war-people-row:disabled { opacity: 0.55; cursor: default; }
.war-swatch { width: 1.05rem; height: 1.05rem; border-radius: 0.25rem; border: 1px solid; flex: none; }
.war-people-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.war-people-name { display: flex; align-items: center; gap: 0.4rem; font-size: 0.92rem; color: #f2e5cb; font-weight: 700; }
.war-tag {
  font-size: 0.58rem; letter-spacing: 0.12em; text-transform: uppercase;
  padding: 0.1rem 0.35rem; border-radius: 0.2rem; color: #0d0b09; background: var(--gilt);
}
.war-people-ground { font-size: 0.7rem; color: var(--gilt); letter-spacing: 0.02em; }
.war-people-note { font-size: 0.72rem; color: rgba(238,226,204,0.58); line-height: 1.35; }
.war-people-held { display: flex; flex-direction: column; align-items: center; flex: none; }
.war-people-held b { font-size: 1.1rem; color: var(--gilt-lit); line-height: 1; }
.war-people-held i { font-style: normal; font-size: 0.58rem; letter-spacing: 0.08em; color: rgba(238,226,204,0.45); }
.war-mark {
  display: flex; align-items: center; gap: 0.5rem; margin: 0.75rem 0 0;
  font-size: 0.78rem; color: var(--gilt-lit);
}
`;
