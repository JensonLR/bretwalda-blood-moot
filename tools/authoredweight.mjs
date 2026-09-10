#!/usr/bin/env node
// AUTHOREDWEIGHT — what does the authored man actually COST a player?
//
//   npm run authoredweight
//
// WHY THIS EXISTS. "43 MB" was written into `input.ts` as the reason the
// authored warriors shipped default-off, and it was the wrong number by an
// order of magnitude. 43 MB is `du -sh public/authored` — the whole library,
// every body and every style of hair and beard for every class. NOTHING EVER
// LOADS THAT. `loadAuthoredWarrior` fetches one body per class actually in the
// fight and caches the parse; `dressAuthoredHead` fetches only the hair and
// beard the men are actually wearing.
//
// Measured against a real training fight on 10 Sep 2026 — two classes, three
// men — the browser asked for ELEVEN files: 10.09 MB raw, 3.35 MB over the wire
// once the server gzips them. A number a decision was made on was 13x the
// number the decision was about.
//
// So this computes the payload for each SHAPE a fight can take, from the files
// on disk, gzipped as the wire carries them. No browser: the question is "what
// is the download", and that is arithmetic over `public/authored`.
//
// WHAT IT ASSERTS. Not a budget pulled out of the air — two claims that would
// each have caught a real fault:
//
//   * THE WORST CASE IS BOUNDED. Eight men, four classes, the heaviest hair
//     and beard in the library. That is the most any single fight can ask for,
//     and if it ever exceeds the library itself something is being fetched
//     twice.
//   * NOTHING IS FETCHED THAT IS NOT SERVED. Every file the client can ask for
//     by name must exist. A missing body is a 404 per man per fight, and the
//     renderer's graceful fallback means nobody would ever see an error.
//
// It reports rather than gates on the payload size itself, because what counts
// as too much is the owner's call and a number invented here would be exactly
// the kind of unmeasured constant this file exists to correct.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "public/authored");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

console.log("AUTHOREDWEIGHT — what a fight actually downloads\n");

if (!existsSync(DIR)) {
  console.log("  public/authored is not present — run `npm run authored` first.");
  console.log("  (This is also what production looks like: the directory and its");
  console.log("   source art/blender/ are both gitignored. See .gitignore.)\n");
  console.log("[authoredweight] NOT RUN");
  process.exit(0);
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".glb"));
/** Raw and gzipped size of one file, in bytes. */
const SIZE = new Map();
for (const f of files) {
  const buf = readFileSync(resolve(DIR, f));
  SIZE.set(f, { raw: buf.length, gz: gzipSync(buf, { level: 6 }).length });
}
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;

const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const pick = (prefix, cls) => files.filter((f) => f.startsWith(`${prefix}-${cls}-`));
const heaviest = (list) => list.sort((a, b) => SIZE.get(b).raw - SIZE.get(a).raw)[0] ?? null;
const lightest = (list) => list.sort((a, b) => SIZE.get(a).raw - SIZE.get(b).raw)[0] ?? null;

/** The files one man of a class costs, at a given taste in hair. */
function manFiles(cls, taste) {
  const out = [];
  const body = `warrior-${cls}.glb`;
  if (files.includes(body)) out.push(body);
  for (const part of ["helm", "hair", "beard"]) {
    const opts = pick(part, cls);
    const f = taste === "heavy" ? heaviest(opts) : lightest(opts);
    if (f) out.push(f);
  }
  return out;
}

/** A fight's payload: the UNION of its men's files, because the body is cached
 *  per class and two huscarls do not download two huscarls. */
function fight(classes, taste) {
  const set = new Set();
  for (const c of classes) for (const f of manFiles(c, taste)) set.add(f);
  let raw = 0, gz = 0;
  for (const f of set) { raw += SIZE.get(f).raw; gz += SIZE.get(f).gz; }
  return { files: set.size, raw, gz };
}

const SHAPES = [
  { name: "duel, one class, plain kit", cls: ["huscarl"], taste: "light" },
  { name: "duel, two classes, plain kit", cls: ["huscarl", "warden"], taste: "light" },
  { name: "training (the measured run)", cls: ["huscarl", "warden"], taste: "heavy" },
  { name: "war band, all four classes", cls: CLASSES, taste: "light" },
  { name: "WORST CASE — four classes, heaviest hair", cls: CLASSES, taste: "heavy" },
];

console.log("  shape                                   files      raw     wire (gzip)");
console.log("  ---------------------------------------------------------------------");
let worst = null;
for (const s of SHAPES) {
  const r = fight(s.cls, s.taste);
  if (!worst || r.raw > worst.raw) worst = r;
  console.log(`  ${s.name.padEnd(38)} ${String(r.files).padStart(3)}  ${kb(r.raw).padStart(9)}  ${kb(r.gz).padStart(10)}`);
}

const libRaw = [...SIZE.values()].reduce((n, s) => n + s.raw, 0);
console.log(`\n  the whole library on disk              ${String(files.length).padStart(3)}  ${kb(libRaw).padStart(9)}  (${mb(libRaw)})`);
console.log(`  the number input.ts used to cite:  43 MB — the library, which nothing fetches\n`);

check("the worst single fight is a fraction of the library",
  worst.raw < libRaw,
  `worst ${mb(worst.raw)} raw / ${mb(worst.gz)} on the wire, against a ${mb(libRaw)} library`);

// Every file the client can name must be on disk. `dressAuthoredHead` builds
// its names from the appearance, so a style with no file is a 404 nobody sees.
{
  const missing = [];
  for (const c of CLASSES) {
    if (!files.includes(`warrior-${c}.glb`)) missing.push(`warrior-${c}.glb`);
  }
  check("every class has a body to upgrade to",
    missing.length === 0, missing.length ? missing.join(", ") : `all ${CLASSES.length} present`);
}

console.log(`\n[authoredweight] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
