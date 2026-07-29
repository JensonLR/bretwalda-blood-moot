// The light rig and shadow configuration.
//
// Owns the global rig only: ambient, hemisphere, the moon key with its shadow
// cascade, and the two directional fills that shape the silhouettes. The point
// lights that belong to a torch or the bonfire are built with those props in
// world.ts, because a light that can drift away from the flame it comes from is
// a bug waiting to happen.

import * as THREE from "three";
import type { FrameContext, Mood, QualitySettings } from "./quality";

export interface LightingHandle {
  readonly root: THREE.Group;
  /** The moon. Every shadow in the arena comes from this one light. */
  readonly key: THREE.DirectionalLight;
  readonly ambient: THREE.AmbientLight;
  setMood(mood: Mood): void;
  update(dt: number, ctx: FrameContext): void;
  dispose(): void;
}

/** Ambient level per mood — last stand drops the fill so the fires take over. */
const AMBIENT_INTENSITY: Record<Mood, number> = { dusk: 0.85, lastStand: 0.55 };

export interface LightingOptions {
  /**
   * Where the sky put the moon and the sun, as unit vectors. The rig reads them
   * live and re-aims every frame, so `setTimeOfDay` moving the bodies moves the
   * shadows with them. Without this the key comes from a corner of the sky with
   * nothing in it and the moon is visibly somewhere else.
   */
  key?: THREE.Vector3;
  keyColor?: THREE.Color;
  warm?: THREE.Vector3;
  warmColor?: THREE.Color;
}

/** How far up the light is hung along its direction. Only the angle matters. */
const KEY_DISTANCE = 30;
const WARM_DISTANCE = 14;

/**
 * The dusk moon sits 11° above the horizon. Aiming the key straight down that
 * vector is honest and unusable: shadows run five body-lengths across the arena,
 * every one of them grazing enough to fight the depth bias. The azimuth is the
 * part a viewer can actually check against the sky, so that is kept exactly and
 * the elevation is lifted to where a key light belongs.
 */
const KEY_MIN_ELEVATION = Math.sin(0.66);
const FILL_MIN_ELEVATION = Math.sin(0.35);

export function createLighting(
  scene: THREE.Scene,
  settings: QualitySettings,
  opts: LightingOptions = {},
): LightingHandle {
  const root = new THREE.Group();
  root.name = "lighting";

  // Dusk is dark; readability wins over realism until a proper AO pass can
  // put the shadow back in the crevices where it belongs.
  const ambient = new THREE.AmbientLight(0x5a6c88, AMBIENT_INTENSITY.dusk);
  root.add(ambient);

  const hemi = new THREE.HemisphereLight(0x8fa8c8, 0x4a4030, 0.55);
  root.add(hemi);

  const key = new THREE.DirectionalLight(0xcfdcf0, 1.35);
  key.position.set(12, 26, 9);
  key.target.position.set(0, 0, 0);
  root.add(key.target);
  key.castShadow = settings.shadows;
  key.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 70;
  const half = settings.shadowDistance;
  key.shadow.camera.left = -half;
  key.shadow.camera.right = half;
  key.shadow.camera.top = half;
  key.shadow.camera.bottom = -half;
  key.shadow.bias = -0.0005;
  root.add(key);

  // Firelight bounce from the bonfire side, and a cold rim to cut warriors out
  // of the dome behind them.
  const warmFill = new THREE.DirectionalLight(0xffa85c, 0.4);
  warmFill.position.set(-9, 7, -8);
  warmFill.target.position.set(0, 0, 0);
  root.add(warmFill.target);
  root.add(warmFill);

  const rim = new THREE.DirectionalLight(0x88b8ff, 0.35);
  rim.position.set(0, 8, -14);
  root.add(rim);

  scene.add(root);

  /**
   * Aims a directional light down a sky direction and takes its colour from the
   * body's radiance, normalised: the sky hands out absolute radiance and the rig
   * owns how bright the arena is, so only the hue crosses over.
   */
  const scratch = new THREE.Vector3();

  function aim(
    light: THREE.DirectionalLight,
    dir: THREE.Vector3 | undefined,
    color: THREE.Color | undefined,
    distance: number,
    minElevation: number,
  ): void {
    if (dir) {
      scratch.copy(dir);
      if (scratch.y < minElevation) {
        const az = Math.hypot(scratch.x, scratch.z) || 1;
        const want = Math.sqrt(Math.max(0, 1 - minElevation * minElevation));
        scratch.set((scratch.x / az) * want, minElevation, (scratch.z / az) * want);
      }
      light.position.copy(scratch).multiplyScalar(distance);
    }
    if (color) {
      // The sky hands out absolute radiance; the rig owns how bright the arena
      // is. Only the hue crosses over.
      const peak = Math.max(color.r, color.g, color.b);
      if (peak > 1e-4) light.color.copy(color).multiplyScalar(1 / peak);
    }
  }

  function reaim(): void {
    aim(key, opts.key, opts.keyColor, KEY_DISTANCE, KEY_MIN_ELEVATION);
    aim(warmFill, opts.warm, opts.warmColor, WARM_DISTANCE, FILL_MIN_ELEVATION);
  }

  reaim();

  return {
    root,
    key,
    ambient,

    setMood(mood) {
      ambient.intensity = AMBIENT_INTENSITY[mood];
    },

    update() {
      // The sky's vectors are live objects, so re-reading them is what keeps a
      // moving moon and its shadows pointing the same way. A cascade that tracks
      // ctx.focus and torch flicker coupling still belong here.
      reaim();
    },

    dispose() {
      scene.remove(root);
      key.shadow.dispose();
      ambient.dispose();
      hemi.dispose();
      key.dispose();
      warmFill.dispose();
      rim.dispose();
    },
  };
}
