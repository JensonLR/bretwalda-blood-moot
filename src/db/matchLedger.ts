import { getEngine } from "@/game/engine.mjs";
import type { MatchEndData, MatchResult } from "../game/types";

/**
 * What a match actually paid, remembered by the server that paid it.
 *
 * The economy only means something if the client cannot name its own reward.
 * `endMatch` in the engine already computes every player's gold and xp from
 * totals the simulation accumulated — the problem is that the number then
 * exists only inside a broadcast on its way to a browser, and a profile route
 * asked to "add 90 gold" has no way to tell that from "add 90000".
 *
 * So this reads the payout off the wire on the way out. Every session's sender
 * is wrapped, `match_end` is caught as it leaves, and the engine's own numbers
 * are held here until the owning profile comes to collect. A client can then
 * only claim an award the server has already decided on, once.
 *
 * THIS IS A STAND-IN. The right shape is one hook in `endMatch` — an
 * `onMatchEnd(results)` the engine calls — and the day `src/game/engine.mjs`
 * grows one, this file becomes the subscriber and the patching below is
 * deleted. It lives here rather than in the engine because the engine belongs
 * to another wave and a hook I add today is a merge conflict for them.
 *
 * Everything it does is wrapped in try/catch and it never throws back into the
 * engine: a mistake in here has to cost a player his match gold, never the
 * match.
 */

export interface MatchAward {
  playerId: string;
  name: string;
  gold: number;
  xp: number;
  kills: number;
  deaths: number;
  isWinner: boolean;
  roomCode: string;
  mode: string;
  playerCount: number;
  at: number;
  /** Which witnessed match it came from, so the history row is written once. */
  matchKey: string;
  /** Profile id that took this award, if any. A second taker is refused. */
  claimedBy: number | null;
}

interface WitnessedMatch {
  roomCode: string;
  mode: string;
  data: MatchEndData;
  at: number;
  historyWritten: boolean;
}

interface Ledger {
  awards: Map<string, MatchAward>;
  matches: Map<string, WitnessedMatch>;
  /** playerId -> profile id that spoke for it first. */
  binds: Map<string, { profileId: number; at: number }>;
  /** playerId -> the room it was last seen in, learned from round_end. */
  rooms: Map<string, { code: string; mode: string; at: number }>;
  /** Frames already processed, so one broadcast to eight sockets is one match. */
  frames: Map<string, number>;
  installed: boolean;
}

const globalForLedger = globalThis as typeof globalThis & { __bretwaldaLedger?: Ledger };

function ledger(): Ledger {
  if (!globalForLedger.__bretwaldaLedger) {
    globalForLedger.__bretwaldaLedger = {
      awards: new Map(), matches: new Map(), binds: new Map(),
      rooms: new Map(), frames: new Map(), installed: false,
    };
  }
  return globalForLedger.__bretwaldaLedger;
}

/** An award nobody collects is a player who closed the tab. Forget it. */
const AWARD_TTL_MS = 45 * 60_000;
const BIND_TTL_MS = 4 * 60 * 60_000;
const FRAME_TTL_MS = 5 * 60_000;

function sweep(now: number): void {
  const l = ledger();
  l.awards.forEach((a, k) => { if (now - a.at > AWARD_TTL_MS) l.awards.delete(k); });
  l.matches.forEach((m, k) => { if (now - m.at > AWARD_TTL_MS) l.matches.delete(k); });
  l.binds.forEach((b, k) => { if (now - b.at > BIND_TTL_MS) l.binds.delete(k); });
  l.rooms.forEach((r, k) => { if (now - r.at > BIND_TTL_MS) l.rooms.delete(k); });
  l.frames.forEach((t, k) => { if (now - t > FRAME_TTL_MS) l.frames.delete(k); });
}

function isBot(id: string): boolean {
  return id.startsWith("bot_");
}

function observeRoundEnd(frame: string): void {
  const parsed = JSON.parse(frame) as { data?: { code?: string; mode?: string; players?: Record<string, unknown> } };
  const d = parsed.data;
  if (!d?.code || !d.players) return;
  const now = Date.now();
  for (const id of Object.keys(d.players)) {
    if (isBot(id)) continue;
    ledger().rooms.set(id, { code: String(d.code), mode: String(d.mode || "unknown"), at: now });
  }
}

function observeMatchEnd(frame: string): void {
  const l = ledger();
  const now = Date.now();
  // `broadcast` stringifies once and hands the same string to every socket in
  // the room, so frame identity is exactly "one match end", with no guessing
  // from timestamps or contents.
  if (l.frames.has(frame)) return;
  l.frames.set(frame, now);
  sweep(now);

  const parsed = JSON.parse(frame) as { data?: MatchEndData };
  const data = parsed.data;
  if (!data || !Array.isArray(data.results)) return;

  const humans = data.results.filter((r: MatchResult) => r && typeof r.id === "string" && !isBot(r.id));
  if (humans.length === 0) return;

  const room = l.rooms.get(humans[0].id);
  const roomCode = room?.code ?? "";
  const mode = room?.mode ?? "unknown";
  const matchKey = `${roomCode}:${now}`;
  l.matches.set(matchKey, { roomCode, mode, data, at: now, historyWritten: false });

  for (const r of humans) {
    l.awards.set(r.id, {
      playerId: r.id,
      name: typeof r.name === "string" ? r.name.slice(0, 20) : "",
      // Read straight off the engine's own payout. Nothing here is arithmetic
      // of ours, so the shop price of a match cannot drift from what the
      // scoreboard told the player he had earned.
      gold: Math.max(0, Math.floor(Number(r.goldEarned) || 0)),
      xp: Math.max(0, Math.floor(Number(r.xpEarned) || 0)),
      kills: Math.max(0, Math.floor(Number(r.kills) || 0)),
      deaths: Math.max(0, Math.floor(Number(r.deaths) || 0)),
      isWinner: !!r.isWinner,
      roomCode, mode, playerCount: data.results.length,
      at: now, matchKey, claimedBy: null,
    });
  }
}

function observe(frame: string): void {
  if (frame.charCodeAt(0) !== 123) return; // not an object; nothing we send
  if (frame.startsWith('{"type":"match_end"')) observeMatchEnd(frame);
  else if (frame.startsWith('{"type":"round_end"')) observeRoundEnd(frame);
}

type Sender = (msg: string) => void;

function wrap(sender: Sender | null): Sender | null {
  if (!sender) return sender;
  const wrapped: Sender = (msg) => {
    try { observe(msg); } catch { /* the frame still has to reach the player */ }
    sender(msg);
  };
  return wrapped;
}

/**
 * Wraps the live engine's session senders. Idempotent, and safe to call from
 * every request: the first profile call of a process installs it, which is
 * always before that player can finish a match.
 */
export function installMatchLedger(): void {
  const l = ledger();
  if (l.installed) return;
  l.installed = true;
  try {
    const engine = getEngine() as unknown as {
      connect(sender: Sender | null): string;
      attachSender(sid: string, sender: Sender): boolean;
    };
    const realConnect = engine.connect.bind(engine);
    const realAttach = engine.attachSender.bind(engine);
    engine.connect = (sender) => realConnect(wrap(sender));
    engine.attachSender = (sid, sender) => realAttach(sid, wrap(sender) as Sender);
  } catch {
    // An engine that cannot be wrapped means no server-side awards, which the
    // routes report as local mode rather than as a broken game.
    l.installed = false;
  }
}

/** True when this process is actually witnessing payouts. */
export function ledgerInstalled(): boolean {
  return ledger().installed;
}

/**
 * Reserves an engine player id for a profile, on the `join` message.
 *
 * This is not optional. An award nobody reserved is paid to nobody — see
 * `claimAward` — because the engine id is visible to every other phone in the
 * lobby the moment the room snapshot goes out, and first-to-ask would hand a
 * man's pay to whoever tapped fastest.
 *
 * Two rules make the reservation mean something. First bind wins, which is
 * safe because the id is a random UUID delivered to exactly one socket, so at
 * join time the owner is the only one who has seen it. And a bind is refused
 * once the fight has been paid, so nobody can wait for a match to end and then
 * reach back for an award its owner never reserved.
 */
export function bindPlayer(playerId: string, profileId: number): boolean {
  if (typeof playerId !== "string" || playerId.length < 8 || playerId.length > 64) return false;
  const l = ledger();
  const existing = l.binds.get(playerId);
  if (existing) return existing.profileId === profileId;
  if (l.awards.has(playerId)) return false;
  l.binds.set(playerId, { profileId, at: Date.now() });
  return true;
}

/**
 * Which profile reserved this engine player id, if any.
 *
 * Added for the war (`src/db/war.ts`): at match end the engine reports points
 * by ENGINE player id, and the only thing in this process that knows whose
 * they are is the bind map above. A read, and nothing more — the war cannot
 * create a bind, and an unbound man simply banks nothing.
 */
export function boundProfile(playerId: string): number | null {
  const bind = ledger().binds.get(playerId);
  return bind ? bind.profileId : null;
}

export type ClaimStatus = "granted" | "already" | "none" | "not_yours" | "not_bound";

export interface ClaimOutcome {
  status: ClaimStatus;
  award?: MatchAward;
  /** Set on the first claim only, when a match_history row is owed. */
  match?: WitnessedMatch;
}

/**
 * Hands a witnessed award to the profile that reserved it, exactly once.
 *
 * An unreserved award is paid to nobody, deliberately. Losing a match's gold
 * because a client skipped `bindPlayer` is a bug somebody notices and fixes;
 * paying it to whichever phone in the lobby asked first is a bug that looks
 * like nothing and quietly makes the shop a race.
 *
 * A repeat claim answers "already" rather than paying again, so a client that
 * retries a lost response is not punished and not paid twice.
 */
export function claimAward(playerId: string, profileId: number): ClaimOutcome {
  const l = ledger();
  const award = l.awards.get(playerId);
  if (!award) return { status: "none" };
  const bind = l.binds.get(playerId);
  if (!bind) return { status: "not_bound", award };
  if (bind.profileId !== profileId) return { status: "not_yours" };
  if (award.claimedBy !== null) {
    return { status: award.claimedBy === profileId ? "already" : "not_yours", award };
  }
  award.claimedBy = profileId;
  l.binds.set(playerId, { profileId, at: Date.now() });
  const match = l.matches.get(award.matchKey);
  if (match && !match.historyWritten) {
    match.historyWritten = true;
    return { status: "granted", award, match };
  }
  return { status: "granted", award };
}

/** Test seam: drop everything witnessed so far. */
export function resetLedger(): void {
  const l = ledger();
  l.awards.clear(); l.matches.clear(); l.binds.clear(); l.rooms.clear(); l.frames.clear();
}
