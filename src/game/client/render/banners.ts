// THE STANDARDS — backlog 7.5 / 4.10, the owner's ruling of 26 Aug 2026:
// "historically accurate flags... banners IN THE GROUNDS."
//
// One planted standard: a pole, a crossbar, and a gonfalon of dyed wool
// carrying the people's device. The devices hold `docs/FACTIONS.md` §9's
// sourcing law — every one is a FIND or a TEXT of the period, and the one
// composition that is ours says so:
//
//   saxon   Alfred's own coinage (c. 880): the cross-and-lozenge type. A
//           coin is a state's chosen image, struck in the game's own decade
//           — §9.1 calls it the best untapped source in the section.
//   norse   the raven banner. The Chronicle's annal for 878 records the
//           Danish banner taken at Cynwit; the raven's NAME is period, the
//           drawing is ours, exactly as §9.2 rules.
//   briton  the triskele on the moss field — both real, the composition an
//           invention and labelled one (§9.3: "no attested battle standard").
//   pict    the crescent-and-V-rod, cut on symbol stones standing in
//           Scotland today (§9.4) — carried as a banner by OUR invention,
//           which is §9.0's sanctioned trade.
//
// The fields are the four dye vats (`globals.css`): gilt, garnet, moss,
// woad. The cloth is painted once per people into a small canvas texture and
// cached for the session; the standard itself is still wool on wood — the
// pole and bar take the ground's own palisade timber so a banner ages with
// the ground it stands in.

import * as THREE from "three";
import type { GroundBuildContext } from "./world";

// The cloth fields are the VILLAGE BANNERS' own dye table (world.ts), not the
// UI's brighter gilt — a standard and the palisade banners beside it must
// read as cloth from one vat.
const FIELDS: Record<string, { field: string; ink: string; dark: string }> = {
  saxon: { field: "#b8860b", ink: "#2e2008", dark: "#8a6408" },
  norse: { field: "#7c1420", ink: "#d8cdb4", dark: "#570e17" },
  briton: { field: "#1e5f43", ink: "#d9c98a", dark: "#154434" },
  pict: { field: "#2b4f72", ink: "#d8cdb4", dark: "#1d3a57" },
};

/** One device, drawn bold enough to read at fight distance. */
function drawDevice(ctx: CanvasRenderingContext2D, people: string, w: number, h: number): void {
  const cx = w / 2, cy = h * 0.44;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (people === "saxon") {
    // Cross-and-lozenge, as the penny cuts it: a cross with a lozenge at the
    // crossing and pellets in the quarters.
    const arm = w * 0.30;
    ctx.lineWidth = w * 0.085;
    ctx.beginPath();
    ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy + arm);
    ctx.moveTo(cx - arm, cy); ctx.lineTo(cx + arm, cy);
    ctx.stroke();
    const lz = w * 0.14;
    ctx.beginPath();
    ctx.moveTo(cx, cy - lz); ctx.lineTo(cx + lz, cy); ctx.lineTo(cx, cy + lz); ctx.lineTo(cx - lz, cy);
    ctx.closePath();
    ctx.fill();
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.arc(cx + sx * arm * 0.62, cy + sy * arm * 0.62, w * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (people === "norse") {
    // The raven, wings raised — the drawing that is ours to make.
    ctx.beginPath();
    ctx.moveTo(cx, cy + h * 0.16);                       // tail root
    ctx.quadraticCurveTo(cx - w * 0.30, cy + h * 0.05, cx - w * 0.34, cy - h * 0.12); // left wing out
    ctx.quadraticCurveTo(cx - w * 0.18, cy - h * 0.05, cx - w * 0.07, cy - h * 0.08); // wing underside
    ctx.quadraticCurveTo(cx - w * 0.04, cy - h * 0.16, cx + w * 0.05, cy - h * 0.185); // head
    ctx.lineTo(cx + w * 0.16, cy - h * 0.165);           // beak
    ctx.lineTo(cx + w * 0.06, cy - h * 0.13);            // beak underside
    ctx.quadraticCurveTo(cx + w * 0.20, cy - h * 0.10, cx + w * 0.34, cy - h * 0.14); // right wing tip
    ctx.quadraticCurveTo(cx + w * 0.24, cy + h * 0.03, cx, cy + h * 0.16);            // back to tail
    ctx.closePath();
    ctx.fill();
    // pinion notches, so it reads feathered rather than moth-like
    ctx.strokeStyle = FIELDS.norse.field;
    ctx.lineWidth = w * 0.02;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * w * 0.30, cy - h * 0.125);
      ctx.lineTo(cx + s * w * 0.22, cy - h * 0.06);
      ctx.stroke();
    }
  } else if (people === "briton") {
    // The triskele: three spiral arms from a hub.
    ctx.lineWidth = w * 0.075;
    for (let k = 0; k < 3; k++) {
      const a0 = (k / 3) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      for (let t = 0; t <= 1.001; t += 0.06) {
        const a = a0 + t * 2.2;
        const r = w * (0.06 + t * 0.26);
        const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
        if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.055, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Pict: crescent with the V-rod through it, horns down, vertex below —
    // the composition every symbol stone agrees on.
    ctx.lineWidth = w * 0.07;
    ctx.beginPath();
    ctx.arc(cx, cy + h * 0.02, w * 0.30, Math.PI * 1.08, Math.PI * 1.92);
    ctx.arc(cx, cy - h * 0.075, w * 0.36, Math.PI * 1.86, Math.PI * 1.14, true);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.26, cy - h * 0.16);
    ctx.lineTo(cx, cy + h * 0.155);
    ctx.lineTo(cx + w * 0.26, cy - h * 0.16);
    ctx.stroke();
    // the rod's finials, which are what make it a rod and not a chevron
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + s * w * 0.26, cy - h * 0.16, w * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const clothCache = new Map<string, THREE.CanvasTexture>();

/** The device cloth for a people, cached for the session. Exported so the
 *  village's EXISTING palisade banners can wear the same device the planted
 *  standards carry — one drawing, every surface. `tall` matches the village
 *  banners' 1:2 drop so the device stays round on their longer cloth. */
export function clothTexture(people: string, tall = false): THREE.CanvasTexture {
  const key = `${people}|${tall ? "t" : "s"}`;
  const hit = clothCache.get(key);
  if (hit) return hit;
  const spec = FIELDS[people] ?? FIELDS.saxon;
  const w = 256, h = tall ? 520 : 340;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = spec.field;
  ctx.fillRect(0, 0, w, h);
  // The weave: fine horizontal banding, darker toward the hem where a wool
  // hanging holds its dirt. Cheap, and it stops the field reading as plastic.
  for (let y = 0; y < h; y += 3) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + 0.05 * (y / h) + (y % 6 === 0 ? 0.03 : 0)})`;
    ctx.fillRect(0, y, w, 1);
  }
  // A woven border band top and bottom — every pictured hanging has one.
  ctx.fillStyle = spec.dark;
  ctx.fillRect(0, 0, w, h * 0.055);
  ctx.fillRect(0, h * 0.93, w, h * 0.07);
  ctx.fillStyle = spec.ink;
  ctx.strokeStyle = spec.ink;
  drawDevice(ctx, people, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  clothCache.set(key, tex);
  return tex;
}

/**
 * Plant one standard. `x, z` in ground space; `face` is the yaw the CLOTH
 * looks along (turn it toward the fighting floor). The pole and bar take the
 * ground's own palisade timber; only the cloth brings its own material.
 */
export function plantStandard(
  ctx: GroundBuildContext, x: number, z: number, people: string, face = 0,
): void {
  const { root, materials, own, heightAt, rng } = ctx;
  const g = new THREE.Group();
  const timber = materials.get("palisade");

  const pole = new THREE.Mesh(own(new THREE.CylinderGeometry(0.045, 0.065, 4.4, 7)), timber);
  pole.position.y = 2.2;
  pole.castShadow = true;
  g.add(pole);
  // The finial: a simple turned knop, not a spearhead — a moot's standard
  // marks ground, it does not threaten it.
  const knop = new THREE.Mesh(own(new THREE.SphereGeometry(0.085, 8, 6)), timber);
  knop.position.y = 4.45;
  g.add(knop);
  const bar = new THREE.Mesh(own(new THREE.CylinderGeometry(0.03, 0.03, 1.06, 6)), timber);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = 4.12;
  g.add(bar);

  // The gonfalon: hangs from the bar, swayed a little off the pole so it
  // reads as cloth with weight rather than as a sign. The wave is baked —
  // a static ripple costs nothing per frame and the fight never stares at a
  // banner long enough to miss the animation.
  const cw = 0.92, ch = 1.24;
  const cloth = own(new THREE.PlaneGeometry(cw, ch, 8, 10));
  const pos = cloth.attributes.position as THREE.BufferAttribute;
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i);
    const droop = (0.5 - py / ch) * 0.5 + 0.5;              // 0 at bar, 1 at hem
    pos.setZ(i, Math.sin(px * 6.2 + phase) * 0.035 * droop
      + Math.sin(py * 4.4 + phase * 1.7) * 0.028 * droop);
    // the hem lifts a touch at the corners, as a hanging's weight leaves it
    pos.setY(i, py + Math.abs(px / cw) * 0.045 * droop);
  }
  cloth.computeVertexNormals();
  const clothMat = new THREE.MeshStandardMaterial({
    map: clothTexture(people), roughness: 0.86, metalness: 0,
    side: THREE.DoubleSide,
  });
  const hang = new THREE.Mesh(cloth, clothMat);
  hang.position.set(0, 4.05 - ch / 2, 0.055);
  hang.castShadow = true;
  g.add(hang);

  g.position.set(x, heightAt(x, z), z);
  g.rotation.y = face;
  root.add(g);
}
