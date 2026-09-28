// ============================================================
// AUTHOREDRIG — build the SAME man twice and pose him with the real pose stack.
//
//   A  the procedural man, exactly as `createWarriorRig` builds him
//   B  the same man after `upgradeRigToAuthored` swapped the shipped GLB in
//
// then pose both with the REAL `poseWarrior` for N frames and hand back numbers
// a gate can hold: where every joint is, where the head is, which hand the
// weapon is in. No browser, no GL, a few seconds.
//
// WHY THIS FILE EXISTS (docs/PROCESS.md failure mode 1, the ruler that measured
// the wrong quantity). Every gate the authored man had asked about GEOMETRY:
// meshes present, materials named, bones found, `head.det` not collapsed. The
// census counted meshes whose BIND bounding box reached y >= 1.6 and were
// `visible` — which cannot see a skull that is visible, correctly skinned, and
// drawn 0.34 m down inside the chest because `applyPose` wrote an absolute
// rotation onto a bone whose rest rotation is 180 degrees about Z. The owner
// saw a torso ending in a neck stump in the armoury, and a man with his head
// on upside down in the arena. Nothing in the repository could.
//
// So this compares the two men PIECE BY PIECE after they have both been posed
// by the same code, which is the only comparison that can see a bone driven in
// the wrong frame. It is shared by `tools/headflip.mjs` (the crown, the face,
// the hair on the collar) and `tools/parity.mjs` (every pivot, the mounts and
// the handedness), so the two gates cannot come to hold two ideas of how the
// man is built — the mirrored-definition failure (PROCESS Part 1 §3).
//
// THE SUBJECT IS THE SHIPPED FILE. `public/authored/warrior-<cls>.glb` is what
// a default-build player is served (`next.config.ts` stamps
// NEXT_PUBLIC_AUTHORED=1 because it is committed), so it is what is measured;
// nothing here reads `art/blender`, which is gitignored and absent on a clean
// checkout.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { emitClient } from "./clientmodule.mjs";

export const CLASSES = ["huscarl", "warden", "runekeeper", "berserker"];
/** The loadout each shipped warrior GLB was exported in (`exportrig.mjs`). */
export const ARMS = { huscarl: "sword_board", warden: "gar", runekeeper: "twin_seax", berserker: "hand_axes" };
export const SLOTS = ["chest", "head", "rightArm", "leftArm", "rightLeg", "leftLeg",
  "elbowR", "elbowL", "wristR", "wristL", "kneeR", "kneeL"];

/** The three the owner sees: the mannequin idles, the arena swings, and the floored man is the one that used to lose his head. */
export const STATES = ["idle", "attacking", "knocked"];
/** Every state the pose has a layer for, for the wide sweep (`--wide`). */
export const WIDE_STATES = ["idle", "walking", "running", "blocking", "attacking", "staggered", "dodging", "shoving", "ability", "knocked", "rising"];

/**
 * Stand the client up in node: emit the real TypeScript, stub the four browser
 * globals it touches at import, and hand back its modules.
 */
export async function loadKit(root, work) {
  globalThis.window ??= {
    location: { search: "" }, innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {},
    localStorage: { getItem: () => null, setItem() {} },
  };
  globalThis.navigator ??= { userAgent: "node", maxTouchPoints: 0, hardwareConcurrency: 8 };
  globalThis.document ??= { createElement: () => ({ getContext: () => null, width: 1, height: 1 }) };
  const { byName } = await emitClient(root, [
    "src/game/client/render/anim.ts",
    "src/game/client/render/authored.ts",
    "src/game/client/render/authoredProps.ts",
    "src/game/client/render/clipDriver.ts",
    "src/game/client/render/textures.ts",
    "src/game/client/render/materials.ts",
  ], work);
  const [anim, authored, props, clipDriver, textures, materials, characters, input] = await Promise.all([
    byName("anim.js"), byName("authored.js"), byName("authoredProps.js"), byName("clipDriver.js"),
    byName("textures.js"), byName("materials.js"), byName("characters.js"), byName("input.js"),
  ]);
  for (const [n, m] of Object.entries({ anim, authored, props, clipDriver, textures, materials, characters })) {
    if (!m) throw new Error(`tsc emitted no ${n}.js`);
  }
  const settings = { anisotropy: 8, textureSize: 512, spriteSize: 128, tier: "high", dynamicLights: true,
    instancing: false, propDensity: 1, shadows: true, shadowMapSize: 2048 };
  const tex = textures.createTextureLibrary({ capabilities: { getMaxAnisotropy: () => 8 } }, settings);
  const mats = materials.createMaterialLibrary(tex, settings);
  return { root, anim, authored, props, clipDriver, characters, input, settings, materials: mats };
}

export function parseGlb(root, cls) {
  const file = resolve(root, `public/authored/warrior-${cls}.glb`);
  if (!existsSync(file)) throw new Error(`the shipped GLB is missing: ${file}`);
  const b = readFileSync(file);
  return new Promise((ok, no) => new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "", ok, no));
}

/** A `GamePlayer` with the fields the pose reads. */
export function mkPlayer(kit, cls, id) {
  return {
    id, name: "", warriorClass: cls, team: "none", ready: true, position: { x: 0, y: 0, z: 0 }, rotation: 0,
    velocity: { x: 0, y: 0, z: 0 }, health: 100, maxHealth: 100, stamina: 100, maxStamina: 100, state: "idle",
    attackDir: "right", blockDir: "right", attackTimer: 0, blockTimer: 0, dodgeTimer: 0, staggerTimer: 0,
    abilityCooldown: 0, abilityActive: false, abilityTimer: 0, kills: 0, deaths: 0, damage: 0, score: 0,
    lastHitBy: "", comboCount: 0, comboTimer: 0, invincible: false, invincibleTimer: 0,
    appearance: kit.characters.defaultAppearance(cls), arms: ARMS[cls],
  };
}

const camera = new THREE.PerspectiveCamera();
const ctxOf = (kit) => ({ dt: 0, rawDt: 0, time: 0, camera, focus: new THREE.Vector3(0, 1, 0), localId: "", localState: null, mood: "dusk", quality: kit.settings });

/**
 * One man. `authored` runs the REAL swap (`upgradeRigToAuthored`) on a clone of
 * the shipped scene, with the arguments the two call sites pass — the literal is
 * copied from `GameCanvas.tsx` and `armouryStage.ts`, which pass the same shape.
 */
export function buildMan(kit, cls, gltf, authored) {
  const parent = new THREE.Group();
  // ONE ID FOR BOTH MEN. `createMotion` seeds the idle sway, the stride phase and
  // the cloak from a hash of it, so two ids are two different men breathing out of
  // step: a first cut of this gave them "a" and "b" and read a 5 degree head
  // difference in idle that was two phases of one sway, not a defect.
  const p = mkPlayer(kit, cls, "man");
  const rig = kit.anim.createWarriorRig(parent, p, kit.materials, kit.settings);
  let res = null, scene = null;
  if (authored) {
    scene = cloneSkinned(gltf.scene);
    res = kit.authored.upgradeRigToAuthored(
      { body: rig.body, pivots: rig.pivots, weapon: rig.weapon, offhand: rig.offhand, shield: rig.shield, drape: rig.pivots.drape },
      { scene, clips: gltf.animations, wornRoles: new Set(["helm", "beard", "hair", "cloak"]), resolveMaterial: () => null },
    );
    if (!res.ok) throw new Error(`${cls}: the swap was refused: ${res.why}`);
  }
  parent.updateMatrixWorld(true);
  return { rig, parent, p, scene, res, motion: kit.anim.createMotion(p), ctx: ctxOf(kit), authored, clips: null };
}

/** A pair, and the bind-pose world orientation of every slot, taken before either is posed. */
export function buildPair(kit, cls, gltf) {
  const A = buildMan(kit, cls, gltf, false);
  const B = buildMan(kit, cls, gltf, true);
  const bind = (m) => Object.fromEntries(SLOTS.map((s) => [s, worldRot(m.rig.pivots[s])]));
  A.bind = bind(A); B.bind = bind(B);
  const dbind = (m) => (m.rig.pivots.drape || []).map((b) => worldRot(b));
  A.dbind = dbind(A); B.dbind = dbind(B);
  return { A, B, cls, gltf };
}

/** Give the authored man of a pair the real clip driver — the ARENA's man. */
export function giveClips(kit, pair) {
  const drv = kit.clipDriver.createClipDriver(pair.B.rig.body, pair.gltf.animations);
  if (!drv) throw new Error(`${pair.cls}: createClipDriver returned null`);
  pair.B.rig.clips = drv;
  pair.B.clips = drv;
  return drv;
}

export function setState(man, state, frame = 0) {
  const p = man.p;
  const dur = 0.6;
  p.state = "idle"; p.velocity = { x: 0, y: 0, z: 0 };
  // `PlayerState` says "walking" and "running"; the first cut of this said "moving",
  // which is not a state, so the pose fell through to no layer and a clip-driven
  // man "matched" the procedural one because neither was walking.
  if (state === "walking") { p.state = "walking"; p.velocity = { x: 0, y: 0, z: 2.2 }; }
  else if (state === "running") { p.state = "running"; p.velocity = { x: 0, y: 0, z: 4.6 }; }
  else if (state === "blocking") { p.state = "blocking"; p.blockTimer = 0.4; }
  else if (state === "staggered") { p.state = "staggered"; p.staggerTimer = Math.max(0.1, 0.5 - frame / 120); }
  else if (state === "dodging") { p.state = "dodging"; p.dodgeTimer = Math.max(0.1, 0.4 - (frame % 30) / 100); }
  else if (state === "shoving") { p.state = "shoving"; }
  else if (state === "rising") { p.state = "rising"; p.downTimer = Math.max(0.05, 0.6 - frame / 200); }
  else if (state === "ability") { p.state = "ability"; p.abilityActive = true; p.abilityTimer = 0.5; }
  else if (state === "attacking") {
    // Swept through a whole stroke and started again, so the sample frames land
    // in the windup, the strike and the recovery of a real blow rather than on
    // one frozen key.
    const t = ((frame / 60) % (dur * 1.5));
    p.state = "attacking"; p.attackDir = ["right", "left", "overhead", "stab"][Math.floor(frame / 45) % 4];
    p.swingDuration = dur; p.swingT = Math.min(1, t / dur); p.attackTimer = Math.max(0.01, dur - t);
    p.attackPhase = t < dur * 0.4 ? "windup" : t < dur * 0.7 ? "strike" : "recover";
  }
  else if (state === "knocked") { p.state = "knocked"; p.downTimer = Math.max(0.2, 1.5 - frame / 60); }
  else if (state === "dead") { p.state = "dead"; p.health = 0; }
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
export const worldRot = (o) => { o.updateWorldMatrix(true, false); o.matrixWorld.decompose(_v, _q, _s); return _q.clone(); };
export const worldPos = (o) => { o.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); };
const angleDeg = (a, b) => (2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180) / Math.PI;

/** Head-group vertices of the procedural man, or the Head-weighted vertices of the authored one, in world space. */
export function headVerts(man) {
  const out = [];
  const v = new THREE.Vector3();
  if (!man.authored) {
    man.rig.pivots.head.traverse((o) => {
      if (!o.isMesh || !o.visible || /shadow/.test(o.name) || o.material?.colorWrite === false) return;
      const pos = o.geometry.getAttribute("position");
      if (!pos) return;
      o.updateWorldMatrix(true, false);
      for (let i = 0; i < pos.count; i++) out.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).clone());
    });
    return out;
  }
  const head = man.rig.pivots.head;
  man.rig.body.traverse((o) => {
    if (!o.isSkinnedMesh || !o.visible) return;
    o.skeleton.update();
    const hi = o.skeleton.bones.indexOf(head);
    if (hi < 0) return;
    const pos = o.geometry.getAttribute("position");
    const ji = o.geometry.getAttribute("skinIndex"), wi = o.geometry.getAttribute("skinWeight");
    // Cheap reject on a sample: a torso mesh has no head weight anywhere.
    let s = 0, n = 0;
    for (let i = 0; i < pos.count; i += 7) { n++; for (let k = 0; k < 4; k++) if (ji.getComponent(i, k) === hi) s += wi.getComponent(i, k); }
    if (s / n < 0.25) return;
    for (let i = 0; i < pos.count; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (ji.getComponent(i, k) === hi) w += wi.getComponent(i, k);
      if (w < 0.5) continue;
      o.getVertexPosition(i, v);
      out.push(v.applyMatrix4(o.matrixWorld).clone());
    }
  });
  return out;
}

export const boxOf = (pts) => { const b = new THREE.Box3(); for (const p of pts) b.expandByPoint(p); return b; };

/** Local probe points of a carried object: off-axis on purpose, so a reflected or turned weapon reads. */
const PROBES = [[0.06, 0.15, 0.04], [-0.05, 0.45, -0.03], [0.0, 0.8, 0.07], [0.03, -0.1, -0.05]];

/**
 * Everything a gate holds, for one pair at the current frame.
 * Distances in metres, angles in degrees.
 */
export function measure(pair) {
  const { A, B } = pair;
  A.parent.updateMatrixWorld(true); B.parent.updateMatrixWorld(true);
  const joints = {};
  for (const s of SLOTS) {
    const a = worldPos(A.rig.pivots[s]), b = worldPos(B.rig.pivots[s]);
    // Orientation as the DELTA from each man's own bind pose, in world space.
    // The two skeletons are oriented differently at rest (that is the whole
    // defect), so the honest question is not "same axes" but "moved by the
    // same rotation" — and it is answered without assuming the fix's own maths.
    const da = worldRot(A.rig.pivots[s]).multiply(A.bind[s].clone().invert());
    const db = worldRot(B.rig.pivots[s]).multiply(B.bind[s].clone().invert());
    joints[s] = { a, b, d: a.distanceTo(b), deg: angleDeg(da, db) };
  }
  // The cloth's seven bones, in the solver's own index order — the same
  // question asked of the drape, which had the same defect as the pivots.
  const drape = [];
  const da_ = A.rig.pivots.drape, db_ = B.rig.pivots.drape;
  if (da_ && db_) {
    for (let i = 0; i < da_.length; i++) {
      const a = worldPos(da_[i]), b = worldPos(db_[i]);
      const ra = worldRot(da_[i]).multiply(A.dbind[i].clone().invert());
      const rb = worldRot(db_[i]).multiply(B.dbind[i].clone().invert());
      drape.push({ d: a.distanceTo(b), deg: angleDeg(ra, rb) });
    }
  }
  const ha = boxOf(headVerts(A)), hb = boxOf(headVerts(B));
  const head = {
    a: ha, b: hb, crown: hb.max.y - ha.max.y,
    // All six faces of the box, so a head that is the right height and facing
    // the wrong way (or turned on its side) still reads.
    box: Math.max(
      Math.abs(hb.min.x - ha.min.x), Math.abs(hb.max.x - ha.max.x), Math.abs(hb.min.y - ha.min.y),
      Math.abs(hb.max.y - ha.max.y), Math.abs(hb.min.z - ha.min.z), Math.abs(hb.max.z - ha.max.z)),
  };
  // Which side of his own body, in the warrior's own frame — what `reportHand`
  // publishes for `cameratest`. Negative is right-handed.
  const side = (m) => { const p = worldPos(m.rig.weapon); m.rig.group.worldToLocal(p); return p.x; };
  // The weapon ARM'S shoulder, which stays on its side of the body whatever the
  // pose does: a blade crosses the midline in a swing, so "which hand" cannot be
  // read off the blade in every frame, but it can be read off the arm.
  const arm = (m) => { const p = worldPos(m.rig.pivots.rightArm); m.rig.group.worldToLocal(p); return p.x; };
  const probe = (oa, ob) => {
    if (!oa || !ob) return null;
    let worst = 0;
    for (const [x, y, z] of PROBES) {
      const pa = oa.localToWorld(new THREE.Vector3(x, y, z)), pb = ob.localToWorld(new THREE.Vector3(x, y, z));
      worst = Math.max(worst, pa.distanceTo(pb));
    }
    return worst;
  };
  const tipA = A.rig.weapon.localToWorld(new THREE.Vector3(0, A.rig.reach, 0));
  const tipB = B.rig.weapon.localToWorld(new THREE.Vector3(0, B.rig.reach, 0));
  return {
    joints, head, drape,
    weaponSide: { a: side(A), b: side(B) },
    armSide: { a: arm(A), b: arm(B) },
    weapon: { tip: tipA.distanceTo(tipB), probe: probe(A.rig.weapon, B.rig.weapon) },
    offhand: probe(A.rig.offhand, B.rig.offhand),
    shield: probe(A.rig.shield, B.rig.shield),
  };
}

/** Pose both men for `frames` frames of `state`, sampling `measure` on the way. */
export function run(kit, pair, state, frames, every = 15) {
  const dt = 1 / 60;
  const samples = [];
  for (let f = 0; f < frames; f++) {
    for (const m of [pair.A, pair.B]) {
      setState(m, state, f);
      m.ctx.dt = m.ctx.rawDt = dt; m.ctx.time += dt;
      kit.anim.poseWarrior(m.rig, m.motion, m.p, dt, m.ctx);
    }
    if (f % every === every - 1 || f === frames - 1) { samples.push({ f, ...measure(pair) }); }
  }
  return samples;
}

/** The worst of a metric over a run's samples. */
export const worst = (samples, pick) => Math.max(...samples.map((s) => pick(s) ?? 0));
export const f3 = (n) => (n >= 0 ? " " : "") + n.toFixed(3);
/** Millimetres, because 0.000 m is a reading of nothing and 0.4 mm is a reading. */
export const mm = (n) => `${(n * 1000).toFixed(1)}mm`;
