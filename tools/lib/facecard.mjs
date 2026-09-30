// ============================================================
// facecard — where the face's parts are in a captured FACE CARD, so a ruler can
// read the pixels the owner's words are about.
//
// `tools/facecontrast.mjs` and `tools/lattice.mjs` are stated in the owner's terms
// ("the eyes are dead", "the face is a grid of dashes"): sclera against skin, brow
// against hair, lip against cheek. A ruler that says "sclera L* 24" has to know
// WHICH pixels are the sclera, and a photograph does not say. So this asks the
// build itself: `faceLandmarks` (characters.ts) returns every part as a point in
// the body's frame off the very functions the head is built from, and the card's
// own lens and mark put that on the screen.
//
// THE LENS IS READ, NOT COPIED. `tools/eyeclip.mjs` and `tools/facelook.mjs` each
// carry a copy of the portrait lens ("copied from facelook, which copied it from
// /shot"), which is how three files come to hold three ideas of a camera. This
// reads `CARDS.facecard` and `MARK` out of `src/app/shot/page.tsx` as TEXT and
// `CARD_AIM.head` out of the compiled characters module, and REFUSES (throws) when
// it cannot find them: a ruler that fell back to a default lens would be measuring
// pixels next to the feature it names.
//
// THE POSE IS THE REST POSE PLUS A REGISTRATION. The card man idles on a frozen
// clock, so his head is a few millimetres and a degree or two off the rest pose the
// landmarks are in. `register` corrects for it by nudging the whole landmark set
// (a shift and a scale, nothing else) to where the image says the eyes are, so the
// windows land on the feature and not on the skin beside it. The correction is
// PRINTED with every card, and a ruler whose registration moved more than a few
// pixels says so instead of measuring a wrong thing quietly.
// ============================================================
import { readFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { emitClient } from "./clientmodule.mjs";
import { labPlanes } from "./pngread.mjs";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];

/** `facecard-helmhelm_none-hairhair_shaved-beardbeard_none-warPaintwp_none-clshuscarl-turn-35.png` */
export function parseCardName(file) {
  const b = basename(file).replace(/\.png$/i, "");
  const cls = /-cls([a-z]+)/.exec(b)?.[1];
  const turn = /-turn(-?\d+(?:\.\d+)?)/.exec(b)?.[1];
  if (!cls || turn === undefined) return null;
  return {
    cls, turn: Number(turn),
    helm: /-helm(?:helm)?_?([a-z]+)/.exec(b)?.[1] ?? null,
    hair: /-hair(?:hair)?_?([a-z]+)/.exec(b)?.[1] ?? null,
    beard: /-beard(?:beard)?_?([a-z]+)/.exec(b)?.[1] ?? null,
  };
}

/** Compile `characters.ts` once and hand back its module. */
export async function loadCharacters(work = ".faceprobe/chars") {
  globalThis.window ??= { location: { search: "" }, innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {}, localStorage: { getItem: () => null, setItem() {} } };
  globalThis.navigator ??= { userAgent: "node", maxTouchPoints: 0, hardwareConcurrency: 8 };
  globalThis.document ??= { createElement: () => ({ getContext: () => null, width: 1, height: 1 }) };
  const { byName } = await emitClient(ROOT, ["src/game/client/characters.ts"], work);
  const CH = await byName("characters.js");
  if (!CH) throw new Error("tsc emitted no characters.js");
  return CH;
}

/** The card lens, parsed out of the shot page. Throws rather than guessing. */
export function cardLens(CH, root = ROOT) {
  const src = readFileSync(resolve(root, "src/app/shot/page.tsx"), "utf8");
  const row = /facecard:\s*\{([^}]*)\}/.exec(src)?.[1];
  const num = (k) => { const m = new RegExp(`\\b${k}:\\s*(-?[\\d.]+)`).exec(row ?? ""); if (!m) throw new Error(`shot page: no ${k} in CARDS.facecard`); return Number(m[1]); };
  const mark = /const MARK\s*=\s*\{\s*x:\s*(-?[\d.]+)\s*,\s*z:\s*(-?[\d.]+)\s*\}/.exec(src);
  if (!mark) throw new Error("shot page: no MARK");
  const aim = CH.CARD_AIM?.head;
  if (!aim) throw new Error("characters: no CARD_AIM.head");
  return { w: num("w"), h: num("h"), dist: num("dist"), targetY: num("targetY"), eyeY: num("eyeY"), fov: num("fov"),
    mark: { x: Number(mark[1]), z: Number(mark[2]) }, aim };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** `cardFraming` of the shot page, and the pinhole it implies. `turn` in degrees. */
export function cardCamera(lens, turn) {
  const rot = Math.PI + (turn * Math.PI) / 180;
  const s = Math.sin(rot), c = Math.cos(rot);
  const x = lens.mark.x + lens.aim.right * c + lens.aim.fwd * s;
  const z = lens.mark.z - lens.aim.right * s + lens.aim.fwd * c;
  const eye = [x, lens.eyeY, z - lens.dist];
  const target = [x, lens.targetY, z];
  const fwd = norm(sub(target, eye));
  const side = norm([-fwd[2], 0, fwd[0]]);
  const up = cross(side, fwd);
  const tanH = Math.tan((lens.fov * Math.PI) / 360);
  const aspect = lens.w / lens.h;
  return {
    rot, eye, fwd, side, up, W: lens.w, H: lens.h,
    /** body-frame point (builder's x) -> pixel, depth (m), and the unit vector from the point to the eye. */
    project(p) {
      // the man is built left-handed and hung under a `scale.x = -1` node, so the builder's x is the
      // negative of the world's; then he is turned to face `rot`. And the head is not over the
      // body's origin: `CARD_AIM.head` is where it hangs, in the body's own right/forward frame
      // (the card aims the lens at it), so the whole head is carried by that offset.
      const lx = -p[0] + lens.aim.right, ly = p[1], lz = p[2] + lens.aim.fwd;
      const w = [lens.mark.x + lx * Math.cos(rot) + lz * Math.sin(rot), ly, lens.mark.z - lx * Math.sin(rot) + lz * Math.cos(rot)];
      const d = sub(w, eye);
      const cz = dot(d, fwd);
      return {
        x: (0.5 + 0.5 * dot(d, side) / (cz * tanH * aspect)) * lens.w,
        y: (0.5 - 0.5 * dot(d, up) / (cz * tanH)) * lens.h,
        depth: cz, toEye: norm([-d[0], -d[1], -d[2]]), world: w,
      };
    },
    /** world unit vector of a body-frame DIRECTION (for "does this surface face the lens"). */
    dir(v) {
      const lx = -v[0]; // a direction: no offset
      return norm([lx * Math.cos(rot) + v[2] * Math.sin(rot), v[1], -lx * Math.sin(rot) + v[2] * Math.cos(rot)]);
    },
    pxPerMetre: lens.h / (2 * lens.dist * tanH),
  };
}

/**
 * Landmarks of one card, in pixels, with a registration.
 *
 * `reg` is `{ dx, dy, k }`: the whole set is scaled about the eye midpoint by `k` and
 * shifted by (dx, dy). The default is the identity, i.e. the rest pose.
 */
export function landmarksOnCard(CH, lens, cls, turn, reg = { dx: 0, dy: 0, k: 1 }) {
  const cam = cardCamera(lens, turn);
  const L = CH.faceLandmarks(cls, 0);
  const raw = (p) => cam.project(p);
  const mid = (() => { const a = raw(L.eyes[0].iris), b = raw(L.eyes[1].iris); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; })();
  const centre = [0, L.headY, 0];
  // how squarely the surface at a point faces the lens, taking the surface normal as the direction out of the
  // head's centre (a skull is round enough for that to be a filter, which is all it is used as)
  const facingAt = (p) => {
    const r = raw(p);
    const d = [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
    const w = cam.dir(d);
    return w[0] * r.toEye[0] + w[1] * r.toEye[1] + w[2] * r.toEye[2];
  };
  const px = (p) => { const r = raw(p); return { x: mid.x + (r.x - mid.x) * reg.k + reg.dx, y: mid.y + (r.y - mid.y) * reg.k + reg.dy, depth: r.depth, facing: facingAt(p) }; };
  const pxs = (a) => a.map(px);
  return {
    cam, L, reg,
    mmPerPx: 1000 / (cam.pxPerMetre * reg.k),
    eyes: L.eyes.map((e) => ({
      side: e.side, irisR: e.irisR, centre: px(e.centre), iris: px(e.iris), medial: px(e.medial), lateral: px(e.lateral),
      sclera: pxs(e.sclera), aperture: pxs(e.aperture),
    })),
    brows: L.brows.map((b) => ({ side: b.side, points: pxs(b.points) })),
    nostrils: pxs(L.nostrils),
    mouth: { stomion: px(L.mouth.stomion), corners: pxs(L.mouth.corners), upper: px(L.mouth.upper), lower: px(L.mouth.lower) },
    skin: L.skin.map((s) => ({ name: s.name, side: s.side, ...px(s.at) })),
  };
}

/**
 * How much of a landmark's surface faces the lens, 0 (edge on or behind) to 1 (square on).
 * A feature at the far side of a three-quarter head is not a feature the card can be asked about.
 */
export function facing(CH, cam, cls, point, normalBody) {
  void CH; void cls;
  const p = cam.project(point);
  const n = cam.dir(normalBody);
  return Math.max(0, dot(n, p.toEye));
}

// ---- registration ----------------------------------------------------------

/**
 * Fit the landmark set to the image: a shift and a scale, by SCORING candidates on every feature the lens can see.
 *
 * CANDIDATES come from the eyes, because they are the one part of a face that is a compact dark thing surrounded on
 * ALL sides by something lighter (a brow, a hairline and a nostril are not: they have dark neighbours along their
 * length, and a fit on "dark features" alone slid the whole landmark set onto the brows twice). The detector is
 * `min(ring) - disc`: the darkest of eight samples 10 px out, minus the mean of a 3 px disc. Every pair of the strongest
 * blobs that is a plausible interpupillary distance apart and level is a candidate that fixes shift and scale outright;
 * with one eye facing the lens, every strong blob near it is a candidate that fixes the shift (the scale is held at 1).
 *
 * BUT THE DETECTOR CANNOT BE THE JUDGE, and the frame that showed it: once the eye has a white sclera and a pale iris
 * around its pupil (as it does after `render/eyeMap.ts`), the pupil's own specular dot and the lids round it cut the
 * detector's contrast from 30-50 to 10-14, and the two strongest blobs were the wrong ones. So the detector only PROPOSES.
 * Each candidate is refined by a few pixels of hill-climbing and then SCORED on every feature the lens can see (irises,
 * brows, nostrils, the mouth line), and the best-scoring candidate wins. A wrong pair of blobs fits the brows and the
 * nostrils badly and loses to the right one.
 *
 * Returns `{ dx, dy, k, score, found }`; the caller PRINTS it. `found` is how many eye blobs the winning candidate used
 * (0 when no eye faces the lens: nothing is registered, and the caller must not read windows).
 */
export function register(CH, lens, lab, cls, turn, opts = {}) {
  const at = (reg) => landmarksOnCard(CH, lens, cls, turn, reg);
  const base = at({ dx: 0, dy: 0, k: 1 });
  const FACE_MIN = 0.35;   // a feature on the far side of the head is not a feature the card can be asked about
  const eyesSeen = base.eyes.filter((e) => e.iris.facing >= 0.7);   // the far eye at three-quarter is behind the nose bridge
  if (!eyesSeen.length) return { dx: 0, dy: 0, k: 1, score: -1, found: 0 };
  const rel = base.eyes.map((e) => e.iris);
  const mid = { x: (rel[0].x + rel[1].x) / 2, y: (rel[0].y + rel[1].y) / 2 };
  const ipd = Math.hypot(rel[0].x - rel[1].x, rel[0].y - rel[1].y);
  // ---- the proposals: compact dark blobs within reach of where the model says the eyes are ----
  const R = opts.reach ?? 90;
  const blobs = [];
  for (let y = Math.max(12, Math.round(mid.y - R)); y <= Math.min(lab.h - 13, Math.round(mid.y + R)); y += 2) {
    for (let x = Math.max(12, Math.round(mid.x - R * 1.6)); x <= Math.min(lab.w - 13, Math.round(mid.x + R * 1.6)); x += 2) {
      const c = eyeBlob(lab, x, y);
      if (c > 8) blobs.push({ x, y, c });
    }
  }
  blobs.sort((p, q) => q.c - p.c);
  const peaks = [];
  for (const b of blobs) if (!peaks.some((p) => Math.hypot(p.x - b.x, p.y - b.y) < 10) && peaks.length < 14) peaks.push(b);
  const proposals = [];
  if (eyesSeen.length === 2) {
    for (let i = 0; i < peaks.length; i++) for (let j = i + 1; j < peaks.length; j++) {
      const [L, Rr] = peaks[i].x < peaks[j].x ? [peaks[i], peaks[j]] : [peaks[j], peaks[i]];
      const d = Math.hypot(Rr.x - L.x, Rr.y - L.y);
      const k = d / ipd;
      if (k < 0.9 || k > 1.12 || Math.abs(Rr.y - L.y) > 0.16 * d) continue;
      proposals.push({ k, dx: (L.x + Rr.x) / 2 - mid.x, dy: (L.y + Rr.y) / 2 - mid.y, found: 2 });
    }
  } else {
    const e = eyesSeen[0].iris;
    for (const p of peaks) if (Math.hypot(p.x - e.x, p.y - e.y) < R * 1.2) proposals.push({ k: 1, dx: p.x - e.x, dy: p.y - e.y, found: 1 });
  }
  if (!proposals.length) return { dx: 0, dy: 0, k: 1, score: -1, found: 0 };
  // ---- the judge: every feature the lens sees ----
  const feats = [];
  const add = (p, r, w, eye = false) => { if (p.facing >= FACE_MIN) feats.push({ p, r, w, eye }); };
  for (const e of base.eyes) add(e.iris, 3, 3, true);
  for (const b of base.brows) for (const i of [2, 4, 6]) add(b.points[i], 2, 0.7);
  for (const n of base.nostrils) add(n, 2, 1);
  add(base.mouth.stomion, 2, 1.2);
  const scoreOf = (dx, dy, k) => {
    let sc = 0, wsum = 0;
    for (const f of feats) {
      const x = mid.x + (f.p.x - mid.x) * k + dx, y = mid.y + (f.p.y - mid.y) * k + dy;
      if (f.eye) {
        // the eye is found as a compact blob, to within two pixels of where it is predicted
        let best = 0;
        for (let j = -2; j <= 2; j += 1) for (let i = -2; i <= 2; i += 1) best = Math.max(best, eyeBlob(lab, x + i, y + j));
        sc += f.w * best; wsum += f.w;
        continue;
      }
      const lo = minL(lab, x, y, f.r);
      if (lo === null) continue;
      const ring = [];
      for (let a = 0; a < 8; a++) { const q = discLab(lab, x + Math.cos(a * Math.PI / 4) * f.r * 3.4, y + Math.sin(a * Math.PI / 4) * f.r * 3.4, 1.5); if (q) ring.push(q[0]); }
      if (ring.length < 6) continue;
      ring.sort((p, q) => p - q);
      sc += f.w * Math.max(-20, ring[1] - lo); wsum += f.w;
    }
    return wsum ? sc / wsum : -1e9;
  };
  const refine = (fit) => {
    let best = { dx: fit.dx, dy: fit.dy, k: fit.k, score: scoreOf(fit.dx, fit.dy, fit.k), found: fit.found };
    for (let step = 2; step >= 0.25; step /= 2) {
      let moved = true;
      while (moved) {
        moved = false;
        for (const [ddx, ddy, dk] of [[step, 0, 0], [-step, 0, 0], [0, step, 0], [0, -step, 0], [0, 0, 0.004], [0, 0, -0.004]]) {
          const c = { dx: best.dx + ddx, dy: best.dy + ddy, k: fit.found === 2 ? best.k + dk : 1 };
          if (Math.hypot(c.dx - fit.dx, c.dy - fit.dy) > 6 || Math.abs(c.k - fit.k) > 0.03) continue;
          const sc = scoreOf(c.dx, c.dy, c.k);
          if (sc > best.score + 1e-6) { best = { ...c, score: sc, found: fit.found }; moved = true; }
        }
      }
    }
    return best;
  };
  let winner = null;
  for (const p of proposals) { const r = refine(p); if (!winner || r.score > winner.score) winner = r; }
  return winner;
}

// ---- pixel reading ---------------------------------------------------------

/** Mean Lab over a disc of radius `r` px at (x, y), skipping pixels outside the image. */
export function discLab(lab, x, y, r) {
  let n = 0, L = 0, A = 0, B = 0;
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(lab.w - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(lab.h - 1, Math.ceil(y + r));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    if ((i - x) ** 2 + (j - y) ** 2 > r * r) continue;
    const k = j * lab.w + i; L += lab.L[k]; A += lab.A[k]; B += lab.B[k]; n++;
  }
  return n ? [L / n, A / n, B / n] : null;
}

/** The darkest L* within `r` px of (x, y), or null off the image. A feature that must be found to within a few pixels is found by its DARKEST pixel, not its mean, which a specular dot inside a pupil raises past the disc round it. */
export function minL(lab, x, y, r) {
  let lo = 1e9;
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(lab.w - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(lab.h - 1, Math.ceil(y + r));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    if ((i - x) ** 2 + (j - y) ** 2 > r * r) continue;
    const v = lab.L[j * lab.w + i]; if (v < lo) lo = v;
  }
  return lo < 1e9 ? lo : null;
}

/**
 * How much of a COMPACT DARK BLOB is at (x, y): a disc of radius `r0` that is darker, by `lift` L* or more, than the mean
 * of the annulus from `r1` to `r2` round it, on at least nine of twelve samples. A lash line or a brow is dark along
 * its length, so a third of its annulus is as dark as its centre and it scores nothing; a pupil, an iris and a nostril are
 * surrounded. The score is the annulus's mean over the disc's.
 */
export function blobScore(lab, x, y, r0, r1, r2, lift) {
  const c = discLab(lab, x, y, r0);
  if (!c) return 0;
  let sum = 0, n = 0, lighter = 0;
  for (let ring = 0; ring < 2; ring++) for (let a = 0; a < 6; a++) {
    const r = ring ? r2 : r1, ang = (a + (ring ? 0.5 : 0)) * Math.PI / 3;
    const q = discLab(lab, x + Math.cos(ang) * r, y + Math.sin(ang) * r, 1.2);
    if (!q) return 0;
    sum += q[0]; n++; if (q[0] >= c[0] + lift) lighter++;
  }
  return lighter >= 9 ? sum / n - c[0] : 0;
}

/**
 * An EYE, found as one of two things, because the two builds of the eye have different structure and the ruler is asked
 * to read both. `pupil`: a black disc inside a PALE iris (r0 2 px, the iris an annulus 3.5 to 5.5 px out and lighter by
 * 15). `iris`: a whole dark iris in the white and the lids (r0 6 px, the annulus 9 to 12 px out and lighter by 8). The
 * dark eye (the plan's HEAD) is the second and not the first, because its pupil is barely darker than its iris; the
 * eye with a pale iris (after `render/eyeMap.ts`) is the first and not the second, because its iris is as light as the
 * skin round it. Either is an eye; the better score is the eye's.
 */
export const eyeBlob = (lab, x, y) => Math.max(blobScore(lab, x, y, 2, 3.5, 5.5, 15), blobScore(lab, x, y, 6, 9, 12, 8));

export { labPlanes };
