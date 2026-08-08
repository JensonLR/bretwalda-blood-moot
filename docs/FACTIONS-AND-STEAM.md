# Four peoples, and whether this belongs on Steam

The owner asked two questions together, and they turn out to be the same
question: *what would make this more than a link in a group chat?*

This file answers both, argues against parts of both, and sequences what
survives. It is written before any of it is built, which is the point.

---

## 1. The history, because he asked for accuracy and was close but not exact

- **Anglo-Saxons** — Germanic settlers (Angles, Saxons, Jutes) in what became
  England, c. 450–1066. Kingdoms: Wessex, Mercia, Northumbria, East Anglia,
  Kent. *Bretwalda* — "Britain-ruler" — was the title for an over-king of the
  others, which is where this game's name comes from and why it means something.
- **Britons** — the Brythonic Celtic peoples pushed west and north by that
  settlement. The owner's guess was right: **Cornwall** (Dumnonia, *Kernow*) and
  **Wales** (*Cymru* — Gwynedd, Powys, Dyfed), plus **Strathclyde** in the
  north-west. They are the people who were already here.
- **Picts** — northern and eastern Scotland, above the Forth–Clyde line. **They
  are not the Scots, and this is worth getting right.** The Scots were the
  Gaelic *Dál Riata*, who came from Ireland into Argyll; Picts and Scots merged
  around 900 to become Alba, and only then does "Scotland" start to mean
  anything. The Picts are the older, stranger people — symbol stones, no
  surviving language, unique art.
- **Norse** — the Danelaw. The Great Heathen Army lands 865; by the 870s a third
  of England is under Danish law, centred on **Jorvik** (York).

**The date that makes all four coexist: c. 870–900.** Alfred's Wessex against
the Danelaw, Britons holding Wales, Cornwall and Strathclyde, Picts still Picts
for another generation. That single choice makes the whole roster historically
honest rather than a fantasy mash-up — and it is a genuinely good period that
almost no game occupies.

**A fifth faction is sitting there if it is ever wanted:** the **Dál Riata
Scots**, Gaelic, sea-borne, distinct from the Picts they later absorbed.

### Settlements, one per faction, all real places in the modern UK

| Faction | Ground | Why |
|---|---|---|
| Anglo-Saxon | **Winchester** or the existing Saxon village | Wessex's seat; the game already has this ground built |
| Norse | **Jorvik (York)** | Timber-and-wattle Viking city, the Danelaw's heart |
| Britons | **Tintagel** (Cornwall) or **Dinas Emrys** (Gwynedd) | Cliff-and-slate against Saxon timber — the strongest visual contrast available |
| Picts | **Burghead** (Moray) | Huge promontory fort, bull symbol stones, sea on three sides |

That table alone answers the "maps at a different settlement in the modern UK"
idea — and it makes the map work *mean* something instead of being three more
fields.

---

## 2. Factions: right idea, and the sequencing is where it lives or dies

**Why it is right.** Identity drives clans, clans drive retention, and retention
is the actual problem (`docs/MONETISATION.md` says so at the top). A Hearth that
is *a Norse Hearth* has something to be. Team modes stop being "red versus blue"
and become a thing people care about. Four armouries is four times the cosmetic
surface, which is four times the shop. And nothing else on the backlog gives the
maps a reason to exist.

**Why it could sink the project, said plainly.** The armoury for **one** faction
has taken weeks and is not finished. The head took nine passes. Four factions is
four times an art debt this project has not yet cleared once. `docs/CAMPAIGN.md`
holds every new feature to five gates, and the fourth is *"does it make the game
more fun, or only bigger?"* — factions as currently imagined make it **wider**,
not deeper. The core loop — fight, die, fight again — is not improved by a
fourth set of trousers.

**And the one that would actually kill it: a tiny playerbase divided four ways.**
If twelve people are online and each has picked a faction, faction-locked
matchmaking has four empty queues instead of one working room. The invite link
works today precisely because it never asks anyone to belong to anything first.

### So: the version that survives the gates

1. **Factions are identity and cosmetics. Not balance.** Same four classes, same
   numbers, same weapons *behaviour*. A faction chooses your look, your kit
   palette, your flag, your name-list, your emblem. **Zero balance risk, all of
   the identity.** If the game ever has enough players to balance four rosters,
   that is a decision for then, taken with data.
2. **One faction at a time, finished properly.** **Norse first** — most
   recognisable, biggest pull, and the Danelaw against Wessex is the game's
   natural story. Two factions is a war; four is a menu.
3. **Never faction-lock a match.** Factions decorate a fight; they do not gate
   entry to one. Faction-vs-faction is a *mode*, offered when the room can fill
   it, never a requirement.
4. **Clans (Hearths) pick a faction at creation** — the owner's idea, and it is
   the best part of the proposal. It gives the flag work a home, gives the
   name-validation a vocabulary, and makes a clan mean something on sight. A
   Hearth's faction sets its emblem palette and its naming; the customisation
   stays, scoped to the faction.
5. **A flag per faction**, and per Hearth within it. Flags are already on the
   backlog and unbuilt; factions give them their design language.

**What each faction has to actually differ by, or it is a recolour** — and this
project has already shipped one ladder of recolours and been caught:

| | Anglo-Saxon | Norse | Briton | Pict |
|---|---|---|---|---|
| Silhouette | mail byrnie, round shield, spear | lamellar/mail, bearded axe, kite or round | lighter kit, javelins, small shield | least armour, long spear, bare limbs |
| Head | spangenhelm, nasal | spectacle/Gjermundbu | leather cap, hood | none, or a simple cap |
| Palette | madder, woad, undyed wool | darker wools, more metal | grey-green, slate, checks | blue-black, ochre, bare skin |
| The one thing | boar crests | beard and braid work | plaid/check weave | **tattoos and symbol stones** |

The Picts are the most visually distinctive faction available and the least used
in any game. If only one exotic faction is ever built, build that one.

---

## 3. Steam: the honest answer

**Short version: the browser game is the funnel, Steam is the destination, and
you cannot go to the destination before the funnel proves anyone wants to stay.**

**What Steam actually costs.** $100, a store page, capsule art, a trailer, and a
build — none of that is the hard part. The hard parts are:

- **Servers, forever.** This game is a stateful 20 Hz authoritative sim
  (`docs/HOSTING.md`). A Steam release is a promise to keep servers running, or
  it is a game that dies the day you stop paying. Either ship a listen-server /
  P2P path, or budget hosting as a permanent cost. **This is the single biggest
  technical decision and it is not made yet.**
- **Reviews are permanent.** A thin game gets a permanent 60% and it never
  recovers. Steam players expect progression, content volume and polish; a
  browser game in a wrapper gets savaged unless it clearly earns being there.
- **Wishlists come first.** Steam's algorithm runs on wishlists accumulated
  *before* launch, and those come from an audience — which is exactly what the
  browser version is for.

**What would warrant it.** Roughly: the four factions, four grounds, ranked with
seasons, clans, the finisher/colosseum work in `docs/GAUNTLET-BRIEF.md`, plus
two things the browser build does not need — **controller support** and an
**offline/bot mode** so the game is playable when nobody else is on. At the
current pace that is months, not weeks.

**The order that gets there.**

1. **Pay for hosting and move the database off the free tier.** Render's free
   Postgres expires at 90 days and takes every profile with it. Nothing else on
   this page matters if the accounts vanish.
2. **Prove retention in the browser.** Do people come back? There is still no
   analytics — `docs/PLATFORMS.md` records that even "most players are on a
   phone" has never been measured. **Ship a count before shipping a plan.**
3. **Two factions, Saxon and Norse, as identity + cosmetics.** Danelaw versus
   Wessex. One new ground: Jorvik.
4. **Hearths choose a faction.** Flags, emblems, name-lists.
5. **Ranked and seasons on top of that**, which is where factions start paying
   for themselves — a faction leaderboard is a reason to log in.
6. **Then** Britons and Picts, then Steam, with a wishlist campaign built on an
   audience that already exists.

**The strongest argument for Steam, kept for last:** it is where a game like
this can be *sold* rather than monetised in fragments — and `docs/MONETISATION.md`
is honest that cosmetic micro-transactions on a small playerbase are beer money.
A £8–12 premium game with a free browser demo is a cleaner business than a free
game with a shop, and this project already has the demo.

---

## 4. What this file does not do

It does not authorise building any of it. Every item above still goes through
the five gates in `docs/CAMPAIGN.md` before it is built, and the defect list in
`docs/OPEN-DEFECTS.md` comes first — the owner has said so, and shipping a
fourth faction on top of a broken helmet ladder would be the same mistake at
four times the price.
