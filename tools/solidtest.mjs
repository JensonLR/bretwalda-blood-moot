#!/usr/bin/env node
// ============================================================
// SOLIDTEST — walk a man into everything on a map, from every bearing, and
// find out whether the map is made of anything.
//
//   node tools/solidtest.mjs                # the gate
//   node tools/solidtest.mjs --hollow       # the build before this unit: RED
//   node tools/solidtest.mjs --lever move   # move the woodpile 6 m, watch it follow
//   node tools/solidtest.mjs --lever grow   # double its long axis, watch it follow
//   node tools/solidtest.mjs --verbose      # every walk, not just the verdict
//
// The owner:
//
//   > "Is there a way to make some of the map objects solid too (the wooden
//   > stick pile on current map for example) instead of walking through them?"
//
// R6 says the owner's words become a named check, so the first claim below is
// named after his sentence and measures exactly it: a man walked at the wooden
// stick pile, from twenty-four bearings, at every speed the game can produce.
//
// ---------------------------------------------------------------------------
// WHAT THIS MEASURES, AND WHAT IT DOES NOT — read this before believing it
// ---------------------------------------------------------------------------
//
// This repository has thirteen recorded instances of a ruler answering the
// wrong question, so here is this one's answer in advance.
//
// CLAIMS 1-11 DRIVE A MOVEMENT LOOP OF THEIR OWN; CLAIM 12 DRIVES THE ENGINE.
// The loop is `integrateMovement`'s arithmetic — the acceleration term, the
// impulse integral, the order of the two — followed by the resolve and
// `killComponent`, which is the shape of the wiring written at the top of
// `src/game/solidground.mjs`. It is fast, it sweeps twenty-four bearings against
// every solid on two grounds, and it is the right instrument for asking whether
// the COLLISION is correct.
//
// The obvious way for that to be a lie is for the driver's constants to drift
// from the engine's, at which point this measures a game nobody plays. So it
// does not copy them: it PARSES THEM OUT OF `engine.mjs` AT RUN TIME and dies
// if it cannot find them, or if the two lines of `killComponent` it models are
// no longer the two lines that are there. Pull `MOVE_ACCEL_TAU` in the engine
// and this harness moves with it or stops.
//
// AND IT IS STILL NOT ENOUGH, WHICH IS WHY CLAIM 12 EXISTS. A model of a
// movement step cannot contain a pass the model does not know about, and the
// engine runs one: a positional body-separation sweep AFTER the movement step,
// which shoves warriors into the props the resolver just cleared. Every claim
// here was green while that was happening. Claim 12 therefore runs `engine.mjs`
// itself — a real room, real bots, the real tick order — and gates on it, and
// the first time it was run it was RED. A harness that models the thing it is
// checking has to be joined by one that does not.
//
// A GATE GREEN BECAUSE THE CASE IS ABSENT IS NOT A GATE. The village's fighting
// floor has exactly two solids on it, and neither is thin. So every claim also
// runs against a PROVING GROUND — a fixture with a fence rail 12 cm thick, a
// boulder, a right-angled wall corner and a gap two bodies wide — because maps
// two and three are a ruined fort and an open fen, and the shapes that break a
// swept-disc resolver are the thin ones and the corners, not the woodpile.
// ============================================================
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { SAXON_VILLAGE, PICT_MOOR, seeded, noise2, ROMAN_FORT, DANELAW_CAMP } from "../src/game/grounds.mjs";
// Claim 12 runs the real thing. Every other claim drives a model of the movement
// step; this one is here because a model of a tick ORDER cannot contain the pass
// it does not know about. See the note on claim 12.
import { makeEngine } from "../src/game/engine.mjs";
import {
  resolveSolids, steerAroundSolids, clearanceAt, isClear,
  solid, passable, solidDistance, rick, raisedStone, footprintEncloses, SOLID_TOLERANCE,
} from "../src/game/solidground.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

/** The control. Nothing solid but the play bound — which is today's build. */
const HOLLOW = has("hollow");
const VERBOSE = has("verbose");
const LEVER = flag("lever", "");

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? `\n          ${detail}` : ""}`);
};
const note = (s) => console.log(`        ${s}`);
/**
 * R4: a harness that measures something and declines to gate on it puts the
 * count on the PASS line, in the same sentence, in the words a person reads.
 * Declining to rule is often correct; hiding that you declined never is.
 */
const DEFERRALS = [];

// ---------------------------------------------------------------------------
// The engine's own numbers, read out of the engine
// ---------------------------------------------------------------------------
const ENGINE_SRC = readFileSync(resolve(ROOT, "src/game/engine.mjs"), "utf8");

function engineConst(name) {
  // `export const` as well as `const`. `BODY_MIN_SEP` was exported on 20 Aug so
  // `src/game/spectate.mjs` could read "how far apart can two men be and still
  // be fighting" from the one place that defines it — a good change that made
  // this pattern stop matching, and this harness refused to run from that
  // moment. It refuses LOUDLY (exit 2), which is the only reason it was found;
  // a softer failure would have left twelve assertions dark behind a battery
  // that looked green.
  const m = ENGINE_SRC.match(new RegExp(`^(?:export )?const ${name} = ([0-9.]+)`, "m"));
  if (!m) {
    console.error(`[solid] engine.mjs no longer declares ${name}. This harness models`);
    console.error(`        engine.mjs's movement step; if its constants have moved, the`);
    console.error(`        model is measuring a game nobody plays. Fix the parse, do not`);
    console.error(`        hard-code the number.`);
    process.exit(2);
  }
  return Number(m[1]);
}
function engineStat(cls, key) {
  const line = ENGINE_SRC.match(new RegExp(`^  ${cls}: \\{([^}]*)\\}`, "m"));
  if (!line) { console.error(`[solid] engine.mjs has no WARRIOR_STATS.${cls}`); process.exit(2); }
  const m = line[1].match(new RegExp(`${key}: ([0-9.]+)`));
  if (!m) { console.error(`[solid] engine.mjs WARRIOR_STATS.${cls} has no ${key}`); process.exit(2); }
  return Number(m[1]);
}

const TICK_RATE = engineConst("TICK_RATE");
const DT = 1 / TICK_RATE;
const BODY_MIN_SEP = engineConst("BODY_MIN_SEP");
const BODY_RADIUS = BODY_MIN_SEP / 2;
// THE RING COMES OFF THE GROUND, NOT OUT OF THE ENGINE. It used to be
// `engineConst("ARENA_RADIUS")`, and claim 11 checked that the engine's copy and
// the ground's agreed — which is the shape of a check you write when there are
// two of something. There is one now: the engine's constant is deleted and
// `resolveSolids` enforces `play.radius` along with the props, so this harness
// reads the same single number the server does.
const ARENA_RADIUS = SAXON_VILLAGE.play.radius;
const MOVE_ACCEL_TAU = engineConst("MOVE_ACCEL_TAU");
const MOVE_STOP_TAU = engineConst("MOVE_STOP_TAU");
const IMPULSE_TAU = engineConst("IMPULSE_TAU");
// The fastest legs and the longest roll in the game, whichever class owns them.
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const TOP_SPRINT = Math.max(...CLASSES.map((c) => engineStat(c, "sprintSpeed")));
const TOP_WALK = Math.max(...CLASSES.map((c) => engineStat(c, "moveSpeed")));
const TOP_ROLL = Math.max(...CLASSES.map((c) => engineStat(c, "dodgeDistance")));

// `killComponent`, modelled. Verified against the engine's own two lines below,
// because a model of a function that has changed is worse than no model.
const KILL_SHAPE = /const into = player\.moveVel\.x \* blockedX \+ player\.moveVel\.z \* blockedZ;[\s\S]{0,120}player\.moveVel\.x -= into \* blockedX; player\.moveVel\.z -= into \* blockedZ;/;

// ---------------------------------------------------------------------------
// The movement driver
// ---------------------------------------------------------------------------

function newMan(x, z) {
  return { x, z, mvx: 0, mvz: 0, ix: 0, iz: 0, frozen: 0, rescued: 0, contacts: 0 };
}

/** A roll: the engine launches an impulse at distance / IMPULSE_TAU. */
function roll(man, dx, dz, distance) {
  const l = Math.hypot(dx, dz) || 1;
  const speed = distance / IMPULSE_TAU;
  man.ix = (dx / l) * speed;
  man.iz = (dz / l) * speed;
  man.mvx = 0; man.mvz = 0;   // "the roll owns the body"
}

/**
 * One tick. `integrateMovement`'s arithmetic, then the resolve, then
 * `killComponent` — which is the wiring `solidground.mjs`'s header specifies.
 *
 * `--hollow` is the build this unit replaces: the stride lands wherever it
 * lands and only the palisade ring is enforced, exactly as `engine.mjs` does it
 * around line 3270 today.
 */
function tick(ground, man, wantX, wantZ, speed) {
  const moving = wantX !== 0 || wantZ !== 0;
  if (moving) {
    const l = Math.hypot(wantX, wantZ);
    const k = 1 - Math.exp(-DT / MOVE_ACCEL_TAU);
    man.mvx += ((wantX / l) * speed - man.mvx) * k;
    man.mvz += ((wantZ / l) * speed - man.mvz) * k;
  } else {
    const k = Math.exp(-DT / MOVE_STOP_TAU);
    man.mvx *= k; man.mvz *= k;
    if (Math.abs(man.mvx) < 0.01) man.mvx = 0;
    if (Math.abs(man.mvz) < 0.01) man.mvz = 0;
  }
  const decay = Math.exp(-DT / IMPULSE_TAU);
  const carried = IMPULSE_TAU * (1 - decay);
  const fromX = man.x, fromZ = man.z;
  const toX = man.x + man.mvx * DT + man.ix * carried;
  const toZ = man.z + man.mvz * DT + man.iz * carried;
  man.ix *= decay; man.iz *= decay;
  if (Math.abs(man.ix) < 0.01) man.ix = 0;
  if (Math.abs(man.iz) < 0.01) man.iz = 0;

  if (HOLLOW) {
    man.x = toX; man.z = toZ;
    const r = Math.hypot(man.x, man.z);
    if (r > ARENA_RADIUS) {
      const nx = man.x / r, nz = man.z / r;
      man.x = nx * ARENA_RADIUS; man.z = nz * ARENA_RADIUS;
      killComponent(man, nx, nz);
    }
    return { hit: r > ARENA_RADIUS, frozen: false, rescued: false };
  }

  const s = resolveSolids(ground, fromX, fromZ, toX, toZ, BODY_RADIUS);
  man.x = s.x; man.z = s.z;
  if (s.hit) killComponent(man, s.blockedX, s.blockedZ);
  if (s.frozen) man.frozen++;
  if (s.rescued) man.rescued++;
  if (s.hit) man.contacts++;
  return s;
}

function killComponent(man, bx, bz) {
  const into = man.mvx * bx + man.mvz * bz;
  if (into <= 0) return;
  man.mvx -= into * bx;
  man.mvz -= into * bz;
}

// ---------------------------------------------------------------------------
// The grounds under test
// ---------------------------------------------------------------------------

/**
 * The village, and then a fixture for the shapes it does not have. Rule three:
 * a gate green because the case is absent is not a gate — and the village's
 * floor carries two chunky props, while the resolver's hard cases are a thin
 * rail (can a roll pass through it?), a corner (can two normals fight?) and a
 * gap (can a man be squeezed out of one?).
 */
const PROVING_GROUND = {
  id: "proving_ground",
  name: "The proving ground (fixture)",
  play: { shape: "disc", radius: 18 },
  obstacles: [
    solid({
      id: "fence", x: 6, z: 0, rot: 0.3, halfX: 2.4, halfZ: 0.0, pad: 0.06, height: 1.2,
      why: "A hurdle fence: 4.8 m of woven rail 12 cm thick. The thinnest thing a map is likely to stand up, and the case a resolver that only tests its destination walks straight through.",
    }),
    solid({
      id: "boulder", x: -7, z: 5, rot: 0, halfX: 0, halfZ: 0, pad: 1.1, height: 1.6,
      why: "A boulder. A pure disc, so the normal is defined everywhere except its exact centre, which is the degenerate case the rescue path has to survive.",
    }),
    solid({
      id: "wall-north", x: 0, z: -9, rot: 0, halfX: 3, halfZ: 0.25, pad: 0.1, height: 2.4,
      why: "One leg of a right-angled ruin corner. Two walls meeting is where a single averaged contact normal is at its worst.",
    }),
    solid({
      id: "wall-east", x: 3.15, z: -6.1, rot: Math.PI / 2, halfX: 3, halfZ: 0.25, pad: 0.1, height: 2.4,
      why: "The other leg of the ruin corner.",
    }),
    solid({
      id: "gatepost-left", x: -2.2, z: 11, rot: 0, halfX: 0, halfZ: 0, pad: 0.35, height: 3,
      why: "A gate post. With its twin it leaves a gap 2.5 m wide — wider than a body but not by much, which is the squeeze case.",
    }),
    solid({
      id: "gatepost-right", x: 2.2, z: 11, rot: 0, halfX: 0, halfZ: 0, pad: 0.35, height: 3,
      why: "The other gate post.",
    }),
  ],
};

// THE MOOR IS IN THE LIST, and it was not when it was built.
//
// This file read 12/12 with `PICT_MOOR` in the tree and four new solids on it,
// because it only ever walked the village and the proving ground — a gate green
// because the case is absent. The moor's standing stones are declared solid so
// that a man can be shoved into one, and "declared solid" is worth nothing
// until something has tried to walk through them.
//
// Appended rather than inserted: the lever below reaches for `GROUNDS[0]` by
// index and swaps the village's rick for a broken one.
const GROUNDS = [SAXON_VILLAGE, PROVING_GROUND, PICT_MOOR, ROMAN_FORT, DANELAW_CAMP];

/**
 * Nothing on it and no bound. Used to MEASURE the driver's own largest
 * single-tick travel, rather than to test anything: a number about how far a
 * roll goes must not be taken on a floor that can stop it.
 */
const PROVING_GROUND_EMPTY = { id: "empty", name: "Open ground (fixture)", obstacles: [] };

// The lever. R1: change the constant you believe controls the number, BY A LOT,
// and check the number MOVES — and that it moved somewhere the feature does
// something. Both levers rebuild the woodpile from its own declaration, so a
// lever that moves the collision without moving the render is impossible by
// construction; the render half is pulled with `tools/shoot.mjs`.
let LEVERED = null;
if (LEVER) {
  const base = SAXON_VILLAGE.obstacles[0].plan;
  const plan = { ...base, seeded, id: "woodpile" };
  if (LEVER === "move") { plan.x = base.x + 6; plan.z = base.z + 2; }
  else if (LEVER === "grow") { plan.billet = base.billet * 2.5; }
  else { console.error(`[solid] unknown lever '${LEVER}' — try move or grow`); process.exit(2); }
  LEVERED = rick(plan);
  GROUNDS[0] = { ...SAXON_VILLAGE, obstacles: [LEVERED, SAXON_VILLAGE.obstacles[1]] };
}

/**
 * R1: pull the lever, then LOOK AT WHERE IT LANDED.
 *
 * A footprint that changes when the declaration changes is only half the
 * evidence — the other half is that the change lands somewhere the feature does
 * something. So both levers also report where a man walking due east into the
 * woodpile is actually STOPPED, which is the quantity a player experiences, and
 * that number has to move with the pile.
 *
 * The picture is the other half again and this harness cannot see it:
 * `node tools/shoot.mjs arena` with the lever pulled in `grounds.mjs` is how
 * you check the RENDER moved too. Both come out of the same declaration, so a
 * picture that did not move would mean the renderer is not reading it.
 */
function stopLine(ground) {
  const pile = ground.obstacles.find((s) => s.id === "woodpile");
  // Along the pile's OWN centre line, so he always meets it, and the number is
  // where the timber first stops him rather than where he ends up after
  // sliding round it — which, measured, is the palisade in every case and is
  // therefore a number about the ring rather than about the woodpile.
  const man = newMan(pile.x - 6, pile.z);
  for (let t = 0; t < 120; t++) {
    tick(ground, man, 1, 0, TOP_WALK);
    if (solidDistance(pile, man.x, man.z) < BODY_RADIUS + 0.01) {
      return { x: man.x, met: true, gap: man.x - pile.x };
    }
  }
  return { x: man.x, met: false, gap: NaN };
}

const BEARINGS = 24;
const bearings = Array.from({ length: BEARINGS }, (_, i) => (i / BEARINGS) * Math.PI * 2);

/**
 * A start point outside a solid on a given bearing, and the heading from it to
 * the solid's centre.
 *
 * IT HAS TO BE A PLACE A MAN COULD ACTUALLY BE. The first version of this put
 * him at `bound + body + standoff` on the bearing and left him there, which for
 * the runestone — centre at r 17.7 with the ring at 18 — is OUTSIDE THE PLAY
 * DISC on a third of the bearings. No warrior is ever there: the ring is
 * enforced every tick and every spawn is inside it. Starting him there measured
 * the resolver's behaviour in a state the game cannot produce, and then blamed
 * it for the result. Pulled back inside the ring instead, which is where the
 * men who have to walk at that stone come from.
 */
function approach(s, bearing, standoff) {
  const d = s.bound + BODY_RADIUS + standoff;
  let x = s.x + Math.cos(bearing) * d;
  let z = s.z + Math.sin(bearing) * d;
  const r = Math.hypot(x, z);
  if (r > ARENA_RADIUS - 0.05) {
    const k = (ARENA_RADIUS - 0.05) / r;
    x *= k; z *= k;
  }
  const dx = s.x - x, dz = s.z - z;
  const l = Math.hypot(dx, dz) || 1;
  return { x, z, dirX: dx / l, dirZ: dz / l, standoff: l - s.bound - BODY_RADIUS };
}

/** Is a point inside a solid, by how much? Positive means overlapping. */
function overlap(ground, x, z) {
  let worst = 0;
  for (const s of ground.obstacles) {
    const d = BODY_RADIUS - solidDistance(s, x, z);
    if (d > worst) worst = d;
  }
  return worst;
}

console.log(`\nSOLID GROUND — ${HOLLOW ? "HOLLOW CONTROL (the build before this unit)" : "the gate"}`);
if (LEVERED) {
  const was = stopLine(SAXON_VILLAGE);
  const now = stopLine(GROUNDS[0]);
  const b = SAXON_VILLAGE.obstacles[0];
  console.log(`  LEVER: ${LEVER}`);
  console.log(`    woodpile  (${b.x.toFixed(2)}, ${b.z.toFixed(2)}) halfX ${b.halfX.toFixed(3)}`
    + `  ->  (${LEVERED.x.toFixed(2)}, ${LEVERED.z.toFixed(2)}) halfX ${LEVERED.halfX.toFixed(3)}`);
  console.log(`    a man walking due east along its centre line first meets timber at`
    + ` x = ${was.x.toFixed(3)}  ->  ${now.met ? now.x.toFixed(3) : "never — the pile is not there any more"}`);
  if (now.met) console.log(`    ...which is ${was.gap.toFixed(3)} m short of the pile's centre  ->  ${now.gap.toFixed(3)} m`);
}
console.log(`  body radius ${BODY_RADIUS} (BODY_MIN_SEP/2), tick ${(DT * 1000).toFixed(0)} ms, ring ${ARENA_RADIUS} m — all read out of engine.mjs`);
console.log(`  fastest legs ${TOP_SPRINT} u/s, longest roll ${TOP_ROLL} m\n`);

// ===========================================================================
// CLAIM 1 — "instead of walking through them"
// ===========================================================================
{
  // "Walked through it" is measured as A BODY OCCUPYING THE PROP, not as a body
  // reaching the far side. Reaching the far side is what SLIDING looks like and
  // it is the behaviour we want: a man who meets the woodpile at an angle,
  // slides along it and walks on past has not walked through anything. Grading
  // arrival would have failed the correct behaviour and passed a wall that
  // stopped men dead — a ruler answering a neighbouring question, which is this
  // repository's signature failure and was this harness's first draft.
  let bad = 0, walks = 0, deepest = 0, worstId = "";
  const perSolid = new Map();
  for (const ground of GROUNDS) {
    for (const s of ground.obstacles) {
      for (const b of bearings) {
        for (const speed of [TOP_WALK, TOP_SPRINT]) {
          walks++;
          const a = approach(s, b, 1.4);
          const man = newMan(a.x, a.z);
          let worstHere = 0;
          for (let t = 0; t < 60; t++) {
            tick(ground, man, a.dirX, a.dirZ, speed);
            const d = overlap(ground, man.x, man.z);
            if (d > worstHere) worstHere = d;
          }
          if (worstHere > deepest) { deepest = worstHere; worstId = s.id; }
          if (worstHere > SOLID_TOLERANCE) {
            bad++;
            perSolid.set(s.id, (perSolid.get(s.id) || 0) + 1);
          }
        }
      }
    }
  }
  const detail = bad
    ? `${bad} of ${walks} walks put a body inside the prop — ${[...perSolid].map(([k, v]) => `${k} ${v}`).join(", ")}; deepest ${(deepest * 1000).toFixed(0)} mm into ${worstId}`
    : `${walks} walks into ${GROUNDS.reduce((n, g) => n + g.obstacles.length, 0)} solids from ${BEARINGS} bearings at walk and sprint: not one body entered a prop, deepest approach ${(deepest * 1000).toFixed(1)} mm past touching`;
  check("the owner's sentence — a man walked at a prop does not walk through it", bad === 0, detail);
}

// ===========================================================================
// CLAIM 2 — never inside
// ===========================================================================
{
  let deepest = 0, worst = "";
  let samples = 0;
  for (const ground of GROUNDS) {
    for (const s of ground.obstacles) {
      for (const b of bearings) {
        const a = approach(s, b, 1.2);
        const man = newMan(a.x, a.z);
        for (let t = 0; t < 80; t++) {
          // Lean into it, and every twelfth tick lean sideways too, so the body
          // is dragged along the surface rather than parked on its normal.
          const skew = t % 12 < 6 ? 0.6 : -0.6;
          const dx = a.dirX - a.dirZ * skew;
          const dz = a.dirZ + a.dirX * skew;
          tick(ground, man, dx, dz, TOP_SPRINT);
          samples++;
          const d = overlap(ground, man.x, man.z);
          if (d > deepest) { deepest = d; worst = `${s.id} on bearing ${(b * 180 / Math.PI).toFixed(0)}°`; }
        }
      }
    }
  }
  check("never inside — no body overlaps a solid at any tick of any walk",
    deepest <= SOLID_TOLERANCE,
    `${samples} ticks measured; deepest overlap ${(deepest * 1000).toFixed(1)} mm${deepest > 0 ? ` (${worst})` : ""}, tolerance ${(SOLID_TOLERANCE * 1000).toFixed(0)} mm`);
}

// ===========================================================================
// CLAIM 3 — slides free, and does not stop dead
// ===========================================================================
{
  // A man walking at a surface 30° off its normal should keep most of his
  // speed. cos(30°) of it goes into the wall; sin(30°) — half — is his to keep,
  // and a resolver that rejected the whole step would leave him nothing.
  //
  // MEASURED ON FLAT FACES, and that restriction is the difference between this
  // claim and a slogan. Two things had to come out of it:
  //
  //  * CORNERS. A body in the ruin's right angle, or wedged between the
  //    runestone and the ring, is stopped by two normals and keeps nothing —
  //    which is correct, and is claim SIX's business.
  //  * CAPS AND CURVES. Walk at the END of the fence and the surface under you
  //    is a 6 cm radius cap: you round it in a tick and are then running into
  //    the LONG face at a completely different angle from the one you set out
  //    at. The first draft scored that against the angle it set out at and read
  //    3% — a number about the fence's shape, not about sliding. A boulder is
  //    the same problem all the way round, which is why a disc has no entry
  //    here; claims FOUR and EIGHT are what say a man gets past one.
  //
  // So: a face at least a metre long, entered at its middle, and the speed read
  // before the body can reach either end of it.
  const faces = [];
  for (const ground of GROUNDS) {
    for (const s of ground.obstacles) {
      for (const axis of [0, 1]) {
        const along = axis === 0 ? s.halfX : s.halfZ;   // half-length of this face
        const out = axis === 0 ? s.halfZ : s.halfX;     // half-depth to it
        if (along < 0.5) continue;                      // not a face, a cap
        for (const sign of [-1, 1]) {
          // Face midpoint and outward normal, in the solid's frame, then world.
          const lx = axis === 0 ? 0 : sign * (out + s.pad);
          const lz = axis === 0 ? sign * (out + s.pad) : 0;
          const nlx = axis === 0 ? 0 : sign;
          const nlz = axis === 0 ? sign : 0;
          const w = (px, pz) => ({ x: px * s.cos + pz * s.sin, z: -px * s.sin + pz * s.cos });
          const p = w(lx, lz);
          const n = w(nlx, nlz);
          faces.push({ ground, s, x: s.x + p.x, z: s.z + p.z, nx: n.x, nz: n.z, run: along });
        }
      }
    }
  }

  let worstKeep = 1, worstWhere = "";
  let cases = 0, skipped = 0;
  const alone = (ground, man, s) => {
    if (Math.hypot(man.x, man.z) > ARENA_RADIUS - 1.5) return false;
    for (const o of ground.obstacles) {
      if (o === s) continue;
      if (solidDistance(o, man.x, man.z) < BODY_RADIUS + 1.0) return false;
    }
    return true;
  };
  for (const f of faces) {
    for (const skew of [-0.9, -0.5, 0.5, 0.9]) {   // radians off the face normal
      const startX = f.x + f.nx * (BODY_RADIUS + 0.9);
      const startZ = f.z + f.nz * (BODY_RADIUS + 0.9);
      if (Math.hypot(startX, startZ) > ARENA_RADIUS - 0.2) { skipped++; continue; }
      // Straight at the face, turned by `skew` about the up axis.
      const rx = -f.nx * Math.cos(skew) + f.nz * Math.sin(skew);
      const rz = -f.nx * Math.sin(skew) - f.nz * Math.cos(skew);
      // The control: the SAME man walking the SAME intent for the SAME number
      // of ticks with nothing in his way. What he is owed on contact is his
      // free speed with the into-the-wall component taken off, and comparing
      // against a measured free run rather than against `speed * sin(skew)`
      // takes the acceleration curve out of the answer entirely — otherwise
      // this reads "how far up MOVE_ACCEL_TAU are we" and calls it sliding.
      const man = newMan(startX, startZ);
      const free = newMan(startX, startZ);
      const OPEN = { id: "open", obstacles: [], play: null };
      let keep = null;
      for (let t = 0; t < 40; t++) {
        const r = tick(f.ground, man, rx, rz, TOP_WALK);
        tick(OPEN, free, rx, rz, TOP_WALK);
        if (r.hit && t > 3) {
          for (let k = 0; k < 4; k++) {
            tick(f.ground, man, rx, rz, TOP_WALK);
            tick(OPEN, free, rx, rz, TOP_WALK);
          }
          // Still on the flat, not round a cap, and nothing else in contact.
          const off = Math.abs((man.x - f.x) * -f.nz + (man.z - f.z) * f.nx);
          if (off > f.run - 0.15 || !alone(f.ground, man, f.s)) break;
          const owed = Math.abs(free.mvx * -f.nz + free.mvz * f.nx);
          if (owed < 0.2) break;
          keep = Math.hypot(man.mvx, man.mvz) / owed;
          break;
        }
      }
      if (keep === null) { skipped++; continue; }
      cases++;
      if (keep < worstKeep) { worstKeep = keep; worstWhere = `${f.s.id} at ${(skew * 180 / Math.PI).toFixed(0)}° off the face normal`; }
    }
  }
  check("slides free — contact costs the stride its into-the-wall half and nothing else",
    worstKeep > 0.98 && cases >= 15,
    cases === 0
      ? `${faces.length} flat faces of 1 m or more, and NOT ONE of them was ever touched — every approach walked through the wall, so there was never anything to slide along`
      : `${cases} glancing approaches onto ${faces.length} flat faces of 1 m or more (${skipped} skipped: the body reached a corner, a cap or the ring first); the worst kept ${(worstKeep * 100).toFixed(1)}% of the tangential speed it was owed${worstWhere ? ` (${worstWhere})` : ""}`);
}

// ===========================================================================
// CLAIM 4 — never stuck
// ===========================================================================
{
  // Press into a solid until contact, then turn and walk away. A man who is
  // stuck is one who does not leave.
  let worst = 0, worstWhere = "", cases = 0;
  for (const ground of GROUNDS) {
    for (const s of ground.obstacles) {
      for (const b of bearings) {
        cases++;
        const a = approach(s, b, 0.8);
        const man = newMan(a.x, a.z);
        for (let t = 0; t < 40; t++) tick(ground, man, a.dirX, a.dirZ, TOP_SPRINT);
        const heldX = man.x, heldZ = man.z;
        // About turn.
        for (let t = 0; t < 10; t++) tick(ground, man, -a.dirX, -a.dirZ, TOP_SPRINT);
        const got = Math.hypot(man.x - heldX, man.z - heldZ);
        // Ten ticks is half a second; from a standing start the accel term
        // alone puts a sprinter well past a metre.
        if (got < 1.0) { if (got > worst) worst = got; worstWhere = `${s.id} on ${(b * 180 / Math.PI).toFixed(0)}°`; }
        if (worst === 0 && got < 1.0) worst = got;
      }
    }
  }
  const stuck = worstWhere !== "";
  check("never stuck — a body pressed into a solid walks away the moment it turns",
    !stuck,
    stuck ? `worst: ${worst.toFixed(2)} m in half a second at ${worstWhere}` : `${cases} press-and-turn cases, every one clear of the surface within half a second`);
}

// ===========================================================================
// CLAIM 5 — a roll cannot tunnel
// ===========================================================================
{
  // WHAT THIS CLAIM USED TO SAY, AND WHY IT WAS THEATRE.
  //
  // It printed "1.18 m of travel in the first tick", computed as the roll's
  // first-tick impulse PLUS a full sprint in the legs. The engine does not do
  // that and neither does this file's own driver: a dodge sets
  // `player.moveVel.x = 0` — "the roll owns the body", `engine.mjs` — and
  // `roll()` above reproduces it faithfully. So the number beside the claim was
  // 54% larger than the thing the claim was measuring, which is rule R7's fault
  // exactly: a comment describing a value the code does not have, and trusted
  // because it is written down.
  //
  // Worse, the number it should have said is 0.766 m, which is BELOW the body's
  // own 1.050 m diameter. A body cannot pass through a solid in one step unless
  // it travels further than its own width plus the solid's — so at today's
  // numbers this claim CANNOT FAIL, and an adversary duly set `steps = 1`,
  // deleting the substepping the claim exists to protect, and watched it stay
  // green.
  //
  // So the claim is now three measurements instead of one slogan:
  //   * the real largest single-tick travel, taken off the driver rather than
  //     from a formula written next to it;
  //   * the live case, which is what the game can actually produce;
  //   * a HEADROOM case that proves the substepping is load-bearing, by driving
  //     the resolver at a jump the game cannot reach yet and showing that
  //     endpoint-only resolution goes clean through the rail while the real call
  //     stops at it. That is the difference between a guarantee and a coincidence.
  //
  // MEASURED, not asserted: the largest displacement the driver produces in one
  // tick, over the same rolls the live case fires.
  let firstTick = 0;
  {
    const probe = newMan(0, 0);
    roll(probe, 1, 0, TOP_ROLL);
    const was = probe.x;
    tick(PROVING_GROUND_EMPTY, probe, 0, 0, 0);
    firstTick = Math.abs(probe.x - was);
  }
  let bad = 0, cases = 0, deepest = 0, worstId = "";
  for (const ground of GROUNDS) {
    for (const s of ground.obstacles) {
      for (const b of bearings) {
        cases++;
        const a = approach(s, b, 0.15);
        const man = newMan(a.x, a.z);
        // Legs already at full sprint into it when the roll fires.
        for (let t = 0; t < 12; t++) tick(ground, man, a.dirX, a.dirZ, TOP_SPRINT);
        roll(man, a.dirX, a.dirZ, TOP_ROLL);
        let worstHere = 0;
        for (let t = 0; t < 30; t++) {
          tick(ground, man, 0, 0, 0);
          const d = overlap(ground, man.x, man.z);
          if (d > worstHere) worstHere = d;
        }
        if (worstHere > deepest) { deepest = worstHere; worstId = s.id; }
        if (worstHere > SOLID_TOLERANCE) bad++;
      }
    }
  }
  // THE HEADROOM CASE — and the proof that the substepping is not dead code.
  //
  // A body of diameter D cannot cross a solid of thickness T in one step unless
  // it travels further than D + T. The rail is 0.12 m and a body is 1.05 m, so
  // the crossing threshold is 1.17 m and the game's largest step is 0.766 m: at
  // today's numbers endpoint-only resolution would be enough, which is precisely
  // why the live case above proves nothing about substepping.
  //
  // This drives the resolver at a jump well past that threshold and compares two
  // calls on the SAME destination:
  //   * `resolveSolids(from -> to)` — the real call, which sweeps the path;
  //   * `resolveSolids(to -> to)` — a zero-length step at the destination, which
  //     is exactly what "resolve the endpoint only" means.
  // If the second one lands past the rail and the first does not, the sweep is
  // the thing doing the work and deleting it would be felt.
  const rail = PROVING_GROUND.obstacles.find((s) => s.id === "fence");
  const nx = -Math.sin(rail.rot), nz = Math.cos(rail.rot);   // the rail's own normal
  const JUMP = 2.0;   // metres, comfortably past D + T = 1.17
  const fromX = rail.x - nx * (JUMP / 2), fromZ = rail.z - nz * (JUMP / 2);
  const toX = rail.x + nx * (JUMP / 2), toZ = rail.z + nz * (JUMP / 2);
  const swept = resolveSolids(PROVING_GROUND, fromX, fromZ, toX, toZ, BODY_RADIUS);
  const endpointOnly = resolveSolids(PROVING_GROUND, toX, toZ, toX, toZ, BODY_RADIUS);
  // "Past the rail" is measured on the rail's own normal, signed from its centre.
  const sideOf = (p) => (p.x - rail.x) * nx + (p.z - rail.z) * nz;
  const sweptStopped = sideOf(swept) < BODY_RADIUS;
  const endpointTunnelled = sideOf(endpointOnly) > BODY_RADIUS;
  const crossing = 2 * BODY_RADIUS + 2 * 0.06;

  check("a dodge roll cannot tunnel — the longest roll in the game against the thinnest rail",
    bad === 0 && sweptStopped && endpointTunnelled,
    `${cases} rolls fired point-blank from ${BEARINGS} bearings with the legs already sprinting: ${bad} put a body inside, deepest ${(deepest * 1000).toFixed(1)} mm${deepest > SOLID_TOLERANCE ? ` (${worstId})` : ""}. `
    + `LARGEST SINGLE-TICK TRAVEL THE DRIVER PRODUCES, measured: ${firstTick.toFixed(3)} m (a ${TOP_ROLL} m roll — the legs are zeroed by the dodge, so no sprint adds to it), `
    + `against a crossing threshold of ${crossing.toFixed(3)} m (body ${(2 * BODY_RADIUS).toFixed(3)} + rail ${(2 * 0.06).toFixed(2)}). `
    + `HEADROOM: a ${JUMP.toFixed(1)} m jump through the rail stops at ${sideOf(swept).toFixed(3)} m off its centre (${sweptStopped ? "stopped" : "WENT THROUGH"}), while resolving the endpoint alone lands at ${sideOf(endpointOnly).toFixed(3)} m (${endpointTunnelled ? "tunnelled — so the sweep is what stops it" : "ALSO STOPPED, so this case proves nothing"})`);

  note(`the live case cannot tunnel at today's numbers (${firstTick.toFixed(3)} m < ${crossing.toFixed(3)} m) — the substepping is HEADROOM, and the headroom clause above is what proves it works`);
}

// ===========================================================================
// CLAIM 6 — the wedge between a solid and the play bound
// ===========================================================================
{
  // The runestone's far corner reaches past the ring. Drive a man into that
  // corner from every bearing and check that neither rule wins by putting him
  // inside the other.
  const ground = GROUNDS[0];
  const stone = ground.obstacles.find((s) => s.id === "runestone");
  const reach = Math.hypot(stone.x, stone.z) + stone.bound;
  let bad = 0, frozenTicks = 0, deepest = 0, outside = 0, cases = 0;
  for (const b of bearings) {
    cases++;
    const man = newMan(stone.x * 0.5, stone.z * 0.5);
    // Drive outward and around, so he is pressed into the ring beside the stone.
    for (let t = 0; t < 90; t++) {
      const sweep = b + t * 0.02;
      tick(ground, man, Math.cos(sweep), Math.sin(sweep), TOP_SPRINT);
      const d = overlap(ground, man.x, man.z);
      if (d > deepest) deepest = d;
      if (d > SOLID_TOLERANCE) bad++;
      const r = Math.hypot(man.x, man.z);
      if (r > ARENA_RADIUS + SOLID_TOLERANCE) outside++;
    }
    frozenTicks += man.frozen;
  }
  check("the wedge — the runestone's corner reaches past the ring, and neither rule wins",
    bad === 0 && outside === 0,
    `stone centre r ${Math.hypot(stone.x, stone.z).toFixed(2)}, its far corner r ${reach.toFixed(2)}, ring ${ARENA_RADIUS}; ${cases} sweeps: ${bad} ticks inside the stone (deepest ${(deepest * 1000).toFixed(1)} mm), ${outside} ticks outside the ring, ${frozenTicks} frozen`);
}

// ===========================================================================
// CLAIM 7 — a body that starts inside is ejected, not trapped
// ===========================================================================
{
  // The village spawn ring is 6–12 m and the woodpile centre is at r 6.8, so
  // this is not hypothetical: a round can open with a man in the firewood.
  let worstTicks = 0, teleported = 0, cases = 0, failed = 0, worstWhere = "";
  for (const ground of GROUNDS) {
    for (const s of ground.obstacles) {
      for (const b of bearings) {
        for (const frac of [0, 0.5]) {
          cases++;
          const man = newMan(s.x + Math.cos(b) * s.bound * frac, s.z + Math.sin(b) * s.bound * frac);
          const startX = man.x, startZ = man.z;
          let out = -1;
          for (let t = 0; t < 20; t++) {
            tick(ground, man, Math.cos(b), Math.sin(b), TOP_WALK);
            if (isClear(ground, man.x, man.z, BODY_RADIUS)) { out = t + 1; break; }
          }
          if (out < 0) { failed++; continue; }
          if (out > worstTicks) { worstTicks = out; worstWhere = `${s.id} at ${(b * 180 / Math.PI).toFixed(0)}°, ${frac === 0 ? "dead centre" : "half-radius out"}`; }
          // Ejected, not flung: he should leave by the nearest face.
          if (Math.hypot(man.x - startX, man.z - startZ) > s.bound + BODY_RADIUS + 0.6) teleported++;
        }
      }
    }
  }
  // Two ticks, not one, is the bar — and the reason is the runestone again.
  // A body planted in its outer half is inside the stone AND being pushed back
  // in by the play bound, so the first tick gets him out of the stone and onto
  // the ring and the second walks him clear along it. A hundred milliseconds,
  // and the alternative would be letting a body leave the arena to save a tick.
  check("a body standing inside a solid is pushed out, by the nearest face, at once",
    failed === 0 && teleported === 0 && worstTicks <= 2,
    `${cases} bodies planted inside solids (centre and half-radius, ${BEARINGS} bearings): ${failed} never got out, ${teleported} were flung across, worst case ${worstTicks} tick(s) = ${(worstTicks * DT * 1000).toFixed(0)} ms${worstWhere ? ` (${worstWhere})` : ""}`);
}

// ===========================================================================
// CLAIM 8 — bots do not walk into things forever
// ===========================================================================
{
  // A bot chasing a man on the far side of a solid. Without steering he presses
  // into the flat face and stops there, which is correct collision and useless
  // navigation; with `steerAroundSolids` he goes round.
  const runs = [];
  let unreachable = 0;
  // A solid whose inflated footprint touches another's is COMPOUND: a body
  // cannot pass between them, so the two are one obstacle with a shape no
  // single rounded rectangle has — and possibly a re-entrant one. The village
  // has none; the proving ground has a ruin corner precisely because map three
  // is a ruined fort. They are measured and reported, and gated separately,
  // because a reactive steerer's limits are a property of concave shapes.
  const joinedIds = new Set();
  for (const ground of GROUNDS) {
    for (const a of ground.obstacles) {
      for (const b of ground.obstacles) {
        if (a === b) continue;
        if (solidDistance(a, b.x, b.z) < b.bound + BODY_MIN_SEP) { joinedIds.add(a.id); joinedIds.add(b.id); }
      }
    }
  }
  for (const ground of GROUNDS) {
    for (const s of ground.obstacles) {
      for (const b of bearings) {
        const a = approach(s, b, 2.0);
        let goalX = s.x - Math.cos(b) * (s.bound + BODY_RADIUS + 2.0);
        let goalZ = s.z - Math.sin(b) * (s.bound + BODY_RADIUS + 2.0);
        // THE GOAL HAS TO BE SOMEWHERE A MAN COULD STAND. On the far side of
        // the runestone that is outside the play disc, and on the far side of
        // the fence it lands inside the ruin's east wall — both unreachable,
        // and the first draft of this claim scored a bot that could not have
        // arrived as a bot that would not. Twelve of its twenty-eight
        // "failures" were goals in the mud outside the arena.
        const gr = Math.hypot(goalX, goalZ);
        if (gr > ARENA_RADIUS - 0.8) { const k = (ARENA_RADIUS - 0.8) / gr; goalX *= k; goalZ *= k; }
        if (clearanceAt(ground, goalX, goalZ, BODY_RADIUS) < 0.25
            || Math.hypot(goalX - a.x, goalZ - a.z) < 2.5) { unreachable++; continue; }
        for (const steer of [false, true]) {
          const man = newMan(a.x, a.z);
          // One bot, one memory — the caller owns it, exactly as the engine's
          // bot record would.
          const brain = {};
          let arrived = -1;
          for (let t = 0; t < 200; t++) {   // ten seconds
            let dx = goalX - man.x, dz = goalZ - man.z;
            if (Math.hypot(dx, dz) < 0.6) { arrived = t; break; }
            if (steer) {
              const d = steerAroundSolids(ground, man.x, man.z, dx, dz, BODY_RADIUS, brain);
              dx = d.x; dz = d.z;
            }
            tick(ground, man, dx, dz, TOP_WALK);
          }
          runs.push({ steer, arrived, id: s.id, b, compound: joinedIds.has(s.id) });
        }
      }
    }
  }
  const withSteer = runs.filter((r) => r.steer);
  const without = runs.filter((r) => !r.steer);
  const free = withSteer.filter((r) => !r.compound);
  const joined = withSteer.filter((r) => r.compound);
  const lost = free.filter((r) => r.arrived < 0);
  const lostJoined = joined.filter((r) => r.arrived < 0);
  const lostBlind = without.filter((r) => r.arrived < 0);
  const arrivals = free.filter((r) => r.arrived >= 0).map((r) => r.arrived);
  const worst = arrivals.length ? Math.max(...arrivals) : 0;
  check("bots do not walk into things forever — steering gets every bot round every free-standing solid",
    lost.length === 0,
    `${free.length} bot runs at free-standing solids: ${lost.length} never arrived in ten seconds, slowest ${(worst * DT).toFixed(1)} s.\n          ` +
    `CONTROL, same runs with no steering: ${lostBlind.length} of ${without.length} never arrived — which is what the steering is for.\n          ` +
    `${unreachable} goals discarded as unreachable (outside the play disc, or inside another solid).`);
  if (VERBOSE) {
    for (const r of lost) note(`  lost: ${r.id} bearing ${(r.b * 180 / Math.PI).toFixed(0)}°`);
  }
  // R4: the deferral rides the verdict line, in the words a person will read.
  DEFERRALS.push(`${lostJoined.length} of ${joined.length} bot runs at the proving ground's COMPOUND obstacle `
    + `— two ruin walls that overlap — never reached their goal: one waypoint of lookahead cannot plan a `
    + `two-corner route, and every one of the six ends shuttling inside half a metre at the outside of the L. `
    + `A deeper search was tried and measured WORSE (81 lost at depth two by crow-flight, 20 when restricted `
    + `to same-solid blocks), so this is a limitation and not an oversight. Nothing on the village is compound; `
    + `a ruined fort would be, and docs/MAPS.md carries it.`);
}

// ===========================================================================
// CLAIM 9 — one definition
// ===========================================================================
{
  // Every part the renderer places for a solid must be inside that solid's
  // footprint. Since `fitFootprint` derived the footprint FROM those parts this
  // is close to a tautology — which is the point, and what a tautology by
  // construction is worth is that there is no second number to get wrong. What
  // it still catches is a fit that silently failed to converge.
  let worst = -Infinity, worstId = "";
  const pile = GROUNDS[0].obstacles.find((s) => s.id === "woodpile");
  const stone = GROUNDS[0].obstacles.find((s) => s.id === "runestone");
  for (const s of [pile, stone]) {
    const over = footprintEncloses(s, s.discs);
    if (over > worst) { worst = over; worstId = s.id; }
  }
  // And the renderer must actually READ the shared layout rather than keeping
  // its own. Cheap, and it is the regression that would reintroduce the fault.
  const worldSrc = readFileSync(resolve(ROOT, "src/game/client/render/world.ts"), "utf8");
  const readsPile = /VILLAGE_WOODPILE\.parts/.test(worldSrc) && /VILLAGE_WOODPILE\.plan/.test(worldSrc);
  const readsStone = /VILLAGE_RUNESTONE\.outline/.test(worldSrc) && /VILLAGE_RUNESTONE\.plan/.test(worldSrc);
  // The literals that used to be here. If any comes back as a placement, two
  // definitions are back with it.
  const relit = /const px = -5\.4|const AX = 0\.4|const sx = -3\.4;/.test(worldSrc);
  check("one definition — the picture and the wall are built from the same parts",
    worst <= 1e-6 && readsPile && readsStone && !relit,
    `footprint encloses every part it was fitted to, worst margin ${(worst * 1000).toFixed(3)} mm (${worstId}); ` +
    `world.ts reads the shared layout: woodpile ${readsPile}, runestone ${readsStone}; old placement literals back: ${relit}`);

  note(`woodpile: ${(2 * (pile.halfX + pile.pad)).toFixed(2)} x ${(2 * (pile.halfZ + pile.pad)).toFixed(2)} m from ${pile.discs.length} fitted parts, ${pile.height.toFixed(2)} m tall (height unused by the sim)`);
  note(`runestone: ${(2 * (stone.halfX + stone.pad)).toFixed(2)} x ${(2 * (stone.halfZ + stone.pad)).toFixed(2)} m, ${stone.height.toFixed(2)} m tall`);
}

// ===========================================================================
// CLAIM 10 — declared, not defaulted
// ===========================================================================
{
  // The owner's distinction only survives if it cannot be skipped. A prop kind
  // that lets you forget to say whether it blocks is a prop kind whose default
  // makes the decision for you.
  const threw = (fn) => { try { fn(); return false; } catch { return true; } };
  const noWhy = threw(() => solid({ id: "x", x: 0, z: 0, halfX: 1, halfZ: 1, pad: 0.1, height: 1 }));
  const emptyWhy = threw(() => solid({ id: "x", x: 0, z: 0, halfX: 1, halfZ: 1, pad: 0.1, height: 1, why: "big" }));
  const noHeight = threw(() => solid({ id: "x", x: 0, z: 0, halfX: 1, halfZ: 1, pad: 0.1, why: "a reason long enough" }));
  const noPassableWhy = threw(() => passable("y", ""));
  const declared = SAXON_VILLAGE.obstacles.every((s) => typeof s.why === "string" && s.why.length > 40);
  check("declared, not defaulted — a prop cannot become solid, or stay passable, by accident",
    noWhy && emptyWhy && noHeight && noPassableWhy && declared,
    `solid() refuses a missing reason (${noWhy}), a token reason (${emptyWhy}) and a missing height (${noHeight}); passable() refuses an empty reason (${noPassableWhy}); every village solid carries a real one (${declared})`);
}

// ===========================================================================
// CLAIM 11 — the wiring, and the deferral that rides the verdict line
// ===========================================================================
{
  const wired = /resolveSolids\s*\(/.test(ENGINE_SRC) && /solidground\.mjs/.test(ENGINE_SRC);
  const killOk = KILL_SHAPE.test(ENGINE_SRC);
  // NOT "the two copies agree" — "there is only one". The engine's own
  // `ARENA_RADIUS` is deleted; a reappearing `const ARENA_RADIUS = ...` is a
  // second statement of where the wall is, and the two would drift the way
  // `types.ts` and `engine.mjs` drifted on eight of twelve stat columns.
  const engineKeepsRing = /^const ARENA_RADIUS\s*=/m.test(ENGINE_SRC);
  check("the model matches the engine it models — killComponent parsed, and the ring exists once",
    killOk && !engineKeepsRing,
    `killComponent still has the shape this driver models: ${killOk}; engine declares its own ARENA_RADIUS: ${engineKeepsRing ? "YES — two definitions of the ring are back" : "no, it reads ground.play.radius"}; the ring under test is ${ARENA_RADIUS} m, from SAXON_VILLAGE.play`);
  void wired;   // claim 12 now rules on it directly.
}

// ===========================================================================
// CLAIM 12 — THE ENGINE'S OWN TICK ORDER, WITH A SCRUM ON THE WOODPILE
// ===========================================================================
{
  // WHY THIS CLAIM EXISTS, AND WHAT EVERY CLAIM ABOVE IT COULD NOT SEE.
  //
  // Claims 1-11 drive a movement loop that REPRODUCES `integrateMovement` and
  // then resolves. That was honest when the engine belonged to another agent,
  // and it was also blind in one specific direction: the engine does not stop
  // after the movement step. It runs a SOFT BODY-SEPARATION PASS afterwards,
  // which is positional — it writes `player.position` directly to hold two
  // warriors 1.05 m apart — and the driver above has no such pass at all.
  //
  // So wiring `resolveSolids` at the documented integration point alone leaves
  // this: the resolver places a body legally against the woodpile, and the
  // separation pass then shoves it back INTO the timber, with nothing after it
  // to undo that. It is invisible in a duel and continuous in a scrum, because a
  // push only happens when bodies overlap and two men rarely crowd one prop.
  //
  // MEASURED ON THE REAL ENGINE, both orders, same fixture, same seeds. The two
  // runs differ by one line — `if (pushed)` in `gameTick` turned off and on:
  //
  //   resolve at the movement step ONLY  ... 374 of 48,000 man-ticks ended with
  //                                          a body inside the prop, deepest 258 mm
  //   ...and again after the separation  ... 0 of 48,000
  //
  // And the duel control, on both builds: 0 of 12,000. THAT IS THE POINT. The
  // defect is invisible in a duel and 258 mm deep in a scrum, so a harness that
  // walked one man at the woodpile would have called this fixed and shipped it.
  // The owner's report is that he can walk through a woodpile; a fix that only
  // holds when nobody is standing next to him is not an answer to it.
  //
  // THE FIXTURE, and what is real about it. Eight bodies are PLACED in a ring
  // tight around the woodpile — a state the game can genuinely reach, since the
  // village's spawn ring is 6-12 m and the pile centre is at r 6.8, which
  // `solidground.mjs` names in its own header as a round that can open inside
  // the firewood. After the placement, EVERY TICK IS THE ENGINE'S: its bots, its
  // movement step, its separation pass, its resolve, in its order. Health is
  // topped up each tick so the scrum lasts the whole run rather than thinning
  // out into a duel — the claim is about the tick order, and the tick order does
  // not care how much health anybody has.
  //
  // A body is "inside" if its centre is nearer a solid than its own radius, read
  // at the END of a tick — which is the position the snapshot carries and
  // therefore the position a player sees.
  const TICKS = 600;
  const RUNS = 10;
  const BOTS = 7;   // plus the session player, who leans into the pile: eight.
  let manTicks = 0, insideTicks = 0, deepest = 0, duelManTicks = 0, duelInside = 0;

  const scrum = (nBots, seed, place) => {
    let a = (seed >>> 0) || 1;
    const real = Math.random;
    Math.random = function m32() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const engine = makeEngine({ autoTick: false });
    let latest = null;
    const sid = engine.connect((str) => {
      const m = JSON.parse(str);
      if ((m.type === "game_state" || m.type === "lobby_update" || m.type === "countdown"
        || m.type === "round_end") && m.data.players) latest = m.data;
    });
    // FRIENDLY, WHICH PINS THE ARENA TO THE VILLAGE — and the pin is load-
    // bearing. A plain `create` deals a war territory and THE ARENA FOLLOWS
    // ITS PEOPLE (`dealGroundFor`), so the ground under this room changed the
    // day the Danelaw got a camp of their own: the engine simulated the camp
    // while this harness measured overlap against the VILLAGE woodpile it had
    // teleported the bodies around — 9786 phantom man-ticks "inside" a prop
    // that was not in the room. Green for months only because every people
    // used to resolve to the village. A gate that asserts against one
    // ground's geometry pins the room to that ground, and checks the pin.
    engine.message(sid, { type: "create", data: { name: "Steward", mode: "blood_moot", bestOf: 1, friendly: true } });
    for (let i = 0; i < nBots; i++) {
      engine.message(sid, { type: "add_bot", data: { difficulty: "warrior", warriorClass: CLASSES[i % CLASSES.length] } });
    }
    engine.message(sid, { type: "start", data: {} });
    let settle = 0;
    while (settle < 30 && latest?.state !== "fighting") { engine.step(DT); settle += DT; }
    const room = [...engine._rooms.values()][0];
    if (!room) { Math.random = real; engine.stop(); return { manTicks: 0, inside: 0, deepest: 0 }; }
    // The pin, checked: this claim reads overlap against SAXON_VILLAGE's own
    // solids, so a room standing on any other ground makes every count below
    // a fiction. Refuse loudly rather than measure the wrong world.
    if (room.arena !== SAXON_VILLAGE.id) {
      Math.random = real; engine.stop();
      throw new Error(`scrum room stood up on "${room.arena}", not the village — the claim's geometry no longer matches the room`);
    }
    const bodies = [...room.players.values()];
    if (place) {
      const ring = place.bound + BODY_RADIUS - 0.20;   // shoulder to shoulder, pressed in
      bodies.forEach((p, i) => {
        const th = (i / bodies.length) * Math.PI * 2;
        p.position.x = place.x + Math.cos(th) * ring;
        p.position.z = place.z + Math.sin(th) * ring;
      });
    }
    let mt = 0, ins = 0, deep = 0;
    for (let t = 0; t < TICKS; t++) {
      // Nobody falls: the scrum has to last, and health is not what this measures.
      bodies.forEach((p) => { if (p.state !== "dead") p.health = p.maxHealth; });
      engine.step(DT);
      for (const p of bodies) {
        if (p.state === "dead") continue;
        mt++;
        const d = overlap(SAXON_VILLAGE, p.position.x, p.position.z);
        if (d > SOLID_TOLERANCE) ins++;
        if (d > deep) deep = d;
      }
    }
    Math.random = real;
    engine.stop();
    return { manTicks: mt, inside: ins, deepest: deep };
  };

  const pile = SAXON_VILLAGE.obstacles.find((s) => s.id === "woodpile");
  for (let r = 0; r < RUNS; r++) {
    const s = scrum(BOTS, 90210 + r * 7919, pile);
    manTicks += s.manTicks; insideTicks += s.inside; if (s.deepest > deepest) deepest = s.deepest;
    // The control on the control: the SAME measurement on a plain duel, which is
    // what a scrum has to be compared against. A gate that only ever sees the
    // easy case is a gate green because the case is absent.
    const d = scrum(1, 424242 + r * 7919, null);
    duelManTicks += d.manTicks; duelInside += d.inside;
  }

  check("the ENGINE's tick order — an eight-man scrum on the woodpile never ends a tick inside it",
    insideTicks === 0,
    `${RUNS} runs of ${TICKS} ticks, eight bodies jammed around the rick: ${insideTicks} of ${manTicks} man-ticks ended inside a prop, deepest ${(deepest * 1000).toFixed(1)} mm. `
    + `CONTROL, the same measurement on an undisturbed duel: ${duelInside} of ${duelManTicks}. `
    + `This runs engine.mjs itself — its bots, its movement step, its separation pass, its resolve, in its order — not the driver the claims above use.`);
}

// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.pass);
const wiredNow = /resolveSolids\s*\(/.test(ENGINE_SRC) && /solidground\.mjs/.test(ENGINE_SRC);
console.log("");
// The wiring is a FAILURE now, not a deferral. It was a deferral while
// `engine.mjs` belonged to another agent and no build existed in which the
// server could go green; it is wired, claim 12 fights in a real room, and an
// engine that stopped calling the resolver would make every claim above a
// measurement of a game nobody plays. So it goes red rather than riding the
// verdict line — a deferral whose reason has expired is just a hole.
if (!wiredNow) {
  results.push({ name: "engine.mjs calls resolveSolids", pass: false });
  console.log("  FAIL  engine.mjs no longer calls resolveSolids — claims 1-11 model a movement step the server does not run, and claim 12's room is fighting on a hologram");
}
console.log(`${failed.length ? "FAIL" : "PASS"}: solid ground — ${results.length - failed.length}/${results.length} claims`
  + (DEFERRALS.length ? `, WITH ${DEFERRALS.length} deferral(s) below, which is not a clean sheet` : ""));
for (const d of DEFERRALS) {
  console.log("");
  console.log(`  DEFERRED: ${d.replace(/(.{1,86})(\s|$)/g, (m, line) => `${line}\n            `).trim()}`);
}
if (HOLLOW) {
  console.log("");
  console.log("  --hollow is the CONTROL and it is supposed to be red. It takes the resolver");
  console.log("  out of THIS FILE'S DRIVER and leaves only the palisade ring, which is what");
  console.log("  engine.mjs did before this unit was wired. The claims that stay green in it");
  console.log("  are the ones that are not about solidity: 'never stuck' and 'bots' pass");
  console.log("  because a man who walks through everything is never stopped by anything, and");
  console.log("  'one definition', 'declared' and 'the model' are about the declarations rather");
  console.log("  than the collision. CLAIM 12 ALSO STAYS GREEN, and that is not a hole: it");
  console.log("  drives engine.mjs itself, which this flag cannot reach. Its own control is the");
  console.log("  duel count printed beside it, and its proof-of-failure is in its comment —");
  console.log("  374 of 48,000 man-ticks inside the rick with the engine's second resolve off.");
}
console.log("");
process.exit(failed.length ? 1 : 0);
