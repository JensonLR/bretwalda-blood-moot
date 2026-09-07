#!/usr/bin/env node
// ============================================================
// GLTFTEST — the authored assets are loadable by the client that will load them.
//
//   node tools/gltftest.mjs        (or: npm run gltftest)
//
// WHY THIS EXISTS, AND IT IS THE PRECONDITION FOR P2.
//
// `tools/blender/*` has been exporting glTF since 2 Sep 2026 and **not one byte
// of it has ever been opened by three.js**. It was written for Unity, judged in
// Blender renders, and consumed by a client that is now retired
// (`docs/ONE-CLIENT.md`). 303 MB of assets whose only reader is gone is 303 MB
// of assumption.
//
// `ONE-CLIENT.md` P2 is the loader that will read them. Building a loader for
// assets nobody has verified is how a wave spends a week discovering the
// exports were wrong — so this verifies them FIRST, with no renderer, no
// browser and no GPU: `GLTFLoader.parse` takes an ArrayBuffer and needs none of
// those.
//
// WHAT IT HOLDS
//
//   1. EVERY ASSET PARSES. A glTF that three.js refuses is a glTF the game
//      cannot use, whatever Blender rendered from it.
//   2. THE MEN ARE SKINNED. `exportrig` binds 25 joints and ~46 meshes; a man
//      who arrives unskinned is a statue and the whole pipeline is decorative.
//   3. THE CLIPS ARE ALL THERE. `clips.py` authors nine and the export carries
//      more; the game needs the four attack directions by name, because
//      `attackDir` is on the wire and `SWINGS`/`chainSwing` are keyed on it.
//   4. THE COSMETIC ROLES SURVIVED. `exportrig` names its objects by role —
//      helm_N, beard_N, hair_N, cloak_N — so a loader can HIDE what the
//      armoury did not sell. Lose the names and every man wears everything.
//   5. THE BUDGET IS REPORTED AGAINST THE PROCEDURAL MAN. This is the number
//      that turns P2 from a visual wave into a performance one, and it is
//      printed rather than asserted because the procedural side moves.
//
// INNER-LOOP TOOL: no Blender, no browser, no build. It reads 303 MB of glb.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ART = resolve(ROOT, "art/blender");
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];

/** The four the wire can ask for by name. `attackDir` rides every swing. */
const ATTACK_CLIPS = ["attack", "attackLeft", "attackOverhead", "attackStab"];
/** The rest of what a fight needs to draw. */
const FIGHT_CLIPS = ["heavy", "block", "dodge", "hit", "die", "idle", "walk", "run"];
/** Roles a loader must be able to hide when the armoury did not sell them. */
const ROLE_PREFIXES = ["helm", "beard", "hair", "cloak"];

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

const parse = (file) => new Promise((ok, no) => {
  const b = readFileSync(file);
  new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "", ok, no);
});

console.log("\n[gltftest] the authored assets, opened by three.js for the first time\n");

const survey = [];
for (const cls of CLASSES) {
  const file = resolve(ART, `warrior-${cls}.glb`);
  if (!existsSync(file)) {
    check(`${cls}: the warrior is exported`, false, `no ${file} — run npm run exportmen`);
    continue;
  }
  let g;
  try { g = await parse(file); }
  catch (e) { check(`${cls}: three.js parses the warrior`, false, String(e?.message ?? e)); continue; }
  check(`${cls}: three.js parses the warrior`, true);

  let meshes = 0, skinned = 0, tris = 0;
  const names = [];
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    if (o.isSkinnedMesh) skinned++;
    names.push(o.name || "");
    const p = o.geometry.getAttribute("position");
    if (p) tris += (o.geometry.index ? o.geometry.index.count : p.count) / 3;
  });
  tris = Math.round(tris);
  survey.push({ cls, meshes, tris });

  // 2. EVERY mesh skinned, not most. A man with one rigid part has a part that
  //    stays behind when he moves, and it is the sort of thing nobody sees
  //    until the first stride.
  check(`${cls}: every mesh is skinned to the armature`, skinned === meshes && meshes > 0,
    `${skinned}/${meshes}`);

  // 3. The clips, by name.
  const clips = new Set(g.animations.map((a) => a.name));
  const missingAttack = ATTACK_CLIPS.filter((c) => !clips.has(c));
  check(`${cls}: all four attack directions are present by name`, missingAttack.length === 0,
    missingAttack.length ? `missing ${missingAttack.join(", ")}` : ATTACK_CLIPS.join(", "));
  const missingFight = FIGHT_CLIPS.filter((c) => !clips.has(c));
  check(`${cls}: the rest of the fight's clips are present`, missingFight.length === 0,
    missingFight.length ? `missing ${missingFight.join(", ")}` : `${clips.size} clips`);
  // A clip with no tracks is a name with nothing behind it, which imports
  // clean and plays nothing.
  const empty = g.animations.filter((a) => !a.tracks || a.tracks.length === 0).map((a) => a.name);
  check(`${cls}: no clip is an empty name`, empty.length === 0, empty.join(", ") || `${g.animations.length} clips, all with tracks`);

  // 4. The cosmetic roles.
  const roles = ROLE_PREFIXES.filter((r) => names.some((n) => n.startsWith(`${r}_`)));
  check(`${cls}: the cosmetic roles survived the export`, roles.length === ROLE_PREFIXES.length,
    roles.length === ROLE_PREFIXES.length
      ? roles.join(", ")
      : `only ${roles.join(", ") || "none"} — a loader cannot hide what it cannot name`);

  // The rig json the exporter wrote beside it, which the loader will need for
  // the bone identities.
  const rig = resolve(ART, `warrior-${cls}.rig.json`);
  if (existsSync(rig)) {
    const bones = JSON.parse(readFileSync(rig, "utf8")).bones ?? [];
    check(`${cls}: the rig sidecar names its bones`, bones.length >= 20,
      `${bones.length} bones, e.g. ${bones.slice(0, 4).map((b) => b.name).join(", ")}`);
  } else check(`${cls}: the rig sidecar is beside the glb`, false, `no ${rig}`);
}

// ---- 5. THE BUDGET, REPORTED ---------------------------------------------
//
// Not asserted: the procedural side moves, and a bar here would go red on a
// day somebody improved the OTHER man. Printed because it is the number that
// decides whether P2 is a visual wave or a performance one.
//
// The procedural figures are `tools/framecost.mjs`'s own census at `high`,
// 7 Sep 2026: a median warrior of 65 meshes and 66,184 triangles.
const PROC_MESHES = 65, PROC_TRIS = 66184;
if (survey.length) {
  const m = Math.round(survey.reduce((t, r) => t + r.meshes, 0) / survey.length);
  const t = Math.round(survey.reduce((r, x) => r + x.tris, 0) / survey.length);
  console.log("\n  THE AUTHORED MAN AGAINST THE PROCEDURAL ONE\n");
  console.log("    class        meshes   triangles");
  for (const r of survey) console.log(`    ${r.cls.padEnd(12)} ${String(r.meshes).padStart(6)} ${r.tris.toLocaleString().padStart(11)}`);
  console.log(`    ${"authored avg".padEnd(12)} ${String(m).padStart(6)} ${t.toLocaleString().padStart(11)}`);
  console.log(`    ${"procedural".padEnd(12)} ${String(PROC_MESHES).padStart(6)} ${PROC_TRIS.toLocaleString().padStart(11)}   <- framecost census, high, 7 Sep 2026`);
  console.log(`\n    Per man: ${m - PROC_MESHES} meshes, ${(t - PROC_TRIS).toLocaleString()} triangles.`);
  console.log(`    Over eight: ${(m - PROC_MESHES) * 8} draw calls and ${((t - PROC_TRIS) * 8).toLocaleString()} triangles.`);
  console.log(`    REPORTED, NOT GATED — the procedural side moves, and a bar here would`);
  console.log(`    go red the day somebody improved the other man.`);
}

console.log(`\n[gltftest] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
