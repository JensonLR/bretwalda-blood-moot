#!/usr/bin/env node
/**
 * HUDSPACE — THE FOURTH WORD. "BUGGY", MEASURED IN THE SPACE IT HAPPENS IN.
 *
 *   node tools/hudspace.mjs              a 30 s seven-bot fight, desktop viewport
 *   node tools/hudspace.mjs --secs=60    longer
 *   node tools/hudspace.mjs --shots=8    also write frames to .jank/hudspace/
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS. The owner said, of the shipped game:
 *
 *     "The game currently feels visually buggy / laggy / jolty / jumpy
 *      when playing."
 *
 * `tools/janktest.mjs` separated the four words and then said, on its own
 * verdict line, that it could not measure the first one:
 *
 *     "BUGGY is not measured. A wrong pixel is a picture, not a pacing number."
 *
 * That deferral was honest and it stood for a round. Three wrong pixels were
 * then found by a human looking at `.jank/strip/index.html`, which is exactly
 * where that deferral said they would have to be found:
 *
 *   1. A NAMEPLATE FOR A MAN WHO IS NOT ON SCREEN. The plate is a world-space
 *      object at the warrior's head, so the renderer keeps it whenever its
 *      bounding sphere touches the frustum — including when the warrior himself
 *      is well outside it. What the player sees is a name and a health bar
 *      sliced in half against the left edge of the screen, hanging over empty
 *      ground. Seen in strip frame f008: "Swo" and a bar fragment at x=0 with
 *      no warrior anywhere near them.
 *
 *   2. DAMAGE NUMBERS OVERLAPPING INTO A BLOB. Seen in strip frame f003:
 *      "62" and "102" printed across each other, which reads as neither.
 *
 *   3. DAMAGE NUMBERS OVER EMPTY GROUND. A number is spawned on the body and
 *      then flies for up to 1.25 s on its own ballistic arc while the fight
 *      moves; the question this asks is how far it has got from any warrior by
 *      the time it fades.
 *
 * ---------------------------------------------------------------------------
 * HOW IT MEASURES. THE SCENE IS READ, NOT THE MODULE.
 *
 * Two patches, both of them anchors `tools/janktest.mjs` already relies on and
 * both PROPERTY paths, because Next's minifier renames locals and leaves
 * property names alone:
 *
 *   `.postfx.render(dt, ctx)`   the frame hook. It is the statement immediately
 *                               after `stage.hud.update(dt, ctx)` in the loop,
 *                               so everything read here is the HUD's FINAL
 *                               state for the frame it is about to draw — after
 *                               placement, after de-overlap, after fading. It
 *                               also hands over `ctx.camera`, which is the only
 *                               thing screen space can be computed from.
 *
 *   the rendered transform      gives a warrior's id beside the group he is
 *                               DRAWN at, which is both the roster this file
 *                               needs and, walked up through `.parent`, the
 *                               scene root. Nothing else in the client hands a
 *                               harness the scene.
 *
 * Inside the scene, HUD elements are found by `renderOrder`, which is a literal
 * integer in `hud3d.ts` and is semantic there: 990 the occluded ghost, 992 the
 * health bar, 994 the name, 996 a damage number. A refactor inside `hud3d` that
 * kept those numbers keeps this ruler; one that changed them breaks it loudly,
 * because the counts go to zero and this file VOIDS ITSELF on a zero roster
 * rather than reporting a clean sheet.
 *
 * Every rectangle is built by projecting the quad's FOUR CORNERS through the
 * camera, not by estimating from distance. The numbers spin and the plates
 * scale with depth, and an estimate would be wrong in exactly the frames the
 * defect lives in.
 *
 * ---------------------------------------------------------------------------
 * IT GATES NOTHING (R4). It is a ruler. The three counts are printed as
 * distributions with the frame count they came from, and the verdict line says
 * what moved and what did not.
 *
 * ---------------------------------------------------------------------------
 * HOW MUCH THIS RULER WANDERS BETWEEN RUNS, because a single reading off it
 * would be quoted as if it were exact and it is not.
 *
 * The overlap figure is the restless one. It depends on how busy the fight
 * happened to be, and a scripted robot at the keys does not fight the same
 * fight twice. THREE runs of the identical build, share of the frames carrying
 * two or more numbers on which the smaller was more than half buried:
 *
 *     27.91%   30.07%   37.50%      against 41.37% before the fan
 *
 * So the fan reduced it, and by somewhere between four points and thirteen. The
 * MEDIAN overlap is the steadier statistic and it moved further and repeated:
 * 0.36 before, 0.17-0.20 after, on every run.
 *
 * The other two counts are quiet by comparison — off-screen plates read 0 or 1
 * on every run after the edge fade against 76 before, and number quads cut by
 * the frame edge read 9, 19 and 21 against 88. Quote a range from those; quote
 * a range from all three.

 */
import { chromium } from "playwright";
import { spawn } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".jank", "hudspace");
const argv = process.argv.slice(2);
const argOf = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const SECS = Math.max(5, parseInt(argOf("secs", "30"), 10) || 30);
const SHOTS = parseInt(argOf("shots", "0"), 10) || 0;
const PORT = parseInt(process.env.PORT || String(4120 + (process.pid % 30)), 10);
const VIEW = { width: 1280, height: 720 };

const pct = (sorted, p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] : NaN;
function stats(values) {
  const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return { n: v.length, min: v[0], p50: pct(v, 50), p90: pct(v, 90), p95: pct(v, 95), p99: pct(v, 99), max: v[v.length - 1], mean };
}
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "n/a");
const say = (s = "") => console.log(s);
const rule = (t) => { say(); say("=".repeat(78)); say(t); say("=".repeat(78)); };

// ---------------------------------------------------------------------------
// the two patches
// ---------------------------------------------------------------------------
const PATCHES = {
  /**
   * ONE PATCH, TWO JOBS, AND THEY HAVE TO BE ONE PATCH.
   *
   * `stage.postfx.render(dt, ctx)` is the statement immediately after
   * `stage.hud.update(dt, ctx)` in the frame loop, so it is both the place to
   * read the HUD's finished state AND the only call in the loop that issues GL.
   * Two separate rewrites of the same expression would fight over it.
   *
   * THE DRAW IS SUPPRESSED, and the reason is the same one `janktest.mjs` §3
   * gives at length: this box rasterises through SwiftShader and a real fight
   * at 1280x720 draws under half a frame a second. Measured: 10 frames over
   * 30 s with drawing on, which is not a sample, it is an anecdote.
   *
   * Nothing being measured here is downstream of the draw. Every rectangle in
   * this file is computed from `hud3d`'s own placement, its own visibility
   * flags and the real camera — all of which run in full whether or not the
   * frame is then rasterised. So this reads WHAT THE HUD DECIDED TO PUT ON
   * SCREEN, at a realistic desktop frame rate, and that is the quantity the
   * three defects live in.
   *
   * A picture is the one thing this trade costs, and `--shots` buys it back:
   * once the measurement window has closed and its data is off the page, the
   * draw is switched back ON and the shots are taken of the same fight. This
   * note used to say the shots came from a second page with the draw left on.
   * There was no second page. `--shots` wrote black PNGs for a whole round and
   * the R5 affordance in this ruler showed nothing.
   */
  frame: {
    name: "hook the frame after hud.update, and suppress the draw",
    subs: [[
      /\.postfx\.render\((\w+),(\w+)\)/g,
      `.postfx[(window.__hudFrame&&window.__hudFrame($2)),window.__hudNoDraw?"__none":"render"]?.($1,$2)`,
    ]],
  },
  body: {
    name: "note every warrior where he is DRAWN",
    subs: [[
      `e.group.position.x=t.rx+c,e.group.position.z=t.rz+d,e.group.rotation.y=t.yaw,`,
      `e.group.position.x=t.rx+c,e.group.position.z=t.rz+d,e.group.rotation.y=t.yaw,window.__hudBody&&window.__hudBody(n.id,e.group),`,
    ]],
  },
};

async function installPatches(ctx, names) {
  const hits = Object.fromEntries(names.map((n) => [n, 0]));
  await ctx.route("**/*.js*", async (route) => {
    let res; try { res = await route.fetch(); } catch { return route.abort(); }
    let body; try { body = await res.text(); } catch { return route.fulfill({ response: res }); }
    let touched = false;
    for (const n of names) {
      for (const [from, to] of PATCHES[n].subs) {
        if (from instanceof RegExp) {
          const rx = new RegExp(from.source, from.flags.includes("g") ? from.flags : from.flags + "g");
          const c = (body.match(rx) || []).length;
          if (c) { hits[n] += c; body = body.replace(rx, to); touched = true; }
          continue;
        }
        const parts = body.split(from);
        if (parts.length > 1) { hits[n] += parts.length - 1; body = parts.join(to); touched = true; }
      }
    }
    if (!touched) return route.fulfill({ response: res });
    route.fulfill({ response: res, body });
  });
  return hits;
}

/**
 * Everything the page collects. THE WHOLE MEASUREMENT IS IN HERE, in the page,
 * on purpose: shipping one summary row per frame across the CDP bridge is a few
 * hundred bytes, and shipping every rectangle is megabytes of main-thread
 * serialisation on the very thread whose behaviour the rest of this repository
 * is trying to measure.
 */
const COLLECTOR = ({ W, H }) => {
  const w = window;
  w.__hud = {
    frames: 0,
    plates: [],       // per frame: { on, offAnchor, clipped }
    dmg: [],          // per frame: { n, worstOverlap, orphanPx, orphanM }
    bodies: new Map(),
    started: 0,
    voided: "",
  };
  w.__hudBody = (id, group) => { if (id && group) w.__hud.bodies.set(id, group); };

  // Project a point already in world space to pixels. Returns null behind the
  // eye — `project()` divides by a negative w there and hands back a
  // plausible-looking point in FRONT, which is the exact trap `hud3d` itself
  // documents at its own frustum test.
  const proj = (THREE, v, camera, out) => {
    out.copy(v).applyMatrix4(camera.matrixWorldInverse);
    if (-out.z <= camera.near) return null;
    out.applyMatrix4(camera.projectionMatrix);
    return { x: (out.x * 0.5 + 0.5) * W, y: (0.5 - out.y * 0.5) * H, ndcX: out.x, ndcY: out.y };
  };

  w.__hudFrame = (ctx) => {
    const j = w.__hud;
    const camera = ctx && ctx.camera;
    if (!camera) return;
    if (!j.started) j.started = performance.now();
    // The scene, reached by walking up from any drawn body. Nothing in the
    // client hands a harness the scene and this is the only handle there is.
    let root = null;
    for (const g of j.bodies.values()) { let o = g; while (o.parent) o = o.parent; root = o; break; }
    if (!root) return;
    j.frames++;

    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    // ---- collect what is actually going to be drawn -------------------------
    // WHAT WILL ACTUALLY PUT PIXELS ON THE SCREEN, which is not the same as
    // what has `visible === true`.
    //
    // This file counted the flag alone for one round and it was wrong in a way
    // that flattered nothing and confused a result: a HUD element fades out
    // over its last stretch, and a quad at opacity 0.004 is a flag that is true
    // and a thing nobody can see. Counting those as "drawn over empty ground"
    // put a tail of invisible glyphs into every count. The bar is a
    // ShaderMaterial with its opacity in a uniform and the glyphs are
    // MeshBasicMaterial with it on the material, so both are asked, and
    // anything under a hundredth is treated as gone — the same threshold
    // `hud3d` itself retires a plate at.
    const opacityOf = (o) => {
      const m = o.material;
      if (!m) return 1;
      if (m.uniforms && m.uniforms.uOpacity) return m.uniforms.uOpacity.value;
      return m.opacity === undefined ? 1 : m.opacity;
    };
    const bars = [], names = [], nums = [];
    root.traverse((o) => {
      if (!o.visible || !o.isMesh) return;
      // Ancestor visibility: three.js does not draw a child of a hidden group,
      // and a plate is hidden BY ITS GROUP.
      for (let p = o.parent; p; p = p.parent) if (!p.visible) return;
      if (opacityOf(o) <= 0.01) return;
      if (o.renderOrder === 992) bars.push(o);
      else if (o.renderOrder === 994) names.push(o);
      else if (o.renderOrder === 996) nums.push(o);
    });

    const V = w.__hudTHREE;
    const tmp = new V.Vector3(), c0 = new V.Vector3();
    // The quad is a unit plane centred on the origin, so its corners are these
    // four points in the mesh's own space. Projected one at a time, so spin and
    // depth scaling are included rather than estimated.
    const CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    const boxOf = (mesh, b) => {
      mesh.updateWorldMatrix(true, false);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [cx, cy] of b) {
        tmp.set(cx, cy, 0).applyMatrix4(mesh.matrixWorld);
        const p = proj(V, tmp, camera, c0);
        if (!p) return null;
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
      return { x0, y0, x1, y1 };
    };
    const rectOf = (mesh) => boxOf(mesh, CORNERS);

    /**
     * THE QUAD IS NOT THE GLYPH, AND UNTIL NOW THIS FILE MEASURED THE QUAD.
     *
     * A damage number is drawn centred into a 112x74 (low) or 192x128 canvas at
     * 44-76 px, so a two-digit number covers well under half the texture and the
     * rest is transparent. `hud3d` itself records this for names — `Glyphs.ink`
     * is "fraction of the canvas width the drawn glyphs actually cover", and the
     * plate de-overlap already spreads by the ink and not by the quad — but
     * `buildDamageGlyphs` returns `ink: 1` and the numbers carry their padding
     * everywhere. So every "damage numbers overlap" figure this repository has
     * quoted, before and after the spawn fan, is the overlap of two rectangles
     * of mostly empty texture. It is the wrong quantity: it is not what the
     * owner can see, and a fix tuned against it is tuned against padding.
     *
     * This reads the pixels. The alpha channel of the glyph canvas is scanned
     * once per texture, and the box of pixels at least HALF opaque is kept —
     * the letterform, its hard stroke and the dense part of its halo, not the
     * wide soft shadow, which is exactly what has to land on another glyph
     * before a person calls two numbers one wrong number. The box is in UV, so
     * it is turned back into the unit quad's own coordinates (three.js flips V,
     * so image row 0 is the TOP of the quad) and projected through the same
     * four-corner path as everything else — spin and depth included.
     *
     * A mesh with no map (the health bar is a ShaderMaterial that fills its
     * quad) falls back to the full quad, which for that mesh is the truth.
     */
    const INK = (w.__hudInk = w.__hudInk || new Map());
    const inkCornersOf = (mesh) => {
      const map = mesh.material && mesh.material.map;
      const img = map && map.image;
      if (!img || !img.width || typeof img.getContext !== "function") return CORNERS;
      let box = INK.get(map.uuid);
      if (box === undefined) {
        box = null;
        try {
          const c2 = img.getContext("2d");
          const d = c2.getImageData(0, 0, img.width, img.height).data;
          let r0 = Infinity, r1 = -Infinity, k0 = Infinity, k1 = -Infinity;
          for (let row = 0; row < img.height; row++) {
            for (let col = 0; col < img.width; col++) {
              if (d[(row * img.width + col) * 4 + 3] < 128) continue;
              if (row < r0) r0 = row; if (row > r1) r1 = row;
              if (col < k0) k0 = col; if (col > k1) k1 = col;
            }
          }
          if (r1 >= r0) {
            // UV box -> unit-quad box. u maps straight to x + 0.5; v is flipped.
            box = [
              [k0 / img.width - 0.5, 0.5 - (r1 + 1) / img.height],
              [(k1 + 1) / img.width - 0.5, 0.5 - (r1 + 1) / img.height],
              [(k1 + 1) / img.width - 0.5, 0.5 - r0 / img.height],
              [k0 / img.width - 0.5, 0.5 - r0 / img.height],
            ];
          }
        } catch { box = null; }
        INK.set(map.uuid, box);
      }
      return box || CORNERS;
    };
    const inkRectOf = (mesh) => boxOf(mesh, inkCornersOf(mesh));

    /** Fraction of the SMALLER rectangle that the other one is sitting on. */
    const bury = (a, b) => {
      if (!a || !b) return 0;
      const iw = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const ih = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (iw <= 0 || ih <= 0) return 0;
      const areaA = (a.x1 - a.x0) * (a.y1 - a.y0);
      const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
      return (iw * ih) / Math.max(1, Math.min(areaA, areaB));
    };
    const onScreen = (r) => r && r.x1 > 0 && r.x0 < W && r.y1 > 0 && r.y0 < H;
    const inside = (r) => r && r.x0 >= 0 && r.x1 <= W && r.y0 >= 0 && r.y1 <= H;

    // ---- 1. plates for men who are not on screen ---------------------------
    // The question is about the WARRIOR, not about the plate: a plate is
    // legitimate when the man it names is in the frame, however close to the
    // edge it sits. So the test is the plate GROUP's anchor — the point over
    // his head — against the viewport, and then whether the plate got drawn
    // anyway.
    let on = 0, offAnchor = 0, clipped = 0;
    for (const bar of bars) {
      const r = rectOf(bar);
      if (!onScreen(r)) continue;
      on++;
      const grp = bar.parent;
      if (!grp) continue;
      grp.updateWorldMatrix(true, false);
      tmp.setFromMatrixPosition(grp.matrixWorld);
      const a = proj(V, tmp, camera, c0);
      // Anchor outside the frame while the bar is still being drawn.
      if (!a || a.ndcX < -1 || a.ndcX > 1 || a.ndcY < -1 || a.ndcY > 1) offAnchor++;
      if (!inside(r)) clipped++;
    }
    for (const nm of names) {
      const r = rectOf(nm);
      if (onScreen(r) && !inside(r)) clipped++;
    }
    j.plates.push({ on, offAnchor, clipped });

    // ---- 2 & 3. damage numbers ---------------------------------------------
    const rects = [];
    let cutNum = 0;
    for (const m of nums) {
      const r = rectOf(m);
      if (!onScreen(r)) continue;
      if (!inside(r)) cutNum++;
      rects.push({ m, r });
    }
    let worst = 0;
    for (let i = 0; i < rects.length; i++) {
      for (let k = i + 1; k < rects.length; k++) {
        // Fraction of the SMALLER glyph that the other one is sitting on. A
        // number half-buried under a bigger one is unreadable however small a
        // share of the bigger one it covers, so the min is the right divisor.
        worst = Math.max(worst, bury(rects[i].r, rects[k].r));
      }
    }

    // ---- the same three collisions, measured on the INK ---------------------
    // Number against number is the one the fan was tuned against and it is kept
    // above, on quads, so the series is comparable with what was quoted. These
    // are the same pairs measured on what is actually drawn, plus the two
    // collisions in the owner's photograph that nothing has ever measured:
    // a damage number laid across a NAMEPLATE, and a nameplate stacked into
    // another NAMEPLATE.
    const numInk = [], nameInk = [], barInk = [];
    for (const m of nums) { const r = inkRectOf(m); if (onScreen(r)) numInk.push(r); }
    for (const m of names) { const r = inkRectOf(m); if (onScreen(r)) nameInk.push(r); }
    for (const m of bars) { const r = rectOf(m); if (onScreen(r)) barInk.push(r); }

    const pairWorst = (A, B) => {
      let wst = 0, pairs = 0;
      if (A === B) {
        for (let i = 0; i < A.length; i++) for (let k = i + 1; k < A.length; k++) {
          const v = bury(A[i], A[k]);
          if (v > 0.25) pairs++;
          if (v > wst) wst = v;
        }
      } else {
        for (let i = 0; i < A.length; i++) for (let k = 0; k < B.length; k++) {
          const v = bury(A[i], B[k]);
          if (v > 0.25) pairs++;
          if (v > wst) wst = v;
        }
      }
      return { wst, pairs };
    };
    const nnI = pairWorst(numInk, numInk);
    const mmI = pairWorst(nameInk, nameInk);
    const nmI = pairWorst(numInk, nameInk);
    const nbI = pairWorst(numInk, barInk);
    // Orphans: how far the number is from the nearest warrior. Measured in
    // METRES on the ground, which is the honest quantity — screen pixels would
    // call a number over a man 40 m behind it "attached".
    let orphanM = null, orphanPx = null;
    for (const { m, r } of rects) {
      m.updateWorldMatrix(true, false);
      const nx = m.matrixWorld.elements[12], nz = m.matrixWorld.elements[14];
      let best = Infinity, bestPx = Infinity;
      for (const g of j.bodies.values()) {
        g.updateWorldMatrix(true, false);
        const bx = g.matrixWorld.elements[12], bz = g.matrixWorld.elements[14];
        const d = Math.hypot(nx - bx, nz - bz);
        if (d < best) best = d;
        tmp.set(bx, 1.4, bz);
        const p = proj(V, tmp, camera, c0);
        if (p) {
          const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
          bestPx = Math.min(bestPx, Math.hypot(p.x - cx, p.y - cy));
        }
      }
      if (Number.isFinite(best)) orphanM = Math.max(orphanM ?? 0, best);
      if (Number.isFinite(bestPx)) orphanPx = Math.max(orphanPx ?? 0, bestPx);
    }
    j.dmg.push({
      n: rects.length, worst, orphanM, orphanPx, cut: cutNum,
      // ink-space, and the counts the quad ruler never had
      ni: numInk.length, mi: nameInk.length,
      nnW: nnI.wst, nnP: nnI.pairs,
      mmW: mmI.wst, mmP: mmI.pairs,
      nmW: nmI.wst, nmP: nmI.pairs,
      nbW: nbI.wst, nbP: nbI.pairs,
    });
  };
};

function waitForServer(url, timeoutMs = 180000) {
  const t0 = Date.now();
  return new Promise((ok, fail) => {
    const poll = async () => {
      try { const r = await fetch(url); if (r.ok || r.status === 404) return ok(); } catch { /* wait */ }
      if (Date.now() - t0 > timeoutMs) return fail(new Error("server never came up"));
      setTimeout(poll, 700);
    };
    poll();
  });
}

async function reachFight(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.getByText("Training", { exact: false }).first().click();
  await page.getByText("MUSTER THE TESTGROUNDS", { exact: false }).first().click();
  const more = page.getByLabel("More AI warriors");
  for (let i = 0; i < 10 && await more.isEnabled().catch(() => false); i++) await more.click();
  await page.getByText("DRAW STEEL", { exact: false }).first().click();
  await page.waitForFunction(() => window.__hud && window.__hud.frames > 4, null, { timeout: 120000 });
}

async function main() {
  if (!existsSync(resolve(ROOT, ".next/BUILD_ID"))) {
    say("\n  NO PRODUCTION BUILD. Run `npm run build` first — the dev server ships");
    say("  different JavaScript and both anchors in this file are pinned to the");
    say("  built bundle. Refusing to measure a build the player will never run.");
    process.exitCode = 1; return;
  }
  const server = spawn("node", ["custom-server.mjs"], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(`http://127.0.0.1:${PORT}/api/health`);
  const pre = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    ...(existsSync(pre) ? { executablePath: pre } : {}),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
  });
  let data = null, hits = null;
  try {
    const ctx = await browser.newContext({ viewport: VIEW });
    hits = await installPatches(ctx, ["frame", "body"]);
    await ctx.addInitScript(COLLECTOR, { W: VIEW.width, H: VIEW.height });
    await ctx.addInitScript(() => { window.__hudNoDraw = true; });
    // THREE is not a global. The collector needs Vector3 and nothing else, and
    // a hand-rolled one would be a second implementation of the projection this
    // file exists to check — so it is lifted off the first object the scene
    // hands over, which is by construction the same class the renderer uses.
    await ctx.addInitScript(() => {
      const h = () => {
        if (!window.__hud || !window.__hud.bodies) return false;
        for (const g of window.__hud.bodies.values()) {
          window.__hudTHREE = { Vector3: g.position.constructor };
          return true;
        }
        return false;
      };
      const t = setInterval(() => { try { if (h()) clearInterval(t); } catch { /* not yet */ } }, 60);
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => say(`  [page-error] ${String(e).slice(0, 200)}`));
    await reachFight(page, `http://127.0.0.1:${PORT}/?quality=low`);
    const canvas = page.locator("canvas").first();
    await canvas.click({ position: { x: 640, y: 360 } }).catch(() => {});
    let stop = false;
    const fight = (async () => {
      const keys = ["KeyW", "KeyA", "KeyS", "KeyD"];
      let i = 0;
      while (!stop) {
        const k = keys[i++ % keys.length];
        await page.keyboard.down(k).catch(() => {});
        await page.mouse.move(600 + Math.sin(i) * 300, 360).catch(() => {});
        if (i % 3 === 0) await page.mouse.down().catch(() => {});
        await new Promise((r) => setTimeout(r, 180));
        if (i % 3 === 0) await page.mouse.up().catch(() => {});
        await page.keyboard.up(k).catch(() => {});
      }
    })();
    await new Promise((r) => setTimeout(r, 4000));
    await page.evaluate(() => {
      const j = window.__hud;
      j.frames = 0; j.plates.length = 0; j.dmg.length = 0; j.started = 0;
    });
    await new Promise((r) => setTimeout(r, SECS * 1000));
    data = await page.evaluate(() => {
      const j = window.__hud;
      return { frames: j.frames, plates: j.plates, dmg: j.dmg, bodies: j.bodies.size, three: !!window.__hudTHREE };
    });
    // ---- and now LOOK AT IT (R5) -------------------------------------------
    // This used to screenshot with `__hudNoDraw` still true and wrote eight
    // black PNGs, under a header claiming a second page with the draw left on
    // that did not exist — the one affordance in this ruler for actually seeing
    // the defect showed nothing, for a whole round. The draw is turned back ON
    // here, on the SAME page and the SAME fight that was just measured, and
    // each shot waits for two real frames to go through the renderer, because
    // SwiftShader takes seconds over one. The measurement is already off the
    // page by this point, so nothing below can contaminate it.
    if (SHOTS) {
      mkdirSync(OUT, { recursive: true });
      await page.evaluate(() => { window.__hudNoDraw = false; });
      for (let i = 0; i < SHOTS; i++) {
        const before = await page.evaluate(() => window.__hud.frames);
        await page.waitForFunction((b) => window.__hud.frames > b + 1, before, { timeout: 180000 }).catch(() => {});
        await page.screenshot({ path: resolve(OUT, `h${String(i).padStart(3, "0")}.png`) }).catch(() => {});
      }
    }
    stop = true; await fight.catch(() => {});
    await ctx.close();
  } finally {
    await browser.close().catch(() => {});
    if (server && !server.killed) server.kill("SIGTERM");
  }

  rule("HUDSPACE — the fourth word, BUGGY, in the space it happens in");
  for (const n of ["frame", "body"]) say(`  patch "${PATCHES[n].name}": ${hits[n]} site(s)`);
  if (!hits.frame || !hits.body) { say("\n  PATCH MISSED — nothing in the served bundle matched. Result VOID."); process.exitCode = 1; return; }
  if (!data || !data.frames || !data.bodies) {
    say(`\n  NO ROSTER — ${data ? data.frames : 0} frames, ${data ? data.bodies : 0} bodies. Result VOID rather than clean.`);
    process.exitCode = 1; return;
  }
  say(`\n  ${data.frames} frames of a seven-bot fight at ${VIEW.width}x${VIEW.height}, ${data.bodies} warriors on the roster.`);
  say(`  The draw is SUPPRESSED (see the patch note): every rectangle below is what the HUD`);
  say(`  decided to put on screen, which runs in full either way, sampled at a realistic`);
  say(`  frame rate instead of SwiftShader's 0.3 fps. No frames-per-second figure is implied.`);

  // ---- 1 -------------------------------------------------------------------
  const platesOn = data.plates.reduce((a, p) => a + p.on, 0);
  const offAnchor = data.plates.reduce((a, p) => a + p.offAnchor, 0);
  const clipped = data.plates.reduce((a, p) => a + p.clipped, 0);
  const framesOff = data.plates.filter((p) => p.offAnchor > 0).length;
  say(`\n  1. NAMEPLATES AND BARS FOR MEN WHO ARE NOT ON SCREEN`);
  say(`     A plate is a world-space object at the warrior's head. The renderer keeps it`);
  say(`     whenever its bounding sphere touches the frustum, so a man well outside the`);
  say(`     frame still puts a sliced name and half a health bar against the screen edge.`);
  say(`       health bars drawn                 ${String(platesOn).padStart(7)}  over ${data.frames} frames`);
  say(`       ...whose WARRIOR was off screen   ${String(offAnchor).padStart(7)}  (${(100 * offAnchor / Math.max(1, platesOn)).toFixed(2)}%)`);
  say(`       plate quads cut by the frame edge ${String(clipped).padStart(7)}`);
  say(`       frames showing at least one       ${String(framesOff).padStart(7)}  (${(100 * framesOff / data.frames).toFixed(2)}% of frames)`);

  // ---- 2 -------------------------------------------------------------------
  const withNums = data.dmg.filter((d) => d.n > 0);
  const overlapFrames = data.dmg.filter((d) => d.worst > 0.25).length;
  const badFrames = data.dmg.filter((d) => d.worst > 0.5).length;
  const ov = stats(data.dmg.filter((d) => d.n > 1).map((d) => d.worst));
  say(`\n  2. DAMAGE NUMBERS OVERLAPPING INTO A BLOB`);
  say(`     Overlap is the fraction of the SMALLER glyph the other one is sitting on —`);
  say(`     a number half-buried under a bigger one is unreadable whatever share of the`);
  say(`     bigger one it covers.`);
  say(`       frames with a number on screen    ${String(withNums.length).padStart(7)}`);
  // THE DENOMINATOR IS FRAMES THAT COULD HAVE OVERLAPPED, and it has to be.
  // These were once printed as a share of ALL frames, and two runs of the same
  // build then disagreed by five points for no reason but how busy the fight
  // happened to be — one run carried numbers on 1070 frames and the next on
  // 1336, so the same overlap rate read differently. A pair is only possible
  // where there is a pair.
  const pairFrames = data.dmg.filter((d) => d.n > 1).length;
  const den = Math.max(1, pairFrames);
  say(`       frames with two or more           ${String(pairFrames).padStart(7)}   <- the denominator below`);
  say(`       frames overlapping >25%           ${String(overlapFrames).padStart(7)}  (${(100 * overlapFrames / den).toFixed(2)}% of those)`);
  say(`       frames overlapping >50%           ${String(badFrames).padStart(7)}  (${(100 * badFrames / den).toFixed(2)}% of those)`);
  if (ov) say(`       overlap when 2+ are up            p50 ${f2(ov.p50)}  p95 ${f2(ov.p95)}  worst ${f2(ov.max)}`);

  // ---- 2b: the same collisions on the INK, and the two never measured ------
  const pairI = (key, wKey, pKey, title, note, denFilter) => {
    const rows = data.dmg.filter(denFilter);
    const st = stats(rows.map((d) => d[wKey]));
    const over25 = rows.filter((d) => d[wKey] > 0.25).length;
    const over50 = rows.filter((d) => d[wKey] > 0.5).length;
    const pairs = data.dmg.reduce((a, d) => a + (d[pKey] || 0), 0);
    const den = Math.max(1, rows.length);
    say(`\n  ${key}. ${title}`);
    for (const line of note) say(`     ${line}`);
    say(`       frames where the pair was possible ${String(rows.length).padStart(6)}   <- the denominator`);
    say(`       ...one more than a QUARTER buried  ${String(over25).padStart(6)}  (${(100 * over25 / den).toFixed(2)}%)`);
    say(`       ...one more than HALF buried       ${String(over50).padStart(6)}  (${(100 * over50 / den).toFixed(2)}%)`);
    if (st) say(`       worst burial in the frame          p50 ${f2(st.p50)}  p95 ${f2(st.p95)}  worst ${f2(st.max)}`);
    say(`       colliding pairs over 25%, all frames ${String(pairs).padStart(4)}`);
    return { over50, den, p50: st ? st.p50 : NaN, max: st ? st.max : NaN };
  };
  say(`\n  ---- and now on the INK, which is not the quad ----`);
  say(`     Everything above measures the QUAD. A damage number is drawn centred into a`);
  say(`     112x74 canvas at 44 px, so most of that quad is transparent, and \`hud3d\` says`);
  say(`     so itself for names (\`Glyphs.ink\`) while returning \`ink: 1\` for numbers. The`);
  say(`     three counts below are the box of pixels at least HALF opaque, projected the`);
  say(`     same way. That is what a person can see land on another glyph.`);
  const NN = pairI("2i", "nnW", "nnP", "NUMBER across NUMBER, on the ink",
    ["The owner's \"337\": two damage numbers printed through each other."],
    (d) => d.ni > 1);
  const MM = pairI("4", "mmW", "mmP", "NAMEPLATE across NAMEPLATE — NEVER MEASURED BEFORE",
    ["Five nameplates stacked into each other were photographed on the build this",
     "ruler is being extended from. The de-overlap in `hud3d` runs every frame and",
     "is supposed to prevent exactly this; past MAX_PUSH it gives up, drops the",
     "name and re-places on the bar — and the clamp it uses lands every plate that",
     "gave up on the SAME line."],
    (d) => d.mi > 1);
  const NM = pairI("5", "nmW", "nmP", "NUMBER across NAMEPLATE — NEVER MEASURED BEFORE",
    ["In the owner's frame and in .jank/strip/f005.png. A damage number is not in",
     "the plate de-overlap pass at all: it is fanned once at spawn against other",
     "NUMBERS and never looks at a plate again, so it is free to fly through one."],
    (d) => d.ni > 0 && d.mi > 0);
  const NB = pairI("6", "nbW", "nbP", "NUMBER across HEALTH BAR — NEVER MEASURED BEFORE",
    ["Also in the owner's frame. Same cause as 5."],
    (d) => d.ni > 0);

  // ---- 3 -------------------------------------------------------------------
  const om = stats(data.dmg.map((d) => d.orphanM).filter((x) => x != null));
  const op = stats(data.dmg.map((d) => d.orphanPx).filter((x) => x != null));
  const far = data.dmg.filter((d) => (d.orphanM ?? 0) > 3).length;
  const far6 = data.dmg.filter((d) => (d.orphanM ?? 0) > 6).length;
  const cutNums = data.dmg.reduce((a, d) => a + (d.cut || 0), 0);
  const cutFrames = data.dmg.filter((d) => (d.cut || 0) > 0).length;
  say(`\n  3. DAMAGE NUMBERS OVER EMPTY GROUND`);
  say(`     Distance on the ground from the number to the NEAREST warrior, in metres. A`);
  say(`     number is spawned on the body and then flies for up to 1.25 s on its own arc`);
  say(`     while the fight moves out from under it.`);
  if (om) say(`       furthest number, per frame        p50 ${f2(om.p50)} m  p95 ${f2(om.p95)} m  worst ${f2(om.max)} m`);
  say(`       frames with one over 3 m from any ${String(far).padStart(7)}  (${(100 * far / Math.max(1, withNums.length)).toFixed(2)}% of frames that had a number)`);
  say(`       frames with one over 6 m from any ${String(far6).padStart(7)}  (${(100 * far6 / Math.max(1, withNums.length)).toFixed(2)}%)`);
  if (op) say(`       and on SCREEN, px to the nearest man   p50 ${f2(op.p50)}  p95 ${f2(op.p95)}  worst ${f2(op.max)}`);
  say(`\n     THE OTHER WAY A NUMBER ENDS UP OVER NOTHING, and it is the one the frame`);
  say(`     strip actually showed: it is not far from a warrior, the warrior has left the`);
  say(`     FRAME. The number is a world-space object like the plate and gets sliced`);
  say(`     against the screen edge exactly the same way.`);
  say(`       number quads cut by the frame edge ${String(cutNums).padStart(6)}`);
  say(`       frames showing at least one        ${String(cutFrames).padStart(6)}  (${(100 * cutFrames / Math.max(1, withNums.length)).toFixed(2)}% of frames that had a number)`);

  rule("READING");
  say(`  OFF-SCREEN PLATES   ${offAnchor === 0 ? "none" : `${offAnchor} bar-frames belong to a man outside the frame`}.`);
  say(`  NUMBER OVERLAP      ${overlapFrames === 0 ? "none over 25%" : `${badFrames} of ${pairFrames} frames carrying a pair had one more than HALF buried (${(100 * badFrames / den).toFixed(2)}%)`}.`);
  say(`  ORPHANED NUMBERS    ${far === 0 ? `none over 3 m from a warrior (worst ${f2(om && om.max)} m) — the "over empty ground"` : `${far} frames with a number over 3 m from any warrior`}`);
  if (far === 0) say(`                      report is NOT a number drifting off a body.`);
  say(`  NUMBERS CUT BY EDGE ${cutNums === 0 ? "none" : `${cutNums} quads over ${cutFrames} frames`}.`);
  say(`  ON THE INK          num/num  ${(100 * NN.over50 / NN.den).toFixed(2)}% of pair-frames over half buried, p50 ${f2(NN.p50)}, worst ${f2(NN.max)}`);
  say(`                      name/name ${(100 * MM.over50 / MM.den).toFixed(2)}%, p50 ${f2(MM.p50)}, worst ${f2(MM.max)}`);
  say(`                      num/name  ${(100 * NM.over50 / NM.den).toFixed(2)}%, p50 ${f2(NM.p50)}, worst ${f2(NM.max)}`);
  say(`                      num/bar   ${(100 * NB.over50 / NB.den).toFixed(2)}%, p50 ${f2(NB.p50)}, worst ${f2(NB.max)}`);
  say();
  say(`  DEFERRALS, on the verdict line and not below it (R4):`);
  say(`    - THIS GATES NOTHING. It is a ruler. No count here fails a build.`);
  say(`    - The three counts are of a TRAINING fight against bots with a scripted`);
  say(`      robot at the keys. A human plays differently and would see different`);
  say(`      counts; what is portable is that a count above zero is a defect.`);
  say(`    - Legibility is not measured. Two numbers that do not overlap can still`);
  say(`      be hard to read, and no rectangle can see that.`);
  say(`    - The INK box is the box of pixels at least half opaque. The soft halo`);
  say(`      outside it is deliberately not counted, so two glyphs whose shadows`);
  say(`      touch read as clear here. That is a judgement and it is arguable.`);
  say(`    - Rectangles, not letterforms: two glyphs can share a bounding box and`);
  say(`      still not print through each other.`);
  if (SHOTS) say(`\n  frames: ${OUT}`);
}

main().catch((e) => { console.error("[hudspace] failed:", e); process.exitCode = 1; });
