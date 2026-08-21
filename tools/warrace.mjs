#!/usr/bin/env node
// ============================================================
// WARRACE — the 35-day boundary, hit by everybody at once.
//
//   WAR_TEST_DB=postgres://... node tools/warrace.mjs
//   WAR_TEST_DB=... node tools/warrace.mjs --callers 12
//
// WHY THIS FILE EXISTS, in the words of the report that produced it:
//
//   "Under concurrent callers the adversary got THREE seasons opened (indexes
//    2, 3, 4), each with its own 16 territory rows, permanently orphaned
//    because currentSeason only ever reads the highest index. Worse, in EVERY
//    concurrent run the new season opened DEAD EVEN — 4/4/4/4, thresholds
//    240/320 — so the champion's fifth territory and the 0.75 target discount,
//    which is the documented reset mechanic of WHAT-THIS-GAME-IS §3 and
//    war.mjs openingHoldings, SILENTLY DID NOT HAPPEN."
//
// `wartest` cannot see this: it holds `openingHoldings` against pure inputs and
// that function was never wrong. `warflow` cannot see it either: it fights one
// season and never reaches a rollover. The defect lives in exactly the seam
// between them — `src/db/war.ts`'s `currentSeason`, under more than one caller
// — and the unit that wrote it called that seam "its single largest untested
// surface". It did not survive being tested.
//
// WHAT IS UNDER TEST is three properties, and the third is the one that
// actually costs a player something:
//
//   1. ONE SEASON OPENS, not three. Exactly one row is added to `seasons` and
//      exactly sixteen to `territories`, however many callers arrive together.
//   2. ONE VERDICT, ONE CROWN. The season that ended has a verdict, it names
//      the people that actually led it, and the Bretwalda's permanent mark is
//      written once.
//   3. THE RESET MECHANIC HAPPENED. The new map is the CHAMPION'S map — five
//      territories and a 0.75 discount on his thresholds — and not the dead
//      even 4/4/4/4 that a lost verdict silently produces. A season that opens
//      even is a season in which the reward for winning the last one is
//      nothing, and nothing in the game would have said so.
//
// This is deliberately NOT a rules harness. Every number it asserts —
// five held, 180, 240 — comes from `war.mjs` at runtime rather than from a
// literal here, so a rebalance of the map moves this gate with it instead of
// making it lie.
//
// Requires a database and says so and exits 0 without one, for the same reason
// `warflow` does: a harness that fails for want of a fixture teaches a team to
// ignore it.
// ============================================================
import { spawn, execFileSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chooseServer } from "./lib/freshbuild.mjs";
import { PEOPLES, TERRITORIES, openingHoldings } from "../src/game/war.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DB = process.env.WAR_TEST_DB || process.env.PROFILE_TEST_DB || "";
const CALLERS = Math.max(2, parseInt(
  process.argv[process.argv.indexOf("--callers") + 1] || "10", 10) || 10);
const PORT = parseInt(process.env.PORT || String(3860 + (process.pid % 40)), 10);
const BASE = `http://127.0.0.1:${PORT}`;

let server = null;
let pass = 0, fail = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

if (!DB) {
  console.log("warrace: no WAR_TEST_DB — a rollover race cannot be run without a database.");
  process.exit(0);
}

function sql(statement) {
  return execFileSync("psql", [DB, "-tAF", "\t", "-c", statement], { encoding: "utf8" }).trim();
}
const num = (statement) => Number(sql(statement));

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
  const choice = chooseServer(ROOT, "warrace");
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

async function main() {
  console.log("[warrace] wiping the war tables and booting");
  sql(`DROP TABLE IF EXISTS war_ledger, war_flips, territories, seasons CASCADE;
       DROP TABLE IF EXISTS players, match_history, legacy_claims CASCADE;`);
  await boot();

  // ---- a season, and a champion in it ---------------------------------
  console.log("\n[warrace] season one, and a man who led it");
  const A = (await post("/api/profile/new", { name: "Guthrum" })).json;
  const B = (await post("/api/profile/new", { name: "Aethelred" })).json;
  await post("/api/war/swear", { id: A.id, secret: A.secret, people: "norse" });
  await post("/api/war/swear", { id: B.id, secret: B.secret, people: "saxon" });
  const opened = (await post("/api/war", {})).json;
  check("season one opened, sixteen territories, dead even",
    opened?.war?.season?.index === 1 && opened.war.territories.length === 16 &&
    opened.war.standings.every((s) => s.held === 4),
    `season ${opened?.war?.season?.index}`);

  // THE CONTRIBUTION IS A FIXTURE AND IT IS SAID OUT LOUD. Two ledger rows are
  // written straight into Postgres rather than fought for. What is under test
  // here is the ROLLOVER, not the banking — `warflow` fights real matches
  // through the real socket and holds that path, and `wartest` §3 holds
  // conservation. Fighting enough matches to produce a champion would cost
  // minutes and would measure nothing this file is about.
  //
  // The rows are NOT reflected on the map, so the whole-map conservation
  // identity is deliberately broken for the life of this run. That is stated
  // here rather than discovered later: do not add a conservation check to this
  // harness without first banking these points properly.
  const seasonOne = num("SELECT id FROM seasons WHERE index = 1");
  sql(`INSERT INTO war_ledger (season_id, match_key, player_id, profile_id, people, territory_id, points)
       VALUES (${seasonOne}, 'warrace-fixture-1', 'fixture-a', ${A.id}, 'norse', '${TERRITORIES[0].id}', 90),
              (${seasonOne}, 'warrace-fixture-2', 'fixture-b', ${B.id}, 'saxon', '${TERRITORIES[0].id}', 30)`);
  check("the fixture makes exactly one people the leader on points",
    num(`SELECT count(*) FROM war_ledger WHERE season_id = ${seasonOne}`) === 2);

  // ---- the boundary ----------------------------------------------------
  // The season's clock is the only thing moved. Everything else — who calls,
  // how many, in what order — is what a real 35-day boundary looks like: every
  // phone that opens the map, plus every match that ends, inside the same
  // second.
  console.log(`\n[warrace] the 35-day boundary, hit by ${CALLERS} callers at once`);
  sql("UPDATE seasons SET ends_at = now() - interval '1 hour' WHERE state = 'running'");

  const calls = [];
  for (let i = 0; i < CALLERS; i++) {
    // A mixture, because `currentSeason` has five callers and they are not all
    // the map screen. `/api/war` is warView; `/api/war/swear` is the oath path;
    // `/api/war` with credentials also runs warSelf and refreshFront.
    if (i % 3 === 2) calls.push(post("/api/war/swear", { id: B.id, secret: B.secret, people: "saxon" }));
    else if (i % 3 === 1) calls.push(post("/api/war", { id: A.id, secret: A.secret }));
    else calls.push(post("/api/war", {}));
  }
  const answers = await Promise.all(calls);
  await sleep(600);   // refreshFront is fired and not awaited by the route

  // ---- 1. one season opened -------------------------------------------
  console.log("\n[warrace] one boundary, one season");
  const seasonRows = sql("SELECT index, state FROM seasons ORDER BY index")
    .split("\n").filter(Boolean).map((l) => l.split("\t"));
  check("exactly two seasons exist: the one that ended and the one that opened",
    seasonRows.length === 2,
    seasonRows.map(([i, s]) => `${i}:${s}`).join(", ") || "none");
  check("exactly one season is running",
    num("SELECT count(*) FROM seasons WHERE state = 'running'") === 1,
    `${num("SELECT count(*) FROM seasons WHERE state = 'running'")} running`);
  // THIRTY-TWO, and the literal is the point. The first cut of this line read
  // `16 * seasonRows.length`, which is a bar that MOVES WITH THE DEFECT: three
  // seasons and forty-eight orphaned territory rows satisfied it, and it
  // printed PASS on the exact corruption the file was written to catch. One
  // boundary crossed once is two seasons and thirty-two rows of map, whatever
  // else happened.
  check("the map is thirty-two territory rows — two seasons — with nothing orphaned",
    num("SELECT count(*) FROM territories") === 32,
    `${num("SELECT count(*) FROM territories")} territory rows across ${seasonRows.length} season(s)`);

  const indexes = new Set(answers.map((a) => a.json?.war?.season?.index).filter((n) => n));
  check("every caller that was shown a map was shown the SAME season",
    indexes.size <= 1, `season indexes seen: ${[...indexes].join(", ") || "none"}`);

  // ---- 2. one verdict, one crown ---------------------------------------
  console.log("\n[warrace] one verdict, one crown");
  const verdict = sql("SELECT verdict FROM seasons WHERE index = 1");
  let parsed = null;
  try { parsed = JSON.parse(verdict); } catch { /* null or half-written */ }
  check("the season that ended carries a verdict",
    !!parsed && typeof parsed.people === "string", verdict.slice(0, 90) || "null");
  check("...and it names the people that actually led it",
    parsed?.people === "norse", `verdict says ${parsed?.people}`);
  check("...and the Bretwalda's permanent mark was written exactly once",
    sql(`SELECT bretwalda_seasons FROM players WHERE id = ${A.id}`) === "[1]",
    `player ${A.id} carries ${sql(`SELECT bretwalda_seasons FROM players WHERE id = ${A.id}`)}`);

  // ---- 3. THE RESET MECHANIC ACTUALLY HAPPENED --------------------------
  //
  // The numbers come from `war.mjs` itself, so a rebalance moves the gate.
  console.log("\n[warrace] the reset mechanic — WHAT-THIS-GAME-IS §3");
  const expected = openingHoldings("norse");
  const expectedHeld = Object.values(expected.holdings).filter((p) => p === "norse").length;
  const expectedMin = Math.min(...Object.values(expected.thresholds));
  const evenMin = Math.min(...Object.values(openingHoldings(null).thresholds));

  const newIndex = Math.max(...seasonRows.map(([i]) => Number(i)));
  const newSeason = num(`SELECT id FROM seasons WHERE index = ${newIndex}`);
  const held = Object.fromEntries(PEOPLES.map((p) => [p,
    num(`SELECT count(*) FROM territories WHERE season_id = ${newSeason} AND holder = '${p}'`)]));
  const minThreshold = num(`SELECT min(threshold) FROM territories WHERE season_id = ${newSeason}`);

  check("the new season opened on the CHAMPION'S map, not a dead even one",
    held.norse === expectedHeld && held.norse !== 4,
    `held ${JSON.stringify(held)} — expected norse ${expectedHeld}`);
  check("...and his ground carries the target discount, not the standard threshold",
    minThreshold === expectedMin && minThreshold !== evenMin,
    `min threshold ${minThreshold} — expected ${expectedMin}, an even map would be ${evenMin}`);
  // THE WHOLE MAP, ROW BY ROW, against `openingHoldings` itself.
  //
  // The first cut of this line counted territories with `threshold < 240` and
  // called them discounted, and it went red on a correct map: a 320 ground
  // discounts to exactly 240, so one of the champion's five was invisible to
  // the ruler. `docs/PROCESS.md` failure mode 1, in a harness written to catch
  // failure mode 1. The bar was not moved to make it pass — it was replaced
  // with the quantity actually under test, which is stronger: every one of the
  // sixteen rows must equal what `war.mjs` says the champion's map is.
  const rows = sql(`SELECT territory_id, holder, threshold FROM territories
                     WHERE season_id = ${newSeason} ORDER BY territory_id`)
    .split("\n").filter(Boolean).map((l) => l.split("\t"));
  const wrong = rows.filter(([id, holder, threshold]) =>
    holder !== expected.holdings[id] || Number(threshold) !== expected.thresholds[id]);
  check("...and every one of the sixteen rows is the map war.mjs says it should be",
    rows.length === 16 && wrong.length === 0,
    wrong.length
      ? wrong.slice(0, 3).map(([id, h, t]) =>
          `${id}: ${h}/${t} wanted ${expected.holdings[id]}/${expected.thresholds[id]}`).join("; ")
      : `all 16 match, ${expectedHeld} of them the champion's at his discount`);

  // The oath is free again between seasons — the other half of the reset, and
  // it only works if there is exactly one new season to be free in.
  const turn = await post("/api/war/swear", { id: A.id, secret: A.secret, people: "pict" });
  check("and a man may change sides again now the map has reset",
    turn.json?.ok === true && turn.json?.locked === false, JSON.stringify(turn.json)?.slice(0, 80));

  console.log("\n" + "=".repeat(70));
  console.log(`${fail === 0 ? "PASS" : "FAIL"}: the rollover under ${CALLERS} concurrent callers — ${pass}/${pass + fail}`);
  console.log(`      measured against: ${serverNote}`);
  console.log("=".repeat(70));
  server.kill("SIGKILL");
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[warrace]", err);
  if (server) server.kill("SIGKILL");
  process.exit(1);
});
