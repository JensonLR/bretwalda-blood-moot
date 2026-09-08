#!/usr/bin/env node
// ============================================================================
// BLOODSHOT — the spray, photographed while it is still in the air.
//
//   npm run build && node tools/bloodshot.mjs        (or: npm run bloodshot)
//
// WHY THIS EXISTS. The owner has now ruled on this effect three times — "it
// should be LIQUID POURING OUT LIKE A HOSE", then "large volume that players
// can see", then "just red paint not the thick spraying blood we wanted" — and
// every instrument this project had pointed somewhere else.
//
//   `goretest` proves the ARITHMETIC: that the spray arcs, lands inside 0.85 s,
//   reaches four metres, marks the ground. All of that can be true of a spray
//   nobody would look at twice.
//   `gorestat` measures the RULERS, not the blood.
//   `goreshot` films a real match, and a real match puts the local man's death
//   wash and a pointer-lock banner over every frame — and photographs whatever
//   moment the fight happened to reach.
//
// So: the shot page's `gorehead` preset, which stages a decapitation
// deterministically, photographed at four values of `settle` — 3, 6, 10 and 26
// frames after the blow. That range is chosen: the spray is thrown in the first
// tenth of a second and is on the ground by the ninth, so a still at 26 is a
// picture of the pools and a still at 6 is a picture of the throw. Both are the
// question, and neither answers the other.
//
// IT ASSERTS NOTHING. A spray is a look, and a look is the owner's call — this
// puts four honest frames in `.bloodshot/` and gets out of the way.
// ============================================================================
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";
import { spawn } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".bloodshot");
const PORT = parseInt(process.env.PORT || String(3820 + (process.pid % 40)), 10);
const PRESET = (process.argv.find((a) => a.startsWith("--preset=")) || "").slice(9) || "gorehead";
const SETTLES = (process.argv.find((a) => a.startsWith("--at=")) || "").slice(5) || "3,6,10,26";

if (!existsSync(resolve(ROOT, ".next/BUILD_ID"))) {
  console.log("[bloodshot] no production build — run `npm run build` first.");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn("node", ["custom-server.mjs"],
  { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
let up = false;
for (let i = 0; i < 90 && !up; i++) {
  try { up = (await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok; } catch { /* not yet */ }
  if (!up) await sleep(1000);
}
if (!up) { server.kill(); console.log("[bloodshot] the server never answered"); process.exit(1); }

const browser = await chromium.launch({ ...launchOptions() });
try {
  for (const settle of SETTLES.split(",").map((s) => parseInt(s, 10)).filter(Number.isFinite)) {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    watchBoot?.(page);
    await page.goto(
      `http://127.0.0.1:${PORT}/shot?preset=${PRESET}&clean=1&settle=${settle}&quality=high`,
      { waitUntil: "domcontentloaded" });
    // The page raises this when its own settle loop is done; the extra second is
    // for the first compositing frame, which on a software rasteriser is slow.
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 180000 })
      .catch(() => console.log(`[bloodshot] ${PRESET}@${settle}: the page never reported ready`));
    await sleep(1500);
    const file = `${OUT}/${PRESET}-${String(settle).padStart(2, "0")}.png`;
    await page.screenshot({ path: file });
    console.log(`[bloodshot] ${file}  —  ${settle} frames after the blow`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log("\n[bloodshot] LOOK AT THEM. This tool asserts nothing: a spray is a look,");
console.log("            and the look is the owner's call. `goretest` holds the arithmetic.");
