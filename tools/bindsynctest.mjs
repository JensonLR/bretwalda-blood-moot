#!/usr/bin/env node
// BINDSYNC — the feature, end to end, in two browsers against a real database.
//
//   Context A: remap Forward off KeyW onto KeyT through the settings screen,
//              then read the four recovery words off the profile screen.
//   Context B: a browser that has never seen that profile, with its own
//              localStorage. Type the four words, walk into a fight, and press
//              the remapped key. Then remap again FROM INSIDE THE FIGHT and
//              grade every press on the wire.
//   Context C: a remap made before the column existed is carried up.
//   Context D: a Mac. Names on the caps, and a legacy Ctrl-crouch healing.
//
// ---------------------------------------------------------------------------
// WHAT THIS TEST USED TO MEASURE, AND WHY THAT WAS THE WRONG QUANTITY
// ---------------------------------------------------------------------------
//
// It was 8/8 for months while the owner's custom binds did not work, because
// every one of those eight checks graded the ROUND TRIP TO THE DATABASE: the
// row holds KeyT, the second device's localStorage holds KeyT, and one press of
// KeyT moves the man. Three things were never asked:
//
//   1. Is a SECOND key added to an action honoured, or only the first? The only
//      remap the test ever made REPLACED slot 0, so a table that read
//      `bindings[action][0]` and ignored the rest would have passed all eight.
//   2. Does a remap made without a page reload reach the sampler? Context B
//      navigates between the remap and the fight, so the live table was never
//      asked to change under a running game.
//   3. Does an action that is not movement arrive? Crouch is a flag on the wire
//      and nothing here had ever looked at one.
//
// So the sections below grade the WIRE — the same way `playtest` does, by
// tapping the game socket from inside the page and reading what the server was
// actually told — rather than the row. `holdAndMeasure` is the instrument, and
// every behavioural claim is made in terms of what came out of it.
import { chromium } from "playwright";
import { launchOptions, watchBoot } from "./lib/browser.mjs";
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

/**
 * `--no-fight` skips the two sections that have to muster an arena.
 *
 * NOT a way to run to green: the summary line says so loudly, so a run with it
 * cannot be quoted as a passing gate, and the merge gate never uses it. It
 * exists because this box CPU-rasterises every frame and an arena costs
 * minutes, while proving that one of the table-level assertions bites against
 * a deliberately broken build needs no fight at all.
 */
const NO_FIGHT = process.argv.includes("--no-fight");

const PROBE = () => {
  const w = window;
  w.__probe = { sent: [], lastState: null, states: 0 };
  const RealWS = window.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (String(url).includes("/ws")) {
      // THE WIRE. Every input message the client sends, recorded before it
      // leaves — this is what "the server was told" means, and it is the only
      // thing that can tell "the key is not bound" from "the key is bound and
      // the man could not walk because a bot was standing on him".
      const send = ws.send.bind(ws);
      ws.send = (data) => {
        try {
          const m = JSON.parse(data);
          if (m.type === "input") w.__probe.sent.push(m.data);
        } catch { /* ignore */ }
        return send(data);
      };
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

/**
 * Hold one physical key and report BOTH what the client sent and how far the
 * server moved the man.
 *
 * Two numbers rather than one, because they fail differently and the pair is
 * what makes a verdict readable. `wire.moving` is the client's answer to "is
 * this key bound to movement" and cannot be confounded by the simulation — a
 * warrior pinned against the arena wall travels nothing with a perfectly good
 * binding. `dist` is the server's answer and is what the owner actually sees.
 * A claim about a binding asserts on the wire; a claim about the man asserts on
 * both.
 */
async function holdAndMeasure(page, key, ms = 1200) {
  await awaitAlive(page);
  await page.evaluate(() => { window.__probe.sent.length = 0; });
  const before = await me(page);
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  const wire = await page.evaluate(() => {
    const s = window.__probe.sent;
    return {
      n: s.length,
      moving: s.filter((d) => Math.hypot(d.moveX, d.moveZ) > 0.01).length,
      crouching: s.filter((d) => d.crouch).length,
      sprinting: s.filter((d) => d.sprint).length,
    };
  });
  await page.keyboard.up(key);
  const after = await me(page, before.seq);
  return {
    wire,
    dist: Math.hypot(after.x - before.x, after.z - before.z),
    /** Share of samples that carried the intent. A held key should be nearly
     *  all of them; a stray frame either side of the press is not a failure. */
    share: (f) => (wire.n ? wire[f] / wire.n : 0),
  };
}

/** Open the bindings panel from inside the fight. Pointer lock has to go first
 *  — a locked canvas is handed every mouse event in the document, so the KEYS
 *  button is not clickable until the player presses Escape. */
/**
 * The testgrounds keep one AI at minimum and he kills a man who stands still
 * remapping keys; solo respawns every five seconds. Both the panel button (the
 * deathcam hides the HUD) and a travel measurement need him on his feet, so
 * every step that touches him waits for that first. Read as 4/8 twice on 2 Sep
 * 2026 with "74/74 samples carried movement, travelled 0.00 units" — the wire
 * was right and the man was dead.
 */
async function awaitAlive(page, ms = 20000) {
  await page.waitForFunction(() => {
    const s = window.__probe?.lastState;
    const mine = s && Object.values(s.players).find((p) => !String(p.id).startsWith("bot_"));
    return !!mine && mine.state !== "dead" && mine.health > 0;
  }, null, { timeout: ms });
  await page.waitForTimeout(300);
}

async function openKeysInFight(page) {
  await awaitAlive(page);
  // The first-moot tuition card raises itself over the fight after a spell of
  // training and swallows every click under its backdrop — read as
  // "locator.click: Timeout" on the Key bindings button, 2 Sep 2026. This
  // harness is not the moot; it declines.
  const decline = page.getByText("I know the fight", { exact: false }).first();
  if (await decline.isVisible().catch(() => false)) { await decline.click(); await page.waitForTimeout(400); }
  await page.evaluate(() => document.exitPointerLock?.());
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Key bindings" }).first().click({ timeout: 20000 });
  await page.getByText("KEY BINDINGS", { exact: false }).first().waitFor({ timeout: 10000 });
}

/** Press a key into the panel's capture state for one action's `slot`, or for a
 *  NEW alternate when `slot` is omitted — the `+` button. */
async function bindInPanel(page, action, code, slot) {
  await page.getByLabel(slot === undefined ? `Add another key for ${action}` : `Change ${action} key ${slot}`).click();
  await page.getByText("PRESS A KEY").waitFor({ timeout: 10000 });
  await page.keyboard.press(code);
  await page.waitForTimeout(250);
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

/** Module-level so the failure path can close it: a suite that throws with its browser open never exits, and that read as "hung" twice on 2 Sep 2026. */
let browser = null;
async function main() {
  if (!DB) throw new Error("PROFILE_TEST_DB is required — this test is about the database path");
  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  server = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development", DATABASE_URL: DB },
    stdio: ["ignore", "pipe", "pipe"],
  });
  watchBoot(server, "bindsynctest");
  server.stderr.on("data", (d) => process.env.VERBOSE && process.stderr.write(`[srv] ${d}`));
  await waitForServer();

  browser = await chromium.launch({
    headless: true,
    ...launchOptions(),
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
  if (!NO_FIGHT) {
  await b.getByText("Back", { exact: false }).first().click().catch(() => {});
  await b.goto(`${BASE}/?quality=low`, { waitUntil: "domcontentloaded" });
  await reachFight(b);
  const canvas = b.locator("canvas");
  // `force`: Playwright's actionability wants the element "stable" across two
  // animation frames, and a fight canvas under screen shake never is — on a
  // workstation this click timed out at 30 s on both rasterisers and the
  // suite read 4/8 twice for a reason that was not the game (2 Sep 2026).
  await canvas.click({ position: { x: 640, y: 400 }, force: true });
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

  // ------------------------------------------------- context B, still fighting
  // THE PART THAT WAS MISSING, and the reason this file was 8/8 while the
  // owner's binds did not bind. Everything above remapped ONE action's FIRST
  // slot and then reloaded the page. Below: a key ADDED as an alternate, bound
  // from inside a running fight with no reload, and graded on the wire.
  await openKeysInFight(b);

  // Forward is on KeyT (context A's remap). Add KeyY ALONGSIDE it.
  await bindInPanel(b, "Forward", "KeyY");
  const fwdCaps = (await b.getByLabel(/^Change Forward key/).allTextContents()).map((s) => s.trim());
  check("the screen shows both keys after the second one is added",
    fwdCaps.length >= 2 && fwdCaps.includes("T") && fwdCaps.includes("Y"), JSON.stringify(fwdCaps));

  // Crouch, on a key of its own. Not movement — a flag on the wire — and the
  // action the Mac fault was about, so it is the one worth proving arrives.
  await bindInPanel(b, "Crouch", "KeyB", 1);
  await b.getByLabel("Close key bindings").click();
  await b.waitForTimeout(250);
  await canvas.click({ position: { x: 640, y: 400 }, force: true });
  await b.waitForTimeout(400);

  // THE SECOND KEY. A table read as `bindings[action][0]` passes every check
  // above and fails this one.
  const added = await holdAndMeasure(b, "KeyY");
  check("a key ADDED as a second binding moves the warrior, with no reload",
    added.share("moving") > 0.8 && added.dist > 3.0,
    `KeyY: ${added.wire.moving}/${added.wire.n} samples carried movement, travelled ${added.dist.toFixed(2)} units`);

  await b.waitForTimeout(400);
  const kept = await holdAndMeasure(b, "KeyT");
  check("and the key it was added alongside still does",
    kept.share("moving") > 0.8 && kept.dist > 3.0,
    `KeyT: ${kept.wire.moving}/${kept.wire.n} samples carried movement, travelled ${kept.dist.toFixed(2)} units`);

  await b.waitForTimeout(400);
  const crouched = await holdAndMeasure(b, "KeyB", 900);
  check("a rebound crouch reaches the server as crouch",
    crouched.share("crouching") > 0.8,
    `KeyB: ${crouched.wire.crouching}/${crouched.wire.n} samples carried crouch`);

  // And an unbinding, taken through the same screen, has to stop reaching it.
  await openKeysInFight(b);
  await b.getByLabel("Unbind Y from Forward").click();
  await b.waitForTimeout(250);
  await b.getByLabel("Close key bindings").click();
  await canvas.click({ position: { x: 640, y: 400 }, force: true });
  await b.waitForTimeout(400);
  const dropped = await holdAndMeasure(b, "KeyY");
  check("a key unbound mid-fight stops reaching the server at all",
    dropped.wire.moving === 0 && dropped.dist < 0.4,
    `KeyY: ${dropped.wire.moving}/${dropped.wire.n} samples carried movement, travelled ${dropped.dist.toFixed(2)} units`);
  }

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

  // ---------------------------------------------------------------- context D
  // THE RACE. This is the fault the owner reported, and it is not in the table:
  // the landing screen is live the moment it paints and the sign-in POST runs
  // behind it, so a remap made in that window used to be hydrated straight over
  // by the profile row. On the live free-tier dyno the window is a cold start,
  // which is why "adding additional custom keys" looked like it never worked.
  //
  // HELD OPEN, NOT DELAYED. The first version of this section slept the request
  // for eight seconds and rebound inside that window — and it PASSED against a
  // build with the guard removed, because under load the panel took longer to
  // open than the sleep and the sign-in had already landed before the key was
  // pressed. An assertion that can quietly fail to reproduce the fault is the
  // fourth instrument in this project to measure the wrong quantity, so the
  // request is now pinned until this file lets it go, and the number of
  // outstanding requests is asserted at the moment of the remap.
  const ctxD = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctxD.addInitScript(PROBE);
  const d = await ctxD.newPage();
  d.on("pageerror", (e) => console.log(`[D page-error] ${e}`));
  await d.goto(`${BASE}/?quality=low`, { waitUntil: "domcontentloaded" });
  await d.waitForFunction(() => {
    try { return !!JSON.parse(localStorage.getItem("bretwalda_link") || "null")?.id; } catch { return false; }
  }, null, { timeout: 30000 });
  // Give this profile a table on the roll, so the boot has something to hydrate.
  await d.getByText("Keys", { exact: false }).first().click();
  await bindInPanel(d, "Forward", "KeyT", 1);
  await d.getByLabel("Close key bindings").click();
  await d.waitForTimeout(1800);

  let releaseSignIn;
  const signInHeld = new Promise((r) => { releaseSignIn = r; });
  let outstanding = 0;
  await ctxD.route("**/api/profile/me", async (route) => {
    outstanding++;
    await signInHeld;
    outstanding--;
    await route.continue();
  });
  await d.goto(`${BASE}/?quality=low`, { waitUntil: "domcontentloaded" });
  await d.getByText("Saga", { exact: false }).first().waitFor({ timeout: 30000 });
  await d.getByText("Keys", { exact: false }).first().click();
  await bindInPanel(d, "Forward", "KeyY");
  const duringCaps = (await d.getByLabel(/^Change Forward key/).allTextContents()).map((s) => s.trim());
  // Both halves, in one check: the key was taken, AND the sign-in genuinely had
  // not answered when it was. Without the second half this passes by not
  // reproducing the race, which is exactly how it fooled me once already.
  check("the screen takes a remap made while the sign-in is still in flight",
    duringCaps.includes("Y") && outstanding > 0,
    `${JSON.stringify(duringCaps)}, ${outstanding} sign-in request(s) still held`);
  // Let the held request land, then look again. This is the whole bug.
  releaseSignIn();
  await d.waitForTimeout(4000);
  const afterCaps = (await d.getByLabel(/^Change Forward key/).allTextContents()).map((s) => s.trim());
  check("and the sign-in does not overwrite it when the profile answers",
    afterCaps.includes("Y"), JSON.stringify(afterCaps));
  const localD = await d.evaluate(() => JSON.parse(localStorage.getItem("bretwalda.bindings")));
  check("the live table the sampler reads still holds it",
    (localD?.forward ?? []).includes("KeyY"), JSON.stringify(localD?.forward));
  // NOT ASSERTED HERE: that the recovered table also reaches the roll.
  //
  // It is asserted in context A, on a sign-in that answered normally, and it
  // cannot honestly be asserted in THIS section. `post()` in profileLink gives
  // the sign-in nine seconds and then falls back to local mode — which is the
  // documented behaviour with no reachable database, and the whole point of the
  // fallback. Holding the request open long enough to make the remap inside it
  // can therefore trip that timeout on a loaded box, after which the client is
  // legitimately running device-only and never uploads anything. An assertion
  // that fails for that reason is measuring the sign-in timeout and calling it
  // a binding fault, which is the exact mistake this file was rewritten to stop.
  //
  // What this section is for is the erasure, and that is what the three checks
  // above measure: the cap took the key, a sign-in was genuinely outstanding
  // when it did, and the profile answering afterwards did not take it away.

// ---------------------------------------------------------------- context E
  // THE RULE, and the Mac. Asked of the SHIPPED module through the readback
  // `bindings.ts` hangs on the window, not of a second copy of the list kept
  // here — a harness that carries its own idea of the defaults can agree with
  // itself while the game disagrees, which is how three instruments in this
  // project came to measure the wrong quantity.
  const ctxE = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    // A MacBook, as far as the page is concerned.
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  });
  // A table written before the rule existed: crouch on Ctrl, which is what
  // every device that has ever remapped anything is carrying today.
  await ctxE.addInitScript(() => {
    window.localStorage.setItem("bretwalda.bindings", JSON.stringify({
      forward: ["KeyW", "ArrowUp"], back: ["KeyS", "ArrowDown"],
      left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"],
      sprint: ["ShiftLeft", "ShiftRight"], dodge: ["Space"],
      crouch: ["ControlLeft", "ControlRight"],
      attack: ["Mouse0"], heavy: ["KeyE", "KeyV"], block: ["Mouse2"], ability: ["KeyQ"],
    }));
  });
  const e = await ctxE.newPage();
  e.on("pageerror", (ex) => console.log(`[E page-error] ${ex}`));
  await e.goto(`${BASE}/?quality=low`, { waitUntil: "domcontentloaded" });
  await e.getByText("Saga", { exact: false }).first().waitFor({ timeout: 30000 });
  // The screen has to have been drawn once for the layout/platform resolve to
  // have run; opening the panel is how a player gets there anyway.
  await e.getByText("Keys", { exact: false }).first().click();
  await e.getByText("KEY BINDINGS", { exact: false }).first().waitFor({ timeout: 10000 });

  const rule = await e.evaluate(() => {
    const b = window.__bretwaldaBinds;
    return {
      violations: b.ruleViolations,
      defaults: b.defaults,
      table: structuredClone(b.table),
      ctrl: b.why("ControlLeft"),
      alt: b.why("AltLeft"),
      meta: b.why("MetaLeft"),
      ctrlLabel: b.label("ControlLeft"),
      altLabel: b.label("AltLeft"),
    };
  });
  check("no shipped default is a platform modifier or a browser key",
    rule.violations.length === 0, rule.violations.join(" | ") || "clean");
  check("crouch no longer ships on Ctrl",
    !rule.defaults.crouch.includes("ControlLeft") && rule.defaults.crouch.length > 0,
    JSON.stringify(rule.defaults.crouch));
  check("the screen refuses Ctrl, Alt and Cmd with a reason",
    !!rule.ctrl && !!rule.alt && !!rule.meta, rule.ctrl || "Ctrl was accepted");
  check("a table stored with Ctrl-crouch heals into a crouch key that can fire",
    rule.table.crouch.length > 0 && !rule.table.crouch.some((c) => /^(Control|Alt|Meta|OS)(Left|Right)$/.test(c)),
    JSON.stringify(rule.table.crouch));
  check("a Mac is shown Mac key names, not L Ctrl",
    rule.ctrlLabel.includes("⌃") && rule.altLabel.includes("⌥"),
    `${rule.ctrlLabel} / ${rule.altLabel}`);

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  console.log(`\n[bindsync] ${results.length - failed.length}/${results.length} checks passing`
    + (NO_FIGHT ? " — PARTIAL RUN, --no-fight skipped every assertion that presses a key in an arena. NOT a gate." : ""));
  process.exitCode = failed.length ? 1 : 0;
}

main()
  .catch((e) => { console.error("[bindsync] failed:", e); process.exitCode = 1; })
  .finally(async () => {
    if (browser) await browser.close().catch(() => {});
    if (server && !server.killed) server.kill("SIGKILL");
  });
