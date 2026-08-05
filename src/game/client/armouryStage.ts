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
import { buildCharacter, defaultAppearance } from "./characters";
import type { GamePlayer, WarriorClass } from "../types";
import { createTextureLibrary, type TextureLibrary } from "./render/textures";
import { createMaterialLibrary, type MaterialLibrary } from "./render/materials";
import { createSky, type SkyHandle } from "./render/sky";
import {
  createWarriorRig, createMotion, poseWarrior,
  type WarriorRig, type WarriorMotion,
} from "./render/anim";
import {
  resolveQuality, configureRenderer,
  type QualitySettings, type FrameContext,
} from "./render/quality";
import {
  SLOT_LENS, takeThumbJob, returnThumbJob, publishThumb, setThumbForgeLive,
  dropThumbCache, thumbsWaiting, type PreviewLens,
} from "./armouryThumbs";

/** Accent colour per class — the same table `anim.ts` dresses a warrior from. */
const CLASS_TUNIC: Record<string, number> = {
  huscarl: 0x6a5636,
  warden: 0x5a6630,
  runekeeper: 0x3d3a5c,
  berserker: 0x6e2b26,
};

// ---------------------------------------------------------------------------
// Lenses
// ---------------------------------------------------------------------------

/**
 * Default bearing per lens, in radians about the mannequin's own axis.
 *
 * −35° for anything worn on the head: dead-on is a passport photograph and a
 * brow ridge, a cheek plate and a nasal all vanish in it. The cloak turns
 * nearly to its back, because the garment is on the back and a shop that sold
 * it front-on would be hiding it.
 */
const LENS_BEARING: Record<PreviewLens, number> = {
  face: -0.61,
  bust: -0.61,
  figure: 2.36,
  fight: -0.42,
};

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
const LENS: Record<Exclude<PreviewLens, "fight">, LensFrame> = {
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
 * A vertical gradient standing in for the hall behind the mannequin: garnet
 * embers at the floor going to near black at the top. Generated, like
 * everything else in this project — VISUAL-BAR §4, no binary assets.
 */
function backdropTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.00, "#05060a");
  grad.addColorStop(0.46, "#0b0a0d");
  grad.addColorStop(0.78, "#1d1113");
  grad.addColorStop(1.00, "#2e1a14");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
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
    key.shadow.radius = q.softShadows ? 3 : 1;
  }
  g.add(key, key.target);
  // RIM — cool, off the far shoulder, three-quarters behind and LEVEL with the
  // chest. Hung above, its cone lands on the ground behind him as a blue
  // puddle; level, it grazes an edge and dies. summary.ts paid for that in
  // captures and there is no reason to pay for it twice.
  const rim = new THREE.SpotLight(0x9ec6ff, 62, 7, 0.40, 0.5, 2);
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

/** A log pile that burns, for the fight lens. Four cylinders and some coals. */
function buildFire(materials: MaterialLibrary): { group: THREE.Group; light: THREE.PointLight } {
  const g = new THREE.Group();
  const logGeo = new THREE.CylinderGeometry(0.075, 0.09, 1.5, 7);
  const logMat = materials.get("bonfireLog");
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const log = new THREE.Mesh(logGeo, logMat);
    log.position.set(Math.sin(a) * 0.2, 0.45, Math.cos(a) * 0.2);
    log.rotation.set(Math.cos(a) * 0.5, -a, Math.sin(a) * 0.5);
    log.castShadow = false;
    g.add(log);
  }
  const coalGeo = new THREE.IcosahedronGeometry(0.11, 0);
  const coalMat = materials.get("bonfireFlame");
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const coal = new THREE.Mesh(coalGeo, coalMat);
    coal.position.set(Math.sin(a) * 0.22, 0.25 + (i % 3) * 0.14, Math.cos(a) * 0.22);
    coal.scale.setScalar(0.7 + (i % 4) * 0.14);
    g.add(coal);
  }
  const light = new THREE.PointLight(0xff9a44, 34, 16, 2);
  light.position.set(0, 0.9, 0);
  g.add(light);
  return { group: g, light };
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
  const ground = new THREE.Mesh(new THREE.CircleGeometry(11, 64), materials.get("ground"));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = quality.shadows;
  arena.add(ground);

  const fireBits = buildFire(materials);
  // Inside the fight lens's own frame, and behind him: at 7 m with the panel's
  // crop the frame is about 3 m across at the subject, so a hearth any further
  // out is a light source the player is told about and never sees.
  fireBits.group.position.set(1.32, 0, -1.85);
  fireBits.group.visible = false;
  arena.add(fireBits.group);

  // The plinth: a shallow gilt ring set into the ground. It is the one piece of
  // furniture the shop gets, and it exists so the portrait lenses read as a
  // staging rather than as a man standing in a field.
  const plinth = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.02, 1.10, 64),
    materials.tinted("bronze", 0xb8862a, { roughness: 0.34, metalness: 1, tile: 0.06 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.006;
  plinth.add(ring);
  scene.add(plinth);

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
    arena, plinth, fire: fireBits.group, fireLight: fireBits.light,
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
  f.backdrop.dispose();
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
}

export interface StageHandle {
  /** The canvas is live and the first frame is on screen. */
  readonly ready: boolean;
  setLoadout(next: StageLoadout): void;
  setLens(lens: PreviewLens): void;
  /** Adds to the turntable, in radians. The player's drag lands here. */
  turnBy(delta: number): void;
  /** Absolute turntable bearing, for a reset control. */
  setTurn(radians: number): void;
  readonly turn: number;
  dispose(): void;
}


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
  let lens: PreviewLens = "face";
  let loadout = initial;
  let turn = LENS_BEARING.face;
  let ready = false;
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
    // Re-aimed here and not only on resize: every framing decision in this
    // file is a fraction of the crown, and the berserker's crown is 90 mm
    // above the runekeeper's. Without this the lens keeps the last man's
    // height and the class picker crops one of the four at the eyebrows.
    if (sized.w) frameCamera(sized.w, sized.h);
  }

  buildRig();

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
      camera.lookAt(0, 0.92, 0);
    } else {
      const L = LENS[lens];
      camera.fov = L.fov;
      const aim = crown * L.aim + L.rise;
      // Solve the distance that puts exactly `height` metres across the frame's
      // SHORT axis, so a phone in portrait and a desktop panel both keep the
      // whole subject rather than the desktop keeping more of him.
      const vertical = aspect >= 1 ? L.height : L.height / Math.max(0.55, aspect);
      const dist = (vertical / 2) / Math.tan((camera.fov * Math.PI) / 360);
      camera.position.set(0, aim + (lens === "figure" ? 0.06 : 0.0), dist);
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
    const carried = lens === "figure" || lens === "fight";
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
    scene.background = fight ? new THREE.Color(0x2b3a4e) : forge.backdrop;
    // The three-point rig is a shop rig. At fight distance the man has to be
    // lit by the arena, so the key drops to a quarter and the fire takes over.
    forge.key.intensity = fight ? 7 : 26;
    forge.rim.intensity = fight ? 26 : 62;
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
    }
    forge.sky.update(dt, ctx);
    if (lens === "fight") {
      // A fire is never still, and a still one reads as a lamp.
      const f = 0.86 + Math.sin(clock * 11.3) * 0.07 + Math.sin(clock * 4.1) * 0.06;
      forge.fireLight.intensity = 34 * f;
    }

    // The thumbnail forge borrows the bottom-left corner of this same frame
    // before the mannequin is drawn over it — see `pumpThumbs`.
    pumpThumbs(forge, camera);

    renderer.setViewport(0, 0, w, h);
    renderer.setScissorTest(false);
    renderOnce();
    ready = true;
    STATS.frames++;
    STATS.worstFrameMs = Math.max(STATS.worstFrameMs, performance.now() - t);
    if ((STATS.frames & 15) === 0) publishStats();
  };
  raf = requestAnimationFrame(loop);

  STATS.tier = forge.quality.tier;
  publishStats();
  setThumbForgeLive(true);

  return {
    get ready() { return ready; },
    get turn() { return turn; },
    setLoadout(next) {
      const same =
        next.warriorClass === loadout.warriorClass &&
        next.faceSeed === loadout.faceSeed &&
        sameAppearance(next.appearance, loadout.appearance);
      loadout = next;
      if (!same) buildRig();
    },
    setLens(next) {
      if (next === lens) return;
      const wasDefault = Math.abs(turn - LENS_BEARING[lens]) < 1e-4;
      lens = next;
      lastTouch = performance.now();
      if (wasDefault) turn = LENS_BEARING[next];
      applyLens();
      frameCamera(sized.w || 1, sized.h || 1);
    },
    turnBy(delta) { turn += delta; lastTouch = performance.now(); },
    setTurn(radians) { turn = radians; lastTouch = performance.now(); },
    dispose() {
      cancelAnimationFrame(raf);
      setThumbForgeLive(false);
      if (rig) { rig.dispose(); rig = null; }
      if (canvas.parentNode === mount) mount.removeChild(canvas);
      releaseForge();
    },
  };
}

function sameAppearance(a: Appearance, b: Appearance): boolean {
  return a.helm === b.helm && a.hairStyle === b.hairStyle && a.hairColor === b.hairColor
    && a.beardStyle === b.beardStyle && a.beardColor === b.beardColor
    && a.cloak === b.cloak && a.armorColor === b.armorColor && a.warPaint === b.warPaint;
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

/** Edge of a thumbnail in device pixels. 112 CSS px on a 2x phone is 224. */
const THUMB_PX = 132;

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

let thumbCam: THREE.PerspectiveCamera | null = null;
let thumbBuf: Uint8Array | null = null;
let thumbCanvas: HTMLCanvasElement | null = null;

/**
 * One thumbnail per frame, and never more: each is a full character build plus
 * a synchronous `readPixels`, and a slot of ten taken in one frame is a
 * visible hitch on the frame a player taps a tab.
 */
function pumpThumbs(forge: Forge, live: THREE.PerspectiveCamera): void {
  const job = takeThumbJob();
  if (!job) return;
  const t0 = performance.now();
  const renderer = forge.renderer;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (size.x < THUMB_PX || size.y < THUMB_PX) { returnThumbJob(job); return; }

  if (!thumbCam) thumbCam = new THREE.PerspectiveCamera(24, 1, 0.05, 60);
  if (!thumbBuf) thumbBuf = new Uint8Array(THUMB_PX * THUMB_PX * 4);
  if (!thumbCanvas) {
    thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = thumbCanvas.height = THUMB_PX;
  }

  const ap = job.spec.appearance;
  const cls = job.spec.warriorClass;
  // `medium`, not the tier. A card is 132 px square and a desktop's `high`
  // build is the single most expensive thing this file does — ten of them at
  // one a frame is what made the first capture of this screen come back with
  // three cards filled in and seven spinners. `low` is refused because it
  // drops the head to 14x10 sampling rows, and six of the eight slots in this
  // shop sell something on a face.
  const built = buildCharacter(
    cls, ap, CLASS_TUNIC[cls] ?? 0x5a4a2c, forge.materials, "medium", job.spec.faceSeed,
  );
  const subject = built.group;
  const lens = SLOT_LENS[job.spec.slot] ?? "face";
  subject.rotation.y = LENS_BEARING[lens === "fight" ? "face" : lens];
  subject.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; }
  });
  forge.scene.add(subject);

  const top = new THREE.Box3().setFromObject(subject).max.y || 1.78;
  const L = LENS[lens === "fight" ? "figure" : lens];
  thumbCam.fov = L.fov;
  const aim = top * L.aim + L.rise;
  const dist = (L.height / 2) / Math.tan((L.fov * Math.PI) / 360);
  thumbCam.position.set(0, aim, dist);
  thumbCam.lookAt(0, aim, 0);
  thumbCam.updateProjectionMatrix();

  // A card is a card, not a diorama: no ground, no plinth, no sky behind the
  // item, so ten of them read as ten objects rather than as ten photographs of
  // the same field.
  // A card is a card, not a diorama. Everything in the scene that is not this
  // one object and the lights on it goes dark for the duration — including the
  // live mannequin, which `createWarriorRig` parents straight to the scene.
  const bg = forge.scene.background;
  forge.scene.background = null;
  const hidden: THREE.Object3D[] = [];
  for (const c of forge.scene.children) {
    if (c === subject || c === forge.lights) continue;
    if (c.visible) { hidden.push(c); c.visible = false; }
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
  hidden.forEach((o) => { o.visible = true; });
  forge.scene.remove(subject);
  // `characters.ts` shares merged geometry between builds and patches
  // `dispose()` on every cached buffer to decrement its own refcount — so this
  // walk is a RELEASE, not a free, and skipping it is the leak.
  built.reassemble();
  subject.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry?.dispose();
  });
  void live;

  // GL reads bottom-up; a canvas is top-down.
  const g2 = thumbCanvas.getContext("2d")!;
  const img = g2.createImageData(THUMB_PX, THUMB_PX);
  const row = THUMB_PX * 4;
  for (let y = 0; y < THUMB_PX; y++) {
    const src = (THUMB_PX - 1 - y) * row;
    img.data.set(thumbBuf.subarray(src, src + row), y * row);
  }
  g2.putImageData(img, 0, 0);
  let url = "";
  try { url = thumbCanvas.toDataURL("image/webp", 0.82); } catch { url = ""; }
  if (!url || url.length < 64 || !url.startsWith("data:image/webp")) {
    url = thumbCanvas.toDataURL("image/png");
  }
  publishThumb(job.key, url);
  STATS.thumbs++;
  STATS.worstThumbMs = Math.max(STATS.worstThumbMs, performance.now() - t0);
}

