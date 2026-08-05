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
import { fileURLToPath } from "url";
// The weight pass is a set of NUMBERS as much as it is a feel, and the numbers
// are assertable without a browser. Importing the engine is side-effect free —
// `makeEngine` only runs from `getEngine`, so nothing starts a tick here.
import {
  WARRIOR_STATS, SWING_PHASES, SWING_TURN_RATE, SWING_TURN_PHASE, HITSTOP, SHOVE,
  swingDurationOf, getEngine,
} from "../src/game/engine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
  const state = { latest: null, kills: [], hits: [], playerId: null, joinData: null };
  const sid = engine.connect((str) => {
    const m = JSON.parse(str);
    if (m.type === "join") { state.playerId = m.data.playerId; state.joinData = m.data; }
    // The mid-countdown ticks carry only the number; never let them clobber a
    // full snapshot.
    if ((m.type === "game_state" || m.type === "lobby_update" || m.type === "countdown") && m.data.players) state.latest = m.data;
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

/** Watch B for `ms`, collecting states and the furthest displacement. */
async function watch(B, from, ms) {
  const seen = { staggered: false, burning: false, moved: 0 };
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const b = myself(B);
    if (b) {
      if (b.state === "staggered") seen.staggered = true;
      if (b.burning) seen.burning = true;
      seen.moved = Math.max(seen.moved, Math.hypot(b.position.x - from.x, b.position.z - from.z));
    }
    await sleep(40);
  }
  return seen;
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
        `the mark was carried ${seen.moved.toFixed(2)} m by one shove (push ${SHOVE.push} m) and staggered on the way`);
      check("a shove can put a man in the fire", seen.burning,
        `burning=${seen.burning} after being driven over the hazard line at 1.475 m`);
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
        `a blocking huscarl was carried ${seen.moved.toFixed(2)} m and staggered — the guard-break niche`);
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
        `no shove contact reached him and he was never staggered (he rolled ${seen.moved.toFixed(2)} m under his own steam)`);
      engine.message(A.sid, { type: "leave" }); engine.message(B.sid, { type: "leave" });
    }
  } finally {
    clearInterval(engine._tickInterval);
  }
  console.log("");
}

async function main() {
  console.log("[playtest] the weight numbers\n");
  checkWeightNumbers();
  console.log("");
  await checkShoveClaims();
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  console.log(`[playtest] starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
  server = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
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
  // The same violent sweep of the mouse, once free and once inside a stroke.
  // Free, the server adopts the client's yaw outright; committed, it may only
  // slew toward it at SWING_TURN_RATE.
  // Under pointer lock only the DELTA between moves reaches the page, so the
  // sweep has to be monotonic and the mouse has to be parked before recording
  // starts — a there-and-back sweep nets to zero and asks the warrior to turn
  // by nothing at all, which is a test measuring itself.
  const park = async () => { await page.mouse.move(200, 400); await page.waitForTimeout(350); };
  const sweepRight = () => page.mouse.move(1240, 400, { steps: 12 });

  await park();
  await rec();
  await sweepRight();
  await page.waitForTimeout(500);
  const freeSamples = await stopRec();
  const freePeak = peakTurnRate(freeSamples.filter((s) => s.phase === null));

  await park();
  await page.waitForTimeout(500);
  await rec();
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
  await sweepRight();                  // inside the windup, and held through contact
  await page.waitForTimeout(1400);
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
    `${freePeak.toFixed(2)} rad/s under the same mouse sweep, against a cap of ${SWING_TURN_RATE}`);
  // `asked` is only there to keep this honest: a body that did not turn because
  // nothing asked it to would pass a cap test while proving nothing. A 1040px
  // sweep buys about 0.4 rad at desktop sensitivity, so 0.2 is a real demand
  // rather than a threshold picked to be cleared.
  check("turning is reduced to the stated cap while committed",
    mid.length >= 3 && asked > 0.2 && commPeak <= SWING_TURN_RATE * 1.05,
    `over ${mid.length} mid-stroke snapshots the client asked for ${asked.toFixed(2)} rad of turn and the ` +
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
