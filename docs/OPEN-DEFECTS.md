# Open defects

Findings that are diagnosed but not yet fixed, carried here so they survive
between iterations. Delete an entry when a capture proves it gone — not when a
change is made.

Judged against `docs/VISUAL-BAR.md`. Captures live in `art/shots/`.

Current reference: **`art/shots/v8/`**. A/B against `v7/`.

---

## Painted shield planks are still a woven cell — the substance changed, the tile did not

The v7 entry blamed `buildShield`'s `paint = M.tunic(0xb8a276)` for dressing a
painted board in wool at a fixed five repeats. That was right, and it is fixed —
`paint` is `M.timber` now, the same substance as the boards behind it. **It did
not fix the picture.** Compare the shield in `v7/portrait.png` with
`v8/portrait.png`: the cells are finer and more regular and they are still there,
because `M.timber` is `tint("oak", …, { repeat: 3 })` and a repeat is not a texel
density. Three repeats across a 105 mm plank is a 35 mm tile carrying two of
oak's knots, and at portrait framing that tile is ~35 px — a woven mat.

The same arithmetic is on the ground litter: the planks under the boots in
`v8/closeup.png` are the loudest waffle left in the set.

The fix is the one the v7 entry already described, applied to timber rather than
to wool: a per-call world tile — `tile?: number` on `TintOptions`, overriding both
`repeat` and `WORLD_TILE` — so a shield board, a hut wall and a floor plank all
get one grain. `M.timber`'s three repeats are right for a hut wall and wrong for
everything smaller than one.

At **lineup and duel framing this now reads as painted planking** and the entry no
longer applies there; it is a close-range defect only.

## The arena floor reads as cobbles — dry ones now, not wet ones

**Half of this is fixed and it is the half that mattered.** The water read is
gone: `v7/stance.png`'s blue-green pebbled sheet with cool sub-pixel glints is a
matte trodden floor in `v8/stance.png`, the white specular specks around the
boots in `v7/closeup.png` are gone, and the ground's fine-scale energy (3–12 px
band, row spectrum) is down 14.9 → 12.0% in `arena`, 23.0 → 14.6% in `closeup`
and 15.8 → 11.1% in `duel`. Splitting `wet` into standing water and `churn`, and
driving roughness up rather than clamping it down, did what it was built to do.

What survives is the *shape* of the relief, not its gloss. The floor still
carries a regular lozenge cell at 2–4 px that reads as pebbles or scales rather
than as churned earth — clearest across the whole foreground of
`v8/laststand.png` and in the mid-ground of `v8/arena.png`. It is not the
metre-scale rut waves `world.ts` added (those are 1.1–2.4 m and invisible at this
pitch); it is `buildGroundDetail`'s own normal map, which was always there and
which the sheen used to hide. Now that the surface is matte, its relief is what
the eye reads, and that relief is too regular and too isotropic to be mud.

The `held` term in `groundDetail` (`print*0.95 + well*0.5`, depth 0.46) is the
first thing to look at: `world.ts`'s world-scale film now covers part of the same
job.

## The bonfire core still clips flat

Unchanged v7 → v8; nobody owned it this pass. `v8/lineup.png` and `v8/arena.png`:
the flame is a real flame — tongues, a visible log crib, coals, and it pools
light on the ground — but its core is still welded to white. Measured over the
`arena` flame box: 1385 → 1113 pixels at or above 250 luma, and the mean
saturation of the hottest 2% is 0.055 in both. What little the count moved is the
aberration coming out, not the emissive coming down. It is the emissive in
`vfx.ts` saturating the tone curve, and `postfx.ts`'s own note says where the
curve actually clips: `white: 7.8` overstates it by 2.2x, because
`contrast: 0.36`/`pivot: 0.2` applies a 1.22 power *before* the curve, so the
frame reaches code 255 at ~3.5 scene units. Anything emissive above that welds.
Axis 9 does not pass on a flame with no colour in its hottest part.

## Faces go dark at lineup distance

Still true in `v8/lineup.png`, and only partly. The warden's and the
runekeeper's faces read; the huscarl's and the berserker's are dark ovals under
the helm brow. This is the sky-occlusion light in `lighting.ts` doing exactly
what it was built to do — a face under a helm rim is sky-occluded and loses 0.37
— plus the fire being behind them. Physically correct and a net gain everywhere
else; but a class-select lineup where you cannot see half the faces is a
composition failure, and the fix belongs in the preset's lighting or in a
face-height fill, not in backing the AO light out.

## Edges are anti-aliased now, and it is a smaller win than the diagnosis implied

The root cause was right and is fixed: the game shipped with **no geometric
anti-aliasing at all**, because `GameCanvas` correctly refuses context MSAA when
a composer is in play and `EffectComposer` correctly defaults its own buffers to
`samples: 0`, leaving SMAA — a morphological filter that never has more than the
one sample the rasteriser took — as the whole of the chain. The composer's colour
buffers carry samples now.

The gain measured on the capture is real and modest. Fraction of strong
silhouette transitions carrying an intermediate sample, `v7` → `v8`: rune stone
41.3 → 45.4%, palisade 57.7 → 60.3%, `duel`'s stake tops 46.1 → 53.1%, `arena`'s
hut roofline 57.3 → 60.5%. Violet-rimmed pixels on the rune stone, 137 → 61.
Better everywhere, clean nowhere — the stake tips in `v8/duel.png` are still
visibly stepped.

Two reasons to expect the rest to be hard, both already traced: **grain and
dither sit ahead of the AA pass** because they share the grade's pass, which caps
how far SMAA's threshold can come down (grain at 0.052 puts up to 0.026 between
two neighbouring sky pixels, so anything under ~0.07 detects grain as an edge);
and **nobody has positive evidence SMAA is blending at all** — its area/search
LUTs decode asynchronously from data URIs and the weights are zero until they
land. If a capture still shows staircases after MSAA, that is where to look.

## Smaller, confirmed

- **Pauldron lames read as square blocks** on the huscarl and warden at lineup
  distance, and the berserker's arm-fur caps are bulky slabs with flat tops.
- **The moustache halves** are soft leaves rather than hair at portrait distance.
  They want strands, which is a different primitive.
- **The runekeeper's hood opening** renders as a hard-edged polygon frame — the
  `dark` shadow gore's rim.
- **The baldric's five segments** show faceting between them at close range.
- **The tunic-through-cloak hole is back, and bigger than the speck it was.**
  `v8/duel.png` carries a ~65 × 35 px olive wedge of tunic standing in a hole in
  the hero's cloak, at the same place the 3 px speck was in `v7`. The mechanism is
  new: the drape rig's `GATHER` rotates each wing inward about the yoke, and with
  no collision the only thing stopping it is the ~60 mm the cloak was cut clear of
  the tunic's flared hem. At the 0.17 rad/ring it landed at, the wedge was
  ~120 × 70 px; 0.07 more than halved it and did not close it, because the middle
  of a wing still travels ~30 mm inward and the clearance is not uniform round the
  ellipse. Two real fixes, and they want doing together: cut the cloak wider
  (`topX`/`topZ` in `characters.ts`, +15–20 mm) so there is somewhere to gather
  *into*, then put the gather back up. Dropping `GATHER` further just returns the
  cloak to the traffic cone it was.
- **`torchFlame` in the materials catalog is dead** — nothing calls `get()` on
  it. Either wire it or delete the entry.
- **`DEEPEST_WATER` is a normaliser with nothing clamping to it.** A puddle
  deeper than 30 mm takes its colour and opacity out of range. Documented at the
  constant, not enforced.
- **The palisade-foot drip lines are ~20 m from every camera** and cost ~220
  verts to draw a dark line. If nothing in a capture shows there, cut them.
- **Object-space projection ignores the instance matrix.** If `world.ts` ever
  scales an InstancedMesh instance carrying `iron`/`steel`/`bone`/`bronze`/
  `leather`/`skin`, that instance gets proportionally scaled texels.
- **A sub-tile phase discontinuity** survives on two of the four meridians of any
  cylindrical part — the 1-tap object-space projection's hard axis select, biased
  out to 0.83 r. Faintly visible on a mail sleeve at portrait distance; killing
  it needs biplanar and chunk rewrites.

## Not defects, but load-bearing and unowned

- **There is no prop collision and no cloth collision.** Nothing world.ts places
  intersects a warrior *in these eight presets*, which is a checked fact and not
  a guarantee — in play warriors move anywhere. `SWING_FWD = 0.24` in `anim.ts`
  is a stand-in for the wearer's own body, and a deep lunge under-drapes because
  the gravity solve gets clamped against it.
- **The cloak has no collision, which is now the binding constraint rather than
  a theoretical one.** The rig can gather and can move its two wings
  independently — `v8/duel.png` and `v8/stance.png` show a cloak that hangs and
  falls in rather than standing at its cut radius, so the old "cannot gather /
  halves move as one" entry is gone. What replaces it is that the gather is
  bounded by a hand-tuned constant instead of by the body, and the tunic wedge
  above is what that costs.
- **The de-overlap solver in `hud3d.ts` has never been photographed doing work.**
  No preset puts two plates close enough to trigger `compact`.
- **The tally notches never render in `brawl`.** Bars are ~10 px there, so
  `lodDetail` is 0 and the metaphor the bar is built on only appears in
  `duel`/`closeup`.
- **Dusk's tonal split is shallow.** `v7/duel.png` B/R by luma band barely ramps
  and is non-monotone at the bottom. `laststand` got the `tintLow`/`tintHigh`
  treatment and it worked; dusk is 7 of the 8 presets and was deliberately left
  alone. The hook is there for whoever takes it.
- **`brawl` cannot present a frame in 30 s on the capture box**, and at 4 MSAA
  samples it could not present one in 46 minutes. Eight warriors now render into
  the fire beam's shadow map as well as the key's, on a software rasteriser, with
  coverage sampling on top. `MSAA_SAMPLES.high` is 2 because of it and
  `shoot.mjs`'s screenshot budget is explicit because of it. Neither is a
  measurement of what a GPU does — nobody has profiled this scene on one, and §5
  wants 60 fps at 1080p and a 30 fps phone floor. That number is unowned.

---

## Root causes worth remembering

Recorded because each took real effort to find and each was something other
than what it looked like:

- **A shadow needs a receiver, and half of ours was a mirror.** Eight captures of
  warriors casting nothing while the palisade beside them threw six-metre stripes
  looked like a light problem, and one pass was spent on the light. It was half
  the answer. The other half is that IBL specular is not modulated by a shadow
  map, so on a receiver returning ~49% of its pixel as environment — which is what
  `wet = max(basinWet, churn*0.4)` made of the floor every warrior stands on —
  a shadow map can only ever darken the other half. The palisade's stripe landed
  outside that mask, on rough grass, which is why the control was in the frame the
  whole time. Measured on the capture: the palisade's stripe contrast on the
  churned floor goes **2.07 → 3.48** between `v7/laststand.png` and
  `v8/laststand.png` while the dry-grass control in the same frame moves 3.08 →
  3.26. **When one object casts and another does not, suspect the ground under
  them before the light above them.**
- **Changing the substance is not changing the tile.** The shield's painted
  quarters were wool at a fixed five repeats, which is a real defect and was
  really fixed — they are timber now, the same boards they lie on. The basket in
  `v8/portrait.png` is the same size it was, because `M.timber` is also a fixed
  repeat and three repeats across a 105 mm plank is a 35 mm tile with two knots in
  it. Both materials were wrong for the same reason and swapping one for the other
  carried the reason across intact.
- **A gather with no collision is bounded by the pattern the cloth was cut on.**
  The drape rig gained the one thing it had never had — the ability to narrow a
  hem — and immediately spent it putting the wing inside the tunic. There was
  nothing to gather into: the cloak is cut ~60 mm clear of the garment under it,
  and the previous entry in this file about outward-only folds says exactly that
  about the opposite sign of the same number. **A cloth term that moves the shell
  toward the body needs the clearance budgeted first.**

- **The floating orange square was an opaque emissive quad, not a HUD element.**
  `bonfireFlame` — no surface, no alpha, `emissiveIntensity: 7` — on a bare
  `PlaneGeometry` standing in the hall doorway. At ~12 px it drew a hard uniform
  orange rectangle, and two independent panels read it as a UI bug; one traced it
  to `hud3d.ts`, where a fix would have done nothing. It took a radial alpha
  falloff and additive blending (`Spec.glow`), not a colour change. **Any bare
  emissive quad small enough that its edge is most of it will do this again.**
- **A shield's hide facing was a single-sided `CircleGeometry`.** Invisible for
  as long as the shield was mounted face-out; the moment `anim.ts` started
  carrying it bladed at rest, the outer planks — which are chords, only 100 mm
  tall at the rim — left two see-through crescents inside the binding. A
  regression in one file surfaced by a correct change in another.
- **A cloak fold cannot be a cosine about zero.** Half its amplitude cuts *inside*
  the base ellipse, and the base ellipse is only ~60 mm clear of the tunic's
  flared hem — so raising the fold depth from 30 mm to 52 mm put the cloak inside
  the garment under it and the tunic came through as an olive wedge — caught on an intermediate capture
  taken mid-pass, between the drape landing and v7. Cloth draped
  over a body is displaced away from it; there is nothing for a fold to displace
  into.
- **The metals went matte from roughness drift, not from a missing PMREM.**
  `specularAA` bakes the sub-texel slope it band-limits into the roughness
  channel, asymmetrically — it barely moves a rough substance and swamps a smooth
  one, so steel's recipe still *declared* 0.18 while its shipped map *meant*
  0.316. Reconciling against the declared number, then clamping, collapsed every
  `blade()` request above 0.36 onto one grey. Reconcile against the measured
  channel means, not against the recipe.
- **A texel density is not a UV repeat.** Every geometry here parameterises u and
  v over 0..1 whatever size it is, so a fixed repeat makes texel size scale with
  1/size and no two surfaces on one warrior agree. Leather at `repeat: 4` covered
  280 mm on a torso and 20 mm on a bracer — wickerwork and crocodile from one
  material.
- **A backlight cannot rim a silhouette.** A silhouette edge is where the normal
  is perpendicular to the view ray, so a light on the view axis meets it at
  N·L ≈ 0. Every unit the bonfire spent on a warrior between it and the lens
  landed on the half the camera cannot see; raising candela could never fix it.
  The steer had to move the *frame* the kick hangs in, not the light.
- **A tint crossover placed on the picture destroys the contrast it exists to
  create.** `mix(shadowTint, highlightTint, s)` passes through the average of the
  two tints at s = 0.5, and the average of a cool tint and a warm one is a
  desaturated near-neutral — which is what `laststand`'s modal 42% of pixels were
  getting. The tonal anchor must sit *on* the picture and the tint crossover
  *above* it; they are two jobs and they wanted opposite placements.
- **Standing water read as a hole in the world** because a near-black dielectric
  at `metalness 0.02` returns F0 ≈ 0.04, so from the near-vertical angle a
  gameplay camera actually uses, ~96% of the pixel is the black diffuse term. The
  PMREM only pays out at grazing incidence. The follow-up defect was the same
  material read as *flooding*, and that was placement, not material: one 2.5 m
  disc sat 1.14 m from where three presets stand their subject.
- **Every "mid-swing" capture was a rest pose.** `readSwing` only set `swingLive`
  when it saw `attackTimer` decrease across two frames, and a capture holds it
  constant — so animation was reviewed for weeks against poses that were never
  the ones requested.
- **The "long neck" was never the face.** The face-placement table that used to
  head this file (eye line 60%, mouth 39%, nose 56%) described a layout two
  rewrites stale; the built mesh measures 50.0 / 28.0 / 44.8, canon on the first
  and within a per cent on the others. The real error was 183 mm of neck against
  a life value of 0.39 head-heights, which the eye reads as a small head on a
  long body. The skeleton computed 7.5 heads because the skeleton never measured
  the neck.
- **The ground "glitter" was specular, not albedo.** The wet/puddle mask was
  gated on the full height field, which carries fine noise at ×5 and ×9, so
  wetness bled onto dry ground at texel frequency. The give-away: specks took the
  *sky's* colour on cool ground and the *fire's* on warm ground, sat on the
  crowns of the relief, and carried chroma fringing.

---

## Process defect — overlapping captures corrupt the A/B reference

Two workflows ran concurrently and both wrote to `art/shots/`. One re-captured
into `v4` *with newer code*, destroying the reference the other was scoring
against. Any A/B taken across that window compares two different builds while
claiming to compare one change.

Captures are a shared, mutable resource. Only one capture may run at a time, and
a directory that has been scored must be treated as immutable — write a new
version rather than refreshing an old one.

---

## Fourth panel (on v8) — the shadow answer, and a new one

**Shadows point at the sun.** The only shadow-casting directional is the
moon-aimed key, so the palisade stripes in `v8/laststand.png` run down-LEFT,
toward the sun glare at frame-left. Every shadow in the game points at the
brightest thing in the sky. Four panels missed this; it invalidates the
direction of every stripe now being celebrated as a win. `lighting.ts` — the
caster has to be aimed by whichever body is actually dominant for the mood.

**Warrior shadows now exist but sit at the noise floor.** Both halves of the
pair landed, and the limiter is now a third thing: the hero's shadow in
`v8/laststand.png` dips 50 -> 31 luma (~1.5:1) while the palisade stripe beside
it row-averages 101.8/44.9 (2.27:1) — against ground albedo noise of
sigma/mu = 0.30. The shadow is *below the variance of the surface it falls on*.
The arena hero moved 1.24 -> 1.31 between v7 and v8, a 6% gain, while the
palisade's stripe on the same floor went 2.07 -> 3.48. So the receiver fix
helped the big hard-edged caster far more than the small soft one. Reducing the
ground's albedo mottle is now as load-bearing as any lighting change.

**Still no contact darkening at any boot.** In `v8/lineup.png` at 4x both
huscarl soles sit on ground *brighter* than the ground 40 px away, and the
shadow only begins a boot-length behind the foot.

**The cloak is untextured.** The crimson cloak in `v8/closeup.png` is flat paint
across ~380x520 px — no weave, no fibre direction, no fold shading. Its only
high-frequency content is the post-pass film grain, i.e. noise standing in for
texture. In `v8/laststand.png` the same garment carries a hard-edged rectangular
panel of streaky 'hair' texture over a flat body: one garment, two substances,
razor boundary.

**Shield planks share one tile AND one phase.** The portrait crop shows the same
knot at the same height on boards 1, 2 and 3. A per-plank phase offset is a
smaller fix than the world-tile work and would break the waffle read on its own.

**The bonfire core got worse, measurably.** Pixels at or above 250 luma over the
arena flame box went 1381 -> 1547 v7 -> v8, and mean saturation of the hottest
2% is unchanged at 0.15.

**No sparks, no dust, no blood anywhere in eight captures** — including
`laststand`, where the hero is at ~15% health. Axis 9 cannot pass on that.

**Credit, measured:** violet edge fringing fell 3666 -> 196 in `duel`; no
banding (the sky carries 217/148/102 unique per-channel values); no
PointsMaterial squares; no floating orange quad.
