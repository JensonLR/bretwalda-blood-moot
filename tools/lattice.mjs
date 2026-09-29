#!/usr/bin/env node
// ============================================================
// LATTICE — is there a repeated pattern printed on the skin?
//
//   node tools/lattice.mjs <face card PNG | directory of them>...
//   node tools/lattice.mjs --lever <PNG>       R1: paint a lattice on the card and require the reading to move
//   node tools/lattice.mjs --peak 0.15 ...     move the bar
//
// THE OWNER'S WORDS (CHAR-PLAN CH-02; three sessions of "reads as a crude pale
// mask", and the head's own comment calls it "a regular rectilinear grid of dark
// dashes ruled over the forehead, the cheek and the neck"):
//
//   the face is a grid of red dashes.
//
// Nothing in the repository could see that. `headmeasure` reads the SHAPE of the
// head, `eyeclip` the lids, `faceseam` the join between helm and skin, and the one
// place a texture is discussed is a long comment in `buildCharacter` arguing that
// a 2.2 mm tile takes the pattern under a pixel. On the authored man the comment is
// untrue in a way it cannot have known: the GLB's skin is a 35 mm CUBE PROJECTION
// baked by Blender (the export throws the head's own UVs away), and the shader-side
// `tile` the comment relies on does not survive `forSkinnedMesh`'s `clone()`, so the
// recipe prints at 35 mm and the frame shows 17-19 mm rows of dashes (about 21 px at
// the portrait lens).
//
// WHAT IT MEASURES. The 2-D autocorrelation of the skin's luminance, high-passed so
// the shading of the face itself (a cheek, a jaw) is not in it. A REPEATING pattern
// correlates with itself at its own pitch, whatever its colour or where it sits, so
// the largest value away from the origin is the lattice's strength: 1.0 is a perfect
// tile, 0 is noise. Pairs are counted only where BOTH pixels are bare skin, so the
// eyes, brows, mouth and hairline cannot correlate with each other by symmetry (two
// eyes 60 px apart would be a peak at 60 px, and they are not skin).
//
// WHICH PIXELS. The skin blob that contains the head, found by colour, opened to cut
// the fence posts and the ear-side thatch that touch it, eroded from its own edge,
// and reduced to the pixels within 18 L* of the blob's median so a feature or a
// shadow does not stand in for texture. It needs no landmark and no registration:
// the ruler that measures "is there a lattice" must not depend on knowing where the
// eyes are (`facecontrast` does; this must not).
//
// THE BAR is 0.15, from the plan, and it was checked on both sides: the baseline
// cards read far above it and a card with the pattern removed reads far below (see
// `--lever`, which paints one on).
// ============================================================
import { readdirSync, statSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { readPng, labPlanes } from "./lib/pngread.mjs";
import { measureLattice, blurredSkin, withLattice, skinMask, LATTICE } from "./lib/latticelib.mjs";

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PEAK_BAR = Number(flag("peak", "0.15"));
const LEVER = argv.includes("--lever");
const JSON_OUT = argv.includes("--json");
const targets = argv.filter((a, i) => !a.startsWith("--") && !(argv[i - 1] ?? "").startsWith("--peak"));

const RMS_FLOOR = LATTICE.RMS_FLOOR;

/** Every PNG under a path, sorted. */
function pngsUnder(p) {
  if (!existsSync(p)) throw new Error(`no such path: ${p}`);
  if (statSync(p).isFile()) return [p];
  const out = [];
  for (const e of readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const f = resolve(p, e.name);
    if (e.isDirectory()) out.push(...pngsUnder(f));
    else if (/facecard.*\.png$/i.test(e.name)) out.push(f);
  }
  return out;
}


const files = targets.flatMap(pngsUnder);
if (!files.length) {
  console.error("usage: node tools/lattice.mjs [--peak 0.15] [--lever] <face card PNG | directory>...");
  process.exit(2);
}

let red = 0, blind = 0;
const rows = [];
for (const f of files) {
  let img = readPng(f);
  if (LEVER) {
    const asShot = measureLattice(img);
    const blurred = blurredSkin(img);
    const flat = measureLattice(blurred);
    const painted = measureLattice(withLattice(blurred, skinMask(labPlanes(blurred)).mask, 21, 26));
    const fell = asShot.ok && flat.ok && flat.peak < asShot.peak - 0.05 && flat.peak < PEAK_BAR;
    const rose = flat.ok && painted.ok && painted.peak > PEAK_BAR + 0.10;
    console.log(`[lattice] LEVER ${basename(f)}: as shot ${asShot.ok ? asShot.peak.toFixed(3) : "n/a"} -> skin blurred ${flat.ok ? flat.peak.toFixed(3) : "n/a"} -> 21 px lattice painted back on ${painted.ok ? painted.peak.toFixed(3) : "n/a"}: ${fell && rose ? "MOVED both ways, so the ruler is reading the skin" : `DID NOT MOVE (fell ${fell}, rose ${rose}): the ruler is not measuring a lattice`}`);
    if (!(fell && rose)) red++;
    continue;
  }
  const m = measureLattice(img);
  const label = basename(f).replace(/^facecard-helmhelm_none-hairhair_shaved-beardbeard_none-warPaintwp_none-/, "").replace(/\.png$/, "");
  if (!m.ok) { blind++; console.log(`[lattice] ${label.padEnd(24)} BLIND: ${m.why}`); rows.push({ file: f, ok: false, why: m.why }); continue; }
  const pass = m.peak <= PEAK_BAR;
  if (!pass) red++;
  rows.push({ file: f, ...m, pass });
  console.log(m.smooth
    ? `[lattice] ${label.padEnd(24)} skin is smooth (texture rms ${m.rms.toFixed(2)} L*, floor ${RMS_FLOOR}), ${m.area} skin px  ok`
    : `[lattice] ${label.padEnd(24)} peak ${m.peak.toFixed(3)} at lag (${m.lag[0]}, ${m.lag[1]}) px = pitch ${m.pitch.toFixed(1)} px, texture rms ${m.rms.toFixed(2)} L*, ${m.pairs} pairs, ${m.area} skin px  ${pass ? "ok" : `RED (bar ${PEAK_BAR})`}`);
}
if (JSON_OUT) console.log(JSON.stringify(rows));
if (LEVER) process.exit(red ? 1 : 0);
console.log(red || blind
  ? `[lattice] FAIL: ${red} of ${files.length} card(s) carry a repeated pattern above ${PEAK_BAR}${blind ? `, and ${blind} could not be read (a blind card is not a clean card)` : ""}`
  : `[lattice] PASS: ${files.length} card(s), none above ${PEAK_BAR}`);
process.exit(red || blind ? 1 : 0);
