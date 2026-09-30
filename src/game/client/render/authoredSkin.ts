/**
 * THE SKIN HANDLER — owner: U5 (heads and faces).
 *
 * WHAT IT DOES. Every skin part of an authored warrior arrives as `skin:<hex>` with the
 * hex of the man who was BAKED (identity 0 of the class), and used to be dressed with the
 * library's tinted skin at the exporter's 35 mm cube-projected UV: one dark tone on all
 * four classes, over a lattice. This dresses each part as the man who is actually standing
 * there:
 *
 *   the skull, the lids and the ears   the class's complexion map (`faceMap.ts`), at the
 *                                      head's own (u, v), over the skin substance at the
 *                                      HEAD's tile (2.2 mm), in the man's own tone
 *   the neck                           the same, on its own cylinder map
 *   arms, hands, a bare torso          the man's own tone at the body's grain, and nothing else
 *   the eyes (plain `m_<hex>`)         the man's sclera and iris, at the wetness they were
 *                                      built with (0.34 and 0.09); `standard(hex)` had them
 *                                      at 0.8, i.e. dry
 *
 * WHO THE MAN IS. `ctx.faceSeed` is the armoury's own `loadout.faceSeed` or the arena's
 * `faceSeedFor(player.id)`; `faceTraits(seed)` is the SAME function that picks the
 * procedural man's tone and iris, so the shop card, the mannequin and the arena agree about
 * whose face this is. (The procedural rig in the arena uses an interned identity, consecutive
 * integers under a Latin square; an authored man's seed is a hash, a fair coin, and eight men
 * on a field can share a tone. Recorded, not fixed: it needs `faceIdentity` exported from
 * `anim.ts`.)
 *
 * WHAT A HEX IS. The baked hexes are the tables' own values at the moment of the export
 * (`SKIN_TONES[faceTraits(0).tone]`), so this reads them from the tables AND from the list
 * of what the SHIPPED files carry (`LEGACY`, the values at the export before the tones were
 * re-graded): it must work on the files in `public/authored` today and on the files the next
 * rebake writes, and it must not guess. A skin it does not recognise is PASSED (null), never
 * dressed.
 *
 * THE BROW. The GLB's brows are two thin ribbons inside the baked hair mesh (`hair_N`), in the hair's material, and they
 * render as ink (L* 2-4, darker than the hair they are baked with). When this sees the baked hair go by it takes the two
 * ribbons out of that mesh's index and passes the ask on untouched (the hair's colour and substance are not this file's:
 * U6/U8), and the brow is painted into the head's map in the man's own hair colour instead (`FaceMap.browed`), which is also
 * the only brow he has when a hair prop is hung and the baked hair is hidden.
 *
 * THE EYE. The procedural head aims the iris, pupil and limbal ring on the GAZE (straight ahead) and cuts the lids on the
 * socket's own axis (splayed about 20 degrees outward), and its `eyeFrame` note calls that the wall-eye fix. In the frame it
 * puts the iris 3.5 mm nearer the nose than the middle of the aperture (white 5.6 mm nasal of it, 11.3 lateral, measured on the
 * huscarl card), which a dark iris in a dark eye hid and a white sclera does not: he looks at his own nose. So the iris,
 * pupil and limbal ring are turned about the globe's centre until the iris sits a millimetre nasal of the aperture's middle,
 * once per shared geometry. It is a correction to what the rebake will bake (Track B aims the lids on the gaze), and it does
 * nothing on a geometry that is already right (a rotation of under half a degree is not made).
 *
 * THE UV. The skinned mesh's material is `clone()`d by `forSkinnedMesh` and a clone does not
 * carry `onBeforeCompile`, so the shader-side world tile that `tinted(..., { tile })` sets up
 * for the procedural head never reaches an authored one, and the `tile` option is inert here:
 * the GLB's UV IS the texture density (35 mm). The head's grain is therefore set the other way
 * round: this writes the head's own (u, v) into the geometry's `uv` in SUBSTANCE TILES
 * (`FACE_TILE` of them), so the skin's normal and roughness maps tile at 2.2 mm with no
 * transform, and the complexion map divides the tile count back out with its own `repeat`.
 *
 * THE CONTRACT is written out in `authoredDress.ts`: return a material to claim the ask, null
 * to pass, never mutate `base()`. This file owns only `dressSkin`; new helpers live in
 * `faceMap.ts`.
 */
import * as THREE from "three";
import type { AuthoredMaterialHandler, AuthoredDressContext } from "./authoredDress";
import type { MaterialLibrary } from "./materials";
import { FACE_DARK, FACE_TILE, IRIS_COLORS, SKIN_TONES, faceLandmarks, faceTraits, type SkinTone } from "../characters";
import { FACE_MAP_GAIN, faceMapFor, type FaceKind } from "./faceMap";
import { irisTexture, scleraTexture } from "./eyeMap";

/**
 * What the SHIPPED warriors carry (`public/authored`, exported before the tones were
 * re-graded): identity 0 was the darkest tone, and its eyes were dark. The tables are the
 * truth for the files a rebake writes; these are the truth for the files that exist.
 */
export const LEGACY_BAKED = Object.freeze({
  base: 0x8d6444, shade: 0x65472e, warm: 0x7c4936, sclera: 0x655d50, iris: 0x241810, dark: 0x1a1310,
});

type FleshRole = "base" | "shade" | "warm";

/** The hexes a baked warrior's flesh carries, by what they are. */
function bakedFlesh(): Record<FleshRole, readonly number[]> {
  const t0 = SKIN_TONES[faceTraits(0).tone];
  return {
    base: [LEGACY_BAKED.base, t0.base],
    shade: [LEGACY_BAKED.shade, t0.shade],
    warm: [LEGACY_BAKED.warm, t0.warm],
  };
}

export function fleshRoleOf(hex: number): FleshRole | null {
  const b = bakedFlesh();
  for (const role of ["base", "shade", "warm"] as const) if (b[role].includes(hex)) return role;
  return null;
}

/** What an eye's plain-coloured parts are, by their baked hex. */
export function eyeRoleOf(hex: number): "sclera" | "iris" | "dark" | null {
  const t0 = SKIN_TONES[faceTraits(0).tone];
  if (hex === LEGACY_BAKED.sclera || hex === t0.sclera) return "sclera";
  if (hex === LEGACY_BAKED.iris || hex === IRIS_COLORS[faceTraits(0).iris]) return "iris";
  if (hex === LEGACY_BAKED.dark || hex === FACE_DARK) return "dark";
  return null;
}

/** The man's own complexion and iris, from the same function that dresses the procedural man. */
export function manOf(seed: number): { tone: SkinTone; toneIndex: number; iris: number; irisIndex: number } {
  const f = faceTraits(seed);
  return { tone: SKIN_TONES[f.tone], toneIndex: f.tone, iris: IRIS_COLORS[f.iris], irisIndex: f.iris };
}

/** Is this geometry the neck shell? By where it is, in the class's own numbers (`FaceField.neckSpan`). */
function isNeck(geo: THREE.BufferGeometry, cls: AuthoredDressContext["warriorClass"]): boolean {
  if (!geo.boundingBox) geo.computeBoundingBox();
  const b = geo.boundingBox;
  if (!b) return false;
  const span = faceMapFor(cls, { schedule: false }).field.neckSpan;
  return Math.abs((b.min.x + b.max.x) / 2) < 0.02
    && Math.abs(b.min.y - span.bottom) < 0.02 && Math.abs(b.max.y - span.top) < 0.02;
}

/** One cache per material library, so a harness with two libraries does not cross them. */
const CACHE = new WeakMap<MaterialLibrary, Map<string, THREE.Material>>();
function cached(lib: MaterialLibrary, key: string, make: () => THREE.Material): THREE.Material {
  let m = CACHE.get(lib);
  if (!m) { m = new Map(); CACHE.set(lib, m); }
  let hit = m.get(key);
  if (!hit) { hit = make(); m.set(key, hit); }
  return hit;
}

/** The roughness each flesh role was built with (`faceTile` in `buildCharacter`): base 0.62, shade 0.56, warm 0.55. */
const HEAD_ROUGHNESS: Record<FleshRole, number> = { base: 0.62, shade: 0.56, warm: 0.55 };

function headFlesh(ctx: AuthoredDressContext, kind: FaceKind, role: FleshRole, color: number, skinBase: number): THREE.Material {
  // The skull's map carries the man's brows in the colour of his hair, so it is a variant per (skin, hair); the neck has none.
  const hair = typeof ctx.appearance.hairColor === "number" ? ctx.appearance.hairColor : 0x4a3220;
  return cached(ctx.materials, `flesh|${ctx.warriorClass}|${kind}|${role}|${color}|${kind === "head" ? `${skinBase}|${hair}` : ""}`, () => {
    // The library's own material for this colour, at the head's roughness and tile: the maps it
    // carries (normal, roughness, AO) are the substance's, untiled, and are read at the GEOMETRY's
    // UV, which `writeUv` has set so that one unit is one FACE_TILE.
    const src = ctx.materials.tinted("skin", color, { roughness: HEAD_ROUGHNESS[role], tile: FACE_TILE }) as THREE.MeshStandardMaterial;
    const m = src.clone();
    m.name = `face-${kind}:${role}:${color.toString(16)}`;
    // The library's cached instance may have been flagged for vertex colour by a procedural head of
    // this tone in the same session (`faceTile`); this one has none and must not inherit it.
    m.vertexColors = false;
    // The complexion REPLACES the substance's albedo map: at 2.2 mm that map is under a pixel
    // everywhere the eye looks and reaches the frame as its mean, which the tone already is.
    m.map = kind === "head" ? faceMapFor(ctx.warriorClass).browed(skinBase, hair) : faceMapFor(ctx.warriorClass).neck.tex;
    // `map x color` is the tone: the map is stored over its gain and the colour carries it back.
    m.color.setHex(color).multiplyScalar(FACE_MAP_GAIN);
    m.needsUpdate = true;
    return m;
  });
}

function eyeMaterial(ctx: AuthoredDressContext, name: string, roughness: number, map: THREE.Texture): THREE.Material {
  const m = ctx.materials.standard(0xffffff, roughness).clone();
  m.name = name;
  m.color.setHex(0xffffff);
  m.map = map;
  return m;
}

// ---------------------------------------------------------------------------
// colour helpers
// ---------------------------------------------------------------------------

/** CIE L* of a hex colour (sRGB). */
function lstar(hex: number): number {
  const c = new THREE.Color(hex);
  const y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
}
const yOf = (l: number): number => (l > 8 ? Math.pow((l + 16) / 116, 3) : l / (24389 / 27));

/**
 * The white of the eye for THIS man's skin. The plan's bar is a sclera between 5 and 25 L* above the skin beside it (a lamp
 * fails high), and the table's sclera (`SKIN_TONES[i].sclera`) is one colour per tone chosen against the tone's own shade; on
 * the darkest skin it read 30 L* over the cheek in the frame and the eyes glowed. So it is held to 22 L* above the man's base
 * (the light is a little above the albedo, and that is the other 2), scaled in linear light so the hue is kept.
 */
export function scleraFor(tone: SkinTone): number {
  const cap = lstar(tone.base) + 22;
  const l = lstar(tone.sclera);
  if (l <= cap) return tone.sclera;
  return new THREE.Color(tone.sclera).multiplyScalar(yOf(cap) / yOf(l)).getHex();
}

// ---------------------------------------------------------------------------
// the eye: where its contents sit
// ---------------------------------------------------------------------------

interface EyeTarget { c: THREE.Vector3; iris: THREE.Vector3; cos: number; sin: number; turn: number }

/** Per eye, in the BUILDER's frame (x is the GLB's negated): the globe's centre, the iris's centre, and the turn that seats the iris. */
function eyeTargets(cls: AuthoredDressContext["warriorClass"]): EyeTarget[] {
  const NASAL_MM = 1.0;
  return faceLandmarks(cls, 0).eyes.map((e) => {
    const c = new THREE.Vector3(e.centre[0], e.centre[1], e.centre[2]);
    const iris = new THREE.Vector3(e.iris[0], e.iris[1], e.iris[2]);
    const r = iris.distanceTo(c);
    // the middle of the aperture, in x; nasal is toward the midline (x = 0)
    const mid = (e.medial[0] + e.lateral[0]) / 2;
    const want = mid - Math.sign(c.x) * NASAL_MM * 0.001;
    const sinNew = Math.max(-0.95, Math.min(0.95, (want - c.x) / r));
    const sinOld = Math.max(-0.95, Math.min(0.95, (iris.x - c.x) / r));
    const turn = Math.asin(sinNew) - Math.asin(sinOld);
    return { c, iris, cos: Math.cos(turn), sin: Math.sin(turn), turn };
  });
}

/**
 * Turn the vertices of one geometry that belong to an eye's contents (within `radiusMm` of an iris centre) about the vertical
 * through that globe's centre, positions and normals both. Returns how many vertices moved (0 on a geometry already done or
 * already right). `vertexColor` is asked for each vertex the same distance and returns its colour, if the caller wants one.
 */
function seatEyes(
  geo: THREE.BufferGeometry, cls: AuthoredDressContext["warriorClass"], radiusMm: number,
  colour?: (distMm: number, X: number, Y: number, Z: number) => [number, number, number],
): number {
  if (geo.userData.eyeSeated) return 0;
  geo.userData.eyeSeated = true;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!pos) return 0;
  const nrm = geo.getAttribute("normal") as THREE.BufferAttribute | undefined;
  const eyes = eyeTargets(cls);
  const col = colour ? new Float32Array(pos.count * 3) : null;
  let moved = 0;
  for (let i = 0; i < pos.count; i++) {
    const X = -pos.getX(i), Y = pos.getY(i), Z = pos.getZ(i);
    let best = -1, bd = Infinity;
    for (let k = 0; k < eyes.length; k++) { const d = Math.hypot(X - eyes[k]!.iris.x, Y - eyes[k]!.iris.y, Z - eyes[k]!.iris.z); if (d < bd) { bd = d; best = k; } }
    const near = bd * 1000 <= radiusMm;
    if (col && colour) { const c = colour(bd * 1000, X, Y, Z); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
    if (!near || Math.abs(eyes[best]!.turn) < 0.008) continue;
    const e = eyes[best]!;
    const dx = X - e.c.x, dz = Z - e.c.z;
    pos.setXYZ(i, -(e.c.x + dx * e.cos + dz * e.sin), Y, e.c.z - dx * e.sin + dz * e.cos);
    if (nrm) {
      const nx = -nrm.getX(i), nz = nrm.getZ(i);
      nrm.setXYZ(i, -(nx * e.cos + nz * e.sin), nrm.getY(i), -nx * e.sin + nz * e.cos);
    }
    moved++;
  }
  if (col) geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  if (moved) { pos.needsUpdate = true; if (nrm) nrm.needsUpdate = true; geo.computeBoundingSphere(); geo.computeBoundingBox(); }
  return moved;
}

// ---------------------------------------------------------------------------
// the baked brow
// ---------------------------------------------------------------------------

/**
 * Take the two brow ribbons out of a baked hair mesh's index. They are found by what they ARE: connected components of the
 * mesh (the cap is one of 720 triangles, a strand 80, a lash line 90) that are 250 to 450 triangles, thin (under 20 mm tall),
 * narrow (under 70 mm across), in front (z over 60 mm) and low (the brow's own height is where the eyes are; a hairline is not).
 * On a mesh with none of them (a rebake that leaves the brows to the face) it finds nothing and does nothing. Once per shared
 * geometry. Returns the triangles removed.
 */
export function hideBrowRibbons(geo: THREE.BufferGeometry): number {
  if (geo.userData.browless !== undefined) return 0;
  geo.userData.browless = 0;
  const index = geo.getIndex(), pos = geo.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!index || !pos) return 0;
  const n = pos.count, arr = index.array as ArrayLike<number>;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]!]!; a = parent[a]!; } return a; };
  for (let t = 0; t < arr.length; t += 3) {
    const a = find(arr[t]!), b = find(arr[t + 1]!), c = find(arr[t + 2]!);
    if (a !== b) parent[a] = b;
    if (find(b) !== find(c)) parent[find(b)] = find(c);
  }
  const comp = new Map<number, { tris: number; lo: number[]; hi: number[] }>();
  for (let t = 0; t < arr.length; t += 3) {
    const r = find(arr[t]!);
    let c = comp.get(r);
    if (!c) { c = { tris: 0, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }; comp.set(r, c); }
    c.tris++;
    for (let q = 0; q < 3; q++) {
      const v = arr[t + q]!;
      const xyz = [pos.getX(v), pos.getY(v), pos.getZ(v)];
      for (let k = 0; k < 3; k++) { c.lo[k] = Math.min(c.lo[k]!, xyz[k]!); c.hi[k] = Math.max(c.hi[k]!, xyz[k]!); }
    }
  }
  const drop = new Set<number>();
  for (const [r, c] of comp) {
    if (c.tris >= 250 && c.tris <= 450 && c.hi[1]! - c.lo[1]! < 0.02 && c.hi[0]! - c.lo[0]! < 0.07 && c.lo[2]! > 0.06) drop.add(r);
  }
  if (!drop.size) return 0;
  const keep: number[] = [];
  let removed = 0;
  for (let t = 0; t < arr.length; t += 3) {
    if (drop.has(find(arr[t]!))) { removed++; continue; }
    keep.push(arr[t]!, arr[t + 1]!, arr[t + 2]!);
  }
  geo.setIndex(keep);
  geo.userData.browless = removed;
  return removed;
}

export const dressSkin: AuthoredMaterialHandler = (ask, mesh, ctx) => {
  if (ask.surface === "skin") {
    const role = fleshRoleOf(ask.color);
    if (!role) return null;
    const man = manOf(ctx.faceSeed);
    const color = man.tone[role];
    const geo = mesh.geometry ?? null;
    let kind: FaceKind | "body" = "body";
    if (geo) {
      if (mesh.isHead) kind = "head";
      else if (isNeck(geo, ctx.warriorClass)) kind = "neck";
    }
    if (kind === "body") {
      return cached(ctx.materials, `flesh|body|${role}|${color}`, () => ctx.materials.tinted("skin", color, { roughness: 0.5 }));
    }
    // the head's own (u, v) into the shared geometry, once
    faceMapFor(ctx.warriorClass).writeUv(geo!, kind);
    return headFlesh(ctx, kind, role, color, man.tone.base);
  }
  // THE BAKED BROW. The baked hair mesh carries the brows as two ribbons in the hair's own material, and they draw as ink. They are
  // taken out of the index here (once, on the shared geometry) and the ask is PASSED: the hair's colour and substance are not
  // this file's. The brow the man wears is the one painted into his head's map, in his own hair colour.
  if (ask.surface === "hair" && mesh.isHead && mesh.geometry && /^hair_\d+$/.test(mesh.name)) {
    hideBrowRibbons(mesh.geometry);
    return null;
  }
  // The eye's parts are the baked `part_N` meshes riding the Head bone. A helm prop or the runekeeper's
  // hood rides it too, and one of them wears `m_1a1310` (a cloth) that is NOT the dark of an eye:
  // the role prefix on their names (`helm_42`, `hair-...`) is what tells them apart.
  if (ask.surface === null && mesh.isHead && /^part_\d+$/.test(mesh.name)) {
    const role = eyeRoleOf(ask.color);
    if (!role) return null;
    const man = manOf(ctx.faceSeed);
    const geo = mesh.geometry ?? null;
    // The sclera and the iris are TEXTURED with the man's own colour baked in (`eyeMap.ts`): the corners go
    // dark and warm, the iris has fibres, a collarette, a darker outer zone and a catchlight. The material's
    // colour is white because the texture IS the colour (a white catchlight multiplied into a blue material
    // is a darker blue).
    if (role === "sclera") {
      const white = scleraFor(man.tone);
      return cached(ctx.materials, `eye|sclera|${white}`, () => eyeMaterial(ctx, `eye-sclera:${white.toString(16)}`, 0.34, scleraTexture(white)));
    }
    if (role === "iris") {
      // the iris, turned to sit in the aperture (see the header): everything within 9 mm of an iris centre is the iris
      if (geo) seatEyes(geo, ctx.warriorClass, 9);
      return cached(ctx.materials, `eye|iris|${man.iris}`, () => eyeMaterial(ctx, `eye-iris:${man.iris.toString(16)}`, 0.09, irisTexture(man.iris)));
    }
    // THE DARK PART is not one thing: the pupils, the limbal rings, the nostrils and the mouth's ends share one material in the export
    // (`m_1a1310`, a black at L* 6 that read as two beads stuck on the nose and an ink outline round every iris). The pupil is black
    // and everything else in it (the limbal ring, the nostril, the mouth's end, the lid liner) is the shadow of the man's OWN skin,
    // so it belongs to the face round it: a vertex colour separates the two (0.03 for the pupil, 1 for the rest; man-independent, because
    // the geometry is SHARED by every man of the class) and the material's colour is the man's (shade x 0.30). It is matte: the gloss it
    // was given put a white dot in the middle of every pupil and a highlight on every nostril. The pupils and rings turn with the iris.
    if (geo) seatEyes(geo, ctx.warriorClass, 7.6, (d) => (d <= 3.1 ? [0.03, 0.03, 0.03] : [1, 1, 1]));
    return cached(ctx.materials, `eye|dark|${man.tone.shade}`, () => {
      const m = ctx.materials.standard(0xffffff, 0.85).clone();
      m.name = `face-dark:${man.tone.shade.toString(16)}`;
      m.color.setHex(man.tone.shade).multiplyScalar(0.30);
      m.vertexColors = true;
      return m;
    });
  }
  return null;
};
