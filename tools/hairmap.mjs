#!/usr/bin/env node
// ============================================================
// HAIRMAP — does the hair substance actually carry a lay?
//
//   node tools/hairmap.mjs            (or: npm run hairmap)
//
// WHY THIS EXISTS. `characters.ts` dressed every beard, every hairstyle and
// both brows in `wool` for the whole life of this project, under a comment that
// said there was no hair substance and no budget for one. The owner reported
// the result four separate times — "the beards also still feel flat", then
// "really sharp & thin / folded in areas ... really broken & poor" — and four
// passes answered with GEOMETRY, because a beard looks like it is made of the
// shape it is. Every one of those passes had a harness, every harness measured
// a position or a volume, and not one of them could see that the surface had no
// direction in it. That is the tenth time in this repository that the right
// question was asked of the wrong property, and this file is the ruler that
// would have caught it.
//
// WHAT IT MEASURES, and the two numbers are the whole argument:
//
//   ANISOTROPY. Hair is a bundle of parallel cylinders; wool is felt. The
//   difference is not fineness, it is that hair's variation lives along ONE
//   axis. So: the mean absolute difference between horizontally adjacent texels
//   against the same for vertically adjacent ones. A felt is near 1.0 — it
//   changes as fast in both directions. Hair must be well above it, because
//   moving across the lay crosses strands and moving along it does not.
//
//   SHEEN SPREAD. A bundle of parallel cylinders returns a bright band across
//   the lay. `MeshStandardMaterial` has no anisotropy term to draw one with, so
//   the closest an isotropic BRDF gets is a roughness that swings with the lay —
//   glossy on a lock's crown, matte in the trough between. That swing is the
//   cue, and its size is the measurement. Wool spends 0.13 on it and its own
//   comment is careful to say that must never read as gloss.
//
// AND IT RE-MEASURES THE RECIPE'S DECLARED ROUGHNESS, which is not a courtesy.
// `materials.ts` DIVIDES a caller's requested roughness by the recipe's own
// `roughness` field, so that field has to be the built map's actual mean or the
// whole sheen band is silently rescaled. `grass` and `groundDetail` both carry
// a footnote saying re-measure this if the recipe changes; nothing enforced it.
// This does.
//
// WOOL IS THE CONTROL, and that is what makes the lay number mean anything.
// Wool's own recipe is built on the stated promise that "the structure is fibre
// and it has no axis", so whatever this instrument reads on wool IS the reading
// for a surface with no lay. Hair has to beat it by a wide margin or the recipe
// has not done the one thing it exists to do.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".hairmap");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/render/textures.ts", "--outDir", ".hairmap",
  "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(d, e.name)) : e.name === "textures.js" && found.push(resolve(d, e.name)); };
walk(OUT);
if (!found[0]) { console.error("[hair] tsc emitted nothing\n", tsc.stdout, tsc.stderr); process.exit(2); }
const mod = await import(pathToFileURL(found[0]).href);

const probe = mod.__probeSubstance;
if (typeof probe !== "function") {
  console.error("[hair] textures.ts exports no __probeSubstance seam — see the note beside it");
  process.exit(2);
}

/**
 * Mean absolute step between neighbours, one axis at a time, on a wrapping map.
 * The ratio of the two is the anisotropy: how much faster the surface changes
 * across the lay than along it.
 */
function steps(field, size, stride = 1, off = 0) {
  let sx = 0, sy = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * stride + off;
      const ix = (y * size + ((x + 1) & (size - 1))) * stride + off;
      const iy = (((y + 1) & (size - 1)) * size + x) * stride + off;
      sx += Math.abs(field[ix] - field[i]);
      sy += Math.abs(field[iy] - field[i]);
    }
  }
  const n = size * size;
  return { across: sx / n, along: sy / n };
}

function mean(f) { let s = 0; for (let i = 0; i < f.length; i++) s += f[i]; return s / f.length; }
function spread(f) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < f.length; i++) { if (f[i] < lo) lo = f[i]; if (f[i] > hi) hi = f[i]; }
  return { lo, hi, range: hi - lo };
}

console.log("");
console.log("[hair] the lay of a substance: how much faster it changes ACROSS than ALONG");
console.log("");
console.log("[hair] substance    field       across    along    ratio     mean    spread");
console.log("[hair] ---------------------------------------------------------------------");

const SUBJECTS = ["hair", "wool"];
const rows = {};
for (const name of SUBJECTS) {
  const g = probe(name);
  rows[name] = {};
  for (const [field, arr, stride, off] of [
    ["height", g.h, 1, 0],
    ["rough", g.r, 1, 0],
    ["albedo", g.c, 3, 0],
  ]) {
    const s = steps(arr, g.size, stride, off);
    const ratio = s.along > 1e-9 ? s.across / s.along : Infinity;
    const sp = stride === 1 ? spread(arr) : { range: NaN };
    const mn = stride === 1 ? mean(arr) : NaN;
    rows[name][field] = { ...s, ratio, mean: mn, range: sp.range };
    console.log(`[hair] ${name.padEnd(11)} ${field.padEnd(10)} ${s.across.toFixed(4).padStart(7)}  ${s.along.toFixed(4).padStart(7)}`
      + `  ${ratio.toFixed(2).padStart(6)}  ${Number.isNaN(mn) ? "     -" : mn.toFixed(3).padStart(6)}`
      + `  ${Number.isNaN(sp.range) ? "     -" : sp.range.toFixed(3).padStart(6)}`);
  }
}

console.log("");
let bad = 0;

// ---- 1. the lay ----------------------------------------------------------
const hairLay = rows.hair.height.ratio;
const woolLay = rows.wool.height.ratio;
const LAY_MIN = 1.8;
if (hairLay < LAY_MIN) {
  console.log(`[hair] FAIL the lay: hair's height changes only ${hairLay.toFixed(2)}x faster across the lay than along it`
    + ` (bar ${LAY_MIN}); wool, which is built to have no axis at all, reads ${woolLay.toFixed(2)}`);
  bad++;
} else {
  console.log(`[hair] PASS the lay: ${hairLay.toFixed(2)}x across vs along in the height field`
    + ` (bar ${LAY_MIN}), against wool's ${woolLay.toFixed(2)} — wool is the control, and it is`
    + ` built to have no axis`);
}

// ---- 2. the sheen band ---------------------------------------------------
const hairSheen = rows.hair.rough.range;
const woolSheen = rows.wool.rough.range;
const SHEEN_MIN = 0.35;
if (hairSheen < SHEEN_MIN) {
  console.log(`[hair] FAIL the sheen: roughness spans only ${hairSheen.toFixed(3)} (bar ${SHEEN_MIN}).`
    + ` A bundle of parallel cylinders returns a band; a flat roughness cannot draw one.`);
  bad++;
} else {
  console.log(`[hair] PASS the sheen: roughness spans ${hairSheen.toFixed(3)} (bar ${SHEEN_MIN}),`
    + ` against wool's ${woolSheen.toFixed(3)} — wool is deliberately matte`);
}

// ---- 3. the declared mean ------------------------------------------------
const DECLARED = probe.declared?.("hair");
const measured = rows.hair.rough.mean;
const TOL = 0.03;
if (DECLARED === undefined) {
  console.log("[hair] SKIP the declared mean: no recipe metadata on the probe seam");
} else if (Math.abs(DECLARED - measured) > TOL) {
  console.log(`[hair] FAIL the declared mean: RECIPES.hair.roughness says ${DECLARED.toFixed(3)}`
    + ` but the built map's mean is ${measured.toFixed(3)} (tolerance ${TOL}).`
    + ` materials.ts DIVIDES by the declared value, so every caller's roughness is off by`
    + ` ${(measured / DECLARED).toFixed(2)}x.`);
  bad++;
} else {
  console.log(`[hair] PASS the declared mean: RECIPES.hair.roughness ${DECLARED.toFixed(3)}`
    + ` matches the built map's ${measured.toFixed(3)} within ${TOL}`);
}

console.log("");
console.log(bad ? `[hair] FAIL — ${bad} check(s)` : "[hair] PASS");
process.exit(bad ? 1 : 0);
