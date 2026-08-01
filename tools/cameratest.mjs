#!/usr/bin/env node
// ============================================================
// CAMERATEST — the camera rig's two owner-visible promises.
//
//   node tools/cameratest.mjs
//
// 1. SHOULDER AND HAND. The default is right-handed: the camera sits over the
//    warrior's RIGHT shoulder and the weapon hangs in his RIGHT hand. The one
//    left-handed switch that already mirrors the touch zones and the HUD
//    cluster mirrors both of those with it, and there is no second control —
//    so the same session run with `bretwalda.hand = left` must come back with
//    BOTH numbers flipped.
//
// 2. THE SPAWN HEADING. A round has to open ready to fight. The rig adopts the
//    heading the sim spawned the warrior on within one tick of the round
//    starting, rather than keeping whatever yaw the lobby orbit left in it.
//    "Within one tick" is `adoptFrame === 0` — the first follow frame of the
//    round is the one that adopted — and it is read out of the rig, not timed
//    from outside where a slow rasteriser would decide the answer.
//
// Both are measured, not asserted about: `shoulder` is the camera's real
// lateral offset from the warrior in the warrior's own frame, and `weaponSide`
// is where the blade actually ended up in the body's frame. A test against the
// sign of a constant would only prove the constant.
//
// Exits non-zero on any failure.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = parseInt(process.env.PORT || String(3800 + (process.pid % 150)), 10);
const HEADED = process.argv.includes("--headed");

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

// The same socket tap playtest uses: the server's own view of the warrior, so
// the spawn position the bearing is checked against is the sim's and not the
// renderer's smoothed copy of it.
const PROBE = () => {
  const w = window;
  w.__probe = { lastState: null, states: 0 };
  const RealWS = window.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (String(url).includes("/ws")) {
      ws.addEventListener("message", (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === "game_state" || m.type === "countdown") {
            w.__probe.states++;
            w.__probe.lastState = m.data;
          }
        } catch { /* ignore */ }
      });
    }
    return ws;
  }
  TappedWS.prototype = RealWS.prototype;
  Object.assign(TappedWS, RealWS);
  w.WebSocket = TappedWS;
};

// Samples the rig on every animation frame from before the round starts, so the
// yaw the orbit was holding is on record and the adoption can be shown to have
// thrown it away rather than to have happened to agree with it.
const WATCH = () => {
  const w = window;
  w.__camwatch = { preYaw: null, preMode: null, atStart: null, frames: 0 };
  const tick = () => {
    const c = w.__bretwaldaCamera;
    const s = w.__probe?.lastState;
    if (c && s) {
      w.__camwatch.frames++;
      const fighting = s.state === "fighting" || s.state === "last_stand" || s.state === "countdown";
      if (!fighting) {
        w.__camwatch.preYaw = c.yaw;
        w.__camwatch.preMode = c.mode;
      } else if (!w.__camwatch.atStart && c.mode === "follow" && c.adoptions > 0) {
        const mine = Object.values(s.players).find((p) => !String(p.id).startsWith("bot_"));
        w.__camwatch.atStart = {
          yaw: c.yaw,
          adoptions: c.adoptions,
          adoptFrame: c.adoptFrame,
          adoptedFrom: c.adoptedFrom,
          x: mine?.position.x ?? 0,
          z: mine?.position.z ?? 0,
          rot: mine?.rotation ?? 0,
        };
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

async function session(browser, { lefty }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PROBE);
  if (lefty) {
    await ctx.addInitScript(() => {
      // The one setting. Seeded exactly where GameHud's L/R button writes it, so
      // this test goes through the shipped store rather than round a side door.
      try { window.localStorage.setItem("bretwalda.hand", "left"); } catch { /* ignore */ }
    });
  }
  await ctx.addInitScript(WATCH);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[page-error] ${e}`));
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });

  // An empty ring: a bot that kills the test warrior puts the rig into the
  // spectate orbit, and a corpse has no shoulder to sit over.
  await page.getByText("Training", { exact: false }).first().click();
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
  const fewer = page.getByLabel("Fewer AI warriors");
  for (let i = 0; i < 8 && await fewer.isEnabled().catch(() => false); i++) await fewer.click();
  await page.getByText("DRAW STEEL", { exact: false }).first().click();
  await page.waitForFunction(() => window.__probe?.lastState?.state === "fighting", null, { timeout: 60000 });
  await page.waitForFunction(() => window.__camwatch?.atStart !== null, null, { timeout: 30000 })
    .catch(() => { /* reported as a failure below, with the numbers */ });
  // Let the rig settle so `shoulder` is read off a framed camera and not off
  // the one frame in which it snapped.
  await page.waitForTimeout(1200);

  const out = await page.evaluate(() => ({
    watch: window.__camwatch,
    cam: window.__bretwaldaCamera && {
      yaw: window.__bretwaldaCamera.yaw,
      mode: window.__bretwaldaCamera.mode,
      lefty: window.__bretwaldaCamera.lefty,
      shoulder: window.__bretwaldaCamera.shoulder,
      adoptions: window.__bretwaldaCamera.adoptions,
    },
    hand: window.__bretwaldaHand,
  }));
  await ctx.close();
  return out;
}

async function main() {
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  console.log(`[cameratest] starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
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

  // ---- the default: right shoulder, right hand ----
  const R = await session(browser, { lefty: false });
  console.log("[cameratest] default session in a fight\n");

  check("the rig publishes a readback", !!R.cam && !!R.hand,
    R.cam ? `mode=${R.cam.mode}` : "window.__bretwaldaCamera is undefined");

  check("default is right-handed", R.cam?.lefty === false && R.hand?.lefty === false,
    `store says lefty=${R.cam?.lefty}`);

  check("camera sits over the RIGHT shoulder by default",
    (R.cam?.shoulder ?? 0) > 0.5,
    `lateral offset ${(R.cam?.shoulder ?? 0).toFixed(2)} m to the warrior's right (was -1.00 before this change)`);

  // A body faces local +Z, so the hand on his right is at -X.
  check("weapon hangs in the RIGHT hand by default",
    (R.hand?.weaponSide ?? 0) < -0.05,
    `blade at x=${(R.hand?.weaponSide ?? 0).toFixed(3)} m in body space (negative is his right); ${R.hand?.cls}`);

  // ---- the spawn heading ----
  const s = R.watch?.atStart;
  check("the camera adopts a spawn heading at the round",
    !!s && s.adoptions >= 1,
    s ? `${s.adoptions} adoption(s)` : "never adopted");

  check("it adopts WITHIN ONE TICK of the round starting",
    !!s && s.adoptFrame === 0,
    s ? `adopted on follow frame ${s.adoptFrame} (0 = the round's first tick)` : "no adoption recorded");

  const bearing = s ? Math.atan2(-s.x, -s.z) : 0;
  const errCentre = s ? Math.abs(wrap(s.yaw - bearing)) : Math.PI;
  check("the adopted heading faces the middle of the arena, from the spawn mark",
    errCentre < 0.02,
    s ? `spawn (${s.x.toFixed(2)}, ${s.z.toFixed(2)}) wants yaw ${bearing.toFixed(3)}, rig took ${s.yaw.toFixed(3)} — off by ${errCentre.toFixed(4)} rad` : "");

  const errSim = s ? Math.abs(wrap(s.yaw - s.rot)) : Math.PI;
  check("the adopted heading agrees with the sim's own spawn facing",
    errSim < 0.35,
    s ? `sim faced ${s.rot.toFixed(3)}, rig took ${s.yaw.toFixed(3)} — off by ${errSim.toFixed(4)} rad` : "");

  const thrown = s ? Math.abs(wrap(s.yaw - s.adoptedFrom)) : 0;
  console.log(`  note  the orbit's leftover yaw was ${s ? s.adoptedFrom.toFixed(3) : "?"}; the adoption threw away ${thrown.toFixed(3)} rad of it\n`);

  // ---- the mirror: ONE setting moves both ----
  const L = await session(browser, { lefty: true });
  console.log("[cameratest] left-handed session in a fight\n");

  check("the left-handed switch is read by the rig",
    L.cam?.lefty === true && L.hand?.lefty === true,
    `store says lefty=${L.cam?.lefty}`);

  check("that ONE switch moves the camera to the LEFT shoulder",
    (L.cam?.shoulder ?? 0) < -0.5,
    `lateral offset ${(L.cam?.shoulder ?? 0).toFixed(2)} m (negative is his left)`);

  check("that SAME switch moves the weapon to the LEFT hand",
    (L.hand?.weaponSide ?? 0) > 0.05,
    `blade at x=${(L.hand?.weaponSide ?? 0).toFixed(3)} m in body space (positive is his left)`);

  check("the mirror is a true mirror, not a second offset",
    // The blade tolerance is loose on purpose: the two sessions are sampled at
    // unrelated phases of the idle, and the hand swings through a few cm of the
    // body's own X while it breathes. Half the offset is still an order of
    // magnitude more than the drift.
    Math.abs((L.cam?.shoulder ?? 0) + (R.cam?.shoulder ?? 0)) < 0.25
      && Math.abs((L.hand?.weaponSide ?? 0) + (R.hand?.weaponSide ?? 0)) < 0.1,
    `shoulder ${(R.cam?.shoulder ?? 0).toFixed(2)} vs ${(L.cam?.shoulder ?? 0).toFixed(2)}; blade ${(R.hand?.weaponSide ?? 0).toFixed(3)} vs ${(L.hand?.weaponSide ?? 0).toFixed(3)}`);

  check("the spawn heading still lands left-handed",
    (L.watch?.atStart?.adoptFrame ?? -1) === 0,
    `adopted on follow frame ${L.watch?.atStart?.adoptFrame}`);

  await browser.close();

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n[cameratest] ${passed}/${results.length} passed`);
  return passed === results.length ? 0 : 1;
}

main()
  .then((code) => { server?.kill(); process.exit(code); })
  .catch((e) => { console.error(e); server?.kill(); process.exit(1); });
