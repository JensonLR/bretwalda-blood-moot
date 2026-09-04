#!/usr/bin/env node
// EXPORTCLIPS — the fight's motion, built for every class and put where the
// client actually reads it from.
//
//   node tools/blender/exportclips.mjs [--cls huscarl]
//
// WHY THIS EXISTS. clips.py writes art/blender/warrior-<cls>.glb; the Unity
// client loads Assets/StreamingAssets/warrior-<cls>.glb. Nothing joined those
// two, so a clip could be rebuilt and the game keep playing the old one — which
// is the same shape of fault that left four magenta portraits in the class
// picker for a day. A build step with no copy step is a build step that lies.
//
// It also checks the thing that is easy to get wrong and impossible to see: the
// clip count. Bind() in ClipDriver stands the whole rig down and falls back to
// the procedural pose if fewer than four of the nine arrive, silently.
import { spawnSync } from "child_process";
import { existsSync, copyFileSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BLENDER = process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender";
const ART = resolve(ROOT, "art/blender");
const SHIP = resolve(ROOT, "BRETWALDA - Blood Moot/Assets/StreamingAssets");
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
// The twelve clips.py authors — idle, walk, run, the FOUR cuts, heavy, block,
// dodge, hit, die. ClipDriver needs four of the nine it names to take the rig
// at all, and falls back to the procedural pose below that, silently.
const WANT = 12;

const argv = process.argv.slice(2);
const only = argv.indexOf("--cls") >= 0 ? argv[argv.indexOf("--cls") + 1] : null;

if (!existsSync(BLENDER)) { console.error(`[exportclips] no Blender at ${BLENDER} — set BLENDER=`); process.exit(2); }
let bad = 0;
for (const cls of only ? [only] : CLASSES) {
  const blend = resolve(ART, `warrior-${cls}.blend`);
  if (!existsSync(blend)) { console.error(`[exportclips] ${cls}: no ${blend}`); bad++; continue; }
  const r = spawnSync(BLENDER, ["-b", blend, "-P", resolve(ROOT, "tools/blender/clips.py"), "--", cls], { encoding: "utf8" });
  const line = (r.stdout || "").split("\n").find((l) => l.startsWith("[clips.py]")) ?? "";
  const n = Number((line.match(/(\d+) clips/) ?? [])[1] ?? 0);
  if (r.status !== 0 || n < WANT) {
    console.error(`[exportclips] ${cls}: built ${n} of ${WANT} clips${r.status ? ` (Blender exited ${r.status})` : ""}`);
    console.error((r.stderr || "").split("\n").slice(-6).join("\n"));
    bad++; continue;
  }
  const built = resolve(ART, `warrior-${cls}.glb`);
  copyFileSync(built, resolve(SHIP, `warrior-${cls}.glb`));
  console.log(`[exportclips] ${cls}: ${n} clips, ${(statSync(built).size / 1024).toFixed(0)} KB -> StreamingAssets`);
}
if (bad) { console.error(`[exportclips] ${bad} class(es) not shipped`); process.exit(1); }
console.log("[exportclips] all four men carry the same motion the client will play");
