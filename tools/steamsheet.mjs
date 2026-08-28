#!/usr/bin/env node
// STEAMSHEET — prints the achievement table in the shape Steamworks' admin
// wants it pasted, and JUDGES the derivation before it prints: a sheet that
// could drift from the marks would be docs/PROCESS.md failure mode 3 (a
// mirrored constant) on a storefront, where it is public and permanent.
//
// Run: node tools/steamsheet.mjs
import { MARKS, markEarned } from "../src/game/marks.mjs";
import { achievements, earnedAchievements, apiNameOf } from "../src/game/achievements.mjs";

let pass = 0, fail = 0;
const claim = (ok, name, detail = "") => {
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? "PASS " : "FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
};

const rows = achievements();
const paid = MARKS.filter((m) => m.how !== "free");

// 1. The sheet IS the marks — every earned mark, nothing else, same order.
claim(rows.length === paid.length, "one row per earned mark",
  `${rows.length} rows for ${paid.length} marks`);
claim(rows.every((r, i) => r.markId === paid[i].id), "same order as MARKS");

// 2. API names are legal Steamworks identifiers and unique.
const names = rows.map((r) => r.apiName);
claim(names.every((n) => /^[A-Z0-9_]{1,128}$/.test(n)), "API names are [A-Z0-9_]");
claim(new Set(names).size === names.length, "API names unique");

// 3. The earned reader agrees with the rule it derives from, on a fact walk
//    that crosses every threshold in the table.
const walks = [
  {}, { level: 5 }, { level: 15 }, { wins: 5 }, { wins: 25 },
  { matches: 20 }, { sworn: true }, { crowned: true },
  { level: 99, wins: 99, matches: 99, sworn: true, crowned: true },
];
const agree = walks.every((f) => {
  const got = new Set(earnedAchievements(f));
  return paid.every((m) => got.has(apiNameOf(m)) === markEarned(m, f));
});
claim(agree, "earnedAchievements === markEarned across the fact walk", `${walks.length} walks`);

if (fail) { console.log(`\n[steamsheet] ${fail} FAILED`); process.exit(1); }

console.log(`\n[steamsheet] ${pass}/${pass} — the sheet, for the Steamworks admin panel:\n`);
console.log("API Name".padEnd(22) + "Display Name".padEnd(24) + "Description");
console.log("-".repeat(70));
for (const r of rows) {
  console.log(r.apiName.padEnd(22) + r.name.padEnd(24) + r.description);
}
console.log(
  "\nSet Progress Stats: none (every achievement is a threshold on a stat the" +
  "\nprofile already records; add stats only if Steam progress bars are wanted)." +
  "\nHidden: none. Icons: render each mark's 24px glyph at 256px, jade on iron" +
  "\n(achieved) and grey on iron (unachieved) — the marks' own `d` paths are the art.");
