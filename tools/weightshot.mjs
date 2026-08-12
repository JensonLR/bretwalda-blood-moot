#!/usr/bin/env node
// ============================================================
// WEIGHTSHOT — WATCH IT MOVE. A strip of frames across the things this wave
// built, drawn by the real client from the real server's own numbers.
//
//   npm run build && node tools/weightshot.mjs [--out art/shots/weight]
//
// WHY A STRIP AND NOT A STILL. Everything else in this toolchain photographs a
// SETTLED POSE: `shoot` runs the sim until the lerps stop and then presses the
// shutter, which is exactly right for a helmet and exactly wrong for weight.
// Weight happens over time — a wind-up you can read, a man going down and
// getting back up — and a still of any one of those is indistinguishable from a
// still of a man standing oddly. PROCESS.md R5 says open the render; this
// wave's version is open the render AND WATCH IT MOVE.
//
// ---------------------------------------------------------------------------
// HOW IT IS TAKEN, AND WHY IT IS NOT A BURST.
//
// The obvious harness is a burst: play a fight, screenshot as fast as the box
// will go, tile the frames. THAT WAS BUILT FIRST AND IT DOES NOT WORK HERE, and
// the failure is worth recording because the next person will reach for it too.
// On this software-rasterised box one 720x420 screenshot costs about SEVEN
// SECONDS. The first run of the burst version reported, verbatim:
//
//     [weightshot] knockdown: 1 frames over 7727 ms — states idle
//
// One frame. A knockdown lasts 1.30 s, so a burst cannot see one at all: by the
// time the second shutter closes the man has been up for five seconds. A strip
// assembled from that is a strip of one moment repeated, and it would have LOOKED
// like a working harness — same file name, same tiled output, same green run.
//
// So the frames are taken as a LADDER instead. Step 1 runs a real knockdown and
// a real swing on the real `makeEngine`, headlessly, and records the server's
// own per-tick values — `state`, `downTimer`, `attackPhase`, `swingT`. Step 2
// stands a real fight up in a real browser and stamps those recorded values onto
// the local warrior one at a time, taking one screenshot each.
//
// What that buys, and what it costs, stated plainly:
//
//   HONEST     every frame is the live client, the live rig, the live camera
//              and the live grade, drawing values the authoritative sim
//              actually produced during a fall it actually simulated. Nothing
//              in the pose is invented by this file.
//   NOT REAL-TIME  the frames are 1/20 s apart in SIM time and seconds apart in
//              wall time. It is a flip-book, not a video. It cannot show you a
//              tearing or a hitch between frames — for that you have to play it.
//
// It asserts nothing. `tools/weightprobe.mjs` owns the numbers.
//
//   knockdown.png   the fall and the get-up, 8 frames across the 1.30 s
//   swing.png       a berserker heavy: wind-up, contact, recovery
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { makeEngine } from "../src/game/engine.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = parseInt(process.env.PORT || String(3860 + (process.pid % 30)), 10);
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "art/shots/weight";
// Small, because every pixel is seconds. Big enough to read a body at fight
// distance, which is all this has to do.
const SCREEN = { width: 520, height: 380 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * The box around the local warrior in an over-shoulder view, in CSS pixels.
 * He is drawn slightly left of centre and low, because the camera sits over his
 * right shoulder and the ground he stands on is the bottom third of the frame.
 * Hand-set against a capture rather than derived — a derived crop would need
 * the camera's projection, which is `render/camera.ts` and not this unit's.
 */
const CROP = { left: 90, top: 90, width: 300, height: 270 };

// ===================================================================== step 1
// RECORD, off the real engine. Same fixture shape as weightprobe: two seated
// men, one act, and the server's own per-tick record of it.

const NEUTRAL = {
  moveX: 0, moveZ: 0, rotationY: 0, sprint: false, attack: false, heavyAttack: false,
  block: false, dodge: false, crouch: false, ability: false, shove: false, attackDir: "right",
};

function record() {
  const sim = makeEngine({ autoTick: false, epoch: 1e12 });
  const seat = (name) => {
    const c = { byType: new Map(), snapshot: null };
    c.sid = sim.connect((str) => {
      const m = JSON.parse(str);
      if (!c.byType.has(m.type)) c.byType.set(m.type, []);
      c.byType.get(m.type).push(m.data);
      if (m.data && m.data.players) c.snapshot = m.data;
    });
    c.send = (t, d) => sim.message(c.sid, { type: t, data: d || {} });
    c.got = (t) => c.byType.get(t) || [];
    return c;
  };
  const a = seat(), b = seat();
  a.send("create", { name: "Atli", mode: "free_for_all", bestOf: 1 });
  const code = a.got("join")[0].code, aid = a.got("join")[0].playerId;
  b.send("join", { code, name: "Beorn" });
  const bid = b.got("join")[0].playerId;
  a.send("select_class", { warriorClass: "berserker" }); a.send("ready");
  // A WARDEN takes the fall, and the class matters. A shove costs 46 poise,
  // doubled to 92 against a man already reeling — which floors a warden (78)
  // and does NOT floor a huscarl (100, and the first attempt at this file used
  // one and recorded a zero-length knockdown). That is the poise table doing
  // exactly what it is for, and it is why the strip names its man.
  b.send("select_class", { warriorClass: "warden" }); b.send("ready");
  a.send("start");
  for (let i = 0; i < 200 && a.snapshot?.state !== "fighting"; i++) sim.step();
  const room = [...sim._rooms.values()][0];
  const A = room.players.get(aid), B = room.players.get(bid);
  const seatThem = () => {
    A.position.x = 0; A.position.z = 0; A.rotation = 0;
    B.position.x = 0; B.position.z = 1.2; B.rotation = Math.PI;
    for (const p of [A, B]) {
      p.moveVel = { x: 0, z: 0 }; p.impulse = { x: 0, z: 0 };
      p.velocity = { x: 0, y: 0, z: 0 };
      p.invincible = false; p.invincibleTimer = 0;
      p.stamina = p.maxStamina; p.health = p.maxHealth;
      p.aimYaw = p.rotation;
    }
  };
  const hold = (c, over) => c.send("input", { ...NEUTRAL, ...over });

  // ---- a real knockdown: B is already reeling, A shoves him over ----
  seatThem();
  B.state = "staggered"; B.staggerTimer = 0.4;
  hold(a, { shove: true });
  const fall = [];
  for (let i = 0; i < 60; i++) {
    sim.step();
    if (B.state === "knocked" || B.state === "rising") {
      fall.push({ state: B.state, downTimer: Number(B.downTimer.toFixed(3)), balance: Math.round(B.balance) });
    } else if (fall.length) break;
    hold(a, {});
  }

  // ---- a real berserker heavy, phase by phase ----
  seatThem();
  hold(a, { heavyAttack: true });
  const swing = [];
  for (let i = 0; i < 60; i++) {
    sim.step();
    if (A.state === "attacking") {
      swing.push({
        state: "attacking", attackPhase: A.attackPhase, attackPhaseT: Number(A.attackPhaseT.toFixed(3)),
        swingT: Number(A.swingT.toFixed(3)), swingDuration: A.swingDuration, swingHeavy: true,
        attackDir: A.attackDir,
      });
    } else if (swing.length) break;
    hold(a, {});
  }
  sim.stop();
  return { fall, swing };
}

// ===================================================================== step 2
// REPLAY, in a real browser. The tap rewrites the local warrior's fields on
// every snapshot the app receives, from `window.__pose`. It changes nothing
// else: the same client, rig, camera, lighting and grade a player sees.

const PROBE = () => {
  const w = window;
  w.__probe = { lastState: null };
  w.__pose = null;
  const RealWS = window.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (String(url).includes("/ws")) {
      ws.addEventListener("message", (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === "game_state" || m.type === "countdown") w.__probe.lastState = m.data;
        } catch { /* ignore */ }
      });
      // Sit in front of the app's own handler and rewrite the frame.
      Object.defineProperty(ws, "onmessage", {
        configurable: true,
        set(fn) { this.__app = fn; },
        get() { return this.__app; },
      });
      ws.addEventListener("message", (ev) => {
        if (typeof ws.__app !== "function") return;
        if (!w.__pose) return ws.__app(ev);
        let m;
        try { m = JSON.parse(ev.data); } catch { return ws.__app(ev); }
        if (m.data && m.data.players) {
          const me = Object.values(m.data.players).find((p) => !String(p.id).startsWith("bot_"));
          if (me) Object.assign(me, w.__pose);
        }
        ws.__app({ ...ev, data: JSON.stringify(m) });
      });
    }
    return ws;
  }
  TappedWS.prototype = RealWS.prototype;
  Object.assign(TappedWS, RealWS);
  w.WebSocket = TappedWS;
};

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

async function main() {
  const { fall, swing } = record();
  console.log(`[weightshot] recorded ${fall.length} ticks of a real knockdown`
    + ` (${fall[0]?.state} -> ${fall[fall.length - 1]?.state}, downTimer ${fall[0]?.downTimer} -> ${fall[fall.length - 1]?.downTimer})`);
  console.log(`[weightshot] recorded ${swing.length} ticks of a real berserker heavy`
    + ` (phases ${[...new Set(swing.map((s) => s.attackPhase))].join("/")})`);
  if (!fall.length) throw new Error("the engine produced NO knockdown — the strip would be a lie, so nothing is written");

  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  console.log(`[weightshot] starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
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
  const ctx = await browser.newContext({ viewport: SCREEN, deviceScaleFactor: 1 });
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  page.on("pageerror", (e) => console.log(`[page-error] ${e}`));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });

  const step = async (text) => {
    const el = page.getByText(text, { exact: false }).first();
    await el.waitFor({ state: "visible" });
    await el.click();
  };
  await step("Training");
  await step("MUSTER THE TESTGROUNDS");
  await step("RECRUIT");
  const fewer = page.getByLabel("Fewer AI warriors");
  for (let i = 0; i < 8 && await fewer.isEnabled().catch(() => false); i++) await fewer.click();
  await step("DRAW STEEL");
  await page.waitForFunction(() => window.__probe?.lastState?.state === "fighting", null, { timeout: 180000 });
  console.log("[weightshot] in the ring");
  // Take up the weapon: the click-to-lock banner sits across the top of the man
  // this harness exists to photograph, and the first run came back with eight
  // frames of CLICK TO TAKE UP YOUR WEAPON printed over the warrior's chest.
  //
  // NOT RELIABLE, and saying so rather than pretending. Pointer lock needs a
  // user gesture the browser accepts, and headless Chromium refuses it often
  // enough that the banner is still in about half the captures — it sits over
  // his HEAD rather than his body under the current CROP, so the fall is still
  // readable and the strip is still worth taking. Whoever fixes this properly
  // should hide the banner rather than fight the lock: `docs/KEYBINDS.md`
  // documents the same "a control that cannot work yet must say so" problem
  // from the other side.
  await page.mouse.click(SCREEN.width / 2, SCREEN.height / 2);
  await sleep(2500);

  mkdirSync(resolve(ROOT, OUT), { recursive: true });

  /** One frame per recorded tick, evenly sampled down to `cols`. */
  async function ladder(ticks, file, cols, label) {
    const take = ticks.length <= cols ? ticks
      : Array.from({ length: cols }, (_, i) => ticks[Math.round(i * (ticks.length - 1) / (cols - 1))]);
    const shots = [];
    for (const pose of take) {
      await page.evaluate((p) => { window.__pose = p; }, pose);
      // WAIT FOR PAINTS, not for a stopwatch. The first cut slept 420 ms and
      // the opening frames of the strip came back showing the pose BEFORE the
      // one asked for: on a software rasteriser this page paints roughly once a
      // second, so 420 ms of wall clock can be zero frames. Six rAF callbacks
      // is the honest condition — the layer weights are smoothed over a handful
      // of frames (`motion.blend` decays at 10/s), so the pose needs frames and
      // not milliseconds.
      await page.evaluate(() => new Promise((done) => {
        let n = 0;
        const cap = setTimeout(done, 6000);   // a page that has stopped painting
        const tick = () => (++n >= 3 ? (clearTimeout(cap), done()) : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }));
      await sleep(200);
      // Cropped to the warrior and doubled. Uncropped, at a size this box can
      // rasterise, the man is 150 px tall in the corner of a screen mostly full
      // of interface — which is a photograph of the HUD, not of the animation.
      const full = await page.screenshot({ type: "png" });
      shots.push(await sharp(full)
        .extract({ left: CROP.left, top: CROP.top, width: CROP.width, height: CROP.height })
        .resize(CROP.width * 2, CROP.height * 2, { kernel: "nearest" })
        .png().toBuffer());
    }
    await page.evaluate(() => { window.__pose = null; });
    const W = CROP.width * 2, H = CROP.height * 2;
    const perRow = Math.min(4, shots.length);
    const rows = Math.ceil(shots.length / perRow);
    await sharp({ create: { width: W * perRow, height: H * rows, channels: 3, background: { r: 12, g: 10, b: 8 } } })
      .composite(shots.map((buf, i) => ({ input: buf, left: (i % perRow) * W, top: Math.floor(i / perRow) * H })))
      .png().toFile(resolve(ROOT, OUT, file));
    console.log(`[weightshot] ${file} (${label}), read left to right, top row first:`);
    take.forEach((p, i) => console.log(`    ${i + 1}. ${JSON.stringify(p)}`));
  }

  await ladder(fall, "knockdown.png", 8, "the fall and the get-up, off the sim's own downTimer");
  await ladder(swing, "swing.png", 8, "a berserker heavy, off the sim's own swingT");

  await browser.close();
  server.kill("SIGKILL");
  console.log(`\n[weightshot] wrote ${OUT}/knockdown.png and ${OUT}/swing.png — READ THEM.`);
}

main().catch((e) => {
  console.error(e);
  try { server && server.kill("SIGKILL"); } catch { /* gone */ }
  process.exit(1);
});
