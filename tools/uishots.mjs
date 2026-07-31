#!/usr/bin/env node
// ============================================================
// UISHOTS — capture the menu screens at phone and desktop widths.
//
//   node tools/uishots.mjs
//
// Separate from `shoot.mjs` on purpose: that tool photographs the
// 3D scene through /shot, this one drives the real menu flow so
// layout regressions (gutters, wrapping, tap targets) are visible.
// Writes to art/ui/ so it can never overwrite the render gallery.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "art/ui");
const PORT = parseInt(process.env.PORT || String(3400 + (process.pid % 200)), 10);
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

let server;
async function startServer() {
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  server = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);
  console.log("[ui] server up on", PORT);
}

const BASE = () => `http://127.0.0.1:${PORT}`;

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
