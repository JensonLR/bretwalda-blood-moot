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
