/**
 * REPLAYTEST — is the slow-motion kill replay a RECORDING, or a slowed lens?
 *
 *   node tools/replaytest.mjs                all sections
 *   node tools/replaytest.mjs --only=record  §1 the recording is faithful
 *   node tools/replaytest.mjs --only=clock   §2 it rewinds, and it is slow
 *   node tools/replaytest.mjs --only=budget  §3 it fits the break it lives in
 *   node tools/replaytest.mjs --only=hole    §4 the match-end hole, BACKLOG 2.6
 *   node tools/replaytest.mjs --only=cost    §5 what the ring costs
 *   node tools/replaytest.mjs --gate         exit non-zero on a red verdict
 *   node tools/replaytest.mjs --lever=live   R1: record the PRESENT, not the past
 *   node tools/replaytest.mjs --lever=clock  R1: drive ctx.time off the wall
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AND WHAT IT REFUSES TO ACCEPT
 *
 * The owner asked for the final kill "as a slow-mo replay". There is a cheap
 * version of that which passes every eye test in a still frame: scale `dt` on
 * the existing round camera and let the corpse settle slowly. It is not a
 * replay, and the difference is not a matter of taste — THE LIVE CAMERA CANNOT
 * SHOW YOU THE BLOW. `createRoundCamera` arms on the frame the last man falls,
 * which is one frame after the swing landed; the approach, the windup and the
 * contact are already over and are not on screen any more.
 *
 * So §1 does not ask whether the picture looks slow. It drives the REAL
 * `poseWarrior` off the recorded buffer and requires the replayed body to match,
 * channel by channel, the pose that was live at that recorded moment — on a
 * fight the real engine fought. A slowed live camera has no past and cannot be
 * put through it at all.
 *
 * ---------------------------------------------------------------------------
 * HOW IT MEASURES. The same two shipped seams `gravitytest` uses, and nothing
 * in `src/` is edited:
 *
 *   THE SERVER   `makeEngine({ autoTick: false })` and `engine.step(dt)`. This
 *                file owns the clock; nothing races the sim.
 *   THE CLIENT   `src/game/client/render/anim.ts` compiled by `tsc` into
 *                `.replay/anim` and imported. `stepWarriorTransform` and
 *                `poseWarrior` are the exact functions production calls, in the
 *                order `GameCanvas.tsx` calls them.
 *
 * AND ONE THING THIS FILE DOES THAT gravitytest DOES NOT: it stands in for the
 * ORCHESTRATOR. `motion.recoil` is raised by `GameCanvas.tsx` on the frame a
 * man's health drops, and `stepWarriorTransform` latches the blow's bearing off
 * that rise. It is done here, from the recorded `health`, on BOTH the live and
 * the replayed path — identically, out of one function — because if the replay
 * path skipped it the replayed corpse would fall the wrong way and §1 would
 * catch it as a pose mismatch rather than as a missing feature.
 */
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import * as THREE from "three";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const argOf = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const ONLY = (argOf("only", "record,clock,budget,hole,cost")).split(",").map((s) => s.trim());
const has = (s) => ONLY.includes(s);
const GATE = argv.includes("--gate");
const LEVER = argOf("lever", "");

// ===========================================================================
// THE DIE — FIXED, AND IT WAS NOT
// ===========================================================================
/**
 * THIS FILE WAS FLAKY AND ITS FLAKINESS WAS PRINTED IN A DOC AS A RESULT.
 *
 * `docs/REPLAY.md` §1 reprinted one run of §1 — "worst pose -0.04° outside the
 * live track's own sampling bracket" — as the module's result. Run without a
 * seed it is not the module's result, it is one draw. Measured over twelve
 * consecutive runs of the build that shipped it, §1 went RED in seven of them,
 * with the worst time-offset column swinging 0.022 s to 0.055 s against a
 * 0.025 s bar. A gate that is red more often than not is worse than no gate,
 * because the first thing anyone does with it is stop reading it.
 *
 * The variance is not in the replay. It is in the FIGHT: `engine.mjs` rolls
 * every bot block, dodge, ability and swing off `Math.random()`, and a fight
 * that goes differently ends at a different moment, in a different pose, with a
 * different joint moving fastest on the frame §1 happens to catch. The recorder
 * was faithful on every one of those runs; what moved was the thing recorded.
 *
 * So: the same fixed die `tools/seeddie.mjs` hands the spawned server, rolled
 * in this process before `engine.mjs` is imported, and seedable so that "it
 * passes" can be a claim about more than one fight. Same xorshift32, same
 * constant, so this instrument and `cosmetictest` roll one stream and a
 * difference between two harnesses is never the seed.
 *
 *   node tools/replaytest.mjs --seed=7        one named fight
 *   node tools/replaytest.mjs --sweep        the ten declared seeds, as a table
 *   node tools/replaytest.mjs --repeat=10    the same seed N times, hashed
 *
 * AND THE SEED HAD TO BE MADE TO MEAN SOMETHING, which is the second half of
 * this note. Seeding `Math.random` alone changed NOTHING: ten seeds gave ten
 * byte-identical runs. This fixture has no bots in it — four scripted sessions
 * — so the bot rolls the die decides are not rolled, and the variance that had
 * been mistaken for them was somewhere else entirely (see `makeRig`). The die
 * is kept because the engine may reach for it at any time and an unseeded one
 * is a hole waiting to open; `--seed` now also names the fixture's warriors,
 * which is the axis this fixture actually varies on.
 *
 * WHAT IT DOES NOT BUY, in the words `seeddie.mjs` uses: it removes an
 * INDEPENDENT source of variance, not all variance. Player ids still come from
 * `crypto.randomUUID`, which is deliberately untouched, so nothing downstream
 * can start depending on a fixed identity by accident.
 */
const SEED_ARG = argOf("seed", "");
/** Decimal, or `0x...` for the default. 0 is not a state xorshift32 can leave. */
const SEED = ((SEED_ARG ? Number(SEED_ARG) : 0x2545f491) >>> 0) || 0x2545f491;
/**
 * THE DECLARED SEEDS. Written down here, in the file, BEFORE any of them was
 * run — which is the only thing that separates "ten seeds pass" from "ten seeds
 * were tried and the good ones were kept". `--sweep` runs exactly this list and
 * prints every row, and `--repeat` re-runs one seed and hashes the output so
 * determinism is a command rather than a claim.
 */
const SEEDS = ["", "1", "2", "3", "7", "11", "42", "99", "20260820", "424242"];

/**
 * The fixture's two warriors, by name. `--seed=N` renames them, which changes
 * `motion.seed` and therefore each man's death pace by up to ±8% — the axis
 * this fixture really varies on. Unsuffixed is the declared default fight.
 */
const LABEL_A = `fixture-A${SEED_ARG ? `-${SEED_ARG}` : ""}`;
const LABEL_B = `fixture-B${SEED_ARG ? `-${SEED_ARG}` : ""}`;
let _die = SEED;
Math.random = () => {
  _die ^= _die << 13;
  _die ^= _die >>> 17;
  _die ^= _die << 5;
  return (_die >>> 0) / 4294967296;
};

const DEG = 180 / Math.PI;
const f1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : "  -");
const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : "  -");
const f3 = (n) => (Number.isFinite(n) ? n.toFixed(3) : "   -");
const say = (s) => console.log(s);
const rule = (t) => { say(""); say("=".repeat(78)); say(`  ${t}`); say("=".repeat(78)); };
const fails = [];
const bad = (m) => { fails.push(m); say(`    FAIL  ${m}`); };
const notes = [];

if (argv.includes("--sweep") || argv.some((a) => a.startsWith("--repeat"))) {
  const { execFileSync, createHash } = { ...await import("child_process"), ...await import("crypto") };
  const self = fileURLToPath(import.meta.url);
  const run = (extra) => {
    try {
      return execFileSync(process.execPath, [self, "--only=record", ...extra], { encoding: "utf8" });
    } catch (e) { return (e.stdout || "") + (e.stderr || ""); }
  };
  // A SCRAPE THAT MISSES IS A FAILURE OF THIS FILE, NOT A BLANK COLUMN.
  //
  // It printed "?" and carried on. The branch renamed the emitted line —
  // "...to that frame" became "...to the NEAREST live frame this pose could
  // be" — and left this regex matching the old wording, so `--sweep`, the
  // command that is supposed to REPRODUCE the ten-seed table, printed "?s" ten
  // times while still counting 10/10 green off the FAIL lines. A number nobody
  // can check is worse than no number, and a silent "?" is how it got shipped.
  // Now it fails the sweep outright and names the pattern that stopped
  // matching, so the next rename cannot go unnoticed.
  const missed = [];
  const grab = (out, rx, what) => {
    const m = rx.exec(out);
    if (!m) { missed.push(`${what}: /${rx.source}/ matched nothing in --only=record's output`); return "?"; }
    return m[1];
  };
  if (argv.includes("--sweep")) {
    say("");
    say("  THE TEN DECLARED SEEDS. Every row printed; none discarded.");
    say("");
    say("    seed         pose outside bracket   worst phase offset   verdict");
    let green = 0;
    for (const sd of SEEDS) {
      const out = run(sd ? [`--seed=${sd}`] : []);
      const pose = grab(out, /worst pose OUTSIDE the live track's own\s+(-?[\d.]+)°/,
        "pose outside bracket");
      // Matched on the stem only, up to the number. The tail of this line has
      // been reworded twice and the column died silently both times.
      const off = grab(out, /worst distance in time to the NEAREST live\s+([\d.]+)s/,
        "worst phase offset");
      const red = /^\s+FAIL/m.test(out);
      if (!red) green++;
      say(`    ${(sd || "default").padEnd(12)} ${(pose + "°").padStart(16)}   ${(off + "s").padStart(18)}   ${red ? "RED" : "green"}`);
    }
    say("");
    say(`    ${green}/${SEEDS.length} green. The bar is not moved and the default is not re-picked:`);
    say(`    choosing the fight to fit the gate is the same move as choosing the bar`);
    say(`    to fit the fight. See docs/REPLAY.md §1.`);
    say("");
    if (missed.length) {
      const seen = [...new Set(missed)];
      for (const m of seen) say(`    SWEEP BROKEN — ${m}`);
      say(`    The table above has a dead column, so it does not reproduce anything.`);
      say("");
      process.exit(1);
    }
  }
  const rep = argv.find((a) => a.startsWith("--repeat"));
  if (rep) {
    const n = Math.max(2, parseInt(rep.split("=")[1] || "10", 10));
    const seen = new Map();
    for (let i = 0; i < n; i++) {
      const out = run(SEED_ARG ? [`--seed=${SEED_ARG}`] : [])
        .split("\n").filter((l) => !/Warning|Reparsing|To eliminate|trace-warnings/.test(l)).join("\n");
      const h = createHash("md5").update(out).digest("hex").slice(0, 12);
      seen.set(h, (seen.get(h) || 0) + 1);
    }
    say("");
    say(`  DETERMINISM: ${n} runs of seed "${SEED_ARG || "default"}", output hashed.`);
    for (const [h, c] of seen) say(`    ${c} x ${h}`);
    say(seen.size === 1 ? `  ONE hash over ${n} runs.` : `  ${seen.size} DIFFERENT hashes over ${n} runs — this file is not deterministic.`);
    say("");
  }
  process.exit(0);
}


// ===========================================================================
// THE BARS
// ===========================================================================
const BAR = {
  /**
   * How far a replayed joint may sit from the live joint IN THE FRAME IT
   * MATCHES, in degrees.
   *
   * 0.5° is an argument about REPRODUCTION and not about looks. A replay driven
   * off the same numbers through the same pure function is not approximately
   * the original, it IS the original, and the only daylight is float order. It
   * is set where it is so a MISSING RECORDED FIELD cannot hide under it: drop
   * `swingT` and the arm is tens of degrees out, drop `downTimer` and the whole
   * body is, and no live frame anywhere matches either.
   */
  pose: 0.5,
  /**
   * ...AND HOW FAR AWAY IN TIME THE LIVE FRAME IT MATCHES MAY BE.
   *
   * DERIVED FROM THE TWO SAMPLING RATES AND NOT PICKED. The match is an argmin
   * over pose, so it can only ever localise a replayed frame to within the
   * grids it is choosing between: one step of the LIVE track (1/60 s, the
   * frames it is choosing from) plus one step of the REPLAY's own recorded-time
   * advance (dt * rate = 1/120 s, how far apart the things being placed are).
   *
   *     1/60 + 1/120 = 0.025 s
   *
   * WRITTEN DOWN BECAUSE I SET IT TO 1/60 FIRST AND THAT WAS WRONG. 1/60 is the
   * live step alone and it ignores that the thing being located sits between
   * two live samples rather than on one; the run measured 0.022 s and I could
   * have derived 0.025 s before running it. Stating both the old value and why
   * it was wrong is the only thing that separates a derivation from a number
   * moved to turn a light green — and `--lever=drift` below is the check that
   * the bar still has teeth: it slows the replay's clock without telling
   * anyone, and this must go red.
   *
   * A replay running at the wrong rate fails this and fails it WORSE EVERY
   * FRAME, because the offset grows without bound instead of staying inside the
   * quantisation.
   *
   * -----------------------------------------------------------------------
   * AND THE NUMBER IS STILL 0.025 s. WHAT MOVED IS WHAT IS MEASURED AGAINST IT.
   *
   * This settles the reading `docs/REPLAY.md` §1 wrote down and deliberately
   * did not act on: "the derivation does not account for the ring's own 1/20 s
   * step, which `slotAt` resolves nearest-at-or-before... the localisation
   * floor is a recorded step, 0.05 s. The measured 0.055 s sits exactly there."
   *
   * THAT IS REFUTED BY THE OFFSETS THEMSELVES. Dumped frame by frame on the
   * default fixture, the 228 compared frames of the old argmin column gave
   *
   *     -0.0050 s   82 frames        +0.0033 s   48 frames
   *     -0.0133 s   66 frames        -0.0217 s   31 frames
   *     -0.0550 s    1 frame
   *
   * 227 of 228 inside the bar, nothing anywhere near 0.05 s, and ONE outlier. A
   * quantisation floor of a recorded step would put a great many frames at
   * 0.05 s, not one. The ring's step is not the mechanism.
   *
   * WHAT THE ONE FRAME IS. It is the replay's first frame after the collapse
   * begins: `at` = 19.9550 s, ring slot 19.9500 s, the first `dead` snapshot.
   * Its pose distance to every live frame in the window:
   *
   *     live t   19.9000  19.9167  19.9333  19.9500  19.9667
   *     gap        0.56°    0.60°    0.63°    1.73°    8.50°
   *
   * The first three lie within 0.07° of each other and span 0.033 s. The argmin
   * picked 19.9000 by four hundredths of a degree. That is not a measurement of
   * time, it is a coin toss across a basin three frames wide — and the pose is
   * the thing that cannot tell them apart, because the live track itself only
   * moves 0.17° over the render frame at 19.9000 while the replayed pose sits
   * 0.56° off the live polyline. That 0.39° of excess is the POSE column's own
   * worst reading for this very frame, and it passes at 0.50°. Both columns
   * were reporting one residual; only one of them was reporting it honestly.
   *
   * SO THE PHASE COLUMN NOW ASKS A FALSIFYING QUESTION INSTEAD OF A SELECTING
   * ONE. "Which live frame is this?" has no answer where the pose is flat.
   * "Could this replayed frame be the moment it claims to be?" always has one,
   * and it is the question a defect detector wants: the claim is refuted only
   * when NO live frame near `at` matches. `matches` is not a new tolerance
   * invented here — it is `BAR.bracket`'s, the one this file already gates the
   * pose column on: a replayed pose IS a given live frame when it sits inside
   * that frame's own sampling bracket plus `pose`. The column reports the
   * NEAREST IN TIME of the frames that pass that test, and the bar it is held
   * to is the grid arithmetic above, untouched. The raw argmin is still
   * computed and still printed beside it, ungated.
   *
   * THIS IS NOT LOOSENESS BOUGHT WITH A DIFFERENT NAME. Where the fight is
   * still the bracket is a fraction of a degree and the admissible set is one
   * or two frames wide; where it is violent the bracket is ten degrees and the
   * set is wide — and a wide set is the honest report, because a body moving
   * 10° per frame cannot be placed in time to a sixtieth of a second by looking
   * at it. What cannot pass either way is a replay drawn at the WRONG RATE:
   * under `--lever=drift` the lag grows without bound, no admissible frame
   * stays near `at`, and the run at the bottom of this comment block is red.
   */
  phase: 1 / 60 + 1 / 120,
  /**
   * THE TOLERANCE IS NOT A CONSTANT, AND THIS IS THE PART THAT TOOK THREE
   * DRAFTS TO GET HONEST.
   *
   * The live fight is drawn on a 1/60 s grid of recorded time. The replay, at
   * half speed, is drawn on a 1/120 s one, and the two are offset by
   * `REPLAY.pre` — they never coincide, and no choice of constants makes them,
   * because 1/120 is not a multiple of 1/60. So a replayed frame generally
   * lands BETWEEN two live samples, and the closest live pose to it is as far
   * away as the pose moved over that render frame. Through the fastest part of
   * a collapse that is 8-9° on a knee. Two earlier drafts of this section
   * reported exactly that and called it a missing recorded field. It is not:
   * the phase probe below matched the worst replayed frame to a live frame
   * 0.013 s away at 0.00°.
   *
   * The fix is not a bigger number, it is a DERIVED one. For each replayed
   * frame this section measures how far the LIVE track itself moved between the
   * two samples bracketing it — the irreducible sampling uncertainty at that
   * moment, in that channel, on that fight — and requires the replayed pose to
   * sit inside that bracket plus `pose`. The bar is therefore ~0.5° while the
   * body is still and several degrees at the peak of a collapse, and it is the
   * fight that decides which, not this file.
   *
   * IT CANNOT HIDE A MISSING FIELD, which is the only thing that matters: drop
   * `swingT` and the arm is tens of degrees outside a bracket that is a
   * fraction of one, drop `downTimer` and the whole body is, and the `--lever`
   * runs at the bottom of this file prove the section still goes red when the
   * recording is turned into a mirror of the present.
   */
  bracket: true,
  /**
   * Frames of a fresh `motion` that are not compared. `ingestNet` primes its
   * jitter buffer and `motion.blend` crossfades over 0.1 s, so a rig that has
   * just been built cannot be identical to one that has been running for
   * twenty seconds. 12 frames is 0.2 s, twice the crossfade. Stated as a
   * number of SKIPPED frames rather than hidden in a tolerance, because a
   * tolerance that swallows a warm-up will swallow a defect.
   */
  warm: 12,
};

// ===========================================================================
// THE COMPILED CLIENT
// ===========================================================================
let ANIM = null;
let LEVER_MISSED = false;
async function loadAnim() {
  if (ANIM) return ANIM;
  const BUILD = resolve(ROOT, ".replay/anim");
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  const tsc = spawnSync("npx", ["tsc", "src/game/client/render/anim.ts", "--outDir", ".replay/anim",
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
  if (!animFile) { say(`  tsc emitted no anim.js:\n${tsc.stdout || ""}${tsc.stderr || ""}`); return null; }
  ANIM = await import(pathToFileURL(animFile).href);
  return ANIM;
}

// ===========================================================================
// THE DRIVER — one function, two callers, so the paths cannot drift
// ===========================================================================
const CHANNELS = ["px", "py", "pz", "prx", "pry", "prz", "crx", "cry", "crz",
  "hrx", "hry", "hrz", "arx", "ary", "arz", "olx", "oly", "olz",
  "lrx", "lrz", "llx", "llz", "arb", "olb", "lrb", "llb", "waw"];

/**
 * @param label a STABLE id for the rig and its motion, and the second half of
 *   this file's determinism. `createMotion` sets
 *
 *       stride: hash01(p.id) * 2π,  seed: hash01(p.id + "s") * 6.28
 *
 *   once, off the player's id — and `deathLayer` rides that seed:
 *   `pace = c.pace * (1 + sin(seed * 12.9898) * 0.08)`, which is ±8% on the
 *   whole collapse clock. The ids come from `crypto.randomUUID`, which
 *   `tools/seeddie.mjs` deliberately leaves alone ("nothing downstream can
 *   start depending on a fixed identity by accident") — and this is downstream,
 *   and it does depend on it.
 *
 *   Seeding `Math.random` alone left this file still drawing a different fight
 *   every run: ten seeded runs of §1 gave ten different outputs, with the worst
 *   time offset swinging 0.022 s to 0.038 s across them. It was never the bots
 *   on their own; it was that every warrior fell at a different speed.
 *
 *   Both paths share these slots, so a fixed label changes WHICH fight is
 *   measured and not whether the replay matches it — the live track and the
 *   replayed track are posed by the same `motion` either way.
 */
function makeRig(anim, player, label) {
  const parent = new THREE.Group();
  const named = label ? { ...player, id: label } : player;
  const rig = anim.createWarriorRig(parent, named, undefined, { tier: "high", shadows: false });
  const motion = anim.createMotion(named);
  const ctx = { dt: 1 / 60, rawDt: 1 / 60, time: 0, camera: new THREE.PerspectiveCamera(),
    focus: new THREE.Vector3(), localId: "", localState: null, mood: "dusk",
    quality: { tier: "high", shadows: false } };
  return { parent, rig, motion, ctx, hp: player.health };
}

/**
 * ONE RENDER FRAME, and it is the ONLY place either path draws a man.
 *
 * `GameCanvas.tsx` does three things per warrior per frame and this does the
 * same three in the same order: raise `recoil` off the health delta, run
 * `stepWarriorTransform` with the attacker, then `poseWarrior`. Sharing it
 * between the live and the replayed path is the whole point — a comparison
 * between two DIFFERENT drivers would be measuring the drivers.
 */
function drawFrame(anim, slot, player, attacker, dt, simTime) {
  // The orchestrator's job. GameCanvas: `slot.motion.recoil = Math.min(1.6,
  // 0.6 + dmg * 0.03)` on the frame the health drops.
  const dmg = slot.hp - player.health;
  if (dmg > 0.5) slot.motion.recoil = Math.min(1.6, 0.6 + dmg * 0.03);
  slot.hp = player.health;
  // `ctx.time` off the SIM clock and not off a frame counter — see the note in
  // replay.mjs. `--lever=clock` breaks exactly this.
  slot.ctx.time = LEVER === "clock" ? (slot.wall = (slot.wall || 0) + dt) : simTime;
  anim.stepWarriorTransform(slot.rig, slot.motion, player, dt, slot.ctx, attacker);
  anim.poseWarrior(slot.rig, slot.motion, player, dt, slot.ctx);
}

const snapPose = (rig) => { const o = {}; for (const c of CHANNELS) o[c] = rig.last[c]; return o; };
const poseGap = (a, b) => { let w = 0, k = ""; for (const c of CHANNELS) {
  const d = Math.abs((a[c] || 0) - (b[c] || 0)) * DEG; if (d > w) { w = d; k = c; } } return { w, k }; };

/**
 * A REAL FIGHT, RECORDED. Two men and two onlookers so the round does not end
 * on the first death, the same room shape `gravitytest` §1 uses. Returns the
 * buffer, the live poses frame by frame, and when the killing blow landed.
 */
async function fight(anim, replay) {
  const eng = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);
  const { makeEngine } = eng;
  const TICK = 1 / 20;
  const RENDER = 3;
  const DT = TICK / RENDER;
  const NEUTRAL = { moveX: 0, moveZ: 0, rotationY: 0, sprint: false, attack: false,
    heavyAttack: false, block: false, dodge: false, crouch: false, ability: false,
    shove: false, attackDir: "right" };
  const session = (engine) => {
    const st = { latest: null, id: null, join: null };
    const sid = engine.connect((str) => {
      const m = JSON.parse(str);
      if (m.type === "join") { st.id = m.data.playerId; st.join = m.data; }
      if (m.data && m.data.players) st.latest = m.data;
    });
    return { sid, st };
  };
  const engine = makeEngine({ autoTick: false });
  const A = session(engine);
  engine.message(A.sid, { type: "create", data: { name: "Aethel", mode: "blood_moot", bestOf: 1 } });
  engine.message(A.sid, { type: "select_class", data: { warriorClass: "berserker" } });
  const B = session(engine);
  engine.message(B.sid, { type: "join", data: { code: A.st.join.code } });
  engine.message(B.sid, { type: "select_class", data: { warriorClass: "huscarl" } });
  const C = session(engine), D = session(engine);
  engine.message(C.sid, { type: "join", data: { code: A.st.join.code } });
  engine.message(D.sid, { type: "join", data: { code: A.st.join.code } });
  engine.message(A.sid, { type: "start", data: {} });
  let g = 0;
  while (g++ < 600 && A.st.latest?.state !== "fighting") engine.step(TICK);
  if (A.st.latest?.state !== "fighting") { engine.stop(); return null; }
  for (let i = 0; i < 50; i++) engine.step(TICK);

  const me = (S) => S.st.latest.players[S.st.id];
  const hold = (S, data) => engine.message(S.sid, { type: "input", data: { ...NEUTRAL, ...data } });
  const slotA = makeRig(anim, me(A), LABEL_A), slotB = makeRig(anim, me(B), LABEL_B);
  const live = [];                 // { t, a, b } poses, one per render frame
  let sim = 0, deathAt = -1;
  const buf = replay.createReplayBuffer();

  const tick = () => {
    engine.step(TICK); sim += TICK;
    const a = me(A), b = me(B);
    // THE RECORDER, where the renderer would put it: one call, one frame, the
    // same array the client is about to draw.
    buf.record(sim, [a, b, me(C), me(D)]);
    if (deathAt < 0 && b.state === "dead") deathAt = sim;
    // WHICH RENDER FRAMES A PACKET IS DRAWN ON, and it has to be the same
    // convention on both paths or the comparison measures the convention.
    //
    // A packet stamped T is the world as the server left it at T, and a client
    // draws it from the moment it arrives until the next one — render times
    // [T, T+TICK). The first draft of this fixture labelled the three frames
    // (T-TICK, T] instead, which is a tick EARLIER, and §1 came back 28.75° out
    // with the phase probe reporting the worst replayed frame matching a live
    // frame 0.047 s away — one recorded frame, to within a render frame. The
    // recording was faithful and the ruler was reading it against a live track
    // labelled a tick early. `slotAt` is nearest-at-or-before, so this is the
    // side that had to move.
    for (let k = 0; k < RENDER; k++) {
      const at = sim + k * DT;
      drawFrame(anim, slotA, a, b, DT, at);
      drawFrame(anim, slotB, b, a, DT, at);
      live.push({ t: at, b: snapPose(slotB.rig), a: snapPose(slotA.rig) });
    }
  };

  let t = 0, phase = "floor", saw = false;
  const ready = (p) => p.state === "idle" || p.state === "walking";
  while (t < 90) {
    const a = me(A), b = me(B);
    if (!a || !b) break;
    const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
    const d = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, dz);
    if (d > 1.5) hold(A, { moveX: dx / d, moveZ: dz / d, rotationY: yaw });
    else if (phase === "floor") hold(A, { rotationY: yaw, shove: ready(a) });
    else hold(A, { rotationY: yaw, heavyAttack: ready(a) });
    tick(); t += TICK;
    const b2 = me(B);
    if (b2.state === "knocked") saw = true;
    if (phase === "floor" && ((saw && b2.state !== "knocked" && b2.state !== "rising")
      || b2.health <= b2.maxHealth * 0.35)) phase = "kill";
    if (b2.state === "dead") break;
  }
  if (deathAt < 0) { engine.stop(); return null; }
  // NOT run to the end here. The replay opens on the frame the man died and the
  // recorder KEEPS RECORDING while it plays — that is the whole topology, the
  // write head running ahead of the read head — so the caller advances the
  // fight itself, one sim tick at a time, in step with the frames it draws.
  // Winding the fight forward first and replaying afterwards would test a
  // buffer nobody uses and would hide exactly the sizing fault §5 now gates.
  return { buf, live, deathAt, ids: { a: A.st.id, b: B.st.id },
    tick: () => { hold(A, {}); tick(); },
    stop: () => engine.stop(), sim: () => sim };
}

// ===========================================================================
// §1  THE RECORDING IS FAITHFUL
// ===========================================================================
async function sectionRecord(anim, replay) {
  rule("§1  THE RECORDING IS FAITHFUL   (real engine, real poseWarrior, twice)");
  const run = await fight(anim, replay);
  if (!run) { bad("§1 the fixture never produced a death — nothing to replay"); return null; }
  const { buf, live, deathAt } = run;
  say("");
  say(`    A fight the engine actually fought. The killing blow landed at sim t+${f2(deathAt)}s;`);
  say(`    the ring holds ${buf.frames} frames, ${f2(buf.first)}s .. ${f2(buf.last)}s.`);

  // ---- replay it, from a rig that has never seen this fight ----
  const { REPLAY } = replay;
  const clock = replay.createKillReplay();
  const out = [];
  let n = buf.readInto(deathAt, out);
  if (n < 0) { bad("§1 the ring did not hold the moment of the blow"); return null; }
  const first = out.find((p) => p.id === run.ids.b) || out[0];
  const slot = makeRig(anim, first, LABEL_B);
  const rows = [];
  const DT = 1 / 60;
  let elapsed = 0, worst = 0, worstAt = 0, worstCh = "", compared = 0, frame = 0;
  const worstBy = {};
  let worstFrame = null;
  let matchWorst = 0, matchAt = 0, matchCh = "", offWorst = 0, offAt = 0, offMatch = 0;
  let rawOffWorst = 0, rawOffAt = 0;
  let excessWorst = -Infinity, excessAt = 0, excessCh = "", excessBr = 0, excessGap = 0;
  // The replay's own clock, driven exactly as the renderer would drive it.
  clock.reset();
  for (let i = 0; i < Math.ceil(REPLAY.wall * 60) + 4; i++) {
    // The fight goes on around the replay, at 20 Hz, exactly as it does live.
    if (i % 3 === 0) run.tick();
    const s = clock.update(DT, { ended: true, end: false, own: false, deathAt, ready: true });
    if (!s) break;
    elapsed += DT;
    const got = buf.readInto(s.at, out);
    if (got < 0) { bad(`§1 the ring did not hold t+${f2(s.at)}s, which the replay asked for`); break; }
    const b = out.find((p) => p.id === run.ids.b);
    const a = out.find((p) => p.id === run.ids.a);
    if (!b || !a) { bad("§1 a man recorded in the fight is missing from the replayed frame"); break; }
    // `s.dt`, NOT `DT`. The animator's clocks run at the replay's rate or the
    // body falls at full speed through a fight playing at half — see replay.mjs.
    drawFrame(anim, slot, b, a, s.dt, s.at);
    frame++;
    rows.push({ wall: elapsed, at: s.at, state: b.state, hp: Math.round(b.health) });
    if (frame <= BAR.warm) continue;
    // The live pose at the same RECORDED moment. Nearest render frame.
    let best = null, bd = Infinity;
    for (const l of live) { const d = Math.abs(l.t - s.at); if (d < bd) { bd = d; best = l; } }
    if (!best || bd > DT) continue;
    const now = snapPose(slot.rig);
    const g = poseGap(now, best.b);
    compared++;
    if (g.w > worst) { worst = g.w; worstAt = s.at; worstCh = g.k; worstFrame = now; }
    // THE MATCHED FRAME: the live frame this replayed one actually IS. See
    // BAR.phase for why the pair of numbers is the claim and the same-label
    // difference above is only printed.
    let mD = Infinity, mT = 0, mCh = "", mI = -1;
    for (let li = 0; li < live.length; li++) {
      const l = live[li];
      if (Math.abs(l.t - s.at) > 0.06) continue;
      const q = poseGap(now, l.b);
      if (q.w < mD) { mD = q.w; mT = l.t; mCh = q.k; mI = li; }
    }
    if (mI < 0) continue;
    // THE BRACKET: how far the LIVE track moved over the render frame this
    // replayed frame landed inside. That is the sampling uncertainty, measured
    // rather than assumed. See BAR.bracket.
    let bracket = 0;
    if (mI > 0) bracket = Math.max(bracket, poseGap(live[mI].b, live[mI - 1].b).w);
    if (mI < live.length - 1) bracket = Math.max(bracket, poseGap(live[mI].b, live[mI + 1].b).w);
    const excess = mD - bracket;
    if (mD > matchWorst) { matchWorst = mD; matchAt = s.at; matchCh = mCh; }
    if (excess > excessWorst) { excessWorst = excess; excessAt = s.at; excessCh = mCh; excessBr = bracket; excessGap = mD; }
    // THE PHASE COLUMN, AND IT ASKS A FALSIFYING QUESTION — see BAR.phase. Not
    // "which live frame is the argmin", which is a coin toss wherever the pose
    // is flat, but "is there a live frame near `at` that this replayed pose
    // could BE". `could be` is not a new tolerance: it is the same test the
    // pose column above gates on, `gap <= that frame's own bracket + BAR.pose`.
    let off = Infinity, offT = 0;
    for (let li = 0; li < live.length; li++) {
      const l = live[li];
      const d = Math.abs(l.t - s.at);
      if (d > 0.06 || d >= off) continue;
      const q = poseGap(now, l.b);
      let br = 0;
      if (li > 0) br = Math.max(br, poseGap(live[li].b, live[li - 1].b).w);
      if (li < live.length - 1) br = Math.max(br, poseGap(live[li].b, live[li + 1].b).w);
      if (q.w <= br + BAR.pose) { off = d; offT = l.t; }
    }
    // Nothing in the window is this pose at all. Then the POSE column has
    // already failed — its own `excess` is over `BAR.pose` by construction —
    // and the argmin's offset is reported rather than an infinity.
    if (!Number.isFinite(off)) { off = Math.abs(mT - s.at); offT = mT; }
    const rawOff = Math.abs(mT - s.at);
    if (rawOff > rawOffWorst) { rawOffWorst = rawOff; rawOffAt = s.at; }
    if (off > offWorst) { offWorst = off; offAt = s.at; offMatch = offT; }
    // WHICH CHANNEL AND WHEN, because "83° somewhere" sends the next person
    // reading the whole animator. Kept in the harness rather than deleted after
    // it did its job once: a pose comparison that only ever says a single
    // number cannot be debugged the second time it goes red.
    for (const c of CHANNELS) {
      const d = Math.abs((now[c] || 0) - (best.b[c] || 0)) * DEG;
      if (!worstBy[c] || d > worstBy[c].d) worstBy[c] = { d, at: s.at, state: b.state };
    }
  }
  run.stop();

  say("");
  say(`    WHAT THE PLAYER SEES, wall clock against the fight it is showing:`);
  say("");
  say(`      wall(s)   showing sim t   state      hp`);
  for (let i = 0; i < rows.length; i += 24) {
    const r = rows[i];
    say(`      ${f2(r.wall).padStart(6)}    ${f2(r.at).padStart(11)}   ${r.state.padEnd(9)} ${String(r.hp).padStart(4)}`);
  }
  const lastRow = rows[rows.length - 1];
  if (lastRow) say(`      ${f2(lastRow.wall).padStart(6)}    ${f2(lastRow.at).padStart(11)}   ${lastRow.state.padEnd(9)} ${String(lastRow.hp).padStart(4)}`);

  say("");
  say(`    frames replayed                                ${String(frame).padStart(5)}`);
  say(`    ...compared against the live pose              ${String(compared).padStart(5)}   (first ${BAR.warm} skipped: a fresh motion primes)`);
  say("");
  say(`    THE CLAIM, and it is a pair — every replayed frame IS a live frame, and it`);
  say(`    is the one it says it is:`);
  say(`      worst pose OUTSIDE the live track's own      ${f2(excessWorst)}°  (bar ${f2(BAR.pose)}°)`);
  say(`      sampling bracket                                     at sim t+${f2(excessAt)}s on ${excessCh || "-"}:`);
  say(`                                                   ${f2(excessGap)}° from the nearest live pose, and the`);
  say(`                                                   live track itself moved ${f2(excessBr)}° over that frame`);
  say(`      worst distance in time to the NEAREST live    ${f3(offWorst)}s  (bar ${f3(BAR.phase)}s = one live step`);
  say(`      frame this pose could be                             plus one replay step, at t+${f2(offAt)}s,`);
  say(`                                                   matching the live frame at t+${f2(offMatch)}s)`);
  say(`      ...and where the raw argmin put it            ${f3(rawOffWorst)}s  at t+${f2(rawOffAt)}s — PRINTED,`);
  say(`                                                   NOT GATED: an argmin over pose cannot localise`);
  say(`                                                   a frame the pose cannot tell apart. See BAR.phase.`);
  say("");
  say(`    PRINTED AND NOT GATED, because the two sampling grids never coincide — see`);
  say(`    BAR.bracket. Raw gap to the nearest live pose: ${f2(matchWorst)}° on ${matchCh || "-"} at t+${f2(matchAt)}s.`);
  say(`    Same-LABEL difference, which is the number two earlier drafts gated on:`);
  say(`    worst joint disagreement                       ${f2(worst)}°  (bar ${f2(BAR.pose)}°)`
    + `${worstCh ? `  on ${worstCh} at sim t+${f2(worstAt)}s` : ""}`);
  // IS IT A MISSING FIELD, OR IS IT A PHASE OFFSET? The two look identical in a
  // single number and want completely different fixes. For the worst frame this
  // searches the live track for the frame that ACTUALLY matches: a missing
  // field cannot be matched by any frame, and a phase offset is matched exactly
  // by one. It is the difference between "the replay is drawing a different
  // body" and "the replay is drawing the right body at the wrong moment".
  if (worstFrame) {
    let bestD = Infinity, bestT = 0;
    for (const l of live) {
      if (Math.abs(l.t - worstAt) > 0.25) continue;
      const g = poseGap(worstFrame, l.b);
      if (g.w < bestD) { bestD = g.w; bestT = l.t; }
    }
    say("");
    say(`    THE WORST FRAME, AGAINST THE WHOLE LIVE TRACK. The replayed pose at sim`);
    say(`    t+${f2(worstAt)}s is ${f2(bestD)}° from the live pose at t+${f2(bestT)}s — an offset of`);
    say(`    ${f3(bestT - worstAt)}s.`);
  }
  const top = Object.entries(worstBy).sort((x, y) => y[1].d - x[1].d).slice(0, 6);
  if (top.length && top[0][1].d > 0.01) {
    say("");
    say(`    WHERE IT DISAGREES, worst first — channel, degrees, when, and what the`);
    say(`    server was calling him at the time:`);
    for (const [c, v] of top) {
      say(`      ${c.padEnd(5)} ${f2(v.d).padStart(7)}°   sim t+${f2(v.at)}s   ${v.state}`);
    }
  }
  say("");
  if (compared < 60) {
    bad(`§1 only ${compared} frame(s) could be compared — that is not a measurement`);
  }
  if (excessWorst > BAR.pose) {
    bad(`§1 a replayed frame sits ${f2(excessWorst)}° OUTSIDE the live track's own sampling bracket on `
      + `\`${excessCh}\` (bar ${f2(BAR.pose)}°) — the recording is missing something the animator reads`);
  }
  if (offWorst > BAR.phase) {
    bad(`§1 the nearest live frame a replayed pose could be is ${f3(offWorst)}s from the moment it `
      + `claims (bar ${f3(BAR.phase)}s) — the replay is drawing the right fight at the wrong moment`);
  }
  return { worst, worstCh, matchWorst, matchCh, offWorst, rawOffWorst, excessWorst, excessCh,
    compared, frame, rows, deathAt, buf, live, ids: run.ids };
}

// ===========================================================================
// §2  IT REWINDS, AND IT IS SLOW
// ===========================================================================
function sectionClock(replay, R1) {
  rule("§2  IT REWINDS, AND IT IS SLOW   (the two things a slowed lens cannot do)");
  const { REPLAY } = replay;
  const rows = R1 ? R1.rows : null;
  if (!rows || !rows.length) { bad("§2 §1 produced no replay to time"); return null; }
  const deathAt = R1.deathAt;
  const opensAt = rows[0].at;
  const endsAt = rows[rows.length - 1].at;
  const wall = rows[rows.length - 1].wall;
  const rate = (endsAt - opensAt) / wall;
  say("");
  say(`    THE REWIND. The blow landed at sim t+${f2(deathAt)}s and the replay OPENS at`);
  say(`    t+${f2(opensAt)}s — ${f2(deathAt - opensAt)}s BEFORE it. A live camera opens on the frame`);
  say(`    after the blow and has no way back; this is the whole of the difference.`);
  say("");
  say(`    opens                    ${f2(deathAt - opensAt)}s before the blow   (REPLAY.pre ${f2(REPLAY.pre)}s)`);
  say(`    ends                     ${f2(endsAt - deathAt)}s after it            (REPLAY.post ${f2(REPLAY.post)}s)`);
  say(`    fight shown              ${f2(endsAt - opensAt)}s`);
  say(`    wall clock spent         ${f2(wall)}s`);
  say(`    measured playback rate   ${f3(rate)}x                (REPLAY.rate ${f2(REPLAY.rate)})`);
  say("");
  if (deathAt - opensAt < REPLAY.pre - 0.05) {
    bad(`§2 the replay opens only ${f2(deathAt - opensAt)}s before the blow, not ${f2(REPLAY.pre)}s — it does not rewind far enough`);
  }
  if (rate > 0.75) {
    bad(`§2 the measured playback rate is ${f3(rate)}x — that is not slow motion`);
  }
  if (Math.abs(rate - REPLAY.rate) > 0.05) {
    bad(`§2 the measured rate ${f3(rate)}x does not match the declared REPLAY.rate ${f2(REPLAY.rate)}`);
  }
  return { opensAt, endsAt, wall, rate, deathAt };
}

// ===========================================================================
// §3  IT FITS THE BREAK IT LIVES IN
// ===========================================================================
async function sectionBudget(replay) {
  rule("§3  IT FITS THE BREAK   (the server's number, not this file's)");
  const eng = await import(pathToFileURL(resolve(ROOT, "src/game/engine.mjs")).href);
  const { REPLAY } = replay;
  const { WARRIOR_STATS, swingDurationOf, SWING_PHASES } = eng;
  // ROUND_BREAK is not exported. It is read out of the source rather than
  // copied into this file, so a change to it fails here instead of drifting.
  const src = readFileSync(resolve(ROOT, "src/game/engine.mjs"), "utf8");
  const m = src.match(/const ROUND_BREAK = ([0-9.]+);/);
  const brk = m ? Number(m[1]) : NaN;
  let slowest = 0, slowestOf = "";
  for (const k of Object.keys(WARRIOR_STATS)) {
    const contactClose = swingDurationOf(k, true) * (SWING_PHASES.windup + SWING_PHASES.contact);
    if (contactClose > slowest) { slowest = contactClose; slowestOf = `${k} heavy`; }
  }
  say("");
  say(`    ROUND_BREAK, read out of engine.mjs             ${f2(brk)}s`);
  say(`    the replay's wall clock                        ${f2(REPLAY.wall)}s`);
  say(`    left over, so the countdown is dealt on time   ${f2(brk - REPLAY.wall)}s`);
  say("");
  say(`    the slowest swing's contact CLOSES at          ${f3(slowest)}s after it began  (${slowestOf})`);
  say(`    REPLAY.pre                                     ${f2(REPLAY.pre)}s`);
  say("");
  if (!Number.isFinite(brk)) bad("§3 could not read ROUND_BREAK out of engine.mjs — this section is measuring nothing");
  else if (REPLAY.wall >= brk) {
    bad(`§3 the replay is ${f2(REPLAY.wall)}s and the break is ${f2(brk)}s — the next round would be dealt over it`);
  } else if (brk - REPLAY.wall < 0.5) {
    bad(`§3 the replay leaves only ${f2(brk - REPLAY.wall)}s of the break — nothing may wait on this beat`);
  }
  if (REPLAY.pre < slowest) {
    bad(`§3 REPLAY.pre is ${f2(REPLAY.pre)}s and the slowest swing's contact closes ${f3(slowest)}s in — `
      + `the replay would open PART WAY THROUGH the killing swing`);
  }
  if (Math.abs(REPLAY.wall * REPLAY.rate - (REPLAY.pre + REPLAY.post)) > 1e-6) {
    bad(`§3 the constants do not close: wall*rate is ${f2(REPLAY.wall * REPLAY.rate)} and pre+post is ${f2(REPLAY.pre + REPLAY.post)}`);
  }
  if (Math.abs(REPLAY.wall * REPLAY.rate - (REPLAY.preFire + REPLAY.postFire)) > 1e-6) {
    bad(`§3 the FIRE constants do not close: wall*rate is ${f2(REPLAY.wall * REPLAY.rate)} `
      + `and preFire+postFire is ${f2(REPLAY.preFire + REPLAY.postFire)}`);
  }

  // ---- DOES THE BODY REACH THE TURF BEFORE THE REPLAY ENDS ----
  //
  // This was a DEFERRAL on the verdict line for two rounds: "the slowest death
  // is 0.09s short of the turf". It is a gate now, and the reason it could
  // become one is that the deferral was averaging two different deaths
  // together. `freezetest --phases=collapse` prints a `landed` column PER
  // CAUSE, and the 1.17s that did not fit is the FIRE — the one death in the
  // game with no swing in front of it, which was nonetheless being given
  // 0.92s of run-up derived from the slowest swing. Steel lands between 0.53s
  // and 0.82s and always did fit.
  //
  // The numbers below are freezetest's own, copied with the run they came from
  // named, and the gate is `postOf(cause) >= landing(cause)`. If a retune of
  // `wall`, `rate` or either split eats the margin, this fails and names the
  // cause rather than printing a note under a green count.
  const LANDINGS = [
    { cause: "blow", land: 0.82, of: "huscarl, waist/waist — the slowest STEEL landing of the seven" },
    { cause: "fire", land: 1.17, of: "huscarl, burnt — the slowest landing in the game" },
  ];
  say("");
  say("    THE BODY REACHES THE TURF BEFORE THE REPLAY ENDS   (freezetest --phases=collapse)");
  say("      cause   run-up   tail    lands    spare");
  for (const L of LANDINGS) {
    const pre = replay.runUpOf(L.cause);
    const post = replay.landingOf(L.cause);
    const spare = post - L.land;
    say(`      ${L.cause.padEnd(6)}  ${f2(pre)}s    ${f2(post)}s   ${f2(L.land)}s   ${spare >= 0 ? "+" : ""}${f2(spare)}s   ${L.of}`);
    if (spare < 0) {
      bad(`§3 a ${L.cause} death lands at ${f2(L.land)}s and the replay's tail is ${f2(post)}s — `
        + `the body is ${f2(-spare)}s off the turf when the replay cuts, which is the frozen-part-way `
        + `corpse this beat exists to show properly`);
    }
  }
  // AND THE RUN-UP THE CALLER COMPUTES MUST BE THE ONE THE MODULE PLAYS.
  // `GameCanvas` asks "is the ring still holding that far back" and `update()`
  // positions the read head; a second copy of the run-up in either place is
  // this repository's third named failure mode, so the export is asserted to
  // be the only definition rather than trusted to be.
  if (replay.runUpOf("fire") !== REPLAY.preFire || replay.runUpOf("blow") !== REPLAY.pre
      || replay.runUpOf(null) !== REPLAY.pre) {
    bad("§3 runUpOf does not agree with the constants it is supposed to be the single reading of");
  }
  return { brk, slowest, margin: brk - REPLAY.wall };
}

// ===========================================================================
// §4  THE MATCH-END HOLE — docs/BACKLOG.md 2.6
// ===========================================================================
async function sectionHole(replay) {
  rule("§4  THE DEATH THAT ENDS A MATCH   (docs/BACKLOG.md 2.6, still open)");
  const dc = await import(pathToFileURL(resolve(ROOT, "src/game/deathcam.mjs")).href);
  const { REPLAY } = replay;
  const DT = 1 / 60;
  const body = { x: 0, y: 0, z: 0 }, wound = { x: 0.3, y: 1.1, z: 0 };
  const spray = { x: 1, y: 0, z: 0 }, killer = { x: 0, y: 0, z: 2 };
  const cam = dc.createRoundCamera();

  /** Frames the existing LIVE round beat holds when the room ends like this. */
  const liveHeld = (state) => {
    cam.reset();
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const ended = state === "intermission";
      const shot = cam.update(DT, { ended, live: ended, own: false,
        body, wound, spray, part: null, killer, camera: { x: 0, y: 2, z: 6 }, groundAt: null });
      if (shot) n++;
    }
    return n;
  };
  /** Frames the REPLAY holds for the same two endings. */
  const replayHeld = (end) => {
    const clock = replay.createKillReplay();
    let n = 0, sawEnd = false;
    for (let i = 0; i < 400; i++) {
      const s = clock.update(DT, { ended: true, end, own: false, deathAt: 10, ready: true });
      if (s) { n++; sawEnd = sawEnd || s.atEnd; }
    }
    return { n, sawEnd };
  };

  const betweenRounds = liveHeld("intermission");
  const atMatchEnd = liveHeld("finished");
  const rBetween = replayHeld(false);
  const rEnd = replayHeld(true);
  say("");
  say(`    BACKLOG 2.6: "the death that ends the LAST round of a match" — the server`);
  say(`    goes "fighting" -> "finished" in one tick, there is no break, and`);
  say(`    render/summary.ts takes the lens for the victor's portrait on the same frame.`);
  say("");
  say(`                                  frames of hold   at the end of a match`);
  say(`    the LIVE round beat           ${String(betweenRounds).padStart(9)}       ${String(atMatchEnd).padStart(9)}`);
  say(`    the REPLAY                    ${String(rBetween.n).padStart(9)}       ${String(rEnd.n).padStart(9)}`);
  say("");
  say(`    the replay flags the ending it is in (\`atEnd\`), so the caller can hold the`);
  say(`    summary off and route a skip to the lobby: between rounds ${rBetween.sawEnd ? "true" : "false"}, at match end ${rEnd.sawEnd ? "true" : "false"}.`);
  say("");
  if (atMatchEnd !== 0) {
    bad(`§4 the live round beat held ${atMatchEnd} frames at match end — this section's premise is wrong, `
      + `re-read BACKLOG 2.6 before trusting anything else here`);
  }
  if (rEnd.n < Math.floor(REPLAY.wall * 60) - 2) {
    bad(`§4 the replay held only ${rEnd.n} frames at match end, not the ${Math.floor(REPLAY.wall * 60)} it claims — the hole is not filled`);
  }
  if (!rEnd.sawEnd) bad("§4 the replay did not flag a match ending, so a caller cannot route the skip to the lobby");
  if (rEnd.sawEnd && rBetween.sawEnd) bad("§4 the replay flags EVERY ending as a match ending");

  // ---- A STARVED RENDERER, AND WHOSE CLOCK THE BUDGET IS ON ----
  //
  // `REPLAY.wall` is the SERVER'S number — `ROUND_BREAK` less the second held
  // back for the countdown — so a replay that overruns it is a replay drawn
  // over the top of the next round's card, and at match end it is a summary
  // the player cannot reach. The orchestrator's `dt` is
  // `Math.min(frameMs / 1000, 0.05)` and is scaled again by 0.22 during
  // hit-stop; neither is a clock, and counting the budget in it made a four
  // second replay last as long as the renderer was slow.
  //
  // MEASURED on the shipped page before the fix, software rasteriser, real
  // duel at 390x844: 0.66 Hz, and 9.1 s of the player's life bought
  // `elapsed = 0.35` of 4.0. Only the server's rollback out of `finished`
  // ended it.
  //
  // So this drives the clock the way a starved frame does: a real frame of
  // `fps` Hz, handed to the animator CLAMPED at the orchestrator's own 0.05
  // and handed to the budget whole.
  const starved = (fps, hitStop) => {
    const clock = replay.createKillReplay();
    const wall = 1 / fps;
    const step = Math.min(wall, 0.05) * (hitStop ? 0.22 : 1);
    let n = 0, t = 0;
    for (let i = 0; i < 20000; i++) {
      const s = clock.update(step, { wall, ended: true, end: true, own: false, deathAt: 10, ready: true });
      if (!s) break;
      n++; t += wall;
    }
    return { n, t };
  };
  say(`    A STARVED RENDERER. The budget is the server's break, so it is counted in`);
  say(`    WALL seconds and not in the simulation dt the animator is stepped with:`);
  say("");
  say(`      frame rate      frames drawn     wall seconds the replay lasted`);
  for (const [fps, label] of [[60, "60 Hz"], [20, "20 Hz"], [5, "5 Hz"], [0.66, "0.66 Hz"]]) {
    const r = starved(fps, false);
    say(`      ${label.padStart(10)}      ${String(r.n).padStart(8)}     ${f2(r.t).padStart(10)}s`);
    if (r.t > REPLAY.wall + 0.5) {
      bad(`§4 at ${label} the replay ran ${f2(r.t)}s of wall clock, not the ${f2(REPLAY.wall)}s `
        + `REPLAY.wall claims — the budget is being counted in the simulation's clamped dt`);
    }
    if (r.n < 1) bad(`§4 at ${label} the replay drew no frames at all`);
  }
  const hs = starved(60, true);
  say(`      60 Hz, hit-stop  ${String(hs.n).padStart(8)}     ${f2(hs.t).padStart(10)}s`);
  if (hs.t > REPLAY.wall + 0.5) {
    bad(`§4 hit-stop stretched the replay to ${f2(hs.t)}s of wall clock — the countdown is `
      + `riding the slow-motion dt`);
  }
  say("");

  // ---- the skip, and what it means at each ending ----
  const skipAt = (end) => {
    const clock = replay.createKillReplay();
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const s = clock.update(DT, { ended: true, end, own: false, deathAt: 10, ready: true });
      if (!s) break;
      n++;
      if (n === 30) clock.skip();
    }
    return { n, skipped: clock.skipped, atEnd: clock.atEnd };
  };
  const sEnd = skipAt(true), sMid = skipAt(false);
  say(`    SKIPPED on frame 30: between rounds it ends after ${sMid.n} frame(s); at match end`);
  say(`    after ${sEnd.n}, with skipped=${sEnd.skipped} and atEnd=${sEnd.atEnd} — which is what routes the`);
  say(`    viewer to the lobby instead of back into an arena with no match in it.`);
  say("");
  if (sEnd.n > 31 || sMid.n > 31) bad(`§4 skip did not end the replay on the next frame (${sMid.n}/${sEnd.n} frames)`);
  if (!sEnd.skipped || !sEnd.atEnd) bad("§4 a skipped match-end replay does not report itself as one");

  // ---- precedence: your own death outranks it, as deathcam.mjs rules ----
  const own = (() => {
    const clock = replay.createKillReplay();
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const s = clock.update(DT, { ended: true, end: false, own: true, deathAt: 10, ready: true });
      if (s) n++;
    }
    return n;
  })();
  say(`    PRECEDENCE, the rule deathcam.mjs states: your own death outranks this and`);
  say(`    the beat is never queued. With the viewer's own hold running the replay held`);
  say(`    ${own} frame(s) between rounds.`);
  say("");
  if (own !== 0) bad(`§4 the replay took the lens over the viewer's own death hold (${own} frames)`);

  // ---- AND WHAT THE MAN WHO DIED SEES, WHICH IS THE HALF THAT WAS WRONG ----
  //
  // The line above drives `own` as a flag held true forever. That is not a
  // viewer; it is a hypothesis about one. This drives the REAL
  // `createDeathCamera` beside the real replay clock, in the order and with the
  // arguments `GameCanvas.tsx` uses — `own` read BEFORE the cameras run, so it
  // is the previous frame's answer here exactly as it is there, and `live` =
  // fighting | last_stand | intermission, which is `runDeathCam`'s own list.
  //
  // The axis is HOW LONG BEFORE THE ROOM ENDED THE VIEWER DIED, because that is
  // what decides whether his hold is still running on the edge. It is swept
  // rather than sampled at one value: the refutation this section was rewritten
  // for named "the man who dies last", and the man who dies last (gap 0) was the
  // one case that already worked — his hold has not armed on the previous frame
  // either. Everything from one render frame up to `DEATH_HOLD.total` was the
  // hole, and one sample would have found either the hole or the exception
  // depending on which value it picked.
  const GAPS = [0, DT, 0.10, 0.50, 1.00, 2.00, 3.00, dc.DEATH_HOLD.total - 0.01,
    dc.DEATH_HOLD.total + 0.05, 5.00];
  const viewer = (gap, endState) => {
    const clock = replay.createKillReplay();
    const hold = dc.createDeathCamera();
    let own = false, n = 0, held = 0, sawEnd = false;
    const endAt = Math.round(gap / DT);
    for (let i = 0; i < 900; i++) {
      const state = i < endAt ? "fighting" : endState;
      const s = clock.update(DT, {
        ended: state === "intermission" || state === "finished",
        end: state === "finished",
        own, deathAt: 10, ready: true,
      });
      if (s) { n++; sawEnd = sawEnd || s.atEnd; }
      // `runDeathCam`'s own list, and `finished` is not on it: the transition
      // into it STOPS the hold, later in the same frame that offered the edge.
      const live = state === "fighting" || state === "last_stand" || state === "intermission";
      hold.update(DT, { dead: true, live, camera: { x: 0, y: 2, z: 6 },
        body, wound, spray, part: null, killer, groundAt: null });
      if (hold.holding) held++;
      own = hold.holding;              // GameCanvas reads it here: LAST frame's
    }
    return { n, held, sawEnd };
  };
  const want = Math.floor(REPLAY.wall * 60);
  say(`    THE VIEWER WHO DIED, driven against the real createDeathCamera in`);
  say(`    GameCanvas's order. How long before the room ended did he die:`);
  say("");
  say(`      gap(s)   his own hold ran   replay frames, MATCH END   ...ROUND END`);
  let endWorst = Infinity, endWorstGap = 0;
  for (const gap of GAPS) {
    const e = viewer(gap, "finished"), m = viewer(gap, "intermission");
    if (e.n < endWorst) { endWorst = e.n; endWorstGap = gap; }
    say(`      ${f2(gap).padStart(6)}   ${String(e.held).padStart(16)}   ${String(e.n).padStart(23)}   ${String(m.n).padStart(12)}`);
  }
  say("");
  say(`    THE MATCH-END COLUMN IS THE GATE. Every gap must draw the whole ${want}, because`);
  say(`    at match end the viewer's hold does not survive the edge that offers the`);
  say(`    replay — deathcam.mjs's \`live\` excludes "finished" — so there is no hold`);
  say(`    left for it to outrank. The ROUND-END column is deathcam.mjs's rule and is`);
  say(`    printed, not gated: there the hold does survive, it keeps the lens, and`);
  say(`    3.35s of hold plus ${f2(REPLAY.wall)}s of replay does not fit a 5s break.`);
  say("");
  if (endWorst < want) {
    bad(`§4 a viewer who died ${f2(endWorstGap)}s before the match ended saw ${endWorst} replay frames, not ${want} — `
      + `the owner asked for the replay "before a match ends too" and this is the man it landed on`);
  }
  return { betweenRounds, atMatchEnd, rBetween: rBetween.n, rEnd: rEnd.n, own,
    endWorst, endWorstGap };
}

// ===========================================================================
// §5  WHAT THE RING COSTS
// ===========================================================================
function sectionCost(replay) {
  rule("§5  WHAT THE RING COSTS   (measured, and measured again after use)");
  const { REPLAY, createReplayBuffer } = replay;
  const buf = createReplayBuffer();
  const before = buf.bytes;
  const men = [];
  for (let i = 0; i < 8; i++) men.push({ id: `p${i}`, warriorClass: "warden", team: "none",
    position: { x: i, y: 0, z: 0 }, rotation: 0, velocity: { x: 0, y: 0, z: 0 },
    state: "walking", attackDir: "right", health: 100, maxHealth: 100,
    attackTimer: 0, swingT: 0, swingDuration: 0.85, blockTimer: 0, staggerTimer: 0,
    downTimer: 0, hitstop: 0, deathZone: null, deathDir: null, deathCause: null,
    swingHeavy: false, invincible: false, abilityActive: false, deathHeavy: false });
  for (let i = 0; i < 2000; i++) buf.record(i / REPLAY.hz, men);
  const after = buf.bytes;
  const perManFrame = before / (buf.cap * buf.seats);
  say("");
  say(`    seats                        ${String(buf.seats).padStart(8)}`);
  say(`    frames held (${f2(REPLAY.history)}s at ${REPLAY.hz} Hz) ${String(buf.cap).padStart(8)}`);
  say(`    bytes, allocated once        ${String(before).padStart(8)}   = ${f1(before / 1024)} KiB`);
  say(`    bytes after 2000 recorded frames  ${String(after).padStart(3)}   ${after === before ? "— UNCHANGED, nothing allocated on the hot path" : "— IT GREW"}`);
  say(`    per man per frame            ${f1(perManFrame)} B`);
  say("");
  say(`    For scale, protocoltest measures ONE game_state broadcast at 10,517 B for`);
  say(`    eight men. A ring of ${buf.cap} of those would be ${f1(buf.cap * 10517 / 1024)} KiB of JSON, churned`);
  say(`    into the collector at ${REPLAY.hz} Hz. This holds the same window for ${f1(before / 1024)} KiB.`);
  say("");
  if (after !== before) bad(`§5 the ring grew from ${before} to ${after} bytes while recording — it is allocating per frame`);
  // THE RING MUST OUTLAST THE LAG, AND THE LAG IS NOT `pre`. The read head
  // falls further behind the write head every frame, because recording runs at
  // life speed and playback at `rate`. At the last frame of the replay the read
  // head is at `death + post` and the write head is at `death + wall`, so the
  // worst lag is `pre + wall * (1 - rate)`. Asserted as the identity rather
  // than against the number, so retuning `rate` or `wall` cannot quietly make
  // the ring too short. It was 3.0 s and this is the check that caught it.
  const lag = REPLAY.pre + REPLAY.wall * (1 - REPLAY.rate);
  say(`    worst read-head lag  pre + wall*(1-rate) = ${f2(lag)}s   against ${f2(REPLAY.history)}s of ring`);
  say("");
  if (REPLAY.history < lag) {
    bad(`§5 the ring holds ${f2(REPLAY.history)}s and the read head falls ${f2(lag)}s behind — `
      + `the write head laps it and the replay asks for a frame that has been overwritten`);
  } else if (REPLAY.history < lag * 1.2) {
    bad(`§5 the ring clears the ${f2(lag)}s lag by only ${f2(REPLAY.history - lag)}s — that is not a margin`);
  }
  return { bytes: before, cap: buf.cap, perManFrame };
}

// ===========================================================================
(async () => {
  say("");
  say(`  REPLAYTEST — the final kill as a RECORDING, and not the live lens slowed.`);
  say(`  Sections: ${ONLY.join(", ")}${LEVER ? `   LEVER: ${LEVER}` : ""}`);
  const anim = await loadAnim();
  if (!anim) { say("  anim.ts would not compile — nothing can be measured. VOID."); process.exit(2); }
  const mod = await import(pathToFileURL(resolve(ROOT, "src/game/replay.mjs")).href);
  // A MUTABLE FACADE, because an ES module namespace is frozen and a lever has
  // to be able to replace what the sections call. Every section takes this
  // object and never the module, so a levered run and a clean run go down the
  // same code path with one function swapped underneath them.
  const replay = { REPLAY: mod.REPLAY, createReplayBuffer: mod.createReplayBuffer,
    createKillReplay: mod.createKillReplay,
    // The run-up split, forwarded rather than re-derived. §3 gates that these
    // ARE the module's own reading of the constants; a copy here would make
    // that gate a tautology.
    runUpOf: mod.runUpOf, landingOf: mod.landingOf };

  // -------------------------------------------------------------------------
  // R1 — PULL THE LEVER. Both of these sabotage the ruler's own claim rather
  // than the build: if §1 stays green with the recording turned into a mirror
  // of the present, §1 is not comparing what it says it compares.
  // -------------------------------------------------------------------------
  if (LEVER === "live") {
    // Make the replay show the PRESENT instead of the past — a slowed live
    // camera, exactly the thing this file exists to refuse. §1 and §2 must go
    // red; if they do not, this harness cannot tell the two apart.
    const real = replay.createKillReplay;
    replay.createKillReplay = () => {
      const c = real();
      const u = c.update.bind(c);
      return { update: (dt, s) => { const r = u(dt, s); if (!r) return null;
          return { ...r, at: s.deathAt + r.through * replay.REPLAY.post }; },
        skip: () => c.skip(), reset: () => c.reset(),
        get elapsed() { return c.elapsed; }, get playing() { return c.playing; },
        get atEnd() { return c.atEnd; }, get skipped() { return c.skipped; } };
    };
    say(`  R1 LEVER ON (live): the replay now shows the present, not the past.`);
  } else if (LEVER === "clock") {
    say(`  R1 LEVER ON (clock): ctx.time is driven off the wall instead of off \`at\`.`);
  } else if (LEVER === "drift") {
    // Slow the recorded clock without slowing the animator's, and without
    // changing REPLAY.rate. §1's phase bar must catch it — the replayed frames
    // fall further behind the frames they claim to be, every frame — and §2's
    // measured rate must stop matching the declared one.
    const real = replay.createKillReplay;
    replay.createKillReplay = () => {
      const c = real();
      const u = c.update.bind(c);
      return { update: (dt, s) => { const r = u(dt, s); if (!r) return null;
          return { ...r, at: s.deathAt - replay.REPLAY.pre + c.elapsed * replay.REPLAY.rate * 0.6 }; },
        skip: () => c.skip(), reset: () => c.reset(),
        get elapsed() { return c.elapsed; }, get playing() { return c.playing; },
        get atEnd() { return c.atEnd; }, get skipped() { return c.skipped; } };
    };
    say(`  R1 LEVER ON (drift): the recorded clock runs at 0.6 of the declared rate.`);
  } else if (LEVER) {
    say(`  LEVER MISSED (${LEVER}): no such lever. Result VOID.`);
    LEVER_MISSED = true;
  }

  const R = {};
  if (has("record")) R.record = await sectionRecord(anim, replay);
  if (has("clock")) R.clock = sectionClock(replay, R.record);
  if (has("budget")) R.budget = await sectionBudget(replay);
  if (has("hole")) R.hole = await sectionHole(replay);
  if (has("cost")) R.cost = sectionCost(replay);

  rule("VERDICT");
  if (LEVER_MISSED) {
    say(`  VOID — a lever was asked for that does not exist, so this run measured the`);
    say(`  unsabotaged build while claiming otherwise. No verdict is offered.`);
    process.exit(2);
  }
  if (LEVER) {
    say(`  This run was SABOTAGED (--lever=${LEVER}). It is a test of the ruler, not of`);
    say(`  the build: compare with an unlevered run, and if the numbers did not MOVE`);
    say(`  this harness is not measuring what it claims.`);
  }
  if (R.record) {
    say(`  §1 RECORD   ${R.record.compared} frame(s) of a real fight replayed off the ring. Worst pose `
      + `${f2(R.record.excessWorst)}° outside the live track's`);
    say(`              own sampling bracket (bar ${f2(BAR.pose)}°), worst ${f3(R.record.offWorst)}s from the moment it `
      + `claims (bar ${f3(BAR.phase)}s; raw argmin ${f3(R.record.rawOffWorst)}s).`);
  }
  if (R.clock) {
    say(`  §2 CLOCK    opens ${f2(R.clock.deathAt - R.clock.opensAt)}s BEFORE the blow and runs at `
      + `${f3(R.clock.rate)}x over ${f2(R.clock.wall)}s of wall clock.`);
  }
  if (R.budget) {
    say(`  §3 BUDGET   ${f2(replay.REPLAY.wall)}s inside a ${f2(R.budget.brk)}s break, ${f2(R.budget.margin)}s spare.`);
  }
  if (R.hole) {
    say(`  §4 2.6      the live beat holds ${R.hole.atMatchEnd} frames at match end; the replay holds ${R.hole.rEnd}.`);
  }
  if (R.cost) {
    say(`  §5 COST     ${R.cost.bytes} B (${f1(R.cost.bytes / 1024)} KiB), ${f1(R.cost.perManFrame)} B per man per frame, no growth.`);
  }
  say("");
  if (fails.length) {
    say(`  RED — ${fails.length} finding(s):`);
    for (const f of fails) say(`    - ${f}`);
  } else if (notes.length) {
    say(`  PASS: the replay is a recording — WITH ${notes.length} deferral(s) on this line and`);
    say(`  not below it, which is a deferral and not a clean sheet:`);
    for (const n of notes) say(`    - ${n}`);
  } else {
    say(`  GREEN.`);
  }
  say("");
  process.exit(GATE && fails.length ? 1 : 0);
})();
