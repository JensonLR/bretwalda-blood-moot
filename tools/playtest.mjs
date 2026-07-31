#!/usr/bin/env node
// ============================================================
// PLAYTEST — drives a real desktop session and measures whether
// the controls actually do anything.
//
//   npm run playtest
//
// Boots the app, walks the landing -> training -> fight flow in a
// real browser, then presses keys and mouse buttons and checks the
// server's authoritative response. It taps the game WebSocket from
// inside the page, so it needs no debug hooks in app code.
//
// Exits non-zero if any control fails to produce its effect.
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

// Records every game message in both directions so we can measure the
// real input rate and read the server's authoritative player state.
const PROBE = () => {
  const w = window;
  w.__probe = { sent: [], lastState: null, states: 0, opened: false };
  const RealWS = window.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (String(url).includes("/ws")) {
      w.__probe.opened = true;
      const send = ws.send.bind(ws);
      ws.send = (data) => {
        try {
          const m = JSON.parse(data);
          if (m.type === "input") w.__probe.sent.push({ t: performance.now(), d: m.data });
        } catch { /* ignore */ }
        return send(data);
      };
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

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  console.log(`[playtest] starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[page-error] ${e}`));

  // Pinned low: this box has no GPU, and the control path is what is under
  // test here, not the renderer. tools/perf.mjs measures the frame cost.
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });

  // ---- reach the fight ----
  // An empty ring, deliberately: with an opponent in it the AI can kill the
  // test warrior mid-run, and a corpse neither moves nor spends stamina, so
  // half the assertions fail for a reason that has nothing to do with input.
  await page.getByText("Training", { exact: false }).first().click();
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
  const fewer = page.getByLabel("Fewer AI warriors");
  for (let i = 0; i < 8 && await fewer.isEnabled().catch(() => false); i++) {
    await fewer.click();
  }
  await page.getByText("DRAW STEEL", { exact: false }).first().click();
  await page.waitForFunction(() => window.__probe?.lastState?.state === "fighting", null, { timeout: 60000 });
  console.log("[playtest] in a fight\n");

  // Reads the warrior out of a snapshot STRICTLY NEWER than `afterSeq`.
  // Without that guard this box lies: the full post chain on a software
  // rasteriser blocks the main thread for most of a second, so two reads taken
  // 1.3 s apart can land on the same packet and every displacement measures
  // exactly 0.00 — which reads as "movement is broken" when it is only "the
  // page has not had a moment to process a socket message".
  const me = async (afterSeq = -1) => page.evaluate(async (seq) => {
    const deadline = performance.now() + 15000;
    while (window.__probe.states <= seq && performance.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    const s = window.__probe.lastState;
    if (!s) return null;
    // The local warrior is the only non-bot in a solo room.
    const mine = Object.values(s.players).find((p) => !String(p.id).startsWith("bot_"));
    return mine && {
      x: mine.position.x, z: mine.position.z, hp: mine.health,
      stam: mine.stamina, state: mine.state, rot: mine.rotation,
      seq: window.__probe.states, fresh: window.__probe.states > seq,
    };
  }, afterSeq);
  const seq = () => page.evaluate(() => window.__probe.states);

  const canvas = page.locator("canvas");
  await canvas.click({ position: { x: 640, y: 400 } }); // focus + pointer lock
  await page.waitForTimeout(400);

  // ---- 1. input rate: does every rendered frame's input reach the wire? ----
  await page.evaluate(() => { window.__probe.sent.length = 0; });
  await page.waitForTimeout(1000);
  const rate = await page.evaluate(() => window.__probe.sent.length);
  check("input reaches the server at a usable rate", rate >= 45,
    `${rate} input msgs/sec (render loop samples ~60/sec; <45 means samples are being dropped)`);

  // ---- 2. WASD actually moves the warrior ----
  const before = await me();
  const s0 = await seq();
  await page.keyboard.down("w");
  await page.waitForTimeout(1200);
  const after = await me(s0);
  await page.keyboard.up("w");
  const dist = Math.hypot(after.x - before.x, after.z - before.z);
  // A warden walks 4.5 u/s, so ~1.2s of held W should cover well over 3 units.
  check("W moves the warrior", dist > 0.4, `travelled ${dist.toFixed(2)} units in 1.2s held`);
  check("W moves at a believable speed", dist > 3.0,
    `travelled ${dist.toFixed(2)} units; expected >3.0 for a 4.5 u/s walk`);

  // ---- 3. strafe ----
  const b2 = await me();
  const s1 = await seq();
  await page.keyboard.down("d");
  await page.waitForTimeout(900);
  const a2 = await me(s1);
  await page.keyboard.up("d");
  check("D strafes", Math.hypot(a2.x - b2.x, a2.z - b2.z) > 0.4,
    `travelled ${Math.hypot(a2.x - b2.x, a2.z - b2.z).toFixed(2)} units`);

  // ---- 4. attack costs stamina (proves the action reached the sim) ----
  const b3 = await me();
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  const a3 = await me();
  const sawAttack = await page.evaluate(() => window.__probe.sent.some((s) => s.d.attack === true));
  check("left click sends an attack", sawAttack, "");
  check("attack registers in the sim", a3.stam < b3.stam || a3.state === "attacking",
    `stamina ${b3.stam.toFixed(1)} -> ${a3.stam.toFixed(1)}`);

  // ---- 5. dodge ----
  await page.waitForTimeout(900);
  const b4 = await me();
  const s2 = await seq();
  await page.keyboard.press("Space");
  // Three packets, not one. A dodge has to clear the 16ms input timer and then
  // a 50ms server tick before it can appear in a snapshot, so the first packet
  // after the press is usually still pre-dodge — and the dodge state only lasts
  // 0.35s, so reading one packet early and one late both miss it.
  const a4 = await me(s2 + 2);
  check("space dodges", a4.stam < b4.stam - 5 || a4.state === "dodging",
    `stamina ${b4.stam.toFixed(1)} -> ${a4.stam.toFixed(1)}, state=${a4.state}`);

  // ---- 6. block ----
  await page.waitForTimeout(600);
  await page.mouse.down({ button: "right" });
  await page.waitForTimeout(450);
  const a5 = await me();
  await page.mouse.up({ button: "right" });
  check("right click blocks", a5.state === "blocking", `state=${a5.state}`);

  // ---- 7. mouse look ----
  const b6 = await me();
  await page.mouse.move(640, 400);
  await page.mouse.move(980, 400, { steps: 24 });
  await page.waitForTimeout(300);
  const a6 = await me();
  const locked = await page.evaluate(() => document.pointerLockElement !== null);
  check("mouse turns the camera", Math.abs(a6.rot - b6.rot) > 0.05,
    `rotation ${b6.rot.toFixed(2)} -> ${a6.rot.toFixed(2)} (pointerLock=${locked})`);

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n[playtest] ${results.length - failed.length}/${results.length} controls working`);
  if (failed.length) {
    console.log("[playtest] BROKEN: " + failed.map((f) => f.name).join(", "));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error("[playtest] failed:", e); process.exitCode = 1; })
  .finally(() => { if (server && !server.killed) server.kill("SIGTERM"); });
