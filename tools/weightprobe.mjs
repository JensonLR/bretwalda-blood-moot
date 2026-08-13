#!/usr/bin/env node
/**
 * weightprobe — DOES A BLOW WEIGH ANYTHING? Measured, not asserted.
 *
 *   node tools/weightprobe.mjs            gate (exit non-zero on failure)
 *   node tools/weightprobe.mjs --report   print the table, gate nothing
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 *
 * The owner, three separate ways, which are one ask:
 *
 *   "Need to feel more weight in the animations & attacks ... needs to feel
 *    fluid & needs to feel real & heavy, like shoving people, being able to
 *    fall over if caught off guard / shoved & get back up"
 *   "Upgrade to the party [parry] system ... there needs to be a window to
 *    capitalise on the party too so you can attack & do more damage because of
 *    the parry"
 *
 * There was no instrument in this repository that could see any of that.
 * `playtest` proves the mechanics still work; `latencytest` proves the wire
 * survives lag; neither can tell you whether a hit MOVED anybody. PROCESS.md
 * E4 — write the probe before the fix when the property is new.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT MEASURES, AND WHY EACH ONE IS A BEHAVIOUR AND NOT A CONSTANT
 *
 * Every number below is obtained by DRIVING THE SIM AND WATCHING, never by
 * importing the constant that is supposed to produce it. That is deliberate and
 * it is this repository's single most-repeated failure (PROCESS.md, ten
 * instances): a harness that reads `PARRY_WINDOW` and prints "150 ms" is a
 * harness that will still print 150 ms after somebody breaks the branch that
 * uses it. So:
 *
 *   TELEGRAPH        step a swing and count the ticks `attackPhase` spends in
 *                    "windup" before it first reads "contact".
 *   IMPULSE / TRAVEL  freeze both men, land one blow, and measure the ground
 *                    each of them covers afterwards, in metres, from the tick
 *                    of contact until both are at rest.
 *   STAGGER          ticks the target's `state` reads "staggered".
 *   KNOCKDOWN        ticks he is down, and the ticks he spends rising, as two
 *                    separate numbers — a get-up that is not distinguishable
 *                    from the knockdown is not a get-up.
 *   PARRY WINDOW     SWEPT. The block is raised N ticks before contact, for
 *                    every N, and the window is the set of N that parries. This
 *                    is the only honest way to state a window on a 20 Hz server
 *                    and it reports BOTH the tick count and the milliseconds,
 *                    because 50 ms quantisation is the whole difficulty.
 *   RIPOSTE          after a parry lands: how long the parried man carries the
 *                    opening, and how much more damage the parrier's blow does
 *                    inside it versus the identical blow outside it. The bonus
 *                    is measured as a RATIO OF TWO MEASURED HITS, so it cannot
 *                    be satisfied by a constant nobody reads.
 *
 * ---------------------------------------------------------------------------
 * PROOF OF FAILURE (PROCESS.md R2). Run against the build of 12 Aug 2026 that
 * this file was written against, every gate below FAILED, and the report read:
 *
 *   light blow  travel target 0.000 m   attacker 0.000 m
 *   heavy blow  travel target 0.000 m   attacker 0.000 m
 *   knockdown   NOT A STATE — no "knocked"/"rising" in PlayerState
 *   get-up      0 ticks
 *   riposte     window 0 ms   bonus x1.00
 *
 * Five zeroes. That is what "a hit is a number leaving a health bar" looks like
 * when you point a ruler at it.
 */
// SWING_PHASES and swingDurationOf are imported rather than restated, and that
// is deliberate. This file schedules the defender's guard by counting back from
// the tick contact is due, which needs the windup fraction and the heavy scale
// — and writing `0.40` and `1.25` here would have been the mirrored-definition
// fault PROCESS.md records five times, in the one file whose entire job is to
// not have it. The IMPORTS are scheduling only; nothing asserted below reads
// them, so a wrong constant here shifts the sweep and the sweep says so.
import { makeEngine, SWING_PHASES, swingDurationOf } from "../src/game/engine.mjs";

const REPORT_ONLY = process.argv.includes("--report");
const TICK = 0.05;
const results = [];
const deferrals = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const NEUTRAL = {
  moveX: 0, moveZ: 0, rotationY: 0, sprint: false, attack: false, heavyAttack: false,
  block: false, dodge: false, crouch: false, ability: false, shove: false, attackDir: "right",
};

// ---------------------------------------------------------------- the fixture

/**
 * Two men, face to face, at a distance the swing reaches, with the sim in
 * `fighting` and spawn invincibility already burnt off.
 *
 * `_rooms` is used to place them because the alternative — walking them into
 * position — spends stamina, leaves stride in `moveVel`, and would put the
 * measurement of a blow's travel on top of the measurement of a walk. The
 * players written here ARE the server's (engine.mjs documents `_rooms` for
 * exactly this), so nothing about the fight is faked: only the seating is.
 */
function duel({ attacker = "huscarl", target = "huscarl", gap = 1.4 } = {}) {
  const sim = makeEngine({ autoTick: false, epoch: 1e12 });
  const seat = (name) => {
    const c = { name, byType: new Map(), snapshot: null };
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
  const a = seat("Atli"), b = seat("Beorn");
  a.send("create", { name: "Atli", mode: "free_for_all", bestOf: 1 });
  const code = a.got("join")[0].code;
  const aid = a.got("join")[0].playerId;
  b.send("join", { code, name: "Beorn" });
  const bid = b.got("join")[0].playerId;
  a.send("select_class", { warriorClass: attacker }); a.send("ready");
  b.send("select_class", { warriorClass: target }); b.send("ready");
  a.send("start");
  // Out of countdown and into the fight.
  for (let i = 0; i < 200 && a.snapshot?.state !== "fighting"; i++) sim.step();
  const room = [...sim._rooms.values()][0];
  const A = room.players.get(aid), B = room.players.get(bid);

  /** Face them at each other across `gap`, at rest, with no invincibility. */
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
  const hits = () => a.got("hit");
  return { sim, A, B, a, b, room, seatThem, hits, step: (n = 1) => { for (let i = 0; i < n; i++) sim.step(); } };
}

/** Standing intent, resent every tick — the sim lapses one older than 600 ms. */
const hold = (c, over = {}) => c.send("input", { ...NEUTRAL, ...over });
const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const at = (p) => ({ x: p.position.x, z: p.position.z });

// ------------------------------------------------------- one blow, instrumented

/**
 * Throw one blow and watch everything it does.
 *
 * Returns telegraph ticks, the ground each man covered from the tick of contact
 * to rest, the states the target passed through and how long he held each, and
 * the damage the wire reported.
 *
 * `blockAt` raises the target's guard exactly N ticks before contact is due
 * (null = never). That is how the parry window gets SWEPT rather than read.
 */
function throwBlow(d, { heavy = false, blockAt = null, holdBlock = false, aimYaw = 0 } = {}) {
  const { A, B, a, b, step } = d;
  A.aimYaw = aimYaw;
  const dur = swingDurationOf(A.warriorClass, heavy);
  const windupTicks = Math.ceil((dur * SWING_PHASES.windup) / TICK);

  let telegraph = 0, contactTick = -1, tick = 0;
  let posAtContact = null, aPosAtContact = null;
  const seen = new Map();          // target state -> ticks held
  const hitsBefore = a.got("hit").length;
  let raised = false;

  hold(a, { attack: !heavy, heavyAttack: heavy, rotationY: aimYaw });
  for (; tick < 220; tick++) {
    // The guard goes up on the tick asked for, counted back from the contact
    // the windup is about to reach.
    if (blockAt !== null && !raised && tick >= windupTicks - blockAt) {
      raised = true;
      hold(b, { block: true });
    } else if (raised && holdBlock) {
      hold(b, { block: true });
    } else if (raised && !holdBlock) {
      hold(b, {});
    }
    step();
    if (A.attackPhase === "windup") telegraph++;
    if (contactTick < 0 && a.got("hit").length > hitsBefore) {
      contactTick = tick;
      posAtContact = at(B);
      aPosAtContact = at(A);
    }
    if (contactTick >= 0) {
      seen.set(B.state, (seen.get(B.state) || 0) + 1);
      const still = Math.hypot(B.velocity.x, B.velocity.z) < 0.02 && Math.hypot(A.velocity.x, A.velocity.z) < 0.02;
      if (still && A.state !== "attacking" && B.state !== "staggered" && !isDown(B) && tick > contactTick + 2) break;
    }
    if (contactTick < 0 && A.state !== "attacking" && tick > windupTicks + 8) break;
  }
  const hit = a.got("hit").slice(hitsBefore)[0] || null;
  return {
    telegraphTicks: telegraph,
    telegraphMs: telegraph * 50,
    hit,
    landed: Boolean(hit),
    damage: hit ? hit.damage : 0,
    hitType: hit ? hit.type : null,
    targetTravel: posAtContact ? dist(posAtContact, at(B)) : 0,
    attackerTravel: aPosAtContact ? dist(aPosAtContact, at(A)) : 0,
    stateTicks: seen,
  };
}

/** Down or rising, without this file deciding what those states are called. */
const isDown = (p) => p.state === "knocked" || p.state === "rising";

// ================================================================== the probe

console.log("\n[weightprobe] a blow, weighed\n");

// ---------------------------------------------------------------- 1. telegraph
//
// A heavy blow must be legible BEFORE it lands or a parry is a coin flip. What
// makes it legible is time, so time is what is measured — and it is measured
// per class, because "heavier weapons telegraph longer" is a claim about the
// SPREAD and not about any one number.
const telegraph = {};
for (const cls of ["runekeeper", "warden", "huscarl", "berserker"]) {
  const d = duel({ attacker: cls, gap: 1.2 });
  const light = throwBlow(d, { heavy: false });
  d.seatThem();
  const heavy = throwBlow(d, { heavy: true });
  telegraph[cls] = { light: light.telegraphMs, heavy: heavy.telegraphMs };
  d.sim.stop();
}
console.log("  TELEGRAPH (ms of windup before the blade can bite)");
for (const [cls, t] of Object.entries(telegraph)) {
  console.log(`    ${cls.padEnd(11)} light ${String(t.light).padStart(4)} ms   heavy ${String(t.heavy).padStart(4)} ms`);
}

// The reaction floor. A human sees, decides and presses in ~250 ms at best; a
// telegraph shorter than that is not a telegraph, it is a dice roll, and the
// parry it gates cannot be skilful. The berserker is the game's heavy weapon
// and is the one that has to clear it by a margin.
check("the heaviest weapon telegraphs longer than a human reaction (>=250 ms)",
  telegraph.berserker.heavy >= 250, `berserker heavy windup ${telegraph.berserker.heavy} ms`);
check("every class's heavy telegraphs at least 150 ms",
  Object.values(telegraph).every((t) => t.heavy >= 150),
  Object.entries(telegraph).map(([c, t]) => `${c} ${t.heavy}`).join(", ") + " ms");
check("weapon weight is legible in the telegraph: the heavy class winds up >=1.6x the fast one",
  telegraph.berserker.heavy / telegraph.runekeeper.light >= 1.6,
  `berserker heavy ${telegraph.berserker.heavy} / runekeeper light ${telegraph.runekeeper.light} = `
  + (telegraph.berserker.heavy / telegraph.runekeeper.light).toFixed(2) + "x");

// ------------------------------------------------------------------ 2. impact
//
// The owner's words: a hit must "feel real & heavy". A hit that leaves both men
// standing exactly where they stood is a number leaving a health bar. So: how
// far does the struck man go, and does the striker feel it stop against mass?
console.log("\n  IMPACT (metres of ground covered from the tick of contact)");
const impact = {};
for (const [label, opts] of [["light", { heavy: false }], ["heavy", { heavy: true }],
                             ["blocked heavy", { heavy: true, blockAt: 8, holdBlock: true }]]) {
  const d = duel({ attacker: "huscarl", gap: 1.2 });
  const r = throwBlow(d, opts);
  impact[label] = r;
  console.log(`    ${label.padEnd(14)} target ${r.targetTravel.toFixed(3)} m   attacker ${r.attackerTravel.toFixed(3)} m`
    + `   dmg ${String(r.damage).padStart(3)}   (${r.hitType})`);
  d.sim.stop();
}

check("a light blow drives the struck man back", impact.light.targetTravel >= 0.15,
  `${impact.light.targetTravel.toFixed(3)} m`);
check("a heavy blow drives him further than a light one", impact.heavy.targetTravel > impact.light.targetTravel * 1.3,
  `heavy ${impact.heavy.targetTravel.toFixed(3)} m vs light ${impact.light.targetTravel.toFixed(3)} m`);
check("a heavy blow drives him at least half a metre", impact.heavy.targetTravel >= 0.5,
  `${impact.heavy.targetTravel.toFixed(3)} m`);
check("a shield eats most of the push — a blocked heavy moves him less than an open one",
  impact["blocked heavy"].targetTravel < impact.heavy.targetTravel * 0.8 && impact["blocked heavy"].hitType === "blocked_heavy",
  `blocked ${impact["blocked heavy"].targetTravel.toFixed(3)} m vs open ${impact.heavy.targetTravel.toFixed(3)} m`
  + ` (${impact["blocked heavy"].hitType})`);

// ------------------------------------------------- 3. stagger, knockdown, get-up
console.log("\n  STAGGER, KNOCKDOWN, GET-UP");
function statesOf(d, fn) {
  const { B, step } = d;
  const seen = new Map();
  fn();
  for (let i = 0; i < 200; i++) {
    step();
    seen.set(B.state, (seen.get(B.state) || 0) + 1);
    if (B.state === "idle" && i > 3) break;
  }
  return seen;
}

// A blow taken off-guard, on a man already reeling: this is the owner's
// "caught off guard" and it is what a knockdown has to be reachable from.
const kd = duel({ attacker: "berserker", target: "warden", gap: 1.2 });
const openHeavy = throwBlow(kd, { heavy: true });
const staggerTicks = openHeavy.stateTicks.get("staggered") || 0;
console.log(`    stagger from an open heavy    ${staggerTicks} ticks (${staggerTicks * 50} ms)`);

// Shove a man who is already staggered — force on top of force.
kd.seatThem();
kd.B.state = "staggered"; kd.B.staggerTimer = 0.4;
const shoveStates = statesOf(kd, () => {
  hold(kd.a, { shove: true });
  kd.step();
  hold(kd.a, {});
});
const downTicks = shoveStates.get("knocked") || 0;
const riseTicks = shoveStates.get("rising") || 0;
console.log(`    shove onto a reeling man      knocked ${downTicks} ticks, rising ${riseTicks} ticks`);
console.log(`    states seen                   ${[...shoveStates.keys()].join(", ")}`);
kd.sim.stop();

check("a man can be put on the ground: 'knocked' is a real state a fight reaches",
  downTicks > 0, downTicks ? `${downTicks} ticks down` : "NOT A STATE — nothing in the sim ever reads 'knocked'");
check("being down costs real time, and not so much it is a death sentence",
  downTicks * 50 >= 400 && downTicks * 50 <= 1400, `${downTicks * 50} ms down (want 400-1400)`);
check("getting up is its own state, long enough to be a decision",
  riseTicks * 50 >= 300 && riseTicks * 50 <= 1000, `${riseTicks * 50} ms rising (want 300-1000)`);
check("a stagger is shorter than a knockdown — they are two different punishments",
  staggerTicks > 0 && downTicks + riseTicks > staggerTicks,
  `stagger ${staggerTicks * 50} ms vs down+rise ${(downTicks + riseTicks) * 50} ms`);

// A MAN ON THE FLOOR DOES NOT STEER.
//
// This gate exists because the fix that added the floor did not add it to
// `integrateMovement`'s `committed` set — the list of states in which a body is
// spent and steers for nobody (attacking, dodging, staggered, shoving). A
// knocked man holding W therefore walked across the arena on his back at full
// stride, which no number in this file could see: every other assertion here
// measures a duration or a displacement CAUSED BY A BLOW, and this is travel
// under his own power during one.
//
// It is the same shape as the four mirrored-definition faults PROCESS.md
// records: a new member of a set, and a second list of that set nobody updated.
console.log("\n  THE FLOOR TAKES THE LEGS");
{
  const d = duel({ attacker: "berserker", target: "warden", gap: 1.2 });
  d.B.state = "staggered"; d.B.staggerTimer = 0.4;
  hold(d.a, { shove: true });
  d.step();
  hold(d.a, {});
  // Down him, then hold FULL FORWARD on the man who is down for the whole fall.
  //
  // MEASURED ON `moveVel`, NOT ON DISTANCE, and the first cut of this gate got
  // that wrong in the way rule 3 warns about. It waited for the shove's impulse
  // to bleed off before it started measuring travel — but the slide decays over
  // 1.40 s and the whole fall lasts 1.30 s, so the measurement window never
  // opened, `travelled` stayed at its initial 0, and the gate went green over
  // the live defect. The engine already splits the two channels exactly:
  // `moveVel` is stride and `impulse` is the burst. Ask the stride channel.
  let stride = 0, sawDown = false;
  for (let i = 0; i < 60; i++) {
    hold(d.b, { moveX: 0, moveZ: 1, rotationY: 0 });
    hold(d.a, {});
    d.step();
    if (isDown(d.B)) {
      sawDown = true;
      stride = Math.max(stride, Math.hypot(d.B.moveVel.x, d.B.moveVel.z));
    } else if (sawDown) break;
  }
  console.log(`    peak stride while down, holding full forward     ${stride.toFixed(3)} u/s`);
  check("a man on the floor does not steer — the fall takes his legs, not only his turn",
    sawDown && stride < 0.15,
    sawDown ? `${stride.toFixed(3)} u/s of stride while knocked (a warden walks at 4.5)` : "he was never floored — fixture broken");
  d.sim.stop();
}

// ------------------------------------------------------------- 4. parry window
//
// SWEPT, not read. The guard goes up N ticks before contact for every N and we
// keep the set of N that parried.
console.log("\n  PARRY WINDOW (swept: guard raised N ticks before contact)");
const parried = [];
for (let n = 0; n <= 8; n++) {
  const d = duel({ attacker: "huscarl", target: "huscarl", gap: 1.2 });
  const r = throwBlow(d, { heavy: false, blockAt: n, holdBlock: true });
  if (r.hitType === "parry") parried.push(n);
  d.sim.stop();
}
const windowTicks = parried.length;
console.log(`    parried when the guard rose ${parried.length ? parried.join(", ") : "(never)"} tick(s) early`);
console.log(`    window ${windowTicks} tick(s) = ${windowTicks * 50} ms at 20 Hz`);

check("a parry is a timed act with a real window", windowTicks > 0, `${windowTicks} ticks`);
check("the window survives 50 ms quantisation — at least 2 ticks wide, so one tick of jitter does not eat it",
  windowTicks >= 2, `${windowTicks} ticks = ${windowTicks * 50} ms`);
check("the window is not a held state — a guard raised long before contact does NOT parry",
  !parried.includes(8), `raising 8 ticks (400 ms) early parried: ${parried.includes(8)}`);

// ---------------------------------------------------------- 5. riposte and bonus
//
// The whole point, in the owner's words: "there needs to be a window to
// capitalise on the party too so you can attack & do more damage because of the
// parry". Two blows, identical in every way except that one lands inside the
// window the parry opened. The bonus is the ratio between them.
console.log("\n  RIPOSTE");

/** Land a parry, then measure how long the opening lasts and what it is worth. */
function riposte() {
  const d = duel({ attacker: "huscarl", target: "huscarl", gap: 1.2 });
  const { A, B, a, b, step } = d;
  // B parries A. A is the parried man; B is the parrier and owns the riposte.
  const r = throwBlow(d, { heavy: false, blockAt: 1, holdBlock: true });
  if (r.hitType !== "parry") { d.sim.stop(); return { ok: false }; }
  const parryEvent = r.hit;

  // How long does the wire say the parried man is open? Read from the SNAPSHOT,
  // because a window only exists if it is replicated — a window the server keeps
  // to itself cannot be seen, played around, or drawn.
  let openTicks = 0;
  const snap = () => a.snapshot?.players?.[A.id];
  for (let i = 0; i < 60; i++) {
    const s = snap();
    if (s && (s.vulnerableTimer ?? 0) > 0) openTicks++;
    else if (openTicks > 0) break;
    hold(a, {}); hold(b, {});
    step();
  }

  // Now the damage. Same blow, same man, same zone — once inside the window and
  // once well outside it.
  const inside = (() => {
    const dd = duel({ attacker: "huscarl", target: "huscarl", gap: 1.2 });
    const p = throwBlow(dd, { heavy: false, blockAt: 1, holdBlock: true });
    if (p.hitType !== "parry") { dd.sim.stop(); return null; }
    // The parrier (B) now swings at the parried man (A). Roles reverse, so the
    // blow is thrown by B: drive it by hand rather than through throwBlow.
    dd.A.staggerTimer = 99;                       // hold him still to be hit
    dd.A.state = "staggered";
    dd.B.rotation = Math.PI; dd.B.aimYaw = Math.PI;
    const before = dd.b.got("hit").length;
    for (let i = 0; i < 60; i++) {
      hold(dd.b, { attack: true, rotationY: Math.PI });
      hold(dd.a, {});
      dd.step();
      if (dd.b.got("hit").length > before) break;
    }
    const h = dd.b.got("hit").slice(before)[0];
    dd.sim.stop();
    return h || null;
  })();

  const outside = (() => {
    const dd = duel({ attacker: "huscarl", target: "huscarl", gap: 1.2 });
    dd.A.staggerTimer = 99; dd.A.state = "staggered";
    dd.B.rotation = Math.PI; dd.B.aimYaw = Math.PI;
    const before = dd.b.got("hit").length;
    for (let i = 0; i < 60; i++) {
      hold(dd.b, { attack: true, rotationY: Math.PI });
      hold(dd.a, {});
      dd.step();
      if (dd.b.got("hit").length > before) break;
    }
    const h = dd.b.got("hit").slice(before)[0];
    dd.sim.stop();
    return h || null;
  })();

  d.sim.stop();
  return { ok: true, openTicks, inside, outside, parryEvent };
}

const rip = riposte();
if (!rip.ok) {
  check("a parry can be landed at all", false, "the sweep found no parry to build a riposte on");
} else {
  const bonus = rip.inside && rip.outside && rip.outside.damage > 0
    ? rip.inside.damage / rip.outside.damage : 1;
  console.log(`    window on the wire            ${rip.openTicks} ticks = ${rip.openTicks * 50} ms`);
  console.log(`    riposte blow inside window    ${rip.inside ? rip.inside.damage : "-"} dmg (${rip.inside ? rip.inside.type : "-"})`);
  console.log(`    identical blow outside it     ${rip.outside ? rip.outside.damage : "-"} dmg (${rip.outside ? rip.outside.type : "-"})`);
  console.log(`    bonus                         x${bonus.toFixed(2)}`);

  check("a parry opens a window on the man who was parried, and it is ON THE WIRE",
    rip.openTicks > 0, rip.openTicks ? `${rip.openTicks * 50} ms replicated` : "no replicated window — nothing to see or play around");
  check("the riposte window is long enough to act on at 20 Hz (>=300 ms)",
    rip.openTicks * 50 >= 300, `${rip.openTicks * 50} ms`);
  check("the riposte window closes — it is a window, not a debuff",
    rip.openTicks * 50 <= 1500, `${rip.openTicks * 50} ms`);
  check("a blow inside the window does more damage than the same blow outside it",
    bonus >= 1.25, `x${bonus.toFixed(2)} (want >= 1.25)`);
  check("the wire NAMES the riposte, so a client can sound and draw it",
    Boolean(rip.inside && rip.inside.riposte), `hit.riposte = ${rip.inside ? JSON.stringify(rip.inside.riposte) : "(no hit)"}`);
  // Owned here rather than in protocoltest, which watches a room of bots and
  // would have been green whenever the dice dealt no parry at all.
  check("the parry message itself publishes the window it opened, in seconds",
    Number.isFinite(rip.parryEvent?.window) && rip.parryEvent.window > 0,
    `parry hit.window = ${JSON.stringify(rip.parryEvent?.window)}`);
}

// --------------------------------------------- 6. the window a player can SEE
//
// `docs/DESIGN-SYSTEM.md` §3 puts the parry tell on the OPPONENT's brackets for
// the window's real duration. That is a CLIENT rule, and this file cannot open
// a browser — but it can gate the two server-side preconditions without which
// the client rule is undrawable, and both of them are things a refactor could
// silently take away:
//
//   1. The window is on the PARRIED man, not on the parrier. If it were written
//      onto the parrier, the tell would light his own brackets — a bar on your
//      own HUD, which is the thing the rule forbids.
//   2. It names WHO collects. Without `vulnerableTo` the client cannot tell "I
//      earned this" from "somebody across the ring earned this", and would
//      light the mark for every player watching.
console.log("\n  THE WINDOW A PLAYER CAN SEE");
{
  const d = duel({ attacker: "huscarl", target: "huscarl", gap: 1.2 });
  const r = throwBlow(d, { heavy: false, blockAt: 1, holdBlock: true });
  const parried = d.a.snapshot?.players?.[d.A.id];      // the man who was read
  const parrier = d.a.snapshot?.players?.[d.B.id];      // the man who read him
  console.log(`    parried man   vulnerableTimer ${parried?.vulnerableTimer?.toFixed(2)}  vulnerableTo ${parried?.vulnerableTo === d.B.id ? "the parrier" : JSON.stringify(parried?.vulnerableTo)}`);
  console.log(`    parrier       vulnerableTimer ${parrier?.vulnerableTimer?.toFixed(2)}`);
  check("the window is written on the man who was PARRIED, not on the man who parried",
    r.hitType === "parry" && (parried?.vulnerableTimer ?? 0) > 0 && (parrier?.vulnerableTimer ?? 0) === 0,
    `parried ${parried?.vulnerableTimer?.toFixed(2)}s, parrier ${parrier?.vulnerableTimer?.toFixed(2)}s`
    + " — the tell lights HIS brackets, so it must live on HIM");
  check("the window names the one man who collects it",
    parried?.vulnerableTo === d.B.id,
    `vulnerableTo = ${parried?.vulnerableTo === d.B.id ? "the parrier's id" : JSON.stringify(parried?.vulnerableTo)}`);
  d.sim.stop();
}

// A third man's blow must NOT cash somebody else's parry. If it did, the mark
// on screen would be a lie to everyone but the man who earned it.
{
  const d = duel({ attacker: "huscarl", target: "huscarl", gap: 1.2 });
  const r = throwBlow(d, { heavy: false, blockAt: 1, holdBlock: true });
  // A is the parried man, B the parrier. Give the window to a stranger's id and
  // check B's own blow stops being a riposte — the id is the whole gate.
  d.A.vulnerableTo = "somebody-else";
  d.A.staggerTimer = 99; d.A.state = "staggered";
  d.B.rotation = Math.PI; d.B.aimYaw = Math.PI;
  const before = d.b.got("hit").length;
  for (let i = 0; i < 60; i++) {
    hold(d.b, { attack: true, rotationY: Math.PI });
    hold(d.a, {});
    d.step();
    if (d.b.got("hit").length > before) break;
  }
  const h = d.b.got("hit").slice(before)[0];
  console.log(`    a window owed to somebody else   ${h ? `${h.damage} dmg, riposte=${h.riposte}` : "(no blow landed)"}`);
  check("a window owed to another man is not the parrier's to cash",
    r.hitType === "parry" && !!h && h.riposte === false,
    h ? `riposte=${h.riposte}, ${h.damage} dmg` : "no blow landed — fixture broken");
  d.sim.stop();
}

// ----------------------------------------------------------------- the verdict
const passed = results.filter((r) => r.pass).length;
const line = `\n[weightprobe] ${passed}/${results.length} passed`
  + (deferrals.length ? ` — WITH ${deferrals.length} thing(s) measured and NOT gated, which is a deferral and not a clean sheet` : "");
console.log(line);
for (const d of deferrals) console.log(`  DEFERRED: ${d}`);
if (!REPORT_ONLY && passed !== results.length) process.exit(1);
