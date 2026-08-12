#!/usr/bin/env node
/**
 * reachprobe — IS PLAYTEST'S BROWSER PHASE BROKEN BY MY CHANGE, OR BY THE BOX?
 *
 * `playtest` runs ~50 engine assertions and then opens a real browser and walks
 * the shipped page into a fight. When that walk fails, the output is a Playwright
 * timeout on a locator, and a timeout on a locator looks exactly the same whether
 * the page is broken, the box is slow, or the change under test blanked the
 * screen. Twelve minutes of engine assertions run before you find out, and they
 * run again on every attempt.
 *
 * This is the first two clicks of `reachFight`, alone, in about two minutes. Run
 * it on your branch and then on a stash of it; if both fail identically the
 * failure is not yours.
 *
 *   node tools/reachprobe.mjs <abs repo root> [port]
 *
 * WHAT IT FOUND, 12 Aug 2026, and why it is worth keeping: in a git worktree the
 * browser phase CANNOT PASS ON THE DEV PATH. The worktree carries its own
 * `package-lock.json`, Next then infers the PARENT checkout as the workspace
 * root, and its dev server answers `/_next/webpack-hmr` from 127.0.0.1 with
 *
 *   "Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr
 *    from 127.0.0.1 ... add it to allowedDevOrigins in next.config.js"
 *
 * The client bundle never finishes wiring up, so the landing page RENDERS and
 * nothing on it is clickable — the probe reports "CLICKED Training" (Playwright
 * dispatches happily) and then sits on the next screen that never arrives.
 *
 * THE FIX IS NOT IN THIS FILE. Either add `allowedDevOrigins: ["127.0.0.1"]` to
 * `next.config.ts`, or run `npm run build` first — `playtest` switches to
 * `custom-server` the moment `.next/BUILD_ID` exists, and production has no HMR
 * to block. The second is what was done here, and the browser phase then ran.
 */
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync } from "fs";

const ROOT = process.argv[2];
const PORT = parseInt(process.argv[3] || "3944", 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!ROOT) {
  console.log("usage: node tools/reachprobe.mjs <abs repo root> [port]");
  process.exit(2);
}

// The DEV path deliberately, even when a build exists: this probe's whole job is
// to characterise the path `playtest` falls back to, and a production server
// would hide the very fault documented above.
const server = spawn("node", ["dev-server.mjs"], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: "development" },
  stdio: ["ignore", "pipe", "pipe"],
});
let srvErr = "";
server.stderr.on("data", (d) => { srvErr += d; });

const started = Date.now();
for (;;) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); if (r.ok || r.status === 404) break; } catch { }
  if (Date.now() - started > 180000) { console.log("SERVER NEVER CAME UP"); process.exit(2); }
  await sleep(700);
}

const preinstalled = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });

const t0 = Date.now();
try {
  await page.getByText("Training", { exact: false }).first().click({ timeout: 120000 });
  console.log(`CLICKED Training after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click({ timeout: 120000 });
  console.log(`CLICKED MUSTER after ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("RESULT: REACHED");
} catch (e) {
  console.log(`RESULT: FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s — ${String(e).split("\n")[0]}`);
  // The body text is the whole diagnosis: still the landing screen means the
  // click landed on an unhydrated page rather than on a screen that broke.
  console.log("BODY TEXT:", (await page.evaluate(() => (document.body.textContent || "").slice(0, 300))));
}
if (errs.length) console.log("PAGE ERRORS:", errs.slice(0, 3).join(" | "));
if (srvErr) console.log("SERVER STDERR:", srvErr.slice(0, 2500));
await browser.close();
server.kill();
process.exit(0);
