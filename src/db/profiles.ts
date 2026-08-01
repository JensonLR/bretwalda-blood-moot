import { and, eq, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { getDb } from "./index";
import { players, matchHistory, legacyClaims } from "./schema";
import { hashSecret, newRecoveryCode, newSecret, normaliseRecoveryCode, secretMatches } from "./credentials";
import {
  baseAppearance, basketValue, equipIds, idsForAppearance, knownIds,
  priceBasket, sanitizeAppearance, startingUnlocks, type Appearance,
} from "./catalogue";
import { claimAward, installMatchLedger, type MatchAward } from "./matchLedger";
import { bindingsView, sanitizeBindings, type StoredBindings } from "./bindings";

/**
 * Everything the server will do to a profile, and the only place it happens.
 *
 * The rule this file exists to enforce: the client asks, the server decides.
 * Gold is granted only from a payout the match ledger witnessed, spent only
 * against the real armoury catalogue, and an unlock is recorded only after the
 * spend succeeded in the same transaction. Nothing here takes a number from
 * the client and stores it, with one deliberate exception — the one-time
 * migration at the bottom, which is bounded and dated for exactly that reason.
 *
 * Every function answers `{ ok: false, error: "offline" }` rather than throwing
 * when there is no database, because "no database" is a supported way for this
 * game to run and the caller's job is then to tell the client to keep its gold
 * on the device.
 */

export type StoreError =
  | "offline"        // no database, or it is down — play locally
  | "auth"           // id + secret did not match a row
  | "unknown_item"   // an id that is not in the armoury
  | "bad_bindings"   // a key binding table this server would not have written
  | "insufficient_gold"
  | "no_award"       // no witnessed payout for that engine player id
  | "not_yours"      // someone else's payout, or someone else's profile
  | "not_bound"      // nobody reserved that payout at the start of the fight
  | "already_claimed"// this profile has already folded in a local save
  | "replayed"       // that local save has been folded in somewhere already
  | "expired"        // the migration window has closed
  | "not_found";     // no profile answers to that recovery code

export type Result<T> = { ok: true; value: T } | { ok: false; error: StoreError };

const fail = (error: StoreError): { ok: false; error: StoreError } => ({ ok: false, error });
const done = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

/** What a client is allowed to see about its own profile. */
export interface ProfileView {
  id: number;
  name: string;
  level: number;
  xp: number;
  gold: number;
  honour: number;
  kills: number;
  deaths: number;
  wins: number;
  matches: number;
  favoriteClass: string;
  appearance: Appearance;
  unlocked: string[];
  /**
   * The key bindings this player saved, or null if he never has. Null means
   * "the device's own table is the only copy" and the client carries it up;
   * anything else is what follows the four words onto a new device.
   */
  bindings: StoredBindings | null;
  /** Four words. Shown on the profile screen; it is the only way back in. */
  recoveryCode: string;
  createdAt: string;
}

export interface MintedProfile {
  profile: ProfileView;
  /** Returned exactly once, at mint. The server keeps only its hash. */
  secret: string;
}

type PlayerRow = typeof players.$inferSelect;

/**
 * The same curve `src/app/page.tsx` has been drawing since before there was a
 * server. Keeping it identical matters more than whether it is the right
 * curve: a player who watches the client say level 6 and the server say level
 * 5 has found a bug, whatever the formula.
 */
function levelFor(xp: number): number {
  return Math.max(1, Math.floor(1 + Math.sqrt(Math.max(0, xp) / 100)));
}

function view(row: PlayerRow): ProfileView {
  const unlocked = Array.isArray(row.unlockedCosmetics) ? row.unlockedCosmetics : startingUnlocks();
  const stored = row.cosmetics && typeof row.cosmetics === "object" && "helm" in row.cosmetics
    ? row.cosmetics as Appearance
    : baseAppearance(row.favoriteClass);
  return {
    id: row.id,
    name: row.name ?? "",
    level: row.level, xp: row.xp, gold: row.gold, honour: row.honour,
    kills: row.kills, deaths: row.deaths, wins: row.wins, matches: row.matches,
    favoriteClass: row.favoriteClass,
    appearance: sanitizeAppearance(stored, unlocked, baseAppearance(row.favoriteClass)),
    unlocked,
    // Checked on the way out as well as on the way in: a row written by an
    // older build, or by hand, must not be able to hand a client a table its
    // input layer cannot read.
    bindings: bindingsView(row.bindings),
    recoveryCode: row.recoveryCode ?? "",
    createdAt: row.createdAt.toISOString(),
  };
}

async function rowFor(id: number, secret: string): Promise<PlayerRow | null> {
  const db = await getDb();
  if (!db) return null;
  const found = await db.select().from(players).where(eq(players.id, id)).limit(1);
  const row = found[0];
  if (!row || !secretMatches(secret, row.secretHash)) return null;
  return row;
}

function validId(id: unknown): id is number {
  return typeof id === "number" && Number.isInteger(id) && id > 0;
}

/** A cheap guard on the one field a player types about himself. */
export function cleanName(name: unknown): string {
  if (typeof name !== "string") return "";
  return name.replace(/\s+/g, " ").trim().slice(0, 20);
}

// ---------------------------------------------------------------- minting

/**
 * A profile, made silently, with nothing asked of the player.
 *
 * This is called on first load, before any lobby, and it is the reason there
 * is no signup: by the time a player has thought about whether he wants an
 * account he already has one, and the only thing he ever has to keep is four
 * words he can find again on the profile screen.
 */
export async function mintProfile(name: unknown): Promise<Result<MintedProfile>> {
  const db = await getDb();
  if (!db) return fail("offline");
  installMatchLedger();
  const secret = newSecret();
  // A collision on 4.3 billion phrases is not going to happen; a retry loop is
  // three lines and turns "not going to happen" into "cannot happen".
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const inserted = await db.insert(players).values({
        name: cleanName(name),
        secretHash: hashSecret(secret),
        recoveryCode: newRecoveryCode(),
        unlockedCosmetics: startingUnlocks(),
        cosmetics: baseAppearance("warden"),
      }).returning();
      const row = inserted[0];
      if (row) return done({ profile: view(row), secret });
    } catch {
      // Only a recovery-code collision is worth retrying; anything else fails
      // the same way five times and lands on "offline", which is survivable.
    }
  }
  return fail("offline");
}

// ---------------------------------------------------------------- reading

export async function loadProfile(id: unknown, secret: unknown): Promise<Result<ProfileView>> {
  if (!validId(id) || typeof secret !== "string") return fail("auth");
  const db = await getDb();
  if (!db) return fail("offline");
  installMatchLedger();
  const row = await rowFor(id, secret);
  if (!row) return fail("auth");
  return done(view(row));
}

// ---------------------------------------------------------------- writing

export interface Presentation {
  name?: unknown;
  appearance?: unknown;
  favoriteClass?: unknown;
  bindings?: unknown;
}

/**
 * Everything about how a warrior presents that costs nothing: what he is
 * called, what he is wearing out of the kit he owns, and which class he keeps
 * coming back to. One read, one write, whichever of the three changed.
 *
 * The appearance is checked against the catalogue and against this profile's
 * unlocks, so a doctored payload achieves nothing — the slot silently keeps
 * what it had rather than erroring, because there is nothing the player could
 * usefully do about a rejection he did not cause.
 */
export async function setPresentation(
  id: unknown, secret: unknown, next: Presentation,
): Promise<Result<ProfileView>> {
  if (!validId(id) || typeof secret !== "string") return fail("auth");
  const db = await getDb();
  if (!db) return fail("offline");
  const row = await rowFor(id, secret);
  if (!row) return fail("auth");
  const current = view(row);

  const changes: Partial<typeof players.$inferInsert> = { updatedAt: new Date() };
  if (typeof next.name === "string") changes.name = cleanName(next.name);
  if (typeof next.favoriteClass === "string") changes.favoriteClass = next.favoriteClass.slice(0, 20);
  if (next.appearance !== undefined) {
    changes.cosmetics = sanitizeAppearance(next.appearance, current.unlocked, current.appearance);
  }
  if (next.bindings !== undefined) {
    // Refused rather than reduced, unlike the appearance above: a half-kept
    // binding table is a warrior who will not walk on the next device this
    // profile is opened on, and the row is better off keeping what it had.
    const clean = sanitizeBindings(next.bindings);
    if (!clean) return fail("bad_bindings");
    changes.bindings = clean;
  }
  const updated = await db.update(players).set(changes).where(eq(players.id, row.id)).returning();
  return updated[0] ? done(view(updated[0])) : fail("offline");
}

export interface PurchaseOutcome {
  profile: ProfileView;
  /** What this call actually cost. Owned items are free and equipping is free. */
  spent: number;
  bought: string[];
}

/**
 * Buys and equips a basket of armoury ids.
 *
 * The client sends ids and nothing else — no prices, no gold total, no "and
 * my new balance is". Cost comes from the catalogue, ownership from the row,
 * and the whole thing happens inside one transaction with the row locked, so
 * two phones tapping EQUIP at the same moment cannot spend the same gold twice
 * or lose one of the two unlocks.
 */
export async function purchase(
  id: unknown, secret: unknown, itemIds: unknown,
): Promise<Result<PurchaseOutcome>> {
  if (!validId(id) || typeof secret !== "string") return fail("auth");
  if (!Array.isArray(itemIds) || itemIds.length > 32) return fail("unknown_item");
  const db = await getDb();
  if (!db) return fail("offline");

  try {
    return await db.transaction(async (tx) => {
      const found = await tx.select().from(players).where(eq(players.id, id)).limit(1).for("update");
      const row = found[0];
      if (!row || !secretMatches(secret, row.secretHash)) return fail("auth");

      const current = view(row);
      const check = priceBasket(itemIds as string[], current.unlocked);
      if (check.unknown.length > 0) return fail("unknown_item");
      if (check.cost > row.gold) return fail("insufficient_gold");

      const bought = check.toBuy.map((o) => o.id);
      const unlocked = [...new Set([...current.unlocked, ...bought])];
      const appearance = equipIds(current.appearance, itemIds as string[]);
      const updated = await tx.update(players).set({
        gold: row.gold - check.cost,
        unlockedCosmetics: unlocked,
        cosmetics: sanitizeAppearance(appearance, unlocked, current.appearance),
        updatedAt: new Date(),
      }).where(eq(players.id, row.id)).returning();
      const after = updated[0];
      if (!after) return fail("offline");
      return done({ profile: view(after), spent: check.cost, bought });
    });
  } catch {
    return fail("offline");
  }
}

// ---------------------------------------------------------------- earning

export interface AwardOutcome {
  profile: ProfileView;
  award: { gold: number; xp: number; kills: number; deaths: number; isWinner: boolean };
  /** False when this claim was a retry of one already paid. */
  granted: boolean;
}

function honourFor(award: MatchAward): number {
  // Mirrors what page.tsx has always added locally, so the number on the
  // profile screen does not change the day it starts coming from the server.
  return (award.isWinner ? 12 : 3) + award.kills * 2;
}

/**
 * Pays a profile for a match, once, from the ledger's record of what the
 * engine actually awarded.
 *
 * One write per match per player, at the end, off totals the simulation
 * already had — a free-tier database cannot survive a write per kill and does
 * not need to, because the engine is keeping the running totals anyway.
 */
export async function recordMatch(
  id: unknown, secret: unknown, enginePlayerId: unknown,
): Promise<Result<AwardOutcome>> {
  if (!validId(id) || typeof secret !== "string") return fail("auth");
  if (typeof enginePlayerId !== "string") return fail("no_award");
  const db = await getDb();
  if (!db) return fail("offline");

  const claim = claimAward(enginePlayerId, id);
  if (claim.status === "none") return fail("no_award");
  if (claim.status === "not_bound") return fail("not_bound");
  if (claim.status === "not_yours") return fail("not_yours");
  const award = claim.award;
  if (!award) return fail("no_award");

  if (claim.status === "already") {
    const row = await rowFor(id, secret);
    if (!row) return fail("auth");
    return done({ profile: view(row), award, granted: false });
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const found = await tx.select().from(players).where(eq(players.id, id)).limit(1).for("update");
      const row = found[0];
      if (!row || !secretMatches(secret, row.secretHash)) return fail("auth");
      const xp = row.xp + award.xp;
      const updated = await tx.update(players).set({
        gold: row.gold + award.gold,
        xp,
        level: Math.max(row.level, levelFor(xp)),
        kills: row.kills + award.kills,
        deaths: row.deaths + award.deaths,
        wins: row.wins + (award.isWinner ? 1 : 0),
        matches: row.matches + 1,
        honour: row.honour + honourFor(award),
        updatedAt: new Date(),
      }).where(eq(players.id, row.id)).returning();
      const after = updated[0];
      if (!after) return fail("offline");
      return done({ profile: view(after), award, granted: true });
    });

    // Best effort and deliberately outside the transaction: a leaderboard row
    // is not worth failing a payout for.
    if (outcome.ok && claim.match) {
      const m = claim.match;
      try {
        await db.insert(matchHistory).values({
          roomCode: m.roomCode || "unknown",
          mode: m.mode,
          winnerName: m.data.winnerName ?? null,
          playerCount: Array.isArray(m.data.results) ? m.data.results.length : 0,
          results: m.data.results ?? [],
        });
      } catch { /* history is optional; the payout is not */ }
    }
    return outcome;
  } catch {
    return fail("offline");
  }
}

// ---------------------------------------------------------------- recovery

export interface RecoveredProfile extends MintedProfile {
  /** The new bearer token. Recovering rotates it, which logs out the old device. */
  rotated: true;
}

/**
 * Moves a profile onto a new device from four spoken words.
 *
 * The secret is rotated rather than re-issued, because we only ever kept its
 * hash — there is nothing to hand back. The side effect is the honest one: the
 * old phone stops being able to spend that gold, which is what a player who
 * has lost the old phone wants, and a mild annoyance for one who has not.
 */
export async function recoverProfile(code: unknown): Promise<Result<RecoveredProfile>> {
  const phrase = normaliseRecoveryCode(code);
  if (!phrase) return fail("not_found");
  const db = await getDb();
  if (!db) return fail("offline");
  installMatchLedger();
  const found = await db.select().from(players).where(eq(players.recoveryCode, phrase)).limit(1);
  const row = found[0];
  if (!row) return fail("not_found");
  const secret = newSecret();
  const updated = await db.update(players)
    .set({ secretHash: hashSecret(secret), updatedAt: new Date() })
    .where(eq(players.id, row.id)).returning();
  const after = updated[0];
  if (!after) return fail("offline");
  return done({ profile: view(after), secret, rotated: true });
}

// ---------------------------------------------------------------- migration

/**
 * The amnesty, and why it is shaped like one.
 *
 * A localStorage profile is a number the player's own browser wrote. There is
 * no version of this that verifies it, so folding one in is a gold grant on
 * trust, and the only real defences are that it can happen once per profile,
 * once per saved game, up to a ceiling, and not forever. Everything below is
 * one of those four.
 *
 * The ceiling is the whole catalogue plus a little: a player who genuinely
 * bought everything is the largest honest claim there is, so anything beyond
 * that is not a player we are protecting. The date is the important one —
 * an open migration endpoint is a permanent hole, and this one closes whether
 * or not anyone remembers to close it.
 */
const MIGRATION_CLOSES = Date.parse("2026-11-01T00:00:00Z");
const LEGACY_MAX_GOLD = 3000;
const LEGACY_MAX_UNLOCK_VALUE = 8000;
const LEGACY_CAPS = { xp: 250_000, honour: 40_000, kills: 5_000, deaths: 5_000, wins: 2_000, matches: 3_000 };

export interface LegacySave {
  name?: unknown; xp?: unknown; gold?: unknown; honour?: unknown;
  kills?: unknown; deaths?: unknown; wins?: unknown; matches?: unknown;
  unlocked?: unknown; appearance?: unknown;
  /** Only ever written by this server. Its presence is what disqualifies a save. */
  recoveryCode?: unknown;
}

/**
 * A localStorage profile the server itself wrote, rather than one that predates
 * it.
 *
 * The client keeps mirroring the server's totals back into `bretwalda_profile`
 * so that the day the free tier lapses a player degrades to his real hoard and
 * not to a stale one. That mirror is the migration's own output, and offering
 * it back as an old save turns the amnesty into a loop: claim 3000, let the
 * mirror be rewritten, drop the link key, mint again, claim the same 3000. The
 * fingerprint index alone does not stop it, because one fight between the two
 * claims is enough to change the numbers being hashed.
 *
 * A recovery code is the one field a pre-server save can never have had — only
 * the server issues them — so it is the honest discriminator. A player whose
 * database was wiped is refused too, and that is correct: his row is gone, and
 * paying him back from a file he owns is exactly the printing press this is
 * guarding.
 */
function isServerMirror(save: LegacySave): boolean {
  return typeof save.recoveryCode === "string" && save.recoveryCode.trim().length > 0;
}

export interface ClaimOutcome {
  profile: ProfileView;
  /** What was actually folded in after the caps were applied. */
  granted: { gold: number; unlocks: number };
}

function clamp(value: unknown, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, max);
}

/**
 * A stable fingerprint of the saved game being claimed. Two devices holding a
 * copy of the same localStorage produce the same string, which the unique
 * index on `legacy_claims` turns into "the second one loses" without a
 * read-then-write we would have to get right under a race.
 *
 * Only earned kit is hashed. The free ids are seeded at mint, so a save that
 * has been round-tripped through a profile lists them and the original does
 * not — hashing them would make two copies of one hoard look like two hoards.
 */
function fingerprint(save: LegacySave): string {
  const free = new Set(startingUnlocks());
  const canonical = JSON.stringify({
    xp: clamp(save.xp, LEGACY_CAPS.xp),
    gold: clamp(save.gold, LEGACY_MAX_GOLD),
    kills: clamp(save.kills, LEGACY_CAPS.kills),
    deaths: clamp(save.deaths, LEGACY_CAPS.deaths),
    wins: clamp(save.wins, LEGACY_CAPS.wins),
    matches: clamp(save.matches, LEGACY_CAPS.matches),
    unlocked: knownIds(Array.isArray(save.unlocked) ? save.unlocked : [])
      .filter((id) => !free.has(id)).sort(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export async function claimLegacySave(
  id: unknown, secret: unknown, save: unknown,
): Promise<Result<ClaimOutcome>> {
  if (!validId(id) || typeof secret !== "string") return fail("auth");
  if (!save || typeof save !== "object") return fail("already_claimed");
  if (Date.now() > MIGRATION_CLOSES) return fail("expired");
  const db = await getDb();
  if (!db) return fail("offline");

  const legacy = save as LegacySave;
  // Refused before the fingerprint is even taken, so a mirror cannot burn the
  // row that the real save it was made from will need.
  if (isServerMirror(legacy)) return fail("replayed");
  const print = fingerprint(legacy);

  try {
    // Outside the row transaction on purpose: the unique index is the guard,
    // so the claim is spent the moment this insert succeeds, and a crash
    // between here and the update costs the player his old gold rather than
    // handing out a repeatable grant.
    await db.insert(legacyClaims).values({
      fingerprint: print, playerId: id, gold: clamp(legacy.gold, LEGACY_MAX_GOLD),
    });
  } catch {
    return fail("replayed");
  }

  try {
    return await db.transaction(async (tx) => {
      const found = await tx.select().from(players).where(
        and(eq(players.id, id), sql`${players.legacyClaimedAt} IS NULL`),
      ).limit(1).for("update");
      const row = found[0];
      if (!row) return fail("already_claimed");
      if (!secretMatches(secret, row.secretHash)) return fail("auth");

      const current = view(row);
      // Only a profile that has not earned anything yet can take a claim. A
      // player who has already fought here is not migrating, and letting him
      // top up from a file he can edit is the gold printer this whole design
      // is trying not to be.
      if (row.matches > 0 || row.gold > 0) return fail("already_claimed");

      const gold = clamp(legacy.gold, LEGACY_MAX_GOLD);
      const wanted = knownIds(Array.isArray(legacy.unlocked) ? legacy.unlocked : []);
      const affordable: string[] = [];
      let value = 0;
      // Cheapest first, so a claim that runs into the ceiling keeps the kit a
      // player actually wore rather than the one trophy at the top.
      for (const item of [...wanted].sort((a, b) => basketValue([a]) - basketValue([b]))) {
        const cost = basketValue([item]);
        if (value + cost > LEGACY_MAX_UNLOCK_VALUE) continue;
        value += cost;
        affordable.push(item);
      }
      const unlocked = [...new Set([...current.unlocked, ...affordable])];
      const xp = clamp(legacy.xp, LEGACY_CAPS.xp);
      const updated = await tx.update(players).set({
        name: row.name || cleanName(legacy.name),
        gold, xp, level: Math.max(1, levelFor(xp)),
        honour: clamp(legacy.honour, LEGACY_CAPS.honour),
        kills: clamp(legacy.kills, LEGACY_CAPS.kills),
        deaths: clamp(legacy.deaths, LEGACY_CAPS.deaths),
        wins: clamp(legacy.wins, LEGACY_CAPS.wins),
        matches: clamp(legacy.matches, LEGACY_CAPS.matches),
        unlockedCosmetics: unlocked,
        cosmetics: sanitizeAppearance(legacy.appearance, unlocked, current.appearance),
        legacyClaimedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(players.id, row.id)).returning();
      const after = updated[0];
      if (!after) return fail("offline");
      return done({ profile: view(after), granted: { gold, unlocks: affordable.length } });
    });
  } catch {
    return fail("offline");
  }
}

export { idsForAppearance };
