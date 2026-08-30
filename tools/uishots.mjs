#!/usr/bin/env node
// ============================================================
// UISHOTS — capture the menu screens at phone and desktop widths.
//
//   node tools/uishots.mjs
//   node tools/uishots.mjs --dev          # ignore any production build
//   node tools/uishots.mjs --port 3410
//
// Separate from `shoot.mjs` on purpose: that tool photographs the
// 3D scene through /shot, this one drives the real menu flow so
// layout regressions (gutters, wrapping, tap targets) are visible.
// Writes to art/ui/ so it can never overwrite the render gallery.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { mkdirSync, existsSync, statSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "art/ui");
const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
// Derived from the pid, and no longer from an ambient `PORT`. Honouring the
// environment meant that anywhere PORT is already set — a shell with a dev
// server up, a hosting runtime — this tool spawned onto an occupied port,
// `waitForServer` was satisfied by whatever was *already* answering there, and
// the run photographed a stranger's build while reporting success. `--port`
// still exists for when a fixed one is wanted; see also the free-port check in
// startServer, which refuses rather than guesses.
const PORT = parseInt(flag("port", String(3400 + (process.pid % 200))), 10);
/** The design system's floor, `docs/DESIGN-SYSTEM.md` §3 and backlog 5.10. The
 *  same 44 `touchtest` holds the fight's glass to — one law, two harnesses,
 *  because the menus are the half touchtest never sees. */
const TAP_FLOOR = 44;
/** Every control this sweep found under the floor, across both widths. */
const tapFails = [];
/** Which screens wear the Trewhiddle ornament — backlog 5.9. Counted, not judged. */
const ornCensus = [];
// See the same constant in shoot.mjs for why this is not 127.0.0.1: Next 16
// blocks dev resources from the loopback literal, the HMR socket dies, and the
// dev client reload-loops the page — which for this tool means every shot is of
// a half-mounted screen with no stylesheet attached. It hid behind a production
// build, where there is no HMR socket to block.
const BASE = () => `http://localhost:${PORT}`;
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { tag: "phone", width: 390, height: 844, touch: true },
  { tag: "desktop", width: 1440, height: 900, touch: false },
];

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
 * Newest mtime under the directories a rendered screen depends on.
 *
 * This tool prefers a production build whenever it finds a BUILD_ID, and a
 * production build is a photograph of the source as it stood when it was made.
 * The CSS is the part that bites: Tailwind compiles into the build, so an
 * un-rebuilt `.next` serves the *previous* stylesheet, every screen comes back
 * looking right, and a layout change that has not been built is reported as
 * having no effect. Nothing in the output says which source it was of.
 */
function newestSourceMtime() {
  let newest = 0;
  for (const dir of ["src", "public"]) {
    const root = resolve(ROOT, dir);
    if (!existsSync(root)) continue;
    for (const e of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!e.isFile()) continue;
      const m = statSync(join(e.parentPath ?? e.path, e.name)).mtimeMs;
      if (m > newest) newest = m;
    }
  }
  return newest;
}

let server;
async function startServer() {
  // Refuse a port somebody is already answering on, rather than adopt them.
  try {
    await fetch(`${BASE()}/api/health`, { signal: AbortSignal.timeout(1500) });
    console.error(`[ui] something is already serving ${BASE()} — pass --port to pick another`);
    process.exit(2);
  } catch { /* nothing there, which is what we want */ }

  const buildId = resolve(ROOT, ".next/BUILD_ID");
  let useProd = existsSync(buildId) && !has("dev");
  if (useProd) {
    const built = statSync(buildId).mtimeMs;
    const edited = newestSourceMtime();
    if (edited > built) {
      const mins = ((edited - built) / 60000).toFixed(1);
      console.log(`[ui] .next is ${mins} min older than src/ — its CSS is stale, falling back to dev`);
      console.log("[ui] (run `npm run build` first for a faster, production-accurate capture)");
      useProd = false;
    }
  }
  console.log(`[ui] starting ${useProd ? "custom-server.mjs" : "dev-server.mjs"} on :${PORT}`);
  server = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`${BASE()}/api/health`);
  console.log("[ui] server up on", PORT);
}

/**
 * Waits until a stylesheet is actually attached and parsed.
 *
 * The screenshots used to be timed rather than gated — a flat 700–1500 ms and
 * hope. Against a production build that is enough, because the CSS ships as a
 * link in the document head and lands with the HTML. In dev, Tailwind compiles
 * on demand and the sheet arrives after the markup does, so the same timeout
 * photographs an unstyled screen and files it as a layout regression. A layout
 * audit whose input is unstyled is worse than no audit, for the same reason a
 * lineup with ten exposures is worse than none.
 */
async function waitForStyles(page) {
  await page.waitForFunction(() => {
    let rules = 0;
    for (const s of Array.from(document.styleSheets)) {
      try { rules += s.cssRules.length; } catch { /* opaque sheet, cannot count */ }
    }
    return rules > 20;
  }, null, { timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
}

async function main() {
  await startServer();
  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
      "--disable-gpu-sandbox", "--no-sandbox", "--ignore-gpu-blocklist"],
  });

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      isMobile: vp.touch,
      hasTouch: vp.touch,
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    // THE 44 px FLOOR, ON EVERY SCREEN THIS SWEEP VISITS — backlog 5.10, whose
    // own words are "44 px floor on every control INCLUDING DESKTOP". The phone
    // half has been gated in `touchtest` since 24 Aug; the desktop half never
    // was, and this file's only size audit ran on ONE screen (the lobby) and
    // merely printed. A law held on one of two platforms and one of a dozen
    // screens is a law nobody is keeping.
    //
    // Riding `shot()` on purpose: the sweep already walks every screen there is,
    // so the audit reaches all of them for free and cannot fall behind the
    // capture list. Measured on the SMALLER side of the box, which is the one a
    // thumb or a cursor misses.
    const tapAudit = async (name) => {
      const rows = await page.evaluate((floor) => {
        const bad = [];
        const svgThin = [];
        let total = 0;
        for (const e of document.querySelectorAll("button, select, a[href], input, [role=button]")) {
          const st = window.getComputedStyle(e);
          if (st.visibility === "hidden" || st.display === "none" || parseFloat(st.opacity || "1") < 0.05) continue;
          const r = e.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          // An inline link inside running prose is a word, not a target: it
          // cannot be 44 px tall without breaking the paragraph it lives in,
          // and the design system's law is about CONTROLS. Anything whose own
          // display is inline and which sits inside a text block is skipped —
          // decided off the element, not off a list of hrefs.
          if (st.display.startsWith("inline") && e.closest("p, li, .war-oath-note, .war-mirror-note")) continue;
          total++;
          const name = (e.getAttribute("aria-label") || e.textContent || e.tagName).trim().slice(0, 30);
          // SVG GEOMETRY IS MEASURED BY PRESSING IT, NOT BY ITS BOX.
          //
          // `getBoundingClientRect` on an SVG path EXCLUDES its stroke — probed
          // and confirmed: the war map's Fib reports 84x34 while its own bbox is
          // 161x65 and a press 20 px below its centre lands on Fib. The hit area
          // is widened by a transparent non-scaling stroke (see `.wm-hit`), and
          // a box rule cannot see that, so on this kind of control the box is
          // the wrong quantity and would condemn a target a thumb can hit.
          //
          // So the map's territories are asked the question a thumb asks:
          // press the centre, and press half a floor away on each axis. A
          // control that answers its own centre and reaches at least half a
          // floor on BOTH axes is reachable. Neighbours may take the far side —
          // they overlap by design, the note in `.wm-hit` says why — so one
          // direction per axis is enough.
          if (e.ownerSVGElement) {
            // AND ONLY IF IT IS ON SCREEN. `elementFromPoint` answers for the
            // VIEWPORT, so a control scrolled out of it answers nothing and
            // reads as unreachable — which is how the second cut of this
            // reported Mercia at 130x140 and Wessex at 228x101 as pressable by
            // nothing: the oath sits below the map and this sweep scrolls to
            // the oath. A control you cannot see is not a control you can press,
            // and it is not this claim's business either.
            if (r.top < 0 || r.left < 0 || r.bottom > window.innerHeight || r.right > window.innerWidth) continue;
            // ANCHOR ON A POINT THAT IS ACTUALLY THE SHAPE. The first cut of
            // this probed the bounding box's CENTRE and reported Mercia at
            // 130x140 as unreachable — an irregular polygon's box centre is
            // very often not inside the polygon, and on a map it is usually
            // inside a neighbour. Scan a coarse grid for a point that answers
            // as this element, then ask how far the press can travel from
            // there.
            // DOES THERE EXIST AN ANCHOR a thumb can land on? Not "is the box
            // centre good" — a map tiles with no gaps, so a point near a border
            // fails while the middle of the same territory is fine, and an
            // earlier cut of this reported Mercia at 130x140 for exactly that.
            // Scan for ANY point from which a half-floor press stays on the
            // shape.
            const h = floor / 2;
            let ok = false;
            for (let gy = 1; gy < 12 && !ok; gy++) {
              for (let gx = 1; gx < 12; gx++) {
                const px = r.left + (r.width * gx) / 12;
                const py = r.top + (r.height * gy) / 12;
                if (document.elementFromPoint(px, py) !== e) continue;
                const at = (dx, dy) => document.elementFromPoint(px + dx, py + dy) === e;
                if ((at(-h, 0) || at(h, 0)) && (at(0, -h) || at(0, h))) { ok = true; break; }
              }
            }
            // REPORTED, NOT GATED, and the reason is on the record: three of the
            // sixteen territories — Kent, Kernow, Sudreyjar — are a corner, a
            // peninsula and a scatter of islands, and no border stroke makes
            // them 44 px. The hit stroke took the count from six to three
            // (measured both ways); closing the last three wants a DOM overlay,
            // which is a backlog row and not a bar to bend today.
            if (!ok) svgThin.push(`${name} ${Math.round(r.width)}x${Math.round(r.height)}`);
            continue;
          }
          const side = Math.min(r.width, r.height);
          if (side < floor) bad.push({ t: name, w: Math.round(r.width), h: Math.round(r.height) });
        }
        return { bad, total, svgThin };
      }, TAP_FLOOR);
      // THE TREWHIDDLE CENSUS — backlog 5.9, "adopt the thesis across EVERY
      // screen". `docs/DESIGN-SYSTEM.md` §1 names the ornament: dark on metal,
      // COMPARTMENTED — bands with cut ends, never a full-length rule. The
      // system is built (`.knot-band`, `.ornament-line`); what nobody could say
      // was which screens actually wear it, because that is a question about
      // rendered pages and this sweep is the only thing that has them all.
      // Counted, not judged: a screen with none is named, and whether it WANTS
      // one is the owner's call and not a harness's.
      const orn = await page.evaluate(() => ({
        bands: document.querySelectorAll(".knot-band").length,
        rules: document.querySelectorAll(".ornament-line").length,
      }));
      ornCensus.push(`${name}-${vp.tag}: ${orn.bands} band(s), ${orn.rules} rule(s)`);
      if (rows.svgThin.length) {
        console.log(`[ui] ${name}-${vp.tag} map targets under a ${TAP_FLOOR}px press (reported): ${rows.svgThin.join(", ")}`);
      }
      if (rows.bad.length) {
        tapFails.push(`${name}-${vp.tag}: ${rows.bad.map((b) => `"${b.t}" ${b.w}x${b.h}${b.why ? " — " + b.why : ""}`).join(", ")}`);
      }
      console.log(`[ui] ${name}-${vp.tag} controls ${rows.total}, under ${TAP_FLOOR}px: ${rows.bad.length}`);
    };

    const shot = async (name, full = true) => {
      await waitForStyles(page);
      await page.waitForTimeout(700);
      await page.screenshot({ path: resolve(OUT, `${name}-${vp.tag}.png`), fullPage: full });
      await tapAudit(name);
      console.log(`[ui] ${name}-${vp.tag}`);
    };

    await page.goto(`${BASE()}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await shot("landing", false);
    await shot("landing-full");

    // training grounds
    await page.getByRole("button", { name: /Training/ }).first().click();
    await shot("training");

    // training setup (muster)
    await page.getByRole("button", { name: /MUSTER THE TESTGROUNDS/ }).click();
    await page.waitForTimeout(1500);
    await shot("training-setup");

    // armoury, reached from the landing screen. The wait is long because the
    // shop now renders with the GAME's renderer — a texture library, a PMREM
    // bake and a warrior — and a shot taken before that lands photographs an
    // empty frame and files it as a regression.
    await page.goto(`${BASE()}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: /Armoury/ }).first().click();
    await page.waitForTimeout(7000);
    await shot("armoury");

    // The cheap end of the ladder, against the expensive end below. 30 gold
    // and 2400 gold have to be different pictures or the shop is not a ladder.
    const cheap = page.getByRole("button", { name: /Iron Spangenhelm/ }).first();
    if (await cheap.count()) {
      await cheap.click();
      await page.evaluate(() => { const s = document.querySelector(".shell"); if (s) s.scrollTop = 0; });
      await page.waitForTimeout(2500);
      await shot("armoury-cheap");
    }

    // The cloak tab: a different slot takes a different lens (a cloak is a
    // whole figure, a helm is a portrait), so this is the frame that shows
    // the crop is per slot rather than one framing for everything.
    const cloakTab = page.getByRole("button", { name: /^CLOAKS$/ }).first();
    if (await cloakTab.count()) {
      await cloakTab.click();
      await page.evaluate(() => { const s = document.querySelector(".shell"); if (s) s.scrollTop = 0; });
      await page.waitForTimeout(3500);
      await shot("armoury-cloaks");
    }

    // AT FIGHT DISTANCE. The audit's decisive finding is that seven helmets
    // are the same 20 px grey dome at the range the game is played at; this
    // is the control that lets a player see that before he spends.
    const fight = page.getByRole("button", { name: /FIGHT RANGE/ }).first();
    if (await fight.count()) {
      await fight.click();
      await page.waitForTimeout(2500);
      await shot("armoury-fight");
    }

    // ...and with a locked helm on the mannequin, which is the only state that
    // shows the price and the buy button the server now answers for.
    const helmTab = page.getByRole("button", { name: /^HELMETS$/ }).first();
    if (await helmTab.count()) { await helmTab.click(); await page.waitForTimeout(1500); }
    const helm = page.getByRole("button", { name: /Sutton Hoo/ }).first();
    if (await helm.count()) {
      await helm.click();
      // Back to the top: the mannequin and the price it is asking for are what
      // this shot is of, and tapping an item leaves the list scrolled to it.
      await page.evaluate(() => { const s = document.querySelector(".shell"); if (s) s.scrollTop = 0; });
      await page.waitForTimeout(3000);
      await shot("armoury-staged");

      // Ask to buy 2400 gold of helmet with nothing in the purse. The server
      // is the one that says no, and the screen has to repeat it rather than
      // clearing the mannequin and looking like it worked.
      await page.getByRole("button", { name: /EQUIP & BUY/ }).click();
      await page.waitForTimeout(2000);
      await shot("armoury-refused");
      const refusal = await page.evaluate(() => document.querySelector('[role="status"]')?.textContent?.trim() ?? null);
      const stillStaged = await page.evaluate(() => !!document.body.textContent.includes("COST TO UNLOCK"));
      console.log(`[ui] ${vp.tag} refused purchase says: ${JSON.stringify(refusal)} · try-on kept=${stillStaged}`);
    }

    // saga: the profile screen, and the only surface the whole profile
    // feature has. The wait is for the silent sign-in to land.
    await page.goto(`${BASE()}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: /Saga/ }).first().click();
    await page.waitForTimeout(900);
    await shot("saga");
    // The shell scrolls, not the document, so fullPage stops at the fold and
    // the recovery panel is below it on a phone. Scroll the shell instead.
    await page.evaluate(() => {
      const shell = document.querySelector(".shell");
      if (shell) shell.scrollTop = shell.scrollHeight;
    });
    await shot("saga-foot");
    const words = await page.evaluate(() => {
      const chips = [...document.querySelectorAll("section .font-display")];
      return chips.map((e) => e.textContent.trim()).filter((t) => /^[a-z]+$/.test(t)).join(" ");
    });
    console.log(`[ui] ${vp.tag} recovery words: ${words || "(none — local mode)"}`);
    const restore = page.getByRole("button", { name: /I HAVE FOUR WORDS/ });
    if (await restore.count()) {
      await restore.click();
      await page.waitForTimeout(500);
      await shot("saga-restore");
    }

    // THE OATH, and its livery mirror — backlog 8.3, the owner's screenshot:
    // the caption said "In the colours of the Anglo-Saxons" over a warrior in
    // plain issued steel. The mirror is the ONE surface in the game whose whole
    // job is to show a colour, and this sweep had never photographed it: the
    // factions page is its own route and the loop above only ever walked the
    // screens reachable from the landing hall.
    //
    // Two frames, and the pair is the claim: the mirror before a kingdom is
    // touched, and after. If the second is not visibly a different man from the
    // first, the caption is lying.
    await page.goto(`${BASE()}/factions`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4500);
    // The oath is far down a long page and the map is above it. Scroll to the
    // section itself — the first cut of this photographed the map, twice, and
    // filed it as the mirror.
    const oathAt = async () => {
      await page.evaluate(() => {
        document.querySelector(".war-oath")?.scrollIntoView({ block: "center" });
      });
      await page.waitForTimeout(700);
    };
    // THE MAP ITSELF, IN VIEW. The oath is below it and this sweep scrolls
    // there, so every earlier cut of the tap audit skipped the map entirely and
    // reported a clean sheet — green because the case was absent, which is the
    // one thing this project does not accept. Photographed and audited at the
    // top of the page first.
    await shot("warmap");
    await oathAt();
    await shot("oath");
    // `.war-people-row` is the kingdom list's own class. By role/name the map's
    // territories answer first, which is what went wrong.
    const rows = page.locator(".war-people-row");
    const n = await rows.count();
    if (n >= 2) {
      await rows.nth(0).click();
      await oathAt();
      await shot("oath-first");
      await rows.nth(1).click();
      await oathAt();
      await shot("oath-second");
      const said = await page.evaluate(() =>
        document.querySelector(".war-mirror-note")?.textContent?.trim() ?? "(no mirror note)");
      console.log(`[ui] oath mirror says: ${said}`);
    } else {
      console.log(`[ui] WARNING: ${n} kingdom rows on /factions — the oath mirror was not exercised`);
    }

    // lobby: name -> create battle -> create room
    await page.goto(`${BASE()}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    await page.getByPlaceholder("Enter warrior name...").fill("Aelfric");
    await page.getByRole("button", { name: /CREATE BATTLE/ }).click();
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: /CREATE ROOM/ }).click();
    await page.waitForTimeout(3500);
    await shot("lobby");
    await shot("lobby-viewport", false);

    // The lobby's own tap-target audit used to live here, on this ONE screen,
    // printing and never failing. `tapAudit` rides every `shot()` now and gates
    // the lot — see its note.

    // deep link: a fresh guest opening the bare invite URL
    const code = await page.evaluate(() => {
      const el = document.querySelector(".warcode");
      return el ? el.textContent.trim() : null;
    });
    console.log(`[ui] ${vp.tag} war code: ${code}`);
    if (code) {
      const guestCtx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }, isMobile: vp.touch, hasTouch: vp.touch,
      });
      const guest = await guestCtx.newPage();
      await guest.goto(`${BASE()}/?code=${code}`, { waitUntil: "domcontentloaded" });
      await waitForStyles(guest);
      await guest.waitForTimeout(1500);
      await guest.screenshot({ path: resolve(OUT, `deeplink-join-${vp.tag}.png`), fullPage: true });
      await guest.getByPlaceholder("Enter warrior name...").fill("Guest");
      await guest.getByRole("button", { name: /^JOIN$/ }).click();
      await guest.waitForTimeout(3500);
      const inLobby = await guest.evaluate(() => !!document.querySelector(".warcode"));
      const guestCode = await guest.evaluate(() => document.querySelector(".warcode")?.textContent?.trim() ?? null);
      await guest.screenshot({ path: resolve(OUT, `deeplink-lobby-${vp.tag}.png`), fullPage: true });
      console.log(`[ui] ${vp.tag} DEEPLINK: reached lobby=${inLobby} code=${guestCode} matches=${guestCode === code}`);
      await page.waitForTimeout(800);
      await page.screenshot({ path: resolve(OUT, `lobby-two-${vp.tag}.png`), fullPage: true });
      await guestCtx.close();
    }
    await ctx.close();
  }

  await browser.close();
  if (server && !server.killed) server.kill("SIGTERM");

  // THE FLOOR, REPORTED AND THEN HELD. See `tapAudit`.
  console.log("");
  if (tapFails.length) {
    console.log(`[ui] CONTROLS UNDER THE ${TAP_FLOOR}px FLOOR — backlog 5.10, "every control including desktop":`);
    for (const f of tapFails) console.log(`[ui]   ${f}`);
  }
  console.log(`[ui] ${tapFails.length ? "FAIL" : "PASS"}: the ${TAP_FLOOR}px floor, on every screen this sweep walks, at both widths`);
  console.log("");
  const bare = ornCensus.filter((l) => l.includes("0 band(s), 0 rule(s)"));
  console.log(`[ui] TREWHIDDLE (5.9): ${ornCensus.length - bare.length} of ${ornCensus.length} rendered screens wear the ornament.`);
  for (const l of bare) console.log(`[ui]   bare: ${l.split(":")[0]}`);
  if (server && !server.killed) server.kill("SIGTERM");
  process.exit(tapFails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); if (server && !server.killed) server.kill("SIGTERM"); process.exit(1); });
