// FAST INNER-LOOP PROBE for the hair-under-helm question.
//
// `cosmetictest --no-render` is 105 s and answers forty questions. This answers
// the two that are red — the Sutton Hoo's two paid hairstyles — in about ten,
// using the SAME rasteriser, the SAME lens and the SAME reference build, so a
// number printed here is the number that harness will print. It also runs
// `hairFitProbe` on whichever helms are named, because the whole difficulty of
// this defect is that silhouette and fit pull against each other and a change
// that is judged on one of them alone has been wrong four times.
//
// It is a probe, not a gate. Nothing here asserts. `cosmetictest` is the gate.
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "fs";
import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = resolve(ROOT, ".hairprobe");
const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

if (!has("reuse")) {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  const tsc = spawnSync("npx", ["tsc", "src/game/client/characters.ts",
    "--outDir", ".hairprobe", "--target", "es2022", "--module", "esnext",
    "--moduleResolution", "bundler", "--skipLibCheck"], { cwd: ROOT, encoding: "utf8" });
  if (tsc.status !== 0 && !existsSync(WORK)) {
    console.error(tsc.stdout || tsc.stderr); process.exit(2);
  }
}
const found = [];
const walkDir = (d) => { for (const e of readdirSync(d, { withFileTypes: true }))
  e.isDirectory() ? walkDir(resolve(d, e.name)) : e.name === "characters.js" && found.push(resolve(d, e.name)); };
walkDir(WORK);
const CH = await import(pathToFileURL(found[0]).href);
const { ARMOURY, CARD_AIM, buildCharacter, defaultAppearance, hairFitProbe } = CH;

const SLOT_FIELD = {
  helm: "helm", hair: "hairStyle", hairColor: "hairColor", beard: "beardStyle",
  beardColor: "beardColor", cloak: "cloak", armor: "armorColor", warPaint: "warPaint",
};
const slotOf = (name) => ARMOURY.find((s) => s.slot === name);
const RIG = { cls: "huscarl", seed: 13, detail: "high", accents: 0 };
const QUARTER = -35;
const PLAY = { fovDeg: 55, screenH: 900 };
// ONE DEFINITION, read off the module this file already imports. See
// `CARD_AIM` in characters.ts for why it is not written here.
const AIM = CARD_AIM;
const LENS = { portrait: { w: 700, h: 860, dist: 2.05, targetY: 1.76, eyeY: 1.94, fov: 19.5, aim: "head", rasterScale: 0.5 } };

function framing(lens, turnDeg) {
  const a = AIM[lens.aim];
  const rot = Math.PI + (turnDeg * Math.PI) / 180;
  const s = Math.sin(rot), c = Math.cos(rot);
  return { eye: [a.right * c + a.fwd * s, lens.eyeY, (-a.right * s + a.fwd * c) - lens.dist],
    target: [a.right * c + a.fwd * s, lens.targetY, -a.right * s + a.fwd * c], fov: lens.fov };
}
function raster(root, lens, turnDeg) {
  const W = Math.round(lens.w * lens.rasterScale), H = Math.round(lens.h * lens.rasterScale);
  const f = framing(lens, turnDeg);
  const [ex, ey, ez] = f.eye, [tx, ty, tz] = f.target;
  let fx = tx - ex, fy = ty - ey, fz = tz - ez;
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  let sx = -fz, sy = 0, sz = fx;
  const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
  const vx = sy * fz - sz * fy, vy = sz * fx - sx * fz, vz = sx * fy - sy * fx;
  const tanH = Math.tan((f.fov * Math.PI) / 360);
  const aspect = lens.w / lens.h;
  const depth = new Float32Array(W * H).fill(Infinity);
  const cov = new Uint8Array(W * H);
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
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    const idx = o.geometry.index;
    const m = o.matrixWorld.elements;
    const n = idx ? idx.count : pos.count;
    const pa = pos.array, ia = idx?.array;
    for (let t = 0; t < n; t += 3) {
      let ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        const j = ia ? ia[t + k] : t + k;
        const x = pa[j * 3], y = pa[j * 3 + 1], z = pa[j * 3 + 2];
        ok = toScreen(m[0] * x + m[4] * y + m[8] * z + m[12],
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
      for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((B[0] - A[0]) * (py - A[1]) - (px - A[0]) * (B[1] - A[1])) / d;
        const w1 = ((px - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (py - A[1])) / d;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w2 * A[2] + w1 * B[2] + w0 * C[2];
        const o2 = y * W + x;
        if (z < depth[o2]) { depth[o2] = z; cov[o2] = 1; }
      }
    }
  });
  let area = 0;
  for (let i = 0; i < cov.length; i++) area += cov[i];
  return { W, H, depth, cov, area };
}
const DEPTH_MM = 0.002;
function shapeDiff(a, b) {
  let sym = 0, union = 0, moved = 0;
  for (let i = 0; i < a.cov.length; i++) {
    const ca = a.cov[i], cb = b.cov[i];
    if (!ca && !cb) continue;
    union++;
    if (ca !== cb) { sym++; continue; }
    if (Math.abs(a.depth[i] - b.depth[i]) > DEPTH_MM) moved++;
  }
  return { changed: union ? (100 * (sym + moved)) / union : 0, sil: union ? (100 * sym) / union : 0 };
}
function auditDress() {
  const src = readFileSync(resolve(ROOT, "src/app/shot/page.tsx"), "utf8");
  const m = src.match(/const DRESS_IDS: Record<string, string> = \{([\s\S]*?)\}/);
  const ap = {};
  for (const [, slotName, id] of m[1].matchAll(/(\w+):\s*"([^"]+)"/g)) {
    const opt = slotOf(slotName)?.options.find((o) => o.id === id);
    ap[SLOT_FIELD[slotName]] = opt.value;
  }
  return ap;
}
const DRESS = auditDress();
function staged(extra, turn) {
  const c = buildCharacter(RIG.cls, { ...defaultAppearance(RIG.cls), ...DRESS, ...extra },
    RIG.accents, undefined, RIG.detail, RIG.seed);
  c.group.rotation.y = Math.PI + (turn * Math.PI) / 180;
  return c;
}

const helmNames = (flag("helms", "suttonhoo")).split(",");
const hairNames = (flag("hair", "long,braids,short")).split(",");
console.log("");
console.log("[probe] helm         hair      SIL%   verdict     (bar 1.00%, identical below 0.05%)");
for (const helm of helmNames) {
  const base = raster(staged({ helm, hairStyle: flag("base", "shaved") }, QUARTER).group, LENS.portrait, QUARTER);
  for (const hair of hairNames) {
    const w = raster(staged({ helm, hairStyle: hair }, QUARTER).group, LENS.portrait, QUARTER);
    const d = shapeDiff(base, w);
    console.log(`[probe] ${helm.padEnd(12)} ${hair.padEnd(8)} ${d.changed.toFixed(2).padStart(6)}   `
      + (d.changed < 0.05 ? "IDENTICAL" : d.changed < 1.0 ? "FAINT" : "DIFFERS"));
  }
}
if (!has("no-fit")) {
  console.log("");
  console.log("[probe] helm         hair      thru mm   frac %   shown %   kept %  worst bearing");
  for (const helm of helmNames) {
    for (const hair of hairNames) {
      for (const cls of (flag("classes", "huscarl,berserker")).split(",")) {
        for (const seed of (flag("seeds", "13,7932")).split(",").map(Number)) {
        const r = hairFitProbe(cls, seed, helm, hair);
        console.log(`[probe] ${helm.padEnd(12)} ${hair.padEnd(8)} ${r.throughMm.toFixed(1).padStart(7)}  `
          + `${(r.throughFrac * 100).toFixed(2).padStart(7)}  ${(r.showFrac * 100).toFixed(1).padStart(8)}  `
          + `${(r.keptFrac * 100).toFixed(0).padStart(6)}  ${r.worstAzDeg.toFixed(0)}/${r.worstElDeg.toFixed(0)} deg  ${cls} s${seed}`);
        }
      }
    }
  }
}
console.log("");

// ---- WHY: the same binning `hairFitProbe` does, with the offenders named ----
// A number without a place is not a diagnosis. This prints, for the worst hair
// vertices, the bin, the point's own height, the inner wall it violated and
// WHICH MESH supplied that wall — which is the one question the probe's own
// output cannot answer and the reason four constructions were guessed at.
if (has("why")) {
  const THREE = await import("three");
  const helm = flag("helms", "suttonhoo").split(",")[0];
  const hair = flag("hair", "long").split(",")[0];
  const cls = flag("classes", "huscarl").split(",")[0];
  const TINT = 0x2fe07a;
  const SEED = parseInt(flag("seed", "13"), 10);
  const meshes = (a) => {
    const c = buildCharacter(cls, { ...defaultAppearance(cls), beardStyle: "none", hairColor: TINT, ...a },
      0x8a6b3f, undefined, "high", SEED);
    let pivot = null;
    c.group.traverse((o) => { if (!pivot && o.name?.endsWith("headPivot")) pivot = o; });
    const from = pivot ?? c.group;
    from.updateMatrixWorld(true);
    const out = new Map();
    const v = new THREE.Vector3();
    from.traverse((o) => {
      if (!o.isMesh) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      const hex = mat?.color?.getHexString?.() ?? "??";
      const pos = o.geometry?.attributes?.position; if (!pos) return;
      const idx = o.geometry.index;
      let arr = out.get(hex); if (!arr) { arr = []; out.set(hex, arr); }
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i++) {
        const j = idx ? idx.array[i] : i;
        v.fromBufferAttribute(pos, j).applyMatrix4(o.matrixWorld);
        arr.push(v.x, v.y, v.z);
      }
    });
    return out;
  };
  const bare = meshes({ helm: "none", hairStyle: "shaved" });
  const capped = meshes({ helm, hairStyle: "shaved" });
  const full = meshes({ helm, hairStyle: hair });
  const coverHex = [...capped.keys()].filter((h) => !bare.has(h));
  const cy = (() => { let lo = 1e9, hi = -1e9;
    for (const a of bare.values()) for (let i = 1; i < a.length; i += 3) { lo = Math.min(lo, a[i]); hi = Math.max(hi, a[i]); }
    return null; })();
  // The skull centre the probe uses is `S.headY`; recover it from the mail's
  // own two extreme rings rather than re-deriving the skeleton.
  const CY = parseFloat(flag("cy", "1.813"));
  const NU = 144, NV = 72;
  const inner = new Float64Array(NU * NV).fill(Infinity);
  const coverLo = new Float64Array(NU * NV).fill(Infinity);
  const owner = new Array(NU * NV).fill("-");
  const ownerPt = new Array(NU * NV).fill(null);
  const binOf = (x, y, z) => {
    const dy = y - CY; const r = Math.hypot(x, dy, z) || 1e-9;
    const az = Math.atan2(x, z); const el = Math.asin(Math.max(-1, Math.min(1, dy / r)));
    return [Math.max(0, Math.min(NU - 1, Math.floor(((az + Math.PI) / (Math.PI * 2)) * NU))),
      Math.max(0, Math.min(NV - 1, Math.floor(((el + Math.PI / 2) / Math.PI) * NV))), r];
  };
  for (const hex of coverHex) {
    const a = capped.get(hex);
    for (let t = 0; t + 8 < a.length; t += 9) {
      const px = [a[t], a[t + 3], a[t + 6]], py = [a[t + 1], a[t + 4], a[t + 7]], pz = [a[t + 2], a[t + 5], a[t + 8]];
      for (const [wa, wb, wc] of [[1,0,0],[0,1,0],[0,0,1],[0.5,0.5,0],[0,0.5,0.5],[0.5,0,0.5],[1/3,1/3,1/3]]) {
        const x = px[0]*wa+px[1]*wb+px[2]*wc, y = py[0]*wa+py[1]*wb+py[2]*wc, z = pz[0]*wa+pz[1]*wb+pz[2]*wc;
        const [iu, iv, r] = binOf(x, y, z); const k = iv * NU + iu;
        if (r < inner[k]) { inner[k] = r; owner[k] = hex; ownerPt[k] = [x, y, z]; }
        if (y < coverLo[k]) coverLo[k] = y;
      }
    }
  }
  const solid = new Uint8Array(NU * NV);
  for (let iv = 1; iv < NV - 1; iv++) for (let iu = 0; iu < NU; iu++) {
    const k = iv * NU + iu; if (!Number.isFinite(inner[k])) continue;
    const l = iv * NU + ((iu + NU - 1) % NU), r = iv * NU + ((iu + 1) % NU);
    if (Number.isFinite(inner[l]) && Number.isFinite(inner[r]) && Number.isFinite(inner[k - NU]) && Number.isFinite(inner[k + NU])) solid[k] = 1;
  }
  const hairPts = full.get(TINT.toString(16).padStart(6, "0")) ?? [];
  const rows = [];
  for (let i = 0; i + 2 < hairPts.length; i += 3) {
    const [iu, iv, r] = binOf(hairPts[i], hairPts[i + 1], hairPts[i + 2]);
    const k = iv * NU + iu;
    if (!Number.isFinite(inner[k])) continue;
    if (hairPts[i + 1] < coverLo[k] - 0.002) continue;
    if (!solid[k]) continue;
    rows.push({ d: (r - inner[k]) * 1000, az: (iu + 0.5) / NU * 360 - 180, el: (iv + 0.5) / NV * 180 - 90,
      y: hairPts[i + 1], x: hairPts[i], z: hairPts[i + 2], r, inner: inner[k], lo: coverLo[k], own: owner[k], wp: ownerPt[k] });
  }
  rows.sort((a, b) => b.d - a.d);
  console.log(`[why] ${cls} ${helm} ${hair}: ${rows.length} covered hair vertices, worst first`);
  for (const q of rows.slice(0, 14)) console.log(
    `[why] d=${q.d.toFixed(1)}mm az=${q.az.toFixed(0)} el=${q.el.toFixed(0)} ` +
    `pt=(${q.x.toFixed(3)},${q.y.toFixed(3)},${q.z.toFixed(3)}) r=${q.r.toFixed(3)} inner=${q.inner.toFixed(3)} coverLo=${q.lo.toFixed(3)} by=${q.own} wall=(${q.wp?.map((n)=>n.toFixed(3)).join(",")})`);
}
