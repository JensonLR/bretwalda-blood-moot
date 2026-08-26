// ============================================================
// OFFA'S DYKE — the dyke-and-march ground, drawn.
//
// `grounds.mjs` owns the shape (the bank at x = −21, the ditch beyond, the
// causeway gate, the mearc-stone); this file owns what that looks like. The
// identity, in one sentence: THE OPENEST FLOOR IN THE GAME WITH A WALL OF
// EARTH FOR A HORIZON — sheep-cropped border turf running level to the foot
// of a two-metre bank that goes on further than the eye, its timber
// revetment leaning where the years took it, Wales rising dark behind.
// Everything a moor or a village crowds the floor with, the march leaves
// out: a march is a LINE, and the emptiness on either side of it is the
// point.
// ============================================================
import * as THREE from "three";
import { OFFA_DYKE, fbm, noise2, clamp01, smoothstep } from "@/game/grounds.mjs";
import {
  registerGround, raisedStoneMesh, fireMarker, buildBush, mergeInto,
  type GroundBuildContext, type TerrainSpec,
} from "./world";

const FIELD = OFFA_DYKE.field;

// ---------------------------------------------------------------------------
// The palette
// ---------------------------------------------------------------------------
//
// Border turf is GREENER than the village's — cropped short by stock, never
// churned by carts — and the two builts things on it are earth and oak. The
// bank's own face is the one warm note: bare subsoil where the scarp is too
// steep for turf to hold, which is exactly how the real dyke reads today.
// Wales beyond the ditch goes blue-grey the way distance does.
const C_TURF = new THREE.Color(0x3f5230);        // cropped march grass
const C_TURF_DRY = new THREE.Color(0x585a35);    // summer-dried patches
const C_EARTH = new THREE.Color(0x4a3826);       // the bank's bare scarp
const C_DITCH = new THREE.Color(0x2a2f22);       // shade and damp in the ditch
const C_MARSH = new THREE.Color(0x1c211c);       // standing water in its bottom
const C_FAR = new THREE.Color(0x3a4440);         // Wales, going to weather

function dykeColor(x: number, z: number, y: number, out: THREE.Color): void {
  const big = fbm(x * 0.031 + 21.2, z * 0.031 - 9.8, 3);
  const mid = fbm(x * 0.12 - 14.6, z * 0.12 + 40.2, 3);

  out.copy(C_TURF).lerp(C_TURF_DRY, clamp01(big * 1.7 - 0.4));

  // The scarp: bare earth where the bank's slope is steep. Read off the
  // height rather than painted at a radius, so it follows the earthwork's
  // own wander — the same argument every ground's colour makes.
  const bank = Math.exp(-((x - FIELD.bankX) ** 2) / (2 * 2.2 * 2.2));
  out.lerp(C_EARTH, clamp01(bank * (0.35 + mid * 0.5) * clamp01(y * 0.8)));

  // The ditch, dark; the marsh in its bottom, darker.
  const ditch = Math.exp(-((x - FIELD.ditchX) ** 2) / (2 * 2.3 * 2.3));
  out.lerp(C_DITCH, clamp01(ditch * 0.8));
  out.lerp(C_MARSH, clamp01(FIELD.wet(x, z) * 1.1));

  // Distance takes Wales blue-grey.
  out.lerp(C_FAR, smoothstep(34, 96, -x) * 0.7);

  // The same two grades every floor takes, for the same reason.
  out.multiplyScalar(0.6 + 0.5 * fbm(x * 0.022 + 3.4, z * 0.022 - 61.2, 2));
  out.multiplyScalar(0.92 + 0.16 * fbm(x * 0.1 - 8.8, z * 0.1 + 27.5, 2));
  out.multiplyScalar(1 + clamp01(y * 0.35) * 0.1 - clamp01(-y * 2.2) * 0.2);
}

const DYKE_TERRAIN: TerrainSpec = {
  radius: 176,
  segments: { high: 168, medium: 128, low: 88 },
  step: { high: 0.8, medium: 1.0, low: 1.4 },
  uvScale: 1 / 35.2,
  colorAt: dykeColor,
  surfaceAt(x, z, out) {
    // Only the ditch bottom shines; a cropped march is dry and nothing has
    // carted over it, so churn stays low the way the moor's does.
    out.wet = clamp01(FIELD.wet(x, z) * 1.1);
    out.churn = 0.1;
  },
};

// ---------------------------------------------------------------------------
// What stands on it
// ---------------------------------------------------------------------------

function buildDyke(ctx: GroundBuildContext): void {
  const { root, materials, own, place, field, rng, scatter, heightAt, footing, pointLights } = ctx;

  // ---- the mearc-stone ----
  //
  // The one solid `grounds.mjs` declares, drawn from the same outline the
  // server collides — the moor's rule, for the moor's reason.
  {
    const stone = FIELD.stone;
    const plan = stone.plan;
    const g = new THREE.Group();
    g.add(raisedStoneMesh(stone, materials.get("runestone"), own));
    const packs: THREE.Matrix4[] = [];
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2;
      const d = 0.5 + rng() * 0.45;
      packs.push(place(Math.cos(a) * d, -0.05 + rng() * 0.04, Math.sin(a) * d * 0.6,
        rng() * Math.PI, 0.14 + rng() * 0.12));
    }
    field(own(new THREE.DodecahedronGeometry(1, 0)), materials.get("rock"), packs);
    g.position.set(plan.x, heightAt(plan.x, plan.z), plan.z);
    g.rotation.y = plan.rot;
    root.add(g);
  }

  // ---- the beacon fire ----
  //
  // A march-warden's beacon: a leaning tripod of long poles over the flame,
  // because a beacon is built to be SEEN ALONG THE LINE — and so is the fire
  // burning at the middle of a moot. Sim geometry identical to every fire.
  {
    const fire = new THREE.Group();
    const kerb: THREE.Matrix4[] = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + rng() * 0.14;
      const d = 1.4 + rng() * 0.12;
      kerb.push(place(Math.cos(a) * d, 0.02, Math.sin(a) * d, rng() * Math.PI, 0.28 + rng() * 0.14));
    }
    field(own(new THREE.DodecahedronGeometry(1, 0)), materials.get("rock"), kerb);

    const poles: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const g = new THREE.CylinderGeometry(0.05, 0.07, 3.3, 6);
      g.translate(0, 1.55, 0);
      g.rotateZ(0.42);
      g.rotateY(a);
      poles.push(g);
    }
    const tripod = new THREE.Mesh(own(mergeInto(poles)), materials.get("palisade"));
    tripod.castShadow = true;
    fire.add(tripod);

    fire.add(fireMarker(0, 0.18, 0, 0.58, 1.5, "bonfire"));
    // The arena's hero light — every ground's, by the 26 Aug law.
    const fireLight = new THREE.PointLight(0xff8830, 3.8, 17);
    fireLight.position.y = 1.7;
    fire.add(fireLight);
    pointLights.push(fireLight);
    fire.position.y = heightAt(0, 0);
    root.add(fire);
  }

  // ---- the revetment: the dyke wearing its timber ----
  //
  // Offa's bank carried a palisade or revetment along stretches, and the
  // TIMBER is what turns "a long hill" into "a built thing" at fight
  // distance. Posts march along the bank's east shoulder the whole visible
  // run, leaning and gapped the way twelve decades leave them — and they are
  // ALSO the boundary law on the west: the nearest posts stand at ~19.5 m,
  // so the r=18 clamp reads as being stopped under the wall.
  {
    const posts: THREE.Matrix4[] = [];
    const postGeo = own(new THREE.CylinderGeometry(0.09, 0.12, 1.7, 6));
    for (let z = -78; z <= 78; z += 1.15 + rng() * 0.5) {
      // The revetment stands down in the gate's causeway gap — the gate
      // there is its own build below.
      if (Math.abs(z - FIELD.gateZ) < FIELD.gateHalf + 0.8) continue;
      if (rng() < 0.12) continue; // a century of gaps
      const x = FIELD.bankX + 1.55 + (rng() - 0.5) * 0.3;
      const y = heightAt(x, z);
      posts.push(place(x, y + 0.62, z, rng() * Math.PI, 0.9 + rng() * 0.25,
        (rng() - 0.5) * 0.16, (rng() - 0.5) * 0.2));
    }
    field(postGeo, materials.get("palisade"), posts);
  }

  // ---- the gate on the causeway ----
  //
  // Where the bank breaks, somebody keeps a door: two heavy posts, a lintel,
  // and a wattle leaf standing open. The one piece of joinery on the ground,
  // which is what makes it the signature rather than a texture.
  {
    const g = new THREE.Group();
    const parts: THREE.BufferGeometry[] = [];
    for (const s of [-1, 1]) {
      const post = new THREE.CylinderGeometry(0.16, 0.19, 3.0, 7);
      post.translate(0, 1.5, s * (FIELD.gateHalf - 0.4));
      parts.push(post);
    }
    const lintel = new THREE.BoxGeometry(0.5, 0.34, FIELD.gateHalf * 2 + 0.2);
    lintel.translate(0, 3.05, 0);
    parts.push(lintel);
    const gate = new THREE.Mesh(own(mergeInto(parts)), materials.get("palisade"));
    gate.castShadow = true;
    g.add(gate);
    // The wattle leaf, swung open against the south post.
    const leaf = new THREE.Mesh(own(new THREE.BoxGeometry(0.1, 2.1, 1.7)),
      materials.get("hutWall"));
    leaf.position.set(0.75, 1.05, -(FIELD.gateHalf - 0.4) + 0.85);
    leaf.rotation.y = 0.7;
    leaf.castShadow = true;
    g.add(leaf);
    g.position.set(FIELD.bankX, heightAt(FIELD.bankX, FIELD.gateZ), FIELD.gateZ);
    root.add(g);
  }

  // ---- the mearc-stakes: the boundary law on the open sides ----
  //
  // The west is the dyke; the north, east and south are marked the way a
  // march is — single stakes at long intervals along the r = 18.4 line, each
  // with a scrap of cloth. Sparser than any palisade on purpose: a march is
  // agreed, not defended, and the line is the point, not the fence.
  {
    const stakes: THREE.Matrix4[] = [];
    const rags: THREE.Matrix4[] = [];
    for (let a = -1.35; a <= 1.35 * Math.PI; a += 0.42 + rng() * 0.2) {
      const d = 18.4 + (rng() - 0.5) * 0.2;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (x < -14) continue; // the dyke owns the west
      const y = footing(x, z, 0.2);
      stakes.push(place(x, y + 0.55, z, rng() * Math.PI, 0.8 + rng() * 0.2,
        (rng() - 0.5) * 0.14, (rng() - 0.5) * 0.14));
      if (rng() < 0.6) rags.push(place(x, y + 1.28, z, rng() * Math.PI * 2, 0.5 + rng() * 0.3));
    }
    field(own(new THREE.CylinderGeometry(0.05, 0.07, 1.6, 5)), materials.get("palisade"), stakes);
    field(own(new THREE.BoxGeometry(0.34, 0.22, 0.02)), materials.get("hutRoof"), rags, null, false);
  }

  // ---- gorse, and the march's few oaks ----
  //
  // Cover belongs at the edges; the floor's middle stays the longest open
  // sightline in the game. Gorse in wind-cut clumps, darker and spinier than
  // heather; a handful of low field oaks on the English side.
  {
    const clumps: THREE.Matrix4[] = [];
    const rocks: THREE.Matrix4[] = [];
    const n = scatter(430);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const d = 14 + rng() * rng() * 52;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      // Not on the bank's scarp and not in the ditch: gorse holds the
      // shoulders and the open march, and the earthwork stays legible.
      if (x < FIELD.bankX + 3.5 && x > FIELD.ditchX - 3.5) continue;
      const y = footing(x, z, 0.4);
      if (rng() < 0.9) clumps.push(place(x, y - 0.08, z, rng() * Math.PI * 2, 0.24 + rng() * 0.34));
      else rocks.push(place(x, y - 0.12 + rng() * 0.06, z, rng() * Math.PI * 2, 0.2 + rng() * rng() * 0.5));
    }
    const gorseMat = (materials.get("grassTuft") as THREE.MeshStandardMaterial).clone();
    gorseMat.color.setHex(0x3d4a1f);
    ctx.ownedMats.push(gorseMat);
    field(own(buildBush(0x9e21)), gorseMat, clumps);
    field(own(new THREE.DodecahedronGeometry(1, 0)), materials.get("rock"), rocks);

    // The oaks: trunk and a broad low crown, three of them, east side only.
    const oaks: Array<[number, number]> = [[34, -18], [46, 9], [27, 31]];
    for (const [ox, oz] of oaks) {
      const y = footing(ox, oz, 1.2);
      const parts: THREE.BufferGeometry[] = [];
      const trunk = new THREE.CylinderGeometry(0.34, 0.5, 3.4, 7);
      trunk.translate(0, 1.7, 0);
      parts.push(trunk);
      const tree = new THREE.Mesh(own(mergeInto(parts)), materials.get("palisade"));
      tree.castShadow = true;
      const crown = new THREE.Mesh(own(buildBush(0x51 + oz)), gorseMat);
      crown.scale.setScalar(3.2 + noise2(ox, oz) * 1.2);
      crown.position.y = 3.6;
      crown.castShadow = true;
      const g = new THREE.Group();
      g.add(tree);
      g.add(crown);
      g.position.set(ox, y, oz);
      root.add(g);
    }
  }
}

export const OFFA_DYKE_GROUND = registerGround({
  spec: OFFA_DYKE,
  terrain: DYKE_TERRAIN,
  build: buildDyke,
});
