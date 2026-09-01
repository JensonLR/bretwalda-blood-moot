// THE FORGED SCORE — backlog 7.8, the owner's ruling: "Forged dynamic score
// (Recommended)" — music synthesized in-engine, extending the law the whole
// audio system lives by ("struck metal and low wood, forged as you play").
// No licensed assets, no samples, nothing downloaded: a drone, a war-drum
// and a lyre, all built from oscillators and noise at play time, swelling
// and thinning with the fight.
//
// TWO HALVES, SPLIT ON PURPOSE. `scorePlan` and the tables are PURE — what
// the music should be doing for a given scene and intensity — and
// `tools/scoretest.mjs` holds them headless: densities monotone in
// intensity, every pitch inside the mode, the stings shaped as claimed. The
// WebAudio binding below renders that plan and is judged the way the rest of
// the engine is: through `adopt()` in an OfflineAudioContext, and by ear.
//
// WHAT THE THREE VOICES ARE, AND WHY THESE THREE:
//
//   the DRONE   two strings' worth of open fifth (D–A), the sound a hurdy or
//               a bowed lyre holds under everything. It is the score's floor
//               and the menu's whole voice.
//   the DRUM    the war-drum pattern. Sparse heartbeat in a lobby, full
//               battle-pulse at blades' reach. A sine thump with a noise
//               snap — the same grammar as the engine's shove drive.
//   the LYRE    a plucked pentatonic-dorian fragment on a Karplus string —
//               the Sutton Hoo instrument, and the one melodic voice. It
//               enters when the fight does and holds its tongue in menus.
//
// D DORIAN, and pentatonic within it (D F G A C): every fragment the lyre
// draws and both stings live inside one mode, so an hour of play never
// sounds a wrong note against the drone's open fifth.

// ---------------------------------------------------------------------------
// The pure half
// ---------------------------------------------------------------------------

export type ScoreScene = "off" | "menu" | "lobby" | "muster" | "fight" | "victory" | "defeat";

/** D dorian pentatonic, as ratios over the drone root. One octave. */
export const MODE_RATIOS: readonly number[] = [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5];

/** The drone root. D2 in the full mix; the binding lifts it for small speakers. */
export const ROOT_HZ = 73.416;

/**
 * A Web Audio render quantum, in samples. A DelayNode inside a feedback cycle
 * cannot be shorter than this, whatever it is set to — see `pluck`.
 */
export const RENDER_QUANTUM = 128;

/**
 * The lyre string's feedback, and the damping filter's Q IN DECIBELS.
 *
 * These two multiply, and their product is the loop gain: over 1 and the string
 * is an oscillator rather than a string. Exported so `tools/soundtest.mjs` can
 * gate the product instead of trusting that nobody edits one of them alone.
 * -3 dB is linear Q 0.707, the maximally flat lowpass, whose peak gain is 1.0.
 */
export const LYRE_FEEDBACK = 0.94;
export const LYRE_DAMP_Q = -3;

/**
 * The drum patterns, one bar of 8 steps each, by density rung. `1` is a full
 * stroke, `0.5` a ghost, `0` silence. Rung 0 is the lobby heartbeat; rung 3
 * is the battle pulse. The SHAPE stays related across rungs — each adds
 * strokes to the last rather than swapping grammars — so intensity rising
 * reads as the same drummer leaning in.
 */
export const DRUM_PATTERNS: readonly (readonly number[])[] = [
  [1, 0, 0, 0, 0.5, 0, 0, 0],
  [1, 0, 0, 0.5, 1, 0, 0, 0],
  [1, 0, 0.5, 0.5, 1, 0, 0.5, 0],
  [1, 0.5, 0.5, 1, 1, 0.5, 0.5, 1],
];

export interface ScorePlan {
  /** 0..1 gain for the drone bed. */
  drone: number;
  /** Lowpass cutoff for the drone, Hz — brighter as the fight rises. */
  droneCut: number;
  /** Beats per minute for the drum clock. 0 stops the drum. */
  bpm: number;
  /** Which `DRUM_PATTERNS` rung plays. */
  drumRung: number;
  /** 0..1 gain for drum strokes. */
  drum: number;
  /** Chance per bar that the lyre speaks a fragment. 0 keeps it silent. */
  lyre: number;
  /** One-shot sting on entering the scene: nothing, a rise, or a fall. */
  sting: "none" | "rise" | "fall";
}

/**
 * What the score should be doing. Pure — same inputs, same answer — and the
 * whole musical judgement of the feature lives here where a gate can hold it.
 */
export function scorePlan(scene: ScoreScene, intensity: number): ScorePlan {
  const t = Math.min(1, Math.max(0, intensity));
  switch (scene) {
    case "off":
      return { drone: 0, droneCut: 200, bpm: 0, drumRung: 0, drum: 0, lyre: 0, sting: "none" };
    case "menu":
      // The hall: the drone alone, low, with the rare lyre phrase. A menu is
      // not a fight and must not pulse like one.
      return { drone: 0.16, droneCut: 320, bpm: 0, drumRung: 0, drum: 0, lyre: 0.10, sting: "none" };
    case "lobby":
      return { drone: 0.20, droneCut: 380, bpm: 84, drumRung: 0, drum: 0.28, lyre: 0.16, sting: "none" };
    case "muster":
      // The bell is coming: the heartbeat firms, nothing else moves.
      return { drone: 0.24, droneCut: 430, bpm: 92, drumRung: 1, drum: 0.40, lyre: 0, sting: "none" };
    case "fight":
      return {
        drone: 0.22 + 0.14 * t,
        droneCut: 420 + 900 * t,
        bpm: 96 + 28 * t,
        drumRung: t < 0.25 ? 1 : t < 0.6 ? 2 : 3,
        drum: 0.34 + 0.30 * t,
        lyre: 0.12 + 0.18 * t,
        sting: "none",
      };
    case "victory":
      return { drone: 0.24, droneCut: 900, bpm: 0, drumRung: 0, drum: 0, lyre: 0.5, sting: "rise" };
    case "defeat":
      return { drone: 0.18, droneCut: 260, bpm: 0, drumRung: 0, drum: 0, lyre: 0, sting: "fall" };
  }
}

/**
 * A lyre fragment: 3-5 steps through the mode, seeded, ending on the root or
 * fifth so every phrase resolves against the drone. Returned as ratio
 * multipliers over `ROOT_HZ` (lyre plays two octaves up).
 */
export function lyrePhrase(seed: number): number[] {
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);
  const len = 3 + Math.floor(rnd() * 3);
  const out: number[] = [];
  let idx = Math.floor(rnd() * MODE_RATIOS.length);
  for (let i = 0; i < len - 1; i++) {
    out.push(MODE_RATIOS[idx] * 4);
    idx = Math.max(0, Math.min(MODE_RATIOS.length - 1, idx + (rnd() < 0.5 ? -1 : 1)));
  }
  out.push((rnd() < 0.6 ? MODE_RATIOS[0] : MODE_RATIOS[3]) * 4);
  return out;
}

/** The stings, as (ratio, at-seconds, seconds) rows. Pure, for the gate. */
export function stingNotes(kind: "rise" | "fall"): Array<{ ratio: number; at: number; dur: number }> {
  if (kind === "rise") {
    // D–G–A–D': the mode's own rise, ending an octave up.
    return [
      { ratio: 2, at: 0, dur: 0.55 },
      { ratio: 8 / 3, at: 0.22, dur: 0.55 },
      { ratio: 3, at: 0.44, dur: 0.6 },
      { ratio: 4, at: 0.72, dur: 1.4 },
    ];
  }
  // The fall: A–F–D, down into the drone.
  return [
    { ratio: 3, at: 0, dur: 0.7 },
    { ratio: 12 / 5, at: 0.38, dur: 0.7 },
    { ratio: 2, at: 0.76, dur: 1.6 },
  ];
}

// ---------------------------------------------------------------------------
// The binding
// ---------------------------------------------------------------------------

export interface ScoreHandle {
  set(scene: ScoreScene, intensity: number): void;
  update(dt: number): void;
  dispose(): void;
}

/**
 * Renders the plan. `out` is the engine's master-side music gain — the score
 * deliberately does NOT pass through the combat duck: music that flinched
 * every time a far blow landed would read as a broken mixer.
 *
 * `small` follows the engine's speaker law: a phone cannot move D2, so the
 * drone and the drum fundamentals are lifted an octave and the weight is
 * carried by what the speaker can actually reproduce.
 */
export function createScore(ac: BaseAudioContext, out: GainNode, small: boolean): ScoreHandle {
  const root = ROOT_HZ * (small ? 2 : 1);
  const bus = ac.createGain();
  bus.gain.value = 0;
  bus.connect(out);

  // ---- the drone: an open fifth through one lowpass ----
  const droneGain = ac.createGain();
  droneGain.gain.value = 0;
  const droneCut = ac.createBiquadFilter();
  droneCut.type = "lowpass";
  droneCut.frequency.value = 320;
  droneCut.Q.value = 0.4;
  droneGain.connect(droneCut).connect(bus);
  // The oscillators run ONLY while the score is audible. Not thrift theatre:
  // a silent-by-gain drone is still four live source nodes — soundtest's
  // node-budget audit counts them, and a phone's battery pays for them in
  // every menu with the music down. Oscillators are one-shot after stop(),
  // so the drone is rebuilt on demand; four saws cost nothing to mint.
  let oscs: OscillatorNode[] = [];
  const ensureDrone = (): void => {
    if (oscs.length) return;
    for (const [ratio, detune] of [[1, -4], [1, 4], [1.5, -3], [1.5, 3]] as const) {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = root * ratio;
      o.detune.value = detune;
      const g = ac.createGain();
      g.gain.value = ratio === 1 ? 0.30 : 0.20;
      o.connect(g).connect(droneGain);
      o.start();
      oscs.push(o);
    }
  };
  const stopDrone = (): void => {
    for (const o of oscs) { try { o.stop(); } catch { /* stopped */ } o.disconnect(); }
    oscs = [];
  };

  // ---- the drum voice ----
  const drumGain = ac.createGain();
  drumGain.gain.value = 0.5;
  drumGain.connect(bus);
  const thump = (when: number, weight: number): void => {
    const f0 = small ? 190 : 130;
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(small ? 88 : 52, when + 0.16);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.9 * weight, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.28);
    o.connect(g).connect(drumGain);
    o.start(when); o.stop(when + 0.3);
    // The skin's snap: a breath of noise on the full strokes only.
    if (weight > 0.7) {
      const n = ac.createBufferSource();
      n.buffer = noiseBuf;
      const ng = ac.createGain();
      ng.gain.setValueAtTime(0.16 * weight, when);
      ng.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
      const hp = ac.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 900;
      n.connect(hp).connect(ng).connect(drumGain);
      n.start(when); n.stop(when + 0.06);
    }
  };

  // One second of noise, shared by every snap and pluck.
  const noiseBuf = (() => {
    const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  })();

  // ---- the lyre: a pluck into a tuned feedback delay ----
  const lyreGain = ac.createGain();
  lyreGain.gain.value = 0.32;
  lyreGain.connect(bus);
  /**
   * THE LOOP GAIN MUST BE UNDER ONE, AND IT WAS NOT. Reported by the owner as
   * "an awful sound playing randomly during matches ... sounds like an
   * industrial beeping", and that is exactly what this was.
   *
   * A Karplus-Strong string is a delay fed back through a damping filter, and
   * it decays only while `fb.gain * |H_damp|` stays under 1 at every frequency.
   * `damp.Q` was never set, so it took the Web Audio default of 1 — and a
   * BiquadFilter's Q for `lowpass` is read in DECIBELS, so 1 is +1 dB of
   * RESONANCE, not a flat response. Measured with `getFrequencyResponse`, that
   * puts the filter's peak at |H| = 1.2533, and 0.965 * 1.2533 = 1.209. The
   * loop did not ring, it OSCILLATED, and it grew until the note ended.
   *
   * Rendered offline, one note, 0.7 s, peak sample amplitude against the 1.0
   * the mix expects — and the growth of the envelope from 50 ms to 320 ms:
   *
   *     written Hz   as it shipped              with this fix
   *      73.4        0.31      +18.6 dB          0.136   -10.5 dB
   *     146.8       17.1       +36.9 dB          0.144   -16.8 dB
   *     220.2      491         +51.6 dB          0.145   -19.5 dB
   *     293.7    19080         +61.8 dB          0.101   -22.8 dB
   *
   * Nineteen thousand is about 86 dB over full scale. It arrived at the master
   * limiter and the soft clipper as a hard-clipped square, at the loudest level
   * the graph can physically emit, holding the whole rest of the mix down under
   * it for the limiter's release — and NOT at the written pitch: the runaway
   * locks to whichever comb partial sits nearest the damping filter's own
   * resonance, so a written 293.7 Hz was heard at about 1290 Hz.
   *
   * `plan.lyre` in a fight is 0.12 + 0.18 * intensity per bar, so it fired every
   * six to twenty seconds at random, and the victory and defeat stings run
   * through this same function, so it also fired at the end of every match.
   *
   * TWO NUMBERS FIX IT, and the drone eight lines up already had the first one
   * right (`droneCut.Q.value = 0.4`):
   *
   *   * Q at -3 dB is linear Q = 0.707, the maximally flat lowpass, whose peak
   *     gain is exactly 1.0 — measured, not assumed.
   *   * and the feedback comes down to 0.94 so the loop has real margin rather
   *     than sitting on the boundary. It also makes the string decay inside its
   *     own note (about 680 ms to -40 dB at 110 Hz, against a fight note of
   *     630-810 ms) instead of being chopped off by the severing gain below.
   *
   * AND THE DELAY MUST CLEAR A RENDER QUANTUM. A DelayNode inside a cycle is
   * clamped to at least one render quantum — 128 samples, 2.67 ms at 48 kHz and
   * 2.90 ms at 44.1 kHz. `1 / f` is under that for anything above about 375 Hz,
   * which is the top of the small-speaker range and every note of both stings
   * on a phone: they all played at the SAME wrong pitch, whatever was written.
   * Taking the smallest whole number of periods that clears the quantum keeps f
   * a resonance of the comb, so the note is the note on every sample rate.
   */
  const pluck = (ratio: number, when: number, dur: number): void => {
    const f = root * ratio;
    const burst = ac.createBufferSource();
    burst.buffer = noiseBuf;
    const bg = ac.createGain();
    bg.gain.setValueAtTime(0.5, when);
    bg.gain.exponentialRampToValueAtTime(0.001, when + 1 / f + 0.004);
    const delay = ac.createDelay(0.05);
    const period = 1 / f;
    delay.delayTime.value = Math.ceil((RENDER_QUANTUM / ac.sampleRate + 1e-6) / period) * period;
    const fb = ac.createGain();
    fb.gain.value = LYRE_FEEDBACK;
    const damp = ac.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = Math.min(6500, f * 6);
    damp.Q.value = LYRE_DAMP_Q;
    const vg = ac.createGain();
    vg.gain.setValueAtTime(1, when);
    vg.gain.setValueAtTime(1, when + Math.max(0.05, dur - 0.25));
    vg.gain.exponentialRampToValueAtTime(0.001, when + dur);
    burst.connect(bg).connect(delay);
    delay.connect(damp).connect(fb).connect(delay);
    delay.connect(vg).connect(lyreGain);
    burst.start(when); burst.stop(when + 0.05);
    // The loop must not ring forever: sever the feedback when the note ends.
    fb.gain.setValueAtTime(LYRE_FEEDBACK, when);
    fb.gain.setValueAtTime(0, when + dur + 0.05);
  };

  let scene: ScoreScene = "off";
  let plan = scorePlan("off", 0);
  let phraseSeed = 0x5eed;
  let stepAt = 0;
  let step = 0;

  let droneStopTimer: ReturnType<typeof setTimeout> | null = null;
  const applyPlan = (next: ScorePlan, ramp: number): void => {
    const now = ac.currentTime;
    const audible = next.drone > 0 || next.drum > 0 || next.lyre > 0;
    if (audible && next.drone > 0) {
      if (droneStopTimer) { clearTimeout(droneStopTimer); droneStopTimer = null; }
      ensureDrone();
    } else if (oscs.length && !droneStopTimer) {
      // Fade first, stop after: killing the sources at the gain's own ramp
      // length keeps the tail clean and returns the nodes to the budget.
      droneStopTimer = setTimeout(() => { droneStopTimer = null; stopDrone(); }, ramp * 4000 + 300);
    }
    bus.gain.cancelScheduledValues(now);
    bus.gain.setTargetAtTime(audible ? 1 : 0, now, ramp);
    droneGain.gain.setTargetAtTime(next.drone, now, ramp);
    droneCut.frequency.setTargetAtTime(next.droneCut, now, ramp * 2);
    plan = next;
  };

  return {
    set(nextScene, intensity) {
      const next = scorePlan(nextScene, intensity);
      const changedScene = nextScene !== scene;
      scene = nextScene;
      // Scene changes ramp in over a breath; intensity inside a scene glides.
      applyPlan(next, changedScene ? 0.8 : 0.25);
      if (changedScene && next.sting !== "none") {
        const at = ac.currentTime + 0.05;
        for (const n of stingNotes(next.sting)) pluck(n.ratio, at + n.at, n.dur);
      }
      if (changedScene) { step = 0; stepAt = ac.currentTime + 0.2; }
    },
    update() {
      if (plan.bpm <= 0 || plan.drum <= 0) return;
      const now = ac.currentTime;
      const spb = 60 / plan.bpm / 2; // eighth-note steps
      // Schedule up to a quarter second ahead — enough that a ragged rAF
      // never starves the pattern, short enough that intensity changes bite.
      while (stepAt < now + 0.25) {
        const pat = DRUM_PATTERNS[plan.drumRung] ?? DRUM_PATTERNS[0];
        const w = pat[step % pat.length];
        if (w > 0) thump(Math.max(stepAt, now), w * plan.drum);
        // The bar line is where the lyre considers speaking.
        if (step % pat.length === 0 && plan.lyre > 0) {
          phraseSeed = (phraseSeed * 1664525 + 1013904223) >>> 0;
          if ((phraseSeed / 0xffffffff) < plan.lyre) {
            const notes = lyrePhrase(phraseSeed);
            notes.forEach((ratio, i) => pluck(ratio, Math.max(stepAt, now) + i * spb * 1.5, spb * 2.6));
          }
        }
        stepAt += spb;
        step++;
      }
    },
    dispose() {
      if (droneStopTimer) { clearTimeout(droneStopTimer); droneStopTimer = null; }
      stopDrone();
      bus.disconnect();
    },
  };
}
