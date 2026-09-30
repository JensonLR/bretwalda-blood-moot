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
//   1. WITH THREE PASS-THROUGH HANDLERS THE CHAIN IS THE OLD CLOSURE. Every ask, every mesh, every man: the material
//      that comes back is the very object `materials.tinted(surface, color)` / `standard(color)` returned. This is a
//      property of the SEAM and not of whatever is written into it, so the three handlers are overwritten with
//      pass-throughs before it is asked (it used to run against the committed stubs, and went red the day the first
//      real handler was written: a claim about the wiring that fails when somebody uses the wiring is a claim about
//      the wrong thing). 1b then puts the REAL livery handler back and holds it to its half of the contract:
//      it answers what it owns without throwing and returns null for everything it does not.
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
// The three handlers as the code holds them, before anything below overwrites the compiled files.
const REAL = { Skin: readFileSync(find("authoredSkin.js"), "utf8"), Livery: readFileSync(find("authoredLivery.js"), "utf8"), Hair: readFileSync(find("authoredHair.js"), "utf8") };
const PASS = {
  Skin: "export const dressSkin = () => null;",
  Livery: "export const EXCEPTIONS = []; export const dressLivery = () => null;",
  Hair: "export const dressHair = () => null;",
};
{
  for (const n of ["Skin", "Livery", "Hair"]) drop(`authored${n}.js`, PASS[n]);
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

// ---------------------------------------------------------------------------------------------------------------
// 1b. THE REAL LIVERY HANDLER, AT THE SEAM (skin and hair stay pass-throughs so nothing else is being asked)
// ---------------------------------------------------------------------------------------------------------------
// The half of the contract this file can hold for `authoredLivery.ts` without a browser or a GLB: it ANSWERS what
// the role table owns (a material, not a throw: a throw is logged and skipped, and the man would be dressed by the
// library in the colour the file baked, which is the defect) and it PASSES every ask it does not own (the skin, the
// hair, the fixed steel, a hex nobody knows) so that the library's own object comes back. What the answer IS - the
// colour, per finish, cloak, people and side - is `authoredtest`'s roletable claim, which builds the procedural man
// beside it. The library here is a richer stub: the handler calls `armour` and `hide`, as the builder does.
{
  drop("authoredSkin.js", PASS.Skin);
  drop("authoredLivery.js", REAL.Livery);
  drop("authoredHair.js", PASS.Hair);
  const D = await fresh();
  const LV = await import(pathToFileURL(find("authoredLivery.js")).href + "?v=" + generation);
  const rich = () => {
    const lib = stubLibrary();
    const mint = (k) => lib.tinted(k.split(":")[0], parseInt(k.split(":")[1], 16));
    lib.armour = (c) => mint(`mail:${c.toString(16)}`);
    lib.hide = (c) => mint(`leather:${c.toString(16)}`);
    return lib;
  };
  const warn = console.warn; const warned = []; console.warn = (...a) => warned.push(a.join(" "));
  const ALL = [...ASKS, { surface: "wool", color: 0x8b7c5c }, { surface: "wool", color: 0x504a3e }, { surface: "leather", color: 0x4a3524 },
    { surface: "leather", color: 0x7a5b38 }, { surface: "linen", color: 0xc2b69c }, { surface: "steel", color: 0xb6bfca }, { surface: "bone", color: 0xd8cfb4 },
    { surface: "wool", color: 0x123456 }, { surface: null, color: 0x655d50 }, { surface: "skin", color: 0x7c4936 }];
  let owned = 0, ownedAnswered = 0, others = 0, othersPassed = 0, firstStray = "";
  for (const cls of CLASSES) for (const team of ["none", "red", "blue"]) for (const people of ["none", "saxon", "norse"]) {
    const lib = rich();
    const ctx = D.authoredDressContext({ cls, team, faceSeed: 7, materials: lib, appearance: { ...defaultOf(D, cls), people } });
    for (const ask of ALL) {
      const role = LV.roleOf(cls, ask);
      const got = D.resolveAuthoredMaterial(ask, HAND, ctx);
      if (role) { owned++; if (got && got.isMaterial) ownedAnswered++; }
      else {
        others++;
        const want = ask.surface ? lib.tinted(ask.surface, ask.color) : lib.standard(ask.color);
        if (got === want) othersPassed++; else if (!firstStray) firstStray = `${cls} ${ask.surface}:${ask.color.toString(16)}`;
      }
    }
  }
  console.warn = warn;
  check("the real livery handler answers every ask the role table owns, without throwing", owned > 200 && ownedAnswered === owned && warned.length === 0,
    `${ownedAnswered}/${owned} answered${warned.length ? `; it threw: ${warned[0]}` : ""}`);
  check("...and returns the library's own object for every ask it does not own (skin, fixed steel, bone, hair, a hex nobody knows)", others > 100 && othersPassed === others,
    `${othersPassed}/${others} passed through${firstStray ? `; first stray ${firstStray}` : ""}`);
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
  // the real skin handler is the one under test; livery and hair stay pass-throughs so nothing else is being asked
  drop("authoredSkin.js", REAL.Skin);
  drop("authoredLivery.js", PASS.Livery);
  drop("authoredHair.js", PASS.Hair);
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
  const toneH = CHARS.SKIN_TONES[CHARS.faceTraits(seedA).tone], hairH = ctxH.appearance.hairColor;
  check("the head's skin wears the class's complexion map WITH the man's brows painted in his hair colour, at the head's tile, in his own tone",
    face.map === map.browed(toneH.base, hairH) && face.map !== map.head.tex && face.vertexColors === false && face.name.startsWith("face-head:base:") && libH.calls.some((c) => c[0] === "tinted" && c[3].tile === 0.0022),
    `map ${face.map?.image?.width}x${face.map?.image?.height}`);
  {
    const ctxB = D.authoredDressContext({ cls: "huscarl", faceSeed: seedA, materials: libH, appearance: { ...ctxH.appearance, hairColor: 0xe8e4da } });
    const faceB = D.resolveAuthoredMaterial(base("base"), headMesh, ctxB);
    check("...a different hair colour is a different map (his brows are his), the same one is the same map",
      faceB.map !== face.map && faceB.map === map.browed(toneH.base, 0xe8e4da) && D.resolveAuthoredMaterial(base("base"), headMesh, ctxH).map === face.map);
    // the painted brow is the hair: the stored map at the brow's centre, times the tone and the gain, IS the hair colour (over a fraction that is the density)
    const Fh = CHARS.faceFieldOf("huscarl", 0), o = new THREE.Vector3();
    const az = 0.30, v = Math.asin(0), lo = -Math.PI / 2, uu = (az + Math.PI) / (2 * Math.PI);
    void o; void lo;
    // find the brow's own row: the latitude where coverage peaks at that bearing
    map.finish();
    const W = M.HEAD_MAP_SIZE.w, H = M.HEAD_MAP_SIZE.h;
    let bestJ = 0, bestC = 0; const iCol = Math.floor(uu * W);
    for (let j = 0; j < H; j++) if (map.cover[j * W + iCol] > bestC) { bestC = map.cover[j * W + iCol]; bestJ = j; }
    const map1 = map.browed(toneH.base, hairH);
    const px = map1.image.data, oo = (bestJ * W + iCol) * 4;
    const lin = (b) => { const c = b / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const tl = new THREE.Color(toneH.base), hl = new THREE.Color(hairH);
    const got = [lin(px[oo]) * tl.r * M.FACE_MAP_GAIN, lin(px[oo + 1]) * tl.g * M.FACE_MAP_GAIN, lin(px[oo + 2]) * tl.b * M.FACE_MAP_GAIN];
    // what the arithmetic says it must be: 86% of the hair (a little lighter than the swatch, fine hairs on skin) and 14% of the skin's own
    // value at that texel, which is the base map's times the tone
    const bs = map.head.data;
    const skinPart = [lin(bs[oo]) * tl.r * M.FACE_MAP_GAIN, lin(bs[oo + 1]) * tl.g * M.FACE_MAP_GAIN, lin(bs[oo + 2]) * tl.b * M.FACE_MAP_GAIN];
    const want = [hl.r, hl.g, hl.b].map((h, i) => Math.min(1, h * 1.15 / (Math.max(0.02, [tl.r, tl.g, tl.b][i] * M.FACE_MAP_GAIN))) * 0.86 * [tl.r, tl.g, tl.b][i] * M.FACE_MAP_GAIN + skinPart[i] * 0.14);
    check("...and at the middle of the brow the map times the tone is 86% the hair (a touch lighter than its swatch) and 14% the skin",
      bestC > 150 && got.every((g, i) => Math.abs(g - want[i]) < 0.03 * want[i] + 0.004) && got.every((g, i) => g < skinPart[i] * 0.85),
      `cover ${bestC}, got ${got.map((x) => x.toFixed(3)).join("/")}, want ${want.map((x) => x.toFixed(3)).join("/")}, the skin there ${skinPart.map((x) => x.toFixed(3)).join("/")}`);
  }
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
  const texel = (tex, x, y) => { const w = tex.image.width; const o = (y * w + x) * 4; return [tex.image.data[o], tex.image.data[o + 1], tex.image.data[o + 2]]; };
  const near = (a, hex, tol = 3) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].every((v, i) => Math.abs(a[i] - v) <= tol);
  const scl = eye(S.LEGACY_BAKED.sclera), irs = eye(S.LEGACY_BAKED.iris, "part_38");
  check("the baked sclera and iris become the man's own, TEXTURED, wet (0.34 and 0.09), and the dark stays the eye's dark",
    scl.roughness === 0.34 && irs.roughness === 0.09 && scl.color.getHex() === 0xffffff && irs.color.getHex() === 0xffffff
    && near(texel(scl.map, 32, 8), S.scleraFor(toneOf)) && near(texel(irs.map, 20, 12), irisOf, 60),
    `sclera centre ${texel(scl.map, 32, 8).join("/")} for #${S.scleraFor(toneOf).toString(16)} (the table's #${toneOf.sclera.toString(16)})`);
  {
    const dk = eye(S.LEGACY_BAKED.dark, "part_37");
    check("the eye's dark is the man's own shadow (shade x 0.30), matte, and takes a vertex colour so the pupil can be black and the rest his skin's",
      dk.vertexColors === true && dk.roughness === 0.85 && Math.abs(dk.color.r - new THREE.Color(toneOf.shade).r * 0.30) < 1e-6 && dk.name.startsWith("face-dark:"));
    const bright = CHARS.SKIN_TONES.map((t) => [t, S.scleraFor(t)]);
    const l = (hex) => { const c = new THREE.Color(hex); const y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : 24389 / 27 * y; };
    check("the white of the eye is held to 22 L* over the man's base skin on every tone, and left alone where it is already under (a lamp fails high)",
      bright.every(([t, w]) => l(w) <= l(t.base) + 22.5 && (l(t.sclera) <= l(t.base) + 22 ? w === t.sclera : true)),
      bright.map(([t, w]) => `${l(t.base).toFixed(0)}: ${l(t.sclera).toFixed(0)} -> ${l(w).toFixed(0)}`).join(", "));
  }
  check("...the sclera goes darker toward the corners and the iris carries a catchlight (a pixel near white)",
    texel(scl.map, 1, 8)[0] < texel(scl.map, 32, 8)[0] - 30
    && (() => { let best = 0; for (let j = 0; j < 32; j++) for (let i = 0; i < 128; i++) best = Math.max(best, texel(irs.map, i, j)[0]); return best > 225; })());
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
