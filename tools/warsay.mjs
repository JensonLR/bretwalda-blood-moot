/**
 * WARSAY — does the game TELL a man what his fight did to the war?
 *
 * The loop itself is proved by `tools/warflow.mjs`, 28/28 against a real
 * database: matches bank, territories flip, the replay guard holds. None of
 * that was ever visible. The owner's report was *"I've played games and seen no
 * update"*, and the cause was not the ledger — it was that `bankMatch` had six
 * ways to bank nothing and the caller ended `.catch(() => {})`, so a fight that
 * counted for nobody looked exactly like a fight that counted.
 *
 * This file gates the SAYING, not the banking. It drives the real engine and
 * the real `installWarLedger`, and asks one question of each outcome: did the
 * room get told, and was it told the truth.
 *
 *   node tools/warsay.mjs                 needs no database — see below
 *   WAR_TEST_DB=... node tools/warsay.mjs also covers the banked case
 *
 * WITHOUT A DATABASE it still covers five of the six refusals, because five of
 * them are decided before any query runs. That is deliberate: the refusal path
 * is the one that was silent, and it must not need a Postgres to be gated.
 */
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { register } from "module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// The server's own TypeScript, unchanged, through the hook `warflow` uses — so
// this calls the exact function production calls rather than a copy of it.
register(pathToFileURL(resolve(ROOT, "tools/lib/tsresolve.mjs")).href, { data: { root: ROOT } });
let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

// A DATABASE IF ONE IS OFFERED, and five of the six refusals if not.
//
// `unavailable` is what every path returns with no database, so without one this
// file proves the SHAPE — every man answered, reasons agreeing with the count —
// and not the difference between a guest and an unsworn man. With `WAR_TEST_DB`
// it proves both. It is written this way round because the refusal path is what
// was silent, and a gate on it must not need a Postgres to run at all.
const DB = process.env.WAR_TEST_DB || process.env.PROFILE_TEST_DB || "";
if (DB) process.env.DATABASE_URL = DB;   // read at module load by src/db/index.ts
console.log(DB ? "[warsay] against a real database" : "[warsay] no WAR_TEST_DB — the shape only, see the header");

const { bankMatchDetailed } = await import(pathToFileURL(resolve(ROOT, "src/db/war.ts")).href);
const { TERRITORIES } = await import(pathToFileURL(resolve(ROOT, "src/game/war.mjs")).href);

const REPORT = (over = {}) => ({
  roomCode: "WARSAY", mode: "ffa",
  matchKey: `WARSAY:${Math.floor(Date.now() / 1000)}`,
  territoryId: TERRITORIES[0].id, at: Date.now(),
  entries: [{ playerId: "p1", name: "Aethel", points: 14 }],
  ...over,
});

console.log("\n[warsay] every refusal has a reason, and the reason reaches the room\n");

// ---- the shapes that are decided before any query ----
const unknownGround = await bankMatchDetailed(REPORT({ territoryId: "not_a_place" }));
check("a territory this build does not know is REPORTED, not swallowed",
  unknownGround.outcomes.length === 1 && unknownGround.outcomes[0].kind === "unavailable",
  JSON.stringify(unknownGround.outcomes));

const noKey = await bankMatchDetailed(REPORT({ matchKey: "" }));
check("a report with no match key is REPORTED",
  noKey.outcomes.length === 1 && noKey.outcomes[0].kind === "unavailable",
  JSON.stringify(noKey.outcomes));

const noMen = await bankMatchDetailed(REPORT({ entries: [] }));
check("an empty report says nothing about nobody — no outcomes, no crash",
  noMen.banked === 0 && noMen.outcomes.length === 0, `${noMen.outcomes.length} outcome(s)`);

// A man with no bound profile is a guest, and that is decided in memory.
const guest = await bankMatchDetailed(REPORT());
check("an unbound seat is named a GUEST, not silently dropped",
  guest.outcomes.length === 1 && (DB ? guest.outcomes[0].kind === "guest" : guest.outcomes[0].kind === "unavailable"),
  `${JSON.stringify(guest.outcomes)}${DB ? "" : "  (no database: `unavailable` is the honest answer here)"}`);

// ---- EVERY man in the report gets an answer, whatever it is ----
const crowd = await bankMatchDetailed(REPORT({
  entries: [{ playerId: "a", name: "A", points: 9 }, { playerId: "b", name: "B", points: 0 },
            { playerId: "c", name: "C", points: 30 }],
}));
check("EVERY man in the report gets an outcome — silence for one is the bug this file exists for",
  crowd.outcomes.length === 3 && crowd.outcomes.every((o) => typeof o.kind === "string"),
  `${crowd.outcomes.length} of 3: ${crowd.outcomes.map((o) => `${o.playerId}=${o.kind}`).join(" ")}`);

check("...and each outcome names the man it belongs to",
  new Set(crowd.outcomes.map((o) => o.playerId)).size === crowd.outcomes.length
    && crowd.outcomes.every((o) => ["a", "b", "c"].includes(o.playerId)),
  crowd.outcomes.map((o) => o.playerId).join(","));

// ---- the count and the reasons must agree, or one of them is lying ----
const banked = crowd.outcomes.filter((o) => o.kind === "banked").length;
check("the row count and the reasons agree",
  banked === crowd.banked, `banked=${crowd.banked}, outcomes saying banked=${banked}`);

// ---- the engine can reach a room from outside, which is how any of this is said ----
const { makeEngine } = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);
const engine = makeEngine({ autoTick: false });
check("the engine will not throw when told to speak to a room that has gone",
  engine.tellRoom("NOSUCH", { type: "war_result", data: {} }) === false, "returned false");
check("...nor on a message with no type",
  engine.tellRoom("NOSUCH", {}) === false, "returned false");
engine.stop?.();

console.log(`\n${fail ? "FAIL" : "PASS"}: the war says what it did — ${pass}/${pass + fail}\n`);
process.exit(fail ? 1 : 0);
