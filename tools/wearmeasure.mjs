#!/usr/bin/env node
// ============================================================
// WEARMEASURE — how far wrong the lift direction is on a worn head.
//
//   node tools/wearmeasure.mjs
//
// `headmeasure.mjs` measures the head. This measures the thing that puts a helm
// ON the head: `headWear` offsets every worn shell along `faceNormal`, which is
// the normal of the undisplaced ellipsoid and knows nothing about the
// displacement field. See `wearNormalProbe` in `characters.ts`.
//
// Same transpile-and-import trick as `headmeasure.mjs`, for the same reason:
// the field is the truth, and the field is TypeScript.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".wearmeasure");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts",
  "--outDir", ".wearmeasure", "--target", "es2022", "--module", "esnext",
  "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(dir, e.name)) : e.name === "characters.js" && found.push(resolve(dir, e.name)); };
if (existsSync(OUT)) walk(OUT);
const built = found[0] ?? resolve(OUT, "characters.js");
if (!existsSync(built)) {
  console.error("[wear] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || ""));
  process.exit(2);
}

const { wearNormalProbe } = await import(pathToFileURL(built).href);

const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const SEEDS = 8;

let worstMax = 0, worstBand = 0, worstClear = 1;
const rows = [];
for (const cls of CLASSES) {
  for (let s = 0; s < SEEDS; s++) {
    const r = wearNormalProbe(cls, s * 7919 + 13);
    rows.push({ cls, s, ...r });
    if (r.maxAngleDeg > worstMax) worstMax = r.maxAngleDeg;
    if (r.helmBandMaxDeg > worstBand) worstBand = r.helmBandMaxDeg;
    if (r.worstClearanceFrac < worstClear) worstClear = r.worstClearanceFrac;
  }
}

const mean = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;

console.log("");
console.log("[wear] lift-direction error — angle between faceNormal (the ellipsoid's)");
console.log("[wear] and the true normal of the displaced surface.");
console.log("");
console.log(`[wear] heads measured          ${rows.length}  (${CLASSES.length} classes x ${SEEDS} seeds)`);
console.log(`[wear] whole head   mean       ${mean("meanAngleDeg").toFixed(1)} deg`);
console.log(`[wear] whole head   worst      ${worstMax.toFixed(1)} deg`);
console.log(`[wear] helm band    mean       ${mean("helmBandMeanDeg").toFixed(1)} deg`);
console.log(`[wear] helm band    worst      ${worstBand.toFixed(1)} deg`);
console.log(`[wear] a 6.0 mm lift clears    ${(6 * worstClear).toFixed(2)} mm at the worst point`);
console.log("");
// A shell is only seated if what it was asked to clear, it clears. Anything
// under half the asked-for lift is a shell sitting in the skin.
const OK_BAND = 8;      // degrees: below this the offset error is under 1% of lift
const pass = worstBand <= OK_BAND;
console.log(`[wear] ${pass ? "PASS" : "FAIL"}: helm-band worst ${worstBand.toFixed(1)} deg against a ${OK_BAND} deg bar`);
console.log(`[wear] ${rows.length}/${rows.length} heads measured`);
process.exit(pass ? 0 : 1);
