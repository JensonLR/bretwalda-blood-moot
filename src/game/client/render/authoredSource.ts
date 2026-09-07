/**
 * FETCHING THE AUTHORED MAN — the one file here that touches the network.
 *
 * Split from `authored.ts` on purpose. Everything with a DECISION in it lives
 * there and imports nothing, so `tools/authoredtest.mjs` can execute it against
 * the real exports with no browser and no GPU. This file is the IO, and it is
 * deliberately thin: a cache, a fetch, a parse, and a null on anything at all
 * going wrong.
 *
 * WHY A CACHE AND NOT A LOAD PER MAN. Eight warriors in a moot are at most four
 * distinct classes, so eight men want four files. Loading per man would fetch
 * and parse the same 1.6 MB up to eight times and hold eight copies of it.
 *
 * AND WHY EVERY MAN STILL GETS HIS OWN CLONE. The cache hands back ONE parsed
 * scene, and `upgradeRigToAuthored` RE-PARENTS what it is given — so two men
 * swapping against the same object means the second one takes the first one's
 * body off him, and the first is drawn as a floating nameplate. `instance()`
 * below is the answer and it is not `Object3D.clone`: a skinned mesh cloned
 * that way keeps a reference to the ORIGINAL skeleton, so eight men would share
 * one set of bones and pose as one animal. `SkeletonUtils.clone` rebuilds the
 * skeleton and rebinds the meshes to it, which is exactly the difference.
 *
 * THE LAW, from `PLATFORM-PATH.md` §5b: an authored asset must never become the
 * only way a thing can be drawn. So every failure here resolves to `null` and
 * nothing throws — a 404, a CDN outage, a corrupt body, a browser with no
 * `fetch` — and a null means the procedural man stands, which is a fight that
 * still happens.
 */
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type * as THREE from "three";

export interface AuthoredAsset {
  scene: THREE.Object3D;
  clips: readonly { name: string }[];
}

/** Where `npm run authored` copies them. One place, so a CDN is one edit. */
export const AUTHORED_BASE = "/authored";

const cache = new Map<string, Promise<AuthoredAsset | null>>();

/**
 * The authored warrior for a class, or null.
 *
 * The promise is cached, INCLUDING a null one: a build with no assets deployed
 * must not re-request four files for every man who spawns, and a 404 that is
 * retried eight times a match is a 404 that shows up as a network graph rather
 * than as a missing feature.
 */
export function loadAuthoredWarrior(cls: string, base: string = AUTHORED_BASE): Promise<AuthoredAsset | null> {
  const key = `${base}/warrior-${cls}.glb`;
  const had = cache.get(key);
  if (had) return had;

  const p = (async (): Promise<AuthoredAsset | null> => {
    try {
      if (typeof fetch !== "function") return null;
      const res = await fetch(key);
      // The status is read before the body is. A proxy's HTML error page fed to
      // a glTF parser is a confusing exception on a path whose whole job is to
      // degrade quietly — the same defect this session fixed in `transport.ts`.
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      if (!buf || buf.byteLength < 20) return null;
      return await new Promise<AuthoredAsset | null>((ok) => {
        try {
          new GLTFLoader().parse(buf, "", (g) => ok({ scene: g.scene, clips: g.animations ?? [] }), () => ok(null));
        } catch { ok(null); }
      });
    } catch {
      return null;
    }
  })();
  cache.set(key, p);
  return p;
}

/**
 * A private copy of an authored man: fresh skeleton, meshes rebound to it.
 *
 * One parse, many bodies. The download and the parse are paid once per class;
 * this is paid once per man and is geometry-sharing, not geometry-copying —
 * `SkeletonUtils.clone` keeps the buffers and rebuilds the bones.
 */
export function instanceAuthored(asset: AuthoredAsset): AuthoredAsset {
  return { scene: cloneSkinned(asset.scene as never) as unknown as THREE.Object3D, clips: asset.clips };
}

/** For a harness that has to wait for the upgrade before it photographs it. */
export function authoredPending(): number {
  return cache.size;
}

/** Tests and tier changes; nothing in a fight calls this. */
export function clearAuthoredCache(): void { cache.clear(); }
