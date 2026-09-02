#!/usr/bin/env node
// EXPORTTEXTURES — the browser's procedural surface maps, dumped as PNG.
//
//   node tools/blender/exporttextures.mjs [--size 512]
//
// Every map in render/textures.ts is computed on the CPU into a DataTexture;
// no renderer draws it. So the library is built headless (a stub renderer for
// the anisotropy query) and each surface's map, normal, roughness, metalness
// and ambient-occlusion textures are written to art/blender/tex/<surface>-<kind>.png,
// which tools/blender/warrior.py attaches to the materials named for them.
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { deflateSync } from "zlib";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, ".exporttextures");
const argv = process.argv.slice(2);
const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
const SIZE = Number(flag("size", 512));
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/render/textures.ts", "--outDir", ".exporttextures", "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"], { cwd: ROOT, encoding: "utf8" });
const emitted = []; const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = resolve(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f); } };
if (existsSync(OUT)) walk(OUT);
for (const f of emitted) {
  const src = readFileSync(f, "utf8");
  const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c))
    .replace(/(from\s+")@\/game\/([^"]*)(")/g, (m, a, b, c) => a + pathToFileURL(resolve(ROOT, "src/game", b)).href + c);
  if (fixed !== src) writeFileSync(f, fixed);
}
const built = emitted.find((f) => f.endsWith("textures.js"));
if (!built) { console.error("[exporttextures] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || "")); process.exit(2); }
const { createTextureLibrary } = await import(pathToFileURL(built).href);
const renderer = { capabilities: { getMaxAnisotropy: () => 8 } };
const settings = { anisotropy: 8, textureSize: SIZE, spriteSize: 128, tier: "high" };
const lib = createTextureLibrary(renderer, settings);
// The surface names, read off the type in the source so this never drifts.
const src = readFileSync(resolve(ROOT, "src/game/client/render/textures.ts"), "utf8");
const union = src.slice(src.indexOf("export type SurfaceName ="), src.indexOf(";", src.indexOf("export type SurfaceName =")));
const NAMES = [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
// A minimal PNG writer: 8-bit RGBA, one IDAT, zlib from node.
const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const png = (rgba, w, h) => {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy ? Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1) : raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
};
const dir = resolve(ROOT, "art/blender/tex"); mkdirSync(dir, { recursive: true });
let files = 0;
for (const name of NAMES) {
  let set; try { set = lib.surface(name); } catch (e) { console.log(`[exporttextures] ${name}: ${String(e).slice(0, 80)}`); continue; }
  for (const [kind, tex] of [["map", set.map], ["normal", set.normalMap], ["roughness", set.roughnessMap], ["metalness", set.metalnessMap], ["ao", set.aoMap]]) {
    if (!tex || !tex.image || !tex.image.data) continue;
    const { width: w, height: h } = tex.image; const data = tex.image.data;
    if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) continue;
    const base = data.subarray(0, w * h * 4);
    writeFileSync(resolve(dir, `${name}-${kind}.png`), png(base, w, h)); files++;
  }
}
rmSync(OUT, { recursive: true, force: true });
console.log(`[exporttextures] ${files} maps for ${NAMES.length} surfaces at ${SIZE}px -> art/blender/tex/`);
