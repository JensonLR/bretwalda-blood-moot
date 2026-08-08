#!/usr/bin/env node
// ============================================================
// EYECLIP — the LID GATE. Is anything in front of the iris?
//
//   node tools/eyeclip.mjs
//   node tools/eyeclip.mjs --seeds 8 --dump art/look/eyeclip
//
// "the pupils overlap the upper eyelids slightly."
//
// Every ratio in `headmeasure`, every silhouette assertion and all eight gaze
// bars passed on the build the owner said that about, and none of them is a
// slack tolerance. `gazeProbe` asks WHERE the iris points, and on that build the
// answer was right to a hundredth of a degree. This asks WHAT IS IN FRONT OF IT.
//
// No measurement of one surface can answer that. An iris radius is 6.1 mm
// whether the lid covers it or not; a lid margin sits where it sits whether the
// iris pokes through or not. Occlusion is a relationship between two surfaces
// and a camera, so it takes two surfaces and a camera — which is why this file
// exists rather than another row in `headmeasure`'s tables.
//
// WHAT IT MEASURES
//
// `eyeClipProbe` hands back the eye's own EMITTED TRIANGLES kept apart by role
// — the coloured disc (iris + limbal ring + pupil) and the lids — plus the lid
// margin re-sampled from `lidMarginPoint`, the identical function `lidPatch`
// builds the lid from. This stands the armoury's portrait camera off the face
// (the same lens `facelook` and `/shot` use, at 2.05 m), projects the margin,
// and for every vertex of the coloured disc asks two questions:
//
//   is it ABOVE the upper lid margin in the image?   and   is it VISIBLE?
//
// A vertex that is both is a pixel of iris drawn over the eyelid, which is the
// defect, in the place the owner looks at it from.
//
// WHAT IT REFUSES TO COUNT
//
// Only the lids occlude. The brow ridge, the hair and the helm are left out on
// purpose, and that is the difference between a gate and a coincidence: an iris
// hidden behind a brow at the portrait bearing is an iris on show the moment the
// head turns, and covering the top of the iris is the UPPER LID's job in every
// frame of the game. A ruler that accepts the brow's help would have passed the
// straight-bridge lid on half the seeds.
//
// AND THE TRAP IT IS BUILT AGAINST
//
// There is a way to pass `visAbove` that ruins the face: shrink the iris. The
// comments around `GLOBE` and the palpebral-fissure block record what a small
// iris in a wide aperture costs — it is the doll's stare they spent passes
// removing. So `irisAcross` is barred from both sides, and `discOverMm` (how far
// the disc reaches past the aperture with occlusion ignored) has to stay
// POSITIVE somewhere in the population. A build that passes by making the disc
// small fails those two, and a build that passes by covering the disc does not.
// ============================================================
import { spawnSync } from "child_process";
import { rmSync, mkdirSync, existsSync, readdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { deflateSync } from "zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".eyeclip");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SEEDS = parseInt(flag("seeds", "8"), 10);
const DUMP = flag("dump", null);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts",
  "--outDir", ".eyeclip", "--target", "es2022", "--module", "esnext",
  "--moduleResolution", "bundler", "--skipLibCheck"],
{ cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(dir, e.name)) : e.name === "characters.js" && found.push(resolve(dir, e.name)); };
if (existsSync(OUT)) walk(OUT);
const built = found[0] ?? resolve(OUT, "characters.js");
if (!existsSync(built)) {
  console.error("[eye] tsc emitted nothing:\n" + (tsc.stdout || "") + (tsc.stderr || ""));
  process.exit(2);
}
const { eyeClipProbe } = await import(pathToFileURL(built).href);

const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];

// ---- the armoury's portrait lens, copied from `facelook`, which copied it from
// `/shot`. `turn = 0`, i.e. the man facing the camera, because that is the frame
// the complaint was made about and the frame the shop shows first.
const LENS = { w: 560, h: 690, dist: 2.05, targetY: 1.76, eyeY: 1.94, fov: 19.5, aim: { right: -0.068, fwd: 0.045 } };
const TURN = 0;

// ---- small vector helpers. Three is not imported here on purpose: everything
// below is arithmetic on nine numbers at a time, and a dependency in a ruler is
// one more thing that can be wrong.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mul(a, 1 / (len(a) || 1));

/** Column-major 4x4 (three's `toArray`) applied to a point. */
const xform = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
const mmul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
};
const rotY = (t) => { const c = Math.cos(t), s = Math.sin(t);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };

/** The same framing `facelook` builds, so this camera and that picture agree. */
function camera(lens, turnDeg) {
  const rot = Math.PI + (turnDeg * Math.PI) / 180;
  const sn = Math.sin(rot), cs = Math.cos(rot);
  const x = lens.aim.right * cs + lens.aim.fwd * sn;
  const z = -lens.aim.right * sn + lens.aim.fwd * cs;
  const eye = [x, lens.eyeY, z - lens.dist];
  const target = [x, lens.targetY, z];
  const fwd = norm(sub(target, eye));
  const side = norm([-fwd[2], 0, fwd[0]]);
  const up = cross(side, fwd);
  const tanH = Math.tan((lens.fov * Math.PI) / 360);
  const aspect = lens.w / lens.h;
  return {
    eye, fwd, side, up, tanH, aspect, W: lens.w, H: lens.h,
    /** Pixel position and camera-space depth. */
    project(p) {
      const d = sub(p, eye);
      const cz = dot(d, fwd);
      return {
        x: (dot(d, side) / (cz * tanH * aspect)) * 0.5 * lens.w + lens.w * 0.5,
        y: lens.h * 0.5 - (dot(d, up) / (cz * tanH)) * 0.5 * lens.h,
        z: cz,
      };
    },
    /** Millimetres one pixel of image height covers at depth `cz`. */
    mmPerPx(cz) { return (2 * tanH * cz / lens.h) * 1000; },
  };
}

/**
 * Möller–Trumbore, returning the ray parameter or null.
 *
 * Rays here run from the camera to a sample point and are NOT normalised, so
 * `t < 1` means "the triangle is in front of the sample" and nothing else has to
 * be converted into metres to say whether something is hidden.
 */
function hit(orig, dir, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const e1 = [bx - ax, by - ay, bz - az];
  const e2 = [cx - ax, cy - ay, cz - az];
  const p = cross(dir, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-14) return null;
  const inv = 1 / det;
  const tv = [orig[0] - ax, orig[1] - ay, orig[2] - az];
  const u = dot(tv, p) * inv;
  if (u < -1e-7 || u > 1 + 1e-7) return null;
  const q = cross(tv, e1);
  const v = dot(dir, q) * inv;
  if (v < -1e-7 || u + v > 1 + 1e-7) return null;
  return dot(e2, q) * inv;
}

/**
 * How far in FRONT of `p` the nearest occluder sits along the camera ray, in
 * metres — or −1 if nothing is in front of it and the point is on show.
 *
 * A distance rather than a boolean because "covered" and "covered by a tenth of
 * a millimetre" are different claims: two surfaces that graze each other pass
 * any ray test and z-fight in the actual renderer, where depth is quantised.
 */
function frontGap(cam, p, soups) {
  const dir = sub(p, cam.eye);
  const throwLen = len(dir);
  let best = -1;
  for (const s of soups) {
    for (let i = 0; i < s.length; i += 9) {
      const t = hit(cam.eye, dir,
        s[i], s[i + 1], s[i + 2], s[i + 3], s[i + 4], s[i + 5], s[i + 6], s[i + 7], s[i + 8]);
      // t is in units of the camera-to-sample vector, so t < 1 is "in front".
      if (t === null || t <= 1e-4 || t >= 1) continue;
      const gap = (1 - t) * throwLen;
      if (gap > best) best = gap;
    }
  }
  return best;
}

/** Distinct vertices of a triangle soup — a vertex shared by six faces is one point. */
function verticesOf(soup) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < soup.length; i += 3) {
    const k = `${Math.round(soup[i] * 1e7)},${Math.round(soup[i + 1] * 1e7)},${Math.round(soup[i + 2] * 1e7)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push([soup[i], soup[i + 1], soup[i + 2]]);
  }
  return out;
}

/**
 * Points spread over the FACES of a soup, not just its corners.
 *
 * The iris rim carries ten vertices. Ten points is enough to notice a disc
 * sticking out by five millimetres and nowhere near enough to certify that it
 * has stopped: the surface between two vertices is a flat chord the rasteriser
 * fills in, and "no iris PIXEL above the lid" is a claim about that fill. So
 * every triangle is sampled on a barycentric lattice, which is the same set of
 * points the renderer shades.
 */
function faceSamples(soup, keep, res = 4) {
  const out = [];
  for (let i = 0; i < soup.length; i += 9) {
    const a = [soup[i], soup[i + 1], soup[i + 2]];
    const b = [soup[i + 3], soup[i + 4], soup[i + 5]];
    const c = [soup[i + 6], soup[i + 7], soup[i + 8]];
    if (!keep(a) || !keep(b) || !keep(c)) continue;
    for (let j = 0; j <= res; j++) for (let k = 0; k + j <= res; k++) {
      const u = j / res, v = k / res, w = 1 - u - v;
      out.push([a[0] * w + b[0] * u + c[0] * v, a[1] * w + b[1] * u + c[1] * v, a[2] * w + b[2] * u + c[2] * v]);
    }
  }
  return out;
}

/** Squared distance from a point to a triangle — the standard region solve. */
function distSqToTri(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return dot(ap, ap);
  const bp = sub(p, b);
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return dot(bp, bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const q = sub(ap, mul(ab, d1 / (d1 - d3))); return dot(q, q); }
  const cp = sub(p, c);
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return dot(cp, cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const q = sub(ap, mul(ac, d2 / (d2 - d6))); return dot(q, q); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const q = sub(bp, mul(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6)))); return dot(q, q);
  }
  const den = 1 / (va + vb + vc);
  const q = sub(ap, add(mul(ab, vb * den), mul(ac, vc * den)));
  return dot(q, q);
}

/** Nearest approach of a point to a triangle soup, in metres. */
function distToSoup(p, soup) {
  let best = Infinity;
  for (let i = 0; i < soup.length; i += 9) {
    const d = distSqToTri(p,
      [soup[i], soup[i + 1], soup[i + 2]],
      [soup[i + 3], soup[i + 4], soup[i + 5]],
      [soup[i + 6], soup[i + 7], soup[i + 8]]);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/**
 * Screen height of the margin polyline under a given screen x.
 *
 * The margin runs canthus to canthus, so a disc vertex outside its x range is
 * not "above the lid" — it is past the corner of the eye, which is a different
 * defect and gets counted as one.
 */
function marginAt(poly, x) {
  let best = null;
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i], b = poly[i + 1];
    if ((a.x - x) * (b.x - x) > 0) continue;
    const t = Math.abs(b.x - a.x) < 1e-9 ? 0 : (x - a.x) / (b.x - a.x);
    const y = a.y + (b.y - a.y) * t;
    // Topmost crossing: the upper margin arches, and near the canthi a vertical
    // through it can cut the same polyline twice.
    if (best === null || y < best) best = y;
  }
  return best;
}

function measure(cls, seed) {
  const { eyes, headWorld } = eyeClipProbe(cls, seed);
  if (eyes.length !== 2) return { eyes: eyes.length };
  // `facelook` turns the whole root to face the camera before it rasterises;
  // the probe does not, so the same turn is applied here. Without it the ruler
  // measures the back of a head.
  const M = mmul(rotY(Math.PI + (TURN * Math.PI) / 180), headWorld);
  const cam = camera(LENS, TURN);
  const soupW = (s) => { const o = new Float64Array(s.length);
    for (let i = 0; i < s.length; i += 3) { const p = xform(M, [s[i], s[i + 1], s[i + 2]]);
      o[i] = p[0]; o[i + 1] = p[1]; o[i + 2] = p[2]; } return o; };

  const per = [];
  for (const e of eyes) {
    const disc = soupW(e.disc);
    const upper = soupW(e.upper);
    const lower = soupW(e.lower);
    const centre = xform(M, e.centre);
    // The axes come across as a difference of two placed points; rotating them
    // by the same turn keeps them a frame.
    const axis = (a) => norm(sub(xform(M, add(e.centre, a)), centre));
    const up = axis(e.up), lat = axis(e.lat);
    const marginPoly = [];
    for (let i = 0; i < e.margin.length; i += 3) {
      marginPoly.push(cam.project(xform(M, [e.margin[i], e.margin[i + 1], e.margin[i + 2]])));
    }
    const lowerPoly = [];
    for (let i = 0; i < e.lowerMargin.length; i += 3) {
      lowerPoly.push(cam.project(xform(M, [e.lowerMargin[i], e.lowerMargin[i + 1], e.lowerMargin[i + 2]])));
    }

    const GLOBE = e.lidShell - 0.0016;
    // The OUTER shells only. `patch` builds every disc as a closed slab, and its
    // inner shell is a back face the renderer culls — counting those vertices
    // would report a defect on surfaces nobody can see.
    const outer = (v) => len(sub(v, centre)) > GLOBE + 0.0002;
    const samples = faceSamples(disc, outer);

    let visAbove = 0, pastCanthus = 0;
    let worstVisible = -Infinity;   // mm the worst VISIBLE disc sample stands above the margin
    let worstAny = -Infinity;       // mm the disc overshoots the aperture, occlusion ignored
    let visBelowLower = 0;
    let coverGap = Infinity;        // m the lid clears the disc by where it does cover it
    const marks = [];
    for (const v of samples) {
      const s = cam.project(v);
      const mY = marginAt(marginPoly, s.x);
      if (mY === null) { pastCanthus++; continue; }
      const aboveMm = (mY - s.y) * cam.mmPerPx(s.z);
      if (aboveMm > worstAny) worstAny = aboveMm;
      const lY = marginAt(lowerPoly, s.x);
      const belowMm = lY === null ? -99 : (s.y - lY) * cam.mmPerPx(s.z);
      // Only the band around the margins can decide any of these, and a ray test
      // against a few hundred triangles is not free. 3 mm inside is far enough
      // that `worstVisibleMm` still sees the topmost iris the camera gets.
      if (aboveMm < -3 && belowMm < -3) continue;
      const gap = frontGap(cam, v, [upper, lower]);
      const vis = gap < 0;
      // Sampled 0.3 mm inside the covered region, not right at its edge. The lid's
      // leading edge is a STEP — 1.2 mm of shell over the disc on one side of it
      // and nothing on the other — and a ray grazing the rim strip that closes
      // that step reports a gap of a few microns. That number is a true fact about
      // a ray and says nothing about whether two surfaces will fight for a pixel,
      // which is what this bar exists to ask.
      if (!vis && aboveMm > 0.3) coverGap = Math.min(coverGap, gap);
      if (vis && aboveMm > worstVisible) worstVisible = aboveMm;
      if (vis && aboveMm > 0) {
        visAbove++;
        // Where on the eye it leaked, in the socket frame, in millimetres off the
        // globe centre. "Six samples are proud" is not actionable; "six samples
        // proud at x = −11 mm, hard against the medial canthus" is.
        const dv = sub(v, centre);
        marks.push({ ...s, mmX: dot(dv, lat) * 1000, mmY: dot(dv, up) * 1000, aboveMm });
      }
      if (vis && belowMm > 0) visBelowLower++;
    }

    // ---- the shape of the fix, and not just its effect ----
    //
    // How far up the globe the lid still LIES ON IT before it folds back into the
    // socket. Walked rather than sampled: from the middle of the margin, step up
    // the great circle on the lid shell in fifths of a millimetre and ask how far
    // the emitted lid surface is from each step. The band is the CONTIGUOUS run
    // that stays within a quarter of a millimetre, so a lid that leaves the ball
    // and happens to cross the shell again on its way to the rim scores nothing
    // for the crossing — which is what a max-over-vertices version of this rewards,
    // and it read 2.2 mm on a lid that hugs for exactly none.
    const mid = [e.margin[144], e.margin[145], e.margin[146]];   // t = 0.5, mid-slit
    const midW = xform(M, mid);
    const rad = norm(sub(midW, centre));
    const tang = norm(sub(up, mul(rad, dot(up, rad))));
    let hugMm = 0;
    for (let a = 0.2; a <= 12.01; a += 0.2) {
      const th = (a / 1000) / e.lidShell;
      const q = add(centre, add(mul(rad, e.lidShell * Math.cos(th)), mul(tang, e.lidShell * Math.sin(th))));
      if (distToSoup(q, upper) > 0.00025) break;
      hugMm = a;
    }

    // How far off the socket normal the eye is actually looking. Not a bar — a
    // diagnostic, and the one that explains the size of the defect. The aperture
    // is cut on `fwd` and the disc is laid out on the gaze, so this angle is
    // exactly how far the two are pulled apart before anything else happens.
    const gazeAxis = (() => {
      const vs = verticesOf(disc);
      let a = [0, 0, 0];
      for (const v of vs) a = add(a, v);
      return norm(sub(mul(a, 1 / vs.length), centre));
    })();
    const fwd = axis(e.fwd);
    const splayDeg = Math.acos(Math.max(-1, Math.min(1, dot(gazeAxis, fwd)))) * 180 / Math.PI;
    // Split into the part that swings the aperture sideways and the part that
    // swings it up or down. Only the second one moves the disc across the margin.
    const pitchDeg = (Math.asin(Math.max(-1, Math.min(1, dot(gazeAxis, up))))
      - Math.asin(Math.max(-1, Math.min(1, dot(fwd, up))))) * 180 / Math.PI;

    per.push({
      visAbove, pastCanthus, visBelowLower,
      worstVisibleMm: worstVisible === -Infinity ? -99 : worstVisible,
      discOverMm: worstAny === -Infinity ? -99 : worstAny,
      hugMm,
      coverMm: Number.isFinite(coverGap) ? coverGap * 1000 : 99,
      splayDeg, pitchDeg,
      irisAcross: e.irisR * 2000,
      apertureMm: e.hA * 2000,
      marks, marginPoly, lowerPoly,
    });
  }
  // Worst of the two eyes on every bar — a face with one good eye is not a face.
  const worst = (k, cmp) => per.reduce((a, b) => (cmp(b[k], a) ? b[k] : a), per[0][k]);
  return {
    eyes: 2,
    visAbove: per[0].visAbove + per[1].visAbove,
    pastCanthus: per[0].pastCanthus + per[1].pastCanthus,
    visBelowLower: per[0].visBelowLower + per[1].visBelowLower,
    worstVisibleMm: worst("worstVisibleMm", (a, b) => a > b),
    discOverMm: worst("discOverMm", (a, b) => a > b),
    hugMm: worst("hugMm", (a, b) => a < b),
    coverMm: worst("coverMm", (a, b) => a < b),
    splayDeg: worst("splayDeg", (a, b) => a > b),
    pitchDeg: worst("pitchDeg", (a, b) => Math.abs(a) > Math.abs(b)),
    irisAcross: per[0].irisAcross,
    apertureMm: per[0].apertureMm,
    per,
  };
}

const rows = [];
for (const cls of CLASSES) for (let s = 0; s < SEEDS; s++) rows.push({ cls, seed: s, m: measure(cls, s) });

const fmt = (v) => (Math.abs(v) >= 20 ? v.toFixed(1) : v.toFixed(3));

// name, low, high, note
const ASSERTS = [
  ["eyes", 2, 2,
    "the probe found two eyes with lids on them. If this is not 2 nothing below means anything"],
  ["visAbove", 0, 0,
    "L1 · THE BAR. Vertices of the iris/limbal/pupil disc that are ABOVE the upper lid margin in the portrait image AND not hidden by a lid. Every one of them is a pixel of eyeball drawn over an eyelid. Only the lids occlude here — see the header"],
  ["worstVisibleMm", -2.2, 0,
    "L1 · mm the worst VISIBLE disc vertex stands above the margin. Positive is the defect. It has to stay near zero from below as well: a disc whose top is 2 mm clear of the margin everywhere is a small iris in a big aperture, which is the doll's stare the `GLOBE` note spent passes removing"],
  ["visBelowLower", 0, 0,
    "L1 · the same count against the LOWER margin. The lower lid is the same bridge with the same gap under it, and an iris hanging below the lower lid is the same defect upside down"],
  ["pastCanthus", 0, 0,
    "disc vertices whose image x falls outside the margin altogether — iris past the corner of the eye. Not what the owner reported, and it would be worse"],
  ["discOverMm", 0.15, 8,
    "L2 · THE ANTI-SHRINK BAR. How far the disc reaches past the aperture with occlusion IGNORED, worst over the population. This is the CONDITION the lid has to cover, and it must stay positive: pass it by shrinking the iris and this goes negative. The ceiling is 8 mm because a disc hanging that far outside its own aperture is not being covered by a lid, it is being buried by one"],
  ["irisAcross", 12.19, 12.21,
    "L2 · mm across the iris. Nailed shut. The wide aperture and the large iris are what the palpebral-fissure block and the `GLOBE` note were won at; this defect is not allowed to be paid for with them"],
  ["hugMm", 2.4, 9,
    "L3 · THE MECHANISM. mm of lid, walked up the globe from the middle of the margin, that is still lying ON the lid shell — a CONTIGUOUS band, so a bridge that crosses the shell on its way to the socket earns nothing. A real upper lid lies on the eyeball for a few millimetres before it folds in; a lid that leaves at the margin scores 0, and 0 is what let the disc through. The ceiling stops the lid being wrapped so far up the ball that it eats the fold"],
  ["coverMm", 0.3, 9,
    "L4 · mm the lid stands in front of the disc where it DOES cover it, at the tightest point. Coverage by a hundredth of a millimetre passes a ray test and z-fights in a renderer whose depth buffer is quantised, so the margin of the win is barred and not only the win"],
  ["apertureMm", 8.5, 17,
    "reported, not diagnostic on its own: the palpebral fissure's full height, which rides `eyeOpen` from 0.8 to 1.2 while the iris does not. The narrow end of this range is where the defect lives"],
  ["splayDeg", 0, 40,
    "reported: degrees between the socket normal the APERTURE is cut on and the gaze axis the DISC is laid out on. This is the size of the disagreement the lid has to absorb, and it is why the overshoot is millimetres rather than tenths"],
  ["pitchDeg", -25, 25,
    "reported: the part of that angle that is vertical. The horizontal part slides the disc along the slit, where the aperture is 27 mm wide and has room; only this part pushes it across a margin"],
];

console.log(`[eye] LID GATE — is anything in front of the iris?`);
console.log(`[eye] ${rows.length} heads · ${CLASSES.length} classes × ${SEEDS} seeds · portrait lens, ${LENS.dist} m, turn ${TURN}°\n`);
console.log("  assertion                 min      mean       max        allowed      verdict");
console.log("  " + "-".repeat(84));
let fails = 0;
for (const [key, lo, hi, note] of ASSERTS) {
  const vals = rows.map((r) => r.m[key] ?? -999);
  const min = Math.min(...vals), max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const ok = min >= lo && max <= hi;
  if (!ok) fails++;
  console.log(`  ${key.padEnd(20)} ${fmt(min).padStart(9)} ${fmt(mean).padStart(9)} ${fmt(max).padStart(9)}` +
    `  ${`${fmt(lo)}..${fmt(hi)}`.padStart(13)}   ${ok ? "ok" : "FAIL"}`);
  console.log(`    ${note}`);
}

// The worst offenders by name, because "max 1.4 mm" does not tell you which face
// to go and look at.
const bad = rows.filter((r) => (r.m.visAbove ?? 1) > 0)
  .sort((a, b) => b.m.worstVisibleMm - a.m.worstVisibleMm);
if (bad.length) {
  console.log(`\n  ${bad.length} of ${rows.length} heads show iris over the upper lid. Worst:`);
  for (const r of bad.slice(0, 8)) {
    console.log(`    ${r.cls.padEnd(11)} seed ${String(r.seed).padStart(2)}   ` +
      `${String(r.m.visAbove).padStart(3)} vertices   ${r.m.worstVisibleMm.toFixed(2)} mm proud   ` +
      `aperture ${r.m.apertureMm.toFixed(1)} mm`);
  }
  // The worst head, sample by sample, in the socket frame. `lat` is the skull's
  // +x on both sides, so the sign of `x` is a side of the face and not a side of
  // the eye — which is exactly what is wanted when the question is whether a leak
  // is at the nose or at the temple.
  const w0 = bad[0];
  console.log(`\n  where ${w0.cls} seed ${w0.seed} leaks — socket frame, mm off the globe centre:`);
  for (const e of w0.m.per) {
    for (const s of e.marks.slice(0, 12)) {
      console.log(`    side ${String(e.marks === w0.m.per[0].marks ? -1 : 1).padStart(2)}  ` +
        `x ${s.mmX.toFixed(2).padStart(7)}   y ${s.mmY.toFixed(2).padStart(7)}   ` +
        `${s.aboveMm.toFixed(2).padStart(6)} mm above the margin`);
    }
  }
}

// ---- the picture, so a number that passes can still be looked at ----
// One PNG per requested head: the projected upper and lower margins in white,
// every disc vertex as a dot, and the offending ones — visible AND above the
// margin — as a cross. `--dump` only; this is a diagnostic, not a gate.
if (DUMP) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    let c, table = chunk.t;
    if (!table) { table = chunk.t = new Int32Array(256);
      for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; } }
    let crc = -1;
    for (let i = 0; i < td.length; i++) crc = (crc >>> 8) ^ table[(crc ^ td[i]) & 0xff];
    const cb = Buffer.alloc(4); cb.writeUInt32BE((crc ^ -1) >>> 0);
    return Buffer.concat([len, td, cb]);
  };
  const ZW = 260, ZH = 150, Z = 8;   // a window on the eyes, magnified
  const r = rows[0];
  const px = new Uint8Array(ZW * Z * ZH * Z * 3);
  const put = (x, y, c) => {
    const X = Math.round(x), Y = Math.round(y);
    if (X < 0 || Y < 0 || X >= ZW * Z || Y >= ZH * Z) return;
    const o = (Y * ZW * Z + X) * 3;
    px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2];
  };
  const x0 = LENS.w * 0.5 - ZW * 0.5, y0 = 250;
  const map = (s) => [(s.x - x0) * Z, (s.y - y0) * Z];
  for (const e of r.m.per) {
    for (const poly of [e.marginPoly, e.lowerPoly]) {
      for (let i = 0; i + 1 < poly.length; i++) {
        const [ax, ay] = map(poly[i]), [bx, by] = map(poly[i + 1]);
        const n = Math.ceil(Math.hypot(bx - ax, by - ay));
        for (let k = 0; k <= n; k++) put(ax + (bx - ax) * k / n, ay + (by - ay) * k / n, [255, 255, 255]);
      }
    }
    for (const s of e.marks) {
      const [mx, my] = map(s);
      for (let k = -6; k <= 6; k++) { put(mx + k, my, [255, 40, 40]); put(mx, my + k, [255, 40, 40]); }
    }
  }
  const W = ZW * Z, H = ZH * Z;
  const raw = Buffer.alloc(H * (W * 3 + 1));
  let o = 0;
  for (let y = 0; y < H; y++) { raw[o++] = 0;
    for (let x = 0; x < W; x++) { const i = (y * W + x) * 3; raw[o++] = px[i]; raw[o++] = px[i + 1]; raw[o++] = px[i + 2]; } }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const path = resolve(ROOT, `${DUMP}.png`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]));
  console.log(`\n  [dump] ${path}  ${r.cls} seed ${r.seed}  white = lid margins, red crosses = iris drawn over the lid`);
}

console.log("\n  " + "-".repeat(84));
console.log(`[eye] FINAL: ${fails} of ${ASSERTS.length} LID assertions FAILED`);
rmSync(OUT, { recursive: true, force: true });
process.exit(fails > 0 ? 1 : 0);
