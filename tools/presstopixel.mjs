#!/usr/bin/env node
// PRESSTOPIXEL — the other half of LAGGY, end to end, in a real browser.
//
//   npm run presstopixel
//   node tools/presstopixel.mjs --presses=12 --dev
//
// WHY THIS EXISTS. Two files in this drawer say the same thing about the same
// hole and neither could fill it:
//
//   latencytest.mjs  "end-to-end input latency is measured by nothing in this
//                     repository and that is a gap, not a phase."
//   janktest.mjs     "§1b PRESS TO AUTHORITY — the half of LAGGY that has never
//                     been measured. Input latency (the other half of LAGGY) IS
//                     MEASURED BY NOTHING IN THIS REPOSITORY."
//
// `janktest --phases=input` did close half of it: press to AUTHORITY, headless,
// no browser — the sim's own answer. What nothing measured is press to PIXEL:
// the part a player actually experiences, which includes the two stages a
// headless probe cannot see at all.
//
//   press  ->  AUTHORITY   the client's 62.5 Hz sampler, the wire, and up to a
//                          50 ms wait for the next server tick — read off the
//                          first snapshot that carries the consequence.
//   authority -> PIXEL     the snapshot has to survive a React commit, an
//                          effect and the frame loop before it is drawn.
//
// TWO SEGMENTS AND NOT THREE. A first cut split the first one at "sent" by
// tapping `ws.send`, and the tap proved unreliable — 5 input messages captured
// across 1.2 s of holding a key that demonstrably moved the man three metres.
// Rather than publish a decomposition built on a stream that drops most of what
// it is supposed to see, the split stops where the evidence is solid. The
// snapshot and the frame streams are both complete, and press-to-pixel — the
// number nothing in this repository measured — does not depend on the third.
//
// WHAT IT WATCHES, and why the camera rather than the man. `renderer.render` is
// wrapped from the page and the CAMERA's world position is recorded on every
// draw. The camera follows the local warrior, so a forward press moves it — and
// unlike the rig it needs no scene traversal and no new hook in the client, just
// the handle `GameCanvas` already publishes as `__bretwaldaRenderer`. A frame is
// the unit a player sees, so a frame is the unit this counts in.
//
// THE NOISE FLOOR IS MEASURED, NOT ASSUMED. The camera is never perfectly still
// — idle sway, breathing, the interpolator settling — so a second of baseline is
// recorded before every press and the trigger is the baseline's own worst
// excursion times a margin. Without that this would report the latency of the
// idle bob.
//
// It reports a DISTRIBUTION and not a number. One press is a sample of a
// 20 Hz grid; the median is the honest middle and p90 is what a player
// remembers.
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_DIE = resolve(ROOT, "tools/seeddie.mjs");
const PORT = parseInt(process.env.PORT || String(4240 + (process.pid % 40)), 10);
const argv = process.argv.slice(2);
const flag = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split("=")[1] : d; };
const PRESSES = Number(flag("presses", 10));
const USE_DEV = argv.includes("--dev");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};
const q = (xs, p) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] : NaN);

/**
 * Installed before any bundle runs.
 *
 * The WebSocket tap is playtest's, kept deliberately identical: it is the only
 * place the client's OWN send time can be read, and two probes disagreeing about
 * when a press left would be worse than one.
 */
const PROBE = () => {
  const w = window;
  w.__ptp = { sent: [], states: [], frames: [], wrapped: false };
  const RealWS = w.WebSocket;
  function TappedWS(...a) {
    const ws = new RealWS(...a);
    const send = ws.send.bind(ws);
    ws.send = (payload) => {
      try {
        const m = JSON.parse(payload);
        if (m.type === "input") w.__ptp.sent.push({ t: performance.now(), d: m.data });
      } catch { /* not ours */ }
      return send(payload);
    };
    ws.addEventListener("message", (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === "game_state" && m.data && m.data.players) {
          w.__ptp.states.push({ t: performance.now(), players: m.data.players });
          if (w.__ptp.states.length > 400) w.__ptp.states.shift();
        }
      } catch { /* not ours */ }
    });
    return ws;
  }
  TappedWS.prototype = RealWS.prototype;
  Object.assign(TappedWS, RealWS);
  w.WebSocket = TappedWS;
};

/** Wrap the renderer once it exists, and log the camera on every draw. */
const WRAP = () => {
  const w = window;
  const r = w.__bretwaldaRenderer;
  if (!r || w.__ptp.wrapped) return !!w.__ptp.wrapped;
  const real = r.render.bind(r);
  r.render = (scene, camera) => {
    // The DRAWN camera, read at the instant of the draw call. Position only:
    // a forward press moves the man and the camera rides him, and position is
    // one number per axis rather than a quaternion to unpack.
    // TAGGED BY CAMERA, because `render` is called with SEVERAL of them.
    //
    // The first cut of this recorded every call into one stream and reported
    // that a motionless camera moved 10.45 m in a still second. It had not: the
    // game's perspective camera shares this call with the 3D HUD's and the post
    // chain's, both of which sit at the origin, so the "movement" was the gap
    // between two different cameras. Keyed by uuid, and the analysis picks the
    // stream that actually travels.
    if (camera && camera.position && camera.uuid) {
      w.__ptp.frames.push({
        t: performance.now(), id: camera.uuid,
        x: camera.position.x, y: camera.position.y, z: camera.position.z,
      });
      if (w.__ptp.frames.length > 6000) w.__ptp.frames.shift();
    }
    return real(scene, camera);
  };
  w.__ptp.wrapped = true;
  return true;
};

const waitForServer = (url, timeoutMs = 60000) => new Promise((done, no) => {
  const t0 = Date.now();
  const tick = async () => {
    if (Date.now() - t0 > timeoutMs) return no(new Error(`server never came up at ${url}`));
    try { const r = await fetch(url); if (r.ok) return done(); } catch { /* not yet */ }
    setTimeout(tick, 250);
  };
  tick();
});

let server;
async function main() {
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID")) && !USE_DEV;
  console.log("PRESSTOPIXEL — press to authority to frame, in a real browser\n");
  server = spawn("node", ["--import", SEED_DIE, useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
  });
  watchBoot(server, "presstopixel");
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);

  const browser = await chromium.launch({ ...launchOptions() });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  page.on("pageerror", (e) => console.log(`  [page-error] ${e}`));

  // An EMPTY ring. A bot landing a blow moves the camera on its own account and
  // would be read as this press arriving.
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });
  await page.getByText("Training", { exact: false }).first().click();
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
  const fewer = page.getByLabel("Fewer AI warriors");
  for (let i = 0; i < 10 && await fewer.isEnabled().catch(() => false); i++) await fewer.click();
  await page.getByText("DRAW STEEL", { exact: false }).first().click();
  const skip = page.getByText("TAKE ME TO THE WAR", { exact: false }).first();
  for (let i = 0; i < 20; i++) {
    if (await skip.isVisible().catch(() => false)) { await skip.click().catch(() => {}); break; }
    await page.waitForTimeout(500);
  }
  let inFight = false;
  for (let i = 0; i < 80 && !inFight; i++) {
    inFight = await page.evaluate(() => {
      const t = document.body.innerText || "";
      return /\d+\s+ALIVE/.test(t) && /\d+:\d\d/.test(t) && !/TO ARMS/.test(t);
    });
    if (!inFight) await page.waitForTimeout(500);
  }
  // FOCUS THE CANVAS FIRST, or the keyboard goes nowhere.
  //
  // Without this the harness reported a clean 220 ms press-to-pixel while every
  // input message it captured carried `moveZ: 0` — the key never reached the
  // game and what it timed was the man drifting and the camera settling. That is
  // the exact failure this repository has a discipline about, committed by the
  // instrument built to measure it. `playtest` clicks here for the same reason
  // and says so on the same line.
  await page.locator("canvas").click({ position: { x: 550, y: 380 } }).catch(() => {});
  await page.waitForTimeout(400);

  const wrapped = await page.evaluate(WRAP);
  console.log(`  in a fight: ${inFight}   renderer wrapped: ${wrapped}`);
  if (!inFight || !wrapped) {
    console.log("\n  VOID — no running fight, or no renderer to watch. Nothing here is a measurement.");
    await browser.close(); server.kill(); process.exit(2);
  }

  const toState = [], toPixel = [], total = [];
  let noiseWorst = 0, missed = 0, unsettled = 0;
  for (let n = 0; n < PRESSES; n++) {
    // ---- a second of stillness, to learn what "not moving" looks like ------
    await page.evaluate(() => { const w = window; w.__ptp.frames.length = 0; w.__ptp.sent.length = 0; });
    await page.waitForTimeout(1000);
    const base = await page.evaluate(() => {
      const f = window.__ptp.frames;
      if (f.length < 8) return null;
      // THE GAME'S CAMERA IS THE ONE THAT IS NOT AT THE ORIGIN. The HUD's and
      // the post chain's both sit there; the arena's lens does not. Chosen by
      // distance from origin rather than by name, because neither carries one.
      const by = new Map();
      for (const p of f) {
        const g = by.get(p.id) ?? { id: p.id, pts: [], far: 0 };
        g.pts.push(p); g.far = Math.max(g.far, Math.hypot(p.x, p.z));
        by.set(p.id, g);
      }
      let best = null;
      for (const g of by.values()) if (!best || g.far > best.far) best = g;
      if (!best || best.far < 0.5 || best.pts.length < 6) return null;
      const pts = best.pts, a = pts[0];
      let worst = 0;
      for (const p of pts) worst = Math.max(worst, Math.hypot(p.x - a.x, p.z - a.z));
      return {
        cam: best.id, cameras: by.size, worst,
        at: { x: pts[pts.length - 1].x, z: pts[pts.length - 1].z },
        frames: pts.length,
      };
    });
    if (!base) continue;
    // A "still" second in which the lens moved half a metre is not a baseline,
    // it is a camera still coming to rest. Skipped rather than used, because a
    // bad noise floor silently becomes a bad threshold.
    if (base.worst > 0.5) { unsettled++; continue; }
    noiseWorst = Math.max(noiseWorst, base.worst);
    // TWICE the idle excursion, floored at 4 cm. It tracks the noise so a quiet
    // second cannot fool it, and it is kept SMALL on purpose: a displacement
    // trigger charges the reading for the time taken to cross it, so every
    // centimetre here is latency this instrument invents. Two was as low as it
    // would go without the idle sway itself tripping it.
    const trip = Math.max(0.04, base.worst * 2);

    // Where the man actually stands, off the last snapshot. The first cut
    // compared against (0,0) — the arena's origin, not his mark — so "he has
    // moved 0.05 m" was true before the press.
    const startAt = await page.evaluate(() => {
      const st = window.__ptp.states[window.__ptp.states.length - 1];
      if (!st) return { x: 0, z: 0 };
      for (const k of Object.keys(st.players)) {
        if (!k.startsWith("bot_")) return { x: st.players[k].position.x, z: st.players[k].position.z };
      }
      return { x: 0, z: 0 };
    });
    const pressAt = await page.evaluate(() => performance.now());
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(900);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(300);

    const r = await page.evaluate(({ pressAt: p0, trip: tr, from }) => {
      const w = window;
      const me = (pl) => { for (const k of Object.keys(pl)) if (!k.startsWith("bot_")) return pl[k]; return null; };
      // THE PRESS LANDED, or this is not a sample.
      //
      // A metre, and the state reading "walking" — not the 0.05 m the first cut
      // used. That threshold was inside the drift a standing man already has,
      // so it fired before the key was down and the harness timed the
      // interpolator settling while reporting a latency.
      let authority = null, far = 0;
      for (const s2 of w.__ptp.states) {
        if (s2.t < p0) continue;
        const m = me(s2.players);
        if (!m || !m.position) continue;
        const d = Math.hypot(m.position.x - from.x0, m.position.z - from.z0);
        far = Math.max(far, d);
        // THE STATE EDGE, not a distance. `walking` appears on the first tick
        // the server accepts the input, so it is the authority's own answer
        // with nothing added. The first cut waited for 0.30 m of travel, which
        // at a walk is 60 ms of walking baked into a latency reading — the
        // instrument charging the game for its own threshold.
        if (authority === null && m.state === "walking") authority = s2.t - p0;
      }
      const frame = w.__ptp.frames.find((f) => f.t >= p0 && f.id === from.cam
        && Math.hypot(f.x - from.x, f.z - from.z) > tr);
      return { authority, frame: frame ? frame.t - p0 : null, far };
    }, { pressAt, trip, from: { ...base.at, cam: base.cam, x0: startAt.x, z0: startAt.z } });

    if (process.env.PTP_DEBUG) console.log(`    [dbg] ${JSON.stringify(r)}`);
    // He never went anywhere: the key did not reach the game, and nothing that
    // follows would be about this press.
    if (r.far < 0.8 || r.authority === null) { missed++; }
    else {
      toState.push(r.authority);
      if (r.frame !== null) { toPixel.push(r.frame - r.authority); total.push(r.frame); }
    }

    // Walk back so the next press starts from rest and from the same ground.
    await page.keyboard.down("KeyS");
    await page.waitForTimeout(900);
    await page.keyboard.up("KeyS");
    // LONG ENOUGH TO ACTUALLY STOP. 400 ms was not: the baseline second that
    // followed caught the camera still decelerating and called 9.3 m of
    // deceleration "idle drift", which put the trigger threshold at 37 m and
    // lost the next press entirely.
    await page.waitForTimeout(1200);
  }

  await browser.close();

  const line = (label, xs, note = "") => {
    if (!xs.length) { console.log(`    ${label.padEnd(22)} (no samples)`); return; }
    console.log(`    ${label.padEnd(22)} median ${q(xs, 0.5).toFixed(0).padStart(4)} ms   p90 ${q(xs, 0.9).toFixed(0).padStart(4)} ms   worst ${Math.max(...xs).toFixed(0).padStart(4)} ms   n=${xs.length}${note ? `   ${note}` : ""}`);
  };
  console.log(`\n  ${total.length} of ${PRESSES} presses measured; the arena lens never drifted more than ${(noiseWorst * 100).toFixed(1)} cm while still\n`);
  line("press -> authority", toState, "sampler + wire + up to 50 ms of tick");
  line("authority -> pixel", toPixel, "commit, effect, frame loop");
  console.log("");
  line("PRESS -> VISIBLE MOTION", total, "what a player feels");
  console.log("");

  if (missed) console.log(`  ${missed} press(es) never reached the game and were discarded, not timed.`);
  if (unsettled) console.log(`  ${unsettled} run(s) skipped: the lens had not come to rest, so there was no noise floor to set a threshold from.`);
  if (missed || unsettled) console.log("");
  if (total.length < 4) {
    console.log(`  VOID — only ${total.length} press(es) produced a reading${missed ? `, and ${missed} never reached the game` : ""}. Nothing here is a measurement.`);
    server.kill(); process.exit(2);
  }

  // THE BARS, set off the arithmetic and then checked against a healthy run.
  //
  // A press waits a mean 8 ms for the 62.5 Hz sampler and a mean 25 ms for the
  // 20 Hz tick before anything is wrong, so ~33 ms is free by construction and a
  // budget under it would be a budget against the clock. Measured on a healthy
  // GPU run, 10 presses: authority p90 62 ms, pixel p90 64 ms, total median
  // 97 ms / p90 126 ms.
  //
  // Set at roughly 1.6x that — loose enough that a loaded box does not cry wolf,
  // tight enough that a doubling cannot pass. This is a RATCHET on a number that
  // nothing measured at all until now; the point is that it will say when it
  // moves, not that 100 ms is a design target somebody chose.
  check("the sim answers a press inside its sampler, the wire and a tick",
    q(toState, 0.9) <= 100, `p90 ${q(toState, 0.9).toFixed(0)} ms — 8 ms of sampler and 25 ms of tick are free`);
  check("and the answer is drawn without a second wait of its own",
    q(toPixel, 0.9) <= 110, `p90 ${q(toPixel, 0.9).toFixed(0)} ms from authority to frame`);
  check("press to visible motion stays inside what a 20 Hz sim can honestly promise",
    q(total, 0.5) <= 150 && q(total, 0.9) <= 200,
    `median ${q(total, 0.5).toFixed(0)} ms, p90 ${q(total, 0.9).toFixed(0)} ms`);

  console.log(`\n[presstopixel] ${pass} passed, ${fail} failed`);
  server.kill();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); server?.kill(); process.exit(1); });
