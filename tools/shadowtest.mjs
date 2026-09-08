#!/usr/bin/env node
/**
 * SHADOWTEST — IS THE SOFT SHADOW THE SETTINGS PROMISE ACTUALLY ARRIVING?
 *
 *   node tools/shadowtest.mjs                 all five sections, ~20 s
 *   node tools/shadowtest.mjs --only=derivation
 *   node tools/shadowtest.mjs --gate          exit non-zero on a red verdict
 *   node tools/shadowtest.mjs --lever=default R1 for §2/§3/§5 — delete the
 *                                             radius assignment and watch them go red
 *   node tools/shadowtest.mjs --lever=table   R1 for §2/§3/§5 — tabulate the
 *                                             radii per tier instead of deriving
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 *
 * A Playwright probe of `/shot`, run for something else entirely, printed:
 *
 *     THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.
 *
 * `quality.ts` was asking for soft shadows on two of the three tiers and three
 * was throwing the request away. That alone is a one-line fix. What made it
 * worth a harness is the second half, which the warning did NOT say and which
 * nothing in the repository could have caught:
 *
 *   On three 0.185 the softness of a shadow is `light.shadow.radius`, in texels.
 *   `lighting.ts` — the rig the FIGHT is lit by — never set it. Three cascades,
 *   all of them on three's default of 1.
 *   `summary.ts` and `armouryStage.ts` DID set it, to 3.
 *
 * So the death portrait and the armoury had visibly softer shadows than the
 * death, and had done since the three upgrade, and every gate in the repository
 * was green over it. `docs/PROCESS.md` failure mode 3: a gate green because the
 * case is absent is not a gate. There was no case. There is now.
 *
 * ---------------------------------------------------------------------------
 * WHAT EACH SECTION IS FOR, AND WHY IT IS THAT SHAPE
 * ---------------------------------------------------------------------------
 *
 * §1 THE DEPRECATED TYPE reads the deprecation OUT OF THREE, from
 *    `WebGLShadowMap.js` itself, rather than hard-coding `PCFSoftShadowMap`.
 *    A gate that names the constant only knows about the deprecation that has
 *    already happened. This one knows about the next one too: when three
 *    retires `VSMShadowMap` or `BasicShadowMap`, this section starts objecting
 *    to it on the upgrade commit without being edited.
 *
 * §2 THE DERIVATION is the section with teeth, and it is exact rather than
 *    banded. It builds the real rig, on all three tiers, walks every
 *    shadow-casting directional light in it and recomputes what its penumbra
 *    OUGHT to be from the one quantity that can decide it — the world size of
 *    one texel of that light's own map, read back off its own orthographic
 *    frustum. `radius === shadowRadiusFor(texel)` or the section is red. That
 *    catches the shipped defect (radius left at 1), it catches a tabulated
 *    ladder, and it catches a cascade added later that forgets.
 *
 * §3 THE WORLD WIDTH is what §2 is FOR. §2 proves the arithmetic was done; §3
 *    proves the arithmetic means something a player can see, by asserting that
 *    every caster's penumbra comes out at the same width in METRES on every
 *    tier — except where the map is too coarse to hold it, where the clamp is
 *    allowed to bite and the section prints which caster and why rather than
 *    passing quietly.
 *
 * §4 THE OTHER TWO RIGS is a source check and admits it. summary.ts and
 *    armouryStage.ts light a spot, and a spot's texel depends on a subject
 *    distance a scene traversal cannot recover. So this asserts the weaker but
 *    still useful thing: that neither of them has gone back to a literal.
 *
 * §5 THE LADDER is the claim the owner would make if he were looking at the
 *    build: a phone should get a SOFTER shadow than a desktop, never a harder
 *    one. It is the claim the deleted `softShadows: false` on the low tier was
 *    the exact inverse of.
 *
 * ---------------------------------------------------------------------------
 * R1 — THE LEVERS
 * ---------------------------------------------------------------------------
 *
 * `--lever=default` deletes the radius assignment from tsc's own output, which
 * is the defect this file was written about, byte for byte. `--lever=table`
 * replaces the derivation with the per-tier table it replaced. If a section
 * does not go red under its lever, the section is not measuring what its name
 * says and it voids itself.
 *
 * MEASURED, on the build this file shipped with:
 *
 *   clean            15 passed / 0 failed
 *   --lever=default  12 passed / 3 failed   §2, §3, §5(default-radius)
 *   --lever=table    11 passed / 4 failed   §2, §3, §5(both)
 *
 * The two levers are not redundant. `default` is the defect that was actually
 * shipped and it CANNOT red §5's monotone claim, because radius 1 everywhere
 * still leaves the penumbra rising with the texel — the phone's shadow really
 * was softer in metres, it was just three times blockier. Only a tabulated
 * ladder inverts it, so only `table` reaches that check. A file with one lever
 * would have left §5's first claim unproven, which is the state `wartest`'s
 * neutrality gate is still in (`docs/OPEN-DEFECTS.md`).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "fs";
import { spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as THREE from "three";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7);
const LEVER = (process.argv.find((a) => a.startsWith("--lever=")) || "").slice(8);
const GATE = process.argv.includes("--gate");

let fails = 0, passes = 0;
const say = (s) => console.log(s);
const check = (name, ok, detail) => {
  if (ok) { passes++; say(`  PASS  ${name}`); }
  else { fails++; say(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`); }
};
const want = (section) => !ONLY || ONLY === section;

// ===========================================================================
// THE BUILD. lighting.ts imports `three` and two values from quality.ts and
// nothing else, so it compiles and RUNS in node with no GL and no browser —
// every light, every shadow camera and every bias below is the object the
// renderer would have been handed.
// ===========================================================================
let MODS = null;
function load() {
  if (MODS) return MODS;
  const BUILD = resolve(ROOT, ".shadow");
  rmSync(BUILD, { recursive: true, force: true });
  mkdirSync(BUILD, { recursive: true });
  const tsc = spawnSync("npx", ["tsc",
    "src/game/client/render/lighting.ts",
    "--outDir", ".shadow",
    "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
    { cwd: ROOT, encoding: "utf8" });
  const emitted = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const f = resolve(d, e.name);
    if (e.isDirectory()) walk(f); else if (e.name.endsWith(".js")) emitted.push(f);
  } };
  if (existsSync(BUILD)) walk(BUILD);
  // tsc emits extensionless relative specifiers; node's ESM loader will not
  // resolve them. One rewrite over the emitted tree, inside .shadow.
  for (const f of emitted) {
    const src = readFileSync(f, "utf8");
    const fixed = src.replace(/(from\s+")(\.[^"]*?)(")/g, (m, a, b, c) => (b.endsWith(".js") ? m : a + b + ".js" + c));
    if (fixed !== src) writeFileSync(f, fixed);
  }
  const lightFile = emitted.find((f) => f.endsWith("lighting.js"));
  const qualFile = emitted.find((f) => f.endsWith("quality.js"));
  if (!lightFile || !qualFile) {
    say(`  tsc emitted no lighting.js/quality.js:\n${tsc.stdout || ""}${tsc.stderr || ""}`);
    return null;
  }
  MODS = { lightFile, qualFile };
  return MODS;
}

/** Sabotage tsc's own output. Returns false if the expression is not there. */
function pullLever(file, rx, to) {
  const src = readFileSync(file, "utf8");
  if (!rx.test(src)) { say(`  LEVER MISSED: ${rx} not found in ${file}`); return false; }
  writeFileSync(file, src.replace(rx, to));
  return true;
}

const TIERS = ["high", "medium", "low"];

/**
 * Build the rig for one tier and hand back every shadow-casting light in it,
 * each with the world size of one of its own texels.
 *
 * The texel is read back off the LIGHT rather than recomputed from the
 * settings, on purpose: `frame()` could set a frustum that does not match the
 * half-extent it was handed and this would still be the truth about what the
 * renderer rasterises.
 */
async function casters(tier) {
  const mods = load();
  if (!mods) return null;
  const stamp = `${Date.now()}-${Math.random()}`;
  const { createLighting } = await import(`${mods.lightFile}?v=${stamp}`);
  const { QUALITY_PRESETS, shadowRadiusFor } = await import(`${mods.qualFile}?v=${stamp}`);
  const scene = new THREE.Scene();
  const handle = createLighting(scene, QUALITY_PRESETS[tier]);
  const out = [];
  handle.root.traverse((o) => {
    if (!o.isLight || !o.castShadow || !o.shadow) return;
    const cam = o.shadow.camera;
    out.push({
      name: o.isDirectionalLight ? "directional" : (o.isSpotLight ? "spot" : o.type),
      directional: !!o.isDirectionalLight,
      map: o.shadow.mapSize.x,
      texel: o.isDirectionalLight ? (cam.right - cam.left) / o.shadow.mapSize.x : null,
      radius: o.shadow.radius,
      half: o.isDirectionalLight ? cam.right : null,
    });
  });
  return { lights: out, shadowRadiusFor };
}

// ===========================================================================
// §1 THE DEPRECATED TYPE
// ===========================================================================
async function sectionDeprecated() {
  say("\n§1 THE DEPRECATED TYPE — read out of three, not hard-coded here");
  const shadowSrc = resolve(ROOT, "node_modules/three/src/renderers/webgl/WebGLShadowMap.js");
  if (!existsSync(shadowSrc)) { check("three's WebGLShadowMap.js is readable", false, shadowSrc); return; }
  const src = readFileSync(shadowSrc, "utf8");
  // `if ( this.type === X ) { warn( '...deprecated...' )` — the shape three uses
  // to retire a filter. Anything matching is a type this app must not ask for.
  const rx = /this\.type\s*===\s*(\w+ShadowMap)\s*\)\s*\{[\s\S]{0,200}?deprecated/g;
  const dead = new Set();
  let m;
  while ((m = rx.exec(src))) dead.add(m[1]);
  check("three names at least one retired shadow filter", dead.size > 0,
    "no `if (this.type === X) { ... deprecated` in WebGLShadowMap.js — the pattern moved, and this section is now blind");
  say(`        this three retires: ${[...dead].join(", ") || "(none found)"}`);

  const files = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const f = resolve(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.(ts|tsx)$/.test(e.name)) files.push(f);
  } };
  walk(resolve(ROOT, "src"));
  const offenders = [];
  for (const f of files) {
    const body = readFileSync(f, "utf8");
    // Code lines only. quality.ts's history comment quotes the old line on purpose.
    const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const line of code.split("\n")) {
      if (!/shadowMap\s*\.\s*type\s*=/.test(line)) continue;
      for (const d of dead) if (line.includes(d)) offenders.push(`${f.slice(ROOT.length + 1)}: ${line.trim()}`);
    }
  }
  check("nothing asks the renderer for a retired filter", offenders.length === 0,
    offenders.join("\n          "));
}

// ===========================================================================
// §2 THE DERIVATION
// ===========================================================================
async function sectionDerivation() {
  say("\n§2 THE DERIVATION — every caster's penumbra comes from its own texel");
  say("     tier    light          map    half m   texel cm   radius     want");
  let bad = 0, seen = 0, dirs = 0;
  for (const tier of TIERS) {
    const built = await casters(tier);
    if (!built) { check("the rig builds headless", false, tier); return; }
    for (const l of built.lights) {
      seen++;
      if (!l.directional) continue;
      dirs++;
      const wantR = built.shadowRadiusFor(l.texel);
      const ok = Math.abs(l.radius - wantR) < 1e-9;
      if (!ok) bad++;
      say(`     ${tier.padEnd(7)} ${l.name.padEnd(13)} ${String(l.map).padStart(5)}  ${l.half.toFixed(1).padStart(6)}   ${(l.texel * 100).toFixed(2).padStart(7)}   ${l.radius.toFixed(3).padStart(6)}   ${wantR.toFixed(3).padStart(6)}${ok ? "" : "   <- WRONG"}`);
    }
  }
  check("the rig has shadow casters at all", seen > 0 && dirs >= 4,
    `${seen} casters, ${dirs} directional across three tiers — the rig has lost a cascade`);
  check("every directional caster's radius is shadowRadiusFor(its own texel)", bad === 0,
    `${bad} of ${dirs} are not`);
}

// ===========================================================================
// §3 THE WORLD WIDTH
// ===========================================================================
async function sectionWidth() {
  say("\n§3 THE WORLD WIDTH — the same softness in metres, on every tier");
  const mods = load();
  if (!mods) { check("quality.js is loadable", false); return; }
  const { shadowRadiusFor } = await import(`${mods.qualFile}?v=${Date.now()}-${Math.random()}`);
  // The target and the two bounds live in quality.ts. Recovering them from the
  // function rather than repeating them here is what keeps this section from
  // becoming a second, drifting copy of the design. A texel small enough that
  // neither clamp bites gives radius = target/texel, so radius*texel = target.
  const probe = 0.02;
  const TARGET = shadowRadiusFor(probe) * probe;
  const FLOOR = shadowRadiusFor(1e9);
  const CEIL = shadowRadiusFor(1e-9);
  say(`        target ${(TARGET * 100).toFixed(1)} cm, radius clamped to [${FLOOR}, ${CEIL}]`);

  const widths = [];
  for (const tier of TIERS) {
    const built = await casters(tier);
    if (!built) { check("the rig builds headless", false, tier); return; }
    for (const l of built.lights) {
      if (!l.directional) continue;
      // THE EXCUSE IS COMPUTED FROM THE TEXEL, NOT FROM THE OBSERVED RADIUS,
      // and round one of this file got that wrong in the way that matters.
      // It read `atClamp = radius === FLOOR || radius === CEIL`, which is true
      // of EVERY caster in the shipped defect — the defect was radius 1
      // everywhere — so the section excused the whole thing and went green
      // under its own lever. `docs/PROCESS.md` failure mode 3, written by the
      // gate that was supposed to be catching it. A caster is excused only when
      // the DERIVATION lands outside the bounds, which is a fact about its map
      // and nothing to do with what was actually set.
      const asked = TARGET / l.texel;
      const excused = asked < FLOOR || asked > CEIL;
      widths.push({ tier, name: l.name, w: l.radius * l.texel, atClamp: excused, texel: l.texel, half: l.half });
    }
  }
  const off = widths.filter((x) => !x.atClamp && Math.abs(x.w - TARGET) > 1e-6);
  check("a caster whose map can hold the target is exactly the target width", off.length === 0,
    off.map((x) => `${x.tier} half ${x.half.toFixed(1)} m: ${(x.w * 100).toFixed(2)} cm, wanted ${(TARGET * 100).toFixed(1)}`).join("; "));
  check("at least one caster per tier is inside the bounds and being checked",
    TIERS.every((t) => widths.some((x) => x.tier === t && !x.atClamp)),
    TIERS.map((t) => `${t}: ${widths.filter((x) => x.tier === t && !x.atClamp).length} checked`).join(", "));
  for (const x of widths.filter((y) => y.atClamp)) {
    say(`        excused: ${x.tier} half ${x.half.toFixed(1)} m — ${(x.texel * 100).toFixed(1)} cm texels cannot hold ${(TARGET * 100).toFixed(1)} cm`);
  }
  // A rail, not a ruler. If a future cascade blurs a shadow by a fifth of a
  // metre that is not a tuning question, it is a mistake.
  const wild = widths.filter((x) => x.w < 0.02 || x.w > 0.20);
  check("no caster blurs by less than 2 cm or more than 20 cm", wild.length === 0,
    wild.map((x) => `${x.tier} half ${x.half}: ${(x.w * 100).toFixed(1)} cm`).join(", "));
}

// ===========================================================================
// §4 THE OTHER TWO RIGS
// ===========================================================================
async function sectionStages() {
  say("\n§4 THE SPOTS — the hearth beam, and the two portrait rigs");
  // The hearth beam IS reachable headlessly, so it gets the real check rather
  // than a source one: it is a spot, so §2's ortho arithmetic cannot reach it,
  // but whether it was set at all is exactly as checkable as a cascade's. It
  // exists only on the high tier (`beamShare`), which is why this asks high.
  const mods = load();
  if (mods) {
    const { shadowRadiusFor } = await import(`${mods.qualFile}?v=${Date.now()}-${Math.random()}`);
    const built = await casters("high");
    const spots = built ? built.lights.filter((l) => !l.directional) : [];
    check("the high tier's rig still has its hearth beam", spots.length === 1,
      `${spots.length} spot casters — the fire's shadow has appeared or vanished`);
    const CEIL = shadowRadiusFor(1e-9);
    check("the hearth beam takes the widest penumbra the filter holds",
      spots.length === 1 && Math.abs(spots[0].radius - CEIL) < 1e-9,
      spots.length === 1 ? `radius ${spots[0].radius}, wanted ${CEIL}` : "");
  }
  for (const rel of ["src/game/client/render/summary.ts", "src/game/client/armouryStage.ts"]) {
    const name = rel.split("/").pop();
    const body = readFileSync(resolve(ROOT, rel), "utf8");
    const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const sites = code.split("\n").filter((l) => /shadow\s*\.\s*radius\s*=/.test(l));
    check(`${name} sets a shadow radius at all`, sites.length > 0);
    const literal = sites.filter((l) => !l.includes("shadowRadiusFor"));
    check(`${name} derives it rather than tabulating it`, literal.length === 0,
      literal.map((l) => l.trim()).join("\n          "));
  }
}

// ===========================================================================
// §5 THE LADDER
// ===========================================================================
async function sectionLadder() {
  say("\n§5 THE LADDER — a coarser map must get a SOFTER edge, never a harder one");
  const rows = [];
  for (const tier of TIERS) {
    const built = await casters(tier);
    if (!built) { check("the rig builds headless", false, tier); return; }
    // The near cascade is the directional with the SMALLEST frustum — the one
    // under the fight. Identified by geometry, not by name, so a rename cannot
    // quietly point this section at the settlement.
    const dirs = built.lights.filter((l) => l.directional);
    if (!dirs.length) { check(`${tier} has a fight cascade`, false); return; }
    const near = dirs.reduce((a, b) => (a === null || b.half < a.half ? b : a), null);
    rows.push({ tier, texel: near.texel, radius: near.radius, width: near.radius * near.texel });
  }
  for (const r of rows) {
    say(`     ${r.tier.padEnd(7)} texel ${(r.texel * 100).toFixed(2).padStart(5)} cm   radius ${r.radius.toFixed(2).padStart(5)}   penumbra ${(r.width * 100).toFixed(2).padStart(5)} cm`);
  }
  // The claim: as the map coarsens the penumbra must not shrink. The old build
  // failed this exactly — the low tier had 4.3 cm texels AND radius 1, so its
  // shadow was three times harder in texels than high's while being three times
  // blockier in metres.
  let monotone = true;
  for (let i = 1; i < rows.length; i++) if (rows[i].width < rows[i - 1].width - 1e-9) monotone = false;
  check("penumbra never shrinks as the map coarsens", monotone,
    rows.map((r) => `${r.tier} ${(r.width * 100).toFixed(2)} cm`).join(" -> "));
  // And the same claim in texels, which is what actually decides whether an
  // edge stairsteps: no tier may be left on three's bare default.
  const onDefault = rows.filter((r) => r.radius <= 1 + 1e-9);
  check("no tier's fight cascade is left on three's default radius", onDefault.length === 0,
    onDefault.map((r) => `${r.tier} radius ${r.radius}`).join(", "));
}

// ===========================================================================
(async () => {
  const ver = JSON.parse(readFileSync(resolve(ROOT, "node_modules/three/package.json"), "utf8")).version;
  say(`SHADOWTEST — three ${ver}`);

  if (LEVER) {
    if (!load()) { say("  cannot pull a lever: the build failed"); process.exit(1); }
    const rx = /light\.shadow\.radius = shadowRadiusFor\(texel\);/;
    if (LEVER === "default") {
      say("\nR1 LEVER `default`: deleting the radius assignment — the shipped defect, byte for byte.");
      if (!pullLever(MODS.lightFile, rx, "/* lever: default */")) process.exit(1);
    } else if (LEVER === "table") {
      say("\nR1 LEVER `table`: replacing the derivation with a per-tier table.");
      if (!pullLever(MODS.lightFile, rx, "light.shadow.radius = settings.shadowMapSize >= 2048 ? 3 : 1;")) process.exit(1);
    } else {
      say(`  unknown lever \`${LEVER}\`; try default or table`);
      process.exit(1);
    }
    say("  Sections below run against the SABOTAGED build. They must go RED.");
  }

  if (want("deprecated")) await sectionDeprecated();
  if (want("derivation")) await sectionDerivation();
  if (want("width")) await sectionWidth();
  if (want("stages")) await sectionStages();
  if (want("ladder")) await sectionLadder();

  say(`\n${passes} passed / ${fails} failed`);
  if (GATE && fails > 0) process.exit(1);
})();
