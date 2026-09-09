// SEVERING AN AUTHORED MAN — by bone influence, because there is no limb to take.
//
// WHY THIS IS A SECOND IMPLEMENTATION AND NOT A FIX TO THE FIRST.
//
// `characters.ts` cuts a procedural body by walking the scene graph:
// `collectRig` gathers the meshes parented under a limb's pivot, `harvest`
// splits a geometry against the cut plane, and the seam anchors are captured by
// object reference when the man is built. Every one of those assumptions is
// false for an authored body:
//
//   * there is no arm mesh. A shipped warrior is 46 SkinnedMeshes over one
//     25-bone skeleton, and the arm is not a mesh — it is the set of VERTICES
//     weighted to the arm's bones, inside body-wide geometry.
//   * the meshes are named `<role>_<n>`, not with the `rig:` prefix
//     `collectRig` filters on, so every one of them lands in `carried[]` and is
//     treated as a dropped prop.
//   * `upgradeRigToAuthored` clears `rig.body.children`, so the seam anchors
//     captured at build time are orphans in a dead subtree and
//     `updateMatrixWorld` never reaches them.
//
// So `sever` returns null for every zone, `beginGore` takes its "a body that
// refused the cut falls exactly as it always did" path, and a severing kill
// plays as an intact collapse. Making it loud was the previous commit; this is
// making it work.
//
// THE ALGORITHM. Selection is by bone, the cut is by index buffer, and the
// piece is baked.
//
//   1. The limb is a SET OF BONE INDICES — the seam's bone and everything under
//      it in the skeleton. `RightElbow` takes the forearm, the wrist and the
//      hand; `RightUpperArm` takes the whole arm.
//   2. For every SkinnedMesh, each triangle is assigned to the bone its
//      vertices are most weighted to. Triangles whose home bone is in the limb
//      set are the cut; the rest stay.
//   3. The body's index buffer is rebuilt WITHOUT them — no vertex is moved and
//      no geometry is rebuilt, so this costs one Uint32Array per affected mesh
//      and nothing per frame.
//   4. The piece is BAKED: its vertices are pushed through
//      `applyBoneTransform` once, at the instant of the cut, so it leaves as a
//      static mesh frozen in the pose it was severed in. That is the same trick
//      `characters.ts:project` uses, and the reason a detached forearm keeps
//      the fist closed on its sword.
//
// It is reversible. `restore()` puts every index buffer back, because a round
// ends and the same body stands up again — the procedural path solves this by
// hiding rather than destroying, and so does this.
import * as THREE from "three";
import { ZONE_SEAM } from "../characters";
import type { SeamId, HitZone, Severance } from "../characters";

/**
 * The bone each seam cuts at, by name in the exported skeleton.
 *
 * A seam takes the bone it names AND everything below it, so `shoulderR` and
 * `elbowR` differ only in where the walk starts. `waist` is the exception and
 * is handled by its own branch: it takes the whole upper body, which is the
 * complement of the legs rather than a subtree.
 */
const SEAM_BONE: Record<SeamId, string | null> = {
  neck: "Head",
  shoulderR: "RightUpperArm", elbowR: "RightElbow",
  shoulderL: "LeftUpperArm", elbowL: "LeftElbow",
  hipR: "RightThigh", kneeR: "RightKnee",
  hipL: "LeftThigh", kneeL: "LeftKnee",
  waist: null,
};

/** The legs, which a waist cut is the complement of. */
const LEG_ROOTS = ["RightHip", "RightThigh", "RightKnee", "LeftHip", "LeftThigh", "LeftKnee"];

/** Every bone index at or under `root`, by name, in this skeleton's numbering. */
function subtreeIndices(skeleton: THREE.Skeleton, rootName: string): Set<number> {
  const out = new Set<number>();
  const root = skeleton.bones.find((b) => b.name === rootName);
  if (!root) return out;
  const want = new Set<THREE.Object3D>();
  root.traverse((o) => want.add(o));
  skeleton.bones.forEach((b, i) => { if (want.has(b)) out.add(i); });
  return out;
}

/** The complement of the legs — a waist cut takes everything that is not one. */
function upperIndices(skeleton: THREE.Skeleton): Set<number> {
  const legs = new Set<number>();
  for (const n of LEG_ROOTS) for (const i of subtreeIndices(skeleton, n)) legs.add(i);
  const out = new Set<number>();
  skeleton.bones.forEach((_, i) => { if (!legs.has(i)) out.add(i); });
  return out;
}

/**
 * The bone a vertex belongs to: the one carrying the most weight.
 *
 * Not a threshold and not a blend. A triangle has to go somewhere whole — half
 * a triangle is a hole — so the question is only which side it belongs on, and
 * the heaviest influence is the honest answer to that.
 */
function homeBone(skinIndex: THREE.BufferAttribute, skinWeight: THREE.BufferAttribute, v: number): number {
  let best = -1, bestW = -1;
  for (let k = 0; k < 4; k++) {
    const w = skinWeight.getComponent(v, k);
    if (w > bestW) { bestW = w; best = skinIndex.getComponent(v, k); }
  }
  return best;
}

/**
 * Rough mass of what comes away, kg — the integrator that throws the piece
 * wants a number and the geometry cannot supply one. Taken off the procedural
 * seams' own figures so an authored arm falls like a procedural arm.
 */
const SEAM_MASS: Record<SeamId, number> = {
  neck: 5.0, waist: 34.0,
  shoulderR: 4.2, shoulderL: 4.2, elbowR: 1.6, elbowL: 1.6,
  hipR: 11.0, hipL: 11.0, kneeR: 4.4, kneeL: 4.4,
};

/** A full `Severance`, plus the undo the procedural path gets from hiding. */
export type AuthoredSeverance = Severance & {
  /** How many triangles left the body. */
  tris: number;
  /** Put every index buffer back. Called on respawn. */
  restore(): void;
};

/**
 * Cut an authored body at `seam`, or return null if there is nothing to cut.
 *
 * Null is not an error — a body with no vertices weighted to that limb (a man
 * with no head mesh, a seam this export does not reach) is a body that keeps
 * its shape, exactly as the procedural path decides the same thing.
 */
export function severAuthored(root: THREE.Object3D, seam: SeamId, zone: HitZone = "torso"): AuthoredSeverance | null {
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });
  if (!skinned.length) return null;
  const skeleton = skinned[0].skeleton;
  if (!skeleton?.bones?.length) return null;

  const boneName = SEAM_BONE[seam];
  const limb = boneName === null ? upperIndices(skeleton) : subtreeIndices(skeleton, boneName);
  if (!limb.size) return null;

  const undo: Array<() => void> = [];
  const parts: THREE.Mesh[] = [];
  let cutTris = 0;

  for (const mesh of skinned) {
    const geo = mesh.geometry;
    const idx = geo.index;
    const si = geo.attributes.skinIndex as THREE.BufferAttribute | undefined;
    const sw = geo.attributes.skinWeight as THREE.BufferAttribute | undefined;
    if (!idx || !si || !sw) continue;

    const arr = idx.array as ArrayLike<number>;
    const keep: number[] = [], cut: number[] = [];
    for (let t = 0; t < arr.length; t += 3) {
      const a = arr[t], b = arr[t + 1], c = arr[t + 2];
      // A triangle goes with the limb when a MAJORITY of its corners do. Two of
      // three rather than any of three: a one-corner test would take a ragged
      // fringe of torso with every arm, and an all-three test would leave the
      // seam's own ring of triangles behind as a collar.
      let n = 0;
      if (limb.has(homeBone(si, sw, a))) n++;
      if (limb.has(homeBone(si, sw, b))) n++;
      if (limb.has(homeBone(si, sw, c))) n++;
      if (n >= 2) { cut.push(a, b, c); } else { keep.push(a, b, c); }
    }
    if (!cut.length) continue;
    cutTris += cut.length / 3;

    // ---- the piece, baked out of the pose it was cut in --------------------
    //
    // A compact vertex buffer over just the cut triangles, each position pushed
    // through the skeleton once. After this the piece owes the skeleton
    // nothing, which is what lets it be thrown.
    const remap = new Map<number, number>();
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [], tri: number[] = [];
    const P = new THREE.Vector3();
    const srcPos = geo.attributes.position as THREE.BufferAttribute;
    const srcNrm = geo.attributes.normal as THREE.BufferAttribute | undefined;
    const srcUv = geo.attributes.uv as THREE.BufferAttribute | undefined;
    for (const v of cut) {
      let m = remap.get(v);
      if (m === undefined) {
        m = remap.size;
        remap.set(v, m);
        P.fromBufferAttribute(srcPos, v);
        mesh.applyBoneTransform(v, P);
        pos.push(P.x, P.y, P.z);
        if (srcNrm) nrm.push(srcNrm.getX(v), srcNrm.getY(v), srcNrm.getZ(v));
        if (srcUv) uv.push(srcUv.getX(v), srcUv.getY(v));
      }
      tri.push(m);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    if (nrm.length) pg.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    if (uv.length) pg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    pg.setIndex(tri);
    if (!nrm.length) pg.computeVertexNormals();
    const pm = new THREE.Mesh(pg, mesh.material);
    pm.name = `severed:${seam}:${mesh.name}`;
    // The bake is in the mesh's own space; the mesh's world matrix puts it back
    // where the eye last saw it.
    mesh.updateWorldMatrix(true, false);
    pm.applyMatrix4(mesh.matrixWorld);
    parts.push(pm);

    // ---- and the body without it ------------------------------------------
    const before = idx;
    const after = new THREE.BufferAttribute(
      before.array instanceof Uint16Array && keep.length < 65536
        ? new Uint16Array(keep) : new Uint32Array(keep), 1);
    geo.setIndex(after);
    undo.push(() => { geo.setIndex(before); after.array = new Uint32Array(0); });
  }

  if (!parts.length) return null;

  const group = new THREE.Group();
  group.name = `severed:${seam}`;
  for (const p of parts) group.add(p);

  // ---- everything downstream needs, derived off the bone rather than guessed -
  //
  // `beginGore` reads a full `Severance`: where the wound is, which way it
  // sprays, how heavy the piece is and what point it tumbles about. The
  // procedural builder knows all four because it built the body. Here they come
  // off the seam's own bone, which is the one thing both bodies agree on.
  const bone = boneName ? skeleton.bones.find((b) => b.name === boneName) : skeleton.bones.find((b) => b.name === "Spine");
  const wound = new THREE.Vector3();
  const spray = new THREE.Vector3(0, 1, 0);
  if (bone) {
    bone.updateWorldMatrix(true, false);
    bone.getWorldPosition(wound);
    // A stump faces the way the limb left. A bone's local +Y runs down its own
    // length in this rig, so the world +Y of the cut bone IS the spray axis —
    // and it follows the corpse as it falls, because it is read off the bone.
    spray.set(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion())).normalize();
  }
  // The piece's own balance point, in its own frame. Not the origin: a head
  // hung off its neck tumbles because it is spun about a point it does not
  // balance on, and the box centre is the cheapest honest version of that.
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3(); box.getSize(size);
  const com = box.getCenter(new THREE.Vector3());
  group.worldToLocal(com);

  // A node parented INTO the body at the cut, so the spray that keeps running
  // after the corpse falls is read off something that fell with it.
  const stump = new THREE.Object3D();
  stump.name = `stump:${seam}`;
  if (bone) bone.add(stump); else root.add(stump);

  return {
    zone,
    seam,
    part: group,
    com,
    mass: SEAM_MASS[seam] ?? 4,
    wound,
    spray,
    stump,
    // Half the narrowest horizontal dimension: how wide the spray should be.
    radius: Math.max(0.04, Math.min(size.x, size.z) * 0.5),
    // Nothing is re-parented by this cut. The procedural path moves a weapon
    // onto the piece because the weapon hangs off a limb PIVOT it is taking;
    // here the geometry is baked out of shared meshes and the mounts are
    // untouched, so a severed forearm does not yet carry its sword. Named
    // rather than pretended: `carried` is empty and `beginGore`'s loop over it
    // is a no-op.
    carried: [] as THREE.Object3D[],
    tris: cutTris,
    // `Severance.release` is the procedural path's undo — it un-hides what the
    // cut hid. Ours is the same act by a different mechanism (index buffers
    // rather than visibility), so it is the same function under both names and
    // `reassemble` reaches it without knowing which body it is holding.
    release() { this.restore(); },
    restore() {
      for (const f of undo) f();
      undo.length = 0;
      for (const p of parts) { p.geometry.dispose(); p.removeFromParent(); }
      parts.length = 0;
      stump.removeFromParent();
    },
  } as AuthoredSeverance;
}

/**
 * Cut by ZONE, the way `beginGore` asks.
 *
 * The zone-to-seam routing is `characters.ts`'s own `ZONE_SEAM`, imported
 * rather than restated — a second copy would be a second answer to "where does
 * a blow to the arm cut", and the two would drift the first time a zone moved.
 * `deep` picks the joint or the mid-limb the same way the procedural default
 * does: an arm defaults to the elbow, because a forearm leaving with the fist
 * still closed is the shot the whole feature exists for.
 */
export function severAuthoredZone(root: THREE.Object3D, zone: HitZone | null | undefined): AuthoredSeverance | null {
  if (!zone) return null;
  const route = ZONE_SEAM[zone];
  if (!route) return null;                    // torso: nothing comes off
  return severAuthored(root, route[route.deep], zone);
}
