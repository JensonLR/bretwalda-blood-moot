// The armoury's stage — the shop, rendered with the game's own renderer.
//
// WHY THIS FILE EXISTS. `docs/COSMETICS-AUDIT.md` §4 ranks the old preview the
// third worst thing in the game: `CharacterPreview.tsx` called
// `buildCharacter(cls, ap, tunic)` with no material library, so every surface
// fell back to `RAW` — flat `MeshStandardMaterial` colours, no albedo, no
// normal, no roughness and NO ENVIRONMENT MAP — and then lit that with
// `AmbientLight(0xb09880, 1.1)`, the one light that cannot describe form. The
// screen the owner judged the game's art on was showing worse than the game
// has. Everything here exists to close that gap:
//
//   - the real `TextureLibrary` and `MaterialLibrary`, the same instances the
//     arena builds,
//   - the real sky and therefore the real PMREM, so metal reflects a world,
//   - a three-point rig read straight off `render/summary.ts` — the tableau
//     that shipped this week and the reference for what good looks like,
//   - the real `createWarriorRig` / `poseWarrior` path, so the mannequin is
//     the same man `anim.ts` puts in the ring, breathing, with his cloak
//     draping on the same solver,
//   - ground he stands on and a shadow that touches his boots.
//
// ONE FORGE, MOVED BETWEEN MOUNTS. The heavy half — a GL context, ~20 PBR map
// sets and a PMREM bake — is a module-level singleton whose canvas is adopted
// by whichever preview is mounted. Mounting the armoury, stepping to the class
// picker and back used to mean three full texture generations; now it means
// one. It is torn down on an idle timer, and `releaseArmouryStage` tears it
// down at once — a phone must not carry the shop's 40 MB of maps into a match
// alongside `GameCanvas`'s own.
import * as THREE from "three";
import type { Appearance } from "./characters";
import { buildCharacter, buildWeaponForClass, defaultAppearance, setTeamContrast } from "./characters";
import { getFeel, getForged } from "./input";
import type { GamePlayer, WarriorClass } from "../types";
import { createTextureLibrary, type TextureLibrary } from "./render/textures";
import { createMaterialLibrary, type MaterialLibrary } from "./render/materials";
import { loadAuthoredWarrior, instanceAuthored } from "./render/authoredSource";
import { upgradeRigToAuthored, hideBakedRoles, type AuthoredRole, type SwapResult, AUTHORED_ROLES } from "./render/authored";
import { dressAuthoredHead, firstSkinnedMesh } from "./render/authoredProps";
import { armHeadNet, type HeadNet, type HeadNetRig } from "./render/authoredHead";
import { createSky, type SkyHandle } from "./render/sky";
import {
  createWarriorRig, createMotion, poseWarrior,
  type WarriorRig, type WarriorMotion,
  CLASS_TUNIC,
} from "./render/anim";
import {
  resolveQuality, configureRenderer, shadowRadiusFor,
  type QualitySettings, type FrameContext,
} from "./render/quality";
import {
  SLOT_LENS, SLOT_BEARING, takeThumbJob, returnThumbJob, publishThumb,
  setThumbForgeLive, dropThumbCache, thumbsWaiting, type PreviewLens,
} from "./armouryThumbs";

// ---------------------------------------------------------------------------
// Lenses
// ---------------------------------------------------------------------------

/**
 * Default bearing per lens, in radians about the mannequin's own axis.
 *
 * −35° for anything worn on the head: dead-on is a passport photograph and a
 * brow ridge, a cheek plate and a nasal all vanish in it. That is a SMALL turn
 * off dead-on and the man is still plainly facing you.
 *
 * `figure` is 0 — square to the viewer. It used to be 2.36 (135°, the back of
 * his head) because this table was also doing the cloak's job; the turn that
 * belongs to a garment now lives in `SLOT_BEARING` beside the slot that sells
 * it. A window that has not been told to look at something else looks at the
 * man's face.
 */
const LENS_BEARING: Record<PreviewLens, number> = {
  face: -0.61,
  bust: -0.61,
  figure: 0,
  fight: -0.42,
  // The item card rotates the OBJECT, not a man — see `drawThumb`'s branch.
  item: 0,
};

/**
 * The bearing this window should open on: the slot's, if the slot has one,
 * else the lens's. One resolver, because the live mannequin and the thumbnail
 * forge both ask and a second copy is how the card and the panel drift apart.
 */
function bearingFor(lens: PreviewLens, slot?: string): number {
  const bySlot = slot ? SLOT_BEARING[slot] : undefined;
  return bySlot ?? LENS_BEARING[lens];
}

interface LensFrame {
  /** Vertical metres the frame covers at the subject. */
  height: number;
  /** Aim height as a fraction between the boots (0) and the crown (1). */
  aim: number;
  /** Lens angle. Long for a portrait — a 35 mm face is a caricature. */
  fov: number;
  /** Lift the aim by this many metres. Positive looks down on the subject. */
  rise: number;
}

// `aim` is a fraction of the crown height, and the crown is ~1.78 m, so 0.91
// is the bridge of the nose. Aiming AT the crown — which the first pass did —
// puts the head in the bottom third of the frame with the sky above it, and
// that is the owner's complaint about his own screenshot restated: the thing
// being sold ends up at the frame's weakest point.
const LENS: Record<Exclude<PreviewLens, "fight" | "item">, LensFrame> = {
  // Crown to collarbone. 0.56 m is a head and a hand's width of air over the
  // crest, which is what a 950-gold serpent needs and no more.
  face: { height: 0.56, aim: 0.908, fov: 22, rise: 0.0 },
  // Crown to the belt: the shoulders, which is the whole of what a finish paints.
  bust: { height: 1.05, aim: 0.80, fov: 28, rise: 0.0 },
  // Boots to a hand's width over the crest, and never cropped at the shins.
  figure: { height: 2.26, aim: 0.52, fov: 34, rise: 0.0 },
};

/**
 * How far away a man is when you are fighting him.
 *
 * The audit's decisive finding is that seven helmets — 2110 gold of the ladder
 * — are the same 20 px grey dome at the range this game is played at, and a
 * shop that only ever shows a 400 px portrait is selling a lie. The lens
 * follows the arena's own: `camera.ts` holds the rig at CAM_DIST 4.4 m behind
 * the local warrior at a 55° vertical field, and an enemy inside melee reach
 * is a couple of metres past him.
 */
const FIGHT_DIST = 7.0;
/** `camera.ts` FOV_BASE. Duplicated deliberately — camera.ts is not ours. */
const GAME_FOV = 55;
const GAME_HALF_TAN = Math.tan((GAME_FOV * Math.PI) / 360);

// ---------------------------------------------------------------------------
// The forge: one context, one texture library, one PMREM.
// ---------------------------------------------------------------------------

/**
 * What a shop is allowed to spend. `resolveQuality` answers for a match with a
 * whole arena in it; this is one man on a disc, so the tier's *look* is kept
 * and its arena-sized budgets are not. The env map is the one thing pushed the
 * other way on a phone: it is the only source of specular here and 64 px of
 * cube face is a smear where a helmet's crown highlight should be.
 */
function shopQuality(): QualitySettings {
  const q = resolveQuality();
  return {
    ...q,
    // One subject, no crowd. A phone can afford the map sizes a desktop gets,
    // and the subject is 400 px tall here rather than 34.
    textureSize: q.tier === "low" ? 256 : 512,
    envMapSize: q.tier === "low" ? 128 : 256,
    // 512 everywhere, and DOWN from the arena's 1024 on two tiers. The arena
    // spends a shadow map on a 24 m cascade; this one covers a 40-degree cone
    // with one man and a metre of ground in it, so 512 is finer per texel here
    // than 2048 is there. Measured on the GPU-less capture box: the high tier
    // at 1024 was re-rendering a megapixel of depth every frame to shade one
    // pair of boots, and the shop drew at 0.5 fps because of it.
    shadowMapSize: 512,
    // Nothing here instances, throws blood or needs a torch ring.
    particleScale: 0,
    moteCount: 0,
    dynamicLights: 0,
    propDensity: 0,
  };
}

/**
 * Where the full-length lens puts the man: the crown 8% from the top of the
 * frame and the boots 90% (UI-PLAN U-M M3). The first left ~10 cm of air over
 * the crest and put his boots ON the bottom edge, so the ground he stands on —
 * the whole of what the dais and the contact shadow are for — was below the
 * frame. Ten percent under the boots is the floor; eight over the crown is what
 * a man's head wants above it.
 */
const FIG_TOP = 0.08;
const FIG_BOOT = 0.90;
/** Each side of the man's axis that must stay in frame: a spear held out, a board on the arm. */
const FIG_HALF_WIDTH = 0.85;

/**
 * The camera distance and aim that put the crown at `top` and the boots at
 * `boot` (fractions of the frame height from the top), for a camera at height
 * `camY` with vertical field `fovDeg`.
 *
 * Closed in the angle below the horizontal. A point at height y and distance d
 * sits at angle atan((camY - y) / d) below the horizon, and lands at
 * `0.5 + 0.5 tan(angle - pitch) / tan(fov / 2)` of the frame from the top; the
 * two conditions fix the angle between the crown and the boots, which fixes the
 * distance (by bisection, since it falls as the camera backs off), and then the
 * pitch. No fudge factor: every number in the frame is one of the four given.
 */
function solveFrame(fovDeg: number, camY: number, crownY: number, top: number, boot: number): {
  dist: number; lookY: number; pitch: number;
} {
  const a = Math.tan((fovDeg * Math.PI) / 360);
  const atanTop = Math.atan((top - 0.5) * 2 * a);
  const atanBoot = Math.atan((boot - 0.5) * 2 * a);
  const want = atanBoot - atanTop;
  const gap = (d: number) => Math.atan(camY / d) - Math.atan((camY - crownY) / d);
  let lo = 0.6, hi = 60;
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (gap(mid) > want) lo = mid; else hi = mid;
  }
  const dist = (lo + hi) / 2;
  const pitch = Math.atan(camY / dist) - atanBoot;
  return { dist, lookY: camY - dist * Math.tan(pitch), pitch };
}

/** The largest dais radius whose NEAR edge stays inside the frame (at `maxFrac` of its height from the top). */
function daisRadiusFor(fovDeg: number, camY: number, dist: number, pitch: number, maxFrac: number): number {
  const a = Math.tan((fovDeg * Math.PI) / 360);
  const phi = pitch + Math.atan((2 * maxFrac - 1) * a);
  if (phi <= 0.02) return 1.06;
  return Math.max(0.35, Math.min(1.06, dist - camY / Math.tan(phi)));
}

interface Forge {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  quality: QualitySettings;
  textures: TextureLibrary;
  materials: MaterialLibrary;
  sky: SkyHandle;
  /** Everything the portrait lenses hide: dome, fire, far ground. */
  arena: THREE.Group;
  plinth: THREE.Group;
  fire: THREE.Group;
  fireLight: THREE.PointLight;
  /** The fire's flames: additive sprites, animated in the frame loop. */
  flames: THREE.Sprite[];
  /** The hearth's light on the floor under the studio lenses. */
  pool: THREE.Mesh;
  lights: THREE.Group;
  key: THREE.SpotLight;
  rim: THREE.SpotLight;
  fill: THREE.PointLight;
  contact: THREE.Mesh;
  backdrop: THREE.Texture;
  /** Refs held by live stages. The forge dies when this reaches zero. */
  users: number;
  reaper: ReturnType<typeof setTimeout> | null;
}

let FORGE: Forge | null = null;
/** Set once a context has failed, so a re-mount does not retry every frame. */
let FORGE_FAILED = false;

/**
 * The hall behind the mannequin: near black at the top going to garnet embers at
 * the floor, with the HEARTH glowing low on the far side of the room. Generated,
 * like everything else in this project — VISUAL-BAR §4, no binary assets.
 *
 * 512 SQUARE, and it used to be a 4x256 strip. A strip stretched across a 400 px
 * panel is a vertical gradient and nothing else, so the "hall" had no place in it
 * that was warmer than any other, and the man stood in front of a colour and not
 * in front of a room. The glow is `--hearth` (#c65c14) at 20% — the palette's one
 * living light (UI-PLAN §1.2) — and it sits below and to the left of the man, so
 * the warm rim on his far shoulder has a source the eye can find.
 */
function backdropTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.00, "#05060a");
  grad.addColorStop(0.46, "#0b0a0d");
  grad.addColorStop(0.78, "#1d1113");
  grad.addColorStop(1.00, "#2e1a14");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const glow = g.createRadialGradient(150, 470, 0, 150, 470, 330);
  glow.addColorStop(0.0, "rgba(198,92,20,0.20)");
  glow.addColorStop(0.55, "rgba(198,92,20,0.07)");
  glow.addColorStop(1.0, "rgba(198,92,20,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, 512, 512);
  // A vignette, so the corners of a rectangular panel do not read as its edge.
  const vig = g.createRadialGradient(256, 256, 170, 256, 256, 400);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.38)");
  g.fillStyle = vig;
  g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** A soft-edged warm pool on the floor: the hearth's light landing where he stands. Additive, one 128 px texture. */
function hearthPoolTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.0, "rgba(255,150,70,0.85)");
  grad.addColorStop(0.35, "rgba(214,104,34,0.42)");
  grad.addColorStop(0.7, "rgba(160,70,20,0.12)");
  grad.addColorStop(1.0, "rgba(120,50,10,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** One flame: a white-yellow core through orange to nothing. The fire's soft edge — a mesh's edge is a hard one. */
function flameTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 78, 2, 64, 70, 62);
  grad.addColorStop(0.0, "rgba(255,244,200,1)");
  grad.addColorStop(0.22, "rgba(255,190,90,0.92)");
  grad.addColorStop(0.55, "rgba(230,110,32,0.46)");
  grad.addColorStop(1.0, "rgba(160,50,10,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The soft darkening under the boots.
 *
 * The key light casts a real shadow and that is the contact shadow proper —
 * but the low tier refuses shadow maps altogether, and a warrior with nothing
 * under him floats. This is a radial falloff on a plane, multiplied into the
 * ground, and it costs one 64² texture.
 */
function contactTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0.0, "rgba(0,0,0,0.72)");
  grad.addColorStop(0.45, "rgba(0,0,0,0.40)");
  grad.addColorStop(1.0, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Key/rim/fill, sized and aimed off `render/summary.ts`'s tableau rig. */
function raiseLights(q: QualitySettings): {
  group: THREE.Group; key: THREE.SpotLight; rim: THREE.SpotLight; fill: THREE.PointLight;
} {
  const g = new THREE.Group();
  // The lens stands on +Z, so "toward the lens" is +Z and the lens's left
  // shoulder is −X. Same construction as summary.ts, with camDir = (0,0,1).
  //
  // KEY — warm, three-quarter front left, high, and IT CASTS. Everything that
  // makes a portrait sit on the ground is in that last clause.
  // The cone is 0.52 rad — tight enough that its shadow frustum contains the
  // man, the plinth and nothing else. A wide cone here is not a softer light,
  // it is a coarser shadow: three sizes the shadow camera off the cone angle,
  // so every degree of spread is texels spent on empty ground.
  const key = new THREE.SpotLight(0xffd2a0, 26, 9, 0.52, 0.62, 2);
  key.position.set(-1.55, 2.55, 1.85);
  key.target.position.set(0, 1.05, 0);
  if (q.shadows) {
    key.castShadow = true;
    const map = Math.max(256, Math.min(1024, q.shadowMapSize));
    key.shadow.mapSize.set(map, map);
    key.shadow.camera.near = 0.5;
    // three overwrites a spot's shadow-camera far with `light.distance`, so the
    // normalised bias is derived against that rather than baked — the same
    // derivation summary.ts uses, at this rig's own subject distance.
    const near = 0.5, far = 9, z = 3.0;
    key.shadow.bias = -(0.010 * far * near) / ((far - near) * z * z);
    key.shadow.normalBias = 0.022;
    // Same derivation as summary.ts, at this rig's own cone and distance, and
    // for the same reason: `q.softShadows ? 3 : 1` was branching on a lever that
    // no longer moved anything. See `shadowRadiusFor`.
    key.shadow.radius = shadowRadiusFor((2 * z * Math.tan(key.angle)) / map);
  }
  g.add(key, key.target);
  // RIM — WARM now, off the far shoulder, three-quarters behind and LEVEL with
  // the chest. It was cool blue, which put a second, colder source in a room
  // whose only living light is the hearth (UI-PLAN §1.2), and a silver edge on
  // a man standing in front of a fire is the wrong colour of edge. `--hearth`
  // (#c65c14) lifted so it reads at a quarter of the key: an edge, not a fill.
  // Hung above, its cone lands on the ground behind him as a puddle; level, it
  // grazes an edge and dies. summary.ts paid for that in captures and there is
  // no reason to pay for it twice.
  const rim = new THREE.SpotLight(0xf08a48, 46, 7, 0.40, 0.5, 2);
  rim.position.set(2.05, 1.15, -1.55);
  rim.target.position.set(0, 0.95, 0);
  g.add(rim, rim.target);
  // FILL — cool, weak, down the lens axis. Keeps the shadow side off black
  // without flattening what the other two just built. This is the light the
  // old preview's 1.1 ambient was trying to be, at a sixth of the strength and
  // from somewhere.
  const fill = new THREE.PointLight(0x8fb4ff, 5.0, 8, 2);
  fill.position.set(0.35, 1.55, 2.35);
  g.add(fill);
  return { group: g, key, rim, fill };
}

/**
 * A log pile that burns, for the fight lens.
 *
 * THE FLAMES ARE SPRITES, NOT MESHES. The first fire was five cylinders and
 * seven emissive icosahedra, and against the dusk it read as what it was: a hard
 * silhouette of lit polygons with black slits between them (UI-PLAN D18: "the
 * fight-range bonfire is a hard-edged cut-out"). A flame has no edge, so these
 * are additive radial sprites — white-yellow core, orange skirt, nothing at the
 * rim — stacked and flickered per frame by `animateFlames`, over a few dark logs
 * and a bed of embers. The logs stay meshes: they are wood, and wood has edges.
 */
function buildFire(materials: MaterialLibrary, flameTex: THREE.Texture): {
  group: THREE.Group; light: THREE.PointLight; flames: THREE.Sprite[];
} {
  const g = new THREE.Group();
  const logGeo = new THREE.CylinderGeometry(0.06, 0.075, 1.15, 7);
  // Charred wood against fire is a silhouette, and a lit log with the fire's own light inside
  // the pile is the white slat with a black slit the first capture of this scene had. Unlit and
  // dark: the flames' glow (additive, drawn over them) is what lights the wood.
  const logMat = new THREE.MeshBasicMaterial({ color: 0x1c110a });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const log = new THREE.Mesh(logGeo, logMat);
    log.position.set(Math.sin(a) * 0.17, 0.3, Math.cos(a) * 0.17);
    log.rotation.set(Math.cos(a) * 0.62, -a, Math.sin(a) * 0.62);
    log.castShadow = false;
    g.add(log);
  }
  // Embers: one wide warm glow at the base, and the flames above it.
  const flames: THREE.Sprite[] = [];
  const mk = (x: number, y: number, z: number, w: number, h: number, op: number): THREE.Sprite => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flameTex, transparent: true, opacity: op, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    }));
    sp.position.set(x, y, z);
    sp.scale.set(w, h, 1);
    sp.userData = { x, y, z, w, h, op, ph: Math.random() * 6.28 };
    g.add(sp);
    flames.push(sp);
    return sp;
  };
  mk(0, 0.16, 0, 1.3, 0.55, 0.55);
  mk(0.02, 0.62, 0, 0.9, 1.25, 0.78);
  mk(-0.13, 0.86, 0.06, 0.62, 1.0, 0.7);
  mk(0.14, 0.9, -0.05, 0.55, 0.9, 0.62);
  mk(0.0, 1.22, 0, 0.42, 0.85, 0.5);
  const light = new THREE.PointLight(0xff9a44, 34, 16, 2);
  light.position.set(0, 1.25, 0);
  g.add(light);
  return { group: g, light, flames };
}

/** Flicker the flames. A fire is never still, and a still one reads as a lamp. */
function animateFlames(flames: readonly THREE.Sprite[], t: number): void {
  for (const sp of flames) {
    const u = sp.userData as { x: number; y: number; z: number; w: number; h: number; op: number; ph: number };
    const k = 0.9 + 0.1 * Math.sin(t * 9.1 + u.ph) + 0.06 * Math.sin(t * 5.3 + u.ph * 2.1);
    sp.scale.set(u.w * (0.96 + 0.06 * Math.sin(t * 7.7 + u.ph)), u.h * k, 1);
    sp.position.x = u.x + 0.03 * Math.sin(t * 3.1 + u.ph);
    (sp.material as THREE.SpriteMaterial).opacity = u.op * (0.85 + 0.15 * Math.sin(t * 11.3 + u.ph * 1.7));
  }
}

function buildForge(): Forge | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "default" });
  } catch {
    return null;
  }
  const quality = shopQuality();
  configureRenderer(renderer, quality);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // The arena's own exposure. postfx.ts owns this number in a match and sky.ts
  // encodes its fog and clear colours against it; a shop at a different
  // exposure is a shop showing a different game.
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  // Same door as GameCanvas: the palette is chosen before any dye is ground,
  // so the shop shows the mannequin in the colours the arena will actually use.
  setTeamContrast(getFeel().teamContrast);
  const textures = createTextureLibrary(renderer, quality);
  const materials = createMaterialLibrary(textures, quality);
  // Sky pushes its PMREM into the material library itself, on every rebake.
  // Aerial perspective is refused: it patches every fogged material in the
  // process for a 150 m arena, and nothing here is more than 8 m away.
  const sky = createSky(scene, renderer, materials, quality, { aerialPerspective: false });

  const arena = new THREE.Group();
  scene.add(arena);

  // Ground. The real dirt substance, world-tiled by the shader exactly as the
  // arena tiles it, so the turf under the mannequin is the turf he fights on.
  // GROUND SPECULAR <= 0.15 (UI-PLAN D18: "the ground is specular sand that
  // outshines the man"). Its roughness is already 0.96; the glitter is the
  // detail normal map catching the key and the fire and the env map reflecting
  // a sky into every bump. So the shop gets a CLONE of the library's ground with
  // the map's slope cut to a fifth, the albedo dimmed, and NO environment: the
  // library re-adopts every material it holds on each sky rebake and would put an
  // env intensity back on the original (`materials.ts` `adopt`), which is why this
  // is a clone the library does not know. The arena's ground is untouched.
  const groundMat = (materials.get("ground") as THREE.MeshStandardMaterial).clone();
  groundMat.normalScale?.set(0.2, 0.2);
  groundMat.envMap = null;
  groundMat.envMapIntensity = 0;
  groundMat.color.multiplyScalar(0.62);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(11, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = quality.shadows;
  arena.add(ground);

  const flameTex = flameTexture();
  const fireBits = buildFire(materials, flameTex);
  // Inside the fight lens's own frame, and behind him: at 7 m with the panel's
  // crop the frame is about 3 m across at the subject, so a hearth any further
  // out is a light source the player is told about and never sees.
  fireBits.group.position.set(1.32, 0, -1.85);
  fireBits.group.visible = false;
  arena.add(fireBits.group);

  // The dais: a shallow PEWTER ring set into the ground, with a dark stone
  // top. It is the one piece of furniture the shop gets, and it exists so the
  // full-length lenses read as a staging rather than as a man standing in a
  // field. Pewter and not bronze: the bronze ring was the second orange in a
  // room that is allowed one (UI-PLAN D18 "silver-pewter dais, no orange"), and
  // it competed with the hearth for being the warm thing. Built at radius
  // ~1.06 and SCALED to fit by `frameCamera`, because a full ellipse in a frame
  // that puts his boots at 90% has only room for a small one.
  const plinth = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.08, 72),
    materials.tinted("bronze", 0xaeb2ba, { roughness: 0.42, metalness: 1, tile: 0.06 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.008;
  plinth.add(ring);
  const top = new THREE.Mesh(
    new THREE.CircleGeometry(1.0, 72),
    new THREE.MeshStandardMaterial({ color: 0x34322f, roughness: 0.9, metalness: 0, envMapIntensity: 0.1 }),
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.004;
  top.receiveShadow = quality.shadows;
  plinth.add(top);
  scene.add(plinth);

  // The hearth's pool on the floor, under and to the near-left of the dais: the
  // ground is lit by something, which is what makes it ground rather than a disc.
  const poolTex = hearthPoolTexture();
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 4.4),
    new THREE.MeshBasicMaterial({
      map: poolTex, transparent: true, opacity: 0.25, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(-0.35, 0.002, -0.2);
  pool.renderOrder = 1;
  scene.add(pool);

  const contactTex = contactTexture();
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({
      map: contactTex, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.MultiplyBlending,
      // Not optional: three logs `MultiplyBlending requires
      // material.premultipliedAlpha = true` and falls back to a blend function
      // that is not a multiply at all, which the capture harness caught on the
      // FULL KIT lens. With premultiplied alpha the multiply resolves to
      // `dst * (1 - a)` — and the map is pure black with a radial alpha, so
      // premultiplied and straight are the same bytes.
      premultipliedAlpha: true,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.004;
  contact.renderOrder = 2;
  scene.add(contact);

  const lit = raiseLights(quality);
  scene.add(lit.group);

  const backdrop = backdropTexture();

  return {
    renderer, scene, quality, textures, materials, sky,
    arena, plinth, fire: fireBits.group, fireLight: fireBits.light, flames: fireBits.flames, pool,
    lights: lit.group, key: lit.key, rim: lit.rim, fill: lit.fill,
    contact, backdrop,
    users: 0, reaper: null,
  };
}

function acquireForge(): Forge | null {
  if (FORGE_FAILED) return null;
  if (!FORGE) {
    FORGE = buildForge();
    if (!FORGE) { FORGE_FAILED = true; return null; }
  }
  if (FORGE.reaper) { clearTimeout(FORGE.reaper); FORGE.reaper = null; }
  FORGE.users++;
  return FORGE;
}

function disposeForge(): void {
  const f = FORGE;
  if (!f) return;
  FORGE = null;
  dropThumbCache();
  f.sky.dispose();
  f.materials.dispose();
  f.textures.dispose();
  f.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry?.dispose();
  });
  (f.contact.material as THREE.MeshBasicMaterial).map?.dispose();
  (f.contact.material as THREE.Material).dispose();
  (f.pool.material as THREE.MeshBasicMaterial).map?.dispose();
  (f.pool.material as THREE.Material).dispose();
  const flameMat = f.flames[0]?.material as THREE.SpriteMaterial | undefined;
  flameMat?.map?.dispose();
  for (const sp of f.flames) (sp.material as THREE.Material).dispose();
  f.backdrop.dispose();
  cardBackdrop?.dispose();
  cardBackdrop = null;
  // `dispose()` frees three's own objects; it does not hand the GL context
  // back. A browser allows on the order of sixteen live contexts per page and
  // silently kills the oldest past that — which, on the way into a match,
  // would be `GameCanvas`'s.
  f.renderer.forceContextLoss();
  f.renderer.dispose();
}

function releaseForge(): void {
  const f = FORGE;
  if (!f) return;
  f.users = Math.max(0, f.users - 1);
  if (f.users > 0) return;
  // Not immediately: the armoury and the class picker hand the canvas back and
  // forth, and regenerating twenty PBR map sets on every tab is a second of
  // dead screen for nothing.
  f.reaper = setTimeout(disposeForge, 20_000);
}

/**
 * Tear the shop's GL context down NOW.
 *
 * `page.tsx` calls this on the way into a match. Two contexts each holding
 * their own texture library is 80 MB of maps on a phone that budgets 40, and
 * the one that matters is the one with the fight in it.
 */
export function releaseArmouryStage(): void {
  const f = FORGE;
  if (!f || f.users > 0) return;
  if (f.reaper) { clearTimeout(f.reaper); f.reaper = null; }
  disposeForge();
}

// ---------------------------------------------------------------------------
// The mannequin
// ---------------------------------------------------------------------------

/** A standing man off the wire, with nothing on the wire. */
function mannequinPlayer(cls: WarriorClass, ap: Appearance): GamePlayer {
  return {
    id: "mannequin",
    name: "",
    warriorClass: cls,
    team: "none",
    ready: true,
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    velocity: { x: 0, y: 0, z: 0 },
    health: 100, maxHealth: 100,
    stamina: 100, maxStamina: 100,
    state: "idle",
    attackDir: "right", blockDir: "right",
    attackTimer: 0, blockTimer: 0, dodgeTimer: 0, staggerTimer: 0,
    abilityCooldown: 0, abilityActive: false, abilityTimer: 0,
    kills: 0, deaths: 0, damage: 0, score: 0,
    lastHitBy: "", comboCount: 0, comboTimer: 0,
    invincible: false, invincibleTimer: 0,
    appearance: ap,
  } as unknown as GamePlayer;
}

export interface StageLoadout {
  warriorClass: WarriorClass;
  appearance: Appearance;
  /**
   * The player's own face. `buildCharacter` falls back to build order when it
   * is not given one, which resolved to 0 for every warrior the old preview
   * ever drew — so the shop showed every player the same man.
   */
  faceSeed: number;
  /** THE ARMS (7.7b): the loadout the mannequin holds. Absent draws the
   *  class default — every preview built before the table is unchanged. */
  arms?: string;
}

export interface StageHandle {
  /** The canvas is live and the first frame is on screen. */
  readonly ready: boolean;
  /**
   * Ready, AND the lens, slot and man have not changed for a few frames. `ready`
   * flips on the first frame; the lens effect and the loadout effect run in the
   * same commit and can land after it, so a panel that shows the canvas on
   * `ready` shows one frame of the wrong crop. `CharacterPreview` fades the
   * canvas in on this instead.
   */
  readonly settled: boolean;
  setLoadout(next: StageLoadout): void;
  /**
   * The crop, and the armoury slot driving it. The slot is what decides the
   * BEARING (see `SLOT_BEARING`) — a cloak tab turns him round, everything
   * else leaves him facing the player.
   */
  setLens(lens: Exclude<PreviewLens, "item">, slot?: string): void;
  /** Adds to the turntable, in radians. The player's drag lands here. */
  turnBy(delta: number): void;
  /** Absolute turntable bearing, for a reset control. */
  setTurn(radians: number): void;
  readonly turn: number;
  dispose(): void;
}


/**
 * Is the authored mesh wanted on this page?
 *
 * A query flag and not a tier, deliberately: the visual verdict on the authored
 * man is UNMADE (`ONE-CLIENT.md`, "what of P2 is built"), and until an owner
 * has looked at a capture the default has to be the man this project has spent
 * months on. When the verdict lands this becomes a tier decision and this
 * function is where it changes.
 */
function authoredWanted(): boolean {
  if (typeof window === "undefined") return false;
  // The stored preference, not a URL read. This was a verbatim copy of
  // GameCanvas's own — two places to change and one of them always forgotten.
  return getForged().mesh;
}

/** Did the armoury sell him this? Anything not sold is hidden on the mesh. */
function wearsRole(loadout: StageLoadout, role: AuthoredRole): boolean {
  const ap = loadout.appearance as unknown as Record<string, unknown> | undefined;
  const v = ap ? ap[`${role}Style`] ?? ap[role] : undefined;
  // "none" is the armoury's word for a slot nobody bought, and an ABSENT value
  // is not the same thing — a loadout that does not mention beards is not a man
  // who shaved. Absent keeps whatever the export baked in.
  return v === undefined || (typeof v === "string" ? v !== "none" && !v.endsWith("_none") : true);
}

/**
 * CLASSES WHOSE AUTHORED MAN FAILED THE HEAD NET THIS SESSION.
 *
 * A failed net is a property of the asset and the code, not of one loadout, so
 * it is remembered per class: the stage does not swap in a man it has already
 * caught losing his head, once per helm the player tries on.
 */
const HEAD_REFUSED = new Set<string>();

/**
 * How long the panel waits for the authored man before it shows the procedural
 * one. The head check has to have run before the stage says `ready`, so that
 * "LIGHTING THE HALL..." covers the build and the player never sees the swap
 * (or a man with no head); but a phone on a bad signal must not stare at a
 * black panel for as long as 1.6 MB takes. The swap still lands whenever it
 * lands, and is still checked before it is drawn.
 */
const AUTHORED_PATIENCE_MS = 6000;

export function createArmouryStage(mount: HTMLElement, initial: StageLoadout): StageHandle | null {
  const held = acquireForge();
  if (!held) return null;
  // Declared non-null rather than narrowed: the frame loop and the lens
  // switch are hoisted function declarations, and TypeScript will not carry a
  // narrowing into one.
  const forge: Forge = held;

  const { renderer, scene } = forge;
  const canvas = renderer.domElement;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.touchAction = "pan-y";
  mount.appendChild(canvas);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 240);
  // The panel's stances exclude "item" — that lens photographs an object,
  // not the mannequin, and exists only inside `drawThumb`.
  let lens: Exclude<PreviewLens, "item"> = "face";
  /** The armoury slot the panel is showing, when one is driving it. */
  let slot: string | undefined;
  let loadout = initial;
  let turn = bearingFor("face");
  let ready = false;
  /** Frames drawn since the lens, slot or man last changed. `settled` waits on it. */
  let settledFrames = 0;
  /**
   * True from the first build until the authored man has been CHECKED (or has
   * failed to arrive, or has been refused). `ready` waits on it: the panel's
   * "LIGHTING THE HALL..." is what covers the swap, so the player is never shown
   * the procedural man for a beat and then a different man, and above all is
   * never shown an authored man before the head net has looked at him.
   */
  let authoredPending = false;
  /**
   * Past this, `ready` stops waiting for a slow download; the swap is still checked when it lands.
   * Started when the FIRST FRAME has been drawn, not when the stage was made: the first frame is
   * where the texture library and the PMREM are baked (8 s on a box with no GPU), and a clock
   * started before it would have run out before the first thing was on screen.
   */
  let readyDeadline = Infinity;
  /** The authored man just swapped in, waiting for his first posed frame. */
  interface ArmedHeadNet {
    rig: WarriorRig; net: HeadNet; res: Extract<SwapResult, { ok: true }>; dress: () => void;
  }
  let headNet: ArmedHeadNet | null = null;
  /** Panel size in CSS pixels, as of the last frame. Declared up here because
   *  `buildRig` reframes off it and runs before the frame loop is set up. */
  let sized = { w: 0, h: 0 };

  let rig: WarriorRig | null = null;
  let motion: WarriorMotion | null = null;
  let player = mannequinPlayer(loadout.warriorClass, loadout.appearance);
  /** Crown height of the man currently standing, for every framing decision. */
  let crown = 1.78;

  function buildRig(): void {
    if (rig) { rig.dispose(); rig = null; }
    player = mannequinPlayer(loadout.warriorClass, loadout.appearance);
    // The mannequin bears the chosen arms (7.7b) the way a real player would
    // carry them off the wire — the rig reads `player.arms` and nothing else.
    player.arms = loadout.arms;
    // The seed goes in as the id's hash would: `createWarriorRig` interns
    // `player.id`, so the mannequin is stamped by giving it the player's own
    // id-shaped identity here instead.
    // Built at `high` WHATEVER the device's tier is, and this is the audit's
    // §2(a) finding acted on rather than repeated: `LOD.medium` samples the
    // head at 30x30 and `LOD.low` at 14x10, both below the Nyquist limit the
    // head's own comment in `characters.ts` was written to establish, so the
    // face that was authored does not exist on a phone. In the ARENA that is a
    // draw-call budget with eight men in it. Here there is ONE man, he is
    // 400 px tall, and six of the eight slots in this shop sell something on
    // his face. A shop that showed a phone player the 14-row head would be
    // selling him a war paint he cannot see.
    const built = createWarriorRig(
      scene, { ...player, id: `mannequin#${loadout.faceSeed}` },
      forge.materials, { ...forge.quality, tier: "high" },
    );
    rig = built;
    motion = createMotion(player);
    crown = built.headTop || 1.78;
    built.group.position.set(0, 0, 0);
    armRig();

    // ---- THE AUTHORED UPGRADE (ONE-CLIENT.md P2) ------------------------
    //
    // PROCEDURAL FIRST, UPGRADE IN BACKGROUND — the shape the owner settled.
    // The man above is already standing and already correct; this asks for the
    // authored mesh and swaps him when it lands. If it never lands, or lands
    // wrong, nothing happens and he stays as he is. That is §5b's law and it
    // is why this is a swap rather than a branch in the builder.
    //
    // OPT-IN while the visual verdict is unmade. `?authored=1` turns it on;
    // the default is the man this project has spent months on.
    // AND NOT OVER A PAINTED FACE. The comment eight lines up says "a shop that
    // showed a phone player the 14-row head would be selling him a war paint he
    // cannot see" — and the authored head does exactly that, at every tier,
    // because the paint is baked into the PROCEDURAL head's vertex colours and
    // the upgrade replaces it. Measured at dE 0.00 for all six paints; the
    // arena keeps the same gate, in `wearsWarPaint`. Six of the eight slots in
    // this shop sell something on his face, so this is the one window that most
    // has to be honest.
    const painted = typeof loadout.appearance?.warPaint === "string"
      && loadout.appearance.warPaint !== "none";
    headNet = null;
    authoredPending = false;
    settledFrames = 0;
    if (authoredWanted() && !painted && !HEAD_REFUSED.has(player.warriorClass)) {
      // THE PANEL IS NOT READY UNTIL THE AUTHORED MAN HAS BEEN CHECKED, the
      // first time. See `authoredPending`; a rebuild after the panel is up does
      // not put it back behind the curtain.
      if (!ready) authoredPending = true;
      const want = built;
      void loadAuthoredWarrior(player.warriorClass).then((asset) => {
        // He may have been rebuilt or disposed while 1.6 MB was in flight.
        if (rig !== want) return;
        // Not there (a 404, a parse failure): the procedural man stands, and the
        // panel has nothing left to wait for.
        if (!asset) { authoredPending = false; return; }
        const worn = new Set<AuthoredRole>(
          AUTHORED_ROLES.filter((r) => wearsRole(loadout, r)),
        );
        // Declared here rather than inline, because the head dressing below
        // wants the SAME library — a second copy of it is a second answer.
        const resolveMaterial = (ask: { surface: string | null; color: number }) => (ask.surface
          ? forge.materials.tinted(ask.surface as Parameters<MaterialLibrary["tinted"]>[0], ask.color)
          : forge.materials.standard(ask.color));
        const res = upgradeRigToAuthored(
          {
            body: want.body,
            pivots: want.pivots as unknown as Record<string, THREE.Object3D>,
            // What he is holding, so the swap can put it back on the authored
            // wrists instead of deleting it with the procedural arm.
            weapon: want.weapon, offhand: want.offhand, shield: want.shield,
            // The cloth solver's own array. Repointed at the export's
            // CloakYoke/Drape1..6, which ARE these bones renamed by index.
            drape: want.pivots.drape as unknown as THREE.Object3D[] | undefined,
          },
          {
            // INSTANCED, NOT THE CACHED SCENE ITSELF. The swap RE-PARENTS what
            // it is handed, so passing the cache directly re-parents the
            // mannequin's weapon and shield INTO it — and every later clone,
            // including all eight men in the arena, inherits them. That is
            // exactly what happened: the arena reported "warden: 5 of 50 meshes
            // unskinned" against an export that is 45 of 45, and the five were
            // the shop's own kit, carried in on a mutated cache.
            scene: instanceAuthored(asset).scene, clips: asset.clips, wornRoles: worn,
            // (declared above the call, because the head dressing below wants
            // the same library and a second copy of it is a second answer)
            // The client's OWN library, which is the whole economy of this:
            // the glTF ships `<surface>:<hex>` and no maps, and these surfaces
            // are generated in code and downloaded never.
            resolveMaterial,
          },
        );
        // Said out loud, because a swap that silently did nothing looks exactly
        // like a swap that was never wired.
        const w = window as unknown as Record<string, unknown>;
        if (!res.ok) {
          authoredPending = false;
          w.__authored = { ok: false, cls: player.warriorClass, why: res.why };
          console.warn(`[authored] ${player.warriorClass}: ${res.why} — keeping the procedural man`);
          return;
        }
        // ---- AND THE MANNEQUIN WEARS WHAT THE SHOP IS SELLING HIM ----
        //
        // This is the surface the defect was worst on. A warrior export carries
        // one baked helm, one hair and one beard; the swap kept them; so the
        // ARMOURY — the screen whose entire job is to show a man the piece he is
        // about to buy — drew every customer in the same helm. The stage said
        // "46 meshes dressed, 0 hidden" the whole time and it was true.
        //
        // The baked piece comes off only once its replacement is on him: see
        // GameCanvas for the reasoning. Wrong helm beats no head.
        //
        // NOT YET: this runs once the head net has passed him (`settleHeadNet`),
        // so a man about to be thrown away does not go and fetch a helm.
        const dress = (): void => {
          const skinned = firstSkinnedMesh(want.body);
          if (!skinned) return;
          void dressAuthoredHead({
            cls: player.warriorClass,
            appearance: (player as { appearance?: Record<string, unknown> }).appearance,
            head: want.pivots.head,
            skeleton: skinned.skeleton,
            resolveMaterial,
            strands: true,
          }).then((d) => {
            // Rebuilt, or thrown out by the head net, while the helm was in flight.
            if (rig !== want) return;
            if (d.mounted.length) {
              hideBakedRoles(want.body,
                new Set([...worn].filter((r) => !(d.mounted as AuthoredRole[]).includes(r))));
            }
            const wd = window as unknown as Record<string, unknown>;
            wd.__authoredProps = d;
            console.info(`[authored] ${player.warriorClass}: props ${d.mounted.join("+") || "none"}`
              + `${d.missing.length ? ` (missing ${d.missing.join("+")})` : ""}`);
          });
        };
        // ---- THE HEAD NET (render/authoredHead.ts) ----
        //
        // Armed NOW, at bind, and judged on the first posed frame, before that
        // frame is drawn. The owner: "image 1's head is missing from a full
        // health player". A skull that is visible, skinned and drawn inside the
        // chest passes every structural claim this stage used to make, so the
        // census is now taken twice and compared. See the file for what it
        // measures and why those numbers.
        headNet = { rig: want, net: armHeadNet(want as unknown as HeadNetRig), res, dress };
      });
    }
    // Re-aimed here and not only on resize: every framing decision in this
    // file is a fraction of the crown, and the berserker's crown is 90 mm
    // above the runekeeper's. Without this the lens keeps the last man's
    // height and the class picker crops one of the four at the eyebrows.
    if (sized.w) frameCamera(sized.w, sized.h);
  }

  buildRig();

  /**
   * Judge the authored man the swap has just put in, on his first posed frame.
   *
   * Returns true when he stands (or is not yet judgeable) and FALSE when he has
   * been thrown out and a procedural man built in his place — the caller poses
   * the new man before the frame is drawn.
   *
   * WRONG BODY BEATS NO HEAD. `armouryStage.ts` has always said "wrong helm beats
   * no head"; this is the same law one size up. The authored man is discarded,
   * never shown, and the class is refused for the rest of the session so the
   * next helm the player tries on does not rebuild the same failure. The head
   * object goes to `console.error` because that is where a person looking at a
   * bug report will look, and to `window.__authored` where a harness will.
   */
  function settleHeadNet(): boolean {
    const armed = headNet;
    if (!armed) return true;
    // Not the man on stage any more (rebuilt while he waited).
    if (armed.rig !== rig) { headNet = null; return true; }
    const { outcome, verdict: v } = armed.net.step();
    if (outcome === "waiting") return true;
    headNet = null;
    const w = window as unknown as Record<string, unknown>;
    const cls = player.warriorClass;
    if (outcome === "pass") {
      authoredPending = false;
      w.__authored = { cls, ...armed.res, head: v.now, net: { ok: true, turnDeg: v.turnDeg, reachDrift: v.reachDrift } };
      armed.dress();
      return true;
    }
    console.error(`[authored] ${cls}: the head net REFUSED the authored man — ${v.problems.join("; ")}. `
      + "Keeping the procedural man (wrong body beats no head).", v.now);
    w.__authored = {
      ok: false, refused: true, cls, why: `head net: ${v.problems.join("; ")}`,
      head: v.now, net: { ok: false, turnDeg: v.turnDeg, reachDrift: v.reachDrift, problems: v.problems },
    };
    HEAD_REFUSED.add(cls);
    // He is never drawn: hidden first, so that nothing in the rebuild can show him.
    armed.rig.body.visible = false;
    buildRig();
    authoredPending = false;
    return false;
  }

  function frameCamera(w: number, h: number): void {
    const aspect = w / Math.max(1, h);
    camera.aspect = aspect;
    if (lens === "fight") {
      // The honest one. The panel is a CROP of the game's own frame: keep the
      // arena's 55° vertical field over the phone's full height and take only
      // the slice this panel is tall, so a helmet occupies exactly the pixels
      // it occupies in play on this device. No flattery is possible here —
      // that is the point of the control.
      const screenH = Math.max(360, typeof window === "undefined" ? 844 : window.innerHeight);
      const slice = Math.min(1, h / screenH);
      camera.fov = (Math.atan(GAME_HALF_TAN * slice) * 360) / Math.PI;
      // Over his head and looking DOWN, which is where the arena's own rig
      // stands. Level at chest height the lens looks straight out at the dusk
      // horizon: the first capture of this lens has the warrior as a black
      // cut-out against a blown orange sky, which is a picture of the sky and
      // not of the helmet. Pitched down, what is behind him is turf — which
      // is also what is behind an enemy in a real fight.
      camera.position.set(0, 2.30, FIGHT_DIST);
      // AIMED SO THE CROWN IS 8% FROM THE TOP, whatever the man's height. The lookAt
      // was a fixed 0.92 m, which on a desktop panel put the crown ON the top edge
      // (the berserker's 5% over it — the helmet the lens exists to show, cropped).
      // The scale stays the honest one above; only where the frame sits on him moves,
      // and on a phone, where the slice is too short for all of him, it is his head
      // and shoulders that stay and his boots that go.
      const half = Math.tan((camera.fov * Math.PI) / 360);
      const phiCrown = Math.atan((2.30 - crown) / FIGHT_DIST);
      const pitch = phiCrown + Math.atan((0.5 - FIG_TOP) * 2 * half);
      camera.lookAt(0, 2.30 - FIGHT_DIST * Math.tan(pitch), 0);
    } else if (lens === "figure") {
      // Solved, not tuned: see `solveFrame`. A narrow panel (a phone) widens the
      // lens until the man's arms are in it and lets the crown and boots stay
      // where they were asked to be.
      const camY = crown * 0.8;
      let fov: number = LENS.figure.fov;
      let fit = solveFrame(fov, camY, crown, FIG_TOP, FIG_BOOT);
      for (let i = 0; i < 6 && fit.dist * Math.tan((fov * Math.PI) / 360) * aspect < FIG_HALF_WIDTH; i++) {
        fov += 5;
        fit = solveFrame(fov, camY, crown, FIG_TOP, FIG_BOOT);
      }
      camera.fov = fov;
      camera.position.set(0, camY, fit.dist);
      camera.lookAt(0, fit.lookY, 0);
      // A FULL ellipse: the dais is as big as fits with its near edge inside the frame.
      forge.plinth.scale.setScalar(daisRadiusFor(fov, camY, fit.dist, fit.pitch, 0.975) / 1.04);
    } else {
      const L = LENS[lens];
      camera.fov = L.fov;
      const aim = crown * L.aim + L.rise;
      // Solve the distance that puts exactly `height` metres across the frame's
      // SHORT axis, so a phone in portrait and a desktop panel both keep the
      // whole subject rather than the desktop keeping more of him.
      const vertical = aspect >= 1 ? L.height : L.height / Math.max(0.55, aspect);
      const dist = (vertical / 2) / Math.tan((camera.fov * Math.PI) / 360);
      camera.position.set(0, aim, dist);
      camera.lookAt(0, aim, 0);
    }
    camera.updateProjectionMatrix();
  }

  /**
   * Nothing in the fist, at a portrait crop.
   *
   * The warden's spear stands a metre over his head and crosses the whole
   * frame diagonally; the huscarl's shield is 800 mm across and sits between
   * the lens and his chest. At FULL KIT and at fight distance that is the man,
   * and it belongs there. At a head crop it is a pole through the photograph
   * of the thing being sold, and the first capture of this screen had a
   * 2400-gold helmet competing with a stick.
   */
  function armRig(): void {
    if (!rig) return;
    // A CLOAK IS SOLD ON A MAN WITH NOTHING IN HIS HANDS. The cloak tab is the
    // full-length lens (a cloak is a whole figure), and at full length the
    // warden's spear crossed the garment being sold (UI-PLAN D18:
    // "armoury-cloaks-desktop.png: the spear crosses the cloak being sold").
    // Armour is sold at the shoulders and never carries. Fight range is the one
    // lens that always does: the player asked to see a man as he is fought.
    const dressing = slot === "cloak" || slot === "armor";
    const carried = lens === "fight" || (lens === "figure" && !dressing);
    rig.weapon.visible = carried;
    if (rig.offhand) rig.offhand.visible = carried;
    if (rig.shield) rig.shield.visible = carried;
  }

  function applyLens(): void {
    const fight = lens === "fight";
    forge.sky.root.visible = fight;
    forge.fire.visible = fight;
    forge.plinth.visible = !fight;
    forge.arena.visible = true;
    forge.contact.visible = !fight;
    forge.pool.visible = !fight;
    scene.background = fight ? new THREE.Color(0x2b3a4e) : forge.backdrop;
    // The three-point rig is a shop rig. At fight distance the man has to be
    // lit by the arena, so the key drops to a quarter and the fire takes over.
    forge.key.intensity = fight ? 7 : 26;
    forge.rim.intensity = fight ? 20 : 46;
    // The fill is lifted at a head crop, and it is the eye that buys it.
    // COSMETICS-AUDIT §2(d): "the eye is a dark almond with no sclera on the
    // shadow side... the socket is deep enough that the key never reaches it",
    // and it names a dedicated fill as one of the two fixes. This is that
    // light — low, on the lens axis, at eye height, and weak enough that it
    // reaches into an orbit without flattening what the key just modelled.
    forge.fill.intensity = fight ? 1.6 : lens === "face" ? 9.5 : 5.5;
    forge.fill.position.set(0.30, lens === "face" ? 1.63 : 1.55, lens === "face" ? 2.05 : 2.35);
    armRig();
  }
  applyLens();

  const ctx: FrameContext = {
    dt: 0, rawDt: 0, time: 0,
    camera,
    focus: new THREE.Vector3(0, 1, 0),
    // NOT the mannequin's id: `poseWarrior` reports handedness upstream for the
    // local warrior, and the shop is not a fight.
    localId: "",
    localState: null,
    mood: "dusk",
    quality: forge.quality,
  };

  let raf = 0;
  let last = 0;
  let clock = 0;
  /**
   * Wall-clock time the player last touched the turntable.
   *
   * A shop mannequin taking a fifteen-second weight shift does not need a
   * frame every 8 ms, and MOST PLAYERS ARE ON A PHONE — where every frame
   * this panel draws is a frame of battery and heat spent on a menu. So the
   * stage idles at 30 and runs flat out for a second after a drag, which is
   * the only time anybody can see the difference. A 120 Hz phone dragging the
   * turntable gets 120 Hz.
   */
  let lastTouch = -Infinity;
  const IDLE_HZ = 30;

  function renderOnce(): void {
    renderer.render(scene, camera);
  }

  const loop = (t: number): void => {
    raf = requestAnimationFrame(loop);
    const since = t - last;
    // Never skip the frame a thumbnail is waiting on: the cards fill in one a
    // frame, and halving the frame rate would double how long a slot of ten
    // takes to become a shop.
    if (last !== 0 && since < 1000 / IDLE_HZ - 1
        && t - lastTouch > 1000 && !thumbsWaiting()) return;
    const dt = last === 0 ? 0.016 : Math.min(0.05, since / 1000);
    last = t;
    clock += dt;
    ctx.dt = dt; ctx.rawDt = dt; ctx.time = clock;

    const r = mount.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w !== sized.w || h !== sized.h) {
      sized = { w, h };
      renderer.setSize(w, h, false);
      frameCamera(w, h);
    }

    if (rig && motion) {
      rig.group.rotation.y = turn;
      poseWarrior(rig, motion, player, dt, ctx);
      // BETWEEN THE POSE AND THE DRAW, so a man the net throws out is never on
      // screen for even one frame.
      if (headNet && !settleHeadNet()) {
        rig.group.rotation.y = turn;
        if (rig && motion) poseWarrior(rig, motion, player, dt, ctx);
      }
      // AFTER the pose, every frame: `poseWarrior` writes `rig.shield.visible` itself (a man
      // with a board has it up), so a shield hidden once at a head crop was back on his arm on
      // the next frame — the huscarl's board filled the SHOULDERS lens in the first capture
      // of this scene. What the lens hides is decided after the pose and before the draw.
      armRig();
    }
    forge.sky.update(dt, ctx);
    if (lens === "fight") {
      // A fire is never still, and a still one reads as a lamp.
      const f = 0.86 + Math.sin(clock * 11.3) * 0.07 + Math.sin(clock * 4.1) * 0.06;
      forge.fireLight.intensity = 34 * f;
      animateFlames(forge.flames, clock);
    }

    // The thumbnail forge borrows the bottom-left corner of this same frame
    // before the mannequin is drawn over it — see `pumpThumbs`.
    pumpThumbs(forge);

    renderer.setViewport(0, 0, w, h);
    renderer.setScissorTest(false);
    renderOnce();
    if (readyDeadline === Infinity) readyDeadline = performance.now() + AUTHORED_PATIENCE_MS;
    if (!ready && (!authoredPending || performance.now() > readyDeadline)) ready = true;
    settledFrames++;
    STATS.frames++;
    STATS.worstFrameMs = Math.max(STATS.worstFrameMs, performance.now() - t);
    if ((STATS.frames & 15) === 0) publishStats();
  };
  raf = requestAnimationFrame(loop);

  const probe: StageProbe = {
    get ready() { return ready; },
    get settled() { return ready && settledFrames >= 3; },
    get cls() { return loadout.warriorClass; },
    get lens() { return lens; },
    get slot() { return slot; },
    get turn() { return turn; },
    get crown() { return crown; },
    headWindow() {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      camera.updateMatrixWorld(true);
      const at = (x: number, y: number, z: number) => {
        const p = new THREE.Vector3(x, y, z).project(camera);
        return { x: (p.x * 0.5 + 0.5) * size.x, y: (1 - (p.y * 0.5 + 0.5)) * size.y };
      };
      // A head is ~0.16 m across and a helm or a head of hair adds a few
      // centimetres either side; from the crest to the chin is ~0.27 m.
      const xs: number[] = [], ys: number[] = [];
      for (const x of [-0.14, 0.14]) for (const z of [-0.12, 0.12]) for (const y of [crown - 0.27, crown + 0.02]) {
        const q = at(x, y, z); xs.push(q.x); ys.push(q.y);
      }
      const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(size.x, Math.ceil(Math.max(...xs)));
      const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(size.y, Math.ceil(Math.max(...ys)));
      if (x1 - x0 < 2 || y1 - y0 < 2) return null;
      return {
        x: x0, y: y0, w: x1 - x0, h: y1 - y0,
        crownAt: at(0, crown, 0).y / size.y, bootsAt: at(0, 0, 0).y / size.y,
        canvasW: size.x, canvasH: size.y,
      };
    },
    read(x, y, w, h) {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      renderOnce();
      const gl = renderer.getContext();
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(x, size.y - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      // GL reads bottom-up; a harness thinks top-down.
      const row = w * 4, out = new Uint8Array(buf.length);
      for (let j = 0; j < h; j++) out.set(buf.subarray((h - 1 - j) * row, (h - j) * row), j * row);
      let bin = "";
      for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode(...out.subarray(i, i + 0x8000));
      return { w, h, rgba: btoa(bin) };
    },
  };
  if (typeof window !== "undefined") (window as unknown as Record<string, unknown>).__armouryStage = probe;

  STATS.tier = forge.quality.tier;
  publishStats();
  setThumbForgeLive(true);

  return {
    get ready() { return ready; },
    get settled() { return ready && settledFrames >= 3; },
    get turn() { return turn; },
    setLoadout(next) {
      // `arms` is in the comparison from day one — `sameAppearance` earned
      // its own recorded defect by learning `weapon` and `people` late, and
      // this comparator is not collecting the same scar.
      const same =
        next.warriorClass === loadout.warriorClass &&
        next.faceSeed === loadout.faceSeed &&
        (next.arms ?? "") === (loadout.arms ?? "") &&
        sameAppearance(next.appearance, loadout.appearance);
      loadout = next;
      if (!same) buildRig();
    },
    setLens(next, nextSlot) {
      if (next === lens && nextSlot === slot) return;
      // "Has the player turned him himself?" — asked against the bearing this
      // window actually opened on, which is the SLOT's when it has one. Asking
      // it against the lens alone would read a cloak tab's own 135° as a drag
      // and then refuse to leave it when the player moved to the helm.
      const wasDefault = Math.abs(turn - bearingFor(lens, slot)) < 1e-4;
      const reframe = next !== lens;
      lens = next;
      slot = nextSlot;
      lastTouch = performance.now();
      if (wasDefault) turn = bearingFor(next, nextSlot);
      if (reframe) {
        applyLens();
        frameCamera(sized.w || 1, sized.h || 1);
      } else {
        // The lens is the same but the slot is not: a cloak tab and a helm tab
        // both use the full-length lens and only one of them holds a weapon.
        armRig();
      }
      settledFrames = 0;
    },
    turnBy(delta) { turn += delta; lastTouch = performance.now(); },
    setTurn(radians) { turn = radians; lastTouch = performance.now(); },
    dispose() {
      cancelAnimationFrame(raf);
      if (typeof window !== "undefined") {
        const w = window as unknown as Record<string, unknown>;
        if (w.__armouryStage === probe) delete w.__armouryStage;
      }
      setThumbForgeLive(false);
      if (rig) { rig.dispose(); rig = null; }
      if (canvas.parentNode === mount) mount.removeChild(canvas);
      releaseForge();
    },
  };
}

/**
 * The rebuild gate. THIS LIST MUST NAME EVERY FIELD THE BUILDER DRAWS —
 * it was written at eight fields and never learned `weapon` or `people`,
 * so the stage refused the rebuild those two exist to trigger: the oath
 * mirror kept a man in issued steel under a caption naming his kingdom
 * (the owner photographed it), and an equipped weapon finish never moved
 * the live mannequin. Third recorded instance of the add-a-field,
 * miss-a-comparator family (CharacterPreview's destructure and the
 * server's SLOT_FIELD were the first two). `mark` is left out ON PURPOSE
 * and stays out: the builder never reads it, so a mark change must not
 * cost a rig rebuild.
 */
function sameAppearance(a: Appearance, b: Appearance): boolean {
  return a.helm === b.helm && a.hairStyle === b.hairStyle && a.hairColor === b.hairColor
    && a.beardStyle === b.beardStyle && a.beardColor === b.beardColor
    && a.cloak === b.cloak && a.armorColor === b.armorColor && a.warPaint === b.warPaint
    && (a.weapon ?? "weapon_issued") === (b.weapon ?? "weapon_issued")
    && (a.people ?? "none") === (b.people ?? "none");
}

// ---------------------------------------------------------------------------
// Thumbnails
// ---------------------------------------------------------------------------
//
// The owner's complaint about the cards was that they "read as identical dark
// lozenges with an eye glyph", and that nothing distinguishes a 30-gold item
// from a 2400-gold one. A glyph cannot: there is one helmet glyph for ten
// helmets. So each card gets a photograph of the thing it sells, taken with
// the same lights, the same materials and the same env map as the mannequin.
//
// HOW, without a second context or a second texture library: the job renders
// into a square in the corner of the live canvas, reads it back with
// `gl.readPixels`, and then the frame loop draws the mannequin over the whole
// viewport before the browser ever composites. Rendering into a
// `WebGLRenderTarget` would have been tidier and is wrong — three only applies
// tone mapping and the sRGB output transform when the target is the default
// framebuffer (`WebGLPrograms`: `toneMapping = NoToneMapping` unless
// `currentRenderTarget === null`), so a render-target thumbnail comes back as
// raw linear radiance and reads as a washed-out grey card.

/**
 * Edge of a thumbnail in device pixels: 256 where the panel is big enough to
 * draw one, and never under 132. It was a fixed 132 and the card shows it at 183
 * CSS px (upscaled) on a near-black void (UI-PLAN D15); 112 CSS px on a 2x phone
 * is 224 device pixels, so 256 is the smallest that is not a guess. A thumbnail
 * is drawn in the corner of the LIVE canvas (see the note above), so it can be
 * no bigger than the smaller side of that canvas: a phone's panel is often 190
 * CSS px tall at 1x and a fixed 256 there would never fit and would starve every
 * card of its picture, forever, without an error.
 */
const THUMB_MAX = 256;
const THUMB_MIN = 132;
const thumbPxFor = (bufW: number, bufH: number): number => Math.min(THUMB_MAX, Math.floor(Math.min(bufW, bufH)));

/**
 * What each slot's card is a photograph OF, as a crop. The first cut framed every
 * face slot the same 0.56 m (crown to collarbone), which made a helm a quarter
 * of its own card and put a beard at the frame's edge. `height` is metres across
 * the card, `aim` the fraction of the man's crown height the frame is centred on.
 * `helm` is the audit's own number: 0.56 -> 0.40-0.42.
 */
const SLOT_CROP: Readonly<Record<string, { height: number; aim: number }>> = {
  helm: { height: 0.42, aim: 0.925 },
  hair: { height: 0.5, aim: 0.915 },
  hairColor: { height: 0.46, aim: 0.918 },
  beard: { height: 0.52, aim: 0.895 },
  beardColor: { height: 0.46, aim: 0.9 },
  warPaint: { height: 0.36, aim: 0.912 },
  // A cloak is on his back, and the back of a man from the shoulders to the hips
  // is the whole of what a cloak card sells: a bust, and not the full figure that
  // made the man a 60 px sliver in the middle of the card.
  cloak: { height: 1.22, aim: 0.78 },
};

/**
 * The card's ground: `radial-gradient(75% 70% at 50% 38%, #3a3230, #17140f 62%, #0b0a0d)`
 * (UI-PLAN D15), drawn as the scene's background for the one render, so the
 * picture carries its own light instead of sitting on the near-black void the
 * card's CSS gives every item the same colour of.
 */
let cardBackdrop: THREE.Texture | null = null;
function cardBackdropTexture(): THREE.Texture {
  if (cardBackdrop) return cardBackdrop;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.save();
  g.translate(128, 0.38 * 256);
  g.scale(0.75 * 256, 0.70 * 256);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  grad.addColorStop(0, "#3a3230");
  grad.addColorStop(0.62, "#17140f");
  grad.addColorStop(1, "#0b0a0d");
  g.fillStyle = grad;
  g.fillRect(-2, -2, 4, 4);
  g.restore();
  cardBackdrop = new THREE.CanvasTexture(c);
  cardBackdrop.colorSpace = THREE.SRGBColorSpace;
  return cardBackdrop;
}

/**
 * What the stage is actually doing, on `window`, for the capture harness.
 *
 * `tools/armourycard.mjs` cannot photograph a WebGL panel to find out whether
 * it is alive — a context without `preserveDrawingBuffer` reads back as an
 * empty canvas however healthy it is, which is exactly the false negative the
 * first run of that tool produced. So the stage says so itself, in numbers a
 * harness can fail on: frames drawn, thumbnails taken, and how long the
 * slowest one cost. Nothing in the game reads this.
 */
export interface StageStats {
  frames: number;
  thumbs: number;
  /** Milliseconds spent in the slowest single thumbnail. */
  worstThumbMs: number;
  /** Milliseconds spent in the slowest single frame, thumbnails included. */
  worstFrameMs: number;
  tier: string;
}
const STATS: StageStats = { frames: 0, thumbs: 0, worstThumbMs: 0, worstFrameMs: 0, tier: "" };
function publishStats(): void {
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__armouryStats = STATS;
  }
}

/**
 * What a HARNESS may ask of the live stage, on `window.__armouryStage`, and
 * nothing it may change. `tools/stagehead.mjs`, `armourycard.mjs` and
 * `uishots.mjs` use it to answer the one question the owner asked four times —
 * "where is his head?" — from the pixels the canvas actually drew.
 *
 * WHY THE STAGE READS ITS OWN CANVAS. A WebGL context without
 * `preserveDrawingBuffer` reads back as an empty bitmap from outside (the first
 * run of `armourycard` reported "contrast=0, a blank panel" for a panel with a
 * warrior in it), and it is only valid to read inside the task that drew it. So
 * the stage draws one frame on request and reads the rectangle back in the same
 * breath, which is the only place the pixels exist.
 *
 * WHY THE WINDOW IS THE PROCEDURAL CROWN. The rectangle a head must occupy is
 * projected from `rig.headTop` — the height the procedural builder measured off
 * the man it built, which is where his head belongs whichever body is standing
 * there — and NOT from the authored skull, so a stage whose authored head has
 * collapsed is asked about the place the head should be, and answers "nothing".
 */
export interface StageProbe {
  readonly ready: boolean;
  /** `ready`, and the lens, slot and man have held still for a few frames: the frame a harness may trust. */
  readonly settled: boolean;
  /** The class of the man on stage. A harness waits for THIS class's authored report, not the last man's. */
  readonly cls: string;
  readonly lens: string;
  readonly slot: string | undefined;
  /** The turntable bearing, radians. */
  readonly turn: number;
  /** The procedural crown, metres. */
  readonly crown: number;
  /** Where the head belongs on the canvas, in drawing-buffer pixels, top-left origin; null when it is off-canvas. */
  headWindow(): {
    x: number; y: number; w: number; h: number;
    /** Where the crown and the boots project to, as fractions of the canvas height from the top. */
    crownAt: number; bootsAt: number;
    canvasW: number; canvasH: number;
  } | null;
  /** Draw a frame NOW and read a rectangle back: RGBA, top-left origin, base64. */
  read(x: number, y: number, w: number, h: number): { w: number; h: number; rgba: string };
}

let thumbCam: THREE.PerspectiveCamera | null = null;
let thumbBuf: Uint8Array | null = null;
let thumbCanvas: HTMLCanvasElement | null = null;

/**
 * One thumbnail per frame, and never more: each is a full character build plus
 * a synchronous `readPixels`, and a slot of ten taken in one frame is a
 * visible hitch on the frame a player taps a tab.
 */
function pumpThumbs(forge: Forge): void {
  const job = takeThumbJob();
  if (!job) return;
  const t0 = performance.now();
  const renderer = forge.renderer;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const THUMB_PX = thumbPxFor(size.x, size.y);
  if (THUMB_PX < THUMB_MIN) { returnThumbJob(job); return; }

  if (!thumbCam) thumbCam = new THREE.PerspectiveCamera(24, 1, 0.05, 60);
  if (!thumbBuf || thumbBuf.length !== THUMB_PX * THUMB_PX * 4) thumbBuf = new Uint8Array(THUMB_PX * THUMB_PX * 4);
  if (!thumbCanvas) thumbCanvas = document.createElement("canvas");
  if (thumbCanvas.width !== THUMB_PX) thumbCanvas.width = thumbCanvas.height = THUMB_PX;

  const ap = job.spec.appearance;
  const cls = job.spec.warriorClass;
  // `medium`, not the tier. A card is 132 px square and a desktop's `high`
  // build is the single most expensive thing this file does — ten of them at
  // one a frame is what made the first capture of this screen come back with
  // three cards filled in and seven spinners.
  //
  // `low` is refused, and the reason written here used to be that it "drops the
  // head to 14x10 sampling rows". It does not, and has not since the Nyquist
  // note went into characters.ts: `LOD.low` is `headU: 30, headV: 30`, and that
  // note exists precisely to explain that the head's row count is a correctness
  // number that no tier is allowed to cut. 14x10 was the value BEFORE that fix —
  // this comment was arguing from a build that had already been repaired, which
  // is the `cheekOut` defect (PROCESS.md R7) in another file.
  //
  // The real reason `low` is wrong for a shop card survives the correction and
  // is stronger: `low` is the one tier where `packOrm` is false, so every
  // surface loses its roughness, metalness and AO maps and falls back to the
  // recipe's scalars. Six of the eight slots here sell something metal and six
  // sell something on a face; a helm with no roughness map is a grey blob and a
  // cheek with no cavity AO is an egg. A shop card's entire job is to show the
  // thing you are being asked to pay for.
  const lens = SLOT_LENS[job.spec.slot] ?? "face";
  // THE ITEM CARD — the weapon alone, diagonal, filling the frame. A weapon
  // finish card that photographs a whole man photographs a 4 px sliver of
  // what it is selling; four of them photographed the SAME man, because the
  // body path never mounts a weapon at all. The object is built by the same
  // builder the fight mounts, under the same material library, so the card
  // and the arena cannot drift.
  const built = lens === "item" ? null : buildCharacter(
    cls, ap, CLASS_TUNIC[cls] ?? 0x5a4a2c, forge.materials, "medium", job.spec.faceSeed,
  );
  const subject = built ? built.group : buildWeaponForClass(cls, forge.materials, ap.weapon);
  if (lens === "item") {
    // Blade high, grip low, leaning like a sword stood in a corner: the
    // long axis runs y, so a roll about z lays it on the card's diagonal
    // and a quarter-turn in y gives the key light the blade's FLAT — dead
    // edge-on is a line, dead flat-on is a mirror into the void.
    subject.rotation.z = -0.62;
    subject.rotation.y = 0.55;
    // And UP into the light. The rig's key, rim and fill are aimed at a
    // standing man; a weapon is built about its hand mount at y = 0, and the
    // first cut of this card photographed it at the mannequin's boots — four
    // near-black cards. The object is carried to the bust line, where the
    // three-point rig actually is.
    const pre = new THREE.Box3().setFromObject(subject);
    const pc = pre.getCenter(new THREE.Vector3());
    subject.position.set(-pc.x, 1.30 - pc.y, -pc.z);
  } else {
    subject.rotation.y = bearingFor(lens === "fight" ? "face" : lens, job.spec.slot);
  }
  subject.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; }
  });
  forge.scene.add(subject);

  if (lens === "item") {
    // Framed off the object's own box, not a man's proportions: a dagger and
    // a spear differ by a metre and both must fill the card.
    const box = new THREE.Box3().setFromObject(subject);
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const span = Math.max(s.x, s.y) * 1.14;
    thumbCam.fov = 26;
    const dist = (span / 2) / Math.tan((thumbCam.fov * Math.PI) / 360) + s.z;
    thumbCam.position.set(c.x, c.y, c.z + dist);
    thumbCam.lookAt(c.x, c.y, c.z);
    thumbCam.updateProjectionMatrix();
  } else {
    const top = new THREE.Box3().setFromObject(subject).max.y || 1.78;
    const L = LENS[lens === "fight" ? "figure" : lens];
    // The slot's own crop when it has one (`SLOT_CROP`), the lens's otherwise.
    const C = SLOT_CROP[job.spec.slot] ?? L;
    thumbCam.fov = L.fov;
    const aim = top * C.aim + (SLOT_CROP[job.spec.slot] ? 0 : L.rise);
    const dist = (C.height / 2) / Math.tan((L.fov * Math.PI) / 360);
    thumbCam.position.set(0, aim, dist);
    thumbCam.lookAt(0, aim, 0);
    thumbCam.updateProjectionMatrix();
  }

  // A card is a card, not a diorama: no ground, no plinth, no sky behind the
  // item, so ten of them read as ten objects rather than as ten photographs of
  // the same field.
  // A card is a card, not a diorama. Everything in the scene that is not this
  // one object and the lights on it goes dark for the duration — including the
  // live mannequin, which `createWarriorRig` parents straight to the scene.
  const bg = forge.scene.background;
  forge.scene.background = lens === "item" ? null : cardBackdropTexture();
  const hidden: THREE.Object3D[] = [];
  for (const c of forge.scene.children) {
    if (c === subject || c === forge.lights) continue;
    if (c.visible) { hidden.push(c); c.visible = false; }
  }
  // An item card brackets its own exposure. The rig's intensities are tuned
  // for a man's worth of lit surface; a spear is a finger's width of it, and
  // at the panel's figure exposure the four cards came back near-black
  // (`art/ui/wf-cards-zoom.png`). Saved and restored around the one render —
  // the live mannequin never sees these numbers.
  const litKey = forge.key.intensity, litRim = forge.rim.intensity, litFill = forge.fill.intensity;
  if (lens === "item") {
    forge.key.intensity = 44;
    forge.rim.intensity = 88;
    forge.fill.intensity = 14;
  }

  const pr = renderer.getPixelRatio();
  const css = THUMB_PX / pr;
  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, css, css);
  renderer.setScissor(0, 0, css, css);
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x07070a, 1);
  renderer.render(forge.scene, thumbCam);

  const gl = renderer.getContext();
  gl.readPixels(0, 0, THUMB_PX, THUMB_PX, gl.RGBA, gl.UNSIGNED_BYTE, thumbBuf);

  renderer.setScissorTest(false);
  renderer.setClearColor(prevClear, prevAlpha);
  forge.scene.background = bg;
  forge.key.intensity = litKey;
  forge.rim.intensity = litRim;
  forge.fill.intensity = litFill;
  hidden.forEach((o) => { o.visible = true; });
  forge.scene.remove(subject);
  // `characters.ts` shares merged geometry between builds and patches
  // `dispose()` on every cached buffer to decrement its own refcount — so this
  // walk is a RELEASE, not a free, and skipping it is the leak.
  built?.reassemble();
  subject.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry?.dispose();
  });

  // GL reads bottom-up; a canvas is top-down.
  const g2 = thumbCanvas.getContext("2d")!;
  const img = g2.createImageData(THUMB_PX, THUMB_PX);
  const row = THUMB_PX * 4;
  for (let y = 0; y < THUMB_PX; y++) {
    const src = (THUMB_PX - 1 - y) * row;
    img.data.set(thumbBuf.subarray(src, src + row), y * row);
  }
  g2.putImageData(img, 0, 0);
  // THE SHOULDER FADE: the bottom 6% goes to the card's own ground, so a bust
  // that ends mid-chest ends in the dark rather than on a hard edge (UI-PLAN D15).
  // An item card is an object, whole, and has no cut edge to hide.
  if (lens !== "item") {
    const fade = g2.createLinearGradient(0, THUMB_PX * 0.94, 0, THUMB_PX);
    fade.addColorStop(0, "rgba(11,10,13,0)");
    fade.addColorStop(1, "rgba(11,10,13,1)");
    g2.fillStyle = fade;
    g2.fillRect(0, THUMB_PX * 0.94, THUMB_PX, THUMB_PX * 0.06 + 1);
  }
  let url = "";
  try { url = thumbCanvas.toDataURL("image/webp", 0.82); } catch { url = ""; }
  if (!url || url.length < 64 || !url.startsWith("data:image/webp")) {
    url = thumbCanvas.toDataURL("image/png");
  }
  publishThumb(job.key, url);
  STATS.thumbs++;
  STATS.worstThumbMs = Math.max(STATS.worstThumbMs, performance.now() - t0);
}

