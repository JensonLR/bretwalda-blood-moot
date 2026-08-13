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
 *   node tools/classmatrix.mjs                 1000 bouts per ordered pair, ~4.5 min
 *   node tools/classmatrix.mjs --bouts=60      quicker, wider intervals, NOT a verdict
 *   node tools/classmatrix.mjs --only=huscarl,warden   one pair and its mirrors
 *   node tools/classmatrix.mjs --seed=12345    reproduce an exact run
 *   node tools/classmatrix.mjs --entropy       master seed from the clock
 *   node tools/classmatrix.mjs --difficulty=jarl
 */

import { readFileSync } from "node:fs";
import { makeEngine, WARRIOR_STATS, WEAPON_REACH, SWING_ARC } from "../src/game/engine.mjs";
import { AXES, AXIS_LABEL, cardBars, strengthsOf, valuesOn } from "../src/game/statshape.mjs";

/**
 * Every table a matchup can be decided by, in one place, so the lever can pull
 * any of them. `WARRIOR_STATS` is what a player sees on a card; reach and arc
 * are not on any card and are, on the evidence below, the larger half of the
 * balance. A harness that could only pull the visible table would have spent
 * the afternoon moving health around a fight that reach was deciding.
 */
const TABLES = { stats: WARRIOR_STATS, reach: WEAPON_REACH, arc: SWING_ARC };

const ROSTER = ["huscarl", "warden", "runekeeper", "berserker"];

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit === undefined ? dflt : hit.slice(name.length + 3);
};

/**
 * `--only=warden,huscarl` — measure a SUB-MATRIX instead of all sixteen cells.
 *
 * This exists because of what the full matrix cost to settle. `huscarl vs
 * warden` sits so close to the 70% bar that a 250-bout run rejected it about one
 * time in five, and finding that out took 16,000 duels and four and a half
 * minutes. Probing ONE pair is a 2x2 — the two ordered cells and both mirrors,
 * so the harness's own control comes with it — which is a quarter of the work,
 * and that is the difference between "widen n until the answer is decisive" being
 * a sentence and being something you can actually do before lunch.
 *
 * A subset run is NOT a roster verdict and says so in as many words: the field
 * band and the shape check are printed and NOT ruled on, because a class's rate
 * "against the field" measured against half a field is a different number that
 * looks like the same one.
 */
const ONLY = (argOf("only", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
for (const c of ONLY) {
  if (!ROSTER.includes(c)) { process.stderr.write(`classmatrix: no such class "${c}"\n`); process.exit(2); }
}
const CLASSES = ONLY.length ? ROSTER.filter((c) => ONLY.includes(c)) : ROSTER;
const SUBSET = CLASSES.length !== ROSTER.length;

/**
 * A THOUSAND, NOT TWO HUNDRED, AND THE NUMBER IS THE GATE.
 *
 * The old default was 200 and the shipped claim was measured at 250. At that n a
 * cell's 95% interval is about twelve points wide, which is wider than the
 * distance from this roster's sharpest matchup to the bar it is being judged
 * against — so the verdict was a draw from a distribution rather than a reading
 * of the roster, and an adversary duly found two master seeds out of ten that
 * flipped it. Ten times the bouts is a quarter of the interval; the run costs
 * about four and a half minutes and it is the cheapest thing in this repository
 * that can tell a roster from a coin.
 */
const BOUTS = Math.max(10, Number(argOf("bouts", 1000)));
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

  // HOW MUCH OF THIS FIGHT WAS EVER DECIDED BY A GUARD. Off the wire, not
  // assumed: a `blocked`/`blocked_heavy` hit is one that met a raised shield and
  // therefore one where `blockReduction` did any work at all. See the note on
  // GUARD_SHARE below for why this number is on the verdict line.
  let dmgAll = 0, dmgGuarded = 0;
  for (const h of seen.hits.slice(hitsAtBell)) {
    if (!["light", "heavy", "blocked", "blocked_heavy"].includes(h.type)) continue;
    dmgAll += h.damage;
    if (h.type === "blocked" || h.type === "blocked_heavy") dmgGuarded += h.damage;
  }

  engine.message(sid, { type: "leave" });
  engine.stop();
  releaseStream();
  return { winner, ttk, thirdMan, stalemate: winner === null, health, dmgAll, dmgGuarded };
}

// ---------------------------------------------------------------------------
// THE MATRIX.
// ---------------------------------------------------------------------------
/**
 * THE AXIS THIS INSTRUMENT CANNOT SEE, MEASURED RATHER THAN GUESSED AT.
 *
 * `blockReduction` is one of the four card axes and it is one of the huscarl's
 * two certified strengths — and pulling it from 0.80 to 0.00, from the best
 * shield in the game to no shield at all, moved `huscarl vs warden` from 69% to
 * 69%. R1 says that when the lever does not move the number you are not editing
 * the thing you think you are editing, so this was chased down: across 40 bot
 * duels, 8 of 769 blows met a raised guard and 0.5% of all damage was reduced by
 * one. The bots raise a shield when a windup becomes readable, which puts almost
 * every one of those blows inside the PARRY window instead — 44 parries against
 * 8 blocks — so DEFENCE is very nearly unmeasured by this harness.
 *
 * That is a real hole in the ruler and it rides the verdict line rather than
 * sitting in a comment, because it is the reason the two band-edge cells cannot
 * simply be tuned off the line: the stat a human would break that tie with is
 * the one this instrument is blind to. Accumulated over the whole matrix so the
 * number is this run's, not a remembered one.
 */
function runMatrix() {
  const cells = new Map();   // "left>right" -> { wins, n, ttks }
  let discarded = 0, stalemates = 0, bout = 0;
  let dmgAll = 0, dmgGuarded = 0;

  for (const left of CLASSES) {
    for (const right of CLASSES) {
      const cell = { wins: 0, n: 0, ttks: [] };
      for (let i = 0; i < BOUTS; i++) {
        const r = runBout(left, right, MASTER + (bout++) * 7919, i % 2 === 1);
        dmgAll += r.dmgAll; dmgGuarded += r.dmgGuarded;
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
  return { cells, discarded, stalemates, dmgAll, dmgGuarded };
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
//   losing side of.
//
//   IT IS RULED THREE WAYS, NOT TWO, AND THAT IS THE REPAIR THIS ROUND.
//
//   The old rule failed a cell only when its WHOLE 95% interval was outside the
//   band, and passed it otherwise. Read carefully, that is not a test of "the
//   matchup is inside the band" at all — it is a test of "the run does not PROVE
//   the matchup is outside the band", and those are opposite burdens of proof.
//   A cell whose true rate is 30.4% clears it about four times in five at 250
//   bouts, so the verdict line was reporting a coin toss as a property. An
//   adversary demonstrated exactly that: ten master seeds at 250 bouts, eight
//   green and two red, with `warden vs huscarl` red on both of the two. This
//   pass reproduced it and quotes what its OWN run printed rather than what it
//   was told: at 250 bouts the ordered cell reads 24% [19-30] on seed 424242 and
//   24% [19-30] on seed 90210. Then 2,000 duels a matchup, pooled over both
//   orderings, on three master seeds, to find what the cell actually is —
//   `huscarl vs warden` 69.1 / 69.8 / 68.4, i.e. the warden's side of it is
//   30.9 / 30.2 / 31.6. It is ON THE LINE, and no amount of n resolves a value
//   that sits on the bar, which is why "just widen n" could not have finished
//   this on its own.
//
//   So each cell gets one of three rulings, and the difference between them is
//   what the interval and the band actually say to each other:
//
//     INSIDE  — the whole interval is within the band. The claim on the verdict
//               line is TRUE of this cell and was measured, not survived.
//     EDGE    — the interval straddles a band edge. The harness cannot tell, and
//               it says so: an EDGE cell is a DEFERRAL and rides the verdict
//               line (rule R4). It is not counted as a pass in the sentence
//               "every ordered matchup inside 30-70%", because it is not one.
//     OUTSIDE — the whole interval is outside. FAIL, as before.
//
//   The verdict line then reports the count of each, so a roster that has drifted
//   to the bar shows up as cells moving from INSIDE to EDGE long before anything
//   goes red — which is the early warning the two-way rule could never give.
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
  // ROSTER, not CLASSES: `--only` narrows what is FOUGHT, never what has to
  // agree. A subset run that skipped two rows would let the sheets drift on
  // exactly the classes it was not looking at.
  for (const cls of ROSTER) {
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
// The axes themselves are NOT defined here any more. They live in
// `src/game/statshape.mjs`, which the class card imports too, precisely so that
// the shape this gate certifies and the shape the player is shown cannot be two
// different shapes — see `cardIsLegible` below, which is the gate on that.
function shapesAreDistinct() {
  const problems = [];
  const strengths = strengthsOf(WARRIOR_STATS, "sheet");
  const table = [];
  for (const axis of AXES) {
    const v = valuesOn(WARRIOR_STATS, axis, "sheet");
    const sorted = [...ROSTER].sort((a, b) => v[b] - v[a]);
    const spread = v[sorted[0]] - v[sorted[3]];
    const gap = v[sorted[1]] - v[sorted[2]];
    if (spread <= 0 || gap < spread * 0.04) {
      problems.push(`${axis} has CONVERGED — 2nd (${sorted[1]}) and 3rd (${sorted[2]}) are ${gap.toFixed(3)} apart across a spread of ${spread.toFixed(3)}, so "high on this stat" does not mean anything`);
    }
    table.push(`  ${axis.padEnd(9)} ${sorted.map((c) => `${c} ${v[c].toFixed(2)}`).join("   ")}`);
  }
  for (const c of ROSTER) {
    if (strengths[c].length !== 2) {
      problems.push(`${c} is high on ${strengths[c].length} stat(s) (${strengths[c].join("+") || "none"}) — the ask is exactly two`);
    }
  }
  const pairs = new Map();
  for (const c of ROSTER) {
    const key = [...strengths[c]].sort().join("+");
    if (pairs.has(key)) problems.push(`${c} and ${pairs.get(key)} are the same shape — both are ${key}`);
    else pairs.set(key, c);
  }
  return { problems, strengths, table };
}

/**
 * THE CARD MUST SHOW THE SHAPE THE SHEET WAS GATED ON.
 *
 * The other half of this round's refutation, and it is the half nobody had
 * looked at. `shapesAreDistinct` above certifies that each warrior is high on
 * exactly two of four axes — and the ONLY place a player ever meets that claim
 * is the class-select card in `src/app/page.tsx`. That card drew its four bars
 * against maxima typed in beside the roster (`HP max={150}`,
 * `SPD value={moveSpeed * 20} max={100}`) and clamped the overflow with
 * `Math.min(100, ...)`. After the rework the huscarl's 158 health clamped at
 * 150, and BOTH the runekeeper's 5.6 stride and the warden's 5.0 clamped at
 * 100 — so the two of them drew IDENTICAL FULL SPEED BARS while the runekeeper
 * is 12% faster and speed is his headline stat. Every gate in this file was
 * green through all of it, because not one of them had ever looked at the
 * screen the claim is made on.
 *
 * Three things are checked, and each is a thing that can be false:
 *
 *  1. NO CEILING IS WRITTEN DOWN. `page.tsx` may not carry a numeric `max=` on
 *     a stat bar and may not clamp one. A typed-in maximum is a mirrored
 *     definition — this repository's third named failure mode, five recorded
 *     instances — and the clamp is what let the stale one go unnoticed.
 *  2. NOBODY IS DRAWN FULL WHO IS NOT THE LEADER, and no two classes that
 *     differ on an axis are drawn the same length. This is the defect itself,
 *     measured rather than argued: it fails on the old card and passes on this
 *     one.
 *  3. THE CARD AND THE SHEET NAME THE SAME TWO STRENGTHS for every class. The
 *     card reads damage as a rate and the sheet as the better of a rate and a
 *     blow — deliberately two readings of one axis, documented in
 *     `statshape.mjs` — so what is gated is that they AGREE ABOUT THE ROSTER.
 *     A card that flattered a warrior the sheet calls weak, or hid a strength
 *     the sheet certifies, goes red here.
 *
 * SHOWN FAILING FIRST, AND EACH HALF AGAINST THE MUTATION IT ACTUALLY GUARDS —
 * because "it went red on the old build" is not the same claim for both halves
 * and saying so loosely would hide which file each one is watching:
 *
 *   * the SOURCE half (1) was run against `page.tsx` as it stood before this
 *     round and reported SIX findings — the four typed maxima, the
 *     `Math.min(100, ...)` clamp, and the missing `statshape.mjs` import;
 *   * the DRAWN half (2) cannot be moved by `page.tsx` at all, and that is
 *     worth being exact about: it is computed from `cardBars`, so what it
 *     guards is `statshape.mjs`. Levered — putting the old ceilings back INSIDE
 *     `cardBars` (`HEALTH 150`, `SPEED 5.0`) — it fires with "huscarl's HP bar
 *     is 105% of its track" and "runekeeper's SPD bar is 112%". Add the old
 *     clamp on top of those ceilings, which is exactly the build that shipped,
 *     and it prints the refutation itself: *"warden and runekeeper draw the SAME
 *     SPD bar (100%) on different numbers (5 vs 5.6)"*.
 *
 * A gate whose two halves watch two files, only one of which has ever been
 * shown red, is half a gate. Both halves have been seen red on this roster.
 */
const CARD_SRC_PATH = new URL("../src/app/page.tsx", import.meta.url);
function cardIsLegible() {
  const problems = [];
  const src = readFileSync(CARD_SRC_PATH, "utf8");

  const hardMax = [...src.matchAll(/<StatBar[^/]*?\bmax=\{\s*[\d.]+\s*\}/g)].map((m) => m[0].trim());
  for (const h of hardMax) problems.push(`page.tsx still types a maximum into a stat bar: \`${h}\` — derive it from the roster`);
  // Scoped to `StatBar`'s own body, and deliberately: the XP bar a few hundred
  // lines up clamps too and SHOULD — experience really can run past the next
  // level's threshold, so there the clamp is the truth rather than a cover for
  // one. A check that failed the whole file on the string would have been a
  // check somebody deleted the first time it cried wolf.
  const bodyOf = /function StatBar\([\s\S]*?\n\}/.exec(src);
  if (!bodyOf) problems.push("page.tsx has no StatBar function any more — this gate is reading a screen that has moved");
  else if (/Math\.min\(\s*100\s*,/.test(bodyOf[0])) {
    problems.push("StatBar still clamps with Math.min(100, ...) — a bar that cannot overflow needs no clamp, and the clamp is how the stale ceiling stayed invisible for a release");
  }
  if (!/cardBars\(/.test(src) || !/statshape\.mjs/.test(src)) {
    problems.push("page.tsx does not build its bars from statshape.mjs — the card and this gate are reading two different rosters again");
  }

  // What the card actually draws, computed by the card's own function.
  const bars = Object.fromEntries(ROSTER.map((c) => [c, cardBars(WARRIOR_STATS, c)]));
  const drawn = [];
  for (const axis of AXES) {
    const row = ROSTER.map((c) => ({ c, b: bars[c].find((x) => x.axis === axis) }));
    drawn.push(`  ${AXIS_LABEL[axis].padEnd(4)} ${row.map(({ c, b }) => `${c} ${(b.frac * 100).toFixed(0)}%`).join("   ")}`);
    for (const { c, b } of row) {
      if (b.frac > 1 + 1e-9) problems.push(`${c}'s ${AXIS_LABEL[axis]} bar is ${(b.frac * 100).toFixed(0)}% of its track — it would clamp, and a clamped bar is a lie about the roster`);
    }
    for (let i = 0; i < row.length; i++) {
      for (let j = i + 1; j < row.length; j++) {
        const a = row[i], b = row[j];
        const same = Math.abs(a.b.frac - b.b.frac) < 1e-6;
        const differ = Math.abs(a.b.value - b.b.value) > 1e-9;
        if (same && differ) {
          problems.push(`${a.c} and ${b.c} draw the SAME ${AXIS_LABEL[axis]} bar (${(a.b.frac * 100).toFixed(0)}%) on different numbers (${a.b.value} vs ${b.b.value}) — the screen cannot tell them apart`);
        }
      }
    }
  }

  const onCard = strengthsOf(WARRIOR_STATS, "card");
  const onSheet = strengthsOf(WARRIOR_STATS, "sheet");
  for (const c of ROSTER) {
    const a = [...onCard[c]].sort().join("+"), b = [...onSheet[c]].sort().join("+");
    if (a !== b) problems.push(`${c} is ${b} on the sheet this gate rules on and ${a || "NOTHING"} on the card a player reads`);
  }
  return { problems, drawn };
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
  process.stderr.write(`classmatrix: ${BOUTS} bouts x ${CLASSES.length * CLASSES.length} ordered matchups, ${DIFFICULTY} bots, master seed ${MASTER}${ENTROPY ? " (from the clock)" : ""}\n`);
  if (LEVERS.length) process.stderr.write(`classmatrix: LEVER RUN, not a baseline — ${LEVERS.join(", ")}\n`);
  if (SUBSET) process.stderr.write(`classmatrix: SUBSET RUN — ${CLASSES.join(" and ")} only, so the field band and the shape are printed and NOT ruled on\n`);
  const { cells, discarded, stalemates, dmgAll, dmgGuarded } = runMatrix();

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
  // THE SPREAD, WITH ITS OWN UNCERTAINTY ON IT. This is the number the class
  // rework is quoted on in `engine.mjs` and `docs/BACKLOG.md`, and it was quoted
  // as a bare point estimate off a 250-bout run — which is the friendliest
  // reading of a quantity that is a difference of two noisy things. An adversary
  // reading the identical roster at the same n got 13.1 and 13.9 where the doc
  // said 9.6. Neither number was wrong; the SHIPPED ONE WAS A DRAW, and a doc
  // that commits a draw to the repository as a fact is worse than no doc. The
  // range printed here is the honest one: best case the two intervals barely
  // clear each other, worst case they are as far apart as they could be.
  {
    const rates = CLASSES.map((c) => field.get(c));
    const top = rates.reduce((a, b) => (b.p > a.p ? b : a));
    const bot = rates.reduce((a, b) => (b.p < a.p ? b : a));
    lines.push(`  ${pad("SPREAD", 12)} ${((top.p - bot.p) * 100).toFixed(1)} points`
      + `  [${(Math.max(0, top.lo - bot.hi) * 100).toFixed(1)}-${((top.hi - bot.lo) * 100).toFixed(1)}]`
      + `  — quote the interval, never the point`);
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
    // TOLERANCE ALONE, NOT ANDed WITH THE INTERVAL — and this is a tightening.
    //
    // A mirror is 50% BY CONSTRUCTION: the same sheet on both sides. Any
    // deviation is noise or it is side bias, and the question "is this harness
    // biased" does not become a different question at a different sample size.
    // ANDing the tolerance with "the 95% interval excludes 50%" made the VERDICT
    // depend on n — at moderate n the interval governs and straddles, so the
    // check fired on some seeds and not others. An adversary measured that:
    // three master seeds were quoted as returning an identical verdict while a
    // fourth had roughly a one-in-three chance of going red, on a per-mirror
    // rate of 4.97% at n=250.
    //
    // That is the same fault this file's own header warns about — a realisation
    // reported as a property — sitting inside the control that is supposed to
    // catch it. Tolerance alone fires MORE often, not less; n now buys precision
    // rather than deciding the answer.
    if (Math.abs(w.p - 0.5) > MIRROR_TOLERANCE) {
      failures.push(`THE RULER, not the roster — the ${c} mirror came back ${(w.p * 100).toFixed(1)}% [${(w.lo * 100).toFixed(1)}-${(w.hi * 100).toFixed(1)}], which excludes the 50% a mirror is by construction by more than ${MIRROR_TOLERANCE * 100} points. This harness has a side bias and every cell below it is suspect.`);
    }
  }
  lines.push("");
  lines.push("THE MIRROR DIAGONAL — this harness's own control, 50% by construction");
  lines.push(...mirrors);

  // THE BAND IS RULED ON THE MATCHUP, NOT ON THE ORDERED CELL — and that is the
  // second half of this round's repair.
  //
  // `huscarl > runekeeper` and `runekeeper > huscarl` are not two facts. They are
  // ONE matchup measured twice, and each cell already balances the room's
  // insertion order internally (see `swapSides`), so the two are simply 2n
  // independent bouts of the same thing. Ruling on each half separately threw
  // away half the sample and then judged each half against a hard bar — which is
  // how a matchup whose true rate is 29.8% produced a PASS on one master seed, a
  // deferral on another and a FAIL on a third. Pooled, the same three seeds all
  // say the same thing, and they say it at half the interval width for no extra
  // duels at all.
  //
  // The two halves ARE still compared, below, as a control on the ruler: if the
  // same matchup reads very differently depending on which man was inserted
  // first, that is a bias in this harness and it must be seen, not averaged away.
  const edges = [];
  let inside = 0;
  const pairs = [];
  for (let i = 0; i < CLASSES.length; i++) {
    for (let j = i + 1; j < CLASSES.length; j++) {
      const a = CLASSES[i], b = CLASSES[j];
      const ab = cells.get(`${a}>${b}`), ba = cells.get(`${b}>${a}`);
      // `a`'s wins over `b`, pooled: the ones it won as the left-hand class plus
      // the ones the right-hand class failed to win.
      const wins = ab.wins + (ba.n - ba.wins);
      const n = ab.n + ba.n;
      const w = wilson(wins, n);
      const forward = wilson(ab.wins, ab.n), reverse = wilson(ba.n - ba.wins, ba.n);
      pairs.push({ a, b, w, n, forward, reverse });
      const say = `${a} vs ${b}: ${(w.p * 100).toFixed(1)}% [${(w.lo * 100).toFixed(1)}-${(w.hi * 100).toFixed(1)}] over ${n} duels`;
      if (w.hi < BAND.lo || w.lo > BAND.hi) {
        failures.push(`${say} — the WHOLE interval is outside ${BAND.lo * 100}-${BAND.hi * 100}%`);
      } else if (w.lo < BAND.lo || w.hi > BAND.hi) {
        edges.push(`${say} — straddles the ${w.lo < BAND.lo ? BAND.lo * 100 : BAND.hi * 100}% bar, so this run cannot say which side of it the matchup is on`);
      } else inside++;
      // The ruler's control: the same matchup read from either side. Ruled on
      // the INTERVALS and not on the points, for the reason the mirror check
      // learned the hard way — two halves of a short run differ by ten points
      // all the time and that is sampling, not bias. It fires only when the two
      // readings cannot both be true AND the gap is big enough to move a cell
      // across a forty-point band.
      const disjoint = forward.lo > reverse.hi || reverse.lo > forward.hi;
      if (disjoint && Math.abs(forward.p - reverse.p) > 0.10) {
        failures.push(`THE RULER, not the roster — ${a} vs ${b} reads ${(forward.p * 100).toFixed(1)}% with ${a} inserted first and ${(reverse.p * 100).toFixed(1)}% with ${b} first. One matchup cannot have two answers; this harness has an order bias.`);
      }
    }
  }
  lines.push("");
  lines.push(`THE SIX MATCHUPS, POOLED — both orderings are one matchup, so both count (${2 * BOUTS} duels each)`);
  for (const p of pairs) {
    lines.push(`  ${pad(`${p.a} v ${p.b}`, 26)} ${(p.w.p * 100).toFixed(1)}%  [${(p.w.lo * 100).toFixed(1)}-${(p.w.hi * 100).toFixed(1)}]`
      + `   (read from either side: ${(p.forward.p * 100).toFixed(1)} / ${(p.reverse.p * 100).toFixed(1)})`);
  }
  // The field band is a claim about the WHOLE roster, so a subset run has
  // nothing to say about it: three quarters of a field is not a field.
  if (!SUBSET) {
    for (const c of CLASSES) {
      const w = field.get(c);
      if (w.hi < FIELD_BAND.lo) failures.push(`${c} against the field: ${(w.p * 100).toFixed(1)}% [${(w.lo * 100).toFixed(1)}-${(w.hi * 100).toFixed(1)}] — cannot win`);
      else if (w.lo > FIELD_BAND.hi) failures.push(`${c} against the field: ${(w.p * 100).toFixed(1)}% [${(w.lo * 100).toFixed(1)}-${(w.hi * 100).toFixed(1)}] — beats everybody`);
    }
  }

  // FOUR SHAPES, NOT FOUR AVERAGES. Ruled on the sheet rather than on the
  // fighting, because it is the ASK and not a consequence of it — a roster can
  // be perfectly balanced and completely characterless, and that is the one
  // outcome the brief rules out by name.
  const shape = shapesAreDistinct();
  const card = cardIsLegible();
  lines.push("");
  lines.push("TWO HIGH STATS EACH — the owner's ask, ruled on the sheet (ranked, best first)");
  lines.push(...shape.table);
  lines.push("");
  for (const c of ROSTER) lines.push(`  ${pad(c, 12)} ${shape.strengths[c].join(" + ") || "NOTHING"}`);
  lines.push("");
  lines.push("...AND AS THE CLASS CARD DRAWS IT — bar fill, against maxima taken off the roster");
  lines.push(...card.drawn);
  // The shape and the card are only ruled on when the whole roster is in the
  // room. On a subset run they are printed as context.
  if (!SUBSET) { failures.push(...shape.problems); failures.push(...card.problems); }

  lines.push("");
  lines.push("THE SHEET AS FOUGHT");
  for (const c of CLASSES) {
    const s = WARRIOR_STATS[c];
    lines.push(`  ${pad(c, 12)} hp ${pad(s.maxHealth, 5)} move ${pad(s.moveSpeed, 5)} light ${pad(s.attackDamage, 4)} heavy ${pad(s.heavyDamage, 4)} stroke ${pad(s.attackSpeed, 6)} block ${pad(s.blockReduction, 5)} roll ${pad(s.dodgeDistance, 5)} stam ${s.staminaMax}/${s.staminaRegen}`);
  }
  process.stdout.write(lines.join("\n") + "\n\n");

  const secs = ((Date.now() - started) / 1000).toFixed(0);
  const guardShare = dmgAll > 0 ? dmgGuarded / dmgAll : 0;
  const deferral = `WITH ${discarded} bout(s) discarded for third-man interference and ${stalemates} stalemate(s) at the ${BOUT_CAP}s cap counted as losses for nobody`;
  const limit = "and it measures the SHEET under the engine's own bot brain, not the ceiling a human reaches with it";
  // The blind axis, measured this run. See the note on runMatrix.
  const guardNote = `, and WITH only ${(guardShare * 100).toFixed(1)}% of the damage in these duels meeting a raised guard — so DEFENCE is very nearly unmeasured here, which is a hole in the ruler and not a fact about the roster`;
  // R4: every deferral rides the verdict line, in the same sentence, in the
  // words a person will read. An EDGE cell is a deferral — the harness declined
  // to rule — and the previous version of this file counted it as a pass and
  // wrote "every ordered matchup inside 30-70%" over the top of it.
  const edgeNote = edges.length
    ? `, WITH ${edges.length} matchup(s) SITTING ON THE BAND EDGE which this run cannot place and which are listed below — that is a deferral and not a clean sheet`
    : "";
  const scope = SUBSET ? `the ${CLASSES.join("/")} sub-matrix — NOT a roster verdict` : "the roster";
  if (failures.length) {
    process.stdout.write(`FAIL: ${scope} — ${failures.length} finding(s), ${inside} matchup(s) decisively inside the band${edgeNote}, ${deferral}${guardNote}, ${limit}\n`);
    for (const f of failures) process.stdout.write(`  ${f}\n`);
    for (const e of edges) process.stdout.write(`  EDGE: ${e}\n`);
    process.stdout.write(`(${secs}s, seed ${MASTER}, ${BOUTS} bouts a cell)\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`PASS: ${scope} — ${inside} of ${CLASSES.length * (CLASSES.length - 1) / 2} matchups measured DECISIVELY inside ${BAND.lo * 100}-${BAND.hi * 100}% (whole interval, not just the point)`
    + `${SUBSET ? "" : ` and every class inside ${FIELD_BAND.lo * 100}-${FIELD_BAND.hi * 100}% against the field`}${edgeNote}, ${deferral}${guardNote}, ${limit}\n`);
  for (const e of edges) process.stdout.write(`  EDGE: ${e}\n`);
  process.stdout.write(`(${secs}s, seed ${MASTER}, ${BOUTS} bouts a cell)\n`);
}

main();
