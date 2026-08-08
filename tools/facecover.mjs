#!/usr/bin/env node
// ============================================================
// FACECOVER — no helm may swing across the face as the man turns.
//
//   node tools/facecover.mjs            (or: npm run facecover)
//   node tools/facecover.mjs --cls huscarl
//
// The owner, from the live armoury: a hard vertical seam down the face, one
// side skin and the other blue-grey steel. It is the aventail — a broad flat
// fall that hangs beside the cheekbone instead of behind the jaw, and swings
// across the face at the three-quarter bearing the shop photographs from.
//
// WHAT IS MEASURED, and it took three tries to find a question that works:
//
//   Not the PART. A coif rides the head, so `rig:head` carries the skin, the
//   mask, the mail and the gold alike and there is no boundary to draw on.
//   Not the AMOUNT. A mask is supposed to take the whole face; a bar on the
//   amount fails the Sutton Hoo for being a Sutton Hoo.
//   THE SPREAD, on the FACE PROPER. `facelook --cover` renders the head twice
//   at each bearing, bare and helmed, and counts the face skin that went — face
//   meaning below the brow, because a helm is entitled to the scalp and counting
//   it made every helmet fail for being a helmet.
//
// A mask takes the face from EVERY bearing and is flat. A bowl takes little
// from any and is flat. Only a FALL is low from the front and high from the
// side, so the spread is the defect and the amount is not:
//
//     iron       0.5  1.9  2.3   spread  1.8   a bowl
//     nasal      6.2  5.9  6.2   spread  0.3   a bar
//     spectacle 29.5 28.3 28.8   spread  1.2   brow and short cheeks
//     suttonhoo 90.3 94.9 95.1   spread  4.8   a mask, and that is the product
//     wyrm      29.4 51.1 54.2   spread 24.8   <-- a deep cheek that swings
//     hood       3.7 31.7 35.1   spread 31.4   <-- a fall that swings
// ============================================================
import { spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const CLASSES = flag("cls", "") ? [flag("cls")] : ["huscarl", "warden", "runekeeper", "berserker"];
const HELMS = ["none", "iron", "nasal", "ridge", "spectacle", "boar", "crowned", "wyrm", "suttonhoo", "hood"];
const TURNS = "0,-35,35";

/**
 * Ten points of spread.
 *
 * Every helm that is not a fall measures under 5 — the widest is the Sutton
 * Hoo at 4.8, and a mask has the most excuse to vary because it covers nearly
 * everything from every angle. The two that swing measure 24.8 and 31.4. The
 * bar sits in the gap, twice the worst honest reading and a third of the
 * mildest fault, so it is not a number tuned to today's geometry.
 */
const SPREAD_BAR = 10;

let bad = 0;
const rows = [];
for (const cls of CLASSES) {
  for (const helm of HELMS) {
    const dress = JSON.stringify({ helm, beardStyle: "none", hairStyle: "shaved", cloak: "none" });
    const r = spawnSync("node", ["tools/facelook.mjs", "--cls", cls, "--dress", dress,
      "--cover", "--turns", TURNS, "--out", `.facecover/${cls}-${helm}`], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) { console.log(`[cover] ${cls}/${helm}: render failed`); bad++; continue; }
    const pcts = [...(r.stdout || "").matchAll(/deg\s+([\d.]+)%/g)].map((m) => parseFloat(m[1]));
    if (pcts.length !== 3) { console.log(`[cover] ${cls}/${helm}: no reading`); bad++; continue; }
    const spread = Math.max(...pcts) - Math.min(...pcts);
    const fail = spread > SPREAD_BAR;
    if (fail) bad++;
    rows.push({ cls, helm, pcts, spread, fail });
  }
}

console.log("\n[cover] face skin taken by the helm, per bearing (0 / -35 / 35 deg)\n");
console.log("[cover] class        helm          0deg   -35deg    35deg    spread   verdict");
console.log("[cover] " + "-".repeat(74));
for (const r of rows) {
  console.log(`[cover] ${r.cls.padEnd(12)} ${r.helm.padEnd(11)}`
    + r.pcts.map((p) => `${p.toFixed(1)}%`.padStart(8)).join("")
    + `${r.spread.toFixed(1).padStart(9)}   ${r.fail ? "<-- SWINGS ACROSS THE FACE" : ""}`);
}
console.log("");
console.log(`[cover] bar: at most ${SPREAD_BAR} points of spread. A mask may take the whole face and a`);
console.log("[cover]      bowl none of it, but neither may CHANGE as the man turns — that is a fall.");
console.log(`[cover] ${bad ? `FAIL: ${bad} of ${rows.length}` : `PASS: ${rows.length}/${rows.length}`}`);
process.exit(bad ? 1 : 0);
