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
| **Anglo-Saxons** | Wessex & English Mercia | gilt `#c8a24a` | Winchester | Mail byrnie, round shield, spear. Madder, woad and undyed wool; boar crests. **The game as it stands today.** |
| **Norse** | The Danelaw | garnet `#8d2026` | Jorvik | Bearded axe, more metal, darker wools. Beard and braid work as the signature. |
| **Britons** | Cymru · Kernow · Ystrad Clud | moss `#3d6a5b` | Tintagel | The people who were already here. Lighter kit, javelins, small shield; slate and grey-green, checked weave. |
| **Picts** | Fortriu | woad `#495c8c` | Burghead | Least armour, long spear, bare limbs — and tattoos and symbol stones nobody else has. |

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
peoples need four distinguishable fields", so the palette work is done too.

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
* **Team colours override faction colours in team modes** (`BACKLOG.md` 4.5).
  Red and blue must beat faction identity for legibility, and that ordering needs
  writing down before it is discovered in a match.

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
