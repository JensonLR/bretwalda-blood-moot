#!/usr/bin/env node
// EXPORTPROPS - the shop's cosmetics as glTF, for every class: 9 helms + 4 beards + 3 hair = 16 static GLBs per class,
// authored in the head bone's frame and hung by src/game/client/render/authoredProps.ts.
//
//   node tools/blender/exportprops.mjs [--class huscarl]        (all four classes when --class is omitted; ~17 s per class)
//
// WHY THIS FILE EXISTS. exportcosmetics.mjs only writes OBJ + MTL into art/blender; prop.py builds ONE helm GLB per call and
// strands.py ONE beard or hair GLB per call; nothing joined them, so the 64 cosmetic GLBs in public/authored had no recorded way
// to be rebuilt. This is that loop. It ships nothing: `bash tools/blender/linux/ship-changed.sh` (only what really changed) or `npm run authored` (all 68) copies art/blender -> public/authored afterwards.
//
// WHEN TO RUN IT (measured, docs/BPY-PIPELINE.md section 2): a BODY edit moves no prop (16/16 byte-identical); a FACE-FEATURE edit
// (RELIEF rows) moves the helms; a SKULL edit (headR) moves all 16. warrior-<cls>.glb (head skin + the default helm/hair/beard
// baked in) is exportmen.mjs's job and is NOT rebuilt here.
//
// PRECONDITION: art/blender/tex/tiles.json (exporttextures.mjs). Without it prop.py/strands.py exit 0 and SILENTLY skip the UV
// baking, so this refuses to run without it.
import { spawnSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BLENDER = process.env.BLENDER || (process.platform === "linux" ? resolve(ROOT, "tools/blender/linux/blender") : "/Applications/Blender.app/Contents/MacOS/Blender");
const ART = resolve(ROOT, "art/blender");
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const HELMS = ["iron", "nasal", "hood", "ridge", "spectacle", "boar", "crowned", "wyrm", "suttonhoo"];
const BEARDS = ["short", "full", "forked", "braided"];
const HAIRS = ["short", "long", "braids"];

const argv = process.argv.slice(2);
const only = argv.indexOf("--class") >= 0 ? argv[argv.indexOf("--class") + 1] : null;
if (only && !CLASSES.includes(only)) { console.error(`[exportprops] unknown class ${only}`); process.exit(2); }
if (!existsSync(BLENDER)) { console.error(`[exportprops] no Blender at ${BLENDER} - set BLENDER=`); process.exit(2); }
if (!existsSync(resolve(ART, "tex/tiles.json"))) {
  console.error("[exportprops] art/blender/tex/tiles.json is missing - run `node tools/blender/exporttextures.mjs` first (else UV baking is silently skipped)");
  process.exit(2);
}

const run = (label, cmd, args) => {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
  if (r.status !== 0) { console.error(`[exportprops] FAILED ${label}\n${(r.stdout || "").split("\n").slice(-8).join("\n")}\n${(r.stderr || "").split("\n").slice(-12).join("\n")}`); process.exit(1); }
  return (Date.now() - t0) / 1000;
};

let bad = 0;
for (const cls of only ? [only] : CLASSES) {
  const t0 = Date.now();
  run(`exportcosmetics ${cls}`, "node", [resolve(ROOT, "tools/blender/exportcosmetics.mjs"), "--class", cls]);
  for (const id of HELMS) run(`helm-${cls}-${id}`, BLENDER, ["-b", "-noaudio", "-P", resolve(ROOT, "tools/blender/prop.py"), "--", `helm-${cls}-${id}`]);
  for (const id of BEARDS) run(`beard-${cls}-${id}`, BLENDER, ["-b", "-noaudio", "-P", resolve(ROOT, "tools/blender/strands.py"), "--", `beard-${cls}-${id}`]);
  for (const id of HAIRS) run(`hair-${cls}-${id}`, BLENDER, ["-b", "-noaudio", "-P", resolve(ROOT, "tools/blender/strands.py"), "--", `hair-${cls}-${id}`]);
  const want = [...HELMS.map((i) => `helm-${cls}-${i}`), ...BEARDS.map((i) => `beard-${cls}-${i}`), ...HAIRS.map((i) => `hair-${cls}-${i}`)];
  const have = new Set(readdirSync(ART));
  const missing = want.filter((s) => !have.has(`${s}.glb`));
  if (missing.length) { console.error(`[exportprops] ${cls}: missing ${missing.join(", ")}`); bad++; continue; }
  console.log(`[exportprops] ${cls}: ${want.length} GLBs in ${((Date.now() - t0) / 1000).toFixed(1)} s -> art/blender (run \`bash tools/blender/linux/ship-changed.sh\` to ship)`);
}
if (bad) process.exit(1);
