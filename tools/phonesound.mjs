#!/usr/bin/env node
// ============================================================
// PHONESOUND — the autoplay trap, on the device it actually breaks on.
//
//   npm run phonesound
//
// `soundtest` grades the synthesis by rendering it offline. It cannot grade
// the one failure docs/SOUND.md calls "the single most common way browser
// audio ships broken", because an OfflineAudioContext needs no gesture and is
// never suspended: a build that creates its context at import passes every
// offline assertion and is mute on every phone in the world.
//
// So this runs the REAL app, in a REAL AudioContext, at 390x844 with touch —
// and deliberately WITHOUT `--autoplay-policy=no-user-gesture-required`, which
// is the flag that makes this whole class of bug invisible in CI.
//
// Four things, in order:
//
//   1. The page loads and settles. No AudioContext has been constructed.
//   2. Events fired at the engine before any gesture emit nothing.
//   3. One real touch on the button that enters a match. The context now
//      exists and is `running`, not `suspended`.
//   4. Sound comes out. Measured, not assumed: an analyser is spliced onto
//      everything reaching `destination`, and the peak it sees must be > 0.
//
// Exit 0 all proven, 1 otherwise.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = parseInt(process.env.PORT || String(3960 + (process.pid % 30)), 10);
const SCREEN = { width: 390, height: 844 };

let server = null;
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function waitForServer(url, timeoutMs = 180000) {
  const started = Date.now();
  for (;;) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    if (Date.now() - started > timeoutMs) throw new Error(`server never came up: ${url}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

/**
 * Installed before any application script runs.
 *
 * Counts context constructions, and splices an analyser onto everything that
 * reaches the destination so the audio can be MEASURED rather than inferred
 * from "well, we called start()". A node connected to `ctx.destination` is
 * also connected to the tap; the tap is never connected onward, so it changes
 * nothing that is heard.
 */
const PROBE = () => {
  const w = window;
  w.__ac = { built: 0, ctx: null, tap: null };
  for (const key of ["AudioContext", "webkitAudioContext"]) {
    const Real = w[key];
    if (!Real) continue;
    function Counted(...args) {
      const ctx = new Real(...args);
      w.__ac.built++;
      w.__ac.ctx = ctx;
      try {
        const tap = ctx.createAnalyser();
        tap.fftSize = 2048;
        w.__ac.tap = tap;

        // A SECOND tap, through a model of the phone's own speaker.
        //
        // The first tap says "sound is coming out". It cannot say whether any of
        // that sound is inside the band a phone can reproduce, and that is the
        // whole of the mobile audio problem: a micro-speaker is flat from about
        // 700 Hz to 8 kHz and gone below 400, so a mix whose weight lives at
        // 60-120 Hz measures loud here and is inaudible in a hand. This chain is
        // the same shape `soundtest` calibrates in Node — two staggered
        // highpasses at 500 and 250 Hz and a lowpass at 12 kHz — built here out
        // of real BiquadFilterNodes so it grades the LIVE app.
        //
        // It is a MODEL and it is named as one. docs/MOBILE-AUDIO.md exists
        // because a Chromium result was once read as an iOS result, and nothing
        // in this container will ever run iOS Safari.
        const hp1 = ctx.createBiquadFilter(); hp1.type = "highpass"; hp1.frequency.value = 500;
        const hp2 = ctx.createBiquadFilter(); hp2.type = "highpass"; hp2.frequency.value = 250;
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 12000;
        const spk = ctx.createAnalyser(); spk.fftSize = 2048;
        hp1.connect(hp2); hp2.connect(lp); lp.connect(spk);
        w.__ac.spk = spk; w.__ac.spkIn = hp1;

        const realConnect = Object.getPrototypeOf(ctx.createGain()).connect;
        // Patch on AudioNode itself so every node type is covered.
        let proto = Object.getPrototypeOf(ctx.createGain());
        while (proto && !Object.prototype.hasOwnProperty.call(proto, "connect")) proto = Object.getPrototypeOf(proto);
        (proto || {}).connect = function (dest, ...rest) {
          const out = realConnect.call(this, dest, ...rest);
          if (dest === ctx.destination) {
            try { realConnect.call(this, tap); } catch { /* ok */ }
            try { realConnect.call(this, hp1); } catch { /* ok */ }
          }
          return out;
        };
      } catch { /* an analyser is a nicety; the count is not */ }
      return ctx;
    }
    Counted.prototype = Real.prototype;
    w[key] = Counted;
  }
  const peakOf = (tap) => {
    if (!tap) return -1;
    const buf = new Float32Array(tap.fftSize);
    tap.getFloatTimeDomainData(buf);
    let m = 0;
    for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > m) m = a; }
    return m;
  };
  /** Peak absolute sample the tap has seen since the last call. */
  w.__peak = () => peakOf(w.__ac.tap);
  /** The same, but only what a phone's own speaker could reproduce. */
  w.__spkPeak = () => peakOf(w.__ac.spk);
};

/**
 * Watches both taps for `ms`, returning the loudest thing each saw: `all` is
 * everything reaching the destination, `spk` is only the part of it a phone's
 * own speaker could reproduce.
 */
async function listen(page, ms) {
  const until = Date.now() + ms;
  let all = 0, spk = 0;
  while (Date.now() < until) {
    const p = await page.evaluate(() => [window.__peak(), window.__spkPeak()]);
    if (p[0] > all) all = p[0];
    if (p[1] > spk) spk = p[1];
    await page.waitForTimeout(25);
  }
  return { all, spk };
}

async function main() {
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  console.log(`[phonesound] starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
  server = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);

  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    // NO --autoplay-policy override. That flag is the reason this bug reaches
    // production: with it, a broken build is indistinguishable from a good one.
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  const ctx = await browser.newContext({
    viewport: SCREEN, hasTouch: true, isMobile: true, deviceScaleFactor: 3,
  });
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[page-error] ${e}`));

  console.log(`\n[phonesound] ${SCREEN.width}x${SCREEN.height}, touch, autoplay policy left alone`);
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=CREATE BATTLE", { timeout: 60000 });
  await page.waitForTimeout(1200);

  // ---- 1 & 2: silent before the first touch ----
  const before = await page.evaluate(async () => {
    const a = window.__bretwaldaAudio;
    if (!a) return { missing: true };
    for (let i = 0; i < 8; i++) a.impact({ material: "flesh", damage: 30, local: true });
    a.ui("matchWon"); a.ui("purchase"); a.death({ local: true });
    return { missing: false, built: window.__ac.built, ready: a.ready };
  });
  check("the audio module is on the landing page at all", before.missing === false,
    before.missing ? "window.__bretwaldaAudio is undefined" : "armed and silent");
  check("no AudioContext exists before the player has touched anything",
    before.built === 0, `${before.built} constructed`);
  check("eleven events fired before the first touch report the engine not ready",
    before.ready === false, `ready=${before.ready}`);

  // ---- 3: the gesture that enters a match ----
  // The real path a player takes on a phone, by touch, not by dispatching an
  // event: TRAINING, then a difficulty, which starts a fight.
  await page.getByRole("button", { name: /Training/i }).tap();
  await page.waitForTimeout(600);
  const started = await page.evaluate(() => ({ built: window.__ac.built, state: window.__ac.ctx?.state ?? null }));
  check("the first real touch builds exactly one AudioContext",
    started.built === 1, `${started.built} constructed on the first tap`);

  await page.getByRole("button", { name: /WARRIOR/i }).first().tap();
  await page.waitForFunction(() => window.__bretwaldaAudio?.ready === true, null, { timeout: 30000 })
    .catch(() => {});
  const live = await page.evaluate(() => ({
    state: window.__ac.ctx?.state ?? null,
    ready: window.__bretwaldaAudio?.ready === true,
    muted: window.__bretwaldaAudio?.muted === true,
  }));
  check("the context resumed instead of staying suspended",
    live.state === "running" && live.ready, `state=${live.state}, module ready=${live.ready}, muted=${live.muted}`);

  // ---- 4: and sound actually comes out ----
  const idle = await listen(page, 300);
  await page.evaluate(() => {
    const a = window.__bretwaldaAudio;
    a.ui("matchWon");
    for (let i = 0; i < 4; i++) a.impact({ material: "parry", local: true });
    a.death({ local: true });
  });
  const loud = await listen(page, 1500);
  check("sound is emitted after the gesture, measured at the destination",
    loud.all > 0.01 && loud.all < 0.99, `peak ${loud.all.toFixed(4)} against ${idle.all.toFixed(4)} at rest`);

  // ---- 5: the engine knows it is on a phone ----
  //
  // Not a volume tier — `setSpeaker` changes what is SYNTHESISED, because every
  // gram of weight in this game lives between 46 and 190 Hz and a micro-speaker
  // reproduces none of it. The sniff is a sniff (there is no Web Audio API that
  // answers this) so the one thing worth gating is that it FIRES on the device
  // it was written for: a 390x844 touch viewport is a phone by any definition.
  const speaker = await page.evaluate(() => window.__bretwaldaAudio?.speaker ?? null);
  check("the engine detects a phone speaker at 390x844 with touch",
    speaker === "small", `speaker="${speaker}" (expected "small"; "full" means the phone is being handed the desktop mix)`);

  // ---- 6: and the WEIGHT survives a speaker with no low end ----
  //
  // This is the claim `soundtest` phase 4 proves offline against a calibrated
  // filter, asserted here once more against the LIVE app through real biquads:
  // a flesh hit — the heaviest, lowest, most important sound in a melee game —
  // must still be audible after the bottom two octaves are taken away. Before
  // `body()` existed it lost 22 dB there and landed 19 dB under the parry, which
  // is a phone getting a fight with the blows deleted and the ringing left in.
  await page.evaluate(() => {
    const a = window.__bretwaldaAudio;
    for (let i = 0; i < 3; i++) a.impact({ material: "flesh", damage: 34, heavy: true, local: true });
  });
  const weight = await listen(page, 1200);
  const carried = weight.spk / Math.max(weight.all, 1e-6);
  check("a heavy blow still has a body after the phone speaker has taken the bottom off",
    weight.all > 0.01 && carried >= 0.35,
    `${(20 * Math.log10(Math.max(carried, 1e-6))).toFixed(1)} dB survives the speaker model (peak ${weight.all.toFixed(4)} -> ${weight.spk.toFixed(4)}; need >= -9.1 dB)`);

  // ---- and the mute the player can reach from here ----
  await page.getByRole("button", { name: /Turn sound off/i }).first().tap();
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const a = window.__bretwaldaAudio;
    a.ui("matchWon");
    for (let i = 0; i < 4; i++) a.impact({ material: "parry", local: true });
  });
  const silenced = await listen(page, 900);
  const stored = await page.evaluate(() => localStorage.getItem("bretwalda.audio.muted"));
  check("one tap on the toggle silences it and the device remembers",
    silenced.all <= 0.001 && stored === "1", `peak ${silenced.all.toFixed(4)} muted, localStorage muted=${stored}`);

  await browser.close();
  const failed = results.filter((x) => !x.pass);
  console.log(`\n[phonesound] ${results.length - failed.length}/${results.length} claims proven`);
  if (failed.length) {
    console.log("[phonesound] UNPROVEN: " + failed.map((f) => f.name).join(", "));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error("[phonesound] failed:", e); process.exitCode = 1; })
  .finally(() => { if (server) server.kill("SIGTERM"); });
