import { pgTable, text, integer, timestamp, serial, jsonb, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import type { Appearance } from "../game/client/characters";

/**
 * A player, remembered without a signup.
 *
 * The row is deliberately worthless to steal. There is no email, no password,
 * no name the player did not type into a game lobby, and nothing here that
 * identifies a person off this server — the whole account is a pile of
 * cosmetic currency, and a leak costs somebody a helmet.
 *
 * Two things that look like credentials are handled differently on purpose:
 *
 *   `secretHash` is the SHA-256 of the bearer token the client keeps in
 *   localStorage. The token is 256 bits of CSPRNG, so there is nothing to
 *   brute force and nothing slower than SHA-256 is warranted; hashing it means
 *   a dump of this table cannot be replayed against the API.
 *
 *   `recoveryCode` is stored in the clear, and that is a trade rather than an
 *   oversight. It is the only thing that survives a lost phone, and a player
 *   who recovers onto a new device has to be able to read it back off the
 *   profile screen to recover a third time. A hash would make it a
 *   write-once secret that most players lose exactly when they need it.
 */
export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  /** Display name only. Two Aethelreds are two rows — nothing keys off this. */
  name: text("name").notNull().default(""),
  secretHash: text("secret_hash").notNull(),
  /**
   * Four words from `recoveryWords`, space separated, lowercase. Nullable
   * rather than defaulted so the unique index below cannot trip over two rows
   * that both mean "not set yet" — Postgres counts NULLs as distinct.
   */
  recoveryCode: text("recovery_code"),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  gold: integer("gold").notNull().default(0),
  honour: integer("honour").notNull().default(0),
  kills: integer("kills").notNull().default(0),
  deaths: integer("deaths").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  matches: integer("matches").notNull().default(0),
  favoriteClass: text("favorite_class").notNull().default("warden"),
  /** What is equipped. Every value is validated against ARMOURY before it lands here. */
  cosmetics: jsonb("cosmetics").$type<Appearance | Record<string, never>>().notNull().default({}),
  /** ARMOURY option ids the player owns. Free ids are seeded at mint. */
  unlockedCosmetics: jsonb("unlocked_cosmetics").$type<string[]>().notNull().default([]),
  /**
   * The key bindings table, action id -> physical `event.code`s. Validated
   * against the real action list before it lands here (see `db/bindings.ts`).
   *
   * Nullable rather than defaulted, and the null is load bearing: "this player
   * has never saved bindings" is what tells the client to carry the ones already
   * on his device up to the server instead of handing him back defaults and
   * losing a remap he made before this column existed.
   */
  bindings: jsonb("bindings").$type<Record<string, string[]>>(),
  /**
   * Sound off. It rides here for the same reason the bindings do — somebody who
   * silenced the game at work must find it silent on the next device — but
   * unlike them it is NOT nullable: false is a real answer, and there is nothing
   * on a device worth carrying up, so a default is honest here.
   */
  muted: boolean("muted").notNull().default(false),
  /** Set the once a localStorage profile is folded in; a second claim is refused. */
  legacyClaimedAt: timestamp("legacy_claimed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("players_recovery_code_idx").on(t.recoveryCode),
]);

/**
 * One row per match, written once by the first player to claim their pay.
 * Nothing reads it yet; it is what a leaderboard or an "is the economy sane"
 * query would be built from, and it costs one insert per match to have.
 */
export const matchHistory = pgTable("match_history", {
  id: serial("id").primaryKey(),
  roomCode: text("room_code").notNull(),
  mode: text("mode").notNull(),
  winnerId: integer("winner_id"),
  winnerName: text("winner_name"),
  playerCount: integer("player_count").notNull(),
  duration: integer("duration").notNull().default(0),
  results: jsonb("results").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * The replay guard on the localStorage migration.
 *
 * A claim is a gold grant on the client's unverifiable word, so it has to be
 * spendable exactly once. The fingerprint is a hash of the claimed snapshot
 * and the unique index is the guard: two profiles cannot fold in the same
 * saved game, and a double-submitted claim loses the race in the database
 * rather than in a read-then-write we would have to get right under load.
 */
export const legacyClaims = pgTable("legacy_claims", {
  id: serial("id").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  playerId: integer("player_id").notNull(),
  gold: integer("gold").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("legacy_claims_fingerprint_idx").on(t.fingerprint),
  index("legacy_claims_player_idx").on(t.playerId),
]);
