#!/usr/bin/env node
// ============================================================
// TIERTEST — does the quality tier a device gets describe the device?
//
//   npm run tiertest                   # the working tree
//   node tools/tiertest.mjs --rev=HEAD # the same checks against a git revision
//
// ------------------------------------------------------------
// WHY THIS EXISTS
//
// The owner: "The quality of visuals & graphics is much lower on mobile I think
// currently, we need to try to get the best quality visuals possible on all
// screens & in game possible for both mobile & desktop."
//
// That report was answered for months by two lines in `detectTier`:
//
//     const weak = probe.cores <= 4 || probe.memoryGb <= 4 || min(w,h) <= 320;
//     return weak ? "low" : "medium";
//
// and NOTHING IN THIS REPOSITORY COULD SEE WHAT WAS WRONG WITH THEM. `npm run
// perf` pins `?quality=`, so it measures a tier it was handed. `fpstest` pins
// `?quality=`. `shoot` pins `?quality=`. Every instrument the project owns
// measures what a tier COSTS; not one of them ever asked whether the tier a real
// handset is given is the right one, which is a twelfth instance of this repo's
// signature failure — the ruler answering a question nobody asked.
//
// `navigator.deviceMemory` is specified to be quantised DOWNWARD to a power of
// two and capped at 8. A Galaxy A54 with 6 GB reports 4. A phone with 7.9 GB
// reports 4. So `memoryGb <= 4` did not mean "four gigabytes", it meant "under
// eight", which is most Android handsets ever sold — and `low` is the tier where
// `packOrm` strips roughness, metalness and AO off every surface in the game.
//
// WHAT THIS MEASURES that nothing else did: the DECISION, against a table of
// real handsets reporting what those handsets actually report.
//
// It runs the real `detectTier`, `resolveQuality` and `QualityGovernor` out of
// src/, transpiled in memory, with `three` stubbed and a synthetic `window`.
// Nothing is mocked except the device.
//
// ------------------------------------------------------------
// ROUND TWO — WHAT THIS FILE COULD NOT SEE, AND NOW CAN
//
// The first version of this harness passed 27/0 while the code it certified
// could permanently pin a DESKTOP to `low`. An adversary drove it and found
// three things this file was structurally unable to notice:
//
//   1. Every fixture started from an empty localStorage and ran ONE session. A
//      persisted verdict is by definition about the NEXT load, so the harness
//      could not see a demotion cascade within a session, and could not see it
//      survive five clean sessions afterwards. `installDevice(dev, {keep:true})`
//      and `openSession` are the fix: a reload is a reload now.
//   2. It never drove a SECOND demotion, so it could not catch that judge()
//      reset `bad` but not `warmup` and went straight back to judging frames
//      still being rendered by the tier it had just left.
//   3. Its row for "choosing Automatic clears a stale demotion" was green on a
//      function with ZERO CALLERS in the shipped app. A gate that is green
//      because the case is absent is not a gate. Those rows now go through
//      `readQualityStatus`, which is the exact call GameHud's GRAPHICS panel
//      renders from.
//
// PROOF OF FAILURE — required by PROCESS.md R2, a harness that has only ever
// been seen green has never been tested. Both revisions still go red:
//
//     node tools/tiertest.mjs --rev=411f427            11 passed /  8 failed
//         the pre-fix build: a 6 GB Galaxy A54, a 6 GB Redmi Note 12 and a
//         hardened browser reporting four cores all sent to the tier with no
//         ORM maps in it; three sampling knobs `medium` gave up for nothing; no
//         player control; no measurement anywhere.
//
//     node tools/tiertest.mjs --rev=mobile-quality-tier 26 passed / 10 failed
//         round one, on the ten rows above: "rendered low,low,low" three clean
//         sessions after one bad twenty seconds, ceiling `low`, and no panel
//         able to say so or undo it.
// ============================================================
import { readFileSync } from "fs";
import { execFileSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "src/game/client/render/quality.ts";
const REV = (process.argv.find((a) => a.startsWith("--rev=")) || "").slice(6);

let fails = 0;
let passes = 0;
const check = (name, ok, detail) => {
  if (ok) { passes++; console.log(`  PASS  ${name}`); }
  else { fails++; console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`); }
};

// ------------------------------------------------------------
// Load quality.ts. `three` is stubbed to the two constants and the one class
// shape this module touches, so the check needs no GL and no browser.
// ------------------------------------------------------------
const THREE_STUB = {
  PCFSoftShadowMap: 2,
  PCFShadowMap: 1,
  Object3D: class { },
  Vector3: class { },
  PerspectiveCamera: class { },
  WebGLRenderer: class { },
};

function loadQuality(source) {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  // `mod`, not `module`: this file is linted by eslint-config-next, and
  // `@next/next/no-assign-module-variable` is right to object even here — the
  // name shadows the CommonJS binding that the transpiled source is about to be
  // handed. Round two added the tenth eslint error in the repo by writing it.
  const mod = { exports: {} };
  const require_ = (id) => {
    if (id === "three") return THREE_STUB;
    throw new Error(`tiertest does not stub ${id}; quality.ts grew a dependency`);
  };
  new Function("exports", "require", "module", js)(mod.exports, require_, mod);
  return mod.exports;
}

// ------------------------------------------------------------
// A synthetic device. Everything `probeDevice` and the governor read.
//
// `keep` is what makes a RELOAD a reload: localStorage is the only thing that
// survives one, and every interesting governor fault is a fault about what one
// session writes into the next. Round one could not express that at all — every
// call started from an empty store — which is exactly why it could not see a
// demotion cascade or a permanent pin.
// ------------------------------------------------------------
let lastStore = null;
function installDevice(d, opts = {}) {
  const store = opts.keep && lastStore ? lastStore : new Map();
  lastStore = store;
  const win = {
    innerWidth: d.width,
    innerHeight: d.height,
    devicePixelRatio: d.dpr ?? 2,
    location: { search: d.search ?? "" },
    dispatchEvent: () => true,
  };
  if (d.touch) win.ontouchstart = null;
  if (d.governor) win.__governor = d.governor;
  const define = (name, value) =>
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  define("window", win);
  // Node 22 ships a real `navigator` behind a getter-only property descriptor,
  // so plain assignment throws. This is the device under test; it has to go.
  define("navigator", {
    maxTouchPoints: d.touch ? 5 : 0,
    hardwareConcurrency: d.cores,
    // `undefined` is Safari, which does not implement the API at all — that is
    // a different case from a browser reporting a low number and the tier logic
    // has to tell them apart.
    ...(d.memoryGb === undefined ? {} : { deviceMemory: d.memoryGb }),
    webdriver: d.webdriver ?? false,
  });
  define("document", { hidden: false });
  define("localStorage", {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  });
  return store;
}

// ------------------------------------------------------------
// THE TABLE. Every row is a device that exists, reporting what it reports.
//
// `deviceMemory` values are the QUANTISED figure the browser actually hands
// out — down to a power of two, capped at 8 — not the RAM on the spec sheet.
// That gap is the entire defect, so writing the spec-sheet number here would
// reproduce the defect inside the harness that is supposed to catch it.
// ------------------------------------------------------------
const DEVICES = [
  // name                          touch  cores  reports  w     h     want
  ["iPhone 15 Pro (Safari)",       true,  6,     undefined, 393, 852, "medium"],
  ["iPhone SE 3rd gen (Safari)",   true,  6,     undefined, 375, 667, "medium"],
  // 6 GB and 8 GB of real RAM. Both hand out `4`. Both used to get `low`.
  ["Galaxy A54, 6 GB (Chrome)",    true,  8,     4,         360, 800, "medium"],
  ["Pixel 7a, 8 GB (Chrome)",      true,  8,     8,         412, 915, "medium"],
  ["Redmi Note 12, 6 GB",          true,  8,     4,         393, 873, "medium"],
  // A privacy-hardened browser under-reporting cores on a current SoC.
  ["hardened browser, 4 cores",    true,  4,     4,         390, 844, "medium"],
  // Genuinely old. These must still reach `low` or the floor has been removed
  // rather than repaired, which is the failure mode this row exists to catch.
  ["2014 dual-core, 1 GB",         true,  2,     1,         360, 640, "low"],
  ["iPhone 5s / 320 px class",     true,  2,     undefined, 320, 568, "low"],
  ["4 cores but only 2 GB",        true,  4,     2,         360, 640, "low"],
  // Desktop is unchanged by any of this and has to stay unchanged.
  ["desktop 1920",                 false, 8,     8,         1920, 1080, "high"],
  ["desktop, narrow window",       false, 8,     8,         800,  900,  "medium"],
];

function run(quality, label) {
  console.log(`\n${label}\n${"-".repeat(label.length)}`);

  console.log("\ndevice tiers");
  for (const [name, touch, cores, memoryGb, width, height, want] of DEVICES) {
    installDevice({ touch, cores, memoryGb, width, height });
    const got = quality.detectTier(quality.probeDevice());
    check(`${name.padEnd(30)} -> ${got}`, got === want, `wanted ${want}`);
  }

  // --------------------------------------------------------
  // The two knobs `low` costs the most. A tier is not a label; it is what it
  // strips. If `low` ever stops meaning "no ORM maps" these rows should be
  // rewritten, not deleted.
  // --------------------------------------------------------
  console.log("\nwhat the mobile tier is allowed to be worse at");
  const hi = quality.QUALITY_PRESETS.high;
  const med = quality.QUALITY_PRESETS.medium;
  check("anisotropy at parity with desktop", med.anisotropy === hi.anisotropy,
    `medium ${med.anisotropy} vs high ${hi.anisotropy} — sampler state, not fill`);
  check("env map at parity with desktop", med.envMapSize === hi.envMapSize,
    `medium ${med.envMapSize} vs high ${hi.envMapSize} — the only specular source on medium`);
  check("sprites at parity with desktop", med.spriteSize === hi.spriteSize,
    `medium ${med.spriteSize} vs high ${hi.spriteSize}`);
  check("textures at parity with desktop", med.textureSize === hi.textureSize,
    `medium ${med.textureSize} vs high ${hi.textureSize}`);
  // And the fill-rate knobs must NOT be at parity: the owner measured `high` as
  // laggy on his own handset, so a run where these went equal is a run that has
  // quietly undone a real-hardware finding.
  check("pixel ratio still below desktop", med.maxPixelRatio < hi.maxPixelRatio,
    `medium ${med.maxPixelRatio} vs high ${hi.maxPixelRatio} — the owner measured high as laggy on his phone`);
  check("shadow map still below desktop", med.shadowMapSize < hi.shadowMapSize,
    `medium ${med.shadowMapSize} vs high ${hi.shadowMapSize}`);

  // --------------------------------------------------------
  // Precedence. A pin has to beat a preference has to beat a measurement.
  // --------------------------------------------------------
  console.log("\nwho wins");
  if (quality.setQualityPreference) {
    installDevice({ touch: true, cores: 8, memoryGb: 4, width: 393, height: 873 });
    check("auto is the default", quality.readQualityPreference() === "auto");
    quality.setQualityPreference("high");
    check("a player's choice is honoured", quality.resolveQuality().tier === "high",
      `got ${quality.resolveQuality().tier}`);
    quality.setQualityPreference("auto");
    check("clearing it returns to the device", quality.resolveQuality().tier === "medium",
      `got ${quality.resolveQuality().tier}`);

    installDevice({ touch: true, cores: 8, memoryGb: 4, width: 393, height: 873, search: "?quality=low" });
    quality.setQualityPreference("high");
    check("a URL pin beats a player's choice", quality.resolveQuality().tier === "low",
      `got ${quality.resolveQuality().tier} — capture harnesses depend on this`);
  } else {
    check("a player can choose a tier at all", false,
      "no setQualityPreference export — ?quality= is the only control and it has no UI");
  }

  // --------------------------------------------------------
  // The governor. Feed it frame intervals and see what it concludes.
  //
  // Everything below drives the REAL state machine: the intervals go in through
  // a stubbed requestAnimationFrame and the tier comes out through
  // `resolveQuality`, which is the same call GameCanvas makes. Nothing is faked
  // but the clock and the device.
  //
  // WHAT IS STILL NOT MEASURED, and it rides this file's verdict line: the
  // thresholds themselves. 22 ms p50 and 50 ms p95 are chosen numbers, not
  // observed ones — see the note above them in quality.ts. What follows tests
  // what the machine DOES with them, not whether they are the right numbers for
  // real silicon, and nothing in this repository tests the latter.
  // --------------------------------------------------------
  console.log("\nthe frame-time governor");
  if (!quality.QUALITY_GOVERNOR) {
    check("something measures the device rather than guessing", false,
      "no QUALITY_GOVERNOR export — the tier is a guess with no evidence behind it, forever");
    return;
  }

  const gov = quality.QUALITY_GOVERNOR;
  const rep = (n, v) => Array.from({ length: n }, () => v);
  const measured = () => localStorage.getItem("bbm.quality.measured");
  const ceiling = () => localStorage.getItem("bbm.quality.ceiling");

  check("the governor can be returned to a cold start", typeof gov.reset === "function",
    "no QUALITY_GOVERNOR.reset — a harness cannot simulate the reload that every " +
    "persisted verdict is about, so nothing here can see a cascade or a permanent pin");

  /**
   * ONE PAGE LOAD, end to end. Installs the device (keeping localStorage unless
   * asked for a clean profile), returns the governor to the state a fresh module
   * would be in, stubs rAF, resolves quality the way the app does — which is
   * what arms the governor — and then feeds it frames.
   *
   * Returns the tier the load actually rendered and how many frames the governor
   * consumed before it let go of the clock. That second number is the assertion
   * that matters for a cascade: a governor that has stopped stops asking.
   */
  const openSession = (dev, opts = {}) => {
    installDevice(dev, { keep: !opts.fresh });
    // The fallback is for `--rev=` runs against a revision that predates
    // `reset`. It clears what it can reach from outside so those runs go red on
    // the defects and not on the harness: an uncleared `windows` would fail the
    // Playwright row, which round one actually got right.
    if (gov.reset) gov.reset(); else { gov.stop(); gov.windows = 0; }
    let t = 0;
    let cb = null;
    globalThis.requestAnimationFrame = (fn) => { cb = fn; return 1; };
    globalThis.cancelAnimationFrame = () => { cb = null; };
    const tier = quality.resolveQuality().tier;
    /** Feeds frames until they run out or the governor lets go of the clock. */
    const pump = (intervals) => {
      let frames = 0;
      for (const dt of intervals) {
        if (!cb) break;
        const f = cb; cb = null; t += dt; frames++; f(t);
      }
      return frames;
    };
    return { tier, pump };
  };

  const session = (dev, intervals, opts = {}) => {
    const s = openSession(dev, opts);
    const frames = s.pump(intervals);
    return { tier: s.tier, frames, windows: gov.windows, p50: gov.p50 };
  };

  const PHONE = { touch: true, cores: 8, memoryGb: 4, width: 393, height: 873 };
  const ANCIENT = { touch: true, cores: 2, memoryGb: 1, width: 360, height: 640 };
  const DESKTOP = { touch: false, cores: 8, memoryGb: 8, width: 1920, height: 1080 };
  const CLEAN = rep(1200, 16.7);
  /** 25 fps — the "laggy" the owner reported, held for twenty seconds. */
  const LAGGY = rep(1200, 40);

  // Steady 60 fps on a phone that started at `medium`: nothing moves.
  let s = session(PHONE, CLEAN, { fresh: true });
  check("60 fps on medium is left alone", s.windows > 0 && measured() === null,
    `windows=${s.windows} measured=${measured()} — a clean phone must not be promoted onto the tier the owner measured as laggy`);

  // A single hitch in an otherwise clean run must not cost a tier.
  const hitched = rep(1200, 16.7);
  hitched[300] = 180;
  hitched[700] = 210;
  s = session(PHONE, hitched, { fresh: true });
  check("two hitches in twenty seconds cost nothing", measured() === null,
    `measured=${measured()} — one GC storm must not cost a tier`);

  // The rescue: a device `detectTier` had to assume was ancient, rendering clean.
  s = session(ANCIENT, CLEAN, { fresh: true });
  check("a clean 'low' device is rescued to medium", measured() === "medium",
    `measured=${measured()} — this is the quantised-deviceMemory case, measured instead of guessed`);

  // ...and the rescue is reversible, because for THIS device `detectTier` agrees
  // it is weak. It is the one shape of device the floor lets back down to `low`.
  s = session(ANCIENT, LAGGY);
  check("a rescued ancient device can be put back", s.tier === "medium" && measured() === "low",
    `rendered ${s.tier}, measured=${measured()} — the floor is reachable where the device itself looks weak`);

  // Under automation it must not run at all: this box has no GPU, and a governor
  // that armed here would persist a SwiftShader verdict into every capture the
  // repository takes and every sheet would still look plausible.
  s = session({ ...DESKTOP, webdriver: true }, rep(1200, 900), { fresh: true });
  check("disarmed under Playwright", s.windows === 0 && measured() === null,
    `windows=${s.windows} measured=${measured()} — SwiftShader is not a phone`);

  // But a harness that MEANS to drive it — a real phone on a real GL context —
  // has a way in, and it has to be a way nothing takes by accident. Without this
  // the state machine could never be exercised in a browser at all, which is how
  // its thresholds came to rest on nothing.
  s = session({ ...DESKTOP, webdriver: true, governor: "measure" }, CLEAN, { fresh: true });
  check("a harness can opt in to driving it by name", s.windows > 0,
    `windows=${s.windows} — window.__governor = "measure" is the only door and it must open`);

  // --------------------------------------------------------
  // THE CASCADE — the round-one defect, reproduced in the shape the adversary
  // reported it. A DESKTOP on a brand-new profile that renders at 40 ms for
  // twenty seconds in ONE session came out of round one measured `low`, ceiling
  // `low`, and stayed there through five clean sessions afterwards while
  // detectTier went on saying `high`. `low` is the tier with no ORM maps.
  //
  // Two faults made it: judge() demoted, reset `bad` but not `warmup`, and went
  // straight back to judging frames that were still being rendered by the tier
  // it had just left; and the floor was the bottom of the enum rather than
  // anything about the device.
  // --------------------------------------------------------
  console.log("\na demotion that cannot cascade (the desktop the adversary drove)");

  s = session(DESKTOP, LAGGY, { fresh: true });
  check("a stuttering desktop steps DOWN ONE, not two", s.tier === "high" && measured() === "medium",
    `rendered ${s.tier}, measured=${measured()} — round one made this 'low' in the same session`);
  check("it stops counting the moment it moves", s.windows === 2 && s.frames < 1200,
    `windows=${s.windows} frames=${s.frames} of 1200 — after applyLive only the pixel ratio has ` +
    `changed, so every later frame is the OLD build and judging it is a measurement error`);
  check("frame time alone never reaches the tier with no ORM maps", measured() !== "low",
    `measured=${measured()} — packOrm strips roughness, metalness and AO off every surface at low`);

  // A SECOND BAD DAY, and this is the row the floor exists for. One move per
  // session bounds what a single session can do; it does not stop a device
  // walking down the enum one reload at a time. `governorFloor` is what makes
  // `medium` the bottom for a machine detectTier calls `high`, however many bad
  // afternoons it has.
  s = session(DESKTOP, LAGGY);
  check("a second bad session cannot walk it further down",
    s.tier === "medium" && measured() === "medium" && ceiling() === "medium",
    `rendered ${s.tier}, measured=${measured()} ceiling=${ceiling()}`);

  // Four more sessions, same store, same clean frames. Round one held `low`
  // through all of them. A short clean run must not undo the ratchet either —
  // that is what the ratchet is for — so these first three change nothing.
  let held = [];
  for (let i = 0; i < 3; i++) held.push(session(DESKTOP, rep(600, 16.7)).tier);
  check("three clean sessions later it is still medium, not low", held.join(",") === "medium,medium,medium",
    `rendered ${held.join(",")} — measured=${measured()} ceiling=${ceiling()}`);

  // And the way back. Thirty seconds of unbroken clean frames is four times the
  // evidence a demotion asks for, and it lifts the ratchet one step.
  s = session(DESKTOP, rep(1800, 16.7));
  check("a sustained clean run climbs back out", measured() === "high" && ceiling() === "high",
    `measured=${measured()} ceiling=${ceiling()} — a device demoted on one bad afternoon must not be pinned for the life of the install`);
  s = session(DESKTOP, rep(600, 16.7));
  check("and the next load renders it", s.tier === "high", `rendered ${s.tier}`);

  // The same shape one tier down, on the device this unit is actually about: a
  // mid-range phone that stutters is held at `medium` and NOT stripped. There is
  // no honest way to tell a slow GPU from a hot phone or a browser mid-update
  // from frame time, and the cost of being wrong is the whole game's ORM maps.
  s = session(PHONE, LAGGY, { fresh: true });
  check("a stuttering phone is held, not stripped", s.tier === "medium" && measured() === null,
    `rendered ${s.tier}, measured=${measured()} — the answer for this player is the GRAPHICS panel, not a silent one-way demotion`);

  // --------------------------------------------------------
  // THE RELEASE VALVE. Round one documented one and shipped no caller: repo-wide,
  // setQualityPreference / applyQualityPreference / QUALITY_CHOICES appeared only
  // in this file and in .next build output. So the row below — "choosing
  // Automatic clears a stale demotion" — was green on a code path the app could
  // not reach, which is a gate that is green because the case is absent.
  //
  // These rows now assert against `readQualityStatus`, which is the exact
  // function GameHud's GRAPHICS panel renders from, so what is tested is what a
  // player is shown.
  // --------------------------------------------------------
  console.log("\nthe release valve (what the GRAPHICS panel reads and writes)");

  if (!quality.readQualityStatus || !quality.chooseQuality) {
    check("a panel can tell the player what is happening to him", false,
      "no readQualityStatus/chooseQuality export — the only control is ?quality= and it has no UI");
  } else {
    session(DESKTOP, LAGGY, { fresh: true });
    let st = quality.readQualityStatus();
    check("a demotion is visible to the panel that has to explain it",
      st.demoted === true && st.active === "medium" && st.detected === "high",
      `active=${st.active} detected=${st.detected} demoted=${st.demoted}`);

    quality.chooseQuality("auto");
    st = quality.readQualityStatus();
    check("choosing Automatic clears a stale demotion",
      st.demoted === false && st.active === "high" && measured() === null && ceiling() === null,
      `active=${st.active} demoted=${st.demoted} measured=${measured()} ceiling=${ceiling()}`);

    // A player who picks a tier has taken the wheel MID-FIGHT, and a governor
    // still counting underneath him would go on writing verdicts and ratchets
    // that outlive his choice. So: one bad window in (not yet enough to act),
    // the player picks High, and then twenty more seconds of terrible frames.
    // Nothing may move, and the governor must have let go of the clock — which
    // `left` measures, because a stopped governor stops asking for frames.
    const live = openSession(DESKTOP, { fresh: true });
    live.pump(rep(400, 40));
    quality.chooseQuality("high");
    const left = live.pump(rep(1200, 40));
    check("a player's choice takes the governor off the wheel mid-fight",
      left === 0 && measured() === null && ceiling() === null
        && quality.readQualityStatus().active === "high",
      `${left} frames still consumed, measured=${measured()} ceiling=${ceiling()}`);

    // And the player may choose the tier the governor is not allowed to choose
    // for him. This is the whole reason the floor above can be as conservative
    // as it is.
    // The player may choose the tier the governor is not allowed to choose for
    // him. This is what lets the floor above be as conservative as it is.
    openSession(DESKTOP, { fresh: true });
    quality.chooseQuality("low");
    st = quality.readQualityStatus();
    check("the player may still ask for Fast himself", st.active === "low" && st.choice === "low",
      `active=${st.active} choice=${st.choice}`);

    // And the panel must not claim the whole change landed. Everything but the
    // pixel ratio is forged once from QualitySettings, so `forged` is what the
    // frame on screen is made of and `active` is what the store now says. The
    // gap between them is the "Kept — rebuilds when the arena is next built"
    // row; without this field the panel would be lying politely.
    check("a mid-fight change knows it is only half applied",
      st.forged === "high" && st.active === "low",
      `forged=${st.forged} active=${st.active}`);
    const reloaded = session(DESKTOP, []);
    check("and the next load closes the gap",
      reloaded.tier === "low" && quality.readQualityStatus().forged === "low",
      `rendered ${reloaded.tier}, forged=${quality.readQualityStatus().forged}`);
    quality.chooseQuality("auto");
  }
}

const source = REV
  ? execFileSync("git", ["show", `${REV}:${SRC}`], { cwd: ROOT, encoding: "utf8" })
  : readFileSync(resolve(ROOT, SRC), "utf8");

run(loadQuality(source), REV ? `quality.ts at ${REV}` : "quality.ts, working tree");

console.log(`\n${fails ? "FAIL" : "PASS"}: ${passes} check(s) passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
