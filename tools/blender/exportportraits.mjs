#!/usr/bin/env node
// EXPORTPORTRAITS — the four men's faces for the class picker, rendered from
// the same warrior blends the game's own models come out of.
//
//   node tools/blender/exportportraits.mjs [--cls huscarl] [--res 512]
//
// WHY THIS EXISTS. The Unity menu's portraits were a hand-made asset with no
// maker: four PNGs someone rendered once and copied into StreamingAssets. When
// the blends were fixed the portraits were not, because nothing regenerated
// them, and the menu shipped four magenta men for a day without a gate noticing.
//
// The magenta itself is Blender's missing-image colour. `attach_textures` loads
// the maps by absolute path, but `save_as_mainfile` remaps paths as RELATIVE by
// default, so a blend saved at art/blender/ carries `//tex/skin-map.png` and
// resolves only while it sits there. Render from a copy somewhere else and every
// image misses; the material still lights and shades, so the man comes out pink
// rather than obviously broken. That is why the check below is on the pixels and
// not on whether Blender exited zero — a broken render succeeds loudly.
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, copyFileSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BLENDER = process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender";
const ART = resolve(ROOT, "art/blender");
const SHIP = resolve(ROOT, "BRETWALDA - Blood Moot/Assets/StreamingAssets");
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const RES = Number(flag("res", 512));
const ONLY = flag("cls", null);
// Head and shoulders: the top 0.62 m of a man, a touch under three quarters on,
// 85 mm so the nose is not thrown forward the way a wide lens throws it.
const FRAME = Number(flag("frame", 0.62)), ANGLE = Number(flag("angle", 25)), LENS = Number(flag("lens", 85));

// THE GUARD. Blender's missing-image magenta is (1, 0, 1) before lighting, so
// after lighting it keeps red and blue well clear of green in every lit pixel.
// A true render of a man never does: skin, steel and cloth all sit within a few
// counts of neutral. Clean renders here measure 0.0%; the broken ones measured
// 14% to 31%. Anything above one per cent is the missing-texture signature.
export async function magentaShare(file) {
  const img = await loadImage(file);
  const c = createCanvas(img.width, img.height), g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  let lit = 0, magenta = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    lit++;
    if (d[i] - d[i + 1] > 30 && d[i + 2] - d[i + 1] > 30) magenta++;
  }
  return lit ? magenta / lit : 0;
}
export const MAGENTA_LIMIT = 0.01;

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(BLENDER)) { console.error(`[exportportraits] no Blender at ${BLENDER} — set BLENDER=`); process.exit(2); }
  mkdirSync(SHIP, { recursive: true });
  let bad = 0;
  for (const cls of ONLY ? [ONLY] : CLASSES) {
    const blend = resolve(ART, `warrior-${cls}.blend`);
    if (!existsSync(blend)) { console.error(`[exportportraits] ${cls}: no ${blend} — run exportwarrior + warrior.py first`); bad++; continue; }
    // Rendered BESIDE the blend, never from a copy: `//tex/` is the blend's own
    // directory and a portrait rendered anywhere else comes out pink.
    const out = resolve(ART, `portrait-${cls}.png`);
    const r = spawnSync(BLENDER, ["-b", blend, "-P", resolve(ROOT, "tools/blender/render.py"), "--",
      `Warrior_${cls}`, out, String(ANGLE), String(LENS), String(FRAME), String(RES)], { encoding: "utf8" });
    if (r.status !== 0 || !existsSync(out)) {
      console.error(`[exportportraits] ${cls}: Blender failed (${r.status})\n${(r.stderr || "").split("\n").slice(-8).join("\n")}`);
      bad++; continue;
    }
    const share = await magentaShare(out);
    if (share > MAGENTA_LIMIT) {
      console.error(`[exportportraits] ${cls}: REFUSED — ${(share * 100).toFixed(1)}% of the lit pixels are magenta, the textures did not resolve. Not shipped.`);
      bad++; continue;
    }
    copyFileSync(out, resolve(SHIP, `portrait-${cls}.png`));
    console.log(`[exportportraits] ${cls}: ${RES}px, ${(statSync(out).size / 1024).toFixed(0)} KB, magenta ${(share * 100).toFixed(1)}% -> StreamingAssets`);
  }
  if (bad) { console.error(`[exportportraits] ${bad} portrait(s) not shipped`); process.exit(1); }
  console.log("[exportportraits] all four men shipped");
}
