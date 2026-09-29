# Gates: how to get the quality without the five hours

Passes have been taking three to five hours while this container restarts every
one to three. That is a structural mismatch, and it has already destroyed whole
waves twice. This file is the fix, and it is built on measurements rather than
on a feeling that things should be quicker.

---

## What actually costs the time

Measured on this box, which has no GPU and rasterises in software:

| thing | cost |
|---|---|
| `cosmetictest` default (26 browser captures) | **1192 s** |
| `cosmetictest --no-render` (same 47 options, CPU) | **56 s** |
| the CPU silhouette rasteriser, 47 options × 2 lenses × 2 bearings | **15 s** |
| `headmeasure`, `wearmeasure` (CPU, 32 heads) | seconds |
| first browser frame (texture library + PMREM bake) | **8.4 s** |
| one armoury thumbnail | ~1.5 s |
| one `/shot` sheet | 2–3 min |
| `playtest` / `touchtest` | minutes, and **flaky 1 in 3** |

**The CPU instruments are twenty to forty times faster than the browser ones and
they catch most defects.** `cosmetictest --no-render` found four cloaks that were
one cloak. `wearmeasure` found helmets shearing through skulls. `headmeasure`
caught the muzzle that eight tuning passes missed. None of them opened a browser.

The browser is needed for one thing only: **the final look**. Everything else is
arithmetic.

## The three-tier gate

**INNER — every change, ~90 seconds, no browser.**
`npx tsc --noEmit`, `node tools/headmeasure.mjs`, `node tools/wearmeasure.mjs`,
`npm run cosmetictest -- --no-render`.

Four more belong here, all CPU, all seconds, added 28 Aug 2026 — and each
exists because something was shipping unmeasured:

| ruler | answers |
|---|---|
| `npm run guardprobe` | what a shield is actually WORTH, in damage, per class. `blockReduction` is the huscarl's whole identity and nothing held it to a number: `classmatrix` cannot see it (~6% of its duel damage ever meets a raised guard) and `fighttest`'s guard claims are ordinal, which any magnitude survives |
| `npm run crownnews` | the crowning latch, over two simulated visits. A one-render assertion cannot see "the visit that shows you the news is the visit after which it stops being news" |
| `npm run storeclaims` | the Steam page's nouns, against the modules that own them. It was written after the copy claimed five warrior classes and named a Burhweard |
| `npm run marktest` | the 24-glyph set: sourcing, unlock ladder, and that the server narrows a stored mark against the row's own record |

One more, added with the weapons pass (U7), CPU, ~10 seconds:

| ruler | answers |
|---|---|
| `node tools/weaponshape.mjs` | whether each held weapon is the OBJECT the lore says it is, in every one of the six finishes. 385 checks read off the triangles the builders emit (plane slices, envelopes, connected islands, the materials' own values), never off a station table: a sword's guard is 124 mm across and its pommel one shell with three lobes, a seax has a broken back and brass wire and nothing that glows, a Dane axe's bit is bright steel on dark cheeks, a spear head is 117 mm across its wings and 86 mm across its leaf, no steel is a mirror (CH-24), and every grip is still the radius the baked fists close on. `--mutant=[weapon:]name` builds nine deliberately wrong weapons (the header of the file lists them) and requires the ruler to catch each; `--shield` gates the board, which is W-B's and is only read out until then |

This is the loop. Iterate here. It catches type errors, geometry punching
through skin, silhouette failures, and cosmetics that do not differ.

**MIDDLE — once per unit before it reports, ~10–15 minutes, one browser.**
`npm run build`, then **one batched capture session** producing every sheet the
unit needs, then `playtest`, `touchtest`, `summaryflow`.
One session, not one per sheet — the 8.4 s first frame is paid once.

**OUTER — once before a merge, never per agent.**
The full eighteen-harness gate with a fresh postgres. It is the merge gate, not
the working gate. Running it per agent is where hours go.

## Five rules that cost nothing and save hours

1. **One concern per unit, merged on its own.** The face landed because it was
   judged and merged alone in twenty minutes. The wave around it died twice and
   delivered nothing. A unit that merges cannot be lost to a restart.
2. **Never poll for a capture.** `until [ -f … ]; sleep 20` has burned tens of
   minutes of pure wall clock in this project, and one agent spent forty
   `echo standby` turns waiting for a tool that had already died. Run captures
   synchronously with a real timeout, or batch them and do other work.
3. **Never run two capture tools at once.** Every frame is CPU-rasterised, so a
   second tool starves the first and looks exactly like a hang. This means **one
   capture-owning agent per wave**, not four — parallelism past that point is
   negative.
4. **Push every ten minutes.** Seven restarts. Non-negotiable.
5. **Pipeline, do not barrier.** A judge that waits for four agents inherits the
   slowest one plus its own hour. Let each unit verify and land as it finishes.

## The one fix that pays for itself immediately

`playtest` and `touchtest` flake one run in three, and they are the two slowest
browser harnesses. Every flake costs a full re-run, so the expected cost of the
pair is about 1.5× their runtime, and a wave that runs them four times pays it
four times. Making them deterministic is **backlog item zero** and it buys back
more wall clock than any other single change.

## The colour gates — `teamread` and `factionread`

Two harnesses, one instrument, one rule. `docs/FACTIONS.md` §8: **team colour
beats clan colour beats faction colour beats bought cosmetic** — and each of
these files gates one rung of that ladder at the distance a player fights.

| harness | costs | answers |
|---|---|---|
| `node tools/teamread.mjs` | ~1 min, no browser | can a stranger tell friend from foe at 6.8 m, over every finish × cloak × class × bearing, both sides |
| `node tools/teamread.mjs --off` | ~1 min | the control. Both sides with no team, i.e. the pre-override game. **Must fail** |
| `node tools/factionread.mjs` | ~3.5 min for §0–§5, then ~55 min for §6/§7 (165 captures at ~19 s on a GPU-less box at load 5) | are the four peoples four men at 6.8 m; does any of them cost a point of anything; is the paid ladder still a ladder after a man swears — **on the kit mean AND on every surface one at a time**; does anything a livery makes blow a channel under the fire; and what COLOUR is each of his surfaces on a graded frame |
| `node tools/factionread.mjs --off` | same | the control. All four peoples as the unsworn. **Must fail** |
| either, `--sheet` | +seconds | the flat-albedo contact sheet in `art/look/`, which is the thing to actually LOOK at |
| `factionread --people= --cls= --finish= --turn=` | **~8 min** | THE PROBE DOOR. Narrows §6's sweep to the frames you are chasing; §0–§5 and the CONTROL still run whole, because the control is what sets the bar |

**THE PROBE DOOR IS THE ONE THAT CHANGES HOW THIS FILE'S ADVICE WORKS.**
§6's sweep is 120 lit captures and about 90 of the walk's 110 minutes, and
until 28 Aug 2026 it could not be asked for a single frame. That is why the
§6.1 clip singleton sat open across two full walks: not because the lever was
hard to find, but because **the ruler could not be asked twice in an
afternoon.** With the door, one frame answers in eight minutes — and the fix
that followed took three pulls, of which THE FIRST TWO WERE INERT (the norse
dye rows, then the shop's brightest fitting; both defensible, both moved the
reading by exactly nothing). At 110 minutes an iteration that is a whole
afternoon; at 8 it is a coffee. A narrowed run refuses to be a verdict — it
prints PROBE, NOT A SHEET and exits before §7.

**The rule this generalises to:** when a gate is slow AND the fix needs
iteration, the first work is not the fix. It is making the gate answer the
narrow question.

**They share a rasteriser and a verdict quantity on purpose.** A warrior's
signature is his area-weighted mean albedo over the pixels he covers at the play
lens, averaged in linear light, converted to CIELAB, and gated on the CHROMA
PLANE with lightness dropped — because a cloaked man and a bare-backed man on
one side are 30 points apart in LIGHTNESS and nobody has ever confused them.
Both bars are borrowed from `cosmetictest`: ΔC 10 is `LADDER_DE`, "what a PAID
rung has to clear to be a different colour at a glance", and ΔC 2.3 is its JND.

**`factionread` is two gates in one file and the second matters more.** §1 asks
whether four peoples are told apart; §3 asks whether any of them is told apart
by anything a fight reads, and it runs the real `engine.mjs` twice — one room
where every man declares a people in his appearance and one where none does —
and requires every published field of every man to come out identical over a
played match. A harness that only measured §1 would go green on a build that
gave the Picts more health, because more health is invisible in an albedo
buffer.

**§2 is where the two files meet.** Four peoples on ONE side must collapse to a
single colour at ΔC 0.00 — not to a tolerance — because the precedence
resolvers return on the team before a people is consulted. The reason the bar is
zero rides the same output line: garnet sits ΔC 7.3 from madder and the Pictish
woad ΔC 15.4 from the team's woad. They are the same two dyestuffs, so a leak
here is a man who cannot tell an enemy from a countryman.

**§5 and §6 were added after this file passed 15/15 with three defects live in
it**, and both are about a question that was being asked NEXT TO the one that
mattered.

§5 gates the PAID LADDER through the shipped resolvers —
`kitFor(finishKit(value), team, people)` — instead of through the stored hex.
`cosmetictest` §2 already gates this ladder, on this constant, and could not
have seen the defect: the seven stored numbers are the same seven numbers
whatever a man swore to, and it was the RESOLVER that flattened them. Rough Iron
at 0 gold and Blackened Steel at 110 returned the identical hex on every dyed
surface under a Saxon livery. `rungcensus` could not see it either, and for the
more instructive reason: it counts connected components and triangles, and
nothing was deleted. The colour was flattened. A census of parts cannot see a
flattened colour, and this project's signature failure is a measurement
answering the wrong question.

§5 gates `cosmetictest`'s own two rules on the resolved kit — NO TWINS (no two
rungs are one swatch) and NO REFUND (no paid finish reads as the free one) — and
**reports the stricter `LADDER_DE` reading with its number on every run rather
than gating it**. The file carries the whole argument and the five
configurations it was measured on: the shop's own tightest pair is ΔE 11.85
apart unsworn, so a livery has 1.85 points of room and would have to be nearly
an isometry, and every configuration that recovered the ladder to ΔE 8–9 let a
160-gold finish out-vote a people — §1.3 at **-173°**, the identity read
inverted. A bar is never moved to buy a pass; adopting one the game cannot meet
and then not printing the shortfall is the same offence facing the other way.

**AND BOTH OF THOSE RULES ARE ASKED TWICE — once on the kit mean and once per
surface — because the mean divides by six.** §5.1/§5.2 average ΔE over the six
dyed surfaces, so a byrnie that collapses all the way to ΔE 0.00 costs the mean
at most a sixth of what it was worth, against a bar the unsworn shop clears by
1.85 points. §5.0b is the proof and it is a control, not a claim: give the
shop's dearest finish the cheapest one's byrnie and the mean still reads ΔE
18.77 over a bar of 10 while the mail reads 0.00. §5.1b and §5.2b ask the same
two rules of one surface at a time, and the UNSWORN column is printed beside
every livery so the floor is visible rather than asserted — `main`'s own shop
has **no** pair of finishes within a JND on any single dyed surface and its
worst single-surface pair anywhere is ΔE 7.18.

§6 and §7 are **the lit sections**, and they exist because three
rounds of this feature shipped a defect past a harness with no light in it. It
boots the app, drives the real renderer at the play lens, and counts pixels at a
fully clipped channel inside the warrior's own coverage mask — the mask, not the
frame, because the bonfire is behind him and contributes about a tenth of a
percent of every capture including the unsworn ones. The bar is the UNSWORN man
in the 400 gold Gilded War Cloak and the 160 gold Bretwalda Gold finish: the
brightest dress a player can buy, so the bar cannot be moved without brightening
something people own. §6.0 proves the counter can count and §6.2 proves the
capture repeats, because a clip count is exactly the statistic a moving fire
moves. **§6.0c proves the mask is the man**: `/shot` publishes the appearance it
staged and the mask is built from that, checked slot for slot on every capture
in the run. It used to be built from `defaultAppearance` — for a huscarl a nasal
helm and a red cloak the card does not stage — and was 20.3% / 25.8% / 32.8%
larger than the man in the frame at the plan's three bearings.

**§7 asks what colour he is, and §7.1b asks it one surface at a time.** §7.1
counts the share of the man inside `roseband`'s pink band against the SAME MAN
IN THE SAME KIT sworn to nobody. Over the whole warrior mask that dilutes: a
byrnie is about half of him and the other five surfaces are not pink, so a
byrnie 19% inside the band moved the shipped whole-man figure by 0.391 points
and was called noise. §7.1b cuts the frame into the surfaces the vat dyes —
`tools/lib/surfacemask.mjs`, off the client's own scene graph at the capture's
lens, the sworn frame and its control read through the same array — and §7.1c
gates the LIFT in value where the surface lands on the red arc, which is where
`docs/FACTIONS.md` says lifting is the defect rather than the design.

**Both files record a ruler they had to correct, in the file, with the reading
that forced it.** `teamread` first gated on full ΔE and called two red-team men
opposite sides for being 30 apart in lightness. `factionread` first asked which
field a man's chroma was NEAREST and called a Saxon in Blackened Steel a Briton,
at -27.66, for being DARK — the chroma plane's RADIUS, not its angle, and moss
is the least chromatic of the four fields. Both corrections are strictly
tighter, both print the old quantity beside the new one, and neither is a bar
that moved.

## Two gates that carry their own proof — `classmatrix` and `gorestat`

Added 2026-08-13, because two existing rulers were caught not discriminating and
the repository now has **thirteen** recorded measurements that answered the wrong
question. Both of these run their own falsification on every invocation, which is
the only arrangement that has ever survived an adversary here.

| harness | costs | answers |
|---|---|---|
| `node tools/classmatrix.mjs` | ~4 min, one dev server, one browser | do the class cards DRAW four different numbers as four different bars — measured in pixels, at 390 px and 1440 px |
| `node tools/gorestat.mjs` | ~6 min, no browser | can the pulse gate rank two known-different sprays, and is the bystander cell a property or a coin |
| `node tools/gorestat.mjs --quick` | ~2 min | the same, at a third of the sample, for iterating |

### What "carries its own proof" means, concretely

**`classmatrix` mutates the thing it measures, twice, on every run.** The gate it
replaces read `page.tsx` for typed maxima; an adversary changed the drawn geometry
and the scan never moved. So this one:

* takes a real screenshot, decodes it, and measures each bar as a **run of
  pixels that change when the fill is hidden** from the left end of its track
  (the clip is shot twice, the second time with every fill `visibility:hidden`)
  — the rect is used only to find the bar, and claim 2 gates rect against pixels
  so that a clip or a transform between the two is a finding rather than a
  silence. It read "saturated pixels" until F1 remapped the emerald and sky bars
  onto silver, which are not saturated, and two of four bars read as zero;
* injects a stylesheet that pins every fill to 100% and **requires its own
  discrimination claim to go from 0 faults to 24**, while printing that the source
  scan's verdict is unchanged, because it cannot see pixels;
* rewrites the served module in flight to make one class faster and **requires
  the drawn bar to move** — R1, inside the harness, with a control class proving
  the injection landed.

**`gorestat` builds its ladder out of the real module.** `vfx.ts` is transpiled
and the EMITTED javascript is rewritten — pulse floor, throw speed, and a counter
beside the emitter — so six known pulse depths can be measured on the real
emitter, real ballistics, real budget, without a single `src/` file changing. The
new metric is then gated against the depth that is **known in closed form** at
each rung, not merely against the ordering.

### The rule both of them encode

> **A statistic that is gated must also be shown to be finer than the thing it
> is measuring.**

Both incidents were the same shape underneath. The pulse metric's spread from
wound to wound was ten points while the difference it was asked to report was one
and a half, so the ranking was decided by which wound came up. The bystander cell
averaged six draws against a bar sitting on the mode, and fired about one run in
nine on an unchanged tree. Neither was wrong about the physics; both were rulers
with a scale coarser than the effect.

So `gorestat` gates its own stability: every bar it holds is resampled from the
pool it was computed on, and **a bar the sample cannot hold is reported as a
failure of the harness, in those words**. If `--quick` is too small for a bar, the
run says so and names the flag to raise rather than passing quietly.

### What each one says today, 2026-08-13

`gorestat` is **green, 19/19**, and every one of its proof-of-failure claims
reproduces: the old pulse metric cannot resolve a ladder it should walk up, and
the old bystander cell fires on an unchanged tree in most draws at 2.0 m.

`classmatrix` is **RED, 12 of 17**, and deliberately so. Three claims fail at each
width plus one shared:

* `5b` and `5c` — the runekeeper's speed bar does not move when the runekeeper is
  made 12% faster, and a 5.6 and a 5.0 draw the identical full bar;
* `7` — the card's stat table disagrees with `engine.mjs` on `moveSpeed` for all
  four classes.

Both are live defects in `src/`, both are written up in `docs/OPEN-DEFECTS.md`
with the fix named, and neither belongs to the unit that built the ruler. **A red
gate with a written defect behind it is the correct state**; a green one would
have required either fixing somebody else's file or moving a bar.

### Where they sit in the three tiers

`gorestat` is CPU-only and belongs in the **MIDDLE** tier, next to `goretest`,
whenever anything under `vfx.ts` moves. `classmatrix` needs a browser and a dev
server; it belongs in the **MIDDLE** tier for any change to the class roster,
`StatBar`, or `WARRIOR_STATS`, and in the **OUTER** gate otherwise. Neither is an
inner-loop instrument.

## The authored man: `headflip` and `parity` — the two gates that pose him

Added 28 Sep 2026, after the owner reported "a torso ending in a neck stump" in
the armoury and men "with inverted heads, the beard on top" in the arena — what
every default-build player sees, because `next.config.ts` stamps
`NEXT_PUBLIC_AUTHORED=1` whenever `public/authored/*.glb` is committed.

| harness | costs | answers |
|---|---|---|
| `npm run headflip` | ~25 s, no browser | the Head-weighted crown, box and turn of the AUTHORED man against the PROCEDURAL man's, after 90 frames of the real `poseWarrior`, 4 classes x BOTH loadouts each (the engine's `ARMS`: the two-handed `dane_axe` the default berserker holds is one of them) x idle/walking/attacking/knocked/dead. Bars 3 cm / 3 cm / 3 deg. Also the HELM, HAIR and BEARD props, mounted by the real `dressAuthoredHead` against the shipped prop GLBs (the owner's "strands floating over the collar"): top and centre against the procedural head group's, 6 cm (the two men wear different hair; the defect moves them 13-34 cm) |
| `npm run parity` | ~30 s, no browser | all twelve pivots (1 cm, 3 deg), the cloak's seven bones (same bars), which hand the weapon is in (right AND left-handed), the weapon / off-hand blade / board probe points (1.5 cm), and the clip-driven arena man. `--wide` sweeps all twelve states |
| either, `--naive` | same | the control: today's drive, absolute `rotation.set()` onto the GLB bones. **Must fail** |
| either, `--no-mirror` | same | the control: the double mirror put back. **Must fail** |
| either, `--lever=90` | same | R1: turns the captured rest of the head (and, in `parity`, the weapon wrist and the board's elbow) by 90 degrees. **Must move the numbers** |

They share `tools/lib/authoredrig.mjs`, which builds the same man twice — once as
`createWarriorRig` makes him, once after the real `upgradeRigToAuthored` on the
shipped warrior GLB — and poses both with one id (two ids are two men breathing
out of step: `createMotion` seeds the idle sway from it).

**The picture step (R5) has its own two ways of lying, both now closed in the tools.**
A capture taken before the async swap lands is a picture of the PROCEDURAL man, who has a
head: `armourycard --classes/--lenses` waits on `window.__authored` and prints whether the
swap LANDED, and `shoot.mjs` now waits on `window.__authoredHeads` (one row per man the
arena has swapped and dressed), prints `authored men drawn N (cls:props)` on every preset,
records it in `report.json`, and treats zero for a no-war-paint single-man card as an error.
And a capture that lands but is framed on the wrong thing: `armourycard`'s first desktop run
logged 0 errors and LANDED eight times while every frame was of the helmet cards with the
mannequin scrolled off the top; it scrolls back before it shoots. Neither was visible in a
log. Both were visible in one PNG.

**Why nothing else could see this.** The head census (`GameCanvas.tsx`,
`armouryStage.ts`) counts meshes whose BIND bounding box reaches y >= 1.6 and are
`visible`; a skull drawn 0.34 m inside the chest passes it. `head.det` looks for
a collapsed matrix; this one was fine, merely 180 degrees wrong. `authoredtest`,
`gltftest`, `cliptest`, `severauthored` and `weightprobe` read the files or run
one function on them and never pose a man. Every ruler that builds
`buildCharacter` directly (`headmeasure`, `wearmeasure`, `hairmail`, `teamread`,
`factionread`'s CPU sections, ...) is blind to the authored path entirely: **a
green from any of them says nothing about what the default player sees.**

**What they were the first time, on the tree that shipped:** `headflip` 0 of 36,
head turned exactly 180.0 deg in every run, crown -0.157 m (runekeeper) to
-0.336 m (warden); `parity` 16 of 146, worst joint 0.65-1.12 m, the arena man's
weapon in his LEFT hand (x +0.304 against -0.463) and a left-hander's man
right-handed. The 16 that passed were "the weapon origin sits on the fist", true
by construction.

## The mannequin's head: `headnet`, `stagehead`, and the browser's last line of defence

Added 29 Sep 2026, on top of the section above. `headflip` and `parity` say the SHIPPED pose
puts the authored head where it belongs. They cannot follow a build to a browser, and the
next export, bone rename or refactor will lose the head in a way no gate anticipated. So the
browser has a net of its own, and two tools that ask the picture.

| harness | costs | answers |
|---|---|---|
| `render/authoredHead.ts` (in the game) | ~2 ms a man, twice in his life | both call sites (`armouryStage.ts`, `GameCanvas.tsx`) arm it at the swap: a census of the head AT BIND, and again on the FIRST POSED FRAME before it is drawn. If the head is not where bind says the pose must leave it, the authored man is hidden, `console.error` prints the head object, `window.__authored` (`window.__authoredRefused` in the arena) records it, the class is refused for the session, and a PROCEDURAL man is built in his place. "Wrong body beats no head." |
| `npm run headnet` | ~40 s, no browser | the net itself, against the shipped man (4 classes x 12 states procedural, 8 loadouts, the CLIP-DRIVEN man the arena draws, and a LEFT-HANDED man) and the man the tree shipped before the fix. It must not refuse any healthy man, must refuse every defective one on the first posed frame, must trip on each of the five structural facts on its own, and must follow its bars (`--lever`: open them and the defective man passes; close them and the healthy one is refused) |
| `npm run stagehead` | ~4 min per viewport, browser, through the lock | 4 classes x 4 lenses (portrait, shoulders, full kit, fight range) x phone+desktop: make the stage draw a frame, read the crown window off the canvas, count skin-hue pixels (H 15-35, S .2-.6, V > .25); assert `__authored.head` (det, skull, visible, scale), that the head net PASSED him (a refused man is a fail: the frame then shows the procedural man and would pass the pixels), and the full-kit framing (crown ~8% from the top, boots ~90%) |
| `uishots`, `armourycard --classes/--lenses` | as before | the same crown-window read, under every mannequin they meet: the lobby's YOUR WARRIOR, the oath mirror, the training muster, the armoury. A screen that must have a mannequin and does not is a failure, not a skip |

**What the net measures, and why not the crown.** The brief for this unit said "crown more than 3 cm off the
procedural crown". The only procedural crown the browser has is `rig.headTop`, taken at rest with the armoury's helm
on him, against an authored man still in the export's baked helm until the props land; the two differ by a helm, and
a healthy idle man sits 1.4-2.8 cm under `headTop`, 2 mm inside the brief's bar. So the crown is in the census (a
harness reads it) and not in the verdict. What the verdict uses is state-independent, because the arena swaps men
mid-swing and mid-fall: **reach** (farthest head vertex from the chest bone: healthy 0.000-0.027 m over every state,
procedural and clip-driven; defect 0.096-0.34) and **turn** (head against chest, from bind: healthy 33.6 deg at
the worst sample, a dead man's head; defect 178-180), bars 0.06 m and 75 deg. `headflip` still gates the crown at 3 cm,
against the procedural man posed in the same frame, which is the comparison that is exact.

**A second thing the brief's list got wrong.** "det < 1e-3, or a scale component under 0.5" reads a MIRRORED man as
collapsed: `handedness` reflects the whole rig for a left-handed player, `getWorldScale` reads that as a negative x
scale, and the first cut of the net refused every left-handed man in the game. It was found by the `stagehead` run on
the tree before the fix, which read det -1 and scale [-1,1,1] off a mirrored man, and is held now by a left-handed case
in `headnet` (with the signed scale put back, 39 passed and 1 failed). Both are tested on magnitudes.

**Also from that run: the skull is found by what it is, not by `part_34`.** The old census looked for a mesh with that
name; on the berserker's export it does not exist (`skull NO` in the pre-fix run), so the census cried a missing skull
on a man who had one. The net takes the biggest body mesh that is entirely head-weighted and has at least 1,500 vertices
(the skull is 4,174; the next candidate, the brow and eyes, is 358).

STAGEHEAD_NUMBERS

**What `stagehead` cannot see**, so nobody mistakes it for more than it is: a head on the right way up but the wrong
way round, a face that is skin-coloured and wrong, and a skin-coloured thing in the scene that is not the man. The pixel
test alone can also be passed WITHOUT fixing the head: the net's own fallback is a headed procedural man, so with the
defect present the frame passes 1 and 2 and only the third ("the net passed him") is red. That is why all three are asked
and why `--allow-refused` exists: the run that proves the net fires is the one run that turns that check off.

## Gates that read the page as text go through `tools/lib/pagesrc.mjs`

Several gates assert something about the menu screens by reading source (a stat
bar carries no typed ceiling, the tour's targets exist, the round hold is derived
from the replay, the hex-literal ratchet). `src/app/page.tsx` stopped being one
file when the F0 scaffold carved its components into `src/app/ui/*`, and it will
keep changing shape as the units land, so **a gate must not open `page.tsx` by
name**: `pageSources()` (per file, for a report that names `file:line`) and
`pageSource()` (one string, for "is it anywhere") return the page and everything
carved out of it.

The failure this prevents is silent, which is why it is a rule and not a tidy-up.
The day the carve landed, `csscheck`'s ratchet read **7 raw hex literals against a
ceiling of 15**: eight had moved next door, so eight new ones would have been let
in, and every assertion of the form "this must not be there" (`classmatrix`'s
typed `max=`, `marktest`'s removed `title=`) would have kept passing while looking
at a file that no longer held the text. A gate that is green because the case is
absent is not a gate.

## The palette gates — `palettecheck`, `csscheck` 7-13, `numeralprobe`

Added 29 Sep 2026 with F1 of the UI overhaul. The palette is a **stylesheet**
concern, so all of it is arithmetic and none of it needs a frame, except the one
thing a frame cannot be replaced for (`numeralprobe`, below).

| ruler | costs | answers |
|---|---|---|
| `npm run palettecheck` | ~1 s, no browser | is the ink ramp 4.5:1 on niello-raised, the hall and the lit card top; does every Tailwind hue class the source uses still exist in the **compiled** sheet and resolve to a palette token; is every `hover:` rule behind `(hover:hover) and (pointer:fine)`; are the three `--hp-*` bases the same hexes as `hud3d.ts` |
| `npm run csscheck` (checks 7-13) | ~1 s | ratchets, each **measured on the tree it landed on** and only allowed to fall: arbitrary text sizes under the floor, Tailwind hue classes per hue, system monospace, literal font-family names outside `layout.tsx`/`globals.css`, text set in `--ink-ghost`, raw `rgba(238,226,204)`, `:hover` inside TSX strings |
| `npm run numeralprobe` | ~1 min, one browser | does `lining-nums` / `tabular-nums` reach Alegreya's figures in the font **as served**, after Google's subsetter and `next/font` |
| `touchtest` (new claims) | with the suite | a pinch zooms a menu and does not zoom the fight; no touchable element in the fight can let one through |

**They read the built sheet because the source cannot say.** The first draft of
the hover override was `@custom-variant hover (@media (...) { &:hover })`. It
reads like the documented shorthand and is not, and Tailwind does not object: it
defines a variant that matches nothing, and **every `hover:` utility in the app
disappeared**. `tsc`, `next build` and `csscheck` all passed. The compiled sheet
had zero `.hover\:` rules where the old one had twenty, and only `palettecheck`
looked. That is `DESIGN-SYSTEM.md` section 10's lesson ("verify tokens in the
compiled sheet, not the source") turned into a gate, and it found three more
things while it was being written, each of them in the gate itself: it read the
`prefers-contrast` overrides as the page's tokens; a class with a variant prefix
(`hover\:bg-amber-700`) was invisible to it; and the `.shell` container's
`touch-action: pan-y` meant that removing the viewport's zoom lock changed
nothing on any menu (found by writing `touchtest`'s zoom control, which pinches
the title screen and requires the page to grow).

**Each of them was shown failing first**, on the tree before F1 or by pulling a
lever: `palettecheck` 11 FAILED on the F0 tree (faint ink 2.78:1, 19 of 29
tokens absent, 85 compiled hue rules carrying Tailwind's raw oklch); the hover
check red on the broken draft; the text-legibility check red when one ramp step
was pointed at `--pewter`; the hp mirror red when one side of it was edited; each
`csscheck` ratchet red when one violation was added in a scratch copy.

**What they cannot see, said here because the verdict line will not.** A ratchet
on a COUNT cannot see a 9px becoming an 8px (both are "under the floor"); the
ceiling falls when a site is removed, not when one is made worse. `palettecheck`
grades text steps `50`-`500` on niello-raised and the hall and only REPORTS the
legacy card top for blood text (`text-red-500`, #d4634a, is 5.1:1 on niello and 3.6:1 on
the old brown); the ink ramp itself IS gated on all three. `forced-colors` has no
gate: `UISHOTS_FORCED=1 node tools/uishots.mjs` renders the sweep in it, and the
block is exactly as tested as that.

## The plate gate — `platecheck`, and the plate census in `uishots`

Added 29 Sep 2026 with F2 of the UI overhaul. UI-PLAN 1.1 makes laws about the
material the menus are made of (no radius, no backdrop-filter, no opacity for
disabled, no glow, a focus ring inside the cut, and "every control shows hover,
active, focus and disabled") and before F2 the stylesheet broke every one and
nothing said so.

| ruler | costs | answers |
|---|---|---|
| `node tools/platecheck.mjs --no-browser` | ~1 s | the COMPILED sheet, parsed and not grepped: does every plate class carry a clip-path polygon and radius 0; is there a radius, a `backdrop-filter`, an `opacity` on a disabled rule, a blurred `box-shadow` or a `text-shadow` on anything F2 owns; does each focusable plate draw its ring at `outline-offset: -4px`; do the thirteen type-on-metal token pairs clear their floor |
| `node tools/platecheck.mjs --compile` (under the lock) | ~1 min, one browser | the same, plus a specimen of every control rendered with the real fonts and driven through hover, active (mouse down), focus-visible (a real Tab first) and disabled: **do the pixels of each state differ from rest**; **is every piece of type legible on the plate behind it** (the specimen is shot a second time with every glyph transparent, and each piece of text is graded against the median plate colour behind it, top half and bottom half); is it still cut, square, unblurred and opaque **in that state**; is it 44px. Writes `art/ui/plates/{controls,plates,corners}.png` |
| `uishots`, the plate census | rides the sweep | the same computed-style questions asked of every plate on every real screen, because a call site can beat `@layer components` with a utility (`rounded-2xl`, `backdrop-blur`) and a specimen has no call sites. `UISHOTS_SCREENS=landing,lobby` narrows a sweep to two minutes |

**Why it reads the render and not only the CSS.** A state rule can be written
and beaten (a call-site `!important`, a `filter` on a clipped element, a colour
set in the wrong layer) and change nothing on glass; the diff of the pixels is
the only thing that sees that. And a contrast ratio computed from two tokens is
a claim about the tokens: the ratio that matters is between the glyph colour and
the pixels that are actually behind it, and a plate is a gradient with grain
laid over it.

**What it cannot see, said here because the verdict line will not.** A real
Windows forced-colors theme (the plate's four diagonals are background images
and forced-colors discards them, so the corners are cut with no line along the
cut). A field's value is graded but the browser's own drop-down list is not. A
state that needs a server (a toast, a busy button). And `opacity` is read up the
chain in the census, so a faded parent that is not a plate at all still fails a
plate under it.

## What this does not mean

It does not mean lowering the bar. `docs/VISUAL-BAR.md` still says 8+ on every
axis, and *better than before is not a pass*. The point is to spend the
expensive resource — a browser frame on a machine with no GPU — on the judgement
that needs eyes, and to spend arithmetic on everything that can be measured.
