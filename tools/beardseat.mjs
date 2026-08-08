#!/usr/bin/env node
// The fast half of the beard gate, so the loop is seconds rather than a minute.
// Same arithmetic as `wearmeasure` section 5; see the note there.
//
//   node tools/beardseat.mjs
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".beardseat");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
spawnSync("npx", ["tsc", "src/game/client/characters.ts", "--outDir", ".beardseat",
  "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(d, e.name)) : e.name === "characters.js" && found.push(resolve(d, e.name)); };
walk(OUT);
if (!found[0]) { console.error("[seat] tsc emitted nothing"); process.exit(2); }
const { beardSeatProbe, BEARD_VALUES } = await import(pathToFileURL(found[0]).href);

const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
// Two millimetres on both penetration columns, and the number is a tessellation
// chord: the radial fields read a faceted shell at its facets, so a surface that
// is exactly touched reads a little way inside. Anything past that is hair
// growing through a hard thing.
const BAR = 2;
let bad = 0;
console.log("");
console.log("[seat] cls          beard      pieces   through mm   into neck mm   over mm   fall mm");
for (const cls of CLASSES) {
  for (const b of BEARD_VALUES) {
    if (b === "none") continue;
    const r = beardSeatProbe(cls, 13, b);
    const fail = r.pieces !== 1 || r.throughMm > BAR || r.intoNeckMm > BAR;
    if (fail) bad++;
    console.log(`[seat] ${cls.padEnd(12)} ${b.padEnd(9)} ${String(r.pieces).padStart(6)}   ` +
      `${r.throughMm.toFixed(1).padStart(10)}   ${r.intoNeckMm.toFixed(1).padStart(12)}   ` +
      `${r.overMm.toFixed(1).padStart(7)}   ${r.fallMm.toFixed(0).padStart(7)}   ${fail ? "<-- FAIL" : ""}`);
    if (r.throughMm > BAR) console.log(`[seat]      through the garment: ${r.worst}`);
    if (r.intoNeckMm > BAR) console.log(`[seat]      through the neck   : ${r.neckWorst}`);
  }
}
console.log("");
console.log(`[seat] bars: one connected component, at most ${BAR} mm into the garment, at most ${BAR} mm into the neck`);
console.log(`[seat] ${bad ? `FAIL: ${bad} rung(s)` : "PASS"}`);
process.exit(bad ? 1 : 0);
