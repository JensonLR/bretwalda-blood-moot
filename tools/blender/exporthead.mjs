#!/usr/bin/env node
// EXPORTHEAD — the game's own head, out of the code and into a file Blender opens.
//
//   node tools/blender/exporthead.mjs [--cls huscarl] [--seed 13] [--nu 96] [--nv 64]
//
// docs/REBUILD-PLAN.md, step 1: "build from the code's own measurements". This
// transpiles characters.ts the way wearmeasure does, calls `headMesh` — the
// displacement field every helm, hair and beard is sampled through — and
// writes art/blender/head-<cls>-<seed>.obj in metres, Y up, with normals and
// quads. `tools/blender/head.py` is the Blender half.
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, ".exporthead");
const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const CLS = flag("cls", "huscarl"); const SEED = Number(flag("seed", 13)); const NU = Number(flag("nu", 96)); const NV = Number(flag("nv", 64));
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts", "--outDir", ".exporthead", "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"], { cwd: ROOT, encoding: "utf8" });
const emitted = []; const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = resolve(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f); } };
if (existsSync(OUT)) walk(OUT);
for (const f of emitted) {
  const src = readFileSync(f, "utf8");
  const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c))
    .replace(/(from\s+")@\/game\/([^"]*)(")/g, (m, a, b, c) => a + pathToFileURL(resolve(ROOT, "src/game", b)).href + c);
  if (fixed !== src) writeFileSync(f, fixed);
}
const built = emitted.find((f) => f.endsWith("characters.js"));
if (!built) { console.error("[exporthead] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || "")); process.exit(2); }
const { headMesh } = await import(pathToFileURL(built).href);
const { positions, normals, quads } = headMesh(CLS, SEED, NU, NV);
const lines = [`# Bretwalda head — ${CLS}, seed ${SEED}, ${NU}x${NV}; metres, Y up. From characters.ts headMesh.`, `o head_${CLS}_${SEED}`];
for (let i = 0; i < positions.length; i += 3) lines.push(`v ${positions[i].toFixed(5)} ${positions[i + 1].toFixed(5)} ${positions[i + 2].toFixed(5)}`);
for (let i = 0; i < normals.length; i += 3) lines.push(`vn ${normals[i].toFixed(4)} ${normals[i + 1].toFixed(4)} ${normals[i + 2].toFixed(4)}`);
for (const q of quads) lines.push(`f ${q.map((k) => `${k + 1}//${k + 1}`).join(" ")}`);
mkdirSync(resolve(ROOT, "art/blender"), { recursive: true });
const file = resolve(ROOT, `art/blender/head-${CLS}-${SEED}.obj`);
writeFileSync(file, lines.join("\n") + "\n");
rmSync(OUT, { recursive: true, force: true });
let minY = 9, maxY = -9, maxX = 0, maxZ = -9, minZ = 9;
for (let i = 0; i < positions.length; i += 3) { minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]); maxX = Math.max(maxX, Math.abs(positions[i])); maxZ = Math.max(maxZ, positions[i + 2]); minZ = Math.min(minZ, positions[i + 2]); }
console.log(`[exporthead] ${file}: ${positions.length / 3} vertices, ${quads.length} quads; height ${((maxY - minY) * 1000).toFixed(0)} mm, breadth ${(maxX * 2000).toFixed(0)} mm, length ${((maxZ - minZ) * 1000).toFixed(0)} mm`);
