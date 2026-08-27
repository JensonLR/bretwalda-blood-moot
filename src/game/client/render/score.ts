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
  const oscs: OscillatorNode[] = [];
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
  const pluck = (ratio: number, when: number, dur: number): void => {
    const f = root * ratio;
    const burst = ac.createBufferSource();
    burst.buffer = noiseBuf;
    const bg = ac.createGain();
    bg.gain.setValueAtTime(0.5, when);
    bg.gain.exponentialRampToValueAtTime(0.001, when + 1 / f + 0.004);
    const delay = ac.createDelay(0.05);
    delay.delayTime.value = 1 / f;
    const fb = ac.createGain();
    fb.gain.value = 0.965;
    const damp = ac.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = Math.min(6500, f * 6);
    const vg = ac.createGain();
    vg.gain.setValueAtTime(1, when);
    vg.gain.setValueAtTime(1, when + Math.max(0.05, dur - 0.25));
    vg.gain.exponentialRampToValueAtTime(0.001, when + dur);
    burst.connect(bg).connect(delay);
    delay.connect(damp).connect(fb).connect(delay);
    delay.connect(vg).connect(lyreGain);
    burst.start(when); burst.stop(when + 0.05);
    // The loop must not ring forever: sever the feedback when the note ends.
    fb.gain.setValueAtTime(0.965, when);
    fb.gain.setValueAtTime(0, when + dur + 0.05);
  };

  let scene: ScoreScene = "off";
  let plan = scorePlan("off", 0);
  let phraseSeed = 0x5eed;
  let stepAt = 0;
  let step = 0;

  const applyPlan = (next: ScorePlan, ramp: number): void => {
    const now = ac.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setTargetAtTime(next.drone > 0 || next.drum > 0 || next.lyre > 0 ? 1 : 0, now, ramp);
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
      for (const o of oscs) { try { o.stop(); } catch { /* stopped */ } }
      bus.disconnect();
    },
  };
}
