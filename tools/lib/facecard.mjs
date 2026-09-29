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
 * Fit the landmark set to the image: a shift and a scale, in two stages.
 *
 * STAGE 1 FINDS THE EYES, because they are the one part of a face that is a compact dark thing surrounded on ALL
 * sides by something lighter: a pupil inside its iris inside the white and the lids. (The brows are dark and so are
 * the hair and the nostrils, and a fit on "dark features" alone slid the whole landmark set onto the brows twice.)
 * The detector is `min(ring) - disc`: the darkest of eight samples 10 px out, minus the mean of a 3 px disc. A bar
 * (a brow, a hairline) has dark neighbours along its length and scores nothing; a pupil scores 20 to 50. The two
 * strongest blobs that are a plausible interpupillary distance apart and level are the eyes, and they fix the
 * shift and the scale outright. Where only one eye faces the lens (three-quarter, profile) the strongest single
 * blob near a model iris that faces the lens fixes the shift and the scale is held.
 *
 * STAGE 2 REFINES within a few pixels on everything the lens can see (irises, brows, nostrils, the mouth line).
 *
 * Returns `{ dx, dy, k, score, found }`; the caller PRINTS it. `found` is how many eye blobs stage 1 used.
 */
export function register(CH, lens, lab, cls, turn, opts = {}) {
  const at = (reg) => landmarksOnCard(CH, lens, cls, turn, reg);
  const base = at({ dx: 0, dy: 0, k: 1 });
  const FACE_MIN = 0.35;   // a feature on the far side of the head is not a feature the card can be asked about
  const eyesSeen = base.eyes.filter((e) => e.iris.facing >= 0.5);
  const rel = base.eyes.map((e) => e.iris);
  const mid = { x: (rel[0].x + rel[1].x) / 2, y: (rel[0].y + rel[1].y) / 2 };
  const ipd = Math.hypot(rel[0].x - rel[1].x, rel[0].y - rel[1].y);
  const ringOf = (x, y) => {
    let lo = 1e9;
    for (let a = 0; a < 8; a++) { const q = discLab(lab, x + Math.cos(a * Math.PI / 4) * 10, y + Math.sin(a * Math.PI / 4) * 10, 1.5); if (!q) return -1e9; lo = Math.min(lo, q[0]); }
    return lo;
  };
  // ---- stage 1: the compact dark blobs, within reach of where the model says the eyes are ----
  const R = opts.reach ?? 90;
  const cx = mid.x, cy = mid.y;
  const blobs = [];
  for (let y = Math.max(12, Math.round(cy - R)); y <= Math.min(lab.h - 13, Math.round(cy + R)); y += 2) {
    for (let x = Math.max(12, Math.round(cx - R * 1.6)); x <= Math.min(lab.w - 13, Math.round(cx + R * 1.6)); x += 2) {
      const d = discLab(lab, x, y, 3);
      if (!d || d[0] > 45) continue;
      const c = ringOf(x, y) - d[0];
      if (c > 12) blobs.push({ x, y, c });
    }
  }
  blobs.sort((p, q) => q.c - p.c);
  const peaks = [];
  for (const b of blobs) if (!peaks.some((p) => Math.hypot(p.x - b.x, p.y - b.y) < 14) && peaks.length < 8) peaks.push(b);
  let fit = null;
  if (eyesSeen.length === 2) {
    let best = null;
    for (let i = 0; i < peaks.length; i++) for (let j = i + 1; j < peaks.length; j++) {
      const [L, Rr] = peaks[i].x < peaks[j].x ? [peaks[i], peaks[j]] : [peaks[j], peaks[i]];
      const d = Math.hypot(Rr.x - L.x, Rr.y - L.y);
      const k = d / ipd;
      if (k < 0.9 || k > 1.12 || Math.abs(Rr.y - L.y) > 0.16 * d) continue;
      const sc = L.c + Rr.c;
      if (!best || sc > best.sc) best = { sc, k, x: (L.x + Rr.x) / 2, y: (L.y + Rr.y) / 2 };
    }
    if (best) fit = { k: best.k, dx: best.x - mid.x, dy: best.y - mid.y, found: 2 };
  } else if (eyesSeen.length === 1 && peaks.length) {
    const e = eyesSeen[0].iris;
    // the peak nearest the model's near eye (the strongest within reach is usually it)
    const near = peaks.filter((p) => Math.hypot(p.x - e.x, p.y - e.y) < R * 1.2).sort((p, q) => q.c - p.c)[0];
    if (near) fit = { k: 1, dx: near.x - e.x, dy: near.y - e.y, found: 1 };
  }
  if (!fit) return { dx: 0, dy: 0, k: 1, score: -1, found: 0 };
  // ---- stage 2: refine on everything the lens sees ----
  const feats = [];
  const add = (p, r, w) => { if (p.facing >= FACE_MIN) feats.push({ p, r, w }); };
  for (const e of base.eyes) add(e.iris, 3.2, 3);
  for (const b of base.brows) for (const i of [2, 4, 6]) add(b.points[i], 2, 0.7);
  for (const n of base.nostrils) add(n, 2, 1);
  add(base.mouth.stomion, 2, 1.2);
  const scoreOf = (dx, dy, k) => {
    let sc = 0, wsum = 0;
    for (const f of feats) {
      const x = mid.x + (f.p.x - mid.x) * k + dx, y = mid.y + (f.p.y - mid.y) * k + dy;
      const c = discLab(lab, x, y, f.r);
      if (!c) continue;
      const ring = [];
      for (let a = 0; a < 8; a++) { const q = discLab(lab, x + Math.cos(a * Math.PI / 4) * f.r * 3.4, y + Math.sin(a * Math.PI / 4) * f.r * 3.4, 1.5); if (q) ring.push(q[0]); }
      if (ring.length < 6) continue;
      ring.sort((p, q) => p - q);
      sc += f.w * Math.max(-20, ring[1] - c[0]); wsum += f.w;
    }
    return wsum ? sc / wsum : -1e9;
  };
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

export { labPlanes };
