#!/usr/bin/env node
/**
 * FRAMECOST — WHERE THE FRAME GOES, PER MODULE, WITH THE DRAW OFF.
 *
 *   node tools/framecost.mjs                 30 s, seven bots, desktop viewport
 *   node tools/framecost.mjs --secs=60
 *   node tools/framecost.mjs --profile       also take a V8 CPU profile
 *
 * ---------------------------------------------------------------------------
 * WHY, AND THE PREMISE THIS FILE WAS BUILT ON WAS WRONG. It used to open:
 *
 *     "JS work per frame, DRAW SUPPRESSED: p50 17.10 ms ... 17 ms of
 *      JavaScript is already over a 60 Hz frame before a triangle is drawn."
 *
 * That 17.10 ms was `janktest` §3's FRAME INTERVAL, not the work inside a
 * frame. A frame interval of 16.7 ms is vsync BY DEFINITION; reading it as a
 * workload and then panicking about it is failure mode 1 in one line, and this
 * file's own opening paragraph carried it for a round after the harness that
 * produced it had been corrected. It is corrected here too.
 *
 * WHAT THIS FILE ACTUALLY MEASURED, once it existed: main-thread JS work
 * p50 1.20-1.50 ms, p95 2.20-3.90, with a V8 profile 86.2-86.4% idle over
 * 74k samples. There is nothing on the main thread to cut at the median. The
 * TAIL is a different question and this file cannot attribute it — its own
 * UNACCOUNTED line says 61.2% of the frame is outside the wrapped calls, and
 * this box runs three other agents' builds while it measures.
 *
 * What IS large, and what this file is now for, is the SCENE: draw calls and
 * triangles, counted at the WebGL context so the figure is portable off a box
 * with no GPU. A total is not actionable, so the census splits it by the
 * (geometry, material) pair that decides whether three.js can batch it.
 *
 * ---------------------------------------------------------------------------
 * HOW. Two instruments, and they check each other.
 *
 *   MODULE TIMERS   Every `stage.<module>.update(dt, ctx)` in the frame loop is
 *                   wrapped where it is CALLED, so the cost lands on the caller
 *                   and no module has to be modified. Property-anchored, which
 *                   is the rule every patch in `janktest` follows: the minifier
 *                   renames locals and leaves property names alone. Per frame,
 *                   per module, as a distribution — a mean would hide the
 *                   spikes, and the spikes are the defect.
 *
 *   V8 CPU PROFILE  `--profile`, through CDP. Self time by function, which
 *                   catches anything the module split cannot see — allocation,
 *                   GC, and work that happens outside the wrapped calls. The
 *                   names are minified, so each hot frame is reported with its
 *                   script offset AND the 90 characters of bundle text around
 *                   it, which is enough to recognise property names and find it
 *                   in `src/`.
 *
 * THE DRAW IS SUPPRESSED. This box has no GPU and rasterises through
 * SwiftShader at under half a frame a second for a real fight, so leaving the
 * draw on would measure the software rasteriser and nothing else. Every
 * millisecond below is main-thread JavaScript that a real device pays too.
 *
 * IT GATES NOTHING (R4). It is a ruler.
 */
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".jank");
const argv = process.argv.slice(2);
const argOf = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const SECS = Math.max(5, parseInt(argOf("secs", "30"), 10) || 30);
const PROFILE = argv.includes("--profile");
/**
 * WHICH TIER IS BEING COUNTED, AND IT USED TO BE HARDCODED AND UNLABELLED.
 *
 * Both fights below fetched `?quality=low` and every draw-call figure this
 * repository has quoted came off that page without saying so. `low` is the
 * FLOOR of the range, not what a desktop build asks for: on one build, `low`
 * read 747 calls / 391,757 triangles and `high` read 4280 / 3,068,914 — a
 * factor of five and a half. Quoting the low figure as "the Steam number" is
 * an understatement of the thing it is trying to size.
 */
const QUALITY = (() => {
  const q = argOf("quality", "low");
  if (q !== "low" && q !== "medium" && q !== "high") {
    console.log(`  --quality=${q} is not a tier. Use low, medium or high.`);
    process.exit(1);
  }
  return q;
})();
const PORT = parseInt(process.env.PORT || String(4260 + (process.pid % 30)), 10);

const pct = (v, p) => v.length ? v[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))] : NaN;
function stats(values) {
  const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const sum = v.reduce((a, b) => a + b, 0);
  return { n: v.length, sum, mean: sum / v.length, p50: pct(v, 50), p90: pct(v, 90), p95: pct(v, 95), p99: pct(v, 99), max: v[v.length - 1] };
}
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "n/a");
const say = (s = "") => console.log(s);
const rule = (t) => { say(); say("=".repeat(78)); say(t); say("=".repeat(78)); };

/**
 * The modules the frame loop ticks, in the order it ticks them. Each is
 * anchored on `.<name>.<method>(dt, ctx)` — a property path, never an
 * identifier — and every call site is wrapped, because the loop has several
 * (fight, intermission, summary) and which one runs is what is under test.
 */
const MODULES = [
  ["world", "update"], ["sky", "update"], ["lighting", "update"],
  ["rig", "update"], ["vfx", "update"], ["audio", "update"],
  ["hud", "update"], ["postfx", "render"],
];

const PATCHES = {
  nodraw: {
    name: "suppress the draw call",
    subs: [[/\.postfx\.render\((\w+),(\w+)\)/g, `.postfx[window.__fcNoDraw?"__none":"render"]?.($1,$2)`]],
  },
  // The scene, reached by walking up from a drawn warrior. Nothing in the
  // client hands a harness the scene and this is the only handle there is; the
  // same anchor `tools/hudspace.mjs` uses.
  body: {
    name: "note a warrior's group, to reach the scene",
    subs: [[
      `e.group.position.x=t.rx+c,e.group.position.z=t.rz+d,e.group.rotation.y=t.yaw,`,
      `e.group.position.x=t.rx+c,e.group.position.z=t.rz+d,e.group.rotation.y=t.yaw,window.__fcBody&&window.__fcBody(e.group),`,
    ]],
  },
  modules: {
    name: "time every module tick where it is called",
    subs: MODULES.map(([mod, method]) => [
      new RegExp(`\\.${mod}\\.${method}\\((\\w+),(\\w+)\\)`, "g"),
      `.${mod}[window.__fcWrap?window.__fcWrap("${mod}"):"${method}"]($1,$2)`,
    ]),
  },
};

/**
 * `__fcWrap` returns the name of a method that TIMES the real one, installed on
 * the module object the first time it is asked for. Swapping the method name
 * rather than the call keeps the expression and its arguments exactly as the
 * minifier left them — the same discipline `janktest`'s nodraw patch argues at
 * length, and for the same reason: a rewritten argument list is a rewritten
 * program.
 */
const COLLECTOR = () => {
  const w = window;
  w.__fc = { frames: [], cur: null, on: false, marks: {}, gl: { calls: 0, tris: 0 }, glFrames: [], body: null };
  const KEY = "__fcTimed";
  w.__fcWrap = (name) => {
    // The method the call site will actually invoke. Installed lazily on the
    // module's own object, so the wrapper closes over the real method and there
    // is one wrapper per module rather than one per frame.
    return KEY + name;
  };
  // The wrapper cannot be installed from `__fcWrap` — it is handed the NAME
  // before it is handed the object — so it is installed on first use by a
  // Proxy-free trick: the property is defined on Object.prototype as a getter
  // that, on first read for a given object, defines the real wrapper on that
  // object and returns it. One definition per module per page.
  for (const [mod, method] of [["world", "update"], ["sky", "update"], ["lighting", "update"],
                               ["rig", "update"], ["vfx", "update"], ["audio", "update"],
                               ["hud", "update"], ["postfx", "render"]]) {
    const key = KEY + mod;
    Object.defineProperty(Object.prototype, key, {
      configurable: true,
      get() {
        const real = this[method];
        if (typeof real !== "function") return () => {};
        const fn = function (...args) {
          const j = w.__fc;
          if (!j.on || !j.cur) return real.apply(this, args);
          const t0 = performance.now();
          try { return real.apply(this, args); }
          finally { j.cur[mod] = (j.cur[mod] || 0) + (performance.now() - t0); }
        };
        Object.defineProperty(this, key, { value: fn, configurable: true, writable: true });
        return fn;
      },
    });
  }
  w.__fcMark = () => undefined;
  w.__fcBody = (g) => { if (g && !w.__fc.body) w.__fc.body = g; };

  /**
   * THE SCENE CENSUS — what is actually in the frame, and how it is grouped.
   *
   * 625 draw calls is a number with no handle on it. This is the handle: every
   * visible mesh, grouped by the (geometry, material) pair that decides whether
   * three.js can batch it, so the answer to "what is issuing all these calls"
   * is a list rather than a guess. A group of two hundred meshes sharing one
   * geometry and one material is two hundred draw calls that could be ONE
   * instanced call, drawing exactly the same pixels — which is a merge, not a
   * detail reduction, and stays on the right side of R11.
   */
  w.__fcCensus = () => {
    const g = w.__fc.body;
    if (!g) return null;
    let root = g; while (root.parent) root = root.parent;
    const byPair = new Map();
    let meshes = 0, objects = 0;
    root.traverse((o) => {
      objects++;
      if (!o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh) return;
      if (!o.visible) return;
      for (let p = o.parent; p; p = p.parent) if (!p.visible) return;
      meshes++;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      const key = `${o.geometry ? o.geometry.uuid : "-"}|${mat ? mat.uuid : "-"}`;
      const e = byPair.get(key) || { n: 0, name: o.name || "(unnamed)", type: o.type, mat: mat ? mat.type : "-", inst: o.isInstancedMesh ? (o.count || 0) : 0, tris: 0 };
      e.n++;
      const idx = o.geometry && o.geometry.index;
      const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
      e.tris = idx ? idx.count / 3 : pos ? pos.count / 3 : 0;
      if (!e.name || e.name === "(unnamed)") e.name = o.name || e.name;
      byPair.set(key, e);
    });
    // ONE WARRIOR, COUNTED ON HIS OWN. 410 meshes in a scene is a number with
    // nowhere to put the blame; "one man is N of them, and there are eight of
    // him" is the whole answer or it rules the men out.
    let bodyMeshes = 0, bodyTris = 0, bodyShadow = 0;
    g.traverse((o) => {
      if (!(o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) || !o.visible) return;
      bodyMeshes++;
      if (o.castShadow) bodyShadow++;
      const idx = o.geometry && o.geometry.index;
      const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
      bodyTris += idx ? idx.count / 3 : pos ? pos.count / 3 : 0;
    });
    // And how many meshes in the WHOLE scene are asked for twice, once for the
    // picture and once for the shadow map. A shadow-casting mesh is a second
    // draw call, and that is why the GL counter reads higher than the census.
    let casters = 0, lights = 0, shadowLights = 0;
    root.traverse((o) => {
      if (o.isLight) { lights++; if (o.castShadow) shadowLights++; }
      if ((o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) && o.visible && o.castShadow) casters++;
    });
    return { meshes, objects, bodyMeshes, bodyTris, bodyShadow, casters, lights, shadowLights,
             pairs: [...byPair.values()].sort((a, b) => b.n - a.n).slice(0, 12) };
  };

  /**
   * WHAT A REAL GPU WOULD BE ASKED TO DO, counted at the WebGL context and not
   * in the bundle at all.
   *
   * Every millisecond in the module table above is this box's, and this box
   * rasterises in software. What IS portable is the WORK SUBMITTED: how many
   * draw calls a frame issues and how many triangles they carry. Those numbers
   * are the same on a laptop, a phone and a Steam Deck, and they are what
   * decides whether a real device can hold 60 Hz — so they are counted here,
   * by wrapping the context the page is handed, which no bundle change and no
   * minifier can move.
   */
  const GC = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    const gl = GC.call(this, kind, ...rest);
    if (!gl || (kind !== "webgl2" && kind !== "webgl")) return gl;
    if (gl.__fcCounted) return gl;
    gl.__fcCounted = true;
    // Triangle count per primitive mode. Anything that is not a triangle mode
    // is counted as a call with zero triangles rather than guessed at.
    const tris = (mode, count) => {
      if (mode === gl.TRIANGLES) return count / 3;
      if (mode === gl.TRIANGLE_STRIP || mode === gl.TRIANGLE_FAN) return Math.max(0, count - 2);
      return 0;
    };
    for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const real = gl[name];
      if (typeof real !== "function") continue;
      gl[name] = function (mode, a, b, c, d) {
        const g = w.__fc.gl;
        g.calls++;
        // drawElements(mode,count,...) and drawArrays(mode,first,count) put the
        // vertex count in different places, and the instanced forms multiply.
        const n = name.startsWith("drawElements") ? a : b;
        const inst = name.endsWith("Instanced") ? (name.startsWith("drawElements") ? d : c) || 1 : 1;
        g.tris += tris(mode, n || 0) * inst;
        return real.apply(this, arguments);
      };
    }
    return gl;
  };

  // The frame envelope. Same wrap `janktest` uses, so the two agree on what a
  // frame costs and any disagreement is a bug in one of them.
  const R = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => R((t) => {
    const j = w.__fc;
    const cur = { js: 0 };
    j.cur = cur;
    const a = performance.now();
    try { cb(t); } finally {
      cur.js = performance.now() - a;
      j.cur = null;
      if (j.on && j.frames.length < 200000) j.frames.push(cur);
      if (j.on && j.glFrames.length < 200000 && j.gl.calls) j.glFrames.push({ calls: j.gl.calls, tris: j.gl.tris });
      j.gl.calls = 0; j.gl.tris = 0;
    }
  });
};

async function installPatches(ctx, names) {
  const hits = Object.fromEntries(names.map((n) => [n, 0]));
  await ctx.route("**/*.js*", async (route) => {
    let res; try { res = await route.fetch(); } catch { return route.abort(); }
    let body; try { body = await res.text(); } catch { return route.fulfill({ response: res }); }
    let touched = false;
    for (const n of names) {
      for (const [from, to] of PATCHES[n].subs) {
        // Same accounting on both branches, so a patch that matched nothing
        // still reports 0 and can void its own result.
        if (typeof from === "string") {
          const parts = body.split(from);
          if (parts.length > 1) { hits[n] += parts.length - 1; body = parts.join(to); touched = true; }
          continue;
        }
        const rx = new RegExp(from.source, from.flags.includes("g") ? from.flags : from.flags + "g");
        const c = (body.match(rx) || []).length;
        if (c) { hits[n] += c; body = body.replace(rx, to); touched = true; }
      }
    }
    if (!touched) return route.fulfill({ response: res });
    route.fulfill({ response: res, body });
  });
  return hits;
}

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

async function reachFight(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByText("Training", { exact: false }).first().click();
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
  const more = page.getByLabel("More AI warriors");
  for (let i = 0; i < 10 && await more.isEnabled().catch(() => false); i++) await more.click();
  await page.getByText("DRAW STEEL", { exact: false }).first().click();
  await page.waitForFunction(() => window.__fc && window.__fc.frames !== undefined, null, { timeout: 120000 });
  await page.waitForTimeout(3000);
}

async function main() {
  if (!existsSync(resolve(ROOT, ".next/BUILD_ID"))) {
    say("\n  NO PRODUCTION BUILD. Run `npm run build` first — every anchor here is");
    say("  pinned to the built bundle. Refusing to measure a build nobody will run.");
    process.exitCode = 1; return;
  }
  mkdirSync(OUT, { recursive: true });
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
  let data = null, hits = null, prof = null, drawn = null;
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    hits = await installPatches(ctx, ["nodraw", "modules", "body"]);
    await ctx.addInitScript(COLLECTOR);
    await ctx.addInitScript(() => { window.__fcNoDraw = true; });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => say(`  [page-error] ${String(e).slice(0, 200)}`));
    await reachFight(page, `http://127.0.0.1:${PORT}/?quality=${QUALITY}`);
    const canvas = page.locator("canvas").first();
    await canvas.click({ position: { x: 640, y: 360 } }).catch(() => {});
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
    let cdp = null;
    await new Promise((r) => setTimeout(r, 3000));
    if (PROFILE) {
      cdp = await ctx.newCDPSession(page);
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
      await cdp.send("Profiler.start");
    }
    await page.evaluate(() => { const j = window.__fc; j.frames.length = 0; j.on = true; });
    await new Promise((r) => setTimeout(r, SECS * 1000));
    await page.evaluate(() => { window.__fc.on = false; });
    if (cdp) { prof = (await cdp.send("Profiler.stop")).profile; }
    stop = true; await fight.catch(() => {});
    data = await page.evaluate(() => ({ frames: window.__fc.frames, census: window.__fcCensus() }));
    await ctx.close();

    // ---- and again with the draw LEFT ON, briefly, for the portable numbers.
    // The milliseconds of this run are worthless — SwiftShader — and none are
    // read. What is read is what the frame ASKED the GPU for, which is the same
    // ask on any device.
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await installPatches(ctx2, ["modules"]);
    await ctx2.addInitScript(COLLECTOR);
    const page2 = await ctx2.newPage();
    page2.on("pageerror", () => {});
    await reachFight(page2, `http://127.0.0.1:${PORT}/?quality=${QUALITY}`);
    await page2.evaluate(() => { window.__fc.glFrames.length = 0; window.__fc.on = true; });
    await new Promise((r) => setTimeout(r, 40000));
    drawn = await page2.evaluate(() => {
      const j = window.__fc;
      j.on = false;
      // The scene, walked from the canvas's own renderer is not reachable, so
      // it is not attempted; the draw calls are the measurement.
      return { glFrames: j.glFrames };
    });
    await ctx2.close();
  } finally {
    await browser.close().catch(() => {});
    if (server && !server.killed) server.kill("SIGTERM");
  }

  rule(`FRAMECOST — where the frame goes, per module, DRAW SUPPRESSED  [quality=${QUALITY}]`);
  say(`  EVERY FIGURE BELOW IS THE \`${QUALITY}\` TIER. See the note on QUALITY: the tiers differ by`);
  say(`  more than five times on draw calls, so a number quoted without its tier says nothing.`);
  for (const n of ["nodraw", "modules", "body"]) say(`  patch "${PATCHES[n].name}": ${hits[n]} site(s)`);
  if (!hits.nodraw || !hits.modules) { say("\n  PATCH MISSED — nothing matched. Result VOID."); process.exitCode = 1; return; }
  const F = data.frames;
  if (!F.length) { say("\n  NO FRAMES. VOID."); process.exitCode = 1; return; }
  const js = stats(F.map((f) => f.js));
  say(`\n  ${F.length} frames over ${SECS} s.`);
  say(`  JS WORK PER FRAME, everything inside the rAF callback, draw suppressed:`);
  say(`    p50 ${f2(js.p50)}  p90 ${f2(js.p90)}  p95 ${f2(js.p95)}  p99 ${f2(js.p99)}  worst ${f2(js.max)}  mean ${f2(js.mean)}`);
  say(`    a 60 Hz frame is 16.67 ms and this is BEFORE the GPU.`);

  const rows = MODULES.map(([mod]) => {
    const per = F.map((f) => f[mod] || 0);
    const st = stats(per);
    return { mod, st, share: st.sum / Math.max(1e-6, js.sum) };
  }).sort((a, b) => b.st.sum - a.st.sum);
  say(`\n  PER MODULE, per frame. "share" is that module's total over the total JS.`);
  say(`    ${"module".padEnd(10)} ${"share".padStart(7)} ${"p50".padStart(8)} ${"p90".padStart(8)} ${"p95".padStart(8)} ${"p99".padStart(8)} ${"worst".padStart(8)}`);
  let named = 0;
  for (const r of rows) {
    named += r.st.sum;
    say(`    ${r.mod.padEnd(10)} ${(100 * r.share).toFixed(2).padStart(6)}% ${f2(r.st.p50).padStart(8)} ${f2(r.st.p90).padStart(8)} ${f2(r.st.p95).padStart(8)} ${f2(r.st.p99).padStart(8)} ${f2(r.st.max).padStart(8)}`);
  }
  const rest = js.sum - named;
  say(`    ${"(the rest)".padEnd(10)} ${(100 * rest / Math.max(1e-6, js.sum)).toFixed(2).padStart(6)}%  <- the loop's own body: the per-warrior pass,`);
  say(`               ensureSlot, stepWarriorTransform, poseWarrior, the hit/voice`);
  say(`               drain and everything React does inside the callback.`);

  if (prof) {
    // Self time by node, then folded onto the script offset so the same
    // function reported under different minified aliases lands together.
    const byId = new Map(prof.nodes.map((n) => [n.id, n]));
    const self = new Map();
    const total = prof.samples.length || 1;
    for (const id of prof.samples) {
      const n = byId.get(id);
      if (!n) continue;
      const cf = n.callFrame;
      const key = `${cf.functionName || "(anonymous)"}|${cf.url || ""}|${cf.lineNumber}:${cf.columnNumber}`;
      self.set(key, (self.get(key) || 0) + 1);
    }
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
    say(`\n  V8 CPU PROFILE — self time, ${total} samples at 200 us.`);
    say(`  Names are the minifier's. The script offset is printed so each one can be`);
    say(`  found in the built bundle and recognised by the property names around it.`);
    say(`    ${"share".padStart(7)}  ${"name"} @ url:line:col`);
    for (const [k, c] of top) {
      const [name, url, at] = k.split("|");
      say(`    ${(100 * c / total).toFixed(2).padStart(6)}%  ${name} @ ${url.split("/").pop()}:${at}`);
    }
    writeFileSync(resolve(OUT, "cpu-profile.json"), JSON.stringify(prof));
    say(`    full profile -> .jank/cpu-profile.json (loadable in DevTools)`);
  }

  const C = data.census;
  if (C) {
    say(`\n  THE SCENE, CENSUSED — ${C.meshes} visible meshes in ${C.objects} objects.`);
    say(`    ONE WARRIOR is ${C.bodyMeshes} visible meshes and ${Math.round(C.bodyTris)} triangles, ${C.bodyShadow} of them shadow casters.`);
    say(`    Eight of him is ${C.bodyMeshes * 8} meshes — ${(100 * C.bodyMeshes * 8 / Math.max(1, C.meshes)).toFixed(0)}% of everything visible in the arena.`);
    say(`    ${C.lights} lights, ${C.shadowLights} of them casting; ${C.casters} visible meshes cast into a shadow map,`);
    say(`    and every one of those is drawn a SECOND time. That is why the GL counter reads`);
    say(`    higher than this census.`);
    say(`  Grouped by the (geometry, material) pair, because that pair is what decides`);
    say(`  whether three.js can batch. A row with a large count and ONE pair is that many`);
    say(`  draw calls that could be one instanced call drawing the same pixels.`);
    say(`    ${"count".padStart(6)} ${"tris ea".padStart(8)} ${"tris tot".padStart(9)}  ${"material".padEnd(20)} name`);
    for (const e of C.pairs) {
      say(`    ${String(e.n).padStart(6)} ${String(Math.round(e.tris)).padStart(8)} ${String(Math.round(e.tris * e.n)).padStart(9)}  ${String(e.mat).padEnd(20)} ${e.name}${e.inst ? ` [instanced x${e.inst}]` : ""}`);
    }
  }

  if (drawn && drawn.glFrames.length) {
    const calls = stats(drawn.glFrames.map((f) => f.calls));
    const tris = stats(drawn.glFrames.map((f) => f.tris));
    say(`\n  WHAT THE FRAME ASKS THE GPU FOR — counted at the WebGL context, drawing ON.`);
    say(`  These are the portable numbers. Not one millisecond of that run is read: this`);
    say(`  box rasterises in software. What a frame SUBMITS is the same on any device.`);
    say(`    draw calls per frame   p50 ${f2(calls.p50)}  p95 ${f2(calls.p95)}  worst ${f2(calls.max)}   over ${calls.n} frames`);
    say(`    triangles per frame    p50 ${(tris.p50 / 1000).toFixed(1)}k  p95 ${(tris.p95 / 1000).toFixed(1)}k  worst ${(tris.max / 1000).toFixed(1)}k`);
  } else {
    say(`\n  WHAT THE FRAME ASKS THE GPU FOR — no drawn frames captured; not reported.`);
  }

  rule("READING");
  const worst = rows[0];
  say(`  BUDGET      p50 ${f2(js.p50)} ms of game JavaScript per frame against a 16.67 ms 60 Hz`);
  say(`              frame, ${js.p50 > 16.67 ? "OVER before the renderer has been called" : "COMFORTABLY INSIDE it"}. p95 ${f2(js.p95)}, p99 ${f2(js.p99)}, worst ${f2(js.max)}.`);
  say(`  HEAVIEST    ${worst.mod} at ${(100 * worst.share).toFixed(1)}% of it, p99 ${f2(worst.st.p99)} ms.`);
  say(`  UNACCOUNTED ${(100 * rest / Math.max(1e-6, js.sum)).toFixed(1)}% is outside the wrapped module calls.`);
  if (drawn && drawn.glFrames.length) {
    const calls = stats(drawn.glFrames.map((f) => f.calls));
    say(`  THE GPU ASK   ${Math.round(calls.p50)} draw calls a frame is where the cost has gone, and it is`);
    say(`              not on this thread. ${C ? `${C.bodyMeshes} meshes per warrior, eight of them, and ${C.casters} of ${C.meshes}` : "Most"}`);
    say(`              ${C ? `visible meshes drawn twice for one shadow-casting light.` : "visible meshes cast shadows."}`);
  }
  say();
  say(`  A WARNING THAT IS THE POINT OF THIS FILE. "JS work per frame" is not the`);
  say(`  frame interval. A client doing 1 ms of work and waiting for the next vsync`);
  say(`  reports a 16.7 ms FRAME and a 1 ms WORKLOAD, and reading the first as the`);
  say(`  second turns an idle thread into an over-budget one. \`janktest\` §3's line`);
  say(`  prints the interval; this file prints the work. They are different numbers`);
  say(`  and this repository has already confused them once.`);
  say();
  say(`  DEFERRALS, on the verdict line and not below it (R4):`);
  say(`    - THIS GATES NOTHING. It is a ruler.`);
  say(`    - THE RENDERER'S OWN JS IS NOT IN THE p50 ABOVE, and on a real device it`);
  say(`      is the largest single item. The draw is suppressed here, which skips`);
  say(`      three.js's matrix updates, frustum culling, render-list building and`);
  say(`      uniform uploads along with the GL. That cost scales with the DRAW CALL`);
  say(`      count, which is why this file counts them: the milliseconds cannot be`);
  say(`      measured on a box with no GPU, and the call count can.`);
  say(`    - The milliseconds are this box's. The shares and the draw-call counts are`);
  say(`      portable; the absolute times are not, and no frame rate is implied.`);
  say(`    - Wrapping a call costs a performance.now() pair per module per frame —`);
  say(`      eight pairs, microseconds, charged to the module.`);
  say(`    - The drawn-frame sample is small (this box manages a fraction of a frame`);
  say(`      a second with drawing on), so the draw-call figures are a p50 over a`);
  say(`      handful of frames. They are stable because scene content is, not`);
  say(`      because the sample is large.`);
}

main().catch((e) => { console.error("[framecost] failed:", e); process.exitCode = 1; });
