#!/usr/bin/env node
// ============================================================
// FACELOOK — a CPU render of the head, so a face can be LOOKED AT without
// paying 8.4 s for a browser's first frame on a box with no GPU.
//
//   node tools/facelook.mjs                       # the default sheet
//   node tools/facelook.mjs --out art/x --dress '{"beardStyle":"forked"}'
//
// docs/GATES.md says the browser is needed for one thing only: the final look.
// That is true of LIGHT — this cannot judge a specular lobe or an IBL. It is
// not true of SHAPE AND COVERAGE, which is what every one of the owner's seven
// complaints is about: "a pale grey wedge clipping through the tan skin",
// "lumps overlapped & clipped", "eyebrows overlapped". Those are answered by
// knowing WHICH SURFACE WINS THE DEPTH TEST AT EACH PIXEL, and that is
// arithmetic.
//
// So this rasterises the real `buildCharacter` output with a flat lambert term
// and each mesh's own material colour, and writes a PNG. ~0.4 s a panel against
// ~40 s for a capture. It is a magnifying glass, not a substitute for the
// render sheet — the batched capture still happens at the end.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync, writeFileSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { deflateSync } from "zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".facelook");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts",
  "--outDir", ".facelook", "--target", "es2022", "--module", "esnext",
  "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(dir, e.name)) : e.name === "characters.js" && found.push(resolve(dir, e.name)); };
if (existsSync(OUT)) walk(OUT);
const built = found[0] ?? resolve(OUT, "characters.js");
if (!existsSync(built)) {
  console.error("[look] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || ""));
  process.exit(2);
}
const { buildCharacter, defaultAppearance, ARMOURY } = await import(pathToFileURL(built).href);

// The audit dress, read out of /shot the same way cosmetictest reads it, so the
// man in this sheet is the man in that one.
const SLOT_FIELD = {
  helm: "helm", hair: "hairStyle", hairColor: "hairColor", beard: "beardStyle",
  beardColor: "beardColor", cloak: "cloak", armor: "armorColor", warPaint: "warPaint",
};
function auditDress() {
  const src = readFileSync(resolve(ROOT, "src/app/shot/page.tsx"), "utf8");
  const m = src.match(/const DRESS_IDS: Record<string, string> = \{([\s\S]*?)\}/);
  if (!m) throw new Error("no DRESS_IDS");
  const ap = {};
  for (const [, slotName, id] of m[1].matchAll(/(\w+):\s*"([^"]+)"/g)) {
    const slot = ARMOURY.find((s) => s.slot === SLOT_FIELD[slotName] || s.slot === slotName);
    const opt = slot?.options.find((o) => o.id === id);
    if (opt) ap[SLOT_FIELD[slotName]] = opt.value;
  }
  return ap;
}
const DRESS = auditDress();

const CLS = flag("cls", "huscarl");
const SEED = parseInt(flag("seed", "13"), 10);
const SCALE = parseFloat(flag("scale", "1"));

// The portrait lens, copied from cosmetictest, which copied it from /shot.
const LENS = { w: Math.round(560 * SCALE), h: Math.round(690 * SCALE), dist: 2.05, targetY: 1.76, eyeY: 1.94, fov: 19.5, aim: { right: -0.068, fwd: 0.045 } };
const FIGHT = { w: Math.round(520 * SCALE), h: Math.round(320 * SCALE), dist: 6.8, targetY: 0.88, eyeY: 2.05, fov: 2 * Math.atan((320 / 900) * Math.tan((55 * Math.PI) / 360)) * 180 / Math.PI, aim: { right: 0, fwd: 0 } };

function framing(lens, turnDeg) {
  const rot = Math.PI + (turnDeg * Math.PI) / 180;
  const s = Math.sin(rot), c = Math.cos(rot);
  const x = lens.aim.right * c + lens.aim.fwd * s;
  const z = -lens.aim.right * s + lens.aim.fwd * c;
  return { eye: [x, lens.eyeY, z - lens.dist], target: [x, lens.targetY, z], fov: lens.fov, rot };
}

/**
 * The one place this differs from a render: light. Three directional terms and
 * a constant, chosen to be BLAND — a key from the upper left, a cool fill from
 * the right, a little bounce from below. The point is to show form and
 * coverage, so nothing here is allowed to be dramatic enough to hide either.
 */
const LIGHTS = [
  { d: [-0.55, 0.62, 0.56], c: [1.00, 0.96, 0.88], i: 0.78 },
  { d: [0.72, 0.18, 0.40], c: [0.62, 0.70, 0.88], i: 0.30 },
  { d: [0.0, -0.85, 0.52], c: [0.9, 0.85, 0.8], i: 0.12 },
];
for (const l of LIGHTS) { const n = Math.hypot(...l.d); l.d = l.d.map((v) => v / n); }
const AMBIENT = 0.30;

const IDS = argv.includes("--ids");
const LEGEND = new Map();
const hue = (i) => {
  const h = (i * 0.61803398875) % 1, s = 0.72, v = 0.95;
  const k = (n) => { const t = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(1, Math.min(t, 4 - t))); };
  return [k(5), k(3), k(1)];
};

function render(root, lens, turnDeg) {
  const W = lens.w, H = lens.h;
  const f = framing(lens, turnDeg);
  const [ex, ey, ez] = f.eye, [tx, ty, tz] = f.target;
  let fx = tx - ex, fy = ty - ey, fz = tz - ez;
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  let sx = -fz, sy = 0, sz = fx;
  const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
  const vx = sy * fz - sz * fy, vy = sz * fx - sx * fz, vz = sx * fy - sy * fx;
  const tanH = Math.tan((f.fov * Math.PI) / 360);
  const aspect = W / H;

  const depth = new Float32Array(W * H).fill(Infinity);
  const rgb = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) { rgb[i * 3] = 0.055; rgb[i * 3 + 1] = 0.058; rgb[i * 3 + 2] = 0.065; }
  root.updateMatrixWorld(true);

  const NEAR = 0.05;
  const A = [0, 0, 0, 0, 0, 0], B = [0, 0, 0, 0, 0, 0], C = [0, 0, 0, 0, 0, 0];
  const toScreen = (px, py, pz, out) => {
    const dx = px - ex, dy = py - ey, dz = pz - ez;
    const cz = dx * fx + dy * fy + dz * fz;
    out[2] = cz;
    if (cz < NEAR) return false;
    out[0] = ((dx * sx + dy * sy + dz * sz) / (cz * tanH * aspect)) * 0.5 * W + W * 0.5;
    out[1] = H * 0.5 - ((dx * vx + dy * vy + dz * vz) / (cz * tanH)) * 0.5 * H;
    return true;
  };

  const tmp = [0, 0, 0, 0, 0, 0];
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry;
    const pos = g.attributes?.position;
    const nrm = g.attributes?.normal;
    const col = g.attributes?.color;
    if (!pos || !nrm) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    let mc = mat?.color ? [mat.color.r, mat.color.g, mat.color.b] : [0.7, 0.7, 0.7];
    if (IDS) {
      // False colour by material identity, so "which surface am I looking at"
      // is answerable without guessing from a tone. The legend goes to stdout.
      let anc = o, name = "";
      while (anc && !name) { if (anc.name) name = anc.name; anc = anc.parent; }
      const key = `${name || "?"} · ${(mat?.color?.getHexString?.() ?? "??")}`;
      let e = LEGEND.get(key);
      if (!e) { e = hue(LEGEND.size); LEGEND.set(key, e); }
      mc = e;
    }
    const idx = g.index;
    const m = o.matrixWorld.elements;
    const n = idx ? idx.count : pos.count;
    const pa = pos.array, na = nrm.array, ca = col?.array, ia = idx?.array;
    for (let t = 0; t < n; t += 3) {
      let ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        const j = ia ? ia[t + k] : t + k;
        const x = pa[j * 3], y = pa[j * 3 + 1], z = pa[j * 3 + 2];
        const out = k === 0 ? A : k === 1 ? B : C;
        ok = toScreen(
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14], out);
        // world normal (no non-uniform-scale correction; the rig has none worth it)
        const nx = na[j * 3], ny = na[j * 3 + 1], nz = na[j * 3 + 2];
        let wx = m[0] * nx + m[4] * ny + m[8] * nz;
        let wy = m[1] * nx + m[5] * ny + m[9] * nz;
        let wz = m[2] * nx + m[6] * ny + m[10] * nz;
        const wl = Math.hypot(wx, wy, wz) || 1;
        out[3] = wx / wl; out[4] = wy / wl; out[5] = wz / wl;
        if (ca) { tmp[0] = ca[j * 3]; tmp[1] = ca[j * 3 + 1]; tmp[2] = ca[j * 3 + 2]; }
        out.vc = ca ? [ca[j * 3], ca[j * 3 + 1], ca[j * 3 + 2]] : null;
      }
      if (!ok) continue;
      const minX = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
      const minY = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
      if (maxX < minX || maxY < minY) continue;
      const d = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
      if (Math.abs(d) < 1e-12) continue;
      for (let py = minY; py <= maxY; py++) {
        for (let px = minX; px <= maxX; px++) {
          const qx = px + 0.5, qy = py + 0.5;
          const w0 = ((B[0] - qx) * (C[1] - qy) - (C[0] - qx) * (B[1] - qy)) / d;
          const w1 = ((C[0] - qx) * (A[1] - qy) - (A[0] - qx) * (C[1] - qy)) / d;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w0 * A[2] + w1 * B[2] + w2 * C[2];
          const o2 = py * W + px;
          if (z >= depth[o2]) continue;
          depth[o2] = z;
          let nx2 = w0 * A[3] + w1 * B[3] + w2 * C[3];
          let ny2 = w0 * A[4] + w1 * B[4] + w2 * C[4];
          let nz2 = w0 * A[5] + w1 * B[5] + w2 * C[5];
          const nl = Math.hypot(nx2, ny2, nz2) || 1;
          nx2 /= nl; ny2 /= nl; nz2 /= nl;
          let r = mc[0], g2 = mc[1], b = mc[2];
          if (A.vc && B.vc && C.vc) {
            r *= w0 * A.vc[0] + w1 * B.vc[0] + w2 * C.vc[0];
            g2 *= w0 * A.vc[1] + w1 * B.vc[1] + w2 * C.vc[1];
            b *= w0 * A.vc[2] + w1 * B.vc[2] + w2 * C.vc[2];
          }
          let lr = AMBIENT, lg = AMBIENT, lb = AMBIENT;
          for (const L of LIGHTS) {
            const nd = Math.max(0, nx2 * L.d[0] + ny2 * L.d[1] + nz2 * L.d[2]);
            lr += nd * L.i * L.c[0]; lg += nd * L.i * L.c[1]; lb += nd * L.i * L.c[2];
          }
          rgb[o2 * 3] = r * lr; rgb[o2 * 3 + 1] = g2 * lg; rgb[o2 * 3 + 2] = b * lb;
        }
      }
    }
  });
  return { rgb, W, H };
}

// ---- PNG, hand-rolled, because a picture with a dependency is not a picture.
function crc32(buf) {
  let c, table = crc32.t;
  if (!table) {
    table = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(rgb, W, H) {
  const raw = Buffer.alloc(H * (W * 3 + 1));
  let o = 0;
  const enc = (v) => {
    const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(c * 255)));
  };
  for (let y = 0; y < H; y++) {
    raw[o++] = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      raw[o++] = enc(rgb[i]); raw[o++] = enc(rgb[i + 1]); raw[o++] = enc(rgb[i + 2]);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Lay panels out side by side into one sheet, so one Read shows the set. */
function tile(panels, cols) {
  const rows = Math.ceil(panels.length / cols);
  const pw = Math.max(...panels.map((p) => p.W));
  const ph = Math.max(...panels.map((p) => p.H));
  const W = pw * cols, H = ph * rows;
  const rgb = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) { rgb[i * 3] = 0.02; rgb[i * 3 + 1] = 0.02; rgb[i * 3 + 2] = 0.025; }
  panels.forEach((p, k) => {
    const ox = (k % cols) * pw, oy = Math.floor(k / cols) * ph;
    for (let y = 0; y < p.H; y++) for (let x = 0; x < p.W; x++) {
      const s = (y * p.W + x) * 3, d = ((oy + y) * W + ox + x) * 3;
      rgb[d] = p.rgb[s]; rgb[d + 1] = p.rgb[s + 1]; rgb[d + 2] = p.rgb[s + 2];
    }
  });
  return { rgb, W, H };
}

const dressArg = flag("dress", "{}");
const extra = JSON.parse(dressArg);
const turnsArg = flag("turns", "0,-35,-90,180").split(",").map(Number);
const lensName = flag("lens", "portrait");
const lens = { ...(lensName === "fight" ? FIGHT : LENS) };
// Tighter framing on demand. The owner's complaints are 20 mm features on a
// 190 mm head; at the portrait lens the eye is 30 px across and an overlapped
// brow is two pixels. `--dist 0.9 --targetY 1.83` puts the eye at 200.
for (const k of ["dist", "targetY", "eyeY", "fov", "w", "h"]) {
  const v = flag(k, null);
  if (v !== null) lens[k] = parseFloat(v);
}
const outPath = resolve(ROOT, flag("out", "art/look/look") + ".png");
mkdirSync(dirname(outPath), { recursive: true });

const ap = { ...defaultAppearance(CLS), ...DRESS, ...extra };
const t0 = Date.now();
const panels = turnsArg.map((turn) => {
  const c = buildCharacter(CLS, ap, 0, undefined, "high", SEED);
  c.group.rotation.y = Math.PI + (turn * Math.PI) / 180;
  return render(c.group, lens, turn);
});
const sheet = tile(panels, Math.min(panels.length, 4));
writeFileSync(outPath, png(sheet.rgb, sheet.W, sheet.H));
console.log(`[look] ${outPath}  ${sheet.W}x${sheet.H}  ${panels.length} panels  ${Date.now() - t0} ms  ${JSON.stringify(extra)}`);
if (IDS) for (const [k, v] of LEGEND) console.log(`  [id] ${k}  rgb(${v.map((x) => Math.round(x * 255)).join(",")})`);
