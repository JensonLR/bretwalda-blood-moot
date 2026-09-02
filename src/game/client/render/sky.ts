// Sky dome, celestial bodies, atmosphere, and the environment map derived
// from them.
//
// This module owns everything that reads as "the air and what is behind it":
// the dome, the sun and moon, the star field, the cloud deck, scene.fog,
// scene.background, and the PMREM the rest of the renderer reflects. Nothing
// else may write scene.fog — the mood transition has to move fog, dome and
// grade together or the frame comes apart.
//
// The dome is not a painted gradient. A single-scattering model runs per pixel:
// Rayleigh and Mie coefficients, a Henyey-Greenstein phase, and an air-mass
// term, so the ember band, the blue zenith and the sun's corona all fall out of
// one sun direction instead of being lerped between four hand-picked colours.
// Where single scattering is honestly wrong — the sunset zenith, which is blue
// because of second- and third-order scatter this model does not carry — a
// named diffuse illuminant puts it back rather than a fudge buried in a lerp.
//
// The air between the camera and the arena is a *separate* model from the dome,
// and the reason is the whole of what v1 got wrong. The dome's horizon is the
// radiance of an entire atmospheric column — thirty-eight air masses of it, and
// at dusk it arrives at four and a half linear units. v1's fog mixed distant
// geometry toward that number, so a hut at twenty-eight metres came back three
// times brighter than the hut itself and the settlement dissolved. But the air
// on a twenty-eight-metre path is not an atmospheric column: it is ground-level
// haze lit by a beam that has already crossed nineteen air masses and by the
// slice of dome it can see, and its source function is a *fraction* of the
// horizon's radiance. So near air and far sky are two terms here — a mist with
// its own dim, directional glow that owns everything inside the treeline, and a
// sky-convergence term that only takes over past it. That split is what makes
// palisade, huts, hall and treeline read as four planes instead of one wash.

import * as THREE from "three";
import type { FrameContext, Mood, QualitySettings } from "./quality";
import type { MaterialLibrary } from "./materials";

export interface SkyOptions {
  /** Dome radius in metres. Clamped on the first frame to sit inside the camera's far plane. */
  radius?: number;
  /**
   * Dome tessellation. The shader normalises per fragment, so this only bounds
   * how far the interpolated view direction drifts from the true one — at 64×48
   * that is 0.03°, well under the sun's angular radius.
   */
  segments?: { width: number; height: number };
  /**
   * Per-pixel aerial perspective on every fogged material in the scene. See
   * `installAerialPerspective` for what this costs in tidiness and why it is
   * still the right trade. Pass false to fall back to plain exponential fog.
   */
  aerialPerspective?: boolean;
  /** 0 = midnight, 0.25 = sunrise, 0.5 = noon. Defaults to the arena's dusk. */
  timeOfDay?: number;
  /**
   * The point source the near air scatters. Defaults to the bonfire's place at
   * the arena's origin; pass `world.pointLights[0]`'s pose to have it follow a
   * fire that moves, or null for air with nothing burning in it.
   */
  hazeLight?: HazeLight | null;
}

export interface SkyHandle {
  readonly root: THREE.Group;
  /**
   * PMREM of the dome, for every metal in the scene to reflect. Rebaked when
   * the air changes, and pushed into the material library as it is — callers
   * that cached the texture do not need to re-read it, the identity is stable
   * between bakes only within a mood.
   */
  readonly environment: THREE.Texture | null;
  /** Unit vector toward the sun. A warm key light belongs on this axis. */
  readonly sunDirection: THREE.Vector3;
  /** Unit vector toward the moon. Every shadow in the arena should come from here. */
  readonly moonDirection: THREE.Vector3;
  /** Linear radiance of the sun after atmospheric extinction — the colour a key light wants. */
  readonly sunColor: THREE.Color;
  /** Linear radiance of the moon, same idea, and the reason the fills read cold. */
  readonly moonColor: THREE.Color;
  setMood(mood: Mood): void;
  /** Turns the whole celestial sphere about the pole. 0 = midnight, 0.5 = noon. */
  setTimeOfDay(t: number): void;
  /**
   * Moves the fire the near air is scattering, or clears it. The mood owns how
   * bright it is — this is only where it is and what colour, so a caller does
   * not have to know what a radiant intensity in linear units looks like.
   */
  setHazeLight(light: HazeLight | null): void;
  update(dt: number, ctx: FrameContext): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Air
// ---------------------------------------------------------------------------

/**
 * Vertical-column optical depth at 680/550/440 nm, which is the real molecular
 * scattering of Earth's atmosphere integrated over one scale height. Every
 * length in this module is measured in those column-depths ("air masses"), so
 * these numbers are the physics and the mood table only scales them.
 */
const BETA_RAYLEIGH = new THREE.Vector3(0.0465, 0.1085, 0.2645);
/** Aerosols. Nearly grey, and the channel the last stand's smoke pushes on. */
const BETA_MIE = new THREE.Vector3(0.0340, 0.0350, 0.0360);

/** Everything the mood table can move. Lerped, never cut. */
interface SkyParams {
  rayleigh: number;
  mie: number;
  mieG: number;
  sunIntensity: number;
  sunTint: THREE.Color;
  /** How much second-order scatter the model fakes back in. Owns the zenith. */
  diffuseGain: number;
  /** Fraction of the sun's slant path the diffuse term is reddened by. */
  diffuseDepth: number;
  /**
   * How Rayleigh-coloured that scatter is, 0 = white, 1 = the raw β ratio. At 1
   * the zenith goes out of gamut and ACES clips its red to nothing; smoke pulls
   * it toward white, which is most of why the last stand reads hot.
   */
  diffuseSpectrum: number;
  /** Diffuse illuminant still reaching the horizon, where the beam dominates. */
  diffuseFloor: number;
  /** Beam still reaching the anti-solar sky. Above ~0.2 the whole sky goes warm. */
  beamFloor: number;
  moonIntensity: number;
  moonDiscGain: number;
  moonAlbedo: THREE.Color;
  earthshine: number;
  /** Linear floor under the whole dome, so nothing crushes to black. */
  nightSky: THREE.Color;
  /** What the dome folds down to below the horizon — the land, not the sky. */
  groundTint: THREE.Color;
  starGain: number;
  /** How hard sky luminance drowns the stars. Higher = fewer survive dusk. */
  starFade: number;
  cloudCover: number;
  cloudGain: number;
  cloudLitGain: number;
  cloudShadeGain: number;
  /** Radiance of the crepuscular fan above the sun, as a fraction of the beam. */
  shaftGain: number;
  /**
   * Elevation added to the sun's direction, in radians. Zero is the dusk's
   * own horizon sun; the cold mood lifts it behind a closed cloud deck so the
   * slant path stops reddening the beam and the light is the sky's, not a disc's.
   */
  sunLift: number;

  // ---- the near air, in metres and per-metre ----
  // Tuned against the arena's four depth planes, which are fixed by world.ts:
  // palisade at 19.6 m, huts at 28, the hall at 37, the treeline at 60, and the
  // downland running out to 176. Every number below was chosen by asking what
  // fraction of its own radiance each of those keeps.
  /** Extinction per metre of the deep haze at y = 0. This is what separates planes. */
  hazeDensity: number;
  /** e-folding height of that haze. Tall enough that a roof is barely clearer than a door. */
  hazeHeight: number;
  /** Extinction per metre of the shallow ground mist at y = 0. */
  mistDensity: number;
  /** e-folding height of the ground mist. Knee-high, so it pools in the hollows. */
  mistHeight: number;
  /** Single-scatter albedo × the fraction of the dome the near air can actually see. */
  mistAlbedo: number;
  /** How much of the sky *in this direction* the mist borrows on top of that. */
  mistSkyShare: number;
  /** How much of the extinguished beam the near air throws forward. Owns the sun-side glow. */
  mistBeam: number;
  /** Henyey-Greenstein g of the near air. Higher = a tighter halo round the sun. */
  mistG: number;
  /** Extinction per metre of the far term that welds the downland into the horizon. */
  skyDensity: number;
  /** Radiant intensity the near air scatters out of the bonfire. */
  fireHaze: number;
  /** How deep the cloud deck cuts the key light, 0..1. */
  cloudShadow: number;
  /** How much of the sun's share of the mist the deck can take away, 0..1. */
  shaftDepth: number;
  /** Density of the stock exponential fog, which only runs if the injection missed. */
  fogDensity: number;
  /** How much distance drains saturation before it drains contrast. */
  fogDesaturate: number;
}

const DUSK: SkyParams = {
  rayleigh: 1,
  mie: 1,
  mieG: 0.76,
  sunIntensity: 22,
  sunTint: new THREE.Color(1, 0.98, 0.95),
  diffuseGain: 0.11,
  diffuseDepth: 0.16,
  diffuseSpectrum: 0.62,
  diffuseFloor: 0.06,
  beamFloor: 0.05,
  moonIntensity: 0.1,
  moonDiscGain: 2.6,
  moonAlbedo: new THREE.Color(1, 0.97, 0.92),
  earthshine: 0.055,
  nightSky: new THREE.Color(0.01, 0.012, 0.026),
  groundTint: new THREE.Color(0.13, 0.115, 0.105),
  starGain: 3.2,
  starFade: 17,
  cloudCover: 0.58,
  cloudGain: 0.92,
  cloudLitGain: 0.34,
  cloudShadeGain: 1.5,
  shaftGain: 0.13,
  sunLift: 0,
  // 0.006/m over a 24 m scale height puts 10% of haze on the palisade, 14% on
  // the huts, 28% on the treeline and 62% on the downland: a monotone ramp with
  // every plane a clear step behind the one in front. Measured off a 0.3-radiance
  // daub wall forty degrees from the sun, the two terms together hold the huts
  // at 4:1 against the sky behind them and the treeline at 2:1. v1's numbers
  // gave 2.6:1 and 1.2:1, and were finished — wall indistinguishable from sky —
  // by a hundred metres, which is why the settlement had two planes, not five.
  hazeDensity: 0.0048,
  hazeHeight: 24,
  mistDensity: 0.0092,
  mistHeight: 2.6,
  // The near air is dim on purpose, and the v2 captures said it was not dim
  // enough: at 0.30 the mist's own glow put 0.06 linear of pure ember on a
  // surface only eight metres away, which is a third of what a turf albedo
  // returns and is why the whole arena came back one colour. The source
  // function is built from the dome, and a mist layer lying on a dark field
  // sees far less of that dome than a hemisphere weighting implies — there is
  // ground under half of it and the horizon it does see is already extincted.
  // Extinction is untouched, so every distance ratio measured for the layer
  // separation still holds; only what the veil is *made of* got quieter.
  mistAlbedo: 0.13,
  mistSkyShare: 0.05,
  mistBeam: 0.095,
  mistG: 0.62,
  skyDensity: 0.0106,
  fireHaze: 40,
  cloudShadow: 0.42,
  shaftDepth: 0.55,
  fogDensity: 0.021,
  fogDesaturate: 0.5,
};

// The last stand is not dusk with a red filter over it. The air itself changes:
// the moot is burning, so aerosols go up by a factor of three and molecular
// scattering stops mattering. That reddens the beam, kills the blue zenith,
// swallows the stars and thickens the haze — hotter and more desperate as a
// consequence of smoke, not as a tint.
const LAST_STAND: SkyParams = {
  rayleigh: 0.5,
  mie: 3.2,
  mieG: 0.66,
  sunIntensity: 23,
  sunTint: new THREE.Color(1, 0.72, 0.5),
  diffuseGain: 0.1,
  diffuseDepth: 0.26,
  diffuseSpectrum: 0.12,
  diffuseFloor: 0.12,
  beamFloor: 0.22,
  moonIntensity: 0.06,
  moonDiscGain: 1.5,
  moonAlbedo: new THREE.Color(1, 0.74, 0.6),
  earthshine: 0.04,
  nightSky: new THREE.Color(0.03, 0.013, 0.009),
  groundTint: new THREE.Color(0.17, 0.105, 0.085),
  starGain: 0.5,
  starFade: 34,
  cloudCover: 0.44,
  cloudGain: 1,
  cloudLitGain: 0.5,
  cloudShadeGain: 1.1,
  shaftGain: 0.21,
  sunLift: 0,
  // Smoke is heavier than air and it is coming off the arena itself, so the
  // ground layer thickens far more than the column does and it lifts higher —
  // but only by half again on dusk, not by double. At the old numbers a sixth
  // of a surface eight metres away was already smoke and four-fifths of one at
  // twenty-five was, which is why the last-stand captures came back with the
  // turf, the palisade, a hut and a warrior's cloak all landing within five
  // code values of each other. A pall you cannot see a man through is fog, and
  // fog is not the drama this look is after.
  hazeDensity: 0.0072,
  hazeHeight: 30,
  mistDensity: 0.0118,
  mistHeight: 3.6,
  mistAlbedo: 0.13,
  mistSkyShare: 0.08,
  mistBeam: 0.17,
  mistG: 0.56,
  skyDensity: 0.0124,
  // The fires are what is lighting the moot by now, so the air around them
  // carries more than twice the glow — this is where the shafts come from once
  // the sun has stopped mattering.
  fireHaze: 58,
  // A smoke pall is not a cumulus deck: it covers more and shadows less, so the
  // arena goes evenly dim rather than being crossed by hard moving bands.
  cloudShadow: 0.24,
  shaftDepth: 0.34,
  fogDensity: 0.03,
  fogDesaturate: 0.3,
};

/**
 * How much of the dome's own radiance reaches a surface as image-based light.
 *
 * Not 1, and the reason is geometric rather than a taste call. The PMREM is a
 * convolution of the whole sphere, but this arena is a ground plane: half of
 * what that convolution integrated is turf a surface cannot see, and the half it
 * can see is dominated by a horizon band carrying four linear units of ember.
 * At full strength the environment map is the largest indirect term in the
 * frame and it is one colour, which is how the v2 captures came back with turf,
 * timber, thatch and mail all reading as the same salmon. lighting.ts's ambient
 * and hemisphere carry the sky-light term with a hue that has a cool half; this
 * supplies the specular the metals need and its share of the warm.
 */
const ENV_INTENSITY = 0.42;

/**
 * THE COLD SKY (docs/MAPS.md, ground two): low cloud, a pale sun behind it,
 * long low-contrast sightlines with the weather doing the work. Off the dusk
 * table, changing only what an overcast changes — the beam is cooler and
 * weaker, the diffuse term greyer and higher, the cloud nearly closed, the
 * haze deeper so the horizon falls away, the fire's own haze smaller because
 * a peat fire is not a bonfire. The moon and the stars are the dusk's.
 */
const COLD: SkyParams = {
  ...DUSK,
  sunIntensity: 11,
  sunTint: new THREE.Color(0.78, 0.89, 1.0),
  diffuseGain: 0.16,
  diffuseDepth: 0.08,
  diffuseSpectrum: 0.32,
  diffuseFloor: 0.10,
  beamFloor: 0.03,
  nightSky: new THREE.Color(0.012, 0.016, 0.03),
  groundTint: new THREE.Color(0.10, 0.105, 0.105),
  // `cover` in the dome is a smoothstep ABOVE this value, so a LOWER number is
  // more cloud: the dusk's 0.58 is broken cloud and 0.16 is a closed deck.
  cloudCover: 0.14,
  cloudGain: 1.0,
  cloudLitGain: 0.40,
  cloudShadeGain: 0.85,
  shaftGain: 0.02,
  sunLift: 0.30,
  hazeDensity: 0.0076,
  hazeHeight: 30,
  mistDensity: 0.0125,
  mistHeight: 3.2,
  mistAlbedo: 0.16,
  mistSkyShare: 0.12,
  mistBeam: 0.05,
  skyDensity: 0.0118,
  fireHaze: 26,
  cloudShadow: 0.18,
  shaftDepth: 0.3,
  fogDensity: 0.027,
  fogDesaturate: 0.7,
};

const MOOD_PARAMS: Record<Mood, SkyParams> = { dusk: DUSK, lastStand: LAST_STAND, cold: COLD };
/** Seconds for the air to change over. Long enough to read as weather, short enough to land. */
const MOOD_BLEND = 1.4;

// ---------------------------------------------------------------------------
// Celestial geometry
// ---------------------------------------------------------------------------

// The arena's dusk pose, chosen for the frame rather than for an almanac: the
// sun sits 2.4° up and 37° left of the default camera axis, the moon 11.5° up
// and 30° right, both inside the 55°-FOV crop that every capture preset uses.
// Their 67° separation makes a fat waning crescent, which is what puts a
// terminator across the moon's face where its craters can be seen.
const DUSK_SUN = new THREE.Vector3(-0.5989, 0.0419, -0.7997).normalize();
const DUSK_MOON = new THREE.Vector3(0.488, 0.1994, -0.8497).normalize();
const DUSK_TIME = 0.742;

/**
 * Celestial pole for a Wessex latitude. Time of day turns sun, moon and stars
 * about this one axis, which is what the sky actually does, so their relative
 * geometry — and therefore the moon's phase — stays honest for free.
 */
const POLE = new THREE.Vector3(0, Math.sin(0.9076), Math.cos(0.9076)).normalize();

/** Relative air mass along a ray leaving the ground, from its cosine to zenith. */
function airMass(cosZenith: number): number {
  const c = Math.max(cosZenith, 0);
  return 1 / (c + 0.025 * Math.exp(-11 * c));
}

function rayleighPhase(mu: number): number {
  return 0.0596831 * (1 + mu * mu);
}

function miePhase(mu: number, g: number): number {
  const g2 = g * g;
  const d = Math.max(1 + g2 - 2 * g * mu, 1e-4);
  return (0.0795775 * (1 - g2)) / (d * Math.sqrt(d));
}

/** Everything the shader and the fog both need, resolved once per parameter change. */
interface Air {
  betaR: THREE.Vector3;
  betaM: THREE.Vector3;
  betaT: THREE.Vector3;
  mieG: number;
  /** Direct sunlight at the observer, reddened by the whole slant path. */
  sunBeam: THREE.Vector3;
  /** Stand-in for multiply-scattered light: less reddened, and already blue. */
  sunDiffuse: THREE.Vector3;
  moonBeam: THREE.Vector3;
  /** Radiance scale of the moon's own surface, extinction included. */
  moonDisc: THREE.Vector3;
  nightSky: THREE.Vector3;
  beamFloor: number;
  diffuseFloor: number;
}

function expNeg(v: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(Math.exp(-v.x), Math.exp(-v.y), Math.exp(-v.z));
}

function resolveAir(p: SkyParams, sun: THREE.Vector3, moon: THREE.Vector3): Air {
  const betaR = BETA_RAYLEIGH.clone().multiplyScalar(p.rayleigh);
  const betaM = BETA_MIE.clone().multiplyScalar(p.mie);
  const betaT = betaR.clone().add(betaM);

  const mSun = airMass(sun.y);
  const mMoon = airMass(moon.y);
  const tSun = expNeg(betaT.clone().multiplyScalar(mSun), new THREE.Vector3());
  const tMoon = expNeg(betaT.clone().multiplyScalar(mMoon), new THREE.Vector3());

  const tint = new THREE.Vector3(p.sunTint.r, p.sunTint.g, p.sunTint.b);
  const sunBeam = tSun.clone().multiplyScalar(p.sunIntensity).multiply(tint);

  // The diffuse illuminant is light that has already been Rayleigh-scattered,
  // so it carries some of the Rayleigh spectrum, and it reaches a scattering
  // point through a fraction of the beam's slant path. Both of those are why
  // the zenith stays blue while the horizon burns.
  const mean = (betaR.x + betaR.y + betaR.z) / 3 || 1;
  const spectrum = betaR.clone().divideScalar(mean);
  spectrum.set(
    1 + (spectrum.x - 1) * p.diffuseSpectrum,
    1 + (spectrum.y - 1) * p.diffuseSpectrum,
    1 + (spectrum.z - 1) * p.diffuseSpectrum,
  );
  const sunDiffuse = expNeg(betaT.clone().multiplyScalar(mSun * p.diffuseDepth), new THREE.Vector3())
    .multiplyScalar(p.sunIntensity * p.diffuseGain)
    .multiply(spectrum)
    .multiply(tint);

  const moonBeam = tMoon.clone().multiplyScalar(p.moonIntensity);
  const moonDisc = tMoon.clone().multiplyScalar(p.moonDiscGain);

  return {
    betaR,
    betaM,
    betaT,
    mieG: p.mieG,
    sunBeam,
    sunDiffuse,
    moonBeam,
    moonDisc,
    nightSky: new THREE.Vector3(p.nightSky.r, p.nightSky.g, p.nightSky.b),
    beamFloor: p.beamFloor,
    diffuseFloor: p.diffuseFloor,
  };
}

/**
 * CPU mirror of `atmosphere()` in the fragment shader. It exists because the
 * fog needs three representative sky colours and reading them back off the GPU
 * costs more than recomputing them. The two must be changed together — that is
 * the one maintenance debt in this file.
 */
function evalSky(
  dir: THREE.Vector3,
  sun: THREE.Vector3,
  moon: THREE.Vector3,
  air: Air,
  out: THREE.Vector3,
): THREE.Vector3 {
  const m = airMass(dir.y);
  const upness = Math.sqrt(Math.max(0, Math.min(1, dir.y)));
  const muS = dir.dot(sun);
  const muM = dir.dot(moon);

  const t = THREE.MathUtils.smoothstep(muS, -0.35, 0.9);
  const beamW = (1 - upness) * (air.beamFloor + (1 - air.beamFloor) * t);
  const diffW = air.diffuseFloor + (1 - air.diffuseFloor) * upness;

  const pR = rayleighPhase(muS);
  const pM = miePhase(muS, air.mieG);
  const qR = rayleighPhase(muM);
  const qM = miePhase(muM, air.mieG);

  for (const axis of ["x", "y", "z"] as const) {
    const bR = air.betaR[axis];
    const bM = air.betaM[axis];
    const bT = air.betaT[axis];
    const scattered = 1 - Math.exp(-bT * m);
    const illum = air.sunBeam[axis] * beamW + air.sunDiffuse[axis] * diffW;
    const sunScatter = (bR * pR + bM * pM) * illum;
    const moonScatter = (bR * qR + bM * qM) * air.moonBeam[axis];
    out[axis] = ((sunScatter + moonScatter) / bT) * scattered + air.nightSky[axis] * scattered;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aerial perspective
// ---------------------------------------------------------------------------
//
// Fog that mixes toward one flat colour is why distant huts read as cardboard
// cut-outs pasted on a gradient. But fog that mixes toward the *sky* is worse,
// and that is what v1 shipped: it took the dome's horizon radiance — an entire
// atmospheric column, 4.4 linear units of it under the sun — and dialled it in
// at a third of full strength on geometry twenty-eight metres away. Nothing
// survives that. The huts did not fade into the distance, they were overwritten
// by it.
//
// So the ray is integrated as two separate things, because it physically is:
//
//   the near air   a mist with a real scale height and a real source function.
//                  Ground-level air is lit by a beam that has already crossed
//                  nineteen air masses and by whatever slice of dome it can see,
//                  which comes to a fraction of the horizon's radiance, not all
//                  of it. Directional, because the Henyey-Greenstein lobe of the
//                  aerosols puts a bright halo round a low sun and almost
//                  nothing sixty degrees off it. Two scale heights, because the
//                  haze that separates the treeline from the downland behind it
//                  and the mist that pools in the hollows are not the same air.
//
//   the far sky    a second, much longer-range term that converges on the
//                  dome's own radiance in this direction, so the downland's
//                  outer edge welds into the horizon with no seam. It is at 4%
//                  on the palisade and 97% at the terrain's rim, which is the
//                  difference between depth and a wash.
//
// On top of that the same cloud field does three jobs: it shadows the key light
// (through `getShadow`, below), it cuts the sun's share of the mist along the
// ray so the haze is crossed by shafts, and it modulates where the ground mist
// pools. One noise field, three reads, all of them coherent with each other.
//
// Doing any of this per pixel means every fogged material in the scene has to
// run the maths, and this module owns none of them. So it patches three's fog
// shader chunks in place and smuggles its uniforms into ShaderLib. That is a
// global mutation from inside a module, which is not free: it is refcounted and
// fully restored on dispose, it must land before the first program compiles (it
// does — createSky runs during stage init), and every added uniform defaults to
// zero so any material the injection misses collapses back to three's stock fog
// rather than turning black.
//
// The clean version of this is materials.ts calling a hook we hand it inside
// onBeforeCompile. Until that seam exists, this is the only way to get aerial
// perspective without editing eleven files.

const AERIAL_UNIFORM_NAMES = [
  "fogSkyHorizon",
  "fogSkyZenith",
  "fogSkySun",
  "fogSunDirection",
  "fogAerial",
  "fogMist",
  "fogMistLight",
  "fogMistPhase",
  "fogCloud",
  "fogCloudMove",
  "fogFire",
  "fogFirePos",
] as const;

// Float32Array values survive UniformsUtils.clone by reference — three only
// deep-copies Colors, Vectors, Matrices and Textures — so one array here is one
// array in every material, and writing it updates the whole scene.
const aerialValues = {
  /** Dome radiance at the horizon, ninety degrees off the sun. Linear. */
  fogSkyHorizon: new Float32Array(3),
  fogSkyZenith: new Float32Array(3),
  /** How much hotter the horizon is under the sun than beside it. Linear. */
  fogSkySun: new Float32Array(3),
  fogSunDirection: new Float32Array([0, 1, 0]),
  /** x: master gate, y: far-sky σ, z: desaturation, w: shaft depth. x=0 = stock fog. */
  fogAerial: new Float32Array(4),
  /** x: haze σ₀, y: haze 1/H, z: ground-mist σ₀, w: ground-mist 1/H. */
  fogMist: new Float32Array(4),
  /** xyz: the mist's ambient source function, w: how much sky it borrows on top. */
  fogMistLight: new Float32Array(4),
  /** xyz: the mist's beam source function, w: its Henyey-Greenstein g. */
  fogMistPhase: new Float32Array(4),
  /** x: shadow depth, y: 1/cell size, z: cover, w: edge softness. */
  fogCloud: new Float32Array(4),
  /** xy: drift in metres, zw: sun azimuth × the projection's height slope. */
  fogCloudMove: new Float32Array(4),
  /** xyz: radiant intensity of the fire, w: the closest approach it is clamped to. */
  fogFire: new Float32Array(4),
  fogFirePos: new Float32Array(3),
};

/** How much of the atmosphere each tier can afford in *every* material's shader. */
interface FogDetail {
  /** Samples of the deck taken along the ray. 0 drops shafts entirely. */
  shaftTaps: number;
  /** Octaves in one deck sample. The second is detail a 26 m band barely shows. */
  deckOctaves: 1 | 2;
  /** Whether `getShadow` is patched to carry the deck's shadow. */
  cloudShadow: boolean;
  /** Whether the ground mist gets its pooling noise. */
  mistNoise: boolean;
}

const FOG_PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogRay;
#endif
`;

const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	// View space back to world space without an inverse: the view matrix's
	// rotation block is orthonormal, so its transpose is its inverse, and its
	// columns are what GLSL hands us.
	vFogRay = vec3(
		dot( viewMatrix[ 0 ].xyz, mvPosition.xyz ),
		dot( viewMatrix[ 1 ].xyz, mvPosition.xyz ),
		dot( viewMatrix[ 2 ].xyz, mvPosition.xyz )
	);
#endif
`;

/**
 * The deck sampler, shared by the ground shadow, the shafts and the mist pools.
 *
 * This lands in *every* material in the scene and a medium-tier device is a
 * phone, so the count matters: a shafted fragment reads the deck once per tap
 * and once more inside `getShadow`, and each read is one or two octaves. Two
 * octaves is a nicer cloud edge and one is most of it, which is why the second
 * is the first thing the tier table takes away.
 */
function fogNoise(detail: FogDetail): string {
  const field =
    detail.deckOctaves === 2
      ? "skyFogNoise( uv ) * 0.62 + skyFogNoise( uv * 2.17 + 11.3 ) * 0.38"
      : "skyFogNoise( uv )";
  return /* glsl */ `
	float skyFogHash( vec2 p ) {
		vec3 q = fract( vec3( p.x, p.y, p.x ) * 0.1031 );
		q += dot( q, q.yzx + 33.33 );
		return fract( ( q.x + q.y ) * q.z );
	}

	float skyFogNoise( vec2 p ) {
		vec2 i = floor( p );
		vec2 f = p - i;
		vec2 u = f * f * ( 3.0 - 2.0 * f );
		return mix(
			mix( skyFogHash( i ), skyFogHash( i + vec2( 1.0, 0.0 ) ), u.x ),
			mix( skyFogHash( i + vec2( 0.0, 1.0 ) ), skyFogHash( i + vec2( 1.0, 1.0 ) ), u.x ),
			u.y );
	}

	// Lit fraction under the cloud deck at a world point; 1 is full sun.
	//
	// A literal projection would trace the sun's ray up to the cloud base — but
	// the sun sits two degrees up, where that ray is a kilometre long and slides
	// fifty metres sideways for every metre of height, which would put a
	// warrior's helm and his boots in different weather. So the projection keeps
	// the sun's azimuth and takes a fixed steeper slope: the shadow still moves
	// the way a cloud shadow moves, and it stays coherent over a body.
	float skyFogDeck( vec3 world ) {
		vec2 uv = ( world.xz + fogCloudMove.xy - fogCloudMove.zw * world.y ) * fogCloud.y;
		float d = ${field};
		return 1.0 - smoothstep( fogCloud.z, fogCloud.z + fogCloud.w, d );
	}

	/** What the deck does to the key light here. 1 when cloud shadows are off. */
	float skyFogCloudShadow( vec3 world ) {
		return fogCloud.x > 0.0 ? mix( 1.0, skyFogDeck( world ), fogCloud.x ) : 1.0;
	}
`;
}

function fogParsFragment(detail: FogDetail): string {
  const noise = detail.cloudShadow || detail.shaftTaps > 0 || detail.mistNoise ? fogNoise(detail) : "";
  return /* glsl */ `
#ifdef USE_FOG

	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogRay;

	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif

	// Written by sky.ts, in linear radiance and metres. fogAerial.x = 0 is the
	// whole model switched off, which is what a material the injection missed
	// gets — and three's stock fog is a perfectly good thing to fall back to.
	uniform vec3 fogSkyHorizon;
	uniform vec3 fogSkyZenith;
	uniform vec3 fogSkySun;
	uniform vec3 fogSunDirection;
	uniform vec4 fogAerial;
	uniform vec4 fogMist;
	uniform vec4 fogMistLight;
	uniform vec4 fogMistPhase;
	uniform vec4 fogCloud;
	uniform vec4 fogCloudMove;
	uniform vec4 fogFire;
	uniform vec3 fogFirePos;

	// Column density of an exponential atmosphere along a ray, in units of the
	// density at y = 0. Exact, including the ray that climbs out of a hollow and
	// the one that dives into it; the small-slope branch is the flat-air limit,
	// which the closed form cannot take on its own.
	float skyFogColumn( float y0, float dy, float invH ) {
		float k = invH * dy;
		float att = abs( k ) < 1e-3 ? 1.0 - 0.5 * k : ( 1.0 - exp( - k ) ) / k;
		return exp( - invH * max( y0, 0.0 ) ) * att;
	}
${noise}
#endif
`;
}

function fogFragment(detail: FogDetail): string {
  const pools = detail.mistNoise
    ? /* glsl */ `
		// Ground mist pools. One low-frequency read at the ray's midpoint is
		// enough to make a hollow hold more of it than the bank does, and it
		// drifts with the deck, so the arena is never twice the same.
		fogTauM *= 0.55 + 0.9 * skyFogNoise( ( cameraPosition.xz + vFogRay.xz * 0.5 ) * 0.045 + fogCloudMove.xy * 0.11 );
`
    : "";

  const shafts =
    detail.shaftTaps > 0
      ? /* glsl */ `
		// Crepuscular shafts. The sun's share of the near air is cut wherever
		// the deck's shadow crosses this ray, and because the cut is sampled
		// *along* the ray rather than at its end, what lands is a gradient — a
		// shaft with a near edge and a far edge, not a stencil.
		if ( fogAerial.w > 0.0 ) {
			float fogLit = 0.0;
			for ( int i = 0; i < ${detail.shaftTaps}; i ++ ) {
				fogLit += skyFogDeck( cameraPosition + vFogRay * ( ( float( i ) + 0.5 ) / ${detail.shaftTaps}.0 ) );
			}
			fogShaft = mix( 1.0, fogLit / ${detail.shaftTaps}.0, fogAerial.w );
		}
`
      : "";

  return /* glsl */ `
#ifdef USE_FOG

	if ( fogAerial.x <= 0.0 ) {

		#ifdef FOG_EXP2
			float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
		#else
			float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		#endif
		gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );

	} else {

		// True path length, not view depth: planar fog under-hazes the corners
		// of a 55-degree frame by a tenth, and that shows up as the settlement
		// reading crisper at the edge of the shot than in the middle of it.
		float fogDist = max( length( vFogRay ), 1e-4 );
		vec3 fogDir = vFogRay / fogDist;
		float fogMu = dot( fogDir, fogSunDirection );

		// ---- how much air is actually on this ray ----
		float fogTauH = fogMist.x * fogDist * skyFogColumn( cameraPosition.y, vFogRay.y, fogMist.y );
		float fogTauM = fogMist.z * fogDist * skyFogColumn( cameraPosition.y, vFogRay.y, fogMist.w );
${pools}
		float fogTau = fogTauH + fogTauM;
		float fogVeil = 1.0 - exp( - fogTau );

		// ---- the sky along this ray, which is where the far half goes ----
		float fogUp = clamp( fogDir.y * 1.55 + 0.12, 0.0, 1.0 );
		vec3 fogAir = mix( fogSkyHorizon, fogSkyZenith, fogUp * fogUp );
		// The ember band is a horizon phenomenon and it is narrower than it
		// looks: the sixth power holds it across the sun's quarter of the sky and
		// has it gone by sixty degrees, where v1's cube was still at half
		// strength there and was painting most of the frame the same orange.
		float fogMu2 = max( fogMu, 0.0 );
		fogMu2 *= fogMu2;
		fogAir += fogSkySun * ( fogMu2 * fogMu2 * fogMu2 * ( 1.0 - fogUp ) );

		// ---- what the near air is glowing with ----
		float fogG = fogMistPhase.w;
		float fogGG = fogG * fogG;
		float fogDen = max( 1.0 + fogGG - 2.0 * fogG * fogMu, 1e-4 );
		float fogPhase = ( 1.0 - fogGG ) / ( fogDen * sqrt( fogDen ) );

		float fogShaft = 1.0;
${shafts}
		vec3 fogGlow = fogMistLight.rgb + fogAir * fogMistLight.w + fogMistPhase.rgb * ( fogPhase * fogShaft );
		vec3 fogAdd = fogGlow * fogVeil;

		// ---- firelight in that air ----
		// The exact single-scatter integral of a point source along the segment
		// the camera can actually see, which is why the glow tightens around the
		// bonfire instead of sitting on it as a sprite, and why a warrior
		// standing in front of it cuts the shaft off at his back.
		if ( fogFire.w > 0.0 ) {
			vec3 fogToFire = fogFirePos - cameraPosition;
			float fogT = dot( fogToFire, fogDir );
			float fogH = sqrt( max( dot( fogToFire, fogToFire ) - fogT * fogT, fogFire.w ) );
			float fogArc = atan( ( fogDist - fogT ) / fogH ) + atan( fogT / fogH );
			fogAdd += fogFire.rgb * ( fogArc * fogTau / ( fogH * fogDist ) );
		}

		// Match whatever space gl_FragColor is in right now: tone mapped and
		// encoded when we are presenting, raw linear when a post pass owns the
		// buffer. Both branches are the renderer's own, so this cannot drift —
		// and in the composer path, which is every tier, both are the identity.
		#ifdef TONE_MAPPING
			fogAdd = toneMapping( fogAdd );
			fogAir = toneMapping( fogAir );
		#endif
		fogAdd = linearToOutputTexel( vec4( fogAdd, 1.0 ) ).rgb;
		fogAir = linearToOutputTexel( vec4( fogAir, 1.0 ) ).rgb;

		float fogSky = 1.0 - exp( - fogAerial.y * fogAerial.y * fogDist * fogDist );

		vec3 fogOut = gl_FragColor.rgb * ( 1.0 - fogVeil ) + fogAdd;
		// Distance eats saturation before it eats contrast. It is driven off
		// whichever of the two terms has more of this ray, not off their sum —
		// the mist already desaturates by adding its own light, and charging for
		// that twice is how a hut ends up grey at thirty metres.
		float fogLum = dot( fogOut, vec3( 0.2126, 0.7152, 0.0722 ) );
		fogOut = mix( fogOut, vec3( fogLum ), max( fogSky, fogVeil * 0.6 ) * fogAerial.z );
		gl_FragColor.rgb = mix( fogOut, fogAir, fogSky );

	}

#endif
`;
}

/**
 * Cloud shadow, threaded through three's own shadow lookup.
 *
 * A cloud shadow is a loss of *key* light, so the honest place for it is where
 * the key's shadow term is resolved. Multiplied into `getShadow` it lands on the
 * turf, the huts and the warriors as one thing, it reaches past the cascade's
 * 24 m the way a real cloud does, and it costs a texture-free function call in a
 * shader that was already running. `getPointShadow` is deliberately left alone:
 * a torch does not care what the sky is doing.
 *
 * The patch is textual and timid. If this version of three does not present
 * exactly the three `getShadow` bodies it is written against, it declines, and
 * the frame loses its cloud shadows rather than its shadows.
 */
function patchShadowChunk(src: string): string | null {
  const split = src.indexOf("float getPointShadow(");
  if (split < 0) return null;
  const marker = "return mix( 1.0, shadow, shadowIntensity );";
  const parts = src.slice(0, split).split(marker);
  if (parts.length !== 4) return null;
  const patched = parts.join(
    "#ifdef USE_FOG\n\t\t\t\tshadow *= skyFogCloudShadow( cameraPosition + vFogRay );\n\t\t\t#endif\n\t\t\t" + marker,
  );
  return patched + src.slice(split);
}

let aerialRefs = 0;
let aerialOriginal: Record<string, string> | null = null;

function installAerialPerspective(detail: FogDetail): void {
  aerialRefs++;
  if (aerialRefs > 1) return;

  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  aerialOriginal = {
    fog_pars_vertex: chunks.fog_pars_vertex,
    fog_vertex: chunks.fog_vertex,
    fog_pars_fragment: chunks.fog_pars_fragment,
    fog_fragment: chunks.fog_fragment,
  };
  chunks.fog_pars_vertex = FOG_PARS_VERTEX;
  chunks.fog_vertex = FOG_VERTEX;
  chunks.fog_pars_fragment = fogParsFragment(detail);
  chunks.fog_fragment = fogFragment(detail);

  // The call site can only reach `skyFogCloudShadow` because three includes
  // fog_pars_fragment before shadowmap_pars_fragment in every lit ShaderLib
  // entry, and only under USE_FOG because that is where the world-space ray it
  // needs is declared. A material with shadows and no fog keeps stock shadows.
  if (detail.cloudShadow) {
    const patched = patchShadowChunk(chunks.shadowmap_pars_fragment);
    if (patched) {
      aerialOriginal.shadowmap_pars_fragment = chunks.shadowmap_pars_fragment;
      chunks.shadowmap_pars_fragment = patched;
    }
  }

  // ShaderLib entries were cloned out of UniformsLib when three was imported,
  // so the injection has to happen on each entry rather than on UniformsLib.
  for (const shader of Object.values(THREE.ShaderLib)) {
    if (!shader.uniforms.fogColor) continue;
    for (const name of AERIAL_UNIFORM_NAMES) {
      shader.uniforms[name] = { value: aerialValues[name] };
    }
  }
}

function uninstallAerialPerspective(): void {
  aerialRefs = Math.max(0, aerialRefs - 1);
  if (aerialRefs > 0 || !aerialOriginal) return;

  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  for (const [name, src] of Object.entries(aerialOriginal)) chunks[name] = src;
  aerialOriginal = null;

  for (const shader of Object.values(THREE.ShaderLib)) {
    for (const name of AERIAL_UNIFORM_NAMES) delete shader.uniforms[name];
  }
  // Anything still holding these by reference — a vfx ShaderMaterial outliving
  // the sky by a frame — has to see the model switched off, not half of it.
  aerialValues.fogAerial.fill(0);
  aerialValues.fogCloud.fill(0);
  aerialValues.fogFire.fill(0);
}

// ---------------------------------------------------------------------------
// Dome shader
// ---------------------------------------------------------------------------

const SKY_VERTEX = /* glsl */ `
varying vec3 vSkyDir;

void main() {
	// The dome is camera-locked and unrotated, so its object-space position is
	// the view direction; normalising per fragment keeps the tessellation out
	// of the sun's position.
	vSkyDir = mat3( modelMatrix ) * position;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

const SKY_FRAGMENT = /* glsl */ `
varying vec3 vSkyDir;

uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uBetaR;
uniform vec3 uBetaM;
uniform float uMieG;
uniform vec3 uSunBeam;
uniform vec3 uSunDiffuse;
uniform vec3 uMoonBeam;
uniform vec3 uMoonDisc;
uniform vec3 uMoonAlbedo;
uniform vec3 uNightSky;
uniform vec3 uGroundTint;
uniform float uBeamFloor;
uniform float uDiffuseFloor;
uniform float uSunDiscSize;
uniform float uSunDiscGain;
uniform float uMoonDiscSize;
uniform float uEarthshine;
uniform float uStarGain;
uniform float uStarFade;
uniform mat3 uStarFrame;
uniform float uCloudCover;
uniform float uCloudHeight;
uniform float uCloudScale;
uniform float uCloudGain;
uniform vec2 uCloudDrift;
uniform vec2 uCloudSunStep;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uShaftGain;
uniform float uTime;
uniform float uBake;

float skyHash13( vec3 p ) {
	p = fract( p * 0.1031 );
	p += dot( p, p.zyx + 31.32 );
	return fract( ( p.x + p.y ) * p.z );
}

vec3 skyHash33( vec3 p ) {
	p = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) );
	p += dot( p, p.yxz + 33.33 );
	return fract( ( p.xxy + p.yxx ) * p.zyx );
}

float skyHash12( vec2 p ) {
	vec3 q = fract( vec3( p.x, p.y, p.x ) * 0.1031 );
	q += dot( q, q.yzx + 33.33 );
	return fract( ( q.x + q.y ) * q.z );
}

float skyNoise2( vec2 p ) {
	vec2 i = floor( p );
	vec2 f = p - i;
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	float a = skyHash12( i );
	float b = skyHash12( i + vec2( 1.0, 0.0 ) );
	float c = skyHash12( i + vec2( 0.0, 1.0 ) );
	float d = skyHash12( i + vec2( 1.0, 1.0 ) );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

float skyNoise3( vec3 p ) {
	vec3 i = floor( p );
	vec3 f = p - i;
	vec3 u = f * f * ( 3.0 - 2.0 * f );
	float n000 = skyHash13( i );
	float n100 = skyHash13( i + vec3( 1.0, 0.0, 0.0 ) );
	float n010 = skyHash13( i + vec3( 0.0, 1.0, 0.0 ) );
	float n110 = skyHash13( i + vec3( 1.0, 1.0, 0.0 ) );
	float n001 = skyHash13( i + vec3( 0.0, 0.0, 1.0 ) );
	float n101 = skyHash13( i + vec3( 1.0, 0.0, 1.0 ) );
	float n011 = skyHash13( i + vec3( 0.0, 1.0, 1.0 ) );
	float n111 = skyHash13( i + vec3( 1.0, 1.0, 1.0 ) );
	return mix(
		mix( mix( n000, n100, u.x ), mix( n010, n110, u.x ), u.y ),
		mix( mix( n001, n101, u.x ), mix( n011, n111, u.x ), u.y ),
		u.z );
}

float skyFbm3( vec3 p ) {
	return skyNoise3( p ) * 0.55 + skyNoise3( p * 2.03 ) * 0.29 + skyNoise3( p * 4.11 ) * 0.16;
}

// Octave weights fall off with view elevation because the cloud shell projects
// hundreds of times more ground per pixel near the horizon than overhead. That
// is the LOD; without it the horizon band crawls with aliasing.
float skyCloudFbm( vec2 p, float detail ) {
	float sum = 0.0;
	float norm = 0.0;
	float amp = 0.5;
	vec2 q = p;
	for ( int i = 0; i < SKY_CLOUD_OCTAVES; i ++ ) {
		float w = clamp( detail * float( SKY_CLOUD_OCTAVES ) - float( i ), 0.0, 1.0 );
		sum += skyNoise2( q ) * amp * w;
		norm += amp * w;
		q = q * 2.07 + vec2( 17.3, 9.1 );
		amp *= 0.52;
	}
	return sum / max( norm, 1e-4 );
}

float skyAirMass( float cosZenith ) {
	float c = max( cosZenith, 0.0 );
	return 1.0 / ( c + 0.025 * exp( -11.0 * c ) );
}

float skyRayleighPhase( float mu ) {
	return 0.0596831 * ( 1.0 + mu * mu );
}

float skyMiePhase( float mu, float g ) {
	float g2 = g * g;
	float d = max( 1.0 + g2 - 2.0 * g * mu, 1e-4 );
	return 0.0795775 * ( 1.0 - g2 ) / ( d * sqrt( d ) );
}

vec3 skyAtmosphere( vec3 dir, float m, out vec3 transmittance ) {
	vec3 betaT = uBetaR + uBetaM;
	transmittance = exp( - betaT * m );
	vec3 scattered = vec3( 1.0 ) - transmittance;

	float upness = sqrt( clamp( dir.y, 0.0, 1.0 ) );
	float muS = dot( dir, uSunDir );
	float muM = dot( dir, uMoonDir );

	// The direct beam only lights the sky whose slant path shares the sun's.
	// Everywhere else the light arrived by a shorter route and kept its blue,
	// which is the whole reason a sunset zenith is not brown.
	float beamW = ( 1.0 - upness ) * mix( uBeamFloor, 1.0, smoothstep( -0.35, 0.9, muS ) );
	float diffW = uDiffuseFloor + ( 1.0 - uDiffuseFloor ) * upness;
	vec3 illum = uSunBeam * beamW + uSunDiffuse * diffW;

	vec3 sunScatter = ( uBetaR * skyRayleighPhase( muS ) + uBetaM * skyMiePhase( muS, uMieG ) ) * illum;
	vec3 moonScatter = ( uBetaR * skyRayleighPhase( muM ) + uBetaM * skyMiePhase( muM, uMieG ) ) * uMoonBeam;

	return ( sunScatter + moonScatter ) / betaT * scattered + uNightSky * scattered;
}

vec3 skyStars( vec3 dir ) {
	// One hashed star per cell of a 3D lattice; the dome's surface only grazes
	// a few of them, which is what makes the field sparse and non-repeating
	// without storing a single byte.
	vec3 sdir = uStarFrame * dir;
	vec3 p = sdir * 190.0;
	vec3 c = floor( p );
	if ( skyHash13( c + 4.7 ) > 0.30 ) return vec3( 0.0 );

	vec3 h = skyHash33( c );
	float d = length( ( p - c ) - h );
	float core = max( 0.0, 1.0 - d * 3.4 );
	core = core * core;
	core = core * core * core;
	float mag = pow( skyHash13( c + 1.9 ), 4.5 );
	vec3 tint = mix( vec3( 1.0, 0.82, 0.62 ), vec3( 0.72, 0.83, 1.0 ), h.z );
	// Scintillation is the atmosphere, so it is strongest where the air is
	// thickest: low stars boil, the zenith holds steady.
	float twinkle = 1.0 + 0.45 * sin( uTime * 5.5 + h.x * 62.0 ) * smoothstep( 0.55, 0.03, dir.y );
	return tint * ( core * mag * twinkle );
}

void main() {
	vec3 dir = normalize( vSkyDir );
	float m = skyAirMass( dir.y );

	vec3 trans;
	vec3 col = skyAtmosphere( dir, m, trans );

	// ---- sun ----
	float cosSun = dot( dir, uSunDir );
	float angSun = acos( clamp( cosSun, -1.0, 1.0 ) );
	// A one-texel star in a cube face reads as a firefly through the PMREM's
	// GGX convolution, so the bake spreads the disc and drops its gain to keep
	// roughly the same energy.
	float discR = uSunDiscSize * mix( 1.0, 3.0, uBake );
	float discGain = uSunDiscGain * mix( 1.0, 0.12, uBake );
	float rr = clamp( angSun / discR, 0.0, 1.0 );
	float limb = pow( max( 1.0 - rr * rr, 0.0 ), 0.34 );
	float disc = 1.0 - smoothstep( discR * 0.88, discR * 1.08, angSun );
	col += uSunBeam * ( discGain * disc * limb );
	// The corona is the same aerosols, seen at a very small angle.
	col += uSunBeam * ( exp( - angSun * 46.0 ) * 0.5 + exp( - angSun * 8.5 ) * 0.06 );

	// ---- moon ----
	float cosMoon = dot( dir, uMoonDir );
	col += uMoonDisc * ( exp( - acos( clamp( cosMoon, -1.0, 1.0 ) ) * 26.0 ) * 0.10 );
	if ( cosMoon > cos( uMoonDiscSize * 1.6 ) ) {
		vec3 mx = normalize( cross( vec3( 0.0, 1.0, 0.0 ), uMoonDir ) );
		vec3 my = cross( uMoonDir, mx );
		float u = dot( dir, mx ) / uMoonDiscSize;
		float v = dot( dir, my ) / uMoonDiscSize;
		float r2 = u * u + v * v;
		if ( r2 < 1.25 ) {
			float w = sqrt( max( 0.0, 1.0 - min( r2, 1.0 ) ) );
			vec3 n = normalize( u * mx + v * my - w * uMoonDir );

			// Lommel-Seeliger: regolith stays bright out to the limb instead of
			// rolling off like a Lambertian ball, which is why a real moon has
			// a hard edge and a soft terminator.
			float mu0 = max( 0.0, dot( n, uSunDir ) );
			float mu = max( 0.04, dot( n, - uMoonDir ) );
			float shade = 2.0 * mu0 / ( mu0 + mu );

			float maria = smoothstep( 0.44, 0.60, skyFbm3( n * 2.6 ) );
			float grain = skyFbm3( n * 17.0 );
			float albedo = mix( 0.36, 0.17, maria ) * ( 0.80 + 0.40 * grain );
			// Crater relief, faked off the noise field rather than a normal map.
			shade *= clamp( 1.0 + ( skyFbm3( n * 34.0 + 11.0 ) - 0.5 ) * 0.55, 0.3, 1.7 );
			// Earthshine — the dark limb is lit by our own planet, and it is
			// what lets the maria read on a crescent instead of a black hole.
			shade = max( shade, uEarthshine * ( 0.7 + 0.6 * grain ) );

			float edge = 1.0 - smoothstep( 0.90, 1.02, r2 );
			col += uMoonDisc * uMoonAlbedo * ( albedo * shade * edge );
		}
	}

	// ---- stars ----
	#ifdef SKY_STARS
	if ( uBake < 0.5 ) {
		float lum = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
		// Stars never go away; the sky in front of them simply out-shines them.
		float vis = exp( - lum * uStarFade ) * smoothstep( -0.01, 0.10, dir.y );
		col += skyStars( dir ) * ( uStarGain * vis );
	}
	#endif

	// ---- clouds ----
	if ( dir.y > 0.008 ) {
		// Shell intersection rather than a flat plane: the deck converges at the
		// horizon the way real cloud does, and t stays finite, so the parallax
		// is geometry instead of a scrolling texture.
		float b = 6.0e6 * dir.y;
		float t = - b + sqrt( b * b + 1.2e7 * uCloudHeight );
		vec2 uv = dir.xz * ( t * uCloudScale ) + uCloudDrift * uTime;
		float detail = smoothstep( 0.02, 0.32, dir.y );
		float d = skyCloudFbm( uv, detail );
		float cover = smoothstep( uCloudCover, uCloudCover + 0.20, d );
		cover *= smoothstep( 0.045, 0.20, dir.y );
		if ( cover > 0.002 ) {
			// Self-shadowing by resampling the field a step toward the sun. It
			// is one extra fbm and it is what puts the hot rim on the edge
			// facing the sunset.
			float lit = skyCloudFbm( uv + uCloudSunStep, detail );
			float shade = clamp( ( d - lit ) * 3.0 + 0.45, 0.0, 1.0 );
			vec3 cloudCol = mix( uCloudShade, uCloudLit, shade * shade );
			// Cloud sits behind the same air the sky does; without this the
			// horizon reads as a wall of cotton pasted over the gradient.
			cloudCol = mix( cloudCol, col, clamp( m / 40.0, 0.0, 0.92 ) );
			col = mix( col, cloudCol, cover * uCloudGain );
		}
	}

	// ---- crepuscular fan ----
	// Rays are the deck's gaps seen end-on, so they are radial about the sun and
	// the field has to be sampled that way: project the view direction into the
	// sun's own tangent plane, normalise, and read the noise on that ring. A
	// bearing angle would have been the obvious coordinate and it is the wrong
	// one — the noise lattice does not wrap, so the seam at +/- pi would show as
	// one hard-edged ray. A ring has no seam, and it costs less than the atan.
	// Radius grows a little with separation, which is what breaks a shaft up
	// along its length instead of running it out to the horizon at full strength.
	if ( uShaftGain > 0.0 && cosSun > 0.0 && uBake < 0.5 ) {
		vec3 sx = normalize( cross( uSunDir, vec3( 0.0, 1.0, 0.0 ) ) );
		vec2 axis = vec2( dot( dir, sx ), dot( dir, cross( sx, uSunDir ) ) );
		vec2 ring = axis * inversesqrt( max( dot( axis, axis ), 1e-6 ) ) * ( 4.4 + angSun * 0.9 );
		float fan = skyNoise2( ring + vec2( uTime * 0.017, 0.0 ) ) * 0.62
			+ skyNoise2( ring * 2.5 + vec2( 0.0, - uTime * 0.031 ) ) * 0.38;
		// The near gate keeps the fan off the disc, where it would only fight
		// the corona; the far one is how much air the shaft has left to light.
		float reach = exp( - angSun * 2.1 ) * smoothstep( 0.010, 0.075, angSun );
		col += uSunBeam * ( smoothstep( 0.46, 0.84, fan ) * reach * uShaftGain );
	}

	// ---- the land beyond the arena ----
	// Below eye level the dome is not sky, it is haze over ground the arena
	// never builds. Folding it down gives the terrain disc somewhere to end.
	col *= mix( vec3( 1.0 ), uGroundTint, smoothstep( 0.0, -0.085, dir.y ) );

	gl_FragColor = vec4( col, 1.0 );

	#include <tonemapping_fragment>
	#include <colorspace_fragment>

	// A 60:1 gradient across eight bits bands visibly. A static one-LSB
	// triangular dither costs three instructions and is invisible in motion,
	// where a higher-precision buffer would cost bandwidth we do not have.
	float dq = skyHash12( gl_FragCoord.xy ) + skyHash12( gl_FragCoord.xy + 41.3 ) - 1.0;
	gl_FragColor.rgb += dq * ( 1.0 - uBake ) * ( 1.5 / 255.0 );
}
`;

/**
 * How much of the sky each tier can afford. Low still gets cloud, stars and the
 * crepuscular fan, because those live in one draw of the dome and cost nothing
 * that matters. What low drops is everything that has to be compiled into every
 * *other* material in the scene — shafts, cloud shadow, mist pooling — because
 * that cost is paid by every pixel of the frame, not by the sky. The aerial
 * perspective itself stays on all three tiers: it is the art direction, and the
 * settlement has to read in layers on a phone as much as on a desktop.
 */
const TIER_DETAIL: Record<QualitySettings["tier"], { octaves: number; stars: boolean } & FogDetail> = {
  high: { octaves: 4, stars: true, shaftTaps: 3, deckOctaves: 2, cloudShadow: true, mistNoise: true },
  medium: { octaves: 3, stars: true, shaftTaps: 2, deckOctaves: 1, cloudShadow: true, mistNoise: false },
  low: { octaves: 2, stars: true, shaftTaps: 0, deckOctaves: 1, cloudShadow: false, mistNoise: false },
};

// ---------------------------------------------------------------------------

const SUN_DISC_RADIUS = 0.0079; // 0.9° across. The true 0.53° is nine pixels at our FOV.
const MOON_DISC_RADIUS = 0.0175; // 2° across, ~4x life size, which every shipped game does.
const CLOUD_HEIGHT = 1400;
const CLOUD_SCALE = 0.0011;

/**
 * Ground footprint of one cell of the shadow field. The moot is 43 m across, so
 * at 26 m a band takes most of a minute to cross it and there is rarely more
 * than one edge in frame — which is what a cloud shadow looks like, and what a
 * smaller number would turn into dappling.
 */
const CLOUD_SHADOW_CELL = 26;
/** Metres per second the deck's shadow crawls. Slow enough to notice, not to watch. */
const CLOUD_SHADOW_DRIFT = new THREE.Vector2(0.95, 0.58);
/** Edge width of the shadow, as a fraction of the field. Cloud edges are not hard. */
const CLOUD_SHADOW_SOFT = 0.26;
/**
 * Height slope of the shadow projection: one over the tangent of the elevation
 * it pretends the sun is at. See `skyFogDeck` for why it is not the real one.
 */
const CLOUD_SHADOW_SLOPE = 1.28;

/** A point source the near air scatters, which in this arena means the bonfire. */
export interface HazeLight {
  position: THREE.Vector3;
  color: THREE.Color;
  /** Multiplier on the mood's `fireHaze`. 0 removes the source. */
  gain: number;
}

/**
 * world.ts builds the bonfire at the arena's origin and hangs its point light
 * a metre up in the logs, so this is where the fire is unless someone says
 * otherwise. It is a default rather than a lookup because sky.ts is not allowed
 * to go hunting through the scene for a light it does not own.
 */
const DEFAULT_HAZE_LIGHT: HazeLight = {
  position: new THREE.Vector3(0, 1.05, 0),
  color: new THREE.Color(0xff8a33),
  gain: 1,
};

/**
 * Squared closest approach the fire's in-scatter integral is clamped to. A point
 * source has a singularity on its own axis; a metre-wide bonfire does not, and
 * this is that metre. Without it a ray grazing the embers divides by nothing and
 * the arena gets a hard white core the bloom then smears over the whole frame.
 */
const FIRE_HAZE_CORE = 1.2;

function lerpParams(a: SkyParams, b: SkyParams, t: number, out: SkyParams): SkyParams {
  const n = (x: number, y: number) => x + (y - x) * t;
  out.rayleigh = n(a.rayleigh, b.rayleigh);
  out.mie = n(a.mie, b.mie);
  out.mieG = n(a.mieG, b.mieG);
  out.sunLift = n(a.sunLift, b.sunLift);
  out.sunIntensity = n(a.sunIntensity, b.sunIntensity);
  out.sunTint.copy(a.sunTint).lerp(b.sunTint, t);
  out.diffuseGain = n(a.diffuseGain, b.diffuseGain);
  out.diffuseDepth = n(a.diffuseDepth, b.diffuseDepth);
  out.diffuseSpectrum = n(a.diffuseSpectrum, b.diffuseSpectrum);
  out.diffuseFloor = n(a.diffuseFloor, b.diffuseFloor);
  out.beamFloor = n(a.beamFloor, b.beamFloor);
  out.moonIntensity = n(a.moonIntensity, b.moonIntensity);
  out.moonDiscGain = n(a.moonDiscGain, b.moonDiscGain);
  out.moonAlbedo.copy(a.moonAlbedo).lerp(b.moonAlbedo, t);
  out.earthshine = n(a.earthshine, b.earthshine);
  out.nightSky.copy(a.nightSky).lerp(b.nightSky, t);
  out.groundTint.copy(a.groundTint).lerp(b.groundTint, t);
  out.starGain = n(a.starGain, b.starGain);
  out.starFade = n(a.starFade, b.starFade);
  out.cloudCover = n(a.cloudCover, b.cloudCover);
  out.cloudGain = n(a.cloudGain, b.cloudGain);
  out.cloudLitGain = n(a.cloudLitGain, b.cloudLitGain);
  out.cloudShadeGain = n(a.cloudShadeGain, b.cloudShadeGain);
  out.shaftGain = n(a.shaftGain, b.shaftGain);
  out.hazeDensity = n(a.hazeDensity, b.hazeDensity);
  out.hazeHeight = n(a.hazeHeight, b.hazeHeight);
  out.mistDensity = n(a.mistDensity, b.mistDensity);
  out.mistHeight = n(a.mistHeight, b.mistHeight);
  out.mistAlbedo = n(a.mistAlbedo, b.mistAlbedo);
  out.mistSkyShare = n(a.mistSkyShare, b.mistSkyShare);
  out.mistBeam = n(a.mistBeam, b.mistBeam);
  out.mistG = n(a.mistG, b.mistG);
  out.skyDensity = n(a.skyDensity, b.skyDensity);
  out.fireHaze = n(a.fireHaze, b.fireHaze);
  out.cloudShadow = n(a.cloudShadow, b.cloudShadow);
  out.shaftDepth = n(a.shaftDepth, b.shaftDepth);
  out.fogDensity = n(a.fogDensity, b.fogDensity);
  out.fogDesaturate = n(a.fogDesaturate, b.fogDesaturate);
  return out;
}

function cloneParams(p: SkyParams): SkyParams {
  return {
    ...p,
    sunTint: p.sunTint.clone(),
    moonAlbedo: p.moonAlbedo.clone(),
    nightSky: p.nightSky.clone(),
    groundTint: p.groundTint.clone(),
  };
}

// three's ACES, mirrored so the fog fallback colour and scene.background land
// where the dome does. Only these two need it — everything else hands the
// shader linear radiance and lets the renderer's own curve do the work.
const ACES_IN = new THREE.Matrix3().set(
  0.59719, 0.35458, 0.04823,
  0.0760, 0.90834, 0.01566,
  0.0284, 0.13383, 0.83777,
);
const ACES_OUT = new THREE.Matrix3().set(
  1.60475, -0.53108, -0.07367,
  -0.10208, 1.10813, -0.00605,
  -0.00327, -0.07276, 1.07602,
);

const acesScratch = new THREE.Vector3();

function acesFit(x: number): number {
  return (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081);
}

function acesEncode(linear: THREE.Vector3, exposure: number, out: THREE.Color): THREE.Color {
  const v = acesScratch.copy(linear).multiplyScalar(exposure / 0.6).applyMatrix3(ACES_IN);
  v.set(acesFit(v.x), acesFit(v.y), acesFit(v.z)).applyMatrix3(ACES_OUT);
  return out.setRGB(
    THREE.MathUtils.clamp(v.x, 0, 1),
    THREE.MathUtils.clamp(v.y, 0, 1),
    THREE.MathUtils.clamp(v.z, 0, 1),
    THREE.SRGBColorSpace,
  );
}

export function createSky(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  materials: MaterialLibrary,
  settings: QualitySettings,
  opts: SkyOptions = {},
): SkyHandle {
  const detail = TIER_DETAIL[settings.tier];
  const seg = opts.segments ?? { width: 64, height: 48 };
  const useAerial = opts.aerialPerspective !== false;
  if (useAerial) installAerialPerspective(detail);

  const root = new THREE.Group();
  root.name = "sky";

  /** The sun on its arc, before the mood's lift. `setTimeOfDay` spins this. */
  const sunBase = DUSK_SUN.clone();
  /** What everything reads: `sunBase` lifted by the current mood's `sunLift`. */
  const sunDirection = DUSK_SUN.clone();
  const liftSun = (lift: number): void => {
    sunDirection.copy(sunBase);
    if (lift !== 0) {
      // Rotate toward the zenith about the horizontal axis perpendicular to the
      // sun's azimuth, so its bearing is kept and only its elevation moves.
      const axis = new THREE.Vector3(-sunBase.z, 0, sunBase.x).normalize();
      sunDirection.applyAxisAngle(axis, -lift).normalize();
    }
  };
  const moonDirection = DUSK_MOON.clone();
  const starFrame = new THREE.Matrix3();
  let timeOfDay = opts.timeOfDay ?? DUSK_TIME;

  const uniforms: Record<string, THREE.IUniform> = {
    uSunDir: { value: sunDirection },
    uMoonDir: { value: moonDirection },
    uBetaR: { value: new THREE.Vector3() },
    uBetaM: { value: new THREE.Vector3() },
    uMieG: { value: DUSK.mieG },
    uSunBeam: { value: new THREE.Vector3() },
    uSunDiffuse: { value: new THREE.Vector3() },
    uMoonBeam: { value: new THREE.Vector3() },
    uMoonDisc: { value: new THREE.Vector3() },
    uMoonAlbedo: { value: new THREE.Vector3() },
    uNightSky: { value: new THREE.Vector3() },
    uGroundTint: { value: new THREE.Vector3() },
    uBeamFloor: { value: DUSK.beamFloor },
    uDiffuseFloor: { value: DUSK.diffuseFloor },
    uSunDiscSize: { value: SUN_DISC_RADIUS },
    uSunDiscGain: { value: 2.6 },
    uMoonDiscSize: { value: MOON_DISC_RADIUS },
    uEarthshine: { value: DUSK.earthshine },
    uStarGain: { value: DUSK.starGain },
    uStarFade: { value: DUSK.starFade },
    uStarFrame: { value: starFrame },
    uCloudCover: { value: DUSK.cloudCover },
    uCloudHeight: { value: CLOUD_HEIGHT },
    uCloudScale: { value: CLOUD_SCALE },
    uCloudGain: { value: DUSK.cloudGain },
    uCloudDrift: { value: new THREE.Vector2(0.028, 0.017) },
    uCloudSunStep: { value: new THREE.Vector2() },
    uCloudLit: { value: new THREE.Vector3() },
    uCloudShade: { value: new THREE.Vector3() },
    uShaftGain: { value: DUSK.shaftGain },
    uTime: { value: 0 },
    uBake: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    name: "skyDome",
    uniforms,
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    defines: {
      SKY_CLOUD_OCTAVES: String(detail.octaves),
      ...(detail.stars ? { SKY_STARS: "" } : {}),
    },
    side: THREE.BackSide,
    // The dome never occludes and never writes depth: a post pass reading the
    // depth buffer should see the sky as empty, not as a shell at 150 m.
    depthWrite: false,
    fog: false,
  });

  const domeGeo = new THREE.SphereGeometry(1, seg.width, seg.height);
  const dome = new THREE.Mesh(domeGeo, material);
  dome.name = "skyDome";
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.scale.setScalar(opts.radius ?? 150);
  root.add(dome);

  const fog = new THREE.FogExp2(0x273548, DUSK.fogDensity);
  scene.fog = fog;
  // A clear colour costs nothing — three clears to it rather than drawing a
  // quad — and it is the frame's floor if the dome ever fails to compile.
  const background = new THREE.Color(0x2b3a4e);
  scene.background = background;
  scene.add(root);

  // ---- state ----
  let mood: Mood = "dusk";
  const current = cloneParams(DUSK);
  let blendFrom = cloneParams(DUSK);
  let blend = 1;
  let air = resolveAir(current, sunDirection, moonDirection);
  let elapsed = 0;
  let hazeLight: HazeLight | null =
    opts.hazeLight === undefined ? DEFAULT_HAZE_LIGHT : opts.hazeLight;

  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget: THREE.WebGLRenderTarget | null = null;
  const envScene = new THREE.Scene();
  let envDirty = true;
  let envCooldown = 0;

  // Held rather than allocated because refresh() runs every frame of a mood
  // blend, and a mood blend is exactly when the frame can least afford GC.
  const scratch = new THREE.Vector3();
  const zero = new THREE.Vector3();
  const horizonSky = new THREE.Vector3();
  const zenithSky = new THREE.Vector3();
  const sunSky = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const tmpMatrix = new THREE.Matrix4();
  const sunColor = new THREE.Color();
  const moonColor = new THREE.Color();

  function setVec(u: string, v: THREE.Vector3): void {
    (uniforms[u].value as THREE.Vector3).copy(v);
  }

  /** Rebuilds every uniform and every fog value from `current`. Cheap; not per frame. */
  function refresh(): void {
    liftSun(current.sunLift);
    air = resolveAir(current, sunDirection, moonDirection);

    setVec("uBetaR", air.betaR);
    setVec("uBetaM", air.betaM);
    setVec("uSunBeam", air.sunBeam);
    setVec("uSunDiffuse", air.sunDiffuse);
    setVec("uMoonBeam", air.moonBeam);
    setVec("uMoonDisc", air.moonDisc);
    setVec("uNightSky", air.nightSky);
    (uniforms.uMoonAlbedo.value as THREE.Vector3).set(
      current.moonAlbedo.r, current.moonAlbedo.g, current.moonAlbedo.b,
    );
    (uniforms.uGroundTint.value as THREE.Vector3).set(
      current.groundTint.r, current.groundTint.g, current.groundTint.b,
    );
    uniforms.uMieG.value = current.mieG;
    uniforms.uBeamFloor.value = current.beamFloor;
    uniforms.uDiffuseFloor.value = current.diffuseFloor;
    uniforms.uEarthshine.value = current.earthshine;
    uniforms.uStarGain.value = current.starGain;
    uniforms.uStarFade.value = current.starFade;
    uniforms.uCloudCover.value = current.cloudCover;
    uniforms.uCloudGain.value = current.cloudGain;
    uniforms.uShaftGain.value = current.shaftGain;

    // Three probes of the model are enough to rebuild it for the fog: a neutral
    // horizon, the zenith, and how much hotter the horizon gets under the sun.
    const az = Math.hypot(sunDirection.x, sunDirection.z) || 1;
    const sx = sunDirection.x / az;
    const sz = sunDirection.z / az;
    evalSky(tmpDir.set(-sz, 0.026, sx).normalize(), sunDirection, moonDirection, air, horizonSky);
    evalSky(tmpDir.set(0, 1, 0), sunDirection, moonDirection, air, zenithSky);
    evalSky(tmpDir.set(sx, 0.026, sz).normalize(), sunDirection, moonDirection, air, sunSky);
    sunSky.sub(horizonSky).max(zero);

    (uniforms.uCloudSunStep.value as THREE.Vector2).set(sx, sz).multiplyScalar(0.22);
    (uniforms.uCloudLit.value as THREE.Vector3)
      .copy(air.sunBeam).multiplyScalar(current.cloudLitGain)
      .addScaledVector(air.sunDiffuse, 0.06);
    (uniforms.uCloudShade.value as THREE.Vector3)
      .copy(zenithSky).multiplyScalar(current.cloudShadeGain)
      .addScaledVector(air.nightSky, 4);

    // Stars ride the celestial sphere, so the lookup runs in a frame that turns
    // with the time of day rather than with the world.
    const spin = (timeOfDay - DUSK_TIME) * Math.PI * 2;
    starFrame.setFromMatrix4(tmpMatrix.makeRotationAxis(POLE, -spin));

    if (useAerial) {
      aerialValues.fogSkyHorizon.set([horizonSky.x, horizonSky.y, horizonSky.z]);
      aerialValues.fogSkyZenith.set([zenithSky.x, zenithSky.y, zenithSky.z]);
      aerialValues.fogSkySun.set([sunSky.x, sunSky.y, sunSky.z]);
      aerialValues.fogSunDirection.set([sunDirection.x, sunDirection.y, sunDirection.z]);
      aerialValues.fogAerial.set([
        1,
        current.skyDensity,
        current.fogDesaturate,
        detail.shaftTaps > 0 ? current.shaftDepth : 0,
      ]);
      aerialValues.fogMist.set([
        current.hazeDensity,
        1 / current.hazeHeight,
        current.mistDensity,
        1 / current.mistHeight,
      ]);

      // The ambient source function of ground-level air: the dome weighted by
      // how much of each part of it a mist layer can actually see. Mostly
      // horizon, because that is most of what is above a flat arena; some
      // zenith, which is the only cold thing in the term; a little of the ember
      // band, because it is bright enough to matter even at a small solid angle.
      scratch.copy(horizonSky).multiplyScalar(0.5)
        .addScaledVector(zenithSky, 0.32)
        .addScaledVector(sunSky, 0.18)
        .multiplyScalar(current.mistAlbedo);
      aerialValues.fogMistLight.set([scratch.x, scratch.y, scratch.z, current.mistSkyShare]);

      // The beam source function, with the phase function's 1/4π folded in so
      // the shader can evaluate the raw Henyey-Greenstein lobe and multiply.
      scratch.copy(air.sunBeam).multiplyScalar(current.mistBeam * 0.0795775);
      aerialValues.fogMistPhase.set([scratch.x, scratch.y, scratch.z, current.mistG]);

      aerialValues.fogCloud.set([
        detail.cloudShadow || detail.shaftTaps > 0 ? current.cloudShadow : 0,
        1 / CLOUD_SHADOW_CELL,
        // A heavier deck shadows more ground. The bias is the gap between the
        // dome's cover threshold, which is read against a four-octave field on
        // a shell, and this one, which is two octaves on the floor.
        Math.max(0.05, current.cloudCover - 0.16),
        CLOUD_SHADOW_SOFT,
      ]);
      // Only zw here: xy is the drift, and update() owns it.
      aerialValues.fogCloudMove[2] = sx * CLOUD_SHADOW_SLOPE;
      aerialValues.fogCloudMove[3] = sz * CLOUD_SHADOW_SLOPE;

      refreshHazeLight();
    }

    fog.density = current.fogDensity;
    sunColor.setRGB(air.sunBeam.x, air.sunBeam.y, air.sunBeam.z, THREE.LinearSRGBColorSpace);
    moonColor.setRGB(air.moonDisc.x, air.moonDisc.y, air.moonDisc.z, THREE.LinearSRGBColorSpace);
    refreshFallbackColor();

    envDirty = true;
  }

  /**
   * The fire the near air is scattering. `w` doubles as the switch and as the
   * squared core radius, so a shader that never received these uniforms reads
   * zero and skips the whole term rather than dividing by nothing.
   */
  function refreshHazeLight(): void {
    if (!useAerial) return;
    if (!hazeLight || hazeLight.gain <= 0 || current.fireHaze <= 0) {
      aerialValues.fogFire.fill(0);
      return;
    }
    const k = current.fireHaze * hazeLight.gain;
    aerialValues.fogFire.set([
      hazeLight.color.r * k,
      hazeLight.color.g * k,
      hazeLight.color.b * k,
      FIRE_HAZE_CORE,
    ]);
    aerialValues.fogFirePos.set([
      hazeLight.position.x,
      hazeLight.position.y,
      hazeLight.position.z,
    ]);
  }

  /**
   * `fog.color` and the clear colour are the only two values this module hands
   * out display-referred, so they are the only two that take the tone curve on
   * the CPU. They run every frame because postfx owns the exposure and can move
   * it out from under us. The curve here is ACES rather than postfx's own, which
   * is right for exactly the case these two exist for — a frame presented
   * straight to the canvas because the composer never built.
   */
  function refreshFallbackColor(): void {
    scratch.copy(horizonSky).addScaledVector(sunSky, 0.45);
    acesEncode(scratch, renderer.toneMappingExposure || 1, tmpColor);
    fog.color.copy(tmpColor);
    background.copy(tmpColor);
  }

  function bakeEnvironment(): void {
    // The bake renders the dome alone from the origin, so it has to be lifted
    // out of the arena and put back. Doing it in place would drag the fog, the
    // warriors and the HUD into the reflection.
    const prevParent = dome.parent;
    const prevScale = dome.scale.x;
    dome.scale.setScalar(1);
    envScene.add(dome);
    uniforms.uBake.value = 1;

    const next = pmrem.fromScene(envScene, 0, 0.1, 10, { size: settings.envMapSize });

    uniforms.uBake.value = 0;
    dome.scale.setScalar(prevScale);
    if (prevParent) prevParent.add(dome);

    envTarget?.dispose();
    envTarget = next;
    // sky.ts pushes the environment itself rather than waiting to be asked,
    // because a rebake mints a new texture and every metal has to follow it.
    materials.setEnvironment(next.texture, ENV_INTENSITY);
    envDirty = false;
    envCooldown = 0.75;
  }

  refresh();
  bakeEnvironment();

  let farClamped = false;

  return {
    root,

    get environment() {
      return envTarget ? envTarget.texture : null;
    },

    sunDirection,
    moonDirection,
    sunColor,
    moonColor,

    setMood(next) {
      if (next === mood) return;
      mood = next;
      blendFrom = cloneParams(current);
      blend = 0;
    },

    setTimeOfDay(t) {
      if (Math.abs(t - timeOfDay) < 1e-4) return;
      timeOfDay = t;
      const spin = (timeOfDay - DUSK_TIME) * Math.PI * 2;
      sunBase.copy(DUSK_SUN).applyAxisAngle(POLE, spin).normalize();
      moonDirection.copy(DUSK_MOON).applyAxisAngle(POLE, spin).normalize();
      refresh();
    },

    setHazeLight(light) {
      hazeLight = light;
      refreshHazeLight();
    },

    update(dt, ctx) {
      elapsed = (elapsed + ctx.rawDt) % 10000;
      uniforms.uTime.value = elapsed;

      // The deck's shadow is driven off the clock rather than integrated, so a
      // dropped frame slides it rather than stalling it, and so two capture runs
      // of the same second lay the same bands across the same turf.
      if (useAerial) {
        aerialValues.fogCloudMove[0] = CLOUD_SHADOW_DRIFT.x * elapsed;
        aerialValues.fogCloudMove[1] = CLOUD_SHADOW_DRIFT.y * elapsed;
      }

      // The dome rides the camera, so it is always at infinity and no amount of
      // walking can reach its edge. One frame of lag against the rig is
      // sub-pixel and costs nothing to leave alone.
      root.position.copy(ctx.camera.position);
      if (!farClamped) {
        dome.scale.setScalar(Math.min(dome.scale.x, ctx.camera.far * 0.9));
        farClamped = true;
      }

      if (blend < 1) {
        blend = Math.min(1, blend + dt / MOOD_BLEND);
        lerpParams(blendFrom, MOOD_PARAMS[mood], THREE.MathUtils.smootherstep(blend, 0, 1), current);
        refresh();
      } else {
        refreshFallbackColor();
      }

      if (envCooldown > 0) envCooldown -= ctx.rawDt;
      if (envDirty && envCooldown <= 0) bakeEnvironment();
    },

    dispose() {
      scene.remove(root);
      if (scene.fog === fog) scene.fog = null;
      if (scene.background === background) scene.background = null;
      envScene.remove(dome);
      domeGeo.dispose();
      material.dispose();
      envTarget?.dispose();
      envTarget = null;
      pmrem.dispose();
      materials.setEnvironment(null);
      if (useAerial) uninstallAerialPerspective();
    },
  };
}
