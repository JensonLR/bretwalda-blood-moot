#!/usr/bin/env node
// ============================================================
// LOCKSHOT — a frame of the lock mark, on a man, on demand.
//
//   npm run build && node tools/lockshot.mjs
//
// The lock mark is the most-seen element in the game: it is on the glass every
// second of every fight. touchtest proves it is in the RIGHT PLACE and that it
// takes no bite out of the button side; neither of those is a statement about
// whether it is any good to look at, and that question has to be answered by
// looking. touchtest's own frames could not answer it either — they are taken
// at the end of a four-minute fight, best-effort, and the warrior is often dead
// by then with nobody left to hold. Three of them in a row came back with an
// empty field in them.
//
// So this stands a fight up, waits until the mark is actually on a man AT A
// SENSIBLE RANGE, and takes:
//
//   art/shots/lock/<hand>.png        the whole phone screen, 390x844 at DPR 3
//   art/shots/lock/<hand>-close.png  a 180px box around the mark, same DPR
//
// for both handednesses, printing the projection behind each one so the picture
// can be checked against the arithmetic that made it. It asserts nothing. It is
// for eyes.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = parseInt(process.env.PORT || String(3730 + (process.pid % 40)), 10);
const SCREEN = { width: 390, height: 844 };
/** Where a man is well framed: close enough to read, not on the lens. */
const WANT_RANGE = { min: 2.6, max: 7.0 };
/** Size of the close-up, in CSS pixels. Tall, because the mark has a top
 *  half on his chest and a bottom half on the ground under him. */
const CLOSE_W = 190;
const CLOSE_H = 260;

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
 * The socket tap the other harnesses use, plus a SHUTTER.
 *
 * A screenshot of this page is not instant — software rasterising 1170x2532 at
 * DPR 3 takes long enough that the fight has moved on by the time it lands, and
 * the fight moves in metre-long jumps here because the page paints about once a
 * second. Measured: the mark drifted 414 px between the gate passing and the
 * shutter closing, which is most of a phone screen, and three captures in a row
 * came back with an empty field in them.
 *
 * So `__freeze` stops the wire at the client's own door: the snapshot the app
 * has is the last one it will get, `render/anim.ts` runs out its 0.22 s of
 * extrapolation, and everything stands still. The socket is NOT closed —
 * closing it would put a reconnect overlay across the picture — the app simply
 * stops being told anything, which it cannot tell from a quiet moment.
 */
const PROBE = () => {
  const w = window;
  w.__probe = { lastState: null };
  w.__freeze = false;
  const RealWS = window.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (String(url).includes("/ws")) {
      ws.addEventListener("message", (ev) => {
        // The probe freezes with the app. Otherwise the readout describes a
        // fight that has moved on while the picture describes one that has not,
        // and every number printed beside the shot is about a different moment
        // than the shot — which is how a 6 m "lead" came to be printed under a
        // frame in which the mark was sitting squarely on the man.
        if (w.__freeze) return;
        try {
          const m = JSON.parse(ev.data);
          if (m.type === "game_state" || m.type === "countdown") w.__probe.lastState = m.data;
        } catch { /* ignore */ }
      });
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
    }
    return ws;
  }
  TappedWS.prototype = RealWS.prototype;
  Object.assign(TappedWS, RealWS);
  w.WebSocket = TappedWS;
};

async function main() {
  const buildId = resolve(ROOT, ".next/BUILD_ID");
  const useProd = existsSync(buildId);
  console.log(`[lockshot] starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
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
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  const ctx = await browser.newContext({ viewport: SCREEN, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  page.on("pageerror", (e) => console.log(`[page-error] ${e}`));
  // Quality is NOT pinned low here. Everything else in the toolchain pins it
  // because the control path is what is under test; this is a picture, and a
  // picture of the mark wants the grade the player sees behind it.
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });

  const step = async (text) => {
    const el = page.getByText(text, { exact: false }).first();
    await el.waitFor({ state: "visible" });
    await el.click();
  };
  await step("Training");
  await step("MUSTER THE TESTGROUNDS");
  // Recruits, and three of them: the mark has to be judged in the case it is
  // for, which is more than one man on the screen at once.
  await step("RECRUIT");
  const fewer = page.getByLabel("Fewer AI warriors");
  for (let i = 0; i < 8 && await fewer.isEnabled().catch(() => false); i++) await fewer.click();
  const more = page.getByLabel("More AI warriors");
  for (let i = 0; i < 3; i++) await more.click();
  await step("DRAW STEEL");
  await page.waitForFunction(() => window.__probe?.lastState?.state === "fighting", null, { timeout: 90000 });
  console.log("[lockshot] in the ring");

  /** The mark, up, on a live man, at a range worth photographing. */
  const framed = (want) => page.waitForFunction((w) => {
    const s = window.__probe.lastState;
    if (!s || (s.state !== "fighting" && s.state !== "last_stand")) return false;
    const me = Object.values(s.players).find((p) => !String(p.id).startsWith("bot_"));
    if (!me || me.state === "dead") return false;
    const L = window.__bretwaldaLock;
    if (!L || !L.engaged || L.blend < 0.95 || !L.target) return false;
    const foe = s.players[L.target];
    if (!foe || foe.state === "dead") return false;
    const range = Math.hypot(foe.position.x - me.position.x, foe.position.z - me.position.z);
    if (range < w.min || range > w.max) return false;
    const el = document.querySelector("[data-lock-reticle]");
    if (!el || parseFloat(el.style.opacity || "0") < 0.8) return false;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Comfortably inside the frame, and clear of the kill feed at the top.
    // Clear of the kill feed at the top and of the button cluster at the
    // bottom: a mark drawn behind the POWER button is a perfectly good mark
    // and a useless photograph.
    return cx > 70 && cx < window.innerWidth - 70 && cy > 170 && cy < window.innerHeight - 330;
  }, want, { timeout: 120000 });

  const readout = () => page.evaluate(() => {
    const p = (window.__bretwaldaCamera && window.__bretwaldaCamera.lockPaint) || {};
    const s = window.__probe.lastState;
    const me = s && Object.values(s.players).find((q) => !String(q.id).startsWith("bot_"));
    const foe = s && window.__bretwaldaLock && s.players[window.__bretwaldaLock.target];
    return {
      sx: p.sx, sy: p.sy, footY: p.footY, dist: p.dist, source: p.source,
      leadPx: p.leadPx, leadM: p.leadM, bodies: p.bodies,
      body: `${(p.bodyX || 0).toFixed(2)},${(p.bodyZ || 0).toFixed(2)}`,
      wire: `${(p.wireX || 0).toFixed(2)},${(p.wireZ || 0).toFixed(2)}`,
      target: window.__bretwaldaLock ? window.__bretwaldaLock.target : null,
      range: me && foe ? Math.hypot(foe.position.x - me.position.x, foe.position.z - me.position.z) : null,
      cls: foe ? foe.warriorClass : "?",
    };
  });

  const dir = resolve(ROOT, "art/shots/lock");
  mkdirSync(dir, { recursive: true });

  // BOTH HANDS OFF ONE FROZEN MOMENT.
  //
  // The two frames are a comparison, so they have to be a comparison of the
  // same thing: shooting them minutes apart in a moving fight compares two
  // different men at two different ranges in two different lights, and the one
  // thing it does not show is the mirror. With the wire held, the scene is
  // identical across the switch and the ONLY difference between the two frames
  // is the shoulder the camera looks over.
  const shots = [];
  for (let attempt = 0; attempt < 6 && shots.length < 2; attempt++) {
    shots.length = 0;
    await page.evaluate(() => { window.__freeze = false; });
    await framed(WANT_RANGE);
    // Shutter down, and then WAIT. Holding the wire does not stop the body on
    // its own: the interpolator renders in the past and this box runs its
    // render clock seconds behind, so it goes on playing out its backlog at
    // real-time rate until it runs past the newest snapshot. Then the follow
    // camera, which is a spring, has its own second of easing to do. Five
    // seconds is what it takes for two readings to agree.
    await page.evaluate(() => { window.__freeze = true; });
    await page.waitForTimeout(2500);

    for (const hand of ["right-handed", "left-handed"]) {
      if (hand === "left-handed") {
        const btn = page.getByLabel("Switch to left-handed controls");
        try {
          await btn.waitFor({ state: "visible", timeout: 15000 });
          await btn.tap({ timeout: 15000 });
        } catch { break; }
        // The camera walks to the other shoulder on a spring, like everything
        // else the rig does. Same settle again.
        await page.waitForTimeout(3000);
      }
      const before = await readout();
      const full = resolve(dir, `${hand}.png`);
      await page.screenshot({ path: full });
      const after = await readout();
      // Sideways only. With the wire held the bodies stop, but the follow
      // camera carries a walk bob off a snapshot that still says "running", so
      // the mark breathes a few pixels UP AND DOWN for as long as the page is
      // open. That is the camera doing its job and it does not move the mark
      // off the man; sideways drift is the one that ruins the photograph.
      const drift = Math.abs(after.sx - before.sx);
      // 25 px, not zero: with the wire held the bodies stand still but the rig
      // still breathes — the follow camera carries a walk bob and a decaying
      // shake — and a mark that wanders a fifteenth of the screen width between
      // two readings is still a mark the picture caught properly.
      if (drift > 20 || before.sx < 60 || before.sx > SCREEN.width - 60) {
        console.log(`        [retry] ${hand}: drift ${drift.toFixed(1)} px, mark x=${Math.round(before.sx)}`);
        break;
      }
      // A tall crop: the jaws are on his chest and the ground mark is at his
      // feet, and a picture of one without the other is half the mark.
      await page.screenshot({
        path: resolve(dir, `${hand}-close.png`),
        clip: {
          x: Math.max(0, Math.min(SCREEN.width - CLOSE_W, before.sx - CLOSE_W / 2)),
          y: Math.max(0, Math.min(SCREEN.height - CLOSE_H, before.sy - CLOSE_H * 0.35)),
          width: CLOSE_W, height: CLOSE_H,
        },
      });
      shots.push({ hand, ...before, drift });
    }
    // Back to right-handed for the next attempt, if there is one.
    if (shots.length < 2) {
      await page.evaluate(() => { window.__freeze = false; });
      try {
        const back = page.getByLabel("Switch to right-handed controls");
        await back.waitFor({ state: "visible", timeout: 10000 });
        await back.tap({ timeout: 10000 });
      } catch { /* it will be found on the next pass */ }
    }
  }

  for (const r of shots) {
    console.log(`  SHOT  ${resolve(dir, `${r.hand}.png`)}`);
    console.log(`  SHOT  ${resolve(dir, `${r.hand}-close.png`)}`);
    console.log(`        ${r.hand}: mark at ${Math.round(r.sx)},${Math.round(r.sy)}, his feet at y=${Math.round(r.footY)},`
      + ` ${r.range === null ? "?" : r.range.toFixed(1)} m from the warrior (${r.dist.toFixed(1)} m from the camera), a ${r.cls},`
      + ` painted off the ${r.source} at ${r.body} while the wire said ${r.wire}`
      + ` — ${Math.round(r.leadPx)} px / ${r.leadM.toFixed(2)} m of lead;`
      + ` the mark moved ${r.drift.toFixed(1)} px while the shutter was open`);
  }
  if (shots.length === 2) {
    console.log(`\n[lockshot] the one handedness switch, with the fight held still and nothing else changed:`
      + ` the same man's mark moved from x=${Math.round(shots[0].sx)} to x=${Math.round(shots[1].sx)}`
      + ` — ${Math.round(shots[1].sx - shots[0].sx)} px on a ${SCREEN.width} px screen`);
  } else {
    console.log(`\n[lockshot] only ${shots.length} of 2 frames came out; the fight would not hold still long enough`);
  }

  await page.evaluate(() => { window.__freeze = false; });
  await ctx.close();
  await browser.close();
}

main()
  .then(() => { server?.kill(); process.exit(0); })
  .catch((e) => { console.error("[lockshot] failed:", e); server?.kill(); process.exit(1); });
