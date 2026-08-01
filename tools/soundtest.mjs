#!/usr/bin/env node
// ============================================================
// SOUNDTEST — grades audio you cannot listen to.
//
//   npm run soundtest
//
// Sibling of playtest / touchtest / firetest / profiletest: same shape, same
// discipline — measured, not asserted. The problem this file exists to solve is
// stated in docs/SOUND.md: nobody in the loop can hear the game, so "it sounds
// right" is unfalsifiable. The answer is also in there — `OfflineAudioContext`
// renders deterministically and far faster than real time, so the actual
// samples can be asserted on.
//
// It runs in two phases.
//
//   1. CALIBRATION. Renders reference signals of known truth through the real
//      Chromium Web Audio implementation and checks that every instrument in
//      this file reports that truth: peak, envelope length, spectral centroid,
//      concurrent-voice count, silence. A measuring tool that has never been
//      measured is an opinion. This phase runs today and needs no game code.
//
//   2. AUDIT. Loads the game's audio module into the same page and puts the
//      five claims of docs/SOUND.md to it. Sources are transpiled off disk and
//      served through a route intercept, so the module is tested in isolation
//      and NOTHING in src/ has to be edited to make it reachable. This file
//      never fixes a bug it finds — it reports it, so it stays an independent
//      check rather than a mirror of the code.
//
// THE CONTRACT the audit binds to (docs/SOUND.md; names are probed, and the
// one that bound is printed):
//
//   import { createAudioBus } from "@/game/client/audio";
//   const bus = createAudioBus(ctx, { tier: "low" | "medium" | "high" });
//   await bus.unlock();          // arms it. Before this, nothing sounds.
//   bus.emit({ type, hitType, hitZone, weapon, position, at });
//   bus.voices();                // live voice count
//   bus.budget();                // voice cap for the tier
//
// The load-bearing requirement in that contract is that the bus takes its
// context as an ARGUMENT rather than reaching for a module-scope singleton. A
// module that can only ever build its own `AudioContext` cannot be rendered
// offline, and therefore cannot be graded by anything, ever.
//
// Exit codes: 0 all proven, 1 a claim failed, 2 the audio module is not there
// yet (PENDING — loud, and never counted as green).
// ============================================================
import { chromium } from "playwright";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname, join, isAbsolute } from "path";
import { fileURLToPath } from "url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://soundtest.local";
const SR = 44100;

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const note = (s) => console.log(`        ${s}`);

// ------------------------------------------------------------------
// The instruments. Everything below takes a Float32-ish array of the
// rendered mix and returns a number; phase 1 proves each one.
// ------------------------------------------------------------------

const peak = (x) => { let m = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; } return m; };

/**
 * Sounding length in milliseconds: first to last sample that is audibly above
 * the noise floor. The floor is relative to the event's own peak (-45 dB) but
 * never below -80 dBFS absolute, so a quiet event is not measured against
 * silence and a loud one is not padded out by its own dither tail.
 *
 * This is the instrument that catches "a click that rings for two seconds".
 */
function envelopeMs(x, sampleRate = SR) {
  const pk = peak(x);
  if (pk === 0) return 0;
  const floor = Math.max(pk * Math.pow(10, -45 / 20), 1e-4);
  let first = -1, last = -1;
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i]) >= floor) { if (first < 0) first = i; last = i; }
  }
  return first < 0 ? 0 : ((last - first + 1) / sampleRate) * 1000;
}

/** Iterative radix-2 FFT, in place, on real input padded to a power of two. */
function fftMag(x) {
  let n = 1;
  while (n < x.length) n *= 2;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < x.length; i++) {
    // Hann window: without it the frame edges leak broadband energy into the
    // spectrum and every event measures brighter than it is.
    re[i] = x[i] * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (x.length - 1 || 1)));
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  const half = n / 2;
  const mag = new Float64Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i]);
  return { mag, n };
}

/**
 * Spectral centroid in Hz — the "brightness" of an event, and the number that
 * decides whether a shield block and a flesh hit are actually different sounds
 * or the same noise burst wearing two names. Measured over the loudest 4096
 * samples, because the tail of anything is darker than its transient.
 */
function centroidHz(x, sampleRate = SR) {
  if (peak(x) === 0) return 0;
  let at = 0, best = 0;
  const win = Math.min(4096, x.length);
  for (let i = 0; i + win <= x.length; i += win >> 2) {
    let e = 0;
    for (let k = i; k < i + win; k++) e += x[k] * x[k];
    if (e > best) { best = e; at = i; }
  }
  const frame = Array.prototype.slice.call(x, at, at + win);
  const { mag, n } = fftMag(frame);
  let num = 0, den = 0;
  for (let i = 1; i < mag.length; i++) { const f = (i * sampleRate) / n; num += f * mag[i]; den += mag[i]; }
  return den === 0 ? 0 : num / den;
}

/** Max simultaneously-sounding source nodes, from the start/stop log the page keeps. */
function maxConcurrent(events, renderEnd) {
  const edges = [];
  for (const e of events) {
    const a = e.start ?? 0;
    const b = e.stop == null || !isFinite(e.stop) ? renderEnd : Math.max(e.stop, a);
    if (b <= a) continue;
    edges.push([a, 1], [b, -1]);
  }
  edges.sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]));
  let live = 0, max = 0;
  for (const [, d] of edges) { live += d; if (live > max) max = live; }
  return max;
}

// ------------------------------------------------------------------
// Serving src/ to the page. Transpiles TypeScript with the compiler that is
// already a devDependency and rewrites specifiers so relative, "@/" and
// extensionless imports all resolve. No app file is touched.
// ------------------------------------------------------------------

const stubbed = new Set();
const EXTS = ["", ".ts", ".tsx", ".mts", ".mjs", ".js", "/index.ts", "/index.tsx", "/index.mjs"];

/** Module paths are repo-relative; SOUND_MODULE may hand in an absolute one. */
const abs = (p) => (isAbsolute(p) ? p : join(ROOT, p));

function resolveOnDisk(relPath) {
  for (const ext of EXTS) {
    const p = abs(relPath + ext);
    if (existsSync(p) && !p.endsWith("/")) {
      try { if (readFileSync(p).length >= 0) return relPath + ext; } catch { /* directory */ }
    }
  }
  return null;
}

function rewrite(code, fromRel) {
  const dir = dirname(fromRel);
  return code.replace(/(\bfrom\s*|\bimport\s*|\bimport\(\s*)(["'])([^"']+)\2/g, (m, head, q, spec) => {
    let rel = null;
    if (spec.startsWith("@/")) rel = join("src", spec.slice(2));
    else if (spec.startsWith(".")) rel = join(dir, spec);
    if (rel === null) { stubbed.add(spec); return `${head}${q}/stub/${spec}${q}`; }
    const hit = resolveOnDisk(rel);
    if (!hit) { stubbed.add(spec); return `${head}${q}/stub/${spec}${q}`; }
    return `${head}${q}/mod/${hit}${q}`;
  });
}

/**
 * `three` is a bare import and this harness will not pull the renderer into an
 * audio test. The audio module uses it for exactly one thing — Vector3 as a
 * scratch pad for the camera basis — so it gets a fifty-line stand-in. If a
 * future audio module needs more of three than this, that is itself worth
 * knowing: audio should not depend on the renderer.
 */
const THREE_STUB = `
export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { return this.set(a.x - b.x, a.y - b.y, a.z - b.z); }
  multiplyScalar(s) { return this.set(this.x * s, this.y * s, this.z * s); }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  lengthSq() { return this.dot(this); }
  length() { return Math.sqrt(this.lengthSq()); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  crossVectors(a, b) { return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
}
export class Vector2 extends Vector3 {}
export default { Vector3, Vector2 };
`;

const cache = new Map();

function serveModule(relPath) {
  if (cache.has(relPath)) return cache.get(relPath);
  const src = readFileSync(abs(relPath), "utf8");
  const js = /\.(ts|tsx|mts)$/.test(relPath)
    ? ts.transpileModule(src, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
        fileName: relPath,
      }).outputText
    : src;
  const out = rewrite(js, relPath);
  cache.set(relPath, out);
  return out;
}

// ------------------------------------------------------------------
// The page harness. Runs inside Chromium; the only thing that has a real
// OfflineAudioContext. Returns rendered samples and the voice log to Node,
// where all the measuring is done.
// ------------------------------------------------------------------
const PAGE = () => {
  const w = window;
  w.__audioCtorCalls = 0;
  for (const key of ["AudioContext", "webkitAudioContext"]) {
    const Real = w[key];
    if (!Real) continue;
    function Counted(...args) { w.__audioCtorCalls++; return new Real(...args); }
    Counted.prototype = Real.prototype;
    w[key] = Counted;
  }
  // Every scheduled source in the page reports when it starts and stops. This
  // is how voices are counted without asking the module how many it thinks it
  // is playing — the module's own opinion is exactly what is under test.
  //
  // Patching AudioScheduledSourceNode alone is NOT enough and this cost an
  // hour: AudioBufferSourceNode declares its OWN `start` (the three-argument
  // offset/duration form), which shadows the base. A noise-burst synth — which
  // is every impact in a melee game — would then start no counted voices at
  // all and the budget assertion would pass on an empty log. Patch each
  // prototype that owns the method.
  w.__voices = [];
  for (const C of [w.AudioScheduledSourceNode, w.AudioBufferSourceNode, w.OscillatorNode, w.ConstantSourceNode]) {
    const proto = C && C.prototype;
    // `hasOwnProperty`, not a truthiness test: these prototypes inherit from
    // one another, so a plain `proto.__tapped` reads the base's flag and every
    // subclass is skipped — which is the bug this comment used to be.
    if (!proto || Object.prototype.hasOwnProperty.call(proto, "__tapped")) continue;
    if (Object.prototype.hasOwnProperty.call(proto, "start")) {
      const rs = proto.start;
      proto.start = function (when, ...rest) { w.__voices.push(this.__vlog = { start: when ?? 0, stop: null }); return rs.call(this, when, ...rest); };
    }
    if (Object.prototype.hasOwnProperty.call(proto, "stop")) {
      const rp = proto.stop;
      proto.stop = function (when, ...rest) { if (this.__vlog) this.__vlog.stop = when ?? 0; return rp.call(this, when, ...rest); };
    }
    proto.__tapped = true;
  }

  w.__render = async (seconds, sampleRate, fill) => {
    w.__voices = [];
    const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
    await fill(ctx);
    const buf = await ctx.startRendering();
    const data = buf.getChannelData(0);
    return { samples: Array.from(data), voices: w.__voices.map((v) => ({ start: v.start, stop: v.stop })) };
  };
};

async function render(page, seconds, fillBody) {
  return page.evaluate(
    async ({ seconds: s, sampleRate, body }) => window.__render(s, sampleRate, new Function("ctx", `return (async () => { ${body} })()`)),
    { seconds, sampleRate: SR, body: fillBody },
  );
}

// ------------------------------------------------------------------

async function calibrate(page) {
  console.log("\n[soundtest] phase 1 — calibration: do the instruments tell the truth?");

  const sine = (hz, amp, dur) => `
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = ${hz}; g.gain.value = ${amp};
    o.connect(g).connect(ctx.destination); o.start(0); o.stop(${dur});`;

  const a = await render(page, 0.7, sine(1000, 0.5, 0.5));
  const pk = peak(a.samples), cen = centroidHz(a.samples), env = envelopeMs(a.samples);
  check("peak meter reads a known amplitude", Math.abs(pk - 0.5) < 0.02, `1 kHz @ 0.5 measured ${pk.toFixed(4)}`);
  check("centroid meter reads a known frequency", Math.abs(cen - 1000) < 60, `1 kHz measured ${cen.toFixed(0)} Hz`);
  check("envelope meter reads a known duration", Math.abs(env - 500) < 25, `500 ms tone measured ${env.toFixed(0)} ms`);

  const b = await render(page, 0.7, sine(6000, 0.5, 0.5));
  const cenHi = centroidHz(b.samples);
  check("centroid separates a bright signal from a dark one", cenHi / cen > 4, `6 kHz measured ${cenHi.toFixed(0)} Hz — ${(cenHi / cen).toFixed(1)}x the 1 kHz reference`);

  // The bug this whole meter exists to catch, staged deliberately: the same
  // transient, once as a click and once ringing on for a second and a half.
  const clicky = (tau, dur) => `
    const n = ctx.createBufferSource(); const b = ctx.createBuffer(1, ${Math.ceil(2 * SR)}, ${SR});
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (${SR} * ${tau}));
    n.buffer = b; n.connect(ctx.destination); n.start(0); n.stop(${dur});`;
  const short = await render(page, 2.0, clicky(0.004, 0.05));
  const long = await render(page, 2.0, clicky(0.55, 1.9));
  const envShort = envelopeMs(short.samples), envLong = envelopeMs(long.samples);
  check("envelope meter distinguishes a click from a two-second ring",
    envShort < 80 && envLong > 900,
    `click ${envShort.toFixed(0)} ms vs ring ${envLong.toFixed(0)} ms`);

  // Deliberately a MIX of oscillators and buffer sources: a synth built out of
  // noise bursts uses the latter almost exclusively, and an earlier version of
  // this file counted none of them.
  const c = await render(page, 1.0, `
    const burst = () => { const s = ctx.createBufferSource(); const b = ctx.createBuffer(1, ${SR}, ${SR}); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.02; s.buffer = b; return s; };
    for (let i = 0; i < 3; i++) { const o = ctx.createOscillator(); o.frequency.value = 200 + i * 50; const g = ctx.createGain(); g.gain.value = 0.05; o.connect(g).connect(ctx.destination); o.start(0.1); o.stop(0.5); }
    for (let i = 0; i < 2; i++) { const s = burst(); s.connect(ctx.destination); s.start(0.15); s.stop(0.45); }
    for (let i = 0; i < 3; i++) { const s = burst(); s.connect(ctx.destination); s.start(0.6 + i * 0.1); s.stop(0.65 + i * 0.1); }`);
  const conc = maxConcurrent(c.voices, 1.0);
  check("voice counter counts overlapping oscillators AND buffer sources", conc === 5,
    `8 sources scheduled (3 osc + 5 buffer), 5 overlapping — measured ${conc} from ${c.voices.length} logged`);

  const quiet = await render(page, 0.3, `void ctx;`);
  check("silence detector reads digital silence as zero", peak(quiet.samples) === 0, `peak ${peak(quiet.samples)}`);
}

// ------------------------------------------------------------------

const MODULE_CANDIDATES = [
  "src/game/client/audio.ts", "src/game/client/audio/index.ts", "src/game/client/sound.ts",
  "src/game/client/audio/bus.ts", "src/game/client/render/audio.ts", "src/game/audio.ts",
  "src/game/client/audio.mjs", "src/game/audio.mjs",
];
const FACTORIES = ["createAudioBus", "createAudio", "createAudioEngine", "createSoundBus", "makeAudio", "createMixer", "default"];

/**
 * SOUND_MODULE points the audit at a module outside the candidate list. It is
 * how phase 2 was exercised before the game had any audio at all — against a
 * throwaway reference synth, and against a deliberately broken one, to prove
 * these assertions fail when they should rather than only when nothing is here.
 */
function findModule() {
  const forced = process.env.SOUND_MODULE;
  if (forced) {
    if (!existsSync(abs(forced))) throw new Error(`SOUND_MODULE points at nothing: ${forced}`);
    return forced;
  }
  for (const rel of MODULE_CANDIDATES) if (existsSync(abs(rel))) return rel;
  return null;
}

/**
 * Binds whatever the audio module actually exports to one `fire(spec)` call.
 *
 * Two shapes are accepted. The one the game ships is a page singleton —
 * `getAudio()` plus `adopt(context)`, with a method per event — and the second
 * is the generic `createAudioBus(ctx, opts)` + `emit(event)` of docs/SOUND.md.
 * Anything the module does not implement makes `fire` return false rather than
 * throw, so a missing event is reported as a gap instead of crashing the run.
 */
const BIND = `
window.__bind = async (ctx, mod, presets, tier, doAdopt) => {
  let bus = null;
  if (typeof mod.getAudio === "function") {
    bus = mod.getAudio();
    if (doAdopt && typeof bus.adopt === "function") bus.adopt(ctx);
  } else {
    const f = ["createAudioBus", "createAudio", "createSoundBus", "makeAudio", "default"]
      .map((n) => mod[n]).find((v) => typeof v === "function");
    if (f) bus = f(ctx, { tier });
  }
  if (!bus) throw new Error("no factory this harness can drive");
  if (presets && presets[tier] && typeof bus.setQuality === "function") bus.setQuality(presets[tier]);
  const call = (n, e) => (typeof bus[n] === "function" ? (bus[n](e), true) : false);
  const fire = (s) => {
    const at = s.position ? { position: s.position } : {};
    switch (s.k) {
      case "swing": return call("swing", { warriorClass: s.cls || "huscarl", heavy: !!s.heavy, local: true, ...at })
        || call("emit", { type: "swing", weapon: s.cls || "huscarl" });
      case "impact": return call("impact", { material: s.material, damage: s.damage ?? 20, heavy: !!s.heavy, zone: s.zone, local: true, ...at })
        || call("emit", { type: "impact", hitType: s.hitType, hitZone: s.zone });
      case "death": return call("death", { cause: s.cause ?? null, local: true, ...at })
        || call("emit", { type: "death" });
      case "sever": return call("sever", { zone: s.zone || "armR", power: s.power ?? 1, local: true, ...at });
      case "block": return call("block", { local: true, raise: false, ...at });
      case "dodge": return call("dodge", { local: true, ...at });
      case "footfall": return call("footfall", { ground: 0, weight: 0.7, local: true, ...at });
      case "ability": return call("ability", { warriorClass: s.cls || "berserker", local: true, ...at });
      default: return false;
    }
  };
  return { bus, fire };
};
`;

/**
 * One render, one page, one module instance.
 *
 * The engine is a page singleton whose `adopt()` is a no-op once it already
 * holds a context — deliberate in the module, because browsers cap how many
 * AudioContexts a document may hold. It does mean a fresh OfflineAudioContext
 * needs a fresh page, so every render below reloads and re-imports. That costs
 * a fraction of a second and buys total isolation between events, which is
 * worth more: a tail bleeding from one measurement into the next would make
 * every envelope reading a lie.
 */
async function auditRender(page, rel, seconds, opts) {
  const { tier = "high", adopt = true, body } = opts;
  await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(PAGE);
  await page.evaluate(BIND);
  return page.evaluate(async (a) => {
    const mod = await import(a.url);
    let presets = null;
    try { presets = (await import(a.qurl)).QUALITY_PRESETS ?? null; } catch { /* module has no tiers */ }
    const before = window.__audioCtorCalls;
    let bus = null;
    const out = await window.__render(a.seconds, a.sampleRate, async (ctx) => {
      const bound = await window.__bind(ctx, mod, presets, a.tier, a.adopt);
      bus = bound.bus;
      await new Function("ctx", "bus", "fire", `return (async () => { ${a.body} })()`)(ctx, bound.bus, bound.fire);
    });
    out.ctors = window.__audioCtorCalls - before;
    out.exports = Object.keys(mod);
    out.reported = typeof bus?.voiceBudget === "function" ? bus.voiceBudget() : (bus?.voiceBudget ?? null);
    out.live = typeof bus?.voices === "number" ? bus.voices : null;
    out.budgets = mod.AUDIO_BUDGET ?? null;
    return out;
  }, { url: `${ORIGIN}/mod/${rel}`, qurl: `${ORIGIN}/mod/src/game/client/render/quality.ts`, seconds, sampleRate: SR, tier, adopt, body });
}

async function audit(page, rel) {
  console.log(`\n[soundtest] phase 2 — audit: ${rel}`);

  // ---- 4. the autoplay trap, stated as a test ----
  //
  // The module is imported and driven WITHOUT being handed a context, which is
  // the state a real page is in before the player's first tap. Every event is
  // fired at it anyway. Three things must hold: our own context renders exact
  // digital silence, not one source node was scheduled, and the module built no
  // AudioContext of its own at import or under load.
  {
    const locked = await auditRender(page, rel, 1.5, { adopt: false, body: `
      for (let i = 0; i < 6; i++) fire({ k: "impact", material: "flesh", damage: 30 });
      fire({ k: "swing", cls: "berserker", heavy: true });
      fire({ k: "death" }); fire({ k: "sever" }); fire({ k: "block" }); fire({ k: "footfall" });` });
    note(`exports [${locked.exports.join(", ")}]`);
    if (stubbed.size) note(`stubbed non-source imports: ${[...stubbed].join(", ")}`);
    check("nothing is emitted before the context is unlocked",
      peak(locked.samples) === 0 && locked.voices.length === 0,
      `11 events into a locked engine: peak ${peak(locked.samples).toExponential(2)} (must be exactly 0), ${locked.voices.length} sources scheduled`);
    check("no AudioContext is built at import or before a gesture", locked.ctors === 0,
      `${locked.ctors} constructions — any one of them is created suspended on iOS and never recovers`);
  }

  // ---- 1. peak below clipping, including eight simultaneous deaths ----
  {
    const one = await auditRender(page, rel, 2.5, { body: `fire({ k: "death", cause: "blade" });` });
    const eight = await auditRender(page, rel, 2.5, { body: `
      for (let i = 0; i < 8; i++) fire({ k: "death", cause: "blade", position: { x: Math.cos(i) * 3, y: 0, z: Math.sin(i) * 3 } });` });
    const p1 = peak(one.samples), p8 = peak(eight.samples);
    check("a single death does not clip, and is not silence", p1 > 0 && p1 < 0.99, `peak ${p1.toFixed(4)}`);
    check("eight simultaneous deaths do not clip", p8 > 0 && p8 < 0.99,
      `peak ${p8.toFixed(4)} across ${maxConcurrent(eight.voices, 2.5)} concurrent voices — ${(p8 / (p1 || 1)).toFixed(2)}x one death, so a limiter and not 8x`);
  }

  // ---- 2. envelope inside its intended window ----
  {
    const WINDOWS = [
      ["swing huscarl", { k: "swing", cls: "huscarl" }, 40, 500],
      ["swing berserker heavy", { k: "swing", cls: "berserker", heavy: true }, 40, 600],
      ["impact flesh", { k: "impact", material: "flesh", damage: 30 }, 25, 400],
      ["impact shield", { k: "impact", material: "shield", damage: 8 }, 30, 700],
      ["impact mail", { k: "impact", material: "mail", damage: 14 }, 25, 500],
      ["impact parry", { k: "impact", material: "parry", damage: 0 }, 25, 800],
      ["footfall", { k: "footfall" }, 10, 350],
      ["death", { k: "death", cause: "blade" }, 120, 2000],
      ["sever", { k: "sever", zone: "armR" }, 80, 1600],
    ];
    let bad = 0, first = null, skipped = 0;
    for (const [name, spec, lo, hi] of WINDOWS) {
      const r = await auditRender(page, rel, 2.5, { body: `if (!fire(${JSON.stringify(spec)})) window.__unvoiced = true;` });
      const unvoiced = await page.evaluate(() => window.__unvoiced === true);
      if (unvoiced) { skipped++; note(`--   ${name}: not voiced by this module`); continue; }
      const ms = envelopeMs(r.samples);
      const ok = ms >= lo && ms <= hi;
      note(`${ok ? "ok  " : "BAD "} ${name}: ${ms.toFixed(0)} ms (window ${lo}-${hi}), peak ${peak(r.samples).toFixed(3)}, ${r.voices.length} voices`);
      if (!ok) { bad++; first = first ?? `${name} ${ms.toFixed(0)} ms outside ${lo}-${hi}`; }
    }
    check("every event rings inside its intended window", bad === 0,
      bad ? `${bad} outside — first: ${first}` : `${WINDOWS.length - skipped}/${WINDOWS.length} inside${skipped ? `, ${skipped} not voiced` : ""}`);
  }

  // ---- 3. spectral separation ----
  //
  // The module's own header claims flesh sits lowest, then shield, then mail,
  // then the parry's bright ring on top. That is a falsifiable claim and this
  // is where it gets falsified.
  {
    const cen = {};
    for (const material of ["flesh", "shield", "mail", "parry"]) {
      const r = await auditRender(page, rel, 2.0, { body: `fire({ k: "impact", material: ${JSON.stringify(material)}, damage: ${material === "parry" ? 0 : 20} });` });
      cen[material] = centroidHz(r.samples);
    }
    note(`centroids — ${Object.entries(cen).map(([k, v]) => `${k} ${v.toFixed(0)} Hz`).join(", ")}`);
    const ratio = Math.max(cen.shield, cen.flesh) / Math.max(1, Math.min(cen.shield, cen.flesh));
    check("a shield block and a flesh hit do not land in the same place", ratio >= 1.5,
      `${ratio.toFixed(2)}x apart (need 1.5x) — a player must tell them apart without looking`);
    check("the four materials are ordered flesh < shield < mail < parry, as the module claims",
      cen.flesh < cen.shield && cen.shield < cen.mail && cen.mail < cen.parry,
      `${["flesh", "shield", "mail", "parry"].map((k) => `${k} ${cen[k].toFixed(0)}`).join(" < ")}`);
  }

  // ---- 5. voice count never exceeds the tier budget ----
  //
  // A voice is the MODULE's unit and one voice is not one source node — an
  // impact here costs six. Rather than guess the conversion, the same storm is
  // run at all three tiers and two independent things are checked.
  //
  // The second is the one that cannot be faked. If the budget were ignored, the
  // storm would saturate at the same absolute node count on every tier, because
  // the same 60 events are fired each time. Concurrency that tracks the tier's
  // declared cap in proportion is only possible if the cap is what is binding.
  {
    const storm = `
      for (let i = 0; i < 30; i++) {
        const a = { x: Math.cos(i) * 2, y: 0, z: Math.sin(i) * 2 };
        fire({ k: "impact", material: "mail", damage: 18, position: a });
        fire({ k: "swing", cls: "warden", heavy: true, position: a });
      }`;
    const rows = [];
    for (const tier of ["low", "medium", "high"]) {
      const r = await auditRender(page, rel, 2.5, { tier, body: storm });
      const cap = r.budgets?.[tier]?.voices ?? (typeof r.reported === "number" ? r.reported : null);
      rows.push({ tier, cap, conc: maxConcurrent(r.voices, 2.5), live: r.live, pk: peak(r.samples) });
    }
    for (const row of rows) {
      note(`${row.tier}: 60 events -> ${row.conc} concurrent source nodes, module reports ${row.live} live voices against a cap of ${row.cap}, peak ${row.pk.toFixed(3)}`);
    }
    check("the module's own live voice count never exceeds its tier budget",
      rows.every((x) => typeof x.cap === "number" && typeof x.live === "number" && x.live <= x.cap),
      rows.map((x) => `${x.tier} ${x.live}/${x.cap}`).join(", "));

    // Nodes per voice, measured, and it must come out the same on every tier —
    // the events are identical, only the cap changes.
    const ratios = rows.map((x) => x.conc / x.cap);
    const spread = Math.max(...ratios) / Math.min(...ratios);
    check("voice count scales with the tier budget instead of ignoring it",
      spread < 1.15 && rows[0].conc < rows[2].conc,
      `${ratios.map((v, i) => `${rows[i].tier} ${v.toFixed(2)}`).join(", ")} nodes per voice — ${spread.toFixed(3)}x spread (an ignored cap would render the same count on all three)`);

    // And the absolute ceiling, using the measured cost of the most expensive
    // event in the storm.
    const nodes = Math.round(Math.max(...ratios));
    check("no tier exceeds its cap times the measured cost of a voice",
      rows.every((x) => x.conc <= x.cap * nodes),
      rows.map((x) => `${x.tier} ${x.conc}<=${x.cap * nodes}`).join(", ") + ` at ${nodes} nodes/voice`);
  }
}

// ------------------------------------------------------------------

async function main() {
  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    // Deliberately NOT --autoplay-policy=no-user-gesture-required: the locked
    // context is the thing being tested.
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext();
  await ctx.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><meta charset=utf-8><title>soundtest</title>" });
    if (path === "/stub/three") return route.fulfill({ contentType: "text/javascript", body: THREE_STUB });
    if (path.startsWith("/stub")) return route.fulfill({ contentType: "text/javascript", body: "export default {};" });
    if (path.startsWith("/mod/")) {
      const rel = path.slice(5);
      if (!existsSync(abs(rel))) return route.fulfill({ status: 404, body: "no such module" });
      return route.fulfill({ contentType: "text/javascript", body: serveModule(rel) });
    }
    return route.fulfill({ status: 404, body: "not found" });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[page-error] ${e}`));
  await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(PAGE);

  try {
    await calibrate(page);
    const rel = findModule();
    if (rel) await audit(page, rel);
    else {
      console.log("\n[soundtest] phase 2 — audit: SKIPPED, there is no audio module yet.");
      console.log("[soundtest] looked for: " + MODULE_CANDIDATES.join(", "));
      console.log("[soundtest] PENDING — the five claims of docs/SOUND.md are UNPROVEN, not passing.");
      process.exitCode = 2;
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((x) => !x.pass);
  console.log(`\n[soundtest] ${results.length - failed.length}/${results.length} claims proven`);
  if (failed.length) {
    console.log("[soundtest] UNPROVEN: " + failed.map((f) => f.name).join(", "));
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error("[soundtest] failed:", e); process.exitCode = 1; });
