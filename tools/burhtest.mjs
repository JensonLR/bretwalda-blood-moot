#!/usr/bin/env node
// BURHTEST — The Burh's law, held headless (backlog 7.4).
//
//   node tools/burhtest.mjs
//
// The wartest idiom exactly: `makeEngine({ autoTick: false })`, seats over
// the real wire, the sim advanced by `step()`, and men killed the engine's
// own way — into the fire at the origin — never by writing "dead" onto them.
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
const men = (room) => { const out = []; room.players.forEach((p) => out.push(p)); return out; };
const bots = (room) => men(room).filter((p) => p.bot);
const humans = (room) => men(room).filter((p) => !p.bot);

console.log("[burh] the stand against the here, headless\n");

// ---- the room's shape ----
{
  const eng = makeEngine({ autoTick: false });
  const host = open(eng);
  host.send("create", { name: "Weard", mode: "the_burh", bestOf: 5, awaitLoad: false });
  const j = host.last("join");
  const room = eng._rooms.get(j.code);
  check("a burh room is a burh room", j.mode === "the_burh" || room.mode === "the_burh");
  check("the format is forced to one stand whatever the host asked", room.bestOf === 1, `asked 5, got ${room.bestOf}`);
  const guests = [];
  for (let i = 0; i < 4; i++) {
    const g = open(eng);
    g.send("join", { code: j.code, name: `D${i}`, awaitLoad: false });
    guests.push(g);
  }
  check("four defenders seat; the fifth is refused — the rest of the room belongs to the waves",
    humans(room).length === 4 && !!guests[3].last("error"),
    `${humans(room).length} humans, refusal: "${guests[3].last("error")?.message ?? "none"}"`);
  check("a forged mode string lands in the moot, not in a mystery mode", (() => {
    const h2 = open(eng);
    h2.send("create", { name: "X", mode: "zzz_hostile", awaitLoad: false });
    return eng._rooms.get(h2.last("join").code).mode === "blood_moot";
  })());
}

// ---- the stand itself ----
{
  const eng = makeEngine({ autoTick: false });
  const host = open(eng);
  host.send("create", { name: "Weard", mode: "the_burh", awaitLoad: false });
  const code = host.last("join").code;
  const g2 = open(eng);
  g2.send("join", { code, name: "Thane", awaitLoad: false });
  const room = eng._rooms.get(code);
  // Lobby bots are cleared at the bell — prove it by trying to pre-stack.
  host.send("add_bot", { difficulty: "jarl" });
  host.send("start", {});
  stepSeconds(eng, 1.2);
  check("a lone party can start, and the burh opens EMPTY — lobby bots cleared",
    (room.state === "fighting" || room.state === "countdown") && bots(room).length === 0,
    `state=${room.state}, bots=${bots(room).length}`);
  // Through the countdown and the opening two heartbeats.
  stepSeconds(eng, 6);
  // The fixture's defenders are made of sterner stuff — wartest's own idiom
  // (it raises maxHealth to stage holds). The claims here are about the WAVE
  // MACHINERY; a fixture whose party dies to wave three is measuring its own
  // frailty. The final claim burns them from 1 hp, which ignores this.
  humans(room).forEach((p) => { p.maxHealth = 100000; p.health = 100000; });
  check("wave one walks in on its own", room.wave === 1 && bots(room).length === 2,
    `wave=${room.wave}, ${bots(room).length} raiders (1+wave)`);
  check("the first waves are recruits", bots(room).every((b) => b.difficulty === "recruit"));
  check("the wave rides the snapshot", (host.snapshot?.wave ?? 0) === 1);

  // The here hunts defenders: step and watch the nearest raider close.
  const before = Math.min(...bots(room).map((b) => Math.hypot(b.position.x, b.position.z)));
  stepSeconds(eng, 2);
  const humanAt = humans(room)[0].position;
  const after = Math.min(...bots(room).map((b) =>
    Math.hypot(b.position.x - humanAt.x, b.position.z - humanAt.z)));
  check("the here closes on the defenders", after < before + 1, `nearest ${after.toFixed(1)}m`);

  // Fell one defender, then clear the wave: the fallen must rise for wave 2.
  intoTheFire(humans(room)[1], 1);
  stepSeconds(eng, 3);
  check("one defender down does not end the stand", room.state === "fighting"
    && humans(room).some((p) => p.state === "dead"));
  for (const b of bots(room)) intoTheFire(b, 1);
  stepSeconds(eng, 3);
  check("the cleared wave announces itself", host.count("wave_cleared") >= 1);
  for (let i = 0; i < 10 * RATE && room.wave < 2; i++) eng.step();
  check("wave two is larger and the fallen defender has risen",
    room.wave === 2 && bots(room).length === 3
      && humans(room).every((p) => p.state !== "dead"),
    `wave=${room.wave}, raiders=${bots(room).length}, dead=${humans(room).filter((p) => p.state === "dead").length}`);
  check("the risen man pays for his fall",
    humans(room).some((p) => Math.abs(p.health - Math.round(p.maxHealth * 0.62)) <= 1),
    "62% of full on the risen");
  check("last wave's corpses are cleared, not collected", men(room).length === humans(room).length + bots(room).length
    && bots(room).every((b) => b.state !== "dead"));

  // Climb to wave 5 and check the here hardens. Burn each wave, then step
  // until the next one stands — never a fixed clock, which drifts.
  while (room.wave < 5) {
    for (const b of bots(room)) intoTheFire(b, 1);
    const target = room.wave + 1;
    let guard = 0;
    while (room.wave < target && guard++ < 20 * RATE) eng.step();
    if (guard >= 20 * RATE) break;
  }
  check("by the fifth wave the here are jarls", room.wave === 5
    && bots(room).every((b) => b.difficulty === "jarl"),
    `wave=${room.wave}, ${bots(room)[0]?.difficulty}`);
  check("no last stand against the here — every wave is one", !room.lastStandTriggered);

  // The party falls together: the stand ends, the wave is on the verdict.
  for (const p of humans(room)) intoTheFire(p, 1);
  stepSeconds(eng, 4);
  check("the whole party down at once ends the stand", room.state === "finished", `state=${room.state}`);
  const end = host.last("match_end");
  check("the verdict carries the wave that took the burh", (end?.wave ?? 0) === 5, `wave=${end?.wave}`);
  check("the here wins nothing by name", end?.winnerKind === "none");
}

console.log(`\n[burh] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
