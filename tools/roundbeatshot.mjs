#!/usr/bin/env node
// ============================================================
// ROUNDBEATSHOT — what the ROUND-END BEAT actually looks like.
//
//   node tools/roundbeatshot.mjs
//   node tools/roundbeatshot.mjs --tag before   # names the frames
//
// The owner, 13 Aug 2026:
//
//   "death camera only shows when you die last, everyone should see death
//    camera for final death winner & all losers."
//
// `tools/deathcamtest.mjs` settles the arithmetic — where the lens goes, how
// long for, who outranks whom — off the real engine and the real module. It
// cannot answer whether the shot is any good to look at, and `docs/PROCESS.md`
// R5 is blunt about what that is worth: three of the four defects the owner
// reported on 8 Aug were invisible to every number in the repository and obvious
// in one PNG. This is the PNG. Sibling of `tools/lockshot.mjs` and it asserts
// nothing for the same reason.
//
// HOW IT REACHES THE CASE, which is the whole difficulty. The beat is for a man
// who is NOT the round's final death — the winner, and every loser whose own
// hold is over. A scripted browser cannot win a round without playing the game.
// It can very easily LOSE one early: a four-man blood moot, no input, and the
// bots cut the harness down in the first thirty seconds and then fight each
// other. When the last bot falls, the harness's warrior is a loser who died
// forty seconds ago, his own 3.10 s hold is long finished, and he is exactly the
// man the owner is talking about.
//
// IT PROVES IT IS IN THE BEAT rather than announcing it. Two harnesses in this
// repository were caught this week grading the landing screen while printing
// that they were in a match, so every frame here is stamped with the room state
// the client held, who the client believed fell last, and where the camera was —
// BEFORE the shutter and AFTER it, see MARKS. A frame whose stamps disagree is
// discarded and the next round's break is tried; if nothing survives, this file
// says so in capitals and photographs nothing.
//
// Frames land in art/shots/roundbeat/.
// ============================================================
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "art/shots/roundbeat");
const SEED_DIE = pathToFileURL(resolve(ROOT, "tools/seeddie.mjs")).href;
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const TAG = flag("tag", "now");
const PORT = parseInt(process.env.PORT || String(3830 + (process.pid % 30)), 10);

/**
 * Seconds into the beat each frame is asked for — the cut, and the middle of
 * the move where the lens is coming in.
 *
 * THE WALL CLOCK IS NOT THE BEAT'S CLOCK on this box. A screenshot off a
 * software rasteriser blocks the page's main thread for about three seconds,
 * and while it is blocked the game's own animation-frame loop does not run — so
 * the beat's `dt` does not accumulate either, and a mark 1.0 s into a 2.2 s beat
 * can land four seconds of wall clock after the round ended and still be 1.0 s
 * into the beat. That is why the marks are taken back to back inside ONE break
 * and why the stamps, not the clock, decide whether a frame counts.
 *
 * AND THE FRAME IS STAMPED TWICE, BEFORE AND AFTER THE SHUTTER, which is the
 * whole reason this file is trustworthy. The first cut stamped only before: it
 * printed `room="intermission" camera-mode="summary"` over a picture of two men
 * fighting in the NEXT round, because the stamp was four seconds older than the
 * pixels. That is this repository's oldest failure — a measurement answering a
 * question next to the one being asked — and a screenshot tool is not exempt
 * from it. If the beat was running when the shutter opened AND when it closed,
 * the pixels are from inside the beat; if either stamp disagrees, the frame is
 * thrown away and the next break is tried.
 */
const MARKS = [0.15, 1.0];
/** Breaks to spend before giving up on a mark. */
const TRIES = 4;

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
 * Every packet the client receives, recorded in the page. The room state is the
 * only thing that can say "this is the break", and it is the client's own copy
 * of it rather than a second connection's.
 */
const PROBE = () => {
  const w = window;
  w.__beat = { states: [], last: null, deaths: [] };
  const orig = w.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new orig(url) : new orig(url, protocols);
    ws.addEventListener("message", (e) => {
      try {
        const m = JSON.parse(e.data);
        const d = m.data || {};
        if (d.players) w.__beat.last = { ...d };
        else if (w.__beat.last) w.__beat.last = { ...w.__beat.last, ...d };
        const room = w.__beat.last;
        if (!room || !room.players) return;
        const t = performance.now();
        if (!w.__beat.was) w.__beat.was = {};
        for (const [id, p] of Object.entries(room.players)) {
          const dead = p.state === "dead";
          if (dead && w.__beat.was[id] === false) w.__beat.deaths.push({ id, t, zone: p.deathZone || "torso" });
          w.__beat.was[id] = dead;
        }
        const prev = w.__beat.states[w.__beat.states.length - 1];
        if (!prev || prev.state !== room.state) {
          w.__beat.states.push({ state: room.state, t, roundIndex: room.roundIndex || 0 });
        }
      } catch { /* not ours */ }
    });
    return ws;
  }
  // BOTH LINES, and the second one is the one that cost a run. `Object.assign`
  // carries the statics — `WebSocket.OPEN`, `CLOSED` and the rest — which
  // `transport.ts` reads to decide whether the socket is usable. Without them
  // the tap looks like a working WebSocket and the room is never created, and
  // the harness sits on a lobby screen that is never going to appear. Same
  // arrangement as `tools/touchtest.mjs`'s `TappedWS`.
  TappedWS.prototype = orig.prototype;
  Object.assign(TappedWS, orig);
  w.WebSocket = TappedWS;
};

async function main() {
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  console.log(`[roundbeatshot] starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
  server = spawn("node", ["--import", SEED_DIE, useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  watchBoot(server, "roundbeatshot");
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);

  const browser = await chromium.launch({
    headless: true,
    ...launchOptions(),
  });
  // 800x500 and not 1280x800: the shutter is the slow part on a software
  // rasteriser and the beat is 2.2 s long, so the frame has to be cheap enough
  // to land inside it. The pre/post stamps are what say whether it did.
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  page.on("pageerror", (e) => console.log(`  [page-error] ${e}`));
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });

  // A blood moot, three bots, best of three — so there IS a break to play the
  // beat in. Training is `solo` and solo has no rounds at all; an honour duel
  // would leave the harness's man as the final death himself, which is the one
  // case the beat deliberately refuses.
  // A name, because `handleCreate` refuses without one — and refuses quietly,
  // into a toast, so a harness that skipped it would sit on the landing screen
  // waiting for a lobby that was never going to arrive.
  await page.getByPlaceholder("Enter warrior name", { exact: false }).first().fill("Beadohild");
  await page.getByText("CREATE BATTLE", { exact: false }).first().click();
  await page.getByText("BLOOD MOOT", { exact: false }).first().click();
  // Five rounds, so there are four breaks to spend on two marks and the retries.
  await page.getByText("5", { exact: true }).first().click().catch(() => {});
  await page.getByText("CREATE ROOM", { exact: false }).first().click();
  const addAi = page.getByText("ADD AI", { exact: false }).first();
  await addAi.waitFor({ state: "visible", timeout: 60000 });
  for (let i = 0; i < 3; i++) { await addAi.click(); await page.waitForTimeout(400); }
  await page.getByText("START", { exact: true }).first().click();
  await page.waitForFunction(() => window.__beat?.last?.state === "fighting", null, { timeout: 120000 });
  console.log("[roundbeatshot] in a fight; waiting to be killed and then for the round to end");

  mkdirSync(OUT, { recursive: true });

  /** Everything the page can say about whether this instant is the beat. */
  const stamp = () => page.evaluate(() => {
    const b = window.__beat;
    const cam = window.__bretwaldaCamera;
    const room = b?.last;
    const me = room && room.players
      ? Object.keys(room.players).find((id) => !room.players[id].isBot && !id.startsWith("bot_"))
      : null;
    return {
      state: room ? room.state : "?",
      roundIndex: room ? room.roundIndex : -1,
      alive: room && room.players ? Object.values(room.players).filter((p) => p.state !== "dead").length : -1,
      meDead: me && room.players[me] ? room.players[me].state === "dead" : null,
      me,
      fellLast: b && b.deaths.length ? b.deaths[b.deaths.length - 1] : null,
      camMode: cam ? cam.mode : "?",
      at: performance.now(),
    };
  });
  /** The beat is running AND it is somebody else's death — not the viewer's own hold. */
  const inBeat = (s) => s.state === "intermission" && s.camMode === "summary"
    && s.meDead === true && !!s.fellLast && s.fellLast.id !== s.me;

  // EVERY MARK IS TRIED IN EVERY BREAK, rather than one mark per break. The
  // shutter blocks the page's main thread for about three seconds, and while it
  // is blocked the game's own rAF loop does not run — so the beat's clock does
  // not advance either, and the wall clock and the beat's clock come apart by
  // whole seconds. The first cut spent all four of a best-of-5's breaks on the
  // first mark and reported the second as unreachable; it was never unreachable,
  // it had simply run out of rounds. The stamps are what decide, not the clock.
  const shots = new Map();
  let seenRound = -1;
  for (let br = 0; br < TRIES && shots.size < MARKS.length; br++) {
    const armed = await page.waitForFunction((prev) => {
      const b = window.__beat;
      const room = b && b.last;
      return room && room.state === "intermission" && (room.roundIndex || 0) !== prev
        ? { deaths: b.deaths.length, round: room.roundIndex || 0 }
        : null;
    }, seenRound, { timeout: 300000, polling: 50 }).then((h) => h.jsonValue()).catch(() => null);
    if (!armed) break;
    seenRound = armed.round;
    let elapsed = 0;
    for (const mark of MARKS) {
      if (shots.has(mark)) continue;
      await page.waitForTimeout(Math.max(0, (mark - elapsed) * 1000));
      elapsed = mark;
      const before = await stamp();
      const path = resolve(OUT, `${TAG}-${String(mark).replace(".", "p")}s.png`);
      await page.screenshot({ path });
      const after = await stamp();
      const held = inBeat(before) && inBeat(after) && before.roundIndex === after.roundIndex;
      console.log(`  ${held ? "KEPT   " : "discard"}  t=${mark.toFixed(2)}s round=${armed.round}  `
        + `open: room="${before.state}" cam="${before.camMode}" fell=${before.fellLast ? before.fellLast.id.slice(0, 8) : "?"}  `
        + `close (+${Math.round(after.at - before.at)}ms of wall clock, during which the page's own loop was blocked): `
        + `room="${after.state}" cam="${after.camMode}"`);
      if (held) shots.set(mark, { mark, path, deaths: armed.deaths, before, after });
      else break;
    }
  }
  for (const mark of MARKS) {
    if (!shots.has(mark)) console.log(`  !! no frame at t=${mark.toFixed(2)}s survived ${TRIES} breaks`);
  }

  console.log("");
  for (const s of shots.values()) {
    console.log(`  BEAT    t=${s.mark.toFixed(2)}s  round=${s.before.roundIndex} alive=${s.before.alive} `
      + `viewer-is-dead=${s.before.meDead} camera-mode="${s.before.camMode}" `
      + `deaths-this-run=${s.deaths} `
      + `fell-last=${s.before.fellLast.id.slice(0, 10)} (${s.before.fellLast.zone}), and it is NOT the viewer`);
    console.log(`          ${s.path}`);
  }
  if (!shots.size) console.log("  NOTHING WAS CAPTURED INSIDE THE BEAT — do not read any file in this directory as one");
  console.log(`\n[roundbeatshot] the viewer is a LOSER who died earlier in the round — his own hold is long over,`
    + ` so what is on the lens is the round's beat and not his own death.`
    + ` camera-mode "summary" is how the rig is aimed by both cameras (GameCanvas: setSummaryShot + setMode).`);

  await ctx.close();
  await browser.close();
  server.kill();
}

main().catch((e) => { console.error(e); server?.kill(); process.exit(1); });
