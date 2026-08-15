#!/usr/bin/env node
// ============================================================
// NAMETEST — the bot roster is not eight men with one byname
//
//   node tools/nametest.mjs        (or: npm run nametest)
//
// WHY THIS EXISTS. The owner played a match in which every opponent was
// "<something> the Grim". Not a small pool — NO pool: `BOT_TITLES` mapped each
// difficulty to a single constant epithet, so a jarl room was eight copies of
// one byname by construction. Nothing in this repository could see that,
// because nothing measured the roster as a SET. Every check we owned looked at
// a bot one bot at a time, and one bot named "Uhtred the Grim" is unimpeachable.
//
// That is the same failure this project has recorded fifteen times in
// OPEN-DEFECTS: a measurement answering the wrong question. The question is not
// "is this name well-formed", it is "does a ring full of them read as a war
// band or as a spreadsheet". So check 3 fills an eight-man room — the size of a
// blood moot — and counts DISTINCT bynames. On the code as the owner played it
// that check reads 1 and fails.
//
// Check 4 guards the thing the fix could easily have broken. `engine.mjs`
// promises "difficulty is a dial, not a birthmark: a bot can be re-graded in
// the lobby and keeps its name". A byname redrawn at random on every re-grade
// would honour the letter and break the promise, so the round trip
// recruit -> jarl -> recruit must land back on the byname it started with,
// while recruit and jarl must still READ differently — the tier signal the old
// constant did buy, and the one thing worth keeping from it.
// ============================================================
import { forgeName, botName, forgeSize, BYNAMES, PROTOTHEMES, DEUTEROTHEMES, isTautology, joinElements }
  from "../src/game/names.mjs";
let bad = 0;
console.log(`[names] forge reaches ${forgeSize()} distinct names from ${PROTOTHEMES.length}x${DEUTEROTHEMES.length} elements`);
// 1. no tautologies, ever
const seen = new Map();
for (let i = 0; i < 20000; i++) {
  const f = forgeName();
  if (isTautology(f.proto, f.deutero)) { console.log("FAIL tautology", f.name); bad++; break; }
  if (!/^[A-ZÆ][a-zæðþ]+$/.test(f.name)) { console.log("FAIL shape", f.name); bad++; break; }
  seen.set(f.name, (seen.get(f.name) || 0) + 1);
}
console.log(`[names] 20000 draws produced ${seen.size} distinct forenames`);
if (seen.size < 300) { console.log(`FAIL variety: only ${seen.size}`); bad++; }
// 2. elision really collapses
const el = joinElements("Ead", "ræd");
console.log(`[names] Ead + ræd = ${el}`);
if (el !== "Eadræd") { console.log("FAIL elision"); bad++; }
// 3. THE OWNER'S DEFECT: a room of jarls must not all share one byname
for (const tier of ["recruit", "warrior", "jarl"]) {
  const by = new Set();
  for (let i = 0; i < 8; i++) by.add(botName((Math.random()*2**31)|0, tier, "Test").split(" ").slice(1).join(" "));
  console.log(`[names] 8 ${tier}s drew ${by.size} distinct bynames of ${BYNAMES[tier].length} available`);
  if (by.size < 3) { console.log(`FAIL ${tier}: 8 bots share ${by.size} byname(s) — the reported defect`); bad++; }
}
// 4. seeded determinism: re-grading round trip returns the original
const s = 12345;
const a = botName(s, "recruit", "Wulfstan"), b = botName(s, "jarl", "Wulfstan"), c = botName(s, "recruit", "Wulfstan");
console.log(`[names] regrade round trip: ${a} -> ${b} -> ${c}`);
if (a !== c) { console.log("FAIL determinism"); bad++; }
if (a === b) { console.log("FAIL tier signal: recruit and jarl read the same"); bad++; }
console.log(bad ? `[names] FAIL — ${bad}` : "[names] PASS");
process.exit(bad ? 1 : 0);
