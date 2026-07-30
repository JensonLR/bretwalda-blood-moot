# Open defects

Findings that are diagnosed but not yet fixed, carried here so they survive
between iterations. Delete an entry when a capture proves it gone — not when a
change is made.

Judged against `docs/VISUAL-BAR.md`. Captures live in `art/shots/`.

---

## Face feature placement — the real cause of the "long neck"

Measured off the built mesh, not estimated:

| Landmark | This model | Human canon |
|---|---|---|
| Eye line, above chin | **60%** of head height | 50% |
| Mouth | **39%** | ~22% |
| Nose tip | 56% | ~33% |

The lower face is roughly 35 mm too long and the cranium too short. Under a helm
that covers the forehead, this makes every warrior read chin-up with maximum
throat exposed — which is what the owner has twice reported as heads looking
"floating" and "a little small". The neck geometry itself has been fixed
(submandibular mass added, exposed throat brought from 0.43 to 0.30 of head
height against a life value of 0.38); this is what remains.

Fixing it means moving ~15 coupled `v` constants together in
`src/game/client/characters.ts`: the brows, the socket/brow/nose/mouth gaussians
in `faceSurface`, the beard's cheek line, the helm brow band, the spectacle
plate, the cheek guards, and the war paint. Deliberate work that needs captures
between steps — it was correctly judged too risky to bundle into a neck pass
that must not regress the faces.

## Shield is mounted at the wrong point on the arm

`src/game/client/render/anim.ts:207` mounts the shield on `leftArm` at
`(-0.14, -0.4, 0.26)`. That puts the fist **260 mm above the boss** — gripping a
centre-grip shield near its bottom edge — and hangs the disc outboard, which is
what throws it against the frame edge in `lineup.png`. The shield geometry
itself was rebuilt (radius 0.44 → 0.38, paint cut per plank rather than a flat
disc through domed boards, hide facing behind the seams); the mount was not,
because it lives in a file the geometry owner did not hold.

## Skeleton landmarks disagree with life

`shoulderY` is 0.769 of stature against a real acromion at 0.818, and
`upperArm`/`foreArm` are each about 12% short. The errors cancel at the wrist so
the hands land correctly, but the trapezius ramp is steeper than life, and every
shield and weapon offset in `anim.ts` is tuned against the low shoulder — so
this cannot be corrected without re-tuning those together.

## Smaller, confirmed

- The berserker's fur ruff is a superellipse slab with pointed corners at the
  shoulder line.
- The baldric's five segments show faceting between them at close range.

---

## Root causes worth remembering

Recorded because each took real effort to find and each was something other
than what it looked like:

- **The berserker's "detached helm with a white blob" was the axe.**
  `STANCE.berserker.rest = -1.78` against `GRIP_PITCH = 1.28` laid the haft
  0.5 rad off vertical, putting a 256 mm steel crescent at y = 1.89 — the middle
  of the skull — where it read as a second bowl, blown to 250 luma against the
  sky.
- **The ground "glitter" was specular, not albedo.** The wet/puddle mask was
  gated on the full height field, which carries fine noise at ×5 and ×9, so
  wetness bled onto dry ground at texel frequency and clipped through the post
  chain. The give-away: specks took the *sky's* colour on cool ground and the
  *fire's* on warm ground, sat on the crowns of the relief, and carried chroma
  fringing.
- **The neck's `capTop` disc was a lit horizontal plate** 126 mm across standing
  proud of the jaw on every side — visible as a pale ellipse under the huscarl's
  coif.
- **Standing water read as a hole in the world** because a near-black dielectric
  at `metalness 0.02` returns F0 ≈ 0.04, so from the near-vertical angle a
  gameplay camera actually uses, ~96% of the pixel is the black diffuse term.
  The PMREM only pays out at grazing incidence.
- **Every "mid-swing" capture was a rest pose.** `readSwing` only set
  `swingLive` when it saw `attackTimer` decrease across two frames, and a
  capture holds it constant — so animation was reviewed for weeks against poses
  that were never the ones requested.

---

## Second panel (independent, on v4/v5) — refined traces

A second three-critic panel scored FAIL on all lenses, with frame cleanliness
and animation weight at 2/10. Where it disagreed with or sharpened the first
panel's diagnosis, its trace is recorded here.

**The orange square is the bonfire flame, not a damage number.** Traced to
`materials.ts:137` `bonfireFlame` — no surface, no alpha — applied to a bare
`PlaneGeometry` at `world.ts:1928`. The first panel attributed it to an
untextured HUD damage number; that was wrong, and a fix aimed at `hud3d.ts`
would have left it in the frame.

**Only the player casts a shadow.** `lighting.ts:341` sizes a single ortho box
at `half <= shadowDistance` (24 m, `quality.ts:72`), and `trackShadow()`
re-centres it on the duellists every frame — so the palisade, both halls, the
hero tree and the hay bales all fall outside the cascade every frame. Not a
tuning problem: static geometry is never inside the box.

**portrait/stance fail the tonal floor on highlight structure, not black
level.** The panel mirrored the harness metric exactly (160x90 downsample,
unweighted `(r+g+b)/3`, bucket counts only above `n*0.002` = 28.8 px) and
reproduced the shipped numbers to within 0.1 luma. Buckets 2-3 hold 79% of
portrait and 77% of stance; buckets 7-10 are populated but under threshold.
Nothing above code ~112 occupies even 0.2% of the frame. So the fix is
highlight structure on the subject, not lifting the shadows.

**Chromatic aberration is a defect, not a flourish.** ~2 px red/cyan fringing on
every foliage silhouette (`postfx.ts:554`), rising to ~6 px in laststand
(`postfx.ts:676`).

**Sub-pixel rim strips stipple.** 1 px red speckle along the cloak hem, spear
edge and sword edge, from rim geometry thinner than a pixel at
`characters.ts:557-559`.

**Cloaks have no cloth behaviour at all** — rigid flat triangles projecting
sideways with zero drape, zero lag behind motion, zero gravity, no secondary
motion. Named as the clearest single tell that the animation is not simulating
anything.

**The nose is not modelled.** The helm's nasal substitutes for it. The beard is
a flat waffle-textured panel with a hard rectangular silhouette. Eyes are dark
almond patches with no socket, lid or brow. The head is a rounded box with hard
vertical corner edges at the temples.

**Apparent proportion reads 8.5-9 heads**, not the 7.4 the skeleton computes,
with no pelvis mass — consistent with the face-placement entry above.

**Two nameplate visual languages** ship simultaneously: white/white and
gold/yellow, at a 1.8x scale difference.

---

## Process defect — overlapping captures corrupt the A/B reference

Two workflows ran concurrently and both wrote to `art/shots/`. One re-captured
into `v4` *with newer code*, destroying the reference the other was scoring
against. Any A/B taken across that window compares two different builds while
claiming to compare one change.

Captures are a shared, mutable resource. Only one capture may run at a time, and
a directory that has been scored must be treated as immutable — write a new
version rather than refreshing an old one.
