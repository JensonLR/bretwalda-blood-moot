// The light rig and shadow configuration.
//
// Owns the global rig only: ambient, hemisphere, the moon key with its shadow
// cascade, the shaping fills, the camera-relative separation pair, and the
// hearth pool the bonfire sits inside. The point lights that belong to a torch
// or the bonfire are built with those props in world.ts, because a light that
// can drift away from the flame it comes from is a bug waiting to happen.
//
// The rig's job in this frame is a specific one and worth stating: sky.ts is
// putting 4.4 units of linear radiance on the horizon and the arena has to hold
// its own against that. Under the v1 numbers it did not — a warrior's mail came
// back at 0.03, a hundred and fifty times darker than the air behind him, which
// is why the captures read as black cut-outs against an orange wall and why the
// distant huts vanished into haze that was fifty times brighter than the timber
// it was veiling. So the levels here are large on purpose, and the light count
// is small on purpose. postfx.ts carries its white point out at seven linear
// units precisely so this rig can push without the ground coming back as blown
// cream.
//
// ---------------------------------------------------------------------------
// Why v2 still lost the warriors, measured
// ---------------------------------------------------------------------------
//
// v2 fixed the exposure and the arena, and the warriors were *still* black
// cut-outs. That failure was one number. Summing this rig's contributions as
// irradiance, the turf came back at about 4.3 and the camera-facing side of a
// warrior standing on it at about 0.34 — twelve to one, three and a half stops.
// Every scrap of riveted mail, every scabbard strap and every leg wrap that
// characters.ts had just built was sitting below the grade's toe.
//
// Almost all of that gap was the key hanging at 60°. A warrior is a stack of
// *vertical* surfaces: at 60° the key puts 0.87 of itself into the ground plane
// and 0.50 into a torso, and — worse — it puts its specular lobe somewhere only
// the sky can see. Mail is metalness 0.85, so it has essentially no diffuse
// response at all; it is a mirror with a dark tint, and a mirror lit from a
// direction the camera cannot see the reflection of is black. Raising ambient
// would have "fixed" the average and destroyed the form, which is the other
// failure mode and no better.
//
// Three changes close it, and none of them touch ambient or hemisphere:
//
//  1. The key comes down to 37°. Ground irradiance drops about a quarter and a
//     torso facing the key gains three quarters, so the gap closes from both
//     ends — and the specular lobe comes down to where a camera at eye height
//     can see it, which is the whole reason mail now reads as metal.
//  2. The separation lights come down with it. A "rim" at 25° spends a quarter
//     of its energy lighting the turf it is supposed to be separating the
//     warrior *from*; at 7° it spends an eighth, and the rest lands on vertical
//     surfaces. Same light, twice the contrast, and the low rake reads as the
//     last of the western sky rather than as a lamp.
//  3. A bounce fill arrives from *below*. Ground bounce is real, it is the only
//     thing lighting the underside of a jaw or a shield boss, and because its
//     direction has a negative vertical component a directional light cannot
//     add a single unit to an up-facing ground normal. It is the one fill that
//     lifts the warrior and provably cannot lift the turf with him.
//
// The result is roughly 5:1 rather than 12:1 on the shadowed side and about
// parity on the key side. Still two and a half stops of separation, so it still
// reads as dusk; enough response that the substances survive the grade.

import * as THREE from "three";
import type { FrameContext, Mood, QualitySettings } from "./quality";

export interface LightingHandle {
  readonly root: THREE.Group;
  /** The moon. Every shadow in the arena comes from this one light. */
  readonly key: THREE.DirectionalLight;
  readonly ambient: THREE.AmbientLight;
  /**
   * Points the hearth pool at the arena's real main fire, given its position on
   * the ground. Mirrors sky.ts's `setHazeLight`: without it the pool sits at a
   * documented default — the arena origin, where world.ts puts the bonfire —
   * and the frame is right, it just stops being right if the bonfire moves.
   */
  setHearth(at: THREE.Vector3 | null): void;
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
 * be heard over the environment rather than to hide behind it — and they are
 * carried forward from v2 unchanged, because the v2 defect was the *direction*
 * of the rig, not the size of its indirect term, and raising these to paper over
 * a directional problem is the mistake this pass exists to not make.
 */
interface MoodRig {
  ambient: number;
  ambientColor: number;
  hemi: number;
  hemiSky: number;
  hemiGround: number;
  key: number;
  /** The low sun, raking the west side. Shadowless, so it can sit very low. */
  warm: number;
  /** Camera-relative back light, swung left. Cuts the silhouette out of the sky. */
  rim: number;
  rimColor: number;
  /** Camera-relative back light, swung right and warmer. The fire's side of it. */
  kick: number;
  kickColor: number;
  /** Turf bounce, from below the subject. The only fill on the camera-facing planes. */
  bounce: number;
  bounceColor: number;
  /** The bonfire as an area source: candela, and how far its window reaches. */
  hearth: number;
  hearthColor: number;
  hearthRange: number;
}

const MOOD_RIG: Record<Mood, MoodRig> = {
  // The hemisphere's ground half is not a fudge and is not small: it is the
  // turf's own bounce, it is the only warm light reaching the underside of a
  // shield or a jaw, and it is what stops a cool sky fill this size turning the
  // whole arena grey — which is the failure mode on the other side of the one
  // being fixed here. The `bounce` directional below is its specular half:
  // HemisphereLight in three feeds indirect *diffuse* only, and diffuse is the
  // one channel mail does not have.
  dusk: {
    ambient: 0.85,
    ambientColor: 0x6a86a0,
    hemi: 0.62,
    hemiSky: 0x8fb4d2,
    hemiGround: 0x7a5a3c,
    key: 4.2,
    warm: 1.15,
    rim: 3.2,
    rimColor: 0x9ec8ff,
    kick: 1.7,
    kickColor: 0xffbe8c,
    // Olive rather than gold on purpose. This is light off wet turf, it is the
    // largest single term on a warrior's front, and making it warm would be a
    // third orange source in a frame already fighting a sepia cast. A green-grey
    // fill against an orange sky is also the cheapest separation there is.
    bounce: 1.7,
    bounceColor: 0x9a9c7e,
    hearth: 30,
    hearthColor: 0xff7a2e,
    hearthRange: 20,
  },
  // The moot is burning: the moon is smothered, the fires take the arena over,
  // and what is left of the sky fill goes ember. The rim stays cool and only
  // dims — it is the last thing keeping a warrior off the background, and a last
  // stand that cannot be read is not dramatic, it is broken. The kick and the
  // hearth are the two that go up, because in this mood the fire *is* the key.
  lastStand: {
    ambient: 0.55,
    ambientColor: 0x8a6046,
    hemi: 0.4,
    hemiSky: 0xa87a54,
    hemiGround: 0x7d4526,
    key: 2.4,
    warm: 2.0,
    rim: 2.2,
    rimColor: 0x8fb0e0,
    kick: 2.4,
    kickColor: 0xff8a3c,
    bounce: 1.5,
    bounceColor: 0x8a6a48,
    hearth: 60,
    hearthColor: 0xff5a1a,
    hearthRange: 26,
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
  /** The arena's main fire, on the ground. Same thing `setHearth` sets, earlier. */
  hearth?: THREE.Vector3;
}

/**
 * How far up the light is hung along its direction. Only the angle matters for
 * the shading — but the key's distance is also the depth the shadow frustum is
 * measured from, and it has to clear the whole cascade box at the shallowest
 * elevation the key is allowed to reach. See `SHADOW_NEAR` / `SHADOW_FAR`.
 */
const KEY_DISTANCE = 42;
const WARM_DISTANCE = 14;
const RIM_DISTANCE = 16;
const KICK_DISTANCE = 14;
const BOUNCE_DISTANCE = 10;

/**
 * The dusk moon sits 11° above the horizon and the sun 2°. Aiming the key
 * straight down those vectors is honest and unusable: shadows run five body
 * lengths across the arena, grazing enough to fight the depth bias the whole
 * way. Azimuth is the part a viewer can actually check against the sky, so the
 * azimuth and the hue come from the sky and the elevation stays where the rig
 * wants it.
 *
 * 37° for the key, not v2's 60°. That is the change this pass is built on: at
 * 60° a directional light is a top light, it models the ground and the crown of
 * a helmet and nothing in between, and it throws a 1 m shadow that reads as
 * noon. At 37° it models — a shoulder has a lit top and a dark underside, a
 * hauberk has a gradient down it, the shadow runs 2.4 m and reads as evening —
 * and the specular lobe on a vertical surface lands within a few degrees of the
 * horizon, which is where the camera is.
 *
 * 17° for the warm fill, because it casts no shadow and therefore has no bias to
 * fight, and a low warm rake across the west side of everything vertical in the
 * frame is exactly what the last of a sunset does.
 */
const KEY_MIN_ELEVATION = 0.6;
const FILL_MIN_ELEVATION = 0.3;

/**
 * The separation pair, as elevation and as bearing measured from straight behind
 * the subject.
 *
 * Both elevations are deliberately tiny. A directional light's contribution to
 * the turf is exactly its elevation (the ground normal is up, so N·L *is* sin of
 * the elevation) and its contribution to a silhouette edge is the flat component
 * times the sine of its bearing. At v2's 0.42 the rim gave the ground 42% of
 * itself while giving an edge 52% — barely a contrast win, and the reason the
 * rim never read. At 0.13 the ground gets 13% and the edge 60%. Nothing about
 * the light changed except where it hangs.
 *
 * The bearings differ in magnitude as well as sign so the two do not read as one
 * symmetrical pair of headlights: the cool rim sits closer to straight behind,
 * the warm kick swings wide enough to catch a jaw and a forearm.
 */
const RIM_ELEVATION = 0.13;
const RIM_SWING = 0.66;
const KICK_ELEVATION = 0.19;
const KICK_SWING = -0.92;

/**
 * Turf bounce: in front of the subject and *below* the horizon, kicked slightly
 * to the kick's side so it does not sit on the camera axis and read as a flash.
 * The negative elevation is the whole point — it is what makes this a fill that
 * cannot touch the ground it is bouncing off.
 */
const BOUNCE_ELEVATION = -0.4;
const BOUNCE_SWING = Math.PI - 0.42;

/** How high above the fire's base the hearth pool hangs, in metres. */
const HEARTH_HEIGHT = 1.2;

/**
 * The cascade. `settings.shadowDistance` stops being the extent and becomes a
 * *ceiling* on it, because the extent that matters is whichever one keeps a
 * shadow texel small enough to resolve a warrior. 2 cm is the target: a boot is
 * ten texels across at that density and a sword arm is four, which is the point
 * at which a cast shadow stops being a smear. The floor is what a brawl needs —
 * eight warriors and the ground they are standing on, either side of the focus.
 *
 * medium was the tier this fixed: 1024 over a 24 m half-extent is a 4.7 cm
 * texel, and every contact edge in the frame was two texels of mush.
 */
const SHADOW_TARGET_TEXEL = 0.02;
const SHADOW_MIN_HALF = 12;

/**
 * Depth bias expressed in metres and converted, because a bias in normalised
 * depth means nothing until you know the frustum it is normalised against, and
 * this module changes that frustum per tier.
 */
const SHADOW_BIAS_METRES = 0.013;
/**
 * normalBias is the offset that does the real work — measured along the surface
 * normal, in world units, so it scales with texel size rather than with the
 * tier's name. The cap is a peter-panning guard: the low tier's 512² map over a
 * 12 m half-extent wants 8 cm of offset to stay free of acne, and 8 cm of offset
 * at a 37° key detaches a boot's shadow by 10 cm, which is visible. 5 cm keeps
 * contact attached and eats some acne on the one tier whose shadows are hard and
 * coarse anyway.
 */
const SHADOW_NORMAL_BIAS_CAP = 0.05;

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

  // ---- the key, and the only shadow in the arena ----
  const key = new THREE.DirectionalLight(KEY_BASE.getHex(), rig.key);
  key.position.set(12, 26, 9);
  key.target.position.set(0, 0, 0);
  root.add(key.target);
  key.castShadow = settings.shadows;
  key.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);

  const half = Math.min(
    settings.shadowDistance,
    Math.max(SHADOW_MIN_HALF, settings.shadowMapSize * SHADOW_TARGET_TEXEL * 0.5),
  );
  key.shadow.camera.left = -half;
  key.shadow.camera.right = half;
  key.shadow.camera.top = half;
  key.shadow.camera.bottom = -half;
  // near/far are along the light axis, and the box's *lateral* extent projects
  // back onto that axis whenever the axis is not vertical: at the 37° floor a
  // point on the box edge sits up to half/sin(37°) ≈ 1.66·half along the ground,
  // which is 1.33·half of axial offset. 42 m of hang clears that for the widest
  // half-extent any tier asks for, with room for an 8 m tree on top.
  const SHADOW_NEAR = 1;
  const SHADOW_FAR = KEY_DISTANCE + half * 1.4 + 14;
  key.shadow.camera.near = SHADOW_NEAR;
  key.shadow.camera.far = SHADOW_FAR;
  // One shadow texel in metres, which is the only sane unit for the biases and
  // for the texel snap in trackShadow.
  const texel = (2 * half) / Math.max(1, settings.shadowMapSize);
  key.shadow.bias = -(SHADOW_BIAS_METRES / (SHADOW_FAR - SHADOW_NEAR));
  key.shadow.normalBias = Math.min(texel * 1.7, SHADOW_NORMAL_BIAS_CAP);
  root.add(key);

  // ---- the low warm rake, standing in for the sunset and the fire's bounce ----
  const warmFill = new THREE.DirectionalLight(WARM_BASE.getHex(), rig.warm);
  warmFill.position.set(-9, 7, -8);
  warmFill.target.position.set(0, 0, 0);
  root.add(warmFill.target);
  root.add(warmFill);

  // ---- the separation pair ----
  //
  // The reason a warrior is legible at all against a sky four times his own
  // brightness. Both are camera-relative — re-hung behind the focus point every
  // frame — which is a cheat, and a deliberate one: a world-fixed rim only
  // separates the silhouette from one bearing, and the capture presets and a
  // player's own yaw between them cover every other. Neither casts a shadow.
  //
  // It is a cheat that costs the frame almost nothing in coherence, which is
  // worth spelling out because it looks worse than it is. A directional light's
  // contribution to the turf is its elevation and nothing else — turning the
  // camera cannot change it, so the ground does not breathe as the player spins.
  // What swings is the lit side of everything vertical, and the near-horizontal
  // rake means the faces that gain are the ones pointing away from the viewer.
  const rim = new THREE.DirectionalLight(rig.rimColor, rig.rim);
  rim.position.set(0, 8, -14);
  rim.target.position.set(0, 0, 0);
  root.add(rim.target);
  root.add(rim);

  // The warm half of the pair, and the one light in the rig that a phone does
  // not get. It folds into the rim below rather than disappearing, because low
  // and medium drop *effects* and silhouette separation is art direction — but
  // the punctual loop is per-fragment and this rig already runs it twelve times
  // on high (five directional, the hearth, and world.ts's bonfire and five
  // torches). Medium is the phone tier; it gets the four directionals that carry
  // the read, and buys the warm side of the silhouette back with a single rim
  // swung closer to straight behind, where one light cuts both edges weakly
  // instead of one edge well.
  const kick = settings.tier === "high"
    ? new THREE.DirectionalLight(rig.kickColor, rig.kick)
    : null;
  if (kick) {
    kick.position.set(0, 6, 12);
    kick.target.position.set(0, 0, 0);
    root.add(kick.target);
    root.add(kick);
  }
  /** What a single-rim tier inherits from the kick it does not get. */
  const KICK_FOLD = 0.55;
  /** …and it comes round towards straight behind to cut both edges, not one. */
  const rimSwing = kick ? RIM_SWING : RIM_SWING * 0.72;

  // ---- turf bounce ----
  //
  // Camera-relative and below the horizon. This is the light that stops a
  // shadowed hauberk going to black, and the only one in the rig that is
  // structurally incapable of brightening the ground it is bouncing off, because
  // an up-facing normal against a downward light direction clamps to zero.
  const bounce = new THREE.DirectionalLight(rig.bounceColor, rig.bounce);
  bounce.position.set(0, -4, 9);
  bounce.target.position.set(0, 0, 0);
  root.add(bounce.target);
  root.add(bounce);

  // ---- the hearth pool ----
  //
  // world.ts owns the bonfire's light and should: it is the flicker source and
  // it has to follow the prop. What it cannot be is the *pool*, because it is
  // modelled as a point — 4 candela at the flame — and a bonfire two metres
  // across is an area source whose near field is far gentler and far stronger
  // than a point of the same total power. At three metres world's light delivers
  // 0.4 against a 4.2 key; the fire that a warrior is standing next to should be
  // beating the moon there, not losing to it by an order of magnitude, and in
  // every v2 capture a man an arm's length from the bonfire caught none of it.
  //
  // So the rig carries the pool: inverse-square with a windowed cutoff, graded
  // by mood with the rest of the rig, breathing on a slower beat than world's
  // flicker because a bed of coals does not flutter like a tongue of flame. It
  // casts no shadow — six cube faces for a light with a stone ring round it is
  // not a trade worth making.
  const hearth = new THREE.PointLight(rig.hearthColor, rig.hearth, rig.hearthRange, 2);
  const hearthAt = (opts.hearth ?? new THREE.Vector3()).clone();
  hearth.position.set(hearthAt.x, hearthAt.y + HEARTH_HEIGHT, hearthAt.z);
  root.add(hearth);

  scene.add(root);

  const scratch = new THREE.Vector3();
  const relDir = new THREE.Vector3();
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
   * that light at 37° instead. Keeping the extinction of an elevation we have
   * just thrown away is the inconsistency, so it is undone here: transmittance
   * is exp(-beta*m), so raising the normalised colour to the ratio of the two
   * air masses re-extincts it for the elevation the light is actually at,
   * exactly, without this module needing to know a single scattering
   * coefficient. Folding the light's own base colour in afterwards is what turns
   * the result from a physical measurement into a key light.
   *
   * Dropping the key from 60° to 37° therefore also makes it a little warmer, on
   * its own, for the right reason — a lower moon has crossed more air. That is
   * the model working, not drift, and it is why the elevation and the hue are
   * not two independently tuned numbers.
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
   * Hangs a light at a bearing measured from straight behind the subject and an
   * elevation, in the horizontal frame the camera defines. `swing` of 0 is
   * directly behind the focus from the camera's point of view, ±π/2 is beside
   * it, ±π is between the camera and the subject — which is where the bounce
   * lives. Elevation may be negative; nothing here casts a shadow, so a light
   * below the ground plane is a legitimate place for a bounce term to come from.
   */
  function placeRelative(
    light: THREE.DirectionalLight,
    camera: THREE.PerspectiveCamera,
    focus: THREE.Vector3,
    swing: number,
    elevation: number,
    distance: number,
  ): void {
    relDir.subVectors(camera.position, focus);
    relDir.y = 0;
    if (relDir.lengthSq() < 1e-6) relDir.set(0, 0, 1);
    relDir.normalize().negate().applyAxisAngle(WORLD_UP, swing);
    const flat = Math.sqrt(Math.max(0, 1 - elevation * elevation));
    relDir.multiplyScalar(flat).setY(elevation);
    // relDir points from the subject towards where the light should hang, so
    // putting the light out along it and aiming back at the subject is what
    // lands the light on the side of the silhouette the camera cannot see.
    light.position.copy(focus).addScaledVector(relDir, distance);
    light.target.position.copy(focus);
  }

  function applyRig(): void {
    ambient.intensity = rig.ambient;
    hemi.intensity = rig.hemi;
    key.intensity = rig.key;
    warmFill.intensity = rig.warm;
    rim.intensity = rig.rim + (kick ? 0 : rig.kick * KICK_FOLD);
    if (kick) kick.intensity = rig.kick;
    bounce.intensity = rig.bounce;
    hearth.intensity = rig.hearth;
    hearth.distance = rig.hearthRange;
  }

  function blendRig(t: number): void {
    const to = MOOD_RIG[mood];
    const m = (a: number, b: number) => a + (b - a) * t;
    rig.ambient = m(blendFrom.ambient, to.ambient);
    rig.hemi = m(blendFrom.hemi, to.hemi);
    rig.key = m(blendFrom.key, to.key);
    rig.warm = m(blendFrom.warm, to.warm);
    rig.rim = m(blendFrom.rim, to.rim);
    rig.kick = m(blendFrom.kick, to.kick);
    rig.bounce = m(blendFrom.bounce, to.bounce);
    rig.hearth = m(blendFrom.hearth, to.hearth);
    rig.hearthRange = m(blendFrom.hearthRange, to.hearthRange);
    ambient.color.setHex(blendFrom.ambientColor).lerp(moodHue.setHex(to.ambientColor), t);
    hemi.color.setHex(blendFrom.hemiSky).lerp(moodHue.setHex(to.hemiSky), t);
    hemi.groundColor.setHex(blendFrom.hemiGround).lerp(moodHue.setHex(to.hemiGround), t);
    rim.color.setHex(blendFrom.rimColor).lerp(moodHue.setHex(to.rimColor), t);
    kick?.color.setHex(blendFrom.kickColor).lerp(moodHue.setHex(to.kickColor), t);
    bounce.color.setHex(blendFrom.bounceColor).lerp(moodHue.setHex(to.bounceColor), t);
    hearth.color.setHex(blendFrom.hearthColor).lerp(moodHue.setHex(to.hearthColor), t);
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

    setHearth(at) {
      if (at) hearthAt.copy(at);
      else hearthAt.set(0, 0, 0);
      hearth.position.set(hearthAt.x, hearthAt.y + HEARTH_HEIGHT, hearthAt.z);
    },

    setMood(next) {
      if (next === mood) return;
      mood = next;
      // Blend from where the lights actually are, not from the mood we were
      // nominally in: a second mood change mid-transition has to pick up the
      // half-way colours or the frame snaps. The rim's intensity is read back
      // off `rig` rather than off the light, because on a single-rim tier the
      // light is carrying the kick's fold as well and reading it would compound
      // it on every mood change.
      blendFrom = {
        ...rig,
        ambientColor: ambient.color.getHex(),
        hemiSky: hemi.color.getHex(),
        hemiGround: hemi.groundColor.getHex(),
        rimColor: rim.color.getHex(),
        kickColor: kick ? kick.color.getHex() : rig.kickColor,
        bounceColor: bounce.color.getHex(),
        hearthColor: hearth.color.getHex(),
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
      placeRelative(rim, ctx.camera, ctx.focus, rimSwing, RIM_ELEVATION, RIM_DISTANCE);
      if (kick) {
        placeRelative(kick, ctx.camera, ctx.focus, KICK_SWING, KICK_ELEVATION, KICK_DISTANCE);
      }
      placeRelative(bounce, ctx.camera, ctx.focus, BOUNCE_SWING, BOUNCE_ELEVATION, BOUNCE_DISTANCE);

      // The pool breathes rather than flickers: three slow terms, none of them
      // on world.ts's 9.3 Hz beat, so the two do not beat against each other and
      // produce a visible pulse. Written after the blend, so a mood change moves
      // the amplitude it is applied to rather than fighting it.
      const t = ctx.time;
      const breath = 1
        + Math.sin(t * 3.7) * 0.1
        + Math.sin(t * 6.1 + 1.7) * 0.055
        + Math.sin(t * 11.9 + 0.4) * 0.03;
      hearth.intensity = rig.hearth * breath;
    },

    dispose() {
      scene.remove(root);
      key.shadow.dispose();
      ambient.dispose();
      hemi.dispose();
      key.dispose();
      warmFill.dispose();
      rim.dispose();
      kick?.dispose();
      bounce.dispose();
      hearth.dispose();
    },
  };
}
