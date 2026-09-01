#!/usr/bin/env node
// ============================================================
// INSTALLSEEN — the earned install prompt, SEEN on a real won match.
//
//   node tools/installseen.mjs
//
// WHY IT EXISTS. `docs/BACKLOG.md` Wave F asks for "an EARNED install prompt:
// never at first load, after a won match", and the shell it hangs off (8.9)
// shipped without it. The rule is the whole feature — an install prompt is a
// ONE-SHOT, because a dismissal is remembered by the browser and
// `beforeinstallprompt` may never fire again for that origin — so a change that
// silently offered it at the wrong moment, or never offered it at all, would
// look identical in a diff and identical in `tsc`.
//
// The standing law of this repo is LOOK AT THE PICTURES, and it is the reason
// this file exists rather than a unit test: the row is rendered by the summary,
// over the victor's tableau, and the only honest way to know it is there is to
// fight a match, win it, and photograph the screen.
//
// WHAT IT PROVES, and each claim has its own control, because a row that
// appears for everybody is as broken as one that appears for nobody:
//
//   1. THE SHELL IS SERVED — the manifest parses, names the game, is
//      `standalone`, and its icons actually resolve. A manifest pointing at a
//      404 is an install prompt no browser will ever offer.
//   2. THE WORKER REGISTERS — and caches nothing, which `public/sw.js` argues
//      for at length and this only has to confirm is still true.
//   3. IT IS OFFERED ON A WON MATCH — a real duel, fought, with a real corpse.
//   4. AND NOT WHEN IT HAS ALREADY BEEN ANSWERED — the never-nag rule, seeded
//      through the seam's own key.
//
// WHAT IT IS NOT. It cannot make Chromium fire a real `beforeinstallprompt`:
// that is gated behind an engagement heuristic no harness can satisfy, which is
// precisely why the iOS arm is the one under test here. The phone context is a
// real iPhone user agent, `client/install.ts` reads it as Safari, and the arm it
// takes is the SENTENCE — which is the arm a browser can never be made to
// simulate and therefore the arm most likely to rot unseen.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { launchBrowser as launchChromium, rasteriserNote } from "./lib/browser.mjs";
import { raiseMoot, driveIntoTheFire } from "./summarymoot.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = parseInt(process.env.PORT || String(3990 + (process.pid % 9)), 10);
const OUT = resolve(ROOT, "art/shots");
mkdirSync(OUT, { recursive: true });

let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(cond, what, timeoutMs = 30000) {
  const t0 = Date.now();
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await sleep(150);
  }
}

// The same wire tap summaryflow installs, so a real match can be watched.
const PROBE = () => {
  const w = window;
  w.__probe = { joinData: null, latest: null, matchEnd: null, playerId: null };
  const RealWS = window.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (String(url).includes("/ws")) {
      ws.addEventListener("message", (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === "join") { w.__probe.joinData = m.data; w.__probe.playerId = m.data.playerId; }
          // Keyed on the SHAPE and not on a type string, exactly as
          // summaryflow's tap is: the snapshot frames are not typed "state",
          // and a tap that waits for one that never comes reports a fight that
          // has visibly started as a fight that never did. That is how this
          // probe's first run failed — the HUD was on screen and `latest` was
          // still null.
          if (m.data && m.data.players) w.__probe.latest = m.data;
          if (m.type === "match_end") w.__probe.matchEnd = m.data;
        } catch { /* not ours */ }
      });
    }
    return ws;
  }
  TappedWS.prototype = RealWS.prototype;
  Object.assign(TappedWS, RealWS);
  w.WebSocket = TappedWS;
};

// ---- the server -----------------------------------------------------------
const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
const proc = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
  stdio: ["ignore", "ignore", "ignore"],
});
const origin = `http://127.0.0.1:${PORT}`;
// IT MUST BE OUR OWN SERVER, AND THIS COST AN HOUR.
//
// Every tool in this drawer picks a port off its own pid and then waits for
// /api/health to answer. If a server from an earlier, killed run is still
// holding that port, the spawn fails with EADDRINUSE — and the health check
// answers anyway, from the STRANGER. The probe then measures an old build with
// a live room already in it: the failures read as "the manifest 500s" and "the
// mode menu never opened", and neither had anything to do with the tree.
//
// So the child is required to be alive, and the port is required to have been
// free. A harness that will silently adopt somebody else's server is a harness
// that can report on a build nobody has.
let bootErr = null;
proc.on("exit", (code) => { if (code !== 0) bootErr = `the server exited with code ${code}`; });
for (const t0 = Date.now(); ;) {
  if (bootErr) {
    console.error(`[install] ${bootErr} — port ${PORT} is almost certainly held by a stale server.`);
    console.error(`[install] REAP IT: pkill -f custom-server.mjs`);
    process.exit(2);
  }
  try { const r = await fetch(`${origin}/api/health`); if (r.ok || r.status === 404) break; } catch { /* not up */ }
  if (Date.now() - t0 > 240000) { console.error("server never came up"); process.exit(2); }
  await sleep(400);
}
if (bootErr) { console.error(`[install] ${bootErr}`); process.exit(2); }
console.log(`[install] ${useProd ? "production" : "dev"} server on :${PORT}`);
if (!useProd) console.log("[install] NO PRODUCTION BUILD — run `npm run build` first.");
console.log(`[install] ${rasteriserNote()}\n`);

// ---- 1. THE SHELL ---------------------------------------------------------
console.log("[install] === 1. THE SHELL IS SERVED ===\n");
{
  const r = await fetch(`${origin}/manifest.webmanifest`);
  const m = r.ok ? await r.json() : null;
  check("the manifest is served and parses", !!m, m ? `${r.status} ${r.headers.get("content-type")}` : `HTTP ${r.status}`);
  if (m) {
    check("it names the game and stands alone", /bretwalda/i.test(`${m.name}${m.short_name}`) && m.display === "standalone",
      `name="${m.name}" display=${m.display} orientation=${m.orientation}`);
    // A manifest whose icons 404 is a prompt no browser will ever offer, and
    // nothing in the tree checked that the forged mark is actually reachable.
    const icons = m.icons ?? [];
    const bad = [];
    for (const ic of icons) {
      const ir = await fetch(new URL(ic.src, origin));
      if (!ir.ok) bad.push(`${ic.src} -> ${ir.status}`);
    }
    check("every icon it points at resolves", icons.length > 0 && bad.length === 0,
      bad.length ? bad.join("; ") : `${icons.length} icon(s), all 200`);
  }
  // ONE MANIFEST, AND THIS CLAIM HAS A SCAR. A file in `public/` shadows the
  // route `app/manifest.ts` generates — both are `/manifest.webmanifest` and the
  // static one wins — so for five days the served manifest was a hand-written
  // copy pinned to `"orientation": "landscape"` while the typed source said
  // "any" and carried the owner's ruling that the game must play both ways up.
  // The reasoning was true of a file nothing served.
  check("the manifest is not shadowed by a second copy in public/",
    !existsSync(resolve(ROOT, "public/manifest.webmanifest")),
    "public/manifest.webmanifest must not exist — app/manifest.ts is the one source");
  check("and it is not orientation-locked, per the owner's ruling",
    m?.orientation === "any",
    `orientation=${m?.orientation} — "played both landscape & portrait hand held positions"`);

  const sw = await fetch(`${origin}/sw.js`);
  const body = sw.ok ? await sw.text() : "";
  check("the worker is served", sw.ok, `HTTP ${sw.status}`);
  // public/sw.js argues at length that a live-wire game must not cache. This
  // only has to notice if that ever stops being true.
  check("and it still caches NOTHING", sw.ok && !/addEventListener\(\s*["']fetch["']/.test(body),
    "no fetch handler, so the browser's own network stack serves everything");
}

// ---- the phone, and a real fought duel -------------------------------------
const browser = await launchChromium();
async function phone(seedAsked) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
      + "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await ctx.addInitScript(PROBE);
  await ctx.addInitScript((asked) => {
    try {
      window.localStorage.setItem("bretwalda_name", "Prober");
      // The control arm: the seam's own key, already answered.
      if (asked) window.localStorage.setItem("bbm.install.asked", "dismissed");
    } catch { /* private mode */ }
  }, seedAsked);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[pageerror] ${e}`));
  await page.goto(`${origin}/?quality=low`, { waitUntil: "domcontentloaded" });
  // WAIT FOR THE PAGE TO BE ALIVE, not merely present. `domcontentloaded` fires
  // before React has hydrated, and Playwright's actionability check is about
  // the ELEMENT — a server-rendered button is visible, stable and enabled while
  // its onClick does not exist yet. A click there is swallowed silently and the
  // next step waits thirty seconds for a menu nobody opened, which is exactly
  // how this probe failed twice with no page error to show for it.
  //
  // NOT `networkidle`: this page holds a WebSocket open, so it never idles and
  // that wait is a silent 30-second stall before anything is clicked. Wait for
  // the landing screen's own text instead, which only React can put there.
  await page.getByText("SELECT GAME MODE", { exact: false }).first().waitFor({ state: "detached", timeout: 2000 }).catch(() => {});
  await until(() => page.evaluate(() =>
    /CREATE BATTLE/i.test(document.body.innerText || "")), "the landing screen", 60000);
  await sleep(800);
  return { ctx, page };
}

/** Fight a duel, kill the other man, and hold the summary. */
async function winADuel(page) {
  let wires;
  try {
    ({ wires } = await raiseMoot(page, "duel", { port: PORT, until, sleep }));
  } catch (e) {
    const diag = await page.evaluate(() => ({
      state: window.__probe?.latest?.state ?? null,
      players: Object.keys(window.__probe?.latest?.players ?? {}).length,
      join: !!window.__probe?.joinData,
      buttons: [...document.querySelectorAll("button")].map((b) => (b.innerText || "").trim()).filter(Boolean).slice(0, 14),
    }));
    console.log(`[install] DIAG ${JSON.stringify(diag)}`);
    await page.screenshot({ path: resolve(OUT, "install-diag-failure.png") }).catch(() => {});
    console.log(`[install] DIAG picture: art/shots/install-diag-failure.png`);
    throw e;
  }
  await sleep(2500);
  const B = wires[0];
  const walker = driveIntoTheFire([B]);
  await until(() => B.me()?.state === "dead", "the fire to take him", 40000);
  clearInterval(walker);
  const verdict = await until(() => page.evaluate(() => window.__probe?.matchEnd || null), "the verdict", 40000);
  await until(() => page.evaluate(() => window.__summaryUp === true), "the summary", 40000);
  const myId = await page.evaluate(() => window.__probe?.playerId);
  return { verdict, myId, won: verdict.winnerId === myId, wires };
}

/**
 * Hang up the wire men. THIS IS NOT TIDINESS — it is why this probe flaked.
 *
 * `wireMan` opens a socket and nothing ever closes it, so the room from the
 * first arm stayed alive with a live player in it. The second arm then raised
 * its room against a server that still had the first one running, and its
 * `HONOUR DUEL` click landed on a page that had been put somewhere else: the
 * failure printed `state: "fighting", players: 2` while claiming the mode menu
 * never opened, which is a page already in a match saying so.
 *
 * A gate that fails one run in three teaches people to re-run it until it is
 * green, which is the opposite of a gate.
 */
const hangUp = (wires) => { for (const w of wires ?? []) { try { w.ws.close(); } catch { /* already gone */ } } };

const readOffer = (page) => page.evaluate(() => {
  const btn = document.querySelector('[data-install="offer"]');
  const body = document.body.innerText || "";
  const ios = /KEEP THE MOOT BY YOUR HEARTH/i.test(body) && /Add to Home Screen/i.test(body);
  return { button: !!btn, ios, hearth: /KEEP THE MOOT BY YOUR HEARTH/i.test(body) };
});

// ---- 2. OFFERED ON A WON MATCH --------------------------------------------
console.log("\n[install] === 2. OFFERED, AFTER A MATCH HE WON ===\n");
{
  const { ctx, page } = await phone(false);
  const duel = await winADuel(page);
  const { won, verdict } = duel;
  check("the duel was actually won by the man being offered it", won,
    `winner ${verdict.winnerName}`);
  const offer = await readOffer(page);
  await page.screenshot({ path: resolve(OUT, "install-offer-won.png") });
  check("the invitation is on the summary he won", offer.hearth,
    offer.hearth ? (offer.ios ? "the iOS arm — the sentence, with Share / Add to Home Screen" : "shown") : "nothing rendered");
  check("and on iOS it is the SENTENCE, not a button that would do nothing", offer.ios && !offer.button,
    `ios=${offer.ios} button=${offer.button} — Safari has no beforeinstallprompt and never will`);
  console.log(`        picture: art/shots/install-offer-won.png`);
  hangUp(duel.wires);
  await ctx.close();
  // And let the server actually reap the room before the next arm raises one.
  await sleep(1500);
}

// ---- 3. NOT OFFERED TWICE -------------------------------------------------
console.log("\n[install] === 3. AND NEVER ASKED TWICE (the control) ===\n");
{
  const { ctx, page } = await phone(true);
  const duel2 = await winADuel(page);
  const { won } = duel2;
  check("the control won his duel too, so the only difference is the answer already given", won);
  const offer = await readOffer(page);
  await page.screenshot({ path: resolve(OUT, "install-offer-already-asked.png") });
  check("a device that has already answered is not asked again", !offer.hearth && !offer.button,
    offer.hearth ? "IT ASKED AGAIN — the never-nag rule is broken" : "nothing offered, as it should be");
  console.log(`        picture: art/shots/install-offer-already-asked.png`);
  hangUp(duel2.wires);
  await ctx.close();
}

await browser.close();
proc.kill();
console.log(`\n[install] ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
