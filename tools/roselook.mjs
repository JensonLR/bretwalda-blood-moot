#!/usr/bin/env node
// ============================================================
// ROSELOOK — grade a directory of captures for the one defect that has now
// shipped past this repository's harnesses three times running.
//
//   node tools/roselook.mjs art/look/faction-before/cards
//   node tools/roselook.mjs art/look/faction-after/cards --top 12
//   node tools/roselook.mjs A B         # two directories, before against after
//
// ------------------------------------------------------------
// WHY THIS EXISTS AS A SEPARATE TOOL
//
// `tools/factionread.mjs` §7 is the GATE and it is honest about its cost: it
// boots the app, drives a browser and spends most of an hour on a box with no
// GPU, because it insists on shooting its own frames so the number and the
// picture cannot disagree. That is the right shape for a verdict and the wrong
// shape for a reviewer who already has the pictures.
//
// This reads PNGs off disk in about a second, applies THE SAME BAND out of
// `tools/lib/roseband.mjs` — one definition, two callers, because mirrored
// definitions are `docs/PROCESS.md` failure mode 3 — and prints what it finds.
// `docs/GATES.md` E3: go DOWN the instrument table to iterate and UP it for a
// verdict. This is the bottom rung for a colour question and it is the reason
// a before/after can be measured without shooting anything twice.
//
// ------------------------------------------------------------
// WHAT IT MEASURES AND WHAT IT DOES NOT
//
// The share of the WHOLE FRAME inside the band, not of the man. There is no
// coverage mask here — that needs the rasteriser and the scene graph, which is
// what §7 has and this does not — so the grass, the fire and the sky are in the
// denominator and every reading is diluted by roughly the same constant.
// That makes it a COMPARATIVE instrument: read one people against another in
// the same sheet, or one sheet against the same sheet reshot. An absolute
// number off this tool means nothing on its own and is not a gate.
//
// It also cannot tell skin from cloth, and skin is on the red arc. That is why
// every frame is printed rather than only the bad ones: the peoples whose
// fields are off the arc are the floor, and the floor is meant to be looked at.
// docs/PROCESS.md R4 — this whole paragraph is the deferral, on the verdict.
// ============================================================
import { readFileSync, readdirSync, statSync } from "fs";
import { inflateSync } from "zlib";
import { resolve, basename, dirname } from "path";
import { fileURLToPath } from "url";
import { makeBand, calibrate, roseShare, MUST_FLAG, MUST_CLEAR } from "./lib/roseband.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const dirs = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && argv[i - 1] !== "--all"));
const TOP = parseInt(flag("top", "0"), 10);
if (!dirs.length) { console.error("usage: node tools/roselook.mjs <dir-of-pngs> [<dir2>] [--top N]"); process.exit(2); }

// The dyestuff, read out of the source rather than typed here. `characters.ts`
// is TypeScript and this tool refuses to compile it for one constant, so the
// hex is lifted from `globals.css`'s `--garnet` by name — the same variable
// `FACTION_FIELD.norse` is built from and the same one the map paints with.
const CSS = readFileSync(resolve(ROOT, "src/app/globals.css"), "utf8");
const m = /--garnet:\s*#([0-9a-fA-F]{6})/.exec(CSS);
if (!m) { console.error("[rose] globals.css has no --garnet — this tool will not guess the Danelaw's colour"); process.exit(2); }
const GARNET = parseInt(m[1], 16);

/** Minimal PNG reader: 8-bit, non-interlaced, greyscale/RGB/RGBA. */
function readPNG(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a PNG`);
  let p = 8, w = 0, h = 0, bd = 0, ct = 0; const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString("ascii", p + 4, p + 8);
    const data = b.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; if (data[12]) throw new Error(`${file}: interlaced`); }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (bd !== 8) throw new Error(`${file}: bit depth ${bd}, expected 8`);
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  if (!ch) throw new Error(`${file}: colour type ${ct}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = Buffer.alloc(h * stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[q++];
    const line = raw.subarray(q, q + stride); q += stride;
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, bb = prev[x], c = x >= ch ? prev[x - ch] : 0, v = line[x];
      let r;
      if (ft === 0) r = v;
      else if (ft === 1) r = v + a;
      else if (ft === 2) r = v + bb;
      else if (ft === 3) r = v + ((a + bb) >> 1);
      else { const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
        r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c); }
      cur[x] = r & 255;
    }
  }
  // Greyscale has no colour in it by construction; widen so one reader serves all.
  if (ch >= 3) return { w, h, ch, data: out };
  const wide = Buffer.alloc(w * h * 3);
  for (let i = 0, j = 0; i < w * h; i++, j += 3) { wide[j] = wide[j + 1] = wide[j + 2] = out[i * ch]; }
  return { w, h, ch: 3, data: wide };
}

const band = makeBand(GARNET);
console.log(`[rose] the band: ${band.describe()}`);
console.log(`[rose] the dyestuff: --garnet #${GARNET.toString(16).padStart(6, "0")} out of src/app/globals.css`);

// R2 and R3, on every invocation, before a single frame is graded.
{
  const { missed, overreach } = calibrate(band);
  for (const [h, w] of missed) console.log(`        MISSED  #${h.toString(16).padStart(6, "0")}  ${w}`);
  for (const [h, w] of overreach) console.log(`        OVERREACH  #${h.toString(16).padStart(6, "0")}  ${w}`);
  if (missed.length || overreach.length) {
    console.error(`[rose] CALIBRATION FAILED — ${missed.length} of ${MUST_FLAG.length} reported roses missed, ${overreach.length} of ${MUST_CLEAR.length} shipped colours over-reached. The band is not fit to grade anything.`);
    process.exit(2);
  }
  console.log(`[rose] calibration: ${MUST_FLAG.length} reported roses flagged, ${MUST_CLEAR.length} shipped-correct colours cleared`);
}

function gradeDir(dir) {
  const d = resolve(ROOT, dir);
  if (!statSync(d).isDirectory()) throw new Error(`${d} is not a directory`);
  const files = readdirSync(d).filter((f) => f.toLowerCase().endsWith(".png")).sort();
  const rows = [];
  for (const f of files) {
    const im = readPNG(resolve(d, f));
    rows.push({ f: basename(f, ".png"), ...roseShare(band, im.data, null, im.ch) });
  }
  return rows;
}

const sets = dirs.map((d) => ({ dir: d, rows: gradeDir(d) }));
for (const s of sets) {
  console.log(`\n[rose] ${s.dir} — ${s.rows.length} frame(s), share of the WHOLE FRAME in the band\n`);
  const sorted = [...s.rows].sort((a, b) => b.pct - a.pct);
  for (const r of (TOP ? sorted.slice(0, TOP) : sorted)) {
    console.log(`  ${r.pct.toFixed(3).padStart(7)}%  ${String(r.rose).padStart(6)} / ${r.n}   modal ${r.modal.padEnd(8)} ${r.f}`);
  }
  const worst = sorted[0];
  console.log(`\n        worst ${worst ? `${worst.pct.toFixed(3)}% — ${worst.f}, modal ${worst.modal}` : "n/a"}`);
}
if (sets.length === 2) {
  console.log(`\n[rose] ${sets[0].dir}  ->  ${sets[1].dir}\n`);
  const byName = new Map(sets[1].rows.map((r) => [r.f, r]));
  const pairs = sets[0].rows.filter((r) => byName.has(r.f))
    .map((a) => ({ f: a.f, a, b: byName.get(a.f) }))
    .sort((x, y) => (y.a.pct - y.b.pct) - (x.a.pct - x.b.pct));
  for (const p of (TOP ? pairs.slice(0, TOP) : pairs)) {
    console.log(`  ${p.a.pct.toFixed(3).padStart(7)}% -> ${p.b.pct.toFixed(3).padStart(7)}%   ${p.a.modal.padEnd(8)} -> ${p.b.modal.padEnd(8)} ${p.f}`);
  }
  const wa = Math.max(...pairs.map((p) => p.a.pct)), wb = Math.max(...pairs.map((p) => p.b.pct));
  console.log(`\n        worst frame ${wa.toFixed(3)}% -> ${wb.toFixed(3)}%   over ${pairs.length} matched frame(s)`);
}
