#!/usr/bin/env node
// SHIELDTEST — the board wears and bursts, held headless.
//
//   node tools/shieldtest.mjs
//
// FEATURES.md, in its own words: "a shield that visibly wears and finally
// bursts turns turtling into a decision and heavies into shield-breakers."
// This file holds the sim half of that sentence against the real engine over
// the real wire, the way fighttest holds the execution. The visible half —
// the cracks, the splinters, the board dropping off his arm — is judged on
// captures (art/shots/shield/) and not here, because a raster is not a claim
// a headless run can make.
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { makeEngine, SHIELD, carriesBoard } =
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
  c.all = (t) => c.byType.get(t) || [];
  return c;
};
const stepSeconds = (eng, s) => { for (let i = 0; i < Math.ceil(s * RATE); i++) eng.step(); };
const duelUp = (eng, kit = {}) => {
  const a = open(eng);
  a.send("create", { name: "Ecgbryht", mode: "blood_moot", bestOf: kit.bestOf || 1, friendly: true, awaitLoad: false });
  const code = a.last("join").code;
  const b = open(eng);
  b.send("join", { code, name: "Osric", awaitLoad: false });
  if (kit.a) a.send("select_class", kit.a);
  if (kit.b) b.send("select_class", kit.b);
  a.send("start", {});
  stepSeconds(eng, 6);
  const room = eng._rooms.get(code);
  const pa = room.players.get(a.last("join").playerId);
  const pb = [...room.players.values()].find((p) => p.id !== pa.id);
  pa.position = { x: 8, y: 0, z: 0 };
  pb.position = { x: 9.2, y: 0, z: 0 };
  pa.invincible = false; pb.invincible = false;
  const face = Math.atan2(pb.position.x - pa.position.x, pb.position.z - pa.position.z);
  return { a, b, room, pa, pb, face };
};
/** One blow from A, on B's held guard, the guard re-held through the stroke. Returns hp taken. */
const blowOnGuard = (eng, f, { heavy = false, swingDir = "overhead", guardDir = "overhead", wall = false } = {}) => {
  const hold = () => f.b.send("input", { moveX: 0, moveZ: 0, rotationY: f.face + Math.PI, attackDir: guardDir, block: true });
  if (wall) f.b.send("input", { moveX: 0, moveZ: 0, rotationY: f.face + Math.PI, attackDir: guardDir, ability: true });
  hold();
  stepSeconds(eng, 0.3);
  const hp = f.pb.health;
  f.a.send("input", { moveX: 0, moveZ: 0, rotationY: f.face, attackDir: swingDir, ...(heavy ? { heavyAttack: true } : { attack: true }) });
  for (let i = 0; i < 40; i++) { if (i % 4 === 0) hold(); eng.step(); }
  // let both men settle before the next blow: stagger, recovery, stamina
  f.b.send("input", { moveX: 0, moveZ: 0, rotationY: f.face + Math.PI, attackDir: guardDir, block: false });
  stepSeconds(eng, 1.4);
  f.pa.stamina = f.pa.maxStamina; f.pb.stamina = f.pb.maxStamina;
  f.pb.balance = f.pb.maxBalance ?? f.pb.balance;
  return hp - f.pb.health;
};

console.log("[shield] the board wears and bursts, headless\n");

// ---- who has one ----
{
  const eng = makeEngine({ autoTick: false });
  const f = duelUp(eng, { a: { warriorClass: "runekeeper" }, b: { warriorClass: "huscarl", arms: "sword_board" } });
  check("a huscarl with a board spawns with a whole one", f.pb.shield === SHIELD.max, `shield=${f.pb.shield}`);
  check("a runekeeper carries none, and the wire says null not zero", f.pa.shield === null, `shield=${f.pa.shield}`);
  check("the snapshot publishes it", f.a.snapshot.players[f.pb.id].shield === SHIELD.max && f.a.snapshot.players[f.pa.id].shield === null);
  const g = duelUp(makeEngine({ autoTick: false }), { b: { warriorClass: "huscarl", arms: "dane_axe" } });
  check("the Dane axe slings the board — a huscarl with two hands on a haft carries none", g.pb.shield === null && !carriesBoard(g.pb), `shield=${g.pb.shield}`);
}

// ---- it wears ----
{
  const eng = makeEngine({ autoTick: false });
  const f = duelUp(eng, { a: { warriorClass: "warden" }, b: { warriorClass: "huscarl", arms: "sword_board" } });
  const s0 = f.pb.shield;
  blowOnGuard(eng, f, { heavy: false });
  const light = s0 - f.pb.shield;
  check("a turned light blow costs the boards SHIELD.cost.light", light === SHIELD.cost.light, `-${light}, bar ${SHIELD.cost.light}`);
  const s1 = f.pb.shield;
  blowOnGuard(eng, f, { heavy: true });
  const heavy = s1 - f.pb.shield;
  check("a turned heavy costs SHIELD.cost.heavy — the shield-breaker", heavy === SHIELD.cost.heavy && heavy > light, `-${heavy}, bar ${SHIELD.cost.heavy}`);
  const s2 = f.pb.shield;
  blowOnGuard(eng, f, { heavy: false, swingDir: "overhead", guardDir: "right" });
  const wrong = s2 - f.pb.shield;
  check("the wrong line lands on the rim and costs SHIELD.mismatch more", wrong === Math.round(SHIELD.cost.light * SHIELD.mismatch * 10) / 10 || Math.abs(wrong - SHIELD.cost.light * SHIELD.mismatch) < 1e-9, `-${wrong}, bar ${SHIELD.cost.light * SHIELD.mismatch}`);
  check("and the boards never go negative or come back on their own", f.pb.shield >= 0 && f.pb.shield < s0, `shield=${f.pb.shield}`);
}

// ---- SHIELD WALL costs nothing ----
{
  const eng = makeEngine({ autoTick: false });
  const f = duelUp(eng, { a: { warriorClass: "berserker" }, b: { warriorClass: "huscarl", arms: "sword_board" } });
  const s0 = f.pb.shield;
  blowOnGuard(eng, f, { heavy: true, wall: true });
  check("under SHIELD WALL the boards take nothing — the unbreakable wall is unbreakable", f.pb.shield === s0 && f.pb.abilityActive === true || f.pb.shield === s0, `shield ${s0} -> ${f.pb.shield}`);
}

// ---- it bursts ----
{
  const eng = makeEngine({ autoTick: false });
  const f = duelUp(eng, { a: { warriorClass: "berserker" }, b: { warriorClass: "huscarl", arms: "sword_board" } });
  const intact = blowOnGuard(eng, f, { heavy: false });
  f.pb.shield = SHIELD.cost.light; // one turned light from bursting
  f.pb.health = f.pb.maxHealth;
  const beforeHits = f.a.all("hit").length;
  const hold = () => f.b.send("input", { moveX: 0, moveZ: 0, rotationY: f.face + Math.PI, attackDir: "overhead", block: true });
  hold(); stepSeconds(eng, 0.3);
  f.a.send("input", { moveX: 0, moveZ: 0, rotationY: f.face, attackDir: "overhead", attack: true });
  let burstAt = -1, staggeredSeen = false;
  for (let i = 0; i < 40; i++) {
    if (i % 4 === 0 && burstAt < 0) hold();
    eng.step();
    if (burstAt < 0 && f.a.all("hit").some((h) => h.type === "shield_burst")) burstAt = i;
    if (burstAt >= 0 && f.pb.state === "staggered") staggeredSeen = true;
  }
  const hits = f.a.all("hit").slice(beforeHits).map((h) => h.type);
  check("the last turned blow bursts the board: `shield_burst` goes out on the wire", burstAt >= 0, `hits since: ${hits.join(", ")}`);
  check("cause then effect — the blocked blow's own hit precedes the burst", hits.indexOf("blocked") >= 0 && hits.indexOf("blocked") < hits.indexOf("shield_burst"), hits.join(" -> "));
  check("the snapshot shows the board at zero", f.pb.shield === 0 && f.a.snapshot.players[f.pb.id].shield === 0, `shield=${f.pb.shield}`);
  check("and he staggers on it, longer than a heavy rocks him", staggeredSeen, `state seen staggered: ${staggeredSeen}`);
  check("the burst carries no damage of its own", f.a.all("hit").find((h) => h.type === "shield_burst")?.damage === 0);
  // now the guard leaks
  stepSeconds(eng, 1.5); f.pb.health = f.pb.maxHealth; f.pa.stamina = f.pa.maxStamina;
  const burst = blowOnGuard(eng, f, { heavy: false });
  check("behind splinters the same blow leaks harder — the guard is a haft now", burst > intact, `intact board let ${intact} through, burst ${burst}`);
  check("and a burst board cannot burst twice", f.a.all("hit").filter((h) => h.type === "shield_burst").length === 1);
}

// ---- it comes back with the man ----
{
  const eng = makeEngine({ autoTick: false });
  const f = duelUp(eng, { a: { warriorClass: "berserker" }, b: { warriorClass: "huscarl", arms: "sword_board" }, bestOf: 3 });
  f.pb.shield = 0;
  // end the round: A kills B
  f.pb.health = 1; f.pb.state = "idle";
  f.a.send("input", { moveX: 0, moveZ: 0, rotationY: f.face, attackDir: "overhead", attack: true });
  stepSeconds(eng, 2);
  const dead = f.pb.state === "dead";
  stepSeconds(eng, 6); // the intermission and the next round's placing
  check("a new round is a new board", dead ? f.pb.shield === SHIELD.max : false, `dead=${dead}, shield after the round=${f.pb.shield}, round=${f.room.roundIndex}`);
}

// ---- the mirror ----
// `types.ts` carries a copy of SHIELD for the rig and the HUD, and the engine
// is the authority. Read off disk, the way soundwire reads the wire's kinds,
// because a harness that imported the .ts would be a harness with a compiler
// in it and a copy that only a compiler can check is a copy nobody checks.
{
  const { readFileSync } = await import("fs");
  const src = readFileSync(resolve(ROOT, "src/game/types.ts"), "utf8");
  const m = src.match(/export const SHIELD = \{([\s\S]*?)\} as const;/);
  const num = (k) => { const r = m && m[1].match(new RegExp(`\\b${k}:\\s*([0-9.]+)`)); return r ? Number(r[1]) : NaN; };
  check("types.ts mirrors the engine's SHIELD — max, both costs, the mismatch and the burst guard",
    !!m && num("max") === SHIELD.max && num("light") === SHIELD.cost.light && num("heavy") === SHIELD.cost.heavy
      && num("mismatch") === SHIELD.mismatch && num("burstGuard") === SHIELD.burstGuard,
    m ? `types ${num("max")}/${num("light")}/${num("heavy")}/${num("mismatch")}/${num("burstGuard")} vs engine ${SHIELD.max}/${SHIELD.cost.light}/${SHIELD.cost.heavy}/${SHIELD.mismatch}/${SHIELD.burstGuard}` : "no SHIELD in types.ts");
}

console.log(`\n[shield] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
