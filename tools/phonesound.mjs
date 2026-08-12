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

  // ---- 5: the WEIGHT survives a speaker with no low end ----
  //
  // `soundtest` phase 4 proves this offline against a calibrated filter. This is
  // the same claim put to the LIVE app, through real BiquadFilterNodes, and it
  // is deliberately a DIFFERENTIAL rather than an absolute.
  //
  // The absolute version was tried first and it is the wrong measurement twice
  // over. It read `bus.speaker` to check the device sniff had fired, and that
  // property came back undefined in this page while a probe against the same
  // server on the same viewport read "small" from it — a bundling question, not
  // an audio one, and not something an audio harness should be adjudicating.
  // Then it gated the surviving fraction of one blow against a number picked out
  // of the air, measured as a ratio of two analyser PEAKS taken at different
  // instants with a bonfire playing underneath.
  //
  // Driving `setSpeaker` and measuring the DIFFERENCE removes all of that. Both
  // renders contain the same events, the same bed and the same peaks; the only
  // thing that changed is the one code path under test. If `body()` is doing its
  // job, the small-speaker mix puts materially more of a heavy blow inside the
  // band a phone can actually move. 3 dB is a doubling of power and is the least
  // that can be called "this does something".
  const weigh = async (mode) => {
    const ok = await page.evaluate((m) => {
      const a = window.__bretwaldaAudio;
      if (typeof a?.setSpeaker !== "function") return false;
      a.setSpeaker(m);
      return true;
    }, mode);
    if (!ok) return null;
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const a = window.__bretwaldaAudio;
      for (let i = 0; i < 3; i++) a.impact({ material: "flesh", damage: 34, heavy: true, local: true });
    });
    return listen(page, 1300);
  };
  const asDesk = await weigh("full");
  const asPhone = await weigh("small");
  const carried = (m) => (m ? 20 * Math.log10(Math.max(m.spk, 1e-6) / Math.max(m.all, 1e-6)) : NaN);
  const gain = carried(asPhone) - carried(asDesk);
  // When this fails it hands over its own diagnostic rather than making the next
  // person reproduce it. The observation that made that worth doing is in
  // docs/MOBILE-AUDIO.md: this handle has `setSpeaker` on the landing screen and
  // does not have it inside a fight, which is a bundling question — a stale
  // chunk, or two module instances — and either way the list of methods the
  // fight is actually holding is the first thing anybody will want.
  const handle = asDesk === null ? await page.evaluate(() => {
    const a = window.__bretwaldaAudio;
    if (!a) return "window.__bretwaldaAudio is undefined inside the fight";
    const keys = [];
    for (let p = Object.getPrototypeOf(a); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      keys.push(...Object.getOwnPropertyNames(p));
    }
    return `the live handle has: ${keys.filter((k) => k !== "constructor").sort().join(", ")}`;
  }).catch((e) => `could not inspect the handle: ${e}`) : "";
  check("the engine can be told which speaker it is playing through",
    asDesk !== null && asPhone !== null,
    asDesk === null
      ? `setSpeaker is not on the live handle, so the phone gets the desktop mix and nothing can change it. ${handle}. Rule out a stale bundle FIRST: rm -rf .next and reload. See docs/MOBILE-AUDIO.md.`
      : "setSpeaker drives the live graph");
  check("the phone mix puts a heavy blow where a phone speaker can play it",
    asDesk !== null && asPhone !== null && gain >= 3,
    Number.isFinite(gain)
      ? `${carried(asDesk).toFixed(1)} dB survives the speaker model on the desk mix, ${carried(asPhone).toFixed(1)} dB on the phone mix — ${gain >= 0 ? "+" : ""}${gain.toFixed(1)} dB from body() alone (need +3)`
      : "not measured");

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
