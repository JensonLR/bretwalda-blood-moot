/**
 * THE AUTHORED MAN — loading a Blender-exported warrior, and dressing him.
 *
 * `docs/ONE-CLIENT.md` P2. The Blender pipeline has been exporting glTF since
 * 2 Sep 2026 and, until `tools/gltftest.mjs` on 7 Sep, no three.js had ever
 * opened a byte of it: the files were written for a Unity client that is now
 * retired. They open, they are skinned, they carry all fifteen clips by name,
 * and they are CHEAPER than the procedural man — 45 meshes and 29,522
 * triangles against 65 and 66,184.
 *
 * THE LAW THIS MODULE EXISTS UNDER, from `PLATFORM-PATH.md` §5b and unchanged:
 *
 *     an authored asset must never become the only way a thing can be drawn.
 *     The moment the procedural path is deleted, the browser build is dead.
 *
 * So every function here answers NULL rather than throwing, and a null means
 * "draw him the way you always did". A missing file, a corrupt buffer, a
 * renamed role — none of them may be able to stop a fight starting.
 *
 * WHAT IS PURE AND WHAT IS NOT, deliberately split. `rolePartsOf` and
 * `hideBakedRoles` take a loaded scene and no IO, so `tools/authoredtest.mjs`
 * runs them against the real exports with no browser and no GPU. `loadAuthored`
 * is the only function here that touches the network, and it is a thin cache
 * over one call.
 */
import type * as THREE from "three";

/**
 * The roles `tools/blender/exportrig.mjs` names its objects by, so a client can
 * hide what the armoury did not sell. A man ships with one of each BAKED IN;
 * dressing him is hiding the baked part and hanging the bought prop on the
 * Head bone. Lose these names and every man wears everything.
 */
export const AUTHORED_ROLES = ["helm", "beard", "hair", "cloak"] as const;

/**
 * ROLES THE AUTHORED MAN CANNOT WEAR YET, and the reason is topology.
 *
 * THE CLOAK. `anim.ts` solves a drape as a GRID — `DRAPE_BONES = 1 +
 * DRAPE_COLS.length * DRAPE_RINGS`, with a per-bone velocity integrator that
 * makes cloth swing behind a turning man. `exportrig.mjs` writes a CHAIN:
 * `CloakYoke` and `Drape1..Drape6`. Those are different shapes, so the solver
 * cannot drive the export's bones by naming them the way the pose drives its
 * joints — this is the one place the bridge does NOT hold.
 *
 * Left unposed, the export's cloak stands in its rest pose: a wide cone that
 * swallows the man. That is what the first authored capture showed, and it is
 * why the cloak is hidden rather than shipped broken. `REBUILD-PLAN.md` already
 * said it — "the cloak's drape chain is not yet animated (stiff in the clips)"
 * — and this is that sentence meeting a renderer.
 *
 * What it costs: an authored man wears no cloak. What it buys: he is not a
 * traffic cone. Closing it is either a chain solver in `anim.ts` or a grid
 * export from Blender, and it is the largest single thing between here and a
 * man who can replace the procedural one outright.
 */
export const AUTHORED_ROLES_UNPOSED = new Set<AuthoredRole>(["cloak"]);

/**
 * WHAT I BLAMED ON THE REST POSE, AND IT WAS A WRONG MOUNT — 7 Sep 2026.
 *
 * A previous version of this comment declared the bind poses incompatible and
 * called for a retargeting delta, on the evidence of a shield hanging half a
 * metre off the man. **That was wrong and is recorded rather than deleted,
 * because it was the more interesting-sounding explanation and it was reached
 * without the cheap check.**
 *
 * The shield was mounted on `HandL`. `anim.ts` straps it to `joints.elbowL` —
 * a board goes on the forearm, a blade goes in the fist — so it was hanging
 * off the wrong joint and doing so faithfully. The berserker, one axe and no
 * board, was drawn holding his weapon perfectly IN THE SAME BUILD, which is
 * the observation that should have ended the theory before it was written:
 * a broken bind pose does not correctly place one man's axe and misplace
 * another man's shield.
 *
 * Mounted on the elbow it sits where it belongs.
 *
 * The general point survives and is worth keeping: a name map carries topology
 * and not stance, so if the two bind poses ever DO diverge the symptom will
 * look like this. The lesson is that it looked like this already for a much
 * dumber reason, and the dumber reason should be excluded first.
 */
export type AuthoredRole = (typeof AUTHORED_ROLES)[number];

/** `helm_41`, `beard_40` — the role, then the exporter's own part number. */
const ROLE_RE = /^([a-z]+)_(\d+)$/;

/**
 * Every object in the scene that carries a role name, grouped by role.
 *
 * Pure: hand it a parsed scene, get a map. `tools/authoredtest.mjs` runs this
 * against all four exports, which is why it takes an Object3D and not a URL.
 */
export function rolePartsOf(root: THREE.Object3D): Map<AuthoredRole, THREE.Object3D[]> {
  const out = new Map<AuthoredRole, THREE.Object3D[]>();
  root.traverse((o) => {
    const m = ROLE_RE.exec(o.name || "");
    if (!m) return;
    const role = m[1] as AuthoredRole;
    if (!(AUTHORED_ROLES as readonly string[]).includes(role)) return;
    const list = out.get(role);
    if (list) list.push(o);
    else out.set(role, [o]);
  });
  return out;
}

/**
 * Hide the baked parts for every role the player did NOT buy, and leave the
 * rest alone.
 *
 * `wanted` is the roles that should stay visible. A role absent from the map is
 * not an error — a class may simply not ship one — and a role the caller does
 * not mention is left as the exporter made it, because a dressing function that
 * hides things it was not asked about is a dressing function that loses a cloak
 * the day somebody adds a role.
 *
 * Returns how many objects it hid, so a caller and a gate can both tell the
 * difference between "dressed him" and "found nothing to dress".
 */
export function hideBakedRoles(
  root: THREE.Object3D,
  wanted: ReadonlySet<AuthoredRole>,
): number {
  let hidden = 0;
  for (const [role, parts] of rolePartsOf(root)) {
    if (wanted.has(role)) continue;
    for (const p of parts) {
      if (p.visible) { p.visible = false; hidden++; }
    }
  }
  return hidden;
}

/**
 * The clips a fight can ask for by name. `attackDir` rides the wire and
 * `SWINGS`/`chainSwing` are keyed on the same four words, so an authored man
 * slots into the vocabulary the procedural one already speaks.
 */
export const REQUIRED_CLIPS = [
  "attack", "attackLeft", "attackOverhead", "attackStab",
  "heavy", "block", "dodge", "hit", "die", "idle", "walk", "run",
] as const;

/**
 * Is this parsed asset usable as a warrior?
 *
 * Checked at the seam rather than trusted, because the failure this guards is
 * silent: a glTF that parses but carries no skinning draws a statue, and one
 * missing `attackStab` drops every thrust to a T-pose mid-fight. Both look like
 * a renderer bug and neither is.
 */
export function warriorIsUsable(
  scene: THREE.Object3D,
  clips: readonly { name: string }[],
): { ok: true } | { ok: false; why: string } {
  let meshes = 0, skinned = 0;
  scene.traverse((o) => {
    const m = o as THREE.Object3D & { isMesh?: boolean; isSkinnedMesh?: boolean };
    if (m.isMesh) { meshes++; if (m.isSkinnedMesh) skinned++; }
  });
  if (meshes === 0) return { ok: false, why: "no meshes" };
  if (skinned !== meshes) return { ok: false, why: `${meshes - skinned} of ${meshes} meshes unskinned` };
  const have = new Set(clips.map((c) => c.name));
  const missing = REQUIRED_CLIPS.filter((c) => !have.has(c));
  if (missing.length) return { ok: false, why: `missing clips: ${missing.join(", ")}` };
  const roles = rolePartsOf(scene);
  const noRoles = AUTHORED_ROLES.filter((r) => !roles.has(r));
  if (noRoles.length === AUTHORED_ROLES.length) return { ok: false, why: "no role-named parts — nothing could be dressed" };
  return { ok: true };
}

/* --------------------------------------------------------------------------
   THE SURFACE NAME IS THE MATERIAL — and it is why the web can afford this
   -------------------------------------------------------------------------- */

/**
 * THE THING THAT MAKES AN AUTHORED MAN AFFORDABLE IN A BROWSER.
 *
 * The exports carry **no textures at all** — measured 7 Sep 2026: zero of a
 * warrior's 46 meshes holds a map, and all four classes together are 6.49 MB.
 * `tools/blender/*` ships materials BY NAME, `<surface>:<hex>`, because the
 * maps were always meant to be built once by the client rather than embedded
 * forty-six times. Unity did it in `SurfaceLibrary`; this is that, for
 * three.js — and three.js is the easier case, because `materials.ts` already
 * GENERATES those surfaces procedurally and has since the beginning.
 *
 * So the authored upgrade is **geometry, skinning and clips**: welded, smoothed,
 * subdivided, with strand hair — dressed in the same textures the procedural
 * man already wears, generated in code, downloaded never.
 *
 * That is the whole of `ONE-CLIENT.md`'s "procedural first, upgrade in
 * background" made cheap: 1.6 MB a class over the wire and not one texture
 * byte, against a four-second first open the browser build cannot afford to
 * lose (`WHAT-THIS-GAME-IS.md` §2).
 *
 * A name this cannot read is not an error — it answers null and the caller
 * keeps whatever the glTF came with, which is a flat colour and still a man.
 */
const SURFACE_NAME_RE = /^([a-z]+):([0-9a-f]{6})$/i;
/**
 * `m_bfa25c` — an UNTEXTURED one-off. `M.standard()` mints these for surfaces
 * that have not earned a name, and the exporter keeps the hex so the colour
 * survives. It is not a failure to read: it is a material that wants no map,
 * and handing it a generated one would be worse than leaving it flat.
 */
const PLAIN_NAME_RE = /^m_([0-9a-f]{6})$/i;

export interface AuthoredMaterialAsk {
  /** The surface to generate, or NULL for an untextured material of this colour. */
  surface: string | null;
  color: number;
}

/**
 * Read a glTF material name into the ask the client's library takes.
 *
 * THREE SHAPES, and the third is the interesting one:
 *
 *   `mail:5f6b7a`      a textured surface — generate it, tint it
 *   `m_bfa25c`         untextured, this colour — `standard()`, no map
 *   `runeGlow_carved`  a NAMED SPECIAL — null, and the caller LEAVES IT ALONE
 *
 * The third is not a gap. The runekeeper's carved runes are emissive and the
 * exporter authored them deliberately; replacing that with a generated surface
 * would put out the only light on the man. A null here means "the author knew
 * what he wanted", not "this could not be parsed" — every name that carries a
 * COLOUR is read, and `tools/authoredtest.mjs` enumerates the ones that do not
 * rather than tolerating a percentage.
 *
 * Pure and total: every failure is a null.
 */
export function readSurfaceName(name: string | undefined | null): AuthoredMaterialAsk | null {
  const raw = (name ?? "").trim();
  const surfaced = SURFACE_NAME_RE.exec(raw);
  if (surfaced) {
    const color = Number.parseInt(surfaced[2], 16);
    return Number.isFinite(color) ? { surface: surfaced[1].toLowerCase(), color } : null;
  }
  const plain = PLAIN_NAME_RE.exec(raw);
  if (plain) {
    const color = Number.parseInt(plain[1], 16);
    return Number.isFinite(color) ? { surface: null, color } : null;
  }
  return null;
}

/**
 * Dress every mesh in an authored scene out of the client's OWN material
 * library, by reading each glTF material's name.
 *
 * `resolve` is handed the surface and colour and returns a material, or null if
 * it does not know that surface — the caller passes a closure over
 * `MaterialLibrary.tinted` rather than this module importing it, so the whole
 * function stays pure and a gate can drive it with a stub.
 *
 * Returns what it did, because "dressed him" and "recognised none of it" look
 * identical on a mesh that was already a flat colour, and only one of them is
 * the feature working.
 */
export function dressFromSurfaceNames(
  root: THREE.Object3D,
  resolve: (ask: AuthoredMaterialAsk) => THREE.Material | null,
): { dressed: number; unknown: string[] } {
  const unknown = new Set<string>();
  let dressed = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Object3D & { isMesh?: boolean; material?: THREE.Material };
    if (!mesh.isMesh || !mesh.material) return;
    const ask = readSurfaceName(mesh.material.name);
    if (!ask) { if (mesh.material.name) unknown.add(mesh.material.name); return; }
    let next: THREE.Material | null = null;
    // A library that throws on an unknown surface must not take the fight with
    // it: the man keeps the flat colour the glTF gave him and the fight starts.
    try { next = resolve(ask); } catch { next = null; }
    if (!next) { unknown.add(mesh.material.name); return; }
    mesh.material = next;
    dressed++;
  });
  return { dressed, unknown: [...unknown] };
}

/* --------------------------------------------------------------------------
   THE BRIDGE — an authored skeleton, driven by the pose system that ships
   -------------------------------------------------------------------------- */

/**
 * WHAT MAKES P2 A BRIDGE RATHER THAN A REWRITE.
 *
 * `docs/PERFORMANCE.md` reads the authored-mesh problem as "the eight parts are
 * posed by their PIVOT's transform rather than by a bone", and costs the fix as
 * a rewrite of `anim.ts`'s posing. That is true of the stage-5 MERGE, which
 * needs one geometry buffer across parts. It is **not** true of drawing an
 * authored man.
 *
 * `applyPose` writes rotations onto about a dozen NAMED JOINTS — chest, head,
 * rightArm, leftArm, rightLeg, leftLeg, and the four hinges — and a pivot is an
 * `Object3D`. So is a `Bone`. The authored rig names its 25 bones by identity
 * (`exportrig.mjs`, and `warrior-<cls>.rig.json` beside every glb), and every
 * slot the pose writes has exactly one:
 *
 *     chest -> Spine        rightArm -> RightUpperArm   elbowR -> RightElbow
 *     head  -> Head         rightLeg -> RightThigh      kneeR  -> RightKnee
 *
 * So an authored man can be driven by the SAME pose the procedural one is —
 * the same `SWINGS`, the same `chainSwing` variants, the same weight, hitstop
 * and stagger — with no change to a line of it. The upgrade is the mesh
 * underneath, and everything this project has learned about how a man moves
 * stays exactly where it is.
 *
 * That is the difference between a wave and a rewrite, and it is worth being
 * exact about because the roadmap costed it as the latter.
 */
export const PIVOT_BONE_NAMES = {
  chest: "Spine",
  head: "Head",
  rightArm: "RightUpperArm",
  leftArm: "LeftUpperArm",
  rightLeg: "RightThigh",
  leftLeg: "LeftThigh",
  elbowR: "RightElbow",
  elbowL: "LeftElbow",
  kneeR: "RightKnee",
  kneeL: "LeftKnee",
} as const;

export type PivotSlot = keyof typeof PIVOT_BONE_NAMES;

/**
 * THE HANDS, WHICH ARE NOT PART OF THE POSE AND ARE PART OF THE MAN.
 *
 * `anim.ts` does `rightHand.add(weapon)` — the weapon, the shield and the
 * offhand hang off hand MOUNTS that live inside the procedural body. So a swap
 * that replaces the body takes them with it, and the first authored man ever
 * drawn came out unarmed and shieldless because of exactly that. The capture
 * found it; no structural gate could have, because the geometry was all fine.
 *
 * `exportrig.mjs` writes the hand mounts and parents them to the wrists for
 * exactly this reason, so the authored skeleton has somewhere to put them back.
 * They are `HandR` and `HandL` — the MOUNTS, not the wrist bones themselves,
 * which is the same distinction `anim.ts` draws with `rightHand.add(weapon)`:
 * the mount carries the builder's grip pitch, and hanging a sword off the wrist
 * instead would put it through the man's forearm.
 */
export const MOUNT_BONE_NAMES = {
  weapon: "HandR",
  offhand: "HandL",
  /**
   * THE ELBOW, NOT THE HAND, and this was got wrong once and caught by a
   * picture. `anim.ts` does `joints.elbowL.add(shield)` — a board is strapped
   * to the forearm, so it hangs off the elbow while a sword hangs off the fist.
   * Mounted on `HandL` it floated half a metre off the man, and the berserker
   * — one weapon, no board — was drawn holding his axe perfectly in the same
   * build, which is what said the mount was wrong rather than the bridge.
   */
  shield: "LeftElbow",
} as const;

export type MountSlot = keyof typeof MOUNT_BONE_NAMES;

/**
 * Find the bone behind every joint the pose writes.
 *
 * ALL OR NOTHING, deliberately. A partial map is the worst outcome available:
 * the man would pose from the waist up and stand rigid from the waist down, on
 * a build where every gate still passed because every gate reads geometry. So a
 * single missing bone answers null and the caller keeps the procedural man,
 * which is §5b's law — an authored asset must never become the only way a thing
 * can be drawn.
 */
export function pivotBonesOf(root: THREE.Object3D): Record<PivotSlot, THREE.Object3D> | null {
  const byName = new Map<string, THREE.Object3D>();
  root.traverse((o) => { if (o.name && !byName.has(o.name)) byName.set(o.name, o); });
  const out = {} as Record<PivotSlot, THREE.Object3D>;
  for (const slot of Object.keys(PIVOT_BONE_NAMES) as PivotSlot[]) {
    const bone = byName.get(PIVOT_BONE_NAMES[slot]);
    if (!bone) return null;
    out[slot] = bone;
  }
  return out;
}

/** Which pose joints an asset cannot supply — for a message, not a decision. */
export function missingPivotBones(root: THREE.Object3D): PivotSlot[] {
  const names = new Set<string>();
  root.traverse((o) => { if (o.name) names.add(o.name); });
  return (Object.keys(PIVOT_BONE_NAMES) as PivotSlot[])
    .filter((slot) => !names.has(PIVOT_BONE_NAMES[slot]));
}

/* --------------------------------------------------------------------------
   THE SWAP — a procedural man, upgraded in place
   -------------------------------------------------------------------------- */

/**
 * The parts of a `WarriorRig` this needs, named structurally so that this
 * module does not import `anim.ts` — which imports three.js, the whole renderer
 * and, transitively, everything. That import is what makes `tools/*` unable to
 * execute a line of `anim.ts`, and this file exists to be executable.
 */
export interface UpgradableRig {
  body: THREE.Object3D;
  pivots: Record<string, THREE.Object3D>;
  /** What the man is holding. Re-parented onto the authored wrists. */
  weapon?: THREE.Object3D;
  offhand?: THREE.Object3D;
  shield?: THREE.Object3D;
}

export interface AuthoredSwap {
  /** The parsed scene. Consumed — it is re-parented, not copied. */
  scene: THREE.Object3D;
  /** What the armoury actually sold him; everything else is hidden. */
  wornRoles: ReadonlySet<AuthoredRole>;
  /** Surface, colour -> a material from the client's own library. */
  resolveMaterial: (ask: AuthoredMaterialAsk) => THREE.Material | null;
  /** Clip names carried by the asset, for the usability check. */
  clips: readonly { name: string }[];
}

export type SwapResult =
  | { ok: true; dressed: number; hidden: number; joints: number; rehung: number }
  | { ok: false; why: string };

/**
 * UPGRADE A MAN WHO IS ALREADY STANDING THERE.
 *
 * `ONE-CLIENT.md` settled the shape: **procedural first, upgrade in
 * background.** The browser opens in four seconds on the man it can build
 * instantly, and the authored one — 1.6 MB, no textures — replaces him when it
 * arrives. That is why this is a SWAP and not a branch in the builder: at the
 * moment a fight starts there is no authored asset, and there must still be a
 * man.
 *
 * IT CHECKS EVERYTHING BEFORE IT MOVES ANYTHING. Every failure below leaves the
 * rig exactly as it found it, because a half-swapped man is worse than no swap:
 * `§5b`'s law is that an authored asset must never become the only way a thing
 * can be drawn, and a rig with authored geometry on procedural pivots is a man
 * who does not move.
 *
 * The order is: judge the asset, resolve every joint, and only then touch the
 * scene graph.
 */
export function upgradeRigToAuthored(rig: UpgradableRig, swap: AuthoredSwap): SwapResult {
  // 1. Is it a man at all? Unskinned meshes draw a statue; a missing clip drops
  //    a stroke to a T-pose. Both look like renderer bugs and neither is.
  const usable = warriorIsUsable(swap.scene, swap.clips);
  if (!usable.ok) return { ok: false, why: usable.why };

  // 2. Can the pose reach him? ALL OR NOTHING — see `pivotBonesOf`.
  const bones = pivotBonesOf(swap.scene);
  if (!bones) return { ok: false, why: `missing joints: ${missingPivotBones(swap.scene).join(", ")}` };

  // 2b. AND CAN HE HOLD ANYTHING? A man whose wrists cannot be found is a man
  //     who will be drawn unarmed, and that is what the first capture showed.
  const byName = new Map<string, THREE.Object3D>();
  swap.scene.traverse((o) => { if (o.name && !byName.has(o.name)) byName.set(o.name, o); });
  const held: Array<[THREE.Object3D, THREE.Object3D]> = [];
  for (const slot of Object.keys(MOUNT_BONE_NAMES) as MountSlot[]) {
    const carried = rig[slot];
    if (!carried) continue;                    // he is not holding one
    const mount = byName.get(MOUNT_BONE_NAMES[slot]);
    if (!mount) return { ok: false, why: `no ${MOUNT_BONE_NAMES[slot]} to hang the ${slot} on` };
    held.push([carried, mount]);
  }

  // 3. Nothing above this line has mutated anything. From here it commits.
  // Anything the armoury sold him, MINUS anything the renderer cannot yet pose.
  // A role that cannot move is worse than a role that is absent.
  const wearable = new Set<AuthoredRole>(
    [...swap.wornRoles].filter((r) => !AUTHORED_ROLES_UNPOSED.has(r)),
  );
  const hidden = hideBakedRoles(swap.scene, wearable);
  const { dressed } = dressFromSurfaceNames(swap.scene, swap.resolveMaterial);

  // The procedural body goes; the authored one takes its place under the same
  // parent, so everything the rig hangs off `body` — the nameplate, the health
  // bar, the world transform — is untouched.
  // THE HANDS COME OFF FIRST. `rig.body.remove` would otherwise take the whole
  // arm chain — and the weapon and shield hanging inside it — out with the
  // procedural mesh, which is precisely how the first authored man was drawn
  // holding nothing.
  for (const [carried] of held) carried.removeFromParent?.();
  for (const child of [...rig.body.children]) rig.body.remove(child);
  rig.body.add(swap.scene);
  // And back on, at the authored mounts, KEEPING their local transforms.
  //
  // Clearing them was tried and was wrong: `anim.ts` places a board relative to
  // the elbow it is strapped to and a blade relative to the fist that holds it,
  // and those offsets are the carry — not slack to be zeroed. The floating
  // shield that prompted the idea was a WRONG MOUNT (HandL for a board that
  // straps to the forearm), which the berserker's correctly-held axe in the
  // same build should have said first.
  for (const [carried, mount] of held) mount.add(carried);

  // 4. And the pose now writes the authored skeleton. This is the whole bridge:
  //    `applyPose` sets rotations on these by name and does not care whether it
  //    is holding a Group the builder inserted or a Bone Blender exported.
  let joints = 0;
  for (const [slot, bone] of Object.entries(bones)) { rig.pivots[slot] = bone; joints++; }

  return { ok: true, dressed, hidden, joints, rehung: held.length };
}
