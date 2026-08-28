#!/usr/bin/env node
// STORESHOTS — the Steam store's screenshot set, 1920×1080, straight off the
// live renderer through /shot. Valve's own policy (and this repo's): store
// screenshots are actual gameplay frames, so these are the fight presets the
// review harness already trusts, at store resolution, nothing staged that
// the game cannot stage for itself.
//
// Run: node tools/storeshots.mjs   (writes store/steam/screenshots/*.png)
// One browser suite at a time — the standing law.
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "store/steam/screenshots");
mkdirSync(OUT, { recursive: true });
const PORT = 3811;

// Six frames, one argument each: the swing read, the world, the second and
// third grounds, the grade at its most dramatic, and the team fight.
const SHOTS = [
  ["01-duel", "preset=duel&clean=1&quality=high"],
  ["02-village", "preset=arena&clean=1&quality=high"],
  ["03-fort", "preset=fortwide&ground=roman_fort&clean=1&quality=high"],
  ["04-camp", "preset=campwide&ground=danelaw_camp&clean=1&quality=high"],
  ["05-laststand", "preset=laststand&clean=1&quality=high"],
  ["06-teams", "preset=duel&teams=1&clean=1&quality=high"],
];

const srv = spawn("node", ["custom-server.mjs"], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" }, stdio: "pipe",
});
for (let i = 0; i < 240; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/`); if (r.ok) break; } catch { /* soon */ }
  await new Promise((r) => setTimeout(r, 500));
}
const pre = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({
  ...(existsSync(pre) ? { executablePath: pre } : {}),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--disable-gpu-sandbox", "--no-sandbox", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.setDefaultTimeout(600000);
let wrote = 0;
for (const [name, q] of SHOTS) {
  await page.goto(`http://127.0.0.1:${PORT}/shot?${q}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__shotReady === true || typeof window.__shotError === "string");
  const err = await page.evaluate(() => window.__shotError ?? null);
  if (err) { console.log(`  REFUSED ${name}: ${err}`); continue; }
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
  wrote++;
  console.log(`  wrote ${name}.png`);
}
await browser.close();
srv.kill();
console.log(`[storeshots] ${wrote}/${SHOTS.length} at 1920x1080 -> store/steam/screenshots/`);
process.exit(wrote === SHOTS.length ? 0 : 1);
