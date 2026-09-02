#!/usr/bin/env node
// ============================================================
// MUSTERSHOT — photograph the wait.
//
//   node tools/mustershot.mjs
//
// `docs/PROCESS.md` R5: OPEN THE RENDER. The muster (BACKLOG 2b.2) added
// exactly one new thing a player will ever SEE — the panel that names who the
// room is standing about for — and `readytest.mjs` can prove every rule of the
// hold without being able to see whether that panel is legible, whether it
// covers the arena, or whether it says anything a person would understand.
// Three of the four defects the owner reported on 8 Aug were invisible to every
// number in this repository and obvious in one PNG.
//
// HOW THE WAIT IS HELD OPEN LONG ENOUGH TO PHOTOGRAPH, and it is not a hack —
// it is the exact case the feature exists for. A raw WebSocket joins the room
// declaring `awaitLoad` and then NEVER REPORTS: a client whose arena will not
// build. The browser finishes its forge, sends `loaded`, and lands in the
// muster waiting for him. That is a real player's screen on a real bad
// connection, which is the screen worth looking at.
//
// Shot at phone and desktop, because the panel is centred text over a live
// arena and a 390px screen is where centred text goes wrong.
//
// RUN IT AGAINST A FRESH PRODUCTION BUILD. In dev mode the forge takes longer
// than LOAD_HOLD_MS, so the HOST times itself out and the panel exists for
// about one frame between his own `loaded` and the bell — which is a true fact
// about `next dev` and a false picture of the feature. `tools/lib/freshbuild.mjs`
// will refuse a stale bundle and drop this to dev; if it does, `npm run build`
// and run it again rather than filing the shot it gives you.
// ============================================================
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";
import { spawn } from "child_process";
import { mkdirSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { WebSocket } from "ws";
import { chooseServer } from "./lib/freshbuild.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "art/ui");
const PORT = parseInt(process.env.PORT || String(3990 + (process.pid % 9)), 10);
const BASE = `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { tag: "phone", width: 390, height: 844, touch: true },
  { tag: "desktop", width: 1440, height: 900, touch: false },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A client that joins, declares it is loading, and never finishes. */
function silentMan(code) {
  return new Promise((ok, no) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    ws.on("error", no);
    ws.on("open", () => ws.send(JSON.stringify({
      type: "join", data: { code, name: "Guthrum", awaitLoad: true },
    })));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      // He joins and then says nothing for ever. No `loaded`, by design.
      if (m.type === "join") ok(ws);
      if (m.type === "error") no(new Error(m.data?.message || "refused"));
    });
  });
}

async function main() {
  const choice = chooseServer(ROOT, "mustershot");
  const server = spawn("node", [choice.script], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: choice.prod ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  watchBoot(server, "mustershot");
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  const started = Date.now();
  for (;;) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) break; } catch { /* wait */ }
    if (Date.now() - started > 180000) throw new Error("server never came up");
    await sleep(400);
  }
  console.log(`[mustershot] server up on ${PORT} — ${choice.note}`);

  const browser = await chromium.launch({
    ...launchOptions(),
  });

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1, isMobile: vp.touch, hasTouch: vp.touch,
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log(`[mustershot] PAGE ERROR ${vp.tag}: ${e.message}`));
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      let rules = 0;
      for (const s of Array.from(document.styleSheets)) {
        try { rules += s.cssRules.length; } catch { /* opaque */ }
      }
      return rules > 20;
    }, null, { timeout: 120000 });

    // The real flow, button by button: name on the landing, CREATE BATTLE to
    // the setup screen, CREATE ROOM to actually raise it. The first cut matched
    // /RAISE|CREATE|HOST/ and stopped at the first of those three, which is why
    // it then waited a minute for a war code that was two screens away.
    await page.getByRole("textbox").first().fill("Aethelred");
    await page.getByRole("button", { name: /CREATE BATTLE/i }).first().click();
    await page.getByRole("button", { name: /CREATE ROOM/i }).first().click();
    // `.warcode` and not a regex over the page text. The first cut scraped
    // /\b[A-Z0-9]{5,6}\b/ off `innerText` and joined a room called SELECT,
    // which is a button on the screen. The code has an element; read the
    // element.
    await page.waitForSelector(".warcode", { timeout: 60000 });
    const code = (await page.locator(".warcode").first().innerText()).trim();
    if (!code) throw new Error("no war code on screen");
    console.log(`[mustershot] ${vp.tag}: room ${code}`);

    const ghost = await silentMan(code);
    await sleep(600);
    await page.getByRole("button", { name: "START", exact: true }).first().click();

    // The browser builds its arena and reports; the ghost never will. What is
    // on screen from here until the twelve seconds run out IS the muster.
    // BOTH conditions, and the second one is here because the first alone
    // photographed the forge screen twice. "WAITING FOR" was on the page in the
    // beat before the canvas reported its first stage — see the note on the
    // panel in page.tsx — so the shot has to wait for the forge to be GONE as
    // well, or it files a picture of the loading bar as a picture of the wait.
    // WAIT ON THE ELEMENT, not on a regex over `innerText`. Two runs were spent
    // on text matching: the first photographed the forge screen because
    // "WAITING FOR" was on the page a beat before the canvas reported (a real
    // defect — see page.tsx), and the second matched a string that outlived the
    // panel that owned it. `[data-muster]` exists exactly when the panel is
    // mounted, and Playwright's `visible` state is the same question the shot is
    // about.
    await page.waitForSelector("[data-muster]", { state: "visible", timeout: 60000 });
    await page.screenshot({ path: resolve(OUT, `muster-${vp.tag}.png`) });
    // AND THE PANEL HAS TO STILL BE THERE AFTERWARDS, or the file is not a
    // picture of the muster and must not be filed as one.
    //
    // This tool filed three pictures of a FIGHT under the name `muster-phone`
    // before this check existed. The window is genuinely narrow in a container
    // with a software renderer: the forge takes most of LOAD_HOLD_MS, so the
    // panel is up for a moment and the shot lands after it. Deleting the file
    // and saying so is the only honest outcome — `docs/PROCESS.md` records ten
    // instances of an instrument answering the wrong question, and a screenshot
    // is an instrument. On real silicon the forge lands in about two seconds
    // and the panel holds for ten.
    const stillThere = await page.locator("[data-muster]").count();
    if (!stillThere) {
      unlinkSync(resolve(OUT, `muster-${vp.tag}.png`));
      console.log(`[mustershot] ${vp.tag}: NO SHOT FILED — the panel was gone before the shutter. ` +
        `This box's forge takes most of the 12 s hold, so the wait it is meant to show barely exists here. ` +
        `Re-run on hardware where the forge lands in a second or two.`);
    } else {
      console.log(`[mustershot] muster-${vp.tag}`);
    }

    // ...and the other half of the decision: the fight starts anyway.
    await page.waitForSelector("[data-muster]", { state: "detached", timeout: 30000 });
    await sleep(1200);
    await page.screenshot({ path: resolve(OUT, `muster-${vp.tag}-started.png`) });
    console.log(`[mustershot] muster-${vp.tag}-started — the bell rang without him`);

    try { ghost.close(); } catch { /* already gone */ }
    await ctx.close();
  }
  await browser.close();
  server.kill("SIGKILL");
}

main().catch((e) => { console.error("[mustershot]", e); process.exit(1); });
