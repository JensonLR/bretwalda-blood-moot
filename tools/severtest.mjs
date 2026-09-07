#!/usr/bin/env node
// ============================================================
// SEVERTEST — the cut knows every zone the engine can name, and every seam it
// cuts at is a joint the warrior actually has.
//
//   node tools/severtest.mjs
//
// The owner: "no severed limbs or the dramatic thick liquid blood squirting all
// over." The server has always said where a killing blow landed and which way
// it travelled — docs/WIRE-PROTOCOL.md lists `deathZone, deathDir, deathHeavy`
// under Corpse, and ZONE_DAMAGE in engine.mjs names all eight zones.
//
// THE DEFECT THIS EXISTS FOR: a field can be on the wire, documented, and
// SILENTLY DISCARDED by the client. `attackDir` was, for weeks. Nothing failed;
// the blows simply all looked the same. So "declared" is not the check —
// "declared AND read by the thing that animates the death" is.
//
// REPOINTED 7 Sep 2026 at the three.js client (docs/ONE-CLIENT.md §4.3). Three
// files still have to agree and none of them can see the others:
//   src/game/engine.mjs                  names the zones a blow can land in
//   src/game/client/characters.ts        maps a zone to the seam it cuts at
//   src/game/client/render/anim.ts       actually reads the corpse's fields
//
// A zone with no seam is a limb that never comes off, and nothing anywhere
// would say so — the cut would find nothing and return.
//
// INNER-LOOP TOOL: no Blender, no build. It reads four files.
// ============================================================
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = resolve(ROOT, "src/game/engine.mjs");
const TYPES = resolve(ROOT, "src/game/types.ts");
const CHARS = resolve(ROOT, "src/game/client/characters.ts");
const ANIM = resolve(ROOT, "src/game/client/render/anim.ts");
const VFX = resolve(ROOT, "src/game/client/render/vfx.ts");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};

console.log("\n[severtest] the cut, the zones, and the joints a man has\n");

for (const f of [ENGINE, TYPES, CHARS, ANIM, VFX]) {
  if (!existsSync(f)) check(`${f.split("/").pop()} is present`, false, f);
}
if (fail) { console.log(`\n[severtest] ${pass} passed, ${fail} failed`); process.exit(1); }

const engine = readFileSync(ENGINE, "utf8");
const types = readFileSync(TYPES, "utf8");
const chars = readFileSync(CHARS, "utf8");
const anim = readFileSync(ANIM, "utf8");
const vfx = readFileSync(VFX, "utf8");

// ---- 1. the corpse's fields are declared AND READ ----------------------
// Each of these was on the wire, documented, and silently discarded once.
// Declaration alone was never the property worth holding.
for (const f of ["attackDir", "deathZone", "deathDir", "deathHeavy"]) {
  const declared = new RegExp(`\\b${f}\\??\\s*:`).test(types);
  const read = new RegExp(`\\b${f}\\b`).test(anim);
  check(`the client declares ${f}`, declared, declared ? "on the snapshot type" : "types.ts does not carry it");
  check(`and the animation actually READS ${f}`, read,
    read ? "named in anim.ts" : "declared and discarded — exactly what happened to attackDir for weeks");
}

// ---- 2. every zone the engine can produce is answered -------------------
const zoneBlock = engine.match(/const ZONE_DAMAGE = \{([\s\S]*?)\}/);
const zones = zoneBlock ? [...zoneBlock[1].matchAll(/(\w+):\s*[0-9.]/g)].map((m) => m[1]) : [];
check("the engine's zones are readable", zones.length >= 8, zones.join(", "));

const seamBlock = chars.match(/const ZONE_SEAM[^=]*=\s*\{([\s\S]*?)\n\};/);
const mapped = new Map();
if (seamBlock) {
  for (const m of seamBlock[1].matchAll(/^\s*(\w+):\s*(null|\{[^}]*\})/gm)) mapped.set(m[1], m[2]);
}
check("the renderer's zone-to-seam map is readable", mapped.size >= 8,
  [...mapped.keys()].join(", "));

for (const z of zones) {
  if (z === "torso") {
    // Deliberate, and stated in characters.ts's own comment: `torso` severs
    // nothing. A null here is the DECISION, not an omission — which is why it
    // is checked for explicitly rather than skipped.
    check("torso severs nothing, deliberately", mapped.get("torso") === "null",
      mapped.has("torso") ? `mapped to ${mapped.get("torso")}` : "not named at all — an omission reads the same as a decision");
    continue;
  }
  check(`${z} maps to a seam`, mapped.has(z) && mapped.get(z) !== "null",
    mapped.has(z) ? "" : "the cut has no answer for a zone the engine can produce");
}

// ---- 3. every seam named is a seam the renderer has ---------------------
const seamIds = new Set([...(chars.match(/export type SeamId =([\s\S]*?);/)?.[1] ?? "")
  .matchAll(/"(\w+)"/g)].map((m) => m[1]));
check("the seam vocabulary is readable", seamIds.size >= 10, [...seamIds].join(", "));

const usedSeams = new Set();
for (const [, v] of mapped) for (const m of (v ?? "").matchAll(/(?:joint|mid):\s*"(\w+)"/g)) usedSeams.add(m[1]);
const strangers = [...usedSeams].filter((x) => !seamIds.has(x));
check("every seam a zone cuts at is a real seam", strangers.length === 0,
  strangers.length ? `${strangers.join(", ")} — a seam the rig does not carry is a limb that never comes off, silently`
                   : `${usedSeams.size} seams, all in the vocabulary`);

// A seam is unavailable once the piece it hangs off has already gone, and both
// sides of that table have to be real or the second cut on an arm finds nothing.
const needs = chars.match(/const SEAM_NEEDS[^=]*=\s*\{([\s\S]*?)\n\};/);
const needPairs = needs ? [...needs[1].matchAll(/(\w+):\s*"(\w+)"/g)].map((m) => [m[1], m[2]]) : [];
check("the seam-dependency table is readable", needPairs.length > 0,
  needPairs.map(([a, b]) => `${a}<-${b}`).join(", "));
const badNeeds = needPairs.filter(([a, b]) => !seamIds.has(a) || !seamIds.has(b));
check("every seam dependency names two real seams", badNeeds.length === 0,
  badNeeds.length ? badNeeds.map(([a, b]) => `${a}<-${b}`).join(", ") : "both sides real");

// ---- 4. no mist ---------------------------------------------------------
// The owner, twice: only thick liquid blood, never a haze. The old feedback
// emitted one cone of five-centimetre dots and called it a spray.
check("blood is a kind of its own, not a generic particle", /"blood"/.test(vfx),
  "vfx.ts names a blood kind");
check("blood arcs under gravity instead of flying like sparks", /gravity/.test(vfx),
  "a gravity term rides the particle");
check("where blood lands it stays", /\bdecals\b/.test(vfx) && /\bpools\b/.test(vfx),
  "vfx.ts counts decals and pools separately, so a stain is not a spatter");

console.log(`\n[severtest] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
