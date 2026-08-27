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
const { makeEngine, EXECUTION, ARMS, defaultArmsOf, swingDurationOf, WARRIOR_STATS } =
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

/**
 * Two men, adjacent, mid-fight, grace spent — away from the fire at the
 * origin, because this section is about steel. Returns everything a claim
 * needs to swing and judge.
 */
const duelUp = (eng, kit = {}) => {
  const a = open(eng);
  a.send("create", { name: "Ecgbryht", mode: "blood_moot", bestOf: 1, friendly: true, awaitLoad: false });
  const code = a.last("join").code;
  const b = open(eng);
  b.send("join", { code, name: "Osric", awaitLoad: false });
  // Kit is chosen in the LOBBY — select_class is KIT-gated (lobby and
  // intermission only), and this fixture's first cut selected mid-fight,
  // was silently refused, and measured two wardens against each other.
  if (kit.a) a.send("select_class", kit.a);
  if (kit.b) b.send("select_class", kit.b);
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

// ---- §2 the arms (7.7b) ----
{
  // The table's own law: every class offers a choice, every DEFAULT delta is
  // empty — the game as shipped moves by nothing when the table lands.
  const classes = Object.keys(WARRIOR_STATS);
  check("every class bears a choice of arms",
    classes.every((c) => ARMS[c] && Object.keys(ARMS[c]).length >= 2));
  check("every default is the class sheet untouched — the shipped game moves by nothing",
    classes.every((c) => Object.keys(ARMS[c][defaultArmsOf(c)].delta).length === 0));
  check("the stroke lean is real, both ways",
    swingDurationOf("huscarl", false, "dane_axe") > swingDurationOf("huscarl", false)
    && swingDurationOf("berserker", false, "twin_beards") < swingDurationOf("berserker", false),
    `huscarl ${swingDurationOf("huscarl", false).toFixed(2)}s -> axe ${swingDurationOf("huscarl", false, "dane_axe").toFixed(2)}s; `
    + `berserker ${swingDurationOf("berserker", false).toFixed(2)}s -> beards ${swingDurationOf("berserker", false, "twin_beards").toFixed(2)}s`);

  // The wire: a man is created with his class default; select_class carries
  // the choice; a forged id or a class change lands the new class's default.
  const eng = makeEngine({ autoTick: false });
  const a = open(eng);
  a.send("create", { name: "Wulf", mode: "blood_moot", awaitLoad: false });
  const room = eng._rooms.get(a.last("join").code);
  const me = room.players.get(a.last("join").playerId);
  check("a new man bears his class's own arm", me.arms === defaultArmsOf(me.warriorClass), me.arms);
  check("the join hands down the whole arms table with the balance sheet",
    !!a.last("join").armsTable && !!a.last("join").armsTable.huscarl);
  a.send("select_class", { warriorClass: "huscarl", arms: "dane_axe" });
  check("the choice rides select_class", me.arms === "dane_axe");
  check("the choice rides the snapshot", a.last("lobby_update")?.players?.[me.id]?.arms === "dane_axe");
  a.send("select_class", { warriorClass: "huscarl", arms: "gar" });
  check("a foreign arm is refused — the warden's gar lands the huscarl his default",
    me.arms === "sword_board", me.arms);
  a.send("select_class", { warriorClass: "huscarl", arms: "dane_axe" });
  a.send("select_class", { warriorClass: "berserker" });
  check("a class change always re-arms — no stale loadout crosses classes",
    me.arms === defaultArmsOf("berserker"), me.arms);
}
{
  // The reach lean, measured in the ring: stood where the sword falls short,
  // the dane axe bites. Same men, same ground, one variable. The gap is NOT
  // the table difference — a swing lunges (LUNGE_LIGHT 0.9 of impulse decays
  // through the windup), so the first cut's 2.4 m was inside BOTH weapons'
  // travel and measured only the damage lean. The honest gap sits between
  // the two weapons' lunge-carried bites, found empirically.
  const gap = 3.0;
  const reachTrial = (arms) => {
    const eng = makeEngine({ autoTick: false });
    const f = duelUp(eng, { a: { warriorClass: "huscarl", arms } });
    f.pa.position = { x: 8, y: 0, z: 0 };
    f.pb.position = { x: 8 + gap, y: 0, z: 0 };
    const hp = f.pb.health;
    swing(f.a, f.face, false);
    stepSeconds(eng, 2);
    return hp - f.pb.health;
  };
  const swordBite = reachTrial("sword_board");
  const axeBite = reachTrial("dane_axe");
  check("the dane axe bites where the sword falls short — reach is real",
    swordBite === 0 && axeBite > 0, `at ${gap}m: sword took ${swordBite}, axe took ${axeBite}`);
}
{
  // The guard trade, measured: the same blow leaks more through a haft-parry
  // than through the board it replaced.
  const guardTrial = (arms) => {
    const eng = makeEngine({ autoTick: false });
    const f = duelUp(eng, { b: { warriorClass: "huscarl", arms } });
    f.pa.position = { x: 8, y: 0, z: 0 };
    f.pb.position = { x: 9.2, y: 0, z: 0 };
    // The guard up and HELD — a single block message lapses with the intent
    // (INPUT_LAPSE_MS 600), and this trial's first cut sent one, watched it
    // lapse before contact, and measured two unguarded men leaking the same.
    const hold = () => f.b.send("input", { moveX: 0, moveZ: 0, rotationY: f.face + Math.PI, attackDir: "overhead", block: true });
    hold();
    stepSeconds(eng, 0.3);
    const hp = f.pb.health;
    swing(f.a, f.face, false);
    for (let i = 0; i < 40; i++) { if (i % 4 === 0) hold(); eng.step(); }
    return hp - f.pb.health;
  };
  const throughBoard = guardTrial("sword_board");
  const throughHaft = guardTrial("dane_axe");
  check("the dane axe's price is the guard — the same blow leaks harder through a haft",
    throughBoard >= 0 && throughHaft > throughBoard,
    `board let ${throughBoard} through, haft ${throughHaft}`);
}

// ---- §3 the directional guard (7.7c) ----
{
  // Same blow, two guards: the one that answers it and the one facing the
  // wrong way. The mismatched guard keeps half its worth (GUARD.mismatch).
  const guardLeak = (guardDir, swingDir, wall = false) => {
    const eng = makeEngine({ autoTick: false });
    const f = duelUp(eng, { b: { warriorClass: "huscarl", arms: "sword_board" } });
    f.pa.position = { x: 8, y: 0, z: 0 };
    f.pb.position = { x: 9.2, y: 0, z: 0 };
    if (wall) f.b.send("input", { moveX: 0, moveZ: 0, rotationY: f.face + Math.PI, attackDir: guardDir, ability: true });
    const hold = () => f.b.send("input", { moveX: 0, moveZ: 0, rotationY: f.face + Math.PI, attackDir: guardDir, block: true });
    hold();
    stepSeconds(eng, 0.3);
    const hp = f.pb.health;
    f.a.send("input", { moveX: 0, moveZ: 0, rotationY: f.face, attackDir: swingDir, attack: true });
    for (let i = 0; i < 40; i++) { if (i % 4 === 0) hold(); eng.step(); }
    return hp - f.pb.health;
  };
  const matched = guardLeak("overhead", "overhead");
  const wrong = guardLeak("right", "overhead");
  check("the guard holds its full worth only on the line it faces",
    matched >= 0 && wrong > matched,
    `matched guard let ${matched} through, wrong-way ${wrong}`);
  const walled = guardLeak("right", "overhead", true);
  check("SHIELD WALL covers every line at once — the ability is blind to direction",
    walled <= matched && walled < wrong, `wall let ${walled} through against the wrong line`);
}
{
  // THE PARRY STAYS A TIMING READ. A guard snapped up inside the window
  // with the WRONG direction still turns the blow — demanding the
  // direction too would price the hardest input in the game out of human
  // hands, and this claim is what keeps that a law rather than an intent.
  const eng = makeEngine({ autoTick: false });
  const f = duelUp(eng);
  f.pa.position = { x: 8, y: 0, z: 0 };
  f.pb.position = { x: 9.2, y: 0, z: 0 };
  f.a.send("input", { moveX: 0, moveZ: 0, rotationY: f.face, attackDir: "overhead", attack: true });
  stepSeconds(eng, 0.25);
  f.b.send("input", { moveX: 0, moveZ: 0, rotationY: f.face + Math.PI, attackDir: "stab", block: true });
  stepSeconds(eng, 1);
  const parried = (f.b.byType.get("hit") || []).some((h) => h.type === "parry");
  check("a parry is a timing read, never a direction test",
    parried && f.pa.state === "staggered" || parried,
    parried ? "wrong-direction guard inside the window still turned the blow" : `no parry seen; attacker=${f.pa.state}`);
}

console.log(`\n[fight] ${passed}/${passed + failed}${failed ? " — FAILING" : ""}`);
process.exit(failed ? 1 : 0);
