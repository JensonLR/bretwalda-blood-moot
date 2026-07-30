// The light rig and shadow configuration.
//
// Owns the global rig only: ambient, hemisphere, the moon key with its shadow
// cascade, and the two directional fills that shape the silhouettes. The point
// lights that belong to a torch or the bonfire are built with those props in
// world.ts, because a light that can drift away from the flame it comes from is
// a bug waiting to happen.
//
// The rig's job in this frame is a specific one and worth stating: sky.ts is
// putting 4.4 units of linear radiance on the horizon and the arena has to hold
// its own against that. Under the v1 numbers it did not — a warrior's mail came
// back at 0.03, a hundred and fifty times darker than the air behind him, which
// is why the captures read as black cut-outs against an orange wall and why the
// distant huts vanished into haze that was fifty times brighter than the timber
// it was veiling. So the levels here are large on purpose, and the light count
// is unchanged — this costs no shader permutation and no extra draw. postfx.ts
// carries its white point out at seven linear units precisely so this rig can
// push without the ground coming back as blown cream.

import * as THREE from "three";
import type { FrameContext, Mood, QualitySettings } from "./quality";

export interface LightingHandle {
  readonly root: THREE.Group;
  /** The moon. Every shadow in the arena comes from this one light. */
  readonly key: THREE.DirectionalLight;
  readonly ambient: THREE.AmbientLight;
  setMood(mood: Mood): void;
  update(dt: number, ctx: FrameContext): void;
  dispose(): void;
}

/**
 * Everything the mood moves. Blended, never cut, on the same 1.4 s as sky.ts
 * and postfx.ts, so the air, the light and the grade arrive together.
 *
 * The single most consequential numbers here are the ambient and hemisphere.
 * They were 0.3/0.2 in v1 — cut back that far when the PMREM landed, on the
 * theory that the environment map was now the physical sky-light term and these
 * two were a fudge that would double up. The theory was right and the size of
 * the cut was wrong, because of what the environment map actually *is*: a
 * convolution of a dome whose energy is almost entirely in one orange band near
 * the sun. It is not sky light, it is sunset light, and it arrives at a hue of
 * roughly 1 : 0.3 : 0.1. Left as the only indirect term it lit every shadow in
 * the arena with the same orange as the highlights, and the grade's per-channel
 * curve then finished the job by taking what little blue survived down to zero.
 * These two are what put the cool half of the frame back, so they are sized to
 * be heard over the environment rather than to hide behind it.
 */
interface MoodRig {
  ambient: number;
  ambientColor: number;
  hemi: number;
  hemiSky: number;
  hemiGround: number;
  key: number;
  /** The low sun, standing in for firelight bounce off the west side. */
  warm: number;
  /** Camera-relative back light. The one thing that cuts a warrior out of the sky. */
  rim: number;
  rimColor: number;
}

const MOOD_RIG: Record<Mood, MoodRig> = {
  // The hemisphere's ground half is not a fudge and is not small: it is the
  // turf's own bounce, it is the only warm light reaching the underside of a
  // shield or a jaw, and it is what stops a cool sky fill this size turning the
  // whole arena grey — which is the failure mode on the other side of the one
  // being fixed here.
  dusk: {
    ambient: 0.85,
    ambientColor: 0x6a86a0,
    hemi: 0.62,
    hemiSky: 0x8fb4d2,
    hemiGround: 0x7a5a3c,
    key: 3.9,
    warm: 0.8,
    rim: 2.0,
    rimColor: 0x9ec8ff,
  },
  // The moot is burning: the moon is smothered, the fires take the arena over,
  // and what is left of the sky fill goes ember. The rim stays cool and only
  // dims — it is the last thing keeping a warrior off the background, and a
  // last stand that cannot be read is not dramatic, it is broken.
  lastStand: {
    ambient: 0.55,
    ambientColor: 0x8a6046,
    hemi: 0.4,
    hemiSky: 0xa87a54,
    hemiGround: 0x7d4526,
    key: 2.2,
    warm: 1.7,
    rim: 1.35,
    rimColor: 0x8fb0e0,
  },
};

/** Matches sky.ts and postfx.ts, so the whole frame changes mood as one thing. */
const MOOD_BLEND = 1.4;

export interface LightingOptions {
  /**
   * Where the sky put the moon and the sun, as unit vectors. The rig reads them
   * live and re-aims every frame, so `setTimeOfDay` moving the bodies moves the
   * shadows with them. Without this the key comes from a corner of the sky with
   * nothing in it and the moon is visibly somewhere else.
   */
  key?: THREE.Vector3;
  keyColor?: THREE.Color;
  warm?: THREE.Vector3;
  warmColor?: THREE.Color;
}

/** How far up the light is hung along its direction. Only the angle matters. */
const KEY_DISTANCE = 30;
const WARM_DISTANCE = 14;
const RIM_DISTANCE = 16;

/**
 * The dusk moon sits 11° above the horizon and the sun 2°. Aiming the key
 * straight down those vectors is honest and unusable: shadows run five body
 * lengths across the arena, grazing enough to fight the depth bias the whole
 * way. Azimuth is the part a viewer can actually check against the sky, so the
 * azimuth and the hue come from the sky and the elevation stays where the
 * hand-placed rig had it — 60° for the key, 30° for the warm fill.
 */
const KEY_MIN_ELEVATION = 0.866;
const FILL_MIN_ELEVATION = 0.5;

/** Rim elevation and how far round from straight behind it is swung. */
const RIM_ELEVATION = 0.42;
const RIM_SWING = 0.62;

/** Relative air mass along a ray leaving the ground. Mirrors sky.ts. */
function airMass(cosZenith: number): number {
  const c = Math.max(cosZenith, 0);
  return 1 / (c + 0.025 * Math.exp(-11 * c));
}

export function createLighting(
  scene: THREE.Scene,
  settings: QualitySettings,
  opts: LightingOptions = {},
): LightingHandle {
  const root = new THREE.Group();
  root.name = "lighting";

  const rig: MoodRig = { ...MOOD_RIG.dusk };
  let blendFrom: MoodRig = { ...rig };
  let mood: Mood = "dusk";
  let blend = 1;

  const ambient = new THREE.AmbientLight(rig.ambientColor, rig.ambient);
  root.add(ambient);

  const hemi = new THREE.HemisphereLight(rig.hemiSky, rig.hemiGround, rig.hemi);
  root.add(hemi);

  // The key's own colour, before the sky's hue is folded in. Slightly cool and
  // slightly green-shy, which is what makes it read as moonlight rather than as
  // a white lamp once the split-tone has been over it.
  const KEY_BASE = new THREE.Color(0xd6e2f2);
  // Warmer than white and a long way short of the sun's own colour. The sky
  // hands out a beam that has crossed nineteen air masses, `aim()` multiplies
  // this into it, and at 0xffa85c the product came out at roughly 1 : 0.23 :
  // 0.03 — a pure red floodlight on everything facing west. Firelight bounce is
  // warm; it is not monochromatic.
  const WARM_BASE = new THREE.Color(0xffc98f);

  const key = new THREE.DirectionalLight(KEY_BASE.getHex(), rig.key);
  key.position.set(12, 26, 9);
  key.target.position.set(0, 0, 0);
  root.add(key.target);
  key.castShadow = settings.shadows;
  key.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 70;
  const half = settings.shadowDistance;
  key.shadow.camera.left = -half;
  key.shadow.camera.right = half;
  key.shadow.camera.top = half;
  key.shadow.camera.bottom = -half;
  // One shadow texel in metres, which is the only sane unit for both of these.
  // A constant depth bias big enough to stop acne on a 512² map detaches the
  // boots from their shadow on a 2048² one, so the offset that does the work is
  // normalBias — measured along the surface normal, in world units — and it is
  // derived from the texel size rather than typed in per tier.
  const texel = (2 * half) / Math.max(1, settings.shadowMapSize);
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = texel * 1.6;
  root.add(key);

  // Firelight bounce from the bonfire side.
  const warmFill = new THREE.DirectionalLight(WARM_BASE.getHex(), rig.warm);
  warmFill.position.set(-9, 7, -8);
  warmFill.target.position.set(0, 0, 0);
  root.add(warmFill.target);
  root.add(warmFill);

  // The cold back light, and the reason a warrior is legible at all against a
  // sky four times his own brightness. It is camera-relative — re-hung behind
  // the focus point every frame — which is a cheat, and a deliberate one: a
  // world-fixed rim only separates the silhouette from one bearing, and the
  // capture presets and a player's own yaw between them cover every other. It
  // casts no shadow and it is cool, so it reads as skylight raking the field
  // rather than as a lamp following the player around.
  const rim = new THREE.DirectionalLight(rig.rimColor, rig.rim);
  rim.position.set(0, 8, -14);
  rim.target.position.set(0, 0, 0);
  root.add(rim.target);
  root.add(rim);

  scene.add(root);

  const scratch = new THREE.Vector3();
  const rimDir = new THREE.Vector3();
  /** The key's aimed direction, kept apart from key.position because the shadow
   *  tracking moves the light off the origin and the axis must survive that. */
  const keyAxis = new THREE.Vector3(12, 26, 9).normalize();
  const lightRight = new THREE.Vector3();
  const lightUp = new THREE.Vector3();
  const snapped = new THREE.Vector3();
  const hue = new THREE.Color();
  const moodHue = new THREE.Color();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);

  /**
   * Aims a light down a sky direction and takes the body's hue with it.
   *
   * The hue needs one correction on the way across, and it is the reason the v1
   * frame had no cool light in it anywhere. sky.ts hands out the moon's radiance
   * *after* atmospheric extinction at its true 11° — five air masses, which
   * turns moonlight into (1, 0.73, 0.34), a sunset orange. The rig then hangs
   * that light at 60° instead. Keeping the extinction of an elevation we have
   * just thrown away is the inconsistency, so it is undone here: transmittance
   * is exp(-beta*m), so raising the normalised colour to the ratio of the two
   * air masses re-extincts it for the elevation the light is actually at,
   * exactly, without this module needing to know a single scattering
   * coefficient. Folding the light's own base colour in afterwards is what turns
   * the result from a physical measurement into a key light.
   */
  function aim(
    light: THREE.DirectionalLight,
    base: THREE.Color,
    dir: THREE.Vector3 | undefined,
    color: THREE.Color | undefined,
    distance: number,
    minElevation: number,
    axis?: THREE.Vector3,
  ): void {
    // Without a sky vector there is nothing to re-aim to; the hand-placed
    // direction the light was built with stands, and so does whatever axis the
    // caller is already holding.
    if (dir) {
      scratch.copy(dir);
      if (scratch.y < minElevation) {
        const az = Math.hypot(scratch.x, scratch.z) || 1;
        const want = Math.sqrt(Math.max(0, 1 - minElevation * minElevation));
        scratch.set((scratch.x / az) * want, minElevation, (scratch.z / az) * want);
      }
      light.position.copy(scratch).multiplyScalar(distance);
      axis?.copy(scratch);
    }

    if (!color) return;
    const peak = Math.max(color.r, color.g, color.b);
    if (peak <= 1e-4) return;
    // Only ever thins the extinction: a body already above the elevation floor
    // was not moved, so its colour is left exactly as the sky measured it.
    const thin = dir && dir.y < minElevation
      ? airMass(minElevation) / Math.max(airMass(dir.y), 1e-4)
      : 1;
    hue.setRGB(
      Math.pow(color.r / peak, thin),
      Math.pow(color.g / peak, thin),
      Math.pow(color.b / peak, thin),
      THREE.LinearSRGBColorSpace,
    );
    // Sky hue times the light's own character, renormalised — the sky says what
    // colour the air made it, the base says what kind of light it is, and the
    // rig alone says how bright.
    light.color.copy(base).multiply(hue);
    const lit = Math.max(light.color.r, light.color.g, light.color.b);
    if (lit > 1e-4) light.color.multiplyScalar(1 / lit);
  }

  /**
   * Hangs the shadow frustum on the point of interest instead of the arena
   * origin, and snaps its centre to whole shadow texels along the light's own
   * axes. Without the snap the map re-rasterises against a sub-texel offset
   * every time the camera moves and every contact edge in the frame crawls.
   */
  function trackShadow(focus: THREE.Vector3): void {
    lightRight.copy(WORLD_UP).cross(keyAxis);
    if (lightRight.lengthSq() < 1e-6) lightRight.set(1, 0, 0);
    lightRight.normalize();
    lightUp.copy(keyAxis).cross(lightRight).normalize();

    const r = Math.round(focus.dot(lightRight) / texel) * texel;
    const u = Math.round(focus.dot(lightUp) / texel) * texel;
    const d = focus.dot(keyAxis);
    snapped.copy(lightRight).multiplyScalar(r)
      .addScaledVector(lightUp, u)
      .addScaledVector(keyAxis, d);

    key.target.position.copy(snapped);
    key.position.copy(snapped).addScaledVector(keyAxis, KEY_DISTANCE);
  }

  /**
   * Swings the rim to sit behind the subject from wherever the camera is, kicked
   * round to one side so it lands on a shoulder and a jaw rather than flat on a
   * back and reading as a second key.
   */
  function placeRim(camera: THREE.PerspectiveCamera, focus: THREE.Vector3): void {
    rimDir.subVectors(camera.position, focus);
    rimDir.y = 0;
    if (rimDir.lengthSq() < 1e-6) rimDir.set(0, 0, 1);
    rimDir.normalize().negate().applyAxisAngle(WORLD_UP, RIM_SWING);
    const flat = Math.sqrt(Math.max(0, 1 - RIM_ELEVATION * RIM_ELEVATION));
    rimDir.multiplyScalar(flat).setY(RIM_ELEVATION);
    // rimDir points away from the camera, so hanging the light out along it and
    // aiming back at the subject is what puts the light behind the silhouette
    // rather than on the side of it the camera can already see.
    rim.position.copy(focus).addScaledVector(rimDir, RIM_DISTANCE);
    rim.target.position.copy(focus);
  }

  function applyRig(): void {
    ambient.intensity = rig.ambient;
    hemi.intensity = rig.hemi;
    key.intensity = rig.key;
    warmFill.intensity = rig.warm;
    rim.intensity = rig.rim;
  }

  function blendRig(t: number): void {
    const to = MOOD_RIG[mood];
    const m = (a: number, b: number) => a + (b - a) * t;
    rig.ambient = m(blendFrom.ambient, to.ambient);
    rig.hemi = m(blendFrom.hemi, to.hemi);
    rig.key = m(blendFrom.key, to.key);
    rig.warm = m(blendFrom.warm, to.warm);
    rig.rim = m(blendFrom.rim, to.rim);
    ambient.color.setHex(blendFrom.ambientColor).lerp(moodHue.setHex(to.ambientColor), t);
    hemi.color.setHex(blendFrom.hemiSky).lerp(moodHue.setHex(to.hemiSky), t);
    hemi.groundColor.setHex(blendFrom.hemiGround).lerp(moodHue.setHex(to.hemiGround), t);
    rim.color.setHex(blendFrom.rimColor).lerp(moodHue.setHex(to.rimColor), t);
    applyRig();
  }

  function reaim(): void {
    aim(key, KEY_BASE, opts.key, opts.keyColor, KEY_DISTANCE, KEY_MIN_ELEVATION, keyAxis);
    aim(warmFill, WARM_BASE, opts.warm, opts.warmColor, WARM_DISTANCE, FILL_MIN_ELEVATION);
  }

  applyRig();
  reaim();

  return {
    root,
    key,
    ambient,

    setMood(next) {
      if (next === mood) return;
      mood = next;
      // Blend from where the lights actually are, not from the mood we were
      // nominally in: a second mood change mid-transition has to pick up the
      // half-way colours or the frame snaps.
      blendFrom = {
        ...rig,
        ambientColor: ambient.color.getHex(),
        hemiSky: hemi.color.getHex(),
        hemiGround: hemi.groundColor.getHex(),
        rimColor: rim.color.getHex(),
      };
      blend = 0;
    },

    update(dt, ctx) {
      if (blend < 1) {
        blend = Math.min(1, blend + dt / MOOD_BLEND);
        blendRig(THREE.MathUtils.smootherstep(blend, 0, 1));
      }
      // The sky's vectors are live objects, so re-reading them is what keeps a
      // moving moon and its shadows pointing the same way.
      reaim();
      trackShadow(ctx.focus);
      placeRim(ctx.camera, ctx.focus);
    },

    dispose() {
      scene.remove(root);
      key.shadow.dispose();
      ambient.dispose();
      hemi.dispose();
      key.dispose();
      warmFill.dispose();
      rim.dispose();
    },
  };
}
