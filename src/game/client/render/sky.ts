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
  fogDensity: number;
  /** e-folding height of the fog in metres⁻¹. Hut roofs sit in clearer air than doorways. */
  fogHeightFalloff: number;
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
  fogDensity: 0.021,
  fogHeightFalloff: 0.055,
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
  sunIntensity: 30,
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
  fogDensity: 0.03,
  fogHeightFalloff: 0.038,
  fogDesaturate: 0.28,
};

const MOOD_PARAMS: Record<Mood, SkyParams> = { dusk: DUSK, lastStand: LAST_STAND };
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
// cut-outs pasted on a gradient. Real distance takes saturation first, thins
// with altitude, and tints toward whatever the sky is doing *in that direction*
// — the left of frame lifts ember while the right lifts blue, in the same
// frame.
//
// Doing that per pixel means every fogged material in the scene has to run the
// maths, and this module owns none of them. So it patches three's fog shader
// chunks in place and smuggles five uniforms into ShaderLib. That is a global
// mutation from inside a module, which is not free: it is refcounted and fully
// restored on dispose, it must land before the first program compiles (it does
// — createSky runs during stage init), and every added uniform defaults to zero
// so any material the injection misses collapses back to three's stock fog
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
] as const;

// Float32Array values survive UniformsUtils.clone by reference — three only
// deep-copies Colors, Vectors, Matrices and Textures — so one array here is one
// array in every material, and writing it updates the whole scene.
const aerialValues = {
  fogSkyHorizon: new Float32Array(3),
  fogSkyZenith: new Float32Array(3),
  fogSkySun: new Float32Array(3),
  fogSunDirection: new Float32Array([0, 1, 0]),
  /** x: strength, y: height falloff, z: desaturation. All zero = stock fog. */
  fogAerial: new Float32Array(3),
};

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

const FOG_PARS_FRAGMENT = /* glsl */ `
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

	// Written by sky.ts, in linear radiance. Zero collapses back to stock fog.
	uniform vec3 fogSkyHorizon;
	uniform vec3 fogSkyZenith;
	uniform vec3 fogSkySun;
	uniform vec3 fogSunDirection;
	uniform vec3 fogAerial;

#endif
`;

const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG

	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif

	vec3 fogTint = fogColor;

	if ( fogAerial.x > 0.0 ) {

		vec3 fogDir = normalize( vFogRay );

		// Air thins with altitude, so a thatch ridge sits in clearer air than
		// the doorway under it. Without this the haze is a flat wash pinned to
		// the camera and the settlement flattens into one plane.
		float fogH = max( 0.0, cameraPosition.y + 0.5 * vFogRay.y );
		fogFactor *= exp( - fogH * fogAerial.y );

		// In-scatter is the sky along this ray, not one colour for the frame.
		float fogUp = clamp( fogDir.y * 1.55 + 0.12, 0.0, 1.0 );
		vec3 fogAir = mix( fogSkyHorizon, fogSkyZenith, fogUp * fogUp );
		float fogHalo = max( 0.0, dot( fogDir, fogSunDirection ) );
		fogAir += fogSkySun * ( fogHalo * fogHalo * fogHalo );

		// Match whatever space gl_FragColor is in right now: tone mapped and
		// encoded when we are presenting, raw linear when a post pass owns the
		// buffer. Both branches are the renderer's own, so this cannot drift.
		#ifdef TONE_MAPPING
			fogAir = toneMapping( fogAir );
		#endif
		fogAir = linearToOutputTexel( vec4( fogAir, 1.0 ) ).rgb;

		fogTint = mix( fogColor, fogAir, fogAerial.x );

	}

	// Distance eats saturation before it eats contrast.
	float fogLum = dot( gl_FragColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( fogLum ), fogFactor * fogAerial.z );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogTint, fogFactor );

#endif
`;

let aerialRefs = 0;
let aerialOriginal: Record<string, string> | null = null;

function installAerialPerspective(): void {
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
  chunks.fog_pars_fragment = FOG_PARS_FRAGMENT;
  chunks.fog_fragment = FOG_FRAGMENT;

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
  aerialValues.fogAerial.fill(0);
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

/** How much of the sky each tier can afford. Low still gets cloud and stars. */
const TIER_DETAIL: Record<QualitySettings["tier"], { octaves: number; stars: boolean }> = {
  high: { octaves: 4, stars: true },
  medium: { octaves: 3, stars: true },
  low: { octaves: 2, stars: true },
};

// ---------------------------------------------------------------------------

const SUN_DISC_RADIUS = 0.0079; // 0.9° across. The true 0.53° is nine pixels at our FOV.
const MOON_DISC_RADIUS = 0.0175; // 2° across, ~4x life size, which every shipped game does.
const CLOUD_HEIGHT = 1400;
const CLOUD_SCALE = 0.0011;

function lerpParams(a: SkyParams, b: SkyParams, t: number, out: SkyParams): SkyParams {
  const n = (x: number, y: number) => x + (y - x) * t;
  out.rayleigh = n(a.rayleigh, b.rayleigh);
  out.mie = n(a.mie, b.mie);
  out.mieG = n(a.mieG, b.mieG);
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
  out.fogDensity = n(a.fogDensity, b.fogDensity);
  out.fogHeightFalloff = n(a.fogHeightFalloff, b.fogHeightFalloff);
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
  if (useAerial) installAerialPerspective();

  const root = new THREE.Group();
  root.name = "sky";

  const sunDirection = DUSK_SUN.clone();
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
      aerialValues.fogAerial.set([1, current.fogHeightFalloff, current.fogDesaturate]);
    }

    fog.density = current.fogDensity;
    sunColor.setRGB(air.sunBeam.x, air.sunBeam.y, air.sunBeam.z, THREE.LinearSRGBColorSpace);
    moonColor.setRGB(air.moonDisc.x, air.moonDisc.y, air.moonDisc.z, THREE.LinearSRGBColorSpace);
    refreshFallbackColor();

    envDirty = true;
  }

  /**
   * `fog.color` and the clear colour are the only two values this module hands
   * out display-referred, so they are the only two that take the tone curve on
   * the CPU. They run every frame because postfx owns the exposure and can move
   * it out from under us.
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
    materials.setEnvironment(next.texture);
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
      sunDirection.copy(DUSK_SUN).applyAxisAngle(POLE, spin).normalize();
      moonDirection.copy(DUSK_MOON).applyAxisAngle(POLE, spin).normalize();
      refresh();
    },

    update(dt, ctx) {
      elapsed = (elapsed + ctx.rawDt) % 10000;
      uniforms.uTime.value = elapsed;

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
