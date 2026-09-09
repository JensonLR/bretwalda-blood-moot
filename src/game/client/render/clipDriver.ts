// THE CLIP DRIVER — playing the motion Blender authored, at last.
//
// WHY THIS EXISTS. Fifteen hand-authored clips ship inside every
// `warrior-<cls>.glb`. They are downloaded, parsed, and checked by name — and
// then thrown away. `authored.ts:warriorIsUsable` reduces them to a set of
// names and asserts twelve are present; that is the ONLY use of `clips` in the
// whole codebase, and `upgradeRigToAuthored` goes on to swap geometry, skinning
// and materials while re-pointing `rig.pivots` at the authored bones so the
// PROCEDURAL pose layers keep driving them. `grep -rn "AnimationMixer" src/`
// returned nothing at all: there was no object in this client capable of
// evaluating an AnimationClip.
//
// So `clips.py` goes to real trouble to give each contact frame VECTOR
// interpolation handles — "a swing must not decelerate into its own contact" —
// and that curve shaping was authored, exported, shipped, validated, and never
// sampled. `tools/cliptime.mjs` even gates the clips' contact frames against
// server timing to within one frame of error, guarding a synchronisation that
// did not happen.
//
// ---------------------------------------------------------------------------
// THE ONE IDEA THAT MAKES THIS SAFE: THE SERVER OWNS THE CLOCK.
//
// A mixer left to free-run is a second clock, and a second clock is exactly the
// defect this project has paid for over and over — `cliptime` exists because a
// drift between the engine's stroke and the renderer's is "a swing that
// finishes on the client before it lands on the server".
//
// So an ATTACK is never played. It is SCRUBBED: the action's time is written
// every frame from `swingT / swingDuration`, both of which are on the wire.
// The clip cannot drift, cannot finish early, cannot be late, and a client
// running at 30 fps and one at 144 show the same blade at the same instant
// because both are reading the same number off the same packet.
//
// Locomotion and idle DO free-run — nothing on the wire says where in a stride
// a man is, and a foot's phase is not authoritative state.
//
// ---------------------------------------------------------------------------
// WHAT THIS DELIBERATELY DOES NOT DO YET, so nobody reads more into it.
//
// It replaces the pose. It does not yet re-apply the procedural CORRECTIONS
// that the pose layers carry for free: `settleOnFeet` (foot planting on
// uneven turf), `groundBlade` (the blade-aim solve that keeps a long weapon out
// of the ground) and the wrist solve. The cloth solver still runs, because it
// integrates off the drape bones rather than off `P`.
//
// That is why this is behind its own flag on top of `?authored=1` rather than
// switched on: the honest state is "the authored motion plays and can be
// judged", not "the authored path is better". `docs/BLENDER-PIPELINE.md` §7
// carries the argument.
import * as THREE from "three";

/** The clip names `clips.py` authors. Kept here as the driver's own vocabulary. */
export const CLIP_NAMES = [
  "idle", "walk", "run",
  "attack", "attackLeft", "attackOverhead", "attackStab", "heavy",
  "block", "dodge", "die",
  "hit", "hitLeft", "hitOverhead", "hitStab",
] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

/**
 * Everything the driver needs, and nothing it does not.
 *
 * A small struct rather than the whole `GamePlayer` so this file can be driven
 * from a harness without standing up a room — which is the difference between a
 * gate that measures the real state machine and one that measures a mock.
 */
export interface ClipIntent {
  /** The pose group, in `anim.ts`'s own vocabulary. */
  group: "idle" | "move" | "attacking" | "blocking" | "dodging" | "staggered" | "down" | "dead" | "ability" | "shoving";
  /** Which way the blow goes: the server's `attackDir`. */
  dir?: "left" | "right" | "overhead" | "stab";
  heavy?: boolean;
  /** Seconds into the stroke, and the stroke's length. Both off the wire. */
  swingT?: number;
  swingDuration?: number;
  /** Ground speed, m/s — picks walk against run and sets their rate. */
  speed?: number;
  /** Seconds since the one-shot began, for the clips the wire does not clock. */
  actT?: number;
}

/** How fast a man has to be moving before `run` takes over from `walk`. */
const RUN_AT = 3.6;
/** The stride the `walk` clip was authored at, so its rate can follow the man. */
const WALK_AT = 2.2;
/** Crossfade, in seconds. Short: a fight changes state faster than a blend. */
const FADE = 0.12;
/** ...and shorter still into a swing, where the windup is doing the work. */
const FADE_ATTACK = 0.05;

/** Which clip a given intent wants. Null means "this driver has nothing". */
export function clipFor(i: ClipIntent): ClipName | null {
  switch (i.group) {
    case "attacking":
      if (i.heavy) return "heavy";
      return i.dir === "left" ? "attackLeft"
        : i.dir === "overhead" ? "attackOverhead"
          : i.dir === "stab" ? "attackStab" : "attack";
    case "blocking": return "block";
    case "dodging": return "dodge";
    case "dead": return "die";
    case "staggered":
      return i.dir === "left" ? "hitLeft"
        : i.dir === "overhead" ? "hitOverhead"
          : i.dir === "stab" ? "hitStab" : "hit";
    case "move": return (i.speed ?? 0) >= RUN_AT ? "run" : "walk";
    case "idle": return "idle";
    // Knocked down, rising, casting, shoving: clips.py authors none of these,
    // and inventing a substitute would be worse than the procedural pose that
    // already handles them. The caller falls back.
    default: return null;
  }
}

/**
 * Should this clip's time be written from the wire rather than advanced?
 *
 * Everything with an authoritative clock on the packet. A stride has none, so
 * `walk`/`run`/`idle` free-run; a swing has `swingT` and MUST be scrubbed, or
 * the blade and the damage come apart.
 */
export function isScrubbed(c: ClipName): boolean {
  return c === "attack" || c === "attackLeft" || c === "attackOverhead"
    || c === "attackStab" || c === "heavy";
}

export interface ClipDriver {
  /**
   * Drive one frame. Returns the clip that is playing, or null when the driver
   * has nothing for this state and the caller should pose procedurally.
   */
  update(dt: number, intent: ClipIntent): ClipName | null;
  /** Which clips actually arrived, for a harness and for the refusal message. */
  readonly have: ReadonlySet<string>;
  dispose(): void;
}

/**
 * Bind a mixer to an authored body.
 *
 * Returns null rather than throwing on anything unusable — the law this whole
 * path is written under (`authoredSource.ts`): an authored asset must never be
 * the only way a thing can be drawn. A null here means the procedural pose keeps
 * the body, which is exactly what happened before this file existed.
 */
export function createClipDriver(
  root: THREE.Object3D,
  clips: readonly THREE.AnimationClip[],
): ClipDriver | null {
  if (!root || !clips || !clips.length) return null;
  let mixer: THREE.AnimationMixer;
  try { mixer = new THREE.AnimationMixer(root); } catch { return null; }

  const actions = new Map<string, THREE.AnimationAction>();
  const have = new Set<string>();
  for (const c of clips) {
    if (!c || typeof c.name !== "string") continue;
    try {
      const a = mixer.clipAction(c);
      a.enabled = true;
      a.setLoop(c.name === "idle" || c.name === "walk" || c.name === "run"
        ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = true;
      actions.set(c.name, a);
      have.add(c.name);
    } catch { /* one bad clip is not a dead driver */ }
  }
  // Nothing to stand a man on. Idle is the floor: a driver that cannot hold a
  // resting pose would hand the body back to the procedural stack every time a
  // fight paused, which reads worse than never taking it.
  if (!actions.has("idle")) { mixer.stopAllAction(); return null; }

  let current: ClipName | null = null;

  return {
    have,
    update(dt, intent) {
      const want = clipFor(intent);
      const act = want ? actions.get(want) : undefined;
      if (!want || !act) {
        // Hand the body back. Weights go to zero so the mixer stops writing
        // bones the procedural pose is about to write itself — two authors on
        // one rotation is the one thing that cannot be allowed to happen.
        if (current) {
          for (const a of actions.values()) { a.stop(); a.setEffectiveWeight(0); }
          current = null;
        }
        return null;
      }
      if (want !== current) {
        const from = current ? actions.get(current) : undefined;
        act.reset();
        act.setEffectiveWeight(1);
        act.play();
        if (from && from !== act) from.crossFadeTo(act, isScrubbed(want) ? FADE_ATTACK : FADE, false);
        current = want;
      }
      if (isScrubbed(want)) {
        // THE SERVER'S CLOCK, WRITTEN ONTO THE CLIP. `paused` so the mixer does
        // not also advance it — the two together would run the stroke at
        // roughly double rate and put the blade past the target before contact.
        const dur = act.getClip().duration;
        const f = Math.max(0, Math.min(1, (intent.swingT ?? 0) / Math.max(1e-3, intent.swingDuration ?? 1)));
        act.paused = true;
        act.time = f * dur;
      } else {
        act.paused = false;
        // A stride's rate follows the man, so a walk does not skate. Clamped:
        // a clip played at a tenth of its rate reads as a man wading.
        act.timeScale = want === "walk" || want === "run"
          ? Math.max(0.55, Math.min(1.8, (intent.speed ?? WALK_AT) / (want === "run" ? RUN_AT : WALK_AT)))
          : 1;
      }
      mixer.update(dt);
      return want;
    },
    dispose() {
      try { mixer.stopAllAction(); mixer.uncacheRoot(root); } catch { /* already gone */ }
      actions.clear();
    },
  };
}
