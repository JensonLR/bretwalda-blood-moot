#!/usr/bin/env node
// ============================================================
// GORESHOT — the strip. What a death actually looks like, frame by frame.
//
//   npm run build && node tools/goreshot.mjs
//   node tools/goreshot.mjs --out art/shots/gore
//
// `goretest` proves the arithmetic — that the spray arcs, that it lands four
// metres out, that the hold is 3.1 s and finds the wound. It cannot say whether
// any of that is any good to look at, and `shoot.mjs`'s gore presets cannot
// either, because they are STILLS: one fixed frame at a fixed settle, and the
// two things this unit is about are both motion. A spray is a shape over time
// and a camera hold is a move.
//
// So this stands up ONE real match in ONE browser session and takes a strip
// across a single death:
//
//   art/shots/gore/strip-0-blow.png    the frame the blow lands on
//   art/shots/gore/strip-1-fall.png    mid-collapse, the burst in the air
//   art/shots/gore/strip-2-move.png    the lens swinging round to the wound
//   art/shots/gore/strip-3-wound.png   settled on it, the stump still running
//   art/shots/gore/strip-4-after.png   the hold released, the ground marked
//   art/shots/gore/strip-5-later.png   a minute on: what the pool looks like
//
// The last one is the claim `goretest` makes in numbers — a pool lives 210 s
// against a round that has no clock on it — put where a person can check it.
//
// TIMING IS REPORTED, NOT ASSUMED. This box rasterises WebGL in software, so a
// capture takes as long as it takes; each frame is labelled with the elapsed
// time the PAGE measured between the death packet and the shutter, read out of
// the page on the frame it fired. A number printed beside a frame must be about
// that frame — the lesson `graceshot.mjs` records, where a countdown still came
// back captioned with a readout from a fight that had already started.
//
// It asserts nothing. It is for eyes.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = parseInt(process.env.PORT || String(3730 + (process.pid % 30)), 10);
const OUT = resolve(ROOT, flag("out", "art/shots/gore"));
// 854x480. This box rasterises WebGL in software and a death hold is 3.1 s of
// WALL time, so the only way to get more than two frames inside it is fewer
// pixels. The first run at 1280x720 rendered slowly enough that the strip
// straddled FOUR separate deaths.
const SCREEN = { width: 854, height: 480 };

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

// The probe watches the wire for the LOCAL warrior going down, and stamps the
// moment. Everything downstream is measured from that stamp, in the page, so the
// caption on a frame is about that frame.
const PROBE = () => {
  const w = window;
  // LOCKED ON THE FIRST DEATH. Training respawns every five seconds forever, so
  // an unlocked stamp is re-pointed at the newest death between one shot and the
  // next — which is exactly what the first run of this file did: it captioned
  // six frames "t+34.87s", "t+16.63s", "t+9.04s", "t+4.74s" as the clock ran
  // BACKWARDS, because each caption was about a different man's death. One
  // death, one strip.
  // AND ARMED ONLY ONCE THE ARENA IS ON SCREEN. The forge takes about eight
  // seconds to raise the sky and the fight starts behind it — `graceshot.mjs`
  // records the same thing — so with three jarl bots on him the local man is
  // dead before the loader has cleared. The second run of this file locked onto
  // that death and took its first frame twenty-one seconds later, over a corpse
  // that had already respawned twice. Node sets `arm` when the loader is gone.
  w.__gore = { last: null, deathAt: 0, zone: null, alive: false, id: null, locked: false, arm: false };
  const RealWS = window.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (String(url).includes("/ws")) {
      ws.addEventListener("message", (ev) => {
        try {
          const m = JSON.parse(ev.data);
          const d = m.data || {};
          if (d.playerId && !w.__gore.id) w.__gore.id = d.playerId;
          if (!d.players) return;
          w.__gore.last = d;
          // Whoever is not a bot is us. The join packet carries the id, but the
          // room packets are the ones that keep arriving.
          const ids = Object.keys(d.players);
          const me = w.__gore.id && d.players[w.__gore.id]
            ? d.players[w.__gore.id]
            : d.players[ids.find((k) => !d.players[k].isBot) ?? ids[0]];
          if (!me) return;
          const dead = me.state === "dead";
          if (dead && w.__gore.alive && !w.__gore.locked && w.__gore.arm) {
            w.__gore.locked = true;
            w.__gore.deathAt = performance.now();
            w.__gore.zone = me.deathZone || "torso";
          }
          w.__gore.alive = !dead;
        } catch { /* ignore */ }
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
  console.log(`[goreshot] starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
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
  page.setDefaultTimeout(240000);
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
  // Three extra bots: the local man has to actually be killed, and quickly, for
  // this to be a capture of a death rather than of a stalemate.
  for (let i = 0; i < 3; i++) await more.click();
  await step("DRAW STEEL");
  await page.waitForSelector("canvas", { timeout: 180000 });
  await page.mouse.click(SCREEN.width / 2, SCREEN.height - 80).catch(() => { });

  const cdp = await ctx.newCDPSession(page);
  const shoot = async (name, note) => {
    const stamp = await page.evaluate(() => {
      const g = window.__gore;
      const t = g.deathAt ? (performance.now() - g.deathAt) / 1000 : -1;
      return { t, zone: g.zone };
    });
    const file = resolve(OUT, `${name}.png`);
    // CDP rather than `page.screenshot`, which waits for two identical frames
    // before it fires — nothing in this scene is ever identical twice and that
    // wait is unbounded on a software rasteriser.
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log(`[goreshot] ${file}  —  ${note}: t+${stamp.t.toFixed(2)}s after the death, zone "${stamp.zone}"`);
  };

  // Wait for the local warrior to go down. Nothing is sent from here — three
  // bots on jarl do the work, which is also the honest case: this is what a
  // player sees, not what a staged pose looks like.
  console.log("[goreshot] waiting for the forge to clear...");
  await page.waitForFunction(
    () => !document.body.innerText.includes("THE FORGE") && !!document.querySelector("canvas"),
    null, { timeout: 240000 },
  );
  await page.evaluate(() => { window.__gore.arm = true; window.__gore.alive = false; });
  console.log("[goreshot] arena up; waiting for the local warrior to be killed on screen...");
  await page.waitForFunction(() => window.__gore && window.__gore.locked, null, { timeout: 240000 });

  // Timed off the PAGE's clock rather than off node's, so a shutter that fires
  // late is a shutter that fires late and says so, instead of one that fired at
  // the right moment on the wrong machine.
  const at = async (sec, name, note) => {
    await page.waitForFunction(
      (ms) => window.__gore.locked && performance.now() - window.__gore.deathAt >= ms,
      sec * 1000, { timeout: 120000 },
    ).catch(() => { });
    await shoot(name, note);
  };
  await shoot("strip-0-blow", "the blow lands");
  await at(0.55, "strip-1-fall", "mid-collapse, the burst in the air");
  await at(1.60, "strip-2-move", "the lens swinging round to the wound");
  await at(2.60, "strip-3-wound", "settled on the wound, the stump still running");
  await at(4.20, "strip-4-after", "the hold released, the ground marked");
  // A minute on. The pool claim in `goretest` says 210 s on a desktop tier; this
  // is the frame where a person can agree or disagree with it.
  await at(62, "strip-5-later", "a minute after the death");

  await browser.close();
}

main()
  .catch((e) => { console.error(`[goreshot] ${e}`); process.exitCode = 1; })
  .finally(() => { if (server) server.kill("SIGTERM"); setTimeout(() => process.exit(process.exitCode ?? 0), 700); });
