#!/usr/bin/env node
// EXPORTMEN — the whole man, end to end, for every class, into the client.
//
//   node tools/blender/exportmen.mjs [--cls huscarl]
//
// Three steps have to run in order and nothing joined them:
//   exportrig.mjs   the game's own builder -> OBJ + the bone tree, MIRRORED so
//                   the man is right-handed at a positive scale
//   rig.py          the armature, the weights, the textures -> blend + glTF
//   clips.py        the twelve clips, onto that armature -> glTF again
// and then the result has to be COPIED to StreamingAssets, which is where the
// client reads it. A build step with no copy step is a build step that lies —
// it has cost this project a day of magenta portraits and a day of stale clips.
//
// It also checks the clip count: ClipDriver stands the whole rig down and falls
// back to the procedural pose below four of the nine it names, silently.
import { spawnSync } from "child_process";
import { existsSync, copyFileSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BLENDER = process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender";
const ART = resolve(ROOT, "art/blender");
const SHIP = resolve(ROOT, "BRETWALDA - Blood Moot/Assets/StreamingAssets");
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
const WANT_CLIPS = 12;

const argv = process.argv.slice(2);
const only = argv.indexOf("--cls") >= 0 ? argv[argv.indexOf("--cls") + 1] : null;
if (!existsSync(BLENDER)) { console.error(`[exportmen] no Blender at ${BLENDER} — set BLENDER=`); process.exit(2); }

const run = (cmd, args, tag) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8" });
  const line = (r.stdout || "").split("\n").filter((l) => l.startsWith(tag)).pop() ?? "";
  return { ok: r.status === 0, line, err: (r.stderr || "").split("\n").slice(-6).join("\n") };
};

let bad = 0;
for (const cls of only ? [only] : CLASSES) {
  const rig = run("node", [resolve(ROOT, "tools/blender/exportrig.mjs"), "--class", cls], "[exportrig]");
  if (!rig.ok) { console.error(`[exportmen] ${cls}: exportrig failed\n${rig.err}`); bad++; continue; }

  const built = run(BLENDER, ["-b", "-P", resolve(ROOT, "tools/blender/rig.py"), "--", cls], "[rig.py]");
  if (!built.ok) { console.error(`[exportmen] ${cls}: rig.py failed\n${built.err}`); bad++; continue; }

  const blend = resolve(ART, `warrior-${cls}.blend`);
  const clips = run(BLENDER, ["-b", blend, "-P", resolve(ROOT, "tools/blender/clips.py"), "--", cls], "[clips.py]");
  const n = Number((clips.line.match(/(\d+) clips/) ?? [])[1] ?? 0);
  if (!clips.ok || n < WANT_CLIPS) {
    console.error(`[exportmen] ${cls}: built ${n} of ${WANT_CLIPS} clips\n${clips.err}`);
    bad++; continue;
  }

  // THE CHECK THAT MATTERS: the weapon arm must be on his RIGHT. A body faces
  // local +Z with +Y up in a right-handed frame, so his right is NEGATIVE X.
  // characters.ts builds him left-handed on purpose and exportrig mirrors him;
  // if that mirror ever comes out, this says so before the man ships.
  const tree = JSON.parse((await import("fs")).readFileSync(resolve(ART, `warrior-${cls}.rig.json`), "utf8"));
  const arm = tree.bones.find((b) => b.name === "RightUpperArm");
  if (!arm || arm.position[0] >= 0) {
    console.error(`[exportmen] ${cls}: the weapon arm is at x=${arm ? arm.position[0].toFixed(3) : "?"} — that is his LEFT. The mirror did not take.`);
    bad++; continue;
  }

  const glb = resolve(ART, `warrior-${cls}.glb`);
  copyFileSync(glb, resolve(SHIP, `warrior-${cls}.glb`));
  console.log(`[exportmen] ${cls}: ${n} clips, weapon arm at x=${arm.position[0].toFixed(3)} (his right), ${(statSync(glb).size / 1024).toFixed(0)} KB -> StreamingAssets`);
}
if (bad) { console.error(`[exportmen] ${bad} class(es) not shipped`); process.exit(1); }
console.log("[exportmen] four right-handed men, twelve clips each, in the client");
