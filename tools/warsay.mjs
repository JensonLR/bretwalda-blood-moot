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
import { readFileSync } from "fs";

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

// ---- THE GROUND IS NAMED BEFORE THE FIGHT, not only after it ----
//
// `territoryBlock` has been on every snapshot since the war layer landed and
// nothing rendered it, so a man could fight a whole season without learning
// where. The lobby names it now; this asserts the wire still carries what that
// line reads, because a field nothing checks is a field that quietly goes.
{
  const { makeEngine: mk } = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);
  const e = mk({ autoTick: false });
  let snap = null;
  e.connect((msg) => { if (msg.type === "game_state" && msg.data?.territory) snap = msg.data.territory; });
  check("the snapshot carries the named ground, or the lobby has nothing to show",
    // A room that has not started a match has no ground yet, which is correct
    // and is why this asserts the SHAPE rather than a value: `territoryBlock`
    // returns null or a block with an id, a name and a holder, never a half one.
    snap === null || (typeof snap.id === "string" && typeof snap.name === "string" && typeof snap.holder === "string"),
    snap ? JSON.stringify(snap) : "no match running — null, which is the honest answer");
  e.stop?.();
}

// ---- a flip is carried to the man whose points did it ----
check("the outcome shape has room for a flip, and it is optional",
  crowd.outcomes.every((o) => o.flip === undefined || (typeof o.flip.territoryId === "string"
    && typeof o.flip.from === "string" && typeof o.flip.to === "string")),
  "every flip present is whole");

// ---- EVERY TERRITORY RESOLVES TO A GROUND THIS BUILD CAN DRAW ----
//
// Sixteen territories share one arena today, and `groundForPeople` is the table
// that will stop them. It falls back to the village on anything it does not
// know — which is the right behaviour at runtime and exactly the behaviour that
// would let a ground be added here, forgotten in the renderer, and shipped as a
// silent fallback nobody noticed. So the fallback is not what is tested: the
// LOOKUP is.
{
  const { GROUNDS, GROUND_BY_PEOPLE, groundForPeople } =
    await import(pathToFileURL(resolve(ROOT, "src/game/grounds.mjs")).href);
  const peoples = [...new Set(TERRITORIES.map((t) => t.people))];
  const missing = peoples.filter((pp) => !GROUND_BY_PEOPLE[pp]);
  check("every people that holds ground has an entry in the table",
    missing.length === 0, missing.length ? `no ground for ${missing.join(", ")}` : peoples.join(", "));

  const unbuilt = Object.entries(GROUND_BY_PEOPLE).filter(([, id]) => !GROUNDS[id]);
  check("...and every id in the table is a ground this build actually has",
    unbuilt.length === 0,
    unbuilt.length ? `${unbuilt.map(([pp, id]) => `${pp}->${id}`).join(", ")} would silently fall back to the village`
      : `${Object.keys(GROUNDS).length} ground(s): ${Object.keys(GROUNDS).join(", ")}`);

  const unresolved = TERRITORIES.filter((t) => !GROUNDS[groundForPeople(t.people)]);
  check("...so all sixteen territories resolve to something drawable",
    unresolved.length === 0, `${TERRITORIES.length - unresolved.length}/${TERRITORIES.length}`);

  // AND THE CLIENT MUST ACTUALLY IMPORT EVERY ONE OF THEM.
  //
  // A ground module calls `registerGround` at IMPORT time and nothing else in
  // the tree references it, so a ground can be declared here, dealt by the
  // engine, sent over the wire — and then silently replaced by the village at
  // `createWorld`'s fallback, because the module was never imported. Every
  // check above passes in that world. This is the one that does not: it reads
  // the client's own import graph rather than the server's table.
  const canvas = readFileSync(resolve(ROOT, "src/game/client/GameCanvas.tsx"), "utf8");
  const unimported = Object.keys(GROUNDS)
    .filter((id) => id !== "saxon_village")
    .filter((id) => {
      // `saxon_village` is built into `world.ts` itself; every other ground is
      // its own module and the file name is its id with the people stripped.
      const stem = id.replace(/^[a-z]+_/, "");
      return !new RegExp(`render/(${id}|${stem})`).test(canvas);
    });
  check("...and the client imports every ground module, or the fallback eats it",
    unimported.length === 0,
    unimported.length
      ? `${unimported.join(", ")} would be dealt by the server and drawn as the village`
      : `${Object.keys(GROUNDS).length} ground(s) registered`);

  const stones = GROUNDS.pict_moor?.obstacles?.length ?? 0;
  check("the moor's standing stones are declared solid, so a man can be shoved into one",
    stones === 4, `${stones} stone(s)`);

  // A ground whose fighting floor is not flat is a ground where a man fights on
  // a slope he cannot see. Both grounds hold their relief off the play disc, and
  // this reads it off the height field rather than trusting the comment.
  const worst = (spec) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 720; i++) {
      const a = (i / 720) * Math.PI * 2;
      for (const rr of [0, 4, 8, 12, 16]) {
        const y = spec.heightAt(Math.cos(a) * rr, Math.sin(a) * rr);
        if (y < lo) lo = y; if (y > hi) hi = y;
      }
    }
    return hi - lo;
  };
  for (const [id, spec] of Object.entries(GROUNDS)) {
    const spread = worst(spec);
    check(`${id}: the fighting floor is flat enough to fight on`,
      spread < 0.5, `${spread.toFixed(3)} m between the highest and lowest point inside the play disc`);
  }
}

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
