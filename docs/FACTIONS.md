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

* **Flags and heraldry.** The owner asked for "very specific & historically
  accurate flags & colours". The four field colours exist; the devices do not.
  Real caution needed — most "Anglo-Saxon flags" online are Victorian inventions
  or modern nationalist appropriations, and the honest sources are the finds:
  the Sutton Hoo standard, the Bayeux dragon, Pictish symbol stones, coin
  iconography. Anything that cannot be sourced to a find or a manuscript should
  be built as an invention and labelled as one.
* **Clans choose a base people**, per the owner: a clan is sworn *within* a
  people and inherits its kit variants.
* **Per-faction class variants.** Same four classes, same numbers (§3), different
  look and kit. What a Pictish Runekeeper looks like is an art question with a
  hard constraint on it.
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
