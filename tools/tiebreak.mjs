#!/usr/bin/env node
/**
 * tiebreak — THE OWNER'S REPORT, TURNED INTO A CHECK (PROCESS.md R6).
 *
 * He wrote, of the end-of-game results table:
 *
 *   "In the end of game results rounds won should be recorded somehow for all
 *    to see in the table, that should also take into account for ranking &
 *    payout, I've seen same kills & rounds won more be snubbed on coins &
 *    ranking placement from 1st to 2nd due to alphabetical order names"
 *
 * That is one fixture: two men level on kills, one of them a round ahead, and
 * the one a round ahead sorting LATER by name. Five lines, and it is the whole
 * defect.
 *
 * WHY THIS HARNESS AND NOT A PLAYED MATCH. `summaryflow` fights real matches
 * and photographs them, and it cannot reach this: a played match does not
 * arrange for two men to finish level on kills a round apart, and a harness
 * that can only see the case when the dice hand it to it is not a gate. So
 * this drives `buildLedger` — the pure function `endMatch` now builds its
 * `match_end` results from — and states the cases directly.
 *
 * WHAT IT IS ALLOWED TO ASSERT. Only what the wire actually carries: the order
 * of `results`, and each row's `place`, `roundsWon` and pay. It deliberately
 * does NOT re-implement the ranking rule to compare against — that is the
 * mirrored-definition disease this repo has recorded four times. It asserts
 * PROPERTIES (rounds beat kills; a tie is equal; nothing reads a name).
 */
import { buildLedger, decideMatch } from "../src/game/engine.mjs";

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** A man, with everything the ledger reads off him and nothing else. */
const man = (id, name, kills, extra = {}) => ({
  id, name, kills, deaths: 2, damage: 400, score: kills * 100, team: "none", ...extra,
});
const row = (led, id) => led.results.find((r) => r.id === id);
const order = (led) => led.results.map((r) => r.id).join(" > ");
const pay = (r) => (r ? `place=${r.place} rounds=${r.roundsWon} gold=${r.goldEarned} xp=${r.xpEarned}` : "MISSING");

console.log("\n-- the owner's case: same kills, one man a round ahead, and his name sorts last --");
{
  // Aelfric first in the room and first in the alphabet; Wulfric won the extra
  // round. Nothing about this fixture is exotic — it is a best-of-3 that went
  // 2-1 with both men trading kills evenly, which is the ordinary shape.
  const roundWins = { aelfric: 1, wulfric: 2 };
  const led = buildLedger({
    roundWins,
    players: [man("aelfric", "Aelfric", 3), man("wulfric", "Wulfric", 3)],
    teamMode: false,
  });
  const a = row(led, "aelfric"), w = row(led, "wulfric");

  check("the man who won more rounds heads the table",
    led.results[0]?.id === "wulfric",
    `order=${order(led)} — aelfric ${pay(a)} / wulfric ${pay(w)}`);

  check("and he is placed first, not second",
    w?.place === 1 && a?.place === 2,
    `wulfric place=${w?.place} aelfric place=${a?.place}`);

  check("and he is paid more coin for it",
    (w?.goldEarned ?? 0) > (a?.goldEarned ?? 0),
    `wulfric ${w?.goldEarned}g vs aelfric ${a?.goldEarned}g — level on 3 kills each, so the`
    + ` whole difference has to be the round`);

  check("the rounds each man won are on his own row, for the table to print",
    w?.roundsWon === 2 && a?.roundsWon === 1,
    `wulfric=${w?.roundsWon} aelfric=${a?.roundsWon} — a number that decides the payout and`
    + ` is not on the screen is worse than no number`);
}

console.log("\n-- nothing in the ledger may read a name --");
{
  // The same fight, entered in the opposite order and with the names swapped
  // end for end. If a single assertion above was passing on alphabet or on
  // arrival, exactly one of these two ledgers changes.
  const roundWins = { aelfric: 1, wulfric: 2 };
  const forwards = buildLedger({ roundWins, players: [man("aelfric", "Aelfric", 3), man("wulfric", "Wulfric", 3)], teamMode: false });
  const backwards = buildLedger({ roundWins, players: [man("wulfric", "Zzz", 3), man("aelfric", "Aaa", 3)], teamMode: false });
  const places = (led) => led.results.map((r) => `${r.id}:${r.place}:${r.goldEarned}`).sort().join(",");
  check("reversing the room and renaming both men changes nothing",
    places(forwards) === places(backwards),
    `${places(forwards)} vs ${places(backwards)}`);
}

console.log("\n-- a true tie is equal, and says so --");
{
  // Level on rounds AND on kills. There is no honest order left, so the answer
  // is not to invent one: both men are first and both are paid the same.
  const led = buildLedger({
    roundWins: { osric: 1, beorn: 1 },
    players: [man("osric", "Osric", 4), man("beorn", "Beorn", 4)],
    teamMode: false,
  });
  const o = row(led, "osric"), b = row(led, "beorn");
  check("two men level on rounds and on kills share a place and a purse",
    o?.place === 1 && b?.place === 1 && o?.goldEarned === b?.goldEarned && o?.xpEarned === b?.xpEarned,
    `osric ${pay(o)} / beorn ${pay(b)}`);
  check("and the match itself is the draw decideMatch already called it",
    led.winnerKey === null && led.winnerBy === "draw" && !o?.isWinner && !b?.isWinner,
    `winner=${led.winnerKey} by=${led.winnerBy}`);
}

console.log("\n-- the third man is third, not second --");
{
  // Competition ranking. Two men tie at the top, so the next man is #3: a table
  // that prints #1 #1 #2 is claiming the tie cost somebody a place.
  const led = buildLedger({
    roundWins: { osric: 2, beorn: 2, deor: 1 },
    players: [man("osric", "Osric", 4), man("beorn", "Beorn", 4), man("deor", "Deor", 9)],
    teamMode: false,
  });
  check("a shared first place pushes the next man to third",
    row(led, "deor")?.place === 3,
    led.results.map((r) => `${r.id}#${r.place}`).join(" "));
  check("and nine kills do not promote him past men who won more rounds",
    led.results[2]?.id === "deor",
    `order=${order(led)}`);
}

console.log("\n-- payout and ranking read the same order --");
{
  // The property, stated as the owner stated it: he was ABOVE a man on the
  // table and BELOW him on the coins. Whatever else the pay is made of, the
  // part placement buys must never run backwards down the table, and two rows
  // level on kills must be paid in table order outright.
  const led = buildLedger({
    roundWins: { a: 3, b: 2, c: 2, d: 0 },
    // Entered worst-first on purpose. A ledger that never sorts hands the man
    // with eleven kills and no rounds the top row, and the purse then RISES
    // down the table — the exact picture the owner photographed.
    players: [man("d", "D", 11), man("b", "B", 5), man("a", "A", 2), man("c", "C", 5)],
    teamMode: false,
  });
  // FIRST, that there is anything to compare. Every monotonicity test below is
  // a `<` between two numbers, and `undefined < undefined` is false — so a build
  // that emits no `place` at all passes all of them without carrying the field.
  // That is this repository's signature failure in miniature and it was live in
  // this file for one run: three greens off a ledger with no places in it.
  check("every row carries a place and a rounds-won number at all",
    led.results.every((r) => Number.isFinite(r.place) && Number.isFinite(r.roundsWon)),
    led.results.map((r) => `${r.id}:place=${r.place}:rounds=${r.roundsWon}`).join(" "));

  let placeBackwards = "";
  let killsLevelBackwards = "";
  for (let i = 1; i < led.results.length; i++) {
    const up = led.results[i - 1], dn = led.results[i];
    if (!(dn.place >= up.place)) placeBackwards = `${dn.id}#${dn.place} sits below ${up.id}#${up.place}`;
    if (dn.kills === up.kills && dn.goldEarned > up.goldEarned) {
      killsLevelBackwards = `${dn.id} ${dn.goldEarned}g under ${up.id} ${up.goldEarned}g on equal kills`;
    }
  }
  check("place never runs backwards down the printed table",
    placeBackwards === "", placeBackwards || led.results.map((r) => `${r.id}#${r.place}`).join(" "));
  check("two men level on kills are paid in table order",
    killsLevelBackwards === "", killsLevelBackwards || "b and c are level on 5 kills apiece");
  // The purse is the half of the pay placement buys. It is the piece that has
  // to be monotone; the kills and the damage are earned and are not a ranking.
  const purse = led.results.map((r) => r.goldEarned - r.kills * 15 - 10);
  check("the placement purse falls with the place and never rises",
    purse.every((g, i) => i === 0 || g <= purse[i - 1]),
    `purse=${purse.join(",")} places=${led.results.map((r) => r.place).join(",")}`);
}

console.log("\n-- a war band ranks bands, and every man on a band shares its place --");
{
  const led = buildLedger({
    roundWins: { red: 2, blue: 1 },
    players: [
      man("r1", "Rand", 1, { team: "red" }), man("b1", "Bard", 9, { team: "blue" }),
      man("r2", "Rowa", 0, { team: "red" }), man("b2", "Brun", 4, { team: "blue" }),
    ],
    teamMode: true,
  });
  const red = led.results.filter((r) => r.id.startsWith("r"));
  const blue = led.results.filter((r) => r.id.startsWith("b"));
  check("the winning band's men all place first and all carry the band's rounds",
    red.every((r) => r.place === 1 && r.roundsWon === 2 && r.isWinner)
    && blue.every((r) => r.place === 2 && r.roundsWon === 1 && !r.isWinner),
    led.results.map((r) => `${r.id}#${r.place}/${r.roundsWon}`).join(" "));
  check("thirteen kills on the losing side do not out-place a band that won the rounds",
    led.results.slice(0, 2).every((r) => r.id.startsWith("r")),
    `order=${order(led)} — blue carried 13 kills to red's 1`);
}

console.log("\n-- the ledger's head and decideMatch cannot disagree --");
{
  // One rule, one implementation. If `buildLedger` ever grew its own copy of
  // the ordering, this is where the copy and the original part company.
  const cases = [
    { roundWins: { a: 3, b: 1, c: 1 }, kills: { a: 0, b: 40, c: 9 } },
    { roundWins: { a: 2, b: 2, c: 1 }, kills: { a: 4, b: 7, c: 30 } },
    { roundWins: { a: 2, b: 2, c: 2 }, kills: { a: 5, b: 9, c: 5 } },
    { roundWins: {}, kills: { a: 3, b: 11, c: 6 } },
    { roundWins: { a: 1, b: 1 }, kills: { a: 6, b: 6 } },
  ];
  const wrong = [];
  for (const c of cases) {
    const players = Object.entries(c.kills).map(([id, k]) => man(id, id.toUpperCase(), k));
    const led = buildLedger({ roundWins: c.roundWins, players, teamMode: false });
    const verdict = decideMatch({
      roundWins: c.roundWins,
      entrants: Object.entries(c.kills).map(([key, kills]) => ({ key, kills })),
    });
    const head = led.results[0];
    // A verdict names a man only when he is ALONE at the top; when it names
    // nobody the head of the table is still first, it just did not win.
    if (verdict.key && head?.id !== verdict.key) wrong.push(`${JSON.stringify(c.roundWins)}: head=${head?.id} verdict=${verdict.key}`);
    if (verdict.key && head?.place !== 1) wrong.push(`${JSON.stringify(c.roundWins)}: victor placed ${head?.place}`);
    if (led.winnerKey !== verdict.key) wrong.push(`${JSON.stringify(c.roundWins)}: ledger winner ${led.winnerKey} vs ${verdict.key}`);
  }
  check("whenever the match has a victor he is the top row and he is #1",
    wrong.length === 0, wrong.join("; ") || `${cases.length} shapes agreed`);
}

/**
 * WHAT THIS HARNESS MEASURES AND DECLINES TO GATE.
 *
 * PROCESS.md R4: *"If a harness measures something and declines to gate on it,
 * the count goes on the PASS line... Declining to rule is often correct. Hiding
 * that you declined never is."* Three deferrals were found in one day in this
 * repo by the owner, against tooling that had been calling itself green for
 * weeks. So these are measured with real numbers and printed beside the score.
 */
const deferrals = [];
{
  // The pay has two halves. The PURSE is bought by placement and is gated above:
  // it never rises down the table, and two men level on kills are paid in table
  // order. The EARNED half — kills and damage — is not a ranking and is not
  // gated, so a man who placed second because he won fewer rounds can still
  // out-earn the first if he killed far more. Whether that is right is a design
  // question for the owner; what is not acceptable is it being true silently.
  const led = buildLedger({
    roundWins: { steady: 2, bloody: 1 },
    players: [man("steady", "Steady", 3, { damage: 200 }), man("bloody", "Bloody", 8, { damage: 900 })],
    teamMode: false,
  });
  const s = row(led, "steady"), b = row(led, "bloody");
  if (b.goldEarned > s.goldEarned || b.xpEarned > s.xpEarned) {
    deferrals.push(`the EARNED half of the pay is not placement-ordered —`
      + ` #${s.place} ${s.name} (${s.roundsWon} rounds, ${s.kills} kills) takes ${s.goldEarned}g/${s.xpEarned}xp`
      + ` while #${b.place} ${b.name} (${b.roundsWon} round, ${b.kills} kills) takes ${b.goldEarned}g/${b.xpEarned}xp.`
      + ` The purse IS ordered and is gated; kills and damage are paid for themselves.`
      + ` The owner's report was the EQUAL-KILLS case and that one is gated outright.`);
  }
  // HONOUR does not come through this function at all. It is derived twice, from
  // `isWinner` alone, in `src/db/profiles.ts:297` (the server's pay) and
  // `src/app/page.tsx` `tallyLocally` (the device's fallback) — a mirrored
  // definition, this repo's third named failure mode. `isWinner` is at least
  // rounds-aware, so honour is coarse rather than wrong; but a man who won two
  // of five rounds and lost the match earns exactly the honour of a man who won
  // none. Neither file is this unit's to edit, so it is named, not gated.
  deferrals.push(`honour reads isWinner, not place — computed twice`
    + ` (src/db/profiles.ts:297 and page.tsx tallyLocally) and neither copy sees`
    + ` roundsWon or place. Coarse rather than wrong, and NOT gated here.`);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n[tiebreak] ${passed}/${results.length} passed`
  + (deferrals.length
    ? ` — WITH ${deferrals.length} thing(s) measured and NOT gated, which is a`
      + ` deferral and not a clean sheet`
    : ""));
for (const d of deferrals) console.log(`[tiebreak]   not gated: ${d}`);
process.exitCode = passed === results.length ? 0 : 1;
