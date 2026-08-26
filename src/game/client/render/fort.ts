// The Roman fort: the third ground, and the first with stone standing on it.
//
// `world.ts`'s contract, held for the second time: a new ground is a
// `GroundDef` in its own module, `registerGround`d, beside a `GroundSpec` in
// `grounds.mjs` — it does not touch that file. The moor proved the seam; this
// file spends it on the thing `docs/MAPS.md` #3 asked for in as many words:
// "enclosed, vertical and old… it puts STONE in a game that is currently all
// timber and thatch, and broken walls give real sightline breaks in a game
// that has none."
//
// WHAT THIS PLACE IS. A ruined auxiliary fort the Britons still muster in:
// a flagged courtyard, five lengths of broken curtain wall standing ON the
// fighting floor, two pier stumps of the principia, a garrison campfire where
// the sim's fire has always been. The platform falls away outside the walls,
// so every breach frames low country rather than ground — the village sits in
// a valley, the moor climbs, the fort looks DOWN.

import * as THREE from "three";
import { ROMAN_FORT, clamp01, fbm, hash2, noise2 } from "@/game/grounds.mjs";
import {
  registerGround, raisedStoneMesh, fireMarker, buildBush, mergeInto,
  type GroundBuildContext, type TerrainSpec,
} from "./world";

const FIELD = ROMAN_FORT.field;

// ---------------------------------------------------------------------------
// The palette
// ---------------------------------------------------------------------------
//
// The village is green and gold, the moor is heather over peat. The fort is
// STONE: worn flag grey inside, rubble pale at the walls, cold thin grass on
// the low country beyond — and the one saturated thing anywhere is moss in
// the joints, which is the Britons' own grey-green arriving as a material
// fact rather than a livery. The moor's lesson is applied from the first cut:
// the arena's rig multiplies warm albedo twice, so every stone here is pulled
// COLD in the swatch to read as stone on the screen.
// SECOND CUT, AND THE FIRST FRAME SAID WHY: the opening palette used warm
// greys and the duel lens returned SALMON GRAVEL — the moor's own lesson
// ("the arena's rig is a low sun and it multiplies a warm albedo twice")
// re-learned on stone. Every value here is pulled toward blue and down.
const C_FLAG = new THREE.Color(0x3c4046);       // worn flags, cold slate
const C_FLAG_WORN = new THREE.Color(0x2b2e33);  // where boots and rain got in
const C_JOINT = new THREE.Color(0x17181c);      // the opened joints between slabs
const C_RUBBLE = new THREE.Color(0x555a5e);     // tumbled wall core, lime-pale
const C_MOSS = new THREE.Color(0x35473a);       // the Britons' grey-green, grown in
const C_EARTH = new THREE.Color(0x1e1c17);      // the ditch, bare and dark
const C_GRASS_COLD = new THREE.Color(0x2c3d2a); // low-country turf under a cold sky

/**
 * The flag grid's frame: world-aligned and slightly rotated, ~1.15 m slabs —
 * the period is right (Roman flags run 2-4 ft) and the read is instant: a
 * REGULAR floor is the one thing neither turf ground can have, so the grid
 * itself is the courtyard's signature.
 */
const FLAG_C = Math.cos(0.22), FLAG_S = Math.sin(0.22);

function fortColor(x: number, z: number, y: number, out: THREE.Color): void {
  const r = Math.hypot(x, z);
  const big = fbm(x * 0.027 + 41.9, z * 0.027 - 17.2, 3);
  const mid = fbm(x * 0.11 - 23.4, z * 0.11 + 8.8, 3);
  const fine = noise2(x * 0.27 + 3.6, z * 0.27 - 30.1);

  const rubble = clamp01(FIELD.rubble(x, z) * 1.25);
  const offEdge = clamp01((r - 18.5) / 8);

  // The courtyard's floor is the flag DISC's business now — a textured mesh,
  // because a 1.15 m grid with 10 cm joints is below the terrain lattice's
  // Nyquist: rings run 0.8 m apart with 0.34 jitter, so cuts 3-4 sampled the
  // grid as per-vertex noise and the duel lens returned LAVENDER GRAVEL where
  // the signature floor should be. The terrain under the disc keeps only the
  // average tone, so the rim seam and any peek-through read as the same stone.
  out.copy(C_FLAG).lerp(C_FLAG_WORN, 0.45);
  out.multiplyScalar(0.94 + (big - 0.5) * 0.20);
  out.lerp(C_MOSS, clamp01((mid - 0.60) * 2.0) * 0.3);

  // The apron: rubble over the flags, paler than either.
  out.lerp(C_RUBBLE, rubble * (0.75 + fine * 0.3));

  // Off the platform: the ditch is bare earth, then thin cold turf takes over
  // and runs to the horizon.
  if (r > 18) {
    const ditch = clamp01((r - 19.5) / 2) * (1 - clamp01((r - 22.5) / 2));
    out.lerp(C_EARTH, ditch * 0.85);
    out.lerp(C_GRASS_COLD, offEdge * clamp01(0.70 + big * 0.6));
    // And DARKER with distance, harder than the shared grade does it: the
    // low country sits under the dusk sky's brightest band, and at the first
    // two cuts it bleached to dune. The platform's own shadow is the honest
    // fiction that buys the read.
    out.multiplyScalar(1 - 0.42 * clamp01((r - 20) / 80));
    // Scree through the turf where the low hills rise.
    out.lerp(C_RUBBLE, clamp01((y - 1.2) * 0.35) * clamp01((mid - 0.5) * 2.2) * 0.6);
  }

  // The same two grades every floor takes, so nothing reads as a painted plane.
  out.multiplyScalar(0.60 + 0.50 * fbm(x * 0.021 - 61.7, z * 0.021 + 33.4, 2));
  out.multiplyScalar(0.90 + 0.20 * fbm(x * 0.096 + 12.5, z * 0.096 - 49.8, 2));
  out.multiplyScalar(1 + clamp01(y * 0.4) * 0.10 - clamp01(-y * 1.6) * 0.18);
}

const FORT_TERRAIN: TerrainSpec = {
  radius: 176,
  segments: { high: 168, medium: 128, low: 88 },
  step: { high: 0.8, medium: 1.0, low: 1.4 },
  uvScale: 1 / 35.2,
  colorAt: fortColor,
  surfaceAt(x, z, out) {
    // Stone is dry and stone does not churn. The only sheen is the flags'
    // own polish where boots have worn them — low, and inside the walls only.
    const r = Math.hypot(x, z);
    out.wet = 0.14 * (1 - clamp01((r - 12) / 3));
    out.churn = 0.10;
  },
};

// ---------------------------------------------------------------------------
// The flagged court
// ---------------------------------------------------------------------------
//
// A disc of its own, textured, riding 5-10 cm proud of the terrain. The floor
// pattern lives in TEXELS because it cannot live in vertices: the grid is
// 1.15 m with ~7 cm joints, the terrain lattice is 0.8 m rings with jitter,
// and a signal below Nyquist does not blur — it aliases, which is what cuts
// 3-4 photographed. At 1024² over 33 m the texture is 31 px/m: a joint is two
// texels wide and stays a LINE at any range the fight is seen from.

/** The square of world the flag texture covers, metres. Disc + skirt fit inside. */
const COURT_SPAN = 33;
/** Where flags end and the texture runs out through rubble to meet the terrain. */
const COURT_R = 15.9;

function buildFlagTexture(size: number, aniso: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const c = new THREE.Color();
  const m = new THREE.Color();
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i / size - 0.5) * COURT_SPAN;
      const z = (j / size - 0.5) * COURT_SPAN;
      const r = Math.hypot(x, z);

      // Slab space. Meander wobbles the joint lines a hand's width so the
      // grid is laid by men, not by a plotter.
      const u = (x * FLAG_C - z * FLAG_S) / 1.15;
      const v = (x * FLAG_S + z * FLAG_C) / 1.15;
      const su = Math.floor(u), sv = Math.floor(v);
      const fu = u - su, fv = v - sv;
      const id = hash2(su * 3 + 11, sv * 7 - 3);
      const id2 = hash2(su * 13 - 5, sv * 5 + 17);
      const meander = (noise2(u * 6.7 + 2.2, v * 6.7 - 5.1) - 0.5) * 0.06;
      const dEdge = Math.min(fu, 1 - fu, fv, 1 - fv) + meander;
      const jointW = 0.05 + id2 * 0.035;
      const joint = 1 - clamp01((dEdge - jointW * 0.35) / jointW);

      // The slab: its own tone step, a faint per-slab tilt (one lit edge, one
      // settled), wear drifts across many slabs, and stone grain inside each.
      c.copy(C_FLAG);
      c.lerp(C_FLAG_WORN, clamp01(fbm(x * 0.045 + 41.9, z * 0.045 - 17.2, 3) * 1.5 - 0.25));
      c.multiplyScalar(0.90 + id * 0.22);
      c.multiplyScalar(1 + (fu - 0.5) * (id - 0.5) * 0.18 + (fv - 0.5) * (id2 - 0.5) * 0.18);
      c.multiplyScalar(0.94 + noise2(x * 9.7 + 1.3, z * 9.7 - 7.7) * 0.12);
      c.multiplyScalar(0.97 + noise2(x * 31.1 - 3.9, z * 31.7 + 8.3) * 0.06);

      // Robbed slabs: one in eight is gone, and what shows is the packed
      // bedding it sat on — inset from the joint lines, so the hole keeps the
      // grid's shape the way a pulled tooth keeps the row's.
      if (id < 0.13) {
        m.copy(C_EARTH).lerp(C_RUBBLE, id2 * 0.5);
        m.multiplyScalar(0.85 + noise2(x * 7.7, z * 8.1) * 0.3);
        c.lerp(m, clamp01((0.40 - Math.max(Math.abs(fu - 0.5), Math.abs(fv - 0.5))) / 0.09));
      }

      // Joints darken; moss lives IN them first and creeps onto the stone
      // where the drainage says damp.
      c.lerp(C_JOINT, joint * 0.88);
      const damp = fbm(x * 0.11 - 23.4, z * 0.11 + 8.8, 3);
      c.lerp(C_MOSS, clamp01((damp - 0.52) * 2.2) * clamp01(joint * 1.3 + 0.08));
      c.lerp(C_MOSS, clamp01((damp - 0.62) * 1.8) * 0.35);

      // The garrison fire has burned here for years: soot inside the kerb.
      const scorch = 1 - clamp01((r - 1.5) / 1.0);
      c.lerp(C_EARTH, scorch * 0.45);
      c.multiplyScalar(1 - scorch * 0.40);

      // Out through the apron the flags drown in wall-fall, and past COURT_R
      // the texture is all rubble — the same field and family the terrain
      // shades the band with, so the disc's rim dissolves into it.
      m.copy(C_RUBBLE).multiplyScalar(0.8 + noise2(x * 3.1 + 6.6, z * 3.3 - 2.4) * 0.3);
      const rub = clamp01(FIELD.rubble(x, z) * 1.25);
      c.lerp(m, rub * (0.55 + noise2(x * 13.7, z * 11.9) * 0.35));
      c.lerp(m, clamp01((r - 13.6) / 1.4));

      // The same two luminance grades the terrain carries, so the rim matches
      // in light as well as in hue.
      c.multiplyScalar(0.60 + 0.50 * fbm(x * 0.021 - 61.7, z * 0.021 + 33.4, 2));
      c.multiplyScalar(0.90 + 0.20 * fbm(x * 0.096 + 12.5, z * 0.096 - 49.8, 2));

      c.convertLinearToSRGB();
      const o = (j * size + i) * 4;
      data[o] = Math.min(255, Math.round(c.r * 255));
      data[o + 1] = Math.min(255, Math.round(c.g * 255));
      data[o + 2] = Math.min(255, Math.round(c.b * 255));
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The polar mesh the texture rides on. It follows `heightAt` from 5 cm proud
 * at the fire to 10 cm at the rim — clear of the terrain's own vertex jitter —
 * and the last ring is a skirt driven under the rubble band, so a grazing
 * lens never finds a floating edge.
 */
function buildCourtDisc(heightAt: (x: number, z: number) => number): THREE.BufferGeometry {
  const SEGS = 96;
  const radii: number[] = [];
  for (let r = 0.55; r < COURT_R; r += 0.55) radii.push(r);
  radii.push(COURT_R, COURT_R + 0.5);
  const rings = radii.length;
  const skirt = rings - 1;
  const count = 1 + rings * SEGS;
  const pos = new Float32Array(count * 3);
  const uvA = new Float32Array(count * 2);
  const write = (n: number, x: number, z: number, y: number) => {
    pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z;
    uvA[n * 2] = x / COURT_SPAN + 0.5;
    uvA[n * 2 + 1] = z / COURT_SPAN + 0.5;
  };
  write(0, 0, 0, heightAt(0, 0) + 0.05);
  for (let i = 0; i < rings; i++) {
    const rad = radii[i];
    const lift = i === skirt ? -0.30 : 0.05 + 0.05 * clamp01((rad - 9) / 6);
    for (let s = 0; s < SEGS; s++) {
      const a = (s / SEGS) * Math.PI * 2;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      write(1 + i * SEGS + s, x, z, heightAt(x, z) + lift);
    }
  }
  const idx: number[] = [];
  for (let s = 0; s < SEGS; s++) idx.push(0, 1 + ((s + 1) % SEGS), 1 + s);
  for (let i = 0; i < rings - 1; i++) {
    const a0 = 1 + i * SEGS, b0 = 1 + (i + 1) * SEGS;
    for (let s = 0; s < SEGS; s++) {
      const s1 = (s + 1) % SEGS;
      idx.push(a0 + s, b0 + s1, b0 + s, a0 + s, a0 + s1, b0 + s1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvA, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// What stands on it
// ---------------------------------------------------------------------------

function buildFort(ctx: GroundBuildContext): void {
  const { root, materials, own, place, field, rng, scatter, heightAt, footing, pointLights } = ctx;

  // Every dressed stone in the fort wears this instead of the shared "rock":
  // the same granite, pulled down and blue. The catalog's 0x6a7078 is a
  // boulder in a green field; under the dusk rig's doubled warm key it came
  // back CREAM (cuts 3-4), and masonry that outshines the sky it is ruined
  // against reads as styrofoam. Cloned, so the moor's stones keep their own.
  const stoneMat = (materials.get("rock") as THREE.MeshStandardMaterial).clone();
  stoneMat.color.setHex(0x474d57);
  ctx.ownedMats.push(stoneMat);

  // ---- the court's floor ----
  {
    const tex = buildFlagTexture(ctx.settings.tier === "high" ? 1024 : 512,
      Math.min(8, ctx.settings.anisotropy));
    ctx.restore.push(() => tex.dispose());
    const flagMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.93, metalness: 0 });
    ctx.ownedMats.push(flagMat);
    const disc = new THREE.Mesh(own(buildCourtDisc(heightAt)), flagMat);
    disc.receiveShadow = true;
    root.add(disc);
  }

  // ---- the curtain wall, five lengths of it ----
  //
  // The solids `grounds.mjs` declared, drawn from the same fourteen-point
  // outline the server collides — the thing a man is pinned against IS the
  // collision polygon. Each gets a rubble fall at its feet: a wall does not
  // break in the air, and the fallen courses lying where they landed are what
  // say RUIN rather than "low wall".
  for (const wall of FIELD.walls) {
    const plan = wall.plan;
    const g = new THREE.Group();
    // COURSED, NOT WOBBLED. The first cut drew each wall with
    // `raisedStoneMesh` and the duel lens read five giant boulders — the
    // megalith outline is right for a standing stone and wrong for masonry.
    // A Roman wall is horizontal COURSES of squared blocks, and its ruin is a
    // stepped break line, not a curve. So the visual is built as block rows
    // inside the same footprint the server collides: per column the outline's
    // own top height decides how many courses survive, which keeps the drawn
    // silhouette inside the collision the sim believes.
    {
      const course = 0.44;
      const blocks: THREE.BufferGeometry[] = [];
      const cols = Math.max(4, Math.round((plan.radiusX * 2) / 0.92));
      const colW = (plan.radiusX * 2) / cols;
      for (let ci = 0; ci < cols; ci++) {
        const cx = -plan.radiusX + (ci + 0.5) * colW;
        // The broken profile: the same noise family as the outline, so no two
        // walls break alike and no column matches its neighbour.
        const frac = 0.35 + 0.65 * fbm(plan.x * 0.7 + ci * 1.31, plan.z * 0.7 - ci * 0.77, 2);
        const hTop = Math.max(course, (plan.lift + plan.radiusY) * frac);
        const rows = Math.max(1, Math.round(hTop / course));
        for (let ri = 0; ri < rows; ri++) {
          const stagger = (ri % 2 ? 0.5 : 0) * colW * 0.5;
          const bw = colW * (0.94 + (noise2(ci * 3.1 + ri, ri * 5.7) - 0.5) * 0.08);
          // The depth jitter is the END face's coursing: a wall seen end-on
          // shows one column of blocks, and only their unequal reach breaks
          // that face out of reading as a single rounded slab.
          const bd = plan.depth * (0.86 + (noise2(ri * 2.9, ci * 4.3) - 0.5) * 0.30);
          const bh = course * 0.94;
          const b = new THREE.BoxGeometry(bw, bh, bd);
          b.translate(
            cx + stagger * 0.3,
            ri * course + bh / 2,
            (noise2(ci * 7.7, ri * 6.1) - 0.5) * 0.05,
          );
          blocks.push(b);
        }
      }
      // `0.5` is 1/repeat of the granite: world-projected UVs at one tile per
      // metre. Merged boxes keep their 0-1 face UVs otherwise, which mapped
      // the whole granite tile twice across every 0.9 m block — the camo
      // speckle of cut 4, texel density set by block size instead of by metre.
      const mesh = new THREE.Mesh(own(mergeInto(blocks, 0.5)), stoneMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    const falls: THREE.Matrix4[] = [];
    const n = 9 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      // Along the wall's own length, spilling to both faces — more outside
      // than in, because a wall leans outward as it dies.
      const along = (rng() - 0.5) * plan.radiusX * 2.2;
      const side = (rng() < 0.62 ? 1 : -1) * (0.7 + rng() * 1.4);
      falls.push(place(along, -0.05 + rng() * 0.1, side, rng() * Math.PI, 0.20 + rng() * 0.24));
    }
    field(own(new THREE.BoxGeometry(1.1, 0.7, 0.8)), stoneMat, falls);
    g.position.set(plan.x, heightAt(plan.x, plan.z), plan.z);
    g.rotation.y = plan.rot;
    root.add(g);
  }

  // ---- the piers, and the drums that fell off them ----
  for (const [pi, pier] of FIELD.piers.entries()) {
    const plan = pier.plan;
    const g = new THREE.Group();
    // Coursed like the walls, for the same reason at closer range: the duel
    // lens walks right past a pier, and the megalith mesh read as a mossy
    // boulder four metres from the camera. A pier is squared blocks in a
    // column; its ruin is the top course sheared, not a curve.
    {
      const course = 0.46;
      const blocks: THREE.BufferGeometry[] = [];
      const rows = Math.max(2, Math.round((plan.lift + plan.radiusY) / course));
      for (let ri = 0; ri < rows; ri++) {
        const last = ri === rows - 1;
        const bw = plan.radiusX * 2 * (0.96 + (noise2(ri * 3.7 + pi, ri * 1.9) - 0.5) * 0.06);
        const bd = plan.depth * (1.5 + (noise2(ri * 5.1, pi * 2.3) - 0.5) * 0.2);
        const bh = course * (last ? 0.55 + noise2(pi * 7.1, ri) * 0.4 : 0.94);
        const b = new THREE.BoxGeometry(bw, bh, bd);
        b.translate(
          (noise2(ri * 8.3, pi * 4.9) - 0.5) * 0.05,
          ri * course + bh / 2,
          (noise2(ri * 6.7, pi * 9.1) - 0.5) * 0.05,
        );
        b.rotateY((noise2(ri * 2.1, pi * 3.3) - 0.5) * 0.10);
        blocks.push(b);
      }
      const mesh = new THREE.Mesh(own(mergeInto(blocks, 0.5)), stoneMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    // Column drums on their sides, rolled a little way — the classic ruin
    // photograph, and the one round shape on a ground of slabs.
    const drums: THREE.Matrix4[] = [];
    const away = pi ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Matrix4();
      const roll = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
      const spin = new THREE.Matrix4().makeRotationY(rng() * 0.8 + away * 0.4);
      const move = new THREE.Matrix4().makeTranslation(
        away * (1.1 + i * 0.95 + rng() * 0.2), 0.34, 0.5 + rng() * 0.8 - 0.4);
      m.multiply(move).multiply(spin).multiply(roll);
      drums.push(m);
    }
    field(own(new THREE.CylinderGeometry(0.34, 0.34, 0.86, 10)), materials.get("runestone"), drums);
    g.position.set(plan.x, heightAt(plan.x, plan.z), plan.z);
    g.rotation.y = plan.rot;
    root.add(g);
  }

  // ---- the outer curtain's footing, robbed to the last course ----
  //
  // THE EDGE OF THE FIGHT, MADE VISIBLE — the owner's report, 24 Aug 2026:
  // the sim clamps a body at 18 m and nothing marked it; the platform's fall
  // only begins at 18.5, which a man reads as scenery, not as a wall. So the
  // fort's OUTER wall line stands here as its own ruin: the footing course a
  // stone-robber leaves because it is bedded too deep to be worth the crow
  // bar, one to two courses, running the whole ring with breaches. A body
  // pressed to the clamp is pressed against dressed stone. Outside the play
  // bound, so it is decoration to the router — same law as the moor's dyke.
  {
    const blocks: THREE.Matrix4[] = [];
    const ARCS: ReadonlyArray<readonly [number, number]> = [
      [0.0, 0.9], [1.15, 2.35], [2.6, 3.6], [3.9, 4.9], [5.15, 6.05],
    ];
    for (const [a0, a1] of ARCS) {
      const along = Math.ceil(((a1 - a0) * 18.35) / 0.5);
      for (let i = 0; i < along; i++) {
        const a = a0 + ((i + 0.5) / along) * (a1 - a0);
        const endT = Math.min(i, along - 1 - i) / Math.max(1, along - 1);
        const courses = 1 + (rng() < Math.min(1, endT * 3) * 0.6 ? 1 : 0);
        for (let c = 0; c < courses; c++) {
          const d = 18.35 + (rng() - 0.5) * 0.18;
          const x = Math.cos(a) * d, z = Math.sin(a) * d;
          blocks.push(place(x, footing(x, z, 0.3) - 0.1 + c * 0.26, z,
            a + Math.PI / 2 + (rng() - 0.5) * 0.12, 0.26 + rng() * 0.06));
        }
      }
    }
    field(own(new THREE.BoxGeometry(1.9, 1.0, 1.5)), stoneMat, blocks, null, true);
  }

  // ---- the campfire on the flags ----
  //
  // The hazard, made visible: a garrison fire in a kerb of reused building
  // stone — squared blocks, not field cobbles, because everything loose here
  // was dressed once. Same sim contract as every ground: radius 2.0 at the
  // origin.
  {
    const fire = new THREE.Group();
    const kerb: THREE.Matrix4[] = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + rng() * 0.1;
      const d = 1.3 + rng() * 0.14;
      kerb.push(place(Math.cos(a) * d, 0.05, Math.sin(a) * d, a + rng() * 0.3, 0.30 + rng() * 0.1));
    }
    field(own(new THREE.BoxGeometry(1.0, 0.55, 0.7)), stoneMat, kerb);
    const logs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const g2 = new THREE.CylinderGeometry(0.09, 0.11, 1.35, 7);
      g2.rotateZ(Math.PI / 2 - 0.35 + rng() * 0.7);
      g2.rotateY(rng() * Math.PI);
      g2.translate((rng() - 0.5) * 0.4, 0.16 + i * 0.07, (rng() - 0.5) * 0.4);
      logs.push(g2);
    }
    const stack = new THREE.Mesh(own(mergeInto(logs)), materials.get("bonfireLog"));
    stack.castShadow = true;
    fire.add(stack);
    fire.add(fireMarker(0, 0.18, 0, 0.62, 1.2, "bonfire"));
    // The arena's hero light — see the note on the camp's. Every ground's
    // frame is built on its fire; only the village's fire actually lit it.
    const fireLight = new THREE.PointLight(0xff8830, 4, 18);
    fireLight.position.y = 1.8;
    fire.add(fireLight);
    pointLights.push(fireLight);
    fire.position.y = heightAt(0, 0);
    root.add(fire);
  }

  // ---- rubble, moss and the cold grass beyond ----
  //
  // Drawn from the same prop stream in build order, so a capture here is as
  // repeatable as one anywhere. Inside the walls the scatter is STONE —
  // dressed blocks gone over on the apron; past the ditch it hands over to
  // thin turf and the odd surveyed stone the plough never moved.
  {
    const blocks: THREE.Matrix4[] = [];
    const tufts: THREE.Matrix4[] = [];
    const n = scatter(560);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const d = 12.5 + rng() * rng() * 58;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const y = footing(x, z, 0.4);
      if (d < 18 && rng() < 0.8) {
        blocks.push(place(x, y - 0.10 + rng() * 0.06, z, rng() * Math.PI, 0.18 + rng() * rng() * 0.5));
      } else if (d < 19.5) {
        // Stone, not moss. Two crane frames paid for the lesson: a bush sunk
        // into ground the flag disc rides proud of surfaces through the court
        // as a green sliver, and on the apron's broken footing the same sink
        // buries it to an edge-on slice. The fort's moss lives in the flag
        // texture and the wall joints, where it cannot clip; the loose green
        // shape is not worth its failure modes here.
        blocks.push(place(x, y - 0.10, z, rng() * Math.PI, 0.16 + rng() * 0.3));
      } else if (rng() < 0.94) {
        tufts.push(place(x, y - 0.08, z, rng() * Math.PI * 2, 0.30 + rng() * 0.40));
      } else {
        blocks.push(place(x, y - 0.12, z, rng() * Math.PI, 0.3 + rng() * rng() * 0.8));
      }
    }
    // The low country's grass is the village tuft pulled cold — a CLONE, the
    // parent is shared with the other grounds for the life of the process.
    const coldMat = (materials.get("grassTuft") as THREE.MeshStandardMaterial).clone();
    coldMat.color.setHex(0x4a5a41);
    ctx.ownedMats.push(coldMat);
    field(own(new THREE.BoxGeometry(1.0, 0.62, 0.76)), stoneMat, blocks);
    field(own(buildBush(0x91b2)), coldMat, tufts);
  }
}

export const ROMAN_FORT_GROUND = registerGround({
  spec: ROMAN_FORT,
  terrain: FORT_TERRAIN,
  build: buildFort,
});
