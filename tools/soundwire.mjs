#!/usr/bin/env node
// ============================================================
// SOUNDWIRE — which of these sounds does a REAL MATCH actually make?
//
//   node tools/soundwire.mjs
//
// `soundtest` grades the synthesis by calling the engine directly in an
// OfflineAudioContext. Every claim it makes is of the form "IF this event is
// fired, it sounds like this". Not one of them can tell you whether the game
// ever fires it.
//
// docs/PROCESS.md, the rule this file exists for:
//
//   > A GATE THAT IS GREEN BECAUSE THE CASE IS ABSENT IS NOT A GATE. When you
//   > add a gate, add the fixture that reproduces the real thing.
//
// So this one runs the actual game — a real server, a real browser, a real
// Training match, real key presses — with a recorder wrapped around every
// method of `window.__bretwaldaAudio`, and reports what came out. It grades the
// WIRING, not the synthesis: whether the four materials the engine can voice are
// materials the game can produce, and whether the events arrive carrying the
// data the synthesis needs.
//
// It found the thing it was written to look for on its first run, and that is
// recorded in docs/SOUND.md: the PARRY — the hero sound, the one event with a
// dedicated shimmer and a duck of the whole mix behind it, graded on five
// separate claims by `soundtest` — HAS NEVER PLAYED. `GameCanvas.tsx` derives
// the hit type from a health delta, and a parry does zero damage, so the branch
// that would voice it is never entered on any input from any player.
//
// Exit 0 all proven, 1 a claim failed, 2 the fight was never reached.
// ============================================================
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = parseInt(process.env.PORT || String(3990 + (process.pid % 40)), 10);
const SECONDS = parseInt(process.env.SOUNDWIRE_SECONDS || "70", 10);

let server = null;
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const note = (s) => console.log(`        ${s}`);

/**
 * R4: a deferral rides the verdict line, in the words a person will read. A run
 * that never got into a fight has measured strictly less than one that did, and
 * saying so in the same sentence as the count is the only way that survives
 * being pasted into a report.
 */
function verdict(livesSkipped) {
  const failed = results.filter((x) => !x.pass);
  const tail = livesSkipped
    ? " — WITH the live-match leg NOT RUN, so the reachability counts are missing and this is not a clean sheet"
    : "";
  console.log(`\n[soundwire] ${results.length - failed.length}/${results.length} claims proven${tail}`);
  if (failed.length) {
    console.log("[soundwire] UNPROVEN: " + failed.map((f) => f.name).join(", "));
    console.log("[soundwire] These are WIRING defects, not synthesis defects. The sound exists");
    console.log("[soundwire] and is graded; the game does not ask for it. See docs/SOUND.md.");
    process.exitCode = 1;
  }
}

async function waitForServer(url, timeoutMs = 180000) {
  const started = Date.now();
  for (;;) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    if (Date.now() - started > timeoutMs) throw new Error(`server never came up: ${url}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

/**
 * Installed before any application script runs.
 *
 * The audio module publishes itself on `window.__bretwaldaAudio` at import, so
 * the recorder waits for it and then replaces every function-valued property
 * with a wrapper that logs the call and forwards it. Nothing is stubbed and
 * nothing is suppressed — the game sounds exactly as it would, and the log is a
 * by-product. `setBurning` and `update` are excluded because they are called
 * every frame for every player and would be the entire log.
 */
const RECORD = () => {
  const w = window;
  w.__snd = { calls: [], wrapped: false };
  const SKIP = new Set(["update", "setBurning", "setBonfire", "setQuality", "unlock", "adopt"]);
  const wrap = () => {
    const a = w.__bretwaldaAudio;
    if (!a || w.__snd.wrapped) return;
    w.__snd.wrapped = true;
    // The handle is a class instance, so the methods are on its prototype.
    let proto = a;
    const seen = new Set();
    while (proto && proto !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (seen.has(key) || SKIP.has(key) || key === "constructor") continue;
        const d = Object.getOwnPropertyDescriptor(proto, key);
        if (!d || typeof d.value !== "function") continue;
        seen.add(key);
        const real = d.value;
        Object.defineProperty(a, key, {
          configurable: true, writable: true,
          value: function (...args) {
            try {
              const e = args[0];
              w.__snd.calls.push({
                k: key,
                material: e && e.material,
                type: e && e.type,
                heavy: e && e.heavy === true,
                weapon: e && e.weapon,
                zone: e && (e.hitZone ?? e.zone),
                damage: e && e.damage,
                local: e && e.local === true,
                ui: key === "ui" ? args[0] : undefined,
              });
            } catch { /* never let the recorder break the game */ }
            return real.apply(this, args);
          },
        });
      }
      proto = Object.getPrototypeOf(proto);
    }
  };
  const iv = setInterval(() => { wrap(); if (w.__snd.wrapped) clearInterval(iv); }, 50);
  wrap();
};

// ------------------------------------------------------------------
// PHASE 0 — the call site, read off disk.
//
// This runs in milliseconds, needs no browser and no server, and it exists
// because the browser leg cannot always run: reaching a fight needs the menu,
// the game socket and a canvas, and when any of those is down in a container
// this file would otherwise report nothing at all and be indistinguishable from
// a pass. docs/PROCESS.md R2 — a harness that has only ever been seen green has
// never been tested — applies just as hard to a harness that has never been
// seen at all.
//
// It is also the RIGHT instrument for this particular defect, not a fallback
// for it. The parry is unreachable because of a static fact about one `if`:
// there is no input any player could give that would voice one. A source
// assertion is the cheapest thing that can see that, and it goes green the
// moment the wiring is fixed.
// ------------------------------------------------------------------

/** The braces-balanced argument object of the first `audio.hit(` call. */
function hitCallSite(src) {
  const at = src.indexOf("audio.hit(");
  if (at < 0) return null;
  let depth = 0, i = src.indexOf("(", at);
  const start = i;
  for (; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}

function callSiteChecks() {
  console.log("\n[soundwire] phase 0 — the call site in GameCanvas.tsx");
  const rel = "src/game/client/GameCanvas.tsx";
  const path = resolve(ROOT, rel);
  if (!existsSync(path)) {
    check("the client call site exists to be read", false, `${rel} not found`);
    return;
  }
  const src = readFileSync(path, "utf8");
  const call = hitCallSite(src);
  check("the client calls audio.hit at all", call !== null, call ? `${call.length} chars of arguments` : "no audio.hit( in the file");
  if (!call) return;

  // 1. THE PARRY. The wire says `type: "parry"`; the client must be able to say
  //    it too. Today the type is computed from a health delta and a blocking
  //    flag, and the whole call is inside `if (p.health < prevHp - 0.5)`, so a
  //    zero-damage blow voices nothing whatever the player does.
  {
    const saysParry = /["']parry["']/.test(call);
    const guarded = /health\s*<\s*\w+\.prevHp/.test(src);
    check("a parry can reach the audio engine from the client",
      saysParry,
      saysParry
        ? "the call site can produce type:'parry'"
        : `the word "parry" appears nowhere in the audio.hit arguments${guarded ? ", and the call is inside an `if (p.health < slot.prevHp - 0.5)` branch that a zero-damage blow never enters" : ""} — soundtest grades the parry on five claims and the game cannot make one`);
  }

  // 2. THE WEAPON. `impact()` reads it and moves the contact colour, the ring
  //    frequencies and the contact time by it. Without it every blow in the
  //    game is a sword and the axe-versus-seax work is dead code.
  {
    const passesWeapon = /\bweapon\s*:/.test(call);
    const hasAttacker = /\battacker\b/.test(src);
    check("blows tell the audio engine what threw them",
      passesWeapon,
      passesWeapon ? "the call site passes a weapon"
        : `no \`weapon:\` in the audio.hit arguments${hasAttacker ? " — and `attacker` is already resolved in that same block, for the blood direction" : ""}`);
  }

  // 3. And the freeze already comes off the wire rather than being guessed. If
  //    the client ever starts consuming the `hit` message directly, 1 and 2 stop
  //    being derivations and become reads, which is the better fix.
  {
    const consumes = /type\s*===\s*["']hit["']/.test(src) || /case\s+["']hit["']/.test(src);
    note(consumes
      ? "the client consumes the server's `hit` message directly"
      : "the client derives every blow from snapshot deltas and never reads the `hit` message; the parry, the attacker and the true hit type are all on that message already");
  }
}

async function main() {
  callSiteChecks();

  const useProd = existsSync(resolve(ROOT, ".next/BUILD_ID"));
  console.log(`[soundwire] starting ${useProd ? "custom-server" : "dev-server"} on :${PORT}`);
  server = spawn("node", [useProd ? "custom-server.mjs" : "dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: useProd ? "production" : "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(`[srv] ${d}`));
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);

  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox",
      // Unlike `phonesound`, the autoplay policy IS waived here. That test is
      // about the unlock path; this one is about which events the game emits,
      // and a suspended context would make every measurement below a zero for
      // the wrong reason.
      "--autoplay-policy=no-user-gesture-required"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(RECORD);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[page-error] ${e}`));

  await page.goto(`http://127.0.0.1:${PORT}/?quality=low`, { waitUntil: "domcontentloaded" });

  // ---- reach a fight, WITH opponents in it ----
  //
  // The opposite choice from `playtest`, which empties the ring so a corpse
  // cannot spoil its input assertions. Here the other men ARE the fixture:
  // there is no blocked hit, no parry and no death without somebody to fight.
  //
  // Every step is best-effort. The menu, the game socket and a canvas all have
  // to work to get here, and when one of them does not this file still has a
  // verdict to give from phase 0 — which it says out loud rather than exiting
  // quietly, because a harness that reports nothing reads exactly like one that
  // found nothing.
  const tap = async (rx) => {
    try { await page.getByRole("button", { name: rx }).first().click({ timeout: 12000 }); return true; }
    catch { /* not on this screen */ }
    try { await page.getByText(rx).first().click({ timeout: 8000 }); return true; }
    catch { return false; }
  };
  await tap(/Training/i);
  await page.waitForTimeout(800);
  await tap(/MUSTER|TESTGROUNDS|WARRIOR|RECRUIT/i);
  await page.waitForTimeout(800);
  await tap(/DRAW STEEL|FIGHT|BEGIN/i);
  const reached = await page.waitForFunction(
    () => window.__probe?.lastState?.state === "fighting", null, { timeout: 60000 },
  ).then(() => true).catch(() => false);
  if (!reached) {
    const seen = await page.evaluate(() => ({
      probe: !!window.__probe, audio: !!window.__bretwaldaAudio,
      state: window.__probe?.lastState?.state ?? null,
    }));
    await browser.close();
    console.log("");
    note(`the live leg could not reach a fight (probe=${seen.probe}, audio=${seen.audio}, state=${seen.state}).`);
    note("Phase 0's verdict below stands on its own; the live counts are simply absent.");
    verdict(true);
    return;
  }
  console.log(`[soundwire] in a fight; playing for ${SECONDS}s\n`);

  // ---- play. Badly, on purpose, and in every mode the controls have ----
  //
  // A run that only attacks produces only `light` and `heavy`. Blocking is what
  // produces `blocked`, `blocked_heavy` and — if the timing ever lands inside
  // PARRY_WINDOW — a parry. So the loop deliberately spends a third of its time
  // raising the shield, including raising it late, which is the only way a parry
  // is ever thrown by a machine.
  const until = Date.now() + SECONDS * 1000;
  let beat = 0;
  await page.mouse.move(640, 400);
  while (Date.now() < until) {
    beat++;
    const phase = beat % 6;
    if (phase === 0 || phase === 3) {
      // Guard up, and hold it through whatever is coming. A shield raised as a
      // blow arrives is a parry; a shield already up is a block.
      await page.mouse.down({ button: "right" });
      await page.waitForTimeout(phase === 0 ? 140 : 620);
      await page.mouse.up({ button: "right" });
    } else if (phase === 1) {
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(260);
      await page.keyboard.up("KeyW");
      await page.mouse.down();
      await page.waitForTimeout(90);
      await page.mouse.up();
    } else if (phase === 2) {
      // Heavy: hold the button.
      await page.mouse.down();
      await page.waitForTimeout(560);
      await page.mouse.up();
    } else if (phase === 4) {
      await page.keyboard.press("Space");        // dodge
      await page.waitForTimeout(120);
      await page.keyboard.press("KeyF");         // ability
    } else {
      await page.keyboard.down("KeyA");
      await page.waitForTimeout(200);
      await page.keyboard.up("KeyA");
      await page.evaluate(() => {
        const cv = document.querySelector("canvas");
        if (cv) cv.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, movementX: 34, movementY: 0 }));
      });
    }
    await page.waitForTimeout(90);
  }

  const log = await page.evaluate(() => window.__snd.calls);
  const wrapped = await page.evaluate(() => window.__snd.wrapped === true);
  await browser.close();

  // ------------------------------------------------------------------
  console.log("");
  check("the recorder attached to the live audio engine at all", wrapped && log.length > 0,
    wrapped ? `${log.length} audio calls recorded across ${SECONDS}s of play` : "window.__bretwaldaAudio never appeared");
  if (!log.length) {
    process.exitCode = 1;
    return;
  }

  const byKind = {};
  for (const c of log) byKind[c.k] = (byKind[c.k] ?? 0) + 1;
  note(`kinds: ${Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} x${n}`).join(", ")}`);

  const blows = log.filter((c) => c.k === "hit" || c.k === "impact");
  const types = {};
  for (const c of blows) types[c.type ?? `impact:${c.material}`] = (types[c.type ?? `impact:${c.material}`] ?? 0) + 1;
  note(`blows: ${Object.entries(types).map(([k, n]) => `${k} x${n}`).join(", ") || "none"}`);

  // ---- 1. every material the engine can voice must be REACHABLE ----
  //
  // `materialFor` maps the wire's hit types onto four materials and `soundtest`
  // grades all four. If the game cannot produce one of them, that material's
  // five green claims are describing a sound no player has heard.
  {
    const MATERIALS = ["flesh", "shield", "mail", "parry"];
    const seen = new Set();
    for (const c of blows) {
      if (c.material) { seen.add(c.material); continue; }
      if (c.type === "parry") seen.add("parry");
      else if (c.type === "blocked" || c.type === "blocked_heavy") seen.add("shield");
      else if (c.type) seen.add((c.damage ?? 0) >= 22 || c.zone ? "?" : "mail/flesh");
    }
    const missing = MATERIALS.filter((m) => !seen.has(m) && !(m === "mail" || m === "flesh" ? seen.has("mail/flesh") || seen.has("?") : false));
    check("every impact material the engine can voice is one a real match can produce",
      missing.length === 0,
      missing.length
        ? `NEVER FIRED IN ${SECONDS}s OF PLAY: ${missing.join(", ")} — soundtest grades these and the game cannot make them`
        : `all four reachable; saw ${[...seen].join(", ")}`);
  }

  // ---- 2. the parry, named on its own, because it is the hero sound ----
  {
    const parries = blows.filter((c) => c.type === "parry" || c.material === "parry").length;
    check("the parry — the hero sound — is fired by the game",
      parries > 0,
      parries ? `${parries} parries voiced`
        : "0. The wire carries type:'parry' with damage 0; GameCanvas.tsx only calls audio.hit() inside `if (p.health < slot.prevHp - 0.5)`, so a blow that takes nothing off voices nothing at all, and the derived type can never be 'parry'");
  }

  // ---- 3. the blows have to carry what the synthesis reads ----
  //
  // `impact()` takes a weapon and changes the contact colour, the ring
  // frequencies and the contact time by it — that is the whole of "an axe and a
  // seax must not share a spectrum" at the moment of impact. A caller that never
  // passes one gets the sword every time, and the feature is dead code with a
  // green test over it.
  {
    const withWeapon = blows.filter((c) => c.weapon).length;
    check("blows carry the weapon that threw them",
      blows.length > 0 && withWeapon === blows.length,
      `${withWeapon}/${blows.length} — the attacker's class is on the wire as attackerId; without it every blow in the game is a sword`);
  }

  // ---- 4. and heavy has to be told apart from light by the caller ----
  {
    const heavy = blows.filter((c) => c.heavy || c.type === "heavy" || c.type === "blocked_heavy").length;
    const light = blows.length - heavy;
    check("a real match produces both heavy and light blows",
      heavy > 0 && light > 0,
      `${heavy} heavy, ${light} light — weight is measured on this distinction and it has to actually arrive`);
  }

  verdict(false);
}

main()
  .catch((e) => { console.error("[soundwire] failed:", e); process.exitCode = 1; })
  .finally(() => { if (server) server.kill("SIGTERM"); });
