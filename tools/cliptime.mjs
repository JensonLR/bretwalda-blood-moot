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
// Three files have to agree and none of them can see the others:
//   engine.mjs      decides how long a blow takes
//   clips.py        decides where in the clip the blade is
//   ClipDriver.cs   has to make the second land on the first
//
// INNER-LOOP TOOL: no Unity, no Blender, no build. It reads three files.
// ============================================================
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = resolve(ROOT, "src/game/engine.mjs");
const CLIPS = resolve(ROOT, "tools/blender/clips.py");
const UNITY = resolve(ROOT, "BRETWALDA - Blood Moot/Assets/Bretwalda/Scripts/Game");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
};
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

console.log("\n[cliptime] the clip lands where the server says the blow does\n");

for (const f of [ENGINE, CLIPS, resolve(UNITY, "Strokes.cs"), resolve(UNITY, "ClipDriver.cs")]) {
  if (!existsSync(f)) { check(`${f.split("/").pop()} is present`, false, f); }
}
if (fail) { console.log(`\n[cliptime] ${pass} passed, ${fail} failed`); process.exit(1); }

const engine = readFileSync(ENGINE, "utf8");
const clips = readFileSync(CLIPS, "utf8");
const strokes = readFileSync(resolve(UNITY, "Strokes.cs"), "utf8");
const driver = readFileSync(resolve(UNITY, "ClipDriver.cs"), "utf8");

// ---- 1. the stroke, per class ------------------------------------------
const engineSpeed = new Map();
for (const m of engine.matchAll(/(\w+): \{ maxHealth: \d+[^}]*?attackSpeed: ([0-9.]+)/g)) engineSpeed.set(m[1], +m[2]);
check("the engine states a stroke for every class", engineSpeed.size >= 4, [...engineSpeed].map(([k, v]) => `${k} ${v}`).join(", "));

const unitySpeed = new Map();
for (const m of strokes.matchAll(/\["(\w+)"\] = ([0-9.]+)f/g)) unitySpeed.set(m[1], +m[2]);
for (const [cls, want] of engineSpeed) {
  const got = unitySpeed.get(cls);
  check(`${cls}'s stroke matches the engine`, got !== undefined && near(got, want),
    got === undefined ? "Strokes.cs does not name him" : `engine ${want}s, Unity ${got}s`);
}
check("Unity claims no class the engine does not have", [...unitySpeed.keys()].every((k) => engineSpeed.has(k)),
  [...unitySpeed.keys()].join(", "));

// ---- 2. the phases -----------------------------------------------------
const windup = +(engine.match(/SWING_PHASES = \{ windup: ([0-9.]+)/) ?? [])[1];
const heavyScale = +(engine.match(/HEAVY_SWING_SCALE = ([0-9.]+)/) ?? [])[1];
const uContact = +(strokes.match(/public const float Contact = ([0-9.]+)f/) ?? [])[1];
const uHeavy = +(strokes.match(/public const float HeavyScale = ([0-9.]+)f/) ?? [])[1];
check("contact opens at the same fraction on both sides", near(windup, uContact), `engine ${windup}, Unity ${uContact}`);
check("a heavy is the same multiple of a stroke on both sides", near(heavyScale, uHeavy), `engine ${heavyScale}, Unity ${uHeavy}`);

// ---- 3. where the blade is, in the clip Blender actually keyed ----------
// clip("attack", 24, [ (0, ...), (6, ...), (11, ...), ... ])
const authored = new Map();
// Tempered: a clip body may not swallow the next clip. Without this the
// looping `idle` above ran on into `attack` and took its keys with it.
// `loop=False` may now be followed by `fast=(...)` — the frames a clip must
// pass THROUGH at speed rather than settle on, which is what stopped the
// swings braking into their own contact.
for (const m of clips.matchAll(/clip\("(\w+)",\s*(\d+),\s*\[((?:(?!clip\()[\s\S])*?)\n\], loop=False[^)]*\)/g)) {
  const keys = [...m[3].matchAll(/^\s*\((\d+),/gm)].map((k) => +k[1]);
  authored.set(m[1], { frames: +m[2], keys });
}
check("the swing clips are readable out of clips.py", authored.has("attack") && authored.has("heavy"),
  [...authored].map(([k, v]) => `${k} ${v.frames}f keys ${v.keys.join("/")}`).join("; "));

const driverContact = new Map();
for (const m of driver.matchAll(/\["(\w+)"\] = ([0-9]+)f \/ ([0-9]+)f/g)) driverContact.set(m[1], { num: +m[2], den: +m[3] });
for (const [name, { num, den }] of driverContact) {
  const a = authored.get(name);
  if (!a) { check(`${name} is a clip clips.py authors`, false, "the driver names a clip Blender does not build"); continue; }
  check(`${name}'s length matches what Blender keyed`, den === a.frames, `driver ${den} frames, clips.py ${a.frames}`);
  check(`${name}'s contact frame is a real keyframe`, a.keys.includes(num),
    a.keys.includes(num) ? `frame ${num} of ${a.frames}` : `driver says frame ${num}; the keys are ${a.keys.join(", ")}`);
}

// ---- 4. what the player will actually see ------------------------------
// The driver scales the clip so its own contact lands on the engine's.
console.log("\n  the blade's arrival, per class, after scaling:\n");
console.log("    class and cut              stroke   engine contact   clip speed   error");
let worst = 0;
for (const [cls, sp] of engineSpeed) {
  // Every cut the driver knows, not the two this used to assume: the engine
  // resolves four horizontals and verticals plus the heavy, and each has to
  // land on the same instant as the others.
  for (const name of [...driverContact.keys()]) {
    const heavy = name === "heavy";
    const a = authored.get(name), d = driverContact.get(name);
    if (!a || !d) continue;
    const len = a.frames / 30;                       // clips.py sets FPS = 30
    const whole = heavy ? sp * heavyScale : sp;
    const frac = d.num / d.den;
    const speed = Math.min(2.6, Math.max(0.4, len * frac / (whole * windup)));
    const landsAt = (len * frac) / speed;
    const err = landsAt - whole * windup;
    worst = Math.max(worst, Math.abs(err));
    console.log(`    ${(cls + " " + name).padEnd(26)} ${whole.toFixed(2)}s   ${(whole * windup).toFixed(3)}s`
      + `        ${speed.toFixed(2)}x     ${(err * 1000).toFixed(0)}ms`);
  }
}
console.log("");
// A blow that lands within a frame at 60 Hz of where the server put it reads as
// the same blow. Anything past that and the picture is arguing with the fight.
check("no blow's blade misses the server's contact by more than a frame", worst <= 0.017,
  `worst ${(worst * 1000).toFixed(0)}ms, the budget is 17ms (one frame at 60 Hz)`);

console.log(`\n[cliptime] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
