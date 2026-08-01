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

/** True when the deployment was given a database at all. */
export function isDatabaseConfigured(): boolean {
  return !!databaseUrl;
}

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
    });
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

/** Test seam: forget the breaker so a probe can retry immediately. */
export function resetDbBreaker(): void {
  breakerUntil = 0;
  schemaReady = null;
}
