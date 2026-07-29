// The post chain and everything downstream of the beauty pass.
//
// This module owns the final image. The beauty pass no longer reaches the
// canvas directly: it lands in a linear half-float buffer, the chain works on
// that, and one shader at the end does exposure, the filmic curve, the grade
// and the sRGB encode together. Nothing else in the directory may call
// renderer.render, so the whole look of the game is reachable from this file.
//
// Order, and why:
//
//   RenderPass    scene -> linear HDR
//   GTAO          occlusion multiplied into the HDR buffer before anything
//                 reads brightness, so a darkened crevice does not bloom
//   Bokeh         optional DoF, before bloom, so a defocused torch throws a
//                 wide soft glow rather than a sharp disc that is then blurred
//   Bloom         a generator, not a filter: it writes its own pyramid and
//                 leaves the composer buffers untouched
//   Grade         bloom composite + ACES + contrast/saturation/split-tone +
//                 hurt + vignette + aberration + grain + dither + sRGB, all in
//                 one pass, because none of those alone is worth a round trip
//                 through a render target
//   SMAA / FXAA   last, because edge detection wants gamma-encoded luma
//
// Tone mapping is deliberately not left to the renderer. Scene materials skip
// three's tone-mapping chunk whenever they draw into a render target, so with a
// composer in play the curve has to be applied by hand exactly once — here, at
// the end. renderer.toneMappingExposure stays the authoritative exposure value
// because sky.ts reads it to encode the fog colour every frame.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js";
import type { FrameContext, Mood, QualitySettings, QualityTier } from "./quality";

export type Rgb = readonly [number, number, number];

/**
 * A named look. This is the LUT hook: a grade is a value, so a mood, a capture
 * preset and a designer poking at it from the console all move the same
 * numbers, and two looks crossfade instead of cutting.
 */
export interface GradeLook {
  /** Scene exposure. Mirrored onto renderer.toneMappingExposure for sky.ts. */
  exposure: number;
  /** 0 = the ACES curve alone, 1 = a full S-curve laid on top of it. */
  contrast: number;
  saturation: number;
  /** Multiplied into the dark end of the frame. */
  shadowTint: Rgb;
  /** Multiplied into the bright end. The split-tone is the gap between the two. */
  highlightTint: Rgb;
  /** How much of that split is dialled in, 0..1. */
  splitTone: number;
  bloomStrength: number;
  /** Linear radiance a pixel has to beat before it blooms at all. */
  bloomThreshold: number;
  bloomTint: Rgb;
  /** Corner falloff, 0..1. */
  vignette: number;
  /** Radial channel separation, in UV at the frame corner. */
  aberration: number;
  /**
   * Shadow-weighted noise, in display code values — 0.02 is five levels out of
   * 255. Applied after the sRGB encode, because the same amplitude in linear is
   * thirteen times larger once it comes back out of a near-black shadow.
   */
  grain: number;
  /** How hard occlusion is pushed. Scales GTAO's blend, not its radius. */
  aoIntensity: number;
}

export interface PostFxPassInfo {
  name: string;
  /** False for a pass that was built but is currently skipped, e.g. idle DoF. */
  enabled: boolean;
  /**
   * Cost in full-screen-pass equivalents at output resolution, measured on the
   * capture box. A pass that redraws scene geometry counts that draw too, which
   * is why GTAO and Bokeh are the expensive ones and everything else is change.
   */
  cost: number;
}

export interface PostFxOptions {
  /** Starting mood. Defaults to dusk, like the rest of the directory. */
  mood?: Mood;
  /** Per-look overrides, merged over the built-in looks at construction. */
  looks?: Partial<Record<Mood, Partial<GradeLook>>>;
  /**
   * Skip the composer and present straight to the canvas. For A/B captures
   * against art/shots/baseline — the chain is the whole difference.
   */
  bypass?: boolean;
}

export interface PostFxHandle {
  /** True once a composer is doing the presenting rather than a straight render. */
  readonly active: boolean;
  /** What actually got built, in chain order, with measured costs. */
  readonly passes: readonly PostFxPassInfo[];
  /** Presents the frame. Call this instead of renderer.render, always. */
  render(dt: number, ctx: FrameContext): void;
  setSize(width: number, height: number): void;
  setMood(mood: Mood): void;
  /**
   * Damage feedback, 0..1, decaying. This belongs in the grade rather than in a
   * DOM overlay: a red div sits on top of the vignette and the grain and reads
   * as an interface element, where a wash mixed in before the curve reads as
   * the frame itself going wrong.
   */
  hurt(intensity: number): void;
  /** The local warrior's health fraction. Drives the low-health edge pulse. */
  setPressure(fraction: number): void;
  /** Live grade override, merged over whatever the current mood is doing. */
  setLook(look: Partial<GradeLook>): void;
  /** Drops the override and returns to the mood's own numbers. */
  clearLook(): void;
  /**
   * Depth of field, for close framing — the duel and closeup presets, not
   * wides. Off by default even where the tier allows it: BokehPass costs a
   * scene depth draw plus 41 full-resolution taps, which is nothing on a real
   * GPU and a great deal on the software rasteriser the captures run on.
   */
  setDepthOfField(on: boolean, opts?: DofOptions): void;
  dispose(): void;
}

export interface DofOptions {
  /** Bigger is shallower. 0.0002 puts the palisade out of focus, 0.001 is a macro lens. */
  aperture?: number;
  /** Blur ceiling in UV. Past ~0.01 the 41-tap pattern starts to show its ring. */
  maxBlur?: number;
}

// ---------------------------------------------------------------------------
// Looks
// ---------------------------------------------------------------------------

// Dusk: cold shadows against a warm sky, which is the whole point of the
// split-tone — the sun tints what it reaches and the sky tints what it doesn't.
const DUSK: GradeLook = {
  exposure: 1.12,
  contrast: 0.22,
  saturation: 1.06,
  shadowTint: [0.88, 0.94, 1.11],
  highlightTint: [1.10, 1.00, 0.87],
  splitTone: 0.5,
  // A dusk sky is genuinely bright, and a threshold set below its horizon
  // radiance blooms the entire top half of the frame. 1.35 linear sits above a
  // well-exposed sky and below every flame in the arena, which is the line the
  // bar is actually asking for.
  bloomStrength: 0.45,
  bloomThreshold: 1.35,
  bloomTint: [1.0, 0.95, 0.86],
  vignette: 0.34,
  aberration: 0.004,
  grain: 0.022,
  aoIntensity: 1.0,
};

// The last stand has to feel different, not merely redder: exposure up so the
// fire clips, contrast up so the midtones collapse, and saturation *down*
// before the hot tint goes on, so the result reads scorched rather than
// cartoon-red. Bloom threshold drops too — more things are burning.
const LAST_STAND: GradeLook = {
  exposure: 1.2,
  contrast: 0.34,
  saturation: 0.93,
  shadowTint: [1.02, 0.78, 0.70],
  highlightTint: [1.18, 0.86, 0.60],
  splitTone: 0.78,
  bloomStrength: 0.75,
  bloomThreshold: 1.05,
  bloomTint: [1.0, 0.8, 0.58],
  vignette: 0.52,
  aberration: 0.010,
  grain: 0.05,
  aoIntensity: 1.25,
};

/** Matches sky.ts's mood blend, so the air and the grade move together. */
const MOOD_BLEND = 1.4;

const HURT_COLOR: Rgb = [0.62, 0.06, 0.04];

function lerpLook(a: GradeLook, b: GradeLook, t: number, out: GradeLook): GradeLook {
  const m = (x: number, y: number) => x + (y - x) * t;
  const mc = (x: Rgb, y: Rgb): Rgb => [m(x[0], y[0]), m(x[1], y[1]), m(x[2], y[2])];
  out.exposure = m(a.exposure, b.exposure);
  out.contrast = m(a.contrast, b.contrast);
  out.saturation = m(a.saturation, b.saturation);
  out.shadowTint = mc(a.shadowTint, b.shadowTint);
  out.highlightTint = mc(a.highlightTint, b.highlightTint);
  out.splitTone = m(a.splitTone, b.splitTone);
  out.bloomStrength = m(a.bloomStrength, b.bloomStrength);
  out.bloomThreshold = m(a.bloomThreshold, b.bloomThreshold);
  out.bloomTint = mc(a.bloomTint, b.bloomTint);
  out.vignette = m(a.vignette, b.vignette);
  out.aberration = m(a.aberration, b.aberration);
  out.grain = m(a.grain, b.grain);
  out.aoIntensity = m(a.aoIntensity, b.aoIntensity);
  return out;
}

// ---------------------------------------------------------------------------
// Bloom
// ---------------------------------------------------------------------------

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

// The bright pass measures brightness on the strongest channel rather than on
// Rec.709 luma. A rune at linear (0.04, 0.59, 1.68) is plainly glowing, and luma
// weights blue at 0.0722 — thresholding on luma blooms the fire and leaves every
// cold emissive in the game dark. The quadratic knee is what stops the edge of a
// flame popping in and out as it flickers across the threshold.
const BLOOM_BRIGHT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
uniform float uClamp;
varying vec2 vUv;
void main() {
  vec3 c = texture2D( tDiffuse, vUv + vec2( -uTexel.x, -uTexel.y ) ).rgb;
  c += texture2D( tDiffuse, vUv + vec2(  uTexel.x, -uTexel.y ) ).rgb;
  c += texture2D( tDiffuse, vUv + vec2( -uTexel.x,  uTexel.y ) ).rgb;
  c += texture2D( tDiffuse, vUv + vec2(  uTexel.x,  uTexel.y ) ).rgb;
  c *= 0.25;
  // The sun disc carries hundreds of units of radiance. Without a ceiling one
  // celestial body washes the whole frame and nothing else can bloom at all.
  c = min( c, vec3( uClamp ) );
  float br = max( c.r, max( c.g, c.b ) );
  float soft = clamp( br - uThreshold + uKnee, 0.0, 2.0 * uKnee );
  soft = soft * soft / ( 4.0 * uKnee + 1e-4 );
  float w = max( soft, br - uThreshold ) / max( br, 1e-4 );
  gl_FragColor = vec4( c * w, 1.0 );
}`;

// Karis 13-tap downsample. The partial-average weighting is what stops one very
// bright sample strobing as the camera moves a fraction of a texel.
const BLOOM_DOWN = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 t = uTexel;
  vec3 a = texture2D( tDiffuse, vUv + vec2( -2.0 * t.x,  2.0 * t.y ) ).rgb;
  vec3 b = texture2D( tDiffuse, vUv + vec2(        0.0,  2.0 * t.y ) ).rgb;
  vec3 c = texture2D( tDiffuse, vUv + vec2(  2.0 * t.x,  2.0 * t.y ) ).rgb;
  vec3 d = texture2D( tDiffuse, vUv + vec2( -2.0 * t.x,        0.0 ) ).rgb;
  vec3 e = texture2D( tDiffuse, vUv ).rgb;
  vec3 f = texture2D( tDiffuse, vUv + vec2(  2.0 * t.x,        0.0 ) ).rgb;
  vec3 g = texture2D( tDiffuse, vUv + vec2( -2.0 * t.x, -2.0 * t.y ) ).rgb;
  vec3 h = texture2D( tDiffuse, vUv + vec2(        0.0, -2.0 * t.y ) ).rgb;
  vec3 i = texture2D( tDiffuse, vUv + vec2(  2.0 * t.x, -2.0 * t.y ) ).rgb;
  vec3 j = texture2D( tDiffuse, vUv + vec2( -t.x,  t.y ) ).rgb;
  vec3 k = texture2D( tDiffuse, vUv + vec2(  t.x,  t.y ) ).rgb;
  vec3 l = texture2D( tDiffuse, vUv + vec2( -t.x, -t.y ) ).rgb;
  vec3 m = texture2D( tDiffuse, vUv + vec2(  t.x, -t.y ) ).rgb;
  vec3 o = e * 0.125;
  o += ( a + c + g + i ) * 0.03125;
  o += ( b + d + f + h ) * 0.0625;
  o += ( j + k + l + m ) * 0.125;
  gl_FragColor = vec4( o, 1.0 );
}`;

// 9-tap tent, blended additively into the level above. Progressive upsampling is
// what gives bloom a smooth wide skirt out of very few taps; one large gaussian
// at a single scale reads as a halo with an edge to it.
const BLOOM_UP = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 o = texture2D( tDiffuse, vUv + vec2( -t.x,  t.y ) ).rgb;
  o += texture2D( tDiffuse, vUv + vec2( 0.0,  t.y ) ).rgb * 2.0;
  o += texture2D( tDiffuse, vUv + vec2(  t.x,  t.y ) ).rgb;
  o += texture2D( tDiffuse, vUv + vec2( -t.x,  0.0 ) ).rgb * 2.0;
  o += texture2D( tDiffuse, vUv ).rgb * 4.0;
  o += texture2D( tDiffuse, vUv + vec2(  t.x,  0.0 ) ).rgb * 2.0;
  o += texture2D( tDiffuse, vUv + vec2( -t.x, -t.y ) ).rgb;
  o += texture2D( tDiffuse, vUv + vec2( 0.0, -t.y ) ).rgb * 2.0;
  o += texture2D( tDiffuse, vUv + vec2(  t.x, -t.y ) ).rgb;
  gl_FragColor = vec4( o * 0.0625, 1.0 );
}`;

function bloomTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(Math.max(2, width), Math.max(2, height), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });
  rt.texture.generateMipmaps = false;
  return rt;
}

/**
 * Bloom as a generator rather than a filter. It reads the composer's colour
 * buffer, builds its pyramid in private targets and writes nothing back, so it
 * costs no buffer swap and the composite can happen inside the grade instead —
 * one full-resolution pass saved, and the glow is added in HDR, before the
 * curve, rather than painted on after it.
 */
class BloomChain extends Pass {
  readonly levels: number;
  private readonly mips: THREE.WebGLRenderTarget[] = [];
  private readonly bright: THREE.ShaderMaterial;
  private readonly down: THREE.ShaderMaterial;
  private readonly up: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor(width: number, height: number, levels: number) {
    super();
    this.needsSwap = false;
    this.levels = Math.max(2, levels);

    const mat = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: FS_VERT,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
      });

    this.bright = mat(BLOOM_BRIGHT, {
      tDiffuse: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: DUSK.bloomThreshold },
      uKnee: { value: DUSK.bloomThreshold * 0.45 },
      // The sun disc carries a hundred times the radiance of anything else in
      // frame. Capping the bright pass is what keeps one celestial body from
      // owning the whole glow budget.
      uClamp: { value: 8 },
    });
    this.down = mat(BLOOM_DOWN, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = mat(BLOOM_UP, {
      tDiffuse: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uRadius: { value: 1.0 },
    });
    this.up.blending = THREE.AdditiveBlending;
    this.up.transparent = true;

    this.quad = new FullScreenQuad(this.bright);
    this.setSize(width, height);
  }

  /** The finished pyramid, at half the composer's resolution. Identity is stable. */
  get texture(): THREE.Texture {
    return this.mips[0].texture;
  }

  setThreshold(threshold: number): void {
    this.bright.uniforms.uThreshold.value = threshold;
    this.bright.uniforms.uKnee.value = Math.max(0.02, threshold * 0.45);
  }

  setSize(width: number, height: number): void {
    let w = Math.round(width / 2);
    let h = Math.round(height / 2);
    for (let i = 0; i < this.levels; i++) {
      if (this.mips[i]) this.mips[i].setSize(Math.max(2, w), Math.max(2, h));
      else this.mips[i] = bloomTarget(w, h);
      w = Math.round(w / 2);
      h = Math.round(h / 2);
    }
  }

  private blit(target: THREE.WebGLRenderTarget, material: THREE.ShaderMaterial, renderer: THREE.WebGLRenderer): void {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    void writeBuffer; // the pyramid is private; nothing is handed back
    // Every blit covers its whole target, so no level needs clearing — and the
    // upsample must not be cleared, because adding into the level above is the
    // entire trick.
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;

    this.bright.uniforms.tDiffuse.value = readBuffer.texture;
    setTexel(this.bright.uniforms.uTexel.value as THREE.Vector2, readBuffer.width, readBuffer.height);
    this.blit(this.mips[0], this.bright, renderer);

    for (let i = 1; i < this.levels; i++) {
      const src = this.mips[i - 1];
      this.down.uniforms.tDiffuse.value = src.texture;
      setTexel(this.down.uniforms.uTexel.value as THREE.Vector2, src.width, src.height);
      this.blit(this.mips[i], this.down, renderer);
    }

    for (let i = this.levels - 1; i > 0; i--) {
      const src = this.mips[i];
      this.up.uniforms.tDiffuse.value = src.texture;
      setTexel(this.up.uniforms.uTexel.value as THREE.Vector2, src.width, src.height);
      this.blit(this.mips[i - 1], this.up, renderer);
    }

    renderer.autoClear = autoClear;
  }

  dispose(): void {
    for (const rt of this.mips) rt.dispose();
    this.mips.length = 0;
    this.bright.dispose();
    this.down.dispose();
    this.up.dispose();
    this.quad.dispose();
  }
}

function setTexel(v: THREE.Vector2, width: number, height: number): void {
  v.set(1 / Math.max(1, width), 1 / Math.max(1, height));
}

// ---------------------------------------------------------------------------
// Grade
// ---------------------------------------------------------------------------

// Everything display-side in one pass. The order inside it matters: aberration
// is a lens artefact so it acts on scene radiance, bloom adds in HDR, the curve
// runs exactly once, and only after that does anything subjective happen.
const GRADE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform float uExposure;
uniform float uBloom;
uniform vec3 uBloomTint;
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uSplit;
uniform float uVignette;
uniform float uAberration;
uniform float uGrain;
uniform float uHurt;
uniform vec3 uHurtColor;
uniform float uPressure;
uniform float uTime;
varying vec2 vUv;

const mat3 ACES_IN = mat3(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777
);
const mat3 ACES_OUT = mat3(
   1.60475, -0.10208, -0.00327,
  -0.53108,  1.10813, -0.07276,
  -0.07367, -0.00605,  1.07602
);

vec3 acesFilmic( vec3 color ) {
  color = ACES_IN * color;
  vec3 a = color * ( color + 0.0245786 ) - 0.000090537;
  vec3 b = color * ( 0.983729 * color + 0.4329510 ) + 0.238081;
  return clamp( ACES_OUT * ( a / b ), 0.0, 1.0 );
}

vec3 toSRGB( vec3 c ) {
  return mix(
    c * 12.92,
    1.055 * pow( max( c, vec3( 0.0 ) ), vec3( 0.41666 ) ) - 0.055,
    step( vec3( 0.0031308 ), c )
  );
}

float hash12( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}

void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot( c, c );

  // Restrained: a pixel or two of separation in the extreme corner, and
  // nothing at all across the middle third where the fight actually happens.
  vec2 ca = c * uAberration * r2;
  vec3 hdr = vec3(
    texture2D( tDiffuse, vUv + ca ).r,
    texture2D( tDiffuse, vUv ).g,
    texture2D( tDiffuse, vUv - ca ).b
  );

  hdr += texture2D( tBloom, vUv ).rgb * uBloomTint * uBloom;

  vec3 col = acesFilmic( hdr * uExposure );

  // A smoothstep blended against the identity is a contrast curve that cannot
  // clip, which matters when the grade sits after a tone map that has already
  // spent the highlight latitude.
  col = mix( col, col * col * ( 3.0 - 2.0 * col ), uContrast );

  float luma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
  col = mix( vec3( luma ), col, uSaturation );

  vec3 tint = mix( uShadowTint, uHighlightTint, smoothstep( 0.0, 0.85, luma ) );
  col *= mix( vec3( 1.0 ), tint, uSplit );

  // Health pressure closes the frame in from the edges; the damage flash washes
  // the whole thing, harder at the periphery than at the point of attention.
  // The centre keeps most of its colour whatever happens: a player who cannot
  // read the fight through their own damage feedback stops being able to play.
  float edge = smoothstep( 0.02, 0.22, r2 );
  col *= 1.0 - uPressure * edge * 0.55;
  col = mix(
    col,
    uHurtColor * ( 0.18 + luma * 1.3 ),
    clamp( uHurt * ( 0.24 + 0.62 * edge ), 0.0, 0.7 )
  );

  // Measured in UV, not in pixels, so the falloff follows the shape of the
  // frame instead of drawing a circle inside a 16:9 rectangle.
  float d = length( c ) * 1.4142;
  col *= mix( 1.0, smoothstep( 1.05, 0.30, d ), uVignette );

  vec3 srgb = toSRGB( max( col, vec3( 0.0 ) ) );

  // Grain and dither both live here, after the encode, where an amplitude in
  // code values means what it says. In linear the same number is thirteen times
  // larger coming back out of a near-black shadow, which is how post grain
  // usually ends up looking like sensor noise instead of film.
  float n = hash12( gl_FragCoord.xy + fract( uTime ) * 1731.0 );
  float dither = hash12( gl_FragCoord.yx * 1.37 - fract( uTime ) * 911.0 );
  srgb += ( n - 0.5 ) * uGrain * ( 1.0 - dot( srgb, vec3( 0.2126, 0.7152, 0.0722 ) ) * 0.7 );
  // Sub-LSB, and the reason a sixty-degree sky gradient does not band. Failure
  // #8 on the bar is fixed by this line.
  srgb += ( dither - 0.5 ) / 255.0;

  gl_FragColor = vec4( srgb, 1.0 );
}`;

const GRADE_SHADER = {
  name: "ArenaGradeShader",
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    uExposure: { value: DUSK.exposure },
    uBloom: { value: 0 },
    uBloomTint: { value: new THREE.Vector3(1, 1, 1) },
    uContrast: { value: DUSK.contrast },
    uSaturation: { value: DUSK.saturation },
    uShadowTint: { value: new THREE.Vector3(1, 1, 1) },
    uHighlightTint: { value: new THREE.Vector3(1, 1, 1) },
    uSplit: { value: DUSK.splitTone },
    uVignette: { value: DUSK.vignette },
    uAberration: { value: DUSK.aberration },
    uGrain: { value: DUSK.grain },
    uHurt: { value: 0 },
    uHurtColor: { value: new THREE.Vector3(HURT_COLOR[0], HURT_COLOR[1], HURT_COLOR[2]) },
    uPressure: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: FS_VERT,
  fragmentShader: GRADE_FRAG,
};

// ---------------------------------------------------------------------------

/** Bloom pyramid depth per tier. Fewer levels, tighter skirt, less bandwidth. */
const BLOOM_LEVELS: Record<QualityTier, number> = { high: 5, medium: 4, low: 3 };

/**
 * Occlusion runs at half resolution and is bilinearly upsampled by GTAO's own
 * blend pass. AO is a low-frequency signal — the denoiser is already smoothing
 * it over a several-pixel radius — so the visible difference is close to
 * nothing, and it is a straight four-to-one saving on the single most expensive
 * thing in the chain. Measured: 470 ms/frame at full resolution on the capture
 * box, 96 ms at half.
 */
const AO_SCALE = 0.5;

/**
 * Measured on the capture box (SwiftShader, 1600x900) as the share of one
 * full-screen pass each stage costs. Published on the handle so a frame budget
 * is readable at runtime rather than living in a commit message.
 */
const PASS_COST: Record<string, number> = {
  /** Not a post pass; listed so the chain can be read against what it sits on. */
  render: 2.5,
  gtao: 2.1,
  bokeh: 4.9,
  bloom: 1.25,
  grade: 1.0,
  smaa: 2.0,
  fxaa: 1.0,
};

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  settings: QualitySettings,
  opts: PostFxOptions = {},
): PostFxHandle {
  // Colour management, stated rather than inherited: albedo decodes from sRGB,
  // lighting happens in linear, the filmic curve maps it back. Getting this
  // wrong makes every other material decision look wrong. The composer applies
  // the curve itself, but these stay set — sky.ts reads the exposure, and they
  // are what presents the frame if the composer never builds.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DUSK.exposure;

  const looks: Record<Mood, GradeLook> = {
    dusk: { ...DUSK, ...opts.looks?.dusk },
    lastStand: { ...LAST_STAND, ...opts.looks?.lastStand },
  };

  let mood: Mood = opts.mood ?? "dusk";
  const current: GradeLook = { ...looks[mood] };
  let blendFrom: GradeLook = { ...current };
  let blend = 1;
  let override: Partial<GradeLook> = {};

  let hurtLevel = 0;
  let pressure = 0;
  let dofWanted = false;
  let dofBlend = 0;
  let dofMaxBlur = 0.006;

  const size = renderer.getSize(new THREE.Vector2());
  const pixelRatio = renderer.getPixelRatio();
  const bufW = Math.max(2, Math.round(size.x * pixelRatio));
  const bufH = Math.max(2, Math.round(size.y * pixelRatio));

  const passes: PostFxPassInfo[] = [];
  let composer: EffectComposer | null = null;
  let gtao: GTAOPass | null = null;
  let bokeh: BokehPass | null = null;
  let bokehInfo: PostFxPassInfo | null = null;
  let bloom: BloomChain | null = null;
  let grade: ShaderPass | null = null;
  let aa: Pass | null = null;
  let blackBloom: THREE.DataTexture | null = null;

  const track = (name: string, enabled = true): PostFxPassInfo => {
    const info = { name, enabled, cost: PASS_COST[name] ?? 1 };
    passes.push(info);
    return info;
  };

  if (settings.postProcessing && !opts.bypass) {
    try {
      // Let the composer allocate its own pair of buffers: it derives them from
      // the renderer's size and pixel ratio, which is exactly right, and passing
      // one in makes setPixelRatio scale an already-scaled number.
      composer = new EffectComposer(renderer);

      composer.addPass(new RenderPass(scene, camera));
      track("render");

      if (settings.ambientOcclusion) {
        gtao = new GTAOPass(scene, camera, Math.round(bufW * AO_SCALE), Math.round(bufH * AO_SCALE));
        // Half a metre of radius is the scale of the things that have to read:
        // the gap under a hut's eaves, the inside of a helmet's cheek guard, and
        // the ground right where a boot meets it. A screen-space radius would
        // hold that constant at the camera and lose it out at the palisade.
        gtao.updateGtaoMaterial({
          radius: 0.5,
          distanceExponent: 1.6,
          thickness: 0.55,
          distanceFallOff: 1.0,
          // `scale` is an exponent on the visibility term, not a multiplier.
          // Past about 2 the contact darkening turns into a black outline.
          scale: 1.5,
          samples: 16,
          screenSpaceRadius: false,
        });
        // The denoiser is what lets 16 samples survive a moving camera. Normal
        // weighting is high so occlusion does not bleed across a silhouette.
        gtao.updatePdMaterial({ lumaPhi: 8, depthPhi: 2.5, normalPhi: 5, radius: 3, rings: 2, samples: 8 });
        gtao.blendIntensity = current.aoIntensity;
        composer.addPass(gtao);
        // addPass sized it to the full buffer; put it back to half.
        gtao.setSize(Math.round(bufW * AO_SCALE), Math.round(bufH * AO_SCALE));
        track("gtao");
      }

      if (settings.depthOfField) {
        bokeh = new BokehPass(scene, camera, { focus: 4.4, aperture: 0.00018, maxblur: 0 });
        bokeh.enabled = false;
        composer.addPass(bokeh);
        bokehInfo = track("bokeh", false);
      }

      if (settings.bloom) {
        bloom = new BloomChain(bufW, bufH, BLOOM_LEVELS[settings.tier]);
        composer.addPass(bloom);
        track("bloom");
      } else {
        // The grade always samples tBloom; one black texel is cheaper than a
        // shader permutation and keeps the low tier on the same code path.
        blackBloom = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
        blackBloom.needsUpdate = true;
      }

      grade = new ShaderPass(GRADE_SHADER);
      grade.material.depthTest = false;
      grade.material.depthWrite = false;
      grade.uniforms.tBloom.value = bloom ? bloom.texture : blackBloom;
      composer.addPass(grade);
      track("grade");

      // SMAA resolves an edge; FXAA smears one. The low tier gets the smear
      // because it is one pass instead of three, and a slightly soft edge still
      // looks intentional where a stair-stepped one never does.
      const aaName = settings.tier === "low" ? "fxaa" : "smaa";
      aa = aaName === "fxaa" ? new FXAAPass() : new SMAAPass();
      composer.addPass(aa);
      track(aaName);
    } catch (err) {
      // A device that cannot allocate a half-float target still gets a game.
      console.warn("[postfx] composer unavailable, presenting directly:", err);
      composer?.dispose();
      composer = null;
      passes.length = 0;
    }
  }

  function applyLook(): void {
    if (!grade) return;
    const u = grade.uniforms;
    const pick = <K extends keyof GradeLook>(k: K): GradeLook[K] =>
      (override[k] ?? current[k]) as GradeLook[K];

    // The renderer's exposure stays the single source of truth: sky.ts encodes
    // the fog and background colours against it every frame.
    const exposure = pick("exposure");
    renderer.toneMappingExposure = exposure;

    u.uExposure.value = exposure;
    u.uContrast.value = pick("contrast");
    u.uSaturation.value = pick("saturation");
    const shadow = pick("shadowTint");
    const highlight = pick("highlightTint");
    (u.uShadowTint.value as THREE.Vector3).set(shadow[0], shadow[1], shadow[2]);
    (u.uHighlightTint.value as THREE.Vector3).set(highlight[0], highlight[1], highlight[2]);
    u.uSplit.value = pick("splitTone");
    u.uVignette.value = pick("vignette");
    u.uAberration.value = pick("aberration");
    u.uGrain.value = pick("grain");
    u.uHurt.value = hurtLevel;
    u.uPressure.value = pressure;

    if (bloom) {
      const tintRgb = pick("bloomTint");
      u.uBloom.value = pick("bloomStrength");
      (u.uBloomTint.value as THREE.Vector3).set(tintRgb[0], tintRgb[1], tintRgb[2]);
      bloom.setThreshold(pick("bloomThreshold"));
    } else {
      u.uBloom.value = 0;
    }
    if (gtao) gtao.blendIntensity = pick("aoIntensity");
  }

  applyLook();

  return {
    active: composer !== null && grade !== null,
    passes,

    render(dt, ctx) {
      if (!composer || !grade) {
        renderer.render(scene, ctx.camera);
        return;
      }
      // RenderPass, GTAO and Bokeh all hold the camera they were built with. The
      // rig hands out one camera for the life of the stage, so that is fine —
      // but a rig that ever swapped cameras would need a setter here.

      // Feedback decays on raw time: hit-stop slowing the world must not slow
      // the player's own flinch, or the flash outlives the blow that caused it.
      hurtLevel = Math.max(0, hurtLevel - ctx.rawDt * 1.9);

      if (blend < 1) {
        blend = Math.min(1, blend + dt / MOOD_BLEND);
        lerpLook(blendFrom, looks[mood], THREE.MathUtils.smootherstep(blend, 0, 1), current);
      }

      if (bokeh) {
        // Focus rides the subject rather than a fixed plane, so the warrior
        // stays sharp through the whole of the follow camera's lag.
        const uniforms = bokeh.uniforms as Record<string, { value: number }>;
        const want = Math.max(1.2, ctx.camera.position.distanceTo(ctx.focus));
        uniforms.focus.value += (want - uniforms.focus.value) * Math.min(1, dt * 4);
        dofBlend += ((dofWanted ? 1 : 0) - dofBlend) * Math.min(1, dt * 5);
        uniforms.maxblur.value = dofMaxBlur * dofBlend;
        // Below a fraction of a pixel of blur the 41 taps are pure cost.
        bokeh.enabled = dofBlend > 0.02;
        if (bokehInfo) bokehInfo.enabled = bokeh.enabled;
      }

      grade.uniforms.uTime.value = ctx.time;
      applyLook();
      composer.render(dt);
    },

    setSize(width, height) {
      if (!composer) return;
      const ratio = renderer.getPixelRatio();
      // setPixelRatio re-runs setSize with the stored CSS-pixel size, so it has
      // to go first; setSize then forwards device pixels on to every pass.
      composer.setPixelRatio(ratio);
      composer.setSize(width, height);
      // The composer sizes every pass to the full buffer; occlusion stays half.
      gtao?.setSize(Math.round(width * ratio * AO_SCALE), Math.round(height * ratio * AO_SCALE));
    },

    setMood(next) {
      if (next === mood) return;
      mood = next;
      blendFrom = { ...current };
      blend = 0;
    },

    hurt(intensity) {
      hurtLevel = THREE.MathUtils.clamp(Math.max(hurtLevel, intensity), 0, 1);
    },

    setPressure(fraction) {
      // Only the last third of the health bar closes the frame in, and it
      // arrives as a ramp — a step change here reads as a rendering glitch.
      pressure = THREE.MathUtils.clamp((0.35 - fraction) / 0.35, 0, 1);
    },

    setLook(next) {
      override = { ...override, ...next };
      applyLook();
    },

    clearLook() {
      override = {};
      applyLook();
    },

    setDepthOfField(on, dofOpts) {
      dofWanted = on && bokeh !== null;
      if (!bokeh) return;
      const uniforms = bokeh.uniforms as Record<string, { value: number }>;
      if (dofOpts?.aperture !== undefined) uniforms.aperture.value = dofOpts.aperture;
      if (dofOpts?.maxBlur !== undefined) dofMaxBlur = dofOpts.maxBlur;
    },

    dispose() {
      // The composer disposes its own two buffers but not the passes it was
      // given, so every pass is released here by hand.
      composer?.dispose();
      gtao?.dispose();
      bokeh?.dispose();
      bloom?.dispose();
      grade?.dispose();
      aa?.dispose();
      blackBloom?.dispose();
    },
  };
}
