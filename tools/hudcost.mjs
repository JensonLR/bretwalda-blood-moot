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
import { launchOptions, watchBoot, useGpu } from "./lib/browser.mjs";
import { chooseServer } from "./lib/freshbuild.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_DIE = resolve(ROOT, "tools/seeddie.mjs");
const PORT = parseInt(process.env.PORT || String(3990 + (process.pid % 40)), 10);
const argv = process.argv.slice(2);
const flag = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split("=")[1] : d; };
const SECS = Number(flag("secs", 8));
const USE_DEV = argv.includes("--dev");

/**
 * The browser's own scripting accounting, per second of wall clock — and an
 * honest refusal when it cannot be had.
 *
 * `long-animation-frame` reports a per-frame `scripts[]` breakdown, which is the
 * only way to say what React's commits actually COST rather than how many there
 * are. On the software rasteriser these suites default to, `scripts[]` comes
 * back EMPTY while `duration` runs to one and three seconds: those frames are
 * raster stalls, not script, and summing an empty array to 0.0 ms/s beside a
 * 2923 ms frame is a number that would be read as "React is free" when it is
 * really "this box did not measure React".
 *
 * So a zero sum with long frames present is reported as NOT ATTRIBUTED. Re-run
 * with BRETWALDA_GPU=1 for a machine where the frames are short enough for the
 * attribution to mean something.
 */
const loafLine = (r) => {
  if (!r.loafOk) return "scripting       (long-animation-frame unavailable in this browser — NOT MEASURED)";
  if (r.loaf.frames > 0 && r.loaf.script === 0) {
    return `scripting       NOT ATTRIBUTED — ${r.loaf.frames} long frames (longest ${r.loaf.longest.toFixed(0)} ms) `
      + "carried no scripts[] entries; on a software rasteriser these are raster stalls, not React";
  }
  return `scripting       ${(r.loaf.script / r.secs).toFixed(1)} ms/s over ${r.loaf.frames} long frames, `
    + `longest frame ${r.loaf.longest.toFixed(1)} ms`;
};

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
  // WHAT THE COMMITS COST, not just how many there are.
  //
  // A count is not a budget. `long-animation-frame` is the browser's own
  // accounting of scripting time per frame — the number a profiler would show —
  // and a commit that reconciles 135 elements either shows up in it or does
  // not. Without this the honest answer to "should the HUD be memoized" is a
  // guess, and this repository's rule is to measure the thing before optimising
  // it. Chromium-only; absent elsewhere, and reported as absent rather than
  // silently zero.
  w.__bwLoaf = { frames: 0, script: 0, longest: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        w.__bwLoaf.frames++;
        // `blockingDuration` is the part past 50 ms; `duration` is the whole
        // frame. Scripting is what the HUD contributes to, so sum the scripts.
        let s2 = 0;
        for (const sc of e.scripts ?? []) s2 += sc.duration;
        w.__bwLoaf.script += s2;
        if (e.duration > w.__bwLoaf.longest) w.__bwLoaf.longest = e.duration;
      }
    }).observe({ type: "long-animation-frame", buffered: false });
    w.__bwLoafOk = true;
  } catch { w.__bwLoafOk = false; }
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    inject() { return 1; },
    onCommitFiberRoot() { w.__bwCommits++; w.__bwLastCommit = performance.now(); },
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
    if (w.__bwLoaf) { w.__bwLoaf.frames = 0; w.__bwLoaf.script = 0; w.__bwLoaf.longest = 0; }
  });
  const t0 = Date.now();
  if (during) await during();
  const left = secs * 1000 - (Date.now() - t0);
  if (left > 0) await page.waitForTimeout(left);
  const r = await page.evaluate(() => {
    const w = window;
    w.__bwObs?.disconnect();
    return { commits: w.__bwCommits - w.__bwCommitsAt, writes: w.__bwWrites,
      loafOk: !!w.__bwLoafOk, loaf: { ...(w.__bwLoaf ?? { frames: 0, script: 0, longest: 0 }) } };
  });
  const el = (Date.now() - t0) / 1000;
  return { ...r, secs: el, cps: r.commits / el, wps: r.writes / el };
}

let server;
async function main() {
  const choice = chooseServer(ROOT, "hudcost", { forceDev: USE_DEV });
// Which bundle this run actually measured, and it rides the verdict.
const useProd = choice.prod;
  console.log(`HUDCOST — what the interface costs during a fight\n`);
  console.log(`  starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
  server = spawn("node", ["--import", SEED_DIE, choice.script], {
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
  console.log(`    ${loafLine(idle)}`);
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
  console.log(`    ${loafLine(still)}`);
  console.log(`\n  PHONE, thumb dragging the stick   (${drag.secs.toFixed(1)}s)`);
  console.log(`    react commits   ${String(drag.commits).padStart(5)}   ${drag.cps.toFixed(1)}/s`);
  console.log(`    DOM writes      ${String(drag.writes).padStart(5)}   ${drag.wps.toFixed(1)}/s`);
  console.log(`    ${loafLine(drag)}`);
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

  // ---- AND THE QUESTION THIS INSTRUMENT WAS BUILT TO SETTLE ----------------
  //
  // "Should the HUD be memoized?" It commits at the wire's own 20 Hz because
  // page.tsx owns `roomState` and hands a fresh object down every tick, and
  // React.memo cannot help with that — a memo bails out on referential
  // equality, and the identity changes by construction. Lowering it means an
  // external store with per-slice subscriptions: a real refactor of a
  // 1,900-line component.
  //
  // Worth it only if those commits cost something. On the GPU arm they cost
  // NOTHING MEASURABLE: zero long animation frames across all three phases,
  // where a long animation frame is one over 50 ms. 19.7 commits/s and 74 DOM
  // writes/s while a thumb drags, and not one frame delayed past the threshold.
  //
  // So the refactor is not done, and this is the claim that would tell somebody
  // when it becomes worth doing. It only asserts on a run that could actually
  // see the answer — the software arm's frames are raster stalls of one to
  // three seconds with no scripts[] attribution at all, and gating on those
  // would be gating on the rasteriser.
  const seen = [idle, still, drag];
  const measurable = useGpu && seen.every((r) => r.loafOk)
    && seen.every((r) => !(r.loaf.frames > 0 && r.loaf.script === 0));
  if (!measurable) {
    console.log("\n  SKIP  the interface never delays a frame — NOT RUN. "
      + (useGpu
        ? "This rasteriser's long frames carry no scripts[] attribution."
        : "The software arm cannot answer this: its long frames are raster stalls, and a "
          + "loaded box produced a 15,290 ms frame that has nothing to do with React.")
      + " Re-run with BRETWALDA_GPU=1.");
  } else {
    const worst = Math.max(...seen.map((r) => r.loaf.longest));
    const frames = seen.reduce((n, r) => n + r.loaf.frames, 0);
    const secs = seen.reduce((n, r) => n + r.secs, 0);
    const scriptPerSec = seen.reduce((n, r) => n + r.loaf.script, 0) / secs;
    // GRADED ON SCRIPTING, NOT ON A FRAME COUNT.
    //
    // This claim asks one question: is React's 20 Hz costing the player frames,
    // and is a memoisation refactor therefore worth doing? It used to answer it
    // with `frames === 0` — zero tolerance for any frame over 50 ms across 24 s
    // of browser time — and that is not a property a browser has. A garbage
    // collection, a texture upload or a shader compile produces a long frame
    // that no amount of memoisation would remove, and on the software arm a
    // loaded box produced one of 15,290 ms and reported "the memoisation case is
    // now open" about the machine being busy.
    //
    // Measured on the GPU arm: desktop idle 0 long frames, phone DRAGGING — the
    // case this file exists for — 0, and one 74 ms frame on an idle phone
    // carrying 7.4 ms/s of scripting. That is 0.7% of wall time, and the commit
    // rate it would be blamed on did not move (19.4/s still, +0.2/s dragging).
    //
    // So the bar is the quantity a refactor could actually change: scripting
    // time attributed INSIDE long frames. 25 ms/s is 2.5% of wall clock — far
    // above the 7.4 a stray frame contributes, far below anything a player would
    // feel. The frame count stays in the message as context, because a rising
    // count with flat scripting is worth a look even when it is not this file's
    // to fail on.
    check("the interface's own scripting never delays frames enough to be worth refactoring for",
      scriptPerSec <= 25,
      `${scriptPerSec.toFixed(1)} ms/s of scripting inside long frames over ${secs.toFixed(0)} s `
      + `(${frames} long frame(s), longest ${worst.toFixed(0)} ms) — bar is 25 ms/s`);
  }

  console.log(`\n[hudcost] ${pass} passed, ${fail} failed`);
  server.kill();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); server?.kill(); process.exit(1); });
