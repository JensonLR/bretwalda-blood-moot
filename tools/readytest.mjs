#!/usr/bin/env node
/**
 * READYTEST — the muster. Nobody swings until everybody is standing there.
 *
 *   node tools/readytest.mjs
 *
 * THE OWNER'S WORDS, and this file is named after the report (`docs/PROCESS.md`
 * R6):
 *
 *   "a lot of the time the game starts before fully loading in which is a poor
 *    experience, we shouldn't start until everyone is fully loaded in."
 *
 * TWO REQUIREMENTS THAT PULL AGAINST EACH OTHER, and a gate that only holds one
 * of them is worse than none, because whichever it holds is the one somebody
 * will over-fit to:
 *
 *   A ROOM MUST NOT START WHILE A CLIENT IS STILL LOADING. That is the owner's
 *   sentence and it is the whole feature.
 *
 *   A CLIENT THAT NEVER REPORTS MUST NOT STALL THE ROOM FOREVER. One bad
 *   connection cannot hold seven people. So the hold has a deadline, the
 *   deadline is honest, and what happens when it expires is a stated decision
 *   rather than a default: THE MATCH STARTS. See LOAD_HOLD_MS in `engine.mjs`.
 *
 * AND A THIRD, WHICH IS THE ONE A GATE USUALLY MISSES. The hold must not become
 * a lever. A man who withholds his report must gain nothing by it — no
 * invincibility, no delay past the shared deadline, no advantage of any kind —
 * or "wait for everyone" is a cheat with a friendly name. §5 fights that out
 * with a silent client and compares what he gets to what the honest men get.
 *
 * Everything is in-process against `makeEngine({autoTick: false})`, stepped by
 * hand, so the twelve-second deadline costs twelve seconds of SIM time and
 * about a hundredth of a second of yours.
 */
import { makeEngine } from "../src/game/engine.mjs";

const RATE = 20;
const results = [];
let section = "";
const head = (t) => { section = t; console.log(`\n${t}`); console.log("-".repeat(t.length)); };
const check = (name, pass, detail) => {
  results.push({ section, name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** A client, and everything it was told. */
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

/**
 * A room of `awaiting` clients that declared they build an arena, plus `plain`
 * that did not — a harness, an old client, a headless second server.
 */
const room = (eng, { awaiting = 2, plain = 0, bots = 0, bestOf = 1 } = {}) => {
  const clients = [];
  const host = open(eng);
  host.send("create", { name: "Host", mode: "blood_moot", bestOf, awaitLoad: awaiting > 0 });
  const code = host.last("join").code;
  clients.push(host);
  for (let i = 1; i < awaiting; i++) {
    const g = open(eng);
    g.send("join", { code, name: `Waiter${i}`, awaitLoad: true });
    clients.push(g);
  }
  for (let i = 0; i < plain; i++) {
    const g = open(eng);
    g.send("join", { code, name: `Plain${i}` });
    clients.push(g);
  }
  for (let i = 0; i < bots; i++) host.send("add_bot", {});
  host.send("start");
  return { host, clients, code, room: eng._rooms.get(code) };
};

/** Steps `seconds` of sim time and answers the room's state at the end. */
const run = (eng, r, seconds) => {
  for (let i = 0; i < Math.round(seconds * RATE); i++) eng.step();
  return r.room.state;
};

// ============================================================
// 1. THE HOLD EXISTS AT ALL
// ============================================================
head("1. The room does not start while a client is still loading");
{
  const eng = makeEngine({ autoTick: false });
  const r = room(eng, { awaiting: 2 });

  check("pressing start puts the room in the muster, not in the countdown",
    r.room.state === "loading", `state ${r.room.state}`);
  check("...and the room is TOLD who it is waiting for, by name",
    (r.host.last("match_loading")?.waitingFor || []).length === 2,
    JSON.stringify(r.host.last("match_loading")?.waitingFor));

  // Five whole seconds. Long past the countdown, well short of the deadline.
  check("five seconds later the bell has still not rung",
    run(eng, r, 5) === "loading" && r.host.got("countdown").length === 0,
    `state ${r.room.state}, ${r.host.got("countdown").length} countdown packets`);
  check("...and nobody is fighting",
    [...r.room.players.values()].every((p) => p.state === "idle"));

  // One man in. Still one outstanding, so still held.
  r.clients[0].send("loaded");
  check("one man reporting does not release the room",
    r.room.state === "loading" && r.host.got("countdown").length === 0);
  check("...and the room is told the list got shorter",
    (r.host.last("match_loading")?.waitingFor || []).length === 1,
    JSON.stringify(r.host.last("match_loading")?.waitingFor));

  // The last man in. The bell must ring on that message and not on a timer.
  r.clients[1].send("loaded");
  check("the LAST man reporting releases it immediately, on his message and not on a timer",
    r.room.state === "countdown" && r.host.got("countdown").length === 1,
    `state ${r.room.state}`);
  check("...and the fight begins three seconds after that, as it always did",
    run(eng, r, 3.2) === "fighting", `state ${r.room.state}`);
}

// ============================================================
// 2. THE HONEST TIMEOUT
// ============================================================
head("2. A client that never reports does not stall the room forever");
{
  const eng = makeEngine({ autoTick: false });
  const r = room(eng, { awaiting: 2 });
  r.clients[0].send("loaded");   // one honest man; the other never answers

  check("at eleven seconds the room is still waiting for him",
    run(eng, r, 11) === "loading", `state ${r.room.state}`);
  // THE DEADLINE IS 12 s. Asserting on BOTH sides of it is the point: a hold
  // that never releases and a hold that releases instantly both pass a
  // one-sided check, and they are opposite defects.
  check("at thirteen it has given up on him and rung the bell",
    run(eng, r, 2) === "countdown", `state ${r.room.state}`);
  check("...and the fight starts WITHOUT him — the stated decision, not a hang",
    run(eng, r, 3.2) === "fighting", `state ${r.room.state}`);
  check("...and he is still seated and still in the round, not dropped",
    r.room.players.size === 2 && [...r.room.players.values()].every((p) => p.state !== "dead"),
    `${r.room.players.size} men on the field`);
}

// ============================================================
// 3. NOBODY IS WAITED FOR WHO DID NOT ASK TO BE
// ============================================================
head("3. Only clients that declared a load are waited for");
{
  const eng = makeEngine({ autoTick: false });
  // Two clients, neither of which said anything about loading: a harness, a
  // headless host, a client older than this feature. The room must behave
  // EXACTLY as it did before the muster existed, or every suite in this
  // repository pays twelve seconds a match.
  const r = room(eng, { awaiting: 0, plain: 2 });
  check("a room of clients that never declared goes straight to the countdown",
    r.room.state === "countdown", `state ${r.room.state}`);
  check("...and reaches the fight on the old three-second bell",
    run(eng, r, 3.2) === "fighting", `state ${r.room.state}`);
}
{
  const eng = makeEngine({ autoTick: false });
  const r = room(eng, { awaiting: 1, plain: 1, bots: 2 });
  check("bots are never waited for, and neither is an undeclared man",
    (r.host.last("match_loading")?.waitingFor || []).length === 1,
    JSON.stringify(r.host.last("match_loading")?.waitingFor));
  r.host.send("loaded");
  check("...so the one declared client releases the whole room",
    r.room.state === "countdown", `state ${r.room.state}`);
}

// ============================================================
// 4. A MAN WHO LEFT IS NOT WAITED FOR
// ============================================================
head("4. A socket that shut is not a man to wait for");
{
  const eng = makeEngine({ autoTick: false });
  const r = room(eng, { awaiting: 2 });
  r.clients[0].send("loaded");
  run(eng, r, 1);
  check("still held while the second man is silent", r.room.state === "loading");
  // He does not report; his connection dies. The room must not spend the
  // remaining eleven seconds on a socket that is already shut — that IS the
  // "one bad connection hangs seven people" case, arriving by the back door.
  eng.disconnectSession(r.clients[1].sid);
  check("his disconnect releases the room at once, without burning the deadline",
    r.room.state === "countdown", `state ${r.room.state}`);
}

// ============================================================
// 5. THE HOLD IS NOT A LEVER
// ============================================================
head("5. Withholding the report buys a cheat nothing");
{
  const eng = makeEngine({ autoTick: false });
  const r = room(eng, { awaiting: 2 });
  r.clients[0].send("loaded");           // honest
  run(eng, r, 13);                       // the silent man rides the deadline out
  run(eng, r, 3.2);                      // ...into the fight
  const men = [...r.room.players.values()];
  check("the fight is running", r.room.state === "fighting", `state ${r.room.state}`);
  // THE SPAWN GRACE IS THE THING WORTH STEALING, so it is the thing measured.
  // If a silent client were given so much as an extra tick of it, "wait for
  // everyone" would be an invincibility button with a friendly name.
  const grace = men.map((p) => p.invincibleTimer);
  check("the silent man's spawn grace is the SAME as the honest man's, to the tick",
    grace.every((g) => g === grace[0]) && grace[0] > 0, `graces ${grace.join(" / ")}`);
  check("...and he is not invincible for any longer than anybody else",
    men.every((p) => p.invincible === men[0].invincible));
  check("...and he holds no more health for having been late",
    men.every((p) => p.health === p.maxHealth));
}

// ============================================================
// 6. ONCE PER MATCH, NOT ONCE PER ROUND
// ============================================================
head("6. The muster is a match's, not a round's");
{
  const eng = makeEngine({ autoTick: false });
  const r = room(eng, { awaiting: 2, bestOf: 3 });
  check("the first round musters", r.room.state === "loading" && r.host.got("match_loading").length >= 1,
    `state ${r.room.state}, ${r.host.got("match_loading").length} announcement(s)`);
  r.clients[0].send("loaded"); r.clients[1].send("loaded");
  run(eng, r, 3.2);
  check("...and reaches the fight", r.room.state === "fighting", `state ${r.room.state}`);

  // End round one by hand — the second man walks into the hearth — and let the
  // break run out into round two.
  const men = [...r.room.players.values()];
  men[1].position = { x: 0, y: 0, z: 0 };
  men[1].invincible = false; men[1].invincibleTimer = 0; men[1].health = 1;
  for (let i = 0; i < 12 * RATE && r.room.state === "fighting"; i++) eng.step();
  check("round one ends", r.room.state === "intermission" || r.room.state === "finished",
    `state ${r.room.state}`);
  if (r.room.state === "intermission") {
    // WATCHED TICK BY TICK rather than sampled at the end. A muster that
    // opened and closed inside the six seconds would be invisible to a single
    // look afterwards, and "it was over by the time I checked" is not the same
    // claim as "it never happened".
    let sawLoading = 0;
    for (let i = 0; i < 6 * RATE; i++) { eng.step(); if (r.room.state === "loading") sawLoading++; }
    check("ROUND TWO DOES NOT MUSTER AGAIN — nothing is rebuilt between rounds, and a hold " +
          "a player could impose three times a match is a stall, not a courtesy",
      sawLoading === 0 && r.room.state !== "loading",
      `${sawLoading} tick(s) in the muster during round two, ending ${r.room.state}`);
  }
}

// ============================================================
const failed = results.filter((r) => !r.pass);
console.log("\n" + "=".repeat(70));
console.log(`${failed.length === 0 ? "PASS" : "FAIL"}: the muster — ${results.length - failed.length}/${results.length}`);
console.log(`      the timeout is a DECISION: at 12 s the match starts without the men who never answered.`);
console.log("=".repeat(70));
if (failed.length) {
  console.log("\nfailed:");
  for (const f of failed) console.log(`  ${f.section} :: ${f.name}`);
}
process.exit(failed.length ? 1 : 0);
