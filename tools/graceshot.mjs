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
//   art/shots/grace/1-first-sight.png the frame the player actually gets first.
//                                     THE COUNTDOWN IS NEVER SEEN: the forge
//                                     screen takes ~8 s to raise the sky and the
//                                     countdown is 3 s, so it runs out behind the
//                                     loader and the arena's first frame is
//                                     already `fighting`. That is why the owner
//                                     saw the flashing AFTER the count — with the
//                                     old code every body was still strobing on a
//                                     grace flag whose clock had only just begun.
//   art/shots/grace/2-grace.png       a warrior under the fight's grace. The gild
//                                     on the plate bevel, which replaces it.
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
import { existsSync, mkdirSync, writeFileSync } from "fs";
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
//
// TWO SHUTTERS, because one is not enough and the first run proved it. Freezing
// the WIRE stops the simulation the client believes in, but `requestAnimationFrame`
// keeps painting, and Playwright's screenshot waits for two identical frames
// before it fires. On a box rasterising WebGL in software that pair never
// arrives: the first attempt timed out at 120 s, and the retry that eventually
// landed was a frame 82 SECONDS into a fight it was supposed to be catching the
// first moment of. So `__still` also parks rAF. The scene holds its last frame,
// two identical composites arrive at once, and the shutter fires on the moment
// that was gated instead of on whatever the fight had become.
const PROBE = () => {
  const w = window;
  w.__probe = { lastState: null, phase: "lobby" };
  w.__freeze = false;
  // THE SHUTTER STOPS THE WIRE AND NOTHING ELSE. Parking `requestAnimationFrame`
  // was tried and it does hold the scene perfectly still — but the composited
  // canvas comes back BLACK, because a WebGL context without
  // `preserveDrawingBuffer` has nothing to hand the compositor once it stops
  // presenting. So the render loop keeps running, the wire stops, and
  // `render/anim.ts` runs out its 0.22 s of extrapolation and settles.
  w.__still = (on) => { w.__freeze = on; };
  // THE SHUTTER IS ARMED INSIDE THE PAGE, and it has to be. The grace lasts two
  // seconds; a `waitForFunction` in node plus one `evaluate` round trip took
  // SEVEN of them on this box, and the frame that was meant to catch the first
  // moment of the fight came back at t+7.4s with the grace long spent. So the
  // trigger sits next to the socket: the packet that satisfies `__arm` stops the
  // world a quarter-second later — long enough for an eased mark to arrive,
  // short enough to still be inside the thing being photographed.
  w.__arm = null;
  w.__stilled = false;
  // Polled as well as packet-driven: the frame that matters most here is the one
  // where the LOADER clears, and no packet marks that.
  setInterval(() => {
    try { if (typeof w.__arm === "function" && w.__arm(w.__probe)) w.__fire(); } catch { /* not yet */ }
  }, 50);
  w.__fire = () => {
    if (w.__stilled) return;
    w.__stilled = true;
    // The readout is taken HERE, on the packet that triggered the shot, and
    // never from node afterwards. The probe deliberately keeps listening while
    // the app is shuttered, so anything read across a round trip describes
    // whatever the fight has since become — which is how a countdown frame came
    // back captioned "6/6 flagged untouchable" from a fight that had already
    // started. A number printed beside a frame must be about that frame.
    const s = w.__probe.lastState;
    const ps = s && s.players ? Object.values(s.players) : [];
    w.__shotAt = `t+${(s && s.matchTimer ? s.matchTimer : 0).toFixed(1)}s, `
      + `${ps.filter((q) => q.invincible).length}/${ps.length} flagged untouchable`;
    setTimeout(() => w.__still(true), 220);
  };
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
          if (typeof w.__arm === "function" && w.__arm(w.__probe)) w.__fire();
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

  const cdp = await ctx.newCDPSession(page);
  const still = (on) => page.evaluate((v) => { window.__still(v); }, on);
  const readout = () => page.evaluate(() => window.__shotAt || "no state");

  /** Arm the in-page trigger with a predicate, wait for it to fire, shoot. */
  const shot = async (name, note, armSrc) => {
    await page.evaluate((src) => {
      window.__stilled = false;
      window.__arm = new Function("p", `return (${src})(p);`);
    }, armSrc);
    await page.waitForFunction(() => window.__stilled && window.__freeze, null, { timeout: 180000 });
    const line = await readout();
    const file = resolve(OUT, `${name}.png`);
    // CDP rather than `page.screenshot`, which waits for two identical frames
    // before it fires. Nothing here is ever identical twice — the fire moves —
    // so that wait is unbounded on a software rasteriser, and the run that used
    // it came back with a frame 82 seconds past the moment it was aiming at.
    // This one fires on the frame it is asked for.
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log(`[graceshot] ${file}  —  ${note}: ${line}`);
    await page.evaluate(() => { window.__arm = null; window.__still(false); });
  };

  await step("DRAW STEEL");
  // Dismiss the pointer-lock panel: it sits exactly where the countdown numeral
  // is drawn, and the numeral is half the point of the first frame.
  await page.waitForSelector("canvas", { timeout: 120000 });
  await page.mouse.click(SCREEN.width / 2, SCREEN.height - 80).catch(() => { });

  // The forge takes about eight seconds to raise the sky and the countdown is
  // three, so the count and the round's own grace both run out BEHIND the
  // loader — measured here at t+4.0 s for the arena's first frame. That is the
  // owner's report explained: he never sees the countdown, he sees the arena
  // arrive with everybody still strobing on a grace whose clock had only just
  // started. So the grace worth photographing is a live one — a dodge, well
  // past the loader, with the plates on screen and something to compare to.
  await shot("1-first-sight", "the arena's first frame",
    "(p) => !!p.lastState && !!document.querySelector('canvas')"
    + " && !document.body.innerText.includes('THE FORGE')");
  await shot("2-grace", "a warrior under grace, mid-fight",
    "(p) => p.phase === 'fighting' && p.lastState.matchTimer > 9"
    + " && Object.values(p.lastState.players).some((q) => q.invincible)");
  await shot("3-after", "the same plates, no grace",
    "(p) => p.phase === 'fighting' && p.lastState.matchTimer > 13"
    + " && Object.values(p.lastState.players).every((q) => !q.invincible)");

  await browser.close();
}

main()
  .catch((e) => { console.error(`[graceshot] ${e}`); process.exitCode = 1; })
  .finally(() => { if (server) server.kill("SIGTERM"); setTimeout(() => process.exit(process.exitCode ?? 0), 700); });
