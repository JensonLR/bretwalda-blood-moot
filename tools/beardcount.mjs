#!/usr/bin/env node
// Counts the SOLIDS a beard is made of.
//
//   node tools/beardcount.mjs
//
// `Part.merge()` welds by MATERIAL, so a mesh count is a draw-call count and
// says nothing about how many separate objects the player is looking at. What
// the owner sees when he says "it doesn't feel like one piece" is CONNECTED
// COMPONENTS: two surfaces that share no vertex are two objects however they
// are drawn, and every seam and every overlap in the beard is a boundary
// between two of them.
//
// So this welds the beard's triangles by position (0.1 mm) and counts the
// islands. Not a gate — a magnifying glass for the beard pass; `wearmeasure`
// carries the assertion.
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".beardcount");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
spawnSync("npx", ["tsc", "src/game/client/characters.ts", "--outDir", ".beardcount",
  "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(d, e.name)) : e.name === "characters.js" && found.push(resolve(d, e.name)); };
walk(OUT);
const built = found[0];
if (!existsSync(built)) { console.error("[beard] tsc emitted nothing"); process.exit(2); }
const { buildCharacter, defaultAppearance } = await import(pathToFileURL(built).href);

const STYLES = ["none", "short", "full", "forked", "braided"];
// Raven Black for the beard, Oak Brown for the hair, so the two do not share a
// material and the beard's own geometry can be isolated.
const BEARD_HEX = "1c1712";

class DSU {
  constructor(n) { this.p = new Int32Array(n).map((_, i) => i); }
  find(a) { while (this.p[a] !== a) { this.p[a] = this.p[this.p[a]]; a = this.p[a]; } return a; }
  join(a, b) { a = this.find(a); b = this.find(b); if (a !== b) this.p[a] = b; }
}

for (const helm of ["none", "spangen"]) {
  for (const s of STYLES) {
    const ap = {
      ...defaultAppearance("huscarl"),
      beardStyle: s, beardColor: 0x1c1712, hairColor: 0x4a3220, helm,
    };
    const c = buildCharacter("huscarl", ap, 0, undefined, "high", 13);
    c.group.updateMatrixWorld(true);
    const verts = [];
    const tris = [];
    c.group.traverse((o) => {
      if (!o.isMesh) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m?.color?.getHexString?.() !== BEARD_HEX) return;
      const g = o.geometry, pos = g.attributes.position, ia = g.index?.array;
      const base = verts.length / 3;
      for (let i = 0; i < pos.count; i++) verts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      const n = ia ? ia.length : pos.count;
      for (let t = 0; t < n; t += 3) {
        tris.push(base + (ia ? ia[t] : t), base + (ia ? ia[t + 1] : t + 1), base + (ia ? ia[t + 2] : t + 2));
      }
    });
    if (!verts.length) { console.log(`  helm=${helm.padEnd(9)} beard=${s.padEnd(8)} solids=0`); continue; }
    // Weld at 0.1 mm.
    const key = new Map(), rep = new Int32Array(verts.length / 3);
    for (let i = 0; i < verts.length / 3; i++) {
      const k = `${Math.round(verts[i * 3] * 1e4)},${Math.round(verts[i * 3 + 1] * 1e4)},${Math.round(verts[i * 3 + 2] * 1e4)}`;
      const had = key.get(k);
      if (had === undefined) { key.set(k, i); rep[i] = i; } else rep[i] = had;
    }
    const dsu = new DSU(verts.length / 3);
    for (let t = 0; t < tris.length; t += 3) {
      dsu.join(rep[tris[t]], rep[tris[t + 1]]);
      dsu.join(rep[tris[t + 1]], rep[tris[t + 2]]);
    }
    const roots = new Set();
    for (let t = 0; t < tris.length; t += 3) roots.add(dsu.find(rep[tris[t]]));
    console.log(`  helm=${helm.padEnd(9)} beard=${s.padEnd(8)} solids=${roots.size}  tris=${tris.length / 3}`);
  }
}
