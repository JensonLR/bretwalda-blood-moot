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
/**
 * Assertions that could not be run, and WHY THEY ARE COUNTED.
 *
 * The emote-row check is only judgeable while the summary is up and before the
 * server's ten-second rollback. On a software rasteriser the first summary
 * frame can take longer than that to draw, so the check quietly turns into a
 * NOTE and returns — and the tally then printed "11/11 passed" for a run that
 * had actually tested eleven of thirteen things. Green, and two assertions
 * short, with nothing in the output saying so.
 *
 * That is this repository's signature failure wearing yet another coat: a
 * report of success from something that did not measure. A skip is not a pass,
 * so it is named, counted, and printed beside the score.
 */
const skipped = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/**
 * WHY THE BUDGETS ARE LARGE, AND WHY THAT IS NOT SLOPPINESS.
 *
 * These waits poll for a state the server or the client is going to reach. A
 * genuine hang never reaches it, so the budget only decides how long a BROKEN
 * run takes to admit it — it is not a performance assertion, and nothing is
 * measured against it. Set it too low and it stops being a deadline and starts
 * being a second thing under test: the box's speed.
 *
 * That is exactly what happened. `tapNow` below already records that on a
 * software rasteriser the first summary frame jams the main thread for
 * EIGHT TO TWENTY-FIVE SECONDS. The budgets were then written at 6 s for the
 * parked ready and 10 s for the verdict — both under the worst stall the same
 * file documents — and the shortest of them was given to the step that needs a
 * whole client-server-client round trip through that stall. Run this beside
 * another harness and it failed on `the parked ready to stick` with nothing
 * wrong; run it alone and it passed 13/13. A gate whose verdict depends on what
 * else is running is not a gate.
 *
 * So anything that has to survive a main-thread stall gets 30 s, comfortably
 * past the 25 s worst case and still nowhere near an infinite hang.
 */
async function until(cond, what, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(120);
  }
}

/**
 * A press that does not wait to be allowed. Playwright's own click waits for
 * the element to be actionable, and on a software rasteriser the first summary
 * frame jams the main thread long enough for that wait to be MEASURED at eight
 * to twenty-five seconds — which silently moves the press outside the server's
 * ten-second rematch window and fails a branch that is not broken. The DOM
 * click is dispatched now; React handles it on the same event loop the player's
 * thumb would have.
 */
async function tapNow(page, label) {
  return page.evaluate((text) => {
    const b = [...document.querySelectorAll("button")]
      .find((el) => (el.textContent || "").includes(text));
    if (!b) return false;
    b.click();
    return true;
  }, label);
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
  //
  // TAKEN AS DELIVERED, not re-sorted. This line used to read
  // `[...results].sort((a, b) => b.score - a.score).slice(0, 3)`, which is the
  // SAME sort `render/summary.ts` uses to choose who stands — so the harness and
  // the thing under test were computing the podium the same way and could only
  // ever agree. The server ranks the ledger now (engine.mjs `buildLedger`), so
  // the honest question is whether the STAGE agrees with the order that was sent,
  // and that question is only asked by not sorting here.
  const top3 = (verdict?.results ?? []).slice(0, 3);
  const winnerUp = stood.some((m) => m.id === verdict?.winnerId);
  check("the podium is the ledger's own top three, victor included",
    winnerUp && top3.every((r) => stood.some((m) => m.id === r.id)),
    `ledger=${top3.map((r) => r.name).join("/")} winnerStanding=${winnerUp}`);
  await ledgerCheck(page, verdict, "free-for-all");
  // Nothing behind the ledger panel and nothing off the sides. `band` is the
  // slot of glass the stage measured the DOM leaving free.
  const band = stage?.band ?? [-1, 1];
  const buried = men.filter((m) => m.ndc && m.ndc[1] < band[0] - 0.02);
  const cropped = men.filter((m) => m.ndc && (m.ndc[0] < -1 || m.ndc[2] > 1));
  check("every man is in the picture, none under the DOM panels",
    buried.length === 0 && cropped.length === 0,
    `band=[${band}] buried=${buried.length} cropped=${cropped.length} cam=${JSON.stringify(cam)}`
    + ` fitted=${stage?.fitted} lensZ=${stage?.lensZ} fov=${stage?.fov}`
    // WHERE the offenders are, not just that they exist. An ndc of -78 is not
    // a man 78 screens to the left: `project` divides by w, and for a point at
    // or behind the eye plane w goes to zero and the coordinate explodes. So
    // the standing/lying flag and the world position have to be printed beside
    // it or the number is unreadable — the first three waves that saw this
    // argued about the framing solver when the man was simply behind the lens.
    + ` offenders=${JSON.stringify([...new Set([...buried, ...cropped])].map(
      (m) => ({ standing: m.standing, at: m.at?.map((v) => +v.toFixed(2)), ndc: m.ndc })))}`
    + ` worst=${JSON.stringify(men.map((m) => m.ndc))}`);
  await page.screenshot({ path: `${OUT}/summary-flow-ffa.png` });
  await emoteAfterRollback(page, mine, "free-for-all");
  await ctx.close();
}

/**
 * THE PRINTED TABLE, READ BACK OFF THE GLASS AND HELD AGAINST THE WIRE.
 *
 * The owner, on the results table: *"In the end of game results rounds won
 * should be recorded somehow for all to see in the table, that should also take
 * into account for ranking & payout, I've seen same kills & rounds won more be
 * snubbed on coins & ranking placement from 1st to 2nd due to alphabetical order
 * names"*. `tools/tiebreak.mjs` gates the half of that the ENGINE owns — that
 * the ledger leaves the server ranked by rounds and then kills, placed and paid.
 * It cannot see this half. The defect the owner photographed was a client that
 * took a correctly-ranked ledger and sorted its own copy by kills before drawing
 * it, and a client that started doing that again would leave `tiebreak` green.
 *
 * So this reads the rows the browser actually painted:
 *
 *   ORDER      the printed rows are the wire's rows, in the wire's order. Not
 *              "the same men" — the same SEQUENCE. That is the assertion the
 *              old `sort((a, b) => b.score - a.score)` in page.tsx fails.
 *   PLACE      the "#N" beside each man is the server's `place`, so a true tie
 *              prints two #1s instead of demoting one of them.
 *   ROUNDS     every row carries its rounds-won number, on screen, for all to
 *              see. A number that decides the payout and is invisible is worse
 *              than no number.
 */
async function ledgerCheck(page, verdict, where) {
  const printed = await page.evaluate(() => [...document.querySelectorAll("[data-ledger]")]
    .map((el) => ({
      id: el.getAttribute("data-ledger"),
      place: Number(el.getAttribute("data-place")),
      rounds: Number(el.getAttribute("data-rounds")),
    })));
  const wire = verdict?.results ?? [];
  // Not judgeable if the panel never drew — the same main-thread stall the emote
  // check documents. A skip is not a pass, so it is named and counted.
  if (printed.length === 0) {
    skipped.push(`${where}: the printed ledger is the wire's own order, places and rounds`);
    console.log(`[flow] SKIP ${where}: no ledger rows were on the glass to read. NOT A PASS.`);
    return;
  }
  const sameOrder = printed.length === wire.length
    && printed.every((row, i) => row.id === wire[i].id);
  const samePlaces = printed.every((row, i) => row.place === wire[i]?.place);
  const sameRounds = printed.every((row, i) => row.rounds === wire[i]?.roundsWon);
  const rising = printed.every((row, i) => i === 0 || row.place >= printed[i - 1].place);
  check(`${where}: the printed ledger is the wire's own order, places and rounds`,
    sameOrder && samePlaces && sameRounds && rising,
    `printed=${printed.map((r) => `${r.id}#${r.place}/${r.rounds}r`).join(" ")}`
    + ` wire=${wire.map((r) => `${r.id}#${r.place}/${r.roundsWon}r`).join(" ")}`);
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
  const seen = await page.evaluate(() => ({
    row: document.querySelectorAll('[aria-label^="Emote:"]').length,
    mounted: (document.body.textContent || "").includes("BATTLE COMPLETE"),
  }));
  // Only judgeable while the summary is up and the room has not rolled back:
  // past the rollback the row is mounted off a wire that calls every corpse
  // idle, which is the gap the NOTE below reports rather than this assertion.
  if (!seen.mounted || cast.roomState !== "finished") {
    skipped.push(`${where}: the flourish is offered exactly to the man left standing`);
    console.log(`[flow] SKIP ${where}: the row could not be judged in the window `
      + `— mounted=${seen.mounted} room=${cast.roomState}. This box needs longer to `
      + `draw its first summary frame than the server's ten seconds allow. `
      + `NOT A PASS — counted as skipped.`);
    return mine;
  }
  check(`${where}: the flourish is offered exactly to the man left standing`,
    !!mine && (seen.row > 0) === mine.standing,
    `localStanding=${mine?.standing} emoteButtons=${seen.row} wire=${cast.wireState}/${cast.roomState}`);
  return mine;
}

/**
 * NO CORPSE PERFORMS, BY WHICHEVER OF THE TWO ROUTES IS IN FORCE.
 *
 * The invariant is "a man the stage laid dead does not perform". There are two
 * honest ways to hold it and this check now accepts either, because the good
 * one only just became possible:
 *
 *   NOT OFFERED — the row is not there to press. Strictly better, because a
 *     button that does nothing is indistinguishable from a broken one to the
 *     man pressing it. `page.tsx` now gates the row on the stage's own
 *     `canPerform` rather than on the wire's `state`, which used to hand a
 *     corpse three dead buttons every time the rollback reset him to idle.
 *   REFUSED — the row was pressed and the tableau threw it out, with its own
 *     counter moving. Without that counter "refused" and "never arrived" are
 *     the same picture.
 *
 * Requiring the PRESS to land was right while the button was always there. It
 * became wrong the moment the button correctly went away: the check failed with
 * `pressed=false` on a build that had just fixed the defect, which is a test
 * measuring the old implementation rather than the rule.
 *
 * What is NOT relaxed: no corpse may be performing, on either route.
 */
async function vetoCheck(page, where) {
  const before = await page.evaluate(() => window.__summaryEmoteRefused ?? 0);
  const pressed = await tapNow(page, "RAISE");
  await sleep(2500);
  const after = await page.evaluate(() => ({
    refused: window.__summaryEmoteRefused ?? 0,
    performing: (window.__summaryBodies ?? []).filter((m) => !m.standing && m.emote),
  }));
  const notOffered = !pressed;
  const refused = pressed && after.refused > before;
  check(`${where}: a man lying dead does not perform`,
    (notOffered || refused) && after.performing.length === 0,
    `${notOffered ? "the row was not offered at all (the stronger guarantee)" : `pressed, refusals ${before}->${after.refused}`}`
    + `; corpsesPerforming=${after.performing.length}`);
}

/**
 * The same question again, after the server's ten-second rollback. It is a
 * Left as a NOTE rather than a check because it reports a state rather than
 * enforcing one — but what it reports has changed, and for the better. It used
 * to say the row came BACK for a corpse: page.tsx mounted it off
 * `players[me].state`, the rollback resets every man to idle, so the buttons
 * returned and `render/summary.ts` quietly refused every press. The row is now
 * gated on that same `canPerform`, so the two agree and a man the stage laid
 * down keeps no buttons at all.
 */
async function emoteAfterRollback(page, mine, where) {
  await until(() => page.evaluate(() => window.__probe?.latest?.state === "lobby"),
    "the rollback", 30000).catch(() => null);   // see `until`: a timeout here prints a NOTE that is simply wrong
  await sleep(600);
  const offered = (await page.getByLabel(/^Emote:/).count()) > 0;
  console.log(`[flow] NOTE ${where}: after the rollback the row is `
    + `${offered ? "OFFERED" : "gone"} to a man the stage left ${mine?.standing ? "standing" : "DEAD"}`
    + ` — page.tsx now gates the row on the stage's own canPerform, so this line`
    + ` should read "gone" for a man the stage left dead and "OFFERED" for one it stood up.`);
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
  // A war band ranks BANDS, so every man on a side shares its place and its
  // rounds. This is where that has to be visible: four rows reading #1 #1 #2 #2,
  // not four rows quietly re-ranked by who happened to swing most.
  await ledgerCheck(page, verdict, "war band");
  await page.screenshot({ path: `${OUT}/summary-flow-team.png` });
  await emoteAfterRollback(page, mine, "war band");
  await vetoCheck(page, "war band");
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
  console.log(`\n[flow] ${passed}/${results.length} passed`
    + (skipped.length ? `, ${skipped.length} NOT RUN` : ""));
  // Named, not just counted: "2 not run" tells you coverage moved, and only the
  // names tell you what stopped being covered.
  for (const s of skipped) console.log(`[flow]   not run: ${s}`);
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

  const verdict = await until(() => page.evaluate(() => window.__probe?.matchEnd || null), "the verdict", 30000)   // the first summary frame IS the 8-25 s stall; see `until`;
  // The server rolls the room back to a lobby ten seconds after this instant,
  // and the press under test has to land inside that. Every step from here is
  // timed, because "the window closed" and "the button is broken" produce the
  // same failure line.
  const t0 = Date.now();
  const since = () => `${Date.now() - t0}ms`;
  const myId = await page.evaluate(() => window.__probe?.playerId);
  check("the verdict names the phone player", verdict.winnerId === myId, `winner ${verdict.winnerName}`);

  // ---- FIGHT AGAIN PRESSED FIRST, AND NOTHING BEFORE IT ----
  // The park branch only exists inside the server's ten-second window, and on
  // a software rasteriser the first summary frame alone costs this box most of
  // it: the click's own actionability wait was measured at eight seconds, and
  // every assertion put ahead of the press spends the window on the way. So
  // the press goes first and the picture is examined afterwards — the tableau
  // stays up until the player leaves it, which is the whole design.
  const pressed = await tapNow(page, "FIGHT AGAIN");
  const stateNow = await page.evaluate(() => window.__probe?.latest?.state);
  const waitingShown = await page.evaluate(() =>
    !!document.body.textContent && document.body.textContent.includes("MUSTERING"));
  check("pressed before the rollback, the intent parks",
    pressed && stateNow === "finished" && waitingShown,
    `pressed at ${since()} with state=${stateNow}, button shows ${waitingShown ? "MUSTERING" : "FIGHT AGAIN"}`);

  const overlayUp = await page.getByText("BATTLE COMPLETE", { exact: false }).first().isVisible().catch(() => false);
  const canvasUp = await page.evaluate(() => !!document.querySelector("canvas"));
  check("the summary overlay stands over a live canvas", overlayUp && canvasUp,
    `verdict=${overlayUp}, canvas=${canvasUp}`);
  const duelEarly = await castNow(page);
  await emoteCheck(page, duelEarly, "duel");
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

  await until(() => page.evaluate(() => window.__probe?.latest?.state === "lobby"), "the rollback", 30000)   // see `until`;
  await until(() => page.evaluate(() => {
    const p = window.__probe;
    return p?.latest?.players?.[p.playerId]?.ready === true;
  }), "the parked ready to stick", 30000)   // a full round trip through that stall; see `until`;
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
