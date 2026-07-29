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

export function createLighting(scene: THREE.Scene, settings: QualitySettings): LightingHandle {
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
  root.add(warmFill);

  const rim = new THREE.DirectionalLight(0x88b8ff, 0.35);
  rim.position.set(0, 8, -14);
  root.add(rim);

  scene.add(root);

  return {
    root,
    key,
    ambient,

    setMood(mood) {
      ambient.intensity = AMBIENT_INTENSITY[mood];
    },

    update() {
      // The rig is static. A cascade that tracks ctx.focus, torch flicker
      // coupling and a moving key all belong here — ctx already carries the
      // focus point and clock they need.
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
