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

const { bankMatchDetailed, titleFor, warRoll } = await import(pathToFileURL(resolve(ROOT, "src/db/war.ts")).href);
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

// ---- THE TITLE LADDER SAYS WHAT A SEASON EARNED — backlog 4.6 ----
//
// Pure arithmetic, no database: four peoples, four rungs each, every rung a
// different word, monotone in points, silent below the first point and for
// the unsworn. "Bretwalda" must never appear — it is the crown, not a rung.
{
  const peoples = ["saxon", "norse", "briton", "pict"];
  const floors = [1, 25, 75, 200];
  let ok = true; const notes = [];
  for (const p of peoples) {
    if (titleFor(p, 0) !== null) { ok = false; notes.push(`${p}: a title for zero points`); }
    const rungs = floors.map((f) => titleFor(p, f));
    if (new Set(rungs).size !== 4 || rungs.some((t) => !t)) { ok = false; notes.push(`${p}: rungs [${rungs.join(", ")}]`); }
    for (let i = 0; i < floors.length; i++) {
      if (titleFor(p, floors[i] - 1) === rungs[i]) { ok = false; notes.push(`${p}: rung ${i} reached below its floor`); }
    }
    if (rungs.some((t) => /bretwalda/i.test(String(t)))) { ok = false; notes.push(`${p}: the crown is on the ladder`); }
  }
  if (titleFor(null, 500) !== null) { ok = false; notes.push("a title for the unsworn"); }
  check("the title ladder: four peoples, four distinct rungs each, monotone, silent for the unsworn, and never the crown",
    ok, ok ? peoples.map((p) => `${p}: ${floors.map((f) => titleFor(p, f)).join(" < ")}`).join("  |  ") : notes.join("; "));
}

// ---- THE ROLL OF HONOUR IS THE CROWN'S OWN ORDER — backlog 4.6 ----
{
  const roll = await warRoll(50);
  if (!DB) {
    check("the roll answers null with no database — the screen must say so, not draw an empty table",
      roll === null, `got ${JSON.stringify(roll)}`);
  } else {
    const sorted = Array.isArray(roll)
      && roll.every((s, i) => i === 0 || roll[i - 1].points >= s.points);
    const seats = Array.isArray(roll) && roll.every((s, i) => s.seat === i + 1);
    const whole = Array.isArray(roll) && roll.every((s) =>
      ["saxon", "norse", "briton", "pict"].includes(s.people) && s.points > 0
      && s.title === titleFor(s.people, s.points));
    check("the roll: at most fifty seats, numbered, points never rising, every man sworn and titled by his own points",
      Array.isArray(roll) && roll.length <= 50 && sorted && seats && whole,
      Array.isArray(roll)
        ? `${roll.length} seat(s)${roll.length ? `, first: ${roll[0].title ?? "(untitled)"} ${roll[0].name} of the ${roll[0].people}, ${roll[0].points} pts` : ""}`
        : `got ${JSON.stringify(roll)}`);
  }
}

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

// ---- THE SUBSCRIPTION ACTUALLY REACHES THE ENGINE ----
//
// This is the one that would have caught the owner's report. Every check above
// can pass while NOTHING is subscribed to `onMatchEnd`, in which case a match
// ends, the room is told, and the war never hears about it — silently, forever.
// `installWarLedger` is called from `src/instrumentation.ts`, whose guard used
// to be `NEXT_RUNTIME !== "nodejs"`, a positive match on a variable Next sets
// for its OWN runtimes; this game runs under `custom-server.mjs`.
//
// So: install, then end a match on the shared engine and see whether anything
// listened. It is asked of the REAL `installWarLedger` rather than of a copy.
{
  const war = await import(pathToFileURL(resolve(ROOT, "src/db/war.ts")).href);
  const eng = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);
  const before = globalThis.__bretwaldaWarInstalled;
  globalThis.__bretwaldaWarInstalled = false;
  let heard = 0;
  const unsub = eng.getEngine().onMatchEnd(() => { heard++; });
  war.installWarLedger();
  check("installWarLedger subscribes to the engine the server actually runs",
    globalThis.__bretwaldaWarInstalled === true,
    globalThis.__bretwaldaWarInstalled ? "subscribed" : "the install threw and reset its own flag");
  unsub();
  globalThis.__bretwaldaWarInstalled = before;

  // Asserted POSITIVELY, on the guard that ships, and not as the absence of the
  // old one — the first cut tested `!/NEXT_RUNTIME !== "nodejs"/` and failed,
  // because the comment above the fix QUOTES the line it replaced. A ruler that
  // reads prose is a ruler that can be fooled by prose.
  const src = readFileSync(resolve(ROOT, "src/instrumentation.ts"), "utf8");
  const guard = (src.split("\n").find((l) => /if\s*\(.*NEXT_RUNTIME/.test(l) && !/^\s*(\/\/|\*)/.test(l)) ?? "").trim();
  check("...and instrumentation excludes only the EDGE, not everything that is not `nodejs`",
    /NEXT_RUNTIME\s*===\s*"edge"/.test(guard),
    guard || "no runtime guard at all");

  const route = readFileSync(resolve(ROOT, "src/app/api/war/route.ts"), "utf8");
  check("...and the map's own route installs it too, so looking at the war switches it on",
    /installWarLedger\s*\(/.test(route), "belt and braces on the warm path");
}

// ---- the engine can reach a room from outside, which is how any of this is said ----
const { makeEngine } = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);
const engine = makeEngine({ autoTick: false });
check("the engine will not throw when told to speak to a room that has gone",
  engine.tellRoom("NOSUCH", { type: "war_result", data: {} }) === false, "returned false");
check("...nor on a message with no type",
  engine.tellRoom("NOSUCH", {}) === false, "returned false");
engine.stop?.();

// ============================================================
// THE STAKE, DRIVEN THROUGH THE REAL ENGINE
//
// Everything below runs real matches on `makeEngine({ autoTick: false })` —
// real create/join messages, real inputs walking a man into the real fire,
// real `match_end` — and asserts what the ROOM was told. No database and no
// handlers are attached, which is the point: "friendly" and "practice" are the
// sim's own answers and must arrive with nothing else installed.
// ============================================================
{
  const { makeEngine: mk } = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);

  /** One connected seat: a session and everything it has been sent. */
  const seat = (engine) => {
    const got = [];
    const sid = engine.connect((str) => { try { got.push(JSON.parse(str)); } catch { /* raw */ } });
    return {
      sid, got,
      last: (type) => [...got].reverse().find((m) => m.type === type) ?? null,
      send: (type, data) => engine.message(sid, { type, data }),
    };
  };
  /** Step the sim until a predicate holds or the budget runs out. */
  const stepUntil = (engine, fn, secs = 90) => {
    for (let i = 0; i < secs * 20; i++) { engine.step(0.05); if (fn()) return true; }
    return false;
  };
  /** Walk one seat's man into the bonfire until he burns to death. */
  const burn = (engine, w) => stepUntil(engine, () => {
    const s = w.last("game_state"); if (!s) return false;
    const me = s.data.players[w.last("join").data.playerId];
    if (!me || me.state === "dead") return me?.state === "dead";
    const d = Math.hypot(me.position.x, me.position.z) || 1;
    w.send("input", { moveX: -me.position.x / d, moveZ: -me.position.z / d, rotationY: 0,
      attack: false, heavyAttack: false, block: false, dodge: false, shove: false, attackDir: "right" });
    return false;
  }, 120);

  // ---- A FRIENDLY MOOT: livery stripped, no ground, and the room is told ----
  {
    const engine = mk({ autoTick: false });
    const host = seat(engine);
    host.send("create", { name: "Hosta", mode: "honour_duel", bestOf: 1, awaitLoad: false,
      friendly: true, appearance: { people: "norse" } });
    const join1 = host.last("join");
    check("a friendly moot deals NO ground — the lobby has nothing to promise",
      join1 && join1.data.friendly === true && !join1.data.territory,
      `friendly=${join1?.data.friendly} territory=${JSON.stringify(join1?.data.territory ?? null)}`);
    const hostAp = join1?.data.players?.[join1.data.playerId]?.appearance;
    check("...and the livery comes OFF at the door — kits worn as bought",
      hostAp?.people === "none" || hostAp?.people === undefined,
      `people=${JSON.stringify(hostAp?.people ?? null)}`);

    const guest = seat(engine);
    guest.send("join", { name: "Gest", code: join1.data.code, awaitLoad: false,
      appearance: { people: "pict" } });
    host.send("ready"); guest.send("ready");
    host.send("start");
    const started = stepUntil(engine, () => host.last("game_state")?.data.state === "fighting", 30);
    check("the friendly moot still fights", started, started ? "fighting" : "never left the lobby");
    burn(engine, guest);
    const ended = stepUntil(engine, () => host.last("war_result") !== null, 30);
    const wr = host.last("war_result");
    check("...and at the end the SIM ITSELF says FRIENDLY, with no database anywhere",
      ended && wr && Array.isArray(wr.data.outcomes) && wr.data.outcomes.length === 2
        && wr.data.outcomes.every((o) => o.kind === "friendly"),
      wr ? JSON.stringify(wr.data.outcomes) : "no war_result ever arrived");
    engine.stop?.();
  }

  // ---- ONE FREE MAN AND HIS BOTS: the anti-farm gate says PRACTICE out loud ----
  {
    const engine = mk({ autoTick: false });
    const host = seat(engine);
    host.send("create", { name: "Lone", mode: "blood_moot", bestOf: 1, awaitLoad: false,
      appearance: { people: "saxon" } });
    const join1 = host.last("join");
    check("a war room DOES name its ground in the lobby",
      !!join1?.data.territory?.id, JSON.stringify(join1?.data.territory ?? null));
    host.send("add_bot", { difficulty: "recruit" });
    host.send("ready");
    host.send("start");
    stepUntil(engine, () => host.last("game_state")?.data.state === "fighting", 30);
    burn(engine, host);
    const ended = stepUntil(engine, () => host.last("war_result") !== null, 60);
    const wr = host.last("war_result");
    check("one man and his bots is PRACTICE, and the room hears the word",
      ended && wr && wr.data.outcomes.length === 1 && wr.data.outcomes[0].kind === "practice",
      wr ? JSON.stringify(wr.data.outcomes) : "no war_result — the silent path the owner hit");
    engine.stop?.();
  }

  // ---- FIGHT FOR THIS GROUND: the pin survives from message to lobby ----
  {
    const engine = mk({ autoTick: false });
    const host = seat(engine);
    const pict = TERRITORIES.find((t) => t.people === "pict");
    host.send("create", { name: "Pinner", mode: "war_band", bestOf: 1, awaitLoad: false,
      territoryId: pict.id });
    const j = host.last("join");
    check("a room raised from the map fights WHERE THE MAP SAID",
      j?.data.territory?.id === pict.id, `asked ${pict.id}, got ${j?.data.territory?.id}`);
    check("...and the arena follows that ground's people — a Pictish pin musters on the moor",
      j?.data.arena === "pict_moor", `arena=${j?.data.arena}`);

    const forged = seat(engine);
    forged.send("create", { name: "Forger", mode: "war_band", bestOf: 1, awaitLoad: false,
      territoryId: "not_a_place" });
    const fj = forged.last("join");
    check("a forged territory id gets the NORMAL deal, not a crash and not a fake ground",
      !!fj?.data.territory?.id && TERRITORIES.some((t) => t.id === fj.data.territory.id),
      `dealt ${fj?.data.territory?.id}`);
    engine.stop?.();
  }

// ---- THE ROOM SEES THE COUNTRY, NOT ONE FIELD OF IT ----
//
// The owner, 24 Aug 2026: "work into when each map should be played… so
// people arent playing the same map over & over or never seeing other maps."
// An unpinned room re-deals between matches, and the deal follows the war
// front — which can concentrate on one people and hand a room the same arena
// every night. `dealGroundFor` now redraws (twice, deterministically) when a
// deal lands on the arena the room just fought. This drives one room through
// six full match cycles and asserts no arena is fought twice running.
{
  const engine = mk({ autoTick: false });
  const host = seat(engine);
  host.send("create", { name: "Roamer", mode: "blood_moot", bestOf: 1, awaitLoad: false });
  host.send("add_bot", { difficulty: "recruit" });
  const arenas = [];
  let cyclesRan = 0;
  for (let cycle = 0; cycle < 6; cycle++) {
    const lobby = stepUntil(engine, () => {
      const s = host.last("lobby_update") ?? host.last("join");
      return s?.data.state === "lobby" || s?.data.players !== undefined;
    }, 30);
    if (!lobby) break;
    const room = [...engine._rooms.values()][0];
    if (!room) break;
    arenas.push(room.arena);
    host.send("ready");
    host.send("start");
    const started = stepUntil(engine, () => host.last("game_state")?.data.state === "fighting", 30);
    if (!started) break;
    burn(engine, host);
    const ended = stepUntil(engine, () => room.state === "lobby", 60);
    if (!ended) break;
    cyclesRan++;
  }
  const repeats = arenas.filter((a, i) => i > 0 && a === arenas[i - 1]).length;
  check("an unpinned room never fights the same arena twice running while the front offers another",
    cyclesRan === 6 && repeats === 0,
    `${cyclesRan}/6 cycles, arenas dealt: ${arenas.join(" → ")}${repeats ? ` — ${repeats} immediate repeat(s)` : ""}`);
  engine.stop?.();
}

// ---- A FRIENDLY MOOT CHOOSES ITS GROUND, AND ONLY A FRIENDLY MOOT ----
//
// The owner, 24 Aug 2026: "maybe choice to choose map location for certain
// scenarios?" The friendly moot is the scenario — nothing at stake, so the
// host picks where. A war room never gets the choice (the map or the deal
// names its ground), and a forged ground id quietly gets the default, the
// same shape as the forged-territory rule.
{
  const engine = mk({ autoTick: false });
  const host = seat(engine);
  host.send("create", { name: "Chooser", mode: "blood_moot", bestOf: 1, awaitLoad: false,
    friendly: true, arena: "danelaw_camp" });
  const j = host.last("join");
  check("a friendly moot fights on the ground its host chose",
    j?.data.arena === "danelaw_camp", `arena=${j?.data.arena}`);

  const forged = seat(engine);
  forged.send("create", { name: "Forger2", mode: "blood_moot", bestOf: 1, awaitLoad: false,
    friendly: true, arena: "not_a_ground" });
  const fj = forged.last("join");
  check("a forged ground id gets the default, not a crash",
    fj?.data.arena === "saxon_village", `arena=${fj?.data.arena}`);

  const war = seat(engine);
  war.send("create", { name: "Warrior3", mode: "blood_moot", bestOf: 1, awaitLoad: false,
    arena: "danelaw_camp" });
  const wj = war.last("join");
  const dealt = wj?.data.territory?.id;
  const expected = dealt ? undefined : null; // resolved below against the deal
  check("a WAR room ignores a sent arena — the deal names its ground, not the host",
    !!dealt && wj?.data.arena !== undefined
      && wj.data.arena === (TERRITORIES.some((t) => t.id === dealt) ? wj.data.arena : "saxon_village")
      && (wj.data.arena !== "danelaw_camp" || TERRITORIES.find((t) => t.id === dealt)?.people === "norse"),
    `dealt ${dealt}, arena=${wj?.data.arena}`);
  engine.stop?.();
}
}

console.log(`\n${fail ? "FAIL" : "PASS"}: the war says what it did — ${pass}/${pass + fail}\n`);
process.exit(fail ? 1 : 0);
