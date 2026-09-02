#!/usr/bin/env node
/**
 * REPLAYSHOT — THE MATCH-END REPLAY, PHOTOGRAPHED, FOR THE MAN WHO DIED.
 *
 *   node tools/replayshot.mjs               both cases
 *   node tools/replayshot.mjs --case=last   the man whose death ENDS the match
 *   node tools/replayshot.mjs --case=held   a man whose own death hold is running
 *   node tools/replayshot.mjs --gate        exit non-zero on a red verdict
 *   node tools/replayshot.mjs --keep        leave the server up on exit
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS BESIDE `replayseen`.
 *
 * `replayseen` reads the DOM and the wire and says, in its own words, "it does
 * not and cannot say the picture is right", on the grounds that "one screenshot
 * on this box's software rasteriser blocks the page for about nine seconds and
 * the beat is 4.0 s".
 *
 * THAT REASON IS WRONG, AND IT IS WRONG IN A WAY THAT IS READ OFF THE CLIENT
 * RATHER THAN ARGUED. `GameCanvas.tsx`:
 *
 *     const rawDt = Math.min((time - (lastTimeRef.current || time)) / 1000, 0.05);
 *
 * The frame clock is CLAMPED AT 0.05 s. `createKillReplay` spends `dt` out of
 * `REPLAY.wall`, so a frame that took nine seconds of wall clock costs the beat
 * one-twentieth of a second of it — the same as any other slow frame. A
 * nine-second shutter does not skip the replay; it costs it 1/80th of its
 * length. The beat CAN be photographed here, and this file photographs it.
 *
 * (What is still true is that the shot is expensive, so this takes a handful of
 * frames and not a film.)
 *
 * ---------------------------------------------------------------------------
 * THE TWO CASES, AND WHY THE SECOND ONE HAD TO BE FORCED.
 *
 * The question is HOW LONG BEFORE THE ROOM ENDED THE VIEWER DIED, because that
 * is what decides whether his own death hold is running on the `finished` edge
 * — and that is the axis `replaytest` §4 gates.
 *
 *   `last`  gap 0. A duel: the viewer stands still, the bot kills him, and
 *           `checkRoundEnd` ends the match in the same tick. His hold has not
 *           armed on the previous frame, so `own` was false even on the shipped
 *           build. THIS CASE ALWAYS WORKED, which is worth photographing
 *           precisely because a refutation said it did not.
 *
 *   `held`  gap ~1.2 s, and it cannot be got at by playing normally: it needs
 *           the viewer to die and the match to end a chosen interval later. So
 *           a SECOND HUMAN closes his tab. `disconnectSession` in `engine.mjs`
 *           calls `checkRoundEnd(room)` on a dropped socket — the real server
 *           path for a man whose connection went — and with the viewer already
 *           dead that leaves one man alive and ends the match on that tick.
 *           Nothing here is stubbed: real server, real client, real death, and
 *           the only thing chosen is WHEN the last man stops being there.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT COUNTS. `window.__bretwaldaReplay.drawn` is a counter incremented in
 * `GameCanvas`'s frame loop on every frame it draws a replayed pose. A DOM poll
 * cannot count frames — it samples at 50 ms while the beat runs at whatever the
 * box renders — and "did he see the replay" is a question about frames.
 */
import { spawn } from "child_process";
import { existsSync, mkdirSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";
import { WebSocket } from "ws";
// The beat's own length, so the observability floor is stated against the thing
// under test rather than against a number copied into this file.
import { REPLAY } from "../src/game/replay.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const argOf = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const CASES = (argOf("case", "last,held")).split(",").map((s) => s.trim());
const GATE = argv.includes("--gate");
const KEEP = argv.includes("--keep");
const PORT = parseInt(process.env.PORT || String(3940 + (process.pid % 40)), 10);
const SEED_DIE = pathToFileURL(resolve(ROOT, "tools/seeddie.mjs")).href;
/** Seconds between the viewer's death and the match ending, in the `held` case. */
const HOLD_GAP = parseFloat(argOf("gap", "1.2"));
/** Shots of the beat itself. One, and the comment at the loop says why. */
const MAX_SHOTS = parseInt(argOf("shots", "1"), 10);
/** `SUMMARY_HOLD` in engine.mjs — the room is a lobby again this long after. */
const SUMMARY_HOLD = 10;
/** Seconds of beat to let run before the press pass reaches for the button. */
const PRESS_AFTER = parseFloat(argOf("press-after", "1.5"));
/**
 * THE WINDOW, AND IT IS A PERFORMANCE KNOB AND NOT A TASTE. This box rasterises
 * in software; the page is pixel-bound, and the arena with three men in it came
 * back at about half a frame a second at 900x560 — the ring took 12 recorded
 * frames in 24.19 s, against the server's 20 Hz. Smaller is the difference
 * between watching the beat and watching a slideshow of the room it was in.
 */
const VIEW = (() => { const [w, h] = argOf("viewport", "640x400").split("x").map(Number);
  return { w: w || 640, h: h || 400 }; })();
/**
 * THE OBSERVABILITY FLOOR. `record()` is called once per RENDER, so the rate the
 * ring fills at IS the client's frame rate measured against the server's own
 * clock. Below a quarter of the server's 20 Hz this page is not drawing the
 * game, and a run that saw no replay saw nothing at all — which must be said,
 * not scored. It is a fact about the OBSERVER and is read off `frames / held`
 * before the result is looked at.
 */
const MIN_RING_HZ_DEFAULT = 5;
/**
 * And it is OVERRIDABLE, so the excuse can be audited rather than trusted.
 * `--floor=0` turns the whole "a starved observer cannot support a negative"
 * rule off and scores every assertion, which is how you check that the rule is
 * excusing the OBSERVER and not the GAME: run it once each way and the findings
 * must be the same list, moved between "NOT JUDGED" and "RED".
 */
const MIN_RING_HZ = (() => {
  const v = argOf("floor", null);
  return v === null ? MIN_RING_HZ_DEFAULT : Number(v);
})();
const SHOTS = resolve(ROOT, ".replay/shots");

const say = (s) => console.log(s);
const fails = [];
const bad = (m) => { fails.push(m); say(`    FAIL  ${m}`); };
const good = (m) => say(`    PASS  ${m}`);
const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : "  -");

let server = null;
const stop = () => { if (server && !KEEP) { try { server.kill("SIGKILL"); } catch { /* gone */ } } };
process.on("exit", stop);

async function waitForServer(url, timeoutMs = 120000) {
  const started = Date.now();
  for (;;) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not yet */ }
    if (Date.now() - started > timeoutMs) throw new Error(`server never came up at ${url}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** The wire tap. Same arrangement as replayseen's, plus WHO THIS TAB IS. */
const PROBE = () => {
  const w = window;
  w.__seen = { last: null, me: null, deaths: [], finishedAt: null, was: {} };
  const orig = w.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new orig(url) : new orig(url, protocols);
    ws.addEventListener("message", (e) => {
      try {
        const m = JSON.parse(e.data);
        const d = m.data || {};
        if (m.type === "join" && d.playerId) w.__seen.me = d.playerId;
        if (d.players) w.__seen.last = { ...d };
        else if (w.__seen.last) w.__seen.last = { ...w.__seen.last, ...d };
        const room = w.__seen.last;
        if (!room || !room.players) return;
        const t = performance.now();
        for (const [id, p] of Object.entries(room.players)) {
          const dead = p.state === "dead";
          if (dead && w.__seen.was[id] === false) w.__seen.deaths.push({ id, t });
          w.__seen.was[id] = dead;
        }
        if (room.state === "finished" && w.__seen.finishedAt === null) w.__seen.finishedAt = t;
      } catch { /* not ours */ }
    });
    return ws;
  }
  TappedWS.prototype = orig.prototype;
  Object.assign(TappedWS, orig);
  w.WebSocket = TappedWS;

  // THE REPLAY CLOCK, SAMPLED IN THE PAGE AND NOT OVER THE WIRE. A round trip
  // from node into this page costs the better part of a second on a rasteriser
  // this slow, so an outside poll can miss a beat entirely and report "0
  // frames" for a beat that ran. This runs inside the page at 100 ms and keeps
  // the arming decision's own inputs, which is what a `0` has to be explained
  // by. Bounded so a long match cannot grow it without limit.
  w.__rpTrack = [];
  setInterval(() => {
    const r = w.__bretwaldaReplay;
    if (!r) return;
    const t = w.__rpTrack;
    if (t.length < 4000) t.push({ at: performance.now(), playing: r.playing, atEnd: r.atEnd,
      drawn: r.drawn, ready: r.ready, own: r.own, state: r.state, frames: r.frames,
      held: r.held, elapsed: r.elapsed });
  }, 100);
};

/** One sample of what is on screen. Text, not pixels — cheap. */
const LOOK = () => {
  const w = window;
  const txt = document.body.innerText || "";
  const room = w.__seen && w.__seen.last;
  const mine = room && w.__seen.me ? room.players[w.__seen.me] : null;
  return {
    at: performance.now(),
    state: room ? room.state : "?",
    me: w.__seen ? w.__seen.me : null,
    dead: mine ? mine.state === "dead" : false,
    alive: room ? Object.values(room.players).filter((p) => p.state !== "dead").length : -1,
    myDeathAt: (w.__seen && w.__seen.me
      ? (w.__seen.deaths.find((x) => x.id === w.__seen.me) || {}).t : null) ?? null,
    finishedAt: w.__seen ? w.__seen.finishedAt : null,
    skip: !!Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").trim() === "SKIP"),
    summary: /FIGHT AGAIN/.test(txt),
    landing: /CREATE BATTLE/.test(txt),
    rp: w.__bretwaldaReplay ? { ...w.__bretwaldaReplay } : null,
  };
};

/**
 * A WARRIOR MADE OF A SOCKET. Joins the room, picks a class, readies, and — once
 * the fight is on — walks at a named man and swings at him. Everything he sends
 * is the wire the browser sends; nothing here reaches into the engine.
 */
function wireWarrior(code, name) {
  const NEUTRAL = { moveX: 0, moveZ: 0, rotationY: 0, sprint: false, attack: false,
    heavyAttack: false, block: false, dodge: false, crouch: false, ability: false,
    shove: false, attackDir: "right" };
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const me = { id: null, room: null, target: null, timer: null };
  const send = (type, data) => { try { ws.send(JSON.stringify({ type, data: data || {} })); } catch { /* gone */ } };
  ws.on("open", () => {
    send("join", { code, name });
    setTimeout(() => { send("select_class", { warriorClass: "berserker" }); send("ready", {}); }, 400);
  });
  ws.on("message", (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    const d = m.data || {};
    if (m.type === "join" && d.playerId) me.id = d.playerId;
    if (d.players) me.room = d;
  });
  ws.on("error", () => { /* the close is what matters */ });
  /** Steer at `targetId` and swing, on a beat faster than the server's tick. */
  me.attack = (targetId) => {
    me.target = targetId;
    if (me.timer) return;
    me.timer = setInterval(() => {
      const r = me.room;
      if (!r || !me.id) return;
      if (r.state !== "fighting" && r.state !== "last_stand") return;
      const a = r.players[me.id], b = r.players[me.target];
      if (!a || !b || a.state === "dead") return;
      const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
      const d = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, dz);
      const ready = a.state === "idle" || a.state === "walking";
      if (d > 1.5) send("input", { ...NEUTRAL, moveX: dx / d, moveZ: dz / d, rotationY: yaw });
      else send("input", { ...NEUTRAL, rotationY: yaw, heavyAttack: ready });
    }, 50);
  };
  me.stop = () => { if (me.timer) { clearInterval(me.timer); me.timer = null; } };
  /**
   * THE MAN WHO STOPS BEING THERE. `{"type":"leave"}` is `disconnectSession`
   * on the wire — the same door a dropped socket comes through — and it calls
   * `checkRoundEnd(room)`, which with the viewer already dead leaves one man
   * alive and ends the match on that tick. Sent as a MESSAGE and not as a
   * socket teardown because the teardown was not reliably reaching the server
   * from here: one run sat 240 s waiting for a "finished" that never came.
   */
  me.close = async () => {
    me.stop();
    send("leave", {});
    await new Promise((r) => setTimeout(r, 400));
    try { ws.close(); } catch { /* gone */ }
    await new Promise((r) => setTimeout(r, 200));
  };
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const poll = setInterval(() => {
      if (me.id && me.room) { clearInterval(poll); resolve(me); }
      else if (Date.now() - t0 > 30000) { clearInterval(poll); reject(new Error(`${name} never joined ${code}`)); }
    }, 200);
  });
}

/**
 * A TAB IN ITS OWN CONTEXT. Two tabs of one context share localStorage, and
 * `page.tsx` keeps the warrior's identity there — so the second human was
 * arriving wearing the first one's, and the server's `start` handler refused on
 * `room.hostId !== player.id` with every man ready and the click landing. One
 * context per warrior is what two warriors on two machines actually is.
 */
async function newTab(browser, name) {
  const tabCtx = await browser.newContext({ viewport: { width: VIEW.w, height: VIEW.h } });
  await tabCtx.addInitScript(PROBE);
  const page = await tabCtx.newPage();
  page.setDefaultTimeout(180000);
  page.on("pageerror", (e) => say(`  [page-error ${name}] ${e}`));
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Enter warrior name", { exact: false }).first().fill(name);
  return page;
}

/**
 * ONE CASE, PLAYED AND PHOTOGRAPHED.
 * @param kind "last" or "held"
 */
async function playCase(browser, kind, pass) {
  say("");
  say("=".repeat(78));
  say(`  CASE ${kind === "last" ? "`last` — THE MAN WHOSE DEATH ENDS THE MATCH (gap 0)"
    : "`held` — A MAN WHOSE OWN DEATH HOLD IS RUNNING"}`
    + `   [${pass === "shoot" ? "PHOTOGRAPH" : "PRESS THE SKIP"}]`);
  say("=".repeat(78));

  const A = await newTab(browser, kind === "last" ? "Beadohild" : "Eadgyth");
  await A.getByText("CREATE BATTLE", { exact: false }).first().click();
  await A.getByText("BLOOD MOOT", { exact: false }).first().click();
  // ONE ROUND. `myDeathAt` is the FIRST time this man went down, so a best-of-3
  // reports the gap across a whole round break: the first run of this file said
  // "died 10.66s before the end" for what is a gap-0 case, because he had died
  // in round one as well. One round makes the gap the thing it is named after.
  await A.getByRole("group", { name: "Rounds in the match" }).getByText("1", { exact: true }).first().click();
  await A.getByText("CREATE ROOM", { exact: false }).first().click();
  const addAi = A.getByText("ADD AI", { exact: false }).first();
  await addAi.waitFor({ state: "visible", timeout: 120000 });
  await addAi.click();
  await A.waitForTimeout(400);

  // THE SECOND WARRIOR, AND HE IS A SOCKET AND NOT A SECOND TAB.
  //
  // He was a second Chromium context first, and that did not work: two WebGL
  // arenas on this box's software rasteriser pegged the machine, and the HOST's
  // page stopped processing input — the run sat in the lobby with `ready`
  // "000" while every READY and START click was delivered and dropped. The
  // second man does not need a picture. `Wulfstan` is a raw `/ws` client
  // speaking the same wire the browser speaks, which is what the server sees
  // either way, and it costs nothing to draw.
  //
  // He also does the killing, which is the other half of why this is not a bot:
  // a bot picks its own target, and half the runs would have it kill HIM and
  // hand back the gap-0 case. He steers at the viewer and swings, so the man
  // who dies is the man this case is about, every time.
  let B = null;
  if (kind === "held") {
    const code = await A.evaluate(() => (window.__seen?.last?.code) || null);
    if (!code) throw new Error("no room code on the wire");
    B = await wireWarrior(code, "Wulfstan");
    await A.waitForTimeout(800);
  }

  await A.bringToFront();
  // THE HOST HAS TO BE READY TOO. Measured, not guessed: with a second human in
  // the room the first attempt sat in the lobby with `ready` = "011" — the host
  // was the unready man. With bots alone the room started without it.
  await A.getByText("READY UP", { exact: false }).first().click().catch(() => {});
  await A.waitForTimeout(500);
  {
    // START, PRESSED UNTIL IT TAKES. With a second human in the room the server
    // has more reasons to refuse than with bots alone, and a single click that
    // was refused reads exactly like a click that was never delivered. So it is
    // pressed on a beat and the room's own state is printed while it is refused,
    // which is what the first run of the `held` case needed and did not have.
    const t0 = Date.now();
    for (;;) {
      const st = await A.evaluate(() => {
        const r = window.__seen?.last;
        return r ? { state: r.state, n: Object.keys(r.players || {}).length,
          ready: Object.values(r.players || {}).map((p) => (p.ready ? 1 : 0)).join("") } : null;
      });
      // ANY STATE PAST THE LOBBY MEANS IT TOOK. Not `=== "fighting"`: a click
      // costs seconds on this box, and an earlier draft polled so coarsely that
      // it stepped over `countdown` and `fighting` together, found the room
      // already `finished`, and went on pressing START at a match that was over.
      if (st && st.state !== "lobby") break;
      if (Date.now() - t0 > 180000) throw new Error(`the room never left the lobby: ${JSON.stringify(st)}`);
      let why = "";
      try { await A.getByRole("button", { name: "START", exact: false }).first().click({ timeout: 4000 }); }
      catch (e) { why = ` — the START button would not take a click: ${String(e).split("\n")[0]}`; }
      if ((Date.now() - t0) % 9000 < 1400) say(`    waiting to start: ${JSON.stringify(st)}${why}`);
      await A.waitForTimeout(800);
    }
  }
  say(`    in a fight — ${kind === "last" ? "one bot, a duel" : "one bot and Wulfstan on a socket"}. `
    + `The viewer does not move.`);
  if (B) {
    const meId = await A.evaluate(() => window.__seen?.me || null);
    if (!meId) throw new Error("the viewer never learned his own id");
    B.attack(meId);
    say(`    Wulfstan is going for the viewer, and nothing else decides who dies first.`);
  }

  // ---- WAIT FOR THE VIEWER TO DIE ----
  await A.waitForFunction(() => {
    const w = window; const r = w.__seen?.last;
    return !!(r && w.__seen.me && r.players[w.__seen.me]?.state === "dead");
  }, null, { timeout: 240000 });
  const died = await A.evaluate(LOOK);
  say(`    the viewer is down at t+${f2(died.at / 1000)}s; ${died.alive} man/men still alive.`);

  // ---- AND MAKE THE MATCH END, IF IT HAS NOT ----
  if (kind === "held") {
    if (died.state === "finished") {
      say(`    NOT EXERCISED: the room was already "finished" when the viewer died, so this`);
      say(`    run drew the gap-0 case and not this one — the bot got to Wulfstan first.`);
      await A.close(); if (B) await B.close();
      return { kind, pass, skipped: true };
    }
    await A.waitForTimeout(HOLD_GAP * 1000);
    // THE REAL SERVER PATH: a socket that went. `disconnectSession` calls
    // `checkRoundEnd`, which with the viewer already dead leaves one man alive.
    await B.close();
    B = null;
    say(`    Wulfstan has left the moot ${f2(HOLD_GAP)}s after the viewer went down.`);
  }
  // WAIT ON THE TAP'S RECORD OF THE EDGE, NOT ON THE LIVE STATE. `finishedAt` is
  // stamped by the WebSocket listener the first time a packet says "finished",
  // and it never un-stamps. The live state does: `endMatch` gives the room ten
  // seconds and then rolls it back to a lobby, and on this box a page that is
  // rendering at about one frame a second can be past the whole window before
  // the outside poll gets an answer — one run reported `state=lobby alive=2`
  // and called the match-end edge missing when it had been and gone.
  await A.waitForFunction(() => (window.__seen?.finishedAt ?? null) !== null, null, { timeout: 120000 })
    .catch(async () => {
      const st = await A.evaluate(LOOK);
      throw new Error(`the room never said "finished" after the leave: `
        + `state=${st.state} alive=${st.alive}`);
    });

  // ---- WHAT HE SEES ----
  // ONE SHOT, AND THE BUDGET IT COMES OUT OF IS THE SERVER'S, NOT THE CLIENT'S.
  //
  // The client survives a slow shutter: `rawDt` is clamped at 0.05 s, so a
  // nine-second frame costs the 4.0 s beat a twentieth of a second. THE ROOM
  // DOES NOT. `endMatch` sets `phaseAt = simMs + SUMMARY_HOLD * 1000` and
  // SUMMARY_HOLD is 10 s, after which the room is a lobby again, `ended` goes
  // false and `replay.mjs` drops the beat. The first run of this file took
  // three shots at ~9 s each, the room rolled over underneath them, and the
  // replay ended 0.28 s in with the results panel coming up behind it. That is
  // a real budget and it is measured here rather than discovered again: ONE
  // shot of the beat, then the SKIP, inside ten seconds of wall clock.
  mkdirSync(SHOTS, { recursive: true });
  const track = [];
  const shots = [];
  const deadline = Date.now() + 90000;
  const beatStarted = Date.now();
  let firstPlayAt = null;
  for (;;) {
    const s = await A.evaluate(LOOK);
    track.push(s);
    if (s.rp && s.rp.playing && firstPlayAt === null) firstPlayAt = Date.now();
    if (pass === "shoot" && s.rp && s.rp.playing && shots.length < MAX_SHOTS) {
      const f = resolve(SHOTS, `${kind}-replay-${shots.length + 1}.png`);
      const t0 = Date.now();
      await A.screenshot({ path: f });
      shots.push({ f, elapsed: s.rp.elapsed, drawn: s.rp.drawn, skip: s.skip, summary: s.summary });
      say(`    SHOT ${f}`);
      say(`         ${f2(s.rp.elapsed)}s into the beat, ${s.rp.drawn} frames drawn, `
        + `SKIP ${s.skip ? "ON" : "off"} screen, results panel ${s.summary ? "UP" : "held back"}`);
      say(`         the shutter took ${f2((Date.now() - t0) / 1000)}s of wall clock`);
      break;
    }
    // THE PRESS PASS TAKES NO PICTURES, AND THAT IS THE POINT. One shot costs
    // more than twenty seconds of wall clock on this box's rasteriser, and
    // `endMatch` gives the room `SUMMARY_HOLD` = 10 s in "finished" before it
    // rolls back to a lobby — at which point `ended` goes false and the beat is
    // dropped, SKIP and all. So the beat is photographed in one match and the
    // button is pressed in another, and neither is asked to fit in the other's
    // budget. Measured, not assumed: the first run of this pair reported a
    // 24.11 s shutter and then "the SKIP was gone before it could be pressed".
    if (pass === "press" && s.rp && s.rp.playing && s.skip
      && Date.now() - firstPlayAt > PRESS_AFTER * 1000) break;
    if (s.summary || s.landing) break;
    if (Date.now() > deadline) break;
    await A.waitForTimeout(50);
  }
  const spent = (Date.now() - beatStarted) / 1000;

  const gapMs = died.myDeathAt !== null && track[0]?.finishedAt !== null
    ? track[0].finishedAt - died.myDeathAt : null;
  // The in-page samples, which are the ones that cannot be outrun.
  const rp = await A.evaluate(() => window.__rpTrack || []);
  const drawn = Math.max(0, ...rp.map((r) => r.drawn || 0));
  const skipFrames = track.filter((s) => s.skip).length;
  const bothUp = track.filter((s) => s.skip && s.summary).length;
  const ownEver = rp.some((r) => r.own);
  const played = rp.filter((r) => r.playing).length;
  const atEdge = rp.find((r) => r.state === "finished") || null;
  const lastRp = rp.length ? rp[rp.length - 1] : null;

  say("");
  say(`    gap: the viewer died ${gapMs === null ? "  -   " : f2(gapMs / 1000) + "s"} before the room said "finished"`);
  say(`    his own death hold was running at some sample   ${ownEver}`);
  say(`    REPLAY FRAMES DRAWN by this client              ${drawn}`);
  say(`    samples with a SKIP on screen                   ${skipFrames}`);
  say(`    samples with SKIP and the results panel BOTH    ${bothUp}`);
  say(`    screenshots taken during the beat               ${shots.length}`);
  say(`    wall clock spent between the beat and the skip  ${f2(spent)}s of ${f2(SUMMARY_HOLD)}s`);
  say("");
  say(`    THE CLOCK ITSELF, sampled inside the page at 100 ms (${rp.length} samples):`);
  say(`      samples the clock reported playing            ${played}`);
  say(`      the first sample the room said "finished"     ${atEdge ? JSON.stringify(atEdge) : "never seen"}`);
  say(`      the last sample of all                        ${lastRp ? JSON.stringify(lastRp) : "never"}`);

  // ---- AND THE SKIP ACTUALLY LEAVES ----
  let leftTo = null, skipShot = null;
  if (pass === "press") {
    const still = await A.evaluate(LOOK);
    if (still.skip) {
      const beforeDrawn = still.rp ? still.rp.drawn : 0;
      // A SHORT TIMEOUT AND A CAUGHT FAILURE. The button belongs to a beat that
      // is ending: on a page drawing at half a frame a second the element can
      // detach between the sample that saw it and the click that reaches for
      // it, and Playwright will retry that for its full timeout and then take
      // the whole run down with it. A skip that could not be pressed is a
      // finding, not a crash.
      let pressErr = null;
      try { await A.getByRole("button", { name: "SKIP", exact: true }).first().click({ timeout: 8000 }); }
      catch (e) { pressErr = String(e).split("\n")[0]; }
      await A.waitForTimeout(1200);
      if (pressErr) say(`    the SKIP went before the press landed: ${pressErr}`);
      const after = await A.evaluate(LOOK);
      leftTo = after.landing ? "landing" : after.summary ? "results" : after.state;
      skipShot = resolve(SHOTS, `${kind}-after-skip.png`);
      await A.screenshot({ path: skipShot });
      say(`    pressed SKIP ${f2(still.rp ? still.rp.elapsed : 0)}s in, after ${beforeDrawn} drawn frames`);
      say(`    SHOT ${skipShot}   (what he is looking at now: ${leftTo})`);
    }
  }

  // THE OBSERVER, CHECKED BEFORE THE RESULT. See MIN_RING_HZ.
  const ringHz = lastRp && lastRp.held > 1 ? lastRp.frames / lastRp.held : null;
  say(`      the ring filled at                            `
    + `${ringHz === null ? "  -  " : f2(ringHz) + " Hz"} against the server's 20 Hz`);
  // AND IT ONLY EXCUSES A ZERO. A slow observer cannot invalidate what it DID
  // see: a run that drew replay frames, or caught a SKIP on screen, has watched
  // the beat and is scored however slowly it got there. It is a negative that a
  // starved page cannot support, and only that.
  const sawNothing = drawn === 0 && skipFrames === 0 && played === 0;
  if (sawNothing && ringHz !== null && ringHz < MIN_RING_HZ) {
    say("");
    say(`    NOT OBSERVABLE, AND NOT SCORED. The recorder is called once per rendered`);
    say(`    frame, so ${f2(ringHz)} Hz is this page's frame rate: it drew about one frame every`);
    say(`    ${f2(1 / ringHz)}s, and the whole match-end window is ${f2(SUMMARY_HOLD)}s. Nothing about the beat can`);
    say(`    be concluded from a page that is not drawing the game — not that it ran and`);
    say(`    not that it did not. \`tools/replaytest.mjs\` §4 is where this case is gated:`);
    say(`    it drives the real createDeathCamera beside the real clock in GameCanvas's`);
    say(`    order and sweeps the gap. Try a smaller --viewport, or a box with a GPU.`);
    say("");
    await A.close();
    if (B) await B.close();
    return { kind, pass, gapMs, drawn, skipFrames, notObservable: true, ringHz, shots: [] };
  }

  // A STARVED OBSERVER CANNOT SUPPORT A NEGATIVE, AND THAT IS EVERY NEGATIVE.
  //
  // The rule was already written four lines above — "It is a negative that a
  // starved page cannot support, and only that" — and then applied to exactly
  // one negative: the all-zero run. Everything else was scored against a page
  // the same paragraph had just declared unable to draw the game.
  //
  // MEASURED, this branch, default 640x400 on this software rasteriser: the
  // `last`/`shoot` pass drew 1 replay frame, sampled the SKIP 0 times and took
  // 0 screenshots at 0.34 Hz — one frame every three seconds against a beat
  // that is `REPLAY.wall` = 4.0 s long. There is no reading of that in which
  // "no SKIP was ever on screen" is a fact about the GAME. It is a fact about
  // the observer, and it was going in the findings list under a bare RED.
  // Shrinking to 440x280 bought 1.15-3.90 Hz — still under this file's own
  // floor — and produced a different set of the same kind of negative.
  //
  // So below MIN_RING_HZ a failing assertion is printed, named and counted as
  // NOT JUDGED, and the case is kept out of the scored set entirely. What it
  // cannot do is buy a pass: a case with an unjudged assertion in it is never
  // counted GREEN, and a run in which nothing was judged says NOT PROVEN. A
  // page ABOVE the floor is untouched by any of this — every assertion below
  // is scored exactly as before.
  const starved = ringHz !== null && ringHz < MIN_RING_HZ;
  const unjudged = [];
  const find = (m) => { if (starved) unjudged.push(`${kind}/${pass}: ${m}`); else bad(m); };
  say("");
  if (drawn > 0) good(`the viewer drew ${drawn} frames of replay`);
  else find(`the viewer drew NO replay frames at match end (gap ${f2((gapMs ?? 0) / 1000)}s)`);
  if (skipFrames > 0) good(`a SKIP was on screen for him — ${skipFrames} sampled frames of it`);
  else find(`NO SKIP was ever on screen. The owner asked for one: "skippable at end of match"`);
  // NOT ROUTED THROUGH `find`. This one is a POSITIVE observation of a defect —
  // the harness saw the panel and the replay on screen together — and a slow
  // observer that SAW something is believed. See the paragraph above.
  if (bothUp === 0) good(`the results panel never overlapped the replay`);
  else bad(`the results panel was up on ${bothUp} samples while the replay was still playing`);
  if (pass === "shoot") {
    if (shots.length) good(`the beat was photographed while it was on screen`);
    else find(`no screenshot was taken while the replay was playing`);
  } else if (leftTo === "landing") {
    good(`pressing SKIP took him to the lobby, which is what the owner asked for`);
  } else if (leftTo) {
    find(`pressing SKIP left him on "${leftTo}", not the lobby`);
  } else {
    find(`the SKIP was gone before it could be pressed — nothing exercised the route out`);
  }
  if (unjudged.length) {
    say("");
    say(`    NOT JUDGED — the page drew ${f2(ringHz)} frames a second, under this file's own`);
    say(`    ${MIN_RING_HZ} Hz floor, against a beat ${f2(REPLAY.wall)}s long. A starved observer cannot support`);
    say(`    a negative, so these are named and counted and NOT scored, and this case is`);
    say(`    kept out of the GREEN count:`);
    for (const m of unjudged) say(`      - ${m}`);
  }

  await A.close();
  if (B) await B.close();
  return { kind, pass, gapMs, drawn, skipFrames, bothUp, ownEver, shots, leftTo, skipShot,
    ringHz, starved, unjudged };
}

async function main() {
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  say("");
  say(`  REPLAYSHOT — the match-end replay, photographed, for the man who died.`);
  say(`  starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
  // NOT CLEARED. A run on a saturated box may or may not catch the beat, and
  // wiping the directory on the way in means the run that DID catch it loses
  // its picture to the run that did not. `--fresh` is for when that is wanted.
  if (argv.includes("--fresh")) rmSync(SHOTS, { recursive: true, force: true });
  server = spawn("node", ["--import", SEED_DIE, useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  watchBoot(server, "replayshot");
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);

  const browser = await chromium.launch({
    headless: true,
    ...launchOptions(),
  });
  say(`  browser: ${browser.version()}   viewport ${VIEW.w}x${VIEW.h}`);

  const out = [];
  for (const k of CASES) {
    if (k !== "last" && k !== "held") { say(`  no such case: ${k}`); continue; }
    // TWO MATCHES PER CASE. See the note in the watch loop: a shot and a press
    // cannot share the ten seconds the server holds the room open.
    out.push(await playCase(browser, k, "shoot"));
    out.push(await playCase(browser, k, "press"));
  }

  say("");
  say("=".repeat(78));
  say("  VERDICT");
  say("=".repeat(78));
  say("");
  for (const r of out) {
    if (r.skipped) { say(`  ${r.kind.padEnd(5)} ${r.pass.padEnd(6)} NOT EXERCISED — the room ended before the gap could be taken.`); continue; }
    if (r.notObservable) { say(`  ${r.kind.padEnd(5)} ${r.pass.padEnd(6)} NOT OBSERVABLE — the page drew ${f2(r.ringHz)} frames a second. `
      + `Not scored; see replaytest §4.`); continue; }
    say(`  ${r.kind.padEnd(5)} ${r.pass.padEnd(6)} died ${f2((r.gapMs ?? 0) / 1000)}s before the end; ${r.drawn} replay frames drawn; `
      + `SKIP on ${r.skipFrames} samples`
      + (r.pass === "press" ? `; press landed on "${r.leftTo}"` : `; ${r.shots.length} shot(s)`) + `.`
      + (r.unjudged && r.unjudged.length ? `  ${r.unjudged.length} NOT JUDGED at ${f2(r.ringHz)} Hz.` : ""));
  }
  say("");
  // WHAT THIS BOX CAN AND CANNOT BE ASKED, SAID PLAINLY AND AT THE TOP OF THE
  // VERDICT rather than left for a reader to derive from four scattered Hz
  // readings. `record()` runs once per RENDER, so the ring's fill rate IS the
  // page's frame rate; below MIN_RING_HZ the beat is a handful of frames and
  // this harness's default viewport is not a thing this machine can serve.
  const unjudged = out.flatMap((r) => r.unjudged ?? []);
  const rates = out.filter((r) => Number.isFinite(r.ringHz)).map((r) => r.ringHz);
  if (rates.length && Math.min(...rates) < MIN_RING_HZ) {
    say(`  THE OBSERVER. At ${VIEW.w}x${VIEW.h} this page drew ${f2(Math.min(...rates))}-${f2(Math.max(...rates))} frames a second`);
    say(`  against a ${f2(REPLAY.wall)}s beat and this file's own ${MIN_RING_HZ} Hz floor. THE DEFAULT VIEWPORT OF THIS`);
    say(`  HARNESS NEEDS A REAL GPU. On a software rasteriser it will watch the beat`);
    say(`  through a handful of frames whatever --viewport is passed — 440x280 was`);
    say(`  measured at 1.15-3.90 Hz on the same box — so what it can still prove here is`);
    say(`  what it SAW, and every negative it could not support is listed as NOT JUDGED.`);
    say("");
  }
  // A VERDICT THAT CANNOT SAY GREEN BECAUSE EVERYTHING WAS ROUTED PAST THE
  // SCORING. This is `replayseen`'s own rule and this file needed it on its
  // second outing: both `held` passes came back NOT OBSERVABLE, `fails` was
  // empty, and the first draft printed GREEN over a run that had watched
  // nothing. A run that observed nothing must say so.
  // A case carrying an unjudged assertion is NOT a scored pass. Its positives
  // are still believed and still printed; what it may not do is add to the
  // GREEN count, or a starved box would score green for the assertions it
  // happened to satisfy while the ones it could not reach went quiet.
  const scored = out.filter((r) => !r.skipped && !r.notObservable && !(r.unjudged ?? []).length);
  if (unjudged.length) {
    say(`  ${unjudged.length} assertion(s) NOT JUDGED — named, counted, and not passes:`);
    for (const m of unjudged) say(`    - ${m}`);
    say("");
  }
  if (fails.length) {
    say(`  RED — ${fails.length} finding(s):`);
    for (const f of fails) say(`    - ${f}`);
  } else if (!scored.length) {
    say(`  NOT PROVEN — and this is not a pass. Every case asked for was routed past the`);
    say(`  scoring for the reason printed above it, so nothing here has watched a replay.`);
  } else {
    say(`  GREEN on ${scored.length} of ${out.length} pass(es)${unjudged.length ? ", AND NOT A CLEAN SHEET" : ""} — the man who died saw the`);
    say(`  replay, had a skip, and the skip took him to the lobby. The frames are counted`);
    say(`  in the client's own loop and the pictures are in ${SHOTS}.`);
    if (unjudged.length) {
      say(`  ${unjudged.length} assertion(s) above were NOT JUDGED by this observer. That is coverage this`);
      say(`  run does not have, and it is not the same thing as coverage that passed.`);
    }
    if (scored.length < out.length) {
      say(`  The rest were not scored and are listed above; they are not part of this.`);
    }
  }
  say("");
  await browser.close();
  stop();
  process.exit(GATE && fails.length ? 1 : 0);
}

main().catch((e) => { say(`[replayshot] failed: ${e && e.stack ? e.stack : e}`); stop(); process.exit(1); });
