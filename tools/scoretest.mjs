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
const { scorePlan, lyrePhrase, stingNotes, MODE_RATIOS, DRUM_PATTERNS,
        ROOT_HZ, RENDER_QUANTUM, LYRE_FEEDBACK, LYRE_DAMP_Q } = S;

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

// ---- THE LYRE STRING MUST DECAY, AND NOTHING HERE COULD SEE THAT IT DID NOT ----
//
// This file was 16/16 green while the lyre was a hard-clipped square wave in
// every match, because every claim above is about the PLAN and the defect was
// in the BINDING. `docs/GATES.md`: a gate green because the case is absent is
// not a gate. The two claims below are the binding's, and they are still pure
// arithmetic — no browser, no render — because both are properties of numbers
// `score.ts` exports.
//
// The owner heard it before any instrument did: "an awful sound playing
// randomly during matches ... sounds like an industrial beeping".
{
  // Web Audio's BiquadFilter, verbatim from the spec's own lowpass coefficients.
  // The one that matters: for `lowpass` and `highpass` the Q parameter is read
  // in DECIBELS, so the default of 1 is +1 dB of RESONANCE and not a flat
  // response. That single unstated default is what made the loop an oscillator.
  const lowpassPeak = (fc, qDb, sampleRate) => {
    const qLin = Math.pow(10, qDb / 20);
    const w0 = (2 * Math.PI * fc) / sampleRate;
    const cw = Math.cos(w0), alpha = Math.sin(w0) / (2 * qLin);
    const b0 = (1 - cw) / 2, b1 = 1 - cw, b2 = (1 - cw) / 2;
    const a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
    let peak = 0;
    for (let i = 0; i <= 4000; i++) {
      const w = (Math.PI * i) / 4000;
      const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
      const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2);
      const dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
      peak = Math.max(peak, Math.hypot(nr, ni) / Math.hypot(dr, di));
    }
    return peak;
  };

  // Every note the game can pluck: the mode, both speaker paths, both stings.
  const RATIOS = [...new Set([...MODE_RATIOS, ...stingNotes("rise").map((n) => n.ratio),
                              ...stingNotes("fall").map((n) => n.ratio)])];
  const RATES = [44100, 48000];
  let worstGain = 0, worstAt = "";
  for (const small of [false, true]) for (const ratio of RATIOS) for (const sr of RATES) {
    const f = ROOT_HZ * (small ? 2 : 1) * ratio;
    const g = LYRE_FEEDBACK * lowpassPeak(Math.min(6500, f * 6), LYRE_DAMP_Q, sr);
    if (g > worstGain) { worstGain = g; worstAt = `${f.toFixed(1)} Hz @ ${sr}`; }
  }
  check("the lyre's feedback loop decays", worstGain < 1,
    `worst loop gain ${worstGain.toFixed(4)} (${worstAt}) — feedback ${LYRE_FEEDBACK} x the damping filter's own peak`);
  // Margin, separately: a loop gain of 0.999 is stable and still rings for
  // minutes, which is a defect of its own kind.
  check("and decays with margin", worstGain < 0.98, `worst ${worstGain.toFixed(4)}, bar 0.98`);

  // A DelayNode inside a cycle is clamped to at least one render quantum, so a
  // delay written shorter than that is silently a DIFFERENT NOTE. Every note
  // above about 375 Hz was one, which is the whole small-speaker range.
  let worstDelay = Infinity, delayAt = "", offPitch = 0;
  for (const small of [false, true]) for (const ratio of RATIOS) for (const sr of RATES) {
    const f = ROOT_HZ * (small ? 2 : 1) * ratio, period = 1 / f;
    const quantum = RENDER_QUANTUM / sr;
    const chosen = Math.ceil((quantum + 1e-6) / period) * period;
    if (chosen < quantum) offPitch++;
    const slack = chosen / quantum;
    if (slack < worstDelay) { worstDelay = slack; delayAt = `${f.toFixed(1)} Hz @ ${sr}`; }
    // and the delay must still be a whole number of periods, or f is not a
    // resonance of the comb and the note is not the note.
    if (Math.abs(chosen / period - Math.round(chosen / period)) > 1e-9) offPitch++;
  }
  check("every lyre note clears a render quantum", offPitch === 0 && worstDelay >= 1,
    `tightest ${worstDelay.toFixed(2)}x the quantum (${delayAt}), on every note of the mode and both stings, at 44.1k and 48k`);
}

console.log(`\n[score] ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
