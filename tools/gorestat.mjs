#!/usr/bin/env node
// ============================================================
// GORESTAT — the two statistics `goretest.mjs` gates the blood on, and whether
// either of them can tell better from worse.
//
//   node tools/gorestat.mjs
//   node tools/gorestat.mjs --wounds 60 --bystanders 300
//   node tools/gorestat.mjs --quick            # a third of the sample, for iterating
//
// TWO INCIDENTS, both found by an adversary and both left open rather than
// half-fixed. This file is the answer to them and it owns no `src/` file.
//
// INCIDENT ONE — THE PULSE GATE SCORES THE WORSE SURFACE HIGHER.
// A running stump is meant to spurt: the emission is modulated by a heartbeat at
// 9.2 rad/s and the gate's claim is that "the spray falls away between beats — a
// hose does not". The metric was `1 - min/max` of the number of BLOOD DROPLETS
// IN THE AIR over a window. On `main`'s shallower `0.42 + 0.58` pulse it returned
// 100%; on a branch's deeper `0.18 + 0.82` pulse it returned 97%. It ranked the
// shallower surface FIRST. The unit had already recorded that its previous pulse
// metric moved the wrong way when the property improved; the replacement had the
// same fault pointing the other way.
//
// THE DIAGNOSIS, which is the whole reason a replacement is safe to trust:
//   * It is an EXTREMUM RATIO. One frame of the window decides it. The moment
//     the air happens to empty, `min` is 0 and the score is 100% — saturated,
//     unable to rank anything above it, and reached most easily by the WEAKEST
//     spray, because a weak spray is the one that runs out of droplets.
//   * It is measured on the STANDING POPULATION, which is the emission smeared
//     by however long a droplet stays up, so it answers with airtime as readily
//     as with pulse. P6 puts the two side by side: the old metric separates two
//     surfaces whose HEARTBEATS differ no better than it separates two surfaces
//     whose heartbeats are identical and whose THROW is not.
//   * It was read ONE WOUND AT A TIME. P4 and P7 measure what that costs: across
//     six floors spanning eighty points of real depth the old metric's whole
//     range is narrower than the scatter of its own readings inside a single
//     floor, so which surface "wins" is decided by which wound came up. Nothing
//     about that is fixed by averaging it here — it is reported as the rate at
//     which a single wound gets the real pair backwards, which is what the gate
//     it lives in was actually doing.
//
// THE REPLACEMENT measures the EMISSION and not the population: how many
// droplets the wound actually THROWS, folded onto the heartbeat's own phase over
// many wounds. It cannot be moved by airtime, because a droplet's flight is over
// after it is counted. It is CALIBRATED rather than merely ordered — for a pulse
// floor `f` the answer is known in closed form, and claim P3 gates the metric
// against that known answer at six floors.
//
// INCIDENT TWO — A SEED LOTTERY IN THE BYSTANDER CELL.
// "Blood lands on the man standing next to him, at every frame rate" was gated
// on the MEAN OF SIX WOUNDS being at least one mark. Nine runs on an unchanged
// tree gave eight passes and one failure: the bar sat on the mode of a
// six-sample mean. That is a coin, not a gate — the sibling of the sound unit's
// seed lottery. Section B samples the distribution instead, gates the per-wound
// probability, and MEASURES how often each statistic would fire on an unchanged
// tree by resampling its own pool.
//
// HOW THE FIXTURES ARE BUILT WITHOUT TOUCHING `src/`.
// `vfx.ts` is transpiled into `.gorestat/` the same way `goretest.mjs` and
// `wearmeasure.mjs` do it, and the EMITTED JAVASCRIPT is then rewritten: the
// pulse floor and the throwing-speed law are substituted, and one counter is
// spliced in beside the emitter so every droplet the jet throws is counted at
// the instant it is thrown. The repository is untouched; the code under test is
// the real module, line for line, with two constants moved. Every substitution
// is asserted to have landed (claim P1) — a patch that silently missed would
// otherwise turn the whole ladder into six copies of one surface.
//
// Exits non-zero if any claim fails.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import * as THREE from "three";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".gorestat");
const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const QUICK = has("quick");
const WOUNDS = Math.max(8, Number(flag("wounds", QUICK ? 24 : 60)));
const BYST = Math.max(20, Number(flag("bystanders", QUICK ? 60 : 240)));
const TIER = flag("tier", "high");

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// ---------------------------------------------------------------- transpile
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/render/vfx.ts",
  "--outDir", ".gorestat", "--target", "es2022", "--module", "esnext",
  "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const emitted = [];
const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
  const f = resolve(dir, e.name);
  if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f);
} };
if (existsSync(OUT)) walk(OUT);
for (const f of emitted) {
  const src = readFileSync(f, "utf8");
  const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c));
  if (fixed !== src) writeFileSync(f, fixed);
}
const vfxJs = emitted.find((f) => f.endsWith("vfx.js"));
const qualityJs = emitted.find((f) => f.endsWith("quality.js"));
if (!vfxJs || !qualityJs) {
  console.error("[gorestat] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || ""));
  process.exit(2);
}
const { QUALITY_PRESETS } = await import(pathToFileURL(qualityJs).href);

// -------------------------------------------------------- the emitted rewrite
//
// Three surgeries, each on one line of the emitted jet, each asserted.
//
//   BIRTHS   a counter beside `j.acc -= n`, which is the only place the running
//            jet ever throws a droplet. This is the whole instrument: it counts
//            what the wound EMITS, at the frame it emits it, before anything can
//            have flown, landed or expired.
//   PULSE    the floor and span of the heartbeat, so a ladder of known depths can
//            be built out of the real module rather than out of a model of it.
//   SPEED    the throw's speed law, so the airtime confound can be turned on by
//            itself with the pulse held still.
const BASE = readFileSync(vfxJs, "utf8");
const PULSE_RE = /const pulse = ([\d.]+) \+ ([\d.]+) \* Math\.pow\(Math\.max\(0, Math\.sin\(j\.age \* ([\d.]+)\)\), ([\d.]+)\);/;
const SPEED_RE = /\(([\d.]+) \+ ([\d.]+) \* j\.power\) \* \(([\d.]+) \+ pulse \* ([\d.]+)\)/;
const ACC_RE = /(j\.acc -= n;)/;
const tree = BASE.match(PULSE_RE);
const treeSpeed = BASE.match(SPEED_RE);
if (!tree || !treeSpeed || !ACC_RE.test(BASE)) {
  console.error("[gorestat] the jet in vfx.ts no longer has the shape this harness rewrites:\n"
    + `  pulse line ${tree ? "found" : "MISSING"}, speed law ${treeSpeed ? "found" : "MISSING"}, `
    + `emitter ${ACC_RE.test(BASE) ? "found" : "MISSING"}\n`
    + "  This is a hard stop rather than a skip: a fixture that quietly failed to\n"
    + "  patch would run six copies of one surface and call the ladder monotone.");
  process.exit(2);
}
/** The heartbeat, in radians a second, straight out of the module. */
const OMEGA = parseFloat(tree[3]);
const SHARP = parseFloat(tree[4]);
/** The tree's own pulse floor and its own speed law, as read. */
const TREE_FLOOR = parseFloat(tree[1]);
const TREE_SPEED = { a: parseFloat(treeSpeed[1]), b: parseFloat(treeSpeed[2]), c: parseFloat(treeSpeed[3]), d: parseFloat(treeSpeed[4]) };
// The other real surface, so the pair the adversary compared can be reproduced
// exactly. These four numbers are the branch's, quoted in its commit message:
// "Running jet (1.4 + 2.1·p)·(0.55 + 0.6·pulse) -> (2.6 + 4.2·p)·(0.30 + 0.95·
// pulse)" with the pulse floor 0.42 -> 0.18.
const DEEP_FLOOR = 0.18;
const DEEP_SPEED = { a: 2.6, b: 4.2, c: 0.30, d: 0.95 };

let builds = 0;
const patched = new Map();
/** An emitted copy of the real module with a chosen floor and speed law. */
async function build(tag, floor, speed) {
  if (patched.has(tag)) return patched.get(tag);
  let js = BASE;
  const hits = [];
  js = js.replace(PULSE_RE, (m, a, b, w, s) => {
    hits.push("pulse");
    return `const pulse = ${floor} + ${(1 - floor).toFixed(4)} * Math.pow(Math.max(0, Math.sin(j.age * ${w})), ${s});`;
  });
  js = js.replace(SPEED_RE, () => {
    hits.push("speed");
    return `(${speed.a} + ${speed.b} * j.power) * (${speed.c} + pulse * ${speed.d})`;
  });
  js = js.replace(ACC_RE, "$1 globalThis.__births = (globalThis.__births || 0) + n;");
  if (hits.length !== 2) throw new Error(`[gorestat] patch for ${tag} landed ${hits.length}/2 substitutions`);
  const file = resolve(dirname(vfxJs), `vfx-${tag}.js`);
  writeFileSync(file, js);
  builds++;
  const mod = await import(pathToFileURL(file).href);
  patched.set(tag, mod);
  return mod;
}

// ------------------------------------------------------------------- the stage
//
// The same bare stage `goretest.mjs` builds: a group named `warrior:<id>` with a
// `spine` child, which is the only seam `vfx.ts` has with the rigs.
function makeStage(mod, tier = TIER) {
  const scene = new THREE.Scene();
  const field = new THREE.Group();
  field.name = "arena";
  scene.add(field);
  const settings = { ...QUALITY_PRESETS[tier] };
  const vfx = mod.createVfx(scene, { maxAnisotropy: 1 }, settings, { groundAt: () => 0, autoFires: false });
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 300);
  camera.position.set(0, 3, 14);
  camera.lookAt(0, 1.2, 0);
  camera.updateMatrixWorld(true);
  const rigs = new Map();
  const ensure = (id) => {
    let r = rigs.get(id);
    if (!r) {
      const group = new THREE.Group();
      group.name = `warrior:${id}`;
      const spine = new THREE.Group();
      spine.name = "spine";
      spine.position.y = 1.02;
      group.add(spine);
      field.add(group);
      r = { group, spine };
      rigs.set(id, r);
    }
    return r;
  };
  const ctx = {
    dt: 1 / 60, rawDt: 1 / 60, time: 0, camera,
    focus: new THREE.Vector3(0, 1, 0), localId: "", localState: null,
    mood: "dusk", quality: settings,
  };
  return { scene, field, vfx, ctx, ensure, settings };
}

// ============================================================
// SECTION A — THE PULSE.
// ============================================================
//
// The window is TWO WHOLE HEARTBEATS and not a round number of seconds, and that
// is not fussiness. The emission also decays as (1 − t)^1.6 across the wound's
// life, so a window holding two and a bit beats gives the extra bit of one beat
// to whichever phase it lands on and biases the fold. An integer number of
// periods gives every phase bin exactly the same set of ages.
const PERIOD = (2 * Math.PI) / OMEGA;
const WINDOW = { from: 0.12, to: 0.12 + 2 * PERIOD };
const BINS = 12;
// The window the OLD metric used, kept exactly: 0.55 s to 2.1 s of one wound's
// life. It matters, and the first cut of this file got it wrong — over a shorter
// window the air never empties, `min` is never 0, and the old metric looks far
// better behaved than it is. A reproduction that is kind to the thing it is
// reproducing proves nothing.
const OLD_WINDOW = { from: 0.55, to: 2.1 };
/** Where in the heartbeat a bin sits, in radians. */
const binPhase = (i) => ((i + 0.5) / BINS) * 2 * Math.PI;
/** The systolic band — the top of the beat — and the diastolic half between beats. */
const isPeak = (phi) => phi > 0.35 * Math.PI && phi < 0.65 * Math.PI;
const isTrough = (phi) => phi > Math.PI;

/**
 * The metric. Fold the EMISSION onto the heartbeat's phase and ask how far it
 * falls between beats.
 *
 * Deliberately the same functional as the ideal pulse below, so the two are
 * comparable exactly rather than approximately: `predictedDepth(f)` runs this
 * arithmetic on the pulse `vfx.ts` actually writes, and P3 gates the measured
 * answer against it.
 */
function depthOf(profile) {
  let peak = 0;
  let peakN = 0;
  let trough = 0;
  let troughN = 0;
  for (let i = 0; i < BINS; i++) {
    const phi = binPhase(i);
    if (isPeak(phi)) { peak += profile[i]; peakN++; }
    if (isTrough(phi)) { trough += profile[i]; troughN++; }
  }
  const p = peakN ? peak / peakN : 0;
  const t = troughN ? trough / troughN : 0;
  return p > 0 ? 1 - t / p : 0;
}
/** What `depthOf` must return for a pulse floor of `f`, from the module's own law. */
function predictedDepth(f) {
  const ideal = [];
  for (let i = 0; i < BINS; i++) {
    // Each bin averaged over the phase it covers, exactly as the fold does.
    let s = 0;
    const steps = 64;
    for (let k = 0; k < steps; k++) {
      const phi = ((i + (k + 0.5) / steps) / BINS) * 2 * Math.PI;
      s += f + (1 - f) * Math.pow(Math.max(0, Math.sin(phi)), SHARP);
    }
    ideal.push(s / steps);
  }
  return depthOf(ideal);
}

/**
 * One surface, measured. `wounds` severed necks, each followed for the whole
 * window, with every droplet the jet throws counted at the frame it is thrown
 * and folded onto the heartbeat's phase.
 *
 * The old metric is computed on THE SAME RUNS, from the same census the old one
 * read, so the two rankings below cannot be argued to be about different data.
 */
async function surface(tag, floor, speed, wounds = WOUNDS) {
  const mod = await build(tag, floor, speed);
  const dt = 1 / 120;
  // A ratio of sums, not a sum of ratios: `num` is the blood thrown in this
  // phase of the beat and `den` is what the wound was throwing on average
  // AROUND that moment, so the profile is the pulse with the wound's own slow
  // fade divided out.
  //
  // THE FADE HAD TO GO AND IT COULD NOT BE ASSUMED AWAY. A jet's rate decays
  // over its life, so bins near the start of the window see a wound throwing
  // three times as hard as bins near the end — and the first cut of this
  // measurement read that decay as pulse depth and came back 9 to 25 points high
  // at every rung. The de-trend is a centred boxcar exactly ONE HEARTBEAT wide,
  // which averages the pulse away exactly and leaves the fade: that is the only
  // property of the fade it uses, so this harness holds no second copy of a
  // constant `vfx.ts` owns. Mirrored definitions are failure mode 3 and this
  // file will not be adding a fifth.
  const num = new Array(BINS).fill(0);
  const den = new Array(BINS).fill(0);
  // The same fold kept separately for odd and even wounds. Two independent
  // halves of the same sample are the cheapest honest estimate of the ruler's
  // own noise, and claim P7 needs it: a ruler whose halves disagree by more than
  // the gap it is asked to resolve is a lottery, which is precisely what the old
  // metric turned out to be.
  const halves = [{ num: new Array(BINS).fill(0), den: new Array(BINS).fill(0) },
    { num: new Array(BINS).fill(0), den: new Array(BINS).fill(0) }];
  let thrown = 0;
  let saturated = 0;
  const oldScores = [];
  const halo = Math.round(PERIOD / dt / 2);
  for (let w = 0; w < wounds; w++) {
    const stage = makeStage(mod);
    const rig = stage.ensure("subject");
    rig.group.position.set(0, 0, 0);
    stage.scene.updateMatrixWorld(true);
    // A bearing that moves with the repeat, so nothing below can be a property
    // of one direction. The stump is ORIENTED, because `stepJets` re-reads the
    // spray axis off the node's own +Y every frame.
    const bearing = (w / wounds) * Math.PI * 2;
    const axis = { x: Math.cos(bearing) * 0.89, y: 0.45, z: Math.sin(bearing) * 0.89 };
    const al = Math.hypot(axis.x, axis.y, axis.z);
    axis.x /= al; axis.y /= al; axis.z /= al;
    const stump = new THREE.Group();
    stump.position.set(0, 0.44, 0);
    stump.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(axis.x, axis.y, axis.z));
    rig.spine.add(stump);
    stage.scene.updateMatrixWorld(true);
    // THE SECTION OF THE CUT IS VARIED ACROSS THE REPEATS, from a throat to a
    // waist, and this is load-bearing rather than decorative. The emitter is an
    // ACCUMULATOR: it throws a droplet each time a running total crosses one, so
    // for a fixed wound every repeat emits on exactly the same frames and a
    // hundred repeats are one repeat measured a hundred times. The first cut of
    // this file did that and folded a comb — the diastolic bins came back
    // spanning 296% of their own mean, which is not a heartbeat, it is aliasing.
    // Spreading the section over the range `characters.ts` actually cuts moves
    // the comb's teeth between repeats, and it makes the claim about every stump
    // rather than about one radius. The per-wound rate this changes divides out:
    // the fold is a ratio against that wound's own local mean.
    const radius = 0.07 + 0.12 * ((w * 0.6180339887) % 1);
    stage.vfx.severed({ position: { x: 0, y: 1.46, z: 0 }, direction: axis, radius, stump, zone: "neck", power: 1 });

    const air = [];
    const perFrame = [];
    for (let f = 0; f < Math.round((OLD_WINDOW.to + 0.05) / dt); f++) {
      globalThis.__births = 0;
      stage.ctx.time += dt; stage.ctx.dt = dt; stage.ctx.rawDt = dt;
      stage.vfx.update(dt, stage.ctx);
      // The jet's age at this frame is the number of frames it has been stepped.
      const age = (f + 1) * dt;
      const c = stage.vfx.census();
      perFrame.push(globalThis.__births);
      if (age >= OLD_WINDOW.from && age < OLD_WINDOW.to) air.push(c.combatParticles);
      // A budget that clips the top of a beat would flatten the very thing
      // being measured, so it is watched rather than assumed.
      if (c.particles >= stage.settings.particleBudget - 8) saturated++;
    }
    for (let f = 0; f < perFrame.length; f++) {
      const age = (f + 1) * dt;
      if (age < WINDOW.from || age >= WINDOW.to) continue;
      let local = 0;
      let localN = 0;
      for (let k = Math.max(0, f - halo); k <= Math.min(perFrame.length - 1, f + halo); k++) {
        local += perFrame[k];
        localN++;
      }
      const phi = (age * OMEGA) % (2 * Math.PI);
      const bin = Math.min(BINS - 1, Math.floor((phi / (2 * Math.PI)) * BINS));
      num[bin] += perFrame[f];
      den[bin] += localN ? local / localN : 0;
      halves[w % 2].num[bin] += perFrame[f];
      halves[w % 2].den[bin] += localN ? local / localN : 0;
      thrown += perFrame[f];
    }
    // THE OLD METRIC, verbatim: one wound, the extremum ratio of the number of
    // droplets in the air, over its own window. It was computed on the FIRST
    // repeat only, which is the third fault — it is a single draw. Every wound is
    // scored here so its spread can be shown.
    const hi = air.reduce((m, v) => Math.max(m, v), 0);
    const lo = air.reduce((m, v) => Math.min(m, v), Infinity);
    oldScores.push(hi > 0 ? 1 - lo / hi : 0);
  }
  const profile = num.map((b, i) => (den[i] > 0 ? b / den[i] : 0));
  const halfDepths = halves.map((h) => depthOf(h.num.map((b, i) => (h.den[i] > 0 ? b / h.den[i] : 0))));
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  return {
    tag, floor, speed, wounds, thrown, saturated,
    profile,
    depth: depthOf(profile),
    halfGap: Math.abs(halfDepths[0] - halfDepths[1]),
    predicted: predictedDepth(floor),
    old: mean(oldScores),
    oldScores,
    oldWorst: Math.min(...oldScores),
    oldBest: Math.max(...oldScores),
  };
}

/**
 * How often one wound's reading of A beats one wound's reading of B, ties split.
 *
 * THE CLAIMS BELOW ARE ABOUT THIS AND NOT ABOUT TWO MEANS, and the reason is the
 * lesson this unit was handed: a verdict that turns on the difference of two
 * noisy averages is a verdict that turns on the sample size. The old metric was
 * used ONE WOUND AT A TIME, so the honest question about it is how often a single
 * wound gets the pair the wrong way round — which is a property of the metric,
 * stable to measure, and does not improve merely because this harness ran more
 * repeats than the harness it is judging.
 */
function overlap(a, b) {
  let wins = 0;
  for (const x of a) for (const y of b) wins += x > y ? 1 : x === y ? 0.5 : 0;
  return wins / (a.length * b.length);
}
/** 0 = blind, 1 = tells them apart every time. */
const power = (a, b) => Math.abs(2 * overlap(a, b) - 1);

console.log(`\n[gorestat] the jet as this tree writes it: pulse ${TREE_FLOOR} + ${(1 - TREE_FLOOR).toFixed(2)}·sin^${SHARP}, `
  + `${OMEGA} rad/s (${(OMEGA / (2 * Math.PI) * 60).toFixed(0)} bpm), speed (${TREE_SPEED.a} + ${TREE_SPEED.b}·p)·(${TREE_SPEED.c} + ${TREE_SPEED.d}·pulse)`);
console.log(`[gorestat] ${WOUNDS} wounds a surface, folded over ${(WINDOW.to - WINDOW.from).toFixed(2)}s = two beats, ${BINS} bins\n`);

// THE LADDER. Six pulse floors, the same speed law throughout, so the only thing
// that differs between them is the property under test. `1 - floor` rises
// monotonically down the list by construction.
const LADDER = [0.85, 0.6, 0.42, 0.3, 0.18, 0.05];
const rungs = [];
for (const f of LADDER) rungs.push(await surface(`f${String(f).replace(".", "")}`, f, TREE_SPEED));

console.log("  THE LADDER — six pulse floors, one speed law, both metrics on the same runs");
console.log(`    ${"floor".padEnd(8)}${"thrown".padStart(8)}${"NEW depth".padStart(12)}${"predicted".padStart(11)}${"OLD 1-min/max".padStart(15)}${"OLD spread".padStart(14)}`);
for (const r of rungs) {
  console.log(`    ${String(r.floor).padEnd(8)}${String(r.thrown).padStart(8)}`
    + `${(r.depth * 100).toFixed(1).padStart(11)}%${(r.predicted * 100).toFixed(1).padStart(10)}%`
    + `${(r.old * 100).toFixed(1).padStart(14)}%${`${(r.oldWorst * 100).toFixed(0)}–${(r.oldBest * 100).toFixed(0)}%`.padStart(14)}`);
}

// ============================================================
// P1. THE FIXTURE IS REAL, AND THE LEVER MOVES IT.
//     Six distinct builds of the real module, every substitution asserted at
//     build time, every rung throwing blood, and no rung clipped by the particle
//     budget. If the shallowest and the deepest floor did not separate, nothing
//     below could mean anything.
// ============================================================
const thin = rungs.filter((r) => r.thrown < 8 * r.wounds);
const clipped = rungs.filter((r) => r.saturated > 0);
check("six real builds of vfx.ts, every rung bleeding, none clipped by the particle budget",
  builds >= 6 && !thin.length && !clipped.length,
  `${builds} builds; droplets thrown per rung ${rungs.map((r) => r.thrown).join(", ")}; `
  + `${clipped.length} rung(s) hit the budget`);
const span = rungs[rungs.length - 1].depth - rungs[0].depth;
check("PULL THE LEVER: the floor is the thing the new metric is reading",
  span > 0.4,
  `floor 0.85 reads ${(rungs[0].depth * 100).toFixed(1)}% and floor 0.05 reads `
  + `${(rungs[rungs.length - 1].depth * 100).toFixed(1)}% — a span of ${(span * 100).toFixed(0)} points`);

// ============================================================
// P2. THE FOLD IS ALIGNED. Between beats the pulse is EXACTLY the floor, so the
//     folded emission must be FLAT across that whole half-cycle. A fold half a
//     beat out of phase would still produce a number, and it would be a number
//     about nothing; this is the claim that says the phase is right.
// ============================================================
{
  const r = rungs[2];
  const troughBins = [];
  for (let i = 0; i < BINS; i++) if (isTrough(binPhase(i))) troughBins.push(r.profile[i]);
  const m = troughBins.reduce((s, v) => s + v, 0) / troughBins.length;
  const spread = m > 0 ? (Math.max(...troughBins) - Math.min(...troughBins)) / m : 9;
  check("the fold is on the beat: emission between beats is flat across the whole half-cycle",
    spread < 0.65,
    `the ${troughBins.length} diastolic bins span ${(spread * 100).toFixed(0)}% of their own mean`);
}

// ============================================================
// P3. CALIBRATION. The metric is not merely ordered, it is RIGHT: for a pulse
//     floor f the answer is known from the module's own expression, and the
//     measurement must land on it at every rung.
// ============================================================
{
  const err = rungs.map((r) => Math.abs(r.depth - r.predicted));
  const worst = Math.max(...err);
  check("the new metric returns the KNOWN depth at all six floors, within 8 points",
    worst <= 0.08,
    rungs.map((r) => `${r.floor}: ${(r.depth * 100).toFixed(0)}% vs ${(r.predicted * 100).toFixed(0)}%`).join(", "));
}

/** Strictly increasing with a margin, or the first pair that is not. */
function ordering(values, margin) {
  const faults = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i].v <= values[i - 1].v + margin) {
      faults.push(`${values[i - 1].k}=${(values[i - 1].v * 100).toFixed(1)}% then ${values[i].k}=${(values[i].v * 100).toFixed(1)}%`);
    }
  }
  return faults;
}

// ============================================================
// P4. THE ORDERING, WHICH IS THE WHOLE TEST OF THE FIX.
//
//     THE OLD METRIC IS RUN FIRST AND SHOWN FAILING IT. This is proof-of-failure
//     in the sense `PROCESS.md` R2 means it: the ladder is a sequence of pulse
//     depths built on purpose, the correct order is known by construction, and a
//     metric that cannot reproduce it cannot rank two surfaces either.
// ============================================================
//
//     The failure is stated as RESOLUTION rather than as "some pair came out
//     backwards", and that is deliberate: whether a particular pair inverts on a
//     particular run is itself a coin, and a gate whose subject is a lottery must
//     not be gated on one spin of it. The old metric's ENTIRE RANGE across a
//     ladder spanning eighty points of real depth is compared with the scatter of
//     its own readings inside a single rung. When the second is larger than the
//     first, the ranking is noise however many times it is run.
const oldOrder = ordering(rungs.map((r) => ({ k: r.floor, v: r.old })), 0.01);
const oldRange = Math.max(...rungs.map((r) => r.old)) - Math.min(...rungs.map((r) => r.old));
const oldScatter = Math.max(...rungs.map((r) => r.oldBest - r.oldWorst));
check("THE OLD METRIC CANNOT RESOLVE THE LADDER — its whole range is inside the scatter of one rung",
  oldRange < oldScatter,
  `six floors from 0.85 to 0.05 move it ${(oldRange * 100).toFixed(1)} points in total, while one rung's own `
  + `wounds scatter over ${(oldScatter * 100).toFixed(1)}; out of order at: ${oldOrder.join("; ") || "nowhere, this run"}`);
// And the bar that was hung on it. `goretest.mjs` on the gore branch gates
// `arc.pulseDepth >= 0.6` and prints "the spray falls N% away between beats — a
// hose does not". THE FLATTEST SURFACE IN THIS LADDER IS VERY NEARLY A HOSE — a
// true depth of about fifteen points — and it clears that bar with forty points
// to spare. The gate could not have failed for any spray this module can make,
// which is the difference between a gate and a decoration.
const HOSE_BAR = 0.6;
const flattest = rungs[0];
check("THE OLD GATE'S BAR CANNOT BE FAILED — the flattest spray in the ladder clears it easily",
  flattest.old >= HOSE_BAR,
  `a ${(flattest.predicted * 100).toFixed(0)}%-deep pulse — all but a hose — scores `
  + `${(flattest.old * 100).toFixed(1)}% against a bar of ${(HOSE_BAR * 100).toFixed(0)}%`);
const newOrder = ordering(rungs.map((r) => ({ k: r.floor, v: r.depth })), 0.02);
check("the new metric orders all six, strictly, with two points of clearance",
  newOrder.length === 0,
  newOrder.length ? `out of order at: ${newOrder.join("; ")}` : "0.85 < 0.6 < 0.42 < 0.3 < 0.18 < 0.05, as built");

// ============================================================
// P5. THE PAIR THE ADVERSARY ACTUALLY COMPARED. `main`'s 0.42 + 0.58 against the
//     branch's 0.18 + 0.82, each with its own speed law — the two real surfaces,
//     one of which is plainly better. The old metric ranked the shallower one
//     higher. The new one must not.
// ============================================================
const mainSurf = await surface("real-main", TREE_FLOOR, TREE_SPEED);
const deepSurf = await surface("real-deep", DEEP_FLOOR, DEEP_SPEED);
const headToHead = overlap(mainSurf.oldScores, deepSurf.oldScores);
check("THE OLD METRIC GETS THE REAL PAIR BACKWARDS, AND HERE IS HOW OFTEN — one wound at a time, as it was used",
  headToHead > 0.25,
  `the SHALLOWER surface out-scores the deeper one in ${(headToHead * 100).toFixed(0)}% of `
  + `${mainSurf.wounds}x${deepSurf.wounds} head-to-head wounds `
  + `(means ${(mainSurf.old * 100).toFixed(1)}% against ${(deepSurf.old * 100).toFixed(1)}%)`);
const pairGap = deepSurf.depth - mainSurf.depth;
const pairNoise = Math.max(mainSurf.halfGap, deepSurf.halfGap, 0.002);
check("the new metric ranks the deeper pulse above the shallower one, by many times its own noise",
  pairGap > 0.05 && pairGap > pairNoise * 8,
  `0.42-floor ${(mainSurf.depth * 100).toFixed(1)}% against 0.18-floor ${(deepSurf.depth * 100).toFixed(1)}% `
  + `(known depths ${(mainSurf.predicted * 100).toFixed(0)}% and ${(deepSurf.predicted * 100).toFixed(0)}%) — `
  + `a ${(pairGap * 100).toFixed(1)}-point gap against ${(pairNoise * 100).toFixed(1)} points of half-sample noise`);

// ============================================================
// P6. THE CONFOUND, NAMED AND MEASURED AGAINST THE RIGHT YARDSTICK.
//
//     Hold the pulse floor at the tree's own value and change ONLY the throwing
//     speed. The property under test has not moved at all, so an honest metric
//     must not move either — and the yardstick for "much" is not some round
//     number, it is THE METRIC'S OWN ANSWER TO THE PAIR IT IS SUPPOSED TO RANK.
//     The old metric separates the two real surfaces by a fraction of a point,
//     so a confound worth a whole point is not a bias on the reading, it IS the
//     reading.
// ============================================================
const fastSame = await surface("speed-only", TREE_FLOOR, DEEP_SPEED);
const newMove = Math.abs(fastSame.depth - mainSurf.depth);
const newSignal = Math.abs(deepSurf.depth - mainSurf.depth);
// Two questions asked of the same metric with the same instrument: how well does
// it tell apart two surfaces whose HEARTBEATS differ, and how well does it tell
// apart two surfaces whose heartbeats are IDENTICAL and whose throw is not? A
// ruler for pulse depth should score high on the first and nothing on the second.
const powerReal = power(mainSurf.oldScores, deepSurf.oldScores);
const powerNull = power(mainSurf.oldScores, fastSame.oldScores);
check("THE OLD METRIC IS NO BETTER AT TELLING TWO HEARTBEATS APART THAN AT TELLING APART TWO THROWS",
  powerReal <= powerNull + 0.1,
  `separating power ${(powerReal * 100).toFixed(0)}% on the real pair (different pulse) against `
  + `${(powerNull * 100).toFixed(0)}% on the null pair (same pulse, faster throw) — it is answering the throw`);
check("the new metric barely notices speed, because a droplet is counted as it leaves the wound",
  newMove < newSignal * 0.25,
  `speed alone moved it ${(newMove * 100).toFixed(1)} points against a ${(newSignal * 100).toFixed(1)}-point `
  + `separation of the real pair — ${(newMove / Math.max(newSignal, 1e-9) * 100).toFixed(0)}% of the signal`);

// ============================================================
// P7. IS THE RULER FINER THAN THE THING IT MEASURES? This is the seed-lottery
//     question asked of the pulse metric, and it is the one nobody asked.
//
//     The old metric was computed from ONE wound. Its spread from wound to wound
//     WITHIN a single surface is printed in the ladder above, and it is an order
//     of magnitude wider than the gap between the two surfaces it was asked to
//     rank — so which surface "won" was decided by which wound came up. That is
//     not a metric that got the sign wrong; it is a coin that was read as a
//     verdict.
// ============================================================
const oldSpread = Math.max(mainSurf.oldBest - mainSurf.oldWorst, deepSurf.oldBest - deepSurf.oldWorst);
const oldSignal = Math.abs(deepSurf.old - mainSurf.old);
check("THE OLD METRIC'S WOUND-TO-WOUND SPREAD SWAMPS THE DIFFERENCE IT IS ASKED TO REPORT",
  oldSpread > oldSignal * 2,
  `one surface spans ${(oldSpread * 100).toFixed(1)} points across its own wounds, while the two surfaces `
  + `differ by ${(oldSignal * 100).toFixed(1)} — a single wound decides the ranking`);
const halfGap = Math.max(mainSurf.halfGap, deepSurf.halfGap);
check("the new metric's two independent halves agree to well inside the gap they must resolve",
  halfGap < newSignal * 0.25,
  `odd wounds and even wounds disagree by ${(halfGap * 100).toFixed(1)} points against a `
  + `${(newSignal * 100).toFixed(1)}-point gap`);

// ============================================================
// SECTION B — "BLOOD LANDS ON THE MAN STANDING NEXT TO HIM, AT EVERY FRAME RATE"
// ============================================================
//
// The cell that flaked. One wound, one bystander, and the question is whether
// any of it lands on him. `vfx.ts`'s capsule test is ENTER-ONLY — the previous
// position must be outside the man and the new one inside — so a droplet that
// crosses the whole 0.56 m of him inside one step passes through, which is why
// the frame rate is part of the claim and not an implementation detail.
function bystander(mod, fps, dist) {
  const stage = makeStage(mod);
  stage.ensure("victim").group.position.set(0, 0, 0);
  stage.ensure("near").group.position.set(dist, 0, 0);
  stage.scene.updateMatrixWorld(true);
  stage.vfx.wound({ position: { x: 0, y: 1.4, z: 0 }, damage: 45, direction: { x: 1, y: 0.1, z: 0 }, zone: "neck" });
  let peak = 0;
  const dt = 1 / fps;
  for (let f = 0; f < Math.round(3 * fps); f++) {
    stage.ctx.time += dt; stage.ctx.dt = dt; stage.ctx.rawDt = dt;
    stage.vfx.update(dt, stage.ctx);
    peak = Math.max(peak, stage.vfx.census().bodyMarks);
  }
  return peak;
}

/** Wilson's interval — the one that does not fall apart at p near 0 or 1. */
function wilson(k, n, z = 1.96) {
  if (!n) return { lo: 0, hi: 1 };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (c - s) / d), hi: Math.min(1, (c + s) / d) };
}

let seedForBootstrap = 20260813;
const rnd = () => {
  // Deterministic resampling, so the flake rates printed below are the same on
  // every run of this file — a bootstrap that wobbles cannot be quoted.
  seedForBootstrap = (seedForBootstrap * 1103515245 + 12345) & 0x7fffffff;
  return seedForBootstrap / 0x7fffffff;
};
/** How often a statistic would fire, drawn from the cell's own pool. */
function flakeRate(pool, draws, statFails, trials = 2000) {
  let bad = 0;
  for (let t = 0; t < trials; t++) {
    const s = [];
    for (let i = 0; i < draws; i++) s.push(pool[Math.floor(rnd() * pool.length)]);
    if (statFails(s)) bad++;
  }
  return bad / trials;
}

const cellMod = await build("bystander", TREE_FLOOR, TREE_SPEED);
const cells = [];
for (const fps of [120, 60, 30]) {
  for (const d of [1.2, 2.0]) {
    const pool = [];
    for (let i = 0; i < BYST; i++) pool.push(bystander(cellMod, fps, d));
    const hits = pool.filter((v) => v >= 1).length;
    cells.push({
      fps, d, pool,
      n: pool.length,
      hit: hits / pool.length,
      ci: wilson(hits, pool.length),
      mean: pool.reduce((s, v) => s + v, 0) / pool.length,
    });
  }
}
console.log(`\n  THE BYSTANDER — ${BYST} wounds a cell, against the six the old cell drew`);
console.log(`    ${"cell".padEnd(14)}${"marks/wound".padStart(12)}${"P(marked)".padStart(11)}${"95% interval".padStart(18)}`);
for (const c of cells) {
  console.log(`    ${`${c.fps}fps @${c.d}m`.padEnd(14)}${c.mean.toFixed(2).padStart(12)}`
    + `${(c.hit * 100).toFixed(1).padStart(10)}%${`${(c.ci.lo * 100).toFixed(0)}–${(c.ci.hi * 100).toFixed(0)}%`.padStart(18)}`);
}

// ============================================================
// B1. THE CASE IS PRESENT. A gate about blood landing on a bystander is not a
//     gate if no blood ever reaches him — it is a green light for an absence.
//     The reference cell is the highest frame rate at the nearer distance; if
//     that one cannot mark him, the section says so and rules on nothing.
// ============================================================
const ref = cells.find((c) => c.fps === 120 && c.d === 1.2);
const present = cells.filter((c) => c.ci.lo > 0);
check("the case is present: at 120 fps and 1.2 m the man beside him is marked, with the interval clear of zero",
  ref.ci.lo > 0,
  `${(ref.hit * 100).toFixed(1)}% of ${ref.n} wounds mark him, 95% interval ${(ref.ci.lo * 100).toFixed(0)}–${(ref.ci.hi * 100).toFixed(0)}%`);

// ============================================================
// B2. THE OLD CELL IS A LOTTERY, AND HERE IS ITS ODDS. The statistic it gated —
//     the mean of six wounds, against a bar of one mark — is resampled from each
//     cell's own pool two thousand times. The adversary measured about 11% on an
//     unchanged tree by running the file nine times; this measures the same thing
//     properly, and it is proof-of-failure for the replacement below.
// ============================================================
const oldFails = cells.map((c) => ({
  c, rate: flakeRate(c.pool, 6, (s) => s.reduce((a, b) => a + b, 0) / s.length < 1),
}));
const worstOld = oldFails.reduce((m, x) => (x.rate > m.rate ? x : m), oldFails[0]);
check("THE OLD CELL FLAKES ON AN UNCHANGED TREE — a mean of six wounds against a bar at the mode",
  worstOld.rate > 0.02,
  oldFails.map((x) => `${x.c.fps}fps@${x.c.d}m ${(x.rate * 100).toFixed(1)}%`).join(", ")
  + ` — worst cell fires ${(worstOld.rate * 100).toFixed(1)}% of the time with nothing wrong`);

// ============================================================
// B3. THE REPLACEMENT IS A PROPERTY. One criterion, one fixed sample size: the
//     per-wound probability that the man beside him is marked at all. Sampled
//     three hundred times a cell rather than six, and gated where the case is
//     present. The bar is the claim's own word — "blood lands on him" — read as
//     "more often than not", and it does not move with the sample.
//
//     R4: the cells where the spray never reaches at this quality ride the
//     verdict line rather than sitting silently under a green one.
// ============================================================
const BAR = 0.5;
const judged = cells.filter((c) => c.d <= 1.2);
const deferred = cells.filter((c) => c.d > 1.2);
const failing = judged.filter((c) => c.hit < BAR);
// R4: the deferral rides the verdict line, in the words a person will read. The
// 2.0 m cells are NOT gated on their level here, and that is a decision with a
// reason: how far the spray carries is what the spray work is for, and a bar on
// it invented by this harness would be a number nobody chose. Their frame-rate
// behaviour IS gated, in B4.
check(`the man at 1.2 m is marked by more than half of all wounds, at every frame rate`
  + ` — WITH the ${deferred.length} cells at 2.0 m reported above and NOT gated on their level,`
  + ` which is a deferral and not a clean sheet`,
  failing.length === 0,
  judged.map((c) => `${c.fps}fps ${(c.hit * 100).toFixed(0)}% of ${c.n}`).join(", ")
  + `; ungated at 2.0 m: ${deferred.map((c) => `${c.fps}fps ${(c.hit * 100).toFixed(0)}%`).join(", ")}`);

const newFails = judged.map((c) => ({
  c, rate: flakeRate(c.pool, c.n, (s) => s.filter((v) => v >= 1).length / s.length < BAR),
}));
const worstNew = newFails.reduce((m, x) => (x.rate > m.rate ? x : m), newFails[0]);
check("and the replacement does not flake: resampled from its own pool it fires under 1% of the time",
  worstNew.rate < 0.01,
  newFails.map((x) => `${x.c.fps}fps@${x.c.d}m ${(x.rate * 100).toFixed(2)}%`).join(", "));

// ============================================================
// B4. THE FRAME RATE, WHICH IS WHAT THE CELL WAS FOR. The capsule test is
//     enter-only, so the failure it guards against is a droplet stepping clean
//     through a man at a low frame rate. That is a RATIO — how much of the
//     120 fps rate survives at 30 — and a ratio does not care what the absolute
//     rate happens to be on this tier.
// ============================================================
// The bar is HALF, and it is chosen from the mechanism rather than from the
// data: only a droplet whose entire crossing of a 0.56 m man falls inside one
// step is lost, which at 30 fps and 12 m/s is a minority of the fastest ones. A
// quarter of the frame rate halving the blood on a bystander would be a
// collapse; keeping most of it is the property. Whether the sample can hold that
// bar without flaking is not asserted, it is measured, in the claim after it.
const RATIO_BAR = 0.5;
const ratios = [];
const unmeasurable = [];
for (const d of [1.2, 2.0]) {
  const fast = cells.find((c) => c.fps === 120 && c.d === d);
  const slow = cells.find((c) => c.fps === 30 && c.d === d);
  if (fast.hit < 0.1) { unmeasurable.push(`${d}m`); continue; }
  ratios.push({ d, r: slow.hit / fast.hit, fast, slow });
}
check("a quarter of the frame rate does not lose the blood: 30 fps keeps at least half the 120 fps rate"
  + (unmeasurable.length ? ` — WITH ${unmeasurable.join(" and ")} carrying too little spray at 120 fps to compare, which is a deferral` : ""),
  ratios.length > 0 && ratios.every((x) => x.r >= RATIO_BAR),
  ratios.map((x) => `@${x.d}m ${(x.slow.hit * 100).toFixed(0)}% of ${(x.fast.hit * 100).toFixed(0)}% = ${(x.r * 100).toFixed(0)}%`).join(", ")
  || "no distance had enough signal at 120 fps to compare against");

// ============================================================
// B5. AND THE GATE POLICES ITS OWN STABILITY. Every statistic gated above is
//     resampled from the pools it was computed on. A bar that the sample cannot
//     hold is the incident this whole section exists for, so it is measured here
//     rather than discovered on the ninth run by somebody else.
// ============================================================
const ratioFlake = ratios.map((x) => {
  let bad = 0;
  const trials = 2000;
  for (let t = 0; t < trials; t++) {
    const draw = (pool) => {
      let k = 0;
      for (let i = 0; i < pool.length; i++) if (pool[Math.floor(rnd() * pool.length)] >= 1) k++;
      return k / pool.length;
    };
    const f = draw(x.fast.pool);
    const s = draw(x.slow.pool);
    if (f <= 0 || s / f < RATIO_BAR) bad++;
  }
  return { d: x.d, rate: bad / trials };
});
const worstRatio = ratioFlake.reduce((m, x) => (x.rate > m.rate ? x : m), ratioFlake[0] || { d: 0, rate: 1 });
check("the frame-rate bar is one the sample can hold: resampled, it fires under 1% of the time",
  ratioFlake.length > 0 && worstRatio.rate < 0.01,
  (ratioFlake.map((x) => `@${x.d}m ${(x.rate * 100).toFixed(2)}%`).join(", ") || "no ratio was measurable")
  + (worstRatio.rate >= 0.01 ? ` at ${BYST} wounds a cell — this is the sample being too small for the bar, `
    + "which is the fault this section exists to catch, not a fault in the blood. Raise --bystanders." : ""));

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
// The transpile scratch goes with the run. It is gitignored as well, because a
// killed run cannot clean up after itself and `git add -A` has swept exactly
// this kind of directory into a commit here before.
if (!has("keep")) rmSync(OUT, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
