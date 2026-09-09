#!/usr/bin/env node
// HUDCOST — how often does React rebuild the interface during a fight?
//
//   npm run hudcost
//   node tools/hudcost.mjs --secs=12      longer sample
//   node tools/hudcost.mjs --dev          against dev-server
//
// WHY THIS EXISTS. Nothing in this repository measured React. `docs/PERFORMANCE.md`
// has no entry for it; `framecost` mentions it once, in prose. Every number the
// project holds about the cost of a frame is about WebGL, and the DOM HUD is
// updated during the most performance-sensitive seconds the product has.
//
// That blind spot hid a real defect. The movement stick's knob went through
// React state on every `touchmove`, and that state is a prop of `GameHud`, so a
// thumb sliding across the glass reconciled a ~135-element tree and re-ran 40
// hooks at the display's refresh rate — on a phone, mid-fight, on top of the
// 20 Hz the wire already re-renders all of it at. It was found by reading, not
// by measuring, because there was no instrument to find it with. This is that
// instrument, and the drag phase below is the case it would have caught.
//
// WHAT IT MEASURES, and both halves matter.
//
//   COMMITS   React commits per second, counted by installing a
//             `__REACT_DEVTOOLS_GLOBAL_HOOK__` shim BEFORE the bundle loads and
//             tallying `onCommitFiberRoot`. This is the reconciliation work —
//             the thing a 20 Hz snapshot and a 120 Hz thumb both cause, and the
//             thing memoisation would remove.
//   WRITES    DOM mutations inside the HUD subtree, via MutationObserver. This
//             is the work that actually reaches the browser. The two are
//             deliberately separate: an imperative style write (the knob, the
//             lock reticle) is a WRITE and not a COMMIT, and moving work from
//             the first column to the second is exactly what the fix did.
//
// It gates as a RATCHET. There is no principled absolute for "commits per
// second" — the honest bar is the wire's own 20 Hz, and anything far above it
// is React doing work the simulation did not ask for. What this refuses is the
// number going up without somebody saying so.
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_DIE = resolve(ROOT, "tools/seeddie.mjs");
const PORT = parseInt(process.env.PORT || String(3990 + (process.pid % 40)), 10);
const argv = process.argv.slice(2);
const flag = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split("=")[1] : d; };
const SECS = Number(flag("secs", 8));
const USE_DEV = argv.includes("--dev");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

/**
 * The shim. React looks for this global at module scope and, if it finds one,
 * calls `onCommitFiberRoot` on every commit — in production builds too, which
 * is how the profiler works on a shipped bundle. Everything else is the minimum
 * React touches; getting any of it wrong makes the bundle throw on load rather
 * than silently miscount, which is the failure mode to prefer.
 */
const HOOK = () => {
  const w = window;
  w.__bwCommits = 0;
  w.__bwWrites = 0;
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    inject() { return 1; },
    onCommitFiberRoot() { w.__bwCommits++; },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
    isDisabled: false,
  };
};

const waitForServer = (url, timeoutMs = 60000) => new Promise((done, fail2) => {
  const started = Date.now();
  const tick = async () => {
    if (Date.now() - started > timeoutMs) return fail2(new Error(`server never came up at ${url}`));
    try { const r = await fetch(url); if (r.ok) return done(); } catch { /* not yet */ }
    setTimeout(tick, 250);
  };
  tick();
});

/**
 * Boot to a RUNNING fight, and refuse to pretend otherwise.
 *
 * The first version of this waited a flat 11 s and then printed what it found,
 * which on this box was `counting=true` — the countdown, not a fight. It then
 * measured the countdown screen and reported it as the interface's cost during
 * combat. `docs/PROCESS.md`'s third discipline, exactly: two harnesses here have
 * already been caught grading the landing screen while announcing they were in a
 * match. So this polls for the fight's own two readouts and the CALLER voids the
 * run if they never arrive.
 *
 * The bot count comes down first, the way hudshot does it — a smaller muster
 * forges faster, and a HUD with fewer nameplates is also a quieter one to
 * measure.
 */
async function reachFight(page, secs = 45) {
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });
  await page.getByText("Training", { exact: false }).first().click();
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
  const fewer = page.getByLabel("Fewer AI warriors");
  for (let i = 0; i < 8 && await fewer.isEnabled().catch(() => false); i++) await fewer.click();
  await page.getByText("DRAW STEEL", { exact: false }).first().click();
  const read = () => page.evaluate(() => {
    const txt = document.body.innerText || "";
    return { alive: /\d+\s+ALIVE/.test(txt), timer: /\d+:\d\d/.test(txt), counting: /TO ARMS/.test(txt) };
  });
  const until = Date.now() + secs * 1000;
  let st = await read();
  while (Date.now() < until && !(st.alive && st.timer && !st.counting)) {
    await page.waitForTimeout(500);
    st = await read();
  }
  return { ...st, inFight: st.alive && st.timer && !st.counting };
}

/** Watch the HUD subtree, then sample both counters over `secs`. */
async function sample(page, secs, during) {
  await page.evaluate(() => {
    const w = window;
    w.__bwWrites = 0;
    w.__bwObs?.disconnect();
    // The HUD is the direct sibling of the canvas; observing document.body
    // would count the canvas's own attribute churn as interface work.
    const root = document.querySelector("canvas")?.parentElement ?? document.body;
    w.__bwObs = new MutationObserver((rs) => { w.__bwWrites += rs.length; });
    w.__bwObs.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    w.__bwCommitsAt = w.__bwCommits;
  });
  const t0 = Date.now();
  if (during) await during();
  const left = secs * 1000 - (Date.now() - t0);
  if (left > 0) await page.waitForTimeout(left);
  const r = await page.evaluate(() => {
    const w = window;
    w.__bwObs?.disconnect();
    return { commits: w.__bwCommits - w.__bwCommitsAt, writes: w.__bwWrites };
  });
  const el = (Date.now() - t0) / 1000;
  return { ...r, secs: el, cps: r.commits / el, wps: r.writes / el };
}

let server;
async function main() {
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID")) && !USE_DEV;
  console.log(`HUDCOST — what the interface costs during a fight\n`);
  console.log(`  starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
  server = spawn("node", ["--import", SEED_DIE, useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
  });
  watchBoot(server, "hudcost");
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);

  const browser = await chromium.launch({ ...launchOptions() });

  // ---- 1. DESKTOP, a fight running, nobody touching anything --------------
  const desk = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await desk.addInitScript(HOOK);
  const dp = await desk.newPage();
  dp.setDefaultTimeout(90000);
  dp.on("pageerror", (e) => console.log(`  [page-error] ${e}`));
  const inFight = await reachFight(dp);
  const hooked = await dp.evaluate(() => typeof window.__bwCommits === "number" && window.__bwCommits > 0);
  console.log(`\n  desktop in a fight: alive=${inFight.alive} timer=${inFight.timer} counting=${inFight.counting}`);
  console.log(`  react hook installed and counting: ${hooked}`);
  if (!hooked) {
    console.log("\n  VOID — the devtools hook never fired, so nothing here is a measurement.");
    await browser.close(); server.kill(); process.exit(2);
  }
  if (!inFight.inFight) {
    console.log("\n  VOID — never reached a running fight, so there is nothing here to measure.");
    await browser.close(); server.kill(); process.exit(2);
  }
  const idle = await sample(dp, SECS);
  console.log(`\n  DESKTOP, hands off the controls   (${idle.secs.toFixed(1)}s)`);
  console.log(`    react commits   ${String(idle.commits).padStart(5)}   ${idle.cps.toFixed(1)}/s`);
  console.log(`    DOM writes      ${String(idle.writes).padStart(5)}   ${idle.wps.toFixed(1)}/s`);
  await desk.close();

  // ---- 2. PHONE, a thumb dragging the movement stick ----------------------
  //
  // The case the knob defect lived in. A drag on the movement side, held for
  // the whole sample, at the rate a real thumb moves. Before the fix this put
  // a setState on every touchmove; after it, the same drag is style writes on
  // one element and no commits at all.
  const phone = await browser.newContext({
    viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  });
  await phone.addInitScript(HOOK);
  const pp = await phone.newPage();
  pp.setDefaultTimeout(90000);
  pp.on("pageerror", (e) => console.log(`  [page-error] ${e}`));
  const inFight2 = await reachFight(pp);
  console.log(`\n  phone in a fight: alive=${inFight2.alive} timer=${inFight2.timer} counting=${inFight2.counting}`);
  if (!inFight2.inFight) {
    console.log("\n  VOID — the phone never reached a running fight.");
    await browser.close(); server.kill(); process.exit(2);
  }

  const still = await sample(pp, SECS);
  const drag = await sample(pp, SECS, async () => {
    // Movement side is the left half by default. Land, then sweep, ~40 Hz.
    const x0 = 180, y0 = 300;
    await pp.touchscreen.tap(x0, y0).catch(() => {});
    const t0 = Date.now();
    await pp.evaluate(({ x, y }) => {
      const el = document.querySelector("canvas");
      const t = (id, cx, cy) => new Touch({ identifier: id, target: el, clientX: cx, clientY: cy });
      el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [t(1, x, y)], changedTouches: [t(1, x, y)] }));
      window.__bwDrag = { el, t, x, y };
    }, { x: x0, y: y0 });
    while (Date.now() - t0 < SECS * 1000 - 200) {
      await pp.evaluate((ms) => {
        const d = window.__bwDrag; if (!d) return;
        const dx = Math.sin(ms / 120) * 40, dy = Math.cos(ms / 120) * 40;
        const tt = d.t(1, d.x + dx, d.y + dy);
        d.el.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, touches: [tt], changedTouches: [tt] }));
      }, Date.now() - t0);
      await pp.waitForTimeout(25);
    }
    await pp.evaluate(() => {
      const d = window.__bwDrag; if (!d) return;
      const tt = d.t(1, d.x, d.y);
      d.el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [tt] }));
    });
  });
  console.log(`\n  PHONE, hands off                  (${still.secs.toFixed(1)}s)`);
  console.log(`    react commits   ${String(still.commits).padStart(5)}   ${still.cps.toFixed(1)}/s`);
  console.log(`    DOM writes      ${String(still.writes).padStart(5)}   ${still.wps.toFixed(1)}/s`);
  console.log(`\n  PHONE, thumb dragging the stick   (${drag.secs.toFixed(1)}s)`);
  console.log(`    react commits   ${String(drag.commits).padStart(5)}   ${drag.cps.toFixed(1)}/s`);
  console.log(`    DOM writes      ${String(drag.writes).padStart(5)}   ${drag.wps.toFixed(1)}/s`);
  await phone.close();
  await browser.close();

  // ---- the claims ---------------------------------------------------------
  console.log("");
  // The wire ticks at 20 Hz and commits a fresh snapshot object every tick, so
  // ~20/s is the floor this interface currently has by construction. The
  // ceiling is generous because that floor is the thing memoisation would
  // remove and nobody has done that work yet; what this refuses is a NEW source
  // of commits appearing on top of it.
  check("the resting interface does not commit far above the wire's own 20 Hz",
    idle.cps <= 45, `${idle.cps.toFixed(1)} commits/s on desktop (wire is 20/s)`);
  check("...and the same is true on a phone",
    still.cps <= 45, `${still.cps.toFixed(1)} commits/s`);

  // THE ONE THIS EXISTS FOR. A dragging thumb must not add commits. Before the
  // knob was made imperative it added one per touchmove, at display refresh.
  const added = drag.cps - still.cps;
  check("a thumb dragging the movement stick adds no React work",
    added <= 8,
    `${drag.cps.toFixed(1)}/s dragging against ${still.cps.toFixed(1)}/s still — ${added >= 0 ? "+" : ""}${added.toFixed(1)}/s`);
  console.log(`  the drag's cost is DOM writes and not commits: ${drag.wps.toFixed(1)} writes/s against ${still.wps.toFixed(1)} still`);

  console.log(`\n[hudcost] ${pass} passed, ${fail} failed`);
  server.kill();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); server?.kill(); process.exit(1); });
