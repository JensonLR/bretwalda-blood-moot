#!/usr/bin/env node
// ============================================================
// ARMOURYCARD — one screen, shot fast, with the console attached.
//
//   node tools/armourycard.mjs                  # phone + desktop, helmets
//   node tools/armourycard.mjs --tab CLOAKS
//   node tools/armourycard.mjs --item "Sutton Hoo" --lens "AT FIGHT DISTANCE"
//
// `uishots.mjs` drives the whole menu flow and takes four minutes. This drives
// ONE screen so the armoury can be iterated on, and — the part that matters —
// it prints every console error and every uncaught page error, which uishots
// swallows. It also reports whether the mannequin's canvas is actually drawing
// anything, because a WebGL panel that has silently stopped rendering
// photographs as a tasteful gradient and reads as a design choice.
// ============================================================
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";
import { spawn } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "art/ui");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);

const PORT = parseInt(flag("port", String(3600 + (process.pid % 200))), 10);
const BASE = () => `http://localhost:${PORT}`;
const TAB = flag("tab", null);
const ITEM = flag("item", null);
const LENS = flag("lens", null);
const NAME = flag("name", "armourycard");
mkdirSync(OUT, { recursive: true });

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
 * Waits until every visible card carries a picture and the mannequin has drawn
 * a few frames since, or gives up and says so. Returns what it saw.
 */
async function settle(page, budgetMs = 150000) {
  const started = Date.now();
  let last = null;
  for (;;) {
    const now = await page.evaluate(() => {
      const tiles = document.querySelectorAll("button .aspect-square").length;
      const imgs = document.querySelectorAll("button img").length;
      const st = window.__armouryStats ?? null;
      return { tiles, imgs, frames: st ? st.frames : 0, mounted: !!st };
    });
    last = now;
    if (now.mounted && now.tiles > 0 && now.imgs >= now.tiles) break;
    if (Date.now() - started > budgetMs) {
      console.log(`[card] settle GAVE UP after ${((Date.now() - started) / 1000).toFixed(0)} s: ${now.imgs}/${now.tiles} cards drawn, mounted=${now.mounted}`);
      break;
    }
    await page.waitForTimeout(500);
  }
  // A beat past the last picture, so the mannequin is drawn over the corner
  // the last thumbnail was taken in.
  await page.waitForTimeout(1200);
  return last;
}

let server;
async function startServer() {
  try {
    await fetch(`${BASE()}/api/health`, { signal: AbortSignal.timeout(1500) });
    console.error(`[card] something is already serving ${BASE()} — pass --port`);
    process.exit(2);
  } catch { /* free, good */ }
  const built = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  if (!built) {
    console.error("[card] no production build found — run `npm run build` first");
    process.exit(2);
  }
  server = spawn("node", ["custom-server.mjs"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  watchBoot(server, "armourycard");
  server.stdout.on("data", () => {});
  server.stderr.on("data", (d) => process.stderr.write(`[srv] ${d}`));
  await waitForServer(`${BASE()}/api/health`);
  console.log(`[card] serving the production build on ${PORT}`);
}

const VIEWPORTS = has("desktop-only")
  ? [{ tag: "desktop", width: 1440, height: 900, touch: false }]
  : has("phone-only")
    ? [{ tag: "phone", width: 390, height: 844, touch: true }]
    : [
      { tag: "phone", width: 390, height: 844, touch: true },
      { tag: "desktop", width: 1440, height: 900, touch: false },
    ];

async function main() {
  await startServer();
  const browser = await chromium.launch({
    ...launchOptions(),
  });

  let bad = 0;
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1, isMobile: vp.touch, hasTouch: vp.touch,
    });
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") {
        console.log(`[card] ${vp.tag} console.${m.type()}: ${m.text().slice(0, 400)}`);
        if (m.type() === "error") bad++;
      }
    });
    page.on("pageerror", (e) => { console.log(`[card] ${vp.tag} PAGE ERROR: ${String(e).slice(0, 600)}`); bad++; });

    await page.goto(`${BASE()}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /Armoury/ }).first().click();
    // Wait on the SHOP, not on a stopwatch. The stage generates a texture
    // library and bakes a PMREM before its first frame, and it fills the cards
    // one picture per frame after that — on this GPU-less box that is seconds,
    // on a phone it is not. A fixed sleep here photographed a screen with
    // seven spinners on it and filed that as the design.
    await settle(page);

    const tabs = await page.evaluate(() =>
      [...document.querySelectorAll(".tab-item")].map((e) => e.textContent.trim()));
    console.log(`[card] ${vp.tag} tabs: ${JSON.stringify(tabs)}`);
    if (TAB) {
      const t = page.locator(".tab-item", { hasText: TAB }).first();
      await t.scrollIntoViewIfNeeded();
      await t.click();
      await settle(page);
    }
    if (ITEM) {
      await page.getByRole("button", { name: new RegExp(ITEM) }).first().click();
      await page.evaluate(() => { const s = document.querySelector(".shell"); if (s) s.scrollTop = 0; });
      await settle(page);
    }
    if (LENS) {
      await page.getByRole("button", { name: new RegExp(LENS) }).first().click();
      await settle(page);
    }

    // Is the stage alive, and what is it costing?
    //
    // NOT measured by photographing the canvas. A WebGL context without
    // `preserveDrawingBuffer` reads back as an empty bitmap however healthy it
    // is, and the first run of this tool duly reported "contrast=0, a blank
    // panel" for a panel with a warrior standing in it. The stage publishes
    // its own frame and thumbnail counters instead — see `StageStats`.
    const stats = async () => page.evaluate(() => window.__armouryStats ?? null);
    const a = await stats();
    await page.waitForTimeout(2000);
    const b = await stats();
    if (!b) {
      console.log(`[card] ${vp.tag} STAGE: NO STATS — the stage never mounted`);
      bad++;
    } else {
      const drew = b.frames - (a ? a.frames : 0);
      console.log(`[card] ${vp.tag} STAGE: tier=${b.tier} ${drew} frames in 2.0 s (${(drew / 2).toFixed(1)} fps) · worst frame ${b.worstFrameMs.toFixed(0)} ms · ${b.thumbs} thumbs, worst ${b.worstThumbMs.toFixed(0)} ms`);
      if (drew === 0) { console.log(`[card] ${vp.tag} STAGE IS DEAD — no frames drawn`); bad++; }
    }

    // How many cards actually have a photograph on them.
    const cards = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll("button img")];
      const tiles = [...document.querySelectorAll("button .aspect-square")];
      return { withThumb: imgs.length, tiles: tiles.length };
    });
    console.log(`[card] ${vp.tag} CARDS: ${cards.withThumb} of ${cards.tiles} carry a rendered thumbnail`);

    await page.screenshot({ path: resolve(OUT, `${NAME}-${vp.tag}.png`) });
    console.log(`[card] ${NAME}-${vp.tag}`);
    await ctx.close();
  }

  await browser.close();
  if (server && !server.killed) server.kill("SIGTERM");
  console.log(`[card] FINAL: ${bad} console/page errors across ${VIEWPORTS.length} viewport(s)`);
  process.exit(0);
}

main().catch((e) => { console.error(e); if (server && !server.killed) server.kill("SIGTERM"); process.exit(1); });
