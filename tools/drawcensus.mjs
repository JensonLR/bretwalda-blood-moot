#!/usr/bin/env node
// DRAWCENSUS — where the draw calls actually go.
//
//   npm run drawcensus
//   BRETWALDA_GPU=1 npm run drawcensus        the honest arm
//   node tools/drawcensus.mjs --secs=6 --dev
//
// WHY THIS EXISTS. `docs/HANDOVER.md` has carried the same sentence for weeks:
//
//   "The render cost. 962 draw calls is the biggest unexamined number in the
//    build ... NOT PROVEN — it wants a real device, and this box has no GPU."
//
// `fpstest` reads `renderer.info` and reports the TOTAL. Nothing attributed it,
// so "962" was a number to worry about rather than a number to act on — you
// cannot spend a total.
//
// HOW IT ATTRIBUTES, and why not by counting meshes. A visible mesh is not a
// draw call: it is drawn once per shadow cascade it casts into, again for any
// depth prepass, and not at all if the frustum culls it — so a census of the
// scene graph is an estimate dressed as a measurement. This ABLATES instead.
// Hide one subtree, let the renderer settle, read `renderer.info` again: the
// delta is that subtree's true cost, culling, cascades and passes included. It
// is the method `fpstest` already uses for TIME, asked of draws.
//
// TWO THINGS THE COUNTER NEEDS OR IT LIES.
//
//   `info.autoReset = false`. three.js zeroes `info` at the top of every
//   `render()`, and this game renders several passes per frame — so reading it
//   afterwards returns the LAST pass and not the frame. Measured before that
//   was understood: `calls: 1`. Accumulate over a known number of frames and
//   divide instead.
//
//   A frame counter of its own, off rAF. `render()` runs more than once per
//   animation frame, so dividing by render calls would divide by the wrong
//   number.
//
// ABLATION MEASURES MARGINAL COST, AND MARGINAL COSTS DO NOT SUM TO A TOTAL.
// The first cut of this gated on the parts adding up to the baseline and failed
// by 32% — correctly, because the claim was wrong. Hiding a subtree removes its
// own draws AND its share of the shadow cascades and the state changes around
// it, while the post chain's full-screen passes stay whatever you hide. So each
// row answers "what does removing this save", every row is true, and the column
// does not add up on purpose.
//
// That is not a quirk of this file. `docs/PERFORMANCE.md`'s TIME ablation has
// the same shape and always did: post chain 10.40 ms + shadows 9.40 + props
// 8.50 against an 18.70 ms baseline. Read a row as a lever, not as a slice.
//
// IT GATES WHAT ABLATION CAN HONESTLY CLAIM. A draw budget belongs to the
// device and to `docs/VISUAL-BAR.md`; what this refuses is a row larger than
// the whole frame, or a census that cannot find the men.
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { launchOptions, watchBoot, useGpu } from "./lib/browser.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_DIE = resolve(ROOT, "tools/seeddie.mjs");
const PORT = parseInt(process.env.PORT || String(4280 + (process.pid % 40)), 10);
const argv = process.argv.slice(2);
const flag = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split("=")[1] : d; };
const SECS = Number(flag("secs", 4));
const TIER = flag("tier", "high");
const USE_DEV = argv.includes("--dev");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

/**
 * The categories, as plain data.
 *
 * A key rather than a predicate string: the page does the matching with real
 * code, so nothing here is evaluated as source at the far end.
 */
const CATEGORIES = [
  ["warriors", "the warriors"],
  ["world", "the world"],
  ["severed", "severed pieces"],
  ["vfx", "vfx"],
  ["sky", "the sky"],
  ["blob", "blob shadows"],
  ["rest", "everything else"],
];

/** Installed before the bundle: count presented frames off rAF. */
const PROBE = () => {
  const w = window;
  w.__dc = { frames: 0 };
  const raf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) => raf((t) => { w.__dc.frames++; return cb(t); });
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
  console.log(`DRAWCENSUS — where the draw calls go   (tier ${TIER}, ${useGpu ? "GPU" : "SOFTWARE"})\n`);
  if (!useGpu) {
    console.log("  NOTE: the software rasteriser issues the same calls the GPU does, so the");
    console.log("  COUNT is comparable and the cost of each is not. Nothing here claims a");
    console.log("  millisecond — see fpstest for time.\n");
  }
  server = spawn("node", ["--import", SEED_DIE, useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
  });
  watchBoot(server, "drawcensus");
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);

  const browser = await chromium.launch({ ...launchOptions() });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  page.on("pageerror", (e) => console.log(`  [page-error] ${e}`));

  await page.goto(`http://127.0.0.1:${PORT}/?quality=${TIER}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Training", { exact: false }).first().click();
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
  await page.getByText("DRAW STEEL", { exact: false }).first().click();
  const skip = page.getByText("TAKE ME TO THE WAR", { exact: false }).first();
  for (let i = 0; i < 20; i++) {
    if (await skip.isVisible().catch(() => false)) { await skip.click().catch(() => {}); break; }
    await page.waitForTimeout(500);
  }
  let inFight = false;
  for (let i = 0; i < 90 && !inFight; i++) {
    inFight = await page.evaluate(() => {
      const t = document.body.innerText || "";
      return /\d+\s+ALIVE/.test(t) && /\d+:\d\d/.test(t) && !/TO ARMS/.test(t);
    });
    if (!inFight) await page.waitForTimeout(500);
  }
  console.log(`  in a fight: ${inFight}`);
  if (!inFight) {
    console.log("\n  VOID — never reached a running fight; there is nothing drawing to census.");
    await browser.close(); server.kill(); process.exit(2);
  }
  await page.waitForTimeout(2500);

  /** Accumulate `info` over `secs`, divided by the frames the page presented. */
  const sample = async (secs) => {
    await page.evaluate(() => {
      const w = window, r = w.__bretwaldaRenderer;
      r.info.autoReset = false;      // zeroed per render(), and this game
      r.info.reset();                // renders several passes a frame
      w.__dc.frames = 0;
    });
    await page.waitForTimeout(secs * 1000);
    return page.evaluate(() => {
      const w = window, r = w.__bretwaldaRenderer;
      const f = Math.max(1, w.__dc.frames);
      return { calls: r.info.render.calls / f, tris: r.info.render.triangles / f, frames: w.__dc.frames };
    });
  };

  /** Hide the groups in one category, sample, put them back. */
  const ablate = async (key) => {
    const hid = await page.evaluate((k) => {
      const s = window.__bretwaldaScene;
      const named = (n) => n.startsWith("warrior:") || n === "world" || n === "vfx"
        || n === "sky" || n === "blobShadow" || n.startsWith("rig:severed");
      const belongs = (n) => {
        switch (k) {
          case "warriors": return n.startsWith("warrior:");
          case "world": return n === "world";
          case "severed": return n.startsWith("rig:severed");
          case "vfx": return n === "vfx";
          case "sky": return n === "sky";
          case "blob": return n === "blobShadow";
          case "rest": return !named(n);
          default: return false;
        }
      };
      window.__dcHidden = [];
      for (const c of s.children) {
        if (c.visible && belongs(c.name || "")) { c.visible = false; window.__dcHidden.push(c); }
      }
      return window.__dcHidden.length;
    }, key);
    if (!hid) return { hid: 0, calls: 0, tris: 0 };
    const s = await sample(SECS);
    await page.evaluate(() => { for (const c of window.__dcHidden) c.visible = true; window.__dcHidden = []; });
    await page.waitForTimeout(400);
    return { hid, ...s };
  };

  const base = await sample(SECS);
  const meshes = await page.evaluate(() => {
    const s = window.__bretwaldaScene;
    let n = 0; s.traverse((o) => { if (o.isMesh && o.visible) n++; });
    const men = s.children.filter((c) => (c.name || "").startsWith("warrior:")).length;
    return { n, men, top: s.children.length };
  });
  console.log(`\n  BASELINE   ${base.calls.toFixed(0)} draws/frame, ${(base.tris / 1000).toFixed(0)}k tris/frame`);
  console.log(`             ${meshes.n} visible meshes, ${meshes.men} warriors, ${meshes.top} top-level groups, `
    + `${base.frames} frames sampled\n`);

  const parts = [];
  for (const [key, label] of CATEGORIES) {
    const r = await ablate(key);
    const saved = r.hid ? base.calls - r.calls : 0;
    parts.push({ key, label, ...r, saved });
    if (!r.hid) { console.log(`    ${label.padEnd(18)} (nothing in the scene)`); continue; }
    console.log(`    ${label.padEnd(18)} ${saved.toFixed(0).padStart(4)} draws  ${(saved / base.calls * 100).toFixed(0).padStart(3)}%`
      + `   ${((base.tris - r.tris) / 1000).toFixed(0).padStart(5)}k tris   (${r.hid} group${r.hid === 1 ? "" : "s"})`);
  }

  const warriors = parts.find((p) => p.key === "warriors")?.saved ?? 0;
  const world = parts.find((p) => p.key === "world")?.saved ?? 0;
  const perMan = meshes.men ? warriors / meshes.men : 0;
  console.log(`\n    a warrior costs ${perMan.toFixed(0)} draws; eight would be ${(perMan * 8).toFixed(0)}`);

  await browser.close();
  console.log("");

  const sum = parts.reduce((a, p) => a + p.saved, 0);
  const overlap = (sum - base.calls) / Math.max(1, base.calls);
  console.log(`    the rows sum to ${sum.toFixed(0)} against a ${base.calls.toFixed(0)} baseline `
    + `(${(overlap * 100).toFixed(0)}% overlap) — ablation is MARGINAL cost, so they are levers, not slices\n`);

  // No row may be larger than the frame it was measured in: that would mean the
  // ablation removed something outside its own category, and the attribution
  // would be describing the wrong subtree.
  const tooBig = parts.filter((p) => p.hid && p.saved > base.calls * 1.02);
  check("no single lever is larger than the whole frame",
    tooBig.length === 0,
    tooBig.length ? tooBig.map((p) => `${p.label} ${p.saved.toFixed(0)}`).join(", ")
      : `largest is ${parts.reduce((a, p) => Math.max(a, p.saved), 0).toFixed(0)} of ${base.calls.toFixed(0)}`);
  check("and the men are the lever, not the arena",
    perMan > 0 && warriors > world,
    `${warriors.toFixed(0)} draws for ${meshes.men} men against ${world.toFixed(0)} for the whole world`);

  console.log(`\n[drawcensus] ${pass} passed, ${fail} failed`);
  server.kill();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); server?.kill(); process.exit(1); });
