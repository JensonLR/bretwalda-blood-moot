#!/usr/bin/env node
// CLIPSEEN — the final kill records itself (backlog 7.9), seen in a browser.
//
//   node tools/clipseen.mjs
//
// One real blood moot against bots at LOW tier with the `__forceClip`
// harness door open — medium starves this box's render loop so the replay
// itself never draws, and low never arms by policy; the door bypasses only
// the one policy line so the MACHINERY can be judged — watched until the match ends and the replay has
// played, then judged on the readback the canvas publishes: a WebM of real
// bytes, or an honest NOT RUN when this browser has no MediaRecorder. The
// camera work is the replay's own deathcam — `replayseen` holds that lens's
// claims; this file holds only the recording.
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3479 + (process.pid % 37);
const say = (m) => console.log(m);
let failed = 0;
const good = (m) => say(`  PASS  ${m}`);
const bad = (m) => { failed++; say(`  FAIL  ${m}`); };

const srv = spawn("node", ["custom-server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), NODE_ENV: existsSync(resolve(ROOT, ".next/BUILD_ID")) ? "production" : "development" },
  stdio: "pipe",
});
watchBoot(srv, "clipseen");
const up = async () => {
  for (let i = 0; i < 240; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) return; } catch { /* soon */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server never came up");
};

try {
  await up();
  const browser = await chromium.launch({
    ...launchOptions(),
  });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  page.setDefaultTimeout(180000);
  await page.addInitScript(() => { window.__forceClip = true; });
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });

  const capable = await page.evaluate(() =>
    typeof MediaRecorder !== "undefined"
    && typeof HTMLCanvasElement.prototype.captureStream === "function");
  if (!capable) {
    say("  NOT RUN  this browser has no MediaRecorder/captureStream — the clip cannot exist here, and the button knows it");
    await browser.close();
    srv.kill();
    process.exit(0);
  }

  // One match, straight to the end: a moot against three recruits, single
  // round, and the replay after the last death is the recording under test.
  await page.getByPlaceholder("Enter warrior name", { exact: false }).first().fill("Clipweard");
  await page.getByText("CREATE BATTLE", { exact: false }).first().click();
  await page.getByText("BLOOD MOOT", { exact: false }).first().click();
  await page.getByText("CREATE ROOM", { exact: false }).first().click();
  const addAi = page.getByText("ADD AI", { exact: false }).first();
  await addAi.waitFor({ state: "visible", timeout: 90000 });
  for (let i = 0; i < 3; i++) { await addAi.click(); await page.waitForTimeout(400); }
  await page.getByText("START", { exact: true }).first().click();
  await page.waitForFunction(() => window.__bretwaldaReplay?.state === "fighting"
    || document.body.textContent?.includes("ALIVE"), null, { timeout: 180000 });
  say("  in a fight; the bots will decide it.");

  // Wait for the match to end and the replay to have drawn, then for the
  // recorder's own readback. Generous budgets: this box draws at a crawl and
  // the claim is about bytes, not speed.
  const clip = await page.waitForFunction(() => {
    const c = window.__bretwaldaClip;
    return c && c.bytes > 0 ? c : null;
  }, null, { timeout: 300000 }).then((h) => h.jsonValue()).catch(() => null);

  if (clip) {
    good(`the final kill recorded itself — ${clip.bytes} bytes of ${clip.mime || "video/webm"}`);
    const button = await page.evaluate(() => !!document.querySelector('[data-clip="save"]'));
    (button ? good : bad)(`SAVE THE CLIP stands on the summary — ${button}`);
  } else {
    const replayDrawn = await page.evaluate(() => window.__bretwaldaReplay?.drawn ?? 0);
    bad(`no clip readback after the match — replay drew ${replayDrawn} frames; `
      + "either the recorder never armed or the blob fell under the 16KB honesty floor");
  }

  await browser.close();
} finally {
  srv.kill();
}
say(failed ? "\n[clip] FAIL" : "\n[clip] PASS");
process.exit(failed ? 1 : 0);
