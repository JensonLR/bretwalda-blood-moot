#!/usr/bin/env node
// ============================================================
// SHOOT — headless capture of the game's render output.
//
//   npm run shots                       # all presets, 1600x900
//   npm run shots -- duel closeup       # only these presets
//   npm run shots -- --hud              # keep the HUD visible
//   npm run shots -- --out art/shots/v2 # write elsewhere
//   npm run shots -- --w 2560 --h 1440  # capture resolution
//
// Boots the app itself (production build if present, else dev),
// drives /shot with Playwright, writes PNGs, and fails loudly on
// any WebGL/console error so a broken scene can't pass review.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { mkdirSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALL_PRESETS = ["duel", "arena", "closeup", "brawl", "laststand"];

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const OUT = resolve(ROOT, flag("out", "art/shots"));
const WIDTH = parseInt(flag("w", "1600"), 10);
const HEIGHT = parseInt(flag("h", "900"), 10);
const PORT = parseInt(flag("port", "3111"), 10);
const CLEAN = has("hud") ? "0" : "1";
const presets = argv.filter((a) => ALL_PRESETS.includes(a));
const TARGETS = presets.length ? presets : ALL_PRESETS;

mkdirSync(OUT, { recursive: true });

function waitForServer(url, timeoutMs = 180000) {
  const started = Date.now();
  return new Promise((ok, fail) => {
    const poll = async () => {
      try {
        const r = await fetch(url);
        if (r.ok || r.status === 404) return ok();
      } catch { /* not up yet */ }
      if (Date.now() - started > timeoutMs) return fail(new Error(`server never came up at ${url}`));
      setTimeout(poll, 700);
    };
    poll();
  });
}

let server;
async function startServer() {
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  const script = useProd ? "custom-server.mjs" : "dev-server.mjs";
  console.log(`[shoot] starting ${script} on :${PORT}`);
  server = spawn("node", [script], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.SHOOT_VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.SHOOT_VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);
  console.log("[shoot] server up");
}

function stopServer() {
  if (server && !server.killed) server.kill("SIGTERM");
}

const report = [];

async function main() {
  await startServer();

  // Use the pre-installed full Chromium (it has the GL stack the
  // headless shell lacks) rather than letting Playwright download one.
  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: [
      // Software GL so WebGL works on a headless box with no GPU.
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-gpu-sandbox",
      "--no-sandbox",
      "--ignore-gpu-blocklist",
    ],
  });

  const ctx = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
  });

  for (const preset of TARGETS) {
    const page = await ctx.newPage();
    // Photo mode has no live match, so the game transport failing to connect
    // is expected. Only surface errors that indicate a broken scene.
    const IGNORE = [
      /ERR_CONNECTION_RESET/, /favicon/, /404 \(Not Found\)/,
      /webpack-hmr/, /EventSource/, /\/api\/game\//,
    ];
    const errors = [];
    const note = (text) => { if (!IGNORE.some((r) => r.test(text))) errors.push(text); };
    page.on("console", (m) => { if (m.type() === "error") note(m.text()); });
    page.on("pageerror", (e) => note(String(e)));

    const url = `http://127.0.0.1:${PORT}/shot?preset=${preset}&clean=${CLEAN}`;
    console.log(`[shoot] ${preset} -> ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });

    // Wait for the renderer to signal it has settled.
    let ready = true;
    try {
      await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 120000 });
    } catch {
      ready = false;
      errors.push("renderer never signalled __shotReady (scene may have failed to build)");
    }

    const file = resolve(OUT, `${preset}.png`);
    const buf = await page.screenshot({ path: file });

    // A dead-black frame means the scene never rendered — catch it here
    // rather than letting a critic agent review an empty image. Measure the
    // captured PNG, not the live canvas: a WebGL canvas without
    // preserveDrawingBuffer reads back black outside its own frame.
    const stats = await page.evaluate(async (b64) => {
      const img = new Image();
      await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = "data:image/png;base64," + b64; });
      const g = document.createElement("canvas");
      g.width = 160; g.height = 90;
      const cx = g.getContext("2d");
      cx.drawImage(img, 0, 0, 160, 90);
      const d = cx.getImageData(0, 0, 160, 90).data;
      let sum = 0, max = 0;
      // Spread of luma tells us the frame has actual content, not one flat fill.
      const hist = new Array(16).fill(0);
      for (let i = 0; i < d.length; i += 4) {
        const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
        sum += l; if (l > max) max = l;
        hist[Math.min(15, (l / 16) | 0)]++;
      }
      const n = d.length / 4;
      const occupied = hist.filter((h) => h > n * 0.002).length;
      return { ok: true, meanLuma: sum / n, maxLuma: max, tonalBuckets: occupied };
    }, buf.toString("base64"));

    const blank = stats.ok && stats.maxLuma < 8;
    report.push({ preset, file, ready, blank, ...stats, errors: errors.slice(0, 8) });
    console.log(
      `[shoot] ${preset}: ${blank ? "BLANK FRAME" : "ok"} ` +
      `meanLuma=${stats.meanLuma?.toFixed(1)} errors=${errors.length}`
    );
    await page.close();
  }

  await browser.close();
  writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));

  const bad = report.filter((r) => r.blank || !r.ready || r.errors.length);
  console.log(`\n[shoot] wrote ${report.length} shots to ${OUT}`);
  if (bad.length) {
    console.log("[shoot] PROBLEMS:");
    for (const b of bad) console.log(`  - ${b.preset}: ready=${b.ready} blank=${b.blank} ${b.errors.join(" | ")}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error("[shoot] failed:", e); process.exitCode = 1; })
  .finally(stopServer);

process.on("SIGINT", () => { stopServer(); process.exit(130); });
