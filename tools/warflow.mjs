#!/usr/bin/env node
// ============================================================
// WARFLOW — the war, end to end, through the real routes and a real Postgres.
//
//   WAR_TEST_DB=postgres://... node tools/warflow.mjs
//   WAR_TEST_DB=... node tools/warflow.mjs --keep    # leave the server up
//
// SIBLING OF `wartest`, AND IT MEASURES WHAT THAT ONE CANNOT.
//
// `tools/wartest.mjs` holds the RULES — conservation, the flip's exact edge,
// idempotency, the crown — against pure functions and a stepped engine, in
// four seconds and with no database in the room. Every one of those assertions
// would still pass on a build where `src/db/war.ts` wrote nothing at all.
//
// This one holds the WIRING. It boots the game, mints profiles the way a phone
// does, swears them to different peoples, fights real matches over a real
// socket, and then asks the database what it believes. The three things it
// exists to catch are exactly the three that live between the rule and the
// row:
//
//   1. THE HOOK IS SUBSCRIBED. A match ends and something is banked.
//   2. THE PEOPLE COMES FROM THE OATH. A man banks for the people on his
//      profile row, and a man who never swore banks nothing.
//   3. THE UNIQUE INDEX IS REAL. A duplicated ledger row is refused by
//      Postgres and not by a Map that a restart would empty.
//   4. THE REPLAY GUARD HOLDS THROUGH `bankMatch` ITSELF — see below.
//
// ---------------------------------------------------------------------------
// WHY 4 WAS ADDED, AND WHAT WAS WRONG WITH 3 ON ITS OWN.
//
// An adversary deleted one line from `bankOne` in `src/db/war.ts` —
//
//     if (!inserted.length) return false;
//
// — which is the entire replay guard, and BOTH suites stayed green: `wartest`
// 79/79 and this file 22/22. Its own probe then showed the map moving on every
// retry, norse 14 -> 42, while the ledger stayed at two rows: silent
// conservation breakage, shipped under two passing harnesses.
//
// The reason is exactly `docs/PROCESS.md` failure mode 1. Check 3 asserts that
// POSTGRES REFUSES A HAND-WRITTEN DUPLICATE INSERT. That is a true and useful
// fact about the unique index and it says nothing whatever about whether
// `bankMatch` CONSULTS it. The guard lives in the branch after the insert, and
// no assertion in this file had ever executed that branch, because nothing here
// could fire the same report twice — the wire only ever delivers a match end
// once. Green because the case was absent.
//
// So the probe now imports the server's own `src/db/war.ts` — the real module,
// through `tools/lib/tsresolve.mjs`, no reimplementation — and calls
// `bankMatch` with one identical report three times over. It carries its own
// POSITIVE CONTROL first: a report that has never been banked MUST move the map
// by exactly its points, in this process, before "it did not move" is allowed
// to mean anything. A probe whose bank is inert would otherwise pass the replay
// assertion by doing nothing at all, which is the same failure one level up.
//
// It also happens to prove the cross-process case the schema comment claims:
// this is a SECOND process banking against the same database, which is the two
// server instances `db/README.md` warns about, not a retry inside one memory.
//
// Requires a database. Without WAR_TEST_DB it says so and exits 0, because a
// harness that fails for want of a fixture teaches a team to ignore it.
// ============================================================
import { spawn, execFileSync } from "child_process";
import { register } from "node:module";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { WebSocket } from "ws";
import { chooseServer } from "./lib/freshbuild.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DB = process.env.WAR_TEST_DB || process.env.PROFILE_TEST_DB || "";
const KEEP = process.argv.includes("--keep");
const PORT = parseInt(process.env.PORT || String(3910 + (process.pid % 40)), 10);
const BASE = `http://127.0.0.1:${PORT}`;

let server = null;
let pass = 0, fail = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

if (!DB) {
  console.log("warflow: no WAR_TEST_DB — the war cannot be checked without a database.");
  console.log("         Stand one up and pass it in. `wartest` covers the rules meanwhile.");
  process.exit(0);
}

/** Straight SQL, for reading what the routes will not tell you and for the one
 *  fixture that has to be built underneath them. */
function sql(statement) {
  return execFileSync("psql", [DB, "-tAF", "\t", "-c", statement], { encoding: "utf8" }).trim();
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

let serverNote = "";
async function boot() {
  // `existsSync(".next/BUILD_ID")` used to be the whole of this decision, and
  // in the worktree the war spine was written in that bundle was seven minutes
  // OLDER than the commit — so two source mutations had no effect under this
  // harness and it reported 22/22 about a build nobody had made. See
  // `tools/lib/freshbuild.mjs`; the mode it chose rides the verdict line below.
  const choice = chooseServer(ROOT, "warflow");
  serverNote = choice.note;
  server = spawn("node", [choice.script], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: choice.prod ? "production" : "development", DATABASE_URL: DB },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  const started = Date.now();
  for (;;) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch { /* wait */ }
    if (Date.now() - started > 180000) throw new Error("server never came up");
    await sleep(400);
  }
}

class Fighter {
  constructor(label) { this.label = label; this.msgs = []; this.waiters = []; }
  open() {
    return new Promise((ok, no) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
      this.ws.on("open", ok);
      this.ws.on("error", no);
      this.ws.on("message", (raw) => {
        const m = JSON.parse(raw.toString());
        this.msgs.push(m);
        if (m.type === "game_state" || m.type === "join" || m.type === "countdown") {
          if (m.data && m.data.players) this.snapshot = m.data;
        }
        for (let i = this.waiters.length - 1; i >= 0; i--) {
          if (this.waiters[i].type === m.type) { this.waiters.splice(i, 1)[0].ok(m); }
        }
      });
    });
  }
  send(type, data) { this.ws.send(JSON.stringify({ type, data: data || {} })); }
  expect(type, ms = 30000) {
    const hit = this.msgs.find((m) => m.type === type);
    if (hit) return Promise.resolve(hit);
    return new Promise((ok, no) => {
      this.waiters.push({ type, ok });
      setTimeout(() => no(new Error(`${this.label}: timed out waiting for ${type}`)), ms);
    });
  }
  close() { try { this.ws.close(); } catch { /* already gone */ } }
}

/**
 * A real match, fought to a real death, with BOTH men still on the field.
 *
 * The loser walks into the bonfire rather than closing his socket, and that is
 * not a flourish: a man who disconnects is deleted from the room, so the
 * results table would carry one human and the war banks nothing at all
 * (`warReport` refuses a match under two men — see `engine.mjs`). The whole
 * point of this harness is a match with two men in it, so the loser has to
 * lose while still standing there.
 */
async function fight(profileA, profileB) {
  const a = new Fighter("A"), b = new Fighter("B");
  await a.open(); await b.open();
  a.send("create", { name: "Aethelred", bestOf: 1 });
  const joinA = await a.expect("join");
  b.send("join", { code: joinA.data.code, name: "Guthrum" });
  const joinB = await b.expect("join");

  // What a client does on `join`, before there is any pay to argue over.
  if (profileA) await post("/api/profile/bind", { id: profileA.id, secret: profileA.secret, playerId: joinA.data.playerId });
  if (profileB) await post("/api/profile/bind", { id: profileB.id, secret: profileB.secret, playerId: joinB.data.playerId });

  a.send("ready"); b.send("ready");
  await sleep(300);
  a.send("start");
  await a.expect("countdown");

  // Wait for the bell, then walk B into the fire at the origin. The grace is
  // two seconds long, so he burns a little after he arrives.
  for (let i = 0; i < 120; i++) {
    const st = b.msgs.filter((m) => m.type === "game_state").pop();
    if (st?.data?.state === "fighting" || st?.data?.state === "last_stand") break;
    await sleep(150);
  }
  const endPromise = a.expect("match_end", 60000);
  const walk = setInterval(() => {
    const st = b.msgs.filter((m) => m.type === "game_state").pop();
    const me = st?.data?.players?.[joinB.data.playerId];
    if (!me) return;
    const d = Math.hypot(me.position.x, me.position.z) || 1;
    b.send("input", {
      moveX: -me.position.x / d, moveZ: -me.position.z / d,
      rotationY: Math.atan2(-me.position.x, -me.position.z),
      sprint: true, attack: false, heavyAttack: false, block: false,
      dodge: false, crouch: false, ability: false, shove: false, attackDir: "right",
    });
  }, 100);

  let end = null;
  try { end = await endPromise; } finally { clearInterval(walk); }
  a.close(); b.close();
  return { end: end?.data, playerA: joinA.data.playerId, playerB: joinB.data.playerId, code: joinA.data.code };
}

async function main() {
  console.log("[warflow] wiping the war tables and booting");
  sql(`DROP TABLE IF EXISTS war_ledger, war_flips, territories, seasons CASCADE;
       DROP TABLE IF EXISTS players, match_history, legacy_claims CASCADE;`);
  await boot();

  // ---- the oath -------------------------------------------------------
  console.log("\n[warflow] the oath");
  const A = (await post("/api/profile/new", { name: "Aethelred" })).json;
  const B = (await post("/api/profile/new", { name: "Guthrum" })).json;
  check("two profiles appear out of nothing", !!A?.id && !!B?.id);

  const bad = await post("/api/war/swear", { id: A.id, secret: A.secret, people: "romans" });
  check("a people that is not one of the four cannot be sworn to",
    bad.status === 400 && bad.json?.error === "unknown_people");
  const forged = await post("/api/war/swear", { id: A.id, secret: "not-his-key", people: "norse" });
  check("a man cannot swear on somebody else's key", forged.status === 401);

  const oathA = await post("/api/war/swear", { id: A.id, secret: A.secret, people: "norse" });
  const oathB = await post("/api/war/swear", { id: B.id, secret: B.secret, people: "saxon" });
  check("the oath is taken and recorded", oathA.json?.ok && oathB.json?.ok,
    `${oathA.json?.allegiance} / ${oathB.json?.allegiance}`);
  check("...on the profile row and nowhere else",
    sql(`SELECT allegiance FROM players WHERE id = ${A.id}`) === "norse");

  const view0 = (await post("/api/war", {})).json;
  check("a season opened by itself, with all sixteen territories on the map",
    view0?.war?.season?.index === 1 && view0.war.territories.length === 16,
    `season ${view0?.war?.season?.index}, ${view0?.war?.territories?.length} territories`);
  check("and it opened dead even, four to each people",
    view0.war.standings.every((s) => s.held === 4), JSON.stringify(view0.war.standings.map((s) => `${s.people}:${s.held}`)));

  // ---- the attribution write -----------------------------------------
  console.log("\n[warflow] the attribution write");
  const m1 = await fight({ id: A.id, secret: A.secret }, { id: B.id, secret: B.secret });
  check("a real match, fought over a named territory, ended",
    !!m1.end && !!m1.end.war && !!m1.end.war.territoryId, m1.end?.war?.territoryId);

  // The hook is asynchronous by design — `endMatch` never waits for Postgres.
  for (let i = 0; i < 40 && Number(sql("SELECT count(*) FROM war_ledger")) < 2; i++) await sleep(150);
  const rows = sql("SELECT match_key, people, territory_id, points FROM war_ledger ORDER BY points DESC");
  check("both men were banked, each for the people HE swore to",
    rows.split("\n").length === 2 &&
    rows.includes("norse") && rows.includes("saxon"), rows.replace(/\n/g, " | "));

  const ground = m1.end.war.territoryId;
  const contest = JSON.parse(sql(`SELECT contest FROM territories WHERE territory_id = '${ground}'`));
  const owed = m1.end.war.entries.reduce((n, e) => n + e.points, 0);
  check("the points the wire promised are the points the map received",
    Object.values(contest).reduce((n, v) => n + v, 0) === owed,
    `${JSON.stringify(contest)} vs ${owed} promised`);

  // ---- the unique index ------------------------------------------------
  console.log("\n[warflow] the replay guard — the index");
  const one = sql("SELECT match_key, player_id FROM war_ledger LIMIT 1").split("\t");
  let refused = false;
  try {
    sql(`INSERT INTO war_ledger (season_id, match_key, player_id, profile_id, people, territory_id, points)
         VALUES (1, '${one[0]}', '${one[1]}', ${A.id}, 'norse', '${ground}', 99)`);
  } catch { refused = true; }
  check("Postgres itself refuses a second row for the same match and man — the guard is not a Map in one process",
    refused && Number(sql("SELECT count(*) FROM war_ledger")) === 2);

  // ---- a man who never swore ------------------------------------------
  console.log("\n[warflow] the unsworn");
  const C = (await post("/api/profile/new", { name: "Nobody" })).json;
  const before = Number(sql("SELECT count(*) FROM war_ledger"));
  const m2 = await fight({ id: C.id, secret: C.secret }, { id: B.id, secret: B.secret });
  for (let i = 0; i < 40 && Number(sql("SELECT count(*) FROM war_ledger")) <= before; i++) await sleep(150);
  const added = sql(`SELECT profile_id FROM war_ledger WHERE match_key = '${m2.end.war.matchKey}'`);
  check("a man who never swore banks nothing, and the man beside him still banks",
    added.split("\n").filter(Boolean).length === 1 && added.trim() === String(B.id),
    `banked profiles: ${added.replace(/\n/g, ",") || "none"}`);

  // ---- the flip, through the real write path ---------------------------
  //
  // THE THRESHOLD IS LOWERED FOR THIS FIXTURE AND IT IS SAID OUT LOUD.
  // Wessex costs 320 points of lead, which is fifteen honest matches — too
  // many to fight here. What is under test in this block is not the NUMBER
  // (`wartest` §4 holds that against `war.mjs`, at 319 and at 320); it is
  // whether the database path notices a threshold at all: whether the holder
  // changes, the contest clears, the epoch advances and a flip row appears.
  // So the fixture writes a small threshold into the territory ROW — which is
  // data the season already owns, and exactly what a season reset writes when
  // it discounts the last champion's ground.
  //
  // THE THRESHOLD, AND NOTHING ELSE. The first cut of this fixture also
  // zeroed `contest` and `cleared` "to start clean", and the conservation
  // assertion below went RED at 30 banked against 14 accounted — because
  // sixteen points had been wiped off the map while their ledger rows stayed
  // where they were. The harness had broken the invariant it was about to
  // measure. It is left recorded here because it is the whole argument for
  // having a conservation check at all: it caught a hand reaching into the
  // database, which is exactly what it is for.
  console.log("\n[warflow] the flip (threshold lowered in the FIXTURE — see the comment)");
  sql("UPDATE territories SET threshold = 4");
  const holderBefore = new Map(sql("SELECT territory_id, holder FROM territories ORDER BY territory_id")
    .split("\n").map((line) => line.split("\t")));
  let flipped = null;
  for (let i = 0; i < 6 && !flipped; i++) {
    const m = await fight({ id: A.id, secret: A.secret }, null);
    if (!m.end?.war) continue;
    for (let j = 0; j < 40; j++) {
      const rowsF = sql("SELECT territory_id, from_people, to_people FROM war_flips");
      if (rowsF) { flipped = rowsF; break; }
      await sleep(150);
    }
  }
  check("a border moved, and it moved to the people that took it",
    !!flipped && flipped.includes("norse"), flipped || "nothing moved in six matches");
  if (flipped) {
    const tid = flipped.split("\n")[0].split("\t")[0];
    const row = sql(`SELECT holder, epoch, contest, cleared FROM territories WHERE territory_id = '${tid}'`).split("\t");
    check("the new holder is on the map, the contest is cleared and the epoch advanced",
      row[0] === "norse" && Number(row[1]) >= 1 &&
      Object.values(JSON.parse(row[2])).every((v) => v === 0) && Number(row[3]) > 0,
      `holder ${row[0]}, epoch ${row[1]}, contest ${row[2]}, cleared ${row[3]}`);

    const conserved = sql(`
      SELECT (SELECT coalesce(sum(points),0) FROM war_ledger WHERE territory_id = '${tid}'),
             (SELECT (contest->>'saxon')::int + (contest->>'norse')::int
                   + (contest->>'briton')::int + (contest->>'pict')::int + cleared
              FROM territories WHERE territory_id = '${tid}')`).split("\t");
    check("and the points still reconcile in SQL: banked == on the map + cleared by flips",
      conserved[0] === conserved[1], `${conserved[0]} banked vs ${conserved[1]} accounted`);

    const view = (await post("/api/war", { id: A.id, secret: A.secret })).json;
    check("the map screen is told what moved, in words",
      view?.war?.recent?.length > 0 && view.war.recent[0].to === "norse",
      JSON.stringify(view?.war?.recent?.[0]));
    check("...and the standings moved with it",
      view.war.standings.find((s) => s.people === "norse").held === 5,
      JSON.stringify(view.war.standings.map((s) => `${s.people}:${s.held}`)));
    check("...and a sworn man sees his own contribution",
      view.self?.allegiance === "norse" && view.self.points > 0 && view.self.locked === true,
      JSON.stringify(view.self));
  }
  const holderAfter = new Map(sql("SELECT territory_id, holder FROM territories ORDER BY territory_id")
    .split("\n").map((line) => line.split("\t")));
  const moved = [...holderAfter].filter(([id, who]) => holderBefore.get(id) !== who);
  check("exactly the ground that was fought over changed hands, and no other",
    holderAfter.size === 16 && moved.length === 1,
    moved.map(([id, who]) => `${id} -> ${who}`).join(", ") || "nothing moved");

  // THE WHOLE MAP, RECONCILED IN SQL. Every point the game ever awarded is
  // either sitting on a border or was consumed by a flip. One query, sixteen
  // territories, no trust required.
  const audit = sql(`
    SELECT (SELECT coalesce(sum(points),0) FROM war_ledger),
           (SELECT coalesce(sum((contest->>'saxon')::int + (contest->>'norse')::int
                              + (contest->>'briton')::int + (contest->>'pict')::int + cleared), 0)
            FROM territories)`).split("\t");
  check("across the whole map: every point banked is on a border or was cleared by a flip",
    audit[0] === audit[1], `${audit[0]} banked, ${audit[1]} accounted for`);

  // ---- THE REPLAY GUARD, THROUGH bankMatch ------------------------------
  //
  // The check above proves the INDEX. This proves that `bankMatch` OBEYS it,
  // which is a different sentence and is the one that was never asserted. See
  // the header: deleting `if (!inserted.length) return false;` left both suites
  // green while every retry moved the map.
  console.log("\n[warflow] the replay guard — the same report, fired three times");
  process.env.DATABASE_URL = DB;   // read at module load by src/db/index.ts
  register(pathToFileURL(resolve(ROOT, "tools/lib/tsresolve.mjs")).href, { data: { root: ROOT } });
  const { bankMatch } = await import(pathToFileURL(resolve(ROOT, "src/db/war.ts")).href);
  const { bindPlayer } = await import(pathToFileURL(resolve(ROOT, "src/db/matchLedger.ts")).href);

  // This process has its own bind table — it is a second server instance, and
  // that is the case worth testing. The player ids are the ones the wire used.
  bindPlayer(m1.playerA, A.id);
  bindPlayer(m1.playerB, B.id);

  const mapTotal = () => Number(sql(`
    SELECT coalesce(sum((contest->>'saxon')::int + (contest->>'norse')::int
                      + (contest->>'briton')::int + (contest->>'pict')::int + cleared), 0)
      FROM territories`));
  const ledgerRows = () => Number(sql("SELECT count(*) FROM war_ledger"));

  // THE POSITIVE CONTROL, and it is not optional. "The map did not move" is
  // satisfied perfectly by a `bankMatch` that cannot move anything — a missing
  // DATABASE_URL, an unbound player, a swallowed throw. So the same call, in
  // the same process, with the same shape of report, is made to move the map
  // FIRST. If this check is red, every assertion under it is meaningless and
  // says so rather than passing.
  const REPORT = {
    matchKey: `warflow-replay-${Date.now()}`,
    territoryId: ground,
    entries: [
      { playerId: m1.playerA, name: "Aethelred", points: 7 },
      { playerId: m1.playerB, name: "Guthrum", points: 5 },
    ],
    at: Date.now(),
  };
  const preBank = { map: mapTotal(), rows: ledgerRows() };
  const first = await bankMatch(REPORT);
  const afterFirst = { map: mapTotal(), rows: ledgerRows() };
  check("POSITIVE CONTROL: a report this database has never seen DOES move the map, from this process",
    first === 2 && afterFirst.rows === preBank.rows + 2 && afterFirst.map === preBank.map + 12,
    `banked ${first}, ledger ${preBank.rows}->${afterFirst.rows}, map ${preBank.map}->${afterFirst.map} (+12 owed)`);

  const second = await bankMatch(REPORT);
  const third = await bankMatch(REPORT);
  const afterRetries = { map: mapTotal(), rows: ledgerRows() };
  check("the SAME report fired twice more banks nothing at all",
    second === 0 && third === 0, `second banked ${second}, third banked ${third}`);
  check("...and THE MAP DID NOT MOVE — not one point on any border",
    afterRetries.map === afterFirst.map,
    `${afterFirst.map} after the first, ${afterRetries.map} after three`);
  check("...and the ledger gained no rows either",
    afterRetries.rows === afterFirst.rows,
    `${afterFirst.rows} rows, still ${afterRetries.rows}`);

  // The same report with the points INFLATED. The replay guard is keyed on
  // (match_key, player_id) and not on the payload, so a forged retry that
  // claims forty points a man must move nothing — the row already exists and
  // the guard never reads what the caller asked for.
  const inflated = await bankMatch({ ...REPORT, entries: REPORT.entries.map((e) => ({ ...e, points: 40 })) });
  check("...and a forged retry claiming forty points a man moves nothing",
    inflated === 0 && mapTotal() === afterFirst.map,
    `banked ${inflated}, map ${mapTotal()}`);

  // AND THE WHOLE MAP RECONCILES AGAIN, AFTER the retries. This is the exact
  // shape of the breakage the deleted line produced — ledger flat, map
  // climbing — so the identity is re-asserted here rather than only before the
  // replays, where it could not have seen it.
  const reaudit = sql(`
    SELECT (SELECT coalesce(sum(points),0) FROM war_ledger),
           (SELECT coalesce(sum((contest->>'saxon')::int + (contest->>'norse')::int
                              + (contest->>'briton')::int + (contest->>'pict')::int + cleared), 0)
            FROM territories)`).split("\t");
  check("and after four replays the ledger and the map still agree to the point",
    reaudit[0] === reaudit[1], `${reaudit[0]} banked, ${reaudit[1]} accounted for`);

  // ---- the oath locks --------------------------------------------------
  console.log("\n[warflow] the oath, once he has fought");
  const turn = await post("/api/war/swear", { id: A.id, secret: A.secret, people: "pict" });
  check("a man who has taken the field cannot change sides mid-season",
    turn.status === 409 && turn.json?.error === "sworn", JSON.stringify(turn.json)?.slice(0, 100));
  check("...and his oath is untouched by the attempt",
    sql(`SELECT allegiance FROM players WHERE id = ${A.id}`) === "norse");

  console.log("\n" + "=".repeat(70));
  console.log(`${fail === 0 ? "PASS" : "FAIL"}: the war, end to end — ${pass}/${pass + fail}`);
  console.log(`      measured against: ${serverNote}`);
  console.log("=".repeat(70));
  if (!KEEP) { server.kill("SIGKILL"); }
  else console.log(`[warflow] server left up on ${BASE} (--keep)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[warflow]", err);
  if (server) server.kill("SIGKILL");
  process.exit(1);
});
