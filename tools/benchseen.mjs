#!/usr/bin/env node
// BENCHSEEN — the mead-bench, seen in a browser (backlog 7.9b).
//
//   node tools/benchseen.mjs
//
// `benchtest` holds the seat's law headless; this file holds the one thing a
// headless engine cannot: that a REAL second browser, joining a REAL running
// fight by code, lands on the game screen watching it — live, not a frozen
// join frame — is told what he is, and walks out of the summary onto the
// lobby roster when the moot ends. Two browser contexts (two warriors, two
// storage worlds), one server, `?quality=low` because this box draws at a
// crawl and every claim here is about state, not paint fidelity.
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3520 + (process.pid % 37);
const say = (m) => console.log(m);
let failed = 0;
const good = (m) => say(`  PASS  ${m}`);
const bad = (m) => { failed++; say(`  FAIL  ${m}`); };

const srv = spawn("node", ["custom-server.mjs"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), NODE_ENV: existsSync(resolve(ROOT, ".next/BUILD_ID")) ? "production" : "development" },
  stdio: "pipe",
});
watchBoot(srv, "benchseen");
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

  // THE HOST raises a moot against one recruit and starts it.
  const hostCtx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  const host = await hostCtx.newPage();
  host.setDefaultTimeout(180000);
  await host.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });
  await host.getByPlaceholder("Enter warrior name", { exact: false }).first().fill("Hlaford");
  await host.getByText("CREATE BATTLE", { exact: false }).first().click();
  await host.getByText("BLOOD MOOT", { exact: false }).first().click();
  await host.getByText("CREATE ROOM", { exact: false }).first().click();
  const addAi = host.getByText("ADD AI", { exact: false }).first();
  await addAi.waitFor({ state: "visible", timeout: 90000 });
  await addAi.click();
  // The war code, read off the URL the lobby writes itself into.
  await host.waitForFunction(() => new URL(location.href).searchParams.get("code"), null, { timeout: 30000 });
  const code = await host.evaluate(() => new URL(location.href).searchParams.get("code"));
  await host.getByText("START", { exact: true }).first().click();
  // Past the countdown and into the fight before anyone knocks.
  await host.waitForFunction(() => document.body.textContent?.includes("ALIVE"), null, { timeout: 180000 });
  say(`  the moot runs at ${code}; a late friend knocks.`);

  // THE WATCHER, a second browser world, joins the RUNNING fight by code.
  const wCtx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  const w = await wCtx.newPage();
  w.setDefaultTimeout(180000);
  await w.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });
  await w.getByPlaceholder("Enter warrior name", { exact: false }).first().fill("Bencsittend");
  await w.getByText("JOIN BATTLE", { exact: false }).first().click();
  await w.locator("#war-code").fill(code);
  await w.getByText("JOIN", { exact: true }).first().click();

  // He lands on the game screen, seated and SAYS SO.
  const bench = w.locator('[data-bench="seated"]');
  try {
    await bench.waitFor({ state: "visible", timeout: 60000 });
    good("a late join lands on the game screen, seated — THE MEAD-BENCH stands on his glass");
  } catch {
    bad(`no bench banner ever stood — page shows: ${((await w.textContent("body")) || "").slice(0, 120)}`);
  }

  // LIVE, not a frozen join frame: the fight's clock moves on his screen.
  // This ruler has been wrong twice, both times about itself. First it read
  // bare body text, where textContent runs the clock digits straight into
  // the ALIVE count's ("0:0712") and a word-boundary regex can never match.
  // Then it compared two samples 3.5 s apart — and both could land inside a
  // ROUND BREAK, where `stepRoom` freezes `matchTimer` on purpose, failing
  // the seat for the game working. The honest claim is that the clock WALKS
  // AT ALL during his watch: read the clock's own node and wait out any
  // break for the next round to move it.
  const clockNode = "[data-bench-clock]";
  const t1 = await w.evaluate((sel) =>
    document.querySelector(sel)?.textContent?.trim() ?? null, clockNode);
  const walked = await w.waitForFunction((args) => {
    const t = document.querySelector(args.sel)?.textContent?.trim() ?? null;
    return t && t !== args.was ? t : null;
  }, { sel: clockNode, was: t1 }, { timeout: 45000 }).then((h) => h.jsonValue()).catch(() => null);
  if (t1 && walked) good(`the fight is live on his glass — the clock walked ${t1} -> ${walked}`);
  else bad(`the clock never moved off ${t1} in 45s — a frozen frame sold as a seat`);

  // The moot resolves (an idle host against a recruit still ends: somebody
  // wins each round until the format is spent) and the verdict reaches the
  // bench; the summary carries FIGHT AGAIN.
  await w.waitForFunction(() => document.body.textContent?.includes("BATTLE COMPLETE"), null, { timeout: 300000 });
  good("the verdict reached the bench — BATTLE COMPLETE on the watcher's glass");

  // The room lobbies underneath the summary; FIGHT AGAIN carries the
  // promoted man onto the roster he was just dealt into.
  await w.waitForTimeout(11500);
  await w.getByText("FIGHT AGAIN", { exact: false }).first().click();
  try {
    await w.waitForFunction(() =>
      document.body.textContent?.includes("Bencsittend")
      && !document.querySelector('[data-bench="seated"]'), null, { timeout: 30000 });
    good("the bench emptied onto the floor — his name stands on the lobby roster");
  } catch {
    bad("FIGHT AGAIN never reached a roster with his name on it");
  }

  await browser.close();
} finally {
  srv.kill();
}
say(failed ? "\n[benchseen] FAIL" : "\n[benchseen] PASS");
process.exit(failed ? 1 : 0);
