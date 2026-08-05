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
//
// `fire` kills the opponent standing in the hearth (the corpse lies at the
// bonfire — the shove-into-the-fire kill the game is designed around).
// `range` burns him low, walks him clear and lets the afterburn take him out
// on open ground. Both are genuine matches; nothing here poses anybody.
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};

const PORT = parseInt(process.env.PORT || String(4020 + (process.pid % 40)), 10);
const DEATH = arg("death", "fire");
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

function wireMan() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const s = { ws, playerId: null, latest: null, open: false };
  ws.addEventListener("open", () => { s.open = true; });
  ws.addEventListener("message", (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m.type === "join") { s.playerId = m.data.playerId; }
      if (m.data && m.data.players) s.latest = m.data;
    } catch { }
  });
  s.send = (type, data = {}) => ws.send(JSON.stringify({ type, data }));
  s.move = (dx, dz) => {
    const d = Math.hypot(dx, dz) || 1;
    s.send("input", {
      moveX: dx / d, moveZ: dz / d, rotationY: Math.atan2(dx / d, dz / d),
      sprint: true, attack: false, heavyAttack: false, block: false,
      dodge: false, shove: false, attackDir: "right",
    });
  };
  return s;
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

  await page.getByText("CREATE BATTLE", { exact: false }).first().click();
  await page.getByText("HONOUR DUEL", { exact: false }).first().click();
  await page.getByRole("button", { name: /^1\s*ROUND$/ }).click();
  await page.getByText("CREATE ROOM", { exact: false }).first().click();
  const code = await until(() => page.evaluate(() => window.__probe?.joinData?.code || null), "the war code", 60000);

  const B = wireMan();
  await until(() => B.open, "the wire opponent's socket");
  B.send("join", { code, name: "Doomed" });
  await until(() => B.playerId, "the wire opponent to join");
  await page.getByText("START", { exact: true }).first().click();
  await until(() => page.evaluate(() => window.__probe?.latest?.state === "fighting"), "the fight", 30000);
  await sleep(2500);

  // ---- kill him for real ----
  let fleeing = false;
  let flee = { x: 1, z: 0 };
  const drive = setInterval(() => {
    const me = B.latest?.players?.[B.playerId];
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
  await until(() => B.latest?.players?.[B.playerId]?.state === "dead", "the fire to take him", 45000);
  clearInterval(drive);
  const corpse = B.latest.players[B.playerId].position;
  const corpseR = Math.hypot(corpse.x, corpse.z);

  await until(() => page.evaluate(() => window.__probe?.matchEnd || null), "the verdict", 12000);
  // The push is `seconds: 8` of eased travel and the FRAME IS THE END OF IT —
  // a shot taken two seconds in photographs the camera still moving, which is
  // how a composition nobody wanted got signed off.
  await sleep(SETTLE);
  mkdirSync(resolve(ROOT, OUT), { recursive: true });
  const path = `${OUT}/summary-${DEATH}-${shot.name}-${TAG}.png`;
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
  await page.screenshot({ path: `${OUT}/summary-${DEATH}-${shot.name}-${TAG}-clean.png` });
  const diag = await page.evaluate(() => window.__summaryStage ?? null);
  console.log(`[real] ${shot.name}: ${path}`);
  console.log(`[real]   death=${DEATH} fell=(${corpse.x.toFixed(2)}, ${corpse.z.toFixed(2)}) r=${corpseR.toFixed(2)}m overlay=${overlayUp}`);
  console.log(`[real]   stage=${JSON.stringify(diag)}`);
  console.log(`[real]   bodies=${JSON.stringify(bodies)}`);
  await ctx.close();
  return { corpseR, diag };
}

async function main() {
  server = spawn("node", ["custom-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);
  const preinstalled = "/opt/pw-browsers/chromium";
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  const only = arg("only", null);
  for (const shot of SHOTS) {
    if (only && shot.name !== only) continue;
    await oneShot(shot);
  }
  await browser.close();
  console.log(`[real] done — death=${DEATH} tag=${TAG}`);
}

main()
  .catch((e) => { console.error("[real] failed:", e); process.exitCode = 1; })
  .finally(async () => { try { await browser?.close(); } catch { } server?.kill(); setTimeout(() => process.exit(), 3000).unref(); });
