#!/usr/bin/env node
// ============================================================
// HAIRMAP — does the hair substance actually carry a lay?
//
//   node tools/hairmap.mjs            (or: npm run hairmap)
//   node tools/hairmap.mjs --authored     also: the hair and beard the DEFAULT build draws (the shipped prop GLBs,
//                                         dressed by the real resolver chain) - value, lay and colour. CPU, ~20 s.
//   node tools/hairmap.mjs --authored --off   the control: the props exactly as the files ship them (HEAD). MUST fail.
//
// WHY THIS EXISTS. `characters.ts` dressed every beard, every hairstyle and
// both brows in `wool` for the whole life of this project, under a comment that
// said there was no hair substance and no budget for one. The owner reported
// the result four separate times — "the beards also still feel flat", then
// "really sharp & thin / folded in areas ... really broken & poor" — and four
// passes answered with GEOMETRY, because a beard looks like it is made of the
// shape it is. Every one of those passes had a harness, every harness measured
// a position or a volume, and not one of them could see that the surface had no
// direction in it. That is the tenth time in this repository that the right
// question was asked of the wrong property, and this file is the ruler that
// would have caught it.
//
// WHAT IT MEASURES, and the two numbers are the whole argument:
//
//   ANISOTROPY. Hair is a bundle of parallel cylinders; wool is felt. The
//   difference is not fineness, it is that hair's variation lives along ONE
//   axis. So: the mean absolute difference between horizontally adjacent texels
//   against the same for vertically adjacent ones. A felt is near 1.0 — it
//   changes as fast in both directions. Hair must be well above it, because
//   moving across the lay crosses strands and moving along it does not.
//
//   SHEEN SPREAD. A bundle of parallel cylinders returns a bright band across
//   the lay. `MeshStandardMaterial` has no anisotropy term to draw one with, so
//   the closest an isotropic BRDF gets is a roughness that swings with the lay —
//   glossy on a lock's crown, matte in the trough between. That swing is the
//   cue, and its size is the measurement. Wool spends 0.13 on it and its own
//   comment is careful to say that must never read as gloss.
//
// AND IT RE-MEASURES THE RECIPE'S DECLARED ROUGHNESS, which is not a courtesy.
// `materials.ts` DIVIDES a caller's requested roughness by the recipe's own
// `roughness` field, so that field has to be the built map's actual mean or the
// whole sheen band is silently rescaled. `grass` and `groundDetail` both carry
// a footnote saying re-measure this if the recipe changes; nothing enforced it.
// This does.
//
// WOOL IS THE CONTROL, and that is what makes the lay number mean anything.
// Wool's own recipe is built on the stated promise that "the structure is fibre
// and it has no axis", so whatever this instrument reads on wool IS the reading
// for a surface with no lay. Hair has to beat it by a wide margin or the recipe
// has not done the one thing it exists to do.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".hairmap");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/render/textures.ts", "--outDir", ".hairmap",
  "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(d, e.name)) : e.name === "textures.js" && found.push(resolve(d, e.name)); };
walk(OUT);
if (!found[0]) { console.error("[hair] tsc emitted nothing\n", tsc.stdout, tsc.stderr); process.exit(2); }
const mod = await import(pathToFileURL(found[0]).href);

const probe = mod.__probeSubstance;
if (typeof probe !== "function") {
  console.error("[hair] textures.ts exports no __probeSubstance seam — see the note beside it");
  process.exit(2);
}

/**
 * Mean absolute step between neighbours, one axis at a time, on a wrapping map.
 * The ratio of the two is the anisotropy: how much faster the surface changes
 * across the lay than along it.
 */
function steps(field, size, stride = 1, off = 0) {
  let sx = 0, sy = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * stride + off;
      const ix = (y * size + ((x + 1) & (size - 1))) * stride + off;
      const iy = (((y + 1) & (size - 1)) * size + x) * stride + off;
      sx += Math.abs(field[ix] - field[i]);
      sy += Math.abs(field[iy] - field[i]);
    }
  }
  const n = size * size;
  return { across: sx / n, along: sy / n };
}

function mean(f) { let s = 0; for (let i = 0; i < f.length; i++) s += f[i]; return s / f.length; }
function spread(f) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < f.length; i++) { if (f[i] < lo) lo = f[i]; if (f[i] > hi) hi = f[i]; }
  return { lo, hi, range: hi - lo };
}

console.log("");
console.log("[hair] the lay of a substance: how much faster it changes ACROSS than ALONG");
console.log("");
console.log("[hair] substance    field       across    along    ratio     mean    spread");
console.log("[hair] ---------------------------------------------------------------------");

const SUBJECTS = ["hair", "wool"];
const rows = {};
for (const name of SUBJECTS) {
  const g = probe(name);
  rows[name] = {};
  for (const [field, arr, stride, off] of [
    ["height", g.h, 1, 0],
    ["rough", g.r, 1, 0],
    ["albedo", g.c, 3, 0],
  ]) {
    const s = steps(arr, g.size, stride, off);
    const ratio = s.along > 1e-9 ? s.across / s.along : Infinity;
    const sp = stride === 1 ? spread(arr) : { range: NaN };
    const mn = stride === 1 ? mean(arr) : NaN;
    rows[name][field] = { ...s, ratio, mean: mn, range: sp.range };
    console.log(`[hair] ${name.padEnd(11)} ${field.padEnd(10)} ${s.across.toFixed(4).padStart(7)}  ${s.along.toFixed(4).padStart(7)}`
      + `  ${ratio.toFixed(2).padStart(6)}  ${Number.isNaN(mn) ? "     -" : mn.toFixed(3).padStart(6)}`
      + `  ${Number.isNaN(sp.range) ? "     -" : sp.range.toFixed(3).padStart(6)}`);
  }
}

console.log("");
let bad = 0;

// ---- 1. the lay ----------------------------------------------------------
const hairLay = rows.hair.height.ratio;
const woolLay = rows.wool.height.ratio;
const LAY_MIN = 1.8;
if (hairLay < LAY_MIN) {
  console.log(`[hair] FAIL the lay: hair's height changes only ${hairLay.toFixed(2)}x faster across the lay than along it`
    + ` (bar ${LAY_MIN}); wool, which is built to have no axis at all, reads ${woolLay.toFixed(2)}`);
  bad++;
} else {
  console.log(`[hair] PASS the lay: ${hairLay.toFixed(2)}x across vs along in the height field`
    + ` (bar ${LAY_MIN}), against wool's ${woolLay.toFixed(2)} — wool is the control, and it is`
    + ` built to have no axis`);
}

// ---- 2. the sheen band ---------------------------------------------------
const hairSheen = rows.hair.rough.range;
const woolSheen = rows.wool.rough.range;
const SHEEN_MIN = 0.35;
if (hairSheen < SHEEN_MIN) {
  console.log(`[hair] FAIL the sheen: roughness spans only ${hairSheen.toFixed(3)} (bar ${SHEEN_MIN}).`
    + ` A bundle of parallel cylinders returns a band; a flat roughness cannot draw one.`);
  bad++;
} else {
  console.log(`[hair] PASS the sheen: roughness spans ${hairSheen.toFixed(3)} (bar ${SHEEN_MIN}),`
    + ` against wool's ${woolSheen.toFixed(3)} — wool is deliberately matte`);
}

// ---- 3. the declared mean ------------------------------------------------
const DECLARED = probe.declared?.("hair");
const measured = rows.hair.rough.mean;
const TOL = 0.03;
if (DECLARED === undefined) {
  console.log("[hair] SKIP the declared mean: no recipe metadata on the probe seam");
} else if (Math.abs(DECLARED - measured) > TOL) {
  console.log(`[hair] FAIL the declared mean: RECIPES.hair.roughness says ${DECLARED.toFixed(3)}`
    + ` but the built map's mean is ${measured.toFixed(3)} (tolerance ${TOL}).`
    + ` materials.ts DIVIDES by the declared value, so every caller's roughness is off by`
    + ` ${(measured / DECLARED).toFixed(2)}x.`);
  bad++;
} else {
  console.log(`[hair] PASS the declared mean: RECIPES.hair.roughness ${DECLARED.toFixed(3)}`
    + ` matches the built map's ${measured.toFixed(3)} within ${TOL}`);
}

// ---- 4. THE AUTHORED HAIR (--authored): what the default build draws ------------------------------------
//
// Every check above measures the `hair` SUBSTANCE, which the authored man never wore: his hair and beard are Blender's
// ribbons over an under-cap (`hair-<cls>-<style>.glb`, `beard-...`), and `hairStrand` / `hairUnder` are not surface
// names, so the client's `tinted()` threw inside the swap's swallowed catch and they kept the glTF's own materials
// (PROCESS.md failure mode 1, instance ten - AGAIN). Measured on the shipped files: the ribbons are base 0.8 x COLOR_0
// and COLOR_0 is white on every vertex (the hair is in COLOR_1, which nothing reads), so they render #e7e7e7; the
// under-cap has metallicFactor and roughnessFactor absent, which glTF defaults to 1 and 1, and no environment map, so
// it is a mirror with nothing to reflect: black. "A black slab with white frost" (CH-05).
//
// WHAT IS MEASURED, on the props dressed by `authoredResolver(authoredDressContext(..))` with the headless library (a
// material's `color` is the colour it asked for): each ribbon vertex's EFFECTIVE DIFFUSE ALBEDO - `material.color`
// x the vertex colour the material actually reads (`vertexColors` on: the geometry's `color`) x (1 - metalness), a metal
// having no diffuse - as CIELAB L*, and the cap's.
//   value    strand p95 L* <= 65 (the plan's bar: the ribbons are never the brightest thing on a dark head), cap L* >= 14.
//   lay      the ribbons keep a ROOT-DARK to TIP-LIGHT ramp (mean L* of the top of a strand over its root, by UV v), and
//            the shade varies from strand to strand: a mass of parallel strands each its own value is what hair is.
//   colour   the strands follow the man's `hairColor`: a blond head is lighter than a black one by a wide margin (R1).
//   physics  no metal in hair, and the ribbons are drawn on both sides (the glTF asked for that).
// NOT MEASURED, on the verdict line (R4): no light and no grade (albedo only); the beard does not fade into the skin at
// the growth line; there is no anisotropic highlight; the ribbons' alpha edge is not in the file.
if (process.argv.includes("--authored")) {
  const OFF = process.argv.includes("--off");
  const { emitClient } = await import("./lib/clientmodule.mjs");
  const THREEM = await import("three");
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const { readFileSync, existsSync } = await import("fs");
  globalThis.window ??= { location: { search: "" }, innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, setItem() {} } };
  globalThis.navigator ??= { userAgent: "node", maxTouchPoints: 0, hardwareConcurrency: 8 };
  globalThis.document ??= { createElement: () => ({ getContext: () => null, width: 1, height: 1 }) };
  const em = await emitClient(ROOT, ["src/game/client/render/authoredDress.ts", "src/game/client/render/authoredProps.ts", "src/game/client/render/authored.ts"], ".hairauthored");
  const [DR, PR, AU, CHM] = await Promise.all([em.byName("authoredDress.js"), em.byName("authoredProps.js"), em.byName("authored.js"), em.byName("characters.js")]);
  console.log("");
  console.log(`[hair] === 4. THE AUTHORED HAIR AND BEARD${OFF ? "  (CONTROL: the props as the files ship them)" : ""} ===`);
  console.log("");
  const lab = (c) => {
    // linear -> CIELAB L*
    const Y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    return Y > 0.008856 ? 116 * Math.cbrt(Y) - 16 : 903.3 * Y;
  };
  const pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };
  const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
  const ART = resolve(ROOT, "public/authored");
  const parse = (f) => new Promise((ok, no) => { const b = readFileSync(resolve(ART, f)); new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "", ok, no); });
  const measure = async (file, cls, hairColor) => {
    const g = await parse(file);
    const node = g.scene.clone(true);
    if (!OFF) {
      node.traverse((c) => { if (c.geometry && /__strands$/.test(c.name)) PR.adoptStrandColours(c.geometry); });
      const ap = { ...CHM.defaultAppearance(cls), hairColor, beardColor: hairColor };
      const resolver = DR.authoredResolver(DR.authoredDressContext({ cls, appearance: ap, materials: CHM.RAW }));
      AU.dressFromSurfaceNames(node, resolver, "Head");
    }
    const out = { strands: [], root: [], tip: [], rootY: [], tipY: [], cap: [], metal: 0, single: 0, meshes: 0 };
    node.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material, name = m?.name ?? "";
      const isStrand = /__strands$/.test(o.name), isCap = /^(hair|beard)-.*_1$/.test(o.name);
      if (!isStrand && !isCap) return;
      out.meshes++;
      const k = 1 - (m.metalness ?? 0);
      if ((m.metalness ?? 0) > 0.2) out.metal++;
      if (isStrand && m.side !== THREEM.DoubleSide) out.single++;
      const col = m.vertexColors ? o.geometry.getAttribute("color") : null;
      const uv = o.geometry.getAttribute("uv");
      const c = new THREEM.Color();
      if (isCap) { c.copy(m.color).multiplyScalar(k); out.cap.push(lab(c)); return; }
      const n = o.geometry.getAttribute("position").count;
      for (let i = 0; i < n; i += 3) {
        c.copy(m.color);
        if (col) c.multiply(new THREEM.Color().setRGB(col.getComponent(i, 0), col.getComponent(i, 1), col.getComponent(i, 2)));
        c.multiplyScalar(k);
        const L = lab(c);
        out.strands.push(L);
        // glTF's v runs DOWN the image, and `strands.py` wrote the ribbon's t (0 at the root, 1 at the tip) as the
        // Blender v: so in three.js the ROOT is v near 1 and the TIP is v near 0. (Labelled the other way round the
        // first cut of this read a tip darker than its root and failed a ramp that was there.)
        const v = uv ? uv.getY(i) : 0.5;
        const Y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        if (v > 0.75) { out.root.push(L); out.rootY.push(Y); } else if (v < 0.25) { out.tip.push(L); out.tipY.push(Y); }
      }
    });
    return out;
  };
  const mean2 = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const rows = [];
  for (const cls of CLASSES) for (const [role, styles] of [["hair", ["short", "long", "braids"]], ["beard", ["short", "full", "forked", "braided"]]]) {
    for (const style of styles) {
      const f = `${role}-${cls}-${style}.glb`;
      if (!existsSync(resolve(ART, f))) continue;
      rows.push({ f, cls, role, ...(await measure(f, cls, 0x4a3220)) });
    }
  }
  const allS = rows.flatMap((r) => r.strands), allCap = rows.flatMap((r) => r.cap);
  const p95 = pct(allS, 0.95), p50 = pct(allS, 0.5), p05 = pct(allS, 0.05);
  const capMin = Math.min(...allCap);
  const root = mean2(rows.flatMap((r) => r.root)), tip = mean2(rows.flatMap((r) => r.tip));
  const rootY = mean2(rows.flatMap((r) => r.rootY)), tipY = mean2(rows.flatMap((r) => r.tipY));
  const spreadStr = pct(allS, 0.9) - pct(allS, 0.1);
  console.log(`[hair] ${rows.length} props (${CLASSES.length} classes x hair and beard styles), hair colour 0x4a3220 (the class default)`);
  console.log(`[hair] ribbons  effective diffuse albedo L*   p05 ${p05.toFixed(1)}   p50 ${p50.toFixed(1)}   p95 ${p95.toFixed(1)}   root ${root.toFixed(1)}   tip ${tip.toFixed(1)}   p10-p90 spread ${spreadStr.toFixed(1)}`);
  console.log(`[hair] caps     effective diffuse albedo L*   min ${capMin.toFixed(1)}   mean ${mean2(allCap).toFixed(1)}`);
  const STRAND_P95 = 65, CAP_MIN = 14, RAMP_MIN = 1.5, SPREAD_MIN = 5;
  const rep = (ok, name, detail) => { console.log(`[hair] ${ok ? "PASS" : "FAIL"} ${name} — ${detail}`); if (!ok) bad++; };
  rep(p95 <= STRAND_P95, `the ribbons are never the brightest thing on the head: strand p95 L* <= ${STRAND_P95}`, `p95 ${p95.toFixed(1)}${OFF ? " (the white COLOR_0 x 0.8: #e7e7e7)" : ""}`);
  rep(capMin >= CAP_MIN, `the under-cap is hair and not a hole: cap L* >= ${CAP_MIN}`, `min ${capMin.toFixed(1)}${OFF ? " (metallic 1, roughness 1, no environment: black)" : ""}`);
  // In LINEAR luma, because that is what the light multiplies and what a dark head compresses in L*: the file's own ramp is
  // 0.45 at the root to 0.95 at the tip (x2.1), and the quartile means land at about x1.7; the bar is x1.5.
  rep(tipY / rootY >= RAMP_MIN, `the lay keeps its ramp: the tip of a strand carries ${RAMP_MIN}x the light of its root, or more`, `root L* ${root.toFixed(1)}, tip L* ${tip.toFixed(1)}, tip/root luma ${(tipY / rootY).toFixed(2)}x`);
  rep(spreadStr >= SPREAD_MIN, `every strand is its own value (p10-p90 spread >= ${SPREAD_MIN} L*)`, `${spreadStr.toFixed(1)}`);
  rep(rows.every((r) => r.metal === 0) && rows.every((r) => r.single === 0), "no metal in hair, and every ribbon is drawn on both sides",
    `${rows.reduce((n, r) => n + r.metal, 0)} metallic meshes, ${rows.reduce((n, r) => n + r.single, 0)} single-sided ribbon meshes over ${rows.reduce((n, r) => n + r.meshes, 0)}`);
  // R1: the lever. The same prop, three colours: the ribbons must follow the man.
  {
    const f = "hair-huscarl-short.glb";
    const dark = await measure(f, "huscarl", 0x1c1712), mid = await measure(f, "huscarl", 0x4a3220), fair = await measure(f, "huscarl", 0xb8a14e);
    const m3 = [mean2(dark.strands), mean2(mid.strands), mean2(fair.strands)];
    rep(m3[0] + 8 < m3[1] && m3[1] + 8 < m3[2], "R1 the ribbons follow hairColor: Raven Black < Oak Brown < Norse Gold by 8 L* or more each",
      `mean ribbon L* ${m3.map((x) => x.toFixed(1)).join(" < ")}`);
  }
  console.log(`[hair] NOT MEASURED: no light and no grade (albedo only); the beard does not fade into the skin at the growth line; no anisotropic highlight; the ribbons' alpha edge is not in the file — a deferral, not a clean sheet`);
  const { rmSync: rm2 } = await import("fs");
  rm2(em.work, { recursive: true, force: true });
}

console.log("");
console.log(bad ? `[hair] FAIL — ${bad} check(s)` : "[hair] PASS");
process.exit(bad ? 1 : 0);
