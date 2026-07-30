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
