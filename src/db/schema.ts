import { pgTable, text, integer, timestamp, serial, jsonb, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  /**
   * THE PEOPLE THIS MAN SWORE TO. One of `war.mjs`'s PEOPLES, or null.
   *
   * Null is the honest default and it is not a placeholder: a man who has not
   * sworn has not sworn, he is not a Saxon by omission, and his matches bank
   * nothing for anybody. That is deliberate — the war is the reason to swear,
   * so it cannot also be the consolation prize for not having.
   *
   * THIS COLUMN IS THE AUTHORITY, and nothing else is. The engine is never
   * told a man's people (see `src/game/war.mjs`), the wire never carries it,
   * and `src/db/war.ts` reads it from here when a match is banked. A client
   * that claims to be Norse in a join message is claiming it to nobody.
   */
  allegiance: text("allegiance"),
  /** When he swore. The oath is durable, so the date is worth keeping. */
  swornAt: timestamp("sworn_at"),
  /**
   * The seasons this man was crowned Bretwalda, oldest first.
   *
   * "A permanent, unbuyable mark" — `docs/WHAT-THIS-GAME-IS.md` §3 — so it
   * lives on the profile rather than in the season it was won in, survives
   * every reset, and there is deliberately no route that writes it except the
   * crowning. It is the one thing in this table that gold cannot buy.
   */
  bretwaldaSeasons: jsonb("bretwalda_seasons").$type<number[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("players_recovery_code_idx").on(t.recoveryCode),
]);

/**
 * A SEASON. Four to six weeks of war, then a Bretwalda and a reset.
 *
 * There is exactly one running season at a time and `index` is its number.
 * `verdict` is written once, at the crowning, and read for ever afterwards by
 * the map screen's history — which is why a finished season is never deleted.
 *
 * The opening `holdings` and `thresholds` are stored rather than recomputed,
 * because `openingHoldings` depends on who won the season before and a season
 * has to still make sense after that rule is next edited.
 */
export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  index: integer("index").notNull(),
  state: text("state").notNull().default("running"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endsAt: timestamp("ends_at").notNull(),
  endedAt: timestamp("ended_at"),
  /** The people that won it and the man that was crowned. Null until it ends. */
  verdict: jsonb("verdict").$type<Record<string, unknown> | null>(),
}, (t) => [
  uniqueIndex("seasons_index_idx").on(t.index),
  /**
   * EXACTLY ONE RUNNING SEASON, enforced by Postgres and not by a comment.
   *
   * `seasons_index_idx` above reads like it already covers this and it does
   * not. The rollover race did not insert two rows with the same index; it
   * inserted 2, 3 and 4, because each racing caller derived "next" from its own
   * snapshot of `MAX(index)`. Three callers colliding on nothing pass a unique
   * index on `index` without touching it. This partial index is on the property
   * that was actually violated, and with it the corruption is unrepresentable:
   * the second `INSERT ... state = 'running'` is refused by the database.
   *
   * `src/db/index.ts` marks pre-existing duplicates `orphaned` before creating
   * it, because a database that already ran the buggy code cannot be indexed
   * until it has been repaired.
   */
  uniqueIndex("seasons_one_running_idx").on(t.state).where(sql`${t.state} = 'running'`),
]);

/**
 * ONE ROW PER TERRITORY PER SEASON — the map itself.
 *
 * `contest` is the points banked against this ground SINCE IT LAST CHANGED
 * HANDS, by people. `cleared` is what previous flips consumed. Together with
 * `war_ledger` they make conservation checkable in SQL rather than on trust:
 *
 *   sum(war_ledger.points) for a territory
 *     ==  sum(territories.contest) + territories.cleared
 *
 * `epoch` counts the flips, and it is what makes "since it last changed hands"
 * a fact rather than a hope.
 */
export const territories = pgTable("territories", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id").notNull(),
  /** A `war.mjs` TERRITORIES id. The table there is the source of truth. */
  territoryId: text("territory_id").notNull(),
  holder: text("holder").notNull(),
  /** Copied from the territory table at season open, so a reset's discount sticks. */
  threshold: integer("threshold").notNull(),
  epoch: integer("epoch").notNull().default(0),
  contest: jsonb("contest").$type<Record<string, number>>().notNull().default({}),
  cleared: integer("cleared").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("territories_season_ground_idx").on(t.seasonId, t.territoryId),
]);

/**
 * THE REPLAY GUARD ON THE WAR, and the whole audit trail besides.
 *
 * One row per man per match. The unique index on (match_key, player_id) is
 * what makes the attribution write idempotent under retry: the insert is
 * attempted first and the territory is only moved when it actually inserted,
 * so a match reported twice — by a retry, by two processes, by a hook
 * installed twice — banks exactly once.
 *
 * The key is minted in `engine.mjs` when the match STARTS, not when the write
 * happens. A key minted at write time is a new key on every retry, which is
 * how this bug survives in every codebase that has it.
 *
 * It is also the ledger the season is settled from: contributions are a SUM
 * over these rows, never a running total kept somewhere else that could
 * disagree with them.
 */
export const warLedger = pgTable("war_ledger", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id").notNull(),
  matchKey: text("match_key").notNull(),
  /** The ENGINE's player id for that match. Not a profile id. */
  playerId: text("player_id").notNull(),
  profileId: integer("profile_id").notNull(),
  /** Read off the profile's sworn allegiance, never off the wire. */
  people: text("people").notNull(),
  territoryId: text("territory_id").notNull(),
  points: integer("points").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("war_ledger_match_player_idx").on(t.matchKey, t.playerId),
  index("war_ledger_season_profile_idx").on(t.seasonId, t.profileId),
  index("war_ledger_season_ground_idx").on(t.seasonId, t.territoryId),
  /**
   * WHERE A MAN STANDS AMONG HIS OWN PEOPLE, and the leaderboard beside it.
   *
   * Both `warSelf`'s rank and `warView`'s `leaders` filter `(season_id, people)`
   * and neither had an index that reached it: the three above cover match+player,
   * season+profile and season+ground, and nothing carried `people` at all. An
   * adversary inflated the table to 401,090 rows and ran EXPLAIN (ANALYZE,
   * BUFFERS) on both — Parallel Seq Scan, ~100,200 rows removed by filter per
   * worker, 71 ms and 90 ms. They run on POST /api/war, which is the endpoint
   * the map reads on every single visit, so that was two full-ledger scans a
   * page load.
   *
   * MEASURED, on a 400,000-row fixture with four peoples in one season: the
   * plan moves from Parallel Seq Scan to Bitmap Index Scan and the query goes
   * 71 ms -> 34.9 ms. It still visits the heap, and a covering variant carrying
   * `profile_id` was tried and REJECTED — 33.9 ms, inside the noise, because at
   * a quarter of the table Postgres will not choose an index-only scan however
   * wide the index is. So `points` rides along for the aggregate and nothing
   * here claims to avoid the heap.
   *
   * The win is larger in production than on that fixture: it filters ONE season
   * of many, where the fixture had a single season and therefore the worst
   * selectivity this index will ever see.
   */
  index("war_ledger_season_people_idx").on(t.seasonId, t.people, t.points),
]);

/**
 * Every time a border moved. THIS IS THE RETENTION THESIS AS A TABLE.
 *
 * `docs/WHAT-THIS-GAME-IS.md` §3: "when you open the game you see what
 * happened overnight". This is what it reads. It is deliberately not derivable
 * from anything else — a flip clears the contest that caused it, so without
 * these rows the fact that Mercia changed hands on Tuesday is simply gone.
 */
export const warFlips = pgTable("war_flips", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id").notNull(),
  territoryId: text("territory_id").notNull(),
  fromPeople: text("from_people").notNull(),
  toPeople: text("to_people").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("war_flips_season_idx").on(t.seasonId, t.createdAt),
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
