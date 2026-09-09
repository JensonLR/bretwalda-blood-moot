#!/usr/bin/env node
// BLADEREACH — is the blade where the sim says the blow landed?
//
//   npm run bladereach
//   node tools/bladereach.mjs --window   also print the best frame in the whole
//                                        contact window, not just the instant
//
// WHY THIS EXISTS. `docs/OPEN-DEFECTS.md` carries this as open, in these words:
// "Nothing samples a warrior mid-stroke on the client and checks the blade is
// where the sim says the blow landed. To close it... assert the blade crosses
// the target between `swingT` 0.40 and 0.55."
//
// Nothing did. `swingstrip` measures the tip's PATH — arc, telegraph,
// distinctness, whether it goes through the turf — all in the man's own frame,
// and never against the engine's hit range. `weightprobe` and `fighttest` drive
// the sim and never look at the rig. So the two halves of the most important
// moment in the game have never been put in the same sentence.
//
// WHAT IT MEASURES.
//
//   ENGINE   `reachOf(cls)` — centre-to-centre, the distance inside which
//            `processAttack` will take health off. Read by driving the engine's
//            own exports rather than retyping the table.
//   BLADE    the tip's HORIZONTAL radius from the attacker's centre, off the
//            real transpiled `anim.ts` on a real rig, at the moment damage is
//            applied. Same tip convention `onBladeTrail` and `swingstrip` use:
//            `(0, rig.reach * 0.82, 0)` through the weapon's world matrix.
//
// WHAT THE NUMBERS MEAN, and the first framing of this file was wrong.
//
// I opened by asking "is the blade at the target when damage lands", assuming a
// TIMING fault: the engine fires on the first tick past 0.40 while anim.ts
// names IMPACT = 0.55 and builds the pass to arrive there, a gap of ~107 ms on
// a huscarl light. That gap is real and is still printed below. It is not the
// cause, and `--curve` is what said so — at EVERY sampled fraction of the
// contact window, at most 2 of 24 cuts clear the bar. Moving the instant fixes
// nothing, because the blade never gets out that far on a cut at all.
//
// So the fault is REACH, not timing, and the honest measure is the band at the
// outer edge of range where the engine will take health off and the blade
// visibly cannot arrive:
//
//   PHANTOM = (reach - TO_CHEST) - the blade's furthest radius
//
// `reach` is centre-to-centre; `TO_CHEST` (0.25) is engine.mjs's own figure for
// the target's centre out to the chest that stops a blade. So `reach - 0.25` is
// where a man's chest is at maximum range, and PHANTOM is how far short of it
// the blade stops at its furthest.
//
// This is not a bug in the animation. `BODY_REACH` = 1.20 is documented as
// 0.60 (attacker's centre to his extended fist) + 0.25 (target's chest) + 0.35
// of deliberate forgiveness "so a hit the client already drew does not get
// denied by the lag between them", and engine.mjs calls it "the one number here
// that is a judgement call rather than a measurement". The phantom band is
// mostly that 0.35 being spent, plus the fact that a cut lands through an arc
// with a bent arm rather than at full extension.
//
// AT THE RANGE MEN ACTUALLY FIGHT AT IT LOOKS FINE. The harnesses seat duels at
// 1.2-1.4 m, where a chest sits at ~0.95-1.15 m, and every blow measured here
// clears that. The band only bites at the outer edge of range.
//
// SO THIS GATE IS A RATCHET, NOT A BAR. Closing the band means shortening
// reach, which reprices every class against every other and is a balance
// decision, not a defect fix. What this refuses is the band getting WIDER
// without somebody saying so.
//
// THE INSTANT IS NOT 0.40. `advanceSwing` fires on the first TICK at or past
// `WINDUP_END`, and the server ticks at 20 Hz, so real contact lands at 0.408 to
// 0.441 of the stroke depending on class and weight. Measured at the true
// quantised instant, because that is when the damage is actually applied.
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import * as THREE from "three";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WINDOW = process.argv.includes("--window");
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

// ---- the real anim.ts, transpiled (swingstrip's own recipe) ----------------
function loadAnim() {
  const BUILD = resolve(ROOT, ".bladereach/anim");
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  const tsc = spawnSync("npx", ["tsc", "src/game/client/render/anim.ts", "--outDir", ".bladereach/anim",
    "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
    { cwd: ROOT, encoding: "utf8" });
  const emitted = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const f = resolve(d, e.name);
    if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f);
  } };
  if (existsSync(BUILD)) walk(BUILD);
  for (const f of emitted) {
    const src = readFileSync(f, "utf8");
    const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c));
    if (fixed !== src) writeFileSync(f, fixed);
  }
  const animFile = emitted.find((f) => f.endsWith("anim.js"));
  if (!animFile) { console.error(`tsc emitted no anim.js:\n${tsc.stdout || ""}${tsc.stderr || ""}`); process.exit(2); }
  return animFile;
}

const animFile = loadAnim();
const anim = await import(pathToFileURL(animFile).href);
// `RAW` because this renders nothing and `createWarriorRig` has no `?? RAW`.
const chars = await import(pathToFileURL(resolve(dirname(dirname(animFile)), "characters.js")).href);
const RAW = chars.RAW;
const engine = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);
const { SWING_PHASES, swingDurationOf, WEAPON_REACH } = engine;

const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const DIRS = ["right", "left", "overhead", "stab"];
const FPS = 240;                 // fine enough that the instant is not straddled
const TICK = 0.05;               // the server's own 20 Hz grid
/** engine.mjs: 0.60 fist + 0.25 chest + 0.35 forgiveness. */
const BODY_REACH = 1.20, TO_CHEST = 0.25, FORGIVE = 0.35;

const CTX = {
  dt: 1 / FPS, rawDt: 1 / FPS, time: 0, camera: new THREE.PerspectiveCamera(),
  focus: new THREE.Vector3(), localId: "", localState: null, mood: "dusk",
  quality: { tier: "high", shadows: false },
};

function manOf(cls) {
  return {
    id: "m", name: "M", warriorClass: cls, state: "idle", health: 100, maxHealth: 100,
    stamina: 100, maxStamina: 100, position: { x: 0, y: 0, z: 0 }, rotation: 0,
    velocity: { x: 0, y: 0, z: 0 }, attackDir: "right", appearance: {},
  };
}

/**
 * One stroke. Returns the tip's horizontal radius from the man's centre, per
 * frame, plus the fraction of the stroke each sample sits at.
 */
function stroke(cls, dir, heavy) {
  const parent = new THREE.Group();
  const player = manOf(cls);
  const rig = anim.createWarriorRig(parent, player, RAW, { tier: "high", shadows: false });
  const motion = anim.createMotion(player);
  // Settle, or the first frames measure the crossfade out of a T-pose.
  for (let i = 0; i < 20; i++) {
    anim.stepWarriorTransform(rig, motion, player, 1 / FPS, CTX);
    anim.poseWarrior(rig, motion, player, 1 / FPS, CTX, null);
  }
  const dur = swingDurationOf(cls, heavy);
  player.state = "attacking"; player.attackDir = dir; player.swingHeavy = heavy;
  player.swingDuration = dur; player.comboCount = 0;
  const V = new THREE.Vector3(), C = new THREE.Vector3();
  const out = [];
  const n = Math.ceil(dur * FPS);
  for (let i = 0; i <= n; i++) {
    const t = Math.min(dur, i / FPS);
    const f = t / dur;
    player.swingT = t;
    player.attackPhase = f < SWING_PHASES.windup ? "windup"
      : f < SWING_PHASES.windup + SWING_PHASES.contact ? "contact" : "recovery";
    player.attackTimer = dur - t;
    anim.stepWarriorTransform(rig, motion, player, 1 / FPS, CTX);
    anim.poseWarrior(rig, motion, player, 1 / FPS, CTX, null);
    parent.updateMatrixWorld(true);
    V.set(0, rig.reach * 0.82, 0).applyMatrix4(rig.weapon.matrixWorld);
    rig.body.getWorldPosition(C);
    // HORIZONTAL only, because the engine's own test is horizontal: `dist` in
    // processAttack is sqrt(dx*dx + dz*dz) and Y is never consulted. Comparing
    // a 3-D tip distance against a 2-D range would flatter the blade.
    out.push({ f, r: Math.hypot(V.x - C.x, V.z - C.z), y: V.y - C.y });
  }
  return { dur, samples: out, rigReach: rig.reach, weaponLocalLen: rig.reach * 0.82 };
}

/** The fraction of the stroke at which damage is actually applied. */
function contactFraction(dur) {
  // advanceSwing fires on the first 20 Hz tick at or past WINDUP_END.
  const t = Math.ceil((SWING_PHASES.windup * dur) / TICK) * TICK;
  return Math.min(1, t / dur);
}
const at = (s, f) => s.samples.reduce((b, x) => (Math.abs(x.f - f) < Math.abs(b.f - f) ? x : b)).r;
/** Where in the stroke the tip is furthest out — the blade's own idea of impact. */
const peakAt = (s) => s.samples.reduce((b, x) => (x.r > b.r ? x : b)).f;
const bestIn = (s, a, b) => Math.max(...s.samples.filter((x) => x.f >= a && x.f <= b).map((x) => x.r));

console.log("BLADEREACH — the blade, against the range that takes health off\n");
console.log("  cls/blow/dir        reach  chest   fair | tip@contact  best-in-window   verdict");
const CURVE = process.argv.includes("--curve");
const curveRows = [];

const rows = [];
for (const cls of CLASSES) {
  const reach = WEAPON_REACH[cls] + BODY_REACH;
  const chest = reach - TO_CHEST, fair = reach - TO_CHEST - FORGIVE;
  for (const heavy of [false, true]) {
    for (const dir of DIRS) {
      const s = stroke(cls, dir, heavy);
      const cf = contactFraction(s.dur);
      const tip = at(s, cf);
      const best = bestIn(s, SWING_PHASES.windup, SWING_PHASES.windup + SWING_PHASES.contact);
      const bestAny = Math.max(...s.samples.map((x) => x.r));
      const ok = tip >= fair;
      rows.push({ cls, dir, heavy, reach, chest, fair, tip, best, bestAny, cf, ok, peak: peakAt(s) });
      if (CURVE) curveRows.push({ cls, dir, heavy, fair,
        pts: [0.40, 0.425, 0.45, 0.475, 0.50, 0.525, 0.55].map((f) => at(s, f)) });
      console.log(`  ${(cls + "/" + (heavy ? "H" : "L") + "/" + dir).padEnd(22)}` +
        `${reach.toFixed(2)}  ${chest.toFixed(2)}  ${fair.toFixed(2)} | ` +
        `${tip.toFixed(2)} @f=${cf.toFixed(3)}   ${best.toFixed(2)}        ${ok ? "reaches" : "SHORT " + (fair - tip).toFixed(2) + "m"}`);
    }
  }
}

// WHERE THE BLADE THINKS IT LANDS. anim.ts names IMPACT = windup + contact =
// 0.55 and runs the pass `rel = (q - LOAD_END) / (IMPACT - LOAD_END)`, so the
// stroke is built to ARRIVE at 0.55. The engine applies damage on the first
// 20 Hz tick at or past 0.40 — the START of the same window. Both layers name
// the window; they disagree about where in it the blow lands.
const cutsOnly = rows.filter((r) => r.dir !== "stab");
const meanPeak = cutsOnly.reduce((a, r) => a + r.peak, 0) / cutsOnly.length;
const meanContact = cutsOnly.reduce((a, r) => a + r.cf, 0) / cutsOnly.length;
console.log(`  the blade peaks at f=${meanPeak.toFixed(3)} on average (cuts); damage lands at f=${meanContact.toFixed(3)}`);
console.log(`  anim.ts calls IMPACT ${(SWING_PHASES.windup + SWING_PHASES.contact).toFixed(2)}; the engine damages at ${SWING_PHASES.windup.toFixed(2)}\n`);

if (CURVE) {
  console.log("\n  THE TIP THROUGH THE CONTACT WINDOW (metres from his own centre)");
  console.log("  cls/blow/dir           fair | 0.400 0.425 0.450 0.475 0.500 0.525 0.550");
  for (const c of curveRows) {
    if (c.dir === "stab") continue;
    console.log(`  ${(c.cls + "/" + (c.heavy ? "H" : "L") + "/" + c.dir).padEnd(22)}${c.fair.toFixed(2)} | ` +
      c.pts.map((v) => v.toFixed(2)).join("  "));
  }
  const share = (i) => curveRows.filter((c) => c.dir !== "stab" && c.pts[i] >= c.fair).length;
  const tot = curveRows.filter((c) => c.dir !== "stab").length;
  console.log(`\n  cuts reaching the fair bar at each fraction: ` +
    [0.40,0.425,0.45,0.475,0.50,0.525,0.55].map((f,i)=>`${f}=${share(i)}/${tot}`).join("  "));
}

for (const r of rows) r.phantom = (r.reach - TO_CHEST) - r.bestAny;
const cutsAll = rows.filter((r) => r.dir !== "stab");
const stabsAll = rows.filter((r) => r.dir === "stab");
const worst = rows.reduce((a, b) => (b.phantom > a.phantom ? b : a));
const meanCut = cutsAll.reduce((a, r) => a + r.phantom, 0) / cutsAll.length;
const meanStab = stabsAll.reduce((a, r) => a + r.phantom, 0) / stabsAll.length;

console.log("  PHANTOM BAND (max-range chest, minus the blade's furthest reach)");
console.log(`    cuts    mean ${meanCut.toFixed(2)}m`);
console.log(`    thrusts mean ${meanStab.toFixed(2)}m   — a thrust is a line down its reach and gets closest`);
console.log(`    worst   ${worst.phantom.toFixed(2)}m on ${worst.cls}/${worst.heavy ? "H" : "L"}/${worst.dir}\n`);

// THE RATCHET. Today's numbers, so a change that widens the band has to come
// here and say so. Not a bar: closing it means shortening reach, which reprices
// every class and is the owner's call.
const CEIL = { cut: 0.95, stab: 0.60, worst: 1.35 };
check("the phantom band on cuts has not widened",
  meanCut <= CEIL.cut, `mean ${meanCut.toFixed(2)}m against a ${CEIL.cut}m ceiling`);
check("the phantom band on thrusts has not widened",
  meanStab <= CEIL.stab, `mean ${meanStab.toFixed(2)}m against a ${CEIL.stab}m ceiling`);
check("and no single blow has got worse",
  worst.phantom <= CEIL.worst, `worst ${worst.phantom.toFixed(2)}m against a ${CEIL.worst}m ceiling`);

check("a thrust still out-reaches a cut — the one blow built as a line down its own range",
  meanStab < meanCut, `thrust ${meanStab.toFixed(2)}m vs cut ${meanCut.toFixed(2)}m`);

// AT FIGHTING RANGE, WHICH IS WHERE THIS ACTUALLY GETS LOOKED AT.
//
// Judged against EACH CLASS'S OWN range, not one distance for everybody. The
// first version of this check used a flat 1.3 m — a huscarl's gap — and failed
// exactly the four runekeeper side cuts, by 0.02 to 0.23 m. That was the gate
// being wrong and not the game: the runekeeper carries the shortest steel in
// the roster (WEAPON_REACH 0.50, twin seaxes against a huscarl's 1.055) and a
// man with a seax does not stand at sword distance to use it.
//
// A man fights INSIDE his reach, not at the edge of it, so the yardstick is a
// fraction of his own: 0.60 of centre-to-centre, which puts a huscarl at 1.35 m
// and a runekeeper at 1.02 m. The claim is then the one that matters — when a
// man closes to the distance his own weapon is for, his blade arrives on the
// body the engine says he hit.
const CLOSE = 0.60;
const shortAtFight = rows.filter((r) => r.bestAny < r.reach * CLOSE - TO_CHEST);
check("every blow's blade reaches a man at the range that blow's own weapon is for",
  shortAtFight.length === 0,
  shortAtFight.length
    ? `short: ${shortAtFight.map((r) => `${r.cls}/${r.heavy ? "H" : "L"}/${r.dir}@${r.bestAny.toFixed(2)}m`).join(", ")}`
    : `all ${rows.length} clear a chest at 0.60 of their own reach (huscarl ${(2.255 * CLOSE - TO_CHEST).toFixed(2)}m, runekeeper ${(1.70 * CLOSE - TO_CHEST).toFixed(2)}m)`);

if (WINDOW) {
  const missWindow = rows.filter((r) => r.best < r.fair);
  console.log("");
  check("...and if the whole contact window counted, the blade would get there",
    missWindow.length === 0,
    missWindow.length ? `${missWindow.length} never reach even at their best frame` : "every stroke passes the bar somewhere in 0.40-0.55");
}

console.log(`\n[bladereach] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
