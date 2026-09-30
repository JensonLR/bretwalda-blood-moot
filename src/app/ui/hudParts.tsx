"use client";

// ============================================================
// hudParts.tsx — the round-break, bracket, emote and match-summary surfaces, and the pips they
// share.
//
// MOVED, NOT REWRITTEN. The F0 scaffold of the UI overhaul lifted these declarations out of the
// foot of `src/app/page.tsx`, below `Page()`, byte for byte: the only edits are the `export`
// keywords and the re-pointed relative imports. The commit that made the move records the
// before/after frame comparison that shows nothing on screen changed.
//
// Contains: Pips, RoundTally, EMOTE_ITEMS, EmoteRow, ROUND_HOLD_MS, BracketCard, RoundBreak,
// LedgerRow, MatchSummary, InstallInvite, MatchTally.
// Owner: UNIT H. Ownership is by component name (`shared.ts` lists the unit letters), so no other
// unit edits this file; a change that has to touch a neighbour's component goes through that unit.
//
// Reads from `./warParts` (`WarLine`, which the match summary prints, is unit W's).
// ============================================================

import { useState, useEffect, useSyncExternalStore } from "react";
import { Swords, Crown, Shield, Coins, Flag, Hourglass } from "lucide-react";
import { REPLAY } from "@/game/replay.mjs";
import type { MatchEndData, EmoteId, BracketMatch } from "../../game/types";
import {
  offerFor, askToInstall, dismissOffer, subscribeInstall, installSnapshot, installServerSnapshot,
} from "@/game/client/install";
import { MarkGlyph } from "../../game/client/MarkGlyph";
import { StandardGlyph } from "../../game/client/StandardGlyph";
import type { RoomState, WarOutcomeMsg } from "./shared";
import { WarLine } from "./warParts";

// One round: an empty gilt setting, or the stone sitting in it.
function Pips({ won, of, blue }: { won: number; of: number; blue?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: Math.max(1, of) }, (_, i) => (
        <span key={i} className={`pip ${i < won ? (blue ? "pip-won pip-won-blue" : "pip-won") : ""}`} />
      ))}
    </span>
  );
}

// The match score, read straight off the server's snapshot. `roundScoreBy`
// says whether the keys of roundWins are men or sides, so this never has to
// infer the shape of the match from its mode.
export function RoundTally({ roomState, playerId, noRound }: { roomState: RoomState; playerId: string; noRound?: boolean }) {
  const of = roomState.roundTarget || 1;
  const wins = roomState.roundWins || {};
  const round = roomState.roundIndex || 1;
  // The break card is already headed with the round; repeating it inside the
  // tally reads as two different numbers rather than one.
  const counter = noRound ? null : <span className="text-[var(--ink-faint)]">ROUND {round}/{roomState.bestOf}</span>;

  if (roomState.roundScoreBy === "team") {
    const mine = roomState.players[playerId]?.team;
    return (
      <div className="round-hud">
        <span className={mine === "red" ? "text-amber-200" : "text-[var(--ink-dim)]"}>RED</span>
        <Pips won={wins.red || 0} of={of} />
        {counter ?? <span className="text-[var(--ink-ghost)]">·</span>}
        <Pips won={wins.blue || 0} of={of} blue />
        <span className={mine === "blue" ? "text-amber-200" : "text-[var(--ink-dim)]"}>BLUE</span>
      </div>
    );
  }

  // Free-for-all: your own tally, and the man to beat if it is not you.
  const lead = Object.entries(wins).sort((a, b) => b[1] - a[1])[0];
  const leadName = lead && lead[1] > 0 && lead[0] !== playerId ? roomState.players[lead[0]]?.name : null;
  return (
    <div className="round-hud">
      {counter}
      <span className="text-amber-200">YOU</span>
      <Pips won={wins[playerId] || 0} of={of} />
      {leadName && (
        <>
          <span className="text-[var(--ink-ghost)]">·</span>
          <span className="max-w-[6rem] truncate text-[var(--ink-dim)]">{leadName}</span>
          <Pips won={lead[1]} of={of} />
        </>
      )}
    </div>
  );
}

/**
 * The three victory emotes, as a row of buttons. This is the touch path — the
 * bound keys are the desktop's — and it lives on the two surfaces where a man
 * can be SEEN performing it: the round-end beat with the arena still up, and
 * the summary tableau. Never the combat HUD (mid-fight both thumbs are spoken
 * for, and a flourish is something you do over a man rather than instead of
 * blocking one) and never over the break card's scrim, which is where it used
 * to be and where nobody could see a thing.
 * The server validates and throttles every press, so these can be plain.
 */
/**
 * Three flourishes, and the list never changes — so it is built ONCE at module
 * scope rather than rebuilt on every render of a row that sits on the
 * round-break card and the summary. Three objects is not a cost worth a note on
 * its own; what it is worth is not handing a new array identity to a `map` on a
 * component that re-renders behind a live fight.
 */
const EMOTE_ITEMS: Array<{ id: EmoteId; label: string; Icon: typeof Swords }> = [
  { id: "raise", label: "RAISE", Icon: Swords },
  { id: "boss", label: "BOSS", Icon: Shield },
  { id: "taunt", label: "TAUNT", Icon: Flag },
];

function EmoteRow({ onEmote }: { onEmote: (emote: EmoteId) => void }) {
  const items = EMOTE_ITEMS;
  return (
    <div className="pointer-events-auto flex items-center justify-center gap-2">
      {items.map(({ id, label, Icon }) => (
        <button key={id} onClick={() => onEmote(id)} data-snd="tap"
          aria-label={`Emote: ${label.toLowerCase()}`}
          className="flex min-h-[2.75rem] items-center gap-1.5 rounded-lg border border-amber-800/60 bg-stone-900/85 px-3 py-1.5 text-[10px] font-bold tracking-[0.18em] text-amber-200/90 backdrop-blur transition hover:border-amber-500 hover:text-amber-100 active:scale-95">
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  );
}

/**
 * HOW LONG THE ARENA IS LEFT ALONE after a round before the break card covers
 * it. `ROUND_BREAK` in engine.mjs is five seconds, so this spends the first two
 * of them on the fight that just finished and leaves the card its countdown.
 *
 * Not read from the wire and deliberately not mirrored from the server's five:
 * this is a beat in the client's presentation, and the only thing it must not do
 * is outlive the break. The `left > 2` guard below is what enforces that, so a
 * late joiner or a slow socket gets the card immediately rather than a hold that
 * runs past the bell.
 *
 * 2950 -> 4000, AND IT IS NO LONGER A NUMBER TYPED HERE. The round break now
 * carries the slow-motion replay of the kill that ended the round
 * (`src/game/replay.mjs`, wired in `GameCanvas`), and the arena has to be left
 * alone for the whole of it or the break card comes down over the replay. So
 * this is `REPLAY.wall * 1000` — 4000 ms — and `REPLAY.wall` is itself derived
 * from the server's `ROUND_BREAK` of 5 s with one second held back so the
 * countdown is still dealt on time.
 *
 * WHAT THE BREAK NOW COSTS, spelled out because the honest version of this is a
 * budget and not a reassurance. The break is the same 5 s it always was; what
 * changed is what is inside it:
 *
 *   before   2.95 s  round-beat camera over the corpse, at life speed
 *            2.05 s  break card and countdown
 *   after    4.00 s  the replay: 0.92 s of run-up + 1.08 s of collapse,
 *                    2.00 s of fight shown over 4.00 s of wall clock
 *            1.00 s  break card and countdown
 *
 * The card loses 1.05 s and never less than its countdown — see the `left > 1`
 * guard below, which was `left > 2` and had to move with this or it would have
 * capped the hold at 3.0 s and cut the replay off a second early. Nothing on
 * the server waits on any of it.
 *
 * 2200 -> 2950 WITH `ROUND_HOLD.total` IN src/game/deathcam.mjs, which is the
 * round camera's clock and plays inside exactly this window. The camera's beat
 * opens with a still frame while the dying man falls, and the collapse got
 * longer when it got its weight — over the seven kinds of death
 * `node tools/freezetest.mjs --phases=collapse` drives, the worst of them
 * outlasts the 0.45 s the still beat used to be by most of a second. THE
 * FIGURE IS NOT WRITTEN DOWN HERE: that harness prints its own range and this
 * file measures none of it. (This sentence carried "1.25 s" for a round, which
 * is a number the named harness does not print.) The two numbers
 * are not wired together — deathcam.mjs belongs to another unit — and
 * tools/deathcamtest.mjs fails if they stop agreeing, so change one and the
 * harness will tell you about the other.
 */
const ROUND_HOLD_MS = REPLAY.wall * 1000;

/**
 * The end of a round, in two beats.
 *
 * IT WAS ONE, AND THE FLOURISH WAS IN THE WRONG ONE. The owner: *"Emote option
 * is in next round coming screen where you can't actually really see any players
 * or even emote & even if you don't win the round you see it"*. Every word of
 * that was literally true. The row was inside the break card below, which is
 * drawn over a full-viewport `bg-black/55` scrim, at the moment `GameCanvas` has
 * already put the camera on the wide lobby establishing orbit. The press DID
 * reach the rig and the man DID perform it — `GameCanvas` drains emotes through
 * the whole intermission and poses the bodies for exactly this reason — and
 * there was no one able to see any of it, including the man pressing. And it was
 * offered to the men who had just lost the round as readily as the one who won.
 *
 * `docs/WHAT-THIS-GAME-IS.md` §5.4 names what it was supposed to be: *"the
 * round-end beat where the victor emotes and everyone watches"* — one of three
 * things it files under **being seen**. So the fix is not to delete the row:
 *
 *   BEAT ONE — the arena, unscrimmed. The dead are lying where they fell, the
 *     standing are breathing, the verdict is one line across the top and nothing
 *     else is drawn. ONLY the man (or the band) who took the round is offered
 *     the flourish, and only while he is on his feet.
 *   BEAT TWO — the break card, as it always was, with the countdown. No emote
 *     row: by then the scrim is down and there is nothing to see.
 *
 * WHAT THIS DOES NOT DO, and it is HALF THE ASK, so it is written down rather
 * than left to be discovered. `tools/roundbeat.mjs` was written to photograph
 * this screen — nothing in the repo could, because `raiseMoot` pins every
 * harness match to a single round and a single round has no intermission — and
 * the pictures say the camera is still wrong. Through beat one the rig is
 * easing out of the fight's follow-cam toward the lobby orbit, which is aimed at
 * the WORLD ORIGIN, and the world origin is where the bonfire is. Two of three
 * captures came back as a screenful of flame with one corpse's arm in it; the
 * third happened to catch a body. Nothing is aimed at the victor, and "the men
 * are in frame" would have been a comfortable thing to write and untrue.
 *
 * So: this beat fixes WHO is offered the flourish and WHETHER anything covers
 * the arena while it plays. It does NOT fix what the lens is pointed at, and
 * until it does, "everyone watches" is not delivered. That needs a rig mode
 * that holds on the round's victor, which lives in `GameCanvas`/`render` —
 * another unit's files this pass — so it is NOT BUILT and is the next step.
 */
/**
 * THE BRACKET, DRAWN (7.3). The whole tree off one snapshot — fixed slots
 * make that possible — with the winners lit and the one undone pairing that
 * has both men named marked as NEXT. Names come from the bracket's own
 * name-book, never the roster: a knocked-out man may have left the room,
 * and the tree must still say who fought in it.
 */
function BracketCard({ stages, names }: { stages: BracketMatch[][]; names: Record<string, string> }) {
  const nameOf = (id: string | null) => (id ? names[id] ?? "?" : null);
  const label = (s: number) => {
    const fromEnd = stages.length - 1 - s;
    return fromEnd === 0 ? "THE FINAL" : fromEnd === 1 ? "SEMI-FINALS" : fromEnd === 2 ? "QUARTER-FINALS" : `ROUND ${s + 1}`;
  };
  // The next duel: the first undone match with both men decided. Same walk
  // `settle` makes, minus the presence question the client cannot answer.
  let next: BracketMatch | null = null;
  for (const st of stages) { for (const m of st) { if (!m.done && m.a && m.b) { next = m; break; } } if (next) break; }
  // REDRAWN ON THE OWNER'S PLAY REPORT ("the design of it is also poor"):
  // a real staged bracket now — one COLUMN per stage, left to right, each
  // column's matches spread with space-around so a feeder pair naturally
  // brackets the match it feeds; the winner carries a crown, the beaten
  // man is struck, the NEXT duel burns amber with its badge. The engine's
  // TOURNEY_BREAK (12 s) is what buys the time to read it.
  return (
    <div data-bracket className="flex w-full items-stretch gap-2 text-left sm:gap-3">
      {stages.map((st, s) => (
        <div key={s} className="flex min-w-0 flex-1 flex-col">
          <div className="label-overline mb-1.5 text-center !text-[9px] text-[var(--ink-dim)]">{label(s)}</div>
          <div className="flex flex-1 flex-col justify-around gap-2">
            {st.map((m, i) => {
              const isNext = m === next;
              const row = (id: string | null) => {
                const n = nameOf(id);
                const winner = m.done && m.winner != null && m.winner === id;
                const beaten = m.done && m.winner != null && id != null && m.winner !== id;
                // A null side means two different things and the card must
                // not conflate them: in the FIRST round it is a bye (the
                // field was smaller than the tree); in any later round it
                // is a man still to be DECIDED by the feeder duel below.
                const empty = s === 0 ? "bye" : "to come";
                return (
                  <div className={`flex min-w-0 items-center gap-1.5 px-2 py-1 text-[12px] leading-tight sm:text-[13px] ${
                    winner ? "font-bold text-amber-300" : beaten ? "text-[var(--ink-faint)]" : n === null ? "italic text-[var(--ink-faint)]" : "text-[var(--ink)]"
                  }`}>
                    {winner && <Crown size={11} className="shrink-0 text-amber-400" />}
                    <span className={`truncate ${beaten ? "line-through decoration-[var(--ink-faint)]/60" : ""}`}>{n ?? empty}</span>
                  </div>
                );
              };
              return (
                <div key={i}
                  className={`overflow-hidden rounded-lg border transition ${
                    isNext ? "border-amber-500/90 bg-amber-950/40 shadow-[0_0_18px_rgba(217,164,65,0.25)]"
                    : m.done ? "border-stone-700/50 bg-stone-900/40 opacity-80"
                    : "border-stone-700/70 bg-stone-900/60"
                  }`}>
                  {isNext && (
                    <div className="animate-pulse bg-amber-500/15 px-2 py-0.5 text-center text-[9px] font-bold tracking-[0.3em] text-amber-300">
                      NEXT
                    </div>
                  )}
                  {row(m.a)}
                  <div className="mx-2 border-t border-stone-700/50" />
                  {row(m.b)}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RoundBreak({ roomState, playerId, onEmote }: { roomState: RoomState; playerId: string; onEmote: (emote: EmoteId) => void }) {
  const [now, setNow] = useState(() => Date.now());
  // When THIS round ended, by the client's own clock. The component is mounted
  // by the flip into "intermission" and unmounted by the countdown that follows,
  // so it is a fresh mount every round and this needs no reset.
  const [endedAt] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const r = roomState.lastRound;
  const left = Math.max(0, Math.ceil(((roomState.nextRoundAt || 0) - now) / 1000));
  const won = r && !r.draw && (r.winnerId === playerId || (r.winnerTeam && roomState.players[playerId]?.team === r.winnerTeam));
  const standing = roomState.players[playerId]?.state !== "dead";
  // The tournament's break (7.3) reads differently: "ROUND N OF 1" would be
  // a lie (bestOf is forced to 1 — the BRACKET is the format), a drawn duel
  // is re-fought rather than passed over, and the card's body is the tree.
  const tourney = roomState.mode === "tournament_moot" && !!roomState.bracket;
  const verdict = !r || r.draw
    ? (tourney ? "BOTH MEN FELL — THE DUEL IS REFOUGHT" : "NO MAN LEFT STANDING")
    : won ? (tourney ? "YOU ADVANCE" : "THE ROUND IS YOURS") : `${r.winnerName} TAKES IT`;
  const overline = tourney ? `DUEL ${r?.index ?? roomState.roundIndex}` : `ROUND ${r?.index ?? roomState.roundIndex} OF ${roomState.bestOf}`;

  // The card never gets less than its countdown: if the break is already nearly
  // spent when this mounts, there is no beat to hold and we go straight to it.
  // `left > 1` and not `> 2`: the hold is now the replay's 4.0 s and the guard
  // is what stops it outliving the break, so it has to leave the card the one
  // second `REPLAY.wall` held back rather than the two the old 2.95 s beat did.
  // A late joiner or a slow socket still gets the card immediately.
  // The tournament SKIPS the verdict-only beat (owner's report: the break
  // was "a couple of seconds max" of readable tree): its card carries the
  // verdict line anyway, and every second belongs to the bracket.
  if (!tourney && now - endedAt < ROUND_HOLD_MS && left > 1) {
    return (
      /* `pt-[6.6rem]` clears the round tally the game screen keeps pinned at
         top-[4.6rem] — a `.round-hud` pill is about 1.4rem tall, so the verdict
         starts just under it and the two read as one column: the score, then
         what just happened. The bottom is free by construction: `GameHud` only
         raises the touch cluster while `isFighting`, and this is an
         intermission, so the flourish row has the thumb to itself. */
      <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between p-4 pt-[6.6rem]">
        <div className="animate-fadeIn flex flex-col items-center gap-1 text-center">
          <div className="label-overline">{overline}</div>
          <div className="font-display text-xl leading-tight text-amber-100 sm:text-2xl"
            style={{ textShadow: "0 2px 24px rgba(0,0,0,0.9), 0 0 26px rgba(217,164,65,0.35)" }}>
            {verdict}
          </div>
        </div>
        {/* THE VICTOR ONLY, AND ONLY ON HIS FEET. A war band's round is won by a
            side, so `won` is true for every man on it — the band celebrates
            together, which is what the wall in the summary tableau is also for.
            A corpse is refused by the server anyway (`handleEmote`), so offering
            him a button would be offering him a dead one. */}
        {won && standing && (
          <div className="animate-fadeIn mx-auto w-full max-w-md">
            <EmoteRow onEmote={onEmote} />
          </div>
        )}
      </div>
    );
  }

  return (
    /* `data-break-card` is a NAMED HOOK, and it is here because a harness had
       been finding this card by its scrim colour — `.bg-black/55` — under a
       comment claiming that class was "the ONLY thing that draws it". It is
       also on every kill-feed row (GameHud.tsx:596), the ability-cooldown pill
       (GameHud.tsx:623) and the XP track above (page.tsx:1931), so the query
       matched mid-fight and `roundbeat` photographed a fight and called it a
       break card. A harness that finds a component by a utility class is
       coupled to the palette; this attribute is what it is allowed to look
       for. Same arrangement as `data-ledger` on the summary rows. */
    <div data-break-card
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-6">
      <div className={`card card-noble card-glow animate-fadeIn flex w-full flex-col items-center gap-3 p-6 text-center ${tourney ? "max-w-2xl" : "max-w-sm"}`}>
        <div className="label-overline">{overline}</div>
        <div className="font-display text-2xl leading-tight text-amber-100" style={{ textShadow: "0 0 26px rgba(217,164,65,0.35)" }}>
          {verdict}
        </div>
        <div className="knot-band w-full max-w-[13rem]" />
        {/* The tournament's break shows the TREE, not a tally: duels won is
            already drawn on the bracket as lit names, and the one thing a
            waiting man wants — when do I fight — is the NEXT mark. */}
        {tourney && roomState.bracket
          ? <BracketCard stages={roomState.bracket} names={roomState.bracketNames ?? {}} />
          : <RoundTally roomState={roomState} playerId={playerId} noRound />}
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] text-[var(--ink-dim)]">
          <Hourglass size={12} className="text-amber-400" />
          {tourney ? `THE NEXT DUEL IN ${left}` : `NEXT ROUND IN ${left}`}
        </div>
      </div>
    </div>
  );
}

/**
 * A ledger row as the server now sends it.
 *
 * `place` and `roundsWon` are put on every row by `buildLedger` in engine.mjs,
 * which is also what puts `results` in placement order before it leaves. They
 * are widened in here rather than added to `MatchResult` in `game/types.ts`
 * because that file belongs to another unit this pass; folding these two fields
 * into the shared interface is the tidy-up this leaves behind.
 */
type LedgerRow = MatchEndData["results"][number] & { place: number; roundsWon: number };

/**
 * The end-of-match summary, over the staged tableau. Rocket League's trick,
 * kept whole: the picture behind this is the GAME — the victor and the wall,
 * or the duel's corpse — so this overlay owns only the top and bottom bands of
 * the screen and leaves the middle to the stage. Designed at 390x844 first:
 * the verdict up top, a compact ledger and the two ways out under the thumb.
 *
 * THE ROWS ARE NOT SORTED HERE ANY MORE. They used to be — `sort((a, b) =>
 * b.score - a.score)`, with score exactly kills x 100 — and that single line is
 * what the owner photographed: two men level on kills tied exactly, the sort was
 * stable, and the man who had won the extra round was printed second under a man
 * he had beaten and beside a smaller pile of coins. The order is the server's
 * answer now (engine.mjs `buildLedger`), arrived at by the same rule that names
 * the match winner, and `place` rides on the row so a genuine tie can print two
 * #1s instead of inventing a loser.
 */
export function MatchSummary({ data, playerId, payState, waiting, war, marks, standards, onEmote, onFightAgain, onLeave, onSwear, onSaveClip }: {
  data: MatchEndData;
  playerId: string;
  /**
   * Each man's declared mark by player id, read out of the room the caller is
   * still holding. The ledger's own rows don't carry appearance and widening
   * the wire for a glyph would be transport for decoration; absent ids simply
   * draw no mark, which is also what most men wear.
   */
  marks?: Record<string, string | undefined>;
  /** Each man's house standard and the people it flies on, by id — same source as `marks`. */
  standards?: Record<string, { people?: string; standard?: string } | undefined>;
  /**
   * Saves the final kill's clip (7.9), recorded through the replay's own
   * tuned lens. Null when no clip exists — no MediaRecorder, low tier, or
   * the replay was too short to carry a frame — and then no button renders:
   * a save button that answers "nothing saved" is worse than none.
   */
  onSaveClip?: (() => void) | null;
  payState: "none" | "asking" | "paid" | "unpaid";
  waiting: boolean;
  /** What the fight did to the war, for this man. `null` until the server says. */
  war: WarOutcomeMsg | null;
  /** Offered only when the reason he counted for nobody is that he never swore. */
  onSwear?: () => void;
  /** Absent when this player is a corpse on the stage — the dead don't jeer. */
  onEmote?: (emote: EmoteId) => void;
  onFightAgain: () => void;
  onLeave: () => void;
}) {
  const rows = data.results as LedgerRow[];
  const mine = rows.find((r) => r.id === playerId);
  // A one-bit mount mark for the capture harness, the same shape as
  // `__groundBuilt`: `summaryflow`'s FIGHT-AGAIN press has to land inside the
  // server's ten-second park window, and on a software rasteriser the only
  // honest way to time it is off the overlay actually existing — polling the
  // DOM for header text costs layout on a main thread that can barely draw.
  // Set in an effect (mount fact, not render side-effect); cleared on unmount
  // so a second summary in one session reads true again for its own reasons.
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__summaryUp = true;
    return () => { (window as unknown as Record<string, unknown>).__summaryUp = false; };
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between p-4 pt-7 sm:p-6">
      {/* A GROUND FOR THE PANEL ON WIDE SCREENS.
          The owner, of a desktop capture: "this desktop view is pretty ugly &
          hard to see the players". On a phone the roll sits in the one column
          there is and the tableau is behind it, which is the only arrangement
          that fits. On a 1440-wide screen the same centred column lands square
          on both victors — the men the screen exists to show — with a third of
          the frame empty on either side of them.
          So on `lg` the roll moves to the right rail and this is the ground it
          sits on: a soft edge-to-centre wash so the panel has contrast without
          a hard-edged box in the middle of the picture, on the same reasoning
          as the top scrim. Below `lg` it is not drawn at all. */}
      <div aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-[34rem] bg-gradient-to-l from-black/80 via-black/45 to-transparent lg:block" />
      {/* A SCRIM, BECAUSE A TEXT SHADOW IS NOT CONTRAST.
          The owner: "the text on end screen the yellow is sometimes hard to
          read & blended into the background of the arena". It is amber type on
          an arena lit by a low sun — the two are the same hue, and a shadow
          only darkens the pixels immediately under a glyph, which does nothing
          when the glyph and the ground behind it are both bright.
          What fixes text over ARBITRARY imagery is a ground of its own. This is
          a gradient rather than a panel so it has no edge to notice, it is
          behind the words and in front of the fight, and it is tall enough to
          cover the whole top cluster including the war line. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-black/75 via-black/45 to-transparent sm:h-60" />
      {/* The headline stays centred on the FRAME up to `lg`; past it the rail
          takes the right third, so it centres on what is left instead of
          sitting half-under the roll. */}
      <div className="animate-fadeIn relative flex flex-col items-center gap-1.5 text-center lg:pr-[32rem]">
        <div className="label-overline">BATTLE COMPLETE</div>
        {/* Near-white rather than amber-100. Over a warm arena an amber
            headline is the same hue as its background; the glow stays because
            it is what makes it feel lit, but the type itself has to be the one
            thing in the frame that is NOT the fire's colour. */}
        <h1 className="font-display text-2xl leading-tight text-[#f6f1e6] sm:text-4xl"
          style={{ textShadow: "0 2px 24px rgba(0,0,0,0.95), 0 0 30px rgba(255,180,60,0.35)" }}>
          {(data.wave ?? 0) > 0
            ? `THE BURH HELD ${Math.max(0, (data.wave ?? 1) - 1)} WAVE${(data.wave ?? 1) - 1 === 1 ? "" : "S"}`
            : data.winnerKind === "none" || data.winnerName === "Draw"
              ? "BLOOD SPILT — A DRAW"
              : `${data.winnerName.toUpperCase()} PREVAILS`}
        </h1>
        {/* The Burh's own verdict line: which wave took it. `wave` counts the
            wave STANDING when the party fell, so the burh HELD wave-1 full
            waves — the honest number, and the one a party will chase. */}
        {(data.wave ?? 0) > 0 && (
          <div className="badge-garnet !text-[10px]">THE HERE TOOK IT ON WAVE {data.wave}</div>
        )}
        {/* WHAT THIS FIGHT DID TO THE WAR.
            The loop has always worked — `tools/warflow.mjs` proves it 28/28
            against a real database — and the game never said so, which is
            indistinguishable from it being broken. This is the line that was
            missing, and it is shown for the REFUSALS as loudly as for the win:
            the whole point is that a man who counted for nobody finds out. */}
        <WarLine war={war} onSwear={onSwear} />
        {/* WON ON KILLS, SAID OUT LOUD. Two men level on rounds is the common
            shape of an eight-man free-for-all, and the man who lost it that way
            is owed the reason — otherwise the summary reads as arbitrary. Only
            shown when it actually decided the match; on a rounds win it would
            be noise. */}
        {data.winnerBy === "kills" && data.winnerKind !== "none" && (
          <div className="badge-garnet !text-[10px]">LEVEL ON ROUNDS — TAKEN ON KILLS</div>
        )}
        {data.winnerBy === "draw" && data.winnerKind === "none" && (
          <div className="badge-stone !text-[10px]">LEVEL ON ROUNDS AND ON KILLS</div>
        )}
        {/* The tournament's crown (7.3): the bracket is the authority — a
            bye can leave the tally level, and this line says which law the
            table below was seated by. */}
        {data.winnerBy === "bracket" && data.winnerKind !== "none" && (
          <div className="badge-garnet !text-[10px]">THE BRACKET CROWNS THE CHAMPION</div>
        )}
        {/* `isWinner` and not an id match: a war band is won by a side, and
            every man on it won it. */}
        {mine?.isWinner && (
          <div className="font-display animate-pulse text-sm tracking-[0.35em] text-[#ffd45e]"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.95), 0 2px 14px rgba(0,0,0,0.9)" }}>VICTORY IS YOURS</div>
        )}
        <MatchTally data={data} playerId={playerId} />
      </div>

      {/* THE ROLL, ON THE RIGHT RAIL WHEN THERE IS ROOM FOR ONE.
          `mx-auto` up to `lg` — a phone has one column and the tableau lives
          behind it. From `lg` the men are framed centre-left and this pins
          right, so nothing the screen is FOR is covered by the numbers.
          `lg:justify-end` puts it at the foot of the rail rather than floating
          in the middle of it, and the taller `max-h` is affordable there
          because it is no longer competing with the fight for the same pixels. */}
      <div className="pointer-events-auto mx-auto flex w-full max-w-md flex-col gap-2 lg:mx-0 lg:ml-auto lg:mr-2 lg:max-w-sm lg:justify-end">
        {/* The flourish, performed live on the tableau behind these numbers.
            The stage shares the fight's rigs, so the press plays mid-portrait. */}
        {onEmote && <EmoteRow onEmote={onEmote} />}
        <div className="card !bg-stone-950/85 flex max-h-[34vh] flex-col p-2 backdrop-blur lg:max-h-[46vh]">
          {/* THE COLUMN HEADS, AND THEY ARE HERE FOR THE MIDDLE ONE. The owner:
              "rounds won should be recorded somehow for all to see in the
              table". A bare number in a column nobody has named is not
              recorded, it is decoration — and this one decides the placement
              and the purse to its right, so it is the column that most needs
              saying out loud. Outside the scroller so it does not slide away
              under an eight-man moot. */}
          <div className="flex items-center gap-2.5 border-b border-amber-900/40 px-2.5 pb-1 text-[8px] font-bold uppercase leading-none tracking-[0.16em] text-[var(--ink-faint)]">
            <div className="w-6 shrink-0">#</div>
            <div className="min-w-0 flex-1">WARRIOR</div>
            <div className="w-7 shrink-0 text-center">RNDS</div>
            <div className="w-16 shrink-0 text-right">PAY</div>
          </div>
          <div className="flex flex-col gap-1 overflow-y-auto pt-1">
            {rows.map((r) => (
              /* The three data hooks are for `summaryflow`, and they exist
                 because the engine-side gate (`tools/tiebreak.mjs`) cannot see
                 this file at all: it proves the SERVER ranks correctly, and a
                 client that quietly re-sorted its own copy — which is exactly
                 what this component did until today — would sail straight past
                 it. They let the harness read the printed table back and hold it
                 against the wire. */
              <div key={r.id} data-ledger={r.id} data-place={r.place} data-rounds={r.roundsWon}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 ${
                  r.isWinner ? "bg-amber-900/30" : r.id === playerId ? "bg-sky-950/40" : ""
                }`}>
                {/* The server's `place`, not the row index. They differ exactly
                    when two men are level on rounds AND on kills: both are #1,
                    both are paid the same, and the table says so rather than
                    picking one of them out of the room's join order. */}
                <div className="font-display w-6 shrink-0 text-lg leading-none text-[var(--ink-faint)]">#{r.place}</div>
                <div className="min-w-0 flex-1">
                  <div className={`flex items-center gap-1.5 text-[13px] font-bold leading-tight ${r.isWinner ? "text-amber-200" : "text-[var(--ink-bright)]"}`}>
                    <span className="truncate">{r.name}</span>
                    <MarkGlyph id={marks?.[r.id]} size={12} className="text-amber-300/90" />
                    <StandardGlyph people={standards?.[r.id]?.people} id={standards?.[r.id]?.standard} size={12} className="text-[#f0e4c8]/90" />
                    {r.isWinner && <Crown size={12} className="shrink-0 text-amber-400" />}
                  </div>
                  <div className="text-[10px] leading-tight text-[var(--ink-dim)]">{r.kills}K / {r.deaths}D · {Math.round(r.damage)} dmg</div>
                </div>
                {/* Gilt when he won any, and dead stone when he won none — the
                    column has to read at a glance as the reason the row is where
                    it is, which is the whole of what the owner asked for. */}
                <div className={`font-display w-7 shrink-0 text-center text-base leading-none ${
                  r.roundsWon > 0 ? "text-amber-300" : "text-[var(--ink-ghost)]"
                }`}>{r.roundsWon}</div>
                <div className="w-16 shrink-0 text-right text-[11px] font-bold leading-tight">
                  <div className="text-amber-300">+{r.xpEarned} XP</div>
                  <div className="flex items-center justify-end gap-1 text-yellow-500"><Coins size={9} />+{r.goldEarned}</div>
                </div>
              </div>
            ))}
            {/* The pay is the server's to give. When it does not arrive the
                honest thing is to say so on the screen that shows the number,
                not to quietly print a total that includes it. */}
            {payState === "unpaid" && (
              <div className="px-2.5 py-1 text-[11px] leading-snug text-red-300/90">
                This pay has not reached the war rolls — your hoard is unchanged.
              </div>
            )}
            {payState === "asking" && (
              <div className="animate-pulse px-2.5 py-1 text-[10px] tracking-[0.18em] text-[var(--ink-dim)]">WEIGHING THE PAY…</div>
            )}
          </div>
        </div>
        <div className="flex gap-2.5">
          <button onClick={onFightAgain} disabled={waiting} data-snd="confirm"
            className="btn-primary min-w-0 flex-1 whitespace-nowrap !min-h-[3.5rem] !px-3 !text-[13px] sm:!text-sm">
            {waiting
              ? <span className="animate-pulse tracking-[0.14em]">MUSTERING…</span>
              : <><Swords size={16} className="shrink-0" /> FIGHT AGAIN</>}
          </button>
          <button onClick={onLeave} data-snd="back"
            className="btn-ghost min-w-0 flex-1 whitespace-nowrap !min-h-[3.5rem] !px-3 !text-[13px] sm:!text-sm">
            LEAVE
          </button>
        </div>
        {/* THE CLIP (7.9): the final kill, recorded through the replay's own
            lens, one tap from saved. Renders only when a real clip exists. */}
        {onSaveClip && (
          <button onClick={onSaveClip} data-snd="confirm" data-clip="save"
            className="btn-ghost w-full whitespace-nowrap !min-h-[2.9rem] !px-3 !text-[12px]">
            <Flag size={14} className="shrink-0" /> SAVE THE CLIP — THE FINAL KILL, SLOW
          </button>
        )}
        <InstallInvite won={mine?.isWinner === true} />
      </div>
    </div>
  );
}

/**
 * THE EARNED INSTALL PROMPT — the last third of backlog 8.9 / Wave F.
 *
 * Renders under the summary's own buttons and ONLY after a match this man won.
 * `client/install.ts` holds the rule and the storage; this holds the words.
 *
 * It is deliberately the quietest thing on the screen — a row, not a modal —
 * because the picture behind this overlay is the victor's tableau, and
 * interrupting that with a dialog is the opposite of having earned the ask.
 *
 * TWO ARMS, because there are two kinds of browser. Chromium hands over a real
 * prompt. Safari on iOS never will — an install there is Share -> Add to Home
 * Screen, by hand — so the honest offer there is a sentence telling him how,
 * and a button that pretended otherwise would be a button that does nothing.
 *
 * AND IT SAYS HEARTH, NOT "ADD TO HOME SCREEN": the game already calls a kept
 * place a hearth everywhere it speaks (`heorthwerod`, the hearth-troop, is the
 * clan), so the invitation uses the word the rest of the game uses.
 */
function InstallInvite({ won }: { won: boolean }) {
  // Through the store, not through an effect. Everything the answer depends on
  // is client-only — a captured event, a media query, a storage key — so
  // reading it during render would hydrate a different tree than the server
  // sent, and reading it in an effect and calling setState is what the react
  // gate forbids. `useSyncExternalStore` is the shape React provides for
  // exactly this question, and the server's answer is always "none".
  const available = useSyncExternalStore(subscribeInstall, installSnapshot, installServerSnapshot);
  const offer = offerFor(won, available);
  if (offer === "none") return null;
  if (offer === "ios") {
    return (
      <div className="flex items-center gap-2 rounded border border-amber-400/25 bg-black/40 px-3 py-2 text-[11px] leading-tight text-[#c9ba95]">
        <span className="flex-1">
          KEEP THE MOOT BY YOUR HEARTH — <span className="text-amber-200">Share</span>, then{" "}
          <span className="text-amber-200">Add to Home Screen</span>.
        </span>
        <button onClick={dismissOffer} data-snd="back"
          className="shrink-0 px-2 text-[11px] tracking-widest text-[#8d8168] hover:text-amber-200">
          NOT NOW
        </button>
      </div>
    );
  }
  return (
    <button
      data-snd="confirm"
      data-install="offer"
      onClick={() => { void askToInstall(); }}
      className="btn-ghost w-full whitespace-nowrap !min-h-[2.9rem] !px-3 !text-[12px]">
      KEEP THE MOOT BY YOUR HEARTH
    </button>
  );
}

// The same score, after the last round, where it explains the result rather
// than tracking it.
function MatchTally({ data, playerId }: { data: MatchEndData; playerId: string }) {
  const of = data.roundTarget || 1;
  const wins = data.roundWins || {};
  if ((data.bestOf || 1) <= 1) return null;
  if (data.roundScoreBy === "team") {
    return (
      <div className="round-hud">
        <span className={data.winnerTeam === "red" ? "text-amber-200" : "text-[var(--ink-dim)]"}>RED</span>
        <Pips won={wins.red || 0} of={of} />
        <span className="text-[var(--ink-faint)]">BEST OF {data.bestOf}</span>
        <Pips won={wins.blue || 0} of={of} blue />
        <span className={data.winnerTeam === "blue" ? "text-amber-200" : "text-[var(--ink-dim)]"}>BLUE</span>
      </div>
    );
  }
  return (
    <div className="round-hud">
      <span className="text-[var(--ink-faint)]">BEST OF {data.bestOf}</span>
      <span className="text-amber-200">YOUR ROUNDS</span>
      <Pips won={wins[playerId] || 0} of={of} />
      <span className="text-[var(--ink-faint)]">· {data.roundsPlayed} FOUGHT</span>
    </div>
  );
}
