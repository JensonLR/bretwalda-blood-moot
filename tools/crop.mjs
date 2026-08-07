#!/usr/bin/env node
// ============================================================
// CROP — cut a rectangle out of a capture and blow it up.
//
//   node tools/crop.mjs art/shots/base/head-turn.png --rect 0,40,712,860 --zoom 2
//   node tools/crop.mjs <in> --rect x,y,w,h --zoom 2 --out art/crop/a.png
//   node tools/crop.mjs <in> --rect x,y,w,h --rule       # a 10% grid over it
//
// It exists because a four-panel sheet arrives 2850 px wide, is looked at
// downscaled, and a judgement then gets made about a face 300 px tall from
// something the size of a postage stamp. Every proportional note in this
// file's history — "the cranium is too big", "the face is small on a large
// dome" — is a measurement somebody made by eye off a thumbnail, and two of
// them turned out to be wrong. `--rule` draws tenths across the crop so a
// claim about where the eye line sits is a number rather than an impression.
// ============================================================
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { inflateSync, deflateSync } from "zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);
const IN = resolve(ROOT, argv[0]);
const OUT = resolve(ROOT, flag("out", "art/crop/crop.png"));
const ZOOM = parseInt(flag("zoom", "2"), 10);

// ---- decode: 8-bit, non-interlaced, colour type 2 or 6 ----
function decode(buf) {
  let p = 8;
  let w = 0, h = 0, ct = 0;
  const parts = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error("only 8-bit PNGs");
      ct = data[9];
      if (data[12] !== 0) throw new Error("interlaced PNGs not handled");
    } else if (type === "IDAT") parts.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : -1;
  if (ch < 0) throw new Error(`colour type ${ct} not handled`);
  const raw = inflateSync(Buffer.concat(parts));
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 3);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++];
    raw.copy(cur, 0, q, q + stride);
    q += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = cur[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const s = x * ch;
      const d = (y * w + x) * 3;
      out[d] = cur[s]; out[d + 1] = ch === 1 ? cur[s] : cur[s + 1]; out[d + 2] = ch === 1 ? cur[s] : cur[s + 2];
    }
    cur.copy(prev);
  }
  return { w, h, rgb: out };
}

// ---- encode ----
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c; }
  return t;
})();
const crc = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}
export function encode(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const img = decode(readFileSync(IN));
const r = (flag("rect", `0,0,${img.w},${img.h}`)).split(",").map(Number);
const [rx, ry, rw, rh] = r;
const W = rw * ZOOM, H = rh * ZOOM;
const out = Buffer.alloc(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const sx = Math.min(img.w - 1, rx + Math.floor(x / ZOOM));
    const sy = Math.min(img.h - 1, ry + Math.floor(y / ZOOM));
    const s = (sy * img.w + sx) * 3;
    const d = (y * W + x) * 3;
    out[d] = img.rgb[s]; out[d + 1] = img.rgb[s + 1]; out[d + 2] = img.rgb[s + 2];
  }
}
if (has("rule")) {
  for (let k = 1; k < 10; k++) {
    const y = Math.round((k / 10) * H);
    for (let x = 0; x < W; x++) {
      const d = (y * W + x) * 3;
      const on = k === 5 ? 1 : (x >> 2) & 1;
      if (!on) continue;
      out[d] = 255; out[d + 1] = k === 5 ? 40 : 220; out[d + 2] = 40;
    }
    const x0 = Math.round((k / 10) * W);
    for (let y2 = 0; y2 < H; y2++) {
      if (k !== 5 && (y2 >> 2) & 1) continue;
      const d = (y2 * W + x0) * 3;
      out[d] = 40; out[d + 1] = 220; out[d + 2] = 255;
    }
  }
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, encode(W, H, out));
console.log(`[crop] ${img.w}x${img.h} -> ${rw}x${rh} @${ZOOM}x -> ${OUT}`);
