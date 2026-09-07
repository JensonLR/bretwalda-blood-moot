#!/usr/bin/env node
// ============================================================
// SHADERCHECK — the one class of defect in this project that only the owner
// could find, made findable here.
//
//   node tools/shadercheck.mjs
//
// THE ORIGINAL FINDING, kept because it is the reason this file exists. Unity's
// ShadowCaster pass declared `_LightDirection` and then used `_LightPosition`.
// Metal refused the punctual-light variant, the ground fell back to the error
// shader, and the owner photographed a cyan screen. Nothing in the repository
// could have caught it: a shader is not compiled by a typechecker.
//
// REPOINTED 7 Sep 2026 at the three.js client (docs/ONE-CLIENT.md §4.3). The
// defect class is not a Unity defect class — it is what happens whenever a
// shading language's identifiers are checked by a compiler nobody runs at build
// time. WebGL has exactly the same hole, in a shape that is arguably worse:
//
//   a `uniform` DECLARED in the GLSL and MISSING from the material's
//   `uniforms` object is `undefined` at draw time.
//
// three.js does not throw for that. It hands the driver a uniform that was
// never set, and what you get is a black surface, a NaN that eats the whole
// mesh, or — the worst one — correct output on the machine you developed on and
// garbage on somebody's phone. That is the cyan screen again, wearing WebGL.
//
// So the check is the same sentence it always was, in the new language: every
// name a shader uses must be declared somewhere the compiler can see it, and
// every name it declares must actually be supplied.
//
// IT ALSO REFUSES TO PASS VACUOUSLY. `docs/PROCESS.md` records thirteen
// measurements that answered the wrong question, and the signature shape is a
// gate green because the case is absent — so this asserts a FLOOR on how many
// materials it found. A refactor that moves the shaders somewhere this cannot
// read turns the gate red instead of quietly green.
//
// INNER-LOOP TOOL: no build, no GPU. It reads text.
// ============================================================
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RENDER = resolve(ROOT, "src/game/client/render");
const FILES = ["materials.ts", "world.ts", "postfx.ts", "sky.ts", "vfx.ts", "hud3d.ts"];

// The floor. Below this the tool is not measuring the renderer any more.
const MIN_SHADERS = 12;

/**
 * Names GLSL gets for free. three.js injects these into every program it
 * builds, so a shader may use them without declaring them and a material need
 * not supply them. Sourced from three.js's WebGLProgram prefixes.
 */
const BUILTIN = new Set([
  "modelMatrix", "modelViewMatrix", "projectionMatrix", "viewMatrix",
  "normalMatrix", "cameraPosition", "isOrthographic",
  "position", "normal", "uv", "uv1", "uv2", "tangent", "color",
  "instanceMatrix", "instanceColor", "morphTargetInfluences",
  "logDepthBufFC", "gl_Position", "gl_FragColor", "gl_PointSize", "gl_FragCoord",
  "gl_PointCoord", "gl_FrontFacing", "gl_VertexID", "gl_InstanceID",
]);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("\n[shadercheck] every name a shader uses, declared and supplied\n");

/** Every backtick template literal in a source file, with its start offset. */
function templates(src) {
  const out = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== "`") continue;
    let j = i + 1, depth = 0;
    for (; j < src.length; j++) {
      if (src[j] === "\\") { j++; continue; }
      if (src[j] === "$" && src[j + 1] === "{") { depth++; j++; continue; }
      if (src[j] === "}" && depth > 0) { depth--; continue; }
      if (src[j] === "`" && depth === 0) break;
    }
    out.push({ start: i, end: j, body: src.slice(i + 1, j) });
    i = j;
  }
  return out;
}

/** Declarations of a given storage class in one GLSL string. */
function declared(glsl, kind) {
  const out = new Map();
  const re = new RegExp(`^\\s*(?:highp |mediump |lowp )?${kind}\\s+(\\w+)\\s+(\\w+)\\s*(\\[[^\\]]*\\])?\\s*;`, "gm");
  for (const m of glsl.matchAll(re)) out.set(m[2], `${m[1]}${m[3] ?? ""}`);
  return out;
}

const glslConsts = new Map();   // file -> [{ name, body, isFrag }]
let strings = 0;

for (const name of FILES) {
  const path = resolve(RENDER, name);
  if (!existsSync(path)) { check(`${name} is where this expects it`, false, path); continue; }
  const src = readFileSync(path, "utf8");
  const found = [];
  for (const t of templates(src)) {
    const isGlsl = /^\s*(?:precision|uniform|varying|attribute|#define|#include)\b/m.test(t.body)
      || /\bvoid\s+main\s*\(\s*\)/.test(t.body);
    if (!isGlsl) continue;
    // A CHUNK IS NOT A SHADER. `onBeforeCompile` splices fragments into
    // three.js's own shaders with .replace("#include <chunk>", `...`), and such
    // a fragment legitimately uses varyings declared by the string that
    // prepends it. Counting one as a standalone shader produced two confident
    // false positives on world.ts's puddle and water passes — vWaterPos is
    // declared one line above the chunk that uses it.
    if (/^\s*#include\s*</.test(t.body)) continue;
    // Name it by the const it is assigned to, for a legible failure message.
    const before = src.slice(Math.max(0, t.start - 160), t.start);
    // The `/* glsl */` marker sits between the `=` and the backtick in this
    // codebase (it is what makes an editor syntax-highlight the string), so the
    // name match has to step over a comment or every shader is "anonymous" and
    // a failure message names nothing.
    const beforeNoComment = before.replace(/\/\*[\s\S]*?\*\/\s*$/, "");
    const cm = [...beforeNoComment.matchAll(/(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*$/g)].pop()
      ?? [...beforeNoComment.matchAll(/(\w+)\s*[:=]\s*$/g)].pop();
    const label = cm ? cm[1] : `anonymous@${t.start}`;
    // A fragment shader is one that writes a fragment output.
    const isFrag = /\bgl_FragColor\b|\bout\s+vec4\b|\bpc_fragColor\b/.test(t.body);
    found.push({ name: label, body: t.body, isFrag });
    strings++;
  }
  glslConsts.set(name, found);
}

check("the renderer's GLSL was actually found and read",
  strings >= MIN_SHADERS, `${strings} GLSL strings across ${FILES.length} files, floor is ${MIN_SHADERS}`);

// ---- 1. A FRAGMENT MAY NOT READ A VARYING NO VERTEX WRITES --------------
//
// This is the cyan screen in WebGL clothing. A fragment shader declaring a
// varying that no vertex shader in the same file declares links to nothing:
// the program fails, three.js falls back, and what the player sees is a black
// or missing surface on whichever driver is strictest — often not the one the
// shader was written on.
const varyingFaults = [];
for (const [file, shaders] of glslConsts) {
  const vertVaryings = new Map();
  for (const sh of shaders) if (!sh.isFrag) for (const [k, ty] of declared(sh.body, "varying")) vertVaryings.set(k, ty);
  for (const sh of shaders) {
    if (!sh.isFrag) continue;
    for (const [k, ty] of declared(sh.body, "varying")) {
      if (!vertVaryings.has(k)) varyingFaults.push(`${file}:${sh.name} reads varying ${k}, no vertex shader here declares it`);
      else if (vertVaryings.get(k) !== ty) varyingFaults.push(`${file}:${sh.name} reads ${k} as ${ty}, the vertex writes ${vertVaryings.get(k)}`);
    }
  }
}
check("no fragment shader reads a varying its vertex shader never writes",
  varyingFaults.length === 0,
  varyingFaults.length ? varyingFaults.slice(0, 6).join(" | ") : `${strings} strings, every varying paired by name and type`);

// ---- 2. EVERY NAME A SHADER USES, IT DECLARES ---------------------------
//
// The original check, in the new language, and narrowed to the case it can
// answer without a compiler: a name USED here and declared as a uniform or
// varying in a DIFFERENT shader in the same file, but not in this one. That is
// exactly the _LightDirection/_LightPosition shape — a rename that landed in
// one pass and not its neighbour — and it is the one a reader is least likely
// to spot, because the name is right there in the file.
const leaks = [];
for (const [file, shaders] of glslConsts) {
  for (const sh of shaders) {
    const mine = new Set([...declared(sh.body, "uniform").keys(), ...declared(sh.body, "varying").keys(),
                          ...declared(sh.body, "attribute").keys()]);
    const elsewhere = new Set();
    for (const other of shaders) {
      if (other === sh) continue;
      for (const k of declared(other.body, "uniform").keys()) elsewhere.add(k);
      for (const k of declared(other.body, "varying").keys()) elsewhere.add(k);
    }
    for (const k of elsewhere) {
      if (mine.has(k) || BUILTIN.has(k)) continue;
      // Used as a whole word, and not merely inside a comment.
      const stripped = sh.body.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
      if (new RegExp(`\\b${k}\\b`).test(stripped)) {
        leaks.push(`${file}:${sh.name} uses ${k} but declares it nowhere; a sibling shader declares it`);
      }
    }
  }
}
check("no shader uses a name only its neighbour declared",
  leaks.length === 0, leaks.length ? leaks.slice(0, 6).join(" | ") : "no half-landed renames");

// ---- WHAT THIS DELIBERATELY DOES NOT CHECK, AND WHY ---------------------
//
// Per-material "every declared uniform is supplied by its uniforms object".
// That is the check this file would most like to make and it is NOT
// statically resolvable in this renderer's idiom: GLSL lives in module-level
// constants (FS_VERT, GRADE_FRAG) referenced by name, and the uniforms object
// is frequently a PARAMETER built at a call site in another function. A regex
// that guessed at the pairing would produce confident wrong answers, which is
// worse than an absent check because it would be believed.
//
// It wants a real TypeScript pass. Filed rather than faked.
console.log("  NOTE  per-material 'declared uniform is supplied' needs a TS pass; not attempted here");

console.log(`\n[shadercheck] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
