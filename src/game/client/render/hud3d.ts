// In-world HUD: nameplates, health bars, floating damage numbers.
//
// These are the only elements in the frame that are allowed to ignore depth,
// which is exactly why they read as pasted-on quads today (failure #9). They
// live in one module so that whoever gives them a proper treatment — soft
// backing, distance fade, occlusion, world-space scale — does it in one place.
//
// Materials here are per-instance on purpose: the bar tints with health and the
// numbers carry their own canvas, so nothing can be shared with materials.ts.

import * as THREE from "three";
import type { FrameContext, QualitySettings } from "./quality";

export interface Hud3D {
  /** Hangs a nameplate and health bar off a warrior's rig group. */
  attach(id: string, name: string, parent: THREE.Object3D, isLocal: boolean): void;
  detach(id: string): void;
  setHealth(id: string, current: number, max: number): void;
  spawnDamageNumber(amount: number, at: { x: number; z: number }, big: boolean): void;
  update(dt: number, ctx: FrameContext): void;
  dispose(): void;
}

interface Plate {
  parent: THREE.Object3D;
  bar: THREE.Mesh;
  barBg: THREE.Mesh;
  nameplate: THREE.Sprite;
}

interface FloatingNumber {
  sprite: THREE.Sprite;
  life: number;
  vy: number;
}

const BAR_Y = 2.55;
const NAME_Y = 2.82;

const HEALTHY = 0x53d769;
const WOUNDED = 0xf0c33c;
const CRITICAL = 0xe03a2f;

function nameplateTexture(name: string, isLocal: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.font = "bold 24px Cinzel, Georgia, serif";
  ctx.textAlign = "center";
  ctx.shadowColor = "black";
  ctx.shadowBlur = 8;
  ctx.fillStyle = isLocal ? "#ffd478" : "#f0eadc";
  ctx.fillText(name.substring(0, 15), 128, 40);
  return new THREE.CanvasTexture(c);
}

function damageTexture(amount: number, big: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 112;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.font = `bold ${big ? 46 : 34}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.strokeStyle = "black";
  ctx.lineWidth = 7;
  ctx.strokeText(String(amount), 56, 46);
  ctx.fillStyle = big ? "#ffb020" : "#f0e8d8";
  ctx.fillText(String(amount), 56, 46);
  return new THREE.CanvasTexture(c);
}

export function createHud3d(scene: THREE.Scene, settings: QualitySettings): Hud3D {
  const plates = new Map<string, Plate>();
  const numbers: FloatingNumber[] = [];

  // Shared across every plate: the geometry never varies, only the transform.
  const barGeo = new THREE.PlaneGeometry(1.06, 0.06);
  const barBgGeo = new THREE.PlaneGeometry(1.1, 0.1);

  function detach(id: string): void {
    const plate = plates.get(id);
    if (!plate) return;
    plate.parent.remove(plate.bar, plate.barBg, plate.nameplate);
    (plate.bar.material as THREE.Material).dispose();
    (plate.barBg.material as THREE.Material).dispose();
    plate.nameplate.material.map?.dispose();
    plate.nameplate.material.dispose();
    plates.delete(id);
  }

  return {
    attach(id, name, parent, isLocal) {
      if (plates.has(id)) return;

      const barBg = new THREE.Mesh(barBgGeo, new THREE.MeshBasicMaterial({
        color: 0x1a0a08, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false,
      }));
      barBg.position.y = BAR_Y;
      barBg.renderOrder = 999;
      parent.add(barBg);

      const bar = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({
        color: HEALTHY, side: THREE.DoubleSide, depthTest: false,
      }));
      bar.position.y = BAR_Y;
      bar.renderOrder = 1000;
      parent.add(bar);

      const nameplate = new THREE.Sprite(new THREE.SpriteMaterial({
        map: nameplateTexture(name, isLocal), transparent: true, depthTest: false,
      }));
      nameplate.position.y = NAME_Y;
      nameplate.scale.set(1.7, 0.42, 1);
      nameplate.renderOrder = 1001;
      parent.add(nameplate);

      plates.set(id, { parent, bar, barBg, nameplate });
    },

    detach,

    setHealth(id, current, max) {
      const plate = plates.get(id);
      if (!plate) return;
      const pct = Math.max(0, current / max);
      // Scaled from the centre, so it also has to slide left to drain rightwards.
      plate.bar.scale.x = pct;
      plate.bar.position.x = -(1 - pct) * 0.52;
      (plate.bar.material as THREE.MeshBasicMaterial).color.setHex(
        pct > 0.55 ? HEALTHY : pct > 0.25 ? WOUNDED : CRITICAL,
      );
    },

    spawnDamageNumber(amount, at, big) {
      if (numbers.length >= settings.damageNumberBudget) return;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: damageTexture(amount, big), transparent: true, depthTest: false,
      }));
      sprite.position.set(at.x + (Math.random() - 0.5) * 0.5, 2.0, at.z + (Math.random() - 0.5) * 0.5);
      sprite.scale.set(1.15, 0.65, 1);
      sprite.renderOrder = 1002;
      scene.add(sprite);
      numbers.push({ sprite, life: 0.85, vy: 1.6 });
    },

    update(dt, ctx) {
      // Bars are quads, not sprites, so they have to be turned by hand. This
      // uses last frame's world matrix — the parent rig is re-posed after, and
      // updateMatrixWorld does not run until render.
      for (const plate of plates.values()) {
        plate.bar.lookAt(ctx.camera.position);
        plate.barBg.lookAt(ctx.camera.position);
      }

      for (let i = numbers.length - 1; i >= 0; i--) {
        const n = numbers[i];
        n.life -= dt;
        if (n.life <= 0) {
          scene.remove(n.sprite);
          n.sprite.material.map?.dispose();
          n.sprite.material.dispose();
          numbers.splice(i, 1);
          continue;
        }
        n.sprite.position.y += n.vy * dt;
        n.vy *= 1 - dt * 1.6;
        n.sprite.material.opacity = Math.min(1, n.life * 2.4);
      }
    },

    dispose() {
      for (const id of Array.from(plates.keys())) detach(id);
      for (const n of numbers) {
        scene.remove(n.sprite);
        n.sprite.material.map?.dispose();
        n.sprite.material.dispose();
      }
      numbers.length = 0;
      barGeo.dispose();
      barBgGeo.dispose();
    },
  };
}
