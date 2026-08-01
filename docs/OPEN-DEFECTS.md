# Open defects

Findings that are diagnosed but not yet fixed, carried here so they survive
between iterations. Delete an entry when a capture proves it gone — not when a
change is made.

Judged against `docs/VISUAL-BAR.md`. Captures live in `art/shots/`.

Current reference: **`art/shots/v12/`**. A/B against `v11/`.

---

## Shield planks share one phase — the woven cell is gone, the repeat is not

**The mat read is fixed and a capture proves it.** `v8/portrait.png`'s shield is
unmistakable basketry: a grid of identical "П" glyphs, three per plank, with a
mirror axis down every tile. `v9/portrait.png` is painted boards with lengthwise
grain, and the same change shows on the ground litter, which was the loudest
waffle in the set — the plank at the hero's feet in `v8/closeup.png` is a diagonal
cross-hatch and in `v9/closeup.png` it is parallel grain with knots in it.
Measured on the portrait crop: sigma/mu over a pale board 0.438 -> 0.254, over a
crimson board 0.572 -> 0.315, and the row spectrum across the board drops ~40% at
every cycle from 1 to 12. The cause was not the tile size — it was that `wood()`'s
radial term is even in u, so every tile carried a mirror and a cathedral crown.
An integer `cath` term slides the crown off the tile without touching the wrap.

**What survives is the phase.** Every board still carries identical grain at
identical heights, because all seven planks are `BoxGeometry` merged into one
geometry with one material (`characters.ts:705`) and every front face has the same
0..1 UVs. No texture content can differentiate them; this has to be fixed where
the UVs are made. Two ways, and the second is strictly better:

- offset each plank's `uv` attribute by a per-index amount in the loop at
  `characters.ts:2608–2620`; or
- the per-call `tile?: number` on `TintOptions` this entry has wanted since v7.
  `materials.ts`'s `projectFromObjectSpace` derives UVs from `vSubstancePos` and
  `Part.merge()` bakes each plank's `xf(cx, …)` into its positions, so a world
  tile delivers the phase *for free* and gives the shield, the hut wall and the
  floor plank one grain. `WORLD_TILE` cannot take oak globally — world.ts's
  per-mesh repeats would all be overridden.

The paint quarters are a second density error on the same object:
`characters.ts:2619` builds them as `box(halfW*1.94, edge, 0.004)` with their own
0..1 v, so at `M.timber`'s repeat 3 the paint's grain is exactly 2x finer in v
than the board 2 mm under it. Same fix.

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
`v9/laststand.png` and in the mid-ground of `v9/arena.png`. It is not the
metre-scale rut waves `world.ts` added (those are 1.1–2.4 m and invisible at this
pitch); it is `buildGroundDetail`'s own normal map, which was always there and
which the sheen used to hide. Now that the surface is matte, its relief is what
the eye reads, and that relief is too regular and too isotropic to be mud.

The `held` term in `groundDetail` (`print*0.95 + well*0.5`, depth 0.46) is the
first thing to look at: `world.ts`'s world-scale film now covers part of the same
job.

**This is now the binding constraint on the shadow work, and it is unowned.**
The v9 lighting pass took the warrior shadow from below the surface's own noise
to about 2:1 above it, and it did that entirely by adding contrast — the mottle
underneath is untouched, measured at sigma/mu 0.373 on open lineup floor in `v9`
against 0.375 in `v8`. `lighting.ts`'s own note says a rig cannot subtract more
of the ground than it puts on it; the next real gain on axis 3 is either this
amplitude or a screen-space AO pass in `postfx.ts`.

**v10 attacked the amplitude from `world.ts` and the capture says it did not
reach the pixel.** The vertex-albedo field was re-banded away from the shadow's
wavelength (`fine` 1.18 m -> 3.8 m, `grit` 0.39 m -> 4.2 m, `blade`'s green swing
4.25:1 -> 1.78:1, `rut` slope 0.24 -> 0.14), and the field measured in isolation
improved by 25% in the shadow band. On the frame, band-passed floor sigma at
2–5 px is **flat to slightly worse in six of seven presets** (`arena` 10.76 ->
11.08 code values, `closeup` 10.89 -> 11.56, `brawl` 11.31 -> 11.86, `lineup`
6.85 -> 6.98, `laststand` 6.03 -> 6.13, `duel` 8.59 -> 8.49) and improves in
exactly one — `stance`, 6.35 -> 5.60, −12%, which is the preset whose camera is
lowest and closest and therefore the one where a world-scale term subtends the
most screen. That is the shape of a real but tiny win being swamped, and it
confirms rather than refutes the diagnosis in this entry: the relief the eye is
reading is `buildGroundDetail`'s, at 33 mm–11 cm, and it was not touched.
`world.ts`'s own note now records that the sub-2 m octaves of `mid`/`churn`/
`drainage` were tested and are *not* the culprit, so the next pass should not
re-derive that.

The specific term to cut is named and still unowned: in `buildGroundDetail`,
`height` takes `peb` from `sampleCell(bank.micro, u*2, v*2)` — ~33 mm on the
1.6 m tile — at `+0.16` into a `bump: 1.9` normal. That, not the `held`
roughness term this entry used to point at, is the 2–4 px cell. `dome` at 11 cm
is worth keeping.

## The bonfire's coal bed is pale peach lumps, and it is now the loudest thing in the crib

The flame above it has colour (see the v10 entry below) and that is exactly what
exposed this: with the tongues no longer welded to white, what the eye lands on
in `v10/closeup.png` at 2x is a ring of pale, waxy lumps sitting in the log crib
that read as marshmallows, not as embers. Measured over the crib base
(`closeup`, x 1230–1420, y 495–545), lumps above 170 luma are **[254, 203, 165]**
in v10 against [245, 207, 174] in v9 — the material never changed; only its
surroundings got out of its way, and the count halved (988 -> 536) because the
flame is no longer over-brightening its neighbours.

The cause is named and unowned: `materials.ts:169`,
`bonfireFlame: { emissive: 0xff5500, emissiveIntensity: 5.6 }`, on the
`IcosahedronGeometry` coal instances `world.ts:3027` places. 5.6 linear in R
clips before the other two channels do, so the grade's crosstalk drags G and B up
to ~205/165 and the lump arrives desaturated and pink. It wants roughly
`0xff8a28` at 2.2–2.4. The comment above the entry reasons from a bloom threshold
that, per the next entry, the chain cannot reach without clipping first.

## Bloom is unreachable — the threshold sits above where the grade already clips

Not visible as an artifact; visible as an absence, and it is why every emissive
in the game has been tuned by pushing intensity until something goes white.
Running postfx's own chain (exposure -> white balance -> contrast power ->
crosstalk -> filmic) on the CPU, the frame reaches code 255 at **4.07 scene units
in dusk and 2.48 in `laststand`**. `bloomThreshold` is **5.0 and 6.0**. There is
no radiance at which a source both blooms and keeps its chroma: it clips first,
every time. v10 worked around it for the bonfire with an authored halo, but
"let bloom carry the heat" cannot literally happen until the threshold drops to
~3.2–3.6 or `crosstalk` comes down from 0.3. Unowned, and it constrains axis 9
for anything else that wants to glow.

## Faces at lineup distance are lit now, and still the coolest skin in the frame

**Mostly fixed.** The diagnosis in the v8 entry was wrong about the mechanism and
the right fix landed anyway. It was never the level: every directional in the rig
except `bounce` sits *behind* the subject, so the only light reaching a face
turned to the lens was `bounce`, which is `0x93a084` because it is turf — olive
light on warm skin, which reads as a muddy patch rather than as an underlit face.
`lighting.ts`'s `faceFill` is a warm near-level front fill, 33° off the camera
axis at elevation −0.13 so an up-facing normal clamps to zero and it cannot spend
any of the contact darkening.

Measured on the lineup crop, v8 -> v9: huscarl 34.7 -> 45.1 luma with R:G going
1.87 -> 2.08, warden 55.3 -> 66.9, berserker 57.7 -> 62.8. In `v9/lineup.png` the
huscarl's eyes, mouth, nose and cheek modelling all read where `v8` had a flat
olive oval. The predicted cost — a directional cannot be height-selective, so it
lands on every camera-facing vertical — **did not appear**: the far palisade is
61.7 in both and the `closeup` hut wall went 72.7 -> 69.0, because the ambient and
hemisphere were drained to pay for the AO by more than the fill puts back.

What is left is that skin is still the coolest-lit material in a warm frame, and
the runekeeper's face under a deep hood is still the darkest of the four. That
wants a hue, not a level.

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
  Unchanged in `v9/duel.png` — still a ~65 × 35 px olive wedge of tunic standing
  in a hole in the hero's cloak, in the same place the 3 px speck was in `v7`, and
  now more legible because the wool around it carries fibre. The mechanism is
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
- **`buildWool`'s `lay` is finer than the nap it steers.** The fibre-direction
  chooser runs at 12 cycles/tile against a mid nap at 5, so it flips direction
  every 1.5 cycles of the thing it is choosing for and chops the streaks. Costs
  nothing on the 51 mm cloak tile; it is the mush on the 300 mm back pelt.
  Coarsening to 4–8 is a one-token change that wanted an A/B it did not get.
- **`buildWool`'s `dye` still spends ±17% of albedo range at 12 cycles/tile**,
  which is 0.9 px at `closeup` framing — below anything a garment can resolve.
  Left alone deliberately: re-banding that field is what produced the flat-paint
  cloak in the first place, so it wants a capture behind it, not an argument.
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
- **Nothing with a time constant over ~1.4 s can appear in a capture.**
  `GameCanvas.tsx:297` clamps `rawDt` to 0.05 and `shot/page.tsx:264` sets
  `__shotReady` after 26 rAF ticks, so **every capture is taken 1.35 s into the
  simulation** whatever the wall clock does. An ember lives 1.5–3.6 s and has to
  climb; a smoke puff needs ~4 s to become a plume. v10 works around it with a
  `warmUp(9)` that steps the particle system forward through the real frame path
  at construction, which is why embers exist in v10 at all — but the workaround
  is per-system, and anything else that accumulates (smoke, decal drying, fire
  flicker phase) needs its own. This is a sharper statement of "events never
  arrive": it is not only events, it is anything slow.
- **`FrameContext` in `quality.ts` carries no per-warrior data** — only `focus`
  and `localState` — so `vfx.ts` cannot make any warrior but the local one dust,
  bleed or react. A `pressure` (health fraction) field would also let ground
  marks key off actual health rather than off `lastStandTriggered`. Related:
  `GameCanvas.tsx:419` only emits dust for `state === "sprinting"`, and no preset
  is ever sprinting; walking and running over churned mud kick dust too.
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
- **A field named for a role outlived the role, and four panels read past it.**
  `LightingOptions` had a `key` and a `warm`; `GameCanvas` passed the moon as
  `key` because a night rig wants a moon key, and only `key` cast. The sky then
  became a sunset and nobody re-checked, so every shadow in the game ran at the
  brightest thing in it — at `sunIntensity 22` against `moonIntensity 0.1`, which
  is not a close call. Three review passes celebrated those stripes as the
  lighting win. The fields are `moon`/`sun` now and which one casts is
  `casterShare`'s per-frame decision. **Name an interface field for the thing it
  carries, not for the job you currently do with it** — a role can be re-derived,
  a mis-labelled body cannot be noticed.
- **A texture fix cannot show on a surface with no light gradient across it.**
  Wool gained a real nap and it is plainly visible in `stance`, `duel`,
  `laststand` and `portrait` — and it went measurably *flatter* in `closeup`, the
  one shot the "cloak is untextured" defect was raised on, because that garment
  faces away from every directional and sits at 15/255. Most of what a cloth
  recipe adds is relief, and relief is N·L. **Before scoring a material defect,
  check the light on it** — otherwise the fix lands and the frame that raised the
  bug is the one frame that cannot show it.
- **The mirror that made the shield a basket was also what made its tile wrap.**
  `wood()`'s radial term `sqrt(x² + pith²)` is even in u about the tile centre, so
  every tile carried an axis and a cathedral crown, three per plank, and that read
  as woven cells. Leaning `x` to break the symmetry puts a hard vertical seam at
  every repeat — worse than the arch. The way through was a linear term with an
  **integer** ring count (`+ cath * u`): it slides the stationary point off the
  tile entirely while leaving `frac(rr)` at u = 1 exactly what it was at u = 0.
  **When a periodic artifact is load-bearing for the wrap, translate it out of
  frame rather than destroying it.**
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

**`git stash` is the same class of hazard and bit us again before v10.** An agent
wanting a lint baseline ran `git stash`, which is repo-global: it reverted a file
a concurrent workflow was mid-edit on, and `git stash pop` then refused because
that workflow had written to the file again. Nothing was ultimately lost — the
v10 verify pass confirmed the working tree was strictly ahead of `stash@{0}` on
both files — but the recovery cost a pass of anxiety and the stash entry had to
be carried between sessions. **Never run a repo-global git command to answer a
question about one file.** A lint baseline for your own file is `npm run lint`
filtered to your own path; a diff baseline is `git show HEAD:<path>`.

---

## v9 verify pass — what the capture proves, and what it does not

Four blockers went in; three reached the frame. Every number below is measured on
`art/shots/v9/` against `art/shots/v8/`.

**Shadows point away from the sun. Proven, and the v8 entry is deleted.** The
cleanest evidence is `v9/lineup.png`: four warriors on one floor, and a column
profile across the foreground band (y 735–775) shows four dark troughs at
x≈160–320, 640–800, 1040–1160 and 1480–1560, each one starting at its own
caster's boots and running to the RIGHT, with 65–81 luma peaks between them. The
sun glare is at frame-LEFT. Four of four, no exceptions. The same reversal is
visible as an absence: `v8/laststand.png`'s palisade threw six-metre stripes
toward the camera across the whole right of the frame, and in `v9` that ground is
clean, because the fence's shadows now fall behind the fence where they belong.

**Contact darkening exists and is attached to the sole. Proven.** In `v8` the
region immediately camera-right of the warden's boots measured 78.1 luma against
open-floor controls of 67.4 and 71.6 — the boot sat in a *brighter* patch, which
is what the v8 entry recorded. In `v9` the same region is 42.0 against 62.4, a
1.49:1 darkening, and at 2x the blob is visibly welded to both soles rather than
starting a boot-length downstream. On `arena` the hero's cast shadow beyond the
feet goes ~56 -> ~35 luma against unchanged open floor: 1.10:1 -> 1.77:1. Trough
to adjacent peak on `lineup` is about 2.0:1, against ground noise of
sigma/mu = 0.37 — the shadow is finally above the variance of its receiver, and
it is the *coherence* of a half-metre body-shaped blob that carries it, not the
per-pixel contrast.

**The cloak reads as cloth in five presets and as paint in the one the defect was
raised on.** `v9/stance.png` at 4x is fulled wool: lengthwise fibre striation, a
nap sheen, tonal drape. `v8` at the same crop is flat brown under a uniform
pinprick dither. `duel`, `laststand`, `portrait` and `lineup` all carry it.
**`closeup` does not** — measured on the cloak interior, sigma/mu went 0.358 ->
0.236 and 5-px band energy 0.166 -> 0.115, i.e. *down*, while mean luma went 13.3
-> 14.6. The recipe is not the problem; that garment faces away from every
directional in the rig and sits at 15/255, and relief with no N·L gradient across
it cannot show. This is a **lighting** defect wearing a texture defect's clothes,
and it is the one blocker of the four that did not reach its own frame.

**The `laststand` back panel is unchanged.** Still a hard-edged rectangular patch
of streaky pelt over a flat cloak body with a razor boundary — one garment, two
substances. `characters.ts:2862–2872` puts a 51 mm tile on the cloak
(`clothRepeat`) and a 300 mm one on the pelt (`PELT_TILE`, `round(0.3/0.25) = 1`).
6:1 on adjacent surfaces of one warrior is the whole defect and no texture recipe
can close it; the pelt wants 2–3 repeats, or `PELT_TILE` wants to be ~0.12.

**No sparks, no dust, no blood anywhere in eight captures** — including
`laststand`, where the hero is at ~15% health. *Superseded by the v10 entry: all
three now exist, and two of the three are below the threshold of being seen.*

**Regression: `stance` lost tonal range.** meanLuma 60.7 -> 58.5 (−3.7%), maxLuma
235 -> 218, `tonalBuckets` **11 -> 9** — one above the FAIL line. `arena` 12 -> 11
and `closeup` 13 -> 11 moved the same way; the other five held or improved
(`duel` 14 -> 15, `lineup` 16). The histogram says where it went: `stance`'s
16-bucket occupancy gains 5 points in the 16–32 luma band and loses the 128–176
tail. That is `lighting.ts` draining ambient and hemisphere to pay for
`AO_SHADOW_INTENSITY 0.85`, and `stance` is the preset with the least sky in it
and so the least headroom to give. The lever named at the constant is 0.78; the
retreat is that, not `AO_TILT`.

**Credit, re-measured on v9:** no banding (the `duel` sky carries 240/161/104
unique per-channel values, against 238/159/107 in v8); no `PointsMaterial`
squares; no floating orange quad; no untextured surface in any frame; violet
fringing flat within 5%. Whole-frame exposure held within ~1% on six of eight
presets while the shadow contrast roughly doubled, which was the hard part of the
lighting change and it landed.

**`right click blocks` in `npm run playtest` is flaky — 1 failure in 4 runs.** It
failed with `state=idle` and passed on three consecutive re-runs with identical
stamina numbers everywhere else, so the sim is deterministic and the read is not.
The check presses right mouse, waits a fixed 450 ms and reads one snapshot; the
dodge 600 ms earlier lasts 0.35 s and the block can land inside its recovery.
This is the same class of bug as the one `bf0b58a` fixed for the dodge assertion
by reading three packets after the press. **Do not relax the assertion to make it
green** — either read a sequence the way the dodge check does, or give the dodge
room to finish. Recorded here rather than fixed because a flaky test is a finding
and this pass did not own `tools/`.

---

## v10 verify pass — one blocker fell, one moved without arriving, and the fire cost the frame its top end

Gates: `npx tsc --noEmit` clean, `npm run lint` 12 problems (unchanged, all in
`GameCanvas.tsx` / `shot/page.tsx` / `CharacterPreview.tsx`), `npm run playtest`
**9/9** with no assertion touched, and all eight presets `ready: true`,
`blank: false`, `errors: []`, `tonalBuckets >= 9`. Every number below is measured
on `art/shots/v10/` against `art/shots/v9/`, and the two sets are **pixel-aligned
on world geometry** — the palisade strip in `lineup` cross-correlates at 0.997
with a best shift of (0, 0), so ground, fire and shadow comparisons are sound.

**The bonfire core has colour, and the entry that said it never would is
deleted.** This is the one number OPEN-DEFECTS had recorded as immovable across
v7, v8 and v9: mean saturation of the hottest 2% of the flame box, 0.054 in all
three. In v10 it is **0.286 in `arena` (5.2x), 0.314 in `closeup`, 0.276 in
`duel`**, and the clipping that caused it is gone with it — pixels at or above
250 luma inside the flame box go **608 -> 64** in `arena`, **800 -> 1** in
`closeup`, **104 -> 0** in `duel`. At 2x, `v9/closeup.png` is a white blowtorch
whose glare eats the log crib; `v10/closeup.png` is an amber flame with graded,
individually readable tongues and a fully legible crib behind them. The cause was
not the tone curve alone: the ramp's top band was authored `vec3(1.0, 0.93, 0.72)`,
which measures 0.02 saturation after white balance and crosstalk *at any
level* — an achromatic source, which is why raising or lowering radiance never
moved the metric. Re-authoring it to `(1.0, 0.46, 0.105)` is what fixed it.

**Blood, embers and ambient dust all exist now. Only blood reads.**
- *Blood is real and visible at 1:1.* `v10/laststand.png` carries **60 distinct
  regions on the floor band that darkened by more than 14 luma** against v9,
  13 790 px in total, and those pixels are redder in v10 than the turf they
  replaced (R:G **1.495 -> 1.601**) — a multiply decal over grass. Two spot
  checks: (490, 660) goes 74.0 -> 42.4 against an unchanged 64/66 control, and
  (810, 712) goes 64.4 -> 33.4 against an unchanged 92/93 control. The clustering
  around `ctx.focus` reads as a place a fight happened.
- *Embers exist and are sub-visible.* The air column above the `arena` fire
  carries **117 new warm specks** against v9, peaking at +73 luma, scattered from
  y≈122 up out of a flame that tops at y≈350 — a genuine rising column. At 1:1
  they are 1–2 px and read as sensor speckle against a bright dusk sky. They are
  in the file; they are not in the picture.
- *Dust exists as a veil, not as grains.* In `closeup` the frame carries a
  monotone near-field lift — **+4.4 luma at the bottom row, +3.1 at y 780, +1.6
  at y 650, −0.7 at the horizon** — which is exactly what a camera-centred dust
  ring at `alpha 0.11` does. `vfx.ts`'s own note flagged this as the parameter it
  was least sure of without a frame, and the frame agrees: it is haze. It wants
  fewer, larger, brighter motes rather than more opacity.

**The shadow does not read any better against the ground, and `world.ts` is not
to blame for that.** Measured per-frame so the warrior jitter below cannot
invalidate it — depth of the darkest coherent (>= 25 px) floor feature divided by
the receiver's own fine-scale sigma — v9 -> v10: `arena` 1.23 -> 1.20, `lineup`
1.33 -> 1.30, `duel` 1.53 -> 1.45, `laststand` 1.78 -> 1.80, `brawl` 1.25 ->
1.24, `closeup` 1.70 -> 1.78, `stance` 2.36 -> 2.53. Mean 1.60 -> 1.61: unchanged
within the spread. On the canonical `lineup` band (y 735–775) the four troughs
sit at the same x windows and the contrast is **2.30:1 -> 2.29:1**, while the
open-floor receiver's sigma/mu went the wrong way, **0.3235 -> 0.3547**. See the
cobbles entry above for why.

**Regression: the fire fix cost the frame its top end.** `uIntensity` went from
`2.6 + moodHeat*1.2` to `2.3 * (1 - moodHeat*0.37)`, the inner tongue ring was
dimmed to pay for its own stacking, and the duplicate-emitter fix halved the
tongue count — three cuts in the same direction at once. maxLuma falls in five
presets (`arena` 250 -> 221, `closeup` 250 -> 213, `lineup` 250 -> 239, `brawl`
250 -> 242, `portrait` 247 -> 242) and **`tonalBuckets` falls in three: `duel`
15 -> 13, `brawl` 15 -> 12, `lineup` 16 -> 13.** All still pass, none is near the
line, and whole-frame meanLuma holds within 1.3% on eight of eight — but the
brightest object in the scene is now dimmer than the sky behind it, and in
`lineup` the warriors visibly lost the warm fill the fire was giving them. The
cut was three levers where one would have done; `RING_LEVEL[0]` and the
dedup are the ones worth keeping, and `uIntensity` is the one to give back.

**No regression in the three things v9 won.** Shadow direction: `v10/lineup.png`
still shows four troughs running frame-RIGHT from four casters with the sun glare
at frame-LEFT, at x≈180, 640–690, 1040–1150 and 1480–1560. Boot contact: the
warden's sole region measures 47.6 against 78.0 on the same row, **1.64:1**,
against v9's 1.59:1 on the same crop — welded, and marginally better. Cloth
grain: `v10/stance.png` at 2x still carries lengthwise fibre and nap sheen on the
cloak, and `v10/portrait.png` still shows lengthwise plank grain on the shield.

**New, and it invalidates a measurement this file already published:
`lineup` does not pose its warriors deterministically across captures.** The
world is pixel-exact (palisade correlates 0.997 at zero shift) while every
warrior in the frame has moved: v9 -> v10 best-match offsets are huscarl +10 px,
warden −44, runekeeper +45, berserker −53, and the best-match correlations are
only 0.58–0.82, so they changed pose as well as position. **This predates v10** —
v8 -> v9 shows huscarl −44 px at correlation 0.54 and warden +14 at 0.61. The
consequence is that the v9 entry above reporting face luma on lineup crops
(huscarl 34.7 -> 45.1, warden 55.3 -> 66.9, berserker 57.7 -> 62.8) compared
crops that were not on the same pixels of the same thing, and those numbers
should not be relied on. The `faceFill` change may still have been right — the
qualitative read of `v9/lineup.png` stands — but it is not measured. Any future
per-warrior A/B must use `stance`, `duel` or `portrait`, which are stable, or
must register the crop first.

---

## Fifth panel (on v10) — and one harness defect that invalidates old comparisons

**`lineup` does not pose its warriors deterministically across captures.** World
geometry is pixel-exact between runs — the palisade strip cross-correlates at
**0.997 at zero shift** — but the warriors move **−53 to +45 px** between v9 and
v10 at correlations of only 0.58–0.82. This predates v10: v8→v9 shows the
huscarl at −44 px, r = 0.54.

That means any per-warrior A/B taken on `lineup` compared crops that were not the
same crop of the same thing. The v9 entry's face-luma numbers are among them.
Per-warrior comparison needs `stance`, `duel` or `portrait`, or a registered
crop, until the preset is made deterministic.

**The bonfire core was authored grey, not merely clipping.** `vec3(1.0, 0.93,
0.72)` measures 0.02 saturation after the grade *at any radiance*, so three
passes spent pushing emissive intensity up and down were adjusting a parameter
that could not move the metric being measured. Same failure class as the
`key`/`warm` misnaming: the thing everyone was tuning was not the thing that was
wrong. Now fixed — hottest-2% saturation 0.054 → 0.286 in `arena`, clipped
pixels in the flame box 608 → 64.

**The fire fix over-corrected.** Three cuts pulled the same way at once
(`uIntensity` 2.6 → 2.3×(1−0.37·moodHeat), the inner ring dimmed, and the
emitter dedup halving tongue count). maxLuma fell in five presets, tonalBuckets
in three, and in `lineup` the warriors visibly lost the warm fill the fire had
been giving them. The dedup and `RING_LEVEL` are right; `uIntensity` is the one
to give back.

**The ground pass did not reach the pixel, and its negative results are worth
keeping.** Receiver sigma/mu went the wrong way, 0.3235 → 0.3547; band-passed
floor sigma at 2–5 px is flat-to-worse in six of seven presets and improves only
in `stance` (−12%, the closest camera). The sub-2 m octaves of `mid`, `churn` and
`drainage` are confirmed *not* the culprit. The binding constraint is
`buildGroundDetail`'s `peb` term plus a screen-space AO pass — and the AO pass is
unowned.

**Everything past ~10 m is one colour.** In `v10/duel.png` the background band
has a hue circular-std of **6.2 degrees** at saturation 0.71 — palisade oak, hut
daub, thatch, tree canopy and soil all arrive as the same orange (arena 8.7,
brawl 13.3, laststand 13.7).

**The pale coal bed is now the loudest thing in the crib** — `materials.ts:169`
at `emissiveIntensity 5.6`, measuring [254, 203, 165]. Unchanged material; the
fixed flame simply stopped hiding it.

**Bloom is unreachable**: its threshold of 5.0/6.0 sits above the 4.07/2.48
points where the grade already clips.

### Process: `git stash` is not safe here

An agent used `git stash` mid-pass while another owner had uncommitted work in
the tree. Nothing was lost — the working tree was verified strictly ahead of the
stash on both files — but with two owners writing under a 2-agent cap, a stash
can silently bank someone else's half-finished work. Commit instead.

---

## v12 verify pass — the hand closes on the shaft, and the frame proves it

Gates: `npx tsc --noEmit` clean, `npm run lint` **12 problems** (unchanged, all in
`GameCanvas.tsx` / `shot/page.tsx` / `CharacterPreview.tsx`), `npm run playtest`
**9/9** with no assertion touched, and all eight presets `ready: true`,
`blank: false`, `errors: []`, `tonalBuckets` 9–14 (`duel` 14, `arena` 11,
`closeup` 11, `brawl` 14, `laststand` 12, `portrait` 11, `stance` 9,
`lineup` 13).

**Read the span before trusting a number below.** `art/shots/v11/` was written at
10:05 against `5b2b3a0`; `24207e2`, `90115d9`, `bb4dda3`, `c8ea1d1` and `cd7e992`
all land after it. So v11 → v12 is **five commits**, not one, and the frame shows
the finger rebuild, the plumb carry and the wrist bone together. Where the
mechanism separates them it is said so below.

**The owner's report is fixed, and `stance` is the shot that proves it.**
`stance` is the one preset whose warrior is pixel-stable across the two captures
— the fence correlates 0.990 at zero shift and *the warrior himself* correlates
0.979 at zero shift — so the same crop is the same thing in both. At 8× on the
axe grip (x 780–980, y 330–450): in `v11` the four fingers run **across** the
haft and their tips hang off its lower edge with turf visible behind them, a
hand laid over a stick. In `v12` the fingers run **along** the haft, stacked down
its length, each one crossing the wood and reappearing under it. The same
reversal is on the huscarl's sword in `portrait` (registered at −77 px): `v11` is
a smooth mitten with one fused C of knuckle standing clear of the grip, `v12` is
four separate fingers lying on the cord wraps. And on the warden's spear in
`lineup`, four distinct pale fingertips now show on the far side of the shaft
where `v11` had a single crescent beside it.

**Which half did what.** The finger *shape* is `24207e2`'s; the finger
*orientation* is `cd7e992`'s, and the second is what the report was about. Held
constant on one build and rendered offline through a scratch rasteriser — the
same rig, the wrist bone forced back to the builder's bind pitch — the fingers
curl on empty air beside the haft, and released they close on it. Measured on
the built rig across idle / walking / blocking / overhead / thrust on all four
classes, the angle between the circle the digits close on and the weapon's own
axis goes **48–75° → 0.0° in every pose**, and hand vertices sitting inside the
shaft go **8–34 → 0–5**.

**The v11 visibility win survives and the plumb term improved it.** In
`v11/lineup.png` the axe head's lower half lies over the berserker's shoulder cap
and arm; in `v12/lineup.png` it stands entirely over open ground and palisade,
socket and blade both legible. That is `90115d9` arriving on the frame — the
carry that was leaning 215 mm inboard of the fist now hangs plumb.

**No regression in the four things that were asked about.**
- *Shadow direction.* `lineup`'s canonical floor band (y 735–775) carries four
  dark troughs in both captures at the same x windows, each starting at its
  caster's boots and running frame-**right** with the sun glare at frame-left.
  Band mean is 57.4 in both; trough depth 57.4:33–35 in v11 against 57.4:33–34
  in v12.
- *Contact darkening.* Same measurement: the blob is welded to the soles in both
  and its depth is flat to marginally better.
- *Fire colour.* Hottest-2% saturation inside the flame box — `arena` 0.335 →
  0.327, `closeup` 0.258 → **0.397**, `duel` 0.209 → 0.178 — all an order above
  the 0.054 the v10 entry recorded as the failure, and clipping stays at 0–58 px
  of a 100 k box.
- *Cloth grain.* `stance`'s cloak, registered at zero shift: sigma/mu 0.326 →
  0.312, 2–14 cycle band energy 186.6 → 182.4. `portrait`'s shield planks,
  registered at −77 px: sigma/mu 0.504 → **0.507**, band 1094.8 → 1094.1. Both
  flat. (Unregistered, the shield reads 0.504 → 0.345, which is a crop error and
  not a defect — see below.)

### New, and it corrects an instruction this file already gives

**`portrait` is not pose-stable either.** The v10 entry tells future passes to
take per-warrior A/Bs on `stance`, `duel` or `portrait`. Measured across v11 →
v12: the `portrait` background hut correlates **0.996 at zero shift** while the
huscarl in front of it correlates 0.902 at **−77 px**. `stance` is stable (0.979
at zero); `lineup` moved its warriors −18, +24 and +1 px. Until the presets are
made deterministic, **`stance` is the only per-warrior A/B in the set**, and any
crop taken on `portrait` must be registered first.

**The plumb carry pushes the axe head into the right frame edge in `lineup`.**
The head's own pixels run to x = 1599 in `v12` against 1450–1555 in `v11`, so the
beard is cut off by the frame. It is the cost of the 242 mm the head gained
outboard and it is a composition defect (§7), not a rig one: the fix is the
preset's camera or the berserker's mark, not the carry.

### Measured and rejected: choking up the axe

The rig owner asked for the bound hand-hold to move up the haft to y ≈ 0.55–0.65
so a one-handed rest grips near the head. **Measured on the built rig at rest,
the geometry cannot take it.** The fist sits at 974 mm with 573 mm of haft below
it, which leaves the butt at 401 mm: move the hold 550 mm up the haft and the
butt lands at **−149 mm**, and at 0.65 it is −249 mm.
The butt goes through the turf. The suggestion was written against a haft that
still leaned outboard, where the butt swings up; hanging plumb it goes straight
down. Grounding the butt instead needs 360 mm more haft — a 1.86 m axe that
ploughs the turf on every overhead — and shortening the haft below the grip makes
it a different weapon. The grip is at 37% from the butt and staying there; if
this is taken up again it is a weapon-design change with its own capture, not a
defect fix.

### Still weak, carried forward

- **The huscarl's off fist does not align to its shield bar.** Measured at rest,
  the circle the off fingers close on sits **28.6°** off the grip bar's own long
  axis. The bar is behind the boards and the fist with it, so nothing in eight
  presets can see it — but the weapon hand's fix does not reach it, because the
  shield hangs off `elbowL` and not off the hand mount, and `applyPose` has no
  term that would carry the hand with it.
- **`HAND_GRIP.off` in `characters.ts` duplicates what `anim.ts` mounts.** A class
  gaining or losing an off-hand item is a second edit in a second file and
  nothing enforces it.
- **The thumb's standoff is a fixed offset outside the wrap circle.** Past ~30 mm
  of grip radius it stops reaching across the fingers; only the fingers have a
  sweep cap. The berserker's grip is 21 mm, so this is headroom rather than a
  live defect.
- **The overhead's cocked load puts 38 of 556 axe vertices through the shoulder
  at swing 0.35.** Pre-existing, transient, and no preset catches it — `stance`
  sits at 0.45 where it is 7 and all fist.
- **Low tier's open hand is still a mitten with a thumb** — the fingers are one
  swept collar there and always were.
- **Both weapon butts float** — axe 401 mm, spear 286 mm — and neither can be
  grounded from the builder's grip station.
- **The wrist bone costs a bigger bone texture.** Seventeen bones is four texels
  past the 8×8 target, so a warrior now gets a 16×16 float texture: 4 kB each,
  32 kB for a full lobby. Cheap, but it is no longer the "one 8×8 per man" the
  file used to claim.

## The first load has no loading screen, and the first attempt at one hung

The owner reported it plainly: *"training sometimes takes a while to load on the
first time."* He is right, and the diagnosis holds — **there is no loading state
anywhere in the app.** No spinner, no progress, no ready signal. `GameCanvas`
mounts and the browser then generates every texture in the game procedurally and
builds the world, synchronously on the main thread, with nothing on screen.
Second load is fast because the textures are cached in module scope, which is
exactly the "first time" pattern he describes. It is the first impression of
every player who opens an invite link and it currently looks like a hang.

**An attempt at this shipped as `dbb21aa` and was reverted as `2d3ad51`.** It
split the build into eight named stages with a paint between each, and a gilt
`ForgeScreen` drawing real progress. Its author measured 16.8 s of unbroken
block becoming ~3.0 s staged, and reported all four suites green.

That claim did not survive the harness. `npm run playtest` hangs: the forge
screen sits at **"waking the forge, 0 per cent"** — sampled six times over seven
minutes, never advancing — with its `fixed inset-0 z-50` overlay correctly
intercepting every click behind it. Stage zero's *work* never completes.

Three wrong diagnoses were spent on it before the evidence was read, and they
are worth recording so they are not spent again:

1. **Not a blocked click.** The overlay intercepting pointer events is it doing
   its job, not the fault.
2. **Not a stale build.** Rebuilding from clean changed nothing.
3. **Not the paint yield.** `paint()` waits on `requestAnimationFrame`, which is
   throttled to nothing in a backgrounded tab — a real hazard, since a player
   opens a link, flicks to the group chat and comes back. Racing rAF against a
   250 ms floor was written and **made no difference**, which is what proves the
   yield is not the stuck part.

So the fault is in the async restructuring of the build itself, not in the
progress screen or the yield. The idea is right and should be rebuilt; start
from stage zero's body and prove it completes before wiring any screen to it.

**And whatever is built next must be run against `npm run playtest` before it is
believed.** This is the third time on this project that a confident report has
been contradicted by the harness it claimed to have run.
