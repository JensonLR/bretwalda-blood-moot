#!/usr/bin/env node
// ============================================================
// SKINLATTICE — which constant in the skin recipe prints the lattice? (PROCESS R1, on the recipe)
//
//   node tools/skinlattice.mjs
//
// CHAR-PLAN CH-02 and its own hypothesis j: "the red lattice's probable cause is the 35 mm tile and the `netB` red
// coupling (`textures.ts` `buildSkin`); not proven: R1 lever first — set the blush weight to 0 and watch the dots go."
// This is that lever, pulled, kept as a ruler so the answer stays reproducible.
//
// WHAT IT DOES. It compiles `textures.ts`, builds the skin substance's albedo tile as the client does, tiles it 5x5 at the
// size a 35 mm tile has at the armoury's portrait lens (43 px, 0.82 mm a pixel: the size the authored skin is baked at),
// and reads it the way `tools/lattice.mjs` reads a face card: the autocorrelation peak of the high-passed luminance, and
// the texture's own amplitude in L*. Then it puts the constants in the recipe back one at a time, by patching the
// COMPILED module (and refusing to run if a constant is not where it looks), and prints what each does.
//
// WHAT IT FOUND (measured, this tree):
//
//   recipe as it was (blush .55, netB .6)         peak 0.912  rms 1.81 L*
//   the plan's dials (blush .12, netB .25)        peak 0.934  rms 1.69
//   blush 0                                       peak 0.932  rms 1.68     <- the named lever: the lattice does NOT go
//   blush 0 and netB 0                            peak 0.931  rms 1.66     <- nor does it with the crease net gone
//   blush 0, netB 0 and the FLUSH weight 0        rms 0.53 (smooth, below the eye's threshold)   <- THIS is the lever
//
// The lattice's pitch is 21 px: HALF a tile. Nothing in the crease nets has that period (they are at 1/8 and 1/16 of a
// tile); the low-frequency blood-blotch field `flush` is sampled at `u * 2`, so it repeats twice a tile, and at a tile the
// size of a forearm that is a checkerboard of blotches. The dashes the owner sees are the creases (their colour was the
// blush coupling) and the grid they sit on is the flush. Both are consequences of one fact this file can only report and
// not fix: a small texture repeated at a large scale is periodic, and a periodic pattern read at the pixel scale is a
// lattice. The head's answer is to change the scale (`render/authoredSkin.ts`: the head's own 2.2 mm tile, under a pixel,
// with the variation carried by the complexion map); the body's skin (arms, hands, a bare torso) keeps the 35 mm tile, and
// so keeps this. That is a deferral and it rides the verdict line (PROCESS R4).
// ============================================================
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { emitClient } from "./lib/clientmodule.mjs";
import { measureLattice, LATTICE } from "./lib/latticelib.mjs";
import { ROOT } from "./lib/facecard.mjs";

globalThis.window ??= { location: { search: "" }, innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, setItem() {} } };
globalThis.navigator ??= { userAgent: "node", maxTouchPoints: 0, hardwareConcurrency: 8 };
globalThis.document ??= { createElement: () => ({ getContext: () => null, width: 1, height: 1 }) };

const { byName, work } = await emitClient(ROOT, ["src/game/client/render/textures.ts"], ".faceprobe/skin");
const file = (await (async () => { await byName("textures.js"); return null; })(), resolve(work, "client/render/textures.js"));
const source = readFileSync(file, "utf8");

// the constants as they stand in the compiled recipe (`textures.ts` `buildSkin`); read, not assumed
const NET_B = /netB \* ([0-9.]+)\);/, BLUSH = /wrinkle \* ([0-9.]+) \+ \(mottle - 0\.5\)/, FLUSH = /smoothstep\(0\.4, 0\.85, flush\) \* ([0-9.]+)/;
for (const [name, re] of [["netB", NET_B], ["blush", BLUSH], ["flush", FLUSH]]) {
  if (!re.test(source)) { console.error(`[skinlattice] the ${name} constant is not where this ruler looks for it in the compiled buildSkin: refusing to report on a recipe it cannot read`); process.exit(2); }
}
const NOW = { netB: Number(NET_B.exec(source)[1]), blush: Number(BLUSH.exec(source)[1]), flush: Number(FLUSH.exec(source)[1]) };

let generation = 0;
async function measure(label, o) {
  let s = source;
  s = s.replace(NET_B, `netB * ${o.netB});`).replace(BLUSH, `wrinkle * ${o.blush} + (mottle - 0.5)`).replace(FLUSH, `smoothstep(0.4, 0.85, flush) * ${o.flush}`);
  const f = resolve(work, `client/render/textures.skinlattice${++generation}.js`);
  writeFileSync(f, s);
  const T = await import(pathToFileURL(f).href);
  const settings = { anisotropy: 8, textureSize: 512, spriteSize: 128, tier: "high", dynamicLights: true, instancing: false, propDensity: 1, shadows: true, shadowMapSize: 2048 };
  const lib = T.createTextureLibrary({ capabilities: { getMaxAnisotropy: () => 8 } }, settings);
  const map = lib.surface("skin").map;
  const W = map.image.width, H = map.image.height, d = map.image.data, P = 43, N = 5;
  const img = { w: P * N, h: P * N, ch: 3, data: new Uint8Array(P * N * P * N * 3) };
  const half = Math.max(1, Math.floor(W / P / 2));
  for (let y = 0; y < P * N; y++) for (let x = 0; x < P * N; x++) {
    const sx = Math.min(W - 1, Math.floor((((x % P) + 0.5) / P) * W)), sy = Math.min(H - 1, Math.floor((((y % P) + 0.5) / P) * H));
    let r = 0, g = 0, b = 0, c = 0;
    for (let j = -half; j <= half; j++) for (let i = -half; i <= half; i++) { const o2 = ((((sy + j) % H) + H) % H * W + (((sx + i) % W) + W) % W) * 4; r += d[o2]; g += d[o2 + 1]; b += d[o2 + 2]; c++; }
    const o3 = (y * P * N + x) * 3; img.data[o3] = r / c; img.data[o3 + 1] = g / c; img.data[o3 + 2] = b / c;
  }
  const m = measureLattice(img);
  console.log(`  ${label.padEnd(50)} peak ${m.peak.toFixed(3)} at ${m.pitch.toFixed(0).padStart(2)} px   texture rms ${m.rms.toFixed(2)} L*${m.smooth ? "   (smooth: under the eye's threshold)" : ""}`);
  return m;
}

console.log(`[skinlattice] the skin substance's albedo tile, 5x5 at the portrait lens (35 mm = 43 px at 0.82 mm/px); recipe now: blush ${NOW.blush}, netB ${NOW.netB}, flush ${NOW.flush}\n`);
const asIs = await measure(`the recipe as it stands (blush ${NOW.blush}, netB ${NOW.netB}, flush ${NOW.flush})`, NOW);
const blush0 = await measure("R1: blush weight 0", { ...NOW, blush: 0 });
const both0 = await measure("R1: blush 0 and netB 0", { ...NOW, blush: 0, netB: 0 });
const flush0 = await measure("R1: blush 0, netB 0 and flush 0", { ...NOW, blush: 0, netB: 0, flush: 0 });

const blushMoved = Math.abs(blush0.peak - asIs.peak) > 0.05 || blush0.smooth;
const flushMoved = flush0.smooth === true;
console.log(`\n[skinlattice] the named lever (blush weight 0): ${blushMoved ? "the lattice moved" : `the lattice did NOT move (peak ${asIs.peak.toFixed(3)} -> ${blush0.peak.toFixed(3)})`}`);
console.log(`[skinlattice] the flush weight 0: ${flushMoved ? `the lattice is gone (texture rms ${asIs.rms.toFixed(2)} -> ${flush0.rms.toFixed(2)} L*, floor ${LATTICE.RMS_FLOOR})` : "the lattice stayed"}`);
// The ruler asserts its own finding, so a later edit that makes the blush the lever (or the flush inert) is noticed.
const finding = !blushMoved && flushMoved;
console.log(finding
  ? "[skinlattice] PASS: the finding holds (the crease blush is not the lattice, the flush blotch is) — WITH the body skin's 35 mm lattice UNFIXED, which is a deferral and not a clean sheet (the head and neck are dressed at their own tile by render/authoredSkin.ts; arms, hands and a bare torso still print it)"
  : "[skinlattice] FAIL: the recorded finding no longer holds; the recipe or the measurement changed, re-read the header");
process.exit(finding ? 0 : 1);
void both0;
