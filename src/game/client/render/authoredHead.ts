/**
 * THE HEAD NET — "wrong body beats no head".
 *
 * WHY THIS FILE EXISTS. The owner photographed the armoury's mannequin as "a
 * torso ending in a neck stump with hair strands floating over the collar", and
 * the arena's men as "inverted heads with the beard on top". Both were the same
 * defect (`applyPose` wrote absolute rotations onto a Head bone that rests at
 * 180 degrees; see `AuthoredRest` in `authored.ts`), and the census that was
 * supposed to catch it could not: it counted meshes whose BIND box reaches
 * y >= 1.6 and that are `visible`, and a skull that is visible, correctly
 * skinned and drawn 0.34 m down inside the chest passes that. Nothing consumed
 * the numbers either. The gate that now catches the frame error offline is
 * `tools/headflip.mjs`; this is the other half, the one that runs in the
 * player's browser, because a gate cannot follow a build to a device it never
 * saw and the next export, bone rename or refactor will find a way to lose the
 * head that no gate anticipated.
 *
 * WHAT IT DOES. Both call sites (`armouryStage.ts`, `GameCanvas.tsx`) swap the
 * authored mesh onto a procedural man and then arm this. It takes a census of
 * the head AT BIND (the swap has not posed him; bind is right by construction),
 * and takes it again on the FIRST POSED FRAME, before that frame is drawn. If
 * the second says the head is not where the first says it must be, the caller
 * throws the authored man away and keeps a procedural one. A man with the wrong
 * body is a defect a player can see and report; a man with no head is a defect
 * the player reports as "your game is broken".
 *
 * WHAT IT MEASURES, AND WHY THOSE. The head is a rigid set of vertices carried by
 * one bone, so nothing about the head ITSELF can be off; what can be off is
 * where the bone puts it. Two numbers say so and neither depends on what the man
 * is doing or where he stands (the arena's men are swapped mid-swing, mid-fall,
 * facing every way, and a check that needed an idle man could never run there):
 *
 *   reach   the farthest head vertex from the chest bone, in metres. A rigid
 *           head turning on its neck moves this by a few centimetres (measured
 *           0.000-0.027 over the 12 states the pose has a layer for, all four
 *           classes, procedural pose AND the clips the arena plays); a head
 *           turned 180 degrees about its own pivot moves it 0.096-0.34 (the
 *           defect, measured on the tree before the fix).
 *   turn    the head bone's orientation relative to the chest bone, against the
 *           same at bind, in degrees: 33.6 at the worst healthy sample (a dead man's
 *           head, clip-driven), 178-180 on the defect. No vertex involved, so it
 *           cannot be fooled by what hair or helm happens to be on him. It is the
 *           one that carries the verdict for a flip; `tools/headnet.mjs` holds both.
 *
 * and the structural facts the brief for this unit lists: something is drawn
 * above the shoulders, the bone's matrix has not collapsed, its scale has not
 * collapsed, a skull exists, and it owns vertices.
 *
 * THE CROWN IS REPORTED AND NOT GATED HERE, and that is a measured decision, not
 * an omission. "Crown within 3 cm of the procedural crown" is what `headflip`
 * gates, against the procedural man POSED IN THE SAME FRAME. In the browser the
 * only procedural crown to hand is `rig.headTop`, taken at rest with whatever
 * helm the armoury put on him, while the authored man still wears the export's
 * baked helm until the props land; the two differ by a helm. So the crown is in
 * the census for a harness to read, and the verdict does not depend on it.
 *
 * THREE IS A VALUE IMPORT and nothing else of the client is, for the reason
 * `authored.ts` gives: a gate can run this file under plain node.
 */
import * as THREE from "three";

/** What the net needs off a rig. `WarriorRig` satisfies it; a test's stand-in can too. */
export interface HeadNetRig {
  /** Parent of the authored scene once the swap has landed. */
  body: THREE.Object3D;
  /** The man's own frame: distances and heights are taken inside it, so where he stands does not matter. */
  group: THREE.Object3D;
  pivots: { head: THREE.Object3D; chest: THREE.Object3D };
}

export interface HeadCensus {
  /** Meshes above the shoulders (bind box reaches y >= 1.6) that are drawn. */
  visible: string[];
  /** ...and that are not. */
  hidden: string[];
  /** The Head bone's world position, in the man's own frame. */
  bone: number[] | null;
  /** The skull mesh's box [minY, maxY, minX, maxX] in the man's frame, after skinning; null when there is no skull. */
  skull: number[] | null;
  /** Its name — found by what it is (a fully head-weighted body mesh, the biggest), never by an export index. */
  skullName: string | null;
  scale: number[];
  det: number;
  boneName: string;
  isBone: boolean;
  /** Head-weighted vertices, after skinning, that are drawn. */
  verts: number;
  /** Highest of them, in the man's frame. Reported, not gated: see the file header. */
  crown: number | null;
  /** Farthest of them from the chest bone, metres. */
  reach: number | null;
  /** Head orientation relative to the chest, [x, y, z, w]. */
  rel: number[];
}

/** The verdict's bars. Exported so the gate that proves the net can pull each one (PROCESS R1). */
export const HEAD_NET = {
  /** A head bone whose matrix has this little volume is a collapsed one. */
  minDet: 1e-3,
  /**
   * The fewest vertices the skull may have. The export's is 4,174; the next
   * biggest all-head mesh (the brow and eye parts) is 358, so this is what tells
   * a skull from a fragment of one — a stage that hid the skull and found the
   * eyebrow would otherwise call the man headed.
   */
  minSkullVerts: 1500,
  /** ...and a scale component under this is a collapsed axis. */
  minScale: 0.5,
  /** Metres the head may sit from where its bind pose puts it, measured from the chest. */
  maxReach: 0.06,
  /** Degrees the head may be turned on the chest, from bind. */
  maxTurn: 75,
} as const;

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _s = new THREE.Vector3();

const r3 = (n: number): number => +n.toFixed(3);

/**
 * One census of the head, in the man's own frame. Cheap (a skull, hair, beard
 * and helm are about 10,000 vertices) and safe to call every frame in a harness,
 * but the game calls it twice per man in his life.
 */
export function censusHead(rig: HeadNetRig): HeadCensus {
  const { body, group } = rig;
  const head = rig.pivots.head, chest = rig.pivots.chest;
  group.updateWorldMatrix(true, false);
  body.updateMatrixWorld(true);
  const inv = _m.copy(group.matrixWorld).invert().clone();

  const visible: string[] = [];
  const hidden: string[] = [];
  const box = new THREE.Box3();
  const skinned: THREE.SkinnedMesh[] = [];
  body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh);
    m.geometry.computeBoundingBox();
    box.copy(m.geometry.boundingBox ?? new THREE.Box3());
    if (box.isEmpty() || box.max.y < 1.6) return;
    (m.visible ? visible : hidden).push(m.name || "(unnamed)");
  });

  // Chest and head, in the man's frame.
  const chestAt = new THREE.Vector3().setFromMatrixPosition(chest.matrixWorld).applyMatrix4(inv);
  const headAt = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld).applyMatrix4(inv);

  let verts = 0, crown = -Infinity, reach = 0;
  let skull: THREE.SkinnedMesh | null = null, skullVerts = 0;
  const skullBox = new THREE.Box3();
  const box2 = new THREE.Box3();
  for (const m of skinned) {
    if (!m.visible) continue;
    const hi = m.skeleton.bones.indexOf(head as THREE.Bone);
    if (hi < 0) continue;
    const ji = m.geometry.getAttribute("skinIndex");
    const wi = m.geometry.getAttribute("skinWeight");
    const pos = m.geometry.getAttribute("position");
    if (!ji || !wi || !pos) continue;
    // A body mesh is one bone's or the other's; a cheap sample says which, so a
    // torso is not walked vertex by vertex for a head it does not have.
    let s = 0, n = 0;
    for (let i = 0; i < pos.count; i += 7) {
      n++;
      for (let k = 0; k < 4; k++) if (ji.getComponent(i, k) === hi) s += wi.getComponent(i, k);
    }
    if (!n || s / n < 0.25) continue;
    m.skeleton.update();
    m.updateWorldMatrix(true, false);
    box2.makeEmpty();
    let owned = 0;
    for (let i = 0; i < pos.count; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (ji.getComponent(i, k) === hi) w += wi.getComponent(i, k);
      if (w < 0.5) continue;
      m.getVertexPosition(i, _v);
      _v.applyMatrix4(m.matrixWorld).applyMatrix4(inv);
      verts++; owned++;
      if (_v.y > crown) crown = _v.y;
      const d = _v.distanceTo(chestAt);
      if (d > reach) reach = d;
      box2.expandByPoint(_v);
    }
    // THE SKULL IS THE BODY MESH THAT IS ALL HEAD, and the biggest. Not named:
    // the export calls it `part_34` today and `part_<index>` is whatever the
    // exporter counted to, which is the sort of name a re-export moves.
    if (owned > 0.9 * pos.count && owned >= HEAD_NET.minSkullVerts && owned > skullVerts
        && !/^(helm|hair|beard|cloak)/i.test(m.name || "")) {
      skull = m; skullVerts = owned; skullBox.copy(box2);
    }
  }

  head.matrixWorld.decompose(_p, _q, _s);
  const sc = new THREE.Vector3();
  head.getWorldScale(sc);
  // MAGNITUDES. A mirrored man is -1 on an axis and is not a collapsed one: `handedness` (anim.ts)
  // reflects the whole rig for a left-handed player, `getWorldScale` reads the reflection as a
  // negative x scale, and a test of "scale >= 0.5" on the signed value refuses every left-handed
  // man in the game. The first cut of this file did; the stagehead run on the tree before the fix
  // read det -1 and scale [-1,1,1] off a mirrored man and said so.
  sc.set(Math.abs(sc.x), Math.abs(sc.y), Math.abs(sc.z));
  const cq = new THREE.Quaternion();
  chest.matrixWorld.decompose(_p, cq, _s);
  const rel = _qc.copy(cq).invert().multiply(_q.clone());

  return {
    visible, hidden,
    bone: [r3(headAt.x), r3(headAt.y), r3(headAt.z)],
    skull: skull ? [skullBox.min.y, skullBox.max.y, skullBox.min.x, skullBox.max.x].map(r3) : null,
    skullName: skull ? ((skull as THREE.Mesh).name || "(unnamed)") : null,
    scale: sc.toArray().map((v) => +v.toFixed(4)),
    det: +head.matrixWorld.determinant().toFixed(6),
    boneName: head.name || "(unnamed)",
    isBone: !!(head as unknown as { isBone?: boolean }).isBone,
    verts,
    crown: verts ? r3(crown) : null,
    reach: verts ? r3(reach) : null,
    rel: [rel.x, rel.y, rel.z, rel.w].map((v) => +v.toFixed(5)),
  };
}

/** The angle between two orientations, degrees. */
export function turnBetween(a: readonly number[], b: readonly number[]): number {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI;
}

export interface HeadVerdict {
  ok: boolean;
  /** One plain sentence per thing wrong. Empty when ok. */
  problems: string[];
  /** The same numbers a harness can read: how far the head is from bind. */
  reachDrift: number | null;
  turnDeg: number | null;
  now: HeadCensus;
  bind: HeadCensus;
}

/**
 * Judge a posed census against the bind one. Pure: every bar comes from
 * `HEAD_NET`, so a gate can move one and watch the verdict change.
 */
export function judgeHead(now: HeadCensus, bind: HeadCensus, bars: typeof HEAD_NET = HEAD_NET): HeadVerdict {
  const problems: string[] = [];
  if (now.visible.length === 0) problems.push("nothing is drawn above the shoulders");
  if (!(Math.abs(now.det) >= bars.minDet)) problems.push(`the head bone's matrix has collapsed (det ${now.det})`);
  if (now.scale.some((c) => !(c >= bars.minScale))) problems.push(`the head bone's scale has collapsed (${now.scale.join(", ")})`);
  if (now.skull === null) problems.push("there is no skull mesh");
  if (now.verts === 0) problems.push("the head bone owns no drawn vertex");
  let reachDrift: number | null = null;
  let turnDeg: number | null = null;
  if (bind.reach !== null && now.reach !== null) {
    reachDrift = Math.abs(now.reach - bind.reach);
    if (reachDrift > bars.maxReach) {
      problems.push(`the head is ${reachDrift.toFixed(3)} m from where its bind pose puts it, measured from the chest (bar ${bars.maxReach})`);
    }
  }
  turnDeg = turnBetween(now.rel, bind.rel);
  if (turnDeg > bars.maxTurn) problems.push(`the head is turned ${turnDeg.toFixed(0)} degrees on the chest (bar ${bars.maxTurn})`);
  return { ok: problems.length === 0, problems, reachDrift, turnDeg, now, bind };
}

export interface HeadNet {
  /** The census taken at bind, when the net was armed. */
  readonly bind: HeadCensus;
  /** Census the man as he stands and judge it. No memory, no waiting: what a harness wants. */
  check(): HeadVerdict;
  /**
   * What a call site wants: judge him on a frame, and say what to do.
   *
   *   waiting   nobody has posed him yet (his head is still exactly where bind put
   *             it, so there is nothing to judge); ask again next frame. After
   *             `PATIENCE` such frames he is let through: a man who is never
   *             posed is a man whose head never moved.
   *   pass      keep him.
   *   refused   throw him out and keep a procedural man.
   */
  step(): { outcome: "waiting" | "pass" | "refused"; verdict: HeadVerdict };
}

/** Frames a man may go unposed before the net stops asking. */
export const HEAD_NET_PATIENCE = 12;

/**
 * Arm the net on a man the swap has just landed on. Take the bind census NOW,
 * before anything poses the authored skeleton, and hand back the check to run on
 * the first posed frame.
 */
export function armHeadNet(rig: HeadNetRig): HeadNet {
  const bind = censusHead(rig);
  let waited = 0;
  const check = (): HeadVerdict => judgeHead(censusHead(rig), bind);
  return {
    bind,
    check,
    step() {
      const verdict = check();
      if (!verdict.ok) return { outcome: "refused", verdict };
      const posed = (verdict.turnDeg ?? 0) > 0.01 || (verdict.reachDrift ?? 0) > 0.0005;
      if (!posed && waited++ < HEAD_NET_PATIENCE) return { outcome: "waiting", verdict };
      return { outcome: "pass", verdict };
    },
  };
}
