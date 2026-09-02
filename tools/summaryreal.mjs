#!/usr/bin/env node
// The summary stage as a PLAYER gets it — a real duel, driven through the
// shipped page, photographed at the end of the camera's push.
//
// This exists because `/shot?preset=summaryduel` is not evidence. The preset
// hands the stage a corpse at (-5.9, 6.4); a real duel decides that anchor at
// runtime, and the stage aims its lens off it. The staged frame and the real
// frame therefore photograph two different compositions of the same code, and
// a review that only sees the staged one has reviewed nothing. Reported
// diagnostics come from `window.__summaryStage`, which render/summary.ts
// publishes when it builds — so the frame can be argued about with the aim it
// was actually taken with.
//
//   node tools/summaryreal.mjs --death fire  --tag before
//   node tools/summaryreal.mjs --death range --tag before
//   node tools/summaryreal.mjs --shape ffa  --tag podium
//   node tools/summaryreal.mjs --shape team --tag podium
//
// `fire` kills the opponent standing in the hearth (the corpse lies at the
// bonfire — the shove-into-the-fire kill the game is designed around).
// `range` burns him low, walks him clear and lets the afterburn take him out
// on open ground. Both are genuine matches; nothing here poses anybody.
//
// `--shape` picks the SIZE of moot, which is what the podium rule keys off:
//   duel  two men — one stands, one lies (the shape that already shipped).
//   ffa   an eight-man BLOOD MOOT: the phone player and six wire men, plus one
//         real AI who does the killing that fire does not. The phone player is
//         killed by it on purpose — a summary where the local man is a CORPSE
//         is the case the emote row has to get right, and it cannot be staged
//         from the winner's seat.
//   team  a 2v2 WAR BAND: the blue side walks into the fire, so the whole red
//         side stands and the whole blue side lies.
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";
import { spawn } from "child_process";
import { mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { raiseMoot, driveIntoTheFire } from "./summarymoot.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};

const PORT = parseInt(process.env.PORT || String(4020 + (process.pid % 40)), 10);
const DEATH = arg("death", "fire");
const SHAPE = arg("shape", "duel");
const TAG = arg("tag", "now");
const OUT = arg("out", "art/shots/real");
// Wall-clock seconds to hold before the shutter. The push is eight seconds of
// RENDERED time and this box renders the summary at about three frames a
// second, so eleven seconds of waiting photographs a camera a quarter of the
// way through its move. A phone runs it in eight; a settled frame here costs
// two minutes.
const SETTLE = parseInt(arg("settle", "11"), 10) * 1000;
// Default low, as the other flow harnesses run: a software rasteriser at a
// higher tier spends the whole capture budget on one frame. Pass --quality auto
// to review what a device that can afford shadows is given.
const QUALITY = arg("quality", "low");
const SHOTS = [
  { name: "phone", width: 390, height: 844, mobile: true },
  { name: "desktop", width: 1280, height: 720, mobile: false },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server;
let browser = null;

function waitForServer(url, timeoutMs = 180000) {
  const started = Date.now();
  return new Promise((ok, fail) => {
    const poll = async () => {
      try { const r = await fetch(url); if (r.ok || r.status === 404) return ok(); } catch { }
      if (Date.now() - started > timeoutMs) return fail(new Error("server never came up"));
      setTimeout(poll, 700);
    };
    poll();
  });
}

const PROBE = () => {
  const w = window;
  w.__probe = { joinData: null, latest: null, matchEnd: null, playerId: null };
  const RealWS = window.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (String(url).includes("/ws")) {
      ws.addEventListener("message", (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === "join") { w.__probe.joinData = m.data; w.__probe.playerId = m.data.playerId; }
          if (m.data && m.data.players) w.__probe.latest = m.data;
          if (m.type === "match_end") w.__probe.matchEnd = m.data;
        } catch { }
      });
    }
    return ws;
  }
  TappedWS.prototype = RealWS.prototype;
  Object.assign(TappedWS, RealWS);
  w.WebSocket = TappedWS;
};

async function until(cond, what, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(120);
  }
}

async function oneShot(shot) {
  const ctx = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    hasTouch: shot.mobile, isMobile: shot.mobile,
    ...(shot.mobile ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" } : {}),
  });
  await ctx.addInitScript(PROBE);
  await ctx.addInitScript(() => {
    try { window.localStorage.setItem("bretwalda_name", "Prober"); } catch { }
    window.__summaryDiag = true;
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[pageerror] ${e}`));
  await page.goto(`http://127.0.0.1:${PORT}/?quality=${QUALITY}`, { waitUntil: "domcontentloaded" });

  const { wires } = await raiseMoot(page, SHAPE, { port: PORT, until, sleep });
  await sleep(2500);

  // ---- kill them for real ----
  let corpse = { x: 0, z: 0 };
  let drive;
  if (SHAPE === "duel") {
    const B = wires[0];
    let fleeing = false;
    let flee = { x: 1, z: 0 };
    drive = setInterval(() => {
      const me = B.me();
      if (!me || me.state === "dead") return;
      const d = Math.hypot(me.position.x, me.position.z) || 1;
      // Out of the fire with less afterburn left than health is survivable
      // (BURN_DPS_AFTER 4 over BURN_LINGER 3.0 = 12 damage), so he goes back in
      // and tries again rather than standing about cured.
      if (fleeing && me.health > 0 && !me.burning) { fleeing = false; }
      if (DEATH === "range" && !fleeing && me.health <= 12 && d < 2.2) {
        fleeing = true;
        // Out along the way he came in, which is open ground: the arena's props
        // ring the edge and a corpse inside one is a different bug.
        flee = { x: me.position.x / d, z: me.position.z / d };
      }
      if (fleeing) { B.move(flee.x, flee.z); return; }
      if (d < 1.15) return;               // stood in the hearth, burning
      B.move(-me.position.x / d, -me.position.z / d);
    }, 50);
    await until(() => B.me()?.state === "dead", "the fire to take him", 45000);
    corpse = B.me().position;
  } else {
    // Everyone the shape dooms walks into the hearth; the AI settle the rest.
    // The war band has no wire men at all — it is the phone player and three
    // AI, and he is meant to lose it.
    const doomed = wires;
    console.log(`[real]   doomed ${doomed.length} of ${wires.length} wire men`);
    drive = driveIntoTheFire(doomed);
    await until(() => page.evaluate(() => window.__probe?.matchEnd || null),
      "the match to end", 150000);
  }
  clearInterval(drive);
  const corpseR = Math.hypot(corpse.x, corpse.z);

  await until(() => page.evaluate(() => window.__probe?.matchEnd || null), "the verdict", 12000);
  // The push is `seconds: 8` of eased travel and the FRAME IS THE END OF IT —
  // a shot taken two seconds in photographs the camera still moving, which is
  // how a composition nobody wanted got signed off.
  await sleep(SETTLE);
  mkdirSync(resolve(ROOT, OUT), { recursive: true });
  const stem = SHAPE === "duel" ? DEATH : SHAPE;
  const path = `${OUT}/summary-${stem}-${shot.name}-${TAG}.png`;
  await page.screenshot({ path });
  const overlayUp = await page.getByText("BATTLE COMPLETE", { exact: false }).first().isVisible().catch(() => false);
  const bodies = await page.evaluate(() => ({ cam: window.__summaryCam, men: window.__summaryBodies }));
  // The same frame with the DOM overlay taken off it. The overlay is good and
  // is not what is being reviewed here; what is being reviewed is the picture
  // under it, and half of that picture is behind a ledger band.
  await page.evaluate(() => {
    const cv = document.querySelector("canvas");
    if (!cv) return;
    document.querySelectorAll("body *").forEach((el) => {
      if (el !== cv && !el.contains(cv)) el.style.visibility = "hidden";
    });
  });
  await sleep(600);
  await page.screenshot({ path: `${OUT}/summary-${stem}-${shot.name}-${TAG}-clean.png` });
  const diag = await page.evaluate(() => window.__summaryStage ?? null);
  console.log(`[real] ${shot.name}: ${path}`);
  console.log(`[real]   shape=${SHAPE} death=${DEATH} fell=(${corpse.x.toFixed(2)}, ${corpse.z.toFixed(2)}) r=${corpseR.toFixed(2)}m overlay=${overlayUp}`);
  console.log(`[real]   stage=${JSON.stringify(diag)}`);
  // WHERE EVERY MAN LANDED ON THE GLASS, against the band of it the DOM left
  // free. `ndc` is his whole bounding box projected — a body below `band[0]`
  // is behind the ledger panel, however correct his world position is.
  const band = diag?.band ?? null;
  for (const m of bodies.men ?? []) {
    const under = band && m.ndc ? m.ndc[1] < band[0] - 0.02 : false;
    const off = m.ndc ? (m.ndc[0] < -1 || m.ndc[2] > 1) : false;
    console.log(`[real]   ${m.standing ? "STANDS" : "dead  "} ${m.id.slice(0, 6)} `
      + `at=[${(m.at ?? []).map((v) => v.toFixed(2)).join(",")}] box=[${m.lo},${m.hi}] `
      + `foot=[${m.foot}] head=[${m.head}] `
      + `ndc=[${(m.ndc ?? []).join(", ")}]${under ? "  ** UNDER THE LEDGER **" : ""}`
      + `${off ? "  ** CROPPED SIDEWAYS **" : ""}`);
  }
  console.log(`[real]   cam=${JSON.stringify(bodies.cam)}`);
  await ctx.close();
  return { corpseR, diag };
}

async function main() {
  server = spawn("node", ["custom-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  watchBoot(server, "summaryreal");
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);
  browser = await chromium.launch({
    headless: true,
    ...launchOptions(),
  });
  const only = arg("only", null);
  for (const shot of SHOTS) {
    if (only && shot.name !== only) continue;
    await oneShot(shot);
  }
  await browser.close();
  console.log(`[real] done — shape=${SHAPE} death=${DEATH} tag=${TAG}`);
}

main()
  .catch((e) => { console.error("[real] failed:", e); process.exitCode = 1; })
  .finally(async () => { try { await browser?.close(); } catch { } server?.kill(); setTimeout(() => process.exit(), 3000).unref(); });
