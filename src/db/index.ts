import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";

/**
 * The database is optional, and that is the whole point of this file.
 *
 * This module used to throw at import time when `DATABASE_URL` was missing,
 * which is fine for an app that cannot work without a database and fatal for
 * one that can. Render's free Postgres expires after ninety days; the morning
 * it lapses the game has to fall back to device-local gold, not to a white
 * screen. So every caller gets `null` instead of an exception, and the routes
 * above turn that into "you are in local mode" rather than a 500.
 *
 * A database that is configured but unreachable is treated the same way, with
 * a short circuit breaker so a dead host is asked once every half minute
 * rather than once per request from every phone in the group chat.
 */

const databaseUrl = process.env.DATABASE_URL;

type Db = NodePgDatabase<Record<string, never>>;

const globalForDb = globalThis as typeof globalThis & {
  __bretwaldaPool?: Pool;
  __bretwaldaDb?: Db;
};

/** How long a connection failure keeps us from trying again. */
const BREAKER_MS = 30_000;
let breakerUntil = 0;

function connect(): Db | null {
  if (!databaseUrl) return null;
  if (!globalForDb.__bretwaldaPool) {
    const pool = new Pool({
      connectionString: databaseUrl,
      // A free-tier instance has a small connection ceiling and this process
      // is the only client, so a wide pool buys nothing and can lock us out.
      max: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      // Neon hands out connection strings ending `&channel_binding=require`,
      // and node-postgres SILENTLY IGNORES IT. `pg-connection-string` parses it
      // to `channel_binding`, while the client reads `enableChannelBinding` and
      // defaults it to false — so the parameter that looks like it is pinning
      // the session to the TLS certificate does nothing at all, and the
      // deployment believes it has a protection it does not have.
      //
      // `channel_binding` is a client-side assertion in libpq, not something
      // the server enforces, so the connection succeeds either way. That is
      // exactly what makes it worth setting here rather than leaving: the
      // failure mode is silence.
      //
      // Safe unconditionally. SCRAM-SHA-256-PLUS is only chosen when the
      // socket is TLS and the server offers it; without TLS the driver falls
      // back to plain SCRAM, which is what a local test database does.
      //
      // Cast because `@types/pg` has not caught up with the runtime: pg 8.20's
      // `client.js` reads `enableChannelBinding` off the config, but `PoolConfig`
      // does not declare it. Verified against node_modules/pg/lib/client.js and
      // lib/crypto/sasl.js rather than assumed — drop the cast when the types
      // gain the field.
      enableChannelBinding: true,
    } as ConstructorParameters<typeof Pool>[0] & { enableChannelBinding: boolean });
    // An idle client erroring out is normal when the host recycles. Without a
    // listener it is an unhandled 'error' event, which takes the process down
    // and turns a database hiccup into a game outage.
    pool.on("error", () => { breakerUntil = Date.now() + BREAKER_MS; });
    globalForDb.__bretwaldaPool = pool;
    globalForDb.__bretwaldaDb = drizzle(pool);
  }
  return globalForDb.__bretwaldaDb ?? null;
}

let schemaReady: Promise<boolean> | null = null;

/**
 * Brings the tables up to date in place.
 *
 * There is no migration step in the deploy — `README-deploy.md` is "connect
 * repo, hit deploy" and adding a migrate command to somebody else's Render
 * dashboard is a step that will be skipped once and then debugged for an hour.
 * Every statement here is idempotent, so it costs one round trip on the first
 * request after a boot and nothing afterwards.
 */
async function ensureSchema(db: Db): Promise<boolean> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS players (
        id serial PRIMARY KEY,
        name text NOT NULL DEFAULT '',
        secret_hash text NOT NULL,
        recovery_code text,
        level integer NOT NULL DEFAULT 1,
        xp integer NOT NULL DEFAULT 0,
        gold integer NOT NULL DEFAULT 0,
        honour integer NOT NULL DEFAULT 0,
        kills integer NOT NULL DEFAULT 0,
        deaths integer NOT NULL DEFAULT 0,
        wins integer NOT NULL DEFAULT 0,
        matches integer NOT NULL DEFAULT 0,
        favorite_class text NOT NULL DEFAULT 'warden',
        cosmetics jsonb NOT NULL DEFAULT '{}'::jsonb,
        unlocked_cosmetics jsonb NOT NULL DEFAULT '[]'::jsonb,
        bindings jsonb,
        muted boolean NOT NULL DEFAULT false,
        legacy_claimed_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
    // The table shipped in this repo months before anything used it, with a
    // plaintext `secret` column that no longer exists here. If a database was
    // ever created from that version, these three make it usable rather than
    // making every insert fail on a NOT NULL nobody writes any more.
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS secret_hash text`);
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS recovery_code text`);
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS legacy_claimed_at timestamp`);
    // Key bindings arrived after the table did, and there is no migrate step in
    // this deploy — so the column has to appear on an existing `players` the
    // same way the three above do, on the first request after a boot.
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS bindings jsonb`);
    // And the mute, for the same reason and by the same route.
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS muted boolean NOT NULL DEFAULT false`);
    // THE STEAM DOOR (backlog 7.2): the column lands ahead of the route so
    // every row is already the shape the wrapper needs. Nullable, unique
    // below — one Steam account, one hoard. See schema.ts for the design.
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS steam_id text`);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS players_steam_id_idx ON players (steam_id)`);
    await db.execute(sql`ALTER TABLE players ALTER COLUMN name SET DEFAULT ''`);
    await db.execute(sql`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'players' AND column_name = 'secret') THEN
          ALTER TABLE players ALTER COLUMN secret DROP NOT NULL;
        END IF;
      END $$`);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS players_recovery_code_idx ON players (recovery_code)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS match_history (
        id serial PRIMARY KEY,
        room_code text NOT NULL,
        mode text NOT NULL,
        winner_id integer,
        winner_name text,
        player_count integer NOT NULL,
        duration integer NOT NULL DEFAULT 0,
        results jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamp NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS legacy_claims (
        id serial PRIMARY KEY,
        fingerprint text NOT NULL,
        player_id integer NOT NULL,
        gold integer NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS legacy_claims_fingerprint_idx ON legacy_claims (fingerprint)`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS legacy_claims_player_idx ON legacy_claims (player_id)`);

    // ---- THE WAR ----------------------------------------------------------
    // The third loop (`docs/WHAT-THIS-GAME-IS.md` §3), by the same route as
    // everything above it: idempotent DDL on the first request after a boot,
    // because this deploy is "connect repo, hit deploy" and a migrate step
    // added to somebody else's Render dashboard is a step that gets skipped
    // once and debugged for an hour.
    //
    // The oath rides on `players` rather than in a table of its own. It is one
    // nullable column on a row that already exists for every warrior, and a
    // join to read a man's people on every match end would be a second round
    // trip bought for nothing.
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS allegiance text`);
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS sworn_at timestamp`);
    await db.execute(sql`
      ALTER TABLE players ADD COLUMN IF NOT EXISTS bretwalda_seasons jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS seasons (
        id serial PRIMARY KEY,
        index integer NOT NULL,
        state text NOT NULL DEFAULT 'running',
        started_at timestamp NOT NULL DEFAULT now(),
        ends_at timestamp NOT NULL,
        ended_at timestamp,
        verdict jsonb
      )`);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS seasons_index_idx ON seasons (index)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS territories (
        id serial PRIMARY KEY,
        season_id integer NOT NULL,
        territory_id text NOT NULL,
        holder text NOT NULL,
        threshold integer NOT NULL,
        epoch integer NOT NULL DEFAULT 0,
        contest jsonb NOT NULL DEFAULT '{}'::jsonb,
        cleared integer NOT NULL DEFAULT 0,
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS territories_season_ground_idx
        ON territories (season_id, territory_id)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS war_ledger (
        id serial PRIMARY KEY,
        season_id integer NOT NULL,
        match_key text NOT NULL,
        player_id text NOT NULL,
        profile_id integer NOT NULL,
        people text NOT NULL,
        territory_id text NOT NULL,
        points integer NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )`);
    // THE ONE INDEX THE WHOLE WRITE DEPENDS ON. Without it the attribution
    // write is idempotent only as far as one process's memory reaches, and two
    // Render instances would bank the same match twice.
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS war_ledger_match_player_idx
        ON war_ledger (match_key, player_id)`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS war_ledger_season_profile_idx ON war_ledger (season_id, profile_id)`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS war_ledger_season_ground_idx ON war_ledger (season_id, territory_id)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS war_flips (
        id serial PRIMARY KEY,
        season_id integer NOT NULL,
        territory_id text NOT NULL,
        from_people text NOT NULL,
        to_people text NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS war_flips_season_idx ON war_flips (season_id, created_at)`);

    // ---- THE HEARTHS — backlog 4.4, by the same idempotent route ----------
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS hearths (
        id serial PRIMARY KEY,
        name text NOT NULL,
        people text NOT NULL,
        founder_id integer NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )`);
    // One name, one house, whatever the capitalisation — the join is by name,
    // and two Hearths of the Black Raven differing by a capital B would be a
    // support ticket, not a feature.
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS hearths_name_idx ON hearths (lower(name))`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS hearths_people_idx ON hearths (people)`);
    await db.execute(sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS hearth_id integer`);
    await db.execute(sql`ALTER TABLE war_ledger ADD COLUMN IF NOT EXISTS hearth_id integer`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS war_ledger_season_hearth_idx
        ON war_ledger (season_id, hearth_id) WHERE hearth_id IS NOT NULL`);

    // EXACTLY ONE SEASON RUNS AT A TIME, and Postgres is what says so.
    //
    // `seasons_index_idx` was never enough, and the reason is worth keeping:
    // the rollover race did not produce two rows with the SAME index, it
    // produced 2, 3 and 4 — three callers each deriving "next" from a different
    // snapshot of MAX(index). A unique index on a column nobody collides on
    // refuses nothing. This one is on the invariant that was actually broken,
    // and it is why the fix in `src/db/war.ts` is a fix and not a narrower
    // window. See the comment on `currentSeason` and `tools/warrace.mjs`.
    //
    // IT LIVES DOWN HERE, below `war_ledger`, because the repair below reads
    // that table and this function runs against empty databases.
    //
    // THE REPAIR RUNS FIRST, because a database that already ran the buggy code
    // HAS the corruption in it and `CREATE UNIQUE INDEX` over corrupt data
    // throws — which would fail `ensureSchema`, return null from `getDb`, and
    // drop a live deployment to device-local gold in the name of a repair.
    // Duplicates are marked `orphaned` rather than `ended` so they can never
    // surface as a crown on the map screen, which reads `state = 'ended'`. The
    // one KEPT is the one with the most banked rows under it, so the repair
    // preserves the most player work; ties go to the lowest index, the season
    // whose number correctly follows the one that ended.
    await db.execute(sql`
      UPDATE seasons SET state = 'orphaned', ended_at = coalesce(ended_at, now())
       WHERE state = 'running' AND id <> (
         SELECT s.id FROM seasons s
           LEFT JOIN war_ledger l ON l.season_id = s.id
          WHERE s.state = 'running'
          GROUP BY s.id, s.index
          ORDER BY count(l.id) DESC, s.index ASC
          LIMIT 1)`);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_running_idx
        ON seasons ((state)) WHERE state = 'running'`);
    return true;
  } catch {
    return false;
  }
}

/**
 * The only way into the database. Returns null whenever the game should be
 * running on device-local gold instead — unconfigured, unreachable, or inside
 * the breaker window after a failure.
 */
export async function getDb(): Promise<Db | null> {
  if (!databaseUrl) return null;
  if (Date.now() < breakerUntil) return null;
  const db = connect();
  if (!db) return null;
  if (!schemaReady) schemaReady = ensureSchema(db);
  const ready = await schemaReady;
  if (!ready) {
    // Retry from scratch after the breaker window: a database that was asleep
    // when the first request landed should not be written off for the life of
    // the process.
    schemaReady = null;
    breakerUntil = Date.now() + BREAKER_MS;
    return null;
  }
  return db;
}

/**
 * Runs `fn` against the database, or answers `fallback` if there is no usable
 * database. A query that throws trips the breaker: by then the caller wants an
 * answer, not an exception, because the answer is "play locally".
 */
export async function withDb<T>(fn: (db: Db) => Promise<T>, fallback: T): Promise<T> {
  const db = await getDb();
  if (!db) return fallback;
  try {
    return await fn(db);
  } catch {
    breakerUntil = Date.now() + BREAKER_MS;
    return fallback;
  }
}
