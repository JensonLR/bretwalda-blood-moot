#!/usr/bin/env node
// ============================================================
// SHADERCHECK — the one class of defect in this project that only the owner
// could find, made findable here.
//
//   node tools/shadercheck.mjs
//
// A SHADER CANNOT BE COMPILED FROM THIS SEAT. unitycheck compiles C# against
// Unity's assemblies; it sees nothing of HLSL. So a shader written here shipped
// unproven, and one did: the ShadowCaster pass declared `_LightDirection` and
// then used `_LightPosition`, which URP's own ShadowCasterPass.hlsl declares
// alongside it. Metal refused the punctual-light variant, the ground fell back
// to the error shader, and the owner photographed a cyan screen.
//
// This will not compile HLSL either. What it does is the ONE check that would
// have caught that: every `_Name` a pass uses must be declared somewhere the
// compiler can see it — in the shader itself, or in a header the shader
// includes, which here means URP's and core RP's ShaderLibrary. Anything else
// is an undeclared identifier, which is exactly what the compiler said.
//
// It also fails deprecated URP keywords, because a warning on every compile is
// how a real error gets missed.
//
// INNER-LOOP TOOL: no Unity, no build. It reads text.
// ============================================================
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UNITY = resolve(ROOT, "BRETWALDA - Blood Moot");
const SHADERS = resolve(UNITY, "Assets/Bretwalda/Shaders");
const CACHE = resolve(UNITY, "Library/PackageCache");

// Keywords URP has retired. The message names the replacement so the fix is
// not a search.
const DEPRECATED = [
  ["_FORWARD_PLUS", "_CLUSTER_LIGHT_LOOP"],
];

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("\n[shadercheck] every name a pass uses, declared somewhere it can see\n");

if (!existsSync(SHADERS)) {
  check("the shaders are where this expects them", false, SHADERS);
  console.log("\n[shadercheck] 0 passed, 1 failed"); process.exit(1);
}
const libs = existsSync(CACHE)
  ? readdirSync(CACHE).filter((d) => /render-pipelines/.test(d)).map((d) => join(CACHE, d))
  : [];
check("URP's shader library is on disk to check against", libs.length > 0,
  libs.length ? `${libs.length} render-pipeline package(s)` : "no Library/PackageCache — open the project in Unity once");

// Names the shader itself declares: a bare `floatN _X;`, a CBUFFER entry, a
// TEXTURE2D/SAMPLER macro, or a Properties block entry.
const declaredIn = (src) => {
  const out = new Set();
  for (const m of src.matchAll(/\b(?:float|half|int|uint|bool|real)[1-4]?(?:x[1-4])?\s+(_\w+)\s*[;,]/g)) out.add(m[1]);
  for (const m of src.matchAll(/\b(?:TEXTURE2D|TEXTURE2D_ARRAY|TEXTURECUBE|SAMPLER|SAMPLER_CMP|TEXTURE3D)\s*\(\s*(_\w+)\s*\)/g)) out.add(m[1]);
  for (const m of src.matchAll(/^\s*(_\w+)\s*\(\s*"/gm)) out.add(m[1]);   // Properties
  for (const m of src.matchAll(/#define\s+(_\w+)/g)) out.add(m[1]);
  return out;
};

// WHAT THE PASS ACTUALLY SEES. The first cut of this grepped the whole shader
// library and passed a shader with the very bug it was written for: URP does
// declare _LightPosition — in ShadowCasterPass.hlsl, which this shader does NOT
// include. A compiler resolves the include graph, so this resolves the include
// graph: the headers each pass names, and the headers those name, and no more.
const pkgDir = (spec) => {
  const m = spec.match(/^Packages\/([^/]+)\/(.*)$/);
  if (!m) return null;
  const dir = libs.find((l) => l.split("/").pop().startsWith(m[1] + "@"))
    ?? (existsSync(join(CACHE, m[1])) ? join(CACHE, m[1]) : null);
  return dir ? join(dir, m[2]) : null;
};
const headerCache = new Map();
const readHeader = (file) => {
  if (headerCache.has(file)) return headerCache.get(file);
  let text = "";
  try { if (statSync(file).isFile()) text = readFileSync(file, "utf8"); } catch { /* missing */ }
  headerCache.set(file, text);
  return text;
};
// Every header reachable from a starting set, following #include both ways it
// is written: by package path, and relative to the including file.
const reachable = (specs, from) => {
  const seen = new Set(), out = [];
  const queue = specs.map((sp) => ({ spec: sp, base: from }));
  while (queue.length) {
    const { spec, base } = queue.shift();
    const file = spec.startsWith("Packages/") ? pkgDir(spec) : resolve(base, spec);
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const text = readHeader(file);
    if (!text) continue;
    out.push(text);
    for (const m of text.matchAll(/#include\s+"([^"]+)"/g)) queue.push({ spec: m[1], base: dirname(file) });
  }
  return out;
};

const files = readdirSync(SHADERS).filter((f) => f.endsWith(".shader"));
check("there are shaders to check", files.length > 0, `${files.length} found`);

// COMMENTS ARE NOT CODE. The first run of this failed its own file because the
// note explaining the retired keyword contained the retired keyword — the same
// trap a rename hit once before. Everything below reads the shader with its
// comments taken out.
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

for (const f of files) {
  const src = strip(readFileSync(resolve(SHADERS, f), "utf8"));

  for (const [dead, live] of DEPRECATED) {
    check(`${f} uses no retired URP keyword`, !new RegExp(`\\b${dead}\\b`).test(src),
      new RegExp(`\\b${dead}\\b`).test(src) ? `${dead} is deprecated — use ${live}` : "none");
  }

  const declared = declaredIn(src);
  // Only the HLSL blocks: the Properties block's own names are declarations.
  const hlsl = [...src.matchAll(/HLSLPROGRAM([\s\S]*?)ENDHLSL/g)].map((m) => m[1]).join("\n");
  const used = new Set();
  for (const m of hlsl.matchAll(/\b(_[A-Za-z]\w*)\b/g)) used.add(m[1]);

  // What the passes include, transitively — and the declarations in it.
  const includes = [...hlsl.matchAll(/#include\s+"([^"]+)"/g)].map((m) => m[1]);
  const headers = reachable(includes, SHADERS);
  const fromHeaders = new Set();
  for (const h of headers) for (const n of declaredIn(h)) fromHeaders.add(n);
  // Headers also hand names out through macros and CBUFFER bodies, so a plain
  // presence test over the RESOLVED set stands in for the rest.
  const headerText = headers.join("\n");

  const unknown = [];
  for (const name of used) {
    if (declared.has(name)) continue;
    // Keyword-ish names come from #pragma multi_compile and are not identifiers.
    if (new RegExp(`multi_compile[^\\n]*\\b${name}\\b|shader_feature[^\\n]*\\b${name}\\b|defined\\s*\\(\\s*${name}\\s*\\)|#if[^\\n]*\\b${name}\\b`).test(hlsl)) continue;
    if (fromHeaders.has(name)) continue;
    if (new RegExp(`\\b${name}\\b`).test(headerText)) continue;
    unknown.push(name);
  }
  check(`${f} declares every name its passes use`, unknown.length === 0,
    unknown.length ? `undeclared: ${unknown.join(", ")} — the compiler calls this "undeclared identifier"` : `${used.size} names, all resolved`);
}

console.log(`\n[shadercheck] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
