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
//   Meter         reduces the scene to the mean and variance of log luminance,
//                 ahead of bloom so what is measured is the scene and not the
//                 glow; also leaves a low-frequency copy for local contrast
//   Bloom         a generator, not a filter: it writes its own pyramid and
//                 leaves the composer buffers untouched
//   Grade         bloom composite + white balance + filmic curve + the metered
//                 response + contrast / chroma / split-tone + hurt + vignette +
//                 print black + grain + dither + sRGB, all in one pass, because
//                 none of those alone is worth a round trip through a render
//                 target
//   SMAA / FXAA   last, because edge detection wants gamma-encoded luma
//
// The scene buffer is multisampled — see MSAA_SAMPLES. That is not a pass, it is
// a property of the two buffers the composer ping-pongs, and it is the only
// stage in the chain that gets sub-pixel *coverage* rather than guessing at it
// from the finished picture.
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
//
// ---------------------------------------------------------------------------
// Units, and the bug that came of getting them wrong
// ---------------------------------------------------------------------------
//
// `splitLow` / `splitHigh` and everything anchored to them — the split-tone
// crossover, the midtone chroma bump, the chroma tilt's pivot — were measured off
// the captures as code values and then applied to *display-linear* luma. Those are
// not the same space, and the factor between them at the bottom of the range is
// about three. 0.14 display-linear is code value 105; the dusk framings run a
// median of 50 and a 90th percentile of 100. So the entire crossover sat above the
// top decile of every frame in the game: nothing ever reached the highlight tint,
// the whole picture got a flat multiply by `shadowTint`, and the stage the comments
// below describe as "the one that legitimately stretches the histogram" was
// stretching nothing. The last stand had it worse — with `chromaTilt` at +0.45 and
// `clamp(q,-1,1)` pinned at -1 across the frame, its authored saturation of 1.02
// was being rendered at 0.63, which is most of why it came back as a washed
// apricot instead of the hot-and-desperate look its numbers describe.
//
// So the tonal anchor is now read in the frame's own display code space (the sRGB
// OETF, `encode1` below), which is where the numbers were measured and what a
// human means by "shadows" and "midtones". The authored values did not change; the
// space they are compared in did. Same for `shadowLift`, which used to be a
// display-linear floor: 0.018 of blue is code value 36, and in a night framing the
// darkest quarter of the frame arrives at 0.0025, so the lift was seven times the
// signal it sat on and two shadows a genuine four stops apart came out three code
// values apart. It is now stated and applied in code values, after the encode,
// for the same reason the grain already is.
//
// ---------------------------------------------------------------------------
// The metered response
// ---------------------------------------------------------------------------
//
// One fixed transform cannot serve every framing this game ships. `white` is
// highlight latitude bought for the wides — the dusk horizon really does arrive at
// 4.4 linear units and really does need seven and a half of white above it — but
// the close front-on framings look *away* from the sun and carry no fire, so the
// brightest thing in frame is a helm at half a unit. Measured over the v4
// captures: the sun-side wides use a +/-1 sigma band 84 code values wide and score
// 15 of 16 luma buckets, while `portrait` and `stance` use 43-48 and score 7. Same
// curve, same scene, a factor of two in how much of the range the frame occupies.
// Lowering `white` for everyone would fix those two and clip the other six.
//
// So the grade meters the frame and responds to it. `MeterPass` reduces the scene
// buffer to the mean and variance of log luminance — the classic pair, and the
// only two numbers needed: the mean gives the frame's own pivot, the variance
// gives how many stops it spans. Both are pushed through this look's own curve to
// see where the frame's +/-1 sigma band *lands* in code values, and the shortfall
// against `adaptBand` is made up by turning contrast about that pivot.
//
// Two things make this a curve rather than a lift, which matters because a lift is
// how a night scene turns into grey haze:
//
//   - the stretch is two power laws meeting at the pivot, so display black and
//     display white are both fixed points. The frame gains range at both ends
//     instead of sliding up. `adaptLift` is the one dial that deliberately moves
//     the pivot, and it is small.
//   - `clarity` adds local contrast at dodge-and-burn scale (a 32-pixel radius,
//     off the same reduction chain's fourth mip, so it costs one texture tap).
//     That raises the frame's *effective* spread without touching its mean, which
//     is the only way to give a subject highlight structure the render did not put
//     there: a brow, a cheekbone, a fold of wool and a mail edge are all
//     mid-frequency, and the frame is short of exactly that.
//
// Measured over the recovered scene HDR of the v4 captures: portrait 7 -> 10
// buckets, stance 7 -> 10, laststand 8 -> 9, arena 11 -> 13, closeup 11 -> 12,
// brawl 14 -> 14, duel 15 -> 15, lineup 13 -> 16, with mean luma moving by under
// three code values on any of them. The wides come out untouched because their
// band already meets `adaptBand` and the stretch resolves to 1.0 — the response
// is the identity for a frame that does not need it, which is the property that
// lets it be tuned for the night framings without costing the daylight ones.
//
// ---------------------------------------------------------------------------
// What is left of the sepia, and where it lives now
// ---------------------------------------------------------------------------
//
// Three warm multiplies were suspected of stacking. Traced, only one of them is a
// grade problem and it is fixed above. In detail:
//
//   - sky.ts's `sunTint` is [1, 0.98, 0.95], near enough neutral to ignore; the
//     horizon's ember is single-scattering physics, not a tint.
//   - the near air (`mistBeam`, `mistAlbedo`) and the far-sky term paint the
//     *sun-facing* half of a wide frame with the horizon's own radiance. This is
//     why `arena` and `lineup` still resolve their left third — palisade, huts,
//     treeline, soil — to one orange while their right and foreground now read as
//     green turf and brown timber. That is directional, it is in sky.ts, and no
//     grade can undo it: those surfaces genuinely have the beam as nearly all of
//     their illuminant, so their albedo ratios have almost no signal left.
//   - `balance` divides the illuminant out and is doing its job.
//
// What the grade can still add is the part `saturation` cannot: chroma expansion
// is isotropic, so it pushes just as hard *along* the illuminant axis as across
// it, and along that axis is where the sepia is. `chromaOpponent` expands only the
// component orthogonal to the illuminant, which is exactly where wood, turf,
// stone, iron and dyed wool differ from one another. Measured on the dusk
// illuminant: weathered oak's chroma lies dead on the warm axis and gains nothing,
// wet turf has 85% of its chroma across it and gains nearly all of the expansion.
// Turf separates from timber without either becoming more orange.
//
// ---------------------------------------------------------------------------
// Why the split-tone crossover is no longer the tonal anchor
// ---------------------------------------------------------------------------
//
// One pair of numbers was doing two jobs that want opposite answers, and the last
// stand is where they came apart.
//
// The chroma stages need their pivot *on* the picture. `chromaTilt` clamps its
// argument to +/-1, so a pivot above the frame pins every pixel at -1 and turns a
// deliberate trade of colour between the lit and unlit halves into a flat
// desaturation of everything — that was the v4 bug, and it is why `splitLow` /
// `splitHigh` were brought down onto the frame's own interquartile range.
//
// The split-tone crossover needs its midpoint *above* the picture, and for a
// reason that is arithmetic rather than taste: the midpoint of a cool tint and a
// warm one is a desaturated near-neutral. Put the crossover on the histogram mode
// and the modal pixel — the largest population in the frame — is multiplied by the
// average of the two tints, so the stage that exists to create complementary
// contrast instead lays one flat cast over the bulk of the image and only the two
// tails see either tint.
//
// Measured over v6/laststand.png, whose crossover ran 0.10 -> 0.34 against a p10
// of 0.112 and a p90 of 0.375: B/R by luma band came out 0.586 / 0.276 / 0.232 /
// 0.222 / 0.279 — not a ramp at all, one hue held to within a few per cent across
// 78% of the frame, with the crossover's own warm-neutral midpoint sitting on the
// 42% of pixels between 0.15 and 0.25. v3, whose split had not yet been narrowed
// onto the mode, ran 0.895 / 0.787 / 0.712 / 0.364 / 0.347 over the same bands: a
// monotone cool-to-hot ramp, a factor of 2.6 end to end, and the reason it reads as
// a hotter frame despite a *lower* luma spread than v6 (sd 0.082 against 0.106).
// Heat is read as the contrast between a hot sliver and a cool field, not as the
// average hue of the frame.
//
// So `splitLow` / `splitHigh` stay the tonal anchor and keep the chroma stages
// pivoted on the picture, and `tintLow` / `tintHigh` state separately where the
// key's light stops. Dusk sets them equal to its anchor, which is what it always
// did; the last stand puts them above its own third quartile, so the ash field is
// decisively cool and only what the fire genuinely reaches goes hot.

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
   * Extra chroma in the midtones specifically, peaking at the centre of the split
   * crossover and falling to nothing at both ends. The midtones are where material
   * identity lives; the toe is where grain lives and the shoulder is where the
   * crosstalk is deliberately bleaching fire, and neither wants more saturation.
   */
  chromaMid: number;
  /**
   * Chroma expansion applied *only* to the component orthogonal to the illuminant
   * axis, on top of `saturation`. This is the separation dial that `saturation`
   * cannot be: an isotropic expansion pushes as hard along the key's own hue as
   * across it, and along it is where every surface in an arena lit by one warm
   * source already lies. Weathered oak under this dusk sits dead on that axis and
   * gains nothing here; wet turf has 85% of its chroma across it and gains nearly
   * all of the expansion. So timber, turf, stone, iron and dyed wool move apart
   * from each other without any of them moving further toward the key's hue.
   *
   * Applied before the gamut guard, so an expansion that would drive a channel
   * negative eases back to the edge of the gamut with everything else.
   */
  chromaOpponent: number;
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
   * The look's tonal anchor, in **display code values** (0..1 of the sRGB-encoded
   * frame, so 0.14 is code 36) — the space these were measured in and the space a
   * colourist means by "shadows" and "highlights". It centres the midtone chroma
   * bump and pivots the chroma tilt, so "where this picture lives" is stated once.
   *
   * It has to straddle the frame's own interquartile range, and that is a hard
   * constraint rather than a preference: `chromaTilt` clamps its argument to
   * +/-1, so an anchor above the picture pins every pixel at one end and silently
   * renders the whole look at a saturation nobody authored. It also has to be in
   * the right units — see the header. Applied to display-*linear* luma, as it was
   * through v4, this pair sits above the 90th percentile of every framing in the
   * game.
   */
  splitLow: number;
  splitHigh: number;
  /**
   * Where the split-tone hands `shadowTint` over to `highlightTint`, in the same
   * display code values. Separate from the tonal anchor because the two want
   * opposite placements — see the header — and equal to it for a look that wants
   * the old single-pair behaviour.
   *
   * The midpoint of this crossover is the one luma at which the frame is
   * multiplied by the *average* of the two tints, and the average of a cool tint
   * and a warm one is a desaturated near-neutral. So the midpoint is a hue the
   * look does not want any large population of pixels to land on, which makes
   * this pair a statement about the frame's histogram: put the crossover where
   * the key's light stops, not where the picture's mass is.
   */
  tintLow: number;
  tintHigh: number;
  /**
   * Print black, per channel, in **display code values**, faded by the square of
   * the pixel's encoded luma and added after the sRGB encode. A print has a black
   * that is not zero and a dusk frame has no true black in it either — the darkest
   * thing on the field is still lit by the sky. It is also where a mood keeps its
   * shadows once the curve has taken their chroma: cool for dusk, cold soot for the
   * last stand.
   *
   * Post-encode, and that is the whole difference between a print black and a
   * crushed frame. In display-linear the same floor is enormous relative to the
   * signal beneath it — 0.018 of blue is code value 36, while the darkest quarter
   * of a night framing arrives at 0.0025 — so it buried four stops of shadow
   * separation under a constant and cost the frame its bottom two luma buckets.
   * In code values a 6-code floor raises the black by 6 codes and leaves every
   * difference above it intact.
   */
  shadowLift: Rgb;
  /**
   * Target width of the frame's own +/-1 sigma band, in display code values, that
   * the metered response stretches toward. Measured off the framings this look was
   * authored on: the sun-side wides land at 0.33 and score 15 of 16 luma buckets,
   * so a look that wants to match them asks for about that. Raising it asks every
   * framing for more contrast, which is why the last stand asks for more.
   */
  adaptBand: number;
  /**
   * How much of the shortfall against `adaptBand` is actually corrected, 0..1.
   * Deliberately partial for the same reason `balanceStrength` is: a fully
   * normalised frame has had its own character taken away, and how much range a
   * framing has is part of that character.
   */
  adapt: number;
  /** Ceiling on the stretch. A frame with almost no range must not be forced. */
  adaptCeiling: number;
  /**
   * Share of the stretch spent raising the pivot rather than only turning about
   * it, 0..1. At 0 the response is pure contrast and the frame's mean does not
   * move, which is what keeps a night framing dark; every point above that is a
   * deliberate brightening, and it is the dial to reach for last.
   */
  adaptLift: number;
  /**
   * Local contrast at dodge-and-burn scale — a 32-pixel radius, so it acts on the
   * band a brow, a cheekbone, a fold of wool or a mail edge occupy and not on
   * texture grain. This is the only tool the grade has for putting highlight
   * structure on a subject the render lit flatly, and it raises the frame's
   * effective spread without moving its mean.
   */
  clarity: number;
  /** How much the metered stretch scales `clarity`. A frame that needs range needs detail. */
  clarityAdapt: number;
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
  // The separation dial. Against the dusk illuminant [1, 0.82, 0.62] the
  // orthogonal direction is roughly green-vs-magenta, which is where turf, iron and
  // dyed wool differ from timber and thatch; timber's own chroma lies on the warm
  // axis and is untouched. A fifth again of that component is enough for the turf
  // in `lineup` to read as turf; much past a quarter and the red on a shield starts
  // to walk toward crimson.
  chromaOpponent: 0.22,
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
  // Straddling the frame's own interquartile range, which measures at 0.16 to 0.35
  // of display *code value* across the eight dusk captures, median 0.20 to 0.26.
  // v2 ramped 0.0 -> 0.85, so every one of those midtones landed at the midpoint of
  // the two tints — and the midpoint of a cool tint and a warm one is grey.
  // Narrowed to this, the same two tints put a quarter of the frame decisively cool
  // and a quarter decisively warm. Unchanged from v4 in value; the fix was that the
  // shader now compares them against the encoded luma they were measured from
  // rather than against display-linear luma, which is three times smaller down
  // here and put the whole crossover off the top of every frame.
  splitLow: 0.14,
  splitHigh: 0.42,
  // Dusk's crossover is its anchor, which is what this look always did and what
  // its captures were scored on. It gets away with it where the last stand does
  // not because dusk's key reaches most of the frame: the crossover's neutral
  // midpoint at 0.28 sits above a median of 0.27 rather than on top of a mode
  // holding 42% of the pixels, so the ramp is traversed by the picture instead of
  // parked on it. Measured on v6/duel.png the B/R bands still come out 0.69 /
  // 0.74 / 0.56 / 0.54 / 0.57 — shallow, and the thing to fix next here.
  tintLow: 0.14,
  tintHigh: 0.42,
  // Code values now, not display-linear: a floor of 3 / 6 / 13 out of 255, cool,
  // which is about what a good black-and-white print holds. The same *intent* as
  // v4's [0.004, 0.008, 0.018] and roughly the same visible black, except it no
  // longer sits on top of the shadow detail — see the field docs.
  shadowLift: [0.012, 0.022, 0.05],
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
  grain: 0.018,
  aoIntensity: 1.0,
  // 0.32 is what `duel` and `lineup` measure, and those are the two framings this
  // whole look was tuned against — so asking for their band is asking every other
  // framing to be graded the way the good ones already are, and it makes the
  // response an exact no-op on them rather than something that has to be held back.
  adaptBand: 0.32,
  // 0.85 of the shortfall. The last sixth is left on the table on purpose: the
  // close night framings genuinely do have less range than a shot with a burning
  // horizon in it, and a fully normalised set of captures would all read the same.
  adapt: 0.85,
  // Portrait needs 1.7 and stance 1.76. The ceiling is there for a framing with its
  // face in a wall, where the honest answer is a dark frame and not a forced one.
  adaptCeiling: 1.9,
  // Low, and it is the number to be suspicious of. At 0.22 the night framings come
  // up by two code values of mean luma and gain three luma buckets; at 0.6 they
  // gain nothing further and start to read as an overcast afternoon.
  adaptLift: 0.22,
  clarity: 0.14,
  clarityAdapt: 0.9,
};

// The last stand is a different response, not a red filter. Half the highlight
// latitude, so everything the fire touches blows out where dusk would have held
// it; contrast up about a lower pivot, so the midtones collapse and only the
// fire-lit reads; crosstalk *down*, so a flame stays a screaming primary instead
// of rolling gracefully to white; and every subjective term pushed harder —
// vignette, grain, occlusion.
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
// anything in dusk. The shadow end goes cold to meet it, because the complementary
// contrast against a hot key is what makes a frame feel desperate rather than
// nostalgic, and because warm-shadow-plus-warm-key is the sepia we are getting out
// of. Hotter where the fire reaches, colder and greyer everywhere it does not.
//
// v6 still came back as one hue, and the reason was structural rather than a tint
// value: the split-tone's crossover ran 0.10 -> 0.34 against a frame whose p10 and
// p90 are 0.112 and 0.375, so it bracketed the entire picture and its own neutral
// midpoint landed on the mode. Every stage below was authored correctly and the
// stage that was supposed to separate them averaged them instead. The crossover is
// now stated separately from the tonal anchor and lifted above the third quartile
// — see the header — so the ash is ash and the fire is the only thing in frame
// wearing the key's colour.
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
  // With the tilt's pivot finally landing inside the frame instead of a stop above
  // it, this is the number that does the work: fire-lit surfaces go hotter and more
  // saturated than anything in dusk while everything the fire misses falls to grey
  // soot. Through v4 the pivot was off the top of the frame, `clamp(q,-1,1)` was
  // pinned at -1 everywhere, and this line was silently rendering the whole look at
  // 0.63 saturation — the flat apricot in the captures was this, not the tint.
  chromaTilt: 0.45,
  // Lower than dusk's, because this look reinstates its warmth hard and on purpose
  // through `highlightTint`; expanding across the illuminant as well would start
  // arguing with it. Enough to keep the turf and the mail off the timber.
  chromaOpponent: 0.18,
  // Cold soot, and now genuinely cold rather than "a few per cent" — because with
  // the crossover moved off the mode this tint is what four fifths of the frame is
  // actually multiplied by, instead of being a tail the picture never reached.
  //
  // Green sits *on* the line from red to blue, which is what makes it ash rather
  // than night: dusk's shadow is [0.74, 0.9, 1.28], the same coldness with green
  // 0.11 under that line, and the magenta bias in it is exactly what reads as a
  // blue-lit sky shadow. Take the bias out and the same coldness reads as smoke.
  //
  // The pair is set against itself on both metrics that matter, which is the part
  // v6 had backwards. On Rec.709 luma they run 0.931 -> 1.087, so the split
  // stretches the histogram by a sixth — the one stage that legitimately does, and
  // where a dark frame gets its top end from. On the capture harness's unweighted
  // (r+g+b)/3 they run 0.983 -> 1.003, flat enough that no tonal bucket can be lost
  // to a tint change. v6's pair failed both: 0.853 -> 0.833 unweighted, so the split
  // ran *backwards* on the metric the frame is scored by and darkened both ends by
  // about 15% on the way. The frame's own mode came out multiplied by
  // [1.006, 0.839, 0.758] — one warm-neutral cast, 13% down, over the largest
  // population of pixels in the picture, with no stretch in it at all. The flatness
  // and the single hue are the same arithmetic.
  //
  // B/R runs 1.63 in the ash against 0.34 in the ember: a factor of nearly five
  // between what the fire reaches and what it does not, where v6 held 0.22 to 0.28
  // across the whole frame.
  shadowTint: [0.76, 0.95, 1.24],
  highlightTint: [1.48, 1.03, 0.5],
  splitTone: 0.85,
  // The anchor, and it stays on the picture: measured on v6/laststand.png the
  // quartiles are 0.157 / 0.212 / 0.289, so this pair brackets them and the chroma
  // tilt's argument sweeps its full range across the frame instead of pinning.
  splitLow: 0.1,
  splitHigh: 0.34,
  // The crossover, and it sits *above* the picture on purpose. p75 is 0.289 and p90
  // is 0.375, so four fifths of the frame is below `tintLow` and takes the cold ash
  // tint outright, the transition runs through the last decile, and only the 4% of
  // pixels past 0.45 — the ember horizon, the torch, the fire-lit ground and the
  // sky beside it — reach the hot end.
  //
  // That is the whole difference in kind from dusk. Dusk grades a ramp across its
  // whole range; this grades a hot sliver against an ash field, which is what a
  // point source in smoke actually does and what reads as desperate rather than
  // nostalgic. It is also where the apparent contrast comes from: a frame is read
  // as hot by the distance between its hottest and coolest regions, not by its mean
  // hue, which is why v3 read hotter than v6 on a lower luma spread.
  tintLow: 0.3,
  tintHigh: 0.54,
  // A cold soot floor rather than a warm one, and higher than dusk's — 8 / 8 / 11
  // code values. The "no true black" argument still holds and holds harder here,
  // because the air carries three times the aerosol; what it does not justify is
  // that floor being the same colour as the key. It can be this large now only
  // because it lands after the encode: the same amount in display-linear was what
  // left this preset with the least tonal room in the set.
  shadowLift: [0.03, 0.032, 0.045],
  // Higher than dusk's, not lower: the last stand's air carries three times the
  // aerosol and its sun is hotter, so the sky it has to clear is brighter. At
  // 1.6 the entire pall was over threshold and the frame came back as one flat
  // apricot with no separation between a warrior and the palisade behind him.
  bloomStrength: 1.2,
  bloomThreshold: 6.0,
  // The last stand's air carries three times the aerosol, so the sky it has to
  // clear is brighter than dusk's and the threshold is already higher to match.
  // The band runs 5.50 -> 6.00.
  bloomKnee: 0.5,
  // Still warmer than dusk's, because a fire's glow genuinely is, but pulled back
  // toward neutral: the bloom skirt is the widest signal in the chain and this look
  // now spends its warmth deliberately, in the split-tone, on the 4% of the frame
  // the fire reaches. A warm tint on a glow that lands everywhere argues with that
  // — it is the same warm multiply applied twice, and the second one is the one
  // that covers the ash.
  bloomTint: [1.0, 0.9, 0.78],
  vignette: 0.55,
  grain: 0.052,
  aoIntensity: 1.3,
  // Wider than dusk's and corrected in full, which is this look asking for more
  // contrast than dusk rather than less — on brief, since the whole idea is that
  // the midtones collapse and only what the fire reaches reads. It is also the
  // preset with the least range in the scene to start with: its own band measures
  // 64 code values against the wides' 84, so without this it sits on the bar's
  // eight-bucket floor with nothing to spare.
  adaptBand: 0.36,
  adapt: 1.0,
  adaptCeiling: 2.0,
  // Half dusk's. The last stand should be a dark frame lit by fire, so the response
  // is allowed to give it contrast and almost no brightness.
  adaptLift: 0.15,
  clarity: 0.14,
  clarityAdapt: 0.9,
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
  out.chromaOpponent = m(a.chromaOpponent, b.chromaOpponent);
  out.shadowTint = mc(a.shadowTint, b.shadowTint);
  out.highlightTint = mc(a.highlightTint, b.highlightTint);
  out.splitTone = m(a.splitTone, b.splitTone);
  out.splitLow = m(a.splitLow, b.splitLow);
  out.splitHigh = m(a.splitHigh, b.splitHigh);
  out.tintLow = m(a.tintLow, b.tintLow);
  out.tintHigh = m(a.tintHigh, b.tintHigh);
  out.shadowLift = mc(a.shadowLift, b.shadowLift);
  out.bloomStrength = m(a.bloomStrength, b.bloomStrength);
  out.bloomThreshold = m(a.bloomThreshold, b.bloomThreshold);
  out.bloomKnee = m(a.bloomKnee, b.bloomKnee);
  out.bloomTint = mc(a.bloomTint, b.bloomTint);
  out.vignette = m(a.vignette, b.vignette);
  out.grain = m(a.grain, b.grain);
  out.aoIntensity = m(a.aoIntensity, b.aoIntensity);
  out.adaptBand = m(a.adaptBand, b.adaptBand);
  out.adapt = m(a.adapt, b.adapt);
  out.adaptCeiling = m(a.adaptCeiling, b.adaptCeiling);
  out.adaptLift = m(a.adaptLift, b.adaptLift);
  out.clarity = m(a.clarity, b.clarity);
  out.clarityAdapt = m(a.clarityAdapt, b.clarityAdapt);
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

const LUMA_VEC = "vec3( 0.2126, 0.7152, 0.0722 )";

/**
 * A number spelled as a GLSL float literal.
 *
 * Interpolating a JS number into shader source is a quiet trap: `${16}` is `16`,
 * which GLSL ES reads as an *int*, and there is no implicit conversion in argument
 * position — `clamp( x, 0.001, 16 )` fails to compile with "no matching overloaded
 * function", at runtime, on whichever device happens to run it first.
 */
function glslFloat(v: number): string {
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
}

// The tone transfer, shared verbatim between the grade and the 1x1 pass that
// derives the metered response, because the two have to agree exactly: the meter's
// job is to work out where the frame's own tonal band *lands* under this look's
// curve, and it can only do that by evaluating the same curve.
//
// `encode1` / `decode1` are the sRGB transfer function and its inverse, not a 2.2
// gamma. The difference is the linear segment under 0.0031, and it is not cosmetic:
// a stretch written against a pure power over-darkens the bottom stop by a factor
// of two, which turns a legible night frame into a black mass with a histogram
// spike at the print black. Measured, that mistake cost portrait 12 code values off
// its mean and put 16% of the frame in the bottom bucket.
const GLSL_TONE = /* glsl */ `
float filmic1( float x ) {
  const float A = 0.15, B = 0.50, C = 0.10, D = 0.20, E = 0.02, F = 0.30;
  return ( ( x * ( A * x + C * B ) + D * E ) / ( x * ( A * x + B ) + D * F ) ) - E / F;
}
float encode1( float v ) {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * pow( max( v, 0.0 ), 0.41666 ) - 0.055;
}
float decode1( float c ) {
  return c <= 0.04045 ? c / 12.92 : pow( max( ( c + 0.055 ) / 1.055, 0.0 ), 2.4 );
}
// Scene radiance -> this look's display code value. Exposure, the contrast power
// and the normalised filmic curve, in that order, exactly as the grade runs them.
float sceneToCode( float L ) {
  float x = uPivot * pow( max( L * uExposure, 1e-5 ) / uPivot, uContrast );
  return encode1( clamp( filmic1( x ) * uWhiteScale, 0.0, 1.0 ) );
}
`;

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

/**
 * Per-rung upsample weight. Compounds, so level n lands at 0.62^n.
 *
 * Down from 0.72, and the asymmetry is the point. The rungs are added at the same
 * place, so the tightest levels — the halo that makes a flame read as a flame —
 * lose 6% between them, while the widest mip, which is a fifty-pixel blur at 1080p
 * and therefore the only rung that can reach a man standing beside the fire, loses
 * 45%. The core sum falls from 2.88x the bright-pass value to 2.39x.
 *
 * That is the lever for the bonfire glow landing on a warrior's sword arm in
 * `brawl`, and it is the right one: the gate is not the problem (see BLOOM_BRIGHT
 * — the arena's brightest emissive is the torch flame at 9 linear units against a
 * threshold of 5, so only genuinely emissive things are in the pyramid at all),
 * the problem is how far what is legitimately in it is allowed to spread. A wide
 * additive skirt is also a near-constant added across the frame, which compresses
 * every contrast under it — the same mechanism the header describes for the sky.
 */
const BLOOM_SKIRT = 0.62;

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
// Metering
// ---------------------------------------------------------------------------

/**
 * Stops added to log2 luminance before it is squared, so the second moment stays
 * in a range a half-float can resolve.
 *
 * The reduction targets are half-float like everything else in the chain, and a
 * variance is a difference of two nearly equal numbers. Raw log2 radiance runs to
 * -10, so the squared term reaches 100, where half-float steps by 0.06 — against a
 * variance of about 1.1 that is a 5% error in the sigma the whole response hangs
 * off. Centred on this reference stop the squared term sits near 1.2 and resolves
 * to a thousandth. 3.0 is chosen to be roughly the arena's own key (2^-3 = 0.125
 * linear), so it is the natural place to measure from as well as the safe one.
 */
const METER_LOG_MID = 3.0;

/** Clamp on luminance before the log, so an unlit pixel and an infinity both behave. */
const METER_FLOOR = 1e-3, METER_CEIL = 16.0;

/**
 * Which mip of the reduction carries the low-frequency copy the grade uses for
 * local contrast. The chain seeds at quarter resolution, so mip 3 is 1/32 of the
 * frame — a 32-pixel radius at 1080p.
 *
 * That radius is the whole point and it is not a free parameter. Finer than about
 * 16 pixels and the term acts on texture rather than on form, and the capture
 * harness's own metric averages 10x10 blocks so none of it would survive to be
 * scored either. Coarser than about 64 and it stops being local contrast and starts
 * being a second vignette. A brow, a cheekbone, a fold of wool and the edge of a
 * mail sleeve at portrait framing are all in between.
 */
const METER_BLUR_MIP = 3;

/** Time constant of the temporal adaptation, in seconds. */
const METER_TAU = 0.55;

// R = log2 luminance about the reference stop, G = its square, B = the luminance
// itself for the low-frequency copy. Seeded at quarter resolution with four
// bilinear taps, so each tap is already a 2x2 average and the four together cover
// the destination texel's whole 4x4 footprint.
//
// The log is therefore taken of a 4x4 average rather than per pixel, which by
// Jensen biases the key up and the variance down a little at that one scale. That
// is measured and accounted for in the tuning rather than corrected: it costs a
// quarter of the bandwidth a full-resolution seed would, and a metering statistic
// does not need to be exact, it needs to be stable.
const METER_SEED = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * 0.25;
  vec3 c = texture2D( tDiffuse, vUv + vec2( -o.x, -o.y ) ).rgb;
  c += texture2D( tDiffuse, vUv + vec2(  o.x, -o.y ) ).rgb;
  c += texture2D( tDiffuse, vUv + vec2( -o.x,  o.y ) ).rgb;
  c += texture2D( tDiffuse, vUv + vec2(  o.x,  o.y ) ).rgb;
  float L = clamp( dot( c * 0.25, ${LUMA_VEC} ), ${glslFloat(METER_FLOOR)}, ${glslFloat(METER_CEIL)} );
  float d = log2( L ) + ${glslFloat(METER_LOG_MID)};
  gl_FragColor = vec4( d, d * d, L, 1.0 );
}`;

// Plain box average of all channels. Four bilinear taps rather than one, because a
// single tap is only the exact 2x2 mean when the source is exactly twice the
// destination, and half these levels are odd-sized — a 225-row buffer halved drops
// whole rows out of the average otherwise, and the global mean is what the response
// is anchored on.
const METER_DOWN = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * 0.25;
  vec4 s = texture2D( tDiffuse, vUv + vec2( -o.x, -o.y ) );
  s += texture2D( tDiffuse, vUv + vec2(  o.x, -o.y ) );
  s += texture2D( tDiffuse, vUv + vec2( -o.x,  o.y ) );
  s += texture2D( tDiffuse, vUv + vec2(  o.x,  o.y ) );
  gl_FragColor = s * 0.25;
}`;

// One pixel, and it does all the arithmetic the grade would otherwise repeat two
// million times. Output is (smoothed mean, smoothed second moment, stretch, pivot):
// the first two so the smoothing has somewhere to live, the last two ready for the
// grade to use with nothing but a multiply-add.
//
// Smoothing happens on the moments rather than on the derived stretch, because the
// moments are physical and the derivation is not linear in them. It exists because
// the bonfire flickers: without it the frame's contrast breathes at fire frequency,
// which reads as the whole picture pumping.
const METER_DERIVE = /* glsl */ `
uniform sampler2D tCur;
uniform sampler2D tPrev;
uniform float uRate;
uniform float uExposure;
uniform float uWhiteScale;
uniform float uContrast;
uniform float uPivot;
uniform float uBand;
uniform float uAdapt;
uniform float uCeiling;
varying vec2 vUv;
${GLSL_TONE}
void main() {
  vec2 cur = texture2D( tCur, vec2( 0.5 ) ).rg;
  // Branch rather than mix at full rate, and the branch is on a uniform so it costs
  // nothing: on the first frame after construction or a resize there is no history,
  // and mix(x, y, 1.0) is x*0.0 + y*1.0 — which is a NaN if x ever is one, and the
  // NaN would then be latched into the history for the life of the frame buffer.
  vec2 sm = uRate >= 1.0 ? cur : mix( texture2D( tPrev, vec2( 0.5 ) ).rg, cur, uRate );

  float sigma = sqrt( max( sm.y - sm.x * sm.x, 0.0 ) );
  float key = exp2( sm.x - ${glslFloat(METER_LOG_MID)} );
  float spread = exp2( sigma );

  // Where the frame's own +/-1 sigma band lands once this look's curve has had it.
  // The pivot is clamped well inside the range because the response divides by it
  // and by its complement: a frame that is genuinely almost black would otherwise
  // ask for a pivot of nothing and get an infinite slope out of it.
  float pivot = clamp( sceneToCode( key ), 0.02, 0.6 );
  float band = max( sceneToCode( key * spread ) - sceneToCode( key / spread ), 1e-3 );

  float stretch = 1.0 + ( clamp( uBand / band, 1.0, uCeiling ) - 1.0 ) * uAdapt;
  gl_FragColor = vec4( sm, stretch, pivot );
}`;

function meterTarget(width: number, height: number): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
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
 * Reduces the scene buffer to the two numbers the response needs — the mean and
 * variance of log luminance — and keeps a low-frequency copy on the way down.
 *
 * A generator like BloomChain: it reads the composer's colour buffer, writes only
 * private targets and hands nothing back, so it costs no buffer swap. It has to sit
 * ahead of bloom, because what should be metered is the scene and not the glow the
 * grade is about to add to it.
 *
 * Cost is dominated by the seed, which reads a quarter of the frame with four taps
 * — measured at a third of one full-screen pass on the capture box. Everything
 * below 200x113 is rounding error, and the derive is a single pixel.
 */
class MeterPass extends Pass {
  /**
   * The uniform the grade samples. Shared by reference rather than copied, because
   * the 1x1 result ping-pongs and the grade has to follow it without a hook between
   * the two passes.
   */
  readonly result: THREE.IUniform = { value: null };
  /** The low-frequency copy, for local contrast. Stable identity across resizes. */
  readonly lowFreq: THREE.IUniform = { value: null };

  private readonly mips: THREE.WebGLRenderTarget[] = [];
  private readonly adapt: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private levels = 1;
  private write = 0;
  /** Forces full adoption while the meter has no history — first frame, resize. */
  private warm = true;
  private readonly seed: THREE.ShaderMaterial;
  private readonly down: THREE.ShaderMaterial;
  private readonly derive: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor(width: number, height: number) {
    super();
    this.needsSwap = false;

    const mat = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: FS_VERT,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
      });

    this.seed = mat(METER_SEED, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.down = mat(METER_DOWN, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.derive = mat(METER_DERIVE, {
      tCur: { value: null },
      tPrev: { value: null },
      uRate: { value: 1 },
      uExposure: { value: DUSK.exposure },
      uWhiteScale: { value: whiteScale(DUSK.white) },
      uContrast: { value: 1 + DUSK.contrast },
      uPivot: { value: DUSK.pivot },
      uBand: { value: DUSK.adaptBand },
      uAdapt: { value: DUSK.adapt },
      uCeiling: { value: DUSK.adaptCeiling },
    });

    this.adapt = [meterTarget(1, 1), meterTarget(1, 1)];
    this.quad = new FullScreenQuad(this.seed);
    this.setSize(width, height);
  }

  /**
   * The look's half of the derivation, pushed every frame like the grade's. The
   * first four have to match the grade's own uniforms exactly — the meter is asking
   * "where does this frame land under that curve", and it cannot answer with a
   * different curve.
   */
  setResponse(r: {
    exposure: number; white: number; contrast: number; pivot: number;
    band: number; adapt: number; ceiling: number;
  }): void {
    const u = this.derive.uniforms;
    u.uExposure.value = r.exposure;
    u.uWhiteScale.value = whiteScale(r.white);
    u.uContrast.value = 1 + r.contrast;
    u.uPivot.value = Math.max(0.02, r.pivot);
    u.uBand.value = Math.max(0.02, r.band);
    u.uAdapt.value = THREE.MathUtils.clamp(r.adapt, 0, 1);
    u.uCeiling.value = Math.max(1, r.ceiling);
  }

  /** Seconds of real time since the last frame. Drives the adaptation rate only. */
  setDelta(dt: number): void {
    // Exponential approach to the measured value, so the rate is frame-rate
    // independent. Full adoption while warming: a capture renders sixty frames and
    // then screenshots, and a mood cut has no history worth blending from.
    this.derive.uniforms.uRate.value = this.warm ? 1 : 1 - Math.exp(-Math.max(dt, 0) / METER_TAU);
  }

  /** Drops the adaptation history, so the next frame adopts what it measures. */
  reset(): void {
    this.warm = true;
  }

  setSize(width: number, height: number): void {
    let w = Math.max(1, Math.round(width / 4));
    let h = Math.max(1, Math.round(height / 4));
    const dims: [number, number][] = [[w, h]];
    // Always run the chain all the way to a single texel: the derive reads the last
    // level at the centre of the texture, which is only the frame's mean if that
    // level is one pixel.
    while (w > 1 || h > 1) {
      w = Math.max(1, Math.round(w / 2));
      h = Math.max(1, Math.round(h / 2));
      dims.push([w, h]);
    }
    this.levels = dims.length;
    for (let i = 0; i < this.levels; i++) {
      if (this.mips[i]) this.mips[i].setSize(dims[i][0], dims[i][1]);
      else this.mips[i] = meterTarget(dims[i][0], dims[i][1]);
    }
    this.lowFreq.value = this.mips[Math.min(METER_BLUR_MIP, this.levels - 1)].texture;
    this.warm = true;
  }

  private blit(target: THREE.WebGLRenderTarget, material: THREE.ShaderMaterial, renderer: THREE.WebGLRenderer): void {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    this.quad.render(renderer);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    void writeBuffer; // private targets; nothing is handed back
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;

    this.seed.uniforms.tDiffuse.value = readBuffer.texture;
    setTexel(this.seed.uniforms.uTexel.value as THREE.Vector2, this.mips[0].width, this.mips[0].height);
    this.blit(this.mips[0], this.seed, renderer);

    for (let i = 1; i < this.levels; i++) {
      this.down.uniforms.tDiffuse.value = this.mips[i - 1].texture;
      setTexel(this.down.uniforms.uTexel.value as THREE.Vector2, this.mips[i].width, this.mips[i].height);
      this.blit(this.mips[i], this.down, renderer);
    }

    this.write ^= 1;
    this.derive.uniforms.tCur.value = this.mips[this.levels - 1].texture;
    this.derive.uniforms.tPrev.value = this.adapt[this.write ^ 1].texture;
    this.blit(this.adapt[this.write], this.derive, renderer);
    this.result.value = this.adapt[this.write].texture;
    this.warm = false;

    renderer.autoClear = autoClear;
  }

  dispose(): void {
    for (const rt of this.mips) rt.dispose();
    this.mips.length = 0;
    this.adapt[0].dispose();
    this.adapt[1].dispose();
    this.seed.dispose();
    this.down.dispose();
    this.derive.dispose();
    this.quad.dispose();
  }
}

// ---------------------------------------------------------------------------
// Grade
// ---------------------------------------------------------------------------

// Everything display-side in one pass. The order inside it matters: bloom adds
// in HDR, the curve runs exactly once, and only after that does anything
// subjective happen.
const GRADE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform sampler2D tMeter;
uniform sampler2D tLowFreq;
uniform float uExposure;
uniform float uBloom;
uniform vec3 uBloomTint;
uniform float uWhiteScale;
uniform vec3 uBalance;
uniform float uCrosstalk;
uniform float uCrossKnee;
uniform float uContrast;
uniform float uPivot;
uniform float uAdaptLift;
uniform float uClarity;
uniform float uClarityAdapt;
uniform float uSaturation;
uniform float uChromaMid;
uniform float uChromaTilt;
uniform vec3 uOpponent;
uniform float uChromaOpponent;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uSplit;
uniform vec2 uSplitRange;
uniform vec2 uTintRange;
uniform vec3 uShadowLift;
uniform float uVignette;
uniform float uGrain;
uniform float uHurt;
uniform vec3 uHurtColor;
uniform float uPressure;
uniform float uTime;
varying vec2 vUv;

${GLSL_TONE}

// Hable's rational curve: a toe, a near-linear midsection and a shoulder that
// approaches its asymptote slowly enough to hold several stops above white.
// Unnormalised — uWhiteScale is 1/filmicCurve(white), computed once on the CPU,
// and it is the whole highlight-latitude control.
vec3 filmicCurve( vec3 x ) {
  return vec3( filmic1( x.r ), filmic1( x.g ), filmic1( x.b ) );
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

  // One tap. There were three, with R and B fetched a little way out from and in
  // toward the centre — a radial chromatic aberration, cut twice for being called a
  // defect and now gone rather than cut a third time.
  //
  // "Sub-pixel" was always the wrong test for it. Separation is not the artefact;
  // what a viewer sees is the colour difference the offset writes into the one pixel
  // an edge lands on, and a bilinear tap 0.28 px off a step lifts that channel by
  // 0.28 of the whole step — some 35 code values across a hard silhouette in the
  // corner, single digits over most of the frame. This arena is built almost
  // entirely out of that kind of edge: alpha-tested leaf cards, twigs, thatch
  // battens, hut ridges, palisade tips, carved runes.
  //
  // Being straight about how much of the beading was actually this: not most of it.
  // The last stand shipped ten times this value in v6 and its silhouettes carry
  // *less* edge colour than v7's, because v7's edges are sharper. The bead chains
  // are chroma that the render puts on a silhouette pixel being displayed at full
  // strength because that pixel has no anti-aliased neighbour to average against —
  // which is MSAA_SAMPLES' problem, not this line's. What remains true is that this
  // line's entire product was chroma on exactly those pixels, for two extra
  // full-resolution taps in the widest pass in the chain, and nothing in the frame
  // is better for it. A lens artefact worth having would have to be built on a
  // signal that knows where the edges are, which is what an AA pass already
  // computes.
  vec3 hdr = texture2D( tDiffuse, vUv ).rgb;

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

  // ---- the metered response ------------------------------------------------
  //
  // Everything from here down works on the frame's own display code values, which
  // is the space the look's tonal numbers were measured in and the space the
  // capture harness scores. One 1x1 tap carries the two derived scalars: how hard
  // to turn contrast, and the code value to turn it about.
  vec4 meter = texture2D( tMeter, vec2( 0.5 ) );
  // Clamped here as well as in the derive, so this stage is well defined for any
  // contents of that texture. It divides by the pivot and by its complement, and a
  // grade that produces an infinity if some future reordering runs it before the
  // meter has written anything is a grade that fails as a white frame.
  float stretch = max( meter.z, 1.0 );
  float pivot = clamp( meter.w, 0.02, 0.6 );
  float pivotTo = clamp( pivot * ( 1.0 + ( stretch - 1.0 ) * uAdaptLift ), 0.02, 0.75 );
  float clarity = uClarity * ( 1.0 + ( stretch - 1.0 ) * uClarityAdapt );

  float lum0 = dot( col, ${LUMA_VEC} );
  float e = encode1( lum0 );

  // Local contrast against a 32-pixel average of the same curve. Unsharp masking
  // belongs in a perceptual space or its amplitude means different things in the
  // shadows and the highlights, which is why both sides of the difference are
  // encoded. The clamp is the halo guard: across a silhouette edge the difference
  // saturates instead of growing, so a warrior against a bright sky gains form
  // rather than an outline.
  float detail = e - sceneToCode( texture2D( tLowFreq, vUv ).b );
  e += clarity * clamp( detail, -0.22, 0.22 );

  // Two power laws meeting at the pivot. Both endpoints are fixed points by
  // construction — 0 stays 0 and 1 stays 1 — so the frame gains range at both ends
  // instead of sliding up the way a gain would, display white survives a hard
  // stretch, and the whole stage collapses to the identity at stretch 1 with
  // pivotTo == pivot. That identity is what lets the night framings be corrected
  // without the daylight ones moving at all.
  float below = pivotTo * pow( max( e, 0.0 ) / pivot, stretch );
  float above = 1.0 - ( 1.0 - pivotTo ) * pow( max( 1.0 - e, 0.0 ) / ( 1.0 - pivot ), stretch );
  e = mix( below, above, step( pivot, e ) );

  // Applied as a scalar gain on luma rather than per channel: a per-channel
  // contrast curve desaturates everything it steepens, and chroma is the next
  // stage's business.
  col = min( col * ( decode1( e ) / max( lum0, 1e-4 ) ), vec3( 1.0 ) );

  float luma = dot( col, ${LUMA_VEC} );
  float lumaE = encode1( luma );

  // Chroma, shaped along the luma axis rather than applied flat, and anchored to
  // the split crossover rather than to the middle of the range. That anchoring is
  // the point: these frames sit at a median code value of about 0.22, so a bump
  // written to peak at 0.5 peaks a stop above every midtone it was meant to find,
  // and a tilt pivoted at 0.5 is one-sided across the whole picture — it quietly
  // desaturated the entire last stand instead of trading colour between its lit
  // and unlit halves. One tonal anchor drives the tint crossover, the bump's
  // centre and the tilt's pivot, so "where the picture lives" is stated once.
  //
  // Against lumaE, not luma. The anchor is in code values, and comparing it to
  // a display-linear luma is a factor of three out down here — which is exactly the
  // bug that pushed the whole crossover off the top of every frame in the game.
  //
  // The bump is a Lorentzian rather than a gaussian because it costs a divide
  // instead of an exp and its wider tails are the more forgiving shape here.
  float mid = 0.5 * ( uSplitRange.x + uSplitRange.y );
  float halfSpan = max( 0.5 * ( uSplitRange.y - uSplitRange.x ), 1e-3 );
  float q = ( lumaE - mid ) / halfSpan;
  float chroma = uSaturation
    + uChromaMid / ( 1.0 + q * q )
    + uChromaTilt * clamp( q, -1.0, 1.0 );
  chroma = max( chroma, 0.0 );

  vec3 offset = col - vec3( luma );

  // Anisotropic expansion, across the illuminant axis only. uOpponent is the
  // luma-free direction of the key this look is correcting for, so the component
  // along it is "how far toward the key's own hue this surface is" — which under one
  // warm source is nearly all of every surface's chroma and carries no material
  // information. The component across it is the part that separates turf from
  // timber and iron from thatch, and this is the only stage that can push on one
  // without the other. Before the gamut guard, so an expansion that would clip
  // eases back with everything else.
  offset += ( offset - dot( offset, uOpponent ) * uOpponent ) * uChromaOpponent;

  // Gamut guard. Scaling chroma about luma is exactly luma-preserving, which is
  // why all of this is safe for the capture harness's tonal spread — but past a
  // certain scale it drives the weakest channel negative, and a channel clamped
  // to zero reads as a flat block of primary with no detail in it. The largest
  // scale that keeps every channel non-negative is -luma/lowest, so clamping the
  // divisor away from zero rather than branching on it gives the exact same
  // answer: where no channel would have gone negative the bound is enormous and
  // the min is a no-op, and where one would, chroma eases back to the edge of the
  // gamut and the pixel desaturates gracefully instead of clipping.
  float lowest = min( offset.r, min( offset.g, offset.b ) );
  chroma = min( chroma, -luma / min( lowest, -1e-5 ) );
  col = vec3( luma ) + offset * chroma;

  // The split-tone, over uTintRange and not over the tonal anchor above. The two
  // are separate because they want opposite placements, and getting that wrong is
  // how a look with genuine complementary contrast in its numbers renders as one
  // hue: this mix passes through the *average* of the two tints at the midpoint of
  // its crossover, and the average of a cool tint and a warm one is a desaturated
  // near-neutral. Whatever population of pixels sits on that midpoint gets a flat
  // cast instead of a tint, and if that population is the frame's mode then the
  // stage has separated nothing and cast everything.
  //
  // So the crossover is a statement about the histogram, not about the range: put
  // it where the key's light stops. Dusk's key reaches most of its frame and its
  // crossover traverses it; the last stand's is a point source, so its crossover
  // sits above the third quartile and the ash below it is left decisively cold.
  vec3 tint = mix( uShadowTint, uHighlightTint, smoothstep( uTintRange.x, uTintRange.y, lumaE ) );
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

  // The print black, here rather than before the encode, and for the same reason
  // the grain is: a floor stated in code values costs the shadows nothing but the
  // floor. Before the encode, 0.018 of blue is code value 36 sitting on top of a
  // signal that arrives at 0.0025 in a night framing — two shadows four stops apart
  // came out three code values apart, and the bottom two luma buckets of the
  // histogram were empty because nothing in the frame could reach them.
  //
  // Faded by the square of encoded luma so it lands on the bottom stop and nowhere
  // else, and off luma rather than per channel so the floor is a clean tint instead
  // of a per-channel curve. Dusk's floor is cool sky, the last stand's is cold soot;
  // that difference is part of why the two moods do not read as the same frame.
  float black = 1.0 - clamp( dot( srgb, ${LUMA_VEC} ), 0.0, 1.0 );
  srgb += uShadowLift * black * black;

  // Grain and dither both live here, after the encode, where an amplitude in
  // code values means what it says. In linear the same number is thirteen times
  // larger coming back out of a near-black shadow, which is how post grain
  // usually ends up looking like sensor noise instead of film.
  float t = fract( uTime );
  float n = hash12( gl_FragCoord.xy + t * 1731.0 );
  srgb += ( n - 0.5 ) * uGrain * ( 1.0 - dot( srgb, ${LUMA_VEC} ) * 0.7 );

  // The dither that keeps a sixty-degree sky gradient off its own contours —
  // failure #8 on the bar — now triangular rather than uniform. Two independent
  // draws summed: a uniform +/-0.5 LSB decorrelates the quantiser's mean error from
  // the signal but leaves its variance riding on it, so a slow ramp still shows the
  // noise floor breathing along the contour the dither exists to hide. The pair
  // fixes both moments for 1/sqrt(6) LSB of noise against 1/sqrt(12) — a fifth of a
  // code value more, which is nothing beside the grain on the line above. Distinct
  // offsets on all three draws, because they share one hash and a swizzle is not
  // independence.
  //
  // What this line cannot do, measured on v7 before it changed: the output was
  // already fully dithered — 1-2% of sky pixels equal their left neighbour exactly
  // and the longest run of an identical triple is 3 px, where an undithered shallow
  // gradient runs to tens. So the stepped contours in the last stand's sky are not
  // quantisation and nothing here reaches them. They arrive with the sky, at about
  // 15 code values RMS over a 5-30 px pitch, and they belong to sky.ts.
  float d1 = hash12( gl_FragCoord.yx * 1.37 - t * 911.0 );
  float d2 = hash12( gl_FragCoord.yx * 0.79 + t * 2437.0 );
  srgb += ( d1 + d2 - 1.0 ) / 255.0;

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

/**
 * The illuminant's direction with its luma taken out, normalised — the axis
 * `chromaOpponent` expands *across*.
 *
 * Subtracting the luma is what makes this an axis in the plane the chroma stage
 * works in: that stage decomposes a colour into luma plus an offset that sums to
 * zero under the luma weights, so a basis vector for it has to lie in the same
 * plane. Normalising means the projection is a plain dot product.
 *
 * For dusk's [1, 0.82, 0.62] this comes out at [0.57, -0.09, -0.82] — very close to
 * the blue-yellow opponent axis, which is where a warm key lives and where nothing
 * about a material is legible. The last stand's fire sits further round.
 */
function opponentAxis(illuminant: Rgb): [number, number, number] {
  const luma = LUMA_R * illuminant[0] + LUMA_G * illuminant[1] + LUMA_B * illuminant[2];
  const v: [number, number, number] = [illuminant[0] - luma, illuminant[1] - luma, illuminant[2] - luma];
  const len = Math.hypot(v[0], v[1], v[2]);
  // A perfectly neutral illuminant has no axis; any unit vector in the plane will
  // do, and blue-yellow is the one a grade would have picked anyway.
  if (len < 1e-4) return [0.57, -0.09, -0.82];
  return [v[0] / len, v[1] / len, v[2] / len];
}

const GRADE_SHADER = {
  name: "ArenaGradeShader",
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    // Both rebound to the meter's own uniform objects at construction, so the 1x1
    // ping-pong is followed without a hook between the two passes.
    tMeter: { value: null },
    tLowFreq: { value: null },
    uExposure: { value: DUSK.exposure },
    uBloom: { value: 0 },
    uBloomTint: { value: new THREE.Vector3(1, 1, 1) },
    uWhiteScale: { value: whiteScale(DUSK.white) },
    uBalance: { value: new THREE.Vector3(1, 1, 1) },
    uCrosstalk: { value: DUSK.crosstalk },
    uCrossKnee: { value: DUSK.white * CROSS_KNEE },
    uContrast: { value: 1 + DUSK.contrast },
    uPivot: { value: DUSK.pivot },
    uAdaptLift: { value: DUSK.adaptLift },
    uClarity: { value: DUSK.clarity },
    uClarityAdapt: { value: DUSK.clarityAdapt },
    uSaturation: { value: DUSK.saturation },
    uChromaMid: { value: DUSK.chromaMid },
    uChromaTilt: { value: DUSK.chromaTilt },
    uOpponent: { value: new THREE.Vector3(0.57, -0.09, -0.82) },
    uChromaOpponent: { value: DUSK.chromaOpponent },
    uShadowTint: { value: new THREE.Vector3(1, 1, 1) },
    uHighlightTint: { value: new THREE.Vector3(1, 1, 1) },
    uSplit: { value: DUSK.splitTone },
    uSplitRange: { value: new THREE.Vector2(DUSK.splitLow, DUSK.splitHigh) },
    uTintRange: { value: new THREE.Vector2(DUSK.tintLow, DUSK.tintHigh) },
    uShadowLift: { value: new THREE.Vector3(0, 0, 0) },
    uVignette: { value: DUSK.vignette },
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
 * Coverage samples on the composer's colour buffers, per tier.
 *
 * Until this landed the game shipped with **no geometric anti-aliasing at all**,
 * and it took three panels calling "aliasing crawl" to find why, because every
 * individual decision along the way was locally correct:
 *
 *   - GameCanvas asks for `antialias: quality.antialias && !quality.postProcessing`,
 *     which is right — context MSAA only ever applies to the default framebuffer,
 *     and with a composer in play the scene never lands there, so paying for it
 *     would have bought nothing;
 *   - EffectComposer allocates its own pair of half-float targets and three
 *     defaults `samples` to 0, which is right for a composer whose first pass is
 *     usually a copy;
 *   - SMAA sits at the end of the chain, which is right, because it wants
 *     gamma-encoded luma.
 *
 * The gap is that SMAA is a *morphological* filter. It reads the finished picture
 * and infers where an edge probably ran; it never has more information than the one
 * sample per pixel the rasteriser took. Measured on v7: the rune stone's silhouette
 * against the sky in `laststand`, the stake tips in `duel` and the far terrain
 * against the sky are hard one-pixel staircases with no intermediate value on them
 * at all — a 128-code step resolved in a single pixel. Nothing downstream can
 * recover a coverage fraction that was never sampled.
 *
 * MSAA is the stage that can, and it is the only one: the rasteriser evaluates
 * coverage per sample and shades once per pixel, so a helm rim, a mail edge, a
 * palisade stake and the horizon all cost coverage bandwidth rather than shading.
 *
 * The cost is not free and it is not only the scene pass. The composer ping-pongs
 * two buffers, so both carry samples, and three resolves a multisampled target
 * every time a pass unbinds it — three times a frame at the high tier (the render
 * pass, GTAO's composite, the grade). Two of those three resolves are pure waste,
 * because a full-screen quad writes identical samples; they are the price of the
 * composer owning its own allocation, which is a trade worth taking over hand-rolling
 * a resolve into the chain. See PASS_COST.msaa.
 *
 * Alpha-tested geometry — the leaf cards, thatch battens and twigs the aberration
 * was beading — is *not* covered by this, because an alpha test kills the whole
 * fragment rather than part of its coverage mask. Those want `alphaToCoverage` on
 * their materials, which is a one-line change per material and only becomes
 * meaningful now that there are samples for it to write into.
 */
const MSAA_SAMPLES: Record<QualityTier, number> = { high: 4, medium: 2, low: 0 };

/**
 * How far SMAA traces a detected edge looking for its crossing, in pixels.
 *
 * three ships the reference "medium" preset at 8. The edges that read worst in
 * these framings are long and shallow — a palisade line, a hut ridge, the far
 * terrain against the sky — and an edge whose crossing lies further away than the
 * search reaches gets a blend weight of zero, so it comes out exactly as jagged as
 * it went in. 16 is the reference "high" preset and it doubles the reach for a
 * handful of taps in the weights pass only.
 *
 * The *threshold* is deliberately left where three has it. Lowering it is the
 * obvious other half and it is the wrong move here: this look carries grain at up
 * to 0.052 in code values, which puts as much as 0.026 of difference between two
 * neighbouring pixels of flat sky, and a threshold under about 0.07 would start
 * detecting that as an edge and blending flat regions. Grain sits ahead of the AA
 * pass because it and the curve share one pass; that ordering is what caps how far
 * this dial can go.
 */
const SMAA_SEARCH_STEPS = 16;

/**
 * The largest sample count this context will multisample an RGBA16F renderbuffer
 * at, which is the format every buffer in this chain uses. Zero if it will not.
 *
 * `getInternalformatParameter` answers exactly this question and is the only thing
 * that does; `capabilities.maxSamples` is a global ceiling that a driver can report
 * happily while refusing the float format underneath it. Returns its counts in
 * descending order. Anything unexpected — a WebGL1 context, a throw, an empty list
 * — is read as "no", because the alternative failure is an incomplete framebuffer
 * at the first draw, which surfaces as a black frame rather than as an exception
 * the fallback path below can catch.
 */
/**
 * Retunes SMAA's pattern search, which three exposes only as a shader define on a
 * material it holds privately.
 *
 * The runtime field is `_materialWeights` and the shipped `@types/three` still
 * declares the pre-underscore `materialWeights`, so neither name alone both
 * compiles and works. Both are read, and a build where neither exists leaves the
 * pass at three's default rather than throwing: this is a quality tweak on top of a
 * pass that already works, and it must never be the reason a frame fails to
 * present.
 */
function setSmaaSearchSteps(pass: Pass, steps: number): void {
  const held = pass as unknown as {
    _materialWeights?: THREE.ShaderMaterial;
    materialWeights?: THREE.ShaderMaterial;
  };
  const weights = held._materialWeights ?? held.materialWeights;
  if (!weights?.defines) return;
  weights.defines.SMAA_MAX_SEARCH_STEPS = String(steps);
  weights.needsUpdate = true;
}

function maxColorSamples(renderer: THREE.WebGLRenderer): number {
  const gl = renderer.getContext();
  if (!(typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext)) return 0;
  try {
    const counts: Int32Array | null = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES);
    if (!counts || counts.length === 0) return 0;
    return Math.max(0, ...counts);
  } catch {
    return 0;
  }
}

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
 *
 * `meter` and the revised `grade` are estimated from tap and instruction counts
 * rather than measured, because the capture box was in use when they landed. They
 * should be re-measured; the estimate puts the whole chain about 7% up on v4.
 */
const PASS_COST: Record<string, number> = {
  /**
   * Not a post pass; listed so the chain can be read against what it sits on.
   * Measured before the colour buffers were multisampled — coverage and depth are
   * now written per sample, so this wants re-measuring alongside `msaa`.
   */
  render: 2.5,
  /**
   * Not a pass either: the resolves three performs whenever a pass unbinds a
   * multisampled target. Estimated, not measured. Three resolves a frame at the
   * high tier, each moving 4 x 1600 x 900 x 8 bytes in and a quarter of that out —
   * about 2.5 full-screen passes of bandwidth between them, with no shading, so it
   * prices out well under a shaded pass per byte. Zero on the low tier, which takes
   * no samples.
   */
  msaa: 0.9,
  gtao: 2.1,
  bokeh: 4.9,
  /**
   * Almost all of it is the seed, which reads a quarter of the frame with four
   * taps. Everything below 200x113 is rounding error and the derive is one pixel.
   */
  meter: 0.35,
  bloom: 1.25,
  /**
   * Up from 1.0: the metered response costs one more texture tap and five scalar
   * `pow` calls — two for the response's power laws, three for moving in and out of
   * the encoded space the tonal anchor lives in.
   */
  grade: 1.3,
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
  let meter: MeterPass | null = null;
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

      // Ask the driver what it will actually multisample rather than trusting
      // MAX_SAMPLES, which is a global limit and says nothing about this format.
      // The buffers are RGBA16F, which is only colour-renderable at all through
      // EXT_color_buffer_float; a device that has the extension for single-sampled
      // targets need not have it for multisampled ones, and the failure mode there
      // is an incomplete framebuffer at first draw rather than anything catchable.
      const samples = Math.min(MSAA_SAMPLES[settings.tier], maxColorSamples(renderer));
      if (samples > 1) {
        // Both, because the composer swaps them and the scene lands in whichever
        // is the read buffer that frame. setSize preserves this; dispose is the
        // composer's own business.
        composer.renderTarget1.samples = samples;
        composer.renderTarget2.samples = samples;
      }

      composer.addPass(new RenderPass(scene, camera));
      track("render");
      // Listed after the pass whose output it resolves, so the chain reads in the
      // order the frame is actually built.
      if (samples > 1) track("msaa");

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

      // Ahead of bloom, so what gets metered is the scene rather than the glow the
      // grade is about to add to it. Not tier-gated: the response is part of the
      // tone curve now, not an effect, and there is no frame without it.
      meter = new MeterPass(bufW, bufH);
      composer.addPass(meter);
      track("meter");

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
      // Shared by reference, not copied: the meter's 1x1 result ping-pongs every
      // frame and the composer offers no hook between two passes, so the grade holds
      // the same uniform object the meter writes into. Done before the first render,
      // while three has not yet cached anything about this material.
      grade.uniforms.tMeter = meter.result;
      grade.uniforms.tLowFreq = meter.lowFreq;
      composer.addPass(grade);
      track("grade");

      // SMAA resolves an edge; FXAA smears one. The low tier gets the smear
      // because it is one pass instead of three, and a slightly soft edge still
      // looks intentional where a stair-stepped one never does.
      const aaName = settings.tier === "low" ? "fxaa" : "smaa";
      aa = aaName === "fxaa" ? new FXAAPass() : new SMAAPass();
      if (aaName === "smaa") setSmaaSearchSteps(aa, SMAA_SEARCH_STEPS);
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
    u.uAdaptLift.value = THREE.MathUtils.clamp(pick("adaptLift"), 0, 1);
    u.uClarity.value = Math.max(0, pick("clarity"));
    u.uClarityAdapt.value = Math.max(0, pick("clarityAdapt"));
    u.uSaturation.value = pick("saturation");
    u.uChromaMid.value = pick("chromaMid");
    u.uChromaTilt.value = pick("chromaTilt");
    // Derived from the same illuminant `balance` corrects for, so a look states the
    // key once and both the white balance and the separation axis follow from it.
    const axis = opponentAxis(pick("balance"));
    (u.uOpponent.value as THREE.Vector3).set(axis[0], axis[1], axis[2]);
    u.uChromaOpponent.value = Math.max(0, pick("chromaOpponent"));
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
    const tintLow = pick("tintLow");
    (u.uTintRange.value as THREE.Vector2).set(tintLow, Math.max(pick("tintHigh"), tintLow + 0.02));
    (u.uShadowLift.value as THREE.Vector3).set(lift[0], lift[1], lift[2]);
    // The tier can drop the corner falloff even though the grade itself is not
    // optional — the grade is where tone mapping happens, so there is no frame
    // without it. Every preset currently keeps it; the switch exists so the
    // setting is not a lie.
    u.uVignette.value = settings.vignette ? pick("vignette") : 0;
    u.uGrain.value = pick("grain");
    u.uHurt.value = hurtLevel;
    u.uPressure.value = pressure;

    meter?.setResponse({
      exposure,
      white,
      contrast: pick("contrast"),
      pivot: pick("pivot"),
      band: pick("adaptBand"),
      adapt: pick("adapt"),
      ceiling: pick("adaptCeiling"),
    });

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
      // Raw time, like the hurt decay: the adaptation is the eye's, and hit-stop
      // slowing the world must not slow it down with the world.
      meter?.setDelta(ctx.rawDt);
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
      // MeterPass.setSize already rebuilt its own chain off the full buffer and
      // dropped the adaptation history, which is what a resize should do — the
      // reduction it was averaging no longer exists.
    },

    setMood(next) {
      if (next === mood) return;
      mood = next;
      blendFrom = { ...current };
      blend = 0;
      // The mood crossfades over MOOD_BLEND, so the metering has a real signal the
      // whole way through and must *not* be reset here — a reset would snap the
      // response at the moment the look starts moving, which is the one moment a
      // viewer is already looking at the frame changing.
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
      meter?.dispose();
      bloom?.dispose();
      grade?.dispose();
      aa?.dispose();
      blackBloom?.dispose();
    },
  };
}
