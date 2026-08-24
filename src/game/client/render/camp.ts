// The winter camp: the fourth ground, and the Danelaw's own.
//
// `world.ts`'s contract, held a third time: a `GroundDef` in its own module,
// `registerGround`d beside its `GroundSpec` in `grounds.mjs`. What this one
// spends the seam on is the fourth horizon — after a valley, a climb and a
// platform, the fen is LEVEL: frozen sheets running flat to a willow line
// kept two metres tall, the longest sightlines in the game. Inside the bank
// it is the Great Army at home: a trodden floor, tents against the earthwork,
// supplies stacked, a cauldron over the fire — and ONE ship hauled out on the
// fighting floor, which is the whole ground's sentence in a single object.

import * as THREE from "three";
import { DANELAW_CAMP, clamp01, fbm, noise2, smoothstep } from "@/game/grounds.mjs";
import {
  registerGround, fireMarker, buildBush, mergeInto,
  type GroundBuildContext, type TerrainSpec,
} from "./world";

const FIELD = DANELAW_CAMP.field;

// ---------------------------------------------------------------------------
// The palette
// ---------------------------------------------------------------------------
//
// Winter fen under the dusk rig. The moor's lesson stands (a warm low sun
// multiplies a warm albedo twice), and this ground leans INTO the one thing
// the rig cannot warm: ICE. Every dry surface is dead-season straw and peat —
// low chroma, mid-dark — and the water is a cold sheet that takes the sky.
// The one saturated thing in the frame is the Danelaw's own garnet, arriving
// as a sail and a tent rather than as a livery.
const C_MUD = new THREE.Color(0x1f1a13);       // the trodden floor, an army's winter of boots
const C_STRAW = new THREE.Color(0x4a4129);     // strewn bedding straw, dead sedge
const C_TURF_COLD = new THREE.Color(0x2c3829); // the bank's turf, bitten by frost
const C_SPOIL = new THREE.Color(0x2f2418);     // the ditch's upcast, bare on the bank face
const C_PEAT = new THREE.Color(0x191410);      // wet black ground between sedge
const C_SEDGE = new THREE.Color(0x39382a);     // winter fen, straw-olive
const C_ICE = new THREE.Color(0x42525c);       // the sheet, taking the sky
const C_ICE_DEEP = new THREE.Color(0x243139);  // the channel, where the water is under it
const C_SNOW = new THREE.Color(0x66727f);      // dust on the ice, drifts against tussocks
const C_SOOT = new THREE.Color(0x17130f);      // around the fire

function campColor(x: number, z: number, y: number, out: THREE.Color): void {
  const r = Math.hypot(x, z);
  const big = fbm(x * 0.027 + 12.9, z * 0.027 - 44.2, 3);
  const mid = fbm(x * 0.09 - 33.1, z * 0.09 + 17.8, 3);
  const fine = noise2(x * 0.31 + 8.2, z * 0.31 - 21.6);

  const w = FIELD.water(x, z);
  const bank = FIELD.bank(x, z);
  const floor = 1 - smoothstep(17.5, 20.5, r);

  // The camp floor: mud an army trod all winter, straw thrown down over the
  // worst of it, frost catching the ridges of the ruts in the morning.
  out.copy(C_MUD).lerp(C_STRAW, clamp01((mid - 0.48) * 1.9) * 0.38 * floor);
  out.lerp(C_SNOW, clamp01((fine - 0.66) * 1.9) * 0.10 * floor);
  out.lerp(C_SOOT, (1 - smoothstep(1.6, 3.2, r)) * 0.7);

  // The fen: dead sedge over peat, the peat showing in every dip.
  const fen = smoothstep(19, 24, r);
  out.lerp(C_SEDGE, fen * clamp01(0.55 + big * 0.5));
  out.lerp(C_PEAT, fen * clamp01((0.52 - mid) * 2.2));
  // Frost, harder out on the open ground.
  out.lerp(C_SNOW, fen * clamp01((fine - 0.63) * 1.7) * 0.08);

  // The earthwork over it: turf on the slopes, spoil where the face is steep,
  // and the crest bitten white.
  out.lerp(C_TURF_COLD, clamp01(bank * 2.2));
  out.lerp(C_SPOIL, clamp01((bank - 0.25) * 2.0) * clamp01((0.55 - mid) * 2.5));
  out.lerp(C_SNOW, clamp01((bank - 0.62) * 3.0) * 0.22);

  // The ice, last, because it replaces the ground rather than dressing it:
  // sheet at the margin, channel colour where the water runs under, snow
  // blown across it in streaks that remember the wind.
  if (w > 0.01) {
    const sheet = new THREE.Color().copy(C_ICE).lerp(C_ICE_DEEP, w * w * clamp01(0.4 + big * 0.5));
    const streak = noise2(x * 0.11 + z * 0.05 + 4.4, z * 0.023 - 9.1);
    sheet.lerp(C_SNOW, clamp01((streak - 0.60) * 2.2) * 0.38);
    sheet.multiplyScalar(0.94 + fine * 0.10);
    out.lerp(sheet, smoothstep(0.12, 0.55, w));
  }

  // The same two grades every floor takes, so nothing reads as a painted
  // plane — and a gentle pull-down with distance, milder than the fort's:
  // sedge is mid-dark already and the level horizon should stay READABLE.
  out.multiplyScalar(0.60 + 0.50 * fbm(x * 0.021 - 61.7, z * 0.021 + 33.4, 2));
  out.multiplyScalar(0.90 + 0.20 * fbm(x * 0.096 + 12.5, z * 0.096 - 49.8, 2));
  out.multiplyScalar(1 - 0.38 * clamp01((r - 26) / 100));
  out.multiplyScalar(1 + clamp01(y * 0.4) * 0.08 - clamp01(-y * 1.6) * 0.10);
}

const CAMP_TERRAIN: TerrainSpec = {
  radius: 176,
  segments: { high: 168, medium: 128, low: 88 },
  step: { high: 0.8, medium: 1.0, low: 1.4 },
  uvScale: 1 / 35.2,
  colorAt: campColor,
  surfaceAt(x, z, out) {
    const r = Math.hypot(x, z);
    const w = FIELD.water(x, z);
    // Ice is the wettest thing the wet channel has ever been asked for, and
    // it is exactly what the channel is for: a low-roughness sheen that takes
    // the sky, without a second water material. The camp floor keeps a
    // trodden slick; the bank and dry fen are winter-dry.
    // The ICE alone gets the sheen. The first two cuts gave the trodden
    // floor a slick (wet 0.22, churn 0.55) and both duel and crane aim at
    // the sun: the whole midground came back as a warm MIRROR — salmon on
    // every dry surface, however dark the albedo under it went. Ice is the
    // one surface that has earned the sky's reflection; mud in January is
    // frozen matte.
    out.wet = w * 0.9 + 0.05 * (1 - smoothstep(8, 16, r));
    // Churn LOW everywhere: the detail map's trampled-mud pattern is pale,
    // and at 0.30 it was a share of what still read as sand after the albedo
    // went dark. Frozen ruts do not churn.
    out.churn = 0.12;
  },
};

// ---------------------------------------------------------------------------
// The ship
// ---------------------------------------------------------------------------
//
// Clinker-built the way the finds are: strakes lapped over the one below,
// sheer sweeping up hard at both ends, stems standing proud. Built as lofted
// strips over shared station curves, so the hull is fair by construction and
// the whole thing is a handful of merged geometries. The collision polygon is
// `grounds.mjs`'s tapered ellipse; everything drawn here stays inside it.

/** Stations along the hull, t in [-1, 1]. */
const SHIP_HALF = 4.45;
function sheerY(t: number): number { return 0.98 + 0.92 * Math.pow(Math.abs(t), 3.2); }
function keelY(t: number): number { return 0.16 + 0.42 * Math.pow(Math.abs(t), 5); }
function halfBeam(t: number): number { return 1.08 * Math.pow(Math.max(0, 1 - t * t), 0.42); }

/** One side's strakes, lofted. `side` is -1 or 1. */
function buildStrakes(side: number): THREE.BufferGeometry[] {
  const STRAKES = 7;
  const STATIONS = 26;
  const out: THREE.BufferGeometry[] = [];
  for (let s = 0; s < STRAKES; s++) {
    const f0 = s / STRAKES, f1 = (s + 1) / STRAKES;
    const pos: number[] = [];
    for (let i = 0; i <= STATIONS; i++) {
      const t = (i / STATIONS) * 2 - 1;
      const x = t * SHIP_HALF;
      const yk = keelY(t), yg = sheerY(t), hb = halfBeam(t);
      // The section: beam grows with a soft power from keel to gunwale, so
      // the bilge turns instead of cornering.
      const y0 = yk + (yg - yk) * f0, y1 = yk + (yg - yk) * f1;
      const b0 = hb * Math.pow(f0, 0.55) + 0.06;
      const b1 = hb * Math.pow(f1, 0.55) + 0.06;
      // The clinker lap: each strake's UPPER edge stands a little outboard,
      // so every plank line is a lit edge over a shadow line.
      pos.push(x, y0, side * (b0 + 0.015), x, y1, side * (b1 + 0.045));
    }
    const g = new THREE.BufferGeometry();
    const verts = new Float32Array(pos);
    const idx: number[] = [];
    for (let i = 0; i < STATIONS; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    const uv = new Float32Array(((STATIONS + 1) * 2) * 2);
    for (let i = 0; i <= STATIONS; i++) {
      uv[i * 4] = (i / STATIONS) * 6; uv[i * 4 + 1] = 0;
      uv[i * 4 + 2] = (i / STATIONS) * 6; uv[i * 4 + 3] = 0.4;
    }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    out.push(g);
  }
  return out;
}

function buildShip(ctx: GroundBuildContext): THREE.Group {
  const { materials, own, rng } = ctx;
  const g = new THREE.Group();

  // Tarred oak: the palisade's grain, pulled to pitch. Cloned, so the
  // village's fence keeps its own colour.
  const tar = (materials.get("palisade") as THREE.MeshStandardMaterial).clone();
  tar.color.setHex(0x241a10);
  tar.roughness = 0.88;
  ctx.ownedMats.push(tar);

  const hullParts: THREE.BufferGeometry[] = [];
  hullParts.push(...buildStrakes(-1), ...buildStrakes(1));
  // The keel: a proud plank the length of the boat.
  {
    const k = new THREE.BoxGeometry(SHIP_HALF * 2 + 0.4, 0.22, 0.14);
    k.translate(0, 0.14, 0);
    hullParts.push(k);
  }
  // Stems: the sweep past the sheer at both ends, lofted as one strip each.
  for (const e of [-1, 1]) {
    const STEPS = 8;
    const pos: number[] = [];
    for (let i = 0; i <= STEPS; i++) {
      const q = i / STEPS;
      const x = e * (SHIP_HALF - 0.15 + q * 1.05);
      const y = keelY(1) + q * q * 2.45;
      pos.push(x, y, -0.075, x, y + 0.34 + q * 0.1, 0.075);
    }
    const s = new THREE.BufferGeometry();
    s.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
    const idx: number[] = [];
    for (let i = 0; i < STEPS; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      idx.push(a, c, b, b, c, d, a, b, c, b, d, c);
    }
    s.setIndex(idx);
    s.computeVertexNormals();
    hullParts.push(s);
  }
  // Gunwale caps and thwarts — the interior a lens above the rail actually sees.
  {
    const cap = (side: number) => {
      const STATIONS = 18;
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < STATIONS; i++) {
        const t0 = (i / STATIONS) * 2 - 1, t1 = ((i + 1) / STATIONS) * 2 - 1;
        const tm = (t0 + t1) / 2;
        const seg = new THREE.BoxGeometry((t1 - t0) * SHIP_HALF + 0.02, 0.09, 0.14);
        seg.rotateY(-side * Math.atan2(halfBeam(t1) - halfBeam(t0), (t1 - t0) * SHIP_HALF));
        seg.translate(tm * SHIP_HALF, sheerY(tm) + 0.02, side * (halfBeam(tm) * Math.pow(1, 0.55) + 0.09));
        parts.push(seg);
      }
      return parts;
    };
    hullParts.push(...cap(-1), ...cap(1));
    for (const tx of [-2.6, -0.9, 0.9, 2.6]) {
      const t = tx / SHIP_HALF;
      const b = new THREE.BoxGeometry(0.26, 0.07, halfBeam(t) * 2 * 0.92);
      b.translate(tx, keelY(t) + (sheerY(t) - keelY(t)) * 0.55, 0);
      hullParts.push(b);
    }
  }
  const hull = new THREE.Mesh(own(mergeInto(hullParts, 0.5)), tar);
  hull.castShadow = true;
  hull.receiveShadow = true;
  g.add(hull);

  // Mast, yard and the furled sail: the Danelaw's garnet, rolled up for the
  // winter but still the brightest thing on the ship — a camp does not strike
  // its identity just because the river froze.
  {
    const mastMat = materials.get("poleWood");
    const mast = new THREE.Mesh(own(new THREE.CylinderGeometry(0.09, 0.13, 5.6, 8)), mastMat);
    mast.position.set(0.2, keelY(0) + 2.8, 0);
    mast.castShadow = true;
    g.add(mast);
    const yard = new THREE.Mesh(own(new THREE.CylinderGeometry(0.055, 0.055, 5.4, 7)), mastMat);
    yard.rotation.z = Math.PI / 2;
    yard.position.set(0.2, keelY(0) + 1.9, 0);
    yard.castShadow = true;
    g.add(yard);
    const sailMat = (materials.get("bannerRed") as THREE.MeshStandardMaterial).clone();
    sailMat.color.setHex(0x6e1c22);
    ctx.ownedMats.push(sailMat);
    const bundle: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const c = new THREE.CylinderGeometry(0.16 - i * 0.02, 0.17 - i * 0.02, 1.7, 7);
      c.rotateZ(Math.PI / 2);
      c.translate(-1.6 + i * 1.62 + (rng() - 0.5) * 0.1, keelY(0) + 1.9 - 0.11, (rng() - 0.5) * 0.05);
      bundle.push(c);
    }
    const sail = new THREE.Mesh(own(mergeInto(bundle)), sailMat);
    sail.castShadow = true;
    g.add(sail);
    // Stays to the stems, so the mast is rigged rather than planted.
    const ropeMat = materials.get("palisadeBinding");
    for (const e of [-1, 1]) {
      const top = new THREE.Vector3(0.2, keelY(0) + 5.4, 0);
      const foot = new THREE.Vector3(e * (SHIP_HALF + 0.75), keelY(1) + 2.2, 0);
      const len = top.distanceTo(foot);
      const stay = new THREE.Mesh(own(new THREE.CylinderGeometry(0.018, 0.018, len, 5)), ropeMat);
      stay.position.copy(top).add(foot).multiplyScalar(0.5);
      stay.lookAt(foot);
      stay.rotateX(Math.PI / 2);
      g.add(stay);
    }
  }

  // Oars shipped over the rail, and the skids she was hauled up on.
  {
    const pole = materials.get("poleWood");
    const oars: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const o = new THREE.CylinderGeometry(0.035, 0.045, 4.4, 6);
      o.rotateZ(Math.PI / 2 + 0.16 + i * 0.05);
      o.rotateY(0.2);
      o.translate(-0.7 + i * 0.5, sheerY(0) + 0.25 + i * 0.06, halfBeam(-0.1) * 0.7);
      oars.push(o);
    }
    const om = new THREE.Mesh(own(mergeInto(oars)), pole);
    om.castShadow = true;
    g.add(om);
    const skids: THREE.BufferGeometry[] = [];
    for (const tx of [-2.2, 1.8]) {
      const s = new THREE.CylinderGeometry(0.12, 0.12, 3.4, 7);
      s.rotateX(Math.PI / 2);
      s.translate(tx, 0.1, 0);
      skids.push(s);
    }
    const sk = new THREE.Mesh(own(mergeInto(skids)), materials.get("bonfireLog"));
    sk.receiveShadow = true;
    g.add(sk);
  }

  return g;
}

// ---------------------------------------------------------------------------
// What stands on the rest of it
// ---------------------------------------------------------------------------

function buildCamp(ctx: GroundBuildContext): void {
  const { root, materials, own, place, field, rng, scatter, heightAt, footing } = ctx;

  // ---- the ship, on the plan the server collides ----
  {
    const plan = FIELD.ship.plan;
    const ship = buildShip(ctx);
    ship.position.set(plan.x, heightAt(plan.x, plan.z) - 0.06, plan.z);
    ship.rotation.y = plan.rot;
    // Heeled onto her bilge, as a hull on skids sits.
    ship.rotation.x = 0.075;
    root.add(ship);
  }

  // ---- the fire: a cauldron over it, because an army eats ----
  {
    const fire = new THREE.Group();
    // Fire-ring stones in the fort's lesson, pre-applied: the catalog rock is
    // a pale boulder under the dusk key, and at kerb scale cut 4 photographed
    // WHITE CUBES around the fire. Dark, sunk to their shoulders, sooted by a
    // winter of use.
    const kerbMat = (materials.get("rock") as THREE.MeshStandardMaterial).clone();
    kerbMat.color.setHex(0x33373c);
    ctx.ownedMats.push(kerbMat);
    const stones: THREE.Matrix4[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rng() * 0.25;
      const d = 1.25 + rng() * 0.15;
      stones.push(place(Math.cos(a) * d, -0.06, Math.sin(a) * d, rng() * Math.PI, 0.15 + rng() * 0.12));
    }
    field(own(new THREE.BoxGeometry(1.0, 0.6, 0.8)), kerbMat, stones);
    const logs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const l = new THREE.CylinderGeometry(0.08, 0.1, 1.25, 7);
      l.rotateZ(Math.PI / 2 - 0.3 + rng() * 0.6);
      l.rotateY(rng() * Math.PI);
      l.translate((rng() - 0.5) * 0.35, 0.14 + i * 0.06, (rng() - 0.5) * 0.35);
      logs.push(l);
    }
    const stack = new THREE.Mesh(own(mergeInto(logs)), materials.get("bonfireLog"));
    stack.castShadow = true;
    fire.add(stack);
    // The tripod and the pot: black iron against the flame, the silhouette
    // that says CAMP from every bearing the fire is seen on.
    const iron = materials.get("torchCup");
    const legs: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const leg = new THREE.CylinderGeometry(0.03, 0.035, 2.3, 6);
      leg.rotateX(0.42);
      leg.rotateY(a);
      leg.translate(Math.cos(a) * 0.62, 1.0, Math.sin(a) * 0.62);
      legs.push(leg);
    }
    const tripod = new THREE.Mesh(own(mergeInto(legs)), iron);
    tripod.castShadow = true;
    fire.add(tripod);
    const pot = new THREE.Mesh(own(new THREE.CylinderGeometry(0.30, 0.22, 0.3, 10)), iron);
    pot.position.y = 1.28;
    pot.castShadow = true;
    fire.add(pot);
    fire.add(fireMarker(0, 0.18, 0, 0.62, 1.2, "bonfire"));
    fire.position.y = heightAt(0, 0);
    root.add(fire);
  }

  // ---- tents against the bank, on the land side ----
  //
  // Between the fighting floor and the earthwork, where the village keeps its
  // huts: outside the play disc, so cloth nobody can collide with never has
  // to lie about being solid. One in the jarl's garnet; the rest in wool the
  // sheep grew.
  {
    const canvas = (materials.get("bannerRed") as THREE.MeshStandardMaterial).clone();
    canvas.color.setHex(0xa89877);
    canvas.side = THREE.DoubleSide;
    ctx.ownedMats.push(canvas);
    const garnet = (materials.get("bannerRed") as THREE.MeshStandardMaterial).clone();
    garnet.color.setHex(0x71232a);
    garnet.side = THREE.DoubleSide;
    ctx.ownedMats.push(garnet);
    const pole = materials.get("poleWood");
    const tentAt = (a: number, d: number, len: number, h: number, mat: THREE.Material) => {
      const t = new THREE.Group();
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const ridge = new THREE.Mesh(own(new THREE.CylinderGeometry(0.05, 0.05, len, 6)), pole);
      ridge.rotation.z = Math.PI / 2;
      ridge.position.y = h;
      t.add(ridge);
      for (const s of [-1, 1]) {
        const side = new THREE.Mesh(own(new THREE.PlaneGeometry(len, Math.hypot(h, h * 0.78) + 0.1)), mat);
        side.position.set(0, h / 2, s * h * 0.39);
        side.rotation.x = s > 0 ? -Math.atan2(h, h * 0.78) : Math.atan2(h, h * 0.78) - Math.PI;
        side.castShadow = true;
        side.receiveShadow = true;
        t.add(side);
      }
      for (const e of [-1, 1]) {
        const legA = new THREE.Mesh(own(new THREE.CylinderGeometry(0.045, 0.055, Math.hypot(h, h * 0.5), 6)), pole);
        legA.position.set(e * len / 2, h / 2, h * 0.24);
        legA.rotation.x = -0.45;
        t.add(legA);
        const legB = legA.clone();
        legB.position.z = -h * 0.24;
        legB.rotation.x = 0.45;
        t.add(legB);
      }
      t.position.set(x, heightAt(x, z), z);
      t.rotation.y = -a + Math.PI / 2 + (rng() - 0.5) * 0.3;
      root.add(t);
    };
    // Bearings chosen off the river arc, so the tents back onto the bank.
    tentAt(FIELD.riverAngle + Math.PI + 0.35, 20.2, 3.4, 1.9, garnet);
    tentAt(FIELD.riverAngle + Math.PI - 0.45, 20.6, 2.9, 1.6, canvas);
    tentAt(FIELD.riverAngle + Math.PI + 1.15, 20.0, 2.7, 1.5, canvas);
  }

  // ---- supplies: barrels and crates where the tents are ----
  {
    const a0 = FIELD.riverAngle + Math.PI;
    const barrels: THREE.Matrix4[] = [];
    const crates: THREE.Matrix4[] = [];
    for (let i = 0; i < 7; i++) {
      const a = a0 + (rng() - 0.5) * 1.8;
      const d = 18.6 + rng() * 2.2;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const y = footing(x, z, 0.3);
      if (rng() < 0.5) barrels.push(place(x, y + 0.32, z, rng() * Math.PI, 0.9 + rng() * 0.25));
      else crates.push(place(x, y + 0.22, z, rng() * Math.PI, 0.8 + rng() * 0.35));
    }
    field(own(new THREE.CylinderGeometry(0.34, 0.30, 0.72, 10)), materials.get("barrel"), barrels);
    field(own(new THREE.BoxGeometry(0.62, 0.5, 0.62)), materials.get("hutWall"), crates);
  }

  // ---- stakes along the crest: the bank was palisaded, and this is what is
  // left of that by spring ----
  {
    const stakes: THREE.Matrix4[] = [];
    const n = scatter(26);
    for (let i = 0; i < n; i++) {
      const a = FIELD.riverAngle + Math.PI + (rng() - 0.5) * 3.6;
      const d = 21.3 + (rng() - 0.5) * 0.7;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (FIELD.bank(x, z) < 0.4) continue;
      stakes.push(place(x, heightAt(x, z) + 0.55, z, rng() * Math.PI, 0.8 + rng() * 0.5));
    }
    field(own(new THREE.BoxGeometry(0.16, 1.5, 0.13)), materials.get("palisade"), stakes, null, true);
  }

  // ---- the stake line along the waterfront ----
  //
  // THE EDGE OF THE FIGHT ON THE OPEN ARC. The bank's toe now rises at the
  // play bound on the land side (see `campBank`), but the D opens onto the
  // river and there the clamp had nothing to be. A winter camp staked its
  // waterline — against ice, boats and men — so a line of driven stakes runs
  // the open arc just outside 18 m, leaning as driven stakes lean, with the
  // odd one missing. A body stopped there is stopped at the camp's own
  // perimeter. Decoration to the router, same law as the moor's dyke.
  {
    const stakes: THREE.Matrix4[] = [];
    const A0 = FIELD.riverAngle - 1.15, A1 = FIELD.riverAngle + 1.15;
    const n = Math.ceil(((A1 - A0) * 18.3) / 1.05);
    for (let i = 0; i < n; i++) {
      if (rng() < 0.12) continue;
      const a = A0 + ((i + 0.5) / n) * (A1 - A0) + (rng() - 0.5) * 0.02;
      const d = 18.3 + (rng() - 0.5) * 0.3;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      stakes.push(place(x, footing(x, z, 0.2) + 0.42, z, rng() * Math.PI, 0.85 + rng() * 0.35));
    }
    field(own(new THREE.BoxGeometry(0.14, 1.15, 0.11)), materials.get("palisade"), stakes, null, true);
  }

  // ---- reeds at the ice margin, driftwood on it, frost tufts on the dry ----
  {
    const reedGeo = (() => {
      const rods: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) {
        const rod = new THREE.CylinderGeometry(0.012, 0.02, 1.05 + (i % 3) * 0.22, 4);
        rod.rotateX((noise2(i * 3.1, 7.7) - 0.5) * 0.5);
        rod.rotateY(i * 2.4);
        rod.translate((noise2(i * 5.7, 1.1) - 0.5) * 0.22, 0.55, (noise2(i * 9.3, 4.9) - 0.5) * 0.22);
        rods.push(rod);
      }
      return mergeInto(rods);
    })();
    const reedMat = (materials.get("grassTuft") as THREE.MeshStandardMaterial).clone();
    reedMat.color.setHex(0x8a7a4a);
    ctx.ownedMats.push(reedMat);
    const frostMat = (materials.get("grassTuft") as THREE.MeshStandardMaterial).clone();
    frostMat.color.setHex(0x5d6653);
    ctx.ownedMats.push(frostMat);

    const reeds: THREE.Matrix4[] = [];
    const tufts: THREE.Matrix4[] = [];
    const wood: THREE.Matrix4[] = [];
    const n = scatter(520);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const d = 19 + rng() * rng() * 55;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      const w = FIELD.water(x, z);
      const y = footing(x, z, 0.4);
      if (w > 0.12 && w < 0.72 && rng() < 0.85) {
        // The margin: reed beds stand where the sheet is thin.
        reeds.push(place(x, y - 0.05, z, rng() * Math.PI * 2, 0.7 + rng() * 0.5));
      } else if (w <= 0.12 && rng() < 0.8) {
        tufts.push(place(x, y - 0.08, z, rng() * Math.PI * 2, 0.3 + rng() * 0.35));
      } else if (w >= 0.72 && rng() < 0.12) {
        wood.push(place(x, y + 0.04, z, rng() * Math.PI, 0.3 + rng() * 0.5));
      }
    }
    field(own(reedGeo), reedMat, reeds);
    field(own(buildBush(0x91b2)), frostMat, tufts);
    field(own(new THREE.BoxGeometry(1.3, 0.18, 0.22)), materials.get("bonfireLog"), wood);
  }
}

export const DANELAW_CAMP_GROUND = registerGround({
  spec: DANELAW_CAMP,
  terrain: CAMP_TERRAIN,
  build: buildCamp,
});
