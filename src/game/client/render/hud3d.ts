// In-world HUD: nameplates, health bars, floating damage numbers.
//
// This is the only thing in the frame that is interface rather than world, and
// it is held to a different test than everything else in this directory: it has
// to stay readable in the worst frame the game can produce. Against a blown
// horizon and against black turf, at two metres and at forty, with eight plates
// stacked on one another. Legibility beats decoration here every single time —
// a treatment that looks handsome in `duel` and costs a read in `brawl` is the
// wrong treatment.
//
// Three things about the pipeline shape everything below.
//
// First, this draws into postfx's linear HDR beauty buffer, and the grade at the
// end of the chain applies exposure, a contrast power and a filmic curve
// normalised to a white point several stops above 1.0. A colour picked by eye in
// a paint program lands about two stops darker than it looks. That is the whole
// story of the black-box bug: the old backing quad's 0x1a0a08 is 0.009 units of
// linear radiance, the curve maps that to a code value of about two, and with
// nothing to de-overlap it, three warriors in a line stacked three of those
// translucent backings on top of each other and sealed off what little sky came
// through. Every bar in `brawl` rendered as a solid black slab. So colours here
// are authored as *radiance* — see `radiance()` — and the design leans on bright
// ink and a one-pixel dark keyline rather than on the dark fills the curve eats.
//
// That correction then over-shot in the other direction, and the measurement is
// worth keeping because it is the whole argument for the palette below. The
// healthy fill was authored as 0x35d94e at gain 1.25. `radiance()` normalises on
// the peak channel, so that is linear (0.064, 1.25, 0.141) — a colour with
// almost no red in it at all — and the dusk grade then runs saturation at 1.24
// and a green-vs-magenta opponent term at 0.22 over the top. Sampled out of
// `brawl.png` the bar came back at (0, 202, 63): red crushed to the floor,
// green pinned near clipping. Not "a bit strong" — the literal primary. The
// gold rim beside it measured (188, 153, 53). Nothing else in the frame is
// within reach of either. So the fill hues here carry roughly a third of the
// chroma they read as, and every gain is set so the grade's shoulder, not the
// clamp, is what ends the highlight.
//
// Second, plates live in the scene, not on the warrior's rig group, and they are
// oriented by copying the camera's rotation rather than by `lookAt`. `lookAt`
// aims at the camera's *position* around a world up-vector, so under a pitched
// camera it rolls every plate away from frame centre — which is why the old bars
// sat at an angle while the sprite nameplates above them stayed level. Owning
// the transform outright is also what makes de-overlap possible at all: plates
// have to be moved in *screen* space to stop stacking, and you cannot do that
// through a parent whose rotation you do not control.
//
// Third, and this one is a rule rather than a shape: nothing in this file may
// reach the scene graph as a quad without a sampled texture behind it. An
// unmapped `MeshBasicMaterial` is not blank — three's shader falls back to the
// material colour, so it draws a hard-edged, fully opaque rectangle in whatever
// ink the HUD happens to be tinted that frame. In `lastStand` that ink is
// (1.34, 1.08, 0.91) before the grade, which is to say: a flat orange square.
// That is failure #2 on the list in docs/VISUAL-BAR.md, it has twice been
// misattributed to this module from a capture, and the answer is not vigilance
// but structure. Three rules, and between them there is no state in which an
// unmapped or dead-mapped quad is reachable:
//
//   - `glyphMaterial()` is the only constructor of a mapped material here, and
//     it proves the texture before the material exists. A failure returns null
//     and the caller drops the element rather than shipping a coloured quad.
//   - A pooled damage material is never left holding a texture that release may
//     dispose; it is re-pointed at `blank`, a 1x1 transparent texture, so `map`
//     is non-null and alive at every instant of the pool round-trip.
//   - `auditGlyphMaterials()` re-proves the invariant on live meshes twice a
//     second in development and throws on the frame it breaks, because the one
//     thing this failure is good at is surviving into a capture looking like a
//     particle bug or a broken prop.
//
// In development every one of those refusals throws. In a player's browser they
// degrade: a missing name or damage number is a far smaller failure than an
// orange square in the middle of a fight, and neither is worth a crash.
//
// Materials are per-instance on purpose: the bar tints and drains per warrior
// and the numbers carry their own canvas, so nothing here can be shared with
// materials.ts. Geometry and glyph textures are shared and refcounted.

import * as THREE from "three";
import { noteDrawnBody } from "./camera";
import { LAYER_UNOCCLUDED, setLayerDeep, type FrameContext, type QualitySettings, type QualityTier } from "./quality";
import { easeGrace } from "@/game/grace.mjs";

export interface Hud3D {
  /**
   * Registers a nameplate and health bar tracking a warrior's rig group.
   * `headTop` is the crown height of that warrior in metres; the plate is hung
   * a fixed clearance above it.
   */
  attach(id: string, name: string, parent: THREE.Object3D, isLocal: boolean, headTop?: number): void;
  detach(id: string): void;
  /**
   * Stand every plate down without detaching it. The end-of-match tableau is a
   * portrait and owns the whole frame; the plates come back the moment the
   * caller stops asking, so a rematch costs nothing.
   */
  setSuppressed(on: boolean): void;
  setHealth(id: string, current: number, max: number): void;
  /**
   * Mark a warrior as under the fight's grace — untouchable while the fight is
   * actually running. Pass the answer, not a duration: `underGrace(player,
   * roomState.state)` from `@/game/grace.mjs` is the only intended argument,
   * and it is a pure function of the packet in hand. The HUD eases the drawn
   * gild toward it and holds no clock of its own, so the mark cannot outlive
   * the thing that caused it.
   */
  setGuard(id: string, on: boolean): void;
  spawnDamageNumber(amount: number, at: { x: number; z: number }, big: boolean): void;
  update(dt: number, ctx: FrameContext): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * A HUD colour, expressed as scene radiance rather than as a display value.
 *
 * `hex` carries the hue and `gain` says where on the grade's curve the brightest
 * channel lands. Calibrated against two measured points in `art/shots/v4` — the
 * gold rim's authored (1.2, 0.753, 0.197) came back as code (188, 153, 53), and
 * the sage below lands near (134, 168, 100) — display code runs roughly as
 * `188 * L^0.79` up to the shoulder. Which puts the useful band at: 0.05 is a
 * groove the curve crushes to near-black, 0.7 is a confident mid, and past about
 * 1.2 the shoulder and the crosstalk term start trading hue for white.
 */
function radiance(hex: number, gain: number): THREE.Color {
  const c = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
  return c.multiplyScalar(gain / Math.max(c.r, c.g, c.b, 1e-4));
}

// The health ramp is a *temperature*, not a traffic light. Three constraints
// pushed it here and all three are load-bearing.
//
// The grade amplifies chroma twice — saturation 1.24 and a green-vs-magenta
// opponent term at 0.22 — so anything authored near a primary comes back as one.
// The frame is amber from the sky down through the thatch, the oak and the mud,
// which leaves the cool side of the wheel empty and cheap to occupy. And the
// arena is lit by fire, so a state that means *danger* should look like it is
// closer to the fire, not like a different UI theme.
//
// So: weathered bronze at full health, the patina on a thing nobody has polished
// in a season. Brass as it goes. Oxblood at the end. The ramp walks from the
// complement of the frame toward its centre as the warrior dies, which is a read
// you get pre-attentively without decoding a colour code — and it descends the
// curve as it goes, so a bar dims as it empties.
const FILL_HEALTHY = radiance(0xa8bf8e, 0.88);
// Brass rather than the old 0xffc21a amber: that hex is 0.95 gain on a hue with
// nothing in the blue channel, which the opponent term then drags further out.
// 0xd7a850 was still most of the way there — it normalises to linear
// (1, 0.576, 0.118) and came back off `v6/brawl.png` as (197, 145, 68), which
// is not brass, it is the yellow the review called out. Tarnish it: the blue
// channel roughly triples, which is what a warm hue needs before the grade's
// saturation stops reading it as a primary.
const FILL_WOUNDED = radiance(0xdcae72, 0.86);
// Oxblood, and the same argument. 0xc03a1e is linear (1, 0.076, 0.024) — under
// a 1.24 saturation that is red, full stop. Dried blood has brown in it.
const FILL_CRITICAL = radiance(0xb04430, 0.70);
/**
 * The streak a hit leaves behind: the brightest thing on the plate for a beat.
 * Near-white rather than a hue, because a coloured streak beside a coloured fill
 * is one more thing to decode, and at critical health a bright orange streak
 * beside a dark red fill reads as the health rather than as the loss. Walked
 * down from 1.45, which clipped outright, and then from 1.15 once the groove
 * beside it came up out of black — a streak that clips is a streak with no
 * shape, and the shape is the whole information in it.
 */
const FILL_LAG = radiance(0xffeeda, 1.06);

// Limewashed bone. This is the *peak* of a bevel now, not the value of a ring:
// the shader falls it to 0.24 of this along the bottom arris, so the rim reads
// as a lit edge on carved bone rather than as the hard outline it was at 1.02 —
// which measured brighter than every surface it was drawn over.
const RIM_REMOTE = radiance(0xcfc9b6, 0.74);
// The local warrior gets a warmer bone, not a different colour language, and
// the two hexes are now within a hair of each other. The old 0xf3c469 at 1.2
// shipped a gold-on-yellow plate beside white-on-white ones and a panel read
// the two as two separate interfaces in one frame.
const RIM_LOCAL = radiance(0xdccdb0, 0.80);
/**
 * The floor of the cut slot — and the load-bearing correction in this pass.
 *
 * This was 0x241a15 at 0.055 gain, authored so "the grade will crush it to the
 * bottom two code values". It did: measured off `v6/brawl.png` the empty end of
 * a bar came back under code 12 and flat, and what that draws over an amber
 * horizon is not a groove, it is a black rectangle punched through the frame —
 * failure #9 on the list in docs/VISUAL-BAR.md, the one the review named as the
 * most student-project element in the build. A tally stick's empty end is still
 * *stick*: bone in its own shadow, with the same grain as the filled end.
 *
 * Solved against the transfer measured off the shipped frame rather than guessed
 * at: fitting a power law through two points in `v6/brawl.png` — the groove at
 * linear 0.0248 arriving as code 26, the healthy fill at 0.961 arriving as 201 —
 * gives code ~= 205 * L^0.56 for this look. At 0.12 the groove runs about code
 * 35 in the shadow under the top lip to 67 where light bounces off its floor,
 * against a healthy fill near 170 and a keyline at 29 — three separated steps
 * instead of two, and a 30-code gradient inside the cut instead of 12.
 *
 * The hue is the rim's, three stops down, because that is what the floor of a
 * cut in a limewashed stick actually is. It also buys the separation that the
 * luma ratio gives up: a warm grey groove is nothing like the brass of a wounded
 * fill, whereas the umber this was first tried at sat right on top of it.
 *
 * The job of being the hard dark edge is a real one against a blown sky, and it
 * moves to `KEYLINE`, where one or two pixels can do it without costing the
 * whole object. That also keeps the plate's contribution to the frame's darkest
 * tonal bucket roughly where it was.
 */
const TROUGH = radiance(0xb0a894, 0.12);
/** The chisel line around the stick. Near-black, and never more than a pixel or two. */
const KEYLINE = radiance(0x140d09, 0.030);

/**
 * Mood is a tint on the ink, not a second set of glyph textures. Last stand
 * pulls the whole interface toward the fire the same way the grade pulls the
 * frame, so the HUD belongs to the moment rather than floating above it.
 */
const TINT_DUSK = new THREE.Color(1, 1, 1);
const TINT_LAST_STAND = new THREE.Color(1.12, 0.9, 0.76);
/**
 * How much of that tint the health fill takes. Less than the ink does, because
 * the fill's hue *is* the information: tint it as hard as the lettering and the
 * healthy bronze walks into the wounded brass exactly in the frame where the
 * difference matters most.
 */
const FILL_TINT_STRENGTH = 0.45;

/**
 * Canvas glyphs are display-referred; this is what lifts them onto the curve.
 * Backed off from 1.2, but only a step, and the step is bounded by a number
 * rather than by taste: the sky in `brawl` measures 177 immediately around the
 * plates, and the ink measured 198 there. Working back through the same transfer
 * the bar is solved against, this lands the letterform's crown near 189 — still
 * clear of a blown horizon, and no longer the brightest object in `laststand`,
 * where it was arriving at 240 over a frame whose subject is a man on fire-lit
 * mud. Below about 1.1 the type starts losing the sky, and at that point the
 * halo is carrying the whole read on its own, which is not a treatment, it is a
 * dark rectangle with letters knocked out of it.
 */
const GLYPH_GAIN = 1.16;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * Clearance over the crown, in metres. The crown itself comes from the caller —
 * anim.ts measures it off the built body — because character proportion is not
 * this module's to know and a constant here goes wrong the moment it changes.
 * This is the only number the plate's height is entitled to have an opinion on.
 */
const HEAD_CLEARANCE = 0.26;
/** Used only when a caller attaches without measuring. A 1.98 m man plus helm. */
const ANCHOR_FALLBACK = 2.03 + HEAD_CLEARANCE;

// Plate-local geometry. The bar is deliberately thinner than the one it
// replaces — it is a status line, not a slab — and the name is the taller of the
// two, because at any real distance the name is what you are actually reading.
const BAR_W = 0.94;
// Up from 0.085. Measured off `brawl.png`, the far bars in an eight-warrior
// fight were landing at six or seven pixels tall, which is under the floor for
// three concentric bands — the keyline, the bevel and the fill were sharing
// about four pixels and averaging into a smear. A tally stick is a chunkier
// object than a status slab anyway.
const BAR_H = 0.095;
const NAME_H = 0.29;
const NAME_GAP = 0.055;

/**
 * Distance where the plate is exactly its authored world size. Nearer than this
 * it shrinks a little, further it grows — but only as `dist^0.55`, so a warrior
 * across the arena keeps a legible bar without shouting as loudly as the one in
 * front of you. Full screen-space compensation is the mistake here: it makes the
 * back of a brawl exactly as loud as the front and the eye has nowhere to land.
 */
const REF_DIST = 9;
// Both powers moved toward 1 — 0.45/0.72 was a 1.83x on-screen size ratio
// between the nearest and furthest plate in `brawl`, which a panel read not as
// depth but as two different nameplate designs shipping at once. 0.62/0.8 took
// that to about 1.68 and it was still the loudest thing about the HUD: measured
// off `v6/arena.png` the local name's cap height is 12.5 px against 9.2 px on
// the plate beside it, and a third again is a different type size, not depth.
// At 0.72/0.88 the ratio is about 1.25 — the front of the fight still reads as
// the front of the fight, and nothing in frame reads as a second design.
const NEAR_POWER = 0.72;
const FAR_POWER = 0.88;

// Distance is carried by size, not by opacity. Fading a plate out at the range a
// shield wall actually forms at just means you cannot read the fight; the ramp
// only exists to retire plates that are no longer part of it.
const FADE_START = 30;
const FADE_END = 46;
/** Inside this the plate is in the player's face; it dissolves rather than clips. */
const NEAR_FADE_IN = 1.3;
const NEAR_FADE_FULL = 2.6;

/**
 * How far a plate may be pushed off its warrior to clear another, in NDC. Past
 * this the plate has stopped pointing at anything and become furniture, so the
 * answer is to make it smaller rather than to keep moving it.
 */
const MAX_PUSH = 0.38;
const PUSH_PAD_Y = 0.006;
const PUSH_PAD_X = 0.004;

// ---------------------------------------------------------------------------
// Bar shader
// ---------------------------------------------------------------------------

const BAR_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;

// Everything is solved against a chamfered box SDF rather than drawn into a
// canvas, because the bar is the one HUD element whose shape has to survive
// being four pixels tall at forty metres and thirty at two. An SDF antialiases
// itself at both; a bitmap picks one and shimmers at the other.
//
// The object being described is a tally stick: a strip of limewashed bone with a
// slot cut down its length, notched off in twenty-fives, and the warrior's blood
// in the slot. Everything decorative in here is subordinate to that one read,
// and everything in here that could stop resolving before the bar itself does is
// faded out against a measured pixel size rather than left to alias — see `lod`.
const BAR_FRAG = /* glsl */ `
uniform vec3 uFillColor;
uniform vec3 uLagColor;
uniform vec3 uRimColor;
uniform vec3 uTroughColor;
uniform vec3 uKeyColor;
uniform float uPct;
uniform float uLag;
uniform float uOpacity;
uniform float uAspect;
uniform float uSegments;
uniform float uFlash;
uniform float uPulse;
uniform float uGuard;
uniform float uSeed;
varying vec2 vUv;

// Gilt, not white. The arena is gold and garnet on near-black and the only
// light in it comes off a fire; a neutral highlight here reads as chrome.
const vec3 GUARD_GILT = vec3( 0.62, 0.47, 0.20 );

// A box with 45-degree ends. A slot cut with a chisel does not have round caps.
float chiselBox( vec2 p, vec2 b, float ch ) {
	vec2 q = abs( p ) - b;
	float box = min( max( q.x, q.y ), 0.0 ) + length( max( q, 0.0 ) );
	float cut = ( abs( p.x ) + abs( p.y ) - ( b.x + b.y - ch ) ) * 0.70710678;
	return max( box, cut );
}

float hash21( vec2 p ) {
	p = fract( p * vec2( 127.1, 311.7 ) );
	p += dot( p, p + 34.23 );
	return fract( p.x * p.y );
}

void main() {
	// Work in units of the bar's height so the rim, the chamfer and the notches
	// keep the same weight however wide the bar gets.
	vec2 p = vec2( ( vUv.x - 0.5 ) * uAspect, vUv.y - 0.5 );
	vec2 b = vec2( uAspect * 0.5, 0.5 );

	// The bar's own height in pixels, this frame, read off the derivative of its
	// UV. The brawl preset is the case this exists for: eight warriors, the back
	// four at thirty-odd metres, bars seven pixels tall. Three concentric bands
	// and a row of tally nicks do not fit in seven pixels — they average into a
	// smear, and a smear costs the only thing the bar is for. So detail is
	// retired against measured size rather than left to alias, and what the bar
	// collapses to is the most legible thing it can be: a dark slot with colour.
	//
	// Two ramps, because the two things that stop resolving stop at different
	// sizes. A band needs about a pixel to be a band at all; a row of nicks needs
	// two or three before it is a row rather than a texture.
	float bh = 1.0 / max( fwidth( vUv.y ), 1e-5 );
	float lodBand = smoothstep( 7.0, 15.0, bh );
	float lodDetail = smoothstep( 14.0, 30.0, bh );

	// Three bands, and the order is the whole legibility argument. A dark
	// keyline on the outside is what separates the bar from a blown horizon; a
	// bone bevel inside it is what separates it from black turf. Brightness alone
	// cannot win against a sky the grade has already taken to 240, so the plate
	// carries its own dark edge and stops trying.
	//
	// Small, the bands narrow but none of them is allowed to close. Retiring the
	// bevel outright was the previous answer and it was the wrong one: measured off
	// art/shots/v6/arena.png, every plate past about fifteen metres lost its rim
	// completely and collapsed to a coloured rectangle butted against a dark one —
	// no object, no material — and four of the eight plates in the brawl preset
	// were in that state. A
	// bevel one pixel wide is still a lit edge, and a lit edge is the whole
	// difference between a carved thing and a sticker. What the small case gives up
	// instead is the keyline's *width*: at 0.17 it swelled into a black band of its
	// own, which is the other half of how the bar came to read as two rectangles.
	float keyW = mix( 0.135, 0.085, lodBand );
	float rimW = mix( 0.055, 0.135, lodBand );

	float dOut = chiselBox( p, b, 0.22 );
	float aa = max( fwidth( dOut ), 1e-5 );
	float outer = 1.0 - smoothstep( -aa, aa, dOut );

	float dRim = chiselBox( p, b - keyW, 0.18 );
	float rimIn = 1.0 - smoothstep( -aa, aa, dRim );

	float dIn = chiselBox( p, b - ( keyW + rimW ), 0.12 );
	float inner = 1.0 - smoothstep( -aa, aa, dIn );

	float keyline = clamp( outer - rimIn, 0.0, 1.0 );
	float rim = clamp( rimIn - inner, 0.0, 1.0 );

	float fw = max( fwidth( vUv.x ), 1e-5 );
	float fill = inner * ( 1.0 - smoothstep( uPct - fw, uPct + fw, vUv.x ) );
	float lag = clamp( inner * ( 1.0 - smoothstep( uLag - fw, uLag + fw, vUv.x ) ) - fill, 0.0, 1.0 );

	// Tally notches, one per 25 health. A hit that crosses two of them is
	// visibly twice a hit that crosses one, which is a thing you can read at a
	// glance in a way that a proportion of a smooth bar is not. Cut down from the
	// top arris only — a mark that crossed the full slot was reading as a row of
	// black ticks printed on the colour instead of as damage to the stick — and
	// dropped entirely once either the bar or the spacing stops resolving them,
	// because a notch that has blurred into its neighbours is not a notch, it is
	// a uniform dimming of the one band that has to stay clean.
	float seg = vUv.x * uSegments;
	float segW = max( fwidth( seg ), 1e-5 );
	float tick = abs( fract( seg + 0.5 ) - 0.5 );
	float notch = 1.0 - smoothstep( 0.0, segW + 0.04, tick );
	notch *= inner * smoothstep( 0.02, 0.19, p.y ) * lodDetail * ( 1.0 - smoothstep( 0.14, 0.3, segW ) );

	// Limewash wears off a carved edge long before it wears out of the groove.
	float wear = hash21( floor( vec2( vUv.x * 96.0, vUv.y * 5.0 ) ) + uSeed );

	// The rim is a bevel, not a ring. Bone catches the sky along the top arris
	// and falls into its own shadow along the bottom one, which is the entire
	// difference between a carved object and a sticker — an even bright edge all
	// the way round was the "hard yellow outline" in the review. Where the band
	// is barely a pixel it cannot show a gradient, so it keeps more of the top
	// arris' value and less of the bottom's: one lit pixel still says "edge",
	// whereas the average of a lit and a shadowed one says nothing at all.
	float bevel = mix( 0.24, 1.05, smoothstep( -0.46, 0.4, p.y ) ) * mix( 0.78, 1.0, lodDetail );

	// The empty end of the slot is the stick, not a hole in the frame. Three
	// things make it read as bone in shadow rather than as the printed black
	// rectangle it measured as in v6: it is authored well over twice as high (see
	// TROUGH), it carries the same grain as the fill so the two ends are one
	// object, and light
	// bounces up off the groove floor the way it does in any real cut. The
	// occlusion under the top lip is what keeps it from flattening out again.
	vec3 col = uTroughColor * mix( 1.0, 0.36, smoothstep( 0.04, 0.28, p.y ) );
	col *= 0.86 + 0.28 * wear;
	col += uRimColor * 0.022 * ( 1.0 - smoothstep( -0.34, -0.02, p.y ) );
	col = mix( col, uLagColor, lag );

	// A bead of enamel sitting in the groove rather than a flat swatch: lit
	// across the top, shadowed where it meets the bottom of the cut.
	vec3 fillCol = uFillColor * ( 0.9 + 0.16 * wear );
	fillCol *= mix( 0.8, 1.14, smoothstep( -0.26, 0.24, p.y ) );
	fillCol *= 1.0 + uPulse * 0.45;
	// The head of the bead is a cut face, not a guillotined edge. Without this the
	// fill ends on a vertical seam of maximum chroma against maximum darkness,
	// which is the single hardest edge on the plate and the one the eye reads as
	// "two flat rectangles" before it reads anything else.
	fillCol *= 1.0 - 0.42 * smoothstep( uPct - fw * 3.0, uPct - fw * 0.5, vUv.x );
	col = mix( col, fillCol, fill );

	// The bead sits proud in the groove and throws a short shadow off its head.
	// This is what carries the boundary now. Lifting the groove out of black cost
	// the bar much of its luma ratio across that edge — 3.4 to 1, down to under
	// 2.6 — and the way to get the read back is not to re-blacken the groove but to
	// give the edge the one cue a printed rectangle never has: depth. Three pixels
	// of occlusion, and the eye lands on the boundary before it has parsed either
	// colour.
	float headShadow = ( 1.0 - smoothstep( uPct, uPct + fw * 3.5, vUv.x ) ) * ( 1.0 - fill ) * ( 1.0 - lag ) * inner;
	col *= 1.0 - 0.45 * headShadow;

	// A tally mark is cut into the stone, so it catches light in an empty groove
	// and shadows against a filled one. Same mark, opposite sign.
	col = mix( col, mix( uRimColor * 0.22, col * 0.42, max( fill, lag ) ), notch * 0.55 );
	col = mix( col, uRimColor * bevel * ( 0.88 + 0.18 * wear ), rim );
	// GRACE: this man cannot be struck yet. It rides the FRAME and nothing else
	// — not the fill, which is his blood, and not the alpha, which is distance.
	// A gild on a bevel that is already catching the fire is the quietest place
	// in this object to say a thing, and it is steady: no oscillation anywhere
	// in this term, because the blink it replaces was the defect. The keyline
	// goes over the top of it, so the plate keeps its own edge.
	col += uGuard * GUARD_GILT * ( rim * 0.62 + bevel * rim * 0.30 );
	col = mix( col, uKeyColor, keyline );
	// Warm, because the only thing in this arena bright enough to justify a flash
	// is on fire. A neutral one read as a UI blink over a fire-lit frame.
	col += uFlash * vec3( 1.0, 0.84, 0.62 ) * ( 0.35 + 0.6 * fill );

	// The dark bands stay a hair short of opaque so the plate reads as inset
	// into the frame rather than stuck on top of it — but only a hair. At 0.84
	// the sun behind the horizon comes straight through the groove and the bar
	// loses its bottom end exactly where the frame is brightest.
	float alpha = mix( 0.95, 1.0, max( fill, max( lag, rim ) ) );
	gl_FragColor = vec4( col, outer * alpha * uOpacity );
}
`;

// ---------------------------------------------------------------------------
// Glyph canvases
// ---------------------------------------------------------------------------

const SERIF = "Cinzel, 'Trajan Pro', Georgia, 'Times New Roman', serif";

/** Deterministic per-name wear, so two capture runs produce the same frame. */
function seedFrom(text: string): () => number {
  let h = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x85ebca6b) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Glyphs {
  /**
   * Null when the canvas could not be built at all. Kept nullable rather than
   * asserted so that failure arrives at `requireGlyphTexture`, which knows what
   * to do with it, instead of as a TypeError thrown from inside a draw call.
   */
  texture: THREE.CanvasTexture | null;
  /** Width / height of the drawn area, so the quad never stretches the type. */
  aspect: number;
  /**
   * Fraction of the canvas width the drawn glyphs actually cover. The quad is a
   * fixed aspect so type never stretches, which means a short name carries a lot
   * of empty texture — and de-overlap has to spread plates by the ink, not by
   * the quad, or four-letter names shove each other halfway up the screen.
   */
  ink: number;
  /** Cache key, carried so a release is a delete rather than a search. */
  key: string;
  refs: number;
}

const DEV = process.env.NODE_ENV !== "production";
let mapFailureReported = false;

/**
 * A 2D canvas, or null.
 *
 * `getContext("2d")` genuinely returns null — a browser that has hit its live
 * context ceiling hands one back, and this module mints a canvas per distinct
 * warrior name and per distinct damage amount, so it is a plausible thing to run
 * into on a phone in a long session rather than a theoretical one. The old
 * non-null assertion turned that into a TypeError thrown from the middle of a
 * draw call, which is a crash in the render path in exchange for avoiding a
 * failure this module already knows how to absorb.
 */
function glyphCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

/** Shared shape for a glyph set that could not be drawn. Fails the gate below. */
function unusableGlyphs(key: string, aspect: number): Glyphs {
  return { texture: null, aspect, ink: 1, key, refs: 0 };
}

/**
 * Whether a texture will actually be sampled. A `CanvasTexture` whose canvas
 * never got a 2D context, or whose `image` is missing or zero-sized, binds as
 * nothing — and three's fallback for an unsampled `map` is the material colour,
 * so the quad draws as a flat, fully opaque rectangle rather than as blank.
 */
function glyphTextureUsable(tex: THREE.Texture | null | undefined): tex is THREE.Texture {
  if (!tex) return false;
  const img = tex.image as { width?: number; height?: number } | null | undefined;
  return !!img && (img.width ?? 0) > 0 && (img.height ?? 0) > 0;
}

/**
 * The gate every glyph quad in this file passes through. Nothing here builds a
 * material and then hopes a texture turns up: the texture is proved first and
 * the material is constructed around it, so an unmapped `MeshBasicMaterial`
 * never exists to be added to the scene.
 *
 * In development the failure throws. That is deliberate and it is the point of
 * the function — an untextured HUD quad is a coloured square hanging in the
 * world (failure #2 in docs/VISUAL-BAR.md), it survives a capture looking like a
 * particle bug or a broken prop, and it has twice been diagnosed from a
 * screenshot at the cost of a review cycle. It has to be loud at the moment it
 * is introduced. In a player's browser it returns null and the caller drops the
 * element instead: a missing damage number is a far smaller failure than an
 * orange square in the middle of a fight, and neither is worth a crash.
 */
function requireGlyphTexture(glyphs: Glyphs, what: string): THREE.Texture | null {
  if (glyphTextureUsable(glyphs.texture)) return glyphs.texture;
  reportMapFailure(`${what} has no usable glyph texture (key "${glyphs.key}")`);
  return null;
}

function reportMapFailure(detail: string): void {
  const msg = `hud3d: ${detail}. Refusing to draw an untextured quad — `
    + `see docs/VISUAL-BAR.md failure #2.`;
  if (DEV) throw new Error(msg);
  if (!mapFailureReported) {
    mapFailureReported = true;
    console.error(msg);
  }
}

/**
 * The only place in this file that builds a material carrying a texture.
 *
 * The map is proved before the material exists rather than assigned to one that
 * already does, so there is no window — not one statement wide — in which an
 * unmapped `MeshBasicMaterial` is constructible, let alone reachable from the
 * scene graph. Callers get null and drop the element.
 */
function glyphMaterial(glyphs: Glyphs, what: string): THREE.MeshBasicMaterial | null {
  const map = requireGlyphTexture(glyphs, what);
  if (!map) return null;
  // fog: false everywhere in here. Aerial perspective on a nameplate is how a
  // HUD ends up dissolving exactly when the fight spreads out and you most need
  // to know who is where.
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
}

/** Manual tracking: canvas letterSpacing is not universally typed or supported. */
function trackedWidth(ctx: CanvasRenderingContext2D, text: string, track: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + track;
  return w - track;
}

function drawTracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, track: number, stroke: boolean): void {
  let cx = x;
  for (const ch of text) {
    if (stroke) ctx.strokeText(ch, cx, y);
    else ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + track;
  }
}

// Sized so the type nearly fills the canvas, leaving only enough margin for the
// halo. Padding here is not free: the quad is a fixed aspect, so every wasted
// row of canvas is glyph height thrown away on screen at the same world size.
const NAME_CANVAS: Record<QualityTier, { w: number; h: number; size: number }> = {
  high: { w: 512, h: 112, size: 60 },
  medium: { w: 384, h: 84, size: 45 },
  low: { w: 256, h: 56, size: 30 },
};

/**
 * A nameplate with no slab behind it. Legibility comes from a three-stage
 * outline — a wide soft shadow that separates it from a bright sky, a hard dark
 * stroke that holds the letterform against dark turf, and a light bevel on the
 * upper edge that reads as a chiselled face rather than a drop shadow.
 */
function buildNameGlyphs(key: string, name: string, isLocal: boolean, tier: QualityTier): Glyphs {
  const spec = NAME_CANVAS[tier];
  const surface = glyphCanvas(spec.w, spec.h);
  if (!surface) return unusableGlyphs(key, spec.w / spec.h);
  const { canvas: c, ctx } = surface;
  const text = (name || "warrior").substring(0, 16);
  const rand = seedFrom(text);

  const track = spec.size * 0.07;
  let size = spec.size;
  ctx.font = `600 ${size}px ${SERIF}`;
  // Enough side margin for the halo, and no more.
  const room = spec.w - spec.size * 0.8;
  const measured = trackedWidth(ctx, text, track);
  if (measured > room) {
    size = Math.max(spec.size * 0.5, size * (room / measured));
    ctx.font = `600 ${size}px ${SERIF}`;
  }

  const width = trackedWidth(ctx, text, size * 0.07);
  const x = (spec.w - width) * 0.5;
  const y = spec.h * 0.7;
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  // Soft halo first: this is what survives being drawn over the blown horizon,
  // and it is where the legibility budget goes now that the ink's top end has
  // come down — a warm near-black rather than a neutral one, because a neutral
  // shadow over fire-lit amber is the one part of the plate that never belonged
  // to this arena.
  ctx.shadowColor = "rgba(20,11,7,0.94)";
  ctx.shadowBlur = size * 0.36;
  ctx.strokeStyle = "rgba(20,11,7,0.94)";
  ctx.lineWidth = size * 0.2;
  drawTracked(ctx, text, x, y, size * 0.07, true);
  drawTracked(ctx, text, x, y, size * 0.07, true);
  ctx.shadowBlur = 0;

  // Hard stroke: the letterform's own edge, against dark ground.
  ctx.strokeStyle = "rgba(26,15,10,0.98)";
  ctx.lineWidth = size * 0.13;
  drawTracked(ctx, text, x, y, size * 0.07, true);

  // Chiselled face: a warm gradient down the glyph, lighter at the top where a
  // carved letter catches the sky.
  // One typographic language for every warrior in the fight. The local plate is
  // a warmer limewash, half a step off the others — enough to find your own name
  // in a scrum, not enough to read as a second interface. The old gold ran from
  // #ffd67e to #e0a341 against a bone #efe4cd, and a panel scoring `brawl`
  // counted "two nameplate visual languages shipping simultaneously".
  // The old ramp topped out at #fffaf0 and then had a pure-white bevel laid over
  // it, which put the letterform's crown at the display ceiling — so the whole
  // carved read, the entire fall down the glyph, was being spent between code 255
  // and code 250 while the ceiling itself did the shouting. Both ramps now stop
  // just short of white and reach further *down*: the range comes out of the top,
  // where nothing could see it, and goes into the bottom, where the shadow under
  // a chiselled letter lives.
  const grad = ctx.createLinearGradient(0, y - size * 0.78, 0, y + size * 0.16);
  if (isLocal) {
    grad.addColorStop(0, "#fdf5e4");
    grad.addColorStop(0.55, "#ecdab6");
    grad.addColorStop(1, "#bda078");
  } else {
    grad.addColorStop(0, "#fbf6ea");
    grad.addColorStop(0.55, "#e8dcc4");
    grad.addColorStop(1, "#b3a288");
  }
  ctx.fillStyle = grad;
  drawTracked(ctx, text, x, y, size * 0.07, false);

  // Bevel highlight along the top edge only. Bone, not white: a specular white
  // on a limewashed letter is a sticker's highlight, and it is also the thing
  // that made the plate the brightest object in `laststand`.
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = isLocal ? "#fff8ea" : "#fdfaf2";
  drawTracked(ctx, text, x, y - size * 0.035, size * 0.07, false);
  ctx.globalAlpha = 1;

  // Weathering, kept to nicks at the scale of a chisel slip. Anything heavier
  // starts eating strokes and the name stops being a name.
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 9; i++) {
    ctx.globalAlpha = 0.2 + rand() * 0.4;
    ctx.beginPath();
    ctx.arc(x + rand() * width, y - size * (0.1 + rand() * 0.55), size * (0.02 + rand() * 0.045), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  // The plate crosses a lot of the frame edge-on at range; without this the
  // type crawls under SMAA.
  tex.anisotropy = 4;
  return { texture: tex, aspect: spec.w / spec.h, ink: width / spec.w, key, refs: 0 };
}

const DMG_CANVAS: Record<QualityTier, { w: number; h: number; size: number }> = {
  high: { w: 192, h: 128, size: 76 },
  medium: { w: 160, h: 106, size: 64 },
  low: { w: 112, h: 74, size: 44 },
};

/**
 * Damage numbers say two things and they say them in this order: *someone was
 * hit* and *by roughly this much*. Magnitude is carried by size, weight and
 * temperature together rather than by the digits, because in a brawl nobody
 * reads the digits — they read whether the thing that appeared was small and
 * bone-white or large and burning.
 */
function buildDamageGlyphs(key: string, amount: number, weight: 0 | 1 | 2, tier: QualityTier): Glyphs {
  const spec = DMG_CANVAS[tier];
  const surface = glyphCanvas(spec.w, spec.h);
  if (!surface) return unusableGlyphs(key, spec.w / spec.h);
  const { canvas: c, ctx } = surface;
  const text = String(amount);
  const size = spec.size * (weight === 2 ? 1 : weight === 1 ? 0.82 : 0.68);
  const cx = spec.w * 0.5;
  const cy = spec.h * 0.5 + size * 0.35;

  ctx.font = `700 ${size}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  if (weight === 2) {
    // A gash behind a heavy hit, long enough to read past both ends of the
    // numerals — the digits' own halo swallows whatever crosses them, so a mark
    // that only lives behind the type reads as two stray dots and nothing else.
    // Same job as the number being bigger, one channel further out, so the blow
    // lands before the eye has focused on what it says.
    ctx.strokeStyle = "rgba(150,26,12,0.55)";
    ctx.lineWidth = size * 0.09;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - size * 1.02, cy - size * 0.02);
    ctx.lineTo(cx + size * 1.02, cy - size * 0.66);
    ctx.stroke();
  }

  ctx.shadowColor = "rgba(4,2,2,0.95)";
  ctx.shadowBlur = size * 0.4;
  ctx.strokeStyle = "rgba(6,3,2,0.95)";
  ctx.lineWidth = size * (weight === 2 ? 0.2 : 0.16);
  ctx.strokeText(text, cx, cy);
  ctx.strokeText(text, cx, cy);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(18,9,6,0.98)";
  ctx.lineWidth = size * 0.1;
  ctx.strokeText(text, cx, cy);

  // Same restraint as the nameplates, and for the same reason — these are lifted
  // onto the grade's curve by GLYPH_GAIN on top of whatever the canvas says, so
  // a numeral authored at paper white arrives clipped and shapeless. A heavy hit
  // still burns; it burns from ember to bone rather than from orange to white.
  const grad = ctx.createLinearGradient(0, cy - size, 0, cy + size * 0.2);
  if (weight === 2) {
    grad.addColorStop(0, "#ffeec4");
    grad.addColorStop(0.4, "#f5aa40");
    grad.addColorStop(1, "#c8501f");
  } else if (weight === 1) {
    grad.addColorStop(0, "#fbf6ea");
    grad.addColorStop(0.6, "#f0deb2");
    grad.addColorStop(1, "#c49c68");
  } else {
    grad.addColorStop(0, "#f6f0e4");
    grad.addColorStop(1, "#beb4a0");
  }
  ctx.fillStyle = grad;
  ctx.fillText(text, cx, cy);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return { texture: tex, aspect: spec.w / spec.h, ink: 1, key, refs: 0 };
}

// ---------------------------------------------------------------------------

interface Plate {
  parent: THREE.Object3D;
  isLocal: boolean;
  /** Height above the rig origin this plate tracks. Measured off the warrior. */
  anchorY: number;
  group: THREE.Group;
  bar: THREE.Mesh;
  /** Drawn behind everything with depth off: what an occluded warrior leaves. */
  ghost: THREE.Mesh | null;
  /**
   * Null when the name's glyph texture failed to resolve — which cannot happen
   * in development, because the gate throws first. In production the plate keeps
   * its bar and the name mesh is never built at all. It is deliberately not "a
   * mesh that is hidden": a hidden unmapped quad is one stray `visible = true`
   * away from being the coloured square this module keeps getting blamed for,
   * and the whole point of the rule is that the state cannot be constructed.
   */
  name: THREE.Mesh | null;
  glyphs: Glyphs;
  /** The unmixed health colour. The mood tint is applied over it each frame. */
  fill: THREE.Color;
  barUniforms: Record<string, THREE.IUniform>;
  ghostOpacity: THREE.IUniform | null;
  nameMat: THREE.MeshBasicMaterial | null;
  /** Plate-local half extents, before the distance scale. */
  halfW: number;
  halfH: number;
  centreY: number;
  pct: number;
  lag: number;
  lagHold: number;
  flash: number;
  /**
   * The grace mark. TWO fields for two facts, because collapsing them is the
   * mistake this whole change exists to undo: `guardTruth` is what the last
   * packet said (0 or 1, server-owned, no memory), `guard` is what is currently
   * drawn (eased toward it, client-owned, purely cosmetic). The drawn value can
   * never keep a mark alive on its own — it has no duration, only a target.
   */
  guardTruth: number;
  guard: number;
  /** Seconds since this warrior hit zero health. Negative while alive. */
  dying: number;
  push: number;
  /** Screen-space rect for de-overlap, refilled every frame. */
  sx: number;
  sy: number;
  hx: number;
  hy: number;
  /** The bar's own screen rect, which is what a compacted plate collapses to. */
  ndcY: number;
  barHx: number;
  barHy: number;
  /** Name dropped because the stack was too deep to solve by pushing. */
  compact: boolean;
  dist: number;
  /** World units per unit of NDC height at this plate's depth, this frame. */
  worldPerNdc: number;
  alpha: number;
  live: boolean;
}

interface FloatingNumber {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  glyphs: Glyphs;
  age: number;
  life: number;
  weight: 0 | 1 | 2;
  vel: THREE.Vector3;
  spin: number;
  base: number;
}

export function createHud3d(scene: THREE.Scene, settings: QualitySettings): Hud3D {
  const plates = new Map<string, Plate>();
  const order: Plate[] = [];
  const live: FloatingNumber[] = [];
  const pool: FloatingNumber[] = [];
  /** This frame's visible plates, nearest first. Reused so a frame allocates nothing. */
  const placed: Plate[] = [];

  /**
   * Slide `p` up until it clears everything already placed. Three sweeps,
   * because clearing one plate can walk into another and a small fixed number
   * is cheaper and steadier under a moving camera than iterating to a fixpoint.
   */
  function settle(p: Plate, upto: number, from: number, hx: number, hy: number): number {
    let y = from;
    for (let pass = 0; pass < 3; pass++) {
      for (let j = 0; j < upto; j++) {
        const q = placed[j];
        if (Math.abs(p.sx - q.sx) > hx + q.hx + PUSH_PAD_X) continue;
        const minGap = hy + q.hy + PUSH_PAD_Y;
        if (Math.abs(y - q.sy) >= minGap) continue;
        y = q.sy + minGap;
      }
    }
    return y;
  }

  // One unit quad behind every plate, bar, ghost and number in the game.
  const quad = new THREE.PlaneGeometry(1, 1);

  /**
   * A 1x1 fully transparent texture, and the reason a pooled damage material is
   * never caught holding a dead map.
   *
   * The pool round-trip is the one place in this file where a material outlives
   * the texture it was built around: `retire()` releases the glyphs, the cache
   * sweep may dispose them, and the material sits in the pool still pointing at
   * a disposed texture until the next spawn rebinds it. A disposed map is not a
   * blank map — the sampler binds incomplete and the quad draws solid — so the
   * material is re-pointed here on the way out. `map` is therefore non-null and
   * alive at every instant of the pool's life, and a pooled quad that somehow
   * became visible would draw nothing at all rather than a coloured square.
   */
  const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
  blank.needsUpdate = true;

  const nameCache = new Map<string, Glyphs>();
  const dmgCache = new Map<string, Glyphs>();
  const DMG_CACHE_MAX = 40;

  const tint = new THREE.Color().copy(TINT_DUSK);
  const glyphInk = new THREE.Color();
  /** The same mood shift the ink takes, held back to `FILL_TINT_STRENGTH`. */
  const fillTint = new THREE.Color();
  const camPos = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const camRight = new THREE.Vector3(1, 0, 0);
  const camFwd = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const scratch2 = new THREE.Vector3();

  // Damage numbers landing on the same body in the same instant have to be told
  // apart, so each one remembers where the last one went in.
  const lastDmgAt = new THREE.Vector3(1e6, 0, 1e6);
  let lastDmgTime = -10;
  let clock = 0;
  // The end-of-match tableau holds the frame. A staged portrait with eight
  // green health bars floating over it is a fight again, so the summary asks
  // for the plates to stand down rather than detaching them — the same men
  // fight the rematch, and a detach here would cost every plate its glyphs
  // and its bar just to get them rebuilt ten seconds later.
  let suppressed = false;

  function acquireName(name: string, isLocal: boolean): Glyphs {
    const key = `${name}|${isLocal ? 1 : 0}`;
    let g = nameCache.get(key);
    if (!g) {
      g = buildNameGlyphs(key, name, isLocal, settings.tier);
      nameCache.set(key, g);
    }
    g.refs++;
    return g;
  }

  function releaseName(g: Glyphs): void {
    if (--g.refs > 0) return;
    nameCache.delete(g.key);
    g.texture?.dispose();
  }

  /**
   * Damage amounts repeat constantly inside a match, so these are cached and
   * only evicted once the map outgrows its cap — and never while a number that
   * is still on screen is holding one.
   */
  function acquireDamage(amount: number, weight: 0 | 1 | 2): Glyphs {
    const key = `${amount}|${weight}`;
    let g = dmgCache.get(key);
    // Re-insert so the eviction sweep walks a genuine recency order.
    if (g) dmgCache.delete(key);
    else g = buildDamageGlyphs(key, amount, weight, settings.tier);
    dmgCache.set(key, g);
    g.refs++;
    return g;
  }

  function releaseDamage(g: Glyphs): void {
    g.refs--;
    if (dmgCache.size <= DMG_CACHE_MAX) return;
    for (const entry of Array.from(dmgCache.values())) {
      if (dmgCache.size <= DMG_CACHE_MAX) break;
      if (entry.refs > 0) continue;
      dmgCache.delete(entry.key);
      entry.texture?.dispose();
    }
  }

  function detach(id: string): void {
    // The lock mark tracks the same object this plate does — see `drawnBodies`
    // in ./camera. A man who leaves takes both with him, and the mark must not
    // be left holding a rig that has gone out of the scene.
    noteDrawnBody(id, null);
    const plate = plates.get(id);
    if (!plate) return;
    scene.remove(plate.group);
    (plate.bar.material as THREE.Material).dispose();
    if (plate.ghost) (plate.ghost.material as THREE.Material).dispose();
    plate.nameMat?.dispose();
    releaseName(plate.glyphs);
    plates.delete(id);
    const at = order.indexOf(plate);
    if (at >= 0) order.splice(at, 1);
  }

  function retire(n: FloatingNumber): void {
    scene.remove(n.mesh);
    // Order matters: hand the material a live map before releasing the one it
    // is holding, so there is no instant at which a pooled material points at a
    // texture the cache sweep is entitled to dispose.
    n.mat.map = blank;
    releaseDamage(n.glyphs);
    pool.push(n);
  }

  /**
   * Re-proves, in development, the one invariant this module cannot check at
   * construction: that a material which *was* built around a live texture still
   * has one. Construction-time gates cannot see a texture disposed out from
   * under a quad three seconds later by a cache sweep or a botched refcount, and
   * that failure is silent, arrives as a solid coloured rectangle in the middle
   * of the frame, and looks exactly like a bug in somebody else's file.
   *
   * Twice a second, not per frame: it walks every plate and every live number,
   * and the point is to fail on roughly the frame it breaks rather than to be a
   * cost anybody has to think about. Production skips it entirely.
   */
  let auditDue = 0;
  function auditGlyphMaterials(): void {
    for (const plate of order) {
      if (!plate.nameMat) continue;
      if (plate.nameMat.map !== plate.glyphs.texture || !glyphTextureUsable(plate.nameMat.map)) {
        reportMapFailure(`nameplate "${plate.glyphs.key}" lost its glyph texture after construction`);
      }
    }
    for (const n of live) {
      if (n.mat.map !== n.glyphs.texture || !glyphTextureUsable(n.mat.map)) {
        reportMapFailure(`damage number "${n.glyphs.key}" lost its glyph texture after construction`);
      }
    }
  }

  /**
   * How large a plate should be at this distance, in world units per unit of
   * plate-local height. Sub-linear on both sides of the reference distance: near
   * plates back off a little so they stop filling the frame, far ones grow but
   * never enough to match the front of the fight.
   */
  function distanceScale(dist: number): number {
    const t = Math.max(dist, 0.5) / REF_DIST;
    return Math.pow(t, t < 1 ? NEAR_POWER : FAR_POWER);
  }

  return {
    attach(id, name, parent, isLocal, headTop) {
      // WHERE THIS MAN IS DRAWN, told to the lock mark. A nameplate and a lock
      // mark are the same claim about the same object — "that man there" — and
      // this is the one place in the client that is handed the rig group beside
      // the id it belongs to. Registered before the early-out, so a re-attach
      // after a rebuilt rig re-points the mark at the object that now exists.
      noteDrawnBody(id, parent);
      if (plates.has(id)) return;

      const glyphs = acquireName(name, isLocal);
      const group = new THREE.Group();

      const barUniforms: Record<string, THREE.IUniform> = {
        uFillColor: { value: FILL_HEALTHY.clone() },
        uLagColor: { value: FILL_LAG.clone() },
        uRimColor: { value: (isLocal ? RIM_LOCAL : RIM_REMOTE).clone() },
        uTroughColor: { value: TROUGH.clone() },
        uKeyColor: { value: KEYLINE.clone() },
        uPct: { value: 1 },
        uLag: { value: 1 },
        uOpacity: { value: 1 },
        uAspect: { value: BAR_W / BAR_H },
        uSegments: { value: 4 },
        uFlash: { value: 0 },
        uPulse: { value: 0 },
        uGuard: { value: 0 },
        uSeed: { value: (seedFrom(id)() * 64) | 0 },
      };

      const barMat = new THREE.ShaderMaterial({
        uniforms: barUniforms,
        vertexShader: BAR_VERT,
        fragmentShader: BAR_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const bar = new THREE.Mesh(quad, barMat);
      bar.scale.set(BAR_W, BAR_H, 1);
      bar.renderOrder = 992;
      group.add(bar);

      // The ghost shares every uniform except its opacity, so a health change is
      // one write and both passes follow it.
      let ghost: THREE.Mesh | null = null;
      let ghostOpacity: THREE.IUniform | null = null;
      if (settings.tier !== "low") {
        ghostOpacity = { value: 0 };
        const ghostMat = new THREE.ShaderMaterial({
          uniforms: { ...barUniforms, uOpacity: ghostOpacity },
          vertexShader: BAR_VERT,
          fragmentShader: BAR_FRAG,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          side: THREE.DoubleSide,
        });
        ghost = new THREE.Mesh(quad, ghostMat);
        ghost.scale.copy(bar.scale);
        ghost.renderOrder = 990;
        group.add(ghost);
      }

      // The material is built *from* the texture, and if there is no texture
      // there is no material and no mesh — not a hidden one, none. An unmapped
      // quad is not reachable from the scene graph because it is not
      // constructible on this path.
      const nameMat = glyphMaterial(glyphs, `nameplate "${name}"`);
      const nameW = NAME_H * glyphs.aspect;
      let nameMesh: THREE.Mesh | null = null;
      if (nameMat) {
        nameMat.color.copy(tint).multiplyScalar(GLYPH_GAIN);
        nameMesh = new THREE.Mesh(quad, nameMat);
        nameMesh.scale.set(nameW, NAME_H, 1);
        nameMesh.position.y = BAR_H * 0.5 + NAME_GAP + NAME_H * 0.5;
        nameMesh.renderOrder = 994;
        group.add(nameMesh);
      }

      // A dropped name is not allowed to keep reserving the screen space it
      // would have used, or the de-overlap solver pushes plates apart around a
      // rectangle nobody can see.
      const top = nameMesh ? nameMesh.position.y + NAME_H * 0.5 : BAR_H * 0.5;
      const bottom = -BAR_H * 0.5;
      const plate: Plate = {
        parent, isLocal, group, bar, ghost, name: nameMesh, glyphs,
        fill: FILL_HEALTHY,
        anchorY: headTop !== undefined ? headTop + HEAD_CLEARANCE : ANCHOR_FALLBACK,
        barUniforms, ghostOpacity, nameMat,
        halfW: Math.max(BAR_W, nameMesh ? nameW * glyphs.ink : 0) * 0.5,
        halfH: (top - bottom) * 0.5,
        centreY: (top + bottom) * 0.5,
        pct: 1, lag: 1, lagHold: 0, flash: 0, guardTruth: 0, guard: 0, dying: -1, push: 0,
        sx: 0, sy: 0, hx: 0, hy: 0, ndcY: 0, barHx: 0, barHy: 0, compact: false,
        dist: 0, worldPerNdc: 1, alpha: 1, live: false,
      };
      group.visible = false;
      // Interface, not surface: the occlusion pass must not see it. Without
      // this a plate against the sky wears a dark halo of its own making.
      setLayerDeep(group, LAYER_UNOCCLUDED);
      scene.add(group);
      plates.set(id, plate);
      order.push(plate);
    },

    detach,

    setSuppressed(on) {
      suppressed = on;
    },

    setHealth(id, current, max) {
      const plate = plates.get(id);
      if (!plate) return;
      const safeMax = max > 0 ? max : 1;
      const pct = Math.min(1, Math.max(0, current / safeMax));

      if (pct < plate.pct - 0.0005) {
        // The fill snaps and the lag streak stays put: the gap between them is
        // the hit, and it is the only part of this the player actually reads.
        plate.lagHold = 0.22;
        plate.flash = 1;
      } else if (pct > plate.pct + 0.0005) {
        plate.lag = Math.max(plate.lag, pct);
      }
      plate.pct = pct;
      if (pct <= 0 && plate.dying < 0) plate.dying = 0;
      if (pct > 0) plate.dying = -1;

      // Notches every 25 health, clamped so a boss-sized pool does not turn the
      // trough into a hatched texture.
      plate.barUniforms.uSegments.value = Math.min(8, Math.max(2, Math.round(safeMax / 25)));

      // Stored rather than written straight to the uniform: the mood tint is a
      // per-frame multiply over this, and mixing it in here would compound every
      // time a warrior took a hit.
      plate.fill = pct > 0.55 ? FILL_HEALTHY : pct > 0.28 ? FILL_WOUNDED : FILL_CRITICAL;
    },

    setGuard(id, on) {
      const plate = plates.get(id);
      if (!plate) return;
      plate.guardTruth = on ? 1 : 0;
    },

    spawnDamageNumber(amount, at, big) {
      const weight: 0 | 1 | 2 = big || amount >= 22 ? 2 : amount >= 11 ? 1 : 0;

      // The glyphs come first, before anything is built or recycled, because the
      // texture is what decides whether this number is allowed to exist at all.
      // Nothing downstream has to cope with a null map, and no code path here
      // can construct a `MeshBasicMaterial` that has not got one.
      const glyphs = acquireDamage(amount, weight);
      const tex = requireGlyphTexture(glyphs, `damage number ${amount}`);
      if (!tex) {
        releaseDamage(glyphs);
        return;
      }

      let n = pool.pop();
      if (!n) {
        if (live.length >= settings.damageNumberBudget) {
          // Recycling the oldest beats dropping the newest: a hit that produced
          // no feedback reads as a hit that did not land.
          n = live.shift()!;
          scene.remove(n.mesh);
          // Bind before release, exactly as `retire` does. `glyphs` is already
          // held so the sweep cannot evict what we are about to draw, but the
          // rule that a material never *holds* a releasable texture is worth
          // more as an invariant than as a case-by-case argument.
          //
          // Swapping one texture for another rebinds a sampler; it does not
          // change the program, because a pooled material was built with a map
          // and has never been without one. That is the whole reason the old
          // `needsUpdate` dance is gone rather than merely unnecessary.
          n.mat.map = tex;
          releaseDamage(n.glyphs);
        } else {
          const mat = glyphMaterial(glyphs, `damage number ${amount}`);
          if (!mat) {
            releaseDamage(glyphs);
            return;
          }
          const mesh = new THREE.Mesh(quad, mat);
          mesh.renderOrder = 996;
          n = { mesh, mat, glyphs, age: 0, life: 1, weight, vel: new THREE.Vector3(), spin: 0, base: 0 };
        }
      }

      n.glyphs = glyphs;
      n.mat.map = tex;
      n.mat.color.copy(glyphInk);
      n.age = 0;
      n.life = weight === 2 ? 1.25 : 0.98;
      n.weight = weight;

      // Chest height, pulled a little toward the camera so a number never opens
      // inside the body that earned it.
      scratch.set(at.x, 1.52, at.z);
      scratch2.copy(camPos).sub(scratch);
      scratch.addScaledVector(scratch2, 0.42 / (scratch2.length() || 1));

      // Blows land in flurries. Two numbers in the same place in the same third
      // of a second have to be told apart or they read as one.
      const stacked = clock - lastDmgTime < 0.4 && scratch.distanceToSquared(lastDmgAt) < 1.4;
      const side = stacked
        ? (Math.random() < 0.5 ? -1 : 1) * (0.42 + Math.random() * 0.3)
        : (Math.random() - 0.5) * 0.34;
      lastDmgAt.copy(scratch);
      lastDmgTime = clock;

      n.mesh.position.copy(scratch);
      if (stacked) n.mesh.position.y += 0.3;
      n.base = n.mesh.position.y;
      // Fan across the camera's right, not the world's X, or the separation
      // collapses to nothing whenever the fight lines up with the view axis.
      n.vel.copy(camRight).multiplyScalar(side);
      n.vel.y += weight === 2 ? 2.35 : 1.85;
      n.spin = weight === 2 ? (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 0.22;
      n.mesh.visible = true;
      n.mesh.layers.set(LAYER_UNOCCLUDED);
      scene.add(n.mesh);
      live.push(n);
    },

    update(dt, ctx) {
      clock = ctx.time;
      const camera = ctx.camera;
      // camera.ts poses the camera in step 5 but nothing derives its inverse
      // until the render call, and every projection below needs it this frame.
      // This recomputes a derived matrix; it does not move the camera.
      camera.updateMatrixWorld();
      camPos.setFromMatrixPosition(camera.matrixWorld);
      camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      tint.copy(ctx.mood === "lastStand" ? TINT_LAST_STAND : TINT_DUSK);
      glyphInk.copy(tint).multiplyScalar(GLYPH_GAIN);
      fillTint.setRGB(1, 1, 1).lerp(tint, FILL_TINT_STRENGTH);
      // One cycle of the critical pulse, shared by every dying plate so eight of
      // them beat together rather than shimmering against each other.
      const pulsePhase = 0.5 + 0.5 * Math.sin(ctx.time * 5.4);

      const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
      const aspect = camera.aspect || 1;

      // ---- plates: place, size, fade ----
      for (const plate of order) {
        plate.live = false;

        if (suppressed) {
          plate.group.visible = false;
          continue;
        }

        // A rig that left the scene without a detach must not keep a plate.
        if (!plate.parent.parent) {
          plate.group.visible = false;
          continue;
        }

        if (plate.dying >= 0) {
          plate.dying += dt;
          if (plate.dying > 0.85) {
            plate.group.visible = false;
            continue;
          }
        }

        plate.parent.updateWorldMatrix(true, false);
        anchor.setFromMatrixPosition(plate.parent.matrixWorld);
        anchor.y += plate.anchorY;

        // Behind the eye, project() divides by a negative w and hands back a
        // plausible-looking point in front. Reject on the view vector instead.
        scratch.copy(anchor).sub(camPos);
        const dist = scratch.length();
        if (scratch.dot(camFwd) <= camera.near || dist > FADE_END) {
          plate.group.visible = false;
          continue;
        }
        ndc.copy(anchor).project(camera);

        // No size bump for the local warrior. It was 1.04 — small on its own, but
        // it stacked onto the depth ramp in exactly the frames where the local
        // plate is also the nearest, and scale is the last axis on which the two
        // plate treatments still differed. The half-step warmer ink and the
        // slightly warmer bone rim are the whole of the distinction now.
        const scale = distanceScale(dist);
        const worldPerNdc = Math.max(dist * tanHalf, 1e-3);

        plate.dist = dist;
        plate.worldPerNdc = worldPerNdc;
        // De-overlap works in a square screen space — NDC x premultiplied by
        // aspect — so that a horizontal gap and a vertical one mean the same
        // thing. Both half-extents therefore divide by worldPerNdc alone; the
        // aspect is already folded into sx.
        plate.sx = ndc.x * aspect;
        plate.ndcY = ndc.y;
        plate.sy = ndc.y + (plate.centreY * scale) / worldPerNdc;
        plate.hx = (plate.halfW * scale) / worldPerNdc;
        plate.hy = (plate.halfH * scale) / worldPerNdc;
        plate.barHx = (BAR_W * 0.5 * scale) / worldPerNdc;
        plate.barHy = (BAR_H * 0.5 * scale) / worldPerNdc;

        let alpha = 1 - smooth(FADE_START, FADE_END, dist);
        alpha *= smooth(NEAR_FADE_IN, NEAR_FADE_FULL, dist);
        if (plate.dying >= 0) alpha *= 1 - plate.dying / 0.85;
        // The local warrior's health already has a screen HUD. In-world this is
        // a name badge that happens to carry a bar, so it sits back a stop.
        if (plate.isLocal) alpha *= 0.86;
        if (alpha <= 0.01) {
          plate.group.visible = false;
          // Drop the de-overlap offset while hidden, so a plate that comes back
          // does not fade in already shoved halfway up the frame.
          plate.push = 0;
          continue;
        }

        plate.alpha = alpha;
        plate.group.visible = true;
        plate.group.scale.setScalar(scale);
        plate.group.quaternion.copy(camera.quaternion);
        plate.group.position.copy(anchor);
        plate.live = true;
      }

      // ---- de-overlap, nearest first ----
      // Warriors lining up behind each other is the normal case in a shield
      // wall, not an edge case, so this runs every frame rather than on demand.
      placed.length = 0;
      for (const plate of order) if (plate.live) placed.push(plate);
      placed.sort(byDistance);

      for (let i = 0; i < placed.length; i++) {
        const p = placed[i];
        const y = settle(p, i, p.sy, p.hx, p.hy);

        if (y - p.sy <= MAX_PUSH) {
          p.compact = false;
          p.push += (y - p.sy - p.push) * Math.min(1, dt * 10);
          p.sy += p.push;
        } else {
          // Too deep a stack to solve by moving. Drop the name and re-place on
          // the bar alone — eight bars in a column still read, eight names on
          // top of each other read as nothing, and the bar is the part that is
          // actually changing during a fight.
          p.compact = true;
          p.hx = p.barHx;
          p.hy = p.barHy;
          const compactY = Math.min(settle(p, i, p.ndcY, p.barHx, p.barHy), p.ndcY + MAX_PUSH);
          p.push += (compactY - p.ndcY - p.push) * Math.min(1, dt * 10);
          p.sy = p.ndcY + p.push;
        }

        if (p.name) p.name.visible = !p.compact;
        if (Math.abs(p.push) > 1e-4) p.group.position.addScaledVector(camUp, p.push * p.worldPerNdc);
      }

      // ---- per-plate material state ----
      for (const plate of order) {
        if (!plate.live) continue;
        const alpha = plate.alpha;

        if (plate.lagHold > 0) plate.lagHold -= dt;
        else if (plate.lag > plate.pct) plate.lag = Math.max(plate.pct, plate.lag - dt * 0.75);
        else plate.lag = plate.pct;

        plate.flash = Math.max(0, plate.flash - dt * 3.6);
        // Eased toward the truth, never counted down from it. `easeGrace` snaps
        // its own tail, so a plate that is not under grace writes an exact 0 —
        // which is the number `tools/gracetest.mjs` asserts on the first frame
        // of `fighting`, rather than a tolerance.
        plate.guard = easeGrace(plate.guard, plate.guardTruth, dt);

        plate.barUniforms.uPct.value = plate.pct;
        plate.barUniforms.uLag.value = plate.lag;
        plate.barUniforms.uFlash.value = plate.flash * plate.flash * 0.55;
        plate.barUniforms.uGuard.value = plate.guard * alpha;
        plate.barUniforms.uOpacity.value = alpha;
        // A warrior about to go down says so on his own plate. This is the one
        // place the HUD is allowed to move without being hit: at critical health
        // the fill breathes, ramped in over the last fifth of the pool so it
        // arrives rather than switching on, and stopped dead once he is down —
        // a corpse's plate pulsing through its fade reads as a live enemy.
        const urgency = plate.pct > 0 ? 1 - smooth(0.1, 0.3, plate.pct) : 0;
        plate.barUniforms.uPulse.value = urgency * pulsePhase;
        // Occluded plates read as an outline at a fifth strength — enough to
        // know a warrior is behind the hut, not enough to argue with the ones
        // you can actually see.
        if (plate.ghostOpacity) plate.ghostOpacity.value = alpha * 0.2;

        const rim = plate.isLocal ? RIM_LOCAL : RIM_REMOTE;
        (plate.barUniforms.uRimColor.value as THREE.Color).copy(rim).multiply(tint);
        (plate.barUniforms.uFillColor.value as THREE.Color).copy(plate.fill).multiply(fillTint);
        if (plate.nameMat) {
          plate.nameMat.color.copy(glyphInk);
          plate.nameMat.opacity = alpha;
        }
      }

      // Development only, twice a second: re-prove that nothing on screen has
      // lost the texture it was built around. See `auditGlyphMaterials`.
      if (DEV) {
        auditDue -= dt;
        if (auditDue <= 0) {
          auditDue = 0.5;
          auditGlyphMaterials();
        }
      }

      // ---- floating numbers ----
      for (let i = live.length - 1; i >= 0; i--) {
        const n = live[i];
        // The one way a number that spawned with a valid map can lose it is the
        // cache sweep disposing a texture that something on screen is still
        // holding, which the refcount is supposed to prevent. Cheap to assert,
        // impossible to spot in a capture, and the failure mode is the coloured
        // square this module keeps getting blamed for.
        if (DEV && dmgCache.get(n.glyphs.key) !== n.glyphs) {
          throw new Error(`hud3d: live damage number "${n.glyphs.key}" outlived its cached glyphs — its texture may already be disposed.`);
        }
        n.age += dt;
        if (n.age >= n.life) {
          live.splice(i, 1);
          retire(n);
          continue;
        }

        n.mesh.position.addScaledVector(n.vel, dt);
        n.vel.y -= 3.4 * dt;
        n.vel.x *= 1 - Math.min(0.9, dt * 2.2);
        n.vel.z *= 1 - Math.min(0.9, dt * 2.2);
        // Never let a number fall back through the body that threw it.
        if (n.mesh.position.y < n.base) n.mesh.position.y = n.base;

        const dist = n.mesh.position.distanceTo(camPos);
        // A punch out of the gate, settling in about a tenth of a second. This
        // is most of what makes a number read before it is consciously seen.
        const pop = n.age < 0.11 ? 0.5 * (1 - n.age / 0.11) : 0;
        const base = (n.weight === 2 ? 0.62 : n.weight === 1 ? 0.48 : 0.38) * (1 + pop);
        const scale = base * distanceScale(dist) * (n.weight === 2 ? 1.1 : 1);
        n.mesh.scale.set(scale * n.glyphs.aspect, scale, 1);
        n.mesh.quaternion.copy(camera.quaternion);
        if (n.spin !== 0) n.mesh.rotateZ(n.spin * (1 - n.age / n.life));

        const inFade = Math.min(1, n.age / 0.05);
        const outFade = 1 - smooth(n.life * 0.5, n.life, n.age);
        n.mat.opacity = inFade * outFade * (1 - smooth(FADE_START, FADE_END, dist));
        n.mat.color.copy(glyphInk);
      }
    },

    dispose() {
      for (const id of Array.from(plates.keys())) detach(id);
      for (const n of live) {
        scene.remove(n.mesh);
        n.mat.dispose();
      }
      for (const n of pool) n.mat.dispose();
      live.length = 0;
      pool.length = 0;
      order.length = 0;
      for (const g of nameCache.values()) g.texture?.dispose();
      for (const g of dmgCache.values()) g.texture?.dispose();
      nameCache.clear();
      dmgCache.clear();
      quad.dispose();
      blank.dispose();
    },
  };
}

/** Nearest first: the plate closest to the camera is the one that keeps its spot. */
function byDistance(a: Plate, b: Plate): number {
  return a.dist - b.dist;
}

/** Hermite ramp, matching GLSL smoothstep so shader and CPU fades agree. */
function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1e-6)));
  return t * t * (3 - 2 * t);
}
