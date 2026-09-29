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
//   1. THE CHAIN IS THE OLD CLOSURE FOR EVERY ASK NO LIVE HANDLER OWNS. Every ask, every mesh, every man: the material
//      that comes back is the very object `materials.tinted(surface, color)` / `standard(color)` returned. This is
//      the claim that keeps "a pass-through" true while the handlers are written, and it fails the day a handler
//      claims something it should have left alone. It said "every ask" until the skin handler (U5) went live; the
//      handlers that are live are listed in `LIVE` below with what each OWNS, and a handler going live adds one line
//      there. (`authoredtest` and the arena frames hold the same claim on real GLBs and real pixels; this one holds it
//      on the whole ask space in a second.) Section 1b holds each live handler to what it owns.
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
import * as THREE from "three";

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
  // WHICH HANDLERS ARE LIVE, and what each owns: the asks claim 1 leaves to them. One line per handler that has
  // landed; a stub that has not landed owns nothing and is held to the old closure.
  const SKIN = await import(pathToFileURL(find("authoredSkin.js")).href);
  const LIVE = [
    // skin (U5): the baked skin hexes on any mesh, and the baked eye hexes on the head's own `part_N` meshes
    (ask, mesh) => (ask.surface === "skin" && SKIN.fleshRoleOf(ask.color) !== null)
      || (ask.surface === null && mesh.isHead && /^part_\d+$/.test(mesh.name) && SKIN.eyeRoleOf(ask.color) !== null),
  ];
  const owned = (ask, mesh) => LIVE.some((owns) => owns(ask, mesh));
  let asked = 0, same = 0, bad = "";
  for (const cls of CLASSES) for (const team of ["none", "red", "blue"]) for (const people of ["none", "saxon", "norse", "briton", "pict"]) {
    const lib = stubLibrary();
    const ctx = D.authoredDressContext({ cls, team, faceSeed: 7, materials: lib, appearance: { ...defaultOf(D, cls), people } });
    for (const ask of ASKS) for (const mesh of [HEAD, HAND, NECK, D.ANONYMOUS_MESH]) {
      if (owned(ask, mesh)) continue;
      asked++;
      const want = ask.surface ? lib.tinted(ask.surface, ask.color) : lib.standard(ask.color);
      const got = D.resolveAuthoredMaterial(ask, mesh, ctx);
      if (got === want) same++; else if (!bad) bad = `${cls}/${team}/${people} ${ask.surface} on ${mesh.name}`;
    }
  }
  check("every ask no live handler owns, every mesh, every man resolves to the library's own object", same === asked && asked > 1000, `${same}/${asked}${bad ? `; first miss ${bad}` : ""}`);
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
// 1b. THE LIVE HANDLERS, held to what they own (the real compiled handlers, real three.js materials)
// ---------------------------------------------------------------------------------------------------------------
/** A library that mints REAL three.js materials, one object per (surface, colour, options): a handler can clone and colour them. */
function threeLibrary() {
  const made = new Map();
  const calls = [];
  const mk = (key, make) => { if (!made.has(key)) { const m = make(); m.name = key; made.set(key, m); } return made.get(key); };
  return {
    calls,
    tinted: (s, c, o = {}) => { calls.push(["tinted", s, c, o]); return mk(`${s}:${c.toString(16)}|${JSON.stringify(o)}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: o.roughness ?? 0.6 })); },
    standard: (c, r = 0.8) => { calls.push(["standard", c, r]); return mk(`m_${c.toString(16)}|${r}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: r })); },
  };
}
{
  const D = await fresh();
  const S = await import(pathToFileURL(find("authoredSkin.js")).href);
  const M = await import(pathToFileURL(find("faceMap.js")).href);
  const CHARS = await import(pathToFileURL(find("characters.js")).href);
  const seedFor = (toneIdx, avoid = -1) => { for (let s = 0; s < 4096; s++) { const t = CHARS.faceTraits(s).tone; if (t === toneIdx && t !== avoid) return s; } return -1; };
  const seedA = seedFor(0), seedB = seedFor(3);
  const libA = threeLibrary();
  const ctxA = D.authoredDressContext({ cls: "huscarl", faceSeed: seedA, materials: libA });
  const ctxB = D.authoredDressContext({ cls: "huscarl", faceSeed: seedB, materials: libA });
  const base = (role) => ({ surface: "skin", color: S.LEGACY_BAKED[role] });
  const skinOfA = D.resolveAuthoredMaterial(base("base"), HAND, ctxA), skinOfA2 = D.resolveAuthoredMaterial(base("base"), HAND, ctxA);
  const skinOfB = D.resolveAuthoredMaterial(base("base"), HAND, ctxB);
  const toneA = CHARS.SKIN_TONES[CHARS.faceTraits(seedA).tone].base, toneB = CHARS.SKIN_TONES[CHARS.faceTraits(seedB).tone].base;
  check("a hand's baked skin becomes the man's own tone, and two men with two tones are two skins",
    skinOfA !== skinOfB && skinOfA.color.getHex() === toneA && skinOfB.color.getHex() === toneB && toneA !== toneB,
    `#${toneA.toString(16)} and #${toneB.toString(16)}`);
  check("...and one man is one material however many meshes ask", skinOfA === skinOfA2);
  check("...and the hand keeps the body's grain, not the head's (no map of its own, no tile option)",
    skinOfA.map === null && !libA.calls.some((c) => c[0] === "tinted" && c[3].tile !== undefined && c[2] === toneA && c[3].roughness === 0.5));
  const lib0 = threeLibrary();
  const ctx0 = D.authoredDressContext({ cls: "huscarl", faceSeed: seedA, materials: lib0 });
  check("a skin hex that is not a baked hex is PASSED, not dressed",
    D.resolveAuthoredMaterial({ surface: "skin", color: 0x123456 }, HAND, ctx0) === lib0.tinted("skin", 0x123456));
  check("the hexes the shipped files carry and the hexes the tables produce are BOTH recognised",
    S.fleshRoleOf(S.LEGACY_BAKED.base) === "base" && S.fleshRoleOf(S.LEGACY_BAKED.shade) === "shade" && S.fleshRoleOf(S.LEGACY_BAKED.warm) === "warm"
    && S.fleshRoleOf(CHARS.SKIN_TONES[CHARS.faceTraits(0).tone].base) === "base"
    && S.eyeRoleOf(S.LEGACY_BAKED.sclera) === "sclera" && S.eyeRoleOf(CHARS.IRIS_COLORS[CHARS.faceTraits(0).iris]) === "iris" && S.eyeRoleOf(S.LEGACY_BAKED.dark) === "dark");

  // the head: a triangle on the face of the huscarl, as the GLB has it (x mirrored), riding the Head bone
  const F = CHARS.faceFieldOf("huscarl", 0);
  const tri = () => {
    const g = new THREE.BufferGeometry(); const P = []; const o = new THREE.Vector3();
    for (const [w, v] of [[0.0, -0.1], [0.3, -0.1], [0.0, 0.2]]) { F.surface(w, v, o); P.push(-o.x, o.y + F.headY, o.z); }
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    g.setIndex([0, 1, 2]);
    return g;
  };
  const gHead = tri();
  const headMesh = { name: "part_34", dominantBone: "Head", isHead: true, geometry: gHead };
  const libH = threeLibrary();
  const ctxH = D.authoredDressContext({ cls: "huscarl", faceSeed: seedA, materials: libH });
  const face = D.resolveAuthoredMaterial(base("base"), headMesh, ctxH);
  const map = M.faceMapFor("huscarl", { schedule: false });
  check("the head's skin wears the class's complexion map, at the head's tile, in the man's own tone",
    face.map === map.head.tex && face.vertexColors === false && face.name.startsWith("face-head:base:") && libH.calls.some((c) => c[0] === "tinted" && c[3].tile === 0.0022),
    `map ${face.map?.image?.width}x${face.map?.image?.height}`);
  check("...and the head's own (u, v) is written into the shared geometry, once, in substance tiles",
    gHead.userData.faceUv?.kind === "head" && gHead.getAttribute("uv").getX(0) > 10 && gHead.getAttribute("uv").getX(0) < map.head.scaleU + 1);
  const uv0 = Array.from(gHead.getAttribute("uv").array);
  D.resolveAuthoredMaterial(base("shade"), { ...headMesh, name: "part_35" }, ctxH);
  check("...and a second ask does not write it again (the geometry is shared by every man of the class)", JSON.stringify(uv0) === JSON.stringify(Array.from(gHead.getAttribute("uv").array)));
  check("...and the colour carries the map's gain back, so map x colour is the tone",
    Math.abs(face.color.r - new THREE.Color(CHARS.SKIN_TONES[CHARS.faceTraits(seedA).tone].base).r * M.FACE_MAP_GAIN) < 1e-6);
  check("a head mesh with no geometry (a stub) is dressed as a body, not crashed on",
    (() => { try { const m = D.resolveAuthoredMaterial(base("base"), HEAD, ctxH); return m && m.map === null; } catch { return false; } })());
  // the neck: bbox in the class's own numbers
  const span = F.neckSpan;
  const gNeck = new THREE.BufferGeometry();
  const nk = [];
  for (const [ex, y] of [[1, span.bottom], [-1, span.bottom], [0, span.top], [0.5, (span.top + span.bottom) / 2]]) { const st = F.neckAt(y); nk.push(st.hw * ex, y, st.z + st.hd * 0.9); }
  gNeck.setAttribute("position", new THREE.Float32BufferAttribute(nk, 3)); gNeck.setIndex([0, 1, 2, 1, 2, 3]);
  const neck = D.resolveAuthoredMaterial(base("base"), { name: "part_44", dominantBone: "Spine", isHead: false, geometry: gNeck }, ctxH);
  check("the neck shell is found by where it is (the class's neck span) and wears its own map",
    neck.map === map.neck.tex && gNeck.userData.faceUv?.kind === "neck");
  const gTorso = new THREE.BufferGeometry();
  gTorso.setAttribute("position", new THREE.Float32BufferAttribute([0.2, 1.06, 0, -0.2, 1.06, 0, 0, 1.71, 0.1], 3)); gTorso.setIndex([0, 1, 2]);
  const torso = D.resolveAuthoredMaterial(base("base"), { name: "part_10", dominantBone: "Spine", isHead: false, geometry: gTorso }, ctxH);
  check("a bare torso is not a neck, and stays a body", torso.map === null && !gTorso.userData.faceUv);
  // the eyes
  const eye = (hex, name = "part_36", head = true) => D.resolveAuthoredMaterial({ surface: null, color: hex }, { name, dominantBone: "Head", isHead: head }, ctxH);
  const toneOf = CHARS.SKIN_TONES[CHARS.faceTraits(seedA).tone], irisOf = CHARS.IRIS_COLORS[CHARS.faceTraits(seedA).iris];
  check("the baked sclera and iris become the man's own, wet (0.34 and 0.09), and the dark stays the eye's dark",
    eye(S.LEGACY_BAKED.sclera).color.getHex() === toneOf.sclera && eye(S.LEGACY_BAKED.sclera).roughness === 0.34
    && eye(S.LEGACY_BAKED.iris, "part_38").color.getHex() === irisOf && eye(S.LEGACY_BAKED.iris, "part_38").roughness === 0.09
    && eye(S.LEGACY_BAKED.dark, "part_37").color.getHex() === CHARS.FACE_DARK);
  check("the runekeeper's hood (a helm mesh in the eye's dark) and a hand-held plain colour are NOT eyes",
    eye(S.LEGACY_BAKED.dark, "helm_42") === libH.standard(S.LEGACY_BAKED.dark) && eye(S.LEGACY_BAKED.sclera, "part_36", false) === libH.standard(S.LEGACY_BAKED.sclera));
}


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
