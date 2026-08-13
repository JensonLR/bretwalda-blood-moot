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
/**
 * A beard's shell, at the median crossing, in mm. **GATED ON.**
 *
 * IT USED TO BE REPORTED AND NOT ASSERTED, and the note that stood here said
 * "4 mm is the shell the code currently declares (`cut.thick` is 4.0 to 6.8)".
 * Both halves of that were wrong and they were wrong in opposite directions:
 *
 *  * the code did not compare against the declaration. It compared every style
 *    against a FLAT 4, and then printed "median under the shell it declares" —
 *    so the Close Crop was flagged for missing its own 4.0 by 0.2 while the
 *    Ringed Braid passed the sentence at 3.1 with 5.8 declared;
 *  * and it could not have compared against the declaration, because they are
 *    different quantities. `BeardCut.wall` is the parametric separation of the
 *    two sheets — the inner one is displaced along the SKULL's normal and the
 *    section's radial, neither of which is the sheet's own normal — and the
 *    realised crossing measures 0.34 to 0.78 of it, per style. The dial and the
 *    reading are not the same number and never were.
 *
 * What is left after that is a straight look question, and the answer is on the
 * owner's own screenshots: "all beards have a similar defect & issue where it
 * looks to be really sharp & thin / folded in areas". Below 4 mm of median
 * crossing, over half of a beard's rays are under 4 mm on a head 150 mm across,
 * and that is the edge-on sheet he is describing. So the bar is 4 mm of
 * MEASURED crossing, it is chosen rather than derived, and it is asserted —
 * because a number nobody has to look at is a number nobody looks at.
 */
const THIN_MM = 4;

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
    // GATED ON THE MEDIAN, NOT THE TENTH PERCENTILE — and the first cut of this
    // file had it the other way round.
    //
    // p10 looked like the right statistic: "a tenth of the beard is paper-thin"
    // is a good description of what the owner is looking at. It is also inert.
    // Doubling `cut.thick` on all four styles moved the MEDIAN as you would
    // expect — 3.8 to 6.9, 6.0 to 8.3, 4.4 to 6.5, 3.1 to 5.4 — and left p10
    // almost exactly where it was: 1.3 to 1.9, 1.4 to 1.8, and the braided rung
    // did not move off 0.2 at all.
    //
    // A statistic that does not respond to the only lever that controls it is
    // not measuring that lever. The thin tenth is the HEM AND THE EDGES, where
    // the section wraps from the outer wall to the inner one and the two meet
    // by construction. That is legitimate taper — a beard IS thin where it ends
    // — and gating on it would demand a beard with a blunt cut edge.
    //
    // The median tracks `cut.thick` almost exactly, which is the evidence it is
    // the quantity the shell actually controls.
    const fail = med < THIN_MM;
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
    + `${(r.thin * 100).toFixed(0).padStart(9)}%   ${r.fail ? `<-- MEDIAN UNDER ${THIN_MM} mm` : ""}`);
}
console.log("");
console.log(`[vol] the MEDIAN is the number to read: it tracks BeardCut.wall, so it is what the`);
console.log("[vol] shell controls. p10 is the hem and the edges, where the section wraps from");
console.log("[vol] outer wall to inner and the two meet — legitimate taper, and inert: doubling");
console.log("[vol] the wall moved every median and left every p10 where it was.");
console.log("");
console.log(`[vol] AND THE ${THIN_MM} mm IS A READING, NOT A DECLARATION — this line used to say the`);
console.log("[vol] opposite and it was wrong twice over. The verdict column read 'median under the");
console.log("[vol] shell it declares' while the code compared against a FLAT 4 mm, so it flagged");
console.log("[vol] the Close Crop for missing 4.0 by 0.2 and let the Ringed Braid past at 3.1 with");
console.log("[vol] 5.8 declared. It could not have been comparing against the declaration anyway:");
console.log("[vol] `BeardCut.wall` is the parametric separation of the two sheets, the realised");
console.log("[vol] crossing comes out at 0.34-0.78 of it depending on the style's own section, and");
console.log("[vol] the two are different quantities. See the note over `wall` in characters.ts.");
console.log("");
console.log(`[vol] SO IT GATES ON THE READING, AND ${THIN_MM} mm IS A CHOICE WITH A REASON: below it more`);
console.log("[vol] than half of a beard's crossings are under 4 mm on a 150 mm head, which is the");
console.log("[vol] 'really sharp & thin / folded' the owner reported with profile screenshots. It");
console.log(`[vol] failed 8 of 16 rows on the tip this gate was written against.`);
console.log("");
console.log(`[vol] ${rows.length - bad}/${rows.length} rows pass`);
console.log(bad ? "[vol] FAIL" : "[vol] PASS");
process.exit(bad ? 1 : 0);
