#!/usr/bin/env node
// BINDSYNC — the feature, end to end, in two browsers against a real database.
//
//   Context A: remap Forward off KeyW onto KeyT through the settings screen,
//              then read the four recovery words off the profile screen.
//   Context B: a browser that has never seen that profile, with its own
//              localStorage. Type the four words, walk into a fight, and press
//              the remapped key.
//
// Storing a blob proves nothing; this asserts the warrior moves.
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = parseInt(process.env.PORT || "3912", 10);
const DB = process.env.PROFILE_TEST_DB;
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const PROBE = () => {
  const w = window;
  w.__probe = { sent: [], lastState: null, states: 0 };
  const RealWS = window.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (String(url).includes("/ws")) {
      ws.addEventListener("message", (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === "game_state" || m.type === "countdown") { w.__probe.states++; w.__probe.lastState = m.data; }
        } catch { /* ignore */ }
      });
    }
    return ws;
  }
  TappedWS.prototype = RealWS.prototype;
  Object.assign(TappedWS, RealWS);
  w.WebSocket = TappedWS;
};

let server;
async function waitForServer() {
  const started = Date.now();
  for (;;) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch { /* wait */ }
    if (Date.now() - started > 120000) throw new Error("server never came up");
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function reachFight(page) {
  await page.getByText("Training", { exact: false }).first().click();
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
  const fewer = page.getByLabel("Fewer AI warriors");
  for (let i = 0; i < 8 && await fewer.isEnabled().catch(() => false); i++) await fewer.click();
  await page.getByText("DRAW STEEL", { exact: false }).first().click();
  await page.waitForFunction(() => window.__probe?.lastState?.state === "fighting", null, { timeout: 90000 });
}

const me = (page, afterSeq = -1) => page.evaluate(async (seq) => {
  const deadline = performance.now() + 15000;
  while (window.__probe.states <= seq && performance.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
  const s = window.__probe.lastState;
  if (!s) return null;
  const mine = Object.values(s.players).find((p) => !String(p.id).startsWith("bot_"));
  return mine && { x: mine.position.x, z: mine.position.z, seq: window.__probe.states };
}, afterSeq);

async function main() {
  if (!DB) throw new Error("PROFILE_TEST_DB is required — this test is about the database path");
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  server = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development", DATABASE_URL: DB },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer();

  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });

  // ---------------------------------------------------------------- context A
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctxA.addInitScript(PROBE);
  const a = await ctxA.newPage();
  a.on("pageerror", (e) => console.log(`[A page-error] ${e}`));
  await a.goto(`${BASE}/?quality=low`, { waitUntil: "domcontentloaded" });
  await a.getByText("Saga", { exact: false }).first().waitFor({ timeout: 30000 });
  // The sign-in runs behind the landing screen; the four words only exist once
  // it has answered.
  await a.waitForFunction(() => {
    try { return !!JSON.parse(localStorage.getItem("bretwalda_link") || "null")?.id; } catch { return false; }
  }, null, { timeout: 30000 });

  // Remap through the real settings screen: Keys -> Forward's first cap -> T.
  await a.getByText("Keys", { exact: false }).first().click();
  await a.getByLabel("Change Forward key 1").click();
  await a.getByText("PRESS A KEY").waitFor({ timeout: 10000 });
  await a.keyboard.press("KeyT");
  await a.getByLabel("Change Forward key 1").waitFor({ timeout: 10000 });
  const capA = await a.getByLabel("Change Forward key 1").textContent();
  check("the settings screen shows Forward on T", (capA || "").trim() === "T", `cap reads "${capA}"`);
  await a.getByLabel("Close key bindings").click();

  // Give the fire-and-forget POST a moment, then read the row as the server has it.
  await a.waitForTimeout(1500);
  const creds = await a.evaluate(() => JSON.parse(localStorage.getItem("bretwalda_link")));
  const meRow = await (await fetch(`${BASE}/api/profile/me`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(creds),
  })).json();
  check("the remap reached the roll", meRow?.profile?.bindings?.forward?.[0] === "KeyT",
    JSON.stringify(meRow?.profile?.bindings?.forward));

  // The four words, read off the profile screen the way a player reads them.
  await a.getByText("Saga", { exact: false }).first().click();
  await a.locator(".warcode-frame").first().waitFor({ timeout: 15000 });
  const words = (await a.locator(".warcode-frame .font-display").allTextContents())
    .map((w) => w.trim().toLowerCase()).filter(Boolean).join(" ");
  check("the profile screen shows four words", /^[a-z]+( [a-z]+){3}$/.test(words), words);

  // ---------------------------------------------------------------- context B
  // A different browser context: its own localStorage, its own profile, the
  // shipped bindings. Nothing of A's remap is on this device.
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctxB.addInitScript(PROBE);
  const b = await ctxB.newPage();
  b.on("pageerror", (e) => console.log(`[B page-error] ${e}`));
  await b.goto(`${BASE}/?quality=low`, { waitUntil: "domcontentloaded" });
  await b.getByText("Saga", { exact: false }).first().click();
  await b.getByText("I HAVE FOUR WORDS").click();
  await b.locator("input[placeholder='leaf sapling wolf glass']").fill(words);
  await b.getByText("BRING IT BACK").click();
  await b.getByText("Your saga is restored.", { exact: false }).waitFor({ timeout: 30000 });
  const capB = await b.evaluate(() => JSON.parse(localStorage.getItem("bretwalda.bindings")));
  check("the recovered device took the remapped table", capB?.forward?.[0] === "KeyT",
    JSON.stringify(capB?.forward));

  // The whole point: does the remapped key move the warrior on THIS device?
  await b.getByText("Back", { exact: false }).first().click().catch(() => {});
  await b.goto(`${BASE}/?quality=low`, { waitUntil: "domcontentloaded" });
  await reachFight(b);
  const canvas = b.locator("canvas");
  await canvas.click({ position: { x: 640, y: 400 } });
  await b.waitForTimeout(400);

  const before = await me(b);
  await b.keyboard.down("KeyT");
  await b.waitForTimeout(1200);
  const after = await me(b, before.seq);
  await b.keyboard.up("KeyT");
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  check("the remapped key moves the warrior on the second device", moved > 3.0,
    `KeyT travelled ${moved.toFixed(2)} units`);

  await b.waitForTimeout(400);
  const b2 = await me(b);
  await b.keyboard.down("KeyW");
  await b.waitForTimeout(1200);
  const a2 = await me(b, b2.seq);
  await b.keyboard.up("KeyW");
  const old = Math.hypot(a2.x - b2.x, a2.z - b2.z);
  check("and the old key does not, on the second device", old < 0.4,
    `KeyW travelled ${old.toFixed(2)} units`);

  // ---------------------------------------------------------------- context C
  // A player who remapped BEFORE any of this shipped: his table is in
  // localStorage and there is none on the roll. First sign-in must carry it up,
  // not hand him the defaults back.
  const ctxC = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctxC.addInitScript(PROBE);
  await ctxC.addInitScript(() => {
    window.localStorage.setItem("bretwalda.bindings", JSON.stringify({
      forward: ["KeyG"], back: ["KeyS"], left: ["KeyA"], right: ["KeyD"],
      sprint: ["ShiftLeft"], dodge: ["Space"], crouch: ["ControlLeft"],
      attack: ["Mouse0"], heavy: ["KeyE"], block: ["Mouse2"], ability: ["KeyQ"],
    }));
  });
  const c = await ctxC.newPage();
  await c.goto(`${BASE}/?quality=low`, { waitUntil: "domcontentloaded" });
  await c.waitForFunction(() => {
    try { return !!JSON.parse(localStorage.getItem("bretwalda_link") || "null")?.id; } catch { return false; }
  }, null, { timeout: 30000 });
  await c.waitForTimeout(2000);
  const credsC = await c.evaluate(() => JSON.parse(localStorage.getItem("bretwalda_link")));
  const rowC = await (await fetch(`${BASE}/api/profile/me`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(credsC),
  })).json();
  check("a remap made before the column existed is carried up at first sign-in",
    rowC?.profile?.bindings?.forward?.[0] === "KeyG", JSON.stringify(rowC?.profile?.bindings?.forward));
  const localC = await c.evaluate(() => JSON.parse(localStorage.getItem("bretwalda.bindings")));
  check("and it was not overwritten with defaults on the device",
    localC?.forward?.[0] === "KeyG", JSON.stringify(localC?.forward));

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n[bindsync] ${results.length - failed.length}/${results.length} checks passing`);
  process.exitCode = failed.length ? 1 : 0;
}

main()
  .catch((e) => { console.error("[bindsync] failed:", e); process.exitCode = 1; })
  .finally(() => { if (server && !server.killed) server.kill("SIGKILL"); });
