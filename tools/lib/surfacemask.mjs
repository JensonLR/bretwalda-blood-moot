// ============================================================
// SURFACEMASK — WHICH PIXELS OF A CAPTURED WARRIOR ARE HIS BYRNIE
//
// ONE DEFINITION, TWO CALLERS, same reason `tools/lib/roseband.mjs` exists:
// `tools/factionread.mjs` §7 grades the frames its own gate captures and
// `tools/vatprobe.mjs` asks the same question on six, and a mask written out
// twice is a mask that will be corrected once. docs/PROCESS.md failure mode 3.
//
// ------------------------------------------------------------
// THE BLINDNESS THIS EXISTS TO CLOSE, IN THE ADVERSARY'S OWN NUMBERS
//
// `factionread` §7.1 counted the rose share over the WHOLE WARRIOR MASK. A
// matched pair — huscarl / Polished Steel 60g / 0°, identical crop, differing
// only in `people` — read byrnie rose 1.5% UNSWORN against 19.4% DANELAW, and
// the gate scored that same loadout **+0.391 points**, because a byrnie 19% in
// the band is one seventh of a man and dilutes to nothing across him. A
// warrior is not one surface. He is a byrnie, a tunic, trousers, leg wraps,
// hide and buff, and a vat is entitled to touch each of them differently — so
// a mean over the six is an instrument that can be told a true thing about a
// man and report a false one about his mail.
//
// The same shape of blindness is one gate over in §5: `kitDE` averages ΔE over
// the six surfaces, so a BYTE-IDENTICAL byrnie is invisible to the section
// titled "THE PAID LADDER SURVIVES SWEARING".
//
// ------------------------------------------------------------
// HOW A SURFACE IS IDENTIFIED, AND IT IS NOT A CROP
//
// A rectangle over the chest is a guess that moves with the pose, the bearing
// and the class, and it cannot tell a byrnie from the arm behind it. This does
// it off the GEOMETRY the renderer draws:
//
//   1. The same scene graph the client builds, rasterised at the capture's own
//      lens with the same nearest-surface z test `factionread` has always used
//      for its coverage mask. Every covered pixel remembers WHICH MESH won it.
//   2. A mesh is named by asking the SHIPPED RESOLVERS what colour that
//      surface comes out for each people, and matching the mesh's own material
//      colour against them. A mesh is `mail` only if it carries `kit.mail`'s
//      hex under EVERY people at once — four independent agreements, so a
//      collision under one vat cannot name a surface by itself. A mesh that
//      matches two surfaces under all four is reported AMBIGUOUS and named by
//      neither.
//   3. The map from mesh to surface is then the same for the unsworn man,
//      because a livery moves no geometry — `factionread` §0.3 asserts that at
//      the pixel and `sameGeometry` below asserts it again on the mesh, per
//      frame, so the matched comparison is literally the SAME PIXELS.
//
// Nothing here mirrors a hex, a surface list or a resolver: the caller passes
// `kitOf(people)` and the answer follows the shipped code.
//
// ------------------------------------------------------------
// THE EROSION, AND WHY THE RAW COUNT IS PRINTED BESIDE IT
//
// The rasteriser is hard-edged and the renderer is not: a silhouette pixel in a
// capture is part byrnie and part bonfire, and a pixel where the mail meets the
// tunic is part of both. Every mask below is therefore ERODED by one pixel
// (4-neighbour) before it is used, which drops exactly the pixels whose colour
// belongs to two surfaces. Both counts are returned so a reader can see what
// the erosion cost, and the erosion is applied IDENTICALLY to the sworn frame
// and its unsworn control — it is the same array — so it cannot flatter one.
//
// A surface can erode to nothing at a bearing (a buff plate seen edge-on). The
// caller is given `n` and must decide; `MIN_PIXELS` below is the floor
// `factionread` and `vatprobe` both use, and a surface under it is reported
// NOT MEASURABLE rather than gated on noise.
// ============================================================
import { rgb2lab } from "./roseband.mjs";

/**
 * The smallest eroded surface either caller will read a percentage off. 24 px
 * of a 520x320 frame is about a thumbnail of a fingernail on a 230 px man; a
 * share taken off fewer than that is a count of ones and zeroes.
 */
export const MIN_PIXELS = 24;

/**
 * Rasterises a scene graph into an albedo buffer, a coverage mask and a
 * PER-PIXEL MESH ORDINAL.
 *
 * The lens algebra is `tools/teamread.mjs`'s, unchanged, and was lifted into
 * this file whole from `tools/factionread.mjs` when the second caller appeared
 * — same nearest-surface z test, same linear-light material read.
 *
 * `lens` is `{ w, h, fov, dist, eyeY, targetY }` and `turnDeg` turns the
 * SUBJECT, not the camera, which is what makes a bearing a turntable.
 */
export function rasterise(root, lens, turnDeg) {
  const W = lens.w, H = lens.h;
  const rot = Math.PI + (turnDeg * Math.PI) / 180;
  const ex = 0, ey = lens.eyeY, ez = -lens.dist;
  const tx = 0, ty = lens.targetY, tz = 0;
  let fx = tx - ex, fy = ty - ey, fz = tz - ez;
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  let sx = -fz, sy = 0, sz = fx;
  const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
  const vx = sy * fz - sz * fy, vy = sz * fx - sx * fz, vz = sx * fy - sy * fx;
  const tanH = Math.tan((lens.fov * Math.PI) / 360);
  const aspect = W / H;

  const depth = new Float32Array(W * H).fill(Infinity);
  const cov = new Uint8Array(W * H);
  const rgb = new Float32Array(W * H * 3);
  const mesh = new Int32Array(W * H).fill(-1);
  const meshHex = [];
  root.rotation.y = rot;
  root.updateMatrixWorld(true);

  const NEAR = 0.05;
  const A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0];
  const toScreen = (px, py, pz, out) => {
    const dx = px - ex, dy = py - ey, dz = pz - ez;
    const cz = dx * fx + dy * fy + dz * fz;
    out[2] = cz;
    if (cz < NEAR) return false;
    out[0] = ((dx * sx + dy * sy + dz * sz) / (cz * tanH * aspect)) * 0.5 * W + W * 0.5;
    out[1] = H * 0.5 - ((dx * vx + dy * vy + dz * vz) / (cz * tanH)) * 0.5 * H;
    return true;
  };

  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry;
    const pos = g.attributes?.position;
    if (!pos) return;
    const col = o.material?.color;
    if (!col) return;
    // THE ORDINAL IS THE TRAVERSAL ORDER AND THAT IS THE WHOLE OF THE IDENTITY.
    // `Object3D.traverse` is a deterministic depth-first walk of a graph a
    // livery does not restructure, so ordinal N is the same mesh in all five
    // builds. `sameGeometry` below refuses to trust that and checks it.
    const id = meshHex.length;
    meshHex.push(col.getHex(SRGB));
    const cr = col.r, cg = col.g, cb = col.b;
    const idx = g.index;
    const m = o.matrixWorld.elements;
    const n = idx ? idx.count : pos.count;
    const pa = pos.array, ia = idx?.array;
    for (let t = 0; t < n; t += 3) {
      let ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        const j = ia ? ia[t + k] : t + k;
        const x = pa[j * 3], y = pa[j * 3 + 1], z = pa[j * 3 + 2];
        ok = toScreen(
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
          k === 0 ? A : k === 1 ? B : C);
      }
      if (!ok) continue;
      const minx = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0])));
      const maxx = Math.min(W - 1, Math.ceil(Math.max(A[0], B[0], C[0])));
      const miny = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1])));
      const maxy = Math.min(H - 1, Math.ceil(Math.max(A[1], B[1], C[1])));
      if (minx > maxx || miny > maxy) continue;
      const d = (B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]);
      if (d === 0) continue;
      for (let y = miny; y <= maxy; y++) {
        for (let x = minx; x <= maxx; x++) {
          const px = x + 0.5, py = y + 0.5;
          const w0 = ((B[0] - A[0]) * (py - A[1]) - (px - A[0]) * (B[1] - A[1])) / d;
          const w1 = ((px - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (py - A[1])) / d;
          const w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const z = w2 * A[2] + w1 * B[2] + w0 * C[2];
          const o2 = y * W + x;
          if (z < depth[o2]) {
            depth[o2] = z; cov[o2] = 1; mesh[o2] = id;
            rgb[o2 * 3] = cr; rgb[o2 * 3 + 1] = cg; rgb[o2 * 3 + 2] = cb;
          }
        }
      }
    }
  });

  let area = 0, r = 0, g = 0, b = 0;
  for (let i = 0; i < W * H; i++) {
    if (!cov[i]) continue;
    area++; r += rgb[i * 3]; g += rgb[i * 3 + 1]; b += rgb[i * 3 + 2];
  }
  return { cov, rgb, mesh, meshHex, area, mean: area ? [r / area, g / area, b / area] : [0, 0, 0] };
}

/**
 * `THREE.Color.getHex()`'s sRGB argument, spelled out rather than imported, so
 * this file does not pull three in for one string constant. `getHex()` defaults
 * to it; it is passed explicitly because the default is a library setting and a
 * hex that silently became linear would name every surface wrong at once.
 */
const SRGB = "srgb";

/** Are two rasterisations the SAME GEOMETRY, pixel for pixel and mesh for mesh? */
export function sameGeometry(a, b) {
  if (a.meshHex.length !== b.meshHex.length) return `mesh count ${a.meshHex.length} vs ${b.meshHex.length}`;
  for (let i = 0; i < a.mesh.length; i++) if (a.mesh[i] !== b.mesh[i]) return `mesh ordinal differs at pixel ${i}: ${a.mesh[i]} vs ${b.mesh[i]}`;
  return null;
}

/**
 * Name every mesh by the kit surface it wears, using agreement across peoples.
 *
 * `rasters` is `{ people -> rasterise(...) }` for the peoples whose kits are in
 * `kits` — the FOUR, not the unsworn, because the unsworn is the thing being
 * compared against and its tunic does not come out of `kitFor` at all (the
 * class accent shifts the dye lot when nobody owns the hue). The unsworn man's
 * surfaces are found by ordinal, which is what makes the comparison matched.
 */
export function nameMeshes(rasters, kits, surfaces) {
  const peoples = Object.keys(rasters);
  const n = rasters[peoples[0]].meshHex.length;
  const label = new Array(n).fill(null);
  const ambiguous = [];
  for (let i = 0; i < n; i++) {
    const hits = surfaces.filter((s) => peoples.every((p) => rasters[p].meshHex[i] === kits[p][s]));
    if (hits.length === 1) label[i] = hits[0];
    else if (hits.length > 1) ambiguous.push({ ordinal: i, hits });
  }
  return { label, ambiguous };
}

/** One pixel eroded off every edge, 4-neighbour, so no blend belongs to two surfaces. */
export function erode(mask, w, h) {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      if (mask[p - 1] && mask[p + 1] && mask[p - w] && mask[p + w]) out[p] = 1;
    }
  }
  return out;
}

/**
 * The per-surface masks for one staged man at one bearing.
 *
 * `buildGroup(people)` must return the scene graph for that man; `kitOf` the
 * kit the shipped resolvers give him. The masks are taken off the FIRST
 * people's rasterisation and every other rasterisation — the unsworn included —
 * is asserted identical to it, so the sworn frame and its control are read
 * through one array and a difference cannot be a difference of denominator.
 */
export function surfaceMasks({ buildGroup, kitOf, peoples, surfaces, lens, turnDeg, unsworn = "none" }) {
  const rasters = {};
  for (const p of peoples) rasters[p] = rasterise(buildGroup(p), lens, turnDeg);
  const base = rasters[peoples[0]];
  const problems = [];
  const bare = rasterise(buildGroup(unsworn), lens, turnDeg);
  for (const p of peoples.slice(1)) {
    const why = sameGeometry(base, rasters[p]);
    if (why) problems.push(`${peoples[0]} and ${p} are not the same geometry — ${why}`);
  }
  {
    const why = sameGeometry(base, bare);
    if (why) problems.push(`${peoples[0]} and the unsworn are not the same geometry — ${why}`);
  }
  const kits = Object.fromEntries(peoples.map((p) => [p, kitOf(p)]));
  const { label, ambiguous } = nameMeshes(rasters, kits, surfaces);
  for (const a of ambiguous) problems.push(`mesh ${a.ordinal} answers to ${a.hits.join(" and ")} under all ${peoples.length} peoples`);

  const raw = {}, masks = {}, counts = {};
  for (const s of surfaces) { raw[s] = new Uint8Array(base.mesh.length); }
  for (let i = 0; i < base.mesh.length; i++) {
    const id = base.mesh[i];
    if (id < 0) continue;
    const s = label[id];
    if (s) raw[s][i] = 1;
  }
  for (const s of surfaces) {
    masks[s] = erode(raw[s], lens.w, lens.h);
    let nRaw = 0, nEro = 0;
    for (let i = 0; i < raw[s].length; i++) { if (raw[s][i]) nRaw++; if (masks[s][i]) nEro++; }
    counts[s] = { raw: nRaw, eroded: nEro };
  }
  return { masks, raw, counts, label, cov: base.cov, problems };
}

/**
 * The mean colour of the pixels under a mask, averaged in LINEAR light and
 * converted to CIELAB afterwards — `factionread`'s own rule for a mean, and the
 * reason is in its header: averaging 8-bit sRGB is averaging a curve.
 */
export function patchLab(data, mask, stride = 4) {
  let n = 0, r = 0, g = 0, b = 0;
  const f0 = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  for (let i = 0, p = 0; i < data.length; i += stride, p++) {
    if (mask && !mask[p]) continue;
    n++; r += f0(data[i] / 255); g += f0(data[i + 1] / 255); b += f0(data[i + 2] / 255);
  }
  if (!n) return { n: 0, lab: [0, 0, 0], hex: "—" };
  r /= n; g /= n; b /= n;
  const to8 = (c) => Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  const R = to8(r), G = to8(g), B = to8(b);
  return { n, lab: rgb2lab(R, G, B), hex: `#${R.toString(16).padStart(2, "0")}${G.toString(16).padStart(2, "0")}${B.toString(16).padStart(2, "0")}` };
}
