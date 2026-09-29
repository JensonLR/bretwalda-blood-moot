"use client";

// ============================================================
// shared.ts — the types, tables and lazily-loaded preview that more than one of the six component
// files (and `Page()`) need.
//
// MOVED, NOT REWRITTEN. The F0 scaffold of the UI overhaul lifted these declarations out of the
// head of `src/app/page.tsx`, above `Page()`, byte for byte: the only edits are the `export`
// keywords and the re-pointed relative imports. The commit that made the move records the
// before/after frame comparison that shows nothing on screen changed.
//
// Contains: CharacterPreview, RoomState, Link, Notice, WarOutcomeMsg, WARRIOR_INFO.
// Owner: none in particular. This is the one place where a shared name lives: anything only one
// component file uses stays in that file, and a name is added here only when a second file needs
// it.
// ============================================================

// UNIT LETTERS, used by every file in this folder and by the fenced blocks in `globals.css`:
//   T  title screen, join, the menu shell        (shell.tsx, the landing block of page.tsx)
//   L  lobby, create, training, muster, classes  (lobbyParts.tsx)
//   A  the armoury shop                          (armouryParts.tsx)
//   W  the war layer: map, oath, hearth          (warParts.tsx, src/app/factions/, factionMap/)
//   S  the Saga, marks and the glyph library     (sagaParts.tsx)
//   H  the combat HUD and the match summary      (hudParts.tsx, GameHud.tsx)
//
// `"use client"` is here because of `CharacterPreview` below: `next/dynamic` with `ssr: false` is a
// client-only call, and a module that makes it must not be pulled into a server component by accident.
// Everything else in this file is data or a type and is fine to import from anywhere client-side.

import { Swords, Shield, Wind, Hammer } from "lucide-react";
import type {
  GamePlayer, WarriorClass, RoundResult, RoundScoreBy, BracketMatch,
} from "../../game/types";
import dynamic from "next/dynamic";

export const CharacterPreview = dynamic(() => import("../../game/client/CharacterPreview"), { ssr: false });

export interface RoomState {
  code: string; mode: string; state: string; arena: string;
  players: Record<string, GamePlayer>; hostId: string;
  countdown: number; matchTimer: number;
  killFeed: Array<{ killerName: string; victimName: string; timestamp: number; cause?: string }>;
  lastStandTriggered: boolean;
  // The round state rides on every snapshot, so the screens never keep their
  // own copy of the score — the server is the only thing that knows it.
  bestOf: number; roundIndex: number; roundTarget: number;
  roundWins: Record<string, number>; roundScoreBy: RoundScoreBy;
  lastRound: RoundResult | null; nextRoundAt: number;
  /**
   * THE MEAD-BENCH (7.9b): men who joined while the fight ran, watching
   * through the spectate lens. This client is seated exactly when its own id
   * is here and not in `players` — absence from `players` is the fact the
   * whole watcher path keys off, this list is how it is told apart from
   * "kicked" or "not yet joined".
   */
  seats?: Array<{ id: string; name: string }>;
  /** The Tournament Moot's whole tree (7.3), stages first-round-first; null
   *  outside a tournament. `bracketNames` is the name-book — a knocked-out
   *  man may leave, and the tree must still say who fought in it. */
  bracket?: BracketMatch[][] | null;
  bracketNames?: Record<string, string> | null;
  /** The stake, decided at creation: a friendly moot the war is not watching. */
  friendly?: boolean;
  /** Open to strangers — set only through quickplay/war_party's closure,
   *  never off the wire. Gates the WAR PARTY button (a public room is
   *  already at the war). */
  public?: boolean;
  /**
   * THE NAMED GROUND THIS MATCH IS FOUGHT OVER, and it has been on the wire all
   * along with nothing rendering it. `engine.mjs`'s `territoryBlock` puts it on
   * every snapshot; until now a player could fight a whole season without ever
   * learning where. `holder` is who holds it as the war front last said, which
   * is what makes "you are taking this off somebody" a sentence.
   */
  territory?: { id: string; name: string; native: string; holder: string } | null;
  /**
   * HOW MANY AUTHORITATIVE SNAPSHOTS HAVE LANDED, stamped by this client and
   * never by the server. Read by `GameCanvas` as `ctx.wireEpoch` and by nothing
   * else; see `stampSnapshot` below for why it is counted here and what went
   * wrong when it was counted anywhere else.
   *
   * Optional because it is absent for exactly one value — the `null` this holds
   * before the first packet — and because the wire itself never carries it.
   */
  wireSeq?: number;
}

// Where this player's hoard actually lives. "reaching" is the second or two
// before the first answer comes back, and it is a real state: the armoury must
// not offer a device-local purchase during it and then be overruled.
export type Link = "reaching" | "server" | "local";

// One banner, two tones. A purchase that failed has to say so, and it has to
// say so on the screen the player pressed the button on.
export interface Notice { text: string; tone: "bad" | "good" }

/** One man's share of what a match did to the war. Mirrors `src/db/war.ts`. */
export interface WarOutcomeMsg {
  playerId: string;
  kind: "banked" | "unsworn" | "guest" | "no_points" | "already" | "unavailable" | "friendly" | "practice";
  people?: string;
  points?: number;
  territoryId?: string;
  /** Set when THIS man's points took the ground off somebody. */
  flip?: { territoryId: string; from: string; to: string };
}

/**
 * THE FOUR MEN, AND THEY ARE NAMED IN THE LANGUAGE THE GAME IS SET IN.
 *
 * `id` is the wire's and the engine's and never changes — `WARRIOR_STATS`,
 * every save, every harness and the ledger are all keyed on it. What is written
 * here is only what a player READS, which is why two of these could be
 * corrected at no cost at all.
 *
 *   WEARD, not "warden". The same word, spelled as Old English spells it.
 *   WRECCA, not "runekeeper". THERE ARE NO RUNES IN THIS CLASS AND THERE NEVER
 *     WERE — 92 health, the fastest man on the roster, the largest dodge in the
 *     game at 5.6 m, the weakest guard at 0.35, and SHADOW STEP. That is not a
 *     mystic, it is a man with no shield wall to stand in. `wrecca` is the Old
 *     English for exactly that man: the exile, the lordless fighter, the word
 *     `The Wanderer` is built on. The old name was also a class in somebody
 *     else's fantasy game, which is the one thing this project has a standing
 *     rule against.
 *
 * And his weapons are named for what `characters.ts` actually builds: the class
 * "fights with a seax in each hand", single-edged with the broken-back spine
 * (`characters.ts:10250`). "Twin daggers" was describing real Anglo-Saxon kit
 * in a word that could belong to anything.
 */
export const WARRIOR_INFO: Array<{ id: WarriorClass; name: string; desc: string; Icon: typeof Swords }> = [
  { id: "huscarl", name: "HUSCARL", desc: "Shield & sword. Unbreakable.", Icon: Shield },
  { id: "warden", name: "WEARD", desc: "Balanced blade. Reliable.", Icon: Swords },
  { id: "runekeeper", name: "WRECCA", desc: "Twin seaxes. The exile's speed.", Icon: Wind },
  { id: "berserker", name: "BERSERKER", desc: "Danish axe. Pure rage.", Icon: Hammer },
];
