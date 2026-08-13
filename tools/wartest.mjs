#!/usr/bin/env node
/**
 * WARTEST — the war layer's ruler.
 *
 *   node tools/wartest.mjs
 *   node tools/wartest.mjs --prove     # the RED ARM: inject the two defects
 *                                        the neutrality gates exist to catch,
 *                                        and require the gates to FAIL.
 *
 * WHAT THIS IS FOR. `docs/WHAT-THIS-GAME-IS.md` §3 says the game is a
 * persistent war for Britain settled in three-minute rounds, and that the war
 * is the missing third loop. This file is the instrument for that loop. It
 * plays real matches into a real war and states the invariants the war has to
 * hold or it is a spreadsheet that lies:
 *
 *   1. POINTS ARE CONSERVED. Every point the engine awards is banked exactly
 *      once, and the contest ledgers add up to what was banked.
 *   2. A TERRITORY FLIPS ONLY AT ITS THRESHOLD. Not one point before it.
 *   3. THE WRITE IS IDEMPOTENT. A retried match banks nothing twice.
 *   4. A SEASON ENDS WITH EXACTLY ONE BRETWALDA. Never zero when there is a
 *      contributor, never two, and the tie-breaks are total.
 *   5. ALLEGIANCE NEVER CHANGES MATCHMAKING.
 *   6. TERRITORY NEVER TOUCHES A STAT.
 *
 * 5 and 6 are `docs/FACTIONS.md` §3, the LOAD-BEARING RULE, and they are the
 * two this repository is most likely to lose quietly a year from now.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS A RED ARM, AND WHY IT IS NOT OPTIONAL.
 *
 * `docs/PROCESS.md` records THIRTEEN instances of a measurement answering the
 * wrong question, and the signature shape of the failure is a gate that is
 * green because the case is absent. A neutrality gate is the most vulnerable
 * kind there is: "territory grants no stat" passes trivially on a build where
 * territory is not wired to anything at all, and it goes on passing on the day
 * somebody wires it up wrong, unless the fixture actually holds a conquered
 * map and actually fights a match under it.
 *
 * So `--prove` builds the defect. It hands the engine a map one people has
 * conquered outright, applies the bonus a naive "your holdings make you
 * tougher" implementation would apply, and requires §7's assertions to go RED.
 * A ruler that cannot be made to move is not a ruler. If `--prove` ever comes
 * back green, the neutrality gates below are decoration and should be deleted
 * rather than trusted.
 *
 * COST. About four seconds. Everything is in-process: `makeEngine({autoTick:
 * false})` stepped by hand, and the war rules are pure functions over a plain
 * object. No database, no browser, no network — `src/db/war.ts` is the thin
 * layer that persists what this file proves, and it is checked separately by
 * `npm run profiletest` against a real Postgres.
 */
import { makeEngine, WARRIOR_STATS } from "../src/game/engine.mjs";
import {
  PEOPLES, TERRITORIES, territory, POINTS, pointsFor, dealTerritory,
  newWar, bank, conservation, standings, endSeason, openingHoldings,
  SEASON_DAYS, FRONT_WINDOW, project,
} from "../src/game/war.mjs";

const argv = process.argv.slice(2);
const PROVE = argv.includes("--prove");

const results = [];
let section = "";
const head = (t) => { section = t; console.log(`\n${t}`); console.log("-".repeat(t.length)); };
const check = (name, pass, detail) => {
  results.push({ section, name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
/**
 * An assertion that INVERTS under --prove.
 *
 * Every neutrality gate goes through here. In a normal run it must pass; in a
 * proving run, where the defect has been injected on purpose, it must fail —
 * and a proving run that sees it pass anyway reports the gate as blind, which
 * is the finding that matters more than the defect.
 */
const gate = (name, pass, detail) => {
  if (!PROVE) return check(name, pass, detail);
  results.push({ section, name: `${name} [must go red under --prove]`, pass: !pass });
  console.log(`  ${!pass ? "PASS" : "FAIL"}  ${name} [red arm]${!pass ? " — went red as required" : " — STAYED GREEN OVER AN INJECTED DEFECT: THIS GATE IS BLIND"}`);
};

const sum = (a) => a.reduce((t, n) => t + n, 0);
const RATE = 20;

/**
 * HOW A FIXTURE KILLS A MAN, and it matters that it is not by writing "dead"
 * onto him.
 *
 * A round ends in exactly two places in `engine.mjs` — the blow that lands and
 * the fire that takes him — and both of them call `checkRoundEnd`. Setting
 * `state = "dead"` from outside produces a corpse nobody notices and a match
 * that never ends, which is a fixture measuring its own poke rather than the
 * engine's rule.
 *
 * So a fixture puts a man in the bonfire at the origin and steps. It is the
 * engine's own death, through the engine's own path, and the man's HEALTH is
 * what decides how long he lasts — which is precisely the quantity §7's
 * injected defect moves, and the reason that gate can see it.
 *
 * `hurt` optionally sets the health he walks in with; left alone he burns from
 * full, which is the sensitive form.
 */
const intoTheFire = (p, health) => {
  p.position = { x: 0, y: 0, z: 0 };
  p.invincible = false; p.invincibleTimer = 0;
  if (health !== undefined) p.health = Math.min(p.health, health);
};

// ============================================================
// 1. THE GROUND — the territory table
// ============================================================
head("1. The ground");
{
  check("there are sixteen named territories", TERRITORIES.length === 16, `saw ${TERRITORIES.length}`);

  const ids = TERRITORIES.map((t) => t.id);
  check("every territory id is unique", new Set(ids).size === ids.length);
  check("every territory has a name, a native name and a people",
    TERRITORIES.every((t) => t.name && t.native && PEOPLES.includes(t.people)));

  // Four each. Not decoration: a season that opens 7-3-3-3 is decided by the
  // opening and not by the fighting.
  const per = {};
  for (const p of PEOPLES) per[p] = TERRITORIES.filter((t) => t.people === p).length;
  check("the map opens even — four territories to each of the four peoples",
    PEOPLES.every((p) => per[p] === 4), JSON.stringify(per));

  check("every territory carries a flip threshold above zero",
    TERRITORIES.every((t) => Number.isInteger(t.threshold) && t.threshold > 0));

  check("territory() finds by id and answers null for a stranger",
    territory("wessex") && territory("wessex").name === "Wessex" && territory("nowhere") === null);

  // The geometry has to land on the real coastline or the map screen is a lie.
  // `project` is the same Web Mercator fit `britain.ts` documents; LAND's own
  // bounding box is x 82.3..614.6, y 4.5..959.5.
  const anchors = TERRITORIES.map((t) => ({ id: t.id, ...project(t.anchor[0], t.anchor[1]) }));
  const inFrame = anchors.every((a) => a.x > 80 && a.x < 616 && a.y > 4 && a.y < 960);
  check("every territory's anchor projects inside the drawn island",
    inFrame, inFrame ? "" : JSON.stringify(anchors.filter((a) => !(a.x > 80 && a.x < 616 && a.y > 4 && a.y < 960))));

  check("every territory carries at least one boundary ring of at least three points",
    TERRITORIES.every((t) => Array.isArray(t.bounds) && t.bounds.length > 0 &&
      t.bounds.every((ring) => Array.isArray(ring) && ring.length >= 3)));

  // THE ONE THAT KEEPS TWO FILES HONEST. war.mjs re-states britain.ts's
  // projection as arithmetic so territories can be authored in degrees. If
  // either drifts, every territory on the map screen slides off the coast and
  // nothing else in the repository would notice.
  const winchester = project(51.0632, -1.3080);
  const burghead = project(57.7017, -3.4906);
  check("project() agrees with britain.ts's own seats to under two units in a thousand",
    Math.abs(winchester.x - 438.8) < 2.5 && Math.abs(winchester.y - 860.5) < 2.5 &&
    Math.abs(burghead.x - 314.8) < 2.5 && Math.abs(burghead.y - 208.2) < 2.5,
    `Winchester ${winchester.x.toFixed(1)},${winchester.y.toFixed(1)} (britain.ts: 438.8,860.5); ` +
    `Burghead ${burghead.x.toFixed(1)},${burghead.y.toFixed(1)} (britain.ts: 314.8,208.2)`);
}

// ============================================================
// 2. THE PURSE — what a match is worth to the war
// ============================================================
head("2. The purse");
{
  const man = (o) => ({ id: "p1", name: "Aelf", kills: 0, deaths: 0, damage: 0, isWinner: false, ...o });

  const loser = pointsFor(man({ kills: 3 }));
  const winner = pointsFor(man({ kills: 3, isWinner: true }));
  check("winning is worth more than losing on identical hands", winner > loser, `${winner} vs ${loser}`);

  check("turning up is worth something and nothing is worth nothing",
    pointsFor(man({})) === POINTS.turnout && pointsFor(man({})) > 0, `${pointsFor(man({}))}`);

  check("kills add, monotonically",
    pointsFor(man({ kills: 1 })) > pointsFor(man({ kills: 0 })) &&
    pointsFor(man({ kills: 9 })) > pointsFor(man({ kills: 8 })));

  // R1: pull the lever. Kills is the input that is supposed to move the number.
  const lever = pointsFor(man({ kills: 40, isWinner: true }));
  check("the cap holds, so one farmed match cannot move a border",
    lever === POINTS.cap && lever < POINTS.cap + 1, `40 kills and a win banks ${lever}, cap ${POINTS.cap}`);

  check("points are whole numbers — a contest ledger of halves cannot be reconciled",
    [0, 1, 5, 13, 99].every((k) => Number.isInteger(pointsFor(man({ kills: k, damage: 333.7 })))));

  check("damage does not pay — the war is decided by the fight's verdict, not its noise",
    pointsFor(man({ kills: 2, damage: 0 })) === pointsFor(man({ kills: 2, damage: 9999 })));
}

// ============================================================
// 3. BANKING, AND POINTS ARE CONSERVED
// ============================================================
head("3. Banking and conservation");
{
  const war = newWar({ seasonIndex: 1, startedAt: 0 });
  const entry = (o) => ({
    matchKey: "R1:m1", playerId: "a", profileId: 1, people: "norse",
    territoryId: "wessex", points: 10, at: 1000, ...o,
  });

  const first = bank(war, entry());
  check("a fresh entry is applied", first.applied === true && first.reason === "banked");

  check("the point landed in the contested territory's ledger, under the banking people",
    war.territories.wessex.contest.norse === 10 &&
    war.territories.wessex.contest.saxon === 0);

  check("a territory nobody has taken is still held by the people it opened with",
    war.territories.wessex.holder === "saxon");

  const nowhere = bank(war, entry({ matchKey: "R1:m2", territoryId: "atlantis" }));
  check("a point banked into a territory that does not exist is refused, not invented",
    nowhere.applied === false && nowhere.reason === "no_such_territory");

  const noPeople = bank(war, entry({ matchKey: "R1:m3", people: "romans" }));
  check("a people that does not exist banks nothing",
    noPeople.applied === false && noPeople.reason === "no_such_people");

  const zero = bank(war, entry({ matchKey: "R1:m4", points: 0 }));
  check("a zero-point entry is recorded as seen but moves nothing",
    zero.applied === false && zero.reason === "no_points" && war.territories.wessex.contest.norse === 10);

  const negative = bank(war, entry({ matchKey: "R1:m5", points: -500 }));
  check("a negative entry cannot drain a rival's ledger",
    negative.applied === false && war.territories.wessex.contest.norse === 10);

  // Conservation over a hundred entries spread over the whole map.
  const big = newWar({ seasonIndex: 2, startedAt: 0 });
  let offered = 0;
  for (let i = 0; i < 400; i++) {
    const t = TERRITORIES[i % TERRITORIES.length];
    const p = PEOPLES[(i * 7) % PEOPLES.length];
    const points = 1 + (i % 23);
    offered += points;
    bank(big, { matchKey: `K${i}`, playerId: `p${i}`, profileId: i, people: p, territoryId: t.id, points, at: i });
  }
  const cons = conservation(big);
  check("every point offered was banked, and none was created",
    cons.ok && cons.banked === offered && cons.held + cons.cleared === offered,
    `offered ${offered}, banked ${cons.banked}, on the map ${cons.held}, cleared by flips ${cons.cleared}`);

  check("the season's contribution roll adds up to what was banked",
    sum(Object.values(big.contributions).map((c) => c.points)) === cons.banked,
    `roll ${sum(Object.values(big.contributions).map((c) => c.points))} vs banked ${cons.banked}`);
}

// ============================================================
// 4. THE FLIP, AND ITS EXACT EDGE
// ============================================================
head("4. The flip");
{
  const t = territory("wessex");
  const TH = t.threshold;

  // One point short. This is the assertion the whole section exists for: a
  // threshold that flips at TH-1 is a threshold nobody wrote down.
  const near = newWar({ seasonIndex: 1, startedAt: 0 });
  for (let i = 0; i < TH - 1; i++) {
    bank(near, { matchKey: `n${i}`, playerId: `p${i}`, profileId: i, people: "norse", territoryId: "wessex", points: 1, at: i });
  }
  check(`a territory does not flip one point short of its threshold (${TH - 1} of ${TH})`,
    near.territories.wessex.holder === "saxon" && near.flips.length === 0,
    `holder ${near.territories.wessex.holder}, contest ${JSON.stringify(near.territories.wessex.contest)}`);

  const last = bank(near, { matchKey: "nLast", playerId: "pz", profileId: 99, people: "norse", territoryId: "wessex", points: 1, at: TH });
  check(`and it flips on the point that reaches it (${TH})`,
    near.territories.wessex.holder === "norse" && !!last.flip && last.flip.to === "norse" && last.flip.from === "saxon",
    JSON.stringify(last.flip || null));

  check("the flip clears the contest and advances the epoch, so the next people starts level",
    PEOPLES.every((p) => near.territories.wessex.contest[p] === 0) && near.territories.wessex.epoch === 1);

  check("conservation survives the flip — cleared points are accounted for, not forgotten",
    conservation(near).ok && conservation(near).cleared === TH,
    JSON.stringify(conservation(near)));

  check("the flip is written into the season's history, which is what moved overnight",
    near.flips.length === 1 && near.flips[0].territoryId === "wessex" && near.flips[0].at === TH);

  // The holder defends by fighting for his own ground.
  const held = newWar({ seasonIndex: 1, startedAt: 0 });
  for (let i = 0; i < TH; i++) {
    bank(held, { matchKey: `a${i}`, playerId: `x${i}`, profileId: i, people: "norse", territoryId: "wessex", points: 1, at: i });
    bank(held, { matchKey: `b${i}`, playerId: `y${i}`, profileId: i, people: "saxon", territoryId: "wessex", points: 1, at: i });
  }
  check("a holder who matches a challenger point for point keeps his ground",
    held.territories.wessex.holder === "saxon" && held.flips.length === 0,
    JSON.stringify(held.territories.wessex.contest));

  // A holder cannot take what he already has.
  const own = newWar({ seasonIndex: 1, startedAt: 0 });
  for (let i = 0; i < TH * 3; i++) {
    bank(own, { matchKey: `o${i}`, playerId: `z${i}`, profileId: i, people: "saxon", territoryId: "wessex", points: 1, at: i });
  }
  check("a people cannot flip a territory it already holds, however hard it fights",
    own.territories.wessex.holder === "saxon" && own.flips.length === 0);

  // Two challengers, and the lead is what counts.
  const race = newWar({ seasonIndex: 1, startedAt: 0 });
  for (let i = 0; i < TH - 1; i++) {
    bank(race, { matchKey: `r${i}`, playerId: `n${i}`, profileId: i, people: "norse", territoryId: "wessex", points: 1, at: i });
    bank(race, { matchKey: `s${i}`, playerId: `b${i}`, profileId: i, people: "briton", territoryId: "wessex", points: 1, at: i });
  }
  bank(race, { matchKey: "rz", playerId: "nz", profileId: 1, people: "norse", territoryId: "wessex", points: 1, at: 1 });
  check("two challengers do not add up — the threshold is a LEAD over the holder, taken by one people",
    race.territories.wessex.holder === "norse" && race.flips[0].to === "norse",
    `norse ${TH}, briton ${TH - 1}, holder ${race.territories.wessex.holder}`);
}

// ============================================================
// 5. IDEMPOTENCY — a retry must not bank twice
// ============================================================
head("5. Idempotency");
{
  const war = newWar({ seasonIndex: 1, startedAt: 0 });
  const e = { matchKey: "M:1", playerId: "aelf", profileId: 7, people: "norse", territoryId: "kent", points: 12, at: 5 };

  const a = bank(war, e);
  const b = bank(war, { ...e });
  check("the same match and the same man bank once, and the retry says so",
    a.applied === true && b.applied === false && b.reason === "already_banked");

  check("the retry moved no points",
    war.territories.kent.contest.norse === 12 && conservation(war).banked === 12);

  check("the retry did not double the man's contribution either",
    war.contributions["7"].points === 12, JSON.stringify(war.contributions));

  const c = bank(war, { ...e, matchKey: "M:2" });
  check("a different match with the same man banks again",
    c.applied === true && war.territories.kent.contest.norse === 24);

  const d = bank(war, { ...e, playerId: "guthrum", profileId: 8 });
  check("a different man in the SAME match banks — the key is the pair, not the match",
    d.applied === true && war.territories.kent.contest.norse === 36);

  // The realistic retry: the whole report comes back because a write timed out.
  const report = [
    { matchKey: "M:9", playerId: "a", profileId: 1, people: "saxon", territoryId: "gwynedd", points: 14, at: 1 },
    { matchKey: "M:9", playerId: "b", profileId: 2, people: "saxon", territoryId: "gwynedd", points: 9, at: 1 },
    { matchKey: "M:9", playerId: "c", profileId: 3, people: "pict", territoryId: "gwynedd", points: 20, at: 1 },
  ];
  const w2 = newWar({ seasonIndex: 1, startedAt: 0 });
  report.forEach((x) => bank(w2, x));
  const after = JSON.stringify({ t: w2.territories, c: w2.contributions });
  for (let i = 0; i < 5; i++) report.forEach((x) => bank(w2, x));
  check("a whole match report replayed five times leaves the war byte-identical",
    JSON.stringify({ t: w2.territories, c: w2.contributions }) === after);

  check("and the replays are not counted as new banking",
    conservation(w2).banked === 43 && conservation(w2).ok, JSON.stringify(conservation(w2)));
}

// ============================================================
// 6. THE SEASON, AND EXACTLY ONE BRETWALDA
// ============================================================
head("6. The season and the Bretwalda");
{
  check("a season is four to six weeks", SEASON_DAYS >= 28 && SEASON_DAYS <= 42, `${SEASON_DAYS} days`);

  const war = newWar({ seasonIndex: 1, startedAt: 0 });
  // Norse take three Saxon territories; every people fights.
  const TH = territory("wessex").threshold;
  // A counter and not a random key: a fixture whose inputs are drawn is a
  // fixture that measures a different season every run.
  let ticket = 0;
  const push = (people, tid, profileId, points) =>
    bank(war, { matchKey: `M${++ticket}`, playerId: `pl${ticket}`, profileId, people, territoryId: tid, points, at: 1 });
  for (const tid of ["wessex", "kent", "mierce"]) {
    for (let i = 0; i < TH; i++) push("norse", tid, 100 + (i % 3), 1);
  }
  push("saxon", "deira", 200, 40);
  push("briton", "deira", 300, 25);

  const st = standings(war);
  check("standings rank the peoples by territory held",
    st[0].people === "norse" && st[0].held === 7 && st.length === 4, JSON.stringify(st));

  const verdict = endSeason(war, 1_000_000);
  check("the season ends with one people on top", verdict.people === "norse");

  check("exactly one Bretwalda is crowned",
    !!verdict.bretwalda && typeof verdict.bretwalda.profileId !== "undefined" &&
    Object.keys(verdict).length > 0, JSON.stringify(verdict.bretwalda));

  check("the Bretwalda is of the winning people and is its highest contributor",
    verdict.bretwalda.people === "norse" &&
    verdict.bretwalda.points === Math.max(...Object.values(war.contributions).filter((c) => c.people === "norse").map((c) => c.points)),
    JSON.stringify(verdict.bretwalda));

  check("a man of a losing people is never crowned however much he banked",
    verdict.bretwalda.profileId !== 200 && verdict.bretwalda.profileId !== 300);

  check("the season is marked ended, and ending it twice does not crown a second man",
    war.state === "ended" && JSON.stringify(endSeason(war, 2_000_000)) === JSON.stringify(verdict));

  // A dead-level tie must still produce ONE man. Ties are the case that
  // produces two crowns or none, and a played season will not hand it to you.
  const tie = newWar({ seasonIndex: 1, startedAt: 0 });
  bank(tie, { matchKey: "t1", playerId: "a", profileId: 11, people: "pict", territoryId: "wessex", points: 30, at: 1 });
  bank(tie, { matchKey: "t2", playerId: "b", profileId: 12, people: "pict", territoryId: "wessex", points: 30, at: 1 });
  const tv = endSeason(tie, 10);
  check("two men level on contribution still crown exactly one, deterministically",
    !!tv.bretwalda && [11, 12].includes(tv.bretwalda.profileId) &&
    JSON.stringify(endSeason(newWar2(), 10)) === JSON.stringify(tv),
    JSON.stringify(tv.bretwalda));
  function newWar2() {
    const w = newWar({ seasonIndex: 1, startedAt: 0 });
    bank(w, { matchKey: "t2", playerId: "b", profileId: 12, people: "pict", territoryId: "wessex", points: 30, at: 1 });
    bank(w, { matchKey: "t1", playerId: "a", profileId: 11, people: "pict", territoryId: "wessex", points: 30, at: 1 });
    return w;
  }

  // A season nobody played. An honest null beats a crash and beats a lie.
  const empty = newWar({ seasonIndex: 1, startedAt: 0 });
  const ev = endSeason(empty, 10);
  check("a season nobody fought crowns nobody, and says so rather than throwing",
    ev.bretwalda === null && ev.people !== undefined, JSON.stringify(ev));

  // The reset.
  const open = openingHoldings("norse");
  const held = {};
  for (const p of PEOPLES) held[p] = Object.values(open.holdings).filter((x) => x === p).length;
  check("the next map opens with the old Bretwalda's people slightly ahead",
    held.norse === 5 && PEOPLES.filter((p) => p !== "norse").every((p) => held[p] >= 3), JSON.stringify(held));

  check("...and heavily targeted: their ground is cheaper to take than anyone else's",
    Object.entries(open.thresholds).every(([tid, th]) =>
      open.holdings[tid] === "norse" ? th < territory(tid).threshold : th === territory(tid).threshold),
    JSON.stringify(open.thresholds));

  check("the opening map still hands out all sixteen territories and invents none",
    Object.keys(open.holdings).length === 16 &&
    Object.keys(open.holdings).every((id) => !!territory(id)));

  const cold = openingHoldings(null);
  check("a first season with no previous Bretwalda opens dead even",
    PEOPLES.every((p) => Object.values(cold.holdings).filter((x) => x === p).length === 4) &&
    Object.entries(cold.thresholds).every(([tid, th]) => th === territory(tid).threshold));
}

// ============================================================
// 7. THE LOAD-BEARING RULE (docs/FACTIONS.md §3)
//
//   "Factions decide look, kit, flag and names. NOT stats. And a faction never
//    gates a match — twelve players split four ways is four empty queues
//    instead of one working room."
//
// Both halves, stated as fixtures the engine has to survive while HOLDING A
// CONQUERED MAP. The conquered map is the point: a neutrality gate run against
// an engine that has never heard of the war is a gate green because the case
// is absent, and that is this repository's signature failure.
// ============================================================
head("7. The load-bearing rule");
{
  /** A war one people has taken outright — the most lopsided input there is. */
  const CONQUERED = {
    contested: TERRITORIES.map((t) => t.id),
    holdings: Object.fromEntries(TERRITORIES.map((t) => [t.id, "norse"])),
  };
  const EVEN = {
    contested: TERRITORIES.map((t) => t.id),
    holdings: Object.fromEntries(TERRITORIES.map((t) => [t.id, t.people])),
  };

  /**
   * THE INJECTED DEFECT for the queue half of the rule (`--prove` only).
   *
   * `docs/FACTIONS.md` §3 names the failure exactly — "twelve players split
   * four ways is four empty queues instead of one working room" — so this is
   * that, in its crudest and most likely form: the first people the engine
   * hears becomes the room's people, and anybody else is turned away. It also
   * takes a man's side away from him, because "your people decides your band"
   * is the same mistake wearing a different hat.
   *
   * It is injected at the door and not inside `engine.mjs`, which is the point:
   * the fixtures below must be able to SEE a split without one being shipped.
   * Without this, §7a is three assertions that have never been off.
   */
  const splitTheQueue = (eng) => {
    if (!PROVE) return eng;
    const real = eng.message.bind(eng);
    let firstPeople = null;
    eng.message = (sid, msg) => {
      const type = msg && msg.type;
      const people = msg && msg.data && msg.data.allegiance;
      if ((type === "join" || type === "create") && typeof people === "string") {
        if (firstPeople === null) firstPeople = people;
        else if (people !== firstPeople) return undefined;  // four empty queues
      }
      if (type === "select_team") return undefined;         // your people is your band
      return real(sid, msg);
    };
    return eng;
  };

  const open = (eng) => {
    const c = { frames: [], byType: new Map(), snapshot: null };
    c.sid = eng.connect((str) => {
      const m = JSON.parse(str);
      if (!c.byType.has(m.type)) c.byType.set(m.type, []);
      c.byType.get(m.type).push(m.data);
      if (m.data && m.data.players) c.snapshot = m.data;
    });
    c.send = (type, data) => eng.message(c.sid, { type, data: data || {} });
    c.last = (t) => { const a = c.byType.get(t) || []; return a[a.length - 1]; };
    return c;
  };

  // ---- 7a. allegiance never splits a room --------------------------------
  // Twelve players, four peoples, one room. The failure this forbids is four
  // empty queues, so the fixture is the full spread in a single room.
  {
    const eng = splitTheQueue(makeEngine({ autoTick: false }));
    eng.setWarFront(CONQUERED);
    const host = open(eng);
    host.send("create", { name: "Alfa", mode: "blood_moot", allegiance: "saxon" });
    const code = host.last("join").code;
    const guests = [];
    for (let i = 0; i < 7; i++) {
      const g = open(eng);
      // Every people, and a made-up one, all reaching for the same room.
      g.send("join", { code, name: `G${i}`, allegiance: [...PEOPLES, "romans", "martians", "saxon"][i] });
      guests.push(g);
    }
    const seated = Object.keys(host.snapshot.players).length;
    gate("eight men of four peoples all take a seat in ONE room",
      seated === 8 && guests.every((g) => !!g.last("join") && !g.last("error")),
      `${seated} seated, ${guests.filter((g) => g.last("error")).length} refused`);

    // And a room whose men all swore the same way seats them the same.
    const eng2 = splitTheQueue(makeEngine({ autoTick: false }));
    eng2.setWarFront(CONQUERED);
    const h2 = open(eng2);
    h2.send("create", { name: "Alfa", mode: "blood_moot", allegiance: "norse" });
    const code2 = h2.last("join").code;
    for (let i = 0; i < 7; i++) open(eng2).send("join", { code: code2, name: `G${i}`, allegiance: "norse" });
    gate("a room of one people seats exactly as a room of four does",
      Object.keys(h2.snapshot.players).length === Object.keys(host.snapshot.players).length);

    // Teams are the match's own sides and have nothing to do with a people.
    const eng3 = splitTheQueue(makeEngine({ autoTick: false }));
    eng3.setWarFront(CONQUERED);
    const h3 = open(eng3);
    h3.send("create", { name: "Alfa", mode: "war_band", allegiance: "pict" });
    const code3 = h3.last("join").code;
    const g3 = [];
    for (let i = 0; i < 3; i++) { const g = open(eng3); g.send("join", { code: code3, name: `B${i}`, allegiance: "pict" }); g3.push(g); }
    g3[0].send("select_team", { team: "red" });
    g3[1].send("select_team", { team: "blue" });
    const teams = Object.values(h3.snapshot.players).map((p) => p.team);
    gate("four men of ONE people can still take opposite sides of a war band",
      teams.includes("red") && teams.includes("blue"), teams.join(","));
  }

  // ---- 7b. the engine is never told a man's people ------------------------
  {
    const eng = makeEngine({ autoTick: false });
    eng.setWarFront(CONQUERED);
    const a = open(eng);
    a.send("create", { name: "Alfa", mode: "blood_moot", allegiance: "norse" });
    const player = Object.values(a.snapshot.players)[0];
    // `warriorClass` is not a leak, so the pattern names the thing rather than
    // matching a substring of it: a check that fails on the wrong word is a
    // check nobody will trust the next time it goes red.
    const leaked = Object.keys(player).filter((k) => /allegiance|people|faction|territor|kingdom|banked/i.test(k));
    check("a man's people is not a field on the wire — the engine never learns it",
      leaked.length === 0, leaked.join(", ") || "clean");

    // Whatever the client claims, it cannot reach the banking path.
    const b = open(eng);
    b.send("create", { name: "Bravo", mode: "blood_moot", bestOf: 1 });
    const bcode = b.last("join").code;
    const c = open(eng);
    c.send("join", { code: bcode, name: "Ceol" });
    b.send("ready"); c.send("ready"); b.send("start");
    for (let i = 0; i < 6 * RATE; i++) eng.step();
    const room = eng._rooms.get(bcode);
    const men = [...room.players.values()];
    intoTheFire(men[1], 1);
    for (let i = 0; i < 40 && room.state !== "finished"; i++) eng.step();
    const end = b.last("match_end");
    const report = end && end.war;
    check("the war report the engine emits names territory and points, and no people",
      !!report && !!report.territoryId && Array.isArray(report.entries) &&
      report.entries.every((e) => typeof e.playerId === "string" && Number.isInteger(e.points) &&
        !("people" in e) && !("allegiance" in e)),
      JSON.stringify(report && report.entries));
  }

  // ---- 7c. territory never touches a stat --------------------------------
  // Two engines, identical in every way except the map they hold. If a
  // conquered map is worth a single point of health, reach or speed, these
  // diverge.
  {
    const spawn = (front, hurt) => {
      const eng = makeEngine({ autoTick: false });
      eng.setWarFront(front);
      const a = open(eng), b = open(eng);
      a.send("create", { name: "Alfa", mode: "blood_moot", bestOf: 1 });
      const code = a.last("join").code;
      a.send("select_class", { warriorClass: "huscarl" });
      b.send("join", { code, name: "Bravo" });
      b.send("select_class", { warriorClass: "runekeeper" });
      a.send("ready"); b.send("ready"); a.send("start");
      for (let i = 0; i < 4 * RATE; i++) eng.step();
      const room = eng._rooms.get(code);
      // THE INJECTED DEFECT (--prove only): the naive implementation of
      // "holding the map makes my people tougher".
      if (hurt) {
        room.players.forEach((p) => {
          const held = Object.values(front.holdings).filter((x) => x === "norse").length;
          p.maxHealth += held * 5; p.health = p.maxHealth;
        });
      }
      return { eng, a, b, code, room };
    };

    const dull = spawn(EVEN, false);
    const rich = spawn(CONQUERED, PROVE);

    const statsOf = (s) => [...s.room.players.values()]
      .map((p) => `${p.warriorClass}:${p.maxHealth}/${p.maxStamina}/${p.health}`).sort();
    gate("a conquered map buys nobody a point of health or stamina",
      JSON.stringify(statsOf(dull)) === JSON.stringify(statsOf(rich)),
      `${JSON.stringify(statsOf(dull))} vs ${JSON.stringify(statsOf(rich))}`);

    // And the same fight, fought to a real end under both maps, pays the same.
    // The wound is 120 and the runekeeper carries 90, so on an honest map he
    // falls and the match ends. That is exactly the quantity a holdings bonus
    // moves, which is why this fixture can see one.
    const play = (s) => {
      const men = [...s.room.players.values()];
      men[0].kills = 3; men[0].damage = 480;
      men[1].kills = 1; men[1].damage = 260;
      intoTheFire(men[1]);   // from FULL health: the burn is the measurement
      let steps = 0;
      while (s.room.state !== "finished" && steps < 40 * RATE) { s.eng.step(); steps++; }
      return { end: s.a.last("match_end"), steps };
    };
    const dullRun = play(dull), richRun = play(rich);
    const one = dullRun.end, two = richRun.end;
    // Compared on the quantities a match decides and not on its identifiers:
    // player ids and room codes are UUIDs and differ between any two engines,
    // so comparing them would fail for a reason that is not the one being
    // asked about.
    //
    // THE DURATION IS PART OF THE COMPARISON, and it took the red arm to say
    // so. Compared on the table alone this assertion STAYED GREEN over the
    // injected bonus — the kills and the purse are the same either way, and
    // all the extra health bought was three and a half more seconds of
    // burning. A neutrality gate that cannot see a man last longer is not a
    // neutrality gate, so the tick count the fight took to reach its end is
    // held here alongside what it paid.
    const scrub = (r) => r.end && JSON.stringify({
      ticks: r.steps,
      table: r.end.results.map((x) => [x.place, x.roundsWon, x.kills, x.deaths, x.damage, x.score, x.goldEarned, x.xpEarned, x.isWinner]),
      by: r.end.winnerBy, kind: r.end.winnerKind, rounds: r.end.roundsPlayed, target: r.end.roundTarget,
      war: r.end.war ? r.end.war.entries.map((e) => e.points) : null,
    });
    gate("the same fight under a conquered map runs for the same ticks and pays the same purse",
      !!one && !!two && dullRun.steps < 40 * RATE && scrub(dullRun) === scrub(richRun),
      !one || !two ? "a match never ended at all under one of the two maps" :
        `${scrub(dullRun)} vs ${scrub(richRun)}`);

    check("WARRIOR_STATS itself is untouched by any of it",
      Object.values(WARRIOR_STATS).every((s) => Number.isFinite(s.maxHealth) && s.maxHealth > 0) &&
      JSON.stringify(Object.keys(WARRIOR_STATS).sort()) === JSON.stringify(["berserker", "huscarl", "runekeeper", "warden"]));
  }
}

// ============================================================
// 8. THE ATTRIBUTION WRITE — the one place the fight touches the war
// ============================================================
head("8. The attribution write");
{
  const open = (eng) => {
    const c = { byType: new Map(), snapshot: null };
    c.sid = eng.connect((str) => {
      const m = JSON.parse(str);
      if (!c.byType.has(m.type)) c.byType.set(m.type, []);
      c.byType.get(m.type).push(m.data);
      if (m.data && m.data.players) c.snapshot = m.data;
    });
    c.send = (type, data) => eng.message(c.sid, { type, data: data || {} });
    c.last = (t) => { const a = c.byType.get(t) || []; return a[a.length - 1]; };
    c.got = (t) => c.byType.get(t) || [];
    return c;
  };

  /** A blood moot of `humans` men and `bots` bots, fought to a finish. */
  const fight = (eng, { humans = 2, bots = 0, mode = "blood_moot" } = {}) => {
    const clients = [];
    const host = open(eng);
    host.send("create", { name: "H", mode, bestOf: 1 });
    const code = host.last("join").code;
    clients.push(host);
    for (let i = 1; i < humans; i++) {
      const g = open(eng);
      g.send("join", { code, name: `G${i}` });
      clients.push(g);
    }
    for (let i = 0; i < bots; i++) host.send("add_bot", {});
    clients.forEach((c) => c.send("ready"));
    host.send("start");
    // Three seconds of countdown and three of fighting, so the spawn grace has
    // burnt off and the fire can bite.
    for (let i = 0; i < 6 * RATE; i++) eng.step();
    const room = eng._rooms.get(code);
    const men = [...room.players.values()];
    men.forEach((p, i) => { p.kills = i === 0 ? 4 : 1; p.damage = 300; });
    // Everyone but the first goes into the bonfire on one point of health. One
    // point rather than full because a recruit STEERS OUT of the fire — that is
    // the whole of `steerClearOfFire` — and a fixture that needed him to stand
    // in it for four seconds would be measuring the bot brain.
    men.slice(1).forEach((p) => intoTheFire(p, 1));
    for (let i = 0; i < 40 && room.state !== "finished"; i++) eng.step();
    return { host, clients, code, room, end: host.last("match_end") };
  };

  {
    const eng = makeEngine({ autoTick: false });
    const seen = [];
    const off = eng.onMatchEnd((r) => seen.push(r));
    check("the engine offers a match-end hook that hands back an unsubscribe",
      typeof eng.onMatchEnd === "function" && typeof off === "function");

    const m = fight(eng, { humans: 3 });
    check("a finished match names the ground it was fought over, on the wire",
      !!m.end && !!m.end.war && !!territory(m.end.war.territoryId),
      m.end && m.end.war ? m.end.war.territoryId : "no war block");

    check("the room carried that territory from the first countdown, not just at the end",
      !!m.host.got("countdown")[0] && m.host.got("countdown")[0].territory &&
      m.host.got("countdown")[0].territory.id === m.end.war.territoryId,
      JSON.stringify(m.host.got("countdown")[0] && m.host.got("countdown")[0].territory));

    check("the hook fired exactly once for one match", seen.length === 1, `${seen.length} calls`);

    check("the hook was handed the same report the wire carried",
      seen.length === 1 && seen[0].matchKey === m.end.war.matchKey &&
      seen[0].territoryId === m.end.war.territoryId &&
      seen[0].entries.length === m.end.war.entries.length);

    const banked = sum(m.end.war.entries.map((e) => e.points));
    const owed = sum(m.end.results.filter((r) => !r.id.startsWith("bot_")).map((r) => pointsFor(r)));
    check("every man on the results table is on the war report, for what the purse says he is worth",
      m.end.war.entries.length === 3 && banked === owed, `${banked} banked vs ${owed} owed`);

    off();
    const again = fight(eng, { humans: 2 });
    check("an unsubscribed handler stops hearing", seen.length === 1 && !!again.end.war);

    check("a second match mints a different match key",
      again.end.war.matchKey !== m.end.war.matchKey,
      `${m.end.war.matchKey} vs ${again.end.war.matchKey}`);
  }

  // Bots and lone men bank nothing. This is the anti-farm gate: a man alone
  // with seven recruits could otherwise take Britain overnight.
  {
    const eng = makeEngine({ autoTick: false });
    const solo = fight(eng, { humans: 1, bots: 3 });
    check("one man and three recruits bank nothing at all",
      !!solo.end && (solo.end.war === null || solo.end.war === undefined),
      JSON.stringify(solo.end && solo.end.war));

    const pair = fight(eng, { humans: 2, bots: 2 });
    check("two men and two recruits bank for the two men only",
      !!pair.end.war && pair.end.war.entries.length === 2 &&
      pair.end.war.entries.every((e) => !e.playerId.startsWith("bot_")),
      JSON.stringify(pair.end.war && pair.end.war.entries.map((e) => e.playerId.slice(0, 4))));
  }

  // Training pays no gold and must not pay the war either.
  {
    const eng = makeEngine({ autoTick: false });
    const c = open(eng);
    c.send("solo", { name: "Alone", botCount: 2, autoStart: true });
    for (let i = 0; i < 10 * RATE; i++) eng.step();
    check("training is not a match and never touches the war",
      (c.got("match_end") || []).every((d) => !d.war));
  }

  // A handler that throws is a handler that must not cost the round.
  {
    const eng = makeEngine({ autoTick: false });
    eng.onMatchEnd(() => { throw new Error("the database is on fire"); });
    let second = 0;
    eng.onMatchEnd(() => { second++; });
    const m = fight(eng, { humans: 2 });
    check("a handler that throws does not stop the match ending", !!m.end && !!m.end.war);
    check("...nor stop the next handler being called", second === 1);
    // The room still has to reach the lobby, or the men who stayed are stuck.
    for (let i = 0; i < 12 * RATE; i++) eng.step();
    check("...nor cost the men still in the lobby their next fight",
      m.room.state === "lobby", `room is ${m.room.state}`);
  }

  // The deal.
  {
    const front = { contested: ["kent", "deira", "fortriu", "kernow"], holdings: {} };
    const picks = new Set();
    for (let i = 0; i < 200; i++) picks.add(dealTerritory(`seed-${i}`, front));
    check("a match is dealt from the contested front and never from outside it",
      [...picks].every((id) => front.contested.includes(id)), [...picks].join(","));
    check("the front is actually spread over, not collapsed onto one territory",
      picks.size === Math.min(FRONT_WINDOW, front.contested.length), `${picks.size} of ${FRONT_WINDOW}`);
    check("the same seed always deals the same ground — a replay reproduces a war",
      dealTerritory("abc", front) === dealTerritory("abc", front));

    // AND THE ENGINE'S SEED IS ONE A REPLAY CAN REPRODUCE.
    //
    // This assertion is here because `protocoltest`'s replay check found it
    // red and this file did not. The deal was seeded on the room code and the
    // match's UUID — both drawn from sources engine.mjs deliberately leaves
    // unpinned — so two runs of one scripted match were fought over different
    // ground. Stated here as well, in the war's own ruler, because a war layer
    // that cannot be replayed is a war layer whose bugs cannot be reproduced,
    // and the file that owns the deal should be the file that says so.
    const scripted = () => {
      const eng = makeEngine({ autoTick: false });
      const a = open(eng), b = open(eng);
      a.send("create", { name: "Alfa", mode: "blood_moot", bestOf: 1 });
      const code = a.last("join").code;
      b.send("join", { code, name: "Bravo" });
      a.send("ready"); b.send("ready"); a.send("start");
      for (let i = 0; i < 6 * RATE; i++) eng.step();
      return eng._rooms.get(code).territoryId;
    };
    const runOne = scripted(), runTwo = scripted();
    check("two runs of one scripted match are dealt the SAME ground",
      runOne === runTwo && !!territory(runOne), `${runOne} then ${runTwo}`);
    check("an empty or nonsense front still deals a real territory",
      !!territory(dealTerritory("x", { contested: [] })) &&
      !!territory(dealTerritory("x", { contested: ["atlantis"] })) &&
      !!territory(dealTerritory("x", null)));
  }
}

// ============================================================
const failed = results.filter((r) => !r.pass);
console.log("\n" + "=".repeat(64));
console.log(`${failed.length === 0 ? "PASS" : "FAIL"}: the war — ${results.length - failed.length}/${results.length}` +
  (PROVE ? "  [RED ARM: neutrality gates were required to FAIL over an injected defect]" : ""));
if (failed.length) {
  console.log("\nfailed:");
  for (const f of failed) console.log(`  [${f.section}] ${f.name}`);
}
console.log("=".repeat(64));
process.exit(failed.length === 0 ? 0 : 1);
