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
    // 512, not 1024: the texture library clamps to it anyway (twenty PBR sets
    // at 1024² is ~290 MB against a 40 MB budget), and a preset that claims a
    // number nothing can honour is worse than no preset at all.
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
  medium: {
    tier: "medium",
    maxPixelRatio: 1.5,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    softShadows: true,
    shadowDistance: 24,
    textureSize: 512,
    spriteSize: 64,
    anisotropy: 4,
    envMapSize: 128,
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
    spriteSize: 32,
    anisotropy: 1,
    envMapSize: 64,
    // Low drops effects, never art direction: the grade and vignette stay,
    // because they cost almost nothing and carry most of the mood.
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

/**
 * Measured on real hardware, which nothing else in this project has been: the
 * development box has no GPU and rasterises in software at about 1 fps, so every
 * tier decision before this was reasoned rather than observed.
 *
 * The owner tested his own phone and desktop with `?quality=` pinned:
 *   phone   — `high` is laggy, `medium` is smooth.  Ceiling confirmed correct.
 *   desktop — `high` is fine.
 *
 * So `medium` is not a compromise for phones, it is the right answer, and the
 * only thing that was ever wrong here was the floor dropping good phones below
 * it. Do not raise the phone ceiling to `high` on a hunch — it has been tried
 * on a real device and it stutters.
 */
export function detectTier(probe: DeviceProbe = probeDevice()): QualityTier {
  // Desktop-class machines only step down for a cramped window, and never on a
  // GL renderer string: the headless capture box reports SwiftShader, and its
  // frames are the ones the visual bar is scored against — they have to render
  // at the tier a real player's desktop gets.
  if (!probe.touch) return probe.width < 900 ? "medium" : "high";

  // Phones have a real floor. Any one weak signal is enough — stuttering at
  // 30 fps is a worse experience than a softer shadow.
  //
  // Screen width is NOT one of those signals, and used to be: the test was
  // `< 400`, which every mainstream iPhone fails. The 12 through 16 base models
  // are 390–393 CSS px wide, so the most common phone in the world was pinned to
  // the lowest tier on a number that says nothing about its GPU. 320 is kept as
  // a genuine floor — at that width the device predates any of this.
  const weak = probe.cores <= 4 || probe.memoryGb <= 4 || Math.min(probe.width, probe.height) <= 320;
  return weak ? "low" : "medium";
}

/**
 * Explicit tier pin, for capture harnesses and support ("try low quality").
 * `?quality=low` on the URL, or `window.__quality` set before the canvas mounts.
 */
export function readQualityOverride(): QualityTier | null {
  if (typeof window === "undefined") return null;
  const valid = (v: unknown): v is QualityTier => v === "high" || v === "medium" || v === "low";
  const pinned = (window as unknown as Record<string, unknown>).__quality;
  if (valid(pinned)) return pinned;
  try {
    const q = new URLSearchParams(window.location.search).get("quality");
    if (valid(q)) return q;
  } catch {
    /* malformed query string is not worth a crash */
  }
  return null;
}

export function resolveQuality(override?: QualityTier | null): QualitySettings {
  const tier = override ?? readQualityOverride() ?? detectTier();
  return { ...QUALITY_PRESETS[tier] };
}

/** The renderer-level knobs that are purely a function of the tier. */
export function configureRenderer(renderer: THREE.WebGLRenderer, settings: QualitySettings): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.maxPixelRatio));
  renderer.shadowMap.enabled = settings.shadows;
  renderer.shadowMap.type = settings.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
}

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
