#!/usr/bin/env node
// ============================================================
// HEADMEASURE — the tape measure on the actual displacement field.
//
//   node tools/headmeasure.mjs
//   node tools/headmeasure.mjs --seeds 12
//
// Five times now a pass on this face has fixed every item on a list of
// complaints and shipped a worse object, because "the nose is too big" is an
// adjective and nobody ever turned it into a number. This turns it into
// numbers: it transpiles `characters.ts` as-is, calls the exported `headProbe`,
// and reads the field back as anthropometry in millimetres.
//
// It does not render anything and it is not a substitute for looking. It is the
// thing you check the picture against — `docs/SUTTON-HOO.md`, "work from the
// object, not the list".
//
// The `life` column is Farkas' adult male series (head height menton–vertex
// 232 mm, head length glabella–opisthocranion 196, head breadth 155, neck
// breadth 111, nose projection past pogonion ~20) expressed as ratios and
// rescaled to this game's head, so what is being compared is proportion. Some
// targets are deliberately off life — this warrior is drawn at a heroic 7.3
// heads, with a broad vault and a fighter's neck — and those carry a note.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".headmeasure");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SEEDS = parseInt(flag("seeds", "8"), 10);

// Emitted inside the repo on purpose: the module imports `three`, and node
// resolves that by walking up to the repo's own node_modules.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts",
  "--outDir", ".headmeasure", "--target", "es2022", "--module", "esnext",
  "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
// tsc picks its own rootDir from the common directory of everything it pulled
// in, so the emit lands one or two levels down. Find it rather than guess.
const found = [];
const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(dir, e.name)) : e.name === "characters.js" && found.push(resolve(dir, e.name)); };
if (existsSync(OUT)) walk(OUT);
const built = found[0] ?? resolve(OUT, "characters.js");
if (!existsSync(built)) {
  console.error("[head] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || ""));
  process.exit(2);
}

const { headProbe } = await import(pathToFileURL(built).href);

const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];

// name, life/target ratio or mm, tolerance, note
const TARGETS = [
  ["headHeight", null, null, "mm, crown to menton"],
  ["headCount", 7.15, 0.35, "stature / head height; action-game heroic is 7.0–7.3"],
  ["breadthOverHeight", 0.72, 0.05, "life 0.67; broad Saxon vault allowed to 0.75"],
  ["lengthOverHeight", 0.845, 0.05, "GLABELLA to occiput / head height — note 3, the long skull"],
  ["craniumShare", 0.35, 0.035, "crown to brow / head height — note 3, cranium vs face"],
  ["midThird", 0.25, 0.035, "brow to subnasale"],
  ["lowerThird", 0.40, 0.04, "subnasale to menton"],
  ["noseBeyondChin", 24, 8, "NOTE 1 — the beak. Ricketts' E-line puts the tip ~21 mm ahead of pogonion; ×1.16 for this head"],
  ["noseBeyondLip", 26, 9, "tip in front of the lip line"],
  ["noseProjection", 29, 8, "tip off the NASION (found, not assumed). Under 20 is a flat nose"],
  ["tipBreadth", 20, 7, "NOTE 1 — the lobule: breadth within 3 mm of the tip's own projection. A man's is a bulb ~18–24 mm; single digits are a beak"],
  ["chinBeyondNasion", 0, 9, "NOTE 2 — the facial angle. Deeply negative is a set-back mandible"],
  ["chinBeyondLip", 1, 7, "NOTE 2 — negative is a receding chin. A fighter sits at 0 to +6"],
  ["jawBreadth", null, null, "mm, bigonial"],
  ["cheekBreadth", null, null, "mm, bizygomatic"],
  ["jawOverCheek", 0.86, 0.08, "bigonial / bizygomatic across the FRONT half. Life 0.77; a fighter 0.84–0.90"],
  ["neckBreadth", null, null, "mm"],
  ["neckOverHead", 0.75, 0.09, "neck breadth / max head breadth. Life 0.72; the spread is class bulk, which is art direction"],
  ["neckOverJaw", 1.00, 0.12, "NOTE 4 — neck against the jaw right above it. Life ~1.05, fighter higher"],
  ["visibleNeck", null, null, "mm, menton to the glenohumeral centre"],
  ["neckOverHeadHeight", 0.50, 0.07, "life 0.63 — this build runs a SHORT thick neck on purpose (see shoulderY). Guards against it drifting back to the 0.70 that made the head read small"],
];

const rows = [];
for (const cls of CLASSES) {
  for (let s = 0; s < SEEDS; s++) rows.push({ cls, seed: s, p: headProbe(cls, s) });
}

const fmt = (v) => (Math.abs(v) >= 20 ? v.toFixed(1) : v.toFixed(3));
let fails = 0;
console.log(`[head] ${rows.length} heads · ${CLASSES.length} classes × ${SEEDS} seeds\n`);
console.log("  measure                   min      mean       max   target      verdict");
console.log("  " + "-".repeat(84));
for (const [key, target, tol, note] of TARGETS) {
  const vals = rows.map((r) => r.p[key]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  let verdict = "—";
  if (target !== null) {
    const worst = Math.max(Math.abs(min - target), Math.abs(max - target));
    const ok = worst <= tol;
    if (!ok) fails++;
    verdict = ok ? "ok" : `OUT by ${fmt(worst - tol)}`;
  }
  console.log(`  ${key.padEnd(20)} ${fmt(min).padStart(9)} ${fmt(mean).padStart(9)} ${fmt(max).padStart(9)}` +
    `  ${(target === null ? "" : `${fmt(target)}±${fmt(tol)}`).padStart(11)}   ${verdict}`);
  console.log(`    ${note}`);
}
console.log("\n  " + "-".repeat(84));
console.log(`[head] FINAL: ${fails} of ${TARGETS.filter((t) => t[1] !== null).length} measured ratios outside tolerance`);
rmSync(OUT, { recursive: true, force: true });
process.exit(0);
