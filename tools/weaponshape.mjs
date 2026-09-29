#!/usr/bin/env node
// ============================================================
// WEAPONSHAPE — is each held weapon the OBJECT the lore says it is?
//
//   node tools/weaponshape.mjs              every weapon, every finish, gated
//   node tools/weaponshape.mjs --shield     also GATE the shield (W-B's parts)
//   node tools/weaponshape.mjs --mutant=[weapon:]NAME  build a deliberately wrong weapon
//                                           and require the ruler to catch it. Nine of them:
//                                           sword: hoop-and-balls, wide-guard-pommel
//                                           spear: fat-leaf, wingless, oak-broomstick
//                                           seax:  emissive-runes, no-runes
//                                           axe:   same-iron-bit, long-edge
//   node tools/weaponshape.mjs --only=sword|seax|axe|spear|shield
//
// WHY THIS EXISTS. `docs/PROCESS.md` failure mode 1: a harness that measures
// the wrong quantity is green about a defect it cannot see. Before this file
// the ONLY things that read a weapon were `bladereach` (the tip's height, so
// the reach ratchet), `wearmeasure` 6b (which way the axe bit leads) and 9
// (carry clearance). Not one number in the repository knew that the sword's
// guard was 212 mm across (a knight's cross, twice the find, LORE 5.1), that its
// "fuller" stood 0.1 mm off the steel, that the "seax" was a symmetric leaf with a
// cyan stripe, or that the spear head was a 76 mm needle. CHARMAP-B 4.1 says it
// in one line: "not one weapon-shape number has a ruler".
//
// WHAT IT MEASURES, AND WHY EACH BAR IS A PROPERTY AND NOT A LITERAL. The
// question every check answers is "what could pass this WITHOUT being right?",
// because the person writing the check is the person fixing the defect and the
// check encodes their hypothesis (PROCESS R3). So nothing here reads a station
// table, a `hw`, or a builder's own parameter. Every reading is taken off the
// TRIANGLES THE BUILDER EMITTED, by slicing them with a plane:
//
//   guard width    the widest slice of the whole hilt (below the blade's root),
//                  not "the lower guard's hw" - so a wide thing anywhere in the
//                  hilt is caught, and a narrow guard with a wide pommel too.
//   pommel         every island of triangles below the grip: how many there are
//                  (a shell and three balls is FOUR islands, not one pommel) and
//                  what the BUTT-END silhouette does across the width (three
//                  minima = three lobes). Lobes are read at the butt because
//                  that is where a tri-lobed pommel has them; balls stacked on a
//                  smooth cap pass a lobe count and fail the island count, and
//                  the two are gated together for that reason.
//   blade section  the cross-section polygon at mid-blade: its area against its
//                  bounding rectangle (a rhombus is 0.50, a lens about 0.67,
//                  a flat-ground bar higher) AND the share of the face that is
//                  flat within 8 degrees (a rhombus has none: one facet lit,
//                  one facet black, the defect the owner could see).
//   fuller         a ray cast down onto the blade at mid-length, reading the
//                  ALBEDO of the surface it lands on: the run of dark material
//                  in the middle. Width, position, run length and whether its
//                  ends taper. A fuller that is a geometry groove but not a dark
//                  inlay passes nothing here, and a dark stripe painted wide
//                  fails the width.
//   the edge       the outermost 3 mm of the blade must be BRIGHTER than the
//                  flat (the bevel land the plan asks for), and the pattern-weld
//                  substance must appear only inside the fuller run.
//   the point      how wide the blade still is 20 mm and 5 mm short of the tip
//                  (a needle is narrow at both).
//   seax           single edge = the spine's thickness against the edge's, at
//                  one slice; broken back = the spine's silhouette line has ONE
//                  corner of at least 10 degrees, at 55-72% of the blade from
//                  the heel, straight before it, with the edge line straight
//                  and the tip on it. A symmetric leaf has no thick side and no
//                  corner; a curved-back "clip point" has a turning angle
//                  spread over the length and no corner.
//   axe            the head's edge span ALONG THE HAFT (the extent over which the
//                  head stands proud of the eye), the crescent's beard hook, the
//                  two materials (bright bit strip, dark cheeks) and whether the
//                  hand axe is the Dane axe scaled (it must not be).
//   spear          the widest slice of the head, whether that slice is the
//                  WINGS (below the leaf's belly) rather than a fat leaf, the
//                  collar ring and rivets as separate islands, the shaft width.
//   reach locks    the tip heights `anim.ts` reads into `rig.reach`. They are
//                  gameplay (the blade trail, the strike floor) and no look
//                  change may move them.
//
// EVERY SWORD CHECK RUNS ON ALL SIX FINISHES. A hilt that is right for the
// issued sword and reverts to a hoop-and-ball for the 160-gold Gold-Wired one is
// exactly the "parts, not recolours" defect CH-41 records.
//
// THE SHIELD (rim tube, clips, dish, slab boxes) is measured and PRINTED here,
// and gated only under `--shield`, because the board is a different engineer's
// file. R4: the verdict line says how many readings it declined to gate and
// why, in the words a person will read.
//
// WHAT IT CANNOT SEE. It reads geometry and the albedo the material NAMES. It
// cannot see a lit pixel: `tools/bladevalue.mjs` reads the frame. It cannot say
// whether a pommel is BEAUTIFUL, only that it is one integral three-lobed
// shell of the right size. It does not look at scabbards or the belt seax.
// ============================================================
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as THREE from "three";
import { emitClient } from "./lib/clientmodule.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flagVal = (name, dflt = null) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const has = (name) => argv.includes(`--${name}`);
const ONLY = flagVal("only") ?? (() => { const m = flagVal("mutant"); if (!m) return null; const w = m.includes(":") ? m.slice(0, m.indexOf(":")) : "sword"; return w === "dane" || w === "hand" ? "axe" : w; })();
const MUTANT = flagVal("mutant");
// `--mutant=weapon:name`; a bare name is a sword mutant, as it always was. A mutant run reads ONE weapon.
const [MUT_WEAPON, MUT_NAME] = MUTANT ? (MUTANT.includes(":") ? [MUTANT.slice(0, MUTANT.indexOf(":")), MUTANT.slice(MUTANT.indexOf(":") + 1)] : ["sword", MUTANT]) : [null, null];
const GATE_SHIELD = has("shield");
const VERBOSE = has("v");

let pass = 0, fail = 0;
const failures = [];
const ungated = [];
let currentSection = "";
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (ok) pass++; else { fail++; failures.push(`${currentSection}: ${name}`); }
};
/** A reading that is printed and deliberately not gated (R4: it rides the verdict line). */
const report = (name, detail, why) => {
  console.log(`  NOTE  ${name} - ${detail}   [not gated: ${why}]`);
  ungated.push(name);
};
const section = (title) => { currentSection = title; console.log(`\n${title}`); };
const mm = (m) => `${(m * 1000).toFixed(1)} mm`;

// ---- the real characters.ts, transpiled ------------------------------------
const { byName } = await emitClient(ROOT, ["src/game/client/characters.ts"], ".weaponshape");
const CH = await byName("characters.js");
if (!CH) { console.error("[weaponshape] tsc emitted no characters.js"); process.exit(2); }
const RAW = CH.RAW;
const STYLE_IDS = Object.keys(CH.WEAPON_STYLES);

// ============================================================
// GEOMETRY: everything below reads the emitted triangles
// ============================================================

/** sRGB hex -> CIELAB (D65). */
function lab(hex) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const r = lin((hex >> 16) & 255), g = lin((hex >> 8) & 255), b = lin(hex & 255);
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  const L = 116 * fy - 16, A = 500 * (fx - fy), B = 200 * (fy - fz);
  return { L, a: A, b: B, C: Math.hypot(A, B) };
}
const matInfo = (mat) => {
  const name = mat?.name ?? "";
  const i = name.indexOf(":");
  const surface = i > 0 ? name.slice(0, i) : name;
  const m = /:([0-9a-f]{6})/.exec(name);
  const hex = m ? parseInt(m[1], 16) : null;
  const l = hex === null ? { L: NaN, a: NaN, b: NaN, C: NaN } : lab(hex);
  const emissive = !!mat && mat.emissive && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0 && (mat.emissiveIntensity ?? 0) > 0;
  return { name, surface, hex, ...l, emissive, roughness: mat?.roughness, metalness: mat?.metalness };
};
const STEELS = new Set(["steel", "weldsteel", "serpentsteel"]);
const isPattern = (mi) => mi.surface === "weldsteel" || mi.surface === "serpentsteel";
/** A brass or gilt wire: a steel-surface material whose colour is a chromatic yellow. */
const isBrass = (mi) => mi.C >= 22 && mi.b > 10;
/** Grey blade metal: any steel-surface material that is not a coloured fitting. */
const isBladeMetal = (mi) => STEELS.has(mi.surface) && !isBrass(mi);

/** Every triangle of every mesh, in the mesh's OWN frame (the frame the blade is drawn in). */
function collect(group) {
  const tris = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const pos = g.attributes.position;
    const idx = g.index;
    const n = idx ? idx.count : pos.count;
    const mi = matInfo(o.material);
    for (let t = 0; t < n; t += 3) {
      const ia = idx ? idx.getX(t) : t, ib = idx ? idx.getX(t + 1) : t + 1, ic = idx ? idx.getX(t + 2) : t + 2;
      const a = [pos.getX(ia), pos.getY(ia), pos.getZ(ia)];
      const b = [pos.getX(ib), pos.getY(ib), pos.getZ(ib)];
      const c = [pos.getX(ic), pos.getY(ic), pos.getZ(ic)];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-14) continue;
      tris.push({ a, b, c, n: [nx / len, ny / len, nz / len], area: len / 2, mi, mesh: o });
    }
  });
  return tris;
}

/**
 * Slice by the plane `axis = v` (0 x, 1 y, 2 z). Returns the segments in the
 * other two axes (in order), each carrying its triangle so a caller can ask which
 * surface owns it and which way it faces.
 */
function slice(tris, axis, v, pick = null) {
  const [p, q] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  const out = [];
  for (const t of tris) {
    if (pick && !pick(t)) continue;
    const d = [t.a[axis] - v, t.b[axis] - v, t.c[axis] - v];
    const up = [d[0] >= 0, d[1] >= 0, d[2] >= 0];
    if (up[0] === up[1] && up[1] === up[2]) continue;
    const V = [t.a, t.b, t.c];
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if (up[i] !== up[j]) {
        const s = d[i] / (d[i] - d[j]);
        pts.push([V[i][p] + (V[j][p] - V[i][p]) * s, V[i][q] + (V[j][q] - V[i][q]) * s]);
      }
    }
    if (pts.length === 2) out.push({ p1: pts[0], p2: pts[1], t });
  }
  return out;
}
const spanOf = (segs, k) => {
  let lo = Infinity, hi = -Infinity;
  for (const s of segs) for (const P of [s.p1, s.p2]) { lo = Math.min(lo, P[k]); hi = Math.max(hi, P[k]); }
  return segs.length ? [lo, hi] : [NaN, NaN];
};
const bboxOf = (tris) => {
  const b = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
  for (const t of tris) for (const P of [t.a, t.b, t.c]) for (let k = 0; k < 3; k++) {
    if (P[k] < b.lo[k]) b.lo[k] = P[k];
    if (P[k] > b.hi[k]) b.hi[k] = P[k];
  }
  return b;
};

/** Connected islands of triangles, welded at 0.05 mm. Returns arrays of triangles. */
function islands(tris) {
  const key = (P) => `${Math.round(P[0] * 20000)},${Math.round(P[1] * 20000)},${Math.round(P[2] * 20000)}`;
  const parent = tris.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const owner = new Map();
  tris.forEach((t, i) => {
    for (const P of [t.a, t.b, t.c]) {
      const k = key(P);
      const j = owner.get(k);
      if (j === undefined) owner.set(k, i);
      else { const a = find(i), b = find(j); if (a !== b) parent[a] = b; }
    }
  });
  const groups = new Map();
  tris.forEach((t, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); });
  return [...groups.values()];
}

/**
 * The blade section by its ENVELOPES: the highest and lowest surface a ray
 * finds at each x, from the segments of a slice. Two things follow that a
 * shoelace over the segments cannot give, and the first version of this ruler
 * learned it the hard way (the HEAD sword read "117% flat", because its fuller
 * is a second closed shell laid over the blade and the two outlines were summed):
 *
 *   area   the integral of (top - bottom) across x, the union of every solid;
 *   flat   the share of the width where the TOP surface is within 2 degrees of
 *          the face plane, measured over a 1 mm window. Two degrees, not eight:
 *          a rhombic blade's facets lie only 7 degrees off the plane (it is 6 mm
 *          thick on 56 mm), so anything looser calls the diamond flat.
 */
function sectionStats(segs, step = 0.00025) {
  const [x0, x1] = spanOf(segs, 0);
  const xs = [], top = [], bot = [];
  for (let x = x0 + step / 2; x <= x1; x += step) {
    let hi = -Infinity, lo = Infinity;
    for (const q of segs) {
      const [a, b] = q.p1[0] <= q.p2[0] ? [q.p1, q.p2] : [q.p2, q.p1];
      if (x < a[0] || x > b[0]) continue;
      const u = b[0] - a[0] < 1e-12 ? 0 : (x - a[0]) / (b[0] - a[0]);
      const z = a[1] + (b[1] - a[1]) * u;
      if (z > hi) hi = z;
      if (z < lo) lo = z;
    }
    if (hi === -Infinity) continue;
    xs.push(x); top.push(hi); bot.push(lo);
  }
  let area = 0;
  for (let i = 0; i < xs.length; i++) area += (top[i] - bot[i]) * step;
  const T = Math.max(...top) - Math.min(...bot);
  const win = Math.round(0.001 / step);
  let flat = 0;
  for (let i = win; i < xs.length - win; i++) {
    const slope = Math.abs(top[i + win] - top[i - win]) / (xs[i + win] - xs[i - win]);
    if (slope <= Math.tan(2 * Math.PI / 180)) flat++;
  }
  return { area, W: x1 - x0, T, flatFrac: flat / xs.length };
}

/** The surface a ray from +z lands on at each x, across [x0, x1]: [{x, z, t}]. */
function topProfile(segs, x0, x1, step = 0.0005) {
  const rows = [];
  for (let x = x0; x <= x1 + 1e-9; x += step) {
    let best = null;
    for (const s of segs) {
      const [a, b] = s.p1[0] <= s.p2[0] ? [s.p1, s.p2] : [s.p2, s.p1];
      if (x < a[0] - 1e-9 || x > b[0] + 1e-9) continue;
      const u = b[0] - a[0] < 1e-9 ? 0 : (x - a[0]) / (b[0] - a[0]);
      const z = a[1] + (b[1] - a[1]) * u;
      if (!best || z > best.z) best = { x, z, t: s.t };
    }
    rows.push(best ?? { x, z: NaN, t: null });
  }
  return rows;
}

const build = {
  sword: (style) => CH.buildSword(RAW, style),
  seax: (style) => CH.buildDagger(RAW, style),
  dane: (style) => CH.buildAxe(RAW, style, "dane"),
  hand: (style) => CH.buildAxe(RAW, style, "hand"),
  spear: (style) => CH.buildSpear(RAW, style),
};
const tipOf = (tris) => bboxOf(tris).hi[1];

/**
 * The grip the baked fists close on (PROCESS R7: a number that lives in two places). `HAND_GRIP` in
 * characters.ts is what the authored fists were sized to, and no weapon may move it: read off the
 * emitted triangles at y = 0, where the hand mount is, the section's largest half-extent stays within
 * 2.5 mm under and 4 mm over the fist's radius. HEAD passes this; it is here so the rework cannot leave.
 */
const gripCheck = (label, tris, fist) => {
  const s = slice(tris, 1, 0);
  const [xl, xh] = spanOf(s, 0), [zl, zh] = spanOf(s, 1);
  const half = s.length ? Math.max(xh - xl, zh - zl) / 2 : 0;
  check(`[${label}] the grip at the hand mount is what the baked fist closes on (${mm(fist)} radius: -2.5/+4 mm)`, half >= fist - 0.0025 && half <= fist + 0.004, `${mm(half)}`);
};

/**
 * CH-24: steel is not a mirror. A metalness of 1 has no diffuse term, so a blade at 0.9-1.0 shows the
 * sky and nothing else, and the sky is darker than the turf (the kit card read the sword at luma 35
 * against a ground of 88). So: no steel-surface material anywhere on a weapon above 0.90 or glassier
 * than roughness 0.25 (the silvered and gilt mounts run at 0.85: nearly a full metal, and small), and
 * the AREA-WEIGHTED mean of the weapon's steel at 0.80 or under, which is the blade's bands at 0.70
 * with the mounts riding on top. Read off the materials the builders hand the meshes, so a substance
 * path is read as the builders wrote it.
 *
 * WHAT IT CANNOT SEE, on the verdict line where R4 wants it: the headless library (RAW) gives
 * `weldsteel` and `serpentsteel` the metalness its own default does (0.25-0.55), not the recipe's 1,
 * so a pattern-finish material that forgot to pass the palette's metalness would read fine here and
 * be a mirror in the game (the old whole-blade path was exactly that, and is gone). The palette
 * passes it explicitly now; the frame is what proves it. On HEAD this fails for the issued, blued,
 * gilt and bronze finishes (mean 0.85, roughness 0.18-0.26) and cannot fail for the two pattern ones.
 */
const mirrorCheck = (label, tris) => {
  const steel = tris.filter((t) => STEELS.has(t.mi.surface));
  const total = steel.reduce((q, t) => q + t.area, 0) || 1;
  const mean = steel.reduce((q, t) => q + t.area * (t.mi.metalness ?? 1), 0) / total;
  let hi = { metal: -1, name: "-" }, lo = { rough: 9, name: "-" };
  for (const t of steel) {
    if ((t.mi.metalness ?? 1) > hi.metal) hi = { metal: t.mi.metalness ?? 1, name: t.mi.name };
    if ((t.mi.roughness ?? 0) < lo.rough) lo = { rough: t.mi.roughness ?? 0, name: t.mi.name };
  }
  check(`[${label}] no steel is a mirror (metalness <= 0.90 and roughness >= 0.25 everywhere, the area-weighted mean metalness <= 0.80)`,
    steel.length > 0 && hi.metal <= 0.90 && lo.rough >= 0.25 && mean <= 0.80,
    `mean ${mean.toFixed(2)}; highest ${hi.metal.toFixed(2)} (${hi.name}), glassiest roughness ${lo.rough.toFixed(2)} (${lo.name})`);
};

// ============================================================
// MUTANTS - deliberately wrong weapons, to show a check is not vacuous (R3)
// ============================================================
/**
 * Applies the requested wrongness to a built weapon group, or nothing when the mutant is for another weapon.
 * Returns a note for the verdict line. Every mutant is a THING A LAZY FIX WOULD DO: the right numbers on the
 * wrong object, or a check's own quantity satisfied by a shortcut.
 */
function mutate(weapon, group) {
  if (MUT_WEAPON === null || !(MUT_WEAPON === weapon || (MUT_WEAPON === "axe" && (weapon === "dane" || weapon === "hand")))) return "";
  const name = MUT_NAME;
  const meshes = []; group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const surf = (m) => matInfo(m.material).surface;
  const stretch = (mesh, fx, fy, fz, when) => {
    const p = mesh.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (when && !when(p.getX(i), p.getY(i), p.getZ(i))) continue;
      p.setXYZ(i, p.getX(i) * fx, p.getY(i) * fy, p.getZ(i) * fz);
    }
    p.needsUpdate = true;
  };
  const dropTris = (mesh, pred) => {
    const G = mesh.geometry, P = G.attributes.position, I = G.index, keep = [];
    const n = I ? I.count : P.count;
    for (let t = 0; t < n; t += 3) {
      const ids = [0, 1, 2].map((k) => (I ? I.getX(t + k) : t + k));
      if (!pred(ids.map((i) => [P.getX(i), P.getY(i), P.getZ(i)]))) keep.push(...ids);
    }
    G.setIndex(keep);
  };
  if (weapon === "sword") {
    if (name === "hoop-and-balls") {
      // The right numbers, the wrong object: a 68 mm pommel that is a plain cap with three balls stacked on it.
      const mat = meshes[0].material;
      for (const lx of [-0.021, 0, 0.021]) {
        const geo = new THREE.SphereGeometry(0.012, 8, 5);
        geo.translate(lx, -0.120, 0);
        group.add(new THREE.Mesh(geo, mat));
      }
      return "three loose balls added under the butt";
    }
    if (name === "wide-guard-pommel") {
      for (const m of meshes) stretch(m, 1.9, 1, 1, (x, y) => y <= 0.02);
      return "every hilt vertex below y=0.02 stretched 1.9x in x";
    }
    if (name === "rhombus") return "no geometry change: the HEAD sword IS the rhombic mutant";
  }
  if (weapon === "spear") {
    if (name === "fat-leaf") {
      for (const m of meshes) if (STEELS.has(surf(m))) stretch(m, 1.55, 1, 1, (x, y) => y > 1.12);
      return "every steel vertex above y 1.12 stretched 1.55x across: a 133 mm leaf, the wings lost in it";
    }
    if (name === "wingless") {
      for (const m of meshes) if (surf(m) === "iron") dropTris(m, (pts) => pts.every(([x, y]) => Math.abs(x) > 0.0235 && y > 1.03 && y < 1.18));
      return "the wing plates deleted: a leaf on a socket";
    }
    if (name === "oak-broomstick") {
      for (const m of meshes) if (surf(m) === "ash") stretch(m, 1.3, 1, 1.3, (x, y) => y < 0.95);
      return "the ash shaft thickened 1.3x: a 40 mm pole";
    }
  }
  if (weapon === "seax") {
    if (name === "emissive-runes") {
      for (const m of meshes) if (isBrass(matInfo(m.material))) { m.material = m.material.clone(); m.material.emissive.setRGB(1, 0.8, 0.4); m.material.emissiveIntensity = 1; }
      return "the brass wire made to glow: the runeGlow the game's one fantasy-magic trap was";
    }
    if (name === "no-runes") {
      for (const m of meshes) if (isBrass(matInfo(m.material))) dropTris(m, () => true);
      return "the wire deleted: a blade with an empty fuller";
    }
  }
  if (weapon === "dane" || weapon === "hand") {
    if (name === "same-iron-bit") {
      const iron = meshes.find((m) => surf(m) === "iron");
      for (const m of meshes) if (STEELS.has(surf(m))) m.material = iron.material;
      return "the bit and the mounts in the cheeks' iron: one dark value from haft to edge";
    }
    if (name === "long-edge") {
      for (const m of meshes) stretch(m, 1.3, 1, 1, (x) => Math.abs(x) > 0.03);
      return "everything more than 30 mm off the haft stretched 1.3x along the cut: the 307 mm edge it was";
    }
  }
  return `unknown mutant ${weapon}:${name}`;
}

// ============================================================
// SWORD
// ============================================================
function swordChecks(styleId) {
  const g = build.sword(styleId);
  const note = mutate("sword", g);
  const tris = collect(g);
  const bb = bboxOf(tris);
  const label = styleId;
  console.log(`\n  -- ${label}${note ? `  [MUTANT: ${note}]` : ""}  ${tris.length} triangles, tip y ${bb.hi[1].toFixed(4)}`);

  check(`[${label}] reach lock: the tip is where anim.ts reads it (rig.reach = 1.055)`, Math.abs(bb.hi[1] - 1.055) < 0.0006, `max y ${bb.hi[1].toFixed(4)}`);
  gripCheck(label, tris, CH.gripsFor("huscarl").main);
  mirrorCheck(label, tris);
  check(`[${label}] no emissive anywhere (no magic: LORE 5.5)`, !tris.some((t) => t.mi.emissive), "");

  // ---- the grip: the anchor every hilt reading is taken against ----
  const gripTris = tris.filter((t) => t.mi.surface === "leather" || t.mi.surface === "rope" || t.mi.surface === "bone");
  const gb = gripTris.length ? bboxOf(gripTris) : null;
  check(`[${label}] there is a grip (leather, horn or wound wire)`, !!gb && gb.hi[1] - gb.lo[1] > 0.15, gb ? `${mm(gb.hi[1] - gb.lo[1])} long` : "none");
  if (!gb) return;
  const gripTop = gb.hi[1], gripBot = gb.lo[1];
  const ys = []; for (let y = gripBot - 0.10; y <= gripTop + 0.06; y += 0.002) ys.push(y);
  const widthAt = (y, pick = null) => { const s = slice(tris, 1, y, pick); const [lo, hi] = spanOf(s, 0); return s.length ? hi - lo : 0; };

  // ---- lower guard: the widest slice anywhere in the hilt ----
  let gw = 0, gy = 0;
  for (const y of ys) { const w = widthAt(y); if (w > gw) { gw = w; gy = y; } }
  check(`[${label}] lower guard 120-140 mm across (Viking/AS guards 80-110; readability wants 120-140; was 212)`, gw >= 0.120 && gw <= 0.140, `widest hilt slice ${mm(gw)} at y ${gy.toFixed(3)}`);
  check(`[${label}] ...and that slice sits at the top of the grip (it is the lower guard, not a pommel)`, Math.abs(gy - gripTop) <= 0.045, `${mm(gy - gripTop)} above the grip top`);
  const gs = slice(tris, 1, gy);
  const [gz0, gz1] = spanOf(gs, 1);
  check(`[${label}] guard 16-30 mm deep (a bar, not a slab: was 42)`, gz1 - gz0 >= 0.016 && gz1 - gz0 <= 0.030, mm(gz1 - gz0));

  // ---- pommel: everything from the grip's last 30 mm downward, that is not the grip ----
  // (Not "below the grip": HEAD's three balls sit round the grip's lower end, and a
  // zone that starts under the grip does not contain them. The ruler said "2 islands".)
  const isGrip = (t) => t.mi.surface === "leather" || t.mi.surface === "rope" || t.mi.surface === "bone";
  const inButt = (t) => (t.a[1] + t.b[1] + t.c[1]) / 3 < gripBot + 0.03 && !isGrip(t);
  const butt = tris.filter(inButt);
  let pw = 0;
  for (let y = gripBot - 0.20; y < gripBot + 0.03; y += 0.002) pw = Math.max(pw, widthAt(y, inButt));
  check(`[${label}] the pommel end is 50-80 mm across (finds 50-70 mm; was 124)`, pw >= 0.050 && pw <= 0.080, `widest slice of the butt ${mm(pw)}`);
  // A niello panel lying on a face is an inlay, not a part: an island whose thinnest side is under 2 mm is a
  // plate, and it is left out of the count (a ball or a hoop is not thin).
  const isl = islands(butt).map((t) => ({ t, b: bboxOf(t) }))
    .filter((x) => Math.max(x.b.hi[0] - x.b.lo[0], x.b.hi[1] - x.b.lo[1], x.b.hi[2] - x.b.lo[2]) >= 0.015)
    .filter((x) => Math.min(x.b.hi[0] - x.b.lo[0], x.b.hi[1] - x.b.lo[1], x.b.hi[2] - x.b.lo[2]) >= 0.002);
  check(`[${label}] the pommel end is integral: upper guard, ONE pommel shell and a ferrule at most (<= 3 islands of 15 mm or more; no loose balls or hoops)`, isl.length <= 3, `${isl.length} islands in the butt`);
  // butt-end silhouette: the lowest y at each x, across the pommel's own width
  const pommelIsland = isl.slice().sort((a, b) => a.b.lo[1] - b.b.lo[1])[0];
  const lobes = pommelIsland ? countLobes(pommelIsland.t, pommelIsland.b.lo[0], pommelIsland.b.hi[0]) : 0;
  check(`[${label}] the butt end has three lobes (a tri-lobed pommel: Petersen H/K family)`, lobes === 3, `${lobes} lobes on the butt-end line`);

  // ---- niello / inlay panels: a mount is a plated thing with a ground of black ----
  const inlay = tris.filter((t) => (t.a[1] + t.b[1] + t.c[1]) / 3 < gripTop + 0.05 && t.mi.surface === "interlace" && t.mi.L <= 32);
  const inlayArea = inlay.reduce((a, t) => a + t.area, 0);
  check(`[${label}] the guard and pommel carry a niello panel (dark interlace, at least 4 cm2: Trewhiddle mounts, LORE 5.1)`, inlayArea >= 0.0004, `${(inlayArea * 1e4).toFixed(2)} cm2`);

  // ---- the blade: from above the guard to the tip ----
  // the blade zone starts just above the guard (its top is at 0.165) and must include the whole of the fuller's
  // fade-in, which begins at 0.20: a zone that started at 0.24 read the fuller's first 40 mm from half a section
  const bladeTris = tris.filter((t) => (t.a[1] + t.b[1] + t.c[1]) / 3 > 0.175 && isBladeMetal(t.mi));
  const bladeAll = tris.filter((t) => (t.a[1] + t.b[1] + t.c[1]) / 3 > 0.175);
  const ymid = 0.55;
  const sec = slice(bladeAll, 1, ymid);
  const { area, W, T, flatFrac } = sectionStats(sec);
  const fill = area / (W * T);
  check(`[${label}] blade section is a lens or a flat bar, not a rhombus (fill of its bounding box >= 0.66; a diamond is 0.5, HEAD's clipped one 0.62, a lens 0.67, a grooved flat bar 0.72)`, fill >= 0.66, `fill ${fill.toFixed(3)} (${mm(W)} x ${mm(T)})`);
  check(`[${label}] ...and the faces are FLAT (>= 35% of the width within 2 degrees of the face plane: a rhombus has none)`, flatFrac >= 0.35, `${(flatFrac * 100).toFixed(0)}% flat`);
  check(`[${label}] ...and thin enough to be a blade (8-13 : 1 across its width; was 7)`, W / T >= 8 && W / T <= 14, `${(W / T).toFixed(1)} : 1`);

  // fuller: the dark run in the middle, by the ALBEDO of the surface a ray lands on
  const fullerAt = (y) => {
    const s = slice(bladeAll, 1, y);
    if (!s.length) return null;
    const [x0, x1] = spanOf(s, 0);
    const prof = topProfile(s, x0, x1);
    const distEdge = (x) => Math.min(x - x0, x1 - x);
    // the FLAT is the shoulder: 9-15 mm in from the edge, wherever the fuller is not
    const flatL = medianOf(prof.filter((r) => r.t && isBladeMetal(r.t.mi) && !isPattern(r.t.mi) && distEdge(r.x) >= 0.009 && distEdge(r.x) <= 0.015).map((r) => r.t.mi.L));
    // "dark" is 18 L* under the flat: the issued blade's is 49 under it, and a blackened blade (flat L* 31) cannot have
    // a fuller 25 under a flat it is itself only 31 above black
    const dark = prof.map((r) => (r.t && Number.isFinite(r.t.mi.L) && Number.isFinite(flatL) && r.t.mi.L <= flatL - 18 ? 1 : 0));
    // the run of dark texels nearest the centre
    let best = null;
    for (let i = 0; i < dark.length;) {
      if (!dark[i]) { i++; continue; }
      let j = i; while (j < dark.length && dark[j]) j++;
      const c = (prof[i].x + prof[j - 1].x) / 2;
      if (!best || Math.abs(c) < Math.abs(best.c)) best = { c, w: (j - i) * 0.0005, x0: prof[i].x, x1: prof[j - 1].x };
      i = j;
    }
    return { best, flatL, prof, x0, x1, distEdge };
  };
  const fm = fullerAt(ymid);
  const fw = fm?.best?.w ?? 0;
  check(`[${label}] a DARK fuller 20-30 mm wide runs down the middle (LORE 5.1: a third to a half of the width; was 12-17 mm and 0.1 mm proud)`, fw >= 0.020 && fw <= 0.030 && Math.abs(fm.best.c) < 0.003, fm?.best ? `${mm(fw)} wide, centred ${mm(fm.best.c)}, ${fm.flatL.toFixed(0)} L* flat vs dark` : "no dark run found");
  // run length and ends
  let fy0 = null, fy1 = null;
  for (let y = 0.2; y <= 1.0; y += 0.01) {
    const f = fullerAt(y);
    if (f?.best && f.best.w >= 0.004 && Math.abs(f.best.c) < 0.004) { if (fy0 === null) fy0 = y; fy1 = y; }
  }
  const runLen = fy0 === null ? 0 : fy1 - fy0;
  const wEnd0 = fy0 === null ? 0 : (fullerAt(fy0 + 0.012)?.best?.w ?? 0);
  const wEnd1 = fy0 === null ? 0 : (fullerAt(fy1 - 0.012)?.best?.w ?? 0);
  check(`[${label}] the fuller runs at least 600 mm and TAPERS at both ends`, runLen >= 0.60 && wEnd0 < 0.8 * fw && wEnd1 < 0.8 * fw, `run ${mm(runLen)}, width ${mm(wEnd0)} / ${mm(fw)} / ${mm(wEnd1)}`);
  // the edge: the outer 3 mm each side is brighter than the flat
  if (fm) {
    const outer = fm.prof.filter((r) => r.t && fm.distEdge(r.x) <= 0.003);
    const edgeL = medianOf(outer.map((r) => r.t.mi.L));
    check(`[${label}] the last 3 mm at each edge is a bright bevel land (>= 8 L* over the flat shoulder)`, edgeL >= fm.flatL + 8, `edge ${edgeL.toFixed(1)} L* vs shoulder ${fm.flatL.toFixed(1)} L*`);
    // pattern confined to the fuller
    const pat = fm.prof.filter((r) => r.t && isPattern(r.t.mi));
    const outside = pat.filter((r) => !(fm.best && r.x >= fm.best.x0 - 0.0006 && r.x <= fm.best.x1 + 0.0006));
    check(`[${label}] any pattern-weld shows ONLY in the fuller (the edges are plain bright: LORE 5.1)`, outside.length === 0, `${outside.length} texels of watering outside the fuller`);
  }
  // the point
  const wTip = (d) => { const s = slice(bladeAll, 1, bb.hi[1] - d); const [lo, hi] = spanOf(s, 0); return s.length ? hi - lo : 0; };
  check(`[${label}] the point is rounded, not a needle (width 20 mm short of the tip >= 24 mm, 5 mm short >= 12 mm)`, wTip(0.020) >= 0.024 && wTip(0.005) >= 0.012, `${mm(wTip(0.020))} at 20 mm, ${mm(wTip(0.005))} at 5 mm`);
  void bladeTris;
}

/**
 * Lobes on the butt-end line: the lowest y at each x across the pommel, smoothed
 * over 1 mm, counting strict local minima (over a 3 mm window either side) that
 * stand at least 1.5 mm below the highest point of the line within 12 mm on BOTH
 * sides. One smooth cap is one minimum; a trefoil is three.
 */
function countLobes(triangles, lo, hi) {
  const step = 0.0005, xs = [], ys = [];
  for (let x = lo + step; x <= hi - step; x += step) {
    const [y0] = spanOf(slice(triangles, 0, x), 0);
    xs.push(x); ys.push(Number.isFinite(y0) ? y0 : NaN);
  }
  const sm = ys.map((_, i) => {
    let a = 0, n = 0;
    for (let k = -1; k <= 1; k++) { const v = ys[i + k]; if (Number.isFinite(v)) { a += v; n++; } }
    return n ? a / n : NaN;
  });
  const win = 6, far = 24;
  let count = 0, last = -Infinity;
  for (let i = win; i < sm.length - win; i++) {
    if (!Number.isFinite(sm[i])) continue;
    let isMin = true;
    for (let k = -win; k <= win; k++) if (Number.isFinite(sm[i + k]) && sm[i + k] < sm[i] - 1e-9) { isMin = false; break; }
    if (!isMin || xs[i] - last < 0.005) continue;
    let left = -Infinity, right = -Infinity;
    for (let k = Math.max(0, i - far); k <= i; k++) if (Number.isFinite(sm[k])) left = Math.max(left, sm[k]);
    for (let k = i; k <= Math.min(sm.length - 1, i + far); k++) if (Number.isFinite(sm[k])) right = Math.max(right, sm[k]);
    if (Math.min(left, right) - sm[i] >= 0.0015) { count++; last = xs[i]; }
  }
  return count;
}

const medianOf = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };

// ============================================================
// SEAX
// ============================================================
function seaxChecks(styleId) {
  const g = build.seax(styleId);
  const note = mutate("seax", g);
  const tris = collect(g);
  const bb = bboxOf(tris);
  const label = styleId;
  console.log(`\n  -- ${label}${note ? `  [MUTANT: ${note}]` : ""}  ${tris.length} triangles, tip y ${bb.hi[1].toFixed(4)}`);
  check(`[${label}] reach lock: rig.reach = 0.5`, Math.abs(bb.hi[1] - 0.5) < 0.0006, `max y ${bb.hi[1].toFixed(4)}`);
  gripCheck(label, tris, CH.gripsFor("runekeeper").main);
  mirrorCheck(label, tris);
  check(`[${label}] no emissive anywhere (the runes are cut and wire-inlaid, not lit: LORE 5.5, CH-09)`, !tris.some((t) => t.mi.emissive), "");

  const blade = tris.filter((t) => isBladeMetal(t.mi) && (t.a[1] + t.b[1] + t.c[1]) / 3 > 0.09);
  if (!blade.length) { check(`[${label}] there is a steel blade`, false, "no steel triangles above y=0.09"); return; }
  const bb2 = bboxOf(blade);
  const tip = bb2.hi[1];
  const heel = Math.max(0.05, bb2.lo[1]);
  const L = tip - heel;
  // thickness (top surface minus bottom surface, by envelope) 4 mm inboard of each lateral extreme, at y = heel + 30%
  const y3 = heel + 0.3 * L;
  const s3 = slice(blade, 1, y3);
  const [x0, x1] = spanOf(s3, 0);
  const thicknessAt = (x) => {
    let hi = -Infinity, lo = Infinity;
    for (const q of s3) {
      const [a, b] = q.p1[0] <= q.p2[0] ? [q.p1, q.p2] : [q.p2, q.p1];
      if (x < a[0] || x > b[0]) continue;
      const u = b[0] - a[0] < 1e-12 ? 0 : (x - a[0]) / (b[0] - a[0]);
      const z = a[1] + (b[1] - a[1]) * u;
      hi = Math.max(hi, z); lo = Math.min(lo, z);
    }
    return hi - lo;
  };
  const tL = thicknessAt(x0 + 0.004), tR = thicknessAt(x1 - 0.004);
  const thick = Math.max(tL, tR), thin = Math.min(tL, tR);
  check(`[${label}] SINGLE-EDGED: one side is a thick spine, the other a thin edge (>= 4 : 1 thickness 4 mm in from each side)`, thin > 0 && thick / thin >= 4, `${mm(thick)} against ${mm(thin)}`);
  const spineSide = tL > tR ? -1 : 1;
  const spineTop = thicknessAt(spineSide < 0 ? x0 + 0.003 : x1 - 0.003);
  check(`[${label}] the spine is 6-9 mm thick (a seax back is a bar, not a knife's edge)`, spineTop >= 0.006 && spineTop <= 0.009, mm(spineTop));

  // silhouette lines: edge side and spine side, every 5 mm
  const ysS = []; for (let y = heel + 0.01; y <= tip - 0.001; y += 0.005) ysS.push(y);
  const line = ysS.map((y) => { const s = slice(blade, 1, y); const [lo, hi] = spanOf(s, 0); return { y, lo, hi }; });
  const spine = line.map((r) => ({ y: r.y, x: spineSide < 0 ? r.lo : r.hi }));
  const edge = line.map((r) => ({ y: r.y, x: spineSide < 0 ? r.hi : r.lo }));
  // turning angle of a polyline at each sample over +-15 mm windows
  const turn = (pts, i, w) => {
    const a = pts[Math.max(0, i - w)], b = pts[i], c = pts[Math.min(pts.length - 1, i + w)];
    const a1 = Math.atan2(b.x - a.x, b.y - a.y), a2 = Math.atan2(c.x - b.x, c.y - b.y);
    return Math.abs(a2 - a1) * 180 / Math.PI;
  };
  let kneeI = -1, kneeA = 0;
  for (let i = 3; i < spine.length - 3; i++) { const a = turn(spine, i, 3); if (a > kneeA) { kneeA = a; kneeI = i; } }
  const kneeFrac = kneeI < 0 ? NaN : (spine[kneeI].y - heel) / L;
  check(`[${label}] BROKEN BACK: the spine line has one corner of >= 10 degrees at 55-72% of the blade from the heel (was none: a symmetric leaf)`, kneeA >= 10 && kneeFrac >= 0.55 && kneeFrac <= 0.72, `corner ${kneeA.toFixed(1)} deg at ${(kneeFrac * 100).toFixed(0)}%`);
  // straight before the corner
  let bow = 0;
  if (kneeI > 4) {
    const p0 = spine[0], p1 = spine[Math.max(1, kneeI - 3)];
    for (let i = 0; i <= kneeI - 3; i++) {
      const t = (spine[i].y - p0.y) / (p1.y - p0.y || 1);
      bow = Math.max(bow, Math.abs(spine[i].x - (p0.x + (p1.x - p0.x) * t)));
    }
  }
  check(`[${label}] the spine is straight up to the corner (bows under 2.5 mm)`, kneeI > 4 && bow <= 0.0025, mm(bow));
  // the edge line: straight or slightly convex, and the tip on it
  const e0 = edge[0], e1 = edge[edge.length - 5];
  let dev = 0, concave = 0;
  for (const p of edge.slice(0, edge.length - 4)) {
    const t = (p.y - e0.y) / (e1.y - e0.y || 1);
    const chord = e0.x + (e1.x - e0.x) * t;
    const d = (p.x - chord) * -spineSide; // >0 when the edge bows AWAY from the spine (convex)
    dev = Math.max(dev, Math.abs(d)); concave = Math.min(concave, d);
  }
  check(`[${label}] the edge is straight or slightly convex (within 4 mm of its chord, never concave by more than 1 mm)`, dev <= 0.004 && concave >= -0.001, `deviates ${mm(dev)}, concave ${mm(-concave)}`);
  const tipS = slice(blade, 1, tip - 0.0015);
  const [tl, th] = spanOf(tipS, 0);
  const tipX = (tl + th) / 2;
  const extend = e0.x + (e1.x - e0.x) * ((tip - e0.y) / (e1.y - e0.y || 1));
  check(`[${label}] the point sits on the edge line (within 8 mm)`, Math.abs(tipX - extend) <= 0.008, `${mm(Math.abs(tipX - extend))} off`);
  check(`[${label}] blade 400-450 mm from heel to tip`, L >= 0.40 && L <= 0.45, mm(L));

  // hilt: no cup guard
  const hiltTris = tris.filter((t) => (t.a[1] + t.b[1] + t.c[1]) / 3 < heel - 0.004);
  let hw = 0;
  for (let y = -0.20; y < heel - 0.004; y += 0.002) { const s = slice(hiltTris, 1, y); const [lo, hi] = spanOf(s, 0); if (s.length) hw = Math.max(hw, hi - lo); }
  check(`[${label}] NO cup guard: nothing in the hilt is wider than 50 mm (a silver bolster, was a 68 mm brass cup)`, hw > 0.02 && hw <= 0.050, `widest hilt slice ${mm(hw)}`);
  // inlay: brass wire in the fuller
  // the wire is the brass-coloured steel ABOVE the bolster (a gilt or bronze finish makes the mounts brass too)
  const wire = tris.filter((t) => t.mi.surface !== "leather" && isBrass(t.mi) && (t.a[1] + t.b[1] + t.c[1]) / 3 > heel + 0.02);
  const wireArea = wire.reduce((a, t) => a + t.area, 0);
  check(`[${label}] brass wire inlay is laid in the blade (>= 2.5 cm2 of it: runes and lozenges, Beagnoth)`, wireArea >= 0.00025, `${(wireArea * 1e4).toFixed(2)} cm2`);
  // proud <= 0.4 mm over the surface it lies on
  let proud = 0, sunk = 0;
  if (wire.length) {
    const bladeOnly = blade;
    const surfaceZ = (x, y) => { let best = -Infinity; for (const t of bladeOnly) { const z = zOn(t, x, y); if (z !== null && z > best) best = z; } return best; };
    const seen = new Set();
    for (const t of wire) for (const P of [t.a, t.b, t.c]) {
      if (P[2] <= 0) continue; // the face toward +z only
      const k = `${Math.round(P[0] * 2000)},${Math.round(P[1] * 2000)}`;
      if (seen.has(k) || seen.size > 400) continue;
      seen.add(k);
      const z = surfaceZ(P[0], P[1]);
      if (z === -Infinity) continue;
      proud = Math.max(proud, P[2] - z); sunk = Math.min(sunk, P[2] - z);
    }
  }
  check(`[${label}] the wire stands at most 0.4 mm proud of the fuller it is laid in`, wire.length > 0 && proud <= 0.0004 + 1e-6, `${(proud * 1000).toFixed(2)} mm proud, ${(-sunk * 1000).toFixed(2)} mm sunk`);
}

/** z of triangle t's plane at (x, y), or null when (x, y) is outside its projection. */
function zOn(t, x, y) {
  const [a, b, c] = [t.a, t.b, t.c];
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(d) < 1e-14) return null;
  const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
  const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
  const l3 = 1 - l1 - l2;
  if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) return null;
  return l1 * a[2] + l2 * b[2] + l3 * c[2];
}

// ============================================================
// AXES
// ============================================================
function axeChecks(form, styleId) {
  const g = build[form](styleId);
  const note = mutate(form, g);
  const tris = collect(g);
  const bb = bboxOf(tris);
  const label = `${form} ${styleId}`;
  const lock = form === "dane" ? 0.997 : 0.401;
  console.log(`\n  -- ${label}${note ? `  [MUTANT: ${note}]` : ""}  ${tris.length} triangles, top y ${bb.hi[1].toFixed(4)}`);
  check(`[${label}] reach lock: the head's top is where anim.ts reads rig.reach (${lock})`, Math.abs(bb.hi[1] - lock) < 0.0006, `max y ${bb.hi[1].toFixed(4)}`);
  gripCheck(label, tris, form === "hand" ? CH.gripsFor("berserker", "hand_axes").main : CH.gripsFor("berserker").main);
  mirrorCheck(label, tris);
  check(`[${label}] no emissive anywhere`, !tris.some((t) => t.mi.emissive), "");

  // the head: every y where something stands more than 42 mm off the haft axis
  const rows = [];
  for (let y = bb.lo[1]; y <= bb.hi[1]; y += 0.002) { const s = slice(tris, 1, y); const [, hi] = spanOf(s, 0); rows.push({ y, x: s.length ? hi : 0 }); }
  const head = rows.filter((r) => r.x > 0.042);
  const y0 = Math.min(...head.map((r) => r.y)), y1 = Math.max(...head.map((r) => r.y));
  const span = y1 - y0;
  const bar = form === "dane" ? 0.275 : 0.185;
  check(`[${label}] edge span along the haft <= ${(bar * 1000).toFixed(0)} mm (the finds run 120-200 mm; Dane axe was 307, hand axe 227)`, span <= bar && span >= 0.6 * bar, `${mm(span)}`);
  // beard hook: the lowest point of the head is pulled back toward the haft, and the beard hangs longer than the horn stands
  const xmax = Math.max(...head.map((r) => r.x));
  const yAtMax = head.find((r) => r.x === xmax).y;
  const above = y1 - yAtMax, below = yAtMax - y0;
  const beardX = head.filter((r) => r.y <= y0 + 0.006).reduce((a, r) => Math.max(a, r.x), 0);
  check(`[${label}] the crescent is kept: a BEARD hangs longer than the horn stands (>= 1.3 : 1) and hooks back to the haft (tip <= 0.65 of the full depth)`, below / above >= 1.3 && beardX <= 0.65 * xmax, `beard ${mm(below)} : horn ${mm(above)} = ${(below / above).toFixed(2)}, hook ${(beardX / xmax).toFixed(2)}`);
  // two materials in the head: a bit that is BRIGHTER than the cheeks by 20 L* or more (a dark finish darkens both)
  const headTris = tris.filter((t) => Math.max(t.a[0], t.b[0], t.c[0]) > 0.042);
  const facing = headTris.filter((t) => Math.abs(t.n[2]) > 0.35);
  const cheekL = medianOf(facing.filter((t) => t.mi.surface === "iron").map((t) => t.mi.L));
  const isBit = (mi) => isBladeMetal(mi) && Number.isFinite(cheekL) && mi.L >= cheekL + 20;
  const bright = facing.filter((t) => isBit(t.mi)).reduce((a, t) => a + t.area, 0);
  const darkA = facing.filter((t) => t.mi.surface === "iron").reduce((a, t) => a + t.area, 0);
  const tot = facing.reduce((a, t) => a + t.area, 0);
  check(`[${label}] TWO MATERIALS in the head: a steel bit 20 L* brighter than the iron cheeks (8-30% of the face) and the dark iron cheeks (>= 55%)`, bright / tot >= 0.08 && bright / tot <= 0.30 && darkA / tot >= 0.55, `bit ${(100 * bright / tot).toFixed(0)}%, cheeks ${(100 * darkA / tot).toFixed(0)}%`);
  // bit strip width, read as the bit-coloured run from the edge inward at the deepest slice
  const sM = slice(tris, 1, yAtMax);
  const topM = topProfile(sM.filter((q) => Math.max(q.p1[0], q.p2[0]) > 0.04), xmax - 0.05, xmax, 0.0005);
  let run = 0;
  for (let i = topM.length - 1; i >= 0; i--) { const r = topM[i]; if (r.t && isBit(r.t.mi)) run++; else if (run > 0) break; }
  const stripLo = form === "dane" ? 0.012 : 0.008, stripHi = form === "dane" ? 0.024 : 0.016;
  check(`[${label}] the bright bit strip is ${stripLo * 1000}-${stripHi * 1000} mm across`, run * 0.0005 >= stripLo && run * 0.0005 <= stripHi, mm(run * 0.0005));
  // haft is ash, not oak
  const woodTris = tris.filter((t) => t.mi.surface === "ash" || t.mi.surface === "oak");
  const ashA = woodTris.filter((t) => t.mi.surface === "ash").reduce((a, t) => a + t.area, 0);
  const woodA = woodTris.reduce((a, t) => a + t.area, 0);
  check(`[${label}] the haft is ASH (pale, straight, quiet grain), not the oak the palisade is made of`, woodA > 0 && ashA / woodA > 0.9, `${(100 * ashA / (woodA || 1)).toFixed(0)}% of the wood is ash`);
  return { span, xmax, y0, y1, edge: edgeTable(tris, y0, y1) };
}
/** The head's outboard silhouette, sampled every 4 mm and normalised by its own span, for the "own edge table" test. */
function edgeTable(tris, y0, y1) {
  const out = [];
  for (let y = y0; y <= y1; y += 0.004) { const s = slice(tris, 1, y); const [, hi] = spanOf(s, 0); out.push({ t: (y - y0) / (y1 - y0), x: hi }); }
  return out;
}

// ============================================================
// SPEAR
// ============================================================
function spearChecks(styleId) {
  const g = build.spear(styleId);
  const note = mutate("spear", g);
  const tris = collect(g);
  const bb = bboxOf(tris);
  const label = styleId;
  console.log(`\n  -- ${label}${note ? `  [MUTANT: ${note}]` : ""}  ${tris.length} triangles, tip y ${bb.hi[1].toFixed(4)}`);
  check(`[${label}] reach lock: rig.reach = 1.44`, Math.abs(bb.hi[1] - 1.44) < 0.0006, `max y ${bb.hi[1].toFixed(4)}`);
  gripCheck(label, tris, CH.gripsFor("warden").main);
  mirrorCheck(label, tris);
  check(`[${label}] overall length 2.06 m (gar: 1.8-2.3 m)`, Math.abs((bb.hi[1] - bb.lo[1]) - 2.06) < 0.006, mm(bb.hi[1] - bb.lo[1]));
  check(`[${label}] no emissive anywhere`, !tris.some((t) => t.mi.emissive), "");
  const width = (y) => { const s = slice(tris, 1, y); const [lo, hi] = spanOf(s, 0); return s.length ? hi - lo : 0; };
  const woodOnly = (t) => t.mi.surface === "ash" || t.mi.surface === "oak";
  const woodWidth = (y) => { const s = slice(tris, 1, y, woodOnly); const [lo, hi] = spanOf(s, 0); return s.length ? hi - lo : 0; };
  const shaftW = Math.max(...[-0.4, 0.4, 0.85].map(woodWidth));
  check(`[${label}] the wooden shaft is slim: <= 34 mm (real 25-30; was 38)`, shaftW <= 0.034 && shaftW >= 0.024, mm(shaftW));
  let headW = 0, headY = 0;
  for (let y = 0.98; y <= 1.44; y += 0.002) { const w = width(y); if (w > headW) { headW = w; headY = y; } }
  let leafW = 0;
  for (let y = 1.22; y <= 1.43; y += 0.002) leafW = Math.max(leafW, width(y));
  check(`[${label}] the head is at least 110 mm across the WINGS (Petersen E; was 76)`, headW >= 0.110, `${mm(headW)} at y ${headY.toFixed(3)}`);
  check(`[${label}] ...and that width is the WINGS below the leaf, not a fat leaf (widest slice under y 1.20; the leaf belly <= 90 mm and 25 mm narrower)`, headY < 1.20 && leafW <= 0.090 && headW - leafW >= 0.025, `wings ${mm(headW)} at ${headY.toFixed(3)}, leaf ${mm(leafW)}`);
  const isl = islands(tris.filter((t) => (t.a[1] + t.b[1] + t.c[1]) / 3 > 0.9)).map((t) => ({ t, b: bboxOf(t) }));
  const rings = isl.filter((x) => x.b.hi[1] - x.b.lo[1] <= 0.012 && x.b.hi[0] - x.b.lo[0] >= 0.038 && x.b.lo[1] > 0.95 && x.b.hi[1] < 1.05);
  check(`[${label}] a collar ring stands round the socket (a separate band, <= 12 mm tall, wider than the shaft)`, rings.length >= 1, `${rings.length} ring(s)`);
  const rivets = isl.filter((x) => Math.max(x.b.hi[0] - x.b.lo[0], x.b.hi[1] - x.b.lo[1], x.b.hi[2] - x.b.lo[2]) <= 0.007 && x.b.lo[1] > 0.98 && x.b.hi[1] < 1.25);
  check(`[${label}] two or more rivets (separate islands <= 7 mm) hold the head`, rivets.length >= 2, `${rivets.length} rivet(s)`);
  const leafTris = tris.filter((t) => isBladeMetal(t.mi) && (t.a[1] + t.b[1] + t.c[1]) / 3 > 1.1);
  const ironTris = tris.filter((t) => t.mi.surface === "iron" && (t.a[1] + t.b[1] + t.c[1]) / 3 > 0.95);
  {
    // Values, not levels: an oil-blackened or etched head is dark by definition, and what has to survive
    // is a leaf that reads bright against its own iron socket and wings. (The leaf is mostly bevel, 62% of
    // its half width a side, so its median is the honed band; the flats are a strip down the middle.)
    const leafL = medianOf(leafTris.map((t) => t.mi.L));
    const ironL = medianOf(ironTris.map((t) => t.mi.L));
    check(`[${label}] two values: a bright leaf (>= 45 L*) over a dark iron socket and wings (<= 40 L*, and >= 20 L* under the leaf)`,
      leafTris.length > 0 && ironTris.length > 0 && leafL >= 45 && ironL <= 40 && leafL - ironL >= 20,
      `leaf ${leafL.toFixed(0)} L*, socket and wings ${ironL.toFixed(0)} L*`);
  }
  const wood = tris.filter((t) => t.mi.surface === "ash" || t.mi.surface === "oak");
  const ashA = wood.filter((t) => t.mi.surface === "ash").reduce((a, t) => a + t.area, 0);
  const woodA = wood.reduce((a, t) => a + t.area, 0);
  check(`[${label}] the shaft is ASH`, woodA > 0 && ashA / woodA > 0.9, `${(100 * ashA / (woodA || 1)).toFixed(0)}% of the wood is ash`);
}

// ============================================================
// SHIELD (measured always; gated with --shield)
// ============================================================
function shieldReadings() {
  const g = CH.buildShield(0x6b4226, RAW, 0x5f6b7a, "none", "none");
  const tris = collect(g);
  const isl = islands(tris).map((t) => ({ t, b: bboxOf(t), mi: t[0].mi }));
  const vol = (ts) => { let v = 0; for (const t of ts) v += (t.a[0] * (t.b[1] * t.c[2] - t.b[2] * t.c[1]) - t.a[1] * (t.b[0] * t.c[2] - t.b[2] * t.c[0]) + t.a[2] * (t.b[0] * t.c[1] - t.b[1] * t.c[0])) / 6; return Math.abs(v); };
  const surf = (ts) => ts.reduce((a, t) => a + t.area, 0);
  // the rim binding: the big RAWHIDE ring (the pale leather, not the dark backing disc)
  const rim = isl.filter((x) => x.b.hi[0] - x.b.lo[0] > 0.7 && x.b.hi[1] - x.b.lo[1] > 0.7 && x.mi.surface === "leather" && x.mi.L > 40)[0];
  let tube = NaN;
  if (rim) {
    const top = slice(rim.t, 0, 0.0).filter((q) => Math.max(q.p1[0], q.p2[0]) > 0.3);
    const [ya, yb] = spanOf(top, 0), [za, zb] = spanOf(top, 1);
    tube = Math.min(yb - ya, zb - za);
  }
  const clips = isl.filter((x) => x.mi.surface === "iron" && Math.max(x.b.hi[0] - x.b.lo[0], x.b.hi[1] - x.b.lo[1]) < 0.07
    && Math.hypot((x.b.lo[0] + x.b.hi[0]) / 2, (x.b.lo[1] + x.b.hi[1]) / 2) > 0.3).length;
  const boards = tris.filter((t) => t.mi.surface === "oak" || t.mi.surface === "lime");
  const zTop = (x, y) => { let best = -Infinity; for (const t of boards) { const z = zOn(t, x, y); if (z !== null && z > best) best = z; } return best; };
  const dish = zTop(0.0, 0.16) - zTop(0.372, 0.0);
  // a SLAB is a closed island whose thickness (2V/A) is under 6.5 mm and whose face is over 40x40 mm: a painted quarter cut as a box
  const slabs = isl.filter((x) => x.mi.surface !== "leather" && surf(x.t) > 0.0032 && (2 * vol(x.t)) / surf(x.t) <= 0.0065).length;
  return [
    ["rim binding tube <= 10 mm (was a 32 mm torus)", Number.isFinite(tube) && tube <= 0.010, Number.isFinite(tube) ? mm(tube) : "no rim island"],
    ["at most 3 rim clips (was six 26x44x46 mm iron boxes)", clips <= 3, `${clips} clips`],
    ["dish <= 30 mm from the boss zone to the rim (was 70)", dish <= 0.030, mm(dish)],
    ["zero paint slab boxes (the field is a texture; was seven 4 mm boxes)", slabs === 0, `${slabs} slabs`],
  ];
}

// ============================================================
// RUN
// ============================================================
console.log("[weaponshape] the shape of every held weapon, read off the triangles the builders emit");
console.log(`[weaponshape] ${STYLE_IDS.length} finishes: ${STYLE_IDS.join(", ")}`);

if (!ONLY || ONLY === "sword") {
  section("1. SWORD (Petersen H/K family, Insular mounts: LORE 5.1) - every finish");
  for (const id of STYLE_IDS) swordChecks(id);
}
if (!ONLY || ONLY === "seax") {
  section("2. SEAX (Beagnoth, Repton: LORE 5.2)");
  for (const id of STYLE_IDS) seaxChecks(id);
}
let daneRes = null, handRes = null;
if (!ONLY || ONLY === "axe") {
  section("3. AXES (skeggox / Long Bearded Axe: LORE 5.3)");
  for (const id of STYLE_IDS) {
    const d = axeChecks("dane", id);
    const h = axeChecks("hand", id);
    if (id === STYLE_IDS[0]) { daneRes = d; handRes = h; }
  }
  if (daneRes && handRes) {
    // the hand axe must not be the Dane axe scaled: compare the two normalised outlines
    let worst = 0;
    for (let i = 0; i < daneRes.edge.length; i++) {
      const t = daneRes.edge[i].t;
      const j = handRes.edge.reduce((bi, r, k) => (Math.abs(r.t - t) < Math.abs(handRes.edge[bi].t - t) ? k : bi), 0);
      worst = Math.max(worst, Math.abs(daneRes.edge[i].x / daneRes.xmax - handRes.edge[j].x / handRes.xmax));
    }
    check("the hand axe has its OWN edge table (its normalised outline differs from the Dane axe's by >= 6% of its depth somewhere; was a uniform scale)", worst >= 0.06, `${(worst * 100).toFixed(1)}%`);
  }
}
if (!ONLY || ONLY === "spear") {
  section("4. SPEAR (gar, Petersen E: LORE 5.4)");
  for (const id of STYLE_IDS) spearChecks(id);
}
if (!ONLY || ONLY === "shield") {
  section(`5. SHIELD (board, lime, rawhide: LORE 5.6) - ${GATE_SHIELD ? "GATED (--shield)" : "read out, not gated here"}`);
  for (const [name, ok, detail] of shieldReadings()) {
    if (GATE_SHIELD) check(name, ok, detail);
    else report(name, `${ok ? "would pass" : "WOULD FAIL"}: ${detail}`, "the board is the shield engineer's file; pass --shield to gate it");
  }
}

console.log("");
if (MUTANT) {
  console.log(`[weaponshape] MUTANT ${MUTANT}: ${fail} check(s) failed. A mutant is wrong ON PURPOSE, so a run that fails is the ruler working; one that passes is a hole.`);
  console.log(fail > 0 ? `[weaponshape] the ruler CAUGHT the mutant (${failures.slice(0, 6).join(" | ")})` : "[weaponshape] the ruler MISSED the mutant: THIS IS A HOLE");
  process.exit(fail > 0 ? 0 : 1);
}
const deferred = ungated.length ? ` - WITH ${ungated.length} ungated shield reading(s) printed above, which is a deferral and not a clean sheet` : "";
if (fail === 0) console.log(`[weaponshape] PASS: ${pass} checks${deferred}`);
else {
  console.log(`[weaponshape] FAIL: ${fail} of ${pass + fail} checks${deferred}`);
  if (VERBOSE) for (const f of failures) console.log(`   - ${f}`);
}
process.exit(fail === 0 ? 0 : 1);
void existsSync; void readFileSync;
