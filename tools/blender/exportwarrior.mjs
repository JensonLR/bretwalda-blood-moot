#!/usr/bin/env node
// EXPORTWARRIOR — a whole procedural warrior, out of the code and into OBJ.
//
//   node tools/blender/exportwarrior.mjs [--cls huscarl] [--seed 13] [--helm helm_iron] [--beard full]
//
// docs/REBUILD-PLAN.md: the code's own builders are the spec. This transpiles
// characters.ts, calls `buildCharacter` with the raw material set, walks the
// built group and writes every mesh as a named OBJ object with its material's
// colour in a sidecar MTL — head, face, hair, beard, torso, limbs, kit —
// baked to world space in the rig's rest pose. Blender imports it as parts.
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import * as THREE from "three";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, ".exportwarrior");
const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const CLS = flag("cls", "huscarl"); const SEED = Number(flag("seed", 13));
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts", "--outDir", ".exportwarrior", "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"], { cwd: ROOT, encoding: "utf8" });
const emitted = []; const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = resolve(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f); } };
if (existsSync(OUT)) walk(OUT);
for (const f of emitted) {
  const src = readFileSync(f, "utf8");
  const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c))
    .replace(/(from\s+")@\/game\/([^"]*)(")/g, (m, a, b, c) => a + pathToFileURL(resolve(ROOT, "src/game", b)).href + c);
  if (fixed !== src) writeFileSync(f, fixed);
}
const built = emitted.find((f) => f.endsWith("characters.js"));
if (!built) { console.error("[exportwarrior] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || "")); process.exit(2); }
const { buildCharacter, defaultAppearance } = await import(pathToFileURL(built).href);
const ap = { ...defaultAppearance(CLS) };
if (flag("helm", null)) ap.helm = flag("helm", null).replace(/^helm_/, "");
if (flag("beard", null)) ap.beardStyle = flag("beard", null);
const b = buildCharacter(CLS, ap, 0x5a6630, undefined, "high", SEED);
b.group.updateMatrixWorld(true);
// THE HIERARCHY, so the mesh can be posed: every part is tagged with the pivot
// it hangs from (the builder's own limb groups), and a sidecar carries each
// pivot's world position plus both hand mounts' full world transforms — the
// frames the game attaches weapons and shields in. Blender rebuilds the tree
// from these; glTF keeps it; Unity drives it.
const PIVOTS = [["RightArm", b.rightArm], ["LeftArm", b.leftArm], ["RightLeg", b.rightLeg], ["LeftLeg", b.leftLeg], ["Head", b.head], ["Cloak", b.cloak]].filter(([, g]) => g);
const pivotOf = (o) => { let x = o; while (x && x !== b.group) { for (const [name, g] of PIVOTS) if (x === g) return name; x = x.parent; } return "Torso"; };
const handOf = (arm) => arm.getObjectByName("handMount") ?? arm.children[arm.children.length - 1];
const worldOf = (o) => { o.updateWorldMatrix(true, false); const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); o.matrixWorld.decompose(pos, q, sc); return { position: [pos.x, pos.y, pos.z], quaternion: [q.x, q.y, q.z, q.w] }; };
const sockets = { pivots: {}, hands: { HandR: worldOf(handOf(b.rightArm)), HandL: worldOf(handOf(b.leftArm)) } };
for (const [name, g] of PIVOTS) sockets.pivots[name] = worldOf(g);
sockets.pivots.Torso = worldOf(b.torso);
const v = [], vn = [], objects = [], mtl = new Map();
let base = 1, parts = 0, tris = 0;
const nm = new THREE.Matrix3(); const p = new THREE.Vector3(); const n = new THREE.Vector3();
const nameOf = (o) => { const path = []; let x = o; while (x && x !== b.group) { if (x.name) path.unshift(x.name.replace(/[^A-Za-z0-9_.-]/g, "_")); x = x.parent; } return path.join("/") || "part"; };
b.group.traverse((o) => {
  if (!o.isMesh || !o.visible || !o.geometry) return;
  let g = o.geometry; if (!g.getAttribute("position")) return;
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  const mat = mats[0]; const col = mat && mat.color ? mat.color : new THREE.Color(0.7, 0.7, 0.7);
  const mname = (mat && mat.name) || `m_${col.getHexString()}`;
  if (!mtl.has(mname)) mtl.set(mname, { col, rough: mat?.roughness ?? 0.8, metal: mat?.metalness ?? 0, emissive: mat?.emissive });
  const pos = g.getAttribute("position"), nor = g.getAttribute("normal");
  nm.getNormalMatrix(o.matrixWorld);
  const faces = [];
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); v.push(`v ${p.x.toFixed(5)} ${p.y.toFixed(5)} ${p.z.toFixed(5)}`);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); vn.push(`vn ${n.x.toFixed(4)} ${n.y.toFixed(4)} ${n.z.toFixed(4)}`);
  }
  const idx = g.index;
  const count = idx ? idx.count : pos.count;
  for (let i = 0; i + 2 < count; i += 3) {
    const a = (idx ? idx.getX(i) : i) + base, c = (idx ? idx.getX(i + 1) : i + 1) + base, d = (idx ? idx.getX(i + 2) : i + 2) + base;
    faces.push(`f ${a}//${a} ${c}//${c} ${d}//${d}`);
  }
  tris += faces.length; parts++;
  objects.push(`o ${pivotOf(o)}__${nameOf(o)}_${parts}\nusemtl ${mname}\ns 1\n${faces.join("\n")}`);
  base += pos.count;
});
mkdirSync(resolve(ROOT, "art/blender"), { recursive: true });
const stem = `warrior-${CLS}-${SEED}`;
const mtlLines = ["# Bretwalda warrior materials — base colours from the code's raw material set"];
for (const [name, m] of mtl) mtlLines.push(`newmtl ${name}`, `Kd ${m.col.r.toFixed(4)} ${m.col.g.toFixed(4)} ${m.col.b.toFixed(4)}`, `Ks ${(m.metal * 0.5).toFixed(3)} ${(m.metal * 0.5).toFixed(3)} ${(m.metal * 0.5).toFixed(3)}`, `Ns ${Math.round((1 - m.rough) * 200)}`, `Pr ${m.rough.toFixed(3)}`, `Pm ${m.metal.toFixed(3)}`, m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0 ? `Ke ${m.emissive.r.toFixed(3)} ${m.emissive.g.toFixed(3)} ${m.emissive.b.toFixed(3)}` : "", "");
writeFileSync(resolve(ROOT, `art/blender/${stem}.mtl`), mtlLines.join("\n"));
writeFileSync(resolve(ROOT, `art/blender/${stem}.obj`), [`# Bretwalda warrior — ${CLS}, seed ${SEED}; metres, Y up, face toward +Z; rest pose, world space.`, `mtllib ${stem}.mtl`, ...v, ...vn, ...objects].join("\n") + "\n");
writeFileSync(resolve(ROOT, `art/blender/${stem}.sockets.json`), JSON.stringify(sockets, null, 1));
// THE WEAPONS AND THE SHIELD, built in the fist's own frame the way the game
// attaches them, so a socket at the hand's world transform places them.
const { buildWeaponForClass, buildOffhandFor, buildShield } = await import(pathToFileURL(built).href);
const ARMS = { huscarl: ["sword_board", "dane_axe"], warden: ["gar"], runekeeper: ["twin_seax", "sword_seax"], berserker: ["hand_axes", "twin_beards"] };
const writeGroup = (group, stemName) => {
  group.updateMatrixWorld(true);
  const V = [], VN = [], OBJS = []; let base2 = 1, n2 = 0, t2 = 0; const M2 = new Map();
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry?.getAttribute("position")) return;
    const g = o.geometry; if (!g.getAttribute("normal")) g.computeVertexNormals();
    const mat = Array.isArray(o.material) ? o.material[0] : o.material; const col = mat?.color ?? new THREE.Color(0.6, 0.6, 0.6);
    const mname = (mat && mat.name) || `m_${col.getHexString()}`; if (!M2.has(mname)) M2.set(mname, { col, rough: mat?.roughness ?? 0.6, metal: mat?.metalness ?? 0 });
    const pos = g.getAttribute("position"), nor = g.getAttribute("normal"); nm.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); V.push(`v ${p.x.toFixed(5)} ${p.y.toFixed(5)} ${p.z.toFixed(5)}`); n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); VN.push(`vn ${n.x.toFixed(4)} ${n.y.toFixed(4)} ${n.z.toFixed(4)}`); }
    const idx = g.index, count = idx ? idx.count : pos.count, F = [];
    for (let i = 0; i + 2 < count; i += 3) { const a = (idx ? idx.getX(i) : i) + base2, c = (idx ? idx.getX(i + 1) : i + 1) + base2, d = (idx ? idx.getX(i + 2) : i + 2) + base2; F.push(`f ${a}//${a} ${c}//${c} ${d}//${d}`); }
    t2 += F.length; n2++; OBJS.push(`o ${stemName}_${n2}\nusemtl ${mname}\ns 1\n${F.join("\n")}`); base2 += pos.count;
  });
  const ML = ["# Bretwalda weapon materials"]; for (const [name, m] of M2) ML.push(`newmtl ${name}`, `Kd ${m.col.r.toFixed(4)} ${m.col.g.toFixed(4)} ${m.col.b.toFixed(4)}`, `Pr ${m.rough.toFixed(3)}`, `Pm ${m.metal.toFixed(3)}`, "");
  writeFileSync(resolve(ROOT, `art/blender/${stemName}.mtl`), ML.join("\n"));
  writeFileSync(resolve(ROOT, `art/blender/${stemName}.obj`), [`# Bretwalda ${stemName}; fist frame, metres`, `mtllib ${stemName}.mtl`, ...V, ...VN, ...OBJS].join("\n") + "\n");
  return { parts: n2, tris: t2 };
};
for (const arms of ARMS[CLS] ?? []) {
  const w = buildWeaponForClass(CLS, undefined, undefined, arms); const r = writeGroup(w, `weapon-${arms}`);
  const off = buildOffhandFor(CLS, undefined, undefined, arms); const r2 = off ? writeGroup(off, `offhand-${arms}`) : null;
  console.log(`[exportwarrior]   weapon-${arms}: ${r.parts} parts, ${r.tris} tris${r2 ? `; offhand ${r2.parts} parts` : ""}`);
}
if (CLS === "huscarl") { const sh = buildShield(); const r = writeGroup(sh, "shield"); console.log(`[exportwarrior]   shield: ${r.parts} parts, ${r.tris} tris`); }
rmSync(OUT, { recursive: true, force: true });
console.log(`[exportwarrior] art/blender/${stem}.obj: ${parts} parts, ${v.length} vertices, ${tris} triangles, ${mtl.size} materials`);
