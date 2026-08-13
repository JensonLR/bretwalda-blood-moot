#!/usr/bin/env node
// ============================================================
// SOUNDTEST — grades audio you cannot listen to.
//
//   npm run soundtest
//
// Sibling of playtest / touchtest / firetest / profiletest: same shape, same
// discipline — measured, not asserted. The problem this file exists to solve is
// stated in docs/SOUND.md: nobody in the loop can hear the game, so "it sounds
// right" is unfalsifiable. The answer is also in there — `OfflineAudioContext`
// renders deterministically and far faster than real time, so the actual
// samples can be asserted on.
//
// It runs in two phases.
//
//   1. CALIBRATION. Renders reference signals of known truth through the real
//      Chromium Web Audio implementation and checks that every instrument in
//      this file reports that truth: peak, envelope length, spectral centroid,
//      concurrent-voice count, silence. A measuring tool that has never been
//      measured is an opinion. This phase runs today and needs no game code.
//
//   2. AUDIT. Loads the game's audio module into the same page and puts the
//      five claims of docs/SOUND.md to it. Sources are transpiled off disk and
//      served through a route intercept, so the module is tested in isolation
//      and NOTHING in src/ has to be edited to make it reachable. This file
//      never fixes a bug it finds — it reports it, so it stays an independent
//      check rather than a mirror of the code.
//
// THE CONTRACT the audit binds to (docs/SOUND.md; names are probed, and the
// one that bound is printed):
//
//   import { createAudioBus } from "@/game/client/audio";
//   const bus = createAudioBus(ctx, { tier: "low" | "medium" | "high" });
//   await bus.unlock();          // arms it. Before this, nothing sounds.
//   bus.emit({ type, hitType, hitZone, weapon, position, at });
//   bus.voices();                // live voice count
//   bus.budget();                // voice cap for the tier
//
// The load-bearing requirement in that contract is that the bus takes its
// context as an ARGUMENT rather than reaching for a module-scope singleton. A
// module that can only ever build its own `AudioContext` cannot be rendered
// offline, and therefore cannot be graded by anything, ever.
//
// Exit codes: 0 all proven, 1 a claim failed, 2 the audio module is not there
// yet (PENDING — loud, and never counted as green).
// ============================================================
import { chromium } from "playwright";
import { existsSync, readFileSync } from "fs";
import { resolve, dirname, join, isAbsolute } from "path";
import { fileURLToPath } from "url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://soundtest.local";
const SR = 44100;

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const note = (s) => console.log(`        ${s}`);

// ------------------------------------------------------------------
// The instruments. Everything below takes a Float32-ish array of the
// rendered mix and returns a number; phase 1 proves each one.
// ------------------------------------------------------------------

const peak = (x) => { let m = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; } return m; };

/**
 * Sounding length in milliseconds: first to last sample that is audibly above
 * the noise floor. The floor is relative to the event's own peak (-45 dB) but
 * never below -80 dBFS absolute, so a quiet event is not measured against
 * silence and a loud one is not padded out by its own dither tail.
 *
 * This is the instrument that catches "a click that rings for two seconds".
 */
function envelopeMs(x, sampleRate = SR) {
  const pk = peak(x);
  if (pk === 0) return 0;
  const floor = Math.max(pk * Math.pow(10, -45 / 20), 1e-4);
  let first = -1, last = -1;
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i]) >= floor) { if (first < 0) first = i; last = i; }
  }
  return first < 0 ? 0 : ((last - first + 1) / sampleRate) * 1000;
}

/** Iterative radix-2 FFT, in place, on real input padded to a power of two. */
function fftMag(x) {
  let n = 1;
  while (n < x.length) n *= 2;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < x.length; i++) {
    // Hann window: without it the frame edges leak broadband energy into the
    // spectrum and every event measures brighter than it is.
    re[i] = x[i] * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (x.length - 1 || 1)));
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  const half = n / 2;
  const mag = new Float64Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i]);
  return { mag, n };
}

/**
 * Spectral centroid in Hz — the "brightness" of an event, and the number that
 * decides whether a shield block and a flesh hit are actually different sounds
 * or the same noise burst wearing two names. Measured over the loudest 4096
 * samples, because the tail of anything is darker than its transient.
 */
function centroidHz(x, sampleRate = SR) {
  if (peak(x) === 0) return 0;
  let at = 0, best = 0;
  const win = Math.min(4096, x.length);
  for (let i = 0; i + win <= x.length; i += win >> 2) {
    let e = 0;
    for (let k = i; k < i + win; k++) e += x[k] * x[k];
    if (e > best) { best = e; at = i; }
  }
  const frame = Array.prototype.slice.call(x, at, at + win);
  const { mag, n } = fftMag(frame);
  let num = 0, den = 0;
  for (let i = 1; i < mag.length; i++) { const f = (i * sampleRate) / n; num += f * mag[i]; den += mag[i]; }
  return den === 0 ? 0 : num / den;
}

// ------------------------------------------------------------------
// The instruments phase 3 needed and this file did not have.
//
// Peak, envelope length and centroid grade one sound at a time. They cannot see
// the property the owner is actually buying — "the player should know without
// looking whether he was blocked, parried, or opened up" — because that is a
// property of a PAIR. Two sounds a player cannot tell apart are one sound, and
// nothing in this file could say whether any two of them were the same.
// ------------------------------------------------------------------

/**
 * Rectified amplitude envelope: instant attack, one-pole release. Everything
 * temporal below is measured on this rather than on the raw samples, because a
 * noise burst's raw peak lands on a random sample and every reading taken off it
 * is a dice roll — the same fault that made the UI mallet unmeasurable.
 */
function smoothEnv(x, tauMs = 2.0, sampleRate = SR) {
  const a = Math.exp(-1 / ((tauMs / 1000) * sampleRate));
  const out = new Float64Array(x.length);
  let e = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    e = v > e ? v : a * e + (1 - a) * v;
    out[i] = e;
  }
  return out;
}

/** First and last sample above -60 dB of peak. Everything is measured inside it. */
function sounding(x) {
  const pk = peak(x);
  if (pk === 0) return [0, 0];
  const floor = Math.max(pk * 1e-3, 1e-5);
  let a = -1, b = -1;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= floor) { if (a < 0) a = i; b = i; }
  return a < 0 ? [0, 0] : [a, b + 1];
}

function rms(x) {
  if (!x.length) return 0;
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / x.length);
}

/**
 * Attack: onset (-34 dB of the envelope peak) to the envelope peak, in ms.
 * This is "a transient with real attack" made falsifiable — a hammer and a shove
 * differ here by an order of magnitude and by almost nothing else.
 */
function attackMs(env, sampleRate = SR) {
  let pk = 0, at = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > pk) { pk = env[i]; at = i; }
  if (pk === 0) return 0;
  const onset = pk * 0.02;
  let start = at;
  for (let i = 0; i <= at; i++) if (env[i] >= onset) { start = i; break; }
  return Math.max(((at - start) / sampleRate) * 1000, 0.05);
}

/** Peak to -30 dB, in ms. The half of "weight" that is not level. */
function decayMs(env, sampleRate = SR) {
  let pk = 0, at = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > pk) { pk = env[i]; at = i; }
  if (pk === 0) return 0;
  const floor = pk * 0.0316;
  for (let i = at; i < env.length; i++) if (env[i] <= floor) return Math.max(((i - at) / sampleRate) * 1000, 0.05);
  return Math.max(((env.length - at) / sampleRate) * 1000, 0.05);
}

/**
 * Spectral flatness, 0..1 — geometric over arithmetic mean of the magnitude
 * spectrum. Noise is flat, a ring is not, and it is the axis that separates the
 * mail's rustle of turned rings from the parry's ring even when both are bright.
 */
function flatness(x) {
  if (peak(x) === 0) return 0;
  let at = 0, best = 0;
  const win = Math.min(4096, x.length);
  for (let i = 0; i + win <= x.length; i += win >> 2) {
    let e = 0;
    for (let k = i; k < i + win; k++) e += x[k] * x[k];
    if (e > best) { best = e; at = i; }
  }
  const { mag } = fftMag(Array.prototype.slice.call(x, at, at + win));
  let logSum = 0, sum = 0, n = 0;
  for (let i = 1; i < mag.length; i++) { const m = mag[i] + 1e-12; logSum += Math.log(m); sum += m; n++; }
  return n === 0 ? 0 : Math.exp(logSum / n) / (sum / n);
}

/** Fraction of the whole event's spectral energy inside [lo, hi) Hz. */
function bandShare(x, lo, hi, sampleRate = SR) {
  const [a, b] = sounding(x);
  if (b <= a) return 0;
  const { mag, n } = fftMag(Array.prototype.slice.call(x, a, b));
  let inBand = 0, total = 0;
  for (let i = 1; i < mag.length; i++) {
    const f = (i * sampleRate) / n;
    const e = mag[i] * mag[i];
    total += e;
    if (f >= lo && f < hi) inBand += e;
  }
  return total === 0 ? 0 : inBand / total;
}

/**
 * Beating, 0..1 — the modulation INDEX of the event's tail in the 4-18 Hz band.
 * Two partials a few Hz apart shimmer; a decay does not. Nothing in this game
 * beats except the parry, which is what makes it an unmistakable signature
 * rather than just another bright sound.
 *
 * Two things were wrong with the first version of this meter and both were
 * caught by calibrating it, which is the entire reason phase 1 exists:
 *
 *  1. It read a SMOOTH 3 kHz decay as 0.44 of a shimmer. The envelope came from
 *     a 2 ms peak follower, which ripples at the carrier frequency, and
 *     decimating that to ~1002 Hz aliased 3000 Hz down to 6.8 Hz — directly into
 *     the band being searched. It was measuring its own decimator. Block RMS at
 *     1 ms replaces the peak follower: RMS over three cycles of the carrier has
 *     no carrier ripple to alias.
 *  2. It used a NORMALISED autocorrelation, which is amplitude-blind: a 0.5%
 *     ripple that happens to be periodic scores the same as a 50% one. What the
 *     ear cares about is DEPTH. So the detrended envelope is bandpassed to
 *     4-18 Hz and its RMS read as a modulation index — 1.41 x RMS recovers the
 *     index of a sinusoidal AM exactly.
 */
function tremolo(samples, sampleRate = SR) {
  const [lo, hi] = sounding(samples);
  if (hi <= lo) return 0;
  const step = Math.round(sampleRate / 1000);
  const e = [];
  for (let i = lo; i + step <= hi; i += step) {
    let s = 0;
    for (let k = i; k < i + step; k++) s += samples[k] * samples[k];
    e.push(Math.sqrt(s / step));
  }
  if (e.length < 96) return 0;
  // Start at the envelope peak: the attack is not a shimmer. Stop where the
  // tail drops 25 dB, because a ripple down in the noise floor is not something
  // anybody hears — a 48 ms footfall was reading 0.23, MORE shimmer than the
  // parry, entirely out of the silence after it had finished.
  let pk = 0, at = 0;
  for (let i = 0; i < e.length; i++) if (e[i] > pk) { pk = e[i]; at = i; }
  const floor = pk * 0.0562;
  let end = at;
  while (end < e.length && end < at + 500 && e[end] > floor) end++;
  const tail = e.slice(at, end);
  if (tail.length < 96) return 0;
  // Divide out the decay with a 60 ms one-pole of the envelope itself; what is
  // left is the ripple ON the decay, expressed as a fraction of it.
  const a = Math.exp(-1 / 60);
  let s = tail[0];
  const d = new Float64Array(tail.length);
  for (let i = 0; i < tail.length; i++) { s = a * s + (1 - a) * tail[i]; d[i] = tail[i] / Math.max(s, 1e-9) - 1; }
  let bp = biquad(d, "highpass", 4, 0.707, 1000);
  bp = biquad(bp, "lowpass", 18, 0.707, 1000);
  // Skip the filters' own settling, which is ~2 cycles at 4 Hz.
  const settled = bp.slice(Math.min(120, bp.length - 1));
  return Math.max(0, Math.min(1, 1.41 * rms(settled)));
}

/**
 * One biquad, RBJ cookbook, direct form I. Used only by the small-speaker model,
 * which is calibrated in phase 1 like every other instrument here.
 */
function biquad(x, type, fc, q, sampleRate = SR) {
  const w = (2 * Math.PI * fc) / sampleRate, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === "highpass") {
    b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
  } else {
    b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
  }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o;
  }
  return y;
}

/**
 * A PHONE SPEAKER. A micro-speaker in a phone is a few millimetres of cone in a
 * sealed sliver of air: it is flat enough from ~700 Hz to ~8 kHz and it falls
 * off a cliff below that. The shape targeted here, and confirmed by the phase-1
 * calibration, is about -6 dB at 400 Hz, -20 dB at 200 Hz and -50 dB at 80 Hz.
 *
 * The first attempt was two cascaded 520 Hz sections and it read -33 dB at
 * 200 Hz: a 24 dB/octave wall, which is steeper than any real driver and would
 * have condemned sounds a phone can in fact reproduce. Two staggered sections
 * give the knee an actual shape.
 *
 * It is a MODEL and it is named as one: it says what a small speaker cannot
 * reproduce. It does not say what an iPhone sounds like, and nothing that runs
 * in this container ever will — see docs/MOBILE-AUDIO.md, which exists because
 * that exact conflation shipped once already.
 */
function phoneSpeaker(x) {
  let y = biquad(x, "highpass", 500, 0.707);
  y = biquad(y, "highpass", 250, 0.707);
  y = biquad(y, "lowpass", 12000, 0.707);
  return y;
}

const dB = (v) => 20 * Math.log10(Math.max(v, 1e-12));

/**
 * THE PERCEPTUAL AXES, and the one that is deliberately absent.
 *
 * Each axis carries the size of ONE just-noticeable step on it. A ratio axis is
 * measured in factors, an absolute axis in units of the quantity.
 *
 * **LEVEL IS NOT AN AXIS HERE, AND THAT IS THE WHOLE POINT.** Level already
 * means something else in this game: the mixer spends it on DISTANCE, so a
 * sound that is only louder is not a different sound, it is the same sound
 * closer. "A heavy blow is not a loud light blow" is the owner's requirement and
 * it is unfalsifiable until level stops counting as a difference. Any pair that
 * separates here separates on timbre or on time.
 */
const AXES = [
  { key: "centroid", ratio: true, jnd: 1.25, label: "brightness" },
  { key: "flatness", ratio: false, jnd: 0.12, label: "noisy/tonal" },
  { key: "attack", ratio: true, jnd: 2.2, label: "attack" },
  { key: "decay", ratio: true, jnd: 1.8, label: "decay" },
  { key: "low", ratio: false, jnd: 0.14, label: "body <400 Hz" },
  { key: "high", ratio: false, jnd: 0.12, label: "ring >3 kHz" },
  { key: "beat", ratio: false, jnd: 0.18, label: "shimmer" },
];

function features(samples) {
  const [a, b] = sounding(samples);
  const body = Array.prototype.slice.call(samples, a, b);
  const env = smoothEnv(body);
  return {
    centroid: Math.max(centroidHz(body), 1),
    flatness: flatness(body),
    attack: attackMs(env),
    decay: decayMs(env),
    low: bandShare(body, 0, 400),
    high: bandShare(body, 3000, 22050),
    beat: tremolo(body),
    rms: rms(body),
    peak: peak(body),
  };
}

/**
 * How far apart two events are, in just-noticeable differences.
 *
 * `dist` is the Euclidean length in JND-normalised space — the standard shape of
 * a perceptual distance, and right because the ear integrates across timbral
 * axes rather than picking one. `axis` is the largest single difference, and it
 * is reported and gated alongside, so a pair cannot pass by accumulating seven
 * differences that are each individually inaudible.
 */
function separation(p, q) {
  let sum = 0, best = 0, bestAxis = "";
  const per = {};
  for (const ax of AXES) {
    const d = ax.ratio
      ? Math.log(Math.max(p[ax.key], 1e-9) / Math.max(q[ax.key], 1e-9)) / Math.log(ax.jnd)
      : (p[ax.key] - q[ax.key]) / ax.jnd;
    const m = Math.abs(d);
    per[ax.key] = m;
    sum += m * m;
    if (m > best) { best = m; bestAxis = ax.label; }
  }
  return { dist: Math.sqrt(sum), axis: best, axisName: bestAxis, per };
}

// ------------------------------------------------------------------
// THE SEED SWEEP — the honest instrument for a stochastic synth.
//
// The defect this replaces is the thirteenth "ruler measures the wrong
// quantity" on this project and it is the purest of them. Every pairwise number
// below used to be taken from ONE render, under ONE pinned seed, and printed as
// a property of the engine. The engine draws a fresh `noiseAt` offset on every
// blow, so that number was a sample of size one from a distribution the file
// never looked at — and the distribution straddled the bar:
//
//     seed        worst blow pair (shield heavy / shove shoulder)
//     0x12345678  2.86   <- FAILS the 3.0 bar, and takes "no two events are
//                            one sound" down with it (swing sword / dodge,
//                            no single axis reaching 1.0)
//     0x9e3779b9  3.20   <- the one that was committed
//     0xdeadbeef  3.27
//     0x0badf00d  3.30
//
// Margin over the bar 0.20; spread between draws 0.44. About one realisation in
// four of the SHIPPED synth failed a claim printed as proven.
//
// THE MEASUREMENT, NOT THE BAR. No bar moves here and no seed is hunted for.
// Every event is rendered under `SEEDS.length` seeds, and a pair's separation is
// then taken over the FULL CROSS PRODUCT of those draws — event A on draw i
// against event B on draw j, for every i and j. That is the right sample space
// because in a real fight the two blows being told apart are two independent
// draws; only comparing i against i (the diagonal) would sample N of the N*N
// combinations and would keep a correlation the game does not have.
//
// The statistic gated is the WORST case in that sample, at the bars that were
// already there. A player hears one draw per blow and hundreds of blows per
// match, so the claim "he can read every blow" is a claim about the worst draw,
// not the average one. The verdict line carries worst / median / best and the
// sample size, so a future reader sees the variance instead of one lucky number.
// ------------------------------------------------------------------

/**
 * The seeds. FOUR ARE THE ADVERSARY'S OWN, pinned so the refutation above stays
 * reproducible for ever and cannot be quietly retuned away; the rest are drawn
 * by splitmix32 from a fixed constant, which is arbitrary in the only sense that
 * matters — nobody chose them for the answers they give. `SOUND_SEEDS=n` sets
 * the count for iteration and is printed on the verdict line when it is not the
 * default, because a sweep of 2 is not a sweep.
 */
const SEED_COUNT = Math.max(1, parseInt(process.env.SOUND_SEEDS || "12", 10));
const SEEDS = (() => {
  const out = [0x9e3779b9, 0x12345678, 0xdeadbeef, 0x0badf00d];
  let x = 0x243f6a88;
  while (out.length < SEED_COUNT) {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    z = (z ^ (z >>> 15)) >>> 0;
    if (z && !out.includes(z)) out.push(z);
  }
  return out.slice(0, SEED_COUNT);
})();

/**
 * Every draw of A against every draw of B. Returns the worst, median and best
 * `dist`, and the worst single-axis maximum — which is a SEPARATE order
 * statistic on purpose: the pair that fails is not always the pair whose
 * Euclidean distance is smallest, and "seven inaudible differences do not add
 * up to an audible one" has to hold on the worst draw too.
 */
function crossPair(drawsA, drawsB) {
  const dists = [], axes = [];
  let worstAt = null;
  for (const a of drawsA) {
    for (const b of drawsB) {
      const s = separation(a, b);
      dists.push(s.dist);
      axes.push(s.axis);
      if (!worstAt || s.dist < worstAt.dist) worstAt = s;
    }
  }
  dists.sort((p, q) => p - q);
  axes.sort((p, q) => p - q);
  return {
    dist: dists[0],                       // the gated statistic: the worst draw
    median: dists[Math.floor(dists.length / 2)],
    best: dists[dists.length - 1],
    axis: axes[0],                        // worst best-axis across the draws
    axisName: worstAt.axisName,
    n: dists.length,
  };
}

/** The spread of the gated statistic, in the words a verdict line needs. */
const spreadOf = (r) => `worst ${r.dist.toFixed(2)} / median ${r.median.toFixed(2)} / best ${r.best.toFixed(2)} JND over ${r.n} draws`;

/**
 * Max simultaneously-sounding source nodes, from the start/stop log the page
 * keeps, counted only from `from` seconds onward.
 *
 * `from` exists because of a real blind spot in this instrument, found when the
 * voice pool started STOPPING the sources of a voice it steals instead of only
 * ramping its gain. In an OfflineAudioContext `currentTime` never advances
 * during the fill, so every event in a storm is scheduled at t=0 — and the
 * instant of maximum concurrency is therefore t=0, where every source that will
 * ever be created is momentarily live, including the ones stopped 20 ms later.
 * Measured at t=0 the reading was IDENTICAL before and after the fix: 198 nodes
 * on a tier capped at 10 and 226 on a tier capped at 24, and the tier check
 * failed on a build that had just got strictly better at the thing it checks.
 * Counting from just after the steal window measures what is actually running.
 */
function maxConcurrent(events, renderEnd, from = 0) {
  const edges = [];
  for (const e of events) {
    const a = Math.max(e.start ?? 0, from);
    const b = e.stop == null || !isFinite(e.stop) ? renderEnd : Math.max(e.stop, e.start ?? 0);
    if (b <= a) continue;
    edges.push([a, 1], [b, -1]);
  }
  edges.sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]));
  let live = 0, max = 0;
  for (const [, d] of edges) { live += d; if (live > max) max = live; }
  return max;
}

// ------------------------------------------------------------------
// Serving src/ to the page. Transpiles TypeScript with the compiler that is
// already a devDependency and rewrites specifiers so relative, "@/" and
// extensionless imports all resolve. No app file is touched.
// ------------------------------------------------------------------

const stubbed = new Set();
const EXTS = ["", ".ts", ".tsx", ".mts", ".mjs", ".js", "/index.ts", "/index.tsx", "/index.mjs"];

/** Module paths are repo-relative; SOUND_MODULE may hand in an absolute one. */
const abs = (p) => (isAbsolute(p) ? p : join(ROOT, p));

function resolveOnDisk(relPath) {
  for (const ext of EXTS) {
    const p = abs(relPath + ext);
    if (existsSync(p) && !p.endsWith("/")) {
      try { if (readFileSync(p).length >= 0) return relPath + ext; } catch { /* directory */ }
    }
  }
  return null;
}

function rewrite(code, fromRel) {
  const dir = dirname(fromRel);
  return code.replace(/(\bfrom\s*|\bimport\s*|\bimport\(\s*)(["'])([^"']+)\2/g, (m, head, q, spec) => {
    let rel = null;
    if (spec.startsWith("@/")) rel = join("src", spec.slice(2));
    else if (spec.startsWith(".")) rel = join(dir, spec);
    if (rel === null) { stubbed.add(spec); return `${head}${q}/stub/${spec}${q}`; }
    const hit = resolveOnDisk(rel);
    if (!hit) { stubbed.add(spec); return `${head}${q}/stub/${spec}${q}`; }
    return `${head}${q}/mod/${hit}${q}`;
  });
}

/**
 * `three` is a bare import and this harness will not pull the renderer into an
 * audio test. The audio module uses it for exactly one thing — Vector3 as a
 * scratch pad for the camera basis — so it gets a fifty-line stand-in. If a
 * future audio module needs more of three than this, that is itself worth
 * knowing: audio should not depend on the renderer.
 */
const THREE_STUB = `
export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { return this.set(a.x - b.x, a.y - b.y, a.z - b.z); }
  multiplyScalar(s) { return this.set(this.x * s, this.y * s, this.z * s); }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  lengthSq() { return this.dot(this); }
  length() { return Math.sqrt(this.lengthSq()); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  crossVectors(a, b) { return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
}
export class Vector2 extends Vector3 {}
export default { Vector3, Vector2 };
`;

const cache = new Map();

function serveModule(relPath) {
  if (cache.has(relPath)) return cache.get(relPath);
  const src = readFileSync(abs(relPath), "utf8");
  const js = /\.(ts|tsx|mts)$/.test(relPath)
    ? ts.transpileModule(src, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
        fileName: relPath,
      }).outputText
    : src;
  const out = rewrite(js, relPath);
  cache.set(relPath, out);
  return out;
}

// ------------------------------------------------------------------
// The page harness. Runs inside Chromium; the only thing that has a real
// OfflineAudioContext. Returns rendered samples and the voice log to Node,
// where all the measuring is done.
// ------------------------------------------------------------------
const PAGE = (seed0) => {
  const w = window;

  // DETERMINISM, AND THE TRAP UNDER IT.
  //
  // `noiseAt` starts every burst at a random offset in the shared noise bed,
  // deliberately — it is what keeps a synthesised library from sounding
  // machine-gunned. It also means a different slice of white noise per run, and
  // for a noise-dominated event that is a different spectrum: the same
  // unchanged shield block measured 2.93 and 3.05 JND from the same unchanged
  // shove on two consecutive runs of this file. So the page gets a seeded PRNG
  // before any module is imported, and the randomness under test is still
  // exercised — it is simply the same randomness every time.
  //
  // THAT WAS ONLY HALF THE JOB, AND THE HALF THAT WAS LEFT WAS THE DEFECT.
  // Pinning ONE seed makes the reading repeatable; it does not make it TRUE.
  // The shipped game draws a fresh offset on every blow, so what this file
  // measured was one realisation of a stochastic process, printed as a property
  // of the system. An adversary re-ran phases 3-5 under other arbitrary seeds
  // and the worst blow pair read 2.86 / 3.20 / 3.27 / 3.30 JND against a bar of
  // 3.0: the committed margin (0.20) was SMALLER than the draw-to-draw spread
  // (0.44), so roughly one realisation in four failed a claim this file printed
  // as proven. A pinned seed that passes is the bug, and hunting for a luckier
  // one would have been the same bug with a different number.
  //
  // So the seed is now an ARGUMENT and the gates sample the distribution. See
  // SEEDS and `sweep()`.
  let seed = (seed0 >>> 0) || 1;
  Math.random = () => {
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 0x100000000;
  };

  w.__audioCtorCalls = 0;
  for (const key of ["AudioContext", "webkitAudioContext"]) {
    const Real = w[key];
    if (!Real) continue;
    function Counted(...args) { w.__audioCtorCalls++; return new Real(...args); }
    Counted.prototype = Real.prototype;
    w[key] = Counted;
  }
  // Every scheduled source in the page reports when it starts and stops. This
  // is how voices are counted without asking the module how many it thinks it
  // is playing — the module's own opinion is exactly what is under test.
  //
  // Patching AudioScheduledSourceNode alone is NOT enough and this cost an
  // hour: AudioBufferSourceNode declares its OWN `start` (the three-argument
  // offset/duration form), which shadows the base. A noise-burst synth — which
  // is every impact in a melee game — would then start no counted voices at
  // all and the budget assertion would pass on an empty log. Patch each
  // prototype that owns the method.
  w.__voices = [];
  for (const C of [w.AudioScheduledSourceNode, w.AudioBufferSourceNode, w.OscillatorNode, w.ConstantSourceNode]) {
    const proto = C && C.prototype;
    // `hasOwnProperty`, not a truthiness test: these prototypes inherit from
    // one another, so a plain `proto.__tapped` reads the base's flag and every
    // subclass is skipped — which is the bug this comment used to be.
    if (!proto || Object.prototype.hasOwnProperty.call(proto, "__tapped")) continue;
    if (Object.prototype.hasOwnProperty.call(proto, "start")) {
      const rs = proto.start;
      proto.start = function (when, ...rest) { w.__voices.push(this.__vlog = { start: when ?? 0, stop: null }); return rs.call(this, when, ...rest); };
    }
    if (Object.prototype.hasOwnProperty.call(proto, "stop")) {
      const rp = proto.stop;
      proto.stop = function (when, ...rest) { if (this.__vlog) this.__vlog.stop = when ?? 0; return rp.call(this, when, ...rest); };
    }
    proto.__tapped = true;
  }

  w.__render = async (seconds, sampleRate, fill) => {
    w.__voices = [];
    const ctx = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);
    await fill(ctx);
    const buf = await ctx.startRendering();
    const data = buf.getChannelData(0);
    return { samples: Array.from(data), voices: w.__voices.map((v) => ({ start: v.start, stop: v.stop })) };
  };
};

async function render(page, seconds, fillBody) {
  return page.evaluate(
    async ({ seconds: s, sampleRate, body }) => window.__render(s, sampleRate, new Function("ctx", `return (async () => { ${body} })()`)),
    { seconds, sampleRate: SR, body: fillBody },
  );
}

// ------------------------------------------------------------------

async function calibrate(page) {
  console.log("\n[soundtest] phase 1 — calibration: do the instruments tell the truth?");

  const sine = (hz, amp, dur) => `
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = ${hz}; g.gain.value = ${amp};
    o.connect(g).connect(ctx.destination); o.start(0); o.stop(${dur});`;

  const a = await render(page, 0.7, sine(1000, 0.5, 0.5));
  const pk = peak(a.samples), cen = centroidHz(a.samples), env = envelopeMs(a.samples);
  check("peak meter reads a known amplitude", Math.abs(pk - 0.5) < 0.02, `1 kHz @ 0.5 measured ${pk.toFixed(4)}`);
  check("centroid meter reads a known frequency", Math.abs(cen - 1000) < 60, `1 kHz measured ${cen.toFixed(0)} Hz`);
  check("envelope meter reads a known duration", Math.abs(env - 500) < 25, `500 ms tone measured ${env.toFixed(0)} ms`);

  const b = await render(page, 0.7, sine(6000, 0.5, 0.5));
  const cenHi = centroidHz(b.samples);
  check("centroid separates a bright signal from a dark one", cenHi / cen > 4, `6 kHz measured ${cenHi.toFixed(0)} Hz — ${(cenHi / cen).toFixed(1)}x the 1 kHz reference`);

  // The bug this whole meter exists to catch, staged deliberately: the same
  // transient, once as a click and once ringing on for a second and a half.
  const clicky = (tau, dur) => `
    const n = ctx.createBufferSource(); const b = ctx.createBuffer(1, ${Math.ceil(2 * SR)}, ${SR});
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (${SR} * ${tau}));
    n.buffer = b; n.connect(ctx.destination); n.start(0); n.stop(${dur});`;
  const short = await render(page, 2.0, clicky(0.004, 0.05));
  const long = await render(page, 2.0, clicky(0.55, 1.9));
  const envShort = envelopeMs(short.samples), envLong = envelopeMs(long.samples);
  check("envelope meter distinguishes a click from a two-second ring",
    envShort < 80 && envLong > 900,
    `click ${envShort.toFixed(0)} ms vs ring ${envLong.toFixed(0)} ms`);

  // Deliberately a MIX of oscillators and buffer sources: a synth built out of
  // noise bursts uses the latter almost exclusively, and an earlier version of
  // this file counted none of them.
  const c = await render(page, 1.0, `
    const burst = () => { const s = ctx.createBufferSource(); const b = ctx.createBuffer(1, ${SR}, ${SR}); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.02; s.buffer = b; return s; };
    for (let i = 0; i < 3; i++) { const o = ctx.createOscillator(); o.frequency.value = 200 + i * 50; const g = ctx.createGain(); g.gain.value = 0.05; o.connect(g).connect(ctx.destination); o.start(0.1); o.stop(0.5); }
    for (let i = 0; i < 2; i++) { const s = burst(); s.connect(ctx.destination); s.start(0.15); s.stop(0.45); }
    for (let i = 0; i < 3; i++) { const s = burst(); s.connect(ctx.destination); s.start(0.6 + i * 0.1); s.stop(0.65 + i * 0.1); }`);
  const conc = maxConcurrent(c.voices, 1.0);
  check("voice counter counts overlapping oscillators AND buffer sources", conc === 5,
    `8 sources scheduled (3 osc + 5 buffer), 5 overlapping — measured ${conc} from ${c.voices.length} logged`);

  const quiet = await render(page, 0.3, `void ctx;`);
  check("silence detector reads digital silence as zero", peak(quiet.samples) === 0, `peak ${peak(quiet.samples)}`);

  // ---- the instruments phase 3 and 4 run on. Same rule: an unmeasured ruler
  // is an opinion, and these ones decide whether two sounds are one sound.

  // Attack and decay, against an envelope of known shape: 40 ms linear rise on
  // a 3 kHz tone, then an exponential fall with a known time constant.
  // An envelope of known shape: a linear rise of `riseMs`, then an exponential
  // fall from 0.5 to 0.0001 over `fallMs`.
  //
  // The -30 dB point of that fall is NOT at some tidy fraction of a time
  // constant, and assuming it was is what made this reference wrong on its first
  // run: the ramp spans ln(5000) = 8.517 e-folds and -30 dB is ln(31.62) = 3.454
  // of them, so the meter should read `fallMs * 0.4056`. The METER was right at
  // 161 ms and the arithmetic behind the 200 ms it was checked against was not.
  // Stated here rather than quietly retuned, because a reference nobody can
  // re-derive is not a calibration.
  const D30 = Math.log(31.62) / Math.log(5000);
  const shaped = (riseMs, fallMs) => `
    const o = ctx.createOscillator(); o.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.linearRampToValueAtTime(0.5, ${riseMs / 1000});
    g.gain.exponentialRampToValueAtTime(0.0001, ${((riseMs + fallMs) / 1000).toFixed(5)});
    o.connect(g).connect(ctx.destination); o.start(0); o.stop(1.6);`;
  {
    const FALL = 493;
    const want = FALL * D30;
    const r = await render(page, 1.8, shaped(40, FALL));
    const env = smoothEnv(r.samples);
    const at = attackMs(env), dc = decayMs(env);
    check("attack meter reads a known rise time", Math.abs(at - 40) < 8, `40 ms ramp measured ${at.toFixed(1)} ms`);
    check("decay meter reads a known fall to -30 dB", Math.abs(dc - want) < 25,
      `a ${FALL} ms ramp reaches -30 dB at ${want.toFixed(0)} ms; measured ${dc.toFixed(0)} ms`);
    const fast = await render(page, 1.8, shaped(1, FALL));
    check("attack meter separates a click from a swell",
      attackMs(smoothEnv(fast.samples)) < at / 6,
      `1 ms ramp ${attackMs(smoothEnv(fast.samples)).toFixed(2)} ms vs 40 ms ramp ${at.toFixed(1)} ms`);
  }

  // Flatness, against the two extremes it has to tell apart.
  {
    const noise = await render(page, 0.5, `
      const s = ctx.createBufferSource(); const b = ctx.createBuffer(1, ${SR}, ${SR});
      const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.4;
      s.buffer = b; s.connect(ctx.destination); s.start(0); s.stop(0.4);`);
    const tone = await render(page, 0.5, sine(1000, 0.4, 0.4));
    const fn = flatness(noise.samples), ft = flatness(tone.samples);
    check("flatness meter reads noise as flat and a tone as not",
      fn > 0.25 && ft < 0.05, `white noise ${fn.toFixed(3)}, 1 kHz sine ${ft.toFixed(3)}`);
  }

  // Beating. An 8 Hz tremolo of KNOWN modulation index against a plain decay —
  // this is the parry's signature and it is worth nothing if the meter invents
  // it. The first version of the meter read 0.44 on the plain decay, which is
  // the whole reason this reference exists; see `tremolo`.
  {
    const AM = (index) => `
      const o = ctx.createOscillator(); o.frequency.value = 3000;
      const g = ctx.createGain(); g.gain.value = 0.35;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 8;
      const depth = ctx.createGain(); depth.gain.value = ${(0.35 * index).toFixed(4)};
      lfo.connect(depth); depth.connect(g.gain); lfo.start(0); lfo.stop(1.0);
      o.connect(g).connect(ctx.destination); o.start(0); o.stop(1.0);`;
    const deep = await render(page, 1.2, AM(0.8));
    const shallow = await render(page, 1.2, AM(0.2));
    const plain = await render(page, 1.2, shaped(2, 700));
    const td = tremolo(deep.samples), ts = tremolo(shallow.samples), tp = tremolo(plain.samples);
    check("beating meter reads a known modulation index and does not invent one in a plain decay",
      Math.abs(td - 0.8) < 0.18 && Math.abs(ts - 0.2) < 0.12 && tp < 0.10,
      `index 0.8 measured ${td.toFixed(3)}, index 0.2 measured ${ts.toFixed(3)}, smooth decay ${tp.toFixed(3)}`);
  }

  // The small-speaker model. Four tones of known frequency decide whether it is
  // a phone speaker or a random filter.
  {
    const at = async (hz) => {
      const r = await render(page, 0.6, sine(hz, 0.5, 0.5));
      const [a, b] = sounding(r.samples);
      const body = Array.prototype.slice.call(r.samples, a, b);
      return dB(rms(phoneSpeaker(body))) - dB(rms(body));
    };
    const [l80, l200, l400, l2k] = [await at(80), await at(200), await at(400), await at(2000)];
    check("the phone-speaker model has the response of a micro-speaker, not a brick wall",
      l80 < -40 && l200 < -16 && l200 > -26 && l400 < -4 && l400 > -9 && Math.abs(l2k) < 1.5,
      `80 Hz ${l80.toFixed(1)} dB, 200 Hz ${l200.toFixed(1)} dB, 400 Hz ${l400.toFixed(1)} dB, 2 kHz ${l2k.toFixed(1)} dB`);
  }
}

// ------------------------------------------------------------------

const MODULE_CANDIDATES = [
  "src/game/client/audio.ts", "src/game/client/audio/index.ts", "src/game/client/sound.ts",
  "src/game/client/audio/bus.ts", "src/game/client/render/audio.ts", "src/game/audio.ts",
  "src/game/client/audio.mjs", "src/game/audio.mjs",
];
const FACTORIES = ["createAudioBus", "createAudio", "createAudioEngine", "createSoundBus", "makeAudio", "createMixer", "default"];

/**
 * SOUND_MODULE points the audit at a module outside the candidate list. It is
 * how phase 2 was exercised before the game had any audio at all — against a
 * throwaway reference synth, and against a deliberately broken one, to prove
 * these assertions fail when they should rather than only when nothing is here.
 */
function findModule() {
  const forced = process.env.SOUND_MODULE;
  if (forced) {
    if (!existsSync(abs(forced))) throw new Error(`SOUND_MODULE points at nothing: ${forced}`);
    return forced;
  }
  for (const rel of MODULE_CANDIDATES) if (existsSync(abs(rel))) return rel;
  return null;
}

/**
 * Binds whatever the audio module actually exports to one `fire(spec)` call.
 *
 * Two shapes are accepted. The one the game ships is a page singleton —
 * `getAudio()` plus `adopt(context)`, with a method per event — and the second
 * is the generic `createAudioBus(ctx, opts)` + `emit(event)` of docs/SOUND.md.
 * Anything the module does not implement makes `fire` return false rather than
 * throw, so a missing event is reported as a gap instead of crashing the run.
 */
const BIND = `
window.__bind = async (ctx, mod, presets, tier, doAdopt, speaker) => {
  let bus = null;
  if (typeof mod.getAudio === "function") {
    bus = mod.getAudio();
    if (doAdopt && typeof bus.adopt === "function") bus.adopt(ctx);
  } else {
    const f = ["createAudioBus", "createAudio", "createSoundBus", "makeAudio", "default"]
      .map((n) => mod[n]).find((v) => typeof v === "function");
    if (f) bus = f(ctx, { tier });
  }
  if (!bus) throw new Error("no factory this harness can drive");
  if (presets && presets[tier] && typeof bus.setQuality === "function") bus.setQuality(presets[tier]);
  if (speaker && typeof bus.setSpeaker === "function") bus.setSpeaker(speaker);
  const call = (n, e) => (typeof bus[n] === "function" ? (bus[n](e), true) : false);
  const fire = (s) => {
    const at = s.position ? { position: s.position } : {};
    // "local" defaults true so every single-event profile is measured on the
    // near bus, where nothing is attenuated and nothing is ducked. Phase 5
    // passes local:false deliberately — the storm is OTHER men.
    // (No backticks anywhere in this string: it is itself a template literal.)
    const local = s.local !== false;
    switch (s.k) {
      case "swing": return call("swing", { warriorClass: s.cls || "huscarl", heavy: !!s.heavy, local, ...at })
        || call("emit", { type: "swing", weapon: s.cls || "huscarl" });
      case "impact": return call("impact", { material: s.material, damage: s.damage ?? 20, heavy: !!s.heavy, zone: s.zone, weapon: s.weapon, local, ...at })
        || call("emit", { type: "impact", hitType: s.hitType, hitZone: s.zone });
      case "death": return call("death", { cause: s.cause ?? null, local, ...at })
        || call("emit", { type: "death" });
      case "sever": return call("sever", { zone: s.zone || "armR", power: s.power ?? 1, local, ...at });
      case "block": return call("block", { local, raise: !!s.raise, ...at });
      case "dodge": return call("dodge", { local, ...at });
      // THE WIRE'S OWN DOOR. Not impact() with a material worked out here:
      // hit() is the method the client calls with the server's payload, and the
      // whole of phase 6 is the claim that every kind coming through it arrives
      // somewhere. Anything this harness maps itself is a mapping the game is
      // not obliged to have. (No backticks: this is inside a template literal.)
      case "wire": return call("hit", { type: s.type, damage: s.damage ?? 0, hitZone: s.zone ?? null, weapon: s.weapon, riposte: s.riposte === true, shield: !!s.shield, local, ...at });
      case "shove": return call("shove", { local, shield: !!s.shield, ...at });
      case "footfall": return call("footfall", { ground: s.ground ?? 0, weight: 0.7, local, ...at });
      case "ability": return call("ability", { warriorClass: s.cls || "berserker", local, ...at });
      // The screen family. A bare string, not an event object — there is no
      // world position on a menu and nothing to attenuate it by.
      case "ui": return call("ui", s.kind) || call("emit", { type: "ui", ui: s.kind });
      default: return false;
    }
  };
  // The frame the mixer runs on. Without it the camera basis is never built and
  // every spatialised event is measured against a basis of zeroes — which is
  // still deterministic, but it is not the code path the game runs.
  const frame = (dt) => {
    if (typeof bus.update !== "function") return;
    bus.update(dt, {
      quality: (presets && presets[tier]) || { tier },
      camera: { matrixWorld: { elements: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,1.7,7,1] } },
    });
  };
  return { bus, fire, frame };
};
`;

/**
 * One render, one page, one module instance.
 *
 * The engine is a page singleton whose `adopt()` is a no-op once it already
 * holds a context — deliberate in the module, because browsers cap how many
 * AudioContexts a document may hold. It does mean a fresh OfflineAudioContext
 * needs a fresh page, so every render below reloads and re-imports. That costs
 * a fraction of a second and buys total isolation between events, which is
 * worth more: a tail bleeding from one measurement into the next would make
 * every envelope reading a lie.
 */
async function auditRender(page, rel, seconds, opts) {
  const { tier = "high", adopt = true, speaker = null, seed = SEEDS[0], body } = opts;
  await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(PAGE, seed);
  await page.evaluate(BIND);
  return page.evaluate(async (a) => {
    const mod = await import(a.url);
    let presets = null;
    try { presets = (await import(a.qurl)).QUALITY_PRESETS ?? null; } catch { /* module has no tiers */ }
    const before = window.__audioCtorCalls;
    let bus = null;
    const out = await window.__render(a.seconds, a.sampleRate, async (ctx) => {
      const bound = await window.__bind(ctx, mod, presets, a.tier, a.adopt, a.speaker);
      bus = bound.bus;
      await new Function("ctx", "bus", "fire", "frame", `return (async () => { ${a.body} })()`)(ctx, bound.bus, bound.fire, bound.frame);
    });
    out.ctors = window.__audioCtorCalls - before;
    out.exports = Object.keys(mod);
    out.reported = typeof bus?.voiceBudget === "function" ? bus.voiceBudget() : (bus?.voiceBudget ?? null);
    out.live = typeof bus?.voices === "number" ? bus.voices : null;
    out.budgets = mod.AUDIO_BUDGET ?? null;
    out.speaker = bus?.speaker ?? null;
    return out;
  }, { url: `${ORIGIN}/mod/${rel}`, qurl: `${ORIGIN}/mod/src/game/client/render/quality.ts`, seconds, sampleRate: SR, tier, adopt, speaker, body });
}

async function audit(page, rel) {
  console.log(`\n[soundtest] phase 2 — audit: ${rel}`);

  // ---- 4. the autoplay trap, stated as a test ----
  //
  // The module is imported and driven WITHOUT being handed a context, which is
  // the state a real page is in before the player's first tap. Every event is
  // fired at it anyway. Three things must hold: our own context renders exact
  // digital silence, not one source node was scheduled, and the module built no
  // AudioContext of its own at import or under load.
  {
    const locked = await auditRender(page, rel, 1.5, { adopt: false, body: `
      for (let i = 0; i < 6; i++) fire({ k: "impact", material: "flesh", damage: 30 });
      fire({ k: "swing", cls: "berserker", heavy: true });
      fire({ k: "death" }); fire({ k: "sever" }); fire({ k: "block" }); fire({ k: "footfall" });
      for (const kind of ["tap", "confirm", "purchase", "matchWon"]) fire({ k: "ui", kind });` });
    note(`exports [${locked.exports.join(", ")}]`);
    if (stubbed.size) note(`stubbed non-source imports: ${[...stubbed].join(", ")}`);
    check("nothing is emitted before the context is unlocked",
      peak(locked.samples) === 0 && locked.voices.length === 0,
      `15 events into a locked engine: peak ${peak(locked.samples).toExponential(2)} (must be exactly 0), ${locked.voices.length} sources scheduled`);
    check("no AudioContext is built at import or before a gesture", locked.ctors === 0,
      `${locked.ctors} constructions — any one of them is created suspended on iOS and never recovers`);
  }

  // ---- 1. peak below clipping, including eight simultaneous deaths ----
  {
    const one = await auditRender(page, rel, 2.5, { body: `fire({ k: "death", cause: "blade" });` });
    const eight = await auditRender(page, rel, 2.5, { body: `
      for (let i = 0; i < 8; i++) fire({ k: "death", cause: "blade", position: { x: Math.cos(i) * 3, y: 0, z: Math.sin(i) * 3 } });` });
    const p1 = peak(one.samples), p8 = peak(eight.samples);
    check("a single death does not clip, and is not silence", p1 > 0 && p1 < 0.99, `peak ${p1.toFixed(4)}`);
    check("eight simultaneous deaths do not clip", p8 > 0 && p8 < 0.99,
      `peak ${p8.toFixed(4)} across ${maxConcurrent(eight.voices, 2.5)} concurrent voices — ${(p8 / (p1 || 1)).toFixed(2)}x one death, so a limiter and not 8x`);
  }

  // ---- 2. envelope inside its intended window ----
  {
    const WINDOWS = [
      ["swing huscarl", { k: "swing", cls: "huscarl" }, 40, 500],
      ["swing berserker heavy", { k: "swing", cls: "berserker", heavy: true }, 40, 600],
      ["impact flesh", { k: "impact", material: "flesh", damage: 30 }, 25, 400],
      ["impact shield", { k: "impact", material: "shield", damage: 8 }, 30, 700],
      ["impact mail", { k: "impact", material: "mail", damage: 14 }, 25, 500],
      ["impact parry", { k: "impact", material: "parry", damage: 0 }, 25, 800],
      ["footfall", { k: "footfall" }, 10, 350],
      ["death", { k: "death", cause: "blade" }, 120, 2000],
      ["sever", { k: "sever", zone: "armR" }, 80, 1600],
    ];
    let bad = 0, first = null, skipped = 0;
    for (const [name, spec, lo, hi] of WINDOWS) {
      const r = await auditRender(page, rel, 2.5, { body: `if (!fire(${JSON.stringify(spec)})) window.__unvoiced = true;` });
      const unvoiced = await page.evaluate(() => window.__unvoiced === true);
      if (unvoiced) { skipped++; note(`--   ${name}: not voiced by this module`); continue; }
      const ms = envelopeMs(r.samples);
      const ok = ms >= lo && ms <= hi;
      note(`${ok ? "ok  " : "BAD "} ${name}: ${ms.toFixed(0)} ms (window ${lo}-${hi}), peak ${peak(r.samples).toFixed(3)}, ${r.voices.length} voices`);
      if (!ok) { bad++; first = first ?? `${name} ${ms.toFixed(0)} ms outside ${lo}-${hi}`; }
    }
    check("every event rings inside its intended window", bad === 0,
      bad ? `${bad} outside — first: ${first}` : `${WINDOWS.length - skipped}/${WINDOWS.length} inside${skipped ? `, ${skipped} not voiced` : ""}`);
  }

  // ---- 3. spectral separation ----
  //
  // The module's own header claims flesh sits lowest, then shield, then mail,
  // then the parry's bright ring on top. That is a falsifiable claim and this
  // is where it gets falsified.
  //
  // Swept over the seeds for the same reason phases 3-5 are: a centroid taken
  // off a noise-dominated event is a reading of one draw. An ORDERING that only
  // holds on the median draw is not an ordering — the player gets whichever draw
  // the engine hands him — so the ordering is checked draw by draw, and the
  // brightness ratio is gated on its worst.
  {
    const cen = {};
    for (const material of ["flesh", "shield", "mail", "parry"]) {
      cen[material] = [];
      for (const seed of SEEDS) {
        const r = await auditRender(page, rel, 2.0, { seed, body: `fire({ k: "impact", material: ${JSON.stringify(material)}, damage: ${material === "parry" ? 0 : 20} });` });
        cen[material].push(centroidHz(r.samples));
      }
    }
    note(`centroids over ${SEEDS.length} seeds — ${Object.entries(cen).map(([k, v]) => `${k} ${Math.min(...v).toFixed(0)}-${Math.max(...v).toFixed(0)} Hz`).join(", ")}`);
    // Every draw of one against every draw of the other, same product space as
    // `crossPair`: two blows in a fight are two independent draws.
    let ratio = Infinity;
    for (const a of cen.shield) for (const b of cen.flesh) ratio = Math.min(ratio, Math.max(a, b) / Math.max(1, Math.min(a, b)));
    check("a shield block and a flesh hit do not land in the same place", ratio >= 1.5,
      `${ratio.toFixed(2)}x apart on the closest of ${SEEDS.length * SEEDS.length} draw pairs (need 1.5x) — a player must tell them apart without looking`);
    const ordered = ["flesh", "shield", "mail", "parry"];
    let breaks = 0;
    for (let i = 0; i + 1 < ordered.length; i++) {
      for (const a of cen[ordered[i]]) for (const b of cen[ordered[i + 1]]) if (!(a < b)) breaks++;
    }
    check("the four materials are ordered flesh < shield < mail < parry, as the module claims",
      breaks === 0,
      breaks ? `${breaks} draw pair(s) out of order` : `${ordered.map((k) => `${k} ${Math.min(...cen[k]).toFixed(0)}-${Math.max(...cen[k]).toFixed(0)}`).join(" < ")}, on every one of ${SEEDS.length * SEEDS.length} draw pairs per step`);
  }

  // ---- 3b. the screen family ----
  //
  // docs/SOUND.md asks for nine screen sounds that are a FAMILY — "same
  // synthesis, same palette — so the interface sounds like one instrument".
  // That is falsifiable two ways and both are checked here. Each sound must
  // ring inside a window fit for what it says (a tap is not a fanfare), and the
  // nine must sit close together in brightness, because a family drawn from one
  // instrument cannot have one member three octaves off the rest.
  {
    // Every screen sound the module declares, not a list this file keeps in its
    // head. A sound added to `UiSound` and never given a window here would
    // otherwise be the one thing in the family nobody measured — and the spread
    // assertion below is only worth anything if it is taken across ALL of them.
    // A name with no window is a FAIL, not a skip.
    const WINDOWS = {
      tap: [30, 260], confirm: [60, 600], back: [60, 520],
      purchase: [150, 1200], refusal: [50, 480], countdown: [50, 420],
      roundWon: [250, 1700], roundLost: [250, 1700],
      // The reward, and the two that are music rather than a sting.
      levelUp: [150, 1000], matchWon: [400, 2600], matchLost: [400, 2600],
    };
    const declared = await page.evaluate(async (u) => {
      const m = await import(u);
      return m.UI_SOUNDS ?? null;
    }, `${ORIGIN}/mod/${rel}`).catch(() => null);
    const names = declared ?? Object.keys(WINDOWS);
    const unwindowed = names.filter((k) => !WINDOWS[k]);
    check("every screen sound the module declares has a window this file grades it against",
      unwindowed.length === 0,
      unwindowed.length ? `no window for: ${unwindowed.join(", ")}` : `${names.length} declared, ${names.length} graded${declared ? " (read off the module's own UI_SOUNDS)" : " (module declares no list; using this file's)"}`);
    const UI = names.filter((k) => WINDOWS[k]).map((k) => [k, WINDOWS[k][0], WINDOWS[k][1]]);
    const cen = {}, ms = {}, pk = {};
    let bad = 0, first = null, missing = 0;
    for (const [kind, lo, hi] of UI) {
      const r = await auditRender(page, rel, 3.0, { body: `if (!fire({ k: "ui", kind: ${JSON.stringify(kind)} })) window.__unvoiced = true;` });
      if (await page.evaluate(() => window.__unvoiced === true)) { missing++; note(`--   ${kind}: not voiced by this module`); continue; }
      ms[kind] = envelopeMs(r.samples); cen[kind] = centroidHz(r.samples); pk[kind] = peak(r.samples);
      const ok = ms[kind] >= lo && ms[kind] <= hi && pk[kind] > 0 && pk[kind] < 0.99;
      note(`${ok ? "ok  " : "BAD "} ${kind}: ${ms[kind].toFixed(0)} ms (window ${lo}-${hi}), peak ${pk[kind].toFixed(3)}, centroid ${cen[kind].toFixed(0)} Hz`);
      if (!ok) { bad++; first = first ?? `${kind} ${ms[kind].toFixed(0)} ms / peak ${pk[kind].toFixed(3)}`; }
    }
    check("every screen sound is voiced and none is silence", missing === 0 && Object.keys(pk).length === UI.length,
      `${Object.keys(pk).length}/${UI.length} voiced${missing ? `, ${missing} missing` : ""}`);
    check("every screen sound rings inside the window its meaning allows", bad === 0 && missing === 0,
      bad ? `${bad} outside — first: ${first}` : `${UI.length - missing}/${UI.length} inside, none clipping`);

    const vals = Object.values(cen).filter((v) => v > 0);
    const spread = vals.length ? Math.max(...vals) / Math.min(...vals) : Infinity;
    check(`the screen sounds are one instrument, not ${UI.length}`, spread <= 3.0,
      `brightest/darkest = ${spread.toFixed(2)}x across the ${UI.length} (need <= 3x) — ${Object.entries(cen).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(", ")}`);

    // And the family must not be the combat family. A menu tap that lands on
    // top of a sword hitting mail is a UI that fights the game.
    const flesh = await auditRender(page, rel, 2.0, { body: `fire({ k: "impact", material: "flesh", damage: 20 });` });
    const fc = centroidHz(flesh.samples);
    const ratio = Math.max(cen.tap, fc) / Math.max(1, Math.min(cen.tap, fc));
    check("a menu tap is not mistakable for a blow landing", ratio >= 1.5,
      `tap ${cen.tap?.toFixed(0)} Hz vs flesh impact ${fc.toFixed(0)} Hz — ${ratio.toFixed(2)}x apart`);
  }

  // ---- 5. voice count never exceeds the tier budget ----
  //
  // A voice is the MODULE's unit and one voice is not one source node — an
  // impact here costs six. Rather than guess the conversion, the same storm is
  // run at all three tiers and two independent things are checked.
  //
  // The second is the one that cannot be faked. If the budget were ignored, the
  // storm would saturate at the same absolute node count on every tier, because
  // the same 60 events are fired each time. Concurrency that tracks the tier's
  // declared cap in proportion is only possible if the cap is what is binding.
  {
    const storm = `
      for (let i = 0; i < 30; i++) {
        const a = { x: Math.cos(i) * 2, y: 0, z: Math.sin(i) * 2 };
        fire({ k: "impact", material: "mail", damage: 18, position: a });
        fire({ k: "swing", cls: "warden", heavy: true, position: a });
      }`;
    const rows = [];
    for (const tier of ["low", "medium", "high"]) {
      const r = await auditRender(page, rel, 2.5, { tier, body: storm });
      const cap = r.budgets?.[tier]?.voices ?? (typeof r.reported === "number" ? r.reported : null);
      // From 60 ms, past the 20 ms the pool gives a stolen voice to stop. See
      // `maxConcurrent`: at t=0 every event in the storm is still on the clock
      // and the reading says nothing about what the tier is actually running.
      rows.push({ tier, cap, conc: maxConcurrent(r.voices, 2.5, 0.06), live: r.live, pk: peak(r.samples) });
    }
    for (const row of rows) {
      note(`${row.tier}: 60 events -> ${row.conc} concurrent source nodes, module reports ${row.live} live voices against a cap of ${row.cap}, peak ${row.pk.toFixed(3)}`);
    }
    check("the module's own live voice count never exceeds its tier budget",
      rows.every((x) => typeof x.cap === "number" && typeof x.live === "number" && x.live <= x.cap),
      rows.map((x) => `${x.tier} ${x.live}/${x.cap}`).join(", "));

    // Nodes per voice, measured, and it must come out the same on every tier —
    // the events are identical, only the cap changes.
    const ratios = rows.map((x) => x.conc / x.cap);
    const spread = Math.max(...ratios) / Math.min(...ratios);
    check("voice count scales with the tier budget instead of ignoring it",
      spread < 1.15 && rows[0].conc < rows[2].conc,
      `${ratios.map((v, i) => `${rows[i].tier} ${v.toFixed(2)}`).join(", ")} nodes per voice — ${spread.toFixed(3)}x spread (an ignored cap would render the same count on all three)`);

    // And the absolute ceiling, using the measured cost of the most expensive
    // event in the storm.
    const nodes = Math.round(Math.max(...ratios));
    check("no tier exceeds its cap times the measured cost of a voice",
      rows.every((x) => x.conc <= x.cap * nodes),
      rows.map((x) => `${x.tier} ${x.conc}<=${x.cap * nodes}`).join(", ") + ` at ${nodes} nodes/voice`);
  }
}

// ------------------------------------------------------------------
// PHASE 3 — THE READ.
//
// The owner's requirement is "satisfying sounds that compliment fighting", and
// the falsifiable half of it is stated in the brief: *the player should know
// without looking whether he was blocked, parried, or opened up.* Everything
// above grades one sound at a time. Not one assertion in this file, before this
// phase existed, could say whether any two of them were the SAME SOUND — and
// two sounds a player cannot tell apart are one sound.
//
// So: a feature vector per event, and a pairwise distance in just-noticeable
// differences. See AXES for the axes, and for the one that is deliberately
// missing, which is the whole design of this ruler.
// ------------------------------------------------------------------

/**
 * Every event the game can make at a man.
 *
 * EVERY ONE OF THESE IS REACHABLE FROM THE WIRE AS IT STANDS, and that is a
 * deliberate constraint rather than a coincidence. R3: a gate that is green
 * because the case is absent is not a gate. The brief for this unit lists "a
 * haft into a body" as a sixth event and there is NO wire message that produces
 * one — so there is no `haft` material here and none in the engine, because a
 * material nothing can emit would be graded forever and heard never. The
 * nearest reachable pair is the shove with and without a shield, and those are
 * two separate rows below because they are two separate events today.
 */
const PROFILE = [
  ["flesh light", { k: "impact", material: "flesh", damage: 13, weapon: "huscarl" }],
  ["flesh heavy", { k: "impact", material: "flesh", damage: 34, heavy: true, weapon: "huscarl" }],
  ["mail light", { k: "impact", material: "mail", damage: 9, weapon: "huscarl" }],
  ["mail heavy", { k: "impact", material: "mail", damage: 26, heavy: true, weapon: "huscarl" }],
  ["shield light", { k: "impact", material: "shield", damage: 8, weapon: "huscarl" }],
  ["shield heavy", { k: "impact", material: "shield", damage: 20, heavy: true, weapon: "huscarl" }],
  ["parry", { k: "impact", material: "parry", damage: 0, weapon: "huscarl" }],
  ["shove shoulder", { k: "shove" }],
  ["shove boss", { k: "shove", shield: true }],
  ["axe on mail", { k: "impact", material: "mail", damage: 26, heavy: true, weapon: "berserker" }],
  ["seax on mail", { k: "impact", material: "mail", damage: 26, heavy: true, weapon: "runekeeper" }],
  ["swing sword", { k: "swing", cls: "huscarl" }],
  ["swing axe", { k: "swing", cls: "berserker", heavy: true }],
  ["swing seax", { k: "swing", cls: "runekeeper" }],
  ["footfall", { k: "footfall" }],
  ["dodge", { k: "dodge" }],
  ["death", { k: "death", cause: "blade" }],
  ["sever", { k: "sever", zone: "neck", power: 1.55 }],
];

/**
 * THE BLOW SET — the events that answer "what just happened to ME". These are
 * the ones the player has to read mid-fight, with seven other men making noise
 * and nobody doing an A/B, so the bar on them is higher than a discrimination
 * threshold: 3 JND, not 1.
 */
const BLOWS = ["flesh light", "flesh heavy", "mail light", "mail heavy", "shield light", "shield heavy", "parry", "shove shoulder", "shove boss"];
const READ_BAR = 3.0;
const REST_BAR = 1.5;

/**
 * The whole profile, rendered once per seed. Returns `{ name: [samples, ...] }`
 * — one entry per draw, in SEEDS order — or `null` for an event the module does
 * not voice at all.
 *
 * This is the expensive part of the file and it is where the cost of the fixed
 * measurement lands: 18 events by `SEEDS.length` renders. It is worth it. The
 * alternative is the 18 renders it used to cost and a verdict that is a coin
 * toss, which is worth nothing at all.
 */
async function hearing(page, rel, speaker) {
  const out = {};
  for (const [name, spec] of PROFILE) {
    const draws = [];
    for (const seed of SEEDS) {
      const r = await auditRender(page, rel, 1.9, { speaker, seed, body: `if (!fire(${JSON.stringify(spec)})) window.__unvoiced = true;` });
      if (await page.evaluate(() => window.__unvoiced === true)) { draws.length = 0; break; }
      draws.push(r.samples);
    }
    out[name] = draws.length ? draws : null;
  }
  return out;
}

/** Features for every draw of every event. */
function featureDraws(raw) {
  const feat = {};
  for (const [name, draws] of Object.entries(raw)) if (draws) feat[name] = draws.map(features);
  return feat;
}

/**
 * Every pair, over every draw of each side. Sorted by the gated statistic —
 * the worst draw — so `rows[0]` is the pair that decides the verdict.
 */
function pairs(feat, names) {
  const rows = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (!feat[names[i]] || !feat[names[j]]) continue;
      rows.push({ a: names[i], b: names[j], ...crossPair(feat[names[i]], feat[names[j]]) });
    }
  }
  rows.sort((p, q) => p.dist - q.dist);
  return rows;
}

/** The mean of a feature across its draws — for the table, never for a gate. */
function meanFeat(draws) {
  const out = {};
  for (const k of Object.keys(draws[0])) {
    let s = 0;
    for (const d of draws) s += d[k];
    out[k] = s / draws.length;
  }
  return out;
}

async function distinguishable(page, rel) {
  console.log("\n[soundtest] phase 3 — the read: are these actually different sounds?");
  note(`level is NOT one of the ${AXES.length} axes: the mixer already spends level on distance, so a`);
  note(`sound that is only louder is the same sound closer. "A heavy blow is not a loud light blow."`);

  note(`every event is rendered under ${SEEDS.length} seeds and every pair is taken over all ${SEEDS.length * SEEDS.length}`);
  note(`combinations of those draws. The gate is the WORST draw, because the player hears one.`);

  const raw = await hearing(page, rel, null);
  const missing = Object.entries(raw).filter(([, v]) => v === null).map(([k]) => k);
  check("every event in the profile is voiced by the module at all", missing.length === 0,
    missing.length ? `not voiced: ${missing.join(", ")}` : `${PROFILE.length}/${PROFILE.length} voiced`);

  const feat = featureDraws(raw);

  // The table is the MEAN of each feature across the draws, and the +/- is the
  // full range. A single column of numbers is what made the old verdict look
  // solid; the range is the thing a reader has to be able to see.
  console.log("        event            centroid  flat  attack   decay   <400Hz  >3kHz  shimmer   peak");
  for (const [name, draws] of Object.entries(feat)) {
    const f = meanFeat(draws);
    const rng = (k, d = 0) => {
      const v = draws.map((x) => x[k]);
      return `${Math.min(...v).toFixed(d)}-${Math.max(...v).toFixed(d)}`;
    };
    note(`${name.padEnd(16)} ${f.centroid.toFixed(0).padStart(7)}  ${f.flatness.toFixed(2)}  ${f.attack.toFixed(1).padStart(5)}ms ${f.decay.toFixed(0).padStart(5)}ms  ${f.low.toFixed(2).padStart(5)}  ${f.high.toFixed(2).padStart(5)}    ${f.beat.toFixed(2)}  ${f.peak.toFixed(3)}   [centroid ${rng("centroid")}, attack ${rng("attack", 1)}]`);
  }

  // ---- the blows ----
  const blowRows = pairs(feat, BLOWS.filter((n) => feat[n]));
  const worstBlows = blowRows.filter((r) => r.dist < READ_BAR || r.axis < 1.0);
  for (const r of blowRows.slice(0, 6)) {
    note(`${r.dist < READ_BAR || r.axis < 1.0 ? "TOO CLOSE" : "ok       "} ${r.a} / ${r.b}: ${spreadOf(r)}, worst best-axis ${r.axis.toFixed(2)} (${r.axisName})`);
  }
  check(`a player can read every blow without looking (${READ_BAR} JND apart, ${blowRows.length} pairs)`,
    worstBlows.length === 0,
    (worstBlows.length
      ? `${worstBlows.length} pair(s) too close — worst: ${blowRows[0].a} / ${blowRows[0].b}, `
      : `worst pair ${blowRows[0].a} / ${blowRows[0].b}, `)
      + spreadOf(blowRows[0]) + ` from ${SEEDS.length} seeds`);

  // ---- weight, in the owner's own words ----
  //
  // Stated separately from the pair sweep because it is the requirement, not a
  // consequence of one: a heavy blow that separates only on level would pass
  // every other assertion in this file and is exactly what shipped.
  {
    const rows = [["flesh light", "flesh heavy"], ["mail light", "mail heavy"], ["shield light", "shield heavy"]]
      .filter(([a, b]) => feat[a] && feat[b])
      .map(([a, b]) => ({
        a, b, ...crossPair(feat[a], feat[b]),
        dLevel: dB(meanFeat(feat[b]).rms) - dB(meanFeat(feat[a]).rms),
      }));
    for (const r of rows) {
      note(`${r.dist >= READ_BAR ? "ok  " : "BAD "} ${r.a} -> ${r.b}: ${spreadOf(r)} on timbre and time, and ${r.dLevel >= 0 ? "+" : ""}${r.dLevel.toFixed(1)} dB of level that does not count`);
    }
    check("a heavy blow is not a loud light blow", rows.length > 0 && rows.every((r) => r.dist >= READ_BAR),
      rows.length ? rows.map((r) => `${r.a.split(" ")[0]} ${r.dist.toFixed(2)}`).join(", ") + ` JND on the worst of ${rows[0].n} draws (need ${READ_BAR})` : "no heavy/light pair was voiced");
  }

  // ---- the weapon ----
  {
    const a = feat["axe on mail"], b = feat["seax on mail"];
    const s = a && b ? crossPair(a, b) : null;
    check("an axe and a seax do not share a spectrum, at the moment of impact",
      s !== null && s.dist >= REST_BAR,
      s ? `${spreadOf(s)} on the same target (need ${REST_BAR}), worst best-axis ${s.axis.toFixed(2)} (${s.axisName})`
        : "one of them was not voiced");
  }

  // ---- the parry's signature ----
  //
  // docs/SOUND.md's brief calls the parry the hero sound. A hero sound needs a
  // property nothing else in the game has, or it is just the brightest one — and
  // brightness is a thing the mail already competes for. Beating is that
  // property: two partials a few Hz apart shimmer, and a decay does not.
  //
  // Swept like everything else, and at the WORST end of each side: the parry's
  // quietest shimmer against the loudest shimmer anything else managed on any
  // draw. A hero sound that is only a hero on a good draw is not one.
  {
    const p = feat.parry;
    const pMin = p ? Math.min(...p.map((f) => f.beat)) : null;
    const others = Object.entries(feat).filter(([k]) => k !== "parry")
      .map(([k, draws]) => ({ k, beat: Math.max(...draws.map((f) => f.beat)) }));
    others.sort((x, y) => y.beat - x.beat);
    check("the parry has a signature no other sound in the game has",
      pMin != null && pMin >= 0.35 && pMin >= others[0].beat * 1.6,
      pMin == null ? "parry not voiced"
        : `the parry's WEAKEST shimmer across ${p.length} draws is ${pMin.toFixed(2)}; the strongest shimmer anything else reached on any draw is ${others[0].k} at ${others[0].beat.toFixed(2)}`);
  }

  // ---- and everything else ----
  //
  // ONE EXCLUSION, and it is stated on the verdict line rather than hidden in
  // this comment. A sword, an axe and a seax landing on the same mail are the
  // same EVENT with a parameter, not three events: the player has to identify
  // that he was hit on the mail, and the weapon is colour on top of that. They
  // sit on a continuum, so holding every adjacent pair 1.5 JND apart would force
  // the two ends 3+ apart and turn a sword into a third material. The ENDS of
  // each continuum are gated above, at their own bar, which is where the brief
  // puts the requirement: "an axe and a seax must not share a spectrum".
  {
    const VARIANT = [
      ["mail heavy", "axe on mail"], ["mail heavy", "seax on mail"], ["axe on mail", "seax on mail"],
      ["swing sword", "swing axe"], ["swing sword", "swing seax"], ["swing axe", "swing seax"],
    ].map(([a, b]) => `${a}|${b}`);
    const variant = (r) => VARIANT.includes(`${r.a}|${r.b}`) || VARIANT.includes(`${r.b}|${r.a}`);
    const all = pairs(feat, Object.keys(feat));
    const graded = all.filter((r) => !variant(r));
    const bad = graded.filter((r) => r.dist < REST_BAR || r.axis < 1.0);
    for (const r of bad.slice(0, 6)) note(`TOO CLOSE ${r.a} / ${r.b}: ${spreadOf(r)}, worst best-axis ${r.axis.toFixed(2)} (${r.axisName})`);
    check(`no two events in the whole game are one sound (${REST_BAR} JND, ${graded.length} pairs)`,
      bad.length === 0,
      (bad.length ? `${bad.length} pair(s) — worst: ${graded[0].a} / ${graded[0].b}, `
        : `worst pair ${graded[0].a} / ${graded[0].b}, `)
      + spreadOf(graded[0]) + `, worst best-axis ${graded[0].axis.toFixed(2)}`
      + ` — WITH ${all.length - graded.length} same-event-different-weapon pair(s) excluded, which is a deferral and not a clean sheet`);
  }

  return { raw, feat };
}

// ------------------------------------------------------------------
// PHASE 4 — THE PHONE.
//
// A phone speaker has no low end. Everything this engine spends on weight —
// the 62 Hz tail of a flesh hit, the 56 Hz of a shove, the 48 Hz of a shield
// wall — is simply not reproduced, so the blow that feels heaviest on a desktop
// can be the quietest thing on a phone. That is a design problem and not a
// volume slider, and this is where it stops being an opinion.
//
// `phoneSpeaker()` is a MODEL, calibrated in phase 1 against tones. It says
// what a small speaker cannot reproduce. It does not say what an iPhone sounds
// like, and nothing that runs in this container ever will — see
// docs/MOBILE-AUDIO.md, which exists because that exact conflation shipped.
// ------------------------------------------------------------------

async function phone(page, rel, desktop) {
  console.log("\n[soundtest] phase 4 — the phone: does the weight survive a speaker with no low end?");

  const raw = await hearing(page, rel, "small");
  // Swept like phase 3. `loss` and `level` become the WORST draw of each event,
  // not one of them: a phone that deletes a flesh hit one time in twelve deletes
  // it in the fight the player is actually in.
  const feat = {}, loss = {}, level = {};
  for (const [name, draws] of Object.entries(raw)) {
    if (!draws) continue;
    const per = draws.map((s) => {
      const [a, b] = sounding(s);
      const body = Array.prototype.slice.call(s, a, b);
      const thin = phoneSpeaker(body);
      return { f: features(thin), loss: dB(rms(thin)) - dB(rms(body)) };
    });
    feat[name] = per.map((p) => p.f);
    loss[name] = Math.min(...per.map((p) => p.loss));       // the most the speaker ever took
    level[name] = per.map((p) => dB(p.f.rms));
  }

  for (const name of BLOWS) {
    if (!feat[name]) continue;
    note(`${name.padEnd(16)} loses up to ${loss[name].toFixed(1).padStart(6)} dB through the speaker, leaving ${Math.min(...level[name]).toFixed(1)} to ${Math.max(...level[name]).toFixed(1)} dBFS`);
  }

  // 1. Nothing may be TAKEN AWAY by the speaker, and this gate had to be
  //    rewritten because the first version of it measured the wrong quantity —
  //    the twelfth time on this project, and it was mine.
  //
  //    It gated the spread of ABSOLUTE levels after the filter, which is a
  //    question about mix balance and not about phones: a light graze off mail
  //    is quieter than an opened throat on a desk too, and it should be. What
  //    this phase is actually about is what the SPEAKER removes. The original
  //    defect in those terms: a flesh hit lost 22.1 dB through the speaker and
  //    the parry lost 0.1, so the phone did not get a quieter fight, it got a
  //    fight with the blows deleted and the ringing left in. That is a spread of
  //    LOSS, and it is what is gated here. The old ruler would also have caught
  //    it, by luck; this one catches it for the reason it is wrong.
  {
    const rows = BLOWS.filter((n) => feat[n]).map((n) => ({ n, v: loss[n] }));
    rows.sort((a, b) => a.v - b.v);
    const worst = rows[0], best = rows[rows.length - 1];
    check("the speaker takes the same amount off every blow, so it thins the fight instead of editing it",
      rows.length > 0 && worst.v >= -6 && best.v - worst.v <= 6,
      `worst loss ${worst?.n} ${worst?.v.toFixed(1)} dB, best ${best?.n} ${best?.v.toFixed(1)} dB, spread ${(best?.v - worst?.v).toFixed(1)} dB over ${SEEDS.length} seeds (need each >= -6 and the spread <= 6)`);

    // And the mix balance, stated separately because it is a separate question
    // and it is true on a desk as well. A graze may be quieter than a killing
    // blow; it may not be inaudible under seven other men. Taken across draws:
    // the loudest thing anything ever got against the quietest anything ever
    // got, which is the widest gap a player can actually be handed.
    const names = BLOWS.filter((n) => feat[n]);
    const lo = names.map((n) => ({ n, v: Math.min(...level[n]) })).sort((a, b) => a.v - b.v)[0];
    const hi = names.map((n) => ({ n, v: Math.max(...level[n]) })).sort((a, b) => b.v - a.v)[0];
    const spread = hi.v - lo.v;
    check("the blows sit inside one dynamic range on a phone", spread <= 20,
      `${spread.toFixed(1)} dB from ${hi.n} at its loudest draw down to ${lo.n} at its quietest (need <= 20 dB)`);
  }

  // 2. And the read has to survive it. A phone is allowed to be a harder listen.
  //    It is not allowed to be a different game.
  {
    const rows = pairs(feat, BLOWS.filter((n) => feat[n]));
    const bad = rows.filter((r) => r.dist < 2.0 || r.axis < 1.0);
    for (const r of bad.slice(0, 5)) note(`TOO CLOSE on a phone: ${r.a} / ${r.b}: ${spreadOf(r)}, worst best-axis ${r.axis.toFixed(2)} (${r.axisName})`);
    check("a player can still read every blow through a phone speaker (2.0 JND)",
      bad.length === 0,
      (bad.length ? `${bad.length} pair(s) collapse — worst: ${rows[0].a} / ${rows[0].b}, ` : `worst pair ${rows[0].a} / ${rows[0].b}, `)
        + spreadOf(rows[0]));
  }

  // 3. The engine has to KNOW it is on a phone and do something about it. If the
  //    small-speaker render is byte-identical to the desktop one, the phone is
  //    getting the desktop mix with its bottom octave cut off and nothing put in
  //    its place, which is the state this phase was written to end.
  //
  //    Swept at the OTHER end from every other gate here: a blow counts as
  //    re-voiced only if its NEAREST desk-versus-phone draw still moved, so a
  //    difference that is really just two noise draws cannot be mistaken for the
  //    engine having done something. This is the one gate where the worst case
  //    is the largest number, and it is the same principle either way — take the
  //    draw that most nearly falsifies the claim.
  {
    const changed = [];
    for (const name of BLOWS) {
      if (!raw[name] || !desktop[name]) continue;
      const d = crossPair(desktop[name].map(features), raw[name].map(features));
      if (d.dist > 0.25) changed.push(name);
    }
    check("the engine renders a different mix for a small speaker than for a desk",
      changed.length >= 4,
      changed.length ? `${changed.length}/${BLOWS.length} blows re-voiced for the phone on every draw: ${changed.join(", ")}`
        : "identical render — the phone is getting the desktop mix with its bottom octave missing");
  }
}

// ------------------------------------------------------------------
// PHASE 5 — EIGHT MEN.
//
// A mix that turns to mud in a real fight is a failed mix however good one hit
// sounds alone. Two properties, and neither of them is peak level, which the
// limiter already guarantees and which says nothing about whether the blow that
// matters to ME is the one I hear.
// ------------------------------------------------------------------

/** Energy in a band, over a rendered mix. */
function bandEnergy(x, lo, hi, sampleRate = SR) {
  const { mag, n } = fftMag(Array.prototype.slice.call(x, 0, Math.min(x.length, 65536)));
  let e = 0;
  for (let i = 1; i < mag.length; i++) {
    const f = (i * sampleRate) / n;
    if (f >= lo && f < hi) e += mag[i] * mag[i];
  }
  return e;
}

async function brawl(page, rel) {
  console.log("\n[soundtest] phase 5 — eight men: is the blow that matters to me the one I hear?");

  // ---- the duck ----
  //
  // The claim, and it is one nothing but a real duck can make true: ADDING a
  // sound to the mix makes the REST of the mix quieter. The bed is placed far
  // enough out that the master limiter never engages — both renders are checked
  // against its threshold below — so gain reduction cannot be the explanation.
  const bed = `
    frame(0.016);
    for (let i = 0; i < 8; i++) {
      const p = { x: Math.cos(i * 0.9) * 9, y: 1.4, z: 7 + Math.sin(i * 0.9) * 9 };
      fire({ k: "impact", material: i % 2 ? "shield" : "flesh", damage: 16, position: p, local: false });
    }`;
  // Both renders of a comparison share a seed — the question is what ADDING the
  // parry did, so the bed under it has to be the same bed. The seed then sweeps,
  // and the gated number is the worst of the sweep.
  const LO = [120, 700];
  const LIMIT = Math.pow(10, -7 / 20); // the limiter's threshold, from audio.ts
  const drops = [], peaks = [];
  for (const seed of SEEDS) {
    const alone = await auditRender(page, rel, 1.6, { seed, body: bed });
    const withParry = await auditRender(page, rel, 1.6, { seed, body: `${bed}\n fire({ k: "impact", material: "parry", damage: 0 });` });
    drops.push(dB(Math.sqrt(bandEnergy(withParry.samples, LO[0], LO[1]))) - dB(Math.sqrt(bandEnergy(alone.samples, LO[0], LO[1]))));
    peaks.push(peak(alone.samples), peak(withParry.samples));
  }
  drops.sort((a, b) => b - a);   // worst = the least ducking
  const drop = drops[0];
  note(`bed peaks ${Math.min(...peaks).toFixed(3)}-${Math.max(...peaks).toFixed(3)} across ${SEEDS.length} seeds, limiter threshold ${LIMIT.toFixed(3)}`);
  check("the limiter is not engaged, so anything measured below is the mix and not gain reduction",
    Math.max(...peaks) < LIMIT,
    `loudest of ${peaks.length} renders ${Math.max(...peaks).toFixed(3)} against ${LIMIT.toFixed(3)}`);
  check("my own parry ducks the eight men behind it",
    drop <= -1.5,
    `adding one local parry moved the 120-700 Hz bed by ${drop >= 0 ? "+" : ""}${drop.toFixed(2)} dB on its WEAKEST draw (best ${drops[drops.length - 1].toFixed(2)} dB, ${SEEDS.length} seeds; need <= -1.5 dB, and adding a sound can only RAISE this without a duck)`);

  // ---- the newest blow ----
  //
  // The voice pool refused to steal from a voice of EQUAL priority, so once the
  // pool filled with critical events the next critical event — the one that just
  // happened to the player — was the one dropped. A cap that drops the newest
  // blow is a cap that turns the fight into whatever was already ringing.
  const flood = `
    for (let i = 0; i < 30; i++) fire({ k: "impact", material: "flesh", damage: 20 });`;
  const HI = [2000, 11000];
  const ratios = [];
  for (const seed of SEEDS) {
    const noParry = await auditRender(page, rel, 1.6, { seed, body: flood });
    const lastParry = await auditRender(page, rel, 1.6, { seed, body: `${flood}\n fire({ k: "impact", material: "parry", damage: 0 });` });
    const ring = Math.sqrt(bandEnergy(lastParry.samples, HI[0], HI[1]));
    const none = Math.sqrt(bandEnergy(noParry.samples, HI[0], HI[1]));
    ratios.push(ring / Math.max(none, 1e-9));
  }
  ratios.sort((a, b) => a - b);
  check("a parry arriving into a full voice pool is still heard",
    ratios[0] > 1.5,
    `2-11 kHz ring is ${ratios[0].toFixed(2)}x the same flood without it on its worst draw (best ${ratios[ratios.length - 1].toFixed(2)}x, ${SEEDS.length} seeds; need 1.5x) — a pool that will not steal from an equal priority drops the newest blow, which is mine`);
}

// ------------------------------------------------------------------
// PHASE 6 — THE WIRE'S VOCABULARY.
//
// Every phase above this one grades SYNTHESIS: fire an event at the engine and
// measure what comes out. Not one of them can say whether the event is one the
// game is able to ask for, and that blind spot is precisely what shipped a game
// whose hero sound had never played. The parry was graded on five claims here —
// its envelope window, its place in the material ordering, its shimmer, its duck
// of the whole mix, its survival of a full voice pool — every one of them green,
// and no player had ever heard it, because `GameCanvas` derived blows from a
// health delta and a parry takes nothing off.
//
// This phase closes the half of that hole which lives in the audio module. It
// drives `hit()` — the method the client calls with the server's payload,
// verbatim — with every kind the module DECLARES in `WIRE_HIT_TYPES`, and it
// takes that list off the module rather than keeping its own copy, so a kind the
// module adds and never routes cannot be the one kind nobody graded.
//
// The other half — that the module's list matches the kinds `engine.mjs`
// actually broadcasts, and that `GameCanvas` and `page.tsx` carry the message
// from the socket to this door — is `tools/soundwire.mjs` phase 0, which reads
// all three files off disk. Neither file can prove the claim alone.
// ------------------------------------------------------------------

/**
 * What a kind needs alongside its name for the call to be the call the game
 * makes. Damage and a zone ride the four wounding kinds and nothing else — see
 * docs/WIRE-PROTOCOL.md — so sending them on a parry would be testing a message
 * the server never sends.
 */
const WIRE_EXTRA = {
  light: { damage: 13, zone: "torso" },
  heavy: { damage: 34, zone: "torso" },
  blocked: { damage: 6, zone: "torso" },
  blocked_heavy: { damage: 19, zone: "torso" },
  parry: {},
  shove: {},
  knockdown: {},
};

async function vocabulary(page, rel) {
  console.log("\n[soundtest] phase 6 — the wire's vocabulary: can the game ASK for each of these?");

  const declared = await page.evaluate(async (u) => {
    const m = await import(u);
    return m.WIRE_HIT_TYPES ? [...m.WIRE_HIT_TYPES] : null;
  }, `${ORIGIN}/mod/${rel}`).catch(() => null);

  check("the module declares the wire's hit kinds as a list a harness can read",
    Array.isArray(declared) && declared.length > 0,
    declared ? `WIRE_HIT_TYPES = ${declared.join(", ")}` : "no WIRE_HIT_TYPES export — this phase cannot grade what it cannot enumerate, and a list kept in this file instead would be a list of the kinds I remembered");
  if (!declared) return;

  const unknown = declared.filter((k) => !WIRE_EXTRA[k]);
  check("every kind the module declares has a payload this file drives it with",
    unknown.length === 0,
    unknown.length ? `no payload for: ${unknown.join(", ")}` : `${declared.length} kinds, ${declared.length} driven`);

  // Each kind, swept, through `hit()` and nothing else.
  const raw = {};
  for (const kind of declared) {
    const spec = { k: "wire", type: kind, weapon: "huscarl", ...(WIRE_EXTRA[kind] ?? {}) };
    const draws = [];
    for (const seed of SEEDS) {
      const r = await auditRender(page, rel, 2.2, { seed, body: `if (!fire(${JSON.stringify(spec)})) window.__unvoiced = true;` });
      if (await page.evaluate(() => window.__unvoiced === true)) { draws.length = 0; break; }
      draws.push({ samples: r.samples, voices: r.voices.length });
    }
    raw[kind] = draws.length ? draws : null;
  }

  // 1. Every kind must make a SOUND. Silence and "the module has no such
  //    method" are the same thing to a player, so both fail here.
  {
    const dead = declared.filter((k) => !raw[k] || raw[k].some((d) => peak(d.samples) <= 0 || d.voices === 0));
    for (const k of declared) {
      if (!raw[k]) { note(`DEAD ${k}: hit() does not voice it at all`); continue; }
      const pk = raw[k].map((d) => peak(d.samples));
      note(`${pk.every((v) => v > 0) ? "ok  " : "DEAD"} ${k.padEnd(14)} peak ${Math.min(...pk).toFixed(3)}-${Math.max(...pk).toFixed(3)}, ${raw[k][0].voices} sources`);
    }
    check("every hit kind the wire can carry reaches the mixer as a sound",
      dead.length === 0,
      dead.length ? `SILENT: ${dead.join(", ")} — the game can send these and nobody hears them`
        : `${declared.length}/${declared.length} voiced through hit(), over ${SEEDS.length} seeds each`);
  }

  // 2. And each must reach a DIFFERENT sound. A router that quietly collapses
  //    three kinds onto one voice passes check 1 and tells the player nothing —
  //    which is what `materialFor` did before this round, mapping a shove and a
  //    knockdown onto whatever `damage: 0` happened to select.
  {
    const feat = {};
    for (const [k, draws] of Object.entries(raw)) if (draws) feat[k] = draws.map((d) => features(d.samples));
    const rows = pairs(feat, Object.keys(feat));
    const bad = rows.filter((r) => r.dist < REST_BAR || r.axis < 1.0);
    for (const r of bad.slice(0, 6)) note(`TOO CLOSE ${r.a} / ${r.b}: ${spreadOf(r)}, worst best-axis ${r.axis.toFixed(2)} (${r.axisName})`);
    check(`no two hit kinds arrive as the same sound (${REST_BAR} JND, ${rows.length} pairs)`,
      bad.length === 0 && rows.length > 0,
      rows.length ? (bad.length ? `${bad.length} pair(s) collapse — worst: ${rows[0].a} / ${rows[0].b}, ` : `worst pair ${rows[0].a} / ${rows[0].b}, `) + spreadOf(rows[0])
        : "nothing to compare");
  }

  // 3. THE RIPOSTE. It is not a kind of its own — it is a flag the wire sets on
  //    any of the four wounds, and the engine pays it in damage, knockback and
  //    poise. If the ear is paid nothing, the biggest single blow in the game
  //    arrives sounding like any other and the hardest input in the game has no
  //    reward. Same blow, same seed, flag on and off: it has to move.
  {
    const on = [], off = [];
    for (const seed of SEEDS) {
      const spec = (rip) => ({ k: "wire", type: "heavy", damage: 34, zone: "torso", weapon: "huscarl", riposte: rip });
      const a = await auditRender(page, rel, 2.2, { seed, body: `fire(${JSON.stringify(spec(false))});` });
      const b = await auditRender(page, rel, 2.2, { seed, body: `fire(${JSON.stringify(spec(true))});` });
      off.push(features(a.samples)); on.push(features(b.samples));
    }
    const s = crossPair(off, on);
    check("a riposte does not sound like the same blow thrown for free",
      s.dist >= REST_BAR,
      `${spreadOf(s)} between a heavy wound with the wire's riposte flag and one without (need ${REST_BAR}), worst best-axis ${s.axis.toFixed(2)} (${s.axisName})`);
  }
}

// ------------------------------------------------------------------

async function main() {
  const preinstalled = "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync(preinstalled) ? { executablePath: preinstalled } : {}),
    // Deliberately NOT --autoplay-policy=no-user-gesture-required: the locked
    // context is the thing being tested.
    args: ["--no-sandbox"],
  });
  const ctx = await browser.newContext();
  await ctx.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><meta charset=utf-8><title>soundtest</title>" });
    if (path === "/stub/three") return route.fulfill({ contentType: "text/javascript", body: THREE_STUB });
    if (path.startsWith("/stub")) return route.fulfill({ contentType: "text/javascript", body: "export default {};" });
    if (path.startsWith("/mod/")) {
      const rel = path.slice(5);
      if (!existsSync(abs(rel))) return route.fulfill({ status: 404, body: "no such module" });
      return route.fulfill({ contentType: "text/javascript", body: serveModule(rel) });
    }
    return route.fulfill({ status: 404, body: "not found" });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[page-error] ${e}`));
  await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(PAGE, SEEDS[0]);

  // SOUND_PHASE=3,4 runs a subset. Iteration cost is the reason: the whole file
  // is ~70 page reloads, and E3 says go DOWN the instrument table to iterate and
  // up it for verdicts. A verdict is the whole file with no filter, and the
  // filter is printed on the verdict line so a partial run can never be read as
  // a clean one.
  const only = (process.env.SOUND_PHASE || "").split(",").map((s) => s.trim()).filter(Boolean);
  const wants = (n) => only.length === 0 || only.includes(String(n));

  try {
    if (wants(1)) await calibrate(page);
    const rel = findModule();
    if (rel) {
      if (wants(2)) await audit(page, rel);
      let desk = null;
      if (wants(3)) desk = await distinguishable(page, rel);
      if (wants(4)) {
        // Phase 4 compares the phone render against the desk render, so it needs
        // one even when phase 3 was filtered out.
        const base = desk ?? { raw: await hearing(page, rel, null) };
        await phone(page, rel, base.raw);
      }
      if (wants(5)) await brawl(page, rel);
      if (wants(6)) await vocabulary(page, rel);
    } else {
      console.log("\n[soundtest] phase 2 — audit: SKIPPED, there is no audio module yet.");
      console.log("[soundtest] looked for: " + MODULE_CANDIDATES.join(", "));
      console.log("[soundtest] PENDING — the five claims of docs/SOUND.md are UNPROVEN, not passing.");
      process.exitCode = 2;
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((x) => !x.pass);
  // R4: the deferral rides the verdict line, in the words a person will read.
  const partial = (only.length ? ` — PARTIAL RUN, only phase(s) ${only.join(",")}, which is not a clean sheet` : "")
    // R4 again, and it is the deferral this round exists to end. The pairwise
    // claims are gated on the worst of a SAMPLE of the engine's own randomness,
    // so the sample size is part of the verdict: a sweep of 2 proves close to
    // nothing and must not be readable as a sweep of 12.
    + (SEEDS.length < 12
      ? ` — SWEPT OVER ONLY ${SEEDS.length} SEED(S), which is an iteration run and not a verdict`
      : ` (pairwise claims swept over ${SEEDS.length} seeds, gated on the worst draw)`);
  console.log(`\n[soundtest] ${results.length - failed.length}/${results.length} claims proven${partial}`);
  if (failed.length) {
    console.log("[soundtest] UNPROVEN: " + failed.map((f) => f.name).join(", "));
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error("[soundtest] failed:", e); process.exitCode = 1; });
