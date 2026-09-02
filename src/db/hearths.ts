import { and, asc, desc, eq, sql } from "drizzle-orm";
import { standardOf } from "@/game/standards.mjs";
import { getDb, withDb } from "./index";
import { hearths, players, warLedger, seasons } from "./schema";
import { secretMatches } from "./credentials";

/**
 * THE HEARTHS — backlog 4.4's clans, in the game's own word.
 *
 * The rules, and each is a sentence a player would accept as fair:
 *
 *   A HEARTH PICKS A BASE KINGDOM AT FOUNDING — its founder's own sworn
 *   people, taken automatically, never chosen separately. "Clans pick a base
 *   kingdom and inherit its variant characters" is the backlog row, and
 *   docs/DESIGN-SYSTEM.md adds the heraldry law: a Hearth inherits its
 *   kingdom's colour and may not choose its own, because faction colour is
 *   how you read an enemy at range in an eight-man brawl.
 *
 *   ONLY THE SWORN SIT AT A HEARTH, and only at one of their own people's.
 *   A house divided between kingdoms would break the attribution this table
 *   exists for — `war_ledger.hearth_id` beside `people`, both read off the
 *   profile at bank time, and a hearth whose members banked for three
 *   different peoples would be a standing nobody could read.
 *
 *   ONE HEARTH PER MAN. Leaving is free; the house survives its founder
 *   leaving (a hall does not burn down because the man who raised it moved
 *   on), and an empty hearth simply stands cold until somebody joins it.
 *
 * Nothing here touches the engine or the wire: membership is a profile
 * column, standing is a ledger sum, and the sim has never heard of either.
 */

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export interface HearthView {
  id: number;
  name: string;
  people: string;
  members: number;
  /** The device the house flies, or null. */
  standard: string | null;
}

export type HearthOutcome =
  | { ok: true; hearth: HearthView }
  | { ok: false; message: string };

const NAME_RULE = /^[A-Za-z][A-Za-z' -]{2,23}$/;

async function viewOf(db: Db, id: number): Promise<HearthView | null> {
  const found = await db.select().from(hearths).where(eq(hearths.id, id)).limit(1);
  const row = found[0];
  if (!row) return null;
  const members = await db.select({ n: sql<number>`count(*)::int` })
    .from(players).where(eq(players.hearthId, id));
  return { id: row.id, name: row.name, people: row.people, members: Number(members[0]?.n) || 0, standard: row.standard ?? null };
}

/** The caller's authenticated profile row, or null. The same bearer rule as warSelf. */
async function ownRow(db: Db, id: unknown, secret: unknown) {
  const profileId = Number(id);
  if (!Number.isInteger(profileId) || typeof secret !== "string") return null;
  const found = await db.select().from(players).where(eq(players.id, profileId)).limit(1);
  const row = found[0];
  return row && secretMatches(secret, row.secretHash) ? row : null;
}

/**
 * RAISE A STANDARD over the house. Any seated member may — a hearth is a house
 * and not a fief, and the house survives its founder — and only from his own
 * kingdom's list: the heraldry law is that a Hearth inherits its colour and
 * may not choose one, and §9 is that it flies a sourced device or none.
 */
export async function hearthStandard(id: unknown, secret: unknown, standard: unknown): Promise<HearthOutcome | null> {
  return withDb(async (db) => {
    const row = await ownRow(db, id, secret);
    if (!row) return { ok: false, message: "That is not your name." };
    if (!row.hearthId) return { ok: false, message: "Sit at a hearth first — a standard flies over a house." };
    const house = (await db.select().from(hearths).where(eq(hearths.id, row.hearthId)).limit(1))[0];
    if (!house) return { ok: false, message: "That hearth is cold." };
    const wanted = standard === null || standard === undefined || standard === "none" ? null : String(standard);
    if (wanted !== null && !standardOf(house.people, wanted)) {
      return { ok: false, message: "That device is not one of your kingdom's. A house flies what its people can source." };
    }
    await db.update(hearths).set({ standard: wanted }).where(eq(hearths.id, house.id));
    const view = await viewOf(db, house.id);
    return view ? { ok: true, hearth: view } : { ok: false, message: "That hearth is cold." };
  }, null);
}

/** Found a Hearth: the founder's people becomes the house's, and he takes a seat. */
export async function hearthFound(id: unknown, secret: unknown, name: unknown): Promise<HearthOutcome | null> {
  return withDb<HearthOutcome | null>(async (db) => {
    const row = await ownRow(db, id, secret);
    if (!row) return { ok: false, message: "Your profile could not be verified." };
    if (!row.allegiance) return { ok: false, message: "Swear to a people first — a hearth belongs to a kingdom." };
    if (row.hearthId) return { ok: false, message: "You already sit at a hearth. Leave it before founding another." };
    const wanted = String(name ?? "").trim().replace(/\s+/g, " ");
    if (!NAME_RULE.test(wanted)) {
      return { ok: false, message: "A hearth's name is 3-24 letters — apostrophes, hyphens and spaces allowed." };
    }
    try {
      const made = await db.insert(hearths)
        .values({ name: wanted, people: row.allegiance, founderId: row.id })
        .returning({ id: hearths.id });
      const hearthId = made[0]?.id;
      if (!hearthId) return { ok: false, message: "The hearth could not be raised. Try again." };
      await db.update(players).set({ hearthId, updatedAt: new Date() }).where(eq(players.id, row.id));
      const hearth = await viewOf(db, hearthId);
      return hearth ? { ok: true, hearth } : { ok: false, message: "The hearth could not be raised. Try again." };
    } catch {
      // The functional unique index on lower(name): one name, one house.
      return { ok: false, message: "A hearth already bears that name." };
    }
  }, null);
}

/** Take a seat at a named Hearth of your own people. */
export async function hearthJoin(id: unknown, secret: unknown, name: unknown): Promise<HearthOutcome | null> {
  return withDb<HearthOutcome | null>(async (db) => {
    const row = await ownRow(db, id, secret);
    if (!row) return { ok: false, message: "Your profile could not be verified." };
    if (!row.allegiance) return { ok: false, message: "Swear to a people first — a hearth belongs to a kingdom." };
    if (row.hearthId) return { ok: false, message: "You already sit at a hearth. Leave it before joining another." };
    const wanted = String(name ?? "").trim().replace(/\s+/g, " ");
    const found = await db.select().from(hearths)
      .where(sql`lower(${hearths.name}) = lower(${wanted})`).limit(1);
    const house = found[0];
    if (!house) return { ok: false, message: "No hearth bears that name." };
    if (house.people !== row.allegiance) {
      return { ok: false, message: "That hearth belongs to another kingdom. A house is not divided." };
    }
    await db.update(players).set({ hearthId: house.id, updatedAt: new Date() }).where(eq(players.id, row.id));
    const hearth = await viewOf(db, house.id);
    return hearth ? { ok: true, hearth } : { ok: false, message: "The hearth could not be found." };
  }, null);
}

/** Leave your Hearth. The house stands; your future points are your own again. */
export async function hearthLeave(id: unknown, secret: unknown): Promise<HearthOutcome | null> {
  return withDb<HearthOutcome | null>(async (db) => {
    const row = await ownRow(db, id, secret);
    if (!row) return { ok: false, message: "Your profile could not be verified." };
    if (!row.hearthId) return { ok: false, message: "You sit at no hearth." };
    const hearth = await viewOf(db, row.hearthId);
    await db.update(players).set({ hearthId: null, updatedAt: new Date() }).where(eq(players.id, row.id));
    return hearth ? { ok: true, hearth } : { ok: false, message: "You sit at no hearth." };
  }, null);
}

/** The Hearth a profile sits at, for the Standing panel. Cheap, no auth — by id off an authed read. */
export async function hearthOf(hearthId: number | null | undefined): Promise<HearthView | null> {
  if (!hearthId) return null;
  return withDb(async (db) => viewOf(db, hearthId), null);
}

export interface HearthSeat {
  seat: number;
  name: string;
  people: string;
  /** The device the house flies, or null. */
  standard: string | null;
  members: number;
  points: number;
  matches: number;
}

/**
 * THE HEARTHS OF THE SEASON — the houses by their banked season points, the
 * same ledger and the same season the men's own roll reads. Ties break by
 * first banked point then id, the crown's own family of order.
 */
export async function hearthRoll(limit = 20): Promise<HearthSeat[] | null> {
  const cap = Math.max(1, Math.min(50, Math.round(limit)));
  return withDb(async (db) => {
    const season = await db.select().from(seasons)
      .where(eq(seasons.state, "running")).orderBy(desc(seasons.index)).limit(1);
    const s = season[0];
    if (!s) return [];
    const table = await db.select({
      hearthId: warLedger.hearthId,
      points: sql<number>`sum(${warLedger.points})::int`,
      matches: sql<number>`count(distinct ${warLedger.matchKey})::int`,
      name: hearths.name,
      people: hearths.people,
      standard: hearths.standard,
    }).from(warLedger)
      .innerJoin(hearths, eq(hearths.id, warLedger.hearthId))
      .where(and(eq(warLedger.seasonId, s.id), sql`${warLedger.hearthId} is not null`))
      .groupBy(warLedger.hearthId, hearths.name, hearths.people, hearths.standard)
      .having(sql`sum(${warLedger.points}) > 0`)
      .orderBy(
        desc(sql`sum(${warLedger.points})`),
        asc(sql`min(${warLedger.createdAt})`),
        asc(warLedger.hearthId),
      )
      .limit(cap);
    const out: HearthSeat[] = [];
    for (const [i, r] of table.entries()) {
      const members = await db.select({ n: sql<number>`count(*)::int` })
        .from(players).where(eq(players.hearthId, r.hearthId as number));
      out.push({
        seat: i + 1,
        name: r.name,
        people: r.people, standard: r.standard ?? null,
        members: Number(members[0]?.n) || 0,
        points: Number(r.points) || 0,
        matches: Number(r.matches) || 0,
      });
    }
    return out;
  }, null);
}
