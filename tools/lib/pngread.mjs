// ============================================================
// pngread — a PNG in, pixels out, and colour science for the rulers that read them.
//
// Every ruler that reads a captured frame (`facecontrast`, `lattice`) needs the
// same two things and neither wants a dependency: an 8-bit PNG decoder and the
// CIELAB the owner's words are stated in ("sclera L* 19-35 against skin L* 46-53").
// `facelook.mjs` already hand-rolls a PNG WRITER "because a picture with a
// dependency is not a picture"; this is the reader, and it is the same size and
// for the same reason. `sharp` is in node_modules only because Next drags it in.
//
// What it reads: 8-bit, non-interlaced, colour types 0 (grey), 2 (RGB), 4 (grey +
// alpha), 6 (RGBA). That is every frame Chromium's screenshot writes. Anything
// else THROWS: a ruler that shrugged at a 16-bit or an interlaced file and read
// zeros would be the harness that measured the wrong quantity (PROCESS 1.1).
// ============================================================
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** @returns {{ w: number, h: number, ch: number, data: Uint8Array }} interleaved 8-bit samples, `ch` per pixel (1, 2, 3 or 4). */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error("not a PNG (bad signature)");
  let w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4);
      depth = body[8]; ctype = body[9]; interlace = body[12];
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (depth !== 8) throw new Error(`PNG bit depth ${depth}: only 8-bit is read`);
  if (interlace) throw new Error("interlaced PNG: not read");
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype];
  if (!ch) throw new Error(`PNG colour type ${ctype}: not read`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  if (raw.length !== (stride + 1) * h) throw new Error(`PNG data is ${raw.length} bytes, wanted ${(stride + 1) * h}`);
  const out = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[dst + x - ch] : 0;
      const b = y > 0 ? out[dst - stride + x] : 0;
      const c = x >= ch && y > 0 ? out[dst - stride + x - ch] : 0;
      let v = raw[src + x];
      switch (f) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error(`PNG filter ${f}`);
      }
      out[dst + x] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}

export const readPng = (path) => decodePng(readFileSync(path));

/** sRGB byte -> linear 0..1 */
const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
export const srgbToLinear = (b) => LIN[b];

const XN = 0.95047, YN = 1.0, ZN = 1.08883;
const fLab = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

/** sRGB bytes (0..255) -> CIELAB D65, `[L*, a*, b*]`. */
export function rgbToLab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / XN;
  const y = (0.2126729 * R + 0.7151522 * G + 0.0721750 * B) / YN;
  const z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / ZN;
  const fx = fLab(x), fy = fLab(y), fz = fLab(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** `0xrrggbb` -> `[L*, a*, b*]`. */
export const hexToLab = (hex) => rgbToLab((hex >> 16) & 255, (hex >> 8) & 255, hex & 255);

/** CIE76 colour difference. The bars in the ruler are stated in it, and it says so. */
export const deltaE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

export const chroma = (lab) => Math.hypot(lab[1], lab[2]);

/**
 * Lab of every pixel of an image, as three planes. Computed once per frame: the
 * rulers look at a few thousand pixels each, but they look at them several ways.
 */
export function labPlanes(img) {
  const n = img.w * img.h;
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  const { data, ch } = img;
  for (let i = 0; i < n; i++) {
    const o = i * ch;
    const lab = ch >= 3 ? rgbToLab(data[o], data[o + 1], data[o + 2]) : rgbToLab(data[o], data[o], data[o]);
    L[i] = lab[0]; A[i] = lab[1]; B[i] = lab[2];
  }
  return { w: img.w, h: img.h, L, A, B };
}
