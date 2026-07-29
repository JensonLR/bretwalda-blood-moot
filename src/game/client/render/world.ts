// Arena construction: terrain, palisade, torches, huts, props, bonfire.
//
// Everything static in the frame is built here once and hung off a single root
// group, so the whole arena is one add and one remove. The only per-frame work
// is the fire and banner life, driven off cached references rather than a
// scene-wide traverse — the traverse used to walk every warrior's ~60 meshes
// looking for two names.

import * as THREE from "three";
import type { FrameContext, Mood, QualitySettings } from "./quality";
import type { MaterialLibrary } from "./materials";
import { buildShield } from "../characters";

export interface WorldOptions {
  /**
   * Prop scatter source. Defaults to Math.random, which means the arena is laid
   * out differently on every load — including between two capture runs. Pass a
   * seeded generator to make photo mode reproducible.
   */
  rng?: () => number;
}

export interface WorldHandle {
  readonly root: THREE.Group;
  /** Ground plane, for camera collision and decal projection later. */
  readonly ground: THREE.Mesh;
  /** Fire lights that belong to props. Owned here, tuned by whoever grades the frame. */
  readonly pointLights: readonly THREE.PointLight[];
  setMood(mood: Mood): void;
  update(dt: number, ctx: FrameContext): void;
  dispose(): void;
}

const ARENA_RADIUS = 21.5;
const PALISADE_RADIUS = 19.6;
const TORCH_RADIUS = 18.2;

export function createWorld(
  scene: THREE.Scene,
  materials: MaterialLibrary,
  settings: QualitySettings,
  opts: WorldOptions = {},
): WorldHandle {
  const rng = opts.rng ?? Math.random;
  const root = new THREE.Group();
  root.name = "world";

  const flames: THREE.Object3D[] = [];
  const banners: THREE.Object3D[] = [];
  const pointLights: THREE.PointLight[] = [];
  const scatter = (base: number) => Math.max(1, Math.round(base * settings.propDensity));

  // ---- ground ----
  // Mottled grass/mud baked into vertex colours. It is a flat disc with a hard
  // circular horizon, which is failure #6 on the bar and lives entirely here.
  const groundGeo = new THREE.CircleGeometry(ARENA_RADIUS, 72);
  {
    const posAttr = groundGeo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);
    const mud = new THREE.Color(0x4a4536);
    const grass = new THREE.Color(0x3d5231);
    const dust = new THREE.Color(0x555047);
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const n = Math.sin(x * 0.75) * Math.cos(y * 0.65) + Math.sin(x * 2.2 + y * 1.8) * 0.6;
      const c = n > 0.25 ? grass : n < -0.5 ? dust : mud;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    groundGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
  const ground = new THREE.Mesh(groundGeo, materials.get("ground"));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  // ---- palisade ring ----
  // Each stake carries its own geometry because its height is randomised; the
  // obvious win here is one InstancedMesh with a per-instance scale.
  const stakeMat = materials.get("palisade");
  const bindMat = materials.get("palisadeBinding");
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const px = Math.cos(a) * PALISADE_RADIUS;
    const pz = Math.sin(a) * PALISADE_RADIUS;
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.7 + rng() * 0.5, 6), stakeMat);
    stake.position.set(px, 1.35, pz);
    stake.castShadow = true;
    root.add(stake);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 5), stakeMat);
    tip.position.set(px, 2.85, pz);
    root.add(tip);
    if (i % 2 === 0) {
      const bind = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 4, 8), bindMat);
      bind.position.set(px, 1.9, pz);
      bind.rotation.y = a;
      root.add(bind);
    }
  }

  // ---- torches ----
  // Only some torches get a real light; the rest carry an emissive cup so the
  // ring still reads as lit all the way round.
  const poleMat = materials.get("poleWood");
  const cupMat = materials.get("torchCup");
  const torchFlameMat = materials.get("torchFlame");
  const litTorches = new Set<number>();
  for (let i = 0; i < 10 && litTorches.size < settings.dynamicLights; i += 2) litTorches.add(i);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.15;
    const px = Math.cos(a) * TORCH_RADIUS;
    const pz = Math.sin(a) * TORCH_RADIUS;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.4, 6), poleMat);
    pole.position.set(px, 1.7, pz);
    pole.castShadow = true;
    root.add(pole);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.09, 0.18, 8), cupMat);
    cup.position.set(px, 3.36, pz);
    root.add(cup);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), torchFlameMat);
    flame.position.set(px, 3.58, pz);
    flame.name = "flame";
    root.add(flame);
    flames.push(flame);
  }
  for (const i of litTorches) {
    const a = (i / 10) * Math.PI * 2 + 0.15;
    const fl = new THREE.PointLight(0xff8a33, 3.2, 13);
    fl.position.set(Math.cos(a) * TORCH_RADIUS, 3.7, Math.sin(a) * TORCH_RADIUS);
    root.add(fl);
    pointLights.push(fl);
  }

  // ---- settlement beyond the palisade ----
  const hutWall = materials.get("hutWall");
  const hutRoof = materials.get("hutRoof");
  const hutDoor = materials.get("hutDoor");
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const d = 27 + rng() * 4;
    const hut = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.6, 3.4), hutWall);
    base.position.y = 1.3;
    base.castShadow = true;
    hut.add(base);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 2.3, 4), hutRoof);
    roof.position.y = 3.75;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    hut.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.1), hutDoor);
    door.position.set(0, 0.8, 1.71);
    hut.add(door);
    hut.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    hut.rotation.y = a + Math.PI;
    root.add(hut);
  }

  // ---- rock scatter ----
  const rockMat = materials.get("rock");
  for (let i = 0; i < scatter(22); i++) {
    const a = rng() * Math.PI * 2;
    const d = ARENA_RADIUS + rng() * 7;
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + rng() * 0.7, 0), rockMat);
    rock.position.set(Math.cos(a) * d, 0.12, Math.sin(a) * d);
    rock.rotation.set(rng() * 3, rng() * 3, 0);
    rock.scale.y = 0.55 + rng() * 0.5;
    rock.castShadow = true;
    root.add(rock);
  }

  // ---- banner poles ----
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const bx = Math.cos(a) * 22.5;
    const bz = Math.sin(a) * 22.5;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 5.6, 6), poleMat);
    pole.position.set(bx, 2.8, bz);
    pole.castShadow = true;
    root.add(pole);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.09, 0.09), poleMat);
    cross.position.set(bx, 5.25, bz);
    root.add(cross);
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 1.8, 0.05),
      materials.get(i % 2 === 0 ? "bannerRed" : "bannerBlue"),
    );
    banner.position.set(bx, 4.25, bz);
    banner.castShadow = true;
    banner.name = "banner";
    root.add(banner);
    banners.push(banner);
  }

  // ---- central bonfire ----
  const bonfire = new THREE.Group();
  {
    const logMat = materials.get("bonfireLog");
    const logGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.7, 6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const log = new THREE.Mesh(logGeo, logMat);
      log.rotation.z = Math.PI / 2 - 0.5;
      log.rotation.y = a;
      log.position.set(Math.cos(a) * 0.6, 0.55, Math.sin(a) * 0.6);
      log.lookAt(0, 2, 0);
      bonfire.add(log);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 10), materials.get("bonfireFlame"));
    flame.position.y = 1.1;
    flame.name = "flame";
    bonfire.add(flame);
    flames.push(flame);
    // The arena's hero light — never budgeted away, the frame is built on it.
    const fireLight = new THREE.PointLight(0xff8830, 4, 18);
    fireLight.position.y = 1.8;
    bonfire.add(fireLight);
    pointLights.push(fireLight);
  }
  root.add(bonfire);

  // ---- runestone ----
  {
    const stone = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.2, 0.6), materials.get("runestone"));
    body.position.y = 1.6;
    body.rotation.z = 0.06;
    body.castShadow = true;
    stone.add(body);
    const runeMat = materials.get("runeGlow");
    for (let i = 0; i < 4; i++) {
      const rune = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5 - i * 0.06, 0.62), runeMat);
      rune.position.set((i % 2 === 0 ? -0.18 : 0.18) + (rng() - 0.5) * 0.12, 2.5 - i * 0.62, 0);
      rune.rotation.z = (rng() - 0.5) * 0.5;
      rune.name = "runeGlow";
      stone.add(rune);
    }
    stone.position.set(0, 0, -17);
    root.add(stone);
  }

  // ---- war gear stacked around the moot ----
  const shaftMat = materials.get("spearShaft");
  const tipMat = materials.get("spearTip");
  for (let r = 0; r < 3; r++) {
    const a = (r / 3) * Math.PI * 2 + 0.8;
    const bx = Math.cos(a) * 24;
    const bz = Math.sin(a) * 24;
    for (let s = 0; s < 4; s++) {
      const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 3.4, 5), shaftMat);
      spear.position.set(bx + (s - 1.5) * 0.22, 1.6, bz);
      spear.rotation.z = 0.18 + (rng() - 0.5) * 0.1;
      spear.rotation.x = (rng() - 0.5) * 0.1;
      spear.castShadow = true;
      root.add(spear);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.22, 6), tipMat);
      tip.position.set(bx + (s - 1.5) * 0.22 + 0.6, 3.15, bz);
      root.add(tip);
    }
  }

  // ---- barrels ----
  const barrelMat = materials.get("barrel");
  const bandMat = materials.get("barrelBand");
  for (let i = 0; i < scatter(5); i++) {
    const a = rng() * Math.PI * 2;
    const d = 22 + rng() * 5;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 14), barrelMat);
    barrel.position.set(Math.cos(a) * d, 0.45, Math.sin(a) * d);
    barrel.castShadow = true;
    root.add(barrel);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.455, 0.035, 6, 18), bandMat);
    band.rotation.x = Math.PI / 2;
    band.position.copy(barrel.position);
    band.position.y += 0.25;
    root.add(band);
  }

  // ---- battle debris driven into the ground ----
  const bladeMat = materials.get("debrisBlade");
  const hiltMat = materials.get("debrisHilt");
  for (let i = 0; i < scatter(4); i++) {
    const a = rng() * Math.PI * 2;
    const d = 6 + rng() * 8;
    const bx = Math.cos(a) * d;
    const bz = Math.sin(a) * d;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.014), bladeMat);
    blade.position.set(bx, 0.34, bz);
    blade.rotation.z = 0.4 + rng() * 0.35;
    blade.rotation.y = rng() * 2;
    root.add(blade);
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), hiltMat);
    hilt.position.set(bx - 0.24, 0.66, bz + 0.03);
    hilt.rotation.z = 0.4;
    root.add(hilt);
  }

  // A shield left leaning where its owner fell.
  const leaningShield = buildShield(0x24386a);
  leaningShield.position.set(-12.5, 0.42, 10.5);
  leaningShield.rotation.set(-0.9, 0.6, 0);
  root.add(leaningShield);

  // ---- grass tufts along the palisade line ----
  const tuftMat = materials.get("grassTuft");
  for (let i = 0; i < scatter(30); i++) {
    const a = rng() * Math.PI * 2;
    const d = 19.5 + rng() * 8;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5 + rng() * 0.5, 5), tuftMat);
    tuft.position.set(Math.cos(a) * d, 0.22, Math.sin(a) * d);
    tuft.rotation.z = (rng() - 0.5) * 0.3;
    root.add(tuft);
  }

  scene.add(root);

  return {
    root,
    ground,
    pointLights,

    setMood() {
      // Mood is carried by the air and the grade, not by the props. When the
      // last stand starts scorching the arena, it starts here.
    },

    update(dt, ctx) {
      const t = ctx.time;
      // Two beats of different frequency per flame so a ring of ten torches
      // never pulses in unison.
      for (const flame of flames) {
        const s = 1 + Math.sin(t * 11 + flame.id) * 0.14 + Math.sin(t * 23) * 0.07;
        flame.scale.set(s, 1 + Math.sin(t * 17 + flame.id) * 0.18, s);
      }
      for (const banner of banners) {
        banner.rotation.y = Math.sin(t * 1.3 + banner.id) * 0.16;
        banner.rotation.z = Math.sin(t * 0.8 + banner.id) * 0.03;
      }
    },

    dispose() {
      scene.remove(root);
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
        if (o instanceof THREE.PointLight) o.dispose();
      });
      // The leaning shield builds its own materials rather than taking them
      // from the library, so it has to clean up after itself.
      leaningShield.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
    },
  };
}
