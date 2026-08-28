#!/usr/bin/env node
// ============================================================
// GORETEST — is the arena clean when the second round starts, and does the
//            blood look like blood while it is there?
//
//   node tools/goretest.mjs
//   node tools/goretest.mjs --blind      # the client the reset replaced
//   node tools/goretest.mjs --tier low
//
// TWO HALVES. Claims 1–7 are the round boundary; claims 8–10 are the shape of
// the spray, which is a different question and needs a different instrument.
//
// ---- the boundary ----
// The owner's report: "while playing ive also seen when loading into a second
// round blood floating in mid air."
//
// It is the countdown flash again, in a different organ. A client-owned effect
// whose ending condition is owned by the server: `engine.mjs` ends a round,
// waits five seconds, stands every warrior up on a fresh ring and starts the
// next one — and `vfx.ts` was never told. A ground stain lives 90 s and a pool
// 210 s; a mark of blood stuck to a man's skin lives 120 s and is stored in the
// local frame of his SPINE, so it is drawn at chest height wherever that bone
// now is; a stump keeps running; a man alight stays alight. The round break is
// five seconds. Every one of those numbers is bigger than the gap, so round two
// opens on round one's blood, and the half of it that is anchored to bodies is
// the half that is in the air. (Those three lifetimes were 26 s, 70 s and 30 s
// when this file was written and are now two to four times longer, because
// "pooling that persists for the round" needs a number bigger than the round
// and a round has no clock on it. The boundary is what ends them, not a timer —
// which is the whole argument of the claims below.)
//
// ---- the shape ----
// The second owner request this file answers: "more blood splattering &
// spraying. Really over the top". A COUNT CANNOT SEE THAT. Sixty droplets that
// land on a man's own boots and sixty that lay a stripe across four metres of
// turf are the same number, and the first of them is what two visual panels
// called confetti. So claims 8 onward measure where blood ENDS UP, through
// `vfx.probe()` — raw positions and velocities, no verdict — with every
// statistic computed in this file.
//
// No browser. `vfx.ts` allocates buffers, textures and materials as plain
// objects and only needs a GL context to *draw*, so the whole module runs on the
// CPU: transpile it, build it against a bare `THREE.Scene`, and read the pools
// back through `vfx.census()`. The engine is the real one — `getEngine()` is the
// same singleton `custom-server.mjs` hands a socket to — driving a real
// best-of-3 honour duel, so the round boundary under test is the server's own
// and not a mock of it.
//
// The two halves of the seam are both real and neither is reimplemented here:
//   * `roundBoundary` from `src/game/roundreset.mjs` is the SAME function
//     `GameCanvas.tsx` imports. There is one definition of "a new round".
//   * `clearBattle` / `census` are `vfx.ts`'s own.
// What this file does own is the gore that ARRIVES — wounds, severances, fire —
// because the spawning is not what is under test. The clearing is.
//
// `--blind` skips the reset and is therefore exactly the client on main. It is
// kept permanently, as `gracetest.mjs` keeps its phase-blind replay: it is the
// proof-of-failure, run on every invocation, and it is what stops the fix being
// quietly deleted by somebody who trusts the passing column.
//
// WHAT THIS FILE DOES NOT MEASURE, said here because a reader looking for it
// will look here first: this harness is about the arena being CLEAN, and every
// claim in it is a count that is meant to be zero. It cannot say whether the
// blood that arrives is any good — a spray that fell on the man's own boots
// would satisfy all seven claims below. The shape of the spray is
// `tools/gorestat.mjs`, which owns the two statistics that describe it (how far
// the emission falls away between heartbeats, and whether any of it lands on the
// man standing next to him) and which exists because both of those were
// previously gated by rulers that could not rank two known-different sprays.
// A count cannot see a shape; keeping the two files apart is what stops one
// pretending to be the other.
//
// Exits non-zero if any claim fails.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import * as THREE from "three";
import { getEngine } from "../src/game/engine.mjs";
import { roundBoundary } from "../src/game/roundreset.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".goretest");
const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const TIER = flag("tier", "high");
// The lever the standing lesson asks for: run the whole suite against a client
// that never calls the reset — which is main — and watch claims 2 to 6 fail.
// Claims 1 and 3's control are always blind and are unaffected by it.
const BLIND = has("blind");
const RECORD_MS = Math.max(20000, Number(flag("record", 95000)));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// ---------------------------------------------------------------- transpile
// Same trick as `headmeasure.mjs` and `wearmeasure.mjs`, and emitted inside the
// repo on purpose so node resolves `three` by walking up to node_modules.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/render/vfx.ts",
  "--outDir", ".goretest", "--target", "es2022", "--module", "esnext",
  "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const emitted = [];
const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
  const f = resolve(dir, e.name);
  if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f);
} };
if (existsSync(OUT)) walk(OUT);
// tsc emits TypeScript's extensionless relative specifiers, which node's ESM
// loader will not resolve. One rewrite over the emitted tree.
for (const f of emitted) {
  const src = readFileSync(f, "utf8");
  const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c));
  if (fixed !== src) writeFileSync(f, fixed);
}
const vfxJs = emitted.find((f) => f.endsWith("vfx.js"));
const qualityJs = emitted.find((f) => f.endsWith("quality.js"));
if (!vfxJs || !qualityJs) {
  console.error("[gore] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || ""));
  process.exit(2);
}
const { createVfx } = await import(pathToFileURL(vfxJs).href);
const { QUALITY_PRESETS } = await import(pathToFileURL(qualityJs).href);

// ---------------------------------------------------------------- recording
//
// A real best-of-3 honour duel against a bot. The harness never sends input, so
// the bot kills it, which is the shortest honest route to a round boundary: two
// men, one death, `endRound`, five seconds of `intermission`, three of
// `countdown`, and round two.
//
// Every packet is kept with the millisecond it landed and the room as the client
// would hold it — `src/app/page.tsx` merges a thin `{countdown: n}` tick onto the
// room it already had and pins the phase itself, so modelling the raw packet
// would test a client that does not exist.
const engine = getEngine();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function record() {
  const t0 = Date.now();
  const log = [];
  let room = null;
  let done = null;
  const settled = new Promise((r) => { done = r; });
  const sid = engine.connect((str) => {
    const m = JSON.parse(str);
    const d = m.data || {};
    if (d.players) room = { ...d };
    else if (room) room = { ...room, ...d };
    if (m.type === "countdown") room = { ...(room || {}), state: "countdown", countdown: d.countdown };
    log.push({ t: Date.now() - t0, type: m.type, room });
    // Two fighting frames of round two is all the claim needs; stop there rather
    // than sit through the rest of the match.
    if (room && room.state === "fighting" && (room.roundIndex || 0) >= 2 && done) { done(); done = null; }
  });
  engine.message(sid, { type: "create", data: { name: "Gore", mode: "honour_duel", bestOf: 3 } });
  engine.message(sid, { type: "add_bot", data: { difficulty: "jarl" } });
  engine.message(sid, { type: "start", data: {} });
  await Promise.race([settled, sleep(RECORD_MS)]);
  await sleep(1200);
  return log;
}

const log = await record();
const rounds = new Set(log.map((r) => (r.room && r.room.roundIndex) || 0));
const firstR2 = log.findIndex((r) => r.room && r.room.state === "fighting" && (r.room.roundIndex || 0) >= 2);
// THE FIRST FRAME OF ROUND TWO, taken at the packet `startRound` broadcasts —
// the top of the countdown, not the first blow. That is the owner's words
// verbatim ("when loading into a second round") and it is three seconds earlier
// than the fight, so anything asserted here is asserted the moment a player can
// first see the new arena.
const openR2 = log.findIndex((r) => r.room && (r.room.roundIndex || 0) >= 2);
check("a real two-round match was driven on the real engine",
  rounds.has(1) && rounds.has(2) && firstR2 > 0,
  `rounds seen ${[...rounds].join(",")}; round two's first fighting packet at ${firstR2 >= 0 ? log[firstR2].t : "never"}ms`);
if (firstR2 < 0) {
  console.log("\nno round two was reached; nothing below can be judged");
  process.exit(2);
}

// ------------------------------------------------------------- headless stage
//
// The bodies are real enough for the two things the blood asks of them: a group
// named `warrior:<id>` (the ONLY seam between vfx.ts and the rigs — it scans the
// scene for that name) with a `spine` child at belt height, which is what a mark
// on skin is anchored to and therefore what carries it through the round break.
// A severance hangs a stump on the body and a piece on the arena root, exactly
// as `characters.ts` does, and `release()` here does what its `release()` does:
// takes both out of the scene graph.
function makeStage(tier) {
  const scene = new THREE.Scene();
  const field = new THREE.Group();
  field.name = "arena";
  scene.add(field);
  const settings = { ...QUALITY_PRESETS[tier] };
  const vfx = createVfx(scene, { maxAnisotropy: 1 }, settings, { groundAt: () => 0, autoFires: false });
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
      r = { group, spine, cuts: [], bleeds: [] };
      rigs.set(id, r);
    }
    return r;
  };
  const ctx = {
    dt: 1 / 60, rawDt: 1 / 60, time: 0, camera,
    focus: new THREE.Vector3(0, 1, 0), localId: "", localState: null,
    mood: "dusk", quality: settings,
  };
  return { scene, field, vfx, camera, ctx, rigs, ensure, settings };
}

/** A limb comes off: stump on the body, piece standing in world space. */
function sever(stage, rig, at, zone) {
  const stump = new THREE.Group();
  stump.position.set(0, 0.4, 0);
  rig.spine.add(stump);
  const piece = new THREE.Group();
  piece.position.set(at.x + 0.3, at.y + 0.2, at.z);
  stage.field.add(piece);
  stage.scene.updateMatrixWorld(true);
  const bleed = stage.vfx.severed({
    position: { x: at.x, y: at.y, z: at.z },
    direction: { x: 0.3, y: 0.9, z: 0.1 },
    radius: zone === "waist" ? 0.19 : 0.07,
    stump, piece, zone,
    power: zone === "waist" ? 1.55 : 1,
  });
  rig.cuts.push({ stump, piece });
  rig.bleeds.push(bleed);
}

/** What `Severance.release()` does, which is what a respawn triggers. */
function reassemble(rig) {
  for (const c of rig.cuts) { c.stump.removeFromParent(); c.piece.removeFromParent(); }
  rig.cuts.length = 0;
  rig.bleeds.length = 0;
}

const LIMB = new Set(["head", "neck", "armL", "armR", "legL", "legR", "waist"]);

// ---------------------------------------------------------------- the replay
//
// One client's frame loop over the recording. `blind` never calls the reset,
// which is the client on main verbatim.
//
// `load` is the second half of the brief: a man killed by FIRE and a man
// DISMEMBERED leave more than a simple decal, and a real duel does not
// reliably produce either. It lights a man, cuts another in half, opens a
// running wound and lays a shockwave and a ribbon, so the claim is about EVERY
// pool rather than the one the duel happened to fill. Two timings, because they
// answer different questions:
//
//   "fight" — the last fighting frame of round one. What SETTLES: stains on the
//             ground, pools, marks stuck to skin, men alight. This is the
//             owner's case, and it is the one that leaks, because a stain lives
//             twenty-six seconds against an eight-second break.
//   "edge"  — the last frame before the round turns over. What is still IN THE
//             AIR: no droplet lives eight seconds, so this is the only way the
//             "blood-particle count is zero" claim is about anything at all. It
//             is a real case and not a contrived one: `endRound` fires the
//             instant the last man falls, so the spray from the killing blow is
//             mid-flight when the room changes state.
function replay({ blind = false, load = false, tier = TIER, fps = 60 } = {}) {
  const stage = makeStage(tier);
  const dt = 1 / fps;
  const end = log[log.length - 1].t;
  const prevHp = new Map();
  const prevState = new Map();
  let heldIdx = 0;
  let held = null;
  let prevRoom = null;
  let loaded = false;
  let r2Census = null;
  let r2FightCensus = null;
  let r1Peak = { decals: 0, bodyMarks: 0, jets: 0, combatParticles: 0, burners: 0 };
  let lastR1Census = null;
  const boundaryAt = log[openR2 >= 0 ? openR2 : firstR2].t;
  const fightAt = log[firstR2].t;
  // The last fighting packet of round one, so a "fight" load lands inside the
  // round it is meant to survive rather than during the break.
  const lastR1 = log.reduce((m, r, i) =>
    (r.room && (r.room.roundIndex || 0) === 1 && r.room.state === "fighting" ? i : m), -1);
  // Two frames and 400 ms clear of the turnover, whichever is longer: the load
  // has to land on a frame that is still round one, and at 4 fps a frame is a
  // quarter of a second wide. Nothing thrown is anywhere near dead by then —
  // a droplet lives one to two seconds and a stump runs for two.
  const loadAtMs = load === "edge"
    ? Math.max(0, boundaryAt - Math.max(400, 2 * dt * 1000))
    : (lastR1 >= 0 ? log[lastR1].t : 0);

  for (let ms = 0; ms <= end + 1; ms += dt * 1000) {
    while (heldIdx < log.length && log[heldIdx].t <= ms) held = log[heldIdx++];
    if (!held || !held.room) continue;
    const room = held.room;
    const players = room.players || {};

    // ---- the seam. One predicate, shared with GameCanvas.tsx.
    if (roundBoundary(prevRoom, room) && !blind) stage.vfx.clearBattle();
    prevRoom = room;

    // ---- bodies where the wire says they are
    for (const [id, p] of Object.entries(players)) {
      const rig = stage.ensure(id);
      rig.group.position.set(p.position.x, p.position.y, p.position.z);
      rig.group.rotation.y = p.rotation || 0;
      // A corpse lies down; a living man stands. The spine is what a mark on
      // skin is anchored to, so where it is IS where that blood is drawn.
      rig.spine.position.y = p.state === "dead" ? 0.34 : 1.02;
      // Every road back to standing: the server clears the death mark on the
      // round start, and a warrior who is not dead is a warrior whose limbs are
      // back on him. This is `anim.ts`'s rule, applied here.
      if (p.state !== "dead" && rig.cuts.length) reassemble(rig);
    }
    stage.scene.updateMatrixWorld(true);

    // ---- gore, on the edges GameCanvas.tsx fires it on
    for (const [id, p] of Object.entries(players)) {
      const rig = stage.rigs.get(id);
      const at = { x: p.position.x, y: p.position.y + 1.2, z: p.position.z };
      const was = prevHp.get(id);
      if (was !== undefined && p.health < was) {
        stage.vfx.wound({
          position: at, damage: Math.max(1, was - p.health),
          direction: { x: Math.sin(p.rotation || 0), y: 0.2, z: Math.cos(p.rotation || 0) },
          zone: p.state === "dead" ? (p.deathZone ?? undefined) : undefined,
          fatal: p.state === "dead",
        });
      }
      if (prevState.get(id) !== "dead" && p.state === "dead") {
        if (p.deathZone && LIMB.has(p.deathZone)) sever(stage, rig, at, p.deathZone);
        stage.vfx.burst({ position: { x: at.x, y: 0.5, z: at.z }, color: 0x3a2a20, count: 20, spread: 5, up: 3, kind: "dust" });
      }
      stage.vfx.setBurning(id, p.burning === true, p.burnTimer ?? 0, p.burnInside === true);
      prevHp.set(id, p.health);
      prevState.set(id, p.state);
    }

    // ---- the neighbouring cases, loaded on purpose
    if (load && !loaded && ms >= loadAtMs) {
      loaded = true;
      const ids = Object.keys(players);
      for (let k = 0; k < ids.length; k++) {
        const p = players[ids[k]];
        const rig = stage.rigs.get(ids[k]);
        const at = { x: p.position.x, y: p.position.y + 1.1, z: p.position.z };
        // A man DISMEMBERED — the samurai case, which opens the whole trunk.
        sever(stage, rig, at, k === 0 ? "waist" : "armR");
        // A man on FIRE, and burning hard.
        stage.vfx.setBurning(ids[k], true, 6, true);
        // A running wound and a shockwave, for the two remaining pools.
        stage.vfx.wound({ position: at, damage: 55, zone: "neck", fatal: true });
        stage.vfx.burst({ position: { x: at.x, y: 1.3, z: at.z }, color: 0xff3311, count: 6, spread: 2, up: 3, kind: "aura" });
        stage.vfx.trail({ position: { x: at.x, y: 1.5, z: at.z }, color: 0xc2ccd6, count: 1 });
      }
    }

    stage.ctx.time += dt;
    // The decals, the marks on skin and the flashes all age on `ctx.rawDt`, not
    // on the `dt` handed to `update` — so a harness that steps at anything other
    // than sixty and leaves `makeStage`'s default in place is aging half of vfx
    // at the wrong rate. It cost this file a claim: pool life came back at 211s
    // against a declared 70s, because the loop was stepping at 1/20 and the
    // decals were aging at 1/60.
    stage.ctx.dt = dt;
    stage.ctx.rawDt = dt;
    stage.vfx.update(dt, stage.ctx);

    if (ms < boundaryAt) {
      const c = stage.vfx.census();
      lastR1Census = c;
      for (const k of Object.keys(r1Peak)) r1Peak[k] = Math.max(r1Peak[k], c[k]);
    } else {
      // Measured AFTER the frame has been stepped, because a leftover that
      // survives the step is a leftover that gets drawn.
      if (!r2Census) r2Census = stage.vfx.census();
      if (!r2FightCensus && ms >= fightAt) r2FightCensus = stage.vfx.census();
    }
  }
  return { r2: r2Census, r2Fight: r2FightCensus, r1Peak, r1End: lastR1Census };
}

const fmt = (c) => c
  ? `decals ${c.decals} (pools ${c.pools}), marks-on-skin ${c.bodyMarks}, stumps ${c.jets}, ` +
    `blood particles ${c.combatParticles}, rings ${c.rings}, ribbons ${c.ribbons}, burners ${c.burners}` +
    (c.highestBloodY > -Infinity ? `, highest at y=${c.highestBloodY.toFixed(2)}m` : "")
  : "nothing measured";

const total = (c) => c ? c.decals + c.bodyMarks + c.jets + c.combatParticles + c.rings + c.ribbons + c.burners : -1;

// ============================================================
// 1. THE DEFECT, on the client this change replaces.
//
//    Run first and asserted first: a harness that cannot see the bug is not
//    evidence that the bug is gone. This is `--blind` — the reset is never
//    called — which is byte-for-byte what main does, and it must FAIL to be
//    clean. If this ever starts reporting an empty arena, either somebody fixed
//    it somewhere else or this file has stopped measuring anything.
// ============================================================
const blind = replay({ blind: true });
check("THE DEFECT REPRODUCES: without the reset, round one's blood is still there in round two",
  total(blind.r2) > 0,
  `first frame of round two carried ${fmt(blind.r2)}`);

// The owner said mid-air, and that is the half of it that is anchored to bodies:
// a mark on skin is stored in the SPINE's local frame, so it is drawn at chest
// height wherever that bone has got to. Height is the measurement, not a count.
//
// LOADED, and it has to be. This claim used to run against the bare duel, and
// the bare duel does not reliably put blood on a body: whether the killing blow
// sprayed across a capsule at all is luck, and the claim duly came back red on a
// run where nothing had changed but the dice — "highest leftover at y=0.01m,
// 0 marks on skin, 0 stumps", which is a clean sheet reported as a defect. An
// assertion whose case the fixture cannot guarantee is the same fault whichever
// colour it happens to land on. `load: "fight"` cuts a man in half and opens a
// running wound on the last fighting frame, so the airborne half of the defect
// is there to be found every time.
const blindAir = replay({ blind: true, load: "fight" });
check("THE DEFECT IS AIRBORNE: some of what survives is not on the ground",
  blindAir.r2 !== null && (blindAir.r2.bodyMarks > 0 || blindAir.r2.jets > 0 || blindAir.r2.combatParticles > 0 ||
    blindAir.r2.highestBloodY > 0.5),
  `highest leftover at y=${blindAir.r2 ? blindAir.r2.highestBloodY.toFixed(2) : "?"}m ` +
  `(${blindAir.r2 ? blindAir.r2.bodyMarks : 0} marks on skin, ${blindAir.r2 ? blindAir.r2.jets : 0} stumps)`);

// ============================================================
// 2. THE FIX. Every pool, zero, on the first frame of round two.
// ============================================================
const fixed = replay({ blind: BLIND });
check("round one actually bled, so the claim below is about something",
  fixed.r1Peak.decals + fixed.r1Peak.combatParticles > 0,
  `round one peaked at ${fixed.r1Peak.decals} decals and ${fixed.r1Peak.combatParticles} blood particles`);

check("ZERO live decals on the first frame of round two", fixed.r2 && fixed.r2.decals === 0,
  fmt(fixed.r2));
check("ZERO blood particles on the first frame of round two", fixed.r2 && fixed.r2.combatParticles === 0,
  `${fixed.r2 ? fixed.r2.combatParticles : "?"} in the air`);
check("ZERO marks on skin, stumps, rings, ribbons and burning men in round two",
  fixed.r2 && fixed.r2.bodyMarks === 0 && fixed.r2.jets === 0 && fixed.r2.rings === 0 &&
  fixed.r2.ribbons === 0 && fixed.r2.burners === 0,
  fmt(fixed.r2));
check("NOTHING is in the air: no leftover has a height at all", fixed.r2 && fixed.r2.highestBloodY === -Infinity,
  fixed.r2 && fixed.r2.highestBloodY > -Infinity ? `something at y=${fixed.r2.highestBloodY.toFixed(2)}m` : "no leftovers to have a height");
// And still clean three seconds later, when the countdown ends and the fight
// starts: a reset that fired once and was then undone by a stale packet
// replayed over it would pass everything above and fail here.
check("still clean on the first frame of the round-two FIGHT, three seconds on",
  fixed.r2Fight && total(fixed.r2Fight) === 0, fmt(fixed.r2Fight));

// ============================================================
// 3. THE NEIGHBOURING CASES. A man killed by FIRE and a man DISMEMBERED leave
//    more than a simple decal, and a duel does not reliably produce either — so
//    they are loaded deliberately on the last fighting frame of round one:
//    a waist bisection, an arm off, a man engulfed, a fatal neck wound, an
//    ability shockwave and a blade ribbon. Every pool this module owns, full.
// ============================================================
const loaded = replay({ load: "fight", blind: BLIND });
check("the deliberate load actually filled every pool in round one",
  loaded.r1Peak.decals > 0 && loaded.r1Peak.jets > 0 && loaded.r1Peak.burners > 0 &&
  loaded.r1Peak.combatParticles > 0,
  `peaks — decals ${loaded.r1Peak.decals}, stumps ${loaded.r1Peak.jets}, burners ${loaded.r1Peak.burners}, ` +
  `blood particles ${loaded.r1Peak.combatParticles}`);
check("fire, dismemberment and all: every pool is empty on the first frame of round two",
  total(loaded.r2) === 0, fmt(loaded.r2));

const loadedBlind = replay({ load: "fight", blind: true });
check("and the loaded case reproduces too, so claim 3 is not vacuous",
  total(loadedBlind.r2) > 0, fmt(loadedBlind.r2));

// ============================================================
// 3b. BLOOD STILL IN THE AIR WHEN THE ROUND TURNS OVER.
//
//     Claim 2's particle count is honest but nearly free: no droplet lives the
//     eight seconds between the last blow and the next countdown, so on the real
//     duel it reads zero either way. This is the version of it that is about
//     something — the gore is thrown on the LAST FRAME before the boundary, so
//     there is a spray genuinely mid-flight and two stumps genuinely running
//     when the room changes state. That is not contrived: `endRound` fires on
//     the tick the last man falls, with his killing blow's spray still in the
//     air.
// ============================================================
const edgeBlind = replay({ load: "edge", blind: true });
check("THE DEFECT REPRODUCES in the air: blood thrown at the turnover is still flying in round two",
  edgeBlind.r2 && edgeBlind.r2.combatParticles > 0,
  fmt(edgeBlind.r2));
const edge = replay({ load: "edge", blind: BLIND });
check("ZERO blood particles in the air on the first frame of round two, when there were some to clear",
  edge.r2 && edge.r2.combatParticles === 0 && total(edge.r2) === 0, fmt(edge.r2));

// ============================================================
// 4. THE LOW TIER. Eight slots of decal instead of sixty-four and no second
//    emitter per severance: a reset that only empties what the high tier
//    allocates is a reset that leaves a phone dirty.
// ============================================================
const low = replay({ load: "fight", tier: "low", blind: BLIND });
check("the low tier's arena is clean too", total(low.r2) === 0, fmt(low.r2));

// ============================================================
// 5. NOT A CLIENT-OWNED DURATION, and not a frame-rate one either. The blood
//    goes because the round changed, not because anything elapsed — so a client
//    running at a punishing 4 fps, which sees the whole intermission in twenty
//    frames, must arrive just as clean.
// ============================================================
const slow = replay({ load: "fight", fps: 4, blind: BLIND });
check("clean at 4 fps as well as 60", total(slow.r2) === 0, fmt(slow.r2));

// ============================================================
// 6. THE ARENA IS NOT THE FIGHT. The bonfire burns through an intermission by
//    design — `GameCanvas.tsx` runs vfx on the non-fight path precisely so the
//    establishing orbit is not looking at frozen flames — so the reset must
//    empty the blood WITHOUT emptying the dust, embers and smoke that belong to
//    the place. A `store.n = 0` would pass every claim above and put out the
//    arena, and the mote population never comes back: `dustSeeded` is a
//    one-shot.
// ============================================================
check("the arena's own ambient population survives the reset",
  fixed.r2 && fixed.r2.particles - fixed.r2.combatParticles > 0,
  `${fixed.r2 ? fixed.r2.particles - fixed.r2.combatParticles : "?"} ambient particles still going`);

// ============================================================
// 7. SOURCE LOCK. Claims 1–6 measure a harness's client. This is the one line
//    that says the GAME's client is wired to the same seam — said plainly,
//    because the house rule is not to reason from source and this is the
//    exception that admits it. Without it every claim above could pass against
//    a fix no player ever receives.
// ============================================================
const canvas = readFileSync(resolve(ROOT, "src/game/client/GameCanvas.tsx"), "utf8");
const wired = /roundBoundary/.test(canvas) && /clearBattle\(\)/.test(canvas);
check("GameCanvas.tsx imports the shared predicate and calls clearBattle", wired,
  wired ? "wired" : "the renderer is not on the seam this harness tests");

// ============================================================
// 8. THE SHAPE OF THE BLOOD — does it ARC, or does it PUFF?
//
// Claims 1–7 are about the arena being clean. They would all pass over a spray
// that was a red cloud falling on the man's own boots, which is what the visual
// panels have twice called confetti, and which is what the owner is answering
// with "more blood splattering & spraying. Really over the top".
//
// A COUNT CANNOT SEE THIS. Sixty droplets that go nowhere and sixty that leave
// a two-metre stripe of ground are the same number. So the measurement is where
// the blood ENDS UP: `vfx.probe()` reports raw positions and velocities and no
// derived quantity at all, and every statistic below is computed here.
//
// The four properties, and each is a different way for a spray to be wrong:
//
//   REACH        it travels. A puff lands inside half a metre.
//   DIRECTION    it goes where the wound points, rather than fanning off in
//                every direction at once.
//   ELONGATION   the landing pattern is a STRIPE and not a DISC. This is the
//                one that actually separates an arc from a strong puff: a puff
//                thrown hard is still round.
//   RISE         it goes up before it comes down, so there is a curve in it.
//
// THE CONTROL IS A REAL CODE PATH, not a flag. `burst({kind:"blood"})` with no
// direction is the compatibility shim `vfx.ts` documents in `BurstOptions` —
// what a call site that predates hit zones gets — and it fans off at a random
// horizontal bearing by design. So the same module, on the same frame, throwing
// the same quantity of blood, is measured both ways: the shim must FAIL reach,
// direction and elongation, and `severed()` must pass all four. A ruler that
// cannot tell those two apart is a ruler that cannot see the defect, and this
// is the section's proof that it can.
// ============================================================

/**
 * One wound, thrown and followed until every droplet has landed.
 *
 * REPEATED, and that is not padding. `mergeStain` deliberately collapses blood
 * that lands on blood into one mark, so a single severance leaves a handful of
 * marks and a single undirected puff leaves ONE — and the first run of this
 * section computed a "stripe" out of that one mark, called it 2.02 m long, and
 * failed the control for the wrong reason. A spray is a distribution and one
 * sample is not one. The bearing is rotated between repeats as well, so a
 * statistic that only holds along +x cannot pass.
 */
function bleedShape(kind, tier = TIER, repeats = 10) {
  const spatter = [];
  let apex = -Infinity;
  let airborne = 0;
  let peaks = 0;
  let pulseDepth = 0;
  let marksTotal = 0;
  let marksMin = Infinity;

  for (let rep = 0; rep < repeats; rep++) {
    const stage = makeStage(tier);
    const rig = stage.ensure("subject");
    rig.group.position.set(0, 0, 0);
    stage.scene.updateMatrixWorld(true);
    const at = { x: 0, y: 1.46, z: 0 };
    // A neck opened along a bearing that moves with the repeat, lifted — the
    // shape of axis `characters.ts` hands over for a throat, and the case the
    // owner's "spraying" is about.
    const bearing = (rep / repeats) * Math.PI * 2;
    const axis = { x: Math.cos(bearing) * 0.89, y: 0.45, z: Math.sin(bearing) * 0.89 };
    const al = Math.hypot(axis.x, axis.y, axis.z);
    axis.x /= al; axis.y /= al; axis.z /= al;

    if (kind === "arc") {
      const stump = new THREE.Group();
      stump.position.set(0, 0.44, 0);
      // ORIENTED, and the first cut of this was not. `stepJets` re-reads the
      // spray axis off the stump node's own local +Y every frame — that is the
      // mechanism that keeps a wound spraying the right way as a corpse rolls —
      // so a stump Group left at identity sprays STRAIGHT UP whatever direction
      // was passed to `severed()`. The separation burst went downrange and the
      // running jet, which throws most of the blood, rained on the man's head.
      // It read as 71% of marks downrange and looked like a defect in the code.
      // `characters.ts` builds the seam node oriented; so does this now.
      stump.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(axis.x, axis.y, axis.z));
      rig.spine.add(stump);
      stage.scene.updateMatrixWorld(true);
      // NO `piece`, and that is the difference between a statistic and a
      // muddle. `severed()` starts a SECOND jet on the severed part, pointing
      // the other way — correctly, because a head bleeds from its own face too —
      // and the first cut of this section left the piece standing thirty
      // centimetres from the wound, so a quarter of the "arc" was a second
      // emitter spraying backwards and the direction claim read 75%. It is the
      // real low-tier path (`tier === "low"` skips the piece jet outright) and
      // the piece's counter-jet is still exercised by claims 3 and 3b, which
      // load it deliberately. One wound, one axis, one statistic.
      stage.vfx.severed({ position: at, direction: axis, radius: 0.075, stump, zone: "neck", power: 1 });
    } else if (kind === "hit") {
      // A blow that broke skin and did not kill. No stump, so no running jet —
      // which makes it the only clean instrument for "how long is blood in the
      // air", because a severance is still emitting for the best part of two
      // seconds and there is always something up there.
      stage.vfx.wound({ position: at, damage: 45, direction: axis, zone: "neck" });
    } else {
      // The shim. Same blood, same module, same quantity, NO DIRECTION — which
      // is the whole of the difference, and it is `vfx.ts`'s own documented
      // fallback for a call site that predates hit zones.
      stage.vfx.burst({ position: at, color: 0xd42a1a, count: 26, kind: "blood" });
    }

    const dt = 1 / 120;
    const perFrame = [];
    for (let f = 0; f < Math.round(3.4 / dt); f++) {
      stage.ctx.time += dt;
      stage.ctx.dt = dt;
      stage.ctx.rawDt = dt;
      stage.vfx.update(dt, stage.ctx);
      const p = stage.vfx.probe();
      for (const d of p.drops) if (d.y - at.y > apex) apex = d.y - at.y;
      if (p.drops.length) airborne = Math.max(airborne, f * dt);
      perFrame.push({ t: f * dt, n: p.drops.length });
    }
    const marks = stage.vfx.probe().marks;
    marksTotal += marks.length;
    marksMin = Math.min(marksMin, marks.length);

    // Where it landed, in this repeat's own horizontal frame: `along` is
    // downrange of the spray axis, `across` is to the side of it.
    const h = Math.hypot(axis.x, axis.z) || 1;
    const ax = axis.x / h;
    const az = axis.z / h;
    for (const m of marks) {
      if (m.pool) continue;
      spatter.push({
        r: Math.hypot(m.x - at.x, m.z - at.z),
        along: (m.x - at.x) * ax + (m.z - at.z) * az,
        across: -(m.x - at.x) * az + (m.z - at.z) * ax,
      });
    }

    // Spurts, over the jet's own life once the separation burst has fallen out
    // of it. Counted on the first repeat only — it is a property of one wound's
    // clock, not of the sample.
    //
    // THE FIRST VERSION OF THIS COUNTED NOISE AND IS RECORDED HERE RATHER THAN
    // QUIETLY REPLACED. It counted local maxima and demanded three of them
    // between 0.55 s and 2.1 s — but the pulse runs at 9.2 rad/s, which is
    // 1.46 Hz, which is 2.3 beats in that window. Three was never reachable by
    // the heart; it was reachable by the jitter on a shallow pulse, and it duly
    // reported five. Then the pulse was made DEEPER — the thing the gate exists
    // to want — the jitter went away with the plateau it rode on, and the count
    // fell to two. A metric that goes DOWN when the property improves is
    // measuring something else.
    //
    // So the peaks are still counted, against a bar the physics allows, and the
    // real claim is about DEPTH: a spurt has almost nothing coming out between
    // beats, and a hose does not. `1 - min/max` over the window is that, and it
    // cannot be satisfied by noise in either direction.
    if (rep === 0) {
      const win = perFrame.filter((s) => s.t > 0.55 && s.t < 2.1);
      const gap = Math.round(0.18 / dt);
      for (let i = 3; i < win.length - 3; i++) {
        if (win[i].n > win[i - 3].n && win[i].n >= win[i + 3].n && win[i].n > 2) {
          peaks++;
          i += gap;
        }
      }
      // MEASURED ON A SMOOTHED RATE, AND THE RAW ONE WAS NOT MEASURING THIS.
      //
      // This read `1 - min/max` over the RAW per-frame droplet count. Two
      // things make that meaningless: the emitter accumulates fractional
      // droplets, so a frame emitting 0 is routine at any pressure; and the
      // jet decays as (1-t)^1.6 across the window, so late frames are quieter
      // than early ones whatever the pulse is doing. A single empty frame
      // anywhere pins the answer at ~1.
      //
      // It duly reported "the spray falls 88% away between beats" on a build
      // whose pulse floor had just been raised to 0.80 — a floor that makes an
      // 88% trough arithmetically impossible. The gate could not see the
      // property it was named for, in either direction.
      //
      // So: a 0.12 s moving average (six frames at this step, several beats
      // wide of the quantisation), over a SHORT early window where the decay
      // term has barely moved, and the trough compared to the peak of that.
      // MEASURED AT THE BEAT'S OWN FREQUENCY. Four shapes; all four kept,
      // because each of the first three looked reasonable and was not.
      //
      //   1. `1 - min/max` on the RAW per-frame count. The emitter accumulates
      //      fractional droplets, so an empty frame is routine at any pressure
      //      and one pins the answer near 1. It reported "88% away between
      //      beats" on a build whose floor made 88% arithmetically impossible.
      //   2. Smoothed, then min/max. Fixed the quantisation and still mostly
      //      read the jet's own (1-t)^1.6 DECAY, ~70% across the window:
      //      raising the floor 0.80 -> 0.88, which halves the oscillation,
      //      moved the answer 47% -> 45%.
      //   3. Detrended by a 0.5 s moving average. The beat is 0.68 s, so the
      //      "trend" followed the pulse and cancelled it — a true 74% spurt
      //      measured 30% and a FLAT jet measured 8%.
      //   4. Per-beat, trough against neighbouring peaks. On a shallow pour
      //      the local extrema are NOISE, not beats, so adjacent ones sit a
      //      hair apart and the median depth collapsed to 0%.
      //
      // The pulse is a sinusoid at a frequency the renderer states (9.2 rad/s,
      // 1.46 Hz), so its amplitude is read at exactly that frequency and
      // nowhere else — one Fourier bin. A slow decay is DC and near-DC and does
      // not land in the bin; quantisation noise is broadband and mostly does
      // not either. Amplitude over mean is the depth, and it is the only form
      // of this metric that has responded correctly to every lever pulled at
      // it. If the renderer's beat frequency ever moves, this number goes to
      // zero and says so rather than quietly measuring nothing.
      const W = 9.2;
      const wf = perFrame.filter((s) => s.t > 0.55 && s.t < 2.1);
      let sre = 0, sim = 0, smean = 0;
      for (const f of wf) {
        sre += f.n * Math.cos(W * f.t);
        sim += f.n * Math.sin(W * f.t);
        smean += f.n;
      }
      if (wf.length) {
        const amp = 2 * Math.hypot(sre, sim) / wf.length;
        const avg = smean / wf.length;
        pulseDepth = avg > 0.01 ? Math.min(1, amp / avg) : 0;
      } else pulseDepth = 0;
    }
  }

  const mean = (a, f) => (a.length ? a.reduce((s, v) => s + f(v), 0) / a.length : 0);
  const rms = (a, f) => Math.sqrt(mean(a, (v) => f(v) * f(v)));
  return {
    spatter: spatter.length,
    marksPerWound: marksTotal / repeats,
    marksWorst: marksMin === Infinity ? 0 : marksMin,
    apex: apex > -Infinity ? apex : 0,
    airborne,
    meanReach: mean(spatter, (l) => l.r),
    maxReach: spatter.reduce((m, l) => Math.max(m, l.r), 0),
    meanAlong: mean(spatter, (l) => l.along),
    // What share of the marks landed on the wound's side at all. See the note
    // at the DIRECTION claim: this is direction, and the mean is reach.
    downrangeShare: spatter.length ? spatter.filter((l) => l.along > 0).length / spatter.length : 0,
    alongRms: rms(spatter, (l) => l.along),
    acrossRms: rms(spatter, (l) => l.across),
    peaks,
    pulseDepth,
  };
}

const arc = bleedShape("arc");
// FORTY repeats for the control, against ten for the arc, because the shim's
// randomness is ONE BEARING PER WOUND — `woundBlood` picks a single angle for
// the whole burst — so ten repeats is ten samples, not sixty, and its mean
// downrange wandered between -0.22 m and +0.83 m across consecutive runs of
// this file. A control that is noisier than the effect it is controlling for
// proves nothing.
const puff = bleedShape("puff", TIER, 60);
const shapeLine = (s) => `${s.marksPerWound.toFixed(1)} marks a wound, mean reach ${s.meanReach.toFixed(2)}m, `
  + `furthest ${s.maxReach.toFixed(2)}m, downrange ${s.meanAlong.toFixed(2)}m, `
  + `stripe ${s.alongRms.toFixed(2)}m along vs ${s.acrossRms.toFixed(2)}m across, `
  + `apex ${s.apex.toFixed(2)}m above the wound`;

// WHAT THE CONTROL IS FOR, said exactly, because the first three versions of
// this claim were all about the wrong thing.
//
// Its job is to prove the RULER CAN SEE THE DEFECT — that the statistics below
// distinguish a directed arc from an undirected one, rather than reporting a
// large number for any spray at all. Its first form asked whether the shim's
// blood landed near the man ("mean reach < 0.9 m"), and the shim throws at
// 2.2 + 3.1k so it carries perfectly well and that clause was simply false. Its
// second form asked whether the shim's MEAN DOWNRANGE was small — which it is,
// in expectation, and which wandered between -0.22 m and +0.83 m run to run,
// because the shim's randomness is ONE BEARING PER WOUND and sixty wounds is
// sixty samples of an angle, not four hundred samples of a droplet.
//
// So the claim is now a COMPARISON on all three direction statistics at once.
// It cannot be satisfied by an undirected arc, it cannot be broken by the
// control drawing an unlucky run of bearings, and it says the thing the control
// exists to say.
const stripe = (x) => x.alongRms / Math.max(1e-3, x.acrossRms);
check("THE RULER DISCRIMINATES: the arc beats the undirected shim on every direction statistic",
  arc.downrangeShare > puff.downrangeShare + 0.3
  && arc.meanAlong > Math.abs(puff.meanAlong) * 3
  && stripe(arc) > stripe(puff) * 2,
  `share ${(arc.downrangeShare * 100).toFixed(0)}% vs ${(puff.downrangeShare * 100).toFixed(0)}%, `
  + `downrange ${arc.meanAlong.toFixed(2)}m vs ${puff.meanAlong.toFixed(2)}m, `
  + `stripe ${stripe(arc).toFixed(2)}x vs ${stripe(puff).toFixed(2)}x   [shim: ${shapeLine(puff)}]`);

// THE BARS BELOW ARE STATED FROM THE DESIGN, NOT FROM A MEASUREMENT. That order
// matters: three of these six were already true of `severed()` before this pass
// and are here to LOCK a property nobody had ever asserted, and three were not,
// and reading a number off the code and then writing it down as the bar is how
// a gate ends up certifying whatever the code happens to do.
//
//   REACH      "really over the top" means the blood reaches the men standing
//              round him. Two metres of mean reach and four at the far edge is
//              a body's length in every direction, on an arena that reads at
//              roughly half real scale.
//   DIRECTION  a metre and a half downrange. Less than that and the axis is a
//              hint rather than a statement.
//   QUANTITY   nine marks a wound on a desktop. The ground has to record that a
//              man died on it.
check("REACH: an arterial spray carries, rather than dribbling down the body",
  arc.meanReach >= 1.9 && arc.maxReach >= 4.0,
  shapeLine(arc));
// DIRECTION WAS BEING MEASURED AS DISTANCE, which is this repository's signature
// fault in miniature and is recorded rather than quietly corrected. The claim
// was `meanAlong >= 1.5` — the mean downrange displacement of every mark — and
// it FELL from 2.32 m to 1.17 m across a change that made the spray strictly
// more directional. The reason is that the pulse got deeper: a stump now nearly
// stops between beats, the diastolic dribble lands on the man's own boots, and
// fifteen marks a wound with a proper quiet phase have more near-field marks
// than seven did. Every one of those near marks is CORRECT and every one of them
// drags a mean down.
//
// A distribution with 92% of its marks downrange and a mean of 1.2 m goes
// exactly where the wound points. One with a mean of 1.5 m and a third of its
// marks behind the man does not. So direction is the SHARE that landed on the
// wound's side, and the distance it travelled is REACH's claim, which is
// directly above and is where it belonged all along. The shim is the control:
// with no direction to point in, it puts half its marks either side.
check("DIRECTION: it goes where the wound points",
  arc.downrangeShare >= 0.82 && arc.meanAlong > Math.abs(puff.meanAlong) + 0.6,
  `${(arc.downrangeShare * 100).toFixed(0)}% of marks land on the wound's side `
  + `(the undirected shim: ${(puff.downrangeShare * 100).toFixed(0)}%), `
  + `mean ${arc.meanAlong.toFixed(2)}m downrange against the shim's ${puff.meanAlong.toFixed(2)}m`);
check("ELONGATION: what lands is a STRIPE, not a disc — the property a hard puff still fails",
  arc.alongRms > arc.acrossRms * 1.8,
  `${arc.alongRms.toFixed(2)}m along the axis against ${arc.acrossRms.toFixed(2)}m across it, `
  + `ratio ${(arc.alongRms / Math.max(1e-3, arc.acrossRms)).toFixed(2)}x (the shim: ${(puff.alongRms / Math.max(1e-3, puff.acrossRms)).toFixed(2)}x)`);
check("RISE: there is a curve in it — it goes up before it comes down",
  arc.apex >= 0.5,
  `highest droplet ${arc.apex.toFixed(2)}m above the wound`);
// THE OWNER RE-RULED THIS, 28 Aug 2026: "it should be LIQUID POURING OUT LIKE
// A HOSE & even more aggressively when dead & dismembered / decapitated."
//
// The claim used to be the opposite — "a stump spurts rather than pours",
// depth >= 0.6 — and the note below it said in as many words that a hose does
// not do this. That was a defensible reading of "over the top" and it is not
// the one the owner wants, so the BAR is turned over rather than the gate
// deleted: the stump must now POUR, and the surge must still be visible in it.
// A stump that has gone back to spurting fails here just as loudly as one that
// has gone flat.
// REPORTED, NOT GATED — AND THE REASON IS A MEASUREMENT, NOT A SHRUG.
//
// This was a gate: "a stump spurts rather than pours", depth >= 0.6. The owner
// re-ruled the property on 28 Aug 2026 — "it should be LIQUID POURING OUT LIKE
// A HOSE" — so the shipped pulse floor went to 0.88, which is an oscillation of
// about 12% by construction.
//
// AND 12% IS UNDER THIS FIXTURE'S OWN NOISE FLOOR. The jet is a low-count
// stochastic emitter sampled for ~1.5 s, and the same statistic run against a
// jet with THE PULSE TERM REMOVED ENTIRELY — a provably flat flow, true depth
// zero — reads 27%. The shipped hose reads 29% and the old deep spurt 39%.
// Those three are not separable, so a bar anywhere between them would be a
// coin, and a bar outside them would pass everything.
//
// Four metric shapes were tried before concluding this (all four kept in the
// note beside the calculation, because each looked reasonable and none was),
// and the conclusion is a property of the sample size rather than of the
// arithmetic: resolving a 12% oscillation out of a Poisson process at ~1
// droplet a frame over ~90 frames needs about an order of magnitude more
// samples than this fixture takes.
//
// So the number is PRINTED and the claim is retired rather than left as a gate
// that cannot see. What still gates the owner's ruling is volume and arrival —
// MARKS, REACH and "AND IT ARRIVES" below all move with the pour and all have
// margin over the noise. If the pulse is ever wanted as a gate again it needs
// the jet sampled across many repeats, not a cleverer formula.
console.log(`  NOTE  PULSE is reported, not gated: depth reads `
  + `${(arc.pulseDepth * 100).toFixed(0)}% against a measured noise floor of ~27% `
  + `(a jet with the pulse removed entirely reads that). The shipped floor is 0.88 `
  + `— the owner's hose — and 12% of oscillation is under what this fixture can resolve.`);

// AND IT ARRIVES. This one exists to stop the claim above being satisfied the
// easy way. `vfx.ts` carries a comment recording that an earlier pass threw at
// 3.6 + 4.4·force, a gout left the stump at 11 m/s, and it was "still six metres
// out and three up when the camera took the picture" — spray that never lands is
// exactly what the panels called confetti, and the throw was cut for it. A
// finding that only lives in a comment is a finding the next pass undoes.
//
// 0.85 s, AND THE NUMBER IS ARITHMETIC RATHER THAN TASTE, because the comment
// beside that finding said "within about half a second" and half a second was
// never possible. A wound sits about 1.46 m off the turf, so a droplet thrown
// perfectly FLAT is already 0.40 s in the air just falling; add a 41° launch at
// the speeds this module uses and the last one down is at 0.77 s. Main measured
// 0.76 s against its own comment's 0.5 s. So the bar is the physics plus a
// tenth: 0.85 s. What it actually catches is the thing that failed here — the
// same spray without `RISE_CEIL` measured 0.92 s, because the top of a 34° cone
// around a 40° axis is 74° and that is where all the airtime lives.
const hit = bleedShape("hit");
check("AND IT ARRIVES: a blow's spray is down inside 0.85s — 0.40s of which is the fall alone",
  hit.airborne <= 0.85 && hit.airborne > 0.2,
  `last droplet in the air at ${hit.airborne.toFixed(2)}s; it reached ${hit.maxReach.toFixed(2)}m and rose ${hit.apex.toFixed(2)}m`);
check("QUANTITY: a severance leaves the ground marked, not sprinkled",
  arc.marksPerWound >= 9,
  `${arc.marksPerWound.toFixed(1)} marks a wound on ${TIER}, worst of ten wounds ${arc.marksWorst}`);

// ============================================================
// 9. IT PERSISTS FOR THE ROUND. A pool that has dried out before the round it
//    was spilled in has ended is a pool the player never sees. The number is
//    stated against a real round: `endRound` fires only when men die, and the
//    duel above ran a hundred and sixty seconds of match time to get there.
// ============================================================
function poolLife(tier) {
  const stage = makeStage(tier);
  const rig = stage.ensure("subject");
  stage.scene.updateMatrixWorld(true);
  const stump = new THREE.Group();
  stump.position.set(0, 0.44, 0);
  rig.spine.add(stump);
  stage.scene.updateMatrixWorld(true);
  stage.vfx.severed({ position: { x: 0, y: 1.46, z: 0 }, direction: { x: 0.8, y: 0.5, z: 0.3 },
    radius: 0.075, stump, zone: "neck", power: 1 });
  const dt = 1 / 20;
  let lastPool = 0;
  let lastAny = 0;
  for (let t = 0; t < 300; t += dt) {
    stage.ctx.time += dt;
    stage.ctx.dt = dt;
    stage.ctx.rawDt = dt;
    stage.vfx.update(dt, stage.ctx);
    const m = stage.vfx.probe().marks;
    if (m.some((k) => k.pool)) lastPool = t;
    if (m.length) lastAny = t;
  }
  return { lastPool, lastAny };
}
const lifeHigh = poolLife("high");
const lifeLow = poolLife("low");
check("a pool outlasts a three-minute round on the desktop tier",
  lifeHigh.lastPool >= 180,
  `pool still on the ground at ${lifeHigh.lastPool.toFixed(0)}s, last mark of any kind at ${lifeHigh.lastAny.toFixed(0)}s`);
check("and outlasts a ninety-second one on the phone, WHICH IS LESS AND IS SAID SO",
  lifeLow.lastPool >= 90,
  `phone pool gone by ${lifeLow.lastPool.toFixed(0)}s against the desktop's ${lifeHigh.lastPool.toFixed(0)}s — `
  + `the phone keeps 8 decal slots against 64 and drops its pool sooner, which is a real loss and not a rounding`);

// ============================================================
// 10. THE PHONE'S SHARE. `decalBudget` is 24 on a phone against 64 on a
//     desktop, so "really over the top" has to survive being divided by three.
//     What the phone must NOT do is come out with nothing: a death that leaves
//     one mark is a death that did not happen.
// ============================================================
// ============================================================
// 9b. IT LANDS ON THE MEN STANDING ROUND HIM. The brief asks for spatter that
//     lands "on the ground, on nearby men and on the camera", and the men were
//     the half with no assertion anywhere: `vfx.ts` grew a capsule test and a
//     body-mark pool for exactly this and nothing has ever checked it fires.
//
//     It is also the property most at risk from a faster spray. The capsule test
//     is ENTER-ONLY — the previous position must be outside and the new one
//     inside — so a droplet that crosses the whole 0.56 m of a man inside one
//     step passes straight through him. A blow now throws at up to 12 m/s, which
//     is 0.2 m a frame at sixty and 0.4 m at thirty, so this is checked at three
//     frame rates and at three distances rather than at the one the desktop
//     happens to run at.
// ============================================================
function bystander(fps, dist, tier = TIER) {
  const stage = makeStage(tier);
  stage.ensure("victim").group.position.set(0, 0, 0);
  stage.ensure("near").group.position.set(dist, 0, 0);
  stage.scene.updateMatrixWorld(true);
  stage.vfx.wound({ position: { x: 0, y: 1.4, z: 0 }, damage: 45, direction: { x: 1, y: 0.1, z: 0 }, zone: "neck" });
  let peak = 0;
  const dt = 1 / fps;
  for (let f = 0; f < Math.round(3 * fps); f++) {
    stage.ctx.time += dt;
    stage.ctx.dt = dt;
    stage.ctx.rawDt = dt;
    stage.vfx.update(dt, stage.ctx);
    peak = Math.max(peak, stage.vfx.census().bodyMarks);
  }
  return peak;
}
const bystanders = [];
for (const fps of [120, 60, 30]) {
  for (const d of [1.2, 2.0]) {
    let tot = 0;
    const runs = 6;
    for (let i = 0; i < runs; i++) tot += bystander(fps, d);
    bystanders.push({ fps, d, mean: tot / runs });
  }
}
check("blood lands on the man standing next to him, at every frame rate",
  bystanders.every((b) => b.mean >= 1),
  bystanders.map((b) => `${b.fps}fps @${b.d}m: ${b.mean.toFixed(1)}`).join(", ")
  + " marks on skin, mean of six wounds each");

// THIRTY wounds a tier, not ten, and the bar is the claim's own word. This is a
// WORST-CASE assertion — "no wound leaves the ground clean" — and a worst case
// sampled ten times is barely sampled at all: the low tier came back with a
// single-mark wound on one run in three, which is the tail this claim exists to
// find and which ten repeats miss more often than they catch. "Clean" means
// zero, so the floor is one; the mean of four a wound is what carries "not
// sprinkled", and it is the same clause it always was.
const tierRows = ["high", "medium", "low"].map((t) => ({ t, s: bleedShape("arc", t, 30) }));
check("EVERY tier gets a spray that reaches, and NO wound on any tier leaves the ground clean",
  tierRows.every((r) => r.s.marksPerWound >= 4 && r.s.marksWorst >= 1 && r.s.maxReach >= 3.0),
  tierRows.map((r) => `${r.t}: ${r.s.marksPerWound.toFixed(1)} marks a wound (worst ${r.s.marksWorst}), `
    + `furthest ${r.s.maxReach.toFixed(2)}m, apex ${r.s.apex.toFixed(2)}m`).join("; "));

// ============================================================
// 11. BLOOD ON THE CAMERA. The third surface in the brief — "on the ground, on
//     nearby men and on the camera" — and the only one that is not in the scene.
//
//     `vfx.ts` decides WHEN and `postfx.ts` draws it, so this section tests the
//     decision, which is the half that can be wrong in an interesting way. The
//     failure mode a gate has to catch is not "it never fires"; it is "it fires
//     for everything", which would put blood on the glass every time anybody
//     anywhere was cut and read as a bug rather than as an effect. So each case
//     below is paired with the case that must NOT fire.
// ============================================================
function lensCase({ dist, behind = false, facing = true, sever = false, tier = TIER }) {
  const stage = makeStage(tier);
  const hits = [];
  // A second vfx on the same stage, with the callback wired. `makeStage` builds
  // one without it, which is the harness's normal case and stays that way.
  const settings = { ...QUALITY_PRESETS[tier] };
  const vfx = createVfx(stage.scene, { maxAnisotropy: 1 }, settings, {
    groundAt: () => 0, autoFires: false,
    onLensBlood: (s, u, v) => hits.push({ s, u, v }),
  });
  // The lens on the +z side, looking at the origin — the over-shoulder framing.
  stage.camera.position.set(0, 1.5, behind ? -dist : dist);
  stage.camera.lookAt(0, 1.4, behind ? -dist - 4 : 0);
  stage.camera.updateMatrixWorld(true);
  // One frame first: the projection is taken off the camera the last frame saw,
  // because a wound is opened from the packet loop and not from `update`.
  stage.ctx.dt = 1 / 60; stage.ctx.rawDt = 1 / 60;
  vfx.update(1 / 60, stage.ctx);
  // The spray axis: at the lens, or square across it.
  const axis = facing ? { x: 0, y: 0.25, z: 1 } : { x: 1, y: 0.25, z: 0 };
  const al = Math.hypot(axis.x, axis.y, axis.z);
  if (sever) {
    vfx.severed({ position: { x: 0, y: 1.4, z: 0 },
      direction: { x: axis.x / al, y: axis.y / al, z: axis.z / al },
      radius: 0.075, zone: "neck", power: 1 });
  } else {
    vfx.wound({ position: { x: 0, y: 1.4, z: 0 }, damage: 45,
      direction: { x: axis.x / al, y: axis.y / al, z: axis.z / al }, zone: "neck" });
  }
  return hits;
}

const near = lensCase({ dist: 1.8 });
const nearSever = lensCase({ dist: 1.8, sever: true });
const far = lensCase({ dist: 12 });
const away = lensCase({ dist: 1.8, behind: true });
const across = lensCase({ dist: 1.8, facing: false });

check("a wound opened in front of the lens puts blood on the glass",
  near.length === 1 && near[0].s > 0.1
  && near[0].u > 0.2 && near[0].u < 0.8 && near[0].v > 0.2 && near[0].v < 0.8,
  near.length ? `strength ${near[0].s.toFixed(2)} at screen (${near[0].u.toFixed(2)}, ${near[0].v.toFixed(2)})` : "nothing reached the glass");
check("and a severance hits it harder than a survivable blow does",
  nearSever.length === 1 && near.length === 1 && nearSever[0].s > near[0].s,
  `severance ${nearSever.length ? nearSever[0].s.toFixed(2) : "-"} against a heavy blow's ${near.length ? near[0].s.toFixed(2) : "-"}`);
check("A KILL ACROSS THE ARENA DOES NOT: twelve metres away leaves the glass clean",
  far.length === 0,
  far.length ? `${far.length} splat(s) from 12m — every death in the moot would land on your lens` : "clean");
check("NOR DOES ONE BEHIND YOU: `project` mirrors a point behind the camera",
  away.length === 0,
  away.length ? `${away.length} splat(s) painted on the front of the glass from a wound at your back` : "clean");
check("NOR ONE SPRAYING ACROSS THE FRAME rather than at it",
  across.length === 0,
  across.length ? `${across.length} splat(s) from a spray pointed 90° away` : "clean");

// THE DESIGN LAW, read off the source, and this is the one place in this file
// that reasons from source rather than from a measurement — said plainly,
// because the house rule is not to. `docs/DESIGN-SYSTEM.md` §1 adopts the cold
// palette on the argument that it makes blood the only warm thing on screen, so
// "blood needs no glow, no pulse and no siren to read". A lens effect that
// ADDED light would break that thesis silently and no frame statistic would
// name it, because a red glow and a red absorption look similar in a still and
// only one of them is lying about where the light came from.
const post = readFileSync(resolve(ROOT, "src/game/client/render/postfx.ts"), "utf8");
const lensBlock = post.slice(post.indexOf("if ( uLensN > 0 )"), post.indexOf("hdr += texture2D( tBloom"));
const subtractive = /hdr \*= exp\( -film/.test(lensBlock)
  && !/hdr \+=/.test(lensBlock)
  && !/emissive|uEmis/i.test(lensBlock);
check("the lens film only ever TAKES light away — no glow, per DESIGN-SYSTEM §1",
  subtractive && lensBlock.length > 100,
  subtractive ? "Beer-Lambert absorption, nothing added" : "something in the lens block adds light to the frame");

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
