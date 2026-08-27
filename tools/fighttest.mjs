#!/usr/bin/env node
// FIGHTTEST — the fight's depth, held headless (backlog 7.7).
//
//   node tools/fighttest.mjs
//
// §1 THE EXECUTION (7.7a). Two humans over the real wire, the sim advanced
// by step(); the knockdown is earned the engine's own way (a light blow
// over a spent balance bar), the finish is a real heavy swung through
// processInput, and every counter-claim gets its own room because a landed
// execution ends the match it proves. This file grows with the wave:
// weapon choice and the directional guard land their sections here.
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { makeEngine, EXECUTION } = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);

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

/**
 * Two men, adjacent, mid-fight, grace spent — away from the fire at the
 * origin, because this section is about steel. Returns everything a claim
 * needs to swing and judge.
 */
const duelUp = (eng) => {
  const a = open(eng);
  a.send("create", { name: "Ecgbryht", mode: "blood_moot", bestOf: 1, friendly: true, awaitLoad: false });
  const code = a.last("join").code;
  const b = open(eng);
  b.send("join", { code, name: "Osric", awaitLoad: false });
  a.send("start", {});
  stepSeconds(eng, 6); // countdown + the spawn grace, fully burnt
  const room = eng._rooms.get(code);
  const pa = room.players.get(a.last("join").playerId);
  const pb = [...room.players.values()].find((p) => p.id !== pa.id);
  // Stood a stride apart on open turf, the attacker facing his man.
  pa.position = { x: 8, y: 0, z: 0 };
  pb.position = { x: 9.2, y: 0, z: 0 };
  pa.invincible = false; pb.invincible = false;
  const face = Math.atan2(pb.position.x - pa.position.x, pb.position.z - pa.position.z);
  return { a, b, room, pa, pb, face };
};
const swing = (client, face, heavy) => client.send("input", {
  moveX: 0, moveZ: 0, rotationY: face, attackDir: "overhead",
  ...(heavy ? { heavyAttack: true } : { attack: true }),
});
/**
 * The knockdown, earned, and NOT a second wasted: his poise is a sliver,
 * the light spends it, and the loop stops the tick he is floored — then
 * waits only for the attacker's own recovery, because the heavy input is
 * dropped (not queued) while `attackTimer` runs. This fixture's first cut
 * stepped a flat 1.5 s and measured the man STANDING BACK UP: the whole
 * window is down+rise = 1.3 s, and an executioner who dawdles loses it —
 * which is the design, and the fixture has to fight like a player.
 */
const floorHim = (eng, f) => {
  f.pb.balance = 1;
  swing(f.a, f.face, false);
  for (let i = 0; i < 40 && f.pb.state !== "knocked"; i++) eng.step();
  for (let i = 0; i < 40 && f.pa.attackTimer > 0; i++) eng.step();
};

console.log("[fight] the fight's depth, headless\n");

// ---- §1 the execution ----
{
  // The finish itself: downed AND low, one heavy takes all of him.
  const eng = makeEngine({ autoTick: false });
  const f = duelUp(eng);
  floorHim(eng, f);
  check("the knockdown is earned the engine's way — poise spent, man floored",
    f.pb.state === "knocked" || f.pb.state === "rising", `state=${f.pb.state}`);
  f.pb.health = Math.floor(f.pb.maxHealth * EXECUTION.healthFrac) - 1;
  const scoreBefore = f.pa.score;
  swing(f.a, f.face, true);
  stepSeconds(eng, 2);
  check("a heavy over a downed, low man takes ALL of him", f.pb.state === "dead", `state=${f.pb.state}, hp=${f.pb.health}`);
  check("the death is NAMED an execution", f.pb.deathCause === "execution", `cause=${f.pb.deathCause}`);
  check("the kill message says so too", f.a.last("kill")?.cause === "execution");
  check("the feed can say 'executed'", f.room.killFeed[f.room.killFeed.length - 1]?.cause === "execution");
  check("the flourish is paid on top of the kill",
    f.pa.score - scoreBefore === 100 + EXECUTION.score, `+${f.pa.score - scoreBefore}`);
}
{
  // Downed but NOT low: the heavy is a blow, not a sentence. A knockdown
  // from full health must never be a death by rule — that would make
  // balance a second health bar.
  const eng = makeEngine({ autoTick: false });
  const f = duelUp(eng);
  floorHim(eng, f);
  const hpBefore = f.pb.health;
  swing(f.a, f.face, true);
  stepSeconds(eng, 2);
  check("a downed man ABOVE the threshold takes a heavy and lives",
    f.pb.state !== "dead" && f.pb.health < hpBefore && f.pb.deathCause == null,
    `hp ${hpBefore} -> ${f.pb.health}`);
}
{
  // A LIGHT on a downed low man is not an execution — the finish costs the
  // committed stroke, or the rule teaches nothing about the heavy.
  const eng = makeEngine({ autoTick: false });
  const f = duelUp(eng);
  floorHim(eng, f);
  f.pb.health = Math.floor(f.pb.maxHealth * EXECUTION.healthFrac) - 1;
  const hpBefore = f.pb.health;
  swing(f.a, f.face, false);
  stepSeconds(eng, 2);
  check("a light blow over the same man is only a blow",
    f.pb.deathCause !== "execution" && f.pb.health < hpBefore,
    `hp ${hpBefore} -> ${f.pb.health}, state=${f.pb.state}`);
}
{
  // A STANDING low man dies a plain death to the same heavy: helplessness
  // is the licence, not the health bar.
  const eng = makeEngine({ autoTick: false });
  const f = duelUp(eng);
  f.pb.health = 5;
  swing(f.a, f.face, true);
  stepSeconds(eng, 2);
  check("the same heavy on a STANDING low man is a death, not an execution",
    f.pb.state === "dead" && f.pb.deathCause === "blow", `cause=${f.pb.deathCause}`);
}

console.log(`\n[fight] ${passed}/${passed + failed}${failed ? " — FAILING" : ""}`);
process.exit(failed ? 1 : 0);
