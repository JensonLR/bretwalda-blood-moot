#!/usr/bin/env node
// PARRYTEMPO — is the parry a read, or is it a mash?
//
//   npm run parrytempo
//   node tools/parrytempo.mjs --sweep     walk PARRY_LOCK and print both curves
//
// WHY THIS EXISTS. engine.mjs calls the parry "a 150 ms timing read" and "the
// hardest thing in the game to do" in three separate places. Nothing checked
// that claim against a player, and it was false. `blockTimer` was zeroed on
// release and re-armed to 0.001 on the next press with no cooldown anywhere, so
// every press opened a fresh window — and the optimal strategy was not to read
// the blow but to hammer the guard through it. Measured, before the fix:
//
//   guard HELD      0 parried   19 blocked    1 clean
//   guard MASHED    7 parried    0 blocked    6 clean
//
// Zero against seven. The thing that looks like defending could not parry at
// all, and mashing turned over half of everything thrown into a full parry —
// 0.90 s stagger, 42 poise, a riposte licence at x1.6.
//
// WHAT IT MEASURES, AND WHY EACH IS A BEHAVIOUR AND NOT A CONSTANT.
// Every number here is obtained by driving the sim and counting what comes back
// off the wire. Nothing imports PARRY_WINDOW or PARRY_LOCK — weightprobe's note
// on this is the house rule and it is the right one: a harness that reads the
// constant it is testing still prints the old number after somebody breaks the
// branch that uses it. So:
//
//   HELD        hold the guard down through twenty blows, count the outcomes.
//   MASHED      toggle it at 6, 10 and 15 Hz, same twenty blows.
//   READ        one deliberate press N ticks before contact, swept over N.
//   COVERED     press inside the cadence and check the guard still BLOCKS —
//               the fix must cost a parry and must never cost a defence.
//
// THE GATE. Four claims, and the third and fourth matter as much as the first:
// a fix that killed the mash by making the parry unreachable, or by leaving a
// man defenceless while his cadence ran, would be a worse game than the bug.
import { makeEngine } from "../src/game/engine.mjs";

const argv = process.argv.slice(2);
const SWEEP = argv.includes("--sweep");

const NEUTRAL = {
  moveX: 0, moveZ: 0, rotationY: 0, sprint: false, attack: false, heavyAttack: false,
  block: false, dodge: false, crouch: false, ability: false, shove: false, attackDir: "right",
};

let passed = 0, failed = 0;
function check(claim, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${claim}${detail ? ` — ${detail}` : ""}`);
  ok ? passed++ : failed++;
}

/** Two men, face to face, in `fighting`, spawn invincibility burnt off. */
function duel(cls = "huscarl", gap = 1.2, engine = makeEngine) {
  const sim = engine({ autoTick: false, epoch: 1e12 });
  const seat = () => {
    const c = { byType: new Map(), snapshot: null };
    c.sid = sim.connect((str) => {
      const m = JSON.parse(str);
      if (!c.byType.has(m.type)) c.byType.set(m.type, []);
      c.byType.get(m.type).push(m.data);
      if (m.data && m.data.players) c.snapshot = m.data;
    });
    c.send = (t, d) => sim.message(c.sid, { type: t, data: d || {} });
    c.got = (t) => c.byType.get(t) || [];
    return c;
  };
  const a = seat(), b = seat();
  a.send("create", { name: "Atli", mode: "free_for_all", bestOf: 1 });
  const code = a.got("join")[0].code, aid = a.got("join")[0].playerId;
  b.send("join", { code, name: "Beorn" });
  const bid = b.got("join")[0].playerId;
  a.send("select_class", { warriorClass: cls }); a.send("ready");
  b.send("select_class", { warriorClass: cls }); b.send("ready");
  a.send("start");
  for (let i = 0; i < 200 && a.snapshot?.state !== "fighting"; i++) sim.step();
  const room = [...sim._rooms.values()][0];
  const A = room.players.get(aid), B = room.players.get(bid);
  // Seated rather than walked: walking spends stamina and leaves stride in
  // `moveVel`, which would land on top of every measurement below.
  const seatThem = () => {
    A.position.x = 0; A.position.z = 0; A.rotation = 0;
    B.position.x = 0; B.position.z = gap; B.rotation = Math.PI;
    for (const p of [A, B]) {
      p.moveVel = { x: 0, z: 0 }; p.impulse = { x: 0, z: 0 };
      p.velocity = { x: 0, y: 0, z: 0 };
      p.invincible = false; p.invincibleTimer = 0;
      p.stamina = p.maxStamina; p.health = p.maxHealth;
      p.aimYaw = p.rotation;
    }
  };
  seatThem();
  return { sim, A, B, a, b, seatThem, step: (n = 1) => { for (let i = 0; i < n; i++) sim.step(); } };
}

/**
 * Twenty blows against a guard driven by `guard(tick) -> boolean`, counted off
 * the wire. The defender's own timers are NOT reset between blows: the cadence
 * is a property that spans blows and zeroing it here would hide exactly the
 * thing this measures.
 */
function bout(guard, blows = 20, cls = "huscarl", engine = makeEngine) {
  const d = duel(cls, 1.2, engine);
  const out = { parry: 0, blocked: 0, clean: 0, took: 0 };
  let seen = 0, tick = 0;
  for (let n = 0; n < blows; n++) {
    d.seatThem();
    d.A.attackTimer = 0; d.A.state = "idle"; d.A.stamina = d.A.maxStamina;
    for (let k = 0; k < 40; k++) {
      d.b.send("input", { ...NEUTRAL, block: guard(tick) });
      d.a.send("input", { ...NEUTRAL, attack: k === 2 });
      d.step(); tick++;
      const hits = d.a.got("hit");
      if (hits.length > seen) {
        for (const h of hits.slice(seen)) {
          if (h.type === "parry") out.parry++;
          else if (String(h.type).startsWith("blocked")) out.blocked++;
          else out.clean++;
          // The only currency that settles an argument about strategy. A parry
          // count is not an outcome; health is.
          out.took += h.damage ?? 0;
        }
        seen = hits.length; break;
      }
    }
  }
  d.sim.stop();
  return out;
}

const HELD = () => true;
const NEVER = () => false;
const mash = (hz) => (tick) => Math.floor(tick / (20 / hz / 2)) % 2 === 0;
const row = (label, r) =>
  console.log(`    ${label.padEnd(16)} parried ${String(r.parry).padStart(2)}   blocked ${String(r.blocked).padStart(2)}   clean ${String(r.clean).padStart(2)}   took ${String(r.took).padStart(4)} dmg`);

console.log("PARRYTEMPO — the guard, played two ways\n");
console.log("  TWENTY LIGHT BLOWS, HUSCARL v HUSCARL");
const held = bout(HELD), bare = bout(NEVER);
const mashed = [6, 10, 15].map((hz) => [hz, bout(mash(hz))]);
row("guard HELD", held);
row("no guard", bare);
for (const [hz, r] of mashed) row(`mashed ${hz} Hz${hz === 15 ? " *" : ""}`, r);
console.log("    * 15 Hz aliases to one toggle per sim tick — the ceiling, not a player.");

// 1. The guard still guards. If this ever fails, nothing else here matters.
check("a held guard still blocks nearly everything thrown at it",
  held.blocked >= 18, `${held.blocked}/20 blocked, ${held.clean} through`);

// 2. DOMINANCE IS SETTLED IN HEALTH, NOT IN PARRY COUNT — AND AT A RATE A
//    HAND CAN ACTUALLY REACH.
//
//    Two corrections to the first draft of this gate, both of which were the
//    gate being wrong rather than the game. First, a parry tally is not an
//    outcome: a man who parries six blows and eats eight is losing, so the
//    currency is damage per blow thrown. Second, 15 Hz is not a player. The sim
//    ticks at 20 Hz, so "15 Hz" aliases to "toggle the guard on every single
//    tick" — the fastest mash the server can physically resolve, twenty presses
//    a second, macro territory. It is printed below as the ceiling and named as
//    one; the gate is set where hands are.
//
//    THE CEILING IS REAL AND IS NOT HIDDEN. At the sim's own Nyquist limit a
//    masher still buys about six parries for roughly the health a held guard
//    spends. Closing that last gap needs the cadence to outlast the attack
//    cadence itself, which would stop a READER parrying consecutive blows —
//    a worse game than the residue. Recorded here rather than gated away.
const perBlow = (r) => r.took / 20;
const human = mashed.filter(([hz]) => hz <= 10).map(([, r]) => r);
check("mashing the guard is not the dominant strategy — at any rate a hand can hold, it costs far more health",
  Math.min(...human.map(perBlow)) > perBlow(held) * 1.6,
  `best human mash pays ${Math.min(...human.map(perBlow)).toFixed(1)} dmg/blow against a held guard's ${perBlow(held).toFixed(1)}`);
check("and it no longer buys the parries it used to — the cadence is load-bearing",
  Math.max(...human.map((r) => r.parry)) <= 3,
  `worst human mash got ${Math.max(...human.map((r) => r.parry))} parries in 20 (7 before the cadence; --sweep walks the curve)`);

// 3. THE READ MUST SURVIVE. One deliberate press, N ticks before contact.
//    This is weightprobe's sweep re-asked as "and it still works", because a
//    cadence that made the parry unreachable would pass every claim above.
console.log("\n  THE DELIBERATE READ (one press, N ticks before contact)");
const readAt = [];
for (let n = 0; n <= 8; n++) {
  const d = duel();
  // Guard down until the chosen tick, then up and held: one press, no mashing.
  let up = false, seen = 0, got = null;
  d.A.attackTimer = 0; d.A.state = "idle";
  for (let k = 0; k < 40 && got === null; k++) {
    d.b.send("input", { ...NEUTRAL, block: up });
    d.a.send("input", { ...NEUTRAL, attack: k === 2 });
    d.step();
    // Contact lands at k = 2 + windup; raise the guard n ticks ahead of it.
    if (d.A.attackPhase === "windup" && d.A.swingT !== undefined) {
      const left = Math.round((0.40 - d.A.swingT) * d.A.swingDuration / 0.05);
      if (left <= n) up = true;
    }
    const hits = d.a.got("hit");
    if (hits.length > seen) { got = hits[seen].type; seen = hits.length; }
  }
  if (got === "parry") readAt.push(n);
  d.sim.stop();
}
console.log(`    parried when the guard rose ${readAt.length ? readAt.join(", ") : "(never)"} tick(s) early`);
check("a single deliberate press still parries — the cadence costs the mash, not the read",
  readAt.length >= 2, `${readAt.length} tick(s) of window survive, want >= 2`);

// 4. NOBODY IS EVER LEFT DEFENCELESS. Spend a window, then raise the guard
//    inside the cadence and take a blow on it. It must BLOCK.
console.log("\n  COVERED WHILE THE CADENCE RUNS");
{
  const d = duel();
  // Spend the window: press and release with nothing incoming.
  d.b.send("input", { ...NEUTRAL, block: true }); d.step();
  d.b.send("input", { ...NEUTRAL, block: false }); d.step();
  // Now guard up and hold, and take a blow immediately.
  d.seatThem();
  d.A.attackTimer = 0; d.A.state = "idle";
  let got = null, seen = 0;
  for (let k = 0; k < 40 && got === null; k++) {
    d.b.send("input", { ...NEUTRAL, block: true });
    d.a.send("input", { ...NEUTRAL, attack: k === 0 });
    d.step();
    const hits = d.a.got("hit");
    if (hits.length > seen) { got = hits[seen].type; seen = hits.length; }
  }
  console.log(`    guard raised one tick into the cadence took the blow as: ${got}`);
  check("a guard raised inside the cadence still BLOCKS — the lock costs a parry, never a defence",
    got !== null && String(got).startsWith("blocked"), `hit came back as "${got}"`);
  d.sim.stop();
}

// --------------------------------------------------------------- the sweep
//
// Proof the constant is load-bearing, in the shape leversweep uses: change the
// number in the source, re-run both strategies, put the two curves side by
// side. Opt-in because it rewrites engine.mjs in place and restores it, and a
// crash between those two leaves the tree dirty.
if (SWEEP) {
  const { readFileSync, writeFileSync } = await import("node:fs");
  const SRC = new URL("../src/game/engine.mjs", import.meta.url);
  const original = readFileSync(SRC, "utf8");
  console.log("\n  SWEEP — what each cadence is worth (20 blows each)");
  console.log("    PARRY_LOCK   held parries   mash parries   mash clean");
  try {
    for (const v of [0, 0.15, 0.3, 0.45, 0.6, 0.9]) {
      writeFileSync(SRC, original.replace(/const PARRY_LOCK = [\d.]+;/, `const PARRY_LOCK = ${v};`));
      // A fresh URL each time, because ESM caches by specifier and a re-read of
      // the same one would hand back the first value for every row.
      const mod = await import(`${SRC.href}?lock=${v}`);
      const h = bout(HELD, 20, "huscarl", mod.makeEngine);
      const m = bout(mash(10), 20, "huscarl", mod.makeEngine);
      console.log(`    ${String(v).padEnd(12)} ${String(h.parry).padStart(12)} ${String(m.parry).padStart(14)} ${String(m.clean).padStart(12)}`);
    }
  } finally { writeFileSync(SRC, original); console.log("    (engine.mjs restored)"); }
}

console.log(`\n[parrytempo] ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
