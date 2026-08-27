#!/usr/bin/env node
/**
 * BOTTEST — IS THE DIFFICULTY LADDER A LADDER?
 *
 *   node tools/bottest.mjs                 240 bouts a rung, ~1 min
 *   node tools/bottest.mjs --bouts=60      quicker, wider intervals, NOT a verdict
 *   node tools/bottest.mjs --seed=99       reproduce an exact run
 *   node tools/bottest.mjs --profile       print the behaviour table and gate nothing
 *
 * WHY THIS EXISTS. `BACKLOG.md` 3.2 asks for "a difficulty ladder that is a
 * real ladder — measurably different, not just more health", and the word doing
 * the work is MEASURABLY. The engine has had three difficulties since the day
 * it had bots and nothing in this repository has ever asked whether they differ
 * — the whole ladder is one scalar, `aiSkill`, threaded through eleven
 * expressions, and "the numbers are different so the bots must be different" is
 * precisely the assumption `docs/PROCESS.md` records thirteen instances of.
 *
 * TWO QUESTIONS, AND THEY ARE NOT THE SAME QUESTION:
 *
 *   1. IS IT A LADDER? A jarl must beat a recruit, decisively, and a warrior
 *      must sit between them. That is §2, and it is a win rate over hundreds of
 *      seeded bouts with a Wilson interval on it, because a single bout is a
 *      coin toss and this repo has already shipped one gate that printed one
 *      realisation of a stochastic process as if it were a property.
 *
 *   2. IS IT A LADDER OF THE RIGHT KIND? "More health" would pass question 1
 *      and would be the wrong answer — `docs/FACTIONS.md` §3's rule that no
 *      side of this game carries a stat applies with the same force to a
 *      difficulty. So §1 asserts what difficulty is ALLOWED to touch: the
 *      brain, and nothing on the sheet. A recruit and a jarl of the same class
 *      must have identical health, damage, reach and speed, or the ladder is
 *      cheating and the player can feel it.
 *
 * AND §3 IS THE ONE THE OWNER WOULD NOTICE: a bot that "reads as a person
 * rather than a lawnmower". That is not a win rate — a perfectly mechanical bot
 * can hold any win rate you like. It is whether the thing in front of you
 * varies: whether it commits to a side, whether two of them at the same
 * difficulty fight differently from each other, whether it ever hesitates.
 * Those are counted, printed, and gated where a defensible bar exists.
 *
 * THE FIGHTERS ARE THE ENGINE'S OWN BOTS, both sides, in a real `blood_moot`
 * room over the real 20 Hz tick — the same discipline `classmatrix` states at
 * length and for the same reason. Nothing here writes a fighter.
 *
 * IF YOU CHANGE `botThink`, RE-RUN `tools/classmatrix.mjs`. Every number in
 * that matrix is measured under this brain.
 */
import { makeEngine, WARRIOR_STATS } from "../src/game/engine.mjs";
import { BYNAMES } from "../src/game/names.mjs";

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const BOUTS = Math.max(20, parseInt(argOf("bouts", "240"), 10) || 240);
const SEED = parseInt(argOf("seed", "20260813"), 10) || 20260813;
const PROFILE_ONLY = argv.includes("--profile");
const TICK = 1 / 20;
const BOUT_CAP = 75;
const SETTLE_CAP = 20;

const results = [];
const deferrals = [];
let section = "";
const head = (t) => { section = t; console.log(`\n${t}`); console.log("-".repeat(t.length)); };
const check = (name, pass, detail) => {
  results.push({ section, name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const note = (s) => console.log(`        ${s}`);

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

/** Wilson score interval — the same instrument classmatrix uses, same reason. */
function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n;
  const c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - m) / d, (c + m) / d];
}
const pct = (x) => `${(x * 100).toFixed(1)}%`;

/**
 * One duel: two bots of the SAME class at two difficulties, plus the human the
 * room needs to exist, who sprints for the palisade and stands there.
 *
 * The side swap is not decoration and classmatrix learnt it the hard way: the
 * room's Map is insertion-ordered, so whoever goes in first thinks first every
 * tick and throws the first blow of an even trade. Half the bouts in every cell
 * are inserted the other way round, so a think-order edge is split evenly
 * rather than paid entirely to one rung of the ladder.
 */
function duel(lowDiff, highDiff, warriorClass, seed, swap) {
  seedStream(seed);
  const engine = makeEngine({ autoTick: false });
  const seen = { kills: [], hits: [], playerId: null, latest: null };
  const sid = engine.connect((str) => {
    const m = JSON.parse(str);
    if (m.type === "join") seen.playerId = m.data.playerId;
    if ((m.type === "game_state" || m.type === "countdown" || m.type === "lobby_update"
      || m.type === "round_end") && m.data.players) seen.latest = m.data;
    if (m.type === "hit") seen.hits.push(m.data);
    if (m.type === "kill") seen.kills.push(m.data);
  });
  engine.message(sid, { type: "create", data: { name: "Steward", mode: "blood_moot", bestOf: 1 } });
  const order = swap ? [highDiff, lowDiff] : [lowDiff, highDiff];
  engine.message(sid, { type: "add_bot", data: { difficulty: order[0], warriorClass } });
  engine.message(sid, { type: "add_bot", data: { difficulty: order[1], warriorClass } });
  engine.message(sid, { type: "start", data: {} });

  let settled = 0;
  while (settled < SETTLE_CAP && seen.latest?.state !== "fighting") { engine.step(TICK); settled += TICK; }
  if (seen.latest?.state !== "fighting") { engine.stop(); releaseStream(); throw new Error("never reached `fighting`"); }

  const botIds = Object.keys(seen.latest.players).filter((id) => id.startsWith("bot_"));
  const lowId = swap ? botIds[1] : botIds[0];
  const highId = swap ? botIds[0] : botIds[1];
  const meId = seen.playerId;
  const killsAtBell = seen.kills.length;
  const hitsAtBell = seen.hits.length;

  let t = 0, winner = null;
  while (t < BOUT_CAP) {
    const me = seen.latest?.players?.[meId];
    if (me) {
      const r = Math.hypot(me.position.x, me.position.z) || 1;
      engine.message(sid, { type: "input", data: {
        moveX: me.position.x / r, moveZ: me.position.z / r,
        rotationY: Math.atan2(me.position.x / r, me.position.z / r), sprint: true,
        attack: false, heavyAttack: false, block: false, dodge: false,
        crouch: false, ability: false, shove: false, attackDir: "right",
      } });
    }
    engine.step(TICK);
    t += TICK;
    const fell = seen.kills.slice(killsAtBell).find((k) => k.victimId === lowId || k.victimId === highId);
    if (fell) { winner = fell.victimId === lowId ? "high" : "low"; break; }
  }

  // The third man is measured, not assumed away.
  const meddled = seen.hits.slice(hitsAtBell).some((h) => h.attackerId === meId || h.targetId === meId);
  const room = engine._rooms.get(seen.latest.code);
  const low = room?.players.get(lowId), high = room?.players.get(highId);
  const out = {
    winner, meddled, seconds: t,
    sheets: low && high ? {
      low: { maxHealth: low.maxHealth, maxStamina: low.maxStamina, maxBalance: low.maxBalance },
      high: { maxHealth: high.maxHealth, maxStamina: high.maxStamina, maxBalance: high.maxBalance },
    } : null,
  };
  engine.stop();
  releaseStream();
  return out;
}

/** A whole rung: BOUTS duels of one difficulty against another, all four classes. */
function rung(lowDiff, highDiff, seedBase) {
  let wins = 0, n = 0, discarded = 0, stalemates = 0, seconds = 0;
  const classes = Object.keys(WARRIOR_STATS);
  for (let i = 0; i < BOUTS; i++) {
    const cls = classes[i % classes.length];
    const r = duel(lowDiff, highDiff, cls, seedBase + i, i % 2 === 1);
    if (r.meddled) { discarded++; continue; }
    if (!r.winner) { stalemates++; continue; }
    n++; seconds += r.seconds;
    if (r.winner === "high") wins++;
  }
  const [lo, hi] = wilson(wins, n);
  return { wins, n, lo, hi, rate: n ? wins / n : 0, discarded, stalemates, meanSeconds: n ? seconds / n : 0 };
}

// ============================================================
// 1. WHAT A DIFFICULTY IS ALLOWED TO TOUCH
// ============================================================
head("1. A difficulty is a BRAIN, never a sheet");
{
  const eng = makeEngine({ autoTick: false });
  const sid = eng.connect(() => {});
  eng.message(sid, { type: "create", data: { name: "S", mode: "blood_moot", bestOf: 1 } });
  let code = null;
  eng._rooms.forEach((r, c) => { code = c; });
  const room = eng._rooms.get(code);
  for (const d of ["recruit", "warrior", "jarl"]) {
    eng.message(sid, { type: "add_bot", data: { difficulty: d, warriorClass: "warden" } });
  }
  const bots = [...room.players.values()].filter((p) => p.bot);
  check("three difficulties produce three bots", bots.length === 3, `${bots.length} bots`);

  // THE LOAD-BEARING ONE. If a jarl is harder because he has more health, the
  // ladder is a lie a player can feel, and it is the same defect
  // `docs/FACTIONS.md` §3 forbids on the faction side.
  const SHEET = ["maxHealth", "maxStamina", "maxBalance", "warriorClass"];
  const sameSheet = SHEET.every((f) => bots.every((b) => b[f] === bots[0][f]));
  check("a recruit and a jarl of one class carry the IDENTICAL sheet — no difficulty buys a stat",
    sameSheet, SHEET.map((f) => `${f}: ${bots.map((b) => b[f]).join("/")}`).join("  "));

  const skills = bots.map((b) => b.aiSkill);
  check("...and what DOES change is the brain, and it is monotone",
    skills[0] < skills[1] && skills[1] < skills[2], `aiSkill ${skills.join(" < ")}`);
  // MEMBERSHIP, not one realisation. This claim used to demand "the Young"
  // and "the Grim" literally — pool index 0 under one pinned stream — and
  // any upstream change in draw order failed it against names that were
  // doing exactly what the feature promises. That is this repo's own
  // recorded ruler failure ("a gate pinned ONE seed and printed one
  // realisation of a stochastic process as a property"). The property is
  // that each rung draws its byname from ITS OWN pool, and the pools are
  // disjoint — so the byname alone tells a player which brain he faces.
  check("...and the man is told which he is fighting, in his name",
    BYNAMES.recruit.some((s) => bots[0].name.endsWith(s))
    && BYNAMES.warrior.some((s) => bots[1].name.endsWith(s))
    && BYNAMES.jarl.some((s) => bots[2].name.endsWith(s)),
    bots.map((b) => b.name).join(", "));
  eng.stop();
}

// ============================================================
// 2. IS IT A LADDER?
// ============================================================
head("2. The ladder, as a win rate");
{
  const jarlOverRecruit = rung("recruit", "jarl", SEED);
  const warriorOverRecruit = rung("recruit", "warrior", SEED + 5000);
  const jarlOverWarrior = rung("warrior", "jarl", SEED + 10000);

  const show = (label, r) => note(
    `${label.padEnd(22)} ${pct(r.rate)}  [${pct(r.lo)}-${pct(r.hi)}]  over ${r.n} duels, ` +
    `${r.meanSeconds.toFixed(1)}s mean${r.stalemates ? `, ${r.stalemates} stalemate(s)` : ""}`);
  show("jarl over recruit", jarlOverRecruit);
  show("warrior over recruit", warriorOverRecruit);
  show("jarl over warrior", jarlOverWarrior);

  /**
   * A RUNG IS RULED THREE WAYS, NOT TWO, and the third one is the honest one.
   *
   * The bar is "the whole Wilson interval clears even" — not a point estimate
   * above 50, which is a coin toss with an opinion. But an interval that
   * STRADDLES even is not a failure either: it is a run that cannot place the
   * rung, and calling that FAIL teaches a team to widen the bar until it goes
   * green, which is the thing `docs/PROCESS.md` rule 2 forbids.
   *
   *   PASS      the interval sits above even. The rung exists.
   *   FAIL      the interval sits BELOW even. The rung runs BACKWARDS, which is
   *             a real defect and exactly what this file caught first time out.
   *   DEFERRAL  the interval straddles even. Not ruled, NAMED, and carried on
   *             the verdict line — `docs/PROCESS.md` R4. Declining to rule is
   *             often correct; hiding that you declined never is.
   */
  const rungCheck = (label, r) => {
    if (r.lo > 0.5) return check(`${label}, and the interval clears even`, true,
      `${pct(r.rate)} [${pct(r.lo)}-${pct(r.hi)}] over ${r.n}`);
    if (r.hi < 0.5) return check(`${label}, and the interval clears even`, false,
      `THE RUNG RUNS BACKWARDS: ${pct(r.rate)} [${pct(r.lo)}-${pct(r.hi)}] over ${r.n}`);
    deferrals.push(`${label}: ${pct(r.rate)} [${pct(r.lo)}-${pct(r.hi)}] over ${r.n} duels — straddles even, so this run cannot say the rung is there`);
    console.log(`  DEFER ${label} — ${pct(r.rate)} [${pct(r.lo)}-${pct(r.hi)}] straddles even; NOT RULED, and it rides the verdict line`);
    return undefined;
  };
  rungCheck("a JARL beats a RECRUIT", jarlOverRecruit);
  rungCheck("a WARRIOR beats a RECRUIT", warriorOverRecruit);
  rungCheck("a JARL beats a WARRIOR", jarlOverWarrior);
  // THE MIDDLE RUNG IS A RUNG. Without this a two-step ladder with a decorative
  // middle passes every check above.
  check("...and the ladder is ORDERED: the two-rung climb beats each one-rung climb",
    jarlOverRecruit.rate > warriorOverRecruit.rate && jarlOverRecruit.rate > jarlOverWarrior.rate,
    `${pct(jarlOverRecruit.rate)} vs ${pct(warriorOverRecruit.rate)} and ${pct(jarlOverWarrior.rate)}`);
}

// ============================================================
// 3. DOES IT READ AS A PERSON?
// ============================================================
head("3. A man, not a lawnmower");
{
  /**
   * Everything one bot did in one bout, counted off the wire and off the room.
   *
   * THE CLASS IS A PARAMETER NOW, AND THAT IS A REPAIR, NOT A TIDY-UP. This
   * watched two WARDENS and nothing else, and reported the result as "what a
   * recruit does" — one matchup's behaviour wearing the ladder's name. The
   * reaction-window pass made that fatal: a recruit's threshold is 0.364 s and a
   * warden's windup is 0.340 s, so a recruit CANNOT read a spear, and the guard
   * rate this section printed for him fell to exactly 0.0% of ticks. The
   * monotone check below went green on it — because a rate of zero is certainly
   * less than a warrior's — which is a gate passing on the ABSENCE of the case
   * it exists to see.
   *
   * Every difficulty is now watched against all four classes and the rates are
   * pooled, so "a recruit guards less" is a statement about the ladder rather
   * than about the one opponent this file happened to pick. The per-class
   * breakdown is printed underneath, because the 0.0% against a warden is a real
   * and deliberate fact about the bottom rung and it should be READ, not
   * averaged into invisibility.
   */
  function watch(difficulty, seed, warriorClass, seconds = 30) {
    seedStream(seed);
    const eng = makeEngine({ autoTick: false });
    const seen = { hits: [], latest: null, playerId: null };
    const sid = eng.connect((str) => {
      const m = JSON.parse(str);
      if (m.type === "join") seen.playerId = m.data.playerId;
      if ((m.type === "game_state" || m.type === "countdown") && m.data.players) seen.latest = m.data;
      if (m.type === "hit") seen.hits.push(m.data);
    });
    eng.message(sid, { type: "create", data: { name: "S", mode: "blood_moot", bestOf: 1 } });
    eng.message(sid, { type: "add_bot", data: { difficulty, warriorClass } });
    eng.message(sid, { type: "add_bot", data: { difficulty, warriorClass } });
    eng.message(sid, { type: "start", data: {} });
    let settled = 0;
    while (settled < SETTLE_CAP && seen.latest?.state !== "fighting") { eng.step(TICK); settled += TICK; }
    const code = seen.latest.code;
    const room = eng._rooms.get(code);
    const bots = [...room.players.values()].filter((p) => p.bot);
    const tally = bots.map(() => ({ dirs: {}, guards: 0, rolls: 0, heavies: 0, path: [] }));

    let t = 0;
    while (t < seconds && room.state === "fighting") {
      // Everyone stays alive: this measures BEHAVIOUR, and a dead bot behaves
      // like nothing at all. Topping them up is the only way to watch a full
      // thirty seconds of a recruit at a difficulty where he would be dead in
      // eight.
      bots.forEach((b) => { b.health = b.maxHealth; b.stamina = b.maxStamina; });
      eng.step(TICK); t += TICK;
      bots.forEach((b, i) => {
        if (b.attackPhase === "windup" && b.swingT < 0.15) {
          tally[i].dirs[b.attackDir] = (tally[i].dirs[b.attackDir] || 0) + 1;
          if (b.swingHeavy) tally[i].heavies++;
        }
        if (b.state === "blocking") tally[i].guards++;
        if (b.state === "rolling" || b.state === "dodging") tally[i].rolls++;
        if (tally[i].path.length < 4000) tally[i].path.push([b.position.x, b.position.z]);
      });
    }
    eng.stop();
    releaseStream();
    return tally;
  }

  const REPS = 2;
  const WATCHED = Object.keys(WARRIOR_STATS);
  const table = {};
  const perClass = {};
  for (const d of ["recruit", "warrior", "jarl"]) {
    const agg = { guards: 0, rolls: 0, heavies: 0, swings: 0, ticks: 0, dirSpread: [] };
    perClass[d] = {};
    for (const cls of WATCHED) {
      const one = { guards: 0, ticks: 0 };
      for (let i = 0; i < REPS; i++) {
        for (const bot of watch(d, SEED + 777 * i + 13 * WATCHED.indexOf(cls), cls)) {
          const swings = Object.values(bot.dirs).reduce((a, b) => a + b, 0);
          agg.guards += bot.guards; agg.rolls += bot.rolls; agg.heavies += bot.heavies;
          agg.swings += swings; agg.ticks += 600;
          one.guards += bot.guards; one.ticks += 600;
          if (swings > 4) {
            // How lopsided is his choice of side? 0 is a perfect coin over four
            // directions — a lawnmower. Higher is a man with a habit.
            const top = Math.max(...Object.values(bot.dirs));
            agg.dirSpread.push(top / swings);
          }
        }
      }
      perClass[d][cls] = one.ticks ? one.guards / one.ticks : 0;
    }
    table[d] = agg;
    note(`${d.padEnd(9)} guard ${(agg.guards / agg.ticks * 100).toFixed(1)}% of ticks, ` +
      `roll ${(agg.rolls / agg.ticks * 100).toFixed(1)}%, ` +
      `heavy ${agg.swings ? (agg.heavies / agg.swings * 100).toFixed(1) : "0.0"}% of swings, ` +
      `favourite side ${(agg.dirSpread.reduce((a, b) => a + b, 0) / (agg.dirSpread.length || 1) * 100).toFixed(0)}% of them`);
    note(`          ...guard by opponent: ` +
      WATCHED.map((c) => `${c} ${(perClass[d][c] * 100).toFixed(1)}%`).join("  "));
  }
  // WHOSE WINDUP EACH RUNG CAN ACTUALLY SEE, printed rather than left to be
  // inferred from a pooled average. A rung that reads NOBODY has no defence at
  // all and the pooled number would hide it behind the three rungs that do.
  for (const d of ["recruit", "warrior", "jarl"]) {
    const seen = WATCHED.filter((c) => perClass[d][c] > 0);
    note(`${d.padEnd(9)} raises steel against ${seen.length} of ${WATCHED.length} classes: ${seen.join(", ") || "NOBODY"}`);
  }

  // THE DEFENCE IS THE LADDER'S OTHER FACE, and it is the half a player feels
  // first: a recruit who never guards is a punching bag whatever his win rate
  // says. Gated as a monotone ordering rather than on a number, because the
  // number is a property of this roster and the ORDER is the property of the
  // ladder.
  const guardRate = (d) => table[d].guards / table[d].ticks;
  check("a better bot spends more of the fight with its guard up, at every rung",
    guardRate("recruit") < guardRate("warrior") && guardRate("warrior") < guardRate("jarl"),
    ["recruit", "warrior", "jarl"].map((d) => `${d} ${(guardRate(d) * 100).toFixed(1)}%`).join(" < "));

  // A RUNG THAT READS NOBODY IS NOT A DIFFICULTY — IT IS A DISABLED DEFENCE, AND
  // THE MONOTONE CHECK ABOVE CANNOT TELL THE DIFFERENCE. Zero is comfortably
  // less than a warrior's rate, so "recruit < warrior < jarl" is satisfied most
  // easily by a bottom rung that never raises a guard at all. That is not
  // hypothetical: watched against wardens alone, which is all this section used
  // to watch, the recruit's rate is exactly 0.0% — his 0.364 s reaction cannot
  // see a 0.340 s telegraph. So the floor is asserted separately from the order.
  //
  // WHAT HE ACTUALLY ANSWERS IS NARROWER THAN THE ARITHMETIC SAYS, and the
  // printed table is the authority. On paper a 0.364 s recruit clears the
  // huscarl's 0.408 s windup as well as the berserker's 0.532 s. Measured, his
  // huscarl column is 0.0% too, and the reason is the 20 Hz grid: `swingT` is
  // only ever sampled on tick boundaries, so the largest `windupSeen` a huscarl
  // light ever presents is 0.40 — leaving a window exactly ONE tick wide against
  // a think cadence of 0.144 s. A recruit therefore raises his shield against
  // the DANE AXE and nothing else, which is a better novice than the arithmetic
  // promised. Read the per-class line above; do not re-derive it from the
  // windups.
  const answers = (d) => WATCHED.filter((c) => perClass[d][c] > 0);
  check("...and every rung answers SOMEBODY's windup — a rung that guards against nobody is a punching bag, not a difficulty",
    ["recruit", "warrior", "jarl"].every((d) => answers(d).length > 0),
    ["recruit", "warrior", "jarl"].map((d) => `${d} ${answers(d).length}/${WATCHED.length}`).join("  "));

  // A FAVOURITE SIDE. A bot that draws its stroke uniformly is unreadable and
  // therefore unbeatable-by-reading, which is the opposite of what this game
  // wants: the whole parry mechanic is a conversation, and you cannot converse
  // with a coin. 25% is the coin; a man has a habit and it is worth learning.
  const habit = (d) => table[d].dirSpread.reduce((a, b) => a + b, 0) / (table[d].dirSpread.length || 1);
  check("a bot has a FAVOURITE SIDE a player could learn — it is not a coin over four directions",
    habit("warrior") > 0.34,
    `warrior throws his commonest stroke ${(habit("warrior") * 100).toFixed(0)}% of the time; a coin is 25%`);
}

// ============================================================
const failed = results.filter((r) => !r.pass);
console.log("\n" + "=".repeat(78));
if (PROFILE_ONLY) {
  console.log(`PROFILE ONLY — nothing gated, ${results.length} observations printed`);
} else {
  console.log(`${failed.length === 0 ? "PASS" : "FAIL"}: the bots — ${results.length - failed.length}/${results.length}` +
    `, ${BOUTS} bouts a rung, seed ${SEED}` +
    (deferrals.length ? `, WITH ${deferrals.length} RUNG(S) THIS RUN COULD NOT PLACE — a deferral and not a clean ladder` : ""));
  for (const d of deferrals) console.log(`      DEFERRED: ${d}`);
  console.log(`      it measures the LADDER and the HABITS, not the ceiling a human reaches;`);
  console.log(`      every number in tools/classmatrix.mjs is measured under this same brain.`);
}
console.log("=".repeat(78));
if (failed.length) {
  console.log("\nfailed:");
  for (const f of failed) console.log(`  ${f.section} :: ${f.name}`);
}
process.exit(PROFILE_ONLY ? 0 : (failed.length ? 1 : 0));
