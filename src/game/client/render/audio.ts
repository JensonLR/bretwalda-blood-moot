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

import { FIRE, type WarriorClass, type HitZone, type DeathCause, type EmoteId } from "../../types";
import type { FrameContext, QualitySettings, QualityTier } from "./quality";
import { createScore, type ScoreHandle, type ScoreScene } from "./score";

export type { ScoreScene } from "./score";

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
 * The interface's eleven words. They are one instrument played eleven ways —
 * see `strike()` — because a screen whose buttons each have their own sound is
 * a screen with no voice at all.
 *
 * The last three are the long ones. `matchWon` and `matchLost` are the only
 * MUSIC in the game: a phrase rather than a sting, because the end of a match
 * is the one moment the interface is allowed to say something. They are still
 * the same bar, the same root and the same mode as the tap that opened the
 * menu — that is the whole reason a fanfare here does not sound bolted on.
 */
export type UiSound =
  | "tap" | "confirm" | "back" | "purchase" | "refusal"
  | "countdown" | "roundWon" | "roundLost" | "levelUp"
  | "matchWon" | "matchLost";

/**
 * The server's `hit` message `type` field, VERBATIM AND COMPLETE — all seven
 * kinds `engine.mjs` broadcasts under `{type:"hit"}`, not the five this module
 * used to know about. See docs/WIRE-PROTOCOL.md, "`hit` — seven kinds under one
 * type", and `tools/soundwire.mjs`, which reads the engine's own broadcasts off
 * disk and fails if this list and that list ever stop matching.
 *
 * The four WOUNDING kinds carry `health`/`direction`/`hitZone`; `parry`, `shove`
 * and `knockdown` carry `damage: 0` and no zone, which is exactly why they were
 * inaudible: the client derived the blow from a health delta, and a blow that
 * takes nothing off produces no delta to derive from.
 *
 * It is a RUNTIME array and the type is derived from it, not the other way
 * round, so a harness can iterate the list the module actually believes in
 * rather than keeping its own copy — the `UI_SOUNDS` pattern, and for the same
 * reason: a kind with no copy in the harness is the one kind nobody graded.
 */
export const WIRE_HIT_TYPES = [
  "light", "heavy", "blocked", "blocked_heavy",
  "parry", "shove", "knockdown",
  // The board going. Follows the turned blow's own `hit`; damage 0.
  "shield_burst",
] as const;

export type WireHitType = (typeof WIRE_HIT_TYPES)[number];

/** The four that take health off. The other three are position and posture. */
export const WOUNDING: readonly WireHitType[] = ["light", "heavy", "blocked", "blocked_heavy"];

/**
 * Everything `hit()` reads off the wire's `hit` payload, plus the two things
 * only the client can know: WHERE the struck man is standing and WHOSE ears
 * this is. `weapon` is the ATTACKER's class, looked up from `attackerId`.
 */
export type WireHit = AudioEvent & {
  type: WireHitType;
  damage?: number;
  hitZone?: HitZone | null;
  weapon?: WarriorClass;
  /** The attacker had earned this blow with a parry. On wounds only. */
  riposte?: boolean;
  /** The shover was carrying a shield, so it is a boss and not a shoulder. */
  shield?: boolean;
};

/**
 * The output this mix is being built for.
 *
 * `full` is anything with a woofer in it — a desk, headphones, a laptop that at
 * least tries. `small` is a phone's own speaker: a few millimetres of cone in a
 * sealed sliver of air, flat from roughly 700 Hz to 8 kHz and gone below 400.
 * Everything this engine spends on WEIGHT lives between 46 and 190 Hz, which on
 * `small` is spent on nothing at all.
 */
export type SpeakerMode = "full" | "small";

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
  /**
   * A heavy blow, and it is NOT a loud light blow. `heavy` moves the attack, the
   * decay and the spectrum; it moves the level barely at all. See `impact()`.
   */
  heavy?: boolean;
  /** Where it landed, when the wire says. Only used to tilt the timbre. */
  zone?: HitZone;
  /**
   * What struck. A Dane axe and a seax landing on the same mail are two
   * different sounds, and until this existed they were one — the whoosh knew
   * which weapon it was and the blow did not.
   */
  weapon?: WarriorClass;
  /**
   * This blow was thrown inside a window its attacker EARNED by parrying, and
   * the wire says so on every wound (`riposte`, always present). The engine
   * already pays it in damage and knockback; the ear has to be paid too, or the
   * biggest single blow in the game arrives sounding like any other.
   */
  riposte?: boolean;
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
  /** Which speaker the mix is being built for. See `setSpeaker`. */
  readonly speaker: SpeakerMode;

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
  /**
   * Which speaker this mix is for. Auto-detected once at construction and
   * overridable — a harness needs to render both, and a player on a tablet in a
   * dock is not the device the sniff thinks he is.
   *
   * This is not a volume control and not a quality tier. See `body()`: it
   * changes what is SYNTHESISED, because a phone speaker does not reproduce the
   * bottom two octaves at all and the weight that lives down there has to be
   * carried by something a phone can actually move.
   */
  setSpeaker(mode: SpeakerMode): void;

  // ---- combat ----
  swing(e: SwingEvent): void;
  impact(e: ImpactEvent): void;
  /** A shield taking a blow it was raised for, or being raised. */
  block(e: AudioEvent & { raise?: boolean }): void;
  dodge(e: AudioEvent): void;
  /**
   * The shove, fired on the state edge. The breath is the audible half of the
   * windup tell; the body-drive thump is scheduled SHOVE-windup seconds later
   * inside the synth, so it lands with the server's contact. `shield` adds the
   * boss knock a huscarl's disc makes doing the same job.
   */
  /**
   * `phase` follows the engine's two moments. `"windup"` is the grunt, on the
   * SHOVER, at his state edge — it fires on a whiff too, because the tell is the
   * point of it. `"contact"` is the drive, on the man who took it, only when the
   * wire says one landed. Omitted means both, 0.30 s apart, which is what a
   * whole shove sounds like and what `soundtest` grades.
   */
  shove(e: AudioEvent & { shield?: boolean; phase?: "windup" | "contact" }): void;
  /**
   * A victory emote, fired on the server's relay so every phone in the room
   * hears the same flourish it sees. Three voices from the palette the module
   * already speaks: the raised blade is a rising war-shout, the boss two knocks
   * of wood (or the duller chest, with `shield` false), the taunt a falling
   * two-note jeer.
   */
  emote(e: AudioEvent & { emote: EmoteId; shield?: boolean }): void;
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
   * THE ONE DOOR FROM THE WIRE. Hand it the server's `hit` payload and it
   * decides which voice that is; the caller never maps a type to a material and
   * never has to know that a parry is a parry.
   *
   * It used to be `impact()` with `materialFor()` applied and nothing else,
   * which meant three of the seven kinds had no route at all — and the client
   * did not call it off the wire anyway. See the comment on the method.
   */
  hit(e: WireHit): void;

  /** A man's full weight going down in mail. Not a death and not a roll. */
  knockdown(e: AudioEvent): void;

  // ---- continuous ----
  /**
   * THE FORGED SCORE (backlog 7.8): which scene the music serves and how hard
   * the fight is running (0..1). Idempotent and cheap — callers say it every
   * frame or on every screen change alike; scene changes ramp over a breath,
   * intensity glides. See `score.ts` for what the scenes mean musically.
   */
  setScore(scene: ScoreScene, intensity: number): void;
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

/**
 * Head mass behind the edge, normalised 0..1, and it is deliberately NOT reach.
 *
 * `weaponVoice` above derives the WHOOSH from reach, and that is right: a whoosh
 * is tip speed and how much air is moved, and a spear moves the most of both. An
 * IMPACT is a different question — what is behind the edge when it stops — and
 * by reach the spear comes out the heaviest weapon in the game, which is exactly
 * backwards. A spear is three hundred grams of iron on a stick. A Dane axe is a
 * kilo and a half of head on a metre of haft, and it is the only weapon here
 * that hits like a hammer.
 *
 * This is a second table because it is a second physical quantity, not because
 * anybody forgot the first. R7: if either is re-cut, say which.
 */
const WEAPON_HEAD: Record<WarriorClass, number> = {
  berserker: 1.00,   // Dane axe — all of it out at the end of the haft
  huscarl: 0.58,     // pattern-welded sword, mass gathered near the hand
  warden: 0.34,      // spear — a light head, and every gram of it in a point
  runekeeper: 0.20,  // twin seaxes
};

interface WeaponBite {
  head: number;
  /** Contact colour. A light head cracks high; an axe lands broad and low. */
  bright: number;
  /** How long the struck thing rings: more steel drives lower modes for longer. */
  ring: number;
  /** Contact TIME. A seax is in and out; an axe stays in contact and pushes. */
  bite: number;
}

function weaponBite(cls?: WarriorClass): WeaponBite {
  const head = WEAPON_HEAD[cls ?? "huscarl"] ?? WEAPON_HEAD.huscarl;
  // A spear is the one weapon that THRUSTS: light and concentrated, so it is
  // the brightest contact in the game even though it is not the fastest.
  const point = cls === "warden" ? 1 : 0;
  return {
    head,
    bright: (1.55 - 0.85 * head) * (1 + 0.18 * point),
    ring: 0.72 + 0.62 * head,
    bite: 0.45 + 1.35 * head,
  };
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
  // `shove` and `knockdown` are not impacts on a material at all — they are a
  // body being moved — and `hit()` routes them away before they reach here. If
  // one ever arrives, a shoulder into a chest is flesh, not a hole in the map.
  if (type === "shove" || type === "knockdown") return "flesh";
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
 * Eleven sounds, one instrument, one mode. Read down the column: the answer to
 * a tap is a single blow; anything that CHANGED something gets two notes; the
 * verdicts get a phrase and a drone. Nothing here is longer than the moment it
 * describes — the whole set is measured against these windows in `soundtest`,
 * and the eleven are held inside 3x of each other in brightness there, which is
 * the falsifiable form of "one instrument".
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
    notes: [n(0, D.V, 0.14, 0.16, 0.5), n(0.07, D.i, 0.15, 0.22, 0.3)],
  },
  // Gold changing hands: three rising, the last an octave up and left to ring.
  purchase: {
    gain: 1, priority: PRIORITY.IMPORTANT,
    notes: [n(0, D.i, 0.17, 0.24, 0.9), n(0.08, D.V, 0.16, 0.3, 0.5), n(0.17, D.i8, 0.18, 0.55, 0.8)],
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
  // A level taken. The reward sound of the game, and the only thing in the set
  // that climbs the whole way without ever falling back: root, third, fifth,
  // octave, each brighter and less wooden than the last, so the bar is heard to
  // open up. Short — it lands on top of the match verdict, and two phrases in
  // one mode on one root are a chord, not a clash, which is the entire reason
  // the family is built this way.
  levelUp: {
    gain: 1, priority: PRIORITY.CRITICAL,
    notes: [
      n(0, D.i, 0.17, 0.2, 0.7), n(0.07, D.III, 0.16, 0.24, 0.4),
      n(0.14, D.V, 0.17, 0.3, 0.22), n(0.22, D.i8, 0.19, 0.5, 0.1),
    ],
  },
  // VICTORY. Not a sting — a phrase, and the longest thing in the game. It
  // rises to the octave, walks the flat seventh and sixth back down over the
  // drone, and settles on the fifth above before the octave closes it. Under a
  // second and a half of it, because it plays at the end of every single match
  // and the fourth hearing must not be a thing to be sat through.
  matchWon: {
    gain: 1, priority: PRIORITY.CRITICAL,
    notes: [
      n(0, D.i, 0.2, 0.34, 0.45), n(0.10, D.V, 0.17, 0.36, 0.45),
      n(0.20, D.i8, 0.18, 0.42, 0.2), n(0.34, D.VII, 0.15, 0.34, 0.25),
      n(0.44, D.VI, 0.14, 0.34, 0.25), n(0.56, D.V8, 0.16, 0.5, 0),
      n(0.74, D.i8, 0.19, 0.72, 0.15),
    ],
    drone: { degree: D.low, gain: 0.12, decay: 1.45 },
  },
  // LOSS. The same length and the same instrument, walked the other way: from
  // the octave down through the seventh, fifth and minor third onto the root,
  // getting slower, darker and more wooden every step. The drone outlasts the
  // last note, which is what makes it read as the hall emptying rather than as
  // a buzzer.
  matchLost: {
    gain: 1, priority: PRIORITY.CRITICAL,
    notes: [
      n(0, D.i8, 0.17, 0.34, 0.5), n(0.13, D.VII, 0.15, 0.36, 0.5),
      n(0.27, D.V, 0.16, 0.4, 0.6), n(0.42, D.III, 0.15, 0.46, 0.6),
      n(0.60, D.i, 0.18, 0.78, 0.65),
    ],
    drone: { degree: D.low, gain: 0.1, decay: 1.5 },
  },
};

/**
 * The family, enumerated off the score itself rather than typed out a second
 * time. `soundtest` reads this to decide what it has to grade, so a sound added
 * to `UI_SCORE` and forgotten everywhere else still gets measured — and the
 * "one instrument" spread is taken across every member, not across the nine
 * somebody once wrote into the harness.
 */
export const UI_SOUNDS = Object.keys(UI_SCORE) as UiSound[];

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
  /**
   * Every source scheduled into this voice, so that stealing it actually STOPS
   * the work rather than only silencing it. See `claim`.
   */
  sources: AudioScheduledSourceNode[];
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

/**
 * Is this a phone speaker?
 *
 * There is no Web Audio API that answers this — `AudioContext` will not tell you
 * what is on the other end of `destination`, and nothing tells you whether
 * headphones are in. So it is a sniff, and it is deliberately a conservative
 * one: a touch device with a short side under 950 CSS px is a phone or a small
 * tablet held in the hand, and that is the population whose only output is a
 * micro-speaker. Everything else gets the full mix.
 *
 * Being WRONG here is cheap in one direction and not the other, which is why
 * `body()` reinforces rather than replaces: a desk mistaken for a phone gets a
 * body with extra harmonics on it, which reads as a harder-edged blow. A phone
 * mistaken for a desk gets no weight at all, which is the bug this exists to
 * prevent. `setSpeaker` overrides it either way.
 */
function detectSpeaker(): SpeakerMode {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "full";
  try {
    const touch = (navigator.maxTouchPoints ?? 0) > 0;
    const short = Math.min(window.screen?.width ?? 9999, window.screen?.height ?? 9999);
    return touch && short < 950 ? "small" : "full";
  } catch { return "full"; }
}

class AudioEngine implements AudioHandle {
  private ac: BaseAudioContext | null = null;
  private master: GainNode | null = null;
  /** What happened to ME, and the interface. Never ducked, never attenuated. */
  private near: GainNode | null = null;
  /** The other seven men. This is what gets out of the way. */
  private far: GainNode | null = null;
  private fire: GainNode | null = null;
  /** The one gain that both `far` and `fire` pass through. See `duckNow`. */
  private duck: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private hasPanner = true;

  private live: Voice[] = [];
  private score: ScoreHandle | null = null;
  /** The scene asked for before the graph existed — applied at build. */
  private wantScene: ScoreScene = "off";
  private wantIntensity = 0;
  private fires = new Map<string, FireBed>();
  private budget: AudioBudget = AUDIO_BUDGET.medium;
  private grainCredit = 0;
  /** Last few firing times per crowd-controlled kind. See `crowded`. */
  private recent = new Map<string, number[]>();
  private _speaker: SpeakerMode = "full";

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
    this._speaker = detectSpeaker();
  }

  get ready(): boolean { return this.ac !== null && (this.ac as LiveContext).state !== "suspended"; }
  get muted(): boolean { return this._muted; }
  get masterVolume(): number { return this._volume; }
  get voices(): number { return this.live.length; }
  get voiceBudget(): number { return this.budget.voices; }
  get speaker(): SpeakerMode { return this._speaker; }

  setQuality(q: QualitySettings): void {
    this.budget = AUDIO_BUDGET[q.tier] ?? AUDIO_BUDGET.medium;
  }

  setSpeaker(mode: SpeakerMode): void { this._speaker = mode; }

  setScore(scene: ScoreScene, intensity: number): void {
    // Remembered even before a gesture has built the graph, so the score a
    // screen asked for starts the moment the first tap unlocks audio.
    this.wantScene = scene;
    this.wantIntensity = intensity;
    this.score?.set(scene, intensity);
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

    // TWO BUSES, and the split is by WHOSE EVENT IT IS rather than by what kind
    // of sound it is. `near` carries what happened to me and what I pressed;
    // `far` carries the other seven men and the fire. Only `far` goes through
    // `duck`, so a blow I have to react to can push the room behind it down for
    // a fifth of a second and still be the only thing in the game that can.
    //
    // A limiter cannot do this job and it is worth saying why, because the graph
    // already had one and the mix still turned to mud: a limiter ducks
    // EVERYTHING, including the sound that caused it, so a pile-up gets quieter
    // without ever getting clearer. Priority is a property of the source, and it
    // has to be spent somewhere the source can see.
    const duck = ac.createGain(); duck.gain.value = 1; duck.connect(master);

    const near = ac.createGain(); near.gain.value = 1; near.connect(master);
    const far = ac.createGain(); far.gain.value = 0.92; far.connect(duck);
    const fire = ac.createGain(); fire.gain.value = 0.55; fire.connect(duck);

    this.master = master; this.near = near; this.far = far; this.fire = fire; this.duck = duck;
    this.hasPanner = typeof ac.createStereoPanner === "function";

    // THE SCORE'S OWN GAIN, into master and deliberately NOT through `duck`:
    // the combat duck exists so a blow can push the ROOM down for a fifth of
    // a second, and music that flinched with it would read as a broken mixer
    // rather than as priority. It sits well under the effects — the fight is
    // the lead instrument and the score is the floor it stands on.
    const music = ac.createGain(); music.gain.value = 0.5; music.connect(master);
    this.score = createScore(ac, music, this._speaker === "small");
    this.score.set(this.wantScene, this.wantIntensity);

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
   * Claim a voice, or say no.
   *
   * Past the cap something has to give, and WHICH thing gives is the whole mix.
   * The victim is the lowest priority in the pool, and among equals the one
   * NEAREST ITS END — a blow that has 20 ms of tail left is worth less than the
   * blow that just landed. Nothing is queued: a sound that arrives late is a lie
   * about when the blow landed.
   *
   * The refusal used to be `>=`, and that one character was a real mix defect.
   * With eight men in a brawl the pool fills with CRITICAL events, and `>=`
   * means an arriving CRITICAL — the parry I just landed — finds every slot held
   * by an equal and is dropped, while a flesh hit from three seconds of tail ago
   * keeps its voice. The cap was dropping THE NEWEST BLOW, which is always the
   * one the player is reacting to. `>` fixes it, and `soundtest` phase 5 fires a
   * parry into a full pool of equals to prove it: before this, that parry
   * measured 1.03x the same flood without it, which is silence.
   */
  private claim(priority: number, seconds: number, near = false): GainNode | null {
    const ac = this.ac, bus = near ? this.near : this.far;
    if (!ac || !bus || this._muted) return null;
    const now = ac.currentTime;
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (this.live[i].endsAt <= now) this.live.splice(i, 1);
    }
    if (this.live.length >= this.budget.voices) {
      let worst = -1;
      for (let i = 0; i < this.live.length; i++) {
        const v = this.live[i];
        if (worst < 0) { worst = i; continue; }
        const w = this.live[worst];
        if (v.priority < w.priority || (v.priority === w.priority && v.endsAt < w.endsAt)) worst = i;
      }
      if (worst < 0 || this.live[worst].priority > priority) return null;
      const stolen = this.live[worst];
      stolen.out.gain.cancelScheduledValues(now);
      stolen.out.gain.setTargetAtTime(0, now, 0.005);
      // AND STOP IT. Ramping the gain to zero silences a voice; it does not
      // stop an oscillator, which goes on being computed until its own
      // scheduled stop. The first build of the new stealing rule did only the
      // ramp, and `soundtest` caught what that costs: the same 60-event storm
      // rendered 198 source nodes on the LOW tier and 226 on high, so a cap of
      // 10 and a cap of 24 were doing identical work. A voice budget that bounds
      // what you can hear and not what the phone has to compute is not a budget.
      for (const src of stolen.sources) { try { src.stop(now + 0.02); } catch { /* already stopped */ } }
      this.live.splice(worst, 1);
    }
    const out = ac.createGain();
    out.gain.value = 1;
    out.connect(bus);
    const voice: Voice = { endsAt: now + seconds + 0.05, priority, out, sources: [] };
    this.live.push(voice);
    this.current = voice;
    return out;
  }

  /**
   * The voice being built right now. `tone` and `noiseAt` register into it, so
   * the pool knows what to stop when it steals. Every public method here claims
   * once and then builds, so this is only ever the voice the caller is filling.
   */
  private current: Voice | null = null;

  /**
   * Everything that is not mine gets out of the way of what just happened to me.
   *
   * `depth` is where the crowd bus lands, `hold` is how long it stays there
   * before it climbs back. Only the local warrior's own big moments call this —
   * a parry, a heavy blow taken or landed, his own death — because a duck that
   * fires for everybody is a duck that fires constantly and is heard as
   * pumping rather than as emphasis.
   *
   * The falsifiable form, and it is the one gate in the whole harness that
   * nothing else could produce: ADDING a sound to the mix makes the REST of the
   * mix quieter. Without a duck that is arithmetically impossible.
   */
  private duckNow(depth: number, hold: number): void {
    const ac = this.ac, d = this.duck;
    if (!ac || !d || this._muted) return;
    const t = ac.currentTime;
    d.gain.cancelScheduledValues(t);
    d.gain.setTargetAtTime(depth, t, 0.006);
    d.gain.setTargetAtTime(1, t + hold, 0.09);
  }

  /**
   * Eight men swinging inside one animation frame is eight whooshes, and eight
   * whooshes is not a battle, it is a hiss. The voice cap alone does not fix it:
   * eight copies of the same sound fit inside the cap comfortably and mask each
   * other completely, and the ear reads the sum as noise rather than as eight
   * events. So the repetitive kinds get a rate limit as well as a cap.
   *
   * The local warrior is never rate-limited. Everything he does he did on
   * purpose, and his own feedback is the one thing the budget may not thin.
   */
  private crowded(kind: string, limit: number, window: number): boolean {
    const ac = this.ac;
    if (!ac) return true;
    const now = ac.currentTime;
    let times = this.recent.get(kind);
    if (!times) { times = []; this.recent.set(kind, times); }
    while (times.length && now - times[0] > window) times.shift();
    if (times.length >= limit) return true;
    times.push(now);
    return false;
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
    this.current?.sources.push(s);
    return s;
  }

  /**
   * A LOW BODY NOTE — the weight of a blow — and the one place in this engine
   * where a phone gets something different rather than something quieter.
   *
   * THE PROBLEM. Every gram of weight in this game lives between 46 and 190 Hz:
   * a flesh hit falls to 62, a shove's drive to 56, a body meeting the ground to
   * 44. A phone's own speaker is a few millimetres of cone in a sealed sliver of
   * air and it reproduces none of it — `soundtest`'s calibrated small-speaker
   * model puts 80 Hz 49 dB down and 200 Hz 21 dB down. Before this existed, a
   * flesh hit measured 22 dB of loss through that speaker and landed 19 dB under
   * the parry: on a phone the fight was all ring and no blow. That is not a
   * volume slider — turning it up turns up the ring too.
   *
   * THE ANSWER is the missing fundamental. The ear reconstructs a pitch from a
   * series of consecutive harmonics whether or not the fundamental is present —
   * it is why a 60 Hz bass line survives a laptop speaker, and it is what a
   * phone's own bass enhancement does in DSP. So the body is given two
   * CONSECUTIVE harmonics, chosen by where they LAND rather than by number: the
   * pair straddling 560 Hz, which is where a micro-speaker starts working. Their
   * spacing is f0, so the residue the ear builds is the note that is missing.
   *
   * Two design consequences worth stating because they are not obvious:
   *
   *  - The fundamental is kept, at 0.45. It is not free — it is inaudible on the
   *    speaker AND it eats limiter headroom that the audible part of the mix
   *    needs — but a phone with headphones in is still a phone by every sniff
   *    available, and taking the bottom octave off a listener who can hear it is
   *    the worse error. Reinforcement, never replacement.
   *  - The harmonic number is picked from the GEOMETRIC MEAN of the sweep, not
   *    from its start. A body note that falls 165 -> 62 Hz would otherwise take
   *    its harmonics out of the speaker's passband on the way down, which is
   *    precisely where the weight is.
   */
  private body(dest: AudioNode, t: number, f0: number, f1: number, peak: number, attack: number, decay: number, type: OscillatorType = "sine"): void {
    const ac = this.ac!;
    const small = this._speaker === "small";
    const g = ac.createGain();
    envelope(g.gain, t, peak * (small ? 0.45 : 1), attack, decay);
    this.tone(type, t, f0, f1, attack + decay + 0.02).connect(g);
    g.connect(dest);
    if (!small) return;
    const n = clamp(Math.round(560 / Math.sqrt(Math.max(f0 * f1, 1))), 3, 12);
    for (const [k, amp] of [[n, 0.60], [n + 1, 0.42]] as const) {
      const hg = ac.createGain();
      envelope(hg.gain, t, peak * amp, attack, decay * 0.9);
      this.tone("sine", t, f0 * k, f1 * k, attack + decay + 0.02).connect(hg);
      hg.connect(dest);
    }
  }

  /**
   * Where a body-carrying NOISE band has to sit for the speaker in use. A
   * lowpassed rumble at 520 Hz is the same nothing as a 62 Hz sine on a phone,
   * and unlike a tone it has no harmonics to reinforce — the only thing to do
   * with it is move it up to where the speaker works. Only ever called on
   * content below the small speaker's corner; the mail's 3 kHz jangle is fine
   * where it is and must not be touched, or the four materials stop being
   * ordered and the read goes with them.
   */
  private lift(hz: number): number { return this._speaker === "small" ? hz * 2.4 : hz; }

  private tone(type: OscillatorType, t: number, f0: number, f1: number, seconds: number): OscillatorNode {
    const ac = this.ac!;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + seconds);
    o.start(t);
    o.stop(t + seconds + 0.02);
    this.current?.sources.push(o);
    return o;
  }

  // -------------------------------------------------------------- one-shots

  swing(e: SwingEvent): void {
    const s = this.spatial(e); if (!s) return;
    // Eight men swinging at once is the commonest crowd in the game and the one
    // that turns a fight into a hiss. Three of them at a time is a battle.
    if (!e.local && this.crowded("swing", 3, 0.10)) return;
    const w = weaponVoice(e.warriorClass, e.heavy === true);
    const out = this.claim(e.local ? PRIORITY.IMPORTANT : PRIORITY.NORMAL, w.seconds, e.local === true);
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

  /**
   * The blow, and the whole of what the player is told about it.
   *
   * FOUR THINGS ARE ENCODED HERE and each of them was measured before it was
   * believed. `soundtest` phase 3 grades every pair of events against seven
   * perceptual axes with LEVEL DELIBERATELY EXCLUDED, because the mixer already
   * spends level on distance and a sound that is only louder is the same sound
   * closer.
   *
   *  1. WHAT WAS STRUCK — flesh, shield, mail, or steel caught on steel. Four
   *     materials, ordered flesh < shield < mail < parry by brightness.
   *  2. HOW HARD — and this is the one that had never been built. `heavy` used
   *     to be `force *= 1.2` and nothing else: a heavy blow was a light blow
   *     4 dB louder, which measured 0.38-0.83 JND from its own light version,
   *     i.e. THE SAME SOUND. Weight is not level. It is a slower contact, a
   *     lower contact, and a longer body — a maul and a tack hammer differ in
   *     attack and decay far more than they differ in loudness.
   *  3. WITH WHAT — see `WEAPON_HEAD`. A Dane axe and a seax landing on the same
   *     mail used to measure 0.25 JND apart, which is one sound with two names.
   *  4. WHOSE IT IS — a blow on the local warrior takes the near bus, ducks the
   *     other seven men, and is never the voice that gets stolen.
   */
  /**
   * THE BOARD BURSTING. Not a knock — the shield material above is a board
   * TURNING a blow, and this is the board failing to. Three things a player
   * has to hear, in order: the crack (a bright noise snap, high-passed, over in
   * 40 ms), the boards splitting (two partials that START where a shield knock
   * lives and fall away as the wood lets go), and the rattle of the pieces
   * landing (three quick low knocks, each quieter). Then his stagger.
   * CRITICAL when it is yours: your guard just ended and the mix must say so
   * over anything else it is playing.
   */
  private splinter(e: AudioEvent): void {
    const s = this.spatial(e); if (!s) return;
    const ac = this.ac; if (!ac) return;
    const mine = e.local === true;
    const out = this.claim(mine ? PRIORITY.CRITICAL : PRIORITY.IMPORTANT, 0.9, mine);
    if (!out) return;
    const t = ac.currentTime;
    const dest = this.sink(out, s);
    // the crack
    {
      const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1800; hp.Q.value = -3;
      const g = ac.createGain();
      this.noiseAt(t, 0.05, 1).connect(hp); hp.connect(g); g.connect(dest);
      envelope(g.gain, t, 0.55, 0.002, 0.04);
    }
    // the boards letting go: from a shield's own partials, down and out
    this.body(dest, t + 0.008, 279, 92, 0.34, 0.006, 0.26, "triangle");
    this.body(dest, t + 0.012, 186, 61, 0.30, 0.008, 0.34, "triangle");
    // the pieces landing
    for (const [dt, a] of [[0.14, 0.16], [0.23, 0.11], [0.31, 0.07]] as const) {
      this.body(dest, t + dt, 210, 160, a, 0.003, 0.07, "triangle");
    }
  }

  impact(e: ImpactEvent): void {
    const s = this.spatial(e); if (!s) return;
    const ac = this.ac; if (!ac) return;
    const dmg = e.damage ?? 18;
    const heavy = e.heavy === true;
    const mat = e.material;
    const mine = e.local === true;
    // A crowd of blows is still a crowd. Mine are never rate-limited.
    if (!mine && this.crowded("impact", 5, 0.12)) return;
    const w = weaponBite(e.weapon);
    // How long the voice is held. Weight lengthens it; so does a heavier head.
    const base = mat === "parry" ? 0.85 : mat === "mail" ? 0.34 : mat === "shield" ? 0.30 : 0.22;
    const seconds = base * (heavy ? 1.7 : 1) * (mat === "parry" ? 1 : w.ring);
    const prio = mine ? PRIORITY.CRITICAL : PRIORITY.IMPORTANT;
    const out = this.claim(prio, seconds, mine);
    if (!out) return;
    const t = ac.currentTime;
    const dest = this.sink(out, s);

    // LEVEL is allowed to move a little with the blow and no more. It used to
    // carry the whole of `heavy` and it is the one axis a player cannot read,
    // because the same 4 dB is also what four extra metres of distance sounds
    // like. Everything else below is where the weight actually went.
    const force = clamp(0.62 + dmg / 90, 0.55, 1.15) * (heavy ? 1.06 : 1) * s.gain;

    // My own blows push the room down behind them. A parry hardest of all: it is
    // the rarest thing in the fight and the one the whole mechanic is for.
    if (mine) {
      if (mat === "parry") this.duckNow(0.30, 0.22);
      else if (heavy) this.duckNow(0.58, 0.13);
    }

    // THE RIPOSTE. The wire marks it on every wound and the engine already pays
    // it in damage, knockback and poise — `RIPOSTE.bonus` makes it the biggest
    // single blow any class can throw. The ear got nothing, so the payoff for
    // the hardest input in the game sounded like an ordinary hit.
    //
    // It is a LAYER and not a fifth material, and that is the whole design: the
    // player still has to hear WHAT he hit — flesh, shield or mail — with the
    // riposte's steel on top of it. A high, tight, doubled ring, tuned a
    // deliberate fifth above the parry's own shimmer band so the two read as the
    // same steel answering itself.
    if (e.riposte === true) {
      // The lever, and where it landed (R1). 0.15/0.10 put the flagged blow only
      // 0.52 JND from the unflagged one, which is nothing anybody would notice
      // mid-fight; 0.34/0.22 reached 1.31, still under the bar; 0.60/0.40 took
      // it to 2.39 and turned a cut into a bell. These are the compromise, and
      // the ring still sits UNDER the blow it decorates rather than over it.
      for (const [f, a, d] of [[3140, 0.46, 0.22], [4710, 0.30, 0.15]] as const) {
        const rg = ac.createGain();
        envelope(rg.gain, t, a * force, 0.0015, d);
        this.tone("triangle", t, f, f * 0.988, d + 0.03).connect(rg);
        rg.connect(dest);
      }
    }

    // ---- the transient: the instant of contact ----
    //
    // The colour is a BAND, not a shelf, for the three that are not a parry. A
    // highpass leaves white noise open all the way to Nyquist, and a burst of
    // that measures brighter than anything tonal on top of it — which is how
    // the mail once ended up brighter than the parry. Only the parry gets an
    // open top.
    //
    // Two things now bend it. The WEAPON: a seax cracks high and an axe lands
    // broad and low, `w.bright` being the ratio between them. And WEIGHT: a
    // heavy blow has a bigger contact patch, which is lower and lasts longer —
    // this is the physical reason a heavy hit is not a loud light hit, and it is
    // worth more to the ear than the 1 dB of level it also gets.
    const heft = heavy ? 1 : 0;
    const tg = ac.createGain();
    const tf = ac.createBiquadFilter();
    tf.type = mat === "flesh" ? "lowpass" : mat === "parry" ? "highpass" : "bandpass";
    // The flesh band was 820 and the whole event measured 463 Hz, which is
    // 1.35x from the interface's own tap at 626 — under the 1.5x this file has
    // always required, and a menu press that can be mistaken for a blade in a
    // thigh is a UI fighting the game. A cut into a gap has nothing bright in it
    // anyway; that is the entire point of it being the darkest of the four.
    const tHz = (mat === "flesh" ? this.lift(560) : mat === "mail" ? 3300 : mat === "parry" ? 5200 : this.lift(1180))
      * w.bright * (heavy ? 0.62 : 1.12);
    tf.frequency.value = clamp(tHz, 120, 12000);
    if (tf.type === "bandpass") tf.Q.value = mat === "mail" ? 1.1 : 0.9;
    this.noiseAt(t, 0.05 + 0.05 * heft).connect(tf);
    tf.connect(tg); tg.connect(dest);
    envelope(tg.gain, t, (mat === "parry" ? 0.10 : 0.26) * force,
      0.0012 * w.bite, (mat === "flesh" ? 0.045 : 0.085) * (heavy ? 1.9 : 1));

    if (mat === "flesh") {
      // Steel finding a gap: no ring at all, a wet low thud and nothing above
      // 400 Hz. This is the bottom of the centroid range on purpose.
      // An open throat is wetter and higher than an opened thigh; the zone only
      // tilts the body note, it never changes which of the four this is.
      const open = e.zone === "neck" || e.zone === "head" ? 1.18 : 1;
      // WEIGHT, and this is the shape of it everywhere below: heavy goes LOWER,
      // blooms SLOWER and rings LONGER. A light cut is a slap; a heavy one is
      // a body being moved, and the body takes time to start and time to stop.
      const f0 = (heavy ? 118 : 178) * open * (1.18 - 0.30 * w.head);
      this.body(dest, t, f0, f0 * (heavy ? 0.38 : 0.42), (heavy ? 0.52 : 0.36) * force,
        heavy ? 0.026 : 0.0035, (heavy ? 0.46 : 0.115) * w.ring);
      // The meat around it. Lifted bodily on a small speaker: unlike a tone this
      // has no harmonics to reinforce, so the only thing to do is move it.
      const bodyG = ac.createGain();
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(this.lift(heavy ? 380 : 470), t);
      lp.frequency.exponentialRampToValueAtTime(this.lift(heavy ? 120 : 175), t + (heavy ? 0.32 : 0.13));
      this.noiseAt(t, heavy ? 0.36 : 0.15, heavy ? 0.5 : 0.8).connect(lp);
      lp.connect(bodyG); bodyG.connect(dest);
      envelope(bodyG.gain, t, (heavy ? 0.24 : 0.20) * force, heavy ? 0.02 : 0.004, (heavy ? 0.34 : 0.12) * w.ring);
      return;
    }

    if (mat === "shield") {
      // Limewood on an iron boss: a wooden knock with two low partials that die
      // fast, and the boss itself as a short mid ring. Nothing bright.
      //
      // A HEAVY blow does not rap the boards, it drives them: the partials drop
      // roughly a fourth, the whole thing takes 20 ms to reach full amplitude
      // instead of 3, and it rings four times as long. That is the difference
      // between a shield turning a cut and a shield absorbing an axe, and a
      // player has to hear which one his arm just did.
      // Only the BOARDS drop. The boss is a disc of iron and it rings where it
      // rings whatever hits it — dropping it with the rest made a heavy block
      // measure 905 Hz, darker than a shoulder-shove, and the two collided at
      // 2.4 JND. A shield taking an axe is a low boom with a bright rim ON it.
      for (const [f, a, d, drop] of [
        [186, 0.34, 0.24, heavy ? 0.70 : 1.06],
        [279, 0.20, 0.17, heavy ? 0.74 : 1.06],
        [610, 0.13, 0.10, 1.02],
      ] as const) {
        this.body(dest, t, f * drop, f * drop * 0.86, a * force * (heavy ? 1.1 : 0.92),
          heavy ? 0.021 : 0.0028, d * (heavy ? 3.4 : 0.72) * w.ring, "triangle");
      }
      if (heavy) {
        // The rim, struck hard enough to speak. The only bright thing a block has.
        for (const [f, a, d] of [[1180, 0.24, 0.30], [1720, 0.17, 0.22], [2480, 0.08, 0.15]] as const) {
          const rg = ac.createGain();
          envelope(rg.gain, t, a * force, 0.002, d * w.ring);
          this.tone("triangle", t, f, f * 0.97, d * w.ring + 0.04).connect(rg);
          rg.connect(dest);
        }
        // And the boards themselves complaining. Only a heavy blow gets this.
        const cr = ac.createBiquadFilter();
        cr.type = "bandpass"; cr.Q.value = 1.4;
        cr.frequency.setValueAtTime(this.lift(420), t + 0.02);
        cr.frequency.exponentialRampToValueAtTime(this.lift(170), t + 0.36);
        const cg = ac.createGain();
        envelope(cg.gain, t + 0.02, 0.15 * force, 0.03, 0.34);
        this.noiseAt(t + 0.02, 0.4, 0.6).connect(cr); cr.connect(cg); cg.connect(dest);
      }
      return;
    }

    if (mat === "mail") {
      // Rings driven against each other: inharmonic, bright, and short. The
      // blow is turned, so there is a dull body under it but no sustain.
      //
      // The RING FREQUENCIES track the weapon. More steel behind the edge drives
      // lower modes of the mail and drives them for longer — `w.ring` is the
      // whole of the difference between a Dane axe and a seax on the same
      // hauberk, and before it existed there was none.
      const scale = 1 / w.ring * (heavy ? 0.80 : 1.0);
      const bodyHz = (heavy ? 132 : 235) * (1.15 - 0.28 * w.head);
      // The body is deliberately SMALL even when the blow is heavy. The first
      // build of this gave heavy mail a body of 0.40 and it measured 0.98 of its
      // energy below 400 Hz — an axe turned by a hauberk had become a flesh hit
      // with a jingle on top, and it collided with the shield at 2.5 JND. Mail
      // TURNS a blow: the ring is the event and the thump is underneath it.
      this.body(dest, t, bodyHz, bodyHz * 0.56, (heavy ? 0.14 : 0.20) * force,
        heavy ? 0.024 : 0.002, (heavy ? 0.17 : 0.085) * w.ring);
      const jangle = ac.createGain();
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass"; bp.Q.value = 2.2;
      bp.frequency.value = clamp(3200 * scale, 900, 9000);
      this.noiseAt(t, 0.24 * w.ring * (heavy ? 1.6 : 1), 1.4).connect(bp);
      bp.connect(jangle); jangle.connect(dest);
      envelope(jangle.gain, t, (heavy ? 0.30 : 0.21) * force, heavy ? 0.012 : 0.002, 0.20 * w.ring * (heavy ? 1.7 : 1));
      // Triangles, not squares. A square at 6 kHz puts a harmonic every 6 kHz
      // up the spectrum, which pushed the mail ABOVE the parry — the harness
      // caught that, and it was wrong by ear as well as by measurement: mail is
      // a dull rustle of turned rings, and only the parry rings.
      for (const [f, a] of [[2760, 0.10], [3820, 0.07], [4610, 0.04]] as const) {
        const rg = ac.createGain();
        const hz = clamp(f * scale, 700, 11000);
        envelope(rg.gain, t, a * force * (heavy ? 1.5 : 1), 0.001 * w.bite, 0.13 * w.ring * (heavy ? 1.8 : 1));
        this.tone("triangle", t, hz, hz * 0.96, 0.16 * w.ring * (heavy ? 1.8 : 1) + 0.03).connect(rg);
        rg.connect(dest);
      }
      return;
    }

    // ---------------------------------------------------------------- PARRY
    //
    // THE HERO SOUND. It is the hardest thing in the game to do — the server
    // gives it the longest freeze and the only stagger that takes a swing back
    // off a man mid-stroke — and the sound is most of what makes landing one
    // feel earned. So it does not merely sit at the top of the brightness range,
    // which is a place the mail can and once did compete for. It has a property
    // NOTHING ELSE IN THE GAME HAS, and it has three of them:
    //
    //  1. IT BEATS. Every ring is a PAIR of partials a few Hz apart, so the tail
    //     shimmers at 6-12 Hz. Two close partials is what a real struck blade
    //     does and no other event here does it: `soundtest` measures the
    //     modulation index of every event's tail and the parry has to be at
    //     least 1.6x the next. Before this it measured 0.02 — less shimmer than
    //     a whoosh.
    //  2. IT SCRAPES. Edge dragging along edge before it turns: a fast upward
    //     sweep, and the only upward sweep in the combat set.
    //  3. IT DUCKS THE ROOM. Above, before a note is scheduled.
    //
    // No `body()` call and no `lift()`: the parry is the one blow with no weight
    // in it, which is also why it survives a phone speaker untouched.

    // The scrape — 12 ms of steel travelling before it catches.
    {
      const sc = ac.createBiquadFilter();
      sc.type = "bandpass"; sc.Q.value = 3.4;
      sc.frequency.setValueAtTime(1500 * w.bright, t);
      sc.frequency.exponentialRampToValueAtTime(7200 * w.bright, t + 0.055);
      const sg = ac.createGain();
      envelope(sg.gain, t, 0.24 * force, 0.004, 0.070);
      this.noiseAt(t, 0.1, 1.5).connect(sc); sc.connect(sg); sg.connect(dest);
    }

    // The ring. Each partial is TWO oscillators, detuned by `beat` Hz, and the
    // beat rates differ so the shimmer is a live thing rather than a tremolo
    // pedal. Amplitudes are halved against the old single-oscillator set so the
    // pair sums to the same weight.
    // THREE beating pairs, NOT six, and their rates are SPREAD. Both of those
    // are the opposite of the obvious answer and both were arrived at by moving
    // the number and looking at where it landed.
    //
    // Clustering the rates near 7 Hz is the obvious way to deepen a shimmer:
    // every pair starts in phase, because a Web Audio oscillator starts at phase
    // zero, so near-equal rates stay in step and their modulations add. They do,
    // and the result is not a shimmer — it is a deep periodic NULL where all six
    // pairs cancel together, at half a beat period, about 70 ms in. A blade does
    // not do that. Steel has partials that beat at unrelated rates and the ear
    // hears a live surface; identical rates are a tremolo pedal with a gap in
    // it. Measured, twice, the clustered version reads a modulation index of
    // 0.00 and a ring of 61 ms, because the first null truncates it.
    //
    // (The first draft of this comment blamed the master limiter for that
    // collapse. It was wrong — the peak never got near the threshold — and it is
    // recorded here rather than deleted, because a comment asserting a mechanism
    // that is not there is exactly the defect docs/PROCESS.md R7 is about, and
    // one more run of the same lever is what caught it.)
    //
    // The ring is TWO mechanisms and it needs both. Four configurations of the
    // first one were measured before that was clear, and the failures are the
    // instructive part.
    //
    // DETUNED PAIRS give the TEXTURE. Each partial is two oscillators a few Hz
    // apart, so each one beats the way a struck blade's partials really do.
    // What pairs cannot give is DEPTH, and the reason is arithmetic rather than
    // tuning: partials at unrelated carrier frequencies sum in POWER, so six
    // pairs each modulating fully produce a composite that modulates about
    // 1/sqrt(6) as much. Measured — six pairs 0.30; four pairs spread over
    // 6.3-10.4 Hz 0.17, because every pair starts at phase zero and a wide
    // spread decorrelates them inside the ring; three loud pairs plus three
    // plain partials for shape 0.13, because the plain ones had the longest
    // decays and the whole late tail was unmodulated. Whatever rings longest has
    // to be what shimmers. And clustering every rate at 7.0 gives the opposite
    // failure: they null TOGETHER, the ring goes silent 70 ms in and comes back,
    // which reads 0.00 for shimmer and 61 ms for a ring that is really 400. That
    // is a broken tremolo pedal, not a blade.
    //
    // So the SIGNATURE comes from the second mechanism: one shallow LFO across
    // the whole ring. Being one modulator it is coherent by construction, so its
    // depth is its depth with nothing to dilute it, and at 0.44 it never comes
    // near a null. The pairs are what make it sound like steel; this is what
    // makes it unmistakable.
    //
    // No partial below 2 kHz, and the weight of the set is at the TOP of it.
    // Lengthening these decays cost the material ordering once already: the tail
    // is pure tone, so it took the loudest frame off the noisy scrape and the
    // measured centroid fell from 8119 Hz to 3888 — UNDER the mail, breaking
    // flesh < shield < mail < parry, which is what the whole read is built on.
    const shimmer = ac.createGain();
    shimmer.gain.value = 1;
    shimmer.connect(dest);
    {
      const lfo = ac.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 7.2;
      const depth = ac.createGain();
      depth.gain.value = 0.44;
      lfo.connect(depth); depth.connect(shimmer.gain);
      lfo.start(t); lfo.stop(t + 1.0);
      this.current?.sources.push(lfo);
    }
    for (const [f, a, d, beat] of [
      [2093, 0.034, 0.60, 6.6], [3136, 0.042, 0.52, 7.4], [4699, 0.062, 0.44, 6.9],
      [6270, 0.088, 0.38, 7.2], [9400, 0.096, 0.32, 7.7], [12400, 0.070, 0.26, 6.3],
    ] as const) {
      for (const hz of [f, f + beat]) {
        const g = ac.createGain();
        envelope(g.gain, t, a * force, 0.002, d);
        this.tone("triangle", t, hz, hz * 0.997, d + 0.05).connect(g);
        g.connect(shimmer);
      }
    }
  }

  /**
   * THE ONE DOOR FROM THE WIRE, and until this round three of the seven kinds
   * that come through it had no route on the other side.
   *
   * WHAT WAS WRONG. This method mapped a hit type onto an impact MATERIAL and
   * stopped. `parry`, `shove` and `knockdown` all carry `damage: 0`, and the
   * client never called this method off the wire at all — it derived a blow from
   * a health delta inside `if (p.health < prevHp - 0.5)`. A blow that takes
   * nothing off produces no delta, so the parry — the hero sound, the one event
   * with a dedicated shimmer, a duck of the whole mix behind it and five graded
   * claims in `soundtest` — HAD NEVER PLAYED. Not once, for any player, on any
   * input. Neither had a shove that came from the wire rather than from a state
   * flag, and a knockdown had no sound to reach.
   *
   * A gate on the synthesis alone is what let that ship: every claim `soundtest`
   * makes is of the form "IF this is fired, it sounds like this", and not one of
   * them can say whether the game ever fires it. `tools/soundwire.mjs` now reads
   * the engine's own `broadcast(... type: "hit" ...)` calls off disk and fails
   * if any kind it finds there has no route through this switch.
   */
  hit(e: WireHit): void {
    // The three that are not wounds. Each is its own event, not an impact with
    // the damage set to zero.
    if (e.type === "parry") {
      this.impact({ position: e.position, local: e.local, material: "parry", damage: 0, weapon: e.weapon });
      return;
    }
    if (e.type === "shove") { this.shove({ position: e.position, local: e.local, shield: e.shield === true, phase: "contact" }); return; }
    if (e.type === "knockdown") { this.knockdown({ position: e.position, local: e.local }); return; }
    if (e.type === "shield_burst") { this.splinter({ position: e.position, local: e.local }); return; }

    this.impact({
      position: e.position,
      local: e.local,
      material: materialFor(e.type, e.hitZone, e.damage ?? 0),
      damage: e.damage,
      heavy: e.type === "heavy" || e.type === "blocked_heavy",
      zone: e.hitZone ?? undefined,
      // The ATTACKER's class, not the target's. A caller that has the wire's
      // `attackerId` has this for free; one that does not gets the sword, which
      // is the middle of the range and the least wrong single answer.
      weapon: e.weapon,
      riposte: e.riposte === true,
    });
  }

  /**
   * A MAN GOING DOWN AND NOT GETTING UP THIS SECOND.
   *
   * The engine broadcasts `type:"knockdown"` the tick a man's poise runs out,
   * separately from the blow that spent it and always after it — its own comment
   * says a knockdown the client has to infer from a state change it might have
   * missed a snapshot of is a knockdown that does not get a sound. It did not
   * get one, because nothing on the client read the message.
   *
   * It is deliberately NOT a death and NOT a roll. A death has the breath going
   * out of him first and the body arriving a beat later; a roll is cloth and
   * turf with a man's weight travelling THROUGH it. This is weight arriving all
   * at once with no wind-up at all — he is dropped — and then thirty pounds of
   * mail and kit settling on top of him, which is the part nothing else has.
   */
  knockdown(e: AudioEvent): void {
    const s = this.spatial(e); if (!s) return;
    const out = this.claim(PRIORITY.IMPORTANT, 0.8, e.local === true); if (!out || !this.ac) return;
    const ac = this.ac, t = ac.currentTime, dest = this.sink(out, s);
    const g = s.gain;

    // The ground taking all of him at once. Low, immediate, and long.
    this.body(dest, t, 104, 41, 0.46 * g, 0.004, 0.42);
    // Turf and the flat of his back.
    const th = ac.createBiquadFilter();
    th.type = "lowpass";
    th.frequency.setValueAtTime(this.lift(520), t);
    th.frequency.exponentialRampToValueAtTime(this.lift(160), t + 0.24);
    const tg = ac.createGain();
    envelope(tg.gain, t, 0.20 * g, 0.003, 0.22);
    this.noiseAt(t, 0.3, 0.7).connect(th); th.connect(tg); tg.connect(dest);

    // THE KIT. Mail, a scabbard, a shield rim and a helm all arriving after the
    // man does and going on rattling once he has stopped. The long bright tail
    // is the whole signature: it is the only event in the game where the noise
    // OUTLASTS the thump instead of being its transient.
    const kit = ac.createBiquadFilter();
    kit.type = "bandpass"; kit.Q.value = 1.5;
    kit.frequency.setValueAtTime(4200, t + 0.03);
    kit.frequency.exponentialRampToValueAtTime(2200, t + 0.55);
    const kg = ac.createGain();
    envelope(kg.gain, t + 0.03, 0.17 * g, 0.010, 0.52);
    this.noiseAt(t + 0.03, 0.6, 1.25).connect(kit); kit.connect(kg); kg.connect(dest);
  }

  block(e: AudioEvent & { raise?: boolean }): void {
    if (e.raise) {
      // Leather and a shield rim coming up. Quiet: it happens constantly.
      const s = this.spatial(e); if (!s) return;
      const out = this.claim(PRIORITY.AMBIENT, 0.14, e.local === true); if (!out || !this.ac) return;
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

  /**
   * A ROLL IS A MAN HITTING THE GROUND, NOT AIR MOVING, and until this round it
   * was synthesised as air moving. That is why it was the closest thing in the
   * game to a sword swing, and — worse — why the two were only ever told apart
   * ON A LUCKY DRAW.
   *
   * Both were a single band of white noise. The only axes separating them were
   * attack (67 ms of whoosh against 20 ms of rustle) and brightness, and BOTH of
   * those are readings taken off one slice of the shared noise bed: the roll's
   * measured attack wandered between 14 and 32 ms across seeds while the swing's
   * sat at 65-71, so on a bad draw the ratio fell to 2.0x and the best single
   * axis between them dropped to 0.96 JND — under the 1.0 the gate requires,
   * with the shipped synth unchanged. `soundtest` reported 2.42 JND and called
   * it proven, because it had only ever looked at one draw.
   *
   * Two things move, and both of them are things a noise draw cannot touch:
   *
   *  1. A FIXED CORNER OVER THE BAND. A bandpass biquad falls at 6 dB/octave, so
   *     white noise through the 1450 Hz band below was still open to Nyquist and
   *     the event measured 3889 Hz — the identical fault the mail's transient
   *     was fixed for, and the identical fault that made the UI mallet
   *     unmeasurable. What the ear got was a bright hiss, not wool.
   *  2. THE MAN. A low body at the push-off and the landing, plus a turf scuff.
   *     `body()` is a tone: it lands the same every time, it puts a third of the
   *     event's energy under 400 Hz where a swing has two per cent, and it is
   *     the reason a roll now reads as weight moving rather than as a miss.
   */
  dodge(e: AudioEvent): void {
    const s = this.spatial(e); if (!s) return;
    const out = this.claim(e.local ? PRIORITY.IMPORTANT : PRIORITY.AMBIENT, 0.5, e.local === true);
    if (!out || !this.ac) return;
    const ac = this.ac, t = ac.currentTime, dest = this.sink(out, s);
    // Wool and hide dragged through air, under a fixed lid. See 1 above.
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass"; bp.Q.value = 0.95;
    bp.frequency.setValueAtTime(this.lift(1450), t);
    bp.frequency.exponentialRampToValueAtTime(this.lift(430), t + 0.26);
    const lid = ac.createBiquadFilter();
    lid.type = "lowpass"; lid.Q.value = 0.707;
    lid.frequency.value = this.lift(3100);
    const g = ac.createGain();
    // The lever was pulled on this one (R1) and it barely moved the reading:
    // 0.26 -> 0.60 shifted the whole event's centroid 449 -> 568 Hz. That is not
    // a broken knob, it is the band — 1450 Hz falling to 430 puts most of the
    // cloth's own energy under 400 Hz by the end of the sweep, so louder cloth
    // is not brighter cloth. Worth recording, because the obvious reading of a
    // dead knob here would have been "the rustle is not connected".
    envelope(g.gain, t, 0.34 * s.gain, 0.035, 0.25);
    this.noiseAt(t, 0.3, 0.75).connect(bp); bp.connect(lid); lid.connect(g); g.connect(dest);

    // The push-off, and then the shoulder and hip taking the turf 90 ms later.
    // Two body notes rather than one: a roll has a departure and an arrival, and
    // that pair of thumps is what nothing else in the game sounds like.
    //
    // Their WEIGHT is set against the rustle above rather than for its own sake.
    // The first build of this put 0.20/0.34 under a 1900 Hz lid and the event
    // came out at 288 Hz with all of its energy below 400 — a roll that measured
    // like a body being opened up, 2.11 JND from a heavy cut. A man rolling is
    // mostly cloth and turf with weight under it, not weight with cloth on top.
    this.body(dest, t, 132, 88, 0.13 * s.gain, 0.010, 0.14);
    this.body(dest, t + 0.09, 84, 47, 0.22 * s.gain, 0.016, 0.34);

    // Turf and grit under the shoulder. Short, dark, and the only noise in the
    // event that is allowed to be broadband.
    const scuff = ac.createBiquadFilter();
    scuff.type = "lowpass";
    scuff.frequency.setValueAtTime(this.lift(760), t + 0.09);
    scuff.frequency.exponentialRampToValueAtTime(this.lift(240), t + 0.30);
    const sg = ac.createGain();
    envelope(sg.gain, t + 0.09, 0.13 * s.gain, 0.006, 0.22);
    this.noiseAt(t + 0.09, 0.34, 0.85).connect(scuff); scuff.connect(sg); sg.connect(dest);
  }

  /**
   * TWO MOMENTS, AND THE ENGINE HAS ALWAYS HAD BOTH.
   *
   * `state === "shoving"` begins at the WIND-UP; `broadcast({type:"hit", data:
   * {type:"shove"}})` goes out `SHOVE.windup` later and only if somebody was
   * actually inside the arc. This method used to fire both halves off the state
   * edge alone, which meant a shove that hit nothing still drove a body note
   * into a man who was never touched — the same fault as deriving a blow from a
   * health delta, in the other direction.
   *
   * So `phase` splits them, and the split also puts each half where it belongs
   * in the world: the grunt comes from the man shoving, the thump from the man
   * being shoved. Default is both, which is what one shove sounds like end to
   * end and what `soundtest` grades as "shove shoulder" / "shove boss".
   */
  shove(e: AudioEvent & { shield?: boolean; phase?: "windup" | "contact" }): void {
    const s = this.spatial(e); if (!s) return;
    const wantsWindup = e.phase !== "contact";
    const wantsContact = e.phase !== "windup";
    const out = this.claim(e.local ? PRIORITY.IMPORTANT : PRIORITY.NORMAL, wantsContact ? 1.0 : 0.3, e.local === true);
    if (!out || !this.ac) return;
    const ac = this.ac, t = ac.currentTime, dest = this.sink(out, s);
    const g = s.gain;

    // The effort: breath forced out through the coil. Same cloth-and-air
    // palette as the dodge, pitched lower and shorter — a grunt, not a rush.
    if (wantsWindup) {
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass"; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(e.shield === true ? 1000 : 700, t);
      bp.frequency.exponentialRampToValueAtTime(e.shield === true ? 320 : 240, t + 0.22);
      const bg = ac.createGain();
      envelope(bg.gain, t, 0.16 * g, 0.03, 0.20);
      this.noiseAt(t, 0.26, 0.8).connect(bp); bp.connect(bg); bg.connect(dest);
    }
    if (!wantsContact) return;

    // The drive. When both halves are voiced together it sits 0.30 s later — the
    // same offset the server resolves the contact at (SHOVE.windup) — so the
    // thump lands with the impulse. Fired from the wire on its own, the wire IS
    // the impulse and there is nothing left to wait for.
    //
    // The local man's shove ducks the room like his heavy blows do: a shove is
    // the one thing in the game that moves another body and it has to land.
    const hit = t + (wantsWindup ? 0.30 : 0);
    if (e.local) this.duckNow(0.62, 0.16);
    // Shoulder or boss, and they are two different events, not one with a
    // decoration. THIS IS THE NEAREST THING THE GAME HAS TO "a haft into a
    // body": a huscarl drives with a disc of limewood and iron, everyone else
    // drives with a shoulder and a forearm. The shoulder is lower, slower and
    // duller; the boss cracks. Both are on the wire today — `GameCanvas` passes
    // `shield: !!slot.rig.shield` — which is why they are worth separating and
    // why a fifth impact MATERIAL for a haft strike is not: no event on the wire
    // produces one. See docs/SOUND.md.
    const boss = e.shield === true;
    // THE SHOULDER'S DRIVE IS SHORT NOW — 0.62 s of low body became 0.24 — and
    // that number is the fix for the closest pair in the game.
    //
    // A shoulder shove and a shield taking a heavy axe were 2.84 JND apart on a
    // bad noise draw against a bar of 3.0, and everything holding them apart was
    // draw-dependent: brightness (both are pure low end, 0.99 of their energy
    // under 400 Hz) and attack, whose reading on the shield wandered 39-54 ms
    // between seeds. Five of the seven axes were dead between them.
    //
    // DECAY was the axis to open, because it is the one that is TRUE. A limewood
    // shield is a sprung board on an iron boss and it rings on — the boards here
    // decay for 0.82 s deliberately. A shoulder into a mailed chest does not
    // ring at all: the air goes out of him and it is over. Both sides of that
    // comparison are `body()` tone decays, so it is a difference a noise draw
    // cannot move, and it takes the pair from 2.84 JND on its worst draw to
    // 3.37 against a bar of 3.0. It was 0.17 first, which read better still on a
    // desk and cost a phone the OTHER shove pair — see the fourth rim partial
    // above. 0.24 is where both hold.
    this.body(dest, hit, boss ? 168 : 88, boss ? 72 : 38, (boss ? 0.16 : 0.44) * g,
      boss ? 0.003 : 0.030, boss ? 0.055 : 0.24);
    const scuff = ac.createBiquadFilter();
    scuff.type = "lowpass";
    scuff.frequency.setValueAtTime(this.lift(boss ? 1200 : 340), hit);
    scuff.frequency.exponentialRampToValueAtTime(this.lift(boss ? 360 : 130), hit + 0.1);
    const sg = ac.createGain();
    envelope(sg.gain, hit, (boss ? 0.10 : 0.06) * g, 0.004, boss ? 0.09 : 0.16);
    this.noiseAt(hit, 0.2, 0.9).connect(scuff); scuff.connect(sg); sg.connect(dest);

    if (boss) {
      // The boss doing the pushing: the shield impact's wooden partials, at a
      // fraction of the blow's weight — this is the disc meeting a chest, not
      // an axe meeting the disc.
      for (const [f, a, d] of [[186, 0.16, 0.16], [279, 0.10, 0.12], [610, 0.07, 0.09]] as const) {
        this.body(dest, hit, f, f * 0.86, a * g, 0.003, d, "triangle");
      }
      // The rim above the boards. It is the whole of what a phone hears of a
      // shield shove — everything else is under the speaker's corner — and it is
      // why a disc and a shoulder stay two events down there and not one.
      //
      // THE FOURTH PARTIAL IS ABOVE 3 kHz AND IT IS THERE FOR THE PHONE.
      // Shortening the shoulder's drive fixed the closest pair on a desk and
      // broke a different one in a hand: on a desk the two shoves are 5.75 JND
      // apart and 4.58 of that is body below 400 Hz, which is exactly the band a
      // micro-speaker does not have. Through the speaker model they collapsed to
      // 0.93 JND — one sound — with the best axis a 1.22x difference in
      // brightness. Everything holding them apart had been the thing the phone
      // deletes. An iron edge speaks up here and a shoulder in wool cannot, so
      // the disc gets a partial the speaker reproduces perfectly and the
      // separation stops depending on a band the listener may not own.
      for (const [f, a, d] of [[1180, 0.32, 0.095], [1720, 0.23, 0.07], [2480, 0.15, 0.05], [3620, 0.34, 0.05]] as const) {
        const rg = ac.createGain();
        envelope(rg.gain, hit, a * g, 0.002, d);
        this.tone("triangle", hit, f, f * 0.97, d + 0.03).connect(rg); rg.connect(dest);
      }
    } else {
      // A shoulder into a chest: no ring at all, just the air going out of him
      // and cloth over mail. The dullest impact in the game on purpose — and now
      // the SHORTEST of the low events too, for the reason on the `body()` call
      // above. It was 0.52 s of falling rumble, which is a drum and not a barge.
      const th = ac.createBiquadFilter();
      th.type = "bandpass"; th.Q.value = 0.8;
      th.frequency.setValueAtTime(this.lift(330), hit);
      th.frequency.exponentialRampToValueAtTime(this.lift(110), hit + 0.28);
      const tgn = ac.createGain();
      envelope(tgn.gain, hit, 0.17 * g, 0.020, 0.26);
      this.noiseAt(hit, 0.26, 0.5).connect(th); th.connect(tgn); tgn.connect(dest);
    }
  }

  emote(e: AudioEvent & { emote: EmoteId; shield?: boolean }): void {
    const s = this.spatial(e); if (!s) return;
    // NORMAL even for the local man: a flourish must never steal a voice from
    // the blow that interrupts it.
    const out = this.claim(PRIORITY.NORMAL, 1.3, e.local === true); if (!out || !this.ac) return;
    const ac = this.ac, t = ac.currentTime, dest = this.sink(out, s);
    const g = s.gain * (e.local ? 1 : 0.8);

    /** One throat: bandpass noise swept between two formants. The whole voice
     *  family is this one shape at three different pitches and lengths, which
     *  is what keeps three emotes sounding like one warrior. */
    const cry = (at: number, f0: number, f1: number, amp: number, dur: number, q = 2.2) => {
      const bp = ac.createBiquadFilter();
      bp.type = "bandpass"; bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, at);
      bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
      const bg = ac.createGain();
      envelope(bg.gain, at, amp * g, 0.04, dur);
      this.noiseAt(at, dur + 0.05, 0.8).connect(bp); bp.connect(bg); bg.connect(dest);
      // The chest under the throat: a quiet fundamental sweeping the same way.
      const tg = ac.createGain();
      envelope(tg.gain, at, amp * 0.5 * g, 0.03, dur * 0.9);
      this.tone("sawtooth", at, f0 * 0.22, f1 * 0.22, dur).connect(tg); tg.connect(dest);
    };

    switch (e.emote) {
      case "raise": {
        // The war-shout rises with the blade and holds.
        cry(t + 0.10, 340, 620, 0.20, 0.55, 1.8);
        break;
      }
      case "boss": {
        // Two knocks on the clock the animator beats them: the strikes land at
        // the two drive peaks of the performance (~0.44 s and ~0.86 s in).
        for (const at of [t + 0.44, t + 0.86]) {
          if (e.shield !== false) {
            // The shield impact's wooden partials, lighter than a blow.
            for (const [f, a, d] of [[196, 0.16, 0.14], [294, 0.09, 0.10]] as const) {
              const rg = ac.createGain();
              envelope(rg.gain, at, a * g, 0.003, d);
              this.tone("triangle", at, f, f * 0.88, d + 0.04).connect(rg); rg.connect(dest);
            }
          } else {
            // The chest: a dull body note, no ring in it.
            this.body(dest, at, 110, 62, 0.20 * g, 0.004, 0.12);
          }
        }
        // A short grunt under the second knock — the effort of the rhythm.
        cry(t + 0.80, 420, 260, 0.08, 0.18, 1.6);
        break;
      }
      case "taunt": {
        // A falling two-note jeer: HA — haa. Mockery is downhill.
        cry(t + 0.12, 560, 400, 0.16, 0.22, 2.6);
        cry(t + 0.48, 470, 250, 0.18, 0.42, 2.6);
        break;
      }
    }
  }

  footfall(e: FootfallEvent): void {
    const s = this.spatial(e); if (!s) return;
    // Sixteen boots on the turf in one frame is a gravel avalanche. Four.
    if (!e.local && this.crowded("footfall", 4, 0.09)) return;
    const out = this.claim(PRIORITY.AMBIENT, 0.13, e.local === true); if (!out || !this.ac) return;
    const ac = this.ac, t = ac.currentTime, dest = this.sink(out, s);
    // The height field is the terrain description this game already has, so the
    // bank sounds drier and grittier than the ditch without a material map.
    const dry = clamp(((e.ground ?? 0) + 0.4) / 1.4, 0, 1);
    const w = clamp(e.weight ?? 0.5, 0, 1);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(this.lift(700) + 2400 * dry, t);
    lp.frequency.exponentialRampToValueAtTime(this.lift(220) + 500 * dry, t + 0.1);
    const g = ac.createGain();
    envelope(g.gain, t, (0.05 + 0.09 * w) * s.gain, 0.004, 0.09 + 0.03 * w);
    this.noiseAt(t, 0.14, 0.8 + 0.5 * dry).connect(lp);
    lp.connect(g); g.connect(dest);
    this.body(dest, t, 96 - 20 * dry, 52, (0.05 + 0.10 * w) * s.gain, 0.003, 0.08);
  }

  death(e: DeathEvent): void {
    const s = this.spatial(e); if (!s) return;
    const out = this.claim(PRIORITY.CRITICAL, 0.9, e.local === true); if (!out || !this.ac) return;
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
    this.body(dest, fall, 118, 44, 0.40 * g, 0.006, 0.26);
    const clatter = ac.createGain();
    const cf = ac.createBiquadFilter();
    cf.type = "bandpass"; cf.Q.value = 1.6; cf.frequency.value = 2600;
    this.noiseAt(fall, 0.3, 1.2).connect(cf); cf.connect(clatter); clatter.connect(dest);
    envelope(clatter.gain, fall, 0.13 * g, 0.004, 0.26);
  }

  sever(e: SeverEvent): void {
    const s = this.spatial(e); if (!s) return;
    const out = this.claim(PRIORITY.CRITICAL, 0.6, e.local === true); if (!out || !this.ac) return;
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
    // The rip runs LOWER than it did, and it is not a detail. At 2600 Hz falling
    // to 320 the whole severance measured 0.75 JND from a heavy axe turned by
    // mail — the two loudest events in the game, and a player could not tell
    // whether he had been blocked or opened up, which is the one thing this
    // module exists to tell him. Meat tearing is a wet mid-low sound; a hauberk
    // is a bright one. They had been meeting in the middle.
    const rip = ac.createBiquadFilter();
    rip.type = "bandpass"; rip.Q.value = 0.85;
    rip.frequency.setValueAtTime(this.lift(1500), t + 0.01);
    rip.frequency.exponentialRampToValueAtTime(this.lift(240), t + 0.01 + 0.30 * power);
    const rg = ac.createGain();
    envelope(rg.gain, t + 0.01, 0.34 * g, 0.010, 0.32 * power);
    this.noiseAt(t + 0.01, 0.3 * power, 0.6).connect(rip);
    rip.connect(rg); rg.connect(dest);

    // And the weight of it hitting the ground.
    this.body(dest, t + 0.02, 128, 44, 0.40 * g, 0.007, 0.30);
  }

  ability(e: AudioEvent & { warriorClass: WarriorClass }): void {
    const s = this.spatial(e); if (!s) return;
    const out = this.claim(PRIORITY.CRITICAL, 1.1, e.local === true); if (!out || !this.ac) return;
    const ac = this.ac, t = ac.currentTime, dest = this.sink(out, s);
    const g = s.gain * (e.local ? 1 : 0.7);

    switch (e.warriorClass) {
      case "huscarl": {
        // SHIELD WALL — iron planted. A low boom and the rim ringing over it,
        // both falling: the sound of something being set down and not moved.
        this.body(dest, t, 96, 48, 0.44 * g, 0.01, 0.55);
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
    //
    // IT IS THE SAME MALLET WHATEVER NOTE IT STRIKES, and that is not a detail.
    // This used to be a wide band (Q 1.1) tracking the note at `hz * 4.5`, and
    // that one line was the whole of the family's brightness problem:
    //
    //  - it made the contact noise the brightest thing in every screen sound
    //    AND made it climb with the note, so the octave-up flourish at the end
    //    of a purchase measured almost 2 kHz against a wooden 420 Hz for a lost
    //    match. The spread the harness caught was the mallet's, not the mode's.
    //  - worse, it was UNSTABLE. `noiseAt` starts at a random offset in the
    //    shared bed on purpose — it is what keeps a synthesised library from
    //    sounding machine-gunned — and through a wide band a different slice of
    //    white noise is a different spectrum. The same unchanged `purchase`
    //    measured 856 Hz on one run of soundtest and 1567 Hz on the next. Every
    //    reading anyone has taken of this family, including the 4.45x that put
    //    it on the owner's list, was a reading of that dice roll.
    //
    // Fixed and narrow, the contact is a constant across the eleven, the mode
    // is what separates them, and the measurement repeats.
    const mal = ac.createBiquadFilter();
    mal.type = "bandpass"; mal.Q.value = 2.6;
    mal.frequency.value = 1150;
    const mg = ac.createGain();
    envelope(mg.gain, t, 0.12 * gain, 0.001, 0.014);
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
    // The interface is always MINE: I pressed it. Near bus, never ducked.
    const out = this.claim(score.priority, span, true);
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
    const out = this.claim(PRIORITY.AMBIENT, 0.09, false);
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
    // The score's own clock. Before the mute gate on purpose: its drum
    // schedule must keep marching while muted (master is at zero — silence is
    // the GAIN's job) or unmuting would dump a bar of queued strokes at once.
    this.score?.update(dt);

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
    // The score falls silent but the DESIRE survives: dispose keeps the
    // context (browsers cap them), and the next build re-seats the scene the
    // caller last asked for.
    this.score?.set("off", 0);
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
