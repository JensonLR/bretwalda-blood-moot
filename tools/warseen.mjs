#!/usr/bin/env node
// ============================================================
// WARSEEN — the dispatch watermark, driven through a real browser.
//
//   WAR_TEST_DB=postgres://... node tools/warseen.mjs
//
// WHAT THIS MEASURES, AND WHY IT IS NOT COVERED BY ANYTHING ELSE.
//
// `factionMap/Dispatch.tsx` answers one question: which of the flips on the
// map is NEWS TO YOU. The whole mechanic is a watermark in localStorage, and
// it has a property no single page load can show — THE VISIT THAT SHOWS YOU
// THE NEWS IS THE VISIT AFTER WHICH IT STOPS BEING NEWS. That is two page
// loads by definition, so it cannot be photographed and it cannot be asserted
// from one render.
//
// It is also the exact shape of defect this repository keeps recording: the
// first implementation rendered NOTHING AT ALL on a genuine first visit — the
// one case with an empty store — and every screenshot taken of it looked
// perfect, because every one of those runs had pre-set a watermark. Green
// because the case was absent. `docs/PROCESS.md` failure mode 1.
//
// THE THREE STATES, in the order a real player meets them:
//
//   1. NEVER LOOKED. The store is empty. He is shown the war so far.
//   2. LOOKED, AND SOMETHING MOVED SINCE. Only the flips after his watermark.
//   3. LOOKED, AND NOTHING MOVED. Never an empty box — the closest contest,
//      which is the sentence he can actually act on.
//
// AND THE HARNESS'S OWN TRAP, which it fell into first: planting the test
// credential by loading /factions ALSO raises the watermark, so state 1 can
// never be observed afterwards. It reported "Since you last looked, 0 flips"
// for a browser that had genuinely never looked. The credential is planted on
// /api/health instead, which is the same origin and not the map.
//
// Requires a database — there is no war to have moved without one — and says
// so and exits 0 without it, the same contract `warflow` has.
// ============================================================
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";
import { spawn } from "child_process";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { chooseServer } from "./lib/freshbuild.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DB = process.env.WAR_TEST_DB || "";
const PORT = parseInt(process.env.PORT || String(4020 + (process.pid % 40)), 10);
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!DB) {
  console.log("[warseen] no WAR_TEST_DB — the dispatch has no war to report. Skipping.");
  process.exit(0);
}

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** The seeded man from `tools/warseed.mjs`. */
const AS = process.env.WARSEEN_AS || "1:seed-wulfstan-secret";

async function main() {
  const choice = chooseServer(ROOT, "warseen");
  console.log(`[warseen] ${choice.note}`);
  const server = spawn("node", [choice.script], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATABASE_URL: DB,
           NODE_ENV: choice.prod ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  watchBoot(server, "warseen");
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  const started = Date.now();
  for (;;) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* wait */ }
    if (Date.now() - started > 240000) throw new Error("server never came up");
    await sleep(400);
  }

  const browser = await chromium.launch({
    ...launchOptions(),
  });
  // A phone, because that is where the defect this panel fixes was reported.
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  // THE CREDENTIAL GOES ON /api/health, NOT ON THE MAP. See the header.
  const [id, ...rest] = AS.split(":");
  await page.goto(`${BASE}/api/health`, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ id, secret }) => {
    localStorage.setItem("bretwalda_link", JSON.stringify({ id, secret }));
  }, { id: Number(id), secret: rest.join(":") });

  const readState = async () => {
    await page.goto(`${BASE}/factions`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".warmap-svg", { timeout: 90000 });
    // The panel is drawn off the war fetch; give it the round trip.
    await sleep(1200);
    const panel = await page.locator(".wd").count();
    return {
      panel,
      heading: panel ? (await page.textContent(".wd .section-title"))?.trim() : null,
      flips: await page.locator(".wd-list > li").count(),
      quiet: await page.locator(".wd-quiet").count(),
      quietText: (await page.locator(".wd-quiet").count())
        ? (await page.textContent(".wd-quiet"))?.replace(/\s+/g, " ").trim() : null,
      watermark: await page.evaluate(() => localStorage.getItem("bretwalda_war_seen_1")),
      season: await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("bretwalda_war_seen"))),
    };
  };

  const flipCount = await page.evaluate(async () => {
    const r = await fetch("/api/war", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const b = await r.json();
    return b.war ? b.war.recent.length : 0;
  });
  console.log(`[warseen] the season has ${flipCount} recorded flips on the wire\n`);
  if (flipCount === 0) {
    console.log("[warseen] no flips in this season — run tools/warseed.mjs first. Skipping.");
    server.kill("SIGKILL"); await browser.close(); process.exit(0);
  }

  console.log("1. A browser that has never looked");
  const before = await page.evaluate(() => localStorage.getItem("bretwalda_war_seen_1"));
  check("the store is empty before the first visit", before === null, `saw ${before}`);
  const v1 = await readState();
  check("the panel is drawn at all", v1.panel === 1, `panel count ${v1.panel}`);
  check("it does not claim he was away", v1.heading === "The war so far", `heading ${JSON.stringify(v1.heading)}`);
  check("and it names what has moved", v1.flips > 0, `${v1.flips} dispatches`);
  check("the watermark is now set", v1.watermark !== null, `${v1.watermark}`);
  // THE WATERMARK IS A SERVER TIMESTAMP, not the handset's clock. A value
  // within a second of `Date.now()` would mean the phone's clock had been
  // written, which is the defect Dispatch.tsx's header is about.
  const skew = Math.abs(Date.now() - Number(v1.watermark));
  check("...and it is a flip's timestamp, not this device's clock",
    skew > 60_000, `${Math.round(skew / 60_000)} minutes from now — a flip, not now()`);

  console.log("\n2. The same browser, looking again with nothing moved since");
  const v2 = await readState();
  check("the panel is still drawn", v2.panel === 1, `panel count ${v2.panel}`);
  check("the news is not repeated", v2.flips === 0, `${v2.flips} dispatches`);
  check("...and the box is not empty — it names the closest contest",
    v2.quiet === 1 && /need|next point/.test(v2.quietText || ""), v2.quietText);
  check("the watermark did not move", v2.watermark === v1.watermark, `${v2.watermark}`);

  console.log("\n3. A browser that looked before the last few flips");
  // Wind the watermark back behind some of the flips and require exactly the
  // ones after it. This is the state a returning player is actually in.
  const flips = await page.evaluate(async () => {
    const r = await fetch("/api/war", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const b = await r.json();
    return b.war.recent.map((f) => f.at);   // newest first
  });
  const cut = flips[Math.min(2, flips.length - 1)];
  await page.evaluate((v) => localStorage.setItem("bretwalda_war_seen_1", String(v)), cut);
  const v3 = await readState();
  const expected = flips.filter((at) => at > cut).length;
  check("it says he was away", v3.heading === "While you were away", `heading ${JSON.stringify(v3.heading)}`);
  check("and shows exactly the flips after his watermark",
    v3.flips === Math.min(expected, 6), `showed ${v3.flips}, expected ${Math.min(expected, 6)} of ${expected}`);
  check("the watermark is raised to the newest again",
    v3.watermark === String(flips[0]), `${v3.watermark} vs newest ${flips[0]}`);

  console.log("\n4. The screen stayed up");
  check("no page errors on any of the three visits", pageErrors.length === 0, pageErrors.join(" | ") || "none");
  check("the watermark is kept per season", v3.season.every((k) => /_\d+$/.test(k)), v3.season.join(","));

  await browser.close();
  server.kill("SIGKILL");

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${"=".repeat(64)}`);
  console.log(`${passed === results.length ? "PASS" : "FAIL"}: the dispatch watermark — ${passed}/${results.length}`);
  console.log("=".repeat(64));
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error("[warseen]", e); process.exit(1); });
