#!/usr/bin/env node
// ============================================================
// HELMCLASH — the ruler for the four helm faults the owner photographed.
//
//   npm run helmclash
//   npm run helmclash -- --cls huscarl --helm suttonhoo
//   npm run helmclash -- --section 1,4
//
// The owner's four notes, in his words, and which section answers each:
//
//   1. "The Sutton Hoo helmet on huscarl currently clashes with the mesh
//      unlike other helmets."                                    -> 1 LAYERS
//   2. "On the remaining classes (warden etc.) the ears stick out." -> 2 FLESH
//   3. "There's a full neck mesh on the front with a clear back?
//      That's really sloppy."                                     -> 3 WRAP
//   4. "The Wyrm-Crest Helmet needs a big update - the top piece is
//      unrecognisable & also floating above the helmet, not attached."
//      (and it clashed with the huscarl's rear chainmail)          -> 4 CREST
//                                                                     and 1
//   5 PELT is new and has no recorded baseline: hair or a beard coming out
//     THROUGH a helm it is supposed to be inside of.
//
// ------------------------------------------------------------
// WHAT THIS READS, AND WHY IT IS THE MESH AND NOT THE MATHS
// ------------------------------------------------------------
//
// Every number below is taken off the triangles `buildCharacter` actually
// emits, in the head pivot's own frame. Nothing here re-derives `coifLevels`,
// `hullAt`, `helmForm` or a ring table; nothing here keeps a copy of a
// constant that lives in `characters.ts`.
//
// That is a deliberate correction to the instrument this file replaces, and
// `docs/OPEN-DEFECTS.md` names the fault it is correcting: "`helmclash`
// section 1 may read `coifLevels` WITHOUT applying their z shift, which is the
// identical fault `hullAt` was fixed for one level up". A ruler that rebuilds
// the coif from its own copy of the ring table can get the rings' `z` offset
// wrong, or their shoulder correction, or the `patch` inset — and then it is
// measuring a coif nobody wears. The mesh cannot drift from the build, because
// it IS the build. `tools/shoot.mjs` carries the same lesson about a helmet
// ladder duplicated into a harness, and `wornRing` carries it about a spy that
// could not see the largest sheet of metal on the helmet.
//
// THE PRICE OF READING THE MESH, measured rather than assumed. A tessellated
// ring cuts inside the analytic curve it was sampled from: measured on the
// huscarl's coif at the rear, the chords dip 1.19 mm inside the ring at the
// midpoint between two columns (r = 118.44 mm at az 180, 117.25 mm at az 188).
// So section 1 reads about a millimetre SHALLOWER than a ruler working off
// `coifLevels` would, and the recorded readings from the lost pass sit about a
// millimetre above these. That is the whole of the disagreement between the two
// instruments and it is in the direction the tessellation predicts. Both are
// right about their own object; this one is right about the object the player
// sees, which is why the difference is recorded here rather than tuned away.
//
// ------------------------------------------------------------
// HOW A PIECE IS IDENTIFIED, since nothing survives the merge
// ------------------------------------------------------------
//
// `Part.merge` concatenates every geometry that shares a material into one
// buffer, so a helmet arrives as three or four meshes and the bowl, the nape
// fall and the cheek guards are all inside one of them. Tags do not survive.
//
// They do not have to. `mergeGeometries` CONCATENATES indices — it never welds
// — so the index graph of the merged buffer falls apart into exactly the
// geometries that went in. One connected component of that graph is one
// `p.add` call: one bowl, one fall, one guard, one coif. That is the piece
// list this file works in, and it is recovered rather than declared.
//
// WHAT EACH PIECE IS MADE OF is decided by difference, the way
// `tools/wearmeasure.mjs` decides it: build the same head BARE, and every
// material tint on it is skin, hair, beard, eye or paint. Anything the helmed
// build adds is kit. Inside the kit, the mail is `finishKit(armorColor).mail`
// — read from the exported function rather than typed in, so a player's armour
// finish cannot blind the gate. A rung authored tomorrow with a substance
// nobody has seen is inside this instrument the day it is written.
//
// ------------------------------------------------------------
// THE RAY, AND WHY IT IS HORIZONTAL
// ------------------------------------------------------------
//
// Sections 1, 3 and 5 all ask "what is outboard of this point". The ray is
// horizontal, cast from the head's own vertical axis outward. That is not a
// convenience: the coif, the ventail and the nape fall are all swept as rings
// about that axis — `{ y, hw, hd, z }`, a half-breadth and a half-depth at a
// height — so a horizontal ray crosses them square. A ray radial from the
// skull's centre would cross the fall obliquely and read its own obliquity as
// depth, and a ray along a surface normal would read the sheet's own curvature.
//
// +Z IS THE FACE. Costly to relearn, so it is asserted at startup rather than
// trusted: the mask's silver and gilt sit at mean +73 and +88 mm z and the coif
// at -42, and `assertFaceIsPlusZ` refuses to print a single azimuth if that
// stops being true. Every azimuth in this file is degrees off dead ahead, so
// 0 is the face and 180 is the nape.
//
// ------------------------------------------------------------
// DETERMINISM
// ------------------------------------------------------------
//
// One seed, one LOD, fixed sample grids, no Math.random, no wall clock in the
// output. Two runs are byte-identical; `--twice` proves it in-process by
// running the whole battery twice and diffing the two transcripts.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".helmclash");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);

// ---------------- the build under test ----------------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts", "--outDir", ".helmclash",
  "--target", "es2022", "--module", "esnext", "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(d, e.name)) : e.name === "characters.js" && found.push(resolve(d, e.name)); };
walk(OUT);
if (!found[0]) {
  console.error("[clash] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || ""));
  process.exit(2);
}
const { buildCharacter, defaultAppearance, finishKit, HELM } = await import(pathToFileURL(found[0]).href);
const THREE = await import("three");

const CLASSES = flag("cls", "") ? flag("cls").split(",") : ["huscarl", "warden", "berserker", "runekeeper"];
const HELMS = flag("helm", "") ? flag("helm").split(",") : Object.keys(HELM).filter((h) => h !== "none");
const SECTIONS = new Set((flag("section", "1,2,3,4,5")).split(",").map(Number));
/**
 * ONE SEED, and it is the seed and not an average.
 *
 * Swept over six seeds while this was being calibrated, section 1's worst
 * reading moves by 0.1 mm on the Jarl's Crowned (13.9-14.0) and by 1.3 on the
 * Wyrm (12.6-13.9); the failing COMBINATIONS do not change on any seed. These
 * are geometry faults in constants, not in the per-warrior face traits, so a
 * mean over seeds would cost eight times the run for a number nobody argues
 * about. `--seed` moves it when somebody wants to argue about one.
 */
const SEED = Number(flag("seed", "13"));
/** `high` is what the armoury card and the portrait lens both render at. */
const LOD = "high";

// ============================================================
// The head as a list of pieces
// ============================================================

const RIG = "rig:";
const hexOf = (m) => {
  const mat = Array.isArray(m.material) ? m.material[0] : m.material;
  return mat?.color?.getHexString?.() ?? "??";
};

/**
 * Every piece worn on the head, in the head pivot's own frame, in millimetres
 * of the game's own metres.
 *
 * A "piece" is one connected component of the merged index graph — see the head
 * of this file. Returned in build order, which is `Part.merge`'s slot order and
 * then the order of the `p.add` calls inside each slot: deterministic, and the
 * same list twice for the same arguments.
 */
function headPieces(cls, helm, seed = SEED) {
  const root = buildCharacter(cls, { ...defaultAppearance(cls), helm }, 0x8a6b3f, undefined, LOD, seed).group;
  root.updateMatrixWorld(true);
  let pivot = null;
  root.traverse((o) => { if (!pivot && o.name === `${RIG}headPivot`) pivot = o; });
  if (!pivot) { console.error(`[clash] ${cls}/${helm}: no ${RIG}headPivot in the rig`); process.exit(2); }
  const inv = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
  const pieces = [];
  pivot.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const hex = hexOf(o);
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    const mw = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const P = new Float64Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mw);
      P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
    }
    // Union-find over the triangles' own vertex indices. No welding, no
    // tolerance: two `p.add` calls never share an index, so this splits the
    // buffer back into the geometries that were concatenated into it.
    const par = new Int32Array(pos.count);
    for (let i = 0; i < pos.count; i++) par[i] = i;
    const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
    const tri = [];
    for (let i = 0; i + 2 < n; i += 3) {
      const a = idx ? idx.array[i] : i, b = idx ? idx.array[i + 1] : i + 1, c = idx ? idx.array[i + 2] : i + 2;
      uni(a, b); uni(b, c);
      tri.push(a, b, c);
    }
    const groups = new Map();
    for (let i = 0; i < tri.length; i += 3) {
      const r = find(tri[i]);
      let g = groups.get(r);
      if (!g) { g = []; groups.set(r, g); }
      g.push(tri[i], tri[i + 1], tri[i + 2]);
    }
    for (const [, ts] of groups) {
      const T = new Float64Array(ts.length * 3);
      for (let i = 0; i < ts.length; i++) {
        T[i * 3] = P[ts[i] * 3]; T[i * 3 + 1] = P[ts[i] * 3 + 1]; T[i * 3 + 2] = P[ts[i] * 3 + 2];
      }
      pieces.push({ hex, T, tris: ts.length / 3, ...extent(T) });
    }
  });
  return pieces;
}

/** Centroid, bounding box and mean azimuth of a triangle soup. */
function extent(T) {
  let cx = 0, cy = 0, cz = 0, n = 0;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < T.length; i += 3) {
    cx += T[i]; cy += T[i + 1]; cz += T[i + 2]; n++;
    if (T[i] < x0) x0 = T[i]; if (T[i] > x1) x1 = T[i];
    if (T[i + 1] < y0) y0 = T[i + 1]; if (T[i + 1] > y1) y1 = T[i + 1];
    if (T[i + 2] < z0) z0 = T[i + 2]; if (T[i + 2] > z1) z1 = T[i + 2];
  }
  return { cx: cx / n, cy: cy / n, cz: cz / n, x0, x1, y0, y1, z0, z1 };
}

/**
 * Which tints are skin, hair, beard, eye or paint on this class — measured off
 * a bare head rather than listed here, so a new complexion or a new hair colour
 * cannot silently become "kit" and blind a section.
 */
const bareCache = new Map();
function bareTints(cls) {
  const k = `${cls}/${SEED}`;
  let s = bareCache.get(k);
  if (!s) { s = new Set(headPieces(cls, "none").map((p) => p.hex)); bareCache.set(k, s); }
  return s;
}

/** The mail tint this class's kit is issued in, read from the game's own kit. */
function mailTint(cls) {
  return finishKit(defaultAppearance(cls).armorColor).mail.toString(16).padStart(6, "0");
}

/** Split a head into pelt (skin, hair, beard, eye), mail and plate. */
function sortPieces(cls, helm) {
  const bare = bareTints(cls);
  const mailHex = mailTint(cls);
  const ap = defaultAppearance(cls);
  const hairHex = ap.hairColor.toString(16).padStart(6, "0");
  const beardHex = ap.beardColor.toString(16).padStart(6, "0");
  const all = headPieces(cls, helm);
  const pelt = [], mail = [], plate = [], flesh = [], fur = [];
  for (const p of all) {
    if (bare.has(p.hex)) {
      pelt.push(p);
      (p.hex === hairHex || p.hex === beardHex ? fur : flesh).push(p);
    } else if (p.hex === mailHex) mail.push(p);
    else plate.push(p);
  }
  return { all, pelt, flesh, fur, mail, plate, kit: [...mail, ...plate] };
}

/** One flat triangle array out of a list of pieces. */
function soup(list) {
  const T = new Float64Array(list.reduce((a, s) => a + s.T.length, 0));
  let o = 0;
  for (const s of list) { T.set(s.T, o); o += s.T.length; }
  return T;
}

/** Triangles that straddle a height, so a horizontal sweep is not O(whole head). */
function slabAt(T, y) {
  const out = [];
  for (let i = 0; i < T.length; i += 9) {
    const lo = Math.min(T[i + 1], T[i + 4], T[i + 7]);
    const hi = Math.max(T[i + 1], T[i + 4], T[i + 7]);
    if (lo <= y && hi >= y) for (let k = 0; k < 9; k++) out.push(T[i + k]);
  }
  return new Float64Array(out);
}

/** Möller-Trumbore. Nearest forward hit, or -1 past `cap`. */
function rayHit(T, ox, oy, oz, dx, dy, dz, cap) {
  let best = cap;
  for (let i = 0; i < T.length; i += 9) {
    const ax = T[i], ay = T[i + 1], az = T[i + 2];
    const e1x = T[i + 3] - ax, e1y = T[i + 4] - ay, e1z = T[i + 5] - az;
    const e2x = T[i + 6] - ax, e2y = T[i + 7] - ay, e2z = T[i + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-12 && det < 1e-12) continue;
    const inv = 1 / det;
    const tx = ox - ax, ty = oy - ay, tz = oz - az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > 1e-6 && t < best) best = t;
  }
  return best < cap ? best : -1;
}

/**
 * The sample grid inside one triangle, in barycentric coordinates.
 *
 * N = 4 is where the readings stop moving: raised to 8 the deepest reading in
 * section 1 moves 0.0 mm on the Jarl's Crowned and 0.6 on the Wyrm, at three
 * times the run. Centroids alone under-read by 1 to 3 mm, because the deepest
 * point of a plate under mail is at a corner of a row and not in the middle
 * of it.
 */
const BARY = [];
{
  const N = 4;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N - i; j++) BARY.push([i / N, j / N, (N - i - j) / N]);
}
function samples(T, i, out) {
  let k = 0;
  for (const [a, b, c] of BARY) {
    out[k++] = T[i] * a + T[i + 3] * b + T[i + 6] * c;
    out[k++] = T[i + 1] * a + T[i + 4] * b + T[i + 7] * c;
    out[k++] = T[i + 2] * a + T[i + 5] * b + T[i + 8] * c;
  }
  return k / 3;
}

const mm = (m) => (m * 1000).toFixed(1);
const azOf = (x, z) => {
  const d = Math.atan2(x, z) * 180 / Math.PI;
  return d < 0 ? d + 360 : d;
};
const at = (p) => `[az ${azOf(p[0], p[2]).toFixed(0)}deg, y ${mm(p[1])} mm]`;

// ============================================================
// +Z IS THE FACE — asserted, not assumed
// ============================================================
//
// Every azimuth this file prints is meaningless if this is the other way round,
// and it has been got the other way round before. The Sutton Hoo is the one
// helmet with a face plate AND a coif, so the two means it produces are the
// cheapest possible statement of which way the man is looking.
function assertFaceIsPlusZ() {
  const { plate, mail } = sortPieces("huscarl", "suttonhoo");
  const meanZ = (list) => {
    let s = 0, n = 0;
    for (const p of list) for (let i = 2; i < p.T.length; i += 3) { s += p.T[i]; n++; }
    return n ? s / n : 0;
  };
  // The mask's own silver: the plate pieces in front of the ears.
  const face = plate.filter((p) => p.cz > 0.02);
  const fz = meanZ(face), cz = meanZ(mail);
  console.log(`[clash] frame check: mask metal at mean z ${mm(fz)} mm, mail at mean z ${mm(cz)} mm`);
  if (!(fz > 0 && cz < 0 && fz - cz > 0.05)) {
    console.error("[clash] +Z IS NOT THE FACE on this build. Every azimuth below would be a lie. Stopping.");
    process.exit(2);
  }
  console.log("[clash] +z is the face, -z is the nape. Azimuth 0 is dead ahead.");
}

// ============================================================
// 1. LAYERS — a plate driven through the mail
// ============================================================
//
// A helmet is worn OVER a mail coif. If a plate's surface has mail outboard of
// it, the plate has been driven inside the bag of rings it is supposed to sit
// on, and what draws is iron and mail fighting for the same pixels — the
// owner's "the Sutton Hoo helmet on huscarl currently clashes with the mesh".
//
// MEASURED. Sample every plate triangle; from each sample cast a horizontal ray
// straight out from the head's axis. If the ray leaves the plate's own shell
// (so this is the plate's OUTWARD face and not its lining) and then meets mail,
// the plate is buried, and how far it is buried is how far the ray ran before
// it found the rings.
//
// TWO NUMBERS PER PIECE, because they are two different faults. The DEPTH says
// how badly one point is wrong; the CLASH FRACTION says how much of the piece
// is under there. A nape fall 40% buried at 7 mm is a different repair from a
// crown hoop 11% buried at 14 mm — the first is the fall's radius, the second
// is one ring's height.
const LAYER_MM = 5.0;
/**
 * 5 mm, and it is the file's own number rather than one invented here.
 * `buildCharacter` declares `LAYER_GAP = 0.005` — "what one layer leaves clear
 * under the inner wall of the layer above it" — with the reason written beside
 * it: both surfaces are tessellated and a garment's chord dips up to 3 mm
 * inside the analytic curve, so a gap that only covers the mathematics is not a
 * gap. A plate more than that far the WRONG side of the mail is not a rounding
 * error. Nothing measured here is anywhere near the bar: the eleven failures
 * run 10.7 to 14.5 mm and there is no reading between 0 and 10.7.
 */
function sectionLayers(rows) {
  console.log("");
  console.log("[clash] 1. LAYERS — a plate driven through the mail.");
  console.log("[clash]    horizontal rays out of the head's axis; bar " + LAYER_MM.toFixed(1) + " mm (the build's own LAYER_GAP).");
  console.log("");
  console.log("[clash] class       helm         mail?   depth mm   clash%   deepest piece            where");
  console.log("[clash] ---------------------------------------------------------------------------------------------");
  let fails = 0, cases = 0, absent = 0;
  for (const cls of CLASSES) {
    for (const helm of HELMS) {
      const { mail, plate } = sortPieces(cls, helm);
      if (!mail.length) {
        // A GATE GREEN BECAUSE THE CASE IS ABSENT IS NOT A GATE. This head wears
        // no mail, so there is nothing for a plate to be driven through, and
        // this line is not a pass — it is a line saying the question does not
        // arise here.
        absent++;
        console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} none    —          —        (no mail on this head — nothing to measure)`);
        continue;
      }
      cases++;
      const mailT = soup(mail);
      let worst = 0, wp = null, wat = null;
      let bestFrac = 0, bf = null;
      const buf = new Float64Array(BARY.length * 3);
      for (const p of plate) {
        let n = 0, k = 0;
        for (let i = 0; i < p.T.length; i += 9) {
          const c = samples(p.T, i, buf);
          for (let s = 0; s < c; s++) {
            const x = buf[s * 3], y = buf[s * 3 + 1], z = buf[s * 3 + 2];
            const r = Math.hypot(x, z);
            if (r < 1e-6) continue;
            const dx = x / r, dz = z / r;
            const m = rayHit(mailT, x, y, z, dx, 0, dz, 0.12);
            if (m < 0) { n++; continue; }
            // The plate's own shell in the way means this sample is on the
            // lining, not on the outward face; the outward face is measured
            // instead and counting both would double the denominator.
            const self = rayHit(p.T, x, y, z, dx, 0, dz, 0.12);
            if (self >= 0 && self < m) continue;
            n++; k++;
            if (m > worst) { worst = m; wp = p; wat = [x, y, z]; }
          }
        }
        // Pieces smaller than a rivet have a meaningless fraction.
        if (n >= 40 && k / n > bestFrac) { bestFrac = k / n; bf = p; }
      }
      const bad = worst * 1000 > LAYER_MM;
      if (bad) fails++;
      const where = wat ? at(wat) : "";
      console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} yes    ${mm(worst).padStart(7)}   ${(100 * bestFrac).toFixed(1).padStart(6)}   ${(wp ? `${wp.hex} (${wp.tris} tri)` : "-").padEnd(22)} ${where}${bad ? "  FAIL" : ""}`);
      rows.push({ section: 1, cls, helm, fail: bad, depth: worst, frac: bestFrac });
      if (bad && bf) {
        console.log(`[clash]             ^ worst-buried piece ${bf.hex} (${bf.tris} tri), ${(100 * bestFrac).toFixed(1)}% of its outward face is inboard of the rings`);
      }
    }
  }
  console.log("");
  console.log(`[clash]    ${fails} of ${cases} combinations that HAVE mail are red; ${absent} more have no mail and are not a case.`);
  return fails;
}

// ============================================================
// 2. FLESH — flesh outside a helm that is supposed to be a mask
// ============================================================
//
// "On the remaining classes (warden etc.) the ears stick out." A mask is the
// one helm in the shop that covers the whole face, so on a masked helm any
// flesh that shows OUTSIDE the helmet's own outline is either an ear the plate
// has missed or a neck the mail has missed.
//
// MEASURED as a picture, because "outside the outline" is a picture's question.
// The head is rasterised orthographically from 36 bearings with a depth buffer;
// a pixel counts against the helm when the nearest thing at it is skin AND no
// helm surface lies anywhere along that pixel's line of sight. Skin seen
// THROUGH an eye opening has metal in front of it and behind it and is not
// counted — an aperture frames a feature, which is the whole point of an
// aperture, and `wearmeasure` §10 records what happens to an instrument that
// cannot tell the two apart.
//
// The share is of the head's own footprint, so a small head and a large one
// answer on the same scale.
const FLESH_PCT = 1.0;
const RASTER = 128;
function sectionFlesh(rows) {
  console.log("");
  console.log("[clash] 2. FLESH — skin outside the outline of a helm with a face plate.");
  console.log(`[clash]    36 bearings x ${RASTER}x${RASTER} depth-buffered; bar ${FLESH_PCT.toFixed(1)}% of the head's footprint.`);
  console.log("");
  console.log("[clash] class       helm         flesh out%   worst bearing        where it is");
  console.log("[clash] ---------------------------------------------------------------------------------");
  let fails = 0, cases = 0, absent = 0;
  for (const cls of CLASSES) {
    for (const helm of HELMS) {
      if (!HELM[helm].mask) { absent++; continue; }
      cases++;
      const { flesh, fur, kit } = sortPieces(cls, helm);
      const F = soup(flesh), K = soup(kit), U = soup(fur);
      let tot = 0, out = 0, worstB = null, worstP = 0, worstWhere = null;
      for (let b = 0; b < 36; b++) {
        const az = (b % 12) / 12 * Math.PI * 2;
        const el = [-0.35, 0, 0.30][Math.floor(b / 12)];
        const r = raster(az, el, [F, U, K], RASTER);
        // 0 flesh, 1 fur, 2 kit
        let px = 0, bad = 0, sx = 0, sy = 0;
        for (let i = 0; i < r.who.length; i++) {
          if (r.who[i] < 0) continue;
          px++;
          if (r.who[i] === 0 && !r.behind[i]) { bad++; sx += i % RASTER; sy += Math.floor(i / RASTER); }
        }
        tot += px; out += bad;
        const p = px ? bad / px : 0;
        if (p > worstP) {
          worstP = p; worstB = [az, el];
          worstWhere = bad ? r.unproject(sx / bad, sy / bad) : null;
        }
      }
      const pct = tot ? 100 * out / tot : 0;
      const bad = pct > FLESH_PCT;
      if (bad) fails++;
      const bearing = worstB ? `az ${(worstB[0] * 180 / Math.PI).toFixed(0)}deg el ${(worstB[1] * 180 / Math.PI).toFixed(0)}deg` : "-";
      console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} ${pct.toFixed(2).padStart(9)}   ${bearing.padEnd(20)} ${worstWhere ? at(worstWhere) : ""}${bad ? "  FAIL" : ""}`);
      rows.push({ section: 2, cls, helm, fail: bad, pct });
    }
  }
  console.log("");
  console.log(`[clash]    ${fails} of ${cases} masked combinations are red; ${absent} open-faced combinations are not a case for this section.`);
  return fails;
}

/**
 * Orthographic depth buffer over a head, from one bearing.
 *
 * `who[i]` is the index of the group that won the pixel, or -1 for sky.
 * `behind[i]` says whether the LAST group in the list — the kit — is anywhere
 * along that pixel, at any depth. That flag is what separates an ear standing
 * outside a mask from an eye seen through its own opening, and it is the same
 * distinction `wearmeasure` §10 had to invent a sight-line classifier for.
 *
 * The frame is sized off the head's own extent so the picture is the same size
 * whatever is bolted on top of the cap; a 100 mm crest zooming the frame out
 * would shrink a 20 mm ear to two pixels.
 */
function raster(az, el, groups, N) {
  const f = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  const up0 = new THREE.Vector3(0, 1, 0);
  const rt = new THREE.Vector3().crossVectors(up0, f).normalize();
  const up = new THREE.Vector3().crossVectors(f, rt).normalize();
  // Extent off group 0 — the skin — for the reason in the doc comment.
  let cx = 0, cy = 0, cz = 0, n = 0;
  const g0 = groups[0];
  for (let i = 0; i < g0.length; i += 3) { cx += g0[i]; cy += g0[i + 1]; cz += g0[i + 2]; n++; }
  cx /= n; cy /= n; cz /= n;
  let rad = 0;
  for (let i = 0; i < g0.length; i += 3) {
    rad = Math.max(rad, Math.hypot(g0[i] - cx, g0[i + 1] - cy, g0[i + 2] - cz));
  }
  const half = rad * 1.06;
  const depth = new Float64Array(N * N).fill(Infinity);
  const who = new Int8Array(N * N).fill(-1);
  const behind = new Uint8Array(N * N);
  const last = groups.length - 1;
  for (let g = 0; g < groups.length; g++) {
    const T = groups[g];
    for (let i = 0; i < T.length; i += 9) {
      const px = [], py = [], pd = [];
      for (let k = 0; k < 3; k++) {
        const x = T[i + k * 3] - cx, y = T[i + k * 3 + 1] - cy, z = T[i + k * 3 + 2] - cz;
        px.push((x * rt.x + y * rt.y + z * rt.z) / half);
        py.push((x * up.x + y * up.y + z * up.z) / half);
        pd.push(-(x * f.x + y * f.y + z * f.z));
      }
      const sx = px.map((v) => (v * 0.5 + 0.5) * (N - 1));
      const sy = py.map((v) => (0.5 - v * 0.5) * (N - 1));
      const x0 = Math.max(0, Math.floor(Math.min(...sx))), x1 = Math.min(N - 1, Math.ceil(Math.max(...sx)));
      const y0 = Math.max(0, Math.floor(Math.min(...sy))), y1 = Math.min(N - 1, Math.ceil(Math.max(...sy)));
      const d = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0]);
      if (Math.abs(d) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const w1 = ((x - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (y - sy[0])) / d;
          const w2 = ((sx[1] - sx[0]) * (y - sy[0]) - (x - sx[0]) * (sy[1] - sy[0])) / d;
          const w0 = 1 - w1 - w2;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = pd[0] * w0 + pd[1] * w1 + pd[2] * w2;
          const k = y * N + x;
          if (g === last) behind[k] = 1;
          if (z < depth[k]) { depth[k] = z; who[k] = g; }
        }
      }
    }
  }
  const unproject = (x, y) => {
    const u = (x / (N - 1) * 2 - 1) * half, v = (1 - y / (N - 1) * 2) * half;
    return [cx + rt.x * u + up.x * v, cy + rt.y * u + up.y * v, cz + rt.z * u + up.z * v];
  };
  return { who, behind, unproject };
}

// ============================================================
// 3. WRAP — a bare nape under a covered throat
// ============================================================
//
// "There's a full neck mesh on the front with a clear back? That's really
// sloppy." A neck defence that wraps the throat and stops at the ears is not a
// neck defence, it is a bib — and from behind the man is bare.
//
// MEASURED on horizontal slices of the NECK. At each height the sweep asks, for
// every half-degree of azimuth, what the outermost surface is: kit, or skin and
// hair. A height is a case only if the THROAT is genuinely wrapped — at least
// `THROAT_DEG` of continuous cover centred on dead ahead — because a nasal bar
// covers eight degrees of the front of a face and is not a neck defence, and an
// instrument that counted it would fail every open helm in the shop for having
// a nose.
//
// The fault is then the widest continuous BARE arc, and it is reported with the
// radius the flesh sits at across that arc, because degrees alone do not say
// how much neck is showing: 150 degrees on a 30 mm throat and on a 90 mm one
// are different amounts of sloppiness.
const WRAP_DEG = 90;
const THROAT_DEG = 100;
const WRAP_STEP = 0.5;
function sectionWrap(rows) {
  console.log("");
  console.log("[clash] 3. WRAP — a bare nape under a covered throat.");
  console.log(`[clash]    ${WRAP_STEP} deg sweeps every mm of neck; a case needs ${THROAT_DEG} deg of throat covered, a fault ${WRAP_DEG} deg bare behind.`);
  console.log("");
  console.log("[clash] class       helm         bare arc     at radius   height   centred      throat cover");
  console.log("[clash] ---------------------------------------------------------------------------------------");
  let fails = 0, cases = 0, quiet = 0;
  const M = Math.round(360 / WRAP_STEP);
  for (const cls of CLASSES) {
    for (const helm of HELMS) {
      const { pelt, kit } = sortPieces(cls, helm);
      const PT = soup(pelt), KT = soup(kit);
      let best = null;
      for (let ymm = 10; ymm <= 175; ymm++) {
        const y = ymm / 1000;
        const P = slabAt(PT, y), K = slabAt(KT, y);
        if (!P.length) continue;
        const flags = new Int8Array(M);
        const rad = new Float64Array(M);
        for (let i = 0; i < M; i++) {
          const t = i * WRAP_STEP * Math.PI / 180;
          const dx = Math.sin(t), dz = Math.cos(t);
          const f = rayHit(P, 0, y, 0, dx, 0, dz, 0.40);
          const g = rayHit(K, 0, y, 0, dx, 0, dz, 0.40);
          flags[i] = (f < 0 && g < 0) ? 0 : (g > f ? 1 : -1);
          rad[i] = f;
        }
        // How much of the front is actually wrapped: the covered run through
        // dead ahead, not the total covered anywhere.
        if (flags[0] !== 1) continue;
        let fwd = 1;
        for (let k = 1; k < M && flags[k] === 1; k++) fwd++;
        for (let k = 1; k < M && flags[(M - k) % M] === 1; k++) fwd++;
        if (fwd * WRAP_STEP < THROAT_DEG) continue;
        let w = 0, wat = 0;
        for (let s = 0; s < M; s++) {
          if (flags[s] !== -1) continue;
          let n = 0;
          while (n < M && flags[(s + n) % M] === -1) n++;
          if (n > w) { w = n; wat = s; }
        }
        if (!w) continue;
        let rs = 0, rn = 0;
        for (let k = 0; k < w; k++) { const r = rad[(wat + k) % M]; if (r > 0) { rs += r; rn++; } }
        const rec = { ymm, deg: w * WRAP_STEP, az: ((wat + w / 2) % M) * WRAP_STEP, r: rn ? rs / rn : 0, fwd: fwd * WRAP_STEP };
        if (!best || rec.deg > best.deg) best = rec;
      }
      if (!best) {
        // No height on this head has a wrapped throat at all, so there is no
        // nape for it to be missing behind. Not a pass — not a case.
        quiet++;
        continue;
      }
      cases++;
      const bad = best.deg >= WRAP_DEG;
      if (bad) fails++;
      console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} ${best.deg.toFixed(1).padStart(6)} deg   ${mm(best.r).padStart(6)} mm   y ${String(best.ymm).padStart(3)}   az ${best.az.toFixed(0).padStart(3)}deg      ${best.fwd.toFixed(1)} deg${bad ? "   FAIL" : ""}`);
      rows.push({ section: 3, cls, helm, fail: bad, deg: best.deg, r: best.r });
    }
  }
  console.log("");
  console.log(`[clash]    ${fails} of ${cases} combinations with a wrapped throat are red; ${quiet} never wrap a throat and are not a case.`);
  return fails;
}

// ============================================================
// 4. CREST — daylight under a piece sitting on the cap
// ============================================================
//
// "The top piece is unrecognisable & also floating above the helmet, not
// attached." A crest, a comb, a boar or a serpent is riveted THROUGH the cap.
// It may arch — the Wyrm is supposed to arch — but the arch has to land, and
// what says "not attached" is a piece whose whole footprint has sky under it.
//
// MEASURED straight down. For every fitting on the helmet, take the samples on
// its UNDERSIDE — the ones with none of their own piece below them — and drop a
// vertical ray. A sample that lands on another piece of the same helmet is a
// sample sitting over the cap, and the distance is the daylight. A sample that
// lands on nothing is beside the head, not over it, and says nothing here.
//
// Reported with the piece's own height at that column, because the two together
// are the shape of the fault: at the worst column the Wyrm has 43 mm of air
// under 2 mm of serpent, which is a tube grazing past the cap with nothing
// under it at all.
const CREST_MM = 24.0;
/**
 * 24 mm. Every fitting in the shop that lands measures under 21: the Ridge
 * Helm's comb, the Boar-Crest's animal, the Jarl's hoop and the Sutton Hoo's
 * crest all sit within a rivet's length of the cap. The Wyrm measures 43. The
 * bar is in the gap and not against either side of it, so it is not a number
 * cut to today's geometry — and the Wyrm's own author asks for 46 mm of rise,
 * so this section is disagreeing with an intention rather than finding a typo.
 * That is the argument the owner made with a photograph.
 */
function sectionCrest(rows) {
  console.log("");
  console.log("[clash] 4. CREST — daylight under a piece sitting on the cap.");
  console.log(`[clash]    vertical drops off every fitting's underside; bar ${CREST_MM.toFixed(1)} mm of air.`);
  console.log("");
  console.log("[clash] class       helm         air mm   piece height   piece                where");
  console.log("[clash] ---------------------------------------------------------------------------------------");
  let fails = 0, cases = 0;
  const buf = new Float64Array(BARY.length * 3);
  for (const cls of CLASSES) {
    for (const helm of HELMS) {
      const { kit } = sortPieces(cls, helm);
      if (kit.length < 2) continue;
      cases++;
      let air = 0, wp = null, wat = null, peak = 0;
      for (const p of kit) {
        if (p.tris < 12) continue;
        const rest = soup(kit.filter((q) => q !== p));
        for (let i = 0; i < p.T.length; i += 9) {
          const c = samples(p.T, i, buf);
          for (let s = 0; s < c; s++) {
            const x = buf[s * 3], y = buf[s * 3 + 1], z = buf[s * 3 + 2];
            // Underside only: nothing of this piece below this sample.
            if (rayHit(p.T, x, y, z, 0, -1, 0, 0.40) >= 0) continue;
            const d = rayHit(rest, x, y, z, 0, -1, 0, 0.40);
            if (d < 0) continue;
            if (d > air) {
              air = d; wp = p; wat = [x, y, z];
              const up = rayHit(p.T, x, y + 0.0005, z, 0, 1, 0, 0.40);
              peak = up > 0 ? up + 0.0005 : 0.0005;
            }
          }
        }
      }
      const bad = air * 1000 > CREST_MM;
      if (bad) fails++;
      console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} ${mm(air).padStart(6)}   ${mm(peak).padStart(12)}   ${(wp ? `${wp.hex} (${wp.tris} tri)` : "-").padEnd(20)} ${wat ? at(wat) : ""}${bad ? "  FAIL" : ""}`);
      rows.push({ section: 4, cls, helm, fail: bad, air });
    }
  }
  console.log("");
  console.log(`[clash]    ${fails} of ${cases} combinations with more than one piece are red.`);
  return fails;
}

// ============================================================
// 5. PELT — hair or a beard out through a helm it is inside of
// ============================================================
//
// NEW THIS PASS, AND IT HAS NO RECORDED BASELINE. It exists because the last
// two passes both stumbled over the same thing and neither could measure it:
// "a beard hanging out from under the mask that this work UNCOVERED rather than
// caused", and a round-four fixer that answered a beard through a face plate by
// deleting three paid beards outright — Full Beard 40g, Forked Beard 80g,
// Ringed Braid 120g — and did not even pass.
//
// So this section is written to see a beard that is OUTSIDE a face mask, and to
// keep on seeing it if somebody makes the beard vanish instead of pressing it
// inside the plate. THE DENOMINATOR IS THE PELT'S OWN SURFACE, which means a
// deleted beard scores zero out of zero and is printed as an absent case, not
// as a pass. `NO PELT AT ALL` is louder than a failure here, and deliberately.
//
// MEASURED with the same horizontal ray as section 1, pointed the other way. A
// hair or beard sample is out through the helm when the ray INWARD, toward the
// head's axis, leaves its own mesh and then meets kit: that puts metal or mail
// between this piece of hair and the skull, which is the definition of hair on
// the wrong side of a helmet. Hair coming out from UNDER a hem passes, because
// at its own height there is no metal inboard of it — which is exactly the
// route `cheekHem` and the coif's hem were built to give it.
const PELT_PCT = 2.0;
function sectionPelt(rows) {
  console.log("");
  console.log("[clash] 5. PELT — hair or beard out through the helm, not under its hem.");
  console.log(`[clash]    inward horizontal rays off every hair and beard triangle; bar ${PELT_PCT.toFixed(1)}% of the pelt's surface.`);
  console.log("");
  console.log("[clash] class       helm         pelt out%   worst piece            where");
  console.log("[clash] ---------------------------------------------------------------------------------------");
  let fails = 0, cases = 0, gone = 0;
  const buf = new Float64Array(BARY.length * 3);
  for (const cls of CLASSES) {
    for (const helm of HELMS) {
      const { fur, kit } = sortPieces(cls, helm);
      if (!kit.length) continue;
      if (!fur.length) {
        gone++;
        console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)}      —      NO PELT AT ALL — this head has no hair or beard mesh to measure`);
        rows.push({ section: 5, cls, helm, fail: false, absent: true });
        continue;
      }
      cases++;
      const kitT = soup(kit);
      let n = 0, k = 0, worstP = 0, wp = null, wat = null;
      for (const p of fur) {
        let pn = 0, pk = 0;
        for (let i = 0; i < p.T.length; i += 9) {
          const c = samples(p.T, i, buf);
          for (let s = 0; s < c; s++) {
            const x = buf[s * 3], y = buf[s * 3 + 1], z = buf[s * 3 + 2];
            const r = Math.hypot(x, z);
            if (r < 1e-6) continue;
            const dx = -x / r, dz = -z / r;
            pn++;
            const g = rayHit(kitT, x, y, z, dx, 0, dz, 0.20);
            if (g < 0) continue;
            const self = rayHit(p.T, x, y, z, dx, 0, dz, 0.20);
            if (self >= 0 && self < g) continue;
            pk++;
            if (!wat) wat = [x, y, z];
          }
        }
        n += pn; k += pk;
        if (pn >= 40 && pk / pn > worstP) { worstP = pk / pn; wp = p; }
      }
      const pct = n ? 100 * k / n : 0;
      const bad = pct > PELT_PCT;
      if (bad) fails++;
      console.log(`[clash] ${cls.padEnd(11)} ${helm.padEnd(12)} ${pct.toFixed(2).padStart(9)}   ${(wp ? `${wp.hex} (${wp.tris} tri) ${(100 * worstP).toFixed(1)}%` : "-").padEnd(22)} ${wat ? at(wat) : ""}${bad ? "  FAIL" : ""}`);
      rows.push({ section: 5, cls, helm, fail: bad, pct });
    }
  }
  console.log("");
  console.log(`[clash]    ${fails} of ${cases} combinations with a pelt are red; ${gone} have NO hair or beard mesh at all.`);
  return fails;
}

// ============================================================
// The run
// ============================================================
function battery() {
  const rows = [];
  const fails = {};
  assertFaceIsPlusZ();
  if (SECTIONS.has(1)) fails[1] = sectionLayers(rows);
  if (SECTIONS.has(2)) fails[2] = sectionFlesh(rows);
  if (SECTIONS.has(3)) fails[3] = sectionWrap(rows);
  if (SECTIONS.has(4)) fails[4] = sectionCrest(rows);
  if (SECTIONS.has(5)) fails[5] = sectionPelt(rows);
  const names = { 1: "LAYERS", 2: "FLESH", 3: "WRAP", 4: "CREST", 5: "PELT" };
  console.log("");
  console.log("[clash] ============================================================");
  let red = 0;
  for (const s of [1, 2, 3, 4, 5]) {
    if (!(s in fails)) continue;
    if (fails[s]) red++;
    console.log(`[clash] ${s} ${names[s].padEnd(7)} ${fails[s] ? `FAIL — ${fails[s]} combination(s)` : "pass"}`);
  }
  console.log(`[clash] ${red === 0 ? "ALL SECTIONS PASS" : `${red} of ${Object.keys(fails).length} sections RED`}`);
  console.log(`[clash] seed ${SEED}, lod ${LOD}, ${CLASSES.length} classes x ${HELMS.length} helms, read off the built mesh.`);
  console.log("[clash] ============================================================");
  return { rows, fails };
}

if (has("twice")) {
  // Determinism, proved rather than claimed. Two full runs in one process,
  // captured and compared character for character.
  const cap = [];
  const real = console.log;
  console.log = (...a) => cap.push(a.join(" "));
  battery();
  const first = cap.splice(0).join("\n");
  battery();
  const second = cap.join("\n");
  console.log = real;
  console.log(first);
  console.log("");
  if (first === second) console.log(`[clash] --twice: two runs, ${first.length} characters, BYTE-IDENTICAL.`);
  else {
    const lines1 = first.split("\n"), lines2 = second.split("\n");
    const i = lines1.findIndex((l, k) => l !== lines2[k]);
    console.log(`[clash] --twice: NOT DETERMINISTIC. First difference at line ${i + 1}:`);
    console.log(`[clash]   run 1: ${lines1[i]}`);
    console.log(`[clash]   run 2: ${lines2[i]}`);
    process.exit(1);
  }
} else {
  const { fails } = battery();
  process.exitCode = Object.values(fails).some((n) => n > 0) ? 1 : 0;
}
