#!/usr/bin/env node
// EXPORTCOSMETICS — every helm, beard and hair style the shop sells, as a prop
// in the HEAD's frame, per class: the man is built with the variant and again
// without it, and the parts that differ are the variant. Written as
// <slot>-<cls>-<id>.obj + .mtl for prop.py / hairprop.py.
//   node tools/blender/exportcosmetics.mjs [--class huscarl]
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import * as THREE from "three";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const CLASSES = flag("class", null) ? [flag("class", null)] : ["huscarl", "warden", "runekeeper", "berserker"];
const OUT = resolve(ROOT, ".exportrig");
if (!existsSync(resolve(OUT, "client/render/anim.js"))) {
  rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
  spawnSync("npx", ["tsc", "src/game/client/render/anim.ts", "--outDir", ".exportrig", "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck", "--jsx", "preserve"], { cwd: ROOT, encoding: "utf8" });
  const emitted = []; const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = resolve(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f); } }; walk(OUT);
  for (const f of emitted) { const src = readFileSync(f, "utf8"); const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c)).replace(/(from\s+")@\/game\/([^"]*)(")/g, (m, a, b, c) => a + pathToFileURL(resolve(ROOT, "src/game", b)).href + c); if (fixed !== src) writeFileSync(f, fixed); }
}
const find = (n) => { const out = []; const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = resolve(d, e.name); if (e.isDirectory()) walk(f); else if (f.endsWith("/" + n)) out.push(f); } }; walk(OUT); return out[0]; };
globalThis.window ??= { location: { search: "" }, innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, setItem() {} } };
globalThis.navigator ??= { userAgent: "node", maxTouchPoints: 0, hardwareConcurrency: 8 };
globalThis.document ??= { createElement: () => ({ getContext: () => null, width: 1, height: 1 }) };
const { createTextureLibrary } = await import(pathToFileURL(find("textures.js")).href);
const { createMaterialLibrary } = await import(pathToFileURL(find("materials.js")).href);
const { createWarriorRig } = await import(pathToFileURL(find("anim.js")).href);
const { defaultAppearance } = await import(pathToFileURL(find("characters.js")).href);
const settings = { anisotropy: 8, textureSize: 512, spriteSize: 128, tier: "high", dynamicLights: true, instancing: false, propDensity: 1, shadows: true, softShadows: true, shadowMapSize: 2048 };
const textures = createTextureLibrary({ capabilities: { getMaxAnisotropy: () => 8 } }, settings);
const materials = createMaterialLibrary(textures, settings);
const ARMS = { huscarl: "sword_board", warden: "gar", runekeeper: "twin_seax", berserker: "hand_axes" };
const HELMS = ["iron", "nasal", "hood", "ridge", "spectacle", "boar", "crowned", "wyrm", "suttonhoo"];
const BEARDS = ["short", "full", "forked", "braided"];
const HAIRS = ["short", "long", "braids"];
const shown = (o) => { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; };
const sigOf = (o) => { const g = o.geometry; g.computeBoundingBox(); const bb = g.boundingBox; const m = Array.isArray(o.material) ? o.material[0] : o.material; return `${m?.name ?? ""}|${g.getAttribute("position").count}|${[bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map((x) => x.toFixed(3)).join(",")}`; };
const meshesOf = (r) => { const out = []; r.body.traverse((o) => { if (o.isMesh && shown(o) && o.geometry?.getAttribute("position")) { const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m && m.colorWrite === false) return; if (/shadow/i.test(o.name)) return; out.push(o); } }); return out; };
const nm = new THREE.Matrix3(); const p = new THREE.Vector3(); const n = new THREE.Vector3();
const writeParts = (meshes, frame, stem) => {
  const inv = frame.clone().invert(); const v = [], vn = [], vt = [], objects = [], mtl = new Map(); let base = 1, np = 0;
  for (const o of meshes) {
    const g = o.geometry; if (!g.getAttribute("normal")) g.computeVertexNormals();
    const M = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld); nm.getNormalMatrix(M);
    const mat = Array.isArray(o.material) ? o.material[0] : o.material; const col = mat?.color ?? new THREE.Color(0.7, 0.7, 0.7);
    const mname = ((mat && mat.name) || `m_${col.getHexString()}`).replace(/[^A-Za-z0-9_.:-]/g, "_");
    if (!mtl.has(mname)) mtl.set(mname, { col, rough: mat?.roughness ?? 0.8, metal: mat?.metalness ?? 0 });
    const pos = g.getAttribute("position"), nor = g.getAttribute("normal"), uv = g.getAttribute("uv");
    for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(M); v.push(`v ${p.x.toFixed(5)} ${p.y.toFixed(5)} ${p.z.toFixed(5)}`); n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); vn.push(`vn ${n.x.toFixed(4)} ${n.y.toFixed(4)} ${n.z.toFixed(4)}`); vt.push(uv ? `vt ${uv.getX(i).toFixed(5)} ${uv.getY(i).toFixed(5)}` : "vt 0 0"); }
    const idx = g.index, count = idx ? idx.count : pos.count, F = [];
    for (let i = 0; i + 2 < count; i += 3) { const a = (idx ? idx.getX(i) : i) + base, c = (idx ? idx.getX(i + 1) : i + 1) + base, d = (idx ? idx.getX(i + 2) : i + 2) + base; F.push(`f ${a}/${a}/${a} ${c}/${c}/${c} ${d}/${d}/${d}`); }
    np++; objects.push(`o ${stem}_${np}\nusemtl ${mname}\ns 1\n${F.join("\n")}`); base += pos.count;
  }
  const ML = ["# Bretwalda cosmetic"]; for (const [name, m] of mtl) ML.push(`newmtl ${name}`, `Kd ${m.col.r.toFixed(4)} ${m.col.g.toFixed(4)} ${m.col.b.toFixed(4)}`, `Pr ${m.rough.toFixed(3)}`, `Pm ${m.metal.toFixed(3)}`, "");
  writeFileSync(resolve(ROOT, `art/blender/${stem}.mtl`), ML.join("\n"));
  writeFileSync(resolve(ROOT, `art/blender/${stem}.obj`), [`# Bretwalda ${stem}; head frame, metres, Y up, face +Z`, `mtllib ${stem}.mtl`, ...v, ...vn, ...vt, ...objects].join("\n") + "\n");
  return np;
};
mkdirSync(resolve(ROOT, "art/blender"), { recursive: true });
const manifest = {};
for (const CLS of CLASSES) {
  const player = { id: `cos-13`, name: "Cos", warriorClass: CLS, arms: ARMS[CLS], team: "none", x: 0, z: 0, rotationY: 0, health: 100, maxHealth: 100, stamina: 100, maxStamina: 100, alive: true };
  const build = (patch) => { const ap = { ...defaultAppearance(CLS), ...patch }; const r = createWarriorRig(new THREE.Group(), { ...player, appearance: ap }, materials, settings); r.body.updateMatrixWorld(true); return r; };
  const variant = (slot, id, withPatch, withoutPatch) => {
    const withR = build(withPatch), bare = build(withoutPatch);
    const bareSigs = new Set(meshesOf(bare).map(sigOf));
    let parts = meshesOf(withR).filter((o) => !bareSigs.has(sigOf(o)));
    // A HELM IS NOT A HAIRCUT, though the code cuts hair to fit one. The
    // fringe is cropped under a nasal and the braid gathered under a coif, so
    // the hair and beard meshes differ from the bare-headed build too and a
    // plain difference claims them: every helm prop was shipping a full copy
    // of the man's beard and hair, which is most of what the 64 props weigh
    // and would have hung a second beard on anyone who chose a helm. The hair
    // shells are exactly the meshes in a `hair:` material, so a helm keeps
    // what is not one.
    if (slot === "helm") parts = parts.filter((o) => {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      return !String(m?.name ?? "").startsWith("hair");
    });
    if (!parts.length) { console.log(`[exportcosmetics] ${CLS} ${slot} ${id}: nothing differs`); return; }
    const stem = `${slot}-${CLS}-${id}`; const np = writeParts(parts, withR.pivots.head.matrixWorld, stem);
    (manifest[CLS] ??= {})[`${slot}:${id}`] = stem; console.log(`[exportcosmetics] ${stem}: ${np} parts`);
  };
  for (const h of HELMS) variant("helm", h, { helm: h }, { helm: "none" });
  for (const b of BEARDS) variant("beard", b, { beardStyle: b }, { beardStyle: "none" });
  for (const h of HAIRS) variant("hair", h, { hairStyle: h }, { hairStyle: "shaved" });
}
writeFileSync(resolve(ROOT, "art/blender/cosmetics.json"), JSON.stringify(manifest, null, 1));
