#!/usr/bin/env node
// MARKTEST — the profile marks (backlog 5.5), held headless.
//
//   node tools/marktest.mjs
//
// The mark set and its unlock rules are pure data + pure functions in
// `src/game/marks.mjs`, so the E3 rule applies: no browser, no render, and
// every law the surfaces rely on is provable here in milliseconds. The one
// thing this file CANNOT see is whether a glyph reads as what it is named —
// that is R2 territory and lives in the proof sheet the ledger points at.
import { MARKS, MARK_FACTS, markOf, markEarned, earnedMark, markHint } from "../src/game/marks.mjs";

let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

console.log("[mark] the devices, headless\n");

// ---- the set itself ----
check("ten marks, unmarked first", MARKS.length === 10 && MARKS[0].id === "none",
  MARKS.map((m) => m.id).join(","));
check("ids are unique", new Set(MARKS.map((m) => m.id)).size === MARKS.length);
check("every mark is sourced or confessed",
  MARKS.every((m) => m.source.length > 20),
  "the design system's own law: a real find, or labelled an invention");
check("the one invented device says so out loud",
  MARKS.filter((m) => /invention/i.test(m.source)).length === 1
    && /invention/i.test(markOf("wyrmknot").source)
    && MARKS.every((m) => /invention|find|stone|chronicle|grave|amulet|knife|kells|metalwork|county|york|shield|bracteate|forth/i.test(m.source)),
  "the wyrm-knot; all nine others name a find");
check("every drawn mark has a path, only NONE has none",
  MARKS.every((m) => (m.id === "none") === (m.d === "")));

// ---- the grid: every coordinate on the 24px canvas ----
// A path that wanders off the viewBox clips silently at render time — the
// classic way a glyph loses its head on one surface only. Parse every number
// pair out of every path and hold it inside [0, 24].
{
  let worst = null;
  for (const m of MARKS) {
    const nums = (m.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    // Arc commands carry rx/ry/rotation/flags before the endpoint; flags and
    // radii are not coordinates. Rather than parse SVG properly, hold the
    // ENDPOINTS: strip each arc's five non-coordinate parameters.
    const coords = [];
    const tokens = m.d.split(/(?=[MLCQAZ])/i);
    for (const t of tokens) {
      const cmd = t[0]?.toUpperCase();
      const ns = (t.slice(1).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
      if (cmd === "A") { for (let i = 0; i + 6 < ns.length + 1; i += 7) coords.push(ns[i + 5], ns[i + 6]); }
      else if (cmd && "MLCQ".includes(cmd)) coords.push(...ns);
    }
    for (let i = 0; i < coords.length; i += 2) {
      const [x, y] = [coords[i], coords[i + 1]];
      if (x < 0 || x > 24 || y < 0 || y > 24) worst = `${m.id} at ${x},${y}`;
    }
    if (nums.some((n) => Number.isNaN(n))) worst = `${m.id} has NaN`;
  }
  check("every path point sits on the 24px grid", worst === null, worst ?? "all inside [0,24]");
}

// ---- lookups narrow, never throw ----
check("an unknown id is the unmarked shield", markOf("zzz_hostile").id === "none");
check("undefined and null are the unmarked shield",
  markOf(undefined).id === "none" && markOf(null).id === "none");

// ---- the unlock rules, each fact pulled once ----
const fresh = { level: 1, wins: 0, matches: 0, sworn: false };
const veteran = { level: 20, wins: 30, matches: 60, sworn: true };
check("the facts a rule may read are the four the profile has",
  MARK_FACTS.join(",") === "level,wins,matches,sworn");
check("every rule reads a real fact",
  MARKS.every((m) => m.how === "free" || MARK_FACTS.includes(m.how)));
check("a fresh warrior owns exactly the free marks",
  MARKS.filter((m) => markEarned(m, fresh)).every((m) => m.how === "free")
    && MARKS.filter((m) => m.how === "free").length === 3,
  "none, boss, seax");
check("a veteran owns the lot", MARKS.every((m) => markEarned(m, veteran)));
check("each gated mark opens exactly at its bar",
  MARKS.filter((m) => m.how !== "free").every((m) => {
    const at = { ...fresh, [m.how]: m.how === "sworn" ? true : m.need };
    const under = { ...fresh, [m.how]: m.how === "sworn" ? false : m.need - 1 };
    return markEarned(m, at) && !markEarned(m, under);
  }));
check("missing facts under-claim rather than over-claim",
  MARKS.filter((m) => markEarned(m, {})).every((m) => m.how === "free")
    && MARKS.filter((m) => markEarned(m, undefined)).every((m) => m.how === "free"));
check("hostile facts count as zero",
  !markEarned(markOf("valknut"), { level: "99weird" })
    && !markEarned(markOf("hammer"), { wins: NaN }));

// ---- the own-view narrowing every surface calls ----
check("an unearned choice draws the bare shield",
  earnedMark("ravenbanner", fresh).id === "none", "25 wins asked, 0 held");
check("an earned choice is honoured", earnedMark("valknut", { ...fresh, level: 5 }).id === "valknut");
check("a hostile id draws the bare shield", earnedMark("<script>", veteran).id === "none");
check("choosing no mark is always allowed", earnedMark("none", fresh).id === "none");

// ---- what a locked tile says ----
check("every gated mark has a hint that names its bar",
  MARKS.filter((m) => m.how !== "free").every((m) =>
    m.how === "sworn" ? /kingdom/i.test(markHint(m)) : markHint(m).includes(String(m.need))));
check("free marks claim themselves", MARKS.filter((m) => m.how === "free").every((m) => /yours/i.test(markHint(m))));

// ---- the migration promise: characters.ts backfills what this narrows ----
// marktest cannot import the TS module, but it can hold the CONTRACT the two
// agreed: "none" is a real id, so a backfilled profile resolves to a real mark.
check("the backfill value is a real mark", markOf("none").name.length > 0);

// ---- the server's copy of the law ----
// `src/db/catalogue.ts` narrows a stored mark with `earnedMark` against the
// ROW's facts (`factsOf` in profiles.ts), and `src/db/profiles.ts` grades the
// legacy claim against the record being written. The functions are these same
// ones, so the claims above already prove the maths; what this holds is the
// wiring — the source must actually call it, or the server keeps junk.
import { readFileSync } from "node:fs";
{
  const catalogue = readFileSync(new URL("../src/db/catalogue.ts", import.meta.url), "utf8");
  const profiles = readFileSync(new URL("../src/db/profiles.ts", import.meta.url), "utf8");
  check("the server narrows the mark against the row's record",
    /earnedMark\(candidate\.mark,\s*facts\)/.test(catalogue),
    "sanitizeAppearance carries MarkFacts");
  {
    // Every call must carry facts. A paren-matching parse would be sturdier,
    // but the shape is stable: three sites hand over `factsOf(row)` and the
    // legacy claim builds its facts inline — one per call site, none bare.
    const calls = (profiles.match(/sanitizeAppearance\(/g) ?? []).length;
    const backed = (profiles.match(/factsOf\(row\)/g) ?? []).length
      + (profiles.match(/sworn: !!row\.allegiance \}\)/g) ?? []).length;
    check("every row-backed sanitize passes the row's facts",
      calls > 0 && calls === backed,
      `${calls} calls, ${backed} carrying facts`);
  }
  check("the weapon finish is a persisted slot",
    /weapon:\s*\{\s*field:\s*"weapon"/.test(catalogue),
    "the 3.3 paid-finish revert defect stays fixed");
}

console.log(`\n[mark] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
