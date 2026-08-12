#!/usr/bin/env node
// ============================================================
// TIERTEST — does the quality tier a device gets describe the device?
//
//   node tools/tiertest.mjs            # the working tree
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
// PROOF OF FAILURE — required by PROCESS.md R2, a harness that has only ever
// been seen green has never been tested:
//
//     node tools/tiertest.mjs --rev=<the commit before the fix>
//
// went RED with 11 passed / 8 failed: three device rows (a 6 GB Galaxy A54, a
// 6 GB Redmi Note 12 and a hardened browser reporting four cores — every one of
// them a current handset sent to the tier with no ORM maps in it), the three
// sampling knobs `medium` was giving up for nothing, the absence of any player
// control, and the absence of any measurement at all.
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
  const module = { exports: {} };
  const require_ = (id) => {
    if (id === "three") return THREE_STUB;
    throw new Error(`tiertest does not stub ${id}; quality.ts grew a dependency`);
  };
  new Function("exports", "require", "module", js)(module.exports, require_, module);
  return module.exports;
}

// ------------------------------------------------------------
// A synthetic device. Everything `probeDevice` and the governor read.
// ------------------------------------------------------------
function installDevice(d) {
  const store = new Map();
  const win = {
    innerWidth: d.width,
    innerHeight: d.height,
    devicePixelRatio: d.dpr ?? 2,
    location: { search: d.search ?? "" },
    dispatchEvent: () => true,
  };
  if (d.touch) win.ontouchstart = null;
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
  // --------------------------------------------------------
  console.log("\nthe frame-time governor");
  if (!quality.QUALITY_GOVERNOR) {
    check("something measures the device rather than guessing", false,
      "no QUALITY_GOVERNOR export — the tier is a guess with no evidence behind it, forever");
    return;
  }

  // A fake rAF clock, so 400 frames take no time at all.
  const drive = (gov, intervals) => {
    let t = 0;
    let cb = null;
    globalThis.requestAnimationFrame = (fn) => { cb = fn; return 1; };
    globalThis.cancelAnimationFrame = () => { cb = null; };
    gov.stop(); // the governor is a singleton; stop() releases its rAF handle
    return { pump: () => { for (const dt of intervals) { if (!cb) break; const f = cb; cb = null; t += dt; f(t); } } };
  };

  const gov = quality.QUALITY_GOVERNOR;
  const rep = (n, v) => Array.from({ length: n }, () => v);

  // Steady 60 fps on a phone that started at `medium`: nothing moves.
  installDevice({ touch: true, cores: 8, memoryGb: 4, width: 393, height: 873 });
  gov.stop(); gov.windows = 0;
  let d = drive(gov, rep(1200, 16.7));
  gov.arm("medium");
  d.pump();
  check("60 fps on medium is left alone", gov.windows > 0 && localStorage.getItem("bbm.quality.measured") === null,
    `windows=${gov.windows} measured=${localStorage.getItem("bbm.quality.measured")} — a clean phone must not be promoted onto the tier the owner measured as laggy`);

  // 25 fps: the "laggy" the owner reported. Two windows and it must give way.
  installDevice({ touch: true, cores: 8, memoryGb: 4, width: 393, height: 873 });
  gov.stop(); gov.windows = 0;
  d = drive(gov, rep(1200, 40));
  gov.arm("medium");
  d.pump();
  check("25 fps on medium demotes to low", localStorage.getItem("bbm.quality.measured") === "low",
    `measured=${localStorage.getItem("bbm.quality.measured")} p50=${gov.p50}`);

  // A single hitch in an otherwise clean run must not cost a tier.
  installDevice({ touch: true, cores: 8, memoryGb: 4, width: 393, height: 873 });
  gov.stop(); gov.windows = 0;
  const hitched = rep(1200, 16.7);
  hitched[300] = 180;
  hitched[700] = 210;
  d = drive(gov, hitched);
  gov.arm("medium");
  d.pump();
  check("two hitches in twenty seconds cost nothing", localStorage.getItem("bbm.quality.measured") === null,
    `measured=${localStorage.getItem("bbm.quality.measured")} — one GC storm must not cost a tier`);

  // The rescue: a device `detectTier` had to assume was ancient, rendering clean.
  installDevice({ touch: true, cores: 2, memoryGb: 1, width: 360, height: 640 });
  gov.stop(); gov.windows = 0;
  d = drive(gov, rep(1200, 16.7));
  gov.arm("low");
  d.pump();
  check("a clean 'low' device is rescued to medium", localStorage.getItem("bbm.quality.measured") === "medium",
    `measured=${localStorage.getItem("bbm.quality.measured")} — this is the quantised-deviceMemory case, measured instead of guessed`);

  // Under automation it must not run at all: this box has no GPU, and a governor
  // that armed here would persist a SwiftShader verdict into every capture the
  // repository takes and every sheet would still look plausible.
  installDevice({ touch: false, cores: 8, memoryGb: 8, width: 1280, height: 720, webdriver: true });
  gov.stop(); gov.windows = 0;
  d = drive(gov, rep(1200, 900));
  gov.arm("high");
  d.pump();
  check("disarmed under Playwright", gov.windows === 0 && localStorage.getItem("bbm.quality.measured") === null,
    `windows=${gov.windows} measured=${localStorage.getItem("bbm.quality.measured")} — SwiftShader is not a phone`);

  // The ratchet has to be escapable. A device demoted once — a hot phone, a bad
  // browser build, a tab with forty other tabs behind it — must not be pinned to
  // the worst thing it ever did for the life of the install. Choosing "Automatic"
  // in the settings is the player asking to be measured again, and if the stored
  // ceiling outlived that, it would not be.
  installDevice({ touch: true, cores: 8, memoryGb: 4, width: 393, height: 873 });
  gov.stop(); gov.windows = 0;
  d = drive(gov, rep(1200, 40));
  gov.arm("medium");
  d.pump();
  const ratcheted = localStorage.getItem("bbm.quality.ceiling");
  quality.setQualityPreference("auto");
  check("choosing Automatic clears a stale demotion",
    ratcheted === "low" && localStorage.getItem("bbm.quality.ceiling") === null
      && localStorage.getItem("bbm.quality.measured") === null,
    `ceiling was ${ratcheted}, is now ${localStorage.getItem("bbm.quality.ceiling")}`);
}

const source = REV
  ? execFileSync("git", ["show", `${REV}:${SRC}`], { cwd: ROOT, encoding: "utf8" })
  : readFileSync(resolve(ROOT, SRC), "utf8");

run(loadQuality(source), REV ? `quality.ts at ${REV}` : "quality.ts, working tree");

console.log(`\n${fails ? "FAIL" : "PASS"}: ${passes} check(s) passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
