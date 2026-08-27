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

import React, { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import { faceSeedFor } from "@/game/client/armouryThumbs";
import type { Appearance } from "@/game/client/characters";
import WarMap, { type WarViewData } from "@/game/client/factionMap/WarMap";
import Dispatch, { takeWatermark } from "@/game/client/factionMap/Dispatch";
import Standing, { type StandingSelf } from "@/game/client/factionMap/Standing";
import Roll, { ROLL_ASK_DEFAULT, type RollAsk, type RollSeat } from "@/game/client/factionMap/Roll";
import Hearth, { type HearthViewData, type HearthSeatData } from "@/game/client/factionMap/Hearth";
import { POINTS, SEASON_DAYS, FRONT_WINDOW, TERRITORIES } from "@/game/war.mjs";
import { FIELD, PEOPLE_NAME, DRAWN } from "@/game/client/factionMap/territories";
import { readCreds } from "../profileLink";

const PEOPLES = ["saxon", "norse", "briton", "pict"] as const;
type PeopleId = (typeof PEOPLES)[number];

/** The livery mirror — the same stage the armoury uses, behind the same
 *  dynamic door for the same reason: this page must not eat three.js just to
 *  draw a coastline. Loaded only once the oath section renders it. */
const CharacterPreview = dynamic(() => import("@/game/client/CharacterPreview"), { ssr: false });

/**
 * The mirror's stand-in when no profile is stored yet. A LITERAL, not
 * `defaultAppearance` — that helper lives in characters.ts, which imports
 * three.js, and a static import here would drag the whole renderer into this
 * page's first paint; the dynamic door above exists precisely to prevent
 * that. Mirrors `defaultAppearance("huscarl")` field for field; if that
 * table moves, this shows a slightly stale default man on a screen he is on
 * for one oath, which is the cheapest possible drift.
 */
const MIRROR_DEFAULT: Appearance = {
  helm: "nasal", hairStyle: "short", hairColor: 0x4a3220,
  beardStyle: "short", beardColor: 0x4a3220, cloak: "red",
  armorColor: 0x5f6b7a, warPaint: "none", weapon: "weapon_issued", people: "none",
};

/** Subscribe-to-nothing for `useSyncExternalStore` over stores that never
 *  notify; the snapshot is simply re-read on every render. */
const NO_RESUBSCRIBE = () => () => {};

/** What the mirror shows before (and without) a stored profile. */
const MIRROR_UNREAD = { appearance: null as Appearance | null, seed: 0 };

/**
 * The player's own look, read from the same stored profile the game plays
 * with, once per page load and cached — `useSyncExternalStore` compares
 * snapshots by identity, so this must return the same object every call.
 * Absent or unreadable (a brand-new device, private mode), the mirror keeps
 * a default man and the oath is unchanged.
 */
let mirrorCache: typeof MIRROR_UNREAD | null = null;
function readMirrorOnce(): typeof MIRROR_UNREAD {
  if (!mirrorCache) {
    try {
      const raw = localStorage.getItem("bretwalda_profile");
      const p = raw ? JSON.parse(raw) as { appearance?: Appearance; recoveryCode?: string; name?: string } : null;
      mirrorCache = { appearance: p?.appearance ?? null, seed: faceSeedFor(p?.recoveryCode || p?.name || "moot") };
    } catch { mirrorCache = MIRROR_UNREAD; }
  }
  return mirrorCache;
}

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

/**
 * The client's view of a man's own standing. NOT a second declaration of the
 * shape — `StandingSelf` in `factionMap/Standing.tsx` is the one client-side
 * copy of `WarSelfView` in `src/db/war.ts`, and this alias exists so there is
 * nowhere for a third to appear. It already went wrong once: this file carried
 * its own copy for a commit, `warSelf` grew `agoMinutes` on the last match,
 * and the two silently disagreed. `docs/PROCESS.md` failure mode 3 — caught
 * here only because the shape was finally passed somewhere that knew better.
 */
type SelfView = StandingSelf;

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
  /**
   * A graduate of the First Moot arrives with `?oath=first` — the rite's
   * second act. The copy above the map speaks to him rather than to a
   * returning campaigner; nothing else changes, because the oath is the
   * oath. Read in an effect: the query string is the browser's.
   */
  const fromMoot = useSyncExternalStore(
    NO_RESUBSCRIBE,
    () => { try { return new URLSearchParams(window.location.search).get("oath") === "first"; } catch { return false; } },
    () => false,
  );
  /**
   * The player's own look, for the livery mirror: the oath screen shows HIM
   * in the kingdom's colours, not a stock figure. Read from the same stored
   * profile the game plays with; absent (a brand-new device that skipped the
   * fight somehow), the mirror simply stays a default man and the oath is
   * unchanged.
   */
  // Read once per visit and cached at module level: `useSyncExternalStore`
  // calls the snapshot every render and compares by identity, so the parse
  // must not mint a fresh object each time. Nothing on this page writes the
  // profile, so one read is the truth for the visit — the same staleness the
  // old effect had, without the state mirror react-doctor flags.
  const mirror = useSyncExternalStore(NO_RESUBSCRIBE, readMirrorOnce, () => MIRROR_UNREAD);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * The newest flip this browser had already been shown when it arrived.
   * `undefined` until the war has been read — see `takeWatermark`, which both
   * answers this and raises the stored value. It is read HERE, in the fetch
   * callback below, for the same reason every setState on this screen is: an
   * effect body is the one place this repository does not put them.
   */
  const [seen, setSeen] = useState<number | null | undefined>(undefined);
  /** The roll of honour, or null while it loads (and in local mode forever). */
  const [roll, setRoll] = useState<RollSeat[] | null>(null);
  /** The viewer's own house and the season's houses — backlog 4.4. */
  const [hearth, setHearth] = useState<HearthViewData | null>(null);
  const [hearthSeats, setHearthSeats] = useState<HearthSeatData[] | null>(null);

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
      body: JSON.stringify({ ...(storedProfile() ?? {}), roll: true }),
    })
      .then((res) => res.json() as Promise<{
        ok?: boolean; mode?: string; war?: WarViewData; self?: SelfView | null;
        roll?: RollSeat[] | null;
        hearth?: HearthViewData | null; hearths?: HearthSeatData[] | null;
      }>)
      .then((body) => {
        if (body.mode === "local" || !body.war) { setMode("local"); return; }
        setMode("server");
        setWar(body.war);
        // Read OUTSIDE the updater, because a state updater must be pure and
        // this one both reads a store and writes to it. `takeWatermark` is
        // idempotent — the read is cached per season and the write stores the
        // same value — so calling it on a second load costs nothing.
        const watermark = takeWatermark(
          body.war.season.index,
          body.war.recent.reduce((m, f) => Math.max(m, f.at), 0),
        );
        // Once per visit: the SECOND load — after swearing, say — must keep the
        // value the FIRST one answered, or the dispatch would go quiet in the
        // middle of the visit that was showing it.
        setSeen((had) => (had !== undefined ? had : watermark));
        setSelf(body.self ?? null);
        setRoll(Array.isArray(body.roll) ? body.roll : null);
        setHearth(body.hearth ?? null);
        setHearthSeats(Array.isArray(body.hearths) ? body.hearths : null);
        if (body.self?.allegiance) setChoice(body.self.allegiance as PeopleId);
      })
      .catch(() => { setMode("local"); });
  }, []);

  useEffect(() => { void load(); }, [load]);

  /**
   * THE ROLL'S ASK (7.6): which axis and scope the leaderboard ranks. A
   * change refetches ONLY the roll — a slim POST with the same body shape —
   * so flipping between DEEDS and KILLS never re-reads the whole map.
   */
  const [rollAsk, setRollAsk] = useState<RollAsk>(ROLL_ASK_DEFAULT);
  const askRoll = useCallback((next: RollAsk) => {
    setRollAsk(next);
    void fetch("/api/war", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roll: true, rollAxis: next.axis,
        rollPeople: next.people ?? undefined, rollWeek: next.week || undefined,
      }),
    })
      .then((res) => res.json() as Promise<{ roll?: RollSeat[] | null }>)
      .then((body) => { setRoll(Array.isArray(body.roll) ? body.roll : []); })
      .catch(() => { /* the last roll stands; a failed filter is not an outage */ });
  }, []);

  const sworn = self?.allegiance as PeopleId | null | undefined;
  const locked = !!self?.locked && !!sworn;

  // The graduate is CARRIED to the choice: the oath section lives below the
  // map, and a phone's first screen would otherwise open on a coastline he
  // has not earned yet. One scroll, once the rolls have been read.
  useEffect(() => {
    if (!fromMoot || mode !== "server" || sworn) return;
    const t = setTimeout(() => {
      document.querySelector(".war-oath")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 600);
    return () => clearTimeout(t);
  }, [fromMoot, mode, sworn]);

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
            <span className="label-overline">{fromMoot && !sworn ? "The First Moot — your last rite" : "Britain, c. 878"}</span>
            <h1>{sworn ? "The war for Britain" : fromMoot ? "Now choose your kingdom" : "Choose your people"}</h1>
            <p>
              {sworn
                ? "Every match is fought over named ground. Win, and your people bank it. A territory changes hands when one people leads by enough, and at the season's end the people holding most of Britain crowns a Bretwalda."
                : fromMoot
                  ? "You have stood your first fight. One thing remains: Britain is four peoples at war, and every match you win from here takes ground for one of them. Touch a kingdom on the map, read what it holds, and swear. The oath is for the season — choose like it matters."
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

          {/* WHO YOU ARE AND WHAT THE OATH BOUGHT — first, and above the
              map. The owner's two words were PROGRESS and IDENTITY, and both
              of them used to live in one sentence two screens below the
              coastline on a phone. */}
          {mode === "server" && <Standing war={war} self={self} />}
          {mode === "server" && (
            <Hearth sworn={self?.allegiance ?? null} hearth={hearth} seats={hearthSeats}
              credentials={storedProfile()} onChanged={() => void load()} />
          )}
          {mode === "server" && <Roll roll={roll} selfName={self?.name ?? null} ask={rollAsk} onAsk={askRoll} />}

          {/* WHAT MOVED WHILE YOU WERE AWAY — above the map, and that
              placement is the point. The map plate is taller than a 390px
              viewport, so anything below it is off-screen on the phone this
              defect was reported from. The one sentence a returning player
              came back for cannot be a thing he has to go and find. */}
          {mode === "server" && <Dispatch war={war} mine={sworn ?? null} seen={seen} />}

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

            {/* THE LIVERY MIRROR. The oath's whole weight is "your colours
                for a season" — so the screen shows the man himself, dressed
                in the kingdom under his finger, on the same stage the armoury
                photographs him with. `people` rides the appearance the way
                the wire carries it; the swear itself is unchanged. */}
            {!locked && (
              <div className="war-mirror">
                <CharacterPreview
                  warriorClass="huscarl"
                  appearance={{ ...(mirror.appearance ?? MIRROR_DEFAULT), people: (choice ?? sworn ?? "none") as Appearance["people"] }}
                  faceSeed={mirror.seed}
                  height={300}
                  turn={-0.55}
                />
                <p className="war-mirror-note">
                  {choice
                    ? `In the colours of the ${PEOPLE_NAME(choice)}.`
                    : sworn
                      ? `In the colours of the ${PEOPLE_NAME(sworn)}.`
                      : "Touch a kingdom — on the map or below — and see yourself in its colours."}
                </p>
              </div>
            )}

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
.war-mirror { margin: 0.75rem 0 1rem; }
.war-mirror-note { margin: 0.5rem 0 0; text-align: center; font-size: 0.8rem; color: rgba(238,226,204,0.62); }
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
