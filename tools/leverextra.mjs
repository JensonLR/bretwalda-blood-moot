#!/usr/bin/env node
/**
 * leverextra — the R2 proof for the gates that guard a RULE rather than a
 * NUMBER. Run once, by hand, and delete nothing: the output belongs in a commit
 * message.
 *
 * `tools/leversweep.mjs` breaks constants. Three of `weightprobe`'s gates are
 * not about a constant at all — they are about who owns a riposte window, which
 * man it is written on, and whether a floored body still steers. A constant
 * sweep cannot see any of those, so they would have been gates nobody had ever
 * watched go red (PROCESS.md R2: a harness that has only ever been green has
 * never been tested).
 */
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from "fs";
import { execFileSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = resolve(ROOT, "src/game/engine.mjs");
const BACKUP = resolve(ROOT, "src/game/.engine.leverextra.bak");

const BREAKS = [
  ["the window is owned by nobody — any man may cash any parry",
    "      const isRiposte = target.vulnerableTimer > 0 && target.vulnerableTo === attacker.id;",
    "      const isRiposte = target.vulnerableTimer > 0;"],
  ["the window is written on the PARRIER instead of the man he read",
    "          attacker.vulnerableTimer = RIPOSTE.window;\n          attacker.vulnerableTo = target.id;",
    "          target.vulnerableTimer = RIPOSTE.window;\n          target.vulnerableTo = attacker.id;"],
  ["the floor no longer takes the legs",
    "      || player.state === \"staggered\" || player.state === \"shoving\" || isDown(player);",
    "      || player.state === \"staggered\" || player.state === \"shoving\";"],
];

copyFileSync(ENGINE, BACKUP);
const restore = () => copyFileSync(BACKUP, ENGINE);
process.on("exit", () => { try { restore(); unlinkSync(BACKUP); } catch { /* gone */ } });

function redGates() {
  let out = "";
  try {
    out = execFileSync("node", [resolve(ROOT, "tools/weightprobe.mjs"), "--report"],
      { cwd: ROOT, encoding: "utf8", timeout: 600000 });
  } catch (e) { out = String(e.stdout || "") + String(e.stderr || ""); }
  return out.split("\n").filter((l) => l.trim().startsWith("FAIL")).map((l) => l.trim().replace(/^FAIL\s+/, ""));
}

const base = redGates();
console.log(`\n[leverextra] baseline: ${base.length} red — ${base.length ? base.join("; ") : "none"}\n`);
let inert = 0;
for (const [name, from, to] of BREAKS) {
  const src = readFileSync(BACKUP, "utf8");
  if (src.split(from).length - 1 !== 1) { console.log(`  SKIP  ${name} — the line moved; fix this file.`); inert++; continue; }
  writeFileSync(ENGINE, src.replace(from, to));
  const red = redGates().filter((g) => !base.includes(g));
  restore();
  if (!red.length) { console.log(`  INERT ${name}\n          broke the RULE and nothing went red.`); inert++; }
  else { console.log(`  MOVED ${name}`); for (const g of red) console.log(`            - ${g}`); }
}
console.log(`\n[leverextra] ${BREAKS.length - inert}/${BREAKS.length} rules are actually gated.`);
if (inert) process.exit(1);
