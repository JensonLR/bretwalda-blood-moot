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

The pattern in all three: **what a player buys is priced on the portrait and
worn at fight distance, under a helmet.** Both sheets exist for every slot now,
and the gap between them is the thing to look at.
