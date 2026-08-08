#!/usr/bin/env node
// ============================================================
// GORETEST — is the arena clean when the second round starts?
//
//   node tools/goretest.mjs
//   node tools/goretest.mjs --blind      # the client this change replaces
//   node tools/goretest.mjs --tier low
//
// The owner's report: "while playing ive also seen when loading into a second
// round blood floating in mid air."
//
// It is the countdown flash again, in a different organ. A client-owned effect
// whose ending condition is owned by the server: `engine.mjs` ends a round,
// waits five seconds, stands every warrior up on a fresh ring and starts the
// next one — and `vfx.ts` was never told. A ground stain lives 26 s and a pool
// 70 s; a mark of blood stuck to a man's skin lives 30 s and is stored in the
// local frame of his SPINE, so it is drawn at chest height wherever that bone
// now is; a stump keeps running; a man alight stays alight. The round break is
// five seconds. Every one of those numbers is bigger than the gap, so round two
// opens on round one's blood, and the half of it that is anchored to bodies is
// the half that is in the air.
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
check("THE DEFECT IS AIRBORNE: some of what survives is not on the ground",
  blind.r2 !== null && (blind.r2.bodyMarks > 0 || blind.r2.jets > 0 || blind.r2.combatParticles > 0 ||
    blind.r2.highestBloodY > 0.5),
  `highest leftover at y=${blind.r2 ? blind.r2.highestBloodY.toFixed(2) : "?"}m ` +
  `(${blind.r2 ? blind.r2.bodyMarks : 0} marks on skin, ${blind.r2 ? blind.r2.jets : 0} stumps)`);

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

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
