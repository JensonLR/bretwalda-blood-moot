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
// input.ts) with two switches in the graphics panel.
//
// DEFAULT ON since 10 Sep 2026, on the owner's instruction, and this file's
// first claim INVERTED with it. It used to read "nobody downloads 43 MB because
// they opened the game" — and that claim was wrong twice over. It was wrong
// about the payload, because 43 MB is `public/authored` on disk and nothing
// ever loads the library: a fight fetches one body per class present plus the
// hair actually worn. And it went on passing after the default changed, because
// the run was measuring a `.next` bundle built four hours before the edit. Both
// halves are fixed here — the claim now asserts the real default, and
// `chooseServer` refuses a stale bundle rather than reporting on one.
//
// The five things that have to stay true:
//
//   1. DEFAULT ON. A player who has chosen nothing gets the authored men and
//      the authored motion. This is the claim that would catch the default
//      silently reverting.
//   2. OFF IS REACHABLE AND STICKS. A player who turned them off gets the
//      procedural man — the switch has to work in the direction that is now the
//      minority one, which is exactly the direction nothing was testing.
//   3. THE SETTING REACHES THE ARENA, in both directions, with no URL flag.
//   4. MOTION IMPLIES MESH. The clips live inside the authored GLB, so motion
//      without mesh must be nothing rather than a switch reading ON over a body
//      that is not there.
//   5. THE URL DOOR STILL WINS, and now it opens both ways: `?authored=0` is
//      the only way a capture can photograph the procedural man.
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
import { chooseServer } from "./lib/freshbuild.mjs";

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
  const choice = chooseServer(ROOT, "forgedtest", { forceDev: USE_DEV });
  // Which bundle this run actually measured, and it rides the verdict.
  const useProd = choice.prod;
  console.log("FORGEDTEST — the authored men, as a player can actually reach them\n");
  server = spawn("node", ["--import", SEED_DIE, choice.script], {
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

  const fresh = await run(null, null);
  const off = await run({ mesh: false, motion: false }, null);
  const mesh = await run({ mesh: true, motion: false }, null);
  const both = await run({ mesh: true, motion: true }, null);
  const bad = await run({ mesh: false, motion: true }, null);
  const url = await run(null, "&authored=0");

  const row = (l, r) => console.log(`    ${l.padEnd(32)} in fight ${String(r.inFight).padEnd(5)}  upgraded ${String(r.upgraded).padStart(2)}  clip-driven ${String(r.driven).padStart(2)}`);
  row("nothing set, no flag", fresh);
  row("setting: off (he chose)", off);
  row("setting: mesh", mesh);
  row("setting: mesh + motion", both);
  row("setting: motion, no mesh", bad);
  row("no setting, ?authored=0", url);
  console.log("");

  // Every arm has to have reached a fight, or none of the counts mean anything.
  const reached = [fresh, off, mesh, both, bad, url].every((r) => r.inFight);
  if (!reached) {
    console.log("  VOID — an arm never reached a running fight, so nothing here is a measurement.");
    await browser.close(); server.kill(); process.exit(2);
  }

  check("a player who has chosen nothing gets the authored men — the default is ON",
    fresh.upgraded > 0, `${fresh.upgraded} upgraded with nothing stored and no flag`);
  check("...and the authored motion with them",
    fresh.driven > 0, `${fresh.driven} clip-driven with nothing stored`);
  check("a player who turned them OFF gets the procedural man back",
    off.upgraded === 0 && off.driven === 0, `${off.upgraded} upgraded, ${off.driven} driven`);
  check("a player who turns FORGED MEN on gets them, with no URL flag at all",
    mesh.upgraded > 0, `${mesh.upgraded} men upgraded from the stored preference alone`);
  check("...and the motion stays off until he asks for it separately",
    mesh.driven === 0, `${mesh.driven} clip-driven with motion off`);
  check("both on drives the bodies with the authored clips",
    both.upgraded > 0 && both.driven > 0, `${both.upgraded} upgraded, ${both.driven} clip-driven`);
  check("motion without mesh is nothing, not a switch reading ON over a body that is not there",
    bad.upgraded === 0 && bad.driven === 0, `${bad.upgraded} upgraded, ${bad.driven} driven`);
  check("the URL door still wins, and now it opens both ways",
    url.upgraded === 0 && url.driven === 0,
    `?authored=0 over a default-on client: ${url.upgraded} upgraded, ${url.driven} driven`);

  await browser.close();
  console.log(`\n[forgedtest] ${pass} passed, ${fail} failed`);
  server.kill();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); server?.kill(); process.exit(1); });
