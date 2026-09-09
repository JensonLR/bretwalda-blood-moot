#!/usr/bin/env node
// EXPORTCLIPS — the fight's motion, built for every class and put where the
// client actually reads it from.
//
//   node tools/blender/exportclips.mjs [--cls huscarl]
//
// WHY THIS EXISTS. clips.py writes art/blender/warrior-<cls>.glb; the client
// loads it from `public/authored` — which is where this now copies. It went to
// `art/gltf` until 9 Sep 2026, and NOTHING in src/ has ever read that directory
// it was Unity's StreamingAssets). Nothing joined those
// two, so a clip could be rebuilt and the game keep playing the old one — which
// is the same shape of fault that left four magenta portraits in the class
// picker for a day. A build step with no copy step is a build step that lies.
//
// It also checks the thing that is easy to get wrong and impossible to see: the
// clip count. Bind() in ClipDriver stands the whole rig down and falls back to
// the procedural pose if fewer than four of the nine arrive, silently.
import { spawnSync } from "child_process";
import { existsSync, copyFileSync, statSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { AUTHORED_WEB } from "./sink.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BLENDER = process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender";
const ART = resolve(ROOT, "art/blender");
// The directory the browser fetches from. It was GLTF_SINK, which no client
// has ever read — see the note on AUTHORED_WEB in sink.mjs.
const SHIP = AUTHORED_WEB;
mkdirSync(SHIP, { recursive: true });   // a fresh clone has no public/authored
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
// The FIFTEEN clips.py authors — idle, walk, run, the four cuts, heavy, block,
// dodge, die, and FOUR hit reactions (hit, hitLeft, hitOverhead, hitStab), one
// per direction a blow can come from.
//
// This read 12 and the comment said "twelve", which was true when it was
// written and had been wrong for a while: clips.py grew the three directional
// hit reactions and the gate never followed, so all three could quietly stop
// exporting and this would still report success. Verified against all four
// shipped GLBs — berserker, huscarl, runekeeper, warden — 15 each.
const WANT = 15;

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
  console.log(`[exportclips] ${cls}: ${n} clips, ${(statSync(built).size / 1024).toFixed(0)} KB -> ${SHIP.replace(ROOT + "/", "")}`);
}
if (bad) { console.error(`[exportclips] ${bad} class(es) not shipped`); process.exit(1); }
console.log("[exportclips] all four men carry the same motion the client will play");
