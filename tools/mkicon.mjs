#!/usr/bin/env node
// MKICON — the install icons, forged in pure node (backlog 8.9).
//
//   node tools/mkicon.mjs      writes public/icon-512.png and icon-192.png
//
// This box has no image tooling — no magick, no ffmpeg — and the one brand
// PNG (helm-mark, 501x808) is not an icon shape. So the icon is DRAWN: a
// per-pixel render of a flat helm mark — dome, cheeks, nasal, eye slots —
// in the game's own amber on its own stone, with a shield-ring border,
// smoothstep-antialiased, deflated with node's zlib and written with a
// hand-rolled PNG encoder. Deterministic: same bytes every run, so the
// icons diff clean. If real iconography ever arrives from the owner, this
// file retires; until then the mark is honest and OURS.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// The palette: the UI's own stone and amber.
const FIELD = [0x1c, 0x17, 0x12];
const RING = [0x8a, 0x6a, 0x2e];
const HELM = [0xd9, 0xa4, 0x41];
const DARK = [0x0e, 0x0b, 0x08];

const smooth = (d, aa) => Math.max(0, Math.min(1, 0.5 - d / aa));

/** Coverage of the helm mark at (x, y) in unit space (0..1). */
function helmAt(x, y, aa) {
  const cx = 0.5, domeY = 0.46, r = 0.27;
  // The dome: upper half-disc.
  const dDome = Math.hypot(x - cx, Math.max(0, y - domeY) * 1.0 + Math.min(0, y - domeY)) ;
  let cover = 0;
  const dx = x - cx, dy = y - domeY;
  if (y <= domeY) cover = Math.max(cover, smooth(Math.hypot(dx, dy) - r, aa));
  // The cheeks: the dome's width carried down to the jaw, with a taper.
  if (y > domeY && y < 0.70) {
    const t = (y - domeY) / (0.70 - domeY);
    const half = r * (1 - 0.28 * t);
    cover = Math.max(cover, smooth(Math.abs(dx) - half, aa));
  }
  // The eye slots, cut dark: two horizontal slots under the brow, set wide
  // enough apart that the nasal READS between them — the first render put
  // their inner edges under the nasal's own width and the Sutton Hoo T
  // drowned in its own cut.
  if (y > domeY + 0.015 && y < domeY + 0.075) {
    for (const s of [-1, 1]) {
      const ex = cx + s * 0.145;
      if (Math.abs(x - ex) < 0.075) cover = Math.min(cover, 1 - smooth(Math.abs(x - ex) - 0.075, aa));
    }
  }
  // The nasal, restored over the slots' cut: the bar the face hides behind.
  if (y > domeY - 0.02 && y < 0.66) cover = Math.max(cover, smooth(Math.abs(dx) - 0.05, aa));
  return cover;
}

function drawIcon(size) {
  const aa = 2 / size;
  const px = new Uint8Array(size * size * 3);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) / size, y = (j + 0.5) / size;
      let c = FIELD;
      // The shield ring, inset — the game's round board as the border.
      const dRing = Math.abs(Math.hypot(x - 0.5, y - 0.5) - 0.44);
      const ring = smooth(dRing - 0.012, aa);
      const helm = helmAt(x, y, aa);
      // Darken under the helm first (a rim shadow), then lay the steel.
      const shadow = helmAt(x + 0.008, y + 0.012, aa) * (1 - helm);
      const mix = (base, over, k) => base.map((b, n) => Math.round(b + (over[n] - b) * k));
      c = mix(c, DARK, shadow * 0.6);
      c = mix(c, RING, ring);
      c = mix(c, HELM, helm);
      const o = (j * size + i) * 3;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
    }
  }
  return px;
}

// ---- the PNG encoder: signature, IHDR, IDAT, IEND, CRC32 by the book ----
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
function writePng(path, size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolour
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let j = 0; j < size; j++) {
    raw[j * (size * 3 + 1)] = 0; // filter: none
    Buffer.from(px.buffer, j * size * 3, size * 3).copy(raw, j * (size * 3 + 1) + 1);
  }
  const out = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, out);
  console.log(`  wrote ${path} — ${size}x${size}, ${out.length} bytes`);
}

for (const size of [512, 192]) {
  writePng(resolve(ROOT, `public/icon-${size}.png`), size, drawIcon(size));
}
console.log("[mkicon] done — LOOK AT THEM before shipping");
