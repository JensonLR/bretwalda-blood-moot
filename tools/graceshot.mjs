#!/usr/bin/env node
// ============================================================
// GRACESHOT — the three frames that settle whether the flashing is gone.
//
//   npm run build && node tools/graceshot.mjs
//
// `gracetest.mjs` proves the arithmetic: nothing is raised during the countdown
// and nothing raised there survives into the fight. It cannot say whether the
// thing that replaced the strobe is any good to look at, and that question has
// to be answered by looking. So this stands up one real match in ONE browser
// session and takes three frames off it:
//
//   art/shots/grace/1-countdown.png   mid-countdown. Men whole and lit, nothing
//                                     blinking, plates plain.
//   art/shots/grace/2-grace.png       the top of the fight, warriors still
//                                     untouchable. The gild on the plate bevel.
//   art/shots/grace/3-after.png       the grace spent. The same plates, plain.
//
// The wire is shuttered at the client's door for each one — the app simply
// stops being told anything, which it cannot tell from a quiet moment — so the
// frame that lands is the frame that was gated, not the one two seconds of
// software rasterising later. The shutter is reopened between shots, which is
// what lets one session cover all three phases.
//
// It asserts nothing. It is for eyes.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = parseInt(process.env.PORT || String(3690 + (process.pid % 30)), 10);
const OUT = resolve(ROOT, "art/shots/grace");
const SCREEN = { width: 960, height: 540 };

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

// The probe keeps watching even while the app is shuttered — it is what the
// gates below are waited on, and a frozen probe cannot tell you when to thaw.
const PROBE = () => {
  const w = window;
  w.__probe = { lastState: null, phase: "lobby" };
  w.__freeze = false;
  const RealWS = window.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (String(url).includes("/ws")) {
      ws.addEventListener("message", (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === "countdown") w.__probe.phase = "countdown";
          else if (m.data && typeof m.data.state === "string") w.__probe.phase = m.data.state;
          if (m.data && m.data.players) w.__probe.lastState = m.data;
        } catch { /* ignore */ }
      });
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  console.log(`[graceshot] starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
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
  const more = page.getByLabel("More AI warriors");
  for (let i = 0; i < 3; i++) await more.click();

  const freeze = (on) => page.evaluate((v) => { window.__freeze = v; }, on);
  const flagged = () => page.evaluate(() => {
    const s = window.__probe.lastState;
    if (!s || !s.players) return -1;
    return Object.values(s.players).filter((p) => p.invincible).length;
  });

  const shot = async (name, note) => {
    // The first frame of the session pays for the texture library and the PMREM
    // bake; every one after it is cheap. Half a second of thawed animation
    // before the shutter lets an eased mark reach where it is going.
    await sleep(600);
    await freeze(true);
    await sleep(400);
    const file = resolve(OUT, `${name}.png`);
    // `animations: "disabled"` and a generous timeout, because every pixel here
    // is rasterised on the CPU and the default shutter gives up first.
    await page.screenshot({ path: file, animations: "disabled", timeout: 170000 });
    console.log(`[graceshot] ${file}  —  ${note}, ${await flagged()} warriors flagged untouchable`);
    await freeze(false);
  };

  await step("DRAW STEEL");

  await page.waitForFunction(() => window.__probe?.phase === "countdown", null, { timeout: 120000 });
  await shot("1-countdown", "counting down");

  await page.waitForFunction(() => window.__probe?.phase === "fighting", null, { timeout: 120000 });
  await shot("2-grace", "first moment of the fight");

  await page.waitForFunction(() => {
    const s = window.__probe.lastState;
    return !!s && !!s.players && Object.values(s.players).every((p) => !p.invincible);
  }, null, { timeout: 120000 });
  await shot("3-after", "grace spent");

  await browser.close();
}

main()
  .catch((e) => { console.error(`[graceshot] ${e}`); process.exitCode = 1; })
  .finally(() => { if (server) server.kill("SIGTERM"); setTimeout(() => process.exit(process.exitCode ?? 0), 700); });
