#!/usr/bin/env node
/**
 * classmatrix — WHO ACTUALLY BEATS WHOM.
 *
 * The owner, verbatim, and this whole file exists to answer it:
 *
 *   "rework of the stats of the 4 characters, I feel like each should have 2
 *    stats high to make it balanced. Runekeeper is fast but his skill needs
 *    work it's a bit poor & sometimes doesn't move you, he doesn't do much
 *    damage & doesn't have much health so hard to win with. Berserker feels
 *    slow & does high damage but has really low defense & lowish health.
 *    Warden does feel balanced, might be best in game if not for huscarl.
 *    Will take your recommendation after review"
 *
 * "Balanced" is exactly the kind of word that ships a guess, so this prints a
 * 4x4 of win rates with a confidence interval on every cell and a median
 * time-to-kill, and gates that no matchup sits outside a defensible band.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS BEING MEASURED, AND WHAT IS NOT — read this before trusting a number
 * ---------------------------------------------------------------------------
 *
 * THE FIGHTERS ARE THE ENGINE'S OWN BOTS. Both sides are driven by `botThink`
 * in `engine.mjs`, at the SAME `aiSkill`, in a real `blood_moot` room, over the
 * real 20 Hz authoritative tick. Nothing in this file decides how a man fights.
 * That is deliberate and it is the reason `add_bot` grew a `warriorClass`
 * field: the alternative was for the harness to write its own fighter, and a
 * harness that writes the fighter measures the fighter it wrote. This repo has
 * thirteen recorded instances of a ruler answering the wrong question and that
 * would have been the fourteenth.
 *
 * SO THIS MEASURES THE SHEET, NOT THE SKILL CEILING. A bot does not feint, does
 * not bait a parry, and takes its riposte window only by accident. A class whose
 * whole value is in the hands of a good human — and the runekeeper is meant to
 * be one — is UNDER-represented here. That is a real limit and it is on the
 * verdict line, not hidden in a comment. What the matrix does see, honestly, is
 * whether the numbers on the sheet let a class trade: reach, damage per second,
 * health, poise, whether a blow lands at all. That is the thing the owner asked
 * to have reviewed.
 *
 * RANDOMNESS IS SAMPLED, NEVER PINNED. `botThink` draws fresh noise on every
 * think — for the strike direction, whether the blow is heavy, whether the
 * guard goes up, the cadence jitter. A gate in this repo once pinned
 * `Math.random` to ONE seed and printed one realisation of a stochastic process
 * as if it were a property; one in four realisations failed the claim it called
 * proven. So: every bout gets its OWN stream, seeded `masterSeed + boutIndex`,
 * and the cell is the binomial over hundreds of bouts with a Wilson interval on
 * it. Reproducible AND a sample, which are not in conflict. `--seed` names the
 * master; the seed used is always printed, and `--entropy` takes it from the
 * clock so a run can be checked against a stream nobody chose.
 *
 * THE THIRD MAN IS MEASURED, NOT ASSUMED AWAY. A room needs a human session to
 * exist at all, so there is one, and he sprints for the palisade at the bell
 * and stands there. He is not assumed harmless: every bout records whether he
 * dealt or took a single point, and any bout where he did is DISCARDED and the
 * discard count rides the verdict line. A gate that quietly averaged in bouts
 * where a third body joined in would be measuring a brawl and calling it a duel.
 *
 * Usage:
 *   node tools/classmatrix.mjs                 200 bouts per ordered pair
 *   node tools/classmatrix.mjs --bouts=60      quicker, wider intervals
 *   node tools/classmatrix.mjs --seed=12345    reproduce an exact run
 *   node tools/classmatrix.mjs --entropy       master seed from the clock
 *   node tools/classmatrix.mjs --difficulty=jarl
 */

import { readFileSync } from "node:fs";
import { makeEngine, WARRIOR_STATS, WEAPON_REACH, SWING_ARC } from "../src/game/engine.mjs";

/**
 * Every table a matchup can be decided by, in one place, so the lever can pull
 * any of them. `WARRIOR_STATS` is what a player sees on a card; reach and arc
 * are not on any card and are, on the evidence below, the larger half of the
 * balance. A harness that could only pull the visible table would have spent
 * the afternoon moving health around a fight that reach was deciding.
 */
const TABLES = { stats: WARRIOR_STATS, reach: WEAPON_REACH, arc: SWING_ARC };

const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.slice(name.length + 3);
};
const BOUTS = Math.max(10, Number(argOf("bouts", 200)));
const DIFFICULTY = argOf("difficulty", "warrior");
const ENTROPY = argv.includes("--entropy");
const MASTER = ENTROPY ? (Date.now() % 1e9) : Number(argOf("seed", 20260813));
const VERBOSE = argv.includes("--verbose");

/**
 * THE CONTROL ON THE CONTROL. `--steward-stands` leaves the third man rooted on
 * his spawn instead of sprinting for the palisade, so the two bots find him and
 * the third-man discard has something to discard.
 *
 * It exists because every honest run reports `0 bout(s) discarded`, and a
 * safeguard that has never once fired is indistinguishable from a safeguard
 * that cannot fire — this repository's third rule, and the reason a gate green
 * because the case is absent is not a gate.
 *
 * MEASURED, 40 bouts a cell, seed 20260813, the two runs differing only in this
 * flag: the steward RUNNING discards 0 of 640, the steward STANDING discards 51
 * of 640 and additionally trips the mirror gate (huscarl mirror 30.0%
 * [18.1-45.4]), which is also correct — a brawl is not a duel and the harness
 * says so rather than averaging it in. So the detector fires, and the zero on
 * every honest verdict line is a fact about the fixture and not about the check.
 *
 * 51 and not 640, because a bout stops at the first bot death and a steward
 * pinned to his spawn point is usually not reached before then. It is the
 * conservative direction: interference is caught when it happens, and it does
 * not manufacture discards when it does not.
 */
const STEWARD_STANDS = argv.includes("--steward-stands");

/**
 * THE LEVER, as a flag, because rule 1 is the cheapest rule in this repository
 * and it should cost one line to obey.
 *
 *   node tools/classmatrix.mjs --lever=warden.maxHealth=40
 *   node tools/classmatrix.mjs --lever=reach.warden=0.5
 *   node tools/classmatrix.mjs --lever=arc.runekeeper=2.4
 *
 * Repeatable. It writes the engine's OWN exported tables before a single bout
 * runs, so the sim fights the changed numbers — and if a column is moved by a
 * lot and the matrix does NOT move, that column is not the thing deciding the
 * fight and the next hour would have been spent on the wrong table. The pulled
 * values are printed above the matrix so a lever run can never be mistaken for
 * a baseline one.
 */
const LEVERS = argv.filter((a) => a.startsWith("--lever=")).map((a) => a.slice(8));
for (const spec of LEVERS) {
  const m = /^([a-z]+)\.([A-Za-z]+)=(-?[\d.]+)$/.exec(spec);
  if (!m) { process.stderr.write(`classmatrix: cannot read lever "${spec}"\n`); process.exit(2); }
  const [, head, tail, val] = m;
  // `reach.warden` and `arc.warden` name a table then a class; anything else
  // names a class then a column of the stat sheet.
  const table = TABLES[head];
  if (table && table !== WARRIOR_STATS) {
    if (table[tail] === undefined) { process.stderr.write(`classmatrix: no such class ${head}.${tail}\n`); process.exit(2); }
    table[tail] = Number(val);
    continue;
  }
  if (!WARRIOR_STATS[head] || WARRIOR_STATS[head][tail] === undefined) {
    process.stderr.write(`classmatrix: no such column ${head}.${tail}\n`); process.exit(2);
  }
  WARRIOR_STATS[head][tail] = Number(val);
}

/** Sim seconds a bout may run before it is called a stalemate. */
const BOUT_CAP = 75;
/** Sim seconds of tick to burn before the bell so the room reaches `fighting`. */
const SETTLE_CAP = 30;
const TICK = 1 / 20;

// ---------------------------------------------------------------------------
// The stream. mulberry32 — small, fast, and it is REPLACED PER BOUT rather than
// pinned once, which is the whole difference between a sample and a realisation.
// ---------------------------------------------------------------------------
const TRUE_RANDOM = Math.random;
function seedStream(seed) {
  let a = (seed >>> 0) || 1;
  Math.random = function mulberry32() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const releaseStream = () => { Math.random = TRUE_RANDOM; };

// ---------------------------------------------------------------------------
// Wilson score interval — the right one for a proportion from n Bernoulli
// draws, and it does not collapse to a zero-width lie at p = 0 or p = 1 the way
// the normal approximation does. 95%.
// ---------------------------------------------------------------------------
function wilson(wins, n) {
  if (n === 0) return { p: 0, lo: 0, hi: 1 };
  const z = 1.959964;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

const median = (xs) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------------------------------------------------------------------------
// ONE BOUT.
// ---------------------------------------------------------------------------
/**
 * Fight `left` against `right` once and say who fell.
 *
 * Returns `{ winner, ttk, thirdMan, stalemate }`. `winner` is "left", "right"
 * or null; `ttk` is sim seconds from the bell to the fall; `thirdMan` is true
 * if the human in the room dealt or took anything, which disqualifies the bout.
 */
function runBout(left, right, seed, swapSides) {
  seedStream(seed);
  const engine = makeEngine({ autoTick: false });
  const seen = { hits: [], kills: [], playerId: null, joinData: null, latest: null };

  const sid = engine.connect((str) => {
    const m = JSON.parse(str);
    if (m.type === "join") { seen.playerId = m.data.playerId; seen.joinData = m.data; }
    if ((m.type === "game_state" || m.type === "lobby_update" || m.type === "countdown"
      || m.type === "round_end") && m.data.players) seen.latest = m.data;
    if (m.type === "hit") seen.hits.push(m.data);
    if (m.type === "kill") seen.kills.push(m.data);
  });

  engine.message(sid, { type: "create", data: { name: "Steward", mode: "blood_moot", bestOf: 1 } });
  // THE SIDE SWAP, AND WHY IT IS HERE.
  //
  // The first version of this file always inserted `left` first, and the mirror
  // diagonal — which is 50% by construction and is therefore this harness's own
  // control — came back huscarl 50, warden 61 [55-66], runekeeper 47,
  // berserker 51 at n=300. A warden mirror cannot be 61%. The cause is the
  // room's Map: `gameTick` walks it in insertion order, so the bot inserted
  // first THINKS first every tick and throws the first blow of an even trade.
  // It is worth nothing over an eighteen-second huscarl mirror and it is worth
  // eleven points over a seven-second warden mirror, which is the shortest
  // fight on the board.
  //
  // This is rule 2's one permitted exception: the ruler was proven to measure
  // the wrong quantity, so the RULER is fixed and it is said out loud. Half the
  // bouts in every cell now insert `right` first, so the think-order edge is
  // split evenly between the two classes instead of being paid entirely to one
  // column. The mirror diagonal is then gated on 50% (see MIRROR_BAND) so a
  // side bias can never come back unannounced.
  const order = swapSides ? [right, left] : [left, right];
  engine.message(sid, { type: "add_bot", data: { difficulty: DIFFICULTY, warriorClass: order[0] } });
  engine.message(sid, { type: "add_bot", data: { difficulty: DIFFICULTY, warriorClass: order[1] } });
  engine.message(sid, { type: "start", data: {} });

  const meId = seen.playerId;

  // Wind the room up to the bell.
  let settled = 0;
  while (settled < SETTLE_CAP && seen.latest?.state !== "fighting") { engine.step(TICK); settled += TICK; }
  if (seen.latest?.state !== "fighting") { engine.stop(); releaseStream(); throw new Error("room never reached `fighting`"); }

  // The two bots, in the order they were asked for — `serializeRoom` walks the
  // room's Map, which is insertion-ordered, and the host went in first. Order
  // is what identifies them, NOT class, because a mirror matchup has two of the
  // same class and would otherwise be scored against whichever body the lookup
  // happened to find first. The classes are then asserted, so an engine that
  // ever stopped honouring `warriorClass` fails loudly here instead of quietly
  // grading four huscarls against each other.
  const botIds = Object.keys(seen.latest.players).filter((id) => id.startsWith("bot_"));
  if (botIds.length !== 2) { engine.stop(); releaseStream(); throw new Error(`expected 2 bots, got ${botIds.length}`); }
  const [firstId, secondId] = botIds;
  const leftId = swapSides ? secondId : firstId;
  const rightId = swapSides ? firstId : secondId;
  const dealt = [seen.latest.players[leftId].warriorClass, seen.latest.players[rightId].warriorClass];
  if (dealt[0] !== left || dealt[1] !== right) {
    engine.stop(); releaseStream();
    throw new Error(`asked for ${left} vs ${right}, the room dealt ${dealt[0]} vs ${dealt[1]}`);
  }

  const hitsAtBell = seen.hits.length;
  const killsAtBell = seen.kills.length;

  // The human runs for the wall. His stride is spent OUTWARD from the origin,
  // which is where the fire and both bots are, and he holds it for the whole
  // bout so a bot that does chase him chases him away from the duel rather
  // than through it.
  let t = 0, winner = null, ttk = NaN;
  while (t < BOUT_CAP) {
    const me = seen.latest?.players?.[meId];
    if (me && !STEWARD_STANDS) {
      const r = Math.hypot(me.position.x, me.position.z) || 1;
      const ox = me.position.x / r, oz = me.position.z / r;
      engine.message(sid, { type: "input", data: {
        moveX: ox, moveZ: oz, rotationY: Math.atan2(ox, oz), sprint: true,
        attack: false, heavyAttack: false, block: false, dodge: false,
        crouch: false, ability: false, shove: false, attackDir: "right",
      } });
    }
    engine.step(TICK);
    t += TICK;
    const fell = seen.kills.slice(killsAtBell).find((k) => k.victimId === leftId || k.victimId === rightId);
    if (fell) { winner = fell.victimId === leftId ? "right" : "left"; ttk = t; break; }
  }

  // Did the third man take any part in it? Every hit broadcast carries both
  // ends, so this is a fact off the wire rather than an assumption.
  const thirdMan = seen.hits.slice(hitsAtBell)
    .some((h) => h.attackerId === meId || h.targetId === meId);

  const health = {
    left: seen.latest?.players?.[leftId]?.health ?? null,
    right: seen.latest?.players?.[rightId]?.health ?? null,
  };

  engine.message(sid, { type: "leave" });
  engine.stop();
  releaseStream();
  return { winner, ttk, thirdMan, stalemate: winner === null, health };
}

// ---------------------------------------------------------------------------
// THE MATRIX.
// ---------------------------------------------------------------------------
function runMatrix() {
  const cells = new Map();   // "left>right" -> { wins, n, ttks }
  let discarded = 0, stalemates = 0, bout = 0;

  for (const left of CLASSES) {
    for (const right of CLASSES) {
      const cell = { wins: 0, n: 0, ttks: [] };
      for (let i = 0; i < BOUTS; i++) {
        const r = runBout(left, right, MASTER + (bout++) * 7919, i % 2 === 1);
        if (r.thirdMan) { discarded++; continue; }
        if (r.stalemate) { stalemates++; cell.n++; continue; }  // counted, won by nobody
        cell.n++;
        if (r.winner === "left") cell.wins++;
        cell.ttks.push(r.ttk);
      }
      cells.set(`${left}>${right}`, cell);
      if (VERBOSE) {
        const w = wilson(cell.wins, cell.n);
        process.stderr.write(`  ${left} vs ${right}: ${(w.p * 100).toFixed(1)}%  n=${cell.n}\n`);
      }
    }
  }
  return { cells, discarded, stalemates };
}

// ---------------------------------------------------------------------------
// THE GATE.
//
// Two claims, and each one is a thing that can be false.
//
//   MATCHUP BAND. No ordered matchup may sit outside 30-70%. That is not a
//   demand that the classes be the same — 30/70 is a very lopsided matchup and
//   it is deliberately allowed, because four shapes that beat each other
//   differently is the ASK. What it forbids is a matchup nobody would pick the
//   losing side of. The test is on the interval, not the point: a cell fails
//   only when the whole 95% interval is outside the band, so a wide cell from a
//   short run cannot fail a class on noise.
//
//   OVERALL SPREAD. Each class's win rate against the FIELD (its row, mirror
//   excluded) must sit inside 40-60%. A class can be a rock-paper-scissors
//   counter and still be fine; a class that loses to everybody is the
//   runekeeper's complaint and it is what this line is for.
// ---------------------------------------------------------------------------
const BAND = { lo: 0.30, hi: 0.70 };
const FIELD_BAND = { lo: 0.40, hi: 0.60 };
//   THE MIRROR, which is a gate on the RULER and not on the roster. A class
//   fought against itself is 50% by construction — there is nothing left for it
//   to be. So a mirror cell that misses 50% is this harness reporting its own
//   bias, and it is the check that caught the insertion-order edge described in
//   `runBout`.
//
//   It is ruled on the INTERVAL and not on the point, like every other cell
//   here, and the first version of it was not: it compared the point estimate
//   to a fixed band and duly failed a --bouts=60 run whose interval was
//   [25.6-49.3] — twenty-four points wide and entirely consistent with a
//   perfectly fair harness. A gate that goes red because the run was short is a
//   gate people learn to ignore. The second clause is the floor under it: once n
//   is large the interval shrinks until any bias at all is "significant", and a
//   bias of under three points cannot move a matchup across a band that is forty
//   points wide, so it is reported and not failed on.
const MIRROR_TOLERANCE = 0.03;

/**
 * THE TWO SHEETS MUST AGREE — checked before a single bout runs, because if
 * they do not, the matrix below is measuring a roster no player will ever see.
 *
 * `src/game/types.ts` carries a second copy of `WARRIOR_STATS` that the class
 * card, the HUD and `anim.ts` read. It disagreed with the engine's on EIGHT of
 * twelve columns for the life of the project — a recorded defect
 * (`docs/WIRE-PROTOCOL.md` §9.11) whose visible symptom was a card promising 90
 * health while the bar filled to 100. Nothing failed when they drifted, which is
 * the whole reason they drifted. This is the something that fails.
 *
 * It reads the TypeScript as text rather than importing it: this is a plain
 * `.mjs` harness with no build step in front of it, and a gate that needs a
 * toolchain to run is a gate that stops being run.
 */
function sheetsAgree() {
  const src = readFileSync(new URL("../src/game/types.ts", import.meta.url), "utf8");
  const block = /export const WARRIOR_STATS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src);
  if (!block) return ["could not find WARRIOR_STATS in src/game/types.ts at all"];
  const drift = [];
  for (const cls of CLASSES) {
    const body = new RegExp(`\\b${cls}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`).exec(block[1]);
    if (!body) { drift.push(`types.ts has no ${cls} row`); continue; }
    for (const [col, want] of Object.entries(WARRIOR_STATS[cls])) {
      if (typeof want !== "number") continue;
      const hit = new RegExp(`\\b${col}:\\s*(-?[\\d.]+)`).exec(body[1]);
      if (!hit) { drift.push(`types.ts ${cls} is missing ${col}`); continue; }
      if (Math.abs(Number(hit[1]) - want) > 1e-9) drift.push(`${cls}.${col}: engine ${want}, types.ts ${hit[1]}`);
    }
  }
  return drift;
}

/**
 * FOUR SHAPES, NOT FOUR AVERAGES — and this is the gate that stops the band
 * below from being satisfied the forbidden way.
 *
 * The 30-70% band and the 40-60% field band are both trivially passed by making
 * every class identical: four copies of one man draw every matchup at exactly
 * 50%, and the verdict line goes green on a roster with no roster in it. The
 * brief forbids it in as many words — *DO NOT make the classes the same* — and a
 * band that a forbidden fix passes is not a gate, so the ask itself is gated
 * here instead of trusted.
 *
 * The owner's ask, verbatim: *"each should have 2 stats high to make it
 * balanced"*. That is four card stats and, for each class, exactly two of them
 * in the top half of the field — and the four PAIRS all different, or two
 * classes are the same shape wearing different numbers.
 *
 * DAMAGE is the one axis that is not a single column, and deliberately: a
 * runekeeper's damage is a RATE (14 every 0.58 s) and a berserker's is a BLOW
 * (50 at a time behind the longest telegraph in the game). Both are honestly
 * "high damage" on a card and they are not the same class. So the axis is the
 * better of the two, each normalised against its own field maximum, which lets
 * two classes be strong on it in two different ways — which is the whole point.
 *
 * FLATNESS is checked before ranking. "Top two" is meaningless when second and
 * third are a hair apart, so an axis whose 2nd and 3rd differ by less than 4% of
 * its own spread is reported as CONVERGED and fails — that is the shape a
 * roster takes on its way to being four averages, and it is caught before the
 * ranking can paper over it.
 */
const AXES = ["HEALTH", "DEFENCE", "SPEED", "DAMAGE"];
function axisValues(axis) {
  const dps = (c) => WARRIOR_STATS[c].attackDamage / WARRIOR_STATS[c].attackSpeed;
  const maxDps = Math.max(...CLASSES.map(dps));
  const maxBlow = Math.max(...CLASSES.map((c) => WARRIOR_STATS[c].heavyDamage));
  return Object.fromEntries(CLASSES.map((c) => [c,
    axis === "HEALTH" ? WARRIOR_STATS[c].maxHealth
      : axis === "DEFENCE" ? WARRIOR_STATS[c].blockReduction
        : axis === "SPEED" ? WARRIOR_STATS[c].moveSpeed
          : Math.max(dps(c) / maxDps, WARRIOR_STATS[c].heavyDamage / maxBlow)]));
}

function shapesAreDistinct() {
  const problems = [];
  const strengths = Object.fromEntries(CLASSES.map((c) => [c, []]));
  const table = [];
  for (const axis of AXES) {
    const v = axisValues(axis);
    const sorted = [...CLASSES].sort((a, b) => v[b] - v[a]);
    const spread = v[sorted[0]] - v[sorted[3]];
    const gap = v[sorted[1]] - v[sorted[2]];
    if (spread <= 0 || gap < spread * 0.04) {
      problems.push(`${axis} has CONVERGED — 2nd (${sorted[1]}) and 3rd (${sorted[2]}) are ${gap.toFixed(3)} apart across a spread of ${spread.toFixed(3)}, so "high on this stat" does not mean anything`);
    }
    strengths[sorted[0]].push(axis);
    strengths[sorted[1]].push(axis);
    table.push(`  ${axis.padEnd(9)} ${sorted.map((c) => `${c} ${v[c].toFixed(2)}`).join("   ")}`);
  }
  for (const c of CLASSES) {
    if (strengths[c].length !== 2) {
      problems.push(`${c} is high on ${strengths[c].length} stat(s) (${strengths[c].join("+") || "none"}) — the ask is exactly two`);
    }
  }
  const pairs = new Map();
  for (const c of CLASSES) {
    const key = [...strengths[c]].sort().join("+");
    if (pairs.has(key)) problems.push(`${c} and ${pairs.get(key)} are the same shape — both are ${key}`);
    else pairs.set(key, c);
  }
  return { problems, strengths, table };
}

function main() {
  const started = Date.now();
  // Before anything else, and it exits rather than reporting: a matrix measured
  // against a sheet the client does not share is not a measurement of this game.
  // Skipped on a lever run, where the two are MEANT to disagree — that is what a
  // lever is.
  if (!LEVERS.length) {
    const drift = sheetsAgree();
    if (drift.length) {
      process.stdout.write(`FAIL: the two sheets — engine.mjs and types.ts disagree on ${drift.length} value(s), so the roster measured below is not the roster a player is shown\n`);
      for (const d of drift) process.stdout.write(`  ${d}\n`);
      process.exitCode = 1;
      return;
    }
  }
  process.stderr.write(`classmatrix: ${BOUTS} bouts x 16 ordered matchups, ${DIFFICULTY} bots, master seed ${MASTER}${ENTROPY ? " (from the clock)" : ""}\n`);
  if (LEVERS.length) process.stderr.write(`classmatrix: LEVER RUN, not a baseline — ${LEVERS.join(", ")}\n`);
  const { cells, discarded, stalemates } = runMatrix();

  // ---- the table ----
  const pad = (s, n) => String(s).padEnd(n);
  const lines = [];
  lines.push("");
  lines.push("WIN RATE OF THE ROW CLASS AGAINST THE COLUMN CLASS (95% Wilson interval)");
  lines.push("");
  lines.push(pad("", 12) + CLASSES.map((c) => pad(c, 20)).join(""));
  for (const left of CLASSES) {
    let row = pad(left, 12);
    for (const right of CLASSES) {
      const c = cells.get(`${left}>${right}`);
      const w = wilson(c.wins, c.n);
      row += pad(`${(w.p * 100).toFixed(0)}% [${(w.lo * 100).toFixed(0)}-${(w.hi * 100).toFixed(0)}]`, 20);
    }
    lines.push(row);
  }
  lines.push("");
  lines.push("MEDIAN TIME TO KILL, SIM SECONDS (row kills column)");
  lines.push("");
  lines.push(pad("", 12) + CLASSES.map((c) => pad(c, 20)).join(""));
  for (const left of CLASSES) {
    let row = pad(left, 12);
    for (const right of CLASSES) {
      const c = cells.get(`${left}>${right}`);
      const m = median(c.ttks);
      row += pad(Number.isNaN(m) ? "—" : `${m.toFixed(1)} s`, 20);
    }
    lines.push(row);
  }

  // ---- against the field ----
  const field = new Map();
  for (const left of CLASSES) {
    let wins = 0, n = 0;
    for (const right of CLASSES) {
      if (right === left) continue;               // a mirror is 50% by construction
      const c = cells.get(`${left}>${right}`);
      wins += c.wins; n += c.n;
    }
    field.set(left, wilson(wins, n));
  }
  lines.push("");
  lines.push("AGAINST THE FIELD (mirror excluded)");
  for (const c of CLASSES) {
    const w = field.get(c);
    lines.push(`  ${pad(c, 12)} ${(w.p * 100).toFixed(1)}%  [${(w.lo * 100).toFixed(1)}-${(w.hi * 100).toFixed(1)}]`);
  }

  // ---- the failures ----
  const failures = [];
  // The ruler's own check goes first, because if it fails nothing below it means
  // anything: a biased harness reports a biased roster.
  const mirrors = [];
  for (const c of CLASSES) {
    const cell = cells.get(`${c}>${c}`);
    const w = wilson(cell.wins, cell.n);
    mirrors.push(`  ${pad(c, 12)} ${(w.p * 100).toFixed(1)}%  [${(w.lo * 100).toFixed(1)}-${(w.hi * 100).toFixed(1)}]`);
    if ((w.hi < 0.5 || w.lo > 0.5) && Math.abs(w.p - 0.5) > MIRROR_TOLERANCE) {
      failures.push(`THE RULER, not the roster — the ${c} mirror came back ${(w.p * 100).toFixed(1)}% [${(w.lo * 100).toFixed(1)}-${(w.hi * 100).toFixed(1)}], which excludes the 50% a mirror is by construction by more than ${MIRROR_TOLERANCE * 100} points. This harness has a side bias and every cell below it is suspect.`);
    }
  }
  lines.push("");
  lines.push("THE MIRROR DIAGONAL — this harness's own control, 50% by construction");
  lines.push(...mirrors);

  for (const left of CLASSES) {
    for (const right of CLASSES) {
      if (left === right) continue;
      const c = cells.get(`${left}>${right}`);
      const w = wilson(c.wins, c.n);
      if (w.hi < BAND.lo) failures.push(`${left} vs ${right}: ${(w.p * 100).toFixed(0)}% [${(w.lo * 100).toFixed(0)}-${(w.hi * 100).toFixed(0)}] — the whole interval is under ${BAND.lo * 100}%`);
      else if (w.lo > BAND.hi) failures.push(`${left} vs ${right}: ${(w.p * 100).toFixed(0)}% [${(w.lo * 100).toFixed(0)}-${(w.hi * 100).toFixed(0)}] — the whole interval is over ${BAND.hi * 100}%`);
    }
  }
  for (const c of CLASSES) {
    const w = field.get(c);
    if (w.hi < FIELD_BAND.lo) failures.push(`${c} against the field: ${(w.p * 100).toFixed(1)}% [${(w.lo * 100).toFixed(1)}-${(w.hi * 100).toFixed(1)}] — cannot win`);
    else if (w.lo > FIELD_BAND.hi) failures.push(`${c} against the field: ${(w.p * 100).toFixed(1)}% [${(w.lo * 100).toFixed(1)}-${(w.hi * 100).toFixed(1)}] — beats everybody`);
  }

  // FOUR SHAPES, NOT FOUR AVERAGES. Ruled on the sheet rather than on the
  // fighting, because it is the ASK and not a consequence of it — a roster can
  // be perfectly balanced and completely characterless, and that is the one
  // outcome the brief rules out by name.
  const shape = shapesAreDistinct();
  lines.push("");
  lines.push("TWO HIGH STATS EACH — the owner's ask, ruled on the sheet (ranked, best first)");
  lines.push(...shape.table);
  lines.push("");
  for (const c of CLASSES) lines.push(`  ${pad(c, 12)} ${shape.strengths[c].join(" + ") || "NOTHING"}`);
  failures.push(...shape.problems);

  lines.push("");
  lines.push("THE SHEET AS FOUGHT");
  for (const c of CLASSES) {
    const s = WARRIOR_STATS[c];
    lines.push(`  ${pad(c, 12)} hp ${pad(s.maxHealth, 5)} move ${pad(s.moveSpeed, 5)} light ${pad(s.attackDamage, 4)} heavy ${pad(s.heavyDamage, 4)} stroke ${pad(s.attackSpeed, 6)} block ${pad(s.blockReduction, 5)} roll ${pad(s.dodgeDistance, 5)} stam ${s.staminaMax}/${s.staminaRegen}`);
  }
  process.stdout.write(lines.join("\n") + "\n\n");

  const secs = ((Date.now() - started) / 1000).toFixed(0);
  const deferral = `WITH ${discarded} bout(s) discarded for third-man interference and ${stalemates} stalemate(s) at the ${BOUT_CAP}s cap counted as losses for nobody`;
  const limit = "and it measures the SHEET under the engine's own bot brain, not the ceiling a human reaches with it";
  if (failures.length) {
    process.stdout.write(`FAIL: the roster — ${failures.length} matchup(s) outside the band, ${deferral}, ${limit}\n`);
    for (const f of failures) process.stdout.write(`  ${f}\n`);
    process.stdout.write(`(${secs}s, seed ${MASTER})\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`PASS: the roster — every ordered matchup inside ${BAND.lo * 100}-${BAND.hi * 100}% and every class inside ${FIELD_BAND.lo * 100}-${FIELD_BAND.hi * 100}% against the field, ${deferral}, ${limit}\n`);
  process.stdout.write(`(${secs}s, seed ${MASTER})\n`);
}

main();
