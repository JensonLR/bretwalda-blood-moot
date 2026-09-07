/**
 * HANGING WHAT THE ARMOURY SOLD ON THE MAN BLENDER BAKED.
 *
 * `authored.ts` decides WHICH props a man wants and what they are called —
 * `PROP_ROLES`, `propsWantedFor` — and imports nothing, so a gate can run it.
 * This file is the rest: the fetch, the cache, the socket under the head bone,
 * and the mount. It is the same split, for the same reason, as
 * `authoredSource.ts`.
 *
 * THE LAW, from `PLATFORM-PATH.md` §5b and honoured here exactly as the warrior
 * loader honours it: an authored asset must never become the only way a thing
 * can be drawn. Every failure resolves to nothing mounted, nothing thrown, and
 * a man who is bareheaded rather than a fight that did not happen.
 *
 * ---------------------------------------------------------------------------
 * THE SOCKET, WHICH IS THE ONLY INTERESTING PART
 * ---------------------------------------------------------------------------
 *
 * The props are static meshes with no bones, and they are authored in the
 * head's own frame — WORLD AXES, ORIGIN AT THE HEAD BONE. Measured on all four
 * exports: `helm-berserker-iron.glb` spans y 0.233..0.359 and the berserker's
 * baked helm spans y 2.001..2.127 in the warrior file, a difference of exactly
 * 1.768, which is exactly his Head bone's bind height. Same for x and z to
 * three decimals, and `runekeeper/hood` lands byte for byte on its own baked
 * box the same way.
 *
 * That is NOT the Head bone's local frame. The bone is rotated at bind — read
 * through its inverse a prop comes out upside down — so parenting a prop to it
 * with an identity transform draws a man wearing his helm on his chin. The
 * socket is one node under the bone carrying `bind⁻¹ · T(bindPos)`, which
 * cancels the bind ROTATION and keeps the bind PLACE, and everything under it
 * is then carried by the head for the rest of the fight.
 *
 * IT IS READ OFF THE SKELETON'S BIND MATRICES, NOT OFF `matrixWorld`. The swap
 * happens after the rig is built and the animator may already have posed the
 * head; a socket solved from a live pose bakes that pose in and the helm slides
 * off the first time he looks down. `skeleton.boneInverses` is the bind pose by
 * definition and cannot be posed.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  PROP_ROLES, propsWantedFor, dressFromSurfaceNames,
  type PropRole, type AuthoredMaterialAsk,
} from "./authored";
import { AUTHORED_BASE } from "./authoredSource";

/**
 * The first skinned mesh under a body — any of them carries the skeleton, and
 * the skeleton is what a socket has to be solved against. Here rather than in
 * each caller, because two copies of a lookup are two answers to it.
 */
export function firstSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.SkinnedMesh).isSkinnedMesh) found = o as THREE.SkinnedMesh;
  });
  return found;
}

/** Marks the node this module owns, so a second dressing replaces rather than stacks. */
const SOCKET_TAG = "authoredHeadSocket";

const cache = new Map<string, Promise<THREE.Object3D | null>>();

/**
 * One prop, parsed, or null. The promise is cached INCLUDING a null one — see
 * `loadAuthoredWarrior` for why a retried 404 is worse than a missing feature.
 *
 * The cached object is never handed out: `dressAuthoredHead` clones it, because
 * mounting re-parents and two men in the same helm would take it off each other.
 */
export function loadAuthoredProp(file: string, base: string = AUTHORED_BASE): Promise<THREE.Object3D | null> {
  const key = `${base}/${file}`;
  const had = cache.get(key);
  if (had) return had;
  const p = (async (): Promise<THREE.Object3D | null> => {
    try {
      if (typeof fetch !== "function") return null;
      const res = await fetch(key);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return await new Promise<THREE.Object3D | null>((ok) => {
        new GLTFLoader().parse(buf, "", (g) => ok(g.scene), () => ok(null));
      });
    } catch { return null; }
  })();
  cache.set(key, p);
  return p;
}

/**
 * The socket under `head`, created on first use. Null when the bone is not in
 * the skeleton it was handed — which is a caller error, and a silent null is
 * the right answer to it in a fight.
 */
export function headSocketOf(head: THREE.Object3D, skeleton: THREE.Skeleton): THREE.Object3D | null {
  for (const child of head.children) {
    if (child.userData?.[SOCKET_TAG]) return child;
  }
  const i = skeleton.bones.indexOf(head as THREE.Bone);
  if (i < 0 || !skeleton.boneInverses[i]) return null;
  const bind = new THREE.Matrix4().copy(skeleton.boneInverses[i]).invert();
  const at = new THREE.Vector3().setFromMatrixPosition(bind);
  const socket = new THREE.Object3D();
  socket.name = SOCKET_TAG;
  socket.userData[SOCKET_TAG] = true;
  socket.matrixAutoUpdate = false;
  socket.matrix.copy(bind).invert().multiply(new THREE.Matrix4().makeTranslation(at.x, at.y, at.z));
  head.add(socket);
  return socket;
}

export interface DressHeadOptions {
  cls: string;
  appearance: Record<string, unknown> | null | undefined;
  /** The AUTHORED head bone — `rig.pivots.head` after a successful swap. */
  head: THREE.Object3D;
  /** Any skinned mesh's skeleton from the same authored man. */
  skeleton: THREE.Skeleton;
  resolveMaterial: (ask: AuthoredMaterialAsk) => THREE.Material | null;
  /**
   * Drop the strand shells. A head of long hair is 23,500 triangles and up to
   * 3.5 MB, and almost all of both is `hair__strands` sitting over a solid
   * `hairUnder` cap that reads perfectly well on its own. This is the tier's
   * lever and it costs nothing to pull.
   */
  strands?: boolean;
  /**
   * Which roles to attempt at all. THE BYTE LEVER, where `strands` is only the
   * triangle one: dropping the strand shells after a parse saves 23,500 of a
   * head of hair's 28,552 triangles and not one byte of its 3.5 MB. A tier that
   * cannot afford the download leaves `hair` out of this list, and because a
   * baked piece only comes off once its replacement is on the man, he keeps the
   * hair Blender gave him instead of going bald. Defaults to all three.
   */
  roles?: readonly PropRole[];
  base?: string;
}

/** What a dressing did, for the harness and for the log. */
export interface DressHeadResult {
  mounted: PropRole[];
  missing: PropRole[];
  wanted: number;
}

/**
 * Hang this man's helm, hair and beard on his authored head.
 *
 * Idempotent: everything already under the socket comes off first, so a man who
 * changes his kit in the armoury is re-dressed rather than layered. Roles he
 * does not wear are simply absent — a bare head is a legal appearance and it is
 * NOT a failure, so it is never counted as one.
 */
export async function dressAuthoredHead(o: DressHeadOptions): Promise<DressHeadResult> {
  const socket = headSocketOf(o.head, o.skeleton);
  const allowed = o.roles ?? PROP_ROLES;
  const wanted = propsWantedFor(o.cls, o.appearance).filter((w) => allowed.includes(w.role));
  if (!socket) return { mounted: [], missing: wanted.map((w) => w.role), wanted: wanted.length };

  const loaded = await Promise.all(wanted.map((w) => loadAuthoredProp(w.file, o.base)));

  // The strip happens AFTER the fetches and not before: a man mid-load whose
  // head has been emptied is a bald man for as long as the network takes, and
  // on a slow phone that is the whole first round.
  for (const old of [...socket.children]) socket.remove(old);

  const mounted: PropRole[] = [], missing: PropRole[] = [];
  for (let i = 0; i < wanted.length; i++) {
    const src = loaded[i];
    if (!src) { missing.push(wanted[i].role); continue; }
    const node = src.clone(true);
    if (o.strands === false) {
      for (const mesh of node.children.filter((c) => /__strands$/.test(c.name))) node.remove(mesh);
      node.traverse((c) => {
        for (const gone of c.children.filter((g) => /__strands$/.test(g.name))) c.remove(gone);
      });
    }
    dressFromSurfaceNames(node, o.resolveMaterial);
    node.userData[SOCKET_TAG] = wanted[i].role;
    socket.add(node);
    mounted.push(wanted[i].role);
  }
  return { mounted, missing, wanted: wanted.length };
}

/** Every role this module knows how to hang. Re-exported so callers need one import. */
export { PROP_ROLES };
