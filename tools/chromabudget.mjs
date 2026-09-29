#!/usr/bin/env node
// ============================================================
// CHROMABUDGET — is every colour a man WEARS inside the chroma budget, as authored?
//
//   node tools/chromabudget.mjs               THE GATE. CPU, about ten seconds, no browser, no light.
//   node tools/chromabudget.mjs --budget=20   R1: pull the lever. The gate must move (more rows fail).
//   node tools/chromabudget.mjs --all         print every cell, not only the ones over the bar
//
// ------------------------------------------------------------
// WHERE THE NUMBER COMES FROM — docs, not this file
//
// LORE 7.0, and `CHAR-PLAN` 1.0 rule 4 restates it as a law: "worn cloth, leather and skin at or under C* 35 as
// authored albedo AND as rendered under the dusk grade; metals to C* 50 only for gilt; blood C* 63-74 and fire
// C* 55+ are the only heat. Team fields (`TEAM_FIELD`) are the documented exemption." The reason is arithmetic
// and it is the game's own: blood is C* 63 (`bloodFresh #8e1208`) and C* 74 (`bloodArterial #b4200c`), and the
// four things that were closest to it were the Blood Red Cloak (C* 45), the team madder (C* 53), the Gilded War
// Cloak (C* 51) and Bretwalda Gold mail (C* 47). There is a 10-20 point gap between "the world" and "blood",
// and every worn colour that climbs into it costs the one thing the arena is allowed to be hot with.
//
// Real as-worn dyed wool is C* 15-42 (LORE 7.1): dyes were dulled by light and soil, and the arena has a fire
// grade on top. Faded is the historical fact, not a stylistic choice.
//
// ------------------------------------------------------------
// WHAT IT WALKS, AND EVERY ONE IS READ OUT OF THE CLIENT'S OWN TABLES (nothing here keeps a copy)
//
//   1. FINISH_KIT   the seven rows x mail, tunic, trouser, wrap, hide, buff. Gated at the budget. The `fitting`
//                   column is METAL and is gated at 50 (gilt), because a fitting is cast, not dyed.
//   2. CLOAK_COLORS the four cloaks a man can buy. Gated.
//   3. CLASS_TUNIC  the four per-class accents, AND what each becomes on the man: `tunicDye(kit.tunic, accent)`
//                   over the seven rows, which is the tunic he is actually seen in (a saturated accent scales
//                   the dye lot's chroma UP, so a row can be in budget and its worn tunic not).
//   4. FACTION      what each of the four peoples' vats hands back: `kitFor(kit, "none", people)` over the seven
//                   rows and six dyed surfaces, plus the shirt, the pelt and the hood through `wornBy`.
//   5. THE WHOLE CHAIN, ON THE MAN: every (class x finish x cloak) as `wornColours` resolves it for the unsworn
//                   and for each people, i.e. the colours the procedural AND the authored man are dressed in.
//
// NOT GATED, AND SAID ON THE VERDICT LINE (docs/PROCESS.md R4):
//   * `TEAM_FIELD` and everything a team re-dyes: the documented exemption (FACTIONS.md §8, legibility outranks
//     accuracy). Printed with its numbers so nobody has to take the exemption on trust.
//   * A PEOPLE'S FLAT CLOAK AND BOARD FIELD (`cloakFor(.., people)`, `shieldBoard(.., people)`): these are the
//     map's four tokens (`--gilt --garnet --moss --woad`) brought under a brightness ceiling, hue and chroma
//     untouched, and they are over the budget by construction. They are reported, with the four numbers.
//   * SKIN. `SKIN_TONES` is U5's and a `skin` row is never edited here; skin's C* budget is `facecontrast`'s.
//   * THE GRADE. There is no light in this file. "As rendered under the dusk grade" is U9's (stage 6, owner-gated).
//
// ------------------------------------------------------------
// PROOF OF FAILURE (docs/PROCESS.md R2)
//
// On HEAD (ce2c5a0) this is red on the four rows the plan names: the Blood Red Cloak C* 45.0, the Gilded War
// Cloak C* 51.3, Bretwalda Gold mail C* 46.7 and Madder and Brass mail C* 38.0 - and on the worn tunics and kit
// cells the plan did not enumerate because it measured the mail column and the cloaks only. The bar is the
// docs', not the ruler-writer's: `--budget=` exists so R1 can be pulled, and a claim below asks the gate
// whether it can tell a row at C* 45 from one at C* 20.
// ============================================================
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rmSync } from "node:fs";
import { loadClient } from "./lib/clientmodule.mjs";
import { labOf, chromaOf, hueOfLab } from "./lib/roseband.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? Number(a.slice(n.length + 3)) : d; };
const BUDGET = val("budget", 35);
/** Gilt is the one warm metal allowed above the cloth budget (LORE 7.0). */
const METAL_BUDGET = val("metal", 50);
const ALL = flag("all");
const T0 = Date.now();

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};
const note = (s) => console.log(`        ${s}`);
const hex6 = (h) => `#${h.toString(16).padStart(6, "0")}`;

const { CH, ANIM, work } = await loadClient(ROOT, ".chromabudget");
const {
  ARMOURY, FINISH_KIT, CLOAK_COLORS, tunicDye, finishKit, kitFor, cloakFor, wornBy, shieldBoard, defaultAppearance,
  PEOPLE_IDS, TEAM_FIELD, wornColours,
} = CH;
const CLASS_TUNIC = ANIM?.CLASS_TUNIC;
for (const [n, v] of Object.entries({ FINISH_KIT, CLOAK_COLORS, tunicDye, finishKit, kitFor, cloakFor, wornBy })) {
  if (!v) { console.error(`[chromabudget] characters.ts does not export ${n} — the table this ruler must not copy`); rmSync(work, { recursive: true, force: true }); process.exit(2); }
}
if (!CLASS_TUNIC) { console.error("[chromabudget] render/anim.ts does not export CLASS_TUNIC"); rmSync(work, { recursive: true, force: true }); process.exit(2); }

const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const FINISHES = ARMOURY.find((s) => s.slot === "armor").options.map((o) => ({ label: o.label, value: Number(o.value), cost: o.cost }));
const CLOAKS = ARMOURY.find((s) => s.slot === "cloak").options.map((o) => ({ label: o.label, value: String(o.value), cost: o.cost }));
const CLOTH = ["mail", "tunic", "trouser", "wrap", "hide", "buff"];

/** THE PREDICATE, once. Every claim and the self-test below ask it, so the gate cannot disagree with its own control. */
const isOver = (r) => r.C > r.budget + 1e-9;
/** ONLY what is gated. A `reported` cell is printed and counted on the verdict line and never fails the run. */
const gated = (r) => r.kind !== "reported";
/** One cell: where it came from, its colour, and what the budget says. */
const mk = (group, where, hex, budget = BUDGET, kind = "worn") => {
  const L = labOf(hex);
  return { group, where, hex, L: L[0], C: chromaOf(L), h: hueOfLab(L), budget, kind };
};
const rows = [];
const cell = (...a) => rows.push(mk(...a));

// 1. FINISH_KIT ------------------------------------------------------------
for (const f of FINISHES) {
  const kit = finishKit(f.value);
  for (const k of CLOTH) cell("FINISH_KIT", `${f.label} ${k}`, kit[k]);
  cell("FINISH_KIT", `${f.label} fitting (metal)`, kit.fitting, METAL_BUDGET, "metal");
}
// 2. CLOAK_COLORS ----------------------------------------------------------
for (const c of CLOAKS) {
  if (c.value === "none") continue;
  cell("CLOAK_COLORS", `${c.label} (${c.value})`, CLOAK_COLORS[c.value]);
}
// 3. CLASS_TUNIC, raw and as worn ------------------------------------------
for (const cls of CLASSES) {
  cell("CLASS_TUNIC", `${cls} accent`, CLASS_TUNIC[cls]);
  for (const f of FINISHES) cell("TUNIC AS WORN", `${cls} in ${f.label}`, tunicDye(finishKit(f.value).tunic, CLASS_TUNIC[cls]));
}
// 4. the peoples' vats -----------------------------------------------------
const VAT_ROWS = [];
for (const people of PEOPLE_IDS) {
  for (const f of FINISHES) {
    const dyed = kitFor(finishKit(f.value), "none", people);
    for (const k of CLOTH) cell("FACTION VAT", `${people} ${f.label} ${k}`, dyed[k], BUDGET, "reported");
  }
  for (const [what, hex, kind] of [["linen shirt", 0xc2b69c, "linen"], ["pelt", 0x8a7050, "leather"], ["hood", 0x2a2521, "cloth"]]) {
    cell("FACTION VAT", `${people} ${what}`, wornBy(hex, "none", people, kind), BUDGET, "reported");
  }
  VAT_ROWS.push(people);
}
// 5. the whole chain, on the man (skipped quietly if the shared function is not there yet: HEAD) -----
if (typeof wornColours === "function") {
  for (const cls of CLASSES) for (const f of FINISHES) for (const c of CLOAKS) for (const people of ["none", ...PEOPLE_IDS]) {
    const w = wornColours({ ...defaultAppearance(cls), armorColor: f.value, cloak: c.value }, CLASS_TUNIC[cls], "none", people);
    const kind = people === "none" ? "worn" : "reported";
    for (const k of ["tunic", "linen", "pelt", "hood"]) cell("ON THE MAN", `${cls}/${f.label}/${c.label}/${people} ${k}`, w[k], BUDGET, kind);
    if (c.value !== "none") cell("ON THE MAN", `${cls}/${f.label}/${c.label}/${people} cloak`, w.cloak, BUDGET, kind);
  }
}

// the exempt and the reported ------------------------------------------------
const exempt = [];
for (const side of ["red", "blue"]) {
  const L = labOf(TEAM_FIELD[side]);
  exempt.push({ what: `TEAM_FIELD.${side}`, hex: TEAM_FIELD[side], L: L[0], C: chromaOf(L) });
}
const fields = [];
for (const people of PEOPLE_IDS) {
  const cl = cloakFor(CLOAK_COLORS.red, "none", people);
  const bd = shieldBoard({ ...defaultAppearance("huscarl"), cloak: "none" }, "none", people);
  for (const [what, hex] of [[`${people} flat cloak field`, cl], [`${people} board field`, bd]]) {
    const L = labOf(hex);
    fields.push({ what, hex, L: L[0], C: chromaOf(L) });
  }
}

// ---------------------------------------------------------------------------
console.log(`\n[chromabudget] worn cloth and leather at C* ${BUDGET} or under; cast metal at ${METAL_BUDGET}; team fields exempt (LORE 7.0)\n`);
const groups = [...new Set(rows.map((r) => r.group))];
for (const g of groups) {
  const mine = rows.filter((r) => r.group === g);
  const over = mine.filter(isOver);
  const tag = mine.every((r) => r.kind === "reported") ? "  (REPORTED, not gated)" : mine.some((r) => r.kind === "reported") ? "  (people-sworn cells REPORTED, not gated)" : "";
  console.log(`  ${g.padEnd(14)} ${String(mine.length).padStart(4)} cells, ${String(over.length).padStart(3)} over${over.length ? ` (worst C* ${Math.max(...over.map((r) => r.C)).toFixed(1)}, ${over.sort((a, b) => b.C - a.C)[0].where})` : ""}${tag}`);
}
console.log("");
const bad = rows.filter(isOver).sort((a, b) => b.C - a.C);
const shownBad = ALL ? rows : bad;
const seen = new Set();
for (const r of shownBad) {
  const key = `${r.group}|${r.where}`;
  if (seen.has(key)) continue;
  seen.add(key);
  if (!ALL && seen.size > 40) { note(`... and ${bad.length - 40} more over the bar (--all prints every cell)`); break; }
  console.log(`  ${(isOver(r) ? (gated(r) ? "OVER " : "over ") : "     ")}${r.group.padEnd(13)} ${r.where.padEnd(52)} ${hex6(r.hex)}  L* ${r.L.toFixed(1).padStart(5)}  C* ${r.C.toFixed(1).padStart(5)}  h ${((r.h + 360) % 360).toFixed(0).padStart(3)}`);
}

console.log("\n  the exemption, named and measured (not gated):");
for (const e of exempt) console.log(`        ${e.what.padEnd(20)} ${hex6(e.hex)}  L* ${e.L.toFixed(1)}  C* ${e.C.toFixed(1)}   TEAM_FIELD: legibility outranks accuracy (FACTIONS.md §8)`);
console.log("  the four peoples' flat fields (map tokens under a brightness ceiling, REPORTED not gated):");
for (const f of fields) console.log(`        ${f.what.padEnd(26)} ${hex6(f.hex)}  L* ${f.L.toFixed(1)}  C* ${f.C.toFixed(1)}`);

// ---------------------------------------------------------------------------
console.log("\n[chromabudget] === THE CLAIMS ===\n");
const failingRows = (g) => rows.filter((r) => r.group === g && gated(r) && isOver(r));
const reportedRows = () => rows.filter((r) => !gated(r) && isOver(r));
const named = (g) => { const b = failingRows(g).sort((a, c) => c.C - a.C); return b.length ? `${b.length} over; worst ${b[0].where} at C* ${b[0].C.toFixed(1)}` : `0 of ${rows.filter((r) => r.group === g && gated(r)).length} over`; };
check("FINISH_KIT: no worn cloth, leather or mail cell over the budget, no fitting over the metal bar", failingRows("FINISH_KIT").length === 0, named("FINISH_KIT"));
check("CLOAK_COLORS: no cloak over the budget", failingRows("CLOAK_COLORS").length === 0, named("CLOAK_COLORS"));
check("CLASS_TUNIC: no accent over the budget", failingRows("CLASS_TUNIC").length === 0, named("CLASS_TUNIC"));
check("the tunic AS WORN (tunicDye over every finish x class) is inside the budget", failingRows("TUNIC AS WORN").length === 0, named("TUNIC AS WORN"));
if (rows.some((r) => r.group === "ON THE MAN")) check("the whole chain, on the man as he is issued and as he buys (class x finish x cloak, unsworn): inside the budget", failingRows("ON THE MAN").length === 0, named("ON THE MAN"));

// A ruler that has only ever been seen green is not a ruler (R2), and one that cannot tell 45 from 17 is not either.
// Two KNOWN colours go through the very predicate the walk used, and the lever (R1) is pulled on the real rows:
// halving the budget must fail MORE cells, or the bar is not what decides the verdict.
{
  const hot = mk("selftest", "Blood Red Cloak as it was (0x7a2020)", 0x7a2020), calm = mk("selftest", "the issued tunic (0x6a5b42)", 0x6a5b42);
  check("the predicate tells a row at C* 45 from one at C* 17 at the bar it is holding",
    isOver(hot) === (hot.C > BUDGET) && isOver(calm) === (calm.C > BUDGET) && (BUDGET < 45 ? isOver(hot) : true) && (BUDGET > 17 ? !isOver(calm) : true),
    `0x7a2020 is C* ${hot.C.toFixed(1)}, 0x6a5b42 is C* ${calm.C.toFixed(1)}, bar ${BUDGET}`);
  const at = (b) => rows.filter((r) => gated(r) && r.kind === "worn" && r.C > b + 1e-9).length;
  check("R1: the lever moves the count (a bar of 20 fails more worn cells than a bar of 35)", at(20) > at(35), `${at(20)} over at C* 20, ${at(35)} over at C* 35, ${at(50)} at C* 50`);
  const lo = rows.filter((r) => r.group === "FINISH_KIT").length;
  check("the walk reached every table it claims to (7 finishes x 7 columns, 4 cloaks, 4 accents)",
    lo === 7 * 7 && rows.filter((r) => r.group === "CLOAK_COLORS").length === 4 && rows.filter((r) => r.group === "CLASS_TUNIC").length === 4,
    `${lo} finish cells, ${rows.filter((r) => r.group === "CLOAK_COLORS").length} cloaks, ${rows.filter((r) => r.group === "CLASS_TUNIC").length} accents`);
}

const vatOver = reportedRows();
const vatAll = rows.filter((r) => !gated(r));
const deferrals = [
  `${vatOver.length} of ${vatAll.length} cells the four peoples' vats and liveries hand back are over the bar (worst C* ${vatOver.length ? Math.max(...vatOver.map((r) => r.C)).toFixed(0) : 0}) and are REPORTED, NOT GATED: re-grading them costs \`factionread\` §1's chroma-plane distance, which is red on HEAD by its own admission`,
  `TEAM_FIELD (C* ${exempt.map((e) => e.C.toFixed(0)).join("/")}) is exempt by the docs and a team's re-dye is not gated here`,
  `the four peoples' flat cloak/board fields are C* ${Math.min(...fields.map((f) => f.C)).toFixed(0)}-${Math.max(...fields.map((f) => f.C)).toFixed(0)} map tokens and are REPORTED, not gated, not re-graded`,
  "skin is U5's",
  "no light, no grade: albedo only (as rendered under the dusk grade is U9's)",
  ...(typeof wornColours === "function" ? [] : ["THE WHOLE-CHAIN WALK DID NOT RUN: this tree has no `wornColours` (the one function the procedural and the authored man are both dressed by)"]),
];
rmSync(work, { recursive: true, force: true });
console.log(`\n[chromabudget] ${pass} passed, ${fail} failed — WITH ${deferrals.length} deferrals: ${deferrals.join("; ")}.`);
console.log(`[chromabudget] ${fail === 0 ? "PASS" : "FAIL"} in ${((Date.now() - T0) / 1000).toFixed(0)}s`);
process.exit(fail ? 1 : 0);
