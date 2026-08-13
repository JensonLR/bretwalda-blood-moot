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

/**
 * The braces-balanced argument object of the `audio.hit(` CALL.
 *
 * It takes the first occurrence whose arguments open with `({`, not simply the
 * first occurrence — because this file's own fix introduced a comment reading
 * "this block used to call `audio.hit()`", and the old version happily returned
 * those two characters and then graded THEM. Every check below went red against
 * a file that had been fixed, for the sole reason that somebody wrote the
 * method's name in prose. A reader that cannot tell a call from a mention is a
 * reader of comments, which is the wrong quantity.
 */
function hitCallSite(src) {
  let from = 0;
  for (;;) {
    const at = src.indexOf("audio.hit(", from);
    if (at < 0) return null;
    let depth = 0, i = src.indexOf("(", at);
    const start = i;
    let text = null;
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") { depth--; if (depth === 0) { text = src.slice(start, i + 1); break; } }
    }
    if (text && /^\(\s*\{/.test(text)) return text;
    from = at + 10;
  }
}

/**
 * THE KINDS THE ENGINE ACTUALLY BROADCASTS, read off `engine.mjs`.
 *
 * Two shapes, and both have to be found or the answer is a guess. Three of the
 * four `broadcast(... {type:"hit", data:{type: X` sites name X as a literal
 * ("shove", "parry", "knockdown"); the fourth passes the variable `hitType`,
 * whose values are the literals handed to `applyDamage` at the same position —
 * "light", "heavy", "blocked", "blocked_heavy".
 *
 * This is deliberately read from the ENGINE and not from the docs and not from
 * a list in this file. docs/PROCESS.md failure mode 3 is the mirrored
 * definition, and a hand-kept copy of the wire's vocabulary here would be the
 * fifth instance of it: it would agree with the engine until the day somebody
 * added a kind, which is the exact day this check would need to fail.
 */
function engineHitKinds(src) {
  const kinds = new Set();
  const vars = new Set();
  for (const m of src.matchAll(/type:\s*"hit"\s*,\s*data:\s*\{\s*type:\s*(?:"([^"]+)"|([A-Za-z_$][\w$]*))/g)) {
    if (m[1]) kinds.add(m[1]);
    else if (m[2]) vars.add(m[2]);
  }
  // Resolve the variable case: every string literal passed to `applyDamage`.
  // Its signature puts the hit type there and nothing else in the call is a
  // string, so this reads the four wounding kinds without knowing their names.
  if (vars.size) {
    for (const m of src.matchAll(/\bapplyDamage\s*\(([^;]*?)\)\s*;/g)) {
      for (const q of m[1].matchAll(/"([a-z_]+)"/g)) kinds.add(q[1]);
    }
  }
  return { kinds: [...kinds].sort(), vars: [...vars] };
}

/** The `X` of every `export const WIRE_HIT_TYPES = [...]` entry in audio.ts. */
function moduleHitKinds(src) {
  const m = src.match(/WIRE_HIT_TYPES\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return null;
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((q) => q[1]).sort();
}

function callSiteChecks() {
  console.log("\n[soundwire] phase 0 — engine to client to synth, all three read off disk");
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

  // ---- 0. THE VOCABULARY, END TO END ----
  //
  // This is the check that would have caught the whole defect, and it is the one
  // that did not exist. `soundtest` proves each kind SOUNDS like something;
  // this proves the set of kinds the server can send is the set the client can
  // route and the set the synth declares. A kind that falls out of any one of
  // the three is a sound the game cannot make, and every gate over it is green
  // because the case is absent.
  {
    const enginePath = resolve(ROOT, "src/game/engine.mjs");
    const audioPath = resolve(ROOT, "src/game/client/render/audio.ts");
    const eng = existsSync(enginePath) ? engineHitKinds(readFileSync(enginePath, "utf8")) : null;
    const mod = existsSync(audioPath) ? moduleHitKinds(readFileSync(audioPath, "utf8")) : null;
    if (eng) note(`engine.mjs broadcasts hit kinds: ${eng.kinds.join(", ")}${eng.vars.length ? ` (via literals and ${eng.vars.join("/")})` : ""}`);
    check("the audio module declares the wire's hit kinds as a list, instead of a harness keeping one",
      Array.isArray(mod) && mod.length > 0,
      mod ? `WIRE_HIT_TYPES = ${mod.join(", ")}` : "no WIRE_HIT_TYPES in audio.ts");
    if (eng && mod) {
      const unrouted = eng.kinds.filter((k) => !mod.includes(k));
      const phantom = mod.filter((k) => !eng.kinds.includes(k));
      check("every hit kind the server can send is one the audio module knows about",
        unrouted.length === 0,
        unrouted.length ? `THE ENGINE SENDS AND THE SYNTH HAS NEVER HEARD OF: ${unrouted.join(", ")}`
          : `all ${eng.kinds.length} accounted for`);
      // R3 in the other direction, and it is the rule this whole round is about:
      // a kind graded by soundtest that the engine cannot send is five green
      // claims about a sound nobody will ever hear.
      check("the audio module declares no hit kind the server cannot send",
        phantom.length === 0,
        phantom.length ? `GRADED BUT UNREACHABLE: ${phantom.join(", ")} — soundtest grades these and no fight can produce one`
          : `no phantom kinds`);
    }
  }

  // ---- 1. THE MESSAGE ITSELF ----
  //
  // The client used to derive every blow from a snapshot delta and never read
  // the `hit` message at all. That single fact is why the parry had never
  // played: the derivation lives inside `if (p.health < slot.prevHp - 0.5)`, and
  // three of the seven kinds carry damage 0.
  {
    const routed = /case\s+["']hit["']/.test(readFileSync(resolve(ROOT, "src/app/page.tsx"), "utf8"));
    const drained = /hitFeed/.test(src);
    check("the server's hit message reaches the canvas at all",
      routed && drained,
      routed && drained
        ? "page.tsx routes case \"hit\" into a feed and GameCanvas drains it"
        : `page.tsx ${routed ? "routes" : "DROPS"} the hit message; GameCanvas ${drained ? "has" : "has NO"} drain for it — every blow is derived from a health delta, which a parry, a shove and a knockdown never produce`);
  }

  // ---- 2. THE TYPE IS READ, NOT GUESSED ----
  //
  // The old call site computed `dmg >= 22 ? "heavy" : "light"` from the delta
  // while the server had already said which of seven kinds it was. A derived
  // type can never be "parry", and it is wrong about the other six whenever the
  // damage numbers move.
  {
    const guesses = /type:\s*\w+\s*\?\s*\(?\s*\w+\s*>=?\s*\d+\s*\?/.test(call)
      || /type:\s*\w+\s*>=?\s*\d+\s*\?/.test(call);
    const readsWire = /\btype:\s*m\.type\b/.test(call) || /\btype:\s*\w+\.type\b/.test(call);
    check("the client passes the server's own hit type through instead of deriving one",
      readsWire && !guesses,
      readsWire && !guesses ? "the wire's `type` is handed to audio.hit() unchanged"
        : guesses ? "the type is computed from the damage number — that expression can never produce 'parry', 'shove' or 'knockdown'"
          : "no `type: <message>.type` in the audio.hit arguments");
  }

  // ---- 3. THE WEAPON. `impact()` reads it and moves the contact colour, the
  //    ring frequencies and the contact time by it. Without it every blow in the
  //    game is a sword and the axe-versus-seax work is dead code.
  {
    const passesWeapon = /\bweapon\s*:/.test(call);
    const fromAttacker = /attackerId/.test(call);
    check("blows tell the audio engine what threw them",
      passesWeapon && fromAttacker,
      passesWeapon
        ? (fromAttacker ? "the weapon is looked up from the message's attackerId" : "a weapon is passed but not from the wire's attackerId, so it is a guess about who swung")
        : "no `weapon:` in the audio.hit arguments — every blow in the game is synthesised as a sword");
  }

  // ---- 4. AND THE RIPOSTE, which is a flag and not a kind, so the vocabulary
  //    check above cannot see it. The engine sets it on every wound and pays it
  //    in damage, knockback and poise; the ear has to be paid too.
  {
    const passes = /\briposte\s*:/.test(call);
    check("a riposte arrives at the mixer marked as one",
      passes,
      passes ? "the wire's riposte flag is handed to audio.hit()"
        : "no `riposte:` in the audio.hit arguments — the biggest single blow any class can throw sounds like an ordinary one");
  }
}

async function main() {
  callSiteChecks();

  // SOUNDWIRE_PHASE=0 stops here. Phase 0 needs no browser, no server and no
  // canvas and answers in milliseconds; the live leg needs all three and often
  // cannot run in a container at all. E3 — go DOWN the instrument table to
  // iterate — and the deferral rides the verdict line either way.
  if (process.env.SOUNDWIRE_PHASE === "0") { verdict(true); return; }

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
  // FOUR STEPS, CHECKED BETWEEN EACH, and the readiness test is the AUDIO
  // ENGINE rather than `window.__probe`.
  //
  // Both halves of that were wrong and both made this leg permanently absent.
  // The Testgrounds needs Training -> MUSTER -> a difficulty -> DRAW STEEL and
  // this file tapped three of the four, so it never left the muster; and it then
  // waited sixty seconds on `window.__probe`, which this build does not install,
  // so the answer would have been "no fight" even from inside one. It reported
  // `probe=false, audio=true, state=null` — the audio engine was right there and
  // the thing being asked was not. Stopping the moment the fight is up also
  // matters: a /RECRUIT|WARRIOR/i match still exists once it is staged, and
  // pressing on navigated out of it.
  const ready = () => page.evaluate(() => (() => {
    // AN HONEST FIGHT TEST. `window.__bretwaldaAudio.ready` is
    // `ac !== null && state !== "suspended"`, which flips on the FIRST CLICK
    // ANYWHERE — so using it as "am I in a fight?" broke the menu loop after one
    // tap and left every check below it grading the LANDING SCREEN while
    // printing "in a fight". Three shipped claims were false because of it.
    // A fight is the only thing that mounts a canvas AND names a local player.
    const c = document.querySelector("canvas");
    if (!c || c.clientWidth < 64) return false;
    const p = window.__bretwaldaProbe;
    if (p && typeof p.playerId === "string" && p.playerId) return true;
    // Fall back to the DOM: the landing screen always shows these, a fight never does.
    const t = document.body.innerText || "";
    return !/CREATE BATTLE|JOIN BATTLE|Training vs AI/i.test(t);
  })()).catch(() => false);
  let reached = false;
  for (const step of [/Training/i, /MUSTER|TESTGROUNDS/i, /RECRUIT|WARRIOR/i, /DRAW STEEL|FIGHT|BEGIN/i]) {
    if (reached) break;
    await tap(step);
    await page.waitForTimeout(700);
    reached = await page.waitForFunction(() => window.__bretwaldaAudio?.ready === true, null, { timeout: 15000 })
      .then(() => true).catch(() => false);
  }
  if (reached) await page.waitForTimeout(1500);
  void ready;
  if (!reached) {
    const seen = await page.evaluate(() => ({
      probe: !!window.__probe, audio: !!window.__bretwaldaAudio,
      ready: window.__bretwaldaAudio?.ready === true,
      state: window.__probe?.lastState?.state ?? null,
    }));
    await browser.close();
    console.log("");
    note(`the live leg could not reach a fight (probe=${seen.probe}, audio=${seen.audio}, engine ready=${seen.ready}, state=${seen.state}).`);
    note("Phase 0's verdict below stands on its own; the live counts are simply absent.");
    verdict(true);
    return;
  }
  console.log(`[soundwire] in a fight; playing for ${SECONDS}s\n`);
  // POINTER LOCK. The desktop client will not take mouse look or, on some
  // paths, a swing until the canvas holds the pointer, and the click-to-lock
  // banner sits over the fight until somebody presses it. Without this the loop
  // below drove a man who never moved: sixty seconds of play produced TWO audio
  // calls and not one blow, and every reachability check then failed while
  // saying the parry was unreachable — which was true last round and is not
  // true now. A gate that goes red for the wrong reason is worth as little as
  // one that goes green for the wrong reason.
  await page.locator("canvas").first().click({ position: { x: 640, y: 400 } }).catch(() => {});
  await page.waitForTimeout(400);

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

  // DID THE MACHINE ACTUALLY FIGHT?
  //
  // Every reachability check below is of the form "in N seconds of play, did the
  // game ever produce X". Each of them is worthless — and worse than worthless,
  // because it goes RED and names the wrong cause — if the play loop never drove
  // the man at all. That is not hypothetical: pointer lock kept the canvas from
  // taking input on this container's first successful run, sixty seconds of play
  // produced two calls and no swings, and four checks then failed while blaming
  // a wiring defect phase 0 had just proved fixed.
  //
  // A swing is the cheapest proof that a key press became a game action: it
  // needs no opponent, no contact and no luck. If none happened the counts below
  // are ABSENT rather than zero, and R4 puts that difference on the verdict line
  // rather than in a comment.
  const swings = log.filter((c) => c.k === "swing").length;
  const droveTheMan = swings > 0;
  check("the play loop actually drove the man, so the counts below mean something",
    droveTheMan,
    droveTheMan
      ? `${swings} swings thrown in ${SECONDS}s — input is reaching the canvas`
      : `NO SWING IN ${SECONDS}s. The fight was reached but not one key press became a game action, so nothing below would measure the WIRING — it would measure a machine standing still. Pointer lock is the usual cause. Phase 0's static verdict is this run's evidence; the live counts are ABSENT, not zero.`);
  if (!log.length || !droveTheMan) {
    // And it prints a VERDICT on the way out. This early return used to just
    // `return`, so the run ended on a FAIL line with no count under it — the
    // third instance of "a harness that reports nothing reads exactly like one
    // that found nothing" in these two files, and I wrote this one myself while
    // fixing the other two.
    verdict(true);
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
        : "0 in this run. Phase 0 proves the ROUTE exists — page.tsx queues the message, GameCanvas hands its type to audio.hit() — so a zero here now means the machine never threw a shield up inside PARRY_WINDOW, not that the client cannot voice one. It used to mean the second thing: the call sat inside `if (p.health < slot.prevHp - 0.5)` and a parry takes nothing off.");
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
    void withWeapon;
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
