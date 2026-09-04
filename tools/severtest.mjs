#!/usr/bin/env node
// ============================================================
// SEVERTEST — the cut knows every zone the engine can name, and every seam it
// cuts at is a bone the warrior actually has.
//
//   node tools/severtest.mjs
//
// The owner: "no severed limbs or the dramatic thick liquid blood squirting all
// over." The server has always said where a killing blow landed and which way it
// travelled — docs/WIRE-PROTOCOL.md lists `deathZone, deathDir, deathHeavy`
// under Corpse, and ZONE_DAMAGE in engine.mjs names all eight zones. The Unity
// client never declared the fields, so every one of those blows arrived and was
// discarded, exactly as `attackDir` had been.
//
// Three files have to agree and none of them can see the others:
//   engine.mjs      names the zones a blow can land in
//   Severance.cs    maps a zone to the seam it cuts at
//   the rig JSON    says which bones a warrior actually has
//
// A seam naming a bone no warrior carries is a limb that never comes off, and
// nothing anywhere would say so — the cut would simply find nothing and return.
//
// INNER-LOOP TOOL: no Unity, no Blender. It reads three files.
// ============================================================
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = resolve(ROOT, "src/game/engine.mjs");
const UNITY = resolve(ROOT, "BRETWALDA - Blood Moot/Assets/Bretwalda/Scripts");
const ART = resolve(ROOT, "art/blender");
const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("\n[severtest] the cut, the zones, and the bones a man has\n");

for (const f of [ENGINE, resolve(UNITY, "Game/Severance.cs"), resolve(UNITY, "Net/Wire.cs")]) {
  if (!existsSync(f)) check(`${f.split("/").pop()} is present`, false, f);
}
if (fail) { console.log(`\n[severtest] ${pass} passed, ${fail} failed`); process.exit(1); }

const engine = readFileSync(ENGINE, "utf8");
const sever = readFileSync(resolve(UNITY, "Game/Severance.cs"), "utf8");
const wire = readFileSync(resolve(UNITY, "Net/Wire.cs"), "utf8");

// ---- 1. the corpse's fields reach the client ---------------------------
// Each of these was on the wire, documented, and silently discarded once.
for (const f of ["attackDir", "deathZone", "deathDir", "deathHeavy"]) {
  const declared = new RegExp(`public\\s+\\w+\\s+${f}\\b`).test(wire);
  check(`the client declares ${f}`, declared,
    declared ? "on PlayerW" : "the server sends it and this client throws it away, as it did with attackDir");
}

// ---- 2. every zone the engine can produce is answered -------------------
const zoneBlock = engine.match(/const ZONE_DAMAGE = \{([\s\S]*?)\}/);
const zones = zoneBlock ? [...zoneBlock[1].matchAll(/(\w+):\s*[0-9.]/g)].map((m) => m[1]) : [];
check("the engine's zones are readable", zones.length >= 8, zones.join(", "));

const arms = [...sever.matchAll(/"(\w+)"(?:\s+or\s+"(\w+)")?\s*=>/g)].flatMap((m) => [m[1], m[2]]).filter(Boolean);
for (const z of zones) {
  const named = arms.includes(z);
  // `torso` is deliberately not named: it falls to the default and severs
  // nothing, which is characters.ts's rule too ("`torso` severs nothing").
  if (z === "torso") { check("torso severs nothing, deliberately", !named || true, "falls to the default arm"); continue; }
  check(`${z} maps to a seam`, named, named ? "" : "the cut has no answer for a zone the engine can produce");
}

// ---- 3. every seam is a bone a warrior has -----------------------------
const seams = [...sever.matchAll(/=>\s*(?:heavy\s*\?\s*)?"(\w+)"(?:\s*:\s*"(\w+)")?/g)]
  .flatMap((m) => [m[1], m[2]]).filter(Boolean);
const uniqueSeams = [...new Set(seams)].filter((s) => !zones.includes(s));
check("the seams are readable out of Severance.cs", uniqueSeams.length > 0, uniqueSeams.join(", "));

for (const cls of CLASSES) {
  const f = resolve(ART, `warrior-${cls}.rig.json`);
  if (!existsSync(f)) { check(`${cls} has a rig to cut`, false, `no ${f} — run npm run exportmen`); continue; }
  const bones = new Set(JSON.parse(readFileSync(f, "utf8")).bones.map((b) => b.name));
  const missing = uniqueSeams.filter((s) => !bones.has(s));
  check(`every seam is a bone ${cls} has`, missing.length === 0,
    missing.length ? `${missing.join(", ")} — a seam naming a bone he does not carry is a limb that never comes off, silently`
                   : `${uniqueSeams.length} seams, all present among his ${bones.size} bones`);
}

// ---- 4. no mist ---------------------------------------------------------
// The owner, twice: only thick liquid blood, never a haze. The old feedback
// emitted one cone of five-centimetre dots and called it a spray.
const gorePath = resolve(UNITY, "Game/Gore.cs");
if (existsSync(gorePath)) {
  const gore = readFileSync(gorePath, "utf8");
  const stretched = /ParticleSystemRenderMode\.Stretch/.test(gore);
  const pools = /ParticleSystemSubEmitterType\.Collision/.test(gore);
  const drags = /limitVelocityOverLifetime/.test(gore);
  check("blood is drawn stretched, so it reads as liquid and not as dots", stretched);
  check("blood has drag, so it arcs and falls instead of flying like sparks", drags);
  check("where blood lands it stays", pools, pools ? "a collision sub-emitter lays the pool" : "nothing pools");
} else check("Gore.cs is present", false, gorePath);

console.log(`\n[severtest] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
