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
 *
 * ---------------------------------------------------------------------------
 * ROUND TWO — WHY THIS FILE WAS GREEN OVER A LIVE DEFECT, WHICH MATTERS MORE
 * THAN THE DEFECT.
 *
 * An adversary reproduced a war band whose bands finished LEVEL ON ROUNDS and
 * got a table reading #1 #2 #2 #1 with a purse of 50, 20, 20, 50 — placement
 * and row order openly contradicting each other, which is the owner's own
 * screenshot. This file scored 16/16 on it, and it did so while OWNING THE TWO
 * ASSERTIONS THAT SEE IT:
 *
 *   "place never runs backwards down the printed table"      would have failed
 *   "the placement purse falls with the place and never rises"  would have failed
 *
 * They were written once, inside ONE free-for-all fixture, and never pointed at
 * anything else. The only war band in the file was `{red: 2, blue: 1}` — bands
 * SEPARATED on rounds, which is the one shape in which the broken key and the
 * right one agree. The gate was green because the case was absent.
 *
 * So the shape of the file changed, and that is the real repair. `ledger()`
 * below builds every fixture and runs the WHOLE-TABLE PROPERTIES on it before
 * the fixture's own specific assertions get a word — place monotone down the
 * rows, purse monotone down the rows, the crowned men a prefix of the table,
 * every row carrying its numbers. A property that holds of a results table
 * holds of EVERY results table, and stating it once per fixture is how it came
 * to be stated for only one. Any case added here from now on is gated on all of
 * it without its author having to remember.
 */
import { buildLedger, decideMatch, makeEngine } from "../src/game/engine.mjs";

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
/** The purse is the half of the pay that placement buys; kills and damage are earned. */
const purseOf = (r) => r.goldEarned - r.kills * 15 - 10;
const table = (led) => led.results.map((r) => `${r.name}#${r.place}/${r.kills}K/${r.roundsWon}r/${purseOf(r)}g`).join(" ");

/**
 * BUILD A LEDGER AND GATE THE WHOLE TABLE, every time, before anybody asks it
 * anything specific.
 *
 * These four are properties of a results table as such. None of them is about
 * rounds or kills or bands, which is exactly why none of them can be dodged by
 * a fixture that happens not to exercise the ranking rule: whatever the shape,
 * a printed table has to agree with itself.
 *
 *   NUMBERS      every row carries a finite `place` and `roundsWon` at all.
 *                First, because every check under it is a comparison and
 *                `undefined <= undefined` is false — a build that emitted no
 *                places would pass the monotonicity tests without carrying the
 *                field. That was live in this file for one run: three greens
 *                off a ledger with no places in it.
 *   PLACE        `place` never runs backwards as the table is read downward.
 *                A row printed under a row it out-placed is the defect, stated.
 *   PURSE        the placement half of the pay never RISES down the table. The
 *                owner's words: above a man on the table, below him on the
 *                coins.
 *   CROWN        the crowned men are a PREFIX of the table. A man wearing the
 *                crown below a man who is not is the same contradiction wearing
 *                the other hat, and it is the half a place-only check misses.
 */
function tableFaults(led) {
  const rows = led.results;
  const faults = [];
  if (!rows.every((r) => Number.isFinite(r.place) && Number.isFinite(r.roundsWon))) {
    faults.push("a row carries no place or no roundsWon");
  }
  for (let i = 1; i < rows.length; i++) {
    const up = rows[i - 1], dn = rows[i];
    if (dn.place < up.place) faults.push(`${dn.name}#${dn.place} printed under ${up.name}#${up.place}`);
    if (purseOf(dn) > purseOf(up)) faults.push(`${dn.name} takes ${purseOf(dn)}g of purse under ${up.name}'s ${purseOf(up)}g`);
    if (dn.isWinner && !up.isWinner) faults.push(`${dn.name} is crowned under an uncrowned ${up.name}`);
  }
  return faults;
}

function ledger(label, args) {
  const led = buildLedger(args);
  const faults = tableFaults(led);
  check(`${label}: the printed table agrees with itself, top to bottom`,
    faults.length === 0, faults.join("; ") || table(led));
  return led;
}

console.log("\n-- the owner's case: same kills, one man a round ahead, and his name sorts last --");
{
  // Aelfric first in the room and first in the alphabet; Wulfric won the extra
  // round. Nothing about this fixture is exotic — it is a best-of-3 that went
  // 2-1 with both men trading kills evenly, which is the ordinary shape.
  const roundWins = { aelfric: 1, wulfric: 2 };
  const led = ledger("the owner's case", {
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
  const forwards = ledger("entered forwards", { roundWins, players: [man("aelfric", "Aelfric", 3), man("wulfric", "Wulfric", 3)], teamMode: false });
  const backwards = ledger("entered backwards", { roundWins, players: [man("wulfric", "Zzz", 3), man("aelfric", "Aaa", 3)], teamMode: false });
  const places = (led) => led.results.map((r) => `${r.id}:${r.place}:${r.goldEarned}`).sort().join(",");
  check("reversing the room and renaming both men changes nothing",
    places(forwards) === places(backwards),
    `${places(forwards)} vs ${places(backwards)}`);
}

console.log("\n-- a true tie is equal, and says so --");
{
  // Level on rounds AND on kills. There is no honest order left, so the answer
  // is not to invent one: both men are first and both are paid the same.
  const led = ledger("a true tie", {
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
  const led = ledger("the third man", {
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
  const led = ledger("a four-man moot", {
    roundWins: { a: 3, b: 2, c: 2, d: 0 },
    // Entered worst-first on purpose. A ledger that never sorts hands the man
    // with eleven kills and no rounds the top row, and the purse then RISES
    // down the table — the exact picture the owner photographed.
    players: [man("d", "D", 11), man("b", "B", 5), man("a", "A", 2), man("c", "C", 5)],
    teamMode: false,
  });
  // `ledger()` has already gated place, purse and crown down this table, along
  // with every other table in the file. What is left here is the one thing that
  // is specific to this fixture: B and C are level on FIVE kills apiece, so the
  // pay they take must be settled by where they were printed and by nothing
  // else — the arrival order they were entered in has them the wrong way round.
  let killsLevelBackwards = "";
  for (let i = 1; i < led.results.length; i++) {
    const up = led.results[i - 1], dn = led.results[i];
    if (dn.kills === up.kills && dn.goldEarned > up.goldEarned) {
      killsLevelBackwards = `${dn.id} ${dn.goldEarned}g under ${up.id} ${up.goldEarned}g on equal kills`;
    }
  }
  check("two men level on kills are paid in table order",
    killsLevelBackwards === "", killsLevelBackwards || "b and c are level on 5 kills apiece");
}

console.log("\n-- a war band ranks bands, and every man on a band shares its place --");
{
  const led = ledger("bands a round apart", {
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

/**
 * THE CASE THAT WAS ABSENT. This is the whole of round two.
 *
 * Every war band this file held was SEPARATED ON ROUNDS, and that is the one
 * shape in which a rank key built on each man's own kills and a place built on
 * his band's cannot be told apart — the rounds term is worth 1e6 and drowns
 * every kill count in the arena. Level on rounds it cancels, and the two keys
 * are then answering different questions out loud.
 *
 * The numbers below are the adversary's, unchanged, because they are the
 * owner's screenshot in war-band clothes. On the build this replaced they
 * printed:
 *
 *     #1  Rand  7K  RNDS 1  +165g  (crowned)
 *     #2  Bard  4K  RNDS 1  +90g
 *     #2  Brun  2K  RNDS 1  +60g
 *     #1  Rowa  0K  RNDS 1  +60g   <- placed FIRST, crowned, printed LAST
 *
 * WHY THE TIEBREAK IS THE BAND'S KILLS AND NOT A DRAW. Because `decideMatch`
 * has already answered it — rounds, then the ENTRANT's kills, then a draw — and
 * an entrant in a war band is a BAND. Red took this match on 7 kills to blue's
 * 6 and the wire says `winnerBy: "kills"`; protocoltest gates that sentence
 * directly ("a war band tied on rounds is broken by the band's kills"). A
 * ledger that answered it any other way would be the second definition, and
 * two answers to one question is the fault this repository has recorded four
 * times in `characters.ts` alone. The ledger does not get its own opinion; it
 * gets `rankEntrants`, which is where the one opinion lives.
 */
console.log("\n-- TWO WAR BANDS LEVEL ON ROUNDS: the band's kills settle it, and the table says so --");
{
  const led = ledger("bands level on rounds", {
    roundWins: { red: 1, blue: 1 },
    players: [
      man("r1", "Rand", 7, { team: "red" }), man("b1", "Bard", 4, { team: "blue" }),
      man("r2", "Rowa", 0, { team: "red" }), man("b2", "Brun", 2, { team: "blue" }),
    ],
    teamMode: true,
  });
  const rand = row(led, "r1"), rowa = row(led, "r2"), bard = row(led, "b1"), brun = row(led, "b2");

  check("the band with more kills takes it, and BOTH its men are printed above BOTH of theirs",
    led.results.slice(0, 2).every((r) => r.id.startsWith("r"))
    && led.results.slice(2).every((r) => r.id.startsWith("b")),
    `order=${order(led)} — red 7 kills to blue's 6, level at one round each`);

  // The sharp end of it. Rowa did nothing all match and his band won; Bard is
  // the second-best pair of hands on the field and his band lost. A war band
  // ranks BANDS, so Rowa is above Bard — and it was Rowa, printed last under
  // two men he out-placed, that the adversary photographed.
  check("a man with no kills on the winning band is printed above the losing band's best",
    led.results.indexOf(rowa) < led.results.indexOf(bard)
    && rowa.place === 1 && bard.place === 2,
    `Rowa 0K #${rowa.place} at row ${led.results.indexOf(rowa) + 1};`
    + ` Bard 4K #${bard.place} at row ${led.results.indexOf(bard) + 1}`);

  check("every man carries his BAND's rounds and his BAND's place, not his own hands'",
    rand.place === 1 && rowa.place === 1 && bard.place === 2 && brun.place === 2
    && led.results.every((r) => r.roundsWon === 1),
    led.results.map((r) => `${r.name} ${r.kills}K #${r.place}/${r.roundsWon}r`).join("  "));

  check("the crown goes to the whole winning band and to nobody else",
    rand.isWinner && rowa.isWinner && !bard.isWinner && !brun.isWinner
    && led.winnerKey === "red" && led.winnerBy === "kills",
    `winner=${led.winnerKey} by=${led.winnerBy} — crowned: `
    + led.results.filter((r) => r.isWinner).map((r) => r.name).join(",") || "nobody");
}

console.log("\n-- and a war band level on rounds AND on kills is an honest draw --");
{
  // The third line of `decideMatch`'s rule, stated on bands. Nothing is left to
  // separate them, so both bands are first, every man is paid the same, and the
  // stage stands nobody up. The row order inside a place is each man's own
  // kills — the only thing left that a man actually did — and that is allowed
  // to interleave the bands, because at equal place there is no band order to
  // contradict.
  const led = ledger("bands level on everything", {
    roundWins: { red: 1, blue: 1 },
    players: [
      man("r1", "Rand", 5, { team: "red" }), man("b1", "Bard", 4, { team: "blue" }),
      man("r2", "Rowa", 1, { team: "red" }), man("b2", "Brun", 2, { team: "blue" }),
    ],
    teamMode: true,
  });
  check("both bands are first, nobody is crowned, and every purse is the same",
    led.results.every((r) => r.place === 1 && !r.isWinner)
    && new Set(led.results.map(purseOf)).size === 1
    && led.winnerKey === null && led.winnerBy === "draw",
    `${table(led)} winner=${led.winnerKey} by=${led.winnerBy} — red 6 kills, blue 6 kills`);
}

console.log("\n-- the ledger's head and decideMatch cannot disagree --");
{
  // One rule, one implementation. If `buildLedger` ever grew its own copy of
  // the ordering, this is where the copy and the original part company.
  //
  // THE WAR BANDS ARE NEW AND THEY ARE THE POINT. The battery was five
  // free-for-alls, and in a free-for-all the entrant IS the man — so `place`
  // and a key built on `p.kills` are reading the same quantity and cannot fall
  // out. Every shape that could tell them apart was a war band, and there were
  // none. `team: true` sums the pair into a band, which is what `buildLedger`
  // ranks, and the last three rows are level on rounds where the defect lived.
  const cases = [
    { roundWins: { a: 3, b: 1, c: 1 }, kills: { a: 0, b: 40, c: 9 } },
    { roundWins: { a: 2, b: 2, c: 1 }, kills: { a: 4, b: 7, c: 30 } },
    { roundWins: { a: 2, b: 2, c: 2 }, kills: { a: 5, b: 9, c: 5 } },
    { roundWins: {}, kills: { a: 3, b: 11, c: 6 } },
    { roundWins: { a: 1, b: 1 }, kills: { a: 6, b: 6 } },
    { team: true, roundWins: { red: 2, blue: 1 }, kills: { red: 1, blue: 13 } },
    { team: true, roundWins: { red: 1, blue: 1 }, kills: { red: 7, blue: 6 } },
    { team: true, roundWins: { red: 1, blue: 1 }, kills: { red: 2, blue: 9 } },
    { team: true, roundWins: { red: 1, blue: 1 }, kills: { red: 6, blue: 6 } },
    { team: true, roundWins: { red: 0, blue: 0 }, kills: { red: 4, blue: 1 } },
  ];
  const wrong = [];
  for (const c of cases) {
    // A band's kills, split unevenly across two men on purpose: the whole
    // defect was a sort that could see the halves and not the total, so a
    // fixture that gave each band one man could not have caught it. The split
    // is 0 / all, which is the widest a pair can be.
    const players = Object.entries(c.kills).flatMap(([key, k]) => (c.team
      ? [man(`${key}1`, `${key}-1`, k, { team: key }), man(`${key}2`, `${key}-2`, 0, { team: key })]
      : [man(key, key.toUpperCase(), k)]));
    // The wire's rows carry no `team` — a result row is a man — so the band a
    // row belongs to is read back off the roster this fixture built, not off
    // the row. Reading it off the row would have been a fourth copy of the
    // answer this whole file is about.
    const bandOf = new Map(players.map((p) => [p.id, c.team ? p.team : p.id]));
    const led = buildLedger({ roundWins: c.roundWins, players, teamMode: !!c.team });
    const verdict = decideMatch({
      roundWins: c.roundWins,
      entrants: Object.entries(c.kills).map(([key, kills]) => ({ key, kills })),
    });
    const head = led.results[0];
    const shape = `${c.team ? "band " : ""}${JSON.stringify(c.roundWins)}`;
    // A verdict names a man only when he is ALONE at the top; when it names
    // nobody the head of the table is still first, it just did not win.
    const topKey = head ? bandOf.get(head.id) : null;
    if (verdict.key && topKey !== verdict.key) wrong.push(`${shape}: head=${topKey} verdict=${verdict.key}`);
    if (verdict.key && head?.place !== 1) wrong.push(`${shape}: victor placed ${head?.place}`);
    if (led.winnerKey !== verdict.key) wrong.push(`${shape}: ledger winner ${led.winnerKey} vs ${verdict.key}`);
    // And the table each of those verdicts was printed on is coherent. Folded
    // in here rather than calling `ledger()` ten times, so the battery still
    // reads as one claim; the property applied is the identical one.
    for (const f of tableFaults(led)) wrong.push(`${shape}: ${f}`);
  }
  check("whenever the match has a victor he is the top row, he is #1, and the table under him agrees",
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

  // THE PURSE NOW FOLLOWS THE PLACE, AND A DRAW HAS A FIRST PLACE. Before this
  // work the 50 g / 100 xp bonus keyed off `isWinner`, so a drawn match paid it
  // to nobody; it keys off `place` now, and competition ranking gives two men
  // who finished dead level a shared first. Measured rather than asserted,
  // because it is the one economy consequence the ordering fix could not avoid.
  const drawn = buildLedger({
    roundWins: { osric: 1, beorn: 1 },
    players: [man("osric", "Osric", 4), man("beorn", "Beorn", 4)],
    teamMode: false,
  });
  const paidOnADraw = drawn.results.filter((r) => purseOf(r) > 0);
  if (paidOnADraw.length) {
    deferrals.push(`a DRAWN match now pays its joint firsts —`
      + ` ${paidOnADraw.map((r) => `${r.name} #${r.place} takes ${purseOf(r)}g of purse`).join(", ")}`
      + ` where nobody was crowned (winnerBy=${drawn.winnerBy}). The old purse rode`
      + ` isWinner and paid nothing here. It cannot be put back without the purse and`
      + ` the place parting company, which is the defect. The 2nd/3rd tier that shipped`
      + ` with round one HAS been reverted — see PLACE_GOLD in engine.mjs and the`
      + ` MONETISATION.md argument quoted there. NOT gated: it is the owner's call.`);
  }
}

/**
 * CAN THE SIM EVEN DEAL THIS HAND? — measured, because the fixture above is
 * worthless if it is a shape no match produces, and R3 says an adversary will
 * ask.
 *
 * A war band finishes LEVEL ON ROUNDS only if a round is DRAWN, and `endRound`
 * has a branch for exactly that: *"Both sides wiped in the same tick is a
 * draw"*. So this plays a real best-of-3 war band on `makeEngine` — no browser,
 * about a second — takes it to 1-1, and then sends all four men into the
 * bonfire together to try to buy that drawn third round. Whatever comes back is
 * printed on the verdict line.
 *
 * What it finds is that the fire cannot buy it, and the reason is in
 * `checkRoundEnd`: `burnDeath` calls it after EVERY SINGLE death, so the first
 * band to lose its last man is judged while the other band still has one
 * standing, and that band takes the round. The `null` arm needs both bands
 * empty inside ONE call and deaths arrive one at a time.
 *
 * That does NOT make the fixture above hypothetical, and the distinction
 * matters: `decideMatch` is an exported pure function whose rounds-level war
 * band `protocoltest` gates by name, `buildLedger` is the other half of the
 * same rule, and the two disagreeing is the mirrored-definition fault whatever
 * the sim happens to deal today. It does mean no browser harness can reach the
 * case by playing, which is why `summaryflow` reaches it by handing the shipped
 * page a ledger this function built rather than by fighting for one.
 */
{
  const NEUTRAL = { moveX: 0, moveZ: 0, rotationY: 0, sprint: false, attack: false, heavyAttack: false, block: false, dodge: false, crouch: false, ability: false, shove: false, attackDir: "right" };
  const sim = makeEngine({ autoTick: false, epoch: 1e12 });
  const seat = (name) => {
    const c = { name, byType: new Map(), snapshot: null };
    c.sid = sim.connect((str) => {
      const m = JSON.parse(str);
      if (!c.byType.has(m.type)) c.byType.set(m.type, []);
      c.byType.get(m.type).push(m.data);
      if (m.data && m.data.players) c.snapshot = m.data;
    });
    c.send = (t, d) => sim.message(c.sid, { type: t, data: d || {} });
    c.got = (t) => c.byType.get(t) || [];
    return c;
  };
  const NAMES = ["Rand", "Bard", "Rowa", "Brun"];
  const s = NAMES.map(seat);
  s[0].send("create", { name: NAMES[0], mode: "war_band", bestOf: 3 });
  const code = s[0].got("join")[0].code;
  const ids = [s[0].got("join")[0].playerId];
  for (let i = 1; i < 4; i++) { s[i].send("join", { code, name: NAMES[i] }); ids.push(s[i].got("join")[0].playerId); }
  // 0 and 2 red, 1 and 3 blue — the same four men as the fixture above.
  s[0].send("select_team", { team: "red" }); s[2].send("select_team", { team: "red" });
  s[1].send("select_team", { team: "blue" }); s[3].send("select_team", { team: "blue" });
  for (const c of s) { c.send("select_class", { warriorClass: "berserker" }); c.send("ready"); }
  s[0].send("start");
  const st = () => s[0].snapshot?.state;
  const P = (i) => s[0].snapshot?.players?.[ids[i]];
  const hunt = (a, v) => {
    const A = P(a), V = P(v);
    if (!A || !V || A.state === "dead" || V.state === "dead") return;
    const dx = V.position.x - A.position.x, dz = V.position.z - A.position.z;
    const d = Math.hypot(dx, dz) || 1, close = d < 1.6;
    s[a].send("input", { ...NEUTRAL, moveX: close ? 0 : dx / d, moveZ: close ? 0 : dz / d, rotationY: Math.atan2(dx / d, dz / d), sprint: !close, attack: close });
  };
  const toFire = (i) => {
    const p = P(i);
    if (!p || p.state === "dead") return;
    const r = Math.hypot(p.position.x, p.position.z) || 1;
    if (r < 1.1) return s[i].send("input", { ...NEUTRAL });
    s[i].send("input", { ...NEUTRAL, moveX: -p.position.x / r, moveZ: -p.position.z / r, rotationY: Math.atan2(-p.position.x, -p.position.z), sprint: true });
  };
  const run = (state, cap, drive) => { let n = 0; while (st() === state && n < cap) { drive && drive(); sim.step(); n++; } return n; };
  run("countdown", 400);
  run("fighting", 1500, () => { if (P(1)?.state !== "dead") hunt(0, 1); else hunt(0, 3); });   // red takes it
  run("intermission", 400); run("countdown", 400);
  run("fighting", 1500, () => { if (P(2)?.state !== "dead") hunt(1, 2); toFire(0); });        // blue takes it
  const levelAfterTwo = JSON.stringify(s[0].snapshot?.roundWins);
  run("intermission", 400); run("countdown", 400);
  run("fighting", 1500, () => { for (let i = 0; i < 4; i++) toFire(i); });                    // all four burn
  const rounds = s[0].got("round_end");
  const last = rounds[rounds.length - 1] || {};
  const end = s[0].got("match_end")[0];
  const drewARound = rounds.some((r) => r.draw);
  deferrals.push(`the sim did NOT deal a war band level on rounds, and it is not the fixture that is wrong.`
    + ` A real best-of-3 stood at ${levelAfterTwo} after two rounds; all four men were then driven into the`
    + ` bonfire together and round three still went to ${last.winnerTeam || "(none)"} (draw=${!!last.draw}),`
    + ` finishing ${JSON.stringify(end?.roundWins)}. ${drewARound ? "A round DID draw — re-read this note." : ""}`
    + ` burnDeath calls checkRoundEnd after every single death, so the first band to lose its last man is`
    + ` judged while the other still has one standing; endRound's "both sides wiped in the same tick" arm`
    + ` needs two deaths inside one call. buildLedger must still agree with decideMatch, which gates this`
    + ` shape by name in protocoltest — but NOT GATED here, because whether a drawn round should be`
    + ` reachable at all is a question for whoever owns checkRoundEnd.`);
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n[tiebreak] ${passed}/${results.length} passed`
  + (deferrals.length
    ? ` — WITH ${deferrals.length} thing(s) measured and NOT gated, which is a`
      + ` deferral and not a clean sheet`
    : ""));
for (const d of deferrals) console.log(`[tiebreak]   not gated: ${d}`);
process.exitCode = passed === results.length ? 0 : 1;
