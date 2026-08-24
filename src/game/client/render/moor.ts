// The Pictish moor: the second ground, and the first that is not a village.
//
// `world.ts`'s header states the contract this file is written to — "A new
// ground is a new `GroundDef` in its own module, `registerGround`d, and a new
// `GroundSpec` beside the village's. It does not touch this file." That held,
// with one honest cost: three things the village had written INLINE had to
// become shared first (`raisedStoneMesh`, `fireMarker`, `buildBush`), which is
// exactly what `docs/OPEN-DEFECTS.md` costed as "extract the builders, then
// write the ground".
//
// WHAT THIS PLACE IS. High open ground with nothing built on it: no palisade,
// no huts, no fence. Four standing stones at the quarters, a peat fire in the
// middle, heather and granite and black water. The sim half — the play disc,
// the spawn ring, the hazard — is the village's exactly, and `grounds.mjs` says
// why at `PICT_MOOR`.

import * as THREE from "three";
import { PICT_MOOR, clamp01, fbm, noise2 } from "@/game/grounds.mjs";
import {
  registerGround, raisedStoneMesh, fireMarker, buildBush, mergeInto,
  type GroundBuildContext, type TerrainSpec,
} from "./world";

const FIELD = PICT_MOOR.field;

// ---------------------------------------------------------------------------
// The palette
// ---------------------------------------------------------------------------
//
// The village is green and gold — turf, thatch, weld. A moor is none of those.
// It is bracken and heather over peat, which reads brown-purple at distance and
// almost black where the water stands, and the one bright thing on it is
// lichen on stone. Nothing here is a village colour lightened; they are chosen
// against each other so the two grounds cannot be mistaken at a glance, which
// is the whole reason for building a second one.
// FIRST CUT WAS TOO WARM AND THE FRAME SAID SO. `art/look/moor/` on the opening
// palette read as ORANGE SAND, not moor: the arena's rig is a low sun and it
// multiplies a warm albedo twice over, so a brown that looks like bracken in a
// swatch comes out as desert on the screen. The village survives the same light
// because its turf is green — a hue the rig cannot push further warm.
//
// So these are pulled cold and dark. `C_HEATH_DRY` is the term that did the
// damage and it is now a dun with the red taken out rather than a tan; peat
// leads instead of following; and the whole field is darker, because a moor at
// dusk IS dark and the sun is doing the lifting.
const C_HEATH = new THREE.Color(0x453a4e);        // heather in flower, dulled by distance
const C_HEATH_DRY = new THREE.Color(0x4c4733);    // last year's bracken, gone grey
const C_MOSS = new THREE.Color(0x38452a);         // sphagnum in the wet
const C_PEAT = new THREE.Color(0x1e1815);         // the cut face of it
const C_PEAT_WET = new THREE.Color(0x0d0c0b);     // standing water on peat
const C_GRANITE = new THREE.Color(0x6a6c75);      // scree and outcrop

function moorColor(x: number, z: number, y: number, out: THREE.Color): void {
  const big = fbm(x * 0.029 - 12.6, z * 0.029 + 55.3, 3);
  const mid = fbm(x * 0.128 + 33.1, z * 0.128 - 6.7, 3);
  const fine = noise2(x * 0.24 - 19.8, z * 0.24 + 7.2);

  // Heather over bracken, in broad drifts — a moor's colour changes by the
  // acre, not by the metre, which is why the low frequency leads.
  out.copy(C_HEATH).lerp(C_HEATH_DRY, clamp01(big * 1.8 - 0.35));
  out.lerp(C_MOSS, clamp01((mid - 0.46) * 2.1));

  // Peat where the fibre thins, and it is nearly black. This is the term that
  // stops the moor reading as heathland with the colour turned down.
  out.lerp(C_PEAT, clamp01(FIELD.peat(x, z) * (1.05 + fine * 0.4)));

  // The hollows. Water on peat is darker than the peat under it.
  const wet = FIELD.wet(x, z);
  out.lerp(C_PEAT_WET, clamp01(wet * 1.15));

  // Scree, high and dry: granite comes through where the relief climbs.
  const r = Math.hypot(x, z);
  if (r > FIELD.reliefRadius) {
    const bare = clamp01((y - 0.6) * 0.42) * clamp01((mid - 0.5) * 2.4);
    out.lerp(C_GRANITE, bare * 0.75);
  }

  // The same two grades the village floor takes, for the same reason: a field
  // written per vertex with no variation at two scales reads as a painted plane.
  out.multiplyScalar(0.58 + 0.54 * fbm(x * 0.022 + 71.4, z * 0.022 - 28.1, 2));
  out.multiplyScalar(0.90 + 0.20 * fbm(x * 0.098 - 44.9, z * 0.098 + 16.3, 2));
  out.multiplyScalar(1 + clamp01(y * 0.4) * 0.14 - clamp01(-y * 2.8) * 0.22);
}

const MOOR_TERRAIN: TerrainSpec = {
  radius: 176,
  segments: { high: 168, medium: 128, low: 88 },
  step: { high: 0.8, medium: 1.0, low: 1.4 },
  uvScale: 1 / 35.2,
  colorAt: moorColor,
  surfaceAt(x, z, out) {
    // Wet where the hollows are and NOWHERE ELSE. The village has churn — a
    // trodden settlement floor — and a moor has none: nothing has been carted
    // over it, which is the point. So `churn` is flat and low, and the only
    // thing allowed to shine is standing water.
    out.wet = clamp01(FIELD.wet(x, z) * 1.2);
    out.churn = 0.12;
  },
};

// ---------------------------------------------------------------------------
// What stands on it
// ---------------------------------------------------------------------------

function buildMoor(ctx: GroundBuildContext): void {
  const { root, materials, own, place, field, rng, scatter, heightAt, footing } = ctx;

  // ---- the standing stones ----
  //
  // The solids `grounds.mjs` declared, drawn. One mesh each rather than an
  // instanced field: there are four, they differ in lean and rotation, and the
  // collision footprint the server believes is this outline — so the thing on
  // screen is built from the same polygon rather than from a copy of it.
  for (const stone of FIELD.stones) {
    const plan = stone.plan;
    const g = new THREE.Group();
    g.add(raisedStoneMesh(stone, materials.get("runestone"), own));
    // Packing stones at the foot. A four-metre slab does not stand in soil on
    // its own and every surviving one is wedged.
    const packs: THREE.Matrix4[] = [];
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2;
      const d = 0.55 + rng() * 0.5;
      const px = Math.cos(a) * d;
      const pz = Math.sin(a) * d * 0.6;
      packs.push(place(px, -0.06 + rng() * 0.05, pz, rng() * Math.PI, 0.16 + rng() * 0.13));
    }
    const cobble = own(new THREE.DodecahedronGeometry(1, 0));
    field(cobble, materials.get("rock"), packs);
    g.position.set(plan.x, heightAt(plan.x, plan.z), plan.z);
    g.rotation.y = plan.rot;
    root.add(g);
  }

  // ---- the peat fire ----
  //
  // The hazard `grounds.mjs` declares, made visible. A peat fire is not a
  // bonfire: it burns low and almost without flame, so what stands here is a
  // ring of kerb stones and a bed of turves rather than a stack of logs — and
  // `fireMarker` is handed a smaller radius and half the height for the same
  // reason. It is still a fire at the middle of the ring with radius 2.0 in the
  // sim, because that is what the burn path and three harnesses are written on.
  {
    const fire = new THREE.Group();
    const kerb: THREE.Matrix4[] = [];
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 + rng() * 0.12;
      const d = 1.35 + rng() * 0.12;
      kerb.push(place(Math.cos(a) * d, 0.02, Math.sin(a) * d, rng() * Math.PI, 0.3 + rng() * 0.16));
    }
    field(own(new THREE.DodecahedronGeometry(1, 0)), materials.get("rock"), kerb);

    // The turves themselves: flat blocks stacked low, cut from the ground they
    // are burning on. `hutRoof` is the thatch material and it is the closest
    // thing the library has to cut turf — fibrous, matte and dark — which is
    // the honest reason it is used rather than a new one being added for four
    // hundred triangles.
    const turves: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * 0.62;
      const g = new THREE.BoxGeometry(0.46, 0.13, 0.3);
      g.translate(Math.cos(a) * d, 0.07 + Math.floor(i / 4) * 0.12, Math.sin(a) * d);
      g.rotateY(rng() * 0.7);
      turves.push(g);
    }
    const bed = new THREE.Mesh(own(mergeInto(turves)), materials.get("hutRoof"));
    bed.castShadow = true;
    fire.add(bed);

    fire.add(fireMarker(0, 0.16, 0, 0.5, 1.05, "bonfire"));
    fire.position.y = heightAt(0, 0);
    root.add(fire);
  }

  // ---- the boundary dyke ----
  //
  // THE EDGE OF THE FIGHT, MADE VISIBLE — the owner's report, 24 Aug 2026:
  // the village shows its palisade, but here "players would get stuck at an
  // invisible wall on the edge". The sim clamps a body at 18 m; this stands a
  // broken drystone dyke just OUTSIDE that at 18.5, so the clamp reads as
  // being stopped at the wall rather than by nothing. Field granite laid dry
  // and half fallen — the one structure a moor has ever had — in arcs with
  // gaps, because a boundary that reads as a built ring would be a second
  // palisade and this ground's identity is that nobody built it a fence.
  // Decoration, not a solid: it lives outside the play bound where no body
  // can reach it, so the router never hears of it.
  {
    const blocks: THREE.Matrix4[] = [];
    const ARCS: ReadonlyArray<readonly [number, number]> = [
      [0.15, 1.25], [1.75, 2.6], [3.05, 4.15], [4.6, 5.3], [5.65, 6.1],
    ];
    for (const [a0, a1] of ARCS) {
      const along = Math.ceil(((a1 - a0) * 18.5) / 0.46);
      for (let i = 0; i < along; i++) {
        const a = a0 + ((i + 0.5) / along) * (a1 - a0);
        // The dyke dies toward its gaps, as a robbed wall does.
        const endT = Math.min(i, along - 1 - i) / Math.max(1, along - 1);
        const courses = 1 + Math.round(Math.min(1, endT * 4) * (1 + rng()));
        for (let c = 0; c < courses; c++) {
          const d = 18.5 + (rng() - 0.5) * 0.22;
          const x = Math.cos(a) * d + (rng() - 0.5) * 0.1;
          const z = Math.sin(a) * d + (rng() - 0.5) * 0.1;
          blocks.push(place(x, footing(x, z, 0.3) - 0.08 + c * 0.21, z,
            a + Math.PI / 2 + (rng() - 0.5) * 0.3, 0.2 + rng() * 0.1));
        }
      }
    }
    field(own(new THREE.BoxGeometry(2.1, 1.05, 1.4)), materials.get("rock"), blocks, null, true);
  }

  // ---- heather, and the rocks it grows between ----
  //
  // Scattered on the SAME stream the village draws its props from, in build
  // order, so a capture of one ground is as repeatable as a capture of the
  // other. Nothing is placed inside the fighting floor's middle: a man needs to
  // see his feet, and a moor's cover belongs at its edges where the relief is.
  {
    const clumps: THREE.Matrix4[] = [];
    const rocks: THREE.Matrix4[] = [];
    const n = scatter(620);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const d = 13 + rng() * rng() * 54;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const y = footing(x, z, 0.4);
      if (rng() < 0.93) {
        // SMALL AND MANY. The first cut scattered these at 0.7-1.7 and the frame
        // read them as boulders: a bush at that scale is a shrub, and heather
        // is ankle-high. Measured off the same capture — the floor was already
        // correct (R 52 G 43 B 56 against the village's R 71 G 67 B 49, so
        // cooler AND darker), which is what said the fault was the props rather
        // than the palette.
        clumps.push(place(x, y - 0.09, z, rng() * Math.PI * 2, 0.22 + rng() * 0.3));
      } else {
        rocks.push(place(x, y - 0.14 + rng() * 0.08, z, rng() * Math.PI * 2, 0.22 + rng() * rng() * 0.7));
      }
    }
    // Bush geometry wearing a CLONE of the tuft material, dyed to heather. The
    // shape of a wind-cut clump and of a bush are the same thing and the
    // difference a player sees is colour and size — but the clone matters: the
    // tuft material is shared with the village's grass, and dyeing it in place
    // would turn every blade in the game purple for the life of the process.
    const heatherMat = (materials.get("grassTuft") as THREE.MeshStandardMaterial).clone();
    heatherMat.color.setHex(0x5b4258);
    ctx.ownedMats.push(heatherMat);
    field(own(buildBush(0x71c4)), heatherMat, clumps);
    field(own(new THREE.DodecahedronGeometry(1, 0)), materials.get("rock"), rocks);
  }
}

export const PICT_MOOR_GROUND = registerGround({
  spec: PICT_MOOR,
  terrain: MOOR_TERRAIN,
  build: buildMoor,
});
