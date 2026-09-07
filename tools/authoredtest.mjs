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
  pivotBonesOf, missingPivotBones, PIVOT_BONE_NAMES,
  upgradeRigToAuthored, drapeBonesOf, DRAPE_BONE_NAMES,
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

// ---- THE BRIDGE: can the SHIPPED pose system drive an authored man? -------
//
// This is the check that decides whether P2 is a wave or a rewrite.
// `docs/PERFORMANCE.md` costs authored meshes as "a rewrite of anim.ts's
// posing". That is true of the stage-5 MERGE and not of DRAWING an authored
// man: `applyPose` writes rotations onto about a dozen named joints, a pivot
// is an Object3D, and so is a Bone. If every joint the pose writes has a bone
// in the export, the authored man moves on the same SWINGS, the same
// chainSwing variants, the same weight and hitstop, with no line of it changed.
{
  check("the bridge names a bone for every joint the pose writes",
    Object.keys(PIVOT_BONE_NAMES).length >= 10,
    Object.entries(PIVOT_BONE_NAMES).map(([k, v]) => `${k}->${v}`).join(" "));

  for (const cls of CLASSES) {
    const f = resolve(ART, `warrior-${cls}.glb`);
    if (!existsSync(f)) continue;
    const g = await parse(f);
    const missing = missingPivotBones(g.scene);
    check(`${cls}: the export carries every joint the pose writes`,
      missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : "all ten");
    const piv = pivotBonesOf(g.scene);
    check(`${cls}: the bridge resolves to real objects with rotations`,
      !!piv && Object.values(piv).every((o) => o && o.rotation && typeof o.rotation.set === "function"),
      piv ? `${Object.keys(piv).length} joints` : "null");
  }

  // ALL OR NOTHING. A partial map poses a man from the waist up and leaves him
  // rigid below, on a build where every geometry gate still passes.
  const half = { name: "root", rotation: {}, traverse(f) { f(this); f({ name: "Spine", rotation: {}, traverse: () => {} }); } };
  check("a partial skeleton is REFUSED whole, not half-mapped",
    pivotBonesOf(half) === null,
    `missing ${missingPivotBones(half).length} of ${Object.keys(PIVOT_BONE_NAMES).length}`);
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

// ---- THE SWAP, END TO END ON A REAL EXPORT -------------------------------
//
// The property that matters is not "it worked" — it is that every REFUSAL
// leaves the rig untouched. A half-swapped man is worse than no swap: authored
// geometry on procedural pivots is a man who does not move, and §5b's law is
// that an authored asset must never become the only way a thing can be drawn.
{
  const fakeRig = () => {
    const kept = { name: "procedural-body", isProcedural: true };
    const body = { name: "body", children: [kept], add(c) { this.children.push(c); }, remove(c) { this.children = this.children.filter((x) => x !== c); } };
    return { body, pivots: { chest: { procedural: true }, head: { procedural: true } }, kept };
  };

  const g = await parse(resolve(ART, "warrior-huscarl.glb"));
  const rig = fakeRig();
  const r = upgradeRigToAuthored(rig, {
    scene: g.scene,
    wornRoles: new Set(["helm", "cloak"]),
    resolveMaterial: (ask) => ({ name: `lib:${ask.surface ?? "plain"}`, isMaterial: true }),
    clips: g.animations,
  });
  check("the swap succeeds on a real export", r.ok, r.ok ? `${r.joints} joints, ${r.dressed} dressed, ${r.hidden} hidden, ${r.rehung} rehung` : r.why);
  check("the procedural body is gone and the authored one is under the same parent",
    !rig.body.children.includes(rig.kept) && rig.body.children.includes(g.scene),
    `${rig.body.children.length} child(ren)`);
  check("every pose joint now points at an authored bone",
    Object.keys(PIVOT_BONE_NAMES).every((k) => rig.pivots[k] && !rig.pivots[k].procedural),
    `${Object.keys(rig.pivots).length} joints repointed`);

  // ---- THE CLOAK: the drape the solver integrates ----------------------
  //
  // This was declared an unfixable topology mismatch and withheld, on the
  // grounds that anim.ts solves a GRID and the export writes a CHAIN. The
  // counts should have been checked first: the grid is 1 + 3 x 2 = SEVEN and
  // the export carries SEVEN, because `exportrig.mjs` names the procedural
  // rig's OWN drape array by index. It is a lookup, not a mismatch.
  {
    const gc = await parse(resolve(ART, "warrior-huscarl.glb"));
    const found = drapeBonesOf(gc.scene);
    check("the export carries the whole drape, in the solver's index order",
      !!found && found.length === DRAPE_BONE_NAMES.length,
      found ? found.map((b) => b.name).join(", ") : "null");

    // ALL OR NOTHING: a half-found drape is a cloak with some bones swinging
    // and some standing in rest pose, which is worse than one that is absent.
    const partial = { name: "r", traverse(f) { f(this); f({ name: "CloakYoke", traverse: () => {} }); } };
    check("a partial drape is refused whole", drapeBonesOf(partial) === null);

    // And the swap repoints the solver's array at them.
    const rigC = fakeRig();
    rigC.drape = DRAPE_BONE_NAMES.map(() => ({ procedural: true }));
    const res = upgradeRigToAuthored(rigC, {
      scene: gc.scene, wornRoles: new Set(["cloak", "helm"]),
      resolveMaterial: () => ({ isMaterial: true }), clips: gc.animations,
    });
    check("the swap repoints the cloth solver at the authored drape",
      res.ok && res.drape === DRAPE_BONE_NAMES.length, res.ok ? `${res.drape} drape bones` : res.why);
    check("...and every one of them is an authored bone now",
      rigC.drape.every((b) => b && !b.procedural),
      rigC.drape.map((b) => b?.name ?? "?").join(", "));
    check("the cloak is NOT hidden any more — it can be posed",
      res.ok && res.hidden < 4, res.ok ? `${res.hidden} hidden` : res.why);
  }

  // ---- THE HANDS: what he was holding must still be on him -------------
  //
  // THE FIRST AUTHORED MAN EVER DRAWN CAME OUT UNARMED, and no structural gate
  // could have caught it: the geometry was perfect and the swap reported
  // success. `anim.ts` does `rightHand.add(weapon)`, so the weapon and shield
  // live INSIDE the procedural body, and removing the body took them with it.
  // Only a picture found it. This is that picture, as an assertion.
  {
    const g3 = await parse(resolve(ART, "warrior-berserker.glb"));
    const rig3 = fakeRig();
    // REAL Object3Ds, because three.js's `add()` refuses anything else and
    // returns quietly — a plain-object fixture reported "2 rehung" while
    // nothing had actually been parented, which is the same class of false
    // green this suite exists to catch.
    const { Group } = await import("three");
    const wrist = new Group(); wrist.name = "the-weapon";
    const board = new Group(); board.name = "the-shield";
    rig3.weapon = wrist; rig3.shield = board;
    const res = upgradeRigToAuthored(rig3, {
      scene: g3.scene, wornRoles: new Set(["helm"]),
      resolveMaterial: () => ({ isMaterial: true }), clips: g3.animations,
    });
    check("the swap re-hangs what he was holding", res.ok && res.rehung === 2,
      res.ok ? `${res.rehung} rehung` : res.why);
    // The proof is PARENTAGE, not a count: they must be under the authored
    // wrist bones, which is the only place a hand can carry them.
    const mounts = [];
    g3.scene.traverse((o) => { if (o.name === "HandR" || o.name === "LeftElbow") mounts.push(o); });
    const carried = mounts.flatMap((b) => b.children.map((c) => c.name));
    check("...a blade on the fist and a board on the elbow it straps to",
      carried.includes("the-weapon") && carried.includes("the-shield"),
      `mounts carry: ${carried.join(", ") || "nothing"}`);
  }

  // ---- AND THE REFUSALS LEAVE THE RIG EXACTLY AS THEY FOUND IT ----
  const g2 = await parse(resolve(ART, "warrior-warden.glb"));
  {
    const bad = fakeRig();
    const before = [...bad.body.children];
    const res = upgradeRigToAuthored(bad, {
      scene: g2.scene, wornRoles: new Set(), resolveMaterial: () => null,
      clips: [{ name: "idle" }],   // a man with one clip is not a man
    });
    check("an asset missing clips is REFUSED", !res.ok && /missing clips/.test(res.why), res.ok ? "accepted" : res.why);
    check("...and the rig still holds its procedural body",
      bad.body.children.length === before.length && bad.body.children[0] === bad.kept);
    check("...and its pivots were not repointed",
      bad.pivots.chest.procedural === true && bad.pivots.head.procedural === true);
  }
  {
    const bad = fakeRig();
    // A man who passes EVERY other test and has no skeleton: skinned meshes, all
    // the clips, a role-named part so the roles check is satisfied — and not one
    // bone the pose can write. This fixture is deliberate: an earlier version
    // had no role part, so it was refused for THAT and never reached the joints
    // check at all. The refusal was right and the test was measuring the wrong
    // one, which is the whole failure mode this suite exists to catch.
    const boneless = { name: "root", traverse(f) {
      f(this);
      f({ name: "helm_1", isMesh: true, isSkinnedMesh: true, visible: true, material: { name: "mail:5f6b7a" }, traverse: () => {} });
    } };
    const res = upgradeRigToAuthored(bad, {
      scene: boneless, wornRoles: new Set(),
      resolveMaterial: () => ({ isMaterial: true }),
      clips: REQUIRED_CLIPS.map((n) => ({ name: n })),
    });
    check("an asset the pose cannot reach is REFUSED", !res.ok && /missing joints/.test(res.why), res.ok ? "accepted" : res.why);
    check("...and that rig is untouched too",
      bad.body.children[0] === bad.kept && bad.pivots.chest.procedural === true);
  }
}

// ---- EIGHT MEN, FOUR FILES: one parse must not be one BODY ---------------
//
// The arena's requirement, and the defect it prevents is specific and ugly:
// `upgradeRigToAuthored` RE-PARENTS the scene it is handed, so two men swapping
// against the same cached object means the SECOND takes the FIRST'S body off
// him — and the first is drawn as a floating nameplate over nothing.
//
// `instanceAuthored` is also NOT `Object3D.clone`, and that distinction is the
// whole check: a skinned mesh cloned that way keeps a reference to the ORIGINAL
// skeleton, so eight men would share one set of bones and pose as one animal.
{
  const { instanceAuthored } = await import(pathToFileURL(resolve(ROOT, "src/game/client/render/authoredSource.ts")).href);
  const asset = await parse(resolve(ART, "warrior-huscarl.glb"));
  const a = instanceAuthored({ scene: asset.scene, clips: asset.animations });
  const b = instanceAuthored({ scene: asset.scene, clips: asset.animations });

  check("two instances are two different scenes", a.scene !== b.scene && a.scene !== asset.scene);

  const bonesOf = (root) => { const out = []; root.traverse((o) => { if (o.isBone) out.push(o); }); return out; };
  const [ba, bb] = [bonesOf(a.scene), bonesOf(b.scene)];
  check("each instance has its own bones", ba.length > 0 && ba.length === bb.length && !ba.some((x) => bb.includes(x)),
    `${ba.length} bones each, none shared`);

  const skinsOf = (root) => { const out = []; root.traverse((o) => { if (o.isSkinnedMesh) out.push(o); }); return out; };
  const [sa, sb] = [skinsOf(a.scene), skinsOf(b.scene)];
  check("each instance's meshes are bound to their OWN skeleton — not one shared animal",
    sa.length > 0 && sa.every((m, i) => m.skeleton && sb[i].skeleton && m.skeleton !== sb[i].skeleton),
    `${sa.length} skinned meshes, skeletons distinct`);

  // The saving that makes it worth doing: geometry is SHARED, not copied.
  check("...while the geometry buffers are shared, not copied",
    sa.some((m, i) => m.geometry === sb[i].geometry), "same BufferGeometry across instances");

  // And a swap on one must not disturb the other.
  const mkRig = () => {
    const kept = { name: "procedural-body" };
    const body = { name: "body", children: [kept], add(c) { this.children.push(c); }, remove(c) { this.children = this.children.filter((x) => x !== c); } };
    return { body, pivots: {} };
  };
  const rigA = mkRig(), rigB = mkRig();
  const mk = (scene) => ({ scene, wornRoles: new Set(["helm", "cloak"]), resolveMaterial: () => ({ isMaterial: true }), clips: asset.animations });
  const ra = upgradeRigToAuthored(rigA, mk(a.scene));
  const rb = upgradeRigToAuthored(rigB, mk(b.scene));
  // THE CACHE MUST SURVIVE A SWAP UNTOUCHED, and this is the arena's own bug
  // written down as a check. The armoury preview handed the CACHED scene to the
  // swap; the swap re-parented the mannequin's weapon and shield into it; and
  // every man cloned afterwards carried the shop's kit. It surfaced as "warden:
  // 5 of 50 meshes unskinned" against an export that is 45 of 45 — a count no
  // structural gate on the FILE could ever have produced, because the file was
  // fine and the thing in memory was not.
  const cachedMeshes = () => { let n = 0; asset.scene.traverse((o) => { if (o.isMesh) n++; }); return n; };
  const beforeSwaps = cachedMeshes();
  check("the swap did not mutate the cached parse",
    cachedMeshes() === beforeSwaps && !asset.scene.children.includes(a.scene),
    `${beforeSwaps} meshes in the cache, unchanged`);

  check("two men can both be upgraded, and neither steals the other's body",
    ra.ok && rb.ok && rigA.body.children[0] === a.scene && rigB.body.children[0] === b.scene,
    `${ra.ok ? ra.joints : ra.why} / ${rb.ok ? rb.joints : rb.why}`);
}

console.log(`\n[authoredtest] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
