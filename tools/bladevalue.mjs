#!/usr/bin/env node
// ============================================================
// BLADEVALUE — is the blade the BRIGHTEST honest thing in its neighbourhood, and
// does it show a forged stripe, in a lit frame of the real game?
//
//   /tmp/claude-0/cap node tools/bladevalue.mjs               five kit cards
//   /tmp/claude-0/cap node tools/bladevalue.mjs --all         all four classes at 0 and -35
//   /tmp/claude-0/cap node tools/bladevalue.mjs --only=huscarl:0,warden:0
//   /tmp/claude-0/cap node tools/bladevalue.mjs --mutant=whiteout|flat|blackout
//   /tmp/claude-0/cap node tools/bladevalue.mjs --lever=metalness:1,roughness:0.2
//
// WHY THIS EXISTS. CHAR-PLAN CH-24: "Steel is a mirror: blades are the darkest
// thing on the man". `steel` was metalness 1, roughness 0.18-0.22, and a metal
// with no diffuse term has NOTHING to show but the environment - here a dusk sky
// that is darker than the turf. The plan's own reading on the kit card: the sword
// blade's median luma is 35 against a ground of 88, the spear head's 18. That
// inverts the one rule the fight lens needs (LORE 0.2 rule 4: metal is the only
// shine) and it is invisible to every CPU ruler in the repository, because a
// material's `roughness` is a number and what it LOOKS like is a function of the
// sky, the key light, the grade and the pose. `weaponshape` reads the geometry;
// this reads the pixels.
//
// WHAT IT MEASURES, per frame, on the game's own screenshot:
//
//   1. WHICH PIXELS ARE THE BLADE. Not a crop, not a colour key: the page is
//      asked. The scene the renderer drew is drawn AGAIN through the game's own
//      camera with every mesh's material swapped for a flat class colour (weapon
//      bright metal, weapon dark inlay, other weapon, the man, the world), and
//      the frame buffer is read back. Same skin weights, same pose, same depth
//      test, so an occluded blade is occluded here too. The screenshot is taken
//      FIRST and the loop is frozen, so both are one instant.
//   2. THE GROUND BEHIND IT: the median luma of the WORLD pixels (turf, fence,
//      sky - not the man) in a ring 4-16 px round the blade.
//   3. BLADE / GROUND: the median luma of the blade's own pixels over that.
//      Bar 0.9-2.0. Below 0.9 the blade is darker than the dirt it is in front of
//      (HEAD); above 2.0 it is a blown highlight, which is the OTHER way to fail
//      and the reason the Dane axe was once "a white blob beside the helm".
//   4. THE STRIPE: the CIELAB lightness of the bright metal against the dark
//      inlay - the fuller against the flats for a sword or a seax, the leaf
//      against the socket and wings for a spear, the bit against the cheeks for
//      an axe. Bar >= 20 L*. A blade with no dark stripe reads as a slab.
//   5. CLIPPING: no more than 12% of the blade's pixels at luma >= 250.
//
// AND HOW IT CAN BE FOOLED, said here because the verdict line will not: it is
// only as good as the class map, which is the material NAMES the builders give
// (hex in the name: `steel:9ea2a6`) - a builder that hid a dark fuller inside a
// bright material would score a stripe of 0, which is right; one that called a
// blown highlight "dark" would score a stripe and fail the ratio. `--mutant`
// shows it: `whiteout` (a blade at flat white) passes the stripe and dies on the
// ratio and the clip; `flat` (one mid grey) passes the ratio and dies on the
// stripe. Neither bar alone certifies a blade (PROCESS R3).
//
// IT CANNOT SEE a pommel, a guard or a rivet at this scale (a 2.4 mm pixel), and
// it says NOTHING about the fight lens: `weaponkitfight` is the picture for that.
// A frame where the blade has fewer than 150 pixels is NOT MEASURABLE and is
// printed as such on the verdict line (R4), never read as a pass.
// ============================================================
import { spawn } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import sharp from "sharp";
import { launchOptions, watchBoot, rasteriserNote } from "./lib/browser.mjs";
import { requireFreshBuild } from "./lib/freshbuild.mjs";
import { installVirtualClock, FRAME_MS } from "./lib/vclock.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flagVal = (name, dflt = null) => { const h = argv.find((a) => a.startsWith(`--${name}=`)); return h ? h.slice(name.length + 3) : dflt; };
const has = (n) => argv.includes(`--${n}`);
const MUTANT = flagVal("mutant");
// R1, pull the lever: `--lever=metalness:1,roughness:0.2` sets those on every steel in the weapon, in the page, on
// the build as it stands, so a run says whether the number the ruler reports MOVES when the thing it is about moves.
const LEVER = (() => { const v = flagVal("lever"); if (!v) return null; const o = {}; for (const kv of v.split(",")) { const [k, x] = kv.split(":"); o[k] = Number(x); } return o; })();
const OUT = resolve(ROOT, flagVal("out", "art/bladevalue"));
const PORT = parseInt(process.env.PORT || String(3300 + (process.pid % 300)), 10);
const KIT = { w: 700, h: 900 }; // CARDS.kitcard in src/app/shot/page.tsx; asked of /shot?roster=1 below

const KIND = { huscarl: "sword", warden: "spear", runekeeper: "seax", berserker: "axe" };
let FRAMES = [["huscarl", 0], ["huscarl", -35], ["warden", 0], ["berserker", 0], ["runekeeper", 0]];
if (has("all")) FRAMES = ["huscarl", "warden", "runekeeper", "berserker"].flatMap((c) => [[c, 0], [c, -35]]);
const only = flagVal("only");
if (only) FRAMES = only.split(",").map((s) => { const [c, t] = s.split(":"); return [c, Number(t ?? 0)]; });

// bars
const RATIO_LO = 0.9, RATIO_HI = 2.0, STRIPE_MIN = 20, CLIP_MAX = 0.12, MIN_PX = 150;

let pass = 0, fail = 0;
const failures = [];
const notMeasurable = [];
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (ok) pass++; else { fail++; failures.push(name); }
};

// ---- colour ---------------------------------------------------------------
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b; // Rec.709 on the sRGB bytes: the plan's 0-255 readings
const Lstar = (r, g, b) => { const Y = 0.2126729 * lin(r) + 0.7151522 * lin(g) + 0.072175 * lin(b); return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y; };
const median = (a) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[s.length >> 1]; };

// ---- server ---------------------------------------------------------------
// A stale bundle is REFUSED, not fallen back from: this tool photographs, and a picture of the previous
// commit's weapon is the wrong answer to "is this blade bright enough".
requireFreshBuild(ROOT, "bladevalue");
console.log(`[bladevalue] ${rasteriserNote()}`);
const server = spawn("node", ["custom-server.mjs"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" }, stdio: "ignore" });
watchBoot(server, "bladevalue");
const stop = () => { if (server && !server.killed) server.kill("SIGTERM"); };
process.on("SIGINT", () => { stop(); process.exit(130); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const t0 = Date.now(); ;) {
  try { if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) break; } catch { /* not up */ }
  if (Date.now() - t0 > 240000) { console.error("[bladevalue] server never came up"); stop(); process.exit(2); }
  await sleep(500);
}
mkdirSync(OUT, { recursive: true });

// ---- the page-side passes ---------------------------------------------------
/** In the page: find the game's camera, apply a mutant, and freeze the loop. */
async function preparePage(page, mutant, lever) {
  return page.evaluate(async ([mut, lev]) => {
    const scene = window.__bretwaldaScene, renderer = window.__bretwaldaRenderer;
    if (!scene || !renderer) return { error: "the page publishes no __bretwaldaScene / __bretwaldaRenderer" };
    const weapons = [];
    scene.traverse((o) => { if (o.name === "weapon" && !o.isMesh) weapons.push(o); });
    if (!weapons.length) return { error: "no object named `weapon` in the scene" };
    if (mut) {
      // A wrong blade, made in place, to show the bars are not vacuous.
      weapons[0].traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const m = o.material.clone();
        const name = o.material.name || "";
        const paint = (hex) => { m.map = m.normalMap = m.roughnessMap = m.metalnessMap = m.aoMap = null; m.metalness = 0; m.roughness = 1; m.color.set(0x000000); m.emissive.set(hex); m.emissiveIntensity = 1; m.toneMapped = false; };
        if (/^(steel|weldsteel|serpentsteel|iron|interlace)/.test(name)) {
          if (mut === "whiteout") paint(name.startsWith("iron") ? 0x303030 : 0xffffff);
          else if (mut === "flat") paint(0x8a8a8a);
          else if (mut === "blackout") paint(0x101010);
        }
        m.needsUpdate = true;
        o.material = m;
      });
    }
    if (lev) {
      weapons[0].traverse((o) => {
        if (!o.isMesh || !o.material || !/^(steel|weldsteel|serpentsteel)/.test(o.material.name || "")) return;
        const m = o.material.clone();
        // a scalar means nothing under a map that multiplies it: take the maps out so the lever is the whole story
        if ("metalness" in lev) { m.metalness = lev.metalness; m.metalnessMap = null; }
        if ("roughness" in lev) { m.roughness = lev.roughness; m.roughnessMap = null; }
        m.needsUpdate = true;
        o.material = m;
      });
    }
    const cams = new Set();
    const orig = renderer.render;
    renderer.render = function (s, c) { if (c && c.isPerspectiveCamera) cams.add(c); return orig.call(this, s, c); };
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    renderer.render = orig;
    const cam = [...cams].sort((a, b) => (b.far - b.near) - (a.far - a.near))[0];
    if (!cam) return { error: "renderer.render was never called with a perspective camera in 3 frames" };
    window.__bvCam = cam;
    // Freeze: no further frame is scheduled. One may already be in flight; the caller waits it out.
    window.requestAnimationFrame = () => 0;
    return { fov: cam.fov, near: cam.near, far: cam.far, aspect: cam.aspect, frame: renderer.info.render.frame };
  }, [mutant, lever]);
}

/** In the page, after the screenshot: redraw the same scene with class colours and read it back. */
async function classPass(page) {
  return page.evaluate(async () => {
    const scene = window.__bretwaldaScene, renderer = window.__bretwaldaRenderer, cam = window.__bvCam;
    const parseHex = (name) => { const m = /:([0-9a-f]{6})/.exec(name || ""); return m ? parseInt(m[1], 16) : null; };
    const lstar = (hex) => {
      const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const Y = 0.2126729 * lin((hex >> 16) & 255) + 0.7151522 * lin((hex >> 8) & 255) + 0.072175 * lin(hex & 255);
      return Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y;
    };
    const chroma = (hex) => {
      const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
      return (Math.max(r, g, b) - Math.min(r, g, b)) / 2.55; // a cheap stand-in: 0-100
    };
    let proto = null;
    scene.traverse((o) => { if (!proto && o.isMesh && o.material && o.material.isMeshStandardMaterial) proto = o.material; });
    if (!proto) return { error: "no MeshStandardMaterial to clone" };
    const mk = (r, g, b) => {
      const m = proto.clone();
      m.color.setRGB(0, 0, 0); m.emissive.setRGB(r, g, b); m.emissiveIntensity = 1;
      m.map = m.normalMap = m.roughnessMap = m.metalnessMap = m.aoMap = m.emissiveMap = m.alphaMap = m.bumpMap = null;
      m.metalness = 0; m.roughness = 1; m.envMap = null; m.envMapIntensity = 0;
      m.transparent = false; m.opacity = 1; m.vertexColors = false; m.toneMapped = false; m.alphaTest = 0;
      m.onBeforeCompile = () => {}; m.customProgramCacheKey = () => "bladevalue-class";
      m.side = 2; // double sided: a blade seen through its own back is still the blade
      m.needsUpdate = true;
      return m;
    };
    const M = { world: mk(0, 0, 0), bright: mk(1, 0, 0), dark: mk(0, 1, 0), other: mk(0, 0, 1), body: mk(1, 1, 1) };
    const weapons = [];
    scene.traverse((o) => { if (o.name === "weapon" && !o.isMesh) weapons.push(o); });
    const inWeapon = (o) => { for (let p = o; p; p = p.parent) if (weapons.includes(p)) return true; return false; };
    const inMan = (o) => { for (let p = o; p; p = p.parent) if (typeof p.name === "string" && p.name.startsWith("warrior:")) return true; return false; };
    const counts = { bright: 0, dark: 0, other: 0, body: 0, world: 0, hidden: 0 };
    scene.traverse((o) => {
      if (o.isPoints || o.isSprite || o.isLine) { o.visible = false; counts.hidden++; return; }
      if (!o.isMesh) return;
      if (inWeapon(o)) {
        const name = o.material?.name || "";
        const hex = parseHex(name);
        const surf = name.split(":")[0];
        const metal = /^(steel|weldsteel|serpentsteel)$/.test(surf);
        const L = hex === null ? 50 : lstar(hex), C = hex === null ? 0 : chroma(hex);
        if (metal && C < 16 && L >= 55) { o.material = M.bright; counts.bright++; }
        else if ((metal || surf === "iron" || surf === "interlace") && L <= 38) { o.material = M.dark; counts.dark++; }
        else { o.material = M.other; counts.other++; }
      } else if (inMan(o)) { o.material = M.body; counts.body++; }
      else if (o.material && o.material.transparent) { o.visible = false; counts.hidden++; }
      else { o.material = M.world; counts.world++; }
    });
    scene.background = null; scene.fog = null; scene.environment = null;
    const w = renderer.getContext().drawingBufferWidth, h = renderer.getContext().drawingBufferHeight;
    // A SECOND RENDERER, on a canvas of its own, with a drawing buffer that is kept: the game's own
    // framebuffer belongs to the game (its post chain, its clears, a buffer the compositor may have
    // presented and emptied), and nothing that is read back from it is a measurement. Same scene, same
    // camera, same skeletons: only the materials are ours.
    let buf = null, method = "";
    try {
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const R2 = new renderer.constructor({ canvas: cv, antialias: false, alpha: false, preserveDrawingBuffer: true });
      R2.setPixelRatio(1); R2.setSize(w, h, false); R2.toneMapping = 0; R2.setClearColor(0x000000, 1);
      R2.render(scene, cam);
      const g2 = R2.getContext(); buf = new Uint8Array(w * h * 4);
      g2.readPixels(0, 0, w, h, g2.RGBA, g2.UNSIGNED_BYTE, buf);
      method = "second renderer";
      R2.dispose();
    } catch (e) {
      const gl = renderer.getContext();
      renderer.toneMapping = 0; renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1); renderer.autoClear = true;
      renderer.render(scene, cam);
      buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      method = `the game's renderer (a second one threw: ${String(e).slice(0, 80)})`;
    }
    const cls = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const sy = h - 1 - y;
      for (let x = 0; x < w; x++) {
        const i = (sy * w + x) * 4;
        const r = buf[i] > 150, g = buf[i + 1] > 150, b = buf[i + 2] > 150;
        cls[y * w + x] = r && g && b ? 4 : r && !g && !b ? 1 : g && !r && !b ? 2 : b && !r && !g ? 3 : 0;
      }
    }
    let s = "";
    const CH = 0x8000;
    for (let i = 0; i < cls.length; i += CH) s += String.fromCharCode.apply(null, cls.subarray(i, i + CH));
    return { w, h, counts, method, b64: btoa(s) };
  });
}

// ---- pixel analysis -------------------------------------------------------
function erode(mask, W, H) {
  const out = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - W] && mask[i + W]) out[i] = 1;
  }
  return out;
}
/** Chebyshev distance to the nearest set pixel, capped at `cap` (multi-source BFS). */
function distance(mask, W, H, cap) {
  const d = new Uint8Array(W * H).fill(255);
  let frontier = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) { d[i] = 0; frontier.push(i); }
  for (let step = 1; step <= cap; step++) {
    const next = [];
    for (const i of frontier) {
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (d[j] === 255) { d[j] = step; next.push(j); }
      }
    }
    frontier = next;
  }
  return d;
}

function analyse(png, W, H, cls, kind) {
  // nearest-neighbour class map at the screenshot's size
  const C = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) C[y * W + x] = cls.data[Math.min(cls.h - 1, Math.floor(y * cls.h / H)) * cls.w + Math.min(cls.w - 1, Math.floor(x * cls.w / W))];
  const px = png.data, ch = png.channels;
  const at = (i) => [px[i * ch], px[i * ch + 1], px[i * ch + 2]];
  const bright = erode(C.map((v) => (v === 1 ? 1 : 0)), W, H);
  const dark = erode(C.map((v) => (v === 2 ? 1 : 0)), W, H);
  const blade = new Uint8Array(W * H);
  const bladeRaw = new Uint8Array(W * H);
  for (let i = 0; i < blade.length; i++) { blade[i] = bright[i] || dark[i] ? 1 : 0; bladeRaw[i] = C[i] === 1 || C[i] === 2 ? 1 : 0; }

  const nB = bright.reduce((a, v) => a + v, 0), nD = dark.reduce((a, v) => a + v, 0);
  const out = { nBright: nB, nDark: nD, nBlade: nB + nD };
  if (out.nBlade < MIN_PX || nB < 60) return { ...out, measurable: false };

  // ground: WORLD pixels in a ring 4-16 px round the blade
  const dist = distance(bladeRaw, W, H, 16);
  const ring = [], ringAll = [];
  for (let i = 0; i < C.length; i++) {
    if (dist[i] >= 4 && dist[i] <= 16 && C[i] !== 1 && C[i] !== 2 && C[i] !== 3) {
      const [r, g, b] = at(i);
      ringAll.push(luma(r, g, b));
      if (C[i] === 0) ring.push(luma(r, g, b));
    }
  }
  const useRing = ring.length >= 80 ? ring : ringAll;
  out.groundMedian = median(useRing);
  out.groundSource = ring.length >= 80 ? `${ring.length} world px` : `${ringAll.length} px incl. the man (only ${ring.length} world px in the ring)`;

  const bl = [], clip = [];
  const Lb = [], Ld = [];
  // the principal axis of the bright metal, for the sword and seax fuller zone
  let mx = 0, my = 0, n = 0;
  for (let i = 0; i < bright.length; i++) if (bright[i]) { mx += i % W; my += (i / W) | 0; n++; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < bright.length; i++) if (bright[i]) { const dx = (i % W) - mx, dy = ((i / W) | 0) - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ax = Math.cos(th), ay = Math.sin(th);
  const ts = [];
  for (let i = 0; i < bright.length; i++) if (bright[i]) ts.push(((i % W) - mx) * ax + (((i / W) | 0) - my) * ay);
  ts.sort((a, b) => a - b);
  const t0 = ts[Math.floor(ts.length * 0.02)], t1 = ts[Math.floor(ts.length * 0.98)];
  const zlo = t0 + 0.2 * (t1 - t0), zhi = t1 - 0.2 * (t1 - t0);
  const extent = t1 - t0;
  for (let i = 0; i < blade.length; i++) {
    if (!blade[i]) continue;
    const [r, g, b] = at(i);
    const l = luma(r, g, b);
    bl.push(l); clip.push(l >= 250 ? 1 : 0);
    const x = i % W, y = (i / W) | 0;
    const t = (x - mx) * ax + (y - my) * ay;
    const Ls = Lstar(r, g, b);
    if (bright[i]) {
      if (kind === "sword" || kind === "seax") { if (t >= zlo && t <= zhi) Lb.push(Ls); } else Lb.push(Ls);
    } else if (dark[i]) {
      if (kind === "sword" || kind === "seax") { if (t >= zlo && t <= zhi) Ld.push(Ls); }
      else if (Math.hypot(x - mx, y - my) <= 1.3 * extent) Ld.push(Ls);
    }
  }
  out.bladeMedian = median(bl);
  out.ratio = out.bladeMedian / out.groundMedian;
  out.clipFrac = clip.reduce((a, v) => a + v, 0) / clip.length;
  out.brightL = median(Lb); out.darkL = median(Ld);
  out.nDarkUsed = Ld.length; out.nBrightUsed = Lb.length;
  out.stripe = Ld.length >= 25 ? out.brightL - out.darkL : NaN;
  out.axisPx = extent;
  out.measurable = true;
  out.bbox = (() => {
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let i = 0; i < blade.length; i++) if (bladeRaw[i]) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1];
  })();
  return { ...out, C, dist };
}

// ---- the run ----------------------------------------------------------------
const browser = await chromium.launch(launchOptions());
const results = [];
try {
  const ctx = await browser.newContext({ viewport: { width: KIT.w, height: KIT.h }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
  await ctx.addInitScript(installVirtualClock, FRAME_MS);
  for (const [cls, turn] of FRAMES) {
    const kind = KIND[cls];
    const tag = `${cls}${turn < 0 ? "m" : ""}${Math.abs(turn)}`;
    console.log(`\n[bladevalue] ${cls} (${kind}) at ${turn} deg${MUTANT ? `  [MUTANT ${MUTANT}]` : ""}${LEVER ? `  [LEVER ${JSON.stringify(LEVER)}]` : ""}`);
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const url = `http://localhost:${PORT}/shot?preset=kitcard&cls=${cls}&turn=${turn}&clean=1`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300000 });
    try { await page.waitForFunction(() => window.__shotReady === true || typeof window.__shotError === "string", null, { timeout: 300000 }); }
    catch { console.log("  the renderer never signalled __shotReady"); await page.close(); notMeasurable.push(tag); continue; }
    // wait for the authored man, as shoot.mjs does: a frame before the swap is the wrong man
    { const t0 = Date.now(); let last = -1, quiet = 0;
      while (Date.now() - t0 < 90000) { const n = await page.evaluate(() => (window.__authoredHeads ?? []).length); quiet = n === last ? quiet + 1 : 0; last = n; if (n > 0 && quiet >= 6) break; await page.waitForTimeout(500); }
      console.log(`  authored men drawn ${last}`); }
    const prep = await preparePage(page, MUTANT, LEVER);
    if (prep.error) { console.log(`  ${prep.error}`); await page.close(); notMeasurable.push(tag); continue; }
    // wait out the frame that may already be in flight
    { const t0 = Date.now(); let f = await page.evaluate(() => window.__bretwaldaRenderer.info.render.frame), still = 0;
      while (Date.now() - t0 < 60000 && still < 4) { await page.waitForTimeout(1500); const g = await page.evaluate(() => window.__bretwaldaRenderer.info.render.frame); still = g === f ? still + 1 : 0; f = g; } }
    const shot = await page.screenshot({ timeout: 300000 });
    const cp = await classPass(page);
    if (cp.error) { console.log(`  ${cp.error}`); await page.close(); notMeasurable.push(tag); continue; }
    const png = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = png.info.width, H = png.info.height;
    const cbuf = Buffer.from(cp.b64, "base64");
    const res = analyse({ data: png.data, channels: png.info.channels }, W, H, { data: cbuf, w: cp.w, h: cp.h }, kind);
    console.log(`  camera fov ${prep.fov.toFixed(2)} aspect ${prep.aspect.toFixed(3)}; meshes by class ${JSON.stringify(cp.counts)}; frame ${W}x${H}, class map ${cp.w}x${cp.h} by ${cp.method}`);
    // R5: the pictures, so the class map can be looked at as well as believed
    writeFileSync(resolve(OUT, `${tag}.png`), shot);
    if (res.C) {
      const rgb = Buffer.alloc(W * H * 3);
      const pal = [[10, 10, 10], [255, 60, 60], [40, 220, 90], [70, 110, 255], [120, 120, 120]];
      for (let i = 0; i < res.C.length; i++) { const p = pal[res.C[i]]; const a = res.C[i] === 0 ? 0.0 : 0.85; for (let k = 0; k < 3; k++) rgb[i * 3 + k] = Math.round(p[k] * a + png.data[i * png.info.channels + k] * (1 - a)); }
      await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(resolve(OUT, `${tag}-classes.png`));
      const [x0, y0, x1, y1] = res.bbox; const pad = 30;
      const cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, y0 - pad), cw = Math.min(W, x1 + pad) - cx0, chh = Math.min(H, y1 + pad) - cy0;
      await sharp(shot).extract({ left: cx0, top: cy0, width: cw, height: chh }).resize({ width: Math.min(1400, cw * 3), kernel: "nearest" }).png().toFile(resolve(OUT, `${tag}-crop.png`));
    }
    await page.close();

    if (!res.measurable) {
      console.log(`  NOT MEASURABLE: ${res.nBlade} blade pixels (${res.nBright} bright, ${res.nDark} dark) after erosion; the floor is ${MIN_PX}`);
      notMeasurable.push(tag);
      results.push({ tag, cls, turn, kind, measurable: false });
      continue;
    }
    console.log(`  blade ${res.nBlade} px (${res.nBright} bright + ${res.nDark} dark), ${res.axisPx.toFixed(0)} px long; median luma ${res.bladeMedian.toFixed(0)} against a ground of ${res.groundMedian.toFixed(0)} (${res.groundSource})`);
    check(`[${tag}] the blade is not darker than the ground it stands in front of, nor blown out: blade / ground ${RATIO_LO}-${RATIO_HI}`, res.ratio >= RATIO_LO && res.ratio <= RATIO_HI, `${res.ratio.toFixed(2)}  (${res.bladeMedian.toFixed(0)} / ${res.groundMedian.toFixed(0)})`);
    check(`[${tag}] the blade is not clipped: at most ${CLIP_MAX * 100}% of its pixels at luma >= 250`, res.clipFrac <= CLIP_MAX, `${(res.clipFrac * 100).toFixed(1)}%`);
    check(`[${tag}] the ${kind === "sword" || kind === "seax" ? "fuller" : kind === "spear" ? "socket and wings" : "cheeks"} read as a stripe against the bright metal: >= ${STRIPE_MIN} L*`,
      Number.isFinite(res.stripe) && res.stripe >= STRIPE_MIN,
      Number.isFinite(res.stripe) ? `${res.brightL.toFixed(1)} L* bright (${res.nBrightUsed} px) against ${res.darkL.toFixed(1)} L* dark (${res.nDarkUsed} px) = ${res.stripe.toFixed(1)}` : `only ${res.nDarkUsed} dark px in the zone: no stripe found`);
    results.push({ tag, cls, turn, kind, measurable: true, ratio: res.ratio, stripe: res.stripe, clip: res.clipFrac, bladeMedian: res.bladeMedian, groundMedian: res.groundMedian });
  }
} finally {
  await browser.close();
  stop();
}

console.log("");
console.log("[bladevalue] readings: " + results.map((r) => (r.measurable ? `${r.tag} ${r.bladeMedian.toFixed(0)}/${r.groundMedian.toFixed(0)}=${r.ratio.toFixed(2)} stripe ${Number.isFinite(r.stripe) ? r.stripe.toFixed(0) : "none"}` : `${r.tag} not measurable`)).join(" | "));
const defer = notMeasurable.length ? ` - WITH ${notMeasurable.length} frame(s) NOT MEASURABLE (${notMeasurable.join(", ")}), which is a deferral and not a pass` : "";
if (MUTANT) {
  console.log(`[bladevalue] MUTANT ${MUTANT}: ${fail} check(s) failed. ${fail > 0 ? "The ruler CAUGHT it." : "The ruler MISSED it: THIS IS A HOLE."}`);
  process.exit(fail > 0 ? 0 : 1);
}
if (results.length === 0) { console.log("[bladevalue] FAIL: nothing was measured"); process.exit(1); }
console.log(fail === 0 ? `[bladevalue] PASS: ${pass} checks over ${results.length} frames${defer}` : `[bladevalue] FAIL: ${fail} of ${pass + fail} checks${defer}`);
process.exit(fail === 0 ? 0 : 1);
