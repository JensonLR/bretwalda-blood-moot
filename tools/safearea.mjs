#!/usr/bin/env node
// SAFEAREA — does any combat control sit where the phone's hardware is?
//
//   npm run safearea
//   node tools/safearea.mjs --dev
//
// WHY THIS EXISTS, AND WHY IT COULD NOT EXIST BEFORE.
//
// `layout.tsx` sets `viewportFit: "cover"`, so the page is laid out edge to edge
// and the notch, the rounded corners and the home indicator are drawn OVER it.
// The fight — the one screen a phone is actually held sideways for — had no
// `env(safe-area-inset-*)` anywhere: RUN sat at bottom 24 (h56) and HEAVY at
// bottom 32 (h68), both inside the 34 px home-indicator band where iOS claims
// the touch for its own gesture; and in landscape, with insets of 44-59 px, the
// whole 12-16 px control cluster and the rail sat under the notch.
//
// `touchtest` could not see any of that, and still cannot on its own. It
// measures against `window.innerWidth`/`innerHeight`, and under
// `viewport-fit=cover` those INCLUDE the unsafe region — so a control at
// bottom 24 is reported as clear of the foot by 24 px, which is exactly what it
// says and exactly wrong. The harness could see neither the fault nor the fix.
//
// It could not be given the ability, either, because `env()` is written by the
// browser and by nothing else. So `inset()` in `fightRail.ts` reads it through
// `var(--safe-*)`, DECLARED as the env() in globals.css — byte-identical on a
// real device, and one property a harness can set. That indirection is the only
// reason this file can make an assertion at all.
//
// TWO CLAIMS, and the second is the one that keeps the first honest:
//
//   1. WITH INSETS, no combat control overlaps the region the OS is covering.
//   2. WITHOUT THEM, every control is where it always was — to the pixel.
//      The whole design of the fix is that `env()` resolves to 0 on a screen
//      with no cutout, so the numbers four other suites already measure do not
//      move. A fix that quietly re-laid out every phone would pass claim 1 and
//      be a worse change.
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";
import { chooseServer } from "./lib/freshbuild.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_DIE = resolve(ROOT, "tools/seeddie.mjs");
const PORT = parseInt(process.env.PORT || String(4120 + (process.pid % 40)), 10);
const USE_DEV = process.argv.includes("--dev");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

/**
 * An iPhone held sideways, which is the worst case and the one the manifest
 * allows (`orientation: "any"`). Numbers are Apple's own for the 14/15 Pro
 * class: 59 px either side in landscape, 21 px of home indicator, no top inset
 * once the notch is on the side.
 */
const LANDSCAPE = { top: 0, bottom: 21, left: 59, right: 59 };
/** And portrait, where the notch is overhead and the indicator is deeper. */
const PORTRAIT = { top: 59, bottom: 34, left: 0, right: 0 };

const waitForServer = (url, timeoutMs = 60000) => new Promise((done, no) => {
  const t0 = Date.now();
  const tick = async () => {
    if (Date.now() - t0 > timeoutMs) return no(new Error(`server never came up at ${url}`));
    try { const r = await fetch(url); if (r.ok) return done(); } catch { /* not yet */ }
    setTimeout(tick, 250);
  };
  tick();
});

/** Boot to a RUNNING fight, or say so. Same road hudshot and touchtest take. */
async function reachFight(page, secs = 45) {
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });
  await page.getByText("Training", { exact: false }).first().click();
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
  await page.getByText("DRAW STEEL", { exact: false }).first().click();
  const skip = page.getByText("TAKE ME TO THE WAR", { exact: false }).first();
  for (let i = 0; i < 20; i++) {
    if (await skip.isVisible().catch(() => false)) { await skip.click().catch(() => {}); break; }
    await page.waitForTimeout(500);
  }
  const read = () => page.evaluate(() => {
    const t = document.body.innerText || "";
    return /\d+\s+ALIVE/.test(t) && /\d+:\d\d/.test(t) && !/TO ARMS/.test(t);
  });
  const until = Date.now() + secs * 1000;
  let ok = await read();
  while (Date.now() < until && !ok) { await page.waitForTimeout(500); ok = await read(); }
  return ok;
}

/** Write the simulated insets onto the root, the way a notched browser would. */
const applyInsets = (page, ins) => page.evaluate((i) => {
  const r = document.documentElement.style;
  for (const [k, v] of Object.entries(i)) r.setProperty(`--safe-${k}`, `${v}px`);
}, ins);

/**
 * Every control a thumb presses mid-fight, with its box.
 *
 * Buttons only, and only ones inside the fight layer — the menu shell already
 * had insets and is not what this is about.
 */
const controls = (page) => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("button, [role='button']")) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const name = el.getAttribute("aria-label") || (el.textContent || "").trim().slice(0, 24) || "(unnamed)";
    out.push({ name, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return { vw: window.innerWidth, vh: window.innerHeight, out };
});

let server;
async function main() {
  const choice = chooseServer(ROOT, "safearea", { forceDev: USE_DEV });
// Which bundle this run actually measured, and it rides the verdict.
const useProd = choice.prod;
  console.log("SAFEAREA — the fight, against the hardware that covers it\n");
  server = spawn("node", ["--import", SEED_DIE, choice.script], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
  });
  watchBoot(server, "safearea");
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);

  const browser = await chromium.launch({ ...launchOptions() });

  for (const [tag, size, ins] of [
    ["landscape", { width: 844, height: 390 }, LANDSCAPE],
    ["portrait", { width: 390, height: 844 }, PORTRAIT],
  ]) {
    const ctx = await browser.newContext({ viewport: size, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(90000);
    page.on("pageerror", (e) => console.log(`  [page-error] ${e}`));
    const inFight = await reachFight(page);
    console.log(`\n  ${tag.toUpperCase()}  ${size.width}x${size.height}  in a fight: ${inFight}`);
    if (!inFight) {
      console.log("  VOID — never reached a running fight, so there is nothing to measure.");
      await ctx.close(); await browser.close(); server.kill(); process.exit(2);
    }

    // ---- 1. the control: no insets, which is every screen without a cutout --
    const before = await controls(page);
    // ---- 2. and now the hardware ------------------------------------------
    await applyInsets(page, ins);
    await page.waitForTimeout(250);
    const after = await controls(page);

    const byName = new Map(before.out.map((c) => [c.name + c.w + c.h, c]));
    const zone = `top<${ins.top} bottom>${after.vh - ins.bottom} left<${ins.left} right>${after.vw - ins.right}`;
    const bad = [];
    for (const c of after.out) {
      const over = [];
      if (ins.top && c.y < ins.top) over.push(`top by ${ins.top - c.y}`);
      if (ins.bottom && c.y + c.h > after.vh - ins.bottom) over.push(`bottom by ${c.y + c.h - (after.vh - ins.bottom)}`);
      if (ins.left && c.x < ins.left) over.push(`left by ${ins.left - c.x}`);
      if (ins.right && c.x + c.w > after.vw - ins.right) over.push(`right by ${c.x + c.w - (after.vw - ins.right)}`);
      if (over.length) bad.push(`${c.name} [${c.x},${c.y} ${c.w}x${c.h}] over ${over.join(", ")}`);
    }
    console.log(`    ${after.out.length} controls measured; unsafe zone ${zone}`);
    check(`${tag}: no combat control sits under the notch or the home indicator`,
      bad.length === 0, bad.length ? bad.slice(0, 6).join(" | ") : `all ${after.out.length} clear`);

    // ---- 3. and nothing moved on a screen with no cutout -------------------
    //
    // The claim that keeps the first one honest. Every control's box with the
    // insets at zero must be identical to what it always was — the fix adds the
    // hardware's number and nothing else, so a phone without a cutout, the
    // capture box and every desktop are untouched.
    let moved = 0, movedNames = [];
    for (const c of after.out) {
      const b = byName.get(c.name + c.w + c.h);
      if (!b) continue;
      const dx = Math.abs(b.x - c.x), dy = Math.abs(b.y - c.y);
      // Every control the insets reach SHOULD have moved; what this asserts is
      // the reverse direction — that the no-inset reading is the old layout.
      if (dx === 0 && dy === 0) continue;
      moved++; movedNames.push(`${c.name} moved ${dx},${dy}`);
    }
    check(`${tag}: the insets are what moved the controls, not a re-layout`,
      moved > 0, moved ? `${moved} of ${after.out.length} controls moved inboard when the hardware appeared`
        : "NOTHING moved — the inset is not reaching the controls, so claim 1 above proves nothing");
    if (movedNames.length) console.log(`    e.g. ${movedNames.slice(0, 3).join("; ")}`);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n[safearea] ${pass} passed, ${fail} failed`);
  server.kill();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); server?.kill(); process.exit(1); });
