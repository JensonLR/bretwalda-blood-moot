#!/usr/bin/env node
// EXPORTWORLD — a whole ground, out of the code: the village, the moor, the
// fort, the camp, the dyke, as one OBJ with every material's maps beside it.
//
//   node tools/blender/exportworld.mjs [--ground saxon_village]
//
// render/world.ts builds a ground from a GroundDef with the real material and
// texture libraries, and none of it needs a browser: the texture library is
// built with a stub renderer (docs/REBUILD-PLAN.md, the head's lesson), the
// material library on top of it, and createWorld into a bare THREE.Scene.
// Every mesh is written in world space with UVs; instanced meshes are expanded;
// each material's base, normal, roughness and metalness maps are dumped as PNG
// under art/blender/tex-world/ with the repeat the material carries, in a
// sidecar the Blender half (tools/blender/world.py) reads.
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { deflateSync } from "zlib";
import * as THREE from "three";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, ".exportworld");
const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const GROUND = flag("ground", "saxon_village");
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/render/world.ts", "src/game/client/render/moor.ts", "src/game/client/render/fort.ts", "src/game/client/render/camp.ts", "src/game/client/render/dyke.ts", "--outDir", ".exportworld", "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"], { cwd: ROOT, encoding: "utf8" });
const emitted = []; const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = resolve(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f); } };
if (existsSync(OUT)) walk(OUT);
for (const f of emitted) {
  const src = readFileSync(f, "utf8");
  const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c))
    .replace(/(from\s+")@\/game\/([^"]*)(")/g, (m, a, b, c) => a + pathToFileURL(resolve(ROOT, "src/game", b)).href + c);
  if (fixed !== src) writeFileSync(f, fixed);
}
const find = (n) => emitted.find((f) => f.endsWith(n));
if (!find("world.js")) { console.error("[exportworld] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || "")); process.exit(2); }
// A window-free world: the sky and postfx are not imported by world.ts, but
// anything reading `window` at module load gets an empty stand-in.
globalThis.window ??= { location: { search: "" }, innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} };
globalThis.navigator ??= { userAgent: "node", maxTouchPoints: 0, hardwareConcurrency: 8 };
// A paper-thin canvas for the banner cloth (banners.ts draws its fields with
// the 2D API): fillRect lands in a byte buffer the dump can read, every other
// call is a no-op. Field and bands come through; the painted device does not
// — it is drawn with paths, and a software path rasteriser is not this tool's
// job. The Blender/Unity banners fly plain cloth until the devices are baked.
const cssColor = (c) => {
  if (typeof c !== "string") return [0, 0, 0, 255];
  let m = /^#([0-9a-f]{6})$/i.exec(c.trim()); if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255, 255]; }
  m = /^rgba?\(([^)]+)\)$/i.exec(c.trim()); if (m) { const a = m[1].split(",").map(Number); return [a[0] | 0, a[1] | 0, a[2] | 0, Math.round((a[3] ?? 1) * 255)]; }
  return [128, 128, 128, 255];
};
// A REAL canvas when @napi-rs/canvas is installed (it is, as a dev
// dependency): the banners' painted devices are drawn with paths, and only
// a real 2D context takes those. The byte-buffer stand-in below remains
// the fallback, and gives plain cloth.
let napiCanvas = null;
try { napiCanvas = (await import("@napi-rs/canvas")).createCanvas; } catch { /* stand-in */ }
if (napiCanvas) globalThis.document ??= { createElement: (tag) => (tag === "canvas" ? napiCanvas(300, 150) : {}) };
globalThis.document ??= { createElement: (tag) => {
  if (tag !== "canvas") return {};
  const cv = { width: 300, height: 150, data: null, fillStyle: "#000", strokeStyle: "#000" };
  const ctx = new Proxy({
    fillRect(x, y, w, h) {
      if (!cv.data || cv.data.length !== cv.width * cv.height * 4) cv.data = new Uint8Array(cv.width * cv.height * 4);
      const [r, g, b, a] = cssColor(ctx.fillStyle); const al = a / 255;
      for (let yy = Math.max(0, y | 0); yy < Math.min(cv.height, y + h); yy++) for (let xx = Math.max(0, x | 0); xx < Math.min(cv.width, x + w); xx++) {
        const i = (yy * cv.width + xx) * 4; cv.data[i] = cv.data[i] * (1 - al) + r * al; cv.data[i + 1] = cv.data[i + 1] * (1 - al) + g * al; cv.data[i + 2] = cv.data[i + 2] * (1 - al) + b * al; cv.data[i + 3] = 255;
      }
    },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    measureText() { return { width: 0 }; },
  }, { get: (t, k) => (k in t ? t[k] : k === "fillStyle" || k === "strokeStyle" ? cv[k] : () => undefined), set: (t, k, v) => { if (k === "fillStyle" || k === "strokeStyle") cv[k] = v; else t[k] = v; return true; } });
  cv.getContext = () => ctx; return cv;
} };
const { createTextureLibrary } = await import(pathToFileURL(find("textures.js")).href);
const { createMaterialLibrary } = await import(pathToFileURL(find("materials.js")).href);
const { createWorld } = await import(pathToFileURL(find("world.js")).href);
// The other grounds register themselves on import; world.ts does not import them.
for (const g of ["moor.js", "fort.js", "camp.js", "dyke.js"]) if (find(g)) await import(pathToFileURL(find(g)).href);
const settings = { anisotropy: 8, textureSize: 512, spriteSize: 128, tier: "high", dynamicLights: true, instancing: false, propDensity: 1, shadows: true, softShadows: true, shadowMapSize: 2048 };
const textures = createTextureLibrary({ capabilities: { getMaxAnisotropy: () => 8 } }, settings);
const materials = createMaterialLibrary(textures, settings);
const scene = new THREE.Scene();
const t0 = Date.now();
const world = createWorld(scene, materials, settings, { ground: GROUND });
scene.updateMatrixWorld(true);
console.log(`[exportworld] ${GROUND} built in ${Date.now() - t0} ms`);
// PNG writer (same as exporttextures).
const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const png = (rgba, w, h) => { const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1); } const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]); };
const texDir = resolve(ROOT, `art/blender/tex-world/${GROUND}`); rmSync(texDir, { recursive: true, force: true }); mkdirSync(texDir, { recursive: true });
const dumped = new Map();
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const dump = (tex, stem, tint) => {
  if (!tex || !tex.image) return null;
  // A canvas image (the banner cloth): read its pixels once into the shape a DataTexture has.
  if (typeof tex.image.getContext === "function") {
    const cv = tex.image; const ctx = cv.getContext("2d"); const id = ctx.getImageData(0, 0, cv.width, cv.height);
    tex.image = { width: cv.width, height: cv.height, data: new Uint8Array(id.data.buffer, id.data.byteOffset, id.data.length) };
  }
  if (!tex.image.data) return null;
  const key = `${tex.uuid}:${tint ? tint.map((x) => x.toFixed(3)).join(",") : ""}`;
  if (dumped.has(key)) return dumped.get(key);
  const { width: w, height: h } = tex.image; let data = tex.image.data;
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) return null;
  data = data.subarray(0, w * h * 4);
  if (tint && !(tint[0] === 1 && tint[1] === 1 && tint[2] === 1)) {
    // three.js: albedo = sRGB map (decoded) × linear colour. Bake the colour
    // in and clamp, so a map-and-white material means the same thing downstream.
    const out = new Uint8Array(data.length); const lut = [0, 1, 2].map((ch) => { const t = new Uint8Array(256); for (let i = 0; i < 256; i++) t[i] = Math.round(255 * l2s(Math.min(1, s2l(i / 255) * tint[ch]))); return t; });
    for (let i = 0; i < data.length; i += 4) { out[i] = lut[0][data[i]]; out[i + 1] = lut[1][data[i + 1]]; out[i + 2] = lut[2][data[i + 2]]; out[i + 3] = data[i + 3]; }
    data = out;
  }
  const file = `${stem}.png`; writeFileSync(resolve(texDir, file), png(data, w, h)); dumped.set(key, file); return file;
};
const clamp3 = (c) => c.map((x) => Math.min(1, Math.max(0, x)));
const v = [], vn = [], vt = [], objects = [], mats = new Map();
let base = 1, parts = 0, tris = 0;
const nm = new THREE.Matrix3(); const p = new THREE.Vector3(); const n = new THREE.Vector3(); const tmp = new THREE.Matrix4();
const safe = (s) => String(s).replace(/[^A-Za-z0-9_.:-]/g, "_");
const writeMesh = (o, geometry, matrixWorld, mat) => {
  const g = geometry; if (!g?.getAttribute("position")) return;
  if (!g.getAttribute("normal")) g.computeVertexNormals();
  const col = mat?.color ?? new THREE.Color(0.6, 0.6, 0.6);
  const mname = safe((mat && mat.name) || `m_${col.getHexString()}`);
  if (!mats.has(mname)) {
    const rep = mat?.map?.repeat ? [mat.map.repeat.x, mat.map.repeat.y] : [1, 1];
    const tint = g.getAttribute("color") ? [1, 1, 1] : [col.r, col.g, col.b];
    mats.set(mname, { color: mat?.map ? [1, 1, 1] : clamp3(tint), roughness: mat?.roughness ?? 0.8, metalness: mat?.metalness ?? 0, emissive: mat?.emissive ? clamp3([mat.emissive.r, mat.emissive.g, mat.emissive.b]) : null, emissiveIntensity: mat?.emissiveIntensity ?? 1, transparent: !!mat?.transparent, opacity: mat?.opacity ?? 1, repeat: rep, vertexColors: !!g.getAttribute("color"),
      map: dump(mat?.map, `${mname}-map`, tint), normal: dump(mat?.normalMap, `${mname}-normal`), roughnessMap: dump(mat?.roughnessMap, `${mname}-roughness`), metalnessMap: dump(mat?.metalnessMap, `${mname}-metalness`), alphaMap: dump(mat?.alphaMap, `${mname}-alpha`) });
  }
  const pos = g.getAttribute("position"), nor = g.getAttribute("normal"), uv = g.getAttribute("uv"), vcol = g.getAttribute("color");
  const isGround = !!g.getAttribute("wetness");
  nm.getNormalMatrix(matrixWorld);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(matrixWorld);
    let rgb = "";
    if (vcol) {
      let r = vcol.getX(i) * col.r, gg = vcol.getY(i) * col.g, b = vcol.getZ(i) * col.b;
      if (isGround) {
        // world.ts's ground fragment: the low-frequency exposure roll and the
        // turf hue push, both functions of world position and the green excess.
        const roll = 0.84 + 0.32 * (Math.sin(p.x * 0.029 + p.z * 0.017) * 0.5 + 0.5);
        const ex = gg / Math.max(r + b, 1e-3) - 0.55; const t = Math.min(1, Math.max(0, ex / 0.42)); const mask = t * t * (3 - 2 * t) * 0.8;
        r *= roll * (1 + (0.9 - 1) * mask); gg *= roll * (1 + (1.14 - 1) * mask); b *= roll * (1 + (0.86 - 1) * mask);
      }
      rgb = ` ${Math.min(1, r).toFixed(3)} ${Math.min(1, gg).toFixed(3)} ${Math.min(1, b).toFixed(3)}`;
    }
    v.push(`v ${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)}${rgb}`);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); vn.push(`vn ${n.x.toFixed(3)} ${n.y.toFixed(3)} ${n.z.toFixed(3)}`);
    vt.push(uv ? `vt ${uv.getX(i).toFixed(4)} ${uv.getY(i).toFixed(4)}` : "vt 0 0");
  }
  const idx = g.index; const count = idx ? idx.count : pos.count; const faces = [];
  const groups = g.groups && g.groups.length ? g.groups : [{ start: 0, count, materialIndex: 0 }];
  for (const grp of groups) {
    const gm = Array.isArray(o.material) ? o.material[grp.materialIndex] : mat;
    const gname = gm === mat ? mname : safe((gm && gm.name) || `m_${(gm?.color ?? col).getHexString()}`);
    if (gm !== mat && !mats.has(gname)) mats.set(gname, { color: gm.map ? [1, 1, 1] : clamp3([gm.color?.r ?? 0.6, gm.color?.g ?? 0.6, gm.color?.b ?? 0.6]), vertexColors: !!g.getAttribute("color"), roughness: gm.roughness ?? 0.8, metalness: gm.metalness ?? 0, emissive: null, emissiveIntensity: 1, transparent: !!gm.transparent, opacity: gm.opacity ?? 1, repeat: gm.map?.repeat ? [gm.map.repeat.x, gm.map.repeat.y] : [1, 1], map: dump(gm.map, `${gname}-map`, [gm.color?.r ?? 0.6, gm.color?.g ?? 0.6, gm.color?.b ?? 0.6]), normal: dump(gm.normalMap, `${gname}-normal`), roughnessMap: dump(gm.roughnessMap, `${gname}-roughness`), metalnessMap: null, alphaMap: dump(gm.alphaMap, `${gname}-alpha`) });
    const end = Math.min(count, grp.start + grp.count); const F = [];
    for (let i = grp.start; i + 2 < end; i += 3) { const a = (idx ? idx.getX(i) : i) + base, c = (idx ? idx.getX(i + 1) : i + 1) + base, d = (idx ? idx.getX(i + 2) : i + 2) + base; F.push(`f ${a}/${a}/${a} ${c}/${c}/${c} ${d}/${d}/${d}`); }
    if (F.length) { tris += F.length; parts++; objects.push(`o ${safe(o.name || "part")}_${parts}\nusemtl ${gname}\ns 1\n${F.join("\n")}`); }
  }
  base += pos.count;
};
scene.traverse((o) => {
  if (!o.visible) return;
  if (o.isInstancedMesh) {
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, tmp); writeMesh(o, o.geometry, new THREE.Matrix4().multiplyMatrices(o.matrixWorld, tmp), mat); }
  } else if (o.isMesh && !o.isSkinnedMesh) {
    writeMesh(o, o.geometry, o.matrixWorld, Array.isArray(o.material) ? o.material[0] : o.material);
  }
});
mkdirSync(resolve(ROOT, "art/blender"), { recursive: true });
const stem = `ground-${GROUND}`;
const mtl = ["# Bretwalda ground materials"]; for (const [name, m] of mats) mtl.push(`newmtl ${name}`, `Kd ${m.color.map((x) => x.toFixed(4)).join(" ")}`, `Pr ${m.roughness.toFixed(3)}`, `Pm ${m.metalness.toFixed(3)}`, m.map ? `map_Kd tex-world/${GROUND}/${m.map}` : "", "");
writeFileSync(resolve(ROOT, `art/blender/${stem}.mtl`), mtl.join("\n"));
writeFileSync(resolve(ROOT, `art/blender/${stem}.obj`), [`# Bretwalda ground — ${GROUND}; metres, Y up, world space`, `mtllib ${stem}.mtl`, ...v, ...vn, ...vt, ...objects].join("\n") + "\n");
writeFileSync(resolve(ROOT, `art/blender/${stem}.materials.json`), JSON.stringify(Object.fromEntries(mats), null, 1));
try { world.dispose?.(); } catch { /* fine */ }
rmSync(OUT, { recursive: true, force: true });
console.log(`[exportworld] art/blender/${stem}.obj: ${parts} parts, ${v.length} vertices, ${tris} triangles, ${mats.size} materials, ${dumped.size} maps`);
