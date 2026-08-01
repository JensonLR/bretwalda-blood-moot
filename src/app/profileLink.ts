import type { Appearance } from "../game/client/characters";

/**
 * The client's half of the profile store.
 *
 * `src/app/api/profile/README.md` is the contract; this file is the only place
 * in the client that knows it exists. Everything here obeys three rules:
 *
 *   1. **Nothing blocks the first fight.** Every call is fired from an effect
 *      or a handler and the screen is already drawn when it goes out. A hung
 *      request is aborted rather than left to hold a promise open forever.
 *   2. **A dead server is not an error.** `mode: "local"` and an unreachable
 *      host both land on "keep playing, keep the gold on the device" — the
 *      game predates the server and still runs without it.
 *   3. **The client never decides what anything costs or what it is owed.** It
 *      sends ids and asks; the numbers it shows come back in the answer.
 */

export interface ServerProfile {
  id: number;
  name: string;
  level: number; xp: number; gold: number; honour: number;
  kills: number; deaths: number; wins: number; matches: number;
  favoriteClass: string;
  appearance: Appearance;
  unlocked: string[];
  /**
   * The key bindings on the roll, or null for a player who has never saved
   * any. Null is not "defaults" — see `syncBindings`.
   */
  bindings: Record<string, string[]> | null;
  /** Sound off. Unlike the bindings this is never null — false is a real answer. */
  muted: boolean;
  /** Four words. The only way back in on another device. */
  recoveryCode: string;
  createdAt: string;
}

/**
 * Three answers, because the API has three. `refused` carries the server's own
 * sentence — the routes write for a player, and rewording them on the client
 * is how a message ends up saying something the server did not mean.
 */
export type Reply<T> =
  | { kind: "server"; value: T }
  | { kind: "local" }
  | { kind: "refused"; error: string; message: string };

const LOCAL: Reply<never> = { kind: "local" };

const UNREACHABLE = "The war rolls could not be reached.";

/** Long enough for a cold Render dyno, short enough to not feel like a hang. */
const TIMEOUT_MS = 9000;

/**
 * The pay is collected against a clock nothing else is: the room drops back to
 * its lobby ten seconds after a match ends, and an answer that arrives later
 * than that has no screen left to land on. Better to give up early and say so
 * than to be right in an empty room.
 */
const PAY_TIMEOUT_MS = 3500;

/** `{ id, secret }`. The secret is a bearer token; it lives here and nowhere else. */
const LINK_KEY = "bretwalda_link";
/** The pre-server save. Still the store in local mode, and the thing `/claim` takes. */
export const LEGACY_KEY = "bretwalda_profile";
/**
 * Set the first time this browser offers its old save to a server profile,
 * win or lose. The server refuses a second claim of the same save, but only
 * the browser can see the difference between "migrating" and "clearing the
 * link key to mint a fresh profile and hand it the same hoard again".
 */
const MIGRATED_KEY = "bretwalda_migrated";

export interface Creds { id: number; secret: string }

function readStore(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStore(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode; nothing to do */ }
}

export function readCreds(): Creds | null {
  const raw = readStore(LINK_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Creds>;
    if (typeof parsed?.id === "number" && typeof parsed?.secret === "string") {
      return { id: parsed.id, secret: parsed.secret };
    }
  } catch { /* corrupt; treated as absent */ }
  return null;
}

function writeCreds(creds: Creds): void {
  writeStore(LINK_KEY, JSON.stringify(creds));
}

function forgetCreds(): void {
  try { localStorage.removeItem(LINK_KEY); } catch { /* ok */ }
}

interface RawReply {
  ok?: boolean;
  mode?: string;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

async function post<T>(path: string, body: Record<string, unknown>, timeoutMs = TIMEOUT_MS): Promise<Reply<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => null) as RawReply | null;
    if (!json) return { kind: "refused", error: "unreachable", message: UNREACHABLE };
    if (json.ok) return json.mode === "local" ? LOCAL : { kind: "server", value: json as unknown as T };
    return {
      kind: "refused",
      error: typeof json.error === "string" ? json.error : "unknown",
      message: typeof json.message === "string" ? json.message : UNREACHABLE,
    };
  } catch {
    // Aborted, offline, DNS, a proxy eating it — all the same to a player.
    return { kind: "refused", error: "unreachable", message: UNREACHABLE };
  } finally {
    clearTimeout(timer);
  }
}

/** Every authenticated call needs the same two fields, or there is nothing to call. */
async function withCreds<T>(
  path: string, body: Record<string, unknown>, timeoutMs?: number,
): Promise<Reply<T>> {
  const creds = readCreds();
  if (!creds) return LOCAL;
  return post<T>(path, { ...creds, ...body }, timeoutMs);
}

// ------------------------------------------------------------------- boot

export interface BootResult {
  mode: "server" | "local";
  profile: ServerProfile | null;
  /** Set only on the one boot that folded an old localStorage save in. */
  carried: { gold: number; unlocks: number } | null;
  /** Set when the old save was offered and turned down, with the server's reason. */
  carryRefused: string | null;
}

const localBoot: BootResult = { mode: "local", profile: null, carried: null, carryRefused: null };

/**
 * Signs in, or signs up, without the player being asked anything.
 *
 * The whole product is a link in a group chat, so this runs behind the landing
 * screen and its failure mode is that the game carries on exactly as it did
 * before any of this existed. There is no state in which it can stop somebody
 * fighting.
 */
export async function bootProfile(name: string, legacySave: unknown): Promise<BootResult> {
  const existing = readCreds();
  if (existing) {
    const me = await post<{ profile: ServerProfile }>("/api/profile/me", { ...existing });
    if (me.kind === "server") return { mode: "server", profile: me.value.profile, carried: null, carryRefused: null };
    if (me.kind === "local") return localBoot;
    // A key that no longer matches a row is a wiped database or a rotated
    // secret after a recovery on another phone. Either way this device has no
    // profile any more, so it mints one rather than nagging about a login.
    if (me.error === "auth" || me.error === "not_found") forgetCreds();
    else return localBoot;
  }

  const minted = await post<{ id: number; secret: string; profile: ServerProfile }>(
    "/api/profile/new", { name },
  );
  if (minted.kind !== "server") return localBoot;
  writeCreds({ id: minted.value.id, secret: minted.value.secret });

  const claim = await carryOldSave(legacySave);
  return {
    mode: "server",
    profile: claim.profile ?? minted.value.profile,
    carried: claim.carried,
    carryRefused: claim.refused,
  };
}

/**
 * Hands a week of localStorage gold to a profile one second old.
 *
 * A player who has been playing since before there was a server must not open
 * the game to an empty purse; that is the whole reason `/claim` exists. It is
 * offered once per browser — the server's own fences are stronger, but only
 * this side can tell a migration from somebody deleting the link key to be
 * given the same hoard twice.
 */
async function carryOldSave(save: unknown): Promise<{
  profile: ServerProfile | null;
  carried: { gold: number; unlocks: number } | null;
  refused: string | null;
}> {
  const nothing = { profile: null, carried: null, refused: null };
  if (!save || typeof save !== "object") return nothing;
  // A save carrying four words is this server's own mirror of a profile it
  // already keeps, not a hoard from before there was a server. Offering it
  // back would hand the migration its own output to migrate — the server
  // refuses it too, but a request that should never be sent is not sent.
  const code = (save as { recoveryCode?: unknown }).recoveryCode;
  if (typeof code === "string" && code.trim()) return nothing;
  if (readStore(MIGRATED_KEY)) return nothing;
  writeStore(MIGRATED_KEY, "1");

  const reply = await withCreds<{ profile: ServerProfile; granted: { gold: number; unlocks: number } }>(
    "/api/profile/claim", { save },
  );
  if (reply.kind === "server") {
    return { profile: reply.value.profile, carried: reply.value.granted, refused: null };
  }
  // Silent when there is nothing to lose: an empty save being turned down is
  // not news, and a fresh player has never seen the word "migration".
  const worth = (save as { gold?: unknown }).gold;
  const hadGold = typeof worth === "number" && worth > 0;
  return { profile: null, carried: null, refused: reply.kind === "refused" && hadGold ? reply.message : null };
}

// ------------------------------------------------------------ during play

/**
 * Reserves this match's pay before there is any.
 *
 * Mandatory, and the failure is silent by design on the server's side: an
 * unclaimed payout is paid to nobody, because every other phone in the lobby
 * can read this id off a room snapshot. A client that forgets to call this
 * earns zero gold and is told nothing, so it is called on every join, solo
 * included — a wasted request is cheaper than a lost purse the day training
 * starts paying.
 */
export async function bindWarrior(playerId: string): Promise<void> {
  await withCreds<{ bound: boolean }>("/api/profile/bind", { playerId });
}

export interface Pay {
  profile: ServerProfile;
  award: { gold: number; xp: number; kills: number; deaths: number; isWinner: boolean };
  granted: boolean;
}

/**
 * Collects what the engine already decided this fight paid.
 *
 * Retried, because the request goes out at the exact moment a phone is most
 * likely to be switching networks — the end of a match — and the call is
 * built to be safe to repeat: a second attempt for a fight already paid
 * answers with the same totals and `granted: false`. Only a link failure is
 * worth retrying; a refusal is an answer.
 */
export async function collectPay(playerId: string): Promise<Reply<Pay>> {
  let reply = await withCreds<Pay>("/api/profile/match", { playerId }, PAY_TIMEOUT_MS);
  for (let attempt = 0; attempt < 2 && reply.kind === "refused" && reply.error === "unreachable"; attempt++) {
    await new Promise((done) => setTimeout(done, 700 * (attempt + 1)));
    reply = await withCreds<Pay>("/api/profile/match", { playerId }, PAY_TIMEOUT_MS);
  }
  return reply;
}

// ----------------------------------------------------------------- armoury

export interface Purchase {
  profile: ServerProfile;
  /** What the server actually charged. Not what the screen guessed. */
  spent: number;
  bought: string[];
}

/** Buys and equips a basket of armoury ids. Owned ids cost nothing, so this is also EQUIP. */
export async function buyKit(itemIds: string[]): Promise<Reply<Purchase>> {
  return withCreds<Purchase>("/api/profile/purchase", { itemIds });
}

let lastName: string | null = null;

/**
 * Keeps the name on the roll in step with the one over the warrior's head.
 * Free, so it is fire-and-forget, and de-duped so retyping a name in the
 * landing box does not become a write per keystroke.
 */
export async function syncName(name: string): Promise<void> {
  const clean = name.trim().slice(0, 20);
  if (!clean || clean === lastName) return;
  lastName = clean;
  await withCreds<{ profile: ServerProfile }>("/api/profile/equip", { name: clean });
}

let lastBindings: string | null = null;

/**
 * Key order is not information here, and `jsonb` does not keep it: a table
 * comes back out of Postgres ordered by key length, so comparing raw JSON would
 * report every boot's hydrated table as a change and post it straight back.
 */
function canonical(bindings: unknown): string {
  if (!bindings || typeof bindings !== "object") return JSON.stringify(bindings ?? null);
  const src = bindings as Record<string, unknown>;
  return JSON.stringify(Object.keys(src).sort().map((k) => [k, src[k]]));
}

/**
 * Sends the key bindings up, so a remap follows the four words rather than the
 * device it was made on.
 *
 * Free, like the name, so it is fire-and-forget — a player mid-rebind is not
 * waiting on a round trip, and localStorage has already taken the change by the
 * time this is called. De-duped, because the settings screen writes the whole
 * table on every keystroke of a capture. A refusal clears the de-dupe rather
 * than remembering a table the server did not take, so the next change tries
 * again instead of being swallowed as "already sent".
 */
export async function syncBindings(bindings: unknown): Promise<void> {
  const wire = canonical(bindings);
  if (wire === lastBindings) return;
  lastBindings = wire;
  const reply = await withCreds<{ profile: ServerProfile }>("/api/profile/equip", { bindings });
  if (reply.kind !== "server") lastBindings = null;
}

/**
 * Marks a table as already on the server, without sending it. Called with what
 * a profile answered with, so hydrating from the roll does not immediately post
 * the roll back to itself.
 */
export function noteBindingsSynced(bindings: unknown): void {
  lastBindings = canonical(bindings);
}

let lastMuted: boolean | null = null;

/**
 * Sends the mute up, so a player who silenced the game at work finds it silent
 * on his phone. Same shape as `syncBindings` and for the same reason: the
 * device has already taken the change, so nobody waits on this, and a refusal
 * clears the de-dupe so the next tap tries again.
 */
export async function syncMuted(muted: boolean): Promise<void> {
  if (muted === lastMuted) return;
  lastMuted = muted;
  const reply = await withCreds<{ profile: ServerProfile }>("/api/profile/equip", { muted });
  if (reply.kind !== "server") lastMuted = null;
}

/** What the roll already says, so hydrating does not post it straight back. */
export function noteMutedSynced(muted: boolean): void {
  lastMuted = muted;
}

// ---------------------------------------------------------------- recovery

/**
 * Four words typed on a new phone. On success the bearer token is rotated, so
 * the old device is signed out — correct for the case this exists for, which
 * is a phone that is gone.
 */
export async function recoverProfile(recoveryCode: string): Promise<Reply<{ profile: ServerProfile }>> {
  const reply = await post<{ id: number; secret: string; profile: ServerProfile }>(
    "/api/profile/recover", { recoveryCode },
  );
  if (reply.kind !== "server") return reply;
  writeCreds({ id: reply.value.id, secret: reply.value.secret });
  // This device is now that player, so its own old save is not its own any
  // more and must never be offered to the profile it just walked into.
  writeStore(MIGRATED_KEY, "1");
  return { kind: "server", value: { profile: reply.value.profile } };
}
