#!/usr/bin/env node
// ============================================================
// WARSHOT — photograph /factions at phone and desktop width.
//
//   node tools/warshot.mjs                          # no database: the opening map
//   WAR_TEST_DB=postgres://... node tools/warshot.mjs
//
// `docs/PROCESS.md` R5: open the render. Three of the four defects the owner
// reported on 8 Aug were invisible to every number in the repository and
// obvious in one PNG, and a map is the most PNG-shaped thing this game has —
// a territory whose polygon misses the coast by ten miles passes every
// assertion in `wartest` and is unmistakable in a screenshot.
//
// Separate from `uishots.mjs` on purpose: that one drives the menu flow and
// belongs to another wave, and this one needs a database pointed at it, which
// nothing there does. Writes to art/ui/ alongside it.
// ============================================================
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";
import { spawn } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chooseServer } from "./lib/freshbuild.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// `--out DIR` for a review pass that should not land in the gallery, and
// `--scale N` because the defect this tool exists to catch is a border a
// pixel and a half wide on a phone, and deviceScaleFactor 1 is exactly the
// resolution at which "is that a river or a ruler" stops being answerable.
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = resolve(arg("out", resolve(ROOT, "art/ui")));
const DPR = Number(arg("scale", "1"));
// `--as ID:SECRET` photographs the screen AS A SWORN MAN, by writing the same
// `bretwalda_link` key `src/app/profileLink.ts` writes. Without it every shot
// is of a stranger who has never fought — and a stranger is the one visitor
// for whom "no sign of progress or identity" is the CORRECT render. The defect
// the owner reported is only visible from inside an oath.
// `--label` names the file, so a before and an after can sit side by side.
const AS = arg("as", "");
const LABEL = arg("label", "");
// `--seen MS` pre-sets the dispatch watermark (`bretwalda_war_seen_<season>`,
// see factionMap/Dispatch.tsx) so the three states that panel has — never
// looked, flips since you did, nothing since — can each be photographed.
// Without it every run is a first visit, which is the one state that does not
// exercise the comparison.
const SEEN = arg("seen", "");
const SEEN_SEASON = arg("seen-season", "1");
const PORT = parseInt(process.env.PORT || String(3960 + (process.pid % 30)), 10);
const BASE = `http://localhost:${PORT}`;
const DB = process.env.WAR_TEST_DB || "";
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { tag: "phone", width: 390, height: 844, touch: true },
  { tag: "desktop", width: 1440, height: 900, touch: false },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // A PHOTOGRAPH OF A STALE BUNDLE IS A PHOTOGRAPH OF THE WRONG BUILD, and it
  // is worse than no photograph because it is evidence. This chose its server
  // on `existsSync(".next/BUILD_ID")` alone, and in the worktree the map was
  // authored in that bundle predated the commit by seven minutes — so the PNGs
  // filed as proof of the map screen were pictures of the code before it. See
  // `tools/lib/freshbuild.mjs`.
  const choice = chooseServer(ROOT, "warshot");
  const server = spawn("node", [choice.script], {
    cwd: ROOT,
    env: {
      ...process.env, PORT: String(PORT),
      NODE_ENV: choice.prod ? "production" : "development",
      ...(DB ? { DATABASE_URL: DB } : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  watchBoot(server, "warshot");
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  const started = Date.now();
  for (;;) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) break; } catch { /* wait */ }
    if (Date.now() - started > 180000) throw new Error("server never came up");
    await sleep(400);
  }
  console.log(`[warshot] server up on ${PORT}${DB ? " with a war database" : " with NO database"}`);
  console.log(`[warshot] photographing: ${choice.note}`);

  const browser = await chromium.launch({
    ...launchOptions(),
  });

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: DPR, isMobile: vp.touch, hasTouch: vp.touch,
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log(`[warshot] PAGE ERROR ${vp.tag}: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && console.log(`[warshot] console ${vp.tag}: ${m.text()}`));
    if (AS || SEEN) {
      // The key has to be on the origin BEFORE /factions runs its first
      // effect, so it is written on a cheap page and the map navigated to
      // second.
      const [id, ...rest] = AS.split(":");
      await page.goto(`${BASE}/api/health`, { waitUntil: "domcontentloaded" });
      await page.evaluate(({ id, secret, seen, season }) => {
        if (secret) localStorage.setItem("bretwalda_link", JSON.stringify({ id, secret }));
        if (seen) localStorage.setItem(`bretwalda_war_seen_${season}`, seen);
      }, { id: Number(id), secret: rest.join(":"), seen: SEEN, season: SEEN_SEASON });
    }
    await page.goto(`${BASE}/factions`, { waitUntil: "domcontentloaded" });
    // Wait for a stylesheet to actually be attached and parsed. In dev,
    // Tailwind compiles on demand and a timed shot photographs an unstyled
    // screen — a layout audit whose input is unstyled is worse than none.
    await page.waitForFunction(() => {
      let rules = 0;
      for (const s of Array.from(document.styleSheets)) {
        try { rules += s.cssRules.length; } catch { /* opaque */ }
      }
      return rules > 20;
    }, null, { timeout: 120000 });
    // And for the war rolls to have arrived, so this is never a photo of the
    // loading state filed as a map.
    await page.waitForSelector(".warmap-svg", { timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(900);
    const name = `war-${LABEL || (DB ? "live" : "unkept")}-${vp.tag}`;

    // `.shell` is `position: fixed; inset: 0; overflow-y: auto` — the game's
    // own scroller — so the DOCUMENT never grows and `fullPage: true` returns
    // one viewport and calls it the whole screen. The first run of this tool
    // did exactly that and I reviewed a map with the standings, the oath and
    // half of southern England outside the frame, none of which I could see
    // was missing. So the shell is scrolled by hand and shot twice.
    await page.screenshot({ path: resolve(OUT, `${name}-top.png`) });
    console.log(`[warshot] ${name}-top`);

    // AND THREE TIMES, NOT TWICE. Britain is 1.56 times as tall as it is wide,
    // so on a 390-wide phone the plate is taller than the viewport: the -top
    // frame ends around the Dee and the -foot frame is well past the map. Every
    // border south of Chester — the Thames, the Danelaw line, the Tamar, Kent —
    // was outside both, which is the half of the map the defect was reported
    // from. This frame puts the plate's bottom edge on the viewport's.
    const mapped = await page.evaluate(() => {
      const shell = document.querySelector(".shell");
      const plate = document.querySelector(".warmap-plate");
      if (!shell || !plate) return 0;
      const overshoot = plate.getBoundingClientRect().bottom - shell.clientHeight;
      shell.scrollTop = Math.max(0, shell.scrollTop + overshoot + 8);
      return shell.scrollTop;
    });
    await sleep(400);
    await page.screenshot({ path: resolve(OUT, `${name}-map.png`) });
    console.log(`[warshot] ${name}-map (scrolled ${mapped}px, plate bottom in frame)`);

    const scrolled = await page.evaluate(() => {
      const shell = document.querySelector(".shell");
      if (!shell) return 0;
      shell.scrollTop = shell.scrollHeight;
      return shell.scrollTop;
    });
    await sleep(500);
    await page.screenshot({ path: resolve(OUT, `${name}-foot.png`) });
    console.log(`[warshot] ${name}-foot (scrolled ${scrolled}px)`);
    await ctx.close();
  }
  await browser.close();
  server.kill("SIGKILL");
}

main().catch((e) => { console.error("[warshot]", e); process.exit(1); });
