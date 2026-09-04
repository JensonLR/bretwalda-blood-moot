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
// NOT A GATE, AND HERE IS WHY. The union is not a list of states the sim can
// reach; it is the replay format's vocabulary, and `replay.mjs` index-encodes
// it — "the order IS the wire format", so a word cannot be removed without
// changing what every recorded frame means. Two of its fourteen are therefore
// permanently unreachable in the sim, and that is deliberate rather than
// broken. It is printed, loudly, because a client author who does not know it
// writes a wait that never ends — which is exactly what happened to the rite's
// last beat on 3 Sep 2026.
const ghosts = [...declared].filter((d) => !engineStates.has(d));
if (ghosts.length) {
  console.log(`  NOTE  the type union declares ${declared.size} states and the sim assigns ${engineStates.size}: ${ghosts.map((g) => `"${g}"`).join(", ")} can never arrive.`);
  console.log(`        They stay in the union because replay.mjs index-encodes that order. Never wait on one.`);
}

// A PHANTOM ALONE is the defect; a phantom BESIDE a real state is harmless.
// `state == "dodging" || state == "rolling"` fires on every dodge and would
// fire on a roll if the sim ever named one — that is future-proofing, not a
// bug. `state == "ability"` on its own is a wait that never ends. So the test
// is per-expression: a line that names a phantom must also name a state the
// sim assigns.
let csTests = 0;
const stranded = [];
for (const c of cs) {
  for (const line of c.src.split("\n")) {
    const named = [...line.matchAll(/\bstate\s*[!=]=\s*"([a-z_]+)"/g)].map((m) => m[1]);
    if (!named.length) continue;
    csTests += named.length;
    const phantoms = named.filter((n) => !playerStates.has(n) && !roomStates.has(n));
    const real = named.filter((n) => playerStates.has(n) || roomStates.has(n));
    if (phantoms.length && !real.length) stranded.push(`"${phantoms.join('", "')}" alone in ${c.name}`);
  }
}
check("no Unity branch waits on a state the sim never assigns, with nothing real beside it",
  stranded.length === 0,
  stranded.length ? stranded.join("; ") : `${csTests} state tests, none stranded`);

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
// ---- THE OTHER VOCABULARIES ----------------------------------------------
// A difficulty the engine does not know is not refused, it is NORMALISED — to
// `warrior` — so a client that asks for the wrong word gets a harder opponent
// than it asked for and no error at all. The Unity rite asked for "normal",
// which is not one of the three, and its pell fought at 0.7 against the 0.45
// its own card promises.
console.log("\n-- the words for skill --");
const diffBlock = /const DIFFICULTIES = \[([^\]]*)\]/.exec(engine);
const diffs = new Set(diffBlock ? [...diffBlock[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]) : []);
check("the engine's difficulty vocabulary is readable", diffs.size >= 3, [...diffs].join(" "));
const asked = new Set([...allCs.matchAll(/difficulty\s*=\s*"([a-z_]+)"/g)].map((m) => m[1]));
const strange = [...asked].filter((d) => !diffs.has(d));
check("every difficulty the Unity client asks for is one the engine knows",
  strange.length === 0,
  strange.length ? `${strange.map((d) => `"${d}"`).join(", ")} — normalised to "warrior" without a word of complaint` : `${asked.size} asked for, all known`);

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

// ---- the client must never discard its own messages in silence -----------
// `leave` deletes the SESSION on the server — disconnectSession, the surrender
// path, not a leave-the-room path. The socket stays open and the server no
// longer knows who is on it, so every later message goes to nobody. Send()
// returned without a word when the socket was shut, so a game that would not
// load had nothing anywhere to say why, and it cost a session to find.
{
  const wirePath = resolve(ROOT, "BRETWALDA - Blood Moot/Assets/Bretwalda/Scripts/Net/WireClient.cs");
  const src = existsSync(wirePath) ? readFileSync(wirePath, "utf8") : "";
  check("the wire is where this expects it", src.length > 0, wirePath);
  if (src) {
    const send = src.slice(src.indexOf("public void Send"));
    const guard = send.slice(0, send.indexOf("}"));
    const silent = /if\s*\(!Connected\)\s*return\s*;/.test(guard);
    check("a message the wire cannot send is reported, not swallowed", !silent,
      silent ? "Send returns on a shut socket without a word — a client that discards its own messages cannot be debugged"
             : "a dropped send names the message and the socket's state");
    const closes = /public void Close\s*\(/.test(src);
    check("the wire can be closed, because leaving requires it", closes,
      closes ? "Close() exists, so a client that leaves can come back as someone new"
             : "no Close() — after `leave` the server has deleted the session and every later send is delivered to nobody");
  }
}

console.log(`\n[unitywire] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
