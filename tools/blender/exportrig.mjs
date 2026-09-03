#!/usr/bin/env node
// EXPORTRIG — a warrior with the game's own skeleton: bones, and the weights
// anim.ts's articulate() paints on every limb. createWarriorRig builds the
// character, inserts the spine, splits each limb into upper/lower/wrist bones
// and binds the meshes; this writes what comes out as OBJ (rest pose, world
// space) plus warrior-<cls>.rig.json: the bone tree with world transforms,
// and for every part either the bone it rides rigidly or its per-vertex
// [bone, weight] pairs. tools/blender/rig.py builds the armature from it.
//   node tools/blender/exportrig.mjs --class huscarl [--seed 13]
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import * as THREE from "three";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const CLS = flag("class", "huscarl"); const SEED = Number(flag("seed", 13));
const OUT = resolve(ROOT, ".exportrig");
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/render/anim.ts", "--outDir", ".exportrig", "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck", "--jsx", "preserve"], { cwd: ROOT, encoding: "utf8" });
const emitted = []; const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = resolve(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f); } };
if (existsSync(OUT)) walk(OUT);
for (const f of emitted) {
  const src = readFileSync(f, "utf8");
  const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c))
    .replace(/(from\s+")@\/game\/([^"]*)(")/g, (m, a, b, c) => a + pathToFileURL(resolve(ROOT, "src/game", b)).href + c);
  if (fixed !== src) writeFileSync(f, fixed);
}
const find = (n) => emitted.find((f) => f.endsWith("/" + n));
if (!find("anim.js")) { console.error("[exportrig] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || "")); process.exit(2); }
globalThis.window ??= { location: { search: "" }, innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, setItem() {} } };
globalThis.navigator ??= { userAgent: "node", maxTouchPoints: 0, hardwareConcurrency: 8 };
globalThis.document ??= { createElement: () => ({ getContext: () => null, width: 1, height: 1 }) };
const { createTextureLibrary } = await import(pathToFileURL(find("textures.js")).href);
const { createMaterialLibrary } = await import(pathToFileURL(find("materials.js")).href);
const { createWarriorRig } = await import(pathToFileURL(find("anim.js")).href);
const settings = { anisotropy: 8, textureSize: 512, spriteSize: 128, tier: "high", dynamicLights: true, instancing: false, propDensity: 1, shadows: true, softShadows: true, shadowMapSize: 2048 };
const textures = createTextureLibrary({ capabilities: { getMaxAnisotropy: () => 8 } }, settings);
const materials = createMaterialLibrary(textures, settings);
const ARMS = { huscarl: "sword_board", warden: "gar", runekeeper: "twin_seax", berserker: "hand_axes" };
const parent = new THREE.Group();
const player = { id: `rig-${SEED}`, name: "Rig", warriorClass: CLS, arms: ARMS[CLS] ?? "sword_board", team: "none", x: 0, z: 0, rotationY: 0, health: 100, maxHealth: 100, stamina: 100, maxStamina: 100, alive: true };
const rig = createWarriorRig(parent, player, materials, settings);
const body = rig.body; body.updateMatrixWorld(true);
// NAMES for the game's anonymous bones and groups, by identity.
const pv = rig.pivots; const names = new Map();
const nameIt = (o, n) => { if (o) names.set(o, n); };
nameIt(body, "Hips"); nameIt(pv.chest, "Spine"); nameIt(pv.head, "Head"); nameIt(pv.cloak, "Cloak");
nameIt(pv.rightArm, "RightShoulder"); nameIt(pv.leftArm, "LeftShoulder"); nameIt(pv.rightLeg, "RightHip"); nameIt(pv.leftLeg, "LeftHip");
nameIt(pv.elbowR, "RightElbow"); nameIt(pv.elbowL, "LeftElbow"); nameIt(pv.wristR, "RightWrist"); nameIt(pv.wristL, "LeftWrist"); nameIt(pv.kneeR, "RightKnee"); nameIt(pv.kneeL, "LeftKnee");
if (pv.elbowR) nameIt(pv.elbowR.parent, "RightUpperArm"); if (pv.elbowL) nameIt(pv.elbowL.parent, "LeftUpperArm");
if (pv.kneeR) nameIt(pv.kneeR.parent, "RightThigh"); if (pv.kneeL) nameIt(pv.kneeL.parent, "LeftThigh");
(pv.drape ?? []).forEach((b, i) => nameIt(b, i === 0 ? "CloakYoke" : `Drape${i}`));
const isBoneLike = (o) => names.has(o);
const nearestNamed = (o) => { let x = o.parent; while (x) { if (names.has(x)) return names.get(x); x = x.parent; } return "Hips"; };
const worldOf = (o) => { const pos = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); o.matrixWorld.decompose(pos, q, s); return { position: [pos.x, pos.y, pos.z], quaternion: [q.x, q.y, q.z, q.w] }; };
const bones = [];
for (const [o, name] of names) bones.push({ name, parent: o === body ? null : nearestNamed(o), ...worldOf(o) });
// Hand mounts, for the weapons.
const mountOf = (arm) => arm.getObjectByName("handMount");
const hands = { HandR: worldOf(mountOf(pv.rightArm)), HandL: worldOf(mountOf(pv.leftArm)) };
// THE MESHES: rest-pose world-space OBJ with per-part binding.
const v = [], vn = [], vt = [], objects = [], mtl = new Map(), parts = [];
let base = 1, np = 0, tris = 0; const nm = new THREE.Matrix3(); const p = new THREE.Vector3(); const n = new THREE.Vector3();
body.traverse((o) => {
  if (!o.isMesh || !o.visible || !o.geometry?.getAttribute("position")) return;
  if (o === rig.blob || o.name === "weapon" || o.parent?.name === "weapon") return;
  let inWeapon = false; for (let x = o; x; x = x.parent) if (x === rig.weapon || x === rig.offhand || x === rig.shield) inWeapon = true;
  if (inWeapon) return;
  const g = o.geometry; if (!g.getAttribute("normal")) g.computeVertexNormals();
  const mat = Array.isArray(o.material) ? o.material[0] : o.material; const col = mat?.color ?? new THREE.Color(0.7, 0.7, 0.7);
  const mname = ((mat && mat.name) || `m_${col.getHexString()}`).replace(/[^A-Za-z0-9_.:-]/g, "_");
  if (!mtl.has(mname)) mtl.set(mname, { col, rough: mat?.roughness ?? 0.8, metal: mat?.metalness ?? 0, emissive: mat?.emissive });
  const pos = g.getAttribute("position"), nor = g.getAttribute("normal"), uv = g.getAttribute("uv"); nm.getNormalMatrix(o.matrixWorld);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); v.push(`v ${p.x.toFixed(5)} ${p.y.toFixed(5)} ${p.z.toFixed(5)}`);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); vn.push(`vn ${n.x.toFixed(4)} ${n.y.toFixed(4)} ${n.z.toFixed(4)}`);
    vt.push(uv ? `vt ${uv.getX(i).toFixed(5)} ${uv.getY(i).toFixed(5)}` : "vt 0 0");
  }
  const idx = g.index, count = idx ? idx.count : pos.count, F = [];
  for (let i = 0; i + 2 < count; i += 3) { const a = (idx ? idx.getX(i) : i) + base, c = (idx ? idx.getX(i + 1) : i + 1) + base, d = (idx ? idx.getX(i + 2) : i + 2) + base; F.push(`f ${a}/${a}/${a} ${c}/${c}/${c} ${d}/${d}/${d}`); }
  np++; tris += F.length;
  const oname = `part_${np}`;
  const part = { obj: oname, material: mname, vertices: pos.count, first: base - 1 };
  if (o.isSkinnedMesh && g.getAttribute("skinIndex")) {
    const si = g.getAttribute("skinIndex"), sw = g.getAttribute("skinWeight"); const boneNames = o.skeleton.bones.map((b) => names.get(b) ?? "Hips");
    const weights = []; for (let i = 0; i < pos.count; i++) { const row = []; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > 0.001) row.push(boneNames[si.getComponent(i, k)], Math.round(w * 1000) / 1000); } weights.push(row); }
    part.skin = weights;
  } else part.bone = nearestNamed(o);
  parts.push(part);
  objects.push(`o ${oname}\nusemtl ${mname}\ns 1\n${F.join("\n")}`); base += pos.count;
});
mkdirSync(resolve(ROOT, "art/blender"), { recursive: true });
const stem = `warrior-${CLS}.rig`;
const ML = ["# Bretwalda warrior materials"]; for (const [name, m] of mtl) ML.push(`newmtl ${name}`, `Kd ${m.col.r.toFixed(4)} ${m.col.g.toFixed(4)} ${m.col.b.toFixed(4)}`, `Pr ${m.rough.toFixed(3)}`, `Pm ${m.metal.toFixed(3)}`, m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0 ? `Ke ${m.emissive.r.toFixed(3)} ${m.emissive.g.toFixed(3)} ${m.emissive.b.toFixed(3)}` : "", "");
writeFileSync(resolve(ROOT, `art/blender/${stem}.mtl`), ML.join("\n"));
writeFileSync(resolve(ROOT, `art/blender/${stem}.obj`), [`# Bretwalda warrior ${CLS} with the game's skeleton; metres, Y up, face +Z, rest pose, world space`, `mtllib ${stem}.mtl`, ...v, ...vn, ...vt, ...objects].join("\n") + "\n");
writeFileSync(resolve(ROOT, `art/blender/${stem}.json`), JSON.stringify({ cls: CLS, bones, hands, parts, headTop: rig.headTop, reach: rig.reach }, null, 0));
const skinned = parts.filter((x) => x.skin).length;
console.log(`[exportrig] ${CLS}: ${bones.length} bones, ${parts.length} parts (${skinned} skinned), ${tris} triangles -> art/blender/${stem}.obj/.json`);
