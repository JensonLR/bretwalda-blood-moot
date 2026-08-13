# 13 Aug 2026 — the hair and beard slots, and one instrument that was flattering them

Newest first. The audit proper starts below this section.

## What moved in the shop

| slot | rung | before | after | instrument |
|---|---|---|---|---|
| hair | Long Mane 40g, coifed huscarl, Iron Spangen | 11.09% of silhouette, **all of it two strands beside the face** | 6.37%, hanging down the back | `cosmetictest` §3 |
| hair | Long Mane 40g, any class, Ridge / Boar / Crowned / Wyrm | 26-48% of the bare style's hang at the nape | 100-126% | `manespread` |
| beard | Close Crop 0g | median crossing 3.4-3.9 mm | 4.5-5.5 mm | `beardvolume` |
| beard | Ringed Braid 120g | median crossing 3.1-3.7 mm | 4.5-5.1 mm | `beardvolume` |
| beard | Forked Beard 80g | median crossing 3.8-4.6 mm — **it had been thinned by a chin edit in this same audit and nobody re-ran the gate** | 5.2-6.5 mm | `beardvolume` |
| beard | Forked Beard 80g | the notch between its tines was **not measured by anything** | 73.8-74.4 mm, gated at 40 | `beardvolume` fork column |
| beard | every rung | growth line feathered over **4.5 mm** and stepping from skin to hair in one texel | 11 mm, with the albedo converging on the complexion | — |

## Two instruments were flattering the slots they measure, and one of them badly

**`cosmetictest` §3 cannot see a hairstyle that has been squeezed into one
bearing.** It measures the silhouette AREA a style adds against Shaved, from one
camera. Two long strands hanging beside a face are a lot of area — the Long Mane
read its HIGHEST number of any helm on the sheet on the exact frame the owner
reported as broken. Area is not distribution. `tools/manespread.mjs` is the
answer and it bins the hair by bearing; see `docs/OPEN-DEFECTS.md`.

**`beardvolume` printed "median under the shell it declares" and compared every
style against a flat 4 mm.** So it flagged the Close Crop for missing its own
4.0 by 0.2 and let the Ringed Braid past the sentence at 3.1 with 5.8 declared.
It could not have been comparing against the declaration anyway: `BeardCut.wall`
(was `thick`) is the PARAMETRIC separation of the two sheets and the realised
crossing measures 0.50 to 0.98 of it depending on the style's own section **and
on the skull under it**. The dial and the reading are different quantities of
the same idea. The harness now says so on its own verdict line, and it ASSERTS
rather than declining to — **16/16 where it was 8/16.**

### This line said 16/16 before, and it was false when it was written

Kept, corrected, and left visible rather than quietly edited, because it is the
most useful thing on this page.

The first version of this section claimed 16/16. `npm run beardvolume` printed
**14/16 and exited 1** on the very commit that claimed it, and had done from the
moment that commit was made:

```
huscarl      forked   med 3.9   <-- MEDIAN UNDER 4 mm
warden       forked   med 3.8   <-- MEDIAN UNDER 4 mm
```

Not a flake and not a draw — the seed is hardcoded at `tools/beardvolume.mjs`,
the ray grid is a fixed 14 x 36 and there is no `Math.random` anywhere in the
path, so it reproduces to the decimal every time.

**What happened is worth more than the number.** That commit did four things,
and two of them met in the beard. It re-dialled the Close Crop and the Ringed
Braid against the reading and measured 16/16 — correctly, at that moment. It
also widened the chin's mental pad, four hunks earlier in the same file, to
answer *"chin is a little pointy"*. `beardvolume` was never re-run after the
chin moved, and **the chin is upstream of the beard**: the shell's inner sheet
is displaced along the skull's normal at the jawline, holding the pad's breadth
to the lower border turns that normal downward, and less of the displacement
then crosses the wall. Reverting the two chin curves and nothing else — on the
tree AS THE DEFECT WAS FOUND, before the Forked Beard's own dial moved — shifts
every beard on the sheet:

| | with the old chin | with the new chin |
|---|---|---|
| Close Crop | 4.7 | 5.1 |
| Full Beard | 6.0 | 5.6 |
| **Forked Beard** | **4.4** | **3.9** |
| Ringed Braid | 4.2 | 4.5 |

Two gained, two lost. The Forked Beard lost the most and was the only cut still
sitting on the bar, so it was the only one that went red — and it was the only
one of the four not re-dialled in that commit, precisely because it had been
passing when the beard work was done.

**The chin stays.** It answers an owner report, `headmeasure` is clean on it and
nothing above 215 mm moves. The Forked Beard's dial is what changes: `wall`
0.0058 to 0.0082, chosen so its reading lands in the Full Beard's own band
(5.2-6.5 against 5.3-5.8) rather than chosen to clear 4. **The bar did not
move.** 16/16 now, verified by running it, and the run is quoted in the commit.

**And the fork itself was never measured by anything**, which is the second
half of it. `beardvolume` gates on how much beard there is and has no opinion on
its shape, so the one cut whose identity is a silhouette could have lost that
silhouette without a single number changing — worse, a filled-in notch reads
here as MORE mass. There is now a `fork` column: the hem's own azimuth profile,
midline against the tine bearings. It was shown failing first, twice, on
deliberately broken builds — a flat `reach` reads −12.9 mm, and a `reach` that
still has two maxima in the source but a trough lifted to 0.90 reads 16.4 mm.
Both go red against a 40 mm bar. The real cut reads 73.8-74.4 mm.

### Re-verified from scratch, and one more false sentence found

Every claim above was re-run rather than inherited. `beardvolume` **16/16, exit
0**; the two deliberate breaks reproduce to the decimal; doubling `forked.wall`
moves the median 5.3 → 7.7 and leaves the `fork` column at 74.1, which is the
evidence that the two gates are independent; halving it goes red at 3.3;
removing `forked` from `BEARD_VALUES` fails the run instead of skipping it.
`manespread` 72/72, `eyeclip` 0 of 12 LID assertions failed, `tsc` clean.

Two statements did **not** survive the re-check, and both were about pictures
rather than numbers:

1. **`docs/OPEN-DEFECTS.md` said the tines went from "flat blades with knife
   edges" to "a rope with a belly and a highlight down it".** They did not.
   Measured on the two frames — beard run-length per scanline over the mail —
   the tines gained **0.55 mm, +1.2%**. `wall` is radial, so it adds depth, and
   the face card photographs an outline: a 41% dial change is a sub-pixel
   silhouette change at *every* bearing, not just at profile. The sentence was
   written from the number that moved instead of from the two pictures.
   Corrected there, with the lesson that the render is a check on this cut's
   **fork and material**, never on its mass.
2. **`beardvolume`'s own verdict line said "INCLUDING the fork" on runs where
   the fork was the only thing that failed.** Found by reading the harness while
   it was red. Fixed to name the fork as the failure. A true count under a false
   sentence is how this repository ships defects, and it had reappeared inside
   the gate written to stop it.

## And the capture sheet had a hole in the middle of it

`tools/shoot.mjs`'s `hair` sheet shot a bare head, the back of a head, and the
Sutton Hoo mask — the hardest case in the shop. It had **no row for a hairstyle
under an ordinary open helm**, which is nine of the ten rungs and is what a
player actually looks at. There was therefore no frame in `art/` that could have
shown the defect the owner reported. That row now exists.

---

# The armoury has never been looked at

The owner asked, after the Sutton Hoo helm was sent back: *"assuming with the
sutton hoo helmet youve also reviewed the other helmets and other customisation
to make sure theyre at our standard?"*

The answer is no, and this file records exactly how far short of it we are so
nobody has to ask twice.

---

## What has actually been reviewed

`ARMOURY` in `characters.ts` carries **eight slots and 47 options**:

| slot | options | ever captured? |
|---|---|---|
| Helmets | 10 | yes — with unusable evidence |
| Hair | 4 | **no** |
| Hair Colour | 6 | **no** |
| Beards | 5 | **no** |
| Beard Colour | 6 | **no** |
| Cloaks | 5 | **no** |
| Armour Finish | 7 | **no** |
| War Paint | 4 | **no** |

Every capture preset in `src/app/shot/page.tsx` other than the helmet rows
dresses its warriors in `defaultAppearance(cls)`. Until the helmet work, a pose
could not carry an appearance override at all — the shop could grow ten helmets
and not one of them could be looked at. So the capture set has only ever
reviewed **what a warrior is issued, never what a player buys.**

That is the whole gap. 37 of the 47 things a player can spend gold on have
never been rendered for review.

## And the helmet evidence was not evidence

`art/shots/helm/helms-heads.png` is a ten-panel strip built to prove the helmets
differ in silhouette. It cannot, because the men stand in a row across the arena
with the bonfire in the middle of it: panels 3 and 8 are backlit by flame and
blown to orange while the outer panels sit in shadow. Ten different exposures
cannot be compared, and the crops are too small for a brow or a crest ridge to
resolve.

A reviewer looked at that strip and reported the helmets read as real
silhouettes. The lead looked at the same strip and could not tell them apart.
**A comparison whose panels are not comparable is worse than no comparison,
because it produces confident wrong answers** — which is what happened, and is
why a helm with green glitter on it nearly shipped as the game's most expensive
item.

Fixing the harness is therefore a prerequisite for this audit, not a
nice-to-have. It is being rebuilt in the run that precedes this one.

## What "our standard" means here

The rubric is `docs/VISUAL-BAR.md` — 8+ on every axis, and *better than before
is not a pass*. Applied to cosmetics, that resolves to five questions per slot,
and every one of them needs a frame behind it:

1. **Does it read at fight distance?** A cosmetic nobody can see in play is not
   a cosmetic. This is the question the tight portrait crops cannot answer and
   the reason a lineup exists at all.
2. **Does it differ from its neighbours in silhouette, not just in colour?**
   A ladder of recolours is not progression. Already flagged for the helms: the
   *bowl* is near-identical from `iron` through `wyrm`, so everything below
   Sutton Hoo differentiates only by crown fittings.
3. **Is the price honest against what it looks like?** The economy is measured
   now — a winning best-of-3 pays 90–135 gold. The owner has confirmed Sutton
   Hoo at 2400 (18–25 winning matches) is right. Everything below it should sit
   on a curve that makes sense against that anchor.
4. **Does it survive the systems that came after it?** Cloaks gather through
   tunics (already an open defect). Hair and beards have to work under every
   helmet, including a full face mask that did not exist when they were built.
   A severed head keeps its helm — and its hair, and its beard, and its paint.
5. **Does it hold up under the arena's real light?** Everything is judged at
   dusk beside a bonfire. Garnet failed exactly here: it measured fine and read
   as mottled orange under the fire key.

## Known suspects, before anyone looks

Recorded so the audit starts from the awkward cases rather than the easy ones:

- **Colour-only slots.** Hair Colour (6) and Beard Colour (6) are literally
  hex values — 12 of the 47 options cannot differ in silhouette by
  construction, and three of them cost gold. Whether a paid colour swap is
  worth 30–40 gold is a design question, not a rendering one.
- **Armour Finish (7)** is also pure colour, at up to 510 gold. "Bronze Scales"
  and "Crimson Warplate" are names promising a material change that a tint
  cannot deliver.
- **War Paint (4)** is the smallest slot and the one most likely to vanish under
  any helmet with a face — and there is now a helmet that is *entirely* face.
- **Cloaks (5)** already have an open defect: gathering through the tunic.
- **The pricing comment in `ARMOURY` is now stale.** It reasons from "call it
  200–260 a match", which measurement disproved — a winning best-of-3 pays
  90–135. The price the owner confirmed is right; the comment explaining it is
  wrong, and the comment itself says this row is the thing to re-check when the
  economy moves.

## The bar for the audit itself

Capture every option in every slot, under **one consistent light**, framed tight
enough that the thing being sold resolves, and at fight distance too. Then look
at all of it and say per slot whether it meets the rubric — with the frame named
for anything that does not.

No slot passes on the strength of its code.

---

## The instrument

Built, and this is how to drive it.

```
npm run shots -- armoury        # the whole audit: 12 sheets, ~100 captures, ~2 h
npm run shots -- armouryfight   # only the fight-distance half, ~30 min
npm run shots -- cloaks         # one slot at a time — the intended way to work
```

| sheet | slot | lens | bearings |
|---|---|---|---|
| `helmcards` / `helmfight` | helm (10) | face / fight | −35° |
| `helmturn` | the Sutton Hoo helm | face | 0°, −45°, −90°, 180° |
| `hair` / `hairfight` | hair (4) | face / fight | −35°, 180°, and −35° under the mask |
| `hairtone` | hairColor (6) | face | −35°, on the Long Mane |
| `beards` / `beardfight` | beard (5) | face / fight | −35°, −90° |
| `beardtone` | beardColor (6) | face | −35°, on the Full Beard |
| `cloaks` / `cloakfight` | cloak (5) | kit / fight | 180°, −35° |
| `finishes` / `finishfight` | armor (7) | kit / fight | −35° |
| `warpaint` / `warpaintfight` | warPaint (4) | face / fight | 0°, and 0° under the mask |

One card on its own, for iterating without shooting a whole sheet:

```
npm run shots -- facecard --helm helm_wyrm --turn -90
npm run shots -- kitcard --cloak cloak_gold --armor armor_gold --turn 180
npm run shots -- facecard --guides --turn 0        # the aiming ruler, in mm
```

Three properties it now has that the ten-helmet strip did not, each of which was
a defect found by shooting the thing rather than by reading it:

- **One mark.** Every panel of every sheet photographs the same warrior standing
  on the same spot, so the light is identical by construction. Three lenses —
  face, whole body, and fight distance — differ only in back-off.
- **A pose that does not move.** `idleLayer` puts a standing man on a
  fifteen-second weight shift driven by `performance.now()`, and a card takes
  80–100 s to settle on this box. Every panel was catching him at a different
  point in a swing that moves his head ~180 mm — two panels of the *same* helmet
  differed in lean by more than two helmets do. The capture tool now installs a
  virtual clock, one 50 ms step per presented frame, so the pose is a function of
  the frame count alone. (This is also why the last turntable's front panel had
  the head half off the left edge: there was no fixed offset to aim at.)
- **A roster it cannot fall behind.** The sheets are generated from `ARMOURY`
  itself, read off `/shot?roster=1`. The tool used to keep its own copy of the
  helmet ladder, which is how the shop grew to 47 options while the capture set
  reviewed ten.

The evidence is `art/shots/<dir>/report.json`, which now names every slot each
panel was wearing. Captures are gitignored — regenerate, don't trust a file.

## First readings

Not the audit — the audit is every slot, and this is two sheets and two cards,
shot to prove the instrument works. Recorded because they are already frames,
and because both point at the same thing.

- **`helm-fight.png` — the ladder does not exist at fight distance.** Ten panels,
  one light, play scale. Rungs 2 through 9 — Iron Spangenhelm at 30 gold through
  the Wyrm-Crest at 950 — are the same grey dome of ~45 px. The 950-gold serpent
  over the crown is not visible at the range the game is played at. Only three
  panels read as different objects: Bare Head (skin, not metal), the Shadow Hood
  (a dark cowl, a genuinely different silhouette) and Sutton Hoo (a pale face).
  The audit doc already suspected the bowl was near-identical from `iron` to
  `wyrm`; the fight card says it is worse than that, because at play range even
  the crown fittings that differentiate them are gone.
- **`cloaks` — the Gilded War Cloak (400 gold) is a lampshade.** A rigid
  truncated cone from shoulder to knee with no fall, no gather and no shoulder
  line, and its hem blows to white under the fire key. One kit card, from behind.
- **`warpaint.png` — the slot is deleted by the game's most expensive item.**
  Row 1, bare-headed, the four paints are clearly distinct at portrait range and
  the card resolves them easily. Row 2 is the same four under the Sutton Hoo
  mask, and the four panels are **identical**: a player who has bought Half-Face
  Shadow at 110 gold and the helm at 2400 owns nothing he can see. The suspicion
  was already written down here; the frame settles it.

- **`hair-colour.png` — the colour staging works, and two of the six fail on
  it.** Six identical photographs of one head under one light, differing in
  nothing but the hex value. Oak Brown and Raven Black are plausible hair; Norse
  Gold (40g) and Fire Red (30g) come back as saturated yellow and pillar-box red
  — paint, not hair — and Greybeard and Snow White are near-indistinguishable
  from each other, which is two of the six paid options selling the same thing.
  Worth noting separately: the Long Mane they are shown on is a flat curtain with
  a hard edge and no volume, so the sheet is also a finding about the `hair` slot.

The pattern in all four: **what a player buys is priced on the portrait and
worn at fight distance, under a helmet.** Both sheets exist for every slot now,
and the gap between them is the thing to look at.

---

# The verdict

The audit has now been executed. The owner had already looked himself and said,
of the shop this file was opened about: *"a lot of the helmets feel generic &
almost the same as each other. all customisation options in armoury need
review."*

He is right, and it is worse than "the helmets". Below is what the frames say,
written as instructions rather than as impressions, because the two passes that
follow build from this file and cannot see the pictures.

## What was shot, and what a reader has to know about it

Everything below is the production build of `aee4b05`, captured on the
GPU-less box, one mark, one light, the virtual clock installed. Three things
about the instrument matter before any finding is read:

**A silhouette lens now exists.** `tools/silhouette.mjs` shoots the *same*
cards `tools/shoot.mjs` shoots and takes the material away — flat black on
white, no shading, no grade. It hooks the GL context before the app boots and
rewrites every scene fragment shader to a depth band about the subject's mark,
so nothing in `src/` was touched to get it. "Generic and almost the same" is a
judgement about shape, and colour is what stops that judgement being made: two
helmets in different metals go on reading as two helmets long after their
outlines have stopped differing. Run it a sheet at a time:

```
node tools/silhouette.mjs helm            --out art/shots/sil
node tools/silhouette.mjs face weapons    --out art/shots/sil
node tools/silhouette.mjs weapons --material --out art/shots/weapons
node tools/silhouette.mjs face --material --quality high --out art/shots/hi
```

**The pixel budget, stated once, because every instruction below is sized
against it.** The face card resolves 1220 px per metre — 1 px is 0.8 mm. The
fight card resolves **127 px per metre — 1 px is 7.9 mm**, and a warrior's head
is 34 px of it. So at the range this game is played at, a fitting under ~24 mm
(3 px) cannot be seen at all, and one under ~40 mm (5 px) cannot be told from
its neighbour. That single number condemns most of the helmet ladder.

**Every card in this audit renders at the `medium` tier, and so does every
phone.** `detectTier` steps a non-touch client below 900 px of viewport down to
`medium`, and a face card is 700 px wide — so these frames are, by accident, an
honest picture of what a phone player sees. See "The face" for why that is the
single most damaging finding in the file.

## 1. The Roman-vs-Saxon question, answered

**The owner is right, and the frames say the problem is the silhouette, not the
palette.** Look at `art/shots/sil/cards/weapons-huscarl_profile.png` and
`weapons-warden_profile.png` with the material off. Both men read as: a flared
skirt from waist to mid-thigh with a straight hem, bare tapering legs below it,
a round shield or a shafted weapon, and a smooth bare skull. That is a
legionary or a gladiator. Nothing in the outline says "Anglo-Saxon" — and the
outline is all a player gets at 34 px.

What is actually in the code, and what each piece has to become:

- **The warden wears lorica segmentata.** `characters.ts` builds him
  `lamellar = cls === "warden"` — six rigid courses, each overhanging the one
  below, plus an iron shin plate below the hem. Banded rigid plate is steppe
  and Byzantine kit; it is not attested in Anglo-Saxon England and it is the
  literal shape of the Roman cuirass. **REBUILD: the warden wears a mail
  byrnie, split front and back for riding, over a wool tunic.** If the four
  classes need to differ in armour, differentiate by *coverage* (short-sleeved
  byrnie vs long, mail vs leather vs none), not by inventing plate.
- **The tunic hem reads as a kilt.** The hem flares to a straight horizontal
  line at mid-thigh on every class and the legs below it read bare, because the
  leg wraps do not break the outline. **REBUILD: trousers must read as
  trousers.** Take the wraps out to 12–15 mm proud of the calf so the winding
  ridges break the silhouette (currently `rCalf * 1.1` — a 3 mm lift that
  vanishes), and put a visible break at the knee. Slit the tunic hem front and
  back to mid-thigh so it hangs in two panels rather than closing into a skirt.
- **The cloak is a Roman paludamentum, not a Saxon cloak.** The geometry spans
  ±0.56π symmetrically about the spine — a cape over *both* shoulders — while
  the brooch is placed on one (`-S.shoulderX * 0.72`). The clasp and the cloth
  disagree with each other. **REBUILD: cut the cloak asymmetric.** It hangs
  from the right shoulder, is pinned at that shoulder with the brooch, crosses
  the back and is thrown clear of the sword arm. That is both the historical
  garment and a far better silhouette — it is the one purchasable item that can
  change a man's outline at fight distance.
- **The palette confirms the read rather than causing it.** The default cloak
  is `red` for huscarl and warden, and the warden's tunic is `0x5a6630`,
  yellow-green. Red cape over a yellow-green kilt is the Roman colourway.
  **CHANGE: default the warden to `brown`, and pull his tunic off the
  yellow-green axis toward madder, woad or undyed wool.** Do this *after* the
  silhouette work, not instead of it.

This outranks every individual cosmetic in the shop.

## 2. The face

`art/shots/audit/helm-cards.png` panel 1 and `art/shots/sil/cards/face-*.png`.
The owner's read — mannequin, bald, features painted on, eyes as dark smudges,
head proud of the neck — is confirmed, and it has **three separate causes that
have to be fixed separately.**

**(a) The authored face does not exist on a phone.** The head's own comment in
`characters.ts` says the face's features are 0.032–0.055 wide in the sampling
latitude, that 24 rows sampled them below Nyquist and produced "a smooth ball
with two dark patches on it", and that 44 rows is what clears it. `LOD.high`
gives `headU/headV = 40/44`. **`LOD.medium` gives 30/30 and `LOD.low` gives
14/10** — both below the limit the comment was written to establish. Every
phone gets `medium`. The face nobody can see is the one that was built.
**FIX: pin `headU/headV` to 40/44 on `medium` and to at least 30/30 on `low`.**
The head is one merged geometry shared by loadout and seed and it is the only
part of a warrior anybody looks at from a metre away; buy the vertices back
from `body` and `limb`, which are cylinders.

**(b) The armoury preview is not the game's renderer.** `CharacterPreview.tsx`
calls `buildCharacter(cls, ap, CLASS_TUNIC[cls])` — **no material library**, so
every surface falls back to `RAW`: flat `MeshStandardMaterial` colours with no
albedo, normal or roughness maps and **no environment map at all**. It then
lights that with `AmbientLight(0xb09880, 1.1)`, which is unshadowed uniform
fill and the one light that cannot describe form. And with `materials`
undefined the face seed resolves to `0`, so every warrior in the shop is the
same man. That is the screen the owner screenshotted, and it is why the skin
reads as painted plastic there and better in a match. **FIX: hand the preview
the real `MaterialLibrary` and the scene's env map, drop the ambient to ~0.25
with a proper three-point rig, and pass the player's own face seed.**
- **(c) In silhouette the head is bald and the neck has a step.** The default
  hair (Warrior Crop, 0 g) is a 7 mm shell — `lift 0.006–0.020, thick 0.007` —
  so it adds nothing to the outline: `face-bare_front_0_.png` is a smooth egg.
  **FIX: the crop needs 15–20 mm of crown volume and a ragged hairline that
  breaks the skull's curve.** In the same frame the neck reads as a separate
  narrower column with a visible notch where the jaw meets it. **FIX: carry the
  trapezius up and the mastoid down so the join is a curve, not a step.**

**(d) The head is one hue, and that is what "painted on" actually means.** The
frame to look at is
`art/shots/audit2/cards/beards-5._Ringed_Braid_120g_3_4.png` — 400 px of head,
the arena's own light, nothing between the lens and the man. Five separate
things are wrong in it and each has its own fix:

- **Hair, beard and skin are the same colour.** The default hair and beard are
  both `0x6b4a2a` and the skin sits within a few per cent of it at this
  exposure, so the crop, the jaw and the cheek are one continuous tan mass and
  the hairline does not exist. **FIX: the default hair must be at least 25 %
  darker in value than the skin under it** — default to Raven Black, or
  re-grade Oak Brown down — and give the beard a value break from the hair.
- **Hair is knitted.** Both are `M.tinted("wool", …)` — hair at 20 repeats,
  beard at 26 — and at this range the wool weave resolves as a knitted cap and
  a knitted bib. **FIX: hair needs a directional fibre map with strand
  anisotropy, not the wool tile at a higher repeat.**
- **The face tones read as make-up.** The warm patches on the nose, ear and lip
  land as discrete pink shapes with hard edges rather than as flushes.
  **FIX: feather every face-tone patch to zero over at least 8 mm, and cut
  their saturation by about half.**
- **The brow reads as a painted slab** — a hard dark rectangle over each eye.
- **The eye is a dark almond with no sclera on the shadow side**, and the iris
  is not separable from the pupil (also `helm-cards.png`, panel 1). The
  geometry is all there — globe, lids, iris, pupil — so this is a *value*
  problem, not a modelling one: the socket is deep enough that the key never
  reaches it. **FIX: lift the sclera's albedo and give the eye a dedicated
  fill, or shallow the orbit by 2–3 mm.**

Fix the hue separation first. It is one line of colour work and it does more
for the "mannequin" read than the other four together.

## 3. Per slot

Prices below are the shop's. A winning best-of-3 pays 90–135 gold; **the
pricing comment above `ARMOURY` still reasons from "call it 200–260 a match",
which measurement disproved, and it says itself that this row is the thing to
re-check. It is now stale in the file as well as in fact — fix the comment.**

### Helmets (10) — the ladder does not exist

Proof, from `HELM` in `characters.ts`: `iron`, `nasal`, `ridge`, `spectacle`,
`boar`, `crowned` and `wyrm` are **all the same `cap: true` bowl**. Seven of
the ten rungs are one object with fittings bolted to it. The frames agree:

| # | option | g | what it actually adds | verdict |
|---|---|---|---|---|
| 1 | Bare Head | 0 | — | keep (the null) |
| 2 | Iron Spangenhelm | 30 | the bowl | keep — it is the base |
| 3 | Nasal Helm | 110 | **one bar**, inside the head's outline | **REPRICE 50 or REBUILD** |
| 4 | Shadow Hood | 120 | a cowl — the only different silhouette below Sutton Hoo | keep; **underpriced at 120** |
| 5 | Ridge Helm | 190 | a ridge + a nape lip | **REBUILD** |
| 6 | Spectacle Helm | 280 | brow plate + short cheeks | **REBUILD — it reads as a dark rectangle pasted over the eyes** |
| 7 | Boar-Crest | 380 | a boar on the crown — **the only crest below Sutton Hoo that changes the outline** | **keep, and make it the model** |
| 8 | Jarl's Crowned | 570 | a circlet, **and it loses the boar and the nape flange 6 has** | **REPRICE — 570 buys less geometry than 380** |
| 9 | Wyrm-Crest | 950 | deep cheeks + a serpent whose arch is flattened to 6 mm at the crown | **REBUILD (see below) or REPRICE to ~400** |
| 10 | Sutton Hoo | 2400 | mask, aventail, crest | keep — the only rung that reads |

**The decisive frame is `art/shots/audit/helm-fight.png`** — all ten, one
light, one mark, at 1:1 play scale. Read across it and **three panels are
different objects: 1 (skin), 4 (a dark cowl) and 10 (a pale face). The other
seven — 30 gold through 950, 2110 gold of purchases — are the same 20 px grey
dome.** Panel 5 is the Ridge Helm at 190 and there is no ridge in it; panels 7,
8 and 9 differ from each other by a two-pixel smudge on the crown. Worth saying
out loud, because it decides where the next pass spends its time: at that
range the brightest thing on the warrior is **his leg wraps**, and the second
is the shield. Nothing a player can buy for his head competes with a free pair
of cream puttees.

Two specific defects behind that, both checkable in the file:

- **The Wyrm-Crest's arch is inverted, and it is the exact defect the Ridge
  Helm's own comment says was fixed.** The ridge crest lifts
  `0.005 + 0.030 * clamp01(v)^0.6` — monotonic, so the two patches meet at the
  crown at full height, and its comment records that a *mid-slope* peak "lifted
  the helmet's outline by 3 mm over a plain spangenhelm, which is a rung nobody
  can see they bought". The wyrm crest, at five times the price, still lifts
  `0.006 + 0.052 * sin(π · clamp01(v · 0.84 + 0.10))^0.55`. That argument
  saturates at `v ≈ 1.07`, so the sine is **zero at the crown**: the serpent's
  rise peaks low on the flank of the bowl and dies to 6 mm where the animal is
  supposed to arch. The shop text promises "a serpent arched over the crown,
  its head thrown out past the brow" and the geometry delivers a bulge on the
  side of the cap. **FIX: make the wyrm's lift monotonic in `v` like the
  ridge's, at 45–55 mm at the pole, and carry the head 40 mm past the brow
  line so it breaks the outline from the front as well as the side.**
- **At front-on, the 950-gold helm and the 2400-gold helm have the same
  outline.** `art/shots/sil/cards/face-under_helm_front_0_.png` against
  `face-under_mask_front_0_.png`: both are a smooth dome with a small apex nub
  and a curtain falling to the shoulders. Only material and the mask separate
  them, and material is the first thing dusk takes away.

**The instruction for the art pass is not "add more fittings" — it is:
differentiate the BOWL.** Four distinct bowls, each a different object from
every bearing:

1. **Spangenhelm** — four plates with the frame bands standing 8–10 mm proud,
   shallow dome, browband riveted.
2. **Nasal helm** — one-piece, taller, conical, coming to a definite apex;
   nasal 30 mm wide so it survives 3 px.
3. **Ridge helm** — a fore-and-aft comb standing **35–45 mm** above the crown
   for its whole length, so it is 5 px of broken outline at fight distance.
4. **Deep bowl with hinged cheeks** — a rounder skull, cheeks that stand
   *outside* the jaw line and change the head's width.

Then hang the crests off those. Every rung above 200 gold must change the
outline by **≥40 mm somewhere on the crown or the jaw**, or it is not worth
selling.

### Hair (4)

Silhouette: `face-bare_front_0_.png`. Every face card in this audit wears the
Warrior Crop — it is the base dress — and **the outline in that frame is a bare
egg**: the crop is a 7 mm shell and contributes nothing a shaved head does not.
The Shaved option was not shot on its own, and it does not need to be; the
frame that matters is the one showing that the paid-for-nothing default is
indistinguishable from it. See 2(c). **Long Mane (40 g)** is one swept shell with a
hard edge and no volume break at the shoulder. **Braided War-locks (100 g)** is
literally four spheres of falling radius per side with a brass ring under them
(`ball(0.021 - i * 0.0026, 6)` × 4) — a string of beads, not a plait.
**REBUILD the braid** as a twisted section (two interleaved strands, ~35 mm
across) and **REBUILD the crop** as above. Once those two are real, the slot is
worth its prices; today the 100 g option is the weakest thing in it.

### Beards (5)

`art/shots/audit2/cards/beards-*_3_4.png`. Full Beard (40 g) is properly built — five stations, a belly at −180 mm, a
parted moustache — and it is the best-value item in the shop. **Forked (80 g)**
is two cones. **Ringed Braid (120 g)** is four stacked spheres and a ring, the
same rosary trick as the hair. **REBUILD the Ringed Braid**; it is the most
expensive beard and the least made.

~~Check the fork against the profile card: a fork that does not separate in
profile is a beard with a notch.~~ **Struck 13 Aug, because the profile card
cannot answer it and following this instruction would condemn a working fork.**
The tines sit at ±0.40 rad *about the head's axis* — left and right of the
midline — so at −90° they are superimposed and the cut reads as one sliver
whatever it is doing. `art/shots/r2-forked/after-profile/` shows exactly that.
**The panel that shows the notch is the three-quarter** (`after-quarter/`, two
tines with sky between them), and the number that shows it is `beardvolume`'s
`fork` column, which reads the hem by bearing and does not depend on a camera
at all.

**What the profile card DOES answer, and it is not good news.** At 3-4x the
beard's lock pattern closes into concentric loops over the curve of the chin and
the mass reads as **the end grain of a plank**; the tines are glossy and
hard-edged and read as two polished wooden tusks. The substance is correct — it
has been `M.tinted("hair", …)` since the wool came out — so this is the tile
against the chin's curvature, not the old defect returning. **No harness in this
repository can see it**: depth passes, the hem's outline passes, and a beard that
looks like timber clears both. Open, with the frames and the suggested probe, in
`docs/OPEN-DEFECTS.md`.

### Hair Colour (6) and Beard Colour (6) — 12 of the 47 options

Pure hex; they cannot differ in silhouette by construction. From
`hair-colour.png`: Greybeard `0x9c9c9c` and Snow White `0xe8e4da` are
near-indistinguishable — **two paid options selling the same thing. CUT one.**
Norse Gold `0xb8a14e` and Fire Red `0x8a3b22` come back as saturated yellow and
pillar-box red: paint, not hair. **FIX: desaturate both by about half and give
the hair material a shift between root and tip** — a flat albedo is what makes
a colour read as dye. And 12 SKUs at 30–40 gold each for a hex value is not an
honest ladder: **bundle colour with the style, or price colours at 10.**

### Cloaks (5)

The slot with the largest silhouette change available to a player, and the one
with a known defect (it gathers through the tunic).

**`art/shots/audit/cards/cloaks-5._Gilded_War_Cloak_400g_back.png` settles the
Gilded War Cloak: it is a lampshade,** and more precisely than the earlier
reading said. It is a truncated cone of constant taper; its hem is a straight
horizontal circle at the knee; its top edge is a hard horizontal line standing
*above* the shoulders with daylight between the cloth and the mail on both
sides, so the garment hangs off nothing; the folds authored into `surf` do not
survive as shading at this scale; and the colour is a saturated school-bus
yellow whose knit tile reads as basketwork. **REBUILD before anything else in
this slot: shoulders that carry the cloth, a hem that is not a circle, and a
gold that is dirty rather than primary.** Compare the same panel's Traveller's
Cloak (30 g) — the same cone in brown, which reads better only because brown
hides more.

**The structural finding is in §1: the cut is a symmetric cape and it should be
an asymmetric single-shoulder cloak.** Do that once and all five options
improve, because they are one geometry in five colours — which is also the
pricing answer: 90 gold for a recolour of a 30-gold garment is only honest if
the garment is good.

### Armour Finish (7) — up to 510 gold for a tint on two shoulders

`ap.armorColor` feeds exactly one thing: `M.armour(...)`, the mail material. In
`art/shots/audit2/cards/finishes-1._Rough_Iron_0g.png` against
`finishes-4._Bronze_Scales_160g.png`, everything that changes is **the two
shoulders and a sliver of chest** — the shield covers the rest of the torso at
every bearing a player sees. Worse, the tint lands on the *mail*, and:

- the **runekeeper's** torso layer is built `robed ? buff : mail` — leather, not
  mail, so his finish paints almost nothing;
- the **berserker** is `bare` and has **no metal torso layer at all**.

**So two of the four classes can spend 510 gold and get nearly nothing.** That
is the most dishonest price in the shop. Also: "Bronze Scales" and "Crimson
Warplate" name a material change a tint cannot deliver, and Bronze at 160 g
comes back as gold sequins rather than as bronze.

And the ladder is inverted at the top: **Bretwalda Gold at 510 gold
(`finishes-7._Bretwalda_Gold_510g.png`) reads as a flat mustard knit, while
Bronze Scales at 160 (`finishes-4._Bronze_Scales_160g.png`) reads as
glittering metal.** The most expensive finish in the shop looks cheaper than
one at a third the price.

**REBUILD or CUT:** either give the finishes real substance changes (scale
geometry for Bronze, a lacquered plate for Crimson, blued mail for Blackened)
and make each one cover a surface every class actually has, or **rename them to
what they are — dyes and metal polishes — and reprice the whole slot at
20–60 gold.** Nothing in this slot should cost 510 while it is a colour. The
per-class evidence is being shot as `art/shots/finishcls/mat-finish-by-class.png`
— Rough Iron against Bretwalda Gold on all four classes, same mark, same
light. Read it before pricing anything in this slot.

### War Paint (4)

`art/shots/sil/sil-warpaint.png` — four identical silhouettes, which is correct
and expected: paint has no outline. It is the one slot where a colour-only
option is honest. The findings are already recorded above: the four are clearly
distinct bare-headed at portrait range, and **all four are deleted by the
Sutton Hoo mask** — a player who owns Half-Face Shadow (110 g) and the helm
(2400 g) owns nothing he can see. **FIX: build the paint into the skin material
rather than as a lifted patch, and extend it where a helm leaves skin** — the
jaw and throat under a mask, the cheeks under the spectacle plate. Then a paint
survives the helmets that came after it.

### Weapons — never audited before, and the owner is right about the sword

There is no lens in `/shot` that photographs a weapon alone, so these are the
man holding it at kit and fight distance, in silhouette and in material.

- **The sword reads as a cane from in front and as a sword from behind.**
  At −35° (`finishes-1._Rough_Iron_0g.png`) it hangs from a slack arm ~30° off
  vertical and the blade is a dark line of even width with no guard, no pommel
  highlight and no point; from 180°
  (`cloaks-5._Gilded_War_Cloak_400g_back.png`) the same weapon reads correctly,
  lobed pommel and all. So the geometry is fine and **the defect is the rest
  carry plus the value**: at the bearings a player fights from, the blade is a
  dark object against dark ground. **FIX in `anim.ts`: bring the carry up so
  the guard is silhouetted against the tunic rather than against grass, and
  raise the blade's specular so the fuller catches a line.**
- **The Dane axe is the best weapon silhouette in the game and should be the
  reference.** `art/shots/sil/cards/weapons-berserker_3_4.png` — the bearded
  crescent on the long haft is unmistakable with the material off. The same
  weapon at −90° (`weapons-berserker_profile.png`) is a bare stick, because
  the head's wedge is 40 mm edge-on. That is acceptable for an axe; it is what
  every other weapon should be measured against.
- **The shield is the whole man.** At fight distance the huscarl reads as a
  shield with legs; the helmet he paid 950 gold for is 20 px behind it.
  Edge-on (`weapons-huscarl_profile.png`) the shield is a **flat plank with
  square ends** — 760 mm across and 30 mm of crest. **FIX: dish the board**
  (60–80 mm of curvature) so its edge-on read is a curve, and pull the rest
  carry back onto the hip so the torso is visible from the front.
- **The spear head is a needle** (`weapons-warden_profile.png`) — at 7.9 mm a
  pixel, a leaf blade needs to be ~60 mm wide to read as a blade at all.
- **The fist does not close on the haft**: in the same frame the hand is a
  mitten in front of the shaft rather than around it.
- The shield's painted quarters still read as **wickerwork** at kit distance —
  the wood grain tiles at about 60 mm on a 105 mm plank.

## 4. Ranked, worst first

1. **The default kit reads Roman.** `art/shots/sil/cards/weapons-huscarl_profile.png`,
   `weapons-warden_profile.png`. Skirt, bare legs, symmetric cape, banded
   plate. Outranks everything else in this document.
2. **The face is not the face that was built, on any phone.**
   `art/shots/audit/helm-cards.png` panel 1; `LOD.medium` at 30×30 against the
   44 rows the file's own Nyquist note requires.
3. **The armoury preview renders with no materials, no env map and a 1.1
   ambient.** `CharacterPreview.tsx`. This is the screen the owner judged, and
   it is showing worse than the game has.
   **DONE.** The rendering moved to `src/game/client/armouryStage.ts`: the real
   texture and material libraries, the real sky and therefore the real PMREM,
   `summary.ts`'s key/rim/fill with the key casting, ground and a contact
   shadow, and the game's own `createWarriorRig`/`poseWarrior`. The mannequin
   is built at `high` whatever the device tier is — see §2(a); there is one man
   on this screen and six of the eight slots sell something on his face.
   Frames: `art/ui/armdiag-{phone,desktop}.png`,
   `armsutton-*`, `armcloak-*`, `armfight-*`. Re-shoot with
   `npm run armoury -- --tab CLOAKS --lens "FIGHT RANGE"`, which prints the
   stage's own frame/thumbnail counters — a WebGL panel cannot be judged alive
   by photographing it.
4. **Seven of ten helmets are one bowl, and at fight distance those seven —
   2110 gold of the ladder — are the same 20 px grey dome.**
   `art/shots/audit/helm-fight.png`. Includes the 950-gold Wyrm-Crest, whose
   arch is mathematically flattened at the crown (see §3).
5. **Armour Finish sells up to 510 gold of colour that two classes cannot
   wear.** `art/shots/audit2/cards/finishes-1._Rough_Iron_0g.png` vs
   `finishes-4._Bronze_Scales_160g.png`.
6. **The Gilded War Cloak (400 g) is a lampshade.**
   `art/shots/audit/cards/cloaks-5._Gilded_War_Cloak_400g_back.png`.
7. **The sword reads as a cane and the shield as a plank.**
   `finishes-1._Rough_Iron_0g.png`, `weapons-huscarl_profile.png`.
8. **Jarl's Crowned Helm (570 g) has less geometry than Boar-Crest (380 g).**
   `HELM` table.
9. **Braided War-locks (100 g) and Ringed Braid (120 g) are strings of
   spheres.** `characters.ts`, the `ball(...)` loops.
10. **Two paid hair/beard colours are the same colour** (Greybeard, Snow White).
11. **War paint dies under the shop's most expensive helmet.**
    `art/shots/sil/sil-warpaint.png` and the earlier `warpaint.png` reading.

## 5. Cut, reprice, rebuild — the list

**CUT:** Snow White (hair and beard, or Greybeard — one of the pair);
"Bronze Scales" and "Crimson Warplate" as *names*, unless they get geometry.

**REPRICE:** Nasal Helm 110 → 50. Jarl's Crowned 570 → below Boar-Crest, or
rebuild it upward. Wyrm-Crest 950 → ~400 until its serpent breaks the outline.
Shadow Hood 120 → 200, because it is the only bought silhouette below 2400.
Every Armour Finish → 20–60 while it remains a tint. Hair and beard colours →
10, or bundled.

**REBUILD:** four distinct helmet bowls; the wyrm's crest lift, monotonic in
`v` the way the ridge's already is; the ridge comb at 35–45 mm; the spectacle
brow plate; the braid (hair and beard) as a twisted section; the Warrior Crop's
volume and hairline; the cloak as an asymmetric single-shoulder garment; the
Gilded War Cloak's shoulders and hem; the warden's lamellar as a mail byrnie;
the trousers and leg wraps so they break the silhouette; the shield's dish; the
sword's rest carry.

**The one rung that is right:** the Boar-Crest at 380 gold.
`art/shots/sil/sil-helm.png` panel 7 is the only crest below Sutton Hoo that
survives with the material off — 102 mm of animal along the crown, standing
clear of the bowl. It is what every rung above it should have been, and it is
cheaper than two helmets that read as less.

## 6. Two defects in the instrument, found while using it

- **The face card's aim is only correct near −35°.** At `turn=0` and `turn=-45`
  the head sits ~120 mm right of frame centre and the shoulder is clipped at
  the right edge (`art/shots/sil/cards/face-bare_front_0_.png`,
  `face-bare_3_4_45_.png`). `AIM.head.right` is over-corrected; re-measure it
  with `--guides` at 0° and at −90° rather than at the three-quarter alone.
- **There is no weapon lens.** `CARDS` has face, kit and fight; a sword at kit
  distance is ~200 px of a 700 px frame and a weapon cannot be judged alone at
  all. Add a `weaponcard` — 0.35 m of frame at the fist, and a stage that
  builds `buildWeaponForClass` on an empty mark.

---

# Gate pass on the unmerged wave — 2026-08-06

The first time this branch has been gated. A container killed the ship phase of
the wave four times; what follows is what a first look at it found. **The wave
was held, not merged.** The reasons are below, and every one of them has a
frame behind it.

Captures: `art/shots/fix1/` (`helm-cards.png`, `head-turn.png`, `hair.png`,
`beards.png`, `warpaint.png`, and `cards/` per item), `art/ui/armourycard-{phone,desktop}.png`,
`art/shots/lock/{right,left}-handed{,-close}.png`.

## What this wave CLOSED

- **The reticle reads the drawn man, not the wire.** Proven twice, two ways.
  `touchtest`: every one of 31 qualifying samples painted off the rig, 0 off the
  wire, while the wire sat a median 153 px and up to 227 px ahead of him.
  `lockshot`: right-handed −7 px / 0.63 m, left-handed −43 px / 1.53 m of lead
  *avoided*. This is the wave's one unambiguous success.
- **The mark is quiet enough to live on the glass.** Two hairline brackets on
  the chest and a thin ground ellipse — no glow, no fill. It reads at 390x844 in
  both hands and takes no bite out of the button side (7267 sampled points, both
  handednesses).
- **The Shadow Hood no longer shears through the skull.** Closed in this gate
  pass, not by the wave — see below.
- **`profiletest` against a real database is 68/68, not 22/22.** The 22 that
  earlier reports quoted is the no-database subset. The mute column, the
  bindings and the recovery path are all now actually exercised.

## What this wave BROKE, and it is the reason for the hold

The head rebuild added a face block — a large forward displacement carrying the
maxilla and mandible. Nothing that is *worn* was taught about it. `headWear`
stands every shell (hair, beard, war paint, helm bowl, hood) off the skin along
`faceNormal`, which is the normal of the **undisplaced ellipsoid**.

`tools/wearmeasure.mjs` (new) measures the error over 32 heads:

    whole head   mean    11.4 deg
    whole head   worst   90.0 deg
    helm band    mean    11.8 deg
    helm band    worst   71.6 deg
    a 6.0 mm lift clears 0.00 mm at the worst point

`faceNormalTrue` fixes the direction and every worn item moved for it (panel
pixel-diff, before vs after: Hood 3.5%, Spectacle 4.0%, Boar 4.0%, Jarl 3.8%,
Wyrm 6.6%, Sutton Hoo 3.1%, bare head 0.18%). **It fixed the Shadow Hood and it
did not fix helms 6–9.**

**Still open, and precisely located.** On Spectacle (280 g), Boar-Crest (380 g),
Jarl's Crowned (570 g) and Wyrm-Crest (950 g) the cheek guard is a slab with
razor-straight edges standing proud of the face, with skin punching back through
it — `art/shots/fix1/cards/helmcards-7._Boar-Crest_Helm_380g.png`. The edges are
straight because the patch's domain is a **rectangle in (u, v)** and its outline
is never shaped; the slab floats because the standoff is tens of millimetres.
The Sutton Hoo mask is the one that works and it is the template: it shapes its
lower edge with `maskBot(u)` and it was re-tuned from 29/22.5 mm down to
20.5/15. Do the same for the four guards. **2110 gold of the ladder is currently
broken geometry.**

## What has still never been good enough

- **Hair — captured for the first time, and it fails.** `hair.png`. From behind,
  Long Mane (40 g) is **two detached brown slabs with a gap between them** — not
  hair, broken geometry. Warrior Crop and Braided War-locks are the same cap plus
  a string. **Under the Sutton Hoo mask all four are pixel-identical**, so 100 g
  of Braided War-locks buys exactly what Shaved buys.
- **Beards — three of five are one shape.** `beards.png`. Full (40 g), Forked
  (80 g) and Ringed Braid (120 g) are the same dark crescent at three-quarter.
  All three are a hard-edged solid shell clamped on the jaw like a chinstrap,
  leaving bare skin at the chin — hair does not grow out of skin anywhere here.
- **War paint — reads bare, dies under the mask.** `warpaint.png`. The four are
  genuinely distinguishable bare-headed (Half-Face Shadow is the strongest), and
  **all four are pixel-identical under the Sutton Hoo mask**. Audit finding 11
  is confirmed, not closed.
- **The face is not a man.** See `docs/OPEN-DEFECTS.md`. The nose still leads the
  profile, the chin still recedes behind the lip, the neck is still narrower than
  the jaw with a hard step at the collar, the ear is still a flat oval decal, and
  the domino mask over the mid-face is still there. Character Craft is a 4.

## The instrument gained one, and it still has a hole

`tools/wearmeasure.mjs` joins `headmeasure.mjs`. What is still missing is the
thing that would have caught all of the above automatically: **no harness
renders a cosmetic and asserts anything about it.** Twelve sheets are defined in
`tools/shoot.mjs` (`hair`, `hairfight`, `hairtone`, `beards`, `beardfight`,
`beardtone`, `cloaks`, `cloakfight`, `finishes`, `finishfight`, `warpaint`,
`warpaintfight`) and before this pass **not one had ever been run** — only the
helm and head sheets existed on disk. Cloaks (5), Armour Finish (7) and both
colour ladders (12) remain uncaptured to this hour.

The cheapest real gate: render each sheet and assert that adjacent panels differ
by more than N% of pixels. Long Mane vs Warrior Crop under the mask would score
zero and the harness would have said so without anyone looking.

---

# The helm wave — 2026-08-06

Scope: the helmet slot only. The face, the hair and the beards are somebody
else's pass and are untouched here.

## The fault was never the lift direction

The wave before this one diagnosed the four broken helms as a lift-direction
error, built `faceNormalTrue` to fix it, and **the four stayed broken**. That is
recorded above as an open item and it was the right place to start, because the
reason is arithmetic and it is worth stating once:

> Offsetting a surface along its own normal by more than its radius of curvature
> **turns the surface inside out**. Past that distance the offset self-intersects,
> its facets face backwards, backface culling removes them, and what the player
> sees through the hole is the head.

The brow ridge has a radius of curvature of about 15 mm. The spectacle plate
stood off it by 18 and the nasal's rivet plate by 26. **Neither could ever have
worked, at any lift direction.** No amount of correcting *where* the metal was
pushed could help, because the fault was *how far*.

## The instrument first, because the last four passes argued from opinion

`tools/wearmeasure.mjs` used to measure the angle between `faceNormal` and the
true normal. That number is a property of the HEAD — 11.4° mean whatever the
helmets do — so it could name the bug and could never hold a helmet. It is kept,
demoted to a diagnosis, and the gate is now `helmFitProbe`.

`headWear`/`helmWear` record the spec of every shell they are asked for.
`helmFitProbe` builds each helmet through the real `buildCharacter` on real
heads and walks those specs for four numbers per shell:

| | what it is | bar |
|---|---|---|
| **fold** | share of the sheet turned inside out | 0% |
| **thru** | how far the skin gets outside the metal | 0.5 mm |
| **seat** | the *smallest* standoff — where the plate lands | 28 mm |
| **float** | the *largest* standoff, face furniture only | 34 mm |

Nothing in it mirrors a helmet definition. It reads the arguments the build
actually passes, so it cannot drift the way the lineup sheet did.

**It reproduced this document's own ruling with no opinion in it.** Baseline:
nasal plate 32% inverted, brow plate 17%, both cheek guards 6–11%, and the one
deep guard that measured clean was the Sutton Hoo's — which is exactly the panel
§3 passes and names as the template.

`tools/silhouette.mjs` gained the second gate this file asked for by name: every
adjacent pair of panels on a helm sheet is compared as a Jaccard distance of the
ink, and a pair under the bar fails the run.

## What changed in the geometry

1. **The helm tier is beaten over a FORM.** Every helm shell now rides a
   low-passed copy of the head instead of the skin itself. The features go; the
   skull, the class's dome, the per-warrior breadth and the jaw all stay, because
   those are 60–200 mm shapes and the filter is an 11 mm one. Nothing on the form
   has a radius of curvature under about 45 mm, so a 30 mm standoff cannot fold
   it. The Sutton Hoo mask has done this since it was built and is the one piece
   §3 passes; this generalises its trick to the tier. The filter runs once per
   skull on a grid — 2701 field samples against the head's own 1200 — rather than
   17 per vertex the way the mask does it.
2. **Four bowl profiles**, which is the axis the ladder did not have. `shallow`
   for the spangenhelm, `cone` for the nasal helm (one piece, so no ribs, and a
   finial), `round` for the Vendel bowls, `tall` for the noble rungs.
3. **Both crests were needles.** Each was a strip spanning a fixed span of
   AZIMUTH, and azimuthal width collapses to nothing at the pole — so an 11 mm
   comb at the brow was 0 mm across at the crown while still carrying its full
   height. A quarter of the wyrm's measured inverted. Both are swept in the
   sagittal plane now as half-tubes of constant width: the ridge helm gets the
   40 mm comb §3 asks for along its whole length, and the wyrm gets 52 mm at the
   crown, monotonic from both ends, with its head thrown 30 mm past the brow.
4. **The plates are cut, not clipped.** The spectacle plate is an arch over each
   eye feathered into the band and the nasal; the nasal's rivet plate is a
   lozenge at 19–22 mm; both cheek guards are cut to the jaw the way `maskBot(u)`
   cuts the mask.
5. **Both cheek guards covered the far eye**, because they began at 0.42 and 0.50
   rad and the outer canthus is at 0.53. That, and not the standoff, is most of
   what "a slab across the face" was. They start at 0.56 now and their top edge
   is cut away below the eye line at the front.
6. **The Jarl's Crown**, whose finding was a pricing one with a geometry cause:
   the tall bowl, the nape flange back, and eight alternating leaves in place of
   six identical pins.
7. **The boar is seated on the bowl**, not at a height above the skull. The new
   ladder test caught this within a minute of existing: the deeper `round` bowl
   swallowed the animal and 6→7 fell to 0.8%.

## The numbers

Adjacent-rung outline difference, three-quarter −35°, silhouette only, measured
over the helmet — the top 40% of the frame taken down from the higher of the two
apexes. **The window is not a convenience.** Every panel is the same man in the
same mail at the same mark with only his head changed, so counting his shoulders
puts a large constant in the denominator and nothing in the numerator, and the
same change of shape then scores differently depending on how much torso the
lens included. Whole-frame, this instrument read the Spectacle against the
Boar-Crest at 1.7% while one of them has a boar standing on its crown.

| rungs | before | after |
|---|---|---|
| Bare 0 → Iron 30 | 8.3% | 8.2% |
| **Iron 30 → Nasal 110** | **0.0%** | **13.2%** |
| Nasal 110 → Hood 120 | 11.4% | 10.7% |
| Hood 120 → Ridge 190 | 10.7% | 14.0% |
| Ridge 190 → Spectacle 280 | 8.0% | 12.6% |
| Spectacle 280 → Boar 380 | 4.2% | 5.1% |
| Boar 380 → Crowned 570 | 5.1% | 6.2% |
| Crowned 570 → Wyrm 950 | 15.4% | 15.4% |
| Wyrm 950 → Sutton Hoo 2400 | 11.7% | 18.7% |

**`0.0%` between the 30-gold helm and the 110-gold helm is this document's
finding stated as a measurement**: two helmets with the same outline, 80 gold
apart, and the one thing on this table nobody can argue with. The rest is a
smaller and more honest story than the whole-frame numbers made it look — four
pairs improve substantially, one holds exactly, and two barely move.

**The two that barely move are the ones to send back next.** Spectacle → Boar at
5.1% and Boar → Crowned at 6.2% are the tightest steps in the ladder and both
sit in the middle of the price range, where a player is most likely to be
choosing between them. They pass a 4% bar; they do not pass a look.

At fight distance (6.8 m, ~35 px of head, window 16%): 16.4 / 7.6 / 15.9 / 17.6
/ 11.2 / 5.7 / 4.1 / 13.9 / 14.8 — every rung over the bar, and the same two
pairs at the bottom of it.

Fit, all ten rungs on 4 classes × 2 seeds = 80 builds:

    [wear] helm         shells  fold%   thru mm   seat mm  float mm
    [wear] iron            6     0.0      0.0      24.4      24.0
    [wear] nasal           3     0.0      0.0      19.0      24.0
    [wear] ridge           7     0.0      0.0      23.0      24.0
    [wear] spectacle      11     0.0      0.0      23.0      25.0
    [wear] boar           11     0.0      0.0      23.0      25.0
    [wear] crowned        11     0.0      0.0      23.0      25.0
    [wear] wyrm           11     0.0      0.0      23.0      29.0
    [wear] suttonhoo      10     0.0      0.0      27.0      31.0
    [wear] PASS: 10/10 helmets seated

## What this wave did NOT close

- **The pricing rulings in §5 are geometry now, not prices.** The Nasal Helm has
  a bowl of its own, the Jarl's Crown has more geometry than the Boar-Crest, and
  the Wyrm-Crest's serpent breaks the outline — so the reprice list is stale
  where it says "until". Nobody has re-argued the numbers themselves.
- **The Shadow Hood is still underpriced at 120** and still the only bought
  silhouette under the top rung that costs nothing to make.
- **Hair, beards, war paint, cloaks and the armour finishes are untouched.** The
  ladder gate is built and only the three helm sheets declare a bar; wiring the
  other slots to it is the cheapest next pass in this file.

---

# The cloak and beard wave — 2026-08-06

Scope: the cloak slot, the beard slot, and the prices of everything that is
still a colour after this pass. The helmets are the wave above. The face, the
head and the ear are somebody else's pass and are untouched here.

**This is the first wave in this file whose findings were not found by eye.**
`npm run cosmetictest` existed before it started and had already failed on
exactly these three things, and the same command is what says they are fixed.
Nothing below is an impression.

## What the instrument said, before

    15/18 checks passed

    FAIL  no two options in a shape slot are the same object, adjacent or not — 7 twins
    FAIL  no two adjacent shape options are the same object (20 pairs) — 4 identical
    FAIL  every shape pair that reads at portrait still reads at fight distance — 6/20 below 1%

Three assertions, and between them one sentence: **four cloaks were one cloak,
two beards were one beard, and three more beards did not read in play.**

| pair | before | what it was |
|---|---|---|
| Traveller's 30g → Blood Red 90g | **0.00%** | one mesh |
| Blood Red 90g → Sea-Wolf 90g | **0.00%** | one mesh |
| Sea-Wolf 90g → Gilded War 400g | **0.00%** | one mesh |
| Clean Shaven 0g → Stubble 0g | **0.00%** | one mesh |
| Full 40g → Forked 80g | 0.57% at fight | under the bar |
| Forked 80g → Ringed Braid 120g | 0.87% at fight | under the bar |

0.00% is not "similar". It is silhouette AND form agreeing to the last pixel
from every lens and every bearing, on a rasteriser that reports 0.00% for a
subject against itself and 20.6% for a bare head against a 30-gold helm.

## The cloak: the clasp and the cloth had never agreed

The structural finding is §1's and it was right. The sheet spanned **±0.56π
symmetrically about the spine** — a cape over both shoulders, a Roman
paludamentum — while the brooch was pinned to one shoulder at
`-S.shoulderX * 0.72`. Two garments in one object, and neither of them Saxon.

Every cut is asymmetric now (`CLOAK_CUTS` in `characters.ts`):

- It comes over the **pinned shoulder** — negative azimuth, which is where the
  brooch already sat and which is the shield side, `armPivots[1]`.
- It crosses the back on a **falling top edge**, because across the back there
  is nothing holding it up. The old top edge was a hard horizontal line standing
  *above* both shoulders with daylight under it, which is the audit's own
  reading of the Gilded War Cloak and was true of all four.
- It stops at `a1 ≤ 0.40π` against the old 0.56π, so the **sword arm is
  strictly clearer of cloth than it was**. `armPivots[0]` is the weapon arm and
  `anim.ts` hangs the weapon on it; that is checked, not assumed.

Then four names got four garments. They differ in what survives 7.9 mm to a
pixel — **length, hem, wrap, flare, fold count and fastening** — and colour is
now the last item on that list instead of the only one:

| | length | hem | wrap | flare | folds | pinned with |
|---|---|---|---|---|---|---|
| Traveller's 30g | hip | shallow arc | narrowest | 62 mm | 5 | a bone pin |
| Blood Red 90g | knee | level | full | 135 mm | 5.5 | a disc brooch |
| Sea-Wolf 90g | mid-calf | a deep point | narrow | 38 mm | 3.4 | a ring-and-pin |
| Gilded War 400g | ankle, **trained** | longest at the trailing corner | widest | 205 mm | 7 | a bossed gilt disc |

The two 90-gold rungs are deliberately opposite garments at one price: a bell
with a level hem against a column with a tail. A player choosing between them is
choosing a shape.

## The beards: three of them were hanging inside the man

The three paid beards were rebuilt for mass and length — a wedge, a wedge with a
notch cut out of the bottom of it, and a rope reaching twice as far. That got
Full → Forked from 0.57% to 1.47% and stopped there, and **Forked → Ringed
Braid would not move off 1.00% however much plait was added to it.** Adding
48 mm of beard changed the measurement by zero.

The reason is the wave's most useful finding and it is not about beards:

> Every hanging mass fell straight down at **z = 0.024–0.040** in the head's
> frame. The torso's front surface is at **z = 0.104**, and the mail over it is
> further out again. **The bottom third of every paid beard in the shop was
> inside the body**, drawn and then thrown away by the depth buffer.

So what the eye and the instrument were both comparing was only the part of each
beard that cleared the collarbone, which is the part all three have in common.
That is most of why three beards measured as one crescent, and no amount of
sculpting below the chin could ever have shown. Every station now carries
forward as it falls: a beard that reaches the chest rests **on** it.

`Stubble` was a separate fault with the same shape. The whole beard block was
gated `ap.beardStyle !== "short"`, so the `full ? … : …` branches written for
stubble were **dead code that had never once been reached** — the option had no
geometry at all and the note above it describing a 1.2 mm shell described
something that did not exist. It is built now at 11 mm, and renamed **Close
Crop**, because "Stubble" names a shadow and this is a beard. Id, value and its
free price are unchanged, so nothing stored moves.

## Prices

The rule applied: **where this wave made an item genuinely distinct, its price
stands; where an item is still a colour, it is priced as a colour.**

**HELD — cloaks 30/90/90/400 and beards 40/80/120.** They are four cuts and
three masses now, and the ladder buys outline. The Gilded War Cloak keeps 400
because it is the largest garment in the game and the biggest silhouette change
a player can buy below the Sutton Hoo helm — which is the one thing a cloak can
do that a helmet cannot, at a range where a helmet crest is two pixels and a
cloak is fifty.

**REPRICED — Armour Finish, 1050 gold of ladder down to 250.** Three
measurements, no opinion: every adjacent rung reads 0.00% silhouette and 0.00%
form; `ap.armorColor` feeds exactly one thing, `M.armour(...)`; and two of the
four classes have no mail torso layer to tint at all, because the runekeeper's
is `robed ? buff : mail` and the berserker's is `bare`. Bretwalda Gold at 510
was four to six winning matches for a hex value half the roster cannot see. The
slot is a rack of dyes and polishes and is now priced as one, 20–60. If somebody
later gives them real substance on a surface every class has, the ladder can be
re-argued upward with a frame behind it.

**REPRICED — hair and beard colour, 30–40 a rung down to 10.** Twelve SKUs of
pure hex were carrying 210 gold. §5 asked for exactly this.

Ids are unchanged throughout, so **no profile is stranded and nobody loses what
they already bought** — a price only ever applies to a purchase not yet made.

**Also fixed: the stale pricing comment above `ARMOURY`**, which this file flags
twice. It still reasoned from "call it 200–260 a match"; measurement says a
winning best-of-3 pays 90–135, and every price is now read against that.

## What this wave did NOT close

- **War paint still dies under the Sutton Hoo mask.** The gate reports it
  correctly as a shop finding rather than a render defect — 110 gold of
  Half-Face Shadow under 2400 gold of helm — and the fix §3 names is to build
  the paint into the skin where a helm leaves it showing. That is complexion
  field work and belongs to the head owner.
- **The Shadow Hood is still underpriced at 120**, and the helm wave's note that
  §5's reprice list is stale where it says "until" still stands.
- **Hair (4) and the Warrior Crop's volume are untouched.** The crop is still a
  7 mm shell and `Warrior Crop under every helm` still reads 0.00–0.06%: a free
  hairstyle that vanishes under a bowl. Reported by the gate, not gated, because
  nobody paid for it — but it is the cheapest remaining thing in this file.
