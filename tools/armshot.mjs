#!/usr/bin/env node
// ARMSHOT — the arms choice, photographed (backlog 7.7b).
//
//   node tools/armshot.mjs
//
// One lobby, one mannequin, two loadouts. The claim is the one only pixels
// can make: picking DANE AXE actually re-arms the man on the panel — the
// same createWarriorRig path the fight uses. Captures are KEPT in
// .armshot/ (the capture-harness law: a probe that deletes its own pictures
// argues with numbers while the captures show the wrong scene).
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".armshot");
mkdirSync(OUT, { recursive: true });
const PORT = 3600 + (process.pid % 37);
const say = (m) => console.log(m);
let failed = 0;
const good = (m) => say(`  PASS  ${m}`);
const bad = (m) => { failed++; say(`  FAIL  ${m}`); };

const srv = spawn("node", ["custom-server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), NODE_ENV: existsSync(resolve(ROOT, ".next/BUILD_ID")) ? "production" : "development" },
  stdio: "pipe",
});
watchBoot(srv, "armshot");
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
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  page.setDefaultTimeout(180000);
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Enter warrior name", { exact: false }).first().fill("Wulfnoth");
  await page.getByText("CREATE BATTLE", { exact: false }).first().click();
  await page.getByText("BLOOD MOOT", { exact: false }).first().click();
  await page.getByText("CREATE ROOM", { exact: false }).first().click();

  // The huscarl, sword and board first. His arms cards stand under the grid.
  await page.getByText("HUSCARL", { exact: false }).first().click();
  const axeCard = page.locator('[data-arms="dane_axe"]');
  await axeCard.waitFor({ state: "visible", timeout: 60000 });
  good("the arms cards stand under the class grid");

  // The mannequin's canvas, given a long breath to draw the default.
  const stage = page.locator("canvas").first();
  await page.waitForTimeout(12000);
  const before = await stage.screenshot({ path: resolve(OUT, "huscarl-sword-board.png") });

  await axeCard.click();
  // The selection is round-tripped through the server (select_class →
  // lobby_update) and the stage rebuilds the rig; both take a moment on a
  // software rasteriser.
  await page.waitForTimeout(12000);
  const after = await stage.screenshot({ path: resolve(OUT, "huscarl-dane-axe.png") });

  const same = before.equals(after);
  (!same ? good : bad)(`picking DANE AXE re-arms the mannequin — the pixels moved (${before.length} vs ${after.length} bytes)`);
  const held = await page.evaluate(() => {
    const el = document.querySelector('[data-arms="dane_axe"]');
    return el ? el.className.includes("card-selected") : false;
  });
  (held ? good : bad)("the card shows the server's own choice — dane_axe selected");

  // And the berserker's twin beards, for the hand-axe form's first portrait.
  await page.getByText("BERSERKER", { exact: false }).first().click();
  const beards = page.locator('[data-arms="twin_beards"]');
  await beards.waitFor({ state: "visible", timeout: 30000 });
  await beards.click();
  await page.waitForTimeout(12000);
  await stage.screenshot({ path: resolve(OUT, "berserker-twin-beards.png") });
  good("the twin beards portrait is in .armshot/ — LOOK AT IT");

  await browser.close();
} finally {
  srv.kill();
}
say(failed ? "\n[armshot] FAIL" : "\n[armshot] PASS");
process.exit(failed ? 1 : 0);
