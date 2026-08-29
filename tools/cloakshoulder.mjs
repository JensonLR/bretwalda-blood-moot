#!/usr/bin/env node
// ============================================================
// CLOAKSHOULDER — the owner's own view of the cloak defect.
//
//   node tools/cloakshoulder.mjs
//   node tools/cloakshoulder.mjs --cloak "Blood Red" --cls WEARD
//
// The owner circled a patch of cloak cloth showing through the FRONT of a
// warrior's shoulder, on the armoury's SHOULDERS framing. Every ruler this
// project has for the cloak measures it against the back, the weapon or the
// arm; the one thing none of them had was the picture he was looking at.
//
// So this is that picture, on demand, for every cloak and every class: open
// the armoury, take the CLOAKS tab, take the SHOULDERS framing, turn him to
// face the camera, and crop the preview panel. Captures are KEPT (the
// capture-harness law) in art/cloakshoulder/.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "art/cloakshoulder");
mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const TAG = flag("tag", "now");
const PORT = 3820 + (process.pid % 60);
const BASE = `http://localhost:${PORT}`;

const srv = spawn("node", ["custom-server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), NODE_ENV: existsSync(resolve(ROOT, ".next/BUILD_ID")) ? "production" : "development" },
  stdio: "pipe",
});
let out = "";
srv.stdout.on("data", (d) => { out += d; });
srv.stderr.on("data", (d) => { out += d; });
const die = async (m) => { console.log(`[cloak] ${m}\n${out.slice(-600)}`); srv.kill("SIGTERM"); process.exit(1); };

const ready = async () => {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) return true; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

const main = async () => {
  if (!(await ready())) return die("the server never answered");
  // The same launch the other capture tools use: this box has a preinstalled
  // chromium and a software renderer, and the default launch reaches for a
  // headless shell that is not there.
  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
      "--disable-gpu-sandbox", "--no-sandbox", "--ignore-gpu-blocklist"],
  });
  // Desktop, because the armoury's preview panel is largest there and the
  // defect is a ~20 px patch: photographing it on a phone crop is
  // photographing four pixels.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /Armoury/ }).first().click();
  await page.waitForTimeout(7000);

  const tab = page.getByRole("button", { name: /^CLOAKS$/ }).first();
  if (!(await tab.count())) return die("no CLOAKS tab on the armoury");
  await tab.click();
  await page.waitForTimeout(2500);

  const shoulders = page.getByRole("button", { name: /^SHOULDERS$/ }).first();
  if (!(await shoulders.count())) return die("no SHOULDERS framing on the armoury");
  await shoulders.click();
  await page.waitForTimeout(2500);

  // Face him at the camera. The stage opens on a three-quarter turn and the
  // owner's picture is nearly front-on, which is the view the patch shows in.
  const panel = page.locator("canvas").first();
  const box = await panel.boundingBox();
  if (!box) return die("the preview panel has no box");
  const drag = async (dx) => {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(1200);
  };

  const classes = ["HUSCARL", "WEARD", "WRECCA", "BERSERKER"];
  for (const cls of classes) {
    const b = page.getByRole("button", { name: new RegExp(`^${cls}$`) }).first();
    if (await b.count()) { await b.click(); await page.waitForTimeout(2600); }
    // Three turns each: front, and a little either side, because a patch that
    // hides at one bearing is still a patch.
    for (const [name, dx] of [["front", 0], ["left", -70], ["right", 140]]) {
      if (dx) await drag(dx);
      await page.waitForTimeout(600);
      await page.screenshot({
        path: resolve(OUT, `${TAG}-${cls.toLowerCase()}-${name}.png`),
        clip: { x: box.x, y: box.y, width: box.width, height: box.height },
      });
      console.log(`[cloak] ${TAG}-${cls.toLowerCase()}-${name}`);
    }
    await drag(-70);
  }

  await browser.close();
  srv.kill("SIGTERM");
  console.log(`[cloak] wrote to ${OUT} — LOOK AT THEM`);
};
main().catch(async (e) => die(String(e)));
