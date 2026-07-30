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
      return { fps: (frames / ms) * 1000, frameMs: ms / frames, frames, renderer };
    });

    console.log(
      `  ${tier.padEnd(7)} ${r.fps.toFixed(2)} fps  ${r.frameMs.toFixed(0)} ms/frame  ` +
      `(${r.frames} frames in 6s)`
    );
    if (TARGETS.indexOf(tier) === 0) console.log(`  GPU: ${r.renderer}\n`);
    await page.close();
  }

  await browser.close();
}

main()
  .catch((e) => { console.error("[perf] failed:", e); process.exitCode = 1; })
  .finally(() => { if (server && !server.killed) server.kill("SIGTERM"); });
