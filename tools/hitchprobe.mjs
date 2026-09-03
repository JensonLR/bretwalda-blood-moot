#!/usr/bin/env node
// HITCHPROBE — the replay→tableau handover, timed frame by frame in the shipped page.
//
//   node tools/hitchprobe.mjs [--quality=high] [--men=3] [--runs=1]
//   BRETWALDA_GPU=1 node tools/hitchprobe.mjs        (the honest rasteriser for a timing)
//
// docs/PERFORMANCE.md located a fixed ~0.3–0.4 s frame ten frames before the
// summary mounts and eliminated three causes (link queries, the clip recorder,
// DoF). This is the ruler for the fourth round. It fights a REAL blood moot —
// the host stands still and the AI kills him — with no fpstest instrumentation
// in the way, and for every frame records:
//
//   ms        wall time between animation frames
//   draw      time spent inside drawElements/drawArrays (GL, this frame)
//   link      linkProgram calls this frame
//   first     programs used for the FIRST time this frame — a driver that
//             compiles lazily at first draw shows up here, not in linkProgram
//   shadow    framebuffer binds this frame (a new shadow map is a new target)
//
// and marks the frame the verdict arrived and the frame the summary mounted.
// The verdict line is the worst frame between the two, attributed.
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { launchOptions, watchBoot, rasteriserNote, confirmRasteriser } from "./lib/browser.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const QUALITY = arg("quality", "high");
const MEN = Math.max(1, parseInt(arg("men", "3"), 10));
const RUNS = Math.max(1, parseInt(arg("runs", "1"), 10));
const PORT = parseInt(process.env.PORT || String(3860 + (process.pid % 40)), 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the server ----------------------------------------------------------
const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
if (!useProd) { console.error("[hitch] NO PRODUCTION BUILD — run `npm run build` first; a dev server's numbers are not the game's."); process.exit(2); }
const server = spawn("node", ["custom-server.mjs"], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" }, stdio: ["ignore", "ignore", "ignore"],
});
watchBoot(server, "hitch");
for (const t0 = Date.now(); ;) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); if (r.ok) break; } catch { /* not up */ }
  if (Date.now() - t0 > 180000) { console.error("server never came up"); process.exit(2); }
  await sleep(300);
}

// ---- the tap, installed before any script of the page runs ---------------
const TAP = () => {
  const w = window;
  const P = w.__hitch = { frames: [], frame: 0, matchEndFrame: -1, summaryFrame: -1, countdownFrame: -1, fightingFrame: -1, seen: new Set(), cur: null, types: {} };
  const fresh = () => ({ t: 0, ms: 0, draw: 0, link: 0, first: 0, fbo: 0, tex: 0, texpx: 0, buf: 0, bufbytes: 0 });
  P.cur = fresh();
  // FIRST, before anything that can throw: an init script runs before the
  // document exists, and a wrapper installed after a throw is not installed.
  // The verdict, off the wire.
  const RealWS = w.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (String(url).includes("/ws")) {
      ws.addEventListener("message", (ev) => {
        try {
          const m = JSON.parse(ev.data);
          P.types[m.type] = (P.types[m.type] || 0) + 1;
          if (m.type === "match_end" && P.matchEndFrame < 0) P.matchEndFrame = P.frame;
          // THE OTHER FREEZE THE OWNER NAMED: "loading into games". The
          // countdown is where the arena finishes arriving and the warmer
          // spends its budget, and the first fighting frame is where a player
          // starts to care about pacing. Both are marked so the load window
          // can be read off the same ledger as the handover.
          if (m.type === "countdown" && P.countdownFrame < 0) P.countdownFrame = P.frame;
          if (m.data && m.data.state === "fighting" && P.fightingFrame < 0) P.fightingFrame = P.frame;
        } catch { /* not ours */ }
      });
    }
    return ws;
  }
  TappedWS.prototype = RealWS.prototype; Object.assign(TappedWS, RealWS); w.WebSocket = TappedWS;
  let last = performance.now();
  const tick = () => {
    const now = performance.now();
    const f = P.cur; f.t = now; f.ms = now - last; last = now;
    P.frames.push(f); P.cur = fresh(); P.frame++;
    if (P.summaryFrame < 0 && document.querySelector("[data-hitch-summary]")) P.summaryFrame = P.frame;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // The summary's mount, keyed on the one button only it renders.
  new MutationObserver(() => {
    if (P.summaryFrame >= 0) return;
    for (const b of document.querySelectorAll("button")) {
      if (/FIGHT AGAIN/.test(b.textContent || "")) { P.summaryFrame = P.frame; return; }
    }
  }).observe(document, { childList: true, subtree: true });
  // GL: draw time, links, first use of a program, framebuffer binds.
  for (const C of [w.WebGL2RenderingContext, w.WebGLRenderingContext]) {
    if (!C) continue;
    const p = C.prototype;
    for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      const orig = p[name]; if (!orig) continue;
      p[name] = function (...a) { const t = performance.now(); const r = orig.apply(this, a); P.cur.draw += performance.now() - t; return r; };
    }
    const srcOf = new WeakMap();
    const shaderSource = p.shaderSource;
    p.shaderSource = function (sh, src) { srcOf.set(sh, String(src)); return shaderSource.call(this, sh, src); };
    const link = p.linkProgram;
    p.linkProgram = function (prog, ...a) {
      P.cur.link++;
      try {
        const shs = this.getAttachedShaders(prog) || [];
        const defs = [];
        for (const sh of shs) {
          const src = srcOf.get(sh) || "";
          const want = /^#define (SHADER_TYPE|SHADER_NAME|NUM_SPOT_LIGHTS|NUM_POINT_LIGHTS|NUM_SPOT_LIGHT_SHADOWS|USE_ENVMAP|DEPTH_PACKING|USE_SHADOWMAP|USE_SKINNING|USE_INSTANCING)\b.*$/gm;
          let m; while ((m = want.exec(src))) defs.push(m[0].replace("#define ", ""));
        }
        (P.cur.linked ||= []).push([...new Set(defs)].join(" "));
      } catch { /* not ours */ }
      return link.call(this, prog, ...a);
    };
    // WHAT A LOAD FRAME IS ACTUALLY SPENDING. The handover's cost was shader
    // pipelines; the load's is not — the worst load frame shows almost no
    // first-use programs. So count the two other things a frame can stall on:
    // pixels going up to the GPU, and vertex data going up with them.
    for (const name of ["texImage2D", "texSubImage2D", "compressedTexImage2D"]) {
      const f = p[name];
      if (!f) continue;
      p[name] = function (...a) {
        P.cur.tex++;
        // texImage2D comes in two shapes: (target, level, internalformat,
        // width, height, border, format, type, pixels) and the short
        // (target, level, internalformat, format, type, source). Only the long
        // one states its size; the short one carries it on the source.
        let px = 0;
        if (a.length >= 8 && typeof a[3] === "number" && typeof a[4] === "number") px = a[3] * a[4];
        else { const src = a[a.length - 1]; if (src && src.width && src.height) px = src.width * src.height; }
        P.cur.texpx += px;
        if (px >= 1048576) (P.cur.bigtex ||= []).push(px);
        return f.apply(this, a);
      };
    }
    for (const name of ["bufferData", "bufferSubData"]) {
      const f = p[name];
      if (!f) continue;
      p[name] = function (...a) {
        P.cur.buf++;
        const d = a[1];
        P.cur.bufbytes += d && d.byteLength ? d.byteLength : (typeof d === "number" ? d : 0);
        return f.apply(this, a);
      };
    }
    const use = p.useProgram;
    p.useProgram = function (prog) { if (prog && !P.seen.has(prog)) { P.seen.add(prog); P.cur.first++; } return use.call(this, prog); };
    const bind = p.bindFramebuffer;
    p.bindFramebuffer = function (...a) { P.cur.fbo++; return bind.apply(this, a); };
  }
};

const browser = await chromium.launch(launchOptions());
console.log(`[hitch] ${rasteriserNote()}`);
const results = [];
try {
  for (let run = 0; run < RUNS; run++) {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(120000);
    await page.addInitScript(TAP);
    await page.goto(`http://127.0.0.1:${PORT}/?quality=${QUALITY}`, { waitUntil: "domcontentloaded" });
    if (run === 0) {
      const r = await confirmRasteriser(page);
      console.log(`[hitch] renderer: ${r.renderer}${r.mismatch ? "  — ASKED FOR THE GPU AND DID NOT GET IT" : ""}`);
    }
    await page.getByPlaceholder("Enter warrior name", { exact: false }).first().fill("Stillman");
    await page.getByText("CREATE BATTLE", { exact: false }).first().click();
    await page.getByText("BLOOD MOOT", { exact: false }).first().click();
    await page.getByText("CREATE ROOM", { exact: false }).first().click();
    const addAi = page.getByText("ADD AI", { exact: false }).first();
    await addAi.waitFor({ state: "visible", timeout: 90000 });
    for (let i = 0; i < MEN; i++) { await addAi.click(); await sleep(250); }
    await page.getByText("START", { exact: true }).first().click();
    // Stand still and be killed — a blood moot is best of three, so this is
    // two or three deaths and their countdowns; the verdict arrives on the wire.
    for (const t0 = Date.now(); ;) {
      const st = await page.evaluate(() => ({ end: window.__hitch.matchEndFrame, frame: window.__hitch.frame, types: window.__hitch.types }));
      if (st.end >= 0) break;
      if (Date.now() - t0 > 420000) throw new Error(`no verdict in 420 s — frames ${st.frame}, wire ${JSON.stringify(st.types)}`);
      if (process.env.VERBOSE) console.log(`  … frame ${st.frame}, wire ${JSON.stringify(st.types)}`);
      await sleep(5000);
    }
    const keysAtVerdict = await page.evaluate(() => (window.__bretwaldaRenderer?.info.programs ?? []).map((p) => p.cacheKey));
    // The DOM panel mounts AT the verdict; the replay then holds ~240 frames
    // and the tableau is staged after it. Nine seconds covers all of that.
    await sleep(9000);
    const keysAfter = await page.evaluate(() => (window.__bretwaldaRenderer?.info.programs ?? []).map((p) => p.cacheKey));
    const fresh = keysAfter.filter((k) => !keysAtVerdict.includes(k));
    console.log(`  programs: ${keysAtVerdict.length} at the verdict, ${keysAfter.length} after the tableau, ${fresh.length} new`);
    if (process.env.VERBOSE && fresh.length) {
      const sample = fresh.slice(0, 3);
      for (const k of sample) console.log(`    NEW ${k.slice(0, 400)}`);
      // The nearest older key for the first new one, so the differing field is visible.
      const first = fresh[0];
      let best = null, bestD = Infinity;
      for (const k of keysAtVerdict) { let d = 0; for (let i = 0; i < Math.max(k.length, first.length); i++) if (k[i] !== first[i]) d++; if (d < bestD) { bestD = d; best = k; } }
      if (best) console.log(`    OLD ${best.slice(0, 400)}`);
      const warmKeys = (await page.evaluate(() => window.__summaryWarm?.keys ?? []));
      let wb = null, wd = Infinity;
      for (const k of warmKeys) { let d = 0; for (let i = 0; i < Math.max(k.length, first.length); i++) if (k[i] !== first[i]) d++; if (d < wd) { wd = d; wb = k; } }
      if (wb) { console.log(`    WARMED-NEAREST (${wd} chars off) ${wb.slice(0, 400)}`); const a = first, b = wb; let i = 0; while (i < a.length && a[i] === b[i]) i++; console.log(`    diverge at ${i}: NEW «${a.slice(Math.max(0, i - 20), i + 40)}»  WARM «${b.slice(Math.max(0, i - 20), i + 40)}»`); }
      console.log(`    ${warmKeys.filter((k) => keysAfter.includes(k)).length} of ${warmKeys.length} warmed keys are in the cache after the tableau; ${warmKeys.filter((k) => keysAtVerdict.includes(k)).length} were at the verdict`);
    }
    console.log(`  warmer: ${JSON.stringify(await page.evaluate(() => window.__summaryWarm ?? null))}`);
    const P = await page.evaluate(() => {
      const H = window.__hitch;
      return { frames: H.frames.map((f) => [+f.ms.toFixed(1), +f.draw.toFixed(1), f.link, f.first, f.fbo, f.linked || [], f.tex, f.texpx, f.buf, f.bufbytes, f.bigtex || []]), matchEnd: H.matchEndFrame, summary: H.summaryFrame, countdown: H.countdownFrame, fighting: H.fightingFrame };
    });
    const between = P.frames.slice(P.matchEnd).map((f, i) => ({ i: P.matchEnd + i, ms: f[0], draw: f[1], link: f[2], first: f[3], fbo: f[4], linked: f[5] }));
    const worst = between.reduce((a, b) => (b.ms > a.ms ? b : a), between[0]);
    const over100 = between.filter((f) => f.ms > 100).length;
    const fight = P.frames.slice(Math.max(0, P.matchEnd - 120), P.matchEnd).map((f) => f[0]).sort((a, b) => a - b);
    const p50 = fight[Math.floor(fight.length / 2)] ?? 0;
    console.log(`\n[hitch] run ${run + 1}/${RUNS}  quality=${QUALITY}  men=${MEN + 1}  fight p50 ${p50} ms`);
    console.log(`  verdict frame ${P.matchEnd}   DOM panel mounted frame ${P.summary}   ${between.length} frames recorded after the verdict`);
    console.log(`  WORST frame after the verdict: #${worst.i} (+${worst.i - P.matchEnd})  ${worst.ms} ms  — draw ${worst.draw} ms, linkProgram ${worst.link}, FIRST-USE programs ${worst.first}, framebuffer binds ${worst.fbo}`);
    console.log(`  frames over 100 ms: ${over100}`);
    // THE LOAD, read off the same ledger. Everything before the bell, then the
    // first four seconds of the fight — the window a player calls "loading in".
    if (P.countdown >= 0) {
      const load = P.frames.slice(0, P.countdown).map((f, i) => ({ i, ms: f[0], first: f[3], tex: f[6], texpx: f[7], buf: f[8], bufbytes: f[9], big: f[10] }));
      const bell = P.fighting >= 0 ? P.fighting : P.countdown;
      const opening = P.frames.slice(bell, bell + 240).map((f, i) => ({ i: bell + i, ms: f[0], first: f[3], tex: f[6], texpx: f[7], buf: f[8], bufbytes: f[9], big: f[10] }));
      const worstOf = (a) => a.length ? a.reduce((x, y) => (y.ms > x.ms ? y : x)) : { i: -1, ms: 0, first: 0 };
      const wl = worstOf(load), wo = worstOf(opening);
      const mb = (n) => `${((n || 0) / 1048576).toFixed(1)} MB`;
      const bigs = (a) => (a && a.length ? ` [${a.map((px) => `${Math.round(Math.sqrt(px))}²`).join(" ")}]` : "");
      console.log(`  LOAD: ${load.length} frames to the bell, worst ${wl.ms} ms (first-use ${wl.first}, textures ${wl.tex} / ${mb((wl.texpx || 0) * 4)}, buffers ${wl.buf} / ${mb(wl.bufbytes)}), over 100 ms: ${load.filter((f) => f.ms > 100).length}`);
      for (const f of load.filter((x) => x.ms > 100).sort((a, b) => b.ms - a.ms).slice(0, 6)) {
        console.log(`    load frame #${f.i}  ${f.ms} ms  — first-use ${f.first}, textures ${f.tex} / ${mb((f.texpx || 0) * 4)}${bigs(f.big)}, buffers ${f.buf} / ${mb(f.bufbytes)}`);
      }
      console.log(`  OPENING: first ${opening.length} fighting frames, worst ${wo.ms} ms (first-use ${wo.first}), over 100 ms: ${opening.filter((f) => f.ms > 100).length}, over 50 ms: ${opening.filter((f) => f.ms > 50).length}`);
    }
    if (process.env.VERBOSE && worst.linked?.length) {
      const tally = new Map();
      for (const d of worst.linked) tally.set(d, (tally.get(d) || 0) + 1);
      console.log("  what the worst frame linked:");
      for (const [d, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(3)} × ${d}`);
    }
    console.log("  the ten frames around it:");
    for (const f of between.filter((f) => Math.abs(f.i - worst.i) <= 5)) {
      console.log(`    #${String(f.i).padStart(5)}  ${String(f.ms).padStart(7)} ms   draw ${String(f.draw).padStart(6)}   link ${String(f.link).padStart(3)}   first ${String(f.first).padStart(3)}   fbo ${String(f.fbo).padStart(4)}${f.i === worst.i ? "   <- worst" : ""}${f.i === P.summary ? "   <- summary mounts" : ""}`);
    }
    results.push({ worst: worst.ms, draw: worst.draw, link: worst.link, first: worst.first, over100 });
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
const w = results.map((r) => r.worst);
console.log(`\n[hitch] ${RUNS} run(s): worst frame ${Math.min(...w)}–${Math.max(...w)} ms; first-use programs on the worst frame ${results.map((r) => r.first).join("/")}; links ${results.map((r) => r.link).join("/")}`);
