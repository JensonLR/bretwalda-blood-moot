#!/usr/bin/env node
// ============================================================
// FPSTEST — what a frame COSTS, and what spends it.
//
//   node tools/fpstest.mjs                      # everything
//   node tools/fpstest.mjs --phases=matrix      # just the tier x state grid
//   node tools/fpstest.mjs --phases=ablation    # just the disable-one-thing runs
//   node tools/fpstest.mjs --phases=profile     # just the CPU attribution
//   node tools/fpstest.mjs --phases=server,live # ticks and the real network
//   node tools/fpstest.mjs --tiers=high --secs=20
//
// ------------------------------------------------------------
// THE HONESTY CLAUSE, which is the whole reason this file is shaped
// the way it is.
//
// This box has NO GPU. It rasterises through SwiftShader. Any fps number
// measured here is SwiftShader's fill rate and says nothing about a phone.
// So this harness never reports fps as a verdict. It reports the things
// that are true regardless of what draws the pixels:
//
//   - CPU-side JavaScript milliseconds per frame, as a distribution
//     (p50/p95/p99/worst), because a stutter is a TAIL statistic and a
//     mean will hide the 100 ms collection that ruins the feel.
//   - draw calls, triangles, program switches, framebuffer binds and
//     texture uploads per frame, counted at the GL boundary. These are
//     the numbers that explain a phone, and they are identical on every
//     device because they are what the renderer ASKS FOR.
//   - JS heap growth per frame and the GC pauses that growth buys.
//   - live Web Audio nodes and the automation churn behind them.
//   - RATIOS: between tiers, between scene states, and between a build
//     with a feature and the same build without it.
//   - server tick regularity, measured in Node, which has no GPU in it
//     at all and is therefore the one absolute number here.
//   - round-trip against the LIVE production server.
//
// ------------------------------------------------------------
// HOW IT MEASURES WITHOUT TOUCHING src/
//
// Nothing in src/ is edited, and no debug hook is asked for. Everything
// is taken at a boundary the page cannot hide:
//
//   requestAnimationFrame  wrapped, so every frame's JS is timed end to end.
//   HTMLCanvasElement.getContext + the WebGL prototypes  wrapped, so draw
//       calls, triangles, program switches, FBO binds, texture uploads and
//       shader links are counted as they are issued. This is better than
//       renderer.info: it needs no reference to the renderer, and it cannot
//       be lied to by a pass that resets the counter.
//   AudioContext's factory methods  wrapped, so every node the synthesiser
//       builds is counted, and every source's `ended` is watched, so the
//       LIVE voice count is real and not the budget.
//   performance.memory  sampled per frame for allocation and collections.
//   the game WebSocket  tapped the same way playtest.mjs taps it.
//   CDP Profiler  for the per-module split of that JS time.
//
// The ablations are done the way soundtest.mjs reaches private code: the
// served JavaScript is rewritten IN FLIGHT by a route intercept. Disk is
// never touched, no file is edited, and every patch reports whether it
// actually landed — a rewrite that matched nothing is printed as MISSED and
// its result is thrown away, because an experiment that did not happen is
// worse than no experiment.
//
// ------------------------------------------------------------
// WHY A REAL MATCH AND NOT /shot
//
// /shot is a still life: no server, no packets, no deaths, no HUD churn, no
// audio events, no React. The complaint is about PLAY. So this drives the
// shipped flow — CREATE BATTLE, wire men on the real protocol, three AI, a
// bonfire full of the doomed — and slices the recording into scene states
// afterwards using timestamps taken from the wire.
//
// The viewport is deliberately SMALL (see VIEW). Fill rate is the one thing
// this box cannot tell the truth about, and at 1280x720 SwiftShader gives
// about one frame a second, which is far too few frames to have a p99 at
// all. Shrinking the frame does not change a single draw call, a single
// allocation, or a single line of the JavaScript being measured — it only
// stops the software rasteriser being the wall. Everything reported here is
// CPU-side and viewport-independent, except where explicitly labelled.
// ============================================================
import { chromium } from "playwright";
import { launchOptions, rasteriserNote, useGpu, watchBoot } from "./lib/browser.mjs";
import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { raiseMoot, driveIntoTheFire } from "./summarymoot.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "art/perf");
const PORT = parseInt(process.env.PORT || String(3900 + (process.pid % 90)), 10);
const LIVE = "https://bretwalda-blood-moot.onrender.com";

const arg = (k, d) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const TIERS = arg("tiers", "low,medium,high").split(",").filter(Boolean);
const PHASES = arg("phases", "matrix,ablation,profile,server,live").split(",").filter(Boolean);
const SECS = parseFloat(arg("secs", "14"));

// Small on purpose — see the header. 640x360 at dpr 1.
const VIEW = {
  width: Number(arg("w", 640)) || 640,
  height: Number(arg("h", 360)) || 360,
};

const say = (s = "") => console.log(s);
const note = (s) => console.log(`        ${s}`);

// ------------------------------------------------------------------
// Statistics. A stutter lives in the tail, so the tail is what is kept.
// ------------------------------------------------------------------
const pct = (sorted, p) => {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
};
function dist(values) {
  const s = [...values].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    n: s.length,
    mean: s.length ? sum / s.length : 0,
    p50: pct(s, 50), p95: pct(s, 95), p99: pct(s, 99),
    worst: s.length ? s[s.length - 1] : 0,
  };
}
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const f0 = (x) => (Number.isFinite(x) ? x.toFixed(0) : "—");

// ------------------------------------------------------------------
// THE PROBE. Installed before any page script runs.
// ------------------------------------------------------------------
const PROBE = () => {
  const w = window;

  // ---- the wire, tapped exactly as playtest/summaryflow tap it ----
  w.__probe = {
    joinData: null, latest: null, matchEnd: null, playerId: null,
    states: 0, ticks: [], kills: [], seenKills: 0,
  };
  const RealWS = window.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (String(url).includes("/ws")) {
      ws.addEventListener("message", (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === "join") { w.__probe.joinData = m.data; w.__probe.playerId = m.data.playerId; }
          if (m.data && m.data.players) {
            w.__probe.latest = m.data;
            w.__probe.states++;
            w.__probe.ticks.push(performance.now());
            // A death is the frame everyone remembers, so the kill feed is
            // timestamped on arrival and the frames around it are sliced out
            // later. The feed only ever grows during a match.
            const feed = m.data.killFeed || [];
            if (feed.length > w.__probe.seenKills) {
              for (let i = w.__probe.seenKills; i < feed.length; i++) {
                w.__probe.kills.push({ t: performance.now(), who: feed[i].victimName });
              }
              w.__probe.seenKills = feed.length;
            }
          }
          if (m.type === "match_end") w.__probe.matchEnd = m.data;
        } catch { /* not ours */ }
      });
    }
    return ws;
  }
  TappedWS.prototype = RealWS.prototype;
  for (const k of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) TappedWS[k] = RealWS[k];
  window.WebSocket = TappedWS;

  // ---- the meter ----
  const M = {
    frames: [],            // one record per animation frame
    audioNodes: 0,         // cumulative nodes built
    audioLive: 0,          // sources started and not yet ended
    audioParamOps: 0,      // cumulative AudioParam automation calls
    contexts: 0,
    gl: null,
    longTasks: [],
    started: performance.now(),
  };
  w.__fps = M;

  // per-frame accumulators, reset at each new rAF timestamp
  let cur = null, curT = -1;
  const blank = (t) => ({
    t, js: 0, draws: 0, tris: 0, progSwitch: 0, fbo: 0, texUpload: 0,
    shaderMs: 0, heap: 0, audioNodes: 0, audioParams: 0, cbs: 0,
  });
  const flush = () => {
    if (!cur) return;
    try { cur.heap = performance.memory ? performance.memory.usedJSHeapSize : 0; } catch { /* ok */ }
    cur.audioNodes = M.audioNodes;
    cur.audioLive = M.audioLive;
    cur.audioParams = M.audioParamOps;
    M.frames.push(cur);
    if (M.frames.length > 8000) M.frames.splice(0, 2000);
    cur = null;
  };

  const rawRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    return rawRaf(function (t) {
      // A new animation-frame timestamp means the previous frame is done —
      // several callbacks can share one frame and all of them are its cost.
      if (t !== curT) { flush(); curT = t; cur = blank(t); }
      const s = performance.now();
      try { return cb(t); } finally { if (cur) { cur.js += performance.now() - s; cur.cbs++; } }
    });
  };
  // Anything that never gets another frame still has to be banked.
  setInterval(flush, 500);

  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) M.longTasks.push({ t: e.startTime, ms: e.duration });
    }).observe({ entryTypes: ["longtask"] });
  } catch { /* not everywhere */ }

  // ---- the GL boundary ----
  const TRI_MODES = new Set([4, 5, 6]); // TRIANGLES, TRIANGLE_STRIP, TRIANGLE_FAN
  const trisOf = (mode, count) => (TRI_MODES.has(mode) ? (mode === 4 ? count / 3 : Math.max(0, count - 2)) : 0);

  function instrument(proto) {
    if (!proto || proto.__fpsWrapped) return;
    proto.__fpsWrapped = true;
    const wrap = (name, fn) => {
      const orig = proto[name];
      if (typeof orig !== "function") return;
      proto[name] = function (...a) { fn.call(this, a); return orig.apply(this, a); };
    };
    wrap("drawElements", function (a) { if (cur) { cur.draws++; cur.tris += trisOf(a[0], a[1]); } });
    wrap("drawArrays", function (a) { if (cur) { cur.draws++; cur.tris += trisOf(a[0], a[2]); } });
    wrap("drawElementsInstanced", function (a) { if (cur) { cur.draws++; cur.tris += trisOf(a[0], a[1]) * (a[4] || 1); } });
    wrap("drawArraysInstanced", function (a) { if (cur) { cur.draws++; cur.tris += trisOf(a[0], a[2]) * (a[3] || 1); } });
    wrap("drawRangeElements", function (a) { if (cur) { cur.draws++; cur.tris += trisOf(a[0], a[3]); } });
    // A program switch costs a state validation; it is the second number a
    // batching pass moves after the draw count itself.
    let lastProg = null;
    wrap("useProgram", function (a) { if (cur && a[0] !== lastProg) { cur.progSwitch++; lastProg = a[0]; } });
    // Every FBO bind is a pass boundary: the beauty pass, the shadow map, the
    // AO prepass, every ping-pong in the composer.
    let lastFbo;
    wrap("bindFramebuffer", function (a) { if (cur && a[1] !== lastFbo) { cur.fbo++; lastFbo = a[1]; } });
    // Uploads mid-frame are a classic first-encounter hitch.
    wrap("texImage2D", function () { if (cur) cur.texUpload++; });
    wrap("texSubImage2D", function () { if (cur) cur.texUpload++; });
    wrap("compressedTexImage2D", function () { if (cur) cur.texUpload++; });

    // Live object counts, the renderer.info numbers taken at the source.
    const live = (M.glLive ||= { textures: 0, buffers: 0, programs: 0, fbos: 0, vaos: 0 });
    const bump = (name, key, d) => {
      const orig = proto[name];
      if (typeof orig !== "function") return;
      proto[name] = function (...a) { live[key] += d; return orig.apply(this, a); };
    };
    bump("createTexture", "textures", 1); bump("deleteTexture", "textures", -1);
    bump("createBuffer", "buffers", 1); bump("deleteBuffer", "buffers", -1);
    bump("createFramebuffer", "fbos", 1); bump("deleteFramebuffer", "fbos", -1);
    bump("createVertexArray", "vaos", 1); bump("deleteVertexArray", "vaos", -1);
    bump("createProgram", "programs", 1); bump("deleteProgram", "programs", -1);
    // Shader work is synchronous main-thread time and it lands in bursts.
    for (const name of ["compileShader", "linkProgram"]) {
      const orig = proto[name];
      if (typeof orig !== "function") continue;
      proto[name] = function (...a) {
        const s = performance.now();
        const r = orig.apply(this, a);
        if (cur) cur.shaderMs += performance.now() - s;
        return r;
      };
    }
  }
  instrument(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  instrument(window.WebGLRenderingContext && WebGLRenderingContext.prototype);

  const rawGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const ctx = rawGetContext.call(this, type, attrs);
    if (ctx && /webgl/.test(String(type))) M.gl = ctx;
    return ctx;
  };

  // ---- the audio graph ----
  const FACTORIES = [
    "createGain", "createOscillator", "createBufferSource", "createBiquadFilter",
    "createDynamicsCompressor", "createConvolver", "createWaveShaper", "createDelay",
    "createPanner", "createStereoPanner", "createAnalyser", "createChannelMerger",
    "createChannelSplitter", "createConstantSource", "createIIRFilter", "createPeriodicWave",
  ];
  const armContext = (Ctor) => {
    if (!Ctor || Ctor.prototype.__fpsAudio) return;
    Ctor.prototype.__fpsAudio = true;
    for (const name of FACTORIES) {
      const orig = Ctor.prototype[name];
      if (typeof orig !== "function") continue;
      Ctor.prototype[name] = function (...a) {
        const node = orig.apply(this, a);
        M.audioNodes++;
        if (node && typeof node.start === "function") {
          M.audioLive++;
          let done = false;
          const off = () => { if (!done) { done = true; M.audioLive--; } };
          try { node.addEventListener("ended", off); } catch { /* ok */ }
          // A source that is never started and never stopped would leak the
          // count, so the stop time is a second, independent release.
          const rawStop = node.stop && node.stop.bind(node);
          if (rawStop) node.stop = (t) => { setTimeout(off, 4000); return rawStop(t); };
        }
        return node;
      };
    }
  };
  const RealAC = window.AudioContext || window.webkitAudioContext;
  if (RealAC) {
    armContext(RealAC);
    const Wrapped = function (...a) { M.contexts++; return new RealAC(...a); };
    Wrapped.prototype = RealAC.prototype;
    window.AudioContext = Wrapped;
    if (window.webkitAudioContext) window.webkitAudioContext = Wrapped;
  }
  if (window.OfflineAudioContext) armContext(window.OfflineAudioContext);
  // Automation is main-thread work whatever the audio thread then does with it.
  if (window.AudioParam) {
    for (const name of ["setValueAtTime", "linearRampToValueAtTime", "exponentialRampToValueAtTime",
      "setTargetAtTime", "setValueCurveAtTime", "cancelScheduledValues"]) {
      const orig = AudioParam.prototype[name];
      if (typeof orig !== "function") continue;
      AudioParam.prototype[name] = function (...a) { M.audioParamOps++; return orig.apply(this, a); };
    }
  }

  M.reset = () => { M.frames.length = 0; M.longTasks.length = 0; M.markT = performance.now(); };
  M.dump = () => ({
    frames: M.frames.slice(),
    longTasks: M.longTasks.slice(),
    glLive: M.glLive || null,
    audio: { built: M.audioNodes, live: M.audioLive, params: M.audioParamOps, contexts: M.contexts },
    kills: w.__probe.kills.slice(),
    ticks: w.__probe.ticks.slice(),
    // WHEN THE FRAME BUFFER WAS LAST EMPTIED, and it has to travel with the
    // dump. `reset` clears `M.frames` and does NOT clear `w.__probe.kills` —
    // the kill feed is the whole session's, on purpose, because the probe is
    // also how the harness knows a match progressed at all. So a caller that
    // slices frames by kill times has to know which kills happened AFTER the
    // frames it holds, and until this was returned it could not.
    markT: M.markT || 0,
    now: performance.now(),
  });
};

// ------------------------------------------------------------------
// Reduces one recorded window to the numbers this harness will stand behind.
// `slice` optionally keeps only frames inside [from, to] windows.
// ------------------------------------------------------------------
function reduce(dump, windows) {
  let frames = dump.frames;
  if (windows && windows.length) {
    frames = frames.filter((f) => windows.some(([a, b]) => f.t >= a && f.t <= b));
  }
  // The first frames after a state change carry the build of whatever is new
  // (rigs, shaders); they are real but they are not the steady state, and they
  // are reported separately as `shaderMs` and `worst`.
  const js = dist(frames.map((f) => f.js));
  const draws = dist(frames.map((f) => f.draws));
  const tris = dist(frames.map((f) => f.tris));

  // Allocation: rising heap deltas only. A negative delta is a collection.
  const grow = [];
  const gcDrops = [];
  for (let i = 1; i < frames.length; i++) {
    const d = frames[i].heap - frames[i - 1].heap;
    if (d >= 0) grow.push(d); else gcDrops.push(-d);
  }
  const span = frames.length ? frames[frames.length - 1].t - frames[0].t : 0;

  return {
    frames: frames.length,
    spanS: span / 1000,
    js,
    draws: draws.p50, drawsWorst: draws.worst,
    tris: tris.p50,
    progSwitch: Math.round(frames.reduce((a, f) => a + f.progSwitch, 0) / (frames.length || 1)),
    fbo: Math.round(frames.reduce((a, f) => a + f.fbo, 0) / (frames.length || 1)),
    texUpload: frames.reduce((a, f) => a + f.texUpload, 0),
    shaderMs: frames.reduce((a, f) => a + f.shaderMs, 0),
    allocPerFrameKb: grow.length ? (grow.reduce((a, b) => a + b, 0) / grow.length) / 1024 : 0,
    allocPerSecMb: span > 0 ? (grow.reduce((a, b) => a + b, 0) / (span / 1000)) / 1048576 : 0,
    gcCount: gcDrops.length,
    gcPerMin: span > 0 ? gcDrops.length / (span / 60000) : 0,
    gcFreedMb: gcDrops.length ? (gcDrops.reduce((a, b) => a + b, 0) / gcDrops.length) / 1048576 : 0,
    heapMb: frames.length ? frames[frames.length - 1].heap / 1048576 : 0,
    audioLive: frames.length ? Math.max(...frames.map((f) => f.audioLive ?? 0)) : 0,
    audioBuilt: frames.length ? frames[frames.length - 1].audioNodes - frames[0].audioNodes : 0,
    audioParams: frames.length ? frames[frames.length - 1].audioParams - frames[0].audioParams : 0,
    longTasks: dump.longTasks.length,
    glLive: dump.glLive,
  };
}

/**
 * ONE ROW OF THE MATRIX — and a row that caught no frames is not a row.
 *
 * `reduce` over an empty frame array returns a clean set of zeroes, and zeroes
 * in a performance matrix read as FREE. That is how `deaths x7` sat at 0.00 ms
 * on all three tiers claiming seven deaths cost nothing, and `on fire` does the
 * same on any tier where the recording caught nothing — on this box the high
 * tier renders a frame in seconds, so a scene can genuinely produce none.
 *
 * The guard is HERE rather than at each call site because every scene in the
 * matrix comes through this function, and the next scene somebody adds will
 * come through it too. UNMEASURED is a fact about the run; 0.00 ms is a claim
 * about the game.
 */
function printRow(label, r) {
  if (!r.frames) {
    say(`  ${label.padEnd(26)}   UNMEASURED — the recording caught no frames on this tier`);
    return;
  }
  say(`  ${label.padEnd(26)} ${f2(r.js.p50).padStart(7)} ${f2(r.js.p95).padStart(7)} ` +
    `${f2(r.js.p99).padStart(7)} ${f2(r.js.worst).padStart(8)}  ${f0(r.draws).padStart(6)} ` +
    `${f0(r.tris / 1000).padStart(7)}k ${f0(r.fbo).padStart(5)} ${f0(r.allocPerFrameKb).padStart(7)} ` +
    `${f2(r.gcPerMin).padStart(6)} ${f0(r.audioLive).padStart(6)}  ${r.frames}`);
}
const HEAD = "  " + "scene".padEnd(26) + "    p50     p95     p99    worst   draws     tris  fbo  kB/f  gc/min  voices  n";

// ------------------------------------------------------------------
// Server plumbing
// ------------------------------------------------------------------
let server;
function waitForServer(url, timeoutMs = 240000) {
  const started = Date.now();
  return new Promise((ok, fail) => {
    const poll = async () => {
      try { const r = await fetch(url); if (r.ok || r.status === 404) return ok(); } catch { /* wait */ }
      if (Date.now() - started > timeoutMs) return fail(new Error("server never came up"));
      setTimeout(poll, 700);
    };
    poll();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(120);
  }
}

// ------------------------------------------------------------------
// THE ABLATIONS. The served JavaScript is rewritten in flight; disk is
// never touched. Every patch is counted, and a patch that matched
// nothing invalidates its own experiment.
// ------------------------------------------------------------------
async function installPatches(page, patches) {
  const hits = Object.fromEntries(patches.map((p) => [p.name, 0]));
  if (!patches.length) return hits;
  // EVERY EXIT FROM THIS HANDLER IS AWAITED AND GUARDED, and that is not
  // defensiveness — it is the difference between this file producing a table
  // and producing nothing at all.
  //
  // The last `route.fulfill` was fire-and-forget. When the page navigates away
  // while a request is still in flight, Playwright disposes the response and
  // the fulfill rejects with "Fetch response has been disposed" — from inside a
  // handler nobody is awaiting, so it surfaces as an UNCAUGHT PROMISE REJECTION
  // and takes the whole process down mid-run:
  //
  //   route.fulfill: Fetch response has been disposed
  //       at tools/fpstest.mjs:439
  //   Node.js v22.22.2
  //
  // Every ablation after the one that crashed simply never ran, which is one of
  // the two reasons `ablationRows` has been empty. A route that cannot be
  // fulfilled is a request the page has already abandoned; dropping it is
  // correct and it must not be fatal.
  const settle = async (fn) => { try { await fn(); } catch { /* the page moved on */ } };
  await page.route("**/*.js*", async (route) => {
    let res;
    try { res = await route.fetch(); } catch { return settle(() => route.abort()); }
    let body;
    try { body = await res.text(); } catch { return settle(() => route.fulfill({ response: res })); }
    let touched = false;
    for (const p of patches) {
      for (const [from, to] of p.subs) {
        const parts = body.split(from);
        if (parts.length > 1) { hits[p.name] += parts.length - 1; body = parts.join(to); touched = true; }
      }
    }
    if (!touched) return settle(() => route.fulfill({ response: res }));
    await settle(() => route.fulfill({ response: res, body }));
  });
  return hits;
}

/**
 * Both spellings of every switch: the dev server ships readable TypeScript
 * output, the production build ships `flag:!0`. A patch set that only knew
 * one of them would silently do nothing against the other.
 */
const flagOff = (flag) => [[`${flag}: true`, `${flag}: false`], [`${flag}:!0`, `${flag}:!1`]];
const numTo = (key, ...vals) => vals.flatMap((v) => [[`${key}: ${v}`, `${key}: 0`], [`${key}:${v}`, `${key}:0`]]);

const ABLATIONS = [
  { name: "baseline", subs: [] },
  { name: "no postfx (whole chain)", subs: flagOff("postProcessing") },
  { name: "no AO (GTAO alone)", subs: flagOff("ambientOcclusion") },
  { name: "no bloom", subs: flagOff("bloom") },
  { name: "no DoF", subs: flagOff("depthOfField") },
  { name: "no grade+vignette", subs: [...flagOff("colorGrade"), ...flagOff("vignette")] },
  { name: "no shadows", subs: flagOff("shadows") },
  {
    name: "no particles", subs: [
      ...numTo("particleBudget", 3000, 1200, 400),
      ...numTo("moteCount", 220, 140, 60),
      ...numTo("decalBudget", 64, 24, 8),
      ...flagOff("trails"),
    ],
  },
  { name: "no 3D HUD damage nums", subs: numTo("damageNumberBudget", 48, 24, 12) },
  { name: "no dynamic torch lights", subs: numTo("dynamicLights", 5, 3, 1) },
  { name: "no props (density 0)", subs: [["propDensity: 1,", "propDensity: 0,"], ["propDensity:1,", "propDensity:0,"]] },
];

// The audio engine cannot be turned off by a quality flag — it has none. It is
// silenced at the browser boundary instead: the context is real, so nothing in
// the module errors, but every node it builds is inert and the graph never
// runs. What this measures is the MAIN-THREAD cost of building the graph plus
// the audio thread's own churn, which is exactly the question.
const MUTE_AUDIO = () => {
  const R = window.AudioContext || window.webkitAudioContext;
  if (!R) return;
  const Silent = function (...a) {
    const ac = new R(...a);
    try { ac.suspend(); } catch { /* ok */ }
    const orig = ac.resume.bind(ac);
    ac.resume = () => Promise.resolve();
    void orig;
    return ac;
  };
  Silent.prototype = R.prototype;
  window.AudioContext = Silent;
  if (window.webkitAudioContext) window.webkitAudioContext = Silent;
};

// ------------------------------------------------------------------
// Browser + page
// ------------------------------------------------------------------
async function launch() {
  // THE HONESTY CLAUSE ABOVE HAS A DOOR NOW. The rasteriser is
  // `tools/lib/browser.mjs`'s choice and software is still the default, so
  // every number this file has ever printed is reproducible — but on a machine
  // with a GPU, `BRETWALDA_GPU=1` is the difference between "SwiftShader's fill
  // rate, which says nothing about a phone" and a frame time that means
  // something. The CPU-side and GL-boundary numbers this file reports are true
  // either way; the ABLATION's ranking is what a software rasteriser destroys,
  // because it prices every cut in units of a fill rate no player has.
  return chromium.launch(launchOptions([
    "--enable-precise-memory-info",
    // The synthesiser must be allowed to build its graph without a gesture,
    // or the audio numbers would all be zero and the ablation meaningless.
    "--autoplay-policy=no-user-gesture-required",
    "--js-flags=--expose-gc",
  ]));
}

async function openPage(browser, tier, { patches = [], mute = false } = {}) {
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(PROBE);
  // A WARRIOR WITH NO NAME NEVER RAISES A ROOM, and that is the whole of why
  // `ablationRows` has been empty.
  //
  // `raiseMoot` presses CREATE BATTLE -> mode -> 1 ROUND -> CREATE ROOM and then
  // waits sixty seconds for the server's `join` to carry a war code back. The
  // landing screen asks for a warrior name first, and this file never gave one,
  // so every single scene in this harness died on
  //
  //   baseline: run failed — Error: timed out waiting for the war code
  //
  // and with no `baseline` row the ranked table below cannot be built at all —
  // `out.ablation` sits behind `if (base)`. `tools/summaryflow.mjs` has seeded
  // this key since it was written; this file simply never did. It is seeded
  // rather than typed because the name has to exist before the page's first
  // render reads it (`page.tsx:506`), and a keystroke after load is a race.
  await page.addInitScript(() => {
    try { window.localStorage.setItem("bretwalda_name", "Prober"); } catch { /* private mode */ }
  });
  if (mute) await page.addInitScript(MUTE_AUDIO);
  const hits = await installPatches(page, patches);
  page.on("pageerror", (e) => note(`page error: ${String(e).slice(0, 160)}`));
  await page.goto(`http://127.0.0.1:${PORT}/?quality=${tier}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  return { ctx, page, hits };
}

/** Records a steady window and returns the reduction. */
async function record(page, seconds = SECS) {
  await page.evaluate(() => window.__fps.reset());
  await sleep(seconds * 1000);
  const dump = await page.evaluate(() => window.__fps.dump());
  return { dump, r: reduce(dump) };
}

// ------------------------------------------------------------------
// Scenes
// ------------------------------------------------------------------

/** Training, one bot: the plain one-on-one. */
async function reachDuel(page) {
  await page.getByText("Training", { exact: false }).first().click();
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
  const fewer = page.getByLabel("Fewer AI warriors");
  for (let i = 0; i < 8 && await fewer.isEnabled().catch(() => false); i++) await fewer.click();
  await page.getByLabel("More AI warriors").click();
  await page.getByText("DRAW STEEL", { exact: false }).first().click();
  await until(() => page.evaluate(() => window.__probe?.latest?.state === "fighting"), "the duel", 300000);
  const canvas = page.locator("canvas");
  await canvas.click({ position: { x: 320, y: 200 } }).catch(() => {});
}

// ------------------------------------------------------------------
// PHASE: the matrix. Tier x scene state.
// ------------------------------------------------------------------
async function matrix(browser, results) {
  say("\n=== MATRIX — cpu ms per frame by tier and scene state ===");
  say("  (p50/p95/p99/worst are JavaScript main-thread ms inside one animation frame)");
  say(HEAD);
  for (const tier of TIERS) {
    const { ctx, page } = await openPage(browser, tier);

    // ---- the pre-fight screen: DOM lobby with the character preview ----
    await sleep(2500);
    const menu = await record(page, Math.min(6, SECS));
    results.push({ tier, scene: "menu (DOM + preview)", ...menu.r });
    printRow(`${tier} · menu`, menu.r);

    // ---- one on one ----
    await reachDuel(page);
    await sleep(3000);
    const duel = await record(page);
    results.push({ tier, scene: "one-on-one", ...duel.r });
    printRow(`${tier} · one-on-one`, duel.r);
    await ctx.close();

    // ---- the eight-man moot: brawl, fire, deaths, summary ----
    const moot = await openPage(browser, tier);
    let wires = [];
    try {
      ({ wires } = await raiseMoot(moot.page, "ffa", { port: PORT, until, sleep }));
    } catch (e) {
      note(`${tier}: could not raise the moot — ${String(e).slice(0, 120)}`);
      await moot.ctx.close();
      continue;
    }

    // Countdown has already gone by the time `fighting` lands; the idle arena
    // is measured here instead, with eight men standing and only the bonfire
    // and the torches moving. This is the honest stand-in for "lobby": the
    // in-canvas lobby orbit is only reachable between rounds of a best-of-N.
    await sleep(1500);
    const brawl = await record(moot.page, SECS);
    results.push({ tier, scene: "eight-man brawl", ...brawl.r });
    printRow(`${tier} · eight-man brawl`, brawl.r);

    // ---- someone on fire ----
    const drive = driveIntoTheFire(wires);
    await until(async () => moot.page.evaluate(() =>
      Object.values(window.__probe?.latest?.players ?? {}).some((p) => p.burning)),
      "a man alight", 90000).catch(() => note(`${tier}: nobody caught light in time`));
    const fire = await record(moot.page, SECS);
    const burning = await moot.page.evaluate(() =>
      Object.values(window.__probe?.latest?.players ?? {}).filter((p) => p.burning).length);
    results.push({ tier, scene: `on fire (x${burning})`, ...fire.r });
    printRow(`${tier} · on fire (x${burning})`, fire.r);

    // ---- deaths with gore: SLICED OUT OF THE FIRE RECORDING ----
    //
    // This used to reset the frame buffer, wait for the match to end, and slice
    // the result by the kill feed. It measured nothing on every tier and every
    // run, and printed `deaths x7` at 0.00 ms while doing it — a scene reported
    // as FREE in a performance matrix, which is the same shape as a gate that
    // passes because its case is absent, and worse, because wave D is a
    // performance wave that would have been planned off a row saying seven
    // deaths cost nothing.
    //
    // TWO REASONS IT COULD NOT WORK, and the second is why moving the slice is
    // the fix rather than filtering harder:
    //
    //   1. the kill feed is the WHOLE SESSION's, on purpose — the probe is also
    //      how this harness knows a match progressed — so the seven kills were
    //      all from the brawl and the fire above, every window closed before the
    //      first held frame opened, and `reduce` returned zeroes over an empty
    //      array;
    //   2. `record()` RESETS at its start, so the men are killed inside the fire
    //      recording and its frames are wiped by the next reset. There is no
    //      later moment when the frames and the kills coexist — by `matchEnd`
    //      the killing is long over.
    //
    // So the gore frame is taken where the gore is: `fire.dump` holds the frames
    // of the recording during which `driveIntoTheFire` was burning men down, and
    // its own `markT` says which kills fall inside it.
    const killRun = fire.dump;
    // 1.2 s after each kill: the gore burst, the ragdoll, the kill feed, the
    // audio event and the HUD plate all land inside that window.
    const fresh = killRun.kills.filter((k) => k.t >= (killRun.markT || 0));
    const windows = fresh.map((k) => [k.t, k.t + 1200]);
    if (windows.length) {
      const death = reduce(killRun, windows);
      // A reduce over an empty selection returns zeroes, and zeroes in a
      // performance matrix read as "free". Never print one — and do not skip
      // the rest of the tier either: the summary stage and the GL census below
      // are real measurements that have nothing to do with the gore frame.
      if (!death.frames) {
        note(`${tier}: ${windows.length} kill window(s) caught no frames, so the gore frame is unmeasured`);
      } else {
        const rest = reduce(killRun, killRun.frames.length
          ? [[killRun.frames[0].t, killRun.frames[killRun.frames.length - 1].t]] : []);
        results.push({ tier, scene: `deaths (${windows.length} kills)`, ...death });
        printRow(`${tier} · deaths x${windows.length}`, death);
        note(`whole match for comparison: p50 ${f2(rest.js.p50)} ms, p99 ${f2(rest.js.p99)} ms, worst ${f2(rest.js.worst)} ms`);
      }
    } else {
      note(`${tier}: no kills landed inside the recorded frames (${killRun.kills.length} in the whole `
        + `session, 0 after the buffer was reset), so the gore frame is unmeasured — `
        + `REPORTED AS ABSENT, never as zero`);
    }

    // ---- the summary stage ----
    // The wait for the match to end lives here now: it is what the summary
    // stage needs, and it was never what the gore frame needed.
    await until(() => moot.page.evaluate(() => window.__probe?.matchEnd || null),
      "the match to end", 240000).catch(() => note(`${tier}: match did not end in time`));
    clearInterval(drive);
    await sleep(2500);
    const summary = await record(moot.page, Math.min(10, SECS));
    results.push({ tier, scene: "summary stage", ...summary.r });
    printRow(`${tier} · summary stage`, summary.r);

    // Live GL object census, taken once per tier at its fullest.
    const live = summary.dump.glLive;
    if (live) {
      note(`GL objects live at tier ${tier}: ${live.textures} textures, ${live.buffers} buffers, ` +
        `${live.programs} programs, ${live.fbos} framebuffers, ${live.vaos} VAOs`);
    }
    note(`audio: ${summary.dump.audio.built} nodes built all match, ` +
      `${summary.dump.audio.params} param automations, ${summary.dump.audio.contexts} contexts`);
    await moot.ctx.close();
  }

  // AND THE JSON DOES NOT CARRY A ZERO ROW EITHER.
  //
  // `printRow` refuses to draw one, but `art/perf/fpstest.json` is what a later
  // pass will actually read, and a row of zeroes there is indistinguishable
  // from a scene that was measured and found free. They come OUT of the array
  // and are NAMED in the run instead: which scenes failed to record is a fact
  // about this box worth reading, and it is on the console where a person will
  // see it, rather than in the file where an average will.
  const dead = results.filter((r) => !r.frames);
  if (dead.length) {
    for (let i = results.length - 1; i >= 0; i--) if (!results[i].frames) results.splice(i, 1);
    say(`\n  ${dead.length} scene(s) recorded no frames and are reported as UNMEASURED, not as zero: `
      + dead.map((r) => `${r.tier}/${r.scene}`).join(", "));
  }
}

// ------------------------------------------------------------------
// PHASE: ablation. Disable one thing, re-measure the SAME scene.
// ------------------------------------------------------------------
async function ablation(browser, out) {
  const tier = TIERS.includes("high") ? "high" : TIERS[TIERS.length - 1];
  say(`\n=== ABLATION — one thing off at a time, tier ${tier}, eight-man brawl ===`);
  say("  Ranked by JS ms recovered at p50. A patch that matched nothing is void.");
  say(HEAD);
  const rows = [];
  const jobs = [...ABLATIONS.map((a) => ({ ...a, mute: false })),
  { name: "no audio engine", subs: [], mute: true }];

  for (const job of jobs) {
    let page, ctx, hits;
    try {
      ({ page, ctx, hits } = await openPage(browser, tier, { patches: job.subs.length ? [job] : [], mute: job.mute }));
    } catch (e) { note(`${job.name}: could not open — ${String(e).slice(0, 100)}`); continue; }

    // THE PATCH IS COUNTED AFTER THE SCENE IS UP, NOT AFTER THE PAGE LOADS.
    //
    // This read `hits` here — immediately after `openPage` — and discarded any
    // job whose count was zero. At that moment the browser has fetched the
    // LANDING screen and nothing else: measured, thirteen `.js` responses and
    // just over a megabyte, and **not one of them contains `postProcessing:!0`**.
    // The renderer's chunk is lazy and does not arrive until the canvas mounts,
    // which is after `raiseMoot`. So every one of the ten code ablations was
    // thrown away before it had any chance to land, every run, and that is the
    // second reason `ablationRows` has been empty.
    //
    // The route is installed for the life of the page, so the patch DOES apply
    // when the chunk finally comes; only the accounting was early. The check
    // moves below the moot, where the number it reads is the number that
    // matters. `hits` is mutated in place by the handler, so it is simply read
    // later — nothing else has to change.
    try {
      await raiseMoot(page, "ffa", { port: PORT, until, sleep });
      await sleep(2500);
      const landed = job.subs.length ? (hits[job.name] || 0) : 1;
      if (job.subs.length && landed === 0) {
        note(`${job.name}: PATCH MISSED — nothing in the served bundle matched once the scene was up, result discarded`);
        await ctx.close();
        continue;
      }
      const { r } = await record(page, SECS);
      rows.push({ name: job.name, landed, ...r });
      printRow(job.name, r);
    } catch (e) {
      note(`${job.name}: run failed — ${String(e).slice(0, 120)}`);
    }
    await ctx.close();
  }

  const base = rows.find((x) => x.name === "baseline");
  if (base) {
    const ranked = rows.filter((x) => x !== base)
      .map((x) => ({
        name: x.name,
        p50: base.js.p50 - x.js.p50,
        p99: base.js.p99 - x.js.p99,
        draws: base.draws - x.draws,
        fbo: base.fbo - x.fbo,
        alloc: base.allocPerFrameKb - x.allocPerFrameKb,
        frames: x.frames,
      }))
      .sort((a, b) => b.p50 - a.p50);

    // ============================================================
    // AND THE TABLE SAYS WHETHER IT IS AN ORDERING OR A LIST.
    //
    // `ablationRows` being EMPTY was the recorded fault and it is fixed — all
    // eleven ablations run and every patch lands. What replaced it is worse,
    // because it looks like an answer: eleven rows, sorted by cost, computed
    // off a handful of frames on a box with no GPU. A sorted table is read as
    // an attribution whatever the header three hundred lines up says about
    // SwiftShader, and `docs/BACKLOG.md` wave D is a performance wave that was
    // going to be planned off this.
    //
    // Two tests, and both are properties of the run rather than opinions:
    //
    //   SAMPLE   a frame here takes seconds, so a 14 s recording is single
    //            digits of frames. A p50 over four frames is the second-fastest
    //            of four.
    //   SIGN     removing work cannot make the frame slower. Every ablation
    //            that comes out NEGATIVE is a direct read of the noise floor,
    //            measured in the same units as the thing being ranked — no
    //            model needed. When the largest negative is comparable to the
    //            largest positive, the ordering is the noise's, not the
    //            renderer's.
    //
    // Failing either, the rows still print — they cost twenty minutes and the
    // draw and FBO columns are exact counts rather than timings, so they are
    // worth reading — but they print as a LIST, and `out.ablation` is left
    // null so nothing downstream can quietly sort by it.
    const ABLATION_MIN_FRAMES = 30;
    const thin = rows.filter((x) => x.frames < ABLATION_MIN_FRAMES);
    const worstNeg = Math.min(0, ...ranked.map((x) => x.p50));
    const bestPos = Math.max(0, ...ranked.map((x) => x.p50));
    const noiseSwamps = bestPos <= 0 || -worstNeg >= bestPos * 0.5;
    const trustworthy = thin.length === 0 && !noiseSwamps;

    say(trustworthy
      ? "\n  RANKED BY WHAT THEY COST (baseline minus ablated, JS ms per frame):"
      : "\n  NOT A RANKING — the run cannot support one. Rows in run order; read the draw and FBO\n"
        + "  columns, which are counts, and not the millisecond columns, which are timings:");
    say("  " + "what was removed".padEnd(28) + "  ms@p50   ms@p99   draws    fbo   kB/frame  frames");
    for (const x of (trustworthy ? ranked : rows.filter((r) => r !== base).map((r) => ({
      name: r.name, p50: base.js.p50 - r.js.p50, p99: base.js.p99 - r.js.p99,
      draws: base.draws - r.draws, fbo: base.fbo - r.fbo,
      alloc: base.allocPerFrameKb - r.allocPerFrameKb, frames: r.frames,
    })))) {
      say(`  ${x.name.padEnd(28)} ${f2(x.p50).padStart(7)} ${f2(x.p99).padStart(8)} ` +
        `${f0(x.draws).padStart(7)} ${f0(x.fbo).padStart(6)} ${f2(x.alloc).padStart(10)} ${f0(x.frames).padStart(7)}`);
    }
    if (!trustworthy) {
      if (thin.length) {
        say(`  WHY: ${thin.length} of ${rows.length} rows recorded fewer than ${ABLATION_MIN_FRAMES} frames `
          + `(fewest ${Math.min(...rows.map((x) => x.frames))}). A p50 over that many frames is an order statistic of a handful.`);
      }
      if (noiseSwamps) {
        say(`  WHY: removing work cannot make a frame slower, and the most NEGATIVE cost here is `
          + `${f2(worstNeg)} ms against a best positive of ${f2(bestPos)} ms. That negative IS the noise floor, `
          + `in the same units as the ranking.`);
      }
      // R8, AND THE REASON THIS IS CONDITIONAL. This line used to say, flatly,
      // "this box has no GPU and rasterises through SwiftShader" — which was
      // true of the box the file was written on and is a LIE on any other. The
      // first GPU run of this matrix printed that sentence under a refusal it
      // had nothing to do with, which would have sent the next round to buy
      // hardware it already had. A gate that explains its own refusal wrongly
      // is worse than one that refuses without explaining.
      if (useGpu) {
        say("  WHAT WOULD FIX IT: this run had a real GPU, so the rasteriser is NOT the reason — "
          + "the rows are\n  simply too short for the differences in them. Raise --secs until the "
          + "noise floor above is small\n  against the smallest cut you care about, and re-run. The "
          + "draw, FBO and kB columns are counts,\n  not timings, and they are trustworthy at any "
          + "length.");
      } else {
        say("  WHAT WOULD FIX IT: this run rasterised in SOFTWARE, where one frame can take seconds "
          + "and\n  every row is a handful of samples. Re-run with BRETWALDA_GPU=1 on a machine that "
          + "has a GPU,\n  and raise --secs far enough that every row clears the frame floor.");
      }
    }
    out.ablation = trustworthy ? ranked : null;
    out.ablationTrust = {
      trustworthy, minFrames: ABLATION_MIN_FRAMES,
      fewestFrames: Math.min(...rows.map((x) => x.frames)),
      worstNegativeMs: worstNeg, bestPositiveMs: bestPos,
    };
  }
  out.ablationRows = rows;
}

// ------------------------------------------------------------------
// PHASE: attribution. A real sampling profile, bucketed by module.
// ------------------------------------------------------------------
const BUCKETS = [
  [/\(garbage collector\)|\(program\)/i, "GC / VM"],
  [/three\/|three_|\/three\b|node_modules_three/i, "three.js core"],
  [/postfx|GTAOPass|postprocessing|SMAAPass|EffectComposer/i, "postfx chain"],
  [/vfx/i, "particles / vfx"],
  [/hud3d|GameHud/i, "HUD"],
  [/audio/i, "audio synthesis"],
  [/anim|characters/i, "animation + bodies"],
  [/summary/i, "summary stage"],
  [/world|sky|lighting|textures|materials|grounds/i, "world / sky / lights"],
  [/react-dom|react_|scheduler/i, "React"],
  [/GameCanvas/i, "frame loop glue"],
  [/camera|input|transport|bindings|quality/i, "camera / input / net"],
];
function bucketOf(url, fn) {
  const hay = `${url} ${fn}`;
  for (const [re, name] of BUCKETS) if (re.test(hay)) return name;
  if (!url) return "VM / native";
  return "other app code";
}

async function attribute(browser, out) {
  const tier = TIERS.includes("high") ? "high" : TIERS[TIERS.length - 1];
  say(`\n=== ATTRIBUTION — where the JS milliseconds go (tier ${tier}, eight-man brawl) ===`);
  const { ctx, page } = await openPage(browser, tier);
  try {
    await raiseMoot(page, "ffa", { port: PORT, until, sleep });
  } catch (e) {
    note(`could not raise the moot for the profile — ${String(e).slice(0, 120)}`);
    await ctx.close();
    return;
  }
  await sleep(2500);

  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("Profiler.start");
  await sleep(SECS * 1000);
  const { profile } = await cdp.send("Profiler.stop");
  await ctx.close();

  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  let total = 0;
  const gcRuns = [];
  let run = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = (profile.timeDeltas[i] || 0) / 1000; // µs -> ms
    if (dt <= 0 || dt > 200) { /* clock jumps are not work */ }
    const n = byId.get(profile.samples[i]);
    if (!n) continue;
    const cf = n.callFrame || {};
    const b = bucketOf(cf.url || "", cf.functionName || "");
    const add = Math.max(0, Math.min(dt, 250));
    self.set(b, (self.get(b) || 0) + add);
    total += add;
    if (/garbage collector/i.test(cf.functionName || "")) run += add;
    else if (run > 0) { gcRuns.push(run); run = 0; }
  }
  if (run > 0) gcRuns.push(run);

  const rows = [...self.entries()].sort((a, b) => b[1] - a[1]);
  say("  " + "bucket".padEnd(24) + "   ms total    share");
  for (const [name, ms] of rows) {
    if (ms < 0.5) continue;
    say(`  ${name.padEnd(24)} ${f0(ms).padStart(9)} ${((ms / total) * 100).toFixed(1).padStart(8)}%`);
  }
  const gc = dist(gcRuns);
  say(`\n  GC: ${gcRuns.length} collections in ${f0(total)} ms of samples — ` +
    `p50 ${f2(gc.p50)} ms, p99 ${f2(gc.p99)} ms, worst ${f2(gc.worst)} ms`);
  out.attribution = { total, rows, gc: { count: gcRuns.length, ...gc } };

  // The heaviest individual functions, which is where a fix actually lands.
  const fnSelf = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = (profile.timeDeltas[i] || 0) / 1000;
    const n = byId.get(profile.samples[i]);
    if (!n) continue;
    const cf = n.callFrame || {};
    const key = `${cf.functionName || "(anonymous)"}  ${(cf.url || "").split("/").pop() || ""}:${cf.lineNumber ?? ""}`;
    fnSelf.set(key, (fnSelf.get(key) || 0) + Math.max(0, Math.min(dt, 250)));
  }
  say("\n  hottest individual frames:");
  for (const [k, ms] of [...fnSelf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)) {
    say(`    ${f0(ms).padStart(7)} ms  ${k}`);
  }
  out.hot = [...fnSelf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
}

// ------------------------------------------------------------------
// PHASE: the server tick. No GPU in this number at all.
// ------------------------------------------------------------------
async function serverTicks(browser, out) {
  say("\n=== SERVER TICK — measured in Node, where there is no renderer to blame ===");
  const { ctx, page } = await openPage(browser, "low");
  let wires;
  try { ({ wires } = await raiseMoot(page, "ffa", { port: PORT, until, sleep })); }
  catch (e) { note(`could not raise a moot — ${String(e).slice(0, 120)}`); await ctx.close(); return; }

  const stamps = [];
  const w = wires[0];
  w.ws.addEventListener("message", (ev) => {
    try { const m = JSON.parse(ev.data); if (m.data && m.data.players) stamps.push(performance.now()); }
    catch { /* ok */ }
  });
  const drive = driveIntoTheFire(wires.slice(1));
  await sleep(20000);
  clearInterval(drive);

  const gaps = [];
  for (let i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
  const d = dist(gaps);
  say(`  ${gaps.length} snapshots over 20 s — target is 20 Hz / 50.00 ms`);
  say(`  interval  p50 ${f2(d.p50)} ms   p95 ${f2(d.p95)} ms   p99 ${f2(d.p99)} ms   worst ${f2(d.worst)} ms   mean ${f2(d.mean)} ms`);
  const late = gaps.filter((g) => g > 75).length;
  say(`  ticks more than 25 ms late: ${late} of ${gaps.length} (${((late / (gaps.length || 1)) * 100).toFixed(1)}%)`);
  out.serverTick = { n: gaps.length, ...d, late };
  await ctx.close();
}

// ------------------------------------------------------------------
// PHASE: the live production server, over the real internet.
// ------------------------------------------------------------------
async function liveNet(out) {
  say("\n=== LIVE — round trip to the production server ===");
  const rtts = [];
  for (let i = 0; i < 12; i++) {
    const t0 = performance.now();
    try {
      const r = await fetch(`${LIVE}/api/health`, { cache: "no-store" });
      await r.text();
      rtts.push(performance.now() - t0);
    } catch (e) {
      note(`request ${i + 1} failed: ${String(e).slice(0, 90)}`);
    }
    await sleep(400);
  }
  if (!rtts.length) { say("  unreachable from this box — nothing measured"); return; }
  const d = dist(rtts);
  say(`  GET /api/health x${rtts.length}  p50 ${f2(d.p50)} ms  p95 ${f2(d.p95)} ms  worst ${f2(d.worst)} ms`);
  say(`  (first request includes TLS + any cold start; this box also goes through a proxy)`);
  out.live = { n: rtts.length, ...d };
}

// ------------------------------------------------------------------
async function main() {
  mkdirSync(OUT, { recursive: true });
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID")) && process.env.FPSTEST_DEV !== "1";
  say(`[fpstest] server: ${useProd ? "production build" : "dev build"} on :${PORT}`);
  say(`[fpstest] viewport ${VIEW.width}x${VIEW.height} @dpr1 — small ON PURPOSE, see the header`);
  server = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  watchBoot(server, "fpstest");
  server.stderr.on("data", (b) => { const s = String(b); if (/error/i.test(s)) note(`server: ${s.trim().slice(0, 160)}`); });
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);

  const browser = await launch();
  const out = { matrix: [], when: new Date().toISOString(), prod: useProd, view: VIEW };

  // What is actually drawing, said once and plainly.
  const probe = await openPage(browser, "low");
  const gpu = await probe.page.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    const d = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : "unknown",
      cores: navigator.hardwareConcurrency, dpr: window.devicePixelRatio,
      mem: !!performance.memory,
    };
  });
  say(`[fpstest] rasteriser: ${gpu.renderer}`);
  say(`[fpstest] cores ${gpu.cores}, dpr ${gpu.dpr}, precise heap ${gpu.mem ? "on" : "OFF (numbers coarse)"}`);
  out.gpu = gpu;
  await probe.ctx.close();

  if (PHASES.includes("matrix")) await matrix(browser, out.matrix);
  if (PHASES.includes("ablation")) await ablation(browser, out);
  if (PHASES.includes("profile")) await attribute(browser, out);
  if (PHASES.includes("server")) await serverTicks(browser, out);
  if (PHASES.includes("live")) await liveNet(out);

  await browser.close();
  writeFileSync(resolve(OUT, "fpstest.json"), JSON.stringify(out, null, 2));
  say(`\n[fpstest] raw numbers written to art/perf/fpstest.json`);
}

main()
  .catch((e) => { console.error("[fpstest] failed:", e); process.exitCode = 1; })
  .finally(() => { if (server && !server.killed) server.kill("SIGTERM"); });
