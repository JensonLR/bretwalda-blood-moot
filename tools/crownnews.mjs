#!/usr/bin/env node
// ============================================================
// CROWNNEWS — the crowning latch, driven the way a returning player drives it.
//
//   node tools/crownnews.mjs
//
// WHAT THIS MEASURES, AND WHY IT IS NOT `warseen`.
//
// `warseen` owns the FLIP watermark and drives it through a real browser
// against a real database, because a flip is a row somebody else wrote. The
// CROWNING latch is a different animal and deserves its own ruler for one
// reason: it exists precisely BECAUSE it cannot ride the flip watermark.
//
//   `takeWatermark` only writes when a flip exists to be shown, and the visit
//   that matters most for a crowning — the first visit of a FRESH SEASON,
//   right after the reset — has no flips at all. A crowning latched on the
//   flip watermark would therefore shout on every visit until the first
//   border moved, which is the opposite of news.
//
// That is a claim about two page loads with an empty flip list between them,
// and no render can show it. It is also, exactly, the shape of defect this
// repository keeps recording (`docs/PROCESS.md` failure mode 1): the state
// that breaks is the one with an EMPTY store, and every screenshot of the
// working case looks perfect.
//
// THE MODULE UNDER TEST IS THE SHIPPED ONE. `factionMap/Dispatch.tsx` is
// bundled with esbuild and imported — the same test seam `tools/lib/
// clientmodule.mjs` documents for `characters.ts`, for the same reason: a
// harness that keeps its own copy of a rule audits the copy. Nothing in
// `src/` knows this file exists.
//
// No database, no browser, no server: the latch is arithmetic over one
// localStorage key, and the shim below is the only thing standing in.
// ============================================================
import { mkdirSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = resolve(ROOT, ".crownnews");

let pass = 0, fail = 0;
const claim = (ok, name, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? "PASS " : "FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
};

// ---- the store, and it is the only fake in this file --------------------
//
// A Map behind the three methods the module actually calls. Kept addressable
// so a test can wipe it (a new browser), read it (what was stored), or make
// it THROW (private mode), which is a real state the module claims to survive.
const store = new Map();
let throwing = false;
globalThis.localStorage = {
  getItem(k) { if (throwing) throw new Error("private mode"); return store.has(k) ? store.get(k) : null; },
  setItem(k, v) { if (throwing) throw new Error("private mode"); store.set(k, String(v)); },
  removeItem(k) { store.delete(k); },
};

// ---- the shipped module, bundled ---------------------------------------
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
const esbuild = await import("esbuild");
const out = resolve(WORK, "dispatch.mjs");
await esbuild.build({
  entryPoints: [resolve(ROOT, "src/game/client/factionMap/Dispatch.tsx")],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  jsx: "transform",
  // React is never CALLED here — only `takeCrownNews` and `takeWatermark` are,
  // and neither renders. It stays external so the bundle imports the real one
  // rather than shipping a copy, and so a missing React is a loud error rather
  // than a silently different module.
  external: ["react"],
  logLevel: "silent",
  tsconfig: resolve(ROOT, "tsconfig.json"),
});

// A FRESH IMPORT PER BROWSER. `takeCrownNews` caches the arrival value in
// module scope — "once per season per JS context" is its own contract — so a
// test that reused one import would be one long visit, and every claim below
// about a SECOND visit would be measuring nothing. The query string is what
// makes node hand back a new module instance.
let visits = 0;
const newBrowserTab = async () => {
  visits++;
  return import(`${pathToFileURL(out).href}?v=${visits}`);
};

const CROWNS = (...seasons) => seasons.map((s) => ({
  seasonIndex: s, people: "saxon", name: `Champion ${s}`,
}));

// ============================================================
// 1. THE THREE STATES, in the order a real player meets them
// ============================================================
console.log("\n[crownnews] 1. the three states");
{
  store.clear();
  const a = await newBrowserTab();
  const first = a.takeCrownNews(CROWNS(3, 2, 1));
  claim(first !== null && first.seasonIndex === 3,
    "a browser that has never looked is shown the latest crowning",
    first ? `season ${first.seasonIndex}` : "shown nothing");

  // Same browser, a LATER visit: a new tab, the store as the first visit left it.
  const b = await newBrowserTab();
  const second = b.takeCrownNews(CROWNS(3, 2, 1));
  claim(second === null,
    "the visit that showed it is the visit after which it stops being news");

  const c = await newBrowserTab();
  const third = c.takeCrownNews(CROWNS(4, 3, 2, 1));
  claim(third !== null && third.seasonIndex === 4,
    "a NEW crowning is news again", third ? `season ${third.seasonIndex}` : "shown nothing");
}

// ============================================================
// 2. THE REASON THIS LATCH IS NOT THE FLIP WATERMARK
// ============================================================
//
// The season has just reset. There are no flips — nobody has fought yet — so
// `takeWatermark` writes nothing and answers `null` on every visit. If the
// crowning rode that value it would be news forever. This is the case the
// separate key exists for, and it is asserted with BOTH functions side by side
// so the difference is the measurement rather than a claim in a comment.
console.log("\n[crownnews] 2. a fresh season, no flips, three visits");
{
  store.clear();
  const seasonIndex = 9;
  let shown = 0;
  let watermarkAlwaysNull = true;
  for (let visit = 0; visit < 3; visit++) {
    const m = await newBrowserTab();
    // No flips: `newestFlipAt` is 0, which is what `reduce(max, 0)` gives on
    // an empty `recent` — the exact call both callers make.
    if (m.takeWatermark(seasonIndex, 0) !== null) watermarkAlwaysNull = false;
    if (m.takeCrownNews(CROWNS(8)) !== null) shown++;
  }
  claim(watermarkAlwaysNull,
    "the flip watermark stays null across a fresh season's visits — it has nothing to raise");
  claim(shown === 1,
    "the crowning is shown exactly ONCE across those same visits", `shown ${shown} of 3`);
}

// ============================================================
// 3. THE EMPTY AND HOSTILE CASES
// ============================================================
console.log("\n[crownnews] 3. nothing to say, and a store that refuses");
{
  store.clear();
  const a = await newBrowserTab();
  claim(a.takeCrownNews([]) === null, "no crowns yet is no news, not a crash");

  store.clear();
  throwing = true;
  let survived = true, answer = "threw";
  try {
    const b = await newBrowserTab();
    const r = b.takeCrownNews(CROWNS(2));
    answer = r ? `season ${r.seasonIndex}` : "null";
  } catch { survived = false; }
  throwing = false;
  claim(survived,
    "a store that throws (private mode) does not take the screen down", answer);
}

// ============================================================
// 4. THE STORE ITSELF — what is written is a SEASON, not a clock
// ============================================================
//
// The flip watermark's own header spends a page on this: a handset's clock is
// not a fact anyone else shares. The crowning latch stores the season index —
// a number the server minted and handed over — for the same reason.
console.log("\n[crownnews] 4. what is actually stored");
{
  store.clear();
  const a = await newBrowserTab();
  a.takeCrownNews(CROWNS(7));
  const keys = [...store.keys()];
  const key = keys.find((k) => k.includes("crown"));
  claim(!!key, "the latch has its own key, separate from the flip watermark",
    keys.join(", ") || "(nothing stored)");
  claim(key && store.get(key) === "7",
    "it stores the SEASON INDEX the server minted, not a local timestamp",
    key ? `${key} = ${store.get(key)}` : "");
  claim(!keys.some((k) => k.includes("war_seen")),
    "and it does not touch the flip watermark's key");
}

rmSync(WORK, { recursive: true, force: true });
console.log(`\n[crownnews] ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
