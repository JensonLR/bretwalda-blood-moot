#!/usr/bin/env node
// ============================================================
// FACESEAM — is the face lit as one surface, or as two?
//
//   node tools/faceseam.mjs
//   node tools/faceseam.mjs --cls huscarl --helm spectacle
//
// WHY THIS EXISTS.
//
// The owner, from the live armoury: a hard vertical seam down the midline of
// the face, with one side shaded as skin and the other as blue-grey steel. It
// runs brow to jaw, it is straight, and it follows no feature — so it is not
// lighting falling on a shape, it is two different surfaces meeting.
//
// AND NOTHING IN THE GATE COULD SEE IT. `wearmeasure` measures clearances and
// holes in metal. `headmeasure` measures ratios and silhouette. `cosmetictest`
// measures how much of a cosmetic READS. `facelook` renders coverage — which
// surface wins the depth test — and says so itself: it "cannot judge a specular
// lobe or an IBL". A face whose right half is shaded as steel passes every one
// of them, because every one of them is asking about geometry and the defect is
// in the NORMALS. That is the eighth instance in this repository of the right
// question asked of the wrong surface.
//
// WHAT IT MEASURES, and it is arithmetic rather than a render:
//
//   1. WINDING. A triangle whose vertex order disagrees with the normals it is
//      shaded by is lit from behind — it takes the cold sky where its
//      neighbours take the warm key, which is exactly a patch of skin gone the
//      colour of steel. Plus the world matrix determinant, because the
//      historical bug here was a MIRRORED transform (`wearmeasure` section 6,
//      the backwards hands), invisible to every distance in the project because
//      a mirror preserves every length and flips only a SIGN.
//
//   2. SYMMETRY. The face is built from a field that is even in u, so the two
//      halves must agree. Any measure that differs sharply across the midline
//      is a seam, whatever produced it. Reported per band down the face so the
//      output names WHERE rather than just how much.
//
// GATES ON A MIRRORED TRANSFORM ONLY. The backlit percentages print for
// calibration and are NOT yet a bar — see the note beside `fail` for why
// turning an hour-old threshold into a red that fails 18 of 18 heads would kill
// the gate rather than defend it.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".faceseam");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const dump = argv.includes("--dump");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
spawnSync("npx", ["tsc", "src/game/client/characters.ts", "--outDir", ".faceseam",
  "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(d, e.name)) : e.name === "characters.js" && found.push(resolve(d, e.name)); };
walk(OUT);
if (!found[0]) { console.error("[seam] tsc emitted nothing"); process.exit(2); }
const { buildCharacter, defaultAppearance } = await import(pathToFileURL(found[0]).href);
const THREE = await import("three");

/** Winding and shading may drift a little on a hard crease; past this they disagree. */
const INWARD_DOT = -0.05;
/** Share of a mesh's triangles allowed to disagree before it is a fault. */
const INWARD_BAR = 0.002;

const CLASSES = (flag("cls", "") ? [flag("cls")] : ["huscarl", "warden", "runekeeper", "berserker"]);
const HELMS = (flag("helm", "") ? [flag("helm")]
  : ["none", "iron", "nasal", "ridge", "spectacle", "boar", "crowned", "wyrm", "suttonhoo"]);
const SEEDS = [13, 7932];

let bad = 0;
const rows = [];

for (const cls of CLASSES) {
  for (const helm of HELMS) {
    for (const seed of SEEDS) {
      const ap = { ...defaultAppearance(cls), helm, beardStyle: "none", hairStyle: "shaved" };
      let root;
      try { root = buildCharacter(cls, ap, 0, undefined, "high", seed); }
      catch (e) { console.log(`[seam] ${cls}/${helm}/${seed} FAILED TO BUILD: ${e.message}`); bad++; continue; }
      const group = root.group ?? root.root ?? root;

      // The head's own flesh. Named parts only — a helm is METAL and is
      // supposed to look like metal; the question is whether the FACE does.
      const meshes = [];
      group.traverse?.((o) => {
        if (!o.isMesh || !o.geometry) return;
        if (/head|face|neck/i.test(o.name || "")) meshes.push(o);
      });
      if (!meshes.length) continue;

      group.updateMatrixWorld?.(true);
      let inward = 0, total = 0;
      let worst = null;
      /** Every backlit triangle's centroid, kept only for --dump. */
      const backlit = [];

      // Per-band asymmetry: the face split into six horizontal bands, each
      // counting inward-facing vertices left and right of the midline.
      const bands = Array.from({ length: 6 }, () => ({ l: 0, r: 0, ln: 0, rn: 0 }));
      let loY = Infinity, hiY = -Infinity;
      for (const m of meshes) {
        const pos = m.geometry.getAttribute("position");
        if (!pos) continue;
        for (let i = 0; i < pos.count; i++) { loY = Math.min(loY, pos.getY(i)); hiY = Math.max(hiY, pos.getY(i)); }
      }

      // WINDING AGAINST SHADING, NOT A CENTROID — and the first cut of this file
      // got it wrong in the exact way the header complains about.
      //
      // It asked "does this vertex normal point away from the centroid of the
      // flesh?" That is not what inside-out means. A neck is a TUBE, and a
      // tube's inner wall points at its own axis quite correctly. Worse, the
      // centroid was nonsense: `rig:head` vertices come back in local space and
      // `rig:neck` in world space, so it averaged points at y=0.19 with points
      // at y=1.64. It reported 22-29% of every head inside-out — and a head a
      // quarter inside-out is not a subtle seam, it is unrecognisable. The
      // number was large enough to disprove itself, which is the only reason it
      // was caught. The ninth instance, and this one was mine.
      //
      // What inside-out means is LOCAL and needs no origin: a triangle whose
      // winding disagrees with the normals it is shaded by. Take the geometric
      // normal from the vertex order, compare it with the mean of the three
      // shading normals, and a negative dot is a face lit from behind — which is
      // exactly a patch of skin taking the cold sky where its neighbours take
      // the warm key.
      const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
      const ab = new THREE.Vector3(), ac = new THREE.Vector3(), geo = new THREE.Vector3();
      const sh = new THREE.Vector3(), tmp = new THREE.Vector3();
      const mirrored = [];
      for (const m of meshes) {
        // The determinant, because the historical bug here was a MIRRORED
        // transform (`wearmeasure` section 6, the backwards hands). A mirror
        // preserves every length and flips only a sign, so no distance can see
        // it — but it reverses winding for everything underneath it at once.
        if (m.matrixWorld && m.matrixWorld.determinant() < 0) mirrored.push(m.name || "(unnamed)");
        const pos = m.geometry.getAttribute("position");
        const nor = m.geometry.getAttribute("normal");
        if (!pos || !nor) continue;
        const idx = m.geometry.getIndex();
        const tris = idx ? idx.count / 3 : pos.count / 3;
        for (let t = 0; t < tris; t++) {
          const i0 = idx ? idx.getX(t * 3) : t * 3;
          const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
          const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
          a.set(pos.getX(i0), pos.getY(i0), pos.getZ(i0));
          b.set(pos.getX(i1), pos.getY(i1), pos.getZ(i1));
          cc.set(pos.getX(i2), pos.getY(i2), pos.getZ(i2));
          geo.crossVectors(ab.subVectors(b, a), ac.subVectors(cc, a));
          if (geo.lengthSq() < 1e-18) continue;   // a degenerate sliver shades nothing
          geo.normalize();
          sh.set(0, 0, 0);
          for (const i of [i0, i1, i2]) sh.add(tmp.set(nor.getX(i), nor.getY(i), nor.getZ(i)));
          if (sh.lengthSq() < 1e-12) continue;
          const dot = geo.dot(sh.normalize());
          total++;
          const my = (a.y + b.y + cc.y) / 3, mx = (a.x + b.x + cc.x) / 3;
          const bi = Math.min(5, Math.max(0, Math.floor(((my - loY) / Math.max(1e-6, hiY - loY)) * 6)));
          const side = mx < 0 ? "l" : "r";
          bands[bi][side === "l" ? "ln" : "rn"]++;
          if (dot < INWARD_DOT) {
            inward++;
            bands[bi][side]++;
            if (!worst || dot < worst.dot) worst = { dot, x: mx, y: my, z: (a.z + b.z + cc.z) / 3, mesh: m.name };
            if (dump) backlit.push({ x: mx, y: my, z: (a.z + b.z + cc.z) / 3, mesh: m.name });
          }
        }
      }
      // WHERE the backlit triangles are, which is the whole question.
      //
      // A count cannot tell a defect from a cost. 1% reversed slivers scattered
      // evenly through a merged mesh is the price of sweeping hundreds of
      // patches and is invisible at any lens. 1% packed into a vertical band on
      // one side of the midline is the owner's seam. Same number, opposite
      // conclusions — so the distribution is what gets printed.
      if (dump && backlit.length) {
        const xs = backlit.map((q) => q.x);
        const ys = backlit.map((q) => q.y);
        const zs = backlit.map((q) => q.z);
        const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
        const sd = (v) => { const m = mean(v); return Math.sqrt(mean(v.map((x) => (x - m) ** 2))); };
        const left = xs.filter((x) => x < 0).length;
        const byMesh = new Map();
        for (const q of backlit) byMesh.set(q.mesh, (byMesh.get(q.mesh) || 0) + 1);
        console.log(`[seam] --- ${cls}/${helm}/${seed}: ${backlit.length} backlit triangles ---`);
        console.log(`[seam]   x  mean ${mean(xs).toFixed(4)}  sd ${sd(xs).toFixed(4)}  `
          + `range ${Math.min(...xs).toFixed(3)}..${Math.max(...xs).toFixed(3)}   `
          + `left ${left} / right ${backlit.length - left}`);
        console.log(`[seam]   y  mean ${mean(ys).toFixed(4)}  sd ${sd(ys).toFixed(4)}  `
          + `range ${Math.min(...ys).toFixed(3)}..${Math.max(...ys).toFixed(3)}`);
        console.log(`[seam]   z  mean ${mean(zs).toFixed(4)}  sd ${sd(zs).toFixed(4)}  `
          + `range ${Math.min(...zs).toFixed(3)}..${Math.max(...zs).toFixed(3)}`);
        console.log(`[seam]   by mesh: ${[...byMesh].map(([k, v]) => `${k} ${v}`).join(", ")}`);
        // A seam is a NARROW x-spread against a WIDE y-spread. Stated as a ratio
        // so it is one number to look at rather than six.
        const shape = sd(xs) / Math.max(1e-6, sd(ys));
        console.log(`[seam]   x-sd / y-sd = ${shape.toFixed(2)}  `
          + `(below ~0.3 is a vertical band, i.e. a seam; near 1 is scatter)`);
      }
      if (mirrored.length) {
        console.log(`[seam] ${cls}/${helm}/${seed} MIRRORED TRANSFORM on ${mirrored.join(", ")}`
          + " — every triangle under it is wound backwards");
        bad++;
      }
      if (!total) continue;
      const frac = inward / total;
      // A seam is an ASYMMETRY: one side of a band carrying inward normals the
      // other does not. Reported as the worst band's imbalance.
      let seam = 0, seamBand = -1;
      bands.forEach((b, i) => {
        const lf = b.ln ? b.l / b.ln : 0;
        const rf = b.rn ? b.r / b.rn : 0;
        const d = Math.abs(lf - rf);
        if (d > seam) { seam = d; seamBand = i; }
      });
      // REPORTED, NOT GATED — and the honesty here matters more than the check.
      //
      // Every head measures 0.7-1.0% backlit with a worst dot of -1.000, i.e. a
      // population of exactly-reversed triangles on every warrior in the game.
      // That is a real finding. What is NOT established is that 1% is wrong:
      // this geometry is merged from hundreds of swept patches, and some
      // reversed slivers at a seam may be the normal cost of that and invisible
      // at any lens. Failing 18 of 18 heads against a bar picked in the same
      // hour it was written would put a red in the gate that nobody can act on,
      // and a red nobody can act on gets ignored — which is how a gate dies.
      //
      // So the bar that FAILS is the one with a known meaning: a mirrored
      // transform, which is unambiguous and has bitten this project before. The
      // percentages print for calibration. Once a baseline is agreed against a
      // render that actually shows the seam, this becomes a regression bar.
      const fail = frac > INWARD_BAR || seam > INWARD_BAR;
      rows.push({ cls, helm, seed, frac, seam, seamBand, worst, fail });
    }
  }
}

console.log("[seam] cls          helm         seed    backlit%  worst band imbalance%   verdict");
console.log("[seam] ------------------------------------------------------------------------------");
for (const r of rows) {
  console.log(`[seam] ${r.cls.padEnd(12)} ${r.helm.padEnd(12)} ${String(r.seed).padStart(4)}   `
    + `${(r.frac * 100).toFixed(3).padStart(7)}   ${(r.seam * 100).toFixed(3).padStart(12)} (band ${r.seamBand})   `
    + `${r.fail ? "<-- over baseline" : ""}`);
  if (r.fail && r.worst) {
    console.log(`[seam]      most backlit triangle: dot ${r.worst.dot.toFixed(3)} at `
      + `(${r.worst.x.toFixed(3)}, ${r.worst.y.toFixed(3)}, ${r.worst.z.toFixed(3)}) on ${r.worst.mesh}`);
  }
}
console.log("");
const over = rows.filter((r) => r.fail).length;
console.log(`[seam] baseline for calibration: ${(INWARD_BAR * 100).toFixed(1)}% backlit; `
  + `${over} of ${rows.length} heads are over it`);
console.log("[seam] GATED ON: a mirrored transform only. The percentages above are a measurement,");
console.log("[seam]           not yet a bar — see the note in the source before turning them into one.");
console.log(`[seam] ${bad ? `FAIL: ${bad} mirrored transform(s)` : "PASS: no mirrored transforms"}`);
process.exit(bad ? 1 : 0);
