#!/usr/bin/env node
// ============================================================
// CLAY — the head's surface on its own, in ten seconds.
//
//   node tools/clay.mjs                       # front, 3/4, profile, back
//   node tools/clay.mjs --seed 3 --cls huscarl
//   node tools/clay.mjs --out art/clay/x
//
// `npm run shots` is the judge and this is not a substitute for it. It is the
// thing you use BETWEEN captures, because a browser capture costs three minutes
// and photographs four things at once — the geometry, the complexion field, the
// war paint and the arena's key — and this file's history is full of arguments
// about which of the four drew an edge. Half a wave went on "the domino mask",
// which turned out to be a painted shadow rather than the face block everybody
// was rewriting.
//
// So: the build's own `headMesh`, a z-buffer, one key light and one fill, no
// texture of any kind. Grey clay. If an edge is here, it is in the surface.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { deflateSync } from "zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);
const OUT = resolve(ROOT, flag("out", "art/clay"));
const SEED = parseInt(flag("seed", "1"), 10);
const CLS = flag("cls", "huscarl");
const W = parseInt(flag("w", "460"), 10);
const H = parseInt(flag("h", "560"), 10);

const TMP = resolve(ROOT, ".clay");
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts",
  "--outDir", ".clay", "--target", "es2022", "--module", "esnext",
  "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(dir, e.name)) : e.name === "characters.js" && found.push(resolve(dir, e.name)); };
if (existsSync(TMP)) walk(TMP);
const built = found[0];
if (!built) { console.error(tsc.stdout || tsc.stderr); process.exit(1); }
const { headMesh, headLandmarks } = await import(pathToFileURL(built).href);

// ---- a PNG, written by hand so this depends on nothing ----
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c; }
  return t;
})();
const crc = (buf) => { let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- one orthographic clay view ----
function render(pos, idx, yaw, w, h, marks) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const n = pos.length / 3;
  const vx = new Float64Array(n), vy = new Float64Array(n), vz = new Float64Array(n);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) {
    const X = pos[i * 3], Y = pos[i * 3 + 1], Z = pos[i * 3 + 2];
    vx[i] = X * c + Z * s; vz[i] = -X * s + Z * c; vy[i] = Y;
    if (vx[i] < x0) x0 = vx[i]; if (vx[i] > x1) x1 = vx[i];
    if (vy[i] < y0) y0 = vy[i]; if (vy[i] > y1) y1 = vy[i];
  }
  // One frame for every view, so the four panels are the same head at the same
  // size — a per-view fit would hide a change in proportion, which is the thing
  // being looked for.
  const cx = 0, cy = (y0 + y1) / 2;
  const half = 0.165;
  const sc = h / (half * 2);
  const px = (i) => (vx[i] - cx) * sc + w / 2;
  const py = (i) => h / 2 - (vy[i] - cy) * sc;

  const zb = new Float64Array(w * h).fill(-1e9);
  const img = Buffer.alloc(w * h * 3);
  for (let i = 0; i < img.length; i += 3) { img[i] = 22; img[i + 1] = 24; img[i + 2] = 28; }
  // A key up and to the left at 45/30, a soft fill from the camera, and a rim.
  const kx = -0.55, ky = 0.62, kz = 0.56;
  const kl = Math.hypot(kx, ky, kz);

  // Smooth vertex normals, because the game shades this mesh smoothly and a
  // flat-shaded clay invents banding the player will never see — which is
  // exactly the kind of phantom this file's history is full of.
  const nrm = new Float64Array(n * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], d = idx[t + 2];
    const e1x = vx[b] - vx[a], e1y = vy[b] - vy[a], e1z = vz[b] - vz[a];
    const e2x = vx[d] - vx[a], e2y = vy[d] - vy[a], e2z = vz[d] - vz[a];
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, d]) { nrm[v * 3] += fx; nrm[v * 3 + 1] += fy; nrm[v * 3 + 2] += fz; }
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
    nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l;
  }

  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], d = idx[t + 2];
    const ax = px(a), ay = py(a), bx = px(b), by = py(b), dx2 = px(d), dy2 = py(d);
    const area = (bx - ax) * (dy2 - ay) - (by - ay) * (dx2 - ax);
    if (area === 0) continue;
    // Face normal in view space.
    const e1x = vx[b] - vx[a], e1y = vy[b] - vy[a], e1z = vz[b] - vz[a];
    const e2x = vx[d] - vx[a], e2y = vy[d] - vy[a], e2z = vz[d] - vz[a];
    const fnz = e1x * e2y - e1y * e2x;
    const flip = fnz < 0 ? -1 : 1;
    const minx = Math.max(0, Math.floor(Math.min(ax, bx, dx2)));
    const maxx = Math.min(w - 1, Math.ceil(Math.max(ax, bx, dx2)));
    const miny = Math.max(0, Math.floor(Math.min(ay, by, dy2)));
    const maxy = Math.min(h - 1, Math.ceil(Math.max(ay, by, dy2)));
    for (let Y = miny; Y <= maxy; Y++) {
      for (let X = minx; X <= maxx; X++) {
        const qx = X + 0.5, qy = Y + 0.5;
        let w0 = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax);
        let w1 = (dx2 - bx) * (qy - by) - (dy2 - by) * (qx - bx);
        let w2 = (ax - dx2) * (qy - dy2) - (ay - dy2) * (qx - dx2);
        if (area < 0) { w0 = -w0; w1 = -w1; w2 = -w2; }
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const sum = w0 + w1 + w2 || 1;
        const z = (w1 * vz[a] + w2 * vz[b] + w0 * vz[d]) / sum;
        const k = Y * w + X;
        if (z <= zb[k]) continue;
        zb[k] = z;
        let nx = (w1 * nrm[a * 3] + w2 * nrm[b * 3] + w0 * nrm[d * 3]) / sum;
        let ny = (w1 * nrm[a * 3 + 1] + w2 * nrm[b * 3 + 1] + w0 * nrm[d * 3 + 1]) / sum;
        let nz = (w1 * nrm[a * 3 + 2] + w2 * nrm[b * 3 + 2] + w0 * nrm[d * 3 + 2]) / sum;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx = (nx / nl) * flip; ny = (ny / nl) * flip; nz = (nz / nl) * flip;
        if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const lam = Math.max(0, (nx * kx + ny * ky + nz * kz) / kl);
        const rim = Math.pow(1 - nz, 3);
        const vv = Math.min(1, 0.10 + 0.80 * lam + 0.16 * nz + 0.22 * rim);
        const g = Math.round(255 * Math.pow(vv, 1 / 2.2));
        img[k * 3] = g; img[k * 3 + 1] = Math.round(g * 0.98); img[k * 3 + 2] = Math.round(g * 0.94);
      }
    }
  }
  // The landmark rules, drawn LAST so they sit over the clay. Every proportional
  // argument in this file's history has been somebody reading a fraction off a
  // thumbnail by eye, and two of those readings were wrong by a tenth of a head.
  // These lines are the build's own `headLandmarks`, at the same scale as the
  // surface beside them, so "the nose sits too high" is a thing you can see
  // rather than a thing you estimate.
  if (marks) {
    for (const m of marks) {
      const Y = Math.round(h / 2 - (m.y - cy) * sc);
      if (Y < 0 || Y >= h) continue;
      for (let X = 0; X < w; X++) {
        if ((X >> 1) & 1) continue;
        const k = (Y * w + X) * 3;
        img[k] = m.hot ? 255 : 90; img[k + 1] = m.hot ? 70 : 200; img[k + 2] = m.hot ? 60 : 255;
      }
    }
  }
  return img;
}

const { pos, idx } = headMesh(CLS, SEED);
const L = has("marks") ? headLandmarks(CLS, SEED) : null;
const marks = L ? L.marks.map((m) => ({ ...m, hot: /nose|lip|sub|chin/.test(m.name) })) : null;
const views = [["front", 0], ["quarter", -35], ["profile", -90], ["back", 180]];
mkdirSync(OUT, { recursive: true });
const sheet = Buffer.alloc(W * views.length * H * 3);
views.forEach(([name, deg], i) => {
  const img = render(pos, idx, (deg * Math.PI) / 180, W, H, marks);
  for (let y = 0; y < H; y++) {
    img.copy(sheet, (y * (W * views.length) + i * W) * 3, y * W * 3, (y + 1) * W * 3);
  }
});
const file = resolve(OUT, "clay.png");
writeFileSync(file, png(W * views.length, H, sheet));
console.log(`[clay] ${CLS} seed ${SEED} · ${pos.length / 3} verts · ${idx.length / 3} tris -> ${file}`);
