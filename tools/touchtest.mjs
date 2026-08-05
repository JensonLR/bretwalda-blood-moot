#!/usr/bin/env node
// ============================================================
// TOUCHTEST — drives a real phone-shaped session with real touch
// events and measures whether the scheme in docs/MOBILE-CONTROLS.md
// does what it says.
//
//   npm run touchtest
//
// Sibling of tools/playtest.mjs, which guards the desktop path. The
// two split the same job: playtest presses keys and a mouse, this
// presses thumbs. Everything either of them asserts is read back off
// the game socket, so neither needs a debug hook in app code.
//
// The whole point of the mobile rebuild is that movement, aim and
// attack direction stopped sharing one thumb, so that is what is
// measured here — not that the handlers ran, but that a stick push
// reaches the server as movement and nothing else, a drag reaches it
// as yaw and nothing else, and a flick reaches it as the cut it drew.
//
// Exits non-zero if any of it fails.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = parseInt(process.env.PORT || String(3960 + (process.pid % 30)), 10);
const HEADED = process.argv.includes("--headed");

// A mid-size phone in portrait, which is what a link in a group chat lands on.
// Nothing here is tuned to these exact numbers: every touch point is derived
// from the viewport or measured off the button it belongs to.
const SCREEN = { width: 390, height: 844 };

/** Stick travel that pins the joystick at full deflection (input.ts divides by
 *  55 and clamps), plus enough margin that a slow ramp still gets there. */
const STICK_PUSH = 62;
/** A flick has to clear input.ts's SWIPE_PX (18) to name a direction. A thumb
 *  draws about this much across a phone; anything shorter is a press. */
const FLICK_PX = 46;
/** Where a walk is aimed to pass the middle of the ring: outside the bonfire's
 *  bite, well inside the palisade. The arena is 18 units across and both ends
 *  of it stop a man dead, which turns a distance assertion into a measurement
 *  of the scenery. */
const SAFE_RADIUS = 6;
/** How long the margin probe at the end sits still before it flicks — past
 *  GameHud's 90 ms arming window on purpose. It is a floor, not a measurement:
 *  what gets printed is the gap the page actually felt, which on a box this
 *  slow is longer again. */
const SLOW_FLICK_MS = 130;

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

// Records both directions of the game socket. `swings` is the one addition over
// playtest's probe: the server locks a swing's direction in at the instant it
// accepts the blow and never revisits it, so the only honest answer to "which
// cut did the phone ask for" is the attackDir on the snapshot where the man
// entered `attacking`. Reading it off the wire instead would grade the client's
// intent rather than what the fight was actually fought with.
const PROBE = () => {
  const w = window;
  // `frames` is the addition the lock assertions needed: one row per snapshot,
  // carrying the local warrior's facing AND where every live enemy was standing
  // at that instant. A lock is a claim about the relationship between the two,
  // and that relationship cannot be reconstructed from either alone after the
  // fact — the men have moved by the time anything is read back.
  w.__probe = {
    sent: [], lastState: null, states: 0, opened: false, swings: [],
    wasAttacking: false, shoves: 0, wasShoving: false, touch: [], frames: [],
  };

  // What the page actually felt, timestamped on the page's own clock. A gesture
  // is a shape in time as much as in space — GameHud gives a flick 90 ms to read
  // before it fires the blow in the last direction — and this box renders a
  // frame slowly enough that the wall-clock gap between two dispatched touches
  // is no evidence at all about the gap the game saw. Passive and capture-phase,
  // so it observes React's handlers without standing in front of them.
  const recTouch = (e) => {
    if (w.__probe.touch.length > 500) w.__probe.touch.shift();
    w.__probe.touch.push({
      t: performance.now(), type: e.type,
      ids: Array.from(e.changedTouches).map((c) => c.identifier),
    });
  };
  for (const type of ["touchstart", "touchmove", "touchend"]) {
    document.addEventListener(type, recTouch, { capture: true, passive: true });
  }

  // THE SHUTTER. With this set, the wire stops at the client's own door: the
  // snapshot the app has is the last one it will get, render/anim.ts runs out
  // its 0.22 s of extrapolation, and the whole fight stands still. The socket
  // is NOT closed — that would put a reconnect overlay across everything — the
  // app simply stops being told anything, which it cannot tell from a quiet
  // moment. The mirror assertion below needs a scene that holds still, because
  // "with nothing else changed" is the whole of the claim it makes.
  w.__freeze = false;

  const RealWS = window.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (String(url).includes("/ws")) {
      w.__probe.opened = true;
      // The client assigns `ws.onmessage`; the shutter sits in front of it.
      Object.defineProperty(ws, "onmessage", {
        configurable: true,
        set(fn) { this.__app = fn; },
        get() { return this.__app; },
      });
      ws.addEventListener("message", (ev) => {
        if (w.__freeze || typeof ws.__app !== "function") return;
        ws.__app(ev);
      });
      const send = ws.send.bind(ws);
      ws.send = (data) => {
        try {
          const m = JSON.parse(data);
          if (m.type === "input") w.__probe.sent.push({ t: performance.now(), d: m.data });
        } catch { /* ignore */ }
        return send(data);
      };
      ws.addEventListener("message", (ev) => {
        // The probe freezes with the app, or the trail describes a fight that
        // has moved on while the frame describes one that has not.
        if (w.__freeze) return;
        try {
          const m = JSON.parse(ev.data);
          if (m.type !== "game_state" && m.type !== "countdown") return;
          w.__probe.states++;
          w.__probe.lastState = m.data;
          const mine = Object.values(m.data.players || {}).find((p) => !String(p.id).startsWith("bot_"));
          if (!mine) return;
          const attacking = mine.state === "attacking";
          if (attacking && !w.__probe.wasAttacking) {
            w.__probe.swings.push({ t: performance.now(), dir: mine.attackDir, rot: mine.rotation });
          }
          w.__probe.wasAttacking = attacking;
          // The shove's whole life is 0.65 s and this box can sit on a socket
          // message longer than that, so it is latched here — where every
          // packet is eventually read — rather than raced for from a poll.
          if (mine.state === "shoving" && !w.__probe.wasShoving) w.__probe.shoves++;
          w.__probe.wasShoving = mine.state === "shoving";

          const foes = {};
          for (const p of Object.values(m.data.players || {})) {
            if (p.id === mine.id) continue;
            foes[p.id] = { x: p.position.x, z: p.position.z, dead: p.state === "dead" };
          }
          if (w.__probe.frames.length > 900) w.__probe.frames.shift();
          w.__probe.frames.push({
            t: performance.now(),
            rot: mine.rotation, state: mine.state,
            x: mine.position.x, z: mine.position.z,
            // Which man the client believes it is holding. The only thing in
            // here that is not off the wire — the wire does not carry it —
            // and nothing is asserted from it that the facing does not confirm.
            lock: (w.__bretwaldaLock && w.__bretwaldaLock.target) || null,
            foes,
          });
        } catch { /* ignore */ }
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
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

function shortestAngle(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** The cluster a touch on the look side is allowed to land on. */
const CLUSTER = ["Slash", "Heavy attack", "Block", "Dodge", "Power", "Shove"];

/**
 * Every point on the look side must reach either the canvas — where a drag
 * becomes yaw or a target switch — or a control the player is deliberately
 * pressing. Anything else standing there is a patch of screen where a thumb
 * silently does nothing, which is the exact complaint the rebuild set out to
 * answer: the old zone ignored the bottom third and players read that as broken.
 *
 * Module level rather than a closure, because it is now run in two acts: an
 * empty ring, and a ring with the lock reticle drawn over the fight. A reticle
 * that took a bite out of free-look would be invisible until someone dragged
 * exactly where a man was standing.
 */
async function scanLookSide(page, mirrored) {
  return page.evaluate(([cluster, flip]) => {
    const W = window.innerWidth, H = window.innerHeight;
    // input.ts splits the screen at MOVE_SIDE_FRACTION and swaps the sides for
    // a left-handed player; everything on the look side of that line is the
    // right thumb's unless something is standing on it.
    const from = flip ? 0 : Math.ceil(W * 0.45);
    const to = flip ? Math.floor(W * 0.55) : W;
    const found = new Map();
    let total = 0;
    for (let y = 2; y < H; y += 5) {
      for (let x = from; x < to; x += 5) {
        total++;
        const el = document.elementFromPoint(x, y);
        if (el && el.tagName === "CANVAS") continue;
        const btn = el && el.closest("button");
        const label = btn && (btn.getAttribute("aria-label") || btn.textContent.trim());
        if (label && cluster.some((c) => label.includes(c))) continue;
        const what = label ? `the "${label}" button` : `<${el ? el.tagName.toLowerCase() : "nothing"}>`;
        found.set(what, (found.get(what) || 0) + 1);
      }
    }
    return { total, worst: [...found.entries()].sort((a, b) => b[1] - a[1]) };
  }, [CLUSTER, mirrored]);
}

/**
 * The readers every act shares: the warrior as the SERVER sees him, taken off
 * a snapshot strictly newer than a given one. Same guard, and the same reason,
 * as playtest documents: the post chain on a software rasteriser blocks the
 * main thread for most of a second, so two reads taken a second apart can land
 * on the same packet and report a displacement of exactly 0.00 — which reads as
 * "the stick is dead" when it is only "the page has not had a moment".
 */
function probeReader(page) {
  const me = async (afterSeq = -1) => page.evaluate(async (s) => {
    const deadline = performance.now() + 15000;
    while (window.__probe.states <= s && performance.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    const st = window.__probe.lastState;
    if (!st) return null;
    const mine = Object.values(st.players).find((p) => !String(p.id).startsWith("bot_"));
    return mine && {
      x: mine.position.x, z: mine.position.z, hp: mine.health,
      stam: mine.stamina, state: mine.state, rot: mine.rotation,
      dir: mine.attackDir, seq: window.__probe.states,
    };
  }, afterSeq);
  const seq = () => page.evaluate(() => window.__probe.states);
  const wait = (ms) => page.waitForTimeout(ms);
  const now = () => page.evaluate(() => performance.now());
  /**
   * A reading taken once the last input has had time to become fact: one 16 ms
   * client sample, one 50 ms server tick, and the snapshot back. Reading the
   * instant a drag stops catches the turn in flight and reports a fraction of
   * it — which looks exactly like a control that half works.
   */
  const afterInput = async () => { await wait(200); return me(await seq()); };
  /**
   * A baseline taken once the server's copy of the man has stopped changing
   * under its own steam: the stride left over from the last test, and the
   * round's opening handover, are each worth a baseline of nonsense.
   */
  const settle = async (tries = 25) => {
    let last = await me(await seq());
    for (let i = 0; i < tries; i++) {
      const next = await me(await seq());
      if (Math.abs(shortestAngle(last.rot, next.rot)) < 0.005
        && Math.hypot(next.x - last.x, next.z - last.z) < 0.05) return next;
      last = next;
    }
    return last;
  };
  return { me, seq, wait, now, afterInput, settle };
}

/**
 * Thumbs, over CDP. Playwright's own touchscreen is one finger and one tap; a
 * scheme whose whole claim is that two thumbs no longer fight each other cannot
 * be tested with one. These go through the browser's real input pipeline, so
 * the events are hit-tested, retargeted and delivered exactly as a phone's are
 * — including the rule the swing gesture depends on, that a touch belongs to
 * the element it started on even after it has slid off.
 *
 * Chromium diffs each dispatch against the fingers already down and emits one
 * event per changed finger, so every call carries the whole hand. A lift is the
 * exception: it names the finger that left.
 */
function makeHand(cdp) {
  const down = new Map();
  const all = () => [...down.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y, radiusX: 14, radiusY: 14, force: 1 }));
  const dispatch = (type, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  return {
    async press(id, x, y) { down.set(id, { x, y }); await dispatch("touchStart", all()); },
    async move(id, x, y) { down.set(id, { x, y }); await dispatch("touchMove", all()); },
    async lift(id) {
      const p = down.get(id);
      if (!p) return;
      down.delete(id);
      await dispatch("touchEnd", [{ id, x: p.x, y: p.y }]);
    },
    async liftAll() { if (!down.size) return; down.clear(); await dispatch("touchEnd", []); },
  };
}

/**
 * Whether the built bundle is older than the source it was built from. When
 * there is a build, that is what gets served — so an edit to input.ts that has
 * not been rebuilt is graded as the code it replaced, and a control scheme that
 * no longer exists passes every assertion in here. Loud, and not fatal: the
 * run is still worth having, it just is not about the working tree.
 */
function buildIsStale(buildId) {
  let newest = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else newest = Math.max(newest, statSync(path).mtimeMs);
    }
  };
  walk(resolve(ROOT, "src"));
  return newest > statSync(buildId).mtimeMs;
}

/**
 * ACT TWO — the ring with men in it.
 *
 * Everything above runs in an empty ring on purpose: the twenty assertions
 * there are about a thumb, and an AI that kills the test warrior takes all of
 * them with it. The lock is the opposite claim. It is entirely about who else
 * is standing there, so it gets its own fight, its own page and its own
 * localStorage — a second act rather than a second harness, because it is the
 * same scheme and the two halves have to stay green together.
 *
 * Three recruits, which is the case that matters: the duel is easy and the
 * FFA is where a lock either helps or starts arguing with the player.
 */
async function lockAct(browser, url, check) {
  const ctx = await browser.newContext({ viewport: SCREEN, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  // This box shares a CPU with whatever else is being built or driven at the
  // time — two runs in a row have been thrown away by a menu that took longer
  // than Playwright's default thirty seconds to paint, which fails nothing
  // except the clock. Every wait on this page gets the same minute and a half
  // the clicks below already ask for.
  page.setDefaultTimeout(90000);
  page.on("pageerror", (e) => console.log(`[page-error] ${e}`));
  await page.goto(`${url}/?quality=low`, { waitUntil: "domcontentloaded" });

  // Every step waits a minute rather than Playwright's default thirty seconds.
  // This box shares a CPU with whatever else is being built at the time, and a
  // menu that took 31 s to paint has failed nothing except the clock — it threw
  // away a four-minute run twice before this was raised.
  const CLICK = { timeout: 90000 };
  const step = async (text) => {
    const el = page.getByText(text, { exact: false }).first();
    await el.waitFor({ state: "visible", ...CLICK });
    await el.click(CLICK);
  };
  await step("Training");
  await step("MUSTER THE TESTGROUNDS");
  // Slow and forgiving. The warrior has to survive long enough to be measured,
  // and a Jarl opens his head while the first assertion is still counting.
  await step("RECRUIT");
  const fewer = page.getByLabel("Fewer AI warriors");
  for (let i = 0; i < 8 && await fewer.isEnabled().catch(() => false); i++) await fewer.click(CLICK);
  const more = page.getByLabel("More AI warriors");
  for (let i = 0; i < 3; i++) await more.click(CLICK);
  await step("DRAW STEEL");
  await page.waitForFunction(() => window.__probe?.lastState?.state === "fighting", null, { timeout: 60000 });
  console.log("\n[touchtest] act two: three recruits in the ring\n");

  const { me, seq, wait, now } = probeReader(page);
  const cdp = await ctx.newCDPSession(page);
  const hand = makeHand(cdp);
  const LOOK = 2, SWING = 3;
  const lookHome = { x: SCREEN.width * 0.56, y: SCREEN.height * 0.42 };

  const lockState = () => page.evaluate(() => ({
    target: (window.__bretwaldaLock && window.__bretwaldaLock.target) || null,
    engaged: !!(window.__bretwaldaLock && window.__bretwaldaLock.engaged),
    blend: (window.__bretwaldaLock && window.__bretwaldaLock.blend) || 0,
    switches: (window.__bretwaldaLock && window.__bretwaldaLock.switches) || 0,
    reason: (window.__bretwaldaLock && window.__bretwaldaLock.reason) || "?",
  }));
  /**
   * Three recruits at arm's length kill the test warrior, and a corpse holds no
   * lock. That is not a defect in the scheme — it is the ring doing what a ring
   * does — so every assertion below waits for a man who is on his feet before
   * it measures anything, and retries rather than grading a death.
   */
  const waitForAlive = () => page.waitForFunction(() => {
    const s = window.__probe.lastState;
    if (!s || (s.state !== "fighting" && s.state !== "last_stand")) return false;
    const m = Object.values(s.players).find((p) => !String(p.id).startsWith("bot_"));
    return !!m && m.state !== "dead";
  }, null, { timeout: 60000 });
  const waitForLock = () => page.waitForFunction(
    () => window.__bretwaldaLock && window.__bretwaldaLock.engaged && window.__bretwaldaLock.blend > 0.9,
    null, { timeout: 45000 });

  /**
   * The snapshot trail since `mark`: every man the lock held, in order, plus
   * where everybody was standing at the end. "The lock let go" and "the lock
   * never took hold" are different bugs and a verdict alone cannot tell them
   * apart; `switchedTo` is the first NEW man it took, which is the one thing a
   * later death cannot take back.
   */
  const readTrace = (mark) => page.evaluate((t) => {
    const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
    const rows = window.__probe.frames.filter((f) => f.t >= t);
    const held = [];
    for (const f of rows) if (!held.length || held[held.length - 1] !== (f.lock || "-")) held.push(f.lock || "-");
    const first = rows.length ? rows[0].lock : null;
    const switchedTo = rows.map((f) => f.lock).find((l) => l && l !== first) || null;
    const last = rows[rows.length - 1];
    const foes = last ? Object.entries(last.foes).filter(([, p]) => !p.dead)
      .map(([id, p]) => `${id.slice(0, 8)}@${Math.hypot(p.x - last.x, p.z - last.z).toFixed(1)}m`) : [];
    // Where the camera ended up relative to whoever it is holding NOW.
    const onNew = rows.filter((f) => f.lock === switchedTo && f.foes[f.lock] && !f.foes[f.lock].dead);
    const f = onNew[onNew.length - 1];
    return {
      held: held.map((h) => h.slice(0, 8)).join(" → "),
      switchedTo,
      foes: foes.join(", "),
      off: f ? Math.abs(wrap(Math.atan2(f.foes[f.lock].x - f.x, f.foes[f.lock].z - f.z) - f.rot)) : null,
    };
  }, mark);

  /**
   * The handedness button lives in the combat cluster, and the cluster leaves
   * the tree with the man when he dies — so a tap dispatched a moment after a
   * recruit finished him lands on a button that has already detached. Wait for
   * a warrior on his feet, then tap, then retry.
   */
  const flipHand = async (to) => {
    const label = to === "left" ? "Switch to left-handed controls" : "Switch to right-handed controls";
    for (let i = 0; i < 6; i++) {
      await waitForAlive().catch(() => {});
      const btn = page.getByLabel(label);
      try {
        await btn.waitFor({ state: "visible", timeout: 15000 });
        await btn.tap({ timeout: 15000 });
        await wait(500);
        return true;
      } catch { await wait(800); }
    }
    return false;
  };

  /** A drag on bare glass on the button side, in steps, as one burst. */
  const glassDrag = async (dx, steps = 6) => {
    await hand.press(LOOK, lookHome.x, lookHome.y);
    const moves = [];
    for (let i = 1; i <= steps; i++) moves.push(hand.move(LOOK, lookHome.x + (dx * i) / steps, lookHome.y));
    await Promise.all(moves);
    await hand.lift(LOOK);
  };

  await waitForLock().catch(() => {});

  // ===================================================================
  // A. The lock holds facing on a man who is moving, with NO thumb on
  //    the button side at all. This is the whole promise: the player
  //    stops having to say where to look.
  // ===================================================================
  {
    let read = null;
    // Held open until the locked man has actually gone somewhere. A lock that
    // "held facing" on a man stood still has proved nothing, and a bot that has
    // not closed yet is stood still.
    for (let i = 0; i < 8; i++) {
      await waitForAlive().catch(() => {});
      const mark = await now();
      // Long enough that even a box whose main thread is being fought over for
      // most of a second still delivers the eight snapshots this needs.
      await wait(2600);
      read = await page.evaluate((t) => {
        const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
        // The first half-second is the ease-in, and a lock is allowed to be
        // wrong while it is arriving. Rows within 350 ms of the lock changing
        // man are dropped for the same reason.
        const rows = window.__probe.frames.filter((f) => f.t >= t + 500);
        let worst = 0, n = 0, yawTravel = 0, prevRot = null, prevLock = null, changedAt = -1e9;
        let firstFoe = null, lastFoe = null, id = null;
        for (const f of rows) {
          if (f.lock !== prevLock) { changedAt = f.t; prevLock = f.lock; }
          const foe = f.lock && f.foes[f.lock];
          if (prevRot !== null) yawTravel += Math.abs(wrap(f.rot - prevRot));
          prevRot = f.rot;
          if (!foe || foe.dead) continue;
          // A staggered or committed man is not free to turn; the cap, not the
          // lock, is what decides his facing there, and it has its own test.
          if (f.state === "staggered" || f.state === "attacking" || f.state === "shoving" || f.state === "dead") continue;
          if (f.t - changedAt < 500) continue;
          const off = Math.abs(wrap(Math.atan2(foe.x - f.x, foe.z - f.z) - f.rot));
          worst = Math.max(worst, off);
          n++;
          id = f.lock;
          if (!firstFoe) firstFoe = { ...foe };
          lastFoe = { ...foe };
        }
        const moved = firstFoe && lastFoe ? Math.hypot(lastFoe.x - firstFoe.x, lastFoe.z - firstFoe.z) : 0;
        return { worst, n, yawTravel, moved, id };
      }, mark);
      if (read.n >= 8 && read.moved > 0.8) break;
    }
    check("the lock holds facing on a moving target with no thumb on the button side",
      read && read.n >= 8 && read.moved > 0.8 && read.worst < 0.5 && read.yawTravel > 0.15,
      read
        ? `over ${read.n} snapshots the locked man travelled ${read.moved.toFixed(2)} units and the camera turned ${(read.yawTravel * 57.3).toFixed(0)}° to stay on him; worst facing error ${(read.worst * 57.3).toFixed(1)}° (a thumb was nowhere near the glass)`
        : "no snapshots");
  }

  // ===================================================================
  // B. A flick across the button side takes the next man. This is the
  //    one decision the lock cannot make for you, and it is the only
  //    job left on bare glass — no drag, no held aim, no second thumb.
  // ===================================================================
  {
    let before = null, after = null, trace = null, ok = false;
    // Eight attempts, and an attempt that starts with nobody held is not one of
    // them. Three recruits at arm's length kill the test warrior, and a flick
    // dispatched at a corpse measures nothing — the run this was raised on
    // spent all four of its old attempts on a man who was down, and reported
    // "the lock went bot_f579 → -" as a failure of the switch.
    for (let attempt = 0; attempt < 8 && !ok; attempt++) {
      await waitForAlive().catch(() => {});
      await waitForLock().catch(() => {});
      before = await lockState();
      if (!before.engaged || !before.target) { await wait(800); continue; }
      const mark = await now();
      await glassDrag(92);
      // Short, because the verdict is taken off the SNAPSHOT TRAIL and not off
      // the state at the end of a settle: the first cut of this test watched a
      // perfectly good switch happen and then failed it, because the warrior
      // was cut down 600 ms later and a corpse holds nobody.
      await wait(350);
      after = await lockState();
      trace = await readTrace(mark);
      ok = after.switches > before.switches
        && !!trace.switchedTo && trace.switchedTo !== before.target;
      if (!ok) await wait(600);
    }
    check("a flick across the button side switches target", ok,
      `flicked 92px right: the lock went ${trace.held}; live foes ${trace.foes || "none"}; the camera came onto the new man to within ${trace.off === null ? "n/a" : (trace.off * 57.3).toFixed(1) + "\u00b0"}; lock says "${after.reason}"`);
  }

  // ===================================================================
  // C. AND IT IS STILL NOT AN AIMBOT. The weight pass caps a committed
  //    body at SWING_TURN_RATE = 1.8 rad/s so a blow cannot follow a man
  //    who rolls behind you. A lock that turned the camera faster than
  //    the shoulders would delete that, and For Honor works precisely
  //    because it does not. Throw a heavy, then ask the lock — mid-blow
  //    — for a man in a completely different direction, and measure what
  //    the SERVER did with his facing.
  // ===================================================================
  {
    const CAP = 1.8;
    let best = null;
    const heavyBtn = page.getByLabel("Heavy attack");
    const hb = await heavyBtn.boundingBox();
    const STICK = 1;
    const stickHome = { x: SCREEN.width * 0.23, y: SCREEN.height * 0.62 };
    // The cap is only PROVED by a blow that was asked for more than it. Either
    // signal will do and both are the same statement: the bearing swept faster
    // than the shoulders are allowed, or the lock was left holding a correction
    // bigger than a swing could close.
    const exercised = (m) => !!m && (m.demandRate > CAP || m.peakResidual > 0.9);
    const better = (a, b) => !b || (a.demandRate + a.peakResidual) > (b.demandRate + b.peakResidual);
    for (let attempt = 0; attempt < 8 && !exercised(best); attempt++) {
      if (!hb) break;
      await waitForAlive().catch(() => {});
      await page.waitForFunction(() => {
        const s = window.__probe.lastState;
        if (!s) return false;
        const m = Object.values(s.players).find((p) => !String(p.id).startsWith("bot_"));
        return !!m && m.stamina > 60 && m.state !== "attacking" && m.state !== "staggered";
      }, null, { timeout: 25000 }).catch(() => {});

      // THE MANOEUVRE. Not a second man off to the side — three recruits walk
      // in abreast and the first cut of this test spent eight attempts asking a
      // lock that was only ever 11° out of line, which proves nothing either
      // way. This is the For Honor case instead, and it needs nobody but the
      // man you are already fighting: get inside his reach, throw a heavy, and
      // STRAFE ROUND HIM while it is out. At a metre and a half the bearing to
      // him sweeps faster than any shoulders can follow, so the lock asks for
      // more than 1.8 rad/s as a matter of geometry rather than of luck.
      await page.waitForFunction(() => {
        const f = window.__probe.frames[window.__probe.frames.length - 1];
        if (!f || !f.lock) return false;
        const p = f.foes[f.lock];
        // Inside two metres. The sweep goes as 1/range, so three metres is the
        // difference between a demand of 1.2 rad/s and one of 3.5.
        return !!p && !p.dead && Math.hypot(p.x - f.x, p.z - f.z) < 2.2;
      }, null, { timeout: 20000 }).catch(() => {});

      const mark = await now();
      await hand.press(SWING, hb.x + hb.width / 2, hb.y + hb.height / 2);
      await wait(60);
      await hand.lift(SWING);
      // Full lateral deflection, held through the blow. Which way round does
      // not matter; that it is across his front and not at him does.
      await hand.press(STICK, stickHome.x, stickHome.y);
      await Promise.all([0.4, 0.75, 1].map((k) => hand.move(STICK, stickHome.x - 62 * k, stickHome.y)));
      await wait(900);
      await hand.lift(STICK);
      await wait(250);

      const m = await page.evaluate(([t, cap]) => {
        const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
        const rows = window.__probe.frames.filter((f) => f.t >= t && f.state === "attacking");
        // Six snapshots and a third of a second, or it is not a measurement: a
        // rate taken across four packets on a box with no GPU is mostly the
        // jitter between them.
        if (rows.length < 6 || rows[rows.length - 1].t - rows[0].t < 300) return null;
        const bearing = (f) => {
          const p = f.lock && f.foes[f.lock];
          return p && !p.dead ? Math.atan2(p.x - f.x, p.z - f.z) : null;
        };
        let turned = 0;
        for (let i = 1; i < rows.length; i++) turned += Math.abs(wrap(rows[i].rot - rows[i - 1].rot));
        const elapsed = (rows[rows.length - 1].t - rows[0].t) / 1000;

        // What the lock was ASKING for: how fast the direction to the man it
        // holds was moving. Taken over three-snapshot windows so one late
        // packet cannot invent a rate, and only across windows holding the
        // SAME man — a switch is a jump, not a rate.
        let demandRate = 0, bodyPeak = 0, peakResidual = 0;
        for (const f of rows) {
          const b = bearing(f);
          if (b !== null) peakResidual = Math.max(peakResidual, Math.abs(wrap(b - f.rot)));
        }
        for (let i = 2; i < rows.length; i++) {
          const a = rows[i - 2], c = rows[i];
          if (a.lock !== c.lock || a.lock !== rows[i - 1].lock) continue;
          const b0 = bearing(a), b1 = bearing(c);
          if (b0 === null || b1 === null) continue;
          const dt = (c.t - a.t) / 1000;
          if (dt < 0.06) continue;
          demandRate = Math.max(demandRate, Math.abs(wrap(b1 - b0)) / dt);
          bodyPeak = Math.max(bodyPeak, Math.abs(wrap(c.rot - a.rot)) / dt);
        }
        const last = rows[rows.length - 1];
        const lastB = bearing(last);
        return {
          turned, elapsed, demandRate, bodyPeak, peakResidual,
          rate: turned / elapsed,
          residual: lastB === null ? null : Math.abs(wrap(lastB - last.rot)),
          allowed: cap * elapsed, frames: rows.length,
        };
      }, [mark, CAP]);
      if (m && better(m, best)) best = m;
    }

    // Tolerance is on the CLOCK, not on the cap: the server integrates 1.8 rad/s
    // on its own fixed step and is the authority, but the window here is
    // measured between two socket messages arriving at a box with no GPU, and
    // bunched packets shorten the denominator. 30% covers that and still leaves
    // an uncapped lock — which would run at LOCK_MAX_RATE, 5.0 — nowhere to hide.
    const ok = !!best && best.rate <= CAP * 1.3 && best.bodyPeak <= CAP * 1.3 && exercised(best);
    check("a committed swing still cannot follow the man the lock was handed", ok,
      best
        ? `strafing round him mid-blow, the lock was left holding ${(best.peakResidual * 57.3).toFixed(0)}\u00b0 of correction and the direction to him swept at ${best.demandRate.toFixed(2)} rad/s — more than the shoulders are allowed — and over ${best.frames} snapshots of "attacking" (${best.elapsed.toFixed(2)}s) the server turned him ${(best.turned * 57.3).toFixed(0)}\u00b0, ${best.rate.toFixed(2)} rad/s mean and ${best.bodyPeak.toFixed(2)} rad/s peak against the 1.8 cap (an uncapped lock runs at 5.0), leaving ${best.residual === null ? "n/a" : (best.residual * 57.3).toFixed(0) + "\u00b0"} still between them when the blow finished`
        : "the server never held \"attacking\" long enough to measure \u2014 no heavy survived to a sixth snapshot");
  }

  // ===================================================================
  // D. The lock is on the frame, not only in the camera. A camera that
  //    holds a man looks exactly like a player who happens to be
  //    pointing that way; never carry information in one channel only.
  // ===================================================================
  {
    const W = SCREEN.width;
    /**
     * Samples the reticle, keeping only the ones taken while the man it holds
     * is CLOSE. The shoulder parallax goes as 1/range: at a metre and a half it
     * is most of the half-frame and swamps everything else, and at fourteen
     * metres it is four degrees and the man's own position decides which side
     * of the middle he lands on. A previous cut of this test measured the
     * parallax at a range of 14 m and got the sign backwards — which is the
     * geometry behaving, not the reticle misbehaving.
     */
    /** Qualifying samples this wants before it stops looking, per hand. */
    const NEED = 12;
    /** And the least wall time it will spend collecting them, so "it slid as he
     *  moved" is still a statement about a man who had time to move. */
    const SPAN_MS = 1400;

    /**
     * One batch, collected IN THE PAGE, on a 40 ms timer.
     *
     * Three things were wrong with the 34 pokes 150 ms apart this replaces.
     *
     * ONE: it stopped when it ran out of pokes rather than when it had the
     * evidence. The gate below is narrow on purpose — the man close, square in
     * front, the mark lit and on the glass — so a poke landing inside it was
     * luck, and one run in three came back with ZERO qualifying samples and read
     * as a failure of the reticle. It never was one: the warrior had died into
     * the round break and the pokes spent themselves on a corpse. The caller now
     * keeps coming back for batches — through a death and the next round if it
     * has to — until it has 12 or the budget is gone.
     *
     * TWO: each poke cost a CDP round trip, so the sampler ran no faster than
     * the box would let it. Sampling inside the page costs nothing per reading.
     *
     * THREE — and this one was measured the hard way — a rAF loop is the WRONG
     * clock here. This harness pins quality to low and rasterises in software on
     * a shared CPU, where the page paints about once a second: a first cut of
     * this sampler ran on rAF and collected 43 readings in 42 seconds. The
     * timer is independent of the frame rate, which is the point. A reading
     * taken twice from one painted frame proves the same thing twice rather
     * than something weaker.
     *
     * NOTHING THE SAMPLE HAS TO SATISFY WAS LOOSENED — see the gate.
     */
    const collectBatch = (ms, need) => page.evaluate(({ ms, need }) => new Promise((resolve) => {
      const wrap = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
      const out = [];
      let matched = 0, lit = 0, reads = 0, paint = "none";
      const t0 = performance.now();
      const tick = () => {
        reads++;
        const el = document.querySelector("[data-lock-reticle]");
        const p = (window.__bretwaldaCamera && window.__bretwaldaCamera.lockPaint) || {};
        const f = window.__probe.frames[window.__probe.frames.length - 1];
        if (el) {
          const r = el.getBoundingClientRect();
          const o = parseFloat(el.style.opacity || "0");
          const x = r.left + r.width / 2;
          const foe = f && f.lock && f.foes[f.lock] ? f.foes[f.lock] : null;
          const off = foe && !foe.dead ? wrap(Math.atan2(foe.x - f.x, foe.z - f.z) - f.rot) : null;
          // How far the man is from the WARRIOR, off the wire, which is the
          // range the parallax claim is about. `lockPaint.dist` is the range
          // from the CAMERA and it is a different number — the rig sits 4.4 m
          // behind him — so gating on that let a man standing on the warrior\'s
          // toes qualify, and a man that close is thrown to the edge of the
          // frame by a 1 m shoulder offset. That is the geometry behaving, and
          // it is how a shift came back with the wrong sign.
          const range = foe && !foe.dead ? Math.hypot(foe.x - f.x, foe.z - f.z) : null;
          // The DOM against the rig's own arithmetic. This is the half of the
          // claim that has nothing to do with geometry: whatever the camera
          // computed, the element has to actually be THERE.
          if (o > 0.5) {
            lit++;
            if (Math.abs(x - p.sx) < 2) matched++;
            paint = `sx=${Math.round(p.sx)} viewZ=${(p.viewZ || 0).toFixed(1)} dist=${(p.dist || 0).toFixed(1)}`
              + ` viewW=${p.w} source=${p.source} lead=${Math.round(p.leadPx || 0)}px/${(p.leadM || 0).toFixed(2)}m`;
          }
          // The parallax sample only counts when the geometry it is a statement
          // about actually holds: the man close, SQUARE IN FRONT of the warrior,
          // and the mark on the glass. Ungated, this measured a 506 px "shift"
          // on a 390 px screen across two different moments of a three-man brawl
          // — a number with no meaning that happened to have the right sign.
          // A sample counts when the mark is LIT, ON THE GLASS, and held on a
          // live man — which is the whole of what the claims below are about.
          // It used to also have to be within 6° of dead ahead and 1.5-6 m out,
          // because the mirror was being read off the median of a moving fight
          // and that needed the shoulder offset to be the only term left. The
          // mirror is measured exactly now, on a scene held still, so the
          // window is gone and with it the luck it took to land inside one.
          if (o > 0.5 && range !== null && off !== null && x > -40 && x < p.w + 40) {
            out.push({ x, range, source: p.source, lead: Math.abs(p.leadPx || 0), leadM: p.leadM || 0 });
          }
        }
        const spent = performance.now() - t0;
        if ((out.length >= need && spent > 1400) || spent > ms) resolve({ out, matched, lit, reads, paint });
        else setTimeout(tick, 40);
      };
      tick();
    }), { ms, need });

    /**
     * Batches until the evidence is in or the budget is spent, waiting out a
     * death and the round break behind it rather than grading them.
     *
     * The budget is a minute and a half and is nearly always spent in two
     * seconds: it is sized for the bad case, which is the warrior lying dead
     * through the intermission with the next round still to start, not for the
     * normal one.
     */
    const sampleReticle = async (budgetMs) => {
      const started = Date.now();
      const xs = [];
      let matched = 0, lit = 0, reads = 0, batches = 0, offWire = 0, paint = "none";
      const leads = [];
      while (Date.now() - started < budgetMs) {
        await waitForAlive().catch(() => {});
        await waitForLock().catch(() => {});
        const left = budgetMs - (Date.now() - started);
        if (left < 400) break;
        const b = await collectBatch(Math.min(4500, left), Math.max(1, NEED - xs.length));
        batches++;
        matched += b.matched; lit += b.lit; reads += b.reads;
        if (b.paint !== "none") paint = b.paint;
        for (const s of b.out) {
          xs.push(s.x);
          leads.push(s.lead);
          // Which position the mark was painted off: the rig the man is DRAWN
          // on, or the wire that is ~83 ms ahead of him. See `drawnBodies` in
          // render/camera.ts — this is the regression guard on the lead bug.
          if (s.source !== "rig") offWire++;
        }
        if (xs.length >= NEED && Date.now() - started > SPAN_MS) break;
      }
      const sorted = xs.slice().sort((a, b2) => a - b2);
      const sortedLeads = leads.slice().sort((a, b2) => a - b2);
      return {
        seen: xs.length, matched, lit, reads, batches, offWire, paint,
        seconds: (Date.now() - started) / 1000,
        median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
        travel: sorted.length > 1 ? sorted[sorted.length - 1] - sorted[0] : 0,
        lead: sortedLeads.length ? sortedLeads[Math.floor(sortedLeads.length / 2)] : 0,
        leadMax: sortedLeads.length ? sortedLeads[sortedLeads.length - 1] : 0,
      };
    };

    /**
     * THE MIRROR, MEASURED ON A SCENE THAT IS HOLDING STILL.
     *
     * The claim is that the mark is projected through the REAL camera, so it
     * moves when the camera does — and the one handedness switch moves the
     * camera to the other shoulder and changes nothing else in the game.
     *
     * This used to be read off the median x of a moving fight, and it was never
     * sound. The shoulder parallax on a man the lock is holding is not a fixed
     * quantity: the rig looks at a point LOOK_AHEAD = 3.6 m in front of the
     * warrior, so a man standing at exactly that range sits on the optical axis
     * and the switch moves him by nothing at all, a man nearer than it swings
     * one way and a man beyond it the other. Medians over a brawl were
     * averaging all three regimes together — which is how a run came back with
     * a 228 px shift with the SIGN REVERSED and it meant nothing either way.
     *
     * So the wire is held (see `__freeze` in the probe), the camera is given
     * time to settle, the mark is read, the hand is switched, and it is read
     * again. Same man, same range, same frame — the only thing that changed in
     * the whole program is which shoulder the camera looks over. `still` is how
     * far the mark wandered between two readings taken either side of the
     * switch's settle, and it is what says the scene really was held.
     *
     * IT IS MEASURED AND PRINTED, AND IT IS NOT THE HINGE OF THE ASSERTION,
     * because it cannot be: the shift is genuinely zero for a man standing on
     * the optical axis, and a threshold on it would be a threshold on where the
     * fight happened to put him. What the hinge rests on instead is the thing
     * that IS unconditional — the element sitting within 2 px of `lockPaint.sx`
     * on every reading it was lit for. That number comes out of the real
     * `camera.project()`, so a mark that had stopped following the camera
     * cannot pass it, and a camera that had stopped mirroring is caught in
     * tools/cameratest.mjs, which measures the shoulder in METRES in the
     * warrior\'s own frame rather than in pixels through a lens.
     */
    const settleAndRead = async () => {
      // Five seconds, not one. Holding the wire does not stop the body on its
      // own: render/anim.ts renders 1.5 packet intervals in the past and this
      // box runs its render clock seconds behind the wire, so with the socket
      // held the interpolator goes on PLAYING OUT ITS BACKLOG at real-time rate
      // until it runs past the newest snapshot and its 0.22 s of extrapolation.
      // A first cut waited 2.6 s, and the man walked 1.7 m between the two
      // readings that were supposed to differ only by a camera.
      await page.waitForTimeout(5000);
      const a = await page.evaluate(() => {
        const el = document.querySelector("[data-lock-reticle]");
        const r = el ? el.getBoundingClientRect() : null;
        const p = (window.__bretwaldaCamera && window.__bretwaldaCamera.lockPaint) || {};
        return {
          x: r ? r.left + r.width / 2 : null, o: el ? parseFloat(el.style.opacity || "0") : 0,
          sx: p.sx, dist: p.dist, bodyX: p.bodyX, bodyZ: p.bodyZ,
        };
      });
      await wait(900);
      const b = await page.evaluate(() => {
        const el = document.querySelector("[data-lock-reticle]");
        const r = el ? el.getBoundingClientRect() : null;
        const p = (window.__bretwaldaCamera && window.__bretwaldaCamera.lockPaint) || {};
        return { x: r ? r.left + r.width / 2 : null, bodyX: p.bodyX, bodyZ: p.bodyZ };
      });
      return {
        ...a,
        still: a.x === null || b.x === null ? 999 : Math.abs(b.x - a.x),
        crept: Math.hypot(b.bodyX - a.bodyX, b.bodyZ - a.bodyZ),
      };
    };

    /**
     * Up to three frozen moments, and the largest shift any of them gave.
     *
     * Not "retry until it passes": every moment that produced a still scene
     * with the man verifiably in the same place is a valid measurement of the
     * same quantity, and the quantity VARIES WITH THE GEOMETRY — it goes to
     * nothing for a man standing on the optical axis and grows either side of
     * him. Taking the largest of three is how you measure something that has a
     * zero in the middle of its range without asserting you never landed on it.
     */
    const mirror = { best: null, tries: 0, notes: [] };
    for (let attempt = 0; attempt < 3; attempt++) {
      mirror.tries++;
      await page.evaluate(() => { window.__freeze = false; });
      await waitForAlive().catch(() => {});
      await waitForLock().catch(() => {});
      await page.evaluate(() => { window.__freeze = true; });
      const r0 = await settleAndRead();
      if (r0.o < 0.5 || r0.still > 8 || r0.crept > 0.03) {
        mirror.notes.push(`right ${r0.still.toFixed(0)}px/${r0.crept.toFixed(2)}m`);
        await page.evaluate(() => { window.__freeze = false; });
        continue;
      }
      let flipped = true;
      try {
        await page.getByLabel("Switch to left-handed controls").tap({ timeout: 15000 });
      } catch { flipped = false; }
      if (!flipped) { await page.evaluate(() => { window.__freeze = false; }); continue; }
      const l0 = await settleAndRead();
      await page.evaluate(() => { window.__freeze = false; });
      await flipHand("right");
      // THE MAN HAS TO BE IN THE SAME PLACE. Everything else about the claim is
      // worthless if he moved: 3 cm is a hundredth of a stride.
      const moved = Math.hypot(l0.bodyX - r0.bodyX, l0.bodyZ - r0.bodyZ);
      if (l0.o < 0.5 || l0.still > 8 || l0.crept > 0.03 || moved > 0.03) {
        mirror.notes.push(`left ${l0.still.toFixed(0)}px/${l0.crept.toFixed(2)}m, he moved ${moved.toFixed(2)}m`);
        continue;
      }
      const shift = l0.x - r0.x;
      if (!mirror.best || Math.abs(shift) > Math.abs(mirror.best.shift)) {
        mirror.best = { shift, right: r0, left: l0, moved };
      }
      if (Math.abs(shift) > 24) break;
    }

    // And the sampling half, on a fight that is running    // And the sampling half, on a fight that is running: this is where "it
    // moves with him" and "it is painted off the rig" are taken.
    const overRight = await sampleReticle(90000);

    const shift = mirror.best ? mirror.best.shift : 0;
    check("the lock is drawn on the man it is holding, through the real camera",
      overRight.seen >= 8
      && overRight.matched >= 40
      && overRight.matched >= overRight.lit - 3
      && overRight.offWire === 0
      && overRight.travel > 3,
      `the element sat within 2px of the rig's own projected x on ${overRight.matched} of the ${overRight.lit} readings it was lit for (sampled on a 40 ms timer, ${overRight.reads} readings, ${overRight.batches} passes, ${overRight.seconds.toFixed(1)}s), and slid ${Math.round(overRight.travel)}px as he moved; every one of its ${overRight.seen} qualifying samples was painted off the rig the man is DRAWN on rather than the wire (${overRight.offWire} off the wire), which sat a median ${Math.round(overRight.lead)}px and up to ${Math.round(overRight.leadMax)}px ahead of him; and with the WIRE HELD so the fight could not move — same man, same range, same frame — the one handedness switch moved the mark from x=${mirror.best ? Math.round(mirror.best.right.x) : "?"} to x=${mirror.best ? Math.round(mirror.best.left.x) : "?"}, ${Math.round(Math.abs(shift))}px of pure camera parallax with nothing else in the game changed — the man himself stood at ${mirror.best ? `${mirror.best.right.bodyX.toFixed(2)},${mirror.best.right.bodyZ.toFixed(2)}` : "?"} for both readings, ${mirror.best ? mirror.best.moved.toFixed(3) : "?"} m apart, and the mark wandered ${mirror.best ? mirror.best.right.still.toFixed(1) : "?"} and ${mirror.best ? mirror.best.left.still.toFixed(1) : "?"} px while it was held (best of ${mirror.tries} frozen moment${mirror.tries === 1 ? "" : "s"}${mirror.notes.length ? `; discarded: ${mirror.notes.join(", ")}` : ""}); last paint ${overRight.paint}`);
  }

  // ===================================================================
  // E/F. The layout, with the lock live. The reticle and its tuition
  //      line are drawn over the fight, so they get the same measurement
  //      the cluster does — for BOTH hands, because a thing that fails to
  //      mirror lands in the half the cluster has just vacated.
  // ===================================================================
  for (const hnd of ["right-handed", "left-handed"]) {
    if (hnd === "left-handed") await flipHand("left");
    await waitForAlive().catch(() => {});
    await waitForLock().catch(() => {});
    // A frame, because a reticle is a visual claim and the DOM scan above only
    // proves it is not in the way. This is the picture the owner can look at.
    const shot = resolve(ROOT, `art/shots/lock/${hnd}.png`);
    mkdirSync(dirname(shot), { recursive: true });
    await page.screenshot({ path: shot });
    console.log(`  SHOT    ${shot}`);
    const dead = await scanLookSide(page, hnd === "left-handed");
    const cells = dead.worst.reduce((n, [, c]) => n + c, 0);
    check(`${hnd}, lock live: the reticle takes no bite out of the button side`, cells === 0,
      cells === 0
        ? `every one of ${dead.total} sampled points still reaches the canvas or a combat button with the reticle and its tuition line drawn`
        : `${cells} of ${dead.total} points now reach neither: ${dead.worst.map(([w, c]) => `${w} (${c})`).join(", ")}`);
  }

  const end = await me(await seq());
  console.log(`[touchtest] act two: warrior finished on ${end ? end.hp.toFixed(0) : "?"} hp, state=${end ? end.state : "?"}`);
  await ctx.close();
}

async function main() {
  const buildId = resolve(ROOT, ".next/BUILD_ID");
  const useProd = existsSync(buildId);
  if (useProd && buildIsStale(buildId)) {
    console.log("[touchtest] WARNING: src/ is newer than .next — this run grades the last build, not your edit. `npm run build` first.");
  }
  console.log(`[touchtest] starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
  server = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);

  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    headless: !HEADED,
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  // hasTouch is what the game reads to decide it is on a phone
  // (navigator.maxTouchPoints), and it is also what makes the CSS pixels the
  // touches are dispatched in line up with the ones the layout is measured in.
  const ctx = await browser.newContext({ viewport: SCREEN, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  // Same minute and a half act two gives itself, and for the same reason: a
  // loaded box is not a defect in the control scheme. See the note there.
  page.setDefaultTimeout(90000);
  page.on("pageerror", (e) => console.log(`[page-error] ${e}`));

  // Pinned low for the same reason playtest pins it: this box has no GPU and
  // the control path is what is under test, not the renderer.
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });

  // ---- reach the fight ----
  // An empty ring, as in playtest: an AI that kills the test warrior takes every
  // assertion with it, and a corpse neither strafes nor swings. It also leaves
  // the facing assist with nothing to lean at, which is what these three
  // assertions want — they are about the thumb, not about the help it gets.
  await page.getByText("Training", { exact: false }).first().click();
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
  const fewer = page.getByLabel("Fewer AI warriors");
  for (let i = 0; i < 8 && await fewer.isEnabled().catch(() => false); i++) {
    await fewer.click();
  }
  await page.getByText("DRAW STEEL", { exact: false }).first().click();
  await page.waitForFunction(() => window.__probe?.lastState?.state === "fighting", null, { timeout: 60000 });
  console.log("[touchtest] in a fight\n");

  const { me, seq, wait, now, afterInput, settle } = probeReader(page);

  // The mobile cluster only exists once the game believes it is on a phone, so
  // its absence is a failure of the whole run rather than of one assertion.
  const slashBtn = page.getByLabel("Slash");
  await slashBtn.waitFor({ state: "visible", timeout: 20000 });
  const box = await slashBtn.boundingBox();
  const SLASH = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  console.log(`[touchtest] slash button at ${Math.round(SLASH.x)},${Math.round(SLASH.y)} on a ${SCREEN.width}x${SCREEN.height} screen\n`);

  // =====================================================================
  // 0. The layout, before a finger touches it. Two claims in
  //    docs/MOBILE-CONTROLS.md are geometry rather than behaviour and no
  //    amount of dragging proves them: that the buttons carve themselves
  //    out of free-look leaving no dead gutters, and that they do not sit
  //    on top of anything. Both are measured off the DOM, so a layout
  //    change that quietly reintroduces either fails here rather than in
  //    someone's hand.
  // =====================================================================
  // Every point on the look side must reach either the canvas — where a drag
  // becomes yaw — or a control the player is deliberately pressing. Anything
  // else standing there is a patch of screen where a drag silently does
  // nothing, which is the exact complaint the rebuild set out to answer: the
  // old zone ignored the bottom third and players read that as broken.
  // Run for both handednesses, because everything drawn over the fight has to
  // mirror and the pieces that do not are invisible until someone flips it.
  const checkLookSideIsClear = async (hand, note = "") => {
    const dead = await scanLookSide(page, hand === "left-handed");
    const deadCells = dead.worst.reduce((n, [, c]) => n + c, 0);
    check(`${hand}: no patch of the free-look side swallows a drag${note}`, deadCells === 0,
      deadCells === 0
        ? `every one of ${dead.total} sampled points on the look side reaches the canvas or a combat button`
        : `${deadCells} of ${dead.total} sampled points reach neither the canvas nor a combat button: ${
          dead.worst.map(([w, c]) => `${w} (${c})`).join(", ")}`);
  };

  {
    await checkLookSideIsClear("right-handed");

    // And nothing is drawn on top of anything. Buttons that overlap steal each
    // other's presses; a readout under a button is a number the player cannot
    // read, which is how the ability cooldown and the one line of tuition the
    // scheme gets were both being covered by the cluster.
    const collisions = await page.evaluate(() => {
      const hits = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const rect = (el) => el.getBoundingClientRect();
      const buttons = [...document.querySelectorAll("button")]
        .map((el) => ({ name: el.getAttribute("aria-label") || el.textContent.trim().slice(0, 18), r: rect(el) }))
        .filter((b) => b.r.width > 0);
      const out = [];
      for (let i = 0; i < buttons.length; i++) {
        for (let j = i + 1; j < buttons.length; j++) {
          if (hits(buttons[i].r, buttons[j].r)) out.push(`"${buttons[i].name}" overlaps "${buttons[j].name}"`);
        }
      }
      // Anything in the thumbs' half of the screen that the player is meant to
      // read rather than press. Leaves only, so one box is not reported once
      // per nested span, and only what is genuinely painted.
      const H = window.innerHeight;
      const readouts = [...document.querySelectorAll("div,span")].filter((el) => {
        if (el.querySelector("div,span") || el.closest("button")) return false;
        if (!el.textContent.trim()) return false;
        if (window.getComputedStyle(el).pointerEvents !== "none") return false;
        const r = rect(el);
        return r.width > 0 && r.height > 0 && r.top > H * 0.5;
      });
      for (const el of readouts) {
        for (const b of buttons) {
          if (hits(rect(el), b.r)) out.push(`"${b.name}" is drawn over "${el.textContent.trim().slice(0, 22)}"`);
        }
      }
      return out;
    });
    check("nothing in the cluster is drawn on top of anything else", collisions.length === 0,
      collisions.length ? collisions.join("; ") : "no button overlaps another button or covers a readout");
  }

  const cdp = await ctx.newCDPSession(page);
  const hand = makeHand(cdp);

  // Thumb ids. Real ones, in that nothing in the game may assume an order or a
  // count: the stick lands first here, but a third finger arrives mid-fight.
  const STICK = 1, LOOK = 2, SWING = 3, STRAY = 4;

  // Where each thumb lives. The stick is on the left half and clear of the top
  // strip input.ts refuses to read a stick from; the look thumb sits mid-screen
  // on the right, above every button footprint so the drag is a drag and not a
  // press. Both are derived from the viewport so a different phone still works,
  // and both swap sides for the left-handed pass at the end.
  const stickHome = { x: SCREEN.width * 0.23, y: SCREEN.height * 0.62 };
  const lookHome = { x: SCREEN.width * 0.56, y: SCREEN.height * 0.42 };

  /** Push the stick from where it was born, in a few steps like a thumb rolls.
   *  Dispatched as one batch: every awaited round trip is a stretch of walking
   *  that the man does anyway, because the server keeps acting on the last
   *  input it was given while this box gets round to sending the next one. */
  const pushStick = (dx, dy) => Promise.all([0.35, 0.7, 1].map(
    (f) => hand.move(STICK, stickHome.x + dx * f, stickHome.y + dy * f)));

  /** How far out of the middle of the ring he is standing. */
  const radius = (at) => Math.hypot(at.x, at.z);

  /**
   * The stick offset that walks a man along a world heading, given where his
   * camera is pointing. Movement is camera-relative and these tests turn the
   * camera, so a stick push in a fixed screen direction wanders around the
   * compass between one assertion and the next.
   */
  const stickFor = (at, wx, wz) => {
    const cos = Math.cos(at.rot), sin = Math.sin(at.rot);
    const len = Math.hypot(wx, wz) || 1;
    const dx = wx / len, dz = wz / len;
    return { x: (-cos * dx + sin * dz) * STICK_PUSH, y: (-sin * dx - cos * dz) * STICK_PUSH };
  };

  /**
   * A heading that crosses the ring at an angle — mostly inward, partly round
   * it. Every walk measured below runs along this one, because the two things
   * in the arena that eat a stride are at opposite extremes: the palisade
   * clamps him at the edge, and the bonfire burns him at the middle. A walk of
   * any length along this heading, from anywhere a test can leave him, reaches
   * neither. The alternative — walking him back to the middle between tests —
   * cannot be steered accurately enough on a box where a held stick overshoots
   * by half an arena, and it parked him in the fire.
   */
  const sweepDir = (at) => {
    const r = radius(at) || 1;
    // Aimed to pass the middle at SAFE_RADIUS rather than through it: the
    // tangential share of the heading is what sets the closest approach, and
    // the rest is inward. From anywhere in the ring this leaves at least ten
    // units of clear walking, which is more than any assertion here asks for.
    const round = Math.min(1, SAFE_RADIUS / r);
    const inward = Math.sqrt(Math.max(0, 1 - round * round));
    return {
      x: (-at.x / r) * inward + (-at.z / r) * round,
      z: (-at.z / r) * inward + (at.x / r) * round,
    };
  };
  const sweep = (at) => {
    const d = sweepDir(at);
    return stickFor(at, d.x, d.z);
  };

  /**
   * Turn the camera with the look thumb until it points a given way. Free-look
   * is 0.01 rad per pixel and the glass is only so wide, so a large turn takes
   * several drags. Used before the acceptance case: "left" is a direction on
   * the screen, and which way it goes in the world is the camera's business.
   */
  const turnCameraTo = async (targetYaw) => {
    for (let i = 0; i < 6; i++) {
      const at = await me(await seq());
      const delta = shortestAngle(at.rot, targetYaw);
      if (Math.abs(delta) < 0.1) return;
      await pressLook();
      await dragLook(Math.max(-120, Math.min(120, delta / 0.01)), 6);
      await hand.lift(LOOK);
      await wait(150);
    }
  };

  /** Where the look thumb currently is. Kept because free-look is integrated
   *  from deltas: a second drag that starts by measuring from where the thumb
   *  first landed drags the camera backwards over ground it already covered. */
  const lookAt = { x: lookHome.x };
  const pressLook = async () => {
    lookAt.x = lookHome.x;
    await hand.press(LOOK, lookHome.x, lookHome.y);
  };
  /** Drag across the look side in steps, so the client integrates it as a
   *  stream of small deltas rather than one teleport — and as one batch, for
   *  the same reason the stick is: a drag paced by this box's acknowledgements
   *  is not a drag, it is a series of separate ones. */
  const dragLook = (dx, steps = 8) => {
    const from = lookAt.x;
    const moves = [];
    for (let i = 1; i <= steps; i++) {
      lookAt.x = from + (dx * i) / steps;
      moves.push(hand.move(LOOK, lookAt.x, lookHome.y));
    }
    return Promise.all(moves);
  };

  const VECTOR = { left: [-1, 0], right: [1, 0], overhead: [0, -1], stab: [0, 1] };

  /** A thumb landing on SLASH and flicking, at the speed a thumb does it. */
  const flickSwing = async (dir) => {
    const [vx, vy] = VECTOR[dir];
    // The three events go out as one burst, without waiting for each to be
    // acknowledged. A flick is a few milliseconds of contact and then movement;
    // this box's renderer can hold the main thread for a third of a second, so
    // waiting on each ack stretches the gesture into something no hand could
    // make — the arming window expires between the touch and the flick, the
    // blow goes out in the last direction, and the harness has graded its own
    // latency. Held afterwards, then lifted, because SLASH is a hold-to-combo.
    await Promise.all([
      hand.press(SWING, SLASH.x, SLASH.y),
      hand.move(SWING, SLASH.x + vx * FLICK_PX * 0.5, SLASH.y + vy * FLICK_PX * 0.5),
      hand.move(SWING, SLASH.x + vx * FLICK_PX, SLASH.y + vy * FLICK_PX),
    ]);
    await wait(160);
    await hand.lift(SWING);
  };

  /**
   * The weakest stick deflection the client sent over a window, 0..1. Ground
   * covered is the honest end of "the stick still works", but the arena has a
   * palisade at ARENA_RADIUS=18 that stops a man dead, and a walk measured
   * against it reports nothing about the thumb. This reads the intent itself:
   * a finger the client has stopped tracking sends 0, so a floor near 1 over a
   * whole window is proof the stick was never dropped, wherever he is standing.
   */
  const weakestStick = (mark) => page.evaluate((t) => {
    const sent = window.__probe.sent.filter((s) => s.t >= t);
    if (!sent.length) return 0;
    return Math.min(...sent.map((s) => Math.hypot(s.d.moveX, s.d.moveZ)));
  }, mark);

  /** Every swing the server accepted since `mark`, oldest first. */
  const swingsSince = (mark) => page.evaluate((t) => window.__probe.swings.filter((s) => s.t >= t), mark);
  /**
   * The FIRST blow the server accepted after the gesture began — not the best
   * of them. SLASH is held for a combo, so a flick that reads a tick too late
   * still aims the swing after this one; taking the last swing would let the
   * harness pass on a blow the player never asked for, which is the exact
   * failure the arming window exists to prevent.
   */
  const nextSwing = async (mark, timeout = 6000) => {
    try {
      await page.waitForFunction((t) => window.__probe.swings.some((s) => s.t >= t), mark, { timeout });
    } catch { /* reported by the caller as "the server never saw a swing" */ }
    return (await swingsSince(mark))[0] || null;
  };

  /**
   * The gesture as the page felt it, for the report: how long after the thumb
   * landed it moved, how long after it landed the first attack went up the
   * wire, and what direction that attack carried. `gap` under GameHud's 90 ms
   * arming window is the difference between measuring the game and measuring
   * this box; `armLag` at about 90 ms means the timer fired the blow rather
   * than the flick.
   */
  const gestureShape = (mark, finger) => page.evaluate(([t, id]) => {
    const felt = window.__probe.touch.filter((e) => e.t >= t && e.ids.includes(id));
    const start = felt.find((e) => e.type === "touchstart");
    const move = start ? felt.find((e) => e.type === "touchmove" && e.t >= start.t) : null;
    const attacks = window.__probe.sent.filter((s) => s.t >= t && s.d.attack === true);
    return {
      gap: start && move ? Math.round(move.t - start.t) : null,
      armLag: start && attacks[0] ? Math.round(attacks[0].t - start.t) : null,
      wire: attacks.slice(0, 4).map((s) => s.d.attackDir),
    };
  }, [mark, finger]);

  const swingDetail = (swing, shape) => [
    swing ? `server locked in "${swing.dir}"` : "the server never accepted a swing",
    `wire: ${shape.wire.join(", ") || "no attack reached the server"}`,
    `flick read ${shape.gap ?? "never"}ms after touchdown, blow sent at ${shape.armLag ?? "never"}ms (90ms arming window)`,
  ].join("; ");
  /** A blow costs 13 stamina and the body is spent for the length of the swing;
   *  swinging again before both have cleared measures the cooldown, not the aim. */
  const readyToSwing = () => page.waitForFunction(() => {
    const s = window.__probe.lastState;
    if (!s) return false;
    const m = Object.values(s.players).find((p) => !String(p.id).startsWith("bot_"));
    return !!m && m.stamina > 45 && m.state !== "attacking";
  }, null, { timeout: 20000 });

  // =====================================================================
  // 1. The left stick moves the man, and moves nothing else.
  // =====================================================================
  // Pushed sideways rather than forward: the ring has a bonfire in the middle
  // and a palisade around it, and a tangential walk keeps the warrior off both
  // for the length of the run. Which way the stick goes is not the point.
  {
    const before = await settle();
    const push = sweep(before);
    await hand.press(STICK, stickHome.x, stickHome.y);
    await pushStick(push.x, push.y);
    await wait(900);
    const after = await afterInput();
    await hand.lift(STICK);

    const dist = Math.hypot(after.x - before.x, after.z - before.z);
    const dyaw = Math.abs(shortestAngle(before.rot, after.rot));
    check("left stick moves the warrior", dist > 3.0,
      `travelled ${dist.toFixed(2)} units while the stick was held at full deflection (a warden walks 4.5 u/s), from ${radius(before).toFixed(1)} to ${radius(after).toFixed(1)} units out of the middle`);
    // The whole binding fix in one number. The old scheme dragged the camera
    // round with the walk; anything above a rounding error here is that bug.
    check("left stick never turns the camera", dyaw < 0.01,
      `yaw moved ${dyaw.toFixed(4)} rad (${(dyaw * 57.3).toFixed(2)}°) while walking`);
  }

  // =====================================================================
  // 2. A right-side drag turns the camera, and turns nothing else.
  // =====================================================================
  {
    // settle() also waits out the stride left over from the walk above, so the
    // drag is measured on a man who is genuinely standing still.
    const before = await settle();
    await pressLook();
    await dragLook(SCREEN.width * 0.36);
    const after = await afterInput();
    await hand.lift(LOOK);

    const dyaw = Math.abs(shortestAngle(before.rot, after.rot));
    const dist = Math.hypot(after.x - before.x, after.z - before.z);
    check("right-side drag turns the camera", dyaw > 0.5,
      `yaw moved ${dyaw.toFixed(3)} rad (${(dyaw * 57.3).toFixed(1)}°) over a ${Math.round(SCREEN.width * 0.36)}px drag; free-look is 0.01 rad/px, so this is the whole drag and nothing else`);
    check("right-side drag never moves the warrior", dist < 0.25,
      `travelled ${dist.toFixed(3)} units while looking`);

    // 2b. AND THE SAME DRAG IS WHY. With nobody in the ring the lock has
    // nothing to hold, so the button side falls back to free-look exactly as it
    // did before lock-on existed — which is what the 0.9 rad above proves. The
    // lock's own state is read as well, because "free-look works" and "the lock
    // is off" are two different claims and a lock that was quietly holding a
    // corpse would satisfy only one of them.
    const idle = await page.evaluate(() => {
      const el = document.querySelector("[data-lock-reticle]");
      return {
        engaged: !!(window.__bretwaldaLock && window.__bretwaldaLock.engaged),
        target: (window.__bretwaldaLock && window.__bretwaldaLock.target) || null,
        blend: (window.__bretwaldaLock && window.__bretwaldaLock.blend) || 0,
        reason: (window.__bretwaldaLock && window.__bretwaldaLock.reason) || "?",
        // And the reticle is off with it. A lock mark left on the glass with
        // nothing behind it is a worse lie than no mark at all.
        reticle: el ? parseFloat(el.style.opacity || "0") : -1,
      };
    });
    check("no enemy near: free-look comes back and the lock stays off",
      !idle.engaged && idle.target === null && idle.blend < 0.02 && idle.reticle === 0 && dyaw > 0.5,
      `lock engaged=${idle.engaged}, target=${idle.target ?? "nobody"} ("${idle.reason}"), blend=${idle.blend.toFixed(3)}, reticle opacity ${idle.reticle}; the drag above still turned the camera ${(dyaw * 57.3).toFixed(1)}°`);
  }

  // =====================================================================
  // 3. The flick names the cut — all four of them.
  // =====================================================================
  for (const dir of ["left", "right", "overhead", "stab"]) {
    await readyToSwing();
    await wait(250);
    const mark = await now();
    await flickSwing(dir);
    const swing = await nextSwing(mark);
    check(`a ${dir} flick lands as a ${dir} cut`, swing?.dir === dir,
      swingDetail(swing, await gestureShape(mark, SWING)));
  }

  // =====================================================================
  // 4. THE ACCEPTANCE CASE — a swipe-up overhead while strafing left.
  //    The owner's exact complaint: under the old binding the swing
  //    direction was read off the movement stick, so a man walking left
  //    could only ever throw a left cut.
  // =====================================================================
  await readyToSwing();
  {
    // Point the camera so that strafing left carries him across the ring rather
    // than into the palisade. The test is about a flick surviving a strafe, and
    // a man pinned against a wall is not strafing.
    const stood = await settle();
    const d = sweepDir(stood);
    await turnCameraTo(Math.atan2(-d.z, d.x));
    await hand.press(STICK, stickHome.x, stickHome.y);
    await pushStick(-STICK_PUSH, 0);
    await wait(400); // up to speed, unmistakably strafing before the blow starts
    const before = await me(await seq());
    const mark = await now();
    await flickSwing("overhead");
    const swing = await nextSwing(mark);
    const shape = await gestureShape(mark, SWING);
    await wait(300);
    const after = await afterInput();
    await hand.lift(STICK);

    check("swipe-up overhead WHILE strafing left lands as an overhead", swing?.dir === "overhead",
      swingDetail(swing, shape));

    // And the strafe has to survive the swing, or the overhead was bought by
    // standing still. Movement is resolved in camera space, so the ground
    // covered is split along the man's facing: the left strafe runs along
    // (cos yaw, -sin yaw) and the swing's lunge runs straight ahead of him.
    const dx = after.x - before.x, dz = after.z - before.z;
    const lateral = dx * Math.cos(before.rot) - dz * Math.sin(before.rot);
    const forward = dx * Math.sin(before.rot) + dz * Math.cos(before.rot);
    check("the strafe keeps running under the overhead", lateral > 1.0,
      `${lateral.toFixed(2)} units left, ${forward.toFixed(2)} units of lunge forward`);
  }

  // =====================================================================
  // 5. The tap fallback. A scheme where the only way to attack is a
  //    gesture loses players in the first ten seconds.
  // =====================================================================
  await readyToSwing();
  {
    const mark = await now();
    await hand.press(SWING, SLASH.x, SLASH.y);
    await wait(60); // a tap, and a short one: no travel, nothing to read a direction from
    await hand.lift(SWING);
    const swing = await nextSwing(mark);
    const shape = await gestureShape(mark, SWING);
    check("a tap with no flick still attacks", !!swing,
      `${swing ? `server swung "${swing.dir}" from a bare tap` : "no swing"}; ${
        shape.gap === null ? "no movement in the gesture, as intended" : `unwanted travel read at ${shape.gap}ms`}`);
  }

  // =====================================================================
  // 5b. The shove button. One-shot like DODGE; the proof that the press
  //     became the deed is the server's own answer — the state or the 25
  //     stamina it costs — plus shove:true on the wire.
  // =====================================================================
  await readyToSwing();
  {
    const shoveBtn = page.getByLabel("Shove");
    const sb = await shoveBtn.boundingBox();
    const mark = await now();
    await hand.press(SWING, sb.x + sb.width / 2, sb.y + sb.height / 2);
    await wait(80);
    await hand.lift(SWING);
    const answered = await page.waitForFunction(() => (window.__probe.shoves || 0) > 0, null, { timeout: 6000 })
      .then(() => true).catch(() => false);
    const sawShove = await page.evaluate((t) => window.__probe.sent.some((s) => s.t >= t && s.d.shove === true), mark);
    check("the shove button reaches the server as a shove", sawShove && answered,
      `shove:true ${sawShove ? "sent" : "never sent"}; the server ${answered ? "entered \"shoving\" on the wire" : "never entered \"shoving\""}`);
  }

  // =====================================================================
  // 6. A stray third touch — a palm, a knuckle, a friend — must not take
  //    the stick or the drag away with it.
  // =====================================================================
  {
    // The look thumb turns the camera BEFORE the stick is pushed, not during.
    // Movement is camera-relative and the server keeps acting on the last stick
    // vector it was given, so a heading chosen before a 34° turn is a heading
    // into the palisade by the time the turn finishes — and a man pinned on the
    // palisade covers no ground for reasons that have nothing to do with a
    // stray finger. Both thumbs are still down together across the strays,
    // which is the whole assertion; only the order of the first two is fixed.
    await pressLook();
    await dragLook(60, 4);
    await wait(200);
    const stood = await settle();
    const push = sweep(stood);
    await hand.press(STICK, stickHome.x, stickHome.y);
    await pushStick(push.x, push.y);

    // Two of them, one on each side of the split, both while the first two
    // thumbs stay down: one is the palm heel on the moving side, the other is
    // the finger that rests on the glass over on the aiming side.
    await hand.press(STRAY, SCREEN.width * 0.2, SCREEN.height * 0.35);
    await wait(60);
    await hand.lift(STRAY);
    await hand.press(STRAY, SCREEN.width * 0.75, SCREEN.height * 0.3);
    await wait(60);
    await hand.lift(STRAY);

    // Everything below is measured AFTER the interlopers have come and gone,
    // and the stick and the drag are measured one at a time. They were read
    // together to begin with, and it cost nothing but a false failure: the
    // drag turns the camera, movement is camera-relative, so a walk measured
    // across a turn is a walk in a direction that changed halfway — into the
    // palisade often enough, where a man covers no ground and the stray touch
    // gets the blame for it.
    const walkFrom = await me(await seq());
    // A moving thumb, not a new one. The identifier that was down before the
    // strays landed is the one steering now, which is the whole assertion.
    const reaim = sweep(walkFrom);
    const stickMark = await now();
    await hand.move(STICK, stickHome.x + reaim.x, stickHome.y + reaim.y);
    await wait(400);
    const walked = await afterInput();
    const held = await weakestStick(stickMark);
    const dist = Math.hypot(walked.x - walkFrom.x, walked.z - walkFrom.z);
    // Both, and for different reasons: the deflection says the client never
    // stopped tracking that finger, the distance says the server acted on it.
    check("a stray third touch does not drop the stick", held > 0.9 && dist > 1.0,
      `every packet after the strays carried at least ${held.toFixed(2)} of full stick deflection, and he travelled ${dist.toFixed(2)} units, from ${radius(walkFrom).toFixed(1)} to ${radius(walked).toFixed(1)} units out of the middle (the palisade is at 18)`);

    await dragLook(SCREEN.width * 0.22);
    const turned = await afterInput();
    await hand.liftAll();
    const dyaw = Math.abs(shortestAngle(walked.rot, turned.rot));
    check("a stray third touch does not drop the free-look drag", dyaw > 0.6,
      `yaw moved ${dyaw.toFixed(3)} rad (${(dyaw * 57.3).toFixed(1)}°) after the same, with the stick still held`);
  }

  // =====================================================================
  // MARGIN — not a verdict, a measurement. GameHud gives a flick 90 ms to
  // read before it fires the blow in the last direction, and the server
  // locks that direction in for good. Everything above flicks like a
  // thumb that means it; this asks what a slow one gets, and prints it,
  // because the number belongs to whoever tunes SWIPE_ARM_MS next.
  // =====================================================================
  await readyToSwing();
  {
    const mark = await now();
    await hand.press(SWING, SLASH.x, SLASH.y);
    // The delay is started only once the page has felt the thumb land, so what
    // is being measured is a slow gesture rather than this box's input lag.
    await page.waitForFunction(([t, id]) => window.__probe.touch
      .some((e) => e.t >= t && e.type === "touchstart" && e.ids.includes(id)),
    [mark, SWING], { timeout: 10000, polling: 20 });
    await wait(SLOW_FLICK_MS);
    await Promise.all([
      hand.move(SWING, SLASH.x - FLICK_PX * 0.5, SLASH.y),
      hand.move(SWING, SLASH.x - FLICK_PX, SLASH.y),
    ]);
    await wait(160);
    await hand.lift(SWING);
    const swing = await nextSwing(mark);
    const shape = await gestureShape(mark, SWING);
    console.log(`  MARGIN  a LEFT flick read ${shape.gap ?? "never"}ms after touchdown — server swung "${
      swing?.dir ?? "nothing"}" (wire: ${shape.wire.join(", ") || "no attack reached the server"})`);
  }

  // =====================================================================
  // 7. The left-handed mirror, last because it moves the furniture. Both
  //    halves have to flip as one thing: the touch zones are input.ts's
  //    and the buttons are GameHud's, and a mirror that reaches only one
  //    of them parks a left-handed player's stick under his own attack
  //    cluster. Toggled through the HUD, with a thumb, like a player.
  // =====================================================================
  {
    await page.getByLabel("Switch to left-handed controls").tap();
    await wait(400);
    const flipped = await slashBtn.boundingBox();
    check("the left-handed toggle mirrors the button cluster", flipped.x + flipped.width / 2 < SCREEN.width / 2,
      `slash button centre moved from x=${Math.round(SLASH.x)} to x=${Math.round(flipped.x + flipped.width / 2)} on a ${SCREEN.width}px screen`);
    // The cluster is not the only thing over the fight. Anything that fails to
    // mirror with it lands in the free-look half it just vacated.
    await checkLookSideIsClear("left-handed");

    // The zones follow the buttons: the stick is now the right-hand side and
    // free-look is the left. Both thumbs swap seats, nothing else changes.
    stickHome.x = SCREEN.width * 0.77;
    lookHome.x = SCREEN.width * 0.38;

    const beforeStick = await settle();
    const mirroredPush = sweep(beforeStick);
    await hand.press(STICK, stickHome.x, stickHome.y);
    await pushStick(mirroredPush.x, mirroredPush.y);
    await wait(1000);
    const afterStick = await afterInput();
    await hand.lift(STICK);
    const dist = Math.hypot(afterStick.x - beforeStick.x, afterStick.z - beforeStick.z);
    const stickYaw = Math.abs(shortestAngle(beforeStick.rot, afterStick.rot));
    check("left-handed: the right-side stick moves the warrior, and only moves him",
      dist > 3.0 && stickYaw < 0.01,
      `travelled ${dist.toFixed(2)} units, yaw moved ${stickYaw.toFixed(4)} rad, ending ${radius(afterStick).toFixed(1)} units out of the middle`);

    const beforeLook = await settle();
    await pressLook();
    await dragLook(-SCREEN.width * 0.3);
    const afterLook = await afterInput();
    await hand.liftAll();
    const lookYaw = Math.abs(shortestAngle(beforeLook.rot, afterLook.rot));
    const lookDrift = Math.hypot(afterLook.x - beforeLook.x, afterLook.z - beforeLook.z);
    check("left-handed: the left-side drag turns the camera, and only turns it",
      lookYaw > 0.5 && lookDrift < 0.25,
      `yaw moved ${lookYaw.toFixed(3)} rad (${(lookYaw * 57.3).toFixed(1)}°), travelled ${lookDrift.toFixed(3)} units`);
  }

  const end = await me();
  console.log(`\n[touchtest] act one: warrior finished on ${end.hp.toFixed(0)} hp, state=${end.state}`);
  await ctx.close();

  await lockAct(browser, `http://127.0.0.1:${PORT}`, check);
  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n[touchtest] ${results.length - failed.length}/${results.length} touch assertions passing`);
  if (failed.length) {
    console.log("[touchtest] BROKEN:");
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error("[touchtest] failed:", e); process.exitCode = 1; })
  .finally(() => { if (server && !server.killed) server.kill("SIGTERM"); });
