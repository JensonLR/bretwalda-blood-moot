#!/usr/bin/env node
// BENCHTEST — the mead-bench's law, held headless (backlog 7.9b).
//
//   node tools/benchtest.mjs
//
// A man who joins a RUNNING fight is seated, not refused: outside `players`,
// invisible to every loop in the simulation, dealt onto the floor when the
// room becomes a lobby again. The wartest idiom exactly — `makeEngine({
// autoTick: false })`, seats over the real wire, the sim advanced by `step()`.
//
// The sharpest claim here is the fixture's own geometry: the watcher's player
// object holds position (0,0,0), which on saxon_village is INSIDE the arena's
// bonfire. If any damage loop could reach a seated man, the fire would be the
// first to do it — so "he sat in the fire and never burned" is the design
// proven, not a politeness.
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { makeEngine } = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);

let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};
const RATE = 20;
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
  c.count = (t) => (c.byType.get(t) || []).length;
  return c;
};
const intoTheFire = (p, health) => {
  p.position = { x: 0, y: 0, z: 0 };
  p.invincible = false; p.invincibleTimer = 0;
  if (health !== undefined) p.health = Math.min(p.health, health);
};
const stepSeconds = (eng, s) => { for (let i = 0; i < Math.ceil(s * RATE); i++) eng.step(); };
const humans = (room) => { const out = []; room.players.forEach((p) => { if (!p.bot) out.push(p); }); return out; };
const bots = (room) => { const out = []; room.players.forEach((p) => { if (p.bot) out.push(p); }); return out; };

/** Host + one jarl bot, fighting. Returns { host, code, room }. */
const fightUp = (eng, opts = {}) => {
  const host = open(eng);
  host.send("create", { name: "Hlaford", mode: "blood_moot", bestOf: 1, awaitLoad: false, ...opts });
  const code = host.last("join").code;
  const room = eng._rooms.get(code);
  host.send("add_bot", { difficulty: "jarl" });
  host.send("start", {});
  stepSeconds(eng, 5); // countdown and the opening breath
  return { host, code, room };
};

console.log("[bench] the mead-bench, headless\n");

// ---- §1 the seat itself ----
{
  const eng = makeEngine({ autoTick: false });
  const { host, code, room } = fightUp(eng);
  check("the fixture has a fight to watch", room.state === "fighting", `state=${room.state}`);

  const w = open(eng);
  w.send("join", { code, name: "Gafolgelda", awaitLoad: false });
  const j = w.last("join");
  check("a late man is seated, not turned away", !!j && !w.last("error"),
    j ? "join snapshot received" : `refused: "${w.last("error")?.message}"`);
  const wid = j?.playerId;
  check("his id is on the bench and NOT on the floor",
    !!wid && !room.players.has(wid) && room.seats.has(wid),
    `players.has=${room.players.has(wid)}, seats.has=${room.seats.has(wid)}`);
  check("his join snapshot carries the whole fight",
    !!j && j.state === "fighting" && Object.keys(j.players).length === 2 &&
    (j.seats || []).some((sp) => sp.id === wid && sp.name === "Gafolgelda"));

  // The bench rides every snapshot: the HOST learns who waits.
  stepSeconds(eng, 0.5);
  check("the fighters' snapshots name the bench",
    (host.snapshot?.seats || []).some((sp) => sp.id === wid));

  // He is sitting IN THE BONFIRE (0,0,0) at full health. Burn him if you can.
  const seatP = room.seats.get(wid);
  const hpBefore = seatP.health;
  stepSeconds(eng, 4);
  check("he sat in the fire and never burned — no loop in the sim can reach a seated man",
    seatP.health === hpBefore && seatP.state !== "dead",
    `health ${hpBefore} -> ${seatP.health} after 4s at the fire's own coordinates`);

  // The wire drops him: an attack and a ready from the bench move nothing.
  const floorBefore = room.players.size;
  w.send("input", { moveX: 1, moveZ: 0, rotationY: 0, attack: true });
  w.send("ready", {});
  stepSeconds(eng, 0.5);
  check("his messages fall on no player — the wire ignores a watcher",
    room.players.size === floorBefore && !room.players.has(wid) && seatP.ready !== true);
}

// ---- §2 the caps ----
{
  const eng = makeEngine({ autoTick: false });
  // A duel's cap is 2 and the bench counts against it: a duel seats no crowd.
  const a = open(eng);
  a.send("create", { name: "A", mode: "honour_duel", awaitLoad: false });
  const code = a.last("join").code;
  const b = open(eng);
  b.send("join", { code, name: "B", awaitLoad: false });
  a.send("start", {});
  stepSeconds(eng, 5);
  const c = open(eng);
  c.send("join", { code, name: "C", awaitLoad: false });
  check("a duel is two men's business — the third is refused, not seated",
    !!c.last("error") && !c.last("join"), `"${c.last("error")?.message}"`);

  // A trial is fought alone: its cap of one refuses the bench outright.
  const t = open(eng);
  t.send("solo", { name: "Ana", difficulty: "recruit", botCount: 1, awaitLoad: false });
  stepSeconds(eng, 3);
  const soloCode = t.last("join").code;
  const peek = open(eng);
  peek.send("join", { code: soloCode, name: "Peek", awaitLoad: false });
  check("a trial admits no watcher", !!peek.last("error") && !peek.last("join"),
    `"${peek.last("error")?.message}"`);
}

// ---- §3 the bench empties onto the floor ----
{
  const eng = makeEngine({ autoTick: false });
  const { host, code, room } = fightUp(eng);
  const w = open(eng);
  w.send("join", { code, name: "Bencsittend", awaitLoad: false });
  const wid = w.last("join").playerId;

  // End the fight the engine's own way: the bot burns at the origin.
  bots(room).forEach((bp) => intoTheFire(bp, 1));
  stepSeconds(eng, 4);
  check("the match resolved while he watched", room.state === "finished", `state=${room.state}`);
  check("the verdict reached the bench too", !!w.last("match_end"));
  check("he is still seated through the summary", room.seats.has(wid) && !room.players.has(wid));

  // The summary runs out; the room is a lobby; the bench stands up.
  stepSeconds(eng, 12);
  check("the room is a lobby again", room.state === "lobby", `state=${room.state}`);
  check("the bench emptied onto the floor",
    room.players.has(wid) && !room.seats.has(wid) && room.seats.size === 0);
  check("the floor announced him", (host.byType.get("player_joined") || []).some((d) => d.playerId === wid));
  const promoted = room.players.get(wid);
  check("he stands whole, unready, at the muster point",
    promoted.health === promoted.maxHealth && promoted.ready === false && promoted.state === "idle");
}

// ---- §4 bots yield their places ----
{
  const eng = makeEngine({ autoTick: false });
  const host = open(eng);
  host.send("create", { name: "Hlaford", mode: "blood_moot", bestOf: 1, awaitLoad: false });
  const code = host.last("join").code;
  const room = eng._rooms.get(code);
  for (let i = 0; i < 7; i++) host.send("add_bot", { difficulty: "recruit" });
  check("the floor is full of furniture", room.players.size === 8, `${bots(room).length} bots`);
  host.send("start", {});
  stepSeconds(eng, 5);
  const w = open(eng);
  w.send("join", { code, name: "Rincwiga", awaitLoad: false });
  const wid = w.last("join")?.playerId;
  check("a full floor still has a bench — the cap counts HUMANS, not chairs",
    !!wid && room.seats.has(wid));
  bots(room).forEach((bp) => intoTheFire(bp, 1));
  stepSeconds(eng, 16);
  check("at the lobby a bot yielded his place — a human outranks furniture",
    room.state === "lobby" && room.players.has(wid) && room.players.size <= room.maxPlayers,
    `floor ${room.players.size}/${room.maxPlayers}, bots ${bots(room).length}`);
}

// ---- §5 the bench keeps a room alive, and inherits it ----
{
  const eng = makeEngine({ autoTick: false });
  const { host, code, room } = fightUp(eng);
  const w = open(eng);
  w.send("join", { code, name: "Yrfeweard", awaitLoad: false });
  const wid = w.last("join").playerId;

  // The only floor human walks out mid-fight. The bench holds the room.
  host.send("leave", {});
  check("a room with a bench outlives its empty floor", eng._rooms.has(code),
    `floor humans ${humans(room).length}, bench ${room.seats.size}`);

  // The bot stands alone; the round and match resolve themselves.
  stepSeconds(eng, 4);
  check("the fight resolved without a floor human", room.state === "finished", `state=${room.state}`);
  stepSeconds(eng, 12);
  check("the watcher inherits the room — floor, and the host's seat",
    room.state === "lobby" && room.players.has(wid) && room.hostId === wid,
    `hostId=${room.hostId === wid ? "the watcher" : room.hostId}`);

  // And the other way round: the last human stands up from the bench and
  // leaves; nobody is left to owe a match to; the room dies.
  const eng2 = makeEngine({ autoTick: false });
  const f2 = fightUp(eng2);
  const w2 = open(eng2);
  w2.send("join", { code: f2.code, name: "W", awaitLoad: false });
  f2.host.send("leave", {});
  w2.send("leave", {});
  check("the last man leaving the bench lets the room die", !eng2._rooms.has(f2.code));
}

console.log(`\n[bench] ${passed}/${passed + failed}${failed ? " — FAILING" : ""}`);
process.exit(failed ? 1 : 0);
