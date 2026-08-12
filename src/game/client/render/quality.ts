// Quality tiers. Every other render module reads QualitySettings and never
// asks the device anything itself, so a tier change is one object swap and a
// rebuild rather than a hunt through the renderer for `isMobile` checks.

import * as THREE from "three";
import type { PlayerState } from "../../types";

export type QualityTier = "high" | "medium" | "low";

export interface QualitySettings {
  tier: QualityTier;

  // ---- renderer ----
  /** Cap on devicePixelRatio. The single biggest fill-rate lever we have. */
  maxPixelRatio: number;
  /** Context-level MSAA. Dropped on low; postfx AA replaces it when it lands. */
  antialias: boolean;

  // ---- shadows ----
  shadows: boolean;
  shadowMapSize: number;
  /** PCFSoft costs ~4x the taps of PCF; low tier eats the hard edge. */
  softShadows: boolean;
  /** Half-extent of the key light's orthographic shadow frustum, in metres. */
  shadowDistance: number;

  // ---- textures ----
  /** Edge length of generated PBR maps. Generation cost is O(n²) — see VISUAL-BAR §4. */
  textureSize: number;
  /** Edge length of generated particle/decal sprites. */
  spriteSize: number;
  anisotropy: number;
  /** PMREM cube face size for the sky-derived environment map. */
  envMapSize: number;

  // ---- post-processing ----
  postProcessing: boolean;
  bloom: boolean;
  ambientOcclusion: boolean;
  depthOfField: boolean;
  colorGrade: boolean;
  vignette: boolean;

  // ---- vfx ----
  /** Multiplier applied to every requested particle count. */
  particleScale: number;
  /** Hard ceiling on live particles; bursts past it are dropped, not queued. */
  particleBudget: number;
  moteCount: number;
  decalBudget: number;
  trails: boolean;

  // ---- world ----
  /** Multiplier on scattered prop counts (rocks, tufts, debris). */
  propDensity: number;
  /** How many of the arena's torches get a real PointLight. */
  dynamicLights: number;
  instancing: boolean;

  // ---- hud ----
  damageNumberBudget: number;
}

export const QUALITY_PRESETS: Record<QualityTier, QualitySettings> = {
  high: {
    tier: "high",
    maxPixelRatio: 2,
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    softShadows: true,
    shadowDistance: 24,
    // 512, not 1024: `createTextureLibrary` clamps to it regardless of what this
    // says, so a preset claiming 1024 would be a number nothing can honour.
    //
    // The figure that used to live here was wrong and it was wrong in the
    // direction that made the ceiling look unarguable — it said "twenty PBR sets
    // at 1024² is ~290 MB". There are twenty-one recipes, only four of them are
    // `hero`, and `propSize` is always `heroSize >> 1`, so lifting this to 1024
    // would put four surfaces at 1024² and seventeen at 512², not twenty-one at
    // 1024². Through the library's own accounting (`texels * 4 * 3 * 1.34`) that
    // is 4 x 16.1 + 17 x 4.0 = **133 MB**, not 290. Still over §4's 40 MB budget,
    // so the ceiling survives — but it survives by 3.3x rather than 7x, and a
    // comment that doubles a number to win an argument is the `cheekOut` defect
    // wearing a different hat. The honest reason to hold 512 is the one on the
    // second line of textures.ts: these patterns are analytic, the detail lives
    // in the normal map, and 1024 buys memory pressure and nothing a player sees.
    textureSize: 512,
    spriteSize: 128,
    anisotropy: 8,
    envMapSize: 256,
    postProcessing: true,
    bloom: true,
    ambientOcclusion: true,
    depthOfField: true,
    colorGrade: true,
    vignette: true,
    particleScale: 1,
    particleBudget: 3000,
    moteCount: 220,
    decalBudget: 64,
    trails: true,
    propDensity: 1,
    dynamicLights: 5,
    instancing: true,
    damageNumberBudget: 48,
  },
  // THE PHONE TIER, and the rule that shapes it.
  //
  // The owner: "The quality of visuals & graphics is much lower on mobile […] we
  // need to try to get the best quality visuals possible on all screens."
  //
  // Every phone lands here or below (see `detectTier`), and the owner has since
  // measured his own handset: `high` stutters, `medium` is smooth. So the answer
  // to "make the phone look better" is NOT to let phones onto `high` — that has
  // been tried on real silicon and it lost. The answer is that `medium` was
  // carrying a set of deficits that have nothing to do with why `high` is
  // expensive, and those come to parity.
  //
  // The split is between knobs that cost FILL and knobs that cost SAMPLING:
  //
  //   fill      maxPixelRatio, shadowMapSize, depthOfField — quadratic in pixels
  //             or in shadow texels, paid every frame on every fragment. These
  //             are what made `high` stutter on the owner's phone. They stay
  //             down, and none of them was touched.
  //   sampling  anisotropy, envMapSize, spriteSize — a better answer out of the
  //             SAME number of fragments. Anisotropy is sampler state. The env
  //             map is a PMREM bake, and sky.ts bakes it once at load and about
  //             once more per mood change (`envCooldown` is 0.75 s and
  //             `MOOD_BLEND` is 1.4 s), not per frame — sampling it is one fetch
  //             either way. Sprite size is load-time canvas work and 0.3 MB.
  //             Cost per frame is flat or near enough, and on `medium` the env
  //             map is the ONLY specular source for every helm, blade and mail
  //             surface in the game — 128² was resolving a bonfire to a smudge.
  //
  // So: sampling comes to `high`'s numbers, fill does not. What a phone now
  // renders is a desktop frame at desktop sharpness with fewer pixels in it and
  // a softer shadow, which is a completely different complaint from the one the
  // owner made.
  medium: {
    tier: "medium",
    maxPixelRatio: 1.5,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    softShadows: true,
    shadowDistance: 24,
    textureSize: 512,
    spriteSize: 128,
    anisotropy: 8,
    envMapSize: 256,
    postProcessing: true,
    bloom: true,
    // AO is art direction, not an effect: without it nothing in the frame meets
    // anything else. postfx.ts tiers the sample counts down for medium and
    // refuses the pass outright on low, so the cost here is roughly half of
    // high's rather than all of it.
    ambientOcclusion: true,
    depthOfField: false,
    colorGrade: true,
    vignette: true,
    particleScale: 0.7,
    particleBudget: 1200,
    moteCount: 140,
    decalBudget: 24,
    trails: true,
    propDensity: 0.8,
    dynamicLights: 3,
    instancing: true,
    damageNumberBudget: 24,
  },
  low: {
    tier: "low",
    maxPixelRatio: 1,
    antialias: false,
    shadows: true,
    shadowMapSize: 512,
    softShadows: false,
    shadowDistance: 18,
    textureSize: 256,
    // The same fill/sampling split the `medium` block sets out, applied to the
    // tier that needs it most. Nothing here that costs per-fragment moved —
    // pixel ratio is still 1, the shadow map is still 512, bloom and AO are
    // still off. What moved is three knobs that were starving the frame of
    // information it had already paid to draw:
    //
    //   anisotropy 1  a lone trilinear tap on a 256² ground at fight distance is
    //                 the mush the owner sees first. 4x costs bandwidth only on
    //                 the grazing fragments, and a 256² map is small enough to
    //                 sit in cache while it does.
    //   sprite 32     five sprites. 64² takes all five from 27 KB to 105 KB and
    //                 stops a flame reading as eight visible squares.
    //   env 64        six faces of 64² resolves a bonfire to a warm smear, and
    //                 the specular smear is on every blade in the frame.
    //
    // Low drops effects, never art direction: the grade and vignette stay,
    // because they cost almost nothing and carry most of the mood.
    spriteSize: 64,
    anisotropy: 4,
    envMapSize: 128,
    postProcessing: true,
    bloom: false,
    ambientOcclusion: false,
    depthOfField: false,
    colorGrade: true,
    vignette: true,
    particleScale: 0.4,
    particleBudget: 400,
    moteCount: 60,
    decalBudget: 8,
    trails: false,
    propDensity: 0.55,
    dynamicLights: 1,
    instancing: true,
    damageNumberBudget: 12,
  },
};

export interface DeviceProbe {
  touch: boolean;
  /** navigator.hardwareConcurrency, or an optimistic guess where unreported. */
  cores: number;
  /** navigator.deviceMemory in GB, or an optimistic guess where unreported. */
  memoryGb: number;
  width: number;
  height: number;
  devicePixelRatio: number;
}

/** Safari reports neither core count nor memory; assume a current phone. */
const UNKNOWN_CORES = 6;
const UNKNOWN_MEMORY_GB = 6;

export function probeDevice(): DeviceProbe {
  if (typeof window === "undefined") {
    return { touch: false, cores: UNKNOWN_CORES, memoryGb: UNKNOWN_MEMORY_GB, width: 1920, height: 1080, devicePixelRatio: 1 };
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    touch: "ontouchstart" in window || navigator.maxTouchPoints > 0,
    cores: nav.hardwareConcurrency || UNKNOWN_CORES,
    memoryGb: nav.deviceMemory || UNKNOWN_MEMORY_GB,
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

const TIER_ORDER: readonly QualityTier[] = ["low", "medium", "high"];
const isTier = (v: unknown): v is QualityTier => v === "high" || v === "medium" || v === "low";
const step = (t: QualityTier, by: number): QualityTier =>
  TIER_ORDER[Math.max(0, Math.min(TIER_ORDER.length - 1, TIER_ORDER.indexOf(t) + by))];

/**
 * The device guess, and nothing else — no stored measurement, no player choice.
 * `resolveQuality` is what a caller normally wants; this is the cold-start seed
 * and the thing the tier harnesses reason about.
 *
 * WHAT WAS WRONG HERE. The old body was two lines and three hardcoded
 * thresholds, none of which measured anything:
 *
 *     const weak = probe.cores <= 4 || probe.memoryGb <= 4 || min(w,h) <= 320;
 *     return weak ? "low" : "medium";
 *
 * `navigator.deviceMemory` is specified to be quantised DOWNWARD to a power of
 * two and then capped at 8. A phone with 6 GB reports **4**. A phone with 7.9 GB
 * reports **4**. So `memoryGb <= 4` is not "this device has four gigabytes", it
 * is "this device has anything under eight", which is nearly every Android ever
 * shipped — and `low` is the tier where `packOrm` (textures.ts) strips
 * roughness, metalness and AO off every surface in the game. A 2025 flagship and
 * a 2016 budget handset were being told apart by a number that returns the same
 * value for both.
 *
 * `cores <= 4` fails the same way in the other direction: big.LITTLE phones
 * report their total core count, and a 4-core report on a modern SoC is a
 * deliberate under-report from a privacy-hardened browser, not a slow device.
 *
 * WHAT REPLACES IT. Cheap signals are kept, but only where they are UNAMBIGUOUS
 * after quantisation — a device reporting 2 GB really does have under 4, because
 * the cap only lies upward. Everything in the ambiguous middle starts at
 * `medium` and is then judged on measured frame time by `QUALITY_GOVERNOR`,
 * which is a real measurement where `deviceMemory` is a rumour. Degrade on
 * evidence; never on a rounding rule.
 *
 * WHY THERE IS STILL NO PATH TO `high` ON TOUCH, and this is deliberate. The
 * owner tested his own handset with `?quality=` pinned: `high` is laggy,
 * `medium` is smooth; on desktop `high` is fine. That is the only real-hardware
 * measurement this project owns and it says the ceiling is right. The governor
 * cannot honestly overturn it either: without `EXT_disjoint_timer_query` (which
 * mobile Safari does not expose) a vsync-locked 60 fps is indistinguishable from
 * a vsync-locked 60 fps with 5% headroom, so "smooth on medium" is not evidence
 * of "affordable on high". A player who knows better has the control — see
 * `setQualityPreference` — and that is the honest way past a ceiling we cannot
 * measure our way over. What closed the gap instead was raising `medium` itself
 * to `high`'s sampling numbers; see the note on the preset.
 */
export function detectTier(probe: DeviceProbe = probeDevice()): QualityTier {
  // Desktop-class machines only step down for a cramped window, and never on a
  // GL renderer string: the headless capture box reports SwiftShader, and its
  // frames are the ones the visual bar is scored against — they have to render
  // at the tier a real player's desktop gets.
  if (!probe.touch) return probe.width < 900 ? "medium" : "high";

  // The floor, and only signals that survive quantisation are allowed to set it.
  //
  //   cores <= 2      no phone shipped with a dual-core SoC after about 2015.
  //   memoryGb <= 2   `deviceMemory` rounds DOWN, so a 2 is a real ceiling of
  //                   under 4 GB. A 4 is not a ceiling of anything and is
  //                   therefore not tested — that was the defect.
  //   min side <= 320 a genuine floor; at that width the device predates all of
  //                   this. It used to be `< 400`, which every mainstream iPhone
  //                   fails (the 12 through 16 base models are 390–393 CSS px),
  //                   so the most common phone in the world was pinned to the
  //                   lowest tier on a number that says nothing about its GPU.
  //
  // Everything else starts at `medium` and has to EARN `low` by stuttering.
  const ancient = probe.cores <= 2 || probe.memoryGb <= 2 || Math.min(probe.width, probe.height) <= 320;
  return ancient ? "low" : "medium";
}

// ---------------------------------------------------------------------------
// What the player asked for, and what the device turned out to be able to do.
//
// Three sources feed the final tier, in this precedence:
//
//   1. an explicit pin      `?quality=` / `window.__quality`  — harnesses, support
//   2. the player's choice  persisted, set from the settings control
//   3. the governor's verdict, measured from frame time on this device
//   4. `detectTier`         the cold-start guess
//
// 2 and 3 live in localStorage. Storage can throw (Safari private mode, an
// embedded webview with cookies disabled), and a quality setting is never worth
// a crash, so every access here is wrapped and a failure degrades to the guess.
// ---------------------------------------------------------------------------

const PREF_KEY = "bbm.quality.pref";
const MEASURED_KEY = "bbm.quality.measured";
/** The highest tier the governor may promote back to. See its ratchet. */
const CEILING_KEY = "bbm.quality.ceiling";

function readStore(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key: string, value: string | null): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* a quality setting is not worth a crash */
  }
}

/**
 * What the player picked. `"auto"` means "you decide", which is the default and
 * the only value that lets the governor move the tier.
 */
export type QualityChoice = QualityTier | "auto";

/** In the order a settings control should list them: best first, auto last. */
export const QUALITY_CHOICES: readonly QualityChoice[] = ["high", "medium", "low", "auto"];

/** Menu labels, so two surfaces cannot drift into calling `high` two things. */
export const QUALITY_CHOICE_LABELS: Record<QualityChoice, string> = {
  high: "High",
  medium: "Balanced",
  low: "Fast",
  auto: "Automatic",
};

export function readQualityPreference(): QualityChoice {
  const v = readStore(PREF_KEY);
  return isTier(v) || v === "auto" ? v : "auto";
}

/**
 * Store the player's choice. Returns whether the running frame can honour it
 * without a reload — it cannot, and that is not laziness: the texture library,
 * the material library, the shadow maps, the post chain and every tier-branched
 * shader in sky.ts are built once from `QualitySettings` at forge time. Rebuild
 * is a reload. The caller decides how to say so; `applyQualityPreference` is the
 * blunt version.
 */
export function setQualityPreference(choice: QualityChoice): void {
  writeStore(PREF_KEY, choice === "auto" ? null : choice);
  // Touching this control at all discards the automatic story, including the
  // ratchet. Both directions matter and the second one is a trap that was in
  // here for an hour: a player who picks a tier has overruled a stale demotion,
  // and a player who picks "auto" is asking to be measured AGAIN — if the
  // ceiling `judge` wrote survived that, "Automatic" would be permanently
  // pinned to the worst thing this device ever did, on a browser update, on a
  // day the phone was hot, forever, with no way back.
  writeStore(MEASURED_KEY, null);
  writeStore(CEILING_KEY, null);
}

/** Persist the choice and rebuild the renderer the only way it can be rebuilt. */
export function applyQualityPreference(choice: QualityChoice): void {
  setQualityPreference(choice);
  if (typeof window !== "undefined") window.location.reload();
}

/** The governor's stored verdict for this device, if it has reached one. */
function readMeasuredTier(): QualityTier | null {
  const v = readStore(MEASURED_KEY);
  return isTier(v) ? v : null;
}

/**
 * Explicit tier pin, for capture harnesses and support ("try low quality").
 * `?quality=low` on the URL, or `window.__quality` set before the canvas mounts.
 */
export function readQualityOverride(): QualityTier | null {
  if (typeof window === "undefined") return null;
  const pinned = (window as unknown as Record<string, unknown>).__quality;
  if (isTier(pinned)) return pinned;
  try {
    const q = new URLSearchParams(window.location.search).get("quality");
    if (isTier(q)) return q;
  } catch {
    /* malformed query string is not worth a crash */
  }
  return null;
}

export function resolveQuality(override?: QualityTier | null): QualitySettings {
  const pin = override ?? readQualityOverride();
  const pref = readQualityPreference();
  const tier = pin ?? (pref === "auto" ? readMeasuredTier() ?? detectTier() : pref);
  // The governor only ever runs against a tier nobody pinned. Under `?quality=`
  // the whole point is that the tier stays put — a capture harness that got
  // silently demoted mid-run would be measuring a build nobody ships.
  if (!pin && pref === "auto") QUALITY_GOVERNOR.arm(tier);
  return { ...QUALITY_PRESETS[tier] };
}

/**
 * The renderer-level knobs that are purely a function of the tier — and the one
 * place both entry points (GameCanvas and armouryStage) hand the governor a
 * renderer, so a demotion has something to act on inside this file rather than
 * needing a hook in a file this module does not own.
 */
export function configureRenderer(renderer: THREE.WebGLRenderer, settings: QualitySettings): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.maxPixelRatio));
  renderer.shadowMap.enabled = settings.shadows;
  renderer.shadowMap.type = settings.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  QUALITY_GOVERNOR.attach(renderer);
}

// ---------------------------------------------------------------------------
// THE GOVERNOR — the only honest instrument on this side of the wire.
//
// The tier used to be decided entirely by `navigator.deviceMemory` and
// `hardwareConcurrency`, neither of which measures anything (see `detectTier`).
// This does: it counts the interval between presented frames, which is the exact
// quantity the owner is describing when he says a build is "laggy".
//
// WHAT IT WILL AND WILL NOT DO
//
//   demote   on two consecutive bad windows, at any tier. Takes effect at once
//            through pixel ratio — "the single biggest fill-rate lever we have"
//            — and is persisted so the next load starts from the right place.
//   promote  at most as far as `autoCeiling`, and only after a demotion has NOT
//            already ratcheted the ceiling down. This exists for one case: a
//            privacy-hardened browser that under-reports cores, whose device
//            `detectTier` had to assume was ancient and which then renders three
//            clean seconds at 60. It cannot cross `medium` on a touch device —
//            see `detectTier` for why that is a measurement problem and not
//            timidity.
//
// WHY A TIER CHANGE CANNOT LAND MID-SESSION. Everything downstream of
// `QualitySettings` is built once: the texture library sizes its maps from it,
// materials bind those maps, sky.ts compiles `octaves`/`shaftTaps` into its
// shaders as string literals, postfx builds its bloom chain from
// `BLOOM_LEVELS[tier]`. Swapping tiers live means rebuilding all of it, which is
// a load screen. Pixel ratio is the one lever that is genuinely live, so that is
// what moves now and the rest moves on the next load.
//
// WHY IT IS OFF UNDER AUTOMATION. `navigator.webdriver` is true in every
// Playwright page, and every harness in tools/ is a Playwright page. This box
// has no GPU and rasterises through SwiftShader at around one frame a second, so
// an armed governor would demote to `low` within three seconds and then PERSIST
// that verdict into the profile the next capture reuses. Every render in this
// repository would quietly become a `low` render and the sheets would still look
// plausible. That is the eleven-instances failure exactly: a measurement
// answering a question nobody asked.
// ---------------------------------------------------------------------------

/** Frames thrown away before sampling: shader links and first-touch uploads. */
const GOVERNOR_WARMUP = 120;
/** Frames per verdict window. 180 is three seconds at 60 Hz. */
const GOVERNOR_WINDOW = 180;
/** Consecutive windows that must agree. One GC storm must not cost a tier. */
const GOVERNOR_AGREE = 2;
/** Above this the tab was backgrounded or the process was suspended. Not a frame. */
const GOVERNOR_MAX_SANE_MS = 1000;
/** Sustained median worse than this is the "laggy" the owner reported: ~45 fps. */
const GOVERNOR_BAD_P50_MS = 22;
/** One frame in twenty over 50 ms reads as hitching even at a fine median. */
const GOVERNOR_BAD_P95_MS = 50;
/** Clean enough to be worth promoting out of a guessed floor: 50 fps, no tail. */
const GOVERNOR_GOOD_P50_MS = 20;
const GOVERNOR_GOOD_P95_MS = 33;

/**
 * The highest tier the governor may promote *to*. Touch stops at `medium`
 * because that is where the owner's real-hardware test put it and nothing here
 * can measure its way past that — see `detectTier`.
 */
function autoCeiling(): QualityTier {
  const stored = readStore(CEILING_KEY);
  if (isTier(stored)) return stored;
  return typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0)
    ? "medium"
    : "high";
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}

class QualityGovernor {
  private tier: QualityTier | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private frames: number[] = [];
  private last = 0;
  private warmup = GOVERNOR_WARMUP;
  private bad = 0;
  private good = 0;
  private running = false;
  private raf = 0;

  /** Last window's statistics, so a harness or a debug overlay can read them. */
  p50 = 0;
  p95 = 0;
  windows = 0;

  arm(tier: QualityTier): void {
    this.tier = tier;
    if (this.running) return;
    if (typeof window === "undefined" || typeof requestAnimationFrame !== "function") return;
    // See the module note: an armed governor under Playwright would persist a
    // SwiftShader verdict into every capture this repository takes.
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    this.running = true;
    this.last = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  attach(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    const prev = this.last;
    this.last = now;
    if (!prev) return;

    // A hidden tab does not present frames; whatever interval crosses the gap
    // describes the browser's scheduler and not this renderer.
    if (typeof document !== "undefined" && document.hidden) {
      this.frames.length = 0;
      return;
    }

    const dt = now - prev;
    if (dt <= 0 || dt > GOVERNOR_MAX_SANE_MS) {
      this.frames.length = 0;
      return;
    }
    if (this.warmup > 0) { this.warmup--; return; }

    this.frames.push(dt);
    if (this.frames.length < GOVERNOR_WINDOW) return;

    const sorted = this.frames.slice().sort((a, b) => a - b);
    this.frames.length = 0;
    this.windows++;
    this.p50 = percentile(sorted, 0.5);
    this.p95 = percentile(sorted, 0.95);
    this.judge();
  };

  private judge(): void {
    const tier = this.tier;
    if (!tier) return;

    if (this.p50 > GOVERNOR_BAD_P50_MS || this.p95 > GOVERNOR_BAD_P95_MS) {
      this.good = 0;
      if (++this.bad < GOVERNOR_AGREE) return;
      this.bad = 0;
      const next = step(tier, -1);
      if (next === tier) { this.stop(); return; }   // already on the floor
      this.tier = next;
      writeStore(MEASURED_KEY, next);
      // Ratchet. A device that has proved it cannot hold this tier must not be
      // handed back to it three clean seconds later and start oscillating.
      writeStore(CEILING_KEY, next);
      this.applyLive(next);
      return;
    }

    if (this.p50 <= GOVERNOR_GOOD_P50_MS && this.p95 <= GOVERNOR_GOOD_P95_MS) {
      this.bad = 0;
      if (++this.good < GOVERNOR_AGREE) return;
      this.good = 0;
      const next = step(tier, 1);
      if (next === tier || TIER_ORDER.indexOf(next) > TIER_ORDER.indexOf(autoCeiling())) {
        // Nothing left to win here. Stop counting rather than burn a callback a
        // frame for the rest of the match.
        this.stop();
        return;
      }
      this.tier = next;
      // Persisted only. Raising the tier means rebuilding the texture library,
      // the materials and every tier-branched shader — that is a load, and a
      // load in the middle of a fight to make the fight prettier is a bad trade.
      writeStore(MEASURED_KEY, next);
      return;
    }

    // In between: neither bad enough to act on nor clean enough to bank.
    this.bad = 0;
    this.good = 0;
  }

  /**
   * The half of a demotion that can happen without a rebuild. Pixel ratio is
   * quadratic in fill and is the only tier knob three will re-honour live; the
   * synthetic resize is what makes postfx re-size its composer and its occlusion
   * buffer to match, since it reads the ratio off the renderer rather than being
   * told (postfx.ts `setSize`).
   */
  private applyLive(tier: QualityTier): void {
    const r = this.renderer;
    if (!r || typeof window === "undefined") return;
    const ratio = Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[tier].maxPixelRatio);
    if (Math.abs(r.getPixelRatio() - ratio) < 0.01) return;
    r.setPixelRatio(ratio);
    try {
      window.dispatchEvent(new Event("resize"));
    } catch {
      /* an old webview without Event construction still gets the ratio drop */
    }
  }
}

export const QUALITY_GOVERNOR = new QualityGovernor();

// ---------------------------------------------------------------------------
// Cross-module frame vocabulary. It lives here because quality.ts is the one
// module everything else already imports, and because none of it carries
// behaviour — changing a field is a contract change for the whole directory.
// ---------------------------------------------------------------------------

/**
 * Render layer for everything that is in the frame but is not *surface* — the
 * in-world HUD plates, damage numbers, and every particle billboard.
 *
 * It exists for one reason: `GTAOPass` derives occlusion by re-rendering the
 * scene through `scene.overrideMaterial` into a depth+normal buffer, and that
 * override replaces the transparent, depth-write-off materials these objects
 * were built with. A nameplate against the sky therefore punches a hole in the
 * depth buffer and the occlusion pass draws a dark halo round it; a smoke puff
 * shades the warrior behind it. Both read as bugs and neither is one.
 *
 * The camera carries this layer enabled (camera.ts), so these objects render
 * normally; postfx.ts turns it off for the duration of the AO prepass alone.
 * Anything put here must not want to cast a shadow or occlude anything.
 */
export const LAYER_UNOCCLUDED = 1;

/** Puts an object and everything under it on a layer. Layers do not inherit. */
export function setLayerDeep(root: THREE.Object3D, layer: number): void {
  root.layers.set(layer);
  root.traverse((o) => o.layers.set(layer));
}

/** Arena mood. Drives fog, grade and light colour together, never separately. */
export type Mood = "dusk" | "lastStand";

export interface FrameContext {
  /** Seconds since the last frame, already scaled by hit-stop. */
  dt: number;
  /** Unscaled seconds since the last frame, for anything that must not slow. */
  rawDt: number;
  /** Monotonic seconds since page load — the shared animation clock. */
  time: number;
  camera: THREE.PerspectiveCamera;
  /** World-space point of interest: the local warrior, else the arena centre. */
  focus: THREE.Vector3;
  /** Id of the player this client controls. */
  localId: string;
  /** The local warrior's server state, or null while spectating. */
  localState: PlayerState | null;
  mood: Mood;
  quality: QualitySettings;
}

/** Every module returns a handle shaped like this. */
export interface RenderModule {
  update(dt: number, ctx: FrameContext): void;
  dispose(): void;
}
