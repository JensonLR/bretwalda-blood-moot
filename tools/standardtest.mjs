#!/usr/bin/env node
// STANDARDTEST — the standards table, held headless (Wave F, flags).
//
//   node tools/standardtest.mjs
//
// The devices a Hearth may fly are data in src/game/standards.mjs. This holds
// their shape: one list per kingdom, every device sourced or labelled, every
// id unique across all four, every drawing present, nothing under a refused
// name, and the narrowing that keeps a foreign device off a man. The database
// half — raising one over a real house — is warsay's, against Postgres.
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { STANDARDS, STANDARD_PEOPLES, TIERS, REFUSED, standardsFor, standardOf, narrowStandard } =
  await import(pathToFileURL(resolve(ROOT, "src/game/standards.mjs")).href);
let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};
console.log("[standard] the standards a hearth may fly, headless\n");
const all = STANDARD_PEOPLES.flatMap((p) => STANDARDS[p].map((s) => ({ ...s, people: p })));
check("four kingdoms, and every one has devices to choose from",
  STANDARD_PEOPLES.length === 4 && ["saxon", "norse", "briton", "pict"].every((p) => standardsFor(p).length >= 3),
  STANDARD_PEOPLES.map((p) => `${p} ${standardsFor(p).length}`).join(", "));
check("every device is sourced or labelled — a tier §9.0 names, in as many words",
  all.every((s) => TIERS[s.tier]), all.filter((s) => !TIERS[s.tier]).map((s) => s.id).join(", ") || "all tiered");
check("every device says WHERE it comes from", all.every((s) => typeof s.source === "string" && s.source.length > 40));
check("every device has a drawing", all.every((s) => typeof s.d === "string" && /^M/.test(s.d.trim())));
check("every id is unique across all four kingdoms — a standard can be named without its kingdom beside it",
  new Set(all.map((s) => s.id)).size === all.length);
check("nothing ships under a refused name — the grimoire designs and the appropriated symbols of §9.2",
  all.every((s) => !REFUSED.some((r) => s.id.includes(r) || s.name.toLowerCase().includes(r.replace("_", " ")))));
check("the Picts' set is the best-evidenced in the game — every one of theirs is a FIND",
  standardsFor("pict").every((s) => s.tier === "find") && standardsFor("pict").length >= 4);
check("the Raven is TEXT — the name is 878's own and the drawing is ours",
  standardOf("norse", "raven")?.tier === "text");
check("a foreign device is nobody's — the Saxons' seax is not a Pictish standard",
  standardOf("pict", "seax") === null && standardOf("saxon", "seax") !== null);
check("narrowing keeps a man's own kingdom's device and strips a foreign one to none",
  narrowStandard("saxon", "seax") === "seax" && narrowStandard("norse", "seax") === "none"
  && narrowStandard("none", "seax") === "none" && narrowStandard("saxon", undefined) === "none");
check("the unsworn may fly nothing", standardsFor("none").length === 0 && standardsFor(undefined).length === 0);
console.log(`\n[standard] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
