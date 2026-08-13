#!/usr/bin/env node
// ============================================================
// WARSHOT — photograph /factions at phone and desktop width.
//
//   node tools/warshot.mjs                          # no database: the opening map
//   WAR_TEST_DB=postgres://... node tools/warshot.mjs
//
// `docs/PROCESS.md` R5: open the render. Three of the four defects the owner
// reported on 8 Aug were invisible to every number in the repository and
// obvious in one PNG, and a map is the most PNG-shaped thing this game has —
// a territory whose polygon misses the coast by ten miles passes every
// assertion in `wartest` and is unmistakable in a screenshot.
//
// Separate from `uishots.mjs` on purpose: that one drives the menu flow and
// belongs to another wave, and this one needs a database pointed at it, which
// nothing there does. Writes to art/ui/ alongside it.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "art/ui");
const PORT = parseInt(process.env.PORT || String(3960 + (process.pid % 30)), 10);
const BASE = `http://localhost:${PORT}`;
const DB = process.env.WAR_TEST_DB || "";
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { tag: "phone", width: 390, height: 844, touch: true },
  { tag: "desktop", width: 1440, height: 900, touch: false },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  const server = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: {
      ...process.env, PORT: String(PORT),
      NODE_ENV: useProd ? "production" : "development",
      ...(DB ? { DATABASE_URL: DB } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  const started = Date.now();
  for (;;) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) break; } catch { /* wait */ }
    if (Date.now() - started > 180000) throw new Error("server never came up");
    await sleep(400);
  }
  console.log(`[warshot] server up on ${PORT}${DB ? " with a war database" : " with NO database"}`);

  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: ["--no-sandbox", "--disable-gpu-sandbox"],
  });

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1, isMobile: vp.touch, hasTouch: vp.touch,
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log(`[warshot] PAGE ERROR ${vp.tag}: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && console.log(`[warshot] console ${vp.tag}: ${m.text()}`));
    await page.goto(`${BASE}/factions`, { waitUntil: "domcontentloaded" });
    // Wait for a stylesheet to actually be attached and parsed. In dev,
    // Tailwind compiles on demand and a timed shot photographs an unstyled
    // screen — a layout audit whose input is unstyled is worse than none.
    await page.waitForFunction(() => {
      let rules = 0;
      for (const s of Array.from(document.styleSheets)) {
        try { rules += s.cssRules.length; } catch { /* opaque */ }
      }
      return rules > 20;
    }, null, { timeout: 120000 });
    // And for the war rolls to have arrived, so this is never a photo of the
    // loading state filed as a map.
    await page.waitForSelector(".warmap-svg", { timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(900);
    const name = `war-${DB ? "live" : "unkept"}-${vp.tag}`;

    // `.shell` is `position: fixed; inset: 0; overflow-y: auto` — the game's
    // own scroller — so the DOCUMENT never grows and `fullPage: true` returns
    // one viewport and calls it the whole screen. The first run of this tool
    // did exactly that and I reviewed a map with the standings, the oath and
    // half of southern England outside the frame, none of which I could see
    // was missing. So the shell is scrolled by hand and shot twice.
    await page.screenshot({ path: resolve(OUT, `${name}-top.png`) });
    console.log(`[warshot] ${name}-top`);
    const scrolled = await page.evaluate(() => {
      const shell = document.querySelector(".shell");
      if (!shell) return 0;
      shell.scrollTop = shell.scrollHeight;
      return shell.scrollTop;
    });
    await sleep(500);
    await page.screenshot({ path: resolve(OUT, `${name}-foot.png`) });
    console.log(`[warshot] ${name}-foot (scrolled ${scrolled}px)`);
    await ctx.close();
  }
  await browser.close();
  server.kill("SIGKILL");
}

main().catch((e) => { console.error("[warshot]", e); process.exit(1); });
