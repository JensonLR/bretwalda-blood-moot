# The four peoples

Lifted into the repository on 12 Aug 2026 from the owner's two Claude artifacts —
"Bretwalda — Four Peoples, c. 878" and "Faction Select — Britain, c. 878" —
because the content was good, it was the faction scope `BACKLOG.md` 4.3 asks for,
and **it was living somewhere the code cannot see it**. An artifact is a place to
think; it is not a place a decision should be stored. This file is the decision.

It also **supersedes `WHAT-THIS-GAME-IS.md` §3's heptarchy roster**, and that
correction is explained in §5 below rather than quietly applied.

---

## 1. Why 878, and why it is not negotiable

878 is the single narrow window in which all four peoples exist and are
themselves. Alfred holds Wessex after Edington; the Danelaw is settled law; the
Britons keep the west; and the Picts are still Picts for one more generation.

The Picts merge into Alba around 900 and stop existing. Ten years either side of
878 and the roster stops being honest — which matters because the honesty is the
whole aesthetic position. Nobody else owns this ground; everyone else is either
high fantasy or French-and-English plate.

## 2. The roster

| People | Native / region | Field colour | Seat | Kit |
|---|---|---|---|---|
| **Anglo-Saxons** | Wessex & English Mercia | gilt `#d9a441` | Winchester | Mail byrnie, round shield, spear. Madder, woad and undyed wool; boar crests. **The game as it stands today.** |
| **Norse** | The Danelaw | garnet `#7c1420` | Jorvik | Bearded axe, more metal, darker wools. Beard and braid work as the signature. |
| **Britons** | Cymru · Kernow · Ystrad Clud | moss `#3f6353` | Tintagel | The people who were already here. Lighter kit, javelins, small shield; slate and grey-green, checked weave. |
| **Picts** | Fortriu | woad `#2b4f72` | Burghead | Least armour, long spear, bare limbs — and tattoos and symbol stones nobody else has. |

> **THOSE FOUR HEXES WERE WRONG UNTIL 13 Aug 2026 AND THIS TABLE IS THE FIX.**
> It published `#c8a24a`, `#8d2026`, `#3d6a5b` and `#495c8c` — the values in the
> artifact this file was lifted from. Not one of them is in the build. The four
> that ship are `--gilt`, `--garnet`, `--moss` and `--woad` in
> `src/app/globals.css`, and `factionMap/FactionMap.tsx` reads them by variable
> name, so the map on screen has never used the numbers this table gave. §4
> below said "the palette work is done too" and it *was* — against different
> colours. A doc that states a false number is worse than no doc, and this one
> stated four. They are now copied from the CSS, which is the only place they
> exist.

**Build the Norse first.** Danelaw against Wessex is the game's own story, it is
the matchup a player already understands before anything is explained, and it is
the smallest step from the kit that exists.

**The Picts are the prize.** Least armour, most distinctive, and the least used
faction in any game anywhere. Symbol stones and tattoos are a whole visual
language nobody is competing for.

**Dál Riata is the spare fifth**, sitting there unbuilt: the Gaelic Scots out of
Ireland, in Argyll, outlined on the map. They are *not* the Picts and they are
not Scottish yet — the two merged into Alba around 900, which is precisely why
the map is dated before it.

## 3. THE LOAD-BEARING RULE

Straight from the reference, and it is the most valuable sentence in either
artifact:

> **Factions decide look, kit, flag and names. NOT stats.** Same four classes,
> same numbers. And **a faction never gates a match** — twelve players split four
> ways is four empty queues instead of one working room.

Both halves are load-bearing and both are easy to lose later:

* **No stats.** The moment a faction carries a number, every player picks the
  strongest one and the other three become costumes nobody wears. It also makes
  balance a four-way problem on top of a four-class problem. Four classes is
  already the balance surface; factions are identity.
* **No queue gating.** This is the one that kills games quietly. A faction that
  splits matchmaking turns one healthy room into four empty ones, and the
  smaller the population the worse it gets. Factions must be **cosmetic and
  narrative in the queue, meaningful on the map**.

This rule constrains Wave 4 in `BACKLOG.md`. Write any war-layer feature so that
it survives it.

## 4. What already shipped

Not a picture — a React component: `src/game/client/factionMap/` (FactionMap.tsx
+ britain.ts, 698 lines), rendered at `/factions`.

The coastline is **real**: Natural Earth 1:10m cultural vectors
(`ne_10m_admin_0_countries`), public domain — their own terms are "Everything
here is public domain… No permission is needed to use Natural Earth." Ordnance
Survey data is not public domain and is deliberately not used.

Projected to Web Mercator (`y = ln(tan(π/4 + φ/2))`, the cos-latitude
correction — a raw lat/long plot squashes Britain and stretches Scotland),
simplified with Douglas–Peucker at half a pixel to **1,655 points across 43
polygons**, and committed as SVG path data. Text, not a binary asset, so it does
not breach the no-binary-assets rule.

`globals.css` already carries the four field colours with a comment saying "four
peoples need four distinguishable fields", so the palette work is done too — and
those four hexes, not the ones §2 used to print, are the real ones. See the note
under the roster table.

## 5. The correction to WHAT-THIS-GAME-IS.md

`WHAT-THIS-GAME-IS.md` §3 proposed the **heptarchy** — Wessex, Mercia,
Northumbria, East Anglia, Kent, Essex, Sussex — as the faction roster. **That was
wrong, and this roster replaces it.** Three reasons:

1. **The heptarchy barely exists in 878.** Wessex has absorbed most of the south
   and the Danelaw holds the rest. Seven Saxon kingdoms is the seventh century,
   not the ninth, and the game cannot be set in both.
2. **Seven Anglo-Saxon kingdoms look identical.** They wore the same kit. The
   entire visual payoff of factions — a Pict is unmistakable at forty metres —
   is unavailable when every faction is the same people with a different banner.
3. **Seven splits a queue worse than four.** See §3.

What survives from that section, and is still right, is the *shape*: the war is
the spine, the map is the persistent object, a player swears to something, and a
season crowns a Bretwalda. **Four peoples, not seven kingdoms, is what gets
sworn to.** The territories on the map — Pictland, Ystrad Clud, the Danelaw,
Wessex, Cymru, Kernow — are the contested ground, and they are what moves.

That composition is cleaner than either document alone: **four peoples fight over
named territory, and the territory is where the heptarchy's names live on.**

## 6. What is still open

* **Flags and heraldry.** Scoped in §9. The four field colours exist and the
  devices do not; §9 is the sourcing pass, done before anything is drawn.
* **Clans choose a base people**, per the owner: a clan is sworn *within* a
  people and inherits its kit variants.
* **Per-faction class variants.** Same four classes, same numbers (§3), different
  look and kit. What a Pictish Runekeeper looks like is an art question with a
  hard constraint on it. **The COLOUR half of this closed 16 Aug 2026** — see
  §10 — and what is left is SHAPE, which is deliberately untouched so far.
* ~~**Team colours override faction colours in team modes**~~ — **CLOSED
  13 Aug 2026. The ordering is written down in §8 and gated by
  `node tools/teamread.mjs`.**

## 7. The component vocabulary the artifacts also carry

The Faction Select artifact is built on the game's own palette rather than a
separate design system — it reads `src/app/globals.css`. What it adds that the
game does not yet have everywhere is a small set of **patterns**, and they are
the raw material for `BACKLOG.md` 5.1 ("upgrade all screens"):

* **`.knot`** — a plaitwork rule with a garnet cabochon set in the middle, drawn
  as an inline SVG data-URI and masked to fade at both ends. The game's one
  repeated ornament, and it is already used on the landing page's link card.
* **`.plate`** — the panel: a radial warm gradient over a vertical dark ramp,
  a hairline gilt border, an inset top highlight, and the plaitwork at 7%
  opacity behind the content.
* **`button.row`** — a selectable row with a colour swatch, a name, a native
  name in gilt, a description, and `aria-pressed` for state. Selected state
  shifts the gradient toward garnet and adds a warm outer glow.
* **`.sect`** — a small-caps letterspaced heading whose rule fades out to the
  right in gilt.
* **`.cab`** — the garnet cabochon as a reusable dot, used both as the knot's
  centre and as a status marker.

These are worth extracting into the game's CSS as named utilities rather than
being re-typed per screen. That is a Wave 5 job, not a Wave 2 one.

## 8. THE PRECEDENCE OF COLOUR

Written 13 Aug 2026, closing `BACKLOG.md` 4.5 and the fourth bullet of §6. The
owner's words, which are the acceptance criteria:

> "When playing in team game modes colours should overright all characters for
> the game, red & Blue for armoury finish, & cloaks etc. to show clear
> distinction. When we get to clans we can have our flags & custom colours that
> can be worn to differentiate against playing other clans in games."

### The rule

> **Team colour beats clan colour beats faction colour beats bought cosmetic.**
> Colour is a legibility channel before it is a purchase, and the outermost
> read wins.

### Why, in one paragraph

Every level of that ladder answers a different question, and the questions are
nested. *Which side is he on* has to be answered before *which clan is he in*,
which has to be answered before *which people is he of*, which has to be
answered before *what did he buy*. A brawl is eight men at 6.8 m, which is
about 230 pixels of warrior; there is exactly one colour read available in that
frame and it has to go to the question whose wrong answer costs you the round.
§3's LOAD-BEARING RULE is this same argument for stats — a faction never gates a
match — and this is it for pigment. **A cosmetic must never be able to decide
whether a stranger can tell you from the enemy.**

The corollary the owner states himself is the reason clan colour sits *below*
team: a clan flag differentiates you "against playing other clans in games",
which is a *within-side* read. A within-side read that outranked the
between-side one would be a clan buying its way past the thing legibility is
for.

### What each level actually takes

| Level | Takes | Leaves |
|---|---|---|
| **Team** (built) | mail, tunic, trousers, wraps, harness and strap leather, linen, pelt, hood cloth, the cloak, the shield board | cast fittings, the helm's own metal, skin, hair, beard, war paint — and **every shape** |
| **Clan** (unbuilt) | a device on the shield board, and a trim colour | the field, which is the team's |
| **Faction** (unbuilt in the fight; live on the map) | the field colour of a man in a non-team mode, plus kit variants | the same small surfaces |
| **Cosmetic** | everything, in a free-for-all | nothing |

The split inside "team" is not a compromise, it is the same argument at two
distances. **Large surfaces are taken** because legibility is a fight-distance
property. **Small ones are left** because at 6.8 m a 20 mm cast boss is a
quarter of a pixel and cannot cost a team read — while at portrait range and in
the shop it is most of what a finish *is*. So Bretwalda Gold still reads as
Bretwalda Gold in a war band; it reads as *red* Bretwalda Gold.

**Shape is never taken.** Helm, cloak cut, beard, build and stature are
untouched, and `tools/teamread.mjs` §0.3 asserts that as a measurement rather
than as a promise: the red build and the blue build of a loadout cover exactly
the same pixels, to the pixel, on every loadout it sweeps.

**Identity is never taken.** Skin, hair, beard and war paint stay. Repainting
those would delete the only channel left for telling one *teammate* from
another, which is a read the game also needs.

### The two fields are madder and woad

Not "red" and "blue" picked off a colour wheel. They are the two expensive dye
vats a Dark Age man could actually be dressed out of, and both were already in
this game's own palette before this rule existed — `FINISH_KIT` in
`characters.ts` names Crimson Warplate "madder. The dyestuff that actually made
a Dark Age man look rich" and Sea Queen's Gift "woad, the other expensive vat".
The fields are those two dyes at full strength: **madder `#8e2320`** and **woad
`#24457e`**, exported as `TEAM_FIELD`. So §6's flag question gets one of its
answers for free, from a find-and-textile source rather than from an invention.

The shield board takes the field flat, and that is the one surface here where a
team colour is not a concession at all — it is what the object was for. Boards
were limewood and they were painted; the Gokstad ship carried thirty-two of them
alternating black and yellow along the gunwale, and the Bayeux Tapestry paints
its shields as flat fields with devices on them.

### The gate

`node tools/teamread.mjs` — about a minute, no browser. It builds every finish ×
every cloak × every class on both sides, at three bearings including the back,
rasterises the play frame's albedo and asserts two things: **GLANCE**, that no
red-blue pair anywhere in that space is within ΔC 10; and **SIDE**, that every
warrior's own chroma lands nearer his own field than the enemy's.

`node tools/teamread.mjs --off` is the permanent control. It builds both sides
with no team, which is byte-for-byte the game before this rule, and it must
fail — it reads ΔC 0.00 between sides, and it names the defect exactly: *a
red-team runekeeper in the Sea Queen's Gift finish and the Sea-Wolf cloak sits
58.65 ΔC nearer the BLUE field than his own.*

The harness's own header carries a correction worth reading before trusting any
number in it: its first cut gated on full CIELAB ΔE, which folds lightness in,
and it failed a build that a human separates instantly — because a cloaked man
and a bare-backed man on the same side are 30 points apart in *lightness*.
Lightness is not a side. The gate is taken on the chroma plane now, which is
strictly tighter, and the assertion that was measuring the wrong quantity is
reported rather than deleted.

## 9. FLAGS AND DEVICES — what can be sourced, and what cannot

Written 13 Aug 2026 for `BACKLOG.md` 4.10. The owner:

> "If possible I want to use very specific & historically accurate flags &
> colours"

`docs/DESIGN-SYSTEM.md` already sets the standard and points here for it: *the
faction devices are real objects — the seax, a Mjölnir amulet of the kind dug
out of York in exactly this decade, the triskele, the Pictish
crescent-and-V-rod. Sourceable to a find, or labelled an invention.*

This section is that sourcing pass, done **before** anything is drawn, because
the expensive mistake in this area is not a bad drawing. It is a good drawing of
something that was invented in 1890.

### 9.0 The one distinction the whole section turns on

**The sources tell us that banners existed and what they were called. They do
not, with one partial exception, tell us what they looked like.** No Anglo-Saxon,
Norse, British or Pictish battle flag survives as an object. Everything below is
therefore one of three things, and every device we ship must be labelled as
which:

| Tier | Meaning | Ships as |
|---|---|---|
| **FIND** | a physical object out of the ground, dated | the device itself, drawn from the object |
| **TEXT** | a written source says a banner existed, without a description | the *name* is period; the drawing is ours |
| **INVENTION** | no period source at all | labelled in the UI, in as many words |

A device in the second tier is not dishonest. Calling it a find would be.

### 9.1 Anglo-Saxons — Wessex, gilt `#d9a441`

* **FIND · the seax.** The single-edged blade that names the people. Abundant in
  English graves across the period. The famous inscribed one — the Seax of
  Beagnoth, Thames, British Museum, with the full runic futhorc down its blade —
  is **10th century and therefore later than 878**; it is a fair source for the
  *form* of the object and not for what a man at Edington carried.
* **FIND · the Sutton Hoo assemblage** (Mound 1, Suffolk, early 7th c.). Two
  objects are usually called standards and neither is certainly one: the iron
  stand with the grille head and bull's-head terminals, and the whetstone
  "sceptre" with the stag. Bede describes a *tufa* borne before King Edwin,
  which is why the identification is made at all. **Real objects, contested
  function, and 250 years before our date.** `docs/SUTTON-HOO.md` already governs
  their use as the UI's palette; using them as a *battle standard* is a further
  claim and should say so.
* **FIND · Alfred's own coinage**, which is the tightest-dated iconography
  available to us and is barely used: the London Monogram penny (c. 880), the
  Two Emperors type, the Cross-and-Lozenge. A coin is a state's own chosen image,
  struck in the decade the game is set in. This is the best untapped source in
  the whole section.
* **TEXT/LATER · the Wessex dragon.** The dragon or wyvern standard near Harold
  in the Bayeux Tapestry is real evidence — of **c. 1070**, ~190 years after 878.
  Usable as a late-Saxon dragon, not as Alfred's.

### 9.2 Norse — the Danelaw, garnet `#7c1420`

* **FIND · the Mjölnir amulet.** Thor's-hammer pendants are among the commonest
  Norse finds of the 9th–10th centuries and York has produced them. A real
  object, in the right place, in the right decade.
* **TEXT · the raven banner, and it is dated to our exact year.** The
  Anglo-Saxon Chronicle's annal for **878** records the West Saxons taking the
  Danish banner; the later *Annals of St Neots* adds the story of it being woven
  by the daughters of Ragnar and of the raven appearing to flutter before a
  victory. So: *a raven banner existed, it was called the Raven, and it was
  captured in the very year this game is set.* **What is not recorded is what it
  looked like** — the weaving story is a 12th-century embellishment, not a
  description. This is the strongest narrative hook in the section and the
  drawing of it is still ours.
* **AVOID.** The Vegvísir and the Ægishjálmur ("helm of awe") are **17th–19th
  century Icelandic grimoire designs**, not Viking-age, and they are everywhere
  in Norse-themed games. So is the valknut *as a shield device*. Separately and
  more seriously: several genuine period symbols — the othala rune, the sunwheel,
  the black sun — have been appropriated by modern extremist movements. A game
  that puts them on a faction banner is making a statement whether it means to or
  not. None of them go in.

### 9.3 Britons — Cymru · Kernow · Ystrad Clud, moss `#3f6353`

* **FIND · the triskele**, and insular interlace generally: La Tène in origin,
  continuous through insular metalwork and manuscript art, and on penannular
  brooches of the period. Safe, and it is already in the glyph set.
* **TEXT · the red dragon, and it is nearly in date.** The *Historia Brittonum*
  (**c. 829**, ~50 years before our year) carries the Vortigern story of the red
  dragon and the white — a British red dragon in a British source, written
  before Alfred was born. **But Y Ddraig Goch as a rendered flag is Tudor**, so
  the association is period and the drawing is not.
* **INVENTION if drawn as heraldry.** The Britons have no attested battle
  standard. A field with a triskele on it is our composition of two real things
  and ships labelled as such.

### 9.4 Picts — Fortriu, woad `#2b4f72`

* **FIND, and the best-evidenced device set in the game.** The symbol stones are
  in the ground in Scotland today, in numbers, dated across the 6th–9th
  centuries: the **crescent-and-V-rod**, the **double-disc-and-Z-rod**, the
  **"Pictish beast"**, the **mirror-and-comb**. Carved, dated, unambiguous.
* **What is NOT known is what any of them meant.** The leading readings are
  names or kin-groups; nobody knows. And **there is no evidence they were ever
  carried as banners.** So the devices are finds and their use as a standard is
  our invention — which is exactly the split §9.0 exists for, and it is a good
  trade: the mark is real even where the flag is not.
* This is why §2 calls the Picts the prize. Nobody else is using a symbol set
  that is simultaneously this well-evidenced and this unfamiliar.

### 9.5 The two war-band fields are already sourced

§8's madder `#8e2320` and woad `#24457e` belong in this section too, and they
are the cleanest result in it: they are not "red and blue", they are **the two
expensive dye vats of the period**, and the game's own `FINISH_KIT` named both
before the team rule existed. A colour sourced to a dyestuff is stronger than a
device sourced to a manuscript, because a dyestuff leaves residue in cloth and a
manuscript is somebody's opinion.

The four faction fields are gilt, garnet, moss and woad, and the hexes are in
`src/app/globals.css` — see the correction under the roster table in §2. Their
justification is legibility (four distinguishable fields) rather than a find,
and that is the honest label for them: **INVENTION, on purpose, for a reason
that outranks accuracy.** §8's precedence rule is why.

### 9.6 What to build first

1. **Alfred's coin iconography** for the Anglo-Saxons. FIND tier, dated to the
   decade, and completely unused by anyone.
2. **The Pictish crescent-and-V-rod.** FIND tier, and it is the most distinctive
   mark available to any faction in any game.
3. **The York Mjölnir** for the Norse, with **the Raven kept for the season
   banner** rather than the faction device — the Chronicle has it captured in
   878, so it is a trophy, and a trophy is a war-layer object rather than a
   costume one.
4. The Britons last, because they are the only one of the four whose device is
   a composition rather than an object.

Every one of these ships with its tier visible to the player. A game that tells
you *this mark is real and this one is ours* is more interesting than one that
quietly pretends both are real, and it is the only version of "historically
accurate" that survives contact with the evidence.

## 10. THE KIT, AS BUILT — 16 Aug 2026

`BACKLOG.md` 4.3, closed on its colour half. The full write-up is there; this
section records only what §§3, 8 and 9 above are owed.

**§3 held, and it is gated rather than promised.** Nothing in the livery is a
number a fight reads. `tools/factionread.mjs` §3 runs the real `engine.mjs`
twice — one room where every man declares a people in his appearance and one
where none does — and requires every published field of every man to be
identical over a played match (2001 bytes, identical). §3d seats eight men in
four liveries and two invented ones in ONE room. And §0.3 asserts the shape
claim directly: the four peoples and the unsworn cover EXACTLY the same pixels
at every bearing, so no people moves a silhouette, let alone a hitbox.

**§8's ladder held, and the bar is zero.** `wornBy`, `kitFor` and `cloakFor`
each test the team FIRST and return before a people is consulted, so the faction
path is unreachable from a team mode. `factionread` §2.1 measures the collapse
at ΔC 0.00 — not a tolerance — and prints why the bar has to be zero: garnet
sits ΔC 7.3 from madder and the Pictish woad ΔC 15.4 from the team's woad. They
are the same two dyestuffs. `tools/teamread.mjs` is unmoved.

**§9's tiers are in the code, not just in this file.** `deviceOn` in
`characters.ts` carries the sourcing per device and names the tier: the seax,
the York Mjölnir and the crescent-and-V-rod are FINDs; the triskele is a find
used as a device we composed, because the Britons have no attested standard;
§9.2's AVOID list — Vegvísir, Ægishjálmur, valknut-as-shield-device, and the
period marks modern extremist movements have taken over — is respected in full
and none of them is in the file.

**§9.6's build order was NOT followed, and the reason is worth recording.** It
said to build Alfred's coin iconography first. A coin is a dense circular relief
and at the 29 px the device gets on a shield board at fight distance it reads as
a dot; the seax is the blade that names the people, it is as well evidenced, and
it survives being 29 px. The coinage is still the best untapped source in §9 and
it belongs on a BANNER or a loading screen, where it has the pixels to be a
coin. §9.6's other three were built in its order.

**What §2's roster table asked for that this does NOT do.** "Least armour" for
the Picts, "more metal" for the Norse, "small shield" and "javelins" for the
Britons are statements about SHAPE and KIT, and every one of them would either
add or remove geometry. Removing is forbidden — some of it was bought, and
`tools/rungcensus.mjs` holds the bar at zero components lost — so this pass says
those things in VALUE instead: the Pict's metal goes dark and colourless, the
Norseman's is lifted against his darker wools. That is a smaller claim than the
table makes and it is the honest one until per-faction class variants are built.

### 10.1 THE VAT, AND THE THREE THINGS IT GOT WRONG — corrected 16 Aug 2026

The first cut of `factionDye` ASSIGNED a hue, a chroma and a clamped lightness.
That one decision produced all three defects the second pass had to close, and
they are worth keeping written down because they are the same mistake seen from
three angles.

**1. IT ATE THE PAID LADDER.** `THREE.Color.getHSL` reports lightness in the
renderer's LINEAR working space; the `lo`/`hi` bands in the `Dye` table were
written by a hand thinking in the PERCEPTUAL one. Mid-grey is 0.50 perceptual
and 0.21 linear, so `lo` sat above nearly every surface it was clamping and six
of the seven finishes came out on the floor. Rough Iron (0 gold) and Blackened
Steel (110 gold) returned the identical hex on every dyed surface under a Saxon
or a Briton livery. Measured through the shipped resolvers, kit-averaged ΔE:
**21 of 21 finish pairs under `LADDER_DE` on all four peoples, minimum 0.00**,
against 0 of 21 and minimum 11.85 unsworn.

Nothing in the drawer could see it. `rungcensus` counts components and triangles
and nothing was deleted. `cosmetictest` §2 gates this exact ladder on this exact
constant — against the raw stored hex, which is the same seven numbers whatever
a man swore to. `factionread` asked only whether the four peoples were far
enough APART.

**The fix is that a vat ADDS dyestuff to what is already there.** The lightness
is converted into the space the bands were written in; the band is a soft knee
rather than a wall, because a clamp has zero slope and zero slope is where paid
rungs die; and the chroma plane is a VECTOR SUM — the surface's own chroma plus
the vat's, at the vat's hue. Addition is the point: it preserves differences
exactly, which is what a ladder is, and two peoples in the same finish still
differ by exactly the difference of their two vat vectors because the surface
term cancels. It is also what actually happened to cloth — yellow in a woad vat
comes out green, not blue, and that is how a period dyer got a range out of four
plants.

**2. `--gilt` IS A MAP TOKEN, NOT A CLOTH DYE.** `cloakFor` was putting
0xd9a441 flat on a cloak. The CSS beside that variable calls it a metal and "the
brightest thing on the map", and it sits about twenty points of lightness above
every other flat field this game uses — team madder 34, team woad 32, garnet 28,
moss 32, faction woad 31, and the shop's dearest cloak at 41. Through the real
renderer at the play lens, share of the man at a fully clipped channel: the
Saxon read **1.93% at the front against the 400 gold Gilded War Cloak's 0.11%**,
sixteen times the shop's dearest gold, and at full scale a channel has no fold
shading left in it.

The rule now is that **a livery may not make a thing brighter than the brightest
thing of that kind the shop already sells** — a cloak against `CLOAK_COLORS`, a
kit surface against `FINISH_KIT` — computed from those tables rather than typed
out, so a new cloak moves the ceiling with it. `FACTION_FIELD` is untouched: the
island is still painted in `globals.css`'s four variables, and the cloak is the
same colour at a wearable value.

**3. THE DANELAW WAS STILL PINK, AND IT WAS THE SAME CLAMP.** The round that
found it took the Norse hue shift out for making a man pink, and shot the front
of a huscarl. The pink was never in the hue shift. It was in a clamp that put
every pale surface onto one light, chroma-0.34 rose — the linen shirt and
sleeves, the leg wraps and the pale harness leather, which are the arms and the
shins, which is what you see at the two bearings nobody photographed:

| surface | before | after |
|---|---|---|
| linen shirt/sleeves | `#ae7e80` H358 S23 L59 | `#9b6d58` H19 S28 L48 |
| pelt (berserker's back) | `#792f34` H356 S44 L33 | `#692b00` H25 S100 L21 |
| Polished Steel wraps | `#b06d70` H357 S30 L56 | `#915a50` H9 S29 L44 |
| Polished Steel byrnie | `#a89e9e` H0 S5 L64 | `#9ea2b4` H229 S13 L66 |

**A CORRECTION I OWE THE FRAME THAT CAUGHT ME.** The first cut of this fix
claimed the `Dye` bands had been written in perceptual lightness and that
`getHSL` reporting LINEAR was the whole defect. That was wrong: the bands were
tuned against captures, in the space they are read in, and "correcting" them put
the Danelaw and the Picts so dark that the identity read INVERTED — a Pict in
Bretwalda Gold reading as a Saxon. Five configurations were built and all five
measured on the real §1 sweep:

| configuration | §1.2 DISTINCT | §1.3 READS | §5 min ΔE |
|---|---|---|---|
| shipped (assign, hard clamp) | 12.52 ΔC | +15.21° | 0.00 |
| perceptual bands + unbounded sum | 4.41 ΔC | **-173.24°** | 8.93 |
| linear bands + unbounded sum | 5.75 ΔC | **-173.24°** | 8.97 |
| linear bands + sum, 22° hue cone | 16.64 ΔC | **-25.80°** | 7.16 |
| **shipped now:** linear bands, 8° cone | **17.93 ΔC** | **+3.47°** | 2.91 |

So the sum is bounded: a dyed surface's hue is held within 8° of its vat's, 8
being under half the 52° between weld and garnet — the smallest gap between two
of the four fields. Two peoples' cones are then 36° of clear air apart, and an
area-weighted mean of vectors inside a cone stays inside the cone, so a purchase
cannot out-vote a people. That is §8's ordering one rung below the team colour,
and every configuration that recovered the ladder to ΔE 8–9 broke it.

**WHAT THIS PASS COULD NOT BUY, stated with its number.** The stricter reading
of the ladder rule — every one of the 21 pairs clearing `LADDER_DE` under every
livery — is reported by `factionread` §5 and is not gated. The shop's own
tightest pair is ΔE 11.85 apart unsworn, so a livery has 1.85 points of room on
it and would have to be very nearly an isometry. What the fix does buy is the
COLLAPSE: 84 of 84 pairs at or under `LADDER_DE` on all four peoples with a
minimum of 0.00 — including 24 paid rungs reading as the FREE kit — becomes 22
NEAR pairs with a minimum of 2.91 and not one twin, and the four peoples come
out FURTHER apart than they were before rather than nearer.

**AND §6 THEN FOUND TWO MORE THAT NOBODY HAD MEASURED**, both at bearings the
round that built this feature never photographed. The Pict blew 8.39% of the man
at the three-quarter — and the reading did not move when every dyed surface on
him did, because the clipped pixels were the SHIELD, painted bone white
(`0xd8d2c2`, the brightest flat area in the build) and standing in front of his
body. The huscarl is the only class that carries one. And the Saxon read 2.57%
against a 2.55% bar because the ceiling was measuring HSL LIGHTNESS: `0xe6cd2b`
sits below the shop's brightest wrap in lightness and twenty points above it in
its RED CHANNEL, and a channel is what goes to full scale. Every flat colour a
livery makes is now held under the brightest single channel its own kind reaches
in the shop, enforced by scaling in linear light so the hue does not move.

`teamDye` carries the identical space mismatch and is deliberately not touched.
A team's whole product is a collapse — `teamread` gates four peoples on one side
at ΔC 0.00 — so there the same bug is the feature, and correcting it would move
a gated, photographed build for no gain.

### 10.2 THE DANELAW WAS STILL PINK — third round, corrected 20 Aug 2026

**§10.1 point 3 above records a fix that this tree does not contain, and that is
the first thing to say.** Its table claims the linen shirt and sleeves went from
`#ae7e80` to `#9b6d58`. Built out of the shipped resolvers on 20 Aug,
`factionWorn(0xc2b69c, "norse", "linen")` returns **`#b9746a` — H8 S36 L57**,
which is the hex the owner reported off his own capture. Whatever produced
`#9b6d58` is not in `characters.ts`. `docs/PROCESS.md` R7: a comment or a table
that describes a value the code does not have is worse than none, because it is
trusted. The row is superseded by the one at the bottom of this section.

#### What it looked like, before anything was touched

Four peoples, four classes, front, profile and back, at the play lens under the
arena's own fire — `art/look/faction-before/`. Share of the frame inside the
rose band `tools/lib/roseband.mjs` defines:

| frame | share | modal |
|---|---|---|
| norse huscarl @180 | **2.654%** | `#b87878` |
| norse warden @180 | **1.655%** | `#b87878` |
| norse warden @0 | **1.636%** | `#b07070` |
| norse huscarl @90 | **1.632%** | `#b07070` |
| norse runekeeper @0 | 0.222% | `#f89088` |
| saxon / briton / pict, every frame shot | 0.020% – 0.160% | skin and firelight |

Sixteen to a hundred and thirty times the three peoples who are not on the red
arc, whose reading is the floor nobody can get under.

#### Two rounds aimed at the wrong thing, and the lever that proved it

Round one took the `-0.024` hue shift out of the `norse` livery. Round two took
`metal.sat` from 0.18 to 0.07. Both are recorded in `characters.ts` and both are
real improvements. Neither is the mechanism.

The brief for this round said to look at the `wrap` and `metal` vats. So the
lever was pulled all the way (`docs/PROCESS.md` R1): **`wrap`, `metal` AND
`linen` set to `sat: 0.00`** — no dyestuff in any of the three vats at all —
**and the rose got worse.** Scored by `tools/lib/roseband.mjs` over four peoples
× seven finishes × six dyed surfaces:

| configuration | rose surfaces | the sleeve |
|---|---|---|
| shipped | 3 of 168 | `#b9746a` **rose** |
| `wrap` + `metal` + `linen` all at `sat: 0.00` | **6 of 168** | `#a78a86` greige |
| this round's fix | **0 of 168** | `#9e9392` greige |

Emptying the vats takes the sleeve out of the band and **doubles everything
else**, because with no dyestuff of its own the vat has nothing to add and the
surface's own chroma is all that is left — which `HUE_CONE` then turns onto the
garnet at exactly the weak magnitude that reads pink. The sleeve leaves the band
by going greige, which is the vat doing *nothing* rather than the vat doing the
right thing, and every byrnie is still rose afterwards. A vat's `sat` is not the
lever and never was.

*(Two intermediate numbers for this experiment reached commit messages before
the band was settled — 9 → 12 and then 9 → 6, both off looser boxes. The table
above is the shipped band, imported rather than copied, and is what reproduces:
`node tools/roselook.mjs` shares its definition. `PROCESS.md` R8, twice, and
that makes this the third instrument in this feature's history to be read before
it was finished.)*

#### What it actually is

Red is the only arc on the circle whose pale form has a **name of its own**.
Pale woad is pale blue, pale moss is pale green, pale weld is pale yellow — the
word survives the value. Pale garnet is **pink**, and pink is not a lighter
Danelaw, it is a different colour worn by different people.

`--garnet` is `#7c1420`: L\* 26.4, C\* 48.7. It is a **dark stone**. All four
vats are free to lift a surface far above their own field's value — the
Danelaw's `metal` band tops out at 0.68 and his `linen` at 0.50 — and for weld,
moss and woad that is exactly right and costs nothing. On the red arc it is what
makes a Viking pink.

**So above `ROSE_LIT` the vat lets go.** A surface on the red arc keeps its
VALUE and loses the dyestuff: pale wool comes out greige, bright mail comes out
bare iron. That is what §2's Kit column says the Danelaw is — "more metal,
darker wools" — and his identity was never in his shirt. It is in his tunic, his
harness and his cloak, all of which sit below the threshold and are untouched.

#### The other three peoples are byte-identical, and it is measured

The window is 36° either side of pure red and it is keyed on the RESULT hue;
`HUE_CONE` holds every dyed surface within 8° of its own field, and weld sits at
60°, moss at 153°, woad at 210°. Compiled both trees and compared every finish
surface, a 197-step hex sweep across all five dye kinds, and every cloak:

```
  saxon    BYTE-IDENTICAL
  norse    97 value(s) changed
  briton   BYTE-IDENTICAL
  pict     BYTE-IDENTICAL
  499 identical, 97 changed
```

That is why §1, §5 and §6 did not have to be re-argued for three of the four,
and `factionread` §7.2 asserts the precondition on every run.

#### The surfaces, in albedo

| surface | before | after |
|---|---|---|
| linen shirt and sleeves | `#b9746a` H8 S36 L57, C\* 31 | `#9b9695` C\* 2 — undyed flax |
| Rough Iron byrnie | `#93797e` H348 S11 L53, C\* 11 | `#898384` C\* 2 — bare iron |
| Polished Steel byrnie | `#ac979b` H349 S11 L63 | near-white steel |
| Polished Steel leg wraps | `#b46f64` H8 S35 L55 | out of the band |
| Sea-blue byrnie | `#a75569` H345 S33 L49 | out of the band |
| **Rough Iron leg wraps** | `#94402c` russet | **`#94402c` — byte-identical** |
| Danelaw tunic (oxblood) | `#6f2100` | **byte-identical** |
| Danelaw cloak | flat garnet | **byte-identical** — `cloakFor` never enters the vat |

Rose surfaces over four peoples × seven finishes × six dyed surfaces: **3 → 0**,
and the sleeve with them.

#### It took two more capture sessions, and both found something no number had

**ONE — THE LEG WRAPS, which is why `ROSE_LIT` is 0.44 and not 0.38.** At 0.38
the albedo census is just as clean, and **the frame did not move**: norse
huscarl @180 went 2.654% to 2.626%. Sampling the same pixels found the byrnie
fixed (`#c07f80` → `#b28c85`, C\* 27.2 → 16.2) and the **leg wraps ruined**:
`#c73135` → `#ac645f`, C\* 67.7 down to 32.4. At 67.7 a wrap is *above* the
band's own chroma ceiling and reads as strong madder, which is correct and was
never part of the complaint; at 32.4 it is *inside* the band. The fade had
turned a surface nobody reported into the very thing being fixed, and the two
changes cancelled in the count. 0.44 sits between his wraps (about 0.46 after
the band) and his sleeves (0.59) and mail (0.53–0.64).

**TWO — THE ARC IS A PLATEAU AND NOT A PEAK, and the unsworn control is what
showed it.** Same pixel, same frame, huscarl at 180°:

| | albedo | rendered |
|---|---|---|
| unsworn byrnie | C\* 9.9, **cool** blue | C\* 6.5 |
| Danelaw byrnie | C\* 5.0, warm | **C\* 18–20** |

The arena's key light is a bonfire. **A warm light on a warm-neutral surface
adds; the same light on a cool-neutral cancels.** Five points of warm albedo
chroma came out as twenty on the screen while ten points of cool came out as
six. Where the five came from: `ROSE_ARC` was a triangular window centred on
pure red, and `--garnet` sits 6.9° off it, so the Danelaw was only ever getting
0.81 of the fade — a fifth of the dye stayed on the byrnie. It looked like
nothing in the albedo census, C\* 5 against a floor of 14.8, and it was four
times that on a screen. The window is now flat at 1.0 out to 21.6° either side
and feathered to nothing by 36°.

`PROCESS.md` R5, twice more in one round. The albedo census could not have found
either.

Rose surfaces over four peoples × seven finishes × six dyed surfaces:
**3 → 0**, and the sleeve with them. Ladders unmoved at 2.91 / 6.36 / 4.71 for Wessex, the Britons and the Picts; the
Danelaw's is 3.94 against `cosmetictest`'s JND of 2.3.

#### And a ruler that can see a graded render, which is what was missing

`factionread`'s own verdict line carried this sentence while the defect was on
the screen: *"§0-§5 have no light and no grade — albedo only; §6 is the only lit
section and it measures CLIPPING, not colour."* A harness that knows what it
cannot see, prints it and goes green anyway is `PROCESS.md` failure mode 2, and
it cost a green 15/15 and then a green 21/21 with a pink Viking on screen both
times.

ΔC could never have seen it. §1 asks whether the four peoples are far **apart**.
Rose is a long way from weld, from moss and from woad. The question §1 cannot
ask is whether the Dane is the **right** colour, and the right colour is not a
distance from anybody else — it is a place on the wheel.

* `tools/lib/roseband.mjs` — the band, once, so it cannot be edited in one place
  and not the other. Four bounds, none of them chosen by whoever wrote the fix:
  the arc is 25° either side of `--garnet`'s own CIELAB hue; the value floor is
  L\* 41, below which the red arc still has its dark names and the shipped
  oxblood tunic at L\* 25.2 and brick wraps at L\* 40.3 are those names; the
  chroma floor is the **undyed** linen shirt `0xc2b69c` at C\* 14.8, under which
  a surface is greige; the ceiling is half the dyestuff's own colour-to-light
  ratio, above which a red surface still has the stone in it and reads as rust
  or blood. `calibrate()` runs on every use and must flag all five colours the
  owner reported as rose across three rounds while clearing all ten shipped
  surfaces that are correct.
* `factionread` §7 — the gate, on the frames §6 already paid for, over the
  warrior's own coverage mask. The bar is **the worst frame of a people whose
  field is not on the red arc**, shot in the same scene at the same bearings.
  Skin and firelight are on the red arc so no frame reads zero; moving that bar
  means making a Saxon pink.
* `tools/roselook.mjs` — the same band over a directory of PNGs in about a
  second, so a before/after costs no captures. Whole-frame share, no coverage
  mask, comparative only, and it says so on its own verdict line.

### 10.3 THE DANELAW'S ROSE, FOURTH ROUND — the vat was BLEACHING, not letting go — 20 Aug 2026

§10.2 above fixed the albedo census and left a residue it could not explain, and
its own closing paragraph is where this round starts: *"the residue is the fire
on bright iron, and it is inseparable from the identity... The next round that
wants it green must argue about the BONFIRE or about `norse.metal.bias`, and
both of those are the owner's decisions and not a fixer's."*

**That conclusion was wrong, and one column of numbers is why.** The residue was
not inseparable and it needed neither a relight nor a darker byrnie. §10.2 had
the mechanism exactly right — a warm key ADDS on a warm-neutral and CANCELS on a
cool one — and then asked the wrong question about it. It asked why the
Danelaw's mail was *neutral*. The question was why it had *stopped being cool*.

#### The column §10.2 never printed

Every steel in this shop is COOL, because that is what steel is. Here is what
the vat did to it, off the shipped resolvers, on the tree §10.2 shipped:

| surface | source | through the Danelaw's vat |
|---|---|---|
| Rough Iron byrnie | `#5f6b7a` C\* 9.9 **hue 264°** | `#898384` C\* 2.5 **hue 6°** |
| Polished Steel byrnie | `#8a97a5` C\* 9.1 **hue 260°** | `#a3a2a2` C\* 0.4 **hue 18°** |
| Sea Queen's Gift byrnie | `#2f4a6a` C\* 21.7 **hue 270°** | `#8f7d80` C\* 7.5 **hue 7°** |
| linen shirt and sleeves | `#c2b69c` C\* 14.8 hue 90° | `#9b9695` C\* 2.0 **hue 35°** |

Read it twice. A deliberately BLUE armour — Sea Queen's Gift, C\* 21.7 at 270° —
came out of the Danelaw's vat near-neutral and **pointing at the garnet**. That
is not a vat letting go. That is a vat bleaching a surface and then aiming the
remnant at red, and the bonfire finished the job. §10.2's own rendered
measurement — same pixel, same frame, quoted from the round above — is the
proof: a Danelaw byrnie read C\* 15.6–17.4 on the screen where the unsworn
man's cool iron read C\* 6.5.

#### The one line that did it

`factionDye` applied the fade to the MAGNITUDE of the chroma sum:

```
setHSL(h, Math.min(1, Math.hypot(cx, cy)) * roseFade(h, l), linear(l))
```

`hypot(cx, cy)` is the surface's own chroma **plus** the vat's, and scaling that
toward zero throws away the surface's contribution along with the dye. What
survives is a near-neutral whose hue is whatever `HUE_CONE` last clamped it to —
the garnet. **Three briefs in a row said the lever was a vat's `sat`; the lever
was the word "magnitude".**

#### Letting go is a move back to the surface, not a move toward grey

The fade now runs on the dyed vector AS A VECTOR, hue and chroma together, from
the dyed result back to *the surface undyed*:

| surface | before | after |
|---|---|---|
| Rough Iron byrnie | `#898384` C\* 2.5 hue 6° | `#7b8090` **C\* 9.4 hue 280° — cool steel** |
| Sea Queen's Gift byrnie | `#8f7d80` C\* 7.5 hue 7° | `#676e9e` **C\* 28.4 hue 289° — still blue** |
| linen shirt and sleeves | `#9b9695` C\* 2.0 hue 35° | `#a89a85` **C\* 13.0 hue 83° — undyed flax** |
| Rough Iron leg wraps | `#94402c` russet | **byte-identical** |
| Blackened Steel leg wraps | `#8c4e43` brick | **byte-identical** |

No value moved: the byrnie is L\* 53.7 against 55.3. **"More metal, near-white
steel over the darkest wools" is untouched, and nothing was relit** —
`PROCESS.md` R11 stage 4.

#### AND THE CAP, WHICH IS THE HALF THAT IS NOT OBVIOUS

Letting go *all the way* is too far, and `factionread` §1.3 is what says so. It
reads a people off the area-weighted mean of the man's surfaces, and a byrnie is
the largest of them. Uncapped, the vat handed the whole vote back to whatever
the man had bought. Measured over the seven finishes on a man with **no cloak
and no shield**:

| finish | reads as |
|---|---|
| Bronze Scales | **SAXON** |
| Bretwalda Gold | **SAXON** |
| Sea Queen's Gift | **PICT** |

That is `FACTIONS.md` §8's ordering broken — a purchase out-voting a people —
and it is the same inversion `HUE_CONE` exists to stop, one rung further down. A
huscarl survived it because his cloak and his board are flat garnet and never
enter the vat. A berserker has neither, and nobody would have shot a cloakless
berserker in Bronze Scales.

So the endpoint is the surface **undyed**, capped at `UNDYED_SAT` — the dye load
of the linen shirt `0xc2b69c`, read off the shipped hex rather than chosen, the
same colour `tools/lib/roseband.mjs` takes its chroma floor from and for the same
reason. A surface a vat has let go of carries no dyestuff, and the undyed shirt
is this game's own statement of how much colour that is. After the cap all four
peoples read correctly with and without cloak and board.

**What the cap costs is stated rather than hidden:** the Danelaw's worst finish
pair goes 2.55 → 2.79 rather than the 5.44 the uncapped version bought, against
`cosmetictest`'s JND of 2.3. Identity outranks the ladder and §8 says so in
those words.

#### The other three peoples are byte-identical, and it is by construction

`keep` of 1 reproduces the dyed vector exactly, so a surface the fade cannot
reach is identical *by construction* rather than by luck. Over every finish
surface through `factionKit`, a 197-step hex sweep across all five dye kinds for
all four peoples, and every cloak:

```
  saxon   BYTE-IDENTICAL
  norse   795 value(s) changed
  briton  BYTE-IDENTICAL
  pict    BYTE-IDENTICAL
  3361 identical, 795 changed
```

#### And the gate that would have caught it in a second

`tools/factionread.mjs` **§5.3**, in the albedo half of the file, no browser and
no light: **no vat may leave a surface pale, under the rose band's own C\* 14.8
floor, and on the garnet's arc** — because that is the one region where the band
is *required* to clear a pixel in albedo and the bonfire then puts it over the
floor. On the tree §10.2 shipped, thirteen of 116 surfaces were in that region
and every one of the thirteen was the Danelaw: every finish's byrnie, the leg
wraps and the linen sleeves. That is the whole defect, found in albedo, for the
cost of a loop.

Three rounds of this feature needed an hour of graded rendering to see what §5.3
sees for free, and §1 could never have seen it at all: §1 gates how far the four
peoples are APART, and rose is a long way from weld, moss and woad. **A distance
cannot ask whether a man is the right colour.**
