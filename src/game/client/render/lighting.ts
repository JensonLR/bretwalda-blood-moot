// The light rig and shadow configuration.
//
// Owns the global rig only: ambient, hemisphere, the moon key with its shadow
// cascades, the shaping fills, the camera-relative separation pair, and the
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
//
// ---------------------------------------------------------------------------
// Why v4 read as cardboard standing on lit turf, measured
// ---------------------------------------------------------------------------
//
// Two failures, both of them this module's, both of them measurable in the v4
// captures rather than matters of taste.
//
// **The settlement cast nothing.** One cascade, half-extent
// min(shadowDistance, mapSize·0.02/2) = 20.5 m, hung on the local warrior. The
// palisade ring is at 19.6 m *from the arena centre*, the huts at 27–52 m, so
// the moment the focus stepped off the origin the far side of the wall left the
// box and every stake in it stopped casting. Sampled in `brawl`, the timber at
// the wall's foot came back at luma 97.0 and the turf directly beneath it at
// 96.4 — six tenths of a luma step where two metres of oak meets the ground.
// That is not a soft shadow, it is no shadow, and it is the whole reason the
// midground reads as a painted flat: the eye takes "no contact darkening" as
// "not standing on anything".
//
// **The bonfire was not a light.** Sampled in `lineup`, a hooded warrior three
// metres in front of a blazing fire had a silhouette edge of rgb(36, 28, 96) on
// the fire's side — a cold violet, against a background at rgb(164, 71, 6).
// The pool was a point light at decay 2 hung at 3.0 m, which is the wrong law,
// the wrong height and the wrong shape for a two-metre bed of coals: 1/d² threw
// nearly all of its energy inside the hearth stones, and a source hanging well
// above head height rakes down onto shoulders instead of round a silhouette.
// Nothing in the arena cast a fire shadow at all.
//
// What this pass changes, in order of how much frame it buys:
//
//  1. **Two cascades, not one.** The near one is sized purely for contact and
//     is now *tighter* than v4's, because it no longer has to reach anything.
//     The far one is pinned to the arena origin and sized to the settlement, so
//     the palisade, the woodpiles and the near huts cast and receive for the
//     first time. See `SETTLEMENT_HALF`.
//  2. **The hearth becomes a source.** A softer falloff law, a lower centre, a
//     longer reach, and on the top tier a shadow-casting beam thrown down the
//     camera's own bearing so the warriors between the lens and the fire finally
//     lay shadows toward the viewer.
//  3. **The warm half of the separation pair learns where the fire is.** When
//     the subject is close to the bonfire and the bonfire is behind him, the
//     kick swings off its authored bearing onto the fire's, takes the fire's
//     hue, and gains. That is the backlit-warrior-against-flame shot, and it is
//     one light already in the rig doing a second job rather than a sixth
//     directional.
//
// ---------------------------------------------------------------------------
// Why v6 still had no fire rim and no contact anywhere, measured
// ---------------------------------------------------------------------------
//
// **The fire's energy was never the problem — its bearing was.** Sampled in
// `brawl` (fire at the origin, the local warrior at 4.5 m with the lens behind
// him), the pool and beam together already put about 13 linear units on his
// *back*. His silhouette edge came back at rgb(88, 68, 50) — red minus blue of
// 38, a neutral warm grey, with the fire behind him at 250. Both facts are the
// same fact: a silhouette edge is where the surface normal is perpendicular to
// the view ray, so a light sitting on the view axis — which is exactly where a
// backlighting fire sits — meets that normal at N·L ≈ 0. Every unit the fire
// spends lands on the half of him the camera cannot see.
//
// That is also what v4's fire steer did wrong, and it got *worse* as it got
// stronger: it lerped the kick's hang point onto the fire's own bearing, which
// is the one bearing that cannot rim anything. The steer was cancelling the
// −53° swing that made the kick a rim in the first place. And it was tiny
// anyway — at 4.5 m the 6.5 m reach and its smoothstep returned 0.23, so the
// most valuable shot the arena can produce was running at a fifth of an effect
// that was pointed the wrong way.
//
// **Nothing occluded anything at contact.** Sampled at the boot in `closeup`,
// the plank under the sole and the plank two boot-lengths away are within a
// luma step of each other; the palisade in `laststand` casts a stripe across
// the turf but its own footing is not a shade darker than open ground. Both
// cascades detach — that is what `normalBias` does, it is not a bug — and both
// detach in the same direction, because they are the same moon. A rig with one
// light direction has no term that can darken a junction, so there was none.
//
// What this pass changes:
//
//  1. **A sky-occlusion light.** Half the rig's flat fill — ambient plus
//     hemisphere — is moved into a single near-vertical directional that casts.
//     Its shadow map *is* the ambient occlusion term: boot to ground, stake to
//     ground, wall under eave, shoulder onto chest. It is the one light in the
//     rig that can land a shadow with no gap under its caster, and the reason
//     is geometric rather than tuned — see `AO_TILT`. It is also the only term
//     the rig has that darkens a cluttered background more than a lone figure
//     standing in front of it, which is the crowd-readability lever.
//  2. **The fire steer steers the frame, not the light.** The pair's bearing is
//     measured from a "behind" direction that blends from the camera's to the
//     fire's; the swing is then applied on top, so a steered kick keeps the
//     rake that makes it a rim. Longer reach, more gain, and it drops towards
//     the coal bed's own elevation as it takes over.
//  3. **The near cascade tightens again and the fire beam widens**, so more of
//     a ring of eight is inside the only fire shadow the frame can afford.
//
// ---------------------------------------------------------------------------
// Why v7 had no warrior shadows at all, measured
// ---------------------------------------------------------------------------
//
// Three independent panels scored this 2/10 and named it the worst failure in
// the build: in `laststand` the palisade throws hard stripes six metres across
// the grass while two warriors on lit ground two metres away throw nothing; in
// `brawl` eight figures ring a blaze and not one casts a fire shadow; in the
// `lineup` boot crop four soles and a planted sword meet the ground with no
// contact darkening whatever.
//
// The receive path was never broken and neither were the cascades — the same
// moon that stripes the palisade covers every warrior in the arena. Four
// separate things were subtracting from the same shadow until nothing was left
// of it, and only the first is the one the panel's arithmetic found:
//
// **Most of the rig could not be blocked.** Summed as irradiance against an
// up-facing ground normal — which is N·L and not intensity, so the low fills
// count for far less than their headline numbers — dusk put 2.28 of
// *unblockable* light on the turf (ambient 0.66, hemisphere 0.44, warm 0.35,
// rim 0.51, kick 0.32) against 3.64 that a shadow could take away. A shadow
// that leaves 38% of the light standing is a smudge before anything else goes
// wrong with it.
//
// **The two lights spending the most on the ground were the two that needed to
// spend the least.** The rim and the kick exist for the *silhouette edge*, and
// an edge is lit by the flat component of a light while the ground is lit by
// its elevation. Hanging them at 7.5° and 11° bought 0.83 of ground fill for
// nothing: at 3° and 4° the same lights land within 1% of the same value on an
// edge. That was the cheapest 0.83 in the module and it had been sitting there
// since v2.
//
// **The rim was also drawing the searchlights.** A directional light is a delta
// source, and a puddle is a mirror, so a puddle returns the whole of it wherever
// the light's elevation matches the lens's view angle down onto the ground. At
// the rim's 7.5° and a camera at 1.6 m that is twelve metres ahead — the middle
// of the arena — which is the hard white ellipse in `brawl`, in the rim's own
// colour, screen-locked because the rim is camera-relative. The same light at
// 3.9 candela is most of the cool blue glint field over the churned floor in the
// same frame, because world.ts clamps that floor to roughness 0.34 across the
// whole churn mask and a broad lobe on a damp surface is still a lit lobe. None
// of it can be shadowed, all of it is where the eye looks for a contact edge,
// and dropping the elevation moves it out past the palisade for free.
//
// **And the fire beam could not project a man at all.** It hung at the coal bed
// with the pool, 1.25 m up. Everything on a warrior above 1.25 m therefore
// projected *above the horizon* and never reached the ground; only his shins
// cast, at a grazing 8°, into a shadow tens of metres long. That is not a weak
// fire shadow, it is a geometric impossibility, and no amount of candela or
// beam share was ever going to fix it.
//
// What this pass changes:
//
//  1. **The flat fill is moved into the sky-occlusion light.** ambient and
//     hemisphere come down to 0.40/0.26 and `ao` goes to 2.20, so 76% of the
//     ground's fill is now a term a boot can block instead of 50%. Unblockable
//     ground light falls from 2.28 to 1.11 and total ground exposure moves by
//     half a per cent — this is a redistribution, not a brightening, and the
//     frame's operating point against postfx's white point is deliberately
//     unchanged. Lit against fully shadowed turf goes from 2.60:1 to 3.10:1 in
//     dusk and 2.07:1 to 2.66:1 in the last stand.
//  2. **The separation pair goes flat.** Rim to 3°, kick to 4°, with the rim's
//     swing widened to 0.80 so its edge value is held to within 1% of v7's at a
//     lower level. Same silhouette, a fifth of the ground spill, and the
//     specular lobes leave the frame.
//  3. **`ao.shadow.intensity` at 0.62, and the bounce up to 2.35.** A shadow map
//     is a binary visibility test and sky occlusion is not binary — a face under
//     a helm rim still sees a good part of the dome. Letting an occluded point
//     keep 38% of a much larger AO term costs the contact darkening nothing (the
//     term it takes 62% of has doubled, so what lands under a boot goes up, not
//     down) and it is half of what stops (1) turning every helmed face into the
//     black oval `lineup` has been scoring on. The other half is the bounce,
//     which is the only light in the rig that reaches *under* a brow and the
//     only one that provably cannot brighten the turf. Together a helm-shaded
//     face goes from 2.29 to 2.69 against a ground that has not moved.
//  4. **The beam climbs above head height.** The pool stays at the coal bed
//     doing the rim, which is its job; the beam goes to the top of the flame
//     column at 3.35 m, which is the only place a fire shadow of a standing man
//     exists. See `BEAM_RISE`.
//
// ---------------------------------------------------------------------------
// Why v8 pointed every shadow in the game at the sun
// ---------------------------------------------------------------------------
//
// Four panels scored the palisade stripes in `laststand` as the lighting win of
// two iterations. They run down-LEFT, and the sun glare is at frame-left. Every
// stripe, every warrior shadow and every contact edge in the build was aimed at
// the brightest object in the sky, because the only shadow-casting directional
// in the rig was hung on `sky.moonDirection` and the arena's dominant body is
// not the moon.
//
// It is not close. sky.ts hands out `sunIntensity: 22` against
// `moonIntensity: 0.1`, and at the dusk geometry the sun clears the horizon at
// 2.4° while the moon sits at 11.5°: after extinction the sun's beam is
// (5.45, 1.79, 0.11) linear against the moon's (0.067, 0.049, 0.023). Three
// orders of magnitude. Aiming the caster at the moon was never a stylistic
// choice — the interface field is called `key` and it was wired to the moon
// because a night rig wants a moon key, and nobody re-checked once the sky
// became a *sunset*.
//
// The fix is a swap of two azimuths and nothing else, and it is worth stating
// that it is only that, because the obvious worry is what re-aiming the largest
// light in the rig does to the frame's colour:
//
//  1. **The caster follows whichever body dominates.** `casterShare` blends the
//     axis from the moon to the sun as the sun clears the horizon, so a
//     `setTimeOfDay` sweep hands the shadows over at nautical twilight rather
//     than snapping them 80° round. The occlusion light leans along the same
//     axis, so contact and cast agree as they always did.
//  2. **The low rake takes the body the caster left.** Otherwise the whole east
//     side of the settlement loses its only directional and goes to ambient:
//     the two lights are a *pair*, one per body, and which of them casts is the
//     only thing this pass changes about them.
//  3. **Neither light's colour moves, and that is arithmetic rather than luck.**
//     `aim` re-extincts a body's hue for the elevation the rig actually hangs it
//     at, and both bodies are low enough that both get re-extincted to nearly
//     the same place. The caster at 37° comes out at (1, 0.899, 0.690) off the
//     sun where it was (1, 0.900, 0.693) off the moon; the rake, once it is
//     clamped *down* to 9.2° rather than merely up (see `FILL_MAX_ELEVATION`),
//     comes out at (1, 0.398, 0.072) off the moon where it was (1, 0.395,
//     0.071) off the sun. The change is geometric. The palette is untouched.
//
// The same panel found three more, and two of them are this module's:
//
// **No contact darkening at any boot, measured rather than argued.** In
// `v8/lineup.png` the ground at the huscarl's right toe reads luma 82.3 against
// an open-floor mean of 62.1 — the boot does not sit in a darker patch, it sits
// in a *brighter* one. Two mechanisms, both here. The near cascade's 2.4 cm
// normalBias slips its shadow 3.2 cm downstream at a 37° key, which is most of
// what is visible of a sole; and the occlusion light that exists to cover that
// gap was leaning 14° off vertical, so its darkening fell 0.25 × height — i.e.
// *underneath* the caster, where the caster hides it from a gameplay camera.
// `AO_TILT` goes to 26°, which throws the same darkening half a metre onto the
// camera side of the boot where the lens can see it, and `AO_SHADOW_INTENSITY`
// goes to 0.85 now that the black-oval trade it was paying for has its own
// light. Full shadow moves 3.10 → 4.56:1 at dusk and 2.66 → 3.67:1 in the last
// stand, with the palisade stripe held at 1.83:1 and total ground exposure
// within 0.2%. A boot's own surround is still only 1.48:1 against turf whose
// measured σ/µ is 0.367, and that is the honest ceiling of a light rig: the
// occlusion term cannot remove more of the ground than it puts on it. See
// RIM_SWING for the half of that variance which is this module's.
//
// **Half the faces are black ovals, and the reason is a hue rather than a
// level.** Sampled in `v8/lineup.png` the huscarl's face comes back at luma 33
// with an R:G:B of 54:30:12, against ground at 75. Every directional in the rig
// except the bounce sits *behind* the subject — both bodies are at −z and the
// separation pair is camera-relative — so the only thing reaching a face turned
// toward the lens is `bounce`, and `bounce` is olive (0x93a084) because it is
// turf. Those three numbers are what an olive fill on warm skin comes to once
// the grade has been over it: a muddy dark patch rather than an underlit face,
// which is why raising a level was never going to recover it. `faceFill` is the
// answer OPEN-DEFECTS asked for: a warm, near-level front fill hung below the
// horizon so that it *provably cannot touch the ground* — an up-facing normal
// against a light at negative elevation clamps to zero, which is the same
// guarantee the bounce trades on — and therefore cannot spend a unit of the
// contact darkening the pass above just bought.

import * as THREE from "three";
import type { FrameContext, Mood, QualitySettings } from "./quality";

export interface LightingHandle {
  readonly root: THREE.Group;
  /**
   * The moon, and the near half of its cascade — the light that owns every
   * contact edge in the frame. `keyFar` carries the same beam over the whole
   * settlement; the two are one light split in energy, not two moons.
   */
  readonly key: THREE.DirectionalLight;
  /** The settlement cascade, or null on a tier that cannot afford a second map. */
  readonly keyFar: THREE.DirectionalLight | null;
  readonly ambient: THREE.AmbientLight;
  /**
   * Points the hearth pool at the arena's real main fire.
   *
   * The point named is the fire's *radiant centre* — which is what GameCanvas
   * hands over, world.ts's flame light at 1.8 m above the coals — not the fire's
   * base. The pool then drops `HEARTH_DROP` from it, because the thing that
   * rims a warrior is the coal bed at chest height and not the flame tip.
   * Mirrors sky.ts's `setHazeLight`: without it the pool sits at a documented
   * default and the frame is right, it just stops being right if the bonfire
   * moves.
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
  /**
   * The low rake off whichever body is *not* casting — the sun's afterglow once
   * the moon has the shadows, the moon's own low disc while the sun has them.
   * Shadowless, so it can sit very low, and clamped to one elevation either way
   * so that swapping bodies swaps a bearing and not a colour.
   */
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
  /**
   * The face fill: warm, near level, hung a hair below the horizon in front of
   * the subject. Not a sixth shaping light either — it is the one term in the
   * rig aimed at a *composition* failure rather than a physical one, and its
   * elevation is negative so that it cannot pay for that with ground contrast.
   */
  face: number;
  faceColor: number;
  /**
   * Sky occlusion. Not a sixth shaping light — it is the part of the flat fill
   * that has been given a direction so that it can be *blocked*, and its
   * intensity is sized against `ambient` and `hemi` rather than on its own.
   * A tier that cannot afford its cascade folds it back into those two.
   */
  ao: number;
  aoColor: number;
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
  //
  // ambient and hemi are down again — 0.66/0.44 in v7, 0.85/0.62 in v6 — and
  // `ao` is where the difference has gone on both passes. It is a redistribution
  // and not a cut, and the number that matters is not the sum but what fraction
  // of it can be *blocked*. Against an up-facing normal the three come to
  // 0.40 + 0.26 + 2.20·cos(AO_TILT) ≈ 2.79 where v7 summed 2.21 and v6 summed
  // 1.47, and 76% of that is now directional where v7 was 50% and v6 was 0%.
  //
  // The contact darkening itself barely moves — 1.32 against v7's 1.11, because
  // `AO_SHADOW_INTENSITY` hands 38% of the bigger term back. What moves is
  // everything standing *next* to it: unblockable ground light falls from 2.28
  // to 1.11 across this and the three elevation changes below, so the same
  // shadow now removes 68% of the turf's irradiance instead of 62% and leaves
  // 1.92 behind instead of 2.28. A shadow is a ratio, and until this pass the
  // rig had been trying to win it by adding to the numerator.
  //
  // The cool half of the frame survives the ambient cut for the same reason it
  // survived v7's: `aoColor` is a colder blue-grey than either of the two terms
  // being drained, so the arena keeps more cold light than before, not less —
  // it just arrives with a direction attached. What genuinely does get thinner
  // is light reaching a *crevice*, which no directional term can serve, and
  // that is what `AO_SHADOW_INTENSITY` and the raised bounce are for.
  //
  // It is also the pass's answer to crowd readability, which is worth stating
  // because it is not obvious from the number. The background this arena puts
  // behind a mid-distance warrior is *cluttered* — a stake ring where every
  // stake shades its neighbour, hut walls set back under deep eaves, stacked
  // woodpiles — while the warrior is a lone vertical standing in the open. A
  // fill that can be blocked therefore sinks the background and keeps the
  // figure, which no unshadowed term in this rig can do at any intensity.
  //
  // ambient and hemi come down once more — 0.32/0.21 against v8's 0.40/0.26 —
  // and `ao` takes it, for the third pass running and for the same reason each
  // time. What is different this pass is that the occlusion light finally spends
  // it somewhere the camera can see: at `AO_TILT`'s new 26° its darkening lands
  // beside a boot rather than under one. Against an up-facing normal the three
  // now sum to 0.32 + 0.21 + 2.55·cos(AO_TILT) ≈ 2.81 where v8 summed 2.79, and
  // 0.85 of the occlusion term is blockable where v8 blocked 0.62 of a smaller
  // one — so what a shadow actually removes from the turf goes from 4.03 to 4.65
  // against a total that has moved by 0.14%.
  dusk: {
    ambient: 0.32,
    ambientColor: 0x6a86a0,
    hemi: 0.21,
    hemiSky: 0x8fb4d2,
    hemiGround: 0x7a5a3c,
    key: 4.5,
    warm: 1.05,
    // The measured defect this answers is crowd readability: in `brawl` a
    // warrior at twelve metres came back at a red-minus-blue of 108 against a
    // palisade at 112 — the same hue, so the only thing holding the figure off
    // the wall was 40 luma of value, and at that distance the haze eats most of
    // that. The rim is the one term in the rig that lands on a silhouette edge
    // and provably cannot land on the background behind it, so it is the term
    // that buys separation back.
    //
    // 3.02, down from v7's 3.9 and v8's 3.3, and the edge is *not* down with it
    // on either step. What a rim puts on a silhouette is
    // `intensity · cos(elevation) · sin(swing)`; taking the elevation to 3° and
    // widening the swing to 0.90 holds that product to within 0.1% of v7's while
    // the three things the level was actually costing come down with the number
    // — unblockable ground fill, a specular lobe hard enough to read as a
    // searchlight, and the ground's own *variance*. See RIM_SWING for the last
    // of those, which is the one this pass found.
    rim: 3.02,
    rimColor: 0x9ec8ff,
    kick: 1.65,
    kickColor: 0xffbe8c,
    // Olive rather than gold on purpose. This is light off wet turf, it is the
    // largest single term on a warrior's front, and making it warm would be a
    // third orange source in a frame already fighting a sepia cast. A green-grey
    // fill against an orange sky is also the cheapest separation there is — and
    // it is pushed a shade further from the sunset here than in v4, for the same
    // crowd-readability reason as the rim above.
    //
    // 2.35, up from 1.7, and it is up for the faces. A light hung *below* the
    // horizon is the only term in this rig that reaches under a helm brow, and
    // it is also the only one that can be raised without lifting the turf by a
    // single unit — an up-facing normal against a downward light clamps to
    // zero. So it is free contrast and a face fill at the same time, which is
    // the only combination worth spending on while the ground shadow is the
    // blocker.
    bounce: 2.35,
    bounceColor: 0x93a084,
    // The olive above is right for turf and wrong for a cheekbone, and until
    // this pass it was the *only* light a face turned toward the lens received:
    // measured off `v8/lineup.png`, the huscarl's face came back at luma 33 with
    // an R:G:B of 54:30:12 against ground at 75. A face is not underexposed
    // there so much as it is the wrong substance. So the face fill is warm
    // ivory, sized to add about 0.79 to a camera-facing face — a third again on
    // top of the bounce — and nothing whatever to the turf. It reads as the
    // ground and the fire in front of the subject throwing light back up into
    // him, which at this hour is exactly what would be doing it.
    face: 0.95,
    faceColor: 0xd9bfa4,
    // Cool, and a shade bluer than the hemisphere's sky half. It is standing in
    // for the whole upper dome, which at dusk is the one large *cold* source in
    // the arena, and giving it its own hue is what stops a rig with three warm
    // terms in it turning every up-facing plane sepia.
    //
    // It is also, at 2.55, the second largest number in the rig, and that is the
    // point: it is the only large term a boot can block. 0.85 · 2.55 ·
    // cos(AO_TILT) ≈ 1.94 is what a contact now removes, against v8's 1.32 and
    // v7's 1.15 — and unlike either of those it is removed from ground the lens
    // can actually see, because the light has come off vertical far enough to
    // throw past its own caster.
    ao: 2.55,
    aoColor: 0x9db8d4,
    // 31 candela at decay 1.35 — see HEARTH_DECAY. Only a fifth up on v6's 26,
    // and deliberately so: the measured defect was never that the fire was dim,
    // it was that everything the fire spent landed on the side of a warrior the
    // lens cannot see. Pushing the candela to fix *that* only blows the hearth
    // stones, which at 1.75 m are already the hottest ground in the frame. What
    // the fifth is for is the rest of the ring — at 4.2 m, with the wider beam
    // under it, a warrior standing round the fire now takes about 4.4 linear
    // units off it against a whole-rig total near 10, which is the difference
    // between eight figures near a light source and eight figures near a decal.
    hearth: 31,
    hearthColor: 0xff7a2e,
    hearthRange: 22,
  },
  // The moot is burning: the moon is smothered, the fires take the arena over,
  // and what is left of the sky fill goes ember. The rim stays cool and only
  // dims — it is the last thing keeping a warrior off the background, and a last
  // stand that cannot be read is not dramatic, it is broken. The kick and the
  // hearth are the two that go up, because in this mood the fire *is* the key.
  //
  // Rebalanced on exactly the shape dusk is: the flat pair drained into `ao`,
  // the pair's elevations flattened, the key up enough to hold the exposure the
  // grade is tuned against. Its ground total lands within 1% of v7's and its
  // unblockable half comes down from 2.12 to 1.03, which is the whole change.
  lastStand: {
    ambient: 0.23,
    ambientColor: 0x8a6046,
    hemi: 0.155,
    hemiSky: 0xa87a54,
    hemiGround: 0x7d4526,
    key: 2.9,
    warm: 1.85,
    rim: 1.97,
    rimColor: 0x8fb0e0,
    kick: 2.3,
    kickColor: 0xff8a3c,
    bounce: 2.15,
    bounceColor: 0x8a6a48,
    // Hotter and a shade stronger than dusk's. This is the mood where a face is
    // most likely to be the only thing in frame worth reading, and where what is
    // in front of the subject throwing light back at him is a burning hall
    // rather than wet turf.
    face: 1.05,
    faceColor: 0xe8a878,
    // Ember rather than sky: in this mood the dome above the moot is lit by what
    // is burning under it, so the occlusion term stops being the cold half of
    // the frame. It also stays large, because this mood's ambient is the one
    // most at risk of reading as a flat orange wash — and an occluded fill is
    // the cheapest structure a wash can be given.
    ao: 1.9,
    aoColor: 0xc08a5e,
    hearth: 60,
    hearthColor: 0xff5a1a,
    hearthRange: 28,
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
   *
   * **`key` is the moon and `warm` is the sun**, and the names are a hazard
   * rather than a description: they were chosen when the caster was the moon,
   * which is the whole of the v8 blocker. `casterShare` decides which of the two
   * the shadows hang on, per frame, from the sun's own elevation. Renaming the
   * fields to `moon`/`sun` is a one-line change in GameCanvas.tsx and is the
   * cross-module edit this pass wants and did not make.
   */
  key?: THREE.Vector3;
  keyColor?: THREE.Color;
  warm?: THREE.Vector3;
  warmColor?: THREE.Color;
  /** The arena's main fire, as its radiant centre. Same thing `setHearth` sets. */
  hearth?: THREE.Vector3;
}

/**
 * How far up each light is hung along its direction. Only the angle matters for
 * the shading — but a shadow-casting light's distance is also the depth its
 * frustum is measured from, and it has to clear the whole cascade box at the
 * shallowest elevation the key is allowed to reach.
 *
 * The settlement cascade hangs a great deal higher than the near one for exactly
 * that reason and no other: its box is three and a half times wider, so a hut
 * standing at the far edge of it sits 48 m further along the light axis than the
 * box centre does, and at 42 m of hang that hut would be *behind* the shadow
 * camera and cast nothing at all. 66 m clears it with a twelve-metre tree on top.
 */
const KEY_DISTANCE = 42;
const FAR_KEY_DISTANCE = 66;
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
 * 9.2° for the low rake, down from v7's 17°, and it is down for two reasons
 * that happen to agree. Both bodies this can stand in for are low — the sun at
 * 2.4° and the moon at 11.5° (`DUSK_SUN`, `DUSK_MOON`) — so
 * 17° was never the honest number for it — and a shadowless light hung at 17°
 * mirrors off a puddle straight into an eye-height lens from about five metres
 * out, which is a blob no shadow map can touch (see RIM_ELEVATION for the
 * geometry). At 9.2° that moves to ten metres at a quarter of the rim's old
 * candela. Nothing else about it changes: it casts nothing, so it has no bias to
 * fight, and a low warm rake across the west side of everything vertical is what
 * the last of a sunset actually does.
 *
 * It does not go lower, and the floor is a hue one rather than a geometric one.
 * `aim` re-extincts the sky's colour for whatever elevation the rig moves a body
 * to, so dropping this term also reddens it: at 9.2° the warm fill's product
 * with `WARM_BASE` lands near 1 : 0.43 : 0.13, and by 6° it is at 1 : 0.38 :
 * 0.10 and closing on the 1 : 0.23 : 0.03 red floodlight that WARM_BASE exists
 * to have avoided. The model is behaving correctly; there is simply a point past
 * which an honest elevation costs more in colour than it returns in specular.
 */
const KEY_MIN_ELEVATION = 0.6;
const FILL_MIN_ELEVATION = 0.16;
/**
 * …and the ceilings, which exist because a body can now arrive from either
 * side of the number the rig wants.
 *
 * Until this pass both lights were pinned to one body each and both bodies were
 * lower than the elevation the rig hangs them at, so a floor was the whole of
 * the clamp. Now the caster follows whichever body dominates and the rake takes
 * the other, and at dusk the moon is at 11.5° while the rake wants 9.2° — so
 * without a ceiling, swapping bodies would move the rake's elevation as well as
 * its bearing, and `aim`'s re-extinction would then move its *colour*. The whole
 * claim this pass rests on is that the swap is geometric. The ceiling is what
 * makes that true: clamped down to 9.2° the moon re-extincts to (1, 0.398,
 * 0.072) against the sun's (1, 0.395, 0.071) at the same elevation, which is a
 * colour change of under a per cent on the largest hue in the rig.
 *
 * The key's ceiling is defensive rather than load-bearing — nothing in the dusk
 * sky reaches 46° — but `setTimeOfDay` can put a body overhead, and a key at 70°
 * is the noon top light the whole 37° argument above exists to have avoided.
 */
const KEY_MAX_ELEVATION = 0.72;
const FILL_MAX_ELEVATION = 0.16;

/**
 * Which body owns the shadows, as the sun's share of them, against the sun's
 * own elevation.
 *
 * This is astronomy and not a tuning knob. A sun anywhere near the horizon
 * out-illuminates a full moon by five orders of magnitude, and sky.ts's own
 * numbers say so at this hour — 22 units of sun against 0.1 of moon before
 * extinction, (5.45, 1.79, 0.11) against (0.067, 0.049, 0.023) after it. So the
 * only question the rig has to answer is whether the sun is up, and the honest
 * answer is a band rather than a line: between about −6° and −1° the sun is
 * setting, its own beam is nearly gone and the moon has not yet taken over.
 *
 * Blended rather than switched for one reason: a hard swap would spin every
 * shadow in the settlement 80° in a frame the first time anyone animates
 * `setTimeOfDay`. Inside the band the caster's axis is a mix of the two, which
 * is a bearing neither body is at — and that is the one interval where nobody
 * can check, because the sun is below the horizon and the moon is putting 0.05
 * linear units on the ground. Shadows are not readable there at all.
 */
const SUN_CASTS_BELOW = -0.1;
const SUN_CASTS_ABOVE = -0.015;

/**
 * The separation pair, as elevation and as bearing measured from straight behind
 * the subject.
 *
 * Both elevations are deliberately tiny. A directional light's contribution to
 * the turf is exactly its elevation (the ground normal is up, so N·L *is* sin of
 * the elevation) and its contribution to a silhouette edge is the flat component
 * times the sine of its bearing. At v2's 0.42 the rim gave the ground 42% of
 * itself while giving an edge 52% — barely a contrast win, and the reason the
 * rim never read. At v7's 0.13 the ground got 13% and the edge 60%.
 *
 * Both come down again here, and this is the flattest they can usefully go. The
 * flat component is `cos(elevation)`, so between 0.13 and 0.05 an edge loses
 * 0.7% of its light and the ground loses 62% of its fill; between 0.19 and 0.07
 * an edge loses 1.6% and the ground loses 63%. There is no trade being made —
 * v7 was simply paying for ground fill it did not want, twice, and paying for it
 * again in specular.
 *
 * The specular half is worth stating exactly, because it is a geometry problem
 * with a closed form rather than a tuning one. A puddle is a near-mirror, so it
 * returns a light at full strength wherever the light's elevation equals the
 * camera's view angle down onto it — for a lens at 1.6 m that is a ground
 * distance of `1.6 / tan(elevation)`. At the rim's 7.5° that is 12 m: the middle
 * of the arena, dead in frame, and screen-locked because the rim is
 * camera-relative. That is the "searchlight" both panels named, and it is why it
 * is the rim's colour. At 3° the match moves to 31 m, past the palisade and into
 * the haze; the kick's moves from 8 m to 23 m and the warm fill's from 5 m to
 * 10 m. The key still matches at about 2 m, which is under the lens in every
 * over-shoulder preset and is not a number worth spending the 37° on.
 *
 * `RIM_SWING` widens to hold the edge exactly. What lands on a silhouette is
 * `intensity · cos(elevation) · sin(swing)`, so widening the bearing is the
 * lever that lets the *level* come down — 3.02 at 0.90 puts 2.36 on an edge
 * where v8's 3.3 at 0.80 put 2.36 and v7's 3.9 at 0.66 put 2.37, and the 0.9 of
 * intensity that has come off across the two passes is 0.9 the wet ground no
 * longer mirrors. It still stops short of the kick's 0.92: the two swings differ
 * in magnitude as well as sign, which is what keeps the pair from reading as
 * symmetrical headlights, and there is no more room on that side.
 *
 * The third thing the level was costing, which is new and is the answer to
 * "does anything in this module widen the ground's variance": **it does, and
 * this pair is the largest term doing it.** A directional at 3° meets flat
 * ground at N·L = 0.05 and a normal-mapped micro-facet tilted 20° toward it at
 * N·L = 0.39 — eight times as much light on the crown of a rut as in the trough
 * beside it, at texel frequency, from one light. Summed over the rim, the kick
 * and the low rake, v8 put 0.45 of mean on the turf and up to 2.46 on a
 * 20° facet: a ±34% swing at the exact frequency of `buildGroundDetail`'s
 * relief, against a total ground irradiance near 5.95. Measured on the capture,
 * `v8/lineup.png`'s open floor runs σ/µ = 0.367 — and OPEN-DEFECTS attributes
 * that to albedo mottle in world.ts, which cannot be the whole of it.
 *
 * The arithmetic that makes this hard is worth recording so the next pass does
 * not spend itself on the wrong knob. *Raising* the elevation does not help:
 * the absolute modulation across a 20° facet is `I·sin(e+20°) − I·sin(e)`,
 * which is 0.34·I at e = 3° and 0.31·I at e = 17°, while the ground *mean*
 * quadruples. Only the level moves it, and the level is bounded below by the
 * silhouette. So 8% is what a free swap of swing for intensity buys; the rest
 * of that variance is the relief's own amplitude and belongs to world.ts.
 */
const RIM_ELEVATION = 0.05;
const RIM_SWING = 0.9;
const KICK_ELEVATION = 0.07;
const KICK_SWING = -0.92;

/**
 * Turf bounce: in front of the subject and *below* the horizon, kicked slightly
 * to the kick's side so it does not sit on the camera axis and read as a flash.
 * The negative elevation is the whole point — it is what makes this a fill that
 * cannot touch the ground it is bouncing off.
 */
const BOUNCE_ELEVATION = -0.4;
const BOUNCE_SWING = Math.PI - 0.42;

/**
 * The face fill: in front of the subject, level with a face, and a hair below
 * the horizon.
 *
 * The elevation is the whole design and it is doing two jobs at once. Negative,
 * so an up-facing ground normal clamps to zero and this light provably cannot
 * spend a unit of the contact darkening the rest of this pass is buying — the
 * same guarantee the bounce trades on, and the reason a fill aimed at faces is
 * safe to add while a shadow ratio is the blocker. And only *just* negative,
 * because what puts a face under a helm brow into shadow is the brow, which is
 * an overhang: a light level with the eye line walks straight in under it while
 * anything with real elevation is stopped by the same rim that stops the sky.
 *
 * −7.5° rather than 0° for the ground's sake and not the face's. At elevation
 * zero this light would still meet a micro-facet tilted 20° toward it at
 * N·L = 0.34 and add its own row to the variance ledger in `RIM_SWING`; at
 * −7.5° that falls to 0.22 and the face loses 0.9% of its light. The bounce is
 * at −23° and reaches the underside of a jaw; this is the shallower half of the
 * same idea and reaches the front of it.
 *
 * Swung to the opposite side of the camera axis from the bounce, so the two
 * front fills model a face between them rather than stacking into one flat
 * head-on lamp. 33° is enough that one cheek carries more than the other.
 *
 * It is not a point light at head height, which is what "face fill" usually
 * means and what this wanted to be. A punctual source hung 1.6 m up two metres
 * in front of a warrior meets the ground under him at N·L ≈ 0.6 and lays a
 * bright pool exactly where the boot's contact shadow has to read. A directional
 * cannot be height-selective, so the cost of the guarantee is that this lands on
 * every camera-facing vertical in the frame and not only on skin — about 0.79
 * linear units, against a hut wall already carrying the sky. That is the trade,
 * and the composition failure it answers is worth it.
 */
const FACE_ELEVATION = -0.13;
const FACE_SWING = -(Math.PI - 0.58);
const FACE_DISTANCE = 11;

// ---------------------------------------------------------------------------
// The hearth
// ---------------------------------------------------------------------------

/**
 * How far *below* the point the caller names the pool's centre sits.
 *
 * GameCanvas hands over world.ts's flame light, which is 1.8 m above the coals
 * — the right place for a light meant to read as a flame and the wrong place for
 * one meant to rim a man. A source above head height rakes down onto shoulders
 * and helmet crowns; the edge of a silhouette is lit by whatever is level with
 * it. Dropping to 1.25 m puts the pool at the coal bed, which is where a laid
 * fire's radiance actually comes from once the flame has stopped being the
 * brightest part of it, and puts it level with the chest of the man in front.
 */
const HEARTH_DROP = 0.55;

/**
 * The falloff exponent, and the single number that decides whether the bonfire
 * is a light or a decal.
 *
 * 1/d² is the law for a *point*. The bonfire is two metres across and a metre
 * and a half tall; at the ranges that matter — one to eight metres, which is the
 * whole of a brawl — it is a disc, and the near field of a disc falls off
 * nowhere near that fast. Under decay 2 the fire put 7.5 on a man at two metres
 * and 0.47 on one at eight, so a crowd of eight standing round it had exactly
 * one member who could tell it was burning. At 1.35 the same source puts 10.2
 * and 1.6, which is a fire the whole ring can feel, and the windowed cutoff at
 * `hearthRange` still takes it to nothing before it reaches the palisade.
 *
 * It is an approximation of an area source, not a physical law, and it is the
 * cheapest one available: three has no shadowing area light, and the honest
 * alternative — a disc of point lights — is eight more punctual terms per
 * fragment for a softness nobody will be able to name.
 */
const HEARTH_DECAY = 1.35;

/**
 * The shadow-casting beam, top tier only.
 *
 * The pool cannot cast: a point light in three is six cube faces, and six full
 * shadow passes for a light with a ring of stones round it is not a trade this
 * frame budget makes. But the shot the arena exists to produce is a warrior
 * between the lens and the flame, and that shot needs him to lay a shadow
 * *toward the viewer*. So one spot light rides the pool and is aimed down the
 * camera's own bearing every frame — the same camera-relative cheat the rim and
 * the kick already run on, and for the same reason: the only half of the fire's
 * surroundings the lens can see backlit is the half between it and the fire, so
 * that is the half that gets the map.
 *
 * The shares are the honest part. The beam does not replace the pool, it adds
 * to it, so a warrior standing in it removes `BEAM_SHARE / (POOL_SHARE +
 * BEAM_SHARE)` of the fire's light rather than all of it — 58% now, up from v6's
 * 44% and v8's even half. That is the most a rig without a cube map can take
 * away, and the reason it went up is the contact blocker rather than the fire:
 * the pool is a point light with no shadow map, it is 31 candela at decay 1.35,
 * and in `lineup` it stands three metres behind four warriors putting something
 * like 3.4 unblockable linear units on the very ground their boots are supposed
 * to be darkening. It is the largest single unshadowable term anywhere near a
 * contact edge in this rig, and shifting energy from it into the beam is the
 * only lever on that a rig with one hearth shadow has.
 *
 * The two shares sum to 1.46 rather than to 1, and deliberately: the total the
 * mood asks for is what a warrior *outside* the beam receives, so the sum is
 * held across the change (1.44 → 1.46, 1.4%) while the shadowable fraction
 * moves. What the shift costs is the far side of the fire, which the cone never
 * reaches, going 14% dimmer — that is the side of a bonfire facing away from the
 * camera, and it is the cheapest 14% in the frame.
 */
const BEAM_ANGLE = 1.02;
/**
 * How far *above* the named radiant centre the casting beam hangs — and the
 * reason `brawl` had eight warriors round a blaze and not one fire shadow.
 *
 * v6 and v7 rode the beam on the pool, at the coal bed 1.25 m up. A shadow is a
 * projection from the source through the caster onto the receiver, so a source
 * at 1.25 m projects everything on a 1.8 m warrior *above* 1.25 m up into the
 * air and never onto the ground at all. Only his shins cast, from a source
 * raking at 8°, into a shadow tens of metres long and correspondingly faint.
 * That is not a weak fire shadow, it is the absence of one, and it could not
 * have been fixed with candela or with beam share — both passes that tried.
 *
 * So the two halves of the fire split their jobs properly. The pool stays at
 * `HEARTH_DROP` because what rims a man is the bed of coals level with his
 * chest, and that argument is unchanged. The beam climbs to the top of the
 * flame column — 3.35 m over the coals, which is where a laid bonfire's tallest
 * tongues actually are — because that is the only place in the fire from which a
 * standing man has a shadow. From there a warrior on `brawl`'s 4.2 m ring throws
 * about 4.9 m of shadow radially outward, which for the ones between the lens
 * and the fire runs straight at the viewer. Long, because the source is low;
 * long radial shadows off a blaze is what a blaze looks like.
 */
const BEAM_RISE = 1.55;
/**
 * Penumbra 0.88 rather than v6's 1.
 *
 * At penumbra 1 three sets the inner cone to zero width, so the falloff runs
 * from the axis all the way to the rim: a warrior 45° off the camera's bearing
 * kept 22% of the beam. In `brawl` the ring stands at 45° intervals round the
 * fire, so six of the eight were effectively outside the only fire shadow the
 * frame has. At 0.88 the same warrior keeps 34% and the ones at 30° keep 82%,
 * and the cone edge is still eight degrees of smoothstep — nowhere near hard
 * enough to draw the ellipse on the ground that penumbra 1 was avoiding.
 */
const BEAM_PENUMBRA = 0.88;
const BEAM_SHARE = 0.84;
const POOL_SHARE_WITH_BEAM = 0.62;
/**
 * How far in front of the fire the beam looks, and how far it drops over that
 * run — together, the rake of its axis, which `BEAM_RISE` has just made a real
 * number rather than a nudge. 3.0 over 8 is 20.6° down, so the axis meets the
 * ground at 8.9 m and the ring at 4.2 m sits 18° off it, inside the cone's
 * plateau. v7's 1.4 over 10 was 8°, which from the coal bed pointed the beam
 * along the ground rather than onto it.
 */
const BEAM_THROW = 8;
const BEAM_DIP = 3.0;
/**
 * The beam's depth bias, in metres at the range the fight is actually at.
 *
 * Stated in metres for the same reason the cascades' are, and more urgently: a
 * perspective shadow camera's normalised depth is 1/z, so a constant bias means
 * wildly different distances at different ranges. v7's flat -0.0022 against a
 * 0.4/22 frustum was 3 cm of push at two metres and 34 cm at eight — the far
 * half of any fire shadow detached from its caster entirely. Converted at the
 * ring radius it is one number that behaves across the whole ring.
 */
const BEAM_BIAS_METRES = 0.03;
const BEAM_REF_DISTANCE = 5.4;

/**
 * Fire-steered kick: how far out the fire is allowed to take over the warm half
 * of the separation pair, what it is worth when it does, and where it hangs.
 *
 * 9.5 m, not v6's 6.5. The reach is a statement about where the fire is the
 * thing the shot is *about*, and in `brawl` — the preset this blocker was
 * written against — that is a ring at 4.2 m round the coals with the local
 * warrior at 4.5. Under 6.5 m with a raw smoothstep on top, that ring returned
 * 0.23; at 9.5 m with the curve in `fireSteer` it returns 0.73, and a warrior
 * two metres off the coals returns 0.94. `duel` and `closeup` sit 8.5–9.2 m out
 * and still return under 0.1, which is right: at that range the fire is a lamp
 * in the background and a warm rim off it would be a lie.
 *
 * The gain is up to match, and it is still deliberately short of the pool's own
 * ratio: the kick's job is the *edge*, and an edge that outruns the surface
 * behind it stops reading as a rim and starts reading as a white line.
 *
 * `FIRE_ELEVATION` is where the steered kick settles. The authored kick sits at
 * 0.19 because that is a plausible height for the last of a western sky; a bed
 * of coals is at knee height, so as the fire takes the light over it also brings
 * it down, and the rake on a warrior's flank tips from very slightly downward to
 * very slightly upward. That tip is most of what makes a fire rim look like fire
 * rather than like a warm lamp.
 */
const HEARTH_RIM_REACH = 9.5;
const HEARTH_RIM_GAIN = 3.4;
const FIRE_ELEVATION = 0.03;

// ---------------------------------------------------------------------------
// The cascades
// ---------------------------------------------------------------------------

/**
 * The near cascade. `settings.shadowDistance` is a *ceiling* on the extent, not
 * the extent, because what decides the extent is whichever number keeps a shadow
 * texel small enough to resolve a warrior.
 *
 * 1.5 cm now, down again from v5's 1.8 and v4's 2.0. The near cascade has got
 * *smaller* on each of the last three passes, which looks backwards next to a
 * blocker about things not casting shadows and is the direct consequence of it:
 * with a settlement cascade carrying the reach, the near one is free to stop
 * compromising and be sized for the one thing only it can do. That one thing is
 * contact. `normalBias` — the offset that actually keeps a surface from
 * shadowing itself — scales with texel size, and a normal offset at a 37° key
 * detaches a cast shadow from its caster by 1.33 times itself. v4's 20.5 m box
 * wanted 5 cm of offset and put a 6.6 cm gap between a boot and its own shadow,
 * which is two thirds of a boot and is exactly the "figures sitting on the turf
 * rather than in it" the panel measured. 18.4 m wanted 2.9 cm and left 3.8 cm.
 * 15.4 m wants 2.4 cm and leaves 3.2 cm.
 *
 * Diminishing, and it is the *wrong lever* — which is worth saying plainly here
 * because it is where three passes of tuning have gone. The detachment is
 * `normalBias / tan(elevation)`, and the elevation belongs to the key, so no
 * amount of shrinking this box will ever close the gap: it can only halve it
 * again. The term that actually closes it is `AO_TILT` below, whose elevation is
 * chosen so that the division is by four rather than by three quarters.
 *
 * The floor is what a brawl needs — eight warriors and the ground they are
 * standing on, either side of the focus. The ring is 4.2 m and the focus stands
 * 4.5 m off centre, so 11 m of half-extent covers it with a metre to spare.
 */
const SHADOW_TARGET_TEXEL = 0.015;
const SHADOW_MIN_HALF = 11;

/**
 * The settlement cascade: half-extent, and the texel budget that decides which
 * tiers can have one.
 *
 * 52 m is not a tuning number, it is world.ts's settlement — the huts stand at
 * 27–52 m and the palisade ring at 19.6 m, and a box pinned to the arena origin
 * at 52 m holds all of it plus the woodpiles, the torch ring and the runestone
 * for every frame of every match, because the sim keeps every warrior inside a
 * 21.5 m bound and the settlement does not move.
 *
 * 5 cm of texel is what a palisade stake needs. A stake is 16 cm across, so at
 * 5 cm it is three texels wide and its shadow is a stripe; at 10 cm it is one
 * and the ring becomes a solid band; at 20 cm the *warriors* inside the same
 * cascade turn into blocks, and a blocky half-strength blob under a man is worse
 * than no second cascade at all. So the extent is clamped to what the tier's map
 * can hold at 5 cm, and a tier whose settlement box would not end up meaningfully
 * wider than its near box does not get one:
 *
 *   high   2048²  →  51.2 m — the whole settlement
 *   medium 1024²  →  25.6 m — the palisade ring, the woodpiles, the torches
 *   low     512²  →  12.8 m, no wider than its near box, so: none
 *
 * That is the tier ladder working the way quality.ts means it to. Low drops the
 * settlement's shadows the way it drops bloom, and keeps a single full-strength
 * cascade on the fight rather than half of two coarse ones.
 */
const SETTLEMENT_HALF = 52;
const SETTLEMENT_TARGET_TEXEL = 0.05;
/** Below this multiple of the near box, a second cascade is not paying for itself. */
const SETTLEMENT_MIN_RATIO = 1.4;

// ---------------------------------------------------------------------------
// Sky occlusion — the contact term
// ---------------------------------------------------------------------------

/**
 * How far the sky-occlusion light leans off vertical, in radians, and the reason
 * this whole light exists.
 *
 * A cast shadow separates from its caster by `normalBias / tan(elevation)`,
 * because the normal offset moves the receiver up out of the shadow and the
 * light's slant converts that rise into a sideways slip. Every shaping light in
 * this rig sits low on purpose — the key at 37°, the pair under 12° — which is
 * exactly the elevation band where that division is by a number smaller than
 * one, so every one of them *magnifies* its bias into a visible gap. There is no
 * bias small enough to fix that; the failure is in the tangent.
 *
 * A light at 76° divides by 4.0. At the half-extent below that is 1.0 cm of slip
 * on a 2.5 cm texel — under a boot sole, under the eye's ability to call it a
 * gap. So the rig's flat fill is given a direction it can be blocked from, and
 * the direction chosen is the one where blocking lands *where the blocker is*.
 * That is what turns a shadow map into an ambient occlusion term, and it is why
 * this light is high rather than low.
 *
 * **14° was too high, and that is the second half of the v8 no-contact blocker.**
 * The argument above optimises attachment and stops there, and attachment is
 * only half of what a contact shadow has to be — it also has to be *visible*. A
 * light at 14° off vertical throws its darkening 0.25 × the caster's height,
 * which for a boot is 2.5 cm and for a standing warrior is 44 cm, and it throws
 * all of it into the footprint of the thing casting it. From a gameplay camera
 * at eye height looking down at fifteen degrees, that ground is behind the boot
 * that made it. Measured in `v8/lineup.png`, the turf at the huscarl's toe reads
 * luma 82.3 against an open-floor mean of 62.1: the only shadow near the boot
 * was under the boot, and what the lens got instead was the near cascade's
 * 3.2 cm normalBias slip, which is a *bright* halo of exactly the size of the
 * thing everyone was looking for.
 *
 * 26° throws 0.50 × height — half a metre of body-shaped darkening starting at
 * the sole and running out onto the camera side of it, over the top of the key's
 * slip — and costs 1.4 cm of slip against 0.6, still well under a sole. The
 * ground gain falls from cos 14° to cos 26°, 3% of the term, paid back in the
 * level. It has not become a second key: it leans along the caster's own azimuth
 * so the two shadows agree in direction and differ only in length, which is what
 * a broad sky occlusion wrapped round a hard sun shadow looks like.
 *
 * It is also not *vertical*, for a duller reason that has not changed: three
 * aims a shadow camera with `Object3D.lookAt`, whose basis degenerates when the
 * view axis is parallel to the world up.
 */
const AO_TILT = 0.46;
const AO_DISTANCE = 46;

/**
 * The occlusion box, and the tier ladder that follows from its texel budget.
 *
 * 2.5 cm is sized on a palisade stake's footing and a boot sole, the two
 * junctions the panel named. It is coarser than the near cascade's 1.5 cm and
 * that is affordable here precisely because this light does not have to be
 * *accurate* — a contact darkening carries about a fifth of the local
 * irradiance, so a texel of error costs a fifth of what the same error costs the
 * key. What it has to be is *attached*, and the tilt is what buys that.
 *
 *   high   2048²  →  25.6 m — the arena floor and the whole palisade ring
 *   medium 1024²  →  12.8 m — the fight and the ground under it
 *   low     512²  →   6.4 m, under the floor, so: none
 *
 * Pinned to the arena origin like the settlement cascade and for the same two
 * reasons: the sim keeps every warrior inside a 21.5 m bound, and a map that
 * never re-centres is a map that provably cannot crawl. Crawl matters more here
 * than anywhere else in the rig, because this is the one shadow that sits
 * directly under a moving warrior's feet where the eye is already looking.
 */
const AO_HALF_MAX = 25.6;
const AO_TARGET_TEXEL = 0.025;
const AO_MIN_HALF = 9;
const AO_BIAS_METRES = 0.022;
const AO_NORMAL_BIAS_CAP = 0.03;
/**
 * A normal offset is sized against the depth slope the light sees across one
 * texel, and that slope is a function of the light's own elevation — so the
 * 1.6 the two cascades share, which is sized for a 37° key raking the ground, is
 * simply the wrong coefficient for a light at 64°. At 1.15 this cascade takes
 * 2.9 cm of offset instead of 4.0 and turns it into 1.4 cm of slip. Under a boot
 * sole that is the difference between a contact edge and a contact edge with a
 * hairline of daylight under it, and acne is not the countervailing risk it
 * would be on the key: a steep light on near-horizontal ground has little slope
 * to fight. Up from 1.0 with `AO_TILT`, and by less than the tilt moved — the
 * slope this has to cover grew, the margin for it did not.
 */
const AO_NORMAL_BIAS_SLOPE = 1.15;
/**
 * How much of the sky-occlusion light a blocked point still receives — or
 * rather, how much of it is taken away, since three states this as the shadow's
 * own strength.
 *
 * Every other shadow in this rig is a visibility test against a source small
 * enough that the test is honest: the moon is a disc, the beam is a cone, and a
 * point either sees them or does not. The sky is not that. It is a hemisphere,
 * and a face under a helm rim, a boot beside a stake, a wall under an eave all
 * still see a large fraction of it — a binary test against a dome is the one
 * place in this module where the shadow map is modelling the wrong thing.
 *
 * v7 ran it binary and `lineup` scored the result: four faces as black ovals
 * under their helm brows, which OPEN-DEFECTS traced correctly to this light and
 * then had nowhere to go, because backing the light out would have taken the
 * contact term with it. v8's 0.62 bought the faces out of that trade by handing
 * 38% of the term back everywhere, and the bill for it arrived as the contact
 * blocker: 1.32 removed under a boot against a ground carrying 5.95, which is a
 * 22% darkening on a surface whose own measured σ/µ is 0.367. A shadow below the
 * noise of what it falls on is not a soft shadow.
 *
 * 0.85 now, because the trade is gone rather than because it was judged wrong.
 * `faceFill` lifts a face by 0.79 with a light that a boot's shadow does not
 * pass through, so the occlusion term is free to go back to nearly binary and
 * spend all of it on the junction it was built for — 1.94 removed at a contact
 * against v8's 1.32, and thrown where the lens can see it by the new `AO_TILT`.
 * Nothing here darkens a face: this light leans 26° along the caster's azimuth,
 * both bodies sit behind the subject in every preset, and a camera-facing
 * vertical therefore takes N·L ≤ 0 from it and always did.
 *
 * Not 1.0, and the residual is the honest part rather than a hedge. A shadow map
 * is a binary visibility test and the sky is a hemisphere: a wall under an eave
 * and a boot beside a stake both still collect a real fraction of the dome. 0.85
 * says a fully sky-blocked point keeps about a seventh of it by bounce and by
 * the parts of the sky the single sampled direction is standing in for.
 */
const AO_SHADOW_INTENSITY = 0.85;
/**
 * Where the occlusion term's energy goes on a tier that cannot afford its
 * cascade: back into the two flat fills it was taken out of. A low-tier frame
 * loses the contact darkening — which is a dropped *effect* — and keeps its
 * exposure, which is art direction.
 *
 * Almost all of it goes to the hemisphere now rather than 60/40 to ambient,
 * because the two are not interchangeable and this light is strongly
 * ground-biased: at 64° it puts 0.90 of itself on an up-facing normal and 0.44
 * on a vertical, a ratio of 2.0, while ambient's is 1.0 and the hemisphere's is
 * 2.0. The two coefficients sum to the ground gain the cascade would have had,
 * so the ground — which is where the term's energy actually lives and where the
 * exposure is judged — comes back exact. They came down with `AO_TILT`: a
 * shallower occlusion light spends less of itself on the turf, so a fold that
 * did not follow it would brighten every tier below high.
 */
const AO_FOLD_AMBIENT = 0.11;
const AO_FOLD_HEMI = 0.786;

/**
 * How the key's energy divides between the two cascades.
 *
 * The two lights are one moon: same axis, same colour, intensities summing to
 * `rig.key`, so the diffuse and the specular lobe are bit-for-bit what a single
 * light of that intensity produced. Only the shadowing differs, and it differs
 * in the one way three's shadow model allows — additively. A point the near
 * cascade shadows loses 0.58 of the key; a point the settlement cascade shadows
 * loses 0.42; a point both agree on loses all of it.
 *
 * Everything about the split follows from that. It is near-dominant because the
 * near cascade is the only one that can resolve a boot, and it is not *much*
 * near-dominant because a palisade footing at twenty-five metres is only ever
 * inside the far box, and a footing that darkens by a tenth is the defect this
 * pass exists to fix. 58/42 gives the wall 42% of the key removed at its foot,
 * which at dusk is about a fifth of the total irradiance on that turf — a shadow
 * a viewer reads as a shadow.
 *
 * The one place the two disagree is at the edge of a warrior's own shadow, where
 * the far cascade's coarser texel and fatter offset put a soft, offset, 42%
 * version of the same silhouette around the near cascade's crisp one. That is
 * not an artefact to be minimised. It is a wide soft penumbra wrapped round a
 * hard core, which is what contact hardening looks like and is the closest this
 * renderer gets to it without a screen-space pass.
 */
const NEAR_SHARE = 0.58;

/**
 * Depth bias expressed in metres and converted, because a bias in normalised
 * depth means nothing until you know the frustum it is normalised against, and
 * this module changes that frustum per cascade as well as per tier.
 */
const SHADOW_BIAS_METRES = 0.013;
const SETTLEMENT_BIAS_METRES = 0.05;
/**
 * normalBias is the offset that does the real work — measured along the surface
 * normal, in world units, so it scales with texel size rather than with the
 * tier's name.
 *
 * The caps say what each cascade is for. The near one is holding the contact
 * edge, so it is capped where a gap stops being readable as a gap; the low
 * tier's 512² map over an 11 m box wants 6.9 cm to stay clear of acne and gets
 * 4.5, and eats some acne on the one tier whose shadows are hard and coarse
 * anyway. The settlement cascade is holding a hut, so it is capped at twice
 * that: 9 cm of offset detaches a wall's shadow by 12 cm, which nobody reads at
 * twenty-five metres, and the near cascade is holding the contact anywhere close
 * enough for 12 cm to matter.
 *
 * The occlusion cascade's cap is loose by comparison — 5 cm on a 2.5 cm texel —
 * and it can be, because its detachment is divided by four rather than
 * multiplied by 1.33. Its 4 cm of offset buys 1 cm of slip, which is the whole
 * argument for the light.
 */
const SHADOW_NORMAL_BIAS_SLOPE = 1.6;
const SHADOW_NORMAL_BIAS_CAP = 0.045;
/**
 * 0.07, down from 0.09, and the reason is the *warrior* rather than the hut.
 *
 * A warrior stands inside both cascades — the settlement box is 51 m at the
 * arena origin and the sim keeps everyone inside 21.5 m — so the far map holds a
 * coarse second copy of his silhouette, and how much of the key he actually
 * removes depends on whether that copy lands on the near map's or beside it. At
 * 0.09 it detached by 12 cm, which on a 25 cm leg is a fringe rather than a
 * reinforcement; at 0.07 it is 9 cm and the two overlap. The hut this cap was
 * written for does not notice the difference at twenty-five metres, and the
 * depth bias below is carrying most of the acne margin anyway.
 */
const SETTLEMENT_NORMAL_BIAS_CAP = 0.07;

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
  //
  // It is the base for the *rake*, which is now whichever body is not casting,
  // and it stays warm for either of them: a body at 9.2° has crossed six air
  // masses whether it is a sun or a moon, and the two come out within a per cent
  // of each other once `FILL_MAX_ELEVATION` has put them at the same height.
  const WARM_BASE = new THREE.Color(0xffc98f);

  // ---- cascade geometry, decided once ----
  const nearHalf = Math.min(
    settings.shadowDistance,
    Math.max(SHADOW_MIN_HALF, settings.shadowMapSize * SHADOW_TARGET_TEXEL * 0.5),
  );
  const wantFarHalf = Math.min(
    SETTLEMENT_HALF,
    settings.shadowMapSize * SETTLEMENT_TARGET_TEXEL * 0.5,
  );
  const farHalf = wantFarHalf >= nearHalf * SETTLEMENT_MIN_RATIO ? wantFarHalf : 0;
  const hasFar = settings.shadows && farHalf > 0;
  /** The near cascade's share of the moon. All of it when it is the only one. */
  const nearShare = hasFar ? NEAR_SHARE : 1;

  const aoHalf = Math.min(AO_HALF_MAX, settings.shadowMapSize * AO_TARGET_TEXEL * 0.5);
  const hasAo = settings.shadows && aoHalf >= AO_MIN_HALF;

  /**
   * Sets up one cascade's orthographic frustum, its depth range and its two
   * biases, and hands back the world size of one of its texels — which is the
   * only sane unit for the texel snap in `trackShadow`.
   *
   * near/far are along the light axis, and the box's *lateral* extent projects
   * back onto that axis whenever the axis is not vertical: at the 37° floor a
   * point on the box edge sits up to half/sin(37°) ≈ 1.66·half along the ground,
   * which is 1.33·half of axial offset. Hence the 1.4 coefficient, with room for
   * a tree on top.
   */
  function frame(
    light: THREE.DirectionalLight,
    half: number,
    hang: number,
    biasMetres: number,
    normalBiasCap: number,
    normalBiasSlope: number = SHADOW_NORMAL_BIAS_SLOPE,
  ): number {
    light.castShadow = true;
    light.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
    const cam = light.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 1;
    cam.far = hang + half * 1.4 + 14;
    cam.updateProjectionMatrix();
    const texel = (2 * half) / Math.max(1, settings.shadowMapSize);
    light.shadow.bias = -(biasMetres / (cam.far - cam.near));
    light.shadow.normalBias = Math.min(texel * normalBiasSlope, normalBiasCap);
    return texel;
  }

  // ---- the key: the near cascade, and every contact edge in the frame ----
  const key = new THREE.DirectionalLight(KEY_BASE.getHex(), rig.key * nearShare);
  key.position.set(12, 26, 9);
  key.target.position.set(0, 0, 0);
  root.add(key.target);
  key.castShadow = settings.shadows;
  const texel = frame(key, nearHalf, KEY_DISTANCE, SHADOW_BIAS_METRES, SHADOW_NORMAL_BIAS_CAP);
  key.castShadow = settings.shadows;
  root.add(key);

  // ---- the key again: the settlement cascade ----
  //
  // Pinned to the arena origin rather than tracked to the focus, on purpose.
  // The settlement is static and centred there, and the sim keeps every warrior
  // inside a 21.5 m bound, so a box this wide at the origin covers the moot for
  // every frame there will ever be. A cascade that never re-centres also never
  // re-rasterises against a moving grid, so the one shadow map in the frame with
  // 5 cm texels is also the one that provably cannot crawl — which matters,
  // because crawl at that texel size is a centimetre of stake edge flickering
  // across a whole wall.
  const keyFar = hasFar
    ? new THREE.DirectionalLight(KEY_BASE.getHex(), rig.key * (1 - nearShare))
    : null;
  if (keyFar) {
    keyFar.target.position.set(0, 0, 0);
    root.add(keyFar.target);
    frame(keyFar, farHalf, FAR_KEY_DISTANCE, SETTLEMENT_BIAS_METRES, SETTLEMENT_NORMAL_BIAS_CAP);
    root.add(keyFar);
  }

  // ---- sky occlusion: the contact term ----
  //
  // The rig's ambient occlusion, and it is a light rather than a post pass
  // because it is one: the sky is a source, it is the largest one in the frame
  // by solid angle, and the only reason it has been an unshadowed constant until
  // now is that a constant is cheaper than a dome. Giving it a single
  // near-vertical direction is the crudest possible convolution of that dome —
  // but crude in the one dimension nobody can check (its bearing) and exact in
  // the one everybody can (whether a boot is standing on something).
  //
  // It reaches every junction the panel named, and it reaches them for the same
  // reason rather than four different ones. Boot to ground and stake to ground
  // are the caster sitting on its own shadow. Wall to roof is the eave taking
  // the sky off the timber under it, which is the only reason an eave reads as
  // an overhang at all. A shoulder onto a chest, a shield boss onto a forearm, a
  // cloak onto the back of a leg — all the same shadow map, all of it small
  // scale, because at 14° off vertical nothing throws far.
  //
  // It is also, incidentally, the highlight structure `portrait` and `stance`
  // have been failing the tonal floor on: a near-vertical source is the only one
  // in the rig that puts a crown on a helm and a top on a shoulder.
  //
  // It is a third depth pass, which on the phone tier is the thing to be careful
  // about, and it is the cheapest of the three because its box is the smallest:
  // 25.6 m on high culls the outer huts and the far treeline that the settlement
  // cascade has to rasterise, and 12.8 m on medium culls the palisade too and
  // leaves it drawing the fight and the ground under it. A pass whose frustum is
  // a quarter of another pass's is not a third of the shadow budget.
  const ao = new THREE.DirectionalLight(rig.aoColor, hasAo ? rig.ao : 0);
  ao.target.position.set(0, 0, 0);
  root.add(ao.target);
  if (hasAo) {
    frame(ao, aoHalf, AO_DISTANCE, AO_BIAS_METRES, AO_NORMAL_BIAS_CAP, AO_NORMAL_BIAS_SLOPE);
    // The one shadow in the rig that is standing in for a source too large for a
    // visibility test to be honest about. See AO_SHADOW_INTENSITY.
    ao.shadow.intensity = AO_SHADOW_INTENSITY;
  }
  ao.castShadow = hasAo;
  root.add(ao);

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
  // the punctual loop is per-fragment and this rig already runs it a dozen-odd
  // times on high. Medium is the phone tier; it gets the directionals that carry
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

  // ---- the face fill ----
  //
  // Every tier gets this one, including the phone. The rig's rule for a tier
  // drop is that it loses *effects* and keeps art direction, and being able to
  // see a warrior's face on the class-select screen is not an effect — it is the
  // screen. The kick is dropped below high because a second silhouette edge is a
  // refinement of a read that still works with one; a face lit only by olive
  // turf bounce does not work at all.
  const faceFill = new THREE.DirectionalLight(rig.faceColor, rig.face);
  faceFill.position.set(0, -1, -11);
  faceFill.target.position.set(0, 0, 0);
  root.add(faceFill.target);
  root.add(faceFill);

  // ---- the hearth pool ----
  //
  // world.ts owns the bonfire's flame light and should: it is the flicker source
  // and it has to follow the prop. What it cannot be is the *pool*, because it
  // is modelled as a point at the flame and a bonfire two metres across is an
  // area source whose near field is far gentler and far wider than a point of
  // the same total power.
  //
  // So the rig carries the pool: a softened falloff with a windowed cutoff,
  // graded by mood with the rest of the rig, breathing on a slower beat than
  // world's flicker because a bed of coals does not flutter like a tongue of
  // flame.
  const beamShare = settings.tier === "high" && settings.shadows ? BEAM_SHARE : 0;
  const poolShare = beamShare > 0 ? POOL_SHARE_WITH_BEAM : 1;

  const hearth = new THREE.PointLight(
    rig.hearthColor, rig.hearth * poolShare, rig.hearthRange, HEARTH_DECAY,
  );
  const hearthAt = (opts.hearth ?? new THREE.Vector3(0, HEARTH_DROP, 0)).clone();
  hearth.position.set(hearthAt.x, hearthAt.y - HEARTH_DROP, hearthAt.z);
  root.add(hearth);

  // The half of the fire the lens can see backlit, and the only fire shadow in
  // the arena. Wide and soft-edged so nobody can tell it is there except by the
  // shadows it lays — with a hard-edged cone the ground in front of the fire
  // would grow a visible ellipse.
  const beam = beamShare > 0
    ? new THREE.SpotLight(
      rig.hearthColor, rig.hearth * beamShare, rig.hearthRange,
      BEAM_ANGLE, BEAM_PENUMBRA, HEARTH_DECAY,
    )
    : null;
  if (beam) {
    // Above the pool, not on it — the whole of BEAM_RISE.
    beam.position.set(hearthAt.x, hearthAt.y + BEAM_RISE, hearthAt.z);
    beam.castShadow = true;
    // Half the near cascade's resolution and a far better texel than it, because
    // a 117° perspective frustum whose far plane is the pool's own reach is
    // covering 17 m of ground at the ring radius — under two centimetres per
    // texel where the warriors stand.
    const beamMap = Math.max(512, Math.min(1024, settings.shadowMapSize));
    beam.shadow.mapSize.set(beamMap, beamMap);
    beam.shadow.camera.near = 0.4;
    // Written by applyRig, because the far plane it is normalised against is
    // `light.distance`, and that is a mood value.
    beam.shadow.normalBias = 0.02;
    root.add(beam.target);
    root.add(beam);
  }

  /**
   * The beam's depth bias in normalised units, from its metre value.
   *
   * A perspective depth buffer stores `far·(1 - near/z) / (far - near)`, so a
   * metre at the range that matters is `far·near / ((far - near)·z²)` of it.
   * three overwrites the shadow camera's far plane with `light.distance` on
   * every update, which the mood blends, so this is re-derived rather than
   * baked.
   */
  function beamBias(range: number): number {
    const near = 0.4;
    const far = Math.max(range, near + 1);
    return -(BEAM_BIAS_METRES * far * near) / ((far - near) * BEAM_REF_DISTANCE * BEAM_REF_DISTANCE);
  }

  scene.add(root);

  const scratch = new THREE.Vector3();
  const relDir = new THREE.Vector3();
  /** The key's aimed direction, kept apart from key.position because the shadow
   *  tracking moves the light off the origin and the axis must survive that. */
  const keyAxis = new THREE.Vector3(12, 26, 9).normalize();
  const aoAxis = new THREE.Vector3(0, 1, 0);
  const lightRight = new THREE.Vector3();
  const lightUp = new THREE.Vector3();
  const snapped = new THREE.Vector3();
  const hue = new THREE.Color();
  const moodHue = new THREE.Color();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  // The fire-steer's scratch: subject→fire on the ground, the camera's bearing,
  // and the horizontal frame the separation pair hangs its swings off.
  const fireVec = new THREE.Vector3();
  const viewVec = new THREE.Vector3();
  const camBehind = new THREE.Vector3();
  const behind = new THREE.Vector3();
  const beamAim = new THREE.Vector3();
  // The two bodies after `casterShare` has decided which of them the shadows
  // hang on. Held rather than allocated: `reaim` runs every frame.
  const casterDir = new THREE.Vector3();
  const rakeDir = new THREE.Vector3();
  const casterHue = new THREE.Color();
  const rakeHue = new THREE.Color();
  /**
   * The mood's own colours for the two steerable lights, kept apart from the
   * lights themselves. `update` rewrites `rim.color` and `kick.color` every
   * frame from these plus the fire steer, so reading a light back to find out
   * what mood it is in would compound the steer on every mood change.
   */
  const rimMood = new THREE.Color(rig.rimColor);
  const kickMood = new THREE.Color(rig.kickColor);

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
    maxElevation: number,
    axis?: THREE.Vector3,
  ): void {
    // Clamped into a band rather than merely lifted off a floor, because the two
    // lights can now swap bodies and the rig's claim is that the swap moves a
    // bearing and not a colour. A ceiling is what holds the second half of that.
    const held = dir ? THREE.MathUtils.clamp(dir.y, minElevation, maxElevation) : 0;

    // Without a sky vector there is nothing to re-aim to; the hand-placed
    // direction the light was built with stands, and so does whatever axis the
    // caller is already holding.
    if (dir) {
      scratch.copy(dir);
      if (held !== scratch.y) {
        const az = Math.hypot(scratch.x, scratch.z) || 1;
        const want = Math.sqrt(Math.max(0, 1 - held * held));
        scratch.set((scratch.x / az) * want, held, (scratch.z / az) * want);
      }
      light.position.copy(scratch).multiplyScalar(distance);
      axis?.copy(scratch);
    }

    if (!color) return;
    const peak = Math.max(color.r, color.g, color.b);
    if (peak <= 1e-4) return;
    // Re-extincts for the elevation the light is actually at, in whichever
    // direction it was moved: a body lifted off the floor loses extinction, a
    // body pulled down under the ceiling gains it, and a body already inside the
    // band keeps its colour exactly as the sky measured it.
    const thin = dir && held !== dir.y
      ? airMass(held) / Math.max(airMass(dir.y), 1e-4)
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
   * Hangs the near shadow frustum on the point of interest instead of the arena
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

    // The settlement cascade only ever re-hangs because the moon moved. Its
    // target is the arena origin and stays there; all that changes is the axis
    // it is viewed down.
    if (keyFar) keyFar.position.copy(keyAxis).multiplyScalar(FAR_KEY_DISTANCE);
  }

  /**
   * The horizontal direction the separation pair measures its swings from: from
   * the subject, straight away from the camera. Written into `camBehind`.
   */
  function readBehind(camera: THREE.PerspectiveCamera, focus: THREE.Vector3): void {
    camBehind.subVectors(camera.position, focus);
    camBehind.y = 0;
    if (camBehind.lengthSq() < 1e-6) camBehind.set(0, 0, 1);
    camBehind.normalize().negate();
  }

  /**
   * Hangs a light at a bearing measured from a given "behind" direction and an
   * elevation. `swing` of 0 is straight down that direction, ±π/2 is beside the
   * subject, ±π is between it and the camera — which is where the bounce lives.
   * Elevation may be negative; nothing placed this way casts a shadow, so a
   * light below the ground plane is a legitimate place for a bounce to come
   * from.
   *
   * Taking the frame as an argument rather than deriving it from the camera is
   * the whole of the fire-rim fix. v6 steered the kick by lerping its *hang
   * point* onto the fire's bearing, which quietly cancelled the swing — and the
   * swing is the entire mechanism. A silhouette edge is where the normal is
   * perpendicular to the view, so a light on the view axis meets it at N·L ≈ 0
   * and lights nothing the lens can see, however bright it is. Steering the
   * frame and re-applying the swing on top puts the fire's light where the fire
   * would put it if it were a metre wider than the man in front of it, which it
   * is.
   */
  function place(
    light: THREE.DirectionalLight,
    focus: THREE.Vector3,
    frameDir: THREE.Vector3,
    swing: number,
    elevation: number,
    distance: number,
  ): void {
    relDir.copy(frameDir).applyAxisAngle(WORLD_UP, swing);
    const flat = Math.sqrt(Math.max(0, 1 - elevation * elevation));
    relDir.multiplyScalar(flat).setY(elevation);
    // relDir points from the subject towards where the light should hang, so
    // putting the light out along it and aiming back at the subject is what
    // lands the light on the side of the silhouette the camera cannot see.
    light.position.copy(focus).addScaledVector(relDir, distance);
    light.target.position.copy(focus);
  }

  /**
   * How much the bonfire should be allowed to take over the warm back light,
   * for the subject the camera is looking at. Two factors, both necessary.
   *
   * Proximity, because a fire across the arena is scenery and steering the kick
   * onto it would put a warm rim on a man who is nowhere near it. And
   * backlit-ness, because the whole value of the fire as a rim is that it is
   * *behind* the subject: with the fire between the lens and the warrior the
   * same steer would swing the kick round to the front and flatten him, which is
   * the opposite of what it is for. The 0.4 floor keeps a little of the steer
   * even side-on, where a fire this close is still the warmest thing touching
   * him.
   *
   * Leaves `fireVec` holding the flat unit vector from the subject to the fire
   * on every path that returns a non-zero steer — `update` hangs the pair's
   * frame off it.
   */
  function fireSteer(camera: THREE.PerspectiveCamera, focus: THREE.Vector3): number {
    fireVec.subVectors(hearth.position, focus);
    fireVec.y = 0;
    const dist = fireVec.length();
    if (dist < 1e-3 || dist > HEARTH_RIM_REACH) return 0;
    // Square-rooted, which is the shape and not a fudge factor. A raw smoothstep
    // put 0.23 on the `brawl` ring at 4.5 m — the fire is plainly the brightest
    // thing in that frame and the steer was behaving as though it were scenery,
    // because a smoothstep spends most of its range near its ends. The root
    // fills the middle back in (0.73 at 4.5 m) while keeping a finite slope at
    // the cutoff, so a warrior walking past the reach still fades in rather than
    // switching on.
    const proximity = Math.sqrt(
      THREE.MathUtils.smoothstep(1 - dist / HEARTH_RIM_REACH, 0, 1),
    );
    fireVec.multiplyScalar(1 / dist);
    viewVec.subVectors(focus, camera.position);
    viewVec.y = 0;
    if (viewVec.lengthSq() < 1e-6) return proximity * 0.4;
    viewVec.normalize();
    const backlit = THREE.MathUtils.clamp(fireVec.dot(viewVec), 0, 1);
    return proximity * (0.4 + 0.6 * backlit);
  }

  function applyRig(): void {
    // Without the occlusion cascade the term it would have carried goes back
    // into the two fills it came out of, so a tier drop costs the contact
    // darkening and never the exposure.
    ambient.intensity = rig.ambient + (hasAo ? 0 : rig.ao * AO_FOLD_AMBIENT);
    hemi.intensity = rig.hemi + (hasAo ? 0 : rig.ao * AO_FOLD_HEMI);
    ao.intensity = hasAo ? rig.ao : 0;
    key.intensity = rig.key * nearShare;
    if (keyFar) keyFar.intensity = rig.key * (1 - nearShare);
    warmFill.intensity = rig.warm;
    bounce.intensity = rig.bounce;
    faceFill.intensity = rig.face;
    hearth.distance = rig.hearthRange;
    if (beam) {
      beam.distance = rig.hearthRange;
      beam.shadow.bias = beamBias(rig.hearthRange);
    }
    // The separation pair and the fire's own levels are written by `update`,
    // because both are functions of where the camera and the fire are as well as
    // of the mood. `rig` holds the mood half and nothing else.
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
    rig.face = m(blendFrom.face, to.face);
    rig.ao = m(blendFrom.ao, to.ao);
    rig.hearth = m(blendFrom.hearth, to.hearth);
    rig.hearthRange = m(blendFrom.hearthRange, to.hearthRange);
    ambient.color.setHex(blendFrom.ambientColor).lerp(moodHue.setHex(to.ambientColor), t);
    ao.color.setHex(blendFrom.aoColor).lerp(moodHue.setHex(to.aoColor), t);
    hemi.color.setHex(blendFrom.hemiSky).lerp(moodHue.setHex(to.hemiSky), t);
    hemi.groundColor.setHex(blendFrom.hemiGround).lerp(moodHue.setHex(to.hemiGround), t);
    rimMood.setHex(blendFrom.rimColor).lerp(moodHue.setHex(to.rimColor), t);
    kickMood.setHex(blendFrom.kickColor).lerp(moodHue.setHex(to.kickColor), t);
    bounce.color.setHex(blendFrom.bounceColor).lerp(moodHue.setHex(to.bounceColor), t);
    faceFill.color.setHex(blendFrom.faceColor).lerp(moodHue.setHex(to.faceColor), t);
    hearth.color.setHex(blendFrom.hearthColor).lerp(moodHue.setHex(to.hearthColor), t);
    beam?.color.copy(hearth.color);
    applyRig();
  }

  /**
   * Mixes the two bodies into one direction, guarding the case a lerp between
   * unit vectors cannot survive: `setTimeOfDay` can put the sun and the moon
   * opposite each other, and the midpoint of two opposed vectors has no bearing
   * at all. There is a dominant body whenever that happens, so fall back to it.
   */
  function blendBody(
    out: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3, t: number,
  ): THREE.Vector3 {
    out.copy(from).lerp(to, t);
    if (out.lengthSq() < 1e-6) out.copy(t >= 0.5 ? to : from);
    return out.normalize();
  }

  function reaim(): void {
    // `key` is the moon and `warm` is the sun — see LightingOptions. Either may
    // be absent, in which case the one that is present has to be both bodies;
    // the share then still decides which *light* it drives.
    const moonAt = opts.key ?? opts.warm;
    const sunAt = opts.warm ?? opts.key;
    const moonHue = opts.keyColor ?? opts.warmColor;
    const sunHue = opts.warmColor ?? opts.keyColor;

    let castAt: THREE.Vector3 | undefined;
    let castHue: THREE.Color | undefined;
    let lowAt: THREE.Vector3 | undefined;
    let lowHue: THREE.Color | undefined;

    if (moonAt && sunAt) {
      // The whole of the v8 blocker is this number. See SUN_CASTS_BELOW.
      const share = THREE.MathUtils.smoothstep(sunAt.y, SUN_CASTS_BELOW, SUN_CASTS_ABOVE);
      castAt = blendBody(casterDir, moonAt, sunAt, share);
      lowAt = blendBody(rakeDir, sunAt, moonAt, share);
      if (moonHue && sunHue) {
        castHue = casterHue.copy(moonHue).lerp(sunHue, share);
        lowHue = rakeHue.copy(sunHue).lerp(moonHue, share);
      }
    }

    aim(key, KEY_BASE, castAt, castHue,
      KEY_DISTANCE, KEY_MIN_ELEVATION, KEY_MAX_ELEVATION, keyAxis);
    aim(warmFill, WARM_BASE, lowAt, lowHue,
      WARM_DISTANCE, FILL_MIN_ELEVATION, FILL_MAX_ELEVATION);
    // One body, two maps: the far cascade never re-derives the hue, it copies
    // it, so the two halves of the split can never drift into two suns.
    keyFar?.color.copy(key.color);

    // The occlusion light leans along the caster's azimuth. It has to lean
    // somewhere — `AO_TILT` explains why not straight down — and leaning it with
    // the caster means its half-metre of throw runs the same way as the metres
    // of shadow beside it, so the two never disagree about which side of a stake
    // is dark, and a shot never carries two shadow directions.
    const az = Math.hypot(keyAxis.x, keyAxis.z);
    const lean = Math.sin(AO_TILT);
    if (az > 1e-4) aoAxis.set((keyAxis.x / az) * lean, Math.cos(AO_TILT), (keyAxis.z / az) * lean);
    else aoAxis.set(lean, Math.cos(AO_TILT), 0);
    ao.position.copy(aoAxis).multiplyScalar(AO_DISTANCE);
  }

  applyRig();
  reaim();

  return {
    root,
    key,
    keyFar,
    ambient,

    setHearth(at) {
      if (at) hearthAt.copy(at);
      else hearthAt.set(0, HEARTH_DROP, 0);
      hearth.position.set(hearthAt.x, hearthAt.y - HEARTH_DROP, hearthAt.z);
      // The two halves of the fire hang at different heights on purpose: the
      // pool at the coal bed because that is what rims a man, the beam above the
      // flame tips because that is the only height a standing man has a ground
      // shadow from. See BEAM_RISE.
      beam?.position.set(hearthAt.x, hearthAt.y + BEAM_RISE, hearthAt.z);
    },

    setMood(next) {
      if (next === mood) return;
      mood = next;
      // Blend from where the lights actually are, not from the mood we were
      // nominally in: a second mood change mid-transition has to pick up the
      // half-way colours or the frame snaps. The pair's colours are read back
      // off `rimMood`/`kickMood` rather than off the lights, because the lights
      // are carrying the fire steer and the kick fold as well, and reading those
      // back would compound them on every mood change.
      blendFrom = {
        ...rig,
        ambientColor: ambient.color.getHex(),
        hemiSky: hemi.color.getHex(),
        hemiGround: hemi.groundColor.getHex(),
        aoColor: ao.color.getHex(),
        rimColor: rimMood.getHex(),
        kickColor: kickMood.getHex(),
        bounceColor: bounce.color.getHex(),
        faceColor: faceFill.color.getHex(),
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

      // ---- the separation pair, and the fire's claim on it ----
      //
      // The steer moves the *frame* the swings are measured in, from "away from
      // the camera" towards "towards the fire", and the swing is then applied on
      // top by `place`. In the shot this exists for the two frames coincide —
      // the lens, the warrior and the fire on one line — and the steer's whole
      // job there is hue and level. Off that line it is the steer that keeps the
      // warm edge on the side the fire is actually on, which a camera-relative
      // kick gets wrong by up to the angle between them.
      const steer = fireSteer(ctx.camera, ctx.focus);
      readBehind(ctx.camera, ctx.focus);
      behind.copy(camBehind);
      if (steer > 1e-3) {
        // Two unit vectors can be opposed — the fire directly between lens and
        // subject — and a lerp through that is a zero-length frame. The fire is
        // not behind him in that case, so the camera's frame is the right one.
        behind.lerp(fireVec, steer);
        if (behind.lengthSq() < 1e-4) behind.copy(camBehind);
        else behind.normalize();
      }

      if (kick) {
        // The cool half stays on the camera's own frame whatever the fire does.
        // Against a wall of flame the thing separating a warrior from the
        // background is the *cold* edge, and swinging it round with the kick
        // would collapse the pair into one wide light and give the money shot
        // the same hue on both edges.
        place(rim, ctx.focus, camBehind, rimSwing, RIM_ELEVATION, RIM_DISTANCE);
        rim.color.copy(rimMood);
        rim.intensity = rig.rim;
        // Elevation drops with the steer: the authored kick is the last of a
        // western sky, the steered one is a bed of coals at knee height.
        const elev = KICK_ELEVATION + (FIRE_ELEVATION - KICK_ELEVATION) * steer;
        place(kick, ctx.focus, behind, KICK_SWING, elev, KICK_DISTANCE);
        kick.color.copy(kickMood).lerp(hearth.color, steer);
        kick.intensity = rig.kick * (1 + (HEARTH_RIM_GAIN - 1) * steer);
      } else {
        // No kick to steer, so the rim — which is already carrying the kick's
        // fold on this tier — takes the fire on with it, at the fold's weight.
        // A cool rim is the last thing holding a silhouette off the background,
        // so it is never allowed to go all the way over to the fire's hue.
        const folded = steer * KICK_FOLD;
        const elev = RIM_ELEVATION + (FIRE_ELEVATION - RIM_ELEVATION) * folded;
        behind.copy(camBehind).lerp(fireVec, steer > 1e-3 ? folded : 0);
        if (behind.lengthSq() < 1e-4) behind.copy(camBehind);
        else behind.normalize();
        place(rim, ctx.focus, behind, rimSwing, elev, RIM_DISTANCE);
        rim.color.copy(rimMood).lerp(hearth.color, folded * 0.8);
        rim.intensity = (rig.rim + rig.kick * KICK_FOLD) * (1 + (HEARTH_RIM_GAIN - 1) * folded);
      }
      place(bounce, ctx.focus, camBehind, BOUNCE_SWING, BOUNCE_ELEVATION, BOUNCE_DISTANCE);
      // Camera-relative like the bounce, and for the stronger version of the
      // same reason: this light exists to put something on the side of a face
      // the lens is looking at, so the lens is the only frame that can define
      // it. It never takes the fire steer — a face fill that swung round behind
      // the subject when he walked past the bonfire would be answering a
      // composition failure by reproducing it.
      place(faceFill, ctx.focus, camBehind, FACE_SWING, FACE_ELEVATION, FACE_DISTANCE);

      // ---- the fire ----
      //
      // The pool breathes rather than flickers: three slow terms, none of them
      // on world.ts's 9.3 Hz beat, so the two do not beat against each other and
      // produce a visible pulse. Written after the blend, so a mood change moves
      // the amplitude it is applied to rather than fighting it.
      const t = ctx.time;
      const breath = 1
        + Math.sin(t * 3.7) * 0.1
        + Math.sin(t * 6.1 + 1.7) * 0.055
        + Math.sin(t * 11.9 + 0.4) * 0.03;
      hearth.intensity = rig.hearth * poolShare * breath;

      if (beam) {
        // Down the camera's own bearing, dipped so it rakes the ground rather
        // than the palisade behind it — 3 m over 8 from a source now 3.35 m up,
        // which puts the axis on the turf at nine metres and the ring at 4.2 m
        // well inside the cone's plateau. The beam shares the pool's breath so
        // the shadow it casts does not pulse against the light that fills it.
        beamAim.subVectors(ctx.camera.position, beam.position);
        beamAim.y = 0;
        if (beamAim.lengthSq() < 1e-6) beamAim.set(0, 0, 1);
        beamAim.normalize().multiplyScalar(BEAM_THROW).add(beam.position);
        beamAim.y -= BEAM_DIP;
        beam.target.position.copy(beamAim);
        beam.intensity = rig.hearth * beamShare * breath;
      }
    },

    dispose() {
      scene.remove(root);
      key.shadow.dispose();
      keyFar?.shadow.dispose();
      ao.shadow.dispose();
      beam?.shadow.dispose();
      ambient.dispose();
      hemi.dispose();
      key.dispose();
      keyFar?.dispose();
      ao.dispose();
      warmFill.dispose();
      rim.dispose();
      kick?.dispose();
      bounce.dispose();
      faceFill.dispose();
      hearth.dispose();
      beam?.dispose();
    },
  };
}
