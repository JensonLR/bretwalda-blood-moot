# The Sutton Hoo helm

The owner asked for the helmet range to be deepened, and for the most expensive
piece in the game to be *"the Sutton Hoo Anglo-Saxon helmet, the famous one."*
He supplied a reference: a badge from another of his games, built around the
same helm.

This is the right instinct for this game specifically. Sutton Hoo is the single
most recognisable object of the Anglo-Saxon world, it was pulled out of a
Suffolk ship burial belonging to a man who was very probably a king, and
"Bretwalda" is the title those kings were given. The most expensive thing a
player can buy should be the thing the game is named after.

The artefact is 7th century and long out of copyright. What follows describes
the real object; the reference badge is the owner's own stylisation of it and
informs the palette, not the geometry.

---

## What the object actually looks like

An iron cap faced with **tinned bronze** panels — bright, close to silver, not
warm — worked with stamped interlace and small figural scenes, and dressed with
**gilded bronze** fittings and **garnet** inlay. Four features carry the whole
silhouette and every one of them has to be present or it stops being this helm:

1. **A full face mask.** Not a nasal bar, not a spectacle guard — a solid face
   with two eye openings. This is what makes it read from any distance, and no
   other helmet in the game has it.
2. **Gilded eyebrows above the eye openings.** Thick, tapering, each ending in
   a small gilded boar's head, and each set with a line of garnet along its
   length. In the reference badge these read as the two heavy gold arcs.
3. **The nose-and-moustache piece.** A gilded nose with a broad drooping
   moustache under it. The famous trick of the object: nose, moustache and
   eyebrows together read as a **bird in flight** — moustache as the tail, nose
   as the body, eyebrows as the wings — and the nose plus the eyebrows read as
   a **dragon's head** the other way up. Do not flatten this into a plain nasal.
4. **A crest running front to back** over the crown of the cap, terminating at
   the brow where it meets the bird's tail.

Then the parts that finish it: **deep hinged cheek guards** either side of the
mask, and a **neck guard** at the back. The overall read is a man with no face
— a mask, not a helmet with a gap in it.

## Palette

From the reference badge, which is the owner's own direction:

- **Tinned silver** for the mask field and the cap panels. Cool, slightly
  desaturated, not chrome and not white.
- **Gilded gold** for every fitting: eyebrows, nose, moustache, crest, panel
  edging, rivets.
- **Garnet red** for the inlay — deep, dark, glassy rather than plastic. Under
  the arena's firelight this is the colour that will do the most work.
- **Black voids** at the eye openings. `characters.ts` already carries a note
  that an empty helmet is the loudest defect a character can have, and this
  helm has the largest openings of any in the set — so the eye treatment
  matters here more than anywhere.

The badge also shows a crown, an interlace border ring and garnet cabochons.
Those belong to the badge, not to the artefact, and should **not** go on the
helmet — the game already has a `crowned` helm and this must not become a
second one. The interlace and the garnets do belong on the **UI**, where that
whole palette is a much better fit than what the screens use now.

## In the game

- **The most expensive helmet in the shop**, above `helm_crowned` at 570. Set
  it so it reads as a goal across a run of matches rather than an afternoon —
  check it against what `endMatch` actually pays out before fixing the number,
  and against the round changes landing at the same time, which alter how much
  a match is worth.
- **The range beneath it needs deepening too.** Six helmets today
  (`none`, `iron`, `nasal`, `hood`, `spectacle`, `crowned`) is a thin ladder to
  climb, and the gap from 280 to 570 to whatever this costs is most of the
  game's progression. Add pieces that are visibly different in silhouette, not
  recolours — the lineup capture is the test.
- **It must survive being cut off.** `characters.ts` now supports severance,
  and a head that comes off keeps its helm. A face mask, cheek guards and a
  crest all have to travel with the head, and the neck seam runs right where
  the neck guard sits. This is the one new failure mode this helmet has that
  none of the others did — the gore captures are how it gets checked.
- **Zero new binary assets.** Everything procedural, like every other texture
  and mesh in this game. The interlace and the stamped panels are pattern work
  in code, the same way the shield faces and the mail already are.
- **It is worn by a head that has to fit it.** The face geometry is sampled off
  a per-warrior seed; `characters.ts` carries a long comment about a helm ending
  up cut for a brow 30 mm from where the brow actually is. A full face mask has
  less tolerance for that than an open helm, not more.
