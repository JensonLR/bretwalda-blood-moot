#!/usr/bin/env node
// ============================================================
// HUDSHOT — the combat HUD, photographed and measured, on a phone in
// both handednesses and on a desktop.
//
//   node tools/hudshot.mjs                 # both viewports
//   node tools/hudshot.mjs --tag before    # names the frames
//
// WHY THIS EXISTS. The owner, verbatim, 13 Aug 2026:
//
//   "Better placement on screen for the quality, i like that feature but its a
//    bit in the way where it currently is on screen."
//
// The QUALITY pad's position was argued in a comment above it from
// `touchtest`'s dead-zone sweep — "212 is the first clear shelf above them" —
// and that sweep can only ever answer "does this swallow a drag". It cannot
// answer "is this in the way", because being in the way is about what the pad
// is sitting ON, and what it is sitting on is the arena. Nobody looked. This is
// the instrument that looks: it takes the frame, and beside it the numbers a
// frame cannot carry — every HUD element's rectangle, its gap from the foot of
// the screen, and whether it is inside the 132 px thumb band that
// `docs/DESIGN-SYSTEM.md` §3 reserves for combat controls.
//
// It ASSERTS NOTHING. `tools/touchtest.mjs` is the gate; this is for eyes, and
// the whole lesson of the defect above is that a gate is not a pair of them.
//
// Frames land in art/ui/hud/.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "art/ui/hud");
const SEED_DIE = pathToFileURL(resolve(ROOT, "tools/seeddie.mjs")).href;
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const TAG = flag("tag", "now");
const PORT = parseInt(process.env.PORT || String(3870 + (process.pid % 40)), 10);

/** `docs/DESIGN-SYSTEM.md` §3: the band a thumb reaches without regripping. */
const THUMB_BAND = 132;

const VIEWS = [
  { tag: "phone-right", width: 390, height: 844, touch: true, hand: "right" },
  { tag: "phone-left", width: 390, height: 844, touch: true, hand: "left" },
  // 1280x800 because that is what the owner asked to see it at, and it is a
  // small laptop rather than the 1440x900 uishots uses for menus — the combat
  // HUD's corners are further apart on a big screen, so the small one is the
  // honest desktop case.
  { tag: "desktop", width: 1280, height: 800, touch: false, hand: null },
];

let server;
function waitForServer(url, timeoutMs = 180000) {
  const started = Date.now();
  return new Promise((ok, fail) => {
    const poll = async () => {
      try { const r = await fetch(url); if (r.ok || r.status === 404) return ok(); } catch { /* wait */ }
      if (Date.now() - started > timeoutMs) return fail(new Error(`server never came up at ${url}`));
      setTimeout(poll, 700);
    };
    poll();
  });
}

/**
 * Every rectangle on the glass that a player either presses or reads, measured
 * in the viewport's own pixels. Buttons come off `aria-label`, readouts off the
 * leaf text nodes the HUD paints with `pointer-events: none` — the same two
 * populations `touchtest`'s collision scan walks, so the two tools cannot
 * disagree about what is on the screen.
 */
async function measure(page, band) {
  return page.evaluate((BAND) => {
    const H = window.innerHeight;
    const W = window.innerWidth;
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const rows = [];
    for (const el of document.querySelectorAll("button")) {
      const r = el.getBoundingClientRect();
      if (r.width < 1) continue;
      rows.push({
        kind: "press",
        name: el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20),
        ...box(el),
      });
    }
    for (const el of document.querySelectorAll("div,span")) {
      if (el.querySelector("div,span") || el.closest("button")) continue;
      const t = el.textContent.trim();
      if (!t) continue;
      if (getComputedStyle(el).pointerEvents !== "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      rows.push({ kind: "read", name: t.slice(0, 30), ...box(el) });
    }
    return rows.map((r) => ({
      ...r,
      /** Gap from the foot of the screen to the BOTTOM of the element. */
      up: Math.round(H - (r.y + r.h)),
      /** Inside the thumb band means any part of it is within BAND of the foot. */
      inBand: H - (r.y + r.h) < BAND,
      /** Which third of the width it sits in, so the mirror is readable. */
      side: r.x + r.w / 2 < W / 3 ? "left" : r.x + r.w / 2 > (W * 2) / 3 ? "right" : "middle",
    })).sort((a, b) => a.up - b.up);
  }, band);
}

async function shootOne(browser, view) {
  const ctx = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    hasTouch: view.touch,
    isMobile: view.touch,
    deviceScaleFactor: view.touch ? 3 : 1,
  });
  if (view.hand) {
    await ctx.addInitScript((h) => {
      try { localStorage.setItem("bretwalda.hand", h); } catch { /* private mode */ }
    }, view.hand);
  }
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  page.on("pageerror", (e) => console.log(`  [page-error] ${e}`));
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });

  // The same road into a fight touchtest takes. An empty ring so nothing kills
  // the warrior while the shutter is open — a corpse takes the whole cluster
  // out of the tree with it and the frame becomes a photograph of nothing.
  await page.getByText("Training", { exact: false }).first().click();
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
  const fewer = page.getByLabel("Fewer AI warriors");
  for (let i = 0; i < 8 && await fewer.isEnabled().catch(() => false); i++) await fewer.click();
  await page.getByText("DRAW STEEL", { exact: false }).first().click();
  // Long enough for the countdown to run out and the arena to be lit. The
  // desktop viewport has no SLASH button to wait on, so the wait is a timer and
  // the VERDICT on whether this is a fight is taken afterwards and printed —
  // `docs/PROCESS.md`'s third discipline: two harnesses in this repo were caught
  // grading the landing screen while announcing they were in a match, so a tool
  // that photographs a fight has to say out loud that it found one.
  await page.waitForTimeout(11000);
  const fighting = await page.evaluate(() => {
    const txt = document.body.innerText || "";
    return {
      // The combat HUD's own two readouts. Neither exists anywhere else.
      alive: /\d+\s+ALIVE/.test(txt),
      timer: /\d+:\d\d/.test(txt),
      canvas: !!document.querySelector("canvas"),
      // The countdown numeral, which means the fight has NOT started.
      counting: /TO ARMS/.test(txt),
    };
  });

  mkdirSync(OUT, { recursive: true });
  const path = resolve(OUT, `${TAG}-${view.tag}.png`);
  await page.screenshot({ path });
  const inFight = fighting.alive && fighting.timer && fighting.canvas && !fighting.counting;
  if (!inFight) {
    console.log(`\n  !! ${view.tag}: this frame is NOT a running fight `
      + `(alive readout ${fighting.alive}, timer ${fighting.timer}, canvas ${fighting.canvas}, `
      + `countdown still up ${fighting.counting}) — do not read it as one`);
  }

  const rows = await measure(page, THUMB_BAND);
  console.log(`\n  ${view.tag}  ${view.width}x${view.height}${view.hand ? `  ${view.hand}-handed` : ""}`
    + `  —  ${inFight ? "IN A RUNNING FIGHT" : "*** NOT IN A FIGHT ***"}`);
  console.log(`  SHOT  ${path}`);
  console.log("    up   band  side    kind   name                            rect");
  for (const r of rows) {
    console.log(`    ${String(r.up).padStart(4)}  ${r.inBand ? "IN  " : "    "}  ${r.side.padEnd(6)}  ${r.kind.padEnd(5)}  ${r.name.padEnd(30)}  ${r.x},${r.y} ${r.w}x${r.h}`);
  }
  await ctx.close();
}

async function main() {
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  console.log(`[hudshot] starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
  server = spawn("node", ["--import", SEED_DIE, useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);

  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  const only = flag("only", null);
  for (const v of VIEWS) {
    if (only && v.tag !== only) continue;
    try { await shootOne(browser, v); } catch (e) { console.log(`  ${v.tag} FAILED: ${e.message}`); }
  }
  await browser.close();
  server.kill();
  console.log(`\n[hudshot] "up" is the gap from the foot of the screen to the bottom of the element;`
    + ` "IN" marks anything inside the ${THUMB_BAND}px thumb band DESIGN-SYSTEM §3 reserves for combat controls.`);
}

main().catch((e) => { console.error(e); server?.kill(); process.exit(1); });
