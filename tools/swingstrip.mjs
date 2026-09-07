#!/usr/bin/env node
// ============================================================================
// SWINGSTRIP — a ruler for STROKES, and a picture of them.
//
//   node tools/swingstrip.mjs            (or: npm run swingstrip)
//   node tools/swingstrip.mjs --draw     ...and write the stick strips
//
// WHY THIS EXISTS. The owner, 7 Sep 2026: "look into all the fighting & combat
// animations & controls. This is the most important goal of the project,
// gameplay is everything now." Every argument about a swing in this repository
// so far has been made in prose or in a browser capture, and neither can answer
// the question that actually matters: IS THIS BLOW A DIFFERENT BLOW FROM THAT
// ONE, or is it the same stroke with a multiplier on it.
//
// It can be answered, and this answers it. `chain.ts` is the swing table and
// `anim.ts` turns it into bone rotations; run those against a real rig with no
// GPU and no browser, sample the WEAPON TIP every frame, and a stroke becomes a
// path in space you can measure.
//
// WHAT IT MEASURES, per stroke:
//
//   arc      metres the tip travels through the whole swing. How big the blow is.
//   high     the highest the tip gets, in metres off the turf.
//   low      the lowest. An overhead that never goes over the head and a sweep
//            that never gets below the ribs are the same blow wearing two names.
//   wind     THE TELEGRAPH. How far the tip travels AWAY from the target before
//            it comes forward. This is the whole of what an opponent reads, and
//            a blow with no windup is a blow nobody can answer.
//   speed    tip speed at the contact frame, m/s. What the blow arrives with.
//   step     ground the hips cover. A stroke that moves the man is a stroke
//            that changes the fight's geometry.
//
// AND THE ONE THAT IS NOT A SIZE: `shape`, the divergence between two strokes
// after BOTH have been normalised — each path centred on its own start and
// divided by its own arc length. It is therefore blind to "bigger" and "slower"
// and sees only "different". Two strokes that differ by a gain constant score
// near zero however far apart their arc lengths are.
//
// THE FINDING IT WAS BUILT FOR is in section 2. A heavy attack is authored as
// `gain = 1 + heavy * 0.24` over the light stroke and a swing 25% longer: one
// animation serving the two most important reads in the game.
//
// It runs the real code. `anim.ts` is transpiled and imported, the same way
// `gravitytest` does it, so nothing here is a second opinion about the poses.
// ============================================================================
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import * as THREE from "three";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRAW = process.argv.includes("--draw");
const OUT = resolve(ROOT, ".swingstrip");

let pass = 0, fail = 0;
const say = (m) => console.log(m);
const check = (name, ok, detail = "") => {
  if (ok) { pass++; say(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; say(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

// ---- the real anim.ts, transpiled ------------------------------------------
function loadAnim() {
  const BUILD = resolve(ROOT, ".swingstrip/anim");
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  const tsc = spawnSync("npx", ["tsc", "src/game/client/render/anim.ts", "--outDir", ".swingstrip/anim",
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
  if (!animFile) { say(`  tsc emitted no anim.js:\n${tsc.stdout || ""}${tsc.stderr || ""}`); process.exit(1); }
  return animFile;
}

const animFile = loadAnim();
const anim = await import(pathToFileURL(animFile).href);
// `RAW` for the same reason `wearmeasure` and `gravitytest` take it: this
// harness renders nothing, and `createWarriorRig` has no `?? RAW` of its own.
const chars = await import(pathToFileURL(resolve(dirname(dirname(animFile)), "characters.js")).href);
const RAW = chars.RAW;
const engine = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);
const { SWING_PHASES, swingDurationOf, WARRIOR_STATS } = engine;

const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const DIRS = ["overhead", "right", "left", "stab"];
// The sample rate. `--fps=240` is a DIAGNOSTIC, not a setting: a genuinely fast
// rotation reports about the same metres-per-second however finely it is
// sampled, and a DISCONTINUITY — a pose that jumps between two frames — reports
// a speed that climbs with the rate, because the distance is fixed and the
// interval is not. It is how "the blade is moving fast" was told apart from
// "the blade teleports".
const FPS_REF = { v: Number((process.argv.find((a) => a.startsWith("--fps=")) || "").slice(6)) || 60 };

function manOf(cls) {
  return {
    id: `m_${cls}`, name: "Probe", warriorClass: cls, team: "none",
    position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, rotation: 0,
    health: WARRIOR_STATS[cls].health, maxHealth: WARRIOR_STATS[cls].health,
    stamina: 100, maxStamina: 100, state: "idle", attackDir: "right", blockDir: "right",
    attackTimer: 0, blockTimer: 0, dodgeTimer: 0, staggerTimer: 0, hitstop: 0,
    abilityCooldown: 0, abilityActive: false, abilityTimer: 0, invincible: false,
    kills: 0, deaths: 0, damage: 0, score: 0, lastHitBy: "", comboCount: 0, comboTimer: 0,
    appearance: chars.defaultAppearance(cls),
    swingT: 0, swingDuration: 0, swingHeavy: false, attackPhase: null,
  };
}

const CTX = {
  dt: 1 / 60, rawDt: 1 / 60, time: 0, camera: new THREE.PerspectiveCamera(),
  focus: new THREE.Vector3(), localId: "", localState: null, mood: "dusk",
  quality: { tier: "high", shadows: false },
};

/**
 * One stroke, sampled. Returns the tip path in the man's OWN frame (he faces
 * +z, so +z is toward the target and +y is up), plus the hips.
 */
function sample(cls, dir, heavy, combo) {
  const parent = new THREE.Group();
  const player = manOf(cls);
  const rig = anim.createWarriorRig(parent, player, RAW, { tier: "high", shadows: false });
  const motion = anim.createMotion(player);
  // Settle him: a swing thrown from a T-pose measures the crossfade, not the
  // stroke. Twenty frames of idle is past every layer weight's ramp.
  const FPS0 = FPS_REF.v;
  CTX.dt = 1 / FPS0; CTX.rawDt = 1 / FPS0;
  for (let i = 0; i < 20; i++) {
    anim.stepWarriorTransform(rig, motion, player, 1 / FPS0, CTX);
    anim.poseWarrior(rig, motion, player, 1 / FPS0, CTX, null);
  }
  // HIS OWN HEAD, measured off the settled rig — not `rig.headTop`, which is
  // where the HUD hangs a nameplate and sits a clear 40 cm above the skull. A
  // bar built on it asked every man to swing half a metre higher than he needs
  // to and failed three of the four for clearing their own heads properly.
  parent.updateMatrixWorld(true);
  const crown = rig.pivots.head.getWorldPosition(new THREE.Vector3()).y;
  const dur = swingDurationOf(cls, heavy);
  player.state = "attacking";
  player.attackDir = dir;
  player.swingHeavy = heavy;
  player.swingDuration = dur;
  player.comboCount = combo;
  const frames = [];
  const V = new THREE.Vector3();
  const FPS = FPS_REF.v;
  CTX.dt = 1 / FPS; CTX.rawDt = 1 / FPS;
  const n = Math.ceil(dur * FPS);
  for (let i = 0; i <= n; i++) {
    const t = Math.min(dur, i / FPS);
    player.swingT = t;
    const f = t / dur;
    player.attackPhase = f < SWING_PHASES.windup ? "windup"
      : f < SWING_PHASES.windup + SWING_PHASES.contact ? "contact" : "recovery";
    player.attackTimer = dur - t;
    anim.stepWarriorTransform(rig, motion, player, 1 / FPS, CTX);
    anim.poseWarrior(rig, motion, player, 1 / FPS, CTX, null);
    parent.updateMatrixWorld(true);
    // The tip, by the same convention `onBladeTrail` uses.
    V.set(0, rig.reach * 0.82, 0).applyMatrix4(rig.weapon.matrixWorld);
    const tip = [V.x, V.y, V.z];
    // THE FIST, so a fast TIP can be told from a fast MAN. The weapon group's
    // own origin is the grip: if the fist is walking and the tip is flying, the
    // speed is in the wrist solve and not in the body.
    rig.weapon.getWorldPosition(V);
    const fist = [V.x, V.y, V.z];
    let board = null;
    if (rig.shield) { rig.shield.getWorldPosition(V); board = [V.x, V.y, V.z]; }
    rig.body.getWorldPosition(V);
    // The solved wrist angle itself, so a tip that teleports can be traced to
    // the joint that teleported it.
    const wrist = rig.weapon.rotation.x;
    frames.push({ t, f, tip, fist, board, wrist, hip: [V.x, V.y, V.z], phase: player.attackPhase });
  }
  return { cls, dir, heavy, combo, dur, frames, crown, fps: FPS };
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function measure(s) {
  const FPS = s.fps || 60;
  const f = s.frames;
  let arc = 0, high = -Infinity, low = Infinity, wind = 0, step = 0;
  for (let i = 1; i < f.length; i++) arc += dist(f[i].tip, f[i - 1].tip);
  for (const x of f) { high = Math.max(high, x.tip[1]); low = Math.min(low, x.tip[1]); }
  // THE TELEGRAPH, AND IT TOOK TWO WRONG DEFINITIONS TO GET HERE.
  //
  // FIRST it measured how far the tip went BACKWARD along the man's facing,
  // which is only the telegraph of an overhead: a backhand winds ACROSS the
  // body and scored 0.00 m, so the ruler reported that half the game's strokes
  // had no windup when what it had found was that half of them do not wind up
  // in the one direction it was looking.
  //
  // SECOND it projected the windup onto the strike's own axis. That reads a
  // backhand correctly and is unstable in exactly the case it exists for: when
  // the LOAD changes — which is what a heavy is — the axis rotates under it,
  // and a heavy overhead with a visibly deeper cock measured SHALLOWER than its
  // light. A ruler whose reading moves because the thing it measures changed
  // shape is measuring the shape.
  //
  // What an opponent actually reads is not a direction. It is that the blade is
  // GOING SOMEWHERE ELSE, for a while, before it comes for him. So: the arc
  // length the tip covers during the windup phase. Direction-free, monotone in
  // how much the man is telling you, and it cannot be rotated out from under.
  for (let i = 1; i < f.length; i++) {
    if (f[i].f > SWING_PHASES.windup) break;
    wind += dist(f[i].tip, f[i - 1].tip);
  }
  step = Math.hypot(f[f.length - 1].hip[0] - f[0].hip[0], f[f.length - 1].hip[2] - f[0].hip[2]);
  // Tip speed at the contact frame.
  const ci = f.findIndex((x) => x.phase === "contact");
  const speed = ci > 0 ? dist(f[ci].tip, f[ci - 1].tip) * FPS : 0;
  // AND THE FASTEST THE TIP EVER GOES. A stroke authored by multiplying its
  // load can cross the whole arc in three frames and read as a teleport rather
  // than a blow — the load got deeper, the clock did not.
  let peak = 0, peakAt = 0, fistPeak = 0;
  for (let i = 1; i < f.length; i++) {
    const v = dist(f[i].tip, f[i - 1].tip) * FPS;
    if (v > peak) { peak = v; peakAt = f[i].f; }
    fistPeak = Math.max(fistPeak, dist(f[i].fist, f[i - 1].fist) * FPS);
  }
  return { arc, high, low, wind, step, speed, peak, peakAt, fistPeak, dur: s.dur };
}

/**
 * HOW DIFFERENT TWO STROKES ARE, blind to size and to tempo.
 *
 * Both paths are resampled to the same number of points by ARC-LENGTH fraction
 * (so a slower stroke is not penalised), each is moved so its own first point
 * is the origin, and each is divided by its own total arc length. What is left
 * is the SHAPE. Two strokes that differ only by a gain constant land on top of
 * each other and score ~0; two genuinely different blows do not.
 */
function shapeDiff(a, b, n = 24) {
  const norm = (s) => {
    const f = s.frames;
    const cum = [0];
    for (let i = 1; i < f.length; i++) cum.push(cum[i - 1] + dist(f[i].tip, f[i - 1].tip));
    const total = cum[cum.length - 1] || 1;
    const out = [];
    for (let k = 0; k < n; k++) {
      const want = (k / (n - 1)) * total;
      let i = 1;
      while (i < cum.length - 1 && cum[i] < want) i++;
      const span = (cum[i] - cum[i - 1]) || 1;
      const u = (want - cum[i - 1]) / span;
      const p = f[i - 1].tip, q = f[i].tip;
      out.push([
        (p[0] + (q[0] - p[0]) * u - f[0].tip[0]) / total,
        (p[1] + (q[1] - p[1]) * u - f[0].tip[1]) / total,
        (p[2] + (q[2] - p[2]) * u - f[0].tip[2]) / total,
      ]);
    }
    return out;
  };
  const A = norm(a), B = norm(b);
  let worst = 0;
  for (let k = 0; k < n; k++) worst = Math.max(worst, dist(A[k], B[k]));
  return worst;
}

/** Side elevation of the tip path, one panel a stroke. Not a render. */
function writeStrip(strokes, path, caption) {
  const W = 190, H = 210, PAD = 8, SCALE = 62;
  const ox = W * 0.42, oy = H - 26;
  const X = (z) => ox + z * SCALE, Y = (y) => oy - y * SCALE;
  const panels = strokes.map((s, i) => {
    const x0 = PAD + i * (W + PAD);
    const pts = s.frames.map((f) => `${X(f.tip[2]).toFixed(1)},${Y(f.tip[1]).toFixed(1)}`).join(" ");
    const dots = s.frames.filter((_, k) => k % 6 === 0)
      .map((f) => `<circle cx="${X(f.tip[2]).toFixed(1)}" cy="${Y(f.tip[1]).toFixed(1)}" r="1.6" `
        + `fill="${f.phase === "contact" ? "#e07a3a" : f.phase === "windup" ? "#5a7fa8" : "#4a4a4a"}"/>`).join("");
    const m = measure(s);
    return `<g transform="translate(${x0},${PAD})">`
      + `<rect width="${W}" height="${H}" fill="#141414" stroke="#2a2a2a"/>`
      + `<line x1="0" y1="${Y(0)}" x2="${W}" y2="${Y(0)}" stroke="#333"/>`
      + `<line x1="${X(0)}" y1="0" x2="${X(0)}" y2="${H}" stroke="#262626"/>`
      + `<polyline points="${pts}" fill="none" stroke="#c8b48a" stroke-width="1.3"/>${dots}`
      + `<text x="6" y="14" fill="#c8b48a" font-family="monospace" font-size="10">`
      + `${s.cls} ${s.heavy ? "HEAVY" : "light"} ${s.dir}${s.combo > 1 ? ` #${s.combo}` : ""}</text>`
      + `<text x="6" y="${H - 6}" fill="#7a7a7a" font-family="monospace" font-size="9">`
      + `arc ${m.arc.toFixed(2)}m hi ${m.high.toFixed(2)} wind ${m.wind.toFixed(2)}</text></g>`;
  }).join("");
  const w = PAD + strokes.length * (W + PAD), h = H + PAD * 2 + 20;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`
    + `<rect width="${w}" height="${h}" fill="#0b0b0b"/>${panels}`
    + `<text x="${PAD}" y="${h - 6}" fill="#8a8a8a" font-family="monospace" font-size="10">${caption}</text></svg>`);
}

// ---------------------------------------------------------------------------
say("\n[swingstrip] the strokes, measured\n");
say("  Side elevation is the man facing +z. `wind` is how far the tip goes BACK");
say("  before it comes forward — the telegraph, and the whole of what an");
say("  opponent has to read.\n");

const strokes = new Map();
const key = (c, d, h, n) => `${c}|${d}|${h ? "H" : "L"}|${n}`;
for (const cls of CLASSES) {
  for (const dir of DIRS) {
    for (const heavy of [false, true]) {
      for (const combo of [1, 2, 3]) {
        strokes.set(key(cls, dir, heavy, combo), sample(cls, dir, heavy, combo));
      }
    }
  }
}

// ---- 1. THE TABLE ---------------------------------------------------------
say("  class        blow   line       dur    arc    high   low    wind   speed  step");
say("  " + "-".repeat(84));
for (const cls of CLASSES) {
  for (const heavy of [false, true]) {
    for (const dir of DIRS) {
      const m = measure(strokes.get(key(cls, dir, heavy, 1)));
      say(`  ${cls.padEnd(12)} ${(heavy ? "HEAVY" : "light").padEnd(6)} ${dir.padEnd(9)} `
        + `${m.dur.toFixed(2)}  ${m.arc.toFixed(2)}m  ${m.high.toFixed(2)}  ${m.low.toFixed(2)}  `
        + `${m.wind.toFixed(2)}  ${m.speed.toFixed(1)}  ${m.step.toFixed(2)}`);
    }
  }
}

// ---- 2. IS A HEAVY A DIFFERENT BLOW? --------------------------------------
say("\n  2. THE HEAVY AGAINST THE LIGHT — `shape` is blind to size and to tempo.\n");
say("  class        line       arc L->H        wind L->H       shape");
say("  " + "-".repeat(66));
const shapes = [];
for (const cls of CLASSES) {
  for (const dir of DIRS) {
    const L = strokes.get(key(cls, dir, false, 1)), H = strokes.get(key(cls, dir, true, 1));
    const ml = measure(L), mh = measure(H);
    const d = shapeDiff(L, H);
    shapes.push({ cls, dir, d });
    say(`  ${cls.padEnd(12)} ${dir.padEnd(9)} ${ml.arc.toFixed(2)} -> ${mh.arc.toFixed(2)}m   `
      + `${ml.wind.toFixed(2)} -> ${mh.wind.toFixed(2)}m   ${d.toFixed(3)}`);
  }
}
const worstShape = Math.max(...shapes.map((s) => s.d));
const meanShape = shapes.reduce((t, s) => t + s.d, 0) / shapes.length;

// A HEAVY MUST BE A DIFFERENT BLOW, NOT A BIGGER ONE — and the claim is held
// against WHAT IT WAS, not against a number somebody liked.
//
// SHIPPED, measured 7 Sep 2026 before any of this was authored. Every one of
// these is a heavy that was the light stroke with `gain = 1 + heavy * 0.24` on
// it and a swing 25% longer:
const SHIPPED = {
  "huscarl|overhead": 0.039, "huscarl|right": 0.043, "huscarl|left": 0.048, "huscarl|stab": 0.045,
  "warden|overhead": 0.045, "warden|right": 0.084, "warden|left": 0.094, "warden|stab": 0.068,
  "runekeeper|overhead": 0.060, "runekeeper|right": 0.135, "runekeeper|left": 0.120, "runekeeper|stab": 0.179,
  "berserker|overhead": 0.042, "berserker|right": 0.060, "berserker|left": 0.087, "berserker|stab": 0.043,
};
// THE OVERHEAD IS THE HARD CASE AND IT IS NOT AN EXCUSE. A chop is a vertical
// arc whether it is controlled or committed, and this metric divides by the
// stroke's own arc length on purpose — so "the same arc, longer" is exactly
// what it is built NOT to reward, and that is most of what a bigger chop is.
// The shoulder is already at the body's limit on a light overhead (2.78 rad,
// against a 3.14 stop), so a committed one cannot go further back; its
// commitment lives in duration, in follow-through and in the step. Two attempts
// to force the number higher — folding the elbow to drop the blade behind the
// back, and stepping the man further through — both made the STROKE worse and
// were reverted, which is the whole reason this is a floor plus a ratio rather
// than one bar somebody kept nudging.
const SHAPE_FLOOR = 0.085;
const MEAN_BAR = 0.15;
// A DOUBLING WAS THE FIRST FORM OF THIS AND IT WAS THE WRONG SHAPE OF CLAIM.
// The runekeeper's lines shipped at 0.12 to 0.18 — his blade is the shortest in
// the game, so a gain multiplier bent his path further than anyone else's — and
// asking a line that was already good to double is asking the roster, not the
// work. Every line must clear the floor, no line may be LESS different than it
// shipped, and the mean must clear its bar.
const weak = shapes.filter((s) => s.d < Math.max(SHAPE_FLOOR, SHIPPED[`${s.cls}|${s.dir}`] ?? 0));
check("every heavy is a different stroke, none less so than it shipped",
  weak.length === 0 && meanShape >= MEAN_BAR,
  weak.length ? `${weak.length} short: ${weak.map((s) => `${s.cls}/${s.dir} ${s.d.toFixed(3)} (was ${SHIPPED[`${s.cls}|${s.dir}`]})`).join(", ")}`
    : `worst ${Math.min(...shapes.map((s) => s.d)).toFixed(3)} (floor ${SHAPE_FLOOR}), `
      + `mean ${meanShape.toFixed(3)} against a shipped mean of `
      + `${(Object.values(SHIPPED).reduce((a, b) => a + b, 0) / 16).toFixed(3)} (bar ${MEAN_BAR}), `
      + `best ${worstShape.toFixed(3)}`);
const SHAPE_BAR = SHAPE_FLOOR;

// ---- 3. A BLOW HAS TO BE READABLE BEFORE IT LANDS --------------------------
say("");
// Metres of tip path before contact. A blow that shows you less than half a
// metre of blade is a blow that arrives without an argument.
const WIND_BAR = 0.5;
const noWind = [];
for (const cls of CLASSES) {
  for (const dir of DIRS) {
    for (const heavy of [false, true]) {
      const m = measure(strokes.get(key(cls, dir, heavy, 1)));
      if (m.wind < WIND_BAR) noWind.push(`${cls}/${heavy ? "H" : "L"}/${dir} ${m.wind.toFixed(2)}m`);
    }
  }
}
check("every stroke takes the blade back before it brings it forward",
  noWind.length === 0,
  noWind.length ? `${noWind.length} with less than ${WIND_BAR}m of windup: ${noWind.slice(0, 5).join(", ")}`
    : `all 32 strokes wind up at least ${WIND_BAR}m`);

// AND A HEAVY WINDS UP FURTHER THAN A LIGHT. This is the read itself: the
// difference between "he is jabbing" and "he is committing" has to be visible
// in the half-second before the blade moves forward, or the parry window is a
// coin toss.
const shallow = [];
for (const cls of CLASSES) {
  for (const dir of DIRS) {
    const l = measure(strokes.get(key(cls, dir, false, 1))).wind;
    const h = measure(strokes.get(key(cls, dir, true, 1))).wind;
    if (h < l * 1.25) shallow.push(`${cls}/${dir} ${l.toFixed(2)} -> ${h.toFixed(2)}`);
  }
}
check("a heavy's telegraph is a quarter deeper than a light's",
  shallow.length === 0,
  shallow.length ? `${shallow.length} of 16 do not: ${shallow.slice(0, 4).join(", ")}` : "all 16 lines");

// ---- 4. THE FOUR LINES ARE FOUR LINES -------------------------------------
say("");
{
  const bad = [];
  for (const cls of CLASSES) {
    for (const heavy of [false, true]) {
      const pairs = [["overhead", "right"], ["overhead", "left"], ["overhead", "stab"],
        ["right", "left"], ["right", "stab"], ["left", "stab"]];
      for (const [a, b] of pairs) {
        const d = shapeDiff(strokes.get(key(cls, a, heavy, 1)), strokes.get(key(cls, b, heavy, 1)));
        if (d < SHAPE_BAR) bad.push(`${cls}/${heavy ? "H" : "L"} ${a}~${b} ${d.toFixed(3)}`);
      }
    }
  }
  check("the four lines are four different strokes", bad.length === 0,
    bad.length ? `${bad.length} pairs too alike: ${bad.slice(0, 4).join(", ")}` : "48 pairs, all distinct");
}

// ---- 5. AN OVERHEAD GOES OVER, A THRUST GOES FORWARD ----------------------
say("");
{
  const wrong = [];
  for (const cls of CLASSES) {
    for (const heavy of [false, true]) {
      const oh = measure(strokes.get(key(cls, "overhead", heavy, 1)));
      const st = measure(strokes.get(key(cls, "stab", heavy, 1)));
      const side = measure(strokes.get(key(cls, "right", heavy, 1)));
      // Above HIS OWN CROWN, not above a constant. The first cut of this used
      // 1.90 m and failed the runekeeper — who is the shortest man in the game
      // carrying the shortest blade, and whose overhead clears his own head by
      // 30 cm. A bar that reads "too short" for a short man with a short knife
      // is measuring the roster, not the stroke.
      const crown = strokes.get(key(cls, "overhead", heavy, 1)).crown;
      if (oh.high < crown + 0.3) {
        wrong.push(`${cls}/${heavy ? "H" : "L"} overhead peaks at ${oh.high.toFixed(2)}m over a crown of ${crown.toFixed(2)}`);
      }
      // A thrust travels less arc than a cut — it is a line, not a circle.
      if (st.arc >= side.arc) wrong.push(`${cls}/${heavy ? "H" : "L"} thrust arc ${st.arc.toFixed(2)} >= cut ${side.arc.toFixed(2)}`);
    }
  }
  check("an overhead goes over his head and a thrust is a line, not a circle",
    wrong.length === 0, wrong.length ? wrong.slice(0, 4).join("; ") : "8 classes x blows");
}

// ---- 6. A COMMITTED BLOW OPENS THE GUARD ---------------------------------
//
// The cost of a heavy, and the tell for it. A light cut is thrown from BEHIND
// the board — you do not open your guard to hit someone — but a full stroke
// puts a trunk turn and a weight transfer through the blow, and no man does
// that with the other arm holding a shield across his chest. So the board
// swings out, half a second before the blade arrives, and it is visible from
// the FRONT, which the footwork and the hip wind are not.
//
// Measured as how far the board sits off the line between the man and what he
// is hitting — his own +z — at the moment of contact.
say("");
{
  const rows = [], bad = [];
  for (const cls of CLASSES) {
    const L = strokes.get(key(cls, "right", false, 1));
    if (!L.frames[0].board) continue;                 // no board on this man
    const H = strokes.get(key(cls, "right", true, 1));
    const off = (s) => {
      const c = s.frames.find((x) => x.phase === "contact") ?? s.frames[s.frames.length - 1];
      return Math.abs(c.board[0]);
    };
    const l = off(L), h = off(H);
    rows.push(`${cls} ${l.toFixed(2)}m -> ${h.toFixed(2)}m`);
    // 40% wider is a board that has visibly left the line rather than drifted.
    if (h < l * 1.4) bad.push(`${cls} ${l.toFixed(2)} -> ${h.toFixed(2)}`);
  }
  check("a heavy swings the board out of the line, a light does not",
    rows.length >= 1 && bad.length === 0,
    bad.length ? bad.join(", ")
      : `${rows.length} man/men carry a board by default: ${rows.join(", ")}`);
}

// ---- 7. THE BLADE TRAVELS THROUGH THE MAN IT HITS ------------------------
//
// THE DEFECT THIS SECTION WAS BUILT FOR, and it was in the shipping build on
// the game's most-thrown attack. `applyPose` solves the wrist out of an
// ABSOLUTE blade pitch and chose which turn of the circle it meant fresh every
// frame. As the aim swept, the request left the envelope on one side and
// re-entered on the other, and the clamp resolved it by putting the blade on
// the opposite limit in ONE frame. Two adjacent frames of a huscarl's light
// overhead, at 60 fps:
//
//     f=0.474  wrist 2.612  tip [-0.67, 0.46, -0.31]   behind him, low
//     f=0.490  wrist 0.312  tip [ 0.55, 0.70,  1.18]   past him
//
// The sword was behind the man and then it was in front of him. It never
// crossed the space between — which is the space the man he is hitting stands
// in — so there was no contact frame at all. The owner, in the same breath as
// asking for the combat to be looked at: "the contact for hits especially in
// replays".
//
// AND HOW A TELEPORT IS TOLD FROM A FAST BLOW. Sample the same stroke at 60 Hz
// and at 240 Hz. A real rotation reports about the same metres per second
// however finely it is watched; a jump reports a speed that CLIMBS with the
// rate, because the distance is fixed and the interval is not. Held against the
// defect this read 116 m/s at 60 Hz and 403 at 240. That ratio is the gate.
//
// The peak itself is REPORTED and not gated. It is around 65 m/s on an
// overhead — roughly twice a real sword tip, which is a choice about how the
// game's biggest blow reads, and a bar there would be taste wearing a number.
say("");
{
  const fine = new Map();
  const FINE = 240;
  const sampleAt = (cls, dir, heavy, combo, fps) => {
    const wasFps = FPS_REF.v; FPS_REF.v = fps;
    const out = sample(cls, dir, heavy, combo);
    FPS_REF.v = wasFps;
    return out;
  };
  const rows = [], jumpy = [];
  let worstPeak = 0, worstRatio = 0, worstName = "";
  for (const cls of CLASSES) {
    for (const dir of DIRS) {
      for (const heavy of [false, true]) {
        const coarse = measure(strokes.get(key(cls, dir, heavy, 1)));
        const f = measure(sampleAt(cls, dir, heavy, 1, FINE));
        fine.set(key(cls, dir, heavy, 1), f);
        const ratio = f.peak / Math.max(1e-6, coarse.peak);
        worstPeak = Math.max(worstPeak, coarse.peak);
        if (ratio > worstRatio) { worstRatio = ratio; worstName = `${cls}/${heavy ? "H" : "L"}/${dir}`; }
        // 1.6x is generous: a genuine rotation gains a little at a finer rate
        // because the sample lands nearer the true peak. A jump gains 4x.
        if (ratio > 1.6) jumpy.push(`${cls}/${heavy ? "H" : "L"}/${dir} ${coarse.peak.toFixed(0)} -> ${f.peak.toFixed(0)} m/s`);
        rows.push({ cls, dir, heavy, peak: coarse.peak });
      }
    }
  }
  check("no stroke's blade jumps — the tip's speed is the same at 60 Hz and 240 Hz",
    jumpy.length === 0,
    jumpy.length ? `${jumpy.length} jump: ${jumpy.slice(0, 5).join(", ")}`
      : `worst ratio ${worstRatio.toFixed(2)}x on ${worstName}; the defect this replaced read 3.5x`);
  say(`  peak tip speed, REPORTED: worst ${worstPeak.toFixed(0)} m/s (a real sword tip is 25-35).`);
}

// ---- 8. THE WRIST DOES NOT JUMP ------------------------------------------
if (process.argv.includes("--wrist")) {
  const s0 = strokes.get(key("huscarl", "overhead", false, 1));
  say("\n  huscarl light overhead — the solved wrist, frame by frame through contact:");
  for (const fr of s0.frames) {
    if (fr.f < 0.34 || fr.f > 0.62) continue;
    say(`    f=${fr.f.toFixed(3)}  wrist=${fr.wrist.toFixed(3)}  tip=[${fr.tip.map((v) => v.toFixed(2)).join(",")}]`);
  }
}

if (DRAW) {
  for (const cls of CLASSES) {
    writeStrip(DIRS.map((d) => strokes.get(key(cls, d, false, 1))),
      resolve(OUT, `${cls}-light.svg`), `${cls}: the four light lines, tip path, side elevation`);
    writeStrip(DIRS.map((d) => strokes.get(key(cls, d, true, 1))),
      resolve(OUT, `${cls}-heavy.svg`), `${cls}: the four HEAVY lines`);
    writeStrip([1, 2, 3].map((n) => strokes.get(key(cls, "right", false, n))),
      resolve(OUT, `${cls}-chain.svg`), `${cls}: the forehand through a chain`);
  }
  say(`\n  strips written to .swingstrip/`);
}

say(`\n[swingstrip] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
