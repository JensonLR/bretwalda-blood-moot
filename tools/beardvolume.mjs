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
// AND IT NOW MEASURES A SECOND THING, BECAUSE THE FIRST ONE HID A REGRESSION.
// 13 Aug: widening the chin's mental pad (`C_W`, `C_MASK`) rotated the skull's
// normal under the menton downward, the beard's inner wall is displaced along
// that normal, and the Forked Beard's realised crossing fell 4.4 -> 3.8 mm on
// two classes. The gate below caught the THINNING. Nothing in this repository
// could have caught the fork itself going — and a filled-in notch reads as MORE
// mass here, so this file would have applauded it. See `FORK_MM`.
//
// HOW IT MEASURES. A ray is fired at the beard from outside the head, inward
// along the horizontal. A solid mass is entered and left: two hits, and the gap
// between them is the thickness at that point. A sheet gives ONE hit, or two
// separated by a fraction of a millimetre where the surface folds back on
// itself. The distribution of those gaps is the answer, and THE MEDIAN is what
// gets judged. This line used to say the tenth percentile and the code stopped
// doing that two revisions ago — see the note over the `fail` test, which
// records why p10 was inert and had to go.
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
 *    realised crossing measures 0.50 to 0.98 of it, per style. That span is a
 *    property of the SKULL under the beard as much as of the beard — widening
 *    the chin's mental pad moved every number in it, and the version of this
 *    sentence that read "0.34 to 0.78" was measured over the old chin. The dial
 *    and the reading are not the same number and never were.
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
/**
 * How far below the midline's hem a forked cut's tines must hang, in mm.
 * **GATED ON, and only the Forked Beard is judged by it.**
 *
 * WHY IT EXISTS. `THIN_MM` above is a gate on how much beard there is, and it
 * has no opinion at all about the SHAPE of it. That is a hole with a name on
 * it: the Forked Beard's whole identity is that it separates into two tines,
 * the separation lives in `cut.reach` and nothing in this repository has ever
 * measured `reach`. So the one style whose silhouette is a claim could have the
 * claim quietly deleted — by a flattened `reach`, by a hem solve, by a skull
 * edit under it — and every number here would stay green, because a beard with
 * the notch filled in has MORE mass and not less. The mass gate and the shape
 * gate pull in opposite directions, which is exactly why one cannot stand in
 * for the other.
 *
 * AND THE 40 mm IS DERIVED, NOT PICKED. The reading is the hem's own azimuth
 * profile: the lowest hair at each bearing about the head's axis, midline
 * against the tine bearings. Every cut that does NOT claim a fork reads
 * NEGATIVE, because an ordinary beard hangs deepest at the chin — −6.5 mm
 * (Close Crop), −11.3 to −3.1 mm (Full), −12.3 mm (Ringed Braid) on the tree
 * this is committed against. So 12.3 mm is how far an unforked hem wanders on
 * its own, out of `rag` and `hank`, and the bar is over three times it. A notch
 * that clears 40 mm cannot be the hem's raggedness being read as a shape.
 *
 * The Forked Beard reads 73.8-74.4 mm across the four classes, so it passes by
 * a factor of about 1.85 rather than by a whisker — which is the point. This
 * bar is here to catch the notch being LOST, not to tune it.
 *
 * WHAT IT CANNOT SEE, said here rather than discovered later. It reads the
 * HEM's outline and not the mass behind it, so it cannot tell two separated
 * tines from one continuous sheet with a scooped lower edge. That is not a
 * shortcut: it is the definition this beard is actually built to — "the notch
 * is cut out of the outline by the surface's own hem ... two parts of the beard
 * cannot intersect because there are not two parts". If the Forked Beard ever
 * becomes two masses again, this ruler stops matching the claim and needs
 * rewriting with it.
 *
 * The finite guard at the reading is a guard and not a caught bug: the face leg
 * puts hair on the chin at every bearing, so an empty midline bin is not
 * reachable through any dial in `BeardCut` today. It is there because +Infinity
 * sailing past a bar is how carve-outs get written by accident.
 *
 * IT WAS SHOWN FAILING BEFORE IT WAS SHOWN PASSING, which for a shape gate
 * means building the shape wrong on purpose. Two ways, both built from the tree
 * as this gate was written — at the Forked Beard's OLD dial, which does not
 * matter here because the notch reads 74.1 mm at 0.0058, at 0.0082 and at a
 * doubled 0.0116 alike: it is a property of `reach`, not of `wall`.
 * `reach` flattened to a constant 1.20 reads −12.9 mm and goes red on all four
 * classes; `reach` with its trough lifted from 0.34 to 0.90 — still a function
 * with two maxima in it, still looks like a fork in the source — reads 16.4 mm
 * and goes red on all four as well. The second is the one worth having: a fork
 * that is written down but does not separate is exactly the defect the audit
 * described as "a fork that does not separate in profile is a beard with a
 * notch", and no number in this repository could see it before.
 */
const FORK_MM = 40;
/** The one style that claims a fork, and the gate above is armed against it. */
const FORKED = "forked";

const CLASSES = flag("cls", "") ? [flag("cls")] : ["huscarl", "warden", "runekeeper", "berserker"];
const STYLES = (BEARD_VALUES ?? ["short", "full", "forked", "braided"]).filter((b) => b !== "none");
// A GATE THAT NEVER MEETS ITS CASE IS NOT A GATE — `docs/PROCESS.md`, failure
// mode 2. If the Forked Beard is ever renamed, retired or dropped out of
// `BEARD_VALUES`, the fork assertion below would simply never run and this file
// would print a clean sheet for a shape nobody measured. So its absence is a
// failure of THIS FILE, reported here rather than discovered later.
const forkedPresent = STYLES.includes(FORKED);

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

    // ---- THE HEM, BY BEARING: is there still a fork in it? ----
    //
    // The same point cloud, binned by azimuth about the head's axis, keeping
    // the LOWEST hair in each bin. That curve is the beard's outline seen from
    // below, and the fork is a notch in it: the tines reach, the midline does
    // not. It is read off the built mesh and not off `cut.reach`, so a hem
    // solve, a tuck or a skull that fills the notch in is caught the same as a
    // flattened profile would be — the defect this looks for is "the outline
    // lost its notch", whatever deleted it.
    //
    // 48 bins is 7.5 degrees apiece. The tines sit 0.40 rad (23 deg) off dead
    // ahead, so the peak lands three bins out and the search window below
    // spans five of them either side; a coarser grid would let a tine fall
    // between bins and read the SAMPLING and not the hair, which is the fault
    // `manespread`'s own nape statistic was written up for.
    const NB = 48;
    const hem = new Array(NB).fill(Infinity);
    for (let i = 0; i < pts.length; i += 3) {
      const u = Math.atan2(pts[i] - cx, pts[i + 2] - cz);
      const b = Math.round(((u + Math.PI) / (2 * Math.PI)) * NB) % NB;
      if (pts[i + 1] < hem[b]) hem[b] = pts[i + 1];
    }
    const hemAt = (u) => hem[Math.round(((u + Math.PI) / (2 * Math.PI)) * NB) % NB];
    let tine = Infinity;
    for (let s = -1; s <= 1; s += 2)
      for (let u = 0.25; u <= 0.60; u += 0.02) tine = Math.min(tine, hemAt(s * u));
    // AN EMPTY BIN IS A FAILURE, NOT A LARGE NUMBER. A bearing with no hair in
    // it holds Infinity, and `midline - tine` on an empty MIDLINE comes out as
    // +Infinity — which would sail past the bar below and report a perfect fork
    // on a beard that has nothing between its tines at all. That is the shape of
    // every carve-out this repository has been bitten by: the reading is absent
    // and the verdict reads as passing. Not finite, not a fork.
    const mid = hemAt(0);
    const fork = Number.isFinite(mid) && Number.isFinite(tine) ? (mid - tine) * 1000 : NaN;

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
    // Only the style that claims a fork is judged on having one. Every other
    // row still PRINTS its notch, because a number that is only ever shown for
    // the row that passes it is a number nobody can calibrate: the Full's
    // −3.8 mm and the Braid's −13.3 mm are what make 40 mm mean something.
    const forkFail = style === FORKED && !(fork >= FORK_MM);
    if (fail || forkFail) bad++;
    rows.push({ cls, style, p10, med, p90, thin, n: gaps.length, fork, fail, forkFail });
  }
}

console.log("\n[vol] beard thickness where a ray crosses it, and the notch in its hem, in mm\n");
console.log("[vol] class        beard       rays     p10      med      p90   under 4mm     fork   verdict");
console.log("[vol] " + "-".repeat(92));
for (const r of rows) {
  console.log(`[vol] ${r.cls.padEnd(12)} ${r.style.padEnd(10)} ${String(r.n).padStart(5)}`
    + `${r.p10.toFixed(1).padStart(8)}${r.med.toFixed(1).padStart(9)}${r.p90.toFixed(1).padStart(9)}`
    + `${(r.thin * 100).toFixed(0).padStart(9)}%${r.fork.toFixed(1).padStart(9)}   `
    + (r.fail ? `<-- MEDIAN UNDER ${THIN_MM} mm ` : "")
    + (r.forkFail ? `<-- NOTCH UNDER ${FORK_MM} mm, THE FORK IS GONE` : ""));
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
console.log("[vol] crossing comes out at 0.50-0.98 of it depending on the style's own section AND");
console.log("[vol] on the skull under it, and the two are different quantities. See the note over");
console.log("[vol] `wall` in characters.ts, which records what a chin edit did to this column.");
console.log("");
console.log(`[vol] SO IT GATES ON THE READING, AND ${THIN_MM} mm IS A CHOICE WITH A REASON: below it more`);
console.log("[vol] than half of a beard's crossings are under 4 mm on a 150 mm head, which is the");
console.log("[vol] 'really sharp & thin / folded' the owner reported with profile screenshots. It");
console.log(`[vol] failed 8 of 16 rows on the tip this gate was written against.`);
console.log("");
console.log(`[vol] AND THE 'fork' COLUMN IS A SECOND GATE, ON ONE ROW, BECAUSE MASS AND SHAPE PULL`);
console.log("[vol] OPPOSITE WAYS. It is how far below the midline's hem the deepest hair at the");
console.log("[vol] tine bearings hangs. An unforked cut reads NEGATIVE — -6.5 short, -11.3 to -3.1");
console.log(`[vol] full, -12.3 braided — so ${FORK_MM} mm is over three times the furthest an unforked`);
console.log("[vol] hem wanders on its own. Deleting the fork was TRIED against these very columns,");
console.log("[vol] at the dial this cut carried when the gate was written: a flat reach of 1.20 took");
console.log("[vol] the notch to -12.9 mm and the crossings sampled from 250-262 up to 324-336 on");
console.log("[vol] every class, three of the four medians RISING with them. So a beard that stopped");
console.log("[vol] being forked would read in the columns to the left as a beard with more of it.");
console.log("");
if (!forkedPresent) {
  bad++;
  console.log(`[vol] AND THE '${FORKED}' ROW WAS NEVER MEASURED — it is not in BEARD_VALUES, so the`);
  console.log("[vol] fork assertion had no case to judge and would have printed a clean sheet for a");
  console.log("[vol] shape nobody looked at. That is counted as a FAILURE of this file, not a pass.");
  console.log("");
}
const forkRows = rows.filter((r) => r.style === FORKED);
const forkWorst = forkRows.length ? Math.min(...forkRows.map((r) => r.fork)) : 0;
// THE VERDICT LINE SAYS WHAT HAPPENED TO THE FORK, AND IT USED TO SAY THE
// OPPOSITE. This clause read an unconditional "INCLUDING the fork, worst notch
// N mm" whenever the style was present — so on the two builds this gate was
// deliberately broken against, the run that FAILED on the fork and on nothing
// else signed off with:
//
//     12/16 rows pass — INCLUDING the fork, worst notch -12.9 mm against 40
//
// "INCLUDING the fork" is the phrase a reader takes the verdict from, and on
// that line it is false about the one assertion that went red. It was found by
// reading the harness's own output in its FAILING state, which is the whole
// reason `docs/PROCESS.md` R2 asks for a proof-of-failure: a verdict line only
// ever seen green is a verdict line nobody has read. The count was always
// right; the sentence over it was not, and this file's own history is that a
// true number under a false sentence is what ships the defect.
const forkVerdict = !forkedPresent
  ? " — WITH THE FORK UNMEASURED, see above"
  : forkRows.some((r) => r.forkFail)
    ? ` — AND THE FORK IS WHAT FAILED, worst notch ${forkWorst.toFixed(1)} mm against ${FORK_MM}`
    : ` — INCLUDING the fork, worst notch ${forkWorst.toFixed(1)} mm against ${FORK_MM}`;
console.log(`[vol] ${rows.length - bad}/${rows.length} rows pass` + forkVerdict);
console.log(bad ? "[vol] FAIL" : "[vol] PASS");
process.exit(bad ? 1 : 0);
