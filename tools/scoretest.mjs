#!/usr/bin/env node
// SCORETEST — the forged score's musical law, held headless (backlog 7.8).
//
//   node tools/scoretest.mjs
//
// `score.ts` splits into a pure plan and a WebAudio binding on purpose: what
// the music SHOULD do is provable here in milliseconds; what it sounds like
// is judged through the engine's offline-render door and by ear. Compiled the
// same way cosmetictest compiles characters — the tool and the game must read
// one definition.
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORK = resolve(ROOT, ".scoretest");
rmSync(WORK, { recursive: true, force: true });
const tsc = spawnSync("npx", ["tsc", "src/game/client/render/score.ts",
  "--outDir", ".scoretest", "--target", "es2022", "--module", "esnext",
  "--moduleResolution", "bundler", "--skipLibCheck"], { cwd: ROOT, encoding: "utf8" });
const found = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true }))
  e.isDirectory() ? walk(resolve(d, e.name)) : e.name === "score.js" && found.push(resolve(d, e.name)); };
if (existsSync(WORK)) walk(WORK);
if (!found[0]) { console.error(`tsc emitted nothing:\n${tsc.stdout || ""}${tsc.stderr || ""}`); process.exit(1); }
const S = await import(pathToFileURL(found[0]).href);
const { scorePlan, lyrePhrase, stingNotes, MODE_RATIOS, DRUM_PATTERNS } = S;

let passed = 0, failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passed++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

console.log("[score] the forged score's law, headless\n");

// ---- scenes ----
const SCENES = ["off", "menu", "lobby", "muster", "fight", "victory", "defeat"];
check("every scene answers", SCENES.every((s) => scorePlan(s, 0.5) !== undefined));
check("off is silence", (() => { const p = scorePlan("off", 1); return p.drone === 0 && p.drum === 0 && p.lyre === 0 && p.bpm === 0; })());
check("a menu never pulses", scorePlan("menu", 1).bpm === 0, "no drum in the hall whatever the intensity");
check("the muster holds its tongue", scorePlan("muster", 1).lyre === 0, "no melody over the countdown");

// ---- intensity is monotone where it claims to be ----
{
  let ok = true;
  let last = scorePlan("fight", 0);
  for (let t = 0.1; t <= 1.001; t += 0.1) {
    const p = scorePlan("fight", t);
    if (p.drone < last.drone - 1e-9 || p.bpm < last.bpm - 1e-9 || p.drum < last.drum - 1e-9
      || p.drumRung < last.drumRung || p.lyre < last.lyre - 1e-9) ok = false;
    last = p;
  }
  check("the fight only ever leans IN with intensity", ok, "drone, tempo, drum, rung and lyre all monotone");
}
check("intensity is clamped", scorePlan("fight", 7).bpm === scorePlan("fight", 1).bpm
  && scorePlan("fight", -3).bpm === scorePlan("fight", 0).bpm);

// ---- the drum patterns ----
check("four rungs of one grammar", DRUM_PATTERNS.length === 4 && DRUM_PATTERNS.every((p) => p.length === 8));
check("every rung opens on the downbeat", DRUM_PATTERNS.every((p) => p[0] === 1));
{
  // Each rung contains the last: intensity reads as the same drummer leaning in.
  let ok = true;
  for (let r = 1; r < DRUM_PATTERNS.length; r++) {
    for (let i = 0; i < 8; i++) if (DRUM_PATTERNS[r][i] < DRUM_PATTERNS[r - 1][i]) ok = false;
  }
  check("each rung adds strokes, never trades them", ok);
}

// ---- the mode ----
check("the mode is pentatonic and anchored on the root",
  MODE_RATIOS.length === 5 && MODE_RATIOS[0] === 1 && MODE_RATIOS.every((r, i) => i === 0 || r > MODE_RATIOS[i - 1]));
{
  // Every note of 200 seeded phrases lives inside the mode (two octaves up).
  let ok = true, resolves = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const notes = lyrePhrase(seed);
    if (notes.length < 3 || notes.length > 5) ok = false;
    for (const n of notes) if (!MODE_RATIOS.some((r) => Math.abs(n - r * 4) < 1e-9)) ok = false;
    const end = notes[notes.length - 1];
    if (Math.abs(end - 4) < 1e-9 || Math.abs(end - MODE_RATIOS[3] * 4) < 1e-9) resolves++;
  }
  check("every phrase stays in the mode", ok, "200 seeds, 3-5 notes, all on the pentatonic");
  check("every phrase resolves to the root or the fifth", resolves === 200);
}

// ---- the stings ----
{
  const rise = stingNotes("rise"), fall = stingNotes("fall");
  const ascending = rise.every((n, i) => i === 0 || n.ratio > rise[i - 1].ratio);
  const descending = fall.every((n, i) => i === 0 || n.ratio < fall[i - 1].ratio);
  check("victory rises", ascending && rise[rise.length - 1].ratio === 4, "ends the octave above");
  check("defeat falls", descending, "down into the drone");
  check("stings are scheduled forward in time",
    rise.every((n, i) => i === 0 || n.at > rise[i - 1].at) && fall.every((n, i) => i === 0 || n.at > fall[i - 1].at));
  check("victory stings only from victory; defeat only from defeat",
    scorePlan("victory", 0).sting === "rise" && scorePlan("defeat", 0).sting === "fall"
    && SCENES.filter((s) => scorePlan(s, 1).sting !== "none").length === 2);
}

console.log(`\n[score] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
