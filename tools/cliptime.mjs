#!/usr/bin/env node
// ============================================================
// CLIPTIME — the animation and the server tell the same story about a blow.
//
//   node tools/cliptime.mjs
//
// The owner: "all animations are really bad, slow uncoordinated & just wrong."
// They were, and the reason was arithmetic, not art. `attackSpeed` in
// engine.mjs is not a rate — it is the WHOLE STROKE IN SECONDS, split by
// SWING_PHASES so the blade meets the man at 0.40 of it. Every class was
// playing the same 0.80 s clip at the same 1.15 speed against strokes running
// 0.58 s to 1.33 s: a runekeeper's swing animation outlasted his entire
// stroke, and a berserker finished swinging and stood idle for six tenths of a
// second while still committed.
//
// REPOINTED 7 Sep 2026 (docs/ONE-CLIENT.md §4.3), AND IT GOT A BETTER SUBJECT.
//
// This used to hold `engine.mjs` against Unity's `Strokes.cs` and
// `ClipDriver.cs`. Unity is retired — but the property it was checking is not
// a Unity property, and the web client turns out to need it MORE than Unity
// did, because the duplication it polices actually ships:
//
//   src/game/engine.mjs   decides how long a blow takes, and resolves it
//   src/game/types.ts     holds the renderer's OWN COPY of the same numbers
//   tools/blender/clips.py  decides where in an authored clip the blade is
//
// `engine.mjs` is ESM JavaScript and `types.ts` is TypeScript, so the engine
// cannot import the renderer's copy and the renderer cannot import the
// engine's. There are two copies of `SWING_PHASES`, two of `HEAVY_SWING_SCALE`
// and two of every class's `attackSpeed`, in the same repository, and until
// today NOTHING held them together. That is precisely the "two places holding
// one fact and one of them edited" shape docs/HANDOVER.md keeps recording.
//
// A drift here is not cosmetic: the server resolves the blow at
// `attackSpeed * SWING_PHASES.windup` and the renderer swings the arm to its
// own copy of the same product. Part them and the picture argues with the
// fight — a man is hit before the sword arrives, or after it has passed.
//
// clips.py stays in scope because P2 loads those clips into this renderer.
//
// INNER-LOOP TOOL: no Unity, no Blender, no build. It reads three files.
// ============================================================
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = resolve(ROOT, "src/game/engine.mjs");
const CLIPS = resolve(ROOT, "tools/blender/clips.py");
const TYPES = resolve(ROOT, "src/game/types.ts");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

console.log("\n[cliptime] the clip lands where the server says the blow does\n");

for (const f of [ENGINE, CLIPS, TYPES]) {
  if (!existsSync(f)) { check(`${f.split("/").pop()} is present`, false, f); }
}
if (fail) { console.log(`\n[cliptime] ${pass} passed, ${fail} failed`); process.exit(1); }

const engine = readFileSync(ENGINE, "utf8");
const clips = readFileSync(CLIPS, "utf8");
const types = readFileSync(TYPES, "utf8");

// ---- 1. the stroke, per class ------------------------------------------
const engineSpeed = new Map();
for (const m of engine.matchAll(/(\w+): \{ maxHealth: \d+[^}]*?attackSpeed: ([0-9.]+)/g)) engineSpeed.set(m[1], +m[2]);
check("the engine states a stroke for every class", engineSpeed.size >= 4, [...engineSpeed].map(([k, v]) => `${k} ${v}`).join(", "));

// The RENDERER's own copy of the same table. `types.ts` is TypeScript and
// `engine.mjs` is ESM JavaScript, so neither can import the other's — which is
// exactly why this has to be checked rather than trusted.
const viewSpeed = new Map();
const statsBlock = types.slice(types.indexOf("WARRIOR_STATS"));
for (const m of statsBlock.matchAll(/(\w+):\s*\{[^}]*?attackSpeed:\s*([0-9.]+)/g)) viewSpeed.set(m[1], +m[2]);
for (const [cls, want] of engineSpeed) {
  const got = viewSpeed.get(cls);
  check(`${cls}'s stroke matches between the engine and the renderer`,
    got !== undefined && near(got, want),
    got === undefined ? "types.ts does not name him" : `engine ${want}s, renderer ${got}s`);
}
check("the renderer claims no class the engine does not have",
  [...viewSpeed.keys()].every((k) => engineSpeed.has(k)), [...viewSpeed.keys()].join(", "));

// ---- 2. the phases, on both sides of the seam --------------------------
const windup = +(engine.match(/SWING_PHASES = \{ windup: ([0-9.]+)/) ?? [])[1];
const eContact = +(engine.match(/SWING_PHASES = \{ windup: [0-9.]+, contact: ([0-9.]+)/) ?? [])[1];
const eRecovery = +(engine.match(/SWING_PHASES = \{ windup: [0-9.]+, contact: [0-9.]+, recovery: ([0-9.]+)/) ?? [])[1];
const heavyScale = +(engine.match(/HEAVY_SWING_SCALE = ([0-9.]+)/) ?? [])[1];

const vWindup = +(types.match(/SWING_PHASES = \{ windup: ([0-9.]+)/) ?? [])[1];
const vContact = +(types.match(/SWING_PHASES = \{ windup: [0-9.]+, contact: ([0-9.]+)/) ?? [])[1];
const vRecovery = +(types.match(/SWING_PHASES = \{ windup: [0-9.]+, contact: [0-9.]+, recovery: ([0-9.]+)/) ?? [])[1];
const vHeavy = +(types.match(/HEAVY_SWING_SCALE = ([0-9.]+)/) ?? [])[1];

check("the windup is the same fraction on both sides of the seam", near(windup, vWindup),
  `engine ${windup}, renderer ${vWindup}`);
check("the contact window is the same on both sides", near(eContact, vContact),
  `engine ${eContact}, renderer ${vContact}`);
check("the recovery is the same on both sides", near(eRecovery, vRecovery),
  `engine ${eRecovery}, renderer ${vRecovery}`);
check("a heavy is the same multiple of a stroke on both sides", near(heavyScale, vHeavy),
  `engine ${heavyScale}, renderer ${vHeavy}`);
// A stroke that does not account for all of itself is a stroke with a gap in
// it, and the gap is where a blow lands on nobody.
check("the three phases account for the whole stroke", near(windup + eContact + eRecovery, 1),
  `${windup} + ${eContact} + ${eRecovery} = ${(windup + eContact + eRecovery).toFixed(3)}`);

// ---- 3. where the blade is, in the clip Blender actually keyed ----------
// clip("attack", 24, [ (0, ...), (6, ...), (11, ...), ... ])
const authored = new Map();
// Tempered: a clip body may not swallow the next clip. Without this the
// looping `idle` above ran on into `attack` and took its keys with it.
// `loop=False` may now be followed by `fast=(...)` — the frames a clip must
// pass THROUGH at speed rather than settle on, which is what stopped the
// swings braking into their own contact.
for (const m of clips.matchAll(/clip\("(\w+)",\s*(\d+),\s*\[((?:(?!clip\()[\s\S])*?)\n\], loop=False(?:,\s*fast=\(([^)]*)\))?\s*\)/g)) {
  const keys = [...m[3].matchAll(/^\s*\((\d+),/gm)].map((k) => +k[1]);
  const fast = (m[4] ?? "").split(",").map((x) => parseInt(x.trim(), 10)).filter(Number.isFinite);
  authored.set(m[1], { frames: +m[2], keys, fast });
}
check("the swing clips are readable out of clips.py", authored.has("attack") && authored.has("heavy"),
  [...authored].map(([k, v]) => `${k} ${v.frames}f keys ${v.keys.join("/")}`).join("; "));

// THE CONTACT FRAME HAS TO BE A KEY, and it is the clip's OWN declaration of
// where the blade is — not a proportion assumed from the outside.
//
// This used to read Unity's `ClipDriver.cs` contact map. There is no driver now
// (P2 builds the web one), so the property is taken from the only file that
// actually knows: `clips.py` marks with `fast=(...)` the frames the motion must
// pass THROUGH at speed rather than settle on, and the FIRST of those is the
// contact — the instant the blade is travelling fastest and meets the man.
//
// A first draft of this check asserted the contact key sat at `frames * windup`
// and failed `heavy`. THE CHECK WAS WRONG, not the clip: a loader RETIMES a
// clip so that its contact lands on the server's, so the contact need not sit
// at 40% of the clip's own length — attack's is at 0.375 and heavy's at 0.444.
// Recorded because the tempting repair was to move a keyframe to satisfy a
// ruler that was measuring the wrong question.
for (const name of ["attack", "heavy"]) {
  const a = authored.get(name);
  if (!a) { check(`${name} is a clip clips.py authors`, false, "clips.py does not build it"); continue; }
  const contact = a.fast[0];
  check(`${name} declares a contact frame`, Number.isFinite(contact),
    a.fast.length ? `fast=(${a.fast.join(", ")})` : "no fast=() — the swing would brake into its own contact");
  if (!Number.isFinite(contact)) continue;
  check(`${name}'s contact frame is a real keyframe`, a.keys.includes(contact),
    a.keys.includes(contact)
      ? `frame ${contact} of ${a.frames} — ${(contact / a.frames).toFixed(3)} of the clip`
      : `fast says frame ${contact}; the keys are ${a.keys.join(", ")}`);
  // Not a proportionality assertion — a sanity band. A clip whose blade arrives
  // in the first eighth or the last quarter is not a swing whatever it is
  // retimed to, and P2's loader would be scaling it past its usable range.
  const frac = contact / a.frames;
  check(`${name}'s contact sits in the middle of the swing, retimeable to the server`,
    frac > 0.15 && frac < 0.75, `contact at ${frac.toFixed(3)} of the clip, windup is ${windup}`);
}

// ---- 4. what the player will actually see ------------------------------
//
// The renderer swings the arm on ITS copy of the numbers; the server resolves
// the blow on ITS copy. This is the whole point of the file: the two instants,
// per class, per cut, in milliseconds.
console.log("\n  the blade's arrival, per class:\n");
console.log("    class and cut              stroke   server contact   renderer contact   error");
let worst = 0;
for (const [cls, sp] of engineSpeed) {
  const view = viewSpeed.get(cls);
  if (view === undefined) continue;
  for (const name of ["attack", "heavy"]) {
    const heavy = name === "heavy";
    const serverWhole = heavy ? sp * heavyScale : sp;
    const viewWhole = heavy ? view * vHeavy : view;
    const serverAt = serverWhole * windup;
    const viewAt = viewWhole * vWindup;
    const err = viewAt - serverAt;
    worst = Math.max(worst, Math.abs(err));
    console.log(`    ${(cls + " " + name).padEnd(26)} ${serverWhole.toFixed(2)}s   ${serverAt.toFixed(3)}s`
      + `          ${viewAt.toFixed(3)}s          ${(err * 1000).toFixed(0)}ms`);
  }
}
console.log("");
// A blow that lands within a frame at 60 Hz of where the server put it reads as
// the same blow. Anything past that and the picture is arguing with the fight.
check("no blow's blade misses the server's contact by more than a frame", worst <= 0.017,
  `worst ${(worst * 1000).toFixed(0)}ms, the budget is 17ms (one frame at 60 Hz)`);

console.log(`\n[cliptime] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
