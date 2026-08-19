#!/usr/bin/env node
/**
 * JANKTEST — WHICH OF THE FOUR WORDS IS IT?
 *
 *   node tools/janktest.mjs                    everything, ~6 min
 *   node tools/janktest.mjs --phases=server    the tick and the wire, no browser
 *   node tools/janktest.mjs --phases=motion    the interpolator, GPU-free
 *   node tools/janktest.mjs --phases=render    what a frame costs, with drawing on
 *   node tools/janktest.mjs --phases=strip     a frame sequence and a frame-time plot
 *   node tools/janktest.mjs --secs=30          longer sample
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS. The owner said, of the shipped game:
 *
 *     "The game currently feels visually buggy / laggy / jolty / jumpy
 *      when playing."
 *
 * Four words. They are FOUR DIFFERENT DEFECTS and this repository has no
 * instrument that can tell them apart:
 *
 *   BUGGY  something on screen is wrong          — a wrong pixel
 *   LAGGY  press to pixel is slow                — a latency
 *   JOLTY  motion is not smooth                  — a PACING variance
 *   JUMPY  things teleport                       — a DISCONTINUITY
 *
 * A mean frame time cannot see any of the last three. `tools/perf.mjs` reports
 * `frameMs: ms / frames` — an average — and calls it the frame cost; that is
 * `docs/PROCESS.md` failure mode 1, and it is why four words have survived this
 * long as one number. Jolt is a VARIANCE and jump is a DISCONTINUITY, and both
 * are invisible to any mean by construction.
 *
 * ---------------------------------------------------------------------------
 * THE HONESTY CLAUSE, and it decides the shape of every phase below.
 *
 * THIS BOX HAS NO GPU. It rasterises through SwiftShader. Measured here, a real
 * fight at 1280x720 draws 0.5 frames a second. No frames-per-second number
 * taken on this machine is a player's frame rate, and this harness never prints
 * one as a verdict. So each phase is chosen for what stays TRUE without a GPU:
 *
 *   §1 SERVER   The 20 Hz tick and the snapshot it emits, driven in Node with
 *               no browser anywhere near it. Absolute and real.
 *
 *   §2 WIRE     When snapshots actually reach the page. Real, but read twice —
 *               once with drawing on (where this box's stalls dominate) and
 *               once with drawing off (where the wire is alone).
 *
 *   §3 MOTION   THE VERDICT-BEARING PHASE. The interpolator's own output,
 *               recorded from inside the shipped bundle, driven by the real
 *               socket at the real 20 Hz — but with the draw call suppressed so
 *               the client runs at a realistic desktop frame rate instead of
 *               SwiftShader's. This is NOT a frame-rate measurement and is
 *               never reported as one. It answers the one question this box CAN
 *               answer honestly: given a fast client and a real server, does
 *               the motion pipeline produce smooth motion? That is stage 5 of
 *               `docs/PROCESS.md` R11 — motion and weight — and it is where the
 *               owner's JOLTY and JUMPY live.
 *
 *   §4 RENDER   What one frame COSTS in CPU JavaScript, as a distribution, and
 *               the long tasks and heap growth behind it. Device-portable in
 *               the way `tools/fpstest.mjs` argues at length: the milliseconds
 *               are this box's, the SHAPE and the attribution are everybody's.
 *
 *   §5 STRIP    R5, and here it means WATCH IT MOVE. A still cannot show a
 *               stutter. This writes a strip of consecutive frames and plots
 *               frame time and snapshot arrival against wall time, because a
 *               pacing defect is a picture before it is a number.
 *
 * ---------------------------------------------------------------------------
 * HOW IT MEASURES WITHOUT TOUCHING src/
 *
 * Nothing in `src/` is edited and no debug hook is asked for. Three boundaries
 * the page cannot hide, all of them the pattern `tools/fpstest.mjs` and
 * `tools/soundtest.mjs` already use:
 *
 *   requestAnimationFrame   wrapped, so every frame is timed end to end and the
 *                           JS work inside it is separated from the wait.
 *   WebSocket               wrapped, so every `game_state` is timestamped as it
 *                           reaches the page.
 *   the served bundle       rewritten IN FLIGHT by a route intercept, so the
 *                           interpolator reports its own internal state. Disk
 *                           is never touched. EVERY PATCH IS COUNTED, and a
 *                           patch that matched nothing prints MISSED and voids
 *                           its own result — an experiment that did not happen
 *                           is worse than no experiment.
 *
 * The patches are read out of `src/game/client/render/anim.ts` and matched
 * against the minified build. Property names survive Next's minifier; local
 * variable names do not, which is why each anchor is pinned on a property
 * access and not on an identifier.
 *
 * THIS HARNESS FIXES NOTHING AND GATES NOTHING. It is a ruler. Where it
 * declines to rule it says so on the verdict line, `docs/PROCESS.md` R4.
 */
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".jank");
const argv = process.argv.slice(2);
const argOf = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const SECS = Math.max(5, parseInt(argOf("secs", "20"), 10) || 20);
const PHASES = (argOf("phases", "server,wire,motion,render,strip")).split(",").map((s) => s.trim());
const has = (p) => PHASES.includes(p);
const PORT = parseInt(process.env.PORT || String(3960 + (process.pid % 30)), 10);

// ---------------------------------------------------------------------------
// statistics. A distribution, never a mean on its own — the mean is printed
// beside the percentiles only so a reader can see how far it lies from p50,
// which is itself the tell for a skewed frame time.
// ---------------------------------------------------------------------------
const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] : NaN;
function stats(values) {
  const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return {
    n: v.length, min: v[0], p50: pct(v, 50), p90: pct(v, 90), p95: pct(v, 95),
    p99: pct(v, 99), max: v[v.length - 1], mean,
    sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length),
  };
}
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "n/a");
/**
 * The number this harness exists for. Frame-to-frame ABSOLUTE DIFFERENCE, as a
 * distribution — not the standard deviation of the frame times.
 *
 * They are not the same statistic and only this one is jolt. A client that
 * alternates 8 ms / 25 ms and one that runs 8 ms for a second then 25 ms for a
 * second have the SAME mean and the SAME standard deviation. The first is
 * visibly juddering and the second is a smooth speed change. What separates
 * them is how much the frame time moves BETWEEN NEIGHBOURS, which is this.
 */
function consecutive(values) {
  const d = [];
  for (let i = 1; i < values.length; i++) d.push(Math.abs(values[i] - values[i - 1]));
  return d;
}
function histogram(values, edges) {
  const bins = new Array(edges.length + 1).fill(0);
  for (const v of values) {
    let i = 0; while (i < edges.length && v > edges[i]) i++;
    bins[i]++;
  }
  return bins;
}
function printHistogram(label, values, edges, unit = "ms") {
  const bins = histogram(values, edges);
  const total = values.length || 1;
  const peak = Math.max(...bins, 1);
  console.log(`\n  ${label}`);
  bins.forEach((c, i) => {
    const lo = i === 0 ? 0 : edges[i - 1];
    const hi = i === edges.length ? Infinity : edges[i];
    const name = hi === Infinity ? `>${lo}${unit}`.padStart(13) : `${lo}-${hi}${unit}`.padStart(13);
    const bar = "#".repeat(Math.round((c / peak) * 46));
    console.log(`    ${name} ${String(c).padStart(6)}  ${(100 * c / total).toFixed(1).padStart(5)}%  ${bar}`);
  });
}
const say = (s = "") => console.log(s);
const rule = (t) => { say(); say("=".repeat(78)); say(t); say("=".repeat(78)); };

// ---------------------------------------------------------------------------
// §1 THE SERVER. No browser, no GPU, no network stack worth speaking of — the
// engine's own `setInterval` tick and the snapshot it broadcasts, exactly as
// `custom-server.mjs` runs it. This is the one absolutely trustworthy number in
// the file, and everything downstream is measured against it.
// ---------------------------------------------------------------------------
async function phaseServer() {
  rule("§1  THE SERVER TICK AND THE SNAPSHOT IT SENDS   (Node, no GPU, absolute)");
  const { makeEngine } = await import(resolve(ROOT, "src/game/engine.mjs"));
  // autoTick: true is deliberate and is the whole point of this phase. Every
  // other harness in this repo drives the engine with `step(dt)` for
  // determinism; that hides the very thing under test, which is whether the
  // REAL timer wakes on time.
  const eng = makeEngine({ autoTick: true });
  const arrive = [];
  const timers = [];
  const sid = eng.connect((str) => {
    const m = JSON.parse(str);
    if (m.type === "game_state" && m.data?.state === "fighting") {
      arrive.push(performance.now());
      timers.push(m.data.matchTimer ?? 0);
    }
  });
  eng.message(sid, { type: "create", data: { name: "Ruler", mode: "blood_moot", bestOf: 1 } });
  // Seven bots is MAX_AI from src/app/page.tsx — the busiest fight the training
  // ground will actually deal, so the tick is loaded the way a real one is.
  for (let i = 0; i < 7; i++) eng.message(sid, { type: "add_bot", data: { difficulty: "warrior", warriorClass: "warden" } });
  eng.message(sid, { type: "start", data: {} });
  await new Promise((r) => setTimeout(r, (SECS + 4) * 1000));

  const iv = [];
  for (let i = 1; i < arrive.length; i++) iv.push(arrive[i] - arrive[i - 1]);
  const s = stats(iv);
  if (!s) { say("  no fight was dealt — nothing measured"); return null; }
  // Sim time carried per snapshot. `advance` broadcasts ONCE PER WAKE however
  // many 50 ms steps that wake owed, so a snapshot carrying 100 ms of sim is a
  // wake that ran two steps and sent one packet — a real 100 ms hole in the
  // client's input whatever the wire did.
  const carried = [];
  for (let i = 1; i < timers.length; i++) carried.push((timers[i] - timers[i - 1]) * 1000);
  const c = stats(carried);
  const doubled = carried.filter((x) => x > 75).length;

  say(`  ${arrive.length} snapshots over ${((arrive.at(-1) - arrive[0]) / 1000).toFixed(1)} s, 7 bots fighting`);
  say(`  snapshot interval, target 50.00 ms`);
  say(`    p50 ${f2(s.p50)}  p90 ${f2(s.p90)}  p95 ${f2(s.p95)}  p99 ${f2(s.p99)}  worst ${f2(s.max)}  min ${f2(s.min)}`);
  say(`    mean ${f2(s.mean)}   sd ${f2(s.sd)}`);
  const cons = stats(consecutive(iv));
  say(`  frame-to-frame change in that interval (JOLT at source)`);
  say(`    p50 ${f2(cons.p50)}  p95 ${f2(cons.p95)}  p99 ${f2(cons.p99)}  worst ${f2(cons.max)}`);
  say(`  sim time carried per snapshot, target 50.00 ms`);
  say(`    p50 ${f2(c?.p50)}  p99 ${f2(c?.p99)}  worst ${f2(c?.max)}   over 75 ms: ${doubled} (${(100 * doubled / (carried.length || 1)).toFixed(2)}%)`);
  printHistogram("snapshot interval", iv, [45, 48, 52, 55, 75, 100, 150]);
  say(`\n  READING: the server is ${s.p99 < 60 && s.max < 120 ? "CLEAN — it is not the source" : "IRREGULAR — it is a source"}.`);
  return { s, cons, carried: c, doubled, n: arrive.length };
}

// ---------------------------------------------------------------------------
// the server under test, and the browser that plays it
// ---------------------------------------------------------------------------
function waitForServer(url, timeoutMs = 180000) {
  const t0 = Date.now();
  return new Promise((ok, fail) => {
    const poll = async () => {
      try { const r = await fetch(url); if (r.ok || r.status === 404) return ok(); } catch { /* wait */ }
      if (Date.now() - t0 > timeoutMs) return fail(new Error("server never came up"));
      setTimeout(poll, 700);
    };
    poll();
  });
}

/**
 * The in-flight rewrite, and the discipline around it.
 *
 * Every anchor below is a PROPERTY ACCESS, because Next's minifier renames
 * local variables and leaves property names alone. Every patch is counted. A
 * patch whose count is zero is printed as MISSED and its phase's result is
 * thrown away, which is the only thing that stops this file quietly measuring
 * an unpatched build and reporting the numbers as if the probe had run.
 */
const PATCHES = {
  // Suppress the draw, and NOTHING else. `postfx.render` is the only call in
  // the loop that issues GL; the interpolation, the animation, the camera, the
  // vfx and the audio all still run. Swapping the method NAME rather than
  // removing the call keeps the expression and its arguments intact, so the
  // surrounding comma sequence is untouched.
  nodraw: {
    name: "suppress the draw call",
    subs: [[`.postfx.render(l,p)`, `.postfx[window.__jankNoDraw?"__none":"render"]?.(l,p)`]],
  },
  // The interpolator's own output, per warrior per frame, taken at the line
  // that commits it to the scene graph.
  motion: {
    name: "record the rendered transform",
    subs: [[
      `e.group.position.x=t.rx+c,e.group.position.z=t.rz+d,e.group.rotation.y=t.yaw,`,
      `e.group.position.x=t.rx+c,e.group.position.z=t.rz+d,e.group.rotation.y=t.yaw,window.__jankRec&&window.__jankRec(n,t,a),`,
    ]],
  },
  // Extrapolation: the render time has run PAST the newest snapshot and the
  // client is now inventing position from velocity. Every metre of this is a
  // metre that will be taken back when the packet lands.
  extrap: {
    name: "count extrapolation",
    subs: [[`let s=Math.min(t-r.t,.22);`, `let s=Math.min(t-r.t,.22);window.__jankEx&&window.__jankEx(s,n&&n.id),`]],
  },
  // The buffer reset. `ingestNet` empties its whole history when a packet
  // arrives with a non-positive or absurd gap — which is exactly what a BURST
  // of queued packets looks like after the main thread has been blocked. A
  // reset is a hard discontinuity with no smoothing behind it.
  reset: {
    name: "count buffer resets",
    subs: [[
      `if((c=Math.hypot(a-o.x,r-o.z)>6)||i<=0||i>8*e.netInterval)e.netCount=0;`,
      `if((c=Math.hypot(a-o.x,r-o.z)>6)||i<=0||i>8*e.netInterval)window.__jankReset&&window.__jankReset(c,i),e.netCount=0;`,
    ]],
  },
  // The other end of the buffer: render time is BEFORE the oldest sample held,
  // so the man is pinned to a stale position and does not move at all.
  stall: {
    name: "count buffer stalls",
    subs: [[`let i=ac(e,0);if(t<=i.t){e.rx=i.x,e.rz=i.z,e.yaw=i.yaw;return}`,
            `let i=ac(e,0);if(t<=i.t){window.__jankStall&&window.__jankStall(),e.rx=i.x,e.rz=i.z,e.yaw=i.yaw;return}`]],
  },
};

async function installPatches(ctx, names) {
  const hits = Object.fromEntries(names.map((n) => [n, 0]));
  if (!names.length) return hits;
  await ctx.route("**/*.js*", async (route) => {
    let res; try { res = await route.fetch(); } catch { return route.abort(); }
    let body; try { body = await res.text(); } catch { return route.fulfill({ response: res }); }
    let touched = false;
    for (const n of names) {
      for (const [from, to] of PATCHES[n].subs) {
        const parts = body.split(from);
        if (parts.length > 1) { hits[n] += parts.length - 1; body = parts.join(to); touched = true; }
      }
    }
    if (!touched) return route.fulfill({ response: res });
    route.fulfill({ response: res, body });
  });
  return hits;
}

/** Everything the page collects, installed before a line of app code runs. */
const COLLECTOR = () => {
  const w = window;
  w.__jank = {
    frames: [],        // { t, js }  presentation time and the JS work inside it
    snaps: [],         // arrival time of every game_state
    snapBytes: [],
    longTasks: [],
    heap: [],
    rec: null,         // per-warrior interpolator samples, armed on demand
    extrap: [],        // seconds ahead of the newest snapshot, per occurrence
    resets: [],        // { teleport, gap }
    stalls: 0,
    started: performance.now(),
  };
  // ---- frames. The rAF callback is wrapped so the JS work inside the frame is
  // separated from the wait in front of it; a long WAIT is the GPU, a long JS
  // is us, and a mean of the two together can tell nobody which.
  const R = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => R((t) => {
    const a = performance.now();
    try { cb(t); } finally {
      const b = performance.now();
      if (w.__jank.frames.length < 200000) w.__jank.frames.push({ t: a, js: b - a });
    }
  });
  // ---- the wire
  const RealWS = window.WebSocket;
  function Tapped(url, protocols) {
    const s = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    s.addEventListener("message", (e) => {
      const d = e.data;
      if (typeof d !== "string") return;
      // The type is read off the head of the string rather than by parsing the
      // whole packet: a JSON.parse of every snapshot inside the tap would add
      // main-thread work to the very thread whose stalls are under measurement.
      if (d.indexOf('"game_state"') < 0) return;
      w.__jank.snaps.push(performance.now());
      w.__jank.snapBytes.push(d.length);
    });
    return s;
  }
  Tapped.prototype = RealWS.prototype;
  for (const k of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) Tapped[k] = RealWS[k];
  window.WebSocket = Tapped;
  // ---- long tasks: anything over 50 ms that owned the thread, and what the
  // browser is willing to say about it.
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__jank.longTasks.push({ t: e.startTime, dur: e.duration, name: e.name });
    }).observe({ entryTypes: ["longtask"] });
  } catch { /* not every build ships it */ }
  // ---- the probes the bundle patches call
  w.__jankEx = (ahead, id) => { const j = w.__jank; if (j.extrap.length < 200000) j.extrap.push({ ahead, id }); };
  w.__jankStall = () => { w.__jank.stalls++; };
  w.__jankReset = (teleport, gap) => { const j = w.__jank; if (j.resets.length < 100000) j.resets.push({ teleport: !!teleport, gap }); };
  w.__jankRec = (player, motion, dt) => {
    const j = w.__jank;
    if (!j.rec) return;
    const a = j.rec[player.id] || (j.rec[player.id] = []);
    if (a.length > 40000) return;
    a.push({
      t: performance.now(), dt,
      rx: motion.rx, rz: motion.rz, yaw: motion.yaw,       // what was drawn
      wx: player.position.x, wz: player.position.z,        // what the wire said
      wyaw: player.rotation,
      ex: motion.errX, ez: motion.errZ, eyaw: motion.errYaw, // what is being hidden
      ni: motion.netInterval, nc: motion.netCount, nj: motion.netJit,
    });
  };
};

/** Landing -> training -> a fight with MAX_AI bots in it. */
async function reachFight(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByText("Training", { exact: false }).first().click();
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
  const more = page.getByLabel("More AI warriors");
  for (let i = 0; i < 10 && await more.isEnabled().catch(() => false); i++) await more.click();
  await page.getByText("DRAW STEEL", { exact: false }).first().click();
  await page.waitForFunction(() => window.__jank.snaps.length > 4, null, { timeout: 120000 });
}

/**
 * A fight, sampled. `noDraw` is the difference between "what this box's
 * rasteriser does" and "what the motion pipeline does", and every caller says
 * which one it wanted out loud.
 */
async function runFight(browser, { patches = [], noDraw = false, viewport = { width: 1280, height: 720 }, quality = "low", record = false, secs = SECS, shots = null } = {}) {
  const ctx = await browser.newContext({ viewport });
  const hits = await installPatches(ctx, patches);
  await ctx.addInitScript(COLLECTOR);
  if (noDraw) await ctx.addInitScript(() => { window.__jankNoDraw = true; });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => say(`  [page-error] ${String(e).slice(0, 160)}`));
  await reachFight(page, `http://127.0.0.1:${PORT}/?quality=${quality}`);
  // Fight, rather than stand in it. Without an input stream the local warrior
  // never moves and half of what is under test never happens.
  const canvas = page.locator("canvas").first();
  await canvas.click({ position: { x: Math.floor(viewport.width / 2), y: Math.floor(viewport.height / 2) } }).catch(() => {});
  let stop = false;
  const fight = (async () => {
    const keys = ["KeyW", "KeyA", "KeyS", "KeyD"];
    let i = 0;
    while (!stop) {
      const k = keys[i++ % keys.length];
      await page.keyboard.down(k).catch(() => {});
      await page.mouse.move(600 + Math.sin(i) * 300, 360).catch(() => {});
      if (i % 3 === 0) await page.mouse.down().catch(() => {});
      await new Promise((r) => setTimeout(r, 180));
      if (i % 3 === 0) await page.mouse.up().catch(() => {});
      await page.keyboard.up(k).catch(() => {});
    }
  })();
  // Let the fight settle before the ruler is zeroed: the first seconds carry
  // shader compilation and texture upload, which are a load screen and not a
  // frame rate.
  await new Promise((r) => setTimeout(r, 4000));
  await page.evaluate((rec) => {
    const j = window.__jank;
    j.frames.length = 0; j.snaps.length = 0; j.snapBytes.length = 0;
    j.longTasks.length = 0; j.extrap.length = 0; j.resets.length = 0; j.stalls = 0;
    j.started = performance.now();
    if (rec) j.rec = {};
  }, record);
  const heapTimer = setInterval(() => {
    page.evaluate(() => {
      const m = performance.memory;
      if (m) window.__jank.heap.push({ t: performance.now(), used: m.usedJSHeapSize });
    }).catch(() => {});
  }, 250);

  // A frame sequence, if asked for. Taken while the fight runs, at the fastest
  // cadence the box will give, because a stutter is only visible BETWEEN
  // consecutive frames.
  const strip = [];
  if (shots) {
    mkdirSync(shots.dir, { recursive: true });
    const t0 = Date.now();
    for (let i = 0; i < shots.count; i++) {
      const at = Date.now() - t0;
      const file = resolve(shots.dir, `f${String(i).padStart(3, "0")}.png`);
      await page.screenshot({ path: file }).catch(() => {});
      strip.push({ file, at });
    }
  }
  await new Promise((r) => setTimeout(r, secs * 1000));
  clearInterval(heapTimer);
  stop = true; await fight.catch(() => {});
  const data = await page.evaluate(() => {
    const j = window.__jank;
    return {
      frames: j.frames, snaps: j.snaps, snapBytes: j.snapBytes,
      longTasks: j.longTasks, heap: j.heap, extrap: j.extrap,
      resets: j.resets, stalls: j.stalls, rec: j.rec, elapsed: performance.now() - j.started,
    };
  });
  await ctx.close();
  return { ...data, hits, strip };
}

/** A patch that matched nothing voids its own experiment. R2's sibling. */
function patchesLanded(hits, names) {
  let ok = true;
  for (const n of names) {
    if (!hits[n]) { say(`  PATCH MISSED: ${PATCHES[n].name} — nothing in the served bundle matched. Result VOID.`); ok = false; }
  }
  return ok;
}

// ---------------------------------------------------------------------------
// §2 THE WIRE, as the page sees it
// ---------------------------------------------------------------------------
function reportWire(label, snaps, note) {
  const iv = [];
  for (let i = 1; i < snaps.length; i++) iv.push(snaps[i] - snaps[i - 1]);
  const s = stats(iv);
  if (!s) { say(`  ${label}: no snapshots`); return null; }
  // Two failures, opposite in sign and both fatal to smooth motion:
  //   a HOLE  — nothing arrived for longer than the client's buffer covers
  //   a BURST — several arrived at once because the thread had been blocked
  const holes = iv.filter((x) => x > 75).length;
  const bursts = iv.filter((x) => x < 5).length;
  say(`  ${label}`);
  say(`    ${snaps.length} snapshots, interval target 50.00 ms`);
  say(`    p50 ${f2(s.p50)}  p95 ${f2(s.p95)}  p99 ${f2(s.p99)}  worst ${f2(s.max)}  min ${f2(s.min)}`);
  say(`    holes >75 ms: ${holes} (${(100 * holes / iv.length).toFixed(2)}%)   bursts <5 ms: ${bursts} (${(100 * bursts / iv.length).toFixed(2)}%)`);
  if (note) say(`    ${note}`);
  return { s, holes, bursts, iv };
}

// ---------------------------------------------------------------------------
// §3 THE MOTION PIPELINE. The verdict-bearing phase.
// ---------------------------------------------------------------------------
/**
 * JOLT and JUMP, measured on the track that was actually drawn.
 *
 * Both are read off the RENDERED position, not off the wire and not off the
 * frame time, because the rendered position is the only thing a player's eye
 * ever receives. The frame time can be perfect and the track still jolt, which
 * is precisely the case a frame-rate harness cannot see.
 *
 *   JOLT  per-frame speed, differenced between neighbouring frames and
 *         normalised by the median speed. A man walking smoothly has a speed
 *         that barely changes frame to frame however fast he is going; a jolt
 *         is a speed that doubles and halves between one frame and the next.
 *
 *   JUMP  a single frame's displacement measured against the median frame's.
 *         A teleport is one frame that moves many times what its neighbours
 *         moved, and it is a COUNT, not an average — one per minute is a
 *         shipped defect and it cannot move a mean at all.
 */
function joltOf(samples, kx = "rx", kz = "rz") {
  const step = [], speed = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const d = Math.hypot(b[kx] - a[kx], b[kz] - a[kz]);
    const dt = (b.t - a.t) / 1000;
    step.push(d);
    if (dt > 1e-5) speed.push(d / dt);
  }
  const moving = speed.filter((v) => v > 0.05);
  const medSpeed = moving.length ? pct(moving.slice().sort((x, y) => x - y), 50) : 0;
  const medStep = step.length ? pct(step.slice().sort((x, y) => x - y), 50) : 0;
  // Normalised frame-to-frame speed change, over the frames where the man was
  // actually moving — a standing man has no jolt to measure and averaging him
  // in is how a harness reports smooth motion for a fight nobody could watch.
  const jolt = [];
  for (let i = 1; i < speed.length; i++) {
    if (speed[i] < 0.05 && speed[i - 1] < 0.05) continue;
    if (medSpeed > 1e-6) jolt.push(Math.abs(speed[i] - speed[i - 1]) / medSpeed);
  }
  const jumps4 = medStep > 1e-9 ? step.filter((d) => d > 4 * medStep).length : 0;
  const jumps8 = medStep > 1e-9 ? step.filter((d) => d > 8 * medStep).length : 0;
  const hard = step.filter((d) => d > 0.5).length;       // half a metre in one frame
  return { jolt: stats(jolt), step: stats(step), speed: stats(moving), medStep, medSpeed, jumps4, jumps8, hard, frames: samples.length };
}

/**
 * THE CONTROL, and without it this whole harness is failure mode 1 again.
 *
 * A jolty DRAWN track proves nothing on its own. The man may simply be moving
 * joltily — a bot that reverses, or a test robot mashing four keys in a cycle,
 * genuinely does change speed sharply, and a ruler that called that a rendering
 * defect would be encoding its author's hypothesis exactly the way
 * `docs/PROCESS.md` records ten times.
 *
 * So the same statistic is taken on the WIRE track: the authoritative positions
 * the server actually sent, deduplicated to the 20 Hz they arrive at. That is
 * the motion the client was ASKED to draw. The client's entire job is to render
 * it smoothly at display rate.
 *
 * Read the two together and only one conclusion is available from each case:
 *   drawn jolt <= wire jolt   the client is smoothing, working as intended
 *   drawn jolt >> wire jolt   the client is ADDING motion that is not in the
 *                             simulation, and that addition is the defect
 */
function wireTrack(samples) {
  const out = [];
  for (const s of samples) {
    const last = out[out.length - 1];
    if (last && last.wx === s.wx && last.wz === s.wz) continue;   // same packet, redrawn
    out.push(s);
  }
  return out;
}

/** How far the drawn man is from where the server last said he was. */
function errorOf(samples) {
  const err = samples.map((s) => Math.hypot(s.rx - s.wx, s.rz - s.wz));
  const hidden = samples.map((s) => Math.hypot(s.ex, s.ez));
  return { err: stats(err), hidden: stats(hidden) };
}

// ---------------------------------------------------------------------------
// §5 THE PICTURE. R5 — a still cannot show a stutter.
// ---------------------------------------------------------------------------
function plotSVG(file, series, title) {
  const W = 1200, H = 420, PAD = 56;
  const all = series.flatMap((s) => s.pts);
  if (!all.length) return;
  const tMax = Math.max(...all.map((p) => p[0]));
  const vMax = Math.max(...all.map((p) => p[1])) * 1.08 || 1;
  const X = (t) => PAD + (t / tMax) * (W - PAD * 2);
  const Y = (v) => H - PAD - (v / vMax) * (H - PAD * 2);
  const grid = [];
  for (let i = 0; i <= 5; i++) {
    const v = (vMax / 5) * i;
    grid.push(`<line x1="${PAD}" y1="${Y(v).toFixed(1)}" x2="${W - PAD}" y2="${Y(v).toFixed(1)}" stroke="#2a2a2a"/>`);
    grid.push(`<text x="${PAD - 8}" y="${(Y(v) + 4).toFixed(1)}" fill="#888" font-size="12" text-anchor="end" font-family="monospace">${v.toFixed(1)}</text>`);
  }
  const paths = series.map((s) => {
    const d = s.pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join("");
    return `<path d="${d}" fill="none" stroke="${s.colour}" stroke-width="${s.width || 1.2}" opacity="${s.opacity || 1}"/>`;
  });
  const marks = series.filter((s) => s.mark).map((s) =>
    s.pts.map((p) => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="2.4" fill="${s.colour}"/>`).join(""));
  const legend = series.map((s, i) =>
    `<rect x="${PAD + i * 210}" y="18" width="14" height="4" fill="${s.colour}"/><text x="${PAD + i * 210 + 22}" y="24" fill="#bbb" font-size="12" font-family="monospace">${s.label}</text>`).join("");
  writeFileSync(file,
`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#111"/>
<text x="${PAD}" y="${H - 16}" fill="#888" font-size="12" font-family="monospace">seconds into the fight  (0 - ${tMax.toFixed(1)} s)</text>
<text x="${W / 2}" y="${H - 396}" fill="#eee" font-size="15" font-family="monospace" text-anchor="middle">${title}</text>
${grid.join("")}${legend}${paths.join("")}${marks.join("")}
</svg>`);
}

/**
 * R5 is "open the render", and an SVG nobody can open is not opened. The plots
 * are re-shot as PNGs through the browser that is already running, so the
 * artefact directory can be LOOKED AT with any image viewer — including by
 * whoever reads this harness's output without a browser to hand.
 */
async function plotsToPng(browser, files) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 420 } });
  const page = await ctx.newPage();
  for (const f of files) {
    if (!existsSync(f)) continue;
    await page.goto(`file://${f}`, { waitUntil: "load" }).catch(() => {});
    await page.screenshot({ path: f.replace(/\.svg$/, ".png") }).catch(() => {});
  }
  await ctx.close();
}

function contactSheet(file, strip, frameTimes) {
  // The strip is written as an HTML sheet rather than a montage binary: this
  // box has no image tooling, and a sheet of <img> in file order is the same
  // evidence and opens in anything.
  const cells = strip.map((s, i) => {
    const prev = i ? strip[i - 1].at : s.at;
    const gap = s.at - prev;
    return `<figure><img src="${s.file.split("/").pop()}"><figcaption>#${i}  +${s.at} ms  <b>&Delta;${gap} ms</b></figcaption></figure>`;
  }).join("\n");
  writeFileSync(file,
`<!doctype html><meta charset="utf-8"><title>jank strip</title>
<style>body{background:#111;color:#ddd;font:13px monospace;margin:16px}
h1{font-size:16px}figure{display:inline-block;margin:0 6px 12px 0;width:300px}
img{width:300px;display:block;border:1px solid #333}figcaption{padding:3px 0}</style>
<h1>Consecutive frames of a real fight &mdash; ${strip.length} captures</h1>
<p>Read the &Delta; between neighbours. Even spacing is smooth; a &Delta; several times its
neighbours is the stutter, and it is visible here and in no still.</p>
${cells}`);
}

// ---------------------------------------------------------------------------
async function main() {
  // Only what THIS run will rewrite is cleared. An earlier `rmSync(OUT)` wiped
  // the frame strip whenever `--phases=motion` was run on its own, which threw
  // away the one artefact R5 asks a human to look at.
  mkdirSync(OUT, { recursive: true });
  if (has("strip")) rmSync(resolve(OUT, "strip"), { recursive: true, force: true });
  const result = {};
  if (has("server")) result.server = await phaseServer();

  const needBrowser = has("wire") || has("motion") || has("render") || has("strip");
  if (!needBrowser) return finish(result);

  if (!existsSync(resolve(ROOT, ".next/BUILD_ID"))) {
    say("\n  NO PRODUCTION BUILD. Run `npm run build` first — the dev server ships");
    say("  different JavaScript and every anchor in this file is pinned to the");
    say("  built bundle. Refusing to measure a build the player will never run.");
    process.exitCode = 1; return;
  }
  const server = spawn("node", ["custom-server.mjs"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);
  const pre = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    ...(existsSync(pre) ? { executablePath: pre } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });

  try {
    // ---- §4 RENDER: drawing ON. What a frame costs and what blocks the thread.
    if (has("render") || has("wire") || has("strip")) {
      rule("§2 & §4  A REAL FIGHT WITH DRAWING ON   (this box's rasteriser, read for SHAPE not for fps)");
      const shots = has("strip") ? { dir: resolve(OUT, "strip"), count: 12 } : null;
      const r = await runFight(browser, { noDraw: false, shots, secs: SECS });
      const fiv = [];
      for (let i = 1; i < r.frames.length; i++) fiv.push(r.frames[i].t - r.frames[i - 1].t);
      const fs = stats(fiv);
      const js = stats(r.frames.map((f) => f.js));
      say(`  ${r.frames.length} frames over ${(r.elapsed / 1000).toFixed(1)} s  =  ${(r.frames.length / (r.elapsed / 1000)).toFixed(2)} fps`);
      if (fs) {
        say(`  frame interval ms   p50 ${f2(fs.p50)}  p95 ${f2(fs.p95)}  p99 ${f2(fs.p99)}  worst ${f2(fs.max)}`);
        say(`  JS work per frame   p50 ${f2(js.p50)}  p95 ${f2(js.p95)}  p99 ${f2(js.p99)}  worst ${f2(js.max)}`);
        say(`  the rest of each frame is the rasteriser, and on this box that is ${f2(fs.p50 - js.p50)} ms at p50.`);
        const c = stats(consecutive(fiv));
        say(`  frame-to-frame change  p50 ${f2(c.p50)}  p95 ${f2(c.p95)}  worst ${f2(c.max)}`);
      }
      const lt = stats(r.longTasks.map((t) => t.dur));
      say(`  long tasks (>50 ms owning the thread): ${r.longTasks.length}` + (lt ? `   p50 ${f2(lt.p50)}  p99 ${f2(lt.p99)}  worst ${f2(lt.max)} ms` : ""));
      if (r.heap.length > 2) {
        const g = (r.heap.at(-1).used - r.heap[0].used) / 1048576;
        const span = (r.heap.at(-1).t - r.heap[0].t) / 1000;
        // A fall in used heap between two samples is a collection. Counting
        // them is the only view of GC this API gives, and it is enough to say
        // whether the loop is allocating.
        let drops = 0, freed = 0;
        for (let i = 1; i < r.heap.length; i++) if (r.heap[i].used < r.heap[i - 1].used) { drops++; freed += (r.heap[i - 1].used - r.heap[i].used) / 1048576; }
        say(`  heap: ${g >= 0 ? "+" : ""}${g.toFixed(1)} MB over ${span.toFixed(0)} s, ${drops} collections, ${freed.toFixed(1)} MB reclaimed`);
      }
      result.render = { fs, js, longTasks: r.longTasks.length, frames: r.frames.length, elapsed: r.elapsed };
      say();
      result.wireDraw = reportWire("with drawing ON — the wire AND this box's stalls together", r.snaps,
        "a burst is the socket flushing everything that queued while the thread was blocked.");
      if (fs) {
        plotSVG(resolve(OUT, "frametime-drawing-on.svg"), [
          { label: "frame interval ms", colour: "#e2554a", pts: r.frames.slice(1).map((f, i) => [(f.t - r.frames[0].t) / 1000, fiv[i]]) },
          { label: "JS work ms", colour: "#4a9ee2", pts: r.frames.map((f) => [(f.t - r.frames[0].t) / 1000, f.js]) },
        ], "frame time over a real fight — drawing ON (SwiftShader)");
      }
      if (r.snaps.length > 1) {
        const siv = []; for (let i = 1; i < r.snaps.length; i++) siv.push(r.snaps[i] - r.snaps[i - 1]);
        plotSVG(resolve(OUT, "snapshot-drawing-on.svg"), [
          { label: "snapshot interval ms (target 50)", colour: "#e8b44a", mark: true, pts: r.snaps.slice(1).map((t, i) => [(t - r.snaps[0]) / 1000, siv[i]]) },
        ], "snapshot arrival over a real fight — drawing ON");
      }
      if (shots && r.strip.length) {
        contactSheet(resolve(OUT, "strip", "index.html"), r.strip, fiv);
        say(`\n  strip: ${r.strip.length} consecutive frames -> .jank/strip/index.html`);
      }
    }

    // ---- §3 MOTION: drawing OFF. The pipeline at a realistic client rate.
    if (has("motion")) {
      rule("§3  THE MOTION PIPELINE   (draw suppressed, so the client runs FAST — this is NOT an fps measurement)");
      const names = ["nodraw", "motion", "extrap", "reset", "stall"];
      const r = await runFight(browser, { patches: names, noDraw: true, record: true, secs: SECS, viewport: { width: 960, height: 540 } });
      for (const n of names) say(`  patch "${PATCHES[n].name}": ${r.hits[n]} site(s)`);
      if (!patchesLanded(r.hits, names)) { result.motionVoid = true; }
      else {
        const fiv = [];
        for (let i = 1; i < r.frames.length; i++) fiv.push(r.frames[i].t - r.frames[i - 1].t);
        const fs = stats(fiv);
        say(`\n  client ran at ${(r.frames.length / (r.elapsed / 1000)).toFixed(1)} fps with the draw suppressed  (frame p50 ${f2(fs?.p50)} ms)`);
        say(`  — that is the point: a fast client against the real 20 Hz server.`);
        say();
        result.wireNoDraw = reportWire("with drawing OFF — the wire alone", r.snaps,
          "compare against the reading above: what differs is this box's rasteriser, not the network.");

        const ids = Object.keys(r.rec || {});
        say(`\n  ${ids.length} warriors recorded, ${ids.reduce((a, i) => a + r.rec[i].length, 0)} interpolator samples`);
        const perMan = ids.map((id) => {
          const wt = wireTrack(r.rec[id]);
          return { id, ...joltOf(r.rec[id]), ...errorOf(r.rec[id]),
                   wire: joltOf(wt, "wx", "wz").jolt, wireN: wt.length };
        }).filter((m) => m.frames > 30);
        // The local warrior is rendered with ZERO delay and carried forward to
        // the present instant; every other man is rendered 1.5 packets in the
        // past. They are two different algorithms and averaging them together
        // would hide whichever is worse.
        say(`\n  JOLT — frame-to-frame speed change, as a multiple of the man's median speed`);
        say(`         (0 is perfectly smooth; 1 means the speed changed by his whole median speed in one frame)`);
        say(`         DRAWN is what the client put on screen. WIRE is the 20 Hz motion the server`);
        say(`         actually asked for. Drawn worse than wire is motion the client INVENTED.`);
        say(`    ${"warrior".padEnd(22)} ${"DRAWN p50".padStart(9)} ${"p95".padStart(8)} ${"p99".padStart(8)} ${"worst".padStart(9)}  |  ${"WIRE p95".padStart(8)} ${"p99".padStart(8)}  |  ${"p99 ratio".padStart(9)}`);
        for (const m of perMan.sort((a, b) => (b.jolt?.p99 || 0) - (a.jolt?.p99 || 0))) {
          if (!m.jolt) continue;
          const ratio = m.wire && m.wire.p99 > 1e-6 ? m.jolt.p99 / m.wire.p99 : NaN;
          say(`    ${m.id.padEnd(22)} ${f2(m.jolt.p50).padStart(9)} ${f2(m.jolt.p95).padStart(8)} ${f2(m.jolt.p99).padStart(8)} ${f2(m.jolt.max).padStart(9)}  |  ${f2(m.wire?.p95).padStart(8)} ${f2(m.wire?.p99).padStart(8)}  |  ${(Number.isFinite(ratio) ? ratio.toFixed(2) + "x" : "n/a").padStart(9)}`);
        }
        say(`\n  JUMP — single frames that moved more than 4x and 8x the median frame's step`);
        for (const m of perMan.sort((a, b) => b.jumps8 - a.jumps8)) {
          say(`    ${m.id.padEnd(22)} >4x ${String(m.jumps4).padStart(5)}   >8x ${String(m.jumps8).padStart(5)}   >0.5 m in one frame ${String(m.hard).padStart(5)}   of ${m.frames} frames`);
        }
        say(`\n  ERROR — how far the drawn man is from the last position the server sent,`);
        say(`          and how much of that the smoother is actively hiding`);
        for (const m of perMan.sort((a, b) => (b.err?.p99 || 0) - (a.err?.p99 || 0))) {
          if (!m.err) continue;
          say(`    ${m.id.padEnd(22)} err p50 ${f2(m.err.p50)} m  p99 ${f2(m.err.p99)} m  worst ${f2(m.err.max)} m   hidden p99 ${f2(m.hidden.p99)} m`);
        }
        const ex = stats(r.extrap.map((x) => x.ahead * 1000));
        say(`\n  EXTRAPOLATION — frames where render time ran PAST the newest snapshot and`);
        say(`                  position was invented from velocity. Every one is taken back later.`);
        const totalFrames = perMan.reduce((a, m) => a + m.frames, 0) || 1;
        say(`    ${r.extrap.length} of ${totalFrames} warrior-frames (${(100 * r.extrap.length / totalFrames).toFixed(1)}%)` +
            (ex ? `   ahead by p50 ${f2(ex.p50)} ms  p99 ${f2(ex.p99)} ms  worst ${f2(ex.max)} ms (cap 220)` : ""));
        // THE BUFFER, measured rather than assumed. `REMOTE_DELAY_PACKETS` is
        // 1.5 in anim.ts, but `netInterval` ADAPTS, so the delay a remote man is
        // actually rendered at is a measured quantity and not 1.5 x 50 ms by
        // assertion. This is the number to hold the arrival jitter against: a
        // buffer shallower than the jitter it exists to absorb WILL run dry, and
        // every frame it runs dry is a frame of invented position.
        const allNi = [], allNc = [];
        for (const id of ids) for (const s of r.rec[id]) { allNi.push(s.ni * 1000); allNc.push(s.nc); }
        const ni = stats(allNi), nc = stats(allNc);
        say(`\n  BUFFER DEPTH — what the client is actually holding, and how far back it draws`);
        say(`    netInterval (the client's own estimate of the packet period, target 50 ms)`);
        say(`      p50 ${f2(ni?.p50)}  p95 ${f2(ni?.p95)}  p99 ${f2(ni?.p99)}  worst ${f2(ni?.max)}`);
        say(`    effective render delay for a REMOTE man = 1.5 x netInterval  (REMOTE_DELAY_PACKETS, anim.ts)`);
        say(`      p50 ${f2(ni?.p50 * 1.5)} ms   — this is the entire jitter budget the buffer has`);
        say(`    snapshots held in the buffer   p50 ${f2(nc?.p50)}  min ${f2(nc?.min)}  max ${f2(nc?.max)}`);
        if (result.wireNoDraw) {
          const budget = ni ? ni.p50 * 1.5 : NaN;
          const jitter = result.wireNoDraw.s.p99;
          say(`    AGAINST THE WIRE: buffer ${f2(budget)} ms vs arrival p99 ${f2(jitter)} ms  ->  ` +
              (jitter > budget ? `THE JITTER EXCEEDS THE BUFFER by ${f2(jitter - budget)} ms. It must run dry.`
                               : `the buffer covers the jitter.`));
        }

        const byMan = {};
        for (const e of r.extrap) { const k = e.id || "?"; (byMan[k] = byMan[k] || []).push(e.ahead * 1000); }
        say(`    broken down, because the local man extrapolates BY DESIGN (his delay is 0)`);
        say(`    and a remote man extrapolating has RUN OUT OF BUFFER — two different defects:`);
        for (const m of perMan.sort((a, b) => (byMan[b.id]?.length || 0) - (byMan[a.id]?.length || 0))) {
          const a = byMan[m.id] || []; const st = stats(a);
          const kind = m.id.startsWith("bot_") ? "remote" : "LOCAL ";
          say(`      ${kind} ${m.id.padEnd(22)} ${String(a.length).padStart(5)}/${m.frames} frames (${(100 * a.length / m.frames).toFixed(1).padStart(5)}%)` +
              (st ? `  ahead p50 ${f2(st.p50).padStart(6)} ms  p99 ${f2(st.p99).padStart(6)} ms` : ""));
        }
        say(`  BUFFER STALLS — render time fell BEHIND the oldest snapshot held; the man is pinned.`);
        say(`    ${r.stalls} warrior-frames (${(100 * r.stalls / totalFrames).toFixed(1)}%)`);
        say(`  BUFFER RESETS — the whole interpolation history thrown away mid-fight.`);
        const tele = r.resets.filter((x) => x.teleport).length;
        say(`    ${r.resets.length} total: ${tele} a real teleport (respawn), ${r.resets.length - tele} NOT — a bad arrival gap.`);
        if (perMan.length) {
          const worst = perMan.slice().sort((a, b) => (b.jolt?.p99 || 0) - (a.jolt?.p99 || 0))[0];
          const sample = r.rec[worst.id];
          const t0 = sample[0].t;
          plotSVG(resolve(OUT, "motion-track.svg"), [
            { label: `${worst.id} drawn X`, colour: "#4ae28a", pts: sample.map((s) => [(s.t - t0) / 1000, s.rx + 30]) },
            { label: "wire X", colour: "#e8b44a", opacity: 0.8, pts: sample.map((s) => [(s.t - t0) / 1000, s.wx + 30]) },
          ], `drawn vs wire position — ${worst.id} (offset +30 so both are visible)`);
          const spd = [];
          for (let i = 1; i < sample.length; i++) {
            const dt = (sample[i].t - sample[i - 1].t) / 1000;
            if (dt > 1e-5) spd.push([(sample[i].t - t0) / 1000, Math.hypot(sample[i].rx - sample[i - 1].rx, sample[i].rz - sample[i - 1].rz) / dt]);
          }
          plotSVG(resolve(OUT, "motion-speed.svg"), [{ label: "drawn speed m/s", colour: "#e2554a", pts: spd }],
            `speed of the drawn man, frame by frame — ${worst.id}. Every spike is a jolt.`);
        }
        result.motion = { perMan, extrap: r.extrap.length, totalFrames, stalls: r.stalls, resets: r.resets.length, resetsNotTeleport: r.resets.length - tele, ex };
      }
    }
    await plotsToPng(browser, [
      "frametime-drawing-on.svg", "snapshot-drawing-on.svg", "motion-track.svg", "motion-speed.svg",
    ].map((f) => resolve(OUT, f))).catch(() => {});
  } finally {
    await browser.close().catch(() => {});
    if (server && !server.killed) server.kill("SIGTERM");
  }
  finish(result);
}

function finish(result) {
  rule("THE FOUR WORDS, SEPARATED");
  say(`  Written against the owner's report: "visually buggy / laggy / jolty / jumpy".`);
  say(`  Each word is a different defect and this section refuses to merge them.`);
  say();
  const R = result;
  if (R.server) {
    const ok = R.server.s.p99 < 60 && R.server.s.max < 120;
    say(`  SERVER PACING     ${ok ? "CLEAN" : "SUSPECT"} — snapshot interval p99 ${f2(R.server.s.p99)} ms, worst ${f2(R.server.s.max)} ms against a 50 ms target.`);
  }
  if (R.wireNoDraw) {
    say(`  WIRE (draw off)   p99 ${f2(R.wireNoDraw.s.p99)} ms, ${R.wireNoDraw.holes} holes, ${R.wireNoDraw.bursts} bursts.`);
  }
  if (R.wireDraw) {
    say(`  WIRE (draw on)    p99 ${f2(R.wireDraw.s.p99)} ms, ${R.wireDraw.holes} holes, ${R.wireDraw.bursts} bursts` +
        ` — a burst here is the MAIN THREAD, not the network.`);
  }
  if (R.motion) {
    const worst = R.motion.perMan.slice().sort((a, b) => (b.jolt?.p99 || 0) - (a.jolt?.p99 || 0))[0];
    if (worst?.jolt) {
      const ratio = worst.wire && worst.wire.p99 > 1e-6 ? worst.jolt.p99 / worst.wire.p99 : NaN;
      say(`  JOLT              worst man ${worst.id}: drawn p95 ${f2(worst.jolt.p95)}x, p99 ${f2(worst.jolt.p99)}x his own median speed, in ONE frame.`);
      say(`                    against the WIRE he was asked to draw: p99 ${f2(worst.wire?.p99)}x  =  ${Number.isFinite(ratio) ? ratio.toFixed(2) + "x worse than the motion the server sent" : "no wire control"}.`);
    }
    const jumper = R.motion.perMan.slice().sort((a, b) => b.jumps8 - a.jumps8)[0];
    if (jumper) say(`  JUMP              worst man ${jumper.id}: ${jumper.jumps8} frames moved >8x the median step, ${jumper.hard} moved >0.5 m.`);
    say(`  EXTRAPOLATION     ${(100 * R.motion.extrap / R.motion.totalFrames).toFixed(1)}% of warrior-frames invented from velocity.`);
    say(`  BUFFER RESETS     ${R.motion.resetsNotTeleport} not explained by a respawn.`);
  }
  say();
  say(`  DEFERRALS, on the verdict line and not below it (R4):`);
  say(`    - This harness GATES NOTHING. It is a ruler, not a bar.`);
  say(`    - No frames-per-second figure here is a player's. This box has no GPU.`);
  say(`    - BUGGY is not measured. A wrong pixel is a picture, not a pacing`);
  say(`      number; .jank/strip/index.html is where it would be seen and a human`);
  say(`      has to look at it.`);
  say(`    - Input latency (the other half of LAGGY) is tools/latencytest.mjs's`);
  say(`      "input" phase and is not duplicated here.`);
  say();
  say(`  Artefacts: ${OUT}`);
}

main().catch((e) => { console.error("[janktest] failed:", e); process.exitCode = 1; });
