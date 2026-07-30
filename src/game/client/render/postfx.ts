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
//   Grade         bloom composite + white balance + filmic curve + contrast /
//                 chroma / split-tone + hurt + vignette + aberration + grain +
//                 dither + sRGB, all in one pass, because none of those alone is
//                 worth a round trip through a render target
//   SMAA / FXAA   last, because edge detection wants gamma-encoded luma
//
// Tone mapping is deliberately not left to the renderer. Scene materials skip
// three's tone-mapping chunk whenever they draw into a render target, so with a
// composer in play the curve has to be applied by hand exactly once — here, at
// the end. renderer.toneMappingExposure stays the authoritative exposure value
// because sky.ts reads it to encode the fog colour every frame.
//
// The curve is not ACES. It used to be, and the reason it is not is worth
// keeping written down, because "raise the exposure until it looks right" will
// walk straight back into it. sky.ts hands this file a genuine 900:1 frame: the
// horizon under the sun arrives at ~4.4 units of linear radiance and a warrior's
// shadowed mail at ~0.03. ACES puts its shoulder just past 1.0, so 4.4 clipped —
// the whole sun-side of the frame welded to white — while its output matrix,
// which subtracts to make highlights roll toward white, drove the blue channel
// of every dark red-lit pixel *negative*. That is why the warriors read as black
// silhouettes with G=0 and B=0 in the captures: not under-exposure, a curve with
// no highlight latitude and a matrix that ate their chroma.
//
// What replaced it is a per-channel filmic curve with an explicit white point —
// `white` is the linear radiance that maps to display white, so highlight
// latitude is a number a human can set rather than a property of a fixed matrix
// — plus a separate, tunable crosstalk term that walks bright saturated colour
// toward white on purpose. Splitting those two apart is the whole point: the sky
// gets latitude, fire still goes white-hot, and nothing in the shadows has its
// chroma subtracted away.
//
// The other thing worth writing down, because it is the mistake this file made
// next and it is easy to make again: a grade in an arena lit by one warm key must
// correct the key *out* before it does anything subjective, and put the warmth
// back deliberately afterwards. Every surface here shares the illuminant as a
// common factor, so with it left in, "more saturation" means "more orange" and
// nothing else. Timber, wool, turf, stone and iron have quite different albedo
// ratios and none of it survives; the v2 captures came back with the palisade,
// the huts, the trees and the soil at the same tan, which is what a sepia
// photograph is. So the order in the grade is: divide the illuminant out
// (`balance`), expand chroma about the neutral that leaves (`saturation`,
// `chromaMid`, `chromaTilt`), and only then tint by luma (`splitTone`) so the
// warmth lands on what the key actually reaches and the sky's blue stays in what
// it does not. Warm and cool in opposition, rather than warm everywhere, is the
// entire source of a dusk frame's depth — and it is cheaper than it sounds,
// because all of it is already inside a pass that had to run anyway.
//
// A related trap on the bloom side, since bloom is the widest signal in the chain
// and therefore the fastest way to flatten a frame: gating it on a threshold above
// the sky is only half a gate if the soft knee is expressed as a fraction of that
// threshold, because raising the threshold then lowers the knee's floor with it.
// `bloomKnee` is an absolute width for exactly that reason. Keep
// `bloomThreshold - bloomKnee` above whatever sky.ts's horizon is carrying.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js";
import { LAYER_UNOCCLUDED, type FrameContext, type Mood, type QualitySettings, type QualityTier } from "./quality";

export type Rgb = readonly [number, number, number];

/**
 * A named look. This is the LUT hook: a grade is a value, so a mood, a capture
 * preset and a designer poking at it from the console all move the same
 * numbers, and two looks crossfade instead of cutting.
 */
export interface GradeLook {
  /** Scene exposure. Mirrored onto renderer.toneMappingExposure for sky.ts. */
  exposure: number;
  /**
   * Linear radiance that maps to display white. This is the highlight latitude
   * of the whole look and the single most important number in this file: the
   * dusk horizon arrives at ~4.4, so anything under about 5 welds the sun-side
   * of the frame to a flat white and takes the aerial perspective with it.
   */
  white: number;
  /**
   * How far bright saturated colour is walked toward its own strongest channel
   * before the curve, 0..1. This is what makes a flame go white-hot at the core
   * instead of holding one screaming primary — the job ACES's output matrix used
   * to do, except here it is a dial and it does not reach into the shadows.
   */
  crosstalk: number;
  /**
   * The illuminant this look is correcting for, as a linear radiance triple —
   * "what a grey card returns under this key". The grade divides it out of the
   * frame before anything subjective happens, luma-normalised so the correction
   * rotates chroma and does not move exposure.
   *
   * This is what stops the frame reading as a sepia photograph. Every surface in
   * the arena is lit by one warm key and veiled by warm air, so the illuminant is
   * a common factor in nearly every pixel; leave it in and `saturation` expands
   * chroma about the *ember axis*, which makes the whole midtone range more
   * orange rather than making wood, turf, stone and iron more distinguishable.
   * Divide it out and what is left is the ratio between albedos, which is the
   * thing a viewer reads as material. The warmth then goes back on deliberately,
   * on the lit side only, through `highlightTint`.
   */
  balance: Rgb;
  /** How much of `balance` is divided out, 0..1. 1 fully neutralises the key. */
  balanceStrength: number;
  /** Scene contrast as a power about `pivot`. 0 = the curve alone. */
  contrast: number;
  /** Linear radiance the contrast power turns about. Roughly a lit mid-tone. */
  pivot: number;
  saturation: number;
  /**
   * Extra chroma in the midtones specifically, peaking at half display white and
   * falling to nothing at both ends. The midtones are where material identity
   * lives; the toe is where grain lives and the shoulder is where the crosstalk
   * is deliberately bleaching fire, and neither wants more saturation.
   */
  chromaMid: number;
  /**
   * Tilts chroma across the crossover: positive puts colour in the highlights and
   * takes it out of the shadows, negative does the reverse. Dusk sits near zero
   * with a slight negative bias, because its shadows are lit by a blue sky and
   * that blue is a fill cue worth keeping. The last stand runs it hard positive —
   * fire-lit surfaces scream and everything the fire misses goes to grey ash,
   * which is a different *kind* of image, not a hotter tint on the same one.
   */
  chromaTilt: number;
  /** Multiplied into the dark end of the frame. */
  shadowTint: Rgb;
  /** Multiplied into the bright end. The split-tone is the gap between the two. */
  highlightTint: Rgb;
  /** How much of that split is dialled in, 0..1. */
  splitTone: number;
  /**
   * Display luma where the split-tone finishes being `shadowTint`, and where it
   * finishes becoming `highlightTint`. The gap between them is the crossover, and
   * it has to be *narrower* than the frame's tonal range or the split cancels out
   * exactly where the picture lives: a ramp running the full 0..0.85 leaves every
   * midtone sitting halfway between the two tints, which averages to neutral and
   * throws away the complementary contrast the split exists to create.
   */
  splitLow: number;
  splitHigh: number;
  /**
   * Display-referred floor, per channel, faded out by the square of the pixel's
   * own value. A print has a black that is not zero and a dusk frame has no true
   * black in it either — the darkest thing on the field is still lit by the sky.
   * It is also where a mood keeps its shadows once the curve has taken their
   * chroma: cool for dusk, ash for the last stand.
   */
  shadowLift: Rgb;
  bloomStrength: number;
  /** Linear radiance a pixel has to beat before it blooms at all. */
  bloomThreshold: number;
  /**
   * Width of the soft knee *below* `bloomThreshold`, in linear radiance. An
   * absolute width rather than a fraction of the threshold, and that is the whole
   * point: the knee used to be 35% of the threshold, so every time the threshold
   * was raised to clear the sky the knee band came straight back down under it.
   * At a threshold of 5.0 that put the band's floor at 3.25 — a full stop below
   * the 4.5-unit dusk horizon — so the sky was still blooming, the pyramid was
   * still spreading it, and the frame still came back hazed toward the key hue.
   * Keep `threshold - knee` above whatever sky.ts's horizon is carrying.
   */
  bloomKnee: number;
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
// A white point out at nearly eight linear units is what lets both ends of that
// survive — five and a half stops over a lit mid-tone. The sky right beside the
// sun still goes to near-white, because it is the sky right beside the sun, but
// fifteen degrees off it the horizon has fallen to 1.9 and lands in the low
// two-hundreds with its gradient intact; the anti-solar sky stays the blue it
// physically is; and a hut sixty metres out reads as a hut in haze rather than
// as a hole punched in the sky.
//
// What this look got wrong in v2 was not exposure and not the curve. It was that
// every stage of it was warm in the same direction at once — a warm illuminant
// left in the frame, a saturation that therefore expanded chroma along the ember
// axis, a bloom knee that let the horizon glow onto everything, and a warm bloom
// tint on top of an already-warm glow. Four warm multiplies compound into one
// hue, and the captures came back with palisade, huts, trees and soil at the
// same tan. The order is now: correct the illuminant out, expand chroma about the
// neutral that leaves, then put the warmth back on the lit side only. Same dusk,
// but wood, cloth, turf, stone and iron are separated by hue and not only by
// value.
const DUSK: GradeLook = {
  exposure: 1.0,
  white: 7.8,
  // What a grey card returns out on the field: the low sun's beam after nineteen
  // air masses, plus a cool sky fill that is nowhere near enough to balance it.
  //
  // Measured, not guessed. Inverting the v2 grade over the surfaces of the five
  // dusk captures — excluding sky and fire, which are sources rather than lit
  // material — puts the mean surface radiance at [1, 0.70, 0.40]. Some of that is
  // genuinely the arena: it is built of oak, thatch and mud, so its albedo mean is
  // warm under any light. Dividing that share back out leaves roughly [1, 0.82,
  // 0.62] as the illuminant, which is what this corrects.
  //
  // Fifty-five per cent of it comes out — not all, because a fully neutralised
  // frame stops reading as dusk at all, and the residual is the honest amount of
  // "the light here is warm" to leave in the midtones.
  balance: [1.0, 0.82, 0.62],
  balanceStrength: 0.55,
  // Crosstalk walks anything past its knee toward that pixel's own peak channel.
  // The response is squared now (see the grade), so it has effectively no reach
  // below the knee and a much harder one above it — which means the dial can go
  // back *up* without bleaching the midtones the way 0.35 did in v1. Fire and the
  // sun's own disc roll to white; a turf midtone keeps every bit of its green.
  crosstalk: 0.3,
  contrast: 0.22,
  pivot: 0.2,
  saturation: 1.24,
  chromaMid: 0.22,
  chromaTilt: -0.06,
  // Pushed apart from v2's [0.8, 0.93, 1.22] / [1.1, 1.0, 0.84]. With the
  // illuminant divided out these no longer have to fight a frame that is already
  // orange everywhere, so the split can be what gives dusk its depth: the sky's
  // blue in everything the sun misses, the sun's amber in everything it reaches.
  // The highlight tint carries a little more luma than the shadow tint on
  // purpose — the split is the one stage that legitimately stretches the
  // histogram, and the capture harness's tonal spread is scored on that.
  shadowTint: [0.74, 0.9, 1.28],
  highlightTint: [1.17, 1.02, 0.8],
  splitTone: 0.62,
  // Straddling the frame's own interquartile range, which measures at 0.21 to
  // 0.33 of display luma across the dusk captures, median 0.26. v2 ramped
  // 0.0 -> 0.85, so every one of those midtones landed at the midpoint of the two
  // tints — and the midpoint of a cool tint and a warm one is grey. Narrowed to
  // this, the same two tints put a quarter of the frame decisively cool and a
  // quarter decisively warm.
  splitLow: 0.14,
  splitHigh: 0.42,
  shadowLift: [0.004, 0.008, 0.018],
  // A dusk sky is genuinely bright — 4.4 linear at the horizon, brighter than
  // any flame the arena used to carry — so a threshold below it blooms the sky
  // itself, and the pyramid then smears that across every pixel in frame. 1.35
  // is what washed v1 to one orange. 2.15 was the second attempt and it was
  // still under the sky: the v2 captures came back with turf, thatch, mail and
  // a warrior's cloak all landing within a few code values of each other,
  // because a constant of pure ember had been added to all of them.
  //
  // 5.0 sits *above* the horizon and below the fire, which is only possible
  // because the flames were raised to meet it — vfx.ts's fire layer and the
  // emissives in materials.ts both carry more radiance than the sky now, which
  // is what a fire at dusk actually does. What blooms is the sun's own disc and
  // the few degrees of sky beside it, every flame, every torch and every rune;
  // what does not is the other three-quarters of the sky.
  //
  // Except that in v2 it did, because the threshold was only half the gate: the
  // knee was 35% of it, so the band actually started at 3.25 and the 4.5-unit
  // horizon sat a third of the way up it. Measured, that fed 0.19 linear units
  // into the pyramid across the whole lower sky, which the geometric upsample
  // multiplies by about 3.5 over a region that large — 0.57 units of warm veil
  // laid over a treeline whose own surfaces return about 0.25. Three times a
  // midtone, in the key's hue, over the entire background. That is the
  // orange-sepia cast, and it is this line that fixes it.
  bloomStrength: 0.85,
  bloomThreshold: 5.0,
  // 0.40, so the band runs 4.60 -> 5.00 and the floor clears the horizon with
  // room rather than landing on it. Eight per cent of the threshold is still a
  // wide enough soft entry to stop a flickering flame edge popping in and out,
  // which is the only thing the knee was ever for.
  bloomKnee: 0.4,
  // Near-neutral, down from [1.0, 0.93, 0.8]. Everything that gets past a
  // 5-unit threshold is a fire, a rune or the sun, and all three already carry
  // their own colour out of vfx.ts and materials.ts. Tinting the glow warm on
  // top of that is the same warm multiply applied twice, and the second one lands
  // on the widest, softest, most frame-covering signal in the chain. The tint
  // stays as a dial because a *slight* warm bias reads as a lens rather than as a
  // grade, but 0.8 blue was painting the arena, not the lens.
  bloomTint: [1.0, 0.97, 0.93],
  vignette: 0.3,
  aberration: 0.0035,
  grain: 0.018,
  aoIntensity: 1.0,
};

// The last stand is a different response, not a red filter. Half the highlight
// latitude, so everything the fire touches blows out where dusk would have held
// it; contrast up about a lower pivot, so the midtones collapse and only the
// fire-lit reads; crosstalk *down*, so a flame stays a screaming primary instead
// of rolling gracefully to white; and every subjective term pushed harder —
// vignette, grain, aberration, occlusion.
//
// The one thing it must not be is dusk with more orange in it, and in v2 it was
// exactly that: warm shadow tint, warm highlight tint, warm black point, all
// pulling the same way, which is the definition of a duotone. The frame came back
// as a sepia print of itself — mail, timber, thatch, turf and sky all on one hue
// with only value between them.
//
// So the axis it now differs on is *chroma structure*, which is a thing dusk
// cannot do by being tinted. Fire is a point source: it makes small pools of
// violently saturated light and leaves everything outside them lit by nothing but
// smoke. `chromaTilt` hard positive is that — colour collapses out of the shadows
// into grey soot while the fire-lit surfaces go hotter and more saturated than
// anything in dusk. The shadow end goes cold and nearly neutral to meet it,
// because the complementary contrast against a hot key is what makes a frame feel
// desperate rather than nostalgic, and because warm-shadow-plus-warm-key is the
// sepia we are getting out of. Hotter where the fire reaches, colder and greyer
// everywhere it does not, and a much narrower band between the two: darker than
// dusk overall, and not the same picture with a filter on it.
const LAST_STAND: GradeLook = {
  // Exposure and white point both moved after the captures: at 1.14 over a
  // white of 4.0 the smoke itself — a linear unit of it — landed in the low
  // two-hundreds, which put the air above every surface it was veiling and
  // flattened the frame to one apricot. Half the latitude of dusk is still the
  // intent, and 6.2 is half of dusk's 7.8 measured against a sky that is not
  // the same brightness. The last stand should be a dark frame lit by fire.
  exposure: 0.96,
  white: 6.2,
  // The illuminant is the fire and the smoke lit by it, and it is far stronger
  // than dusk's: the same measurement over the v2 last stand comes back at
  // [1, 0.483, 0.201] on surfaces — blue at a fifth of red. Net of the arena's own
  // warm albedo that is an illuminant near [1, 0.62, 0.36], and a larger share of
  // it comes out than in dusk, because this was the frame that had gone fully
  // duotone. The heat is then reinstated with more force than the division takes
  // out, downstream, on the lit side only, where the fire actually lands.
  balance: [1.0, 0.62, 0.36],
  balanceStrength: 0.6,
  crosstalk: 0.14,
  contrast: 0.36,
  pivot: 0.16,
  // Up slightly over v2's 0.95 rather than down. Saturation was being held back
  // because it was expanding chroma along the ember axis and everything it
  // touched went further into the sepia; expanded about a corrected neutral and
  // then tilted toward the highlights, the same number separates materials.
  saturation: 1.02,
  chromaMid: 0.2,
  chromaTilt: 0.45,
  // Cold, and almost neutral — soot and smoke, not blue night. This is the single
  // biggest change in this look: v2's [1.06, 0.72, 0.6] made the shadows warmer
  // than the highlights were saturated, which is what welded the frame into one
  // hue. Against a highlight tint this hot, a shadow a few per cent cold is worth
  // more separation than a large tint in the same direction as the key.
  shadowTint: [0.78, 0.82, 0.96],
  highlightTint: [1.3, 0.8, 0.4],
  splitTone: 0.85,
  // Lower and narrower than dusk's, because this frame is darker: its
  // interquartile range measures 0.16 to 0.27 of display luma against dusk's 0.21
  // to 0.33. Only what the fire genuinely reaches gets the hot tint; the rest
  // falls to cold ash. This pair is also what centres the chroma tilt, so the
  // same two numbers decide where colour stops and grey starts.
  splitLow: 0.1,
  splitHigh: 0.34,
  // A cold soot floor rather than a warm one, and only a little above dusk's. The
  // "no true black" argument still holds and holds harder here, because the air
  // carries three times the aerosol; what it does not justify is that floor being
  // the same colour as the key. Kept modest because the floor compresses the
  // bottom of the histogram, and this is the preset with the least tonal room to
  // spare.
  shadowLift: [0.01, 0.011, 0.016],
  // Higher than dusk's, not lower: the last stand's air carries three times the
  // aerosol and its sun is hotter, so the sky it has to clear is brighter. At
  // 1.6 the entire pall was over threshold and the frame came back as one flat
  // apricot with no separation between a warrior and the palisade behind him.
  bloomStrength: 1.35,
  bloomThreshold: 6.0,
  // The last stand's air carries three times the aerosol, so the sky it has to
  // clear is brighter than dusk's and the threshold is already higher to match.
  // The band runs 5.50 -> 6.00.
  bloomKnee: 0.5,
  // Warmer than dusk's, because a fire's glow genuinely is — but nothing like
  // v2's 0.45 blue, which was a heavy second warm multiply on the widest signal
  // in the chain at the exact moment the frame least needed one.
  bloomTint: [1.0, 0.84, 0.66],
  vignette: 0.55,
  aberration: 0.011,
  grain: 0.052,
  aoIntensity: 1.3,
};

/** Matches sky.ts's mood blend, so the air and the grade move together. */
const MOOD_BLEND = 1.4;

const HURT_COLOR: Rgb = [0.62, 0.06, 0.04];

function lerpLook(a: GradeLook, b: GradeLook, t: number, out: GradeLook): GradeLook {
  const m = (x: number, y: number) => x + (y - x) * t;
  const mc = (x: Rgb, y: Rgb): Rgb => [m(x[0], y[0]), m(x[1], y[1]), m(x[2], y[2])];
  out.exposure = m(a.exposure, b.exposure);
  out.white = m(a.white, b.white);
  out.balance = mc(a.balance, b.balance);
  out.balanceStrength = m(a.balanceStrength, b.balanceStrength);
  out.crosstalk = m(a.crosstalk, b.crosstalk);
  out.contrast = m(a.contrast, b.contrast);
  out.pivot = m(a.pivot, b.pivot);
  out.saturation = m(a.saturation, b.saturation);
  out.chromaMid = m(a.chromaMid, b.chromaMid);
  out.chromaTilt = m(a.chromaTilt, b.chromaTilt);
  out.shadowTint = mc(a.shadowTint, b.shadowTint);
  out.highlightTint = mc(a.highlightTint, b.highlightTint);
  out.splitTone = m(a.splitTone, b.splitTone);
  out.splitLow = m(a.splitLow, b.splitLow);
  out.splitHigh = m(a.splitHigh, b.splitHigh);
  out.shadowLift = mc(a.shadowLift, b.shadowLift);
  out.bloomStrength = m(a.bloomStrength, b.bloomStrength);
  out.bloomThreshold = m(a.bloomThreshold, b.bloomThreshold);
  out.bloomKnee = m(a.bloomKnee, b.bloomKnee);
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
//
// The threshold lives in scene radiance, upstream of exposure, which is what
// makes it possible to reason about at all: it is compared against numbers
// sky.ts and materials.ts choose, not against whatever the grade is doing this
// frame. Moving the exposure never silently changes what blooms.
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
//
// uWeight is applied on every rung, so the levels fall off geometrically on the
// way back up and the widest mip — a fifty-pixel blur at 1080p — contributes a
// quarter of what the tightest one does. Without it every level lands with equal
// weight and a bright horizon does not glow, it fogs the entire frame.
const BLOOM_UP = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uWeight;
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
  gl_FragColor = vec4( o * ( 0.0625 * uWeight ), 1.0 );
}`;

/** Per-rung upsample weight. Compounds, so level n lands at 0.72^n. */
const BLOOM_SKIRT = 0.72;

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
      uKnee: { value: DUSK.bloomKnee },
      // The sun disc carries a hundred times the radiance of anything else in
      // frame. Capping the bright pass is what keeps one celestial body from
      // owning the whole glow budget. The ceiling has to stay well clear of the
      // threshold, though: it is applied *before* the excess is taken, so a
      // clamp of 6 against a threshold of 5 leaves every fire in the arena one
      // single unit of glow between them, and the frame loses the bloom it was
      // being thresholded for in the first place. Twenty leaves the bonfire's
      // core room to be the brightest thing in the moot and still holds the sun
      // to five times it rather than five hundred.
      uClamp: { value: 20 },
    });
    this.down = mat(BLOOM_DOWN, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = mat(BLOOM_UP, {
      tDiffuse: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uRadius: { value: 1.0 },
      uWeight: { value: BLOOM_SKIRT },
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

  /**
   * The gate, both halves of it. `knee` is the width of the soft band below
   * `threshold`, in the same linear scene radiance — an absolute width, because
   * the whole reason the sky was blooming through a threshold set above it was a
   * knee derived as a percentage of that threshold. Held below 90% of the
   * threshold so the band can never reach zero and make the gate a ramp from
   * black.
   */
  setThreshold(threshold: number, knee: number): void {
    this.bright.uniforms.uThreshold.value = threshold;
    this.bright.uniforms.uKnee.value = THREE.MathUtils.clamp(knee, 0.02, threshold * 0.9);
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
uniform float uWhiteScale;
uniform vec3 uBalance;
uniform float uCrosstalk;
uniform float uCrossKnee;
uniform float uContrast;
uniform float uPivot;
uniform float uSaturation;
uniform float uChromaMid;
uniform float uChromaTilt;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uSplit;
uniform vec2 uSplitRange;
uniform vec3 uShadowLift;
uniform float uVignette;
uniform float uAberration;
uniform float uGrain;
uniform float uHurt;
uniform vec3 uHurtColor;
uniform float uPressure;
uniform float uTime;
varying vec2 vUv;

// Hable's rational curve: a toe, a near-linear midsection and a shoulder that
// approaches its asymptote slowly enough to hold several stops above white.
// Unnormalised — uWhiteScale is 1/filmicCurve(white), computed once on the CPU,
// and it is the whole highlight-latitude control.
vec3 filmicCurve( vec3 x ) {
  const float A = 0.15, B = 0.50, C = 0.10, D = 0.20, E = 0.02, F = 0.30;
  return ( ( x * ( A * x + C * B ) + D * E ) / ( x * ( A * x + B ) + D * F ) ) - E / F;
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

  // A half-float buffer can carry an infinity out of one bad emissive, and the
  // curve turns that into a NaN that the AA pass then smears across the frame.
  // Sixty-four units is four stops past anything the sun does.
  hdr = min( max( hdr, vec3( 0.0 ) ), vec3( 64.0 ) ) * uExposure;

  // White balance, in scene-linear and ahead of everything subjective, which is
  // both where a camera does it and the only place it is a clean operation: the
  // key's colour is a *factor* of nearly every pixel here, so dividing it out is
  // one multiply and it leaves the ratio between albedos untouched. Bloom is
  // inside it on purpose — a lens balances what reaches the film, including its
  // own glow.
  //
  // This is the line that separates materials. Without it every surface in the
  // arena arrives carrying the same warm multiplier; the saturation stage below
  // then expands chroma about the ember axis that multiplier created, so turf,
  // timber, thatch and iron all get more orange instead of getting further apart.
  // Precomputed on the CPU and luma-normalised, so it rotates hue and does not
  // move a single stop.
  hdr *= uBalance;

  // Contrast in scene-linear about a lit mid-tone, before the display transform,
  // where a power is a clean exposure-slope change. Doing it after the curve
  // instead — an S-curve on display values — pivots at 0.5, and almost nothing
  // in a dusk frame is anywhere near 0.5, so it only ever crushed the shadows.
  hdr = uPivot * pow( max( hdr, vec3( 1e-5 ) ) / uPivot, vec3( uContrast ) );

  // Highlight crosstalk: past the knee, colour is walked toward its own
  // strongest channel, so a flame core goes white-hot and the sky's ember band
  // opens up, while everything below the knee keeps every bit of its chroma.
  //
  // Squared, both terms, and that matters more than it looks. The old rational
  // p/(p+k) is only ever asymptotic — it has no foot, so it was still taking a
  // few per cent of the chroma out of every midtone in the frame on its way to
  // bleaching fire, and a few per cent of every midtone is precisely the
  // difference between five materials and one tan. p*p/(p*p + k*k) is flat at
  // zero until the knee and then climbs hard, so the dial reaches fire and the
  // sun and genuinely nothing else. Turf at 0.3 linear now loses 0.08% of its
  // chroma where it used to lose 2%.
  float peak = max( hdr.r, max( hdr.g, hdr.b ) );
  float peak2 = peak * peak;
  float crossK2 = uCrossKnee * uCrossKnee;
  hdr = mix( hdr, vec3( peak ), ( peak2 / ( peak2 + crossK2 ) ) * uCrosstalk );

  vec3 col = clamp( filmicCurve( hdr ) * uWhiteScale, 0.0, 1.0 );

  float luma = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );

  // Chroma, shaped along the luma axis rather than applied flat, and anchored to
  // the split crossover rather than to the middle of the range. That anchoring is
  // the point: these frames sit at a median display luma of about 0.26, so a bump
  // written to peak at 0.5 peaks a stop above every midtone it was meant to find,
  // and a tilt pivoted at 0.5 is one-sided across the whole picture — it quietly
  // desaturated the entire last stand instead of trading colour between its lit
  // and unlit halves. One tonal anchor drives the tint crossover, the bump's
  // centre and the tilt's pivot, so "where the picture lives" is stated once.
  //
  // The bump is a Lorentzian rather than a gaussian because it costs a divide
  // instead of an exp and its wider tails are the more forgiving shape here.
  float mid = 0.5 * ( uSplitRange.x + uSplitRange.y );
  float halfSpan = max( 0.5 * ( uSplitRange.y - uSplitRange.x ), 1e-3 );
  float q = ( luma - mid ) / halfSpan;
  float chroma = uSaturation
    + uChromaMid / ( 1.0 + q * q )
    + uChromaTilt * clamp( q, -1.0, 1.0 );
  chroma = max( chroma, 0.0 );

  // Gamut guard. Scaling chroma about luma is exactly luma-preserving, which is
  // why all of this is safe for the capture harness's tonal spread — but past a
  // certain scale it drives the weakest channel negative, and a channel clamped
  // to zero reads as a flat block of primary with no detail in it. The largest
  // scale that keeps every channel non-negative is -luma/lowest, so clamping the
  // divisor away from zero rather than branching on it gives the exact same
  // answer: where no channel would have gone negative the bound is enormous and
  // the min is a no-op, and where one would, chroma eases back to the edge of the
  // gamut and the pixel desaturates gracefully instead of clipping.
  vec3 offset = col - vec3( luma );
  float lowest = min( offset.r, min( offset.g, offset.b ) );
  chroma = min( chroma, -luma / min( lowest, -1e-5 ) );
  col = vec3( luma ) + offset * chroma;

  // The split-tone, across the middle third of the range rather than across all
  // of it. A crossover as wide as the frame's own tonal range leaves every
  // midtone at the average of the shadow and highlight tints, and the average of
  // a cool tint and a warm one is neutral — which is how a look with genuine
  // complementary contrast in its numbers still renders as a monochrome frame.
  // Narrow it and the same two tints put blue in the shadows and amber in the
  // key, which is the whole of what makes dusk read as depth.
  vec3 tint = mix( uShadowTint, uHighlightTint, smoothstep( uSplitRange.x, uSplitRange.y, luma ) );
  col *= mix( vec3( 1.0 ), tint, uSplit );

  // The black point, faded by the square of the pixel's own value so it lands on
  // the bottom stop and nowhere else. Dusk lifts blue, the last stand lifts red,
  // and that is most of why the two moods do not read as the same frame twice.
  vec3 toe = vec3( 1.0 ) - col;
  col += uShadowLift * toe * toe;

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

/**
 * Where the crosstalk knee sits relative to the white point, so a look sets one
 * number instead of two that have to be kept in step. Below the knee a colour
 * keeps its chroma; above it, it starts walking toward its own peak.
 *
 * Raised from 0.45 alongside squaring the response. At 0.45 of dusk's white the
 * knee landed at 3.5, *under* the 4.5-unit horizon, so the ember band was being
 * walked toward white and losing the hue it exists to show. Three-quarters of
 * white puts the knee at 5.9 — clear of the sky, still well under a flame core —
 * so what bleaches is fire and the sun's disc, and the horizon keeps its colour.
 */
const CROSS_KNEE = 0.75;

/** CPU mirror of `filmicCurve`, for normalising the curve to its white point. */
function whiteScale(white: number): number {
  const A = 0.15, B = 0.5, C = 0.1, D = 0.2, E = 0.02, F = 0.3;
  const x = Math.max(0.05, white);
  const v = (x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F) - E / F;
  return 1 / Math.max(v, 1e-4);
}

const LUMA_R = 0.2126, LUMA_G = 0.7152, LUMA_B = 0.0722;

/**
 * The per-channel gain that divides an illuminant out of the frame, normalised
 * so it costs no exposure.
 *
 * Full strength maps `illuminant` exactly onto grey, which is what a white
 * balance is. The normalisation is the part worth stating: the gain is scaled by
 * the illuminant's own luma, so a surface that *was* the illuminant comes out at
 * the same brightness it went in at and only its hue moves. Without that, warming
 * or cooling a look would quietly re-expose it, and exposure in this file is
 * already correct and not something a grade change may touch.
 *
 * Strength interpolates toward unity rather than toward a whiter illuminant,
 * because a partly-corrected frame is the goal here: dusk should still look warm.
 * What it should not look is *uniformly* warm, and the difference between those
 * two is this function.
 */
function balanceGain(illuminant: Rgb, strength: number): [number, number, number] {
  const luma = Math.max(
    LUMA_R * illuminant[0] + LUMA_G * illuminant[1] + LUMA_B * illuminant[2],
    1e-4,
  );
  const s = THREE.MathUtils.clamp(strength, 0, 1);
  const gain = (c: number) => 1 + s * (luma / Math.max(c, 1e-3) - 1);
  return [gain(illuminant[0]), gain(illuminant[1]), gain(illuminant[2])];
}

const GRADE_SHADER = {
  name: "ArenaGradeShader",
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    uExposure: { value: DUSK.exposure },
    uBloom: { value: 0 },
    uBloomTint: { value: new THREE.Vector3(1, 1, 1) },
    uWhiteScale: { value: whiteScale(DUSK.white) },
    uBalance: { value: new THREE.Vector3(1, 1, 1) },
    uCrosstalk: { value: DUSK.crosstalk },
    uCrossKnee: { value: DUSK.white * CROSS_KNEE },
    uContrast: { value: 1 + DUSK.contrast },
    uPivot: { value: DUSK.pivot },
    uSaturation: { value: DUSK.saturation },
    uChromaMid: { value: DUSK.chromaMid },
    uChromaTilt: { value: DUSK.chromaTilt },
    uShadowTint: { value: new THREE.Vector3(1, 1, 1) },
    uHighlightTint: { value: new THREE.Vector3(1, 1, 1) },
    uSplit: { value: DUSK.splitTone },
    uSplitRange: { value: new THREE.Vector2(DUSK.splitLow, DUSK.splitHigh) },
    uShadowLift: { value: new THREE.Vector3(0, 0, 0) },
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
  // are what presents the frame if the composer never builds. That fallback
  // frame is three's ACES rather than the look above and will clip its sky;
  // a device that cannot allocate a half-float target has bigger problems.
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
        // GTAO derives its depth and normals by re-rendering the scene through
        // `scene.overrideMaterial`, which replaces the depth-write-off,
        // transparent materials the HUD plates and the particle billboards were
        // built with. Left alone, a nameplate against the sky punches a hole in
        // that depth buffer and comes back wearing a dark halo, and a smoke puff
        // shades the man behind it. Dropping their layer for the duration of the
        // pass is the whole fix; it is done by wrapping `render` rather than by
        // reaching into the pass, because the depth render happens two calls
        // deep inside it and there is no hook there.
        const gtaoPass = gtao;
        const innerRender = gtaoPass.render.bind(gtaoPass);
        gtaoPass.render = (r, write, read, delta, mask) => {
          camera.layers.disable(LAYER_UNOCCLUDED);
          innerRender(r, write, read, delta, mask);
          camera.layers.enable(LAYER_UNOCCLUDED);
        };
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

    const white = pick("white");
    u.uExposure.value = exposure;
    u.uWhiteScale.value = whiteScale(white);
    // The illuminant and its strength are two numbers a look reasons about and
    // one multiply the shader wants, and the reduction is a handful of scalar ops
    // — cheaper here, once, than per pixel.
    const balance = balanceGain(pick("balance"), pick("balanceStrength"));
    (u.uBalance.value as THREE.Vector3).set(balance[0], balance[1], balance[2]);
    u.uCrosstalk.value = pick("crosstalk");
    u.uCrossKnee.value = Math.max(0.05, white * CROSS_KNEE);
    // The look states contrast as an excess over neutral so that zero is "the
    // curve alone"; the shader wants the exponent.
    u.uContrast.value = 1 + pick("contrast");
    u.uPivot.value = Math.max(0.02, pick("pivot"));
    u.uSaturation.value = pick("saturation");
    u.uChromaMid.value = pick("chromaMid");
    u.uChromaTilt.value = pick("chromaTilt");
    const shadow = pick("shadowTint");
    const highlight = pick("highlightTint");
    const lift = pick("shadowLift");
    (u.uShadowTint.value as THREE.Vector3).set(shadow[0], shadow[1], shadow[2]);
    (u.uHighlightTint.value as THREE.Vector3).set(highlight[0], highlight[1], highlight[2]);
    u.uSplit.value = pick("splitTone");
    // Ordered, and separated by at least a little: a smoothstep whose edges cross
    // over is undefined, and one whose edges meet is a hard banded step across
    // whatever midtone it lands on.
    const splitLow = pick("splitLow");
    (u.uSplitRange.value as THREE.Vector2).set(splitLow, Math.max(pick("splitHigh"), splitLow + 0.02));
    (u.uShadowLift.value as THREE.Vector3).set(lift[0], lift[1], lift[2]);
    // The tier can drop the corner falloff even though the grade itself is not
    // optional — the grade is where tone mapping happens, so there is no frame
    // without it. Every preset currently keeps it; the switch exists so the
    // setting is not a lie.
    u.uVignette.value = settings.vignette ? pick("vignette") : 0;
    u.uAberration.value = pick("aberration");
    u.uGrain.value = pick("grain");
    u.uHurt.value = hurtLevel;
    u.uPressure.value = pressure;

    if (bloom) {
      const tintRgb = pick("bloomTint");
      u.uBloom.value = pick("bloomStrength");
      (u.uBloomTint.value as THREE.Vector3).set(tintRgb[0], tintRgb[1], tintRgb[2]);
      bloom.setThreshold(pick("bloomThreshold"), pick("bloomKnee"));
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
