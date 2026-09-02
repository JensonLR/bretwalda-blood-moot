#!/usr/bin/env node
// TOURNEYSEEN — the Tournament Moot, seen in a browser (backlog 7.3).
//
//   node tools/tourneyseen.mjs
//
// `tourneytest` holds the moot's law headless; this file holds what only a
// browser can witness: a real host raising a real tournament against three
// bots, the BRACKET CARD standing in the round break with its NEXT mark,
// the mead-bench telling an eliminated man his moot is run, and the crown
// on the summary. One page, `?quality=low` — the claims are about state.
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3560 + (process.pid % 37);
const say = (m) => console.log(m);
let failed = 0;
const good = (m) => say(`  PASS  ${m}`);
const bad = (m) => { failed++; say(`  FAIL  ${m}`); };

const srv = spawn("node", ["custom-server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), NODE_ENV: existsSync(resolve(ROOT, ".next/BUILD_ID")) ? "production" : "development" },
  stdio: "pipe",
});
watchBoot(srv, "tourneyseen");
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
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });

  await page.getByPlaceholder("Enter warrior name", { exact: false }).first().fill("Cyning");
  await page.getByText("CREATE BATTLE", { exact: false }).first().click();
  const card = page.getByText("TOURNAMENT MOOT", { exact: false }).first();
  try {
    await card.waitFor({ state: "visible", timeout: 20000 });
    good("the TOURNAMENT MOOT stands on the create screen");
  } catch { bad("no TOURNAMENT MOOT card on the create screen"); }
  await card.click();
  await page.getByText("CREATE ROOM", { exact: false }).first().click();
  const addAi = page.getByText("ADD AI", { exact: false }).first();
  await addAi.waitFor({ state: "visible", timeout: 90000 });
  const bracketBlurb = await page.getByText("THE BRACKET", { exact: false }).first().isVisible().catch(() => false);
  (bracketBlurb ? good : bad)("the lobby names the format: THE BRACKET, no rounds dial");
  for (let i = 0; i < 3; i++) { await addAi.click(); await page.waitForTimeout(400); }
  await page.getByText("START", { exact: true }).first().click();

  // The moot runs itself: bots duel, the idle host dies in his own duel.
  // The first break that shows the tree is the claim; watch for it while
  // the whole moot runs down.
  // ONE atomic read for the tree and its mark: this claim's first run found
  // the tree with one query and asked for NEXT with a second, and on a box
  // this slow the 5-second break had ended between them — the ruler raced
  // the break and lost. The NEXT badge lives INSIDE [data-bracket], so the
  // element's own text in the same frame is the whole answer.
  const tree = await page.waitForFunction(() => {
    const el = document.querySelector("[data-bracket]");
    return el ? { next: el.textContent?.includes("NEXT") ?? false } : null;
  }, null, { timeout: 240000 }).then((h) => h.jsonValue()).catch(() => null);
  (tree ? good : bad)("the round break draws the TREE — [data-bracket] stood");
  if (tree) {
    (tree.next ? good : bad)("the tree marks the NEXT duel");
    // The redesigned card's portrait, KEPT (the capture-harness law) —
    // the owner called the first design poor, so every redesign gets
    // photographed where he would see it.
    const { mkdirSync } = await import("fs");
    mkdirSync(resolve(ROOT, ".armshot"), { recursive: true });
    await page.screenshot({ path: resolve(ROOT, ".armshot", "bracket-break.png") });
    good("the break's portrait is in .armshot/bracket-break.png — LOOK AT IT");
  }

  // Sooner or later the idle host's duel comes and he falls; from then on
  // his seat is the bench and it must say his moot is run. Watch for either
  // that line or the summary (he might fall in the final and never sit).
  const outcome = await Promise.race([
    page.waitForFunction(() => document.body.textContent?.includes("Your moot is run"), null, { timeout: 420000 })
      .then(() => "benched"),
    page.waitForFunction(() => document.body.textContent?.includes("BATTLE COMPLETE"), null, { timeout: 420000 })
      .then(() => "summary"),
  ]).catch(() => null);
  if (outcome === "benched") {
    good("a beaten man's bench says it: 'Your moot is run.'");
    const done = await page.waitForFunction(() => document.body.textContent?.includes("BATTLE COMPLETE"), null, { timeout: 420000 })
      .then(() => true).catch(() => false);
    (done ? good : bad)("the moot crowned somebody — BATTLE COMPLETE");
  } else if (outcome === "summary") {
    good("the moot crowned somebody — BATTLE COMPLETE (the host fell in the final itself)");
  } else {
    bad("neither the bench line nor the summary ever came — the moot never resolved");
  }
  const crownLine = await page.evaluate(() => document.body.textContent?.includes("THE BRACKET CROWNS THE CHAMPION") ?? false);
  (crownLine ? good : bad)("the summary says which law crowned him");

  await browser.close();
} finally {
  srv.kill();
}
say(failed ? "\n[tourneyseen] FAIL" : "\n[tourneyseen] PASS");
process.exit(failed ? 1 : 0);
