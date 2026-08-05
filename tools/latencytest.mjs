#!/usr/bin/env node
// ============================================================
// LATENCYTEST — the three things that feel like a bad frame rate
//
//   node tools/latencytest.mjs            # everything
//   node tools/latencytest.mjs tick       # server tick regularity
//   node tools/latencytest.mjs judder     # client interpolation trace
//   node tools/latencytest.mjs input      # end-to-end input latency
//   node tools/latencytest.mjs live       # the production server
//
// WHY THIS EXISTS. The owner said "the frame rate feels laggy". Three
// different faults feel exactly like that and only one of them is the
// renderer:
//
//   (a) the renderer is slow             — measured elsewhere
//   (b) input latency                    — you press, the man moves late
//   (c) judder                           — 20 discrete steps a second under a
//                                          60 Hz display reads as stutter even
//                                          at a perfect frame rate
//
// THIS BOX HAS NO GPU. It rasterises through SwiftShader at roughly 1 fps, so
// no frames-per-second number measured here means anything as an absolute.
// Everything below is deliberately chosen to be GPU-free: event-loop timing,
// wire timing, and the interpolation MATH driven at a synthetic 60 Hz on the
// CPU. Where a number cannot be honestly obtained on this box the harness says
// so out loud rather than printing a plausible one.
// ============================================================
import { performance } from "node:perf_hooks";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// statistics
// ---------------------------------------------------------------------------
export function pct(sorted, p) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

export function stats(values) {
  const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return {
    n: v.length,
    min: v[0],
    p50: pct(v, 50),
    p95: pct(v, 95),
    p99: pct(v, 99),
    max: v[v.length - 1],
    mean,
    sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length),
  };
}

export const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "  n/a");

export function row(label, s, unit = "ms") {
  if (!s) return `  ${label.padEnd(30)}  no samples`;
  return `  ${label.padEnd(30)}  n=${String(s.n).padStart(5)}  p50=${f2(s.p50).padStart(7)}  p95=${f2(s.p95).padStart(7)}  p99=${f2(s.p99).padStart(7)}  max=${f2(s.max).padStart(8)}  ${unit}`;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===========================================================================
// 1. SERVER TICK REGULARITY
// ===========================================================================
// engine.mjs runs its clock on `setInterval(gameTick, 50)`. setInterval is
// "no sooner than", not a clock. The engine compensates by owing itself steps
// against performance.now() — so the SIMULATION rate is protected — but the
// BROADCAST rate is one packet per wake regardless (engine.mjs:2209). A wake
// that slips to 80 ms therefore ships 80 ms-old state to the client, and the
// client has nothing newer to draw. That is felt as lag and no renderer fix
// touches it.
//
// Measured in-process: the harness shares the event loop with the engine,
// which is exactly the condition custom-server.mjs runs it in.
async function runTick({ seconds = 12 } = {}) {
  const { getEngine } = await import(`${ROOT}/src/game/engine.mjs`);
  const engine = getEngine();
  const out = [];
  const log = (s) => { console.log(s); out.push(s); };

  log("");
  log("=== 1. SERVER TICK REGULARITY (engine.mjs, in-process, no browser) ===");
  log(`    nominal step 50.00 ms (TICK_RATE=20).  ${seconds}s per scenario.`);
  log("");

  // A room of eight: one session, seven bots, autoStart.
  function openMatch() {
    const rec = { gaps: [], last: 0, timer: [], firstT: 0, lastT: 0, firstMT: 0, lastMT: 0, states: 0 };
    const sid = engine.connect((str) => {
      let m; try { m = JSON.parse(str); } catch { return; }
      if (m.type !== "game_state") return;
      const now = performance.now();
      const mt = m.data?.matchTimer;
      if (typeof mt !== "number") return;
      if (rec.last) rec.gaps.push(now - rec.last);
      else { rec.firstT = now; rec.firstMT = mt; }
      rec.last = now; rec.lastT = now; rec.lastMT = mt; rec.states++;
    });
    engine.message(sid, { type: "solo", data: { name: "probe", botCount: 7, difficulty: "warrior", autoStart: true } });
    return { sid, rec };
  }

  // Held W, resent at 20 Hz the way the client does, so the bots and the
  // player are all actually moving and colliding rather than standing still.
  function drive(handles) {
    return setInterval(() => {
      for (const h of handles) {
        engine.message(h.sid, {
          type: "input",
          data: { moveX: 0, moveZ: 1, rotationY: Math.sin(performance.now() / 900) * Math.PI, sprint: true, action: null },
        });
      }
    }, 50);
  }

  // A control timer on the same event loop at the same period. This is what
  // the engine's own setInterval is subject to, and it is the only way to see
  // the idle case (an idle engine broadcasts nothing).
  function controlTimer(bucket) {
    let last = performance.now();
    return setInterval(() => {
      const now = performance.now();
      bucket.push(now - last);
      last = now;
    }, 50);
  }

  const scenarios = [];

  async function scenario(name, rooms, neighbour) {
    const handles = [];
    for (let i = 0; i < rooms; i++) handles.push(openMatch());
    if (rooms) await sleep(6200);           // countdown is 5 s + 0.8 s autostart delay
    const ctl = [];
    const ct = controlTimer(ctl);
    const dr = rooms ? drive(handles) : null;
    for (const h of handles) { h.rec.gaps.length = 0; h.rec.last = 0; h.rec.states = 0; }
    let hog = null;
    if (neighbour) hog = startNeighbour(neighbour);
    await sleep(seconds * 1000);
    clearInterval(ct);
    if (dr) clearInterval(dr);
    if (hog) hog.stop();

    const gaps = handles.flatMap((h) => h.rec.gaps);
    // Sim drift: the simulation clock the client is told about (matchTimer)
    // against the wall clock over the same window.
    let drift = null;
    if (handles.length) {
      const h = handles[0].rec;
      const wall = (h.lastT - h.firstT) / 1000;
      const sim = h.lastMT - h.firstMT;
      if (wall > 1) drift = { wall, sim, ppm: ((sim - wall) / wall) * 1e6 };
    }
    const s = { name, rooms, control: stats(ctl), broadcast: stats(gaps), drift, packets: handles.reduce((a, h) => a + h.rec.states, 0) };
    scenarios.push(s);
    for (const h of handles) engine.disconnectSession(h.sid);
    await sleep(400);
    return s;
  }

  // A CPU neighbour: N child processes spinning. Render's free tier is
  // heavily shared CPU; this is the local stand-in for it, and it is also
  // exactly what a Next.js render or a GC pause does to this loop.
  function startNeighbour(n) {
    const kids = [];
    for (let i = 0; i < n; i++) {
      const { spawn } = requireChild();
      kids.push(spawn(process.execPath, ["-e", "const t=Date.now();while(Date.now()-t<600000){Math.sqrt(Math.random()*1e9)}"], { stdio: "ignore" }));
    }
    return { stop: () => kids.forEach((k) => { try { k.kill("SIGKILL"); } catch { /* gone */ } }) };
  }
  function requireChild() { return childProcess; }

  const s0 = await scenario("idle (engine up, no match)", 0, 0);
  log(row("idle          event-loop wake", s0.control));

  const s1 = await scenario("one 8-man match", 1, 0);
  log(row("1 match       event-loop wake", s1.control));
  log(row("1 match       broadcast gap", s1.broadcast));

  const s4 = await scenario("four 8-man matches", 4, 0);
  log(row("4 matches     event-loop wake", s4.control));
  log(row("4 matches     broadcast gap", s4.broadcast));

  const sN = await scenario("four matches + 4 CPU neighbours", 4, 4);
  log(row("4 + neighbour event-loop wake", sN.control));
  log(row("4 + neighbour broadcast gap", sN.broadcast));

  log("");
  log("  simulation clock against wall clock (matchTimer vs performance.now):");
  for (const s of scenarios) {
    if (!s.drift) { log(`    ${s.name.padEnd(34)} n/a (no match)`); continue; }
    log(`    ${s.name.padEnd(34)} wall=${s.drift.wall.toFixed(3)}s sim=${s.drift.sim.toFixed(3)}s  drift=${(s.drift.sim - s.drift.wall) * 1000 >= 0 ? "+" : ""}${((s.drift.sim - s.drift.wall) * 1000).toFixed(1)}ms (${s.drift.ppm.toFixed(0)} ppm)`);
  }
  log("");

  clearInterval(engine._tickInterval);
  return { scenarios, text: out.join("\n") };
}

const childProcess = await import("node:child_process");

// ===========================================================================
// 4. JUDDER — does the client's smoothing actually smooth?
// ===========================================================================
// The wire is 20 Hz. The display is 60 Hz (or 120 on a modern phone). Between
// packets the client has to invent motion, and anim.ts says it does:
// `stepWarriorTransform` extrapolates 80 ms down the velocity vector and lerps
// the render position toward it (anim.ts:1420), and rotation eases with
// `min(1, dt*14)` (anim.ts:1478).
//
// This cannot be measured through the renderer on this box — SwiftShader gives
// about one frame a second, so a rAF trace here samples the interpolator at
// 1 Hz and says nothing about 60 Hz judder. So the REAL function is bundled
// out of anim.ts and driven on the CPU with a synthetic 60 Hz frame clock and
// a synthetic 20 Hz packet stream. No GPU is involved and none is needed: the
// quantity under test is arithmetic.
//
// Smooth motion = even steps: constant velocity, near-zero acceleration.
// A staircase or a per-packet catch-up hitch shows up as periodic acceleration
// spikes at the packet rate.
async function loadAnim() {
  const esbuild = await import("esbuild");
  const outfile = `${process.env.SCRATCH || "/tmp"}/anim.bundle.mjs`;
  const stub = {
    name: "stub-input",
    setup(build) {
      build.onResolve({ filter: /(^|\/)input$/ }, () => ({ path: "stub:input", namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: "export const getHandedness = () => 'right'; export const subscribeHandedness = () => () => {};",
        loader: "js",
      }));
    },
  };
  await esbuild.build({
    entryPoints: [`${ROOT}/src/game/client/render/anim.ts`],
    bundle: true, format: "esm", platform: "neutral", outfile,
    plugins: [stub], logLevel: "silent", target: "node20",
  });
  return import(outfile);
}

// One trace: a warrior walking a dead-straight line at a constant speed, with
// the server's snapshots delivered on a chosen cadence and the client stepped
// on a chosen frame clock.
function traceWalk(anim, THREE, {
  fps = 60, packetMs = 50, speed = 4.5, seconds = 4, local = true, jitter = null, turnRate = 0,
}) {
  const dt = 1 / fps;
  const id = local ? "me" : "other";
  const player = {
    id, warriorClass: "warden", state: "running",
    position: { x: 0, y: 0, z: 0 }, rotation: 0, velocity: { x: speed, y: 0, z: 0 },
  };
  const motion = anim.createMotion(player);
  const rig = { group: new THREE.Object3D(), blob: new THREE.Object3D() };
  const ctx = { localId: "me" };

  // The server's own state, advanced on a fixed 50 ms step exactly as
  // engine.mjs does, and only COPIED to the client when a packet lands.
  let simX = 0, simRot = 0, simT = 0, nextPacket = 0;
  const wire = { position: { x: 0, y: 0, z: 0 }, rotation: 0, velocity: { x: speed, y: 0, z: 0 }, id, warriorClass: "warden", state: "running" };
  const samples = [];
  const frames = Math.round(seconds * fps);
  let t = 0;
  let ji = 0;

  for (let f = 0; f < frames; f++) {
    t += dt;
    // advance the authoritative sim in fixed 1/20 steps
    while (simT + 0.05 <= t) { simT += 0.05; simX += speed * 0.05; simRot += turnRate * 0.05; }
    // deliver a packet when one is due
    // Packets land on their own fixed grid, not on the frame that noticed them
    // — otherwise the harness itself beats against the frame clock and invents
    // a hitch the game does not have.
    if (t * 1000 >= nextPacket) {
      nextPacket += jitter ? jitter[ji % jitter.length] : packetMs; ji++;
      wire.position = { x: simX, y: 0, z: 0 };
      wire.rotation = simRot;
      wire.velocity = { x: speed, y: 0, z: 0 };
    }
    Object.assign(player, wire);
    anim.stepWarriorTransform(rig, motion, player, dt, ctx, undefined);
    samples.push({ t, x: rig.group.position.x, yaw: rig.group.rotation.y, simX, simRot });
  }

  // Discard the first half second: the rig starts at the origin and has to
  // catch up to a man already moving, which is a transient, not judder.
  const warm = samples.filter((s) => s.t > 0.5);
  const vel = [], acc = [], lag = [], yawVel = [], yawAcc = [], yawLag = [];
  for (let i = 1; i < warm.length; i++) {
    vel.push((warm[i].x - warm[i - 1].x) / dt);
    yawVel.push((warm[i].yaw - warm[i - 1].yaw) / dt);
    lag.push(warm[i].simX - warm[i].x);
    yawLag.push(warm[i].simRot - warm[i].yaw);
  }
  for (let i = 1; i < vel.length; i++) {
    acc.push(Math.abs((vel[i] - vel[i - 1]) / dt));
    yawAcc.push(Math.abs((yawVel[i] - yawVel[i - 1]) / dt));
  }
  const vs = stats(vel), ys = stats(yawVel);
  return {
    vel: vs, acc: stats(acc), lag: stats(lag),
    yawVel: ys, yawAcc: stats(yawAcc), yawLag: stats(yawLag),
    // Ripple: how much the on-screen speed swings inside one packet interval,
    // as a fraction of the speed itself. 0 = perfectly even steps.
    ripple: vs ? (vs.max - vs.min) / (vs.mean || 1) : NaN,
    yawRipple: ys && Math.abs(ys.mean) > 1e-6 ? (ys.max - ys.min) / ys.mean : NaN,
    samples: warm,
  };
}

async function runJudder({ jitterGaps = null } = {}) {
  const anim = await loadAnim();
  const THREE = await import("three");
  const out = [];
  const log = (s) => { console.log(s); out.push(s); };

  log("");
  log("=== 4. JUDDER — anim.ts interpolation driven at a synthetic 60 Hz ===");
  log("    real stepWarriorTransform(); warden walking a straight line at 4.5 u/s;");
  log("    server stepped at 20 Hz. Even steps => flat velocity, ~0 acceleration.");
  log("");

  const cases = [
    ["local player,  60 fps, clean 50ms wire", { fps: 60, local: true }],
    ["remote player, 60 fps, clean 50ms wire", { fps: 60, local: false }],
    ["local player,  30 fps, clean 50ms wire", { fps: 30, local: true }],
    ["local player, 120 fps, clean 50ms wire", { fps: 120, local: true }],
  ];
  if (jitterGaps && jitterGaps.length > 10) cases.push(["local player,  60 fps, MEASURED jitter", { fps: 60, local: true, jitter: jitterGaps }]);

  log("  POSITION (units/s; a warden walks 4.5)");
  const results = {};
  for (const [name, opt] of cases) {
    const r = traceWalk(anim, THREE, { ...opt, seconds: 4 });
    results[name] = r;
    log(`    ${name.padEnd(40)} speed p50=${f2(r.vel.p50)} min=${f2(r.vel.min)} max=${f2(r.vel.max)}  ripple=${(r.ripple * 100).toFixed(1)}%  |accel| p95=${f2(r.acc.p95)} max=${f2(r.acc.max)} u/s^2  lag p50=${(r.lag.p50 * 100).toFixed(1)}cm`);
  }

  log("");
  log("  ROTATION (rad/s; body turning at 3.0 rad/s, which is what a camera turn looks like)");
  for (const [name, opt] of cases) {
    const r = traceWalk(anim, THREE, { ...opt, seconds: 4, turnRate: 3.0 });
    results["rot:" + name] = r;
    log(`    ${name.padEnd(40)} yawrate p50=${f2(r.yawVel.p50)} min=${f2(r.yawVel.min)} max=${f2(r.yawVel.max)}  ripple=${(r.yawRipple * 100).toFixed(1)}%  |yawaccel| p95=${f2(r.yawAcc.p95)}  lag p50=${(r.yawLag.p50 * 1000).toFixed(1)}mrad (${((r.yawLag.p50 / 3.0) * 1000).toFixed(0)}ms behind)`);
  }

  // The shape of one packet interval, printed frame by frame, because the
  // distribution hides whether the hitch is a staircase or a catch-up.
  const r = traceWalk(anim, THREE, { fps: 60, local: true, seconds: 2 });
  const s = r.samples.slice(30, 42);
  log("");
  log("  one packet interval, frame by frame (local, 60 fps) — step in cm per frame:");
  const steps = [];
  for (let i = 1; i < s.length; i++) steps.push(((s[i].x - s[i - 1].x) * 100).toFixed(2));
  log(`    ${steps.join("  ")}`);
  log(`    even motion at 4.5 u/s and 60 fps would be 7.50 cm every frame.`);
  log("");
  return { results, text: out.join("\n") };
}

// ---------------------------------------------------------------------------
const CMD = process.argv[2] || "all";
if (import.meta.url === `file://${process.argv[1]}`) {
  let gaps = null;
  if (CMD === "tick" || CMD === "all") {
    const t = await runTick({ seconds: parseInt(process.env.SECONDS || "12", 10) });
    gaps = t.scenarios.find((s) => s.rooms === 4)?.broadcast ? null : null;
  }
  if (CMD === "judder" || CMD === "all") await runJudder({ jitterGaps: gaps });
  process.exit(0);
}
export { runTick, runJudder, traceWalk, loadAnim };
