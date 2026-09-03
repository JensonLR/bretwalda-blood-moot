#!/usr/bin/env node
// ============================================================
// UNITYWIRE — the Unity client's conformance to the wire, checked here.
//
//   node tools/unitywire.mjs          (or: npm run unitywire)
//
// The Unity client cannot be run from this seat: the owner's editor holds the
// project lock and is the only Play there is. `tools/unitycheck.sh` proves the
// C# COMPILES; nothing proved it agreed with the server. On 3 Sep 2026 two
// defects of exactly that shape were found by hand, and both would have been
// caught by reading the two sides against each other:
//
//   * `HitFeedback.cs` branched on a hit type of `"block"`. The engine sends
//     `blocked` and `blocked_heavy` and has never sent `block`, so a turned
//     blow played the flesh sound, flashed the wrong colour, and sprayed
//     blood through a raised shield.
//   * `FirstMoot.cs` waited on `state == "ability"` for its last beat. The
//     engine assigns fourteen states and that is not one of them, so the
//     rite's final beat could never land and the teaching never finished.
//
// Neither is a compile error. Both are a string in one repository that the
// other repository never says. This file reads the ENGINE for the vocabulary
// it actually emits, reads the Unity C# for the vocabulary it tests against,
// and fails on any word Unity waits for that the server will never send.
//
// It is deliberately one-directional. A server word Unity ignores is not a
// defect — the Unity client is younger than the protocol and does not have to
// answer everything yet. A UNITY word the server never sends is always a
// defect: it is a branch that can never be taken.
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UNITY = resolve(ROOT, "BRETWALDA - Blood Moot/Assets/Bretwalda/Scripts");
let pass = 0, fail = 0;
const check = (claim, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${claim}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${claim}${detail ? ` — ${detail}` : ""}`); }
};

if (!existsSync(UNITY)) {
  console.log("[unitywire] no Unity client checked out here — nothing to read");
  process.exit(0);
}

const engine = readFileSync(resolve(ROOT, "src/game/engine.mjs"), "utf8");
const audio = readFileSync(resolve(ROOT, "src/game/client/render/audio.ts"), "utf8");
const doc = readFileSync(resolve(ROOT, "docs/WIRE-PROTOCOL.md"), "utf8");

const cs = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const f = join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (e.name.endsWith(".cs")) cs.push({ name: e.name, src: readFileSync(f, "utf8") });
  }
};
walk(UNITY);
const allCs = cs.map((c) => c.src).join("\n");

// ---------- 1. PLAYER STATE ----------------------------------------------
// Every `state == "..."` in the Unity client must be a state the engine assigns.
console.log("\n-- the states a man can be in --");
// THE STATES A MAN CAN ACTUALLY BE IN, which is not the same list as the one
// `types.ts` declares. The union names fourteen; the sim assigns twelve.
// `"ability"` and `"rolling"` are declared and never written — the engine only
// ever CLEARS `"ability"` defensively — so a client that waits on either waits
// forever. That is not a hypothetical: the Unity rite's last beat waited on
// `"ability"` and could never finish. What a man's power actually shows as is
// `abilityActive`, a published field of its own.
const assigned = new Set();
for (const m of engine.matchAll(/\bplayer\.state\s*=(?!=)\s*([^;]+);/g)) {
  for (const lit of m[1].matchAll(/"([a-z_]+)"/g)) assigned.add(lit[1]);
}
for (const m of engine.matchAll(/\b(?:p|target|attacker|bot|other)\.state\s*=(?!=)\s*"([a-z_]+)"/g)) assigned.add(m[1]);
for (const m of engine.matchAll(/^\s*state:\s*"([a-z_]+)"/gm)) assigned.add(m[1]);
const engineStates = assigned;

const union = readFileSync(resolve(ROOT, "src/game/types.ts"), "utf8");
const unionLine = /export type PlayerState\s*=\s*([^;]+);/.exec(union);
const declared = new Set(unionLine ? [...unionLine[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]) : []);

// `state` is also the ROOM's word; a client tests the player's own set.
const roomStates = new Set(["lobby", "loading", "countdown", "fighting", "last_stand", "intermission", "finished"]);
const playerStates = new Set([...engineStates].filter((s) => !roomStates.has(s)));

check("the engine assigns a readable set of player states", playerStates.size >= 10, [...playerStates].sort().join(" "));
const ghosts = [...declared].filter((d) => !engineStates.has(d));
check("every state the type union declares is one the sim can actually put a man in",
  ghosts.length === 0,
  ghosts.length ? `${ghosts.map((g) => `"${g}"`).join(", ")} declared but never assigned — a client waiting on ${ghosts.length === 1 ? "it waits" : "them waits"} forever` : `${declared.size} declared, all reachable`);

const csStateTests = new Set();
for (const c of cs) {
  for (const m of c.src.matchAll(/\bstate\s*[!=]=\s*"([a-z_]+)"/g)) csStateTests.add(`${m[1]}|${c.name}`);
}
const badStates = [...csStateTests].filter((k) => {
  const [s] = k.split("|");
  return !playerStates.has(s) && !roomStates.has(s);
});
check("every player state the Unity client waits on is one the engine assigns",
  badStates.length === 0,
  badStates.length ? badStates.map((k) => { const [s, f] = k.split("|"); return `"${s}" in ${f}`; }).join(", ") : `${csStateTests.size} tests, all sound`);

// ---------- 2. HIT TYPES --------------------------------------------------
console.log("\n-- the kinds of blow --");
const hitBlock = /WIRE_HIT_TYPES\s*=\s*\[([\s\S]*?)\]/.exec(audio);
const hitTypes = new Set(hitBlock ? [...hitBlock[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]) : []);
check("the wire's hit vocabulary is readable from audio.ts", hitTypes.size >= 7, [...hitTypes].join(" "));

const feedback = cs.find((c) => c.name === "HitFeedback.cs");
const csHitTests = feedback
  ? new Set([...feedback.src.matchAll(/\bkind\s*[!=]=\s*"([a-z_]+)"/g)].map((m) => m[1]))
  : new Set();
const badHits = [...csHitTests].filter((h) => !hitTypes.has(h));
check("every hit kind HitFeedback branches on is one the engine sends",
  badHits.length === 0,
  badHits.length ? `${badHits.map((h) => `"${h}"`).join(", ")} — the engine never sends ${badHits.length === 1 ? "it" : "them"}` : `${csHitTests.size} branches, all sound`);

// A blocked blow is the one every client gets wrong, because the word is not
// the one a reader expects. Name it explicitly so the next port cannot miss it.
check("the turned blow is `blocked`/`blocked_heavy`, never `block`",
  hitTypes.has("blocked") && !hitTypes.has("block"), [...hitTypes].filter((h) => h.startsWith("block")).join(" "));

// ---------- 3. CLIENT MESSAGES -------------------------------------------
console.log("\n-- what the Unity client says to the server --");
const docBlock = /```protocol\n([\s\S]*?)```/.exec(doc);
const docC2S = new Set(docBlock ? [...docBlock[1].matchAll(/^C2S\s+(\w+)/gm)].map((m) => m[1]) : []);
check("the wire document's machine block lists the client's messages", docC2S.size >= 10, `${docC2S.size} listed`);

const sent = new Set([...allCs.matchAll(/\bSend\(\s*"(\w+)"/g)].map((m) => m[1]));
const undocumented = [...sent].filter((t) => !docC2S.has(t));
check("every message the Unity client sends is one the protocol documents",
  undocumented.length === 0,
  undocumented.length ? undocumented.join(", ") : `${sent.size} kinds, all documented`);

const routed = new Set([...engine.matchAll(/case\s+"(\w+)":/g)].map((m) => m[1]));
const unrouted = [...sent].filter((t) => !routed.has(t));
check("...and one the engine's router actually answers",
  unrouted.length === 0,
  unrouted.length ? unrouted.join(", ") : `${sent.size} kinds, all routed`);

// ---------- 4. SNAPSHOT FIELDS -------------------------------------------
console.log("\n-- the fields a snapshot carries --");
const pw = /class PlayerW\b[\s\S]*?\n    \}/.exec(cs.find((c) => c.name === "Wire.cs")?.src ?? "");
const pwFields = new Set(pw ? [...pw[0].matchAll(/public\s+[\w<>.]+\s+(\w+)\s*;/g)].map((m) => m[1]) : []);
check("the Unity player model is readable", pwFields.size >= 15, `${pwFields.size} fields`);

// Anything the Unity client reads off a player must be a field it declares —
// C# would catch that. What C# CANNOT catch is a field declared here that the
// server never publishes: it silently stays at its default forever.
const published = new Set([...doc.matchAll(/`(\w+)`/g)].map((m) => m[1]));
const phantom = [...pwFields].filter((f) => !published.has(f) && !engine.includes(`${f}:`) && !engine.includes(`.${f}`));
check("no field in the Unity player model is one the server never publishes",
  phantom.length === 0,
  phantom.length ? phantom.join(", ") : `${pwFields.size} fields, all published`);

console.log(`\n[unitywire] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
