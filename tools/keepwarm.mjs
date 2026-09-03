#!/usr/bin/env node
// ============================================================
// KEEPWARM — hold the deployed game awake, as a stopgap.
//
//   node tools/keepwarm.mjs                    every 10 minutes, forever
//   node tools/keepwarm.mjs --every=300        every 5 minutes
//   node tools/keepwarm.mjs --url=https://...  somewhere else
//
// WHY THIS EXISTS, and why it is a stopgap and not a fix.
//
// Measured against the deployed game on 3 Sep 2026, twice, an hour apart:
//
//     cold  GET /   200 in 43.5 s
//     warm  GET /   200 in  0.29 s
//
// The host puts an idle instance to sleep and takes three quarters of a minute
// to wake it. Nothing in this repository can shorten that: the server is not
// running, so there is no code of ours to make faster. A visitor who follows a
// link during that window sees a blank tab for the better part of a minute and
// is gone long before the game loads — and the instance goes back to sleep
// after every quiet stretch, so it happens again to the next one.
//
// THE REAL FIX IS THE HOSTING PLAN, and it is the owner's to make: an instance
// that does not sleep. This file is what to run in the meantime — from a
// machine that stays on, or from any scheduler — so that the instance is never
// idle long enough to be put down. It is deliberately dumb: one GET, no
// dependencies, no state.
//
// It is NOT a substitute for the plan. A laptop that closes is an instance
// that sleeps.
const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const URL_ = arg("url", "https://bretwalda-blood-moot.onrender.com/");
const EVERY = Math.max(60, parseInt(arg("every", "600"), 10)) * 1000;

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
let woke = 0;

async function ping() {
  const t0 = Date.now();
  try {
    const res = await fetch(URL_, { method: "GET", redirect: "follow" });
    const ms = Date.now() - t0;
    // Anything past a couple of seconds on a warm instance is a wake-up, and
    // worth printing loudly: it means the gap between pings was too long, or
    // that this stopgap was not running when somebody arrived.
    const slow = ms > 2000;
    if (slow) woke++;
    console.log(`${stamp()}  ${res.status}  ${(ms / 1000).toFixed(2)}s${slow ? `   <- IT WAS ASLEEP (${woke} so far)` : ""}`);
  } catch (e) {
    console.log(`${stamp()}  FAILED after ${((Date.now() - t0) / 1000).toFixed(2)}s — ${e.message}`);
  }
}

console.log(`[keepwarm] ${URL_} every ${EVERY / 1000}s. Ctrl-C to stop.`);
console.log("[keepwarm] this is a stopgap; the fix is an instance that does not sleep.");
await ping();
setInterval(ping, EVERY);
