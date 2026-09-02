#!/usr/bin/env node
// HELMRUNGS — what each helmet rung adds to the head's outline, in millimetres.
//
//   node tools/helmrungs.mjs [--cls huscarl] [--seeds 3]
//
// docs/COSMETICS-AUDIT.md §5's rule for a paid helm: "every rung above 200
// gold must change the outline by ≥40 mm somewhere on the crown or the jaw, or
// it is not worth selling." The captures show it; this measures it, on the real
// `buildCharacter`, so a reprice has a number under it. Per rung, against the
// bare head of the same seed: how much higher the crown stands, how much
// wider the head is at its widest, how far the outline reaches forward past
// the brow and back past the nape. A helmet worn INSIDE the head's own outline
// is a bar the fight card cannot see.
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import * as THREE from "three";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".helmrungs");
const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const CLS = flag("cls", "huscarl");
const SEEDS = Math.max(1, Number(flag("seeds", 3)));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts", "--outDir", ".helmrungs",
  "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"], { cwd: ROOT, encoding: "utf8" });
const emitted = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = resolve(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f); } };
if (existsSync(OUT)) walk(OUT);
for (const f of emitted) {
  const src = readFileSync(f, "utf8");
  const fixed = src
    .replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c))
    .replace(/(from\s+")@\/game\/([^"]*)(")/g, (m, a, b, c) => a + pathToFileURL(resolve(ROOT, "src/game", b)).href + c);
  if (fixed !== src) writeFileSync(f, fixed);
}
const built = emitted.find((f) => f.endsWith("characters.js"));
if (!built) { console.error("[rungs] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || "")); process.exit(2); }
const { buildCharacter, defaultAppearance, HELM_VALUES } = await import(pathToFileURL(built).href);

// The head group's world-space box, with the helm's own geometry in it. The
// group is measured, not the helm alone, because a helm that sits inside the
// head's outline is exactly the case the rule exists for.
function headBox(helm, seed) {
  const ap = { ...defaultAppearance(), helm, hair: "short", beard: "short" };
  const b = buildCharacter(CLS, ap, 0x5a6630, undefined, "high", seed);
  b.group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  b.head.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    box.union(bb);
  });
  return box;
}

const mm = (v) => (v * 1000).toFixed(0).padStart(4);
// AGAINST THE SPANGENHELM, not the bare head. The audit's finding is that
// seven rungs are "one bowl with fittings bolted to it", so the question a
// price answers is what a rung adds over the 30-gold bowl every cap shares.
// The hood is not a cap and is read against the bare head.
console.log(`[rungs] ${CLS}, ${SEEDS} seed(s) — what each rung adds to the outline over the iron spangenhelm (the hood over the bare head), in mm, on the seed where it shows least\n`);
console.log("  rung          crown  width  fore   nape   max    ≥40 mm?");
const rows = [];
for (const helm of HELM_VALUES) {
  if (helm === "none") continue;
  let worst = null;
  for (let s = 0; s < SEEDS; s++) {
    const seed = s * 7919 + 13;
    const bare = headBox(helm === "hood" || helm === "iron" ? "none" : "iron", seed);
    const worn = headBox(helm, seed);
    const d = {
      crown: worn.max.y - bare.max.y,
      width: Math.max(worn.max.x - bare.max.x, bare.min.x - worn.min.x),
      fore: worn.max.z - bare.max.z,
      nape: bare.min.z - worn.min.z,
    };
    d.max = Math.max(d.crown, d.width, d.fore, d.nape);
    if (!worst || d.max < worst.max) worst = d;   // the seed where the rung shows LEAST
  }
  rows.push({ helm, ...worst });
  console.log(`  ${helm.padEnd(12)} ${mm(worst.crown)}  ${mm(worst.width)}  ${mm(worst.fore)}  ${mm(worst.nape)}  ${mm(worst.max)}   ${worst.max >= 0.04 ? "yes" : "NO"}`);
}
rmSync(OUT, { recursive: true, force: true });
writeFileSync(resolve(ROOT, "art/helmrungs.json"), JSON.stringify(rows, null, 2));
console.log(`\n[rungs] written art/helmrungs.json`);
