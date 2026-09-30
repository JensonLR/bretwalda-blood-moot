#!/usr/bin/env node
// ============================================================
// RECIPEMAP — the plan's material table (CHAR-PLAN 1.5), read off the BUILT maps.
//
// THE QUESTION. `docs/CHAR-PLAN` CH-29 and CH-32 say the mail is blue, the wool corduroy, the fittings yellow plastic
// and the trims plain stripes, and 1.5 gives the numbers a recipe has to hit instead. Every one of those is a property
// of a map `textures.ts` builds, so it can be READ instead of argued: `__probeSubstance(name)` runs the shipping recipe
// at the size it ships at and hands back the height, roughness, metalness and albedo arrays, and this file measures
// them. (`tools/hairmap.mjs` was the first ruler to use that door, for the hair.)
//
// WHAT IT ASKS, and each is a way a recipe can be wrong that the others cannot see:
//   1. NEUTRAL IRON. The mail map's albedo is grey: the finish's hex is the colour and the map is the value. A map
//      with its own hue (wire #5c636c, crown #a8b0ba: blue) is a second opinion about what colour the hauberk is, and
//      it was the one the shop's Rough Iron lost. Bar: chroma p50 C* 3 or under. HEAD reads 5.9.
//   2. THE RUST IS A CAP. Rust drops the metalness and raises the roughness of a ring; the plan caps it at half of what
//      the recipe let it be (.9 to .45). Read as the lowest metalness a ring has: 0.80 or over. HEAD reads 0.73.
//      The plan's own floor (0.70) is asserted as well, and the roughness mean stays inside its 0.29-0.40 band.
//   3. WOOL HAS ABRASH AND LESS RELIEF. The vat's streak down the warp is worth +-8% of the value the eye reads: the
//      column-mean L* of the map varies by 2.3 or more (HEAD 1.99, and 1.99 is what the streak-less recipe gives, which
//      is R1: switch the term off and the reading goes back). And the wool's normal map is under 0.75 (HEAD 1.0).
//   4. THE TABLET SURFACE EXISTS AND IS A BRAID. Not wool with a stripe on it: three populations of value (the pattern
//      thread, the ground, the cord and the change-over line), a cord that stands proud at BOTH selvedges, a diamond
//      chain whose profile across the band changes along it (a zigzag), and a tile that wraps. And the trims wear it.
//   5. THE FITTINGS ARE CAST BRONZE: roughness 0.50-0.54 and metalness 0.66-0.74 (the plan's 0.52 and 0.70), not the
//      0.46 and 0.78 that read as yellow plastic on the old #bfa25c.
//
// THE INSTRUMENT IS CALIBRATED FIRST (R1): a flat grey map, a red-brown one and a striped one go through the same
// statistics, and the readings have to be the ones those maps are.
//
// WHAT IT DOES NOT SEE, and the verdict line says so: light and grade (the maps are albedo, roughness and metalness,
// not a lit pixel), the leather's edge burnish and stitch groove, the wool's sheen (MeshStandardMaterial has none), the
// hem soil and the per-garment weave phase (those need the garment's UVs), and where the rust goes (hem band and
// armpits only, which needs the geometry): none of those is built, and the plan's row for each is still open.
// ============================================================
import { resolve, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { readFileSync, rmSync } from "fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { emitClient } = await import("./lib/clientmodule.mjs");
const { labOf, chromaOf } = await import(pathToFileURL(resolve(ROOT, "tools/lib/roseband.mjs")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};
const die = (m) => { console.error(`[recipemap] ${m}`); process.exit(2); };

const start = Date.now();
globalThis.window ??= { location: { search: "" }, innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, setItem() {} } };
globalThis.navigator ??= { userAgent: "node", maxTouchPoints: 0, hardwareConcurrency: 8 };
globalThis.document ??= { createElement: () => ({ getContext: () => null, width: 1, height: 1 }) };

let em;
try {
  em = await emitClient(ROOT, ["src/game/client/render/textures.ts", "src/game/client/characters.ts"], ".recipemap");
} catch (e) { die(`the client did not compile:\n${String(e?.message ?? e).slice(0, 600)}`); }
const TEX = await em.byName("textures.js");
const CH = await em.byName("characters.js");
if (!TEX || typeof TEX.__probeSubstance !== "function") die("textures.ts exports no __probeSubstance seam");
const probe = TEX.__probeSubstance;

// ---------------------------------------------------------------------------
// Statistics, on a Gen-shaped object ({ size, h, r, m, c })
// ---------------------------------------------------------------------------
const hexOf = (r, g, b) => (Math.round(Math.max(0, Math.min(1, r)) * 255) << 16) | (Math.round(Math.max(0, Math.min(1, g)) * 255) << 8) | Math.round(Math.max(0, Math.min(1, b)) * 255);
const pct = (arr, p) => { const s = Float32Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; };
function albedoStats(g) {
  const n = g.size * g.size;
  const L = new Float32Array(n), C = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lab = labOf(hexOf(g.c[i * 3], g.c[i * 3 + 1], g.c[i * 3 + 2]));
    L[i] = lab[0]; C[i] = chromaOf(lab);
  }
  return { L, C, n };
}
/** Standard deviation of the per-column mean L*: the streak a map carries ALONG v (constant in v, moving in u). */
function columnStd(L, size) {
  const col = new Float64Array(size);
  for (let i = 0; i < L.length; i++) col[i % size] += L[i];
  const m = Array.from(col, (x) => x / size);
  const mu = m.reduce((a, b) => a + b, 0) / m.length;
  return Math.sqrt(m.reduce((a, b) => a + (b - mu) ** 2, 0) / m.length);
}
const fake = (size, fill) => {
  const g = { size, h: new Float32Array(size * size), r: new Float32Array(size * size), m: new Float32Array(size * size), c: new Float32Array(size * size * 3) };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = y * size + x; const [r, gg, b] = fill(x / size, y / size); g.c[i * 3] = r; g.c[i * 3 + 1] = gg; g.c[i * 3 + 2] = b; }
  return g;
};

console.log("\n[recipemap] the plan's material table, read off the built maps\n");

// ---- 0. CALIBRATION ----
{
  const grey = albedoStats(fake(64, () => [0.5, 0.5, 0.5]));
  const brown = albedoStats(fake(64, () => [0.63, 0.5, 0.38]));
  check("the chroma reading tells a grey map from a red-brown one", pct(grey.C, 0.5) < 1 && pct(brown.C, 0.5) > 15,
    `grey C* ${pct(grey.C, 0.5).toFixed(1)}, red-brown C* ${pct(brown.C, 0.5).toFixed(1)}`);
  const flat = albedoStats(fake(64, () => [0.5, 0.5, 0.5]));
  const striped = albedoStats(fake(64, (u) => { const k = 1 + 0.11 * Math.sin(Math.PI * 2 * 3 * u); return [0.5 * k, 0.5 * k, 0.5 * k]; }));
  check("the streak reading is 0 on a flat map and reads a +-11% stripe down the warp",
    columnStd(flat.L, 64) < 0.01 && columnStd(striped.L, 64) > 2,
    `flat ${columnStd(flat.L, 64).toFixed(2)}, striped ${columnStd(striped.L, 64).toFixed(2)}`);
}

// ---- 1-2. MAIL ----
{
  const g = probe("mail");
  const st = albedoStats(g);
  const c50 = pct(st.C, 0.5);
  check("1. the mail map is neutral iron: albedo chroma p50 at C* 3 or under (the finish's hex is the colour, the map is the value)",
    c50 <= 3, `p50 C* ${c50.toFixed(1)}, p95 C* ${pct(st.C, 0.95).toFixed(1)} (HEAD: 5.9)`);
  let metalMin = 1, rough = 0, nm = 0;
  for (let i = 0; i < g.m.length; i++) if (g.m[i] > 0.3) { metalMin = Math.min(metalMin, g.m[i]); rough += g.r[i]; nm++; }
  check("2. the rust is a cap: no ring's metalness falls under 0.80 (the plan's rust cap, .9 halved to .45)", metalMin >= 0.8,
    `lowest metalness ${metalMin.toFixed(2)} (HEAD: 0.73)`);
  check("2b. the plan's own floor and band hold: metalness 0.70 or over, mean roughness 0.29-0.40",
    metalMin >= 0.7 && nm > 0 && rough / nm >= 0.29 && rough / nm <= 0.4, `mean roughness ${(rough / nm).toFixed(3)}`);
}

// ---- 3. WOOL ----
{
  const g = probe("wool");
  const st = albedoStats(g);
  const cs = columnStd(st.L, g.size);
  check("3. wool carries abrash: the column-mean L* varies by 2.3 or more down the warp", cs >= 2.3,
    `std ${cs.toFixed(2)} L* (HEAD, and the recipe with the term switched off: 1.99)`);
  const ns = typeof probe.normalScale === "function" ? probe.normalScale("wool") : null;
  check("3b. wool's relief is under 0.75 (the plan: 1.0 to 0.7)", ns !== null && ns <= 0.75, ns === null ? "textures.ts exports no __probeSubstance.normalScale" : `normalScale ${ns} (HEAD: 1)`);
}

// ---- 4. THE TABLET ----
{
  let g = null, why = "";
  try { g = probe("tablet"); } catch (e) { why = String(e?.message ?? e).split("\n")[0].slice(0, 100); }
  check("4. the `tablet` surface exists", !!g, g ? `${g.size} px` : (why || "no such surface"));
  if (g) {
    const st = albedoStats(g);
    const n = st.n, size = g.size;
    let bright = 0, dark = 0, mid = 0;
    for (let i = 0; i < n; i++) { if (st.L[i] >= 70) bright++; else if (st.L[i] <= 36) dark++; else mid++; }
    const sb = bright / n, sd = dark / n, sm = mid / n;
    check("4a. three populations of value: the pattern thread (8% or more), the cord and change-over line (8% or more), the ground (40% or more)",
      sb >= 0.08 && sd >= 0.08 && sm >= 0.4, `thread ${(100 * sb).toFixed(0)}%, cord and line ${(100 * sd).toFixed(0)}%, ground ${(100 * sm).toFixed(0)}%`);
    // Rows: mean height by v. The selvedges are the outer 6% at each side, the field is 20-80%.
    const rowMean = (y0, y1) => { let s = 0, k = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < size; x++) { s += g.h[y * size + x]; k++; } return s / k; };
    const top = rowMean(0, Math.floor(0.06 * size)), bot = rowMean(Math.ceil(0.94 * size), size), mid2 = rowMean(Math.floor(0.2 * size), Math.floor(0.8 * size));
    check("4b. a cord stands proud at BOTH selvedges (0.10 or more above the field)", top - mid2 >= 0.1 && bot - mid2 >= 0.1,
      `top +${(top - mid2).toFixed(2)}, bottom +${(bot - mid2).toFixed(2)}`);
    // The zigzag: the share of the field's height taken by thread at the diamond's widest column against the tip column.
    const share = (x) => { let k = 0, t = 0; for (let y = Math.floor(0.15 * size); y < Math.ceil(0.85 * size); y++) { t++; if (st.L[y * size + x] >= 70) k++; } return k / t; };
    const wide = share(Math.floor(size / 2)), tip = share(Math.floor(0.02 * size));
    check("4c. the pattern is a chain and not a stripe: thread fills the middle column's field (40% or more) and the tip column's (10% or under)",
      wide >= 0.4 && tip <= 0.1, `middle column ${(100 * wide).toFixed(0)}%, tip column ${(100 * tip).toFixed(0)}%`);
    // Seamless in u: the wrap step is no bigger than the map's own typical neighbour step.
    let wrap = 0, step = 0;
    for (let y = 0; y < size; y++) { wrap += Math.abs(st.L[y * size] - st.L[y * size + size - 1]); for (let x = 1; x < size; x++) step += Math.abs(st.L[y * size + x] - st.L[y * size + x - 1]); }
    wrap /= size; step /= size * (size - 1);
    check("4d. the tile wraps along the band: the seam step is under twice the typical neighbour step", wrap <= 2 * step + 0.5, `seam ${wrap.toFixed(2)} L*, typical ${step.toFixed(2)} L*`);
    const src = readFileSync(resolve(ROOT, "src/game/client/characters.ts"), "utf8");
    check("4e. the trims wear it: `tablet` in buildCharacter is the `tablet` substance and not wool", /const tablet = M\.tinted\("tablet"/.test(src),
      /const tablet = M\.tinted\("wool"/.test(src) ? "still `M.tinted(\"wool\", ...)`" : "");
  }
}

// ---- 5. THE FITTINGS ----
{
  const r = CH?.BRASS_ROUGHNESS, m = CH?.BRASS_METALNESS;
  check("5. the fittings are cast bronze: roughness 0.50-0.54 and metalness 0.66-0.74 (the plan's 0.52 and 0.70)",
    typeof r === "number" && typeof m === "number" && r >= 0.5 && r <= 0.54 && m >= 0.66 && m <= 0.74,
    typeof r === "number" ? `roughness ${r}, metalness ${m}` : "characters.ts exports no BRASS_ROUGHNESS / BRASS_METALNESS");
}

rmSync(em.work, { recursive: true, force: true });
console.log(`\n[recipemap] ${pass} passed, ${fail} failed${fail ? "" : ""} — WITH 4 deferrals: albedo, roughness and metalness only, no light and no grade; the leather's edge burnish and stitch groove, the wool's sheen (MeshStandardMaterial has none), the hem soil and the per-garment weave phase are NOT built; the rust is capped but not placed (hem band and armpits need the garment's UVs)`);
console.log(`[recipemap] ${fail ? "FAIL" : "PASS"} in ${Math.round((Date.now() - start) / 1000)}s`);
process.exit(fail ? 1 : 0);
