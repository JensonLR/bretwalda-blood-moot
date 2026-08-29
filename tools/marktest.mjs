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
import { MARKS, MARK_FACTS, markOf, markEarned, earnedMark, markHint, markWon, heraldMarks } from "../src/game/marks.mjs";

let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

console.log("[mark] the devices, headless\n");

// ---- the set itself ----
check("the design system's full glyph set — 24 marks, unmarked first", MARKS.length === 24 && MARKS[0].id === "none",
  MARKS.map((m) => m.id).join(","));
check("ids are unique", new Set(MARKS.map((m) => m.id)).size === MARKS.length);
check("every mark is sourced or confessed",
  MARKS.every((m) => m.source.length > 20),
  "the design system's own law: a real find, or labelled an invention");
check("the invented devices say so out loud",
  MARKS.filter((m) => /invention|ours/i.test(m.source)).length === 2
    && /invention/i.test(markOf("wyrmknot").source)
    && /ours/i.test(markOf("crown").source)
    && MARKS.every((m) => /invention|ours|find|stone|chronicle|grave|amulet|knife|kells|metalwork|county|york|shield|bracteate|forth/i.test(m.source)),
  "the wyrm-knot and the crown; all twenty-two others name a find");
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
// Raised with the set: the longship asks 40 wins, and a "veteran" who owns
// everything has to actually clear the top rung of every ladder.
const veteran = { level: 25, wins: 45, matches: 60, sworn: true, crowned: true };
check("the facts a rule may read are the five the profile has",
  MARK_FACTS.join(",") === "level,wins,matches,sworn,crowned");
check("every rule reads a real fact",
  MARKS.every((m) => m.how === "free" || MARK_FACTS.includes(m.how)));
check("a fresh warrior owns exactly the free marks",
  MARKS.filter((m) => markEarned(m, fresh)).every((m) => m.how === "free")
    && MARKS.filter((m) => m.how === "free").length === 5,
  "none, boss, seax, comb, spear — the shield boss, the knife that names the people, and the two things every man owned");
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
    m.how === "sworn" ? /kingdom/i.test(markHint(m))
      : m.how === "crowned" ? /bretwalda/i.test(markHint(m))
        : markHint(m).includes(String(m.need))));
check("free marks claim themselves", MARKS.filter((m) => m.how === "free").every((m) => /yours/i.test(markHint(m))));

// ---- WHAT AN EARNED TILE SAYS — the owner's fifth report ----
// "There's no ... ability to see why or how you got it once unlocked." The
// past-tense line is the answer, and the danger in having two lines for one
// rule is that they drift, so these hold them together rather than restating
// either.
check("every gated mark says what it cost, in the past tense",
  MARKS.filter((m) => m.how !== "free").every((m) =>
    m.how === "sworn" ? /kingdom/i.test(markWon(m))
      : m.how === "crowned" ? /bretwalda/i.test(markWon(m))
        : markWon(m).includes(String(m.need))));
check("the two lines never disagree about the bar",
  // Same threshold in both, and never the same sentence: a hint that reads as
  // a boast, or a boast that still reads as an instruction, is the drift.
  MARKS.every((m) => markWon(m).length > 0 && markWon(m) !== markHint(m)));
check("no earned line still gives an order",
  // "Reach level 5" on a mark you are wearing is the defect this whole line
  // exists to remove. Every imperative the hints use, banned from the boasts.
  MARKS.every((m) => !/^(Reach|Win|Fight|Swear|Be)\b/.test(markWon(m))));

// ---- WHO GETS TOLD — the other half of the same report ----
{
  const none = { level: 1, wins: 0, matches: 0 };
  const mid = { level: 12, wins: 6, matches: 30, sworn: true };
  const primed = heraldMarks(undefined, mid);
  check("a first run announces nothing and records everything",
    primed.fresh.length === 0 && primed.seen.length > 0,
    `${primed.seen.length} marks written down, ${primed.fresh.length} announced`);
  check("a free mark is never announced",
    heraldMarks([], none).seen.length === 0 && heraldMarks([], none).fresh.length === 0,
    "four marks are yours on the first frame; none of them is news");
  const idle = heraldMarks(primed.seen, mid);
  check("an idle screen never writes",
    idle.seen === primed.seen && idle.fresh.length === 0,
    "the record comes back by identity, so the caller can skip the save");
  const won = heraldMarks(primed.seen, { ...mid, wins: 25 });
  check("crossing a bar announces exactly what was crossed",
    won.fresh.includes("ravenbanner") && won.fresh.every((id) => !primed.seen.includes(id))
      && won.seen.length === primed.seen.length + won.fresh.length,
    `25 wins announced ${won.fresh.join(", ")}`);
  check("what was announced is never announced twice",
    heraldMarks(won.seen, { ...mid, wins: 25 }).fresh.length === 0);
  check("a bar that falls back does not un-announce",
    // Levels do not fall, but a server answer can arrive stale and a profile
    // can be restored mid-season. A mark once told stays told.
    heraldMarks(won.seen, none).seen === won.seen);
}

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
  const page = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");
  check("the record screen actually heralds",
    /heraldMarks\(p\.seenMarks,/.test(page) && /seenMarks: seen/.test(page),
    "the effect reads the record and writes it back");
  check("the herald's no-op guard is identity and not length",
    // Length would write the profile on every render that earned nothing new,
    // and the profile mirror writes localStorage on every change.
    /if \(seen === p\.seenMarks\) return;/.test(page));
  check("a pressed mark shows its line rather than a tooltip",
    /markWon\(markOf\(markPeek\)\)/.test(page) && /setMarkPeek\(/.test(page)
      && !/title=\{`\$\{m\.name\} — \$\{m\.source\}`\}/.test(page),
    "the title attribute no phone can show is gone, the line under the grid is not");
  check("a locked tile can still be asked a question",
    // `disabled` on a locked tile is what made the provenance unreachable.
    // `pickMark` refuses an unearned id on its own, so nothing needs it.
    !/onClick=\{\(\) => pickMark\(m\.id\)\} disabled=\{!earned\}/.test(page),
    "locked tiles are pressable and still unpickable");
  check("the weapon finish is a persisted slot",
    /weapon:\s*\{\s*field:\s*"weapon"/.test(catalogue),
    "the 3.3 paid-finish revert defect stays fixed");
}

console.log(`\n[mark] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
