#!/usr/bin/env node
/**
 * mercytest — MERCY OR FINISH, on the wire, at 20 Hz.
 *
 * `docs/DESIGN-SYSTEM.md` §8 states the feature as three properties rather than
 * as a screen, and every one of them is a thing that can be false, so every one
 * of them is a case here:
 *
 *   the pressure is stated SOCIALLY — seven men are watching — not as a meter
 *   the window DRAINS rather than counting down
 *   letting it run out is ITSELF a choice, and a merciful one, and the game
 *     should say so out loud
 *
 * The first is gated by counting witnesses in rooms of different sizes and
 * checking the number MOVES — a hard-coded seven would pass a one-room test and
 * is exactly the shape of defect this repository keeps shipping. The second is
 * gated by reading `mercyTimer` off consecutive snapshots and requiring it to
 * fall monotonically to zero, because "it drains" is a claim about the wire and
 * not about the UI. The third is gated by doing NOTHING and requiring a `spared`
 * message with both men named — an outcome the server states, not one a client
 * infers from an absence.
 *
 * And then the two rules that make it a mechanic instead of a mood: a finish
 * inside the window kills with `cause: "finish"` and is credited, and a man who
 * has already been spared this round DIES on his second fall, which is what
 * bounds a round in which everybody is merciful.
 *
 * Everything is driven through `engine.message` on a fixed `step()` clock. No
 * sleeps, no polling, no wall time — the whole class of "the harness graded the
 * landing screen" defect starts with a test that races the sim instead of
 * driving it, and this one owns the clock.
 */

import { makeEngine, MERCY, KNOCKDOWN, WARRIOR_STATS } from "../src/game/engine.mjs";

const TICK = 1 / 20;
const failures = [];
const notes = [];
const ok = (cond, msg) => { if (!cond) failures.push(msg); return cond; };

function session(engine) {
  const st = { latest: null, id: null, join: null, msgs: [] };
  const sid = engine.connect((str) => {
    const m = JSON.parse(str);
    if (m.type === "join") { st.id = m.data.playerId; st.join = m.data; }
    if ((m.type === "game_state" || m.type === "lobby_update" || m.type === "countdown"
      || m.type === "round_end" || m.type === "match_end") && m.data.players) st.latest = m.data;
    st.msgs.push(m);
  });
  return { sid, st };
}

const NEUTRAL = {
  moveX: 0, moveZ: 0, rotationY: 0, sprint: false, attack: false, heavyAttack: false,
  block: false, dodge: false, crouch: false, ability: false, shove: false, attackDir: "right",
};

/**
 * A room of `extras + 2` men, all human sessions so nothing moves unless this
 * file says so. A is the executioner, B is the mark, the extras are the moot —
 * they exist to be COUNTED, which is the social half of the design.
 */
function ring(extras, bClass = "runekeeper") {
  const engine = makeEngine({ autoTick: false });
  const A = session(engine);
  engine.message(A.sid, { type: "create", data: { name: "Aethel", mode: "blood_moot", bestOf: 1 } });
  engine.message(A.sid, { type: "select_class", data: { warriorClass: "berserker" } });
  const B = session(engine);
  engine.message(B.sid, { type: "join", data: { code: A.st.join.code } });
  engine.message(B.sid, { type: "select_class", data: { warriorClass: bClass } });
  const rest = [];
  for (let i = 0; i < extras; i++) {
    const S = session(engine);
    engine.message(S.sid, { type: "join", data: { code: A.st.join.code } });
    rest.push(S);
  }
  engine.message(A.sid, { type: "start", data: {} });
  let t = 0;
  while (t < 30 && A.st.latest?.state !== "fighting") { engine.step(TICK); t += TICK; }
  if (A.st.latest?.state !== "fighting") { engine.stop(); throw new Error("never reached `fighting`"); }
  // Spawn i-frames are an answer to a man swinging at you and there is one here.
  for (let i = 0; i < 50; i++) engine.step(TICK);
  return { engine, A, B, rest };
}

const me = (S) => S.st.latest.players[S.st.id];
const hold = (engine, S, data) => engine.message(S.sid, { type: "input", data: { ...NEUTRAL, ...data } });

/** Walk A onto B and hold there, facing him. Returns when inside `within`. */
function close(engine, A, B, within = 1.4, cap = 25) {
  let t = 0;
  while (t < cap) {
    const a = me(A), b = me(B);
    if (!a || !b) return;
    const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
    const d = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    if (d <= within) { hold(engine, A, { rotationY: yaw }); return; }
    hold(engine, A, { moveX: dx / d, moveZ: dz / d, rotationY: yaw });
    engine.step(TICK); t += TICK;
  }
}

/** Swing until `stop()` says so or the cap runs out. Heavy, because it is faster. */
function beat(engine, A, B, stop, cap = 60) {
  let t = 0;
  while (t < cap && !stop()) {
    const a = me(A), b = me(B);
    if (!a || !b) return;
    const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const yaw = Math.atan2(dx, dz);
    if (d > 1.5) hold(engine, A, { moveX: dx / d, moveZ: dz / d, rotationY: yaw });
    else hold(engine, A, { rotationY: yaw, heavyAttack: a.state === "idle" || a.state === "walking" });
    engine.step(TICK); t += TICK;
  }
}

const last = (S, type) => [...S.st.msgs].reverse().find((m) => m.type === type) || null;
const count = (S, type) => S.st.msgs.filter((m) => m.type === type).length;

// ===========================================================================
// CASE 1 — a killing blow puts him DOWN, not dead, and the room is told, and
//          the pressure is a COUNT of the men who can see it.
// ===========================================================================
{
  const { engine, A, B } = ring(3);
  close(engine, A, B);
  beat(engine, A, B, () => count(B, "downed") > 0 || me(B).state === "dead");

  const downed = last(B, "downed");
  if (ok(downed, "CASE 1: no `downed` message ever arrived — a killing blow still simply kills")) {
    const b = me(B);
    ok(b.state !== "dead", `CASE 1: he is \`${b.state}\` — a downed man must not be dead`);
    ok(b.mortal === true, "CASE 1: `mortal` is not set on the wire, so no client can tell this fall from a knockdown");
    ok(downed.data.attackerId === A.st.id, "CASE 1: the choice is not attributed to the man who put him there");
    ok(downed.data.window === MERCY.window, `CASE 1: the window's full length is not published (got ${downed.data.window}) — a client cannot draw a DRAIN without it`);
    // Five men in the room, two of them in the moment: three are watching.
    ok(downed.data.witnesses === 3, `CASE 1: ${downed.data.witnesses} witnesses reported in a room of 5 with 2 in the moment — expected 3`);
    notes.push(`  witnesses in a 5-man room: ${downed.data.witnesses}`);
  }
  engine.stop();
}

// ===========================================================================
// CASE 2 — the witness count is REAL. A hard-coded "seven men are watching"
//          passes case 1 and fails here, which is the entire reason this case
//          exists: the design says the pressure is social, and a number that
//          does not move with the room is decoration.
// ===========================================================================
{
  const seen = [];
  for (const extras of [0, 2, 6]) {
    const { engine, A, B } = ring(extras);
    close(engine, A, B);
    beat(engine, A, B, () => count(B, "downed") > 0 || me(B).state === "dead");
    const d = last(B, "downed");
    seen.push(d ? d.data.witnesses : null);
    engine.stop();
  }
  ok(seen[0] === 0 && seen[1] === 2 && seen[2] === 6,
    `CASE 2: witnesses across rooms of 2, 4 and 8 men came back ${JSON.stringify(seen)} — expected [0,2,6]. The count is not being taken from the room.`);
  notes.push(`  witnesses across 2/4/8-man rooms: ${JSON.stringify(seen)}`);
}

// ===========================================================================
// CASE 3 — the window DRAINS, on the wire, monotonically, to zero. And doing
//          NOTHING is an act the server names out loud.
// ===========================================================================
{
  const { engine, A, B } = ring(3);
  close(engine, A, B);
  beat(engine, A, B, () => count(B, "downed") > 0 || me(B).state === "dead");

  if (ok(count(B, "downed") > 0, "CASE 3: never got him down, so nothing below is a measurement")) {
    // A walks away and does nothing at all. That is the merciful act.
    const samples = [];
    let rose = false;
    for (let i = 0; i < Math.ceil((MERCY.window + KNOCKDOWN.rise + 0.6) / TICK); i++) {
      hold(engine, A, {});
      engine.step(TICK);
      const b = me(B);
      if (b.mortal) samples.push(b.mercyTimer);
      if (!b.mortal && b.state !== "dead") rose = true;
    }
    ok(samples.length > 20, `CASE 3: only ${samples.length} snapshots carried a live window — it is not on the wire long enough to draw`);
    let monotone = true;
    for (let i = 1; i < samples.length; i++) if (samples[i] > samples[i - 1] + 1e-9) monotone = false;
    ok(monotone, "CASE 3: the window is not monotonically draining — it went back up");
    ok(samples.length > 0 && samples[0] > samples[samples.length - 1], "CASE 3: the window never fell");

    const spared = last(B, "spared");
    if (ok(spared, "CASE 3: the window ran out and the server said NOTHING — letting it run out is a CHOICE and the game has to say so out loud")) {
      ok(spared.data.sparerId === A.st.id, "CASE 3: the `spared` message does not name the man who gave it");
      ok(spared.data.targetId === B.st.id, "CASE 3: the `spared` message does not name the man who got it");
    }
    const b = me(B);
    ok(b.state !== "dead", `CASE 3: he is \`${b.state}\` — a spared man lives`);
    ok(rose, "CASE 3: he never came off the floor");
    ok(b.spared === true, "CASE 3: `spared` is not marked on him, so he could be given his life a second time and the round need never end");
    const want = Math.max(1, Math.floor(WARRIOR_STATS.runekeeper.maxHealth * MERCY.risesOn));
    ok(b.health === want, `CASE 3: he rose on ${b.health} of ${WARRIOR_STATS.runekeeper.maxHealth} — MERCY.risesOn says ${want}`);
    // ...and the sparer's reputation.
    ok(me(A).menSpared === 1, `CASE 3: the sparer's \`menSpared\` is ${me(A).menSpared} — the choice left no trace on the man who made it`);
    notes.push(`  window drained across ${samples.length} snapshots, ${samples[0]?.toFixed(2)}s to ${samples[samples.length - 1]?.toFixed(2)}s`);
  }
  engine.stop();
}

// ===========================================================================
// CASE 4 — a finish inside the window kills, is its own cause, and is credited.
// ===========================================================================
{
  const { engine, A, B } = ring(3);
  close(engine, A, B);
  beat(engine, A, B, () => count(B, "downed") > 0 || me(B).state === "dead");

  if (ok(count(B, "downed") > 0, "CASE 4: never got him down")) {
    beat(engine, A, B, () => me(B).state === "dead" || !me(B).mortal, Math.ceil(MERCY.window / TICK) * TICK);
    const b = me(B);
    ok(b.state === "dead", `CASE 4: kept swinging at a downed man inside the window and he is \`${b.state}\` — a finish must be possible or the choice is not a choice`);
    ok(b.deathCause === "finish", `CASE 4: deathCause is \`${b.deathCause}\` — a finish is not the same death as a man cut down on his feet and the wire has to say which`);
    const kill = last(B, "kill");
    ok(kill && kill.data.cause === "finish", `CASE 4: the \`kill\` message calls it \`${kill?.data.cause}\``);
    ok(me(A).menFinished === 1, `CASE 4: the finisher's \`menFinished\` is ${me(A).menFinished}`);
    ok(me(A).kills === 1, `CASE 4: a finish did not credit a kill (kills=${me(A).kills})`);
  }
  engine.stop();
}

// ===========================================================================
// CASE 5 — THE ROUND STILL ENDS. A man is spared once; his second fall is
//          death. Without this a room of merciful men fights forever, and a
//          mechanic that can hang a round is not shippable however good it is.
// ===========================================================================
{
  const { engine, A, B } = ring(3);
  close(engine, A, B);
  beat(engine, A, B, () => count(B, "downed") > 0 || me(B).state === "dead");
  // Spare him: hold still through the window and his rise.
  for (let i = 0; i < Math.ceil((MERCY.window + KNOCKDOWN.rise + 0.6) / TICK); i++) { hold(engine, A, {}); engine.step(TICK); }
  if (ok(me(B).spared === true && me(B).state !== "dead", "CASE 5: he was not spared, so the second fall proves nothing")) {
    const downsBefore = count(B, "downed");
    beat(engine, A, B, () => me(B).state === "dead" || count(B, "downed") > downsBefore);
    const b = me(B);
    ok(b.state === "dead", `CASE 5: put a spared man down a second time and he is \`${b.state}\` — mercy is given ONCE or a round need never end`);
    ok(count(B, "downed") === downsBefore, "CASE 5: a second window opened over a man who had already been given his life");
    ok(b.deathCause === "blow", `CASE 5: the second fall reported \`${b.deathCause}\` — it is a kill, not a finish, because no window was ever opened on it`);
  }
  engine.stop();
}

// ===========================================================================
// VERDICT
// ===========================================================================
process.stdout.write("\nMERCY OR FINISH\n");
for (const n of notes) process.stdout.write(n + "\n");
process.stdout.write(`  window ${MERCY.window}s, rises on ${(MERCY.risesOn * 100).toFixed(0)}% of a bar\n\n`);
if (failures.length) {
  process.stdout.write(`FAIL: mercy — ${failures.length} finding(s)\n`);
  for (const f of failures) process.stdout.write(`  ${f}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("PASS: mercy — a killing blow downs instead of killing, the room is told with a witness count that MOVES with the room (0/2/6 in rooms of 2/4/8), the window drains monotonically on the wire, letting it run out is answered by the server's own `spared` message naming both men, a finish inside the window dies with cause `finish` and is credited, and a man already spared this round dies on his second fall so a room of merciful men still finishes its round\n");
}
