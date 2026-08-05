#!/usr/bin/env node
// Real-flow probe: real MATCHES through the shipped page at 390x844, of the
// three shapes the end-of-match tableau has to compose.
//
//   duel    one man stands over one corpse, and the rematch flow works: the
//           summary overlay mounts over the live canvas, the verdict is
//           legible, FIGHT AGAIN pressed EARLY parks through the ten-second
//           rollback and lands the player ready in the lobby.
//   ffa     an eight-man BLOOD MOOT — EXACTLY THREE MEN STAND and the other
//           five lie dead, the three are the ledger's own top three, nobody is
//           behind the DOM panels, and the phone player (a corpse this round)
//           is offered no flourish.
//   team    a 2v2 WAR BAND — the winning SIDE stands whole, the losing side
//           lies whole. A war band ranks bands, not men.
//
// Every one of them is fought: wire men walk into the bonfire and an AI does
// the rest. Nothing here poses anybody.
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { raiseMoot, driveIntoTheFire } from "./summarymoot.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PORT = parseInt(process.env.PORT || String(3960 + (process.pid % 30)), 10);
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "art/shots";
let server;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function waitForServer(url, timeoutMs = 180000) {
  const started = Date.now();
  return new Promise((ok, fail) => {
    const poll = async () => {
      try { const r = await fetch(url); if (r.ok || r.status === 404) return ok(); } catch { }
      if (Date.now() - started > timeoutMs) return fail(new Error("server never came up"));
      setTimeout(poll, 700);
    };
    poll();
  });
}

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
          if (m.data && m.data.players) w.__probe.latest = m.data;
          if (m.type === "match_end") w.__probe.matchEnd = m.data;
        } catch { }
      });
    }
    return ws;
  }
  TappedWS.prototype = RealWS.prototype;
  Object.assign(TappedWS, RealWS);
  w.WebSocket = TappedWS;
};

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function until(cond, what, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(120);
  }
}

/** A fresh phone, tapped and named, on the landing screen. */
async function phone(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await ctx.addInitScript(PROBE);
  await ctx.addInitScript(() => {
    try { window.localStorage.setItem("bretwalda_name", "Prober"); } catch { }
    window.__summaryDiag = true;
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[pageerror] ${e}`));
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });
  return { ctx, page };
}

/**
 * The cast the moment the stage has one, with no settling wait. Everything
 * about WHO is standing is decided on the frame the stage is built, and the
 * emote row has to be judged inside the server's ten-second window before the
 * room rolls back to a lobby in which every corpse is idle again.
 */
async function castNow(page) {
  await until(() => page.evaluate(() => (window.__summaryBodies ?? []).length > 0),
    "the stage to report its cast", 30000);
  return page.evaluate(() => ({
    men: window.__summaryBodies ?? [],
    me: window.__probe?.playerId ?? null,
    wireState: window.__probe?.latest?.players?.[window.__probe?.playerId]?.state ?? null,
    roomState: window.__probe?.latest?.state ?? null,
  }));
}

/**
 * The stage's own account of who it stood up, once it has settled.
 *
 * `frames` is why this waits rather than reads: the summary is reported per
 * rendered frame, and on a software rasteriser the first few of those are drawn
 * while the camera is still wherever the spectate orbit left it. A cast read
 * off frame one is measured against a lens that is not the lens the shot is
 * taken with, which is a whole class of false failure.
 */
async function tableau(page, frames = 6) {
  await until(async () => {
    const n = await page.evaluate(() => {
      const w = window;
      w.__flowFrames = (w.__flowFrames ?? 0);
      return (w.__summaryBodies ?? []).length > 0;
    });
    if (!n) return false;
    await sleep(700);
    return true;
  }, "the stage to report its cast", 30000);
  for (let i = 0; i < frames; i++) await sleep(400);
  return page.evaluate(() => ({
    stage: window.__summaryStage ?? null,
    men: window.__summaryBodies ?? [],
    cam: window.__summaryCam ?? null,
    verdict: window.__probe?.matchEnd ?? null,
    me: window.__probe?.playerId ?? null,
    wireState: window.__probe?.latest?.players?.[window.__probe?.playerId]?.state ?? null,
    roomState: window.__probe?.latest?.state ?? null,
  }));
}

/**
 * AN EIGHT-MAN FREE-FOR-ALL. Six wire men burn, an AI kills the phone player,
 * and the AI takes it — so the local man watches the summary from the ground,
 * which is the case the emote row exists to get wrong.
 */
async function ffaPhase(browser) {
  const { ctx, page } = await phone(browser);
  const { wires } = await raiseMoot(page, "ffa", { port: PORT, until, sleep });
  await sleep(2000);
  const drive = driveIntoTheFire(wires);
  await until(() => page.evaluate(() => window.__probe?.matchEnd || null),
    "the eight-man match to end", 180000);
  clearInterval(drive);
  // The emote row FIRST and unsettled: it has ten seconds of truth in it.
  const early = await castNow(page);
  const mine = await emoteCheck(page, early, "free-for-all");
  await sleep(2000);

  const { stage, men, cam, verdict, me } = await tableau(page);
  const stood = men.filter((m) => m.standing);
  const lying = men.filter((m) => !m.standing);
  check("eight men fought, three stand and five lie",
    men.length === 8 && stood.length === 3 && lying.length === 5,
    `cast=${men.length} standing=${stood.length} dead=${lying.length} kind=${stage?.kind}`);
  // Every man the stage did NOT honour has to be a corpse in the animator's
  // eyes too, or he is a live man lying face-down — a different bug with the
  // same silhouette.
  check("every man off the podium is genuinely dead",
    lying.every((m) => m.state === "dead"),
    lying.map((m) => m.state).join(","));
  // The picture and the numbers must name the same three men, or the podium
  // is a second opinion about who won.
  const top3 = [...(verdict?.results ?? [])].sort((a, b) => b.score - a.score).slice(0, 3);
  const winnerUp = stood.some((m) => m.id === verdict?.winnerId);
  check("the podium is the ledger's own top three, victor included",
    winnerUp && top3.every((r) => stood.some((m) => m.id === r.id)),
    `ledger=${top3.map((r) => r.name).join("/")} winnerStanding=${winnerUp}`);
  // Nothing behind the ledger panel and nothing off the sides. `band` is the
  // slot of glass the stage measured the DOM leaving free.
  const band = stage?.band ?? [-1, 1];
  const buried = men.filter((m) => m.ndc && m.ndc[1] < band[0] - 0.02);
  const cropped = men.filter((m) => m.ndc && (m.ndc[0] < -1 || m.ndc[2] > 1));
  check("every man is in the picture, none under the DOM panels",
    buried.length === 0 && cropped.length === 0,
    `band=[${band}] buried=${buried.length} cropped=${cropped.length} cam=${JSON.stringify(cam)}`
    + ` worst=${JSON.stringify(men.map((m) => m.ndc))}`);
  await page.screenshot({ path: `${OUT}/summary-flow-ffa.png` });
  await emoteAfterRollback(page, mine, "free-for-all");
  await ctx.close();
}

/**
 * THE DEAD DO NOT JEER, and the standing are not denied. Asserted as an IF AND
 * ONLY IF, because both halves have been wrong in this codebase: the emote row
 * keys off the wire's own "dead", and on a podium the wire and the tableau
 * disagree in both directions — a man ranked second is a corpse on the wire
 * and standing on the stage, and after the server rolls the room back to the
 * lobby every corpse on screen is idle again.
 */
async function emoteCheck(page, cast, where) {
  const mine = cast.men.find((m) => m.id === cast.me);
  const offered = (await page.getByLabel(/^Emote:/).count()) > 0;
  check(`${where}: the flourish is offered exactly to the man left standing`,
    !!mine && offered === mine.standing,
    `localStanding=${mine?.standing} emoteButtons=${offered ? "shown" : "none"}`
    + ` wire=${cast.wireState}/${cast.roomState}`);
  return mine;
}

/**
 * The same question again, after the server's ten-second rollback. It is a
 * NOTE and not a check because the answer is not this module's to give: the
 * row is mounted by page.tsx off `players[me].state`, and the rollback resets
 * every man to idle — so a corpse on the stage is offered the row again. The
 * press is refused where it can be refused (render/summary.ts `canPerform`
 * vetoes the flourish itself), but the button comes back.
 */
async function emoteAfterRollback(page, mine, where) {
  await until(() => page.evaluate(() => window.__probe?.latest?.state === "lobby"),
    "the rollback", 16000).catch(() => null);
  await sleep(600);
  const offered = (await page.getByLabel(/^Emote:/).count()) > 0;
  console.log(`[flow] NOTE ${where}: after the rollback the row is `
    + `${offered ? "OFFERED" : "gone"} to a man the stage left ${mine?.standing ? "standing" : "DEAD"}`
    + ` — the button is page.tsx's, the flourish is vetoed by the stage.`);
}

/** A 2v2 WAR BAND: the winning side stands whole, the losing side lies whole. */
async function teamPhase(browser) {
  const { ctx, page } = await phone(browser);
  await raiseMoot(page, "team", { port: PORT, until, sleep });
  await until(() => page.evaluate(() => window.__probe?.matchEnd || null),
    "the war band to end", 150000);
  const early = await castNow(page);
  const mine = await emoteCheck(page, early, "war band");
  await sleep(2000);

  const { stage, men, verdict } = await tableau(page);
  const teams = await page.evaluate(() => {
    const p = window.__probe?.latest?.players ?? {};
    return Object.fromEntries(Object.values(p).map((q) => [q.id, q.team]));
  });
  const wrong = men.filter((m) => m.standing !== (teams[m.id] === verdict?.winnerTeam));
  check("the winning side stands whole and the losing side lies whole",
    men.length === 4 && wrong.length === 0 && stage?.kind === "warband",
    `cast=${men.length} winner=${verdict?.winnerTeam} misplaced=${wrong.length} kind=${stage?.kind}`);
  await page.screenshot({ path: `${OUT}/summary-flow-team.png` });
  await emoteAfterRollback(page, mine, "war band");
  await ctx.close();
}

let browser = null;
async function main() {
  // Production build only: this drives the shipped page, and a dev server's
  // compile-on-first-visit would eat the ten-second window under test.
  server = spawn("node", ["custom-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);
  const preinstalled = "/opt/pw-browsers/chromium";
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
  // THE DUEL GOES FIRST, and it is a timing test as much as a picture one: the
  // FIGHT AGAIN press has to land inside the server's ten-second window before
  // the room rolls back to the lobby. Run after two eight-man matches it does
  // not — the browser is slower by then and the window closes first, which is
  // the false failure this order exists to prevent.
  if (!only || only === "duel") await duelPhase(browser);
  if (!only || only === "ffa") await ffaPhase(browser);
  if (!only || only === "team") await teamPhase(browser);

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n[flow] ${passed}/${results.length} passed`);
  process.exitCode = passed === results.length ? 0 : 1;
}

/** The shape that already shipped: one man standing over one corpse. */
async function duelPhase(browser) {
  const { ctx, page } = await phone(browser);
  const { wires } = await raiseMoot(page, "duel", { port: PORT, until, sleep });
  console.log("[flow] fighting");
  await sleep(2500);
  const B = wires[0];
  const walker = driveIntoTheFire([B]);
  await until(() => B.me()?.state === "dead", "the fire to take him", 30000);
  clearInterval(walker);
  console.log("[flow] the opponent is dead");

  const verdict = await until(() => page.evaluate(() => window.__probe?.matchEnd || null), "the verdict", 10000);
  // The server rolls the room back to a lobby ten seconds after this instant,
  // and the press under test has to land inside that. Every step from here is
  // timed, because "the window closed" and "the button is broken" produce the
  // same failure line.
  const t0 = Date.now();
  const since = () => `${Date.now() - t0}ms`;
  const myId = await page.evaluate(() => window.__probe?.playerId);
  check("the verdict names the phone player", verdict.winnerId === myId, `winner ${verdict.winnerName}`);

  // Let the stage build and the push start.
  await sleep(1200);
  await until(() => page.evaluate(() => !!window.__summaryStage), "the stage to build", 30000);
  console.log(`[flow] stage built at ${since()}`);
  const duelEarly = await castNow(page);
  console.log(`[flow] duel cast reported at ${since()}`);
  await emoteCheck(page, duelEarly, "duel");
  console.log(`[flow] emote row read at ${since()}`);
  const overlayUp = await page.getByText("BATTLE COMPLETE", { exact: false }).first().isVisible().catch(() => false);
  const fightAgainUp = await page.getByText("FIGHT AGAIN", { exact: false }).first().isVisible().catch(() => false);
  const canvasUp = await page.evaluate(() => !!document.querySelector("canvas"));
  check("the summary overlay stands over a live canvas", overlayUp && fightAgainUp && canvasUp,
    `verdict=${overlayUp}, FIGHT AGAIN=${fightAgainUp}, canvas=${canvasUp}`);

  // ---- FIGHT AGAIN pressed EARLY, before the rollback (screenshot comes
  // after: a SwiftShader screenshot costs seconds and last run it spent the
  // whole ten-second window, so the park branch was never exercised) ----
  console.log(`[flow] overlay checks done at ${since()}`);
  const stateNow = await page.evaluate(() => window.__probe?.latest?.state);
  await page.getByText("FIGHT AGAIN", { exact: false }).first().click();
  console.log(`[flow] FIGHT AGAIN pressed at ${since()}`);
  const waitingShown = await page.getByText("MUSTERING", { exact: false }).first().isVisible().catch(() => false);
  check("pressed before the rollback, the intent parks", stateNow === "finished" && waitingShown,
    `pressed at state=${stateNow}, button shows MUSTERING`);
  await page.screenshot({ path: `${OUT}/summary-real-phone.png` });
  console.log(`[flow] wrote ${OUT}/summary-real-phone.png`);

  // The tableau itself, asserted once the timing-critical press is out of the
  // way: the podium work must not quietly stand the duel's corpse back up.
  const duelCast = await tableau(page);
  check("a duel is one man standing over one corpse",
    duelCast.men.length === 2
    && duelCast.men.filter((m) => m.standing).length === 1
    && duelCast.men.some((m) => !m.standing && m.state === "dead"),
    `kind=${duelCast.stage?.kind} standing=${duelCast.men.filter((m) => m.standing).length}`);

  await until(() => page.evaluate(() => window.__probe?.latest?.state === "lobby"), "the rollback", 14000);
  await until(() => page.evaluate(() => {
    const p = window.__probe;
    return p?.latest?.players?.[p.playerId]?.ready === true;
  }), "the parked ready to stick", 6000);
  const onLobby = await page.getByText("READY — SKAL!", { exact: false }).first().isVisible().catch(() => false);
  check("the rollback lands him in the lobby with his ready lit", onLobby, "READY — SKAL! on screen; wire says ready=true");
  await page.screenshot({ path: `${OUT}/summary-real-lobby.png` });
  await ctx.close();
}

main()
  .catch(async (e) => {
    console.error("[flow] failed:", e);
    process.exitCode = 1;
    try {
      const pages = browser?.contexts()?.flatMap((c) => c.pages()) ?? [];
      if (pages[0]) await pages[0].screenshot({ path: `${OUT}/summary-flow-failure.png` });
    } catch { }
  })
  .finally(async () => { try { await browser?.close(); } catch { } server?.kill(); setTimeout(() => process.exit(), 3000).unref(); });
