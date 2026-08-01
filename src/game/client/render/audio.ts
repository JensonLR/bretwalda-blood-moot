// The game's ear. Everything here is SYNTHESISED at runtime — there is not one
// byte of sampled audio in this file and there must never be one, for the same
// reason `textures.ts` draws its own wood: the product is a link dropped in a
// group chat that plays instantly, and a melee sample pack is 200 KB–2 MB of
// download standing between the tap and the fight. See `docs/SOUND.md`.
//
// The other half of that constraint is the half that makes it good. A
// synthesised impact can be parameterised by the thing that caused it, and this
// game already knows the thing that caused it: reach and swing arc are
// per-weapon on the server, `hitType` and `hitZone` come down the wire on every
// blow, and `burning` / `burnTimer` / `burnInside` say who is alight. So none of
// what follows is a lookup table of names — a Dane axe and a pair of seaxes
// sound different because the numbers that describe them are different.
//
// Three rules hold this file together, and each is a trap that has shipped
// broken audio before:
//
//  1. **No AudioContext exists until a real user gesture.** Not at import, not
//     at `createAudio`. A context constructed outside a gesture is created
//     `suspended` on iOS and Chrome and never recovers, and every later sound
//     silently does nothing — it works on a desktop and is mute on every phone.
//     `armUnlock()` below listens for the first deliberate tap and builds the
//     graph inside that handler. Before then every call here is a no-op that
//     emits nothing at all.
//  2. **Voices are pooled and capped by tier**, exactly as particles are in
//     `quality.ts`, and the master bus ends in a limiter and a soft clip. Eight
//     simultaneous deaths must not clip. Bursts past the cap are dropped or
//     steal a quieter voice — never queued, because a death that arrives late
//     is a lie about when the man fell.
//  3. **Nothing is carried in sound alone.** Every event this module voices is
//     already on screen — the wound, the flames, the aura, the damage number.
//     Players are deaf, muted, or on a bus, and the wiring in `GameCanvas.tsx`
//     deliberately calls into here from beside the `vfx` call that draws the
//     same moment, so the two cannot drift apart.

import { FIRE, type WarriorClass, type HitZone, type DeathCause } from "../../types";
import type { FrameContext, QualitySettings, QualityTier } from "./quality";

// ---------------------------------------------------------------- vocabulary

export interface AudioVec3 { x: number; y: number; z: number }

/**
 * What the blade actually met. These are four different events and a player has
 * to tell them apart without looking, so they are separated on the one axis a
 * phone speaker still reproduces: spectral centroid. Flesh sits lowest, then the
 * wooden shield, then the mail, then the parry's bright ring on top.
 */
export type ImpactMaterial = "flesh" | "shield" | "mail" | "parry";

/**
 * The interface's nine words. They are one instrument played nine ways — see
 * `strike()` — because a screen whose buttons each have their own sound is a
 * screen with no voice at all.
 */
export type UiSound =
  | "tap" | "confirm" | "back" | "purchase" | "refusal"
  | "countdown" | "roundWon" | "roundLost" | "matchWon";

/** The server's `hit` message `type` field, verbatim. */
export type WireHitType = "light" | "heavy" | "blocked" | "blocked_heavy" | "parry";

/** Common to every one-shot: where it happened, and whether it happened to us. */
export interface AudioEvent {
  /** World position. Omitted means "on the camera" — no pan, no attenuation. */
  position?: AudioVec3;
  /** The local warrior's own event: never dropped by the budget, never panned away. */
  local?: boolean;
}

export interface SwingEvent extends AudioEvent {
  warriorClass: WarriorClass;
  /** Heavy attacks are slower and move more air. Derived from `attackTimer`. */
  heavy?: boolean;
}

export interface ImpactEvent extends AudioEvent {
  material: ImpactMaterial;
  /** Drives the body of the hit, not its material. 0 for a parry. */
  damage?: number;
  heavy?: boolean;
  /** Where it landed, when the wire says. Only used to tilt the timbre. */
  zone?: HitZone;
}

export interface DeathEvent extends AudioEvent {
  /** "fire" takes nothing off and gets no bone in it. */
  cause?: DeathCause | null;
}

export interface SeverEvent extends AudioEvent {
  zone?: HitZone;
  /** `1` for a limb, `~1.55` for a body opened at the waist. Matches vfx. */
  power?: number;
}

export interface FootfallEvent extends AudioEvent {
  /** Terrain height in metres under the foot; the bank is drier than the ditch. */
  ground?: number;
  /** Sprinting lands harder than walking. 0..1. */
  weight?: number;
}

export interface AudioHandle {
  /** True once a gesture has built the graph and the context is running. */
  readonly ready: boolean;
  readonly muted: boolean;
  /** Live voices this instant. Never exceeds the tier budget. */
  readonly voices: number;
  /** Voice ceiling for the current tier, for a harness or a debug overlay. */
  readonly voiceBudget: number;

  /**
   * Build and start the audio graph. MUST be called from inside a real user
   * gesture — the button that enters a match is the obvious one. Safe to call
   * again; it resolves `true` once the context is running. The module also arms
   * its own window-level listeners at import, so a screen that forgets to call
   * this still gets sound on the player's next tap rather than silence.
   */
  unlock(): Promise<boolean>;
  setMuted(muted: boolean): void;
  /** 0..1 over the whole mix. Persisted alongside the mute. */
  setMasterVolume(v: number): void;
  readonly masterVolume: number;
  setQuality(q: QualitySettings): void;

  // ---- combat ----
  swing(e: SwingEvent): void;
  impact(e: ImpactEvent): void;
  /** A shield taking a blow it was raised for, or being raised. */
  block(e: AudioEvent & { raise?: boolean }): void;
  dodge(e: AudioEvent): void;
  footfall(e: FootfallEvent): void;
  death(e: DeathEvent): void;
  /** A limb off. The moment the whole gore pass was built for. */
  sever(e: SeverEvent): void;
  ability(e: AudioEvent & { warriorClass: WarriorClass }): void;

  // ---- screens ----
  /**
   * One of the nine interface sounds. Never spatialised and never dropped for
   * distance: a menu has no world position and the player pressed it himself.
   */
  ui(kind: UiSound): void;

  /**
   * Straight off the server's `hit` payload, so a caller that has the real
   * message never has to guess the material. Equivalent to `impact()` with
   * `materialFor()` applied.
   */
  hit(e: AudioEvent & { type: WireHitType; damage?: number; hitZone?: HitZone | null }): void;

  // ---- continuous ----
  /** The arena's hero fire. Pass `null` to take it away. */
  setBonfire(position: AudioVec3 | null): void;
  /**
   * A man alight, straight off the wire, with the same contract as
   * `vfx.setBurning`: call it every frame for every player, alight or not, and
   * a burner that stops being mentioned goes out on its own.
   */
  setBurning(id: string, burning: boolean, timer: number, inside: boolean, position: AudioVec3): void;

  update(dt: number, ctx: FrameContext): void;
  /** Stops every sound and releases the fires. Keeps the context: browsers cap them. */
  dispose(): void;
}

// ------------------------------------------------------------------- budgets
//
// Same discipline as the particle budgets, and budgeted by the same tiers. Low
// thins the VOICE COUNT, never the feedback that tells a player what just hit
// him: an impact on the local warrior is priority `CRITICAL` on every tier and
// is never the thing that gets dropped.

interface AudioBudget {
  /** Hard ceiling on simultaneous one-shots. */
  voices: number;
  /** Fire crackle grains per second, across every fire in the arena. */
  grains: number;
  /** Continuous fire beds. The bonfire holds one; burning men share the rest. */
  fires: number;
  /** Beyond this many metres a one-shot is not worth a voice. */
  earshot: number;
}

export const AUDIO_BUDGET: Record<QualityTier, AudioBudget> = {
  high: { voices: 24, grains: 11, fires: 6, earshot: 38 },
  medium: { voices: 16, grains: 7, fires: 4, earshot: 32 },
  low: { voices: 10, grains: 4, fires: 2, earshot: 26 },
};

const PRIORITY = { AMBIENT: 0, NORMAL: 1, IMPORTANT: 2, CRITICAL: 3 } as const;

// ------------------------------------------------------------------ weapons
//
// Mirrored from `engine.mjs`, which is the authority — the same standing hazard
// as `WARRIOR_STATS` and `FIRE` in `types.ts`: two copies that must agree.
// Re-measure here when a builder in `characters.ts` is re-cut.
//
// Reach is how far past the fist the steel goes; arc is how much of the front
// one swing crosses. Between them they are the whole physical description of the
// weapon, so the whoosh is derived from them rather than from the class name —
// which is why twin daggers and a Dane axe cannot share a sound even if someone
// adds a fifth class and forgets this file.

const WEAPON_REACH: Record<WarriorClass, number> = {
  huscarl: 1.055,   // sword
  warden: 1.44,     // spear
  runekeeper: 0.50, // twin seaxes
  berserker: 1.00,  // Dane axe
};

const SWING_ARC: Record<WarriorClass, number> = {
  huscarl: Math.PI * 0.50,
  warden: Math.PI * 0.38,
  runekeeper: Math.PI * 0.60,
  berserker: Math.PI * 0.58,
};

interface WeaponVoice {
  /** Where the whoosh starts, in Hz. Long steel starts lower. */
  hi: number;
  /** Where it ends. The sweep down is the blade passing. */
  lo: number;
  seconds: number;
  gain: number;
  /** Narrow band = a focused thrust; wide = an airy sweep. */
  q: number;
}

function weaponVoice(cls: WarriorClass, heavy: boolean): WeaponVoice {
  const reach = WEAPON_REACH[cls] ?? WEAPON_REACH.huscarl;
  const arc = SWING_ARC[cls] ?? SWING_ARC.huscarl;
  // 0 at the seax, 1 at the spear.
  const mass = clamp((reach - 0.50) / 0.94, 0, 1);
  // 0 at the spear's line, 1 at the runekeeper's width.
  const sweep = clamp((arc - Math.PI * 0.38) / (Math.PI * 0.22), 0, 1);
  const h = heavy ? 1 : 0;
  return {
    hi: 3100 - 1550 * mass - 200 * h,
    lo: 940 - 470 * mass - 90 * h,
    seconds: 0.10 + 0.15 * mass + 0.05 * sweep + 0.05 * h,
    gain: (0.15 + 0.17 * mass) * (heavy ? 1.28 : 1),
    q: 0.8 + 1.9 * (1 - sweep),
  };
}

/**
 * The server's `hitType` and `hitZone` turned into a material. Exported because
 * anything holding a raw `hit` message should map it the same way this does.
 *
 * Zones follow the kit a warrior is actually wearing: the trunk and the upper
 * arms are under mail, the helm counts as mail, the neck and the legs are open.
 * A blow with no zone on it — the wire only carries one once a man is down — is
 * decided by how much it took off, which is the data we do have: a graze turned
 * by armour, or the blow that found the gap.
 */
export function materialFor(type: WireHitType, zone?: HitZone | null, damage = 0): ImpactMaterial {
  if (type === "parry") return "parry";
  if (type === "blocked" || type === "blocked_heavy") return "shield";
  const armoured: HitZone[] = ["torso", "waist", "armL", "armR", "head"];
  if (zone) return armoured.includes(zone) ? "mail" : "flesh";
  return damage >= 22 ? "flesh" : "mail";
}

// ------------------------------------------------------------- the interface
//
// The palette the nine screen sounds are drawn from, kept together here so it
// can be re-tuned as a set. `strike()` in the engine is the instrument; this is
// the music.

/**
 * Free-bar modes. A bar clamped nowhere rings at these ratios, and they are
 * NOT harmonics — the ear reads the inharmonicity as struck metal. Flatten
 * these to 1/2/3 and the whole interface turns into a cheap synth beep.
 */
const BAR_MODES: readonly (readonly [number, number])[] = [[1, 0.5], [2.76, 0.22], [5.4, 0.08]];

/** D3. Every note the interface plays is a degree of one mode on this root. */
const UI_ROOT = 146.83;

/** The mode. Minor third and flat seventh: this game is not a cheerful one. */
const D = {
  low: 0.5, i: 1, ii: 1.125, III: 1.2, IV: 4 / 3, V: 1.5, VI: 1.6, VII: 16 / 9, i8: 2, V8: 3,
} as const;

interface UiNote { at: number; degree: number; gain: number; decay: number; wood: number }
interface UiScore {
  notes: readonly UiNote[];
  /** A sustained low note under the big moments. Not struck; the hall answering. */
  drone?: { degree: number; gain: number; decay: number };
  gain: number;
  priority: number;
}

const n = (at: number, degree: number, gain: number, decay: number, wood: number): UiNote =>
  ({ at, degree, gain, decay, wood });

/**
 * Nine sounds, one instrument, one mode. Read down the column: the answer to a
 * tap is a single blow; anything that CHANGED something gets two notes; the
 * three verdicts get a phrase and a drone. Nothing here is longer than the
 * moment it describes — the whole set is measured against these windows in
 * `soundtest`.
 */
const UI_SCORE: Record<UiSound, UiScore> = {
  // A finger on gilt. The quietest thing in the game, and the most frequent.
  tap: { gain: 1, priority: PRIORITY.IMPORTANT, notes: [n(0, D.i8, 0.16, 0.1, 0.6)] },
  // Two notes rising: something was accepted.
  confirm: {
    gain: 1, priority: PRIORITY.IMPORTANT,
    notes: [n(0, D.i, 0.2, 0.22, 0.9), n(0.075, D.V, 0.17, 0.3, 0.35)],
  },
  // The same two, falling and damped. The way out of a screen.
  back: {
    gain: 1, priority: PRIORITY.IMPORTANT,
    notes: [n(0, D.V, 0.14, 0.16, 0.5), n(0.07, D.i, 0.15, 0.22, 1)],
  },
  // Gold changing hands: three rising, the last an octave up and left to ring.
  purchase: {
    gain: 1, priority: PRIORITY.IMPORTANT,
    notes: [n(0, D.i, 0.17, 0.24, 0.9), n(0.08, D.V, 0.16, 0.3, 0.5), n(0.17, D.i8, 0.18, 0.55, 0.45)],
  },
  // No. A flat second against the root, struck on wood and stopped dead — the
  // only dissonance in the set, so a refusal cannot be mistaken for anything.
  refusal: {
    gain: 1, priority: PRIORITY.IMPORTANT,
    notes: [n(0, D.i, 0.19, 0.14, 1.2), n(0.012, D.ii, 0.15, 0.13, 0.7)],
  },
  // One bright blow per second before the fight. Tight, so it does not smear
  // into the next one.
  countdown: { gain: 1, priority: PRIORITY.IMPORTANT, notes: [n(0, D.V8, 0.16, 0.17, 0.2)] },
  // A round taken: a rising fifth and the octave over it.
  roundWon: {
    gain: 1, priority: PRIORITY.CRITICAL,
    notes: [n(0, D.i, 0.19, 0.3, 0.8), n(0.1, D.V, 0.18, 0.38, 0.3), n(0.2, D.i8, 0.19, 0.6, 0)],
    drone: { degree: D.low, gain: 0.1, decay: 0.7 },
  },
  // A round lost. The same shape inverted and dropped onto the minor third.
  roundLost: {
    gain: 1, priority: PRIORITY.CRITICAL,
    notes: [n(0, D.V, 0.16, 0.28, 0.5), n(0.12, D.III, 0.16, 0.36, 0.5), n(0.26, D.i, 0.17, 0.6, 0.5)],
    drone: { degree: D.low, gain: 0.07, decay: 0.8 },
  },
  // The match. Everything the family has, and the only sound in the game
  // allowed to ring for a second and a half.
  matchWon: {
    gain: 1, priority: PRIORITY.CRITICAL,
    notes: [
      n(0, D.i, 0.2, 0.34, 1), n(0.09, D.V, 0.18, 0.4, 0.4),
      n(0.19, D.i8, 0.19, 0.55, 0.2), n(0.32, D.V8, 0.16, 0.9, 0),
    ],
    drone: { degree: D.low, gain: 0.12, decay: 1.25 },
  },
};

// ------------------------------------------------------------------- helpers

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Four scratch vectors' worth of arithmetic, written out rather than imported.
 *
 * This file used `THREE.Vector3` for the camera basis, which meant the audio
 * engine pulled the whole renderer in behind it — and the landing screen loads
 * `three` only through a dynamic import precisely so a link dropped in a group
 * chat opens instantly. Audio has no business depending on the renderer, and
 * this is the entire dependency it had.
 */
class Vec3 {
  x = 0; y = 0; z = 0;
  set(x: number, y: number, z: number): this { this.x = x; this.y = y; this.z = z; return this; }
  sub(v: Vec3): this { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  dot(v: Vec3): number { return this.x * v.x + this.y * v.y + this.z * v.z; }
  length(): number { return Math.hypot(this.x, this.y, this.z); }
  normalize(): this { const l = this.length() || 1; return this.set(this.x / l, this.y / l, this.z / l); }
}

/** An exponential ramp cannot touch zero; this is the floor every envelope uses. */
const SILENCE = 0.0001;

function envelope(g: AudioParam, t: number, peak: number, attack: number, decay: number): void {
  const p = Math.max(peak, SILENCE * 2);
  g.setValueAtTime(SILENCE, t);
  g.exponentialRampToValueAtTime(p, t + attack);
  g.exponentialRampToValueAtTime(SILENCE, t + attack + decay);
  g.setValueAtTime(0, t + attack + decay + 0.001);
}

interface Spatial { pan: number; gain: number; cutoff: number }
const HERE: Spatial = { pan: 0, gain: 1, cutoff: 20000 };

// --------------------------------------------------------------- the engine

interface Voice {
  endsAt: number;
  priority: number;
  out: GainNode;
}

interface FireBed {
  gain: GainNode;
  pan: StereoPannerNode | null;
  lp: BiquadFilterNode;
  src: AudioBufferSourceNode;
  pos: AudioVec3;
  /** Where the gain is heading. Ramped, never snapped — a fire does not click on. */
  target: number;
  hot: boolean;
  size: number;
  grainIn: number;
  seen: boolean;
}

type LiveContext = BaseAudioContext & { resume(): Promise<void>; state: AudioContextState };

const MUTE_KEY = "bretwalda.audio.muted";
const VOLUME_KEY = "bretwalda.audio.volume";
const UNLOCK_EVENTS = ["pointerdown", "touchend", "keydown", "mousedown"] as const;

class AudioEngine implements AudioHandle {
  private ac: BaseAudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private fire: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private hasPanner = true;

  private live: Voice[] = [];
  private fires = new Map<string, FireBed>();
  private budget: AudioBudget = AUDIO_BUDGET.medium;
  private grainCredit = 0;

  private _muted = false;
  private _volume = 0.8;
  private unlocking: Promise<boolean> | null = null;
  private armed = false;
  private injected = false;

  // Camera basis, rebuilt once a frame rather than once a sound.
  private camPos = new Vec3();
  private camRight = new Vec3();
  private camFwd = new Vec3();
  private tmp = new Vec3();

  constructor() {
    try {
      if (typeof localStorage !== "undefined") {
        this._muted = localStorage.getItem(MUTE_KEY) === "1";
        const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? "");
        if (Number.isFinite(v)) this._volume = clamp(v, 0, 1);
      }
    } catch { /* private mode; the default stands */ }
  }

  get ready(): boolean { return this.ac !== null && (this.ac as LiveContext).state !== "suspended"; }
  get muted(): boolean { return this._muted; }
  get masterVolume(): number { return this._volume; }
  get voices(): number { return this.live.length; }
  get voiceBudget(): number { return this.budget.voices; }

  setQuality(q: QualitySettings): void {
    this.budget = AUDIO_BUDGET[q.tier] ?? AUDIO_BUDGET.medium;
  }

  /**
   * A harness renders this graph in an `OfflineAudioContext`, which is
   * deterministic and far faster than real time and needs no gesture at all.
   * That is the only way this feature gets judged rather than asserted — see
   * `docs/SOUND.md` — so injection is part of the API, not a back door.
   */
  adopt(context: BaseAudioContext): void {
    if (this.ac) return;
    this.injected = true;
    this.build(context);
  }

  /** Listens for the first deliberate tap. Creates NOTHING until one arrives. */
  arm(): void {
    if (this.armed || typeof window === "undefined") return;
    this.armed = true;
    const go = () => { void this.unlock(); };
    for (const type of UNLOCK_EVENTS) {
      window.addEventListener(type, go, { capture: true, passive: true });
    }
    this.disarm = () => {
      for (const type of UNLOCK_EVENTS) window.removeEventListener(type, go, { capture: true });
    };
    // A backgrounded tab should not crackle to itself. Cheap, and it is the
    // difference between a phone that sounds broken and one that does not.
    document.addEventListener("visibilitychange", () => {
      const ac = this.ac as LiveContext | null;
      if (!ac || this.injected) return;
      if (document.hidden) void (ac as unknown as { suspend(): Promise<void> }).suspend().catch(() => {});
      else void ac.resume().catch(() => {});
    });
  }

  private disarm: (() => void) | null = null;

  unlock(): Promise<boolean> {
    if (this.ac) {
      const ac = this.ac as LiveContext;
      if (ac.state === "running") return Promise.resolve(true);
      return ac.resume().then(() => true).catch(() => false);
    }
    if (this.unlocking) return this.unlocking;
    this.unlocking = (async () => {
      const Ctor = typeof window !== "undefined"
        ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
      if (!Ctor) return false;
      let ac: AudioContext;
      try { ac = new Ctor({ latencyHint: "interactive" }); } catch { return false; }
      this.build(ac);
      // iOS hands back a context that is still suspended even inside a gesture,
      // and a resume alone does not always take. One silent sample does.
      try {
        const b = ac.createBuffer(1, 1, ac.sampleRate);
        const s = ac.createBufferSource();
        s.buffer = b; s.connect(ac.destination); s.start(0);
      } catch { /* ok */ }
      try { await ac.resume(); } catch { /* ok */ }
      if (ac.state === "running") this.disarm?.();
      return ac.state === "running";
    })();
    return this.unlocking;
  }

  private build(ac: BaseAudioContext): void {
    this.ac = ac;
    // master -> limiter -> soft clip -> out. The compressor holds the mix down
    // when eight men die at once; the shaper is the guarantee, because a
    // compressor's attack still lets the first transient of a pile-up through
    // and `tanh` cannot produce a sample outside its own ceiling whatever
    // arrives at it. Peak below clipping is a property of the graph, not of the
    // tuning.
    const master = ac.createGain();
    master.gain.value = this._muted ? 0 : this._volume;

    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -7;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.22;

    const shaper = ac.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(1.8 * x);
    }
    shaper.curve = curve;
    shaper.oversample = "2x";

    const out = ac.createGain();
    out.gain.value = 0.82; // hard ceiling: tanh maxes at 1, so the mix cannot pass 0.82

    master.connect(limiter); limiter.connect(shaper); shaper.connect(out); out.connect(ac.destination);

    const sfx = ac.createGain(); sfx.gain.value = 1; sfx.connect(master);
    const fire = ac.createGain(); fire.gain.value = 0.55; fire.connect(master);

    this.master = master; this.sfx = sfx; this.fire = fire;
    this.hasPanner = typeof ac.createStereoPanner === "function";

    // One two-second bed of white noise, reused by every whoosh, hit, footfall
    // and crackle in the game. Generating it per sound is the easy way to eat a
    // phone's main thread.
    const frames = Math.floor(ac.sampleRate * 2);
    const buf = ac.createBuffer(1, frames, ac.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 0x5eed1;
    for (let i = 0; i < frames; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      d[i] = (seed / 0xffffffff) * 2 - 1;
    }
    this.noise = buf;
  }

  setMuted(muted: boolean): void {
    if (this._muted === muted) return;
    this._muted = muted;
    for (const fn of muteListeners) fn();
    try { localStorage?.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* ok */ }
    if (this.master && this.ac) {
      const t = this.ac.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(muted ? 0 : this._volume, t, 0.02);
    }
  }

  setMasterVolume(v: number): void {
    this._volume = clamp(v, 0, 1);
    try { localStorage?.setItem(VOLUME_KEY, String(this._volume)); } catch { /* ok */ }
    if (!this._muted && this.master && this.ac) {
      this.master.gain.setTargetAtTime(this._volume, this.ac.currentTime, 0.02);
    }
  }

  // ------------------------------------------------------------ voice pool

  /**
   * Claim a voice, or say no. Past the cap the loudest thing wins: a quieter,
   * lower-priority voice is ramped out over 15 ms and its slot taken. Nothing is
   * queued — a sound that arrives late is a lie about when the blow landed.
   */
  private claim(priority: number, seconds: number): GainNode | null {
    const ac = this.ac, sfx = this.sfx;
    if (!ac || !sfx || this._muted) return null;
    const now = ac.currentTime;
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (this.live[i].endsAt <= now) this.live.splice(i, 1);
    }
    if (this.live.length >= this.budget.voices) {
      let worst = -1;
      for (let i = 0; i < this.live.length; i++) {
        if (worst < 0 || this.live[i].priority < this.live[worst].priority) worst = i;
      }
      if (worst < 0 || this.live[worst].priority >= priority) return null;
      const stolen = this.live[worst];
      stolen.out.gain.cancelScheduledValues(now);
      stolen.out.gain.setTargetAtTime(0, now, 0.005);
      this.live.splice(worst, 1);
    }
    const out = ac.createGain();
    out.gain.value = 1;
    out.connect(sfx);
    this.live.push({ endsAt: now + seconds + 0.05, priority, out });
    return out;
  }

  /**
   * Pan and attenuate by world position relative to the camera. Hearing the man
   * behind you is information in an eight-man free-for-all — but a phone speaker
   * is mono, so the pan is deliberately narrow and the real cue is level and a
   * little air absorption. Behind the camera is darker than in front of it,
   * which is the front/back cue a stereo field cannot give on its own.
   */
  private spatial(e: AudioEvent): Spatial | null {
    if (e.local || !e.position) return HERE;
    this.tmp.set(e.position.x, e.position.y ?? 0, e.position.z).sub(this.camPos);
    const dist = this.tmp.length();
    if (dist > this.budget.earshot) return null;
    const lateral = dist > 0.001 ? this.tmp.dot(this.camRight) / dist : 0;
    const behind = this.tmp.dot(this.camFwd) < 0;
    return {
      pan: clamp(lateral * 0.55, -0.55, 0.55),
      gain: clamp(1 / (1 + Math.pow(dist / 6, 1.35)), 0.04, 1),
      cutoff: clamp((behind ? 4200 : 15000) - dist * 240, 700, 20000),
    };
  }

  /** Source -> [lowpass] -> [pan] -> voice gain. One chain, built per voice. */
  private sink(out: GainNode, s: Spatial): AudioNode {
    const ac = this.ac!;
    let head: AudioNode = out;
    if (this.hasPanner && s.pan !== 0) {
      const p = ac.createStereoPanner();
      p.pan.value = s.pan;
      p.connect(head);
      head = p;
    }
    if (s.cutoff < 19000) {
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = s.cutoff;
      lp.connect(head);
      head = lp;
    }
    return head;
  }

  private noiseAt(t: number, seconds: number, rate = 1): AudioBufferSourceNode {
    const ac = this.ac!;
    const s = ac.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    // Start somewhere random in the bed so two hits in the same frame are not
    // the same waveform — this is what keeps a synthesised library from sounding
    // machine-gunned, and it costs nothing.
    s.start(t, Math.random() * 1.8, seconds + 0.02);
    return s;
  }

  private tone(type: OscillatorType, t: number, f0: number, f1: number, seconds: number): OscillatorNode {
    const ac = this.ac!;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + seconds);
    o.start(t);
    o.stop(t + seconds + 0.02);
    return o;
  }

  // -------------------------------------------------------------- one-shots

  swing(e: SwingEvent): void {
    const s = this.spatial(e); if (!s) return;
    const w = weaponVoice(e.warriorClass, e.heavy === true);
    const out = this.claim(e.local ? PRIORITY.IMPORTANT : PRIORITY.NORMAL, w.seconds);
    if (!out || !this.ac) return;
    const ac = this.ac, t = ac.currentTime;
    const dest = this.sink(out, s);

    // Air moving past an edge: white noise through a band that falls as the
    // blade comes round. The centre frequency is the weapon's mass and the Q is
    // its arc — a spear is a line and rings tight, a Dane axe is a wide roar.
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = w.q;
    bp.frequency.setValueAtTime(w.hi, t);
    bp.frequency.exponentialRampToValueAtTime(w.lo, t + w.seconds);
    const g = ac.createGain();
    envelope(g.gain, t, w.gain * s.gain, w.seconds * 0.35, w.seconds * 0.75);
    this.noiseAt(t, w.seconds * 1.2).connect(bp);
    bp.connect(g); g.connect(dest);

    // The steel itself, only on the weapons big enough to have any: a faint
    // low body under the air. The seax has none.
    const mass = clamp((WEAPON_REACH[e.warriorClass] - 0.5) / 0.94, 0, 1);
    if (mass > 0.25) {
      const bg = ac.createGain();
      envelope(bg.gain, t, w.gain * 0.30 * mass * s.gain, 0.012, w.seconds * 0.7);
      this.tone("triangle", t, 190 - 60 * mass, 90, w.seconds).connect(bg);
      bg.connect(dest);
    }
  }

  impact(e: ImpactEvent): void {
    const s = this.spatial(e); if (!s) return;
    const ac = this.ac; if (!ac) return;
    const dmg = e.damage ?? 18;
    const heavy = e.heavy === true;
    const mat = e.material;
    const seconds = mat === "parry" ? 0.62 : mat === "mail" ? 0.34 : mat === "shield" ? 0.30 : 0.20;
    const prio = e.local ? PRIORITY.CRITICAL : PRIORITY.IMPORTANT;
    const out = this.claim(prio, seconds);
    if (!out) return;
    const t = ac.currentTime;
    const dest = this.sink(out, s);
    const force = clamp(0.55 + dmg / 60, 0.5, 1.35) * (heavy ? 1.2 : 1) * s.gain;

    // The transient. Every material gets one and they differ only in colour —
    // it is what follows it that says what was struck.
    //
    // The colour is a BAND, not a shelf, for the three that are not a parry. A
    // highpass leaves white noise open all the way to Nyquist, and a burst of
    // that measures brighter than anything tonal on top of it — which is how
    // the mail ended up brighter than the parry, the one event in the game
    // that is supposed to ring highest. Only the parry gets an open top.
    const tg = ac.createGain();
    const tf = ac.createBiquadFilter();
    tf.type = mat === "flesh" ? "lowpass" : mat === "parry" ? "highpass" : "bandpass";
    tf.frequency.value = mat === "flesh" ? 900 : mat === "mail" ? 3300 : mat === "parry" ? 5200 : 1250;
    if (tf.type === "bandpass") tf.Q.value = mat === "mail" ? 1.1 : 0.9;
    this.noiseAt(t, 0.05).connect(tf);
    tf.connect(tg); tg.connect(dest);
    envelope(tg.gain, t, 0.30 * force, 0.001, mat === "flesh" ? 0.05 : 0.09);

    if (mat === "flesh") {
      // Steel finding a gap: no ring at all, a wet low thud and nothing above
      // 400 Hz. This is the bottom of the centroid range on purpose.
      // An open throat is wetter and higher than an opened thigh; the zone only
      // tilts the body note, it never changes which of the four this is.
      const open = e.zone === "neck" || e.zone === "head" ? 1.18 : 1;
      const g = ac.createGain();
      envelope(g.gain, t, 0.42 * force, 0.004, 0.17);
      this.tone("sine", t, 165 * open, 62, 0.19).connect(g);
      g.connect(dest);
      const bodyG = ac.createGain();
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.setValueAtTime(520, t);
      lp.frequency.exponentialRampToValueAtTime(160, t + 0.15);
      this.noiseAt(t, 0.16, 0.7).connect(lp);
      lp.connect(bodyG); bodyG.connect(dest);
      envelope(bodyG.gain, t, 0.26 * force, 0.004, 0.15);
      return;
    }

    if (mat === "shield") {
      // Limewood on an iron boss: a wooden knock with two low partials that die
      // fast, and the boss itself as a short mid ring. Nothing bright.
      for (const [f, a, d] of [[186, 0.34, 0.24], [279, 0.20, 0.17], [610, 0.11, 0.10]] as const) {
        const g = ac.createGain();
        envelope(g.gain, t, a * force, 0.003, d);
        this.tone("triangle", t, f, f * 0.86, d + 0.05).connect(g);
        g.connect(dest);
      }
      return;
    }

    if (mat === "mail") {
      // Rings driven against each other: inharmonic, bright, and short. The
      // blow is turned, so there is a dull body under it but no sustain.
      const g = ac.createGain();
      envelope(g.gain, t, 0.26 * force, 0.002, 0.10);
      this.tone("sine", t, 210, 120, 0.12).connect(g);
      g.connect(dest);
      const jangle = ac.createGain();
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass"; bp.Q.value = 2.2; bp.frequency.value = 3200;
      this.noiseAt(t, 0.24, 1.4).connect(bp);
      bp.connect(jangle); jangle.connect(dest);
      envelope(jangle.gain, t, 0.20 * force, 0.002, 0.22);
      // Triangles, not squares. A square at 6 kHz puts a harmonic every 6 kHz
      // up the spectrum, which pushed the mail ABOVE the parry — the harness
      // caught that, and it was wrong by ear as well as by measurement: mail is
      // a dull rustle of turned rings, and only the parry rings.
      for (const [f, a] of [[2760, 0.10], [3820, 0.07], [4610, 0.04]] as const) {
        const rg = ac.createGain();
        envelope(rg.gain, t, a * force, 0.001, 0.14);
        this.tone("triangle", t, f, f * 0.96, 0.16).connect(rg);
        rg.connect(dest);
      }
      return;
    }

    // Parry: edge caught on edge and turned. The only event in the game that
    // RINGS — long, bright and inharmonic, and unmistakable next to a block.
    // It sits at the top of the material range on purpose: the ordering flesh <
    // shield < mail < parry is what lets a player read the fight without
    // looking, and it is measured in `soundtest`, not asserted here.
    for (const [f, a, d] of [[2093, 0.19, 0.55], [3136, 0.15, 0.46], [4699, 0.12, 0.34], [6270, 0.08, 0.26], [9400, 0.05, 0.18], [1046, 0.07, 0.35]] as const) {
      const g = ac.createGain();
      envelope(g.gain, t, a * force, 0.002, d);
      this.tone("triangle", t, f, f * 0.995, d + 0.05).connect(g);
      g.connect(dest);
    }
  }

  hit(e: AudioEvent & { type: WireHitType; damage?: number; hitZone?: HitZone | null }): void {
    this.impact({
      position: e.position,
      local: e.local,
      material: materialFor(e.type, e.hitZone, e.damage ?? 0),
      damage: e.damage,
      heavy: e.type === "heavy" || e.type === "blocked_heavy",
      zone: e.hitZone ?? undefined,
    });
  }

  block(e: AudioEvent & { raise?: boolean }): void {
    if (e.raise) {
      // Leather and a shield rim coming up. Quiet: it happens constantly.
      const s = this.spatial(e); if (!s) return;
      const out = this.claim(PRIORITY.AMBIENT, 0.14); if (!out || !this.ac) return;
      const ac = this.ac, t = ac.currentTime, dest = this.sink(out, s);
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass"; bp.Q.value = 1.1;
      bp.frequency.setValueAtTime(1500, t);
      bp.frequency.exponentialRampToValueAtTime(620, t + 0.12);
      const g = ac.createGain();
      envelope(g.gain, t, 0.09 * s.gain, 0.01, 0.11);
      this.noiseAt(t, 0.14).connect(bp); bp.connect(g); g.connect(dest);
      return;
    }
    this.impact({ position: e.position, local: e.local, material: "shield", damage: 14 });
  }

  dodge(e: AudioEvent): void {
    const s = this.spatial(e); if (!s) return;
    const out = this.claim(e.local ? PRIORITY.IMPORTANT : PRIORITY.AMBIENT, 0.22);
    if (!out || !this.ac) return;
    const ac = this.ac, t = ac.currentTime, dest = this.sink(out, s);
    // Wool and hide dragged through air, plus the scuff of the push-off.
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass"; bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(2400, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.2);
    const g = ac.createGain();
    envelope(g.gain, t, 0.15 * s.gain, 0.02, 0.19);
    this.noiseAt(t, 0.24).connect(bp); bp.connect(g); g.connect(dest);
  }

  footfall(e: FootfallEvent): void {
    const s = this.spatial(e); if (!s) return;
    const out = this.claim(PRIORITY.AMBIENT, 0.13); if (!out || !this.ac) return;
    const ac = this.ac, t = ac.currentTime, dest = this.sink(out, s);
    // The height field is the terrain description this game already has, so the
    // bank sounds drier and grittier than the ditch without a material map.
    const dry = clamp(((e.ground ?? 0) + 0.4) / 1.4, 0, 1);
    const w = clamp(e.weight ?? 0.5, 0, 1);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(700 + 2400 * dry, t);
    lp.frequency.exponentialRampToValueAtTime(220 + 500 * dry, t + 0.1);
    const g = ac.createGain();
    envelope(g.gain, t, (0.05 + 0.09 * w) * s.gain, 0.004, 0.09 + 0.03 * w);
    this.noiseAt(t, 0.14, 0.8 + 0.5 * dry).connect(lp);
    lp.connect(g); g.connect(dest);
    const thud = ac.createGain();
    envelope(thud.gain, t, (0.05 + 0.10 * w) * s.gain, 0.003, 0.08);
    this.tone("sine", t, 96 - 20 * dry, 52, 0.1).connect(thud);
    thud.connect(dest);
  }

  death(e: DeathEvent): void {
    const s = this.spatial(e); if (!s) return;
    const out = this.claim(PRIORITY.CRITICAL, 0.9); if (!out || !this.ac) return;
    const ac = this.ac, t = ac.currentTime, dest = this.sink(out, s);
    const g = s.gain;

    // The breath going out of him: a filtered exhale falling away.
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass"; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(e.cause === "fire" ? 1300 : 780, t);
    bp.frequency.exponentialRampToValueAtTime(230, t + 0.5);
    const bg = ac.createGain();
    envelope(bg.gain, t, 0.20 * g, 0.03, 0.48);
    this.noiseAt(t, 0.55, 0.9).connect(bp); bp.connect(bg); bg.connect(dest);

    // The body meeting the ground, a beat later, and the kit with it.
    const fall = t + 0.16;
    const tg = ac.createGain();
    envelope(tg.gain, fall, 0.40 * g, 0.006, 0.26);
    this.tone("sine", fall, 118, 44, 0.3).connect(tg);
    tg.connect(dest);
    const clatter = ac.createGain();
    const cf = ac.createBiquadFilter();
    cf.type = "bandpass"; cf.Q.value = 1.6; cf.frequency.value = 2600;
    this.noiseAt(fall, 0.3, 1.2).connect(cf); cf.connect(clatter); clatter.connect(dest);
    envelope(clatter.gain, fall, 0.13 * g, 0.004, 0.26);
  }

  sever(e: SeverEvent): void {
    const s = this.spatial(e); if (!s) return;
    const out = this.claim(PRIORITY.CRITICAL, 0.6); if (!out || !this.ac) return;
    const ac = this.ac, t = ac.currentTime, dest = this.sink(out, s);
    const power = clamp(e.power ?? 1, 0.6, 1.8);
    const g = s.gain * power;

    // Bone. A single high-Q crack, over almost before it starts — this is the
    // part the ear reads as "something came off".
    const crack = ac.createBiquadFilter();
    crack.type = "bandpass"; crack.Q.value = 9;
    crack.frequency.value = 1500 + 500 * (e.zone === "neck" ? 1 : 0);
    const cg = ac.createGain();
    envelope(cg.gain, t, 0.34 * g, 0.001, 0.055);
    this.noiseAt(t, 0.08, 1.6).connect(crack); crack.connect(cg); cg.connect(dest);

    // The tear: a wide band collapsing downwards, which is a rip and not a hit.
    const rip = ac.createBiquadFilter();
    rip.type = "bandpass"; rip.Q.value = 0.9;
    rip.frequency.setValueAtTime(2600, t + 0.01);
    rip.frequency.exponentialRampToValueAtTime(320, t + 0.01 + 0.24 * power);
    const rg = ac.createGain();
    envelope(rg.gain, t + 0.01, 0.28 * g, 0.008, 0.26 * power);
    this.noiseAt(t + 0.01, 0.3 * power, 0.6).connect(rip);
    rip.connect(rg); rg.connect(dest);

    // And the weight of it hitting the ground.
    const thud = ac.createGain();
    envelope(thud.gain, t + 0.02, 0.30 * g, 0.005, 0.22);
    this.tone("sine", t + 0.02, 132, 46, 0.25).connect(thud);
    thud.connect(dest);
  }

  ability(e: AudioEvent & { warriorClass: WarriorClass }): void {
    const s = this.spatial(e); if (!s) return;
    const out = this.claim(PRIORITY.CRITICAL, 1.1); if (!out || !this.ac) return;
    const ac = this.ac, t = ac.currentTime, dest = this.sink(out, s);
    const g = s.gain * (e.local ? 1 : 0.7);

    switch (e.warriorClass) {
      case "huscarl": {
        // SHIELD WALL — iron planted. A low boom and the rim ringing over it,
        // both falling: the sound of something being set down and not moved.
        const boom = ac.createGain();
        envelope(boom.gain, t, 0.44 * g, 0.01, 0.55);
        this.tone("sine", t, 96, 48, 0.6).connect(boom); boom.connect(dest);
        for (const [f, a] of [[330, 0.16], [495, 0.10]] as const) {
          const rg = ac.createGain();
          envelope(rg.gain, t + 0.01, a * g, 0.004, 0.42);
          this.tone("triangle", t + 0.01, f, f * 0.94, 0.45).connect(rg); rg.connect(dest);
        }
        break;
      }
      case "warden": {
        // BATTLE FOCUS — a clean rising fifth on struck bronze. Nothing hits;
        // something is being sharpened.
        for (const [f0, f1, a, d] of [[294, 440, 0.22, 0.7], [588, 880, 0.13, 0.55], [882, 1320, 0.07, 0.4]] as const) {
          const rg = ac.createGain();
          envelope(rg.gain, t, a * g, 0.09, d);
          this.tone("triangle", t, f0, f1, d + 0.1).connect(rg); rg.connect(dest);
        }
        break;
      }
      case "runekeeper": {
        // SHADOW STEP — air rushing INTO the space he left, then a cold
        // shimmer where he arrives. The sweep runs upwards; nothing else does.
        const bp = ac.createBiquadFilter();
        bp.type = "bandpass"; bp.Q.value = 1.5;
        bp.frequency.setValueAtTime(500, t);
        bp.frequency.exponentialRampToValueAtTime(5200, t + 0.20);
        const ng = ac.createGain();
        envelope(ng.gain, t, 0.24 * g, 0.14, 0.10);
        this.noiseAt(t, 0.3, 1.3).connect(bp); bp.connect(ng); ng.connect(dest);
        for (const [f, a] of [[1568, 0.11], [2349, 0.08], [3136, 0.05]] as const) {
          const rg = ac.createGain();
          envelope(rg.gain, t + 0.18, a * g, 0.006, 0.34);
          this.tone("sine", t + 0.18, f, f * 1.02, 0.36).connect(rg); rg.connect(dest);
        }
        break;
      }
      default: {
        // BLOOD FURY — a roar. Saw down low bending up and then away, with a
        // noise growl through it. The only ugly sound in the set, deliberately.
        const sawG = ac.createGain();
        envelope(sawG.gain, t, 0.30 * g, 0.05, 0.75);
        const saw = ac.createOscillator();
        saw.type = "sawtooth";
        saw.frequency.setValueAtTime(78, t);
        saw.frequency.exponentialRampToValueAtTime(148, t + 0.22);
        saw.frequency.exponentialRampToValueAtTime(62, t + 0.85);
        saw.start(t); saw.stop(t + 0.9);
        saw.connect(sawG); sawG.connect(dest);
        const growl = ac.createBiquadFilter();
        growl.type = "bandpass"; growl.Q.value = 1.1;
        growl.frequency.setValueAtTime(420, t);
        growl.frequency.exponentialRampToValueAtTime(900, t + 0.25);
        growl.frequency.exponentialRampToValueAtTime(240, t + 0.8);
        const gg = ac.createGain();
        envelope(gg.gain, t, 0.22 * g, 0.06, 0.72);
        this.noiseAt(t, 0.9, 0.55).connect(growl); growl.connect(gg); gg.connect(dest);
        break;
      }
    }
  }

  // ------------------------------------------------------------- the screens
  //
  // Nine sounds and ONE instrument. The visual language is gilt, garnet and
  // knotwork on near black, so the audio is struck metal over low wood — a
  // small bronze bar on an oak board — and never a modern UI blip. Every one of
  // the nine is `strike()` with different notes, so they cannot drift into nine
  // unrelated noises the way a UI sound set usually does: change the bar and
  // the whole interface changes together.
  //
  // The notes come from one mode on one root (D), which is what makes a
  // sequence of taps in a menu sound like somebody playing rather than like a
  // machine answering.

  /**
   * One blow on the bar. A wooden mallet, three inharmonic bar modes over it,
   * and the board underneath — that is the entire instrument.
   */
  private strike(dest: AudioNode, t: number, hz: number, gain: number, decay: number, wood: number): void {
    const ac = this.ac!;
    // The mallet. Short, filtered noise: the sound of contact, before the bar
    // has decided what note it is.
    const mal = ac.createBiquadFilter();
    mal.type = "bandpass"; mal.Q.value = 1.1;
    mal.frequency.value = clamp(hz * 4.5, 400, 7000);
    const mg = ac.createGain();
    envelope(mg.gain, t, 0.14 * gain, 0.001, 0.014);
    this.noiseAt(t, 0.03, 1.2).connect(mal); mal.connect(mg); mg.connect(dest);

    // The bar. Free-bar modes, not harmonics — a struck bar is inharmonic and
    // that is exactly what separates bronze from a synthesiser's beep.
    for (const [ratio, amp] of BAR_MODES) {
      const g = ac.createGain();
      const d = decay / (1 + 0.55 * (ratio - 1));
      envelope(g.gain, t, gain * amp, 0.003, d);
      this.tone("triangle", t, hz * ratio, hz * ratio * 0.998, d + 0.03).connect(g);
      g.connect(dest);
    }

    // The board it is mounted on. Low, brief, and the reason the family reads
    // as wood-and-metal rather than as a bell.
    if (wood > 0) {
      const g = ac.createGain();
      const d = Math.min(decay, 0.2);
      envelope(g.gain, t, gain * wood * 0.55, 0.004, d);
      this.tone("sine", t, hz * 0.5, hz * 0.34, d + 0.02).connect(g);
      g.connect(dest);
    }
  }

  ui(kind: UiSound): void {
    const ac = this.ac; if (!ac) return;
    const score = UI_SCORE[kind];
    if (!score) return;
    let span = 0;
    for (const n of score.notes) span = Math.max(span, n.at + n.decay);
    span = Math.max(span, score.drone ? score.drone.decay : 0);
    const out = this.claim(score.priority, span);
    if (!out) return;
    const t = ac.currentTime;
    const dest = this.sink(out, HERE);

    for (const n of score.notes) {
      this.strike(dest, t + n.at, UI_ROOT * n.degree, n.gain * score.gain, n.decay, n.wood);
    }
    // Under the big moments only: the hall itself answering. Nothing is struck
    // here, so it stays part of the same instrument rather than a second one.
    if (score.drone) {
      const g = ac.createGain();
      envelope(g.gain, t, score.drone.gain * score.gain, 0.05, score.drone.decay);
      this.tone("triangle", t, UI_ROOT * score.drone.degree, UI_ROOT * score.drone.degree * 0.99, score.drone.decay + 0.1).connect(g);
      g.connect(dest);
    }
  }

  // ------------------------------------------------------------------ fire
  //
  // The one continuous, spatialised source in the game, and the reason
  // spatialisation is worth having at all: a bonfire you can hear from behind is
  // a landmark, and a man alight is audible before he is visible. Everything
  // here is driven from the three wire fields and nothing decides who is
  // burning — same contract as `vfx.setBurning`.

  setBonfire(position: AudioVec3 | null): void {
    if (!position) { this.killFire("bonfire"); return; }
    const bed = this.ensureFire("bonfire", position, 1);
    if (bed) { bed.pos = position; bed.target = 0.85; bed.hot = true; bed.seen = true; }
  }

  setBurning(id: string, burning: boolean, timer: number, inside: boolean, position: AudioVec3): void {
    const key = `p:${id}`;
    if (!burning) { this.killFire(key); return; }
    const bed = this.ensureFire(key, position, 0.45);
    if (!bed) return;
    bed.pos = position;
    bed.hot = inside;
    bed.seen = true;
    // The same 1→0 fade the flames run on, off the same field.
    const fade = clamp(timer / FIRE.linger, 0, 1);
    bed.target = (inside ? 0.55 : 0.30) * (0.35 + 0.65 * fade);
  }

  private ensureFire(key: string, pos: AudioVec3, size: number): FireBed | null {
    const existing = this.fires.get(key);
    if (existing) return existing;
    const ac = this.ac, bus = this.fire;
    if (!ac || !bus || this.fires.size >= this.budget.fires) return null;
    const src = this.noiseAt(ac.currentTime, 3600, 0.35);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 380 + 320 * size;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 70;
    const gain = ac.createGain();
    gain.gain.value = SILENCE;
    let pan: StereoPannerNode | null = null;
    if (this.hasPanner) { pan = ac.createStereoPanner(); gain.connect(pan); pan.connect(bus); }
    else gain.connect(bus);
    src.connect(hp); hp.connect(lp); lp.connect(gain);
    const bed: FireBed = { gain, pan, lp, src, pos, target: 0, hot: false, size, grainIn: 0, seen: true };
    this.fires.set(key, bed);
    return bed;
  }

  private killFire(key: string): void {
    const bed = this.fires.get(key);
    if (!bed || !this.ac) return;
    const t = this.ac.currentTime;
    bed.gain.gain.cancelScheduledValues(t);
    bed.gain.gain.setTargetAtTime(SILENCE, t, 0.12);
    try { bed.src.stop(t + 0.6); } catch { /* already stopped */ }
    this.fires.delete(key);
  }

  /** A single pop out of a fire. Cheap enough to be the thing that sells it. */
  private crackle(bed: FireBed, s: Spatial): void {
    const out = this.claim(PRIORITY.AMBIENT, 0.09);
    if (!out || !this.ac) return;
    const ac = this.ac, t = ac.currentTime;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 3 + Math.random() * 5;
    bp.frequency.value = 900 + Math.random() * 3400;
    const g = ac.createGain();
    const peak = (0.05 + Math.random() * 0.09) * bed.size * s.gain * (bed.hot ? 1.3 : 1);
    envelope(g.gain, t, peak, 0.001, 0.02 + Math.random() * 0.05);
    this.noiseAt(t, 0.08, 1 + Math.random()).connect(bp);
    bp.connect(g); g.connect(this.sink(out, s));
  }

  // ----------------------------------------------------------------- frame

  update(dt: number, ctx: FrameContext): void {
    const ac = this.ac;
    if (!ac) return;
    this.setQuality(ctx.quality);

    const now = ac.currentTime;
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (this.live[i].endsAt <= now) {
        this.live[i].out.disconnect();
        this.live.splice(i, 1);
      }
    }
    if (this._muted) return;

    // Camera basis once per frame, not once per sound.
    const m = ctx.camera.matrixWorld.elements;
    this.camPos.set(m[12], m[13], m[14]);
    this.camRight.set(m[0], m[1], m[2]).normalize();
    this.camFwd.set(-m[8], -m[9], -m[10]).normalize();

    this.grainCredit = Math.min(this.grainCredit + dt * this.budget.grains, this.budget.grains);

    for (const [key, bed] of this.fires) {
      // A burner that stopped being mentioned goes out on its own, so a man who
      // dies, respawns or leaves needs no second call. The bonfire is never
      // unmentioned — `setBonfire` re-arms it every time it is set.
      if (!bed.seen && key !== "bonfire") { this.killFire(key); continue; }
      bed.seen = false;

      const s = this.spatial({ position: bed.pos });
      if (!s) { bed.gain.gain.setTargetAtTime(SILENCE, now, 0.2); continue; }
      if (bed.pan) bed.pan.pan.setTargetAtTime(s.pan, now, 0.08);
      bed.lp.frequency.setTargetAtTime((bed.hot ? 700 : 420) + 300 * bed.size, now, 0.2);
      bed.gain.gain.setTargetAtTime(Math.max(bed.target * s.gain, SILENCE), now, 0.15);

      bed.grainIn -= dt;
      if (bed.grainIn <= 0) {
        bed.grainIn = (0.05 + Math.random() * 0.16) / Math.max(bed.size, 0.2);
        if (this.grainCredit >= 1 && bed.target * s.gain > 0.02) {
          this.grainCredit -= 1;
          this.crackle(bed, s);
        }
      }
    }
  }

  dispose(): void {
    for (const key of [...this.fires.keys()]) this.killFire(key);
    for (const v of this.live) v.out.disconnect();
    this.live = [];
  }
}

// ------------------------------------------------------------------ the door

let engine: AudioEngine | null = null;
const muteListeners = new Set<() => void>();

/**
 * The mute as an external store, so a React tree can render it without keeping
 * a second copy that drifts. Same shape the key bindings use, and for the same
 * reason: the switch is on three screens at once and there is one answer.
 *
 * `getServerMuted` is deliberately always `false`. The server has no
 * localStorage to read, and a snapshot that guessed would make React hydrate a
 * crossed-out speaker against server HTML holding a plain one.
 */
export function subscribeMuted(fn: () => void): () => void {
  muteListeners.add(fn);
  return () => { muteListeners.delete(fn); };
}
export function getMuted(): boolean { return getAudio().muted; }
export function getServerMuted(): boolean { return false; }

/**
 * The single engine. There is one AudioContext per page and browsers cap how
 * many a document may hold, so this is a singleton by necessity rather than by
 * taste — a remount reconfigures it, it does not build a second one.
 *
 * Calling this is free and silent. It creates no AudioContext; see `unlock()`.
 */
export function getAudio(): AudioHandle & { adopt(context: BaseAudioContext): void } {
  if (!engine) {
    engine = new AudioEngine();
    engine.arm();
  }
  return engine;
}

/** `getAudio()` plus this mount's quality tier. Returns the same handle. */
export function createAudio(quality: QualitySettings): AudioHandle {
  const a = getAudio();
  a.setQuality(quality);
  return a;
}

// Arm the unlock listeners the moment this module is imported. This creates
// nothing — it is one addEventListener per gesture type — and it is what makes
// the FIRST deliberate tap the one that wakes the context, whichever button
// that turns out to be. Waiting for a screen to remember to call `unlock()` is
// how this ships mute.
if (typeof window !== "undefined") {
  const a = getAudio();
  // The screens layer imports `getAudio` directly; this is for a harness or a
  // console that has no import to hand.
  (window as unknown as Record<string, unknown>).__bretwaldaAudio = a;
}
