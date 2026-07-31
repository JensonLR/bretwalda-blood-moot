#!/usr/bin/env node
// ============================================================
// UISHOTS — capture the menu screens at phone and desktop widths.
//
//   node tools/uishots.mjs
//   node tools/uishots.mjs --dev          # ignore any production build
//   node tools/uishots.mjs --port 3410
//
// Separate from `shoot.mjs` on purpose: that tool photographs the
// 3D scene through /shot, this one drives the real menu flow so
// layout regressions (gutters, wrapping, tap targets) are visible.
// Writes to art/ui/ so it can never overwrite the render gallery.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { mkdirSync, existsSync, statSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "art/ui");
const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
// Derived from the pid, and no longer from an ambient `PORT`. Honouring the
// environment meant that anywhere PORT is already set — a shell with a dev
// server up, a hosting runtime — this tool spawned onto an occupied port,
// `waitForServer` was satisfied by whatever was *already* answering there, and
// the run photographed a stranger's build while reporting success. `--port`
// still exists for when a fixed one is wanted; see also the free-port check in
// startServer, which refuses rather than guesses.
const PORT = parseInt(flag("port", String(3400 + (process.pid % 200))), 10);
// See the same constant in shoot.mjs for why this is not 127.0.0.1: Next 16
// blocks dev resources from the loopback literal, the HMR socket dies, and the
// dev client reload-loops the page — which for this tool means every shot is of
// a half-mounted screen with no stylesheet attached. It hid behind a production
// build, where there is no HMR socket to block.
const BASE = () => `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { tag: "phone", width: 390, height: 844, touch: true },
  { tag: "desktop", width: 1440, height: 900, touch: false },
];

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

/**
 * Newest mtime under the directories a rendered screen depends on.
 *
 * This tool prefers a production build whenever it finds a BUILD_ID, and a
 * production build is a photograph of the source as it stood when it was made.
 * The CSS is the part that bites: Tailwind compiles into the build, so an
 * un-rebuilt `.next` serves the *previous* stylesheet, every screen comes back
 * looking right, and a layout change that has not been built is reported as
 * having no effect. Nothing in the output says which source it was of.
 */
function newestSourceMtime() {
  let newest = 0;
  for (const dir of ["src", "public"]) {
    const root = resolve(ROOT, dir);
    if (!existsSync(root)) continue;
    for (const e of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!e.isFile()) continue;
      const m = statSync(join(e.parentPath ?? e.path, e.name)).mtimeMs;
      if (m > newest) newest = m;
    }
  }
  return newest;
}

let server;
async function startServer() {
  // Refuse a port somebody is already answering on, rather than adopt them.
  try {
    await fetch(`${BASE()}/api/health`, { signal: AbortSignal.timeout(1500) });
    console.error(`[ui] something is already serving ${BASE()} — pass --port to pick another`);
    process.exit(2);
  } catch { /* nothing there, which is what we want */ }

  const buildId = resolve(ROOT, ".next/BUILD_ID");
  let useProd = existsSync(buildId) && !has("dev");
  if (useProd) {
    const built = statSync(buildId).mtimeMs;
    const edited = newestSourceMtime();
    if (edited > built) {
      const mins = ((edited - built) / 60000).toFixed(1);
      console.log(`[ui] .next is ${mins} min older than src/ — its CSS is stale, falling back to dev`);
      console.log("[ui] (run `npm run build` first for a faster, production-accurate capture)");
      useProd = false;
    }
  }
  console.log(`[ui] starting ${useProd ? "custom-server.mjs" : "dev-server.mjs"} on :${PORT}`);
  server = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`${BASE()}/api/health`);
  console.log("[ui] server up on", PORT);
}

/**
 * Waits until a stylesheet is actually attached and parsed.
 *
 * The screenshots used to be timed rather than gated — a flat 700–1500 ms and
 * hope. Against a production build that is enough, because the CSS ships as a
 * link in the document head and lands with the HTML. In dev, Tailwind compiles
 * on demand and the sheet arrives after the markup does, so the same timeout
 * photographs an unstyled screen and files it as a layout regression. A layout
 * audit whose input is unstyled is worse than no audit, for the same reason a
 * lineup with ten exposures is worse than none.
 */
async function waitForStyles(page) {
  await page.waitForFunction(() => {
    let rules = 0;
    for (const s of Array.from(document.styleSheets)) {
      try { rules += s.cssRules.length; } catch { /* opaque sheet, cannot count */ }
    }
    return rules > 20;
  }, null, { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
}

async function main() {
  await startServer();
  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
      "--disable-gpu-sandbox", "--no-sandbox", "--ignore-gpu-blocklist"],
  });

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: vp.touch,
      hasTouch: vp.touch,
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    const shot = async (name, full = true) => {
      await waitForStyles(page);
      await page.waitForTimeout(700);
      await page.screenshot({ path: resolve(OUT, `${name}-${vp.tag}.png`), fullPage: full });
      console.log(`[ui] ${name}-${vp.tag}`);
    };

    await page.goto(`${BASE()}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await shot("landing", false);
    await shot("landing-full");

    // training grounds
    await page.getByRole("button", { name: /Training/ }).first().click();
    await shot("training");

    // training setup (muster)
    await page.getByRole("button", { name: /MUSTER THE TESTGROUNDS/ }).click();
    await page.waitForTimeout(1500);
    await shot("training-setup");

    // armoury, reached from the landing screen
    await page.goto(`${BASE()}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: /Armoury/ }).first().click();
    await page.waitForTimeout(2000);
    await shot("armoury");

    // lobby: name -> create battle -> create room
    await page.goto(`${BASE()}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    await page.getByPlaceholder("Enter warrior name...").fill("Aelfric");
    await page.getByRole("button", { name: /CREATE BATTLE/ }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /CREATE ROOM/ }).click();
    await page.waitForTimeout(3500);
    await shot("lobby");
    await shot("lobby-viewport", false);

    // tap-target audit: every visible control's box and the gaps between them
    const audit = await page.evaluate(() => {
      const els = [...document.querySelectorAll("button, select, input, a")];
      const boxes = els.map((e) => {
        const r = e.getBoundingClientRect();
        return { t: (e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 28), w: Math.round(r.width), h: Math.round(r.height) };
      }).filter((b) => b.w > 0 && b.h > 0);
      return { small: boxes.filter((b) => b.h < 44), total: boxes.length };
    });
    console.log(`[ui] ${vp.tag} lobby controls: ${audit.total}, under 44px tall:`, JSON.stringify(audit.small));

    // deep link: a fresh guest opening the bare invite URL
    const code = await page.evaluate(() => {
      const el = document.querySelector(".warcode");
      return el ? el.textContent.trim() : null;
    });
    console.log(`[ui] ${vp.tag} war code: ${code}`);
    if (code) {
      const guestCtx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }, isMobile: vp.touch, hasTouch: vp.touch,
      });
      const guest = await guestCtx.newPage();
      await guest.goto(`${BASE()}/?code=${code}`, { waitUntil: "domcontentloaded" });
      await waitForStyles(guest);
      await guest.waitForTimeout(1500);
      await guest.screenshot({ path: resolve(OUT, `deeplink-join-${vp.tag}.png`), fullPage: true });
      await guest.getByPlaceholder("Enter warrior name...").fill("Guest");
      await guest.getByRole("button", { name: /^JOIN$/ }).click();
      await guest.waitForTimeout(3500);
      const inLobby = await guest.evaluate(() => !!document.querySelector(".warcode"));
      const guestCode = await guest.evaluate(() => document.querySelector(".warcode")?.textContent?.trim() ?? null);
      await guest.screenshot({ path: resolve(OUT, `deeplink-lobby-${vp.tag}.png`), fullPage: true });
      console.log(`[ui] ${vp.tag} DEEPLINK: reached lobby=${inLobby} code=${guestCode} matches=${guestCode === code}`);
      await page.waitForTimeout(800);
      await page.screenshot({ path: resolve(OUT, `lobby-two-${vp.tag}.png`), fullPage: true });
      await guestCtx.close();
    }
    await ctx.close();
  }

  await browser.close();
  if (server && !server.killed) server.kill("SIGTERM");
  process.exit(0);
}

main().catch((e) => { console.error(e); if (server && !server.killed) server.kill("SIGTERM"); process.exit(1); });
