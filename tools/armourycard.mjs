#!/usr/bin/env node
// ============================================================
// ARMOURYCARD — one screen, shot fast, with the console attached.
//
//   node tools/armourycard.mjs                  # phone + desktop, helmets
//   node tools/armourycard.mjs --tab CLOAKS
//   node tools/armourycard.mjs --item "Sutton Hoo" --lens "AT FIGHT DISTANCE"
//   node tools/armourycard.mjs --classes huscarl,warden,runekeeper,berserker --lenses "PORTRAIT,FULL KIT"
//       one session, every class x every lens, waiting for the AUTHORED man each time
//
// `uishots.mjs` drives the whole menu flow and takes four minutes. This drives
// ONE screen so the armoury can be iterated on, and — the part that matters —
// it prints every console error and every uncaught page error, which uishots
// swallows. It also reports whether the mannequin's canvas is actually drawing
// anything, because a WebGL panel that has silently stopped rendering
// photographs as a tasteful gradient and reads as a design choice.
// ============================================================
import { chromium } from "playwright";
import { launchOptions } from "./lib/browser.mjs";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { serveProduction, settleShop, CLASS_BUTTON } from "./lib/armoury.mjs";
import * as W from "./lib/crownwindow.mjs";

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
// `--classes` x `--lenses`: one page load, one settle, then the class picker and
// the lens strip are driven for every combination. The 8.4 s first frame and the
// forty thumbnails are paid once per viewport instead of once per frame, and —
// the part that matters — each frame WAITS FOR THE AUTHORED MAN. The armoury
// builds the procedural man first and swaps the authored one in when a 1.6 MB
// GLB lands; a capture taken before the swap is a picture of the man the default
// player does not see, and it has a head, which is exactly how a defect in the
// authored one gets certified. `window.__authored` (the swap's own report, with
// its class) and `window.__authoredProps` (the dressed head) are what is waited on.
const CLASSES = flag("classes", null)?.split(",") ?? null;
const LENSES = flag("lenses", null)?.split(",") ?? null;
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
mkdirSync(OUT, { recursive: true });

/** The shop's settle, from the shared lib (one idea of "the shop has settled" for every tool). */
const settle = (page) => settleShop(page, "card");

let served;
async function startServer() {
  served = await serveProduction(ROOT, "card", PORT);
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

    // ---- EVERY CLASS x EVERY LENS, on the authored man ----
    if (CLASSES || LENSES) {
      const classes = CLASSES ?? [null];
      const lenses = LENSES ?? [null];
      for (const cls of classes) {
        if (cls) {
          if (!CLASS_BUTTON[cls]) { console.log(`[card] unknown class ${cls}`); bad++; continue; }
          // The props report is replaced (not mutated) by each dressing, so
          // "a NEW object" is how a swap that has landed for THIS man is told
          // from the last man's.
          // The class the stage already holds is not rebuilt by clicking it, so
          // there is nothing new to wait for: its swap is read as it stands.
          const already = await page.evaluate((c) => window.__authored?.cls === c, cls);
          await page.evaluate(() => { window.__cardPrev = window.__authoredProps ?? null; });
          if (!already) await page.getByRole("button", { name: new RegExp(`^${CLASS_BUTTON[cls]}$`) }).first().click();
          const t0 = Date.now();
          let landed = false;
          while (Date.now() - t0 < 120000) {
            landed = await page.evaluate(([c, was]) => window.__authored?.cls === c && window.__authored?.ok === true
              && !!window.__authoredProps && (was || window.__authoredProps !== window.__cardPrev), [cls, already]);
            if (landed) break;
            await page.waitForTimeout(500);
          }
          const rep = await page.evaluate(() => ({ a: window.__authored ?? null, p: window.__authoredProps ?? null }));
          console.log(`[card] ${vp.tag} ${cls}: authored swap ${landed ? "LANDED" : "DID NOT LAND (this frame is the PROCEDURAL man)"} in ${((Date.now() - t0) / 1000).toFixed(1)} s`
            + `  joints=${rep.a?.joints} dressed=${rep.a?.dressed} rehung=${rep.a?.rehung} drape=${rep.a?.drape}`
            + `  props mounted=${JSON.stringify(rep.p?.mounted)} missing=${JSON.stringify(rep.p?.missing)}`);
          if (!landed) bad++;
        }
        for (const lens of lenses) {
          if (lens) {
            await page.getByRole("button", { name: new RegExp(lens) }).first().click();
          }
          // A few frames past the lens change, so the mannequin has re-framed and drawn.
          const f0 = (await page.evaluate(() => window.__armouryStats?.frames ?? 0));
          for (let i = 0; i < 60; i++) {
            const f = await page.evaluate(() => window.__armouryStats?.frames ?? 0);
            if (f - f0 >= 8) break;
            await page.waitForTimeout(500);
          }
          // BACK TO THE TOP, and then the mannequin has to have drawn there. Clicking a
          // class or a lens scrolls its button into view, and at desktop width that left
          // the page ~380 px down: every one of the eight desktop frames a first run
          // took was of the helmet cards with the man cut off above them (found by
          // opening the PNGs, PROCESS R5 — the log said 0 errors and LANDED eight times).
          await page.evaluate(() => { const sh = document.querySelector(".shell"); if (sh) sh.scrollTop = 0; window.scrollTo(0, 0); });
          const f1 = (await page.evaluate(() => window.__armouryStats?.frames ?? 0));
          for (let i = 0; i < 40; i++) {
            const f = await page.evaluate(() => window.__armouryStats?.frames ?? 0);
            if (f - f1 >= 3) break;
            await page.waitForTimeout(500);
          }
          // THE HEAD, in the pixels the stage drew (`tools/lib/crownwindow.mjs`): the owner's
          // "a torso ending in a neck stump" was the one thing this tool photographed eight times
          // and never asked about. Waited on so the frame and the read are the same settled man.
          await W.untilSettled(page, { expectAuthored: true, budgetMs: 30000 });
          const head = await W.readHead(page);
          const problems = W.judge(head, W.BARS, { requireAuthored: true });
          const out = `${NAME}-${cls ?? "class"}-${slug(lens ?? "lens")}-${vp.tag}`;
          await page.screenshot({ path: resolve(OUT, `${out}.png`) });
          console.log(`[card] ${out}`);
          console.log(`[card]   HEAD ${problems.length ? "FAIL" : "ok"}: ${W.describe(head)}${problems.length ? " — " + problems.join("; ") : ""}`);
          if (problems.length) bad++;
        }
      }
      await ctx.close();
      continue;
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
  if (served) served.stop();
  console.log(`[card] FINAL: ${bad} console/page errors across ${VIEWPORTS.length} viewport(s)`);
  process.exit(0);
}

main().catch((e) => { console.error(e); if (served) served.stop(); process.exit(1); });
