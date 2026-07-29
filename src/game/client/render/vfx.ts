// Particles, impact effects, blade trails and atmospheric motes.
//
// Every point sprite in the game comes from here, and every one of them has a
// map. A PointsMaterial without a map draws an opaque screen-facing square,
// which is why the baseline captures have grey tiles floating over the arena —
// failure #2 on the visual bar, and the one thing this module has always
// needed to get right.

import * as THREE from "three";
import type { FrameContext, Mood, QualitySettings } from "./quality";
import type { TextureLibrary, SpriteName } from "./textures";

export interface BurstOptions {
  position: { x: number; y: number; z: number };
  color: number;
  count: number;
  /** Horizontal scatter velocity, m/s. */
  spread?: number;
  /** Upward launch velocity, m/s. */
  up?: number;
  /** Downward acceleration, m/s². Low values read as embers, high as debris. */
  gravity?: number;
  size?: number;
  life?: number;
  sprite?: SpriteName;
  blending?: THREE.Blending;
}

export interface VfxHandle {
  readonly root: THREE.Group;
  /** Live particle count, for anyone who wants to know what the budget is doing. */
  readonly liveParticles: number;
  burst(opts: BurstOptions): void;
  /** A weapon passing through its arc. Currently sparks; wants to be a ribbon. */
  trail(opts: BurstOptions): void;
  setMood(mood: Mood): void;
  update(dt: number, ctx: FrameContext): void;
  dispose(): void;
}

interface System {
  points: THREE.Points;
  material: THREE.PointsMaterial;
  velocities: THREE.Vector3[];
  life: number;
  maxLife: number;
  gravity: number;
}

export function createVfx(
  scene: THREE.Scene,
  textures: TextureLibrary,
  settings: QualitySettings,
): VfxHandle {
  const root = new THREE.Group();
  root.name = "vfx";
  scene.add(root);

  const systems: System[] = [];
  let live = 0;

  // ---- drifting fog motes ----
  const moteCount = settings.moteCount;
  const moteArr = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    moteArr[i * 3] = (Math.random() - 0.5) * 55;
    moteArr[i * 3 + 1] = Math.random() * 3.5;
    moteArr[i * 3 + 2] = (Math.random() - 0.5) * 55;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(moteArr, 3));
  const moteMat = new THREE.PointsMaterial({
    map: textures.sprite("soft"),
    color: 0xaabdd6,
    size: 0.5,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  root.add(motes);

  function spawn(opts: BurstOptions): void {
    const count = Math.max(1, Math.round(opts.count * settings.particleScale));
    if (live + count > settings.particleBudget) return;

    const spread = opts.spread ?? 5;
    const up = opts.up ?? 4;
    const maxLife = opts.life ?? 0.5;
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3] = opts.position.x;
      positions[i * 3 + 1] = opts.position.y;
      positions[i * 3 + 2] = opts.position.z;
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        Math.random() * up,
        (Math.random() - 0.5) * spread,
      ));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      map: textures.sprite(opts.sprite ?? "soft"),
      color: opts.color,
      size: opts.size ?? 0.13,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: opts.blending ?? THREE.NormalBlending,
    });
    const points = new THREE.Points(geo, material);
    root.add(points);
    systems.push({ points, material, velocities, life: maxLife, maxLife, gravity: opts.gravity ?? 11 });
    live += count;
  }

  function retire(index: number): void {
    const sys = systems[index];
    live -= sys.velocities.length;
    root.remove(sys.points);
    sys.points.geometry.dispose();
    sys.material.dispose();
    systems.splice(index, 1);
  }

  return {
    root,
    get liveParticles() {
      return live;
    },

    burst: spawn,

    trail(opts) {
      if (!settings.trails) return;
      spawn(opts);
    },

    setMood() {
      // Ash and ember density should climb when the last stand starts.
    },

    update(dt, ctx) {
      for (let i = systems.length - 1; i >= 0; i--) {
        const sys = systems[i];
        sys.life -= dt;
        if (sys.life <= 0) {
          retire(i);
          continue;
        }
        const attr = sys.points.geometry.attributes.position as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let j = 0; j < sys.velocities.length; j++) {
          const v = sys.velocities[j];
          arr[j * 3] += v.x * dt;
          arr[j * 3 + 1] += v.y * dt;
          arr[j * 3 + 2] += v.z * dt;
          v.y -= sys.gravity * dt;
        }
        attr.needsUpdate = true;
        sys.material.opacity = sys.life / sys.maxLife;
      }

      // Motes wander on two out-of-phase sine channels. The offsets are not
      // scaled by dt, so they drift faster on a fast machine — harmless at the
      // amplitudes involved, wrong the moment the amplitude goes up.
      const t = ctx.time;
      const attr = moteGeo.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < attr.count; i++) {
        arr[i * 3] += Math.sin(t * 0.35 + i) * 0.005;
        arr[i * 3 + 2] += Math.cos(t * 0.3 + i) * 0.005;
      }
      attr.needsUpdate = true;
    },

    dispose() {
      while (systems.length) retire(systems.length - 1);
      scene.remove(root);
      moteGeo.dispose();
      moteMat.dispose();
    },
  };
}
