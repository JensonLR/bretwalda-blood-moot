# Open defects

Findings that are diagnosed but not yet fixed, carried here so they survive
between iterations. Delete an entry when a capture proves it gone — not when a
change is made.

Judged against `docs/VISUAL-BAR.md`. Captures live in `art/shots/`.

Current reference: **`art/shots/v7/`**. A/B against `v6/`.

---

## Cloth texel density — the "wicker" that is actually wool

This is the largest single material defect left in the frame, and the reason it
survived v7 is that it was diagnosed as something else.

The v6 note said the berserker's basket-weave torso was leather, not wool, and
that "wool was a red herring". Half right. The jerkin *is* leather
(`characters.ts` `buff` → `M.hide`), and world-sizing leather did fix it —
compare the chest in `v6/stance.png` with `v7/stance.png`, the coarse cells are
gone. But the surfaces *around* it were never touched, and they are what the eye
reads as basketwork:

| Surface | Call | Visible cell, measured off `v7/stance.png` |
|---|---|---|
| leg wraps, trousers | `cloth()` → `tinted("wool", …, { repeat: clothRepeat(girth) })` | ~32 mm |
| berserker arm-fur caps, torso ruff | `tinted("wool", 0x8a7050, { repeat: 6 })` | ~45 mm |
| warden's skirt, every tunic | `cloth()` | ~35 mm |
| **shield's painted planks** | `M.tunic()` = `tint("wool", …, { repeat: 5 })` | ~60 mm — the basket in `v7/portrait.png` |
| cloak | `cloth(…, bodyGirth * 1.4)` | ~50 mm — the knitted jumper in `v7/closeup.png` |

The visible cell is the *tile*, not the thread: `buildWool`'s 22 threads land
well under a pixel at every one of these sizes, so what survives the mips is the
dye-blotch lattice, and `CLOTH_BLOTCH * 4 = 36 mm` is exactly the cell being
seen. So this is not fixed by lowering `clothRepeat`'s quantisation — the blotch
field itself has to come down with the tile, or the tile has to go well below
36 mm and let the blotches mip out.

**It is not the two-line change the materials pass reported.** Adding `wool` to
`WORLD_TILE` would also world-size **hair (`repeat: 20`), beards (`repeat: 26`)
and the berserker's fur (`repeat: 6`)**, which borrow wool's fibre at a
deliberately much finer setting to fake strands; one tile size cannot serve both.
The shape of the fix is a per-call world tile — a `tile?: number` on
`TintOptions` that overrides both `repeat` and `WORLD_TILE` — applied to
`cloth()` and `M.tunic()` and *not* to hair/beard/fur.

Do it with a capture on each step. `stance` ships **10** tonal buckets against a
floor of 8 — the tightest in the set with `laststand` — and its marginal buckets
come off the berserker's cream legging, which is one of the surfaces this would
change. An intermediate capture in this pass had it at 9.

## The arena floor reads as wet cobbles at every distance

Unchanged v6 → v7, and it is roughly half of every frame. `v7/portrait.png` and
`v7/stance.png` show it worst: a blue-green pebbled sheet with cool sub-pixel
glints that reads as the *surface of water*, not as churned earth with water in
it. The standing-water rework did land — the flood in `v6/stance.png` is gone,
the clipped white specular blobs in `v6/arena.png` are gone — but the read
survives it, because it never came from the puddle meshes.

Two mechanisms, both in `world.ts`:

- `wet[i] = max(basinWet, churnMask * 0.4)` (~line 1169) drives
  `roughnessFactor → min(roughness, 0.34)` in the ground shader. `churnMask` is
  broad, so most of the trampled interior carries a glossy sheen even where
  there is no water at all. The number came down from 0.5 in v6 and that was not
  enough.
- The glints themselves are the ground normal map beating against that sheen at
  grazing incidence. The specular-AA block below it band-limits the lobe, but a
  wide lobe on a damp surface is still a lit lobe.

Do not simply take the sheen out. The independent panel's finding that
`portrait`/`stance` fail on *highlight structure* rather than black level still
holds, and the ground is where most of that structure currently lives — cutting
it is how `arena` went 16 → 12 buckets this pass. The wet term wants replacing
with something that reads as *mud*, not deleting.

## The bonfire core still clips flat

`v7/lineup.png` and `v7/arena.png`: the flame is a real flame now — tongues, a
visible log crib, coals, and it pools light on the ground — but its core is
still a ~120 px region welded to white. The bloom skirt cut (0.72 → 0.62) took
most of the smear off the surrounding frame and the shape is right; what is left
is the emissive itself in `vfx.ts` saturating the tone curve. Axis 9 does not
pass on a flame with no colour in its hottest part.

## Faces go dark at lineup distance

`v7/lineup.png`: all four faces read as dark ovals under the helm brow, where
`v6/lineup.png` had them warm-lit. This is the new sky-occlusion light in
`lighting.ts` doing exactly what it was built to do — a face under a helm rim is
sky-occluded and loses 0.37 — plus the fire being behind them. Physically
correct and a net gain everywhere else; but a class-select lineup where you
cannot see a face is a composition failure, and the fix belongs in the preset's
lighting or in a face-height fill, not in backing the AO light out.

## Smaller, confirmed

- **Pauldron lames read as square blocks** on the huscarl and warden at lineup
  distance, and the berserker's arm-fur caps are bulky slabs with flat tops.
- **The moustache halves** are soft leaves rather than hair at portrait distance.
  They want strands, which is a different primitive.
- **The runekeeper's hood opening** renders as a hard-edged polygon frame — the
  `dark` shadow gore's rim.
- **The baldric's five segments** show faceting between them at close range.
- **One cloak vertex still pokes through.** Making the folds outward-only shrank
  the tunic-through-cloak hole from ~60 × 40 px to a 3 px green speck in
  `v7/duel.png`, at the same place. It is one vertex, and ~8 mm on
  the cloak's base ellipse (`topX`/`topZ` in `characters.ts`) would clear it —
  left as-is only because the fix landed after the capture had started and an
  unverified number is worse than a logged one.
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
- **The cloak cannot gather.** Linear blend skinning on a Y-chain rotates the hem
  but cannot narrow it, so it keeps its cut radius under its own weight. Left and
  right halves also move as one, because the chain is on the body axis.
- **The de-overlap solver in `hud3d.ts` has never been photographed doing work.**
  No preset puts two plates close enough to trigger `compact`.
- **The tally notches never render in `brawl`.** Bars are ~10 px there, so
  `lodDetail` is 0 and the metaphor the bar is built on only appears in
  `duel`/`closeup`.
- **Dusk's tonal split is shallow.** `v7/duel.png` B/R by luma band barely ramps
  and is non-monotone at the bottom. `laststand` got the `tintLow`/`tintHigh`
  treatment and it worked; dusk is 7 of the 8 presets and was deliberately left
  alone. The hook is there for whoever takes it.
- **`ELBOW_ALONG`/`KNEE_ALONG` are duplicated** in `anim.ts` rather than exported
  from `characters.ts`, as is the cloak's `drop`. All three are correct today and
  all three are silent breakages if the builder's proportions move again.

---

## Root causes worth remembering

Recorded because each took real effort to find and each was something other
than what it looked like:

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
