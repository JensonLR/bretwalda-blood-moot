#!/usr/bin/env node
// REKEYPROBE — does any material in view re-resolve its program between frames?
//
//   node tools/rekeyprobe.mjs [--quality=low] [--preset=brawl]
//
// three keys a shader program on the material AND the object drawing it
// (skinning, instancing, morphs), and re-resolves it — `getParameters`, a
// cache-key join, a map lookup — whenever a material's version moves, its
// lights-state version moves, or the object shape differs from the last one
// that drew it. Every re-resolve allocates; on the low tier that was 39% of all
// per-frame garbage on 2 Sep 2026 (fpstest --phases=alloc), from two
// mechanisms: materials shared between skinned and plain meshes (closed by
// `materials.twin`), and transparent double-sided materials, which three draws
// twice per object per frame with `needsUpdate` set before each pass (closed
// by `forceSinglePass`). This holds both closed: it stages the shot page's
// brawl, snapshots every visible material's shapes, version, lights-state
// version and current program, waits two frames, and reports any that moved.
import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { launchOptions, watchBoot, rasteriserNote } from "./lib/browser.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d; };
const QUALITY = arg("quality", "low");
const PRESET = arg("preset", "brawl");
const PORT = parseInt(process.env.PORT || String(3877 + (process.pid % 20)), 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (!existsSync(resolve(ROOT, ".next/BUILD_ID"))) { console.error("[rekey] NO PRODUCTION BUILD — run `npm run build` first."); process.exit(2); }
const server = spawn("node", ["custom-server.mjs"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" }, stdio: "ignore" });
watchBoot(server, "rekey");
for (const t0 = Date.now(); ;) { try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) break; } catch { /* not up */ } if (Date.now() - t0 > 180000) { console.error("server never came up"); process.exit(2); } await sleep(300); }
console.log(`[rekey] ${rasteriserNote()}`);
const browser = await chromium.launch(launchOptions());
let failed = 0;
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`http://127.0.0.1:${PORT}/shot?preset=${PRESET}&clean=1&quality=${QUALITY}&settle=16`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 240000 });
  await sleep(1500);
  const report = await page.evaluate(async () => {
    const r = window.__bretwaldaRenderer, scene = window.__bretwaldaScene;
    if (!r || !scene) return { error: "no renderer/scene readback on the window" };
    const snap = () => {
      const byMat = new Map();
      scene.traverse((o) => {
        if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.visible) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const shape = `${o.isSkinnedMesh ? "skin" : ""}${o.isInstancedMesh ? "inst" : ""}${o.geometry?.morphAttributes && Object.keys(o.geometry.morphAttributes).length ? "morph" : ""}${o.geometry?.attributes?.color ? "vcol" : ""}${o.geometry?.attributes?.tangent ? "tan" : ""}` || "plain";
        for (const m of mats) {
          if (!m) continue;
          let e = byMat.get(m.uuid);
          if (!e) { e = { name: m.name || m.type, type: m.type, shapes: new Set(), objects: 0, version: m.version, props: r.properties.get(m) }; byMat.set(m.uuid, e); }
          e.shapes.add(shape); e.objects++;
        }
      });
      return byMat;
    };
    const a = snap();
    const lsv = new Map([...a].map(([k, e]) => [k, e.props.lightsStateVersion]));
    const prog = new Map([...a].map(([k, e]) => [k, e.props.currentProgram]));
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const b = snap();
    const rows = [];
    for (const [k, e] of b) {
      const shapes = [...e.shapes];
      const versionMoved = a.has(k) && a.get(k).version !== e.version;
      const lightsMoved = lsv.has(k) && lsv.get(k) !== e.props.lightsStateVersion;
      const programMoved = prog.has(k) && prog.get(k) !== e.props.currentProgram;
      if (shapes.length > 1 || versionMoved || lightsMoved || programMoved) rows.push({ name: e.name, type: e.type, objects: e.objects, shapes, versionMoved, lightsMoved, programMoved });
    }
    return { materials: b.size, rows };
  });
  if (report.error) { console.log(`  FAIL  ${report.error}`); failed++; }
  else {
    const say = (ok, what, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${what}${detail ? " — " + detail : ""}`); if (!ok) failed++; };
    const mixed = report.rows.filter((x) => x.shapes.length > 1);
    const moving = report.rows.filter((x) => x.versionMoved);
    const lights = report.rows.filter((x) => x.lightsMoved);
    say(mixed.length === 0, `no material in view is shared between object shapes (${report.materials} materials, ${PRESET} at ${QUALITY})`, mixed.map((x) => `${x.name}[${x.shapes.join("+")}]`).join(", "));
    say(moving.length === 0, "no material's version moves between two frames — nothing sets needsUpdate per frame, and no transparent double-sided material is drawn in two passes", moving.map((x) => `${x.name}×${x.objects}`).join(", "));
    say(lights.length === 0, "the lights state is stable between frames", lights.map((x) => x.name).join(", "));
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(`\n[rekey] ${failed ? `${failed} FAILED` : "PASS"}`);
process.exit(failed ? 1 : 0);
