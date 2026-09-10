#!/usr/bin/env node
// FORGEDTEST — can a PLAYER reach the authored men, and does he pay for them
// only when he asks?
//
//   npm run forgedtest
//
// WHY THIS EXISTS. The authored bodies and the authored motion shipped behind a
// hand-typed URL parameter and nothing else:
//
//   new URLSearchParams(location.search).get("authored") === "1"
//
// duplicated verbatim in GameCanvas.tsx and armouryStage.ts. No env var, no
// setting, no tier hook. So 43 MB of exported warriors, helms, hair and beards —
// and, once the clip driver landed, fifteen hand-authored clips a man — were
// reachable only by somebody who had read the source. Every capture harness in
// this tree could see them; no player could.
//
// They are a stored preference now (`bretwalda.forged`, beside handedness in
// input.ts) with two switches in the graphics panel. This is the gate on the
// four things that has to stay true about them.
//
//   1. DEFAULT OFF. Nobody downloads 43 MB because they opened the game. This
//      is the claim that keeps the feature honest about its cost.
//   2. THE SETTING REACHES THE ARENA. Mesh on, no URL flag, and the men are
//      swapped — which is the whole point and the thing that was missing.
//   3. MOTION IMPLIES MESH. The clips live inside the authored GLB, so motion
//      without mesh must be nothing rather than a switch reading ON over a body
//      that is not there.
//   4. THE URL DOOR STILL WINS. Every capture harness drives `?authored=1`, and
//      a preference that broke `authoredshot` would cost more than it gave.
//
// Counted off the client's own two log lines — `[authored] <cls>: upgraded` and
// `[clips] <cls>: N clips driving the body` — which are the arena saying what it
// actually did, not this file guessing from a screenshot.
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_DIE = resolve(ROOT, "tools/seeddie.mjs");
const PORT = parseInt(process.env.PORT || String(4180 + (process.pid % 40)), 10);
const USE_DEV = process.argv.includes("--dev");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const waitForServer = (url, timeoutMs = 60000) => new Promise((done, no) => {
  const t0 = Date.now();
  const tick = async () => {
    if (Date.now() - t0 > timeoutMs) return no(new Error(`server never came up at ${url}`));
    try { const r = await fetch(url); if (r.ok) return done(); } catch { /* not yet */ }
    setTimeout(tick, 250);
  };
  tick();
});

let server;
async function main() {
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID")) && !USE_DEV;
  console.log("FORGEDTEST — the authored men, as a player can actually reach them\n");
  server = spawn("node", ["--import", SEED_DIE, useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
  });
  watchBoot(server, "forgedtest");
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);

  const browser = await chromium.launch({ ...launchOptions() });

  /**
   * One fight, and what the arena says it did.
   *
   * `stored` is written before any script runs, which is exactly how a returning
   * player's preference arrives; `query` is the harness door.
   */
  async function run(stored, query) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
    if (stored) {
      await ctx.addInitScript((v) => {
        try { localStorage.setItem("bretwalda.forged", v); } catch { /* private mode */ }
      }, JSON.stringify(stored));
    }
    const page = await ctx.newPage();
    page.setDefaultTimeout(90000);
    const logs = [];
    page.on("console", (m) => { const t = m.text(); if (/\[authored\]|\[clips\]/.test(t)) logs.push(t); });
    page.on("pageerror", (e) => logs.push(`PAGEERROR: ${e}`));
    await page.goto(`http://127.0.0.1:${PORT}/?quality=low${query ?? ""}`, { waitUntil: "domcontentloaded" });
    await page.getByText("Training", { exact: false }).first().click();
    await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
    await page.getByText("DRAW STEEL", { exact: false }).first().click();
    const skip = page.getByText("TAKE ME TO THE WAR", { exact: false }).first();
    for (let i = 0; i < 20; i++) {
      if (await skip.isVisible().catch(() => false)) { await skip.click().catch(() => {}); break; }
      await page.waitForTimeout(500);
    }
    let inFight = false;
    for (let i = 0; i < 70 && !inFight; i++) {
      inFight = await page.evaluate(() => {
        const t = document.body.innerText || "";
        return /\d+\s+ALIVE/.test(t) && !/TO ARMS/.test(t);
      });
      if (!inFight) await page.waitForTimeout(500);
    }
    await page.waitForTimeout(9000);
    const out = {
      inFight,
      upgraded: logs.filter((l) => /upgraded/.test(l)).length,
      driven: logs.filter((l) => /driving the body/.test(l)).length,
      errors: logs.filter((l) => /PAGEERROR/.test(l)).length,
    };
    await ctx.close();
    return out;
  }

  const off = await run(null, null);
  const mesh = await run({ mesh: true, motion: false }, null);
  const both = await run({ mesh: true, motion: true }, null);
  const bad = await run({ mesh: false, motion: true }, null);
  const url = await run(null, "&authored=1");

  const row = (l, r) => console.log(`    ${l.padEnd(32)} in fight ${String(r.inFight).padEnd(5)}  upgraded ${String(r.upgraded).padStart(2)}  clip-driven ${String(r.driven).padStart(2)}`);
  row("nothing set, no flag", off);
  row("setting: mesh", mesh);
  row("setting: mesh + motion", both);
  row("setting: motion, no mesh", bad);
  row("no setting, ?authored=1", url);
  console.log("");

  // Every arm has to have reached a fight, or none of the counts mean anything.
  const reached = [off, mesh, both, bad, url].every((r) => r.inFight);
  if (!reached) {
    console.log("  VOID — an arm never reached a running fight, so nothing here is a measurement.");
    await browser.close(); server.kill(); process.exit(2);
  }

  check("nobody downloads 43 MB for opening the game — the default is the procedural man",
    off.upgraded === 0 && off.driven === 0, `${off.upgraded} upgraded, ${off.driven} driven`);
  check("a player who turns FORGED MEN on gets them, with no URL flag at all",
    mesh.upgraded > 0, `${mesh.upgraded} men upgraded from the stored preference alone`);
  check("...and the motion stays off until he asks for it separately",
    mesh.driven === 0, `${mesh.driven} clip-driven with motion off`);
  check("both on drives the bodies with the authored clips",
    both.upgraded > 0 && both.driven > 0, `${both.upgraded} upgraded, ${both.driven} clip-driven`);
  check("motion without mesh is nothing, not a switch reading ON over a body that is not there",
    bad.upgraded === 0 && bad.driven === 0, `${bad.upgraded} upgraded, ${bad.driven} driven`);
  check("the URL door still wins, because every capture harness in this tree drives it",
    url.upgraded > 0, `${url.upgraded} upgraded from ?authored=1 with nothing stored`);

  await browser.close();
  console.log(`\n[forgedtest] ${pass} passed, ${fail} failed`);
  server.kill();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); server?.kill(); process.exit(1); });
