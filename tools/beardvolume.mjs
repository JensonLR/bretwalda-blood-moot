#!/usr/bin/env node
// ============================================================
// BEARDVOLUME — is the beard a mass, or a sheet?
//
//   node tools/beardvolume.mjs            (or: npm run beardvolume)
//
// The owner, 2026-08-08, with profile screenshots: "all beards have a similar
// defect & issue where it looks to be really sharp & thin / folded in areas".
// That is an exact description of A SURFACE WITH NO THICKNESS SEEN EDGE-ON, and
// it is a different fault from the throat overlap fixed earlier the same day —
// that one was about WHERE the surface sat, this is about it having no body.
//
// AND NOTHING MEASURED IT. `beardcount` welds the triangles and counts islands:
// a sheet is one island, so it passes. `beardseat` measures how far the beard
// sits inside the neck and the collar: a sheet intersects nothing, so it passes
// too. `wearmeasure` §5 folds in the same two questions. Every one of them is
// about POSITION and none is about VOLUME — which is the eighth time in this
// repository that the right question was asked of the wrong property.
//
// HOW IT MEASURES. A ray is fired at the beard from outside the head, inward
// along the horizontal. A solid mass is entered and left: two hits, and the gap
// between them is the thickness at that point. A sheet gives ONE hit, or two
// separated by a fraction of a millimetre where the surface folds back on
// itself. The distribution of those gaps is the answer, and the tenth
// percentile is what gets judged — a beard may legitimately taper to nothing at
// its edges, so the MINIMUM says little, but a tenth of the beard being
// paper-thin is the thing the owner is looking at.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".beardvolume");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
spawnSync("npx", ["tsc", "src/game/client/characters.ts", "--outDir", ".beardvolume",
  "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(d, e.name)) : e.name === "characters.js" && found.push(resolve(d, e.name)); };
walk(OUT);
if (!found[0]) { console.error("[vol] tsc emitted nothing"); process.exit(2); }
const { buildCharacter, defaultAppearance, BEARD_VALUES } = await import(pathToFileURL(found[0]).href);
const THREE = await import("three");

/** The beard's own material, the same tag `beardSeatProbe` uses to find it. */
const BEARD_HEX = "1c1712";
/** Below this a ray has passed through a sheet rather than a mass, in mm. */
const THIN_MM = 4;
/** Share of rays allowed to be that thin before the beard is a sheet. */
const P10 = 0.10;

const CLASSES = flag("cls", "") ? [flag("cls")] : ["huscarl", "warden", "runekeeper", "berserker"];
const STYLES = (BEARD_VALUES ?? ["short", "full", "forked", "braided"]).filter((b) => b !== "none");

let bad = 0;
const rows = [];
for (const cls of CLASSES) {
  for (const style of STYLES) {
    const ap = { ...defaultAppearance(cls), beardStyle: style, beardColor: 0x1c1712 };
    const built = buildCharacter(cls, ap, 0, undefined, "high", 13);
    const group = built.group ?? built;
    group.updateMatrixWorld?.(true);

    // Every beard triangle, in world space, as one mesh to shoot at.
    const pts = [];
    group.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (mat?.color?.getHexString?.() !== BEARD_HEX) return;
      const pos = o.geometry.getAttribute("position");
      const idx = o.geometry.getIndex();
      const v = new THREE.Vector3();
      const n = idx ? idx.count : pos.count;
      for (let t = 0; t < n; t++) {
        v.fromBufferAttribute(pos, idx ? idx.getX(t) : t).applyMatrix4(o.matrixWorld);
        pts.push(v.x, v.y, v.z);
      }
    });
    if (pts.length < 9) { console.log(`[vol] ${cls}/${style}: no beard geometry`); continue; }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.updateMatrixWorld(true);

    const bb = g.boundingBox;
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    const ray = new THREE.Raycaster();
    ray.firstHitOnly = false;

    // Rays inward along the horizontal, at every height of the beard and all
    // round it. Horizontal because a beard hangs vertically: a ray down its
    // length would run inside the surface and measure nothing.
    // ONLY THE HANGING FALL, not the part lying on the face.
    //
    // Hair on a cheek IS thin — `BeardCut.skin` is literally "how thickly the
    // hair lies on the face at the jaw" and a few millimetres there is correct,
    // not a defect. Measuring the whole beard would fail every style for the
    // one region entitled to be flat, which is the mistake facecover made by
    // counting the scalp. The fall is what has to have body: it hangs in air
    // with nothing behind it, and a fall with no thickness is the sheet the
    // owner is looking at edge-on.
    //
    // The lower 55% of the beard's own extent, so the sample follows the style
    // rather than a constant — a clipped beard and a forked one do not hang to
    // the same place.
    const gaps = [];
    const R = 0.5;
    const y0 = bb.min.y, y1 = bb.min.y + (bb.max.y - bb.min.y) * 0.55;
    for (let hi = 1; hi <= 14; hi++) {
      const y = y0 + ((y1 - y0) * hi) / 15;
      for (let ai = 0; ai < 36; ai++) {
        const a = (ai / 36) * Math.PI * 2;
        const from = new THREE.Vector3(cx + Math.sin(a) * R, y, cz + Math.cos(a) * R);
        const dir = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)).normalize();
        ray.set(from, dir);
        const hits = ray.intersectObject(mesh, false);
        if (hits.length < 2) continue;      // a graze, or the open mouth of the shell
        gaps.push((hits[1].distance - hits[0].distance) * 1000);
      }
    }
    if (!gaps.length) { console.log(`[vol] ${cls}/${style}: no ray crossed it twice`); bad++; continue; }
    gaps.sort((a, b) => a - b);
    const at = (p) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))];
    const p10 = at(0.10), med = at(0.50), p90 = at(0.90);
    const thin = gaps.filter((x) => x < THIN_MM).length / gaps.length;
    const fail = p10 < THIN_MM;
    if (fail) bad++;
    rows.push({ cls, style, p10, med, p90, thin, n: gaps.length, fail });
  }
}

console.log("\n[vol] beard thickness where a ray crosses it, in mm\n");
console.log("[vol] class        beard       rays     p10      med      p90   under 4mm   verdict");
console.log("[vol] " + "-".repeat(80));
for (const r of rows) {
  console.log(`[vol] ${r.cls.padEnd(12)} ${r.style.padEnd(10)} ${String(r.n).padStart(5)}`
    + `${r.p10.toFixed(1).padStart(8)}${r.med.toFixed(1).padStart(9)}${r.p90.toFixed(1).padStart(9)}`
    + `${(r.thin * 100).toFixed(0).padStart(9)}%   ${r.fail ? "<-- A SHEET" : ""}`);
}
console.log("");
console.log(`[vol] bar: the thinnest tenth of a beard must still be ${THIN_MM} mm thick.`);
console.log("[vol]      A beard may taper to nothing at its EDGES, so the minimum says little —");
console.log("[vol]      a tenth of it being paper-thin is what reads as a folded sheet.");
console.log(`[vol] ${bad ? `FAIL: ${bad} of ${rows.length}` : `PASS: ${rows.length}/${rows.length}`}`);
process.exit(bad ? 1 : 0);
