#!/usr/bin/env node
// SEVERAUTHORED — can an authored man actually lose a limb?
//
//   npm run severauthored
//
// WHY THIS EXISTS. Dismemberment did not work on an authored body, and until
// this week it did not say so either: `collectRig` finds limbs by the `rig:`
// mesh-name prefix the procedural builder stamps, authored meshes are named
// `<role>_<n>`, and `upgradeRigToAuthored` clears `rig.body.children` and
// orphans every seam anchor. So `sever` returned null for every zone and
// `beginGore` took its "a body that refused the cut falls exactly as it always
// did" path — a severing kill playing as an intact collapse, silently.
//
// The reason it was not a small fix: a shipped warrior is 46 SkinnedMeshes over
// one 25-bone skeleton. There is no arm mesh to take. The arm is the set of
// VERTICES weighted to the arm's bones, inside body-wide geometry — so
// selection has to be by bone influence, which is `authoredSever.ts`.
//
// This drives that against the REAL shipped GLBs, the same way `gltftest` and
// `cliptest` read them: `GLTFLoader.parse`, no browser, no GPU.
//
// THE CLAIM THAT MATTERS IS CONSERVATION. Every triangle that leaves the body
// has to arrive on the piece, and every one has to come back on restore. A cut
// that loses triangles is a hole in a man; one that duplicates them is a limb
// drawn twice. Counted, per seam, on every class.
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { rmSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHIP = resolve(ROOT, "public/authored");
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const SEAMS = ["neck", "shoulderR", "elbowR", "shoulderL", "elbowL", "hipR", "kneeR", "hipL", "kneeL", "waist"];

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

function build() {
  const BUILD = resolve(ROOT, ".severauthored/mod");
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  const tsc = spawnSync("npx", ["tsc", "src/game/client/render/authoredSever.ts", "--outDir", ".severauthored/mod",
    "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
    { cwd: ROOT, encoding: "utf8" });
  const emitted = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const f = resolve(d, e.name);
    if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f);
  } };
  if (existsSync(BUILD)) walk(BUILD);
  for (const f of emitted) {
    const src = readFileSync(f, "utf8");
    const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c));
    if (fixed !== src) writeFileSync(f, fixed);
  }
  const file = emitted.find((f) => f.endsWith("authoredSever.js"));
  if (!file) { console.error(`tsc emitted nothing:\n${tsc.stdout || ""}${tsc.stderr || ""}`); process.exit(2); }
  return file;
}

const { severAuthored } = await import(pathToFileURL(build()).href);

const parse = (file) => new Promise((ok, no) => {
  const b = readFileSync(file);
  new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "", ok, no);
});

/** Triangles across every skinned mesh in a body. */
const trisOf = (root) => {
  let n = 0;
  root.traverse((o) => { if (o.isSkinnedMesh && o.geometry.index) n += o.geometry.index.count / 3; });
  return n;
};

console.log("SEVERAUTHORED — cutting a man who is 46 meshes and one skeleton\n");

let cutAll = 0, conserved = 0, restored = 0, attempted = 0;
const shapes = [];

for (const cls of CLASSES) {
  const file = resolve(SHIP, `warrior-${cls}.glb`);
  if (!existsSync(file)) { check(`${cls}: the shipped GLB exists`, false, file); continue; }
  const g = await parse(file);
  // Bind the skeleton once, as a live rig would, so applyBoneTransform has
  // matrices to work with rather than identity.
  g.scene.updateMatrixWorld(true);
  const whole = trisOf(g.scene);
  const row = [];
  for (const seam of SEAMS) {
    attempted++;
    const before = trisOf(g.scene);
    const cut = severAuthored(g.scene, seam);
    if (!cut) { row.push(`${seam}:none`); continue; }
    cutAll++;
    const after = trisOf(g.scene);
    let partTris = 0;
    cut.part.traverse((o) => { if (o.isMesh && o.geometry.index) partTris += o.geometry.index.count / 3; });
    // CONSERVATION: what the body lost is what the piece gained.
    if (before - after === partTris) conserved++;
    cut.restore();
    if (trisOf(g.scene) === before) restored++;
    row.push(`${seam}:${partTris}`);
  }
  shapes.push({ cls, whole, row });
  console.log(`    ${cls.padEnd(11)} ${Math.round(whole)} tris  ${row.join("  ")}`);
}

check("every seam cuts something on every class",
  cutAll === attempted, `${cutAll}/${attempted} seams cut`);
check("what the body loses is exactly what the piece gains — no hole, no double",
  conserved === cutAll, `${conserved}/${cutAll} conserved`);
check("and restore() puts every triangle back, because the round ends",
  restored === cutAll, `${restored}/${cutAll} restored`);

// The cut has to be PLAUSIBLE as well as arithmetically sound. A head that
// takes two triangles is a bug that conserves perfectly.
console.log("");
const bad = [];
for (const s of shapes) {
  for (const cell of s.row) {
    const [seam, nRaw] = cell.split(":");
    const n = Number(nRaw);
    if (!Number.isFinite(n)) { bad.push(`${s.cls}/${seam} did not cut`); continue; }
    const share = n / s.whole;
    // A head with its helm, hair and beard is a large share; a knee is small.
    // These are wide bands on purpose — the claim is "a limb-sized piece", not
    // a number somebody tuned.
    const lo = seam === "neck" ? 0.05 : seam === "waist" ? 0.15 : 0.005;
    const hi = seam === "waist" ? 0.92 : 0.75;
    if (share < lo || share > hi) bad.push(`${s.cls}/${seam} took ${(share * 100).toFixed(1)}% of the body`);
  }
}
check("and every piece is limb-sized — the arithmetic is not hiding a two-triangle head",
  bad.length === 0, bad.length ? bad.slice(0, 5).join("; ") : "all pieces within their band");

// A piece that still follows the skeleton is a piece that cannot be thrown.
{
  const g = await parse(resolve(SHIP, "warrior-huscarl.glb"));
  g.scene.updateMatrixWorld(true);
  const cut = severAuthored(g.scene, "elbowR");
  let skinned = 0, meshes = 0;
  cut.part.traverse((o) => { if (o.isMesh) { meshes++; if (o.isSkinnedMesh) skinned++; } });
  check("the piece is baked, not skinned — a limb that still followed the skeleton could not be thrown",
    meshes > 0 && skinned === 0, `${meshes} mesh(es), ${skinned} still skinned`);
  const box = new THREE.Box3().setFromObject(cut.part);
  const size = new THREE.Vector3(); box.getSize(size);
  check("...and it has real extent, so it was baked in a pose rather than collapsed to a point",
    size.length() > 0.05, `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m`);
  cut.restore();
}

console.log(`\n[severauthored] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
