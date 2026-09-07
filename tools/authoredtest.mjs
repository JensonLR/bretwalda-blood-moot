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
  readSurfaceName, dressFromSurfaceNames,
} = await import(pathToFileURL(resolve(ROOT, "src/game/client/render/authored.ts")).href);
const { SURFACES } = await import(pathToFileURL(resolve(ROOT, "src/game/client/render/textures.ts")).href)
  .then((m) => ({ SURFACES: m.SURFACES ?? null })).catch(() => ({ SURFACES: null }));

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

// ---- THE SURFACE NAMES, WHICH ARE THE WHOLE ECONOMY OF THIS ---------------
//
// The exports embed NO textures — 6.49 MB for all four classes — and ship
// materials as `<surface>:<hex>` for the client to build from its own library.
// If a name cannot be read, the man arrives in flat colour: still a man, and
// not the upgrade. So the reading is gated over every material in every export.
{
  check("a surface name reads into a surface and a colour",
    JSON.stringify(readSurfaceName("mail:5f6b7a")) === JSON.stringify({ surface: "mail", color: 0x5f6b7a }));
  check("case does not matter, and neither does surrounding space",
    readSurfaceName("  MAIL:5F6B7A ")?.surface === "mail");
  check("an untextured one-off reads as a colour with no surface",
    readSurfaceName("m_bfa25c")?.surface === null && readSurfaceName("m_bfa25c")?.color === 0xbfa25c);
  check("a NAMED SPECIAL is a null — the author meant it, and it is left alone",
    readSurfaceName("runeGlow_carved") === null);
  check("rubbish is a null and not a throw",
    readSurfaceName("") === null && readSurfaceName(undefined) === null && readSurfaceName(null) === null);

  let total = 0, read = 0;
  const unreadable = new Set();
  for (const cls of CLASSES) {
    const f = resolve(ART, `warrior-${cls}.glb`);
    if (!existsSync(f)) continue;
    const g = await parse(f);
    const seen = new Set();
    g.scene.traverse((o) => { if (o.isMesh && o.material?.name) seen.add(o.material.name); });
    for (const n of seen) { total++; if (readSurfaceName(n)) read++; else unreadable.add(n); }
  }
  // ENUMERATED, NOT THRESHOLDED. A percentage bar passes a build where the
  // wrong 20% stopped reading; this names what is allowed to be unreadable and
  // fails on anything else. The only legal residue is a NAMED SPECIAL — a
  // material with no colour in its name, authored deliberately, which the
  // client must leave exactly as it found it.
  check("every material name that carries a COLOUR is read",
    read === total - unreadable.size + 0 && [...unreadable].every((n) => !/[0-9a-f]{6}/i.test(n)),
    `${read}/${total} read; residue: ${[...unreadable].join(", ") || "none"}`);
  check("the residue is named specials only — the author meant those",
    [...unreadable].every((n) => /^[a-zA-Z][\w]*$/.test(n) && !/[0-9a-f]{6}$/i.test(n)),
    [...unreadable].join(", ") || "none");

  // ---- DRESSING FROM THE NAMES, with a stub library ----
  const g = await parse(resolve(ART, "warrior-huscarl.glb"));
  const asked = [];
  const r = dressFromSurfaceNames(g.scene, (ask) => {
    asked.push(ask.surface);
    return { name: `stub:${ask.surface}`, isMaterial: true };
  });
  check("dressing swaps a material for every readable name", r.dressed > 0, `${r.dressed} meshes dressed`);
  check("...and reports the names it left alone rather than swallowing them",
    r.unknown.every((n) => !/[0-9a-f]{6}/i.test(n)), r.unknown.join(", ") || "none");
  check("...and it asked for real surfaces, plus untextured ones as null",
    asked.length > 0 && asked.every((s) => s === null || /^[a-z]+$/.test(s)),
    [...new Set(asked)].map((x) => x ?? "(untextured)").slice(0, 9).join(", "));

  // A LIBRARY THAT THROWS MUST NOT TAKE THE FIGHT WITH IT.
  const g2 = await parse(resolve(ART, "warrior-warden.glb"));
  let blew = null;
  try {
    const r2 = dressFromSurfaceNames(g2.scene, () => { throw new Error("library exploded"); });
    check("a material library that THROWS costs the upgrade, not the fight",
      r2.dressed === 0 && r2.unknown.length > 0, `${r2.unknown.length} names kept their flat colour`);
  } catch (e) { blew = e; }
  check("...and the throw did not escape", blew === null, blew ? String(blew) : "");
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
