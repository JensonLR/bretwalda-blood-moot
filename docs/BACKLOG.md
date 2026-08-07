# The development list

Everything this project has decided, started, finished, or refused, in one
place, ordered, sized, and with an honest state against each.

Eighteen documents and four dead containers produced this list. Several of
those documents describe work a container ate before it landed, and at least
one thing was built twice. So **no state below is taken from a document.**
Every DONE names the commit or the symbol in the tree that proves it; every
NOT STARTED names the grep that came back empty.

**Superseded 7 Aug 2026 — the branch is on `main`.** The armoury wave (finish
palette, warden rebuild, hair/beard/hood, tab wrap) is merged; `main` is at
`e4e0b30` plus this judgement. The paragraph below described the pre-merge state
and is kept because the *counts* in it are still the honest record of how far
ahead the branch ran before it landed.

> Verified at `775c8b2` on `claude/bretwalda-bloot-moot-aaa-9th390`, which is
> **171 commits ahead of `main` (`e24407a`)**. Everything marked DONE below is
> DONE *on this branch*. Almost none of it is on the live site.

### The next three, re-ordered by what the owner can see — 7 Aug 2026

The owner's note ("for 74+ commits ahead of branch im not seeing a whole lot of
improvement in the live game") is a scheduling verdict, not an art one. It is
answered in the order below, and the reasoning is in `docs/OPEN-DEFECTS.md`.

1. **Restore class separation in `tunicDye`.** The finish palette that fixed the
   warden's green collapsed the four classes onto one tunic — 32% of live's
   separation at the free default, 9% at Blackened Steel. The corrective weights
   are already measured (`hue 0.40 / satAdd 0.22`, ~13% of finish travel). This
   is the highest-value visible fix on the list and it is a two-number change.
2. **Fix `armouryStage.ts` exposure before touching the head again.** The same
   head reads well under the arena key and pale and blotchy in the shop. The
   owner judges the game from the shop, so the shop's light is worth more than
   any further geometry on the face.
3. **The helm bowl and nape flare**, with a before-sheet to A/B against — `cone`
   taper `1.15` and the nape fall at `skullY + R.y * 0.47` / `R.x * 1.38`. Ten
   helms that read as one pointed dark shape is the owner's first complaint and
   the only one this wave did not touch at all.

Gates at the time of writing:

```
npx tsc --noEmit          TSC_EXIT=0
npm run lint              ✖ 11 problems (9 errors, 2 warnings)      [bar: <= 12]
npm run build             exit 0 — 14 routes, all ƒ (Dynamic)
```

Those three are the whole of what has been checked on this branch. `tsc`
being clean and the build passing is not a verdict on 171 commits, and this
file does not treat it as one.

---

## 0. Corrections — things the record has wrong

These are the reason this file starts here rather than with the plan. Four
items were being carried as outstanding that are already built, and one is
recorded as needing a rebuild that was already rebuilt. Carrying them forward
would have spent a wave re-deriving work that is sitting in the tree.

| The record says | The tree says |
|---|---|
| "The `world.ts` seam that would make a second map possible was built and lost with a container." | **It is in the tree.** `world.ts:223` `GroundDef`, `:237` `registerGround`, `:243` `groundIds`, `:3305` `SAXON_VILLAGE_GROUND`, and `createWorld` resolves `opts.ground` through the registry. The sim-side half exists too — `grounds.mjs:436` `SAXON_VILLAGE`, `:489` `GROUNDS`, `:494` `DEFAULT_GROUND_ID`, `:501` `getGround`. Map two is a new module, not a refactor. **This is the single largest cost reduction on the list.** |
| The shove is a "build now" feature in `FEATURES.md`. | **Built.** `engine.mjs:408` `---- the shove ----`, `:432` the cooldown table, `:1276` the input branch, `shoveTimer`/`shovePending`/`shoveCooldown` on the wire at `:743` and in `PRIVATE_FIELDS` at `:856`. |
| Victory emotes: "there are none — `grep -rin emote src/` finds nothing." | **Built.** `EmoteId` is a type, `page.tsx:557` handles the `emote` relay, `emoteUntil` is a player field (`engine.mjs:856`). |
| The rematch button is an extra "not asked for". | **Built.** `page.tsx:181-182` `rematchRef`/`rematchWaiting`, `:479-484` the room-rolls-back-to-lobby loop, `:1019` the press. `tools/summaryflow.mjs` exercises it. |
| The block-walk glide is an open defect. | **Fixed.** `anim.ts:3848-3877`. Guard from `state`, gait from `velocity`, with `bodyOwned` naming the states that author their own legs. The comment there is the fourth sighting of the one-channel-two-facts shape and is worth reading before touching the wire. |
| `COSMETICS-AUDIT.md` §4 item 3: the armoury preview renders with no materials. | Already marked **DONE** in that file (`armouryStage.ts`, commits `6bf6b8e` "Give the armoury the game's own renderer" and `499f3d8`-era "Rebuild the armoury screen"). Left here so nobody re-opens it. This is the thing that **was built twice** — `CharacterPreview.tsx` still exists beside `armouryStage.ts`. |
| `OPEN-DEFECTS.md`: "Bindings live in localStorage only — the profile column was never added." | **The column was added.** `schema.ts` carries `bindings: jsonb(...)` — nullable on purpose, and the comment there explains why the null is load-bearing. `syncBindings()` at `profileLink.ts:328` POSTs to `/api/profile/equip`, `db/api.ts:30` has a `bad_bindings` rejection, and `page.tsx:945` server-renders the caps. Stale entry. |
| `GORE-DESIGN.md`: "the server does not know where a hit landed… **this is the whole of the work**." | **The server knows.** `engine.mjs:180` `---- hit zones ----`, `:1510` `deriveHitZone`, `:1511` `ZONE_DAMAGE`, `hitZone` on the `hit` broadcast at `:1559`, and `deathZone`/`deathDir`/`deathHeavy` on the player at `:1567`. The client half is built too — severance, stumps and grafted geometry through `anim.ts:673-681`. The doc's stated blocker no longer exists. |

And two the record has *optimistic*:

- **The frame-cost harness did not half-fail. It fully failed.**
  `art/perf/fpstest.json` has `"ablationRows": []` — length **0**, not 11.
  There is no ablation data at all. "Which effect costs what" is not
  half-answered, it is unanswered.
- **The 1308–1461 draw-call figure is the `medium` and `high` tiers.** The
  `low` tier — which is what a weak phone actually gets — measures **283 draws
  / 311 worst / 256 k tris**. The phone problem is real but it is a *tier
  assignment* problem as much as a draw-call problem, and the numbers below
  should be argued at the tier a phone lands on, not at `high`.

Measured matrix, from `art/perf/fpstest.json` (`when: 2026-08-05T15:31:44Z`,
`prod: true`, SwiftShader, 4 cores, dpr 1 — **no GPU on the capture box**):

```
low    | one-on-one | draws=283  | worst=311  | tris=256029  | alloc=785kB/f | gc=75/min | jsP50=8.1ms
medium | one-on-one | draws=1308 | worst=1314 | tris=1108428 | alloc=944kB/f | gc=19/min | jsP50=20.7ms
high   | one-on-one | draws=1461 | worst=1689 | tris=1503508 | alloc=982kB/f | gc=15/min | jsP50=21.2ms
```

Every `menu (DOM + preview)` row is `frames: 0` — the menu scene never
captured. That is a third harness defect and it is why the armoury screen has
no frame cost on record at all.

---

## 1. How to read a state

- **DONE** — proven by a symbol in the tree or a named commit. Not by a doc.
- **IN FLIGHT** — landed on this branch, unmerged, and **unverified**: the
  container died before the ship phase. Treat as unproven work, not as done.
- **NOT STARTED** — the grep is empty.
- **REJECTED** — with the reason, so it is not re-proposed in three weeks.
- **BLOCKED** — with the thing it is blocked on.

Sizes: **one wave** (a single agent, a single ship phase), **several waves**,
or **a project** (needs its own document and its own order of work).

---

## 2. The order of work, and why

Each wave unblocks the next. The armoury comes first because the owner said so
and because it is the screen he judged; the rest is argued.

### Wave A — THE ARMOURY (a project: five waves, one of them in flight)

The frame being right is the milestone. A merge is not.

**A0. The head correction.** *LANDED on `main` — 6 Aug 2026, 76 commits,
`2bfff54` through `60fbeae`.* Face as a field rather than a face with stickers
on it, hair and beards that differ in silhouette, helms seated on the skull with
hair out from under them, war paint with an edge, the ear rebuilt as a closed
shell, the profile authored as an outline and the gate moved onto the
silhouette, the woven cross-hatch traced to the tile repeat and removed, the
quiet lock mark, `wearmeasure`, `headmeasure` and `cosmetictest`.

**It did NOT reach the bar and it shipped anyway**, on the ground that nothing
on it is a regression against what live players had — see the land judgement at
the top of `OPEN-DEFECTS.md`, which carries the A/B frames from both trees at
all three tiers and names seven faults that shipped. The next head wave starts
from that list. **The head is no longer a merge blocker; it is a wave.**

**A1. THE BODY — the default kit reads Roman.** *NOT STARTED. Outranks every
individual cosmetic in the shop* (`COSMETICS-AUDIT.md` §4.1), and it is the
only item here that is wrong on **every player at all times**, bought or not.
Four separate faults, still exactly as the audit found them:

1. `characters.ts:4885` `const lamellar = cls === "warden";` — six rigid
   banded courses plus a shin plate. That is lorica segmentata. **REBUILD as a
   mail byrnie**, split front and back; differentiate the classes by coverage,
   not by inventing plate.
2. The tunic hem closes into a horizontal kilt line at mid-thigh on every
   class. **Slit it front and back**; take the leg wraps to 12–15 mm proud of
   the calf (they are at `rCalf * 1.1`, a 3 mm lift that vanishes at 7.9 mm per
   pixel) and put a visible break at the knee.
3. The cloak spans ±0.56π symmetrically about the spine while the brooch is
   pinned on one shoulder — the cloth and the clasp disagree. **Cut it
   asymmetric.** This is also the one purchasable item that can change a man's
   outline at fight distance, so it pays twice.
4. Palette: warden defaults to a red cloak over a `0x5a6630` yellow-green
   tunic — the Roman colourway. **Brown cloak, tunic off the yellow-green
   axis.** *After* the silhouette work, not instead of it.

Size: **several waves.** Judged from `tools/silhouette.mjs` with the material
off, because "reads Roman" is a claim about shape.

**A2. The instrument, before A4 can be judged.** *NOT STARTED. One wave.*
Two defects `COSMETICS-AUDIT.md` §6 names, and a third from §0 above:
- The face card's aim is only correct near −35°; re-measure `AIM.head.right`
  with `--guides` at 0° and −90°.
- **There is no weapon lens.** A sword at kit distance is ~200 px of a 700 px
  frame. Add a `weaponcard` at 0.35 m of frame at the fist. **This BLOCKS A4
  entirely** — a weapon cannot be judged at all today.
- The `menu (DOM + preview)` capture yields zero frames, so the armoury screen
  has no measured cost. Fold into the same wave.

**A3. The ten helm bowls, and §5's cut/reprice/rebuild.** *NOT STARTED.
Several waves.* Verified untouched — `characters.ts:191-285` still reads
Nasal 110, Shadow Hood 120, Jarl's Crowned 570, Wyrm-Crest 950, Bronze Scales
160, Crimson Warplate 120, Bretwalda Gold 510, and both Greybeard and Snow
White at 30 in **both** the hair and beard tables. Nothing has acted on §5.

The physical fact that condemns the ladder: the fight card resolves **127 px
per metre — 1 px is 7.9 mm** and a head is 34 px. A fitting under ~24 mm cannot
be seen; under ~40 mm cannot be told from its neighbour. Seven of ten helms are
one bowl at that range: **2110 gold of ladder that is one grey dome.**

The reference rung is the **Boar-Crest at 380** — 102 mm of animal along the
crown, the only crest below Sutton Hoo that survives with the material off.
Everything above it should have been that.

*Ordering note:* do the **REBUILD** list before the **REPRICE** list. A price
is a statement about what an item is; repricing first means repricing twice.
The two CUTs (one of Greybeard/Snow White; "Bronze Scales" and "Crimson
Warplate" as names) can go immediately — they cost nothing to remove and one
of them is two paid options that are the same colour.

**A4. Cloaks and every weapon.** *BLOCKED on A2 (weapon lens) and A1 (the
cloak's asymmetric cut is A1.3 — A4 is the paid tier on top of it).*
Several waves. The Gilded War Cloak at 400 is a lampshade; the sword reads as
a cane and the shield as a plank; the shield needs its dish and the sword its
rest carry.

**Wave A exit:** 8+ on every axis of `VISUAL-BAR.md` §2, from captures
regenerated after the last commit that touched the file, per the §6 critic
protocol. Not "better than before".

---

### Wave B — THE 90-DAY CLOCK (one wave, and it has a deadline)

*NOT STARTED.* `src/db/index.ts:20` reads `process.env.DATABASE_URL` and
nothing in the repo mentions Neon.

**Render's free Postgres expires at 90 days and takes every profile with it** —
every recovery code, every helmet, every gold balance. The repo's first commit
is **2026-07-28**, so the database cannot have been provisioned earlier than
that, which puts the outside edge of the clock at **2026-10-26**. Today is
2026-08-06. **At most 81 days, and possibly fewer — the real provisioning date
is on the Render dashboard and somebody should read it and write it here.**

The work is a connection string and a dump/restore; the DB is plain Postgres
behind Drizzle. It is the cheapest item on this entire list and the only one
with a date attached. It also unblocks every economy item, because auditing
what players buy is moot if the buying is deleted on a schedule.

Do this **beside** wave A, not after it. It does not touch `characters.ts` and
it does not compete for the renderer.

---

### Wave C — THE HARNESS THAT MEASURES THE PHONE (one wave)

*NOT STARTED. BLOCKS wave D.*

`ablationRows` is empty. All eleven ablations missed the served bundle, so
nothing in this repo can answer "which effect costs what". Wave D is a
performance wave, and a performance wave without an attribution instrument is
eleven guesses.

Also fix the `menu` scene's zero-frame capture, and get the matrix onto
hardware with a GPU or state plainly on every row that SwiftShader's `jsP50` is
not a phone's `jsP50`.

**Fold in the one measurement that would end the platform argument.**
`docs/PLATFORMS.md` names it and it is almost free: a single anonymous count of
viewport class and pointer type at first load. Every brief in this repo has
asserted a platform majority nobody has counted; one number replaces the whole
argument, and it belongs in the wave that is already building instruments.

**This is the same failure mode `VISUAL-BAR.md` records twice: evidence that
cannot support the question is worse than no evidence.** Fix the instrument
before trusting the reading.

---

### Wave D — DRAW CALLS AND ALLOCATION (several waves) — BLOCKED on C

*NOT STARTED.* Two measured findings:

1. **1308 draws at `medium`, 1461 at `high`, 283 at `low`.** A phone wants low
   hundreds. `low` is already there, which reframes the question: what does
   `detectTier` put a real phone on, and is `medium` reachable at all on the
   devices the owner's friends carry? Answer that before instancing anything.
2. **785–982 kB allocated per frame, driving 15–75 GC/min.** The `low` tier is
   the *worst* offender per minute (75/min) because its frames are cheaper, so
   this is not a "turn off effects" fix — something is allocating per frame in
   code that runs at every tier.

The `low`-tier `glLive` counts are worth a look on their own: 1095 buffers, 418
VAOs, 53 programs for a one-on-one.

---

### Wave E — THE SECOND GROUND (several waves, and much cheaper than believed)

*NOT STARTED, but NOT BLOCKED.* The seam exists (see §0). `MAPS.md` designed
three and one exists.

Build **map two: cold, open, sky-lit** — a tidal flat, a frozen fen, a moor
under low cloud. The reasoning in `MAPS.md` is right and worth restating: the
village's entire look is a warm bonfire key against dusk. A cold key with a
wide horizon changes every material in the game without touching one of them.
It is the cheapest way to make map two feel like a different game, and it will
immediately expose the two traps `OPEN-DEFECTS.md` carries — everything past
~10 m collapsing to one orange hue, and a bloom threshold above where the grade
already clips.

Three things outside the renderer still assume one place, and each is a real
bug the moment a map changes shape:
- `groundHeight` in `engine.mjs` is a hand-copy of the terrain field.
- `ARENA_RADIUS = 18` (`engine.mjs:16`) is a constant and the spawn ring solves
  against it.
- The bonfire hazard is at the origin.

`Room.arena` already exists and is always `"saxon_village"` (`engine.mjs:1049`,
`:1103`). Making it real is lobby + wire + room. The capture harness needs a
map parameter or two thirds of the game cannot be reviewed.

Map three (enclosed, vertical, stone — the ruined Roman fort) is **BLOCKED on
the sim being flat**: no jump, position solved in x/z, arena a clamped circle.
Height in the renderer without height in the sim is set dressing plus camera
bugs. That is its own project, not a rider.

---

### Wave F — RETENTION (several waves)

- **Rating.** *NOT STARTED* — no `rating`/`elo` column in `schema.ts`, no
  reference anywhere in `src/`. Cheap: the DB exists, `matchHistory` already
  stores results, and the summary screen already has somewhere to show it.
- **Matchmaking.** **REJECTED for now**, and the reason is arithmetic rather
  than effort: a queue is only as good as its population. Every match today
  starts from a dropped link and has a 100% match rate; a queue at this player
  count has a match rate near zero and teaches the first organic visitor that
  the game is dead. Revisit when concurrent strangers exist. The rating is what
  it will eventually sort on, which is why the rating is not deferred with it.
- **Hearths** (clans — `heorðwerod`, the hearth-troop). *NOT STARTED* — no
  table, no reference. First cut: a name, a member list, a tag by your name in
  the kill feed. Not territory, not chat, not war declarations.
- **Flags.** *NOT STARTED* — no flag column, no flag geometry; every `Flag` hit
  in `src/` is a `lucide-react` icon or an unrelated boolean. Constrained
  presets, not free-drawn — that is a moderation decision as much as an art
  one. Depends on profiles, which are built.
- **PWA.** *NOT STARTED* — no `public/manifest`, no service worker. Manifest,
  service worker, and an **earned** install prompt: never at first load, after
  a won match. The retention floor.

---

### Wave G — FIGHTS WORTH REPEATING (several waves)

- **Splintering shields.** *NOT STARTED* — `vfx.ts:409` has a splinter
  *particle*, and that is all. Blocks are already typed on the wire
  (`blocked` / `blocked_heavy`); a shield that visibly wears and finally bursts
  turns turtling into a decision and heavies into shield-breakers. All
  procedural, all inside the existing hit pipeline.
- **Taking a dead man's weapon.** *NOT STARTED* — `grep -rin pickup src/` is
  empty. The corpse persists and the sim knows what he carried. A weapon on the
  ground is a reason to move, and moving is what the shove and the fire already
  want you doing.

---

### Wave H — HOSTING AND MONEY (a project, mostly deferred)

- **Paid Render, $7/mo.** *NOT STARTED.* Zero migration; removes spin-down.
- **Fly.io.** Deferred until geography costs parries. When it happens:
  `auto_stop_machines = false`, `min_machines_running = 1` — scale-to-zero kills
  every live match, because `rooms` is process memory.
- **Email at purchase, Stripe founder's pack, cosmetic shop, seasons.** In that
  order, all after wave F. Payments are the easy half.
- **For the record, and it is not a hosting fault:** the measured evidence says
  the free tier is **not** causing the lag — tick p50 **50.00 ms** under four
  concurrent matches, live round-trip p50 **4.98 ms**. The judder was
  interpolation, and it is fixed (`PERFORMANCE.md`, causes 1–3; `21/21`, every
  wire shape at 0.0% ripple). Do not buy hosting to fix a frame rate.
- **Also for the record:** every deploy kills every live match. That is a
  property of the architecture, not of the host, and no hosting decision above
  should be mistaken for having solved it.

---

## 3. Standing rejections, so they stay rejected

- **Importing free three.js assets.** Breaks the zero-binary rule the instant
  link stands on; fractures a procedural art direction that is unified because
  everything shares one palette and one lighting rig; and drags CC-BY /
  non-commercial licence audits into a product that intends to make money. The
  one arguable exception someday: a reverb impulse response.
- **XP-bought power.** Permanently. The pitch is a link in a group chat and the
  person who clicks it is a newcomer against veterans. The newcomer must be
  killable by skill only.
- **Selling gold.** The Sutton Hoo helm's worth on another man's head is the
  knowledge that it was earned. Sell gold and every earned one is debased and
  the whole ladder deflates at once. Money buys things priced in money; gold
  buys things priced in play; the two never convert.
- **More classes.** Four deepened beat six shallow. Each new class multiplies
  sounds, animations, balance, cosmetics and the summary tableau.
- **Serverless (Vercel/Netlify).** Not worse — *incompatible*. No long-lived
  socket, no 20 Hz loop between requests, no shared memory for `rooms`.
- **App stores.** 30%, a review queue on every update, and discovery that is
  pay-to-play, in exchange for nothing this product needs.

---

## 4. New proposals, through the five gates

`CAMPAIGN.md`'s gate: 30-second drop-in / one-thumbed on a phone / zero new
binary assets / more fun rather than only bigger / can be judged. All five or
it is written down as rejected.

### P1 — Ship the wave. (PASS, and it is not really a feature)

`main` is 171 commits behind this branch. Every DONE in §0 — the shove, emotes,
the rematch button, the summary screen, the glide fix, profiles — **is not on
the site the owner's friends are playing.** The largest gap in this document is
not between what is built and what is designed; it is between what is built and
what is *deployed*.

1. Serves the drop-in — it *is* the drop-in. 2. Phone-native already.
3. No assets. 4. The most fun-per-hour available: the work is finished and paid
for. 5. Judged by the existing harnesses plus the owner playing it.

**This is a verification project, not a merge.** Four containers died before a
ship phase and eight green reports here were later contradicted. The wave needs
`npm run build`, the full harness set, and regenerated captures before it goes
anywhere near `main`.

### P2 — A shield-wall opening for the second ground. (REJECTED at gate 4)

Proposed: map two's one-thing-that-changes-how-people-fight is a formation
mechanic. Fails gate 4 — it is a system, not a decision, and `MAPS.md` asks for
a hazard, a chokepoint or cover, not a gimmick. Map two's differentiator should
be **weather and sightline**: the cold map's low contrast already changes how
far you can see a man coming, and that is a fighting change bought with the art
direction rather than with a new subsystem.

### P3 — A spectator link for a live room. (REJECTED at gate 1)

Fails gate 1 and gate 4. A watcher is a player who did not join, and the room
already holds eight. The correct version of this idea is the summary screen,
which is built.

### P4 — Name the ladder rung, not the item, in the shop. (PASS, small)

The audit's finding is that seven helms are indistinguishable at fight
distance. Half of that is geometry (A3) and half is that the shop sells them as
*names* — "Jarl's Crowned Helm" promises more than 570 gold of geometry
delivers. Showing each helm's **silhouette card at fight resolution** beside
its price makes the ladder honest without rebuilding it, and it is the
cheapest possible partial fix while A3 is in flight.

1. No step before the fight. 2. Cards are already phone-first (`d709d4f`,
`18e5987`). 3. Procedural — `tools/silhouette.mjs` already generates exactly
this image. 4. Yes: it turns a purchase from a guess into a comparison.
5. Judged by the same cards.

---

## 5. THE TOP THREE AFTER THE ARMOURY

Argued against the alternatives, because a list without a recommendation is
homework.

### 1. Move the database to Neon, and write the real expiry date down.

**Why first:** it is the only item on this list with a deadline, and the
deadline is at most **81 days** away and possibly much less — the repo's first
commit is 2026-07-28, so 2026-10-26 is the *outside* edge and nobody has read
the actual provisioning date off the dashboard. It is also the cheapest item
here: a connection string, a dump, a restore, against plain Postgres behind
Drizzle.

**What it costs if skipped:** every recovery code, every helmet, every gold
balance, on a schedule. The whole point of `recoveryWords.ts` is that a
player's identity survives a cracked phone. It should not die of a hosting
tier. And every economy item on this list — the audit's repricing, rating,
Hearths, the founder's pack — deposits value into that database.

**Argued against:** the obvious objection is that it is not visible, and the
owner's bar is a visual one. But it competes with nothing — it does not touch
`characters.ts`, the renderer, or the harness, so it runs *beside* wave A
rather than after it. There is no version of this project where doing it later
is cheaper, and there is a version where doing it later is catastrophic.

### 0. Make the two flaky gates deterministic. *NEW, and it is now first.*

**Why it displaced everything:** `touchtest` and `playtest` each fail about one
run in three, on their own input synthesis rather than on the game. A gate that
fails a third of the time cannot certify a release, and the land judgement of
6 Aug had to reason around both of them. Both harnesses sample after a
wall-clock delay; both must instead wait on the client having *received* the
pointer delta. Ten consecutive green runs each before either is called done.
One wave. Everything below is worth less until this is true.

### 2. Ship the wave to `main`, verified.

**Why second:** 171 commits, including the shove, victory emotes, the rematch
button, the end-of-match summary, the block-walk glide fix and the entire
judder fix, are sitting on a branch the owner's friends cannot play. The judder
work alone — `PERFORMANCE.md`'s three causes, `21/21`, 0.0% ripple at every
wire shape — is the answer to the complaint that started this whole
performance thread, and it is not deployed. The rematch button is described in
`FEATURES.md` as "possibly the highest-value feature in the repo"; it is built;
it is not live.

**Argued against "keep building until the armoury is done":** the owner asked
for a loop that does not stop until the armoury is utterly beautiful, and a
merge is explicitly not the milestone. Agreed — which is why this is second and
not first, and why it is scoped as a *verification project* rather than a
merge. But the armoury is a project of several waves, and holding 171 verified-
nowhere commits behind it compounds the exact risk that has already cost this
project four containers' worth of work. Verify and ship what is finished;
continue the armoury on top of a shipped base.

**Argued against "ship it now, unverified":** no. `tsc` is clean and the build
passes and *nothing else has been checked*. Eight green reports in this repo
were later contradicted. The ship phase is the work.

### 3. Fix the frame-cost harness, then cut draw calls.

**Why third:** the owner reported lag on **desktop and mobile both**, and
`docs/PLATFORMS.md` forbids this file asserting a platform majority nobody has
measured — the earlier draft of this paragraph said "most players are on a
phone" and that is exactly the unmeasured prior the correction is about. Draw
calls are a frame-rate problem on every platform. The two performance findings
that are actually open are — 1308–1461 draws at the
tiers above `low`, and 785–982 kB per frame driving up to 75 GCs a minute. But
`ablationRows` is **empty**. Not partial: empty. Nothing in this repo can say
which effect costs what, so a performance wave started today is eleven guesses
dressed as engineering, and `VISUAL-BAR.md` has already recorded twice that
evidence which cannot support the question is worse than none.

Fix the instrument (one wave), then spend the wave the instrument earns.

**Argued against the second map (wave E):** map two is the more exciting piece
of work and it just got much cheaper — the seam everyone believed was lost is
in the tree. It is genuinely the strongest fourth item. But it *adds* to the
per-frame budget, and adding surface to a renderer that has no cost attribution
is how a game stops running on the weaker half of its audience, whichever half
that turns out to be. The map is better work after the numbers, not before them.

**Argued against rating and Hearths (wave F):** retention is the monetisation
problem and these are the retention features. But they are worth building for
players who are still here in week three, and a player whose phone stutters is
not still here in week three. Performance is upstream of retention.

**Argued against splintering shields and weapon pickup (wave G):** the two best
*fun* items on the list, both cheap, both inside pipelines that already exist.
They are the first thing to build once the frame budget is known — and they are
the right consolation prize if the owner would rather spend his attention on
the game than on its instruments.

---

## 6. What is blocked on what, at a glance

```
A0 head (IN FLIGHT) ──> A1 body ──> A4 cloaks+weapons
A2 instrument ─────────────────────^   (weapon lens BLOCKS A4)
A1.3 asymmetric cloak ─────────────^

B  Neon              (blocked on nothing — has a deadline)
C  harness ──> D draw calls + allocation ──> E map two ──> F retention ──> H money
E  map three         (BLOCKED on the sim being flat: no jump, x/z only,
                      ARENA_RADIUS a constant — its own project)
F  matchmaking       (REJECTED until concurrent strangers exist)
F  flags             (needs profiles — profiles are DONE)
```

---

# 7. The owner's list of 2026-08-07

Nine items, sent after playing the live build. Marked **NEW** or **ALREADY
RECORDED** against everything above, because he asked to be told which is which.

## 7.1 Bugs, with a diagnosis where I have one

| # | Item | State |
|---|---|---|
| a | **Custom keybinds do not bind in game.** Adding an additional custom key has no effect. | **NEW.** The remap screen writes, but the bound key never reaches `sampleInput`. `bindings.ts` holds `DEFAULTS` and the profile carries a `bindings` jsonb; `bindsynctest` proves the *round trip to the database*, not that a rebound key moves the man. That is the third instrument in this project to measure the wrong quantity. |
| b | **Ctrl to crouch does not work on a MacBook.** | **NEW, and diagnosed.** `bindings.ts:88` binds crouch to `["ControlLeft","ControlRight"]`. On macOS **Ctrl is the right-click modifier** — the browser consumes it before the game sees a keydown, and Ctrl-drag is a system gesture. This was never a Mac-safe default. Rebind (`C`, or `Alt`), and add a rule that no default may be a platform modifier. |
| c | **Berserker has a wooden board through his back and cloak.** | **NEW.** Almost certainly his weapon's rest-carry: the haft is parented to a spine point at a fixed offset instead of being slung, so it passes through the cloak. Sibling to the fittings work already landed — the seating machinery exists, the weapon carry never used it. |
| d | **Helmets, six faults in one report.** Crown helm overlaps at the back so the gold is hidden; some helms overlap the huscarl's chainmail neck; the Shadow Hood does not connect to its base; ears and hair still overlap helms; **large gaps at the sides of the helms** that need to line up with the ear or be closed; **the Boar and Wyrm crest ornaments are generic and unreadable as animals**. | **PART NEW.** The hair/helm layering and the hair-swallowing regression are recorded above; the crown occlusion, the hood base, the side gaps and the crest legibility are NEW. |

## 7.2 The screens

| # | Item | State |
|---|---|---|
| e | **The main menu background is basic and generic** and carries none of the game's identity. | **NEW.** |
| f | **Every screen is boring.** The armoury is better than it was, but the whole set needs an upgrade — and **any design change must run end to end through the whole journey**. Consistency is the requirement, not a nice-to-have. | **NEW, and it is the largest item here.** Landing screen, lobby, countdown, HUD, round break, summary, armoury, recovery-code screen. A design system, not a reskin: one type scale, one palette, one card, one button, one panel, applied everywhere at once. |

## 7.3 Features

| # | Item | State |
|---|---|---|
| g | **Emotes need a big pass** — currently "barely functional, static, robotic". Make them **purchasable in the armoury**, give the player **a loadout of three** to swap for round-end and match-end, and **allow emoting during a fight to taunt an opponent** — "this would compliment the severing limbs aspect". | **PART NEW.** Three emotes exist, server-relayed and rate-limited (`emoteUntil`, the `emote` relay). Purchasable, loadout-of-three and in-fight taunting are all NEW, and they connect directly to the colosseum idea in `docs/GAUNTLET-BRIEF.md` — a taunt over a man you have just dismembered is the same design as mercy-or-finish. **In-fight emoting needs a rule so it cannot be spammed or used to cancel recovery frames.** |
| h | **New maps.** | **ALREADY RECORDED** — `docs/MAPS.md` has three designed and one built. §0 of this file corrects the record: the `world.ts` ground registry **is in the tree** (`registerGround`, `groundIds`, `GroundDef`, and `grounds.mjs` server-side), so map two is a new module rather than a refactor. It is the single largest cost reduction on this list. |
| i | **A whole-game review of ergonomics, engagement, deployability and addictiveness.** And: *can Blender be used, and would we benefit?* | **NEW.** The review overlaps `docs/GAUNTLET-BRIEF.md`, which already commissions nine specialists and a critic. The Blender question is answered below. |

## 7.4 Can Blender be used, and would we benefit?

Asked directly, so answered directly.

**For runtime assets: no, and the reason is the product, not the tooling.**
Everything in this game is generated in code because the pitch is a link in a
group chat that plays instantly. A Blender export is a binary mesh — glTF, a
few hundred KB to a few MB — and the moment one ships, "it just opened"
becomes "it's loading". That rule also protects the art direction: every
surface in the game is mixed from one palette and one material library, and an
imported mesh arrives with its own topology, its own UVs and its own idea of
scale.

**The honest counter-argument, which deserves stating.** The head took **nine
passes**. An artist in Blender would have had a better one in an afternoon. If
that pattern repeated across every asset, the rule would be indefensible. It
did not repeat: the head is now authored as a section stack with a silhouette
gate that holds at 0 failures, and the remaining faults — layering, seating,
occlusion — are *integration* problems that a Blender mesh would have too.
Switching now would throw away a working system to buy a different set of
problems.

**Where Blender genuinely would help, and costs nothing:** as a **reference and
measurement tool**, never as a shipping pipeline. Model a helmet, measure it,
and feed the numbers into the procedural builder. That is exactly what
`headmeasure` and `wearmeasure` already do with anthropometry — a modeller's
eye upstream of a generator, with no binary in the repo.

**What would change my mind:** a portal deal (`docs/DISTRIBUTION.md`) where the
host serves the bundle and load time stops being the differentiator, or a
second product where the tech matters more than the instant link.

## 7.5 The order I would build these in

1. **(b) the Mac crouch bind** and **(a) custom binds not binding** — a control
   that does nothing is worse than a control that does not exist, and (a) needs
   a harness that moves the man, not one that round-trips the database.
2. **(d) the helmets** and **(c) the berserker's board** — visible on the screen
   he looks at most, and the seating machinery to fix them already exists.
3. **(e/f) the screens, as one design system** — the biggest single lift to how
   the game *feels*, and the one thing that must not be done piecemeal.
4. **(g) emotes** — purchasable, loadout, in-fight. Ties the shop to the fight
   and feeds the colosseum design.
5. **(h) map two** — cheaper than the record claimed.
6. **(i) the gauntlet review** — it is the frame the rest hangs on, and it is
   already written up in `docs/GAUNTLET-BRIEF.md`.
