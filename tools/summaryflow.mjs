#!/usr/bin/env node
// Real-flow probe: a real HONOUR DUEL through the shipped page at 390x844.
// Page A is the human on a phone; B is a wire-driven opponent who walks into
// the bonfire. Verifies: the summary overlay mounts over the live canvas, the
// verdict is legible, FIGHT AGAIN pressed EARLY parks through the ten-second
// rollback and lands the player ready in the lobby.
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PORT = parseInt(process.env.PORT || String(3960 + (process.pid % 30)), 10);
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "art/shots";
let server;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function until(cond, what, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(120);
  }
}

// A wire opponent: plain WebSocket, same protocol the page speaks.
function wireMan(name) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const s = { ws, playerId: null, latest: null, code: null, open: false };
  ws.addEventListener("open", () => { s.open = true; });
  ws.addEventListener("message", (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m.type === "join") { s.playerId = m.data.playerId; s.code = m.data.code; }
      if (m.data && m.data.players) s.latest = m.data;
    } catch { }
  });
  s.send = (type, data = {}) => ws.send(JSON.stringify({ type, data }));
  return s;
}

let browser = null;
async function main() {
  // Production build only: this drives the shipped page, and a dev server's
  // compile-on-first-visit would eat the ten-second window under test.
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
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  await ctx.addInitScript(PROBE);
  await ctx.addInitScript(() => {
    try { window.localStorage.setItem("bretwalda_name", "Prober"); } catch { }
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[pageerror] ${e}`));
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });

  // ---- raise the duel through the shipped UI ----
  await page.getByText("CREATE BATTLE", { exact: false }).first().click();
  await page.getByText("HONOUR DUEL", { exact: false }).first().click();
  // Best of ONE: a bo3 would need the opponent killed twice more, and the
  // summary under test only rises at the MATCH's end.
  await page.getByRole("button", { name: /^1\s*ROUND$/ }).click();
  await page.getByText("CREATE ROOM", { exact: false }).first().click();
  console.log("[flow] clicked CREATE ROOM");
  const code = await until(() => page.evaluate(() => window.__probe?.joinData?.code || null), "the war code", 60000);
  console.log(`[flow] room ${code}`);

  const B = wireMan("Doomed");
  await until(() => B.open, "the wire opponent's socket");
  B.send("join", { code, name: "Doomed" });
  await until(() => B.playerId, "the wire opponent to join");

  await page.getByText("START", { exact: true }).first().click();
  await until(() => page.evaluate(() => window.__probe?.latest?.state === "fighting"), "the fight", 30000);
  console.log("[flow] fighting");
  await sleep(2500);

  // ---- B walks into the bonfire and dies ----
  const walker = setInterval(() => {
    const me = B.latest?.players?.[B.playerId];
    if (!me || me.state === "dead") return;
    const d = Math.hypot(me.position.x, me.position.z);
    if (d < 1.15) return;
    B.send("input", {
      moveX: -me.position.x / d, moveZ: -me.position.z / d,
      rotationY: Math.atan2(-me.position.x, -me.position.z),
      sprint: true, attack: false, heavyAttack: false, block: false, dodge: false, shove: false, attackDir: "right",
    });
  }, 50);
  await until(() => B.latest?.players?.[B.playerId]?.state === "dead", "the fire to take him", 30000);
  clearInterval(walker);
  console.log("[flow] the opponent is dead");

  const verdict = await until(() => page.evaluate(() => window.__probe?.matchEnd || null), "the verdict", 10000);
  const myId = await page.evaluate(() => window.__probe?.playerId);
  check("the verdict names the phone player", verdict.winnerId === myId, `winner ${verdict.winnerName}`);

  // Let the stage build and the push start.
  await sleep(2000);
  const overlayUp = await page.getByText("BATTLE COMPLETE", { exact: false }).first().isVisible().catch(() => false);
  const fightAgainUp = await page.getByText("FIGHT AGAIN", { exact: false }).first().isVisible().catch(() => false);
  const canvasUp = await page.evaluate(() => !!document.querySelector("canvas"));
  check("the summary overlay stands over a live canvas", overlayUp && fightAgainUp && canvasUp,
    `verdict=${overlayUp}, FIGHT AGAIN=${fightAgainUp}, canvas=${canvasUp}`);

  // ---- FIGHT AGAIN pressed EARLY, before the rollback (screenshot comes
  // after: a SwiftShader screenshot costs seconds and last run it spent the
  // whole ten-second window, so the park branch was never exercised) ----
  const stateNow = await page.evaluate(() => window.__probe?.latest?.state);
  await page.getByText("FIGHT AGAIN", { exact: false }).first().click();
  const waitingShown = await page.getByText("MUSTERING", { exact: false }).first().isVisible().catch(() => false);
  check("pressed before the rollback, the intent parks", stateNow === "finished" && waitingShown,
    `pressed at state=${stateNow}, button shows MUSTERING`);
  await page.screenshot({ path: `${OUT}/summary-real-phone.png` });
  console.log(`[flow] wrote ${OUT}/summary-real-phone.png`);

  await until(() => page.evaluate(() => window.__probe?.latest?.state === "lobby"), "the rollback", 14000);
  await until(() => page.evaluate(() => {
    const p = window.__probe;
    return p?.latest?.players?.[p.playerId]?.ready === true;
  }), "the parked ready to stick", 6000);
  const onLobby = await page.getByText("READY — SKAL!", { exact: false }).first().isVisible().catch(() => false);
  check("the rollback lands him in the lobby with his ready lit", onLobby, "READY — SKAL! on screen; wire says ready=true");
  await page.screenshot({ path: `${OUT}/summary-real-lobby.png` });

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n[flow] ${passed}/${results.length} passed`);
  process.exitCode = passed === results.length ? 0 : 1;
}

main()
  .catch(async (e) => {
    console.error("[flow] failed:", e);
    process.exitCode = 1;
    try {
      const pages = browser?.contexts()?.flatMap((c) => c.pages()) ?? [];
      if (pages[0]) await pages[0].screenshot({ path: `${OUT}/summary-flow-failure.png` });
    } catch { }
  })
  .finally(async () => { try { await browser?.close(); } catch { } server?.kill(); setTimeout(() => process.exit(), 3000).unref(); });
