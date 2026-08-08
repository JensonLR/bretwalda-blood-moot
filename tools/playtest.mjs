#!/usr/bin/env node
// ============================================================
// PLAYTEST — drives a real desktop session and measures whether
// the controls actually do anything.
//
//   npm run playtest
//
// Boots the app, walks the landing -> training -> fight flow in a
// real browser, then presses keys and mouse buttons and checks the
// server's authoritative response. It taps the game WebSocket from
// inside the page, so it needs no debug hooks in app code.
//
// Exits non-zero if any control fails to produce its effect.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
// THE FIXED DIE, BEFORE THE ENGINE. This import has to come first and has to
// stay first: it replaces Math.random, and the engine below reads the die at
// call time but the ORDER is what guarantees no module-scope roll escapes it.
// See tools/seeddie.mjs for what it buys and what it deliberately does not.
// The same file is handed to the spawned server with `--import`, so the engine
// this process drives and the engine the browser talks to roll one stream.
import "./seeddie.mjs";
// The weight pass is a set of NUMBERS as much as it is a feel, and the numbers
// are assertable without a browser. Importing the engine is side-effect free —
// `makeEngine` only runs from `getEngine`, so nothing starts a tick here.
import {
  WARRIOR_STATS, SWING_PHASES, SWING_TURN_RATE, SWING_TURN_PHASE, HITSTOP, SHOVE,
  swingDurationOf, getEngine,
} from "../src/game/engine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** The fixed die, handed to the server process with `--import`. See seeddie.mjs. */
const SEED_DIE = pathToFileURL(resolve(ROOT, "tools/seeddie.mjs")).href;
const PORT = parseInt(process.env.PORT || String(3800 + (process.pid % 150)), 10);
const HEADED = process.argv.includes("--headed");

let server;
function waitForServer(url, timeoutMs = 180000) {
  const started = Date.now();
  return new Promise((ok, fail) => {
    const poll = async () => {
      try { const r = await fetch(url); if (r.ok || r.status === 404) return ok(); } catch { /* wait */ }
      if (Date.now() - started > timeoutMs) return fail(new Error(`server never came up at ${url}`));
      setTimeout(poll, 700);
    };
    poll();
  });
}

// Records every game message in both directions so we can measure the
// real input rate and read the server's authoritative player state.
const PROBE = () => {
  const w = window;
  w.__probe = { sent: [], lastState: null, states: 0, opened: false, rec: null };
  const RealWS = window.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (String(url).includes("/ws")) {
      w.__probe.opened = true;
      const send = ws.send.bind(ws);
      ws.send = (data) => {
        try {
          const m = JSON.parse(data);
          if (m.type === "input") w.__probe.sent.push({ t: performance.now(), d: m.data });
        } catch { /* ignore */ }
        return send(data);
      };
      ws.addEventListener("message", (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === "game_state" || m.type === "countdown") {
            w.__probe.states++;
            w.__probe.lastState = m.data;
            // The swing recorder. Every snapshot while recording, stamped with
            // the SERVER's own clock — a stalled main thread can delay when a
            // message is read but it cannot change the matchTimer inside it, so
            // a turn RATE computed from these is the simulation's, not the box's.
            if (w.__probe.rec) {
              const mine = Object.values(m.data.players || {}).find((p) => !String(p.id).startsWith("bot_"));
              // `aim` is the yaw the CLIENT last asked for, paired with the
              // rotation the server actually gave him. During a swing those two
              // are supposed to come apart — that gap is the whole of commitment
              // — so both have to be recorded or the cap cannot be told apart
              // from a client that simply stopped asking.
              const last = w.__probe.sent[w.__probe.sent.length - 1];
              if (mine) w.__probe.rec.push({
                t: m.data.matchTimer, cls: mine.warriorClass, state: mine.state,
                rot: mine.rotation, phase: mine.attackPhase ?? null,
                swingT: mine.swingT ?? 0, dur: mine.swingDuration ?? 0,
                heavy: !!mine.swingHeavy, hitstop: mine.hitstop ?? null,
                aim: last ? last.d.rotationY : null,
              });
            }
          }
        } catch { /* ignore */ }
      });
    }
    return ws;
  }
  TappedWS.prototype = RealWS.prototype;
  Object.assign(TappedWS, RealWS);
  w.WebSocket = TappedWS;
};

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const wrapPi = (a) => { let r = a; while (r > Math.PI) r -= Math.PI * 2; while (r < -Math.PI) r += Math.PI * 2; return r; };

// Fastest the body actually turned, in rad/s, over a run of snapshots — using
// the server's matchTimer as the clock, so it is the simulation's rate.
function peakTurnRate(samples) {
  let peak = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    if (dt <= 1e-6) continue;
    peak = Math.max(peak, Math.abs(wrapPi(samples[i].rot - samples[i - 1].rot)) / dt);
  }
  return peak;
}

// ---- the weight numbers, asserted off the engine itself ----
// None of this needs a browser: the shares, the per-class seconds and the turn
// cap are constants the simulation is built from, and a browser can only ever
// confirm that the same constants reached the wire.
function checkWeightNumbers() {
  const { windup, contact, recovery } = SWING_PHASES;
  check("a swing is split windup/contact/recovery 0.40/0.15/0.45",
    near(windup, 0.40) && near(contact, 0.15) && near(recovery, 0.45) &&
    near(windup + contact + recovery, 1) && recovery > windup && windup > contact,
    `${windup}/${contact}/${recovery}, sum ${(windup + contact + recovery).toFixed(3)}; recovery is the largest share`);

  // Each class's stroke, in seconds, against those shares.
  let sharesHold = true;
  const rows = [];
  for (const cls of ["runekeeper", "warden", "huscarl", "berserker"]) {
    const total = swingDurationOf(cls, false);
    const w = total * windup, c = total * contact, r = total * recovery;
    if (!near(w / total, windup, 1e-12) || !near(c / total, contact, 1e-12) ||
        !near(r / total, recovery, 1e-12) || !near(w + c + r, total, 1e-9)) sharesHold = false;
    rows.push(`${cls} ${total.toFixed(2)}s = ${w.toFixed(3)}+${c.toFixed(3)}+${r.toFixed(3)}`);
  }
  check("every class's windup, contact and recovery are those shares of its own stroke",
    sharesHold, rows.join("; "));

  // The runekeeper is the class this pass could break, so the ratio it is
  // balanced on is asserted rather than asserted-about. A common multiplier
  // means every relative number survives; anything that pulled the classes
  // together would show up here first.
  const rk = WARRIOR_STATS.runekeeper.attackSpeed, bz = WARRIOR_STATS.berserker.attackSpeed;
  const dps = (c) => WARRIOR_STATS[c].attackDamage / WARRIOR_STATS[c].attackSpeed;
  const orderKept = dps("runekeeper") > dps("warden") && dps("warden") > dps("berserker") &&
    dps("berserker") > dps("huscarl");
  check("the fast class stayed fast relative to the field",
    Math.abs(bz / rk - 2.294) < 0.02 && orderKept,
    `berserker/runekeeper stroke ${(bz / rk).toFixed(3)}x (was 0.78/0.34 = 2.294x); light dps ` +
    ["runekeeper", "warden", "berserker", "huscarl"].map((c) => `${c} ${dps(c).toFixed(1)}`).join(" > "));

  // Turning under commitment. A free warrior adopts the client's yaw outright —
  // 180 degrees in one message — so the reduction is stated as the absolute cap
  // and totalled over the shortest stroke in the game.
  const rkTotal = swingDurationOf("runekeeper", false);
  const allowed = rkTotal * (windup * SWING_TURN_PHASE.windup + contact * SWING_TURN_PHASE.contact +
    recovery * SWING_TURN_PHASE.recovery) * SWING_TURN_RATE;
  check("turning is capped to the stated rate for the whole of a swing",
    near(SWING_TURN_RATE, 1.8) && near(SWING_TURN_PHASE.windup, 1.0) &&
    near(SWING_TURN_PHASE.contact, 0.25) && near(SWING_TURN_PHASE.recovery, 0.6) &&
    Math.abs(allowed - 0.739) < 0.002,
    `${SWING_TURN_RATE} rad/s x windup 1.0 / contact 0.25 / recovery 0.6; a whole runekeeper ` +
    `light allows ${allowed.toFixed(3)} rad = ${(allowed * 180 / Math.PI).toFixed(1)} deg, against 180 deg free`);

  check("hitstop is a real freeze on both fighters",
    near(HITSTOP.light, 0.06) && near(HITSTOP.heavy, 0.11) && HITSTOP.heavy > HITSTOP.light,
    `light ${HITSTOP.light}s (${(HITSTOP.light * 60).toFixed(1)} frames at 60Hz), heavy ${HITSTOP.heavy}s ` +
    `(${(HITSTOP.heavy * 60).toFixed(1)} frames); applied to attacker and target alike`);
}

// ---- the shove, proved on the REAL engine ----
// Same discipline as firetest: `getEngine()` is the singleton the servers hand
// the sockets to, already ticking on its own interval, and every number below
// is read out of a packet. Two humans in a blood-moot room, because the shove's
// four claims are about what happens BETWEEN two men — a shove displaces, a
// shove into the fire is the shover's kill, a shield does not stop it, a dodge
// does — and none of them can be reached from a browser without scripting two.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(cond, what, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = cond();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(40);
  }
}

function shoveSession(engine, name) {
  const state = {
    latest: null, matchEnd: null, kills: [], hits: [], playerId: null, joinData: null,
    // THE LATCH. Armed by `watch`, filled here — where every packet is
    // eventually read — instead of from a poll. A stagger's whole life is
    // SHOVE.stagger seconds and this box can sit on the event loop for most of
    // one, so a 40 ms `setTimeout` loop is not a sampler of it: it is a
    // lottery over whether the loop woke inside the window. touchtest learned
    // exactly this about the shove and latched it; the same reasoning applies
    // to every one of these four observations, and this is the last place in
    // either harness that was still racing a poll against a state change.
    //
    // `watch` cannot miss a packet now no matter how badly the box behaves,
    // because it is not the one doing the looking.
    latch: null,
  };
  const sid = engine.connect((str) => {
    const m = JSON.parse(str);
    if (m.type === "join") { state.playerId = m.data.playerId; state.joinData = m.data; }
    // The mid-countdown ticks carry only the number; never let them clobber a
    // full snapshot.
    // round_end carries a full room snapshot too, and it is the one that says
    // "finished" — the summary checks read the loser's corpse out of it.
    if ((m.type === "game_state" || m.type === "lobby_update" || m.type === "countdown" || m.type === "round_end") && m.data.players) {
      state.latest = m.data;
      const L = state.latch;
      const me = L && m.data.players[state.playerId];
      if (me) {
        if (me.state === "staggered") L.staggered = true;
        if (me.burning) L.burning = true;
        L.moved = Math.max(L.moved, Math.hypot(me.position.x - L.from.x, me.position.z - L.from.z));
        L.packets++;
      }
    }
    if (m.type === "match_end") state.matchEnd = m.data;
    if (m.type === "kill") state.kills.push(m.data);
    if (m.type === "hit") state.hits.push(m.data);
  });
  return { sid, state, name };
}

const myself = (s) => s.state.latest?.players?.[s.state.playerId] ?? null;

/**
 * Held input, resent every 50 ms the way the render loop does it. The throttle
 * eases off inside the last stride and a half — a full-stick arrival slides
 * MOVE_STOP_TAU's worth past the mark after the input stops, which against a
 * hazard line at 1.475 m and a shove range of 1.7 m is the difference between
 * a measurement and a flake.
 */
async function walkNear(engine, s, targetOf, stopWithin = 0.25, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const me = myself(s);
    if (!me || me.state === "dead") return me;
    const [tx, tz] = targetOf();
    const dx = tx - me.position.x, dz = tz - me.position.z;
    const d = Math.hypot(dx, dz);
    if (d < stopWithin) return me;
    const th = Math.min(1, d / 1.5);
    engine.message(s.sid, { type: "input", data: {
      moveX: (dx / d) * th, moveZ: (dz / d) * th, rotationY: Math.atan2(dx, dz), sprint: false,
      attack: false, heavyAttack: false, block: false, dodge: false, shove: false, attackDir: "right",
    } });
    await sleep(50);
  }
  return myself(s);
}

/** Create + join one two-man room and fight it. A is host and shover. */
async function startDuel(engine, bClass) {
  const A = shoveSession(engine, "Shover");
  engine.message(A.sid, { type: "create", data: { name: "Shover", mode: "blood_moot", bestOf: 1 } });
  await until(() => A.state.joinData, "host join");
  const B = shoveSession(engine, "Mark");
  engine.message(B.sid, { type: "join", data: { code: A.state.joinData.code } });
  await until(() => B.state.joinData, "second join");
  if (bClass) engine.message(B.sid, { type: "select_class", data: { warriorClass: bClass } });
  engine.message(A.sid, { type: "start", data: {} });
  await until(() => A.state.latest?.state === "fighting" && myself(A) && myself(B), "the fight", 20000);
  // Spawn invincibility answers blows and shoves alike; wait it out.
  await sleep(2300);
  return { A, B };
}

/** One shove from A at B, from `gap` metres along B's outward line `dir`. */
async function throwShove(engine, A, B, dir, gap) {
  const b = myself(B);
  await walkNear(engine, A, () => {
    const t = myself(B).position;
    return [t.x + dir[0] * gap, t.z + dir[1] * gap];
  });
  const a = myself(A), t = myself(B);
  const yaw = Math.atan2(t.position.x - a.position.x, t.position.z - a.position.z);
  engine.message(A.sid, { type: "input", data: {
    moveX: 0, moveZ: 0, rotationY: yaw, sprint: false, attack: false, heavyAttack: false,
    block: false, dodge: false, shove: true, attackDir: "right",
  } });
  return { from: { x: b.position.x, z: b.position.z } };
}

/**
 * Watch B for a stretch of the SIMULATION, collecting states and the furthest
 * displacement — every packet of it, latched in the session's own reader.
 *
 * The window is counted in TICKS, not in milliseconds. `ms` names the stretch
 * of fight the claim is about and is converted at the engine's fixed 20 Hz, so
 * "1.2 s of shove" is 24 snapshots whether the box delivered them in 1.2 s or,
 * on a bad afternoon, in four. The old wall-clock window let a stalled event
 * loop end the watch after nine packets and then report `staggered=false`
 * about a stagger that had not been sent yet: one channel — elapsed time —
 * was carrying two orthogonal facts, how much fight had happened and how
 * busy the box was. Now it carries only the first.
 *
 * A wall-clock ceiling of six times the nominal window is still there so a
 * genuinely dead engine fails as a timeout rather than as a hang.
 */
async function watch(B, from, ms) {
  const want = Math.round((ms / 1000) * 20);
  const latch = { staggered: false, burning: false, moved: 0, from, packets: 0 };
  B.state.latch = latch;
  const ceiling = Date.now() + Math.max(4000, ms * 6);
  while (latch.packets < want && Date.now() < ceiling) await sleep(20);
  B.state.latch = null;
  return latch;
}

async function checkShoveClaims() {
  console.log("[playtest] the shove, on the live engine\n");
  check("the shove's numbers are the stated ones",
    near(SHOVE.windup, 0.30) && near(SHOVE.recover, 0.35) && near(SHOVE.range, 1.7) &&
    near(SHOVE.stamina, 25) && near(SHOVE.push, 2.2) && near(SHOVE.cooldown, 1.5),
    `windup ${SHOVE.windup}s (readable, like the weight pass), recover ${SHOVE.recover}s, range ${SHOVE.range} m, ` +
    `cost ${SHOVE.stamina} stamina (a heavy is 22), push ${SHOVE.push} m, stagger ${SHOVE.stagger}s, cooldown ${SHOVE.cooldown}s`);

  const engine = getEngine();
  try {
    // ---- displacement, and the fire kill with the shover's name on it ----
    // The mark is a runekeeper (90 hp): the burn credit window is 5 s and the
    // fire kills at 22/s, so the frailest class is the one that provably dies
    // inside the window it was shoved in.
    {
      const { A, B } = await startDuel(engine, "runekeeper");
      // B stands most of a metre off the hazard line — burning only because he
      // was PUT there is the claim — and A stands directly outboard of him, so
      // the push line runs straight through the hearth.
      await walkNear(engine, B, () => [0, 2.35]);
      await sleep(700);   // let the stride bleed off so the push is the push
      const b0 = myself(B).position;
      const r0 = Math.hypot(b0.x, b0.z) || 1;
      const { from } = await throwShove(engine, A, B, [b0.x / r0, b0.z / r0], 1.3);
      await until(() => A.state.hits.some((h) => h.type === "shove" && h.targetId === B.state.playerId), "the shove to land", 3000);
      const seen = await watch(B, from, 1200);
      check("a shove displaces its target", seen.moved > 1.2 && seen.staggered,
        `the mark was carried ${seen.moved.toFixed(2)} m by one shove (push ${SHOVE.push} m) and staggered on the way, over ${seen.packets} snapshots of fight`);
      check("a shove can put a man in the fire", seen.burning,
        `burning=${seen.burning} after being driven over the hazard line at 1.475 m, watched for ${seen.packets} snapshots`);
      const kill = await until(() => A.state.kills.find((k) => k.victimId === B.state.playerId), "the burn death", 9000);
      const feed = A.state.latest?.killFeed?.slice(-1)[0];
      check("the fire kill is credited to the SHOVER, cause fire",
        kill.cause === "fire" && kill.killerId === A.state.playerId && feed?.killer === A.state.playerId,
        `kill: cause=${kill.cause}, killer=${JSON.stringify(kill.killerName)}; feed credits ${JSON.stringify(feed?.killerName)} (no blow was ever struck)`);
      engine.message(A.sid, { type: "leave" }); engine.message(B.sid, { type: "leave" });
    }

    // ---- a raised shield does not stop it ----
    {
      const { A, B } = await startDuel(engine, "huscarl");
      await walkNear(engine, B, () => [0, -5]);
      // Guard up and held: resent every 50 ms so the intent cannot lapse.
      const holdBlock = setInterval(() => {
        const b = myself(B);
        if (b) engine.message(B.sid, { type: "input", data: {
          moveX: 0, moveZ: 0, rotationY: b.rotation, sprint: false, attack: false,
          heavyAttack: false, block: true, dodge: false, shove: false, attackDir: "right",
        } });
      }, 50);
      await until(() => myself(B).state === "blocking", "the guard to rise", 3000);
      const { from } = await throwShove(engine, A, B, [0, 1], 1.3);
      await until(() => A.state.hits.some((h) => h.type === "shove" && h.targetId === B.state.playerId), "the shove to land", 3000);
      clearInterval(holdBlock);
      const seen = await watch(B, from, 1000);
      check("a raised shield does not stop a shove", seen.moved > 1.2 && seen.staggered,
        `a blocking huscarl was carried ${seen.moved.toFixed(2)} m and staggered over ${seen.packets} snapshots — the guard-break niche`);
      engine.message(A.sid, { type: "leave" }); engine.message(B.sid, { type: "leave" });
    }

    // ---- a dodge beats it ----
    {
      const { A, B } = await startDuel(engine, "warden");
      await walkNear(engine, B, () => [0, -5]);
      await throwShove(engine, A, B, [0, 1], 1.3);
      // Roll the moment the windup shows on the wire: the i-frames then cover
      // the contact 0.30 s after the press.
      await until(() => myself(A).state === "shoving", "the windup", 2000);
      const b = myself(B);
      engine.message(B.sid, { type: "input", data: {
        moveX: 0, moveZ: -1, rotationY: b.rotation, sprint: false, attack: false,
        heavyAttack: false, block: false, dodge: true, shove: false, attackDir: "right",
      } });
      const seen = await watch(B, { x: b.position.x, z: b.position.z }, 1200);
      const shoved = A.state.hits.some((h) => h.type === "shove" && h.targetId === B.state.playerId);
      check("a dodging man is not shoved", !shoved && !seen.staggered && myself(B).lastHitBy !== A.state.playerId,
        `no shove contact reached him and he was never staggered across all ${seen.packets} snapshots watched (he rolled ${seen.moved.toFixed(2)} m under his own steam)`);
      engine.message(A.sid, { type: "leave" }); engine.message(B.sid, { type: "leave" });
    }
  } finally {
    // The engine singleton's tick is cleared by main() once EVERY engine-level
    // suite is done — checkSummaryShapes shares the instance with this one.
  }
  console.log("");
}

/**
 * The end of a match, in every room shape the summary stage has to survive.
 *
 * render/summary.ts stages whatever `match_end` and the final room snapshot
 * say, so what is asserted here is exactly the contract that module reads: a
 * duel's verdict names its man and the loser is still DEAD in the snapshot the
 * stage freezes; a war band's verdict names a SIDE and no man (winnerId null
 * is the shape that broke naive readers before — see roundScoreBy's history);
 * a man who left before the end is in neither the results nor the room; the
 * ten-second rollback really does stand every corpse up and clear every ready
 * flag — which is both the reason the stage clones its records and the edge
 * FIGHT AGAIN parks its intent on; and training never produces a verdict at
 * all, so the summary never mounts over it.
 */
async function checkSummaryShapes() {
  console.log("[playtest] the match's end, in every room shape the summary stages\n");
  const engine = getEngine();

  // The fire is the harness's executioner: no aim, no swing timing, and it
  // kills the frailest class in 4.1 s flat. The classes that walk in are
  // always runekeepers for that reason. It has to be a KEEPER, not one walk to
  // a mark: a stride's momentum (MOVE_STOP_TAU) carries the man through the
  // hearth and out the far side, where the linger goes out and he stands at
  // 2 m on 60 hp — so he is steered back at the middle until the fire has him.
  const intoTheFire = async (s) => {
    const end = Date.now() + 45000;
    while (Date.now() < end) {
      const me = myself(s);
      if (me?.state === "dead") return me;
      if (me) {
        const d = Math.hypot(me.position.x, me.position.z);
        if (d >= 0.6) {
          engine.message(s.sid, { type: "input", data: {
            moveX: -me.position.x / d, moveZ: -me.position.z / d,
            rotationY: Math.atan2(-me.position.x, -me.position.z), sprint: false,
            attack: false, heavyAttack: false, block: false, dodge: false, shove: false, attackDir: "right",
          } });
        }
      }
      await sleep(50);
    }
    throw new Error("the fire never took him");
  };

  // ---- the duel: a named victor, and a corpse that stays down ----
  {
    const { A, B } = await startDuel(engine, "runekeeper");
    await intoTheFire(B);
    const verdict = await until(() => A.state.matchEnd, "the duel's verdict", 8000);
    check("a duel's verdict names the victor by id",
      verdict.winnerKind === "player" && verdict.winnerId === A.state.playerId && verdict.winnerTeam === null,
      `winnerKind=${verdict.winnerKind}, winnerId is ${verdict.winnerName}, both men in the results (${verdict.results.length})`);
    const loser = A.state.latest?.players?.[B.state.playerId];
    check("the loser is still DEAD in the snapshot the stage freezes",
      A.state.latest?.state === "finished" && loser?.state === "dead",
      `room=${A.state.latest?.state}, loser.state=${loser?.state} — the corpse the duel tableau is posed over`);
    // The rollback is the threat the stage clones its records against.
    const lobby = await until(() => A.state.latest?.state === "lobby" && A.state.latest, "the rollback to the lobby", 14000);
    const men = Object.values(lobby.players);
    check("the ten-second rollback stands the room up and clears every ready flag",
      men.length === 2 && men.every((p) => p.state === "idle" && !p.ready),
      `states [${men.map((p) => p.state)}], ready [${men.map((p) => !!p.ready)}] — FIGHT AGAIN parks its intent on this clearing`);
    engine.message(A.sid, { type: "leave" }); engine.message(B.sid, { type: "leave" });
  }

  // ---- the war band: the win belongs to a side, not a man ----
  {
    const A = shoveSession(engine, "RedMan");
    engine.message(A.sid, { type: "create", data: { name: "RedMan", mode: "war_band", bestOf: 1 } });
    await until(() => A.state.joinData, "host join");
    const B = shoveSession(engine, "BlueMan");
    engine.message(B.sid, { type: "join", data: { code: A.state.joinData.code } });
    await until(() => B.state.joinData, "second join");
    engine.message(A.sid, { type: "select_team", data: { team: "red" } });
    engine.message(B.sid, { type: "select_team", data: { team: "blue" } });
    engine.message(B.sid, { type: "select_class", data: { warriorClass: "runekeeper" } });
    engine.message(A.sid, { type: "start", data: {} });
    await until(() => A.state.latest?.state === "fighting" && myself(A) && myself(B), "the fight", 20000);
    await sleep(2300);
    await intoTheFire(B);
    const verdict = await until(() => A.state.matchEnd, "the war band's verdict", 8000);
    check("a war band's verdict names a SIDE and no man",
      verdict.winnerKind === "team" && verdict.winnerId === null && verdict.winnerTeam === "red"
        && verdict.roundScoreBy === "team"
        && verdict.results.find((r) => r.id === A.state.playerId)?.isWinner === true,
      `winnerKind=${verdict.winnerKind}, winnerId=${JSON.stringify(verdict.winnerId)}, winnerTeam=${verdict.winnerTeam} — the stage leads the wall with the side's best`);
    engine.message(A.sid, { type: "leave" }); engine.message(B.sid, { type: "leave" });
  }

  // ---- the moot, with a man gone before the end ----
  {
    const A = shoveSession(engine, "Host");
    engine.message(A.sid, { type: "create", data: { name: "Host", mode: "blood_moot", bestOf: 1 } });
    await until(() => A.state.joinData, "host join");
    const B = shoveSession(engine, "Second");
    engine.message(B.sid, { type: "join", data: { code: A.state.joinData.code } });
    const C = shoveSession(engine, "Leaver");
    engine.message(C.sid, { type: "join", data: { code: A.state.joinData.code } });
    await until(() => B.state.joinData && C.state.joinData, "the moot to fill");
    engine.message(B.sid, { type: "select_class", data: { warriorClass: "runekeeper" } });
    engine.message(A.sid, { type: "start", data: {} });
    await until(() => A.state.latest?.state === "fighting" && myself(A) && myself(B) && myself(C), "the fight", 20000);
    await sleep(2300);
    engine.message(C.sid, { type: "leave" });
    await intoTheFire(B);
    const verdict = await until(() => A.state.matchEnd, "the moot's verdict", 8000);
    const ids = verdict.results.map((r) => r.id);
    check("a man who left is in neither the results nor the room the stage reads",
      verdict.winnerKind === "player" && verdict.winnerId === A.state.playerId
        && ids.length === 2 && !ids.includes(C.state.playerId)
        && !A.state.latest?.players?.[C.state.playerId],
      `results [${verdict.results.map((r) => r.name).join(", ")}] — the stage stands up who is actually here, not who the table remembers`);
    engine.message(A.sid, { type: "leave" }); engine.message(B.sid, { type: "leave" });
  }

  // ---- training: no verdict, ever ----
  {
    const T = shoveSession(engine, "Trainee");
    engine.message(T.sid, { type: "solo", data: { name: "Trainee", warriorClass: "runekeeper", botCount: 1, difficulty: "recruit" } });
    await until(() => T.state.joinData, "the training ground");
    await until(() => T.state.latest?.state === "fighting" && myself(T), "training to open", 20000);
    await sleep(2300);
    await intoTheFire(T);
    await sleep(4000);
    check("training has no verdict — a death there ends nobody's match",
      !T.state.matchEnd && T.state.latest?.state === "fighting",
      `after dying in the fire: match_end ${T.state.matchEnd ? "SENT" : "never sent"}, room still ${T.state.latest?.state}`);
    engine.message(T.sid, { type: "leave" });
  }
  console.log("");
}

/**
 * Two lobby messages that were reachable mid-fight, and both were exploits.
 *
 * The economy has been cheat-tested since the shop existed — `cheattest` proves
 * the server refuses a client that claims gold. Nothing ever asked the same
 * question of the MATCH, so `select_class` re-rolled health to the class
 * maximum at any moment (an unlimited self-heal) and `select_team` wrote any
 * string at all (a team of one turns off friendly fire, and `checkRoundEnd`
 * counts only red and blue so the round can never resolve).
 *
 * Both are now refused outside `lobby` and `intermission`. These checks fail on
 * the geometry that shipped — that is the point of them.
 */
async function checkMatchStateGuards() {
  console.log("[playtest] the lobby messages, sent mid-fight\n");
  const engine = getEngine();
  const { A, B } = await startDuel(engine);

  // Wound him on the ENGINE's own player, not on the snapshot. `myself()` reads
  // `state.latest`, which is a serialized copy the server sent — writing to it
  // changes nothing and the check would then measure a wound that never
  // happened. That is the fourth time in this project a test has been about to
  // measure the wrong quantity, and the first time it was caught before it
  // shipped rather than after.
  const room = [...engine._rooms.values()].find((r) => r.players.has(B.state.playerId));
  const live = room.players.get(B.state.playerId);
  const hurt = Math.max(1, Math.round(live.maxHealth * 0.6));
  live.health = hurt;

  engine.message(B.sid, { type: "select_class", data: { warriorClass: "warden" } });
  await sleep(200);
  check(
    "a class change mid-fight does not refill the man who sent it",
    live.health <= hurt,
    `health ${hurt} -> ${live.health.toFixed(1)} of ${live.maxHealth}, room ${room.state}`,
  );

  const teamBefore = myself(B).team;
  engine.message(B.sid, { type: "select_team", data: { team: "PWNED" } });
  await sleep(200);
  check(
    "the server refuses a side that does not exist",
    myself(B).team === teamBefore && myself(B).team !== "PWNED",
    `team stayed ${myself(B).team}`,
  );

  engine.message(B.sid, { type: "select_team", data: { team: "red" } });
  await sleep(200);
  check(
    "and refuses even a real side once the fighting has started",
    myself(B).team === teamBefore,
    `team stayed ${myself(B).team}`,
  );
  console.log("");
}

async function main() {
  console.log("[playtest] the weight numbers\n");
  checkWeightNumbers();
  console.log("");
  try {
    await checkMatchStateGuards();
    await checkShoveClaims();
    await checkSummaryShapes();
  } finally {
    // One clear for every engine-level suite: they share the singleton, and a
    // live tick interval would hold the process open after a failure.
    clearInterval(getEngine()._tickInterval);
  }
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  console.log(`[playtest] starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
  // Same fixed die the in-process engine above got, so the browser's opponents
  // are as reproducible as the scripted ones. See tools/seeddie.mjs.
  server = spawn("node", ["--import", SEED_DIE, useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);

  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    headless: !HEADED,
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[page-error] ${e}`));

  // Pinned low: this box has no GPU, and the control path is what is under
  // test here, not the renderer. tools/perf.mjs measures the frame cost.
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });

  // ---- reach the fight ----
  // An empty ring, deliberately: with an opponent in it the AI can kill the
  // test warrior mid-run, and a corpse neither moves nor spends stamina, so
  // half the assertions fail for a reason that has nothing to do with input.
  const reachFight = async () => {
    await page.getByText("Training", { exact: false }).first().click();
    await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
    const fewer = page.getByLabel("Fewer AI warriors");
    for (let i = 0; i < 8 && await fewer.isEnabled().catch(() => false); i++) {
      await fewer.click();
    }
    await page.getByText("DRAW STEEL", { exact: false }).first().click();
    await page.waitForFunction(() => window.__probe?.lastState?.state === "fighting", null, { timeout: 60000 });
  };
  await reachFight();
  console.log("[playtest] in a fight\n");

  // Reads the warrior out of a snapshot STRICTLY NEWER than `afterSeq`.
  // Without that guard this box lies: the full post chain on a software
  // rasteriser blocks the main thread for most of a second, so two reads taken
  // 1.3 s apart can land on the same packet and every displacement measures
  // exactly 0.00 — which reads as "movement is broken" when it is only "the
  // page has not had a moment to process a socket message".
  const me = async (afterSeq = -1) => page.evaluate(async (seq) => {
    const deadline = performance.now() + 15000;
    while (window.__probe.states <= seq && performance.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    const s = window.__probe.lastState;
    if (!s) return null;
    // The local warrior is the only non-bot in a solo room.
    const mine = Object.values(s.players).find((p) => !String(p.id).startsWith("bot_"));
    return mine && {
      x: mine.position.x, z: mine.position.z, hp: mine.health,
      stam: mine.stamina, state: mine.state, rot: mine.rotation,
      seq: window.__probe.states, fresh: window.__probe.states > seq,
    };
  }, afterSeq);
  const seq = () => page.evaluate(() => window.__probe.states);

  const canvas = page.locator("canvas");
  await canvas.click({ position: { x: 640, y: 400 } }); // focus + pointer lock
  await page.waitForTimeout(400);

  // ---- 1. input rate: does every rendered frame's input reach the wire? ----
  await page.evaluate(() => { window.__probe.sent.length = 0; });
  await page.waitForTimeout(1000);
  const rate = await page.evaluate(() => window.__probe.sent.length);
  check("input reaches the server at a usable rate", rate >= 45,
    `${rate} input msgs/sec (render loop samples ~60/sec; <45 means samples are being dropped)`);

  // ---- 2. WASD actually moves the warrior ----
  // PHYSICAL codes, not characters. The game binds `event.code` (docs/KEYBINDS.md)
  // so that the WASD *positions* work on AZERTY, Dvorak and Colemak, where those
  // same keys produce different characters. "KeyW" is what Playwright calls the
  // physical key; sending "w" would only test one layout's character.
  const before = await me();
  const s0 = await seq();
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1200);
  const after = await me(s0);
  await page.keyboard.up("KeyW");
  const dist = Math.hypot(after.x - before.x, after.z - before.z);
  // A warden walks 4.5 u/s, so ~1.2s of held W should cover well over 3 units.
  check("W moves the warrior", dist > 0.4, `travelled ${dist.toFixed(2)} units in 1.2s held`);
  check("W moves at a believable speed", dist > 3.0,
    `travelled ${dist.toFixed(2)} units; expected >3.0 for a 4.5 u/s walk`);

  // ---- 3. strafe ----
  const b2 = await me();
  const s1 = await seq();
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(900);
  const a2 = await me(s1);
  await page.keyboard.up("KeyD");
  check("D strafes", Math.hypot(a2.x - b2.x, a2.z - b2.z) > 0.4,
    `travelled ${Math.hypot(a2.x - b2.x, a2.z - b2.z).toFixed(2)} units`);

  // ---- 4. attack costs stamina (proves the action reached the sim) ----
  const b3 = await me();
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  const a3 = await me();
  const sawAttack = await page.evaluate(() => window.__probe.sent.some((s) => s.d.attack === true));
  check("left click sends an attack", sawAttack, "");
  check("attack registers in the sim", a3.stam < b3.stam || a3.state === "attacking",
    `stamina ${b3.stam.toFixed(1)} -> ${a3.stam.toFixed(1)}`);

  // ---- 5. dodge ----
  await page.waitForTimeout(900);
  const b4 = await me();
  const s2 = await seq();
  await page.keyboard.press("Space");
  // Three packets, not one. A dodge has to clear the 16ms input timer and then
  // a 50ms server tick before it can appear in a snapshot, so the first packet
  // after the press is usually still pre-dodge — and the dodge state only lasts
  // 0.35s, so reading one packet early and one late both miss it.
  const a4 = await me(s2 + 2);
  check("space dodges", a4.stam < b4.stam - 5 || a4.state === "dodging",
    `stamina ${b4.stam.toFixed(1)} -> ${a4.stam.toFixed(1)}, state=${a4.state}`);

  // ---- 6. block ----
  await page.waitForTimeout(600);
  const s3 = await seq();
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(450);
  // Needs the same staleness guard as the dodge, for the same reason: a bare
  // me() returns whichever packet last arrived, and on a stalled main thread
  // that can predate the press entirely and report idle while the block is
  // genuinely live. Reading one packet past the press keeps the assertion
  // ("the sim says blocking") intact while removing the race that flakes it.
  const a5 = await me(s3 + 1);
  await page.mouse.up({ button: "right" });
  check("right click blocks", a5.state === "blocking", `state=${a5.state}`);

  // ---- 6b. the shove key ----
  // The mechanics are proven on the engine above; this is only that the default
  // desktop binding reaches the wire and the sim answers it. Wind first: the
  // shove costs 25 and the tests above it have been spending.
  await page.waitForFunction(() => {
    const s = window.__probe.lastState;
    if (!s) return false;
    const m = Object.values(s.players).find((p) => !String(p.id).startsWith("bot_"));
    return !!m && m.stamina > 60 && m.state !== "attacking";
  }, null, { timeout: 20000 });
  const b6b = await me();
  const s3b = await seq();
  await page.keyboard.press("KeyF");
  const a6b = await me(s3b + 2);
  const sawShove = await page.evaluate(() => window.__probe.sent.some((s) => s.d.shove === true));
  check("F sends a shove and the sim answers it", sawShove && (a6b.state === "shoving" || a6b.stam < b6b.stam - 15),
    `shove:true ${sawShove ? "reached the wire" : "never sent"}; stamina ${b6b.stam.toFixed(1)} -> ${a6b.stam.toFixed(1)}, state=${a6b.state}`);
  await page.waitForTimeout(800);

  // ---- 7. mouse look ----
  const b6 = await me();
  await page.mouse.move(640, 400);
  await page.mouse.move(980, 400, { steps: 24 });
  await page.waitForTimeout(300);
  const a6 = await me();
  const locked = await page.evaluate(() => document.pointerLockElement !== null);
  check("mouse turns the camera", Math.abs(a6.rot - b6.rot) > 0.05,
    `rotation ${b6.rot.toFixed(2)} -> ${a6.rot.toFixed(2)} (pointerLock=${locked})`);

  // ---- 8. the swing arrives on the wire in three phases ----
  // Three strokes pooled, not one. A snapshot is one per server WAKE rather than
  // one per step, so on a starved box a wake can cover three steps at once and a
  // contact band only 0.128 s wide can fall between two packets. Three swings
  // make that a vanishing coincidence rather than a coin flip, and every sample
  // is still checked against its own swingT whichever phases turn up.
  const rec = () => page.evaluate(() => { window.__probe.rec = []; });
  const stopRec = () => page.evaluate(() => { const r = window.__probe.rec || []; window.__probe.rec = null; return r; });

  await page.waitForTimeout(700);
  await rec();
  for (let i = 0; i < 3; i++) {
    await page.mouse.down();
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(1300);
  }
  const swung = await stopRec();
  const inSwing = swung.filter((s) => s.phase !== null);
  const cls = inSwing.length ? inSwing[0].cls : "warden";
  const nominal = WARRIOR_STATS[cls]?.attackSpeed ?? 0;

  // The assertion the whole pass turns on: for every snapshot taken mid-stroke,
  // the phase the server named agrees with where swingT actually is against the
  // 0.40 / 0.55 boundaries. A phase table that drifted from the shares — or a
  // hit resolved anywhere but the windup/contact boundary — fails here.
  const bandOf = (t) => (t < SWING_PHASES.windup ? "windup"
    : t < SWING_PHASES.windup + SWING_PHASES.contact ? "contact" : "recovery");
  const wrong = inSwing.filter((s) => s.phase !== bandOf(s.swingT));
  check("each phase occupies its stated share of the swing on the wire",
    inSwing.length >= 6 && wrong.length === 0,
    `${inSwing.length} mid-stroke snapshots over 3 ${cls} swings, ${wrong.length} disagreed with ` +
    `swingT against the 0.40/0.55 boundaries` +
    (wrong.length ? ` (e.g. swingT=${wrong[0].swingT.toFixed(3)} called ${wrong[0].phase})` : ""));

  const seen = new Set(inSwing.map((s) => s.phase));
  check("windup, contact and recovery all reach the client",
    seen.has("windup") && seen.has("contact") && seen.has("recovery"),
    `saw ${[...seen].join(", ") || "nothing"}`);

  check("the wire carries the stroke's own length and its hitstop",
    inSwing.length > 0 && Math.abs(inSwing[0].dur - nominal) < 1e-6 &&
    inSwing.every((s) => typeof s.hitstop === "number" && s.hitstop >= 0),
    `swingDuration ${inSwing.length ? inSwing[0].dur : "?"}s against ${cls}'s stated ${nominal}s; ` +
    `hitstop present on every snapshot`);

  // ---- 9. commitment: the body cannot chase the aim mid-swing ----
  // The same violent sweep of look, once free and once inside a stroke. Free,
  // the server adopts the client's yaw outright; committed, it may only slew
  // toward it at SWING_TURN_RATE.
  //
  // WHY THE SWEEP IS DISPATCHED FROM INSIDE THE PAGE, AND NOT WITH page.mouse.
  // It used to be `page.mouse.move(1240, 400, {steps: 12})` fired straight
  // after the click, on the reasoning that twelve interpolated moves land
  // inside an 0.85 s warden stroke. On this box they do not, and this is the
  // whole of the bug that left the assertion red for days. Measured: each CDP
  // move waits on a main thread that a software rasteriser blocks in ~5 s
  // chunks, so the twelve steps took **40 s** end to end and the FIRST of them
  // arrived 23 ms AFTER the stroke had already finished:
  //   sweep 67799..107866 ms (40067 ms) — mousemove at 68554, 74346, 79408, …
  //   swing ran 67761..68531
  // Nothing asked the committed body to turn, so it did not turn, so there was
  // nothing to cap and the check reported `client asked 0.00 rad`. The cap
  // itself was never broken — this was a delivery fault in the harness, of the
  // same family as the lock-facing flake: the demand and the window it was
  // supposed to fall in had come apart.
  //
  // A sweep synthesised in the page cannot come apart from the stroke, because
  // it is GATED ON THE STROKE: it polls the server's own attackPhase and only
  // dispatches while the man is committed. It runs on the page's clock, costs
  // no CDP round trip, and enters the game through the identical path a real
  // mouse takes — canvas 'mousemove' -> movementX -> mouseDelta -> rig.look ->
  // routeLook -> rig.yaw -> sampleInput's rotationY -> the wire. The one thing
  // it does not exercise is Chromium's own event synthesis under pointer lock,
  // and check 7 above ("mouse turns the camera") still drives that with a real
  // page.mouse.move, so that path keeps its own witness.
  //
  // 12 x 44 px at the desktop gain of 0.0048 rad/px is 2.53 rad of demand. The
  // cap can deliver at most 0.85 s x (0.40x1.0 + 0.15x0.25 + 0.45x0.6) x 1.8 =
  // 1.08 rad over a whole warden stroke, so the demand provably exceeds what
  // the cap allows — which is what makes the cap the thing under test rather
  // than the sweep.
  const SWEEP_PX = 44;
  const SWEEP_STEPS = 12;
  const sweepLook = (gateOnStroke) => page.evaluate(([px, steps, gate]) => new Promise((done) => {
    const cv = document.querySelector("canvas");
    if (!cv) return done({ sent: 0, why: "no canvas" });
    const mine = () => {
      const s = window.__probe.lastState;
      if (!s) return null;
      return Object.values(s.players || {}).find((p) => !String(p.id).startsWith("bot_")) || null;
    };
    let sent = 0, waited = 0, startedAt = -1;
    // PACED BY SNAPSHOTS, NOT BY setTimeout — and this is the second half of
    // the same bug the block above describes.
    //
    // The first fix moved the sweep off `page.mouse` and into the page, which
    // removed the CDP round trip. It still spread the twelve steps over
    // `setTimeout(tick, 15)`, so delivery was paced by the MAIN THREAD while
    // `asked` is summed between SERVER SNAPSHOTS. Those are two different
    // clocks, and under load they diverge: run this harness beside four others
    // on one box and the timer starves while the socket keeps delivering, so
    // the recorder sees a full 16-snapshot stroke and the sweep gets 6 of 12
    // steps out. Measured exactly that way — `1.06 rad (6/12 steps, the stroke
    // ended first)` — on a green build that scored 12/12 and 2.53 rad when run
    // alone. A gate whose verdict depends on what else is running is not a gate.
    //
    // So the sweep is clocked by the thing it is measured against: the
    // recorder's own snapshot count. Two steps per snapshot arriving puts all
    // twelve out over six of a warden stroke's seventeen. If the thread stalls
    // and four snapshots land unobserved, the next run dispatches the eight it
    // owes rather than losing them — starvation delays the demand, it no longer
    // shrinks it.
    const recLen = () => (window.__probe.rec ? window.__probe.rec.length : 0);
    const tick = () => {
      const m = mine();
      // The server's own word for "committed", not a clock this side of the
      // wire: a stroke that started late still gets the whole sweep.
      const committed = !!m && m.attackPhase !== null && m.attackPhase !== undefined;
      if (!gate || committed) {
        if (startedAt < 0) startedAt = recLen();
        // Owed, not "one per tick": the arrears are what survive a stall.
        let owe = Math.max(1, (recLen() - startedAt) * 2) - sent;
        // Past the half-way point of the stroke, everything still owed goes out
        // at once. The server slews toward the last yaw it was told on its own
        // fixed step, so a demand that arrives whole and is then HELD exercises
        // the cap exactly as a moving one does — and this is what guarantees
        // the full 2.53 rad reaches the wire inside the window even if every
        // frame before now was dropped.
        // `swingDuration`, which is what the wire calls it — the recorder above
        // renames it to `dur` when it stores a sample, and reading that name
        // here would be `undefined > 0`, i.e. a burst that never fires and a
        // safety net that silently is not there.
        if (m && m.swingDuration > 0 && m.swingT / m.swingDuration > 0.5) owe = steps - sent;
        for (let i = 0; i < owe && sent < steps; i++, sent++) {
          cv.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, movementX: px, movementY: 0 }));
        }
      } else if (++waited > (sent === 0 ? 400 : 60)) {
        // Two different failures, named apart, because they mean different
        // things: nothing to sweep during, versus a stroke that ended before
        // the sweep had finished asking. Both leave `asked` short and both are
        // meant to fail the check rather than quietly halve the demand.
        return done({ sent, why: sent === 0 ? "the stroke never started" : "the stroke ended first" });
      }
      if (sent >= steps) return done({ sent, why: "complete" });
      setTimeout(tick, 8);
    };
    tick();
  }), [SWEEP_PX, SWEEP_STEPS, gateOnStroke]);

  await page.waitForTimeout(500);
  await rec();
  const freeInfo = await sweepLook(false);
  await page.waitForTimeout(600);
  const freeSamples = await stopRec();
  const freePeak = peakTurnRate(freeSamples.filter((s) => s.phase === null));

  await page.waitForTimeout(800);
  await rec();
  // ARMED BEFORE THE CLICK. The poller is already running when the stroke
  // opens, so it catches it in the windup — where the phase multiplier is 1.0
  // and the cap is at its full 1.8 rad/s — instead of whenever a CDP call
  // happens to return.
  const sweeping = sweepLook(true);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
  const commInfo = await sweeping;
  await page.waitForTimeout(1500);
  const commSamples = await stopRec();
  const mid = commSamples.filter((s) => s.phase !== null);
  const commPeak = peakTurnRate(mid);
  // How far the CLIENT's aim travelled over the same snapshots. This is what
  // stops the cap assertion being vacuous: a body that did not turn because
  // nothing asked it to would prove nothing at all.
  let asked = 0;
  for (let i = 1; i < mid.length; i++) {
    if (mid[i].aim === null || mid[i - 1].aim === null) continue;
    asked += Math.abs(wrapPi(mid[i].aim - mid[i - 1].aim));
  }
  const turned = mid.length > 1 ? Math.abs(wrapPi(mid[mid.length - 1].rot - mid[0].rot)) : 0;

  check("free turning is faster than the committed cap", freePeak > SWING_TURN_RATE,
    `${freePeak.toFixed(2)} rad/s under the same sweep (${freeInfo.sent}/${SWEEP_STEPS} steps, ${freeInfo.why}), ` +
    `against a cap of ${SWING_TURN_RATE}`);
  // Three teeth, and the first two are what keep this from measuring itself.
  //   `asked` — the demand actually reached the wire DURING the stroke. Below
  //     1.5 rad the sweep missed its window and the run proves nothing; it is
  //     set above the 1.08 rad the cap can deliver over a whole warden stroke,
  //     so a passing run is one where the cap had to bind.
  //   `turned < asked * 0.7` — the body demonstrably did NOT follow the aim.
  //     Lift the cap in advanceSwing and the body adopts the yaw outright, so
  //     `turned` climbs to meet `asked` and this fails on its own, without
  //     relying on the rate arithmetic below.
  //   `commPeak` — and it never went faster than 1.8 rad/s while it did so.
  check("turning is reduced to the stated cap while committed",
    mid.length >= 3 && asked > 1.5 && turned < asked * 0.7 && commPeak <= SWING_TURN_RATE * 1.05,
    `over ${mid.length} mid-stroke snapshots the client asked for ${asked.toFixed(2)} rad of turn ` +
    `(${commInfo.sent}/${SWEEP_STEPS} steps, ${commInfo.why}) and the ` +
    `body delivered ${turned.toFixed(2)} rad, peaking at ${commPeak.toFixed(2)} rad/s against ${SWING_TURN_RATE} ` +
    `allowed — the same sweep taken free ran at ${freePeak.toFixed(1)} rad/s`);

  // ---- 10. a remap actually takes ----
  // The whole hotkeys feature stated as a test. Storing a binding proves
  // nothing; what matters is that the NEW key reaches the server as the action
  // and the OLD key no longer does. Forward is moved off KeyW onto KeyT, which
  // nothing else uses, and the table is seeded through the same store the
  // settings screen writes (localStorage `bretwalda.bindings`, which is also
  // the no-database fallback for the profile) and picked up on the next boot.
  const remapped = {
    forward: ["KeyT"], back: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"],
    sprint: ["ShiftLeft", "ShiftRight"], dodge: ["Space"],
    crouch: ["ControlLeft", "ControlRight"], attack: ["Mouse0"],
    heavy: ["KeyE", "KeyV"], block: ["Mouse2"], ability: ["KeyQ"],
  };
  await page.evaluate(([k, v]) => window.localStorage.setItem(k, v),
    ["bretwalda.bindings", JSON.stringify(remapped)]);
  await page.reload({ waitUntil: "domcontentloaded" });
  await reachFight();
  await canvas.click({ position: { x: 640, y: 400 } });
  await page.waitForTimeout(400);
  console.log("[playtest] rebound forward: KeyW -> KeyT\n");

  const b7 = await me();
  const s4 = await seq();
  await page.keyboard.down("KeyT");
  await page.waitForTimeout(1200);
  const a7 = await me(s4);
  await page.keyboard.up("KeyT");
  const newDist = Math.hypot(a7.x - b7.x, a7.z - b7.z);
  check("the rebound key moves the warrior", newDist > 3.0,
    `KeyT travelled ${newDist.toFixed(2)} units; expected >3.0 for a 4.5 u/s walk`);

  await page.waitForTimeout(300);
  const b8 = await me();
  const s5 = await seq();
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(1200);
  const a8 = await me(s5);
  await page.keyboard.up("KeyW");
  const oldDist = Math.hypot(a8.x - b8.x, a8.z - b8.z);
  check("the old key no longer moves the warrior", oldDist < 0.4,
    `KeyW travelled ${oldDist.toFixed(2)} units after being unbound; expected <0.4`);

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n[playtest] ${results.length - failed.length}/${results.length} controls working`);
  if (failed.length) {
    console.log("[playtest] BROKEN: " + failed.map((f) => f.name).join(", "));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error("[playtest] failed:", e); process.exitCode = 1; })
  .finally(() => { if (server && !server.killed) server.kill("SIGTERM"); });
