# The development list

> **RE-SEQUENCED 12 Aug 2026 against `docs/WHAT-THIS-GAME-IS.md`.** Read that
> document first. It decides what this game is — *a persistent war for Britain,
> settled in three-minute melee rounds* — and everything below is ordered
> against it rather than against how loud each item is. `docs/PROCESS.md` says
> how the work is done. The waves lettered A–H further down predate this
> re-sequencing and are kept as the historical record; where they disagree with
> the numbered waves below, the numbered waves win.

---

## THE MASTER LIST — 12 Aug 2026

The owner delivered ~40 items during the usage outage. **Nine of them were
already raised** and are marked `[ALREADY RAISED]` with where; they stay on the
list because they are still open and still relevant. The rest are new.

Sequencing principle, from `WHAT-THIS-GAME-IS.md` §5: *the fight has to feel
heavy before a war fought with it means anything.* So broken-illusion defects
first, then feel, then balance and AI, then the war layer, then surface polish.

### WAVE 0 — in flight, merge first

| # | Item | State |
|---|---|---|
| 0.1 | Hair and beard were `wool`; there is now a `hair` substance with a real lay and sheen | DONE, `tools/hairmap.mjs` green 3/3 |
| 0.2 | Helm flank "bald spots": hairline drops 0.30 rad not 0.12 under open-faced rungs | DONE, `wearmeasure` 30/30 held |
| 0.3 | Beard shell under its own declared `cut.thick` on 8 of 16 style/class pairs | OPEN |
| 0.4 | Shadow Hood swallows the Long Mane and War-locks (`cosmetictest` 15/16) | OPEN |
| 0.5 | Wyrm-Crest's deep cheek guard, spread 28.8 vs Spectacle's 4.2 | OPEN |

### WAVE 1 — defects that break the illusion

These are the things that make a player think "this is unfinished" in the first
minute. They are cheap and they are all visible.

| # | Item | Note |
|---|---|---|
| 1.1 | **Hands/wrists on all four classes rotated ~180°** — look broken and twisted | NEW, and the loudest one on the list |
| 1.2 | **Axe needs 90° anticlockwise** | NEW, same fix area |
| 1.3 | **Corpses float mid-air** when a round is still running | NEW |
| 1.4 | **Long Mane + huscarl + helm** → two front strands only; other classes bald at the sides and nothing at the back | NEW, and it is 0.2/0.4's neighbourhood |
| 1.5 | **Results table snubs equal players by alphabetical order** — same kills, more rounds won, still placed 2nd for coins and rank | NEW, and it is a fairness bug, not a display bug |
| 1.6 | **Rounds won must be recorded in the end-of-game table** and must feed ranking and payout | NEW |
| 1.7 | **Eyes read as East Asian; chin too pointed; lips need work; moustache placement near the lips** | NEW — face proportion pass |
| 1.8 | **Huscarl shield colours should follow the armour finish** | NEW |
| 1.9 | **Emote option appears on the next-round screen** where no players are visible, and shows even when you lost | NEW — misplaced UI |
| 1.10 | Pupils overlap the upper eyelids | [ALREADY RAISED] 8 Aug |
| 1.11 | **"Flick screen to change foe" never leaves** — it retired on a switch that LANDS, and in an honour duel there is nobody to switch to, so it was permanent in the mode the owner plays | DONE 13 Aug — `src/game/tuition.mjs`, `tools/tuitiontest.mjs` 18/18, `docs/MOBILE-CONTROLS.md` round three |
| 1.12 | **The QUALITY pad is in the way on a phone** — the feature is wanted, the placement was argued from a dead-zone sweep rather than looked at, and it sat over the warrior at eye level | DONE 13 Aug — moved to the top-of-screen utility column; new `touchtest` assertion per handedness; frames in `art/ui/hud/` |

### WAVE 2 — weight, and being seen

`WHAT-THIS-GAME-IS.md` §5 items 2–4. This is what a Steam audience judges in
ninety seconds, and it is the foundation the war layer sits on.

| # | Item | Note |
|---|---|---|
| 2.1 | **Weight in animations and attacks** — readable wind-up, impact that moves both bodies, fluid and heavy | NEW; `docs/WEIGHT.md` exists but is unbuilt |
| 2.2 | **Shoving; being knocked over if caught off guard; a get-up** | NEW |
| 2.3 | **Parry upgrade: animation you feel, plus a real riposte window** to capitalise with extra damage | NEW — the mastery ceiling |
| 2.4 | **Satisfying combat sound** that complements the fighting | [ALREADY RAISED] `docs/SOUND.md`, still unbuilt |
| 2.5 | **Death camera holds** — you stumble, spray, and the camera finds the best angle on the severing before it leaves | DONE — `src/game/deathcam.mjs`, `tools/deathcamtest.mjs` |
| 2.6 | **Round-end beat** — the victor emotes, the last man's death is seen, before the screen changes | MOSTLY DONE, 13 Aug — see below |
| 2.7 | **More blood, over the top** — spray and splatter | [ALREADY RAISED] `docs/GORE-DESIGN.md` |
| 2.8 | **Solid map objects** — woodpile, fire structure, fence, boulders, buildings block; small dressing does not | **DONE and WIRED.** `solidground.mjs` + `grounds.mjs` declarations, called twice a tick by `engine.mjs`; `tools/solidtest.mjs` 12/12. See the note below |

### 2.8, as built — and the pass that nearly shipped a duel-only fix

The collision module landed unwired, with a header naming **one** integration
point: resolve immediately after `integrateMovement`. Wired exactly that way, the
feature is correct in a duel and broken in a crowd — because `gameTick` does not
stop at the movement step. It then runs a **soft body-separation pass** that
holds warriors 1.05 m apart by writing `position` directly, *after* the resolve
and with nothing behind it, so it pushes men straight back into the timber the
resolver has just cleared.

Measured on the real engine, the two builds differing by one `if`:

| | man-ticks ending inside a prop | deepest |
|---|---|---|
| eight-man scrum, resolve at the movement step only | **374 of 48,000** | 258 mm |
| eight-man scrum, resolved again after the separation | **0 of 48,000** | 0 mm |
| **plain duel, either build** | **0 of 12,000** | 0 mm |

The duel row is why this matters: every harness that walks one man at the
woodpile calls that build fixed. The owner's report is that he can walk through a
woodpile, and a fix that only holds when nobody is standing next to him does not
answer him. **`tools/solidtest.mjs` claim 12 now drives `engine.mjs` itself** —
real room, real bots, real tick order — and it was RED before it was green:
turning the second resolve off and changing nothing else takes it from
`PASS 12/12` to `FAIL 11/12, 374 of 48000 man-ticks inside, deepest 257.5 mm`.

**It was also drawn, because a table of man-ticks is not a picture of a man
standing in a woodpile.** Plan view of the same ten runs, the pile's real
footprint from `grounds.mjs`, one dot per man per tick, red when a body centre is
nearer the timber than its own 525 mm radius: with the second resolve off the
red sits in a continuous fringe all the way round the rim of the keep-out
boundary — men leaning on the rick and *in* it, which is exactly the shape of the
owner's complaint — and with it on the boundary is a clean silhouette with no red
on it at all. Neither picture is a 3D frame; both are the positions the snapshot
carries, which is what the renderer draws from.

The alternative was a *solid-aware push*. Rejected: it puts a second definition
of "what a solid is" in the file with the least reason to own one. The push stays
naive and its output goes back through the same resolver. **The rule, for the
next pass that adds anything which moves a body: a pass that moves a body is
followed by a resolve, or it is a hole.**

Two other things fixed while in there. `engine.mjs`'s `ARENA_RADIUS = 18` is
**deleted** — the ring is `ground.play.radius`, solved with the props in one pass
(the runestone's corner reaches 0.53 m past it, so two separate rules would push
a body back and forth forever), and a leftover clamp would have been a second
statement of where the wall is. And `solidtest`'s claim 5 was **theatre**: it
printed "1.18 m of travel in the first tick" when its own driver produces
**0.766 m** — the engine zeroes `moveVel` on a dodge, so no sprint adds to the
roll — and 0.766 m is below the body's own 1.050 m diameter, which means nothing
could tunnel at these numbers and the claim could not fail. An adversary set
`steps = 1`, deleting the substepping the claim exists to protect, and watched it
stay green. It now measures the real figure off the driver, states the crossing
threshold (1.170 m), and proves the sweep is load-bearing by driving a 2.0 m jump
at a 12 cm rail: the swept call stops it, resolving the endpoint alone tunnels
clean through. With `steps = 1` it goes red.

### WAVE 2b — three defects reported 13 Aug 2026, after Wave 2 merged

| # | Item | Note |
|---|---|---|
| 2b.1 | **"Flick screen to change foe" never goes away** — the hint is permanent and must fade | **DONE** — `tools/tuitiontest.mjs` 18/18. Root cause was not the timer: the counter incremented on the SWITCH that lands, not on the FLICK, so in an honour duel (one enemy, nothing to switch to) it was nailed at zero and the caption was permanent |
| 2b.2 | **The match starts before everyone has loaded** — "a lot of the time the game starts before fully loading in which is a poor experience, we shouldn't start until everyone is fully loaded in" | **BUILT.** THE MUSTER: a `loading` phase in front of the countdown (`LOAD_HOLD_MS`, engine.mjs). A client declares `awaitLoad` on join and sends `loaded` when its forge lands; the bell waits for all of them, or twelve seconds. **At the timeout the match STARTS** — one bad connection must not hold seven people — and the room is told who it is waiting for while it waits. Gated by `npm run readytest`, 26 checks, shown red first (12 of 26 red on the code before it), and photographed by `npm run mustershot` — which caught **two client defects no server assertion could see**: the panel flashed before this client's own forge had started, and the client shouted `loaded` the instant it entered the game screen, because `forge` is null there. The second one defeated the whole feature while every server check stayed green. Withholding the report buys nothing: §5 fights a silent client and compares his spawn grace to the honest man's, to the tick. See WIRE-PROTOCOL §2.1 |
| 2b.3 | **The death camera only fires for the last man to die** — "everyone should see death camera for final death winner & all losers" | **MOSTLY DONE** — two cameras off one shared geometry, `deathcamtest` 20/20 → 42/42. Your own death outranks the round's and the round's is never queued, enforced in the module rather than by call order. STILL OPEN: the death that ends a MATCH goes straight to the victor's portrait — `endRound` calls `endMatch` on the same tick, so there is no break to play the beat in |
| 2b.4 | **The quality control is in the way** — "i like that feature but its a bit in the way where it currently is on screen". The feature is wanted; the placement is not | **DONE** — moved from (16, 212) to the top of the movement side under the sound toggle, 624 px clear of the foot. `touchtest` gained an assertion named after the report and it was shown RED in both handednesses against the shipped position |

#### 2.6, in detail — what landed and the one piece that did not

The owner, 13 Aug 2026: *"death camera only shows when you die last, everyone
should see death camera for final death winner & all losers."*

He is right, and the gap is instructive rather than embarrassing: 2.5 shipped
that morning and its adversary verified that `deathcam.update()` can never take
a **living** player's lens — which is correct, for the defect 2.5 was built for.
Nobody asked whether the winner should see anything. A gate answering the
question it was given rather than the question that mattered.

**LANDED.** There are now two cameras in `src/game/deathcam.mjs` and they are
deliberately distinct:

* **Your own death** — unchanged. 3.10 s, no cut, opens on the frame the follow
  camera left because you were already looking at yourself.
* **The round's final death** — new. 2.20 s, and it **cuts**, because the viewer
  was fighting somebody else twenty metres away and a dolly across the arena
  arrives after the body has settled. Every living and dead man in the room
  watches the blow that ended the round.

The geometry is one function driving two clocks, the beat fits inside the break
the server already takes (2.20 s of beat in a measured 5.0 s break, so **nothing
waits on it**), it is skippable on the same press, and the precedence is stated
rather than left to call order: **your own death outranks the round's, and the
round's is never queued.** If your own hold was running when the round ended you
keep it — that was your beat — and the beat does not wait for you, because
3.10 s + 2.20 s does not fit in a five-second break. In an honour duel that
resolves to exactly what the owner asked for: the loser gets his own camera, the
winner gets the round's, and they are shots of the same body.

`tools/deathcamtest.mjs` is 42/42, extended rather than replaced, with the new
claims shown red first and the winner's own follow camera kept permanently as
the proof of failure. The frames are `npm run roundbeatshot`, which reaches the
case the way a scripted browser actually can — it loses a round early, so its
warrior is a man whose own hold is long over when the last bot falls — and
stamps every frame with the room state and the camera mode **before and after
the shutter**, because a screenshot off a software rasteriser is three seconds
older than its caption and the first cut of that tool printed
`room="intermission"` over a picture of the next round.

**And one number is now shared and gated.** `page.tsx` already held the
round-end screen for `ROUND_HOLD_MS = 2200` — for exactly that long after a
round ends, `RoundBreak` draws only a verdict line and the victor's flourish row
over the LIVE ARENA. The presentation half of 2.6 was built and pointed at
nothing: for 2.2 seconds the game showed you the arena, and the arena was showing
you the lobby orbit. The beat is the length of that window on purpose. The two
constants are **not wired together** — `page.tsx` belongs to another unit — so
`deathcamtest` reads that file and fails if they stop agreeing.

**STILL OPEN, and it rides the harness's verdict line rather than hiding here:
the death that ends the LAST round of a match.** `endRound` sets
`state = "finished"` and calls `endMatch` in the same tick — there is no break —
and `render/summary.ts` takes the lens for the victor's portrait, with
`page.tsx` laying the results panel over it. Holding that back for two seconds
is a change to the match-summary flow (`page.tsx`, `summaryflow`), not to the
camera, and it belongs to whoever owns those files. Until then the last round
ends on the portrait, which is *a* beat and not *the* beat.

### WAVE 3 — balance and the enemy

| # | Item | Note |
|---|---|---|
| 3.1 | **Four-class stat rework — two high stats each.** Runekeeper: skill is weak and sometimes does not move you, low damage, low health, hard to win with. Berserker: slow, high damage, very low defence, lowish health. Warden: balanced, possibly best after huscarl. Owner will take a recommendation after review | **DONE**, and the review is the matrix — `tools/classmatrix.mjs`. See the note below |
| 3.2 | **AI fighting quality and difficulty scaling** | **MEASURED, THEN MOVED — and the measurement came first.** `npm run bottest` is the ruler: the ladder as a win rate with a Wilson interval on every rung, plus what a difficulty is ALLOWED to touch (the brain; never the sheet) and whether a bot reads as a person. It found two live defects on the first run — the middle rung's guard rate was BELOW the bottom's (a phantom guard: `botThink` believed a block the server had refused mid-stroke, then stood there refusing to attack), and jarl-over-warrior was 55.8% [46.9-64.4], an interval straddling a coin toss. Fixed by believing the server, grading the recovery punish instead of switching it at a threshold, and giving each bot a temperament rolled once. Now 79.6% / 65.0% on the two upper rungs, guard monotone 0.4/2.3/5.1% *as §3 then measured it — see the repair to that measurement below*. **THE LAST UNPLACED RUNG IS NOW PLACED — 14 Aug 2026.** recruit→warrior was 54.6% [48.3-60.8], an interval straddling even. `BOT_REACTION_SKILL` — the only constant in the reaction window that carries a *difference* between two difficulties, and therefore the only one that can be a ladder — went 0.18 → 0.60, with `BOT_REACTION` set to 0.634 so that `0.634 - 0.7*0.60` is the **same IEEE double** as the old `0.34 - 0.7*0.18`. That anchors the `warrior` exactly, which is the difficulty `classmatrix` fights at, and the anchoring is **verified rather than asserted**: `classmatrix --bouts=60 --seed=4242` before and after the edit is **byte-identical output**, impossible if one `Math.random()` draw had landed differently. Result at 240 bouts a rung, seed 20260813: **jarl→recruit 89.6% [85.1-92.8], warrior→recruit 61.7% [55.4-67.6], jarl→warrior 68.3% [62.2-73.9]** — all three intervals clear even, ladder ordered, **11/11 PASS and no deferral** |
| 3.2b | **What the bot brain change did to the roster matrix** | `classmatrix --seed=4242`, 1000 bouts a cell, before and after. The verdict line is the SAME shape — 4 of 6 matchups decisively inside 30-70%, every class inside 40-60% of the field, 2 on the band edge — but the composition changed and the spread nearly doubled. Matchups: huscarl v warden **68.3% → 44.3%**, huscarl v berserker 65.5% → **70.7%**, huscarl v runekeeper 28.3% → 30.4%, warden v runekeeper 64.8% → 58.5%, warden v berserker 44.5% → 54.1%, runekeeper v berserker 52.8% → 47.7%. Against the field: huscarl 53.9 → 48.2, warden 46.6 → **55.7**, runekeeper 52.9 → 52.6, berserker 46.3 → **42.6**; SPREAD 7.5 pts [4.0-11.1] → **13.1 pts [9.6-16.7]**. **NOT ONE NUMBER ON THE SHEET MOVED.** The damage was real and it reproduces: re-measured 14 Aug on the committed sheet across three master seeds, spread **13.1 / 12.5 / 12.7**, with `huscarl v berserker` 70.7/70.3/69.0 and `huscarl v runekeeper` 30.4/31.3/31.3 — two matchups on the bar, one each side. **THE MECHANISM THIS ENTRY ASSERTED IS WRONG, AND IT IS RETRACTED HERE RATHER THAN QUIETLY EDITED.** It said bots "now punish recovery in proportion to skill" and that the long-stroke class pays for it. `classmatrix` fights at **`warrior`**, and a warrior's recovery punish went from **certain** (`aiSkill > 0.6`) to **0.32** — the opposite direction. Pulled, 400 bouts a cell, seed 4242, berserker against the field: shipping brain **44.0%**; graded punish reverted to the old boolean **37.9%** (he gets *worse*); temperament removed **42.3%**; phantom guard restored **43.2%**; all three reverted together **40.4%**. Not one of them raises him and all three together do not reach 46.3. **The cause is not among the three edits this entry names, and no replacement mechanism is asserted, because none was measured.** The useful half is the negative: do not tune against that story. Closed by 3.2c |
| 3.2c | **Re-level the roster under the bot brain that now ships** | **DONE, 14 Aug 2026 — and the debt 3.2b declared is paid.** Wave 3 balanced the roster against a `botThink` that Wave 4 replaced, so the balance was certified against an instrument that no longer exists. Re-measured first on the committed sheet (spread 13.1/12.5/12.7, two matchups on the bar), then re-levelled. **FOUR NUMBERS MOVED, ALL IN ONE COLUMN:** huscarl `maxHealth` 158→**162**, berserker 126→**134**, warden 114→**108**, runekeeper 96→**92**. Nothing else — no stroke, no damage, no reach, no arc, no guard, no stamina, no stride — so every ratio the weight pass and the class rework are documented on survives untouched, and the four-shape gate is unmoved by construction. Health was chosen because it is one of only **two** axes this ruler can read (see the inert-lever table above); re-levelling on `blockReduction` or `moveSpeed` would have been a balance claim with no measurement under it. **RESULT: six of six matchups DECISIVELY inside 30-70% with no EDGE cell and no deferral**, against four-of-six-plus-two-on-the-bar before. Median TTK still runs 8.7 s (runekeeper mirror) to 23.0 s (huscarl mirror), so the spread that is a feature is intact. **The one move to argue with is the runekeeper's four health**, which goes against the owner's own words about that class — it is called out in `engine.mjs` rather than buried, he keeps the best damage rate in the game untouched, and giving it back costs `huscarl v runekeeper` about three points, which the cell can now afford. **VERIFIED ON TEN MASTER SEEDS DECLARED BEFORE THE RUN** (20260813, 424242, 90210, 4242, 1, 7, 31337, 555555, 987654321, 20260814 — 160,000 duels), **and the WORST is quoted, not the best: every seed PASS, zero EDGE cells on all ten, lowest interval bound 35.7 against a 30 bar, highest 69.0 against a 70 bar, largest field spread 4.8 points, every class between 47.2% and 52.9% on every seed.** The hot cell is `huscarl v berserker` — 65.2-67.0 across the ten, worst upper bound 69.0, so inside on every seed but by one point on the worst draw. Costed next move if the band is ever tightened: berserker `maxHealth` 134 → 137, buying ~2 points at the top for ~2 at the bottom where `runekeeper v berserker` has 5 to give. Not taken: it trades a measured margin for a predicted one |
| 3.3 | **Weapon styles and looks as armoury purchases** | NEW |
| 3.4 | **Mercy or Finish** — a downed-but-not-dead state and a decision window, with the pressure stated socially (seven men are watching) rather than as a meter, a window that DRAINS rather than counting down, and letting it run out counting as choosing mercy | **DONE on the server**, gated by `tools/mercytest.mjs`. The UI is not built — see the note below |

### 3.1 and 3.4, as built

**The review the owner asked for, and it disagrees with the felt balance.**
`tools/classmatrix.mjs` fights every ordered pair of classes headlessly, both
sides driven by the engine's own `botThink` at the same skill so the only
difference is the stat sheet, and reports win rates with a 95% Wilson interval
and a median time-to-kill. Over 4,800 duels the **old** roster came back:

| class | against the field | |
|---|---|---|
| warden | **78.4%** [75.6-81.0] | beats everybody |
| runekeeper | 43.7% [40.5-46.9] | |
| huscarl | 42.7% [39.5-45.9] | |
| berserker | **28.9%** [26.0-31.9] | cannot win |

Nine of twelve ordered matchups sat outside 30-70%. The owner reads the huscarl
as the best man in the game; he was **third**, and the warden — who "feels
balanced" — was winning four fights in five. Felt balance and the table
disagreed, which is the entire reason it was measured before it was tuned.

**The recommendation, taken: four shapes, two high stats each, in a ring.**
huscarl HEALTH+DEFENCE, warden DEFENCE+SPEED, runekeeper SPEED+DAMAGE,
berserker DAMAGE+HEALTH — so each stat is somebody's strength twice, each class
shares one strength with each neighbour and none with its opposite, and the two
damage classes do different KINDS of damage (a rate against a blow). The
berserker's second high stat is health, which is the direct answer to the
owner's own description of a class that was slow, low-defence AND low-health —
that is one strength, and one strength is why he could not win.

**Those shapes still stand and nothing in this section's later re-levelling
touched them.** What DID have to be retracted is the measurement that used to
close this paragraph — "huscarl 53.8%, runekeeper 51.6%, berserker 46.8%, warden
45.2%, spread 8.6 points" — because it was read off a `botThink` that Wave 4
then rewrote. A win rate is a statement about *a sheet fought by a brain*, and
when the brain is replaced the number is not stale, it is **void**. The live
figures are in 3.2c.

### The band claim this document used to make was a coin toss

**It said "every ordered matchup inside 30-70%" and "verified on four
independent seeds". Both sentences were retracted on 13 Aug 2026 and this is
what replaced them.**

An adversary ran ten master seeds at the shipped 250 bouts: **eight pass, two
fail.** Reproduced here, and the reproduction is quoted as it printed rather than
as it was reported: at 250 bouts the ordered cell `warden > huscarl` reads
**24% [19-30] on seed 424242 and 24% [19-30] on seed 90210** — the same 24 the
adversary got, on the bar, from a run that had no idea which side of it the
matchup was on. Four passing seeds were not four confirmations; they were four
draws from a distribution that fails about one time in five, which is the same
shape as the seed-pinning fault this repository has already recorded once. The
9.6-point spread was the friendliest of those draws; the same roster read 13.1
and 13.9 on the adversary's seeds and 8.6 at 16,000 duels. **A difference of two
noisy numbers is a range, and it is now printed as one.**

Those same two seeds, re-run at 250 bouts against the **repaired** rule, are the
short proof that the repair is a repair and not a softer bar: both come back
`PASS` with **three matchups sitting on the band edge, named on the verdict
line** — `huscarl vs warden`, `huscarl vs runekeeper`, `huscarl vs berserker`.
A 250-bout run is now allowed to say *"I cannot place three of these six"*, which
is the truth about a 250-bout run, instead of silently calling them passes.

Then 26,000 duels were spent on what the roster actually is, and the ring is real
and **sits on the bar**. Both orderings pooled, 2,000 duels a matchup:

| matchup | seed 20260813 | seed 424242 | seed 90210 | verdict |
|---|---|---|---|---|
| huscarl v warden | **69.1%** [67.0-71.1] | **69.8%** [67.8-71.8] | **68.4%** [66.3-70.4] | **EDGE** — straddles 70 |
| huscarl v runekeeper | **29.7%** [27.7-31.7] | **31.6%** [29.6-33.7] | **28.3%** [26.4-30.4] | **EDGE** — straddles 30 |
| huscarl v berserker | 66.1% [64.0-68.2] | — | 65.8% [63.7-67.8] | inside |
| warden v runekeeper | 63.7% [61.6-65.8] | — | 63.7% [61.6-65.8] | inside |
| warden v berserker | 42.4% [40.3-44.6] | — | 43.1% [41.0-45.3] | inside |
| runekeeper v berserker | 48.2% [46.0-50.4] | — | 51.6% [49.4-53.8] | inside |

**Those three columns are the point.** 424242 and 90210 are the two seeds the
adversary used to break the old claim. All three returned the *identical*
verdict — PASS, four matchups decisively inside, the same two on the edge —
because the answer was being read off the roster instead of off the draw.

> **That table is the OLD BRAIN and the OLD SHEET, and it is kept only because
> the rebuild of `classmatrix` below is the thing it justifies.** Both of those
> EDGE cells are gone as of 14 Aug 2026 — see 3.2c, where the same three seeds
> read `huscarl v warden` 50.6-51.9 and `huscarl v runekeeper` 38.0-39.3, six of
> six decisively inside, no deferral.

So `classmatrix` was rebuilt to say that rather than to survive it:

- It **rules three ways** — INSIDE (the whole interval is in the band), EDGE (it
  straddles a bar, so the run cannot say), OUTSIDE (FAIL) — and an EDGE matchup
  rides the verdict line as a **deferral**, never as a pass. The old rule failed
  a cell only when its whole interval was *outside*, which is a test of "the run
  does not prove this is broken", not of "this is inside the band".
- It **pools both orderings**, because `A>B` and `B>A` are one matchup measured
  twice, and each cell already balances the room's insertion order internally.
  Judging each half separately threw away half the sample and then judged each
  half against a hard bar. The two halves are still printed and compared as a
  control on the harness's own order bias.
- The default is **1,000 bouts an ordered matchup, ~4.5 minutes**, because at 250
  the interval is wider than the distance from this roster to the bar.
- `--only=huscarl,runekeeper` measures one pair and its mirrors, a quarter of the
  work, which is what makes "widen n until it is decisive" affordable.

**THE MIRROR CONTROL WAS FIRING ON NOISE, AND THE TEN-SEED RUN IS WHAT CAUGHT
IT — 14 Aug 2026.** The mirror diagonal is this harness's check on *itself*: a
class fought against itself is 50% by construction, so a deviation is either
noise or side bias. The rule was `|p̂ − 0.5| > 0.03`, tolerance alone. At the
default n=1000 the sampling standard error is 1.58 points, so **a perfectly fair
mirror trips that about 5.7% of the time, and four mirrors a run makes it roughly
one run in five.** Measured exactly that way: of the ten seeds behind 3.2c, **two
came back FAIL and neither failure was the roster** — seed 1 (warden mirror 53.5%
[50.4-56.6]) and seed 20260814 (berserker mirror 46.6% [43.5-49.7]) — while all
ten had **zero EDGE cells** and a spread under 5 points. Both "failures" are
2.2-sigma draws whose intervals comfortably *contain* the tolerance bound they
were supposedly outside. A property of a harness cannot be true on eight seeds
and false on two.

Repaired as an **equivalence test**: the same 3-point tolerance, but it fails only
when the *whole* 95% interval clears the band, which asks "do these data rule out
a bias of 3 points or less" instead of "where did this draw land". Both seeds
re-run and both now PASS, **10/10**. This is `docs/PROCESS.md` rule 2's one
permitted exception — a harness proven to measure the wrong quantity — so it is
recorded loudly rather than quietly edited.

**And the attempt to prove the repair still catches the real thing found
something worse.** `--no-swap` was added to put the insertion-order bias back —
the defect that once read a warden mirror of **61%** at n=300. On this engine it
no longer does: shipped sheet at 400 bouts it reads **53.5%**, and in a
deliberately short mirror (warden cut to 40 health, 1500 bouts) **52.7%
[50.2-55.2]**, against **49.4% [46.9-51.9]** for the same fixture with the swap
on. So (a) `swapSides` is measurably still earning its place, and (b) **a full
reintroduction of the defect now lands at or inside the 3-point tolerance the
check declares acceptable** — meaning the old rule was firing on noise *more
often than it could ever have fired on its own defect*. The repaired rule is
therefore a **declared deferral**: it asks the right question and has not been
seen red on this engine, because nothing here currently produces a bias big
enough to answer it. It is kept against a future regression, `--no-swap` is kept
so the bias can be re-measured in one command, and the tolerance must **not** be
cut to make the gate "work" — that would be tuning the bar to the noise.

**A DECLARED DEBT IN THIS HARNESS, found on 14 Aug and NOT fixed, so it is named
rather than left to be rediscovered.** The band gate pools both orderings of a
matchup — the whole argument above is that `A>B` and `B>A` are one matchup
measured twice — but **`AGAINST THE FIELD` does not**. It sums only the row
cells (`A>B`, `A>C`, `A>D`), so the field rate, and therefore **the SPREAD, which
is the single number this rework is quoted on**, is computed from half the
available sample: n=3,000 where n=6,000 exists. Fixing it would narrow the spread
interval by about √2 and can only make the 40–60% field gate *stricter*, never
looser, so it is a tightening and not a bar move. It was left alone this pass
only because changing it would have invalidated a ten-seed measurement already
in flight, and quoting a re-measured number would have cost another twenty
minutes of duels. **Whoever picks this up: fix it, then re-quote 3.2c's spreads,
and expect the point estimates to move by noise and the intervals to shrink.**

**Two levers that moved nothing, and they are the finding.** Taking the huscarl's
`blockReduction` from 0.80 to **0.00** — the best shield in the game to no shield
— moves `huscarl vs warden` from 69% to 69%. Doubling his stamina regen and
adding 43% to his pool moves `huscarl vs runekeeper` from 30% to 30%. The cause:
bots raise a guard when a windup becomes readable, which lands almost every such
blow inside the PARRY window instead, so **only about 6% of all damage in a full
matrix ever meets a raised guard** — 6.0, 5.9 and 5.8 on the three seeds above,
which is why it is written as "about 6" and not as the friendliest of the three.
DEFENCE — one of the four card axes — is very nearly unmeasured by this
instrument, and that now rides every verdict line, computed per run rather than
quoted from this page.

**The fix that was costed and NOT taken — and was not needed in the end.** Under
the old brain the two huscarl edge cells could only be separated by moving health
and damage together (`maxHealth 158 → 135, attackDamage 17 → 21`), which made the
wall a bruiser to satisfy a bar drawn by an instrument that cannot see his
shield. **That trade is off the table**: under the brain that now ships the two
cells moved apart on health alone (3.2c), the huscarl kept his damage and gained
four health rather than losing twenty-three, and `attackDamage` was never
touched. Recorded because a costed option that later stops being necessary
should say so, not sit on the page looking live.

**Two things that were found by pulling the lever and are worth keeping.**
Reach is nearly inert in this measurement — cutting the warden's spear by 65%
moved him two points *upward* — because `botThink` closes to its own reach, so a
short weapon only means standing nearer. The `SWING_ARC` comment claiming reach
is the balance lever is therefore backwards *for bots*, and reach was left
untouched rather than tuned to a number a bot fight preferred. And `types.ts`
carried a second copy of the sheet disagreeing on eight of twelve columns; the
two are now identical and `classmatrix` refuses to run if they drift again.

**HALF THE SHEET IS INVISIBLE TO THIS RULER, and the 14 Aug pass measured how
much of it.** Same 400-bout probes, seed 4242, quoted on the pooled matchup each
lever was aimed at:

| lever | pulled | matchup moves |
|---|---|---|
| berserker `moveSpeed` | 4.0 → 5.0 (+25%) | `hus v ber` 68.1% → 67.9% — **INERT** |
| runekeeper `moveSpeed` | 5.6 → 6.6 (+18%) | `hus v run` 30.6% → 32.8% — **INERT, and backwards** |
| berserker stamina | 95/14 → 140/24 | `hus v ber` 68.1% → 68.6% — **INERT** |
| huscarl `blockReduction` | 0.80 → 0.00 | unchanged — **INERT** (recorded earlier) |
| berserker `maxHealth` | 126 → 160 | `hus v ber` 68.1% → 45.5% |
| berserker `attackDamage` | 28 → 40 | `hus v ber` 68.1% → 37.6% |
| warden `attackSpeed` | 0.85 → 1.10 | `war v run` 55.4% → 12.1% |

So **SPEED joins DEFENCE and reach in the blind half**, for the same reason: a
bot closes to `myReach * 0.7` and stands there, so a faster man arrives at the
identical spot marginally sooner and fights the identical fight. This ruler can
read **HEALTH** and **DAMAGE** (including the stroke, which is damage-per-second
wearing a clock) and very little else — which is why the re-levelling in 3.2c
moved health and nothing but health, and why a fix that leaned on `blockReduction`
would have been a balance claim with no measurement under it.

**And the shape was illegible on the one screen that shows it.** The whole point
of the rework is "two high stats each", and the only place a player meets that
claim is the class-select card. That card drew its four bars against **maxima
typed in beside the roster** — `HP max={150}`, `SPD value={moveSpeed * 20}
max={100}` — and clamped the overflow with `Math.min(100, ...)`. After the
rework the huscarl's 158 health clamped at 150, and the runekeeper's 5.6 stride
and the warden's 5.0 **both** clamped at 100, so the two of them drew identical
full speed bars while the runekeeper is 12% faster and SPEED is his headline
stat. The ATK bar showed `attackDamage`, which puts the runekeeper **last** of
four while the sheet calls him a DAMAGE class. Every gate was green throughout,
because not one of them had looked at the screen.

A typed-in maximum is the mirrored-definition fault wearing the one disguise a
type-checker cannot see: not a duplicated value but a duplicated *fact* ("the
biggest health bar in the game is 150"), which went stale the moment the roster
moved. So there is no maximum written down anywhere now. `src/game/statshape.mjs`
holds one definition of the four axes and derives every ceiling with `Math.max`
over the roster being drawn; `page.tsx` renders `cardBars(...)` and `StatBar`
takes a fraction, so there is nothing left to clamp. `classmatrix` gates it three
ways: no numeric `max=` may appear on a stat bar, no two classes that differ on
an axis may draw the same bar, and **the two strengths the card shows must be the
two the shape gate certifies**. Shown failing against the old card first — six
findings — then green.

**And the frames were opened, at 1280×800 and 390×844, in both states, with the
bar widths read out of the browser's own layout beside them.** What the old card
draws, measured in the DOM rather than argued: `warden SPD 100%` and `runekeeper
SPD 100%` — two bars ending on the same pixel, which is the refutation, visible.
`huscarl HP 100%` on a 150 ceiling he carries 158 against. And a third thing
nobody had named: **the old `ATK` bar put the runekeeper LAST of four at 50%**,
because it drew `attackDamage` — a per-blow number — for a class whose damage is
a rate, so the card called the game's highest-DPS warrior its weakest attacker
while the shape gate certified him a DAMAGE class. The new card, same two
widths: `HP 100/72/61/80`, `SPD 70/89/100/71`, `DMG 69/78/100/87`,
`DEF 100/80/44/35` — four different profiles, the leader on each axis full and
nobody clamped, and the runekeeper's speed now visibly longer than the warden's.
One layout note found by looking rather than by measuring: the sticky **DRAW
STEEL** bar sits over the card row at 1280×800 unless the section is scrolled to
the top of the pane. Probed at both widths — with the section at the top of the
scroller, 16 of 16 bars are fully clear of it — so it is a scroll position, not a
covered screen, and it is recorded here so the next person to shoot this screen
scrolls before they judge it.

**Mercy or Finish is on the server and has no UI.** A killing blow puts a man
down instead of killing him; `mortal`, `mercyTimer` and `mercyTo` ride the wire;
`downed` carries a witness count taken from the room (0 in a duel, 6 in a full
moot — never a decorative seven); the window drains for 2.5 s; letting it run
out sends `spared` and he rises on a quarter bar. A man is spared **once per
round**, which is both the design statement and what guarantees a round of
merciful men still ends. The outcome is a **reputation** — `menSpared` /
`menFinished` on the results table — chosen over a remembering AI (evaporates at
the bell), a war-layer hook (Wave 4 does not exist yet) and a private profile
mark (seen by nobody, and §8's whole thesis is that the pressure is social).

**NOT built, and these are the next items:** the HUD for the window (it must be
a drain and never a digit — the protocol deliberately ships no countdown), a
kill-feed line for a sparing, profile persistence for the two counters, any
war-layer consequence, and any bot policy that *chooses* — bots finish because
they keep swinging, not because they decided to.

### WAVE 4 — THE WAR (the spine)

This is the project from `WHAT-THIS-GAME-IS.md` §3. It is what makes people come
back and it is where the owner's scattered items become one feature.

**THE SPINE LANDED 14 AUG 2026.** `src/game/war.mjs` (the rules),
`src/db/war.ts` (the persistence), `endMatch`'s war report (the one place the
fight touches the war), and `/factions` (the map). Gated by
`tools/wartest.mjs` — 79 checks, plus a `--prove` arm that injects the two
defects the neutrality gates exist to catch and requires them to go RED — and
by `tools/warflow.mjs`, 22 checks end to end against a real Postgres.
`WHAT-THIS-GAME-IS.md` §3.1 is the honest inventory of what is and is not in
it. The ribs below are re-marked against that.

| # | Item | Note |
|---|---|---|
| 4.1 | **Persistent territory: the map moves and is shared by everyone** | **DONE.** 16 territories, contest, flips, conservation. Not live-polling — the map is read on open, not streamed. |
| 4.2 | **Make picking a starting kingdom a big decision** | **DONE, as far as a screen can make it one.** The oath is durable, locks once a man has fought, and is taken on the map itself. It is not yet weighty in a MATCH, because 4.3 is not built. |
| 4.3 | **Faction scope and plan** — how characters, weapons and colours differ per kingdom | [PARTLY RAISED] `docs/FACTIONS.md`. **Now the biggest gap in Wave 4**: a man swears to a people and then looks exactly as he did before. The map promises an identity the arena does not deliver. **STILL OPEN 15 Aug 2026, and a build report wrongly claimed it shipped.** The war-identity work of that date is entirely MAP-side — your ground cut into the island, your rank, your last match, what moved while you were away — and `characters.ts` is not in its diff. That work answers the owner's *"you can't see any sort of indication of progress or identity"* about the MAP. 4.3 is the arena, and a man still fights looking exactly as he did before he swore. See also 5.7b: the arena does not deliver the PLACE either. |
| 4.4 | **Clans pick a base kingdom** and inherit its variant characters | NEW, and it is the right instinct. Unblocked by 4.1 — a clan is a second attribution key on a write that already exists. |
| 4.5 | **Team colours override cosmetics in team modes** — red and blue across armour finish and cloaks; clan colours later | NEW |
| 4.6 | **Ranked: win/loss, a top-50 leaderboard, historically accurate titles by rating** | [PARTLY RAISED] as ranked; titles and leaderboard are new |
| 4.7 | **Matchmaking; clans queueing as 2–4** (4 is the right clan size — it matches the warband) | [PARTLY RAISED] |
| 4.8 | **A campaign worth playing** that uses the kingdoms and good AI, not the same match repeatedly | [ALREADY RAISED] `docs/CAMPAIGN.md` |
| 4.9 | **Other game modes** | NEW — open question |
| 4.10 | **Historically accurate flags and colours** | [PARTLY RAISED] |

### WAVE 5 — surface and platform

| # | Item | Note |
|---|---|---|
| 5.1 | **Every screen upgraded** — the armoury UI/UX is liked; make all of it more satisfying, engaging, ergonomic, in-your-face | [PARTLY RAISED] |
| 5.2 | **Mobile visual quality is well below desktop** — close the gap as far as gameplay allows | NEW, and it is a real regression risk |
| 5.3 | **Ergonomics for both mobile and desktop, including a left-handed control flip** | [PARTLY RAISED] `docs/MOBILE-CONTROLS.md`; the flip is new |
| 5.4 | **Symbols across the game — historically accurate, polished, on-vibe** | NEW. The design system's 24-glyph set answers this — devices sourced to real finds (the seax, a York Mjölnir of this decade, the triskele, the Pictish crescent-and-V-rod) |
| 5.9 | **Adopt the Trewhiddle thesis across every screen** — dark-on-metal ornament, compartmented never full-length, light plates in menus and niello-side-out in combat | NEW, `docs/DESIGN-SYSTEM.md` §1–2 |
| 5.10 | **The thumb-zone law as a GATE** — 44 px floor on every control including desktop, 56 px for anything pressed mid-fight, a 132 px reach band that combat controls sit inside and confirmations deliberately do not. `tools/touchtest.mjs` currently gates layout and dead zones but has NO size floor at all | NEW, and the cheapest real win in Wave 5 |
| 5.11 | **Body face: Alegreya Sans → Alegreya** (the serif sibling). One word in `layout.tsx:60`; both faces already load from Google Fonts, so nothing is imported | NEW |
| 5.12 | **Wire `WarStandings` to the coastline we already own** — `factionMap/britain.ts`, 1,655 baked points. The review shipped an honest empty map well not knowing the geometry exists | NEW |
| 5.13 | **The "while you slept" dispatch strip on the title screen** — **PARTLY DONE 15 Aug 2026, and NOT struck.** The dispatch is built and gated (`factionMap/Dispatch.tsx`, `tools/warseen.mjs` 15/15) but it is on `/factions`, not on the title screen. The item says title screen and it means it: the whole point is that a man who has not opened the map still learns the map moved. A build report claimed this shipped; an adversary checked `src/app/page.tsx` against the diff and it is not in it — promote from decoration to requirement. It is the only visible surface of the game's whole retention thesis | NEW |
| 5.5 | **Unlockable profile symbols** earned by achievement or bought | NEW |
| 5.6 | **Taglines and grey helper text** updated to the current plan | NEW |
| 5.7 | **Creative, distinctive map locations** built to the standard | [PARTLY RAISED] `docs/MAPS.md`. **Superseded in scope by 5.7b, which is the same work with a reason attached.** |
| 5.7b | **A ground for the territory you were dealt** — the owner, 15 Aug 2026: *"wouldn't having a map for each territory also be cool?"* | NEW, and it is the arena half of 4.3. See below. |
| 5.8 | **Steam, then mobile, then console** — one account, two doors, from the first Steam build | NEW; supersedes `docs/DISTRIBUTION.md` ordering |

### WAVE 6 — engineering hygiene and tooling

| # | Item | Note |
|---|---|---|
| 6.1 | **Redundant code sweep**, when deemed necessary and verified | NEW |
| 6.2 | **Agent graph architecture** — build the agents properly with graphs and loops, documented, reusable across projects | NEW |
| 6.3 | **Orchestrator stays under 50% context** | NEW — now `docs/PROCESS.md` E2 |
| 6.4 | Rotate the exposed Neon password; delete the old Render Postgres | [ALREADY RAISED], still open, still a credential |

---

## Standing answers to two of the owner's open questions

**"Is 4 optimal for a clan/faction?"** Yes, for the queue. The warband mode is
4v4, so a clan of 4 is exactly one side — it can queue as a complete team
without ever needing a stranger. Let a *clan* have unlimited membership and cap
the *queueing party* at 4.

**"Are there other game modes we could add?"** The three that fit the war layer,
in order of cheapness: **Last Man Standing** (no respawn, one life, the current
FFA with the round rules changed — nearly free); **Hold the Moot** (a contested
centre ground, which teaches the map objects from 2.8); and **Shield Wall**
(5v5 line combat where breaking formation loses it — the most Anglo-Saxon mode
possible and the one nothing else on Steam has). Deferred until Wave 2 lands,
because all three are made or ruined by whether the fighting has weight.

---

## The historical record — waves A–H

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

### The draw-call cut, costed and NOT DONE — 19 Aug 2026

Recorded here rather than built, because the round that measured it delivered
tools and documents and **not one removed draw call**, and that is the honest
label for it. Everything in this box is a reading off `tools/framecost.mjs` at
the WebGL context in a seven-bot fight; nothing here is an estimate except the
line that says it is.

**The briefed "614 draw calls" is the `low` preset.** What the tiers actually
cost, and the spread is 7x on calls and 9x on triangles:

```
                draw calls p50   triangles p50   meshes   lights (casting)
    low              595            391.5k         400        11  (1)
    medium         3,079          2,155.7k         526        16  (3)
    high           4,204          3,399.2k         530        22  (4)
```

An adversary reproduced this on his own worktree and read 649 / 4,050 p50 with
4,204 at p95, and made a fair caveat that belongs with the numbers: at `high`
the distribution is over **two frames** on a SwiftShader box, so the `high` p50
is a sample and not a distribution. Read the tier ordering, not the third digit.

**Warriors are the cost, and the unit is MATERIALS.** Every warrior counted,
not the first one — an earlier reading kept one body and threw the rest away:

```
    low              32-40 meshes   13.0k-16.6k tris   18-24 materials
    medium / high    44-57 meshes   22.5k-32.9k tris   26-33 materials
```

Warriors are **72-79% of visible meshes**. The arena is already instanced (up to
301 repeats in one call), so there is nothing left to win there.

**The merge floor is the material count: 417 -> 229 at `high`, about 940 calls
of 4,204 — 22%.** That is the whole of what merging can buy, because two parts
cannot share a call unless they share a material, and it is the number to hold
any proposal against.

**What is already built, and what actually blocks it.** This is R12 stage 5 and
it is NOT "add skinning": `anim.ts`'s `articulate` already builds one 17-bone
`THREE.Skeleton` per warrior and rebinds limbs as `SkinnedMesh`. What blocks the
merge is that the eight kit parts are posed by **pivot transforms**, not bones,
so merging them into one buffer loses the pose. The cheaper lever is the 26-33
materials themselves, and the mechanism for that is also already in the tree:
`VERTEX_TINTED` and `Part.paint` exist in `characters.ts` and are used for the
FACE and not for the kit. Painting kit colour into vertices instead of into a
material is the same trick applied one level out.

**Refused, in writing: R12 stage 6.** The two easy levers are named so nobody
has to rediscover them and so nobody reaches for them quietly — render scale,
and the shadow-caster count (`530 for the picture + 477 casters x 4 shadow
lights = 2,438` of the high tier's calls). Both change what the game looks like,
which is the owner's decision and not a fixer's, and both are the quickest way
to move this number without making anything cheaper.

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

**13 Aug 2026 — `playtest`'s browser leg, and a sentence this file had to
retract within the hour.** An earlier draft of this section stated that the
browser leg *cannot start in a sandboxed worktree* and that **"`playtest`
currently certifies 20 checks here, not 37"**. That is **withdrawn**: re-run in
this worktree it goes to a verdict line, `[playtest] 37/37 controls working`, in
3 min 58 s, browser leg included. The retraction is left in rather than deleted
because the rule it broke is this document's own — *a doc that commits a false
number is worse than no doc* — and the way it got written is the ordinary way:
one environment produced one failure and the failure was recorded as a property
of the repository.

What is worth keeping is the environment facts, marked as what they are —
**observed, cause not established, and not reproduced on the run above**, which
served from a production `.next` (`BUILD_ID` present) rather than from dev. Next
16 has been seen to serve a **404 to the `127.0.0.1` literal** while serving the
app on `localhost` — already noted in `tools/uishots.mjs`, and `playtest`
navigates to the literal (`tools/playtest.mjs:656,671`) — and a `.next` left by
`npm run build` between dev runs has been seen to make the dev server 404 its own
routes until it is deleted. If the browser leg ever dies at 20 of 37 with no
verdict line, start there. **And do not quote a gate count you have not seen a
verdict line for**, in either direction.

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

## 5.7b — A ground for the territory you were dealt

The owner, 15 Aug 2026, having just reported that swearing to a kingdom has no
visible consequence: *"I assume we have map building on the list but wouldn't
having a map for each territory also be cool?"*

**It is on the list as 5.7, and the owner has made it a better item than the one
that was there.** 5.7 asked for "creative, distinctive map locations", which is a
content wish with no reason attached. This is the same work with the reason
supplied, and the reason is the strongest one in the backlog.

### The measurement that makes this urgent

```
src/game/grounds.mjs:622   export const GROUNDS = { saxon_village: SAXON_VILLAGE };
src/game/grounds.mjs:626   export const DEFAULT_GROUND_ID = "saxon_village";
```

**There is one ground.** The war deals a match over one of SIXTEEN named
territories — `dealTerritory` in `war.mjs`, drawn from the four most contested —
and then every one of those matches is fought in the same Saxon village.

That is the owner's other complaint one layer down. He said the map shows no
identity after you swear; this is the arena showing no identity after the map
names your ground. **4.3 is the kit half of that gap and 5.7b is the place half**,
and the place half is arguably larger: a man notices where he is standing before
he notices the colour of his neighbour's cloak.

### Why it is cheaper than sixteen levels

The architecture is already built for many grounds and has never had more than
one: `getGround(id)` resolves by id and falls back rather than throwing, with a
comment explaining that a client/server disagreement should drop everyone in the
village rather than crash. Nothing needs designing to make a second ground exist.

And every ground is CODE, not an asset — the project has zero binary assets by
rule — so sixteen hand-built levels is the wrong shape anyway. The right shape is
a small set of landscape archetypes, each carrying the character the territory
actually has, since the territories are real places with real ground:

| archetype | territories | what it is |
|---|---|---|
| fen and causeway | East Anglia, Lindsey | flat water, reed, a raised timber road that funnels a fight |
| downland | Wessex, Kent | chalk, sheep-cropped turf, a long open sightline |
| dyke and march | Mercia, Gwynedd, Dyfed | Offa's earthwork — a bank and ditch is a shield wall in landscape form |
| moor and dale | Deira, Bernicia, the Five Boroughs | heather, gritstone, a beck cutting the floor |
| sea-cliff | Kernow, Cait, Ystrad Clud | turf to a drop, standing crosses, wind |
| firth and broch | Fib, Circinn, Fortriu | drystone tower, birch scrub, a tidal edge |
| isles | Sudreyjar, Mann | machair, a beached keel, salt grass |

Six archetypes cover sixteen territories. Each territory then earns ONE authored
feature that is only its own — Offa's Dyke, a Pictish symbol stone, a fen
causeway, a beached ship — so no two grounds read the same even where the
landscape does.

### The gate this needs, because it is the obvious place to cheat

A ground that is the village with a different tint would pass any harness written
carelessly, so the ruler must measure **what the fight actually does**, not what
the mesh looks like. At minimum: every ground's walkable area, cover count and
sightline distribution must differ measurably from every other's, and no ground
may be strictly better to hold than another for any class — the war already
decides who wins ground, and a map that decides it instead would quietly undo it.
`tools/solidtest.mjs` and `tools/stepprobe.mjs` already exist and gate collision
and traversal; they must run per ground rather than once.

### Order

**After 4.3 (per-faction kit), not before.** Both close the same gap and kit is
cheaper, already scoped in `docs/FACTIONS.md`, and touches one file the helm work
is already in. Doing kit first also means the first new ground is walked by
warriors who look like they belong on it.
