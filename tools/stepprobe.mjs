#!/usr/bin/env node
/**
 * stepprobe — DOES SHADOW STEP MOVE YOU, AT THE RANGES YOU PRESS IT AT?
 *
 * Named after the owner's report, which is rule R6:
 *
 *   "Runekeeper is fast but his skill needs work it's a bit poor & sometimes
 *    doesn't move you"
 *
 * "Sometimes" is the word that makes this a measurement rather than a fix. A
 * skill that never moved you would have been found in a day; one that moves you
 * from across the ring and not in a fight looks fine everywhere except where it
 * matters. So this does not press the ability once and check a number — it
 * presses it at a SWEEP of approach distances, from nose to nose out to half the
 * arena, and prints the displacement at each. The defect is a SHAPE in that
 * column, not a value.
 *
 * WHY IT IS A GATE ON THE REAR ARC AS WELL. Displacement alone can be bought by
 * throwing the runekeeper anywhere. The ability is called SHADOW STEP and it is
 * the answer to "he doesn't do much damage": the point is not that he moves, it
 * is that he arrives BEHIND the man, inside `REAR_ARC`, where `isOffGuard`
 * charges double poise and `deriveHitZone` takes the nape. A step that displaced
 * him two metres sideways would pass a displacement check and be worth nothing,
 * so both are gated and the arc one is the one that carries the design.
 *
 * BOTH FIGHTERS ARE HUMAN SESSIONS AND ONLY ONE OF THEM IS DRIVEN. The mark
 * stands still because a bot would be walking during the measurement and the
 * approach distance is the independent variable — a mark that moves turns the
 * x-axis into noise. Everything else is the real server: real `processInput`,
 * real 20 Hz tick, real `activateAbility`.
 *
 * Usage:
 *   node tools/stepprobe.mjs
 *   node tools/stepprobe.mjs --mark=berserker
 */

import { makeEngine, WEAPON_REACH } from "../src/game/engine.mjs";

const argv = process.argv.slice(2);
const argOf = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h === undefined ? d : h.slice(n.length + 3); };
const MARK_CLASS = argOf("mark", "huscarl");
const TICK = 1 / 20;

// The seax's own bite, from the engine's table plus the two bodies between the
// fists. Every gap at or inside this is a range a runekeeper is IN A FIGHT at,
// and those are the ones the gate rules on.
const BODY_REACH = 1.20;
const SEAX_REACH = WEAPON_REACH.runekeeper + BODY_REACH;   // 1.70

/** Approach gaps, metres centre to centre. The first four are inside his reach. */
const GAPS = [1.1, 1.4, 1.7, 2.0, 3.0, 5.0, 9.0];

/** Radians from the mark's forward. Same constant `deriveHitZone` uses. */
const REAR_ARC = 1.95;
/** What the fixed ability promises. Mirrors `SHADOW_STEP.minTravel` in the engine. */
const MIN_TRAVEL = 1.05;

const wrapPi = (a) => { let r = a; while (r > Math.PI) r -= Math.PI * 2; while (r < -Math.PI) r += Math.PI * 2; return r; };

function session(engine) {
  const st = { latest: null, id: null, join: null, abilities: [] };
  const sid = engine.connect((str) => {
    const m = JSON.parse(str);
    if (m.type === "join") { st.id = m.data.playerId; st.join = m.data; }
    if ((m.type === "game_state" || m.type === "lobby_update" || m.type === "countdown" || m.type === "round_end") && m.data.players) st.latest = m.data;
    if (m.type === "ability_used") st.abilities.push(m.data);
  });
  return { sid, st };
}

const NEUTRAL = {
  moveX: 0, moveZ: 0, rotationY: 0, sprint: false, attack: false, heavyAttack: false,
  block: false, dodge: false, crouch: false, ability: false, shove: false, attackDir: "right",
};

/**
 * One press, from `gap` metres directly in front of the mark's face — which is
 * where a runekeeper is standing when he presses it.
 */
function onePress(gap) {
  const engine = makeEngine({ autoTick: false });
  const A = session(engine);   // the runekeeper
  const B = session(engine);   // the mark, who does nothing

  engine.message(A.sid, { type: "create", data: { name: "Rune", mode: "honour_duel", bestOf: 1 } });
  engine.message(A.sid, { type: "select_class", data: { warriorClass: "runekeeper" } });
  engine.message(B.sid, { type: "join", data: { code: A.st.join.code } });
  engine.message(B.sid, { type: "select_class", data: { warriorClass: MARK_CLASS } });
  engine.message(A.sid, { type: "start", data: {} });

  let t = 0;
  while (t < 30 && A.st.latest?.state !== "fighting") { engine.step(TICK); t += TICK; }
  if (A.st.latest?.state !== "fighting") { engine.stop(); throw new Error("never reached `fighting`"); }

  // Walk the runekeeper onto the mark's own facing line, `gap` out in front of
  // him. The mark never moves, so this converges; 12 sim seconds is many times
  // what a 5.5 u/s stride needs to cross the ring.
  let walked = 0;
  while (walked < 12) {
    const me = A.st.latest.players[A.st.id];
    const mk = B.st.latest.players[B.st.id];
    const tx = mk.position.x + Math.sin(mk.rotation) * gap;
    const tz = mk.position.z + Math.cos(mk.rotation) * gap;
    const dx = tx - me.position.x, dz = tz - me.position.z;
    const d = Math.hypot(dx, dz);
    // Face the mark throughout — that is the stance the ability is pressed from.
    const yaw = Math.atan2(mk.position.x - me.position.x, mk.position.z - me.position.z);
    if (d < 0.12) { engine.message(A.sid, { type: "input", data: { ...NEUTRAL, rotationY: yaw } }); engine.step(TICK); walked += TICK; break; }
    const th = Math.min(1, d / 1.2);
    engine.message(A.sid, { type: "input", data: { ...NEUTRAL, moveX: (dx / d) * th, moveZ: (dz / d) * th, rotationY: yaw } });
    engine.step(TICK); walked += TICK;
  }
  // Let the stride bleed off so the measurement is the STEP and not the run-up.
  for (let i = 0; i < 8; i++) { engine.message(A.sid, { type: "input", data: { ...NEUTRAL, rotationY: A.st.latest.players[A.st.id].rotation } }); engine.step(TICK); }

  const before = { ...A.st.latest.players[A.st.id].position };
  const mark = A.st.latest.players[B.st.id];
  const standoff = Math.hypot(before.x - mark.position.x, before.z - mark.position.z);
  const firedBefore = A.st.abilities.length;

  engine.message(A.sid, { type: "input", data: { ...NEUTRAL, rotationY: A.st.latest.players[A.st.id].rotation, ability: true } });
  engine.step(TICK);

  const after = { ...A.st.latest.players[A.st.id].position };
  const travelled = Math.hypot(after.x - before.x, after.z - before.z);
  // Where he ended up, measured off the MARK's facing: 0 is nose to nose, π is
  // squarely behind him.
  const bearing = Math.abs(wrapPi(Math.atan2(after.x - mark.position.x, after.z - mark.position.z) - mark.rotation));
  const fired = A.st.abilities.length > firedBefore;
  const cooldown = A.st.latest.players[A.st.id].abilityCooldown;

  engine.message(A.sid, { type: "leave" }); engine.message(B.sid, { type: "leave" });
  engine.stop();
  return { standoff, travelled, bearing, behind: bearing > REAR_ARC, fired, cooldown };
}

const rows = GAPS.map((g) => ({ gap: g, ...onePress(g) }));

const pad = (s, n) => String(s).padEnd(n);
const out = [];
out.push("");
out.push(`SHADOW STEP, pressed from directly in front of a stationary ${MARK_CLASS}`);
out.push("");
out.push(pad("asked gap", 12) + pad("actual standoff", 18) + pad("travelled", 12) + pad("bearing off his face", 22) + pad("behind him?", 14) + "cooldown");
for (const r of rows) {
  out.push(
    pad(`${r.gap.toFixed(1)} m`, 12)
    + pad(`${r.standoff.toFixed(2)} m`, 18)
    + pad(`${r.travelled.toFixed(2)} m`, 12)
    + pad(`${((r.bearing * 180) / Math.PI).toFixed(0)} deg`, 22)
    + pad(r.behind ? "yes" : "NO", 14)
    + `${r.cooldown.toFixed(1)} s`,
  );
}
out.push("");
out.push(`(a runekeeper's own bite is ${SEAX_REACH.toFixed(2)} m, so every row at or inside that is a range he presses it at IN A FIGHT)`);
process.stdout.write(out.join("\n") + "\n\n");

// ---- the gate ----
// Ruled ONLY on the rows inside a seax's reach. Further out the ability is a
// gap-closer and always worked; the defect lives where the class lives.
const inFight = rows.filter((r) => r.standoff <= SEAX_REACH + 0.35);
const failures = [];
if (inFight.length < 3) failures.push(`only ${inFight.length} row(s) landed inside a seax's reach — the approach did not converge and nothing here is a measurement`);
for (const r of inFight) {
  if (!r.fired) { failures.push(`at ${r.standoff.toFixed(2)} m the ability never fired`); continue; }
  if (r.travelled < MIN_TRAVEL) failures.push(`at ${r.standoff.toFixed(2)} m the step moved him ${r.travelled.toFixed(2)} m — under the ${MIN_TRAVEL} m one body separation, so it did not move him anywhere he could not have stood`);
  if (!r.behind) failures.push(`at ${r.standoff.toFixed(2)} m he landed ${((r.bearing * 180) / Math.PI).toFixed(0)} deg off the mark's face, outside the ${((REAR_ARC * 180) / Math.PI).toFixed(0)} deg rear arc — no off-guard, no nape, no reason to press it`);
}
// A press that cannot be honoured must not be charged for. Refusals are legal;
// silent refusals that still take eight seconds are the bug.
const charged = rows.filter((r) => !r.fired && r.cooldown > 0.01);
for (const r of charged) failures.push(`at ${r.standoff.toFixed(2)} m the ability refused to move him and still took ${r.cooldown.toFixed(1)} s of cooldown`);

if (failures.length) {
  process.stdout.write(`FAIL: shadow step — ${failures.length} finding(s) inside a seax's reach\n`);
  for (const f of failures) process.stdout.write(`  ${f}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`PASS: shadow step — at every range inside a seax's ${SEAX_REACH.toFixed(2)} m the press moves him at least ${MIN_TRAVEL} m and lands him inside the mark's ${((REAR_ARC * 180) / Math.PI).toFixed(0)} deg rear arc, and a press it cannot honour is refunded rather than charged\n`);
}
