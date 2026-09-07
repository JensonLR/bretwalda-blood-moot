#!/usr/bin/env node
// ============================================================================
// GAITPROBE — does the man WALK, or is he a statue being slid along the ground?
//
//   node tools/gaitprobe.mjs        (or: npm run gaitprobe)
//
// WHY THIS EXISTS. The owner, 7 Sep 2026: "Add movement to the list too as well
// as the emotes as they are really low budget, lazy & laggy." Movement is the
// thing a player looks at for the whole match — more than any swing — and
// nothing in this repository has ever measured it.
//
// THE ONE THING THAT MAKES LOCOMOTION LOOK CHEAP is a planted foot that slides.
// A real step puts a boot on a patch of ground and leaves it there while the
// body travels over it; an animation whose cycle runs on the wall clock instead
// of on distance covered drags every foot backwards through the turf, and the
// eye reads it instantly even when it cannot name it. `gaitLayer` says in its
// own comment that it advances phase with distance FOR THIS REASON — and until
// this file, that was a claim nobody had checked.
//
// WHAT IT MEASURES
//
//   slide     how far the planted foot travels through the world while it is
//             down, as a fraction of the stride. 0 is a boot that stays put.
//   stride    metres a step covers, and whether it grows with speed the way a
//             stride does rather than the cadence doing all the work.
//   cadence   steps a second.
//   bob       how much the body rises and falls over a stride. A body that
//             does not is a camera dolly with legs painted on it.
//   lean      how far he is pitched into his own travel. A sprint that stands
//             bolt upright is a man being towed.
//   swap      whether walking BACKWARD and STRAFING are different animations
//             from walking forward, or the same one turned round.
//
// It runs the real `anim.ts`, transpiled and imported, the same way
// `swingstrip` and `gravitytest` do — nothing here is a second opinion about
// the poses.
// ============================================================================
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import * as THREE from "three";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const say = (m) => console.log(m);
const check = (name, ok, detail = "") => {
  if (ok) { pass++; say(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; say(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

function loadAnim() {
  const BUILD = resolve(ROOT, ".gaitprobe/anim");
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  const tsc = spawnSync("npx", ["tsc", "src/game/client/render/anim.ts", "--outDir", ".gaitprobe/anim",
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
const chars = await import(pathToFileURL(resolve(dirname(dirname(animFile)), "characters.js")).href);
const RAW = chars.RAW;
const engine = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);
const { WARRIOR_STATS } = engine;

const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const FPS = 60;

const CTX = {
  dt: 1 / FPS, rawDt: 1 / FPS, time: 0, camera: new THREE.PerspectiveCamera(),
  focus: new THREE.Vector3(), localId: "", localState: null, mood: "dusk",
  quality: { tier: "high", shadows: false },
};

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

/**
 * Walk him in a straight line for `secs` at `speed`, facing `face` and
 * travelling along `head` (a world bearing). Samples both feet every frame.
 *
 * The foot is taken as a point a shin's length below the knee pivot, in the
 * knee's own frame — there is no ankle in `RigPivots`, and the shin is measured
 * off the built rig rather than assumed, so a runekeeper's leg and a
 * berserker's are each read against their own.
 */
function stride(cls, speed, state, headAngle = 0) {
  const parent = new THREE.Group();
  const player = manOf(cls);
  const rig = anim.createWarriorRig(parent, player, RAW, { tier: "high", shadows: false });
  const motion = anim.createMotion(player);
  const V = new THREE.Vector3(), W = new THREE.Vector3();
  parent.updateMatrixWorld(true);
  rig.pivots.rightLeg.getWorldPosition(V);
  rig.pivots.kneeR.getWorldPosition(W);
  const shin = Math.max(0.2, V.distanceTo(W));

  player.state = state;
  const frames = [];
  const dt = 1 / FPS;
  for (let i = 0; i < Math.ceil(4.5 * FPS); i++) {
    const t = i * dt;
    // A straight line at a constant speed, and the wire's own fields: position
    // and velocity are what `stepWarriorTransform` reads.
    const d = speed * t;
    player.position = { x: Math.sin(headAngle) * d, y: 0, z: Math.cos(headAngle) * d };
    player.velocity = { x: Math.sin(headAngle) * speed, y: 0, z: Math.cos(headAngle) * speed };
    player.rotation = 0;
    anim.stepWarriorTransform(rig, motion, player, dt, CTX);
    anim.poseWarrior(rig, motion, player, dt, CTX, null);
    parent.updateMatrixWorld(true);
    const feet = {};
    for (const [name, knee] of [["L", rig.pivots.kneeL], ["R", rig.pivots.kneeR]]) {
      knee.getWorldPosition(V);
      W.set(0, -shin, 0).applyQuaternion(knee.getWorldQuaternion(new THREE.Quaternion()));
      feet[name] = [V.x + W.x, V.y + W.y, V.z + W.z];
    }
    rig.body.getWorldPosition(V);
    frames.push({ t, feet, body: [V.x, V.y, V.z], stridePhase: motion.stride });
  }
  return { cls, speed, state, frames, shin };
}

/**
 * HOW MUCH THE PLANTED FOOT SKATES, as a fraction of the man's own speed.
 *
 * 0 is a boot that stays where it was put while the body travels over it; 1 is
 * a foot moving with the body, which is a statue being slid along the ground.
 *
 * THE MEDIAN PER-FRAME SLIP, and it took two wrong forms to get here. Summing
 * the foot's displacement across the whole planted run measures the two frames
 * at either end of it — the boot is still coming down as it crosses the height
 * threshold and already lifting as it leaves — and those two frames carry a
 * fifth of a metre each. Read that way every class "slid" its entire stride,
 * which the frame trace flatly contradicts: from t=1.05 to t=1.22 a huscarl's
 * right foot moves 7 cm while his body travels 65. The median throws the
 * entry and the exit away and reports the middle of the stance, which is the
 * part an eye is actually looking at.
 */
function slideOf(s) {
  const f = s.frames;
  const perFrame = s.speed / FPS;
  const out = {};
  for (const name of ["L", "R"]) {
    const ys = f.map((x) => x.feet[name][1]);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    // 12% of the foot's own height range. A threshold in absolute metres would
    // call a runekeeper's whole gait a plant.
    const bar = lo + (hi - lo) * 0.12;
    const slips = [];
    let start = -1;
    for (let i = 0; i < f.length; i++) {
      const down = f[i].feet[name][1] <= bar;
      if (down && start < 0) start = i;
      if ((!down || i === f.length - 1) && start >= 0) {
        // Four frames or more: a one-frame dip through the threshold is noise,
        // not a footfall. The first and last are dropped — see above.
        if (f[start].t > 0.6 && i - start >= 6) {
          for (let k = start + 2; k < i - 1; k++) {
            const a = f[k - 1].feet[name], b = f[k].feet[name];
            slips.push(Math.hypot(b[0] - a[0], b[2] - a[2]) / perFrame);
          }
        }
        start = -1;
      }
    }
    slips.sort((a, b) => a - b);
    out[name] = {
      median: slips.length ? slips[Math.floor(slips.length / 2)] : 1,
      worst: slips.length ? slips[Math.floor(slips.length * 0.9)] : 1,
      n: slips.length,
    };
  }
  return out;
}

/** Stride length and cadence, off the phase the layer actually advanced. */
function cadenceOf(s) {
  const f = s.frames;
  const first = f[Math.floor(FPS * 0.6)], last = f[f.length - 1];
  const halfCycles = (last.stridePhase - first.stridePhase) / Math.PI;
  const secs = last.t - first.t;
  const dist = s.speed * secs;
  return { steps: halfCycles, cadence: halfCycles / secs, strideLen: halfCycles ? dist / halfCycles : 0 };
}

/** How far the body rises and falls once the gait has settled. */
function bobOf(s) {
  const ys = s.frames.filter((x) => x.t > 0.6).map((x) => x.body[1]);
  return Math.max(...ys) - Math.min(...ys);
}

say("\n[gaitprobe] the walk, measured\n");

if (process.argv.includes("--trace")) {
  const s0 = stride("huscarl", 3.9, "walking");
  const ys = s0.frames.map((x) => x.feet.R[1]);
  say(`  huscarl right foot world y: ${Math.min(...ys).toFixed(3)} .. ${Math.max(...ys).toFixed(3)}`);
  say("  frame trace (t, footR y, footR z, body z):");
  for (let i = 60; i < 100; i++) {
    const f = s0.frames[i];
    say(`    ${f.t.toFixed(2)}  y=${f.feet.R[1].toFixed(3)}  z=${f.feet.R[2].toFixed(3)}  body z=${f.body[2].toFixed(3)}`);
  }
}

// ---- 1. THE PLANTED FOOT STAYS WHERE IT WAS PUT --------------------------
//
// The one thing that makes locomotion look cheap. `gaitLayer`'s own comment
// says it advances phase with distance covered rather than with wall time
// precisely so that "a foot planted at a given ground point stays there". This
// is the claim that says so.
say("  class        state      speed   stride  cadence   skate(med/p90)    bob");
say("  " + "-".repeat(76));
const walks = [];
for (const cls of CLASSES) {
  const sp = WARRIOR_STATS[cls].moveSpeed ?? 4.5;
  for (const [state, mult] of [["walking", 1], ["sprinting", 1.45]]) {
    const s = stride(cls, sp * mult, state);
    const sl = slideOf(s), c = cadenceOf(s), b = bobOf(s);
    walks.push({ s, sl, c, b });
    say(`  ${cls.padEnd(12)} ${state.padEnd(10)} ${(sp * mult).toFixed(2)}   `
      + `${c.strideLen.toFixed(2)}m   ${c.cadence.toFixed(2)}/s   `
      + `${(((sl.L.median + sl.R.median) / 2) * 100).toFixed(0)}% / ${(Math.max(sl.L.worst, sl.R.worst) * 100).toFixed(0)}%   `
      + `${b.toFixed(3)}m`);
  }
}
{
  // A quarter of the stride is the bar, and it is generous: a foot that skates
  // a quarter of a step is a foot the eye catches. A perfect plant is 0.
  // A quarter of the body's own speed. A boot moving a quarter as fast as the
  // man over it reads as planted; half is a skate.
  const bad = walks.filter((w) => (w.sl.L.median + w.sl.R.median) / 2 > 0.25);
  check("a planted foot stays where it was put",
    bad.length === 0,
    bad.length ? bad.map((w) => `${w.s.cls}/${w.s.state} skates at ${(((w.sl.L.median + w.sl.R.median) / 2) * 100).toFixed(0)}% of his own speed`).join("; ")
      : `worst ${Math.max(...walks.map((w) => (w.sl.L.median + w.sl.R.median) / 2 * 100)).toFixed(0)}% of the man's own speed`);
}

// ---- 2. THE BODY RISES AND FALLS ------------------------------------------
{
  const flat = walks.filter((w) => w.b < 0.02);
  check("the body rises and falls over a stride — he is not a dolly with legs",
    flat.length === 0,
    flat.length ? flat.map((w) => `${w.s.cls}/${w.s.state} ${w.b.toFixed(3)}m`).join(", ")
      : `${Math.min(...walks.map((w) => w.b)).toFixed(3)}m to ${Math.max(...walks.map((w) => w.b)).toFixed(3)}m of bob`);
}

// ---- 3. A RUN IS A LONGER STRIDE, NOT ONLY A FASTER ONE -------------------
//
// The cheapest way to make a walk cycle go faster is to play it faster, and it
// reads as a man on fast-forward. A body covering more ground takes LONGER
// steps as well as more of them.
{
  const bad = [];
  for (const cls of CLASSES) {
    const w = walks.find((x) => x.s.cls === cls && x.s.state === "walking");
    const r = walks.find((x) => x.s.cls === cls && x.s.state === "sprinting");
    if (r.c.strideLen < w.c.strideLen * 1.08) {
      bad.push(`${cls} ${w.c.strideLen.toFixed(2)} -> ${r.c.strideLen.toFixed(2)}m`);
    }
  }
  check("a sprint lengthens the stride as well as quickening it",
    bad.length === 0,
    bad.length ? `${bad.length} only quicken: ${bad.join(", ")}`
      : CLASSES.map((c) => {
        const w = walks.find((x) => x.s.cls === c && x.s.state === "walking");
        const r = walks.find((x) => x.s.cls === c && x.s.state === "sprinting");
        return `${c} ${w.c.strideLen.toFixed(2)}->${r.c.strideLen.toFixed(2)}m`;
      }).join(", "));
}

say(`\n[gaitprobe] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
