#!/usr/bin/env node
// ============================================================
// AUTHOREDTEST — the dressing logic, run against the real exports.
//
//   node tools/authoredtest.mjs      (or: npm run authoredtest)
//
// `tools/gltftest.mjs` proves the FILES are sound. This proves the CODE that
// will read them is — `src/game/client/render/authored.ts`, run headless
// against all four warriors, with no browser and no GPU.
//
// WHY THE MODULE IS SHAPED SO THIS CAN EXIST. `authored.ts` splits the pure
// functions (`rolePartsOf`, `hideBakedRoles`, `warriorIsUsable`) from the one
// that touches the network, so everything with a decision in it takes a parsed
// scene rather than a URL. It is the same split that made `chain.ts` gateable:
// `anim.ts` imports three.js and half the renderer, and nothing under `tools/`
// can execute a line of it.
//
// THE PROPERTY THAT MATTERS MOST IS THE LAST ONE. `PLATFORM-PATH.md` §5b:
// "an authored asset must never become the only way a thing can be drawn."
// Every refusal here has to be a NULL the caller can fall back from, never a
// throw — a corrupt file must cost a player his upgraded man, not his fight.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ART = resolve(ROOT, "art/blender");
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];

const {
  rolePartsOf, hideBakedRoles, warriorIsUsable, AUTHORED_ROLES, REQUIRED_CLIPS,
} = await import(pathToFileURL(resolve(ROOT, "src/game/client/render/authored.ts")).href);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};
const parse = (file) => new Promise((ok, no) => {
  const b = readFileSync(file);
  new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "", ok, no);
});

console.log("\n[authoredtest] the dressing logic, against the real exports\n");

check("the module states its roles and its clips",
  AUTHORED_ROLES.length === 4 && REQUIRED_CLIPS.length >= 12,
  `${AUTHORED_ROLES.join(", ")} / ${REQUIRED_CLIPS.length} clips`);

for (const cls of CLASSES) {
  const file = resolve(ART, `warrior-${cls}.glb`);
  if (!existsSync(file)) { check(`${cls}: exported`, false, file); continue; }
  const g = await parse(file);

  // ---- the roles are found, and found as GROUPS ----
  const roles = rolePartsOf(g.scene);
  check(`${cls}: every role is found in the scene`,
    AUTHORED_ROLES.every((r) => (roles.get(r) ?? []).length > 0),
    [...roles].map(([r, p]) => `${r}x${p.length}`).join(" "));

  // ---- the asset is judged usable BEFORE anything is drawn ----
  const verdict = warriorIsUsable(g.scene, g.animations);
  check(`${cls}: the loader judges him usable`, verdict.ok, verdict.ok ? "" : verdict.why);

  // ---- DRESSING: hide what was not bought, keep what was ----
  //
  // The property, stated as an invariant rather than a count: after dressing,
  // every part of a WANTED role is still visible and every part of an unwanted
  // one is not. A count alone would pass a function that hid the wrong things
  // in the right number.
  const wanted = new Set(["helm", "cloak"]);
  const hidden = hideBakedRoles(g.scene, wanted);
  const after = rolePartsOf(g.scene);
  const keptAllWanted = [...wanted].every((r) => (after.get(r) ?? []).every((p) => p.visible));
  const hidAllUnwanted = AUTHORED_ROLES.filter((r) => !wanted.has(r))
    .every((r) => (after.get(r) ?? []).every((p) => !p.visible));
  check(`${cls}: dressing keeps every part of a bought role`, keptAllWanted);
  check(`${cls}: dressing hides every part of an unbought role`, hidAllUnwanted, `${hidden} hidden`);

  // ---- and it is IDEMPOTENT: dressing twice hides nothing new ----
  // A man is re-dressed whenever his appearance changes, and a second pass that
  // "hid" more would mean the first had missed some.
  check(`${cls}: dressing again hides nothing further`, hideBakedRoles(g.scene, wanted) === 0);
}

// ---- THE REFUSALS ARE NULLS, NOT THROWS ----------------------------------
//
// The law: an authored asset must never become the only way a thing can be
// drawn. Every one of these is a shape the loader will meet in the wild.
{
  const empty = { name: "", children: [], visible: true, traverse(f) { f(this); } };
  let threw = null;
  try {
    const v = warriorIsUsable(empty, []);
    check("an empty scene is REFUSED, with a reason", !v.ok && typeof v.why === "string", v.why);
  } catch (e) { threw = e; }
  check("...and refusing it did not throw", threw === null, threw ? String(threw) : "");

  let threw2 = null;
  try {
    check("hiding roles on an empty scene is a no-op, not a crash", hideBakedRoles(empty, new Set()) === 0);
    check("reading roles off an empty scene gives an empty map", rolePartsOf(empty).size === 0);
  } catch (e) { threw2 = e; }
  check("...and neither threw", threw2 === null, threw2 ? String(threw2) : "");
}

// A scene that parses but is a statue — the silent failure worth naming.
{
  const statue = {
    name: "root", visible: true,
    traverse(f) { f(this); f({ name: "part_1", isMesh: true, visible: true, traverse: (g) => g(this) }); },
  };
  const v = warriorIsUsable(statue, REQUIRED_CLIPS.map((n) => ({ name: n })));
  check("a parsed-but-UNSKINNED man is refused — he would draw as a statue",
    !v.ok && /unskinned/.test(v.why), v.ok ? "accepted" : v.why);
}

console.log(`\n[authoredtest] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
