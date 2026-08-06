#!/usr/bin/env node
// ============================================================
// PERF — measures the renderer's frame cost per quality tier.
//
//   npm run perf              # all three tiers
//   npm run perf -- low       # one tier
//
// Runs against /shot so there is a real scene with warriors in it,
// and reports frame time plus what the GPU actually is. This box has
// no GPU, so the absolute numbers are SwiftShader's, not a player's —
// what matters is the RATIO between tiers and whether the frame count
// is high enough for the control playtest to sample input at all.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = parseInt(process.env.PORT || String(3600 + (process.pid % 150)), 10);
const TIERS = process.argv.slice(2).filter((a) => ["low", "medium", "high"].includes(a));
const TARGETS = TIERS.length ? TIERS : ["low", "medium", "high"];

let server;
function waitForServer(url, timeoutMs = 180000) {
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

async function main() {
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  server = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);

  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  for (const tier of TARGETS) {
    const page = await ctx.newPage();
    // Draw calls and triangles, counted without touching a line of src/.
    //
    // The renderer publishes no `renderer.info` global and adding one would put
    // this tool's needs inside a file it does not own, so the count is taken the
    // way `tools/silhouette.mjs` takes its depth band: by wrapping the GL context
    // before the app ever asks for one. Every draw entry point is counted and the
    // primitive count converted to triangles, and the tallies are latched per
    // presented frame so what is reported is the cost of ONE frame rather than of
    // however many happened to fit in the window.
    //
    // This matters more than the fps beside it. On a box with no GPU the frame
    // time is SwiftShader's and tells a player nothing; draw calls and triangle
    // count are the same numbers on his phone as on this machine, and they are
    // what a change to the head's tessellation actually moves.
    await page.addInitScript(() => {
      const W = window;
      W.__gpu = { calls: 0, tris: 0, frameCalls: 0, frameTris: 0, frames: 0 };
      const triesOf = (mode, count) => {
        // TRIANGLES 4, TRIANGLE_STRIP 5, TRIANGLE_FAN 6
        if (mode === 4) return count / 3;
        if (mode === 5 || mode === 6) return Math.max(0, count - 2);
        return 0;
      };
      const wrap = (ctx) => {
        if (!ctx || ctx.__wrapped) return ctx;
        ctx.__wrapped = true;
        for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
          const fn = ctx[name];
          if (typeof fn !== "function") continue;
          const instanced = name.endsWith("Instanced");
          ctx[name] = function (...args) {
            const n = instanced ? (args[args.length - 1] || 1) : 1;
            W.__gpu.calls += 1;
            W.__gpu.tris += triesOf(args[0], args[1] || 0) * n;
            return fn.apply(this, args);
          };
        }
        return ctx;
      };
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...a) { return wrap(orig.apply(this, a)); };
      // Latch per presented frame. rAF is appended after the app's own callbacks
      // for that tick, so the tallies it reads are one frame's worth.
      const tick = () => {
        if (W.__gpu.calls > 0) {
          W.__gpu.frameCalls = W.__gpu.calls;
          W.__gpu.frameTris = W.__gpu.tris;
          W.__gpu.frames += 1;
        }
        W.__gpu.calls = 0; W.__gpu.tris = 0;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // brawl is the worst case the game actually ships: eight warriors, all
    // their kit, and the full effect load on screen at once.
    await page.goto(`http://127.0.0.1:${PORT}/shot?preset=brawl&clean=1&quality=${tier}`, {
      waitUntil: "domcontentloaded", timeout: 120000,
    });
    try {
      await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 420000 });
    } catch {
      console.log(`  ${tier}: never settled within 7 minutes`);
      await page.close();
      continue;
    }

    // Count real presented frames over a fixed wall-clock window.
    const r = await page.evaluate(async () => {
      const gl = document.querySelector("canvas")?.getContext("webgl2")
        || document.querySelector("canvas")?.getContext("webgl");
      const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
      const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown";
      let frames = 0;
      const t0 = performance.now();
      await new Promise((done) => {
        const tick = () => {
          frames++;
          if (performance.now() - t0 >= 6000) return done();
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const ms = performance.now() - t0;
      const g = window.__gpu || { frameCalls: 0, frameTris: 0, frames: 0 };
      return {
        fps: (frames / ms) * 1000, frameMs: ms / frames, frames, renderer,
        calls: g.frameCalls, tris: g.frameTris, counted: g.frames,
      };
    });

    console.log(
      `  ${tier.padEnd(7)} ${r.fps.toFixed(2)} fps  ${r.frameMs.toFixed(0)} ms/frame  ` +
      `(${r.frames} frames in 6s)  ·  ${r.calls} draw calls  ${Math.round(r.tris).toLocaleString("en-GB")} triangles`
    );
    if (TARGETS.indexOf(tier) === 0) console.log(`  GPU: ${r.renderer}\n`);
    await page.close();
  }

  await browser.close();
}

main()
  .catch((e) => { console.error("[perf] failed:", e); process.exitCode = 1; })
  .finally(() => { if (server && !server.killed) server.kill("SIGTERM"); });
