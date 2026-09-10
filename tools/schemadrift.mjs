#!/usr/bin/env node
// SCHEMADRIFT — does every index this project declares actually get created?
//
//   npm run schemadrift
//
// WHY THIS EXISTS. `war_ledger_season_people_idx` was declared in `schema.ts`
// with a twenty-line comment carrying its own measurement — "the plan moves from
// Parallel Seq Scan to Bitmap Index Scan and the query goes 71 ms -> 34.9 ms",
// on an endpoint the note itself calls "the one the map reads on every single
// visit". It had never existed in a database. Checked against production on
// 10 Sep 2026: five indexes on `war_ledger`, and that was not one of them.
//
// Nothing was broken and nothing failed. The index was written into the wrong
// file, and the two files look equally authoritative from the inside:
//
//   src/db/schema.ts    Drizzle table definitions. Here they generate TYPES.
//                       An `index()` call in this file creates nothing at all
//                       unless somebody also runs drizzle-kit, and this project
//                       does not — `drizzle.config.json` exists, the migration
//                       path does not run in production.
//   src/db/index.ts     `ensureSchema`, a list of CREATE ... IF NOT EXISTS
//                       statements executed at startup. THIS is the DDL.
//
// So a declaration in the first without a statement in the second is a
// performance fix that reads as done, reviews as done, and never runs. That is
// the repository's signature failure — the build is green and the output is
// wrong — and every other instance of it here got a ruler.
//
// WHAT IT CHECKS. Purely static: it reads both files and compares the two sets
// of index names. No database, no network, no build — so it belongs in the inner
// gate and costs nothing.
//
//   DECLARED BUT NEVER CREATED   an index in schema.ts with no CREATE in
//                                ensureSchema. This is the fault above, and it
//                                is the one that FAILS.
//   CREATED BUT NOT DECLARED     a CREATE with no declaration. REPORTED, not
//                                failed: `hearths_name_idx` is
//                                `UNIQUE (lower(name))` and
//                                `war_ledger_season_hearth_idx` is partial, and
//                                Drizzle 0.45.2 expresses neither cleanly. Both
//                                are deliberate and `schema.ts` says so in a
//                                comment. A gate that failed on them would be a
//                                gate somebody switches off.
//
// It cannot see whether a CREATE ever RAN against a given database — that is
// `ensureSchema`'s own business and its `IF NOT EXISTS` is the answer. What it
// can see, and what nobody could see before, is a fix written into a file that
// does not execute.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = resolve(ROOT, "src/db/schema.ts");
const DDL = resolve(ROOT, "src/db/index.ts");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

/**
 * Index names Drizzle declares. `index("x")` and `uniqueIndex("x")`.
 *
 * A regex and not a parse, deliberately: importing schema.ts would drag in the
 * whole client type graph for a question about two string sets, and this file
 * has to be cheap enough to run on every change.
 */
const declared = new Set(
  [...readFileSync(SCHEMA, "utf8").matchAll(/\b(?:unique)?[Ii]ndex\(\s*"([a-z0-9_]+)"\s*\)/g)].map((m) => m[1]),
);

/** Index names `ensureSchema` actually creates. */
const created = new Set(
  [...readFileSync(DDL, "utf8").matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)/gi)].map((m) => m[1]),
);

const uncreated = [...declared].filter((n) => !created.has(n)).sort();
const undeclared = [...created].filter((n) => !declared.has(n)).sort();

console.log("SCHEMADRIFT — what is declared against what is created\n");
console.log(`  schema.ts declares      ${declared.size} index(es)`);
console.log(`  ensureSchema creates    ${created.size} index(es)\n`);

if (undeclared.length) {
  console.log("  created but not declared in schema.ts — REPORTED, not failed:");
  for (const n of undeclared) console.log(`    ~ ${n}`);
  console.log("    (functional and partial indexes Drizzle 0.45.2 cannot express; deliberate)\n");
}

check("every index schema.ts declares is one ensureSchema actually creates",
  uncreated.length === 0,
  uncreated.length
    ? `${uncreated.length} declared and never created: ${uncreated.join(", ")} — schema.ts generates TYPES here, `
      + "so an index only in that file runs nowhere. Add the CREATE to ensureSchema."
    : `all ${declared.size} declared indexes have a CREATE in ensureSchema`);

// A second, cheaper claim that would have caught the same fault from the other
// side: ensureSchema must actually be the DDL, not a stub somebody emptied.
check("ensureSchema still carries the DDL",
  created.size >= declared.size && created.size > 8,
  `${created.size} CREATE INDEX statements`);

console.log(`\n[schemadrift] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
