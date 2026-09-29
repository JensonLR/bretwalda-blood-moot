#!/usr/bin/env node
// ============================================================
// FACEMAP — does the complexion map land on the face it was painted for?
//
//   node tools/facemap.mjs                     4 classes, shipped GLBs in public/authored
//   node tools/facemap.mjs --cls huscarl
//   node tools/facemap.mjs --lever=shift       R1: the head 6 mm out of place; the readings MUST go red
//   node tools/facemap.mjs --lever=mirror      R1: the export's x-mirror not undone; the residual MUST rise
//
// THE PLAN'S OWN INSTRUCTION (CHAR-PLAN U5, Track A): the (u, v) source "prototyped first:
// recompute per vertex at swap from bind position, error under 1.5 mm, else export a second UV
// set". This is that prototype kept as a gate. It is the ruler for `render/faceMap.ts`, and
// what it asks is two things the render cannot show a person until it has already gone wrong:
//
//   RECONSTRUCTION  every vertex of a GLB head is inverted onto the procedural head's own
//                   (azimuth, latitude) parameterisation, and the distance from the vertex to
//                   the surface point it landed on is the error. On the SKULL SURFACE (the
//                   vertices that are not an ear and not an eyelid) that is the export's own
//                   fidelity to the builder, and the claim is 1.5 mm at the 95th percentile.
//                   Ears and lids stand off the skull by design; their standoff is printed and
//                   not barred, because a lid 14 mm proud of the socket is not a wrong lid.
//   FIDELITY        the number that matters: at each vertex, the stored multiplier the map
//                   returns at its (u, v) against the procedural complexion evaluated AT THE
//                   VERTEX (`faceComplexion`, the field the procedural head is painted with).
//                   Relative error, worst channel.
//   THE SEAM        no triangle spans more than half the map in u after `writeUv`.
//   THE EYES        the textures `render/eyeMap.ts` paints are laid out on the UV that `patch()` gave the eye's parts
//                   and that the export leaves alone (it overwrites the UVs of the world-tiled substances and of nothing
//                   else): the iris is polar (u the angle, running backwards, v the radius over the iris's), the sclera is
//                   across-the-aperture by lower-to-upper-margin. Read off the SHIPPED FILES and checked, so a re-export
//                   that changes them is a red gate and not an iris that spins.
//   THE STEP        the builder's stature step (`faceFieldOf` mirrors one line of `buildCharacter`)
//                   is held by the skull's own height: the field's crown against the GLB's.
//
// R1 IS BUILT IN. `--lever=shift` puts the head 6 mm up and requires reconstruction and fidelity
// to go past their bars; `--lever=mirror` skips the un-mirroring the export needs and requires
// the surface residual to rise. A ruler that answers the same to a right and a wrong head is
// measuring nothing.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { emitClient } from "./lib/clientmodule.mjs";
import { ROOT } from "./lib/facecard.mjs";

const argv = process.argv.slice(2);
const flag = (n, d) => { const a = argv.find((x) => x === `--${n}` || x.startsWith(`--${n}=`)); if (!a) return d; return a.includes("=") ? a.split("=")[1] : (argv[argv.indexOf(a) + 1] ?? d); };
const CLASSES = (flag("cls", "huscarl,warden,runekeeper,berserker")).split(",");
const LEVER = flag("lever", null);
const DIR = flag("glb", resolve(ROOT, "public/authored"));

// bars
const SURFACE_P95_MM = 1.5;      // the plan's claim, on the skull surface
const SURFACE_P50_MM = 0.5;
const FIDELITY_P50 = 0.02;       // relative, worst channel
const FIDELITY_P95 = 0.06;
const CROWN_MM = 1.5;

globalThis.window ??= { location: { search: "" }, innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, setItem() {} } };
globalThis.navigator ??= { userAgent: "node", maxTouchPoints: 0, hardwareConcurrency: 8 };
globalThis.document ??= { createElement: () => ({ getContext: () => null, width: 1, height: 1 }) };
const { byName } = await emitClient(ROOT, ["src/game/client/render/faceMap.ts"], ".faceprobe/facemap");
const FM = await byName("faceMap.js");
const CH = await byName("characters.js");
if (!FM || !CH) throw new Error("tsc emitted no faceMap.js / characters.js");

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };
const fmt = (a) => a.length ? `n=${String(a.length).padStart(4)} p50 ${pct(a, 0.5).toFixed(2)}  p95 ${pct(a, 0.95).toFixed(2)}  max ${Math.max(...a).toFixed(2)}` : "none";

function headWeight(mesh) {
  const g = mesh.geometry, si = g.getAttribute("skinIndex"), sw = g.getAttribute("skinWeight"), bones = mesh.skeleton?.bones ?? [];
  if (!si) return 0;
  let h = 0, t = 0;
  for (let v = 0; v < si.count; v++) for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > 0) { t += w; if (bones[si.getComponent(v, k)]?.name === "Head") h += w; } }
  return t ? h / t : 0;
}

let red = 0;
const say = (ok, line) => { console.log(`  ${ok ? "ok  " : "RED "} ${line}`); if (!ok) red++; };

for (const cls of CLASSES) {
  const file = resolve(DIR, `warrior-${cls}.glb`);
  if (!existsSync(file)) { console.log(`[facemap] ${cls}: no ${file}`); red++; continue; }
  const buf = readFileSync(file);
  const gltf = await new Promise((ok, no) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "", ok, no));
  const t0 = performance.now();
  const fm = FM.faceMapFor(cls, { schedule: false });
  const tBuild = performance.now() - t0;
  const t1 = performance.now();
  fm.finish();
  const tRaster = performance.now() - t1;
  const F = fm.field;
  console.log(`[facemap] ${cls}: identity 0, tone ${F.toneIndex}, iris ${F.irisIndex}, headY ${F.headY.toFixed(4)}; grid ${tBuild.toFixed(0)} ms, raster ${tRaster.toFixed(0)} ms (${FM.HEAD_MAP_SIZE.w}x${FM.HEAD_MAP_SIZE.h} head, ${FM.NECK_MAP_SIZE.w}x${FM.NECK_MAP_SIZE.h} neck)`);

  // ---- the meshes ----
  let skull = null, neck = null;
  const eyes = [];
  gltf.scene.traverse((m) => {
    if (!m.isMesh || !/^skin:/.test(m.material.name)) return;
    const head = headWeight(m);
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox;
    if (head > 0.9 && (!skull || m.geometry.getAttribute("position").count > skull.geometry.getAttribute("position").count)) skull = m;
    else if (head < 0.1 && Math.abs((b.min.x + b.max.x) / 2) < 0.02 && Math.abs(b.min.y - F.neckSpan.bottom) < 0.02 && Math.abs(b.max.y - F.neckSpan.top) < 0.02) neck = m;
  });
  for (const e of CH.faceLandmarks(cls, 0).eyes) eyes.push(e.centre);
  if (!skull || !neck) { say(false, `could not find the skull (${!!skull}) and the neck (${!!neck}) in ${file}`); continue; }

  // ---- the crown: the step the field mirrors ----
  const sb = skull.geometry.boundingBox;
  const crown = F.headY + (() => { const o = new THREE.Vector3(); F.surface(0, Math.PI / 2, o); return o.y; })();
  // ---- the eyes: the UV the eye textures are laid out for ----
  {
    let sclera = null, iris = null;
    gltf.scene.traverse((m) => {
      if (!m.isMesh || headWeight(m) < 0.9) return;
      if (m.material.name === `m_${CH.SKIN_TONES[CH.faceTraits(0).tone].sclera.toString(16)}` || m.material.name === "m_655d50") sclera = m;
      if (m.material.name === `m_${CH.IRIS_COLORS[CH.faceTraits(0).iris].toString(16)}` || m.material.name === "m_241810") iris = m;
    });
    const L = CH.faceLandmarks(cls, 0);
    if (!iris || !sclera) say(false, `could not find the sclera (${!!sclera}) and the iris (${!!iris}) parts`);
    else {
      // iris: the angle and the radius, in the eye's own frame (head x, head y; the export mirrors x)
      const p = iris.geometry.getAttribute("position"), uv = iris.geometry.getAttribute("uv");
      const rI = L.eyes[0].irisR;
      let n = 0, bad = 0, worst = 0, sr = 0, srr = 0, sv = 0, svv = 0, srv = 0, nr = 0;
      for (let i = 0; i < p.count; i++) {
        const X = -p.getX(i), Y = p.getY(i) - F.headY;
        const e = L.eyes.reduce((a, b) => (Math.hypot(X - a.iris[0], Y - (a.iris[1] - F.headY)) < Math.hypot(X - b.iris[0], Y - (b.iris[1] - F.headY)) ? a : b));
        const dx = X - e.iris[0], dy = Y - (e.iris[1] - F.headY), r = Math.hypot(dx, dy) / rI;
        if (r > 1.25) continue;
        nr++; sr += r; srr += r * r; sv += uv.getY(i); svv += uv.getY(i) ** 2; srv += r * uv.getY(i);
        if (r < 0.15) continue;
        const want = (((-Math.atan2(dy, dx)) / (2 * Math.PI)) % 1 + 1) % 1;
        const d = Math.abs(uv.getX(i) - want), dd = Math.min(d, 1 - d);
        n++; worst = Math.max(worst, dd); if (dd > 0.06) bad++;
      }
      const corr = (srv / nr - (sr / nr) * (sv / nr)) / Math.sqrt((srr / nr - (sr / nr) ** 2) * (svv / nr - (sv / nr) ** 2));
      say(bad / n < 0.05 && corr < -0.97, `iris UV is polar (u = -angle/2pi: ${bad} of ${n} vertices more than 0.06 of a turn off, worst ${worst.toFixed(3)}; v = 1 - radius over the iris's: corr ${corr.toFixed(3)}, glTF's v runs down the image)`);
      // sclera: u across the aperture (medial <-> lateral) and v lower <-> upper margin
      const ps = sclera.geometry.getAttribute("position"), us = sclera.geometry.getAttribute("uv");
      let a1 = 0, a2 = 0, a11 = 0, a22 = 0, a12 = 0, m = 0, b1 = 0, b2 = 0, b11 = 0, b22 = 0, b12 = 0;
      for (let i = 0; i < ps.count; i++) {
        const X = -ps.getX(i), Y = ps.getY(i) - F.headY;
        const e = L.eyes.reduce((a, b) => (Math.hypot(X - a.centre[0], Y - (a.centre[1] - F.headY)) < Math.hypot(X - b.centre[0], Y - (b.centre[1] - F.headY)) ? a : b));
        const dx = X - e.centre[0], dy = Y - (e.centre[1] - F.headY);
        m++; a1 += dx; a2 += us.getX(i); a11 += dx * dx; a22 += us.getX(i) ** 2; a12 += dx * us.getX(i);
        b1 += dy; b2 += us.getY(i); b11 += dy * dy; b22 += us.getY(i) ** 2; b12 += dy * us.getY(i);
      }
      const cu = (a12 / m - (a1 / m) * (a2 / m)) / Math.sqrt((a11 / m - (a1 / m) ** 2) * (a22 / m - (a2 / m) ** 2));
      const cv = (b12 / m - (b1 / m) * (b2 / m)) / Math.sqrt((b11 / m - (b1 / m) ** 2) * (b22 / m - (b2 / m) ** 2));
      say(Math.abs(cu) > 0.9 && cv < -0.55, `sclera UV runs across the aperture and DOWN the lids (u against the eye's x: corr ${cu.toFixed(3)}; v against its y: corr ${cv.toFixed(3)}: v = 0 is the upper margin)`);
    }
  }

  say(Math.abs(crown - sb.max.y) * 1000 <= CROWN_MM, `crown: field ${crown.toFixed(4)} m, the GLB skull's top ${sb.max.y.toFixed(4)} m (${((crown - sb.max.y) * 1000).toFixed(2)} mm; bar ${CROWN_MM})`);

  // ---- a lever moves the head, before the map is written ----
  const dy = LEVER === "shift" ? 0.006 : 0;
  const mirror = LEVER !== "mirror";

  for (const [label, mesh, kind] of [["skull", skull, "head"], ["neck", neck, "neck"]]) {
    const geo = mesh.geometry;
    const pos = geo.getAttribute("position");
    const n0 = pos.count;
    // reconstruction residual, taken BEFORE writeUv changes the vertex count
    const inv = { fi: 0, fj: 0, err: 0 };
    const surf = [], lid = [], ear = [], all = [];
    if (kind === "head") {
      for (let i = 0; i < n0; i++) {
        const x = (mirror ? -pos.getX(i) : pos.getX(i)), y = pos.getY(i) - F.headY - dy, z = pos.getZ(i);
        fm.grid.invert(x, y, z, inv);
        const mm = inv.err * 1000; all.push(mm);
        const nearEye = eyes.some((c) => Math.hypot(pos.getX(i) - -c[0], pos.getY(i) - c[1], pos.getZ(i) - c[2]) < 0.026);
        const isEar = Math.abs(x) > 0.085 && z < 0.03;
        (nearEye ? lid : isEar ? ear : surf).push(mm);
      }
    }
    // write the uv with the lever's placement and read the fidelity back
    if (dy !== 0) { for (let i = 0; i < n0; i++) pos.setY(i, pos.getY(i) + dy); }
    const dup = fm.writeUv(geo, kind, mirror);
    if (dy !== 0) { const p2 = geo.getAttribute("position"); for (let i = 0; i < p2.count; i++) p2.setY(i, p2.getY(i) - dy); }
    const p = geo.getAttribute("position"), uv = geo.getAttribute("uv");
    const L = kind === "head" ? fm.head : fm.neck;
    const truth = new THREE.Color(), got = new THREE.Color();
    const rel = [], relByPart = { surface: [], lid: [], ear: [] };
    for (let i = 0; i < p.count; i++) {
      const bx = -p.getX(i);
      F.complexion(mirror ? bx : -bx, p.getY(i), p.getZ(i), truth);
      fm.sample(kind, uv.getX(i) / L.scaleU, uv.getY(i) / L.scaleV, got);
      const e = Math.max(Math.abs(got.r - truth.r) / truth.r, Math.abs(got.g - truth.g) / truth.g, Math.abs(got.b - truth.b) / truth.b);
      rel.push(e);
      if (kind === "head" && i < n0) {
        const nearEye = eyes.some((c) => Math.hypot(p.getX(i) - -c[0], p.getY(i) - c[1], p.getZ(i) - c[2]) < 0.026);
        (nearEye ? relByPart.lid : Math.abs(bx) > 0.085 && p.getZ(i) < 0.03 ? relByPart.ear : relByPart.surface).push(e);
      }
    }
    // the seam: no triangle spans more than half the map in u
    const idx = geo.getIndex(); let span = 0;
    for (let t = 0; t < idx.count; t += 3) {
      const us = [0, 1, 2].map((q) => uv.getX(idx.getX(t + q)) / L.scaleU);
      const vs = [0, 1, 2].map((q) => uv.getY(idx.getX(t + q)) / L.scaleV);
      if (kind === "head" && vs.some((v) => v < 0.02 || v > 0.98)) continue;   // a pole has no azimuth
      if (kind === "neck" && [0, 1, 2].some((q) => { const st = F.neckAt(Math.max(F.neckSpan.bottom, Math.min(F.neckSpan.top, p.getY(idx.getX(t + q))))); return Math.hypot(-p.getX(idx.getX(t + q)) / st.hw, (p.getZ(idx.getX(t + q)) - st.z) / st.hd) < 0.05; })) continue;
      span = Math.max(span, Math.max(...us) - Math.min(...us));
    }
    console.log(`  ${label}: ${n0} vertices, ${dup} duplicated to cut the seam; widest triangle in u ${span.toFixed(3)} of the map`);
    if (kind === "head") {
      console.log(`    reconstruction, mm to the procedural surface   skull surface ${fmt(surf)}`);
      console.log(`                                                   eyelids       ${fmt(lid)}   (stand off the socket by design)`);
      console.log(`                                                   ears          ${fmt(ear)}   (stand off the skull by design)`);
      say(pct(surf, 0.95) <= SURFACE_P95_MM && pct(surf, 0.5) <= SURFACE_P50_MM, `skull surface reconstructs to p50 ${pct(surf, 0.5).toFixed(2)} / p95 ${pct(surf, 0.95).toFixed(2)} mm (bars ${SURFACE_P50_MM} / ${SURFACE_P95_MM})`);
    }
    const r50 = pct(rel, 0.5), r95 = pct(rel, 0.95);
    console.log(`    fidelity, relative error of the map against the field at the vertex   all ${r50.toFixed(4)} / ${r95.toFixed(4)} / ${Math.max(...rel).toFixed(4)} (p50 / p95 / max)`);
    if (kind === "head") for (const k of ["surface", "lid", "ear"]) console.log(`      ${k.padEnd(8)} p50 ${pct(relByPart[k], 0.5).toFixed(4)}  p95 ${pct(relByPart[k], 0.95).toFixed(4)}  n=${relByPart[k].length}`);
    say(r50 <= FIDELITY_P50 && r95 <= FIDELITY_P95, `${label} complexion fidelity p50 ${r50.toFixed(4)} / p95 ${r95.toFixed(4)} (bars ${FIDELITY_P50} / ${FIDELITY_P95})`);
    say(span <= 0.5, `${label} seam: widest triangle spans ${span.toFixed(3)} of the map in u (bar 0.5)`);
  }
}
console.log(LEVER
  ? (red ? `[facemap] LEVER ${LEVER}: ${red} reading(s) went red, so the ruler is reading the head` : `[facemap] LEVER ${LEVER}: NOTHING went red. The ruler does not notice the constant it claims to depend on`)
  : (red ? `[facemap] FAIL: ${red} reading(s) red` : "[facemap] PASS"));
process.exit(LEVER ? (red ? 0 : 1) : (red ? 1 : 0));
