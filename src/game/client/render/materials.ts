// Shared material instances for the arena.
//
// Every material the world builds comes from here so that a texture or PBR
// change happens once, not forty times across a build loop, and so the arena's
// forty palisade stakes share one program and one uniform block. Materials that
// are mutated per-instance (health-bar tint, damage numbers) deliberately do
// NOT live here — see hud3d.ts.
//
// The colour numbers in the catalog are the arena's art direction and they
// still mean exactly what they meant before anything was textured. That is not
// automatic: `map × color` would otherwise multiply the substance's own colour
// into the catalog's and land somewhere much darker. Every textured material's
// colour is therefore divided by its map's mean, so the two multiply back out
// to the number written here. Change a catalog colour and you change what that
// surface reads as; change nothing and the arena grades the same as it did.

import * as THREE from "three";
import type { QualitySettings } from "./quality";
import type { TextureLibrary, SurfaceName, SurfaceInfo, TextureSet } from "./textures";

export type MaterialName =
  // ground & terrain
  | "ground"
  | "grassTuft"
  | "rock"
  // palisade & timber
  | "palisade"
  | "palisadeBinding"
  | "poleWood"
  // torches & fire
  | "torchCup"
  | "torchFlame"
  | "bonfireLog"
  | "bonfireFlame"
  // settlement
  | "hutWall"
  | "hutRoof"
  | "hutDoor"
  | "barrel"
  | "barrelBand"
  // heraldry
  | "bannerRed"
  | "bannerBlue"
  // war gear scattered around the moot
  | "spearShaft"
  | "spearTip"
  | "debrisBlade"
  | "debrisHilt"
  // runestone
  | "runestone"
  | "runeGlow"
  // gore
  | "bloodDecal"
  // sky
  | "skyDome"
  | "moonDisc"
  | "moonGlow";

export interface MaterialLibrary {
  get(name: MaterialName): THREE.Material;
  /**
   * A substance in a colour that is not in the catalog — the armoury's finishes,
   * a player's cloak, a skin tone. Cached by its arguments, so a lobby full of
   * warriors in Rough Iron shares one program. The colour lands where it was
   * asked for; the map supplies rings, weave, wear and dirt around it.
   */
  tinted(surface: SurfaceName, color: number, opts?: TintOptions): THREE.MeshStandardMaterial;
  /** Mail, or the plate the finish implies — Polished Steel is not mail. */
  armour(color: number): THREE.MeshStandardMaterial;
  /** Woven kit: tunics, cloaks, banners, leg wraps. */
  tunic(color: number): THREE.MeshStandardMaterial;
  /** Belts, bracers, boots, straps, scabbards. */
  hide(color: number): THREE.MeshStandardMaterial;
  flesh(color: number): THREE.MeshStandardMaterial;
  /** Edged metal. Roughness overrides the substance for a keener or duller blade. */
  blade(color: number, roughness?: number): THREE.MeshStandardMaterial;
  timber(color: number): THREE.MeshStandardMaterial;
  /**
   * Escape hatch for one-off surfaces that have not earned a name yet. Cached
   * by its arguments, so repeated calls share one instance. Untextured — reach
   * for `tinted` first.
   */
  standard(color: number, roughness?: number, metalness?: number): THREE.MeshStandardMaterial;
  /**
   * Point every PBR material at the sky's PMREM. Called by the orchestrator
   * once sky.ts has an environment to give; until then metals return flat grey.
   */
  setEnvironment(env: THREE.Texture | null, intensity?: number): void;
  dispose(): void;
}

export interface TintOptions {
  roughness?: number;
  metalness?: number;
  /** UV repeats. Defaults to whatever the substance was drawn for. */
  repeat?: number;
}

type Spec =
  | {
      kind: "standard";
      color: number;
      roughness: number;
      metalness: number;
      surface?: SurfaceName;
      /** UV repeats on this mesh. Cylinders and boxes want very different numbers. */
      repeat?: [number, number];
      emissive?: number;
      emissiveIntensity?: number;
      opacity?: number;
      vertexColors?: boolean;
      /** Cut-out decal: alpha comes from the albedo, and it must not write depth. */
      decal?: boolean;
    }
  | { kind: "basic"; color: number; opacity?: number; side?: THREE.Side; fog?: boolean; vertexColors?: boolean };

// The colour/roughness numbers here are the arena's art direction. They came
// out of the original inline build code unchanged; treat a change to one as a
// change to how that substance reads, not as a tweak. `surface` says what the
// thing is made of, `repeat` says how big that substance is on this mesh —
// texel density has to stay consistent between objects or §2 of the bar fails.
const CATALOG: Record<MaterialName, Spec> = {
  ground:          { kind: "standard", color: 0xffffff, roughness: 0.96, metalness: 0, vertexColors: true, surface: "groundDetail", repeat: [22, 22] },
  grassTuft:       { kind: "standard", color: 0x4a5c2e, roughness: 0.95, metalness: 0, surface: "grass", repeat: [1, 1] },
  rock:            { kind: "standard", color: 0x6a7078, roughness: 0.98, metalness: 0, surface: "granite", repeat: [2, 2] },

  palisade:        { kind: "standard", color: 0x5a4127, roughness: 0.95, metalness: 0, surface: "oak", repeat: [2, 5] },
  palisadeBinding: { kind: "standard", color: 0x2a2018, roughness: 0.98, metalness: 0, surface: "rope", repeat: [8, 1] },
  poleWood:        { kind: "standard", color: 0x4a3018, roughness: 0.9, metalness: 0, surface: "oak", repeat: [2, 6] },

  torchCup:        { kind: "standard", color: 0x2a2a2e, roughness: 0.5, metalness: 0.7, surface: "iron", repeat: [2, 1] },
  torchFlame:      { kind: "standard", color: 0xffbb44, roughness: 1, metalness: 0, emissive: 0xff7711, emissiveIntensity: 5 },
  bonfireLog:      { kind: "standard", color: 0x3a2515, roughness: 0.98, metalness: 0, surface: "oak", repeat: [1, 4] },
  bonfireFlame:    { kind: "standard", color: 0xffaa33, roughness: 1, metalness: 0, emissive: 0xff5500, emissiveIntensity: 3.5, opacity: 0.9 },

  hutWall:         { kind: "standard", color: 0x6a553c, roughness: 0.95, metalness: 0, surface: "plank", repeat: [3, 2] },
  hutRoof:         { kind: "standard", color: 0x41301c, roughness: 0.98, metalness: 0, surface: "thatch", repeat: [7, 3] },
  hutDoor:         { kind: "standard", color: 0x2a1c0e, roughness: 0.95, metalness: 0, surface: "plank", repeat: [1, 2] },
  barrel:          { kind: "standard", color: 0x6a4a28, roughness: 0.9, metalness: 0, surface: "plank", repeat: [4, 1] },
  barrelBand:      { kind: "standard", color: 0x3a3a3e, roughness: 0.5, metalness: 0.7, surface: "iron", repeat: [6, 1] },

  bannerRed:       { kind: "standard", color: 0x8a2530, roughness: 0.9, metalness: 0, surface: "linen", repeat: [3, 5] },
  bannerBlue:      { kind: "standard", color: 0x2c4a8a, roughness: 0.9, metalness: 0, surface: "linen", repeat: [3, 5] },

  spearShaft:      { kind: "standard", color: 0x5a3c22, roughness: 0.85, metalness: 0, surface: "oak", repeat: [1, 8] },
  spearTip:        { kind: "standard", color: 0xb8bfc8, roughness: 0.2, metalness: 0.9, surface: "steel", repeat: [1, 1] },
  debrisBlade:     { kind: "standard", color: 0xaab2bc, roughness: 0.3, metalness: 0.8, surface: "steel", repeat: [1, 3] },
  debrisHilt:      { kind: "standard", color: 0x3a2a18, roughness: 0.9, metalness: 0, surface: "leather", repeat: [1, 1] },

  runestone:       { kind: "standard", color: 0x7a7d84, roughness: 0.92, metalness: 0, surface: "granite", repeat: [1, 3] },
  runeGlow:        { kind: "standard", color: 0x66c8ff, roughness: 0.4, metalness: 0, emissive: 0x2288dd, emissiveIntensity: 2.4 },

  bloodDecal:      { kind: "standard", color: 0x4a0a08, roughness: 0.35, metalness: 0, surface: "blood", repeat: [1, 1], decal: true },

  skyDome:         { kind: "basic", color: 0xffffff, vertexColors: true, side: THREE.BackSide, fog: false },
  moonDisc:        { kind: "basic", color: 0xf0e8d8, fog: false },
  moonGlow:        { kind: "basic", color: 0xd4dde8, opacity: 0.25, fog: false },
};

/**
 * The armoury sells finishes, and a finish is a different metal, not a coat of
 * paint. Anything not listed is a tinted mail hauberk.
 */
const FINISH_SUBSTRATE: Record<number, SurfaceName> = {
  0x8a97a5: "steel",  // Polished Steel
  0x2a2f38: "iron",   // Blackened Steel
  0x8a6a3a: "bronze", // Bronze Scales
};

/**
 * Divides a requested colour by the map's mean so `map × color` averages out to
 * the colour that was asked for. Without this, texturing a material silently
 * darkens it by the albedo's own brightness and the whole palette drifts.
 */
function compensate(hex: number, mean: readonly [number, number, number]): THREE.Color {
  // The floor has to sit below the darkest channel any map actually has —
  // blackened iron and blood are down at 0.003 linear, and a floor above that
  // silently shifts their hue instead of preserving it. The ceiling only exists
  // so a mistake somewhere upstream cannot produce an emissive-looking surface.
  const c = new THREE.Color(hex);
  c.r = Math.min(8, c.r / Math.max(0.004, mean[0]));
  c.g = Math.min(8, c.g / Math.max(0.004, mean[1]));
  c.b = Math.min(8, c.b / Math.max(0.004, mean[2]));
  return c;
}

export function createMaterialLibrary(
  textures: TextureLibrary,
  settings: QualitySettings,
): MaterialLibrary {
  // Kept even though nothing reads it: which maps a tier carries is decided in
  // textures.ts, where the memory is actually spent, and a material-level tier
  // decision (a cheaper shading model on low, say) should not have to ripple a
  // signature change out through the orchestrator to get here.
  void settings;

  const named = new Map<MaterialName, THREE.Material>();
  const adhoc = new Map<string, THREE.MeshStandardMaterial>();
  const tints = new Map<string, THREE.MeshStandardMaterial>();
  let env: THREE.Texture | null = null;
  let envIntensity = 1;

  /**
   * Applies a surface's maps and reconciles the scalars the maps now modulate.
   * Which maps exist is the texture library's call, not this one's — the low
   * tier hands back albedo and normal only, and every branch below reads as
   * "if there is a map for this, defer to it".
   */
  function dress(
    m: THREE.MeshStandardMaterial,
    surface: SurfaceName,
    repeat: [number, number],
    color: number,
    roughness: number,
    metalness: number,
  ): void {
    const info: SurfaceInfo = textures.info(surface);
    const maps: TextureSet = textures.tiled(surface, repeat[0], repeat[1]);

    // Assigned rather than passed to the constructor, because three warns
    // loudly about parameters that are present but undefined.
    if (maps.map) m.map = maps.map;
    if (maps.normalMap) {
      m.normalMap = maps.normalMap;
      m.normalScale.set(info.normalScale, info.normalScale);
    }
    if (maps.roughnessMap) m.roughnessMap = maps.roughnessMap;
    // Only metals carry anything in .b, and binding the map anyway would cost
    // every plank and tunic in the arena a texture fetch that returns zero.
    if (maps.metalnessMap && info.metalness > 0) m.metalnessMap = maps.metalnessMap;
    if (maps.aoMap) {
      m.aoMap = maps.aoMap;
      m.aoMapIntensity = info.aoIntensity;
    }

    m.color.copy(compensate(color, info.mean));

    // three multiplies the scalar by the map channel, so with an ORM attached
    // the scalar becomes a bias against what the substance was authored at —
    // that is how `palisade` stays a touch rougher than `poleWood`.
    if (maps.roughnessMap) {
      m.roughness = Math.min(2, roughness / Math.max(0.05, info.roughness));
    } else {
      m.roughness = roughness;
    }
    if (m.metalnessMap) {
      m.metalness = Math.min(2, metalness / info.metalness);
    } else {
      m.metalness = metalness;
    }

    if (info.cutout) {
      m.transparent = true;
      m.depthWrite = false;
      m.alphaTest = 0.04;
    }
  }

  function build(name: MaterialName, spec: Spec): THREE.Material {
    if (spec.kind === "basic") {
      return new THREE.MeshBasicMaterial({
        color: spec.color,
        vertexColors: spec.vertexColors ?? false,
        side: spec.side ?? THREE.FrontSide,
        fog: spec.fog ?? true,
        transparent: spec.opacity !== undefined,
        opacity: spec.opacity ?? 1,
      });
    }
    const m = new THREE.MeshStandardMaterial({
      color: spec.color,
      roughness: spec.roughness,
      metalness: spec.metalness,
      vertexColors: spec.vertexColors ?? false,
      emissive: spec.emissive ?? 0x000000,
      emissiveIntensity: spec.emissiveIntensity ?? 1,
      transparent: spec.opacity !== undefined,
      opacity: spec.opacity ?? 1,
    });
    m.name = name;
    if (spec.surface) {
      dress(m, spec.surface, spec.repeat ?? [1, 1], spec.color, spec.roughness, spec.metalness);
    }
    if (spec.decal) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
    }
    return m;
  }

  function adopt(m: THREE.Material): THREE.Material {
    if (env && m instanceof THREE.MeshStandardMaterial) {
      m.envMap = env;
      m.envMapIntensity = envIntensity;
      m.needsUpdate = true;
    }
    return m;
  }

  function tint(surface: SurfaceName, color: number, opts: TintOptions = {}): THREE.MeshStandardMaterial {
    const info = textures.info(surface);
    const repeat = opts.repeat ?? info.repeat;
    const roughness = opts.roughness ?? info.roughness;
    const metalness = opts.metalness ?? info.metalness;
    const key = `${surface}|${color}|${roughness}|${metalness}|${repeat}`;
    let m = tints.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial();
      m.name = `${surface}:${color.toString(16)}`;
      dress(m, surface, [repeat, repeat], color, roughness, metalness);
      adopt(m);
      tints.set(key, m);
    }
    return m;
  }

  return {
    get(name) {
      let m = named.get(name);
      if (!m) {
        m = adopt(build(name, CATALOG[name]));
        named.set(name, m);
      }
      return m;
    },

    tinted: tint,

    armour(color) {
      const substrate = FINISH_SUBSTRATE[color] ?? "mail";
      // Mail is drawn over a gambeson, so its own roughness already covers both;
      // the plate finishes keep the polish their price paid for.
      return tint(substrate, color, { repeat: substrate === "mail" ? 3 : 2 });
    },

    tunic(color) {
      return tint("wool", color, { repeat: 5 });
    },

    hide(color) {
      return tint("leather", color, { repeat: 4 });
    },

    flesh(color) {
      return tint("skin", color, { repeat: 2 });
    },

    blade(color, roughness) {
      return tint("steel", color, { roughness, repeat: 2 });
    },

    timber(color) {
      return tint("oak", color, { repeat: 3 });
    },

    standard(color, roughness = 0.8, metalness = 0) {
      const key = `${color}|${roughness}|${metalness}`;
      let m = adhoc.get(key);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
        adopt(m);
        adhoc.set(key, m);
      }
      return m;
    },

    setEnvironment(next, intensity = 1) {
      env = next;
      envIntensity = intensity;
      for (const m of named.values()) adopt(m);
      for (const m of adhoc.values()) adopt(m);
      for (const m of tints.values()) adopt(m);
    },

    dispose() {
      // Textures belong to the library that made them; only the programs and
      // uniform blocks are ours to release.
      for (const m of named.values()) m.dispose();
      for (const m of adhoc.values()) m.dispose();
      for (const m of tints.values()) m.dispose();
      named.clear();
      adhoc.clear();
      tints.clear();
    },
  };
}
