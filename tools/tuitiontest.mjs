#!/usr/bin/env node
// ============================================================
// TUITIONTEST — does the hint teach, and then go?
//
//   node tools/tuitiontest.mjs
//
// The owner, verbatim, 13 Aug 2026:
//
//   "Flick screen to change foe stays on screen permanently that needs to fade
//    away."
//
// WHAT SHIPPED, in `GameHud.tsx`:
//
//     {isMobile.current && lockedOn && !hasSwitched && ( ... )}
//
// with `hasSwitched` reading `input.ts`'s `lock.switches`, which increments in
// `applySwitch` only AFTER a man has been found on the side the thumb flicked:
//
//     const next = take ?? wrap;
//     if (!next) return;        // <- nobody there; nothing is counted
//     lock.switches++;
//
// So the line retires on a switch that LANDS. Claim 1 below drives a real honour
// duel and shows that a switch can never land in it — two men, nobody to switch
// to — which makes the caption permanent in the mode the owner plays, however
// many times he flicks. `--blind` is not needed here: the shipped rule is three
// lines and they are modelled explicitly in `shippedRule` below, quoted above,
// and every claim about the fix fails against them.
//
// WHAT IS REAL HERE AND WHAT IS NOT:
//
//   REAL — the engine, for claim 1. `getEngine()` is the same singleton
//          `custom-server.mjs` hands a socket to; the room size and who is alive
//          in it are the server's own.
//   REAL — `src/game/tuition.mjs`. The module under test is the module the HUD
//          imports, and claim 12 is the line that says so.
//   MODELLED — the shipped rule, in three lines, because `input.ts` is a React
//          module that cannot be loaded here. It is quoted above and the model
//          is beside it.
//   MODELLED — the store. `localStorage` is a Map here, which is what lets a
//          claim about "a player who learned this last week" be driven at all.
//
// Exits non-zero if any claim fails.
// ============================================================
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { getEngine } from "../src/game/engine.mjs";
import { createTuitionHint, FOE_HINT, FOE_HINT_KEY } from "../src/game/tuition.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** A store a claim can put a history into. */
function memStore(initial = null) {
  let v = initial;
  return { load: () => v, save: (x) => { v = x; }, get value() { return v; } };
}

/** Run a hint for `seconds` of eligible time at 60 Hz, reporting when it left. */
function air(hint, seconds, { eligible = true, flickAt = null, step = 1 / 60 } = {}) {
  let t = 0;
  let lastAlive = -1;
  let lastVisible = -1;
  let everVisible = false;
  for (let n = 0; n * step < seconds; n++) {
    t = n * step;
    if (flickAt !== null && t >= flickAt && !hint.learned) hint.used();
    hint.update(step, eligible);
    if (hint.alive) lastAlive = t;
    if (hint.visible) { lastVisible = t; everVisible = true; }
  }
  return { lastAlive, lastVisible, everVisible, end: t };
}

// ============================================================
// 1. THE DEFECT, on the real engine.
//
//    Not "the code looks like it cannot retire" — the room the owner plays in
//    cannot produce the event it retires on. Driven, because `maxPlayers: 2` in
//    a source file is a claim and a duel with one live enemy in it is evidence.
// ============================================================
const engine = getEngine();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const duel = await (async () => {
  let room = null;
  let done = null;
  const settled = new Promise((r) => { done = r; });
  const seen = [];
  const sid = engine.connect((str) => {
    const m = JSON.parse(str);
    const d = m.data || {};
    if (d.players) room = { ...d };
    else if (room) room = { ...room, ...d };
    if (room && room.players && room.state === "fighting") {
      seen.push({ ...room, players: { ...room.players } });
      if (seen.length >= 40 && done) { done(); done = null; }
    }
  });
  engine.message(sid, { type: "create", data: { name: "Moot", mode: "honour_duel", bestOf: 3 } });
  engine.message(sid, { type: "add_bot", data: { difficulty: "jarl" } });
  engine.message(sid, { type: "start", data: {} });
  await Promise.race([settled, sleep(45000)]);
  return seen;
})();

const localId = duel.length
  ? Object.keys(duel[0].players).find((id) => !duel[0].players[id].isBot) ?? Object.keys(duel[0].players)[0]
  : null;
/** The most live enemies the local man ever had at once, across the fight. */
const mostFoes = duel.reduce((m, r) => Math.max(m, Object.values(r.players)
  .filter((p) => p.id !== localId && p.state !== "dead").length), 0);
check("a real honour duel was driven and sampled while it was FIGHTING",
  duel.length >= 20 && !!localId,
  `${duel.length} fighting snapshots, room holds ${duel.length ? duel[0].maxPlayers : "?"}`);
check("THE DEFECT'S ROOT: in an honour duel there is never a second man to switch to, so a switch can NEVER land",
  mostFoes === 1,
  `the most live enemies the local warrior ever had at once was ${mostFoes}; `
  + `\`applySwitch\` returns before \`lock.switches++\` when there is nobody on the other side, `
  + `so the counter the caption retired on is nailed to zero for the whole match`);

/**
 * The shipped rule, in the three lines it was: the line is up while a man is
 * locked and no switch has LANDED. Flicks are handed in and ignored, which is
 * the defect stated as an argument list.
 */
function shippedRule() {
  let switchesLanded = 0;
  return {
    /** `foesAvailable` is the whole defect: the count only moves when there was
     *  somebody to take, which in a duel is never. */
    flick(foesAvailable) { if (foesAvailable > 1) switchesLanded++; },
    visible(lockedOn) { return lockedOn && switchesLanded === 0; },
  };
}

const shipped = shippedRule();
for (let i = 0; i < 20; i++) shipped.flick(1);
check("THE DEFECT REPRODUCES: under the shipped rule the caption is still up after twenty flicks in a duel",
  shipped.visible(true) === true,
  "twenty flicks, one foe, and `◀ FLICK THE GLASS TO CHANGE FOE ▶` is still on the glass — "
  + "there is nothing the player can do to make it go");
const shippedMoot = shippedRule();
shippedMoot.flick(3);
check("and it is not broken everywhere — in a moot the shipped rule does retire, which is why nobody caught it",
  shippedMoot.visible(true) === false,
  "one flick with three men in range and the shipped line goes; the fault is invisible in the mode it works in");

// ============================================================
// 2. THE NEW RULE. A player who NEVER flicks is still taught, and it still goes.
// ============================================================
{
  const store = memStore();
  const hint = createTuitionHint({ load: store.load, save: store.save });
  const a = air(hint, FOE_HINT.seconds + FOE_HINT.fade + 2);
  check("A PLAYER WHO NEVER FLICKS IS TAUGHT: the line is up for its whole reading time",
    a.everVisible && a.lastVisible >= FOE_HINT.seconds - 0.05,
    `visible from 0.00s to ${a.lastVisible.toFixed(2)}s against ${FOE_HINT.seconds}s of reading time`);
  check("AND THEN IT GOES: it fades out and is off the glass, without a flick ever being made",
    a.lastAlive < FOE_HINT.seconds + FOE_HINT.fade + 0.05 && a.lastAlive > a.lastVisible,
    `full opacity to ${a.lastVisible.toFixed(2)}s, gone by ${(a.lastAlive + 1 / 60).toFixed(2)}s `
    + `(${FOE_HINT.fade}s of fade), against a shipped rule that never removes it at all`);
}

// ============================================================
// 3. THE CLOCK ONLY RUNS WHILE THE LINE IS UP AND MEANS SOMETHING.
//    A hint that expires while the player is dead has not been read.
// ============================================================
{
  const store = memStore();
  const hint = createTuitionHint({ load: store.load, save: store.save });
  air(hint, 120, { eligible: false });
  check("time with nobody under the lock costs the player nothing",
    hint.spent === 0 && store.value === null,
    `two minutes of ineligible time and the hint has spent ${hint.spent} of its ${FOE_HINT.airings} airings`);
  const a = air(hint, FOE_HINT.seconds + FOE_HINT.fade + 1);
  check("and the airing then runs in full when the line is finally up",
    a.lastVisible >= FOE_HINT.seconds - 0.05,
    `${a.lastVisible.toFixed(2)}s of reading time against ${FOE_HINT.seconds}s`);
}

// ============================================================
// 4. IT COMES BACK FOR A PLAYER WHO HAS NOT LEARNED IT — AND THEN STOPS ASKING.
// ============================================================
{
  const store = memStore();
  const runs = [];
  for (let i = 0; i < FOE_HINT.airings + 2; i++) {
    // A new page each time: a fresh hint over the same device store, which is
    // what "he came back tomorrow" actually is.
    const hint = createTuitionHint({ load: store.load, save: store.save });
    const a = air(hint, FOE_HINT.seconds + FOE_HINT.fade + 1);
    runs.push(a.everVisible);
  }
  check("IT COMES BACK for a player who has not learned it, and then never again",
    runs.slice(0, FOE_HINT.airings).every(Boolean)
    && runs.slice(FOE_HINT.airings).every((v) => v === false),
    `airings across ${runs.length} sessions: ${runs.map((v) => (v ? "shown" : "silent")).join(", ")} — `
    + `store holds "${store.value}"`);
}

// ============================================================
// 5. THE FLICK RETIRES IT — AND THE FLICK IS THE GESTURE, NOT THE SWITCH.
//    This is the whole duel fix in one claim: nobody to switch to, and it still
//    goes, because what the line teaches is the thumb movement.
// ============================================================
{
  const store = memStore();
  const hint = createTuitionHint({ load: store.load, save: store.save });
  const a = air(hint, FOE_HINT.seconds + FOE_HINT.fade + 1, { flickAt: 1.5 });
  check("A FLICK RETIRES IT, with nobody to switch to and no switch ever landing",
    a.lastVisible < 1.5 + 2 / 60 && a.lastAlive < 1.5 + FOE_HINT.fade + 0.05 && a.lastAlive > a.lastVisible,
    `flicked at 1.50s; full opacity ends ${a.lastVisible.toFixed(2)}s, gone by ${(a.lastAlive + 1 / 60).toFixed(2)}s — `
    + `against the shipped rule, where the same flick changes nothing`);
  check("and it never comes back on that device, in this session or the next",
    store.value === "used" && !createTuitionHint({ load: store.load, save: store.save })
      .update(1, true),
    `the device now holds "${store.value}", and a fresh session over the same store draws nothing`);
  const fresh = createTuitionHint({ load: store.load, save: store.save });
  const b = air(fresh, 60);
  check("a minute of a new match, for a man who has demonstrably learned it: not one frame",
    b.everVisible === false,
    `${b.end.toFixed(0)}s of eligible time, ${b.lastVisible < 0 ? "never" : "still"} shown`);
}

// ============================================================
// 6. THE FADE FINISHES EVEN IF THE FIGHT MOVES ON.
//    A caption frozen half-transparent over the arena because the lock let go
//    mid-fade is a worse artefact than the one this file exists to remove.
// ============================================================
{
  const store = memStore();
  const hint = createTuitionHint({ load: store.load, save: store.save });
  air(hint, FOE_HINT.seconds + 0.05);
  const wasLeaving = hint.phase === "leaving";
  air(hint, FOE_HINT.fade + 0.3, { eligible: false });
  check("the fade completes on real time even after the lock has let go",
    wasLeaving && hint.alive === false,
    `phase was "${wasLeaving ? "leaving" : hint.phase}" when eligibility dropped and is "${hint.phase}" ${FOE_HINT.fade}s later`);
}

// ============================================================
// 7. R1 — PULL THE LEVER. Double the reading time and the number has to move.
//    `beardvolume` gated on a p10 that doubling the thing it named left
//    untouched; the guard against that costs four lines.
// ============================================================
{
  const wide = { seconds: FOE_HINT.seconds * 3, airings: FOE_HINT.airings, fade: FOE_HINT.fade };
  const a = air(createTuitionHint({ terms: FOE_HINT, load: () => null }), FOE_HINT.seconds * 4);
  const b = air(createTuitionHint({ terms: wide, load: () => null }), FOE_HINT.seconds * 4);
  check("tripling the reading time triples how long the line stays",
    b.lastVisible > a.lastVisible * 2.5,
    `${a.lastVisible.toFixed(2)}s at ${FOE_HINT.seconds}s of terms, ${b.lastVisible.toFixed(2)}s at ${wide.seconds}s — `
    + "so the number is read and not decoration");
  const once = { seconds: FOE_HINT.seconds, airings: 1, fade: FOE_HINT.fade };
  const store = memStore();
  const shown = [];
  for (let i = 0; i < 3; i++) {
    shown.push(air(createTuitionHint({ terms: once, load: store.load, save: store.save }),
      FOE_HINT.seconds + FOE_HINT.fade + 1).everVisible);
  }
  check("and cutting the airings to one shows it once",
    shown[0] === true && shown[1] === false && shown[2] === false,
    `three sessions at airings=1: ${shown.map((v) => (v ? "shown" : "silent")).join(", ")}`);
}

// ============================================================
// 8. SOURCE LOCK. Claims 2–7 measure a module. These are the lines that say the
//    GAME is wired to it — the house rule is not to reason from source, and this
//    is the exception that admits it. Without them every claim above could pass
//    against a fix no player receives.
// ============================================================
const inputSrc = readFileSync(resolve(ROOT, "src/game/client/input.ts"), "utf8");
const gestureCounted = /export function requestTargetSwitch[\s\S]{0,400}?lock\.flicks\+\+/.test(inputSrc);
check("input.ts counts the GESTURE in requestTargetSwitch, before it goes looking for a man",
  gestureCounted,
  gestureCounted ? "the flick is counted where the thumb is read" : "the counter is still downstream of finding somebody");
const publishesFlicks = /\$\{lock\.switches\}\|\$\{lock\.flicks\}/.test(inputSrc);
check("and it publishes that count to the HUD on the same frame",
  publishesFlicks,
  publishesFlicks ? "the lock snapshot carries `<id>|<switches>|<flicks>`" : "the HUD cannot hear about a flick");

const hudSrc = readFileSync(resolve(ROOT, "src/game/client/GameHud.tsx"), "utf8");
const usesModule = /@\/game\/tuition\.mjs/.test(hudSrc) && /createTuitionHint\(/.test(hudSrc) && /foeHintUp\.alive/.test(hudSrc);
// The DECLARATION, not the word: the comment above the line records what the
// old rule was and why it could not work, and `docs/PROCESS.md` R7 says a
// comment and its code are one artefact — deleting the history to satisfy a
// regex would be this harness editing the reasoning out of the file.
const noOldRule = !/const hasSwitched\b/.test(hudSrc);
check("GameHud.tsx draws the line off this module and no longer off a switch that landed",
  usesModule && noOldRule,
  usesModule
    ? (noOldRule ? "wired, and `hasSwitched` is gone as a value — it survives only in the comment that records why it failed"
      : "wired, but `hasSwitched` is still declared and something is still reading it")
    : "the HUD is not on the seam this harness tests");

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`
  + `  —  ${FOE_HINT.seconds}s of reading time, ${FOE_HINT.airings} airings ever, ${FOE_HINT.fade}s to leave,`
  + ` and one flick — landed or not — ends it for good on that device ("${FOE_HINT_KEY}").`);
process.exit(failed.length ? 1 : 0);
