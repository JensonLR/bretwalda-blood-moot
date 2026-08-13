import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getEngine } from "@/game/engine.mjs";
import type { MatchEndReport } from "@/game/engine.mjs";
import {
  PEOPLES, POINTS, TERRITORIES, territory, contestGround, endSeason, front,
  newWar, openingHoldings, standings, SEASON_DAYS,
  type PeopleId, type WarState, type SeasonVerdict,
} from "@/game/war.mjs";
import { getDb, withDb } from "./index";
import { players, seasons, territories, warFlips, warLedger } from "./schema";
import { boundProfile } from "./matchLedger";
import { secretMatches } from "./credentials";

/**
 * THE WAR, PERSISTED — and this file deliberately contains no arithmetic.
 *
 * Every rule the war has lives in `src/game/war.mjs`: what a match is worth,
 * when a border moves, who is crowned. This file loads state, hands it to
 * those functions, and writes back what they returned. `docs/PROCESS.md`
 * failure mode 3 is the same rule written twice and edited once — four
 * instances in `characters.ts` alone — and a flip threshold that existed both
 * in a pure module and in a SQL statement would be that defect with a network
 * hop in it. If you find yourself about to add a `>=` to this file, put it in
 * `war.mjs` and call it from here.
 *
 * WHAT THE ATTRIBUTION WRITE ACTUALLY IS, in three steps and in this order:
 *
 *   1. INSERT the ledger row, ON CONFLICT DO NOTHING. The unique index on
 *      (match_key, player_id) is the guard, and the match key was minted in
 *      `engine.mjs` when the match STARTED — so a retry carries the key it
 *      carried the first time.
 *   2. Only if that insert actually inserted, lock the territory row and move
 *      it. A write that banks the points but skips the territory is a lost
 *      point; a write that moves the territory without the ledger row is a
 *      point banked twice. Both are impossible inside one transaction where
 *      the insert gates the update.
 *   3. Record the flip, if the point caused one.
 *
 * AND WHERE THE PEOPLE COMES FROM. Not from the wire. The engine reports
 * player ids and points and has never heard of allegiance; step 1 resolves
 * each id to the profile that reserved it (`matchLedger.boundProfile`) and
 * reads that profile's SWORN column. A client cannot bank for a people it did
 * not swear to, because it is never asked which people it is.
 *
 * NOTHING HERE MAY THROW INTO THE ENGINE. `installWarLedger` wraps the
 * handler, and every path answers with a value rather than an exception: a
 * database on fire costs a man his banked points and never costs the room its
 * next fight.
 */

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const isPeople = (v: unknown): v is PeopleId =>
  typeof v === "string" && (PEOPLES as readonly string[]).includes(v);

/** A contest map that is complete, whatever the jsonb happened to hold. */
function readContest(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const given = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  for (const p of PEOPLES) out[p] = Math.max(0, Math.floor(Number(given[p]) || 0));
  return out;
}

/* ==========================================================================
   THE SEASON
   ========================================================================== */

interface SeasonRow {
  id: number;
  index: number;
  state: string;
  startedAt: Date;
  endsAt: Date;
  endedAt: Date | null;
  verdict: Record<string, unknown> | null;
}

/**
 * The season that is running, opening one if there is not one, and settling
 * the old one first if its time is up.
 *
 * Concurrency is handled by the two unique indexes rather than by a lock: two
 * processes racing to open season 4 both try `INSERT ... index = 4`, one wins,
 * the loser reads the winner's row. Same for the sixteen territory rows.
 */
async function currentSeason(db: Db): Promise<SeasonRow | null> {
  const running = await db.select().from(seasons)
    .where(eq(seasons.state, "running")).orderBy(desc(seasons.index)).limit(1);
  const row = running[0] as SeasonRow | undefined;

  if (row && row.endsAt.getTime() > Date.now()) return row;
  if (row) {
    // Its time is up. Crown it, then fall through and open the next.
    await settleSeason(db, row);
  }
  return openSeason(db);
}

/** Opens the next season on the map the last one's winner earned. */
async function openSeason(db: Db): Promise<SeasonRow | null> {
  const last = await db.select().from(seasons).orderBy(desc(seasons.index)).limit(1);
  const previous = last[0] as SeasonRow | undefined;
  const index = previous ? previous.index + 1 : 1;
  const winner = previous?.verdict && isPeople((previous.verdict as Record<string, unknown>).people)
    ? ((previous.verdict as Record<string, unknown>).people as PeopleId) : null;

  const { holdings, thresholds } = openingHoldings(winner);
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + SEASON_DAYS * 86_400_000);

  await db.insert(seasons).values({ index, state: "running", startedAt, endsAt })
    .onConflictDoNothing();
  const found = await db.select().from(seasons).where(eq(seasons.index, index)).limit(1);
  const season = found[0] as SeasonRow | undefined;
  if (!season) return null;

  await db.insert(territories).values(TERRITORIES.map((t) => ({
    seasonId: season.id,
    territoryId: t.id,
    holder: holdings[t.id] || t.people,
    threshold: thresholds[t.id] || t.threshold,
    epoch: 0,
    contest: readContest(null),
    cleared: 0,
  }))).onConflictDoNothing();

  return season;
}

/**
 * Load a whole season into the shape `war.mjs` reasons about.
 *
 * Contributions are a SUM over `war_ledger` and are never stored as a running
 * total anywhere. A total kept beside the rows it totals is a total that will
 * one day disagree with them, and the season's crown is settled from it.
 */
async function loadWarState(db: Db, season: SeasonRow): Promise<WarState> {
  const state = newWar({ seasonIndex: season.index, startedAt: season.startedAt.getTime() });
  state.endsAt = season.endsAt.getTime();
  state.state = season.state === "ended" ? "ended" : "running";

  const ground = await db.select().from(territories).where(eq(territories.seasonId, season.id));
  for (const row of ground) {
    if (!territory(row.territoryId)) continue;
    state.territories[row.territoryId] = {
      holder: row.holder,
      threshold: row.threshold,
      epoch: row.epoch,
      contest: readContest(row.contest),
    };
    state.clearedTotal += row.cleared;
  }
  for (const g of Object.values(state.territories)) {
    for (const p of PEOPLES) state.bankedTotal += g.contest[p];
  }
  state.bankedTotal += state.clearedTotal;

  const rolled = await db.select({
    profileId: warLedger.profileId,
    people: warLedger.people,
    points: sql<number>`sum(${warLedger.points})::int`,
    matches: sql<number>`count(distinct ${warLedger.matchKey})::int`,
    firstAt: sql<number>`extract(epoch from min(${warLedger.createdAt}))::bigint`,
  }).from(warLedger).where(eq(warLedger.seasonId, season.id))
    .groupBy(warLedger.profileId, warLedger.people);

  for (const r of rolled) {
    state.contributions[String(r.profileId)] = {
      profileId: r.profileId,
      people: r.people,
      points: Number(r.points) || 0,
      matches: Number(r.matches) || 0,
      firstAt: Number(r.firstAt) || 0,
    };
  }
  return state;
}

/**
 * End a season and crown exactly one Bretwalda.
 *
 * The conditional update is what makes "exactly one" true across processes:
 * `WHERE state = 'running'` returns a row to precisely one caller, and only
 * that caller writes a verdict or marks a profile. Everybody else finds the
 * season already ended and reads the verdict it left.
 */
async function settleSeason(db: Db, season: SeasonRow): Promise<SeasonVerdict | null> {
  const claimed = await db.update(seasons)
    .set({ state: "ended", endedAt: new Date() })
    .where(and(eq(seasons.id, season.id), eq(seasons.state, "running")))
    .returning({ id: seasons.id });
  if (!claimed.length) return null;

  const state = await loadWarState(db, { ...season, state: "running" });
  const verdict = endSeason(state, Date.now());
  await db.update(seasons).set({ verdict: verdict as unknown as Record<string, unknown> })
    .where(eq(seasons.id, season.id));

  // THE PERMANENT, UNBUYABLE MARK. Written here and in no other place in the
  // repository, which is what "unbuyable" has to mean in code.
  const crowned = verdict.bretwalda;
  if (crowned && typeof crowned.profileId === "number") {
    await db.update(players).set({
      bretwaldaSeasons: sql`
        CASE WHEN ${players.bretwaldaSeasons} @> ${JSON.stringify([season.index])}::jsonb
             THEN ${players.bretwaldaSeasons}
             ELSE ${players.bretwaldaSeasons} || ${JSON.stringify([season.index])}::jsonb END`,
      updatedAt: new Date(),
    }).where(eq(players.id, crowned.profileId));
  }
  return verdict;
}

/* ==========================================================================
   THE ATTRIBUTION WRITE
   ========================================================================== */

/** One man's points, moved onto the map exactly once. */
async function bankOne(db: Db, season: SeasonRow, entry: {
  matchKey: string; playerId: string; profileId: number;
  people: PeopleId; territoryId: string; points: number;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(warLedger).values({
      seasonId: season.id,
      matchKey: entry.matchKey,
      playerId: entry.playerId,
      profileId: entry.profileId,
      people: entry.people,
      territoryId: entry.territoryId,
      points: entry.points,
    }).onConflictDoNothing().returning({ id: warLedger.id });
    // ALREADY BANKED. The retry ends here, having moved nothing.
    if (!inserted.length) return false;

    const found = await tx.select().from(territories).where(and(
      eq(territories.seasonId, season.id),
      eq(territories.territoryId, entry.territoryId),
    )).limit(1).for("update");
    const row = found[0];
    if (!row) return false;

    const ground = {
      holder: row.holder, threshold: row.threshold, epoch: row.epoch,
      contest: readContest(row.contest),
    };
    // THE RULE, from war.mjs, applied to a locked row. No `>=` in this file.
    const { flip, cleared } = contestGround(ground, {
      people: entry.people, points: entry.points,
      at: Date.now(), seasonIndex: season.index, territoryId: entry.territoryId,
    });

    await tx.update(territories).set({
      holder: ground.holder, epoch: ground.epoch,
      contest: ground.contest, cleared: row.cleared + cleared,
      updatedAt: new Date(),
    }).where(eq(territories.id, row.id));

    if (flip) {
      await tx.insert(warFlips).values({
        seasonId: season.id, territoryId: flip.territoryId,
        fromPeople: flip.from, toPeople: flip.to,
      });
    }
    return true;
  });
}

/**
 * A finished match, banked into the war.
 *
 * Answers a count rather than throwing, always. A man who was never bound to a
 * profile, or who never swore, banks nothing and costs nobody anything — those
 * are not errors, they are the ordinary state of a stranger who opened a link
 * and fought once.
 */
export async function bankMatch(report: MatchEndReport): Promise<number> {
  if (!report || !report.matchKey || !territory(report.territoryId)) return 0;
  if (!Array.isArray(report.entries) || report.entries.length === 0) return 0;

  return withDb(async (db) => {
    const season = await currentSeason(db);
    if (!season) return 0;

    const claims = report.entries
      .map((e) => ({ entry: e, profileId: boundProfile(e.playerId) }))
      .filter((c): c is { entry: typeof c.entry; profileId: number } => c.profileId !== null);
    if (!claims.length) return 0;

    const sworn = await db.select({ id: players.id, allegiance: players.allegiance })
      .from(players).where(inArray(players.id, claims.map((c) => c.profileId)));
    const people = new Map<number, PeopleId>();
    for (const row of sworn) if (isPeople(row.allegiance)) people.set(row.id, row.allegiance);

    let banked = 0;
    for (const claim of claims) {
      const side = people.get(claim.profileId);
      if (!side) continue;   // unsworn: he fought for himself, and that is allowed
      // Re-clamped against the same constant the engine priced him with. Not a
      // second opinion — the same number — but this process may one day not be
      // the one that ran the match.
      const points = Math.min(POINTS.cap, Math.max(0, Math.floor(claim.entry.points)));
      if (points <= 0) continue;
      if (await bankOne(db, season, {
        matchKey: report.matchKey, playerId: claim.entry.playerId,
        profileId: claim.profileId, people: side,
        territoryId: report.territoryId, points,
      })) banked++;
    }
    if (banked) frontCache = null;   // the map moved; the engine wants to know
    return banked;
  }, 0);
}

/* ==========================================================================
   THE FRONT, PUSHED BACK INTO THE ENGINE
   ========================================================================== */

interface FrontCache { at: number; front: { contested: string[]; holdings: Record<string, string> } }
let frontCache: FrontCache | null = null;
const FRONT_TTL_MS = 30_000;

/**
 * Tell the engine which borders are closest to moving, so matches are dealt
 * where the war actually is. Cached for half a minute and dropped whenever a
 * point is banked, because the alternative is a database read per match end
 * for a number that changes slowly.
 */
export async function refreshFront(): Promise<void> {
  if (frontCache && Date.now() - frontCache.at < FRONT_TTL_MS) return;
  const computed = await withDb(async (db) => {
    const season = await currentSeason(db);
    if (!season) return null;
    return front(await loadWarState(db, season));
  }, null);
  if (!computed) return;
  frontCache = { at: Date.now(), front: computed };
  try { getEngine().setWarFront(computed); } catch { /* an engine is optional to a probe */ }
}

/* ==========================================================================
   THE SUBSCRIPTION
   ========================================================================== */

const globalForWar = globalThis as typeof globalThis & { __bretwaldaWarInstalled?: boolean };

/**
 * Subscribe the war to the engine's match ends. Idempotent, and called once at
 * boot from `src/instrumentation.ts` — the same reasoning the match ledger's
 * install has: a hook that arrives after the first match is a hook that missed
 * one.
 */
export function installWarLedger(): void {
  if (globalForWar.__bretwaldaWarInstalled) return;
  globalForWar.__bretwaldaWarInstalled = true;
  try {
    getEngine().onMatchEnd((report) => {
      // Returned, not awaited: `endMatch` does not wait for Postgres, and the
      // rejection is swallowed here as well as there.
      return bankMatch(report).then(() => refreshFront()).catch(() => {});
    });
  } catch {
    globalForWar.__bretwaldaWarInstalled = false;
  }
}

/* ==========================================================================
   READING THE WAR — what the map screen asks for
   ========================================================================== */

export interface WarView {
  /**
   * `daysLeft` and `elapsed` are computed HERE and not on the client, and the
   * reason is not tidiness. A season's clock is the server's — a phone with a
   * wrong date must not be shown a different number of days to the man beside
   * it, and a React component that reads `Date.now()` while rendering produces
   * a different tree on the server and on the client. Same for `agoMinutes`
   * below. The absolute timestamps are still sent, for anything that wants to
   * format them itself.
   */
  season: {
    index: number; startedAt: number; endsAt: number; state: string; days: number;
    daysLeft: number; elapsed: number;
  };
  territories: {
    id: string; holder: string; threshold: number; epoch: number;
    contest: Record<string, number>;
    /** Points the leading challenger still needs. Null when nobody is pressing. */
    remaining: number | null;
    challenger: string | null;
  }[];
  standings: { people: string; held: number; points: number; contesting: number }[];
  /** What moved, newest first. THE reason to open the game in the morning. */
  recent: { territoryId: string; from: string; to: string; at: number; agoMinutes: number }[];
  /** The Bretwalda race: the top contributor of each people, by name. */
  champions: { people: string; name: string; points: number }[];
  /** Previous seasons' crowns, newest first. */
  crowns: { seasonIndex: number; people: string; name: string | null }[];
}

export async function warView(): Promise<WarView | null> {
  return withDb(async (db) => {
    const season = await currentSeason(db);
    if (!season) return null;
    const state = await loadWarState(db, season);

    const ground = Object.entries(state.territories).map(([id, g]) => {
      const rival = PEOPLES.filter((p) => p !== g.holder)
        .sort((a, b) => g.contest[b] - g.contest[a])[0];
      const pressing = rival && g.contest[rival] > 0;
      // CLAMPED AT ZERO, and the screenshot is why. A territory whose leading
      // challenger is already past the threshold reads "needs -10 more" on the
      // map, which is not a sentence. It is reachable in production the moment
      // a threshold is ever lowered under a contest that is already running —
      // which is precisely what a season reset's discount does to the last
      // champion's ground. Zero means "it falls on the next point banked", and
      // the screen says exactly that.
      return {
        id, holder: g.holder, threshold: g.threshold, epoch: g.epoch, contest: g.contest,
        remaining: pressing
          ? Math.max(0, g.threshold - (g.contest[rival] - g.contest[g.holder]))
          : null,
        challenger: pressing ? rival : null,
      };
    });

    const flips = await db.select().from(warFlips)
      .where(eq(warFlips.seasonId, season.id))
      .orderBy(desc(warFlips.createdAt)).limit(12);

    // The leading man of each people, by name. One query, ordered by the same
    // total rule `endSeason` uses, so the screen's "who is winning the crown"
    // cannot disagree with who actually gets it.
    const leaders = await db.select({
      people: warLedger.people,
      name: players.name,
      points: sql<number>`sum(${warLedger.points})::int`,
    }).from(warLedger)
      .innerJoin(players, eq(players.id, warLedger.profileId))
      .where(eq(warLedger.seasonId, season.id))
      .groupBy(warLedger.people, players.id, players.name)
      .orderBy(desc(sql`sum(${warLedger.points})`), asc(players.id));

    const champions: WarView["champions"] = [];
    for (const row of leaders) {
      if (champions.some((c) => c.people === row.people)) continue;
      champions.push({ people: row.people, name: row.name || "A nameless warrior", points: Number(row.points) || 0 });
    }

    const past = await db.select().from(seasons)
      .where(and(eq(seasons.state, "ended"), gt(seasons.index, 0)))
      .orderBy(desc(seasons.index)).limit(5);
    const crowns = past.map((s) => {
      const v = (s.verdict || {}) as { people?: string; bretwalda?: { profileId?: number } | null };
      return { seasonIndex: s.index, people: v.people || "", name: null as string | null, profileId: v.bretwalda?.profileId };
    });
    const crownedIds = crowns.map((c) => c.profileId).filter((n): n is number => typeof n === "number");
    if (crownedIds.length) {
      const named = await db.select({ id: players.id, name: players.name })
        .from(players).where(inArray(players.id, crownedIds));
      const byId = new Map(named.map((n) => [n.id, n.name]));
      for (const c of crowns) if (c.profileId) c.name = byId.get(c.profileId) || null;
    }

    const now = Date.now();
    const startedAt = season.startedAt.getTime();
    const endsAt = season.endsAt.getTime();
    return {
      season: {
        index: season.index, startedAt, endsAt, state: season.state, days: SEASON_DAYS,
        daysLeft: Math.max(0, Math.ceil((endsAt - now) / 86_400_000)),
        elapsed: Math.min(1, Math.max(0, (now - startedAt) / Math.max(1, endsAt - startedAt))),
      },
      territories: ground,
      standings: standings(state),
      recent: flips.map((f) => ({
        territoryId: f.territoryId, from: f.fromPeople, to: f.toPeople,
        at: f.createdAt.getTime(),
        agoMinutes: Math.max(0, Math.round((now - f.createdAt.getTime()) / 60_000)),
      })),
      champions,
      crowns: crowns.map(({ seasonIndex, people, name }) => ({ seasonIndex, people, name })),
    };
  }, null);
}

/* ==========================================================================
   THE OATH
   ========================================================================== */

export type SwearOutcome =
  | { ok: true; allegiance: PeopleId; locked: boolean }
  | { ok: false; error: "offline" | "auth" | "unknown_people" | "sworn" };

/**
 * Swear to a people.
 *
 * THE OATH IS DURABLE, AND HERE IS EXACTLY HOW DURABLE. A man may change his
 * mind freely until he has banked his first point of the season; after that he
 * is sworn for the rest of it. That line is not arbitrary — without it the
 * correct play is to fight for nobody until the last night of the season and
 * then swear to whoever is about to win, which turns a season-long allegiance
 * into a lottery ticket bought at closing time.
 *
 * Between seasons the oath is free again, which is the other half of the same
 * decision: a man should be able to change sides, and the moment to do it is
 * when the map resets.
 */
export async function swear(id: unknown, secret: unknown, people: unknown): Promise<SwearOutcome> {
  if (!isPeople(people)) return { ok: false, error: "unknown_people" };
  const profileId = Number(id);
  if (!Number.isInteger(profileId) || profileId <= 0) return { ok: false, error: "auth" };
  if (typeof secret !== "string" || !secret) return { ok: false, error: "auth" };

  const db = await getDb();
  if (!db) return { ok: false, error: "offline" };
  try {
    const found = await db.select().from(players).where(eq(players.id, profileId)).limit(1);
    const row = found[0];
    if (!row || !secretMatches(secret, row.secretHash)) return { ok: false, error: "auth" };

    const season = await currentSeason(db);
    if (season) {
      const fought = await db.select({ id: warLedger.id }).from(warLedger).where(and(
        eq(warLedger.seasonId, season.id), eq(warLedger.profileId, profileId),
      )).limit(1);
      if (fought.length && row.allegiance && row.allegiance !== people) {
        return { ok: false, error: "sworn" };
      }
      if (fought.length && row.allegiance === people) {
        return { ok: true, allegiance: people, locked: true };
      }
    }

    await db.update(players)
      .set({ allegiance: people, swornAt: new Date(), updatedAt: new Date() })
      .where(eq(players.id, profileId));
    return { ok: true, allegiance: people, locked: false };
  } catch {
    return { ok: false, error: "offline" };
  }
}

/** A man's own standing in the war, for his own screen. */
export async function warSelf(id: unknown, secret: unknown): Promise<{
  allegiance: string | null; points: number; matches: number;
  bretwaldaSeasons: number[]; locked: boolean;
} | null> {
  const profileId = Number(id);
  if (!Number.isInteger(profileId) || typeof secret !== "string") return null;
  return withDb(async (db) => {
    const found = await db.select().from(players).where(eq(players.id, profileId)).limit(1);
    const row = found[0];
    if (!row || !secretMatches(secret, row.secretHash)) return null;
    const season = await currentSeason(db);
    if (!season) return null;
    const mine = await db.select({
      points: sql<number>`coalesce(sum(${warLedger.points}), 0)::int`,
      matches: sql<number>`count(distinct ${warLedger.matchKey})::int`,
    }).from(warLedger).where(and(
      eq(warLedger.seasonId, season.id), eq(warLedger.profileId, profileId),
    ));
    const points = Number(mine[0]?.points) || 0;
    return {
      allegiance: row.allegiance,
      points,
      matches: Number(mine[0]?.matches) || 0,
      bretwaldaSeasons: Array.isArray(row.bretwaldaSeasons) ? row.bretwaldaSeasons : [],
      locked: points > 0,
    };
  }, null);
}
