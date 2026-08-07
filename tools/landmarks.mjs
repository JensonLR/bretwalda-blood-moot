#!/usr/bin/env node
// ============================================================
// LANDMARKS — where the features actually sit on the built head.
//
//   node tools/landmarks.mjs
//   node tools/landmarks.mjs --cls warden --seed 3
//
// One table, printed as a fraction of head height below the crown, against the
// canon for an adult male. It exists to settle an argument this project has now
// lost two half-days to: `headmeasure` says the cranium is 0.35 of the head and
// the eye line is at 0.50, and the frame the owner is looking at shows a bald
// dome with a small face at the bottom of it. Both cannot be true. The cage's
// rows, `eyeFrame`'s solve and the complexion's uv are three separate owners of
// one landmark's height and no instrument has ever compared them.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const TMP = resolve(ROOT, ".clay");
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const r = spawnSync("npx", ["tsc", "src/game/client/characters.ts", "--outDir", ".clay",
  "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(dir, e.name)) : e.name === "characters.js" && found.push(resolve(dir, e.name)); };
walk(TMP);
if (!found[0]) { console.error(r.stdout || r.stderr); process.exit(1); }
const { headLandmarks } = await import(pathToFileURL(found[0]).href);

// Vertex-to-menton fractions for an adult male, from Farkas' head heights.
const CANON = {
  "brow(cage)": [0.33, 0.40],
  "eye(cage)": [0.45, 0.52],
  "eye(globe)": [0.45, 0.52],
  nosetip: [0.62, 0.70],
  subnasale: [0.66, 0.74],
  lip: [0.76, 0.83],
  chin: [0.88, 0.95],
};

const L = headLandmarks(flag("cls", "huscarl"), parseInt(flag("seed", "1"), 10));
const H = L.crown - L.menton;
console.log(`[landmarks] head height ${(H * 1000).toFixed(1)} mm`);
console.log("");
console.log("  landmark        below crown     canon      verdict");
let bad = 0;
for (const m of L.marks) {
  const f = (L.crown - m.y) / H;
  const c = CANON[m.name];
  let verdict = "";
  if (c) {
    const ok = f >= c[0] && f <= c[1];
    if (!ok) bad++;
    verdict = ok ? "ok" : `OUT by ${(f < c[0] ? c[0] - f : f - c[1]).toFixed(3)}`;
  }
  console.log(`  ${m.name.padEnd(14)} ${f.toFixed(3).padStart(8)}   ${(c ? `${c[0]}..${c[1]}` : "").padStart(12)}   ${verdict}`);
}
console.log("");
console.log(`[landmarks] ${bad} landmark(s) off canon`);
