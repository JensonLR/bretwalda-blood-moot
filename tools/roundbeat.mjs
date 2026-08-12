#!/usr/bin/env node
/**
 * roundbeat — PHOTOGRAPHS THE END OF A ROUND, which nothing else does.
 *
 * `summaryflow` fights real matches and photographs the end of the MATCH. It
 * cannot see the end of a ROUND, and for a structural reason rather than an
 * oversight: `raiseMoot` sets every match to ONE round on purpose ("the summary
 * under test only rises at the MATCH's end"), so no harness in this repo has
 * ever drawn an intermission.
 *
 * That is the screen the owner reported: *"Emote option is in next round coming
 * screen where you can't actually really see any players or even emote & even if
 * you don't win the round you see it"*. PROCESS.md R5 — open the render — and
 * there was no render to open. So this raises a BEST-OF-THREE, burns the wire
 * men so the phone player takes round one, and captures both beats:
 *
 *   round-beat-1.png   the arena, unscrimmed, verdict on one line, and the
 *                      flourish offered because this player WON the round.
 *   round-beat-2.png   the break card that follows, with its countdown and no
 *                      emote row on it.
 *
 * Needs a production build (`npm run build`) — it drives `custom-server`, same
 * as summaryflow, and for the same reason: a dev server's compile-on-first-visit
 * eats the five-second break this is trying to photograph.
 *
 *   node tools/roundbeat.mjs [--out art/shots]
 */
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { wireMan, dress, driveIntoTheFire } from "./summarymoot.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = parseInt(process.env.PORT || String(3990 + (process.pid % 9)), 10);
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "art/shots";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(cond, what, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(100);
  }
}

const PROBE = () => {
  const w = window;
  w.__probe = { joinData: null, latest: null, playerId: null };
  const RealWS = window.WebSocket;
  function TappedWS(url, protocols) {
    const ws = protocols === undefined ? new RealWS(url) : new RealWS(url, protocols);
    if (String(url).includes("/ws")) {
      ws.addEventListener("message", (ev) => {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === "join") { w.__probe.joinData = m.data; w.__probe.playerId = m.data.playerId; }
          if (m.data && m.data.players) w.__probe.latest = m.data;
        } catch { }
      });
    }
    return ws;
  }
  TappedWS.prototype = RealWS.prototype;
  Object.assign(TappedWS, RealWS);
  w.WebSocket = TappedWS;
};

const server = spawn("node", ["custom-server.mjs"], {
  cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
await until(async () => {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); return r.ok || r.status === 404; } catch { return false; }
}, "the server", 180000);

const preinstalled = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
await ctx.addInitScript(PROBE);
await ctx.addInitScript(() => { try { window.localStorage.setItem("bretwalda_name", "Prober"); } catch { } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log(`[pageerror] ${e}`));
await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });

// A BEST OF THREE — the whole point. Three wire men and no AI, so the only
// thing that can kill anybody is the hearth, and the phone player therefore
// takes round one standing. That is what puts the flourish on his screen.
// FIVE rounds, not three, and the reason is the second capture below: a
// screenshot on this box's software rasteriser can cost SECONDS, so the shot of
// beat one can eat the whole five-second break it was taken during. The card is
// therefore checked in a LATER intermission, and a best-of-three that this
// player wins twice does not have one.
await page.getByText("CREATE BATTLE", { exact: false }).first().click();
await page.getByText("BLOOD MOOT", { exact: false }).first().click();
await page.getByRole("button", { name: /^5\s*ROUNDS$/ }).click();
await page.getByText("CREATE ROOM", { exact: false }).first().click();
const code = await until(() => page.evaluate(() => window.__probe?.joinData?.code || null), "the war code");

const wires = [];
for (let i = 0; i < 3; i++) {
  const w = wireMan(PORT, `Doomed${i + 1}`);
  await until(() => w.open, "a wire man's socket");
  w.send("join", { code, name: `Doomed${i + 1}` });
  await until(() => w.playerId, "a wire man to join");
  dress(w, i);
  wires.push(w);
}
await sleep(400);
await page.getByText("START", { exact: true }).first().click();
await until(() => page.evaluate(() => window.__probe?.latest?.state === "fighting"), "the fight");

// `innerText`, never `textContent`: this is a server-rendered React page and
// `textContent` hands back the whole Flight payload out of the inline scripts,
// which is how the first cut of this printed a screenful of `self.__next_f`.
const look = () => page.evaluate(() => ({
  // The break card's full-viewport scrim, and the ONLY thing that draws it.
  scrim: !!document.querySelector(".bg-black\\/55"),
  emotes: document.querySelectorAll('[aria-label^="Emote:"]').length,
  text: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120),
  state: window.__probe?.latest?.state ?? null,
}));

let drive = driveIntoTheFire(wires);
await until(() => page.evaluate(() => window.__probe?.latest?.state === "intermission"),
  "the first round to end", 180000);
clearInterval(drive);

// BEAT ONE. `ROUND_HOLD_MS` is 2200 in page.tsx; 900 ms in is comfortably
// inside it and past the fade. Read BEFORE the screenshot — the shot is the
// expensive call and anything measured after it is measured at an unknown time.
//
// `--at <ms>` moves the capture within the hold, because WHERE THE CAMERA IS
// changes across it: the rig eases out of the fight's third-person follow into
// the lobby orbit, so an early frame is still standing where the fight left it.
// The first capture at 900 ms came back as a screenful of bonfire.
const AT = process.argv.includes("--at") ? parseInt(process.argv[process.argv.indexOf("--at") + 1], 10) : 900;
await sleep(AT);
const beat = await look();
console.log(`[roundbeat] BEAT ONE  scrim=${beat.scrim} emoteButtons=${beat.emotes} state=${beat.state}`);
console.log(`[roundbeat]           "${beat.text}"`);
await page.screenshot({ path: `${OUT}/round-beat-1.png` });

// BEAT TWO — the break card. Found by WAITING FOR THE SCRIM rather than by
// counting milliseconds, because the shot above may have cost most of a break.
// The scrim is drawn by nothing else, so its arrival IS the card arriving, and
// if this break is already spent the next round's break offers another.
drive = driveIntoTheFire(wires);
const card = await until(async () => {
  const l = await look();
  return l.scrim ? l : null;
}, "the break card's scrim", 120000);
clearInterval(drive);
console.log(`[roundbeat] BEAT TWO  scrim=${card.scrim} emoteButtons=${card.emotes} state=${card.state}`);
console.log(`[roundbeat]           "${card.text}"`);
await page.screenshot({ path: `${OUT}/round-beat-2.png` });

// The two claims this file exists to make, stated as a verdict rather than left
// to the eye: the beat is unscrimmed and offers the flourish to the man who won
// the round; the card that follows scrims and offers nothing.
const beatOk = !beat.scrim && beat.emotes === 3 && beat.text.includes("THE ROUND IS YOURS");
const cardOk = card.scrim && card.emotes === 0 && card.text.includes("NEXT ROUND IN");
console.log(`[roundbeat] ${beatOk ? "PASS" : "FAIL"} — the arena beat is unscrimmed and offers the flourish to the round's victor`);
console.log(`[roundbeat] ${cardOk ? "PASS" : "FAIL"} — the break card scrims the arena and offers no flourish over it`);
const ok = beatOk && cardOk;

await browser.close();
server.kill();
process.exitCode = ok ? 0 : 1;
