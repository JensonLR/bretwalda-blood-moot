#!/usr/bin/env node
// ============================================================
// COSMETICTEST — grades the shop by measuring it.
//
//   npm run cosmetictest              # the gate: fast pass, ~minutes
//   npm run cosmetictest -- --all     # every slot at both distances
//
// SKELETON. Growing in place — see the header block below for the plan.
//
// No harness in this project has ever rendered a cosmetic and asserted
// anything. Every cosmetic defect found so far — seven helms sharing one bowl,
// four war paints identical under the Sutton Hoo mask, three beards that were
// one crescent, two paid colours that were literally the same colour — was
// found by eye, months late. Each of those is a test nobody wrote. This is that
// test.
//
// tools/soundtest.mjs is the house model: it grades something nobody can listen
// to by measuring it. This grades something nobody has time to look at, 47
// options across 8 slots, by measuring it.
// ============================================================
import { spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const T0 = Date.now();

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const ALL = has("all");

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// ------------------------------------------------------------
// FOLD-IN: wearmeasure. It already fails when geometry punches through skin
// over 32 heads, and a cosmetic that renders a hole in a helmet is a cosmetic
// defect whatever else this file measures.
// ------------------------------------------------------------
function runWearmeasure() {
  console.log("\n[cos] === WEAR (folded in from tools/wearmeasure.mjs) ===\n");
  const r = spawnSync("node", ["tools/wearmeasure.mjs"], { cwd: ROOT, encoding: "utf8" });
  const lines = (r.stdout || "").split("\n").filter(Boolean);
  const verdict = lines.filter((l) => /PASS:|FAIL /.test(l));
  for (const l of verdict) console.log(`  ${l}`);
  check("every helmet seats on the head without shearing it", r.status === 0,
    verdict[verdict.length - 1]?.replace(/^\[wear\] /, ""));
}

runWearmeasure();

console.log(`\n[cos] ${results.filter((r) => r.pass).length}/${results.length} checks passed`);
console.log(`[cos] wall clock ${((Date.now() - T0) / 1000).toFixed(1)} s${ALL ? " (--all)" : ""}`);
process.exit(results.some((r) => !r.pass) ? 1 : 0);
