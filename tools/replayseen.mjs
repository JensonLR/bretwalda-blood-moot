#!/usr/bin/env node
/**
 * REPLAYSEEN — DOES A PLAYER ACTUALLY SEE THE REPLAY, AND CAN HE SKIP IT?
 *
 *   node tools/replayseen.mjs            drive a real match in a real browser
 *   node tools/replayseen.mjs --gate     exit non-zero on a red verdict
 *   node tools/replayseen.mjs --keep     leave the server up on exit
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS, AND IT IS A PROCESS FAULT AND NOT A FEATURE REQUEST.
 *
 * `src/game/replay.mjs` shipped with `tools/replaytest.mjs` green beside it and
 * ZERO IMPORTERS anywhere in `src/`, `tools/`, `custom-server.mjs` or
 * `dev-server.mjs`. Every number that harness printed was true and none of them
 * were about the game: it drove the module directly. A player saw no replay and
 * had no skip, and the green test read as coverage.
 *
 * `deathcamtest` now greps `GameCanvas.tsx` for the import, which catches the
 * literal fault. This asks the larger question the grep cannot: with the real
 * server, the real client and a real fight, does the beat REACH THE SCREEN.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT MEASURES, AND WHY NOT SCREENSHOTS.
 *
 * There IS a browser on this box — `/opt/pw-browsers/chromium`, a symlink to
 * chromium-1194, which launches and reports 141.0.7390.37. `docs/REPLAY.md` §5
 * and `docs/BACKLOG.md` both said there was not, and that was simply wrong; it
 * is corrected in both.
 *
 * What is true is narrower and is measured rather than assumed: the shutter is
 * far too slow to photograph this beat. `npm run roundbeatshot` on this box
 * reports `+9147ms of wall clock, during which the page's own loop was blocked`
 * for ONE screenshot on the software rasteriser. The replay is 4.0 s long. A
 * frame that takes nine seconds to take cannot be taken during it, and every
 * shot that tool attempted came back stamped from a later round.
 *
 * So this harness photographs nothing. It reads the DOM and the wire, which
 * cost nothing and do not block the page's loop — and the two things the owner
 * asked for are both DOM facts:
 *
 *   "before a match ends"   the results panel must NOT be up while the last
 *                           kill is playing, and must arrive after it.
 *   "skippable at end of
 *    match, just take them
 *    to the lobby"          a SKIP must be on screen while it plays, and
 *                           pressing it must leave the arena.
 *
 * It does not and cannot say the picture is right. That needs a machine whose
 * shutter is faster than the beat, and this file says so on its verdict line
 * rather than in a footnote.
 * ---------------------------------------------------------------------------
 */
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const GATE = argv.includes("--gate");
const KEEP = argv.includes("--keep");
const PORT = parseInt(process.env.PORT || String(3890 + (process.pid % 40)), 10);
const SEED_DIE = pathToFileURL(resolve(ROOT, "tools/seeddie.mjs")).href;

const say = (s) => console.log(s);
const fails = [];
const bad = (m) => { fails.push(m); say(`    FAIL  ${m}`); };
const good = (m) => say(`    PASS  ${m}`);
const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : "  -");

let server = null;
const stop = () => { if (server && !KEEP) { try { server.kill("SIGKILL"); } catch { /* gone */ } } };
process.on("exit", stop);

async function waitForServer(url, timeoutMs = 90000) {
  const started = Date.now();
  for (;;) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ }
    if (Date.now() - started > timeoutMs) throw new Error(`server never came up at ${url}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** The wire tap. Same arrangement as roundbeatshot's, and for the same reason. */
const PROBE = () => {
  const w = window;
  w.__seen = { last: null, states: [], deaths: [] };
  const orig = w.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new orig(url) : new orig(url, protocols);
    ws.addEventListener("message", (e) => {
      try {
        const m = JSON.parse(e.data);
        const d = m.data || {};
        if (d.players) w.__seen.last = { ...d };
        else if (w.__seen.last) w.__seen.last = { ...w.__seen.last, ...d };
        const room = w.__seen.last;
        if (!room || !room.players) return;
        const t = performance.now();
        if (!w.__seen.was) w.__seen.was = {};
        for (const [id, p] of Object.entries(room.players)) {
          const dead = p.state === "dead";
          if (dead && w.__seen.was[id] === false) w.__seen.deaths.push({ id, t });
          w.__seen.was[id] = dead;
        }
        const prev = w.__seen.states[w.__seen.states.length - 1];
        if (!prev || prev.state !== room.state) w.__seen.states.push({ state: room.state, t });
      } catch { /* not ours */ }
    });
    return ws;
  }
  TappedWS.prototype = orig.prototype;
  Object.assign(TappedWS, orig);
  w.WebSocket = TappedWS;
};

/**
 * ONE SAMPLE OF WHAT IS ON SCREEN. Text, not pixels — cheap enough to poll at
 * 50 ms without blocking the page's own loop, which is the whole reason this
 * file is not a screenshot harness.
 */
const LOOK = () => {
  const w = window;
  const txt = document.body.innerText || "";
  const room = w.__seen && w.__seen.last;
  const cam = w.__bretwaldaCamera;
  return {
    at: performance.now(),
    state: room ? room.state : "?",
    roundIndex: room ? (room.roundIndex || 0) : -1,
    // The skip. Rendered only while a MATCH-ENDING replay is playing.
    skip: !!Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === "SKIP"),
    // The results panel. "FIGHT AGAIN" is its own and nothing else's — the
    // first cut of this also accepted "LEAVE", which the game screen carries
    // too, and it reported a summary that was not there.
    summary: /FIGHT AGAIN/.test(txt),
    // The break card's COUNTDOWN, which is what comes down over the arena after
    // the hold is spent. NOT "ROUND n OF m": `RoundBreak`'s beat one renders
    // that line over the LIVE arena, so matching it reported the card as
    // arriving 0.06 s into a 4.00 s hold when what had arrived was the verdict.
    breakCard: /NEXT ROUND IN/.test(txt),
    camMode: cam ? cam.mode : "?",
    // HOW MUCH BREAK THE CLIENT BELIEVES IT HAS. `page.tsx` computes the card's
    // countdown as `ceil((nextRoundAt - Date.now()) / 1000)` and `RoundBreak`'s
    // `left > 1` guard is what stops the hold outliving the break. The server
    // stamps `nextRoundAt` off `wallNow()`, which is derived from SIM time — so
    // on a box where the sim is behind the wall clock the client sees a short
    // break and covers the arena early. Measured rather than assumed, because
    // "the card came down at 1.25s" reads identically whether the guard is
    // wrong or the break really was 2.25s long from here.
    leftMs: room && room.nextRoundAt ? room.nextRoundAt - Date.now() : null,
    // The replay's own state, straight off the module. See GameCanvas.
    rp: w.__bretwaldaReplay ? { ...w.__bretwaldaReplay } : null,
  };
};

async function main() {
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  say(`  REPLAYSEEN — the replay, in the real client, against the real server.`);
  say(`  starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
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
  say(`  browser: ${browser.version()}`);
  const ctx = await browser.newContext({ viewport: { width: 800, height: 500 } });
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  page.on("pageerror", (e) => say(`  [page-error] ${e}`));
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });

  // A blood moot with bots, best of THREE: two rounds is one break to see the
  // break replay in and one match end to see the match-end replay and its skip.
  await page.getByPlaceholder("Enter warrior name", { exact: false }).first().fill("Beadohild");
  await page.getByText("CREATE BATTLE", { exact: false }).first().click();
  await page.getByText("BLOOD MOOT", { exact: false }).first().click();
  await page.getByText("3", { exact: true }).first().click().catch(() => {});
  await page.getByText("CREATE ROOM", { exact: false }).first().click();
  const addAi = page.getByText("ADD AI", { exact: false }).first();
  await addAi.waitFor({ state: "visible", timeout: 90000 });
  for (let i = 0; i < 3; i++) { await addAi.click(); await page.waitForTimeout(400); }
  await page.getByText("START", { exact: true }).first().click();
  await page.waitForFunction(() => window.__seen?.last?.state === "fighting", null, { timeout: 180000 });
  say(`  in a fight. Watching the DOM at 50 ms until the match ends.`);

  // ---- THE WATCH ----
  const track = [];
  const deadline = Date.now() + 240000;
  let sawSkip = false, endedAt = 0;
  for (;;) {
    const s = await page.evaluate(LOOK);
    track.push(s);
    if (s.skip) sawSkip = true;
    if (s.state === "finished" && !endedAt) endedAt = s.at;
    // Stop once the summary is up after the match end, or once we have watched
    // long enough after the end for the hold to be over either way.
    if (endedAt && (s.summary || s.at - endedAt > 12000)) break;
    if (Date.now() > deadline) break;
    await page.waitForTimeout(50);
  }

  // ---- WHAT THE BREAK LOOKED LIKE ----
  const inter = track.filter((s) => s.state === "intermission");
  const firstInter = inter.length ? inter[0].at : null;
  const firstCard = inter.find((s) => s.breakCard);
  const holdMs = firstInter !== null && firstCard ? firstCard.at - firstInter : null;
  const breakSeen = inter.length && inter[0].leftMs !== null ? inter[0].leftMs : null;

  // ---- AND THE MATCH END ----
  const after = endedAt ? track.filter((s) => s.at >= endedAt) : [];
  const firstSummary = after.find((s) => s.summary);
  const heldMs = endedAt && firstSummary ? firstSummary.at - endedAt : null;
  const skipFrames = after.filter((s) => s.skip).length;
  const summaryDuringSkip = after.filter((s) => s.skip && s.summary).length;

  const { REPLAY } = await import(pathToFileURL(resolve(ROOT, "src/game/replay.mjs")).href);

  say("");
  say("=".repeat(78));
  say("  WHAT A PLAYER SAW");
  say("=".repeat(78));
  say("");
  say(`    samples taken                          ${track.length} at ~50 ms`);
  say(`    the round break, arena left alone for  ${holdMs === null ? "  -   " : f2(holdMs / 1000) + "s"}   (the replay is ${f2(REPLAY.wall)}s)`);
  say(`    match end -> results panel             ${heldMs === null ? "  -   " : f2(heldMs / 1000) + "s"}`);
  say(`    frames with a SKIP on screen           ${skipFrames}`);
  say(`    frames with SKIP and the panel BOTH    ${summaryDuringSkip}`);
  say("");
  // THE ARMING DECISION'S OWN INPUTS. Printed whatever the verdict, because
  // "no replay appeared" is the same observation whether the clock never armed,
  // armed and was outranked by the viewer's own death hold, or armed over an
  // empty ring — and the first run of this file could not tell those apart.
  const rp = track.filter((s) => s.rp).map((s) => s.rp);
  const played = rp.filter((r) => r.playing).length;
  const lastRp = rp.length ? rp[rp.length - 1] : null;
  say(`    THE CLOCK ITSELF (window.__bretwaldaReplay, see GameCanvas)`);
  say(`      frames the readback was present        ${rp.length}/${track.length}`);
  say(`      frames the clock reported playing      ${played}`);
  say(`      ever ready (a fall + a full run-up)    ${rp.some((r) => r.ready)}`);
  say(`      ever outranked by your own death hold  ${rp.some((r) => r.own)}`);
  say(`      most frames the ring ever held         ${Math.max(0, ...rp.map((r) => r.frames))} of ${Math.round(REPLAY.history * REPLAY.hz)}`);
  say(`      most seconds the ring ever held        ${f2(Math.max(0, ...rp.map((r) => r.held)))}s (needs ${f2(REPLAY.pre)}s before the blow)`);
  say(`      last seen                              ${lastRp ? JSON.stringify(lastRp) : "never"}`);
  say("");

  // The break must not be covered before the replay has run. `left > 1` in
  // page.tsx can legitimately cut it short on a slow socket, so this asks for
  // most of it rather than all — and prints what it got either way.
  if (holdMs !== null) {
    say(`    the break the CLIENT saw when it began       ${breakSeen === null ? "  -   " : f2(breakSeen / 1000) + "s"} (server's ROUND_BREAK is 5.00s)`);
    if (holdMs / 1000 >= REPLAY.wall * 0.8) {
      good(`the break held the arena open ${f2(holdMs / 1000)}s for a ${f2(REPLAY.wall)}s replay`);
    } else if (breakSeen !== null && breakSeen / 1000 < REPLAY.wall + 1) {
      // The guard did its job: there was no break to hold. That is a fact about
      // this box's clock, not about the wiring, and it is not scored — but it
      // is not a pass either, so it is neither.
      say(`    NOT SCORED: the card came down after ${f2(holdMs / 1000)}s, and the client believed the`);
      say(`    whole break was only ${f2(breakSeen / 1000)}s when it started. \`left > 1\` is the guard that`);
      say(`    stops the hold outliving the break and it fired correctly. The server derives`);
      say(`    \`nextRoundAt\` from SIM time; on a box whose sim is behind the wall clock the`);
      say(`    client sees a short break. Nothing here is evidence about a 5.00s break.`);
    } else {
      bad(`the break card came down after ${f2(holdMs / 1000)}s of a ${f2(breakSeen / 1000)}s break, `
        + `over a ${f2(REPLAY.wall)}s replay`);
    }
  } else {
    say(`    NOT MEASURED: no break card was seen — the match may have ended in one round`);
  }

  // WAS THE MATCH-END REPLAY EVEN OFFERED THE LENS? `replay.mjs`'s documented
  // precedence is that the viewer's OWN death hold outranks it — "cutting off a
  // man's own collapse to watch somebody else's is the cut that module exists
  // to refuse". This harness's warrior does not fight, so he is often the last
  // man to die, and then the last kill of the match IS his own death and his own
  // hold is already showing it. That is a REFUSAL BY DESIGN and it is reported
  // as one rather than scored as a failure of the wiring — but it also means
  // this run did not exercise the replay, and the line says which happened.
  const ownAtEnd = after.some((s) => s.rp && s.rp.own);
  if (!endedAt) {
    bad(`the match never reached "finished" inside the watch, so the match-end replay was not exercised`);
  } else if (ownAtEnd && !after.some((s) => s.rp && s.rp.playing)) {
    say(`    NOT EXERCISED: the match-end replay was REFUSED because this harness's own`);
    say(`    warrior died last and his own death hold had the lens — replay.mjs's own`);
    say(`    precedence, which it states and tools/replaytest.mjs §2 drives. Nothing here`);
    say(`    is evidence about the wiring either way, and it is not scored.`);
    say(`    THE OPEN QUESTION THIS RAISES, for the owner and not for this file: the man`);
    say(`    who dies last is the commonest viewer of a match's final kill, and for him`);
    say(`    that kill is his own. He gets his hold and no slow motion. Whether the`);
    say(`    replay should outrank the hold AT MATCH END — where, unlike a round break,`);
    say(`    nothing is waiting on either — is a call about the game, not a bug.`);
  } else {
    if (sawSkip) good(`a SKIP was on screen at match end — ${skipFrames} sampled frames of it`);
    else bad(`NO SKIP was ever on screen at match end. The owner asked for one: "skippable at end of match"`);

    if (summaryDuringSkip === 0) good(`the results panel never overlapped the replay — it is held back, not raced`);
    else bad(`the results panel was up on ${summaryDuringSkip} frames while the replay was still playing`);

    if (heldMs !== null) {
      if (heldMs / 1000 >= REPLAY.wall * 0.8) {
        good(`the results panel waited ${f2(heldMs / 1000)}s after the match ended (replay is ${f2(REPLAY.wall)}s)`);
      } else {
        bad(`the results panel arrived ${f2(heldMs / 1000)}s after the match ended, inside the ${f2(REPLAY.wall)}s replay`);
      }
    } else {
      bad(`the results panel never arrived at all within the watch`);
    }
  }

  // AND THE RING, WHICH IS THE HALF THAT ONLY A BROWSER CAN CHECK. `replaytest`
  // calls `record()` itself once per simulated tick, so it can never see a
  // recorder that is being called too rarely by the client.
  const bestFrames = Math.max(0, ...rp.map((r) => r.frames));
  const want = Math.round(REPLAY.history * REPLAY.hz);
  if (bestFrames >= want * 0.8) {
    good(`the ring filled to ${bestFrames} of ${want} frames off the real wire`);
  } else {
    bad(`the ring only ever held ${bestFrames} of ${want} frames — the recorder is being called `
      + `far too rarely by the client, so a replay would be a slideshow`);
  }

  // ---- AND THE SKIP ACTUALLY LEAVES ----
  say("");
  if (sawSkip) {
    say(`    THE SKIP, PRESSED. "just take them to the lobby" — so the arena must go.`);
    // Re-run to a fresh match end would cost another two minutes; instead the
    // press is exercised on whatever is on screen now if the button is still
    // there, and reported as not exercised if the beat is already over.
    const still = await page.evaluate(LOOK);
    if (still.skip) {
      await page.getByRole("button", { name: "SKIP", exact: true }).first().click();
      await page.waitForTimeout(800);
      const gone = await page.evaluate(LOOK);
      if (!gone.skip) good(`pressing SKIP ended the beat — the button is gone and the screen moved on`);
      else bad(`pressing SKIP left the button on screen; the beat did not end`);
    } else {
      say(`    NOT EXERCISED: the beat was already over by the time the watch stopped.`);
      say(`    The button's own handler calls replay.skip() and the same leaveRoom()/setScreen`);
      say(`    pair the results panel's LEAVE uses; that path is not driven here and says so.`);
    }
  }

  say("");
  say("=".repeat(78));
  say("  VERDICT");
  say("=".repeat(78));
  say("");
  // A VERDICT THAT CANNOT SAY "GREEN" BECAUSE EVERYTHING WAS SKIPPED.
  //
  // The first cut of this printed GREEN on a run in which the replay never
  // played once: every claim had been routed to NOT SCORED or NOT EXERCISED, the
  // `fails` array was empty, and the file said "the replay reached the screen".
  // That is the same fault as a gate with the failing case filtered out, wearing
  // different clothes — see `tools/gravitytest.mjs` §2 and PROCESS.md failure
  // mode 3. A run that observed nothing must say so.
  const everPlayed = rp.some((r) => r.playing);
  if (fails.length) {
    say(`  RED — ${fails.length} finding(s):`);
    for (const f of fails) say(`    - ${f}`);
  } else if (!everPlayed) {
    say(`  NOT PROVEN — and this is not a pass.`);
    say(``);
    say(`  The replay module is live in the real client: the readback was present on`);
    say(`  ${rp.length}/${track.length} sampled frames and the ring filled to ${bestFrames}/${want} off the real wire.`);
    say(`  But the clock reported PLAYING on 0 frames, so nothing here has watched a`);
    say(`  replay run. Both reasons are printed above and both are this box, not the`);
    say(`  wiring: the sim runs far enough behind the wall clock that a 5.00s break`);
    say(`  reaches the client as ${breakSeen === null ? "under two" : f2(breakSeen / 1000)} seconds, and this harness's warrior does not`);
    say(`  fight, so he dies first or last and his own death hold outranks the beat`);
    say(`  every time. A viewer who is ALIVE when somebody else falls is the case`);
    say(`  that has not been reached, and reaching it needs a harness that fights.`);
  } else {
    say(`  GREEN — the replay ran in the real client, the results panel waited for it,`);
    say(`  and there was a skip.`);
  }
  say("");
  say(`  WHAT THIS DOES NOT SAY: anything about the PICTURE. One screenshot on this`);
  say(`  box's software rasteriser blocks the page for about nine seconds and the`);
  say(`  beat is ${f2(REPLAY.wall)}s, so it cannot be photographed here — see roundbeatshot's own`);
  say(`  discard lines. Whether the bodies look right, whether the blood spawns`);
  say(`  twice and whether the HUD runs at half speed need a faster shutter.`);
  say("");

  await browser.close();
  stop();
  process.exit(GATE && fails.length ? 1 : 0);
}

main().catch((e) => { say(`[replayseen] failed: ${e && e.stack ? e.stack : e}`); stop(); process.exit(1); });
