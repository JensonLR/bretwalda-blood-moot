#!/usr/bin/env node
/**
 * leversweep — PROCESS.md R1 and R3, mechanised, for the weight wave.
 *
 *   node tools/leversweep.mjs
 *
 * R1 says: change the constant you believe controls the number, BY A LOT, and
 * check the number MOVES. R3 says an adversary must try to pass the gate
 * WITHOUT the fix. Both of those are usually done by hand and are therefore
 * usually not done at all — this repository has ELEVEN recorded instances of a
 * measurement answering the wrong question, and instance eleven
 * (`THREE.Color.lerp` mixing in linear space) was a number that moved to a
 * place where the feature did nothing.
 *
 * So this breaks each of the wave's constants in turn, in the real
 * `engine.mjs`, re-runs `tools/weightprobe.mjs`, and prints WHICH GATES WENT
 * RED. A lever that breaks nothing is a lever no gate is pointed at, and the
 * gate is the thing that is wrong.
 *
 * It restores the file after every lever, including on a crash. Nothing here is
 * committed and nothing here runs in CI: it is a proof, run once, and the
 * output belongs in the commit message.
 */
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = resolve(ROOT, "src/game/engine.mjs");
const BACKUP = resolve(ROOT, "src/game/.engine.leversweep.bak");

/** [what it is, the exact text to break, what to break it to, which gates SHOULD go red] */
const LEVERS = [
  ["KNOCKBACK.heavy — how far a heavy throws him", "  heavy: 0.95,", "  heavy: 0.05,", "the impact gates"],
  ["KNOCKBACK.light — how far a light throws him", "  light: 0.42,", "  light: 0.02,", "the light impact gate"],
  ["KNOCKBACK.blocked_heavy — the shield's share", "  blocked_heavy: 0.30,", "  blocked_heavy: 2.50,", "the shield gate"],
  ["BALANCE.shove — the poise a shove takes", "  shove: 46,", "  shove: 1,", "every knockdown gate"],
  ["BALANCE.offGuard — the caught-off-guard multiplier", "  offGuard: 2.0,", "  offGuard: 1.0,", "every knockdown gate"],
  ["KNOCKDOWN.rise — the get-up", "  rise: 0.55,", "  rise: 0.01,", "the get-up gate"],
  ["KNOCKDOWN.down — how long he is flat", "  down: 0.75,", "  down: 0.05,", "the time-on-the-floor gate"],
  ["HEAVY_CLEAN_STAGGER — a clean heavy rocking him", "const HEAVY_CLEAN_STAGGER = 0.30;", "const HEAVY_CLEAN_STAGGER = 0.0;", "the stagger-vs-knockdown gate"],
  ["RIPOSTE.bonus — the extra damage", "  bonus: 1.6,", "  bonus: 1.0,", "the riposte bonus gate"],
  ["RIPOSTE.window — how long the opening lasts", "  window: 0.90,", "  window: 0.05,", "the riposte window gates"],
  ["PARRY_WINDOW — the input the defender must hit", "const PARRY_WINDOW = 0.15;", "const PARRY_WINDOW = 0.04;", "the parry window width gate"],
  ["SWING_PHASES.windup — the telegraph", "export const SWING_PHASES = { windup: 0.40, contact: 0.15, recovery: 0.45 };",
    "export const SWING_PHASES = { windup: 0.05, contact: 0.15, recovery: 0.80 };", "the telegraph gates"],
];

copyFileSync(ENGINE, BACKUP);
const restore = () => { copyFileSync(BACKUP, ENGINE); };
process.on("exit", () => { try { restore(); unlinkSync(BACKUP); } catch { /* gone */ } });

/** The gates that are red right now, by name. */
function redGates() {
  let out = "";
  try {
    out = execFileSync("node", [resolve(ROOT, "tools/weightprobe.mjs"), "--report"],
      { cwd: ROOT, encoding: "utf8", timeout: 600000 });
  } catch (e) { out = String(e.stdout || "") + String(e.stderr || ""); }
  return out.split("\n").filter((l) => l.trim().startsWith("FAIL")).map((l) => l.trim().replace(/^FAIL\s+/, ""));
}

const base = redGates();
console.log(`\n[leversweep] baseline: ${base.length} gate(s) red — ${base.length ? base.join("; ") : "none, as it should be"}\n`);

let inert = 0;
for (const [name, from, to, expect] of LEVERS) {
  const src = readFileSync(BACKUP, "utf8");
  if (src.split(from).length - 1 !== 1) {
    console.log(`  SKIP  ${name} — "${from}" is not in engine.mjs exactly once. THE LEVER MOVED; fix this file.`);
    inert++;
    continue;
  }
  writeFileSync(ENGINE, src.replace(from, to));
  const red = redGates().filter((g) => !base.includes(g));
  restore();
  if (red.length === 0) {
    console.log(`  INERT ${name}\n          broke it and NOTHING went red. Expected ${expect}.`);
    inert++;
  } else {
    console.log(`  MOVED ${name}\n          ${red.length} gate(s) went red:`);
    for (const g of red) console.log(`            - ${g}`);
  }
}

console.log(`\n[leversweep] ${LEVERS.length - inert}/${LEVERS.length} levers moved a gate.`);
if (inert) { console.log("An INERT lever means a constant nothing measures. That is the defect, not the lever."); process.exit(1); }
