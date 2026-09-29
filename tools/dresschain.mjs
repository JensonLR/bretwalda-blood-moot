#!/usr/bin/env node
// ============================================================
// DRESSCHAIN — the seam every authored material goes through, held to its contract.
//
//   node tools/dresschain.mjs
//
// `src/game/client/render/authoredDress.ts` replaced two pasted closures (the arena's and the armoury's) with one
// resolver that walks three handlers — skin (U5), livery (U6), hair (U6) — and stops at the first that claims the ask.
// Two engineers are writing those handlers in parallel and neither may edit the closures, so this is the ruler they
// share. It asks three questions and each one is about a way the seam can go wrong quietly:
//
//   1. WITH THE THREE STUBS AS COMMITTED THE CHAIN IS THE OLD CLOSURE. Every ask, every mesh, every man: the material
//      that comes back is the very object `materials.tinted(surface, color)` / `standard(color)` returned. This is
//      the claim that keeps "a pass-through" true while the handlers are written, and it fails the day a stub claims
//      something it should have left alone. (`authoredtest` and the arena frames hold the same claim on real GLBs
//      and real pixels; this one holds it on the whole ask space in a second.)
//   2. THE CHAIN'S SEMANTICS, on handlers written for the purpose: the first claim wins and the later handlers are
//      never asked; a null passes; a handler that THROWS costs only itself and is logged once; `base()` is computed
//      once per ask however often it is called and only if someone calls it; the mesh the handler sees is the mesh
//      that was asked about.
//   3. THE CONTEXT IS NARROWED THE WAY `createWarriorRig` narrows it: no appearance is the class default, an unknown
//      team is "none", an unknown people is the unsworn, and a face seed is stable per man.
//
// It compiles the module with tsc into `.dresschain/` (git-ignored, like its siblings' `.rungcensus/`) so no browser and no GPU is needed, then swaps in test handlers by overwriting the COMPILED stubs. It
// never edits a source file.
// ============================================================
import { spawnSync } from "node:child_process";
import { rmSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".dresschain");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/render/authoredDress.ts", "--outDir", ".dresschain",
  "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck", "--jsx", "preserve"],
{ cwd: ROOT, encoding: "utf8" });
const emitted = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const f = resolve(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f); } };
walk(OUT);
const find = (n) => emitted.find((f) => f.endsWith("/" + n));
if (!find("authoredDress.js")) { console.error("[dresschain] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || "")); process.exit(2); }
// Node's ESM wants extensions; tsc's bundler resolution does not write them.
for (const f of emitted) {
  const src = readFileSync(f, "utf8");
  const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c))
    .replace(/(from\s+")@\/game\/([^"]*)(")/g, (m, a, b, c) => a + pathToFileURL(resolve(ROOT, "src/game", b)).href + c);
  if (fixed !== src) writeFileSync(f, fixed);
}
globalThis.window ??= { location: { search: "" }, innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, setItem() {} } };
globalThis.navigator ??= { userAgent: "node", maxTouchPoints: 0, hardwareConcurrency: 8 };
globalThis.document ??= { createElement: () => ({ getContext: () => null, width: 1, height: 1 }) };

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

/** A library that mints ONE object per (surface, colour) so "the same material" is `===`. */
function stubLibrary() {
  const made = new Map();
  const calls = { tinted: 0, standard: 0 };
  const mint = (key) => { if (!made.has(key)) made.set(key, { isMaterial: true, name: key, clone() { return { ...this, name: `${key}#clone` }; } }); return made.get(key); };
  return {
    calls,
    tinted: (s, c) => { calls.tinted++; return mint(`${s}:${c.toString(16)}`); },
    standard: (c) => { calls.standard++; return mint(`m_${c.toString(16)}`); },
  };
}

const HEAD = { name: "part_34", dominantBone: "Head", isHead: true };
const HAND = { name: "part_18", dominantBone: "RightWrist", isHead: false };
const NECK = { name: "part_44", dominantBone: "Spine", isHead: false };
const ASKS = [
  { surface: "skin", color: 0x8d6444 }, { surface: "mail", color: 0x5f6b7a }, { surface: "wool", color: 0x6b5a3a },
  { surface: "leather", color: 0x4a3220 }, { surface: "hairstrand", color: 0x4a3220 }, { surface: "hairunder", color: 0x4a3220 },
  { surface: "iron", color: 0x5f6b7a }, { surface: null, color: 0xbfa25c },
];
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];

const drop = (name, body) => writeFileSync(find(name), body);
let generation = 0;
/** Node caches a module by URL, so a fresh authoredDress must point at fresh handler URLs. */
async function fresh() {
  const n = ++generation;
  const src = readFileSync(find("authoredDress.js"), "utf8")
    .replace(/from\s+"(\.\/authored(?:Skin|Livery|Hair)\.js)"/g, (m, f) => `from "${f}?v=${n}"`);
  const copy = find("authoredDress.js").replace(/authoredDress\.js$/, `authoredDress.v${n}.js`);
  writeFileSync(copy, src);
  return import(pathToFileURL(copy).href);
}

console.log("\n[dresschain] the authored-material seam, against its contract\n");

// ---------------------------------------------------------------------------------------------------------------
// 1. THE STUBS AS COMMITTED
// ---------------------------------------------------------------------------------------------------------------
{
  const D = await fresh();
  let asked = 0, same = 0, bad = "";
  for (const cls of CLASSES) for (const team of ["none", "red", "blue"]) for (const people of ["none", "saxon", "norse", "briton", "pict"]) {
    const lib = stubLibrary();
    const ctx = D.authoredDressContext({ cls, team, faceSeed: 7, materials: lib, appearance: { ...defaultOf(D, cls), people } });
    for (const ask of ASKS) for (const mesh of [HEAD, HAND, NECK, D.ANONYMOUS_MESH]) {
      asked++;
      const want = ask.surface ? lib.tinted(ask.surface, ask.color) : lib.standard(ask.color);
      const got = D.resolveAuthoredMaterial(ask, mesh, ctx);
      if (got === want) same++; else if (!bad) bad = `${cls}/${team}/${people} ${ask.surface} on ${mesh.name}`;
    }
  }
  check("every ask, every mesh, every man resolves to the library's own object", same === asked && asked > 1000, `${same}/${asked}${bad ? `; first miss ${bad}` : ""}`);
  const lib = stubLibrary();
  const ctx = D.authoredDressContext({ cls: "huscarl", materials: lib });
  const viaResolver = D.authoredResolver(ctx);
  check("the closure the call sites hold answers the same, with or without a mesh",
    viaResolver(ASKS[1], HEAD) === viaResolver(ASKS[1]) && viaResolver(ASKS[1]) === lib.tinted("mail", 0x5f6b7a));
  check("a library that throws on an ask is not swallowed by the chain (the caller catches it per mesh)", (() => {
    const boom = { tinted() { throw new Error("no such surface"); }, standard: () => ({}) };
    try { D.resolveAuthoredMaterial({ surface: "nope", color: 1 }, HEAD, D.authoredDressContext({ cls: "huscarl", materials: boom })); return false; } catch { return true; }
  })());
}

function defaultOf(D, cls) { return D.authoredDressContext({ cls, materials: stubLibrary() }).appearance; }

// ---------------------------------------------------------------------------------------------------------------
// 2. THE CHAIN'S SEMANTICS, with handlers written for the purpose (the COMPILED stubs are overwritten)
// ---------------------------------------------------------------------------------------------------------------
const SKIN_CLAIMS = `export const dressSkin = (ask, mesh, ctx, base) => (ask.surface === "skin" && mesh.isHead ? Object.assign(Object.create(base()), { name: "claimed:skin", by: "skin" }) : null);`;
{
  drop("authoredSkin.js", SKIN_CLAIMS);
  drop("authoredLivery.js", `export const EXCEPTIONS = []; export const dressLivery = (ask, mesh, ctx, base) => { if (ask.surface === "mail") throw new Error("livery exploded"); return ask.surface === "wool" ? { name: "claimed:wool", by: "livery" } : null; };`);
  drop("authoredHair.js", `export const dressHair = (ask, mesh, ctx, base) => (ask.surface === "hairstrand" ? { name: "claimed:hair", by: "hair", sawBone: mesh.dominantBone, sawClass: ctx.warriorClass } : null);`);
  const D = await fresh();
  const warn = console.warn; const warned = []; console.warn = (...a) => warned.push(a.join(" "));
  const lib = stubLibrary();
  const ctx = D.authoredDressContext({ cls: "warden", materials: lib });
  const skinOnHead = D.resolveAuthoredMaterial(ASKS[0], HEAD, ctx);
  check("a handler that claims an ask gets its material onto the mesh", skinOnHead.by === "skin");
  check("...and the same ask on a hand passes through to the library", D.resolveAuthoredMaterial(ASKS[0], HAND, ctx) === lib.tinted("skin", 0x8d6444));
  check("...and the neck, shared with the spine, is not the head either", D.resolveAuthoredMaterial(ASKS[0], NECK, ctx) === lib.tinted("skin", 0x8d6444));
  check("a later handler claims what an earlier one passed", D.resolveAuthoredMaterial(ASKS[2], HAND, ctx).by === "livery");
  check("the hair handler sees the mesh and the man it was asked about",
    (() => { const m = D.resolveAuthoredMaterial(ASKS[4], { ...HEAD, dominantBone: "Head" }, ctx); return m.by === "hair" && m.sawBone === "Head" && m.sawClass === "warden"; })());
  const beforeWarn = warned.length;
  let survived = null, escaped = null;
  try { survived = D.resolveAuthoredMaterial(ASKS[1], HAND, ctx); D.resolveAuthoredMaterial(ASKS[1], HAND, ctx); } catch (e) { escaped = e; }
  check("a handler that THROWS costs only itself: the man still gets the library's mail",
    escaped === null && survived === lib.tinted("mail", 0x5f6b7a), escaped ? `escaped: ${escaped}` : "");
  check("...and it is logged once, not once per mesh", warned.length === beforeWarn + 1 && /livery/.test(warned[warned.length - 1]), warned.slice(-1)[0] ?? "");
  console.warn = warn;

  // The FIRST claim wins and the later handlers are not asked.
  drop("authoredSkin.js", `export const dressSkin = () => ({ name: "skin-first", by: "skin" });`);
  drop("authoredLivery.js", `export const EXCEPTIONS = []; export const dressLivery = () => { globalThis.__livery_asked = true; return { name: "livery-second", by: "livery" }; };`);
  drop("authoredHair.js", `export const dressHair = () => null;`);
  const E = await fresh();
  globalThis.__livery_asked = false;
  const first = E.resolveAuthoredMaterial(ASKS[1], HAND, E.authoredDressContext({ cls: "huscarl", materials: stubLibrary() }));
  check("the first handler to claim wins, in the order skin, livery, hair", first.by === "skin" && globalThis.__livery_asked === false);

  // base() is lazy and memoised.
  drop("authoredSkin.js", `export const dressSkin = (ask, mesh, ctx, base) => { base(); base(); base(); return null; };`);
  drop("authoredLivery.js", `export const EXCEPTIONS = []; export const dressLivery = (ask, mesh, ctx, base) => { base(); return null; };`);
  drop("authoredHair.js", `export const dressHair = () => null;`);
  const F = await fresh();
  const lib2 = stubLibrary();
  F.resolveAuthoredMaterial(ASKS[1], HAND, F.authoredDressContext({ cls: "huscarl", materials: lib2 }));
  check("base() is minted once per ask however many handlers call it, and the chain's own fallback reuses it",
    lib2.calls.tinted === 1, `${lib2.calls.tinted} library call(s)`);
  drop("authoredSkin.js", `export const dressSkin = () => null;`);
  drop("authoredLivery.js", `export const EXCEPTIONS = []; export const dressLivery = () => null;`);
  const G = await fresh();
  const lib3 = stubLibrary();
  G.resolveAuthoredMaterial(ASKS[1], HAND, G.authoredDressContext({ cls: "huscarl", materials: lib3 }));
  check("...and with nothing calling it the library is asked exactly once, at the end", lib3.calls.tinted === 1);
}

// ---------------------------------------------------------------------------------------------------------------
// 3. THE CONTEXT
// ---------------------------------------------------------------------------------------------------------------
{
  const D = await fresh();
  const lib = stubLibrary();
  const bare = D.authoredDressContext({ cls: "berserker", materials: lib });
  check("no appearance is the class default (the same read createWarriorRig makes)",
    bare.appearance && bare.appearance.cloak === "brown" && bare.appearance.beardStyle === "full", `cloak ${bare.appearance?.cloak}, beard ${bare.appearance?.beardStyle}`);
  check("an unknown team is 'none', and red and blue survive",
    D.authoredDressContext({ cls: "warden", team: "purple", materials: lib }).team === "none"
    && D.authoredDressContext({ cls: "warden", team: "red", materials: lib }).team === "red"
    && D.authoredDressContext({ cls: "warden", team: "blue", materials: lib }).team === "blue"
    && D.authoredDressContext({ cls: "warden", team: undefined, materials: lib }).team === "none");
  const ap = (people) => ({ ...bare.appearance, people });
  check("people is narrowed off the appearance: a stale string is the unsworn",
    D.authoredDressContext({ cls: "warden", appearance: ap("norse"), materials: lib }).people === "norse"
    && D.authoredDressContext({ cls: "warden", appearance: ap("martian"), materials: lib }).people === "none"
    && bare.people === "none");
  const a = D.authoredDressContext({ cls: "warden", id: "player-77", materials: lib }).faceSeed;
  const b = D.authoredDressContext({ cls: "warden", id: "player-77", materials: lib }).faceSeed;
  const c = D.authoredDressContext({ cls: "warden", id: "player-78", materials: lib }).faceSeed;
  check("a face seed is stable per man and differs between men", a === b && Number.isInteger(a) && a !== c, `${a} ${b} ${c}`);
  check("an explicit face seed wins", D.authoredDressContext({ cls: "warden", id: "player-77", faceSeed: 5, materials: lib }).faceSeed === 5);
  check("the library the man is dressed from is carried, not copied", D.authoredDressContext({ cls: "warden", materials: lib }).materials === lib);
  check("the anonymous mesh is frozen and is nobody's head", Object.isFrozen(D.ANONYMOUS_MESH) && D.ANONYMOUS_MESH.isHead === false && D.ANONYMOUS_MESH.dominantBone === null);
}

rmSync(OUT, { recursive: true, force: true });
console.log(`\n[dresschain] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
