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
/** A drizzle transaction handle. Reads work on either; writes below say which. */
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Reader = Db | Tx;

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
 * How many times a caller will re-read and retry the rollover before giving
 * up. Three is a lot: each pass either finds a running season or advances the
 * world by one settled season, so the only way to spend them is to race an
 * unlucky number of times against an unlucky number of processes.
 */
const ROLLOVER_ATTEMPTS = 3;

/**
 * The season that is running, opening one if there is not one, and settling
 * the old one first if its time is up.
 *
 * THIS FUNCTION USED TO RACE, AND THE RACE DELETED THE RESET MECHANIC.
 *
 * Under concurrent callers at the 35-day boundary an adversary got THREE
 * seasons opened — indexes 2, 3 and 4 — each with its own sixteen territory
 * rows, permanently orphaned because the only reader takes the highest index.
 * And in EVERY concurrent run the new season opened dead even, 4/4/4/4 with
 * thresholds 240/320, so the champion's fifth territory and the 0.75 target
 * discount — `docs/WHAT-THIS-GAME-IS.md` §3, `openingHoldings` in `war.mjs` —
 * SILENTLY DID NOT HAPPEN. The reward for winning a season was quietly nothing,
 * and no number in the repository would have said so.
 *
 * There were two races and they were different bugs wearing one symptom:
 *
 *   THE VERDICT RACE. `settleSeason` claimed the season with one UPDATE and
 *   wrote the verdict with a SECOND one. Between them the row said "ended" and
 *   carried no verdict. The claim's LOSER returned immediately and read exactly
 *   that row, saw `verdict = null`, concluded there was no champion, and built
 *   an even map. Whichever caller reached the territory INSERT first won, and
 *   it was usually a loser.
 *
 *   THE INDEX RACE. `openSeason` derived the next index from `MAX(index)` at
 *   the moment it looked. Three callers that look at three different moments
 *   compute 2, 3 and 4 — so the unique index on `seasons.index` never fires,
 *   because nobody is inserting the same number. The guard was real and it was
 *   guarding the wrong quantity.
 *
 * Both are now closed IN THE DATABASE rather than by hoping about timing:
 *
 *   1. The settle is ONE TRANSACTION around `SELECT ... FOR UPDATE`. A second
 *      caller blocks on the row lock and, when it is released, reads a season
 *      that is ended AND carries its verdict. There is no instant at which a
 *      half-settled season is observable, so no caller can read one.
 *   2. The next index is `settled.index + 1` — derived from the season being
 *      REPLACED, never from a running maximum — so every racing caller aims at
 *      the same number and `seasons_index_idx` finally has something to refuse.
 *   3. `seasons_one_running_idx`, a partial unique index on `state = 'running'`,
 *      makes "there is exactly one running season" a fact Postgres enforces
 *      rather than a sentence in a comment. A second one cannot be inserted
 *      even by a caller that has gone wrong in a way nobody has thought of.
 *
 * Gated by `tools/warrace.mjs`, which was written first and shown red first: it
 * printed `1:ended, 2:running, 3:running`, a map of 4/4/4/4 and a minimum
 * threshold of 240 against the code this comment replaces.
 */
async function currentSeason(db: Db): Promise<SeasonRow | null> {
  for (let attempt = 0; attempt < ROLLOVER_ATTEMPTS; attempt++) {
    const running = await db.select().from(seasons)
      .where(eq(seasons.state, "running")).orderBy(desc(seasons.index)).limit(1);
    const row = running[0] as SeasonRow | undefined;
    if (row && row.endsAt.getTime() > Date.now()) return row;

    // THE ANCHOR. Whatever we open next follows a SPECIFIC season and carries
    // ITS verdict — not "the highest index that happens to exist right now",
    // which is what let three callers open three seasons.
    let anchorIndex: number;
    let verdict: SeasonVerdict | null;
    if (row) {
      verdict = await settleSeason(db, row);
      anchorIndex = row.index;
    } else {
      const last = await db.select().from(seasons).orderBy(desc(seasons.index)).limit(1);
      const previous = last[0] as SeasonRow | undefined;
      anchorIndex = previous ? previous.index : 0;
      verdict = (previous?.verdict as SeasonVerdict | null) ?? null;
    }

    const opened = await openSeason(db, anchorIndex + 1, verdict);
    if (opened) return opened;
    // Somebody else got there first and the world has moved. Look again.
  }
  return null;
}

/**
 * Opens ONE named season on the map the last one's winner earned.
 *
 * The index is an argument rather than a lookup, and that is the whole fix for
 * the index race: every caller racing the same boundary asks for the same
 * number, so `seasons_index_idx` refuses all but one of them and the losers
 * read the winner's row.
 *
 * The verdict is an argument too, for the same reason in a different clothing:
 * the sixteen territory rows are computed from it, so two callers holding two
 * different opinions about who won would write two different maps and the one
 * that got there first would stand. `settleSeason` now hands every caller the
 * SAME verdict, so the map they each compute is byte-identical and it no longer
 * matters who wins the insert.
 *
 * Answers `null` — never a wrong season — when the row it opened is not the
 * one now running. The caller looks again.
 */
async function openSeason(
  db: Db, index: number, previousVerdict: SeasonVerdict | null,
): Promise<SeasonRow | null> {
  const winner = previousVerdict && isPeople((previousVerdict as unknown as Record<string, unknown>).people)
    ? ((previousVerdict as unknown as Record<string, unknown>).people as PeopleId) : null;

  const { holdings, thresholds } = openingHoldings(winner);
  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + SEASON_DAYS * 86_400_000);

  try {
    return await db.transaction(async (tx) => {
      // Bare `ON CONFLICT DO NOTHING` — no target — so it swallows BOTH unique
      // indexes: a second season 4, and a second running season of any index.
      await tx.insert(seasons).values({ index, state: "running", startedAt, endsAt })
        .onConflictDoNothing();
      // FOR UPDATE, so the sixteen territory rows are written under the same
      // lock whoever wins the insert, and a reader cannot catch a season with
      // half a map under it.
      const found = await tx.select().from(seasons)
        .where(eq(seasons.index, index)).limit(1).for("update");
      const season = found[0] as SeasonRow | undefined;
      if (!season || season.state !== "running") return null;

      await tx.insert(territories).values(TERRITORIES.map((t) => ({
        seasonId: season.id,
        territoryId: t.id,
        holder: holdings[t.id] || t.people,
        threshold: thresholds[t.id] || t.threshold,
        epoch: 0,
        contest: readContest(null),
        cleared: 0,
      }))).onConflictDoNothing();

      return season;
    });
  } catch {
    // A unique violation Postgres would not swallow, or a serialisation
    // failure. Both mean "somebody else opened it" — answer null and let the
    // caller re-read rather than inventing a season.
    return null;
  }
}

/**
 * Load a whole season into the shape `war.mjs` reasons about.
 *
 * Contributions are a SUM over `war_ledger` and are never stored as a running
 * total anywhere. A total kept beside the rows it totals is a total that will
 * one day disagree with them, and the season's crown is settled from it.
 */
async function loadWarState(db: Reader, season: SeasonRow): Promise<WarState> {
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
 * End a season and crown exactly one Bretwalda — and hand EVERY caller the
 * same verdict, whether it did the crowning or merely waited for it.
 *
 * THE OLD SHAPE, AND WHY IT WAS THE DEFECT. This used to claim the season with
 * one UPDATE (`SET state='ended' WHERE state='running'`), return `null`
 * immediately to whoever lost that claim, and write the verdict in a SECOND
 * statement afterwards. Two things follow, and both of them bit:
 *
 *   * Between the two statements the row is ENDED WITH NO VERDICT. That is a
 *     state the schema permits, the code produced, and nothing forbade — so a
 *     concurrent reader read it and correctly concluded there was no champion.
 *   * The loser's `null` was indistinguishable from "there was genuinely no
 *     winner". `openSeason` took it at face value and dealt an even map.
 *
 * The whole settle is now ONE TRANSACTION, opened by `SELECT ... FOR UPDATE`
 * on the season row. A second caller BLOCKS on that lock instead of guessing,
 * and when it is released it re-reads under the lock, finds the season already
 * ended, and returns THE VERDICT THAT IS THERE. A season has one verdict and
 * now every caller sees it — which is what makes the map they each compute in
 * `openSeason` identical, and therefore what makes it not matter who wins the
 * insert.
 *
 * "Exactly one crowning" is unchanged and is now stronger: the row lock, not a
 * conditional update, is what serialises it, and the crown is written inside
 * the same transaction as the verdict that justifies it.
 */
async function settleSeason(db: Db, season: SeasonRow): Promise<SeasonVerdict | null> {
  try {
    return await db.transaction(async (tx) => {
      const locked = await tx.select().from(seasons)
        .where(eq(seasons.id, season.id)).limit(1).for("update");
      const row = locked[0] as SeasonRow | undefined;
      if (!row) return null;
      // Somebody settled it while we waited on the lock. Theirs is the verdict.
      if (row.state !== "running") return (row.verdict as SeasonVerdict | null) ?? null;

      const state = await loadWarState(tx, { ...row, state: "running" });
      const verdict = endSeason(state, Date.now());

      // ONE STATEMENT for the state AND the verdict. This is the line the bug
      // was in: two statements leave a window, and a window is a thing another
      // process will stand in.
      await tx.update(seasons).set({
        state: "ended", endedAt: new Date(),
        verdict: verdict as unknown as Record<string, unknown>,
      }).where(eq(seasons.id, season.id));

      // THE PERMANENT, UNBUYABLE MARK. Written here and in no other place in
      // the repository, which is what "unbuyable" has to mean in code.
      const crowned = verdict.bretwalda;
      if (crowned && typeof crowned.profileId === "number") {
        await tx.update(players).set({
          bretwaldaSeasons: sql`
            CASE WHEN ${players.bretwaldaSeasons} @> ${JSON.stringify([season.index])}::jsonb
                 THEN ${players.bretwaldaSeasons}
                 ELSE ${players.bretwaldaSeasons} || ${JSON.stringify([season.index])}::jsonb END`,
          updatedAt: new Date(),
        }).where(eq(players.id, crowned.profileId));
      }
      return verdict;
    });
  } catch {
    // The settle failed outright. Answer with whatever verdict is on the row —
    // never with a confident `null`, which is the value that produced an even
    // map the last time this function guessed.
    const found = await db.select().from(seasons).where(eq(seasons.id, season.id)).limit(1);
    return ((found[0] as SeasonRow | undefined)?.verdict as SeasonVerdict | null) ?? null;
  }
}

/* ==========================================================================
   THE ATTRIBUTION WRITE
   ========================================================================== */

/** One man's points, moved onto the map exactly once. */
async function bankOne(db: Db, season: SeasonRow, entry: {
  matchKey: string; playerId: string; profileId: number;
  people: PeopleId; territoryId: string; points: number;
  // THE FLIP, HANDED BACK RATHER THAN ONLY FILED. `war_flips` has always
  // recorded a territory changing hands, and the only reader was the map's own
  // dispatch list — so the man whose points DID it heard nothing at the moment
  // it happened. This carries it out to the summary.
}): Promise<{ ok: boolean; flip?: { territoryId: string; from: string; to: string } }> {
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
    if (!inserted.length) return { ok: false };

    const found = await tx.select().from(territories).where(and(
      eq(territories.seasonId, season.id),
      eq(territories.territoryId, entry.territoryId),
    )).limit(1).for("update");
    const row = found[0];
    if (!row) return { ok: false };

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
    return { ok: true, flip: flip ? { territoryId: flip.territoryId, from: flip.from, to: flip.to } : undefined };
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
/**
 * WHY A MAN'S FIGHT DID OR DID NOT MOVE THE MAP.
 *
 * `bankMatch` answered one question — how many rows went in — and there are SIX
 * ways for the answer to be none: no season, no bound profile, unsworn, no
 * points, a territory this build does not know, and a database that did not
 * answer. The player was told about none of them, and `installWarLedger` ends
 * `.catch(() => {})`, so a fight that counted for nobody looked exactly like a
 * fight that counted. That is the whole of "I've played games and seen no
 * update": the loop works — `tools/warflow.mjs` proves it 28/28 against a real
 * database — and nothing in the game ever says so.
 *
 * So the reason comes back with the count, per man.
 */
export type WarOutcomeKind =
  /** It landed. `people`, `points` and `territoryId` are set. */
  | "banked"
  /** He fought for himself. The one refusal that is a CHOICE, and the only one
   *  the surface can offer a way out of — which is why it is named separately
   *  from every other kind of nothing. */
  | "unsworn"
  /** No profile bound to this seat: a guest. His gold is his; the war is not. */
  | "guest"
  /** He earned nothing this match. Not a fault and not worth a banner. */
  | "no_points"
  /** This match is already in the ledger. A replay, and the guard held. */
  | "already"
  /** No season, no database, or a territory this build does not know. */
  | "unavailable";

export interface WarOutcome {
  playerId: string;
  kind: WarOutcomeKind;
  people?: PeopleId;
  points?: number;
  territoryId?: string;
  /** Set when THIS man's points took the ground off somebody. */
  flip?: { territoryId: string; from: string; to: string };
}

export interface BankResult { banked: number; outcomes: WarOutcome[] }

/**
 * The whole of the banking, with a reason for every man in the report.
 * `bankMatch` below is this with the reasons dropped — kept, because
 * `tools/warflow.mjs` counts rows and should go on counting rows.
 */
export async function bankMatchDetailed(report: MatchEndReport): Promise<BankResult> {
  const all = (kind: WarOutcomeKind): BankResult => ({
    banked: 0,
    outcomes: (report?.entries ?? []).map((e) => ({ playerId: e.playerId, kind })),
  });
  if (!report || !report.matchKey || !territory(report.territoryId)) return all("unavailable");
  if (!Array.isArray(report.entries) || report.entries.length === 0) return { banked: 0, outcomes: [] };

  return withDb(async (db) => {
    const season = await currentSeason(db);
    if (!season) return all("unavailable");

    const outcomes: WarOutcome[] = [];
    const claims = report.entries.map((e) => ({ entry: e, profileId: boundProfile(e.playerId) }));
    const bound = claims.filter((c): c is { entry: typeof c.entry; profileId: number } => c.profileId !== null);
    for (const c of claims) if (c.profileId === null) outcomes.push({ playerId: c.entry.playerId, kind: "guest" });
    if (!bound.length) return { banked: 0, outcomes };

    const sworn = await db.select({ id: players.id, allegiance: players.allegiance })
      .from(players).where(inArray(players.id, bound.map((c) => c.profileId)));
    const people = new Map<number, PeopleId>();
    for (const row of sworn) if (isPeople(row.allegiance)) people.set(row.id, row.allegiance);

    let banked = 0;
    for (const claim of bound) {
      const side = people.get(claim.profileId);
      if (!side) {   // unsworn: he fought for himself, and that is allowed
        outcomes.push({ playerId: claim.entry.playerId, kind: "unsworn" });
        continue;
      }
      // Re-clamped against the same constant the engine priced him with. Not a
      // second opinion — the same number — but this process may one day not be
      // the one that ran the match.
      const points = Math.min(POINTS.cap, Math.max(0, Math.floor(claim.entry.points)));
      if (points <= 0) {
        outcomes.push({ playerId: claim.entry.playerId, kind: "no_points", people: side });
        continue;
      }
      const landed = await bankOne(db, season, {
        matchKey: report.matchKey, playerId: claim.entry.playerId,
        profileId: claim.profileId, people: side,
        territoryId: report.territoryId, points,
      });
      if (landed.ok) banked++;
      outcomes.push({
        playerId: claim.entry.playerId,
        kind: landed.ok ? "banked" : "already",
        people: side, points, territoryId: report.territoryId,
        // Set on the ONE man whose points carried it over. A territory changes
        // hands on somebody's last point, and that man should be the one who
        // hears about it.
        ...(landed.flip ? { flip: landed.flip } : {}),
      });
    }
    if (banked) frontCache = null;   // the map moved; the engine wants to know
    return { banked, outcomes };
  }, all("unavailable"));
}

export async function bankMatch(report: MatchEndReport): Promise<number> {
  return (await bankMatchDetailed(report)).banked;
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
  // IT SAYS WHETHER IT INSTALLED, and that is not noise.
  //
  // Every match in production banked nothing and there was no way to tell
  // whether the subscription existed. One line at boot is the difference
  // between "the war layer is broken" and "the war layer was never switched
  // on", and those are not the same bug.
  const say = (ok: boolean, why?: string) =>
    console.log(`[war] match-end subscription ${ok ? "INSTALLED" : `NOT installed — ${why}`}`);
  try {
    getEngine().onMatchEnd((report) => {
      // Returned, not awaited: `endMatch` does not wait for Postgres, and the
      // rejection is swallowed here as well as there.
      //
      // AND THE ROOM IS TOLD WHAT ITS FIGHT DID. This used to end
      // `.catch(() => {})` over a call whose only product was a count nobody
      // read — so every one of the six ways to bank nothing was silent, and a
      // player who had never sworn could fight all evening and never learn that
      // none of it counted. `war_result` carries the reason per man, and it is
      // sent on the failure path too: "this counted for nobody" is the message
      // that was missing, not "this counted".
      return bankMatchDetailed(report)
        .then(async (res) => {
          if (res.banked) await refreshFront();
          return res;
        })
        .catch(() => ({ banked: 0, outcomes: report.entries.map((e) => ({ playerId: e.playerId, kind: "unavailable" as const })) }))
        .then((res) => {
          // ONE LINE PER MATCH, and it is the only way anybody outside a
          // debugger finds out why a fight counted for nobody. Counts by
          // reason rather than a row per man: eight men is eight lines and
          // nobody reads eight lines.
          const tally: Record<string, number> = {};
          for (const o of res.outcomes) tally[o.kind] = (tally[o.kind] ?? 0) + 1;
          console.log(`[war] ${report.matchKey} on ${report.territoryId}: banked ${res.banked}`
            + ` — ${Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(", ") || "nobody"}`);
          try {
            getEngine().tellRoom(report.roomCode, {
              type: "war_result",
              data: { matchKey: report.matchKey, territoryId: report.territoryId, outcomes: res.outcomes },
            });
          } catch { /* the room went home */ }
        })
        .catch(() => {});
    });
    say(true);
  } catch (e) {
    globalForWar.__bretwaldaWarInstalled = false;
    say(false, String((e as Error)?.message ?? e).slice(0, 120));
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

/**
 * One piece of ground a man has personally bled for, and who has it now.
 *
 * `territoryId` and `points` are a GROUP BY over `war_ledger` — the rows are
 * already there and already indexed on (season_id, profile_id). `holder` is
 * joined off the live `territories` row, because those are two different
 * questions and a screen that answered only the first would be a list of place
 * names: "you fought at Mercia" is worth nothing next to "you fought at Mercia
 * and the Norse have it".
 */
export interface WarSelfGround {
  territoryId: string;
  points: number;
  matches: number;
  /** Who holds it NOW. Not who held it when he fought — nothing records that. */
  holder: string;
}

export interface WarSelfView {
  /** His own name, for a screen whose whole job is telling him who he is. */
  name: string;
  allegiance: string | null;
  points: number;
  matches: number;
  bretwaldaSeasons: number[];
  locked: boolean;
  /** Every territory he has banked a point on this season, most-bled-for first. */
  ground: WarSelfGround[];
  /**
   * Where he stands among his OWN people this season, 1-based, and how many of
   * them have banked anything at all. Null before he has banked his first
   * point — a rank of "1 of 0" is not a fact about anybody.
   */
  rank: number | null;
  ofPeople: number;
  /**
   * His most recent banked match: what it was worth, which ground took it, and
   * how long ago. `agoMinutes` is computed HERE and not on the client, for the
   * same reason `WarView.agoMinutes` is — a handset with a wrong date must not
   * be told a different story to the man beside it, and a component that reads
   * the clock while rendering draws two different trees.
   */
  last: { territoryId: string; points: number; at: number; agoMinutes: number } | null;
}

/** A man's own standing in the war, for his own screen. */
export async function warSelf(id: unknown, secret: unknown): Promise<WarSelfView | null> {
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

    // ---- the ground he has bled for -------------------------------------
    // Straight down `war_ledger_season_profile_idx`, then one join per row to
    // the sixteen-row territory table for the current holder.
    const ground = await db.select({
      territoryId: warLedger.territoryId,
      points: sql<number>`sum(${warLedger.points})::int`,
      matches: sql<number>`count(distinct ${warLedger.matchKey})::int`,
      holder: territories.holder,
    }).from(warLedger)
      .innerJoin(territories, and(
        eq(territories.seasonId, warLedger.seasonId),
        eq(territories.territoryId, warLedger.territoryId),
      ))
      .where(and(eq(warLedger.seasonId, season.id), eq(warLedger.profileId, profileId)))
      .groupBy(warLedger.territoryId, territories.holder)
      .orderBy(desc(sql`sum(${warLedger.points})`), asc(warLedger.territoryId));

    // ---- where he stands among his own people ----------------------------
    // THE ORDER IS THE CROWN'S ORDER, and that is the whole point of writing
    // it out rather than just sorting by points. `endSeason` in `war.mjs`
    // breaks ties by points, then by the man's FIRST banked point, then by his
    // profile id AS A STRING. A screen that told a man he was second while the
    // crown would have gone to him is a screen that lies about the only thing
    // this season is for, so the three terms are reproduced here exactly —
    // including `::text` on the id, which is `String(a.profileId).localeCompare`
    // and is NOT the same order as a numeric sort once there are ten men.
    let rank: number | null = null;
    let ofPeople = 0;
    if (row.allegiance) {
      const table = await db.select({
        profileId: warLedger.profileId,
      }).from(warLedger)
        .where(and(eq(warLedger.seasonId, season.id), eq(warLedger.people, row.allegiance)))
        .groupBy(warLedger.profileId)
        .having(sql`sum(${warLedger.points}) > 0`)
        .orderBy(
          desc(sql`sum(${warLedger.points})`),
          asc(sql`min(${warLedger.createdAt})`),
          asc(sql`${warLedger.profileId}::text`),
        );
      ofPeople = table.length;
      const seat = table.findIndex((r) => r.profileId === profileId);
      if (seat >= 0) rank = seat + 1;
    }

    // ---- his last match ---------------------------------------------------
    const recent = await db.select({
      territoryId: warLedger.territoryId,
      points: warLedger.points,
      createdAt: warLedger.createdAt,
    }).from(warLedger)
      .where(and(eq(warLedger.seasonId, season.id), eq(warLedger.profileId, profileId)))
      .orderBy(desc(warLedger.createdAt), desc(warLedger.id)).limit(1);
    const lastRow = recent[0];

    return {
      name: row.name || "",
      allegiance: row.allegiance,
      points,
      matches: Number(mine[0]?.matches) || 0,
      bretwaldaSeasons: Array.isArray(row.bretwaldaSeasons) ? row.bretwaldaSeasons : [],
      locked: points > 0,
      ground: ground.map((g) => ({
        territoryId: g.territoryId,
        points: Number(g.points) || 0,
        matches: Number(g.matches) || 0,
        holder: g.holder,
      })),
      rank,
      ofPeople,
      last: lastRow
        ? {
            territoryId: lastRow.territoryId,
            points: lastRow.points,
            at: lastRow.createdAt.getTime(),
            agoMinutes: Math.max(0, Math.round((Date.now() - lastRow.createdAt.getTime()) / 60_000)),
          }
        : null,
    };
  }, null);
}
