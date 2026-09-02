#!/usr/bin/env node
// TAKETEST — a dead man's weapon, held headless.
//
//   node tools/taketest.mjs
//
// FEATURES.md: "The corpse persists and the sim knows what he carried. A weapon
// on the ground is a reason to move." This file holds the sim half against the
// real engine over the real wire; the seen half — the axe lying where he fell,
// the man's rig rebuilt holding it — is judged on captures (art/shots/take/).
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { readFileSync } from "fs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { makeEngine, TAKE, ARMS, SHIELD, armsDeltaOf, armsHeld, carriesBoard } =
  await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);
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
  return c;
};
const stepSeconds = (eng, s) => { for (let i = 0; i < Math.ceil(s * RATE); i++) eng.step(); };
const moot = (eng, kits, bestOf = 1) => {
  const a = open(eng);
  a.send("create", { name: "Ecgbryht", mode: "blood_moot", bestOf, friendly: true, awaitLoad: false });
  const code = a.last("join").code;
  const clients = [a];
  for (const name of ["Osric", "Wulf"].slice(0, kits.length - 1)) { const c = open(eng); c.send("join", { code, name, awaitLoad: false }); clients.push(c); }
  clients.forEach((c, i) => { if (kits[i]) c.send("select_class", kits[i]); });
  a.send("start", {});
  stepSeconds(eng, 6);
  const room = eng._rooms.get(code);
  const ps = clients.map((c) => room.players.get(c.last("join").playerId));
  ps.forEach((p, i) => { p.position = { x: 8 + i * 1.2, y: 0, z: 0 }; p.invincible = false; });
  return { clients, room, ps, code };
};
const kill = (eng, room, victim, killer) => {
  victim.health = 1; victim.balance = 1;
  const face = Math.atan2(victim.position.x - killer.position.x, victim.position.z - killer.position.z);
  const c = killer.__client;
  c.send("input", { moveX: 0, moveZ: 0, rotationY: face, attackDir: "overhead", attack: true });
  for (let i = 0; i < 60 && victim.state !== "dead"; i++) eng.step();
  // The blow that killed him froze the killer too (HITSTOP.heavy), and
  // `processInput` returns at `hitstop > 0` before it reaches anything — a
  // man cannot bend for an axe in the frame his sword stopped. Let it pass.
  stepSeconds(eng, 0.6);
};
const stand = (client, at, extra = {}) => client.send("input", { moveX: 0, moveZ: 0, rotationY: 0, attackDir: "overhead", ...extra });

console.log("[take] a dead man's weapon, headless\n");

// ---- a kill leaves his arms on the ground ----
{
  const eng = makeEngine({ autoTick: false });
  // THREE men, so the kill leaves a match still running to take anything in —
  // two men and a kill is a verdict, and the input door shuts with it.
  const m = moot(eng, [{ warriorClass: "runekeeper" }, { warriorClass: "huscarl", arms: "dane_axe" }, { warriorClass: "warden" }]);
  const [A, B] = m.ps; A.__client = m.clients[0];
  check("a fresh man carries his own arms and the wire says so", A.taken === null && m.clients[0].snapshot.players[A.id].taken === null && Array.isArray(m.clients[0].snapshot.drops) && m.clients[0].snapshot.drops.length === 0);
  kill(eng, m.room, B, A);
  check("the kill lands", B.state === "dead", `state=${B.state}`);
  const d = m.room.drops[0];
  check("and leaves the dead man's arms where he fell", m.room.drops.length === 1 && d && d.cls === "huscarl" && d.arms === "dane_axe"
    && Math.abs(d.x - B.position.x) < 0.02 && Math.abs(d.z - B.position.z) < 0.02, JSON.stringify(d));
  check("the snapshot carries the drop", m.clients[0].snapshot.drops.length === 1 && m.clients[0].snapshot.drops[0].arms === "dane_axe");
  // out of range
  A.position = { x: d.x + TAKE.range + 0.6, y: 0, z: d.z };
  stand(m.clients[0], A, { take: true }); eng.step();
  check("a step too far and nothing happens", A.taken === null && m.room.drops.length === 1, `at ${(TAKE.range + 0.6).toFixed(1)} m`);
  // in range
  A.position = { x: d.x + TAKE.range * 0.6, y: 0, z: d.z };
  A.state = "idle"; A.attackTimer = 0;
  stand(m.clients[0], A, { take: true }); eng.step();
  check("within a step, TAKE puts the Dane axe in the runekeeper's hands", A.taken && A.taken.cls === "huscarl" && A.taken.arms === "dane_axe", JSON.stringify(A.taken));
  check("the axe is gone from the floor", m.room.drops.length === 0);
  check("the snapshot says whose weapon he holds", m.clients[0].snapshot.players[A.id].taken?.arms === "dane_axe");
  const own = ARMS.runekeeper[A.arms].delta, axe = ARMS.huscarl.dane_axe.delta;
  check("the delta rides the WEAPON — a runekeeper with the axe has the axe's reach and the haft's guard",
    armsDeltaOf(A).reach === axe.reach && armsDeltaOf(A).blockReduction === axe.blockReduction && (own.reach || 0) !== axe.reach,
    `reach ${armsDeltaOf(A).reach} (own ${own.reach || 0}), guard ${armsDeltaOf(A).blockReduction}`);
  check("armsHeld names what is in his hand", armsHeld(A) === "dane_axe");
}

// ---- the board follows the sword ----
{
  const eng = makeEngine({ autoTick: false });
  const m = moot(eng, [{ warriorClass: "huscarl", arms: "sword_board" }, { warriorClass: "huscarl", arms: "dane_axe" }, { warriorClass: "warden" }]);
  const [A, B] = m.ps; A.__client = m.clients[0];
  check("he starts with a board", A.shield === SHIELD.max);
  kill(eng, m.room, B, A);
  const d = m.room.drops[0];
  A.position = { x: d.x, y: 0, z: d.z }; A.state = "idle"; A.attackTimer = 0;
  stand(m.clients[0], A, { take: true }); eng.step();
  check("taking up a Dane axe slings his board — two hands on a haft carry none", A.taken?.arms === "dane_axe" && A.shield === null && !carriesBoard(A), `shield=${A.shield}`);
}
{
  const eng = makeEngine({ autoTick: false });
  const m = moot(eng, [{ warriorClass: "huscarl", arms: "dane_axe" }, { warriorClass: "huscarl", arms: "sword_board" }, { warriorClass: "warden" }]);
  const [A, B] = m.ps; A.__client = m.clients[0];
  check("an axe-man has no board", A.shield === null);
  kill(eng, m.room, B, A);
  const d = m.room.drops[0];
  A.position = { x: d.x, y: 0, z: d.z }; A.state = "idle"; A.attackTimer = 0;
  stand(m.clients[0], A, { take: true }); eng.step();
  check("a dead man's sword comes with his board — whole", A.taken?.arms === "sword_board" && A.shield === SHIELD.max, `shield=${A.shield}`);
}

// ---- it clears with the round, and the floor is capped ----
{
  const eng = makeEngine({ autoTick: false });
  const m = moot(eng, [{ warriorClass: "berserker" }, { warriorClass: "warden" }, { warriorClass: "runekeeper" }], 3);
  const [A, B, C] = m.ps; A.__client = m.clients[0];
  kill(eng, m.room, B, A);
  const d = m.room.drops[0];
  A.position = { x: d.x, y: 0, z: d.z }; A.state = "idle"; A.attackTimer = 0;
  stand(m.clients[0], A, { take: true }); eng.step();
  check("a berserker takes up the warden's gar", A.taken?.arms === "gar");
  m.room.drops = Array.from({ length: TAKE.max }, (_, i) => ({ id: `x${i}`, x: 0, z: 0, cls: "warden", arms: "gar", weapon: null, at: 0 }));
  kill(eng, m.room, C, A);  // the last man: the round ends and the next is placed
  stepSeconds(eng, 8);
  check("a new round is his own arms again and a clear floor", A.taken === null && m.room.drops.length === 0, `taken=${JSON.stringify(A.taken)}, drops=${m.room.drops.length}, round=${m.room.roundIndex}`);
}
{
  const eng = makeEngine({ autoTick: false });
  const m = moot(eng, [{ warriorClass: "berserker" }, { warriorClass: "warden" }]);
  const [A, B] = m.ps;
  m.room.drops = Array.from({ length: TAKE.max }, (_, i) => ({ id: `x${i}`, x: 0, z: 0, cls: "warden", arms: "gar", weapon: null, at: 0 }));
  A.__client = m.clients[0];
  kill(eng, m.room, B, A);
  check("the floor is capped at TAKE.max and the oldest goes first", m.room.drops.length === TAKE.max && m.room.drops[0].id === "x1" && m.room.drops[TAKE.max - 1].arms === "gar" && m.room.drops[TAKE.max - 1].id !== "x0");
}

// ---- the mirror ----
{
  const src = readFileSync(resolve(ROOT, "src/game/types.ts"), "utf8");
  const m = src.match(/export const TAKE = \{([\s\S]*?)\} as const;/);
  const num = (k) => { const r = m && m[1].match(new RegExp(`\\b${k}:\\s*([0-9.]+)`)); return r ? Number(r[1]) : NaN; };
  check("types.ts mirrors the engine's TAKE — range and max", !!m && num("range") === TAKE.range && num("max") === TAKE.max,
    m ? `types ${num("range")}/${num("max")} vs engine ${TAKE.range}/${TAKE.max}` : "no TAKE in types.ts");
}

console.log(`\n[take] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
